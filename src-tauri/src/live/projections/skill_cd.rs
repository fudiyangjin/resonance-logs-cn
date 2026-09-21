//! Skill cooldown reduction / accelerate calculation.

use log::warn;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::sync::LazyLock;

use crate::live::damage_id::locate_meter_data_file;
use crate::live::ipc::models::SkillCdState;
use crate::live::runtime::events::MonoTimeMs;

const TEMP_ATTR_TABLE_RELATIVE: &str = "meter-data/TempAttrTable.json";
const SKILL_EFFECT_TABLE_RELATIVE: &str = "meter-data/SkillEffectTable.json";
const SKILL_CHARGE_TABLE_RELATIVE: &str = "meter-data/SkillChargeTable.json";
const TAG_NO_CD_REDUCE: i32 = 103;

/// Charge semantics of a skill, keyed by base skill id (`skill_level_id / 100`).
///
/// `max_charges > 1` marks a multi-charge skill whose cooldown refills one
/// charge per `calculated_duration`; `max_valid_cd_time` marks a resource
/// slot (`duration == -1 && cd_type == 1`) that is usable once the server's
/// `valid_cd_time` reaches it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCharge {
    #[serde(default)]
    pub max_charges: Option<u8>,
    #[serde(default)]
    pub max_valid_cd_time: Option<i32>,
}

static SKILL_CHARGES: LazyLock<HashMap<i32, SkillCharge>> = LazyLock::new(|| {
    load_skill_charges().unwrap_or_else(|err| {
        warn!("[skill-cd] failed to load SkillChargeTable.json: {}", err);
        HashMap::new()
    })
});

#[must_use]
pub fn skill_charge(skill_id: i32) -> Option<&'static SkillCharge> {
    SKILL_CHARGES.get(&skill_id)
}

/// When a cooldown entry becomes usable, derived from the server packet plus
/// the local interpolation clock (mirrors the HUD's `computeDisplay`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CooldownReadiness {
    /// Usable at the moment the packet was received.
    pub ready: bool,
    /// The moment the skill turns usable (`None` when it already is, or when
    /// readiness is not time-driven, e.g. resource slots).
    pub ready_deadline: Option<MonoTimeMs>,
    /// Charges available at receipt for multi-charge skills.
    pub charges_available: Option<u8>,
}

/// Readiness of `state` received at `received_mono`.
///
/// Branches, in order (same as the HUD):
/// - resource slot (`duration == -1 && cd_type == 1`): edge only — ready once
///   `valid_cd_time >= max_valid_cd_time`; without a configured maximum the
///   slot is treated as never ready and never announced.
/// - multi-charge (`cd_type == 1 && duration > 0 && max_charges > 1`): the
///   deadline marks the 0 -> 1 charge transition only, so a skill that still
///   has a charge left never re-announces "ready" when the next one refills.
/// - plain cooldown: `calculated_duration <= 0` is ready with no timer,
///   otherwise the remaining scaled time divided by the accelerate factor.
#[must_use]
pub fn ready_deadline(
    state: &SkillCdState,
    received_mono: MonoTimeMs,
    charge: Option<&SkillCharge>,
) -> CooldownReadiness {
    let accelerate = f64::from(state.cd_accelerate_rate).max(0.0);
    let speed = 1.0 + accelerate;
    let base_duration = if state.duration > 0 {
        f64::from(state.duration.max(1))
    } else {
        1.0
    };
    let reduced_duration = if state.duration > 0 {
        f64::from(state.calculated_duration.max(0))
    } else {
        0.0
    };
    let valid_cd_scale = if state.duration > 0 {
        reduced_duration / base_duration
    } else {
        1.0
    };
    let scaled_valid = f64::from(state.valid_cd_time) * valid_cd_scale;
    let deadline_after = |remaining_ms: f64| -> Option<MonoTimeMs> {
        (remaining_ms > 0.0)
            .then(|| received_mono.saturating_add((remaining_ms / speed).ceil() as u64))
    };

    if state.duration == -1 && state.skill_cd_type == 1 {
        let ready = charge
            .and_then(|charge| charge.max_valid_cd_time)
            .is_some_and(|max| max > 0 && state.valid_cd_time >= max);
        return CooldownReadiness {
            ready,
            ready_deadline: None,
            charges_available: None,
        };
    }

    let max_charges = charge
        .and_then(|charge| charge.max_charges)
        .unwrap_or(1)
        .max(1);
    if state.skill_cd_type == 1 && state.duration > 0 && max_charges > 1 {
        let charge_duration = f64::from(state.calculated_duration.max(1));
        let max_vct = f64::from(max_charges) * charge_duration;
        let current_vct = scaled_valid.min(max_vct);
        let charges_available = ((current_vct / charge_duration).floor() as u8).min(max_charges);
        let ready = charges_available >= 1;
        return CooldownReadiness {
            ready,
            ready_deadline: if ready {
                None
            } else {
                deadline_after(charge_duration - current_vct)
            },
            charges_available: Some(charges_available),
        };
    }

    if reduced_duration <= 0.0 {
        return CooldownReadiness {
            ready: true,
            ready_deadline: None,
            charges_available: None,
        };
    }
    let remaining = reduced_duration - scaled_valid;
    CooldownReadiness {
        ready: remaining <= 0.0,
        ready_deadline: deadline_after(remaining),
        charges_available: None,
    }
}

#[derive(Debug, Clone, Deserialize)]
struct RawTempAttrDef {
    #[serde(rename = "Id")]
    id: i32,
    #[serde(rename = "AttrType")]
    attr_type: i32,
    #[serde(rename = "LogicType")]
    logic_type: i32,
    #[serde(rename = "AttrParams", default)]
    attr_params: Vec<i32>,
}

#[derive(Debug, Clone)]
pub struct CdTempAttrDef {
    pub attr_type: i32,
    pub logic_type: i32,
    pub attr_params: Vec<i32>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawSkillEffectEntry {
    #[serde(rename = "Tags", default)]
    tags: Vec<i32>,
}

static CD_TEMP_ATTR_DEFS: LazyLock<HashMap<i32, CdTempAttrDef>> = LazyLock::new(|| {
    load_cd_temp_attr_defs().unwrap_or_else(|err| {
        warn!("[skill-cd] failed to load TempAttrTable.json: {}", err);
        HashMap::new()
    })
});

static SKILL_EFFECT_TAGS: LazyLock<HashMap<i32, Vec<i32>>> = LazyLock::new(|| {
    load_skill_effect_tags().unwrap_or_else(|err| {
        warn!("[skill-cd] failed to load SkillEffectTable.json: {}", err);
        HashMap::new()
    })
});

/// Apply AttrSkillCD / AttrSkillCDPCT / AttrCDAcceleratePCT and matching TempAttr
/// rules to a base cooldown duration.
///
/// Returns `(calculated_duration_ms, accelerate_rate)`.
#[must_use]
pub fn calculate_skill_cd(
    base_cd: f32,
    skill_level_id: i32,
    temp_attr_values: &HashMap<i32, i32>,
    attr_skill_cd: f32,
    attr_skill_cd_pct: f32,
    attr_cd_accelerate_pct: f32,
) -> (f32, f32) {
    calculate_skill_cd_with_tables(
        base_cd,
        skill_level_id,
        temp_attr_values,
        attr_skill_cd,
        attr_skill_cd_pct,
        attr_cd_accelerate_pct,
        &CD_TEMP_ATTR_DEFS,
        &SKILL_EFFECT_TAGS,
    )
}

/// Pure variant that accepts injected table references (for unit tests).
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn calculate_skill_cd_with_tables(
    base_cd: f32,
    skill_level_id: i32,
    temp_attr_values: &HashMap<i32, i32>,
    attr_skill_cd: f32,
    attr_skill_cd_pct: f32,
    attr_cd_accelerate_pct: f32,
    temp_attr_defs: &HashMap<i32, CdTempAttrDef>,
    skill_effect_tags: &HashMap<i32, Vec<i32>>,
) -> (f32, f32) {
    if base_cd <= 0.0 {
        return (0.0, 0.0);
    }

    let skill_id = skill_level_id / 100;
    let tag_lookup_skill_level_id = skill_id * 100 + 1;
    let skill_tags_vec = skill_effect_tags
        .get(&tag_lookup_skill_level_id)
        .cloned()
        .unwrap_or_default();
    let skill_tags: HashSet<i32> = skill_tags_vec.iter().copied().collect();

    if skill_tags.contains(&TAG_NO_CD_REDUCE) {
        return (base_cd.max(0.0), 0.0);
    }

    let mut flat_reduce = attr_skill_cd;
    let mut pct_reduce = attr_skill_cd_pct / 10000.0;
    let mut accelerate = attr_cd_accelerate_pct / 10000.0;

    for (temp_attr_id, value) in temp_attr_values {
        if *value == 0 {
            continue;
        }
        let Some(def) = temp_attr_defs.get(temp_attr_id) else {
            continue;
        };
        if !temp_attr_matches(def, skill_id, &skill_tags) {
            continue;
        }

        match def.attr_type {
            101 => {
                flat_reduce += *value as f32 / 1000.0;
            }
            100 => {
                pct_reduce += *value as f32 / 10000.0;
            }
            103 => {
                accelerate += *value as f32 / 10000.0;
            }
            _ => {}
        }
    }

    let reduced_cd = ((1.0 - pct_reduce) * (base_cd - flat_reduce)).max(0.0);
    (reduced_cd, accelerate)
}

fn temp_attr_matches(def: &CdTempAttrDef, skill_id: i32, skill_tags: &HashSet<i32>) -> bool {
    match def.logic_type {
        0 => true,
        1 => def.attr_params.contains(&skill_id),
        3 => def.attr_params.iter().any(|tag| skill_tags.contains(tag)),
        _ => false,
    }
}

fn load_cd_temp_attr_defs() -> Result<HashMap<i32, CdTempAttrDef>, Box<dyn std::error::Error>> {
    let path = locate_meter_data_file(TEMP_ATTR_TABLE_RELATIVE)
        .ok_or_else(|| format!("{TEMP_ATTR_TABLE_RELATIVE} not found in known locations"))?;
    let contents = fs::read_to_string(path)?;
    let raw_map: HashMap<String, RawTempAttrDef> = serde_json::from_str(&contents)?;

    let mut result = HashMap::new();
    for raw in raw_map.into_values() {
        // 100 = pct reduce, 101 = flat reduce, 103 = accelerate pct
        if raw.attr_type != 100 && raw.attr_type != 101 && raw.attr_type != 103 {
            continue;
        }
        result.insert(
            raw.id,
            CdTempAttrDef {
                attr_type: raw.attr_type,
                logic_type: raw.logic_type,
                attr_params: raw.attr_params,
            },
        );
    }
    Ok(result)
}

fn load_skill_charges() -> Result<HashMap<i32, SkillCharge>, Box<dyn std::error::Error>> {
    let path = locate_meter_data_file(SKILL_CHARGE_TABLE_RELATIVE)
        .ok_or_else(|| format!("{SKILL_CHARGE_TABLE_RELATIVE} not found in known locations"))?;
    let contents = fs::read_to_string(path)?;
    let raw_map: HashMap<String, SkillCharge> = serde_json::from_str(&contents)?;
    Ok(raw_map
        .into_iter()
        .filter_map(|(key, value)| key.parse::<i32>().ok().map(|id| (id, value)))
        .collect())
}

fn load_skill_effect_tags() -> Result<HashMap<i32, Vec<i32>>, Box<dyn std::error::Error>> {
    let path = locate_meter_data_file(SKILL_EFFECT_TABLE_RELATIVE)
        .ok_or_else(|| format!("{SKILL_EFFECT_TABLE_RELATIVE} not found in known locations"))?;
    let contents = fs::read_to_string(path)?;
    let raw_map: HashMap<String, RawSkillEffectEntry> = serde_json::from_str(&contents)?;

    let mut result = HashMap::new();
    for (key, value) in raw_map {
        if let Ok(skill_level_id) = key.parse::<i32>() {
            result.insert(skill_level_id, value.tags);
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_tables() -> (HashMap<i32, CdTempAttrDef>, HashMap<i32, Vec<i32>>) {
        (HashMap::new(), HashMap::new())
    }

    fn cd_state(
        duration: i32,
        cd_type: i32,
        valid: i32,
        calculated: i32,
        rate: f32,
    ) -> SkillCdState {
        SkillCdState {
            skill_level_id: 142_001,
            begin_time: 0,
            duration,
            skill_cd_type: cd_type,
            valid_cd_time: valid,
            received_at: 1_000,
            calculated_duration: calculated,
            cd_accelerate_rate: rate,
            ready_at_ms: None,
            max_charges: None,
            max_valid_cd_time: None,
        }
    }

    const RECEIVED: MonoTimeMs = MonoTimeMs(50_000);

    #[test]
    fn plain_cooldown_deadline_scales_valid_time_and_accelerate() {
        // base 10s reduced to 8s, server says 2.5s already elapsed (scaled to
        // 2s), accelerate 25% -> remaining 6s / 1.25 = 4.8s.
        let readiness = ready_deadline(&cd_state(10_000, 0, 2_500, 8_000, 0.25), RECEIVED, None);
        assert!(!readiness.ready);
        assert_eq!(readiness.ready_deadline, Some(MonoTimeMs(54_800)));
        assert_eq!(readiness.charges_available, None);
    }

    #[test]
    fn plain_cooldown_with_non_positive_duration_is_ready_without_timer() {
        let readiness = ready_deadline(&cd_state(10_000, 0, 0, 0, 0.0), RECEIVED, None);
        assert!(readiness.ready);
        assert_eq!(readiness.ready_deadline, None);

        let elapsed = ready_deadline(&cd_state(10_000, 0, 10_000, 10_000, 0.0), RECEIVED, None);
        assert!(elapsed.ready);
        assert_eq!(elapsed.ready_deadline, None);
    }

    #[test]
    fn resource_slot_is_edge_only() {
        let charge = SkillCharge {
            max_charges: None,
            max_valid_cd_time: Some(10_000),
        };
        let filling = ready_deadline(&cd_state(-1, 1, 4_000, -1, 0.0), RECEIVED, Some(&charge));
        assert!(!filling.ready);
        assert_eq!(filling.ready_deadline, None);

        let full = ready_deadline(&cd_state(-1, 1, 10_000, -1, 0.0), RECEIVED, Some(&charge));
        assert!(full.ready);
        assert_eq!(full.ready_deadline, None);

        // No configured maximum: never announced.
        let unknown = ready_deadline(&cd_state(-1, 1, 10_000, -1, 0.0), RECEIVED, None);
        assert!(!unknown.ready);
        assert_eq!(unknown.ready_deadline, None);
    }

    #[test]
    fn multi_charge_deadline_marks_first_charge_only() {
        let charge = SkillCharge {
            max_charges: Some(2),
            max_valid_cd_time: None,
        };
        // Both charges spent: next charge in 6s at 1x.
        let empty = ready_deadline(&cd_state(6_000, 1, 0, 6_000, 0.0), RECEIVED, Some(&charge));
        assert!(!empty.ready);
        assert_eq!(empty.charges_available, Some(0));
        assert_eq!(empty.ready_deadline, Some(MonoTimeMs(56_000)));

        // One charge left: ready now, and the 1 -> 2 refill sets no deadline.
        let one = ready_deadline(
            &cd_state(6_000, 1, 6_500, 6_000, 0.0),
            RECEIVED,
            Some(&charge),
        );
        assert!(one.ready);
        assert_eq!(one.charges_available, Some(1));
        assert_eq!(one.ready_deadline, None);

        // max_charges <= 1 falls through to the plain branch.
        let single = SkillCharge {
            max_charges: Some(1),
            max_valid_cd_time: None,
        };
        let plain = ready_deadline(&cd_state(6_000, 1, 0, 6_000, 0.0), RECEIVED, Some(&single));
        assert_eq!(plain.charges_available, None);
        assert_eq!(plain.ready_deadline, Some(MonoTimeMs(56_000)));
    }

    #[test]
    fn non_positive_base_cd_returns_zeros() {
        let (defs, tags) = empty_tables();
        let (duration, accelerate) = calculate_skill_cd_with_tables(
            0.0,
            12_301,
            &HashMap::new(),
            100.0,
            1_000.0,
            500.0,
            &defs,
            &tags,
        );
        assert_eq!(duration, 0.0);
        assert_eq!(accelerate, 0.0);
    }

    #[test]
    fn panel_attrs_apply_flat_pct_and_accelerate() {
        let (defs, tags) = empty_tables();
        // flat 1000ms, pct 10% (1000/10000), accelerate 5% (500/10000)
        let (duration, accelerate) = calculate_skill_cd_with_tables(
            10_000.0,
            12_301,
            &HashMap::new(),
            1_000.0,
            1_000.0,
            500.0,
            &defs,
            &tags,
        );
        // (1 - 0.1) * (10000 - 1000) = 8100
        assert!((duration - 8_100.0).abs() < f32::EPSILON);
        assert!((accelerate - 0.05).abs() < f32::EPSILON);
    }

    #[test]
    fn tag_no_cd_reduce_skips_all_reductions() {
        let (defs, mut tags) = empty_tables();
        tags.insert(12_301, vec![TAG_NO_CD_REDUCE]);
        let (duration, accelerate) = calculate_skill_cd_with_tables(
            10_000.0,
            12_301,
            &HashMap::new(),
            1_000.0,
            1_000.0,
            500.0,
            &defs,
            &tags,
        );
        assert!((duration - 10_000.0).abs() < f32::EPSILON);
        assert_eq!(accelerate, 0.0);
    }

    #[test]
    fn logic_type_0_temp_attr_applies_to_all_skills() {
        let (mut defs, tags) = empty_tables();
        defs.insert(
            77,
            CdTempAttrDef {
                attr_type: 100, // pct
                logic_type: 0,
                attr_params: Vec::new(),
            },
        );
        let mut values = HashMap::new();
        values.insert(77, 2_000); // +20%
        let (duration, _) =
            calculate_skill_cd_with_tables(10_000.0, 12_301, &values, 0.0, 0.0, 0.0, &defs, &tags);
        // (1 - 0.2) * 10000 = 8000
        assert!((duration - 8_000.0).abs() < f32::EPSILON);
    }

    #[test]
    fn logic_type_1_temp_attr_matches_skill_id_only() {
        let (mut defs, tags) = empty_tables();
        defs.insert(
            88,
            CdTempAttrDef {
                attr_type: 101, // flat ms (value / 1000)
                logic_type: 1,
                attr_params: vec![123],
            },
        );
        let mut values = HashMap::new();
        values.insert(88, 2_000_000); // 2_000_000/1000 = 2000ms flat

        let (matched, _) = calculate_skill_cd_with_tables(
            10_000.0, 12_301, // skill_id = 123
            &values, 0.0, 0.0, 0.0, &defs, &tags,
        );
        assert!((matched - 8_000.0).abs() < f32::EPSILON);

        let (unmatched, _) = calculate_skill_cd_with_tables(
            10_000.0, 45_601, // skill_id = 456
            &values, 0.0, 0.0, 0.0, &defs, &tags,
        );
        assert!((unmatched - 10_000.0).abs() < f32::EPSILON);
    }

    #[test]
    fn logic_type_3_temp_attr_matches_skill_tags() {
        let (mut defs, mut tags) = empty_tables();
        defs.insert(
            99,
            CdTempAttrDef {
                attr_type: 103, // accelerate
                logic_type: 3,
                attr_params: vec![7],
            },
        );
        tags.insert(12_301, vec![7, 9]);
        let mut values = HashMap::new();
        values.insert(99, 1_500); // 0.15

        let (_, accelerate) =
            calculate_skill_cd_with_tables(10_000.0, 12_301, &values, 0.0, 0.0, 0.0, &defs, &tags);
        assert!((accelerate - 0.15).abs() < f32::EPSILON);
    }
}
