//! Incremental combat statistics fed only by accepted domain hits.

use std::collections::{HashMap, HashSet};

use crate::live::active_window::{ActiveWindowAdvance, active_window_advance};
use crate::live::ipc::models::{
    BossHealth, LiveDataPayload, LiveDisplayClock, RawEntityData, build_taken_per_source,
    to_raw_combat_stats, to_raw_skill_stats,
};
use crate::live::projections::combat::accumulator::{
    CombatAccumulator, CombatHitFact, CombatMetric, CombatantStats,
};
use crate::live::projections::combat::stats::class::{
    ClassSpec, get_class_id_from_spec, get_class_name, get_class_spec,
};
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::entity_context::{EntityContext, EntityState};
use crate::live::runtime::events::{
    DomainHit, EntityIdentity, EntityRef, EntityUuid, HitKind, MonoTimeMs, SegmentId,
};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ProjectionOutcome {
    pub had_combat: bool,
    pub had_player_damage: bool,
    pub active_window: Option<ActiveWindowAdvance>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct CombatantProjection {
    uuid: i64,
    name: String,
    class_id: i32,
    ability_score: i32,
    season_strength: i32,
}

impl CombatantProjection {
    fn new(uuid: i64) -> Self {
        Self {
            uuid,
            ..Self::default()
        }
    }

    fn apply_identity(&mut self, identity: &EntityIdentity) {
        if let Some(name) = &identity.name {
            self.name.clone_from(name);
        }
        if let Some(class_id) = identity.profession_id {
            self.class_id = class_id;
        }
    }

    fn apply_context(&mut self, state: &EntityState) {
        self.apply_identity(&state.identity);
        if let Some(value) = state.int_attr(attr_type::ATTR_FIGHT_POINT) {
            self.ability_score = i32::try_from(value).unwrap_or_default();
        }
        if let Some(value) = state.int_attr(attr_type::ATTR_SEASON_STRENGTH) {
            self.season_strength = i32::try_from(value).unwrap_or_default();
        }
    }

    fn dto(&self, stats: &CombatantStats) -> RawEntityData {
        let class_spec = stats.class_spec;
        let class_id = if class_spec == ClassSpec::Unknown {
            self.class_id
        } else {
            get_class_id_from_spec(class_spec)
        };
        RawEntityData {
            entity_uuid: self.uuid.to_string(),
            display_uid: crate::live::entity_id::uid_from_uuid(self.uuid),
            name: self.name.clone(),
            class_id,
            class_spec: class_spec as i32,
            class_name: get_class_name(class_id),
            class_spec_name: get_class_spec(class_spec),
            ability_score: self.ability_score,
            season_strength: self.season_strength,
            damage: to_raw_combat_stats(&stats.damage),
            damage_boss_only: to_raw_combat_stats(&stats.damage_boss_only),
            healing: to_raw_combat_stats(&stats.healing),
            taken: to_raw_combat_stats(&stats.taken),
            dmg_skills: stats
                .damage_skills
                .iter()
                .map(|(skill, stats)| (*skill, to_raw_skill_stats(stats)))
                .collect(),
            heal_skills: stats
                .healing_skills
                .iter()
                .map(|(skill, stats)| (*skill, to_raw_skill_stats(stats)))
                .collect(),
            taken_skills: stats
                .taken_skills
                .iter()
                .map(|(skill, stats)| (*skill, to_raw_skill_stats(stats)))
                .collect(),
            taken_per_source: build_taken_per_source(&stats.taken_sources),
        }
    }
}

#[derive(Debug, Default)]
pub struct CombatProjection {
    segment_id: Option<SegmentId>,
    started_at_mono_ms: MonoTimeMs,
    started_at_wall_ms: i64,
    last_combat_offset_ms: Option<u64>,
    last_player_damage_offset_ms: Option<u64>,
    active_combat_time_ms: u128,
    accumulator: CombatAccumulator,
    local_player: Option<EntityUuid>,
    scene_id: Option<i32>,
    dungeon_difficulty: Option<i32>,
    is_paused: bool,
    paused_at_mono_ms: Option<MonoTimeMs>,
    paused_at_wall_ms: Option<i64>,
    accumulated_paused_ms: u64,
    accumulated_paused_wall_ms: u64,
    combatants: HashMap<i64, CombatantProjection>,
    bosses: HashMap<EntityUuid, BossHealth>,
    /// Bosses that disappeared mid-segment. Their entries stay in `bosses`
    /// so the final encounter summary keeps them (legacy behavior kept dead
    /// monsters in the entity table for finalization), but they are hidden
    /// from the live payload.
    departed_bosses: HashSet<EntityUuid>,
}

impl CombatProjection {
    #[must_use]
    pub fn segment_id(&self) -> Option<SegmentId> {
        self.segment_id
    }

    pub fn start_segment(
        &mut self,
        segment_id: SegmentId,
        started_at_mono_ms: MonoTimeMs,
        started_at_wall_ms: i64,
    ) {
        let local_player = self.local_player;
        let scene_id = self.scene_id;
        let dungeon_difficulty = self.dungeon_difficulty;
        let is_paused = self.is_paused;
        *self = Self {
            segment_id: Some(segment_id),
            started_at_mono_ms,
            started_at_wall_ms,
            local_player,
            scene_id,
            dungeon_difficulty,
            is_paused,
            paused_at_mono_ms: is_paused.then_some(started_at_mono_ms),
            paused_at_wall_ms: is_paused.then_some(started_at_wall_ms),
            ..Self::default()
        };
    }

    pub fn clear_segment(&mut self) {
        let local_player = self.local_player;
        let scene_id = self.scene_id;
        let dungeon_difficulty = self.dungeon_difficulty;
        let is_paused = self.is_paused;
        *self = Self {
            local_player,
            scene_id,
            dungeon_difficulty,
            is_paused,
            ..Self::default()
        };
    }

    /// Returns whether the payload-visible pause state changed.
    pub fn set_paused(
        &mut self,
        paused: bool,
        occurred_at_mono_ms: MonoTimeMs,
        occurred_at_wall_ms: i64,
    ) -> bool {
        if paused == self.is_paused {
            return false;
        }
        if paused {
            self.paused_at_mono_ms = Some(occurred_at_mono_ms);
            self.paused_at_wall_ms = Some(occurred_at_wall_ms);
        } else {
            if let Some(started_at) = self.paused_at_mono_ms.take() {
                self.accumulated_paused_ms = self
                    .accumulated_paused_ms
                    .saturating_add(occurred_at_mono_ms.0.saturating_sub(started_at.0));
            }
            if let Some(started_at) = self.paused_at_wall_ms.take() {
                let current_pause = occurred_at_wall_ms.saturating_sub(started_at).max(0);
                self.accumulated_paused_wall_ms = self
                    .accumulated_paused_wall_ms
                    .saturating_add(u64::try_from(current_pause).unwrap_or(0));
            }
        }
        self.is_paused = paused;
        true
    }

    /// Returns whether the payload-visible local player changed.
    pub fn set_local_player(&mut self, entity: Option<EntityRef>) -> bool {
        let next = entity.map(|entity| entity.uuid);
        if next == self.local_player {
            return false;
        }
        self.local_player = next;
        true
    }

    /// Returns whether the payload-visible scene or difficulty changed.
    pub fn set_scene(&mut self, scene_id: i32, difficulty: Option<i32>) -> bool {
        let changed = self.scene_id != Some(scene_id) || self.dungeon_difficulty != difficulty;
        self.scene_id = Some(scene_id);
        self.dungeon_difficulty = difficulty;
        changed
    }

    /// Returns whether any payload-visible combatant or boss field changed.
    pub fn observe_identity(
        &mut self,
        entity: EntityRef,
        identity: &EntityIdentity,
        entities: &EntityContext,
    ) -> bool {
        let mut changed = false;
        if let Some(combatant) = self.combatants.get_mut(&entity.uuid.0) {
            let before = combatant.clone();
            combatant.apply_identity(identity);
            changed |= *combatant != before;
        }
        if identity.is_boss_monster() {
            changed |= self.refresh_boss(entity, entities);
        } else {
            changed |= self.bosses.remove(&entity.uuid).is_some();
            changed |= self.departed_bosses.remove(&entity.uuid);
        }
        changed
    }

    /// Returns whether any payload-visible combatant or boss field changed.
    pub fn observe_attribute(&mut self, entity: EntityRef, attr_id: i32, value: i64) -> bool {
        let mut changed = false;
        if let Some(combatant) = self.combatants.get_mut(&entity.uuid.0) {
            match attr_id {
                attr_type::ATTR_FIGHT_POINT => {
                    let next = i32::try_from(value).unwrap_or_default();
                    if combatant.ability_score != next {
                        combatant.ability_score = next;
                        changed = true;
                    }
                }
                attr_type::ATTR_SEASON_STRENGTH => {
                    let next = i32::try_from(value).unwrap_or_default();
                    if combatant.season_strength != next {
                        combatant.season_strength = next;
                        changed = true;
                    }
                }
                _ => {}
            }
        }
        if let Some(boss) = self.bosses.get_mut(&entity.uuid) {
            match attr_id {
                attr_type::ATTR_CURRENT_HP if boss.current_hp != Some(value) => {
                    boss.current_hp = Some(value);
                    changed = true;
                }
                attr_type::ATTR_MAX_HP if boss.max_hp != Some(value) => {
                    boss.max_hp = Some(value);
                    changed = true;
                }
                _ => {}
            }
        }
        changed
    }

    /// Returns whether a payload-visible boss row changed.
    pub fn observe_death(&mut self, entity: EntityRef) -> bool {
        if let Some(boss) = self.bosses.get_mut(&entity.uuid)
            && !boss.is_dead
        {
            boss.is_dead = true;
            return true;
        }
        false
    }

    /// Returns whether the payload-visible boss set changed.
    pub fn remove_entity(&mut self, entity: EntityRef) -> bool {
        if self.bosses.contains_key(&entity.uuid) {
            return self.departed_bosses.insert(entity.uuid);
        }
        false
    }

    pub fn apply_hit(
        &mut self,
        hit: &DomainHit,
        fact: Option<&CombatHitFact>,
        occurred_at_ms: i64,
        occurred_at_mono_ms: MonoTimeMs,
        entities: &EntityContext,
    ) -> ProjectionOutcome {
        let mut outcome = ProjectionOutcome {
            had_combat: hit.source.is_some()
                || hit.resolved_owner.is_some()
                || hit.kind == HitKind::Damage,
            had_player_damage: hit.source_is_player && hit.kind == HitKind::Damage,
            active_window: None,
        };
        if self.segment_id.is_none() {
            return ProjectionOutcome::default();
        }

        let target_is_boss = match entities.entity(hit.target.uuid) {
            Some(state) => state.identity.is_boss_monster(),
            None => hit.target_is_boss,
        };
        if target_is_boss && !self.bosses.contains_key(&hit.target.uuid) {
            self.refresh_boss(hit.target, entities);
            outcome.had_combat = true;
        }

        if let Some(fact) = fact {
            let actor = match fact.metric {
                CombatMetric::Damage | CombatMetric::Healing => hit.resolved_owner.or(hit.source),
                CombatMetric::DamageTaken => Some(hit.target),
            }
            .expect("canonical combat fact always has an actor");
            self.ensure_combatant(actor, entities);
            let mut fact = *fact;
            fact.target_is_boss = target_is_boss;
            self.accumulator.apply(&fact);
        } else if hit.source_is_player {
            outcome.had_player_damage = false;
        }

        if outcome.had_player_damage || outcome.had_combat {
            let offset = self.segment_offset_ms(occurred_at_mono_ms);
            if outcome.had_player_damage {
                let timestamp = u128::try_from(occurred_at_ms).unwrap_or_default();
                let advance = active_window_advance(self.last_player_damage_offset_ms, offset);
                self.active_combat_time_ms = self
                    .active_combat_time_ms
                    .saturating_add(u128::from(advance.credited_ms()));
                self.last_player_damage_offset_ms = Some(offset);
                outcome.active_window = Some(advance);
                debug_assert!(
                    timestamp >= u128::try_from(self.started_at_wall_ms).unwrap_or_default()
                );
            }
            if outcome.had_combat {
                self.last_combat_offset_ms = Some(offset);
            }
        }
        outcome
    }

    #[must_use]
    pub fn payload(&self) -> LiveDataPayload {
        let mut entities = self
            .accumulator
            .entities
            .iter()
            .map(|(entity_id, stats)| {
                self.combatants
                    .get(entity_id)
                    .expect("combat accumulator metadata exists")
                    .dto(stats)
            })
            .collect::<Vec<_>>();
        entities.sort_unstable_by(|left, right| left.entity_uuid.cmp(&right.entity_uuid));
        let mut bosses = self
            .bosses
            .iter()
            .filter(|(uuid, _)| !self.departed_bosses.contains(*uuid))
            .map(|(_, boss)| boss.clone())
            .collect::<Vec<_>>();
        bosses.sort_unstable_by(|left, right| left.entity_uuid.cmp(&right.entity_uuid));
        let elapsed_ms = self.observed_duration_ms();
        LiveDataPayload {
            elapsed_ms: elapsed_ms.to_string(),
            damage_elapsed_ms: self.damage_elapsed_ms().to_string(),
            // The first-hit grace can push active time past the observed
            // duration; cap at the publication boundary so the header's
            // active timer never reads ahead of the elapsed timer.
            active_combat_time_ms: self.active_combat_time_ms.min(elapsed_ms).to_string(),
            fight_start_timestamp_ms: u128::try_from(self.started_at_wall_ms)
                .unwrap_or_default()
                .to_string(),
            total_dmg: self.accumulator.totals.damage.to_string(),
            total_dmg_boss_only: self.accumulator.totals.boss_damage.to_string(),
            total_heal: self.accumulator.totals.healing.to_string(),
            total_effective_heal: self.accumulator.totals.effective_healing.to_string(),
            local_player_uuid: self
                .local_player
                .map(|entity| entity.0.to_string())
                .unwrap_or_default(),
            scene_id: self.scene_id,
            dungeon_difficulty: self.dungeon_difficulty,
            is_paused: self.is_paused,
            bosses,
            entities,
        }
    }

    #[must_use]
    pub fn observed_duration_ms(&self) -> u128 {
        exclusive_span_ms(self.last_combat_offset_ms)
    }

    #[must_use]
    pub fn damage_elapsed_ms(&self) -> u128 {
        exclusive_span_ms(
            self.last_player_damage_offset_ms
                .or(self.last_combat_offset_ms),
        )
    }

    #[must_use]
    pub fn segment_offset_ms(&self, occurred_at_mono_ms: MonoTimeMs) -> u64 {
        if self.segment_id.is_none() {
            return 0;
        }
        let raw = occurred_at_mono_ms
            .0
            .saturating_sub(self.started_at_mono_ms.0);
        let current_pause = self.paused_at_mono_ms.map_or(0, |paused_at| {
            occurred_at_mono_ms.0.saturating_sub(paused_at.0)
        });
        raw.saturating_sub(self.accumulated_paused_ms)
            .saturating_sub(current_pause)
    }

    #[must_use]
    pub const fn active_combat_time_ms(&self) -> u128 {
        self.active_combat_time_ms
    }

    #[must_use]
    pub const fn display_clock(&self) -> LiveDisplayClock {
        LiveDisplayClock {
            started_at_wall_ms: self.started_at_wall_ms,
            accumulated_paused_ms: self.accumulated_paused_wall_ms,
            paused_at_wall_ms: self.paused_at_wall_ms,
            ended_at_wall_ms: None,
        }
    }

    #[must_use]
    pub const fn started_at_wall_ms(&self) -> i64 {
        self.started_at_wall_ms
    }

    #[must_use]
    pub const fn started_at_mono_ms(&self) -> MonoTimeMs {
        self.started_at_mono_ms
    }

    #[must_use]
    pub const fn total_damage(&self) -> u128 {
        self.accumulator.totals.damage
    }

    #[must_use]
    pub const fn total_healing(&self) -> u128 {
        self.accumulator.totals.healing
    }

    #[must_use]
    pub const fn accumulator(&self) -> &CombatAccumulator {
        &self.accumulator
    }

    #[must_use]
    pub const fn local_player_id(&self) -> Option<i64> {
        match self.local_player {
            Some(entity) => Some(entity.0),
            None => None,
        }
    }

    #[must_use]
    pub const fn scene_id(&self) -> Option<i32> {
        self.scene_id
    }

    #[must_use]
    pub const fn dungeon_difficulty(&self) -> Option<i32> {
        self.dungeon_difficulty
    }

    /// Players for the encounter list. Unnamed characters are kept for their
    /// UID, which the history search matches.
    #[must_use]
    pub fn player_names(&self) -> Vec<crate::database::PlayerNameEntry> {
        self.accumulator
            .entities
            .iter()
            .filter_map(|(entity_id, stats)| {
                let combatant = self.combatants.get(entity_id)?;
                let uid = crate::live::entity_id::is_character_uuid(*entity_id)
                    .then(|| crate::live::entity_id::uid_from_uuid(*entity_id));
                if combatant.name.is_empty() && uid.is_none() {
                    return None;
                }
                let class_id = if stats.class_spec == ClassSpec::Unknown {
                    combatant.class_id
                } else {
                    get_class_id_from_spec(stats.class_spec)
                };
                Some(crate::database::PlayerNameEntry {
                    name: combatant.name.clone(),
                    class_id,
                    uid,
                })
            })
            .collect()
    }

    #[must_use]
    pub fn boss_monster_ids(&self) -> Vec<i32> {
        let mut ids = self
            .bosses
            .values()
            .filter_map(|boss| boss.monster_id)
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids.dedup();
        ids
    }

    #[must_use]
    pub fn boss_summaries(&self) -> Vec<crate::database::commands::BossSummaryDto> {
        let mut summaries = HashMap::<i32, crate::database::commands::BossSummaryDto>::new();
        for boss in self.bosses.values() {
            let Some(monster_id) = boss.monster_id else {
                continue;
            };
            let summary =
                summaries
                    .entry(monster_id)
                    .or_insert(crate::database::commands::BossSummaryDto {
                        monster_id,
                        max_hp: boss.max_hp,
                        is_defeated: boss.is_dead,
                    });
            summary.max_hp = summary.max_hp.max(boss.max_hp);
            summary.is_defeated |= boss.is_dead;
        }
        let mut summaries = summaries.into_values().collect::<Vec<_>>();
        summaries.sort_unstable_by_key(|boss| boss.monster_id);
        summaries
    }

    fn ensure_combatant(
        &mut self,
        entity: EntityRef,
        entities: &EntityContext,
    ) -> &mut CombatantProjection {
        use std::collections::hash_map::Entry;
        match self.combatants.entry(entity.uuid.0) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => {
                let mut combatant = CombatantProjection::new(entity.uuid.0);
                if let Some(state) = entities.entity(entity.uuid) {
                    combatant.apply_context(state);
                }
                entry.insert(combatant)
            }
        }
    }

    /// Returns whether the payload-visible boss row changed.
    fn refresh_boss(&mut self, entity: EntityRef, entities: &EntityContext) -> bool {
        use std::collections::hash_map::Entry;

        let Some(state) = entities.entity(entity.uuid) else {
            return false;
        };
        if !state.identity.is_boss_monster() {
            return false;
        }
        self.departed_bosses.remove(&entity.uuid);
        let current_hp = state.int_attr(attr_type::ATTR_CURRENT_HP);
        let max_hp = state.int_attr(attr_type::ATTR_MAX_HP);
        match self.bosses.entry(entity.uuid) {
            Entry::Occupied(mut entry) => {
                let boss = entry.get_mut();
                let changed = boss.monster_id != state.identity.monster_id
                    || boss.current_hp != current_hp
                    || boss.max_hp != max_hp;
                boss.monster_id = state.identity.monster_id;
                boss.current_hp = current_hp;
                boss.max_hp = max_hp;
                changed
            }
            Entry::Vacant(entry) => {
                entry.insert(BossHealth {
                    entity_uuid: entity.uuid.0.to_string(),
                    monster_id: state.identity.monster_id,
                    current_hp,
                    max_hp,
                    is_dead: false,
                });
                true
            }
        }
    }
}

fn exclusive_span_ms(offset: Option<u64>) -> u128 {
    offset.map_or(0, |ms| u128::from(ms).saturating_add(1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::active_window::HIT_GRACE_MS;
    use crate::live::projections::combat::stats::damage_type_flag;
    use crate::live::runtime::events::{
        BatchId, EntityIdentityPatch, EntityKind, EventMeta, FieldPatch, HitChannel, ProtocolBatch,
        ProtocolObservation,
    };

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
            type_flags: damage_type_flag::CRIT,
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

    fn apply_hit(
        projection: &mut CombatProjection,
        hit: DomainHit,
        occurred_at_ms: i64,
        occurred_at_mono_ms: MonoTimeMs,
        entities: &EntityContext,
    ) {
        let fact = CombatHitFact::from_domain(&hit);
        projection.apply_hit(
            &hit,
            fact.as_ref(),
            occurred_at_ms,
            occurred_at_mono_ms,
            entities,
        );
    }

    fn identity_batch(sequence: u64, monster_id: i32, is_boss: FieldPatch<bool>) -> ProtocolBatch {
        ProtocolBatch {
            meta: EventMeta {
                batch_id: BatchId(sequence),
                capture_sequence: sequence,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: i64::try_from(sequence).unwrap_or_default(),
                captured_mono_ns: sequence * 1_000_000,
                source_time_ms: None,
            },
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(20),
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: EntityUuid(20),
                    patch: EntityIdentityPatch {
                        monster_id: FieldPatch::Set(monster_id),
                        is_boss,
                        ..Default::default()
                    },
                },
            ],
        }
    }

    #[test]
    fn one_hit_updates_exactly_one_metric() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(1_000), 1_000);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        apply_hit(
            &mut projection,
            hit(false, HitKind::Damage),
            1_001,
            MonoTimeMs(1_001),
            &entities,
        );

        assert_eq!(projection.total_damage(), 100);
        assert_eq!(projection.accumulator.entities[&10].damage.total, 100);
        assert_eq!(projection.accumulator.entities[&10].taken.total, 0);
        assert_eq!(projection.accumulator.entities[&20].taken.total, 100);
    }

    #[test]
    fn player_names_keep_unnamed_characters_for_their_uid() {
        let named = crate::live::entity_id::canonical_player_uuid(1_001);
        let unnamed = crate::live::entity_id::canonical_player_uuid(1_002);
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(1_000), 1_000);
        let entities = EntityContext::new();
        for (source, wall_ms, mono_ms) in [
            (named, 1_000, 1_000),
            (unnamed, 1_001, 1_001),
            (10, 1_002, 1_002),
        ] {
            let mut player_hit = hit(true, HitKind::Damage);
            player_hit.source = Some(entity(source));
            apply_hit(
                &mut projection,
                player_hit,
                wall_ms,
                MonoTimeMs(mono_ms),
                &entities,
            );
        }
        projection
            .combatants
            .get_mut(&named)
            .expect("named combatant")
            .name = "Alice".to_string();

        let mut players = projection
            .player_names()
            .into_iter()
            .map(|player| (player.name, player.uid))
            .collect::<Vec<_>>();
        players.sort();

        assert_eq!(
            players,
            vec![
                (String::new(), Some(1_002)),
                ("Alice".to_string(), Some(1_001)),
            ]
        );
    }

    #[test]
    fn active_time_counts_a_batch_timestamp_once() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(1_000), 1_000);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        assert_eq!(projection.active_combat_time_ms(), u128::from(HIT_GRACE_MS));
    }

    #[test]
    fn payload_caps_active_combat_time_at_observed_duration() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(1_000), 1_000);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );

        // The first hit grants active time the 500ms grace while the observed
        // duration is only 1ms; the payload must cap active at elapsed so the
        // header's active timer never reads ahead of the elapsed timer.
        assert_eq!(projection.active_combat_time_ms(), u128::from(HIT_GRACE_MS));
        let payload = projection.payload();
        assert_eq!(payload.elapsed_ms, "1");
        assert_eq!(payload.damage_elapsed_ms, "1");
        assert_eq!(payload.active_combat_time_ms, "1");
    }

    #[test]
    fn healing_after_player_damage_does_not_advance_damage_elapsed() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        apply_hit(
            &mut projection,
            hit(true, HitKind::Healing),
            21_000,
            MonoTimeMs(21_000),
            &entities,
        );

        assert_eq!(projection.observed_duration_ms(), 21_001);
        assert_eq!(projection.damage_elapsed_ms(), 1_001);
        assert_eq!(projection.active_combat_time_ms(), u128::from(HIT_GRACE_MS));
    }

    #[test]
    fn paused_player_damage_does_not_advance_damage_elapsed() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        projection.set_paused(true, MonoTimeMs(1_000), 1_000);
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            5_000,
            MonoTimeMs(5_000),
            &entities,
        );

        assert_eq!(projection.segment_offset_ms(MonoTimeMs(5_000)), 1_000);
        assert_eq!(projection.damage_elapsed_ms(), 1_001);
    }

    #[test]
    fn mechanic_gap_stays_in_damage_elapsed_but_not_active_time() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            16_000,
            MonoTimeMs(16_000),
            &entities,
        );

        assert_eq!(projection.damage_elapsed_ms(), 16_001);
        assert_eq!(
            projection.active_combat_time_ms(),
            u128::from(HIT_GRACE_MS) * 2
        );
    }

    #[test]
    fn segment_clock_freezes_while_paused() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(1_000),
            &entities,
        );
        projection.set_paused(true, MonoTimeMs(1_000), 1_000);
        assert_eq!(projection.segment_offset_ms(MonoTimeMs(5_000)), 1_000);
        projection.set_paused(false, MonoTimeMs(6_000), 6_000);
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            7_000,
            MonoTimeMs(7_000),
            &entities,
        );

        assert_eq!(projection.segment_offset_ms(MonoTimeMs(7_000)), 2_000);
        assert_eq!(projection.observed_duration_ms(), 2_001);
        assert_eq!(projection.active_combat_time_ms(), 1_500);
    }

    #[test]
    fn boss_hit_registers_once_and_identity_events_update_incrementally() {
        let mut entities = EntityContext::new();
        entities.apply_batch(identity_batch(1, 900, FieldPatch::Set(true)));
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);

        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1,
            MonoTimeMs(1),
            &entities,
        );
        assert_eq!(projection.bosses[&EntityUuid(20)].monster_id, Some(900));

        entities.apply_batch(identity_batch(2, 901, FieldPatch::Unchanged));
        projection.observe_death(entity(20));
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            2,
            MonoTimeMs(2),
            &entities,
        );
        let boss = &projection.bosses[&EntityUuid(20)];
        assert_eq!(boss.monster_id, Some(900));
        assert!(boss.is_dead);

        let boss_ref = entities
            .entity_ref(EntityUuid(20))
            .expect("boss entity ref");
        let identity = entities
            .entity(EntityUuid(20))
            .expect("boss state")
            .identity
            .clone();
        projection.observe_identity(boss_ref, &identity, &entities);
        let boss = &projection.bosses[&EntityUuid(20)];
        assert_eq!(boss.monster_id, Some(901));
        assert!(boss.is_dead);
    }

    #[test]
    fn departed_boss_stays_in_summary_but_leaves_live_payload() {
        let mut entities = EntityContext::new();
        entities.apply_batch(identity_batch(1, 900, FieldPatch::Set(true)));
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);

        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1,
            MonoTimeMs(1),
            &entities,
        );
        projection.observe_death(entity(20));

        // Corpse despawns mid-segment: hidden from the live payload...
        projection.remove_entity(entity(20));
        assert!(projection.payload().bosses.is_empty());

        // ...but the final summary still lists the boss as defeated.
        let summaries = projection.boss_summaries();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].monster_id, 900);
        assert!(summaries[0].is_defeated);
        assert_eq!(projection.boss_monster_ids(), vec![900]);
    }

    fn dummy_boss_batch(sequence: u64, monster_id: i32) -> ProtocolBatch {
        ProtocolBatch {
            meta: EventMeta {
                batch_id: BatchId(sequence),
                capture_sequence: sequence,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: i64::try_from(sequence).unwrap_or_default(),
                captured_mono_ns: sequence * 1_000_000,
                source_time_ms: None,
            },
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(20),
                    kind: EntityKind::Dummy,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: EntityUuid(20),
                    patch: EntityIdentityPatch {
                        monster_id: FieldPatch::Set(monster_id),
                        is_boss: FieldPatch::Set(true),
                        ..Default::default()
                    },
                },
            ],
        }
    }

    #[test]
    fn dummy_boss_template_is_excluded_from_hp_and_boss_damage() {
        let mut entities = EntityContext::new();
        entities.apply_batch(dummy_boss_batch(1, 7001));
        let dummy = entities
            .entity(EntityUuid(20))
            .expect("dummy state")
            .identity
            .clone();
        let dummy_ref = entities
            .entity_ref(EntityUuid(20))
            .expect("dummy entity ref");

        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 0);
        assert!(!projection.observe_identity(dummy_ref, &dummy, &entities));

        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1,
            MonoTimeMs(1),
            &entities,
        );

        assert!(projection.bosses.is_empty());
        assert_eq!(projection.payload().bosses.len(), 0);
        assert_eq!(projection.accumulator().totals.boss_damage, 0);
        assert_eq!(projection.total_damage(), 100);
    }

    #[test]
    fn display_clock_exports_start_without_an_end_while_recording() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(10_000), 1_700_000_000_000);
        assert_eq!(
            projection.display_clock(),
            LiveDisplayClock {
                started_at_wall_ms: 1_700_000_000_000,
                accumulated_paused_ms: 0,
                paused_at_wall_ms: None,
                ended_at_wall_ms: None,
            }
        );
        assert_eq!(projection.observed_duration_ms(), 0);
    }

    #[test]
    fn display_clock_tracks_wall_pause_separately_from_observed_duration() {
        let mut projection = CombatProjection::default();
        projection.start_segment(SegmentId(1), MonoTimeMs(0), 1_000);
        let entities = EntityContext::new();
        apply_hit(
            &mut projection,
            hit(true, HitKind::Damage),
            1_000,
            MonoTimeMs(0),
            &entities,
        );
        projection.set_paused(true, MonoTimeMs(1_000), 2_000);
        assert_eq!(
            projection.display_clock(),
            LiveDisplayClock {
                started_at_wall_ms: 1_000,
                accumulated_paused_ms: 0,
                paused_at_wall_ms: Some(2_000),
                ended_at_wall_ms: None,
            }
        );

        projection.set_paused(false, MonoTimeMs(6_000), 7_000);
        assert_eq!(
            projection.display_clock(),
            LiveDisplayClock {
                started_at_wall_ms: 1_000,
                accumulated_paused_ms: 5_000,
                paused_at_wall_ms: None,
                ended_at_wall_ms: None,
            }
        );
        assert_eq!(projection.observed_duration_ms(), 1);
    }
}
