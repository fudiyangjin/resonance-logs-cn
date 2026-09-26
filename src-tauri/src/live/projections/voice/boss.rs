//! Boss mechanic (DBM) lead cues, derived from the entity monitor's live
//! mechanics. A re-fire moves the timer; a mechanic the monitor dropped —
//! expired, scene change, runtime reset — takes its timer with it; and a
//! rule-set change re-arms every mechanic still running. The `Started`
//! cue is a cast edge handled in [`VoiceProjection::apply`].

use super::deadline::{Lead, TimerClass};
use super::{VoiceProjection, VoiceSyncReason};
use crate::live::projections::entity_monitor::EntityMonitorProjection;
use crate::live::runtime::events::{MonoTimeMs, VoiceLeadSubject, VoiceTimer};
use crate::live::runtime::scheduler::DeadlineScheduler;

impl VoiceProjection {
    pub(super) fn sync_boss_mechanics(
        &mut self,
        reason: VoiceSyncReason,
        monitor: &EntityMonitorProjection,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let Some(reason) = self
            .seen
            .boss_mechanics
            .observe(monitor.revisions().boss_mechanics, reason)
        else {
            return;
        };
        self.leads.clear();
        for rule in &self.book.boss_leads {
            let Some(expires) = monitor.boss_mechanic_expiry(rule.base_skill_id) else {
                continue;
            };
            self.leads.push(Lead {
                timer: VoiceTimer::Lead {
                    rule: rule.handle,
                    subject: VoiceLeadSubject::BossDbm {
                        base_skill_id: rule.base_skill_id,
                    },
                },
                expires,
                lead_ms: rule.lead_ms,
            });
        }
        self.reconcile_leads(TimerClass::BossDbm, now_ms, now_mono, reason, scheduler);
    }
}
