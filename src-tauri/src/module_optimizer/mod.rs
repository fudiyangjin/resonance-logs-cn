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

enum PartValues<'a> {
    ByAttrId(&'a HashMap<i32, i32>),
    ByIndex(&'a [i32]),
}

impl PartValues<'_> {
    fn get(&self, index: usize, attr_id: i32) -> Option<i32> {
        match self {
            Self::ByAttrId(levels) => levels.get(&attr_id).copied(),
            Self::ByIndex(values) => values.get(index).copied(),
        }
    }
}

fn module_name(config_id: i32) -> Option<&'static str> {
    MODULE_NAMES
        .iter()
        .find(|(id, _)| *id == config_id)
        .map(|(_, name)| *name)
}

fn attr_name(attr_id: i32) -> &'static str {
    MODULE_ATTR_NAMES
        .iter()
        .find(|(id, _)| *id == attr_id)
        .map_or("未知属性", |(_, name)| *name)
}

pub fn parse_modules_from_vdata(v_data: &blueprotobuf::CharSerialize) -> Vec<ModuleInfo> {
    let Some(item_package) = &v_data.item_package else {
        log::warn!("v_data 中没有 item_package");
        return Vec::new();
    };
    let mod_infos = v_data.r#mod.as_ref().map(|data| &data.mod_infos);

    let modules: Vec<ModuleInfo> = item_package
        .packages
        .values()
        .flat_map(|package| &package.items)
        .filter_map(|(key, item)| parse_module(*key, item, mod_infos))
        .collect();

    log::info!("解析到 {} 个模组", modules.len());
    modules
}

fn parse_module(
    key: i64,
    item: &blueprotobuf::Item,
    mod_infos: Option<&HashMap<i64, blueprotobuf::ModInfo>>,
) -> Option<ModuleInfo> {
    let part_ids = &item.mod_new_attr.as_ref()?.mod_parts;
    if part_ids.is_empty() {
        return None;
    }
    let config_id = item.config_id.unwrap_or(0);
    let name = module_name(config_id)?;

    let values = match item.mod_part_level.as_ref().map(|level| &level.levels) {
        Some(levels) if !levels.is_empty() => PartValues::ByAttrId(levels),
        _ => PartValues::ByIndex(
            mod_infos
                .and_then(|infos| infos.get(&key))
                .map(|info| info.init_link_nums.as_slice())
                .unwrap_or_default(),
        ),
    };

    let parts: Vec<ModulePart> = part_ids
        .iter()
        .enumerate()
        .filter_map(|(index, &id)| {
            let value = values.get(index, id)?;
            Some(ModulePart {
                id,
                name: attr_name(id).to_string(),
                value,
            })
        })
        .collect();
    if parts.is_empty() {
        return None;
    }

    Some(ModuleInfo {
        name: name.to_string(),
        config_id,
        uuid: item.uuid.unwrap_or(0) as i32,
        quality: item.quality.unwrap_or(0),
        parts,
    })
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

#[derive(Clone, Copy)]
enum GpuEnumerationBackend {
    Unified,
    Cuda,
    Opencl,
}

fn collect_min_attr_requirements(options: &OptimizeOptions) -> (Vec<i32>, Vec<i32>) {
    let min_attr_ids: Vec<i32> = options.min_attr_requirements.keys().copied().collect();
    let min_attr_values: Vec<i32> = min_attr_ids
        .iter()
        .map(|key| options.min_attr_requirements.get(key).copied().unwrap_or(0))
        .collect();
    (min_attr_ids, min_attr_values)
}

fn prefilter_gpu_enumeration_modules(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    min_attr_ids: &[i32],
) -> Vec<ModuleInfo> {
    const GPU_ENUM_INPUT_LIMIT_FOUR: usize = 1000;
    const GPU_ENUM_INPUT_LIMIT_FIVE: usize = 450;

    let max_input_modules = match options.combination_size {
        5 => GPU_ENUM_INPUT_LIMIT_FIVE,
        _ => GPU_ENUM_INPUT_LIMIT_FOUR,
    };

    if modules.len() > max_input_modules {
        prefilter_modules_by_total_scores(
            modules,
            &options.target_attributes,
            min_attr_ids,
            max_input_modules,
        )
    } else {
        modules.to_vec()
    }
}

fn run_gpu_enumeration(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
    backend: GpuEnumerationBackend,
) -> Vec<ModuleSolution> {
    let (min_attr_ids, min_attr_values) = collect_min_attr_requirements(options);
    let modules_to_use = prefilter_gpu_enumeration_modules(modules, options, &min_attr_ids);
    let ffi_modules = to_ffi_modules(&modules_to_use);
    let progress_handle = progress_handle.unwrap_or(0);

    let result = match backend {
        GpuEnumerationBackend::Unified => bridge::ffi::strategy_enumeration_gpu_ffi(
            &ffi_modules,
            &options.target_attributes,
            &options.exclude_attributes,
            &min_attr_ids,
            &min_attr_values,
            options.max_solutions,
            options.max_workers,
            options.combination_size,
            progress_handle,
        ),
        GpuEnumerationBackend::Cuda => bridge::ffi::strategy_enumeration_cuda_ffi(
            &ffi_modules,
            &options.target_attributes,
            &options.exclude_attributes,
            &min_attr_ids,
            &min_attr_values,
            options.max_solutions,
            options.max_workers,
            options.combination_size,
            progress_handle,
        ),
        GpuEnumerationBackend::Opencl => bridge::ffi::strategy_enumeration_opencl_ffi(
            &ffi_modules,
            &options.target_attributes,
            &options.exclude_attributes,
            &min_attr_ids,
            &min_attr_values,
            options.max_solutions,
            options.max_workers,
            options.combination_size,
            progress_handle,
        ),
    };

    from_ffi_solutions(result)
}

pub fn strategy_enumeration_gpu(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    run_gpu_enumeration(
        modules,
        options,
        progress_handle,
        GpuEnumerationBackend::Unified,
    )
}

pub fn strategy_enumeration_cuda(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    run_gpu_enumeration(
        modules,
        options,
        progress_handle,
        GpuEnumerationBackend::Cuda,
    )
}

pub fn strategy_enumeration_opencl(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    run_gpu_enumeration(
        modules,
        options,
        progress_handle,
        GpuEnumerationBackend::Opencl,
    )
}

pub fn strategy_enumeration_cpu(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    let (min_attr_ids, min_attr_values) = collect_min_attr_requirements(options);

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

    strategy_beam_search_with_params(
        modules,
        options,
        DEFAULT_BEAM_WIDTH,
        DEFAULT_EXPAND_PER_STATE,
        options.max_workers.min(DEFAULT_BEAM_WORKERS),
        progress_handle,
    )
}

pub fn strategy_beam_search_with_params(
    modules: &[ModuleInfo],
    options: &OptimizeOptions,
    beam_width: i32,
    expand_per_state: i32,
    beam_workers: i32,
    progress_handle: Option<u64>,
) -> Vec<ModuleSolution> {
    let (min_attr_ids, min_attr_values) = collect_min_attr_requirements(options);
    let ffi_modules = to_ffi_modules(modules);

    let result = bridge::ffi::strategy_beam_search_ffi(
        &ffi_modules,
        &options.target_attributes,
        &options.exclude_attributes,
        &min_attr_ids,
        &min_attr_values,
        options.max_solutions,
        beam_width,
        expand_per_state,
        options.combination_size,
        beam_workers,
        progress_handle.unwrap_or(0),
    );

    from_ffi_solutions(result)
}

pub fn strategy_five_module_gpu_hybrid(
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
        .map_err(|_| "GPU 枚举线程执行失败".to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use blueprotobuf::{
        CharSerialize, Item, ItemPackage, Mod, ModInfo, ModNewAttr, ModPartLevel, Package,
    };
    use prost::Message;

    fn module_item(
        uuid: i64,
        config_id: i32,
        part_ids: &[i32],
        levels: Option<&[(i32, i32)]>,
    ) -> Item {
        Item {
            uuid: Some(uuid),
            config_id: Some(config_id),
            quality: Some(4),
            mod_new_attr: Some(ModNewAttr {
                mod_parts: part_ids.to_vec(),
                ..Default::default()
            }),
            mod_part_level: levels.map(|levels| ModPartLevel {
                levels: levels.iter().copied().collect(),
            }),
            ..Default::default()
        }
    }

    /// 物品以 uuid 为 key 放进同一个背包；`init_link_nums` 为空时不生成 `Mod`。
    fn char_with(items: Vec<Item>, init_link_nums: &[(i64, &[i32])]) -> CharSerialize {
        let items = items
            .into_iter()
            .map(|item| (item.uuid.unwrap_or(0), item))
            .collect();
        CharSerialize {
            item_package: Some(ItemPackage {
                packages: HashMap::from([(
                    5,
                    Package {
                        items,
                        ..Default::default()
                    },
                )]),
                ..Default::default()
            }),
            r#mod: (!init_link_nums.is_empty()).then(|| Mod {
                mod_infos: init_link_nums
                    .iter()
                    .map(|&(key, nums)| {
                        (
                            key,
                            ModInfo {
                                init_link_nums: nums.to_vec(),
                                ..Default::default()
                            },
                        )
                    })
                    .collect(),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    fn part_values(module: &ModuleInfo) -> Vec<(i32, i32)> {
        module
            .parts
            .iter()
            .map(|part| (part.id, part.value))
            .collect()
    }

    #[test]
    fn reads_levels_by_attribute_id_in_mod_parts_order() {
        let v_data = char_with(
            vec![module_item(
                18094,
                5500103,
                &[1114, 1410, 1408],
                Some(&[(1408, 3), (1410, 10), (1114, 6)]),
            )],
            &[],
        );

        let modules = parse_modules_from_vdata(&v_data);

        assert_eq!(modules.len(), 1);
        assert_eq!(modules[0].name, "卓越攻击");
        assert_eq!(modules[0].uuid, 18094);
        assert_eq!(modules[0].parts[0].name, "精英打击");
        assert_eq!(part_values(&modules[0]), [(1114, 6), (1410, 10), (1408, 3)]);
    }

    #[test]
    fn falls_back_to_init_link_nums_when_levels_are_absent_or_empty() {
        let v_data = char_with(
            vec![
                module_item(9, 5500102, &[1110, 1111], None),
                module_item(10, 5500102, &[1110, 1111], Some(&[])),
            ],
            &[(9, &[4, 7]), (10, &[4, 7])],
        );

        let modules = parse_modules_from_vdata(&v_data);

        assert_eq!(modules.len(), 2);
        for module in &modules {
            assert_eq!(part_values(module), [(1110, 4), (1111, 7)]);
        }
    }

    #[test]
    fn levels_take_precedence_over_init_link_nums() {
        let v_data = char_with(
            vec![module_item(9, 5500101, &[1110], Some(&[(1110, 8)]))],
            &[(9, &[1])],
        );

        let modules = parse_modules_from_vdata(&v_data);

        assert_eq!(part_values(&modules[0]), [(1110, 8)]);
    }

    #[test]
    fn skips_parts_without_value_and_modules_without_parts() {
        let plain_item = Item {
            uuid: Some(4),
            config_id: Some(1010),
            mod_part_level: Some(ModPartLevel::default()),
            ..Default::default()
        };
        let v_data = char_with(
            vec![
                module_item(1, 5500103, &[1114, 1410], Some(&[(1410, 5)])),
                module_item(2, 5500103, &[1114], Some(&[(1410, 5)])),
                module_item(3, 9_999_999, &[1114], Some(&[(1114, 5)])),
                plain_item,
            ],
            &[],
        );

        let modules = parse_modules_from_vdata(&v_data);

        assert_eq!(modules.len(), 1);
        assert_eq!(modules[0].uuid, 1);
        assert_eq!(part_values(&modules[0]), [(1410, 5)]);
    }

    #[test]
    fn item_field_21_survives_decode_and_reencode() {
        // Item { 21: ModPartLevel { 1: {1114: 6} } }
        const RAW: &[u8] = &[0xAA, 0x01, 0x07, 0x0A, 0x05, 0x08, 0xDA, 0x08, 0x10, 0x06];

        let item = Item::decode(RAW).expect("decode item with field 21");

        let level = item.mod_part_level.as_ref().expect("field 21 decoded");
        assert_eq!(level.levels, HashMap::from([(1114, 6)]));
        assert_eq!(item.encode_to_vec(), RAW);
    }
}
