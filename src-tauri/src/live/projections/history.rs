//! Explicit DomainEvent to stable HistoryEvent projection.

use std::collections::HashSet;

use crate::database::event_journal::RecordingEncounter;
use crate::database::history_codec::{
    HistoryBuff, HistoryDeath, HistoryEntityContext, HistoryEnvelope, HistoryEvent, HistoryHit,
    HistorySkillCast,
};
use crate::database::history_query::{HistoryQualityFlag, quality_flags_to_bits};
use crate::live::history_writer::{HistoryFinalization, HistoryWriterHandle};
use crate::live::projections::combat::accumulator::{CombatAccumulator, CombatHitFact};
use crate::live::projections::death::DeathReplaySnapshot;
use crate::live::projections::timeline::TimelineMarker;
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::entity_context::{EntityContext, EntityState};
use crate::live::runtime::events::{DomainEnvelope, DomainEvent, EntityRef, EntityUuid, SegmentId};

#[derive(Debug)]
struct ActiveHistoryProjection {
    segment_id: SegmentId,
    next_sequence: u64,
    recorded_contexts: HashSet<i64>,
    reducer: crate::database::history_query::HistoryProjectionReducer,
}

#[derive(Debug)]
pub struct HistoryProjection {
    writer: HistoryWriterHandle,
    active: Option<ActiveHistoryProjection>,
}

impl HistoryProjection {
    pub fn new(writer: HistoryWriterHandle) -> Self {
        Self {
            writer,
            active: None,
        }
    }

    pub fn start_segment(
        &mut self,
        segment_id: SegmentId,
        recording: RecordingEncounter,
    ) -> Result<(), String> {
        let reducer = crate::database::history_query::HistoryProjectionReducer::new(0..u64::MAX)
            .map_err(|error| error.to_string())?
            .without_dynamic_series();
        self.writer.begin(segment_id, recording)?;
        self.active = Some(ActiveHistoryProjection {
            segment_id,
            next_sequence: 0,
            recorded_contexts: HashSet::new(),
            reducer,
        });
        Ok(())
    }

    pub fn apply_hit(
        &mut self,
        envelope: &DomainEnvelope,
        fact: Option<&CombatHitFact>,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        if !self.accepts(envelope) {
            return Ok(());
        }
        let Some(fact) = fact else {
            return Ok(());
        };
        if let Some(source_id) = fact.source_entity_id {
            self.ensure_context_id(source_id, entities, segment_offset_ms)?;
        }
        self.ensure_context_id(fact.target_entity_id, entities, segment_offset_ms)?;
        self.persist(
            segment_offset_ms,
            HistoryEvent::Hit(HistoryHit::from(fact)),
            false,
        )
    }

    pub fn apply(
        &mut self,
        envelope: &DomainEnvelope,
        entities: &EntityContext,
        segment_offset_ms: u64,
        death_replay: Option<&DeathReplaySnapshot>,
    ) -> Result<(), String> {
        if !self.accepts(envelope) {
            return Ok(());
        }

        match &envelope.event {
            DomainEvent::DeathOccurred {
                victim,
                killer,
                skill_key,
                ..
            } => {
                self.ensure_context(*victim, entities, segment_offset_ms)?;
                if let Some(killer) = killer {
                    self.ensure_context(*killer, entities, segment_offset_ms)?;
                }
                self.persist(
                    segment_offset_ms,
                    HistoryEvent::Death(HistoryDeath {
                        entity_id: victim.uuid.0,
                        source_entity_id: killer.map(|value| value.uuid.0),
                        skill_id: *skill_key,
                        replay: death_replay.cloned(),
                    }),
                    true,
                )?;
            }
            DomainEvent::IdentityChanged { entity, .. }
                if self
                    .active
                    .as_ref()
                    .is_some_and(|active| active.recorded_contexts.contains(&entity.uuid.0)) =>
            {
                self.record_context(entity.uuid.0, entities, segment_offset_ms)?;
            }
            DomainEvent::AttributeChanged {
                entity, attr_id, ..
            } if matches!(
                *attr_id,
                attr_type::ATTR_FIGHT_POINT | attr_type::ATTR_SEASON_STRENGTH
            ) && self
                .active
                .as_ref()
                .is_some_and(|active| active.recorded_contexts.contains(&entity.uuid.0)) =>
            {
                self.record_context(entity.uuid.0, entities, segment_offset_ms)?;
            }
            _ => {}
        }
        Ok(())
    }

    pub fn apply_marker(
        &mut self,
        envelope: &DomainEnvelope,
        marker: TimelineMarker,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        if !self.accepts(envelope) {
            return Ok(());
        }
        self.ensure_context(marker.caster, entities, segment_offset_ms)?;
        self.persist(
            segment_offset_ms,
            HistoryEvent::SkillCast(HistorySkillCast {
                caster_entity_id: marker.caster.uuid.0,
                skill_id: marker.skill_id,
                kind: marker.kind,
                remodel_level: marker.remodel_level,
            }),
            true,
        )
    }

    /// Persists a buff presence edge derived from a domain event.
    pub fn apply_buff(
        &mut self,
        envelope: &DomainEnvelope,
        record: HistoryBuff,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        if !self.accepts(envelope) {
            return Ok(());
        }
        self.persist_buff(record, entities, segment_offset_ms)
    }

    /// Persists a synthetic buff edge (segment baseline, despawn close,
    /// config change) that has no originating envelope.
    pub fn persist_buff(
        &mut self,
        record: HistoryBuff,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        if self.active.is_none() {
            return Ok(());
        }
        self.ensure_context_id(record.entity_id, entities, segment_offset_ms)?;
        self.persist(segment_offset_ms, HistoryEvent::Buff(record), true)
    }

    pub fn finalize(
        &mut self,
        segment_id: SegmentId,
        combat: &CombatAccumulator,
        mut metadata: crate::database::event_journal::FinalizeEncounterMetadata,
        summary: crate::database::commands::EncounterSummaryDto,
    ) -> Result<(), String> {
        let active = self
            .active
            .take()
            .ok_or_else(|| "cannot finalize history without an active segment".to_string())?;
        if active.segment_id != segment_id {
            return Err("history projection segment mismatch".to_string());
        }
        let projection = active.reducer.finish_detail_with_combat(0, summary, combat);
        metadata.quality_flags |= quality_flags_to_bits(&projection.detail.quality_flags);
        self.writer.finalize(HistoryFinalization {
            segment_id,
            metadata,
            projection,
        })
    }

    fn ensure_context(
        &mut self,
        entity: EntityRef,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        self.ensure_context_id(entity.uuid.0, entities, segment_offset_ms)
    }

    fn ensure_context_id(
        &mut self,
        entity_id: i64,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        let needs_context = self
            .active
            .as_ref()
            .is_some_and(|active| !active.recorded_contexts.contains(&entity_id));
        if needs_context {
            self.record_context(entity_id, entities, segment_offset_ms)?;
        }
        Ok(())
    }

    fn record_context(
        &mut self,
        entity_id: i64,
        entities: &EntityContext,
        segment_offset_ms: u64,
    ) -> Result<(), String> {
        let Some(state) = entities.entity(EntityUuid(entity_id)) else {
            self.add_quality(HistoryQualityFlag::MissingEntityContext);
            return Ok(());
        };
        self.persist(
            segment_offset_ms,
            HistoryEvent::EntityContext(history_context(state)),
            true,
        )?;
        if let Some(active) = &mut self.active {
            active.recorded_contexts.insert(entity_id);
        }
        Ok(())
    }

    fn persist(
        &mut self,
        offset_ms: u64,
        event: HistoryEvent,
        project: bool,
    ) -> Result<(), String> {
        let active = self
            .active
            .as_mut()
            .ok_or_else(|| "cannot record history without an active segment".to_string())?;
        let sequence = active.next_sequence;
        active.next_sequence = active.next_sequence.saturating_add(1);
        let envelope = HistoryEnvelope {
            sequence,
            offset_ms,
            event,
        };
        if project {
            active.reducer.apply(&envelope);
        } else {
            active.reducer.observe_sequence(sequence);
        }
        self.writer.record(active.segment_id, envelope)
    }

    fn accepts(&self, envelope: &DomainEnvelope) -> bool {
        let Some(segment_id) = envelope.segment_id else {
            return false;
        };
        self.active
            .as_ref()
            .is_some_and(|active| active.segment_id == segment_id)
    }

    fn add_quality(&mut self, flag: HistoryQualityFlag) {
        if let Some(active) = &mut self.active {
            active.reducer.add_quality_flags([flag]);
        }
    }
}

fn history_context(state: &EntityState) -> HistoryEntityContext {
    HistoryEntityContext {
        entity_id: state.entity.uuid.0,
        display_uid: crate::live::entity_id::uid_from_uuid(state.entity.uuid.0),
        name: state.identity.name.clone(),
        class_id: state.identity.profession_id,
        class_spec: None,
        ability_score: state
            .int_attr(attr_type::ATTR_FIGHT_POINT)
            .and_then(|value| i32::try_from(value).ok()),
        season_strength: state
            .int_attr(attr_type::ATTR_SEASON_STRENGTH)
            .and_then(|value| i32::try_from(value).ok()),
        monster_id: state.identity.monster_id,
    }
}
