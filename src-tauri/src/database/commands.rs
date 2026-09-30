use std::collections::HashSet;

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::database::PlayerNameEntry;
use crate::database::db_exec;
use crate::database::history_query::{EncounterDetailData, EncounterRangeData};
use crate::database::schema as sch;
use crate::live::history_writer::HistoryWriterHandle;

// Keep in sync with the history detail note limit in
// `src/routes/main/dps/history/[id]/+page.svelte`.
const MAX_ENCOUNTER_NOTE_CHARS: usize = 200;

fn normalize_encounter_note(note: String) -> Result<Option<String>, String> {
    let note = note.trim().to_owned();
    if note.chars().count() > MAX_ENCOUNTER_NOTE_CHARS {
        return Err(format!(
            "encounter note must be at most {MAX_ENCOUNTER_NOTE_CHARS} characters"
        ));
    }
    Ok((!note.is_empty()).then_some(note))
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSummaryDto {
    pub name: String,
    pub class_id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterSummaryDto {
    pub id: i32,
    pub started_at_ms: i64,
    pub ended_at_ms: Option<i64>,
    pub total_dmg: String,
    pub total_heal: String,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
    pub duration: f64,
    pub active_combat_duration: Option<f64>,
    pub local_player_id: Option<i64>,
    pub bosses: Vec<BossSummaryDto>,
    pub players: Vec<PlayerSummaryDto>,
    pub remote_encounter_id: Option<i64>,
    pub is_favorite: bool,
    pub note: Option<String>,
    pub detail_available: bool,
    pub display_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentEncountersResult {
    pub rows: Vec<EncounterSummaryDto>,
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterFiltersDto {
    pub boss_monster_ids: Option<Vec<i32>>,
    pub scene_ids: Option<Vec<i32>>,
    pub player_name: Option<String>,
    pub player_names: Option<Vec<String>>,
    pub date_from_ms: Option<i64>,
    pub date_to_ms: Option<i64>,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BossMonsterIdsResult {
    pub ids: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BossSummaryDto {
    pub monster_id: i32,
    pub max_hp: Option<i64>,
    pub is_defeated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SceneIdsResult {
    pub ids: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerNamesResult {
    pub names: Vec<String>,
}

#[derive(Debug, Queryable)]
struct EncounterSummaryRow {
    id: i32,
    started_at_ms: i64,
    ended_at_ms: Option<i64>,
    total_dmg: Option<i64>,
    total_heal: Option<i64>,
    total_dmg_exact: Option<String>,
    total_heal_exact: Option<String>,
    scene_id: Option<i32>,
    dungeon_difficulty: Option<i32>,
    duration: f64,
    active_combat_duration: Option<f64>,
    local_player_id: Option<i64>,
    remote_encounter_id: Option<i64>,
    is_favorite: i32,
    note: Option<String>,
    boss_monster_ids: Option<String>,
    player_names: Option<String>,
    projection_encounter_id: Option<i32>,
}

fn with_db<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut diesel::sqlite::SqliteConnection) -> Result<T, String> + Send + 'static,
{
    db_exec(operation)
}

fn parse_player_entries(json: &Option<String>) -> Vec<PlayerSummaryDto> {
    let Some(json) = json else {
        return Vec::new();
    };
    if let Ok(entries) = serde_json::from_str::<Vec<PlayerNameEntry>>(json) {
        return entries
            .into_iter()
            .map(|entry| PlayerSummaryDto {
                name: entry.name,
                class_id: entry.class_id,
            })
            .collect();
    }
    serde_json::from_str::<Vec<String>>(json)
        .unwrap_or_default()
        .into_iter()
        .map(|name| PlayerSummaryDto { name, class_id: 0 })
        .collect()
}

fn parse_boss_ids(json: &Option<String>) -> Vec<i32> {
    json.as_deref()
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default()
}

fn map_summary(row: EncounterSummaryRow) -> Result<EncounterSummaryDto, String> {
    let total_dmg = summary_total(
        row.id,
        "damage",
        row.projection_encounter_id.is_some(),
        row.total_dmg_exact,
        row.total_dmg,
    )?;
    let total_heal = summary_total(
        row.id,
        "healing",
        row.projection_encounter_id.is_some(),
        row.total_heal_exact,
        row.total_heal,
    )?;
    Ok(EncounterSummaryDto {
        id: row.id,
        started_at_ms: row.started_at_ms,
        ended_at_ms: row.ended_at_ms,
        total_dmg,
        total_heal,
        scene_id: row.scene_id,
        dungeon_difficulty: row.dungeon_difficulty,
        duration: row.duration,
        active_combat_duration: row.active_combat_duration,
        local_player_id: row.local_player_id,
        remote_encounter_id: row.remote_encounter_id,
        is_favorite: row.is_favorite != 0,
        note: row.note,
        bosses: parse_boss_ids(&row.boss_monster_ids)
            .into_iter()
            .map(|monster_id| BossSummaryDto {
                monster_id,
                max_hp: None,
                is_defeated: true,
            })
            .collect(),
        players: parse_player_entries(&row.player_names),
        detail_available: row.projection_encounter_id.is_some(),
        display_index: DisplayIndex::UNASSIGNED.as_i32(),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct DisplayIndex(i32);

impl DisplayIndex {
    const UNASSIGNED: Self = Self(0);

    fn from_rank(rank: usize) -> Result<Self, String> {
        let index = i32::try_from(rank.saturating_add(1))
            .map_err(|_| "display index exceeds i32".to_string())?;
        if index <= 0 {
            return Err("display index must be positive".to_string());
        }
        Ok(Self(index))
    }

    fn from_count(count: i64) -> Result<Self, String> {
        let index = i32::try_from(count).map_err(|_| "display index exceeds i32".to_string())?;
        if index <= 0 {
            return Err("display index must be positive".to_string());
        }
        Ok(Self(index))
    }

    fn as_i32(self) -> i32 {
        self.0
    }
}

fn assign_display_indices(summaries: &mut [EncounterSummaryDto]) -> Result<(), String> {
    let mut order: Vec<usize> = (0..summaries.len()).collect();
    order.sort_by_key(|&index| (summaries[index].started_at_ms, summaries[index].id));
    for (rank, index) in order.into_iter().enumerate() {
        summaries[index].display_index = DisplayIndex::from_rank(rank)?.as_i32();
    }
    Ok(())
}

fn load_display_index(
    conn: &mut diesel::sqlite::SqliteConnection,
    started_at_ms: i64,
    encounter_id: i32,
    ended_at_ms: Option<i64>,
) -> Result<i32, String> {
    if ended_at_ms.is_none() {
        return Ok(DisplayIndex::UNASSIGNED.as_i32());
    }
    use sch::encounters::dsl as e;
    let count = e::encounters
        .filter(e::ended_at_ms.is_not_null())
        .filter(
            e::started_at_ms.lt(started_at_ms).or(e::started_at_ms
                .eq(started_at_ms)
                .and(e::id.le(encounter_id))),
        )
        .count()
        .get_result::<i64>(conn)
        .map_err(|error| error.to_string())?;
    Ok(DisplayIndex::from_count(count)?.as_i32())
}

fn summary_total(
    encounter_id: i32,
    label: &str,
    detail_available: bool,
    exact: Option<String>,
    stored: Option<i64>,
) -> Result<String, String> {
    if let Some(exact) = exact {
        let parsed = exact
            .parse::<u128>()
            .map_err(|_| format!("encounter {encounter_id} has an invalid exact {label} total"))?;
        if parsed.to_string() != exact {
            return Err(format!(
                "encounter {encounter_id} has a non-canonical exact {label} total"
            ));
        }
        return Ok(exact);
    }
    if !detail_available {
        return Ok(stored.unwrap_or_default().to_string());
    }
    Err(format!(
        "encounter {encounter_id} is missing its exact {label} total"
    ))
}

pub(crate) fn load_encounter_summary(
    conn: &mut diesel::sqlite::SqliteConnection,
    encounter_id: i32,
) -> Result<EncounterSummaryDto, String> {
    use sch::encounter_projection::dsl as p;
    use sch::encounters::dsl as e;
    e::encounters
        .left_join(p::encounter_projection.on(p::encounter_id.eq(e::id)))
        .filter(e::id.eq(encounter_id))
        .select((
            e::id,
            e::started_at_ms,
            e::ended_at_ms,
            e::total_dmg,
            e::total_heal,
            e::total_dmg_exact,
            e::total_heal_exact,
            e::scene_id,
            e::dungeon_difficulty,
            e::duration,
            e::active_combat_duration,
            e::local_player_id,
            e::remote_encounter_id,
            e::is_favorite,
            e::note,
            e::boss_monster_ids,
            e::player_names,
            p::encounter_id.nullable(),
        ))
        .first::<EncounterSummaryRow>(conn)
        .map_err(|error| error.to_string())
        .and_then(map_summary)
        .and_then(|mut summary| {
            summary.display_index =
                load_display_index(conn, summary.started_at_ms, summary.id, summary.ended_at_ms)?;
            Ok(summary)
        })
}

#[tauri::command]
#[specta::specta]
pub async fn get_unique_boss_monster_ids() -> Result<BossMonsterIdsResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        with_db(|conn| {
            use sch::encounters::dsl as e;
            let rows = e::encounters
                .select(e::boss_monster_ids)
                .filter(e::boss_monster_ids.is_not_null())
                .load::<Option<String>>(conn)
                .map_err(|error| error.to_string())?;
            let mut ids = rows
                .into_iter()
                .flat_map(|json| parse_boss_ids(&json))
                .collect::<Vec<_>>();
            ids.sort_unstable();
            ids.dedup();
            Ok(BossMonsterIdsResult { ids })
        })
    })
    .await
    .map_err(|error| format!("boss filter worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_unique_scene_ids() -> Result<SceneIdsResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        with_db(|conn| {
            use sch::encounters::dsl as e;
            let mut ids = e::encounters
                .select(e::scene_id)
                .filter(e::scene_id.is_not_null())
                .distinct()
                .load::<Option<i32>>(conn)
                .map_err(|error| error.to_string())?
                .into_iter()
                .flatten()
                .collect::<Vec<_>>();
            ids.sort_unstable();
            Ok(SceneIdsResult { ids })
        })
    })
    .await
    .map_err(|error| format!("scene filter worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub fn get_player_names_filtered(prefix: String) -> Result<PlayerNamesResult, String> {
    let prefix = prefix.trim().to_lowercase();
    with_db(move |conn| {
        use sch::encounters::dsl as e;
        use sch::entities::dsl as en;
        let mut names = en::entities
            .select(en::name)
            .filter(en::name.is_not_null())
            .load::<Option<String>>(conn)
            .map_err(|error| error.to_string())?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        let encounter_names = e::encounters
            .select(e::player_names)
            .filter(e::player_names.is_not_null())
            .load::<Option<String>>(conn)
            .map_err(|error| error.to_string())?;
        names.extend(
            encounter_names
                .into_iter()
                .flat_map(|json| parse_player_entries(&json))
                .map(|entry| entry.name),
        );
        names.retain(|name| prefix.is_empty() || name.to_lowercase().starts_with(&prefix));
        names.sort_unstable_by_key(|name| name.to_lowercase());
        names.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
        names.truncate(100);
        Ok(PlayerNamesResult { names })
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_recent_encounters_filtered(
    limit: i32,
    offset: i32,
    filters: Option<EncounterFiltersDto>,
    history_writer: tauri::State<'_, HistoryWriterHandle>,
) -> Result<RecentEncountersResult, String> {
    let history_writer = history_writer.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        history_writer.fence()?;
        get_recent_encounters_filtered_blocking(limit, offset, filters)
    })
    .await
    .map_err(|error| format!("encounter list worker failed: {error}"))?
}

fn get_recent_encounters_filtered_blocking(
    limit: i32,
    offset: i32,
    filters: Option<EncounterFiltersDto>,
) -> Result<RecentEncountersResult, String> {
    if limit <= 0 || offset < 0 {
        return Err("limit must be positive and offset must be non-negative".to_string());
    }
    with_db(move |conn| {
        use sch::encounter_projection::dsl as p;
        use sch::encounters::dsl as e;
        let rows = e::encounters
            .left_join(p::encounter_projection.on(p::encounter_id.eq(e::id)))
            .filter(e::ended_at_ms.is_not_null())
            .select((
                e::id,
                e::started_at_ms,
                e::ended_at_ms,
                e::total_dmg,
                e::total_heal,
                e::total_dmg_exact,
                e::total_heal_exact,
                e::scene_id,
                e::dungeon_difficulty,
                e::duration,
                e::active_combat_duration,
                e::local_player_id,
                e::remote_encounter_id,
                e::is_favorite,
                e::note,
                e::boss_monster_ids,
                e::player_names,
                p::encounter_id.nullable(),
            ))
            .order((e::started_at_ms.desc(), e::id.desc()))
            .load::<EncounterSummaryRow>(conn)
            .map_err(|error| error.to_string())?;
        let filters = filters.unwrap_or(EncounterFiltersDto {
            boss_monster_ids: None,
            scene_ids: None,
            player_name: None,
            player_names: None,
            date_from_ms: None,
            date_to_ms: None,
            is_favorite: None,
        });
        let boss_filter = filters.boss_monster_ids.unwrap_or_default();
        let scene_filter = filters.scene_ids.unwrap_or_default();
        let mut player_filter = filters.player_names.unwrap_or_default();
        if let Some(player_name) = filters.player_name {
            player_filter.push(player_name);
        }
        let player_filter = player_filter
            .into_iter()
            .map(|name| name.to_lowercase())
            .collect::<HashSet<_>>();
        let mut summaries = rows
            .into_iter()
            .map(map_summary)
            .collect::<Result<Vec<_>, _>>()?;
        assign_display_indices(&mut summaries)?;
        summaries.retain(|summary| {
            (boss_filter.is_empty()
                || summary
                    .bosses
                    .iter()
                    .any(|boss| boss_filter.contains(&boss.monster_id)))
                && (scene_filter.is_empty()
                    || summary
                        .scene_id
                        .is_some_and(|scene| scene_filter.contains(&scene)))
                && (player_filter.is_empty()
                    || summary
                        .players
                        .iter()
                        .any(|player| player_filter.contains(&player.name.to_lowercase())))
                && filters
                    .date_from_ms
                    .is_none_or(|from| summary.started_at_ms >= from)
                && filters
                    .date_to_ms
                    .is_none_or(|to| summary.started_at_ms < to)
                && filters
                    .is_favorite
                    .is_none_or(|favorite| summary.is_favorite == favorite)
        });
        let total_count = i64::try_from(summaries.len()).unwrap_or(i64::MAX);
        let start = usize::try_from(offset)
            .unwrap_or(usize::MAX)
            .min(summaries.len());
        let end = start
            .saturating_add(usize::try_from(limit).unwrap_or(usize::MAX))
            .min(summaries.len());
        let rows = summaries.drain(start..end).collect();
        Ok(RecentEncountersResult { rows, total_count })
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_encounter_detail(
    encounter_id: i32,
    history_writer: tauri::State<'_, HistoryWriterHandle>,
) -> Result<EncounterDetailData, String> {
    let history_writer = history_writer.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        history_writer.fence()?;
        crate::database::load_history_detail(encounter_id)
    })
    .await
    .map_err(|error| format!("encounter detail worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_encounter_range(
    encounter_id: i32,
    start_ms: u64,
    end_ms: u64,
    history_writer: tauri::State<'_, HistoryWriterHandle>,
) -> Result<EncounterRangeData, String> {
    let history_writer = history_writer.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        history_writer.fence()?;
        crate::database::load_history_range(encounter_id, start_ms, end_ms)
    })
    .await
    .map_err(|error| format!("encounter range worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn delete_encounter(encounter_id: i32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::database::flush_database()?;
        with_db(move |conn| {
            use sch::encounters::dsl as e;
            diesel::delete(e::encounters.filter(e::id.eq(encounter_id)))
                .execute(conn)
                .map(|_| ())
                .map_err(|error| error.to_string())
        })
    })
    .await
    .map_err(|error| format!("delete encounter worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn delete_encounters(ids: Vec<i32>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::database::flush_database()?;
        with_db(move |conn| {
            use sch::encounters::dsl as e;
            diesel::delete(e::encounters.filter(e::id.eq_any(ids)))
                .execute(conn)
                .map(|_| ())
                .map_err(|error| error.to_string())
        })
    })
    .await
    .map_err(|error| format!("delete encounters worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub fn toggle_favorite_encounter(id: i32, is_favorite: bool) -> Result<(), String> {
    with_db(move |conn| {
        use sch::encounters::dsl as e;
        diesel::update(e::encounters.filter(e::id.eq(id)))
            .set(e::is_favorite.eq(i32::from(is_favorite)))
            .execute(conn)
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
#[specta::specta]
pub async fn update_encounter_note(encounter_id: i32, note: String) -> Result<(), String> {
    let note = normalize_encounter_note(note)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_db(move |conn| {
            use sch::encounters::dsl as e;
            let updated = diesel::update(e::encounters.filter(e::id.eq(encounter_id)))
                .set(e::note.eq(note))
                .execute(conn)
                .map_err(|error| error.to_string())?;
            if updated != 1 {
                return Err(format!("encounter {encounter_id} was not found"));
            }
            Ok(())
        })
    })
    .await
    .map_err(|error| format!("encounter note worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub fn get_history_retention_limit(app_handle: tauri::AppHandle) -> i64 {
    super::load_history_retention_limit(&app_handle)
}

#[tauri::command]
#[specta::specta]
pub fn save_history_retention_limit(
    app_handle: tauri::AppHandle,
    limit: i64,
) -> Result<(), String> {
    super::save_history_retention_limit(&app_handle, limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_encounter_note_trims_and_clears_empty_values() {
        assert_eq!(
            normalize_encounter_note("  phase two  ".to_string()).expect("normalize note"),
            Some("phase two".to_string())
        );
        assert_eq!(
            normalize_encounter_note("   ".to_string()).expect("normalize empty note"),
            None
        );
    }

    #[test]
    fn normalize_encounter_note_counts_unicode_characters() {
        let valid = "界".repeat(MAX_ENCOUNTER_NOTE_CHARS);
        let invalid = "界".repeat(MAX_ENCOUNTER_NOTE_CHARS + 1);

        assert!(normalize_encounter_note(valid).is_ok());
        assert!(normalize_encounter_note(invalid).is_err());
    }

    fn summary_row(
        detail_available: bool,
        total_dmg_exact: Option<String>,
        total_heal_exact: Option<String>,
    ) -> EncounterSummaryRow {
        EncounterSummaryRow {
            id: 1,
            started_at_ms: 1_000,
            ended_at_ms: Some(2_000),
            total_dmg: Some(i64::MAX),
            total_heal: None,
            total_dmg_exact,
            total_heal_exact,
            scene_id: None,
            dungeon_difficulty: None,
            duration: 1.0,
            active_combat_duration: Some(1.0),
            local_player_id: None,
            remote_encounter_id: None,
            is_favorite: 0,
            note: None,
            boss_monster_ids: None,
            player_names: None,
            projection_encounter_id: detail_available.then_some(1),
        }
    }

    #[test]
    fn summary_without_projection_uses_integer_totals() {
        let summary = map_summary(summary_row(false, None, None)).expect("map summary");

        assert_eq!(summary.total_dmg, i64::MAX.to_string());
        assert_eq!(summary.total_heal, "0");
        let json = serde_json::to_value(summary).expect("serialize encounter summary");
        assert_eq!(json["totalDmg"], i64::MAX.to_string());
        assert_eq!(json["totalHeal"], "0");
        assert_eq!(json["displayIndex"], 0);
    }

    #[test]
    fn summary_preserves_encounter_note() {
        let mut row = summary_row(false, None, None);
        row.note = Some("phase two".to_string());

        let summary = map_summary(row).expect("map summary");

        assert_eq!(summary.note.as_deref(), Some("phase two"));
    }

    #[test]
    fn summary_with_projection_prefers_exact_u128_totals() {
        let summary = map_summary(summary_row(
            true,
            Some(u128::MAX.to_string()),
            Some("18446744073709551616".to_string()),
        ))
        .expect("map summary");

        assert_eq!(summary.total_dmg, u128::MAX.to_string());
        assert_eq!(summary.total_heal, "18446744073709551616");
    }

    #[test]
    fn summary_with_projection_rejects_missing_exact_totals() {
        let error = map_summary(summary_row(true, None, Some("0".to_string())))
            .expect_err("missing exact damage must fail");
        assert!(error.contains("missing its exact damage total"));
    }

    fn ranked_summary(id: i32, started_at_ms: i64, is_favorite: bool) -> EncounterSummaryDto {
        EncounterSummaryDto {
            id,
            started_at_ms,
            ended_at_ms: Some(started_at_ms + 1),
            total_dmg: "0".to_string(),
            total_heal: "0".to_string(),
            scene_id: None,
            dungeon_difficulty: None,
            duration: 1.0,
            active_combat_duration: Some(1.0),
            local_player_id: None,
            bosses: Vec::new(),
            players: Vec::new(),
            remote_encounter_id: None,
            is_favorite,
            note: None,
            detail_available: true,
            display_index: 0,
        }
    }

    #[test]
    fn assign_display_indices_numbers_oldest_finalized_row_as_one() {
        let mut summaries = vec![
            ranked_summary(30, 3_000, false),
            ranked_summary(10, 1_000, false),
            ranked_summary(20, 2_000, false),
        ];

        assign_display_indices(&mut summaries).expect("assign display indices");

        assert_eq!(
            summaries
                .iter()
                .map(|summary| (summary.id, summary.display_index))
                .collect::<Vec<_>>(),
            vec![(30, 3), (10, 1), (20, 2)]
        );
    }

    #[test]
    fn assign_display_indices_uses_id_as_tiebreak_when_started_at_matches() {
        let mut summaries = vec![
            ranked_summary(12, 1_000, false),
            ranked_summary(11, 1_000, false),
        ];

        assign_display_indices(&mut summaries).expect("assign display indices");

        assert_eq!(summaries[0].display_index, 2);
        assert_eq!(summaries[1].display_index, 1);
    }

    #[test]
    fn assign_display_indices_keeps_favorites_in_the_same_sequence() {
        let mut summaries = vec![
            ranked_summary(1, 1_000, true),
            ranked_summary(2, 2_000, false),
            ranked_summary(3, 3_000, true),
        ];

        assign_display_indices(&mut summaries).expect("assign display indices");

        assert_eq!(summaries[0].display_index, 1);
        assert_eq!(summaries[1].display_index, 2);
        assert_eq!(summaries[2].display_index, 3);
    }

    #[test]
    fn assign_display_indices_survives_later_filter_without_renumbering() {
        let mut summaries = vec![
            ranked_summary(1, 1_000, false),
            ranked_summary(2, 2_000, true),
            ranked_summary(3, 3_000, false),
        ];

        assign_display_indices(&mut summaries).expect("assign display indices");
        summaries.retain(|summary| summary.is_favorite);

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, 2);
        assert_eq!(summaries[0].display_index, 2);
    }
}
