//! Local skill damage hits for the skill damage HUD domain.
//!
//! Hits on watched damage ids are kept, or every local damage hit while
//! `monitor_all` is set. Lifecycle steps of watched casts are kept beside
//! them, so a cast can open and settle a damage window. The topic is dirtied
//! only when a hit or cast is accepted or the windows are cleared; clients
//! consume both windows incrementally through the id sequence they share.

use std::collections::VecDeque;

use crate::live::bootstrap_snapshot::SkillDamageRuntimeSnapshot;
use crate::live::ipc::models::{
    LiveSkillDamagePayload, SkillDamageCastPhase, SkillDamageCastState, SkillDamageHitState,
};
use crate::live::runtime::events::{
    BatchId, DomainEnvelope, DomainEvent, EntityRef, HitKind, SkillPhase,
};

/// Most entries each window holds at once.
const MAX_RETAINED: usize = 128;
/// Entries older than the window's newest one by more than this are dropped.
const RETAIN_WINDOW_MS: i64 = 5_000;

#[derive(Debug, Default)]
pub struct SkillDamageProjection {
    /// Sorted, deduplicated (normalized by the runtime snapshot).
    watched: Vec<i64>,
    /// Sorted, deduplicated (normalized by the runtime snapshot).
    watched_cast_ids: Vec<i32>,
    monitor_all: bool,
    hits: VecDeque<SkillDamageHitState>,
    casts: VecDeque<SkillDamageCastState>,
    /// Last issued hit or cast id; never reset, so ids stay unique for the
    /// runtime.
    sequence: u64,
    /// Last issued batch ordinal and the capture batch it stands for.
    batch_ordinal: u64,
    last_batch: Option<BatchId>,
    revision: u64,
}

impl SkillDamageProjection {
    /// Replaces the watch lists. Retained entries stay: clients already
    /// consumed them by id, so dropping them would only churn the payload.
    pub fn apply_config(&mut self, config: &SkillDamageRuntimeSnapshot) {
        self.watched.clone_from(&config.watched_skill_keys);
        self.watched_cast_ids.clone_from(&config.watched_cast_ids);
        self.monitor_all = config.monitor_all;
    }

    /// Returns true when the published windows changed. `local` is the local
    /// player, whose casts are the only ones collected.
    pub fn apply(&mut self, envelope: &DomainEnvelope, local: Option<EntityRef>) -> bool {
        let newest = envelope.occurred_at_ms;
        match &envelope.event {
            DomainEvent::HitResolved(hit) | DomainEvent::CombatHitAccepted(hit)
                if hit.source_is_local_player
                    && hit.kind == HitKind::Damage
                    && hit.amount > 0
                    && (self.monitor_all || self.watched.binary_search(&hit.skill_key).is_ok()) =>
            {
                if self.last_batch != Some(envelope.batch_id) {
                    self.last_batch = Some(envelope.batch_id);
                    self.batch_ordinal = self.batch_ordinal.wrapping_add(1);
                }
                let id = self.next_id();
                self.hits.push_back(SkillDamageHitState {
                    id,
                    batch: self.batch_ordinal,
                    target_uuid: hit.target.uuid.0.to_string(),
                    skill_id: hit.skill_key,
                    amount: hit.amount.to_string(),
                    occurred_at_ms: newest,
                });
                trim_window(&mut self.hits, newest, |hit| hit.occurred_at_ms);
                true
            }
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase,
                ..
            } if Some(*caster) == local
                && self.watched_cast_ids.binary_search(skill_id).is_ok() =>
            {
                let Some(phase) = cast_phase(*phase) else {
                    return false;
                };
                let id = self.next_id();
                self.casts.push_back(SkillDamageCastState {
                    id,
                    skill_id: *skill_id,
                    phase,
                    occurred_at_ms: newest,
                });
                trim_window(&mut self.casts, newest, |cast| cast.occurred_at_ms);
                true
            }
            DomainEvent::SceneChanged { .. } | DomainEvent::LocalPlayerChanged { .. } => {
                self.clear()
            }
            _ => false,
        }
    }

    pub fn reset_runtime(&mut self) {
        self.clear();
    }

    pub fn payload(&mut self) -> LiveSkillDamagePayload {
        self.revision = self.revision.wrapping_add(1);
        LiveSkillDamagePayload {
            revision: self.revision,
            hits: self.hits.iter().cloned().collect(),
            casts: self.casts.iter().copied().collect(),
        }
    }

    fn next_id(&mut self) -> u64 {
        self.sequence = self.sequence.wrapping_add(1);
        self.sequence
    }

    fn clear(&mut self) -> bool {
        let changed = !self.hits.is_empty() || !self.casts.is_empty();
        self.hits.clear();
        self.casts.clear();
        self.last_batch = None;
        changed
    }
}

/// The lifecycle steps a cast window reacts to; a bare observation is neither
/// a start nor an end.
const fn cast_phase(phase: SkillPhase) -> Option<SkillDamageCastPhase> {
    match phase {
        SkillPhase::CastStarted => Some(SkillDamageCastPhase::Start),
        SkillPhase::DurationStarted => Some(SkillDamageCastPhase::DurationStart),
        SkillPhase::DurationEnded => Some(SkillDamageCastPhase::End),
        SkillPhase::Completed => Some(SkillDamageCastPhase::Complete),
        SkillPhase::Observed => None,
    }
}

/// Drops the oldest entries beyond the count bound and those that fell out of
/// the time window, which is measured back from the entry that just arrived.
fn trim_window<T>(entries: &mut VecDeque<T>, newest: i64, occurred_at_ms: impl Fn(&T) -> i64) {
    while entries.len() > MAX_RETAINED
        || entries
            .front()
            .is_some_and(|entry| newest.saturating_sub(occurred_at_ms(entry)) > RETAIN_WINDOW_MS)
    {
        entries.pop_front();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{
        DomainHit, EntityKind, EntityRef, EntityUuid, EventMeta, HitChannel,
    };

    const WATCHED: i64 = 25_523_102;
    const LOCAL: i64 = 10;

    fn projection(watched: &[i64]) -> SkillDamageProjection {
        let mut projection = SkillDamageProjection::default();
        projection.apply_config(&SkillDamageRuntimeSnapshot {
            watched_skill_keys: watched.to_vec(),
            ..Default::default()
        });
        projection
    }

    fn entity(uuid: i64) -> EntityRef {
        EntityRef {
            uuid: EntityUuid(uuid),
            generation: 1,
        }
    }

    fn hit(skill_key: i64, target: i64) -> DomainHit {
        DomainHit {
            channel: HitChannel::Near,
            source: Some(entity(LOCAL)),
            packet_owner: None,
            resolved_owner: None,
            target: entity(target),
            source_kind: Some(EntityKind::Character),
            target_kind: EntityKind::Monster,
            source_monster_id: None,
            target_monster_id: None,
            target_is_boss: false,
            source_is_player: true,
            source_is_local_player: true,
            skill_key,
            skill_id: None,
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 1_000,
            has_loss_breakdown: false,
            hp_loss: 0,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        }
    }

    fn envelope(batch: u64, occurred_at_ms: i64, event: DomainEvent) -> DomainEnvelope {
        let meta = EventMeta {
            batch_id: BatchId(batch),
            capture_sequence: batch,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: occurred_at_ms,
            captured_mono_ns: u64::try_from(occurred_at_ms).unwrap_or_default() * 1_000_000,
            source_time_ms: None,
        };
        DomainEnvelope {
            sequence: batch,
            batch_id: meta.batch_id,
            occurred_at_ms,
            meta,
            event_index: 0,
            segment_id: None,
            event,
        }
    }

    fn apply(projection: &mut SkillDamageProjection, envelope: DomainEnvelope) -> bool {
        projection.apply(&envelope, Some(entity(LOCAL)))
    }

    fn accept(projection: &mut SkillDamageProjection, batch: u64, at: i64, hit: DomainHit) -> bool {
        apply(
            projection,
            envelope(batch, at, DomainEvent::CombatHitAccepted(hit)),
        )
    }

    #[test]
    fn empty_watch_list_collects_nothing() {
        let mut projection = projection(&[]);
        assert!(!accept(&mut projection, 1, 1_000, hit(WATCHED, 100)));
        assert!(projection.payload().hits.is_empty());
    }

    #[test]
    fn keeps_only_watched_local_damage_with_exact_amount() {
        let mut projection = projection(&[WATCHED]);
        assert!(!accept(&mut projection, 1, 1_000, hit(WATCHED + 1, 100)));
        let mut remote = hit(WATCHED, 100);
        remote.source_is_local_player = false;
        assert!(!accept(&mut projection, 1, 1_000, remote));
        let mut healing = hit(WATCHED, 100);
        healing.kind = HitKind::Healing;
        assert!(!accept(&mut projection, 1, 1_000, healing));
        let mut huge = hit(WATCHED, 100);
        huge.amount = u128::MAX;
        assert!(apply(
            &mut projection,
            envelope(2, 1_000, DomainEvent::HitResolved(huge))
        ));

        let hits = projection.payload().hits;
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].skill_id, WATCHED);
        assert_eq!(hits[0].amount, u128::MAX.to_string());
        assert_eq!(hits[0].target_uuid, "100");
    }

    #[test]
    fn ids_increase_and_batches_get_ordinals() {
        let mut projection = projection(&[WATCHED]);
        accept(&mut projection, 7, 1_000, hit(WATCHED, 100));
        accept(&mut projection, 7, 1_000, hit(WATCHED, 200));
        accept(&mut projection, u64::MAX, 1_010, hit(WATCHED, 100));
        let hits = projection.payload().hits;
        let ids: Vec<_> = hits.iter().map(|hit| hit.id).collect();
        let batches: Vec<_> = hits.iter().map(|hit| hit.batch).collect();
        assert_eq!(ids, [1, 2, 3]);
        assert_eq!(batches, [1, 1, 2]);
    }

    #[test]
    fn monitor_all_keeps_other_local_skills_but_never_other_players() {
        let mut projection = projection(&[WATCHED]);
        projection.apply_config(&SkillDamageRuntimeSnapshot {
            watched_skill_keys: vec![WATCHED],
            monitor_all: true,
            ..Default::default()
        });
        assert!(accept(&mut projection, 1, 1_000, hit(999, 100)));
        let mut other = hit(999, 100);
        other.source_is_local_player = false;
        assert!(!accept(&mut projection, 2, 1_010, other));
        projection.apply_config(&SkillDamageRuntimeSnapshot {
            monitor_all: true,
            ..Default::default()
        });
        assert!(accept(&mut projection, 3, 1_020, hit(999, 100)));
        assert_eq!(projection.payload().hits.len(), 2);
    }

    #[test]
    fn retention_is_bounded_by_count_and_newest_hit_window() {
        let mut projection = projection(&[WATCHED]);
        for batch in 1..=140 {
            accept(&mut projection, batch, 1_000, hit(WATCHED, 100));
        }
        let hits = projection.payload().hits;
        assert_eq!(hits.len(), MAX_RETAINED);
        assert_eq!(hits[0].id, 13);

        // Pruning is relative to the newest hit and only happens on arrival.
        accept(
            &mut projection,
            141,
            1_000 + RETAIN_WINDOW_MS + 1,
            hit(WATCHED, 100),
        );
        let hits = projection.payload().hits;
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, 141);
    }

    #[test]
    fn scene_player_and_runtime_resets_clear_but_keep_ids_unique() {
        let mut projection = projection(&[WATCHED]);
        accept(&mut projection, 1, 1_000, hit(WATCHED, 100));
        let scene = DomainEvent::SceneChanged {
            previous_scene_id: None,
            scene_id: 2,
            difficulty: None,
        };
        assert!(apply(&mut projection, envelope(2, 1_000, scene.clone())));
        assert!(!apply(&mut projection, envelope(3, 1_000, scene)));

        accept(&mut projection, 4, 1_000, hit(WATCHED, 100));
        let player = DomainEvent::LocalPlayerChanged {
            previous: None,
            current: Some(entity(LOCAL)),
        };
        assert!(apply(&mut projection, envelope(5, 1_000, player)));

        accept(&mut projection, 6, 1_000, hit(WATCHED, 100));
        projection.reset_runtime();
        assert!(projection.payload().hits.is_empty());

        accept(&mut projection, 7, 1_000, hit(WATCHED, 100));
        assert_eq!(projection.payload().hits[0].id, 4);
    }

    #[test]
    fn watch_list_change_keeps_retained_hits() {
        let mut projection = projection(&[WATCHED]);
        accept(&mut projection, 1, 1_000, hit(WATCHED, 100));
        projection.apply_config(&SkillDamageRuntimeSnapshot::default());
        assert_eq!(projection.payload().hits.len(), 1);
        assert!(!accept(&mut projection, 2, 1_000, hit(WATCHED, 100)));
    }

    #[test]
    fn cast_lifecycle_is_local_filtered_ordered_and_reset_with_hits() {
        let mut projection = projection(&[WATCHED]);
        projection.apply_config(&SkillDamageRuntimeSnapshot {
            watched_skill_keys: vec![WATCHED],
            watched_cast_ids: vec![1241],
            monitor_all: false,
        });
        let cast = |caster, skill_id, phase| {
            envelope(
                1,
                1_000,
                DomainEvent::SkillLifecycleChanged {
                    caster: entity(caster),
                    skill_id,
                    phase,
                    target: None,
                },
            )
        };
        let started = SkillPhase::DurationStarted;
        assert!(!apply(&mut projection, cast(20, 1241, started)));
        assert!(!apply(&mut projection, cast(LOCAL, 1520, started)));
        assert!(!apply(
            &mut projection,
            cast(LOCAL, 1241, SkillPhase::Observed)
        ));
        // Without a known local player nobody's cast is the local one.
        assert!(!projection.apply(&cast(LOCAL, 1241, started), None));

        assert!(apply(&mut projection, cast(LOCAL, 1241, started)));
        accept(&mut projection, 2, 1_100, hit(WATCHED, 100));
        assert!(apply(
            &mut projection,
            cast(LOCAL, 1241, SkillPhase::DurationEnded)
        ));
        let payload = projection.payload();
        assert_eq!(payload.casts[0].id, 1);
        assert_eq!(payload.hits[0].id, 2);
        assert_eq!(payload.casts[1].id, 3);
        assert_eq!(payload.casts[0].phase, SkillDamageCastPhase::DurationStart);
        assert_eq!(payload.casts[1].phase, SkillDamageCastPhase::End);
        projection.reset_runtime();
        assert!(projection.payload().casts.is_empty());
        assert!(projection.payload().hits.is_empty());
    }

    #[test]
    fn cast_phases_reach_the_client_in_camel_case() {
        let phases = [
            SkillDamageCastPhase::Start,
            SkillDamageCastPhase::DurationStart,
            SkillDamageCastPhase::End,
            SkillDamageCastPhase::Complete,
        ];
        assert_eq!(
            serde_json::to_string(&phases).ok().as_deref(),
            Some(r#"["start","durationStart","end","complete"]"#)
        );
    }

    #[test]
    fn payload_revision_increases() {
        let mut projection = projection(&[WATCHED]);
        let first = projection.payload().revision;
        assert!(projection.payload().revision > first);
    }
}
