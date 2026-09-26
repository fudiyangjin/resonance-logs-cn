//! Counter-slot subjects: a threshold edge when a slot's count reaches its
//! target, and a lead cue before the slot's freeze window ends.

use super::deadline::{Lead, TimerClass};
use super::rule_book::CounterCue;
use super::{VoiceProjection, VoiceSyncReason};
use crate::live::counter::engine::{CounterEngine, CounterNamespace};
use crate::live::runtime::events::{MonoTimeMs, VoiceLeadSubject, VoiceTimer};
use crate::live::runtime::scheduler::DeadlineScheduler;

impl VoiceProjection {
    /// Re-derives every counter rule when the engine's state moved.
    pub(super) fn sync_counters(
        &mut self,
        reason: VoiceSyncReason,
        counters: &CounterEngine,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let Some(reason) = self.seen.counters.observe(counters.revision(), reason) else {
            return;
        };
        let mut crossed_now = std::mem::take(&mut self.handles);
        crossed_now.clear();
        self.leads.clear();
        for rule in &self.book.counters {
            let slot = counters.slot_state(CounterNamespace::Normal, rule.rule_id, rule.slot_id);
            match rule.cue {
                CounterCue::Threshold => {
                    let crossed = slot.as_ref().is_some_and(|slot| {
                        slot.effective_threshold
                            .is_some_and(|threshold| slot.current_count >= threshold)
                    });
                    let previous = self
                        .counter_crossed
                        .insert((rule.rule_id, rule.slot_id), crossed)
                        .unwrap_or(false);
                    if reason == VoiceSyncReason::Runtime && crossed && !previous {
                        crossed_now.push(rule.handle);
                    }
                }
                CounterCue::Freeze { lead_ms } => {
                    // Freeze windows are wall-clock; convert the remaining
                    // time onto the monotonic axis the scheduler runs on.
                    let Some(expiry_wall) = slot.and_then(|slot| slot.freeze_until_ms) else {
                        continue;
                    };
                    let remaining = u64::try_from(expiry_wall.saturating_sub(now_ms)).unwrap_or(0);
                    self.leads.push(Lead {
                        timer: VoiceTimer::Lead {
                            rule: rule.handle,
                            subject: VoiceLeadSubject::CounterFreeze {
                                rule_id: rule.rule_id,
                                slot_id: rule.slot_id,
                            },
                        },
                        expires: now_mono.saturating_add(remaining),
                        lead_ms,
                    });
                }
            }
        }
        for &handle in &crossed_now {
            self.fire(handle, now_ms, None, None);
        }
        self.handles = crossed_now;
        self.reconcile_leads(
            TimerClass::CounterFreeze,
            now_ms,
            now_mono,
            reason,
            scheduler,
        );
    }
}
