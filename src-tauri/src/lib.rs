mod build_app;
pub mod live;
pub mod module_optimizer;
mod packets;
mod parser_data;
mod translation_runtime;

use crate::build_app::build_and_run;
use log::{info, warn};
use specta_typescript::{BigIntExportBehavior, Typescript};
#[cfg(windows)]
use std::process::{Command, Stdio};

use std::path::{Path, PathBuf};
use std::sync::{
    Mutex, OnceLock,
    atomic::{AtomicBool, Ordering},
};

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, Window, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
// NOTE: the updater extension trait is imported next to the helper that uses it
// and is cfg-gated to avoid unused-import warnings on builds that don't enable
// the updater plugin.
use tauri_specta::{Builder, collect_commands};
mod database;
use serde_json::json;

/// The label for the live window.
pub const WINDOW_LIVE_LABEL: &str = "live";
/// The label for the main window.
pub const WINDOW_MAIN_LABEL: &str = "main";
/// The label for the unified game overlay window.
pub const WINDOW_GAME_OVERLAY_LABEL: &str = "game-overlay";
/// The label for the monster overlay window.
pub const WINDOW_MONSTER_OVERLAY_LABEL: &str = "monster-overlay";
/// The label for the event logger window.
pub const WINDOW_EVENT_LOGGER_LABEL: &str = "event-logger";

const LEGACY_APP_IDENTIFIER: &str = "com.resonance-logs-cn";
const LOG_FILE_PREFIX: &str = "resonance-logs-global_v";
const LEGACY_LOG_FILE_PREFIX: &str = "resonance-logs-cn_v";

static HIDE_MAIN_WINDOW_TO_TRAY: AtomicBool = AtomicBool::new(false);

#[cfg(debug_assertions)]
fn trim_generated_bindings_whitespace(bindings: &str) -> String {
    let mut trimmed = String::with_capacity(bindings.len());
    for line in bindings.lines() {
        trimmed.push_str(line.trim_end());
        trimmed.push('\n');
    }
    trimmed
}

#[cfg(debug_assertions)]
fn clean_generated_bindings(bindings_path: &Path) {
    const MARKER: &str = "/** tauri-specta globals **/";
    const CLEAN_GLOBALS: &str = r#"/** tauri-specta globals **/

import {
	invoke as TAURI_INVOKE,
} from "@tauri-apps/api/core";

export type Result<T, E> =
	| { status: "ok"; data: T }
	| { status: "error"; error: E };
"#;

    let Ok(bindings) = std::fs::read_to_string(bindings_path) else {
        return;
    };

    let cleaned = if bindings.matches("__makeEvents__").count() == 1 {
        if let Some(marker_index) = bindings.find(MARKER) {
            let mut cleaned = String::with_capacity(marker_index + CLEAN_GLOBALS.len() + 2);
            cleaned.push_str(bindings[..marker_index].trim_end());
            cleaned.push_str("\n\n");
            cleaned.push_str(CLEAN_GLOBALS);
            cleaned.push('\n');
            cleaned
        } else {
            bindings
        }
    } else {
        bindings
    };

    let _ = std::fs::write(bindings_path, trim_generated_bindings_whitespace(&cleaned));
}

#[tauri::command]
#[specta::specta]
fn toggle_game_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    let Some(overlay_window) = app.get_webview_window(WINDOW_GAME_OVERLAY_LABEL) else {
        return Err("Game overlay window not found".into());
    };

    let next_visible = !overlay_window.is_visible().map_err(|e| e.to_string())?;
    if next_visible {
        let _ = overlay_window.set_ignore_cursor_events(true);
        overlay_window.show().map_err(|e| e.to_string())?;
        overlay_window.unminimize().map_err(|e| e.to_string())?;
    } else {
        overlay_window.hide().map_err(|e| e.to_string())?;
    }

    app.emit(
        "game-overlay-visibility-changed",
        json!({ "visible": next_visible }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
fn set_hide_main_window_to_tray(enabled: bool) -> Result<(), String> {
    HIDE_MAIN_WINDOW_TO_TRAY.store(enabled, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn toggle_game_overlay_edit_mode(app: tauri::AppHandle) -> Result<(), String> {
    let Some(overlay_window) = app.get_webview_window(WINDOW_GAME_OVERLAY_LABEL) else {
        return Err("Game overlay window not found".into());
    };

    let _ = overlay_window.set_ignore_cursor_events(false);

    if !overlay_window.is_visible().map_err(|e| e.to_string())? {
        overlay_window.show().map_err(|e| e.to_string())?;
        overlay_window.unminimize().map_err(|e| e.to_string())?;
    }

    app.emit("overlay-edit-toggle", json!({}))
        .map_err(|e| e.to_string())?;
    let _ = overlay_window.set_focus();

    Ok(())
}

#[tauri::command]
#[specta::specta]
fn sync_monster_overlay_window_to_game_overlay(app: tauri::AppHandle) -> Result<(), String> {
    mirror_overlay_window_bounds(
        &app,
        WINDOW_GAME_OVERLAY_LABEL,
        WINDOW_MONSTER_OVERLAY_LABEL,
    )
}

/// Keeps the non-blocking tracing appender worker alive for the lifetime of the process.
/// If this guard is dropped, file logging may stop flushing.
static LOGGING_GUARD: OnceLock<tracing_appender::non_blocking::WorkerGuard> = OnceLock::new();
/// Ensures we only initialize global logging once.
static LOGGING_INIT: OnceLock<Result<(), String>> = OnceLock::new();

/// Prevents recursive overlay window sync when mirroring move/resize events.
static OVERLAY_WINDOW_SYNC_GUARD: OnceLock<Mutex<bool>> = OnceLock::new();

fn mirror_overlay_window_bounds(
    app: &tauri::AppHandle,
    source_label: &str,
    target_label: &str,
) -> Result<(), String> {
    let guard = OVERLAY_WINDOW_SYNC_GUARD.get_or_init(|| Mutex::new(false));
    {
        let mut syncing = guard
            .lock()
            .map_err(|_| "Overlay window sync guard lock poisoned".to_string())?;
        if *syncing {
            return Ok(());
        }
        *syncing = true;
    }

    let result = (|| {
        let Some(source_window) = app.get_webview_window(source_label) else {
            return Err(format!("{} window not found", source_label));
        };
        let Some(target_window) = app.get_webview_window(target_label) else {
            return Err(format!("{} window not found", target_label));
        };

        let source_position = source_window.outer_position().map_err(|e| e.to_string())?;
        let source_size = source_window.outer_size().map_err(|e| e.to_string())?;

        target_window
            .set_position(Position::Physical(source_position))
            .map_err(|e| e.to_string())?;
        target_window
            .set_size(Size::Physical(source_size))
            .map_err(|e| e.to_string())?;
        Ok(())
    })();

    let mut syncing = guard
        .lock()
        .map_err(|_| "Overlay window sync guard lock poisoned".to_string())?;
    *syncing = false;

    result
}

fn copy_missing_file(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {}: {}", parent.display(), e))?;
    }
    std::fs::copy(source, target)
        .map(|_| ())
        .map_err(|e| format!("copy {} -> {}: {}", source.display(), target.display(), e))
}

fn copy_missing_dir(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }

    std::fs::create_dir_all(target)
        .map_err(|e| format!("create_dir_all {}: {}", target.display(), e))?;

    let entries =
        std::fs::read_dir(source).map_err(|e| format!("read_dir {}: {}", source.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("read_dir entry {}: {}", source.display(), e))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file_type {}: {}", source_path.display(), e))?;
        if file_type.is_dir() {
            copy_missing_dir(&source_path, &target_path)?;
        } else if file_type.is_file() {
            copy_missing_file(&source_path, &target_path)?;
        }
    }

    Ok(())
}

fn migrate_legacy_data_dir(global_dir: PathBuf) -> Result<(), String> {
    let Some(parent) = global_dir.parent() else {
        return Ok(());
    };
    let legacy_dir = parent.join(LEGACY_APP_IDENTIFIER);
    if !legacy_dir.exists() || legacy_dir == global_dir {
        return Ok(());
    }
    copy_missing_dir(&legacy_dir, &global_dir)
}

fn migrate_legacy_app_data(app: &tauri::AppHandle) -> Result<(), String> {
    if let Ok(dir) = app.path().app_data_dir() {
        migrate_legacy_data_dir(dir)?;
    }
    if let Ok(dir) = app.path().app_local_data_dir() {
        migrate_legacy_data_dir(dir)?;
    }
    Ok(())
}

/// The main entry point for the application logic.
///
/// This function sets up and runs the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // std::panic::set_hook(Box::new(|info| {
    //     info!pub(crate)("App crashed! Info: {:?}", info);
    //     unload_and_remove_windivert();
    // }));

    let builder = Builder::<tauri::Wry>::new()
        // Then register them (separated by a comma)
        .commands(collect_commands![
            live::commands::enable_blur,
            live::commands::disable_blur,
            live::commands::reset_encounter,
            live::commands::toggle_pause_encounter,
            live::commands::start_training_dummy,
            live::commands::stop_training_dummy,
            live::commands::save_and_apply_monitor_runtime_snapshot,
            database::commands::get_recent_encounters,
            database::commands::get_unique_scene_names,
            database::commands::get_unique_boss_names,
            database::commands::get_player_names_filtered,
            database::commands::get_recent_encounters_filtered,
            database::commands::get_encounter_by_id,
            database::commands::get_encounter_entities_raw,
            database::commands::get_encounter_entities_compact_raw,
            database::commands::get_encounter_entities_target_details_raw,
            database::commands::get_encounter_modifier_entities_raw,
            database::commands::delete_encounter,
            database::commands::delete_encounters,
            database::commands::delete_all_non_favorite_encounters,
            database::commands::toggle_favorite_encounter,
            database::commands::get_recent_players_command,
            database::commands::get_player_name_command,
            packet_settings_commands::save_packet_capture_settings,
            custom_data_commands::read_custom_definitions,
            custom_data_commands::write_custom_definitions,
            custom_data_commands::read_custom_triggers,
            custom_data_commands::write_custom_triggers,
            debug_commands::read_event_logger_buffer,
            debug_commands::clear_event_logger_buffer,
            debug_commands::show_event_logger_window,
            debug_commands::hide_event_logger_window,
            debug_commands::toggle_event_logger_window,
            debug_commands::set_event_logger_window_always_on_top,
            debug_commands::get_event_logger_session_directory,
            debug_commands::set_event_logger_save_directory,
            debug_commands::get_event_logger_file_storage_settings,
            debug_commands::set_event_logger_file_storage_settings,
            debug_commands::export_event_logger_session,
            debug_commands::open_event_logger_session_dir,
            packets::npcap::get_network_devices,
            packets::npcap::check_npcap_status,
            debug_commands::open_log_dir,
            debug_commands::create_diagnostics_bundle,
            module_optimizer::commands::check_gpu_support,
            module_optimizer::commands::get_latest_modules,
            module_optimizer::commands::get_latest_module_status,
            module_optimizer::commands::optimize_latest_modules,
            translation_runtime::initialize_translation_runtime_files,
            translation_runtime::get_translation_runtime_status,
            translation_runtime::repair_runtime_locale_folder,
            translation_runtime::open_translation_data_dir,
            translation_runtime::refresh_translation_runtime_data,
            translation_runtime::list_translation_runtime_files,
            translation_runtime::read_translation_runtime_file,
            translation_runtime::write_translation_runtime_file,
            translation_runtime::write_translation_runtime_locale_file,
            translation_runtime::write_translation_runtime_locale_patch,
            translation_runtime::generate_ui_translation_scaffold,
            translation_runtime::generate_all_ui_translation_scaffolds,
            toggle_game_overlay_window,
            set_hide_main_window_to_tray,
            toggle_game_overlay_edit_mode,
            sync_monster_overlay_window_to_game_overlay,
        ]);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    {
        let bindings_path = "../src/lib/bindings.ts";
        builder
            .export(
                Typescript::new().bigint(BigIntExportBehavior::Number),
                bindings_path,
            )
            .expect("Failed to export typescript bindings");

        clean_generated_bindings(Path::new(bindings_path));
    }

    let tauri_builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(builder.invoke_handler())
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Err(e) = migrate_legacy_app_data(&app_handle) {
                eprintln!("Failed to migrate legacy Resonance Logs CN AppData: {e}");
            }

            // Setup logs as early as possible so we don't lose startup context.
            // If logging fails, fall back to stderr so we still get a breadcrumb.
            if let Err(e) = setup_logs(&app_handle) {
                eprintln!("Failed to setup logs: {e}");
            }

            // Attach key-value-ish context to the setup flow via a span.
            // Existing log::info!/warn! calls will flow into tracing via LogTracer.
            let setup_span = tracing::info_span!(
                target: "app::startup",
                "app_setup",
                version = %app.package_info().version,
                os = %std::env::consts::OS,
                arch = %std::env::consts::ARCH
            );
            let _setup_guard = setup_span.enter();

            log::info!(target: "app::startup", "starting app v{}", app.package_info().version);
            stop_windivert();
            remove_windivert();

            // Initialize database and background writer early to avoid startup races where
            // multiple background tasks/commands trigger migrations concurrently.
            if let Err(e) = crate::database::init_db() {
                warn!(target: "app::db", "Failed to initialize database: {}", e);
            }
            crate::database::startup_maintenance();

            #[cfg(windows)]
            {
                let update_check_app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    if let Err(e) = check_for_updates(update_check_app_handle).await {
                        warn!(target: "app::startup", "Updater check failed: {}", e);
                    }
                });
            }

            // Install panic hook to create a crash dump file when the app panics.
            // This is installed after logs so we can use the configured logger.
            let hook_app_handle = app_handle.clone();
            // Take the default panic hook so we can call it after our handling.
            let default_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                // Try to persist a crash dump to the app log directory.
                let backtrace = std::backtrace::Backtrace::force_capture();
                let package_version = hook_app_handle.package_info().version.clone();
                let timestamp = chrono::Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
                let file_name = format!("crash_dump_v{}_{timestamp}.log", package_version);
                let mut dump_content = String::new();
                dump_content.push_str(&format!("Panic occurred: {}\n", info));
                dump_content.push_str(&format!("Backtrace:\n{:?}\n", backtrace));
                dump_content.push_str(&format!(
                    "OS: {} {}\n",
                    std::env::consts::OS,
                    std::env::consts::ARCH
                ));
                let log_dir = hook_app_handle.path().app_log_dir().ok();

                if let Some(log_dir) = log_dir {
                    if let Err(e) = std::fs::create_dir_all(&log_dir) {
                        warn!(
                            "panic: failed to create log dir {}: {}",
                            log_dir.display(),
                            e
                        );
                    } else {
                        let file_path = log_dir.join(&file_name);
                        match std::fs::write(&file_path, &dump_content) {
                            Ok(_) => warn!("panic: wrote crash dump to {}", file_path.display()),
                            Err(e) => warn!(
                                "panic: failed to write crash dump to {}: {}",
                                file_path.display(),
                                e
                            ),
                        }
                    }
                } else {
                    warn!("panic: failed to resolve app_log_dir; printing dump content to logs");
                    warn!("Crash dump:\n{}", dump_content);
                }
                // Attempt a clean up of resources (driver) before handing off to default handler.
                unload_and_remove_windivert();
                // Call the previously installed panic hook (prints to stderr etc)
                default_hook(info);
            }));

            // Setup tray icon
            setup_tray(&app_handle).expect("failed to setup tray");

            // Create and manage the state manager
            let (state_manager, control_rx) = crate::live::state::AppStateManager::new();
            app.manage(state_manager.clone());

            // Keep the logger hidden on startup unless the frontend explicitly opens it.
            // This avoids a brief flash when previous window-state visibility is restored.
            if let Some(window) = app_handle.get_webview_window(WINDOW_EVENT_LOGGER_LABEL) {
                if let Err(e) = window.hide() {
                    warn!("failed to hide event logger window during startup: {}", e);
                }
            }

            if let Ok(file_storage) =
                crate::live::event_logger::get_event_logger_file_storage_payload(&app_handle)
            {
                crate::packets::packet_capture::set_capture_census_enabled(
                    file_storage.capture_census_enabled,
                );
                crate::live::attribution_census::set_attribution_census_enabled(
                    file_storage.attribution_census_enabled,
                );
            }

            // Live Meter
            // https://v2.tauri.app/learn/splashscreen/#start-some-setup-tasks
            tauri::async_runtime::spawn(async move {
                live::live_main::start(app_handle.clone(), control_rx).await
            });
            Ok(())
        })
        .on_window_event(on_window_event_fn)
        .plugin(tauri_plugin_clipboard_manager::init()) // used to read/write to the clipboard
        .plugin(tauri_plugin_window_state::Builder::default().build()) // used to remember window size/position https://v2.tauri.app/plugin/window-state/
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {})) // used to enforce only 1 instance of the app https://v2.tauri.app/plugin/single-instance/
        .plugin(tauri_plugin_opener::init()) // used to open URLs in the default browser
        .plugin(tauri_plugin_dialog::init()) // used to show save/open dialogs
        .plugin(tauri_plugin_svelte::init()); // used for settings file
    build_and_run(tauri_builder);
}

mod custom_data_commands {
    use super::*;

    #[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
    #[serde(rename_all = "camelCase")]
    pub struct CustomDefinitionEntry {
        pub uid: i64,
        pub r#type: String,
        pub name: String,
        pub short_name: Option<String>,
        pub notes: Option<String>,
        pub icon: Option<String>,
        pub color: Option<String>,
    }

    #[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
    #[serde(rename_all = "camelCase")]
    pub struct CustomDefinitionsFile {
        pub version: i32,
        pub definitions: Vec<CustomDefinitionEntry>,
    }

    impl Default for CustomDefinitionsFile {
        fn default() -> Self {
            Self {
                version: 1,
                definitions: Vec::new(),
            }
        }
    }

    fn custom_definitions_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        let base_dir = app_handle
            .path()
            .app_data_dir()
            .or_else(|_| app_handle.path().app_local_data_dir())
            .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;

        let stores_dir = base_dir.join("stores");
        std::fs::create_dir_all(&stores_dir)
            .map_err(|e| format!("Failed to create {}: {}", stores_dir.display(), e))?;
        Ok(stores_dir.join("customDefinitions.json"))
    }

    #[tauri::command]
    #[specta::specta]
    pub fn read_custom_definitions(
        app_handle: tauri::AppHandle,
    ) -> Result<CustomDefinitionsFile, String> {
        let path = custom_definitions_path(&app_handle)?;
        if !path.exists() {
            return Ok(CustomDefinitionsFile::default());
        }

        let raw = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

        serde_json::from_str::<CustomDefinitionsFile>(&raw)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
    }

    #[tauri::command]
    #[specta::specta]
    pub fn write_custom_definitions(
        app_handle: tauri::AppHandle,
        payload: CustomDefinitionsFile,
    ) -> Result<(), String> {
        let path = custom_definitions_path(&app_handle)?;
        let bytes = serde_json::to_vec_pretty(&payload)
            .map_err(|e| format!("Failed to serialize custom definitions: {}", e))?;
        std::fs::write(&path, bytes)
            .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
        let _ = app_handle.emit("custom-definitions-updated", serde_json::json!({}));
        Ok(())
    }

    fn custom_triggers_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        let base_dir = app_handle
            .path()
            .app_data_dir()
            .or_else(|_| app_handle.path().app_local_data_dir())
            .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;

        let stores_dir = base_dir.join("stores");
        std::fs::create_dir_all(&stores_dir)
            .map_err(|e| format!("Failed to create {}: {}", stores_dir.display(), e))?;
        Ok(stores_dir.join("customTriggers.json"))
    }

    #[tauri::command]
    #[specta::specta]
    pub fn read_custom_triggers(app_handle: tauri::AppHandle) -> Result<String, String> {
        let path = custom_triggers_path(&app_handle)?;
        if !path.exists() {
            return Ok(String::from(
                r#"{"version":2,"audio":{"primaryOutputDeviceId":null,"secondaryOutputDeviceId":null},"groups":[],"triggers":[]}"#,
            ));
        }

        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))
    }

    #[tauri::command]
    #[specta::specta]
    pub fn write_custom_triggers(
        app_handle: tauri::AppHandle,
        payload: String,
    ) -> Result<(), String> {
        let path = custom_triggers_path(&app_handle)?;
        let parsed: serde_json::Value = serde_json::from_str(&payload)
            .map_err(|e| format!("Failed to parse custom triggers payload: {}", e))?;
        let bytes = serde_json::to_vec_pretty(&parsed)
            .map_err(|e| format!("Failed to serialize custom triggers: {}", e))?;
        std::fs::write(&path, bytes)
            .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
        let _ = app_handle.emit("custom-triggers-updated", serde_json::json!({}));
        Ok(())
    }
}

mod packet_settings_commands {
    use super::*;

    #[tauri::command]
    #[specta::specta]
    pub fn save_packet_capture_settings(
        method: String,
        npcap_device: String,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        let app_data_dirs = [
            app_handle.path().app_data_dir(),
            app_handle.path().app_local_data_dir(),
        ];
        let mut last_err = None;

        for dir in app_data_dirs.into_iter().flatten() {
            let target_dir = dir.join("stores");
            if let Err(e) = std::fs::create_dir_all(&target_dir) {
                last_err = Some(format!("create_dir_all {}: {}", target_dir.display(), e));
                continue;
            }
            let path = target_dir.join("packetCapture.json");
            let payload = json!({
                "method": method,
                "npcapDevice": npcap_device,
            });
            match std::fs::write(
                &path,
                serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?,
            ) {
                Ok(_) => {
                    info!("Saved packet capture config to {}", path.display());
                    return Ok(());
                }
                Err(e) => last_err = Some(format!("write {}: {}", path.display(), e)),
            }
        }

        Err(last_err.unwrap_or_else(|| "Failed to save packet capture config".to_string()))
    }
}

mod debug_commands {
    use super::*;

    #[tauri::command]
    #[specta::specta]
    pub fn read_event_logger_buffer() -> crate::live::event_logger::EventLoggerBatchPayload {
        crate::live::event_logger::EventLoggerBatchPayload {
            entries: crate::live::event_logger::get_logger_buffer_entries(),
        }
    }

    #[tauri::command]
    #[specta::specta]
    pub fn clear_event_logger_buffer() {
        crate::live::event_logger::clear_logger_buffer_entries();
    }

    #[tauri::command]
    #[specta::specta]
    pub fn show_event_logger_window(
        app_handle: tauri::AppHandle,
        always_on_top: Option<bool>,
    ) -> Result<(), String> {
        let Some(window) = app_handle.get_webview_window(WINDOW_EVENT_LOGGER_LABEL) else {
            return Err("Event logger window not found".to_string());
        };

        if let Some(value) = always_on_top {
            let _ = window.set_always_on_top(value);
        }
        let _ = window.unminimize();
        window
            .show()
            .map_err(|e| format!("Failed to show event logger window: {}", e))?;
        let _ = window.set_focus();
        Ok(())
    }

    #[tauri::command]
    #[specta::specta]
    pub fn hide_event_logger_window(app_handle: tauri::AppHandle) -> Result<(), String> {
        let Some(window) = app_handle.get_webview_window(WINDOW_EVENT_LOGGER_LABEL) else {
            return Err("Event logger window not found".to_string());
        };
        window
            .hide()
            .map_err(|e| format!("Failed to hide event logger window: {}", e))?;
        Ok(())
    }

    #[tauri::command]
    #[specta::specta]
    pub fn toggle_event_logger_window(
        app_handle: tauri::AppHandle,
        always_on_top: Option<bool>,
    ) -> Result<bool, String> {
        let Some(window) = app_handle.get_webview_window(WINDOW_EVENT_LOGGER_LABEL) else {
            return Err("Event logger window not found".to_string());
        };

        let visible = crate::live::event_logger::logger_window_visible(&app_handle);
        if visible {
            window
                .hide()
                .map_err(|e| format!("Failed to hide event logger window: {}", e))?;
            return Ok(false);
        }

        if let Some(value) = always_on_top {
            let _ = window.set_always_on_top(value);
        }
        let _ = window.unminimize();
        window
            .show()
            .map_err(|e| format!("Failed to show event logger window: {}", e))?;
        let _ = window.set_focus();
        Ok(true)
    }

    #[tauri::command]
    #[specta::specta]
    pub fn set_event_logger_window_always_on_top(
        app_handle: tauri::AppHandle,
        always_on_top: bool,
    ) -> Result<(), String> {
        let Some(window) = app_handle.get_webview_window(WINDOW_EVENT_LOGGER_LABEL) else {
            return Err("Event logger window not found".to_string());
        };
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| format!("Failed to update event logger always-on-top: {}", e))?;
        Ok(())
    }

    #[tauri::command]
    #[specta::specta]
    pub fn get_event_logger_session_directory(
        app_handle: tauri::AppHandle,
    ) -> Result<crate::live::event_logger::EventLoggerSessionDirectoryPayload, String> {
        crate::live::event_logger::get_event_logger_session_directory_payload(&app_handle)
    }

    #[tauri::command]
    #[specta::specta]
    pub fn set_event_logger_save_directory(
        app_handle: tauri::AppHandle,
        directory: Option<String>,
    ) -> Result<crate::live::event_logger::EventLoggerSessionDirectoryPayload, String> {
        crate::live::event_logger::set_event_logger_session_directory(&app_handle, directory)
    }

    #[tauri::command]
    #[specta::specta]
    pub fn get_event_logger_file_storage_settings(
        app_handle: tauri::AppHandle,
    ) -> Result<crate::live::event_logger::EventLoggerFileStoragePayload, String> {
        crate::live::event_logger::get_event_logger_file_storage_payload(&app_handle)
    }

    #[tauri::command]
    #[specta::specta]
    pub fn set_event_logger_file_storage_settings(
        app_handle: tauri::AppHandle,
        store_log_files: bool,
        include_repeated_snapshot_rows: bool,
        delete_older_than_days: Option<u32>,
        capture_census_enabled: bool,
        attribution_census_enabled: bool,
    ) -> Result<crate::live::event_logger::EventLoggerFileStoragePayload, String> {
        crate::live::event_logger::set_event_logger_file_storage_settings(
            &app_handle,
            store_log_files,
            include_repeated_snapshot_rows,
            delete_older_than_days,
            capture_census_enabled,
            attribution_census_enabled,
        )
    }

    #[tauri::command]
    #[specta::specta]
    pub fn export_event_logger_session(
        app_handle: tauri::AppHandle,
    ) -> Result<Option<String>, String> {
        let file_storage =
            crate::live::event_logger::get_event_logger_file_storage_payload(&app_handle)?;
        if !file_storage.store_log_files {
            return Err("Enable Store Log Files before exporting an event log.".to_string());
        }

        crate::live::event_logger::flush_current_session_to_file(
            &app_handle,
            "manual_export",
            crate::live::event_logger::EventLoggerSessionContext::default(),
        )
        .map(|path| path.map(|path| path.display().to_string()))
    }

    #[tauri::command]
    #[specta::specta]
    pub fn open_event_logger_session_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
        let session_dir = crate::live::event_logger::resolve_event_logger_session_dir(&app_handle)?;
        std::fs::create_dir_all(&session_dir).map_err(|e| {
            format!(
                "Failed to create session log dir {}: {}",
                session_dir.display(),
                e
            )
        })?;

        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&session_dir)
                .spawn()
                .map_err(|e| format!("Failed to open session log dir: {}", e))?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new("xdg-open")
                .arg(&session_dir)
                .spawn()
                .map_err(|e| format!("Failed to open session log dir: {}", e))?;
        }

        Ok(())
    }

    #[tauri::command]
    #[specta::specta]
    pub fn open_log_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
        let log_dir = app_handle
            .path()
            .app_log_dir()
            .map_err(|e| format!("Failed to get log dir: {}", e))?;

        if !log_dir.exists() {
            return Err("Log directory does not exist".to_string());
        }

        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&log_dir)
                .spawn()
                .map_err(|e| format!("Failed to open log dir: {}", e))?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new("xdg-open")
                .arg(&log_dir)
                .spawn()
                .map_err(|e| format!("Failed to open log dir: {}", e))?;
        }

        Ok(())
    }

    /// Creates a debug ZIP containing the most recent application log file and returns the path.
    ///
    /// If `destination_path` is provided, the ZIP is written there. Otherwise it is created
    /// in the app log directory.
    #[tauri::command]
    #[specta::specta]
    pub fn create_diagnostics_bundle(
        app_handle: tauri::AppHandle,
        destination_path: Option<String>,
    ) -> Result<String, String> {
        crate::create_diagnostics_bundle(&app_handle, destination_path)
    }
}

/// Starts the WinDivert driver.
///
/// This function executes a shell command to create and start the WinDivert driver service.
#[allow(dead_code)]
fn start_windivert() {
    // Run the command silently (no console window) on Windows. On other platforms, just
    // redirect stdio to null so nothing is printed.
    let mut cmd = Command::new("sc");
    cmd.args([
        "create",
        "windivert",
        "type=",
        "kernel",
        "binPath=",
        "WinDivert64.sys",
        "start=",
        "demand",
    ]);
    let status = run_command_silently(&mut cmd);
    if status.is_ok_and(|status| status.success()) {
        info!("started driver");
    } else {
        warn!("could not execute command to start driver");
    }
}

fn windivert_service_exists() -> bool {
    let mut cmd = Command::new("sc");
    cmd.args(["query", "windivert"]);
    run_command_silently(&mut cmd).is_ok_and(|status| status.success())
}

/// Stops the WinDivert driver.
///
/// This function executes a shell command to stop the WinDivert driver service.
fn stop_windivert() {
    if !windivert_service_exists() {
        info!("WinDivert driver service not installed; skipping stop");
        return;
    }

    let mut cmd = Command::new("sc");
    cmd.args(["stop", "windivert"]);
    let status = run_command_silently(&mut cmd);
    if status.is_ok_and(|status| status.success()) {
        info!("stopped driver");
    } else {
        info!("could not stop WinDivert driver; it may already be stopped");
    }
}

/// Removes the WinDivert driver.
///
/// This function executes a shell command to delete the WinDivert driver service.
fn remove_windivert() {
    if !windivert_service_exists() {
        info!("WinDivert driver service not installed; skipping delete");
        return;
    }

    let mut cmd = Command::new("sc");
    cmd.args(["delete", "windivert"]);
    let status = run_command_silently(&mut cmd);
    if status.is_ok_and(|status| status.success()) {
        info!("deleted driver");
    } else {
        warn!("could not execute command to delete driver");
    }
}

/// Helper to unload and remove the WinDivert driver.
///
/// On Windows this attempts to stop and delete the service. On other
/// platforms this is a no-op.
fn unload_and_remove_windivert() {
    #[cfg(windows)]
    {
        // Try to stop and remove the driver; these helpers already log
        // warnings on failure so we don't need to handle the results here.
        stop_windivert();
        remove_windivert();
    }
    #[cfg(not(windows))]
    {
        // no-op on non-windows platforms
    }
}

/// Helper to run a prepared Command with stdio redirected to null and (on Windows)
/// with the CREATE_NO_WINDOW flag so no console window appears.
fn run_command_silently(cmd: &mut Command) -> std::io::Result<std::process::ExitStatus> {
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW = 0x08000000
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .status()
    }

    #[cfg(not(windows))]
    {
        cmd.stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .status()
    }
}

// Updater helper: checks for updates and emits an event for frontend reminder.
// This runs only on Windows builds (guarded where it is invoked).
#[cfg(windows)]
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
const GLOBAL_UPDATE_DOWNLOAD_MARKER: &str = "github.com/donneeee/resonance-logs-global";

#[cfg(windows)]
fn is_global_update_download_url(download_url: &str) -> bool {
    download_url
        .to_ascii_lowercase()
        .contains(GLOBAL_UPDATE_DOWNLOAD_MARKER)
}

#[cfg(windows)]
async fn check_for_updates(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    // Check only: frontend is responsible for reminding users to download manually.
    if let Some(update) = app.updater()?.check().await? {
        info!("Update available: {}", update.version);
        let download_url = update.download_url.to_string();
        if !is_global_update_download_url(&download_url) {
            warn!(
                "Ignoring update from unexpected release feed: {}",
                download_url
            );
            return Ok(());
        }
        let payload = json!({
            "version": update.version.to_string(),
            "body": update.body.unwrap_or_default(),
            "downloadUrl": download_url,
        });
        if let Err(e) = app.emit("update-available", payload) {
            warn!("Failed to emit update-available event: {}", e);
        }
    } else {
        info!("No update available");
    }
    Ok(())
}

/// Sets up the logging for the application.
///
/// This function configures the logging targets and settings.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
///
/// # Returns
///
/// * `tauri::Result<()>` - An empty result indicating success or failure.
fn setup_logs(app: &tauri::AppHandle) -> Result<(), String> {
    let res = LOGGING_INIT.get_or_init(|| init_logging(app));
    res.clone()
}

fn init_logging(app: &tauri::AppHandle) -> Result<(), String> {
    // Bridge existing `log::info!` calls into tracing so we can gradually introduce spans
    // without rewriting the entire codebase.
    let _ = tracing_log::LogTracer::init();

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("failed to resolve app_log_dir: {e}"))?;
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("failed to create log dir {}: {e}", log_dir.display()))?;

    // Ensure we don't accumulate infinite logs on disk.
    cleanup_old_logs(&log_dir, 10).ok();

    let version = app.package_info().version.to_string();
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let file_name = format!("{LOG_FILE_PREFIX}{version}_{timestamp}.log");

    let file_appender = tracing_appender::rolling::never(&log_dir, &file_name);
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
    let _ = LOGGING_GUARD.set(guard);

    let default_filter = if cfg!(debug_assertions) {
        // Debug: default to info unless user overrides.
        "info"
    } else {
        // Release: warn+error globally, but keep key lifecycle info for diagnostics.
        "warn,app::startup=info,app::logging=info,app::db=info,app::capture=info,app::live=info,app::sync=info"
    };

    let filter = tracing_subscriber::EnvFilter::try_from_env("RES_LOG")
        .or_else(|_| tracing_subscriber::EnvFilter::try_from_default_env())
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(default_filter));

    use tracing_subscriber::fmt::format::FmtSpan;
    use tracing_subscriber::prelude::*;

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(file_writer)
        .with_ansi(false)
        .with_target(true)
        .with_span_events(FmtSpan::CLOSE);

    let subscriber = tracing_subscriber::registry().with(filter).with(file_layer);

    #[cfg(debug_assertions)]
    let subscriber = subscriber.with(
        tracing_subscriber::fmt::layer()
            .with_writer(std::io::stdout)
            .with_ansi(true)
            .with_target(true)
            .with_span_events(FmtSpan::CLOSE),
    );

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| format!("failed to set global tracing subscriber: {e}"))?;

    tracing::info!(
        target: "app::logging",
        "logging initialized dir={} file={} (override via RES_LOG/RUST_LOG)",
        log_dir.display(),
        file_name
    );
    Ok(())
}

fn cleanup_old_logs(log_dir: &Path, keep: usize) -> Result<(), String> {
    let mut entries: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();

    let rd =
        std::fs::read_dir(log_dir).map_err(|e| format!("read_dir {}: {e}", log_dir.display()))?;

    for entry in rd {
        let entry = entry.map_err(|e| format!("read_dir entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

        // Only prune our own log files. Keep crash dumps.
        if (!file_name.starts_with(LOG_FILE_PREFIX)
            && !file_name.starts_with(LEGACY_LOG_FILE_PREFIX))
            || file_name.contains("crash_dump")
        {
            continue;
        }

        let meta =
            std::fs::metadata(&path).map_err(|e| format!("metadata {}: {e}", path.display()))?;
        let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        entries.push((modified, path));
    }

    // Newest first.
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in entries.into_iter().skip(keep) {
        let _ = std::fs::remove_file(&path);
    }

    Ok(())
}

fn create_diagnostics_bundle(
    app_handle: &tauri::AppHandle,
    destination_path: Option<String>,
) -> Result<String, String> {
    use std::io::Write;
    use zip::write::FileOptions;

    let log_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log dir: {e}"))?;
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log dir {}: {e}", log_dir.display()))?;

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let bundle_name = format!("debug_{timestamp}.zip");

    let mut bundle_path = destination_path
        .map(PathBuf::from)
        .unwrap_or_else(|| log_dir.join(&bundle_name));
    if bundle_path.extension().is_none() {
        bundle_path.set_extension("zip");
    }
    if let Some(parent) = bundle_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
    }

    let file = std::fs::File::create(&bundle_path)
        .map_err(|e| format!("Failed to create {}: {e}", bundle_path.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Include only the most recent application log file.
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in
        std::fs::read_dir(&log_dir).map_err(|e| format!("read_dir {}: {e}", log_dir.display()))?
    {
        let entry = entry.map_err(|e| format!("read_dir entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if (!name.starts_with(LOG_FILE_PREFIX) && !name.starts_with(LEGACY_LOG_FILE_PREFIX))
            || !name.ends_with(".log")
        {
            continue;
        }
        let meta =
            std::fs::metadata(&path).map_err(|e| format!("metadata {}: {e}", path.display()))?;
        let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        files.push((modified, path));
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));

    let Some((_, path)) = files.into_iter().next() else {
        return Err("No application log file found in log directory".to_string());
    };

    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("resonance-logs-global.log");

    // Avoid zipping extremely large files.
    let meta = std::fs::metadata(&path).map_err(|e| format!("metadata {}: {e}", path.display()))?;
    const MAX_BYTES: u64 = 25 * 1024 * 1024;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "Log file too large to include in bundle ({} bytes; limit {} bytes)",
            meta.len(),
            MAX_BYTES
        ));
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    zip.start_file(name, opts)
        .map_err(|e| format!("zip: start file {name}: {e}"))?;
    zip.write_all(&bytes)
        .map_err(|e| format!("zip: write file {name}: {e}"))?;

    zip.finish().map_err(|e| format!("zip: finish: {e}"))?;
    Ok(bundle_path.display().to_string())
}

/// Sets up the system tray icon and menu.
///
/// This function creates the tray icon, defines its menu, and sets up event handlers.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
///
/// # Returns
///
/// * `tauri::Result<()>` - An empty result indicating success or failure.
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    fn show_window_and_disable_clickthrough(window: &tauri::WebviewWindow) {
        if let Err(e) = window.show() {
            warn!("failed to show window {}: {}", window.label(), e);
        }
        if let Err(e) = window.unminimize() {
            warn!("failed to unminimize window {}: {}", window.label(), e);
        }
        if let Err(e) = window.set_focus() {
            warn!("failed to focus window {}: {}", window.label(), e);
        }
        // Always disable clickthrough when showing window from tray
        if window.label() == WINDOW_LIVE_LABEL {
            if let Err(e) = window.set_ignore_cursor_events(false) {
                warn!(
                    "failed to set ignore_cursor_events for {}: {}",
                    window.label(),
                    e
                );
            }
        }
    }

    let menu = MenuBuilder::new(app)
        .text("show-settings", "Show Settings")
        .separator()
        .text("show-live", "Show Live Meter")
        .text("reset", "Reset Window")
        .text("clickthrough", "Disable Clickthrough")
        .separator()
        .text("quit", "Quit")
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|tray_app, event| match event.id.as_ref() {
            "show-settings" => {
                let tray_app_handle = tray_app.app_handle();
                let Some(main_meter_window) = tray_app_handle.get_webview_window(WINDOW_MAIN_LABEL)
                else {
                    return;
                };
                show_window_and_disable_clickthrough(&main_meter_window);
            }
            "show-live" => {
                let tray_app_handle = tray_app.app_handle();
                let Some(live_meter_window) = tray_app_handle.get_webview_window(WINDOW_LIVE_LABEL)
                else {
                    return;
                };
                show_window_and_disable_clickthrough(&live_meter_window);
            }
            "reset" => {
                let Some(live_meter_window) = tray_app.get_webview_window(WINDOW_LIVE_LABEL) else {
                    return;
                };
                if let Err(e) = live_meter_window.set_size(Size::Logical(LogicalSize {
                    width: 500.0,
                    height: 350.0,
                })) {
                    warn!("failed to resize live window: {}", e);
                }
                if let Err(e) = live_meter_window
                    .set_position(Position::Logical(LogicalPosition { x: 100.0, y: 100.0 }))
                {
                    warn!("failed to set position for live window: {}", e);
                }
                if let Err(e) = live_meter_window.show() {
                    warn!("failed to show live window: {}", e);
                }
                if let Err(e) = live_meter_window.unminimize() {
                    warn!("failed to unminimize live window: {}", e);
                }
                if let Err(e) = live_meter_window.set_focus() {
                    warn!("failed to focus live window: {}", e);
                }
                if let Err(e) = live_meter_window.set_ignore_cursor_events(false) {
                    warn!("failed to set ignore_cursor_events for live window: {}", e);
                }
            }
            "clickthrough" => {
                let Some(live_meter_window) = tray_app.get_webview_window(WINDOW_LIVE_LABEL) else {
                    return;
                };
                if let Err(e) = live_meter_window.set_ignore_cursor_events(false) {
                    warn!("failed to set ignore_cursor_events for live window: {}", e);
                }
            }
            "quit" => {
                stop_windivert();
                tray_app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // Show and focus the main window when the tray is clicked
                let app = tray.app_handle();
                let Some(main_window) = app.get_webview_window(WINDOW_MAIN_LABEL) else {
                    return;
                };
                show_window_and_disable_clickthrough(&main_window);
            }
        })
        .build(app)?;
    Ok(())
}

/// Handles window events.
///
/// This function is called whenever a window event occurs.
///
/// # Arguments
///
/// * `window` - The window that received the event.
/// * `event` - The event that occurred.
fn on_window_event_fn(window: &Window, event: &WindowEvent) {
    match event {
        // when you click the X button to close a window
        WindowEvent::CloseRequested { api, .. } => {
            if window.label() == WINDOW_MAIN_LABEL {
                if HIDE_MAIN_WINDOW_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        warn!("failed to hide main window to tray: {}", e);
                    }
                } else {
                    // Main window close = exit entire app
                    stop_windivert();
                    window.app_handle().exit(0);
                }
            } else {
                // Other windows (like live) just hide
                api.prevent_close();
                if let Err(e) = window.hide() {
                    warn!("failed to hide window {}: {}", window.label(), e);
                }
            }
        }
        WindowEvent::Focused(focused) if !focused => {
            if let Err(e) = window.app_handle().save_window_state(StateFlags::all()) {
                warn!("failed to save window state for {}: {}", window.label(), e);
            }
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let source_label = window.label();
            let target_label = if source_label == WINDOW_GAME_OVERLAY_LABEL {
                Some(WINDOW_MONSTER_OVERLAY_LABEL)
            } else if source_label == WINDOW_MONSTER_OVERLAY_LABEL {
                Some(WINDOW_GAME_OVERLAY_LABEL)
            } else {
                None
            };

            if let Some(target_label) = target_label {
                if let Err(e) =
                    mirror_overlay_window_bounds(&window.app_handle(), source_label, target_label)
                {
                    warn!(
                        "failed to mirror overlay window bounds from {} to {}: {}",
                        source_label, target_label, e
                    );
                }
            }
        }
        _ => {}
    }
}
