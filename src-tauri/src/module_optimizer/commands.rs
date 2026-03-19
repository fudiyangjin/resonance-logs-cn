use super::{
    BEAM_INTERNAL_MAX_SOLUTIONS, GpuSupport, ModuleInfo, ModuleSolution, OptimizeOptions,
    ProgressHandleOwner, check_gpu_support as check_gpu_support_internal, get_progress_context,
    parse_modules_from_vdata, strategy_beam_search, strategy_enumeration_cpu,
    strategy_enumeration_gpu, strategy_five_module_cuda,
};
use crate::database::db_exec;
use crate::database::schema::detailed_playerdata::dsl as dpd;
use blueprotobuf_lib::blueprotobuf::CharSerialize;
use diesel::prelude::*;
use prost::Message;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{AppHandle, Emitter};
use tokio::time::{Duration, sleep};

const DEFAULT_MAX_SOLUTIONS: i32 = 10;
const NORMALIZED_PROGRESS_MAX: u64 = 10_000;

#[derive(Clone, Copy)]
struct ProgressSource {
    handle: u64,
    weight: u64,
}

#[tauri::command]
#[specta::specta]
pub fn check_gpu_support() -> GpuSupport {
    check_gpu_support_internal()
}

fn load_latest_char_serialize() -> Result<CharSerialize, String> {
    let vdata_bytes: Option<Vec<u8>> = db_exec(|conn| {
        dpd::detailed_playerdata
            .select(dpd::vdata_bytes)
            .order(dpd::last_seen_ms.desc())
            .first(conn)
            .map_err(|e| e.to_string())
    })?;

    log::info!(
        "加载最新玩家数据: vdata_bytes_len={:?}",
        vdata_bytes.as_ref().map(|b| b.len())
    );

    if let Some(bytes) = vdata_bytes {
        CharSerialize::decode(bytes.as_slice()).map_err(|e| e.to_string())
    } else {
        Err("No player data found".to_string())
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_latest_modules() -> Result<Vec<ModuleInfo>, String> {
    let vdata = load_latest_char_serialize()?;
    Ok(parse_modules_from_vdata(&vdata))
}

fn aggregate_progress(sources: &[ProgressSource]) -> (u64, u64) {
    let total_weight: u64 = sources.iter().map(|source| source.weight).sum();
    if total_weight == 0 {
        return (0, NORMALIZED_PROGRESS_MAX);
    }

    let weighted_progress = sources.iter().fold(0_u128, |acc, source| {
        let snapshot = get_progress_context(source.handle);
        let task_progress = if snapshot.total == 0 {
            0_u128
        } else {
            let processed = snapshot.processed.min(snapshot.total) as u128;
            processed * u128::from(NORMALIZED_PROGRESS_MAX) / u128::from(snapshot.total)
        };

        acc + task_progress * u128::from(source.weight)
    });

    let normalized =
        (weighted_progress / u128::from(total_weight)).min(u128::from(NORMALIZED_PROGRESS_MAX));
    (normalized as u64, NORMALIZED_PROGRESS_MAX)
}

fn spawn_progress_monitor(
    app: AppHandle,
    sources: Vec<ProgressSource>,
    stop: Arc<AtomicBool>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            let progress = aggregate_progress(&sources);
            let _ = app.emit("module-calc-progress", progress);

            if stop.load(Ordering::Relaxed) || progress.0 >= progress.1 {
                break;
            }

            sleep(Duration::from_millis(100)).await;
        }
    })
}

#[tauri::command]
#[specta::specta]
pub async fn optimize_latest_modules(
    app: AppHandle,
    target_attributes: Vec<i32>,
    exclude_attributes: Vec<i32>,
    min_attr_requirements: Option<HashMap<i32, i32>>,
    use_gpu: Option<bool>,
    combination_size: Option<i32>,
) -> Result<Vec<ModuleSolution>, String> {
    log::info!(
        "收到优化请求: target={:?}, exclude={:?}, min_req={:?}, gpu={:?}",
        target_attributes,
        exclude_attributes,
        min_attr_requirements,
        use_gpu
    );

    let combination_size = combination_size.unwrap_or(4);
    if !matches!(combination_size, 4 | 5) {
        return Err("combination_size 必须为 4 或 5".to_string());
    }

    let vdata = load_latest_char_serialize()?;
    let all_modules = parse_modules_from_vdata(&vdata);
    let original_count = all_modules.len();

    let modules = if !target_attributes.is_empty() {
        let target_set: std::collections::HashSet<i32> =
            target_attributes.iter().cloned().collect();
        all_modules
            .into_iter()
            .filter(|m| m.parts.iter().any(|p| target_set.contains(&p.id)))
            .collect()
    } else {
        all_modules
    };

    log::info!(
        "模组预筛: {} -> {} (target_attrs: {:?})",
        original_count,
        modules.len(),
        target_attributes
    );

    if modules.len() < combination_size as usize {
        return Err(format!("需要至少 {} 个模组", combination_size));
    }

    let max_workers = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(8);

    let options = OptimizeOptions {
        target_attributes,
        exclude_attributes,
        min_attr_requirements: min_attr_requirements.unwrap_or_default(),
        max_solutions: DEFAULT_MAX_SOLUTIONS,
        max_workers,
        use_gpu: use_gpu.unwrap_or(true),
        combination_size,
    };
    let final_max_solutions = options.max_solutions.max(1) as usize;

    let use_parallel_cuda =
        combination_size == 5 && options.use_gpu && check_gpu_support_internal().cuda_available;

    let progress_handles = ProgressHandleOwner::new(if use_parallel_cuda { 2 } else { 1 });
    let progress_sources = if use_parallel_cuda {
        vec![
            ProgressSource {
                handle: progress_handles.handles()[0],
                weight: 1,
            },
            ProgressSource {
                handle: progress_handles.handles()[1],
                weight: 1,
            },
        ]
    } else {
        vec![ProgressSource {
            handle: progress_handles.handles()[0],
            weight: 1,
        }]
    };
    let monitor_stop = Arc::new(AtomicBool::new(false));
    let monitor_handle =
        spawn_progress_monitor(app.clone(), progress_sources, Arc::clone(&monitor_stop));

    let result: Result<Vec<ModuleSolution>, String> = if use_parallel_cuda {
        let enumeration_progress_handle = progress_handles.handles()[0];
        let beam_progress_handle = progress_handles.handles()[1];
        tokio::task::spawn_blocking(move || {
            strategy_five_module_cuda(
                &modules,
                &options,
                enumeration_progress_handle,
                beam_progress_handle,
            )
        })
        .await
        .map_err(|e| e.to_string())?
    } else {
        let progress_handle = progress_handles.handles()[0];
        let result = tokio::task::spawn_blocking(move || match combination_size {
            4 => {
                if options.use_gpu {
                    strategy_enumeration_gpu(&modules, &options, Some(progress_handle))
                } else {
                    strategy_enumeration_cpu(&modules, &options, Some(progress_handle))
                }
            }
            5 => {
                let mut beam_options = options.clone();
                beam_options.max_solutions = BEAM_INTERNAL_MAX_SOLUTIONS;
                strategy_beam_search(&modules, &beam_options, Some(progress_handle))
            }
            _ => Vec::new(),
        })
        .await
        .map_err(|e| e.to_string())?;
        Ok(result)
    };
    monitor_stop.store(true, Ordering::Relaxed);
    let _ = monitor_handle.await;
    let result = result?;
    let _ = app.emit(
        "module-calc-progress",
        (NORMALIZED_PROGRESS_MAX, NORMALIZED_PROGRESS_MAX),
    );

    let mut result: Vec<ModuleSolution> = result.into_iter().take(final_max_solutions).collect();

    for solution in &mut result {
        solution.score = super::calculate_combat_power(&solution.modules);
    }

    let _ = app.emit("module-calc-complete", &result);

    Ok(result)
}
