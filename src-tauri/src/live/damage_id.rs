use log::warn;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::LazyLock;

const SKILL_FIGHT_LEVEL_TABLE_RELATIVE: &str = "meter-data/SkillFightLevelTable.json";

#[derive(Debug, Clone, Deserialize)]
struct RawSkillFightLevelEntry {
    #[serde(rename = "SkillEffectId")]
    skill_effect_id: i32,
}

static SKILL_LEVEL_TO_EFFECT: LazyLock<HashMap<i32, i32>> = LazyLock::new(|| {
    load_skill_level_to_effect_map().unwrap_or_else(|err| {
        warn!(
            "[damage-id] failed to load SkillFightLevelTable.json: {}",
            err
        );
        HashMap::new()
    })
});

fn locate_meter_data_file(relative_path: &str) -> Option<PathBuf> {
    let mut p = PathBuf::from(relative_path);
    if p.exists() {
        return Some(p);
    }

    p = PathBuf::from(format!("src-tauri/{}", relative_path));
    if p.exists() {
        return Some(p);
    }

    if let Ok(mut exe_dir) = std::env::current_exe() {
        exe_dir.pop();
        let candidate = exe_dir.join(relative_path);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

fn load_skill_level_to_effect_map() -> Result<HashMap<i32, i32>, Box<dyn std::error::Error>> {
    let path = locate_meter_data_file(SKILL_FIGHT_LEVEL_TABLE_RELATIVE).ok_or_else(|| {
        format!(
            "{} not found in known locations",
            SKILL_FIGHT_LEVEL_TABLE_RELATIVE
        )
    })?;
    let contents = fs::read_to_string(path)?;
    let raw_map: HashMap<String, RawSkillFightLevelEntry> = serde_json::from_str(&contents)?;

    let mut result = HashMap::new();
    for (key, value) in raw_map {
        if let Ok(skill_level_id) = key.parse::<i32>() {
            result.insert(skill_level_id, value.skill_effect_id);
        }
    }
    Ok(result)
}

fn decimal_digits(value: i32) -> u32 {
    if value < 10 { 1 } else { value.ilog10() + 1 }
}

fn append_decimal_i64(prefix: i64, suffix: i32, min_width: u32) -> Option<i64> {
    let width = decimal_digits(suffix).max(min_width);
    let factor = 10_i64.checked_pow(width)?;
    prefix.checked_mul(factor)?.checked_add(i64::from(suffix))
}

pub fn compute_damage_id(
    damage_source: Option<i32>,
    owner_id: i32,
    owner_level: Option<i32>,
    hit_event_id: Option<i32>,
) -> i64 {
    let owner_level = owner_level.unwrap_or_default().max(0);
    let hit_event_id = hit_event_id.unwrap_or_default().max(0);
    let mut skill_effect_id = owner_id.max(0);
    let damage_type = if let Some(source) = damage_source.filter(|v| *v > 0) {
        if source == 2 { 2 } else { 3 }
    } else {
        let skill_level_id = owner_id
            .checked_mul(100)
            .and_then(|v| v.checked_add(owner_level))
            .unwrap_or(owner_id);
        if let Some(effect_id) = SKILL_LEVEL_TO_EFFECT.get(&skill_level_id) {
            skill_effect_id = *effect_id;
        } else {
            let level_one_skill_id = owner_id
                .checked_mul(100)
                .and_then(|v| v.checked_add(1))
                .unwrap_or(owner_id);
            if let Some(effect_id) = SKILL_LEVEL_TO_EFFECT.get(&level_one_skill_id) {
                skill_effect_id = *effect_id;
            }
        }
        1
    };

    append_decimal_i64(i64::from(damage_type), skill_effect_id, 0)
        .and_then(|prefix| append_decimal_i64(prefix, hit_event_id, 2))
        .unwrap_or_default()
}
