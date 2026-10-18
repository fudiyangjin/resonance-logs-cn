//! Team skill-cooldown sharing over the bptimer relay (`bptimer.team.v1`,
//! see `docs/TEAM_SHARE_PROTOCOL.md`).
//!
//! The live runtime owns all game state and talks to this module only through
//! [`team_link`](crate::live::team_link). This module owns the network side:
//! the persisted switch and one client task; the client token is shared with
//! the other bptimer services through [`Credentials`].

mod client;
mod protocol;
mod status;

use std::sync::Arc;

use parking_lot::Mutex;
use tauri::AppHandle;
use tokio::sync::watch;

use crate::bptimer::{ClientTask, Credentials, SwitchStore};
use crate::live::team_link::NetEnds;
use client::ClientContext;
pub use status::TeamShareStatus;
use status::{STATUS_EVENT, StatusReporter};

/// Registered on the Builder so commands can reach it before `setup`.
pub struct TeamShareService {
    switch: SwitchStore,
    credentials: Arc<Credentials>,
    enabled: watch::Sender<bool>,
    status: watch::Sender<TeamShareStatus>,
    net: Mutex<Option<NetEnds>>,
    task: ClientTask,
}

impl TeamShareService {
    #[must_use]
    pub fn new(net: NetEnds, credentials: Arc<Credentials>) -> Self {
        Self {
            switch: SwitchStore::new("teamShare.json"),
            credentials,
            enabled: watch::channel(false).0,
            status: watch::channel(TeamShareStatus::Disabled).0,
            net: Mutex::new(Some(net)),
            task: ClientTask::default(),
        }
    }

    /// Loads the persisted switch and starts the relay client. Later calls
    /// are no-ops.
    pub fn start(&self, app: &AppHandle) {
        let Some(net) = self.net.lock().take() else {
            return;
        };
        self.enabled.send_replace(self.switch.is_enabled(app));
        self.task.spawn(client::run(ClientContext {
            app: app.clone(),
            credentials: Arc::clone(&self.credentials),
            enabled: self.enabled.subscribe(),
            share: net.share,
            events: net.events,
            status: StatusReporter::new(app.clone(), self.status.clone(), STATUS_EVENT),
            cancel: self.task.cancel_token(),
        }));
    }

    /// Closes the relay connection. Safe to call more than once.
    pub fn shutdown(&self) {
        self.task.shutdown();
    }

    fn is_enabled(&self, app: &AppHandle) -> bool {
        self.switch.is_enabled(app)
    }

    fn set_enabled(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        let saved = self.switch.set(app, enabled);
        self.enabled.send_replace(enabled);
        saved
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
