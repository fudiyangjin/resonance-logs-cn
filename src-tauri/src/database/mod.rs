pub mod commands;
pub mod event_journal;
pub mod history_codec;
pub mod history_query;
pub mod models;
pub mod schema;

use std::path::{Path, PathBuf};
use std::sync::{OnceLock, mpsc};

use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness};
use serde::{Deserialize, Serialize};

use crate::database::models as m;
use crate::database::schema as sch;

use self::event_journal::{FinalizeEncounter, FinalizeOutcome, InsertOutcome, RecordingEncounter};
use self::history_codec::EncodedHistoryChunk;
use self::history_query::{
    EncounterDetailData, EncounterDetailQuery, EncounterRangeData, EncounterRangeQuery,
};

pub const MIGRATIONS: EmbeddedMigrations = diesel_migrations::embed_migrations!();
pub const DEFAULT_ENCOUNTER_HISTORY_LIMIT: i64 = 200;
pub const MAX_ENCOUNTER_HISTORY_LIMIT: i64 = 2_000;
const HISTORY_RETENTION_FILE: &str = "historyRetention.json";
const DATABASE_QUEUE_CAPACITY: usize = 256;

type DatabaseOperation = Box<dyn FnOnce(&mut SqliteConnection) + Send + 'static>;

enum DatabaseRequest {
    Execute(DatabaseOperation),
    BeginRecording {
        recording: RecordingEncounter,
        reply: mpsc::SyncSender<Result<i32, String>>,
    },
    AppendChunk {
        chunk: EncodedHistoryChunk,
        reply: mpsc::SyncSender<Result<InsertOutcome, String>>,
    },
    Finalize {
        finalize: FinalizeEncounter,
        reply: mpsc::SyncSender<Result<FinalizeOutcome, String>>,
    },
    LoadDetail {
        encounter_id: i32,
        reply: mpsc::SyncSender<Result<EncounterDetailQuery, String>>,
    },
    LoadRange {
        encounter_id: i32,
        start_ms: u64,
        end_ms_exclusive: u64,
        reply: mpsc::SyncSender<Result<EncounterRangeQuery, String>>,
    },
    Barrier(mpsc::SyncSender<Result<(), String>>),
    Shutdown(mpsc::SyncSender<Result<(), String>>),
}

static DATABASE_SENDER: OnceLock<mpsc::SyncSender<DatabaseRequest>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum DbInitError {
    #[error("DB connection error: {0}")]
    Connection(String),
    #[error("DB migration error: {0}")]
    Migration(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerNameEntry {
    pub name: String,
    pub class_id: i32,
}

pub fn default_db_path() -> PathBuf {
    if let Some(mut dir) = dirs::data_local_dir() {
        dir.push("resonance-logs-cn");
        let _ = std::fs::create_dir_all(&dir);
        dir.join("resonance-logs-cn.db")
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("resonance-logs-cn.db")
    }
}

pub fn ensure_parent_dir(path: &Path) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}

pub fn init_db() -> Result<(), DbInitError> {
    if DATABASE_SENDER.get().is_some() {
        return Ok(());
    }
    let db_path = default_db_path();
    log::info!(target: "app::db", "db_path={}", db_path.display());
    ensure_parent_dir(&db_path).map_err(|error| {
        DbInitError::Connection(format!("failed to create DB directory: {error}"))
    })?;
    let mut conn = SqliteConnection::establish(&db_path.to_string_lossy())
        .map_err(|error| DbInitError::Connection(error.to_string()))?;
    apply_sqlite_pragmas(&mut conn).map_err(DbInitError::Connection)?;
    conn.run_pending_migrations(MIGRATIONS)
        .map_err(|error| DbInitError::Migration(error.to_string()))?;

    let (sender, receiver) = mpsc::sync_channel(DATABASE_QUEUE_CAPACITY);
    std::thread::Builder::new()
        .name("db-worker".to_string())
        .spawn(move || database_actor(conn, receiver))
        .map_err(|error| {
            DbInitError::Connection(format!("failed to spawn database actor: {error}"))
        })?;
    DATABASE_SENDER
        .set(sender)
        .map_err(|_| DbInitError::Connection("database actor already initialized".to_string()))?;
    Ok(())
}

#[cfg(test)]
pub(crate) fn init_in_memory_actor_for_test() -> Result<(), String> {
    if DATABASE_SENDER.get().is_some() {
        return Err("database actor is already initialized".to_string());
    }

    let mut conn = SqliteConnection::establish(":memory:").map_err(|error| error.to_string())?;
    apply_sqlite_pragmas(&mut conn)?;
    conn.run_pending_migrations(MIGRATIONS)
        .map_err(|error| error.to_string())?;

    let (sender, receiver) = mpsc::sync_channel(DATABASE_QUEUE_CAPACITY);
    std::thread::Builder::new()
        .name("db-worker-test".to_string())
        .spawn(move || database_actor(conn, receiver))
        .map_err(|error| format!("failed to spawn test database actor: {error}"))?;
    DATABASE_SENDER
        .set(sender)
        .map_err(|_| "database actor was initialized concurrently".to_string())
}

fn apply_sqlite_pragmas(conn: &mut SqliteConnection) -> Result<(), String> {
    for (name, statement) in [
        ("busy_timeout", "PRAGMA busy_timeout=30000;"),
        ("journal_mode", "PRAGMA journal_mode=WAL;"),
        ("synchronous", "PRAGMA synchronous=NORMAL;"),
        ("foreign_keys", "PRAGMA foreign_keys=ON;"),
    ] {
        diesel::sql_query(statement)
            .execute(conn)
            .map_err(|error| format!("failed to apply SQLite {name} pragma: {error}"))?;
    }
    Ok(())
}

fn database_actor(mut conn: SqliteConnection, receiver: mpsc::Receiver<DatabaseRequest>) {
    let mut shutdown_reply = None;
    while let Ok(request) = receiver.recv() {
        match request {
            DatabaseRequest::Execute(operation) => operation(&mut conn),
            DatabaseRequest::BeginRecording { recording, reply } => {
                let result = event_journal::begin_recording_encounter(&mut conn, &recording)
                    .map_err(|error| error.to_string());
                let _ = reply.send(result);
            }
            DatabaseRequest::AppendChunk { chunk, reply } => {
                let result = event_journal::append_chunk(&mut conn, &chunk)
                    .map_err(|error| error.to_string());
                let _ = reply.send(result);
            }
            DatabaseRequest::Finalize { finalize, reply } => {
                let result = event_journal::finalize_encounter(&mut conn, &finalize)
                    .map_err(|error| error.to_string());
                let _ = reply.send(result);
            }
            DatabaseRequest::LoadDetail {
                encounter_id,
                reply,
            } => {
                let result =
                    commands::load_encounter_summary(&mut conn, encounter_id).and_then(|summary| {
                        history_query::load_encounter_detail_query(&mut conn, summary)
                            .map_err(|error| error.to_string())
                    });
                let _ = reply.send(result);
            }
            DatabaseRequest::LoadRange {
                encounter_id,
                start_ms,
                end_ms_exclusive,
                reply,
            } => {
                let result = history_query::load_encounter_range_query(
                    &mut conn,
                    encounter_id,
                    start_ms,
                    end_ms_exclusive,
                )
                .map_err(|error| error.to_string());
                let _ = reply.send(result);
            }
            DatabaseRequest::Barrier(reply) => {
                let _ = reply.send(Ok(()));
            }
            DatabaseRequest::Shutdown(reply) => {
                shutdown_reply = Some(reply);
                break;
            }
        }
    }
    drop(conn);
    if let Some(reply) = shutdown_reply {
        let _ = reply.send(Ok(()));
    }
    log::info!(target: "app::db", "database_actor_exiting");
}

fn database_sender() -> Result<mpsc::SyncSender<DatabaseRequest>, String> {
    DATABASE_SENDER
        .get()
        .cloned()
        .ok_or_else(|| "database actor is not initialized".to_string())
}

fn request<T>(
    build: impl FnOnce(mpsc::SyncSender<Result<T, String>>) -> DatabaseRequest,
) -> Result<T, String> {
    let sender = database_sender()?;
    let (reply, receiver) = mpsc::sync_channel(0);
    sender
        .send(build(reply))
        .map_err(|_| "database actor queue is closed".to_string())?;
    receiver
        .recv()
        .map_err(|_| "database actor dropped the response".to_string())?
}

/// Runs a non-history operation on the actor-owned connection.
pub fn db_exec<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut SqliteConnection) -> Result<T, String> + Send + 'static,
{
    let sender = database_sender()?;
    let (reply, receiver) = mpsc::sync_channel(0);
    sender
        .send(DatabaseRequest::Execute(Box::new(move |conn| {
            let _ = reply.send(operation(conn));
        })))
        .map_err(|_| "database actor queue is closed".to_string())?;
    receiver
        .recv()
        .map_err(|_| "database actor dropped the response".to_string())?
}

pub fn db_send<F>(operation: F)
where
    F: FnOnce(&mut SqliteConnection) + Send + 'static,
{
    let Ok(sender) = database_sender() else {
        log::error!(target: "app::db", "database_send_failed reason=not_initialized");
        return;
    };
    if sender
        .send(DatabaseRequest::Execute(Box::new(operation)))
        .is_err()
    {
        log::error!(target: "app::db", "database_send_failed reason=queue_closed");
    }
}

fn upsert_playerdata(
    conn: &mut SqliteConnection,
    player_id: i64,
    last_seen_ms: i64,
    vdata_bytes: &[u8],
) -> QueryResult<usize> {
    use sch::detailed_playerdata::dsl as dp;

    let insert = m::NewDetailedPlayerData {
        player_id,
        last_seen_ms,
        vdata_bytes: Some(vdata_bytes),
    };
    let update = m::UpdateDetailedPlayerData {
        last_seen_ms,
        vdata_bytes: Some(vdata_bytes),
    };

    diesel::insert_into(dp::detailed_playerdata)
        .values(&insert)
        .on_conflict(dp::player_id)
        .do_update()
        .set(&update)
        .execute(conn)
}

/// Fire-and-forget upsert of the local player's `CharSerialize` bytes.
/// Does not wait for SQLite; the decode thread only blocks if the actor queue is full.
pub fn flush_playerdata(player_id: i64, last_seen_ms: i64, vdata_bytes: Vec<u8>) {
    db_send(move |conn| {
        if let Err(error) = upsert_playerdata(conn, player_id, last_seen_ms, &vdata_bytes) {
            log::warn!(target: "app::db", "flush_playerdata_failed error={error}");
        }
    });
}

pub fn begin_history_recording(recording: RecordingEncounter) -> Result<i32, String> {
    request(|reply| DatabaseRequest::BeginRecording { recording, reply })
}

pub fn append_history_chunk(chunk: EncodedHistoryChunk) -> Result<InsertOutcome, String> {
    request(|reply| DatabaseRequest::AppendChunk { chunk, reply })
}

pub fn finalize_history_recording(finalize: FinalizeEncounter) -> Result<FinalizeOutcome, String> {
    request(|reply| DatabaseRequest::Finalize { finalize, reply })
}

pub fn load_history_detail(encounter_id: i32) -> Result<EncounterDetailData, String> {
    let query = request(|reply| DatabaseRequest::LoadDetail {
        encounter_id,
        reply,
    })?;
    history_query::project_encounter_detail(query).map_err(|error| error.to_string())
}

pub fn load_history_range(
    encounter_id: i32,
    start_ms: u64,
    end_ms_exclusive: u64,
) -> Result<EncounterRangeData, String> {
    let query = request(|reply| DatabaseRequest::LoadRange {
        encounter_id,
        start_ms,
        end_ms_exclusive,
        reply,
    })?;
    history_query::project_encounter_range(query, start_ms, end_ms_exclusive)
        .map_err(|error| error.to_string())
}

pub fn flush_database() -> Result<(), String> {
    request(DatabaseRequest::Barrier)
}

pub fn shutdown_database() -> Result<(), String> {
    if DATABASE_SENDER.get().is_none() {
        return Ok(());
    }
    request(DatabaseRequest::Shutdown)
}

#[derive(Debug, Serialize, Deserialize)]
struct HistoryRetentionConfig {
    limit: i64,
}

fn is_valid_history_retention_limit(limit: i64) -> bool {
    (1..=MAX_ENCOUNTER_HISTORY_LIMIT).contains(&limit)
}

/// Read `stores/historyRetention.json`. Missing or invalid values use the default.
pub fn load_history_retention_limit(app_handle: &tauri::AppHandle) -> i64 {
    let Some((path, config)) = crate::live::store_file::load_store_json::<HistoryRetentionConfig>(
        app_handle,
        HISTORY_RETENTION_FILE,
    ) else {
        return DEFAULT_ENCOUNTER_HISTORY_LIMIT;
    };
    if is_valid_history_retention_limit(config.limit) {
        return config.limit;
    }
    log::warn!(
        target: "app::db",
        "history_retention_config_invalid path={} limit={} fallback={DEFAULT_ENCOUNTER_HISTORY_LIMIT}",
        path.display(),
        config.limit
    );
    DEFAULT_ENCOUNTER_HISTORY_LIMIT
}

/// Write `stores/historyRetention.json`. Rejects limits outside 1..=2000.
pub fn save_history_retention_limit(
    app_handle: &tauri::AppHandle,
    limit: i64,
) -> Result<(), String> {
    if !is_valid_history_retention_limit(limit) {
        return Err(format!(
            "history retention limit must be from 1 to {MAX_ENCOUNTER_HISTORY_LIMIT}"
        ));
    }
    crate::live::store_file::save_store_json(
        app_handle,
        HISTORY_RETENTION_FILE,
        &HistoryRetentionConfig { limit },
    )
    .map(|_| ())
}

/// Delete old non-favorite summaries. Primary keys are stable and are never
/// rewritten; child chunks/projections are removed by foreign-key cascade.
pub fn startup_maintenance(history_limit: i64) {
    db_send(move |conn| {
        use sch::encounters::dsl as e;
        match diesel::delete(e::encounters.filter(e::ended_at_ms.is_null())).execute(conn) {
            Ok(deleted) if deleted > 0 => {
                log::info!(target: "app::db", "startup_maintenance_removed_recording deleted={deleted}");
            }
            Ok(_) => {}
            Err(error) => {
                log::warn!(target: "app::db", "startup_maintenance_recording_cleanup_failed error={error}");
                return;
            }
        }
        if let Err(error) = prune_encounters(conn, history_limit) {
            log::warn!(target: "app::db", "startup_maintenance_failed error={error}");
        }
    });
}

fn prune_encounters(conn: &mut SqliteConnection, keep: i64) -> Result<(), String> {
    use sch::encounters::dsl as e;
    let delete_ids = e::encounters
        .select(e::id)
        .filter(e::is_favorite.eq(0))
        .filter(e::ended_at_ms.is_not_null())
        .order((e::started_at_ms.desc(), e::id.desc()))
        .offset(keep.max(0))
        .load::<i32>(conn)
        .map_err(|error| error.to_string())?;
    if delete_ids.is_empty() {
        return Ok(());
    }
    let deleted = diesel::delete(e::encounters.filter(e::id.eq_any(delete_ids)))
        .execute(conn)
        .map_err(|error| error.to_string())?;
    log::info!(target: "app::db", "startup_maintenance_pruned deleted={deleted} keep={keep}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::schema::detailed_playerdata::dsl as dp;

    fn memory_conn() -> SqliteConnection {
        let mut conn = SqliteConnection::establish(":memory:").expect("open in-memory sqlite");
        apply_sqlite_pragmas(&mut conn).expect("apply sqlite pragmas");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("run embedded migrations");
        conn
    }

    fn load_row(conn: &mut SqliteConnection, player_id: i64) -> (i64, Option<Vec<u8>>) {
        dp::detailed_playerdata
            .filter(dp::player_id.eq(player_id))
            .select((dp::last_seen_ms, dp::vdata_bytes))
            .first(conn)
            .expect("load playerdata row")
    }

    #[test]
    fn history_retention_limit_accepts_only_the_configured_range() {
        assert!(is_valid_history_retention_limit(1));
        assert!(is_valid_history_retention_limit(
            MAX_ENCOUNTER_HISTORY_LIMIT
        ));
        assert!(!is_valid_history_retention_limit(0));
        assert!(!is_valid_history_retention_limit(
            MAX_ENCOUNTER_HISTORY_LIMIT + 1
        ));
    }

    #[test]
    fn history_retention_config_round_trips_and_rejects_non_integer_limits() {
        let json = serde_json::to_string(&HistoryRetentionConfig { limit: 300 })
            .expect("serialize config");
        assert_eq!(json, r#"{"limit":300}"#);
        let config = serde_json::from_str::<HistoryRetentionConfig>(&json).expect("parse config");
        assert_eq!(config.limit, 300);

        assert!(serde_json::from_str::<HistoryRetentionConfig>(r#"{"limit":"200"}"#).is_err());
        assert!(serde_json::from_str::<HistoryRetentionConfig>("invalid").is_err());
    }

    #[test]
    fn inserted_encounter_note_defaults_to_null() {
        let mut conn = memory_conn();
        insert_test_encounter(&mut conn, 1_000, Some(2_000), 0);

        use crate::database::schema::encounters::dsl as e;
        let note = e::encounters
            .select(e::note)
            .first::<Option<String>>(&mut conn)
            .expect("load migrated note");

        assert_eq!(note, None);
    }

    fn insert_test_encounter(
        conn: &mut SqliteConnection,
        started_at_ms: i64,
        ended_at_ms: Option<i64>,
        is_favorite: i32,
    ) {
        diesel::sql_query(
            "INSERT INTO encounters (started_at_ms, ended_at_ms, duration, is_favorite)
             VALUES (?, ?, ?, ?)",
        )
        .bind::<diesel::sql_types::BigInt, _>(started_at_ms)
        .bind::<diesel::sql_types::Nullable<diesel::sql_types::BigInt>, _>(ended_at_ms)
        .bind::<diesel::sql_types::Double, _>(1.0_f64)
        .bind::<diesel::sql_types::Integer, _>(is_favorite)
        .execute(conn)
        .expect("insert encounter");
    }

    #[test]
    fn prune_keeps_favorites_and_unfinished_rows_outside_the_limit() {
        let mut conn = memory_conn();
        insert_test_encounter(&mut conn, 1_000, Some(2_000), 0);
        insert_test_encounter(&mut conn, 2_000, Some(3_000), 0);
        insert_test_encounter(&mut conn, 3_000, Some(4_000), 0);
        insert_test_encounter(&mut conn, 4_000, Some(5_000), 1);
        insert_test_encounter(&mut conn, 5_000, None, 0);

        prune_encounters(&mut conn, 2).expect("prune encounters");

        use crate::database::schema::encounters::dsl as e;
        let remaining = e::encounters
            .select((e::started_at_ms, e::ended_at_ms, e::is_favorite))
            .order(e::started_at_ms.asc())
            .load::<(i64, Option<i64>, i32)>(&mut conn)
            .expect("load remaining encounters");
        assert_eq!(
            remaining,
            vec![
                (2_000, Some(3_000), 0),
                (3_000, Some(4_000), 0),
                (4_000, Some(5_000), 1),
                (5_000, None, 0),
            ]
        );
    }

    #[test]
    fn upsert_playerdata_inserts_then_overwrites() {
        let mut conn = memory_conn();

        upsert_playerdata(&mut conn, 42, 1_000, b"first").expect("insert playerdata");
        let (seen, bytes) = load_row(&mut conn, 42);
        assert_eq!(seen, 1_000);
        assert_eq!(bytes.as_deref(), Some(b"first".as_slice()));

        upsert_playerdata(&mut conn, 42, 2_000, b"second").expect("update playerdata");
        let (seen, bytes) = load_row(&mut conn, 42);
        assert_eq!(seen, 2_000);
        assert_eq!(bytes.as_deref(), Some(b"second".as_slice()));
    }
}
