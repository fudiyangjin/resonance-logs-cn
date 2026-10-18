use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

use crate::WINDOW_MAIN_LABEL;

/// Publishes a client's connection status to its watch and, when it changes,
/// to the main window's settings page as `event`.
#[derive(Clone)]
pub struct StatusReporter<S> {
    app: AppHandle,
    tx: watch::Sender<S>,
    event: &'static str,
}

impl<S: Clone + PartialEq + Serialize> StatusReporter<S> {
    pub fn new(app: AppHandle, tx: watch::Sender<S>, event: &'static str) -> Self {
        Self { app, tx, event }
    }

    pub fn set(&self, status: S) {
        let changed = self.tx.send_if_modified(|current| {
            if *current == status {
                return false;
            }
            current.clone_from(&status);
            true
        });
        if changed {
            let _ = self.app.emit_to(WINDOW_MAIN_LABEL, self.event, status);
        }
    }
}
