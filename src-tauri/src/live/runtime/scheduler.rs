//! Deterministic, synchronous deadline scheduling for the live actor.
//!
//! The scheduler owns no clock and performs no sleeping. The actor asks for
//! [`DeadlineScheduler::next_deadline`], waits alongside packet/control input,
//! and calls [`DeadlineScheduler::drain_due`] when that monotonic time arrives.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet};

use super::events::{MonoTimeMs, SegmentId, SegmentReason};
pub use super::events::{TimerKey, TimerKind, TimerScope};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TickSchedule {
    pub started_at: MonoTimeMs,
    pub interval_ms: u64,
    pub expires_at: Option<MonoTimeMs>,
    pub applied_ticks: u64,
}

impl TickSchedule {
    #[must_use]
    pub const fn new(
        started_at: MonoTimeMs,
        interval_ms: u64,
        expires_at: Option<MonoTimeMs>,
    ) -> Self {
        Self {
            started_at,
            interval_ms: if interval_ms == 0 { 1 } else { interval_ms },
            expires_at,
            applied_ticks: 0,
        }
    }

    /// Returns the deadline for the next unapplied tick. Expiration is an
    /// exclusive bound: a tick exactly at `expires_at` is not emitted.
    #[must_use]
    pub fn next_deadline(self) -> Option<MonoTimeMs> {
        let offset = self.interval_ms.checked_mul(self.applied_ticks)?;
        let deadline = MonoTimeMs(self.started_at.0.checked_add(offset)?);
        if self
            .expires_at
            .is_some_and(|expires_at| deadline >= expires_at)
        {
            None
        } else {
            Some(deadline)
        }
    }

    /// Advances all ticks due at `now` in O(1). A delayed actor receives one
    /// merged count instead of one callback per missed interval.
    #[must_use]
    pub fn advance_to(self, now: MonoTimeMs) -> TickAdvance {
        let horizon = self
            .expires_at
            .map_or(now, |expires_at| now.min(expires_at.saturating_sub(1)));
        let due_total = if self
            .expires_at
            .is_some_and(|expires_at| expires_at <= self.started_at)
            || horizon < self.started_at
        {
            0
        } else {
            horizon
                .0
                .saturating_sub(self.started_at.0)
                .checked_div(self.interval_ms)
                .unwrap_or_default()
                .saturating_add(1)
        };
        let applied_ticks = self.applied_ticks.max(due_total);
        let schedule = Self {
            applied_ticks,
            ..self
        };
        TickAdvance {
            tick_count: due_total.saturating_sub(self.applied_ticks),
            next_deadline: schedule.next_deadline(),
            expired: self.expires_at.is_some_and(|expires_at| now >= expires_at),
            schedule,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TickAdvance {
    pub tick_count: u64,
    pub next_deadline: Option<MonoTimeMs>,
    pub expired: bool,
    pub schedule: TickSchedule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TimerTask {
    CounterFreeze,
    BuffTick(TickSchedule),
    SkillTick(TickSchedule),
    VoiceExpiry,
    BossDbmExpiry,
    GameTimer,
    SegmentBoundary { reason: SegmentReason },
    SegmentMaxDuration { segment_id: SegmentId },
    TrainingWindow { segment_id: SegmentId },
}

impl TimerTask {
    #[must_use]
    pub const fn kind(self) -> TimerKind {
        match self {
            Self::CounterFreeze => TimerKind::CounterFreeze,
            Self::BuffTick(_) => TimerKind::BuffTick,
            Self::SkillTick(_) => TimerKind::SkillTick,
            Self::VoiceExpiry => TimerKind::VoiceExpiry,
            Self::BossDbmExpiry => TimerKind::BossDbmExpiry,
            Self::GameTimer => TimerKind::GameTimer,
            Self::SegmentBoundary { .. } => TimerKind::SegmentBoundary,
            Self::SegmentMaxDuration { .. } => TimerKind::SegmentMaxDuration,
            Self::TrainingWindow { .. } => TimerKind::TrainingWindow,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DueTimer {
    pub key: TimerKey,
    pub kind: TimerKind,
    pub scope: TimerScope,
    pub scheduled_for: MonoTimeMs,
    pub generation: u64,
    pub task: TimerTask,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScheduledState {
    deadline: MonoTimeMs,
    scope: TimerScope,
    generation: u64,
    insertion_order: u64,
    task: TimerTask,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct HeapEntry {
    deadline: MonoTimeMs,
    insertion_order: u64,
    generation: u64,
    key: TimerKey,
    scope: TimerScope,
    task: TimerTask,
}

#[derive(Debug, Default)]
pub struct DeadlineScheduler {
    active: HashMap<TimerKey, ScheduledState>,
    heap: BinaryHeap<Reverse<HeapEntry>>,
    keys_by_scope: HashMap<TimerScope, HashSet<TimerKey>>,
    next_generation: u64,
    next_insertion_order: u64,
}

impl DeadlineScheduler {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Inserts or replaces one logical timer. Repeating an identical schedule
    /// is idempotent and does not change same-deadline ordering.
    pub fn schedule(
        &mut self,
        key: TimerKey,
        scope: TimerScope,
        deadline: MonoTimeMs,
        task: TimerTask,
    ) {
        debug_assert_eq!(key.kind(), task.kind());
        if let Some(existing) = self.active.get(&key).copied() {
            if existing.deadline == deadline && existing.scope == scope && existing.task == task {
                return;
            }
            self.remove_scope_key(existing.scope, key);
        }

        let generation = take_sequence(&mut self.next_generation);
        let insertion_order = take_sequence(&mut self.next_insertion_order);
        let state = ScheduledState {
            deadline,
            scope,
            generation,
            insertion_order,
            task,
        };

        self.active.insert(key, state);
        self.keys_by_scope.entry(scope).or_default().insert(key);
        self.heap.push(Reverse(HeapEntry {
            deadline,
            insertion_order,
            generation,
            key,
            scope,
            task,
        }));
    }

    pub fn cancel(&mut self, key: TimerKey) -> bool {
        let Some(state) = self.active.remove(&key) else {
            return false;
        };
        self.remove_scope_key(state.scope, key);
        true
    }

    /// Invalidates every active timer in one ownership scope. Heap records are
    /// discarded lazily; the active map and scope index are cleaned eagerly.
    pub fn invalidate_scope(&mut self, scope: TimerScope) -> usize {
        let Some(keys) = self.keys_by_scope.remove(&scope) else {
            return 0;
        };
        let mut removed = 0;
        for key in keys {
            if self
                .active
                .get(&key)
                .is_some_and(|state| state.scope == scope)
            {
                self.active.remove(&key);
                removed += 1;
            }
        }
        removed
    }

    /// Returns the earliest live deadline after pruning cancelled or replaced
    /// heap entries.
    pub fn next_deadline(&mut self) -> Option<MonoTimeMs> {
        self.prune_stale_head();
        self.heap.peek().map(|entry| entry.0.deadline)
    }

    /// Pops all timers with `deadline <= now`, ordered by deadline and then by
    /// original insertion order.
    pub fn drain_due(&mut self, now: MonoTimeMs) -> Vec<DueTimer> {
        let mut due = Vec::new();
        loop {
            self.prune_stale_head();
            let Some(Reverse(entry)) = self.heap.peek().copied() else {
                break;
            };
            if entry.deadline > now {
                break;
            }
            self.heap.pop();
            if !self.is_current(entry) {
                continue;
            }
            self.active.remove(&entry.key);
            self.remove_scope_key(entry.scope, entry.key);
            due.push(DueTimer {
                key: entry.key,
                kind: entry.key.kind(),
                scope: entry.scope,
                scheduled_for: entry.deadline,
                generation: entry.generation,
                task: entry.task,
            });
        }
        due
    }

    #[cfg(test)]
    #[must_use]
    pub fn len(&self) -> usize {
        self.active.len()
    }

    #[cfg(test)]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.active.is_empty()
    }

    #[cfg(test)]
    pub fn clear(&mut self) {
        self.active.clear();
        self.heap.clear();
        self.keys_by_scope.clear();
        self.next_generation = 0;
        self.next_insertion_order = 0;
    }

    fn prune_stale_head(&mut self) {
        while self
            .heap
            .peek()
            .is_some_and(|entry| !self.is_current(entry.0))
        {
            self.heap.pop();
        }
    }

    fn is_current(&self, entry: HeapEntry) -> bool {
        matches!(
            self.active.get(&entry.key),
            Some(state)
                if state.deadline == entry.deadline
                    && state.scope == entry.scope
                    && state.generation == entry.generation
                    && state.insertion_order == entry.insertion_order
                    && state.task == entry.task
        )
    }

    fn remove_scope_key(&mut self, scope: TimerScope, key: TimerKey) {
        let should_remove_scope = self.keys_by_scope.get_mut(&scope).is_some_and(|keys| {
            keys.remove(&key);
            keys.is_empty()
        });
        if should_remove_scope {
            self.keys_by_scope.remove(&scope);
        }
    }
}

fn take_sequence(sequence: &mut u64) -> u64 {
    let current = *sequence;
    *sequence = sequence.wrapping_add(1);
    current
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{VoiceLeadSubject, VoiceRuleHandle, VoiceTimer};

    fn voice_timer(id: u64) -> VoiceTimer {
        VoiceTimer::Lead {
            rule: VoiceRuleHandle(u32::try_from(id).expect("small test handle")),
            subject: VoiceLeadSubject::BossDbm { base_skill_id: 20 },
        }
    }

    fn voice_key(id: u64) -> TimerKey {
        TimerKey::VoiceExpiry {
            rule_set: 1,
            timer: voice_timer(id),
        }
    }

    #[test]
    fn no_packet_poll_fires_at_deadline() {
        let mut scheduler = DeadlineScheduler::new();
        let key = voice_key(1);
        scheduler.schedule(
            key,
            TimerScope::Runtime,
            MonoTimeMs(5_000),
            TimerTask::VoiceExpiry,
        );

        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(5_000)));
        assert!(scheduler.drain_due(MonoTimeMs(4_999)).is_empty());
        assert_eq!(scheduler.drain_due(MonoTimeMs(5_000))[0].key, key);
        assert!(scheduler.is_empty());
    }

    #[test]
    fn same_deadline_uses_insertion_order() {
        let mut scheduler = DeadlineScheduler::new();
        let first = voice_key(7);
        let second = voice_key(2);
        let third = voice_key(99);
        for key in [first, second, third] {
            scheduler.schedule(
                key,
                TimerScope::Runtime,
                MonoTimeMs(10),
                TimerTask::VoiceExpiry,
            );
        }

        let keys: Vec<_> = scheduler
            .drain_due(MonoTimeMs(10))
            .into_iter()
            .map(|timer| timer.key)
            .collect();
        assert_eq!(keys, vec![first, second, third]);
    }

    #[test]
    fn identical_schedule_is_idempotent_and_keeps_order() {
        let mut scheduler = DeadlineScheduler::new();
        let first = voice_key(1);
        let second = voice_key(2);
        scheduler.schedule(
            first,
            TimerScope::Runtime,
            MonoTimeMs(10),
            TimerTask::VoiceExpiry,
        );
        // Repeating an identical schedule is a no-op and must not reorder.
        scheduler.schedule(
            first,
            TimerScope::Runtime,
            MonoTimeMs(10),
            TimerTask::VoiceExpiry,
        );
        scheduler.schedule(
            second,
            TimerScope::Runtime,
            MonoTimeMs(10),
            TimerTask::VoiceExpiry,
        );

        let keys: Vec<_> = scheduler
            .drain_due(MonoTimeMs(10))
            .into_iter()
            .map(|timer| timer.key)
            .collect();
        assert_eq!(keys, vec![first, second]);
    }

    #[test]
    fn reschedule_leaves_old_heap_entry_stale() {
        let mut scheduler = DeadlineScheduler::new();
        let key = voice_key(1);
        scheduler.schedule(
            key,
            TimerScope::Runtime,
            MonoTimeMs(10),
            TimerTask::VoiceExpiry,
        );
        // Rescheduling leaves the old heap entry stale; the new deadline wins.
        scheduler.schedule(
            key,
            TimerScope::Runtime,
            MonoTimeMs(30),
            TimerTask::VoiceExpiry,
        );

        assert!(scheduler.drain_due(MonoTimeMs(10)).is_empty());
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(30)));
        assert_eq!(scheduler.drain_due(MonoTimeMs(30)).len(), 1);
    }

    #[test]
    fn cancel_prunes_the_heap_head() {
        let mut scheduler = DeadlineScheduler::new();
        let cancelled = voice_key(1);
        let live = voice_key(2);
        scheduler.schedule(
            cancelled,
            TimerScope::Runtime,
            MonoTimeMs(10),
            TimerTask::VoiceExpiry,
        );
        scheduler.schedule(
            live,
            TimerScope::Runtime,
            MonoTimeMs(20),
            TimerTask::VoiceExpiry,
        );
        assert!(scheduler.cancel(cancelled));

        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(20)));
        assert_eq!(scheduler.drain_due(MonoTimeMs(20))[0].key, live);
    }

    #[test]
    fn invalidate_scope_only_invalidates_that_scope() {
        let mut scheduler = DeadlineScheduler::new();
        let a_scope = TimerScope::RuleSet(1);
        let b_scope = TimerScope::RuleSet(2);
        let a1 = voice_key(1);
        let a2 = voice_key(2);
        let b = TimerKey::VoiceExpiry {
            rule_set: 2,
            timer: voice_timer(1),
        };
        scheduler.schedule(a1, a_scope, MonoTimeMs(10), TimerTask::VoiceExpiry);
        scheduler.schedule(a2, a_scope, MonoTimeMs(10), TimerTask::VoiceExpiry);
        scheduler.schedule(b, b_scope, MonoTimeMs(10), TimerTask::VoiceExpiry);

        assert_eq!(scheduler.invalidate_scope(a_scope), 2);
        assert_eq!(scheduler.len(), 1);
        assert_eq!(scheduler.drain_due(MonoTimeMs(10))[0].key, b);
    }

    #[test]
    fn rescheduling_after_scope_cancel_cannot_revive_old_entry() {
        let mut scheduler = DeadlineScheduler::new();
        let scope = TimerScope::RuleSet(1);
        let key = voice_key(1);
        scheduler.schedule(key, scope, MonoTimeMs(10), TimerTask::VoiceExpiry);
        scheduler.invalidate_scope(scope);
        scheduler.schedule(key, scope, MonoTimeMs(20), TimerTask::VoiceExpiry);

        assert!(scheduler.drain_due(MonoTimeMs(10)).is_empty());
        let due = scheduler.drain_due(MonoTimeMs(20));
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].key, key);
    }

    #[test]
    fn clear_removes_active_and_stale_entries() {
        let mut scheduler = DeadlineScheduler::new();
        scheduler.schedule(
            voice_key(1),
            TimerScope::Runtime,
            MonoTimeMs(10),
            TimerTask::VoiceExpiry,
        );
        scheduler.schedule(
            voice_key(1),
            TimerScope::Runtime,
            MonoTimeMs(20),
            TimerTask::VoiceExpiry,
        );
        scheduler.clear();

        assert!(scheduler.is_empty());
        assert_eq!(scheduler.next_deadline(), None);
        assert!(scheduler.drain_due(MonoTimeMs(u64::MAX)).is_empty());
    }

    #[test]
    fn delayed_periodic_tick_is_merged_arithmetically() {
        let schedule = TickSchedule::new(MonoTimeMs(1_000), 100, Some(MonoTimeMs(1_550)));

        let advance = schedule.advance_to(MonoTimeMs(1_425));
        assert_eq!(advance.tick_count, 5);
        assert_eq!(advance.schedule.applied_ticks, 5);
        assert_eq!(advance.next_deadline, Some(MonoTimeMs(1_500)));
        assert!(!advance.expired);

        let final_advance = advance.schedule.advance_to(MonoTimeMs(2_000));
        assert_eq!(final_advance.tick_count, 1);
        assert_eq!(final_advance.next_deadline, None);
        assert!(final_advance.expired);
    }

    #[test]
    fn zero_tick_interval_is_normalized_without_looping() {
        let schedule = TickSchedule::new(MonoTimeMs(10), 0, Some(MonoTimeMs(13)));
        let advance = schedule.advance_to(MonoTimeMs(20));

        assert_eq!(schedule.interval_ms, 1);
        assert_eq!(advance.tick_count, 3);
        assert_eq!(advance.next_deadline, None);
    }

    #[test]
    fn exclusive_expiry_at_start_emits_no_tick() {
        let schedule = TickSchedule::new(MonoTimeMs(0), 10, Some(MonoTimeMs(0)));
        let advance = schedule.advance_to(MonoTimeMs(100));

        assert_eq!(advance.tick_count, 0);
        assert_eq!(advance.next_deadline, None);
        assert!(advance.expired);
    }
}
