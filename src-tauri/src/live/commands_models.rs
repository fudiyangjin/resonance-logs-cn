use crate::live::opcodes_models::SkillTargetStats;
use crate::live::opcodes_models::{CombatStats, Skill};
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
    /// The timestamp of when the fight started, in milliseconds since the Unix epoch.
    pub fight_start_timestamp_ms: u128, // Unix timestamp when fight started
    /// A list of bosses in the encounter.
    pub bosses: Vec<BossHealth>,
    /// The ID of the scene where the encounter took place.
    pub scene_id: Option<i32>,
    /// The name of the scene where the encounter took place.
    pub scene_name: Option<String>,
    /// The current segment type ('boss', 'trash', or null if no segment active).
    pub current_segment_type: Option<String>,
    /// The display name for the current segment (boss name when available).
    pub current_segment_name: Option<String>,
}

/// Represents a raw
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveDataPayload {
    pub elapsed_ms: u128,
    pub fight_start_timestamp_ms: u128,
    pub total_dmg: u128,
    pub total_dmg_boss_only: u128,
    pub total_heal: u128,
    pub local_player_uid: i64,
    pub scene_id: Option<i32>,
    pub scene_name: Option<String>,
    pub is_paused: bool,
    pub bosses: Vec<BossHealth>,
    pub entities: Vec<RawEntityData>,
    pub current_segment_type: Option<String>,
    pub current_segment_name: Option<String>,
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
    pub active_dmg_time_ms: u128,
    pub dmg_skills: HashMap<i64, RawSkillStats>,
    pub heal_skills: HashMap<i64, RawSkillStats>,
    pub taken_skills: HashMap<i64, RawSkillStats>,
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
    pub active_dmg_time_ms: u128,
    pub dmg_skills: HashMap<i64, RawSkillStats>,
    pub heal_skills: HashMap<i64, RawSkillStats>,
    pub taken_skills: HashMap<i64, RawSkillStats>,
    pub dmg_per_target: Vec<PerTargetStats>,
    pub heal_per_target: Vec<PerTargetStats>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawCombatStats {
    pub total: u128,
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
    pub hits: u128,
    pub crit_hits: u128,
    pub crit_total_value: u128,
    pub lucky_hits: u128,
    pub lucky_total_value: u128,
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
        hits: skill.hits,
        crit_hits: skill.crit_hits,
        crit_total_value: skill.crit_total_value,
        lucky_hits: skill.lucky_hits,
        lucky_total_value: skill.lucky_total_value,
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
                hits: stats.hits,
                crit_hits: stats.crit_hits,
                crit_total_value: stats.crit_total,
                lucky_hits: stats.lucky_hits,
                lucky_total_value: stats.lucky_total,
            },
        );
        entry.total_value += stats.total_value;
        entry.damage.total += stats.total_value;
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
    pub buff_uuid: i32,
    pub base_id: i32,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub source_config_id: i32,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffDefinition {
    pub base_id: i32,
    pub name: String,
    pub sprite_file: String,
    pub search_keywords: Vec<String>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffNameInfo {
    pub base_id: i32,
    pub name: String,
    pub has_sprite_file: bool,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffUpdatePayload {
    pub buffs: Vec<BuffUpdateState>,
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

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceState {
    /// The full list of resource values
    pub values: Vec<i64>,
    /// Local timestamp when this state was received
    pub received_at: i64,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceUpdatePayload {
    pub fight_res: FightResourceState,
}

#[derive(serde::Deserialize, Debug, Clone)]
pub struct ModuleCalcProgressPayload {
    pub processed: u64,
    pub total: u64,
}
