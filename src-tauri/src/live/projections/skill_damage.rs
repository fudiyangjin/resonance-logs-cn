//! Local skill damage hits for the skill damage HUD domain.
//!
//! Watched skill hits are kept; continuous all-damage mode also collects the
//! local player's other skills. Cast presets watch local lifecycle events too.
//! The topic is dirtied only on accepted hits/casts or reset; clients consume
//! both retained windows incrementally through a shared sequence cursor.

use std::collections::VecDeque;

use crate::live::bootstrap_snapshot::SkillDamageRuntimeSnapshot;
use crate::live::ipc::models::{LiveSkillDamagePayload, SkillDamageCastState, SkillDamageHitState};
use crate::live::runtime::events::{
    BatchId, DomainEnvelope, DomainEvent, EntityRef, HitKind, SkillPhase,
};

/// Most hits held at once.
const MAX_RETAINED_HITS: usize = 128;
/// Hits older than the newest one by more than this are dropped.
const RETAIN_WINDOW_MS: i64 = 5_000;

#[derive(Debug, Default)]
pub struct SkillDamageProjection {
    /// Sorted, deduplicated (normalized by the runtime snapshot).
    watched: Vec<i64>,
    watched_cast_ids: Vec<i32>,
    casts: VecDeque<SkillDamageCastState>,
    monitor_all: bool,
    hits: VecDeque<SkillDamageHitState>,
    /// Last issued hit id; never reset, so ids stay unique for the runtime.
    sequence: u64,
    /// Last issued batch ordinal and the capture batch it stands for.
    batch_ordinal: u64,
    last_batch: Option<BatchId>,
    revision: u64,
}

impl SkillDamageProjection {
    /// Replaces the watch list. Retained hits stay: clients already consumed
    /// them by id, so dropping them would only churn the payload.
    pub fn apply_config(&mut self, config: &SkillDamageRuntimeSnapshot) {
        self.watched.clone_from(&config.watched_skill_keys);
        self.watched_cast_ids.clone_from(&config.watched_cast_ids);
        self.monitor_all = config.monitor_all;
    }

    pub fn apply_cast(&mut self, envelope: &DomainEnvelope, local: Option<EntityRef>) -> bool {
        let DomainEvent::SkillLifecycleChanged {
            caster,
            skill_id,
            phase,
            ..
        } = &envelope.event
        else {
            return false;
        };
        if Some(*caster) != local || self.watched_cast_ids.binary_search(skill_id).is_err() {
            return false;
        }
        let phase = match phase {
            SkillPhase::CastStarted => "start",
            SkillPhase::DurationStarted => "durationStart",
            SkillPhase::DurationEnded => "end",
            SkillPhase::Completed => "complete",
            SkillPhase::Observed => return false,
        };
        self.sequence = self.sequence.wrapping_add(1);
        self.casts.push_back(SkillDamageCastState {
            id: self.sequence,
            skill_id: *skill_id,
            phase: phase.into(),
            occurred_at_ms: envelope.occurred_at_ms,
        });
        while self.casts.len() > MAX_RETAINED_HITS
            || self.casts.front().is_some_and(|item| {
                envelope.occurred_at_ms.saturating_sub(item.occurred_at_ms) > RETAIN_WINDOW_MS
            })
        {
            self.casts.pop_front();
        }
        true
    }

    /// Returns true when the published window changed.
    pub fn apply(&mut self, envelope: &DomainEnvelope) -> bool {
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
                self.sequence = self.sequence.wrapping_add(1);
                self.hits.push_back(SkillDamageHitState {
                    id: self.sequence,
                    batch: self.batch_ordinal,
                    target_uuid: hit.target.uuid.0.to_string(),
                    skill_id: hit.skill_key,
                    amount: hit.amount.to_string(),
                    occurred_at_ms: envelope.occurred_at_ms,
                });
                let newest = envelope.occurred_at_ms;
                while self.hits.len() > MAX_RETAINED_HITS
                    || self.hits.front().is_some_and(|hit| {
                        newest.saturating_sub(hit.occurred_at_ms) > RETAIN_WINDOW_MS
                    })
                {
                    self.hits.pop_front();
                }
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
            casts: self.casts.iter().cloned().collect(),
        }
    }

    fn clear(&mut self) -> bool {
        let changed = !self.hits.is_empty() || !self.casts.is_empty();
        self.casts.clear();
        self.hits.clear();
        self.last_batch = None;
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{
        DomainHit, EntityKind, EntityRef, EntityUuid, EventMeta, HitChannel,
    };

    const WATCHED: i64 = 25_523_102;

    fn projection(watched: &[i64]) -> SkillDamageProjection {
        let mut projection = SkillDamageProjection::default();
        projection.apply_config(&SkillDamageRuntimeSnapshot {
            watched_cast_ids: vec![],
            watched_skill_keys: watched.to_vec(),
            monitor_all: false,
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
            source: Some(entity(10)),
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

    fn accept(projection: &mut SkillDamageProjection, batch: u64, at: i64, hit: DomainHit) -> bool {
        projection.apply(&envelope(batch, at, DomainEvent::CombatHitAccepted(hit)))
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
        assert!(projection.apply(&envelope(2, 1_000, DomainEvent::HitResolved(huge))));

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
            watched_cast_ids: vec![],
            watched_skill_keys: vec![WATCHED],
            monitor_all: true,
        });
        assert!(accept(&mut projection, 1, 1_000, hit(999, 100)));
        let mut other = hit(999, 100);
        other.source_is_local_player = false;
        assert!(!accept(&mut projection, 2, 1_010, other));
        projection.apply_config(&SkillDamageRuntimeSnapshot {
            watched_cast_ids: vec![],
            watched_skill_keys: vec![],
            monitor_all: true,
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
        assert_eq!(hits.len(), MAX_RETAINED_HITS);
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
        assert!(projection.apply(&envelope(2, 1_000, scene.clone())));
        assert!(!projection.apply(&envelope(3, 1_000, scene)));

        accept(&mut projection, 4, 1_000, hit(WATCHED, 100));
        let player = DomainEvent::LocalPlayerChanged {
            previous: None,
            current: Some(entity(10)),
        };
        assert!(projection.apply(&envelope(5, 1_000, player)));

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
        assert!(!projection.apply_cast(
            &cast(20, 1241, SkillPhase::DurationStarted),
            Some(entity(10))
        ));
        assert!(!projection.apply_cast(&cast(10, 1520, SkillPhase::CastStarted), Some(entity(10))));
        assert!(!projection.apply_cast(&cast(10, 1241, SkillPhase::Observed), Some(entity(10))));
        assert!(projection.apply_cast(
            &cast(10, 1241, SkillPhase::DurationStarted),
            Some(entity(10))
        ));
        accept(&mut projection, 2, 1_100, hit(WATCHED, 100));
        assert!(
            projection.apply_cast(&cast(10, 1241, SkillPhase::DurationEnded), Some(entity(10)))
        );
        let payload = projection.payload();
        assert_eq!(payload.casts[0].id, 1);
        assert_eq!(payload.hits[0].id, 2);
        assert_eq!(payload.casts[1].id, 3);
        assert_eq!(payload.casts[0].phase, "durationStart");
        assert_eq!(payload.casts[1].phase, "end");
        projection.reset_runtime();
        assert!(projection.payload().casts.is_empty());
        assert!(projection.payload().hits.is_empty());
    }

    #[test]
    fn payload_revision_increases() {
        let mut projection = projection(&[WATCHED]);
        let first = projection.payload().revision;
        assert!(projection.payload().revision > first);
    }
}
