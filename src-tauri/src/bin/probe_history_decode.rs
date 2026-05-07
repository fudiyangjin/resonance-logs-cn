use blueprotobuf_lib::blueprotobuf::EEntityType;
use diesel::prelude::*;
use diesel::sql_types::{Binary, Integer};
use resonance_logs_lib::live::opcodes_models::class::ClassSpec;
use resonance_logs_lib::live::opcodes_models::{
    AttrType, AttrValue, CombatStats, Entity, ObservedEffectBuff, ObservedEffectSource,
    ObservedFactorBuff, ObservedFactorItem, Skill, SkillTargetStats,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(QueryableByName)]
struct EncounterDataRow {
    #[diesel(sql_type = Integer)]
    encounter_id: i32,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct EntityActiveFieldsBeforeMonsterWithItems {
    name: String,
    entity_type: EEntityType,
    class_id: i32,
    class_spec: ClassSpec,
    ability_score: i32,
    level: i32,
    #[serde(default)]
    monster_name_packet: Option<String>,
    #[serde(default)]
    _legacy_attributes: HashMap<AttrType, AttrValue>,
    damage: CombatStats,
    skill_uid_to_dmg_skill: HashMap<i64, Skill>,
    damage_boss_only: CombatStats,
    healing: CombatStats,
    skill_uid_to_heal_skill: HashMap<i64, Skill>,
    taken: CombatStats,
    skill_uid_to_taken_skill: HashMap<i64, Skill>,
    #[serde(default)]
    active_factor_buffs: Vec<ObservedFactorBuff>,
    #[serde(default)]
    active_effect_buffs: Vec<ObservedEffectBuff>,
    #[serde(default)]
    active_effect_sources: Vec<ObservedEffectSource>,
    #[serde(default)]
    active_factor_items: Vec<ObservedFactorItem>,
    monster_type_id: Option<i32>,
    dmg_to_target: HashMap<i64, u128>,
    skill_dmg_to_target: HashMap<(i64, i64), SkillTargetStats>,
    skill_heal_to_target: HashMap<(i64, i64), SkillTargetStats>,
    season_strength: i32,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct EntityActiveFieldsBeforeMonsterNoItems {
    name: String,
    entity_type: EEntityType,
    class_id: i32,
    class_spec: ClassSpec,
    ability_score: i32,
    level: i32,
    #[serde(default)]
    monster_name_packet: Option<String>,
    #[serde(default)]
    _legacy_attributes: HashMap<AttrType, AttrValue>,
    damage: CombatStats,
    skill_uid_to_dmg_skill: HashMap<i64, Skill>,
    damage_boss_only: CombatStats,
    healing: CombatStats,
    skill_uid_to_heal_skill: HashMap<i64, Skill>,
    taken: CombatStats,
    skill_uid_to_taken_skill: HashMap<i64, Skill>,
    #[serde(default)]
    active_factor_buffs: Vec<ObservedFactorBuff>,
    #[serde(default)]
    active_effect_buffs: Vec<ObservedEffectBuff>,
    #[serde(default)]
    active_effect_sources: Vec<ObservedEffectSource>,
    monster_type_id: Option<i32>,
    dmg_to_target: HashMap<i64, u128>,
    skill_dmg_to_target: HashMap<(i64, i64), SkillTargetStats>,
    skill_heal_to_target: HashMap<(i64, i64), SkillTargetStats>,
    season_strength: i32,
}

fn default_db_path() -> PathBuf {
    if let Some(mut dir) = dirs::data_local_dir() {
        dir.push("resonance-logs-global");
        dir.join("resonance-logs-global.db")
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("resonance-logs-global.db")
    }
}

fn can_decode(bytes: &[u8]) -> Result<&'static str, String> {
    match rmp_serde::from_slice::<HashMap<i64, Entity>>(bytes) {
        Ok(_) => Ok("current"),
        Err(primary_error) => {
            if rmp_serde::from_slice::<HashMap<i64, EntityActiveFieldsBeforeMonsterWithItems>>(
                bytes,
            )
            .is_ok()
            {
                return Ok("active-fields-before-monster-with-items");
            }
            if rmp_serde::from_slice::<HashMap<i64, EntityActiveFieldsBeforeMonsterNoItems>>(bytes)
                .is_ok()
            {
                return Ok("active-fields-before-monster-no-items");
            }
            Err(primary_error.to_string())
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(default_db_path);
    let mut conn = diesel::sqlite::SqliteConnection::establish(&db_path.to_string_lossy())?;
    let rows: Vec<EncounterDataRow> = diesel::sql_query(
        "SELECT encounter_id, data FROM encounter_data ORDER BY encounter_id DESC",
    )
    .load(&mut conn)?;

    let mut decoded = 0usize;
    let mut decoded_by_layout = HashMap::<&'static str, usize>::new();
    let mut failures = Vec::new();
    for row in rows {
        let decompressed = zstd::decode_all(&row.data[..])?;
        match can_decode(&decompressed) {
            Ok(layout) => {
                decoded += 1;
                *decoded_by_layout.entry(layout).or_default() += 1;
            }
            Err(err) => failures.push((row.encounter_id, err.to_string())),
        }
    }

    println!(
        "{}",
        serde_json::json!({
            "source": "probe_history_decode",
            "database_path": db_path,
            "decoded_encounters": decoded,
            "decoded_by_layout": decoded_by_layout,
            "failures": failures,
        })
    );
    Ok(())
}
