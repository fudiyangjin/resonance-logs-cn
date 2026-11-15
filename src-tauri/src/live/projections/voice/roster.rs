//! Battle roster skill lead cues: ahead of the moment a roster monster may
//! cast a watched skill (again), read from the roster's own readiness — the
//! one the skill cells count down to. One timer per monster and skill: a
//! monster that leaves the roster or casts again simply changes the derived
//! set, and a pack reaching the moment together is merged by the rule's
//! cooldown. The `Started` cue is a cast edge the roster reports (see
//! [`VoiceProjection::on_roster_cast`]).

use super::deadline::TimerClass;
use super::{VoiceProjection, VoiceSyncReason};
use crate::live::projections::monster_roster::MonsterRosterProjection;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{MonoTimeMs, VoiceLeadSubject};
use crate::live::runtime::scheduler::DeadlineScheduler;

impl VoiceProjection {
    /// Re-derives the roster skill cues when the roster's skill timing
    /// changed.
    pub(super) fn sync_roster(
        &mut self,
        reason: VoiceSyncReason,
        roster: &MonsterRosterProjection,
        entities: &EntityContext,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        // Nothing is armed without lead rules, and a rule-set change
        // forgets the seen revision, so skipping here loses nothing.
        if self.book.roster_leads.is_empty() {
            return;
        }
        let Some(reason) = self.seen.roster.observe(roster.timing_revision(), reason) else {
            return;
        };
        self.leads.clear();
        for ready in roster.skill_readiness(entities) {
            let Some(rules) = self.book.roster_leads.get(&ready.skill_id) else {
                continue;
            };
            for lead in rules {
                lead.push_timers(
                    VoiceLeadSubject::RosterSkill {
                        entity: ready.entity,
                        skill_id: ready.skill_id,
                    },
                    ready.ready_at,
                    &mut self.leads,
                );
            }
        }
        self.reconcile_leads(TimerClass::RosterSkill, now_ms, now_mono, reason, scheduler);
    }
}
