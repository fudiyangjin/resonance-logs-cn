use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use blueprotobuf_lib::blueprotobuf;
use diesel::prelude::*;
use diesel::sql_types::{BigInt, Binary, Nullable};
use prost::Message;
use serde::{Deserialize, Serialize};

#[derive(Debug, QueryableByName)]
struct LatestPlayerData {
    #[diesel(sql_type = BigInt)]
    player_id: i64,
    #[diesel(sql_type = BigInt)]
    last_seen_ms: i64,
    #[diesel(sql_type = Nullable<Binary>)]
    vdata_bytes: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct FactorData {
    #[serde(default, rename = "factorBuffIds")]
    factor_buff_ids: Vec<i32>,
    #[serde(default, rename = "factorsByBuffId")]
    factors_by_buff_id: HashMap<String, FactorEntry>,
}

#[derive(Debug, Deserialize)]
struct FactorEntry {
    #[serde(default, rename = "familyId")]
    family_id: Option<i32>,
    #[serde(default, rename = "buffId")]
    buff_id: Option<i32>,
    #[serde(default, rename = "familyName")]
    family_name: Option<String>,
    #[serde(default, rename = "gradeItemIds")]
    grade_item_ids: Vec<i32>,
    #[serde(default, rename = "modifierEvidence")]
    modifier_evidence: Option<ModifierEvidence>,
}

#[derive(Debug, Deserialize)]
struct ModifierEvidence {
    #[serde(default, rename = "gradeRows")]
    grade_rows: Vec<ModifierGradeRow>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ModifierGradeRow {
    grade: Option<i32>,
    #[serde(rename = "itemId")]
    item_id: Option<i32>,
    #[serde(rename = "itemQualityTier")]
    item_quality_tier: Option<i32>,
    #[serde(default, rename = "parameterValues")]
    parameter_values: Vec<i32>,
    #[serde(default, rename = "valueTexts")]
    value_texts: Vec<String>,
    #[serde(rename = "cleanResolvedDescription")]
    clean_resolved_description: Option<String>,
}

#[derive(Debug, Serialize)]
struct FactorItemMatch {
    package_key: i32,
    package_type: Option<i32>,
    item_key: i64,
    uuid: Option<i64>,
    config_id: i32,
    count: Option<i64>,
    quality: Option<i32>,
    family_id: Option<i32>,
    factor_buff_id: Option<i32>,
    family_name: Option<String>,
    grade_row: Option<ModifierGradeRow>,
    extend_attr: HashMap<i32, ItemExtendDataOut>,
    gene_sequence: HashMap<i32, i32>,
}

#[derive(Debug, Serialize)]
struct ItemExtendDataOut {
    id: Option<i32>,
    value: Option<i32>,
}

#[derive(Debug, Serialize)]
struct EquippedItemMatch {
    equip_slot: Option<i32>,
    item_uuid: Option<u64>,
    matched_config_id: i32,
    matched_family_id: Option<i32>,
    matched_family_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct SeasonMedalNodeOut {
    map_key: u32,
    node_id: Option<u32>,
    node_level: Option<u32>,
    choose: Option<bool>,
    slot: Option<i32>,
}

#[derive(Debug, Serialize)]
struct SeasonMedalHoleOut {
    map_key: Option<u32>,
    hole_id: Option<u32>,
    hole_level: Option<u32>,
    cur_exp: Option<u32>,
}

#[derive(Debug, Serialize)]
struct BuffDbMatch {
    map_key: u32,
    buff_uuid: Option<i64>,
    firer_id: Option<i64>,
    buff_config_id: Option<u32>,
    base_id: Option<u32>,
    level: Option<u32>,
    layer: Option<u32>,
    duration: Option<i32>,
    count: Option<i32>,
    create_time: Option<i64>,
    part_id: Option<i32>,
    create_scene_id: Option<i32>,
    custom_params_key: Vec<String>,
    custom_params: Vec<i32>,
}

#[derive(Debug, Serialize)]
struct Report {
    source: &'static str,
    database_path: String,
    factors_path: String,
    player_id: i64,
    last_seen_ms: i64,
    vdata_bytes_len: usize,
    factor_buff_id_count: usize,
    factor_grade_item_id_count: usize,
    factor_item_matches: Vec<FactorItemMatch>,
    equipped_factor_item_matches: Vec<EquippedItemMatch>,
    buff_db_factor_matches: Vec<BuffDbMatch>,
    season_medal: SeasonMedalOut,
    conclusion: ReportConclusion,
}

#[derive(Debug, Serialize)]
struct SeasonMedalOut {
    season_id: Option<u32>,
    core_hole_info: Option<SeasonMedalHoleOut>,
    normal_hole_infos: Vec<SeasonMedalHoleOut>,
    core_hole_node_infos: Vec<SeasonMedalNodeOut>,
}

#[derive(Debug, Serialize)]
struct ReportConclusion {
    factor_grade_selection_status: &'static str,
    notes: Vec<&'static str>,
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let db_path = arg_value(&args, "--db")
        .map(PathBuf::from)
        .unwrap_or_else(default_db_path);
    let factors_path = arg_value(&args, "--factors")
        .map(PathBuf::from)
        .unwrap_or_else(default_factors_path);

    let factors = read_factors(&factors_path)?;
    let (factor_grade_items, factor_by_item) = index_factor_items(&factors);
    let factor_buff_ids: HashSet<i32> = factors.factor_buff_ids.iter().copied().collect();

    let latest = load_latest_playerdata(&db_path)?;
    let vdata_bytes = latest
        .vdata_bytes
        .as_deref()
        .ok_or_else(|| "Latest detailed_playerdata row has no vdata_bytes".to_string())?;
    let v_data = blueprotobuf::CharSerialize::decode(vdata_bytes)
        .map_err(|err| format!("Failed to decode CharSerialize: {err}"))?;

    let factor_item_matches =
        collect_factor_item_matches(&v_data, &factor_grade_items, &factor_by_item);
    let equipped_factor_item_matches =
        collect_equipped_factor_item_matches(&v_data, &factor_item_matches);
    let buff_db_factor_matches = collect_buff_db_factor_matches(&v_data, &factor_buff_ids);
    let season_medal = collect_season_medal(&v_data);
    let conclusion = build_conclusion(
        &factor_item_matches,
        &equipped_factor_item_matches,
        &buff_db_factor_matches,
    );

    let report = Report {
        source: "probe_factor_vdata",
        database_path: db_path.display().to_string(),
        factors_path: factors_path.display().to_string(),
        player_id: latest.player_id,
        last_seen_ms: latest.last_seen_ms,
        vdata_bytes_len: vdata_bytes.len(),
        factor_buff_id_count: factor_buff_ids.len(),
        factor_grade_item_id_count: factor_grade_items.len(),
        factor_item_matches,
        equipped_factor_item_matches,
        buff_db_factor_matches,
        season_medal,
        conclusion,
    };

    println!(
        "{}",
        serde_json::to_string_pretty(&report)
            .map_err(|err| format!("Failed to serialize report: {err}"))?
    );
    Ok(())
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.windows(2)
        .find_map(|pair| (pair[0] == flag).then(|| pair[1].clone()))
}

fn default_db_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("resonance-logs-global")
        .join("resonance-logs-global.db")
}

fn default_factors_path() -> PathBuf {
    let candidates = [
        PathBuf::from("../parser-data/generated/SeasonPhantomFactors.json"),
        PathBuf::from("parser-data/generated/SeasonPhantomFactors.json"),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("../parser-data/generated/SeasonPhantomFactors.json"))
}

fn read_factors(path: &Path) -> Result<FactorData, String> {
    let contents = std::fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|err| format!("Failed to parse {}: {err}", path.display()))
}

fn index_factor_items(
    factors: &FactorData,
) -> (
    HashSet<i32>,
    HashMap<
        i32,
        (
            Option<i32>,
            Option<i32>,
            Option<String>,
            Option<ModifierGradeRow>,
        ),
    >,
) {
    let mut grade_item_ids = HashSet::new();
    let mut by_item = HashMap::new();

    for entry in factors.factors_by_buff_id.values() {
        for item_id in &entry.grade_item_ids {
            grade_item_ids.insert(*item_id);
            let grade_row = entry
                .modifier_evidence
                .as_ref()
                .and_then(|evidence| {
                    evidence
                        .grade_rows
                        .iter()
                        .find(|row| row.item_id == Some(*item_id))
                })
                .cloned_for_probe();
            by_item.insert(
                *item_id,
                (
                    entry.family_id,
                    entry.buff_id,
                    entry.family_name.clone(),
                    grade_row,
                ),
            );
        }
    }

    (grade_item_ids, by_item)
}

trait CloneForProbe {
    fn cloned_for_probe(&self) -> Option<ModifierGradeRow>;
}

impl CloneForProbe for Option<&ModifierGradeRow> {
    fn cloned_for_probe(&self) -> Option<ModifierGradeRow> {
        self.map(|row| ModifierGradeRow {
            grade: row.grade,
            item_id: row.item_id,
            item_quality_tier: row.item_quality_tier,
            parameter_values: row.parameter_values.clone(),
            value_texts: row.value_texts.clone(),
            clean_resolved_description: row.clean_resolved_description.clone(),
        })
    }
}

fn load_latest_playerdata(db_path: &Path) -> Result<LatestPlayerData, String> {
    let mut conn = SqliteConnection::establish(&db_path.to_string_lossy())
        .map_err(|err| format!("Failed to open {}: {err}", db_path.display()))?;
    diesel::sql_query(
        "SELECT player_id, last_seen_ms, vdata_bytes \
         FROM detailed_playerdata \
         ORDER BY last_seen_ms DESC \
         LIMIT 1",
    )
    .get_result::<LatestPlayerData>(&mut conn)
    .map_err(|err| format!("Failed to load latest detailed_playerdata row: {err}"))
}

fn collect_factor_item_matches(
    v_data: &blueprotobuf::CharSerialize,
    factor_grade_items: &HashSet<i32>,
    factor_by_item: &HashMap<
        i32,
        (
            Option<i32>,
            Option<i32>,
            Option<String>,
            Option<ModifierGradeRow>,
        ),
    >,
) -> Vec<FactorItemMatch> {
    let mut matches = Vec::new();
    let Some(item_package) = v_data.item_package.as_ref() else {
        return matches;
    };

    for (package_key, package) in &item_package.packages {
        for (item_key, item) in &package.items {
            let Some(config_id) = item.config_id else {
                continue;
            };
            if !factor_grade_items.contains(&config_id) {
                continue;
            }
            let (family_id, factor_buff_id, family_name, grade_row) = factor_by_item
                .get(&config_id)
                .cloned()
                .unwrap_or((None, None, None, None));
            matches.push(FactorItemMatch {
                package_key: *package_key,
                package_type: package.r#type,
                item_key: *item_key,
                uuid: item.uuid,
                config_id,
                count: item.count,
                quality: item.quality,
                family_id,
                factor_buff_id,
                family_name,
                grade_row,
                extend_attr: item
                    .extend_attr
                    .iter()
                    .map(|(key, value)| {
                        (
                            *key,
                            ItemExtendDataOut {
                                id: value.id,
                                value: value.value,
                            },
                        )
                    })
                    .collect(),
                gene_sequence: item.gene_sequence.clone(),
            });
        }
    }

    matches.sort_by_key(|row| (row.family_id.unwrap_or(0), row.config_id, row.item_key));
    matches
}

fn collect_equipped_factor_item_matches(
    v_data: &blueprotobuf::CharSerialize,
    factor_items: &[FactorItemMatch],
) -> Vec<EquippedItemMatch> {
    let factor_by_uuid: HashMap<u64, &FactorItemMatch> = factor_items
        .iter()
        .filter_map(|item| Some((u64::try_from(item.uuid?).ok()?, item)))
        .collect();
    let Some(equip) = v_data.equip.as_ref() else {
        return Vec::new();
    };

    let mut matches = Vec::new();
    for info in equip.equip_list.values() {
        let Some(item_uuid) = info.item_uuid else {
            continue;
        };
        let Some(factor_item) = factor_by_uuid.get(&item_uuid) else {
            continue;
        };
        matches.push(EquippedItemMatch {
            equip_slot: info.equip_slot,
            item_uuid: Some(item_uuid),
            matched_config_id: factor_item.config_id,
            matched_family_id: factor_item.family_id,
            matched_family_name: factor_item.family_name.clone(),
        });
    }
    matches.sort_by_key(|row| (row.equip_slot.unwrap_or(0), row.matched_config_id));
    matches
}

fn collect_buff_db_factor_matches(
    v_data: &blueprotobuf::CharSerialize,
    factor_buff_ids: &HashSet<i32>,
) -> Vec<BuffDbMatch> {
    let Some(buff_info) = v_data.buff_info.as_ref() else {
        return Vec::new();
    };

    let mut matches = Vec::new();
    for (map_key, buff) in &buff_info.all_buff_db_data {
        let buff_config_id = buff
            .buff_config_id
            .and_then(|id| i32::try_from(id).ok())
            .is_some_and(|id| factor_buff_ids.contains(&id));
        let base_id = buff
            .base_id
            .and_then(|id| i32::try_from(id).ok())
            .is_some_and(|id| factor_buff_ids.contains(&id));
        if !buff_config_id && !base_id {
            continue;
        }
        matches.push(BuffDbMatch {
            map_key: *map_key,
            buff_uuid: buff.buff_uuid,
            firer_id: buff.firer_id,
            buff_config_id: buff.buff_config_id,
            base_id: buff.base_id,
            level: buff.level,
            layer: buff.layer,
            duration: buff.duration,
            count: buff.count,
            create_time: buff.create_time,
            part_id: buff.part_id,
            create_scene_id: buff.create_scene_id,
            custom_params_key: buff.custom_params_key.clone(),
            custom_params: buff.custom_params.clone(),
        });
    }
    matches.sort_by_key(|row| {
        (
            row.buff_config_id.unwrap_or(0),
            row.base_id.unwrap_or(0),
            row.map_key,
        )
    });
    matches
}

fn collect_season_medal(v_data: &blueprotobuf::CharSerialize) -> SeasonMedalOut {
    let Some(info) = v_data.season_medal_info.as_ref() else {
        return SeasonMedalOut {
            season_id: None,
            core_hole_info: None,
            normal_hole_infos: Vec::new(),
            core_hole_node_infos: Vec::new(),
        };
    };

    let mut normal_hole_infos: Vec<_> = info
        .normal_hole_infos
        .iter()
        .map(|(map_key, hole)| SeasonMedalHoleOut {
            map_key: Some(*map_key),
            hole_id: hole.hole_id,
            hole_level: hole.hole_level,
            cur_exp: hole.cur_exp,
        })
        .collect();
    normal_hole_infos.sort_by_key(|row| (row.map_key.unwrap_or(0), row.hole_id.unwrap_or(0)));

    let mut core_hole_node_infos: Vec<_> = info
        .core_hole_node_infos
        .iter()
        .map(|(map_key, node)| SeasonMedalNodeOut {
            map_key: *map_key,
            node_id: node.node_id,
            node_level: node.node_level,
            choose: node.choose,
            slot: node.slot,
        })
        .collect();
    core_hole_node_infos.sort_by_key(|row| (row.slot.unwrap_or(0), row.node_id.unwrap_or(0)));

    SeasonMedalOut {
        season_id: info.season_id,
        core_hole_info: info.core_hole_info.as_ref().map(|hole| SeasonMedalHoleOut {
            map_key: None,
            hole_id: hole.hole_id,
            hole_level: hole.hole_level,
            cur_exp: hole.cur_exp,
        }),
        normal_hole_infos,
        core_hole_node_infos,
    }
}

fn build_conclusion(
    factor_item_matches: &[FactorItemMatch],
    equipped_factor_item_matches: &[EquippedItemMatch],
    buff_db_factor_matches: &[BuffDbMatch],
) -> ReportConclusion {
    let factor_grade_selection_status = if !equipped_factor_item_matches.is_empty() {
        "selected-grade-proven-by-equip-list-uuid"
    } else if !factor_item_matches.is_empty() && !buff_db_factor_matches.is_empty() {
        "owned-grade-items-and-factor-buffs-observed-but-selection-not-proven"
    } else if !factor_item_matches.is_empty() {
        "owned-grade-items-observed-but-selection-not-proven"
    } else if !buff_db_factor_matches.is_empty() {
        "factor-buffs-observed-but-grade-item-not-found"
    } else {
        "no-runtime-factor-grade-proof-found"
    };

    ReportConclusion {
        factor_grade_selection_status,
        notes: vec![
            "Factor grade item IDs in item_package prove ownership/presence only unless another runtime structure marks them selected.",
            "equip.equip_list UUID matches would prove normal equipment selection, but Phantom Factors may use a separate seasonal loadout.",
            "buff_info factor matches prove an active/stored factor buff ID, but several grades share the same buff ID.",
        ],
    }
}
