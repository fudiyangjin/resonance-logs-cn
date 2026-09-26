//! Local-skill cooldown cues: `Skill/Ended` fires every time a charge comes
//! back, and `Skill/ExpiringIn` counts down to the next one.
//!
//! The server sends nothing when a charge refills, so each watched skill
//! keeps the [`CooldownTimeline`] of its latest cooldown packet plus the
//! charges seen at the last derivation. A rise in charges is the ready edge,
//! whether time or a packet (a cooldown refund) caused it; a per-skill
//! refill wakeup, owned by the deadline tracker like every other voice
//! timer, re-derives the timelines when no packet comes.

use std::collections::HashMap;
use std::collections::hash_map::Entry;

use super::deadline::{Lead, TimerClass};
use super::{VoiceProjection, VoiceSyncReason};
use crate::live::projections::entity_monitor::{EntityMonitorProjection, SkillCdRecord};
use crate::live::projections::skill_cd::CooldownTimeline;
use crate::live::runtime::events::{MonoTimeMs, VoiceLeadSubject, VoiceTimer};
use crate::live::runtime::scheduler::DeadlineScheduler;

/// What the voice last saw of one watched skill's cooldown.
#[derive(Debug, Clone, Copy)]
pub(super) struct SkillTrack {
    timeline: CooldownTimeline,
    /// Charges usable at the last derivation.
    charges: u8,
}

impl VoiceProjection {
    /// Re-reads the local player's cooldown records when they changed.
    pub(super) fn sync_skills(
        &mut self,
        reason: VoiceSyncReason,
        monitor: &EntityMonitorProjection,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let Some(reason) = self
            .seen
            .skill_cds
            .observe(monitor.revisions().skill_cds, reason)
        else {
            return;
        };
        // Last-wins per base skill id, like the HUD: several level ids can
        // share a base id and the newest packet describes the live state.
        let mut latest: HashMap<i32, &SkillCdRecord> = HashMap::new();
        for record in monitor.skill_cooldowns() {
            let skill_id = record.skill_id();
            if !self.book.skills.contains_key(&skill_id) {
                continue;
            }
            latest
                .entry(skill_id)
                .and_modify(|current| {
                    if record.received_mono_ms >= current.received_mono_ms {
                        *current = record;
                    }
                })
                .or_insert(record);
        }

        // A skill whose record is gone (e.g. another local player) drops out,
        // and the reconcile below takes its timers with it.
        self.skills
            .retain(|skill_id, _| latest.contains_key(skill_id));
        for (skill_id, record) in latest {
            let timeline = record.timeline();
            match self.skills.entry(skill_id) {
                Entry::Occupied(mut track) => track.get_mut().timeline = timeline,
                // First sight is a baseline, never an edge.
                Entry::Vacant(slot) => {
                    slot.insert(SkillTrack {
                        timeline,
                        charges: timeline.charges_at(now_mono),
                    });
                }
            }
        }
        self.derive_skills(reason, now_ms, now_mono, scheduler);
    }

    /// Fires `Skill/Ended` for every watched skill whose charges rose since
    /// the last derivation, then re-aims the lead cues and refill wakeups at
    /// each skill's next refill.
    pub(super) fn derive_skills(
        &mut self,
        reason: VoiceSyncReason,
        now_ms: i64,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let mut ready = std::mem::take(&mut self.handles);
        ready.clear();
        self.leads.clear();
        for (&skill_id, track) in &mut self.skills {
            let Some(rules) = self.book.skills.get(&skill_id) else {
                continue;
            };
            let charges = track.timeline.charges_at(now);
            if reason == VoiceSyncReason::Runtime && charges > track.charges {
                ready.extend_from_slice(&rules.ready);
            }
            track.charges = charges;
            let Some(next_refill) = track.timeline.next_refill_after(now) else {
                continue;
            };
            for &(rule, lead_ms) in &rules.ready_in {
                self.leads.push(Lead {
                    timer: VoiceTimer::Lead {
                        rule,
                        subject: VoiceLeadSubject::SkillReady { skill_id },
                    },
                    expires: next_refill,
                    lead_ms,
                });
            }
        }
        for &handle in &ready {
            self.fire(handle, now_ms, None, None);
        }
        self.handles = ready;
        self.reconcile_leads(TimerClass::SkillReady, now_ms, now, reason, scheduler);

        self.leads.clear();
        for (&skill_id, track) in &self.skills {
            if let Some(next_refill) = track.timeline.next_refill_after(now) {
                self.leads.push(Lead {
                    timer: VoiceTimer::SkillRefill { skill_id },
                    expires: next_refill,
                    lead_ms: 0,
                });
            }
        }
        self.reconcile_leads(TimerClass::SkillRefill, now_ms, now, reason, scheduler);
    }
}
