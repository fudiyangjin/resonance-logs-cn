mod bridge;
pub mod commands;

pub use bridge::ffi::{
    AttrBreakdownEntry, GpuSupportInfo, ModuleInfoFfi, ModulePartFfi, ModuleSolutionFfi,
    ProgressInfoFfi,
};

use blueprotobuf_lib::blueprotobuf;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy)]
pub struct ProgressHandleSnapshot {
    pub processed: u64,
    pub total: u64,
}

#[derive(Debug)]
pub struct ProgressHandleOwner {
    handles: Vec<u64>,
}

impl ProgressHandleOwner {
    pub fn new(count: usize) -> Self {
        let mut handles = Vec::with_capacity(count);
        for _ in 0..count {
            handles.push(bridge::ffi::create_progress_context_ffi());
        }
        Self { handles }
    }

    pub fn handles(&self) -> &[u64] {
        &self.handles
    }
}

impl Drop for ProgressHandleOwner {
    fn drop(&mut self) {
        for handle in self.handles.drain(..) {
            bridge::ffi::destroy_progress_context_ffi(handle);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModulePart {
    pub id: i32,
    pub name: String,
    pub value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModuleInfo {
    pub name: String,
    pub config_id: i32,
    pub uuid: i32,
    pub quality: i32,
    pub parts: Vec<ModulePart>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModuleSolution {
    pub modules: Vec<ModuleInfo>,
    pub score: i32,
    pub attr_breakdown: HashMap<String, i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OptimizeOptions {
    pub target_attributes: Vec<i32>,
    pub exclude_attributes: Vec<i32>,
    #[serde(default)]
    pub min_attr_requirements: HashMap<i32, i32>,
    #[serde(default = "default_max_solutions")]
    pub max_solutions: i32,
    #[serde(default = "default_max_workers")]
    pub max_workers: i32,
    #[serde(default = "default_use_gpu")]
    pub use_gpu: bool,
    #[serde(default = "default_combination_size")]
    pub combination_size: i32,
}

fn default_max_solutions() -> i32 {
    60
}

fn default_max_workers() -> i32 {
    8
}

fn default_use_gpu() -> bool {
    true
}

fn default_combination_size() -> i32 {
    4
}

impl Default for OptimizeOptions {
    fn default() -> Self {
        Self {
            target_attributes: Vec::new(),
            exclude_attributes: Vec::new(),
            min_attr_requirements: HashMap::new(),
            max_solutions: default_max_solutions(),
            max_workers: default_max_workers(),
            use_gpu: default_use_gpu(),
            combination_size: default_combination_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GpuSupport {
    pub cuda_available: bool,
    pub opencl_available: bool,
}

pub const MODULE_NAMES: &[(i32, &str)] = &[
    (5500101, "基础攻击"),
    (5500102, "高性能攻击"),
    (5500103, "卓越攻击"),
    (5500104, "卓越攻击-优选"),
    (5500201, "基础治疗"),
    (5500202, "高性能治疗"),
    (5500203, "卓越辅助"),
    (5500204, "卓越辅助-优选"),
    (5500301, "基础防护"),
    (5500302, "高性能守护"),
    (5500303, "卓越守护"),
    (5500304, "卓越守护-优选"),
];

pub const MODULE_ATTR_NAMES: &[(i32, &str)] = &[
    (1110, "力量加持"),
    (1111, "敏捷加持"),
    (1112, "智力加持"),
    (1113, "特攻伤害"),
    (1114, "精英打击"),
    (1205, "特攻治疗加持"),
    (1206, "专精治疗加持"),
    (1407, "施法专注"),
    (1408, "攻速专注"),
    (1409, "暴击专注"),
    (1410, "幸运专注"),
    (1307, "抵御魔法"),
    (1308, "抵御物理"),
    (2104, "极-伤害叠加"),
    (2105, "极-灵活身法"),
    (2204, "极-生命凝聚"),
    (2205, "极-急救措施"),
    (2404, "极-生命波动"),
    (2405, "极-生命汲取"),
    (2406, "极-全队幸暴"),
    (2304, "极-绝境守护"),
];

pub fn parse_modules_from_vdata(v_data: &blueprotobuf::CharSerialize) -> Vec<ModuleInfo> {
    let mut modules = Vec::new();

    let attr_name_map: HashMap<i32, &str> = MODULE_ATTR_NAMES.iter().cloned().collect();
    let module_name_map: HashMap<i32, &str> = MODULE_NAMES.iter().cloned().collect();

    let mod_infos = if let Some(mod_data) = &v_data.r#mod {
        &mod_data.mod_infos
    } else {
        log::warn!("v_data 中没有 mod_infos");
        return modules;
    };

    if let Some(item_package) = &v_data.item_package {
        for package in item_package.packages.values() {
            for (key, item) in &package.items {
                let mod_new_attr = if let Some(attr) = &item.mod_new_attr {
                    attr
                } else {
                    continue;
                };

                if mod_new_attr.mod_parts.is_empty() {
                    continue;
                }

                let config_id = item.config_id.unwrap_or(0);
                if !module_name_map.contains_key(&config_id) {
                    log::info!("跳过未知模组 config_id: {}", config_id);
                    continue;
                }

                let module_name = module_name_map
                    .get(&config_id)
                    .unwrap_or(&"未知模组")
                    .to_string();
                let uuid = item.uuid.unwrap_or(0) as i32;
                let quality = item.quality.unwrap_or(0);

                let init_link_nums = if let Some(info) = mod_infos.get(key) {
                    &info.init_link_nums
                } else {
                    log::info!("未找到模组属性值 key: {}", key);
                    continue;
                };

                let mut parts = Vec::new();
                for (i, part_id) in mod_new_attr.mod_parts.iter().enumerate() {
                    if i >= init_link_nums.len() {
                        break;
                    }

                    let attr_id = *part_id;
                    let attr_name = attr_name_map
                        .get(&attr_id)
                        .unwrap_or(&"未知属性")
                        .to_string();
                    let attr_value = init_link_nums[i];

                    parts.push(ModulePart {
                        id: attr_id,
                        name: attr_name,
                        value: attr_value,
                    });
                }

                modules.push(ModuleInfo {
                    name: module_name,
                    config_id,
                    uuid,
                    quality,
                    parts,
                });
            }
        }
    }

    log::info!("解析到 {} 个模组", modules.len());
    modules
}

fn to_ffi_modules(modules: &[ModuleInfo]) -> Vec<ModuleInfoFfi> {
    modules
        .iter()
        .map(|m| ModuleInfoFfi {
            name: m.name.clone(),
            config_id: m.config_id,
            uuid: m.uuid,
            quality: m.quality,
            parts: m
                .parts
                .iter()
                .map(|p| ModulePartFfi {
                    id: p.id,
                    name: p.name.clone(),
                    value: p.value,
                })
                .collect(),
        })
        .collect()
}

fn from_ffi_solutions(solutions: Vec<ModuleSolutionFfi>) -> Vec<ModuleSolution> {
    solutions
        .into_iter()
        .map(|s| ModuleSolution {
            modules: s
                .modules
                .into_iter()
                .map(|m| ModuleInfo {
                    name: m.name,
                    config_id: m.config_id,
                    uuid: m.uuid,
                    quality: m.quality,
                    parts: m
                        .parts
                        .into_iter()
                        .map(|p| ModulePart {
                            id: p.id,
                            name: p.name,
                            value: p.value,
                        })
                        .collect(),
                })
                .collect(),
            score: s.score,
            attr_breakdown: s
                .attr_breakdown
                .into_iter()
                .map(|e| (e.name, e.value))
                .collect(),
        })
        .collect()
}

pub fn is_cuda_available() -> bool {
    bridge::ffi::test_cuda_ffi() == 1
}

pub fn is_opencl_available() -> bool {
    bridge::ffi::test_opencl_ffi() == 1
}

pub fn check_gpu_support() -> GpuSupport {
    let info = bridge::ffi::check_gpu_support_ffi();
    GpuSupport {
        cuda_available: info.cuda_available,
        opencl_available: info.opencl_available,
    }
}

pub fn get_progress() -> (u64, u64) {
    let info = bridge::ffi::get_progress_ffi();
    (info.processed, info.total)
}

pub fn reset_progress() {
    bridge::ffi::reset_progress_ffi();
}

pub fn get_progress_context(handle: u64) -> ProgressHandleSnapshot {
    let info = bridge::ffi::get_progress_context_ffi(handle);
    ProgressHandleSnapshot {
        processed: info.processed,
        total: info.total,
    }
}

fn prefilter_modules_by_total_scores(
    modules: &[ModuleInfo],
    target_attributes: &[i32],
    min_attr_requirement_ids: &[i32],
    max_count: usize,
) -> Vec<ModuleInfo> {
    let attr_ids_for_scoring: &[i32] = if !target_attributes.is_empty() {
        target_attributes
    } else if !min_attr_requirement_ids.is_empty() {
        min_attr_requirement_ids
    } else {
        &[]
    };

    let mut module_scores: Vec<(&ModuleInfo, i32)> = modules
        .iter()
        .map(|module| {
            let total_attr_sum: i32 = module
                .parts
                .iter()
                .filter(|part| {
                    attr_ids_for_scoring.is_empty() || attr_ids_for_scoring.contains(&part.id)
                })
                .map(|part| part.value)
                .sum();
            (module, total_attr_sum)
        })
        .collect();

    module_scores.sort_by(|a, b| b.1.cmp(&a.1)); // 降序排序
    module_scores
        .into_iter()
        .take(max_count)
        .map(|(m, _)| m.clone())
        .collect()
}

pub fn strategy_enumeration_gpu(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    const GPU_ENUM_INPUT_LIMIT_FOUR: usize = 1000;
    const GPU_ENUM_INPUT_LIMIT_FIVE: usize = 500;

    let min_attr_ids: Vec<i32> = options.min_attr_requirements.keys().copied().collect();
    let min_attr_values: Vec<i32> = min_attr_ids
        .iter()
        .map(|k| options.min_attr_requirements.get(k).copied().unwrap_or(0))
        .collect();

    let max_input_modules = match options.combination_size {
        5 => GPU_ENUM_INPUT_LIMIT_FIVE,
        _ => GPU_ENUM_INPUT_LIMIT_FOUR,
    };

    let modules_to_use: Vec<ModuleInfo> = if modules.len() > max_input_modules {
        prefilter_modules_by_total_scores(
            modules,
            &options.target_attributes,
            &min_attr_ids,
            max_input_modules,
        )
    } else {
        modules.to_vec()
    };
    let ffi_modules = to_ffi_modules(&modules_to_use);

    let result = bridge::ffi::strategy_enumeration_gpu_ffi(
        &ffi_modules,
        &options.target_attributes,
        &options.exclude_attributes,
        &min_attr_ids,
        &min_attr_values,
        options.max_solutions,
        options.max_workers,
        options.combination_size,
        progress_handle.unwrap_or(0),
    );

    from_ffi_solutions(result)
}

pub fn strategy_enumeration_cpu(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    let min_attr_ids: Vec<i32> = options.min_attr_requirements.keys().copied().collect();
    let min_attr_values: Vec<i32> = min_attr_ids
        .iter()
        .map(|k| options.min_attr_requirements.get(k).copied().unwrap_or(0))
        .collect();

    let modules_to_use: Vec<ModuleInfo> = if modules.len() > 800 {
        prefilter_modules_by_total_scores(modules, &options.target_attributes, &min_attr_ids, 800)
    } else {
        modules.to_vec()
    };
    let ffi_modules = to_ffi_modules(&modules_to_use);

    let result = bridge::ffi::strategy_enumeration_cpu_ffi(
        &ffi_modules,
        &options.target_attributes,
        &options.exclude_attributes,
        &min_attr_ids,
        &min_attr_values,
        options.max_solutions,
        options.max_workers,
        options.combination_size,
        progress_handle.unwrap_or(0),
    );

    from_ffi_solutions(result)
}

pub(super) const BEAM_INTERNAL_MAX_SOLUTIONS: i32 = 100;

pub fn strategy_beam_search(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    const DEFAULT_BEAM_WIDTH: i32 = 5096;
    const DEFAULT_EXPAND_PER_STATE: i32 = 0;
    const DEFAULT_BEAM_WORKERS: i32 = 3;

    let min_attr_ids: Vec<i32> = options.min_attr_requirements.keys().copied().collect();
    let min_attr_values: Vec<i32> = min_attr_ids
        .iter()
        .map(|k| options.min_attr_requirements.get(k).copied().unwrap_or(0))
        .collect();
    let ffi_modules = to_ffi_modules(modules);

    let result = bridge::ffi::strategy_beam_search_ffi(
        &ffi_modules,
        &options.target_attributes,
        &options.exclude_attributes,
        &min_attr_ids,
        &min_attr_values,
        options.max_solutions,
        DEFAULT_BEAM_WIDTH,
        DEFAULT_EXPAND_PER_STATE,
        options.combination_size,
        options.max_workers.min(DEFAULT_BEAM_WORKERS),
        progress_handle.unwrap_or(0),
    );

    from_ffi_solutions(result)
}

pub fn strategy_five_module_cuda(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    enumeration_progress_handle: u64,
    beam_progress_handle: u64,
) -> Result<Vec<ModuleSolution>, String> {
    let mut enumeration_options = options.clone();
    enumeration_options.combination_size = 5;

    let mut beam_options = options.clone();
    beam_options.combination_size = 5;
    beam_options.max_solutions = BEAM_INTERNAL_MAX_SOLUTIONS;

    let enumeration_modules = modules.to_vec();
    let beam_modules = modules.to_vec();
    let enumeration_handle = std::thread::spawn(move || {
        strategy_enumeration_gpu(
            &enumeration_modules,
            &enumeration_options,
            Some(enumeration_progress_handle),
        )
    });
    let beam_handle = std::thread::spawn(move || {
        strategy_beam_search(&beam_modules, &beam_options, Some(beam_progress_handle))
    });

    let enumeration_results = enumeration_handle
        .join()
        .map_err(|_| "CUDA 枚举线程执行失败".to_string())?;
    let beam_results = beam_handle
        .join()
        .map_err(|_| "Beam Search 线程执行失败".to_string())?;

    let mut seen = HashSet::new();
    let mut merged = Vec::with_capacity(enumeration_results.len() + beam_results.len());

    for solution in enumeration_results
        .into_iter()
        .chain(beam_results.into_iter())
    {
        let mut key: Vec<i32> = solution.modules.iter().map(|module| module.uuid).collect();
        key.sort_unstable();
        if seen.insert(key) {
            merged.push(solution);
        }
    }

    merged.sort_by(|left, right| right.score.cmp(&left.score));
    merged.truncate(options.max_solutions.max(1) as usize);
    Ok(merged)
}

pub fn calculate_combat_power(modules: &[ModuleInfo]) -> i32 {
    const ATTR_THRESHOLDS: [i32; 6] = [1, 4, 8, 12, 16, 20];
    const BASIC_ATTR_POWER_VALUES: [i32; 6] = [7, 14, 29, 44, 167, 254];
    const SPECIAL_ATTR_POWER_VALUES: [i32; 6] = [14, 29, 59, 89, 298, 448];
    const SPECIAL_ATTR_IDS: [i32; 8] = [2104, 2105, 2204, 2205, 2404, 2405, 2406, 2304];
    const TOTAL_ATTR_POWER_VALUES: [i32; 121] = [
        0, 5, 11, 17, 23, 29, 34, 40, 46, 52, 58, 64, 69, 75, 81, 87, 93, 99, 104, 110, 116, 122,
        128, 133, 139, 145, 151, 157, 163, 168, 174, 180, 186, 192, 198, 203, 209, 215, 221, 227,
        233, 238, 244, 250, 256, 262, 267, 273, 279, 285, 291, 297, 302, 308, 314, 320, 326, 332,
        337, 343, 349, 355, 361, 366, 372, 378, 384, 390, 396, 401, 407, 413, 419, 425, 431, 436,
        442, 448, 454, 460, 466, 471, 477, 483, 489, 495, 500, 506, 512, 518, 524, 530, 535, 541,
        547, 553, 559, 565, 570, 576, 582, 588, 594, 599, 605, 611, 617, 623, 629, 634, 640, 646,
        652, 658, 664, 669, 675, 681, 687, 693, 699,
    ];

    let mut attr_values: HashMap<i32, i32> = HashMap::new();
    for module in modules {
        for part in &module.parts {
            *attr_values.entry(part.id).or_insert(0) += part.value;
        }
    }

    let mut threshold_power = 0;
    let mut total_attr_value = 0;
    for (&attr_id, &attr_value) in &attr_values {
        total_attr_value += attr_value;

        let max_level = ATTR_THRESHOLDS
            .iter()
            .take_while(|&&t| attr_value >= t)
            .count();

        if max_level > 0 {
            let is_special = SPECIAL_ATTR_IDS.contains(&attr_id);
            let base_power = if is_special {
                SPECIAL_ATTR_POWER_VALUES[max_level - 1]
            } else {
                BASIC_ATTR_POWER_VALUES[max_level - 1]
            };
            threshold_power += base_power;
        }
    }

    let idx = (total_attr_value as usize).min(120);
    let total_attr_power = TOTAL_ATTR_POWER_VALUES[idx];

    threshold_power + total_attr_power
}
