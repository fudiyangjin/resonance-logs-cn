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
                stop_windivert();
                if let Some(voice_service) = app_handle.try_state::<VoiceService>() {
                    voice_service.shutdown();
                }
                info!(target: "app::startup", "App is closing! Cleaning up resources...");
            }
        });
}
