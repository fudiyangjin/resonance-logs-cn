//! Unified "fire N seconds before `expires`" timer bookkeeping for the voice
//! projection. Every voice deadline (buff, boss mechanic, counter freeze,
//! later skill / entity) goes through one [`DeadlineTracker`] so the
//! projection has a single place that decides when to (re)schedule, when
//! to leave an already-due timer alone, and whether a fired timer is still
//! the one it armed.

use std::collections::HashMap;

use crate::live::runtime::events::{MonoTimeMs, TimerKey, TimerScope};
use crate::live::runtime::scheduler::{DeadlineScheduler, TimerTask};

/// What [`DeadlineTracker::sync`] did with the timer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SyncOutcome {
    /// Same deadline as before (or nothing to arm and nothing armed).
    Unchanged,
    /// A future deadline was (re)scheduled.
    Armed,
    /// `expires` was `None` and a pending timer was cancelled.
    Cancelled,
    /// A pending *future* timer was pulled back to a deadline that is
    /// already in the past. The timer is cancelled; callers that want the
    /// event to still be observed (e.g. "skill is ready now") must fire it
    /// themselves.
    CollapsedToPast,
}

#[derive(Debug, Default)]
pub(super) struct DeadlineTracker {
    armed: HashMap<TimerKey, MonoTimeMs>,
}

impl DeadlineTracker {
    /// Brings the timer under `key` in line with `expires - seconds_before`.
    ///
    /// * `expires == None` cancels any pending timer.
    /// * An unchanged deadline is a no-op, preserving the scheduler's
    ///   same-deadline insertion order.
    /// * A deadline already `< now` is never scheduled. If a timer for
    ///   `key` is armed and is itself already due, it is left alone so the
    ///   next `drain_due` still delivers it — a packet processed just
    ///   before the drain must not swallow the cue.
    pub(super) fn sync(
        &mut self,
        key: TimerKey,
        scope: TimerScope,
        expires: Option<MonoTimeMs>,
        seconds_before: u32,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> SyncOutcome {
        let deadline =
            expires.map(|at| at.saturating_sub(u64::from(seconds_before).saturating_mul(1_000)));
        match (self.armed.get(&key).copied(), deadline) {
            (None, None) => SyncOutcome::Unchanged,
            (Some(_), None) => {
                self.cancel(key, scheduler);
                SyncOutcome::Cancelled
            }
            (Some(old), Some(new)) if old == new => SyncOutcome::Unchanged,
            (Some(old), Some(new)) if new < now => {
                if old < now {
                    SyncOutcome::Unchanged
                } else {
                    self.cancel(key, scheduler);
                    SyncOutcome::CollapsedToPast
                }
            }
            (None, Some(new)) if new < now => SyncOutcome::Unchanged,
            (_, Some(new)) => {
                scheduler.schedule(key, scope, new, TimerTask::VoiceExpiry);
                self.armed.insert(key, new);
                SyncOutcome::Armed
            }
        }
    }

    /// Validates a `DeadlineReached` for `key`: the timer must still be
    /// tracked with exactly `scheduled_for`, and must not have fired early.
    /// On success the entry is consumed.
    pub(super) fn confirm(
        &mut self,
        key: TimerKey,
        scheduled_for: MonoTimeMs,
        fired_at: MonoTimeMs,
    ) -> bool {
        let matches = self
            .armed
            .get(&key)
            .is_some_and(|armed| *armed == scheduled_for && fired_at >= scheduled_for);
        if matches {
            self.armed.remove(&key);
        }
        matches
    }

    pub(super) fn cancel(&mut self, key: TimerKey, scheduler: &mut DeadlineScheduler) -> bool {
        if self.armed.remove(&key).is_none() {
            return false;
        }
        scheduler.cancel(key);
        true
    }

    /// Cancels every tracked timer whose key satisfies `predicate`.
    pub(super) fn cancel_where(
        &mut self,
        mut predicate: impl FnMut(&TimerKey) -> bool,
        scheduler: &mut DeadlineScheduler,
    ) {
        self.armed.retain(|key, _| {
            if predicate(key) {
                scheduler.cancel(*key);
                false
            } else {
                true
            }
        });
    }

    /// Forgets every timer without touching the scheduler. For use right
    /// after the caller invalidated the whole scheduler scope.
    pub(super) fn clear(&mut self) {
        self.armed.clear();
    }

    #[cfg(test)]
    pub(super) fn armed_deadline(&self, key: TimerKey) -> Option<MonoTimeMs> {
        self.armed.get(&key).copied()
    }

    #[cfg(test)]
    pub(super) fn len(&self) -> usize {
        self.armed.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCOPE: TimerScope = TimerScope::RuleSet(1);

    fn key(handle: u64) -> TimerKey {
        TimerKey::VoiceExpiry {
            rule_set: 1,
            rule_handle: handle,
            subject: 0,
            instance: 7,
        }
    }

    #[test]
    fn identical_resync_is_a_no_op() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let armed = tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(10_000)),
            2,
            MonoTimeMs(1_000),
            &mut scheduler,
        );
        assert_eq!(armed, SyncOutcome::Armed);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(8_000)));

        let again = tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(10_000)),
            2,
            MonoTimeMs(2_000),
            &mut scheduler,
        );
        assert_eq!(again, SyncOutcome::Unchanged);
        assert_eq!(scheduler.len(), 1);
    }

    #[test]
    fn past_deadline_is_never_armed_from_scratch() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let outcome = tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(2_000)),
            1,
            MonoTimeMs(1_001),
            &mut scheduler,
        );
        assert_eq!(outcome, SyncOutcome::Unchanged);
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn already_due_timer_is_left_for_drain() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(5_000)),
            0,
            MonoTimeMs(1_000),
            &mut scheduler,
        );
        // Time has passed the deadline but the actor has not drained yet; a
        // packet moves the expiry slightly earlier (also in the past).
        let outcome = tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(4_900)),
            0,
            MonoTimeMs(6_000),
            &mut scheduler,
        );
        assert_eq!(outcome, SyncOutcome::Unchanged);
        let due = scheduler.drain_due(MonoTimeMs(6_000));
        assert_eq!(due.len(), 1);
        assert!(tracker.confirm(key(1), MonoTimeMs(5_000), MonoTimeMs(6_000)));
    }

    #[test]
    fn future_timer_pulled_into_past_collapses() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(20_000)),
            0,
            MonoTimeMs(1_000),
            &mut scheduler,
        );
        let outcome = tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(1_500)),
            0,
            MonoTimeMs(2_000),
            &mut scheduler,
        );
        assert_eq!(outcome, SyncOutcome::CollapsedToPast);
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn none_cancels_and_confirm_rejects_stale_schedule() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(10_000)),
            0,
            MonoTimeMs(1_000),
            &mut scheduler,
        );
        tracker.sync(
            key(1),
            SCOPE,
            Some(MonoTimeMs(12_000)),
            0,
            MonoTimeMs(1_000),
            &mut scheduler,
        );
        assert_eq!(scheduler.drain_due(MonoTimeMs(12_000)).len(), 1);
        // A DeadlineReached carrying the superseded deadline is rejected.
        assert!(!tracker.confirm(key(1), MonoTimeMs(10_000), MonoTimeMs(10_000)));
        // Firing early is rejected too.
        assert!(!tracker.confirm(key(1), MonoTimeMs(12_000), MonoTimeMs(11_999)));
        assert!(tracker.confirm(key(1), MonoTimeMs(12_000), MonoTimeMs(12_000)));
        // Consumed: a duplicate delivery is ignored.
        assert!(!tracker.confirm(key(1), MonoTimeMs(12_000), MonoTimeMs(12_000)));

        tracker.sync(
            key(2),
            SCOPE,
            Some(MonoTimeMs(12_000)),
            0,
            MonoTimeMs(1_000),
            &mut scheduler,
        );
        assert_eq!(
            tracker.sync(key(2), SCOPE, None, 0, MonoTimeMs(1_000), &mut scheduler),
            SyncOutcome::Cancelled
        );
        assert!(scheduler.is_empty());
    }

    #[test]
    fn cancel_where_only_touches_matching_keys() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        for handle in 1..=3 {
            tracker.sync(
                key(handle),
                SCOPE,
                Some(MonoTimeMs(10_000)),
                0,
                MonoTimeMs(1_000),
                &mut scheduler,
            );
        }
        tracker.cancel_where(
            |key| matches!(key, TimerKey::VoiceExpiry { rule_handle, .. } if *rule_handle != 2),
            &mut scheduler,
        );
        assert_eq!(tracker.len(), 1);
        assert_eq!(scheduler.len(), 1);
        assert_eq!(tracker.armed_deadline(key(2)), Some(MonoTimeMs(10_000)));
    }
}
