//! Phrase library editing: create / update / delete phrases, import external
//! audio, delete clone profiles, and the catalog invariants those touch.

use std::path::Path;

use log::warn;

use super::error::{VoiceError, VoiceResult};
use super::models::{
    VoiceAssetMeta, VoiceAssetSource, VoiceLanguage, VoiceOperationState, VoicePhraseMeta,
};
use super::service::VoiceService;
use super::types::{PhraseId, ProfileId};
use super::{audio, catalog, import, models, prompts};
use super::{new_id, now_ms};

/// Where an imported audio clip should land in the phrase library.
pub enum ImportTarget {
    /// Create (or, for an already-imported identical clip, rename) a phrase
    /// whose id is derived from the clip hash.
    NewPhrase { name: String },
    /// Replace the active asset of an existing phrase.
    ExistingPhrase { phrase_id: PhraseId },
}

pub(super) fn imported_phrase_id(sha256: &str) -> String {
    format!("imported_{}", &sha256[..sha256.len().min(24)])
}

pub(super) fn validate_label(field: &'static str, value: &str, max_len: usize) -> VoiceResult<()> {
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

/// Enforces the "at most one asset per phrase" invariant. For any phrase
/// with more than one asset, keeps the phrase's active asset if it's still
/// present, otherwise the most recently created one, and drops the rest
/// from the catalog. Returns the `(phrase_id, asset_id)` pairs that were
/// dropped so the caller can remove their WAV files afterwards.
pub(super) fn reconcile_single_asset_per_phrase(
    catalog: &mut models::VoiceCatalog,
) -> Vec<(String, String)> {
    let mut removed = Vec::new();
    let phrase_ids: Vec<String> = catalog
        .phrases
        .iter()
        .map(|phrase| phrase.id.clone())
        .collect();
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
        let Some(keep_index) = keep_index else {
            continue;
        };
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
pub(super) fn remove_asset_files_best_effort(voice_root: &Path, assets: &[(String, String)]) {
    for (phrase_id, asset_id) in assets {
        let path = catalog::asset_wav_path(voice_root, phrase_id, asset_id);
        if path.exists()
            && let Err(error) = std::fs::remove_file(&path)
        {
            warn!(
                target: "app::voice",
                "failed to remove replaced voice asset {}: {error}",
                path.display()
            );
        }
    }
}

pub(super) fn mark_clone_profile_assets_stale(
    catalog: &mut models::VoiceCatalog,
    profile_id: &str,
) {
    for asset in &mut catalog.assets {
        if matches!(
            &asset.source,
            VoiceAssetSource::CloneProfile { profile_id: asset_profile }
                if asset_profile == profile_id
        ) {
            asset.stale = true;
        }
    }
}

pub(super) fn phrase_has_imported_audio(catalog: &models::VoiceCatalog, phrase_id: &str) -> bool {
    let Some(active_id) = catalog
        .phrases
        .iter()
        .find(|phrase| phrase.id == phrase_id)
        .and_then(|phrase| phrase.active_asset_id.as_deref())
    else {
        return false;
    };
    catalog.assets.iter().any(|asset| {
        asset.id == active_id
            && asset.phrase_id == phrase_id
            && matches!(asset.source, VoiceAssetSource::Imported { .. })
    })
}

pub(super) fn mark_fine_tuned_assets_stale(catalog: &mut models::VoiceCatalog, model_sha256: &str) {
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

impl VoiceService {
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
        // Hold the guard across lookup + write so two concurrent upserts of
        // the same name cannot both observe "missing" and create duplicates.
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        let existing_id = self
            .inner
            .catalog
            .lock()
            .phrases
            .iter()
            .find(|phrase| phrase.name == name)
            .map(|phrase| phrase.id.clone());
        match existing_id {
            Some(id) => self.update_phrase_inner(PhraseId::parse(id)?, name, text, language),
            None => self.create_phrase_inner(name, text, language),
        }
    }

    /// Imports an arbitrary audio file as the active asset of a phrase.
    /// The clip is normalized to the catalog WAV format; the phrase id for a
    /// new phrase is derived from the file hash so the same clip imported on
    /// another machine resolves to the same id.
    pub fn import_phrase_audio(
        &self,
        target: ImportTarget,
        source_path: &Path,
    ) -> VoiceResult<VoicePhraseMeta> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        if let ImportTarget::NewPhrase { name } = &target {
            validate_label("name", name, 120)?;
        }
        let clip = import::decode_and_normalize(source_path)?;
        let original_file_name = source_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();

        let mut catalog = self.inner.catalog.lock().clone();
        let phrase_id = match target {
            ImportTarget::ExistingPhrase { phrase_id } => {
                if !catalog
                    .phrases
                    .iter()
                    .any(|phrase| phrase.id == phrase_id.as_str())
                {
                    return Err(VoiceError::not_found("voice phrase", phrase_id.to_string()));
                }
                phrase_id
            }
            ImportTarget::NewPhrase { name } => {
                let id = PhraseId::parse(imported_phrase_id(&clip.sha256))?;
                match catalog
                    .phrases
                    .iter_mut()
                    .find(|phrase| phrase.id == id.as_str())
                {
                    // Same clip imported twice: idempotently rename.
                    Some(existing) => {
                        existing.name = name;
                        existing.updated_at_ms = now_ms();
                    }
                    None => catalog.phrases.push(VoicePhraseMeta {
                        id: id.as_str().to_string(),
                        name,
                        text: original_file_name.clone(),
                        language: VoiceLanguage::default(),
                        active_asset_id: None,
                        updated_at_ms: now_ms(),
                    }),
                }
                id
            }
        };

        let asset_id = new_id("asset");
        let wav_path =
            catalog::asset_wav_path(&self.inner.voice_root, phrase_id.as_str(), &asset_id);
        import::write_pcm16_wav(&wav_path, &clip.samples, import::IMPORT_SAMPLE_RATE)?;
        let wav = match audio::read_wav_info(&wav_path) {
            Ok(wav) => wav,
            Err(error) => {
                remove_asset_files_best_effort(
                    &self.inner.voice_root,
                    &[(phrase_id.as_str().to_string(), asset_id)],
                );
                return Err(error);
            }
        };

        let replaced: Vec<(String, String)> = catalog
            .assets
            .iter()
            .filter(|asset| asset.phrase_id == phrase_id.as_str())
            .map(|asset| (asset.phrase_id.clone(), asset.id.clone()))
            .collect();
        catalog
            .assets
            .retain(|asset| asset.phrase_id != phrase_id.as_str());
        catalog.assets.push(VoiceAssetMeta {
            id: asset_id.clone(),
            phrase_id: phrase_id.as_str().to_string(),
            source: VoiceAssetSource::Imported {
                sha256: clip.sha256.clone(),
                original_file_name,
            },
            model_version: models::IMPORTED_MODEL_VERSION.to_string(),
            params_fingerprint: clip.sha256,
            created_at_ms: now_ms(),
            duration_sec: wav.duration_sec,
            sample_rate: wav.sample_rate as i32,
            stale: false,
        });
        let phrase = catalog
            .phrases
            .iter_mut()
            .find(|phrase| phrase.id == phrase_id.as_str())
            .expect("import target phrase exists in catalog");
        phrase.active_asset_id = Some(asset_id.clone());
        phrase.updated_at_ms = now_ms();
        let phrase = phrase.clone();

        if let Err(error) = self.commit_catalog(catalog) {
            remove_asset_files_best_effort(
                &self.inner.voice_root,
                &[(phrase_id.as_str().to_string(), asset_id)],
            );
            return Err(error);
        }
        remove_asset_files_best_effort(&self.inner.voice_root, &replaced);
        Ok(phrase)
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
        mark_clone_profile_assets_stale(&mut updated_catalog, profile_id.as_str());
        let directory = catalog::profile_dir(&self.inner.voice_root, profile_id.as_str());
        drop(catalog);
        if directory.exists() {
            std::fs::remove_dir_all(&directory)
                .map_err(|error| VoiceError::io_at("remove", &directory, error))?;
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
        self.create_phrase_inner(name, text, language)
    }

    /// Catalog write without the operation guard; callers must already hold
    /// `UpdatingCatalog`.
    pub(super) fn create_phrase_inner(
        &self,
        name: String,
        text: String,
        language: VoiceLanguage,
    ) -> VoiceResult<VoicePhraseMeta> {
        validate_label("name", &name, 120)?;
        validate_label("text", &text, 1000)?;
        let id = new_id("phrase");
        let phrase = VoicePhraseMeta {
            id: id.clone(),
            name,
            text,
            language,
            active_asset_id: None,
            updated_at_ms: now_ms(),
        };
        let mut updated_catalog = self.inner.catalog.lock().clone();
        updated_catalog.phrases.push(phrase);
        prompts::sync_phrase(&mut updated_catalog, &id);
        let phrase = updated_catalog
            .phrases
            .iter()
            .find(|phrase| phrase.id == id)
            .cloned()
            .expect("newly-created phrase remains in catalog");
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
        self.update_phrase_inner(id, name, text, language)
    }

    /// Catalog write without the operation guard; callers must already hold
    /// `UpdatingCatalog`.
    pub(super) fn update_phrase_inner(
        &self,
        id: PhraseId,
        name: String,
        text: String,
        language: VoiceLanguage,
    ) -> VoiceResult<VoicePhraseMeta> {
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
        if content_changed {
            // Imported / bundled audio is not derived from the text, so a
            // text edit never invalidates it.
            for asset in updated_catalog
                .assets
                .iter_mut()
                .filter(|asset| asset.phrase_id == id.as_str() && !asset.source.is_external())
            {
                asset.stale = true;
            }
        }
        let prompt_sync = prompts::sync_phrase(&mut updated_catalog, id.as_str());
        let updated = updated_catalog
            .phrases
            .iter()
            .find(|phrase| phrase.id == id.as_str())
            .cloned()
            .expect("updated phrase remains in catalog");
        self.commit_catalog(updated_catalog)?;
        remove_asset_files_best_effort(&self.inner.voice_root, &prompt_sync.removed_user_assets);
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
            std::fs::remove_dir_all(&directory)
                .map_err(|error| VoiceError::io_at("remove", &directory, error))?;
        }
        self.commit_catalog(updated_catalog)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::test_support::*;

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

    #[test]
    fn deleting_a_clone_profile_only_stales_its_own_assets() {
        let mut catalog = models::VoiceCatalog::default();
        catalog.assets = vec![
            VoiceAssetMeta {
                source: VoiceAssetSource::CloneProfile {
                    profile_id: "profile-1".into(),
                },
                ..VoiceAssetMeta::default()
            },
            VoiceAssetMeta {
                source: VoiceAssetSource::CloneProfile {
                    profile_id: "profile-2".into(),
                },
                ..VoiceAssetMeta::default()
            },
            VoiceAssetMeta {
                source: VoiceAssetSource::Imported {
                    sha256: "c".repeat(64),
                    original_file_name: "clip.mp3".into(),
                },
                ..VoiceAssetMeta::default()
            },
        ];

        mark_clone_profile_assets_stale(&mut catalog, "profile-1");

        assert!(catalog.assets[0].stale);
        assert!(!catalog.assets[1].stale);
        assert!(!catalog.assets[2].stale);
    }

    #[test]
    fn imported_phrase_detection_requires_active_imported_asset() {
        let mut catalog = models::VoiceCatalog::default();
        catalog.phrases = vec![phrase_stub("p1", Some("a1")), phrase_stub("p2", Some("a2"))];
        catalog.assets = vec![
            VoiceAssetMeta {
                source: VoiceAssetSource::Imported {
                    sha256: "c".repeat(64),
                    original_file_name: "clip.mp3".into(),
                },
                ..asset_stub("a1", "p1", 0)
            },
            asset_stub("a2", "p2", 0),
        ];
        assert!(phrase_has_imported_audio(&catalog, "p1"));
        assert!(!phrase_has_imported_audio(&catalog, "p2"));
        assert!(!phrase_has_imported_audio(&catalog, "missing"));
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

        assert_eq!(
            removed,
            vec![("phrase-1".to_string(), "asset-new".to_string())]
        );
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
}
