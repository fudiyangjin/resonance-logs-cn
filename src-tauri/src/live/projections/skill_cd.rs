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

/// The charges of one cooldown packet over time, interpolated on the
/// monotonic clock with the HUD's `computeDisplay` math: how many charges
/// are usable at receipt, and when each missing charge refills. A plain
/// cooldown is a one-charge timeline.
///
/// Branches, in order (same as the HUD):
/// - resource slot (`duration == -1 && cd_type == 1`): one charge, usable
///   once `valid_cd_time >= max_valid_cd_time`. Only a new packet moves it,
///   and without a configured maximum it never becomes usable.
/// - multi-charge (`cd_type == 1 && duration > 0 && max_charges > 1`):
///   `valid_cd_time` is the charge pool, one charge per
///   `calculated_duration`.
/// - plain cooldown: `calculated_duration <= 0` is usable with no timer,
///   otherwise the remaining scaled time runs at the accelerate factor.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CooldownTimeline {
    anchor: MonoTimeMs,
    /// Charges usable at `anchor`.
    charges: u8,
    capacity: u8,
    /// `None` when only a new packet can add charges.
    refill: Option<RefillRate>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct RefillRate {
    /// Scaled cooldown progress at the anchor.
    progress_ms: f64,
    /// Scaled cooldown per charge.
    charge_ms: f64,
    /// Scaled cooldown elapsed per real millisecond (`1 + accelerate`).
    speed: f64,
}

impl CooldownTimeline {
    /// Timeline of `state` received at `received_mono`.
    #[must_use]
    pub fn new(
        state: &SkillCdState,
        received_mono: MonoTimeMs,
        charge: Option<&SkillCharge>,
    ) -> Self {
        let speed = 1.0 + f64::from(state.cd_accelerate_rate).max(0.0);
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

        if state.duration == -1 && state.skill_cd_type == 1 {
            let full = charge
                .and_then(|charge| charge.max_valid_cd_time)
                .is_some_and(|max| max > 0 && state.valid_cd_time >= max);
            return Self::packet_driven(received_mono, u8::from(full));
        }

        let max_charges = charge
            .and_then(|charge| charge.max_charges)
            .unwrap_or(1)
            .max(1);
        if state.skill_cd_type == 1 && state.duration > 0 && max_charges > 1 {
            let charge_ms = f64::from(state.calculated_duration.max(1));
            let progress_ms = scaled_valid.min(f64::from(max_charges) * charge_ms);
            return Self::time_driven(received_mono, max_charges, progress_ms, charge_ms, speed);
        }

        if reduced_duration <= 0.0 {
            return Self::packet_driven(received_mono, 1);
        }
        Self::time_driven(received_mono, 1, scaled_valid, reduced_duration, speed)
    }

    fn packet_driven(anchor: MonoTimeMs, charges: u8) -> Self {
        Self {
            anchor,
            charges,
            capacity: 1,
            refill: None,
        }
    }

    fn time_driven(
        anchor: MonoTimeMs,
        capacity: u8,
        progress_ms: f64,
        charge_ms: f64,
        speed: f64,
    ) -> Self {
        Self {
            anchor,
            charges: ((progress_ms / charge_ms).floor() as u8).min(capacity),
            capacity,
            refill: Some(RefillRate {
                progress_ms,
                charge_ms,
                speed,
            }),
        }
    }

    /// Moments the missing charges refill, earliest first. Each one is
    /// computed on its own, so rounding never accumulates.
    fn refills(self) -> impl Iterator<Item = MonoTimeMs> {
        let Self {
            anchor,
            charges,
            capacity,
            refill,
        } = self;
        refill.into_iter().flat_map(move |rate| {
            (charges.saturating_add(1)..=capacity).map(move |level| {
                let remaining_ms = f64::from(level) * rate.charge_ms - rate.progress_ms;
                anchor.saturating_add((remaining_ms / rate.speed).ceil() as u64)
            })
        })
    }

    /// Charges usable at `now`.
    #[must_use]
    pub fn charges_at(self, now: MonoTimeMs) -> u8 {
        self.refills()
            .take_while(|at| *at <= now)
            .fold(self.charges, |charges, _| charges.saturating_add(1))
    }

    /// The first refill strictly after `now`, if a charge is still missing
    /// then.
    #[must_use]
    pub fn next_refill_after(self, now: MonoTimeMs) -> Option<MonoTimeMs> {
        self.refills().find(|at| *at > now)
    }

    /// When the skill becomes usable again (`None` when it is usable at
    /// receipt, or when only a new packet can make it usable).
    #[must_use]
    pub fn ready_at(self) -> Option<MonoTimeMs> {
        if self.charges > 0 {
            return None;
        }
        self.refills().next()
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

    const TWO_CHARGES: SkillCharge = SkillCharge {
        max_charges: Some(2),
        max_valid_cd_time: None,
    };

    fn at(offset_ms: u64) -> MonoTimeMs {
        MonoTimeMs(RECEIVED.0 + offset_ms)
    }

    #[test]
    fn plain_cooldown_refill_scales_valid_time_and_accelerate() {
        // base 10s reduced to 8s, server says 2.5s already elapsed (scaled to
        // 2s), accelerate 25% -> remaining 6s / 1.25 = 4.8s.
        let timeline =
            CooldownTimeline::new(&cd_state(10_000, 0, 2_500, 8_000, 0.25), RECEIVED, None);
        assert_eq!(timeline.charges_at(RECEIVED), 0);
        assert_eq!(timeline.ready_at(), Some(at(4_800)));
        assert_eq!(timeline.next_refill_after(RECEIVED), Some(at(4_800)));
        assert_eq!(timeline.charges_at(at(4_800)), 1);
        assert_eq!(timeline.next_refill_after(at(4_800)), None);
    }

    #[test]
    fn plain_cooldown_with_non_positive_duration_is_ready_without_timer() {
        let timeline = CooldownTimeline::new(&cd_state(10_000, 0, 0, 0, 0.0), RECEIVED, None);
        assert_eq!(timeline.charges_at(RECEIVED), 1);
        assert_eq!(timeline.ready_at(), None);
        assert_eq!(timeline.next_refill_after(RECEIVED), None);

        let elapsed =
            CooldownTimeline::new(&cd_state(10_000, 0, 10_000, 10_000, 0.0), RECEIVED, None);
        assert_eq!(elapsed.charges_at(RECEIVED), 1);
        assert_eq!(elapsed.ready_at(), None);
    }

    #[test]
    fn resource_slot_only_moves_with_packets() {
        let charge = SkillCharge {
            max_charges: None,
            max_valid_cd_time: Some(10_000),
        };
        let filling =
            CooldownTimeline::new(&cd_state(-1, 1, 4_000, -1, 0.0), RECEIVED, Some(&charge));
        assert_eq!(filling.charges_at(at(60_000)), 0);
        assert_eq!(filling.next_refill_after(RECEIVED), None);
        assert_eq!(filling.ready_at(), None);

        let full =
            CooldownTimeline::new(&cd_state(-1, 1, 10_000, -1, 0.0), RECEIVED, Some(&charge));
        assert_eq!(full.charges_at(RECEIVED), 1);

        // No configured maximum: never usable, so never announced.
        let unknown = CooldownTimeline::new(&cd_state(-1, 1, 10_000, -1, 0.0), RECEIVED, None);
        assert_eq!(unknown.charges_at(at(60_000)), 0);
    }

    #[test]
    fn multi_charge_refills_every_missing_charge() {
        // Capture 1790300898228, skill 1420: the second cast came 5 522 ms
        // after the first, leaving a 5 522 ms pool at 30 000 ms per charge.
        let empty = CooldownTimeline::new(
            &cd_state(30_000, 1, 5_522, 30_000, 0.0),
            RECEIVED,
            Some(&TWO_CHARGES),
        );
        assert_eq!(empty.charges_at(RECEIVED), 0);
        assert_eq!(empty.ready_at(), Some(at(24_478)));
        assert_eq!(empty.next_refill_after(RECEIVED), Some(at(24_478)));
        assert_eq!(empty.charges_at(at(24_478)), 1);
        assert_eq!(empty.next_refill_after(at(24_478)), Some(at(54_478)));
        assert_eq!(empty.charges_at(at(54_478)), 2);
        assert_eq!(empty.next_refill_after(at(54_478)), None);

        // The first cast from full leaves one charge and refills the other.
        let one = CooldownTimeline::new(
            &cd_state(30_000, 1, 30_000, 30_000, 0.0),
            RECEIVED,
            Some(&TWO_CHARGES),
        );
        assert_eq!(one.charges_at(RECEIVED), 1);
        assert_eq!(one.ready_at(), None);
        assert_eq!(one.next_refill_after(RECEIVED), Some(at(30_000)));

        // max_charges <= 1 falls through to the plain branch.
        let single = SkillCharge {
            max_charges: Some(1),
            max_valid_cd_time: None,
        };
        let plain =
            CooldownTimeline::new(&cd_state(6_000, 1, 0, 6_000, 0.0), RECEIVED, Some(&single));
        assert_eq!(plain.next_refill_after(RECEIVED), Some(at(6_000)));
        assert_eq!(plain.charges_at(at(6_000)), 1);
    }

    #[test]
    fn charges_at_and_next_refill_agree_at_boundaries() {
        let three = SkillCharge {
            max_charges: Some(3),
            max_valid_cd_time: None,
        };
        // Reduced to 90% with 30% accelerate: fractional refill offsets.
        let timeline = CooldownTimeline::new(
            &cd_state(7_000, 1, 1_234, 6_300, 0.3),
            RECEIVED,
            Some(&three),
        );
        let mut now = RECEIVED;
        let mut charges = timeline.charges_at(now);
        while let Some(refill) = timeline.next_refill_after(now) {
            assert_eq!(timeline.charges_at(MonoTimeMs(refill.0 - 1)), charges);
            charges += 1;
            assert_eq!(timeline.charges_at(refill), charges);
            now = refill;
        }
        assert_eq!(charges, 3);
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
