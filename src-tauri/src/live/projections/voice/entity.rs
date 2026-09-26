//! Entity-duration subjects: "appeared"/"gone" edges per watched
//! `(monster id, scope)` and a lead cue before each audible entity's
//! configured lifetime runs out, all read from the entity monitor's tracks.

use std::collections::BTreeSet;

use super::deadline::{Lead, TimerClass};
use super::rule_book::SubjectKey;
use super::{VoiceProjection, VoiceSyncReason};
use crate::live::projections::entity_monitor::EntityMonitorProjection;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{MonoTimeMs, VoiceLeadSubject, VoiceTimer};
use crate::live::runtime::scheduler::DeadlineScheduler;
use crate::voice::models::{EntityOwnerScope, VoiceEvent, VoiceSubject};

impl VoiceProjection {
    /// Re-derives entity cues when the watched entities changed.
    pub(super) fn sync_entities(
        &mut self,
        reason: VoiceSyncReason,
        monitor: &EntityMonitorProjection,
        entities: &EntityContext,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let Some(reason) = self
            .seen
            .entities
            .observe(monitor.revisions().watched_entities, reason)
        else {
            return;
        };
        // The same tracks the HUD renders, so cues follow what is on screen.
        let tracks = monitor.entity_duration().tracks(entities);

        // One timer per audible entity: every entity of an unmerged entry,
        // and in a merged track only those whose countdown reaches the lead
        // while it is the one shown. Entities that left are simply absent.
        self.leads.clear();
        for rule in &self.book.entity_leads {
            let matching = tracks.iter().filter(|track| {
                track.spec.monster_id == rule.monster_id && track.spec.scope == rule.scope
            });
            for track in matching {
                for (entity, expires) in track.audible_expiries(rule.lead_ms) {
                    self.leads.push(Lead {
                        timer: VoiceTimer::Lead {
                            rule: rule.handle,
                            subject: VoiceLeadSubject::Entity { entity },
                        },
                        expires,
                        lead_ms: rule.lead_ms,
                    });
                }
            }
        }
        self.reconcile_leads(TimerClass::Entity, now_ms, now_mono, reason, scheduler);

        // Presence edges, aggregated per (monster_id, scope) so several
        // instances or tracks announce one "appeared" and one "gone".
        let current = tracks
            .iter()
            .map(|track| (track.spec.monster_id, track.spec.scope))
            .collect::<BTreeSet<_>>();
        let previous = std::mem::replace(&mut self.entity_presence, current);
        if reason != VoiceSyncReason::Runtime || !self.book.entity_edges {
            return;
        }
        let edges = previous
            .symmetric_difference(&self.entity_presence)
            .map(|&(monster_id, scope)| {
                (monster_id, scope, !previous.contains(&(monster_id, scope)))
            })
            .collect::<Vec<_>>();
        for (monster_id, scope, appeared) in edges {
            self.fire_presence_edge(monster_id, scope, appeared, now_ms);
        }
    }

    fn fire_presence_edge(
        &mut self,
        monster_id: i32,
        owner_scope: EntityOwnerScope,
        appeared: bool,
        now_ms: i64,
    ) {
        let wanted = if appeared {
            VoiceEvent::Started
        } else {
            VoiceEvent::Ended
        };
        let mut handles = std::mem::take(&mut self.handles);
        handles.clear();
        handles.extend(
            self.book
                .matching(SubjectKey::Entity(monster_id))
                .iter()
                .copied()
                .filter(|handle| {
                    self.book.get(*handle).is_some_and(|rule| {
                        rule.trigger.event == wanted
                            && matches!(
                                rule.trigger.subject,
                                VoiceSubject::Entity { scope, .. } if scope == owner_scope
                            )
                    })
                }),
        );
        for &handle in &handles {
            self.fire(handle, now_ms, None, None);
        }
        self.handles = handles;
    }
}
