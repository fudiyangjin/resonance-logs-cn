//! Shared hit stat-accounting primitives.

use crate::live::projections::combat::stats::{
    observe_extrema, CombatStats, Skill, SkillTargetStats,
};

/// A single accounting delta shared by all aggregation maps.
///
/// `is_lucky_trigger` is side-dependent: attacker-side maps use
/// `flags.is_attacker_lucky`, taken-side maps use `flags.is_attacked_lucky`.
/// `is_block` is only `true` for taken-side accounting.
#[derive(Debug, Clone, Copy)]
pub struct StatDelta {
    pub value: u128,
    pub effective: u128,
    pub is_crit: bool,
    pub is_lucky_bonus_only: bool,
    pub is_lucky_trigger: bool,
    pub is_block: bool,
}

/// Apply one hit to an entity-level [`CombatStats`] accumulator.
pub fn apply_to_combat_stats(stats: &mut CombatStats, d: &StatDelta) {
    if d.is_crit {
        stats.crit_hits += 1;
        stats.crit_total += d.value;
    }
    if !d.is_lucky_bonus_only {
        stats.trigger_hits += 1;
        if d.is_lucky_trigger {
            stats.lucky_hits += 1;
        }
        if d.is_block {
            stats.block_hits += 1;
            if d.is_lucky_trigger {
                stats.lucky_block_hits += 1;
            }
        }
    } else {
        stats.lucky_total += d.value;
    }
    stats.hits += 1;
    stats.total += d.value;
    stats.effective_total += d.effective;
}

/// Apply one hit to a per-skill [`Skill`] accumulator.
///
/// `property` / `damage_mode` are only recorded on first observation and are
/// passed as `None` by paths that historically never set them.
pub fn apply_to_skill(
    skill: &mut Skill,
    d: &StatDelta,
    property: Option<i32>,
    damage_mode: Option<i32>,
) {
    if skill.property.is_none() {
        skill.property = property;
    }
    if skill.damage_mode.is_none() {
        skill.damage_mode = damage_mode;
    }
    if d.is_crit {
        skill.crit_hits += 1;
        skill.crit_total_value += d.value;
    }
    if !d.is_lucky_bonus_only {
        skill.trigger_hits += 1;
        if d.is_lucky_trigger {
            skill.lucky_hits += 1;
        }
        if d.is_block {
            skill.block_hits += 1;
            if d.is_lucky_trigger {
                skill.lucky_block_hits += 1;
            }
        }
    } else {
        skill.lucky_total_value += d.value;
    }
    skill.hits += 1;
    skill.total_value += d.value;
    skill.effective_total_value += d.effective;
    observe_extrema(&mut skill.extrema, d.value);
}

/// Apply one hit to a per-skill-per-target [`SkillTargetStats`] accumulator.
/// hp/shield loss totals and `target_monster_id` are handled by the caller.
pub fn apply_to_target_stats(stats: &mut SkillTargetStats, d: &StatDelta) {
    stats.hits += 1;
    stats.total_value += d.value;
    stats.effective_total_value += d.effective;
    if d.is_crit {
        stats.crit_hits += 1;
        stats.crit_total += d.value;
    }
    if !d.is_lucky_bonus_only {
        stats.trigger_hits += 1;
        if d.is_lucky_trigger {
            stats.lucky_hits += 1;
        }
    } else {
        stats.lucky_total += d.value;
    }
}
