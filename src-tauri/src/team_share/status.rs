use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

use crate::WINDOW_MAIN_LABEL;

pub const STATUS_EVENT: &str = "team-share-status-changed";

/// Relay connection state shown in the settings page.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum TeamShareStatus {
    #[default]
    Disabled,
    /// Sharing is on but the character is not in a team, the game client is
    /// not detected yet, or the server clock is still unknown.
    Idle,
    Connecting,
    Connected {
        teammates: u32,
    },
    Retrying {
        error: String,
        #[serde(rename = "retryMs")]
        retry_ms: u32,
    },
}

/// Publishes status changes to the watch and, when they change, to the main
/// window.
#[derive(Clone)]
pub struct StatusReporter {
    app: AppHandle,
    tx: watch::Sender<TeamShareStatus>,
}

impl StatusReporter {
    pub fn new(app: AppHandle, tx: watch::Sender<TeamShareStatus>) -> Self {
        Self { app, tx }
    }

    pub fn set(&self, status: TeamShareStatus) {
        let changed = self.tx.send_if_modified(|current| {
            if *current == status {
                return false;
            }
            current.clone_from(&status);
            true
        });
        if changed {
            let _ = self.app.emit_to(WINDOW_MAIN_LABEL, STATUS_EVENT, status);
        }
    }
}
