//! SQLite repository for recording encounters, immutable raw chunks, and the
//! finalized detail projection.
//!
//! Every function borrows the single actor-owned connection. No repository API
//! opens, owns, locks, or shares a SQLite connection.

use diesel::prelude::*;
use diesel::sql_types::{BigInt, Binary, Double, Integer, Nullable, Text};
use diesel::sqlite::SqliteConnection;

use super::history_codec::{EncodedHistoryChunk, HistoryStream};
use super::history_query::EncodedProjectionSnapshot;

#[derive(Debug, Clone, PartialEq)]
pub struct RecordingEncounter {
    pub started_at_ms: i64,
    pub local_player_id: Option<i64>,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InsertOutcome {
    Inserted,
    AlreadyPresent,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FinalizeEncounterMetadata {
    pub ended_at_ms: i64,
    pub local_player_id: Option<i64>,
    pub total_damage: i64,
    pub total_healing: i64,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
    pub duration_seconds: f64,
    pub active_combat_duration_seconds: Option<f64>,
    pub is_manually_reset: bool,
    pub boss_monster_ids_json: String,
    pub player_names_json: String,
    pub quality_flags: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FinalizeEncounter {
    pub encounter_id: i32,
    pub total_damage_exact: String,
    pub total_healing_exact: String,
    pub metadata: FinalizeEncounterMetadata,
    pub projection: EncodedProjectionSnapshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FinalizeOutcome {
    pub encounter_id: i32,
    pub already_finalized: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredHistoryChunk {
    pub encounter_id: i32,
    pub stream_kind: HistoryStream,
    pub chunk_index: u64,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub start_offset_ms: u64,
    pub end_offset_ms_exclusive: u64,
    pub event_count: u64,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredProjection {
    pub encounter_id: i32,
    pub last_sequence: u64,
    pub quality_flags: i32,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncounterHistoryDescriptor {
    pub encounter_id: i32,
    pub quality_flags: i32,
    pub started_at_ms: i64,
    pub ended_at_ms: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum EventJournalError {
    #[error("history database operation failed: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("invalid history input: {0}")]
    InvalidInput(String),
    #[error("encounter {0} does not exist")]
    EncounterNotFound(i32),
    #[error("encounter {0} is already finalized")]
    EncounterFinalized(i32),
    #[error("encounter {0} finalization conflicts with the stored result")]
    FinalizeConflict(i32),
    #[error("chunk data conflict for encounter {encounter_id}/{stream_kind}/{chunk_index}")]
    ChunkDataConflict {
        encounter_id: i32,
        stream_kind: String,
        chunk_index: u64,
    },
    #[error("corrupt history row: {0}")]
    CorruptRow(String),
}

#[derive(Debug, QueryableByName)]
struct EncounterStateRow {
    #[diesel(sql_type = BigInt)]
    started_at_ms: i64,
    #[diesel(sql_type = Nullable<BigInt>)]
    ended_at_ms: Option<i64>,
    #[diesel(sql_type = Integer)]
    quality_flags: i32,
    #[diesel(sql_type = Nullable<Text>)]
    total_dmg_exact: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    total_heal_exact: Option<String>,
}

#[derive(Debug, QueryableByName)]
struct LastIdRow {
    #[diesel(sql_type = BigInt)]
    id: i64,
}

#[derive(Debug, QueryableByName)]
struct DataRow {
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Debug, QueryableByName)]
struct StoredChunkRow {
    #[diesel(sql_type = Integer)]
    encounter_id: i32,
    #[diesel(sql_type = Text)]
    stream_kind: String,
    #[diesel(sql_type = BigInt)]
    chunk_index: i64,
    #[diesel(sql_type = BigInt)]
    first_sequence: i64,
    #[diesel(sql_type = BigInt)]
    last_sequence: i64,
    #[diesel(sql_type = BigInt)]
    start_offset_ms: i64,
    #[diesel(sql_type = BigInt)]
    end_offset_ms_exclusive: i64,
    #[diesel(sql_type = BigInt)]
    event_count: i64,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Debug, QueryableByName)]
struct StoredProjectionRow {
    #[diesel(sql_type = Integer)]
    encounter_id: i32,
    #[diesel(sql_type = BigInt)]
    last_sequence: i64,
    #[diesel(sql_type = Integer)]
    quality_flags: i32,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

/// Insert the encounter summary row at segment start and return its stable ID.
pub fn begin_recording_encounter(
    conn: &mut SqliteConnection,
    recording: &RecordingEncounter,
) -> Result<i32, EventJournalError> {
    diesel::sql_query(
        "INSERT INTO encounters (
           started_at_ms, ended_at_ms, local_player_id, total_dmg, total_heal,
           scene_id, dungeon_difficulty, duration, active_combat_duration,
           quality_flags
         ) VALUES (?, NULL, ?, 0, 0, ?, ?, 0.0, NULL, 0)",
    )
    .bind::<BigInt, _>(recording.started_at_ms)
    .bind::<Nullable<BigInt>, _>(recording.local_player_id)
    .bind::<Nullable<Integer>, _>(recording.scene_id)
    .bind::<Nullable<Integer>, _>(recording.dungeon_difficulty)
    .execute(conn)?;
    let raw_id = diesel::sql_query("SELECT last_insert_rowid() AS id")
        .get_result::<LastIdRow>(conn)?
        .id;
    i32::try_from(raw_id)
        .map_err(|_| EventJournalError::CorruptRow(format!("encounter id {raw_id} exceeds i32")))
}

/// Append an immutable raw chunk. A replay with identical bytes is a no-op;
/// reusing the same primary key for different bytes is rejected.
pub fn append_chunk(
    conn: &mut SqliteConnection,
    chunk: &EncodedHistoryChunk,
) -> Result<InsertOutcome, EventJournalError> {
    validate_chunk(chunk)?;
    conn.transaction::<InsertOutcome, EventJournalError, _>(|tx| {
        let existing = diesel::sql_query(
            "SELECT data FROM encounter_event_chunks
             WHERE encounter_id = ? AND stream_kind = ? AND chunk_index = ?",
        )
        .bind::<Integer, _>(chunk.encounter_id)
        .bind::<Text, _>(chunk.stream_kind.as_db_str())
        .bind::<BigInt, _>(to_i64("chunk index", chunk.chunk_index)?)
        .get_result::<DataRow>(tx)
        .optional()?;
        if let Some(existing) = existing {
            return if existing.data == chunk.data {
                Ok(InsertOutcome::AlreadyPresent)
            } else {
                Err(EventJournalError::ChunkDataConflict {
                    encounter_id: chunk.encounter_id,
                    stream_kind: chunk.stream_kind.as_db_str().to_string(),
                    chunk_index: chunk.chunk_index,
                })
            };
        }

        let state = load_encounter_state(tx, chunk.encounter_id)?
            .ok_or(EventJournalError::EncounterNotFound(chunk.encounter_id))?;
        if state.ended_at_ms.is_some() {
            return Err(EventJournalError::EncounterFinalized(chunk.encounter_id));
        }
        diesel::sql_query(
            "INSERT INTO encounter_event_chunks (
               encounter_id, stream_kind, chunk_index, first_sequence, last_sequence,
               start_offset_ms, end_offset_ms_exclusive, event_count, data
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind::<Integer, _>(chunk.encounter_id)
        .bind::<Text, _>(chunk.stream_kind.as_db_str())
        .bind::<BigInt, _>(to_i64("chunk index", chunk.chunk_index)?)
        .bind::<BigInt, _>(to_i64("first sequence", chunk.first_sequence)?)
        .bind::<BigInt, _>(to_i64("last sequence", chunk.last_sequence)?)
        .bind::<BigInt, _>(to_i64("start offset", chunk.start_offset_ms)?)
        .bind::<BigInt, _>(to_i64("end offset", chunk.end_offset_ms_exclusive)?)
        .bind::<BigInt, _>(to_i64("event count", chunk.event_count)?)
        .bind::<Binary, _>(&chunk.data)
        .execute(tx)?;
        Ok(InsertOutcome::Inserted)
    })
}

/// Atomically publish the final projection and update the recording summary.
pub fn finalize_encounter(
    conn: &mut SqliteConnection,
    finalize: &FinalizeEncounter,
) -> Result<FinalizeOutcome, EventJournalError> {
    validate_finalize(finalize)?;
    conn.transaction::<FinalizeOutcome, EventJournalError, _>(|tx| {
        let state = load_encounter_state(tx, finalize.encounter_id)?
            .ok_or(EventJournalError::EncounterNotFound(finalize.encounter_id))?;
        if state.ended_at_ms.is_some() {
            verify_finalize_replay(tx, &state, finalize)?;
            return Ok(FinalizeOutcome {
                encounter_id: finalize.encounter_id,
                already_finalized: true,
            });
        }
        if finalize.metadata.ended_at_ms < state.started_at_ms {
            return Err(EventJournalError::InvalidInput(
                "encounter end precedes encounter start".to_string(),
            ));
        }
        diesel::sql_query(
            "INSERT INTO encounter_projection (
               encounter_id, last_sequence, quality_flags, data
             ) VALUES (?, ?, ?, ?)",
        )
        .bind::<Integer, _>(finalize.encounter_id)
        .bind::<BigInt, _>(to_i64("last sequence", finalize.projection.last_sequence)?)
        .bind::<Integer, _>(finalize.projection.quality_flags)
        .bind::<Binary, _>(&finalize.projection.data)
        .execute(tx)?;

        let updated = diesel::sql_query(
            "UPDATE encounters
             SET ended_at_ms = ?, local_player_id = ?, total_dmg = ?, total_heal = ?,
                 total_dmg_exact = ?, total_heal_exact = ?,
                 scene_id = ?, dungeon_difficulty = ?, duration = ?,
                 active_combat_duration = ?, is_manually_reset = ?,
                 boss_monster_ids = ?, player_names = ?, quality_flags = ?
             WHERE id = ? AND ended_at_ms IS NULL",
        )
        .bind::<BigInt, _>(finalize.metadata.ended_at_ms)
        .bind::<Nullable<BigInt>, _>(finalize.metadata.local_player_id)
        .bind::<BigInt, _>(finalize.metadata.total_damage)
        .bind::<BigInt, _>(finalize.metadata.total_healing)
        .bind::<Text, _>(&finalize.total_damage_exact)
        .bind::<Text, _>(&finalize.total_healing_exact)
        .bind::<Nullable<Integer>, _>(finalize.metadata.scene_id)
        .bind::<Nullable<Integer>, _>(finalize.metadata.dungeon_difficulty)
        .bind::<Double, _>(finalize.metadata.duration_seconds)
        .bind::<Nullable<Double>, _>(finalize.metadata.active_combat_duration_seconds)
        .bind::<Integer, _>(i32::from(finalize.metadata.is_manually_reset))
        .bind::<Text, _>(&finalize.metadata.boss_monster_ids_json)
        .bind::<Text, _>(&finalize.metadata.player_names_json)
        .bind::<Integer, _>(finalize.metadata.quality_flags)
        .bind::<Integer, _>(finalize.encounter_id)
        .execute(tx)?;
        if updated != 1 {
            return Err(EventJournalError::FinalizeConflict(finalize.encounter_id));
        }
        Ok(FinalizeOutcome {
            encounter_id: finalize.encounter_id,
            already_finalized: false,
        })
    })
}

pub fn load_encounter_descriptor(
    conn: &mut SqliteConnection,
    encounter_id: i32,
) -> Result<EncounterHistoryDescriptor, EventJournalError> {
    let state = load_encounter_state(conn, encounter_id)?
        .ok_or(EventJournalError::EncounterNotFound(encounter_id))?;
    Ok(EncounterHistoryDescriptor {
        encounter_id,
        quality_flags: state.quality_flags,
        started_at_ms: state.started_at_ms,
        ended_at_ms: state.ended_at_ms,
    })
}

pub fn load_chunks_for_range(
    conn: &mut SqliteConnection,
    encounter_id: i32,
    start_ms: u64,
    end_ms_exclusive: u64,
) -> Result<Vec<StoredHistoryChunk>, EventJournalError> {
    if start_ms > end_ms_exclusive {
        return Err(EventJournalError::InvalidInput(
            "range start is after range end".to_string(),
        ));
    }
    if start_ms == end_ms_exclusive {
        return Ok(Vec::new());
    }
    let rows = diesel::sql_query(
        "SELECT encounter_id, stream_kind, chunk_index, first_sequence, last_sequence,
                start_offset_ms, end_offset_ms_exclusive, event_count, data
         FROM encounter_event_chunks
         WHERE encounter_id = ?
           AND start_offset_ms < ?
           AND end_offset_ms_exclusive > ?
         ORDER BY first_sequence ASC, stream_kind ASC, chunk_index ASC",
    )
    .bind::<Integer, _>(encounter_id)
    .bind::<BigInt, _>(to_i64("range end", end_ms_exclusive)?)
    .bind::<BigInt, _>(to_i64("range start", start_ms)?)
    .load::<StoredChunkRow>(conn)?;
    rows.into_iter().map(convert_chunk_row).collect()
}

pub fn load_projection(
    conn: &mut SqliteConnection,
    encounter_id: i32,
) -> Result<Option<StoredProjection>, EventJournalError> {
    let row = diesel::sql_query(
        "SELECT encounter_id, last_sequence, quality_flags, data
         FROM encounter_projection WHERE encounter_id = ?",
    )
    .bind::<Integer, _>(encounter_id)
    .get_result::<StoredProjectionRow>(conn)
    .optional()?;
    row.map(convert_projection_row).transpose()
}

fn load_encounter_state(
    conn: &mut SqliteConnection,
    encounter_id: i32,
) -> Result<Option<EncounterStateRow>, EventJournalError> {
    diesel::sql_query(
        "SELECT started_at_ms, ended_at_ms, quality_flags,
                total_dmg_exact, total_heal_exact
         FROM encounters WHERE id = ?",
    )
    .bind::<Integer, _>(encounter_id)
    .get_result::<EncounterStateRow>(conn)
    .optional()
    .map_err(Into::into)
}

fn verify_finalize_replay(
    conn: &mut SqliteConnection,
    state: &EncounterStateRow,
    finalize: &FinalizeEncounter,
) -> Result<(), EventJournalError> {
    if state.ended_at_ms != Some(finalize.metadata.ended_at_ms)
        || state.quality_flags != finalize.metadata.quality_flags
        || state.total_dmg_exact.as_deref() != Some(finalize.total_damage_exact.as_str())
        || state.total_heal_exact.as_deref() != Some(finalize.total_healing_exact.as_str())
    {
        return Err(EventJournalError::FinalizeConflict(finalize.encounter_id));
    }
    let stored = load_projection(conn, finalize.encounter_id)?
        .ok_or(EventJournalError::FinalizeConflict(finalize.encounter_id))?;
    if stored.last_sequence != finalize.projection.last_sequence
        || stored.quality_flags != finalize.projection.quality_flags
        || stored.data != finalize.projection.data
    {
        return Err(EventJournalError::FinalizeConflict(finalize.encounter_id));
    }
    Ok(())
}

fn validate_chunk(chunk: &EncodedHistoryChunk) -> Result<(), EventJournalError> {
    let sequence_capacity = chunk
        .last_sequence
        .checked_sub(chunk.first_sequence)
        .and_then(|span| span.checked_add(1));
    if chunk.encounter_id <= 0
        || sequence_capacity.is_none_or(|capacity| chunk.event_count > capacity)
        || chunk.start_offset_ms >= chunk.end_offset_ms_exclusive
        || chunk.event_count == 0
        || chunk.data.is_empty()
    {
        return Err(EventJournalError::InvalidInput(
            "chunk has an invalid encounter, range, count, or payload".to_string(),
        ));
    }
    Ok(())
}

fn validate_finalize(finalize: &FinalizeEncounter) -> Result<(), EventJournalError> {
    if finalize.encounter_id <= 0
        || finalize.projection.quality_flags < 0
        || finalize.projection.quality_flags != finalize.metadata.quality_flags
        || finalize.projection.data.is_empty()
    {
        return Err(EventJournalError::InvalidInput(
            "finalization has an invalid encounter or empty projection".to_string(),
        ));
    }
    parse_exact_total("damage", &finalize.total_damage_exact)?;
    parse_exact_total("healing", &finalize.total_healing_exact)?;
    if !finalize.metadata.duration_seconds.is_finite()
        || finalize.metadata.duration_seconds < 0.0
        || finalize
            .metadata
            .active_combat_duration_seconds
            .is_some_and(|value| !value.is_finite() || value < 0.0)
    {
        return Err(EventJournalError::InvalidInput(
            "encounter duration is invalid".to_string(),
        ));
    }
    Ok(())
}

fn parse_exact_total(label: &str, value: &str) -> Result<u128, EventJournalError> {
    let parsed = value.parse::<u128>().map_err(|_| {
        EventJournalError::InvalidInput(format!("exact {label} total is not a u128 decimal"))
    })?;
    if parsed.to_string() != value {
        return Err(EventJournalError::InvalidInput(format!(
            "exact {label} total is not canonical"
        )));
    }
    Ok(parsed)
}

fn convert_chunk_row(row: StoredChunkRow) -> Result<StoredHistoryChunk, EventJournalError> {
    Ok(StoredHistoryChunk {
        encounter_id: row.encounter_id,
        stream_kind: HistoryStream::from_db_str(&row.stream_kind)
            .map_err(|error| EventJournalError::CorruptRow(error.to_string()))?,
        chunk_index: from_i64("chunk index", row.chunk_index)?,
        first_sequence: from_i64("first sequence", row.first_sequence)?,
        last_sequence: from_i64("last sequence", row.last_sequence)?,
        start_offset_ms: from_i64("start offset", row.start_offset_ms)?,
        end_offset_ms_exclusive: from_i64("end offset", row.end_offset_ms_exclusive)?,
        event_count: from_i64("event count", row.event_count)?,
        data: row.data,
    })
}

fn convert_projection_row(row: StoredProjectionRow) -> Result<StoredProjection, EventJournalError> {
    Ok(StoredProjection {
        encounter_id: row.encounter_id,
        last_sequence: from_i64("last sequence", row.last_sequence)?,
        quality_flags: row.quality_flags,
        data: row.data,
    })
}

fn to_i64(label: &str, value: u64) -> Result<i64, EventJournalError> {
    i64::try_from(value).map_err(|_| {
        EventJournalError::InvalidInput(format!("{label} {value} exceeds SQLite INTEGER"))
    })
}

fn from_i64(label: &str, value: i64) -> Result<u64, EventJournalError> {
    u64::try_from(value)
        .map_err(|_| EventJournalError::CorruptRow(format!("{label} {value} is negative")))
}

#[cfg(test)]
mod tests {
    use diesel::connection::SimpleConnection;

    use super::*;
    use crate::database::commands::{BossSummaryDto, EncounterSummaryDto};
    use crate::database::history_codec::{
        HistoryCastKind, HistoryChunker, HistoryEntityContext, HistoryEnvelope, HistoryEvent,
        HistoryHit, HistoryMetric, HistorySkillCast, MAX_EVENTS_PER_CHUNK, decode_history_chunk,
        encode_history_chunk,
    };
    use crate::database::history_query::{
        HistoryProjectionReducer, encode_detail_projection, load_encounter_detail_query,
        project_encounter_detail,
    };

    #[derive(Debug, QueryableByName)]
    struct ColumnNameRow {
        #[diesel(sql_type = Text)]
        name: String,
    }

    fn test_connection() -> SqliteConnection {
        let mut conn = SqliteConnection::establish(":memory:").expect("open database");
        conn.batch_execute("PRAGMA foreign_keys=ON;")
            .expect("enable foreign keys");
        for migration in [
            include_str!("../../migrations/2026-01-01-000000_initial_schema/up.sql"),
            include_str!("../../migrations/2026-03-07-000000_add_active_combat_duration/up.sql"),
            include_str!("../../migrations/2026-04-29-000000_id_name_frontend_lookup/up.sql"),
            include_str!("../../migrations/2026-07-30-000000_event_journal/up.sql"),
        ] {
            conn.batch_execute(migration).expect("run migration");
        }
        conn
    }

    fn begin(conn: &mut SqliteConnection) -> i32 {
        begin_recording_encounter(
            conn,
            &RecordingEncounter {
                started_at_ms: 1_000,
                local_player_id: Some(1),
                scene_id: None,
                dungeon_difficulty: None,
            },
        )
        .expect("begin encounter")
    }

    #[test]
    fn migration_uses_final_event_journal_columns() {
        let mut conn = test_connection();
        let exact_total_columns = diesel::sql_query(
            "SELECT name FROM pragma_table_info('encounters')
             WHERE name IN ('total_dmg_exact', 'total_heal_exact') ORDER BY cid",
        )
        .load::<ColumnNameRow>(&mut conn)
        .expect("read exact total columns")
        .into_iter()
        .map(|row| row.name)
        .collect::<Vec<_>>();
        assert_eq!(exact_total_columns, ["total_dmg_exact", "total_heal_exact"]);

        let chunk_columns = diesel::sql_query(
            "SELECT name FROM pragma_table_info('encounter_event_chunks') ORDER BY cid",
        )
        .load::<ColumnNameRow>(&mut conn)
        .expect("read chunk columns")
        .into_iter()
        .map(|row| row.name)
        .collect::<Vec<_>>();
        assert_eq!(
            chunk_columns,
            [
                "encounter_id",
                "stream_kind",
                "chunk_index",
                "first_sequence",
                "last_sequence",
                "start_offset_ms",
                "end_offset_ms_exclusive",
                "event_count",
                "data",
            ]
        );

        let projection_columns = diesel::sql_query(
            "SELECT name FROM pragma_table_info('encounter_projection') ORDER BY cid",
        )
        .load::<ColumnNameRow>(&mut conn)
        .expect("read projection columns")
        .into_iter()
        .map(|row| row.name)
        .collect::<Vec<_>>();
        assert_eq!(
            projection_columns,
            ["encounter_id", "last_sequence", "quality_flags", "data",]
        );
    }

    fn history_hit(sequence: u64, offset_ms: u64, amount: u64) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::Hit(HistoryHit {
                actor_entity_id: 1,
                source_entity_id: Some(1),
                target_entity_id: 2,
                skill_id: 3,
                base_skill_id: Some(3),
                metric: HistoryMetric::Damage,
                amount: amount.into(),
                effective_amount: amount.into(),
                has_loss_breakdown: true,
                hp_loss: amount.into(),
                shield_loss: 0,
                flags: 0,
                target_is_boss: false,
                target_monster_id: None,
                source_monster_id: None,
                property: None,
                damage_mode: None,
            }),
        }
    }

    fn chunk(encounter_id: i32, amount: u64) -> EncodedHistoryChunk {
        encode_history_chunk(
            encounter_id,
            HistoryStream::Combat,
            0,
            vec![history_hit(0, 10, amount)],
        )
        .expect("encode chunk")
    }

    fn summary(encounter_id: i32) -> EncounterSummaryDto {
        EncounterSummaryDto {
            id: encounter_id,
            started_at_ms: 1_000,
            ended_at_ms: Some(1_100),
            total_dmg: "10".to_string(),
            total_heal: "0".to_string(),
            scene_id: None,
            dungeon_difficulty: None,
            duration: 0.1,
            active_combat_duration: Some(0.1),
            local_player_id: Some(1),
            bosses: Vec::<BossSummaryDto>::new(),
            players: Vec::new(),
            remote_encounter_id: None,
            is_favorite: false,
            note: None,
            detail_available: true,
            display_index: 0,
        }
    }

    #[test]
    fn append_is_idempotent_and_rejects_payload_conflict() {
        let mut conn = test_connection();
        let encounter_id = begin(&mut conn);
        let original = chunk(encounter_id, 10);
        assert_eq!(
            append_chunk(&mut conn, &original).expect("append chunk"),
            InsertOutcome::Inserted
        );
        assert_eq!(
            append_chunk(&mut conn, &original).expect("replay chunk"),
            InsertOutcome::AlreadyPresent
        );
        assert!(matches!(
            append_chunk(&mut conn, &chunk(encounter_id, 11)),
            Err(EventJournalError::ChunkDataConflict { .. })
        ));
    }

    #[test]
    fn one_million_hits_round_trip_through_journal_without_truncation() {
        const HIT_COUNT: u64 = 1_000_000;
        let mut conn = test_connection();
        let encounter_id = begin(&mut conn);
        let mut chunker = HistoryChunker::new(encounter_id).expect("create chunker");
        let mut written_chunks = 0usize;

        for sequence in 0..HIT_COUNT {
            if let Some(chunk) = chunker
                .push(history_hit(sequence, 0, 1))
                .expect("append history hit")
            {
                assert_eq!(
                    append_chunk(&mut conn, &chunk).expect("persist sealed chunk"),
                    InsertOutcome::Inserted
                );
                written_chunks += 1;
            }
        }
        for chunk in chunker.flush().expect("flush chunks") {
            assert_eq!(
                append_chunk(&mut conn, &chunk).expect("persist trailing chunk"),
                InsertOutcome::Inserted
            );
            written_chunks += 1;
        }

        let stored =
            load_chunks_for_range(&mut conn, encounter_id, 0, 1).expect("load persisted chunks");
        assert_eq!(stored.len(), written_chunks);
        assert!(stored.len() > 1);
        assert!(
            stored
                .iter()
                .all(|chunk| chunk.event_count <= MAX_EVENTS_PER_CHUNK as u64)
        );
        assert_eq!(
            stored.iter().map(|chunk| chunk.event_count).sum::<u64>(),
            HIT_COUNT
        );

        let mut next_sequence = 0u64;
        let mut decoded_count = 0u64;
        let mut decoded_damage = 0u128;
        for (expected_index, chunk) in stored.iter().enumerate() {
            assert_eq!(chunk.stream_kind, HistoryStream::Combat);
            assert_eq!(chunk.chunk_index, expected_index as u64);
            assert_eq!(chunk.first_sequence, next_sequence);
            let document = decode_history_chunk(&chunk.data, chunk.stream_kind)
                .expect("decode persisted chunk");
            assert_eq!(document.len() as u64, chunk.event_count);
            assert_eq!(document.sequences.first(), Some(&chunk.first_sequence));
            assert_eq!(document.sequences.last(), Some(&chunk.last_sequence));
            for event in &document.events {
                let HistoryEvent::Hit(hit) = event else {
                    panic!("combat chunk contains a non-hit event");
                };
                decoded_damage += hit.amount;
            }
            decoded_count += chunk.event_count;
            next_sequence = chunk
                .last_sequence
                .checked_add(1)
                .expect("test sequence does not overflow");
        }
        assert_eq!(next_sequence, HIT_COUNT);
        assert_eq!(decoded_count, HIT_COUNT);
        assert_eq!(decoded_damage, u128::from(HIT_COUNT));
    }

    #[test]
    fn range_loading_uses_half_open_chunk_intersections() {
        let mut conn = test_connection();
        let encounter_id = begin(&mut conn);
        let chunks = [
            encode_history_chunk(
                encounter_id,
                HistoryStream::Combat,
                0,
                vec![history_hit(0, 0, 1), history_hit(1, 999, 1)],
            )
            .expect("encode left chunk"),
            encode_history_chunk(
                encounter_id,
                HistoryStream::Combat,
                1,
                vec![history_hit(2, 1_000, 1), history_hit(3, 1_999, 1)],
            )
            .expect("encode right chunk"),
            encode_history_chunk(
                encounter_id,
                HistoryStream::Combat,
                2,
                vec![history_hit(4, 2_000, 1)],
            )
            .expect("encode trailing chunk"),
        ];
        for chunk in &chunks {
            append_chunk(&mut conn, chunk).expect("append range chunk");
        }

        let loaded_indices = |chunks: Vec<StoredHistoryChunk>| {
            chunks
                .into_iter()
                .map(|chunk| chunk.chunk_index)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            loaded_indices(
                load_chunks_for_range(&mut conn, encounter_id, 0, 1_000).expect("load left range")
            ),
            [0]
        );
        assert_eq!(
            loaded_indices(
                load_chunks_for_range(&mut conn, encounter_id, 1_000, 2_000)
                    .expect("load right range")
            ),
            [1]
        );
        assert_eq!(
            loaded_indices(
                load_chunks_for_range(&mut conn, encounter_id, 999, 1_001)
                    .expect("load crossing range")
            ),
            [0, 1]
        );
        assert_eq!(
            loaded_indices(
                load_chunks_for_range(&mut conn, encounter_id, 2_000, 2_001)
                    .expect("load trailing range")
            ),
            [2]
        );
        assert!(
            load_chunks_for_range(&mut conn, encounter_id, 1_000, 1_000)
                .expect("load empty range")
                .is_empty()
        );
    }

    #[test]
    fn finalize_is_atomic_and_idempotent() {
        let mut conn = test_connection();
        let encounter_id = begin(&mut conn);
        let chunk = chunk(encounter_id, 10);
        append_chunk(&mut conn, &chunk).expect("append chunk");
        let timeline_chunk = encode_history_chunk(
            encounter_id,
            HistoryStream::Timeline,
            0,
            vec![HistoryEnvelope {
                sequence: 1,
                offset_ms: 2_999,
                event: HistoryEvent::SkillCast(HistorySkillCast {
                    caster_entity_id: 1,
                    skill_id: 42,
                    kind: HistoryCastKind::KeySkill,
                    remodel_level: None,
                }),
            }],
        )
        .expect("encode delayed marker");
        append_chunk(&mut conn, &timeline_chunk).expect("append delayed marker");
        let mut reducer = HistoryProjectionReducer::new(0..100).expect("reducer");
        reducer.seed_contexts([
            HistoryEntityContext {
                entity_id: 1,
                display_uid: 1,
                name: Some("player".to_string()),
                class_id: None,
                class_spec: None,
                ability_score: None,
                season_strength: None,
                monster_id: None,
            },
            HistoryEntityContext {
                entity_id: 2,
                display_uid: 2,
                name: None,
                class_id: None,
                class_spec: None,
                ability_score: None,
                season_strength: None,
                monster_id: Some(7),
            },
        ]);
        reducer.apply_document(
            &decode_history_chunk(&chunk.data, chunk.stream_kind).expect("decode chunk"),
        );
        reducer.apply_document(
            &decode_history_chunk(&timeline_chunk.data, timeline_chunk.stream_kind)
                .expect("decode timeline chunk"),
        );
        let projection =
            encode_detail_projection(&reducer.finish_detail(encounter_id, summary(encounter_id)))
                .expect("encode projection");
        let finalize = FinalizeEncounter {
            encounter_id,
            total_damage_exact: "10".to_string(),
            total_healing_exact: "0".to_string(),
            metadata: FinalizeEncounterMetadata {
                ended_at_ms: 1_100,
                local_player_id: Some(1),
                total_damage: 10,
                total_healing: 0,
                scene_id: None,
                dungeon_difficulty: None,
                duration_seconds: 0.1,
                active_combat_duration_seconds: Some(0.1),
                is_manually_reset: false,
                boss_monster_ids_json: "[]".to_string(),
                player_names_json: "[]".to_string(),
                quality_flags: 0,
            },
            projection,
        };
        let first = finalize_encounter(&mut conn, &finalize).expect("finalize");
        assert!(!first.already_finalized);
        let replay = finalize_encounter(&mut conn, &finalize).expect("replay finalize");
        assert!(replay.already_finalized);
        assert_eq!(
            load_chunks_for_range(&mut conn, encounter_id, 0, 100)
                .expect("range chunks")
                .len(),
            1
        );

        let query = load_encounter_detail_query(&mut conn, summary(encounter_id))
            .expect("load detail query");
        let detail = project_encounter_detail(query).expect("project detail");
        assert!(detail.detail_available);
        assert_eq!(detail.end_ms_exclusive, 100);
        assert!(detail.markers.is_empty());
        assert_eq!(
            load_chunks_for_range(&mut conn, encounter_id, 0, i64::MAX as u64)
                .expect("full recording")
                .len(),
            2
        );
        // Per-entity damage hits are rebuilt from the raw chunks on load, even
        // though the stored projection snapshot itself carries none.
        let actor_hits = detail
            .damage_hits
            .iter()
            .find(|row| row.entity_id == "1")
            .expect("actor 1 damage hits");
        assert_eq!(actor_hits.offsets_ms, vec![10]);
        assert_eq!(actor_hits.amounts, vec![10]);
    }

    #[test]
    fn exact_summary_totals_round_trip_beyond_i64() {
        let mut conn = test_connection();
        let encounter_id = begin(&mut conn);
        let total_damage_exact = u128::MAX.to_string();
        let total_healing_exact = (i64::MAX as u128 + 1).to_string();
        let finalize = FinalizeEncounter {
            encounter_id,
            total_damage_exact: total_damage_exact.clone(),
            total_healing_exact: total_healing_exact.clone(),
            metadata: FinalizeEncounterMetadata {
                ended_at_ms: 1_100,
                local_player_id: Some(1),
                // SQLite summary columns cannot represent these exact totals.
                total_damage: 0,
                total_healing: 0,
                scene_id: None,
                dungeon_difficulty: None,
                duration_seconds: 0.1,
                active_combat_duration_seconds: Some(0.1),
                is_manually_reset: false,
                boss_monster_ids_json: "[]".to_string(),
                player_names_json: "[]".to_string(),
                quality_flags: 0,
            },
            projection: EncodedProjectionSnapshot {
                last_sequence: 0,
                quality_flags: 0,
                data: vec![1],
            },
        };

        finalize_encounter(&mut conn, &finalize).expect("finalize exact summary");
        let summary = crate::database::commands::load_encounter_summary(&mut conn, encounter_id)
            .expect("load exact summary");
        assert_eq!(summary.total_dmg, total_damage_exact);
        assert_eq!(summary.total_heal, total_healing_exact);
        assert!(summary.detail_available);
    }

    #[test]
    fn summary_only_encounter_never_reads_missing_detail() {
        let mut conn = test_connection();
        let encounter_id = begin(&mut conn);
        let mut summary = summary(encounter_id);
        summary.detail_available = false;

        let query = load_encounter_detail_query(&mut conn, summary).expect("load summary");
        let detail = project_encounter_detail(query).expect("summary remains readable");
        assert!(!detail.detail_available);
        assert!(detail.entities.is_empty());
        assert!(detail.damage_hits.is_empty());
    }
}
