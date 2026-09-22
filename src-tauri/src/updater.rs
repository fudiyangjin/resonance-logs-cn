//! One application-owned update task; windows only observe its latest snapshot.

use std::time::{Duration, Instant};

use log::{info, warn};
use parking_lot::Mutex;
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::live::bootstrap_snapshot::{AppLocale, load_monitor_runtime_snapshot};

const STATUS_EVENT: &str = "update-status-changed";
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Verifying,
    Installing,
    Failed,
}

impl UpdatePhase {
    fn busy(self) -> bool {
        matches!(
            self,
            Self::Checking | Self::Downloading | Self::Verifying | Self::Installing
        )
    }
}

#[derive(Clone, Debug, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub revision: u32,
    pub phase: UpdatePhase,
    pub version: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
}

#[derive(Default)]
struct UpdateState {
    status: UpdateStatus,
    release: Option<Update>,
    last_progress: Option<Instant>,
}

impl UpdateState {
    fn transition(&mut self, phase: UpdatePhase) -> UpdateStatus {
        self.status.phase = phase;
        self.status.revision += 1;
        self.status.clone()
    }

    fn begin_check(&mut self) -> Option<UpdateStatus> {
        if self.status.phase.busy() {
            return None;
        }
        self.release = None;
        self.status.version = None;
        self.status.error = None;
        self.status.downloaded_bytes = 0;
        self.status.total_bytes = None;
        Some(self.transition(UpdatePhase::Checking))
    }

    fn begin_download(&mut self) -> Result<Option<(Update, UpdateStatus)>, String> {
        if self.status.phase.busy() {
            return Ok(None);
        }
        let release = self
            .release
            .clone()
            .ok_or("no checked update is available")?;
        self.status.error = None;
        self.status.downloaded_bytes = 0;
        self.status.total_bytes = None;
        self.last_progress = Some(Instant::now());
        Ok(Some((release, self.transition(UpdatePhase::Downloading))))
    }

    fn progress(&mut self, bytes: usize, total: Option<u64>, now: Instant) -> Option<UpdateStatus> {
        self.status.downloaded_bytes += bytes as u64;
        self.status.total_bytes = total.filter(|size| *size > 0);
        // Every snapshot has a revision, including progress not emitted yet.
        self.status.revision += 1;
        if self
            .last_progress
            .is_some_and(|last| now.duration_since(last) < PROGRESS_INTERVAL)
        {
            return None;
        }
        self.last_progress = Some(now);
        Some(self.status.clone())
    }

    fn fail(&mut self, error: String) -> UpdateStatus {
        self.status.error = Some(error);
        self.transition(UpdatePhase::Failed)
    }
}

#[derive(Default)]
pub struct UpdateService(Mutex<UpdateState>);

fn emit_status(app: &AppHandle, status: UpdateStatus) {
    if let Err(error) = app.emit_to(crate::WINDOW_MAIN_LABEL, STATUS_EVENT, status) {
        warn!(target: "app::updater", "could not emit update status: {error}");
    }
}

fn transition(app: &AppHandle, phase: UpdatePhase) {
    let status = app.state::<UpdateService>().0.lock().transition(phase);
    info!(target: "app::updater", "phase={phase:?} version={:?}", status.version);
    emit_status(app, status);
}

fn fail(app: &AppHandle, error: String) {
    warn!(target: "app::updater", "{error}");
    let status = app.state::<UpdateService>().0.lock().fail(error);
    emit_status(app, status);
}

fn endpoint_candidates(locale: AppLocale) -> &'static [&'static str] {
    // Keep fallbacks in the same locale: manifests also select the installer host.
    match locale {
        AppLocale::ZhCn => &[
            "https://bptimer.cn/resonance-logs/latest.json",
            "https://github.com/fudiyangjin/resonance-logs-cn/releases/latest/download/latest.json",
        ],
        AppLocale::EnUs => &[
            "https://bptimer.cn/resonance-logs/latest.en-US.json",
            "https://github.com/fudiyangjin/resonance-logs-cn/releases/latest/download/latest.en-US.json",
        ],
        AppLocale::JaJp => &[
            "https://bptimer.cn/resonance-logs/latest.ja-JP.json",
            "https://github.com/fudiyangjin/resonance-logs-cn/releases/latest/download/latest.ja-JP.json",
        ],
    }
}

/// The updater calls this only after extracting a valid installer. Its default
/// hook only cleans up Tauri resources, bypassing RunEvent::Exit/ExitRequested.
fn prepare_to_exit(app: &AppHandle) {
    save_settings_on_exit(app);
    if let Some(voice) = app.try_state::<crate::voice::VoiceService>() {
        voice.shutdown();
    }
    crate::stop_windivert();
    // Intentionally do not drain the current fight or wait for history writers.
    app.cleanup_before_exit();
}

fn save_settings_on_exit<R: tauri::Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_svelte::{StoreCollection, SvelteMarker};

    // Respect saveOnExit (in particular, do not persist the live mirror stores).
    if let Some(stores) = app.try_state::<StoreCollection<R, SvelteMarker>>() {
        if let Err(error) = stores.on_exit() {
            warn!(target: "app::updater", "settings exit save failed: {error}");
        }
    }
}

async fn find_release(app: &AppHandle) -> Result<Option<Update>, String> {
    let locale = load_monitor_runtime_snapshot(app)
        .map(|snapshot| snapshot.i18n.locale)
        .unwrap_or_default();
    let endpoints = endpoint_candidates(locale)
        .iter()
        .map(|url| url.parse())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("invalid update endpoint: {error}"))?;
    info!(target: "app::updater", "checking updates locale={}", locale.as_str());
    let exit_app = app.clone();
    let updater = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .configure_client(|client| {
            client
                .connect_timeout(Duration::from_secs(10))
                .read_timeout(Duration::from_secs(30))
        })
        .on_before_exit(move || prepare_to_exit(&exit_app))
        .build()
        .map_err(|error| error.to_string())?;
    updater
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))
}

#[tauri::command]
#[specta::specta]
pub fn get_update_status(service: State<'_, UpdateService>) -> UpdateStatus {
    service.0.lock().status.clone()
}

#[tauri::command]
#[specta::specta]
pub fn check_for_updates(app: AppHandle, service: State<'_, UpdateService>) -> UpdateStatus {
    let status = {
        let mut state = service.0.lock();
        let Some(status) = state.begin_check() else {
            return state.status.clone();
        };
        status
    };
    emit_status(&app, status.clone());
    tauri::async_runtime::spawn(async move {
        match find_release(&app).await {
            Ok(release) => {
                let status = {
                    let service = app.state::<UpdateService>();
                    let mut state = service.0.lock();
                    state.status.version = release.as_ref().map(|update| update.version.clone());
                    let phase = if release.is_some() {
                        UpdatePhase::Available
                    } else {
                        UpdatePhase::UpToDate
                    };
                    state.release = release;
                    state.transition(phase)
                };
                info!(target: "app::updater", "check finished phase={:?} version={:?}", status.phase, status.version);
                emit_status(&app, status);
            }
            Err(error) => fail(&app, error),
        }
    });
    status
}

#[tauri::command]
#[specta::specta]
pub fn start_update(
    app: AppHandle,
    service: State<'_, UpdateService>,
) -> Result<UpdateStatus, String> {
    let (release, status) = {
        let mut state = service.0.lock();
        let Some(download) = state.begin_download()? else {
            return Ok(state.status.clone());
        };
        download
    };
    info!(target: "app::updater", "downloading version={}", release.version);
    emit_status(&app, status.clone());
    tauri::async_runtime::spawn(async move {
        let downloaded = release
            .download(
                |bytes, total| {
                    let progress = app.state::<UpdateService>().0.lock().progress(
                        bytes,
                        total,
                        Instant::now(),
                    );
                    if let Some(status) = progress {
                        emit_status(&app, status);
                    }
                },
                || transition(&app, UpdatePhase::Verifying),
            )
            .await;
        match downloaded {
            Ok(bytes) => {
                transition(&app, UpdatePhase::Installing);
                // install() extracts the installer before running our exit hook.
                let result =
                    tauri::async_runtime::spawn_blocking(move || release.install(bytes)).await;
                match result {
                    Ok(Ok(())) => {} // Windows exits inside install().
                    Ok(Err(error)) => fail(&app, format!("could not install update: {error}")),
                    Err(error) => fail(&app, format!("installer task failed: {error}")),
                }
            }
            Err(error) => fail(
                &app,
                format!("could not download or verify update: {error}"),
            ),
        }
    });
    Ok(status)
}

/// No timer survives this one startup check. Retries are user initiated.
pub fn schedule_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let service = app.state::<UpdateService>();
        if service.0.lock().status.phase == UpdatePhase::Idle {
            check_for_updates(app.clone(), service);
        }
    });
}

#[cfg(test)]
mod download_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn competing_checks_and_install_attempts_do_not_start_another_task() {
        let state = std::sync::Arc::new(Mutex::new(UpdateState::default()));
        let checks: Vec<_> = (0..12)
            .map(|_| {
                let state = state.clone();
                std::thread::spawn(move || state.lock().begin_check().is_some())
            })
            .collect();
        assert_eq!(
            checks
                .into_iter()
                .map(|task| usize::from(task.join().unwrap()))
                .sum::<usize>(),
            1
        );
        assert!(state.lock().begin_download().unwrap().is_none());
        for phase in [
            UpdatePhase::Downloading,
            UpdatePhase::Verifying,
            UpdatePhase::Installing,
        ] {
            state.lock().transition(phase);
            assert!(state.lock().begin_check().is_none());
            assert!(state.lock().begin_download().unwrap().is_none());
        }
    }

    #[test]
    fn failed_check_can_retry_and_never_claims_an_unchecked_download() {
        let mut state = UpdateState::default();
        state.begin_check().unwrap();
        let failed = state.fail("offline".into());
        assert!(state.begin_download().is_err());
        let retry = state.begin_check().unwrap();
        assert!(retry.revision > failed.revision);
        assert_eq!(retry.phase, UpdatePhase::Checking);
        assert!(retry.error.is_none());
    }

    #[test]
    fn progress_is_throttled_but_late_subscribers_get_all_bytes() {
        let mut state = UpdateState::default();
        let start = Instant::now();
        state.last_progress = Some(start);
        state.transition(UpdatePhase::Downloading);
        assert!(
            state
                .progress(50, None, start + Duration::from_millis(100))
                .is_none()
        );
        let snapshot = state.status.clone();
        assert_eq!(snapshot.downloaded_bytes, 50);
        assert_eq!(snapshot.total_bytes, None);
        let progress = state
            .progress(50, Some(100), start + PROGRESS_INTERVAL)
            .unwrap();
        assert!(progress.revision > snapshot.revision);
        assert_eq!(progress.downloaded_bytes, 100);
        let verifying = state.transition(UpdatePhase::Verifying);
        assert!(verifying.revision > progress.revision);
        assert_eq!(verifying.downloaded_bytes, 100);
    }

    #[test]
    fn all_locales_prefer_domestic_manifests_with_same_locale_github_fallback() {
        for (locale, filename) in [
            (AppLocale::ZhCn, "latest.json"),
            (AppLocale::EnUs, "latest.en-US.json"),
            (AppLocale::JaJp, "latest.ja-JP.json"),
        ] {
            let endpoints = endpoint_candidates(locale);
            assert_eq!(endpoints.len(), 2);
            assert!(endpoints[0].starts_with("https://bptimer.cn/"));
            assert!(endpoints[1].starts_with("https://github.com/"));
            assert!(
                endpoints
                    .iter()
                    .all(|endpoint| endpoint.ends_with(filename))
            );
        }
    }
}
