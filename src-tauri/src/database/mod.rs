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

type DbTask = Box<dyn FnOnce(&mut SqliteConnection) + Send + 'static>;

static DB_SENDER: OnceLock<mpsc::Sender<DbTask>> = OnceLock::new();
static PRELOADED_ENTITY_CACHE: OnceLock<HashMap<i64, CachedEntity>> = OnceLock::new();

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
    pub scene_name: Option<String>,
    pub duration: f64,
    pub is_manually_reset: bool,
    pub boss_names: Vec<String>,
    pub player_names: Vec<PlayerNameEntry>,
}

#[derive(Debug, Clone, Default)]
pub struct CachedEntity {
    pub entity_id: i64,
    pub name: Option<String>,
    pub class_id: Option<i32>,
    pub class_spec: Option<i32>,
    pub ability_score: Option<i32>,
    pub level: Option<i32>,
    pub first_seen_ms: Option<i64>,
    pub last_seen_ms: Option<i64>,
    pub attributes: Option<String>,
    pub dirty: bool,
}

#[derive(Debug, Clone, Default)]
pub struct CachedPlayerData {
    pub player_id: i64,
    pub last_seen_ms: i64,
    pub vdata_bytes: Vec<u8>,
    pub dirty: bool,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn load_initial_entity_cache() -> HashMap<i64, CachedEntity> {
    PRELOADED_ENTITY_CACHE
        .get()
        .cloned()
        .unwrap_or_else(HashMap::new)
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

fn load_entity_cache_from_conn(conn: &mut SqliteConnection) -> Result<HashMap<i64, CachedEntity>, String> {
    use sch::entities::dsl as en;
    let rows: Vec<m::EntityRow> = en::entities.load::<m::EntityRow>(conn).map_err(|e| e.to_string())?;
    let mut cache = HashMap::with_capacity(rows.len());
    for row in rows {
        cache.insert(
            row.entity_id,
            CachedEntity {
                entity_id: row.entity_id,
                name: row.name,
                class_id: row.class_id,
                class_spec: row.class_spec,
                ability_score: row.ability_score,
                level: row.level,
                first_seen_ms: row.first_seen_ms,
                last_seen_ms: row.last_seen_ms,
                attributes: row.attributes,
                dirty: false,
            },
        );
    }
    Ok(cache)
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

    if PRELOADED_ENTITY_CACHE.get().is_none() {
        let cache = load_entity_cache_from_conn(&mut conn).unwrap_or_default();
        let _ = PRELOADED_ENTITY_CACHE.set(cache);
    }

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

pub fn flush_entity_cache(entries: Vec<CachedEntity>) {
    if entries.is_empty() {
        return;
    }

    db_send(move |conn| {
        use sch::entities::dsl as en;

        for entry in &entries {
            let seen_at = entry.last_seen_ms.unwrap_or_else(now_ms);
            let first_seen = entry.first_seen_ms.or(Some(seen_at));
            let insert = m::NewEntity {
                entity_id: entry.entity_id,
                name: entry.name.as_deref(),
                class_id: entry.class_id,
                class_spec: entry.class_spec,
                ability_score: entry.ability_score,
                level: entry.level,
                first_seen_ms: first_seen,
                last_seen_ms: Some(seen_at),
                attributes: entry.attributes.as_deref(),
            };
            let update = m::UpdateEntity {
                name: entry.name.as_deref(),
                class_id: entry.class_id,
                class_spec: entry.class_spec,
                ability_score: entry.ability_score,
                level: entry.level,
                last_seen_ms: Some(seen_at),
                attributes: entry.attributes.as_deref(),
            };

            let result = diesel::insert_into(en::entities)
                .values(&insert)
                .on_conflict(en::entity_id)
                .do_update()
                .set(&update)
                .execute(conn);
            if let Err(e) = result {
                log::warn!(target: "app::db", "flush_entity_cache_failed error={}", e);
            }
        }
    })
}

pub fn flush_playerdata(data: CachedPlayerData) {
    db_send(move |conn| {
        use sch::detailed_playerdata::dsl as dp;

        let insert = m::NewDetailedPlayerData {
            player_id: data.player_id,
            last_seen_ms: data.last_seen_ms,
            vdata_bytes: Some(data.vdata_bytes.as_slice()),
        };
        let update = m::UpdateDetailedPlayerData {
            last_seen_ms: data.last_seen_ms,
            vdata_bytes: Some(data.vdata_bytes.as_slice()),
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
        let boss_names_json = match serde_json::to_string(&metadata.boss_names) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "app::db", "save_encounter_boss_json_failed error={}", e);
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
                scene_name: metadata.scene_name.clone(),
                duration: metadata.duration,
            };

            diesel::insert_into(e::encounters).values(&new_enc).execute(tx)?;
            let encounter_id: i32 = e::encounters.order(e::id.desc()).select(e::id).first(tx)?;

            diesel::update(e::encounters.filter(e::id.eq(encounter_id)))
                .set((
                    e::is_manually_reset.eq(if metadata.is_manually_reset { 1 } else { 0 }),
                    e::boss_names.eq(Some(boss_names_json)),
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
