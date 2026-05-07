use crate::live::event_manager::safe_emit_to;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const EVENT_LOGGER_BATCH_EVENT: &str = "event-logger-batch";

#[derive(specta::Type, Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventLoggerSessionDirectoryPayload {
    pub configured_directory: Option<String>,
    pub resolved_directory: String,
    pub using_default: bool,
}

#[derive(specta::Type, Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventLoggerFileStoragePayload {
    pub configured_directory: Option<String>,
    pub resolved_directory: String,
    pub using_default: bool,
    pub store_log_files: bool,
    pub include_repeated_snapshot_rows: bool,
    pub delete_older_than_days: Option<u32>,
    pub capture_census_enabled: bool,
    pub attribution_census_enabled: bool,
}

#[derive(Debug, Clone, Default)]
pub struct EventLoggerSessionContext {
    pub character_name: Option<String>,
    pub character_uid: Option<i64>,
    pub scene_name: Option<String>,
}

#[derive(Debug, Default)]
struct EventLoggerSessionState {
    started_at_ms: Option<i64>,
    current_scene_name: Option<String>,
    entries: Vec<EventLoggerEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EventLoggerSessionFile {
    boundary: String,
    saved_at_ms: i64,
    started_at_ms: Option<i64>,
    ended_at_ms: i64,
    character_name: Option<String>,
    character_uid: Option<i64>,
    scene_name: Option<String>,
    entry_count: usize,
    entries: Vec<EventLoggerEntry>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EventLoggerSessionDirectoryConfig {
    save_directory: Option<String>,
    store_log_files: Option<bool>,
    include_repeated_snapshot_rows: Option<bool>,
    delete_older_than_days: Option<u32>,
    capture_census_enabled: Option<bool>,
    attribution_census_enabled: Option<bool>,
}

#[derive(specta::Type, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventLoggerEntry {
    pub ts_ms: i64,
    pub category: String,
    pub action: String,
    pub uid: Option<i64>,
    pub target_uid: Option<i64>,
    pub source_uid: Option<i64>,
    pub source_label: Option<String>,
    pub target_label: Option<String>,
    pub name_hint: Option<String>,
    pub summary: Option<String>,
    pub stacks: Option<i32>,
    pub duration_ms: Option<i32>,
    pub remaining_ms: Option<i32>,
    pub value: Option<String>,
    pub raw: String,
}

#[derive(specta::Type, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventLoggerBatchPayload {
    pub entries: Vec<EventLoggerEntry>,
}

pub const EVENT_LOGGER_BUFFER_LIMIT: usize = 5000;

fn event_logger_buffer() -> &'static Mutex<Vec<EventLoggerEntry>> {
    static EVENT_LOGGER_BUFFER: OnceLock<Mutex<Vec<EventLoggerEntry>>> = OnceLock::new();
    EVENT_LOGGER_BUFFER.get_or_init(|| Mutex::new(Vec::new()))
}

fn event_logger_session_state() -> &'static Mutex<EventLoggerSessionState> {
    static EVENT_LOGGER_SESSION_STATE: OnceLock<Mutex<EventLoggerSessionState>> = OnceLock::new();
    EVENT_LOGGER_SESSION_STATE.get_or_init(|| Mutex::new(EventLoggerSessionState::default()))
}

#[derive(Debug, Default)]
struct SnapshotFilterState {
    last_snapshot_by_stream: HashMap<String, String>,
}

fn snapshot_filter_state() -> &'static Mutex<SnapshotFilterState> {
    static SNAPSHOT_FILTER_STATE: OnceLock<Mutex<SnapshotFilterState>> = OnceLock::new();
    SNAPSHOT_FILTER_STATE.get_or_init(|| Mutex::new(SnapshotFilterState::default()))
}

fn reset_snapshot_filter_state() {
    snapshot_filter_state()
        .lock()
        .last_snapshot_by_stream
        .clear();
}

pub fn get_logger_buffer_entries() -> Vec<EventLoggerEntry> {
    event_logger_buffer().lock().clone()
}

pub fn clear_logger_buffer_entries() {
    event_logger_buffer().lock().clear();
    reset_snapshot_filter_state();
}

pub fn drain_background_logger_entries() -> Vec<EventLoggerEntry> {
    Vec::new()
}

fn infer_scene_name(entry: &EventLoggerEntry) -> Option<String> {
    if entry.category == "scene" && entry.action == "change" {
        return entry
            .summary
            .clone()
            .or_else(|| entry.name_hint.clone())
            .filter(|value| !value.trim().is_empty());
    }

    if entry.category == "encounter" && entry.action == "update" {
        return entry
            .name_hint
            .clone()
            .filter(|value| !value.trim().is_empty());
    }

    None
}

fn parse_entry_raw_json(entry: &EventLoggerEntry) -> Option<serde_json::Value> {
    serde_json::from_str(&entry.raw).ok()
}

fn json_u128_field(value: &serde_json::Value, key: &str) -> Option<u128> {
    value.get(key).and_then(|field| {
        field.as_u64().map(u128::from).or_else(|| {
            field
                .as_i64()
                .filter(|number| *number >= 0)
                .map(|number| number as u128)
        })
    })
}

fn json_nested_u128_field(value: &serde_json::Value, parent: &str, key: &str) -> Option<u128> {
    value
        .get(parent)
        .and_then(|field| field.as_object())
        .and_then(|object| object.get(key))
        .and_then(|field| {
            field.as_u64().map(u128::from).or_else(|| {
                field
                    .as_i64()
                    .filter(|number| *number >= 0)
                    .map(|number| number as u128)
            })
        })
}

fn is_idle_live_totals_snapshot(entry: &EventLoggerEntry) -> bool {
    if entry.action != "snapshot" || entry.category != "live_totals" {
        return false;
    }

    let Some(raw) = parse_entry_raw_json(entry) else {
        return false;
    };

    let total_dmg = json_u128_field(&raw, "totalDmg").unwrap_or_default();
    let total_boss_dmg = json_u128_field(&raw, "totalDmgBossOnly").unwrap_or_default();
    let total_heal = json_u128_field(&raw, "totalHeal").unwrap_or_default();
    let total_effective_heal = json_u128_field(&raw, "totalEffectiveHeal").unwrap_or_default();
    let active_combat_time = json_u128_field(&raw, "activeCombatTimeMs").unwrap_or_default();
    let bosses_empty = raw
        .get("bosses")
        .and_then(|value| value.as_array())
        .map(|value| value.is_empty())
        .unwrap_or(true);
    let entities_empty = raw
        .get("entities")
        .and_then(|value| value.as_array())
        .map(|value| value.is_empty())
        .unwrap_or(true);

    total_dmg == 0
        && total_boss_dmg == 0
        && total_heal == 0
        && total_effective_heal == 0
        && active_combat_time == 0
        && bosses_empty
        && entities_empty
}

fn is_empty_player_snapshot(entry: &EventLoggerEntry) -> bool {
    if entry.action != "snapshot" || entry.category != "player" {
        return false;
    }

    let Some(raw) = parse_entry_raw_json(entry) else {
        return false;
    };

    let damage_total = json_nested_u128_field(&raw, "damage", "total").unwrap_or_default();
    let damage_hits = json_nested_u128_field(&raw, "damage", "hits").unwrap_or_default();
    let boss_damage_total =
        json_nested_u128_field(&raw, "damageBossOnly", "total").unwrap_or_default();
    let boss_damage_hits =
        json_nested_u128_field(&raw, "damageBossOnly", "hits").unwrap_or_default();
    let heal_total = json_nested_u128_field(&raw, "healing", "total").unwrap_or_default();
    let heal_hits = json_nested_u128_field(&raw, "healing", "hits").unwrap_or_default();
    let taken_total = json_nested_u128_field(&raw, "taken", "total").unwrap_or_default();
    let taken_hits = json_nested_u128_field(&raw, "taken", "hits").unwrap_or_default();

    let class_id = raw
        .get("classId")
        .and_then(|value| value.as_i64())
        .unwrap_or_default();
    let ability_score = raw
        .get("abilityScore")
        .and_then(|value| value.as_i64())
        .unwrap_or_default();
    let season_strength = raw
        .get("seasonStrength")
        .and_then(|value| value.as_i64())
        .unwrap_or_default();
    let current_hp_missing = raw
        .get("currentHp")
        .map(|value| value.is_null())
        .unwrap_or(true);
    let max_hp_missing = raw
        .get("maxHp")
        .map(|value| value.is_null())
        .unwrap_or(true);

    damage_total == 0
        && damage_hits == 0
        && boss_damage_total == 0
        && boss_damage_hits == 0
        && heal_total == 0
        && heal_hits == 0
        && taken_total == 0
        && taken_hits == 0
        && class_id == 0
        && ability_score == 0
        && season_strength == 0
        && current_hp_missing
        && max_hp_missing
}

fn should_suppress_idle_snapshot(entry: &EventLoggerEntry) -> bool {
    is_idle_live_totals_snapshot(entry) || is_empty_player_snapshot(entry)
}

fn normalized_snapshot_summary(entry: &EventLoggerEntry) -> Option<String> {
    let summary = entry.summary.as_deref()?.trim();

    if entry.category != "live_totals" {
        return Some(summary.to_string());
    }

    let Some((prefix, suffix)) = summary.split_once(" active=") else {
        return Some(summary.to_string());
    };
    let Some((_, paused)) = suffix.split_once(" paused=") else {
        return Some(summary.to_string());
    };

    Some(format!("{} paused={}", prefix.trim_end(), paused.trim()))
}

fn normalized_snapshot_duration_ms(entry: &EventLoggerEntry) -> Option<i32> {
    if entry.category == "live_totals" {
        return None;
    }

    entry.duration_ms
}

fn snapshot_stream_key(entry: &EventLoggerEntry) -> Option<String> {
    if entry.action != "snapshot" {
        return None;
    }

    Some(format!(
        "{}|{}|{}|{}",
        entry.category,
        entry.uid.map(|value| value.to_string()).unwrap_or_default(),
        entry
            .target_uid
            .map(|value| value.to_string())
            .unwrap_or_default(),
        entry
            .source_uid
            .map(|value| value.to_string())
            .unwrap_or_default(),
    ))
}

fn snapshot_signature(entry: &EventLoggerEntry) -> Option<String> {
    if entry.action != "snapshot" {
        return None;
    }

    Some(format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
        entry.category,
        entry.uid.map(|value| value.to_string()).unwrap_or_default(),
        entry
            .target_uid
            .map(|value| value.to_string())
            .unwrap_or_default(),
        entry
            .source_uid
            .map(|value| value.to_string())
            .unwrap_or_default(),
        entry.source_label.as_deref().unwrap_or_default(),
        entry.target_label.as_deref().unwrap_or_default(),
        entry.name_hint.as_deref().unwrap_or_default(),
        normalized_snapshot_summary(entry).unwrap_or_default(),
        entry
            .stacks
            .map(|value| value.to_string())
            .unwrap_or_default(),
        normalized_snapshot_duration_ms(entry)
            .map(|value| value.to_string())
            .unwrap_or_default(),
        entry
            .remaining_ms
            .map(|value| value.to_string())
            .unwrap_or_default(),
    ))
}

fn filter_live_logger_entries(entries: Vec<EventLoggerEntry>) -> Vec<EventLoggerEntry> {
    if entries.is_empty() {
        return entries;
    }

    let mut state = snapshot_filter_state().lock();
    let mut filtered = Vec::with_capacity(entries.len());

    for entry in entries {
        let stream_key = snapshot_stream_key(&entry);
        let signature = snapshot_signature(&entry);

        if let (Some(stream_key), Some(signature)) = (stream_key, signature) {
            if should_suppress_idle_snapshot(&entry) {
                state.last_snapshot_by_stream.insert(stream_key, signature);
                continue;
            }

            if state
                .last_snapshot_by_stream
                .get(&stream_key)
                .map(|previous| previous == &signature)
                .unwrap_or(false)
            {
                continue;
            }

            state.last_snapshot_by_stream.insert(stream_key, signature);
        }

        filtered.push(entry);
    }

    filtered
}

fn push_logger_entries(entries: &[EventLoggerEntry]) {
    if entries.is_empty() {
        return;
    }

    {
        let mut buffer = event_logger_buffer().lock();
        buffer.extend(entries.iter().cloned());
        if buffer.len() > EVENT_LOGGER_BUFFER_LIMIT {
            let overflow = buffer.len() - EVENT_LOGGER_BUFFER_LIMIT;
            buffer.drain(0..overflow);
        }
    }

    let mut session = event_logger_session_state().lock();
    if session.started_at_ms.is_none() {
        session.started_at_ms = entries.first().map(|entry| entry.ts_ms);
    }
    if let Some(scene_name) = entries.iter().rev().find_map(infer_scene_name) {
        session.current_scene_name = Some(scene_name);
    }
    session.entries.extend(entries.iter().cloned());
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

pub fn logger_window_visible(app_handle: &AppHandle) -> bool {
    let Some(window) = app_handle.get_webview_window(crate::WINDOW_EVENT_LOGGER_LABEL) else {
        return false;
    };

    window.is_visible().unwrap_or(false)
}

pub fn emit_logger_entries(app_handle: &AppHandle, entries: Vec<EventLoggerEntry>) {
    if entries.is_empty() {
        return;
    }

    let entries = filter_live_logger_entries(entries);
    if entries.is_empty() {
        return;
    }

    push_logger_entries(&entries);

    if app_handle
        .get_webview_window(crate::WINDOW_EVENT_LOGGER_LABEL)
        .is_none()
    {
        return;
    }

    safe_emit_to(
        app_handle,
        crate::WINDOW_EVENT_LOGGER_LABEL,
        EVENT_LOGGER_BATCH_EVENT,
        EventLoggerBatchPayload { entries },
    );
}

fn sanitize_filename_segment(value: &str) -> String {
    let sanitized = value
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    }
}

fn event_logger_settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app_config_dir: {e}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("failed to create config dir {}: {e}", config_dir.display()))?;
    Ok(config_dir.join("event_logger_settings.json"))
}

fn read_event_logger_settings_config(
    app_handle: &AppHandle,
) -> Result<EventLoggerSessionDirectoryConfig, String> {
    let settings_path = event_logger_settings_path(app_handle)?;
    if !settings_path.exists() {
        return Ok(EventLoggerSessionDirectoryConfig::default());
    }

    let bytes = fs::read(&settings_path)
        .map_err(|e| format!("failed to read {}: {e}", settings_path.display()))?;
    if bytes.is_empty() {
        return Ok(EventLoggerSessionDirectoryConfig::default());
    }

    let mut config: EventLoggerSessionDirectoryConfig = serde_json::from_slice(&bytes)
        .map_err(|e| format!("failed to parse {}: {e}", settings_path.display()))?;

    config.save_directory = config
        .save_directory
        .take()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    Ok(config)
}

fn default_event_logger_session_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .or_else(|_| app_handle.path().app_local_data_dir())
        .or_else(|_| app_handle.path().app_log_dir())
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    Ok(data_dir.join("EventLogs"))
}

pub fn resolve_event_logger_session_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let config = read_event_logger_settings_config(app_handle)?;
    if let Some(configured) = config.save_directory {
        return Ok(PathBuf::from(configured));
    }

    default_event_logger_session_dir(app_handle)
}

fn event_logger_file_storage_defaults() -> (bool, bool, Option<u32>, bool, bool) {
    (false, false, None, false, false)
}

fn build_event_logger_file_storage_payload(
    configured_directory: Option<String>,
    resolved_directory: PathBuf,
    store_log_files: bool,
    include_repeated_snapshot_rows: bool,
    delete_older_than_days: Option<u32>,
    capture_census_enabled: bool,
    attribution_census_enabled: bool,
) -> EventLoggerFileStoragePayload {
    EventLoggerFileStoragePayload {
        using_default: configured_directory.is_none(),
        configured_directory,
        resolved_directory: resolved_directory.display().to_string(),
        store_log_files,
        include_repeated_snapshot_rows,
        delete_older_than_days,
        capture_census_enabled,
        attribution_census_enabled,
    }
}

pub fn get_event_logger_file_storage_payload(
    app_handle: &AppHandle,
) -> Result<EventLoggerFileStoragePayload, String> {
    let config = read_event_logger_settings_config(app_handle)?;
    let configured_directory = config.save_directory.clone();
    let resolved_directory = configured_directory
        .clone()
        .map(PathBuf::from)
        .unwrap_or(default_event_logger_session_dir(app_handle)?);
    let (
        default_store_log_files,
        default_include_repeated_snapshot_rows,
        default_delete_older_than_days,
        _default_capture_census_enabled,
        _default_attribution_census_enabled,
    ) = event_logger_file_storage_defaults();

    Ok(build_event_logger_file_storage_payload(
        configured_directory,
        resolved_directory,
        config.store_log_files.unwrap_or(default_store_log_files),
        config
            .include_repeated_snapshot_rows
            .unwrap_or(default_include_repeated_snapshot_rows),
        config
            .delete_older_than_days
            .or(default_delete_older_than_days),
        crate::packets::packet_capture::is_capture_census_enabled(),
        crate::live::attribution_census::is_attribution_census_enabled(),
    ))
}

pub fn set_event_logger_file_storage_settings(
    app_handle: &AppHandle,
    store_log_files: bool,
    include_repeated_snapshot_rows: bool,
    delete_older_than_days: Option<u32>,
    capture_census_enabled: bool,
    attribution_census_enabled: bool,
) -> Result<EventLoggerFileStoragePayload, String> {
    let mut config = read_event_logger_settings_config(app_handle)?;
    config.store_log_files = Some(store_log_files);
    config.include_repeated_snapshot_rows = Some(include_repeated_snapshot_rows);
    config.delete_older_than_days = delete_older_than_days.filter(|value| *value > 0);
    config.capture_census_enabled = Some(false);
    config.attribution_census_enabled = Some(false);

    let settings_path = event_logger_settings_path(app_handle)?;
    fs::write(
        &settings_path,
        serde_json::to_vec_pretty(&config)
            .map_err(|e| format!("failed to serialize {}: {e}", settings_path.display()))?,
    )
    .map_err(|e| format!("failed to write {}: {e}", settings_path.display()))?;

    if let Ok(dir) = resolve_event_logger_session_dir(app_handle) {
        let _ = cleanup_old_event_logger_files(&dir, delete_older_than_days);
    }

    crate::packets::packet_capture::set_capture_census_enabled(capture_census_enabled);
    crate::live::attribution_census::set_attribution_census_enabled(attribution_census_enabled);

    get_event_logger_file_storage_payload(app_handle)
}

fn cleanup_old_event_logger_files(
    dir: &Path,
    delete_older_than_days: Option<u32>,
) -> Result<(), String> {
    let Some(days) = delete_older_than_days.filter(|value| *value > 0) else {
        return Ok(());
    };

    if !dir.exists() {
        return Ok(());
    }

    let now = SystemTime::now();
    let max_age = Duration::from_secs(u64::from(days) * 24 * 60 * 60);
    cleanup_old_event_logger_files_recursive(dir, &now, max_age)?;
    Ok(())
}

fn cleanup_old_event_logger_files_recursive(
    dir: &Path,
    now: &SystemTime,
    max_age: Duration,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| format!("failed to read {}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| format!("failed to inspect {}: {e}", dir.display()))?;
        let path = entry.path();
        if path.is_dir() {
            cleanup_old_event_logger_files_recursive(&path, now, max_age)?;
            let mut children = fs::read_dir(&path)
                .map_err(|e| format!("failed to inspect {}: {e}", path.display()))?;
            if children.next().is_none() {
                let _ = fs::remove_dir(&path);
            }
            continue;
        }
        if !path.is_file() {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("failed to inspect {}: {e}", path.display()))?;
        let modified_at = metadata.modified().or_else(|_| metadata.created());
        let Ok(modified_at) = modified_at else {
            continue;
        };
        let Ok(age) = now.duration_since(modified_at) else {
            continue;
        };
        if age >= max_age {
            fs::remove_file(&path)
                .map_err(|e| format!("failed to remove {}: {e}", path.display()))?;
        }
    }

    Ok(())
}

fn export_placeholder_player_name(uid: i64) -> String {
    format!("目标 {uid} (You)")
}

fn normalize_manual_export_player_name(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized = trimmed.strip_suffix("(You)").unwrap_or(trimmed).trim();
    if normalized.is_empty() || normalized.starts_with("UID ") {
        return None;
    }

    Some(normalized.to_string())
}

fn infer_manual_export_context(
    entries: &[EventLoggerEntry],
    mut context: EventLoggerSessionContext,
    scene_name: Option<&str>,
) -> EventLoggerSessionContext {
    if context.scene_name.is_none() {
        context.scene_name = scene_name.map(|value| value.to_string()).or_else(|| {
            entries
                .iter()
                .rev()
                .filter(|entry| entry.category == "player" && entry.action == "snapshot")
                .filter_map(|entry| entry.target_label.clone())
                .find(|value| !value.trim().is_empty())
        });
    }

    if context.character_uid.is_none() {
        context.character_uid = entries
            .iter()
            .rev()
            .filter(|entry| entry.category == "player" && entry.action == "snapshot")
            .find_map(|entry| entry.uid.or(entry.source_uid).filter(|uid| *uid > 0));
    }

    if context.character_name.is_none() {
        context.character_name = entries
            .iter()
            .rev()
            .filter(|entry| entry.category == "player" && entry.action == "snapshot")
            .find_map(|entry| {
                entry
                    .name_hint
                    .as_deref()
                    .and_then(normalize_manual_export_player_name)
                    .or_else(|| {
                        entry
                            .source_label
                            .as_deref()
                            .and_then(normalize_manual_export_player_name)
                    })
            });
    }

    context
}

fn normalize_entry_for_export(
    mut entry: EventLoggerEntry,
    context: &EventLoggerSessionContext,
    scene_name: Option<&str>,
) -> EventLoggerEntry {
    if let (Some(character_uid), Some(character_name)) =
        (context.character_uid, context.character_name.as_deref())
    {
        let normalized_player_label = format!("{} (You)", character_name.trim());

        if entry.source_uid == Some(character_uid) {
            let needs_source_fix = entry
                .source_label
                .as_deref()
                .map(|value| {
                    let trimmed = value.trim();
                    trimmed.is_empty()
                        || trimmed == export_placeholder_player_name(character_uid)
                        || trimmed == format!("UID {} (You)", character_uid)
                })
                .unwrap_or(true);
            if needs_source_fix {
                entry.source_label = Some(normalized_player_label.clone());
            }

            let needs_name_hint_fix = entry
                .name_hint
                .as_deref()
                .map(|value| {
                    let trimmed = value.trim();
                    trimmed.is_empty()
                        || trimmed == export_placeholder_player_name(character_uid)
                        || trimmed == format!("UID {} (You)", character_uid)
                        || trimmed == format!("目标 {}", character_uid)
                        || trimmed == format!("UID {}", character_uid)
                })
                .unwrap_or(true);
            if needs_name_hint_fix && entry.category == "player" {
                entry.name_hint = Some(normalized_player_label.clone());
            }
        }
    }

    if entry.action == "snapshot" {
        if entry
            .target_label
            .as_deref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(true)
        {
            if let Some(scene_name) = scene_name.filter(|value| !value.trim().is_empty()) {
                entry.target_label = Some(scene_name.to_string());
            }
        }

        if entry.category == "live_totals"
            && entry
                .name_hint
                .as_deref()
                .map(|value| value.trim().is_empty())
                .unwrap_or(true)
        {
            if let Some(scene_name) = scene_name.filter(|value| !value.trim().is_empty()) {
                entry.name_hint = Some(scene_name.to_string());
            }
        }
    }

    entry
}

fn normalize_export_entries(
    entries: Vec<EventLoggerEntry>,
    context: &EventLoggerSessionContext,
    scene_name: Option<&str>,
) -> Vec<EventLoggerEntry> {
    entries
        .into_iter()
        .map(|entry| normalize_entry_for_export(entry, context, scene_name))
        .collect()
}

fn filter_export_entries(
    entries: Vec<EventLoggerEntry>,
    include_repeated_snapshot_rows: bool,
) -> Vec<EventLoggerEntry> {
    if include_repeated_snapshot_rows || entries.is_empty() {
        return entries;
    }

    let mut filtered = Vec::with_capacity(entries.len());
    let mut last_snapshot_signature: Option<String> = None;

    for entry in entries {
        if let Some(signature) = snapshot_signature(&entry) {
            if last_snapshot_signature.as_deref() == Some(signature.as_str()) {
                continue;
            }
            last_snapshot_signature = Some(signature);
            filtered.push(entry);
            continue;
        }

        last_snapshot_signature = None;
        filtered.push(entry);
    }

    filtered
}

pub fn get_event_logger_session_directory_payload(
    app_handle: &AppHandle,
) -> Result<EventLoggerSessionDirectoryPayload, String> {
    let configured_directory = read_event_logger_settings_config(app_handle)?.save_directory;
    let resolved_directory = configured_directory
        .clone()
        .map(PathBuf::from)
        .unwrap_or(default_event_logger_session_dir(app_handle)?);

    Ok(EventLoggerSessionDirectoryPayload {
        using_default: configured_directory.is_none(),
        configured_directory,
        resolved_directory: resolved_directory.display().to_string(),
    })
}

pub fn set_event_logger_session_directory(
    app_handle: &AppHandle,
    directory: Option<String>,
) -> Result<EventLoggerSessionDirectoryPayload, String> {
    let normalized = directory
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(path) = normalized.as_ref() {
        fs::create_dir_all(path).map_err(|e| {
            format!(
                "failed to create event logger session directory {}: {e}",
                path
            )
        })?;
    }

    let mut payload = read_event_logger_settings_config(app_handle)?;
    payload.save_directory = normalized;

    let settings_path = event_logger_settings_path(app_handle)?;
    fs::write(
        &settings_path,
        serde_json::to_vec_pretty(&payload)
            .map_err(|e| format!("failed to serialize {}: {e}", settings_path.display()))?,
    )
    .map_err(|e| format!("failed to write {}: {e}", settings_path.display()))?;

    get_event_logger_session_directory_payload(app_handle)
}

fn next_available_session_file_path(dir: &Path, base_name: &str) -> PathBuf {
    let candidate = dir.join(base_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = base_name.strip_suffix(".json").unwrap_or(base_name);
    for index in 2..1000 {
        let candidate = dir.join(format!("{stem}.{index}.json"));
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(format!("{stem}.overflow.json"))
}

pub fn flush_current_session_to_file(
    app_handle: &AppHandle,
    boundary: &str,
    context: EventLoggerSessionContext,
) -> Result<Option<PathBuf>, String> {
    let (entries, started_at_ms, mut scene_name) = {
        let mut session = event_logger_session_state().lock();
        if session.entries.is_empty() {
            if let Some(scene_name) = context.scene_name.clone() {
                session.current_scene_name = Some(scene_name);
            }
            return Ok(None);
        }

        let entries = std::mem::take(&mut session.entries);
        let started_at_ms = session.started_at_ms.take();
        let scene_name = session
            .current_scene_name
            .clone()
            .or_else(|| context.scene_name.clone());
        session.current_scene_name = context.scene_name.clone().or(scene_name.clone());
        (entries, started_at_ms, scene_name)
    };

    reset_snapshot_filter_state();

    let file_storage = get_event_logger_file_storage_payload(app_handle)?;
    if !file_storage.store_log_files {
        return Ok(None);
    }

    let session_root_dir = PathBuf::from(&file_storage.resolved_directory);
    fs::create_dir_all(&session_root_dir).map_err(|e| {
        format!(
            "failed to create session dir {}: {e}",
            session_root_dir.display()
        )
    })?;
    cleanup_old_event_logger_files(&session_root_dir, file_storage.delete_older_than_days)?;

    let now = chrono::Local::now();
    let day_directory = now.format("%Y.%m.%d").to_string();
    let session_dir = session_root_dir.join(&day_directory);
    fs::create_dir_all(&session_dir).map_err(|e| {
        format!(
            "failed to create session dir {}: {e}",
            session_dir.display()
        )
    })?;
    let date_segment = now.format("%d%m%Y").to_string();
    let time_segment = now.format("%H%M%S").to_string();
    let context = infer_manual_export_context(&entries, context, scene_name.as_deref());
    if scene_name.is_none() {
        scene_name = context.scene_name.clone();
    }

    let file_character_name = sanitize_filename_segment(
        context
            .character_name
            .as_deref()
            .unwrap_or("unknown_character"),
    );
    let file_character_uid = sanitize_filename_segment(
        &context
            .character_uid
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown_uid".to_string()),
    );
    let file_scene_name =
        sanitize_filename_segment(scene_name.as_deref().unwrap_or("unknown_scene"));
    let file_name = format!(
        "{}.{}.{}.{}-{}.json",
        file_character_name, file_character_uid, file_scene_name, date_segment, time_segment
    );
    let file_path = next_available_session_file_path(&session_dir, &file_name);
    let entries = filter_export_entries(entries, file_storage.include_repeated_snapshot_rows);
    let entries = normalize_export_entries(entries, &context, scene_name.as_deref());

    let payload = EventLoggerSessionFile {
        boundary: boundary.to_string(),
        saved_at_ms: now_ms(),
        started_at_ms,
        ended_at_ms: entries
            .last()
            .map(|entry| entry.ts_ms)
            .unwrap_or_else(now_ms),
        character_name: context.character_name,
        character_uid: context.character_uid,
        scene_name,
        entry_count: entries.len(),
        entries,
    };

    fs::write(
        &file_path,
        serde_json::to_vec_pretty(&payload).map_err(|e| {
            format!(
                "failed to serialize session file {}: {e}",
                file_path.display()
            )
        })?,
    )
    .map_err(|e| format!("failed to write session file {}: {e}", file_path.display()))?;

    Ok(Some(file_path))
}
