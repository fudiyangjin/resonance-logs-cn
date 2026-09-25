//! Indexed voice-rule projection using the shared deadline scheduler.
//!
//! Rules are keyed by their [`VoiceSubject`] (minus scope details) so every
//! engine path does one map lookup and then filters the handful of rules on
//! that subject by event / scope.
//!
//! Two trigger paradigms only: *edges* (buff gained/lost, cast, counter
//! threshold, entity appeared/gone, skill charge refilled) and *deadlines*
//! (N seconds before a buff / mechanic / counter freeze / skill refill /
//! entity lifetime runs out). A deadline that a live update pulls into the
//! past is announced right away (see [`DeadlineTracker::sync`]). Entity
//! state is read from the sibling [`EntityMonitorProjection`] at the end of
//! each batch; skill cooldowns are copied from it as charge timelines so
//! refills that no packet reports can be evaluated on the voice's own
//! wakeups (see [`skill`]).

use std::collections::{BTreeSet, HashMap, HashSet};

use crate::live::counter::engine::{CounterEngine, CounterNamespace};
use crate::live::projections::entity_monitor::EntityMonitorProjection;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    BuffState, BuffTransition, DomainEnvelope, DomainEvent, MonoTimeMs, SkillPhase, TimerKey,
    TimerScope,
};
use crate::live::runtime::scheduler::DeadlineScheduler;
use crate::voice::models::{
    AlertKind, EntityOwnerScope, MonsterBuffSourceScope, VoiceCueIntent, VoiceEvent, VoiceRule,
    VoiceRuntimeSnapshot, VoiceSubject, VoiceTrigger,
};

mod deadline;
mod skill;
#[cfg(test)]
mod tests;

use deadline::{DeadlineTracker, SyncOutcome};
use skill::{SkillRules, SkillTrack};

/// Whether a sync follows live game updates or re-establishes state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VoiceSyncReason {
    /// Configuration changes, snapshots and context switches (another local
    /// player or attack target): state is rebuilt silently, so no edge fires
    /// and no cue is announced late.
    Baseline,
    /// Live game updates: edges fire, and a pending cue that an update
    /// pulls into the past is announced right away.
    Runtime,
}

/// Lookup key derived from a [`VoiceSubject`] with scope details stripped:
/// the buff aggregates are keyed per base id, and the source scope is
/// checked when matching an edge against the candidate rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SubjectKey {
    Buff(i32),
    MonsterBuff(i32),
    Skill(i32),
    Entity(i32),
    BossDbm(i32),
    Counter { rule_id: i32, slot_id: i32 },
    Alert(AlertKind),
}

impl SubjectKey {
    fn of(subject: &VoiceSubject) -> Self {
        match subject {
            VoiceSubject::Buff { buff_id } => Self::Buff(*buff_id),
            VoiceSubject::MonsterBuff { buff_id, .. } => Self::MonsterBuff(*buff_id),
            VoiceSubject::Skill { skill_id } => Self::Skill(*skill_id),
            VoiceSubject::Entity { monster_id, .. } => Self::Entity(*monster_id),
            VoiceSubject::BossDbm { base_skill_id } => Self::BossDbm(*base_skill_id),
            VoiceSubject::Counter { rule_id, slot_id } => Self::Counter {
                rule_id: *rule_id,
                slot_id: *slot_id,
            },
            VoiceSubject::Alert { alert } => Self::Alert(*alert),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum VoiceBuffScope {
    LocalPlayer,
    MonsterAnySource,
    MonsterLocalPlayerSource,
}

impl VoiceBuffScope {
    const fn timer_subject(self) -> u64 {
        match self {
            Self::LocalPlayer => 0,
            Self::MonsterAnySource => 1,
            Self::MonsterLocalPlayerSource => 2,
        }
    }

    fn subject_key(self, base_id: i32) -> SubjectKey {
        match self {
            Self::LocalPlayer => SubjectKey::Buff(base_id),
            Self::MonsterAnySource | Self::MonsterLocalPlayerSource => {
                SubjectKey::MonsterBuff(base_id)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct BuffAggregate {
    expires_mono_ms: Option<MonoTimeMs>,
    fantasy_tier: Option<u8>,
}

#[derive(Debug, Default)]
struct BuffAggregateBuilder {
    latest_expiry: Option<MonoTimeMs>,
    has_unbounded_instance: bool,
    fantasy_tier: Option<u8>,
}

impl BuffAggregateBuilder {
    fn record(&mut self, buff: &BuffState, entities: &EntityContext) {
        // Legacy registry lookup at snapshot time. Multi-instance conflicts
        // used to be arbitrary-order last-wins; max() is the deterministic
        // tie-break across instances of the same base id.
        let tier = entities
            .resolve_fantasy_remodel_level(
                buff.source.map(|source| source.uuid),
                buff.source_config_id,
            )
            .and_then(|level| u8::try_from(level).ok());
        self.fantasy_tier = self.fantasy_tier.max(tier);
        if buff.duration_ms.is_none_or(|duration| duration == 0) || buff.expires_mono_ms.is_none() {
            self.has_unbounded_instance = true;
            self.latest_expiry = None;
            return;
        }
        if self.has_unbounded_instance {
            return;
        }
        if let Some(expires) = buff.expires_mono_ms {
            self.latest_expiry = Some(self.latest_expiry.map_or(expires, |old| old.max(expires)));
        }
    }

    fn finish(self) -> BuffAggregate {
        BuffAggregate {
            expires_mono_ms: (!self.has_unbounded_instance)
                .then_some(self.latest_expiry)
                .flatten(),
            fantasy_tier: self.fantasy_tier,
        }
    }
}

type BuffAggregates = HashMap<VoiceBuffScope, HashMap<i32, BuffAggregate>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct BuffEdge {
    scope: VoiceBuffScope,
    base_id: i32,
    gained: bool,
    fantasy_tier: Option<u8>,
}

#[derive(Debug, Default)]
pub struct VoiceProjection {
    rules: Vec<VoiceRule>,
    /// Enabled rule handles grouped by subject; the only lookup index.
    rules_by_subject: HashMap<SubjectKey, Vec<usize>>,
    /// Handles of enabled counter rules, iterated on every counter flush.
    counter_rules: Vec<usize>,
    /// Handles of enabled buff `ExpiringIn` rules, so expiry syncing touches
    /// only timer-bearing rules instead of scanning `rules`.
    buff_expiry_rules: Vec<usize>,
    /// Enabled cooldown rules per local skill id (`Skill/Started` is a cast
    /// edge and needs no cooldown state).
    skill_rules: HashMap<i32, SkillRules>,
    /// Handles of enabled `Entity` rules, which read the entity monitor's
    /// duration tracks.
    entity_rules: Vec<usize>,
    buff_aggregates: BuffAggregates,
    /// Every armed voice cue timer, keyed by its scheduler key.
    deadlines: DeadlineTracker,
    rule_set: u64,
    last_fire_ms: HashMap<usize, i64>,
    counter_crossed: HashMap<(i32, i32), bool>,
    /// Cooldown timeline and last seen charges of every watched skill that
    /// has a cooldown record; a rise in charges fires `Skill/Ended`.
    skills: HashMap<i32, SkillTrack>,
    /// `(monster_id, scope)` pairs with at least one present watched entity
    /// at the last flush; `Entity/Started|Ended` fire on set differences.
    entity_presence: BTreeSet<(i32, EntityOwnerScope)>,
    /// `false` until the first flush after (re)configuration, which seeds
    /// `entity_presence` silently — entities already on the field are not
    /// announced as "appeared".
    entity_presence_seeded: bool,
    /// Cues matched during this batch, drained by [`Self::take_cues`].
    pending_cues: Vec<VoiceCueIntent>,
    /// Scratch buffer for rule handles, reused across edge evaluation so a
    /// buff-heavy batch does not allocate once per matched base id.
    matched_rules: Vec<usize>,
}

impl VoiceProjection {
    /// Removes the cues matched since the last drain. The caller owns the
    /// `VoiceService` handle; this projection stays free of Tauri.
    pub fn take_cues(&mut self) -> Vec<VoiceCueIntent> {
        std::mem::take(&mut self.pending_cues)
    }

    pub fn reset_runtime(&mut self, scheduler: &mut DeadlineScheduler) {
        if self.rule_set != 0 {
            scheduler.invalidate_scope(TimerScope::RuleSet(self.rule_set));
        }
        self.buff_aggregates.clear();
        self.deadlines.clear();
        self.last_fire_ms.clear();
        self.counter_crossed.clear();
        self.clear_entity_monitor_state();
    }

    fn clear_entity_monitor_state(&mut self) {
        self.skills.clear();
        self.entity_presence.clear();
        self.entity_presence_seeded = false;
    }

    pub fn apply_config(
        &mut self,
        config: &VoiceRuntimeSnapshot,
        entities: &EntityContext,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let mut effective = config.clone();
        effective.normalize();
        effective.rules.retain(|rule| rule.enabled);
        if self.rules == effective.rules {
            return false;
        }
        if self.rule_set != 0 {
            scheduler.invalidate_scope(TimerScope::RuleSet(self.rule_set));
        }
        self.deadlines.clear();
        self.rule_set = self.rule_set.wrapping_add(1).max(1);
        self.rules = effective.rules;
        self.rebuild_rule_indexes();
        self.last_fire_ms.clear();
        self.counter_crossed.clear();
        self.clear_entity_monitor_state();
        self.buff_aggregates = collect_buff_aggregates(entities);
        self.sync_buff_expiries(VoiceSyncReason::Baseline, now_ms, now_mono, scheduler);
        true
    }

    /// Rebuilds the trigger lookup indexes from `rules`. Every path that
    /// replaces `rules` must call this, so the indexes can never drift out of
    /// sync with the rule list they point into.
    fn rebuild_rule_indexes(&mut self) {
        self.rules_by_subject.clear();
        self.counter_rules.clear();
        self.buff_expiry_rules.clear();
        self.skill_rules.clear();
        self.entity_rules.clear();
        for (index, rule) in self.rules.iter().enumerate() {
            if !rule.enabled {
                continue;
            }
            self.rules_by_subject
                .entry(SubjectKey::of(&rule.trigger.subject))
                .or_default()
                .push(index);
            match &rule.trigger.subject {
                VoiceSubject::Buff { .. } | VoiceSubject::MonsterBuff { .. } => {
                    if buff_expiry_rule(&rule.trigger).is_some() {
                        self.buff_expiry_rules.push(index);
                    }
                }
                VoiceSubject::Counter { .. } => self.counter_rules.push(index),
                // "Ready in 0 s" is the refill itself, so it rides the edge.
                VoiceSubject::Skill { skill_id } => match rule.trigger.event {
                    VoiceEvent::Ended | VoiceEvent::ExpiringIn { seconds_before: 0 } => {
                        self.skill_rules
                            .entry(*skill_id)
                            .or_default()
                            .ready
                            .push(index);
                    }
                    VoiceEvent::ExpiringIn { seconds_before } => {
                        self.skill_rules
                            .entry(*skill_id)
                            .or_default()
                            .ready_in
                            .push((index, seconds_before));
                    }
                    VoiceEvent::Started | VoiceEvent::Threshold => {}
                },
                VoiceSubject::Entity { .. } => self.entity_rules.push(index),
                VoiceSubject::BossDbm { .. } | VoiceSubject::Alert { .. } => {}
            }
        }
    }

    /// Copies the handles indexed under `key` into the scratch buffer and
    /// returns it; callers must hand it back via `self.matched_rules`.
    fn take_matched(&mut self, key: SubjectKey) -> Vec<usize> {
        let mut matched = std::mem::take(&mut self.matched_rules);
        matched.clear();
        if let Some(indices) = self.rules_by_subject.get(&key) {
            matched.extend_from_slice(indices);
        }
        matched
    }

    pub fn apply(
        &mut self,
        envelope: &DomainEnvelope,
        entities: &EntityContext,
        scheduler: &mut DeadlineScheduler,
    ) {
        if self.rules.is_empty() {
            return;
        }
        match &envelope.event {
            DomainEvent::BuffChanged(buff) => {
                // Only the local player's and the current target's buffs feed
                // voice aggregates (see `collect_buff_aggregates`). Teammate
                // buff churn would otherwise rebuild and diff both scopes for
                // nothing on every raid-wide buff packet.
                if !buff.target_roles.is_local_player && !buff.target_roles.is_current_target {
                    return;
                }
                let reason = if buff.transition == BuffTransition::Baseline {
                    VoiceSyncReason::Baseline
                } else {
                    VoiceSyncReason::Runtime
                };
                self.refresh_buff_aggregates(
                    entities,
                    reason,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                    scheduler,
                );
            }
            DomainEvent::EntityDisappeared { .. } => {
                self.refresh_buff_aggregates(
                    entities,
                    VoiceSyncReason::Runtime,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                    scheduler,
                );
            }
            // These swap *whose* buffs are watched rather than changing a
            // buff, so they rebuild silently.
            DomainEvent::EntityAppeared { .. }
            | DomainEvent::IdentityChanged { .. }
            | DomainEvent::LocalPlayerChanged { .. }
            | DomainEvent::AttackTargetChanged { .. }
            | DomainEvent::DeathOccurred { .. } => {
                self.refresh_buff_aggregates(
                    entities,
                    VoiceSyncReason::Baseline,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                    scheduler,
                );
            }
            DomainEvent::SceneChanged { .. } => self.cancel_boss_expiries(scheduler),
            // The local player's casts arrive exactly once per cast as the
            // authoritative `CastStarted` (`Observed` echoes are dropped by
            // the entity context), so no dedup is needed here.
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase: SkillPhase::CastStarted,
                ..
            } if entities.local_player() == Some(*caster) => {
                let matched = self.take_matched(SubjectKey::Skill(*skill_id));
                for &index in &matched {
                    if self.rules.get(index).map(|rule| &rule.trigger.event)
                        == Some(&VoiceEvent::Started)
                    {
                        self.fire_rule(index, envelope.occurred_at_ms, None);
                    }
                }
                self.matched_rules = matched;
            }
            DomainEvent::BossMechanicStarted(mechanic) => {
                let matched = self.take_matched(SubjectKey::BossDbm(mechanic.base_skill_id));
                for &index in &matched {
                    // Copy the event out by value so `self.rules` is no
                    // longer borrowed when the handlers take `&mut self`.
                    let event = self.rules.get(index).map(|rule| rule.trigger.event.clone());
                    match event {
                        Some(VoiceEvent::Started) => {
                            self.fire_rule(index, envelope.occurred_at_ms, None);
                        }
                        Some(VoiceEvent::ExpiringIn { seconds_before }) => {
                            let outcome = self.sync_boss_expiry(
                                index,
                                mechanic.base_skill_id,
                                mechanic.expires_mono_ms,
                                seconds_before,
                                envelope.meta.mono_ms(),
                                scheduler,
                            );
                            if outcome == SyncOutcome::FireNow {
                                self.fire_rule(index, envelope.occurred_at_ms, None);
                            }
                        }
                        _ => {}
                    }
                }
                self.matched_rules = matched;
            }
            DomainEvent::MatchmakingPopped => {
                self.fire_alert(AlertKind::MatchmakingPopped, envelope.occurred_at_ms);
            }
            DomainEvent::ReadyCheckStarted => {
                self.fire_alert(AlertKind::ReadyCheckStarted, envelope.occurred_at_ms);
            }
            DomainEvent::TeamVoteStarted => {
                self.fire_alert(AlertKind::TeamVoteStarted, envelope.occurred_at_ms);
            }
            DomainEvent::DeadlineReached {
                key,
                scheduled_for,
                fired_at,
                ..
            } => self.on_deadline(
                *key,
                *scheduled_for,
                *fired_at,
                envelope.occurred_at_ms,
                scheduler,
            ),
            _ => {}
        }
    }

    pub fn apply_counters(
        &mut self,
        reason: VoiceSyncReason,
        counters: &CounterEngine,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        if self.counter_rules.is_empty() {
            return;
        }
        // Counter rule handles are stable between `apply_config` calls, so the
        // index list is moved out and restored rather than cloned per flush.
        let counter_rules = std::mem::take(&mut self.counter_rules);
        for &index in &counter_rules {
            let Some(trigger) = self.rules.get(index).map(|rule| &rule.trigger) else {
                continue;
            };
            let VoiceSubject::Counter { rule_id, slot_id } = trigger.subject else {
                continue;
            };
            match trigger.event {
                VoiceEvent::Threshold => {
                    let crossed = counters
                        .slot_state(CounterNamespace::Normal, rule_id, slot_id)
                        .is_some_and(|slot| {
                            slot.effective_threshold
                                .is_some_and(|threshold| slot.current_count >= threshold)
                        });
                    let previous = self
                        .counter_crossed
                        .insert((rule_id, slot_id), crossed)
                        .unwrap_or(false);
                    if reason == VoiceSyncReason::Runtime && crossed && !previous {
                        self.fire_rule(index, now_ms, None);
                    }
                }
                VoiceEvent::ExpiringIn { seconds_before } => {
                    let key = counter_voice_key(self.rule_set, index, rule_id, slot_id);
                    // Freeze windows are wall-clock; convert the remaining
                    // time onto the monotonic axis the scheduler runs on.
                    let expires = counters
                        .slot_state(CounterNamespace::Normal, rule_id, slot_id)
                        .and_then(|slot| slot.freeze_until_ms)
                        .map(|expiry_wall| {
                            now_mono
                                .saturating_add(expiry_wall.saturating_sub(now_ms).max(0) as u64)
                        });
                    let outcome = self.deadlines.sync(
                        key,
                        expires,
                        seconds_before,
                        now_mono,
                        reason,
                        scheduler,
                    );
                    if outcome == SyncOutcome::FireNow {
                        self.fire_rule(index, now_ms, None);
                    }
                }
                _ => {}
            }
        }
        self.counter_rules = counter_rules;
    }

    /// Sibling read of the entity monitor at the end of a batch (and right
    /// after a config change): re-evaluates watched skill cooldowns,
    /// re-arms entity-expiry deadlines and fires presence edges.
    pub fn apply_entity_monitor(
        &mut self,
        reason: VoiceSyncReason,
        monitor: &EntityMonitorProjection,
        entities: &EntityContext,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        if !self.skill_rules.is_empty() {
            self.sync_skills(reason, monitor, now_ms, now_mono, scheduler);
        }
        if self.entity_rules.is_empty() {
            return;
        }
        // The same tracks the HUD renders, so cues follow what is on screen.
        let tracks = monitor.entity_duration().tracks(entities);

        let rule_set = self.rule_set;
        let entity_rules = std::mem::take(&mut self.entity_rules);
        for &index in &entity_rules {
            let Some(VoiceTrigger {
                subject:
                    VoiceSubject::Entity {
                        monster_id,
                        scope: owner_scope,
                    },
                event: VoiceEvent::ExpiringIn { seconds_before },
            }) = self.rules.get(index).map(|rule| rule.trigger.clone())
            else {
                continue;
            };
            let lead_ms = u64::from(seconds_before).saturating_mul(1_000);
            // One timer per audible entity: every entity of an unmerged
            // entry, and in a merged track only those whose countdown reaches
            // the lead while it is the one shown.
            let mut live_instances = HashSet::new();
            for track in tracks.iter().filter(|track| {
                track.spec.monster_id == monster_id && track.spec.scope == owner_scope
            }) {
                for (entity, expires) in track.audible_expiries(lead_ms) {
                    let instance = entity.0 as u64;
                    live_instances.insert(instance);
                    let outcome = self.deadlines.sync(
                        entity_voice_key(rule_set, index, instance),
                        Some(expires),
                        seconds_before,
                        now_mono,
                        reason,
                        scheduler,
                    );
                    if outcome == SyncOutcome::FireNow {
                        self.fire_rule(index, now_ms, None);
                    }
                }
            }
            self.deadlines.cancel_where(
                |key| {
                    matches!(
                        key,
                        TimerKey::VoiceExpiry { rule_handle, subject, instance, .. }
                            if *subject == ENTITY_TIMER_SUBJECT
                                && *rule_handle == index as u64
                                && !live_instances.contains(instance)
                    )
                },
                scheduler,
            );
        }
        self.entity_rules = entity_rules;

        // Presence edges, aggregated per (monster_id, scope) so several
        // instances or tracks announce one "appeared" and one "gone".
        let current = tracks
            .iter()
            .map(|track| (track.spec.monster_id, track.spec.scope))
            .collect::<BTreeSet<_>>();
        if reason == VoiceSyncReason::Runtime && self.entity_presence_seeded {
            let previous = std::mem::take(&mut self.entity_presence);
            for &(monster_id, owner_scope) in previous.symmetric_difference(&current) {
                let appeared = current.contains(&(monster_id, owner_scope));
                let matched = self.take_matched(SubjectKey::Entity(monster_id));
                for &index in &matched {
                    let Some(trigger) = self.rules.get(index).map(|rule| &rule.trigger) else {
                        continue;
                    };
                    let VoiceSubject::Entity { scope, .. } = trigger.subject else {
                        continue;
                    };
                    let wanted = match trigger.event {
                        VoiceEvent::Started => appeared,
                        VoiceEvent::Ended => !appeared,
                        _ => false,
                    };
                    if scope == owner_scope && wanted {
                        self.fire_rule(index, now_ms, None);
                    }
                }
                self.matched_rules = matched;
            }
        }
        self.entity_presence = current;
        self.entity_presence_seeded = true;
    }

    /// Rebuilds the buff aggregates from `entities`, fires any resulting
    /// gained/lost edges (runtime only), and re-syncs expiry timers. Shared
    /// by every buff-affecting path so they all stay in lockstep.
    fn refresh_buff_aggregates(
        &mut self,
        entities: &EntityContext,
        reason: VoiceSyncReason,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let edges = self.replace_buff_aggregates(
            collect_buff_aggregates(entities),
            reason == VoiceSyncReason::Runtime,
        );
        self.fire_buff_edges(&edges, now_ms);
        self.sync_buff_expiries(reason, now_ms, now_mono, scheduler);
    }

    fn replace_buff_aggregates(
        &mut self,
        current: BuffAggregates,
        emit_edges: bool,
    ) -> Vec<BuffEdge> {
        if !emit_edges {
            self.buff_aggregates = current;
            return Vec::new();
        }

        let mut keys = BTreeSet::new();
        for (scope, buffs) in &self.buff_aggregates {
            keys.extend(buffs.keys().map(|base_id| (*scope, *base_id)));
        }
        for (scope, buffs) in &current {
            keys.extend(buffs.keys().map(|base_id| (*scope, *base_id)));
        }

        let mut edges = Vec::new();
        for (scope, base_id) in keys {
            let previous = self
                .buff_aggregates
                .get(&scope)
                .and_then(|buffs| buffs.get(&base_id));
            let next = current.get(&scope).and_then(|buffs| buffs.get(&base_id));
            match (previous, next) {
                (None, Some(aggregate)) => edges.push(BuffEdge {
                    scope,
                    base_id,
                    gained: true,
                    fantasy_tier: aggregate.fantasy_tier,
                }),
                (Some(aggregate), None) => edges.push(BuffEdge {
                    scope,
                    base_id,
                    gained: false,
                    fantasy_tier: aggregate.fantasy_tier,
                }),
                _ => {}
            }
        }
        self.buff_aggregates = current;
        edges
    }

    fn fire_buff_edges(&mut self, edges: &[BuffEdge], now_ms: i64) {
        if edges.is_empty() {
            return;
        }
        // Handles are staged in the scratch buffer because firing needs
        // `&mut self` while `rules_by_subject` would still be borrowed.
        let mut matched = std::mem::take(&mut self.matched_rules);
        for edge in edges {
            matched.clear();
            let Some(indices) = self
                .rules_by_subject
                .get(&edge.scope.subject_key(edge.base_id))
            else {
                continue;
            };
            matched.extend(
                indices
                    .iter()
                    .copied()
                    .filter(|index| matches_buff_edge(&self.rules[*index].trigger, *edge)),
            );
            for &index in &matched {
                self.fire_rule(index, now_ms, edge.fantasy_tier);
            }
        }
        self.matched_rules = matched;
    }

    fn fire_alert(&mut self, alert: AlertKind, now_ms: i64) {
        // Alert subjects only validate with `Started`, so every indexed
        // handle fires.
        let matched = self.take_matched(SubjectKey::Alert(alert));
        for &index in &matched {
            self.fire_rule(index, now_ms, None);
        }
        self.matched_rules = matched;
    }

    fn sync_buff_expiries(
        &mut self,
        reason: VoiceSyncReason,
        now_ms: i64,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        // Handles are stable between `apply_config` calls, so the index list
        // is moved out and restored rather than cloned per sync.
        let buff_expiry_rules = std::mem::take(&mut self.buff_expiry_rules);
        for &index in &buff_expiry_rules {
            let Some((scope, base_id, seconds_before)) = self
                .rules
                .get(index)
                .and_then(|rule| buff_expiry_rule(&rule.trigger))
            else {
                continue;
            };
            let key = buff_voice_key(self.rule_set, index, scope, base_id);
            let expires = self
                .buff_aggregates
                .get(&scope)
                .and_then(|buffs| buffs.get(&base_id))
                .and_then(|aggregate| aggregate.expires_mono_ms);
            let outcome = self
                .deadlines
                .sync(key, expires, seconds_before, now, reason, scheduler);
            if outcome == SyncOutcome::FireNow {
                self.fire_rule(index, now_ms, None);
            }
        }
        self.buff_expiry_rules = buff_expiry_rules;
    }

    /// A mechanic re-fire re-aims the timer at the new expiry; one that lands
    /// inside the lead window is for the caller to announce right away.
    fn sync_boss_expiry(
        &mut self,
        index: usize,
        base_skill_id: i32,
        expires: MonoTimeMs,
        seconds_before: u32,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> SyncOutcome {
        let key = boss_voice_key(self.rule_set, index, base_skill_id);
        self.deadlines.sync(
            key,
            Some(expires),
            seconds_before,
            now,
            VoiceSyncReason::Runtime,
            scheduler,
        )
    }

    fn cancel_boss_expiries(&mut self, scheduler: &mut DeadlineScheduler) {
        self.deadlines.cancel_where(
            |key| {
                matches!(
                    key,
                    TimerKey::VoiceExpiry { subject, .. } if *subject == BOSS_DBM_TIMER_SUBJECT
                )
            },
            scheduler,
        );
    }

    fn on_deadline(
        &mut self,
        key: TimerKey,
        scheduled_for: MonoTimeMs,
        fired_at: MonoTimeMs,
        now_ms: i64,
        scheduler: &mut DeadlineScheduler,
    ) {
        let TimerKey::VoiceExpiry {
            rule_set,
            rule_handle,
            subject,
            instance,
        } = key
        else {
            return;
        };
        if rule_set != self.rule_set {
            return;
        }
        // A refill wakeup carries no cue of its own: re-reading the skill's
        // timeline at the refill fires the charge edge and re-aims its lead
        // cues, so a stale or repeated delivery is harmless.
        if subject == SKILL_REFILL_TIMER_SUBJECT {
            let skill_id = instance as u32 as i32;
            self.evaluate_skill(
                skill_id,
                VoiceSyncReason::Runtime,
                now_ms,
                fired_at,
                scheduler,
            );
            return;
        }
        let Ok(index) = usize::try_from(rule_handle) else {
            return;
        };
        if index >= self.rules.len() {
            return;
        }
        // The tracker is the single source of truth for what is armed: a
        // stale or superseded delivery does not match its recorded deadline.
        if !self.deadlines.confirm(key, scheduled_for, fired_at) {
            return;
        }
        self.fire_rule(index, now_ms, None);
    }

    fn fire_rule(&mut self, index: usize, now_ms: i64, tier: Option<u8>) {
        let Some(rule) = self.rules.get(index) else {
            return;
        };
        if !rule.enabled
            || self
                .last_fire_ms
                .get(&index)
                .is_some_and(|last| now_ms.saturating_sub(*last) < rule.cooldown_ms as i64)
        {
            return;
        }
        self.last_fire_ms.insert(index, now_ms);
        let phrase_id = tier
            .and_then(|tier| {
                rule.phrase_id_by_tier
                    .as_ref()
                    .and_then(|phrases| phrases.get(&tier))
            })
            .cloned()
            .unwrap_or_else(|| rule.phrase_id.clone());
        self.pending_cues.push(VoiceCueIntent {
            rule_id: rule.id.clone(),
            phrase_id,
            priority: rule.priority,
            triggered_at_ms: now_ms,
        });
    }
}

fn collect_buff_aggregates(entities: &EntityContext) -> BuffAggregates {
    let mut builders: HashMap<VoiceBuffScope, HashMap<i32, BuffAggregateBuilder>> = HashMap::new();
    if let Some(local) = entities.local_player() {
        for buff in entities.active_buffs(local.uuid) {
            record_aggregate(&mut builders, VoiceBuffScope::LocalPlayer, buff, entities);
        }
    }

    if let Some(target) = entities.current_attack_target() {
        let local = entities.local_player();
        for buff in entities.active_buffs(target.uuid) {
            record_aggregate(
                &mut builders,
                VoiceBuffScope::MonsterAnySource,
                buff,
                entities,
            );
            // Legacy parity: "local player source" means the buff's raw source
            // is the player, not a summon/fantasy owned by the player.
            if local.is_some() && buff.source == local {
                record_aggregate(
                    &mut builders,
                    VoiceBuffScope::MonsterLocalPlayerSource,
                    buff,
                    entities,
                );
            }
        }
    }

    builders
        .into_iter()
        .map(|(scope, buffs)| {
            (
                scope,
                buffs
                    .into_iter()
                    .map(|(base_id, aggregate)| (base_id, aggregate.finish()))
                    .collect(),
            )
        })
        .collect()
}

fn record_aggregate(
    builders: &mut HashMap<VoiceBuffScope, HashMap<i32, BuffAggregateBuilder>>,
    scope: VoiceBuffScope,
    buff: &BuffState,
    entities: &EntityContext,
) {
    builders
        .entry(scope)
        .or_default()
        .entry(buff.base_id)
        .or_default()
        .record(buff, entities);
}

/// Scope a buff-subject rule observes, or `None` for non-buff subjects.
fn buff_rule_scope(subject: &VoiceSubject) -> Option<(VoiceBuffScope, i32)> {
    match subject {
        VoiceSubject::Buff { buff_id } => Some((VoiceBuffScope::LocalPlayer, *buff_id)),
        VoiceSubject::MonsterBuff {
            buff_id,
            source_scope,
        } => Some((monster_scope(*source_scope), *buff_id)),
        _ => None,
    }
}

fn matches_buff_edge(trigger: &VoiceTrigger, edge: BuffEdge) -> bool {
    let Some((scope, base_id)) = buff_rule_scope(&trigger.subject) else {
        return false;
    };
    if scope != edge.scope || base_id != edge.base_id {
        return false;
    }
    match trigger.event {
        VoiceEvent::Started => edge.gained,
        VoiceEvent::Ended => !edge.gained,
        _ => false,
    }
}

fn buff_expiry_rule(trigger: &VoiceTrigger) -> Option<(VoiceBuffScope, i32, u32)> {
    let seconds_before = trigger.seconds_before()?;
    let (scope, base_id) = buff_rule_scope(&trigger.subject)?;
    Some((scope, base_id, seconds_before))
}

const fn monster_scope(scope: MonsterBuffSourceScope) -> VoiceBuffScope {
    match scope {
        MonsterBuffSourceScope::AnySource => VoiceBuffScope::MonsterAnySource,
        MonsterBuffSourceScope::LocalPlayerSource => VoiceBuffScope::MonsterLocalPlayerSource,
    }
}

fn buff_voice_key(rule_set: u64, index: usize, scope: VoiceBuffScope, base_id: i32) -> TimerKey {
    voice_key(
        rule_set,
        index,
        scope.timer_subject(),
        u64::from(base_id as u32),
    )
}

/// `TimerKey::VoiceExpiry::subject` discriminants beyond the three buff
/// scopes (0-2).
const BOSS_DBM_TIMER_SUBJECT: u64 = 3;
const COUNTER_TIMER_SUBJECT: u64 = 4;
const SKILL_TIMER_SUBJECT: u64 = 5;
const ENTITY_TIMER_SUBJECT: u64 = 6;
const SKILL_REFILL_TIMER_SUBJECT: u64 = 7;

/// A `Skill/ExpiringIn` rule's lead cue before the skill's next refill.
fn skill_voice_key(rule_set: u64, index: usize, skill_id: i32) -> TimerKey {
    voice_key(
        rule_set,
        index,
        SKILL_TIMER_SUBJECT,
        u64::from(skill_id as u32),
    )
}

/// The wakeup at a skill's next charge refill. It belongs to the skill, not
/// to a rule, so its handle can never match a rule index.
fn skill_refill_key(rule_set: u64, skill_id: i32) -> TimerKey {
    TimerKey::VoiceExpiry {
        rule_set,
        rule_handle: u64::MAX,
        subject: SKILL_REFILL_TIMER_SUBJECT,
        instance: u64::from(skill_id as u32),
    }
}

/// `instance` is the watched entity's uuid, so concurrent instances of the
/// same monster id each carry their own expiry timer.
fn entity_voice_key(rule_set: u64, index: usize, instance: u64) -> TimerKey {
    voice_key(rule_set, index, ENTITY_TIMER_SUBJECT, instance)
}

fn boss_voice_key(rule_set: u64, index: usize, base_skill_id: i32) -> TimerKey {
    voice_key(
        rule_set,
        index,
        BOSS_DBM_TIMER_SUBJECT,
        u64::from(base_skill_id as u32),
    )
}

fn counter_voice_key(rule_set: u64, index: usize, rule_id: i32, slot_id: i32) -> TimerKey {
    voice_key(
        rule_set,
        index,
        COUNTER_TIMER_SUBJECT,
        (u64::from(rule_id as u32) << 32) | u64::from(slot_id as u32),
    )
}

fn voice_key(rule_set: u64, index: usize, subject: u64, instance: u64) -> TimerKey {
    TimerKey::VoiceExpiry {
        rule_set,
        rule_handle: index as u64,
        subject,
        instance,
    }
}
