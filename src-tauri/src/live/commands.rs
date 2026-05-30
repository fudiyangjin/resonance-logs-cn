use crate::WINDOW_LIVE_LABEL;
use crate::live::bootstrap_snapshot::{MonitorRuntimeSnapshot, save_monitor_runtime_snapshot};
use crate::live::state::{AppStateManager, StateEvent};
use log::info;
use tauri::Manager;
use window_vibrancy::{apply_blur, clear_blur};
// request_restart is not needed in this module at present

/// Enables blur on the live meter window.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
#[tauri::command]
#[specta::specta]
pub fn enable_blur(app: tauri::AppHandle) {
    if let Some(meter_window) = app.get_webview_window(WINDOW_LIVE_LABEL) {
        apply_blur(&meter_window, Some((10, 10, 10, 50))).ok();
    }
}

/// Disables blur on the live meter window.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
#[tauri::command]
#[specta::specta]
pub fn disable_blur(app: tauri::AppHandle) {
    if let Some(meter_window) = app.get_webview_window(WINDOW_LIVE_LABEL) {
        clear_blur(&meter_window).ok();
    }
}

// #[tauri::command]
// #[specta::specta]
// pub fn get_header_info(state: tauri::State<'_, EncounterMutex>) -> Result<HeaderInfo, String> {
//     let encounter = state.lock().unwrap();

//     if encounter.total_dmg == 0 {
//         return Err("No damage found".to_string());
//     }

//     let time_elapsed_ms = encounter
//         .time_last_combat_packet_ms
//         .saturating_sub(encounter.time_fight_start_ms);
//     #[allow(clippy::cast_precision_loss)]
//     let time_elapsed_secs = time_elapsed_ms as f64 / 1000.0;

//     #[allow(clippy::cast_precision_loss)]
//     Ok(HeaderInfo {
//         total_dps: nan_is_zero(encounter.total_dmg as f64 / time_elapsed_secs),
//         total_dmg: encounter.total_dmg,
//         elapsed_ms: time_elapsed_ms,
//     })
// }

// #[tauri::command]
// #[specta::specta]
// pub fn hard_reset(state: tauri::State<'_, EncounterMutex>) {
//     let mut encounter = state.lock().unwrap();
//     encounter.clone_from(&Encounter::default());
//     request_restart();
//     info!("Hard Reset");
// }

/// Resets the encounter.
///
/// # Arguments
///
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub fn reset_encounter(state_manager: tauri::State<'_, AppStateManager>) -> Result<(), String> {
    state_manager
        .inner()
        .send_state_event(StateEvent::ResetEncounter { is_manual: true })?;
    info!("encounter reset via command");
    Ok(())
}

/// Toggles pausing the encounter.
///
/// # Arguments
///
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub fn toggle_pause_encounter(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager.send_toggle_pause_encounter()?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn start_training_dummy(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager.start_training_dummy()?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn stop_training_dummy(state_manager: tauri::State<'_, AppStateManager>) -> Result<(), String> {
    state_manager.stop_training_dummy()?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn save_and_apply_monitor_runtime_snapshot(
    snapshot: MonitorRuntimeSnapshot,
    app_handle: tauri::AppHandle,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    let snapshot = snapshot.normalize()?;
    save_monitor_runtime_snapshot(&app_handle, &snapshot)?;
    state_manager.apply_monitor_runtime_snapshot(snapshot)?;
    Ok(())
}
