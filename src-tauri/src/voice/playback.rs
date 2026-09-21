//! Cue resolution and the playback entry points of [`VoiceService`]: turns a
//! phrase id into a playable WAV (generated asset or bundled prompt) and hands
//! it to the player worker.

use std::path::PathBuf;

use log::warn;

use super::error::{VoiceError, VoiceResult};
use super::models::{VoiceAssetMeta, VoiceAssetSource, VoiceCueIntent};
use super::now_ms;
use super::player::QueuedCue;
use super::service::VoiceService;
use super::types::{AssetId, PhraseId};
use super::{catalog, models, presets, prompts};

pub(super) const PREVIEW_RULE_ID: &str = "__preview__";

pub(super) const TEST_TRIGGER_PRIORITY: u8 = 200;

pub(super) const PREVIEW_PRIORITY: u8 = 255;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum CueAudioRef {
    CatalogAsset {
        asset_id: String,
    },
    BundledPrompt {
        key: String,
        locale: presets::VoicePresetLocale,
    },
}

impl CueAudioRef {
    fn from_asset(asset: &VoiceAssetMeta) -> Self {
        match &asset.source {
            VoiceAssetSource::BundledPrompt { key, locale, .. } => Self::BundledPrompt {
                key: key.clone(),
                locale: *locale,
            },
            VoiceAssetSource::CloneProfile { .. }
            | VoiceAssetSource::FineTuned { .. }
            | VoiceAssetSource::Imported { .. } => Self::CatalogAsset {
                asset_id: asset.id.clone(),
            },
        }
    }
}

pub(super) fn catalog_audio_ref(
    catalog: &models::VoiceCatalog,
    phrase_id: &str,
) -> Option<CueAudioRef> {
    let phrase = catalog
        .phrases
        .iter()
        .find(|phrase| phrase.id == phrase_id)?;
    let active_id = phrase.active_asset_id.as_deref()?;
    let asset = catalog
        .assets
        .iter()
        .find(|asset| asset.id == active_id && asset.phrase_id == phrase_id)?;
    Some(CueAudioRef::from_asset(asset))
}

impl VoiceService {
    pub(super) fn cue_audio_ref(&self, phrase_id: &str) -> Option<CueAudioRef> {
        let catalog = self.inner.catalog.lock();
        catalog_audio_ref(&catalog, phrase_id)
    }

    pub(super) fn audio_ref_wav_path(
        &self,
        phrase_id: &str,
        audio_ref: CueAudioRef,
    ) -> Option<PathBuf> {
        match audio_ref {
            CueAudioRef::CatalogAsset { asset_id } => {
                let path = catalog::asset_wav_path(&self.inner.voice_root, phrase_id, &asset_id);
                path.is_file().then_some(path)
            }
            CueAudioRef::BundledPrompt { key, locale } => {
                match prompts::resolve_prompt_path(&self.inner.app_handle, &key, locale) {
                    Ok(path) => Some(path),
                    Err(error) => {
                        warn!(
                            target: "app::voice",
                            "failed to resolve bundled prompt {key}: {error}"
                        );
                        None
                    }
                }
            }
        }
    }

    pub(super) fn cue_wav_path(&self, phrase_id: &str) -> Option<PathBuf> {
        self.audio_ref_wav_path(phrase_id, self.cue_audio_ref(phrase_id)?)
    }

    /// Resolves `intent.phrase_id` to a generated or bundled WAV and enqueues playback.
    /// Never drops the cue silently: if the phrase is missing, has no
    /// playable asset, or the asset file is gone from
    /// disk, a short built-in fallback tone plays instead so a
    /// misconfigured or pending rule is still noticeable.
    pub fn enqueue_cue(&self, intent: VoiceCueIntent) {
        let wav_path = self.cue_wav_path(&intent.phrase_id);
        if wav_path.is_none() {
            warn!(
                target: "app::voice",
                "rule {} phrase {} has no playable audio; playing fallback tone",
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

    /// Like [`Self::enqueue_phrase`] but resolves the phrase by its managed
    /// `name` (e.g. `auto:voice:minimap:...`), so HUD windows can play a
    /// binding without keeping their own phrase-id cache in sync with the
    /// main window. Returns `false` (and plays nothing) when no phrase has
    /// that name yet — the main window has not materialized it.
    pub fn enqueue_phrase_by_name(&self, name: &str, priority: u8) -> bool {
        let phrase_id = {
            let catalog = self.inner.catalog.lock();
            catalog
                .phrases
                .iter()
                .find(|phrase| phrase.name == name)
                .map(|phrase| phrase.id.clone())
        };
        let Some(phrase_id) = phrase_id else {
            warn!(target: "app::voice", "no phrase named {name:?}; dropping cue");
            return false;
        };
        self.enqueue_cue(VoiceCueIntent {
            rule_id: format!("frontend_{name}"),
            phrase_id,
            priority,
            triggered_at_ms: now_ms(),
        });
        true
    }

    pub fn test_trigger(&self, phrase_id: &PhraseId) -> VoiceResult<()> {
        let Some(wav_path) = self.cue_wav_path(phrase_id.as_str()) else {
            return Err(VoiceError::not_found(
                "active phrase asset",
                phrase_id.to_string(),
            ));
        };
        self.inner.player.enqueue(QueuedCue {
            rule_id: PREVIEW_RULE_ID.to_string(),
            priority: TEST_TRIGGER_PRIORITY,
            wav_path: Some(wav_path),
        });
        Ok(())
    }

    pub fn preview_asset(&self, phrase_id: &PhraseId, asset_id: &AssetId) -> VoiceResult<()> {
        let catalog = self.inner.catalog.lock();
        let Some(asset) = catalog
            .assets
            .iter()
            .find(|asset| asset.id == asset_id.as_str() && asset.phrase_id == phrase_id.as_str())
        else {
            return Err(VoiceError::not_found("voice asset", asset_id.to_string()));
        };
        let audio_ref = CueAudioRef::from_asset(asset);
        drop(catalog);
        let Some(wav_path) = self.audio_ref_wav_path(phrase_id.as_str(), audio_ref) else {
            return Err(VoiceError::not_found("asset WAV", asset_id.to_string()));
        };
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::test_support::*;

    #[test]
    fn catalog_audio_ref_distinguishes_bundled_and_generated_assets() {
        let catalog = models::VoiceCatalog {
            phrases: vec![
                phrase_stub("builtin-phrase", Some("builtin-asset")),
                phrase_stub("generated-phrase", Some("generated-asset")),
            ],
            assets: vec![
                VoiceAssetMeta {
                    id: "builtin-asset".into(),
                    phrase_id: "builtin-phrase".into(),
                    source: VoiceAssetSource::BundledPrompt {
                        key: "voice:alert:matchReady".into(),
                        locale: presets::VoicePresetLocale::ZhCn,
                        revision: 1,
                    },
                    ..VoiceAssetMeta::default()
                },
                VoiceAssetMeta {
                    id: "generated-asset".into(),
                    phrase_id: "generated-phrase".into(),
                    source: VoiceAssetSource::CloneProfile {
                        profile_id: "profile-1".into(),
                    },
                    ..VoiceAssetMeta::default()
                },
            ],
            ..Default::default()
        };

        assert_eq!(
            catalog_audio_ref(&catalog, "builtin-phrase"),
            Some(CueAudioRef::BundledPrompt {
                key: "voice:alert:matchReady".into(),
                locale: presets::VoicePresetLocale::ZhCn,
            })
        );
        assert_eq!(
            catalog_audio_ref(&catalog, "generated-phrase"),
            Some(CueAudioRef::CatalogAsset {
                asset_id: "generated-asset".into(),
            })
        );
    }
}
