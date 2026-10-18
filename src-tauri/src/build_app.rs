use crate::stop_windivert;
use crate::voice::VoiceService;
use log::info;
use tauri::Builder as TauriBuilder;
use tauri::Manager;
use tauri::generate_context;

// https://discord.com/channels/616186924390023171/1400593249063927960/1400593249063927960
// RustRover + Tauri does not play nicely if this is not extracted into its own file.
pub fn build_and_run(builder: TauriBuilder<tauri::Wry>) {
    builder
        .build(generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Leave the team room first so teammates see us go right away.
                if let Some(team_share) = app_handle.try_state::<crate::team_share::TeamShareService>()
                {
                    team_share.shutdown();
                }
                if let Some(hp_report) = app_handle.try_state::<crate::hp_report::HpReportService>()
                {
                    hp_report.shutdown();
                }
                stop_windivert();
                if let Some(runtime) =
                    app_handle.try_state::<crate::live::runtime_handle::LiveRuntimeHandle>()
                {
                    if let Err(error) = runtime.shutdown_blocking() {
                        log::warn!(target: "app::live", "shutdown_live_runtime_failed error={error}");
                    }
                }
                if let Err(error) = crate::database::shutdown_database() {
                    log::warn!(target: "app::db", "shutdown_database_failed error={error}");
                }
                if let Some(voice_service) = app_handle.try_state::<VoiceService>() {
                    voice_service.shutdown();
                }
                info!(target: "app::startup", "App is closing! Cleaning up resources...");
            }
        });
}
