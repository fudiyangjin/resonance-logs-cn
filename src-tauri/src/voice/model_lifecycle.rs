//! Base-model and fine-tuned-model lifecycle: install, manual import,
//! verify, remove, and the cached validation that gates generation.

use std::path::{Path, PathBuf};

use tokio_util::sync::CancellationToken;

use super::error::{VoiceError, VoiceResult};
use super::model_manager::{InstallReceipt, ModelDownloadSource};
use super::models::{EngineBackend, FineTunedVoiceMeta, ModelState, VoiceOperationState};
use super::now_ms;
use super::operation::ModelValidationCacheEntry;
use super::phrases::mark_fine_tuned_assets_stale;
use super::service::{VoiceService, resolve_sidecar_path};
use super::types::ModelVersion;
use super::{catalog, finetuned, model_manager};

impl VoiceService {
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

    /// Drops both validation cache layers for the fine-tuned voice. The
    /// persisted record has to go as well: unlike the official model's
    /// version-scoped `model_dir`, this is a single shared file, so a record
    /// left behind would outlive the voice it described. The lock is released
    /// before the file is touched so the mutex is never held across IO.
    pub(super) fn invalidate_fine_tuned_validation(&self) {
        self.inner.fine_tuned_validation.lock().invalidate();
        finetuned::clear_persisted_fingerprint(&catalog::fine_tuned_dir(&self.inner.voice_root));
    }

    pub fn set_fine_tuned_voice(
        &self,
        package_path: &Path,
        expected_sha256: &str,
        replace_existing: bool,
    ) -> VoiceResult<FineTunedVoiceMeta> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        self.set_fine_tuned_voice_inner(package_path, expected_sha256, replace_existing)
    }

    /// Catalog write without the operation guard; callers must already hold
    /// `UpdatingCatalog`.
    pub(super) fn set_fine_tuned_voice_inner(
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
        self.invalidate_fine_tuned_validation();
        Ok(candidate)
    }

    pub fn relink_fine_tuned_voice(
        &self,
        package_path: &Path,
        expected_sha256: &str,
    ) -> VoiceResult<FineTunedVoiceMeta> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
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
        self.set_fine_tuned_voice_inner(package_path, expected_sha256, true)
    }

    pub fn remove_fine_tuned_voice(&self) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        let mut catalog = self.inner.catalog.lock().clone();
        if let Some(previous) = catalog.fine_tuned_voice.take() {
            mark_fine_tuned_assets_stale(&mut catalog, &previous.model_sha256);
        }
        self.commit_catalog(catalog)?;
        self.invalidate_fine_tuned_validation();
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

    pub(super) fn validate_model_cached(
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

    pub(super) fn validated_model_receipt(
        &self,
        model_version: &ModelVersion,
    ) -> VoiceResult<InstallReceipt> {
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
