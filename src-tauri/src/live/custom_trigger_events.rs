use crate::live::event_logger::EventLoggerBatchPayload;
use crate::live::event_manager::safe_emit_to;
use tauri::{AppHandle, Manager};

pub const CUSTOM_TRIGGER_BATCH_EVENT: &str = "custom-trigger-batch";

fn window_visible(app_handle: &AppHandle, label: &str) -> bool {
    let Some(window) = app_handle.get_webview_window(label) else {
        return false;
    };
    window.is_visible().unwrap_or(false)
}

pub fn emit_custom_trigger_entries(
    app_handle: &AppHandle,
    entries: Vec<crate::live::event_logger::EventLoggerEntry>,
) {
    if entries.is_empty() {
        return;
    }

    let payload = EventLoggerBatchPayload { entries };

    if window_visible(app_handle, crate::WINDOW_GAME_OVERLAY_LABEL) {
        safe_emit_to(
            app_handle,
            crate::WINDOW_GAME_OVERLAY_LABEL,
            CUSTOM_TRIGGER_BATCH_EVENT,
            payload.clone(),
        );
    }

    if window_visible(app_handle, crate::WINDOW_MAIN_LABEL) {
        safe_emit_to(
            app_handle,
            crate::WINDOW_MAIN_LABEL,
            CUSTOM_TRIGGER_BATCH_EVENT,
            payload,
        );
    }
}
