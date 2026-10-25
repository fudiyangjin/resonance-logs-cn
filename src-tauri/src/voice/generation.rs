//! TTS generation pipeline: request types, backend selection, source
//! resolution (clone / preset / fine-tuned) and the blocking sidecar run.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use log::warn;
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

use super::error::{VoiceError, VoiceResult};
use super::models::{
    EngineBackend, FineTunedVoiceState, SIDECAR_PROTOCOL_VERSION, SidecarItem, SidecarJob,
    SidecarSourceSpec, VoiceAssetMeta, VoiceAssetSource, VoiceBackendInventory,
    VoiceGenerationBackend, VoiceOperationState, VoicePhraseMeta, VoiceProfileMeta,
};
use super::phrases::{phrase_has_imported_audio, remove_asset_files_best_effort, validate_label};
use super::service::{VoiceService, engine_ready, resolve_sidecar_path};
use super::types::{ModelVersion, PhraseId, ProfileId};
use super::{audio, catalog, finetuned, model_manager, models, presets};
use super::{new_id, now_ms};

pub(super) const FINE_TUNED_TEMPERATURE: f32 = 0.5;

pub(super) const FINE_TUNED_TOP_K: i32 = 20;

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
    /// Auto-selects the bundled reference voice for a UI locale (see
    /// `voice::presets`), extracting-and-caching a clone profile from it
    /// on first use.
    Preset(presets::VoicePresetLocale),
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

/// Metadata needed to persist a brand-new clone profile once the sidecar
/// confirms extraction. Kept separate from `VoiceSourceSelection` so every
/// source variant that can mint a new profile (manual upload, preset)
/// populates it the same way, instead of the commit step re-matching on
/// `request.source`.
pub(super) struct PendingProfile {
    profile_id: String,
    name: String,
    keep_reference: bool,
    preset: Option<presets::VoicePresetTag>,
}

/// Everything `generate_blocking_inner` needs to build and submit a sidecar
/// job for one resolved voice source (existing clone profile, freshly
/// extracted clone profile, or fine-tuned speaker token).
pub(super) struct ResolvedGenerationSource {
    transformer_path: PathBuf,
    model_sha256: String,
    generation_model_version: String,
    source_spec: SidecarSourceSpec,
    /// `Some` only when this source will mint a new clone profile pending
    /// sidecar confirmation.
    pending_profile: Option<PendingProfile>,
    /// The reference WAV copy under the voice profile directory, present
    /// only alongside `pending_profile` so it can be deleted afterwards
    /// unless the caller opted to keep it.
    reference_copy: Option<PathBuf>,
    asset_source: VoiceAssetSource,
}

#[derive(Debug, Default)]
pub(super) struct GenerationArtifactsGuard {
    job_file: Option<PathBuf>,
    output_files: Vec<PathBuf>,
    profile_directory: Option<PathBuf>,
    committed: bool,
}

impl GenerationArtifactsGuard {
    fn track_job_file(&mut self, path: PathBuf) {
        self.job_file = Some(path);
    }

    pub(super) fn track_output_files(&mut self, paths: impl IntoIterator<Item = PathBuf>) {
        self.output_files.extend(paths);
    }

    fn track_profile_directory(&mut self, path: PathBuf) {
        self.profile_directory = Some(path);
    }

    pub(super) fn commit(&mut self) {
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

pub(super) fn remove_file_if_present(path: &Path, description: &str) {
    if let Err(error) = std::fs::remove_file(path)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        warn!(target: "app::voice", "failed to remove {description} {}: {error}", path.display());
    }
}

pub(super) fn generation_fingerprint(
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

/// Rejects the batch up front when any phrase plays imported audio, so a
/// mixed batch fails before a single item is synthesized.
pub(super) fn ensure_generatable(
    catalog: &models::VoiceCatalog,
    items: &[GenerateItemRequest],
) -> VoiceResult<()> {
    match items
        .iter()
        .find(|item| phrase_has_imported_audio(catalog, item.phrase_id.as_str()))
    {
        Some(item) => Err(VoiceError::validation(
            "phraseIds",
            format!(
                "phrase {} uses imported audio and cannot be generated",
                item.phrase_id
            ),
        )),
        None => Ok(()),
    }
}

/// A phrase keeps at most one asset: each freshly generated take becomes
/// active immediately and replaces whatever used to be there, so users never
/// need to confirm a take or clean up old versions by hand. Returns the
/// replaced `(phrase_id, asset_id)` pairs, whose files the caller removes
/// once the catalog is committed.
pub(super) fn apply_generated_assets(
    catalog: &mut models::VoiceCatalog,
    generated: Vec<VoiceAssetMeta>,
) -> Vec<(String, String)> {
    let mut replaced = Vec::new();
    for asset in generated {
        replaced.extend(
            catalog
                .assets
                .iter()
                .filter(|existing| existing.phrase_id == asset.phrase_id)
                .map(|existing| (existing.phrase_id.clone(), existing.id.clone())),
        );
        catalog
            .assets
            .retain(|existing| existing.phrase_id != asset.phrase_id);
        if let Some(phrase) = catalog
            .phrases
            .iter_mut()
            .find(|phrase| phrase.id == asset.phrase_id)
        {
            phrase.active_asset_id = Some(asset.id.clone());
        }
        catalog.assets.push(asset);
    }
    replaced
}

pub(super) fn generation_sampling_params(source: &VoiceAssetSource) -> (Option<f32>, Option<i32>) {
    if matches!(source, VoiceAssetSource::FineTuned { .. }) {
        (Some(FINE_TUNED_TEMPERATURE), Some(FINE_TUNED_TOP_K))
    } else {
        (None, None)
    }
}

/// Pure catalog lookup backing [`VoiceService::find_matching_preset_profile`],
/// split out so the locale/revision/model matching rules can be unit tested
/// without a real `AppHandle`. A profile only matches when its stored
/// [`presets::VoicePresetTag`] is identical to `tag` (same locale *and* same
/// manifest revision) and it was extracted from the currently installed
/// model.
pub(super) fn find_preset_profile_id_in_catalog<'catalog>(
    catalog: &'catalog models::VoiceCatalog,
    tag: &presets::VoicePresetTag,
    model_version: &str,
    base_model_sha256: &str,
) -> Option<&'catalog str> {
    catalog.profiles.iter().find_map(|profile| {
        (profile.preset.as_ref() == Some(tag)
            && profile.model_version == model_version
            && profile.model_sha256 == base_model_sha256)
            .then_some(profile.id.as_str())
    })
}

pub(super) fn recommended_backend(inventory: &VoiceBackendInventory) -> EngineBackend {
    if engine_ready(&inventory.vulkan.engine) {
        EngineBackend::Vulkan
    } else {
        EngineBackend::Cpu
    }
}

pub(super) fn generation_backend_preference(
    source: &VoiceSourceSelection,
    preference: VoiceGenerationBackend,
) -> VoiceGenerationBackend {
    if matches!(source, VoiceSourceSelection::FineTuned) {
        VoiceGenerationBackend::Cpu
    } else {
        preference
    }
}

pub(super) fn select_backend(
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
pub(super) fn kill_process_by_pid(pid: u32) {
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

#[cfg(not(windows))]
pub(super) fn kill_process_by_pid(pid: u32) {
    let result = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status();
    if let Err(error) = result {
        warn!(target: "app::voice", "failed to terminate sidecar pid {pid}: {error}");
    }
}

impl VoiceService {
    pub fn cancel_generation(&self) {
        if self.inner.operation.cancel_generation() {
            self.inner.generation_cancel.lock().cancel();
            self.kill_generation_process();
        }
    }

    pub(super) fn kill_generation_process(&self) {
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

    pub(super) fn generate_blocking_inner(
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

        let resolved = match &request.source {
            VoiceSourceSelection::Clone(ProfileSelection::Existing { profile_id }) => self
                .resolve_existing_clone_source(
                    profile_id,
                    &model_version,
                    &base_model_sha256,
                    &base_transformer_path,
                )?,
            VoiceSourceSelection::Clone(ProfileSelection::New(specification)) => {
                validate_label("profile.name", &specification.name, 120)?;
                self.prepare_new_clone_source(
                    &mut artifacts,
                    &model_version,
                    &base_model_sha256,
                    &base_transformer_path,
                    Path::new(&specification.reference_wav_path),
                    specification.name.clone(),
                    specification.keep_reference,
                    None,
                )?
            }
            VoiceSourceSelection::Preset(locale) => {
                let tag = presets::current_tag(*locale);
                let existing_profile_id =
                    self.find_matching_preset_profile(&tag, &model_version, &base_model_sha256);
                if let Some(profile_id) = existing_profile_id {
                    self.resolve_existing_clone_source(
                        &profile_id,
                        &model_version,
                        &base_model_sha256,
                        &base_transformer_path,
                    )?
                } else {
                    let reference_wav_path =
                        presets::resolve_audio_path(&self.inner.app_handle, *locale)?;
                    let display_name = presets::display_name(*locale);
                    validate_label("profile.name", &display_name, 120)?;
                    self.prepare_new_clone_source(
                        &mut artifacts,
                        &model_version,
                        &base_model_sha256,
                        &base_transformer_path,
                        &reference_wav_path,
                        display_name,
                        false,
                        Some(tag),
                    )?
                }
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
                ResolvedGenerationSource {
                    transformer_path: PathBuf::from(&voice.transformer_path),
                    model_sha256: voice.model_sha256.clone(),
                    generation_model_version: format!("fine-tuned-{}", &voice.model_sha256[..16]),
                    source_spec: SidecarSourceSpec {
                        mode: "speaker_token",
                        reference_wav_path: None,
                        save_q3sp_path: None,
                        existing_q3sp_path: None,
                        speaker_token_id: Some(voice.speaker_token_id),
                    },
                    pending_profile: None,
                    reference_copy: None,
                    asset_source: VoiceAssetSource::FineTuned {
                        model_sha256: voice.model_sha256,
                        speaker_name: voice.speaker_name,
                        speaker_token_id: voice.speaker_token_id,
                    },
                }
            }
        };
        let ResolvedGenerationSource {
            transformer_path,
            model_sha256,
            generation_model_version,
            source_spec,
            pending_profile,
            reference_copy,
            asset_source,
        } = resolved;

        let catalog_snapshot = self.inner.catalog.lock().clone();
        ensure_generatable(&catalog_snapshot, &request.items)?;
        let fingerprint_source = match &asset_source {
            VoiceAssetSource::CloneProfile { profile_id } => format!("clone:{profile_id}"),
            VoiceAssetSource::FineTuned {
                model_sha256,
                speaker_token_id,
                ..
            } => format!("fine-tuned:{model_sha256}:{speaker_token_id}"),
            VoiceAssetSource::BundledPrompt {
                key,
                locale,
                revision,
            } => format!("bundled-prompt:{key}:{locale:?}:{revision}"),
            VoiceAssetSource::Imported { .. } | VoiceAssetSource::Http { .. } => {
                return Err(VoiceError::Internal(
                    "not a sidecar generation source".to_string(),
                ));
            }
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
            std::fs::create_dir_all(&output_dir)
                .map_err(|error| VoiceError::io_at("create", &output_dir, error))?;
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

        if pending_profile.is_some() && outcome.profile_meta.is_none() {
            return Err(VoiceError::Process(
                "sidecar completed without returning new profile metadata".to_string(),
            ));
        }

        let mut generated = Vec::with_capacity(outcome.item_results.len());
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
            generated.push(VoiceAssetMeta {
                id: item.id.clone(),
                phrase_id,
                source: asset_source.clone(),
                model_version: generation_model_version.clone(),
                params_fingerprint: fingerprints.get(&item.id).cloned().unwrap_or_default(),
                created_at_ms: now_ms(),
                duration_sec: wav.duration_sec,
                sample_rate: wav.sample_rate as i32,
                stale: false,
            });
        }

        let mut catalog = self.inner.catalog.lock().clone();
        if let (Some(pending), Some(meta)) = (&pending_profile, &outcome.profile_meta) {
            if meta.model_sha256 != model_sha256 {
                return Err(VoiceError::Incompatible(
                    "sidecar profile fingerprint does not match the installed model".to_string(),
                ));
            }
            if !pending.keep_reference
                && let Some(path) = &reference_copy
            {
                let _ = std::fs::remove_file(path);
            }
            catalog.profiles.push(VoiceProfileMeta {
                id: pending.profile_id.clone(),
                name: pending.name.clone(),
                created_at_ms: now_ms(),
                model_version: model_version.as_str().to_string(),
                embedding_dim: meta.embedding_dim,
                model_sha256: meta.model_sha256.clone(),
                ref_audio_sha256: meta.ref_audio_sha256.clone(),
                ref_audio_retained: pending.keep_reference,
                preset: pending.preset.clone(),
            });
        }
        let resolved_profile_id = match &asset_source {
            VoiceAssetSource::CloneProfile { profile_id } => Some(profile_id.clone()),
            _ => None,
        };
        let committed_asset_ids = generated.iter().map(|asset| asset.id.clone()).collect();
        let replaced_assets = apply_generated_assets(&mut catalog, generated);
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

    /// Resolves a source spec that reuses a previously extracted `.q3sp`
    /// profile, shared by manual "use an existing profile" selections and
    /// by preset generation once a matching preset profile already exists.
    pub(super) fn resolve_existing_clone_source(
        &self,
        profile_id: &ProfileId,
        model_version: &ModelVersion,
        base_model_sha256: &str,
        base_transformer_path: &Path,
    ) -> VoiceResult<ResolvedGenerationSource> {
        let catalog = self.inner.catalog.lock();
        let profile = catalog
            .profiles
            .iter()
            .find(|profile| profile.id == profile_id.as_str())
            .ok_or_else(|| VoiceError::not_found("voice profile", profile_id.to_string()))?;
        if profile.model_version != model_version.as_str()
            || profile.model_sha256 != base_model_sha256
        {
            return Err(VoiceError::Incompatible(format!(
                "profile {} was created for a different model",
                profile_id.as_str()
            )));
        }
        drop(catalog);
        let q3sp_path = catalog::profile_q3sp_path(&self.inner.voice_root, profile_id.as_str());
        if !q3sp_path.is_file() {
            return Err(VoiceError::not_found(
                "Q3SP profile",
                q3sp_path.display().to_string(),
            ));
        }
        Ok(ResolvedGenerationSource {
            transformer_path: base_transformer_path.to_path_buf(),
            model_sha256: base_model_sha256.to_string(),
            generation_model_version: model_version.as_str().to_string(),
            source_spec: SidecarSourceSpec {
                mode: "profile_existing",
                reference_wav_path: None,
                save_q3sp_path: None,
                existing_q3sp_path: Some(q3sp_path.display().to_string()),
                speaker_token_id: None,
            },
            pending_profile: None,
            reference_copy: None,
            asset_source: VoiceAssetSource::CloneProfile {
                profile_id: profile_id.as_str().to_string(),
            },
        })
    }

    /// Resolves a source spec that extracts a brand-new clone profile from
    /// `reference_wav_path`, shared by manual "clone from this WAV"
    /// requests and by preset generation the first time (or after the
    /// bundled reference audio moves to a new revision).
    #[allow(clippy::too_many_arguments)]
    pub(super) fn prepare_new_clone_source(
        &self,
        artifacts: &mut GenerationArtifactsGuard,
        model_version: &ModelVersion,
        base_model_sha256: &str,
        base_transformer_path: &Path,
        reference_wav_path: &Path,
        profile_name: String,
        keep_reference: bool,
        preset: Option<presets::VoicePresetTag>,
    ) -> VoiceResult<ResolvedGenerationSource> {
        let profile_id = new_id("profile");
        let destination = catalog::profile_dir(&self.inner.voice_root, &profile_id);
        std::fs::create_dir_all(catalog::profiles_dir(&self.inner.voice_root))
            .map_err(|error| VoiceError::io("create voice profiles directory", error))?;
        std::fs::create_dir(&destination)
            .map_err(|error| VoiceError::io_at("create", &destination, error))?;
        artifacts.track_profile_directory(destination.clone());
        let reference_copy = destination.join("reference.wav");
        audio::validate_and_copy_reference_wav(reference_wav_path, &reference_copy)?;
        Ok(ResolvedGenerationSource {
            transformer_path: base_transformer_path.to_path_buf(),
            model_sha256: base_model_sha256.to_string(),
            generation_model_version: model_version.as_str().to_string(),
            source_spec: SidecarSourceSpec {
                mode: "profile_new",
                reference_wav_path: Some(reference_copy.display().to_string()),
                save_q3sp_path: Some(destination.join("speaker.q3sp").display().to_string()),
                existing_q3sp_path: None,
                speaker_token_id: None,
            },
            pending_profile: Some(PendingProfile {
                profile_id: profile_id.clone(),
                name: profile_name,
                keep_reference,
                preset,
            }),
            reference_copy: Some(reference_copy),
            asset_source: VoiceAssetSource::CloneProfile { profile_id },
        })
    }

    /// Finds a still-usable clone profile previously extracted from the
    /// bundled preset reference identified by `tag`: same locale, same
    /// manifest revision (so a bundled-audio update triggers re-extraction
    /// instead of silently reusing the old voice), same installed model,
    /// and its `.q3sp` file is actually present on disk.
    pub(super) fn find_matching_preset_profile(
        &self,
        tag: &presets::VoicePresetTag,
        model_version: &ModelVersion,
        base_model_sha256: &str,
    ) -> Option<ProfileId> {
        let profile_id = {
            let catalog = self.inner.catalog.lock();
            let id = find_preset_profile_id_in_catalog(
                &catalog,
                tag,
                model_version.as_str(),
                base_model_sha256,
            )?;
            ProfileId::parse(id.to_string()).ok()?
        };
        let q3sp_path = catalog::profile_q3sp_path(&self.inner.voice_root, profile_id.as_str());
        q3sp_path.is_file().then_some(profile_id)
    }

    pub(super) fn resolve_generation_backend(
        &self,
        preference: VoiceGenerationBackend,
    ) -> VoiceResult<(EngineBackend, PathBuf)> {
        let inventory = self.backend_inventory(false);
        let backend = select_backend(preference, &inventory)?;
        let path = resolve_sidecar_path(&self.inner.app_handle, backend)?;
        Ok((backend, path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::models::{EngineState, VoiceBackendStatus, VoiceLanguage};

    fn preset_profile_stub(
        id: &str,
        preset: Option<presets::VoicePresetTag>,
        model_version: &str,
        model_sha256: &str,
    ) -> VoiceProfileMeta {
        VoiceProfileMeta {
            id: id.to_string(),
            model_version: model_version.to_string(),
            model_sha256: model_sha256.to_string(),
            preset,
            ..VoiceProfileMeta::default()
        }
    }

    #[test]
    fn preset_lookup_matches_on_locale_revision_and_installed_model() {
        let tag = presets::VoicePresetTag {
            locale: presets::VoicePresetLocale::ZhCn,
            revision: 1,
        };
        let mut catalog = models::VoiceCatalog::default();
        catalog.profiles = vec![preset_profile_stub(
            "preset-zh",
            Some(tag.clone()),
            "model-v1",
            "sha-current",
        )];

        let found = find_preset_profile_id_in_catalog(&catalog, &tag, "model-v1", "sha-current");

        assert_eq!(found, Some("preset-zh"));
    }

    #[test]
    fn preset_lookup_ignores_a_stale_manifest_revision() {
        let current_tag = presets::VoicePresetTag {
            locale: presets::VoicePresetLocale::EnUs,
            revision: 2,
        };
        let stored_tag = presets::VoicePresetTag {
            locale: presets::VoicePresetLocale::EnUs,
            revision: 1,
        };
        let mut catalog = models::VoiceCatalog::default();
        catalog.profiles = vec![preset_profile_stub(
            "preset-en-old",
            Some(stored_tag),
            "model-v1",
            "sha-current",
        )];

        // The bundled reference audio moved on to revision 2: the
        // revision-1 profile must not be reused, so generation re-extracts
        // from the newer audio instead of silently keeping the old voice.
        assert_eq!(
            find_preset_profile_id_in_catalog(&catalog, &current_tag, "model-v1", "sha-current"),
            None
        );
    }

    #[test]
    fn preset_lookup_ignores_a_profile_extracted_for_a_different_model() {
        let tag = presets::VoicePresetTag {
            locale: presets::VoicePresetLocale::JaJp,
            revision: 0,
        };
        let mut catalog = models::VoiceCatalog::default();
        catalog.profiles = vec![preset_profile_stub(
            "preset-ja-old-model",
            Some(tag.clone()),
            "model-v1",
            "sha-old",
        )];

        assert_eq!(
            find_preset_profile_id_in_catalog(&catalog, &tag, "model-v2", "sha-new"),
            None
        );
    }

    #[test]
    fn preset_lookup_ignores_manually_cloned_profiles_and_other_locales() {
        let tag = presets::VoicePresetTag {
            locale: presets::VoicePresetLocale::ZhCn,
            revision: 0,
        };
        let other_locale_tag = presets::VoicePresetTag {
            locale: presets::VoicePresetLocale::JaJp,
            revision: 0,
        };
        let mut catalog = models::VoiceCatalog::default();
        catalog.profiles = vec![
            preset_profile_stub("manual-clone", None, "model-v1", "sha-current"),
            preset_profile_stub(
                "preset-ja",
                Some(other_locale_tag),
                "model-v1",
                "sha-current",
            ),
        ];

        assert_eq!(
            find_preset_profile_id_in_catalog(&catalog, &tag, "model-v1", "sha-current"),
            None
        );
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

    #[test]
    fn generated_assets_replace_the_phrase_take_and_become_active() {
        use crate::voice::test_support::{asset_stub, phrase_stub};
        let mut catalog = models::VoiceCatalog {
            phrases: vec![
                phrase_stub("phrase_a", Some("old_a")),
                phrase_stub("phrase_b", None),
            ],
            assets: vec![
                asset_stub("old_a", "phrase_a", 1),
                asset_stub("keep_c", "phrase_c", 1),
            ],
            ..models::VoiceCatalog::default()
        };

        let replaced = apply_generated_assets(
            &mut catalog,
            vec![
                asset_stub("new_a", "phrase_a", 2),
                asset_stub("new_b", "phrase_b", 2),
            ],
        );

        assert_eq!(replaced, [("phrase_a".to_string(), "old_a".to_string())]);
        let ids: Vec<_> = catalog
            .assets
            .iter()
            .map(|asset| asset.id.as_str())
            .collect();
        assert_eq!(ids, ["keep_c", "new_a", "new_b"]);
        let active: Vec<_> = catalog
            .phrases
            .iter()
            .map(|phrase| phrase.active_asset_id.as_deref())
            .collect();
        assert_eq!(active, [Some("new_a"), Some("new_b")]);
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
