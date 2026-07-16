//! Validation and lifecycle helpers for user-provided CustomVoice packages.

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::error::{VoiceError, VoiceResult};
use super::models::{FineTunedModelInspection, FineTunedVoiceMeta, FineTunedVoiceState};

pub const PACKAGE_MANIFEST_FILE: &str = "voice-model.json";
pub const TOKENIZER_ABI: &str = "qwen3-tts-tokenizer-12hz-v1";
const MAX_MODEL_BYTES: u64 = 32 * 1024 * 1024 * 1024;
const CODEC_VOCAB_SIZE: i32 = 3072;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageManifest {
    schema_version: u32,
    engine: String,
    architecture: String,
    model_type: String,
    display_name: String,
    speaker: PackageSpeaker,
    transformer: PackageTransformer,
    tokenizer_abi: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageSpeaker {
    name: String,
    token_id: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageTransformer {
    file: String,
    size_bytes: u64,
    sha256: String,
    quantization: String,
}

pub fn inspect_package(
    package_path: &Path,
    imported_at_ms: i64,
) -> VoiceResult<FineTunedVoiceMeta> {
    let package_path = package_path.canonicalize().map_err(|error| {
        VoiceError::io(
            format!("open fine-tuned package {}", package_path.display()),
            error,
        )
    })?;
    if !package_path.is_dir() {
        return Err(VoiceError::validation("packagePath", "must be a directory"));
    }

    let manifest_path = package_path.join(PACKAGE_MANIFEST_FILE);
    let manifest_bytes = std::fs::read(&manifest_path)
        .map_err(|error| VoiceError::io(format!("read {}", manifest_path.display()), error))?;
    if manifest_bytes.len() > 1024 * 1024 {
        return Err(VoiceError::validation(
            "voice-model.json",
            "manifest is too large",
        ));
    }
    let manifest: PackageManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| VoiceError::json("parse fine-tuned voice manifest", error))?;
    validate_manifest(&manifest)?;

    let transformer_relative = Path::new(&manifest.transformer.file);
    if transformer_relative.is_absolute()
        || transformer_relative.components().count() != 1
        || !manifest
            .transformer
            .file
            .to_ascii_lowercase()
            .ends_with(".gguf")
    {
        return Err(VoiceError::validation(
            "transformer.file",
            "must be a GGUF file name in the package root",
        ));
    }
    let transformer_path = package_path
        .join(transformer_relative)
        .canonicalize()
        .map_err(|error| VoiceError::io("open fine-tuned transformer", error))?;
    if transformer_path.parent() != Some(package_path.as_path()) || !transformer_path.is_file() {
        return Err(VoiceError::security(
            "fine-tuned transformer resolves outside the package root",
        ));
    }

    let size_bytes = transformer_path
        .metadata()
        .map_err(|error| VoiceError::io("inspect fine-tuned transformer", error))?
        .len();
    if size_bytes == 0
        || size_bytes > MAX_MODEL_BYTES
        || size_bytes != manifest.transformer.size_bytes
    {
        return Err(VoiceError::validation(
            "transformer.sizeBytes",
            format!(
                "expected {}, found {size_bytes}",
                manifest.transformer.size_bytes
            ),
        ));
    }
    validate_gguf_magic(&transformer_path)?;
    let actual_hash = hash_file(&transformer_path)?;
    if actual_hash != manifest.transformer.sha256.to_ascii_lowercase() {
        return Err(VoiceError::security(
            "fine-tuned transformer SHA-256 mismatch",
        ));
    }

    Ok(FineTunedVoiceMeta {
        package_path: package_path.display().to_string(),
        transformer_path: transformer_path.display().to_string(),
        display_name: manifest.display_name,
        speaker_name: manifest.speaker.name,
        speaker_token_id: manifest.speaker.token_id,
        model_sha256: actual_hash,
        size_bytes,
        quantization: manifest.transformer.quantization,
        tokenizer_abi: manifest.tokenizer_abi,
        imported_at_ms,
    })
}

pub fn inspect_state(voice: &FineTunedVoiceMeta) -> FineTunedVoiceState {
    let path = Path::new(&voice.transformer_path);
    let Ok(metadata) = path.metadata() else {
        return FineTunedVoiceState::Missing {
            voice: voice.clone(),
        };
    };
    if !metadata.is_file() || metadata.len() != voice.size_bytes {
        return FineTunedVoiceState::Modified {
            voice: voice.clone(),
        };
    }
    match hash_file(path) {
        Ok(hash) if hash == voice.model_sha256 => FineTunedVoiceState::Ready {
            voice: voice.clone(),
        },
        Ok(_) => FineTunedVoiceState::Modified {
            voice: voice.clone(),
        },
        Err(_) => FineTunedVoiceState::Missing {
            voice: voice.clone(),
        },
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ValidationFingerprint {
    path: String,
    size_bytes: u64,
    modified_ns: u128,
}

#[derive(Debug, Default)]
pub struct FineTunedValidationCache {
    entry: Option<(ValidationFingerprint, FineTunedVoiceState)>,
}

impl FineTunedValidationCache {
    pub fn inspect(&mut self, voice: &FineTunedVoiceMeta) -> FineTunedVoiceState {
        let path = Path::new(&voice.transformer_path);
        let Ok(metadata) = path.metadata() else {
            self.entry = None;
            return FineTunedVoiceState::Missing {
                voice: voice.clone(),
            };
        };
        if !metadata.is_file() || metadata.len() != voice.size_bytes {
            self.entry = None;
            return FineTunedVoiceState::Modified {
                voice: voice.clone(),
            };
        }
        let modified_ns = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |value| value.as_nanos());
        let fingerprint = ValidationFingerprint {
            path: voice.transformer_path.clone(),
            size_bytes: metadata.len(),
            modified_ns,
        };
        if let Some((cached_fingerprint, cached_state)) = &self.entry
            && cached_fingerprint == &fingerprint
        {
            return cached_state.clone();
        }
        let state = inspect_state(voice);
        self.entry = Some((fingerprint, state.clone()));
        state
    }

    pub fn invalidate(&mut self) {
        self.entry = None;
    }
}

pub fn validate_model_inspection(
    voice: &FineTunedVoiceMeta,
    inspection: &FineTunedModelInspection,
) -> VoiceResult<()> {
    if inspection.architecture != "qwen3-tts"
        || inspection.model_type != "custom_voice"
        || inspection.tokenizer_abi != TOKENIZER_ABI
        || inspection.speaker_name != voice.speaker_name
        || inspection.speaker_token_id != voice.speaker_token_id
        || inspection.tensor_count != 402
    {
        return Err(VoiceError::Incompatible(
            "GGUF metadata does not match voice-model.json".to_string(),
        ));
    }
    Ok(())
}

fn validate_manifest(manifest: &PackageManifest) -> VoiceResult<()> {
    if manifest.schema_version != 1
        || manifest.engine != "qwen3-tts"
        || manifest.architecture != "qwen3-tts-12hz-0.6b"
        || manifest.model_type != "customVoice"
        || manifest.tokenizer_abi != TOKENIZER_ABI
    {
        return Err(VoiceError::Incompatible(
            "unsupported fine-tuned voice package contract".to_string(),
        ));
    }
    if manifest.display_name.trim().is_empty() || manifest.display_name.chars().count() > 120 {
        return Err(VoiceError::validation(
            "displayName",
            "must contain 1-120 characters",
        ));
    }
    if manifest.speaker.name.trim().is_empty() || manifest.speaker.name.chars().count() > 120 {
        return Err(VoiceError::validation(
            "speaker.name",
            "must contain 1-120 characters",
        ));
    }
    if !(0..CODEC_VOCAB_SIZE).contains(&manifest.speaker.token_id) {
        return Err(VoiceError::validation(
            "speaker.tokenId",
            format!("must be between 0 and {}", CODEC_VOCAB_SIZE - 1),
        ));
    }
    if !matches!(manifest.transformer.quantization.as_str(), "q8_0" | "f16") {
        return Err(VoiceError::validation(
            "transformer.quantization",
            "must be q8_0 or f16",
        ));
    }
    if manifest.transformer.sha256.len() != 64
        || !manifest
            .transformer
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(VoiceError::validation(
            "transformer.sha256",
            "must be 64 hexadecimal characters",
        ));
    }
    Ok(())
}

fn validate_gguf_magic(path: &Path) -> VoiceResult<()> {
    let mut file = File::open(path)
        .map_err(|error| VoiceError::io(format!("open {}", path.display()), error))?;
    let mut magic = [0_u8; 4];
    file.read_exact(&mut magic)
        .map_err(|error| VoiceError::io(format!("read {}", path.display()), error))?;
    if &magic != b"GGUF" {
        return Err(VoiceError::validation(
            "transformer.file",
            "not a GGUF file",
        ));
    }
    Ok(())
}

fn hash_file(path: &Path) -> VoiceResult<String> {
    let mut file = File::open(path)
        .map_err(|error| VoiceError::io(format!("open {}", path.display()), error))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1 << 16];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| VoiceError::io(format!("read {}", path.display()), error))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_package(root: &Path, transformer_file: &str, contents: &[u8]) -> String {
        let transformer_path = root.join(transformer_file);
        std::fs::write(&transformer_path, contents).unwrap();
        let sha256 = hash_file(&transformer_path).unwrap();
        let manifest = serde_json::json!({
            "schemaVersion": 1,
            "engine": "qwen3-tts",
            "architecture": "qwen3-tts-12hz-0.6b",
            "modelType": "customVoice",
            "displayName": "Madoka",
            "speaker": { "name": "madoka", "tokenId": 3000 },
            "transformer": {
                "file": transformer_file,
                "sizeBytes": contents.len(),
                "sha256": sha256,
                "quantization": "q8_0"
            },
            "tokenizerAbi": TOKENIZER_ABI
        });
        std::fs::write(
            root.join(PACKAGE_MANIFEST_FILE),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();
        sha256
    }

    #[test]
    fn rejects_unsupported_speaker_token() {
        let manifest = PackageManifest {
            schema_version: 1,
            engine: "qwen3-tts".to_string(),
            architecture: "qwen3-tts-12hz-0.6b".to_string(),
            model_type: "customVoice".to_string(),
            display_name: "test".to_string(),
            speaker: PackageSpeaker {
                name: "test".to_string(),
                token_id: CODEC_VOCAB_SIZE,
            },
            transformer: PackageTransformer {
                file: "model.gguf".to_string(),
                size_bytes: 4,
                sha256: "0".repeat(64),
                quantization: "q8_0".to_string(),
            },
            tokenizer_abi: TOKENIZER_ABI.to_string(),
        };
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn accepts_a_valid_package_and_detects_lifecycle_changes() {
        let directory = tempdir().unwrap();
        let sha256 = write_package(directory.path(), "model.gguf", b"GGUFfixture");

        let voice = inspect_package(directory.path(), 123).unwrap();
        assert_eq!(voice.model_sha256, sha256);
        assert_eq!(voice.speaker_token_id, 3000);
        assert!(matches!(
            inspect_state(&voice),
            FineTunedVoiceState::Ready { .. }
        ));

        std::fs::write(&voice.transformer_path, b"GGUFchanged").unwrap();
        assert!(matches!(
            inspect_state(&voice),
            FineTunedVoiceState::Modified { .. }
        ));
        std::fs::remove_file(&voice.transformer_path).unwrap();
        assert!(matches!(
            inspect_state(&voice),
            FineTunedVoiceState::Missing { .. }
        ));
    }

    #[test]
    fn rejects_transformer_paths_outside_the_package_root() {
        let directory = tempdir().unwrap();
        write_package(directory.path(), "model.gguf", b"GGUFfixture");
        let manifest_path = directory.path().join(PACKAGE_MANIFEST_FILE);
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
        manifest["transformer"]["file"] = serde_json::Value::String("../model.gguf".into());
        std::fs::write(manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();

        assert!(inspect_package(directory.path(), 123).is_err());
    }

    #[test]
    fn validation_cache_rechecks_when_the_file_fingerprint_changes() {
        let directory = tempdir().unwrap();
        write_package(directory.path(), "model.gguf", b"GGUFfixture");
        let voice = inspect_package(directory.path(), 123).unwrap();
        let mut cache = FineTunedValidationCache::default();
        assert!(matches!(
            cache.inspect(&voice),
            FineTunedVoiceState::Ready { .. }
        ));

        std::fs::write(&voice.transformer_path, b"GGUFchanged").unwrap();
        assert!(matches!(
            cache.inspect(&voice),
            FineTunedVoiceState::Modified { .. }
        ));
    }
}
