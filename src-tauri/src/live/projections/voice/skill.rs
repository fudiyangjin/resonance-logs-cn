//! Local-skill cooldown cues: `Skill/Ended` fires every time a charge comes
//! back, and `Skill/ExpiringIn` counts down to the next one.
//!
//! The server sends nothing when a charge refills, so each watched skill
//! keeps the [`CooldownTimeline`] of its latest cooldown packet plus the
//! charges seen at the last evaluation. A rise in charges is the ready edge,
//! whether time or a packet (a cooldown refund) caused it, and a per-skill
//! wakeup at the next refill re-evaluates the timeline when no packet comes.

use std::collections::HashMap;
use std::collections::hash_map::Entry;

use super::deadline::voice_scope;
use super::{SyncOutcome, VoiceProjection, VoiceSyncReason, skill_refill_key, skill_voice_key};
use crate::live::projections::entity_monitor::{EntityMonitorProjection, SkillCdRecord};
use crate::live::projections::skill_cd::CooldownTimeline;
use crate::live::runtime::events::MonoTimeMs;
use crate::live::runtime::scheduler::{DeadlineScheduler, TimerTask};

/// Enabled cooldown rules of one local skill.
#[derive(Debug, Default)]
pub(super) struct SkillRules {
    /// `Ended` (and zero-lead `ExpiringIn`): every refilled charge.
    pub(super) ready: Vec<usize>,
    /// `ExpiringIn` as `(handle, seconds_before)`, aimed at the next refill.
    pub(super) ready_in: Vec<(usize, u32)>,
}

/// What the voice last saw of one watched skill's cooldown.
#[derive(Debug, Clone, Copy)]
pub(super) struct SkillTrack {
    timeline: CooldownTimeline,
    /// Charges usable at the last evaluation.
    charges: u8,
}

impl VoiceProjection {
    /// Reads the local player's cooldowns from the entity monitor and
    /// re-evaluates every watched skill whose latest packet changed.
    pub(super) fn sync_skills(
        &mut self,
        reason: VoiceSyncReason,
        monitor: &EntityMonitorProjection,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        // Last-wins per base skill id, like the HUD: several level ids can
        // share a base id and the newest packet describes the live state.
        let mut latest: HashMap<i32, &SkillCdRecord> = HashMap::new();
        for record in monitor.skill_cooldowns() {
            let skill_id = record.skill_id();
            if !self.skill_rules.contains_key(&skill_id) {
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

        let gone: Vec<i32> = self
            .skills
            .keys()
            .copied()
            .filter(|skill_id| !latest.contains_key(skill_id))
            .collect();
        for skill_id in gone {
            self.forget_skill(skill_id, scheduler);
        }

        for (skill_id, record) in latest {
            let timeline = record.timeline();
            match self.skills.entry(skill_id) {
                // Between packets only time moves a timeline, and the refill
                // wakeup already covers that.
                Entry::Occupied(track)
                    if reason == VoiceSyncReason::Runtime && track.get().timeline == timeline =>
                {
                    continue;
                }
                Entry::Occupied(mut track) => track.get_mut().timeline = timeline,
                // First sight is a baseline, never an edge.
                Entry::Vacant(slot) => {
                    slot.insert(SkillTrack {
                        timeline,
                        charges: timeline.charges_at(now_mono),
                    });
                }
            }
            self.evaluate_skill(skill_id, reason, now_ms, now_mono, scheduler);
        }
    }

    /// Fires `Skill/Ended` if charges refilled since the last evaluation,
    /// aims the lead cues at the next refill, and re-arms the refill wakeup.
    pub(super) fn evaluate_skill(
        &mut self,
        skill_id: i32,
        reason: VoiceSyncReason,
        now_ms: i64,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let Some(track) = self.skills.get_mut(&skill_id) else {
            return;
        };
        let charges = track.timeline.charges_at(now);
        let refilled = reason == VoiceSyncReason::Runtime && charges > track.charges;
        track.charges = charges;
        let next_refill = track.timeline.next_refill_after(now);
        let Some(rules) = self.skill_rules.get(&skill_id) else {
            return;
        };

        let mut due = std::mem::take(&mut self.matched_rules);
        due.clear();
        if refilled {
            due.extend_from_slice(&rules.ready);
        }
        for &(index, seconds_before) in &rules.ready_in {
            let key = skill_voice_key(self.rule_set, index, skill_id);
            let outcome =
                self.deadlines
                    .sync(key, next_refill, seconds_before, now, reason, scheduler);
            if outcome == SyncOutcome::FireNow {
                due.push(index);
            }
        }
        let wakeup = skill_refill_key(self.rule_set, skill_id);
        match next_refill {
            Some(at) => scheduler.schedule(wakeup, voice_scope(wakeup), at, TimerTask::VoiceExpiry),
            None => {
                scheduler.cancel(wakeup);
            }
        }
        for &index in &due {
            self.fire_rule(index, now_ms, None);
        }
        self.matched_rules = due;
    }

    /// Drops a skill whose cooldown record is gone (e.g. another local
    /// player), with its lead cues and refill wakeup.
    fn forget_skill(&mut self, skill_id: i32, scheduler: &mut DeadlineScheduler) {
        self.skills.remove(&skill_id);
        scheduler.cancel(skill_refill_key(self.rule_set, skill_id));
        let Some(rules) = self.skill_rules.get(&skill_id) else {
            return;
        };
        for &(index, _) in &rules.ready_in {
            self.deadlines
                .cancel(skill_voice_key(self.rule_set, index, skill_id), scheduler);
        }
    }
}
