//! Bundled, ready-to-play voice prompts.
//!
//! Unlike `voice-presets`, these WAV files are final playback assets rather
//! than reference recordings for TTS voice cloning. The manifest is embedded
//! for deterministic catalog seeding while the WAV files remain Tauri bundle
//! resources resolved lazily at playback time.

use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::error::{VoiceError, VoiceResult};
use super::models::{
    VoiceAssetMeta, VoiceAssetSource, VoiceCatalog, VoiceLanguage, VoicePhraseMeta,
};
use super::presets::VoicePresetLocale;

const EMBEDDED_MANIFEST: &str = include_str!("../../voice-prompts/prompts.json");
const BUNDLED_MODEL_VERSION: &str = "bundled";

#[derive(Debug, Clone, Deserialize)]
struct PromptManifest {
    revision: u32,
    prompts: Vec<PromptEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct PromptEntry {
    key: String,
    variants: PromptVariants,
}

#[derive(Debug, Clone, Deserialize)]
struct PromptVariants {
    #[serde(rename = "zh-CN")]
    zh_cn: PromptVariant,
    #[serde(rename = "en-US")]
    en_us: PromptVariant,
    #[serde(rename = "ja-JP")]
    ja_jp: PromptVariant,
}

#[derive(Debug, Clone, Deserialize)]
struct PromptVariant {
    text: String,
    file: String,
}

impl PromptVariants {
    fn get(&self, locale: VoicePresetLocale) -> &PromptVariant {
        match locale {
            VoicePresetLocale::ZhCn => &self.zh_cn,
            VoicePresetLocale::EnUs => &self.en_us,
            VoicePresetLocale::JaJp => &self.ja_jp,
        }
    }
}

static MANIFEST: LazyLock<PromptManifest> = LazyLock::new(|| {
    serde_json::from_str(EMBEDDED_MANIFEST)
        .expect("embedded voice-prompts/prompts.json must match PromptManifest")
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PromptCatalogSync {
    pub changed: bool,
    pub removed_user_assets: Vec<(String, String)>,
}

#[must_use]
pub(crate) fn current_revision() -> u32 {
    MANIFEST.revision
}

#[must_use]
pub(crate) const fn locale_for_language(language: VoiceLanguage) -> VoicePresetLocale {
    match language {
        VoiceLanguage::ZhCn => VoicePresetLocale::ZhCn,
        VoiceLanguage::EnUs => VoicePresetLocale::EnUs,
        VoiceLanguage::JaJp => VoicePresetLocale::JaJp,
    }
}

fn language_for_locale(locale: VoicePresetLocale) -> VoiceLanguage {
    match locale {
        VoicePresetLocale::ZhCn => VoiceLanguage::ZhCn,
        VoicePresetLocale::EnUs => VoiceLanguage::EnUs,
        VoicePresetLocale::JaJp => VoiceLanguage::JaJp,
    }
}

fn managed_name(key: &str) -> String {
    format!("auto:{key}")
}

fn stable_slug(key: &str) -> String {
    key.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

fn phrase_id(key: &str) -> String {
    format!("builtin_phrase_{}", stable_slug(key))
}

fn locale_slug(locale: VoicePresetLocale) -> &'static str {
    match locale {
        VoicePresetLocale::ZhCn => "zh_cn",
        VoicePresetLocale::EnUs => "en_us",
        VoicePresetLocale::JaJp => "ja_jp",
    }
}

fn asset_id(key: &str, locale: VoicePresetLocale) -> String {
    format!(
        "builtin_asset_{}_{}_r{}",
        stable_slug(key),
        locale_slug(locale),
        current_revision()
    )
}

fn entry(key: &str) -> Option<&'static PromptEntry> {
    MANIFEST.prompts.iter().find(|prompt| prompt.key == key)
}

fn matching_prompt(
    name: &str,
    text: &str,
    language: VoiceLanguage,
) -> Option<(&'static PromptEntry, VoicePresetLocale)> {
    let locale = locale_for_language(language);
    MANIFEST.prompts.iter().find_map(|prompt| {
        let variant = prompt.variants.get(locale);
        (name == managed_name(&prompt.key) && text == variant.text).then_some((prompt, locale))
    })
}

fn bundled_source(key: &str, locale: VoicePresetLocale) -> VoiceAssetSource {
    VoiceAssetSource::BundledPrompt {
        key: key.to_string(),
        locale,
        revision: current_revision(),
    }
}

fn is_replaceable_by_bundled(source: &VoiceAssetSource) -> bool {
    matches!(source, VoiceAssetSource::BundledPrompt { .. })
}

/// Seeds every bundled prompt into the persistent catalog. Existing generated
/// user assets remain authoritative until their phrase content changes.
pub(crate) fn seed_catalog(catalog: &mut VoiceCatalog, now_ms: i64) -> PromptCatalogSync {
    let mut changed = false;
    let mut removed_user_assets = Vec::new();

    for prompt in &MANIFEST.prompts {
        let name = managed_name(&prompt.key);
        let id = if let Some(existing) = catalog.phrases.iter().find(|phrase| phrase.name == name) {
            existing.id.clone()
        } else {
            let locale = VoicePresetLocale::ZhCn;
            let variant = prompt.variants.get(locale);
            let id = phrase_id(&prompt.key);
            catalog.phrases.push(VoicePhraseMeta {
                id: id.clone(),
                name,
                text: variant.text.clone(),
                language: language_for_locale(locale),
                active_asset_id: None,
                updated_at_ms: now_ms,
            });
            changed = true;
            id
        };
        let sync = sync_phrase(catalog, &id);
        changed |= sync.changed;
        removed_user_assets.extend(sync.removed_user_assets);
    }

    PromptCatalogSync {
        changed,
        removed_user_assets,
    }
}

/// Keeps a managed prompt phrase associated with the correct bundled asset.
/// Generated user audio wins while current; stale generated audio is replaced
/// by the locale-matched bundled prompt.
pub(crate) fn sync_phrase(catalog: &mut VoiceCatalog, phrase_id: &str) -> PromptCatalogSync {
    let Some(phrase_index) = catalog
        .phrases
        .iter()
        .position(|phrase| phrase.id == phrase_id)
    else {
        return PromptCatalogSync {
            changed: false,
            removed_user_assets: Vec::new(),
        };
    };
    let phrase = &catalog.phrases[phrase_index];
    let matching = matching_prompt(&phrase.name, &phrase.text, phrase.language);
    let active_asset = phrase
        .active_asset_id
        .as_deref()
        .and_then(|active_id| catalog.assets.iter().find(|asset| asset.id == active_id));

    // Imported audio is an explicit user choice that a bundled prompt must
    // never displace, regardless of what the phrase text happens to match.
    if active_asset.is_some_and(|asset| matches!(asset.source, VoiceAssetSource::Imported { .. })) {
        return PromptCatalogSync {
            changed: false,
            removed_user_assets: Vec::new(),
        };
    }

    if matching.is_some()
        && active_asset
            .is_some_and(|asset| !is_replaceable_by_bundled(&asset.source) && !asset.stale)
    {
        return PromptCatalogSync {
            changed: false,
            removed_user_assets: Vec::new(),
        };
    }
    if let Some((prompt, locale)) = matching {
        let desired_id = asset_id(&prompt.key, locale);
        let phrase_asset_count = catalog
            .assets
            .iter()
            .filter(|asset| asset.phrase_id == phrase_id)
            .count();
        let already_current = phrase_asset_count == 1
            && active_asset.is_some_and(|asset| {
                asset.id == desired_id
                    && !asset.stale
                    && matches!(
                        &asset.source,
                        VoiceAssetSource::BundledPrompt {
                            key,
                            locale: asset_locale,
                            revision,
                        } if key == &prompt.key
                            && *asset_locale == locale
                            && *revision == current_revision()
                    )
            });
        if already_current {
            return PromptCatalogSync {
                changed: false,
                removed_user_assets: Vec::new(),
            };
        }
    }

    let old_active_id = catalog.phrases[phrase_index].active_asset_id.clone();
    let mut removed_user_assets = Vec::new();
    let original_asset_count = catalog.assets.len();

    match matching {
        Some((prompt, locale)) => {
            for asset in catalog
                .assets
                .iter()
                .filter(|asset| asset.phrase_id == phrase_id)
            {
                if !is_replaceable_by_bundled(&asset.source) {
                    removed_user_assets.push((asset.phrase_id.clone(), asset.id.clone()));
                }
            }
            catalog.assets.retain(|asset| asset.phrase_id != phrase_id);
            let id = asset_id(&prompt.key, locale);
            catalog.assets.push(VoiceAssetMeta {
                id: id.clone(),
                phrase_id: phrase_id.to_string(),
                source: bundled_source(&prompt.key, locale),
                model_version: BUNDLED_MODEL_VERSION.to_string(),
                params_fingerprint: format!("bundled-prompt-r{}", current_revision()),
                created_at_ms: 0,
                duration_sec: 0.0,
                sample_rate: 0,
                stale: false,
            });
            catalog.phrases[phrase_index].active_asset_id = Some(id);
        }
        None => {
            let bundled_ids: Vec<String> = catalog
                .assets
                .iter()
                .filter(|asset| {
                    asset.phrase_id == phrase_id && is_replaceable_by_bundled(&asset.source)
                })
                .map(|asset| asset.id.clone())
                .collect();
            catalog.assets.retain(|asset| {
                asset.phrase_id != phrase_id || !is_replaceable_by_bundled(&asset.source)
            });
            if old_active_id
                .as_ref()
                .is_some_and(|active| bundled_ids.contains(active))
            {
                catalog.phrases[phrase_index].active_asset_id = None;
            }
        }
    }

    PromptCatalogSync {
        changed: original_asset_count != catalog.assets.len()
            || old_active_id != catalog.phrases[phrase_index].active_asset_id
            || matching.is_some(),
        removed_user_assets,
    }
}

fn safe_relative_path(value: &str) -> Option<&Path> {
    let path = Path::new(value);
    (!path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_))))
    .then_some(path)
}

/// Resolves a bundled final-audio WAV without copying it into user storage.
pub(crate) fn resolve_prompt_path(
    app_handle: &AppHandle,
    key: &str,
    locale: VoicePresetLocale,
) -> VoiceResult<PathBuf> {
    let prompt = entry(key)
        .ok_or_else(|| VoiceError::not_found("built-in voice prompt", key.to_string()))?;
    let file = &prompt.variants.get(locale).file;
    let relative = safe_relative_path(file).ok_or_else(|| {
        VoiceError::security(format!("invalid built-in voice prompt path: {file}"))
    })?;

    #[cfg(debug_assertions)]
    {
        let candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("voice-prompts")
            .join(relative);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let candidate = resource_dir.join("voice-prompts").join(relative);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(VoiceError::not_found(
        "built-in voice prompt audio",
        file.clone(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_has_every_supported_locale_and_safe_paths() {
        assert!(current_revision() > 0);
        assert!(!MANIFEST.prompts.is_empty());
        for prompt in &MANIFEST.prompts {
            for locale in [
                VoicePresetLocale::ZhCn,
                VoicePresetLocale::EnUs,
                VoicePresetLocale::JaJp,
            ] {
                let variant = prompt.variants.get(locale);
                assert!(!variant.text.is_empty());
                assert!(safe_relative_path(&variant.file).is_some());
            }
        }
    }

    #[test]
    fn every_manifest_audio_file_is_a_valid_wav() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("voice-prompts");
        for prompt in &MANIFEST.prompts {
            for locale in [
                VoicePresetLocale::ZhCn,
                VoicePresetLocale::EnUs,
                VoicePresetLocale::JaJp,
            ] {
                let path = root.join(&prompt.variants.get(locale).file);
                let info = super::super::audio::read_wav_info(&path)
                    .unwrap_or_else(|error| panic!("invalid prompt {}: {error}", path.display()));
                assert!(info.duration_sec > 0.0);
            }
        }
    }

    #[test]
    fn seed_creates_playable_bundled_catalog_entries() {
        let mut catalog = VoiceCatalog::default();

        let sync = seed_catalog(&mut catalog, 123);

        assert!(sync.changed);
        assert_eq!(catalog.phrases.len(), MANIFEST.prompts.len());
        assert_eq!(catalog.assets.len(), MANIFEST.prompts.len());
        assert!(catalog.phrases.iter().all(|phrase| {
            phrase.active_asset_id.as_ref().is_some_and(|active_id| {
                catalog.assets.iter().any(|asset| {
                    &asset.id == active_id
                        && matches!(asset.source, VoiceAssetSource::BundledPrompt { .. })
                })
            })
        }));
    }

    #[test]
    fn current_generated_asset_takes_priority_over_bundled_prompt() {
        let mut catalog = VoiceCatalog::default();
        seed_catalog(&mut catalog, 123);
        let phrase_id = catalog.phrases[0].id.clone();
        catalog.assets.retain(|asset| asset.phrase_id != phrase_id);
        catalog.assets.push(VoiceAssetMeta {
            id: "generated".into(),
            phrase_id: phrase_id.clone(),
            source: VoiceAssetSource::CloneProfile {
                profile_id: "profile-1".into(),
            },
            stale: false,
            ..VoiceAssetMeta::default()
        });
        catalog.phrases[0].active_asset_id = Some("generated".into());

        let sync = sync_phrase(&mut catalog, &phrase_id);

        assert!(!sync.changed);
        assert_eq!(
            catalog.phrases[0].active_asset_id.as_deref(),
            Some("generated")
        );
    }

    #[test]
    fn locale_change_rebinds_the_bundled_asset() {
        let mut catalog = VoiceCatalog::default();
        seed_catalog(&mut catalog, 123);
        let phrase_id = catalog.phrases[0].id.clone();
        let old_asset_id = catalog.phrases[0].active_asset_id.clone();
        let (prompt, _) = matching_prompt(
            &catalog.phrases[0].name,
            &catalog.phrases[0].text,
            VoiceLanguage::ZhCn,
        )
        .expect("seeded prompt");
        catalog.phrases[0].text = prompt.variants.get(VoicePresetLocale::EnUs).text.clone();
        catalog.phrases[0].language = VoiceLanguage::EnUs;

        let sync = sync_phrase(&mut catalog, &phrase_id);

        assert!(sync.changed);
        assert_ne!(catalog.phrases[0].active_asset_id, old_asset_id);
        let rebound = catalog
            .assets
            .iter()
            .find(|asset| asset.phrase_id == phrase_id)
            .expect("rebound asset");
        assert!(matches!(
            &rebound.source,
            VoiceAssetSource::BundledPrompt {
                locale: VoicePresetLocale::EnUs,
                ..
            }
        ));
    }

    #[test]
    fn imported_asset_survives_prompt_sync() {
        let mut catalog = VoiceCatalog::default();
        seed_catalog(&mut catalog, 123);
        let phrase_id = catalog.phrases[0].id.clone();
        catalog.assets.retain(|asset| asset.phrase_id != phrase_id);
        catalog.assets.push(VoiceAssetMeta {
            id: "imported".into(),
            phrase_id: phrase_id.clone(),
            source: VoiceAssetSource::Imported {
                sha256: "c".repeat(64),
                original_file_name: "clip.mp3".into(),
            },
            ..VoiceAssetMeta::default()
        });
        catalog.phrases[0].active_asset_id = Some("imported".into());

        let sync = sync_phrase(&mut catalog, &phrase_id);

        assert!(!sync.changed);
        assert!(sync.removed_user_assets.is_empty());
        assert_eq!(
            catalog.phrases[0].active_asset_id.as_deref(),
            Some("imported")
        );
        assert_eq!(
            catalog
                .assets
                .iter()
                .filter(|asset| asset.phrase_id == phrase_id)
                .count(),
            1
        );
    }
}
