//! Team skill-cooldown sharing over the bptimer relay (`bptimer.team.v1`,
//! see `docs/TEAM_SHARE_PROTOCOL.md`).
//!
//! The live runtime owns all game state and talks to this module only through
//! [`team_link`](crate::live::team_link). This module owns the network side:
//! the persisted switch, the anonymous relay token, and one client task.

mod client;
mod protocol;
mod settings;
mod status;

use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tauri::AppHandle;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use crate::live::team_link::NetEnds;
use client::ClientContext;
use settings::SettingsStore;
use status::StatusReporter;
pub use status::TeamShareStatus;

/// Upper bound on how long exit waits for the client to say goodbye.
const SHUTDOWN_GRACE: Duration = Duration::from_millis(800);

/// Registered on the Builder so commands can reach it before `setup`.
pub struct TeamShareService {
    settings: Arc<SettingsStore>,
    enabled: watch::Sender<bool>,
    status: watch::Sender<TeamShareStatus>,
    net: Mutex<Option<NetEnds>>,
    cancel: CancellationToken,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl TeamShareService {
    #[must_use]
    pub fn new(net: NetEnds) -> Self {
        Self {
            settings: Arc::new(SettingsStore::default()),
            enabled: watch::channel(false).0,
            status: watch::channel(TeamShareStatus::Disabled).0,
            net: Mutex::new(Some(net)),
            cancel: CancellationToken::new(),
            task: Mutex::new(None),
        }
    }

    /// Loads the persisted switch and starts the relay client. Later calls
    /// are no-ops.
    pub fn start(&self, app: &AppHandle) {
        let Some(net) = self.net.lock().take() else {
            return;
        };
        self.enabled.send_replace(self.settings.get(app).enabled);
        let context = ClientContext {
            app: app.clone(),
            settings: Arc::clone(&self.settings),
            enabled: self.enabled.subscribe(),
            share: net.share,
            events: net.events,
            status: StatusReporter::new(app.clone(), self.status.clone()),
            cancel: self.cancel.clone(),
        };
        *self.task.lock() = Some(tauri::async_runtime::spawn(client::run(context)));
    }

    /// Closes the relay connection. Safe to call more than once.
    pub fn shutdown(&self) {
        self.cancel.cancel();
        let Some(task) = self.task.lock().take() else {
            return;
        };
        let _ = tauri::async_runtime::block_on(tokio::time::timeout(SHUTDOWN_GRACE, task));
    }

    fn is_enabled(&self, app: &AppHandle) -> bool {
        self.settings.get(app).enabled
    }

    fn set_enabled(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        let saved = self
            .settings
            .update(app, |settings| settings.enabled = enabled);
        self.enabled.send_replace(enabled);
        saved.map(|_| ())
    }

    fn status(&self) -> TeamShareStatus {
        self.status.borrow().clone()
    }
}

pub mod commands {
    use serde::Serialize;
    use tauri::{AppHandle, State};

    use super::{TeamShareService, TeamShareStatus};

    #[derive(Debug, Clone, Serialize, specta::Type)]
    #[serde(rename_all = "camelCase")]
    pub struct TeamShareSettings {
        pub enabled: bool,
    }

    #[tauri::command]
    #[specta::specta]
    pub fn get_team_share_settings(
        app: AppHandle,
        service: State<'_, TeamShareService>,
    ) -> TeamShareSettings {
        TeamShareSettings {
            enabled: service.is_enabled(&app),
        }
    }

    /// Takes effect immediately; the switch is also persisted for the next launch.
    #[tauri::command]
    #[specta::specta]
    pub fn set_team_share_enabled(
        app: AppHandle,
        service: State<'_, TeamShareService>,
        enabled: bool,
    ) -> Result<TeamShareSettings, String> {
        service.set_enabled(&app, enabled)?;
        Ok(TeamShareSettings { enabled })
    }

    #[tauri::command]
    #[specta::specta]
    pub fn get_team_share_status(service: State<'_, TeamShareService>) -> TeamShareStatus {
        service.status()
    }
}
