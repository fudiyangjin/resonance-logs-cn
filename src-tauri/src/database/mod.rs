pub mod commands;
pub mod models;
pub mod schema;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness};
use serde::{Deserialize, Serialize};

use crate::database::models as m;
use crate::database::schema as sch;
use crate::live::opcodes_models::class::ClassSpec;
use crate::live::opcodes_models::{
    AttrType, AttrValue, CombatStats, Encounter, Entity, ObservedActiveBuff, ObservedEffectBuff,
    ObservedEffectSource, ObservedFactorBuff, ObservedFactorItem, ObservedModifierWindow,
    ObservedPassiveSkill, ObservedProfessionSkill, ObservedProfessionTalent,
    ObservedSkillCastEvent, ObservedSkillCooldownEvent, Skill, SkillTargetStats,
};
use blueprotobuf_lib::blueprotobuf::EEntityType;

pub const MIGRATIONS: EmbeddedMigrations = diesel_migrations::embed_migrations!();
const DB_DIR_NAME: &str = "resonance-logs-global";
const DB_FILE_NAME: &str = "resonance-logs-global.db";
const LEGACY_DB_DIR_NAME: &str = "resonance-logs-cn";
const LEGACY_DB_FILE_NAME: &str = "resonance-logs-cn.db";

type DbTask = Box<dyn FnOnce(&mut SqliteConnection) + Send + 'static>;

static DB_SENDER: OnceLock<mpsc::Sender<DbTask>> = OnceLock::new();
const ENCOUNTER_DATA_CACHE_MAX: usize = 3;
type EncounterDataCache = Vec<(i32, Arc<HashMap<i64, Entity>>)>;
static ENCOUNTER_DATA_CACHE: OnceLock<Mutex<EncounterDataCache>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum DbInitError {
    #[error("DB pool error: {0}")]
    Pool(String),
    #[error("Migration error: {0}")]
    Migration(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerNameEntry {
    #[serde(default)]
    pub uid: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub class_id: i32,
    #[serde(default)]
    pub class_spec: ClassSpec,
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
    pub active_combat_duration: Option<f64>,
    pub is_manually_reset: bool,
    pub boss_names: Vec<String>,
    pub player_names: Vec<PlayerNameEntry>,
}

#[derive(Debug, Deserialize)]
struct EntityActiveFieldsBeforeMonsterWithItems {
    name: String,
    entity_type: EEntityType,
    class_id: i32,
    class_spec: ClassSpec,
    ability_score: i32,
    level: i32,
    #[serde(default)]
    monster_name_packet: Option<String>,
    #[serde(default)]
    _legacy_attributes: HashMap<AttrType, AttrValue>,
    damage: CombatStats,
    skill_uid_to_dmg_skill: HashMap<i64, Skill>,
    damage_boss_only: CombatStats,
    healing: CombatStats,
    skill_uid_to_heal_skill: HashMap<i64, Skill>,
    taken: CombatStats,
    skill_uid_to_taken_skill: HashMap<i64, Skill>,
    #[serde(default)]
    active_buffs: Vec<ObservedActiveBuff>,
    #[serde(default)]
    active_factor_buffs: Vec<ObservedFactorBuff>,
    #[serde(default)]
    active_effect_buffs: Vec<ObservedEffectBuff>,
    #[serde(default)]
    modifier_windows: Vec<ObservedModifierWindow>,
    #[serde(default)]
    skill_cast_events: Vec<ObservedSkillCastEvent>,
    #[serde(default)]
    skill_cooldown_events: Vec<ObservedSkillCooldownEvent>,
    #[serde(default)]
    active_effect_sources: Vec<ObservedEffectSource>,
    #[serde(default)]
    active_factor_items: Vec<ObservedFactorItem>,
    #[serde(default)]
    active_passive_skills: Vec<ObservedPassiveSkill>,
    #[serde(default)]
    active_profession_skills: Vec<ObservedProfessionSkill>,
    #[serde(default)]
    active_profession_talents: Vec<ObservedProfessionTalent>,
    monster_type_id: Option<i32>,
    dmg_to_target: HashMap<i64, u128>,
    skill_dmg_to_target: HashMap<(i64, i64), SkillTargetStats>,
    skill_heal_to_target: HashMap<(i64, i64), SkillTargetStats>,
    season_strength: i32,
}

#[derive(Debug, Deserialize)]
struct EntityActiveFieldsBeforeMonsterNoItems {
    name: String,
    entity_type: EEntityType,
    class_id: i32,
    class_spec: ClassSpec,
    ability_score: i32,
    level: i32,
    #[serde(default)]
    monster_name_packet: Option<String>,
    #[serde(default)]
    _legacy_attributes: HashMap<AttrType, AttrValue>,
    damage: CombatStats,
    skill_uid_to_dmg_skill: HashMap<i64, Skill>,
    damage_boss_only: CombatStats,
    healing: CombatStats,
    skill_uid_to_heal_skill: HashMap<i64, Skill>,
    taken: CombatStats,
    skill_uid_to_taken_skill: HashMap<i64, Skill>,
    #[serde(default)]
    active_buffs: Vec<ObservedActiveBuff>,
    #[serde(default)]
    active_factor_buffs: Vec<ObservedFactorBuff>,
    #[serde(default)]
    active_effect_buffs: Vec<ObservedEffectBuff>,
    #[serde(default)]
    modifier_windows: Vec<ObservedModifierWindow>,
    #[serde(default)]
    skill_cast_events: Vec<ObservedSkillCastEvent>,
    #[serde(default)]
    skill_cooldown_events: Vec<ObservedSkillCooldownEvent>,
    #[serde(default)]
    active_effect_sources: Vec<ObservedEffectSource>,
    #[serde(default)]
    active_passive_skills: Vec<ObservedPassiveSkill>,
    #[serde(default)]
    active_profession_skills: Vec<ObservedProfessionSkill>,
    #[serde(default)]
    active_profession_talents: Vec<ObservedProfessionTalent>,
    monster_type_id: Option<i32>,
    dmg_to_target: HashMap<i64, u128>,
    skill_dmg_to_target: HashMap<(i64, i64), SkillTargetStats>,
    skill_heal_to_target: HashMap<(i64, i64), SkillTargetStats>,
    season_strength: i32,
}

impl From<EntityActiveFieldsBeforeMonsterWithItems> for Entity {
    fn from(value: EntityActiveFieldsBeforeMonsterWithItems) -> Self {
        Entity {
            name: value.name,
            entity_type: value.entity_type,
            class_id: value.class_id,
            class_spec: value.class_spec,
            ability_score: value.ability_score,
            level: value.level,
            monster_name_packet: value.monster_name_packet,
            _legacy_attributes: value._legacy_attributes,
            damage: value.damage,
            skill_uid_to_dmg_skill: value.skill_uid_to_dmg_skill,
            damage_boss_only: value.damage_boss_only,
            healing: value.healing,
            skill_uid_to_heal_skill: value.skill_uid_to_heal_skill,
            taken: value.taken,
            skill_uid_to_taken_skill: value.skill_uid_to_taken_skill,
            monster_type_id: value.monster_type_id,
            dmg_to_target: value.dmg_to_target,
            skill_dmg_to_target: value.skill_dmg_to_target,
            skill_heal_to_target: value.skill_heal_to_target,
            season_strength: value.season_strength,
            active_buffs: value.active_buffs,
            active_factor_buffs: value.active_factor_buffs,
            active_effect_buffs: value.active_effect_buffs,
            modifier_windows: value.modifier_windows,
            observed_damage_hits: Vec::new(),
            modifier_hit_buckets: Vec::new(),
            modifier_replay_hits: Vec::new(),
            skill_cast_events: value.skill_cast_events,
            skill_cooldown_events: value.skill_cooldown_events,
            active_effect_sources: value.active_effect_sources,
            active_factor_items: value.active_factor_items,
            active_passive_skills: value.active_passive_skills,
            active_profession_skills: value.active_profession_skills,
            active_profession_talents: value.active_profession_talents,
            recent_taken_events: Default::default(),
            deaths: Vec::new(),
        }
    }
}

impl From<EntityActiveFieldsBeforeMonsterNoItems> for Entity {
    fn from(value: EntityActiveFieldsBeforeMonsterNoItems) -> Self {
        Entity {
            name: value.name,
            entity_type: value.entity_type,
            class_id: value.class_id,
            class_spec: value.class_spec,
            ability_score: value.ability_score,
            level: value.level,
            monster_name_packet: value.monster_name_packet,
            _legacy_attributes: value._legacy_attributes,
            damage: value.damage,
            skill_uid_to_dmg_skill: value.skill_uid_to_dmg_skill,
            damage_boss_only: value.damage_boss_only,
            healing: value.healing,
            skill_uid_to_heal_skill: value.skill_uid_to_heal_skill,
            taken: value.taken,
            skill_uid_to_taken_skill: value.skill_uid_to_taken_skill,
            monster_type_id: value.monster_type_id,
            dmg_to_target: value.dmg_to_target,
            skill_dmg_to_target: value.skill_dmg_to_target,
            skill_heal_to_target: value.skill_heal_to_target,
            season_strength: value.season_strength,
            active_buffs: value.active_buffs,
            active_factor_buffs: value.active_factor_buffs,
            active_effect_buffs: value.active_effect_buffs,
            modifier_windows: value.modifier_windows,
            observed_damage_hits: Vec::new(),
            modifier_hit_buckets: Vec::new(),
            modifier_replay_hits: Vec::new(),
            skill_cast_events: value.skill_cast_events,
            skill_cooldown_events: value.skill_cooldown_events,
            active_effect_sources: value.active_effect_sources,
            active_factor_items: Vec::new(),
            active_passive_skills: value.active_passive_skills,
            active_profession_skills: value.active_profession_skills,
            active_profession_talents: value.active_profession_talents,
            recent_taken_events: Default::default(),
            deaths: Vec::new(),
        }
    }
}

fn decode_encounter_entities(bytes: &[u8]) -> Result<HashMap<i64, Entity>, String> {
    match rmp_serde::from_slice::<HashMap<i64, Entity>>(bytes) {
        Ok(entities) => return Ok(entities),
        Err(primary_error) => {
            if let Ok(entities) = rmp_serde::from_slice::<
                HashMap<i64, EntityActiveFieldsBeforeMonsterWithItems>,
            >(bytes)
            {
                return Ok(entities
                    .into_iter()
                    .map(|(uid, entity)| (uid, entity.into()))
                    .collect());
            }
            if let Ok(entities) =
                rmp_serde::from_slice::<HashMap<i64, EntityActiveFieldsBeforeMonsterNoItems>>(bytes)
            {
                return Ok(entities
                    .into_iter()
                    .map(|(uid, entity)| (uid, entity.into()))
                    .collect());
            }
            Err(primary_error.to_string())
        }
    }
}

fn encounter_data_cache() -> &'static Mutex<EncounterDataCache> {
    ENCOUNTER_DATA_CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

fn remember_encounter_data_cache(
    encounter_id: i32,
    entities: HashMap<i64, Entity>,
) -> Arc<HashMap<i64, Entity>> {
    let cached_entities = Arc::new(entities);
    let Ok(mut cache) = encounter_data_cache().lock() else {
        return cached_entities;
    };

    cache.retain(|(cached_id, _)| *cached_id != encounter_id);
    cache.insert(0, (encounter_id, Arc::clone(&cached_entities)));
    cache.truncate(ENCOUNTER_DATA_CACHE_MAX);
    cached_entities
}

pub fn invalidate_encounter_data_cache(encounter_id: i32) {
    let Some(cache) = ENCOUNTER_DATA_CACHE.get() else {
        return;
    };
    if let Ok(mut cache) = cache.lock() {
        cache.retain(|(cached_id, _)| *cached_id != encounter_id);
    }
}

pub fn invalidate_encounter_data_cache_many(encounter_ids: &[i32]) {
    let Some(cache) = ENCOUNTER_DATA_CACHE.get() else {
        return;
    };
    if let Ok(mut cache) = cache.lock() {
        cache.retain(|(cached_id, _)| !encounter_ids.contains(cached_id));
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn default_db_path() -> PathBuf {
    if let Some(mut dir) = dirs::data_local_dir() {
        dir.push(DB_DIR_NAME);
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(DB_FILE_NAME);
        copy_legacy_database_if_missing(&path);
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(DB_FILE_NAME)
    }
}

fn copy_legacy_database_if_missing(target_db: &Path) {
    if target_db.exists() {
        return;
    }

    let Some(target_dir) = target_db.parent() else {
        return;
    };
    let Some(base_dir) = target_dir.parent() else {
        return;
    };

    let legacy_dir = base_dir.join(LEGACY_DB_DIR_NAME);
    let legacy_db = legacy_dir.join(LEGACY_DB_FILE_NAME);
    if !legacy_db.exists() {
        return;
    }

    for suffix in ["", "-wal", "-shm"] {
        let source = legacy_dir.join(format!("{LEGACY_DB_FILE_NAME}{suffix}"));
        let target = target_dir.join(format!("{DB_FILE_NAME}{suffix}"));
        if source.exists() && !target.exists() {
            let _ = std::fs::copy(source, target);
        }
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

/// Startup hook for database maintenance.
pub fn startup_maintenance() {
    log::info!(
        target: "app::db",
        "startup_maintenance_skipped reason=automatic_history_prune_disabled"
    );
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

fn entity_has_combat_surface(entity: &Entity) -> bool {
    entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0
}

fn entity_has_player_identity_surface(uid: i64, entity: &Entity, local_player_uid: i64) -> bool {
    entity.entity_type == EEntityType::EntChar
        && (uid == local_player_uid
            || !entity.name.trim().is_empty()
            || entity.class_id > 0
            || entity.class_spec != ClassSpec::Unknown
            || entity.ability_score > 0
            || entity.level > 0
            || entity.season_strength > 0)
}

pub fn save_encounter(encounter: &Encounter, metadata: &EncounterMetadata) {
    use sch::encounter_data::dsl as ed;
    use sch::encounters::dsl as e;

    let encounter = encounter.clone();
    let metadata = metadata.clone();
    db_send(move |conn| {
        let persisted_entities: HashMap<i64, Entity> = encounter
            .entity_uid_to_entity
            .iter()
            .filter_map(|(uid, entity)| {
                (entity_has_combat_surface(entity)
                    || entity_has_player_identity_surface(*uid, entity, encounter.local_player_uid))
                .then_some((*uid, entity.clone()))
            })
            .collect();

        let mut entities_bin = Vec::new();
        let serialize_result = {
            let mut serializer = rmp_serde::Serializer::new(&mut entities_bin).with_struct_map();
            persisted_entities.serialize(&mut serializer)
        };
        if let Err(e) = serialize_result {
            log::warn!(target: "app::db", "save_encounter_serialize_failed error={}", e);
            return;
        }
        if entities_bin.is_empty() {
            log::warn!(target: "app::db", "save_encounter_serialize_failed error=empty payload");
            return;
        }
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
                active_combat_duration: metadata.active_combat_duration,
            };

            diesel::insert_into(e::encounters)
                .values(&new_enc)
                .execute(tx)?;
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

        match result {
            Ok(encounter_id) => {
                remember_encounter_data_cache(encounter_id, persisted_entities);
            }
            Err(e) => {
                log::warn!(target: "app::db", "save_encounter_tx_failed error={}", e);
            }
        }
    })
}

pub fn load_encounter_data_cached(encounter_id: i32) -> Result<Arc<HashMap<i64, Entity>>, String> {
    use sch::encounter_data::dsl as ed;

    let total_started = Instant::now();
    if let Ok(mut cache) = encounter_data_cache().lock() {
        if let Some(position) = cache
            .iter()
            .position(|(cached_id, _)| *cached_id == encounter_id)
        {
            let (_, cached_entities) = cache.remove(position);
            let result = Arc::clone(&cached_entities);
            cache.insert(0, (encounter_id, cached_entities));
            log::info!(
                target: "app::history",
                "encounter_data_cache_hit encounter_id={} entities={} total_ms={}",
                encounter_id,
                result.len(),
                total_started.elapsed().as_millis()
            );
            return Ok(result);
        }
    }

    let db_started = Instant::now();
    let compressed: Vec<u8> = db_exec(move |conn| {
        ed::encounter_data
            .filter(ed::encounter_id.eq(encounter_id))
            .select(ed::data)
            .first::<Vec<u8>>(conn)
            .map_err(|e| e.to_string())
    })?;
    let db_ms = db_started.elapsed().as_millis();

    let compressed_bytes = compressed.len();
    let zstd_started = Instant::now();
    let decompressed = zstd::decode_all(&compressed[..]).map_err(|e| e.to_string())?;
    let zstd_ms = zstd_started.elapsed().as_millis();

    let decompressed_bytes = decompressed.len();
    let decode_started = Instant::now();
    let entities = decode_encounter_entities(&decompressed)?;
    let decode_ms = decode_started.elapsed().as_millis();
    let entity_count = entities.len();
    let cached_entities = remember_encounter_data_cache(encounter_id, entities);
    log::info!(
        target: "app::history",
        "encounter_data_loaded encounter_id={} compressed_bytes={} decompressed_bytes={} entities={} db_ms={} zstd_ms={} decode_ms={} total_ms={}",
        encounter_id,
        compressed_bytes,
        decompressed_bytes,
        entity_count,
        db_ms,
        zstd_ms,
        decode_ms,
        total_started.elapsed().as_millis()
    );
    Ok(cached_entities)
}
