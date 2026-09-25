//! Unified "fire N seconds before `expires`" timer bookkeeping for the voice
//! projection. Every voice lead cue (buff, boss mechanic, counter freeze,
//! skill refill, entity lifetime) goes through one [`DeadlineTracker`] so the
//! projection has a single place that decides when to (re)schedule, when an
//! update that pulled a cue into the past must announce it right away, and
//! whether a fired timer is still the one it armed.

use std::collections::HashMap;

use super::VoiceSyncReason;
use crate::live::runtime::events::{MonoTimeMs, TimerKey, TimerScope};
use crate::live::runtime::scheduler::{DeadlineScheduler, TimerTask};

/// What [`DeadlineTracker::sync`] did with the timer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub(super) enum SyncOutcome {
    /// Same deadline as before (or nothing to arm and nothing armed).
    Unchanged,
    /// A future deadline was (re)scheduled.
    Armed,
    /// A pending timer was dropped without firing: its subject is gone, a
    /// baseline sync found it inside its lead window, or an update moved it
    /// past the very moment it warns about.
    Cancelled,
    /// A runtime update pulled a pending *future* cue to or before `now`
    /// while the moment it warns about is still ahead (or the cue has no
    /// lead). The timer is cancelled; the caller must fire the cue now.
    FireNow,
}

/// Voice timers live in the scheduler scope of the rule set that armed
/// them, which every [`TimerKey::VoiceExpiry`] carries.
pub(super) fn voice_scope(key: TimerKey) -> TimerScope {
    match key {
        TimerKey::VoiceExpiry { rule_set, .. } => TimerScope::RuleSet(rule_set),
        other => unreachable!("voice timers use VoiceExpiry keys, got {other:?}"),
    }
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
    /// * A deadline already `<= now` (what `drain_due(now)` would pop) is
    ///   never scheduled from scratch: a subject first seen inside its lead
    ///   window is not announced, and re-syncing right after a timer fired
    ///   cannot re-arm the same moment.
    /// * If the armed timer is itself already due, it is left alone so the
    ///   next `drain_due` still delivers it — a packet processed just before
    ///   the drain must not swallow the cue.
    /// * A pending future timer pulled to `<= now` is cancelled. A runtime
    ///   update then fires it right away ([`SyncOutcome::FireNow`]), unless
    ///   it warns about a moment that has already come; a
    ///   [`VoiceSyncReason::Baseline`] rebuild drops it silently.
    pub(super) fn sync(
        &mut self,
        key: TimerKey,
        expires: Option<MonoTimeMs>,
        seconds_before: u32,
        now: MonoTimeMs,
        reason: VoiceSyncReason,
        scheduler: &mut DeadlineScheduler,
    ) -> SyncOutcome {
        let lead_ms = u64::from(seconds_before).saturating_mul(1_000);
        let deadline = expires.map(|at| at.saturating_sub(lead_ms));
        match (self.armed.get(&key).copied(), deadline) {
            (None, None) => SyncOutcome::Unchanged,
            (Some(_), None) => {
                self.cancel(key, scheduler);
                SyncOutcome::Cancelled
            }
            (Some(old), Some(new)) if old == new => SyncOutcome::Unchanged,
            (Some(old), Some(new)) if new <= now => {
                if old <= now {
                    return SyncOutcome::Unchanged;
                }
                self.cancel(key, scheduler);
                // "N seconds left" is stale once the moment itself has come;
                // a zero-lead cue *is* that moment and still speaks.
                let still_ahead = lead_ms == 0 || expires.is_some_and(|at| at > now);
                if reason == VoiceSyncReason::Runtime && still_ahead {
                    SyncOutcome::FireNow
                } else {
                    SyncOutcome::Cancelled
                }
            }
            (None, Some(new)) if new <= now => SyncOutcome::Unchanged,
            (_, Some(new)) => {
                scheduler.schedule(key, voice_scope(key), new, TimerTask::VoiceExpiry);
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

    const RUNTIME: VoiceSyncReason = VoiceSyncReason::Runtime;
    const BASELINE: VoiceSyncReason = VoiceSyncReason::Baseline;

    fn key(handle: u64) -> TimerKey {
        TimerKey::VoiceExpiry {
            rule_set: 1,
            rule_handle: handle,
            subject: 0,
            instance: 7,
        }
    }

    fn sync(
        tracker: &mut DeadlineTracker,
        scheduler: &mut DeadlineScheduler,
        handle: u64,
        expires: Option<u64>,
        seconds_before: u32,
        now: u64,
        reason: VoiceSyncReason,
    ) -> SyncOutcome {
        tracker.sync(
            key(handle),
            expires.map(MonoTimeMs),
            seconds_before,
            MonoTimeMs(now),
            reason,
            scheduler,
        )
    }

    #[test]
    fn identical_resync_is_a_no_op() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let armed = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(10_000),
            2,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(8_000)));

        let again = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(10_000),
            2,
            2_000,
            RUNTIME,
        );
        assert_eq!(again, SyncOutcome::Unchanged);
        assert_eq!(scheduler.len(), 1);
    }

    #[test]
    fn past_deadline_is_never_armed_from_scratch() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let outcome = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(2_000),
            1,
            1_001,
            RUNTIME,
        );
        assert_eq!(outcome, SyncOutcome::Unchanged);
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn already_due_timer_is_left_for_drain() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let armed = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(5_000),
            0,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);
        // Time has passed the deadline but the actor has not drained yet; a
        // packet moves the expiry slightly earlier (also in the past).
        let outcome = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(4_900),
            0,
            6_000,
            RUNTIME,
        );
        assert_eq!(outcome, SyncOutcome::Unchanged);
        let due = scheduler.drain_due(MonoTimeMs(6_000));
        assert_eq!(due.len(), 1);
        assert!(tracker.confirm(key(1), MonoTimeMs(5_000), MonoTimeMs(6_000)));
    }

    #[test]
    fn armed_cue_pulled_inside_its_lead_window_fires_now() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        // Expires at 11 000 with a 5 s lead: armed at 6 000.
        let armed = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(11_000),
            5,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);

        // At 2 000 an update leaves 3 s: the lead moment is gone, the expiry
        // is not.
        let outcome = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(5_000),
            5,
            2_000,
            RUNTIME,
        );
        assert_eq!(outcome, SyncOutcome::FireNow);
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);

        // Later updates inside the same window do not announce again.
        let again = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(4_000),
            5,
            3_000,
            RUNTIME,
        );
        assert_eq!(again, SyncOutcome::Unchanged);
    }

    #[test]
    fn armed_warning_pulled_past_its_moment_is_dropped() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let armed = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(11_000),
            5,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);

        let outcome = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(1_500),
            5,
            2_000,
            RUNTIME,
        );
        assert_eq!(outcome, SyncOutcome::Cancelled);
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn zero_lead_cue_pulled_into_the_past_fires_now() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let armed = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(20_000),
            0,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);

        let outcome = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(1_500),
            0,
            2_000,
            RUNTIME,
        );
        assert_eq!(outcome, SyncOutcome::FireNow);
        assert!(scheduler.is_empty());
    }

    #[test]
    fn baseline_sync_never_fires_but_still_arms_future_cues() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let armed = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(11_000),
            5,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);

        // A rebuild that lands inside the lead window drops the cue silently.
        let dropped = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(5_000),
            5,
            2_000,
            BASELINE,
        );
        assert_eq!(dropped, SyncOutcome::Cancelled);
        assert!(scheduler.is_empty());

        let inside = sync(
            &mut tracker,
            &mut scheduler,
            2,
            Some(5_000),
            5,
            2_000,
            BASELINE,
        );
        assert_eq!(inside, SyncOutcome::Unchanged);
        let future = sync(
            &mut tracker,
            &mut scheduler,
            3,
            Some(20_000),
            5,
            2_000,
            BASELINE,
        );
        assert_eq!(future, SyncOutcome::Armed);
        assert_eq!(tracker.len(), 1);
    }

    #[test]
    fn none_cancels_and_confirm_rejects_stale_schedule() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        let first = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(10_000),
            0,
            1_000,
            RUNTIME,
        );
        let moved = sync(
            &mut tracker,
            &mut scheduler,
            1,
            Some(12_000),
            0,
            1_000,
            RUNTIME,
        );
        assert_eq!((first, moved), (SyncOutcome::Armed, SyncOutcome::Armed));
        assert_eq!(scheduler.drain_due(MonoTimeMs(12_000)).len(), 1);
        // A DeadlineReached carrying the superseded deadline is rejected.
        assert!(!tracker.confirm(key(1), MonoTimeMs(10_000), MonoTimeMs(10_000)));
        // Firing early is rejected too.
        assert!(!tracker.confirm(key(1), MonoTimeMs(12_000), MonoTimeMs(11_999)));
        assert!(tracker.confirm(key(1), MonoTimeMs(12_000), MonoTimeMs(12_000)));
        // Consumed: a duplicate delivery is ignored.
        assert!(!tracker.confirm(key(1), MonoTimeMs(12_000), MonoTimeMs(12_000)));

        let armed = sync(
            &mut tracker,
            &mut scheduler,
            2,
            Some(12_000),
            0,
            1_000,
            RUNTIME,
        );
        assert_eq!(armed, SyncOutcome::Armed);
        assert_eq!(
            sync(&mut tracker, &mut scheduler, 2, None, 0, 1_000, RUNTIME),
            SyncOutcome::Cancelled
        );
        assert!(scheduler.is_empty());
    }

    #[test]
    fn cancel_where_only_touches_matching_keys() {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        for handle in 1..=3 {
            let armed = sync(
                &mut tracker,
                &mut scheduler,
                handle,
                Some(10_000),
                0,
                1_000,
                RUNTIME,
            );
            assert_eq!(armed, SyncOutcome::Armed);
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
