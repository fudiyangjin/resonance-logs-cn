use crate::live::opcodes_models::SkillTargetStats;
use crate::live::opcodes_models::{
    CombatStats, ObservedActiveBuff, ObservedEffectBuff, ObservedEffectSource, ObservedFactorBuff,
    ObservedFactorItem, ObservedFormulaAttr, ObservedModifierHitBucket, ObservedModifierReplayHit,
    ObservedModifierReplaySource, ObservedModifierWindow, ObservedPassiveSkill,
    ObservedProfessionSkill, ObservedProfessionTalent, ObservedSkillCastEvent,
    ObservedSkillCooldownEvent, Skill,
};
use crate::live::training_dummy::TrainingDummyPhase;
use std::collections::HashMap;

/// Represents the health of a boss.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BossHealth {
    /// The unique ID of the boss.
    pub uid: i64,
    /// The name of the boss.
    pub name: String,
    /// The current HP of the boss.
    pub current_hp: Option<i64>,
    /// The maximum HP of the boss.
    pub max_hp: Option<i64>,
    /// Whether the boss is in ActorStateDead.
    pub is_dead: bool,
}

/// Represents the header information for an encounter.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeaderInfo {
    /// The total DPS of the encounter.
    pub total_dps: f64,
    /// The total damage of the encounter.
    pub total_dmg: u128,
    /// The elapsed time of the encounter in milliseconds.
    pub elapsed_ms: u128,
    /// The accumulated active combat time in milliseconds.
    pub active_combat_time_ms: u128,
    /// The timestamp of when the fight started, in milliseconds since the Unix epoch.
    pub fight_start_timestamp_ms: u128, // Unix timestamp when fight started
    /// A list of bosses in the encounter.
    pub bosses: Vec<BossHealth>,
    /// The ID of the scene where the encounter took place.
    pub scene_id: Option<i32>,
    /// The name of the scene where the encounter took place.
    pub scene_name: Option<String>,
    /// Current training dummy runtime state for the live window.
    pub training_dummy: TrainingDummyState,
}

/// Represents a raw
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveDataPayload {
    pub elapsed_ms: u128,
    pub active_combat_time_ms: u128,
    pub fight_start_timestamp_ms: u128,
    pub total_dmg: u128,
    pub total_dmg_boss_only: u128,
    pub total_heal: u128,
    pub total_effective_heal: u128,
    pub local_player_uid: i64,
    pub scene_id: Option<i32>,
    pub scene_name: Option<String>,
    pub is_paused: bool,
    pub bosses: Vec<BossHealth>,
    pub entities: Vec<RawEntityData>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrainingDummyState {
    pub phase: TrainingDummyPhase,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawEntityData {
    pub uid: i64,
    pub name: String,
    pub class_id: i32,
    pub class_spec: i32,
    pub class_name: String,
    pub class_spec_name: String,
    pub ability_score: i32,
    pub season_strength: i32,
    pub damage: RawCombatStats,
    pub damage_boss_only: RawCombatStats,
    pub healing: RawCombatStats,
    pub taken: RawCombatStats,
    pub dmg_skills: HashMap<i64, RawSkillStats>,
    pub heal_skills: HashMap<i64, RawSkillStats>,
    pub taken_skills: HashMap<i64, RawSkillStats>,
    pub active_buffs: Vec<ActiveBuffState>,
    pub active_factor_buffs: Vec<ActiveFactorBuffState>,
    pub active_effect_buffs: Vec<ActiveEffectBuffState>,
    pub modifier_windows: Vec<ModifierWindowState>,
    pub modifier_hit_buckets: Vec<ModifierHitBucketState>,
    pub modifier_replay_hits: Vec<ModifierReplayHitState>,
    pub skill_cast_events: Vec<SkillCastEventState>,
    pub skill_cooldown_events: Vec<SkillCooldownEventState>,
    pub active_effect_sources: Vec<ActiveEffectSourceState>,
    pub active_factor_items: Vec<ActiveFactorItemState>,
    pub active_passive_skills: Vec<ActivePassiveSkillState>,
    pub active_profession_skills: Vec<ActiveProfessionSkillState>,
    pub active_profession_talents: Vec<ActiveProfessionTalentState>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntityData {
    pub uid: i64,
    pub name: String,
    pub class_id: i32,
    pub class_spec: i32,
    pub class_name: String,
    pub class_spec_name: String,
    pub ability_score: i32,
    pub season_strength: i32,
    pub damage: RawCombatStats,
    pub damage_boss_only: RawCombatStats,
    pub healing: RawCombatStats,
    pub taken: RawCombatStats,
    pub dmg_skills: HashMap<i64, RawSkillStats>,
    pub heal_skills: HashMap<i64, RawSkillStats>,
    pub taken_skills: HashMap<i64, RawSkillStats>,
    pub active_buffs: Vec<ActiveBuffState>,
    pub active_factor_buffs: Vec<ActiveFactorBuffState>,
    pub active_effect_buffs: Vec<ActiveEffectBuffState>,
    pub modifier_windows: Vec<ModifierWindowState>,
    pub modifier_hit_buckets: Vec<ModifierHitBucketState>,
    pub modifier_replay_hits: Vec<ModifierReplayHitState>,
    pub skill_cast_events: Vec<SkillCastEventState>,
    pub skill_cooldown_events: Vec<SkillCooldownEventState>,
    pub active_effect_sources: Vec<ActiveEffectSourceState>,
    pub active_factor_items: Vec<ActiveFactorItemState>,
    pub active_passive_skills: Vec<ActivePassiveSkillState>,
    pub active_profession_skills: Vec<ActiveProfessionSkillState>,
    pub active_profession_talents: Vec<ActiveProfessionTalentState>,
    #[serde(default)]
    pub modifier_source_actors: Vec<ModifierSourceActorState>,
    pub dmg_per_target: Vec<PerTargetStats>,
    pub heal_per_target: Vec<PerTargetStats>,
    pub deaths: Vec<DeathRecord>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModifierSourceActorState {
    pub uid: i64,
    pub name: String,
    pub entity_type: String,
    pub owner_uid: Option<i64>,
    pub owner_name: Option<String>,
    pub source_config_ids: Vec<i32>,
    pub base_ids: Vec<i32>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBuffState {
    pub buff_uuid: i32,
    pub base_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub received_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveFactorBuffState {
    pub factor_buff_id: i32,
    pub observed_buff_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub received_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveEffectBuffState {
    pub effect_source_buff_id: i32,
    pub observed_buff_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub received_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModifierWindowState {
    pub buff_uuid: i32,
    pub base_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration_ms: i32,
    pub start_time_ms: i64,
    pub end_time_ms: Option<i64>,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModifierHitBucketState {
    pub modifier_buff_uuid: i32,
    pub modifier_base_id: i32,
    pub modifier_buff_level: Option<i32>,
    pub modifier_part_id: Option<i32>,
    pub modifier_count: Option<i32>,
    pub modifier_fight_source_type: Option<i32>,
    pub modifier_source_config_id: Option<i32>,
    pub modifier_layer: i32,
    pub modifier_duration_ms: i32,
    pub modifier_start_time_ms: i64,
    pub modifier_end_time_ms: Option<i64>,
    pub modifier_host_uid: i64,
    pub modifier_source_uid: i64,
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
    pub is_heal: bool,
    pub hits: u128,
    pub total_value: u128,
    pub effective_total_value: u128,
    pub crit_hits: u128,
    pub crit_total_value: u128,
    pub lucky_hits: u128,
    pub lucky_total_value: u128,
    pub hp_loss_total: u128,
    pub shield_loss_total: u128,
    pub first_hit_time_ms: i64,
    pub last_hit_time_ms: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModifierReplayAttrState {
    pub attr_id: i32,
    pub value_int: Option<i64>,
    pub value_float: Option<f64>,
    pub value_bool: Option<bool>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModifierReplaySourceState {
    pub modifier_base_id: i32,
    pub modifier_source_config_id: Option<i32>,
    pub modifier_buff_level: Option<i32>,
    pub modifier_count: Option<i32>,
    pub modifier_layer: i32,
    pub modifier_host_uid: i64,
    pub modifier_source_uid: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModifierReplayHitState {
    pub timestamp_ms: i64,
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
    pub is_heal: bool,
    pub is_crit: bool,
    pub is_lucky: bool,
    pub value: u128,
    pub effective_value: u128,
    pub hp_loss_value: u128,
    pub shield_loss_value: u128,
    pub active_modifiers: Vec<ModifierReplaySourceState>,
    pub attacker_attrs: Vec<ModifierReplayAttrState>,
    pub target_attrs: Vec<ModifierReplayAttrState>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCastEventState {
    pub timestamp_ms: i64,
    pub skill_id: i32,
    pub source: String,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCooldownEventState {
    pub timestamp_ms: i64,
    pub skill_level_id: i32,
    pub skill_id: i32,
    pub begin_time: i64,
    pub duration: i32,
    pub calculated_duration: i32,
    pub cd_accelerate_rate: f32,
    pub skill_cd_type: i32,
    pub valid_cd_time: i32,
    pub attr_skill_cd: f32,
    pub attr_skill_cd_pct: f32,
    pub attr_cd_accelerate_pct: f32,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveEffectSourceState {
    pub source_id: String,
    pub runtime_source: String,
    pub source_entity_id: Option<i32>,
    pub node_id: Option<u32>,
    pub node_level: Option<u32>,
    pub slot: Option<i32>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveFactorItemState {
    pub factor_buff_id: i32,
    pub item_config_id: i32,
    pub item_uuid: Option<i64>,
    pub package_key: i32,
    pub package_type: Option<i32>,
    pub grade: Option<i32>,
    pub family_id: Option<i32>,
    pub runtime_source: String,
    pub selector_path: Option<String>,
    pub selector_signature: Option<String>,
    pub selector_offset: Option<i32>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivePassiveSkillState {
    pub passive_uuid: Option<i64>,
    pub target_uid: Option<i64>,
    pub stage_begin_time: Option<i64>,
    pub begin_time: Option<i64>,
    pub stage_play_num: Option<i32>,
    pub skill_id: Option<i32>,
    pub skill_level: Option<i32>,
    pub skill_stage: Option<i32>,
    pub runtime_source: String,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfessionSkillState {
    pub skill_id: i32,
    pub base_skill_id: Option<i32>,
    pub skill_level_id: Option<i32>,
    pub level: Option<i32>,
    pub remodel_level: Option<i32>,
    pub slot: Option<i32>,
    pub equipped: Option<bool>,
    pub source_kind: String,
    pub replace_skill_ids: Vec<i32>,
    pub runtime_source: String,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfessionTalentState {
    pub profession_id: i32,
    pub talent_node_id: u32,
    pub used_talent_points: Option<u32>,
    pub talent_stage_cfg_id: Option<i32>,
    pub runtime_source: String,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawCombatStats {
    pub total: u128,
    pub effective_total: u128,
    pub hits: u128,
    pub crit_hits: u128,
    pub crit_total: u128,
    pub lucky_hits: u128,
    pub lucky_total: u128,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawSkillStats {
    pub total_value: u128,
    pub effective_total_value: u128,
    pub hits: u128,
    pub crit_hits: u128,
    pub crit_total_value: u128,
    pub lucky_hits: u128,
    pub lucky_total_value: u128,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerTargetStats {
    pub target_uid: i64,
    pub target_name: String,
    pub total_value: u128,
    pub damage: RawCombatStats,
    pub skills: HashMap<i64, RawSkillStats>,
}

pub fn to_raw_combat_stats(stats: &CombatStats) -> RawCombatStats {
    RawCombatStats {
        total: stats.total,
        effective_total: stats.effective_total,
        hits: stats.hits,
        crit_hits: stats.crit_hits,
        crit_total: stats.crit_total,
        lucky_hits: stats.lucky_hits,
        lucky_total: stats.lucky_total,
    }
}

pub fn to_raw_skill_stats(skill: &Skill) -> RawSkillStats {
    RawSkillStats {
        total_value: skill.total_value,
        effective_total_value: skill.effective_total_value,
        hits: skill.hits,
        crit_hits: skill.crit_hits,
        crit_total_value: skill.crit_total_value,
        lucky_hits: skill.lucky_hits,
        lucky_total_value: skill.lucky_total_value,
        property: skill.property,
        damage_mode: skill.damage_mode,
    }
}

pub fn to_active_buff_state(buff: &ObservedActiveBuff) -> ActiveBuffState {
    ActiveBuffState {
        buff_uuid: buff.buff_uuid,
        base_id: buff.base_id,
        buff_level: buff.buff_level,
        part_id: buff.part_id,
        count: buff.count,
        fight_source_type: buff.fight_source_type,
        source_config_id: buff.source_config_id,
        layer: buff.layer,
        duration_ms: buff.duration,
        create_time_ms: buff.create_time,
        received_time_ms: buff.received_time_ms,
        host_uid: buff.host_uid,
        source_uid: buff.source_uid,
    }
}

pub fn to_active_factor_buff_state(buff: &ObservedFactorBuff) -> ActiveFactorBuffState {
    ActiveFactorBuffState {
        factor_buff_id: buff.factor_buff_id,
        observed_buff_id: buff.observed_buff_id,
        buff_level: buff.buff_level,
        part_id: buff.part_id,
        count: buff.count,
        fight_source_type: buff.fight_source_type,
        source_config_id: buff.source_config_id,
        layer: buff.layer,
        duration_ms: buff.duration,
        create_time_ms: buff.create_time,
        received_time_ms: buff.received_time_ms,
        host_uid: buff.host_uid,
        source_uid: buff.source_uid,
    }
}

pub fn to_active_effect_buff_state(buff: &ObservedEffectBuff) -> ActiveEffectBuffState {
    ActiveEffectBuffState {
        effect_source_buff_id: buff.effect_source_buff_id,
        observed_buff_id: buff.observed_buff_id,
        buff_level: buff.buff_level,
        part_id: buff.part_id,
        count: buff.count,
        fight_source_type: buff.fight_source_type,
        source_config_id: buff.source_config_id,
        layer: buff.layer,
        duration_ms: buff.duration,
        create_time_ms: buff.create_time,
        received_time_ms: buff.received_time_ms,
        host_uid: buff.host_uid,
        source_uid: buff.source_uid,
    }
}

pub fn to_modifier_window_state(window: &ObservedModifierWindow) -> ModifierWindowState {
    ModifierWindowState {
        buff_uuid: window.buff_uuid,
        base_id: window.base_id,
        buff_level: window.buff_level,
        part_id: window.part_id,
        count: window.count,
        fight_source_type: window.fight_source_type,
        source_config_id: window.source_config_id,
        layer: window.layer,
        duration_ms: window.duration,
        start_time_ms: window.start_time_ms,
        end_time_ms: window.end_time_ms,
        host_uid: window.host_uid,
        source_uid: window.source_uid,
    }
}

pub fn to_modifier_hit_bucket_state(bucket: &ObservedModifierHitBucket) -> ModifierHitBucketState {
    ModifierHitBucketState {
        modifier_buff_uuid: bucket.modifier_buff_uuid,
        modifier_base_id: bucket.modifier_base_id,
        modifier_buff_level: bucket.modifier_buff_level,
        modifier_part_id: bucket.modifier_part_id,
        modifier_count: bucket.modifier_count,
        modifier_fight_source_type: bucket.modifier_fight_source_type,
        modifier_source_config_id: bucket.modifier_source_config_id,
        modifier_layer: bucket.modifier_layer,
        modifier_duration_ms: bucket.modifier_duration,
        modifier_start_time_ms: bucket.modifier_start_time_ms,
        modifier_end_time_ms: bucket.modifier_end_time_ms,
        modifier_host_uid: bucket.modifier_host_uid,
        modifier_source_uid: bucket.modifier_source_uid,
        skill_key: bucket.skill_key,
        damage_id: bucket.damage_id,
        owner_id: bucket.owner_id,
        owner_level: bucket.owner_level,
        hit_event_id: bucket.hit_event_id,
        damage_source: bucket.damage_source,
        property: bucket.property,
        damage_mode: bucket.damage_mode,
        attacker_uid: bucket.attacker_uid,
        original_attacker_uid: bucket.original_attacker_uid,
        top_summoner_uid: bucket.top_summoner_uid,
        target_uid: bucket.target_uid,
        target_monster_type_id: bucket.target_monster_type_id,
        is_heal: bucket.is_heal,
        hits: bucket.hits,
        total_value: bucket.total_value,
        effective_total_value: bucket.effective_total_value,
        crit_hits: bucket.crit_hits,
        crit_total_value: bucket.crit_total_value,
        lucky_hits: bucket.lucky_hits,
        lucky_total_value: bucket.lucky_total_value,
        hp_loss_total: bucket.hp_loss_total,
        shield_loss_total: bucket.shield_loss_total,
        first_hit_time_ms: bucket.first_hit_time_ms,
        last_hit_time_ms: bucket.last_hit_time_ms,
    }
}

pub fn to_modifier_replay_attr_state(attr: &ObservedFormulaAttr) -> ModifierReplayAttrState {
    ModifierReplayAttrState {
        attr_id: attr.attr_id,
        value_int: attr.value_int,
        value_float: attr.value_float,
        value_bool: attr.value_bool,
    }
}

pub fn to_modifier_replay_source_state(
    source: &ObservedModifierReplaySource,
) -> ModifierReplaySourceState {
    ModifierReplaySourceState {
        modifier_base_id: source.modifier_base_id,
        modifier_source_config_id: source.modifier_source_config_id,
        modifier_buff_level: source.modifier_buff_level,
        modifier_count: source.modifier_count,
        modifier_layer: source.modifier_layer,
        modifier_host_uid: source.modifier_host_uid,
        modifier_source_uid: source.modifier_source_uid,
    }
}

pub fn to_modifier_replay_hit_state(hit: &ObservedModifierReplayHit) -> ModifierReplayHitState {
    ModifierReplayHitState {
        timestamp_ms: hit.timestamp_ms,
        skill_key: hit.skill_key,
        damage_id: hit.damage_id,
        owner_id: hit.owner_id,
        owner_level: hit.owner_level,
        hit_event_id: hit.hit_event_id,
        damage_source: hit.damage_source,
        property: hit.property,
        damage_mode: hit.damage_mode,
        attacker_uid: hit.attacker_uid,
        original_attacker_uid: hit.original_attacker_uid,
        top_summoner_uid: hit.top_summoner_uid,
        target_uid: hit.target_uid,
        target_monster_type_id: hit.target_monster_type_id,
        is_heal: hit.is_heal,
        is_crit: hit.is_crit,
        is_lucky: hit.is_lucky,
        value: hit.value,
        effective_value: hit.effective_value,
        hp_loss_value: hit.hp_loss_value,
        shield_loss_value: hit.shield_loss_value,
        active_modifiers: hit
            .active_modifiers
            .iter()
            .map(to_modifier_replay_source_state)
            .collect(),
        attacker_attrs: hit
            .attacker_attrs
            .iter()
            .map(to_modifier_replay_attr_state)
            .collect(),
        target_attrs: hit
            .target_attrs
            .iter()
            .map(to_modifier_replay_attr_state)
            .collect(),
    }
}

pub fn to_skill_cast_event_state(event: &ObservedSkillCastEvent) -> SkillCastEventState {
    SkillCastEventState {
        timestamp_ms: event.timestamp_ms,
        skill_id: event.skill_id,
        source: event.source.clone(),
    }
}

pub fn to_skill_cooldown_event_state(
    event: &ObservedSkillCooldownEvent,
) -> SkillCooldownEventState {
    SkillCooldownEventState {
        timestamp_ms: event.timestamp_ms,
        skill_level_id: event.skill_level_id,
        skill_id: event.skill_id,
        begin_time: event.begin_time,
        duration: event.duration,
        calculated_duration: event.calculated_duration,
        cd_accelerate_rate: event.cd_accelerate_rate,
        skill_cd_type: event.skill_cd_type,
        valid_cd_time: event.valid_cd_time,
        attr_skill_cd: event.attr_skill_cd,
        attr_skill_cd_pct: event.attr_skill_cd_pct,
        attr_cd_accelerate_pct: event.attr_cd_accelerate_pct,
    }
}

pub fn to_active_effect_source_state(source: &ObservedEffectSource) -> ActiveEffectSourceState {
    ActiveEffectSourceState {
        source_id: source.source_id.clone(),
        runtime_source: source.runtime_source.clone(),
        source_entity_id: source.source_entity_id,
        node_id: source.node_id,
        node_level: source.node_level,
        slot: source.slot,
    }
}

pub fn to_active_factor_item_state(item: &ObservedFactorItem) -> ActiveFactorItemState {
    ActiveFactorItemState {
        factor_buff_id: item.factor_buff_id,
        item_config_id: item.item_config_id,
        item_uuid: item.item_uuid,
        package_key: item.package_key,
        package_type: item.package_type,
        grade: item.grade,
        family_id: item.family_id,
        runtime_source: item.runtime_source.clone(),
        selector_path: item.selector_path.clone(),
        selector_signature: item.selector_signature.clone(),
        selector_offset: item.selector_offset,
    }
}

pub fn to_active_passive_skill_state(skill: &ObservedPassiveSkill) -> ActivePassiveSkillState {
    ActivePassiveSkillState {
        passive_uuid: skill.passive_uuid,
        target_uid: skill.target_uid,
        stage_begin_time: skill.stage_begin_time,
        begin_time: skill.begin_time,
        stage_play_num: skill.stage_play_num,
        skill_id: skill.skill_id,
        skill_level: skill.skill_level,
        skill_stage: skill.skill_stage,
        runtime_source: skill.runtime_source.clone(),
    }
}

pub fn to_active_profession_skill_state(
    skill: &ObservedProfessionSkill,
) -> ActiveProfessionSkillState {
    ActiveProfessionSkillState {
        skill_id: skill.skill_id,
        base_skill_id: skill.base_skill_id,
        skill_level_id: skill.skill_level_id,
        level: skill.level,
        remodel_level: skill.remodel_level,
        slot: skill.slot,
        equipped: skill.equipped,
        source_kind: skill.source_kind.clone(),
        replace_skill_ids: skill.replace_skill_ids.clone(),
        runtime_source: skill.runtime_source.clone(),
    }
}

pub fn to_active_profession_talent_state(
    talent: &ObservedProfessionTalent,
) -> ActiveProfessionTalentState {
    ActiveProfessionTalentState {
        profession_id: talent.profession_id,
        talent_node_id: talent.talent_node_id,
        used_talent_points: talent.used_talent_points,
        talent_stage_cfg_id: talent.talent_stage_cfg_id,
        runtime_source: talent.runtime_source.clone(),
    }
}

pub fn build_per_target_stats(
    stats_by_skill_target: &HashMap<(i64, i64), SkillTargetStats>,
    totals_by_target: Option<&HashMap<i64, u128>>,
) -> Vec<PerTargetStats> {
    let mut grouped = HashMap::<i64, PerTargetStats>::new();

    for (&(skill_id, target_uid), stats) in stats_by_skill_target {
        let entry = grouped.entry(target_uid).or_insert_with(|| PerTargetStats {
            target_uid,
            target_name: stats
                .monster_name
                .clone()
                .unwrap_or_else(|| format!("#{}", target_uid)),
            total_value: 0,
            damage: RawCombatStats::default(),
            skills: HashMap::new(),
        });

        if entry.target_name.starts_with('#') && stats.monster_name.is_some() {
            entry.target_name = stats.monster_name.clone().unwrap_or_default();
        }

        entry.skills.insert(
            skill_id,
            RawSkillStats {
                total_value: stats.total_value,
                effective_total_value: stats.effective_total_value,
                hits: stats.hits,
                crit_hits: stats.crit_hits,
                crit_total_value: stats.crit_total,
                lucky_hits: stats.lucky_hits,
                lucky_total_value: stats.lucky_total,
                property: None,
                damage_mode: None,
            },
        );
        entry.total_value += stats.total_value;
        entry.damage.total += stats.total_value;
        entry.damage.effective_total += stats.effective_total_value;
        entry.damage.hits += stats.hits;
        entry.damage.crit_hits += stats.crit_hits;
        entry.damage.crit_total += stats.crit_total;
        entry.damage.lucky_hits += stats.lucky_hits;
        entry.damage.lucky_total += stats.lucky_total;
    }

    if let Some(totals) = totals_by_target {
        for (target_uid, target_total) in totals {
            if let Some(entry) = grouped.get_mut(target_uid) {
                entry.total_value = *target_total;
            }
        }
    }

    let mut rows: Vec<PerTargetStats> = grouped.into_values().collect();
    rows.sort_by(|a, b| b.total_value.cmp(&a.total_value));
    rows
}

pub fn build_per_target_summary_stats(
    stats_by_skill_target: &HashMap<(i64, i64), SkillTargetStats>,
    totals_by_target: Option<&HashMap<i64, u128>>,
) -> Vec<PerTargetStats> {
    let mut grouped = HashMap::<i64, PerTargetStats>::new();

    for (&(_, target_uid), stats) in stats_by_skill_target {
        let entry = grouped.entry(target_uid).or_insert_with(|| PerTargetStats {
            target_uid,
            target_name: stats
                .monster_name
                .clone()
                .unwrap_or_else(|| format!("#{}", target_uid)),
            total_value: 0,
            damage: RawCombatStats::default(),
            skills: HashMap::new(),
        });

        if entry.target_name.starts_with('#') && stats.monster_name.is_some() {
            entry.target_name = stats.monster_name.clone().unwrap_or_default();
        }

        entry.total_value += stats.total_value;
        entry.damage.total += stats.total_value;
        entry.damage.effective_total += stats.effective_total_value;
        entry.damage.hits += stats.hits;
        entry.damage.crit_hits += stats.crit_hits;
        entry.damage.crit_total += stats.crit_total;
        entry.damage.lucky_hits += stats.lucky_hits;
        entry.damage.lucky_total += stats.lucky_total;
    }

    if let Some(totals) = totals_by_target {
        for (target_uid, target_total) in totals {
            let entry = grouped
                .entry(*target_uid)
                .or_insert_with(|| PerTargetStats {
                    target_uid: *target_uid,
                    target_name: format!("#{}", target_uid),
                    total_value: 0,
                    damage: RawCombatStats::default(),
                    skills: HashMap::new(),
                });
            entry.total_value = *target_total;
            entry.damage.total = *target_total;
        }
    }

    let mut rows: Vec<PerTargetStats> = grouped.into_values().collect();
    rows.sort_by(|a, b| b.total_value.cmp(&a.total_value));
    rows
}

/// Represents a skill cooldown state.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCdState {
    /// The skill level ID.
    pub skill_level_id: i32,
    /// The cooldown begin timestamp
    pub begin_time: i64,
    /// The total duration of the cooldown in milliseconds.
    /// -1 indicates a charge/resource style entry.
    pub duration: i32,
    /// The cooldown type enum value
    pub skill_cd_type: i32,
    /// The server-reported valid cooldown time in milliseconds.
    pub valid_cd_time: i32,
    /// Local timestamp when this cooldown state was received
    pub received_at: i64,
    /// Cooldown duration after applying AttrSkillCD/AttrSkillCDPCT and TempAttr rules.
    pub calculated_duration: i32,
    /// Cooldown accelerate rate for this skill
    pub cd_accelerate_rate: f32,
}

/// Represents a buff update state.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffUpdateState {
    pub base_id: i32,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
    pub source_config_id: Option<i32>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffUpdatePayload {
    pub buffs: Vec<BuffUpdateState>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BossBuffUpdatePayload {
    pub boss_buffs: HashMap<i64, Vec<BuffUpdateState>>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HateEntry {
    pub uid: i64,
    pub hate_val: u32,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HateListUpdatePayload {
    pub hate_lists: HashMap<i64, Vec<HateEntry>>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntityNameMapPayload {
    pub names: HashMap<i64, String>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdentityMapPayload {
    pub player_names: HashMap<i64, String>,
    pub monster_ids: HashMap<i64, i32>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CounterUpdateState {
    pub rule_id: i32,
    pub slots: Vec<SlotUpdateState>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SlotUpdateState {
    pub slot_id: i32,
    pub current_count: u32,
    pub threshold: Option<u32>,
    pub effective_threshold: Option<u32>,
    pub is_counting: bool,
    pub reset_buff_active: bool,
    pub freeze_until_ms: Option<i64>,
    pub freeze_duration_ms: Option<u64>,
    pub effective_freeze_duration_ms: Option<u64>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffCounterUpdatePayload {
    pub counters: Vec<CounterUpdateState>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCdUpdatePayload {
    pub skill_cds: Vec<SkillCdState>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelAttrState {
    pub attr_id: i32,
    pub value: i32,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelAttrUpdatePayload {
    pub attrs: Vec<PanelAttrState>,
}

/// A single shield entry parsed from attr 60050.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShieldDetailEntry {
    pub buff_uuid: i64,
    pub display_type: i32,
    pub current: i64,
    pub initial_shield: i64,
    pub max_shield: i64,
    pub base_id: i32,
    pub expire_time_ms: i64,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShieldDetailUpdatePayload {
    pub current_hp: i64,
    pub max_hp: i64,
    pub entries: Vec<ShieldDetailEntry>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceEntry {
    pub id: i32,
    pub value: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceState {
    /// The current resource values keyed by the resource attribute IDs announced by the game.
    pub entries: Vec<FightResourceEntry>,
    /// Local timestamp when this state was received
    pub received_at: i64,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceUpdatePayload {
    pub fight_res: FightResourceState,
}

/// A single damage event recorded in the 2s sliding window used for death replay.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DamageSnapshot {
    pub timestamp_ms: u128,
    pub attacker_uid: i64,
    pub attacker_monster_type_id: Option<i32>,
    pub skill_key: i64,
    pub value: u128,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeathRecord {
    pub victim_uid: i64,
    pub death_timestamp_ms: u128,
    pub recent_damages: Vec<DamageSnapshot>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeathReplayPayload {
    pub records: Vec<DeathRecord>,
}
