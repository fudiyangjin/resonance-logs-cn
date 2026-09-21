//! [`VoiceService`] construction, lifecycle and status reporting. The
//! behaviour is spread over sibling modules by feature (`playback`,
//! `phrases`, `generation`, `model_lifecycle`); this file owns the shared
//! state and the pieces that don't belong to any one of them.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use log::warn;
use parking_lot::Mutex;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use super::error::{VoiceError, VoiceResult};
use super::generation::recommended_backend;
use super::generator::SidecarRunner;
use super::model_manager::{ModelDownloader, ModelStore};
use super::models::{
    EngineBackend, EngineState, FineTunedVoiceState, ModelState, VoiceBackendInventory,
    VoiceBackendStatus, VoiceQueuePolicy, VoiceStatus,
};
use super::now_ms;
use super::operation::{
    EngineProbeCache, ModelValidationCache, VoiceOperationCoordinator, operation_mutates_model,
};
use super::phrases::{reconcile_single_asset_per_phrase, remove_asset_files_best_effort};
use super::player::{PlaybackSink, PlayerHandle};
use super::{catalog, finetuned, generator, model_manager, models, prompts};

pub(super) struct VoiceServiceInner {
    pub(super) app_handle: AppHandle,
    pub(super) voice_root: PathBuf,
    pub(super) catalog: Mutex<models::VoiceCatalog>,
    pub(super) player: Arc<dyn PlaybackSink>,
    pub(super) http_client: reqwest::Client,
    pub(super) sidecar_runner: Arc<dyn SidecarRunner>,
    pub(super) model_downloader: Arc<dyn ModelDownloader>,
    pub(super) model_store: Arc<dyn ModelStore>,
    pub(super) operation: VoiceOperationCoordinator,
    pub(super) model_validation: Mutex<ModelValidationCache>,
    pub(super) fine_tuned_validation: Mutex<finetuned::FineTunedValidationCache>,
    pub(super) engine_probe_cache: Mutex<EngineProbeCache>,
    pub(super) generation_cancel: Mutex<CancellationToken>,
    pub(super) generation_pid: Arc<Mutex<Option<u32>>>,
    pub(super) download_cancel: Mutex<CancellationToken>,
}

#[derive(Clone)]
pub struct VoiceService {
    pub(super) inner: Arc<VoiceServiceInner>,
}

pub(super) fn resolve_sidecar_path(
    app_handle: &AppHandle,
    backend: EngineBackend,
) -> VoiceResult<PathBuf> {
    let backend_name = backend.as_str();
    let file_name = format!("qwen3-tts-sidecar-{backend_name}.exe");
    let override_key = format!(
        "QWEN3_TTS_SIDECAR_{}_PATH",
        backend_name.to_ascii_uppercase()
    );
    if let Ok(override_path) = std::env::var(override_key) {
        let path = PathBuf::from(override_path);
        if path.is_file() {
            return Ok(path);
        }
    }
    #[cfg(debug_assertions)]
    {
        let candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "qwen3-tts-sidecar-{backend_name}-x86_64-pc-windows-msvc.exe"
            ));
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    if let Ok(executable) = std::env::current_exe()
        && let Some(directory) = executable.parent()
    {
        let candidate = directory.join(&file_name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let candidate = resource_dir.join(&file_name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(VoiceError::not_found(
        "qwen3-tts sidecar",
        format!("{backend_name}:{file_name}"),
    ))
}

pub(super) fn engine_ready(state: &EngineState) -> bool {
    matches!(state, EngineState::Ready { .. })
}

impl VoiceService {
    pub fn new(app_handle: AppHandle) -> VoiceResult<Self> {
        let voice_root = catalog::voice_root_dir(&app_handle)?;
        let mut catalog_data = catalog::load_catalog(&voice_root)?;
        // Upgrades catalogs written before generation started enforcing a
        // single asset per phrase (e.g. from an older build), so leftover
        // unconfirmed takes don't linger forever with no way to clean them
        // up from the UI.
        let mut removed_assets = reconcile_single_asset_per_phrase(&mut catalog_data);
        let prompt_sync = prompts::seed_catalog(&mut catalog_data, now_ms());
        removed_assets.extend(prompt_sync.removed_user_assets);
        if prompt_sync.changed || !removed_assets.is_empty() {
            catalog::save_catalog(&voice_root, &catalog_data)?;
            remove_asset_files_best_effort(&voice_root, &removed_assets);
        }
        let http_client = reqwest::Client::builder()
            .https_only(true)
            .build()
            .map_err(|source| VoiceError::Http {
                context: "build voice HTTP client".to_string(),
                source,
            })?;
        Ok(Self {
            inner: Arc::new(VoiceServiceInner {
                app_handle,
                voice_root,
                catalog: Mutex::new(catalog_data),
                player: Arc::new(PlayerHandle::spawn()?),
                http_client,
                sidecar_runner: Arc::new(generator::ProcessSidecarRunner),
                model_downloader: Arc::new(model_manager::SignedHttpModelDownloader),
                model_store: Arc::new(model_manager::FileModelStore),
                operation: VoiceOperationCoordinator::default(),
                model_validation: Mutex::new(ModelValidationCache::default()),
                fine_tuned_validation: Mutex::new(finetuned::FineTunedValidationCache::default()),
                engine_probe_cache: Mutex::new(EngineProbeCache::default()),
                generation_cancel: Mutex::new(CancellationToken::new()),
                generation_pid: Arc::new(Mutex::new(None)),
                download_cancel: Mutex::new(CancellationToken::new()),
            }),
        })
    }

    pub fn voice_root(&self) -> &Path {
        &self.inner.voice_root
    }

    pub fn apply_runtime_settings(&self, enabled: bool, volume: f32, policy: VoiceQueuePolicy) {
        self.inner.player.set_enabled(enabled);
        self.inner.player.set_volume(volume.clamp(0.0, 1.0));
        self.inner.player.set_queue_policy(policy);
    }

    /// Persists `updated` to disk, then swaps it in as the in-memory
    /// catalog. The disk write happens *before* the lock is taken, so
    /// `catalog`'s mutex is never held across file IO: callers on the live
    /// event loop's hot path (`enqueue_cue`) can then never end up blocked
    /// behind a slow catalog save from an unrelated settings-page action.
    /// All catalog-mutating operations are already serialized by
    /// `VoiceOperationCoordinator`, so this can't lose a concurrent update.
    pub(super) fn commit_catalog(&self, updated: models::VoiceCatalog) -> VoiceResult<()> {
        catalog::save_catalog(&self.inner.voice_root, &updated)?;
        *self.inner.catalog.lock() = updated;
        Ok(())
    }

    pub fn shutdown(&self) {
        self.cancel_generation();
        self.cancel_model_download();
        self.inner.player.stop_all();
        self.inner.player.shutdown();
    }

    pub(super) fn probe_backend_state(&self, backend: EngineBackend, path: &Path) -> EngineState {
        match self.inner.sidecar_runner.probe(path) {
            Ok(probe)
                if probe.variant == backend.as_str()
                    && probe.compiled_backends.contains(&backend)
                    && probe.devices.iter().any(|device| device.backend == backend) =>
            {
                EngineState::Ready { probe }
            }
            Ok(probe) => EngineState::Incompatible {
                reason: format!(
                    "{} sidecar does not expose an initialized {} device (variant={})",
                    backend.as_str(),
                    backend.as_str(),
                    probe.variant
                ),
            },
            Err(VoiceError::Incompatible(reason)) => EngineState::Incompatible { reason },
            Err(error) => EngineState::Error {
                message: error.to_string(),
            },
        }
    }

    /// Resolves one backend's readiness, consulting (and refreshing) the
    /// probe cache unless `force` is set. Probing spawns the sidecar
    /// executable with `--probe` and can take up to a few seconds (see the
    /// probe timeout in `generator.rs`), so callers on the page-load /
    /// generation-start hot paths should prefer `force = false`.
    pub(super) fn backend_status(&self, backend: EngineBackend, force: bool) -> VoiceBackendStatus {
        let engine = match resolve_sidecar_path(&self.inner.app_handle, backend) {
            Ok(path) => match std::fs::metadata(&path) {
                Ok(metadata) => {
                    let modified_nanos = metadata
                        .modified()
                        .ok()
                        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                        .map_or(0, |duration| duration.as_nanos());
                    let size_bytes = metadata.len();
                    let cached = (!force)
                        .then(|| {
                            self.inner.engine_probe_cache.lock().lookup(
                                backend,
                                &path,
                                modified_nanos,
                                size_bytes,
                            )
                        })
                        .flatten();
                    match cached {
                        Some(state) => state,
                        None => {
                            let state = self.probe_backend_state(backend, &path);
                            self.inner.engine_probe_cache.lock().store(
                                backend,
                                path,
                                modified_nanos,
                                size_bytes,
                                state.clone(),
                            );
                            state
                        }
                    }
                }
                Err(_) => self.probe_backend_state(backend, &path),
            },
            Err(VoiceError::NotFound { .. }) => EngineState::Missing,
            Err(VoiceError::Incompatible(reason)) => EngineState::Incompatible { reason },
            Err(error) => EngineState::Error {
                message: error.to_string(),
            },
        };
        VoiceBackendStatus {
            backend,
            engine,
            component_version: None,
            update_available: false,
        }
    }

    /// Probes both backends. Runs the CPU and Vulkan `--probe` sidecar
    /// processes concurrently (each can take up to a few seconds) instead of
    /// sequentially, since they are independent and the caller usually
    /// wants both results at once.
    pub(super) fn backend_inventory(&self, force: bool) -> VoiceBackendInventory {
        let cpu_service = self.clone();
        let cpu_handle =
            std::thread::spawn(move || cpu_service.backend_status(EngineBackend::Cpu, force));
        let vulkan = self.backend_status(EngineBackend::Vulkan, force);
        let cpu = cpu_handle.join().unwrap_or_else(|_| VoiceBackendStatus {
            backend: EngineBackend::Cpu,
            engine: EngineState::Error {
                message: "cpu backend probe thread panicked".to_string(),
            },
            component_version: None,
            update_available: false,
        });
        let mut inventory = VoiceBackendInventory {
            cpu,
            vulkan,
            recommended: EngineBackend::Cpu,
        };
        inventory.recommended = recommended_backend(&inventory);
        inventory
    }

    /// Runs one no-op probe pass in the background to warm the probe cache
    /// (see `EngineProbeCache`) before the user opens the voice page, so the
    /// first `voice_get_status` call there is instant instead of paying for
    /// two sidecar `--probe` spawns.
    pub async fn warm_up_backend_probes(&self) {
        let service = self.clone();
        if let Err(error) =
            tauri::async_runtime::spawn_blocking(move || service.backend_inventory(false)).await
        {
            warn!(target: "app::voice", "backend probe warm-up task failed: {error}");
        }
    }

    pub async fn status(&self, force_refresh: bool) -> VoiceStatus {
        let catalog = self.inner.catalog.lock().clone();
        let operation = self.inner.operation.state();
        let generation = operation.generation_state();
        let model_version = catalog.installed_model_version.clone();
        let inventory_service = self.clone();
        let service = self.clone();
        let cached_model = self.inner.model_validation.lock().state.clone();
        let skip_model_files = operation_mutates_model(&operation);

        let engine_task = tauri::async_runtime::spawn_blocking(move || {
            inventory_service.backend_inventory(force_refresh)
        });
        let model_task = tauri::async_runtime::spawn_blocking(move || {
            if skip_model_files {
                cached_model
            } else if let Some(version) = model_version {
                service.validate_model_cached(&version, false).0
            } else {
                service.inner.model_validation.lock().clear();
                ModelState::NotInstalled
            }
        });
        let fine_tuned = catalog.fine_tuned_voice.clone();
        let fine_tuned_service = self.clone();
        let fine_tuned_task = tauri::async_runtime::spawn_blocking(move || {
            fine_tuned
                .as_ref()
                .map_or(FineTunedVoiceState::NotConfigured, |voice| {
                    let state_dir = catalog::fine_tuned_dir(&fine_tuned_service.inner.voice_root);
                    fine_tuned_service
                        .inner
                        .fine_tuned_validation
                        .lock()
                        .inspect(voice, &state_dir)
                })
        });
        let (engine, model, fine_tuned_voice) =
            tokio::join!(engine_task, model_task, fine_tuned_task);
        let backends = engine.unwrap_or_default();
        let engine = match backends.recommended {
            EngineBackend::Cpu => backends.cpu.engine.clone(),
            EngineBackend::Vulkan => backends.vulkan.engine.clone(),
        };
        VoiceStatus {
            catalog,
            operation,
            generation,
            engine,
            backends,
            model: model.unwrap_or_else(|error| ModelState::Corrupt {
                version: "unknown".to_string(),
                reason: format!("model verification task failed: {error}"),
            }),
            fine_tuned_voice: fine_tuned_voice.unwrap_or_default(),
        }
    }
}
