use crate::WINDOW_LIVE_LABEL;
use crate::live::bootstrap_snapshot::{MonitorRuntimeSnapshot, save_monitor_runtime_snapshot};
use crate::live::ipc::models::{
    HudFrame, HudFrameRequest, LivePullWindow, LiveScenePayload, LiveStatusPayload,
    LiveWindowFrame, LiveWindowFrameRequest,
};
use crate::live::ipc::publisher::LivePublicationCache;
use crate::live::runtime_handle::LiveRuntimeHandle;
use crate::live::voice_runtime_config::save_voice_runtime_snapshot;
use crate::voice::models::VoiceRuntimeSnapshot;
use tauri::Manager;
use window_vibrancy::{apply_blur, clear_blur};

#[tauri::command]
#[specta::specta]
pub fn pull_live_window_frame(
    window: tauri::WebviewWindow,
    cache: tauri::State<'_, LivePublicationCache>,
    request: LiveWindowFrameRequest,
) -> Result<LiveWindowFrame, String> {
    let active = pull_window_active(&window, &cache, LivePullWindow::Live)?;
    Ok(cache.pull_live_window(&request, active))
}

#[tauri::command]
#[specta::specta]
pub fn pull_hud_frame(
    window: tauri::WebviewWindow,
    cache: tauri::State<'_, LivePublicationCache>,
    request: HudFrameRequest,
) -> Result<HudFrame, String> {
    let active = pull_window_active(&window, &cache, LivePullWindow::HudOverlay)?;
    Ok(cache.pull_hud(&request, active))
}

#[tauri::command]
#[specta::specta]
pub fn set_live_pull_active(
    cache: tauri::State<'_, LivePublicationCache>,
    window: LivePullWindow,
    active: bool,
) {
    cache.set_window_active(window, active);
}

/// One-shot status read for the main-window settings preview.
#[tauri::command]
#[specta::specta]
pub fn get_live_status(
    cache: tauri::State<'_, LivePublicationCache>,
) -> Result<LiveStatusPayload, String> {
    Ok(cache.current_status())
}

/// Bootstrap for the `live-scene` topic. `main`-only: drives the daily-scene
/// auto-hide logic for the unified HUD overlay without
/// subscribing to the far heavier `live-combat` cadence.
#[tauri::command]
#[specta::specta]
pub fn get_live_scene(
    cache: tauri::State<'_, LivePublicationCache>,
) -> Result<LiveScenePayload, String> {
    Ok(cache.current_scene())
}

fn pull_window_active(
    window: &tauri::WebviewWindow,
    cache: &LivePublicationCache,
    expected: LivePullWindow,
) -> Result<bool, String> {
    let expected_label = expected.label();
    if window.label() != expected_label {
        return Err(format!(
            "pull command for {expected_label} called by {}",
            window.label()
        ));
    }
    Ok(cache.is_window_active(expected))
}

#[tauri::command]
#[specta::specta]
pub fn enable_blur(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LIVE_LABEL) {
        let _ = apply_blur(&window, Some((10, 10, 10, 50)));
    }
}

#[tauri::command]
#[specta::specta]
pub fn disable_blur(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LIVE_LABEL) {
        let _ = clear_blur(&window);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn reset_encounter(runtime: tauri::State<'_, LiveRuntimeHandle>) -> Result<(), String> {
    runtime.manual_reset().await
}

#[tauri::command]
#[specta::specta]
pub async fn toggle_pause_encounter(
    runtime: tauri::State<'_, LiveRuntimeHandle>,
) -> Result<(), String> {
    runtime.toggle_pause().await
}

#[tauri::command]
#[specta::specta]
pub async fn start_training_dummy(
    runtime: tauri::State<'_, LiveRuntimeHandle>,
) -> Result<(), String> {
    runtime.start_training().await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_training_dummy(
    runtime: tauri::State<'_, LiveRuntimeHandle>,
) -> Result<(), String> {
    runtime.stop_training().await
}

#[tauri::command]
#[specta::specta]
pub async fn save_and_apply_monitor_runtime_snapshot(
    snapshot: MonitorRuntimeSnapshot,
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, LiveRuntimeHandle>,
) -> Result<(), String> {
    let snapshot = snapshot.normalize()?;
    save_monitor_runtime_snapshot(&app_handle, &snapshot)?;
    runtime.apply_monitor_config(snapshot).await
}

/// Persists and hot-applies the voice rule set independently of the
/// monitor snapshot. Rules with unsupported (subject, event) pairs are
/// dropped by `normalize()` with a warning rather than rejecting the sync.
#[tauri::command]
#[specta::specta]
pub async fn save_and_apply_voice_runtime_snapshot(
    mut snapshot: VoiceRuntimeSnapshot,
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, LiveRuntimeHandle>,
) -> Result<(), String> {
    snapshot.normalize();
    save_voice_runtime_snapshot(&app_handle, &snapshot)?;
    runtime.apply_voice_config(snapshot).await
}
