//! Indexed voice-rule projection using the shared deadline scheduler.
//!
//! Rules are keyed by their [`VoiceSubject`] (minus scope details) so every
//! engine path does one map lookup and then filters the handful of rules on
//! that subject by event / scope.

use std::collections::{BTreeSet, HashMap};

use crate::live::counter::engine::{CounterEngine, CounterNamespace};
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    BuffState, BuffTransition, DomainEnvelope, DomainEvent, MonoTimeMs, TimerKey, TimerScope,
};
use crate::live::runtime::scheduler::DeadlineScheduler;
use crate::voice::models::{
    AlertKind, MonsterBuffSourceScope, VoiceCueIntent, VoiceEvent, VoiceRule, VoiceRuntimeSnapshot,
    VoiceSubject, VoiceTrigger,
};

mod deadline;
#[cfg(test)]
mod tests;

use deadline::DeadlineTracker;

/// Lookup key derived from a [`VoiceSubject`] with scope details stripped:
/// the buff aggregates are keyed per base id, and the source scope is
/// checked when matching an edge against the candidate rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SubjectKey {
    Buff(i32),
    MonsterBuff(i32),
    BossDbm(i32),
    Counter { rule_id: i32, slot_id: i32 },
    Alert(AlertKind),
}

impl SubjectKey {
    fn of(subject: &VoiceSubject) -> Self {
        match subject {
            VoiceSubject::Buff { buff_id } => Self::Buff(*buff_id),
            VoiceSubject::MonsterBuff { buff_id, .. } => Self::MonsterBuff(*buff_id),
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
    buff_aggregates: BuffAggregates,
    /// Every armed voice timer, keyed by its scheduler key.
    deadlines: DeadlineTracker,
    rule_set: u64,
    last_fire_ms: HashMap<usize, i64>,
    counter_crossed: HashMap<(i32, i32), bool>,
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
    }

    pub fn apply_config(
        &mut self,
        config: &VoiceRuntimeSnapshot,
        entities: &EntityContext,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        if self.rule_set != 0 {
            scheduler.invalidate_scope(TimerScope::RuleSet(self.rule_set));
        }
        self.deadlines.clear();
        self.rule_set = self.rule_set.wrapping_add(1).max(1);
        self.rules.clone_from(&config.rules);
        self.rebuild_rule_indexes();
        self.last_fire_ms.clear();
        self.counter_crossed.clear();
        self.buff_aggregates = collect_buff_aggregates(entities);
        self.sync_buff_expiries(now_mono, scheduler);
    }

    /// Rebuilds the trigger lookup indexes from `rules`. Every path that
    /// replaces `rules` must call this, so the indexes can never drift out of
    /// sync with the rule list they point into.
    fn rebuild_rule_indexes(&mut self) {
        self.rules_by_subject.clear();
        self.counter_rules.clear();
        self.buff_expiry_rules.clear();
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
                let emit_edges = buff.transition != BuffTransition::Baseline;
                self.refresh_buff_aggregates(
                    entities,
                    emit_edges,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                    scheduler,
                );
            }
            DomainEvent::EntityDisappeared { .. } => {
                self.refresh_buff_aggregates(
                    entities,
                    true,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                    scheduler,
                );
            }
            DomainEvent::EntityAppeared { .. }
            | DomainEvent::IdentityChanged { .. }
            | DomainEvent::LocalPlayerChanged { .. }
            | DomainEvent::AttackTargetChanged { .. }
            | DomainEvent::DeathOccurred { .. } => {
                self.replace_buff_aggregates(collect_buff_aggregates(entities), false);
                self.sync_buff_expiries(envelope.meta.mono_ms(), scheduler);
            }
            DomainEvent::SceneChanged { .. } => self.cancel_boss_expiries(scheduler),
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
                            self.sync_boss_expiry(
                                index,
                                mechanic.base_skill_id,
                                mechanic.expires_mono_ms,
                                seconds_before,
                                envelope.meta.mono_ms(),
                                scheduler,
                            );
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
            } => self.on_deadline(*key, *scheduled_for, *fired_at, envelope.occurred_at_ms),
            _ => {}
        }
    }

    pub fn apply_counters(
        &mut self,
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
                    if crossed && !previous {
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
                            now_mono.saturating_add(expiry_wall.saturating_sub(now_ms).max(0) as u64)
                        });
                    self.deadlines.sync(
                        key,
                        TimerScope::RuleSet(self.rule_set),
                        expires,
                        seconds_before,
                        now_mono,
                        scheduler,
                    );
                }
                _ => {}
            }
        }
        self.counter_rules = counter_rules;
    }

    /// Rebuilds the buff aggregates from `entities`, fires any resulting
    /// gained/lost edges, and re-arms expiry timers. Shared by the buff and
    /// entity-departure paths so both stay in lockstep.
    fn refresh_buff_aggregates(
        &mut self,
        entities: &EntityContext,
        emit_edges: bool,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let edges = self.replace_buff_aggregates(collect_buff_aggregates(entities), emit_edges);
        self.fire_buff_edges(&edges, now_ms);
        self.sync_buff_expiries(now_mono, scheduler);
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

    fn sync_buff_expiries(&mut self, now: MonoTimeMs, scheduler: &mut DeadlineScheduler) {
        for &index in &self.buff_expiry_rules {
            let Some(rule) = self.rules.get(index) else {
                continue;
            };
            let Some((scope, base_id, seconds_before)) = buff_expiry_rule(&rule.trigger) else {
                continue;
            };
            let key = buff_voice_key(self.rule_set, index, scope, base_id);
            let expires = self
                .buff_aggregates
                .get(&scope)
                .and_then(|buffs| buffs.get(&base_id))
                .and_then(|aggregate| aggregate.expires_mono_ms);
            self.deadlines.sync(
                key,
                TimerScope::RuleSet(self.rule_set),
                expires,
                seconds_before,
                now,
                scheduler,
            );
        }
    }

    fn sync_boss_expiry(
        &mut self,
        index: usize,
        base_skill_id: i32,
        expires: MonoTimeMs,
        seconds_before: u32,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let key = boss_voice_key(self.rule_set, index, base_skill_id);
        // A mechanic re-fire always restarts the timer, even to the same
        // deadline; cancelling first defeats the same-deadline short-cut
        // only when the deadline is unchanged, which is a no-op anyway.
        self.deadlines.sync(
            key,
            TimerScope::RuleSet(self.rule_set),
            Some(expires),
            seconds_before,
            now,
            scheduler,
        );
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
    ) {
        let TimerKey::VoiceExpiry {
            rule_set,
            rule_handle,
            ..
        } = key
        else {
            return;
        };
        if rule_set != self.rule_set {
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
