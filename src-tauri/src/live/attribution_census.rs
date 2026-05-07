use crate::live::event_logger::{
    EventLoggerSessionContext, now_ms, resolve_event_logger_session_dir,
};
use crate::live::opcodes_models::AttrValue;
use crate::parser_data;
use log::warn;
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

const UNIQUE_VALUE_LIMIT: usize = 128;
const FORMULA_SAMPLE_LIMIT: usize = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormulaAttrSnapshot {
    pub attr_id: i32,
    pub attr_name: String,
    pub value: AttrValue,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FormulaHitSample {
    ts_ms: i64,
    skill_key: i64,
    value: u128,
    effective_value: u128,
    hp_loss_value: u128,
    shield_loss_value: u128,
    is_heal: bool,
    is_crit: bool,
    is_lucky: bool,
    owner_id: i32,
    owner_level: Option<i32>,
    hit_event_id: Option<i32>,
    damage_source: Option<i32>,
    property: Option<i32>,
    damage_mode: Option<i32>,
    attacker_uid: i64,
    original_attacker_uid: i64,
    top_summoner_uid: Option<i64>,
    target_uid: i64,
    target_monster_type_id: Option<i32>,
    attacker_attrs: Vec<FormulaAttrSnapshot>,
    target_attrs: Vec<FormulaAttrSnapshot>,
    active_buff_base_ids: Vec<i32>,
    active_buff_source_uids: Vec<i64>,
    active_factor_buff_ids: Vec<i32>,
    active_effect_buff_ids: Vec<i32>,
    active_effect_source_ids: Vec<String>,
    active_factor_item_ids: Vec<i32>,
    active_factor_item_grades: Vec<i32>,
    active_passive_skill_ids: Vec<i32>,
    active_passive_skill_uuids: Vec<i64>,
    active_profession_talent_node_ids: Vec<i32>,
    active_profession_talent_stage_cfg_ids: Vec<i32>,
}

#[derive(Debug, Clone)]
pub struct AttributionDamageEvent {
    pub ts_ms: i64,
    pub skill_key: i64,
    pub damage_id: i64,
    pub owner_id: i32,
    pub owner_level: Option<i32>,
    pub hit_event_id: Option<i32>,
    pub damage_source: Option<i32>,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub attacker_uid: i64,
    pub original_attacker_uid: i64,
    pub top_summoner_uid: Option<i64>,
    pub target_uid: i64,
    pub target_monster_type_id: Option<i32>,
    pub value: u128,
    pub effective_value: u128,
    pub hp_loss_value: u128,
    pub shield_loss_value: u128,
    pub is_heal: bool,
    pub is_crit: bool,
    pub is_lucky: bool,
    pub attacker_class_id: i32,
    pub attacker_class_spec: String,
    pub active_buff_base_ids: Vec<i32>,
    pub active_buff_source_uids: Vec<i64>,
    pub active_factor_buff_ids: Vec<i32>,
    pub active_effect_buff_ids: Vec<i32>,
    pub active_effect_source_ids: Vec<String>,
    pub active_factor_item_ids: Vec<i32>,
    pub active_factor_item_grades: Vec<i32>,
    pub active_passive_skill_ids: Vec<i32>,
    pub active_passive_skill_uuids: Vec<i64>,
    pub active_profession_talent_node_ids: Vec<i32>,
    pub active_profession_talent_stage_cfg_ids: Vec<i32>,
    pub attacker_attr_snapshot: Vec<FormulaAttrSnapshot>,
    pub target_attr_snapshot: Vec<FormulaAttrSnapshot>,
}

#[derive(Debug, Default)]
struct AttributionCensusState {
    started_at_ms: Option<i64>,
    rows: HashMap<i64, AttributionCensusAggregate>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttributionCensusAggregate {
    damage_id: i64,
    first_seen_ms: i64,
    last_seen_ms: i64,
    hits: u64,
    heal_hits: u64,
    total_value: u128,
    hp_loss_total: u128,
    shield_loss_total: u128,
    crit_hits: u64,
    lucky_hits: u64,
    owner_ids: Vec<i32>,
    owner_levels: Vec<i32>,
    hit_event_ids: Vec<i32>,
    damage_sources: Vec<i32>,
    properties: Vec<i32>,
    damage_modes: Vec<i32>,
    skill_keys: Vec<i64>,
    original_attacker_uids: Vec<i64>,
    top_summoner_uids: Vec<i64>,
    target_monster_type_ids: Vec<i32>,
    attacker_class_ids: Vec<i32>,
    attacker_class_specs: Vec<String>,
    active_buff_base_ids: Vec<i32>,
    active_buff_source_uids: Vec<i64>,
    active_factor_buff_ids: Vec<i32>,
    active_effect_buff_ids: Vec<i32>,
    active_effect_source_ids: Vec<String>,
    active_factor_item_ids: Vec<i32>,
    active_factor_item_grades: Vec<i32>,
    active_passive_skill_ids: Vec<i32>,
    active_passive_skill_uuids: Vec<i64>,
    active_profession_talent_node_ids: Vec<i32>,
    active_profession_talent_stage_cfg_ids: Vec<i32>,
    formula_samples: Vec<FormulaHitSample>,
    #[serde(skip)]
    formula_sample_signatures: HashSet<String>,
    last_attacker_uid: i64,
    last_target_uid: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttributionCensusOutputRow {
    #[serde(flatten)]
    aggregate: AttributionCensusAggregate,
    #[serde(flatten)]
    metadata: AttributionDamageMetadata,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttributionDamageMetadata {
    source_status: String,
    known_damage_attr: bool,
    known_recount_damage: bool,
    direct_factor_damage: bool,
    effect_source_damage: bool,
    display_name: Option<String>,
    display_detail_name: Option<String>,
    category: Option<String>,
    source_kind: Option<String>,
    source_type: Option<String>,
    source_role: Option<String>,
    badge: Option<String>,
    parent_recount_id: Option<i64>,
    parent_recount_name: Option<String>,
    linked_source: Option<String>,
    linked_id: Option<i64>,
    recount_rows: Vec<AttributionRecountMetadata>,
    direct_factor_buff_ids: Vec<i32>,
    effect_source_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttributionRecountMetadata {
    recount_id: i64,
    name: Option<String>,
}

#[derive(Debug, Default)]
struct AttributionCensusIndex {
    known_damage_attr_ids: HashSet<i64>,
    known_recount_damage_ids: HashSet<i64>,
    damage_details: HashMap<i64, AttributionDamageDetail>,
    recount_by_damage_id: HashMap<i64, Vec<AttributionRecountMetadata>>,
    factor_buff_ids_by_damage_id: HashMap<i64, Vec<i32>>,
    effect_source_ids_by_damage_id: HashMap<i64, Vec<String>>,
}

#[derive(Debug, Clone, Default)]
struct AttributionDamageDetail {
    display_name: Option<String>,
    display_detail_name: Option<String>,
    category: Option<String>,
    source_kind: Option<String>,
    source_type: Option<String>,
    source_role: Option<String>,
    badge: Option<String>,
    parent_recount_id: Option<i64>,
    parent_recount_name: Option<String>,
    linked_source: Option<String>,
    linked_id: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttributionCensusFile {
    boundary: String,
    saved_at_ms: i64,
    started_at_ms: Option<i64>,
    ended_at_ms: i64,
    character_name: Option<String>,
    character_uid: Option<i64>,
    scene_name: Option<String>,
    row_count: usize,
    rows: Vec<AttributionCensusOutputRow>,
}

fn attribution_census_enabled_flag() -> &'static AtomicBool {
    static ATTRIBUTION_CENSUS_ENABLED: OnceLock<AtomicBool> = OnceLock::new();
    ATTRIBUTION_CENSUS_ENABLED.get_or_init(|| AtomicBool::new(false))
}

fn attribution_census_state() -> &'static Mutex<AttributionCensusState> {
    static ATTRIBUTION_CENSUS_STATE: OnceLock<Mutex<AttributionCensusState>> = OnceLock::new();
    ATTRIBUTION_CENSUS_STATE.get_or_init(|| Mutex::new(AttributionCensusState::default()))
}

fn attribution_census_index() -> &'static AttributionCensusIndex {
    static ATTRIBUTION_CENSUS_INDEX: OnceLock<AttributionCensusIndex> = OnceLock::new();
    ATTRIBUTION_CENSUS_INDEX.get_or_init(load_attribution_census_index)
}

pub fn set_attribution_census_enabled(enabled: bool) {
    attribution_census_enabled_flag().store(enabled, Ordering::Relaxed);
    if enabled {
        let mut state = attribution_census_state().lock();
        state.started_at_ms = Some(now_ms());
        state.rows.clear();
    }
}

pub fn is_attribution_census_enabled() -> bool {
    attribution_census_enabled_flag().load(Ordering::Relaxed)
}

pub fn record_damage_event(event: AttributionDamageEvent) {
    if !is_attribution_census_enabled() {
        return;
    }

    let mut state = attribution_census_state().lock();
    if state.started_at_ms.is_none() {
        state.started_at_ms = Some(event.ts_ms);
    }

    let row = state
        .rows
        .entry(event.damage_id)
        .or_insert_with(|| AttributionCensusAggregate {
            damage_id: event.damage_id,
            first_seen_ms: event.ts_ms,
            last_seen_ms: event.ts_ms,
            ..Default::default()
        });

    row.last_seen_ms = event.ts_ms;
    row.hits = row.hits.saturating_add(1);
    if event.is_heal {
        row.heal_hits = row.heal_hits.saturating_add(1);
    }
    row.total_value = row.total_value.saturating_add(event.value);
    row.hp_loss_total = row.hp_loss_total.saturating_add(event.hp_loss_value);
    row.shield_loss_total = row
        .shield_loss_total
        .saturating_add(event.shield_loss_value);
    if event.is_crit {
        row.crit_hits = row.crit_hits.saturating_add(1);
    }
    if event.is_lucky {
        row.lucky_hits = row.lucky_hits.saturating_add(1);
    }

    push_unique_i32(&mut row.owner_ids, event.owner_id);
    push_unique_option_i32(&mut row.owner_levels, event.owner_level);
    push_unique_option_i32(&mut row.hit_event_ids, event.hit_event_id);
    push_unique_option_i32(&mut row.damage_sources, event.damage_source);
    push_unique_option_i32(&mut row.properties, event.property);
    push_unique_option_i32(&mut row.damage_modes, event.damage_mode);
    push_unique_i64(&mut row.skill_keys, event.skill_key);
    push_unique_i64(&mut row.original_attacker_uids, event.original_attacker_uid);
    push_unique_option_i64(&mut row.top_summoner_uids, event.top_summoner_uid);
    push_unique_option_i32(
        &mut row.target_monster_type_ids,
        event.target_monster_type_id,
    );
    push_unique_i32(&mut row.attacker_class_ids, event.attacker_class_id);
    push_unique_string(
        &mut row.attacker_class_specs,
        event.attacker_class_spec.clone(),
    );
    push_unique_i32_values(
        &mut row.active_buff_base_ids,
        event.active_buff_base_ids.clone(),
    );
    push_unique_i64_values(
        &mut row.active_buff_source_uids,
        event.active_buff_source_uids.clone(),
    );
    push_unique_i32_values(
        &mut row.active_factor_buff_ids,
        event.active_factor_buff_ids.clone(),
    );
    push_unique_i32_values(
        &mut row.active_effect_buff_ids,
        event.active_effect_buff_ids.clone(),
    );
    push_unique_string_values(
        &mut row.active_effect_source_ids,
        event.active_effect_source_ids.clone(),
    );
    push_unique_i32_values(
        &mut row.active_factor_item_ids,
        event.active_factor_item_ids.clone(),
    );
    push_unique_i32_values(
        &mut row.active_factor_item_grades,
        event.active_factor_item_grades.clone(),
    );
    push_unique_i32_values(
        &mut row.active_passive_skill_ids,
        event.active_passive_skill_ids.clone(),
    );
    push_unique_i64_values(
        &mut row.active_passive_skill_uuids,
        event.active_passive_skill_uuids.clone(),
    );
    push_unique_i32_values(
        &mut row.active_profession_talent_node_ids,
        event.active_profession_talent_node_ids.clone(),
    );
    push_unique_i32_values(
        &mut row.active_profession_talent_stage_cfg_ids,
        event.active_profession_talent_stage_cfg_ids.clone(),
    );
    row.last_attacker_uid = event.attacker_uid;
    row.last_target_uid = event.target_uid;

    maybe_push_formula_sample(row, event);
}

pub fn flush_current_census_to_file(
    app_handle: &AppHandle,
    boundary: &str,
    context: EventLoggerSessionContext,
) -> Result<Option<PathBuf>, String> {
    let (rows, started_at_ms) = {
        let mut state = attribution_census_state().lock();
        if state.rows.is_empty() {
            return Ok(None);
        }
        (std::mem::take(&mut state.rows), state.started_at_ms.take())
    };

    let mut rows: Vec<_> = rows.into_values().collect();
    rows.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| left.damage_id.cmp(&right.damage_id))
    });

    let index = attribution_census_index();
    let output_rows = rows
        .into_iter()
        .map(|aggregate| AttributionCensusOutputRow {
            metadata: index.metadata_for_damage_id(aggregate.damage_id),
            aggregate,
        })
        .collect::<Vec<_>>();

    let session_root_dir = resolve_event_logger_session_dir(app_handle)?;
    let now = chrono::Local::now();
    let day_directory = now.format("%Y.%m.%d").to_string();
    let session_dir = session_root_dir
        .join("AttributionCensus")
        .join(day_directory);
    fs::create_dir_all(&session_dir).map_err(|e| {
        format!(
            "failed to create attribution census dir {}: {e}",
            session_dir.display()
        )
    })?;

    let character_name = context.character_name.clone();
    let character_uid = context.character_uid;
    let scene_name = context.scene_name.clone();
    let date_segment = now.format("%d%m%Y").to_string();
    let time_segment = now.format("%H%M%S").to_string();
    let file_name = format!(
        "{}.{}.{}.{}.{}-{}.json",
        sanitize_filename_segment(character_name.as_deref().unwrap_or("unknown_character")),
        sanitize_filename_segment(
            &character_uid
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown_uid".to_string()),
        ),
        sanitize_filename_segment(scene_name.as_deref().unwrap_or("unknown_scene")),
        sanitize_filename_segment(boundary),
        date_segment,
        time_segment
    );
    let file_path = next_available_file_path(&session_dir, &file_name);

    let payload = AttributionCensusFile {
        boundary: boundary.to_string(),
        saved_at_ms: now_ms(),
        started_at_ms,
        ended_at_ms: output_rows
            .iter()
            .map(|row| row.aggregate.last_seen_ms)
            .max()
            .unwrap_or_else(now_ms),
        character_name,
        character_uid,
        scene_name,
        row_count: output_rows.len(),
        rows: output_rows,
    };

    fs::write(
        &file_path,
        serde_json::to_vec_pretty(&payload).map_err(|e| {
            format!(
                "failed to serialize attribution census file {}: {e}",
                file_path.display()
            )
        })?,
    )
    .map_err(|e| {
        format!(
            "failed to write attribution census file {}: {e}",
            file_path.display()
        )
    })?;

    Ok(Some(file_path))
}

fn maybe_push_formula_sample(row: &mut AttributionCensusAggregate, event: AttributionDamageEvent) {
    if row.formula_samples.len() >= FORMULA_SAMPLE_LIMIT {
        return;
    }

    let sample = FormulaHitSample {
        ts_ms: event.ts_ms,
        skill_key: event.skill_key,
        value: event.value,
        effective_value: event.effective_value,
        hp_loss_value: event.hp_loss_value,
        shield_loss_value: event.shield_loss_value,
        is_heal: event.is_heal,
        is_crit: event.is_crit,
        is_lucky: event.is_lucky,
        owner_id: event.owner_id,
        owner_level: event.owner_level,
        hit_event_id: event.hit_event_id,
        damage_source: event.damage_source,
        property: event.property,
        damage_mode: event.damage_mode,
        attacker_uid: event.attacker_uid,
        original_attacker_uid: event.original_attacker_uid,
        top_summoner_uid: event.top_summoner_uid,
        target_uid: event.target_uid,
        target_monster_type_id: event.target_monster_type_id,
        attacker_attrs: event.attacker_attr_snapshot,
        target_attrs: event.target_attr_snapshot,
        active_buff_base_ids: event.active_buff_base_ids,
        active_buff_source_uids: event.active_buff_source_uids,
        active_factor_buff_ids: event.active_factor_buff_ids,
        active_effect_buff_ids: event.active_effect_buff_ids,
        active_effect_source_ids: event.active_effect_source_ids,
        active_factor_item_ids: event.active_factor_item_ids,
        active_factor_item_grades: event.active_factor_item_grades,
        active_passive_skill_ids: event.active_passive_skill_ids,
        active_passive_skill_uuids: event.active_passive_skill_uuids,
        active_profession_talent_node_ids: event.active_profession_talent_node_ids,
        active_profession_talent_stage_cfg_ids: event.active_profession_talent_stage_cfg_ids,
    };
    let signature = formula_sample_signature(&sample);
    if row.formula_sample_signatures.insert(signature) {
        row.formula_samples.push(sample);
    }
}

fn formula_sample_signature(sample: &FormulaHitSample) -> String {
    format!(
        "skill={};value={};effective={};heal={};crit={};lucky={};owner={};level={:?};hit={:?};source={:?};property={:?};mode={:?};attacker={};original_attacker={};top_summoner={:?};target={};monster={:?};attacker_attrs={:?};target_attrs={:?};buffs={:?};buff_sources={:?};factor_buffs={:?};effect_buffs={:?};effect_sources={:?};factor_items={:?};factor_grades={:?};passive_skills={:?};passive_uuids={:?};talent_nodes={:?};talent_stages={:?}",
        sample.skill_key,
        sample.value,
        sample.effective_value,
        sample.is_heal,
        sample.is_crit,
        sample.is_lucky,
        sample.owner_id,
        sample.owner_level,
        sample.hit_event_id,
        sample.damage_source,
        sample.property,
        sample.damage_mode,
        sample.attacker_uid,
        sample.original_attacker_uid,
        sample.top_summoner_uid,
        sample.target_uid,
        sample.target_monster_type_id,
        sample.attacker_attrs,
        sample.target_attrs,
        sample.active_buff_base_ids,
        sample.active_buff_source_uids,
        sample.active_factor_buff_ids,
        sample.active_effect_buff_ids,
        sample.active_effect_source_ids,
        sample.active_factor_item_ids,
        sample.active_factor_item_grades,
        sample.active_passive_skill_ids,
        sample.active_passive_skill_uuids,
        sample.active_profession_talent_node_ids,
        sample.active_profession_talent_stage_cfg_ids,
    )
}

impl AttributionCensusIndex {
    fn metadata_for_damage_id(&self, damage_id: i64) -> AttributionDamageMetadata {
        let detail = self.damage_details.get(&damage_id);
        let recount_rows = self
            .recount_by_damage_id
            .get(&damage_id)
            .cloned()
            .unwrap_or_default();
        let direct_factor_buff_ids = self
            .factor_buff_ids_by_damage_id
            .get(&damage_id)
            .cloned()
            .unwrap_or_default();
        let effect_source_ids = self
            .effect_source_ids_by_damage_id
            .get(&damage_id)
            .cloned()
            .unwrap_or_default();
        let known_damage_attr = self.known_damage_attr_ids.contains(&damage_id);
        let known_recount_damage = self.known_recount_damage_ids.contains(&damage_id);
        let direct_factor_damage = !direct_factor_buff_ids.is_empty();
        let effect_source_damage = !effect_source_ids.is_empty();
        let source_status = if direct_factor_damage {
            "direct-factor-damage-id"
        } else if effect_source_damage {
            "effect-source-damage-id"
        } else if known_recount_damage {
            "recount-damage-id"
        } else if known_damage_attr {
            "known-damage-unmapped"
        } else {
            "unknown-emitted-damage-id"
        };

        AttributionDamageMetadata {
            source_status: source_status.to_string(),
            known_damage_attr,
            known_recount_damage,
            direct_factor_damage,
            effect_source_damage,
            display_name: detail.and_then(|value| value.display_name.clone()),
            display_detail_name: detail.and_then(|value| value.display_detail_name.clone()),
            category: detail.and_then(|value| value.category.clone()),
            source_kind: detail.and_then(|value| value.source_kind.clone()),
            source_type: detail.and_then(|value| value.source_type.clone()),
            source_role: detail.and_then(|value| value.source_role.clone()),
            badge: detail.and_then(|value| value.badge.clone()),
            parent_recount_id: detail.and_then(|value| value.parent_recount_id),
            parent_recount_name: detail.and_then(|value| value.parent_recount_name.clone()),
            linked_source: detail.and_then(|value| value.linked_source.clone()),
            linked_id: detail.and_then(|value| value.linked_id),
            recount_rows,
            direct_factor_buff_ids,
            effect_source_ids,
        }
    }
}

fn load_attribution_census_index() -> AttributionCensusIndex {
    let mut index = AttributionCensusIndex::default();

    if let Some(value) = read_parser_json("generated/DamageAttrIdName.json") {
        if let Some(object) = value.as_object() {
            for (key, row) in object {
                if let Some(damage_id) = parse_i64_key_or_id(key, row) {
                    index.known_damage_attr_ids.insert(damage_id);
                }
            }
        }
    }

    if let Some(value) = read_parser_json("generated/SkillBreakdownDetails.json") {
        if let Some(object) = value.as_object() {
            for (key, row) in object {
                let Some(damage_id) = parse_i64_key_or_id(key, row) else {
                    continue;
                };
                index.damage_details.insert(
                    damage_id,
                    AttributionDamageDetail {
                        display_name: localized_or_text(row, "DisplayNames", "DisplayName"),
                        display_detail_name: localized_or_text(
                            row,
                            "DisplayDetailNames",
                            "DisplayDetailName",
                        ),
                        category: value_string(row, "Category"),
                        source_kind: value_string(row, "SourceKind"),
                        source_type: value_string(row, "SourceType"),
                        source_role: value_string(row, "SourceRole"),
                        badge: value_string(row, "Badge"),
                        parent_recount_id: value_i64(row, "ParentRecountId"),
                        parent_recount_name: localized_or_text(
                            row,
                            "ParentRecountNames",
                            "ParentRecountName",
                        ),
                        linked_source: value_string(row, "LinkedSource"),
                        linked_id: value_i64(row, "LinkedId"),
                    },
                );
            }
        }
    }

    if let Some(value) = read_parser_json("generated/RecountTable.json") {
        if let Some(object) = value.as_object() {
            for (key, row) in object {
                let recount_id = parse_i64_key_or_id(key, row).unwrap_or_default();
                let name = localized_or_text(row, "Names", "Name")
                    .or_else(|| value_string(row, "RecountName"));
                let recount = AttributionRecountMetadata { recount_id, name };
                if let Some(damage_ids) = row.get("DamageId").and_then(Value::as_array) {
                    for damage_id in damage_ids.iter().filter_map(value_as_i64) {
                        index.known_recount_damage_ids.insert(damage_id);
                        push_unique_recount(
                            index.recount_by_damage_id.entry(damage_id).or_default(),
                            recount.clone(),
                        );
                    }
                }
            }
        }
    }

    if let Some(value) = read_parser_json("generated/SeasonPhantomFactors.json") {
        read_i64_to_i32_vec_map(
            &mut index.factor_buff_ids_by_damage_id,
            value.get("damageIdToFactorBuffIds"),
        );
    }

    if let Some(value) = read_parser_json("generated/EffectSources.json") {
        read_i64_to_string_vec_map(
            &mut index.effect_source_ids_by_damage_id,
            value.get("damageIdToEffectSourceIds"),
        );
    }

    index
}

fn read_parser_json(relative_path: &str) -> Option<Value> {
    let contents = match parser_data::read_to_string(relative_path) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "attribution_census_index_load_failed path={} error={}",
                relative_path,
                err
            );
            return None;
        }
    };

    match serde_json::from_str::<Value>(&contents) {
        Ok(value) => Some(value),
        Err(err) => {
            warn!(
                target: "app::live",
                "attribution_census_index_parse_failed path={} error={}",
                relative_path,
                err
            );
            None
        }
    }
}

fn read_i64_to_i32_vec_map(target: &mut HashMap<i64, Vec<i32>>, value: Option<&Value>) {
    let Some(object) = value.and_then(Value::as_object) else {
        return;
    };
    for (key, value) in object {
        let Some(id) = key.parse::<i64>().ok() else {
            continue;
        };
        if let Some(values) = value.as_array() {
            for child in values.iter().filter_map(value_as_i64) {
                if let Ok(child) = i32::try_from(child) {
                    push_unique_i32(target.entry(id).or_default(), child);
                }
            }
        }
    }
}

fn read_i64_to_string_vec_map(target: &mut HashMap<i64, Vec<String>>, value: Option<&Value>) {
    let Some(object) = value.and_then(Value::as_object) else {
        return;
    };
    for (key, value) in object {
        let Some(id) = key.parse::<i64>().ok() else {
            continue;
        };
        if let Some(values) = value.as_array() {
            for child in values.iter().filter_map(Value::as_str) {
                push_unique_string(target.entry(id).or_default(), child.to_string());
            }
        }
    }
}

fn parse_i64_key_or_id(key: &str, row: &Value) -> Option<i64> {
    key.parse::<i64>().ok().or_else(|| value_i64(row, "Id"))
}

fn value_i64(row: &Value, key: &str) -> Option<i64> {
    row.get(key).and_then(value_as_i64)
}

fn value_as_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|value| i64::try_from(value).ok()))
        .or_else(|| value.as_str().and_then(|value| value.parse::<i64>().ok()))
}

fn value_string(row: &Value, key: &str) -> Option<String> {
    row.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn localized_or_text(row: &Value, localized_key: &str, fallback_key: &str) -> Option<String> {
    row.get(localized_key)
        .and_then(Value::as_object)
        .and_then(|map| {
            map.get("en")
                .or_else(|| map.get("design"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| value_string(row, fallback_key))
}

fn push_unique_i32_values(target: &mut Vec<i32>, values: Vec<i32>) {
    for value in values {
        push_unique_i32(target, value);
    }
}

fn push_unique_i64_values(target: &mut Vec<i64>, values: Vec<i64>) {
    for value in values {
        push_unique_i64(target, value);
    }
}

fn push_unique_string_values(target: &mut Vec<String>, values: Vec<String>) {
    for value in values {
        push_unique_string(target, value);
    }
}

fn push_unique_option_i32(target: &mut Vec<i32>, value: Option<i32>) {
    if let Some(value) = value {
        push_unique_i32(target, value);
    }
}

fn push_unique_option_i64(target: &mut Vec<i64>, value: Option<i64>) {
    if let Some(value) = value {
        push_unique_i64(target, value);
    }
}

fn push_unique_i32(target: &mut Vec<i32>, value: i32) {
    if value == 0 || target.contains(&value) || target.len() >= UNIQUE_VALUE_LIMIT {
        return;
    }
    target.push(value);
}

fn push_unique_i64(target: &mut Vec<i64>, value: i64) {
    if value == 0 || target.contains(&value) || target.len() >= UNIQUE_VALUE_LIMIT {
        return;
    }
    target.push(value);
}

fn push_unique_string(target: &mut Vec<String>, value: String) {
    let value = value.trim();
    if value.is_empty() || target.iter().any(|existing| existing == value) {
        return;
    }
    if target.len() < UNIQUE_VALUE_LIMIT {
        target.push(value.to_string());
    }
}

fn push_unique_recount(
    target: &mut Vec<AttributionRecountMetadata>,
    value: AttributionRecountMetadata,
) {
    if target
        .iter()
        .any(|existing| existing.recount_id == value.recount_id)
    {
        return;
    }
    if target.len() < UNIQUE_VALUE_LIMIT {
        target.push(value);
    }
}

fn sanitize_filename_segment(value: &str) -> String {
    let sanitized = value
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    }
}

fn next_available_file_path(dir: &Path, base_name: &str) -> PathBuf {
    let candidate = dir.join(base_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = base_name.strip_suffix(".json").unwrap_or(base_name);
    for index in 2..1000 {
        let candidate = dir.join(format!("{stem}.{index}.json"));
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(format!("{stem}.overflow.json"))
}
