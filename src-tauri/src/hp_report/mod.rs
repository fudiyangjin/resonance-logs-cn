//! Boss HP reports to bptimer.cn (`bptimer.hp.v1`, see
//! `docs/HP_REPORT_PROTOCOL.md`).
//!
//! The live runtime publishes the tracked bosses in view through
//! [`hp_link`](crate::live::hp_link). This module owns the network side: the
//! persisted switch and one client task; the client token is shared with the
//! other bptimer services through [`Credentials`].

mod client;
mod protocol;
mod status;

use std::sync::Arc;

use parking_lot::Mutex;
use tauri::AppHandle;
use tokio::sync::watch;

use crate::bptimer::{ClientTask, Credentials, SwitchStore};
use crate::live::hp_link::NetEnds;
use client::ClientContext;
pub use status::HpReportStatus;
use status::{STATUS_EVENT, StatusReporter};

/// Registered on the Builder so commands can reach it before `setup`.
pub struct HpReportService {
    switch: SwitchStore,
    credentials: Arc<Credentials>,
    enabled: watch::Sender<bool>,
    status: watch::Sender<HpReportStatus>,
    net: Mutex<Option<NetEnds>>,
    task: ClientTask,
}

impl HpReportService {
    #[must_use]
    pub fn new(net: NetEnds, credentials: Arc<Credentials>) -> Self {
        Self {
            switch: SwitchStore::new("hpReport.json"),
            credentials,
            enabled: watch::channel(false).0,
            status: watch::channel(HpReportStatus::Disabled).0,
            net: Mutex::new(Some(net)),
            task: ClientTask::default(),
        }
    }

    /// Loads the persisted switch and starts the report client. Later calls
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

    /// Closes the report connection. Safe to call more than once.
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

    fn status(&self) -> HpReportStatus {
        self.status.borrow().clone()
    }
}

pub mod commands {
    use serde::Serialize;
    use tauri::{AppHandle, State};

    use super::{HpReportService, HpReportStatus};

    #[derive(Debug, Clone, Serialize, specta::Type)]
    #[serde(rename_all = "camelCase")]
    pub struct HpReportSettings {
        pub enabled: bool,
    }

    #[tauri::command]
    #[specta::specta]
    pub fn get_hp_report_settings(
        app: AppHandle,
        service: State<'_, HpReportService>,
    ) -> HpReportSettings {
        HpReportSettings {
            enabled: service.is_enabled(&app),
        }
    }

    /// Takes effect immediately; the switch is also persisted for the next launch.
    #[tauri::command]
    #[specta::specta]
    pub fn set_hp_report_enabled(
        app: AppHandle,
        service: State<'_, HpReportService>,
        enabled: bool,
    ) -> Result<HpReportSettings, String> {
        service.set_enabled(&app, enabled)?;
        Ok(HpReportSettings { enabled })
    }

    #[tauri::command]
    #[specta::specta]
    pub fn get_hp_report_status(service: State<'_, HpReportService>) -> HpReportStatus {
        service.status()
    }
}
