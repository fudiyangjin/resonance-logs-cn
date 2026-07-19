//! Offline voice broadcasting and voice-cloning service.

pub mod audio;
pub mod catalog;
pub mod commands;
pub mod error;
pub mod finetuned;
pub mod generator;
pub mod model_manager;
pub mod models;
pub mod player;
pub mod rules;
pub mod scheduler;
pub mod types;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use log::warn;
use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use error::{VoiceError, VoiceResult};
use generator::SidecarRunner;
use model_manager::{
    InstallReceipt, ModelDownloadSource, ModelDownloader, ModelStore,
    ModelValidationFingerprint, ModelValidationSnapshot,
};
use models::{
    EngineBackend, EngineState, FineTunedVoiceMeta, FineTunedVoiceState, ModelState,
    SIDECAR_PROTOCOL_VERSION, SidecarItem, SidecarJob, SidecarSourceSpec, VoiceAssetMeta,
    VoiceAssetSource, VoiceBackendInventory, VoiceBackendStatus, VoiceCueIntent,
    VoiceGenerationBackend, VoiceLanguage, VoiceOperationState, VoicePhraseMeta, VoiceProfileMeta,
    VoiceQueuePolicy, VoiceStatus,
};
use player::{PlaybackSink, PlayerHandle, QueuedCue};
use types::{AssetId, ModelVersion, PhraseId, ProfileId};

const PREVIEW_RULE_ID: &str = "__preview__";
const TEST_TRIGGER_PRIORITY: u8 = 200;
const PREVIEW_PRIORITY: u8 = 255;
const FINE_TUNED_TEMPERATURE: f32 = 0.5;
const FINE_TUNED_TOP_K: i32 = 20;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}

fn new_id(prefix: &str) -> String {
    let sequence = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}_{sequence}", now_ms())
}

pub struct ProfileSelectionNew {
    pub name: String,
    pub reference_wav_path: String,
    pub keep_reference: bool,
}

pub enum ProfileSelection {
    New(ProfileSelectionNew),
    Existing { profile_id: ProfileId },
}

pub enum VoiceSourceSelection {
    Clone(ProfileSelection),
    FineTuned,
}

pub struct GenerateItemRequest {
    pub phrase_id: PhraseId,
}

pub struct GenerateRequest {
    pub source: VoiceSourceSelection,
    pub items: Vec<GenerateItemRequest>,
    pub backend_preference: VoiceGenerationBackend,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GenerationSummary {
    pub completed: u32,
    pub failed: u32,
    pub profile_id: Option<String>,
    pub asset_ids: Vec<String>,
}

#[derive(Debug, Default)]
struct VoiceOperationCoordinator {
    state: Mutex<VoiceOperationState>,
}

impl VoiceOperationCoordinator {
    fn state(&self) -> VoiceOperationState {
        self.state.lock().clone()
    }

    fn try_begin(&self, operation: VoiceOperationState) -> VoiceResult<VoiceOperationGuard<'_>> {
        let mut state = self.state.lock();
        if *state != VoiceOperationState::Idle {
            return Err(VoiceError::Conflict(format!(
                "voice operation '{}' is already in progress",
                operation_name(&state)
            )));
        }
        *state = operation;
        Ok(VoiceOperationGuard { coordinator: self })
    }

    fn cancel_generation(&self) -> bool {
        let mut state = self.state.lock();
        if matches!(
            *state,
            VoiceOperationState::Generating { cancelling: false }
        ) {
            *state = VoiceOperationState::Generating { cancelling: true };
            true
        } else {
            false
        }
    }

    fn cancel_model_install(&self) -> bool {
        let mut state = self.state.lock();
        if matches!(
            *state,
            VoiceOperationState::InstallingModel { cancelling: false }
        ) {
            *state = VoiceOperationState::InstallingModel { cancelling: true };
            true
        } else {
            false
        }
    }
}

struct VoiceOperationGuard<'a> {
    coordinator: &'a VoiceOperationCoordinator,
}

impl Drop for VoiceOperationGuard<'_> {
    fn drop(&mut self) {
        *self.coordinator.state.lock() = VoiceOperationState::Idle;
    }
}

fn operation_name(operation: &VoiceOperationState) -> &'static str {
    match operation {
        VoiceOperationState::Idle => "idle",
        VoiceOperationState::InstallingModel { .. } => "installingModel",
        VoiceOperationState::ImportingModel => "importingModel",
        VoiceOperationState::VerifyingModel => "verifyingModel",
        VoiceOperationState::RemovingModel => "removingModel",
        VoiceOperationState::Generating { .. } => "generating",
        VoiceOperationState::UpdatingCatalog => "updatingCatalog",
    }
}

fn operation_mutates_model(operation: &VoiceOperationState) -> bool {
    matches!(
        operation,
        VoiceOperationState::InstallingModel { .. }
            | VoiceOperationState::ImportingModel
            | VoiceOperationState::VerifyingModel
            | VoiceOperationState::RemovingModel
    )
}

#[derive(Debug, Clone)]
struct ModelValidationCacheEntry {
    version: String,
    fingerprint: ModelValidationFingerprint,
    state: ModelState,
    receipt: InstallReceipt,
}

#[derive(Debug, Default)]
struct ModelValidationCache {
    entry: Option<ModelValidationCacheEntry>,
    state: ModelState,
}

impl ModelValidationCache {
    fn lookup(
        &self,
        version: &ModelVersion,
        fingerprint: &ModelValidationFingerprint,
        force: bool,
    ) -> Option<(ModelState, InstallReceipt)> {
        if force {
            return None;
        }
        let entry = self.entry.as_ref()?;
        (entry.version == version.as_str() && &entry.fingerprint == fingerprint)
            .then(|| (entry.state.clone(), entry.receipt.clone()))
    }

    fn invalidate(&mut self) {
        self.entry = None;
    }

    fn clear(&mut self) {
        self.entry = None;
        self.state = ModelState::NotInstalled;
    }

    fn seed_ready(&mut self, version: &ModelVersion, snapshot: ModelValidationSnapshot) {
        let state = ModelState::Ready {
            version: version.as_str().to_string(),
        };
        self.entry = Some(ModelValidationCacheEntry {
            version: version.as_str().to_string(),
            fingerprint: snapshot.fingerprint,
            state: state.clone(),
            receipt: snapshot.receipt,
        });
        self.state = state;
    }
}

/// Caches the last successful `--probe` result for one sidecar backend so
/// repeated `voice_get_status` calls (page load, "refresh" click, and the
/// re-probe that generation does to pick a backend) don't re-spawn the
/// sidecar process every time. Invalidated automatically if the sidecar
/// executable's mtime/size changes (e.g. after a rebuild/update), and can be
/// bypassed with `force` (the UI's explicit refresh action).
#[derive(Debug, Clone)]
struct EngineProbeCacheEntry {
    path: PathBuf,
    modified_nanos: u128,
    size_bytes: u64,
    state: EngineState,
}

#[derive(Debug, Default)]
struct EngineProbeCache {
    cpu: Option<EngineProbeCacheEntry>,
    vulkan: Option<EngineProbeCacheEntry>,
}

impl EngineProbeCache {
    fn slot(&self, backend: EngineBackend) -> &Option<EngineProbeCacheEntry> {
        match backend {
            EngineBackend::Cpu => &self.cpu,
            EngineBackend::Vulkan => &self.vulkan,
        }
    }

    fn slot_mut(&mut self, backend: EngineBackend) -> &mut Option<EngineProbeCacheEntry> {
        match backend {
            EngineBackend::Cpu => &mut self.cpu,
            EngineBackend::Vulkan => &mut self.vulkan,
        }
    }

    fn lookup(
        &self,
        backend: EngineBackend,
        path: &Path,
        modified_nanos: u128,
        size_bytes: u64,
    ) -> Option<EngineState> {
        let entry = self.slot(backend).as_ref()?;
        (entry.path == path
            && entry.modified_nanos == modified_nanos
            && entry.size_bytes == size_bytes)
            .then(|| entry.state.clone())
    }

    fn store(
        &mut self,
        backend: EngineBackend,
        path: PathBuf,
        modified_nanos: u128,
        size_bytes: u64,
        state: EngineState,
    ) {
        *self.slot_mut(backend) = Some(EngineProbeCacheEntry {
            path,
            modified_nanos,
            size_bytes,
            state,
        });
    }
}

struct VoiceServiceInner {
    app_handle: AppHandle,
    voice_root: PathBuf,
    catalog: Mutex<models::VoiceCatalog>,
    player: Arc<dyn PlaybackSink>,
    http_client: reqwest::Client,
    sidecar_runner: Arc<dyn SidecarRunner>,
    model_downloader: Arc<dyn ModelDownloader>,
    model_store: Arc<dyn ModelStore>,
    operation: VoiceOperationCoordinator,
    model_validation: Mutex<ModelValidationCache>,
    fine_tuned_validation: Mutex<finetuned::FineTunedValidationCache>,
    engine_probe_cache: Mutex<EngineProbeCache>,
    generation_cancel: Mutex<CancellationToken>,
    generation_pid: Arc<Mutex<Option<u32>>>,
    download_cancel: Mutex<CancellationToken>,
}

#[derive(Clone)]
pub struct VoiceService {
    inner: Arc<VoiceServiceInner>,
}

impl VoiceService {
    pub fn new(app_handle: AppHandle) -> VoiceResult<Self> {
        let voice_root = catalog::voice_root_dir(&app_handle)?;
        let mut catalog_data = catalog::load_catalog(&voice_root)?;
        // Upgrades catalogs written before generation started enforcing a
        // single asset per phrase (e.g. from an older build), so leftover
        // unconfirmed takes don't linger forever with no way to clean them
        // up from the UI.
        let removed_assets = reconcile_single_asset_per_phrase(&mut catalog_data);
        if !removed_assets.is_empty() {
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
    fn commit_catalog(&self, updated: models::VoiceCatalog) -> VoiceResult<()> {
        catalog::save_catalog(&self.inner.voice_root, &updated)?;
        *self.inner.catalog.lock() = updated;
        Ok(())
    }

    /// Resolves `intent.phrase_id` to a generated WAV and enqueues playback.
    /// Never drops the cue silently: if the phrase is missing, has no
    /// active asset yet (not generated), or the asset file is gone from
    /// disk, a short built-in fallback tone plays instead so a
    /// misconfigured or pending rule is still noticeable.
    pub fn enqueue_cue(&self, intent: VoiceCueIntent) {
        // Only the (small, Copy-ish) active asset id needs to come out from
        // under the lock; the `path.is_file()` stat happens afterwards so
        // the catalog mutex is never held across filesystem IO.
        let active_asset_id = self
            .inner
            .catalog
            .lock()
            .phrases
            .iter()
            .find(|phrase| phrase.id == intent.phrase_id)
            .and_then(|phrase| phrase.active_asset_id.clone());
        let wav_path = active_asset_id.and_then(|asset_id| {
            let path =
                catalog::asset_wav_path(&self.inner.voice_root, &intent.phrase_id, &asset_id);
            path.is_file().then_some(path)
        });
        if wav_path.is_none() {
            warn!(
                target: "app::voice",
                "rule {} phrase {} has no generated audio; playing fallback tone",
                intent.rule_id, intent.phrase_id
            );
        }
        self.inner.player.enqueue(QueuedCue {
            rule_id: intent.rule_id,
            priority: intent.priority,
            wav_path,
        });
    }

    /// Production playback entry point for the frontend (e.g. a minimap
    /// mechanic edge detected client-side): enqueues `phrase_id` through the
    /// same enabled/volume/queue-policy-gated path as rule-triggered cues,
    /// as opposed to `test_trigger`/`preview_asset` which are for the voice
    /// settings UI and validate the asset exists first.
    pub fn enqueue_phrase(&self, phrase_id: &PhraseId, priority: u8) {
        self.enqueue_cue(VoiceCueIntent {
            rule_id: format!("frontend_{}", phrase_id.as_str()),
            phrase_id: phrase_id.as_str().to_string(),
            priority,
            triggered_at_ms: now_ms(),
        });
    }

    /// Creates a phrase named `name` if none exists yet, otherwise updates
    /// its text/language in place. Used by the frontend binding compiler so
    /// "auto" and "custom" phrase bindings resolve to a stable phrase id
    /// without the user ever visiting the phrase library.
    pub fn upsert_phrase(
        &self,
        name: String,
        text: String,
        language: VoiceLanguage,
    ) -> VoiceResult<VoicePhraseMeta> {
        let existing_id = self
            .inner
            .catalog
            .lock()
            .phrases
            .iter()
            .find(|phrase| phrase.name == name)
            .map(|phrase| phrase.id.clone());
        match existing_id {
            Some(id) => self.update_phrase(PhraseId::parse(id)?, name, text, language),
            None => self.create_phrase(name, text, language),
        }
    }

    pub fn test_trigger(&self, phrase_id: &PhraseId) -> VoiceResult<()> {
        if !self
            .inner
            .catalog
            .lock()
            .phrases
            .iter()
            .any(|phrase| phrase.id == phrase_id.as_str() && phrase.active_asset_id.is_some())
        {
            return Err(VoiceError::not_found(
                "active phrase asset",
                phrase_id.to_string(),
            ));
        }
        self.enqueue_cue(VoiceCueIntent {
            rule_id: PREVIEW_RULE_ID.to_string(),
            phrase_id: phrase_id.as_str().to_string(),
            priority: TEST_TRIGGER_PRIORITY,
            triggered_at_ms: now_ms(),
        });
        Ok(())
    }

    pub fn preview_asset(&self, phrase_id: &PhraseId, asset_id: &AssetId) -> VoiceResult<()> {
        let catalog = self.inner.catalog.lock();
        if !catalog
            .assets
            .iter()
            .any(|asset| asset.id == asset_id.as_str() && asset.phrase_id == phrase_id.as_str())
        {
            return Err(VoiceError::not_found("voice asset", asset_id.to_string()));
        }
        let wav_path = catalog::asset_wav_path(
            &self.inner.voice_root,
            phrase_id.as_str(),
            asset_id.as_str(),
        );
        drop(catalog);
        if !wav_path.is_file() {
            return Err(VoiceError::not_found(
                "asset WAV",
                wav_path.display().to_string(),
            ));
        }
        self.inner.player.enqueue(QueuedCue {
            rule_id: PREVIEW_RULE_ID.to_string(),
            priority: PREVIEW_PRIORITY,
            wav_path: Some(wav_path),
        });
        Ok(())
    }

    pub fn stop_playback(&self) {
        self.inner.player.stop_all();
    }

    pub fn shutdown(&self) {
        self.cancel_generation();
        self.cancel_model_download();
        self.inner.player.stop_all();
        self.inner.player.shutdown();
    }

    fn probe_backend_state(&self, backend: EngineBackend, path: &Path) -> EngineState {
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
    fn backend_status(&self, backend: EngineBackend, force: bool) -> VoiceBackendStatus {
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
    fn backend_inventory(&self, force: bool) -> VoiceBackendInventory {
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

    fn resolve_generation_backend(
        &self,
        preference: VoiceGenerationBackend,
    ) -> VoiceResult<(EngineBackend, PathBuf)> {
        let inventory = self.backend_inventory(false);
        let backend = select_backend(preference, &inventory)?;
        let path = resolve_sidecar_path(&self.inner.app_handle, backend)?;
        Ok((backend, path))
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
                    fine_tuned_service
                        .inner
                        .fine_tuned_validation
                        .lock()
                        .inspect(voice)
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

    pub fn inspect_fine_tuned_package(
        &self,
        package_path: &Path,
    ) -> VoiceResult<FineTunedVoiceMeta> {
        let candidate = finetuned::inspect_package(package_path, now_ms())?;
        let sidecar_path = resolve_sidecar_path(&self.inner.app_handle, EngineBackend::Cpu)?;
        let inspection = self
            .inner
            .sidecar_runner
            .inspect_model(&sidecar_path, Path::new(&candidate.transformer_path))?;
        finetuned::validate_model_inspection(&candidate, &inspection)?;
        Ok(candidate)
    }

    pub fn set_fine_tuned_voice(
        &self,
        package_path: &Path,
        expected_sha256: &str,
        replace_existing: bool,
    ) -> VoiceResult<FineTunedVoiceMeta> {
        let candidate = self.inspect_fine_tuned_package(package_path)?;
        if candidate.model_sha256 != expected_sha256.to_ascii_lowercase() {
            return Err(VoiceError::Security(
                "fine-tuned package changed after inspection".to_string(),
            ));
        }
        let mut catalog = self.inner.catalog.lock().clone();
        if catalog.fine_tuned_voice.is_some() && !replace_existing {
            return Err(VoiceError::Conflict(
                "a fine-tuned voice is already configured".to_string(),
            ));
        }
        let previous_sha = catalog
            .fine_tuned_voice
            .as_ref()
            .map(|voice| voice.model_sha256.clone());
        if let Some(previous_sha) = previous_sha
            && previous_sha != candidate.model_sha256
        {
            mark_fine_tuned_assets_stale(&mut catalog, &previous_sha);
        }
        catalog.fine_tuned_voice = Some(candidate.clone());
        self.commit_catalog(catalog)?;
        self.inner.fine_tuned_validation.lock().invalidate();
        Ok(candidate)
    }

    pub fn relink_fine_tuned_voice(
        &self,
        package_path: &Path,
        expected_sha256: &str,
    ) -> VoiceResult<FineTunedVoiceMeta> {
        let current = self
            .inner
            .catalog
            .lock()
            .fine_tuned_voice
            .clone()
            .ok_or_else(|| VoiceError::not_found("fine-tuned voice", "active"))?;
        if current.model_sha256 != expected_sha256.to_ascii_lowercase() {
            return Err(VoiceError::Security(
                "fine-tuned voice identity mismatch".to_string(),
            ));
        }
        self.set_fine_tuned_voice(package_path, expected_sha256, true)
    }

    pub fn remove_fine_tuned_voice(&self) -> VoiceResult<()> {
        let mut catalog = self.inner.catalog.lock().clone();
        if let Some(previous) = catalog.fine_tuned_voice.take() {
            mark_fine_tuned_assets_stale(&mut catalog, &previous.model_sha256);
        }
        self.commit_catalog(catalog)?;
        self.inner.fine_tuned_validation.lock().invalidate();
        Ok(())
    }

    pub async fn install_official_model(&self, source: ModelDownloadSource) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::InstallingModel { cancelling: false })?;
        self.inner.model_validation.lock().invalidate();
        let cancel = CancellationToken::new();
        *self.inner.download_cancel.lock() = cancel.clone();
        let manifest = self
            .inner
            .model_downloader
            .fetch(&self.inner.http_client, &cancel)
            .await?;
        let receipt = self
            .inner
            .model_downloader
            .install(
                &self.inner.app_handle,
                &self.inner.http_client,
                &self.inner.voice_root,
                &manifest,
                source,
                &cancel,
            )
            .await?;
        let model_version = ModelVersion::parse(receipt.model_version.clone())?;
        let model_dir = model_manager::model_dir(&self.inner.voice_root, &model_version);
        let snapshot = model_manager::inspect_model(&model_dir, &model_version)?;
        if snapshot.receipt != receipt {
            return Err(VoiceError::Security(
                "installed model receipt changed before commit".to_string(),
            ));
        }
        let mut catalog = self.inner.catalog.lock().clone();
        catalog.installed_model_version = Some(receipt.model_version.clone());
        catalog.installed_model_sha256 = receipt.primary_model_sha256().map(str::to_owned);
        self.commit_catalog(catalog)?;
        self.inner
            .model_validation
            .lock()
            .seed_ready(&model_version, snapshot);
        Ok(())
    }

    pub fn cancel_model_download(&self) {
        if self.inner.operation.cancel_model_install() {
            self.inner.download_cancel.lock().cancel();
        }
    }

    pub fn manual_import_model(
        &self,
        model_version: ModelVersion,
        source_files: Vec<PathBuf>,
    ) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::ImportingModel)?;
        self.inner.model_validation.lock().invalidate();
        let receipt =
            self.inner
                .model_store
                .import(&self.inner.voice_root, &model_version, &source_files)?;
        let model_dir = model_manager::model_dir(&self.inner.voice_root, &model_version);
        let snapshot = model_manager::inspect_model(&model_dir, &model_version)?;
        if snapshot.receipt != receipt {
            return Err(VoiceError::Security(
                "imported model receipt changed before commit".to_string(),
            ));
        }
        let mut catalog = self.inner.catalog.lock().clone();
        catalog.installed_model_version = Some(model_version.as_str().to_string());
        catalog.installed_model_sha256 = receipt.primary_model_sha256().map(str::to_owned);
        self.commit_catalog(catalog)?;
        self.inner
            .model_validation
            .lock()
            .seed_ready(&model_version, snapshot);
        Ok(())
    }

    pub fn remove_model(&self, model_version: ModelVersion) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::RemovingModel)?;
        self.inner
            .model_store
            .remove(&self.inner.voice_root, &model_version)?;
        let mut catalog = self.inner.catalog.lock().clone();
        let removed_active_model =
            catalog.installed_model_version.as_deref() == Some(model_version.as_str());
        if removed_active_model {
            catalog.installed_model_version = None;
            catalog.installed_model_sha256 = None;
        }
        self.commit_catalog(catalog)?;
        let mut cache = self.inner.model_validation.lock();
        if removed_active_model {
            cache.clear();
        } else {
            cache.invalidate();
        }
        Ok(())
    }

    pub fn verify_model(&self) -> VoiceResult<ModelState> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::VerifyingModel)?;
        let Some(model_version) = self.inner.catalog.lock().installed_model_version.clone() else {
            self.inner.model_validation.lock().clear();
            return Ok(ModelState::NotInstalled);
        };
        Ok(self.validate_model_cached(&model_version, true).0)
    }

    pub fn delete_profile(&self, profile_id: ProfileId) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        let catalog = self.inner.catalog.lock();
        if !catalog
            .profiles
            .iter()
            .any(|profile| profile.id == profile_id.as_str())
        {
            return Err(VoiceError::not_found(
                "voice profile",
                profile_id.to_string(),
            ));
        }
        let mut updated_catalog = catalog.clone();
        updated_catalog
            .profiles
            .retain(|profile| profile.id != profile_id.as_str());
        let directory = catalog::profile_dir(&self.inner.voice_root, profile_id.as_str());
        drop(catalog);
        if directory.exists() {
            std::fs::remove_dir_all(&directory).map_err(|error| {
                VoiceError::io(format!("remove {}", directory.display()), error)
            })?;
        }
        self.commit_catalog(updated_catalog)
    }

    pub fn create_phrase(
        &self,
        name: String,
        text: String,
        language: VoiceLanguage,
    ) -> VoiceResult<VoicePhraseMeta> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        validate_label("name", &name, 120)?;
        validate_label("text", &text, 1000)?;
        let phrase = VoicePhraseMeta {
            id: new_id("phrase"),
            name,
            text,
            language,
            active_asset_id: None,
            updated_at_ms: now_ms(),
        };
        let mut updated_catalog = self.inner.catalog.lock().clone();
        updated_catalog.phrases.push(phrase.clone());
        self.commit_catalog(updated_catalog)?;
        Ok(phrase)
    }

    pub fn update_phrase(
        &self,
        id: PhraseId,
        name: String,
        text: String,
        language: VoiceLanguage,
    ) -> VoiceResult<VoicePhraseMeta> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        validate_label("name", &name, 120)?;
        validate_label("text", &text, 1000)?;
        let mut updated_catalog = self.inner.catalog.lock().clone();
        let Some(phrase) = updated_catalog
            .phrases
            .iter_mut()
            .find(|phrase| phrase.id == id.as_str())
        else {
            return Err(VoiceError::not_found("voice phrase", id.to_string()));
        };
        let content_changed = phrase.text != text || phrase.language != language;
        phrase.name = name;
        phrase.text = text;
        phrase.language = language;
        phrase.updated_at_ms = now_ms();
        let updated = phrase.clone();
        if content_changed {
            for asset in updated_catalog
                .assets
                .iter_mut()
                .filter(|asset| asset.phrase_id == id.as_str())
            {
                asset.stale = true;
            }
        }
        self.commit_catalog(updated_catalog)?;
        Ok(updated)
    }

    pub fn delete_phrase(&self, id: PhraseId) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        let catalog = self.inner.catalog.lock();
        if !catalog
            .phrases
            .iter()
            .any(|phrase| phrase.id == id.as_str())
        {
            return Err(VoiceError::not_found("voice phrase", id.to_string()));
        }
        let mut updated_catalog = catalog.clone();
        updated_catalog
            .phrases
            .retain(|phrase| phrase.id != id.as_str());
        updated_catalog
            .assets
            .retain(|asset| asset.phrase_id != id.as_str());
        let directory = catalog::phrase_asset_dir(&self.inner.voice_root, id.as_str());
        drop(catalog);
        if directory.exists() {
            std::fs::remove_dir_all(&directory).map_err(|error| {
                VoiceError::io(format!("remove {}", directory.display()), error)
            })?;
        }
        self.commit_catalog(updated_catalog)
    }

    pub fn cancel_generation(&self) {
        if self.inner.operation.cancel_generation() {
            self.inner.generation_cancel.lock().cancel();
            self.kill_generation_process();
        }
    }

    fn kill_generation_process(&self) {
        if let Some(pid) = *self.inner.generation_pid.lock() {
            kill_process_by_pid(pid);
        }
    }

    pub fn generate_blocking(&self, request: GenerateRequest) -> VoiceResult<GenerationSummary> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::Generating { cancelling: false })?;
        let cancel = CancellationToken::new();
        *self.inner.generation_cancel.lock() = cancel.clone();
        self.generate_blocking_inner(request, &cancel)
    }

    fn generate_blocking_inner(
        &self,
        request: GenerateRequest,
        cancel: &CancellationToken,
    ) -> VoiceResult<GenerationSummary> {
        let mut artifacts = GenerationArtifactsGuard::default();
        if request.items.is_empty() {
            return Err(VoiceError::validation("phraseIds", "must not be empty"));
        }
        // CustomVoice uses a full-utterance prefill to match the official
        // Python inference path. The current Vulkan backend crashes on that
        // longer prefill, so keep fine-tuned generation on the verified CPU
        // path until the Vulkan graph issue is resolved.
        let backend_preference =
            generation_backend_preference(&request.source, request.backend_preference);
        let (backend, sidecar_path) = self.resolve_generation_backend(backend_preference)?;
        self.inner.sidecar_runner.probe(&sidecar_path)?;
        let model_version = self
            .inner
            .catalog
            .lock()
            .installed_model_version
            .clone()
            .ok_or_else(|| VoiceError::not_found("installed voice model", "active"))?;
        let model_version = ModelVersion::parse(model_version)?;
        let model_dir = model_manager::model_dir(&self.inner.voice_root, &model_version);
        let receipt = self.validated_model_receipt(&model_version)?;
        let base_model_sha256 = receipt
            .primary_model_sha256()
            .ok_or_else(|| {
                VoiceError::Security("model receipt has no GGUF fingerprint".to_string())
            })?
            .to_string();
        let base_transformer_path = receipt
            .files
            .iter()
            .find(|file| {
                file.name == "qwen3-tts-0.6b-q8_0.gguf" || file.name == "qwen3-tts-0.6b-f16.gguf"
            })
            .map(|file| model_dir.join(&file.name))
            .ok_or_else(|| VoiceError::Security("base transformer is missing".to_string()))?;
        let tokenizer_path = model_dir.join("qwen3-tts-tokenizer-f16.gguf");

        let (
            transformer_path,
            model_sha256,
            generation_model_version,
            source_spec,
            profile_id_for_new,
            reference_copy,
            asset_source,
        ) = match &request.source {
            VoiceSourceSelection::Clone(ProfileSelection::Existing { profile_id }) => {
                let catalog = self.inner.catalog.lock();
                let profile = catalog
                    .profiles
                    .iter()
                    .find(|profile| profile.id == profile_id.as_str())
                    .ok_or_else(|| {
                        VoiceError::not_found("voice profile", profile_id.to_string())
                    })?;
                if profile.model_version != model_version.as_str()
                    || profile.model_sha256 != base_model_sha256
                {
                    return Err(VoiceError::Incompatible(format!(
                        "profile {} was created for a different model",
                        profile_id.as_str()
                    )));
                }
                let q3sp_path =
                    catalog::profile_q3sp_path(&self.inner.voice_root, profile_id.as_str());
                if !q3sp_path.is_file() {
                    return Err(VoiceError::not_found(
                        "Q3SP profile",
                        q3sp_path.display().to_string(),
                    ));
                }
                (
                    base_transformer_path.clone(),
                    base_model_sha256.clone(),
                    model_version.as_str().to_string(),
                    SidecarSourceSpec {
                        mode: "profile_existing",
                        reference_wav_path: None,
                        save_q3sp_path: None,
                        existing_q3sp_path: Some(q3sp_path.display().to_string()),
                        speaker_token_id: None,
                    },
                    None,
                    None,
                    VoiceAssetSource::CloneProfile {
                        profile_id: profile_id.as_str().to_string(),
                    },
                )
            }
            VoiceSourceSelection::Clone(ProfileSelection::New(specification)) => {
                validate_label("profile.name", &specification.name, 120)?;
                let profile_id = new_id("profile");
                let destination = catalog::profile_dir(&self.inner.voice_root, &profile_id);
                std::fs::create_dir_all(catalog::profiles_dir(&self.inner.voice_root))
                    .map_err(|error| VoiceError::io("create voice profiles directory", error))?;
                std::fs::create_dir(&destination).map_err(|error| {
                    VoiceError::io(format!("create {}", destination.display()), error)
                })?;
                artifacts.track_profile_directory(destination.clone());
                let reference_copy = destination.join("reference.wav");
                audio::validate_and_copy_reference_wav(
                    Path::new(&specification.reference_wav_path),
                    &reference_copy,
                )?;
                (
                    base_transformer_path.clone(),
                    base_model_sha256.clone(),
                    model_version.as_str().to_string(),
                    SidecarSourceSpec {
                        mode: "profile_new",
                        reference_wav_path: Some(reference_copy.display().to_string()),
                        save_q3sp_path: Some(
                            destination.join("speaker.q3sp").display().to_string(),
                        ),
                        existing_q3sp_path: None,
                        speaker_token_id: None,
                    },
                    Some(profile_id.clone()),
                    Some(reference_copy),
                    VoiceAssetSource::CloneProfile { profile_id },
                )
            }
            VoiceSourceSelection::FineTuned => {
                let voice = self
                    .inner
                    .catalog
                    .lock()
                    .fine_tuned_voice
                    .clone()
                    .ok_or_else(|| VoiceError::not_found("fine-tuned voice", "active"))?;
                if !matches!(
                    finetuned::inspect_state(&voice),
                    FineTunedVoiceState::Ready { .. }
                ) {
                    return Err(VoiceError::Incompatible(
                        "the configured fine-tuned voice is missing or modified".to_string(),
                    ));
                }
                (
                    PathBuf::from(&voice.transformer_path),
                    voice.model_sha256.clone(),
                    format!("fine-tuned-{}", &voice.model_sha256[..16]),
                    SidecarSourceSpec {
                        mode: "speaker_token",
                        reference_wav_path: None,
                        save_q3sp_path: None,
                        existing_q3sp_path: None,
                        speaker_token_id: Some(voice.speaker_token_id),
                    },
                    None,
                    None,
                    VoiceAssetSource::FineTuned {
                        model_sha256: voice.model_sha256,
                        speaker_name: voice.speaker_name,
                        speaker_token_id: voice.speaker_token_id,
                    },
                )
            }
        };

        let catalog_snapshot = self.inner.catalog.lock().clone();
        let fingerprint_source = match &asset_source {
            VoiceAssetSource::CloneProfile { profile_id } => format!("clone:{profile_id}"),
            VoiceAssetSource::FineTuned {
                model_sha256,
                speaker_token_id,
                ..
            } => format!("fine-tuned:{model_sha256}:{speaker_token_id}"),
        };
        let (temperature, top_k) = generation_sampling_params(&asset_source);
        let mut sidecar_items = Vec::with_capacity(request.items.len());
        let mut phrase_by_item_id = HashMap::with_capacity(request.items.len());
        let mut output_paths = HashMap::with_capacity(request.items.len());
        let mut fingerprints = HashMap::with_capacity(request.items.len());
        for item in &request.items {
            let phrase = catalog_snapshot
                .phrases
                .iter()
                .find(|phrase| phrase.id == item.phrase_id.as_str())
                .ok_or_else(|| VoiceError::not_found("voice phrase", item.phrase_id.to_string()))?;
            let asset_id = new_id("asset");
            let output_dir = catalog::phrase_asset_dir(&self.inner.voice_root, &phrase.id);
            std::fs::create_dir_all(&output_dir).map_err(|error| {
                VoiceError::io(format!("create {}", output_dir.display()), error)
            })?;
            let output_path =
                catalog::asset_wav_path(&self.inner.voice_root, &phrase.id, &asset_id);
            phrase_by_item_id.insert(asset_id.clone(), phrase.id.clone());
            output_paths.insert(asset_id.clone(), output_path.clone());
            fingerprints.insert(
                asset_id.clone(),
                generation_fingerprint(phrase, &model_sha256, Some(&fingerprint_source)),
            );
            sidecar_items.push(SidecarItem {
                id: asset_id,
                text: phrase.text.clone(),
                language_id: phrase.language.sidecar_id(),
                output_path: output_path.display().to_string(),
                temperature,
                top_p: None,
                top_k,
                repetition_penalty: None,
                max_audio_tokens: None,
                min_duration_sec: None,
                max_duration_sec: None,
            });
        }
        let job = SidecarJob {
            protocol_version: SIDECAR_PROTOCOL_VERSION,
            transformer_path: transformer_path.display().to_string(),
            tokenizer_path: tokenizer_path.display().to_string(),
            source: source_spec,
            items: sidecar_items,
        };
        let job_file_path =
            self.inner
                .voice_root
                .join(format!("job_{}_{}.json", std::process::id(), now_ms()));
        artifacts.track_job_file(job_file_path.clone());
        artifacts.track_output_files(output_paths.values().cloned());
        let outcome = self.inner.sidecar_runner.run_batch(
            &self.inner.app_handle,
            &sidecar_path,
            backend,
            &job,
            &job_file_path,
            cancel,
            &self.inner.generation_pid,
        );
        let outcome = outcome?;

        if profile_id_for_new.is_some() && outcome.profile_meta.is_none() {
            return Err(VoiceError::Process(
                "sidecar completed without returning new profile metadata".to_string(),
            ));
        }

        let mut catalog = self.inner.catalog.lock().clone();
        let mut committed_asset_ids = Vec::new();
        if let (Some(profile_id), Some(meta)) = (&profile_id_for_new, &outcome.profile_meta) {
            if meta.model_sha256 != model_sha256 {
                return Err(VoiceError::Incompatible(
                    "sidecar profile fingerprint does not match the installed model".to_string(),
                ));
            }
            let keep_reference = matches!(
                &request.source,
                VoiceSourceSelection::Clone(ProfileSelection::New(specification))
                    if specification.keep_reference
            );
            if !keep_reference && let Some(path) = &reference_copy {
                let _ = std::fs::remove_file(path);
            }
            let name = match &request.source {
                VoiceSourceSelection::Clone(ProfileSelection::New(specification)) => {
                    specification.name.clone()
                }
                _ => String::new(),
            };
            catalog.profiles.push(VoiceProfileMeta {
                id: profile_id.clone(),
                name,
                created_at_ms: now_ms(),
                model_version: model_version.as_str().to_string(),
                embedding_dim: meta.embedding_dim,
                model_sha256: meta.model_sha256.clone(),
                ref_audio_sha256: meta.ref_audio_sha256.clone(),
                ref_audio_retained: keep_reference,
            });
        }
        let resolved_profile_id = match &asset_source {
            VoiceAssetSource::CloneProfile { profile_id } => Some(profile_id.clone()),
            VoiceAssetSource::FineTuned { .. } => None,
        };
        // A phrase keeps at most one asset: the freshly generated take
        // becomes active immediately and replaces whatever used to be
        // there, so users never need to manually confirm a take or clean
        // up old versions by hand.
        let mut replaced_assets: Vec<(String, String)> = Vec::new();
        for item in &outcome.item_results {
            if !item.ok {
                continue;
            }
            let Some(phrase_id) = phrase_by_item_id.get(&item.id).cloned() else {
                continue;
            };
            let expected_path = output_paths
                .get(&item.id)
                .ok_or_else(|| VoiceError::Internal("missing generated output path".to_string()))?;
            if item.output_path.as_deref() != Some(expected_path.to_string_lossy().as_ref()) {
                return Err(VoiceError::Security(format!(
                    "sidecar returned an unexpected output path for {}",
                    item.id
                )));
            }
            let wav = audio::read_wav_info(expected_path)?;
            for stale in catalog
                .assets
                .iter()
                .filter(|asset| asset.phrase_id == phrase_id)
            {
                replaced_assets.push((phrase_id.clone(), stale.id.clone()));
            }
            catalog.assets.retain(|asset| asset.phrase_id != phrase_id);
            catalog.assets.push(VoiceAssetMeta {
                id: item.id.clone(),
                phrase_id: phrase_id.clone(),
                source: asset_source.clone(),
                model_version: generation_model_version.clone(),
                params_fingerprint: fingerprints.get(&item.id).cloned().unwrap_or_default(),
                created_at_ms: now_ms(),
                duration_sec: wav.duration_sec,
                sample_rate: wav.sample_rate as i32,
                stale: false,
            });
            if let Some(phrase) = catalog
                .phrases
                .iter_mut()
                .find(|phrase| phrase.id == phrase_id)
            {
                phrase.active_asset_id = Some(item.id.clone());
            }
            committed_asset_ids.push(item.id.clone());
        }
        self.commit_catalog(catalog)?;
        artifacts.commit();
        remove_asset_files_best_effort(&self.inner.voice_root, &replaced_assets);
        Ok(GenerationSummary {
            completed: outcome.completed,
            failed: outcome.failed,
            profile_id: resolved_profile_id,
            asset_ids: committed_asset_ids,
        })
    }

    fn validate_model_cached(
        &self,
        model_version: &str,
        force: bool,
    ) -> (ModelState, Option<InstallReceipt>) {
        let version = match ModelVersion::parse(model_version.to_string()) {
            Ok(version) => version,
            Err(error) => {
                let state = ModelState::Corrupt {
                    version: model_version.to_string(),
                    reason: error.to_string(),
                };
                let mut cache = self.inner.model_validation.lock();
                cache.invalidate();
                cache.state = state.clone();
                return (state, None);
            }
        };
        let model_dir = model_manager::model_dir(&self.inner.voice_root, &version);
        if !model_dir.is_dir() {
            let mut cache = self.inner.model_validation.lock();
            cache.clear();
            return (ModelState::NotInstalled, None);
        }

        let mut cache = self.inner.model_validation.lock();
        let snapshot = match model_manager::inspect_model(&model_dir, &version) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                let state = ModelState::Corrupt {
                    version: version.as_str().to_string(),
                    reason: error.to_string(),
                };
                cache.invalidate();
                cache.state = state.clone();
                return (state, None);
            }
        };
        if let Some((state, receipt)) = cache.lookup(&version, &snapshot.fingerprint, force) {
            return (state, Some(receipt));
        }

        let state = match model_manager::verify_model_snapshot_cached(&model_dir, &snapshot, force)
        {
            Ok(()) => ModelState::Ready {
                version: version.as_str().to_string(),
            },
            Err(error) => ModelState::Corrupt {
                version: version.as_str().to_string(),
                reason: error.to_string(),
            },
        };
        let receipt = snapshot.receipt.clone();
        cache.entry = Some(ModelValidationCacheEntry {
            version: version.as_str().to_string(),
            fingerprint: snapshot.fingerprint,
            state: state.clone(),
            receipt: receipt.clone(),
        });
        cache.state = state.clone();
        let receipt = matches!(state, ModelState::Ready { .. }).then_some(receipt);
        (state, receipt)
    }

    fn validated_model_receipt(&self, model_version: &ModelVersion) -> VoiceResult<InstallReceipt> {
        let (state, receipt) = self.validate_model_cached(model_version.as_str(), false);
        match (state, receipt) {
            (ModelState::Ready { .. }, Some(receipt)) => Ok(receipt),
            (ModelState::NotInstalled, _) => Err(VoiceError::not_found(
                "installed voice model",
                model_version.to_string(),
            )),
            (ModelState::Corrupt { reason, .. }, _) => Err(VoiceError::Security(reason)),
            (other, _) => Err(VoiceError::Conflict(format!(
                "voice model is unavailable while in state {other:?}"
            ))),
        }
    }
}

#[derive(Debug, Default)]
struct GenerationArtifactsGuard {
    job_file: Option<PathBuf>,
    output_files: Vec<PathBuf>,
    profile_directory: Option<PathBuf>,
    committed: bool,
}

impl GenerationArtifactsGuard {
    fn track_job_file(&mut self, path: PathBuf) {
        self.job_file = Some(path);
    }

    fn track_output_files(&mut self, paths: impl IntoIterator<Item = PathBuf>) {
        self.output_files.extend(paths);
    }

    fn track_profile_directory(&mut self, path: PathBuf) {
        self.profile_directory = Some(path);
    }

    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for GenerationArtifactsGuard {
    fn drop(&mut self) {
        if let Some(path) = &self.job_file {
            remove_file_if_present(path, "generation job");
        }
        if self.committed {
            return;
        }
        for path in &self.output_files {
            remove_file_if_present(path, "uncommitted generated audio");
            let mut temporary = path.as_os_str().to_os_string();
            temporary.push(".tmp");
            remove_file_if_present(Path::new(&temporary), "temporary generated audio");
            if let Some(parent) = path.parent()
                && let Err(error) = std::fs::remove_dir(parent)
                && error.kind() != std::io::ErrorKind::NotFound
                && error.kind() != std::io::ErrorKind::DirectoryNotEmpty
            {
                warn!(target: "app::voice", "failed to remove empty asset directory {}: {error}", parent.display());
            }
        }
        if let Some(path) = &self.profile_directory
            && let Err(error) = std::fs::remove_dir_all(path)
            && error.kind() != std::io::ErrorKind::NotFound
        {
            warn!(target: "app::voice", "failed to remove uncommitted profile directory {}: {error}", path.display());
        }
    }
}

fn remove_file_if_present(path: &Path, description: &str) {
    if let Err(error) = std::fs::remove_file(path)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        warn!(target: "app::voice", "failed to remove {description} {}: {error}", path.display());
    }
}

fn validate_label(field: &'static str, value: &str, max_len: usize) -> VoiceResult<()> {
    if value.trim().is_empty() {
        return Err(VoiceError::validation(field, "must not be empty"));
    }
    if value.len() > max_len {
        return Err(VoiceError::validation(
            field,
            format!("must be at most {max_len} bytes"),
        ));
    }
    Ok(())
}

fn generation_fingerprint(
    phrase: &VoicePhraseMeta,
    model_sha256: &str,
    profile_id: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(phrase.text.as_bytes());
    hasher.update([0]);
    hasher.update(phrase.language.sidecar_id().to_le_bytes());
    hasher.update(model_sha256.as_bytes());
    hasher.update(profile_id.unwrap_or_default().as_bytes());
    hex::encode(hasher.finalize())
}

fn generation_sampling_params(source: &VoiceAssetSource) -> (Option<f32>, Option<i32>) {
    if matches!(source, VoiceAssetSource::FineTuned { .. }) {
        (Some(FINE_TUNED_TEMPERATURE), Some(FINE_TUNED_TOP_K))
    } else {
        (None, None)
    }
}

/// Enforces the "at most one asset per phrase" invariant. For any phrase
/// with more than one asset, keeps the phrase's active asset if it's still
/// present, otherwise the most recently created one, and drops the rest
/// from the catalog. Returns the `(phrase_id, asset_id)` pairs that were
/// dropped so the caller can remove their WAV files afterwards.
fn reconcile_single_asset_per_phrase(catalog: &mut models::VoiceCatalog) -> Vec<(String, String)> {
    let mut removed = Vec::new();
    let phrase_ids: Vec<String> = catalog.phrases.iter().map(|phrase| phrase.id.clone()).collect();
    for phrase_id in phrase_ids {
        let mut candidate_indices: Vec<usize> = catalog
            .assets
            .iter()
            .enumerate()
            .filter(|(_, asset)| asset.phrase_id == phrase_id)
            .map(|(index, _)| index)
            .collect();
        if candidate_indices.len() <= 1 {
            continue;
        }
        candidate_indices.sort_by_key(|&index| catalog.assets[index].created_at_ms);
        let active_asset_id = catalog
            .phrases
            .iter()
            .find(|phrase| phrase.id == phrase_id)
            .and_then(|phrase| phrase.active_asset_id.clone());
        let keep_index = active_asset_id
            .as_deref()
            .and_then(|active_id| {
                candidate_indices
                    .iter()
                    .copied()
                    .find(|&index| catalog.assets[index].id == active_id)
            })
            .or_else(|| candidate_indices.last().copied());
        let Some(keep_index) = keep_index else { continue };
        let keep_id = catalog.assets[keep_index].id.clone();
        for &index in &candidate_indices {
            let asset_id = &catalog.assets[index].id;
            if *asset_id != keep_id {
                removed.push((phrase_id.clone(), asset_id.clone()));
            }
        }
        catalog
            .assets
            .retain(|asset| asset.phrase_id != phrase_id || asset.id == keep_id);
        if let Some(phrase) = catalog
            .phrases
            .iter_mut()
            .find(|phrase| phrase.id == phrase_id)
        {
            phrase.active_asset_id = Some(keep_id);
        }
    }
    removed
}

/// Best-effort deletion of generated WAV files for `(phrase_id, asset_id)`
/// pairs that have already been dropped from the catalog. Failures are
/// logged rather than propagated: the catalog (the source of truth) has
/// already been committed without these assets, so a stray file left on
/// disk is a cosmetic leak, not a correctness issue.
fn remove_asset_files_best_effort(voice_root: &Path, assets: &[(String, String)]) {
    for (phrase_id, asset_id) in assets {
        let path = catalog::asset_wav_path(voice_root, phrase_id, asset_id);
        if path.exists() && let Err(error) = std::fs::remove_file(&path) {
            warn!(
                target: "app::voice",
                "failed to remove replaced voice asset {}: {error}",
                path.display()
            );
        }
    }
}

fn mark_fine_tuned_assets_stale(catalog: &mut models::VoiceCatalog, model_sha256: &str) {
    for asset in &mut catalog.assets {
        if matches!(
            &asset.source,
            VoiceAssetSource::FineTuned { model_sha256: asset_sha, .. }
                if asset_sha == model_sha256
        ) {
            asset.stale = true;
        }
    }
}

fn resolve_sidecar_path(app_handle: &AppHandle, backend: EngineBackend) -> VoiceResult<PathBuf> {
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

fn engine_ready(state: &EngineState) -> bool {
    matches!(state, EngineState::Ready { .. })
}

fn recommended_backend(inventory: &VoiceBackendInventory) -> EngineBackend {
    if engine_ready(&inventory.vulkan.engine) {
        EngineBackend::Vulkan
    } else {
        EngineBackend::Cpu
    }
}

fn generation_backend_preference(
    source: &VoiceSourceSelection,
    preference: VoiceGenerationBackend,
) -> VoiceGenerationBackend {
    if matches!(source, VoiceSourceSelection::FineTuned) {
        VoiceGenerationBackend::Cpu
    } else {
        preference
    }
}

fn select_backend(
    preference: VoiceGenerationBackend,
    inventory: &VoiceBackendInventory,
) -> VoiceResult<EngineBackend> {
    let backend = match preference {
        VoiceGenerationBackend::Auto => recommended_backend(inventory),
        VoiceGenerationBackend::Cpu => EngineBackend::Cpu,
        VoiceGenerationBackend::Vulkan => EngineBackend::Vulkan,
    };
    let status = match backend {
        EngineBackend::Cpu => &inventory.cpu,
        EngineBackend::Vulkan => &inventory.vulkan,
    };
    if !engine_ready(&status.engine) {
        return Err(VoiceError::Incompatible(format!(
            "requested voice generation backend is unavailable: {}",
            backend.as_str()
        )));
    }
    Ok(backend)
}

#[cfg(windows)]
fn kill_process_by_pid(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let result = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    if let Err(error) = result {
        warn!(target: "app::voice", "failed to terminate sidecar pid {pid}: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacing_a_fine_tuned_model_only_stales_matching_assets() {
        let old_sha = "a".repeat(64);
        let other_sha = "b".repeat(64);
        let mut catalog = models::VoiceCatalog::default();
        catalog.assets = vec![
            VoiceAssetMeta {
                source: VoiceAssetSource::FineTuned {
                    model_sha256: old_sha.clone(),
                    speaker_name: "old".into(),
                    speaker_token_id: 3000,
                },
                ..VoiceAssetMeta::default()
            },
            VoiceAssetMeta {
                source: VoiceAssetSource::FineTuned {
                    model_sha256: other_sha,
                    speaker_name: "other".into(),
                    speaker_token_id: 3001,
                },
                ..VoiceAssetMeta::default()
            },
            VoiceAssetMeta {
                source: VoiceAssetSource::CloneProfile {
                    profile_id: "profile-1".into(),
                },
                ..VoiceAssetMeta::default()
            },
        ];

        mark_fine_tuned_assets_stale(&mut catalog, &old_sha);

        assert!(catalog.assets[0].stale);
        assert!(!catalog.assets[1].stale);
        assert!(!catalog.assets[2].stale);
    }

    fn phrase_stub(id: &str, active_asset_id: Option<&str>) -> VoicePhraseMeta {
        VoicePhraseMeta {
            id: id.to_string(),
            active_asset_id: active_asset_id.map(str::to_string),
            ..VoicePhraseMeta::default()
        }
    }

    fn asset_stub(id: &str, phrase_id: &str, created_at_ms: i64) -> VoiceAssetMeta {
        VoiceAssetMeta {
            id: id.to_string(),
            phrase_id: phrase_id.to_string(),
            created_at_ms,
            ..VoiceAssetMeta::default()
        }
    }

    #[test]
    fn reconcile_keeps_the_active_asset_over_a_newer_unconfirmed_one() {
        let mut catalog = models::VoiceCatalog::default();
        catalog.phrases = vec![phrase_stub("phrase-1", Some("asset-old"))];
        catalog.assets = vec![
            asset_stub("asset-old", "phrase-1", 100),
            asset_stub("asset-new", "phrase-1", 200),
        ];

        let removed = reconcile_single_asset_per_phrase(&mut catalog);

        assert_eq!(removed, vec![("phrase-1".to_string(), "asset-new".to_string())]);
        assert_eq!(catalog.assets.len(), 1);
        assert_eq!(catalog.assets[0].id, "asset-old");
        assert_eq!(
            catalog.phrases[0].active_asset_id.as_deref(),
            Some("asset-old")
        );
    }

    #[test]
    fn reconcile_falls_back_to_the_newest_asset_when_none_is_active() {
        let mut catalog = models::VoiceCatalog::default();
        catalog.phrases = vec![phrase_stub("phrase-1", None)];
        catalog.assets = vec![
            asset_stub("asset-1", "phrase-1", 100),
            asset_stub("asset-2", "phrase-1", 300),
            asset_stub("asset-3", "phrase-1", 200),
        ];

        let mut removed = reconcile_single_asset_per_phrase(&mut catalog);
        removed.sort();

        assert_eq!(
            removed,
            vec![
                ("phrase-1".to_string(), "asset-1".to_string()),
                ("phrase-1".to_string(), "asset-3".to_string()),
            ]
        );
        assert_eq!(catalog.assets.len(), 1);
        assert_eq!(catalog.assets[0].id, "asset-2");
        assert_eq!(
            catalog.phrases[0].active_asset_id.as_deref(),
            Some("asset-2")
        );
    }

    #[test]
    fn reconcile_is_a_no_op_for_phrases_with_a_single_asset() {
        let mut catalog = models::VoiceCatalog::default();
        catalog.phrases = vec![phrase_stub("phrase-1", Some("asset-1"))];
        catalog.assets = vec![asset_stub("asset-1", "phrase-1", 100)];

        let removed = reconcile_single_asset_per_phrase(&mut catalog);

        assert!(removed.is_empty());
        assert_eq!(catalog.assets.len(), 1);
    }

    #[test]
    fn fine_tuned_generation_uses_stabilized_sampling() {
        let fine_tuned = VoiceAssetSource::FineTuned {
            model_sha256: "a".repeat(64),
            speaker_name: "speaker".into(),
            speaker_token_id: 3000,
        };
        let clone = VoiceAssetSource::CloneProfile {
            profile_id: "profile-1".into(),
        };

        assert_eq!(
            generation_sampling_params(&fine_tuned),
            (Some(FINE_TUNED_TEMPERATURE), Some(FINE_TUNED_TOP_K))
        );
        assert_eq!(generation_sampling_params(&clone), (None, None));
    }

    fn test_receipt() -> InstallReceipt {
        InstallReceipt {
            schema_version: 1,
            model_version: "test-v1".to_string(),
            manifest_sha256: None,
            source: "test".to_string(),
            installed_at_ms: 0,
            files: vec![model_manager::InstallReceiptFile {
                name: "model.gguf".to_string(),
                size_bytes: 1,
                sha256: "a".repeat(64),
            }],
        }
    }

    fn test_fingerprint(receipt_sha256: &str) -> ModelValidationFingerprint {
        ModelValidationFingerprint {
            receipt_sha256: receipt_sha256.to_string(),
            files: Vec::new(),
        }
    }

    #[test]
    fn operation_guard_rejects_conflicts_and_restores_idle() {
        let coordinator = VoiceOperationCoordinator::default();
        let guard = coordinator
            .try_begin(VoiceOperationState::Generating { cancelling: false })
            .unwrap();

        for operation in [
            VoiceOperationState::InstallingModel { cancelling: false },
            VoiceOperationState::ImportingModel,
            VoiceOperationState::VerifyingModel,
            VoiceOperationState::RemovingModel,
            VoiceOperationState::Generating { cancelling: false },
            VoiceOperationState::UpdatingCatalog,
        ] {
            assert!(matches!(
                coordinator.try_begin(operation),
                Err(VoiceError::Conflict(_))
            ));
        }

        drop(guard);
        assert_eq!(coordinator.state(), VoiceOperationState::Idle);
    }

    #[test]
    fn operation_guard_restores_idle_on_error_path() {
        fn fail(coordinator: &VoiceOperationCoordinator) -> VoiceResult<()> {
            let _guard = coordinator.try_begin(VoiceOperationState::UpdatingCatalog)?;
            Err(VoiceError::Internal("expected failure".to_string()))
        }

        let coordinator = VoiceOperationCoordinator::default();
        assert!(fail(&coordinator).is_err());
        assert_eq!(coordinator.state(), VoiceOperationState::Idle);
    }

    #[test]
    fn only_matching_operations_can_enter_cancelling() {
        let coordinator = VoiceOperationCoordinator::default();
        let generation = coordinator
            .try_begin(VoiceOperationState::Generating { cancelling: false })
            .unwrap();
        assert!(!coordinator.cancel_model_install());
        assert!(coordinator.cancel_generation());
        assert_eq!(
            coordinator.state(),
            VoiceOperationState::Generating { cancelling: true }
        );
        assert!(!coordinator.cancel_generation());
        drop(generation);

        let install = coordinator
            .try_begin(VoiceOperationState::InstallingModel { cancelling: false })
            .unwrap();
        assert!(!coordinator.cancel_generation());
        assert!(coordinator.cancel_model_install());
        assert_eq!(
            coordinator.state(),
            VoiceOperationState::InstallingModel { cancelling: true }
        );
        drop(install);
    }

    #[test]
    fn validation_cache_reuses_matching_fingerprint_but_force_bypasses_it() {
        let version = ModelVersion::parse("test-v1").unwrap();
        let fingerprint = test_fingerprint("first");
        let mut cache = ModelValidationCache::default();
        cache.seed_ready(
            &version,
            ModelValidationSnapshot {
                receipt: test_receipt(),
                fingerprint: fingerprint.clone(),
            },
        );

        assert!(cache.lookup(&version, &fingerprint, false).is_some());
        assert!(cache.lookup(&version, &fingerprint, true).is_none());
        assert!(
            cache
                .lookup(&version, &test_fingerprint("changed"), false)
                .is_none()
        );
        cache.invalidate();
        assert!(cache.lookup(&version, &fingerprint, false).is_none());
    }

    #[test]
    fn generation_artifacts_are_removed_unless_committed() {
        let directory = tempfile::tempdir().unwrap();
        let job = directory.path().join("job.json");
        let output = directory.path().join("assets").join("asset.wav");
        let output_tmp = PathBuf::from(format!("{}.tmp", output.display()));
        let profile = directory.path().join("profile");
        std::fs::create_dir_all(output.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&profile).unwrap();
        std::fs::write(&job, b"job").unwrap();
        std::fs::write(&output, b"wav").unwrap();
        std::fs::write(&output_tmp, b"partial").unwrap();
        std::fs::write(profile.join("speaker.q3sp"), b"profile").unwrap();

        let mut guard = GenerationArtifactsGuard::default();
        guard.track_job_file(job.clone());
        guard.track_output_files([output.clone()]);
        guard.track_profile_directory(profile.clone());
        drop(guard);

        assert!(!job.exists());
        assert!(!output.exists());
        assert!(!output_tmp.exists());
        assert!(!profile.exists());
    }

    #[test]
    fn committed_generation_keeps_outputs_but_removes_job() {
        let directory = tempfile::tempdir().unwrap();
        let job = directory.path().join("job.json");
        let output = directory.path().join("asset.wav");
        let profile = directory.path().join("profile");
        std::fs::create_dir_all(&profile).unwrap();
        std::fs::write(&job, b"job").unwrap();
        std::fs::write(&output, b"wav").unwrap();

        let mut guard = GenerationArtifactsGuard::default();
        guard.track_job_file(job.clone());
        guard.track_output_files([output.clone()]);
        guard.track_profile_directory(profile.clone());
        guard.commit();
        drop(guard);

        assert!(!job.exists());
        assert!(output.exists());
        assert!(profile.exists());
    }

    fn ready_backend(backend: EngineBackend) -> VoiceBackendStatus {
        VoiceBackendStatus {
            backend,
            engine: EngineState::Ready {
                probe: models::EngineProbe {
                    engine: "qwen3-tts-sidecar".into(),
                    protocol_version: SIDECAR_PROTOCOL_VERSION,
                    source_commit: "test".into(),
                    build_type: "Debug".into(),
                    variant: backend.as_str().into(),
                    stub: false,
                    compiled_backends: vec![backend],
                    devices: vec![models::EngineDevice {
                        backend,
                        name: backend.as_str().into(),
                        device_type: if backend == EngineBackend::Cpu {
                            models::EngineDeviceType::Cpu
                        } else {
                            models::EngineDeviceType::DiscreteGpu
                        },
                    }],
                    supported_languages: vec![
                        VoiceLanguage::ZhCn,
                        VoiceLanguage::EnUs,
                        VoiceLanguage::JaJp,
                    ],
                },
            },
            component_version: None,
            update_available: false,
        }
    }

    #[test]
    fn automatic_backend_selection_uses_vulkan_then_cpu() {
        let mut inventory = VoiceBackendInventory::default();
        inventory.cpu = ready_backend(EngineBackend::Cpu);
        assert_eq!(
            select_backend(VoiceGenerationBackend::Auto, &inventory).unwrap(),
            EngineBackend::Cpu
        );

        inventory.vulkan = ready_backend(EngineBackend::Vulkan);
        assert_eq!(
            select_backend(VoiceGenerationBackend::Auto, &inventory).unwrap(),
            EngineBackend::Vulkan
        );
    }

    #[test]
    fn fine_tuned_generation_forces_cpu_backend() {
        assert_eq!(
            generation_backend_preference(
                &VoiceSourceSelection::FineTuned,
                VoiceGenerationBackend::Vulkan,
            ),
            VoiceGenerationBackend::Cpu
        );
    }

    #[test]
    fn unavailable_manual_backend_does_not_fall_back() {
        let mut inventory = VoiceBackendInventory::default();
        inventory.cpu = ready_backend(EngineBackend::Cpu);
        assert!(select_backend(VoiceGenerationBackend::Vulkan, &inventory).is_err());
    }
}

#[cfg(not(windows))]
fn kill_process_by_pid(pid: u32) {
    let result = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status();
    if let Err(error) = result {
        warn!(target: "app::voice", "failed to terminate sidecar pid {pid}: {error}");
    }
}
