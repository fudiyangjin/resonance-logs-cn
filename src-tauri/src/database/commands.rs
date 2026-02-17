use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::database::schema as sch;
use crate::database::db_exec;
use crate::live::commands_models as lc;
use crate::live::opcodes_models::Skill as LiveSkill;

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
    /// A list of bosses in the encounter.
    pub bosses: Vec<BossSummaryDto>,
    /// A list of players in the encounter.
    pub players: Vec<PlayerInfoDto>,
    /// A list of actor encounter stats.
    pub actors: Vec<ActorEncounterStatDto>,
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
    /// A list of class IDs to filter by.
    pub class_ids: Option<Vec<i32>>,
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

/// Information about a player.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInfoDto {
    /// The name of the player.
    pub name: String,
    /// The class ID of the player.
    pub class_id: Option<i32>,
    /// Whether the player is the local player.
    pub is_local_player: bool,
}

/// Statistics for an actor in an encounter.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ActorEncounterStatDto {
    /// The ID of the encounter.
    pub encounter_id: i32,
    /// The ID of the actor.
    pub actor_id: i64,
    /// The name of the actor.
    pub name: Option<String>,
    /// The class ID of the actor.
    pub class_id: Option<i32>,
    /// The ability score of the actor.
    pub ability_score: Option<i32>,
    /// The total damage dealt by the actor.
    pub damage_dealt: i64,
    /// The total healing done by the actor.
    pub heal_dealt: i64,
    /// The total damage taken by the actor.
    pub damage_taken: i64,
    /// The number of hits dealt by the actor.
    pub hits_dealt: i64,
    /// The number of hits healed by the actor.
    pub hits_heal: i64,
    /// The number of hits taken by the actor.
    pub hits_taken: i64,
    /// The number of critical hits dealt by the actor.
    pub crit_hits_dealt: i64,
    /// The number of critical hits healed by the actor.
    pub crit_hits_heal: i64,
    /// The number of critical hits taken by the actor.
    pub crit_hits_taken: i64,
    /// The number of lucky hits dealt by the actor.
    pub lucky_hits_dealt: i64,
    /// The number of lucky hits healed by the actor.
    pub lucky_hits_heal: i64,
    /// The number of lucky hits taken by the actor.
    pub lucky_hits_taken: i64,
    /// The total critical damage dealt by the actor.
    pub crit_total_dealt: i64,
    /// The total critical healing done by the actor.
    pub crit_total_heal: i64,
    /// The total critical damage taken by the actor.
    pub crit_total_taken: i64,
    /// The total lucky damage dealt by the actor.
    pub lucky_total_dealt: i64,
    /// The total lucky healing done by the actor.
    pub lucky_total_heal: i64,
    /// The total lucky damage taken by the actor.
    pub lucky_total_taken: i64,
    /// The total damage dealt to bosses by the actor.
    pub boss_damage_dealt: i64,
    /// The number of hits dealt to bosses by the actor.
    pub boss_hits_dealt: i64,
    /// The number of critical hits dealt to bosses by the actor.
    pub boss_crit_hits_dealt: i64,
    /// The number of lucky hits dealt to bosses by the actor.
    pub boss_lucky_hits_dealt: i64,
    /// The total critical damage dealt to bosses by the actor.
    pub boss_crit_total_dealt: i64,
    /// The total lucky damage dealt to bosses by the actor.
    pub boss_lucky_total_dealt: i64,
    /// The average DPS snapshot for the actor during the encounter.
    pub dps: f64,
    /// The accumulated active damage time (ms) used for True DPS.
    pub active_dmg_time_ms: i64,
    /// The True DPS snapshot for the actor during the encounter.
    pub tdps: f64,
    /// The encounter duration in seconds used for the DPS snapshot.
    pub duration: f64,
    /// Whether the actor is the local player.
    pub is_local_player: bool,
}

/// Loads the actor stats for a given encounter.
///
/// # Arguments
///
/// * `conn` - A mutable reference to a `SqliteConnection`.
/// * `encounter_id` - The ID of the encounter.
///
/// # Returns
///
/// * `Result<Vec<ActorEncounterStatDto>, String>` - A list of actor encounter stats.
fn with_db<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut diesel::sqlite::SqliteConnection) -> Result<T, String> + Send + 'static,
{
    db_exec(f)
}

fn load_actor_stats(
    encounter_id: i32,
    encounter_duration_secs: f64,
    local_player_id: Option<i64>,
    entities: &std::collections::HashMap<i64, crate::live::opcodes_models::Entity>,
) -> Result<Vec<ActorEncounterStatDto>, String> {
    use blueprotobuf_lib::blueprotobuf::EEntityType;
    let mut rows = Vec::new();

    for (actor_id, entity) in entities.iter() {
        if entity.entity_type != EEntityType::EntChar {
            continue;
        }
        let has_combat = entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
        if !has_combat {
            continue;
        }
        let damage_dealt = entity.damage.total.min(i64::MAX as u128) as i64;
        let heal_dealt = entity.healing.total.min(i64::MAX as u128) as i64;
        let damage_taken = entity.taken.total.min(i64::MAX as u128) as i64;
        let active_ms = entity.active_dmg_time_ms.min(i64::MAX as u128) as i64;
        let dps = if encounter_duration_secs > 0.0 {
            damage_dealt as f64 / encounter_duration_secs
        } else {
            0.0
        };
        let tdps = if active_ms > 0 {
            damage_dealt as f64 * 1000.0 / active_ms as f64
        } else {
            dps
        };
        rows.push(ActorEncounterStatDto {
            encounter_id,
            actor_id: *actor_id,
            name: if entity.name.is_empty() {
                None
            } else {
                Some(entity.name.clone())
            },
            class_id: Some(entity.class_id),
            ability_score: Some(entity.ability_score),
            damage_dealt,
            heal_dealt,
            damage_taken,
            hits_dealt: entity.damage.hits.min(i64::MAX as u128) as i64,
            hits_heal: entity.healing.hits.min(i64::MAX as u128) as i64,
            hits_taken: entity.taken.hits.min(i64::MAX as u128) as i64,
            crit_hits_dealt: entity.damage.crit_hits.min(i64::MAX as u128) as i64,
            crit_hits_heal: entity.healing.crit_hits.min(i64::MAX as u128) as i64,
            crit_hits_taken: entity.taken.crit_hits.min(i64::MAX as u128) as i64,
            lucky_hits_dealt: entity.damage.lucky_hits.min(i64::MAX as u128) as i64,
            lucky_hits_heal: entity.healing.lucky_hits.min(i64::MAX as u128) as i64,
            lucky_hits_taken: entity.taken.lucky_hits.min(i64::MAX as u128) as i64,
            crit_total_dealt: entity.damage.crit_total.min(i64::MAX as u128) as i64,
            crit_total_heal: entity.healing.crit_total.min(i64::MAX as u128) as i64,
            crit_total_taken: entity.taken.crit_total.min(i64::MAX as u128) as i64,
            lucky_total_dealt: entity.damage.lucky_total.min(i64::MAX as u128) as i64,
            lucky_total_heal: entity.healing.lucky_total.min(i64::MAX as u128) as i64,
            lucky_total_taken: entity.taken.lucky_total.min(i64::MAX as u128) as i64,
            boss_damage_dealt: entity.damage_boss_only.total.min(i64::MAX as u128) as i64,
            boss_hits_dealt: entity.damage_boss_only.hits.min(i64::MAX as u128) as i64,
            boss_crit_hits_dealt: entity.damage_boss_only.crit_hits.min(i64::MAX as u128) as i64,
            boss_lucky_hits_dealt: entity.damage_boss_only.lucky_hits.min(i64::MAX as u128) as i64,
            boss_crit_total_dealt: entity.damage_boss_only.crit_total.min(i64::MAX as u128) as i64,
            boss_lucky_total_dealt: entity.damage_boss_only.lucky_total.min(i64::MAX as u128) as i64,
            dps,
            active_dmg_time_ms: active_ms,
            tdps,
            duration: encounter_duration_secs,
            is_local_player: local_player_id == Some(*actor_id),
        });
    }
    rows.sort_by(|a, b| b.damage_dealt.cmp(&a.damage_dealt));
    Ok(rows)
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

    for (id, started, ended, td, th, scene_id, scene_name, duration, remote_id, is_fav, boss_json, player_json) in paged_rows {
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
        let player_data: Vec<PlayerInfoDto> = player_json
            .as_ref()
            .and_then(|j| serde_json::from_str::<Vec<String>>(j).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|name| PlayerInfoDto {
                name,
                class_id: None,
                is_local_player: false,
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
            bosses: boss_entries,
            players: player_data,
            actors: Vec::new(),
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

/// Gets the actor stats for a given encounter.
///
/// # Arguments
///
/// * `encounter_id` - The ID of the encounter.
///
/// # Returns
///
/// * `Result<Vec<ActorEncounterStatDto>, String>` - A list of actor encounter stats.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_actor_stats(encounter_id: i32) -> Result<Vec<ActorEncounterStatDto>, String> {
    use crate::database::load_encounter_data;
    let entities = load_encounter_data(encounter_id)?;
    let (duration, local_player_id) = with_db(move |conn| {
        let encounter_duration_secs: f64 = sch::encounters::dsl::encounters
            .filter(sch::encounters::dsl::id.eq(encounter_id))
            .select(sch::encounters::dsl::duration)
            .first::<f64>(conn)
            .unwrap_or(0.0);
        let local_player_id: Option<i64> = sch::encounters::dsl::encounters
            .filter(sch::encounters::dsl::id.eq(encounter_id))
            .select(sch::encounters::dsl::local_player_id)
            .first::<Option<i64>>(conn)
            .unwrap_or(None);
        Ok((encounter_duration_secs, local_player_id))
    })?;
    load_actor_stats(encounter_id, duration, local_player_id, &entities)
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
                e::remote_encounter_id,
                e::is_favorite,
                e::boss_names,
                e::player_names,
            ))
            .first(conn)
            .map_err(|er| er.to_string())
    })?;

    let actors = get_encounter_actor_stats(encounter_id)?;

    let boss_names: Vec<BossSummaryDto> = row.10
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

    let players: Vec<PlayerInfoDto> = row.11
        .as_ref()
        .and_then(|j| serde_json::from_str::<Vec<String>>(j).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|name| PlayerInfoDto {
            name,
            class_id: None,
            is_local_player: false,
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
        bosses: boss_names,
        players,
        actors,
        remote_encounter_id: row.8,
        is_favorite: row.9 != 0,
    })
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

/// Gets the skills used by a player in an encounter.
///
/// # Arguments
///
/// * `encounter_id` - The ID of the encounter.
/// * `actor_id` - The ID of the actor.
/// * `skill_type` - The type of skill to get (e.g., "dps", "heal").
///
/// # Returns
///
/// * `Result<lc::SkillsWindow, String>` - The skills window.
#[tauri::command]
#[specta::specta]
pub fn get_encounter_player_skills(
    encounter_id: i32,
    actor_id: i64,
    skill_type: String,
) -> Result<lc::SkillsWindow, String> {
    let entities = crate::database::load_encounter_data(encounter_id)?;
    let entity = entities
        .get(&actor_id)
        .ok_or_else(|| format!("Actor {} not found in encounter {}", actor_id, encounter_id))?;
    let duration_secs = with_db(move |conn| {
        let duration = sch::encounters::dsl::encounters
            .filter(sch::encounters::dsl::id.eq(encounter_id))
            .select(sch::encounters::dsl::duration)
            .first::<f64>(conn)
            .unwrap_or(0.0)
            .max(1.0);
        Ok(duration)
    })?;

    let (total, hits, crit_hits, lucky_hits, crit_total, lucky_total, skill_map) = match skill_type.as_str() {
        "heal" => (
            entity.healing.total,
            entity.healing.hits,
            entity.healing.crit_hits,
            entity.healing.lucky_hits,
            entity.healing.crit_total,
            entity.healing.lucky_total,
            &entity.skill_uid_to_heal_skill,
        ),
        "dps" | "tanked" => (
            entity.damage.total,
            entity.damage.hits,
            entity.damage.crit_hits,
            entity.damage.lucky_hits,
            entity.damage.crit_total,
            entity.damage.lucky_total,
            &entity.skill_uid_to_dmg_skill,
        ),
        other => return Err(format!("Invalid skill type: {}", other)),
    };

    let curr_player = lc::PlayerRow {
        uid: actor_id as u128,
        name: entity.name.clone(),
        class_name: crate::live::opcodes_models::class::get_class_name(entity.class_id),
        class_spec_name: crate::live::opcodes_models::class::get_class_spec(entity.class_spec),
        ability_score: entity.ability_score.max(0) as u128,
        total_dmg: total,
        dps: total as f64 / duration_secs,
        tdps: if entity.active_dmg_time_ms > 0 {
            total as f64 * 1000.0 / entity.active_dmg_time_ms as f64
        } else {
            total as f64 / duration_secs
        },
        active_time_ms: entity.active_dmg_time_ms,
        dmg_pct: 100.0,
        crit_rate: if hits > 0 { crit_hits as f64 / hits as f64 } else { 0.0 },
        crit_dmg_rate: if total > 0 { crit_total as f64 / total as f64 } else { 0.0 },
        lucky_rate: if hits > 0 { lucky_hits as f64 / hits as f64 } else { 0.0 },
        lucky_dmg_rate: if total > 0 { lucky_total as f64 / total as f64 } else { 0.0 },
        hits,
        hits_per_minute: hits as f64 / duration_secs * 60.0,
        boss_dmg: entity.damage_boss_only.total,
        boss_dps: entity.damage_boss_only.total as f64 / duration_secs,
        boss_dmg_pct: 0.0,
        rank_level: entity.rank_level(),
        current_hp: entity.hp(),
        max_hp: entity.max_hp(),
        crit_stat: entity.crit(),
        lucky_stat: entity.lucky(),
        haste: entity.haste(),
        mastery: entity.mastery(),
        element_flag: entity
            .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
            .and_then(|v| v.as_int()),
        energy_flag: entity
            .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
            .and_then(|v| v.as_int()),
        reduction_level: entity.reduction_level(),
    };

    let mut skill_rows: Vec<lc::SkillRow> = skill_map
        .iter()
        .map(|(skill_id, skill)| lc::SkillRow {
            skill_id: *skill_id,
            name: LiveSkill::get_skill_name(*skill_id),
            total_dmg: skill.total_value,
            dps: skill.total_value as f64 / duration_secs,
            dmg_pct: if total > 0 { skill.total_value as f64 / total as f64 * 100.0 } else { 0.0 },
            crit_rate: if skill.hits > 0 { skill.crit_hits as f64 / skill.hits as f64 } else { 0.0 },
            crit_dmg_rate: if skill.total_value > 0 { skill.crit_total_value as f64 / skill.total_value as f64 } else { 0.0 },
            lucky_rate: if skill.hits > 0 { skill.lucky_hits as f64 / skill.hits as f64 } else { 0.0 },
            lucky_dmg_rate: if skill.total_value > 0 { skill.lucky_total_value as f64 / skill.total_value as f64 } else { 0.0 },
            hits: skill.hits,
            hits_per_minute: skill.hits as f64 / duration_secs * 60.0,
        })
        .collect();
    skill_rows.sort_by(|a, b| b.total_dmg.cmp(&a.total_dmg));
    Ok(lc::SkillsWindow {
        curr_player: vec![curr_player],
        skill_rows,
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

