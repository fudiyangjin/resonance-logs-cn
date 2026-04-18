use crate::live::event_manager::safe_emit_to;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const EVENT_LOGGER_BATCH_EVENT: &str = "event-logger-batch";

#[derive(specta::Type, Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventLoggerSessionDirectoryPayload {
    pub configured_directory: Option<String>,
    pub resolved_directory: String,
    pub using_default: bool,
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

pub fn get_logger_buffer_entries() -> Vec<EventLoggerEntry> {
    event_logger_buffer().lock().clone()
}

pub fn clear_logger_buffer_entries() {
    event_logger_buffer().lock().clear();
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

fn read_event_logger_directory_config(app_handle: &AppHandle) -> Result<Option<String>, String> {
    let settings_path = event_logger_settings_path(app_handle)?;
    if !settings_path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(&settings_path)
        .map_err(|e| format!("failed to read {}: {e}", settings_path.display()))?;
    if bytes.is_empty() {
        return Ok(None);
    }

    let config: EventLoggerSessionDirectoryConfig = serde_json::from_slice(&bytes)
        .map_err(|e| format!("failed to parse {}: {e}", settings_path.display()))?;

    Ok(config
        .save_directory
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

fn default_event_logger_session_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let log_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("failed to resolve app_log_dir: {e}"))?;
    Ok(log_dir.join("event-sessions"))
}

pub fn resolve_event_logger_session_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    if let Some(configured) = read_event_logger_directory_config(app_handle)? {
        return Ok(PathBuf::from(configured));
    }

    default_event_logger_session_dir(app_handle)
}

pub fn get_event_logger_session_directory_payload(
    app_handle: &AppHandle,
) -> Result<EventLoggerSessionDirectoryPayload, String> {
    let configured_directory = read_event_logger_directory_config(app_handle)?;
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
        fs::create_dir_all(path)
            .map_err(|e| format!("failed to create event logger session directory {}: {e}", path))?;
    }

    let payload = EventLoggerSessionDirectoryConfig {
        save_directory: normalized,
    };

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
    let (entries, started_at_ms, scene_name) = {
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

    let session_dir = resolve_event_logger_session_dir(app_handle)?;
    fs::create_dir_all(&session_dir)
        .map_err(|e| format!("failed to create session dir {}: {e}", session_dir.display()))?;

    let now = chrono::Local::now();
    let date_segment = now.format("%d%m%Y").to_string();
    let time_segment = now.format("%H%M%S").to_string();

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
    let file_scene_name = sanitize_filename_segment(
        scene_name.as_deref().unwrap_or("unknown_scene"),
    );
    let file_name = format!(
        "{}.{}.{}.{}-{}.json",
        file_character_name, file_character_uid, file_scene_name, date_segment, time_segment
    );
    let file_path = next_available_session_file_path(&session_dir, &file_name);

    let payload = EventLoggerSessionFile {
        boundary: boundary.to_string(),
        saved_at_ms: now_ms(),
        started_at_ms,
        ended_at_ms: entries.last().map(|entry| entry.ts_ms).unwrap_or_else(now_ms),
        character_name: context.character_name,
        character_uid: context.character_uid,
        scene_name,
        entry_count: entries.len(),
        entries,
    };

    fs::write(
        &file_path,
        serde_json::to_vec_pretty(&payload)
            .map_err(|e| format!("failed to serialize session file {}: {e}", file_path.display()))?,
    )
    .map_err(|e| format!("failed to write session file {}: {e}", file_path.display()))?;

    Ok(Some(file_path))
}
