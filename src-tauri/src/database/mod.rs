pub mod commands;
pub mod event_journal;
pub mod history_codec;
pub mod history_query;
pub mod models;
pub mod schema;

use std::path::{Path, PathBuf};
use std::sync::{OnceLock, mpsc};

use diesel::prelude::*;
use diesel::sql_types::Text;
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

/// `encounters` columns absent from databases created by 0.0.1-0.0.3.
///
/// Those releases shipped an older `2026-01-01-000000_initial_schema`. The
/// migration was later rewritten under the same version, so Diesel treats it as
/// applied and never adds these columns. If a later migration drops one of
/// them, remove it here too, or every startup will add it back.
const LEGACY_MISSING_ENCOUNTER_COLUMNS: [(&str, &str); 2] = [
    (
        "boss_names",
        "ALTER TABLE encounters ADD COLUMN boss_names TEXT",
    ),
    (
        "player_names",
        "ALTER TABLE encounters ADD COLUMN player_names TEXT",
    ),
];

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
    #[error("DB schema repair error: {0}")]
    SchemaRepair(#[source] diesel::result::Error),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerNameEntry {
    /// Empty when the player's name was never observed.
    pub name: String,
    pub class_id: i32,
    /// In-game character id (`uuid >> 16`); `None` in rows finalized before
    /// it was recorded.
    #[serde(default)]
    pub uid: Option<i64>,
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
    // Repair before migrating so later migrations can rely on these columns.
    let added = repair_legacy_encounter_columns(&mut conn).map_err(DbInitError::SchemaRepair)?;
    if !added.is_empty() {
        log::info!(target: "app::db", "legacy_schema_repaired table=encounters added_columns={added:?}");
    }
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

#[derive(Debug, QueryableByName)]
struct ColumnNameRow {
    #[diesel(sql_type = Text)]
    name: String,
}

/// Adds the [`LEGACY_MISSING_ENCOUNTER_COLUMNS`] that an existing `encounters`
/// table lacks and returns their names. A database without `encounters` is
/// left for the migrations to create.
///
/// # Errors
///
/// Returns the SQLite error if reading the table layout or adding a column fails.
fn repair_legacy_encounter_columns(conn: &mut SqliteConnection) -> QueryResult<Vec<&'static str>> {
    let existing = diesel::sql_query("SELECT name FROM pragma_table_info('encounters')")
        .load::<ColumnNameRow>(conn)?;
    if existing.is_empty() {
        return Ok(Vec::new());
    }
    let mut added = Vec::new();
    for (column, statement) in LEGACY_MISSING_ENCOUNTER_COLUMNS {
        if existing.iter().any(|row| row.name == column) {
            continue;
        }
        diesel::sql_query(statement).execute(conn)?;
        added.push(column);
    }
    Ok(added)
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
    use diesel::connection::SimpleConnection;

    use super::*;
    use crate::database::schema::detailed_playerdata::dsl as dp;

    /// `encounters` as created by the 0.0.1-0.0.3 `initial_schema` (commit
    /// 3c9af0a), with that migration version already recorded as applied.
    const LEGACY_ENCOUNTERS_SCHEMA: &str = "
        CREATE TABLE encounters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at_ms INTEGER NOT NULL,
          ended_at_ms INTEGER,
          local_player_id INTEGER,
          total_dmg INTEGER DEFAULT 0,
          total_heal INTEGER DEFAULT 0,
          scene_id INTEGER,
          scene_name TEXT,
          duration REAL NOT NULL DEFAULT 0.0,
          uploaded_at_ms INTEGER,
          remote_encounter_id INTEGER,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          is_manually_reset INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_encounters_started ON encounters(started_at_ms);
        CREATE TABLE __diesel_schema_migrations (
          version VARCHAR(50) PRIMARY KEY NOT NULL,
          run_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO __diesel_schema_migrations (version) VALUES ('20260101000000');
    ";

    fn encounter_columns(conn: &mut SqliteConnection) -> Vec<String> {
        diesel::sql_query("SELECT name FROM pragma_table_info('encounters') ORDER BY name")
            .load::<ColumnNameRow>(conn)
            .expect("read encounter columns")
            .into_iter()
            .map(|row| row.name)
            .collect()
    }

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
    fn legacy_database_gains_missing_encounter_columns_before_migrations() {
        let mut conn = SqliteConnection::establish(":memory:").expect("open in-memory sqlite");
        apply_sqlite_pragmas(&mut conn).expect("apply sqlite pragmas");
        conn.batch_execute(LEGACY_ENCOUNTERS_SCHEMA)
            .expect("create legacy schema");

        let added = repair_legacy_encounter_columns(&mut conn).expect("repair legacy schema");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("run embedded migrations");

        assert_eq!(added, ["boss_names", "player_names"]);
        assert_eq!(
            encounter_columns(&mut conn),
            encounter_columns(&mut memory_conn())
        );
        insert_test_encounter(&mut conn, 1_000, Some(2_000), 0);
        use crate::database::schema::encounters::dsl as e;
        let player_names = e::encounters
            .select(e::player_names)
            .first::<Option<String>>(&mut conn)
            .expect("load repaired player_names");
        assert_eq!(player_names, None);
    }

    #[test]
    fn already_migrated_legacy_database_gains_missing_encounter_columns() {
        let mut conn = SqliteConnection::establish(":memory:").expect("open in-memory sqlite");
        apply_sqlite_pragmas(&mut conn).expect("apply sqlite pragmas");
        conn.batch_execute(LEGACY_ENCOUNTERS_SCHEMA)
            .expect("create legacy schema");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("run migrations as 0.2.x did");

        let added = repair_legacy_encounter_columns(&mut conn).expect("repair legacy schema");

        assert_eq!(added, ["boss_names", "player_names"]);
        assert_eq!(
            encounter_columns(&mut conn),
            encounter_columns(&mut memory_conn())
        );
    }

    #[test]
    fn legacy_repair_is_a_noop_for_current_and_empty_databases() {
        let mut current = memory_conn();
        let mut empty = SqliteConnection::establish(":memory:").expect("open in-memory sqlite");

        let added_to_current =
            repair_legacy_encounter_columns(&mut current).expect("repair current schema");
        let added_to_empty =
            repair_legacy_encounter_columns(&mut empty).expect("repair empty database");

        assert!(added_to_current.is_empty());
        assert!(added_to_empty.is_empty());
        assert!(encounter_columns(&mut empty).is_empty());
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
