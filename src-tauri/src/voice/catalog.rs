//! On-disk layout and catalog persistence for the voice feature.
//!
//! Layout under `app_local_data_dir()/voice/`:
//! - `models/<modelVersion>/` — installed GGUF model files.
//! - `profiles/<profileId>/speaker.q3sp` — speaker embedding profile.
//! - `assets/<phraseId>/<assetId>.wav` — generated takes.
//! - `catalog.json` — profile/phrase/asset metadata (this file).

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use log::warn;

use super::error::{VoiceError, VoiceResult};
use super::models::VOICE_CATALOG_SCHEMA_VERSION;
use super::models::VoiceCatalog;
use super::types::{AssetId, ModelVersion, PhraseId, ProfileId, Sha256Hex};

const CATALOG_FILE_NAME: &str = "catalog.json";

/// Resolves the voice feature root directory, creating it if necessary.
pub fn voice_root_dir(app_handle: &tauri::AppHandle) -> VoiceResult<PathBuf> {
    use tauri::Manager;
    let base = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| VoiceError::Internal(format!("failed to resolve app_local_data_dir: {e}")))?;
    let root = base.join("voice");
    std::fs::create_dir_all(&root)
        .map_err(|e| VoiceError::io(format!("create directory {}", root.display()), e))?;
    Ok(root)
}

pub fn models_dir(voice_root: &Path) -> PathBuf {
    voice_root.join("models")
}

pub fn profiles_dir(voice_root: &Path) -> PathBuf {
    voice_root.join("profiles")
}

pub fn assets_dir(voice_root: &Path) -> PathBuf {
    voice_root.join("assets")
}

pub fn staging_dir(voice_root: &Path) -> PathBuf {
    voice_root.join("staging")
}

pub fn profile_dir(voice_root: &Path, profile_id: &str) -> PathBuf {
    profiles_dir(voice_root).join(sanitize_id(profile_id))
}

pub fn profile_q3sp_path(voice_root: &Path, profile_id: &str) -> PathBuf {
    profile_dir(voice_root, profile_id).join("speaker.q3sp")
}

pub fn phrase_asset_dir(voice_root: &Path, phrase_id: &str) -> PathBuf {
    assets_dir(voice_root).join(sanitize_id(phrase_id))
}

pub fn asset_wav_path(voice_root: &Path, phrase_id: &str, asset_id: &str) -> PathBuf {
    phrase_asset_dir(voice_root, phrase_id).join(format!("{}.wav", sanitize_id(asset_id)))
}

fn catalog_path(voice_root: &Path) -> PathBuf {
    voice_root.join(CATALOG_FILE_NAME)
}

/// Restricts ids used as path components to a conservative charset so the sidecar
/// and Rust host never write outside the controlled voice directory tree.
pub fn sanitize_id(id: &str) -> String {
    let mut out = String::with_capacity(id.len());
    for ch in id.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        out.push('_');
    }
    out
}

pub fn load_catalog(voice_root: &Path) -> VoiceResult<VoiceCatalog> {
    let path = catalog_path(voice_root);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(VoiceCatalog::default());
        }
        Err(error) => {
            return Err(VoiceError::io(
                format!("read catalog {}", path.display()),
                error,
            ));
        }
    };

    let mut value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(error) => {
            quarantine_catalog(&path, "invalid")?;
            warn!(target: "app::voice", "quarantined malformed catalog {}: {error}", path.display());
            return Ok(VoiceCatalog::default());
        }
    };
    let schema_version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0) as u32;
    if schema_version == 2 {
        migrate_v2_to_v3(&mut value)?;
    } else if schema_version != VOICE_CATALOG_SCHEMA_VERSION {
        quarantine_voice_root(voice_root, schema_version)?;
        return Ok(VoiceCatalog::default());
    }

    let catalog: VoiceCatalog = match serde_json::from_value(value) {
        Ok(catalog) => catalog,
        Err(error) => {
            quarantine_catalog(&path, "invalid")?;
            warn!(target: "app::voice", "quarantined invalid catalog shape {}: {error}", path.display());
            return Ok(VoiceCatalog::default());
        }
    };
    if let Err(error) = validate_catalog(&catalog) {
        quarantine_catalog(&path, "unsafe")?;
        warn!(target: "app::voice", "quarantined invalid catalog {}: {error}", path.display());
        return Ok(VoiceCatalog::default());
    }
    Ok(catalog)
}

/// Atomically writes the catalog: write to a temp file, then rename over the target.
pub fn save_catalog(voice_root: &Path, catalog: &VoiceCatalog) -> VoiceResult<()> {
    let path = catalog_path(voice_root);
    let tmp_path = voice_root.join(format!("{CATALOG_FILE_NAME}.tmp.{}", std::process::id()));
    let bytes = serde_json::to_vec_pretty(catalog)
        .map_err(|e| VoiceError::json("serialize voice catalog", e))?;
    std::fs::write(&tmp_path, &bytes)
        .map_err(|e| VoiceError::io(format!("write {}", tmp_path.display()), e))?;
    atomic_rename(&tmp_path, &path)
}

/// `std::fs::rename` maps to `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` on Windows and
/// to `rename(2)` (already atomic) on POSIX, so a plain rename is sufficient here.
fn atomic_rename(from: &Path, to: &Path) -> VoiceResult<()> {
    std::fs::rename(from, to)
        .map_err(|e| VoiceError::io(format!("rename {} to {}", from.display(), to.display()), e))
}

fn validate_catalog(catalog: &VoiceCatalog) -> VoiceResult<()> {
    for profile in &catalog.profiles {
        ProfileId::parse(profile.id.clone())?;
        ModelVersion::parse(profile.model_version.clone())?;
        Sha256Hex::parse(profile.model_sha256.clone())?;
        Sha256Hex::parse(profile.ref_audio_sha256.clone())?;
    }
    for phrase in &catalog.phrases {
        PhraseId::parse(phrase.id.clone())?;
        if let Some(asset_id) = &phrase.active_asset_id {
            AssetId::parse(asset_id.clone())?;
        }
    }
    for asset in &catalog.assets {
        AssetId::parse(asset.id.clone())?;
        PhraseId::parse(asset.phrase_id.clone())?;
        match &asset.source {
            super::models::VoiceAssetSource::CloneProfile { profile_id } => {
                ProfileId::parse(profile_id.clone())?;
            }
            super::models::VoiceAssetSource::FineTuned { model_sha256, .. } => {
                Sha256Hex::parse(model_sha256.clone())?;
            }
        }
        ModelVersion::parse(asset.model_version.clone())?;
    }
    if let Some(version) = &catalog.installed_model_version {
        ModelVersion::parse(version.clone())?;
    }
    if let Some(hash) = &catalog.installed_model_sha256 {
        Sha256Hex::parse(hash.clone())?;
    }
    if let Some(voice) = &catalog.fine_tuned_voice {
        Sha256Hex::parse(voice.model_sha256.clone())?;
    }
    Ok(())
}

fn migrate_v2_to_v3(value: &mut serde_json::Value) -> VoiceResult<()> {
    let root = value
        .as_object_mut()
        .ok_or_else(|| VoiceError::validation("catalog", "must be a JSON object"))?;
    root.insert(
        "schemaVersion".to_string(),
        serde_json::Value::from(VOICE_CATALOG_SCHEMA_VERSION),
    );
    root.entry("fineTunedVoice".to_string())
        .or_insert(serde_json::Value::Null);
    if let Some(assets) = root
        .get_mut("assets")
        .and_then(serde_json::Value::as_array_mut)
    {
        for asset in assets {
            let Some(asset) = asset.as_object_mut() else {
                continue;
            };
            let profile_id = asset
                .remove("profileId")
                .unwrap_or_else(|| serde_json::Value::String(String::new()));
            asset.insert(
                "source".to_string(),
                serde_json::json!({ "kind": "cloneProfile", "profileId": profile_id }),
            );
        }
    }
    Ok(())
}

fn quarantine_catalog(path: &Path, reason: &str) -> VoiceResult<()> {
    let backup = path.with_file_name(format!("catalog.{reason}.{}.json", timestamp_ms()));
    std::fs::rename(path, &backup).map_err(|error| {
        VoiceError::io(
            format!(
                "quarantine catalog {} to {}",
                path.display(),
                backup.display()
            ),
            error,
        )
    })
}

fn quarantine_voice_root(voice_root: &Path, schema_version: u32) -> VoiceResult<()> {
    let parent = voice_root
        .parent()
        .ok_or_else(|| VoiceError::Internal("voice root has no parent directory".to_string()))?;
    let backup = parent.join(format!("voice-legacy-v{schema_version}-{}", timestamp_ms()));
    std::fs::rename(voice_root, &backup).map_err(|error| {
        VoiceError::io(
            format!(
                "quarantine legacy voice directory {} to {}",
                voice_root.display(),
                backup.display()
            ),
            error,
        )
    })?;
    std::fs::create_dir_all(voice_root)
        .map_err(|error| VoiceError::io(format!("recreate {}", voice_root.display()), error))?;
    warn!(
        target: "app::voice",
        "moved legacy voice data schema v{schema_version} to {}",
        backup.display()
    );
    Ok(())
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v2_catalog_migrates_assets_in_place() {
        let directory = tempfile::tempdir().unwrap();
        let voice_root = directory.path().join("voice");
        std::fs::create_dir_all(assets_dir(&voice_root)).unwrap();
        std::fs::write(assets_dir(&voice_root).join("keep.txt"), b"keep").unwrap();
        let catalog = serde_json::json!({
            "schemaVersion": 2,
            "profiles": [],
            "phrases": [],
            "assets": [{
                "id": "asset-1",
                "phraseId": "phrase-1",
                "profileId": "profile-1",
                "modelVersion": "model-v1",
                "modelSha256": "0".repeat(64),
                "textSha256": "1".repeat(64),
                "generationFingerprint": "2".repeat(64),
                "language": "zhCn",
                "createdAtMs": 1,
                "durationSec": 1.0,
                "sampleRate": 24000,
                "stale": false
            }],
            "installedModelVersion": null,
            "installedModelSha256": null
        });
        std::fs::write(
            voice_root.join(CATALOG_FILE_NAME),
            serde_json::to_vec_pretty(&catalog).unwrap(),
        )
        .unwrap();

        let migrated = load_catalog(&voice_root).unwrap();
        assert_eq!(migrated.schema_version, VOICE_CATALOG_SCHEMA_VERSION);
        assert!(matches!(
            &migrated.assets[0].source,
            super::super::models::VoiceAssetSource::CloneProfile { profile_id }
                if profile_id == "profile-1"
        ));
        assert!(assets_dir(&voice_root).join("keep.txt").is_file());
        assert!(!directory.path().join("voice-legacy-v2-1").exists());
    }

    #[test]
    fn legacy_catalog_quarantines_the_entire_voice_root() {
        let directory = tempfile::tempdir().unwrap();
        let voice_root = directory.path().join("voice");
        std::fs::create_dir(&voice_root).unwrap();
        std::fs::write(
            voice_root.join(CATALOG_FILE_NAME),
            br#"{"schemaVersion":1}"#,
        )
        .unwrap();
        std::fs::write(voice_root.join("legacy.marker"), b"legacy").unwrap();

        let catalog = load_catalog(&voice_root).unwrap();

        assert_eq!(catalog.schema_version, VOICE_CATALOG_SCHEMA_VERSION);
        assert!(voice_root.is_dir());
        assert!(!voice_root.join("legacy.marker").exists());
        let backup = std::fs::read_dir(directory.path())
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("voice-legacy-v1-"))
            })
            .expect("legacy backup directory");
        assert_eq!(
            std::fs::read(backup.join("legacy.marker")).unwrap(),
            b"legacy"
        );
    }
}
