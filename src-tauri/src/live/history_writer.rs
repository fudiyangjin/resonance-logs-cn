//! Bounded history encoder between the live owner and the SQLite actor.

use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::database::event_journal::{
    FinalizeEncounter, FinalizeEncounterMetadata, RecordingEncounter,
};
use crate::database::history_codec::{HistoryChunker, HistoryEnvelope};
use crate::database::history_query::{
    DetailProjectionSnapshot, encode_detail_projection, quality_flags_to_bits,
};
use crate::live::runtime::events::SegmentId;

const HISTORY_QUEUE_CAPACITY: usize = 4_096;
const CHUNK_FLUSH_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Debug)]
pub struct HistoryFinalization {
    pub segment_id: SegmentId,
    pub metadata: FinalizeEncounterMetadata,
    pub projection: DetailProjectionSnapshot,
}

#[derive(Debug)]
enum HistoryWriterCommand {
    Begin {
        segment_id: SegmentId,
        recording: RecordingEncounter,
    },
    Event {
        segment_id: SegmentId,
        envelope: HistoryEnvelope,
    },
    Finalize(HistoryFinalization),
    Fence(SyncSender<Result<(), String>>),
    Shutdown(SyncSender<Result<(), String>>),
}

#[derive(Debug)]
struct ActiveHistory {
    segment_id: SegmentId,
    encounter_id: i32,
    chunker: HistoryChunker,
    next_flush_at: Instant,
}

#[derive(Clone, Debug)]
pub struct HistoryWriterHandle {
    sender: SyncSender<HistoryWriterCommand>,
}

impl HistoryWriterHandle {
    pub fn start() -> Result<(Self, JoinHandle<()>), String> {
        let (sender, receiver) = mpsc::sync_channel(HISTORY_QUEUE_CAPACITY);
        let join = std::thread::Builder::new()
            .name("history-writer".to_string())
            .spawn(move || run_writer(receiver))
            .map_err(|error| format!("failed to start history writer: {error}"))?;
        Ok((Self { sender }, join))
    }

    pub fn begin(
        &self,
        segment_id: SegmentId,
        recording: RecordingEncounter,
    ) -> Result<(), String> {
        self.send(HistoryWriterCommand::Begin {
            segment_id,
            recording,
        })
    }

    pub fn record(&self, segment_id: SegmentId, envelope: HistoryEnvelope) -> Result<(), String> {
        self.send(HistoryWriterCommand::Event {
            segment_id,
            envelope,
        })
    }

    pub fn finalize(&self, finalization: HistoryFinalization) -> Result<(), String> {
        self.send(HistoryWriterCommand::Finalize(finalization))
    }

    /// Makes every history write queued before this call visible to readers.
    pub fn fence(&self) -> Result<(), String> {
        let (reply, receive) = mpsc::sync_channel(0);
        self.send(HistoryWriterCommand::Fence(reply))?;
        receive
            .recv()
            .map_err(|_| "history writer stopped without replying".to_string())?
    }

    /// Fence all preceding writes. The reply is sent only after the SQLite
    /// actor has committed the final queued operation.
    pub fn shutdown(&self) -> Result<(), String> {
        let (reply, receive) = mpsc::sync_channel(0);
        self.send(HistoryWriterCommand::Shutdown(reply))?;
        receive
            .recv()
            .map_err(|_| "history writer stopped without replying".to_string())?
    }

    fn send(&self, command: HistoryWriterCommand) -> Result<(), String> {
        self.sender
            .send(command)
            .map_err(|_| "history writer is unavailable".to_string())
    }
}

fn run_writer(receiver: mpsc::Receiver<HistoryWriterCommand>) {
    let mut active: Option<ActiveHistory> = None;
    loop {
        if active
            .as_ref()
            .is_some_and(|history| history.next_flush_at <= Instant::now())
        {
            if let Err(error) = flush_chunks(history_mut(&mut active)) {
                log::error!(target: "app::history", "history_chunk_flush_failed error={error}");
                break;
            }
            continue;
        }
        let command = match active.as_ref() {
            Some(history) => match receiver.recv_timeout(
                history
                    .next_flush_at
                    .saturating_duration_since(Instant::now()),
            ) {
                Ok(command) => Some(command),
                Err(RecvTimeoutError::Timeout) => {
                    if let Err(error) = flush_chunks(history_mut(&mut active)) {
                        log::error!(target: "app::history", "history_chunk_flush_failed error={error}");
                        break;
                    }
                    None
                }
                Err(RecvTimeoutError::Disconnected) => break,
            },
            None => match receiver.recv() {
                Ok(command) => Some(command),
                Err(_) => break,
            },
        };
        let Some(command) = command else {
            continue;
        };

        let result = match command {
            HistoryWriterCommand::Begin {
                segment_id,
                recording,
            } => begin_segment(&mut active, segment_id, recording),
            HistoryWriterCommand::Event {
                segment_id,
                envelope,
            } => record_event(&mut active, segment_id, envelope),
            HistoryWriterCommand::Finalize(finalization) => {
                finalize_segment(&mut active, finalization)
            }
            HistoryWriterCommand::Fence(reply) => {
                let result = active
                    .as_mut()
                    .map_or(Ok(()), flush_chunks)
                    .and_then(|()| crate::database::flush_database());
                let _ = reply.send(result.clone());
                result
            }
            HistoryWriterCommand::Shutdown(reply) => {
                let result = if active.is_some() {
                    Err("history writer shut down with an unfinalized segment".to_string())
                } else {
                    crate::database::flush_database()
                };
                let _ = reply.send(result);
                break;
            }
        };
        if let Err(error) = result {
            log::error!(target: "app::history", "history_writer_failed error={error}");
            break;
        }
    }
}

fn begin_segment(
    active: &mut Option<ActiveHistory>,
    segment_id: SegmentId,
    recording: RecordingEncounter,
) -> Result<(), String> {
    if active.is_some() {
        return Err("received SegmentStarted before the previous history finalized".to_string());
    }
    let encounter_id = crate::database::begin_history_recording(recording)?;
    *active = Some(ActiveHistory {
        segment_id,
        encounter_id,
        chunker: HistoryChunker::new(encounter_id).map_err(|error| error.to_string())?,
        next_flush_at: Instant::now() + CHUNK_FLUSH_INTERVAL,
    });
    Ok(())
}

fn record_event(
    active: &mut Option<ActiveHistory>,
    segment_id: SegmentId,
    envelope: HistoryEnvelope,
) -> Result<(), String> {
    let history = active
        .as_mut()
        .ok_or_else(|| "received a history event without an active segment".to_string())?;
    if history.segment_id != segment_id {
        return Err(format!(
            "history event segment mismatch: active={} event={}",
            history.segment_id.0, segment_id.0
        ));
    }
    if let Some(chunk) = history
        .chunker
        .push(envelope)
        .map_err(|error| error.to_string())?
    {
        crate::database::append_history_chunk(chunk)?;
    }
    Ok(())
}

fn flush_chunks(history: &mut ActiveHistory) -> Result<(), String> {
    for chunk in history.chunker.flush().map_err(|error| error.to_string())? {
        crate::database::append_history_chunk(chunk)?;
    }
    history.next_flush_at = Instant::now() + CHUNK_FLUSH_INTERVAL;
    Ok(())
}

fn finalize_segment(
    active: &mut Option<ActiveHistory>,
    mut finalization: HistoryFinalization,
) -> Result<(), String> {
    let mut history = active
        .take()
        .ok_or_else(|| "received SegmentEnded without active history".to_string())?;
    if history.segment_id != finalization.segment_id {
        return Err(format!(
            "history finalize segment mismatch: active={} event={}",
            history.segment_id.0, finalization.segment_id.0
        ));
    }
    flush_chunks(&mut history)?;
    finalization.projection.detail.encounter_id = history.encounter_id;
    finalization.projection.detail.summary.id = history.encounter_id;
    let snapshot = finalization.projection;
    let total_damage_exact = snapshot.detail.totals.damage.clone();
    let total_healing_exact = snapshot.detail.totals.healing.clone();
    finalization.metadata.quality_flags |= quality_flags_to_bits(&snapshot.detail.quality_flags);
    let mut projection = encode_detail_projection(&snapshot).map_err(|error| error.to_string())?;
    projection.quality_flags |= finalization.metadata.quality_flags;
    crate::database::finalize_history_recording(FinalizeEncounter {
        encounter_id: history.encounter_id,
        total_damage_exact,
        total_healing_exact,
        metadata: finalization.metadata,
        projection,
    })?;
    Ok(())
}

fn history_mut(active: &mut Option<ActiveHistory>) -> &mut ActiveHistory {
    active.as_mut().expect("caller checked active history")
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::TryRecvError;

    use diesel::prelude::*;

    use super::*;
    use crate::database::commands::{EncounterSummaryDto, load_encounter_summary};
    use crate::database::event_journal::{load_chunks_for_range, load_projection};
    use crate::database::history_codec::{
        HistoryEvent, HistoryStream, MAX_EVENTS_PER_CHUNK, decode_history_chunk,
    };
    use crate::database::history_query::decode_detail_projection;
    use crate::database::schema as sch;
    use crate::live::projections::combat::accumulator::CombatHitFact;
    use crate::live::projections::combat::projection::CombatProjection;
    use crate::live::projections::history::HistoryProjection;
    use crate::live::runtime::entity_context::EntityContext;
    use crate::live::runtime::events::{
        BatchId, DomainEnvelope, DomainEvent, DomainHit, EntityKind, EntityRef, EntityUuid,
        EventMeta, HitChannel, HitKind, MonoTimeMs,
    };

    const BENCHMARK_HITS: u64 = 1_000_000;
    const HIT_AMOUNT: u128 = 7;
    const SEGMENT_ID: SegmentId = SegmentId(1);
    const STARTED_AT_MS: i64 = 1_000;

    struct PersistedBenchmark {
        encounter_id: i32,
        chunks: Vec<crate::database::event_journal::StoredHistoryChunk>,
        summary: EncounterSummaryDto,
        projection: crate::database::event_journal::StoredProjection,
    }

    /// Starts at the canonical accepted-hit boundary used by `LiveCore`.
    /// Constructing `LiveCore` itself would require a windowed Wry `AppHandle`;
    /// its hit gating is covered independently in `live_core` tests.
    #[test]
    #[ignore = "sustained-load benchmark; run explicitly with --ignored --nocapture"]
    fn benchmark_accepted_hits_backpressure_through_sqlite_actor() {
        crate::database::init_in_memory_actor_for_test().expect("start isolated database actor");

        let (sender, receiver) = mpsc::sync_channel(HISTORY_QUEUE_CAPACITY);
        let writer = HistoryWriterHandle { sender };
        let (release_writer, await_release) = mpsc::sync_channel(0);
        let writer_join = std::thread::Builder::new()
            .name("history-writer-benchmark".to_string())
            .spawn(move || {
                await_release.recv().expect("release benchmark writer");
                run_writer(receiver);
            })
            .expect("start gated history writer");

        let (queue_filled, await_queue_filled) = mpsc::sync_channel(0);
        let (producer_done, await_producer) = mpsc::sync_channel(0);
        let producer_writer = writer.clone();
        let producer_join = std::thread::Builder::new()
            .name("accepted-hit-producer".to_string())
            .spawn(move || {
                let result = produce_accepted_hits(producer_writer, queue_filled);
                let _ = producer_done.send(result);
            })
            .expect("start accepted-hit producer");

        await_queue_filled
            .recv_timeout(Duration::from_secs(10))
            .expect("producer fills the bounded writer queue");
        assert!(matches!(
            await_producer.try_recv(),
            Err(TryRecvError::Empty)
        ));

        let released_at = Instant::now();
        release_writer.send(()).expect("release history writer");
        await_producer
            .recv_timeout(Duration::from_secs(180))
            .expect("accepted-hit producer completes")
            .expect("accepted-hit pipeline succeeds");
        producer_join.join().expect("accepted-hit producer joins");
        writer.shutdown().expect("history writer persistence fence");
        writer_join.join().expect("history writer joins");
        let fenced_elapsed = released_at.elapsed();

        let persisted = load_persisted_benchmark().expect("load persisted benchmark");
        let mut persisted_hits = 0_u64;
        let mut persisted_damage = 0_u128;
        let mut expected_sequence = 0_u64;
        for (expected_chunk_index, chunk) in persisted.chunks.iter().enumerate() {
            assert_eq!(chunk.stream_kind, HistoryStream::Combat);
            assert_eq!(chunk.chunk_index, expected_chunk_index as u64);
            assert_eq!(chunk.first_sequence, expected_sequence);
            assert!(chunk.event_count <= MAX_EVENTS_PER_CHUNK as u64);

            let document = decode_history_chunk(&chunk.data, HistoryStream::Combat)
                .expect("decode persisted benchmark chunk");
            assert_eq!(document.len() as u64, chunk.event_count);
            assert_eq!(document.sequences.first(), Some(&chunk.first_sequence));
            assert_eq!(document.sequences.last(), Some(&chunk.last_sequence));
            for event in document.events {
                let HistoryEvent::Hit(hit) = event else {
                    panic!("combat benchmark chunk contains a non-hit event");
                };
                persisted_hits = persisted_hits.saturating_add(1);
                persisted_damage = persisted_damage.saturating_add(hit.amount);
            }
            expected_sequence = chunk
                .last_sequence
                .checked_add(1)
                .expect("benchmark sequence does not overflow");
        }

        let expected_damage = u128::from(BENCHMARK_HITS) * HIT_AMOUNT;
        assert_eq!(persisted_hits, BENCHMARK_HITS);
        assert_eq!(persisted_damage, expected_damage);
        assert_eq!(expected_sequence, BENCHMARK_HITS);
        assert_eq!(persisted.summary.id, persisted.encounter_id);
        assert_eq!(persisted.projection.encounter_id, persisted.encounter_id);
        assert_eq!(persisted.summary.total_dmg, expected_damage.to_string());
        assert_eq!(persisted.summary.total_heal, "0");

        let projection = decode_detail_projection(&persisted.projection.data)
            .expect("decode final benchmark projection");
        assert_eq!(projection.last_sequence, BENCHMARK_HITS - 1);
        assert_eq!(projection.detail.totals.damage, expected_damage.to_string());

        let hits_per_second = BENCHMARK_HITS as f64 / fenced_elapsed.as_secs_f64();
        println!(
            "history_pipeline_benchmark hits={} chunks={} queue_capacity={} elapsed_ms={} hits_per_second={:.0}",
            BENCHMARK_HITS,
            persisted.chunks.len(),
            HISTORY_QUEUE_CAPACITY,
            fenced_elapsed.as_millis(),
            hits_per_second,
        );

        crate::database::shutdown_database().expect("stop isolated database actor");
    }

    fn produce_accepted_hits(
        writer: HistoryWriterHandle,
        queue_filled: SyncSender<()>,
    ) -> Result<(), String> {
        let mut history = HistoryProjection::new(writer);
        let mut combat = CombatProjection::default();
        let entities = EntityContext::new();
        history.start_segment(
            SEGMENT_ID,
            RecordingEncounter {
                started_at_ms: STARTED_AT_MS,
                local_player_id: Some(10),
                scene_id: Some(1),
                dungeon_difficulty: None,
            },
        )?;
        combat.start_segment(SEGMENT_ID, MonoTimeMs(0), STARTED_AT_MS);

        for index in 0..BENCHMARK_HITS {
            let envelope = accepted_hit(index);
            let DomainEvent::CombatHitAccepted(hit) = &envelope.event else {
                unreachable!("benchmark helper creates accepted hits");
            };
            let fact = CombatHitFact::from_domain(hit)
                .ok_or_else(|| "benchmark hit did not normalize".to_string())?;
            combat.apply_hit(
                hit,
                Some(&fact),
                envelope.occurred_at_ms,
                envelope.meta.mono_ms(),
                &entities,
            );
            history.apply_hit(&envelope, Some(&fact), &entities, 0)?;

            // Begin occupies one slot, so this signal proves the production
            // capacity is full while the gated consumer has received nothing.
            if index + 1 == HISTORY_QUEUE_CAPACITY as u64 - 1 {
                queue_filled
                    .send(())
                    .map_err(|_| "backpressure probe receiver closed".to_string())?;
            }
        }

        let expected_damage = u128::from(BENCHMARK_HITS) * HIT_AMOUNT;
        history.finalize(
            SEGMENT_ID,
            combat.accumulator(),
            FinalizeEncounterMetadata {
                ended_at_ms: STARTED_AT_MS + 1,
                local_player_id: Some(10),
                total_damage: i64::try_from(expected_damage).unwrap_or(i64::MAX),
                total_healing: 0,
                scene_id: Some(1),
                dungeon_difficulty: None,
                duration_seconds: 0.001,
                active_combat_duration_seconds: Some(0.001),
                is_manually_reset: false,
                boss_monster_ids_json: "[]".to_string(),
                player_names_json: "[]".to_string(),
                quality_flags: 0,
            },
            EncounterSummaryDto {
                id: 0,
                started_at_ms: STARTED_AT_MS,
                ended_at_ms: Some(STARTED_AT_MS + 1),
                total_dmg: expected_damage.to_string(),
                total_heal: "0".to_string(),
                scene_id: Some(1),
                dungeon_difficulty: None,
                duration: 0.001,
                active_combat_duration: Some(0.001),
                local_player_id: Some(10),
                bosses: Vec::new(),
                players: Vec::new(),
                remote_encounter_id: None,
                is_favorite: false,
                note: None,
                detail_available: true,
                display_index: 0,
            },
        )
    }

    fn accepted_hit(index: u64) -> DomainEnvelope {
        let batch_id = BatchId(index);
        let meta = EventMeta {
            batch_id,
            capture_sequence: index,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: STARTED_AT_MS,
            captured_mono_ns: 0,
            source_time_ms: None,
        };
        DomainEnvelope {
            sequence: index,
            batch_id,
            occurred_at_ms: STARTED_AT_MS,
            meta,
            event_index: 0,
            segment_id: Some(SEGMENT_ID),
            event: DomainEvent::CombatHitAccepted(DomainHit {
                channel: HitChannel::ToMe,
                source: Some(EntityRef {
                    uuid: EntityUuid(10),
                    generation: 1,
                }),
                packet_owner: None,
                resolved_owner: None,
                target: EntityRef {
                    uuid: EntityUuid(20),
                    generation: 1,
                },
                source_kind: Some(EntityKind::Character),
                target_kind: EntityKind::Monster,
                source_monster_id: None,
                target_monster_id: Some(30_001),
                target_is_boss: true,
                source_is_player: true,
                source_is_local_player: true,
                skill_key: 17_140_101,
                skill_id: Some(1_714),
                type_flags: 0,
                kind: HitKind::Damage,
                amount: HIT_AMOUNT,
                has_loss_breakdown: true,
                hp_loss: HIT_AMOUNT,
                shield_loss: 0,
                is_lucky_bonus_only: false,
                property: None,
                damage_mode: None,
                effective_amount: None,
            }),
        }
    }

    fn load_persisted_benchmark() -> Result<PersistedBenchmark, String> {
        crate::database::db_exec(|conn| {
            use sch::encounters::dsl as e;
            let encounter_id = e::encounters
                .select(e::id)
                .order(e::id.desc())
                .first::<i32>(conn)
                .map_err(|error| error.to_string())?;
            let chunks = load_chunks_for_range(conn, encounter_id, 0, i64::MAX as u64)
                .map_err(|error| error.to_string())?;
            let summary = load_encounter_summary(conn, encounter_id)?;
            let projection = load_projection(conn, encounter_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "benchmark encounter has no final projection".to_string())?;
            Ok(PersistedBenchmark {
                encounter_id,
                chunks,
                summary,
                projection,
            })
        })
    }
}
