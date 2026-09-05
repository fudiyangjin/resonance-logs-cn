//! Pure, allocation-light combat aggregation shared by live and history paths.

use std::collections::HashMap;

use crate::live::projections::combat::hit_event::{
    apply_to_combat_stats, apply_to_skill, apply_to_target_stats, StatDelta,
};
use crate::live::projections::combat::stats::class::{get_class_spec_from_skill_id, ClassSpec};
use crate::live::projections::combat::stats::{
    damage_type_flag, merge_extrema, CombatStats, Skill, SkillTargetStats,
};
use crate::live::runtime::events::{DomainHit, EntityKind, HitKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum CombatMetric {
    Damage,
    Healing,
    DamageTaken,
}

/// Compact semantic flags used by both the runtime and the persisted hit form.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct CombatHitFlags(u8);

impl CombatHitFlags {
    pub const CRITICAL: u8 = 1 << 0;
    pub const BLOCKED: u8 = 1 << 1;
    pub const ATTACKER_LUCKY: u8 = 1 << 2;
    pub const DEFENDER_LUCKY: u8 = 1 << 3;
    pub const LUCKY_BONUS_ONLY: u8 = 1 << 4;
    const KNOWN: u8 = Self::CRITICAL
        | Self::BLOCKED
        | Self::ATTACKER_LUCKY
        | Self::DEFENDER_LUCKY
        | Self::LUCKY_BONUS_ONLY;

    #[must_use]
    pub const fn from_bits(bits: u8) -> Self {
        Self(bits & Self::KNOWN)
    }

    #[must_use]
    pub const fn bits(self) -> u8 {
        self.0
    }

    #[must_use]
    pub fn from_domain(type_flags: i32, is_lucky_bonus_only: bool) -> Self {
        let mut bits = 0;
        if type_flags & damage_type_flag::CRIT != 0 {
            bits |= Self::CRITICAL;
        }
        if type_flags & damage_type_flag::BLOCK != 0 {
            bits |= Self::BLOCKED;
        }
        if type_flags & damage_type_flag::ATTACKER_LUCK != 0 {
            bits |= Self::ATTACKER_LUCKY;
        }
        if type_flags & damage_type_flag::ATTACKED_LUCK != 0 {
            bits |= Self::DEFENDER_LUCKY;
        }
        if is_lucky_bonus_only {
            bits |= Self::LUCKY_BONUS_ONLY;
        }
        Self(bits)
    }

    #[must_use]
    pub const fn is_critical(self) -> bool {
        self.0 & Self::CRITICAL != 0
    }

    #[must_use]
    pub const fn is_blocked(self) -> bool {
        self.0 & Self::BLOCKED != 0
    }

    #[must_use]
    pub const fn is_attacker_lucky(self) -> bool {
        self.0 & Self::ATTACKER_LUCKY != 0
    }

    #[must_use]
    pub const fn is_defender_lucky(self) -> bool {
        self.0 & Self::DEFENDER_LUCKY != 0
    }

    #[must_use]
    pub const fn is_lucky_bonus_only(self) -> bool {
        self.0 & Self::LUCKY_BONUS_ONLY != 0
    }
}

/// Canonical, projection-ready form of one accepted combat hit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CombatHitFact {
    pub metric: CombatMetric,
    /// Entity credited by this metric: outgoing owner or damage-taken target.
    pub actor_entity_id: i64,
    pub source_entity_id: Option<i64>,
    pub target_entity_id: i64,
    pub source_monster_id: Option<i32>,
    pub target_monster_id: Option<i32>,
    pub target_is_boss: bool,
    pub skill_key: i64,
    pub base_skill_id: Option<i32>,
    pub amount: u128,
    pub effective_amount: u128,
    pub has_loss_breakdown: bool,
    pub hp_loss: u128,
    pub shield_loss: u128,
    pub flags: CombatHitFlags,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
}

impl CombatHitFact {
    /// Normalize the established live accounting branches exactly once.
    #[must_use]
    pub fn from_domain(hit: &DomainHit) -> Option<Self> {
        let source_entity_id = hit
            .resolved_owner
            .or(hit.source)
            .map(|entity| entity.uuid.0);
        let (metric, actor_entity_id, amount, effective_amount) = if hit.source_is_player {
            let actor_entity_id = source_entity_id?;
            match hit.kind {
                HitKind::Damage => (CombatMetric::Damage, actor_entity_id, hit.amount, 0),
                HitKind::Healing => (
                    CombatMetric::Healing,
                    actor_entity_id,
                    hit.amount,
                    hit.effective_amount.unwrap_or_default(),
                ),
            }
        } else if hit.kind == HitKind::Damage && hit.target_kind == EntityKind::Character {
            let amount = if hit.has_loss_breakdown {
                hit.hp_loss.saturating_add(hit.shield_loss)
            } else {
                hit.amount
            };
            (CombatMetric::DamageTaken, hit.target.uuid.0, amount, 0)
        } else {
            return None;
        };

        Some(Self {
            metric,
            actor_entity_id,
            source_entity_id,
            target_entity_id: hit.target.uuid.0,
            source_monster_id: hit.source_monster_id,
            target_monster_id: hit.target_monster_id,
            target_is_boss: hit.target_is_boss,
            skill_key: hit.skill_key,
            base_skill_id: hit.skill_id,
            amount,
            effective_amount,
            has_loss_breakdown: hit.has_loss_breakdown,
            hp_loss: hit.hp_loss,
            shield_loss: hit.shield_loss,
            flags: CombatHitFlags::from_domain(hit.type_flags, hit.is_lucky_bonus_only),
            property: hit.property,
            damage_mode: hit.damage_mode,
        })
    }

    #[must_use]
    #[inline]
    pub fn stat_delta(&self) -> StatDelta {
        StatDelta {
            value: self.amount,
            effective: match self.metric {
                CombatMetric::Healing => self.effective_amount,
                CombatMetric::Damage | CombatMetric::DamageTaken => 0,
            },
            is_crit: self.flags.is_critical(),
            is_lucky_bonus_only: self.flags.is_lucky_bonus_only(),
            is_lucky_trigger: match self.metric {
                CombatMetric::Damage | CombatMetric::Healing => self.flags.is_attacker_lucky(),
                CombatMetric::DamageTaken => self.flags.is_defender_lucky(),
            },
            is_block: self.metric == CombatMetric::DamageTaken && self.flags.is_blocked(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CombatTotals {
    pub damage: u128,
    pub boss_damage: u128,
    pub healing: u128,
    pub effective_healing: u128,
    pub damage_taken: u128,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CombatantStats {
    pub class_spec: ClassSpec,
    pub damage: CombatStats,
    pub damage_boss_only: CombatStats,
    pub healing: CombatStats,
    pub taken: CombatStats,
    pub damage_skills: HashMap<i64, Skill>,
    pub healing_skills: HashMap<i64, Skill>,
    pub taken_skills: HashMap<i64, Skill>,
    pub damage_targets: HashMap<i64, CombatTargetStats>,
    pub healing_targets: HashMap<i64, CombatTargetStats>,
    pub taken_sources: HashMap<Option<i32>, CombatSourceStats>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CombatTargetStats {
    pub is_boss: bool,
    pub stats: SkillTargetStats,
    pub skills: HashMap<i64, SkillTargetStats>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CombatSourceStats {
    pub stats: CombatStats,
    pub skills: HashMap<i64, Skill>,
}

impl CombatantStats {
    fn observe_base_skill(&mut self, base_skill_id: Option<i32>) {
        let Some(base_skill_id) = base_skill_id else {
            return;
        };
        let class_spec = get_class_spec_from_skill_id(base_skill_id);
        if class_spec != ClassSpec::Unknown {
            self.class_spec = class_spec;
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CombatAccumulator {
    pub totals: CombatTotals,
    pub entities: HashMap<i64, CombatantStats>,
    saturated: bool,
}

impl CombatAccumulator {
    #[must_use]
    pub const fn is_saturated(&self) -> bool {
        self.saturated
    }

    /// Apply one canonical fact. Returns whether this hit saturated any field.
    pub fn apply(&mut self, hit: &CombatHitFact) -> bool {
        let mut saturated = false;
        let delta = hit.stat_delta();

        match hit.metric {
            CombatMetric::Damage => {
                saturated |= add_saturating(&mut self.totals.damage, hit.amount);
                if hit.target_is_boss {
                    saturated |= add_saturating(&mut self.totals.boss_damage, hit.amount);
                }

                let combatant = self.entities.entry(hit.actor_entity_id).or_default();
                combatant.observe_base_skill(hit.base_skill_id);
                saturated |= apply_combat_stats_saturating(&mut combatant.damage, &delta);
                saturated |= apply_skill_saturating(
                    combatant.damage_skills.entry(hit.skill_key).or_default(),
                    &delta,
                    hit.property,
                    hit.damage_mode,
                );
                if hit.target_is_boss {
                    saturated |=
                        apply_combat_stats_saturating(&mut combatant.damage_boss_only, &delta);
                }
                saturated |= apply_target_breakdown(
                    combatant
                        .damage_targets
                        .entry(hit.target_entity_id)
                        .or_default(),
                    hit,
                    &delta,
                );
            }
            CombatMetric::Healing => {
                saturated |= add_saturating(&mut self.totals.healing, hit.amount);
                saturated |=
                    add_saturating(&mut self.totals.effective_healing, hit.effective_amount);

                let combatant = self.entities.entry(hit.actor_entity_id).or_default();
                combatant.observe_base_skill(hit.base_skill_id);
                saturated |= apply_combat_stats_saturating(&mut combatant.healing, &delta);
                saturated |= apply_skill_saturating(
                    combatant.healing_skills.entry(hit.skill_key).or_default(),
                    &delta,
                    hit.property,
                    hit.damage_mode,
                );
                saturated |= apply_target_breakdown(
                    combatant
                        .healing_targets
                        .entry(hit.target_entity_id)
                        .or_default(),
                    hit,
                    &delta,
                );
            }
            CombatMetric::DamageTaken => {
                saturated |= add_saturating(&mut self.totals.damage_taken, hit.amount);

                let combatant = self.entities.entry(hit.actor_entity_id).or_default();
                saturated |= apply_combat_stats_saturating(&mut combatant.taken, &delta);
                saturated |= apply_skill_saturating(
                    combatant.taken_skills.entry(hit.skill_key).or_default(),
                    &delta,
                    hit.property,
                    hit.damage_mode,
                );
                let source = combatant
                    .taken_sources
                    .entry(hit.source_monster_id)
                    .or_default();
                saturated |= apply_combat_stats_saturating(&mut source.stats, &delta);
                saturated |= apply_skill_saturating(
                    source.skills.entry(hit.skill_key).or_default(),
                    &delta,
                    hit.property,
                    hit.damage_mode,
                );
            }
        }

        self.saturated |= saturated;
        saturated
    }
}

fn apply_target_breakdown(
    target: &mut CombatTargetStats,
    hit: &CombatHitFact,
    delta: &StatDelta,
) -> bool {
    let mut saturated = apply_target_stats_saturating(&mut target.stats, delta);
    if hit.metric == CombatMetric::Damage {
        saturated |= add_saturating(&mut target.stats.hp_loss_total, hit.hp_loss);
        saturated |= add_saturating(&mut target.stats.shield_loss_total, hit.shield_loss);
    }
    target.stats.target_monster_id = target.stats.target_monster_id.or(hit.target_monster_id);
    target.is_boss |= hit.target_is_boss;

    let skill = target.skills.entry(hit.skill_key).or_default();
    saturated |= apply_target_stats_saturating(skill, delta);
    if hit.metric == CombatMetric::Damage {
        saturated |= add_saturating(&mut skill.hp_loss_total, hit.hp_loss);
        saturated |= add_saturating(&mut skill.shield_loss_total, hit.shield_loss);
    }
    skill.target_monster_id = skill.target_monster_id.or(hit.target_monster_id);
    saturated
}

fn apply_combat_stats_saturating(stats: &mut CombatStats, delta: &StatDelta) -> bool {
    if combat_stats_can_apply(stats, delta) {
        apply_to_combat_stats(stats, delta);
        return false;
    }

    let mut increment = CombatStats::default();
    apply_to_combat_stats(&mut increment, delta);

    let mut saturated = false;
    saturated |= add_saturating(&mut stats.total, increment.total);
    saturated |= add_saturating(&mut stats.effective_total, increment.effective_total);
    saturated |= add_saturating(&mut stats.crit_total, increment.crit_total);
    saturated |= add_saturating(&mut stats.crit_hits, increment.crit_hits);
    saturated |= add_saturating(&mut stats.lucky_total, increment.lucky_total);
    saturated |= add_saturating(&mut stats.lucky_hits, increment.lucky_hits);
    saturated |= add_saturating(&mut stats.hits, increment.hits);
    saturated |= add_saturating(&mut stats.trigger_hits, increment.trigger_hits);
    saturated |= add_saturating(&mut stats.block_hits, increment.block_hits);
    saturated |= add_saturating(&mut stats.lucky_block_hits, increment.lucky_block_hits);
    saturated
}

fn apply_skill_saturating(
    skill: &mut Skill,
    delta: &StatDelta,
    property: Option<i32>,
    damage_mode: Option<i32>,
) -> bool {
    if skill_can_apply(skill, delta) {
        apply_to_skill(skill, delta, property, damage_mode);
        return false;
    }

    let mut increment = Skill::default();
    apply_to_skill(&mut increment, delta, property, damage_mode);

    if skill.property.is_none() {
        skill.property = increment.property;
    }
    if skill.damage_mode.is_none() {
        skill.damage_mode = increment.damage_mode;
    }

    let mut saturated = false;
    saturated |= add_saturating(&mut skill.total_value, increment.total_value);
    saturated |= add_saturating(
        &mut skill.effective_total_value,
        increment.effective_total_value,
    );
    saturated |= add_saturating(&mut skill.crit_total_value, increment.crit_total_value);
    saturated |= add_saturating(&mut skill.crit_hits, increment.crit_hits);
    saturated |= add_saturating(&mut skill.lucky_total_value, increment.lucky_total_value);
    saturated |= add_saturating(&mut skill.lucky_hits, increment.lucky_hits);
    saturated |= add_saturating(&mut skill.hits, increment.hits);
    saturated |= add_saturating(&mut skill.trigger_hits, increment.trigger_hits);
    saturated |= add_saturating(&mut skill.block_hits, increment.block_hits);
    saturated |= add_saturating(&mut skill.lucky_block_hits, increment.lucky_block_hits);
    merge_extrema(&mut skill.extrema, increment.extrema);
    saturated
}

fn apply_target_stats_saturating(stats: &mut SkillTargetStats, delta: &StatDelta) -> bool {
    if target_stats_can_apply(stats, delta) {
        apply_to_target_stats(stats, delta);
        return false;
    }

    let mut increment = SkillTargetStats::default();
    apply_to_target_stats(&mut increment, delta);

    let mut saturated = false;
    saturated |= add_saturating(&mut stats.hits, increment.hits);
    saturated |= add_saturating(&mut stats.total_value, increment.total_value);
    saturated |= add_saturating(
        &mut stats.effective_total_value,
        increment.effective_total_value,
    );
    saturated |= add_saturating(&mut stats.crit_hits, increment.crit_hits);
    saturated |= add_saturating(&mut stats.lucky_hits, increment.lucky_hits);
    saturated |= add_saturating(&mut stats.crit_total, increment.crit_total);
    saturated |= add_saturating(&mut stats.lucky_total, increment.lucky_total);
    saturated |= add_saturating(&mut stats.trigger_hits, increment.trigger_hits);
    saturated
}

#[inline]
fn combat_stats_can_apply(stats: &CombatStats, delta: &StatDelta) -> bool {
    can_add(stats.total, delta.value)
        && can_add(stats.effective_total, delta.effective)
        && can_add(stats.hits, 1)
        && (!delta.is_crit
            || (can_add(stats.crit_hits, 1) && can_add(stats.crit_total, delta.value)))
        && if delta.is_lucky_bonus_only {
            can_add(stats.lucky_total, delta.value)
        } else {
            can_add(stats.trigger_hits, 1)
                && (!delta.is_lucky_trigger || can_add(stats.lucky_hits, 1))
                && (!delta.is_block
                    || (can_add(stats.block_hits, 1)
                        && (!delta.is_lucky_trigger || can_add(stats.lucky_block_hits, 1))))
        }
}

#[inline]
fn skill_can_apply(skill: &Skill, delta: &StatDelta) -> bool {
    can_add(skill.total_value, delta.value)
        && can_add(skill.effective_total_value, delta.effective)
        && can_add(skill.hits, 1)
        && (!delta.is_crit
            || (can_add(skill.crit_hits, 1) && can_add(skill.crit_total_value, delta.value)))
        && if delta.is_lucky_bonus_only {
            can_add(skill.lucky_total_value, delta.value)
        } else {
            can_add(skill.trigger_hits, 1)
                && (!delta.is_lucky_trigger || can_add(skill.lucky_hits, 1))
                && (!delta.is_block
                    || (can_add(skill.block_hits, 1)
                        && (!delta.is_lucky_trigger || can_add(skill.lucky_block_hits, 1))))
        }
}

#[inline]
fn target_stats_can_apply(stats: &SkillTargetStats, delta: &StatDelta) -> bool {
    can_add(stats.total_value, delta.value)
        && can_add(stats.effective_total_value, delta.effective)
        && can_add(stats.hits, 1)
        && (!delta.is_crit
            || (can_add(stats.crit_hits, 1) && can_add(stats.crit_total, delta.value)))
        && if delta.is_lucky_bonus_only {
            can_add(stats.lucky_total, delta.value)
        } else {
            can_add(stats.trigger_hits, 1)
                && (!delta.is_lucky_trigger || can_add(stats.lucky_hits, 1))
        }
}

#[inline]
const fn can_add(current: u128, value: u128) -> bool {
    current <= u128::MAX - value
}

#[inline]
fn add_saturating(target: &mut u128, value: u128) -> bool {
    let (sum, overflowed) = target.overflowing_add(value);
    *target = if overflowed { u128::MAX } else { sum };
    overflowed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::projections::combat::stats::HitExtrema;
    use crate::live::runtime::events::{EntityRef, EntityUuid, HitChannel};

    fn entity(uuid: i64) -> EntityRef {
        EntityRef {
            uuid: EntityUuid(uuid),
            generation: 0,
        }
    }

    fn hit(source_is_player: bool, kind: HitKind) -> DomainHit {
        DomainHit {
            channel: HitChannel::ToMe,
            source: Some(entity(10)),
            packet_owner: None,
            resolved_owner: None,
            target: entity(20),
            source_kind: Some(if source_is_player {
                EntityKind::Character
            } else {
                EntityKind::Monster
            }),
            target_kind: if source_is_player {
                EntityKind::Monster
            } else {
                EntityKind::Character
            },
            source_monster_id: (!source_is_player).then_some(9_001),
            target_monster_id: source_is_player.then_some(30_001),
            target_is_boss: source_is_player,
            source_is_player,
            source_is_local_player: source_is_player,
            skill_key: 17_140_101,
            skill_id: Some(1_714),
            type_flags: 0,
            kind,
            amount: 100,
            has_loss_breakdown: true,
            hp_loss: 80,
            shield_loss: 20,
            is_lucky_bonus_only: false,
            property: Some(1),
            damage_mode: Some(2),
            effective_amount: (kind == HitKind::Healing).then_some(40),
        }
    }

    #[test]
    fn domain_normalization_is_table_driven() {
        assert_eq!(
            CombatHitFlags::from_bits(u8::MAX).bits(),
            CombatHitFlags::CRITICAL
                | CombatHitFlags::BLOCKED
                | CombatHitFlags::ATTACKER_LUCKY
                | CombatHitFlags::DEFENDER_LUCKY
                | CombatHitFlags::LUCKY_BONUS_ONLY
        );

        let player_damage = hit(true, HitKind::Damage);
        let player_healing = hit(true, HitKind::Healing);

        let mut taken = hit(false, HitKind::Damage);
        taken.amount = 999;
        taken.hp_loss = 60;
        taken.shield_loss = 40;
        taken.type_flags = damage_type_flag::BLOCK | damage_type_flag::ATTACKED_LUCK;

        let mut lucky_bonus = hit(true, HitKind::Damage);
        lucky_bonus.is_lucky_bonus_only = true;

        let mut resolved_owner = hit(true, HitKind::Damage);
        resolved_owner.source = Some(entity(11));
        resolved_owner.resolved_owner = Some(entity(10));

        let mut unrelated = hit(false, HitKind::Damage);
        unrelated.target_kind = EntityKind::Monster;

        let mut missing_source = hit(true, HitKind::Damage);
        missing_source.source = None;

        let cases = [
            (
                "player damage",
                player_damage,
                Some((CombatMetric::Damage, 10, 100)),
            ),
            (
                "player healing",
                player_healing,
                Some((CombatMetric::Healing, 10, 100)),
            ),
            (
                "taken loss breakdown",
                taken,
                Some((CombatMetric::DamageTaken, 20, 100)),
            ),
            (
                "lucky bonus",
                lucky_bonus,
                Some((CombatMetric::Damage, 10, 100)),
            ),
            (
                "resolved owner",
                resolved_owner,
                Some((CombatMetric::Damage, 10, 100)),
            ),
            ("unrelated hit", unrelated, None),
            ("missing player source", missing_source, None),
        ];

        for (name, domain, expected) in cases {
            let fact = CombatHitFact::from_domain(&domain);
            assert_eq!(
                fact.map(|fact| (fact.metric, fact.actor_entity_id, fact.amount)),
                expected,
                "{name}"
            );
            if name == "player healing" {
                assert_eq!(fact.expect(name).effective_amount, 40);
            }
            if name == "lucky bonus" {
                assert!(fact.expect(name).flags.is_lucky_bonus_only());
            }
            if name == "resolved owner" {
                assert_eq!(fact.expect(name).source_entity_id, Some(10));
            }
            if name == "taken loss breakdown" {
                let fact = fact.expect(name);
                assert!(fact.flags.is_blocked());
                assert!(fact.flags.is_defender_lucky());
            }
        }
    }

    #[test]
    fn apply_updates_all_requested_dimensions() {
        let mut damage = hit(true, HitKind::Damage);
        damage.type_flags = damage_type_flag::CRIT | damage_type_flag::ATTACKER_LUCK;

        let mut lucky_bonus = hit(true, HitKind::Damage);
        lucky_bonus.amount = 20;
        lucky_bonus.hp_loss = 20;
        lucky_bonus.shield_loss = 0;
        lucky_bonus.is_lucky_bonus_only = true;

        let mut healing = hit(true, HitKind::Healing);
        healing.skill_key = 24_060_101;
        healing.skill_id = Some(2_406);
        healing.amount = 80;
        healing.effective_amount = Some(50);
        healing.target_is_boss = false;

        let mut taken = hit(false, HitKind::Damage);
        taken.amount = 999;
        taken.hp_loss = 60;
        taken.shield_loss = 40;
        taken.type_flags =
            damage_type_flag::CRIT | damage_type_flag::BLOCK | damage_type_flag::ATTACKED_LUCK;

        let mut owner_damage = hit(true, HitKind::Damage);
        owner_damage.source = Some(entity(11));
        owner_damage.resolved_owner = Some(entity(10));
        owner_damage.skill_key = 99;
        owner_damage.skill_id = None;
        owner_damage.amount = 30;
        owner_damage.hp_loss = 0;
        owner_damage.shield_loss = 0;
        owner_damage.target_is_boss = false;

        let mut accumulator = CombatAccumulator::default();
        for domain in [damage, lucky_bonus, healing, taken, owner_damage] {
            let fact = CombatHitFact::from_domain(&domain).expect("accounted hit");
            assert!(!accumulator.apply(&fact));
        }

        assert_eq!(accumulator.totals.damage, 150);
        assert_eq!(accumulator.totals.boss_damage, 120);
        assert_eq!(accumulator.totals.healing, 80);
        assert_eq!(accumulator.totals.effective_healing, 50);
        assert_eq!(accumulator.totals.damage_taken, 100);

        let owner = &accumulator.entities[&10];
        assert_eq!(owner.class_spec, ClassSpec::Shield);
        assert_eq!(owner.damage.total, 150);
        assert_eq!(owner.damage.hits, 3);
        assert_eq!(owner.damage.trigger_hits, 2);
        assert_eq!(owner.damage.crit_hits, 1);
        assert_eq!(owner.damage.lucky_hits, 1);
        assert_eq!(owner.damage.lucky_total, 20);
        assert_eq!(owner.damage_boss_only.total, 120);
        assert_eq!(owner.healing.total, 80);
        assert_eq!(owner.healing.effective_total, 50);
        assert_eq!(owner.damage_targets[&20].stats.total_value, 150);

        let target = &owner.damage_targets[&20].skills[&17_140_101];
        assert_eq!(target.total_value, 120);
        assert_eq!(target.hp_loss_total, 100);
        assert_eq!(target.shield_loss_total, 20);
        assert_eq!(target.target_monster_id, Some(30_001));
        assert_eq!(
            owner.healing_targets[&20].skills[&24_060_101].effective_total_value,
            50
        );

        let defender = &accumulator.entities[&20];
        assert_eq!(defender.taken.total, 100);
        assert_eq!(defender.taken.crit_hits, 1);
        assert_eq!(defender.taken.block_hits, 1);
        assert_eq!(defender.taken.lucky_hits, 1);
        assert_eq!(defender.taken.lucky_block_hits, 1);
        assert_eq!(
            defender.taken_sources[&Some(9_001)].skills[&17_140_101].total_value,
            100
        );
    }

    #[test]
    fn overflow_saturates_every_projection_level() {
        let mut domain = hit(true, HitKind::Damage);
        domain.amount = u128::MAX;
        domain.hp_loss = 0;
        domain.shield_loss = 0;
        let fact = CombatHitFact::from_domain(&domain).expect("damage fact");
        let mut accumulator = CombatAccumulator::default();

        assert!(!accumulator.apply(&fact));
        assert!(accumulator.apply(&fact));
        assert!(accumulator.is_saturated());
        assert_eq!(accumulator.totals.damage, u128::MAX);
        assert_eq!(accumulator.entities[&10].damage.total, u128::MAX);
        assert_eq!(
            accumulator.entities[&10].damage_skills[&17_140_101].total_value,
            u128::MAX
        );
        assert_eq!(
            accumulator.entities[&10].damage_skills[&17_140_101].extrema,
            Some(HitExtrema {
                min: u128::MAX,
                max: u128::MAX,
            })
        );
    }

    #[test]
    fn overflow_path_merges_skill_extrema_instead_of_adding() {
        let mut first = hit(true, HitKind::Damage);
        first.amount = 50;
        first.hp_loss = 0;
        first.shield_loss = 0;
        let first_fact = CombatHitFact::from_domain(&first).expect("first damage fact");

        let mut overflow = hit(true, HitKind::Damage);
        overflow.amount = u128::MAX;
        overflow.hp_loss = 0;
        overflow.shield_loss = 0;
        let overflow_fact = CombatHitFact::from_domain(&overflow).expect("overflow damage fact");

        let mut accumulator = CombatAccumulator::default();
        assert!(!accumulator.apply(&first_fact));
        assert!(accumulator.apply(&overflow_fact));

        let skill = &accumulator.entities[&10].damage_skills[&17_140_101];
        assert_eq!(skill.total_value, u128::MAX);
        assert_eq!(
            skill.extrema,
            Some(HitExtrema {
                min: 50,
                max: u128::MAX,
            })
        );
    }
}
