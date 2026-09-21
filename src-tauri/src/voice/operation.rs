//! Concurrency primitives shared by every catalog-mutating voice operation:
//! the single-flight [`VoiceOperationCoordinator`] plus the model / engine
//! probe caches that make repeated `status()` calls cheap.

use std::path::{Path, PathBuf};

use parking_lot::Mutex;

use super::error::{VoiceError, VoiceResult};
use super::model_manager::{InstallReceipt, ModelValidationFingerprint, ModelValidationSnapshot};
use super::models::{EngineBackend, EngineState, ModelState, VoiceOperationState};
use super::types::ModelVersion;

#[derive(Debug, Default)]
pub(super) struct VoiceOperationCoordinator {
    pub(super) state: Mutex<VoiceOperationState>,
}

impl VoiceOperationCoordinator {
    pub(super) fn state(&self) -> VoiceOperationState {
        self.state.lock().clone()
    }

    pub(super) fn try_begin(
        &self,
        operation: VoiceOperationState,
    ) -> VoiceResult<VoiceOperationGuard<'_>> {
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

    pub(super) fn cancel_generation(&self) -> bool {
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

    pub(super) fn cancel_model_install(&self) -> bool {
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

pub(super) struct VoiceOperationGuard<'a> {
    coordinator: &'a VoiceOperationCoordinator,
}

impl Drop for VoiceOperationGuard<'_> {
    fn drop(&mut self) {
        *self.coordinator.state.lock() = VoiceOperationState::Idle;
    }
}

pub(super) fn operation_name(operation: &VoiceOperationState) -> &'static str {
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

pub(super) fn operation_mutates_model(operation: &VoiceOperationState) -> bool {
    matches!(
        operation,
        VoiceOperationState::InstallingModel { .. }
            | VoiceOperationState::ImportingModel
            | VoiceOperationState::VerifyingModel
            | VoiceOperationState::RemovingModel
    )
}

#[derive(Debug, Clone)]
pub(super) struct ModelValidationCacheEntry {
    pub(super) version: String,
    pub(super) fingerprint: ModelValidationFingerprint,
    pub(super) state: ModelState,
    pub(super) receipt: InstallReceipt,
}

#[derive(Debug, Default)]
pub(super) struct ModelValidationCache {
    pub(super) entry: Option<ModelValidationCacheEntry>,
    pub(super) state: ModelState,
}

impl ModelValidationCache {
    pub(super) fn lookup(
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

    pub(super) fn invalidate(&mut self) {
        self.entry = None;
    }

    pub(super) fn clear(&mut self) {
        self.entry = None;
        self.state = ModelState::NotInstalled;
    }

    pub(super) fn seed_ready(&mut self, version: &ModelVersion, snapshot: ModelValidationSnapshot) {
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
pub(super) struct EngineProbeCacheEntry {
    pub(super) path: PathBuf,
    pub(super) modified_nanos: u128,
    pub(super) size_bytes: u64,
    pub(super) state: EngineState,
}

#[derive(Debug, Default)]
pub(super) struct EngineProbeCache {
    pub(super) cpu: Option<EngineProbeCacheEntry>,
    pub(super) vulkan: Option<EngineProbeCacheEntry>,
}

impl EngineProbeCache {
    pub(super) fn slot(&self, backend: EngineBackend) -> &Option<EngineProbeCacheEntry> {
        match backend {
            EngineBackend::Cpu => &self.cpu,
            EngineBackend::Vulkan => &self.vulkan,
        }
    }

    pub(super) fn slot_mut(
        &mut self,
        backend: EngineBackend,
    ) -> &mut Option<EngineProbeCacheEntry> {
        match backend {
            EngineBackend::Cpu => &mut self.cpu,
            EngineBackend::Vulkan => &mut self.vulkan,
        }
    }

    pub(super) fn lookup(
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

    pub(super) fn store(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::test_support::*;

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
}
