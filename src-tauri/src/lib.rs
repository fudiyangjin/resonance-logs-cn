mod bptimer;
mod buff_icons;
mod build_app;
mod hp_report;
mod live;
pub mod module_optimizer;
mod packets;
mod team_share;
#[cfg(windows)]
mod titlebar_guard;
mod updater;
pub mod voice;

use crate::build_app::build_and_run;
use log::{info, warn};
use specta_typescript::{BigIntExportBehavior, Typescript};
use std::process::{Command, Stdio};

use std::path::{Path, PathBuf};
use std::sync::{
    OnceLock,
    atomic::{AtomicBool, Ordering},
};

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Position, Size, Window,
    WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};
use tauri_specta::{Builder, collect_commands};
mod database;
mod hud_layout;
use serde_json::json;

/// The label for the live window.
pub const WINDOW_LIVE_LABEL: &str = "live";
/// The label for the main window.
pub const WINDOW_MAIN_LABEL: &str = "main";
/// The label for the unified HUD overlay window.
pub const WINDOW_HUD_OVERLAY_LABEL: &str = "hud-overlay";
const LIVE_CLICKTHROUGH_CHANGED_EVENT: &str = "live-clickthrough-changed";
const LIVE_PULL_GATE_EVENT: &str = "live-pull-gate";

/// Keeps the non-blocking tracing appender worker alive for the lifetime of the process.
/// If this guard is dropped, file logging may stop flushing.
static LOGGING_GUARD: OnceLock<tracing_appender::non_blocking::WorkerGuard> = OnceLock::new();
/// Ensures we only initialize global logging once.
static LOGGING_INIT: OnceLock<Result<(), String>> = OnceLock::new();

/// Whether closing the main window exits the app instead of hiding it to the tray.
///
/// The value is loaded once at startup, so setting changes apply on the next launch.
#[derive(Default)]
pub(crate) struct ExitOnClose(AtomicBool);

/// The main entry point for the application logic.
///
/// This function sets up and runs the Tauri application.
fn api_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        updater::get_update_status,
        updater::check_for_updates,
        updater::start_update,
        live::ipc::commands::pull_live_window_frame,
        live::ipc::commands::pull_hud_frame,
        live::ipc::commands::set_live_pull_active,
        live::ipc::commands::get_live_status,
        live::ipc::commands::get_live_scene,
        hud_layout::migrate_hud_layout,
        live::ipc::commands::enable_blur,
        live::ipc::commands::disable_blur,
        live::ipc::commands::reset_encounter,
        live::ipc::commands::toggle_pause_encounter,
        live::ipc::commands::start_training_dummy,
        live::ipc::commands::stop_training_dummy,
        live::ipc::commands::save_and_apply_monitor_runtime_snapshot,
        live::ipc::commands::save_and_apply_voice_runtime_snapshot,
        team_share::commands::get_team_share_settings,
        team_share::commands::set_team_share_enabled,
        team_share::commands::get_team_share_status,
        hp_report::commands::get_hp_report_settings,
        hp_report::commands::set_hp_report_enabled,
        hp_report::commands::get_hp_report_status,
        database::commands::get_unique_scene_ids,
        database::commands::get_unique_boss_monster_ids,
        database::commands::get_player_names_filtered,
        database::commands::search_history_players,
        database::commands::get_recent_encounters_filtered,
        database::commands::get_encounter_detail,
        database::commands::get_encounter_range,
        database::commands::delete_encounter,
        database::commands::delete_encounters,
        database::commands::toggle_favorite_encounter,
        database::commands::update_encounter_note,
        database::commands::get_history_retention_limit,
        database::commands::save_history_retention_limit,
        packet_settings_commands::save_packet_capture_settings,
        settings_backup_commands::backup_settings_stores,
        settings_backup_commands::backup_failed_monitoring_stores,
        loadout_commands::export_loadout,
        buff_icons::commands::buff_icon_dir,
        buff_icons::commands::import_buff_icon,
        buff_icons::commands::delete_buff_icon,
        packets::npcap::get_network_devices,
        packets::npcap::check_npcap_status,
        debug_commands::open_log_dir,
        debug_commands::create_diagnostics_bundle,
        debug_commands::frontend_log,
        module_optimizer::commands::check_gpu_support,
        module_optimizer::commands::get_latest_modules,
        module_optimizer::commands::optimize_latest_modules,
        voice::commands::voice_get_status,
        voice::commands::voice_install_model,
        voice::commands::voice_cancel_model_download,
        voice::commands::voice_manual_import_model,
        voice::commands::voice_remove_model,
        voice::commands::voice_verify_model,
        voice::commands::voice_inspect_finetuned_package,
        voice::commands::voice_set_finetuned_voice,
        voice::commands::voice_relink_finetuned_voice,
        voice::commands::voice_remove_finetuned_voice,
        voice::commands::voice_delete_profile,
        voice::commands::voice_create_phrase,
        voice::commands::voice_update_phrase,
        voice::commands::voice_delete_phrase,
        voice::commands::voice_generate,
        voice::commands::voice_cancel_generation,
        voice::commands::voice_preview_asset,
        voice::commands::voice_test_trigger,
        voice::commands::voice_enqueue_phrase,
        voice::commands::voice_enqueue_phrase_by_name,
        voice::commands::voice_upsert_phrase,
        voice::commands::voice_import_phrase_audio,
        voice::commands::voice_stop_playback,
    ])
}

#[cfg(debug_assertions)]
fn normalize_generated_typescript(path: &Path) -> std::io::Result<()> {
    let source = std::fs::read_to_string(path)?;
    let mut normalized = String::with_capacity(source.len());
    for line in source.lines() {
        normalized.push_str(line.trim_end());
        normalized.push('\n');
    }
    std::fs::write(path, normalized)
}

#[cfg(debug_assertions)]
pub fn export_typescript_bindings() -> Result<(), specta_typescript::ExportError> {
    let output = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/bindings.ts");
    api_builder().export(
        Typescript::new()
            .header("// This file is generated by `npm run bindings`.\n// @ts-nocheck\n")
            .bigint(BigIntExportBehavior::Number)
            .formatter(normalize_generated_typescript),
        output,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = api_builder();

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    export_typescript_bindings().expect("Failed to export typescript bindings");

    // Command-consumed state must be registered on the Builder: config windows
    // start loading their pages before `setup` runs, so state registered inside
    // `setup` can lose the race against early invokes (observed in packaged
    // builds as a rejected live bootstrap that left the window empty).
    let (live_runtime, runtime_commands) = crate::live::runtime_handle::LiveRuntimeHandle::new();
    let publication_cache = crate::live::ipc::publisher::LivePublicationCache::new();
    let (history_writer, history_join) = crate::live::history_writer::HistoryWriterHandle::start()
        .expect("failed to start history writer");
    let (team_link, team_net) = crate::live::team_link::channel();
    let (hp_link, hp_net) = crate::live::hp_link::channel();
    let credentials = std::sync::Arc::new(bptimer::Credentials::default());

    let tauri_builder = tauri::Builder::default()
        .manage(live_runtime)
        .manage(publication_cache.clone())
        .manage(history_writer.clone())
        .manage(ExitOnClose::default())
        .manage(updater::UpdateService::default())
        .manage(team_share::TeamShareService::new(
            team_net,
            std::sync::Arc::clone(&credentials),
        ))
        .manage(hp_report::HpReportService::new(
            hp_net,
            std::sync::Arc::clone(&credentials),
        ))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Setup logs as early as possible so we don't lose startup context.
            // If logging fails, fall back to stderr so we still get a breadcrumb.
            if let Err(e) = setup_logs(&app_handle) {
                eprintln!("Failed to setup logs: {e}");
            }

            app.state::<ExitOnClose>()
                .0
                .store(read_exit_on_close(&app_handle), Ordering::Relaxed);

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
            if let Some(hud_window) = app.get_webview_window(WINDOW_HUD_OVERLAY_LABEL) {
                if let Err(error) =
                    hud_window.restore_state(StateFlags::POSITION | StateFlags::SIZE)
                {
                    warn!("failed to restore HUD geometry: {error}");
                }
            }
            stop_windivert();
            remove_windivert();

            // Initialize database and background writer early to avoid startup races where
            // multiple background tasks/commands trigger migrations concurrently.
            if let Err(e) = crate::database::init_db() {
                warn!(target: "app::db", "Failed to initialize database: {}", e);
            }
            let history_limit = crate::database::load_history_retention_limit(&app_handle);
            crate::database::startup_maintenance(history_limit);

            #[cfg(windows)]
            {
                updater::schedule_startup_check(app_handle.clone());
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

            // The main window is the only one that still uses the native
            // caption bar, so it is the only one whose close/minimize/maximize
            // buttons can park the event loop inside win32k's tracking loop
            // when a fullscreen game steals the mouse release. Falling back to
            // the native behaviour is better than refusing to start.
            #[cfg(windows)]
            if let Some(main_window) = app.get_webview_window(WINDOW_MAIN_LABEL) {
                if let Err(error) = titlebar_guard::install(&main_window) {
                    warn!("failed to install the caption guard on the main window: {error}");
                }
            }

            // Voice broadcasting / cloning feature: model, catalog and playback are all
            // owned by this single service, independent of the live capture pipeline.
            match crate::voice::VoiceService::new(app_handle.clone()) {
                Ok(voice_service) => {
                    // Probing the CPU/Vulkan sidecars spawns short-lived
                    // processes and can take a couple of seconds; do it once
                    // in the background at startup so the voice page's first
                    // status load (and the first generation click) hits a
                    // warm cache instead of paying for it there.
                    let warmup_service = voice_service.clone();
                    tauri::async_runtime::spawn(async move {
                        warmup_service.warm_up_backend_probes().await;
                    });
                    // Invariant: command-consumed state belongs on the Builder
                    // (registered before window creation). This one stays in
                    // `setup` only because construction needs an AppHandle, and
                    // voice commands are unreachable until the user opens the
                    // voice page in the main window, long after setup.
                    app.manage(voice_service);
                }
                Err(e) => warn!(target: "app::voice", "failed to initialize VoiceService: {e}"),
            }

            // bptimer.cn clients. The shared token is loaded (and migrated)
            // before either can write its settings.
            credentials.prime(&app_handle);
            // Team cooldown sharing: idle until enabled and in a team.
            app.state::<team_share::TeamShareService>()
                .start(&app_handle);
            // Boss HP reports: idle until a tracked boss is in view.
            app.state::<hp_report::HpReportService>().start(&app_handle);

            // Live Meter
            // https://v2.tauri.app/learn/splashscreen/#start-some-setup-tasks
            tauri::async_runtime::spawn(async move {
                live::live_main::start(
                    app_handle.clone(),
                    runtime_commands,
                    publication_cache,
                    history_writer,
                    history_join,
                    team_link,
                    hp_link,
                )
                .await
            });
            Ok(())
        })
        .on_window_event(on_window_event_fn)
        .plugin(tauri_plugin_clipboard_manager::init()) // used to read/write to the clipboard
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state(WINDOW_HUD_OVERLAY_LABEL)
                .build(),
        ) // used to remember window size/position https://v2.tauri.app/plugin/window-state/
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let Some(main_window) = app.get_webview_window(WINDOW_MAIN_LABEL) else {
                return;
            };
            show_window_and_focus(&main_window);
        })) // used to enforce only 1 instance of the app https://v2.tauri.app/plugin/single-instance/
        .plugin(tauri_plugin_opener::init()) // used to open URLs in the default browser
        .plugin(tauri_plugin_dialog::init()) // used to show save/open dialogs
        .plugin(tauri_plugin_svelte::init()); // used for settings file
    build_and_run(tauri_builder);
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

mod settings_backup_commands {
    use super::*;

    const STORE_DIR_NAME: &str = "tauri-plugin-svelte";
    const MONITORING_STORE_FILES: [&str; 8] = [
        "monitoring.json",
        "monitoring.dev.json",
        "skillMonitor.json",
        "skillMonitor.dev.json",
        "monsterMonitor.json",
        "monsterMonitor.dev.json",
        "loadouts.json",
        "loadouts.dev.json",
    ];

    fn copy_store_files(
        source_dir: &Path,
        destination_dir: &Path,
        include: impl Fn(&str) -> bool,
        skip_existing: bool,
    ) -> Result<usize, String> {
        std::fs::create_dir_all(destination_dir)
            .map_err(|e| format!("create_dir_all {}: {e}", destination_dir.display()))?;
        let entries = std::fs::read_dir(source_dir)
            .map_err(|e| format!("read_dir {}: {e}", source_dir.display()))?;
        let mut copied = 0;
        for entry in entries {
            let entry = entry.map_err(|e| format!("read_dir entry: {e}"))?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !include(file_name) {
                continue;
            }
            let destination = destination_dir.join(file_name);
            if skip_existing && destination.exists() {
                continue;
            }
            std::fs::copy(&path, &destination).map_err(|e| {
                format!("copy {} -> {}: {e}", path.display(), destination.display())
            })?;
            copied += 1;
        }
        Ok(copied)
    }

    fn create_unique_recovery_dir(parent: &Path, stem: &str) -> Result<PathBuf, String> {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {}: {e}", parent.display()))?;
        for suffix in 0_u32.. {
            let directory_name = if suffix == 0 {
                stem.to_owned()
            } else {
                format!("{stem}-{suffix}")
            };
            let candidate = parent.join(directory_name);
            match std::fs::create_dir(&candidate) {
                Ok(()) => return Ok(candidate),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(format!("create_dir {}: {error}", candidate.display()));
                }
            }
        }
        unreachable!("u32 recovery directory suffixes cannot be exhausted")
    }

    /// Best-effort backup of the persisted settings stores before running a
    /// one-time frontend migration. Copies every RuneStore JSON file into
    /// `tauri-plugin-svelte/backup-v1/` without replacing the first snapshot.
    #[tauri::command]
    #[specta::specta]
    pub fn backup_settings_stores(app_handle: tauri::AppHandle) -> Result<(), String> {
        let app_data_dirs = [
            app_handle.path().app_data_dir(),
            app_handle.path().app_local_data_dir(),
        ];
        let mut any_stores_dir_found = false;
        let mut last_err: Option<String> = None;

        for dir in app_data_dirs.into_iter().flatten() {
            let stores_dir = dir.join(STORE_DIR_NAME);
            if !stores_dir.is_dir() {
                continue;
            }
            any_stores_dir_found = true;

            let backup_dir = stores_dir.join("backup-v1");
            if let Err(error) = copy_store_files(
                &stores_dir,
                &backup_dir,
                |file_name| file_name.ends_with(".json"),
                true,
            ) {
                last_err = Some(error);
            }
        }

        if !any_stores_dir_found {
            info!("no settings stores directory found, nothing to back up");
            return Ok(());
        }

        if let Some(err) = last_err {
            warn!("settings backup completed with errors: {err}");
        } else {
            info!("backed up settings stores before migration");
        }
        Ok(())
    }

    /// Copies only monitoring-related RuneStore files to a timestamped recovery
    /// directory before the frontend destroys the failed stores.
    #[tauri::command]
    #[specta::specta]
    pub fn backup_failed_monitoring_stores(app_handle: tauri::AppHandle) -> Result<String, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("resolve app data directory: {e}"))?;
        let stores_dir = app_data_dir.join(STORE_DIR_NAME);
        std::fs::create_dir_all(&stores_dir)
            .map_err(|e| format!("create_dir_all {}: {e}", stores_dir.display()))?;

        let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S-%3f");
        let recovery_dir =
            create_unique_recovery_dir(&stores_dir.join("recovery"), &timestamp.to_string())?;
        let copied = copy_store_files(
            &stores_dir,
            &recovery_dir,
            |file_name| MONITORING_STORE_FILES.contains(&file_name),
            false,
        )?;
        info!(
            "backed up {copied} failed monitoring store files to {}",
            recovery_dir.display()
        );
        Ok(recovery_dir.to_string_lossy().into_owned())
    }
}

mod loadout_commands {
    use super::*;

    /// Writes a loadout export (JSON) to a user-chosen path.
    ///
    /// The frontend picks `destination_path` via the dialog plugin's `save()`
    /// picker; a `.json` extension is appended when the user omitted it.
    #[tauri::command]
    #[specta::specta]
    pub fn export_loadout(destination_path: String, contents: String) -> Result<(), String> {
        let mut path = PathBuf::from(&destination_path);
        if path.extension().is_none() {
            path.set_extension("json");
        }
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create_dir_all {}: {}", parent.display(), e))?;
        }
        std::fs::write(&path, contents).map_err(|e| format!("write {}: {}", path.display(), e))?;
        info!("exported loadout to {}", path.display());
        Ok(())
    }
}

/// Stops the WinDivert driver.
///
/// This function executes a shell command to stop the WinDivert driver service.
fn stop_windivert() {
    let mut cmd = Command::new("sc");
    cmd.args(["stop", "windivert"]);
    let status = run_command_silently(&mut cmd);
    if status.is_ok_and(|status| status.success()) {
        info!("stopped driver");
    } else {
        warn!("could not execute command to stop driver");
    }
}

/// Removes the WinDivert driver.
///
/// This function executes a shell command to delete the WinDivert driver service.
fn remove_windivert() {
    let mut cmd = Command::new("sc");
    cmd.args(["delete", "windivert", "start=", "demand"]);
    let status = run_command_silently(&mut cmd);
    if status.is_ok_and(|status| status.success()) {
        info!("deleted driver");
    } else {
        warn!("could not execute command to delete driver");
    }
}

/// Helper to unload and remove the WinDivert driver.
fn unload_and_remove_windivert() {
    #[cfg(windows)]
    {
        stop_windivert();
        remove_windivert();
    }
}

/// Runs a prepared command with stdio redirected to null and no console window on Windows.
fn run_command_silently(cmd: &mut Command) -> std::io::Result<std::process::ExitStatus> {
    #[cfg(windows)]
    {
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

mod debug_commands {
    use super::*;

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
            // For other OSs, we can use 'open' (macOS) or 'xdg-open' (Linux)
            // But since this is a Windows-focused request, I'll essentially leave it as a no-op or specific to Windows for now based on user context.
            // But good to have a fallback or error.
            // Using `open` crate or tauri's `open` plugin would be better but let's stick to simple Command for now as requested.
            // Actually, tauri_plugin_opener is initialized in lib.rs, so we might utilize that if we want, but 'explorer' is specific.
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

    /// Diagnostic bridge that lets the frontend write into the same rotating
    /// log file. Uses the `app::live` target so release builds keep these
    /// records (the release filter keeps `app::live` at info+).
    #[tauri::command]
    #[specta::specta]
    pub fn frontend_log(level: String, message: String) {
        match level.as_str() {
            "warn" => warn!(target: "app::live", "[frontend] {message}"),
            "error" => log::error!(target: "app::live", "[frontend] {message}"),
            _ => info!(target: "app::live", "[frontend] {message}"),
        }
    }
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
    let file_name = format!("resonance-logs-cn_v{version}_{timestamp}.log");

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
        if !file_name.starts_with("resonance-logs-cn_v") || file_name.contains("crash_dump") {
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
        if !name.starts_with("resonance-logs-cn_v") || !name.ends_with(".log") {
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
        .unwrap_or("resonance-logs-cn.log");

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

fn show_window_and_focus(window: &tauri::WebviewWindow) {
    if let Err(e) = window.show() {
        warn!("failed to show window {}: {}", window.label(), e);
    }
    if let Err(e) = window.unminimize() {
        warn!("failed to unminimize window {}: {}", window.label(), e);
    }
    if is_live_pull_window(window.label()) {
        set_live_pull_window_active(window.app_handle(), window.label(), true);
    }
    if let Err(e) = window.set_focus() {
        warn!("failed to focus window {}: {}", window.label(), e);
    }
}

fn center_window_on_primary_monitor(window: &tauri::WebviewWindow) {
    let label = window.label();
    let monitor = match window.primary_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => {
            warn!("no primary monitor found while centering {}", label);
            return;
        }
        Err(e) => {
            warn!("failed to query primary monitor for {}: {}", label, e);
            return;
        }
    };
    let win_size = match window.outer_size() {
        Ok(size) => size,
        Err(e) => {
            warn!("failed to read size of {}: {}", label, e);
            return;
        }
    };

    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let x = monitor_pos.x + (monitor_size.width as i32 - win_size.width as i32) / 2;
    let y = monitor_pos.y + (monitor_size.height as i32 - win_size.height as i32) / 2;

    if let Err(e) = window.set_position(Position::Physical(PhysicalPosition { x, y })) {
        warn!("failed to center {}: {}", label, e);
    }
}

fn disable_live_clickthrough(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    if let Err(e) = window.set_ignore_cursor_events(false) {
        warn!(
            "failed to set ignore_cursor_events for {}: {}",
            window.label(),
            e
        );
        return;
    }

    if let Err(e) = app.emit(LIVE_CLICKTHROUGH_CHANGED_EVENT, false) {
        warn!("failed to emit {}: {}", LIVE_CLICKTHROUGH_CHANGED_EVENT, e);
    }
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
    let menu = MenuBuilder::new(app)
        .text("show-settings", "Show Settings")
        .separator()
        .text("show-live", "Show Live Meter")
        .text("reset", "Reset All Windows")
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
                show_window_and_focus(&main_meter_window);
            }
            "show-live" => {
                let tray_app_handle = tray_app.app_handle();
                let Some(live_meter_window) = tray_app_handle.get_webview_window(WINDOW_LIVE_LABEL)
                else {
                    return;
                };
                show_window_and_focus(&live_meter_window);
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
                show_window_and_focus(&live_meter_window);

                if let Some(window) = tray_app.get_webview_window(WINDOW_HUD_OVERLAY_LABEL) {
                    center_window_on_primary_monitor(&window);
                }
            }
            "clickthrough" => {
                let Some(live_meter_window) = tray_app.get_webview_window(WINDOW_LIVE_LABEL) else {
                    return;
                };
                disable_live_clickthrough(tray_app, &live_meter_window);
            }
            "quit" => {
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
                show_window_and_focus(&main_window);
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
            if window.label() == WINDOW_MAIN_LABEL
                && window
                    .app_handle()
                    .try_state::<ExitOnClose>()
                    .is_some_and(|setting| setting.0.load(Ordering::Relaxed))
            {
                window.app_handle().exit(0);
                return;
            }
            api.prevent_close();
            if is_live_pull_window(window.label()) {
                set_live_pull_window_active(window.app_handle(), window.label(), false);
            }
            if let Err(e) = window.hide() {
                warn!("failed to hide window {}: {}", window.label(), e);
            }
        }
        WindowEvent::Resized(_) if is_live_pull_window(window.label()) => {
            let active =
                window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
            set_live_pull_window_active(window.app_handle(), window.label(), active);
        }
        WindowEvent::Focused(focused) if !focused => {
            if let Err(e) = window.app_handle().save_window_state(StateFlags::all()) {
                warn!("failed to save window state for {}: {}", window.label(), e);
            }
        }
        _ => {}
    }
}

fn read_exit_on_close(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_svelte::ManagerExt as _;

    app.with_store("accessibility", |store| {
        store.get::<bool>("exitOnClose").unwrap_or(false)
    })
    .unwrap_or_else(|error| {
        warn!("failed to read exitOnClose setting, using tray behavior: {error}");
        false
    })
}

fn is_live_pull_window(label: &str) -> bool {
    crate::live::ipc::models::LivePullWindow::from_label(label).is_some()
}

fn set_live_pull_window_active(app: &tauri::AppHandle, label: &str, active: bool) {
    use crate::live::ipc::models::LivePullGatePayload;

    let Some(surface) = crate::live::ipc::models::LivePullWindow::from_label(label) else {
        return;
    };
    let mut changed = true;
    if let Some(cache) = app.try_state::<crate::live::ipc::publisher::LivePublicationCache>() {
        changed = cache.set_window_active(surface, active);
    }
    if !changed {
        return;
    }
    let Some(window) = app.get_webview_window(label) else {
        return;
    };

    if let Err(error) = window.emit_to(
        label,
        LIVE_PULL_GATE_EVENT,
        LivePullGatePayload {
            window: surface,
            active,
        },
    ) {
        warn!(
            "failed to set live pull gate for window {} active={}: {}",
            label, active, error
        );
    }
}
