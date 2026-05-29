use crate::live::opcodes_models::ObservedFactorItem;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const CACHE_FILE_NAME: &str = "selectedFactorItems.json";
const CACHE_VERSION: u32 = 2;
const SELECTED_FACTOR_RUNTIME_PREFIX: &str = "SyncContainerDirtyData.v_data.dirty_tree.";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SelectedFactorItemCache {
    version: u32,
    items: Vec<ObservedFactorItem>,
}

pub(crate) fn load_selected_factor_items(app_handle: &AppHandle) -> Vec<ObservedFactorItem> {
    for path in cache_path_candidates(app_handle) {
        if !path.exists() {
            continue;
        }

        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(error) => {
                warn!(
                    target: "app::live",
                    "failed to open selected factor cache {}: {}",
                    path.display(),
                    error
                );
                continue;
            }
        };

        let cache = match serde_json::from_reader::<_, SelectedFactorItemCache>(file) {
            Ok(cache) => cache,
            Err(error) => {
                warn!(
                    target: "app::live",
                    "failed to parse selected factor cache {}: {}",
                    path.display(),
                    error
                );
                continue;
            }
        };

        let items = normalize_selected_factor_items(cache.items);
        if items.is_empty() {
            continue;
        }

        info!(
            target: "app::live",
            "loaded {} packet-proven selected factor grade item(s) from {}",
            items.len(),
            path.display()
        );
        return items;
    }

    Vec::new()
}

pub(crate) fn save_selected_factor_items(
    app_handle: &AppHandle,
    items: &[ObservedFactorItem],
) -> Result<(), String> {
    let items = normalize_selected_factor_items(items.iter().cloned());
    let payload = SelectedFactorItemCache {
        version: CACHE_VERSION,
        items,
    };
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    let app_data_dirs = [
        app_handle.path().app_data_dir(),
        app_handle.path().app_local_data_dir(),
    ];
    let mut last_err = None;

    for dir in app_data_dirs.into_iter().flatten() {
        let target_dir = dir.join("stores");
        if let Err(error) = std::fs::create_dir_all(&target_dir) {
            last_err = Some(format!(
                "create_dir_all {}: {}",
                target_dir.display(),
                error
            ));
            continue;
        }

        let path = target_dir.join(CACHE_FILE_NAME);
        match write_atomic(&path, &bytes) {
            Ok(_) => {
                info!(
                    target: "app::live",
                    "saved selected factor cache to {} (items={})",
                    path.display(),
                    payload.items.len()
                );
                return Ok(());
            }
            Err(error) => {
                last_err = Some(format!("write {}: {}", path.display(), error));
            }
        }
    }

    Err(last_err.unwrap_or_else(|| "failed to resolve app data dir".to_string()))
}

fn cache_path_candidates(app_handle: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::with_capacity(4);
    if let Ok(dir) = app_handle.path().app_data_dir() {
        candidates.push(dir.join("stores").join(CACHE_FILE_NAME));
        candidates.push(dir.join(CACHE_FILE_NAME));
    }
    if let Ok(dir) = app_handle.path().app_local_data_dir() {
        candidates.push(dir.join("stores").join(CACHE_FILE_NAME));
        candidates.push(dir.join(CACHE_FILE_NAME));
    }
    candidates
}

fn normalize_selected_factor_items<I>(items: I) -> Vec<ObservedFactorItem>
where
    I: IntoIterator<Item = ObservedFactorItem>,
{
    let mut by_slot = BTreeMap::new();
    for item in items {
        if !selected_factor_item_is_cacheable(&item) {
            continue;
        }
        let key = selected_factor_item_cache_key(&item);
        by_slot.insert(key, item);
    }

    let mut out = by_slot.into_values().collect::<Vec<_>>();
    out.sort_by_key(|item| {
        (
            item.factor_buff_id,
            item.grade.unwrap_or(0),
            item.item_config_id,
        )
    });
    out
}

fn selected_factor_item_is_cacheable(item: &ObservedFactorItem) -> bool {
    item.factor_buff_id > 0
        && item.item_config_id > 0
        && item.grade.unwrap_or(0) > 0
        && selected_factor_item_slot_key(item).is_some()
        && item
            .runtime_source
            .starts_with(SELECTED_FACTOR_RUNTIME_PREFIX)
}

fn selected_factor_item_cache_key(item: &ObservedFactorItem) -> String {
    if let Some(slot_key) = selected_factor_item_slot_key(item) {
        return format!("slot:{slot_key}");
    }
    format!("factor:{}", item.factor_buff_id)
}

fn selected_factor_item_slot_key(item: &ObservedFactorItem) -> Option<String> {
    Some(format!(
        "{}|{}|{}",
        item.selector_signature.as_ref()?,
        item.selector_path.as_ref()?,
        item.selector_offset
            .map(|offset| offset.to_string())
            .unwrap_or_else(|| "?".to_string())
    ))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), std::io::Error> {
    let temp_path = path.with_extension(format!("json.tmp.{}", std::process::id()));

    {
        let mut file = std::fs::File::create(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }

    match std::fs::remove_file(path) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }

    std::fs::rename(temp_path, path)
}
