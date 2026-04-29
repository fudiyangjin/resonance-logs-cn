pub mod commands;
pub mod models;
pub mod schema;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, mpsc};
use std::time::{SystemTime, UNIX_EPOCH};

use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness};
use serde::{Deserialize, Serialize};

use crate::database::models as m;
use crate::database::schema as sch;
use crate::live::opcodes_models::{Encounter, Entity};

pub const MIGRATIONS: EmbeddedMigrations = diesel_migrations::embed_migrations!();
const MAX_ENCOUNTER_HISTORY: i64 = 200;

type DbTask = Box<dyn FnOnce(&mut SqliteConnection) + Send + 'static>;

static DB_SENDER: OnceLock<mpsc::Sender<DbTask>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum DbInitError {
    #[error("DB pool error: {0}")]
    Pool(String),
    #[error("Migration error: {0}")]
    Migration(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerNameEntry {
    pub name: String,
    pub class_id: i32,
}

#[derive(Debug, Clone, Default)]
pub struct EncounterMetadata {
    pub started_at_ms: i64,
    pub ended_at_ms: Option<i64>,
    pub local_player_id: Option<i64>,
    pub total_dmg: i64,
    pub total_heal: i64,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
    pub duration: f64,
    pub active_combat_duration: Option<f64>,
    pub is_manually_reset: bool,
    pub boss_monster_ids: Vec<i32>,
    pub player_names: Vec<PlayerNameEntry>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
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

fn apply_sqlite_pragmas(conn: &mut SqliteConnection) {
    let _ = diesel::sql_query("PRAGMA busy_timeout=30000;").execute(conn);
    let _ = diesel::sql_query("PRAGMA journal_mode=WAL;").execute(conn);
    let _ = diesel::sql_query("PRAGMA synchronous=NORMAL;").execute(conn);
    let _ = diesel::sql_query("PRAGMA foreign_keys=ON;").execute(conn);
}

fn db_thread_main(mut conn: SqliteConnection, rx: mpsc::Receiver<DbTask>) {
    while let Ok(task) = rx.recv() {
        task(&mut conn);
    }
    log::info!(target: "app::db", "db_thread_exiting");
}

pub fn db_exec<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut SqliteConnection) -> Result<T, String> + Send + 'static,
{
    let sender = DB_SENDER
        .get()
        .ok_or_else(|| "DB thread not initialized".to_string())?
        .clone();
    let (reply_tx, reply_rx) = mpsc::channel::<Result<T, String>>();

    sender
        .send(Box::new(move |conn| {
            let _ = reply_tx.send(f(conn));
        }))
        .map_err(|_| "failed to enqueue DB task".to_string())?;

    reply_rx
        .recv()
        .map_err(|_| "failed to receive DB task result".to_string())?
}

pub fn db_send<F>(f: F)
where
    F: FnOnce(&mut SqliteConnection) + Send + 'static,
{
    let Some(sender) = DB_SENDER.get() else {
        log::error!(target: "app::db", "db_send_failed reason=not_initialized");
        return;
    };

    if sender.send(Box::new(f)).is_err() {
        log::error!(target: "app::db", "db_send_failed reason=channel_closed");
    }
}

pub fn init_db() -> Result<(), DbInitError> {
    if DB_SENDER.get().is_some() {
        return Ok(());
    }

    let db_path = default_db_path();
    log::info!(target: "app::db", "db_path={}", db_path.display());
    ensure_parent_dir(&db_path)
        .map_err(|e| DbInitError::Pool(format!("failed to create dir: {e}")))?;

    let mut conn = SqliteConnection::establish(&db_path.to_string_lossy())
        .map_err(|e| DbInitError::Pool(e.to_string()))?;
    apply_sqlite_pragmas(&mut conn);

    conn.run_pending_migrations(MIGRATIONS)
        .map_err(|e| DbInitError::Migration(e.to_string()))?;

    let (tx, rx) = mpsc::channel::<DbTask>();
    std::thread::Builder::new()
        .name("db-worker".to_string())
        .spawn(move || db_thread_main(conn, rx))
        .map_err(|e| DbInitError::Pool(format!("failed to spawn db thread: {e}")))?;

    DB_SENDER
        .set(tx)
        .map_err(|_| DbInitError::Pool("db sender already initialized".to_string()))?;

    Ok(())
}

/// Schedules startup maintenance for encounter history without blocking app setup.
pub fn startup_maintenance() {
    db_send(|conn| {
        if let Err(error) = prune_and_reindex_encounters(conn, MAX_ENCOUNTER_HISTORY) {
            log::warn!(
                target: "app::db",
                "startup_maintenance_failed error={}",
                error
            );
        }
    });
}

fn set_foreign_keys(conn: &mut SqliteConnection, enabled: bool) -> Result<(), String> {
    let pragma = if enabled {
        "PRAGMA foreign_keys=ON;"
    } else {
        "PRAGMA foreign_keys=OFF;"
    };

    diesel::sql_query(pragma)
        .execute(conn)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn prune_and_reindex_encounters(conn: &mut SqliteConnection, keep: i64) -> Result<(), String> {
    use sch::encounters::dsl as e;

    let total = e::encounters
        .count()
        .get_result::<i64>(conn)
        .map_err(|error| error.to_string())?;
    let non_favorite_total = e::encounters
        .filter(e::is_favorite.eq(0))
        .count()
        .get_result::<i64>(conn)
        .map_err(|error| error.to_string())?;
    if non_favorite_total <= keep {
        return Ok(());
    }

    let delete_ids: Vec<i32> = e::encounters
        .select(e::id)
        .filter(e::is_favorite.eq(0))
        .order((e::started_at_ms.desc(), e::id.desc()))
        .offset(keep)
        .load(conn)
        .map_err(|error| error.to_string())?;
    if delete_ids.is_empty() {
        return Ok(());
    }

    let deleted = diesel::delete(e::encounters.filter(e::id.eq_any(&delete_ids)))
        .execute(conn)
        .map_err(|error| error.to_string())?;
    let favorites_preserved = total - non_favorite_total;
    log::info!(
        target: "app::db",
        "startup_maintenance_pruned total={} non_favorite_total={} deleted={} keep={} favorites_preserved={}",
        total,
        non_favorite_total,
        deleted,
        keep,
        favorites_preserved
    );

    set_foreign_keys(conn, false)?;
    let maintenance_result = conn
        .transaction::<(), diesel::result::Error, _>(|tx| {
            diesel::sql_query("DROP TABLE IF EXISTS temp_encounters_reindex;").execute(tx)?;
            diesel::sql_query("DROP TABLE IF EXISTS temp_encounter_data_reindex;").execute(tx)?;

            diesel::sql_query(
                "CREATE TEMP TABLE temp_encounters_reindex AS
                 SELECT
                   ROW_NUMBER() OVER (ORDER BY started_at_ms ASC, id ASC) AS new_id,
                   id AS old_id,
                   started_at_ms,
                   ended_at_ms,
                   local_player_id,
                   total_dmg,
                   total_heal,
                   scene_id,
                   dungeon_difficulty,
                   duration,
                   active_combat_duration,
                   uploaded_at_ms,
                   remote_encounter_id,
                   is_favorite,
                   is_manually_reset,
                   boss_monster_ids,
                   player_names
                 FROM encounters;",
            )
            .execute(tx)?;

            diesel::sql_query(
                "CREATE TEMP TABLE temp_encounter_data_reindex AS
                 SELECT
                   te.new_id AS encounter_id,
                   ed.data AS data
                 FROM encounter_data ed
                 JOIN temp_encounters_reindex te ON te.old_id = ed.encounter_id;",
            )
            .execute(tx)?;

            diesel::sql_query("DELETE FROM encounter_data;").execute(tx)?;
            diesel::sql_query("DELETE FROM encounters;").execute(tx)?;

            diesel::sql_query(
                "INSERT INTO encounters (
                   id,
                   started_at_ms,
                   ended_at_ms,
                   local_player_id,
                   total_dmg,
                   total_heal,
                   scene_id,
                   dungeon_difficulty,
                   duration,
                   active_combat_duration,
                   uploaded_at_ms,
                   remote_encounter_id,
                   is_favorite,
                   is_manually_reset,
                   boss_monster_ids,
                   player_names
                 )
                 SELECT
                   new_id,
                   started_at_ms,
                   ended_at_ms,
                   local_player_id,
                   total_dmg,
                   total_heal,
                   scene_id,
                   dungeon_difficulty,
                   duration,
                   active_combat_duration,
                   uploaded_at_ms,
                   remote_encounter_id,
                   is_favorite,
                   is_manually_reset,
                   boss_monster_ids,
                   player_names
                 FROM temp_encounters_reindex
                 ORDER BY new_id;",
            )
            .execute(tx)?;

            diesel::sql_query(
                "INSERT INTO encounter_data (encounter_id, data)
                 SELECT encounter_id, data
                 FROM temp_encounter_data_reindex
                 ORDER BY encounter_id;",
            )
            .execute(tx)?;

            diesel::sql_query("DELETE FROM sqlite_sequence WHERE name = 'encounters';")
                .execute(tx)?;
            diesel::sql_query(
                "INSERT INTO sqlite_sequence (name, seq)
                 SELECT 'encounters', COUNT(*)
                 FROM encounters;",
            )
            .execute(tx)?;

            diesel::sql_query("DROP TABLE temp_encounter_data_reindex;").execute(tx)?;
            diesel::sql_query("DROP TABLE temp_encounters_reindex;").execute(tx)?;
            Ok(())
        })
        .map_err(|error| error.to_string());
    let foreign_key_result = set_foreign_keys(conn, true);

    match (maintenance_result, foreign_key_result) {
        (Ok(()), Ok(())) => {
            let remaining = keep + favorites_preserved;
            log::info!(
                target: "app::db",
                "startup_maintenance_reindexed next_encounter_id={}",
                remaining + 1
            );
            Ok(())
        }
        (Err(error), Ok(())) => Err(error),
        (Ok(()), Err(error)) => Err(format!("failed to restore foreign keys: {error}")),
        (Err(error), Err(fk_error)) => Err(format!(
            "{error}; failed to restore foreign keys: {fk_error}"
        )),
    }
}

pub fn flush_playerdata(player_id: i64, last_seen_ms: i64, vdata_bytes: Vec<u8>) {
    db_send(move |conn| {
        use sch::detailed_playerdata::dsl as dp;

        let insert = m::NewDetailedPlayerData {
            player_id,
            last_seen_ms,
            vdata_bytes: Some(vdata_bytes.as_slice()),
        };
        let update = m::UpdateDetailedPlayerData {
            last_seen_ms,
            vdata_bytes: Some(vdata_bytes.as_slice()),
        };

        let result = diesel::insert_into(dp::detailed_playerdata)
            .values(&insert)
            .on_conflict(dp::player_id)
            .do_update()
            .set(&update)
            .execute(conn);
        if let Err(e) = result {
            log::warn!(target: "app::db", "flush_playerdata_failed error={}", e);
        }
    })
}

pub fn save_encounter(encounter: &Encounter, metadata: &EncounterMetadata) {
    use sch::encounter_data::dsl as ed;
    use sch::encounters::dsl as e;

    let encounter = encounter.clone();
    let metadata = metadata.clone();
    db_send(move |conn| {
        let combat_entities: HashMap<i64, Entity> = encounter
            .entity_uid_to_entity
            .iter()
            .filter_map(|(uid, entity)| {
                let has_combat =
                    entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
                has_combat.then_some((*uid, entity.clone()))
            })
            .collect();

        let entities_bin = match rmp_serde::to_vec(&combat_entities) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "app::db", "save_encounter_serialize_failed error={}", e);
                return;
            }
        };
        let compressed = match zstd::encode_all(&entities_bin[..], 3) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "app::db", "save_encounter_compress_failed error={}", e);
                return;
            }
        };
        let boss_monster_ids_json = match serde_json::to_string(&metadata.boss_monster_ids) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "app::db", "save_encounter_boss_ids_json_failed error={}", e);
                return;
            }
        };
        let player_names_json = match serde_json::to_string(&metadata.player_names) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "app::db", "save_encounter_player_json_failed error={}", e);
                return;
            }
        };

        let result = conn.transaction::<i32, diesel::result::Error, _>(|tx| {
            let new_enc = m::NewEncounter {
                started_at_ms: metadata.started_at_ms,
                ended_at_ms: metadata.ended_at_ms,
                local_player_id: metadata.local_player_id,
                total_dmg: Some(metadata.total_dmg),
                total_heal: Some(metadata.total_heal),
                scene_id: metadata.scene_id,
                dungeon_difficulty: metadata.dungeon_difficulty,
                duration: metadata.duration,
                active_combat_duration: metadata.active_combat_duration,
            };

            diesel::insert_into(e::encounters)
                .values(&new_enc)
                .execute(tx)?;
            let encounter_id: i32 = e::encounters.order(e::id.desc()).select(e::id).first(tx)?;

            diesel::update(e::encounters.filter(e::id.eq(encounter_id)))
                .set((
                    e::is_manually_reset.eq(if metadata.is_manually_reset { 1 } else { 0 }),
                    e::boss_monster_ids.eq(Some(boss_monster_ids_json)),
                    e::player_names.eq(Some(player_names_json)),
                ))
                .execute(tx)?;

            let payload = m::NewEncounterData {
                encounter_id,
                data: &compressed,
            };
            diesel::insert_into(ed::encounter_data)
                .values(&payload)
                .execute(tx)?;
            Ok(encounter_id)
        });

        if let Err(e) = result {
            log::warn!(target: "app::db", "save_encounter_tx_failed error={}", e);
        }
    })
}

pub fn load_encounter_data(encounter_id: i32) -> Result<HashMap<i64, Entity>, String> {
    use sch::encounter_data::dsl as ed;

    let compressed: Vec<u8> = db_exec(move |conn| {
        ed::encounter_data
            .filter(ed::encounter_id.eq(encounter_id))
            .select(ed::data)
            .first::<Vec<u8>>(conn)
            .map_err(|e| e.to_string())
    })?;
    let decompressed = zstd::decode_all(&compressed[..]).map_err(|e| e.to_string())?;
    rmp_serde::from_slice::<HashMap<i64, Entity>>(&decompressed).map_err(|e| e.to_string())
}
