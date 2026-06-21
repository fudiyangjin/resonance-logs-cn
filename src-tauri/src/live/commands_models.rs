use crate::live::opcodes_models::SkillTargetStats;
use crate::live::opcodes_models::{CombatStats, Skill};
use crate::live::opcodes_models::{
    DamageSnapshot as RuntimeDamageSnapshot, DeathRecord as RuntimeDeathRecord,
};
use crate::live::training_dummy::TrainingDummyPhase;
use std::collections::HashMap;

/// Represents the health of a boss.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BossHealth {
    /// The unique entity UUID of the boss, serialized as a string for JS safety.
    pub entity_uuid: String,
    /// Monster template ID used by the frontend to resolve the display name.
    pub monster_id: Option<i32>,
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
    /// Dungeon difficulty suffix for the current scene, when available.
    pub dungeon_difficulty: Option<i32>,
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
    pub local_player_uuid: String,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
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
    pub entity_uuid: String,
    pub display_uid: i64,
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
    pub taken_per_source: Vec<PerSourceStats>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntityData {
    pub entity_uuid: String,
    pub display_uid: i64,
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
    pub taken_per_source: Vec<PerSourceStats>,
    pub dmg_per_target: Vec<PerTargetStats>,
    pub heal_per_target: Vec<PerTargetStats>,
    pub deaths: Vec<DeathRecord>,
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
    pub trigger_hits: u128,
    pub block_hits: u128,
    pub lucky_block_hits: u128,
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
    pub trigger_hits: u128,
    pub block_hits: u128,
    pub lucky_block_hits: u128,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerTargetStats {
    pub target_entity_uuid: String,
    pub target_display_uid: i64,
    pub target_monster_id: Option<i32>,
    pub total_value: u128,
    pub damage: RawCombatStats,
    pub skills: HashMap<i64, RawSkillStats>,
}

/// Damage taken by a defender, aggregated by the attacking monster's template.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerSourceStats {
    /// Monster template id of the attacker. None when the source was unknown.
    pub source_monster_id: Option<i32>,
    pub total_value: u128,
    pub taken: RawCombatStats,
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
        trigger_hits: stats.trigger_hits,
        block_hits: stats.block_hits,
        lucky_block_hits: stats.lucky_block_hits,
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
        trigger_hits: skill.trigger_hits,
        block_hits: skill.block_hits,
        lucky_block_hits: skill.lucky_block_hits,
    }
}

pub fn build_per_target_stats(
    stats_by_skill_target: &HashMap<(i64, i64), SkillTargetStats>,
    totals_by_target: Option<&HashMap<i64, u128>>,
) -> Vec<PerTargetStats> {
    let mut grouped = HashMap::<i64, PerTargetStats>::new();

    for (&(skill_id, target_entity_uuid), stats) in stats_by_skill_target {
        let entry = grouped
            .entry(target_entity_uuid)
            .or_insert_with(|| PerTargetStats {
                target_entity_uuid: target_entity_uuid.to_string(),
                target_display_uid: crate::live::entity_id::uid_from_uuid(target_entity_uuid),
                target_monster_id: stats.target_monster_id,
                total_value: 0,
                damage: RawCombatStats::default(),
                skills: HashMap::new(),
            });

        if entry.target_monster_id.is_none() && stats.target_monster_id.is_some() {
            entry.target_monster_id = stats.target_monster_id;
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
                trigger_hits: stats.trigger_hits,
                block_hits: 0,
                lucky_block_hits: 0,
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
        entry.damage.trigger_hits += stats.trigger_hits;
    }

    if let Some(totals) = totals_by_target {
        for (target_entity_uuid, target_total) in totals {
            if let Some(entry) = grouped.get_mut(target_entity_uuid) {
                entry.total_value = *target_total;
            }
        }
    }

    let mut rows: Vec<PerTargetStats> = grouped.into_values().collect();
    rows.sort_by(|a, b| b.total_value.cmp(&a.total_value));
    rows
}

/// Group a defender's per-(skill, source) taken skills into per-source rows.
///
/// The map key's second element is the attacker's monster template id, where 0
/// represents an unknown source (mapped to `None` in the output). Rows are
/// sorted by total taken value, descending.
pub fn build_taken_per_source(by_skill_source: &HashMap<(i64, i32), Skill>) -> Vec<PerSourceStats> {
    let mut grouped = HashMap::<i32, PerSourceStats>::new();

    for (&(skill_id, source_monster_id), skill) in by_skill_source {
        let entry = grouped
            .entry(source_monster_id)
            .or_insert_with(|| PerSourceStats {
                source_monster_id: (source_monster_id != 0).then_some(source_monster_id),
                total_value: 0,
                taken: RawCombatStats::default(),
                skills: HashMap::new(),
            });

        entry.skills.insert(skill_id, to_raw_skill_stats(skill));

        entry.total_value += skill.total_value;
        entry.taken.total += skill.total_value;
        entry.taken.effective_total += skill.effective_total_value;
        entry.taken.hits += skill.hits;
        entry.taken.crit_hits += skill.crit_hits;
        entry.taken.crit_total += skill.crit_total_value;
        entry.taken.lucky_hits += skill.lucky_hits;
        entry.taken.lucky_total += skill.lucky_total_value;
        entry.taken.trigger_hits += skill.trigger_hits;
        entry.taken.block_hits += skill.block_hits;
        entry.taken.lucky_block_hits += skill.lucky_block_hits;
    }

    let mut rows: Vec<PerSourceStats> = grouped.into_values().collect();
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
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffUpdatePayload {
    pub buffs: Vec<BuffUpdateState>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BossBuffUpdatePayload {
    pub boss_buffs: HashMap<String, Vec<BuffUpdateState>>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeammateBuffUpdatePayload {
    pub teammate_buffs: HashMap<String, Vec<BuffUpdateState>>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BossDbmEvent {
    pub skill_effect_id: i32,
    pub base_skill_id: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub insertion: i32,
    pub server_timestamp_ms: Option<i64>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BossDbmUpdatePayload {
    pub events: Vec<BossDbmEvent>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeammateFantasyState {
    pub summon_uuid: String,
    pub summoner_uuid: String,
    pub summoner_name: Option<String>,
    pub monster_id: i32,
    pub remodel_level: i64,
    pub detected_at_ms: i64,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeammateFantasyUpdatePayload {
    pub fantasies: Vec<TeammateFantasyState>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HateEntry {
    pub entity_uuid: String,
    pub hate_val: u32,
}

/// Classification of an entity rendered on the minimap.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MinimapEntityKind {
    /// The local player.
    Local,
    /// A teammate (party member that is not the local player).
    Teammate,
    /// A boss-tier monster.
    Boss,
    /// Any other monster.
    Monster,
    /// A non-monster dummy/mechanic helper entity.
    Dummy,
    /// Other renderable non-character entities.
    Other,
}

/// Raw entity type exposed to the minimap as a reusable fact.
#[derive(
    specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default,
)]
#[serde(rename_all = "camelCase")]
pub enum MinimapEntityType {
    #[default]
    Unknown,
    Monster,
    Npc,
    SceneObject,
    Zone,
    Bullet,
    ClientBullet,
    Pet,
    Char,
    Dummy,
    Drop,
    Field,
    Trap,
    Collection,
    StaticObject,
    Vehicle,
    Toy,
    CommunityHouse,
    HouseItem,
    Other,
}

/// A single active buff fact currently known to the minimap.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapBuffFact {
    /// Entity UUID carrying this buff.
    pub target_entity_uuid: String,
    /// Runtime buff instance id.
    pub buff_uuid: i32,
    /// Buff template id.
    pub base_id: i32,
    /// Current stack/layer.
    pub layer: i32,
    /// Buff creation time in the local time domain (server_clock_offset applied).
    pub create_time_ms: i64,
    /// Buff duration in milliseconds (0 if unknown/permanent).
    pub duration_ms: i32,
    /// Runtime source/caster entity when the server includes it.
    pub fire_uuid: Option<String>,
    /// Skill/buff config id that caused this buff, when available.
    pub source_config_id: Option<i32>,
}

/// A single entity fact rendered/interpreted by the 2D minimap overlay.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapEntity {
    /// Entity UUID as string (avoids JS bigint truncation, matching existing convention).
    pub entity_uuid: String,
    /// Raw entity type normalized for frontend use.
    pub entity_type: MinimapEntityType,
    /// What the entity is, used by the frontend to pick color/size.
    pub kind: MinimapEntityKind,
    /// Horizontal map coordinate.
    pub x: f32,
    /// Vertical game coordinate.
    pub y: f32,
    /// Depth map coordinate (game `z`, not vertical height).
    pub z: f32,
    /// Display name when known.
    pub name: Option<String>,
    /// Monster template id when the entity is a monster.
    pub monster_id: Option<i32>,
    /// Yaw facing in degrees when known (attr 0x32, stored as centidegrees).
    pub facing: Option<f32>,
    /// Whether the entity is currently in the dead actor state.
    pub is_dead: bool,
    /// Top-level summoner/owner UUID when present.
    pub top_summoner_id: Option<String>,
}

/// One monster skill cast event observed from `ATTR_SKILL_ID` (attribute 100).
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapSkillCast {
    /// Entity UUID that emitted the skill cast.
    pub entity_uuid: String,
    /// Skill template id.
    pub skill_id: i32,
    /// Local receive time in milliseconds.
    pub time_ms: i64,
    /// World X position of the caster at cast time, when known.
    pub x: Option<f32>,
    /// World Z position of the caster at cast time, when known.
    pub z: Option<f32>,
    /// Yaw facing in degrees at cast time, when known.
    pub facing: Option<f32>,
}

/// One frame of minimap data for a single scene.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapSnapshot {
    /// Current scene id.
    pub scene_id: i32,
    /// Local player UUID for frontend grouping and display.
    pub local_player_uuid: String,
    /// All tracked entities that currently have a known position.
    pub entities: Vec<MinimapEntity>,
    /// Active buff facts selected by the scene/mechanic extraction config.
    pub buffs: Vec<MinimapBuffFact>,
}

/// Event payload wrapping a [`MinimapSnapshot`] for the minimap overlay window.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MinimapUpdatePayload {
    pub snapshot: Option<MinimapSnapshot>,
    pub skill_casts: Vec<MinimapSkillCast>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HateListUpdatePayload {
    pub hate_lists: HashMap<String, Vec<HateEntry>>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdentityMapPayload {
    pub player_names: HashMap<String, String>,
    pub monster_ids: HashMap<String, i32>,
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
pub struct SeasonCultivateFactorCounterUpdatePayload {
    pub source_item_ids: Vec<i32>,
    pub slot_item_ids: Vec<i32>,
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
    /// Current shield value (field 3)
    pub current: i64,
    /// Initial shield value when the buff was applied (field 4)
    pub initial_shield: i64,
    /// Max shield value (field 5)
    pub max_shield: i64,
    /// Base ID of the buff (from buff monitor lookup), 0 if unknown
    pub base_id: i32,
    /// Local-clock expiry timestamp in ms, 0 if unknown or permanent
    pub expire_time_ms: i64,
}

/// Payload for shield detail update event.
///
/// HP is duplicated here (rather than relying on `panel-attr-update` for
/// attrs 11310/11320) so the shield detail overlay works even when the user
/// has not enabled HP panel attrs.
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
    /// The full list of fight resource id/value pairs
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
    /// Absolute timestamp in milliseconds since UNIX epoch.
    pub timestamp_ms: u128,
    /// Attacker entity UUID, serialized as a string for JS safety. None for unknown sources.
    pub attacker_entity_uuid: Option<String>,
    /// Monster type id of the attacker, if the attacker is a monster. None otherwise.
    pub attacker_monster_type_id: Option<i32>,
    /// Skill key produced by `damage_id::compute_damage_id`.
    pub skill_key: i64,
    /// Raw damage value.
    pub value: u128,
}

/// A death replay record, capturing the damage taken within the window leading up to a death.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeathRecord {
    pub victim_entity_uuid: String,
    pub death_timestamp_ms: u128,
    /// Damage snapshots in chronological order (oldest first).
    pub recent_damages: Vec<DamageSnapshot>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeathReplayPayload {
    pub records: Vec<DeathRecord>,
}

pub fn to_damage_snapshot(snapshot: &RuntimeDamageSnapshot) -> DamageSnapshot {
    DamageSnapshot {
        timestamp_ms: snapshot.timestamp_ms,
        attacker_entity_uuid: snapshot.attacker_entity_uuid.map(|uuid| uuid.to_string()),
        attacker_monster_type_id: snapshot.attacker_monster_type_id,
        skill_key: snapshot.skill_key,
        value: snapshot.value,
    }
}

pub fn to_death_record(record: &RuntimeDeathRecord) -> DeathRecord {
    DeathRecord {
        victim_entity_uuid: record.victim_entity_uuid.to_string(),
        death_timestamp_ms: record.death_timestamp_ms,
        recent_damages: record
            .recent_damages
            .iter()
            .map(to_damage_snapshot)
            .collect(),
    }
}
