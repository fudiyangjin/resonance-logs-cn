use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::database::schema as sch;
use crate::database::db_exec;
use crate::live::commands_models as lc;
use crate::live::opcodes_models::class;
use blueprotobuf_lib::blueprotobuf::EEntityType;

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
    /// The UID of the local player for this encounter.
    pub local_player_id: Option<i64>,
    /// A list of bosses in the encounter.
    pub bosses: Vec<BossSummaryDto>,
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
        for json in rows.into_iter().flatten() {
            if let Ok(names) = serde_json::from_str::<Vec<String>>(&json) {
                for name in names {
                    if !name.is_empty() {
                        set.insert(name);
                    }
                }
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
        let mut rows: Vec<(
            i32,
            i64,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i32>,
            Option<String>,
            f64,
            Option<i64>,
            i32,
            Option<String>,
            Option<String>,
        )> = e::encounters
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
                e::remote_encounter_id,
                e::is_favorite,
                e::boss_names,
                e::player_names,
            ))
            .load(conn)
            .map_err(|er| er.to_string())?;
    if let Some(filter) = filters {
        rows.retain(|(_, started, _, _, _, _, scene_name, _, _, is_favorite, boss_names_json, player_names_json)| {
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
                if !encounter_names.is_empty() && !scene_name.as_ref().map(|n| encounter_names.contains(n)).unwrap_or(false) {
                    return false;
                }
            }
            if let Some(ref boss_names) = filter.boss_names {
                if !boss_names.is_empty() {
                    let stored: Vec<String> = boss_names_json
                        .as_ref()
                        .and_then(|j| serde_json::from_str(j).ok())
                        .unwrap_or_default();
                    if !boss_names.iter().any(|b| stored.contains(b)) {
                        return false;
                    }
                }
            }
            if let Some(ref player_names) = filter.player_names {
                if !player_names.is_empty() {
                    let stored: Vec<String> = player_names_json
                        .as_ref()
                        .and_then(|j| serde_json::from_str(j).ok())
                        .unwrap_or_default();
                    if !player_names.iter().any(|p| stored.contains(p)) {
                        return false;
                    }
                }
            }
            if let Some(ref player_name) = filter.player_name {
                let trimmed = player_name.trim();
                if !trimmed.is_empty() {
                    let stored: Vec<String> = player_names_json
                        .as_ref()
                        .and_then(|j| serde_json::from_str(j).ok())
                        .unwrap_or_default();
                    if !stored.iter().any(|p| p.contains(trimmed)) {
                        return false;
                    }
                }
            }
            true
        });
    }
    let total_count = rows.len() as i64;
    let paged_rows = rows
        .into_iter()
        .skip(offset.max(0) as usize)
        .take(limit.max(0) as usize);

    // Collect boss and player data for each encounter
    let mut mapped: Vec<EncounterSummaryDto> = Vec::new();

    for (id, started, ended, td, th, scene_id, scene_name, duration, remote_id, is_fav, boss_json, _) in paged_rows {
        let boss_entries: Vec<BossSummaryDto> = boss_json
            .as_ref()
            .and_then(|j| serde_json::from_str::<Vec<String>>(j).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|name| BossSummaryDto {
                monster_name: name,
                max_hp: None,
                is_defeated: true,
            })
            .collect();

        mapped.push(EncounterSummaryDto {
            id,
            started_at_ms: started,
            ended_at_ms: ended,
            total_dmg: td.unwrap_or(0),
            total_heal: th.unwrap_or(0),
            scene_id,
            scene_name,
            duration,
            local_player_id: None,
            bosses: boss_entries,
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
        Option<i64>,
        Option<i64>,
        i32,
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
                e::local_player_id,
                e::remote_encounter_id,
                e::is_favorite,
                e::boss_names,
            ))
            .first(conn)
            .map_err(|er| er.to_string())
    })?;

    let boss_names: Vec<BossSummaryDto> = row.11
        .as_ref()
        .and_then(|j| serde_json::from_str::<Vec<String>>(j).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|name| BossSummaryDto {
            monster_name: name,
            max_hp: None,
            is_defeated: true,
        })
        .collect();

    Ok(EncounterSummaryDto {
        id: row.0,
        started_at_ms: row.1,
        ended_at_ms: row.2,
        total_dmg: row.3.unwrap_or(0),
        total_heal: row.4.unwrap_or(0),
        scene_id: row.5,
        scene_name: row.6.clone(),
        duration: row.7,
        local_player_id: row.8,
        bosses: boss_names,
        remote_encounter_id: row.9,
        is_favorite: row.10 != 0,
    })
}

/// Gets raw actor entities for a historical encounter.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_entities_raw(encounter_id: i32) -> Result<Vec<lc::HistoryEntityData>, String> {
    let entities = crate::database::load_encounter_data(encounter_id)?;
    let mut rows = Vec::new();
    for (&uid, entity) in &entities {
        if entity.entity_type != EEntityType::EntChar {
            continue;
        }
        let has_combat = entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
        if !has_combat {
            continue;
        }
        rows.push(lc::HistoryEntityData {
            uid,
            name: entity.name.clone(),
            class_id: entity.class_id,
            class_spec: entity.class_spec as i32,
            class_name: class::get_class_name(entity.class_id),
            class_spec_name: class::get_class_spec(entity.class_spec),
            ability_score: entity.ability_score,
            damage: lc::to_raw_combat_stats(&entity.damage),
            damage_boss_only: lc::to_raw_combat_stats(&entity.damage_boss_only),
            healing: lc::to_raw_combat_stats(&entity.healing),
            taken: lc::to_raw_combat_stats(&entity.taken),
            active_dmg_time_ms: entity.active_dmg_time_ms,
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
            dmg_per_target: lc::build_per_target_stats(
                &entity.skill_dmg_to_target,
                Some(&entity.dmg_to_target),
            ),
            heal_per_target: lc::build_per_target_stats(&entity.skill_heal_to_target, None),
        });
    }
    rows.sort_by_key(|row| row.uid);
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
        use sch::encounters::dsl as e;

        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            diesel::delete(ed::encounter_data.filter(ed::encounter_id.eq(encounter_id))).execute(conn)?;
            diesel::delete(e::encounters.filter(e::id.eq(encounter_id))).execute(conn)?;
            Ok(())
        })
        .map_err(|e| e.to_string())?;
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
    with_db(move |conn| {
        use sch::encounters::dsl as e;
        diesel::delete(e::encounters.filter(e::id.eq_any(ids)))
            .execute(conn)
            .map_err(|er| er.to_string())?;
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

