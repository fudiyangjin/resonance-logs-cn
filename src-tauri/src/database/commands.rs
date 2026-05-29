use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::database::PlayerNameEntry;
use crate::database::db_exec;
use crate::database::schema as sch;
use crate::live::commands_models as lc;
use crate::live::monster_registry;
use crate::live::opcodes_models::{Entity, class};
use blueprotobuf_lib::blueprotobuf::EEntityType;

const HISTORY_ENTITY_SUMMARY_VERSION: i32 = 2;
const HISTORY_ENTITY_SUMMARY_CACHE_MAX: usize = 16;
type HistoryEntitySummaryCache = Vec<(i32, Arc<Vec<lc::HistoryEntityData>>)>;
static HISTORY_ENTITY_SUMMARY_CACHE: OnceLock<Mutex<HistoryEntitySummaryCache>> = OnceLock::new();

/// A summary of a player in an encounter.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSummaryDto {
    /// The player UID.
    pub uid: i64,
    /// The player name.
    pub name: String,
    /// The class ID of the player.
    pub class_id: i32,
    /// The class specialization enum value of the player.
    pub class_spec: i32,
    /// The class specialization name of the player.
    pub class_spec_name: String,
}

/// A summary of an encounter.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterSummaryDto {
    /// The ID of the encounter.
    pub id: i32,
    /// The start time of the encounter in milliseconds since the Unix epoch.
    pub started_at_ms: i64,
    /// The end time of the encounter in milliseconds since the Unix epoch.
    pub ended_at_ms: Option<i64>,
    /// The total damage dealt in the encounter.
    pub total_dmg: i64,
    /// The total healing done in the encounter.
    pub total_heal: i64,
    /// The ID of the scene where the encounter took place.
    pub scene_id: Option<i32>,
    /// The name of the scene where the encounter took place.
    pub scene_name: Option<String>,
    /// The duration of the encounter in seconds.
    pub duration: f64,
    /// The accumulated active combat duration in seconds.
    pub active_combat_duration: Option<f64>,
    /// The UID of the local player for this encounter.
    pub local_player_id: Option<i64>,
    /// A list of bosses in the encounter.
    pub bosses: Vec<BossSummaryDto>,
    /// A list of players in the encounter.
    pub players: Vec<PlayerSummaryDto>,
    /// The encounter ID on the remote website/server after successful upload.
    pub remote_encounter_id: Option<i64>,
    /// Whether the encounter is favorited.
    pub is_favorite: bool,
}

/// The result of a query for recent encounters.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentEncountersResult {
    /// The rows of encounter summaries.
    pub rows: Vec<EncounterSummaryDto>,
    /// The total number of encounters.
    pub total_count: i64,
}

/// Filters for querying encounters.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterFiltersDto {
    /// A list of boss names to filter by.
    pub boss_names: Option<Vec<String>>,
    /// A list of encounter names to filter by.
    pub encounter_names: Option<Vec<String>>,
    /// A player name to filter by.
    pub player_name: Option<String>,
    /// A list of player names to filter by.
    pub player_names: Option<Vec<String>>,
    /// The start date to filter by in milliseconds since the Unix epoch.
    pub date_from_ms: Option<i64>,
    /// The end date to filter by in milliseconds since the Unix epoch.
    pub date_to_ms: Option<i64>,
    /// Whether to filter by favorite encounters.
    pub is_favorite: Option<bool>,
}

/// The result of a query for boss names.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BossNamesResult {
    /// A list of boss names.
    pub names: Vec<String>,
}

/// A summary of a boss.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BossSummaryDto {
    /// The name of the monster.
    pub monster_name: String,
    /// The maximum HP of the monster.
    pub max_hp: Option<i64>,
    /// Whether the boss was defeated.
    pub is_defeated: bool,
}

/// The result of a query for scene names.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SceneNamesResult {
    /// A list of scene names.
    pub names: Vec<String>,
}

/// The result of a query for player names.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerNamesResult {
    /// A list of player names.
    pub names: Vec<String>,
}

fn with_db<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut diesel::sqlite::SqliteConnection) -> Result<T, String> + Send + 'static,
{
    db_exec(f)
}

fn parse_player_entries(json: &Option<String>) -> Vec<PlayerSummaryDto> {
    let Some(j) = json else {
        return vec![];
    };

    if let Ok(entries) = serde_json::from_str::<Vec<PlayerNameEntry>>(j) {
        return entries
            .into_iter()
            .map(|entry| PlayerSummaryDto {
                uid: entry.uid,
                name: entry.name,
                class_id: entry.class_id,
                class_spec: entry.class_spec as i32,
                class_spec_name: class::get_class_spec(entry.class_spec),
            })
            .collect();
    }

    serde_json::from_str::<Vec<String>>(j)
        .unwrap_or_default()
        .into_iter()
        .map(|name| PlayerSummaryDto {
            uid: 0,
            name,
            class_id: 0,
            class_spec: 0,
            class_spec_name: String::new(),
        })
        .collect()
}

fn parse_boss_name_strings(json: &Option<String>) -> Vec<String> {
    json.as_ref()
        .and_then(|j| serde_json::from_str::<Vec<String>>(j).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|name| {
            let trimmed = name.trim();
            (!trimmed.is_empty()
                && !monster_registry::is_boss_metric_excluded_monster_name(trimmed))
            .then(|| trimmed.to_string())
        })
        .collect()
}

fn parse_boss_summary_entries(json: &Option<String>) -> Vec<BossSummaryDto> {
    parse_boss_name_strings(json)
        .into_iter()
        .map(|name| BossSummaryDto {
            monster_name: name,
            max_hp: None,
            is_defeated: true,
        })
        .collect()
}

fn extract_player_names_from_json(json: &Option<String>) -> Vec<String> {
    parse_player_entries(json)
        .into_iter()
        .map(|player| player.name)
        .collect()
}

fn has_active_encounter_filters(filter: &EncounterFiltersDto) -> bool {
    filter.is_favorite == Some(true)
        || filter
            .boss_names
            .as_ref()
            .is_some_and(|values| !values.is_empty())
        || filter
            .encounter_names
            .as_ref()
            .is_some_and(|values| !values.is_empty())
        || filter
            .player_names
            .as_ref()
            .is_some_and(|values| !values.is_empty())
        || filter
            .player_name
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
        || filter.date_from_ms.is_some()
        || filter.date_to_ms.is_some()
}

/// Gets a list of unique boss names.
///
/// # Returns
///
/// * `Result<BossNamesResult, String>` - A list of unique boss names.
#[tauri::command]
#[specta::specta]
pub fn get_unique_boss_names() -> Result<BossNamesResult, String> {
    with_db(|conn| {
        use sch::encounters::dsl as e;
        use std::collections::HashSet;

        let rows: Vec<Option<String>> = e::encounters
            .select(e::boss_names)
            .load::<Option<String>>(conn)
            .map_err(|e| e.to_string())?;
        let mut set = HashSet::new();
        for json in rows {
            for name in parse_boss_name_strings(&json) {
                set.insert(name);
            }
        }
        let boss_names: Vec<String> = set.into_iter().collect();
        Ok(BossNamesResult { names: boss_names })
    })
}

/// Gets a list of unique scene names.
///
/// # Returns
///
/// * `Result<SceneNamesResult, String>` - A list of unique scene names.
#[tauri::command]
#[specta::specta]
pub fn get_unique_scene_names() -> Result<SceneNamesResult, String> {
    with_db(|conn| {
        use std::collections::HashSet;

        let scene_names: Vec<Option<String>> = sch::encounters::dsl::encounters
            .select(sch::encounters::dsl::scene_name)
            .load::<Option<String>>(conn)
            .map_err(|e| e.to_string())?;

        let names: Vec<String> = scene_names
            .into_iter()
            .flatten()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        Ok(SceneNamesResult { names })
    })
}

/// Gets a list of player names filtered by a prefix.
///
/// This will return up to 5 matching player names (to keep the UI responsive).
///
/// # Arguments
///
/// * `prefix` - The prefix to filter by.
///
/// # Returns
///
/// * `Result<PlayerNamesResult, String>` - A list of player names.
#[tauri::command]
#[specta::specta]
pub fn get_player_names_filtered(prefix: String) -> Result<PlayerNamesResult, String> {
    // Only query if prefix is at least 1 character
    if prefix.trim().len() < 1 {
        return Ok(PlayerNamesResult { names: vec![] });
    }

    let prefix = prefix.trim().to_string();
    with_db(move |conn| {
        use sch::entities::dsl as en;

        let pattern = format!("%{}%", prefix);
        // Use distinct + limit to get up to 5 unique matching names from the DB
        let player_names: Vec<String> = en::entities
            .select(en::name)
            .filter(en::name.is_not_null())
            .filter(en::name.like(pattern))
            .limit(5)
            .load::<Option<String>>(conn)
            .map_err(|e| e.to_string())?
            .into_iter()
            .flatten()
            .collect();

        Ok(PlayerNamesResult {
            names: player_names,
        })
    })
}

/// Gets a list of recent encounters filtered by the given criteria.
///
/// # Arguments
///
/// * `limit` - The maximum number of encounters to return.
/// * `offset` - The number of encounters to skip.
/// * `filters` - The filters to apply.
///
/// # Returns
///
/// * `Result<RecentEncountersResult, String>` - A list of recent encounters.
#[tauri::command]
#[specta::specta]
pub fn get_recent_encounters_filtered(
    limit: i32,
    offset: i32,
    filters: Option<EncounterFiltersDto>,
) -> Result<RecentEncountersResult, String> {
    with_db(move |conn| {
        use sch::encounters::dsl as e;
        type EncounterSummaryRow = (
            i32,
            i64,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i32>,
            Option<String>,
            f64,
            Option<f64>,
            Option<i64>,
            Option<i64>,
            i32,
            Option<String>,
            Option<String>,
        );
        let filters = filters.filter(has_active_encounter_filters);
        let has_filters = filters.is_some();
        let page_limit = limit.max(0) as i64;
        let page_offset = offset.max(0) as i64;
        let mut rows: Vec<EncounterSummaryRow> = if has_filters {
            e::encounters
                .filter(e::ended_at_ms.is_not_null())
                .order(e::started_at_ms.desc())
                .select((
                    e::id,
                    e::started_at_ms,
                    e::ended_at_ms,
                    e::total_dmg,
                    e::total_heal,
                    e::scene_id,
                    e::scene_name,
                    e::duration,
                    e::active_combat_duration,
                    e::local_player_id,
                    e::remote_encounter_id,
                    e::is_favorite,
                    e::boss_names,
                    e::player_names,
                ))
                .load(conn)
                .map_err(|er| er.to_string())?
        } else {
            e::encounters
                .filter(e::ended_at_ms.is_not_null())
                .order(e::started_at_ms.desc())
                .limit(page_limit)
                .offset(page_offset)
                .select((
                    e::id,
                    e::started_at_ms,
                    e::ended_at_ms,
                    e::total_dmg,
                    e::total_heal,
                    e::scene_id,
                    e::scene_name,
                    e::duration,
                    e::active_combat_duration,
                    e::local_player_id,
                    e::remote_encounter_id,
                    e::is_favorite,
                    e::boss_names,
                    e::player_names,
                ))
                .load(conn)
                .map_err(|er| er.to_string())?
        };
        if let Some(filter) = filters {
            rows.retain(
                |(
                    _,
                    started,
                    _,
                    _,
                    _,
                    _,
                    scene_name,
                    _,
                    _,
                    _,
                    _,
                    is_favorite,
                    boss_names_json,
                    player_names_json,
                )| {
                    if let Some(is_fav) = filter.is_favorite {
                        if is_fav && *is_favorite == 0 {
                            return false;
                        }
                    }
                    if let Some(from_ms) = filter.date_from_ms {
                        if *started < from_ms {
                            return false;
                        }
                    }
                    if let Some(to_ms) = filter.date_to_ms {
                        if *started > to_ms {
                            return false;
                        }
                    }
                    if let Some(ref encounter_names) = filter.encounter_names {
                        if !encounter_names.is_empty()
                            && !scene_name
                                .as_ref()
                                .map(|n| encounter_names.contains(n))
                                .unwrap_or(false)
                        {
                            return false;
                        }
                    }
                    if let Some(ref boss_names) = filter.boss_names {
                        if !boss_names.is_empty() {
                            let stored = parse_boss_name_strings(boss_names_json);
                            if !boss_names.iter().any(|b| stored.contains(b)) {
                                return false;
                            }
                        }
                    }
                    if let Some(ref player_names) = filter.player_names {
                        if !player_names.is_empty() {
                            let stored = extract_player_names_from_json(player_names_json);
                            if !player_names.iter().any(|p| stored.contains(p)) {
                                return false;
                            }
                        }
                    }
                    if let Some(ref player_name) = filter.player_name {
                        let trimmed = player_name.trim();
                        if !trimmed.is_empty() {
                            let stored = extract_player_names_from_json(player_names_json);
                            if !stored.iter().any(|p| p.contains(trimmed)) {
                                return false;
                            }
                        }
                    }
                    true
                },
            );
        }
        let total_count = if has_filters {
            rows.len() as i64
        } else {
            e::encounters
                .filter(e::ended_at_ms.is_not_null())
                .count()
                .get_result::<i64>(conn)
                .map_err(|er| er.to_string())?
        };
        let paged_rows: Vec<EncounterSummaryRow> = if has_filters {
            rows.into_iter()
                .skip(page_offset as usize)
                .take(page_limit as usize)
                .collect()
        } else {
            rows
        };

        // Collect boss and player data for each encounter
        let mut mapped: Vec<EncounterSummaryDto> = Vec::new();

        for (
            id,
            started,
            ended,
            td,
            th,
            scene_id,
            scene_name,
            duration,
            active_combat_duration,
            local_player_id,
            remote_id,
            is_fav,
            boss_json,
            player_json,
        ) in paged_rows
        {
            let boss_entries = parse_boss_summary_entries(&boss_json);
            let player_entries = parse_player_entries(&player_json);

            mapped.push(EncounterSummaryDto {
                id,
                started_at_ms: started,
                ended_at_ms: ended,
                total_dmg: td.unwrap_or(0),
                total_heal: th.unwrap_or(0),
                scene_id,
                scene_name,
                duration,
                active_combat_duration,
                local_player_id,
                bosses: boss_entries,
                players: player_entries,
                remote_encounter_id: remote_id,
                is_favorite: is_fav != 0,
            });
        }

        Ok(RecentEncountersResult {
            rows: mapped,
            total_count,
        })
    })
}

/// Gets a list of recent encounters.
///
/// # Arguments
///
/// * `limit` - The maximum number of encounters to return.
/// * `offset` - The number of encounters to skip.
///
/// # Returns
///
/// * `Result<RecentEncountersResult, String>` - A list of recent encounters.
#[tauri::command]
#[specta::specta]
pub fn get_recent_encounters(limit: i32, offset: i32) -> Result<RecentEncountersResult, String> {
    get_recent_encounters_filtered(limit, offset, None)
}

/// Get player name by UID from database
///
/// # Arguments
///
/// * `uid` - The UID of the player.
///
/// # Returns
///
/// * `Result<Option<String>, String>` - The name of the player, or `None` if not found.
pub fn get_name_by_uid(uid: i64) -> Result<Option<String>, String> {
    with_db(move |conn| {
        use sch::entities::dsl as en;

        let name: Option<Option<String>> = en::entities
            .select(en::name)
            .filter(en::entity_id.eq(uid))
            .first::<Option<String>>(conn)
            .optional()
            .map_err(|e| e.to_string())?;

        Ok(name.flatten())
    })
}

/// Get recent players ordered by last_seen_ms (most recent first) kinda scuffed maybe update in future
///
/// # Arguments
///
/// * `limit` - The maximum number of players to return.
///
/// # Returns
///
/// * `Result<Vec<(i64, String)>, String>` - A list of recent players.
pub fn get_recent_players(limit: i64) -> Result<Vec<(i64, String)>, String> {
    with_db(move |conn| {
        use sch::entities::dsl as en;

        let rows: Vec<(i64, Option<String>)> = en::entities
            .select((en::entity_id, en::name))
            .filter(en::name.is_not_null())
            .order(en::last_seen_ms.desc())
            .limit(limit)
            .load(conn)
            .map_err(|e: diesel::result::Error| e.to_string())?;

        Ok(rows
            .into_iter()
            .filter_map(|(uid, name_opt)| name_opt.map(|name| (uid, name)))
            .collect())
    })
}

/// A Tauri command to get a list of recent players.
///
/// # Arguments
///
/// * `limit` - The maximum number of players to return.
///
/// # Returns
///
/// * `Result<Vec<(i64, String)>, String>` - A list of recent players.
#[tauri::command]
#[specta::specta]
pub fn get_recent_players_command(limit: i32) -> Result<Vec<(i64, String)>, String> {
    get_recent_players(limit as i64)
}

/// A Tauri command to get the name of a player by their UID.
///
/// # Arguments
///
/// * `uid` - The UID of the player.
///
/// # Returns
///
/// * `Result<Option<String>, String>` - The name of the player, or `None` if not found.
#[tauri::command]
#[specta::specta]
pub fn get_player_name_command(uid: i64) -> Result<Option<String>, String> {
    get_name_by_uid(uid)
}

/// Gets an encounter by its ID.
///
/// # Arguments
///
/// * `encounter_id` - The ID of the encounter.
///
/// # Returns
///
/// * `Result<EncounterSummaryDto, String>` - The encounter summary.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_by_id(encounter_id: i32) -> Result<EncounterSummaryDto, String> {
    use sch::encounters::dsl as e;
    let row: (
        i32,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i32>,
        Option<String>,
        f64,
        Option<f64>,
        Option<i64>,
        Option<i64>,
        i32,
        Option<String>,
        Option<String>,
    ) = with_db(move |conn| {
        e::encounters
            .filter(e::id.eq(encounter_id))
            .select((
                e::id,
                e::started_at_ms,
                e::ended_at_ms,
                e::total_dmg,
                e::total_heal,
                e::scene_id,
                e::scene_name,
                e::duration,
                e::active_combat_duration,
                e::local_player_id,
                e::remote_encounter_id,
                e::is_favorite,
                e::boss_names,
                e::player_names,
            ))
            .first(conn)
            .map_err(|er| er.to_string())
    })?;

    let boss_names = parse_boss_summary_entries(&row.12);
    let player_entries = parse_player_entries(&row.13);

    Ok(EncounterSummaryDto {
        id: row.0,
        started_at_ms: row.1,
        ended_at_ms: row.2,
        total_dmg: row.3.unwrap_or(0),
        total_heal: row.4.unwrap_or(0),
        scene_id: row.5,
        scene_name: row.6.clone(),
        duration: row.7,
        active_combat_duration: row.8,
        local_player_id: row.9,
        bosses: boss_names,
        players: player_entries,
        remote_encounter_id: row.10,
        is_favorite: row.11 != 0,
    })
}

fn entity_has_modifier_state(entity: &Entity) -> bool {
    !entity.active_buffs.is_empty()
        || !entity.active_factor_buffs.is_empty()
        || !entity.active_effect_buffs.is_empty()
        || !entity.modifier_windows.is_empty()
        || !entity.modifier_hit_buckets.is_empty()
        || !entity.modifier_replay_hits.is_empty()
        || !entity.skill_cast_events.is_empty()
        || !entity.skill_cooldown_events.is_empty()
        || !entity.active_effect_sources.is_empty()
        || !entity.active_factor_items.is_empty()
        || !entity.active_passive_skills.is_empty()
        || !entity.active_profession_skills.is_empty()
        || !entity.active_profession_talents.is_empty()
}

fn entity_has_player_identity_surface(entity: &Entity) -> bool {
    entity.entity_type == EEntityType::EntChar
        && (!entity.name.trim().is_empty()
            || entity.class_id > 0
            || entity.class_spec != class::ClassSpec::Unknown
            || entity.ability_score > 0
            || entity.level > 0
            || entity.season_strength > 0)
}

fn entity_has_history_surface(entity: &Entity, include_modifier_details: bool) -> bool {
    let has_combat = entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
    has_combat
        || entity_has_player_identity_surface(entity)
        || !entity.deaths.is_empty()
        || (include_modifier_details && entity_has_modifier_state(entity))
}

fn history_entity_summary_cache() -> &'static Mutex<HistoryEntitySummaryCache> {
    HISTORY_ENTITY_SUMMARY_CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

fn remember_history_entity_summary_cache(
    encounter_id: i32,
    rows: Vec<lc::HistoryEntityData>,
) -> Arc<Vec<lc::HistoryEntityData>> {
    let cached_rows = Arc::new(rows);
    let Ok(mut cache) = history_entity_summary_cache().lock() else {
        return cached_rows;
    };

    cache.retain(|(cached_id, _)| *cached_id != encounter_id);
    cache.insert(0, (encounter_id, Arc::clone(&cached_rows)));
    cache.truncate(HISTORY_ENTITY_SUMMARY_CACHE_MAX);
    cached_rows
}

fn load_history_entity_summary_cache(encounter_id: i32) -> Option<Arc<Vec<lc::HistoryEntityData>>> {
    let Ok(mut cache) = history_entity_summary_cache().lock() else {
        return None;
    };

    let position = cache
        .iter()
        .position(|(cached_id, _)| *cached_id == encounter_id)?;
    let (_, cached_rows) = cache.remove(position);
    let result = Arc::clone(&cached_rows);
    cache.insert(0, (encounter_id, cached_rows));
    Some(result)
}

fn invalidate_history_entity_summary_cache(encounter_id: i32) {
    let Some(cache) = HISTORY_ENTITY_SUMMARY_CACHE.get() else {
        return;
    };
    if let Ok(mut cache) = cache.lock() {
        cache.retain(|(cached_id, _)| *cached_id != encounter_id);
    }
}

fn invalidate_history_entity_summary_cache_many(encounter_ids: &[i32]) {
    let Some(cache) = HISTORY_ENTITY_SUMMARY_CACHE.get() else {
        return;
    };
    if let Ok(mut cache) = cache.lock() {
        cache.retain(|(cached_id, _)| !encounter_ids.contains(cached_id));
    }
}

fn encode_history_entity_summary(rows: &[lc::HistoryEntityData]) -> Result<Vec<u8>, String> {
    let mut encoded = Vec::new();
    {
        let mut serializer = rmp_serde::Serializer::new(&mut encoded).with_struct_map();
        rows.serialize(&mut serializer).map_err(|e| e.to_string())?;
    }
    zstd::encode_all(&encoded[..], 3).map_err(|e| e.to_string())
}

fn decode_history_entity_summary(bytes: &[u8]) -> Result<Vec<lc::HistoryEntityData>, String> {
    let decoded = zstd::decode_all(bytes).map_err(|e| e.to_string())?;
    rmp_serde::from_slice::<Vec<lc::HistoryEntityData>>(&decoded).map_err(|e| e.to_string())
}

fn load_history_entity_summary(
    encounter_id: i32,
) -> Result<Option<Vec<lc::HistoryEntityData>>, String> {
    if let Some(rows) = load_history_entity_summary_cache(encounter_id) {
        log::info!(
            target: "app::history",
            "history_entity_summary_cache_hit encounter_id={} rows={}",
            encounter_id,
            rows.len()
        );
        return Ok(Some((*rows).clone()));
    }

    use sch::encounter_entity_summaries::dsl as es;
    let started = Instant::now();
    let row = db_exec(move |conn| {
        es::encounter_entity_summaries
            .filter(es::encounter_id.eq(encounter_id))
            .filter(es::version.eq(HISTORY_ENTITY_SUMMARY_VERSION))
            .select(es::data)
            .first::<Vec<u8>>(conn)
            .optional()
            .map_err(|e| e.to_string())
    })?;

    let Some(bytes) = row else {
        return Ok(None);
    };
    let rows = decode_history_entity_summary(&bytes)?;
    log::info!(
        target: "app::history",
        "history_entity_summary_loaded encounter_id={} rows={} bytes={} total_ms={}",
        encounter_id,
        rows.len(),
        bytes.len(),
        started.elapsed().as_millis()
    );
    remember_history_entity_summary_cache(encounter_id, rows.clone());
    Ok(Some(rows))
}

fn save_history_entity_summary(
    encounter_id: i32,
    rows: &[lc::HistoryEntityData],
) -> Result<(), String> {
    use sch::encounter_entity_summaries::dsl as es;

    let encoded = encode_history_entity_summary(rows)?;
    let encoded_len = encoded.len();
    db_exec(move |conn| {
        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            diesel::delete(
                es::encounter_entity_summaries.filter(es::encounter_id.eq(encounter_id)),
            )
            .execute(conn)?;
            diesel::insert_into(es::encounter_entity_summaries)
                .values((
                    es::encounter_id.eq(encounter_id),
                    es::version.eq(HISTORY_ENTITY_SUMMARY_VERSION),
                    es::data.eq(&encoded),
                ))
                .execute(conn)?;
            Ok(())
        })
        .map_err(|e| e.to_string())
    })?;
    log::info!(
        target: "app::history",
        "history_entity_summary_saved encounter_id={} rows={} bytes={}",
        encounter_id,
        rows.len(),
        encoded_len
    );
    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum HistoryTargetDetailMode {
    Summary,
    Full,
}

fn to_history_entity_data(
    uid: i64,
    entity: &Entity,
    include_modifier_details: bool,
    target_detail_mode: HistoryTargetDetailMode,
) -> lc::HistoryEntityData {
    let dmg_per_target = match target_detail_mode {
        HistoryTargetDetailMode::Summary => lc::build_per_target_summary_stats(
            &entity.skill_dmg_to_target,
            Some(&entity.dmg_to_target),
        ),
        HistoryTargetDetailMode::Full => {
            lc::build_per_target_stats(&entity.skill_dmg_to_target, Some(&entity.dmg_to_target))
        }
    };
    let heal_per_target = match target_detail_mode {
        HistoryTargetDetailMode::Summary => {
            lc::build_per_target_summary_stats(&entity.skill_heal_to_target, None)
        }
        HistoryTargetDetailMode::Full => {
            lc::build_per_target_stats(&entity.skill_heal_to_target, None)
        }
    };

    lc::HistoryEntityData {
        uid,
        name: entity.name.clone(),
        class_id: entity.class_id,
        class_spec: entity.class_spec as i32,
        class_name: class::get_class_name(entity.class_id),
        class_spec_name: class::get_class_spec(entity.class_spec),
        ability_score: entity.ability_score,
        season_strength: entity.season_strength,
        damage: lc::to_raw_combat_stats(&entity.damage),
        damage_boss_only: lc::to_raw_combat_stats(&entity.damage_boss_only),
        healing: lc::to_raw_combat_stats(&entity.healing),
        taken: lc::to_raw_combat_stats(&entity.taken),
        dmg_skills: entity
            .skill_uid_to_dmg_skill
            .iter()
            .map(|(skill_id, stats)| (*skill_id, lc::to_raw_skill_stats(stats)))
            .collect(),
        heal_skills: entity
            .skill_uid_to_heal_skill
            .iter()
            .map(|(skill_id, stats)| (*skill_id, lc::to_raw_skill_stats(stats)))
            .collect(),
        taken_skills: entity
            .skill_uid_to_taken_skill
            .iter()
            .map(|(skill_id, stats)| (*skill_id, lc::to_raw_skill_stats(stats)))
            .collect(),
        active_buffs: if include_modifier_details {
            entity
                .active_buffs
                .iter()
                .map(lc::to_active_buff_state)
                .collect()
        } else {
            Vec::new()
        },
        active_factor_buffs: if include_modifier_details {
            entity
                .active_factor_buffs
                .iter()
                .map(lc::to_active_factor_buff_state)
                .collect()
        } else {
            Vec::new()
        },
        active_effect_buffs: if include_modifier_details {
            entity
                .active_effect_buffs
                .iter()
                .map(lc::to_active_effect_buff_state)
                .collect()
        } else {
            Vec::new()
        },
        modifier_windows: if include_modifier_details {
            entity
                .modifier_windows
                .iter()
                .map(lc::to_modifier_window_state)
                .collect()
        } else {
            Vec::new()
        },
        modifier_hit_buckets: if include_modifier_details {
            compact_modifier_hit_buckets(
                entity
                    .modifier_hit_buckets
                    .iter()
                    .map(lc::to_modifier_hit_bucket_state),
            )
        } else {
            Vec::new()
        },
        modifier_replay_hits: if include_modifier_details {
            entity
                .modifier_replay_hits
                .iter()
                .map(lc::to_modifier_replay_hit_state)
                .collect()
        } else {
            Vec::new()
        },
        skill_cast_events: if include_modifier_details {
            entity
                .skill_cast_events
                .iter()
                .map(lc::to_skill_cast_event_state)
                .collect()
        } else {
            Vec::new()
        },
        skill_cooldown_events: if include_modifier_details {
            entity
                .skill_cooldown_events
                .iter()
                .map(lc::to_skill_cooldown_event_state)
                .collect()
        } else {
            Vec::new()
        },
        active_effect_sources: if include_modifier_details {
            entity
                .active_effect_sources
                .iter()
                .map(lc::to_active_effect_source_state)
                .collect()
        } else {
            Vec::new()
        },
        active_factor_items: if include_modifier_details {
            entity
                .active_factor_items
                .iter()
                .map(lc::to_active_factor_item_state)
                .collect()
        } else {
            Vec::new()
        },
        active_passive_skills: if include_modifier_details {
            entity
                .active_passive_skills
                .iter()
                .map(lc::to_active_passive_skill_state)
                .collect()
        } else {
            Vec::new()
        },
        active_profession_skills: if include_modifier_details {
            entity
                .active_profession_skills
                .iter()
                .map(lc::to_active_profession_skill_state)
                .collect()
        } else {
            Vec::new()
        },
        active_profession_talents: if include_modifier_details {
            entity
                .active_profession_talents
                .iter()
                .map(lc::to_active_profession_talent_state)
                .collect()
        } else {
            Vec::new()
        },
        modifier_source_actors: Vec::new(),
        dmg_per_target,
        heal_per_target,
        deaths: entity.deaths.clone(),
    }
}

fn build_modifier_target_refs(entity: &Entity) -> Vec<lc::PerTargetStats> {
    let mut targets = HashMap::<i64, String>::new();

    for &target_uid in entity.dmg_to_target.keys() {
        if target_uid > 0 {
            targets
                .entry(target_uid)
                .or_insert_with(|| format!("#{}", target_uid));
        }
    }
    for (&(_, target_uid), stats) in &entity.skill_dmg_to_target {
        if target_uid <= 0 {
            continue;
        }
        let name = stats
            .monster_name
            .clone()
            .unwrap_or_else(|| format!("#{}", target_uid));
        let entry = targets.entry(target_uid).or_insert_with(|| name.clone());
        if entry.starts_with('#') && !name.starts_with('#') {
            *entry = name;
        }
    }
    for bucket in &entity.modifier_hit_buckets {
        if bucket.target_uid > 0 {
            targets
                .entry(bucket.target_uid)
                .or_insert_with(|| format!("#{}", bucket.target_uid));
        }
    }

    let mut rows: Vec<_> = targets
        .into_iter()
        .map(|(target_uid, target_name)| lc::PerTargetStats {
            target_uid,
            target_name,
            total_value: 0,
            damage: lc::RawCombatStats::default(),
            skills: HashMap::new(),
        })
        .collect();
    rows.sort_by_key(|row| row.target_uid);
    rows
}

fn push_unique_i32(values: &mut Vec<i32>, value: i32) {
    if value > 0 && !values.contains(&value) {
        values.push(value);
    }
}

fn source_actor_display_name(uid: i64, entity: Option<&Entity>) -> String {
    if let Some(entity) = entity {
        let name = entity.name.trim();
        if !name.is_empty() {
            return name.to_string();
        }
        if let Some(monster_name) = entity.monster_name_packet.as_ref().map(|name| name.trim()) {
            if !monster_name.is_empty() {
                return monster_name.to_string();
            }
        }
    }
    format!("#{}", uid)
}

fn source_actor_entity_type(entity: Option<&Entity>) -> String {
    entity
        .map(|entity| format!("{:?}", entity.entity_type))
        .unwrap_or_else(|| "Unknown".to_string())
}

fn add_modifier_source_owner_hint(
    owners: &mut HashMap<i64, (i64, String)>,
    ambiguous_sources: &mut HashSet<i64>,
    entities: &HashMap<i64, Entity>,
    target_uid: i64,
    owner_uid: i64,
    owner_entity: &Entity,
    host_uid: i64,
    source_uid: i64,
) {
    if source_uid <= 0
        || source_uid == owner_uid
        || ambiguous_sources.contains(&source_uid)
        || !is_hosted_on(host_uid, owner_uid, target_uid)
        || entities
            .get(&source_uid)
            .is_some_and(|entity| entity.entity_type == EEntityType::EntChar)
    {
        return;
    }

    if let Some((existing_owner_uid, _)) = owners.get(&source_uid) {
        if *existing_owner_uid != owner_uid {
            owners.remove(&source_uid);
            ambiguous_sources.insert(source_uid);
        }
        return;
    }

    owners.insert(
        source_uid,
        (
            owner_uid,
            source_actor_display_name(owner_uid, Some(owner_entity)),
        ),
    );
}

fn build_modifier_source_owner_index(
    target_uid: i64,
    entities: &HashMap<i64, Entity>,
) -> HashMap<i64, (i64, String)> {
    let mut owners = HashMap::<i64, (i64, String)>::new();
    let mut ambiguous_sources = HashSet::<i64>::new();

    for (&owner_uid, owner_entity) in entities {
        if owner_entity.entity_type != EEntityType::EntChar {
            continue;
        }

        for buff in &owner_entity.active_buffs {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                buff.host_uid,
                buff.source_uid,
            );
        }
        for buff in &owner_entity.active_factor_buffs {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                buff.host_uid,
                buff.source_uid,
            );
        }
        for buff in &owner_entity.active_effect_buffs {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                buff.host_uid,
                buff.source_uid,
            );
        }
        for window in &owner_entity.modifier_windows {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                window.host_uid,
                window.source_uid,
            );
        }
    }

    owners
}

fn source_actor_owner_hint_from_bucket(
    source_uid: i64,
    bucket: &crate::live::opcodes_models::ObservedModifierHitBucket,
    entities: &HashMap<i64, Entity>,
) -> Option<(i64, String)> {
    if source_uid <= 0
        || bucket.original_attacker_uid != source_uid
        || entities
            .get(&source_uid)
            .is_some_and(|entity| entity.entity_type == EEntityType::EntChar)
    {
        return None;
    }

    let owner_uid = bucket
        .top_summoner_uid
        .filter(|uid| *uid > 0 && *uid != source_uid)
        .or_else(|| {
            (bucket.attacker_uid > 0 && bucket.attacker_uid != source_uid)
                .then_some(bucket.attacker_uid)
        })?;
    let owner_entity = entities.get(&owner_uid)?;
    if owner_entity.entity_type != EEntityType::EntChar {
        return None;
    }

    Some((
        owner_uid,
        source_actor_display_name(owner_uid, Some(owner_entity)),
    ))
}

fn build_modifier_source_actor_refs(
    target_uid: i64,
    entity: &Entity,
    entities: &HashMap<i64, Entity>,
) -> Vec<lc::ModifierSourceActorState> {
    let mut actors = HashMap::<i64, lc::ModifierSourceActorState>::new();
    let owner_index = build_modifier_source_owner_index(target_uid, entities);

    for bucket in &entity.modifier_hit_buckets {
        if !crate::live::modifier_recount::is_reportable_modifier_bucket(
            bucket.modifier_base_id,
            bucket.modifier_source_config_id,
        ) {
            continue;
        }

        let source_uid = bucket.modifier_source_uid;
        if source_uid <= 0 {
            continue;
        }

        let source_entity = entities.get(&source_uid);
        let owner_hint = owner_index
            .get(&source_uid)
            .cloned()
            .or_else(|| source_actor_owner_hint_from_bucket(source_uid, bucket, entities));
        let actor = actors
            .entry(source_uid)
            .or_insert_with(|| lc::ModifierSourceActorState {
                uid: source_uid,
                name: source_actor_display_name(source_uid, source_entity),
                entity_type: source_actor_entity_type(source_entity),
                owner_uid: owner_hint.as_ref().map(|(owner_uid, _)| *owner_uid),
                owner_name: owner_hint
                    .as_ref()
                    .map(|(_, owner_name)| owner_name.clone()),
                source_config_ids: Vec::new(),
                base_ids: Vec::new(),
            });
        if actor.owner_uid.is_none() {
            if let Some((owner_uid, owner_name)) = owner_hint {
                actor.owner_uid = Some(owner_uid);
                actor.owner_name = Some(owner_name);
            }
        }

        if let Some(source_config_id) = bucket.modifier_source_config_id {
            push_unique_i32(&mut actor.source_config_ids, source_config_id);
        }
        push_unique_i32(&mut actor.base_ids, bucket.modifier_base_id);
    }

    let mut rows: Vec<_> = actors.into_values().collect();
    for row in &mut rows {
        row.source_config_ids.sort_unstable();
        row.base_ids.sort_unstable();
    }
    rows.sort_by_key(|row| row.uid);
    rows
}

fn to_history_modifier_primary_entity_data(
    uid: i64,
    entity: &Entity,
    entities: &HashMap<i64, Entity>,
) -> lc::HistoryEntityData {
    lc::HistoryEntityData {
        uid,
        name: entity.name.clone(),
        class_id: entity.class_id,
        class_spec: entity.class_spec as i32,
        class_name: class::get_class_name(entity.class_id),
        class_spec_name: class::get_class_spec(entity.class_spec),
        ability_score: entity.ability_score,
        season_strength: entity.season_strength,
        damage: lc::to_raw_combat_stats(&entity.damage),
        damage_boss_only: lc::RawCombatStats::default(),
        healing: lc::RawCombatStats::default(),
        taken: lc::RawCombatStats::default(),
        dmg_skills: entity
            .skill_uid_to_dmg_skill
            .iter()
            .map(|(skill_id, stats)| (*skill_id, lc::to_raw_skill_stats(stats)))
            .collect(),
        heal_skills: Default::default(),
        taken_skills: Default::default(),
        active_buffs: entity
            .active_buffs
            .iter()
            .map(lc::to_active_buff_state)
            .collect(),
        active_factor_buffs: entity
            .active_factor_buffs
            .iter()
            .map(lc::to_active_factor_buff_state)
            .collect(),
        active_effect_buffs: entity
            .active_effect_buffs
            .iter()
            .map(lc::to_active_effect_buff_state)
            .collect(),
        modifier_windows: entity
            .modifier_windows
            .iter()
            .map(lc::to_modifier_window_state)
            .collect(),
        modifier_hit_buckets: compact_modifier_hit_buckets_for_report(
            entity
                .modifier_hit_buckets
                .iter()
                .map(lc::to_modifier_hit_bucket_state),
        ),
        modifier_replay_hits: entity
            .modifier_replay_hits
            .iter()
            .map(lc::to_modifier_replay_hit_state)
            .collect(),
        skill_cast_events: entity
            .skill_cast_events
            .iter()
            .map(lc::to_skill_cast_event_state)
            .collect(),
        skill_cooldown_events: entity
            .skill_cooldown_events
            .iter()
            .map(lc::to_skill_cooldown_event_state)
            .collect(),
        active_effect_sources: entity
            .active_effect_sources
            .iter()
            .map(lc::to_active_effect_source_state)
            .collect(),
        active_factor_items: entity
            .active_factor_items
            .iter()
            .map(lc::to_active_factor_item_state)
            .collect(),
        active_passive_skills: entity
            .active_passive_skills
            .iter()
            .map(lc::to_active_passive_skill_state)
            .collect(),
        active_profession_skills: entity
            .active_profession_skills
            .iter()
            .map(lc::to_active_profession_skill_state)
            .collect(),
        active_profession_talents: entity
            .active_profession_talents
            .iter()
            .map(lc::to_active_profession_talent_state)
            .collect(),
        modifier_source_actors: build_modifier_source_actor_refs(uid, entity, entities),
        dmg_per_target: build_modifier_target_refs(entity),
        heal_per_target: Vec::new(),
        deaths: Vec::new(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModifierHitBucketCompactKey {
    modifier_buff_uuid: i32,
    modifier_base_id: i32,
    modifier_buff_level: Option<i32>,
    modifier_part_id: Option<i32>,
    modifier_count: Option<i32>,
    modifier_fight_source_type: Option<i32>,
    modifier_source_config_id: Option<i32>,
    modifier_layer: i32,
    modifier_duration_ms: i32,
    modifier_start_time_ms: i64,
    modifier_end_time_ms: Option<i64>,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    skill_key: i64,
    damage_id: i64,
    owner_id: i32,
    owner_level: Option<i32>,
    damage_source: Option<i32>,
    property: Option<i32>,
    damage_mode: Option<i32>,
    attacker_uid: i64,
    original_attacker_uid: i64,
    top_summoner_uid: Option<i64>,
    target_uid: i64,
    target_monster_type_id: Option<i32>,
    is_heal: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModifierHitBucketReportKey {
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    skill_key: i64,
    damage_id: i64,
    is_heal: bool,
}

fn compact_key_for_modifier_hit_bucket(
    bucket: &lc::ModifierHitBucketState,
) -> ModifierHitBucketCompactKey {
    ModifierHitBucketCompactKey {
        modifier_buff_uuid: bucket.modifier_buff_uuid,
        modifier_base_id: bucket.modifier_base_id,
        modifier_buff_level: bucket.modifier_buff_level,
        modifier_part_id: bucket.modifier_part_id,
        modifier_count: bucket.modifier_count,
        modifier_fight_source_type: bucket.modifier_fight_source_type,
        modifier_source_config_id: bucket.modifier_source_config_id,
        modifier_layer: bucket.modifier_layer,
        modifier_duration_ms: bucket.modifier_duration_ms,
        modifier_start_time_ms: bucket.modifier_start_time_ms,
        modifier_end_time_ms: bucket.modifier_end_time_ms,
        modifier_host_uid: bucket.modifier_host_uid,
        modifier_source_uid: bucket.modifier_source_uid,
        skill_key: bucket.skill_key,
        damage_id: bucket.damage_id,
        owner_id: bucket.owner_id,
        owner_level: bucket.owner_level,
        damage_source: bucket.damage_source,
        property: bucket.property,
        damage_mode: bucket.damage_mode,
        attacker_uid: bucket.attacker_uid,
        original_attacker_uid: bucket.original_attacker_uid,
        top_summoner_uid: bucket.top_summoner_uid,
        target_uid: bucket.target_uid,
        target_monster_type_id: bucket.target_monster_type_id,
        is_heal: bucket.is_heal,
    }
}

fn report_key_for_modifier_hit_bucket(
    bucket: &lc::ModifierHitBucketState,
) -> ModifierHitBucketReportKey {
    ModifierHitBucketReportKey {
        modifier_base_id: bucket.modifier_base_id,
        modifier_source_config_id: bucket.modifier_source_config_id,
        modifier_host_uid: bucket.modifier_host_uid,
        modifier_source_uid: bucket.modifier_source_uid,
        skill_key: bucket.skill_key,
        damage_id: bucket.damage_id,
        is_heal: bucket.is_heal,
    }
}

fn merge_modifier_hit_bucket(
    target: &mut lc::ModifierHitBucketState,
    source: lc::ModifierHitBucketState,
) {
    target.hits = target.hits.saturating_add(source.hits);
    target.total_value = target.total_value.saturating_add(source.total_value);
    target.effective_total_value = target
        .effective_total_value
        .saturating_add(source.effective_total_value);
    target.crit_hits = target.crit_hits.saturating_add(source.crit_hits);
    target.crit_total_value = target
        .crit_total_value
        .saturating_add(source.crit_total_value);
    target.lucky_hits = target.lucky_hits.saturating_add(source.lucky_hits);
    target.lucky_total_value = target
        .lucky_total_value
        .saturating_add(source.lucky_total_value);
    target.hp_loss_total = target.hp_loss_total.saturating_add(source.hp_loss_total);
    target.shield_loss_total = target
        .shield_loss_total
        .saturating_add(source.shield_loss_total);
    target.first_hit_time_ms = target.first_hit_time_ms.min(source.first_hit_time_ms);
    target.last_hit_time_ms = target.last_hit_time_ms.max(source.last_hit_time_ms);
}

fn merge_modifier_hit_bucket_for_report(
    target: &mut lc::ModifierHitBucketState,
    source: lc::ModifierHitBucketState,
) {
    merge_modifier_hit_bucket(target, source);
    target.modifier_buff_uuid = 0;
    target.modifier_buff_level = None;
    target.modifier_part_id = None;
    target.modifier_count = None;
    target.modifier_fight_source_type = None;
    target.modifier_layer = 0;
    target.modifier_duration_ms = 0;
    target.modifier_start_time_ms = target.first_hit_time_ms;
    target.modifier_end_time_ms = Some(target.last_hit_time_ms);
}

fn compact_modifier_hit_buckets<I>(buckets: I) -> Vec<lc::ModifierHitBucketState>
where
    I: IntoIterator<Item = lc::ModifierHitBucketState>,
{
    let mut compacted = HashMap::<ModifierHitBucketCompactKey, lc::ModifierHitBucketState>::new();
    for bucket in buckets {
        let key = compact_key_for_modifier_hit_bucket(&bucket);
        if let Some(existing) = compacted.get_mut(&key) {
            merge_modifier_hit_bucket(existing, bucket);
        } else {
            compacted.insert(key, bucket);
        }
    }

    let mut rows: Vec<_> = compacted.into_values().collect();
    rows.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.modifier_base_id.cmp(&right.modifier_base_id))
            .then_with(|| left.skill_key.cmp(&right.skill_key))
    });
    rows
}

fn compact_modifier_hit_buckets_for_report<I>(buckets: I) -> Vec<lc::ModifierHitBucketState>
where
    I: IntoIterator<Item = lc::ModifierHitBucketState>,
{
    let mut compacted = HashMap::<ModifierHitBucketReportKey, lc::ModifierHitBucketState>::new();
    for mut bucket in buckets {
        if !crate::live::modifier_recount::is_reportable_modifier_bucket(
            bucket.modifier_base_id,
            bucket.modifier_source_config_id,
        ) {
            continue;
        }

        bucket.modifier_buff_uuid = 0;
        bucket.modifier_buff_level = None;
        bucket.modifier_part_id = None;
        bucket.modifier_count = None;
        bucket.modifier_fight_source_type = None;
        bucket.modifier_layer = 0;
        bucket.modifier_duration_ms = 0;
        bucket.modifier_start_time_ms = bucket.first_hit_time_ms;
        bucket.modifier_end_time_ms = Some(bucket.last_hit_time_ms);
        bucket.owner_id = 0;
        bucket.owner_level = None;
        bucket.damage_source = None;
        bucket.property = None;
        bucket.damage_mode = None;
        bucket.attacker_uid = 0;
        bucket.original_attacker_uid = 0;
        bucket.top_summoner_uid = None;
        bucket.target_uid = 0;
        bucket.target_monster_type_id = None;

        let key = report_key_for_modifier_hit_bucket(&bucket);
        if let Some(existing) = compacted.get_mut(&key) {
            merge_modifier_hit_bucket_for_report(existing, bucket);
        } else {
            compacted.insert(key, bucket);
        }
    }

    let mut rows: Vec<_> = compacted.into_values().collect();
    rows.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.modifier_base_id.cmp(&right.modifier_base_id))
            .then_with(|| left.skill_key.cmp(&right.skill_key))
    });
    rows
}

fn is_hosted_on(host_uid: i64, fallback_uid: i64, target_uid: i64) -> bool {
    let resolved_host_uid = if host_uid > 0 { host_uid } else { fallback_uid };
    resolved_host_uid == target_uid
}

fn entity_has_modifier_state_for_host(uid: i64, entity: &Entity, target_uid: i64) -> bool {
    entity
        .active_buffs
        .iter()
        .any(|buff| is_hosted_on(buff.host_uid, uid, target_uid))
        || entity
            .active_factor_buffs
            .iter()
            .any(|buff| is_hosted_on(buff.host_uid, uid, target_uid))
        || entity
            .active_effect_buffs
            .iter()
            .any(|buff| is_hosted_on(buff.host_uid, uid, target_uid))
        || entity
            .modifier_windows
            .iter()
            .any(|window| is_hosted_on(window.host_uid, uid, target_uid))
}

fn to_history_modifier_support_entity_data(
    uid: i64,
    entity: &Entity,
    target_uid: i64,
) -> lc::HistoryEntityData {
    lc::HistoryEntityData {
        uid,
        name: entity.name.clone(),
        class_id: entity.class_id,
        class_spec: entity.class_spec as i32,
        class_name: class::get_class_name(entity.class_id),
        class_spec_name: class::get_class_spec(entity.class_spec),
        ability_score: entity.ability_score,
        season_strength: entity.season_strength,
        damage: lc::RawCombatStats::default(),
        damage_boss_only: lc::RawCombatStats::default(),
        healing: lc::RawCombatStats::default(),
        taken: lc::RawCombatStats::default(),
        dmg_skills: Default::default(),
        heal_skills: Default::default(),
        taken_skills: Default::default(),
        active_buffs: entity
            .active_buffs
            .iter()
            .filter(|buff| is_hosted_on(buff.host_uid, uid, target_uid))
            .map(lc::to_active_buff_state)
            .collect(),
        active_factor_buffs: entity
            .active_factor_buffs
            .iter()
            .filter(|buff| is_hosted_on(buff.host_uid, uid, target_uid))
            .map(lc::to_active_factor_buff_state)
            .collect(),
        active_effect_buffs: entity
            .active_effect_buffs
            .iter()
            .filter(|buff| is_hosted_on(buff.host_uid, uid, target_uid))
            .map(lc::to_active_effect_buff_state)
            .collect(),
        modifier_windows: entity
            .modifier_windows
            .iter()
            .filter(|window| is_hosted_on(window.host_uid, uid, target_uid))
            .map(lc::to_modifier_window_state)
            .collect(),
        modifier_hit_buckets: Vec::new(),
        modifier_replay_hits: Vec::new(),
        skill_cast_events: Vec::new(),
        skill_cooldown_events: Vec::new(),
        active_effect_sources: entity
            .active_effect_sources
            .iter()
            .map(lc::to_active_effect_source_state)
            .collect(),
        active_factor_items: entity
            .active_factor_items
            .iter()
            .map(lc::to_active_factor_item_state)
            .collect(),
        active_passive_skills: entity
            .active_passive_skills
            .iter()
            .map(lc::to_active_passive_skill_state)
            .collect(),
        active_profession_skills: entity
            .active_profession_skills
            .iter()
            .map(lc::to_active_profession_skill_state)
            .collect(),
        active_profession_talents: entity
            .active_profession_talents
            .iter()
            .map(lc::to_active_profession_talent_state)
            .collect(),
        modifier_source_actors: Vec::new(),
        dmg_per_target: Vec::new(),
        heal_per_target: Vec::new(),
        deaths: Vec::new(),
    }
}

fn get_encounter_entities_raw_inner(
    encounter_id: i32,
    include_modifier_details: bool,
    target_detail_mode: HistoryTargetDetailMode,
) -> Result<Vec<lc::HistoryEntityData>, String> {
    let started = Instant::now();
    let is_compact_summary =
        !include_modifier_details && matches!(target_detail_mode, HistoryTargetDetailMode::Summary);
    if is_compact_summary {
        if let Some(rows) = load_history_entity_summary(encounter_id)? {
            log::info!(
                target: "app::history",
                "history_entities_loaded_from_summary encounter_id={} rows={} total_ms={}",
                encounter_id,
                rows.len(),
                started.elapsed().as_millis()
            );
            return Ok(rows);
        }
    }

    let entities = crate::database::load_encounter_data_cached(encounter_id)?;
    let loaded_ms = started.elapsed().as_millis();
    let build_started = Instant::now();
    let mut rows = Vec::new();
    for (&uid, entity) in entities.iter() {
        if entity.entity_type != EEntityType::EntChar {
            continue;
        }
        if !entity_has_history_surface(entity, include_modifier_details) {
            continue;
        }
        rows.push(to_history_entity_data(
            uid,
            entity,
            include_modifier_details,
            target_detail_mode,
        ));
    }
    rows.sort_by_key(|row| row.uid);
    log::info!(
        target: "app::history",
        "history_entities_built encounter_id={} include_modifier_details={} target_detail_mode={:?} entities={} rows={} load_ms={} build_ms={} total_ms={}",
        encounter_id,
        include_modifier_details,
        target_detail_mode,
        entities.len(),
        rows.len(),
        loaded_ms,
        build_started.elapsed().as_millis(),
        started.elapsed().as_millis()
    );
    if is_compact_summary {
        remember_history_entity_summary_cache(encounter_id, rows.clone());
        if let Err(err) = save_history_entity_summary(encounter_id, &rows) {
            log::warn!(
                target: "app::history",
                "history_entity_summary_save_failed encounter_id={} error={}",
                encounter_id,
                err
            );
        }
    }
    Ok(rows)
}

/// Gets raw actor entities for a historical encounter.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_entities_raw(encounter_id: i32) -> Result<Vec<lc::HistoryEntityData>, String> {
    get_encounter_entities_raw_inner(encounter_id, true, HistoryTargetDetailMode::Full)
}

/// Gets compact historical entities without modifier ledgers for fast overview/skill pages.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_entities_compact_raw(
    encounter_id: i32,
) -> Result<Vec<lc::HistoryEntityData>, String> {
    get_encounter_entities_raw_inner(encounter_id, false, HistoryTargetDetailMode::Summary)
}

/// Gets compact historical entities plus full per-target skill maps for target drill-down pages.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_entities_target_details_raw(
    encounter_id: i32,
) -> Result<Vec<lc::HistoryEntityData>, String> {
    get_encounter_entities_raw_inner(encounter_id, false, HistoryTargetDetailMode::Full)
}

/// Gets modifier details scoped to one historical player plus hosted external state.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_modifier_entities_raw(
    encounter_id: i32,
    entity_uid: i64,
) -> Result<Vec<lc::HistoryEntityData>, String> {
    let started = Instant::now();
    let entities = crate::database::load_encounter_data_cached(encounter_id)?;
    let loaded_ms = started.elapsed().as_millis();
    let build_started = Instant::now();
    let Some(entity) = entities.get(&entity_uid) else {
        return Err(format!(
            "Entity #{} was not found in encounter #{}",
            entity_uid, encounter_id
        ));
    };
    if entity.entity_type != EEntityType::EntChar {
        return Err(format!("Entity #{} is not a character", entity_uid));
    }

    let target_uids: HashSet<i64> = entity
        .dmg_to_target
        .keys()
        .copied()
        .chain(
            entity
                .modifier_hit_buckets
                .iter()
                .filter_map(|bucket| (bucket.target_uid > 0).then_some(bucket.target_uid)),
        )
        .collect();

    let original_bucket_count = entity.modifier_hit_buckets.len();
    let mut rows = vec![to_history_modifier_primary_entity_data(
        entity_uid, entity, &entities,
    )];
    let compact_bucket_count = rows
        .first()
        .map(|row| row.modifier_hit_buckets.len())
        .unwrap_or_default();
    let mut support_uids = HashSet::<i64>::new();
    for (&uid, source_entity) in entities.iter() {
        if uid == entity_uid {
            continue;
        }
        if source_entity.entity_type == EEntityType::EntChar
            && entity_has_modifier_state_for_host(uid, source_entity, entity_uid)
            && support_uids.insert(uid)
        {
            rows.push(to_history_modifier_support_entity_data(
                uid,
                source_entity,
                entity_uid,
            ));
        }
        if target_uids.contains(&uid)
            && entity_has_modifier_state_for_host(uid, source_entity, uid)
            && support_uids.insert(uid)
        {
            rows.push(to_history_modifier_support_entity_data(
                uid,
                source_entity,
                uid,
            ));
        }
    }
    rows.sort_by_key(|row| if row.uid == entity_uid { 0 } else { 1 });
    log::info!(
        target: "app::history",
        "history_modifier_entities_built encounter_id={} entity_uid={} entities={} support_rows={} targets={} original_buckets={} compact_buckets={} load_ms={} build_ms={} total_ms={}",
        encounter_id,
        entity_uid,
        entities.len(),
        rows.len().saturating_sub(1),
        target_uids.len(),
        original_bucket_count,
        compact_bucket_count,
        loaded_ms,
        build_started.elapsed().as_millis(),
        started.elapsed().as_millis()
    );
    Ok(rows)
}

/// Deletes an encounter by its ID.
///
/// # Arguments
///
/// * `encounter_id` - The ID of the encounter to delete.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result indicating success or failure.
#[tauri::command]
#[specta::specta]
pub fn delete_encounter(encounter_id: i32) -> Result<(), String> {
    with_db(move |conn| {
        use sch::encounter_data::dsl as ed;
        use sch::encounter_entity_summaries::dsl as es;
        use sch::encounters::dsl as e;

        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            diesel::delete(
                es::encounter_entity_summaries.filter(es::encounter_id.eq(encounter_id)),
            )
            .execute(conn)?;
            diesel::delete(ed::encounter_data.filter(ed::encounter_id.eq(encounter_id)))
                .execute(conn)?;
            diesel::delete(e::encounters.filter(e::id.eq(encounter_id))).execute(conn)?;
            Ok(())
        })
        .map_err(|e| e.to_string())?;
        crate::database::invalidate_encounter_data_cache(encounter_id);
        invalidate_history_entity_summary_cache(encounter_id);
        Ok(())
    })
}

/// Deletes multiple encounters by ID.
///
/// # Arguments
///
/// * `ids` - The IDs of the encounters to delete.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result indicating success or failure.
#[tauri::command]
#[specta::specta]
pub fn delete_encounters(ids: Vec<i32>) -> Result<(), String> {
    let deleted_ids = ids.clone();
    with_db(move |conn| {
        use sch::encounter_entity_summaries::dsl as es;
        use sch::encounters::dsl as e;
        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            diesel::delete(es::encounter_entity_summaries.filter(es::encounter_id.eq_any(&ids)))
                .execute(conn)?;
            diesel::delete(e::encounters.filter(e::id.eq_any(ids))).execute(conn)?;
            Ok(())
        })
        .map_err(|er| er.to_string())?;
        crate::database::invalidate_encounter_data_cache_many(&deleted_ids);
        invalidate_history_entity_summary_cache_many(&deleted_ids);
        Ok(())
    })
}

/// Toggles the favorite status of an encounter.
///
/// # Arguments
///
/// * `id` - The ID of the encounter.
/// * `is_favorite` - The new favorite status.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result indicating success or failure.
#[tauri::command]
#[specta::specta]
pub fn toggle_favorite_encounter(id: i32, is_favorite: bool) -> Result<(), String> {
    with_db(move |conn| {
        use sch::encounters::dsl as e;
        diesel::update(e::encounters.filter(e::id.eq(id)))
            .set(e::is_favorite.eq(if is_favorite { 1 } else { 0 }))
            .execute(conn)
            .map_err(|er| er.to_string())?;
        Ok(())
    })
}
