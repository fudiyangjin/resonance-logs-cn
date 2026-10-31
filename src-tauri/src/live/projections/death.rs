//! Incremental death replay projection fed by accepted combat facts.

use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};

use crate::live::ipc::models::{
    DamageSnapshot, DeathBuffSnapshot, DeathParticipantBuffSnapshot, DeathRecord,
};
use crate::live::projections::combat::accumulator::{CombatHitFact, CombatMetric};
use crate::live::runtime::events::{
    BuffState, DeathBuffCheckpoint, DomainEnvelope, DomainEvent, DomainHit, EntityRef,
};

const REPLAY_WINDOW_MS: i64 = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathReplayDamage {
    pub timestamp_ms: i64,
    pub attacker_entity_uuid: Option<i64>,
    pub attacker_monster_type_id: Option<i32>,
    pub skill_key: i64,
    pub value: u128,
    #[serde(default)]
    pub property: Option<i32>,
    #[serde(default)]
    pub damage_mode: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathReplayBuff {
    pub base_id: i32,
    pub instance_id: i64,
    pub layer: i32,
    pub duration_ms: Option<u64>,
    pub started_wall_ms: Option<i64>,
    pub source_entity_uuid: Option<i64>,
    pub source_config_id: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathReplayParticipant {
    pub entity_uuid: Option<i64>,
    pub monster_type_id: Option<i32>,
    pub buffs: Vec<DeathReplayBuff>,
}

/// Numeric, persistence-safe state captured at the moment of death.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathReplaySnapshot {
    pub victim_entity_uuid: i64,
    pub death_timestamp_ms: i64,
    pub recent_damages: Vec<DeathReplayDamage>,
    pub victim_buffs: Vec<DeathReplayBuff>,
    pub participant_buffs: Vec<DeathReplayParticipant>,
}

impl From<&DeathReplaySnapshot> for DeathRecord {
    fn from(snapshot: &DeathReplaySnapshot) -> Self {
        Self {
            victim_entity_uuid: snapshot.victim_entity_uuid.to_string(),
            death_timestamp_ms: snapshot.death_timestamp_ms.max(0).to_string(),
            recent_damages: snapshot
                .recent_damages
                .iter()
                .map(|damage| DamageSnapshot {
                    timestamp_ms: damage.timestamp_ms.max(0).to_string(),
                    attacker_entity_uuid: damage
                        .attacker_entity_uuid
                        .map(|entity| entity.to_string()),
                    attacker_monster_type_id: damage.attacker_monster_type_id,
                    skill_key: damage.skill_key,
                    value: damage.value.to_string(),
                    property: damage.property,
                    damage_mode: damage.damage_mode,
                })
                .collect(),
            victim_buffs: snapshot
                .victim_buffs
                .iter()
                .map(ipc_buff_snapshot)
                .collect(),
            participant_buffs: snapshot
                .participant_buffs
                .iter()
                .map(|participant| DeathParticipantBuffSnapshot {
                    entity_uuid: participant.entity_uuid.map(|entity| entity.to_string()),
                    monster_type_id: participant.monster_type_id,
                    buffs: participant.buffs.iter().map(ipc_buff_snapshot).collect(),
                })
                .collect(),
        }
    }
}

#[derive(Debug)]
struct PendingDamage {
    occurred_at_ms: i64,
    attacker: Option<EntityRef>,
    attacker_monster_id: Option<i32>,
    skill_key: i64,
    value: u128,
    property: Option<i32>,
    damage_mode: Option<i32>,
}

#[derive(Debug, Default)]
pub struct DeathProjection {
    recent_by_target: HashMap<EntityRef, VecDeque<PendingDamage>>,
    records: Vec<DeathRecord>,
}

impl DeathProjection {
    pub fn start_segment(&mut self) {
        self.recent_by_target.clear();
        self.records.clear();
    }

    pub fn apply(&mut self, envelope: &DomainEnvelope) -> Option<DeathReplaySnapshot> {
        match &envelope.event {
            DomainEvent::DeathOccurred {
                victim,
                buff_checkpoint,
                ..
            } => {
                let mut recent = self.recent_by_target.remove(victim).unwrap_or_default();
                prune(&mut recent, envelope.occurred_at_ms);
                if recent.is_empty() {
                    return None;
                }

                let participant_buffs = participant_buffs(buff_checkpoint, &recent);
                let recent_damages = recent
                    .into_iter()
                    .map(|damage| DeathReplayDamage {
                        timestamp_ms: damage.occurred_at_ms,
                        attacker_entity_uuid: damage.attacker.map(|entity| entity.uuid.0),
                        attacker_monster_type_id: damage.attacker_monster_id,
                        skill_key: damage.skill_key,
                        value: damage.value,
                        property: damage.property,
                        damage_mode: damage.damage_mode,
                    })
                    .collect();
                let victim_buffs = buffs_for(buff_checkpoint, *victim);
                let snapshot = DeathReplaySnapshot {
                    victim_entity_uuid: victim.uuid.0,
                    death_timestamp_ms: envelope.occurred_at_ms,
                    recent_damages,
                    victim_buffs,
                    participant_buffs,
                };
                self.records.push(DeathRecord::from(&snapshot));
                Some(snapshot)
            }
            DomainEvent::EntityDisappeared { entity } => {
                self.recent_by_target.remove(entity);
                None
            }
            _ => None,
        }
    }

    pub fn apply_hit(
        &mut self,
        envelope: &DomainEnvelope,
        hit: &DomainHit,
        fact: Option<&CombatHitFact>,
    ) {
        if !fact.is_some_and(|fact| fact.metric == CombatMetric::DamageTaken) {
            return;
        }
        let queue = self.recent_by_target.entry(hit.target).or_default();
        prune(queue, envelope.occurred_at_ms);
        queue.push_back(PendingDamage {
            occurred_at_ms: envelope.occurred_at_ms,
            attacker: hit.source,
            attacker_monster_id: hit.source_monster_id,
            skill_key: hit.skill_key,
            value: hit.amount,
            property: hit.property,
            damage_mode: hit.damage_mode,
        });
    }

    #[must_use]
    pub fn snapshot(&self) -> Vec<DeathRecord> {
        self.records.clone()
    }
}

fn prune(queue: &mut VecDeque<PendingDamage>, now_ms: i64) {
    let cutoff = now_ms.saturating_sub(REPLAY_WINDOW_MS);
    while queue
        .front()
        .is_some_and(|damage| damage.occurred_at_ms < cutoff)
    {
        queue.pop_front();
    }
}

fn buffs_for(checkpoint: &DeathBuffCheckpoint, entity: EntityRef) -> Vec<DeathReplayBuff> {
    let mut buffs = checkpoint
        .buffs(entity)
        .iter()
        .map(replay_buff_snapshot)
        .collect::<Vec<_>>();
    buffs.sort_unstable_by_key(|buff| (buff.started_wall_ms, buff.base_id, buff.instance_id));
    buffs
}

fn participant_buffs(
    checkpoint: &DeathBuffCheckpoint,
    damages: &VecDeque<PendingDamage>,
) -> Vec<DeathReplayParticipant> {
    let mut seen_entities = HashSet::new();
    let mut seen_monsters_without_entity = HashSet::new();
    let mut participants = Vec::new();
    for damage in damages {
        if let Some(entity) = damage.attacker {
            if seen_entities.insert(entity.uuid) {
                participants.push(DeathReplayParticipant {
                    entity_uuid: Some(entity.uuid.0),
                    monster_type_id: damage.attacker_monster_id,
                    buffs: buffs_for(checkpoint, entity),
                });
            }
        } else if let Some(monster_id) = damage.attacker_monster_id
            && seen_monsters_without_entity.insert(monster_id)
        {
            participants.push(DeathReplayParticipant {
                entity_uuid: None,
                monster_type_id: Some(monster_id),
                buffs: Vec::new(),
            });
        }
    }
    participants
}

fn replay_buff_snapshot(buff: &BuffState) -> DeathReplayBuff {
    DeathReplayBuff {
        base_id: buff.base_id,
        instance_id: buff.instance_id,
        layer: buff.layer,
        duration_ms: buff.duration_ms,
        started_wall_ms: buff.started_wall_ms,
        source_entity_uuid: buff.source.map(|source| source.uuid.0),
        source_config_id: buff.source_config_id,
    }
}

fn ipc_buff_snapshot(buff: &DeathReplayBuff) -> DeathBuffSnapshot {
    DeathBuffSnapshot {
        base_id: buff.base_id,
        buff_uuid: i32::try_from(buff.instance_id).unwrap_or_default(),
        layer: buff.layer,
        duration_ms: buff.duration_ms.unwrap_or_default().min(i32::MAX as u64) as i32,
        create_time_ms: buff.started_wall_ms.unwrap_or_default(),
        source_entity_uuid: buff.source_entity_uuid.map(|source| source.to_string()),
        source_config_id: buff.source_config_id,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::live::protocol::attrs as attr_type;
    use crate::live::runtime::entity_context::EntityContext;
    use crate::live::runtime::events::{
        AttributeValue, BatchId, EntityKind, EntityUuid, EventMeta, HitChannel, HitKind,
        ObservationOrigin, ObservedBuff, ProtocolBatch, ProtocolObservation,
    };

    const ATTACKER: EntityRef = EntityRef {
        uuid: EntityUuid(10),
        generation: 1,
    };
    const VICTIM: EntityRef = EntityRef {
        uuid: EntityUuid(20),
        generation: 1,
    };

    fn envelope_at(occurred_at_ms: i64, event: DomainEvent) -> DomainEnvelope {
        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: occurred_at_ms,
            captured_mono_ns: u64::try_from(occurred_at_ms.max(0)).unwrap_or_default() * 1_000_000,
            source_time_ms: None,
        };
        DomainEnvelope {
            sequence: 1,
            batch_id: meta.batch_id,
            occurred_at_ms,
            meta,
            event_index: 0,
            segment_id: None,
            event,
        }
    }

    fn death_at(occurred_at_ms: i64, buff_checkpoint: DeathBuffCheckpoint) -> DomainEnvelope {
        envelope_at(
            occurred_at_ms,
            DomainEvent::DeathOccurred {
                victim: VICTIM,
                killer: None,
                skill_key: None,
                buff_checkpoint,
            },
        )
    }

    fn damage(source_is_player: bool) -> DomainHit {
        DomainHit {
            channel: HitChannel::ToMe,
            source: Some(ATTACKER),
            packet_owner: None,
            resolved_owner: None,
            target: VICTIM,
            source_kind: Some(if source_is_player {
                EntityKind::Character
            } else {
                EntityKind::Monster
            }),
            target_kind: if source_is_player {
                EntityKind::Monster
            } else {
                EntityKind::Character
            },
            source_monster_id: (!source_is_player).then_some(9_001),
            target_monster_id: source_is_player.then_some(30_001),
            target_is_boss: source_is_player,
            source_is_player,
            source_is_local_player: source_is_player,
            skill_key: 17_140_101,
            skill_id: Some(1_714),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: u128::from(u64::MAX) + 123,
            has_loss_breakdown: true,
            hp_loss: 100,
            shield_loss: 23,
            is_lucky_bonus_only: false,
            property: Some(3),
            damage_mode: Some(2),
            effective_amount: None,
        }
    }

    fn apply_hit(projection: &mut DeathProjection, occurred_at_ms: i64, hit: DomainHit) {
        let envelope = envelope_at(occurred_at_ms, DomainEvent::CombatHitAccepted(hit));
        let fact = CombatHitFact::from_domain(&hit);
        projection.apply_hit(&envelope, &hit, fact.as_ref());
    }

    fn checkpoint_with_buffs() -> DeathBuffCheckpoint {
        let mut entities = EntityContext::new();
        let events = entities.apply_batch(ProtocolBatch {
            meta: EventMeta {
                batch_id: BatchId(2),
                capture_sequence: 2,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: 1_500,
                captured_mono_ns: 1_500_000_000,
                source_time_ms: None,
            },
            observations: vec![
                // `death_buff_checkpoint_for` only builds a checkpoint for
                // `EntityKind::Character` victims (matching the exact kind
                // `CombatHitFact::from_domain` requires for `DamageTaken`),
                // so the victim's identity must resolve to `Character`
                // before the death for this test to exercise that path.
                ProtocolObservation::EntityAppeared {
                    uuid: VICTIM.uuid,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::BuffSnapshot {
                    target_uuid: VICTIM.uuid,
                    buffs: vec![ObservedBuff {
                        instance_id: 99,
                        base_id: 77,
                        layer: 2,
                        source_uuid: Some(ATTACKER.uuid),
                        source_config_id: Some(700),
                        duration_ms: None,
                        started_wall_ms: Some(900),
                        expires_wall_ms: None,
                        started_mono_ms: None,
                        expires_mono_ms: None,
                        effect_ids: Arc::from([]),
                        energy_display_id: None,
                    }],
                },
                ProtocolObservation::BuffSnapshot {
                    target_uuid: ATTACKER.uuid,
                    buffs: vec![ObservedBuff {
                        instance_id: 55,
                        base_id: 44,
                        layer: 1,
                        source_uuid: None,
                        source_config_id: None,
                        duration_ms: Some(5_000),
                        started_wall_ms: Some(800),
                        expires_wall_ms: Some(5_800),
                        started_mono_ms: None,
                        expires_mono_ms: None,
                        effect_ids: Arc::from([]),
                        energy_display_id: None,
                    }],
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: VICTIM.uuid,
                    attr_id: attr_type::ATTR_ACTOR_STATE,
                    value: AttributeValue::Int(attr_type::ACTOR_STATE_DEAD),
                    origin: ObservationOrigin::Delta,
                },
            ],
        });
        events
            .into_iter()
            .find_map(|envelope| match envelope.event {
                DomainEvent::DeathOccurred {
                    buff_checkpoint, ..
                } => Some(buff_checkpoint),
                _ => None,
            })
            .expect("death event carries a buff checkpoint")
    }

    #[test]
    fn death_snapshot_reads_buffs_from_point_in_time_checkpoint() {
        let mut projection = DeathProjection::default();

        apply_hit(&mut projection, 1_000, damage(false));
        let replay = projection
            .apply(&death_at(1_500, checkpoint_with_buffs()))
            .expect("damage in replay window");

        assert_eq!(replay.recent_damages[0].value, u128::from(u64::MAX) + 123);
        assert_eq!(replay.recent_damages[0].property, Some(3));
        assert_eq!(replay.recent_damages[0].damage_mode, Some(2));
        assert_eq!(replay.victim_buffs.len(), 1);
        assert_eq!(replay.victim_buffs[0].instance_id, 99);
        assert_eq!(replay.victim_buffs[0].duration_ms, None);
        assert_eq!(replay.victim_buffs[0].source_entity_uuid, Some(10));
        assert_eq!(replay.participant_buffs.len(), 1);
        assert_eq!(replay.participant_buffs[0].entity_uuid, Some(10));
        assert_eq!(replay.participant_buffs[0].buffs[0].instance_id, 55);
        let expected_record = DeathRecord::from(&replay);
        assert_eq!(projection.snapshot(), vec![expected_record]);
    }

    #[test]
    fn only_damage_taken_creates_death_replay() {
        let mut projection = DeathProjection::default();

        apply_hit(&mut projection, 1_000, damage(true));
        assert!(
            projection
                .apply(&death_at(1_000, DeathBuffCheckpoint::default()))
                .is_none()
        );
        assert!(projection.snapshot().is_empty());

        apply_hit(&mut projection, 1_000, damage(false));
        let replay = projection
            .apply(&death_at(1_000, DeathBuffCheckpoint::default()))
            .expect("damage taken creates replay");
        assert_eq!(replay.victim_entity_uuid, 20);
        assert_eq!(replay.death_timestamp_ms, 1_000);
        assert_eq!(replay.recent_damages.len(), 1);
        assert_eq!(replay.participant_buffs.len(), 1);
    }

    #[test]
    fn replay_window_keeps_exact_boundary_and_drops_older_damage() {
        let mut projection = DeathProjection::default();

        apply_hit(&mut projection, 1_000, damage(false));
        assert!(
            projection
                .apply(&death_at(3_000, DeathBuffCheckpoint::default()))
                .is_some()
        );

        apply_hit(&mut projection, 1_000, damage(false));
        assert!(
            projection
                .apply(&death_at(3_001, DeathBuffCheckpoint::default()))
                .is_none()
        );
        assert_eq!(projection.records.len(), 1);
    }

    #[test]
    fn entity_disappearance_discards_pending_damage_but_not_completed_replays() {
        let mut projection = DeathProjection::default();

        apply_hit(&mut projection, 1_000, damage(false));
        projection.apply(&envelope_at(
            1_100,
            DomainEvent::EntityDisappeared { entity: VICTIM },
        ));
        assert!(
            projection
                .apply(&death_at(1_200, DeathBuffCheckpoint::default()))
                .is_none()
        );

        apply_hit(&mut projection, 2_000, damage(false));
        assert!(
            projection
                .apply(&death_at(2_100, DeathBuffCheckpoint::default()))
                .is_some()
        );
        projection.apply(&envelope_at(
            2_200,
            DomainEvent::EntityDisappeared { entity: VICTIM },
        ));
        assert_eq!(projection.records.len(), 1);
    }

    #[test]
    fn ipc_conversion_is_exact_for_wide_damage_and_numeric_ids() {
        let snapshot = DeathReplaySnapshot {
            victim_entity_uuid: 20,
            death_timestamp_ms: 3_000,
            recent_damages: vec![DeathReplayDamage {
                timestamp_ms: 2_000,
                attacker_entity_uuid: Some(10),
                attacker_monster_type_id: Some(9_001),
                skill_key: 17_140_101,
                value: u128::MAX,
                property: Some(3),
                damage_mode: Some(2),
            }],
            victim_buffs: vec![DeathReplayBuff {
                base_id: 77,
                instance_id: 99,
                layer: 2,
                duration_ms: None,
                started_wall_ms: Some(1_500),
                source_entity_uuid: Some(10),
                source_config_id: Some(700),
            }],
            participant_buffs: Vec::new(),
        };

        let record = DeathRecord::from(&snapshot);
        assert_eq!(record.victim_entity_uuid, "20");
        assert_eq!(record.recent_damages[0].value, u128::MAX.to_string());
        assert_eq!(record.recent_damages[0].property, Some(3));
        assert_eq!(record.recent_damages[0].damage_mode, Some(2));
        assert_eq!(record.victim_buffs[0].buff_uuid, 99);
        assert_eq!(record.victim_buffs[0].duration_ms, 0);
        assert_eq!(
            record.victim_buffs[0].source_entity_uuid.as_deref(),
            Some("10")
        );
    }
}
