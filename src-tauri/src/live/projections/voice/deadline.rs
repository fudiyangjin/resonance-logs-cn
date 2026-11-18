//! Voice timer bookkeeping. The tracker is the sole owner of every voice
//! timer — lead cues and skill refill wakeups alike — and the only way to
//! change them is [`DeadlineTracker::reconcile`]: a caller derives the full
//! set of timers one class should have right now from the source of truth,
//! and the tracker arms, moves and cancels to match. A subject that is gone
//! is simply absent from that set, so cleanup has no separate code path.

use std::collections::HashMap;

use super::VoiceSyncReason;
use crate::live::runtime::events::{
    MonoTimeMs, TimerKey, TimerScope, VoiceLeadSubject, VoiceRuleHandle, VoiceTimer,
};
use crate::live::runtime::scheduler::{DeadlineScheduler, TimerTask};

/// The timers one derivation owns; each class is reconciled on its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TimerClass {
    Buff,
    BossDbm,
    CounterFreeze,
    SkillReady,
    SkillRefill,
    Entity,
    RosterSkill,
    MonsterSkill,
}

impl TimerClass {
    const COUNT: usize = 8;

    pub(super) const fn of(timer: VoiceTimer) -> Self {
        match timer {
            VoiceTimer::SkillRefill { .. } => Self::SkillRefill,
            // A countdown's digits live and die with the phrase they follow.
            VoiceTimer::Lead { subject, .. } | VoiceTimer::Tick { subject, .. } => match subject {
                VoiceLeadSubject::Buff { .. } => Self::Buff,
                VoiceLeadSubject::BossDbm { .. } => Self::BossDbm,
                VoiceLeadSubject::CounterFreeze { .. } => Self::CounterFreeze,
                VoiceLeadSubject::SkillReady { .. } => Self::SkillReady,
                VoiceLeadSubject::Entity { .. } => Self::Entity,
                VoiceLeadSubject::RosterSkill { .. } => Self::RosterSkill,
                VoiceLeadSubject::MonsterSkill { .. } => Self::MonsterSkill,
            },
        }
    }

    const fn index(self) -> usize {
        self as usize
    }
}

/// One timer a derivation wants to exist: due `lead_ms` before `expires`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Lead {
    pub(super) timer: VoiceTimer,
    /// The moment the cue warns about (for a refill wakeup, the refill).
    pub(super) expires: MonoTimeMs,
    pub(super) lead_ms: u64,
    /// How long past its deadline the cue may still start; later it would
    /// speak about a moment that has moved on, so it is dropped. `None`
    /// never goes stale: a cue due at the expiry itself *is* that moment.
    pub(super) late_ms: Option<u64>,
}

impl Lead {
    fn deadline(self) -> MonoTimeMs {
        self.expires.saturating_sub(self.lead_ms)
    }

    /// Whether the cue may still start at `now`. Measured from the exact
    /// due moment, which — unlike [`Self::deadline`] — may lie before the
    /// clock's origin.
    fn staleness(self, now: MonoTimeMs) -> Staleness {
        Staleness::at(self.late_ms, self.expires, self.lead_ms, now)
    }
}

/// A pending lead cue that a runtime update pulled into the past; the
/// caller announces it right away.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Fire {
    pub(super) rule: VoiceRuleHandle,
    /// See [`Staleness`].
    pub(super) valid_for_ms: Option<u64>,
}

/// What an armed timer was scheduled for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Armed {
    pub(super) deadline: MonoTimeMs,
    late_ms: Option<u64>,
    /// The reconcile pass that last wanted this timer.
    pass: u32,
}

impl Armed {
    /// Whether the cue may still start at `fired_at`, when the timer was
    /// delivered.
    pub(super) fn staleness(self, fired_at: MonoTimeMs) -> Staleness {
        // An armed deadline was in the future when it was scheduled, so it
        // is the exact due moment.
        Staleness::at(self.late_ms, self.deadline, 0, fired_at)
    }
}

/// Whether a cue due at some deadline is still worth starting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Staleness {
    /// Still on time; `valid_for_ms` is how much longer it stays so
    /// (`None` never goes stale), for the wait in the playback queue.
    Fresh { valid_for_ms: Option<u64> },
    /// Too late to start.
    Stale,
}

impl Staleness {
    /// For a cue due `lead_ms` before `expires` that may start `late_ms`
    /// late.
    fn at(late_ms: Option<u64>, expires: MonoTimeMs, lead_ms: u64, now: MonoTimeMs) -> Self {
        let Some(late_ms) = late_ms else {
            return Self::Fresh { valid_for_ms: None };
        };
        let stale_at = expires.0.saturating_add(late_ms);
        match stale_at.checked_sub(now.0.saturating_add(lead_ms)) {
            Some(left) if left > 0 => Self::Fresh {
                valid_for_ms: Some(left),
            },
            _ => Self::Stale,
        }
    }
}

#[derive(Debug, Default)]
pub(super) struct DeadlineTracker {
    /// Epoch of the rule set whose timers are armed; every key carries it.
    rule_set: u64,
    armed: [HashMap<VoiceTimer, Armed>; TimerClass::COUNT],
    pass: u32,
}

impl DeadlineTracker {
    pub(super) fn replace_monster_cast(
        &mut self,
        rule: VoiceRuleHandle,
        subject: VoiceLeadSubject,
        desired: &[Lead],
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let rule_set = self.rule_set;
        let armed = &mut self.armed[TimerClass::MonsterSkill.index()];
        armed.retain(|timer, _| {
            let replaced = match *timer {
                VoiceTimer::Lead {
                    rule: old,
                    subject: previous,
                }
                | VoiceTimer::Tick {
                    rule: old,
                    subject: previous,
                    ..
                } => old == rule && previous == subject,
                VoiceTimer::SkillRefill { .. } => false,
            };
            if replaced {
                scheduler.cancel(voice_key(rule_set, *timer));
            }
            !replaced
        });
        for lead in desired {
            let deadline = lead.deadline();
            if deadline > now {
                arm(armed, rule_set, *lead, deadline, self.pass, scheduler);
            }
        }
    }

    #[cfg(test)]
    pub(super) const fn rule_set(&self) -> u64 {
        self.rule_set
    }

    /// Starts a new rule-set epoch: every timer of the previous one is
    /// invalidated at once and nothing is armed.
    pub(super) fn restart(&mut self, scheduler: &mut DeadlineScheduler) {
        if self.rule_set != 0 {
            scheduler.invalidate_scope(TimerScope::Voice(self.rule_set));
        }
        self.rule_set = self.rule_set.wrapping_add(1).max(1);
        for class in &mut self.armed {
            class.clear();
        }
    }

    /// Makes the armed timers of `class` exactly `desired`.
    ///
    /// Every desired timer goes through the same decision:
    /// * An unchanged deadline is left alone, preserving the scheduler's
    ///   same-deadline insertion order.
    /// * A deadline already `<= now` (what `drain_due(now)` would pop) is
    ///   never armed from scratch: a subject first seen inside its lead
    ///   window is not announced, and re-deriving right after a timer fired
    ///   cannot re-arm the same moment.
    /// * If the armed timer is itself already due, it is left alone so the
    ///   next `drain_due` still delivers it — a packet processed just before
    ///   the drain must not swallow the cue.
    /// * A pending future timer pulled to `<= now` is cancelled. A runtime
    ///   update then announces a phrase right away through `fire`, unless it
    ///   is already too late to start it ([`Lead::late_ms`]); a countdown
    ///   digit is never announced late, and a
    ///   [`VoiceSyncReason::Baseline`] rebuild drops everything silently.
    ///
    /// Armed timers of `class` missing from `desired` are cancelled: their
    /// subject is gone.
    pub(super) fn reconcile(
        &mut self,
        class: TimerClass,
        desired: &[Lead],
        now: MonoTimeMs,
        reason: VoiceSyncReason,
        scheduler: &mut DeadlineScheduler,
        fire: &mut Vec<Fire>,
    ) {
        self.pass = self.pass.wrapping_add(1);
        let pass = self.pass;
        let rule_set = self.rule_set;
        let armed = &mut self.armed[class.index()];
        for lead in desired {
            debug_assert_eq!(TimerClass::of(lead.timer), class);
            let deadline = lead.deadline();
            match armed.get(&lead.timer).map(|entry| entry.deadline) {
                Some(old) if old == deadline || (deadline <= now && old <= now) => {
                    if let Some(entry) = armed.get_mut(&lead.timer) {
                        entry.pass = pass;
                    }
                }
                Some(_) if deadline <= now => {
                    armed.remove(&lead.timer);
                    scheduler.cancel(voice_key(rule_set, lead.timer));
                    // Only a phrase catches up, and only while it is not too
                    // late to start; a countdown digit that was skipped over
                    // is simply not counted.
                    if reason == VoiceSyncReason::Runtime
                        && let VoiceTimer::Lead { rule, .. } = lead.timer
                        && let Staleness::Fresh { valid_for_ms } = lead.staleness(now)
                    {
                        fire.push(Fire { rule, valid_for_ms });
                    }
                }
                None if deadline <= now => {}
                _ => {
                    arm(armed, rule_set, *lead, deadline, pass, scheduler);
                }
            }
        }
        armed.retain(|timer, entry| {
            let wanted = entry.pass == pass;
            if !wanted {
                scheduler.cancel(voice_key(rule_set, *timer));
            }
            wanted
        });
    }

    /// Validates a `DeadlineReached`: it must belong to the current epoch,
    /// the timer must still be armed with exactly `scheduled_for`, and it
    /// must not have fired early. On success the entry is consumed.
    pub(super) fn confirm(
        &mut self,
        key: TimerKey,
        scheduled_for: MonoTimeMs,
        fired_at: MonoTimeMs,
    ) -> Option<(VoiceTimer, Armed)> {
        let TimerKey::VoiceExpiry { rule_set, timer } = key else {
            return None;
        };
        if rule_set != self.rule_set || fired_at < scheduled_for {
            return None;
        }
        let armed = &mut self.armed[TimerClass::of(timer).index()];
        let entry = armed.get(&timer).copied()?;
        if entry.deadline != scheduled_for {
            return None;
        }
        armed.remove(&timer);
        Some((timer, entry))
    }

    #[cfg(test)]
    pub(super) fn armed_deadline(&self, timer: VoiceTimer) -> Option<MonoTimeMs> {
        self.armed[TimerClass::of(timer).index()]
            .get(&timer)
            .map(|entry| entry.deadline)
    }

    #[cfg(test)]
    pub(super) fn len(&self) -> usize {
        self.armed.iter().map(HashMap::len).sum()
    }
}

fn arm(
    armed: &mut HashMap<VoiceTimer, Armed>,
    rule_set: u64,
    lead: Lead,
    deadline: MonoTimeMs,
    pass: u32,
    scheduler: &mut DeadlineScheduler,
) {
    scheduler.schedule(
        voice_key(rule_set, lead.timer),
        TimerScope::Voice(rule_set),
        deadline,
        TimerTask::VoiceExpiry,
    );
    armed.insert(
        lead.timer,
        Armed {
            deadline,
            late_ms: lead.late_ms,
            pass,
        },
    );
}

pub(super) const fn voice_key(rule_set: u64, timer: VoiceTimer) -> TimerKey {
    TimerKey::VoiceExpiry { rule_set, timer }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RUNTIME: VoiceSyncReason = VoiceSyncReason::Runtime;
    const BASELINE: VoiceSyncReason = VoiceSyncReason::Baseline;

    fn timer(handle: u32) -> VoiceTimer {
        VoiceTimer::Lead {
            rule: VoiceRuleHandle(handle),
            subject: VoiceLeadSubject::BossDbm { base_skill_id: 7 },
        }
    }

    /// A phrase that may start up to 1.5 s late, like an un-advanced rule.
    fn lead(handle: u32, expires: u64, seconds_before: u64) -> Lead {
        let lead_ms = seconds_before * 1_000;
        Lead {
            timer: timer(handle),
            expires: MonoTimeMs(expires),
            lead_ms,
            late_ms: (lead_ms > 0).then_some(1_500),
        }
    }

    fn tick(handle: u32, expires: u64, n: u8) -> Lead {
        Lead {
            timer: VoiceTimer::Tick {
                rule: VoiceRuleHandle(handle),
                subject: VoiceLeadSubject::BossDbm { base_skill_id: 7 },
                n,
            },
            expires: MonoTimeMs(expires),
            lead_ms: u64::from(n) * 1_000,
            late_ms: Some(300),
        }
    }

    fn tracker() -> (DeadlineTracker, DeadlineScheduler) {
        let mut tracker = DeadlineTracker::default();
        let mut scheduler = DeadlineScheduler::new();
        tracker.restart(&mut scheduler);
        (tracker, scheduler)
    }

    /// Reconciles the boss class to `desired` and returns what must fire.
    fn reconcile(
        tracker: &mut DeadlineTracker,
        scheduler: &mut DeadlineScheduler,
        desired: &[Lead],
        now: u64,
        reason: VoiceSyncReason,
    ) -> Vec<Fire> {
        let mut fire = Vec::new();
        tracker.reconcile(
            TimerClass::BossDbm,
            desired,
            MonoTimeMs(now),
            reason,
            scheduler,
            &mut fire,
        );
        fire
    }

    fn key(tracker: &DeadlineTracker, handle: u32) -> TimerKey {
        voice_key(tracker.rule_set(), timer(handle))
    }

    #[test]
    fn identical_reconcile_is_a_no_op() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 10_000, 2)],
            1_000,
            RUNTIME,
        );
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(8_000)));

        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 10_000, 2)],
            2_000,
            RUNTIME,
        );
        assert!(fired.is_empty());
        assert_eq!(scheduler.len(), 1);
        assert_eq!(tracker.len(), 1);
    }

    #[test]
    fn past_deadline_is_never_armed_from_scratch() {
        let (mut tracker, mut scheduler) = tracker();
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 2_000, 1)],
            1_001,
            RUNTIME,
        );
        assert!(fired.is_empty());
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn already_due_timer_is_left_for_drain() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 5_000, 0)],
            1_000,
            RUNTIME,
        );
        // Time has passed the deadline but the actor has not drained yet; a
        // packet moves the expiry slightly earlier (also in the past).
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 4_900, 0)],
            6_000,
            RUNTIME,
        );
        assert!(fired.is_empty());
        let due = scheduler.drain_due(MonoTimeMs(6_000));
        assert_eq!(due.len(), 1);
        let key = key(&tracker, 1);
        assert!(
            tracker
                .confirm(key, MonoTimeMs(5_000), MonoTimeMs(6_000))
                .is_some()
        );
    }

    #[test]
    fn armed_cue_pulled_inside_its_lead_window_fires_now() {
        let (mut tracker, mut scheduler) = tracker();
        // Expires at 11 000 with a 5 s lead: armed at 6 000.
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 11_000, 5)],
            1_000,
            RUNTIME,
        );

        // At 2 000 an update leaves 4.5 s: the lead moment was half a second
        // ago, still close enough to say so.
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 6_500, 5)],
            2_000,
            RUNTIME,
        );
        assert_eq!(
            fired,
            [Fire {
                rule: VoiceRuleHandle(1),
                valid_for_ms: Some(1_000),
            }]
        );
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);

        // Later updates inside the same window do not announce again.
        let again = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 6_000, 5)],
            2_500,
            RUNTIME,
        );
        assert!(again.is_empty());
    }

    #[test]
    fn armed_cue_pulled_too_far_inside_its_window_is_dropped() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 11_000, 5)],
            1_000,
            RUNTIME,
        );

        // 3 s left: "5 seconds left" would be wrong by now.
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 5_000, 5)],
            2_000,
            RUNTIME,
        );
        assert!(fired.is_empty());
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn countdown_digits_follow_the_expiry_and_never_catch_up() {
        let (mut tracker, mut scheduler) = tracker();
        let countdown = |expires| {
            [
                tick(1, expires, 3),
                tick(1, expires, 2),
                tick(1, expires, 1),
            ]
        };
        reconcile(
            &mut tracker,
            &mut scheduler,
            &countdown(10_000),
            1_000,
            RUNTIME,
        );
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(7_000)));

        // "3" is delivered on its second.
        let due = scheduler.drain_due(MonoTimeMs(7_000));
        assert_eq!(due.len(), 1);
        let (fired, armed) = tracker
            .confirm(due[0].key, MonoTimeMs(7_000), MonoTimeMs(7_050))
            .expect("the digit is armed");
        assert!(matches!(fired, VoiceTimer::Tick { n: 3, .. }));
        assert_eq!(
            armed.staleness(MonoTimeMs(7_050)),
            Staleness::Fresh {
                valid_for_ms: Some(250)
            }
        );
        assert_eq!(armed.staleness(MonoTimeMs(7_300)), Staleness::Stale);

        // The subject is refreshed right after: "2" and "1" move with the
        // new expiry, and the whole countdown is due again before it.
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &countdown(30_000),
            7_100,
            RUNTIME,
        );
        assert!(fired.is_empty());
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(27_000)));
        assert_eq!(tracker.len(), 3);

        // An update that jumps over "3" and "2" announces neither late.
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &countdown(9_000),
            7_500,
            RUNTIME,
        );
        assert!(fired.is_empty());
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(8_000)));
        assert_eq!(tracker.len(), 1);

        // The subject is gone: the rest of the countdown goes with it.
        reconcile(&mut tracker, &mut scheduler, &[], 7_600, RUNTIME);
        assert!(scheduler.is_empty());
    }

    #[test]
    fn armed_warning_pulled_past_its_moment_is_dropped() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 11_000, 5)],
            1_000,
            RUNTIME,
        );

        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 1_500, 5)],
            2_000,
            RUNTIME,
        );
        assert!(fired.is_empty());
        assert!(scheduler.is_empty());
        assert_eq!(tracker.len(), 0);
    }

    #[test]
    fn zero_lead_cue_pulled_into_the_past_fires_now() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 20_000, 0)],
            1_000,
            RUNTIME,
        );

        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 1_500, 0)],
            2_000,
            RUNTIME,
        );
        assert_eq!(
            fired,
            [Fire {
                rule: VoiceRuleHandle(1),
                valid_for_ms: None,
            }]
        );
        assert!(scheduler.is_empty());
    }

    #[test]
    fn baseline_reconcile_never_fires_but_still_arms_future_cues() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 11_000, 5)],
            1_000,
            RUNTIME,
        );

        // A rebuild that lands inside the lead window drops the cue silently,
        // a subject first seen inside its window stays silent, and a future
        // one is armed.
        let fired = reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 5_000, 5), lead(2, 5_000, 5), lead(3, 20_000, 5)],
            2_000,
            BASELINE,
        );
        assert!(fired.is_empty());
        assert_eq!(tracker.len(), 1);
        assert_eq!(tracker.armed_deadline(timer(3)), Some(MonoTimeMs(15_000)));
    }

    #[test]
    fn missing_subject_is_cancelled_and_confirm_rejects_stale_schedule() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 10_000, 0)],
            1_000,
            RUNTIME,
        );
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 12_000, 0)],
            1_000,
            RUNTIME,
        );
        assert_eq!(scheduler.drain_due(MonoTimeMs(12_000)).len(), 1);
        let key = key(&tracker, 1);
        // A DeadlineReached carrying the superseded deadline is rejected.
        assert!(
            tracker
                .confirm(key, MonoTimeMs(10_000), MonoTimeMs(10_000))
                .is_none()
        );
        // Firing early is rejected too.
        assert!(
            tracker
                .confirm(key, MonoTimeMs(12_000), MonoTimeMs(11_999))
                .is_none()
        );
        let (_, armed) = tracker
            .confirm(key, MonoTimeMs(12_000), MonoTimeMs(12_000))
            .expect("current delivery is confirmed");
        assert_eq!(armed.deadline, MonoTimeMs(12_000));
        // Consumed: a duplicate delivery is ignored.
        assert!(
            tracker
                .confirm(key, MonoTimeMs(12_000), MonoTimeMs(12_000))
                .is_none()
        );

        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(2, 12_000, 0)],
            1_000,
            RUNTIME,
        );
        assert_eq!(tracker.len(), 1);
        // The subject is gone from the desired set: its timer goes with it.
        reconcile(&mut tracker, &mut scheduler, &[], 1_000, RUNTIME);
        assert_eq!(tracker.len(), 0);
        assert!(scheduler.is_empty());
    }

    #[test]
    fn reconcile_only_touches_its_own_class() {
        let (mut tracker, mut scheduler) = tracker();
        let entity = Lead {
            timer: VoiceTimer::Lead {
                rule: VoiceRuleHandle(9),
                subject: VoiceLeadSubject::Entity {
                    entity: crate::live::runtime::events::EntityUuid(500),
                },
            },
            expires: MonoTimeMs(10_000),
            lead_ms: 0,
            late_ms: None,
        };
        let mut fire = Vec::new();
        tracker.reconcile(
            TimerClass::Entity,
            &[entity],
            MonoTimeMs(1_000),
            RUNTIME,
            &mut scheduler,
            &mut fire,
        );
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 10_000, 0)],
            1_000,
            RUNTIME,
        );
        // Emptying the boss class leaves the entity timer armed.
        reconcile(&mut tracker, &mut scheduler, &[], 1_000, RUNTIME);
        assert_eq!(tracker.len(), 1);
        assert_eq!(
            tracker.armed_deadline(entity.timer),
            Some(MonoTimeMs(10_000))
        );
        assert_eq!(scheduler.len(), 1);
    }

    #[test]
    fn restart_invalidates_only_the_previous_voice_epoch() {
        let (mut tracker, mut scheduler) = tracker();
        reconcile(
            &mut tracker,
            &mut scheduler,
            &[lead(1, 10_000, 0)],
            1_000,
            RUNTIME,
        );
        // A counter timer that happens to share the epoch number lives in
        // the counter's own scope and must survive a voice restart.
        let counter = TimerKey::CounterFreeze {
            rule_set: tracker.rule_set(),
            rule_id: 3,
            slot_id: 1,
        };
        scheduler.schedule(
            counter,
            TimerScope::RuleSet(tracker.rule_set()),
            MonoTimeMs(9_000),
            TimerTask::CounterFreeze,
        );
        let stale = key(&tracker, 1);
        tracker.restart(&mut scheduler);

        assert_eq!(tracker.len(), 0);
        assert_eq!(scheduler.len(), 1);
        assert_eq!(scheduler.drain_due(MonoTimeMs(10_000))[0].key, counter);
        // A delivery from the previous epoch can never confirm.
        assert!(
            tracker
                .confirm(stale, MonoTimeMs(10_000), MonoTimeMs(10_000))
                .is_none()
        );
    }
}
