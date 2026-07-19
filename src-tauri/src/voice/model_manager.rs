//! Signed model manifest fetching, resumable download, verification, and receipts.

use std::collections::HashSet;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use futures_util::StreamExt;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

use super::error::{VoiceError, VoiceResult};
use super::models::ModelState;
use super::types::{ManifestFileName, ModelVersion, Sha256Hex};

pub const VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT: &str = "voice-model-download-progress";
const INSTALL_RECEIPT_FILE: &str = "install.json";
const VERIFIED_FINGERPRINT_FILE: &str = "verified_fingerprint.json";
const MAX_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_MODEL_FILE_BYTES: u64 = 32 * 1024 * 1024 * 1024;
const Q8_TRANSFORMER_FILE: &str = "qwen3-tts-0.6b-q8_0.gguf";
const F16_TRANSFORMER_FILE: &str = "qwen3-tts-0.6b-f16.gguf";
const TOKENIZER_FILE: &str = "qwen3-tts-tokenizer-f16.gguf";
const TRANSFORMER_FILES_BY_PRIORITY: [&str; 2] = [Q8_TRANSFORMER_FILE, F16_TRANSFORMER_FILE];
const HUGGINGFACE_HOST: &str = "huggingface.co";
const HF_MIRROR_HOST: &str = "hf-mirror.com";
const EMBEDDED_MANIFEST: &str = include_str!("../../../docs/voice-model-manifest.json");
const EMBEDDED_MANIFEST_PUBLIC_KEY: &str =
    include_str!("../../../docs/voice-model-manifest.public-key");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelManifestFile {
    pub name: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelManifest {
    pub model_version: String,
    #[serde(default)]
    pub min_app_version: Option<String>,
    pub files: Vec<ModelManifestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedModelManifest {
    manifest: ModelManifest,
    signature: String,
}

#[derive(Debug, Clone)]
pub struct ValidatedManifestFile {
    pub name: ManifestFileName,
    pub url: reqwest::Url,
    pub size_bytes: u64,
    pub sha256: Sha256Hex,
}

#[derive(Debug, Clone)]
pub struct ValidatedModelManifest {
    pub model_version: ModelVersion,
    pub files: Vec<ValidatedManifestFile>,
    pub manifest_sha256: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ModelDownloadSource {
    Auto,
    HuggingFace,
    HfMirror,
}

impl ModelDownloadSource {
    fn ordered(self) -> [Self; 2] {
        match self {
            Self::HfMirror => [Self::HfMirror, Self::HuggingFace],
            Self::Auto | Self::HuggingFace => [Self::HuggingFace, Self::HfMirror],
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::HuggingFace => "huggingFace",
            Self::HfMirror => "hfMirror",
        }
    }
}

impl ValidatedModelManifest {
    pub fn primary_model_sha256(&self) -> Option<String> {
        TRANSFORMER_FILES_BY_PRIORITY.iter().find_map(|name| {
            self.files
                .iter()
                .find(|file| file.name.as_str() == *name)
                .map(|file| file.sha256.as_str().to_string())
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallReceiptFile {
    pub name: String,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallReceipt {
    pub schema_version: u32,
    pub model_version: String,
    pub manifest_sha256: Option<String>,
    pub source: String,
    pub installed_at_ms: u128,
    pub files: Vec<InstallReceiptFile>,
}

impl InstallReceipt {
    pub fn primary_model_sha256(&self) -> Option<&str> {
        TRANSFORMER_FILES_BY_PRIORITY.iter().find_map(|name| {
            self.files
                .iter()
                .find(|file| file.name == *name)
                .map(|file| file.sha256.as_str())
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelFileFingerprint {
    pub(crate) name: String,
    pub(crate) size_bytes: u64,
    pub(crate) modified_nanos: u128,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelValidationFingerprint {
    pub(crate) receipt_sha256: String,
    pub(crate) files: Vec<ModelFileFingerprint>,
}

#[derive(Debug, Clone)]
pub struct ModelValidationSnapshot {
    pub receipt: InstallReceipt,
    pub fingerprint: ModelValidationFingerprint,
}

#[derive(Debug)]
struct ManualImportSource {
    path: PathBuf,
    name: ManifestFileName,
}

#[derive(Debug)]
struct PendingDirectory {
    path: PathBuf,
    committed: bool,
}

impl PendingDirectory {
    fn create(path: PathBuf) -> VoiceResult<Self> {
        std::fs::create_dir(&path)
            .map_err(|error| VoiceError::io(format!("create {}", path.display()), error))?;
        Ok(Self {
            path,
            committed: false,
        })
    }

    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for PendingDirectory {
    fn drop(&mut self) {
        if !self.committed
            && self.path.exists()
            && let Err(error) = std::fs::remove_dir_all(&self.path)
        {
            warn!(
                target: "app::voice",
                "failed to clean pending model import {}: {error}",
                self.path.display()
            );
        }
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum ModelDownloadProgress {
    FileStart {
        name: String,
        total_bytes: u64,
        source: ModelDownloadSource,
    },
    FileProgress {
        name: String,
        downloaded_bytes: u64,
        total_bytes: u64,
        source: ModelDownloadSource,
    },
    FileVerifying {
        name: String,
        source: ModelDownloadSource,
    },
    FileDone {
        name: String,
        source: ModelDownloadSource,
    },
    AllDone {
        model_version: String,
    },
    Error {
        error: String,
    },
    Cancelled,
}

#[async_trait::async_trait]
pub trait ModelDownloader: Send + Sync {
    async fn fetch(
        &self,
        client: &reqwest::Client,
        cancel: &CancellationToken,
    ) -> VoiceResult<ValidatedModelManifest>;

    async fn install(
        &self,
        app_handle: &AppHandle,
        client: &reqwest::Client,
        voice_root: &Path,
        manifest: &ValidatedModelManifest,
        source: ModelDownloadSource,
        cancel: &CancellationToken,
    ) -> VoiceResult<InstallReceipt>;
}

#[derive(Debug, Default)]
pub struct SignedHttpModelDownloader;

#[async_trait::async_trait]
impl ModelDownloader for SignedHttpModelDownloader {
    async fn fetch(
        &self,
        client: &reqwest::Client,
        cancel: &CancellationToken,
    ) -> VoiceResult<ValidatedModelManifest> {
        fetch_official_manifest(client, cancel).await
    }

    async fn install(
        &self,
        app_handle: &AppHandle,
        client: &reqwest::Client,
        voice_root: &Path,
        manifest: &ValidatedModelManifest,
        source: ModelDownloadSource,
        cancel: &CancellationToken,
    ) -> VoiceResult<InstallReceipt> {
        install_manifest(app_handle, client, voice_root, manifest, source, cancel).await
    }
}

pub trait ModelStore: Send + Sync {
    fn import(
        &self,
        voice_root: &Path,
        model_version: &ModelVersion,
        source_files: &[PathBuf],
    ) -> VoiceResult<InstallReceipt>;
    fn validate(&self, voice_root: &Path, model_version: &str) -> ModelState;
    fn load_receipt(
        &self,
        model_dir: &Path,
        expected_version: &ModelVersion,
    ) -> VoiceResult<InstallReceipt>;
    fn remove(&self, voice_root: &Path, model_version: &ModelVersion) -> VoiceResult<()>;
}

#[derive(Debug, Default)]
pub struct FileModelStore;

impl ModelStore for FileModelStore {
    fn import(
        &self,
        voice_root: &Path,
        model_version: &ModelVersion,
        source_files: &[PathBuf],
    ) -> VoiceResult<InstallReceipt> {
        manual_import(voice_root, model_version, source_files)
    }

    fn validate(&self, voice_root: &Path, model_version: &str) -> ModelState {
        validate_installed_model(voice_root, model_version)
    }

    fn load_receipt(
        &self,
        model_dir: &Path,
        expected_version: &ModelVersion,
    ) -> VoiceResult<InstallReceipt> {
        load_valid_receipt(model_dir, expected_version)
    }

    fn remove(&self, voice_root: &Path, model_version: &ModelVersion) -> VoiceResult<()> {
        remove_model(voice_root, model_version)
    }
}

fn emit<R: Runtime>(app_handle: &AppHandle<R>, progress: ModelDownloadProgress) {
    if let Err(error) = app_handle.emit(VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT, progress) {
        warn!(target: "app::voice", "failed to emit model download progress: {error}");
    }
}

fn file_url_for_source(
    file: &ValidatedManifestFile,
    source: ModelDownloadSource,
) -> VoiceResult<reqwest::Url> {
    if source != ModelDownloadSource::HfMirror {
        return Ok(file.url.clone());
    }
    if file.url.scheme() != "https" || file.url.host_str() != Some(HUGGINGFACE_HOST) {
        return Err(VoiceError::Security(format!(
            "cannot derive HF-Mirror URL from {}",
            file.url
        )));
    }
    let mut mirror = file.url.clone();
    mirror
        .set_host(Some(HF_MIRROR_HOST))
        .map_err(|_| VoiceError::Security("failed to construct HF-Mirror URL".to_string()))?;
    Ok(mirror)
}

fn source_part_path(dest_path: &Path, source: ModelDownloadSource) -> PathBuf {
    let suffix = match source {
        ModelDownloadSource::Auto => "auto",
        ModelDownloadSource::HuggingFace => "huggingface",
        ModelDownloadSource::HfMirror => "hf-mirror",
    };
    let file_name = dest_path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_else(|| std::borrow::Cow::Borrowed("model"));
    dest_path.with_file_name(format!("{file_name}.{suffix}.part"))
}

pub async fn fetch_official_manifest(
    client: &reqwest::Client,
    cancel: &CancellationToken,
) -> VoiceResult<ValidatedModelManifest> {
    let Some(url) = configured_manifest_url()? else {
        return embedded_manifest();
    };
    let public_key = configured_manifest_public_key()?;
    let response = tokio::select! {
        _ = cancel.cancelled() => {
            return Err(VoiceError::Cancelled("model manifest download cancelled".to_string()));
        }
        response = client.get(url.clone()).send() => response.map_err(|source| VoiceError::Http {
            context: format!("fetch official model manifest from {url}"),
            source,
        })?,
    };
    if !response.status().is_success() {
        return Err(VoiceError::Process(format!(
            "model manifest returned HTTP {}",
            response.status()
        )));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_MANIFEST_BYTES as u64)
    {
        return Err(VoiceError::Security(
            "model manifest exceeds the size limit".to_string(),
        ));
    }
    let initial_capacity = response
        .content_length()
        .unwrap_or(0)
        .min(MAX_MANIFEST_BYTES as u64) as usize;
    let mut bytes = Vec::with_capacity(initial_capacity);
    let mut stream = std::pin::pin!(response.bytes_stream());
    loop {
        let chunk = tokio::select! {
            _ = cancel.cancelled() => {
                return Err(VoiceError::Cancelled("model manifest download cancelled".to_string()));
            }
            chunk = stream.next() => chunk,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk = chunk.map_err(|source| VoiceError::Http {
            context: "read official model manifest".to_string(),
            source,
        })?;
        append_manifest_chunk(&mut bytes, &chunk)?;
    }
    let envelope: SignedModelManifest = serde_json::from_slice(&bytes)
        .map_err(|source| VoiceError::json("parse signed model manifest", source))?;
    verify_signed_manifest(envelope, &public_key)
}

fn embedded_manifest() -> VoiceResult<ValidatedModelManifest> {
    let envelope: SignedModelManifest = serde_json::from_str(EMBEDDED_MANIFEST)
        .map_err(|source| VoiceError::json("parse embedded voice model manifest", source))?;
    verify_signed_manifest(envelope, &configured_manifest_public_key()?)
}

fn append_manifest_chunk(bytes: &mut Vec<u8>, chunk: &[u8]) -> VoiceResult<()> {
    if bytes.len().saturating_add(chunk.len()) > MAX_MANIFEST_BYTES {
        return Err(VoiceError::Security(
            "model manifest exceeds the size limit".to_string(),
        ));
    }
    bytes.extend_from_slice(chunk);
    Ok(())
}

fn configured_manifest_url() -> VoiceResult<Option<reqwest::Url>> {
    let value = option_env!("VOICE_MODEL_MANIFEST_URL")
        .map(str::to_owned)
        .or_else(|| std::env::var("VOICE_MODEL_MANIFEST_URL").ok());
    let Some(value) = value else {
        return Ok(None);
    };
    let url = reqwest::Url::parse(&value)
        .map_err(|error| VoiceError::validation("VOICE_MODEL_MANIFEST_URL", error.to_string()))?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err(VoiceError::Security(
            "official voice model manifest must use an absolute HTTPS URL".to_string(),
        ));
    }
    Ok(Some(url))
}

fn configured_manifest_public_key() -> VoiceResult<VerifyingKey> {
    let encoded = option_env!("VOICE_MODEL_MANIFEST_PUBLIC_KEY")
        .map(str::to_owned)
        .or_else(|| std::env::var("VOICE_MODEL_MANIFEST_PUBLIC_KEY").ok())
        .unwrap_or_else(|| EMBEDDED_MANIFEST_PUBLIC_KEY.trim().to_string());
    let bytes = BASE64
        .decode(encoded.trim())
        .map_err(|error| VoiceError::validation("manifestPublicKey", error.to_string()))?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| VoiceError::validation("manifestPublicKey", "must decode to 32 bytes"))?;
    VerifyingKey::from_bytes(&bytes)
        .map_err(|error| VoiceError::validation("manifestPublicKey", error.to_string()))
}

fn verify_signed_manifest(
    envelope: SignedModelManifest,
    public_key: &VerifyingKey,
) -> VoiceResult<ValidatedModelManifest> {
    let canonical = serde_json::to_vec(&envelope.manifest)
        .map_err(|source| VoiceError::json("serialize model manifest for verification", source))?;
    let signature_bytes = BASE64
        .decode(envelope.signature.trim())
        .map_err(|error| VoiceError::validation("manifest.signature", error.to_string()))?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|error| VoiceError::validation("manifest.signature", error.to_string()))?;
    public_key
        .verify(&canonical, &signature)
        .map_err(|_| VoiceError::Security("model manifest signature is invalid".to_string()))?;
    validate_manifest(envelope.manifest, hex::encode(Sha256::digest(&canonical)))
}

fn validate_manifest(
    manifest: ModelManifest,
    manifest_sha256: String,
) -> VoiceResult<ValidatedModelManifest> {
    let model_version = ModelVersion::parse(manifest.model_version)?;
    if manifest.files.is_empty() {
        return Err(VoiceError::validation(
            "manifest.files",
            "must contain at least one file",
        ));
    }
    if let Some(minimum) = manifest.min_app_version {
        let minimum = semver::Version::parse(&minimum)
            .map_err(|error| VoiceError::validation("minAppVersion", error.to_string()))?;
        let current = semver::Version::parse(env!("CARGO_PKG_VERSION"))
            .map_err(|error| VoiceError::Internal(error.to_string()))?;
        if current < minimum {
            return Err(VoiceError::Incompatible(format!(
                "model requires app version {minimum} or newer"
            )));
        }
    }

    let mut names = HashSet::with_capacity(manifest.files.len());
    let mut files = Vec::with_capacity(manifest.files.len());
    for raw in manifest.files {
        let name = ManifestFileName::parse(raw.name)?;
        if name.as_str().eq_ignore_ascii_case(INSTALL_RECEIPT_FILE) {
            return Err(VoiceError::Security(
                "manifest cannot replace the install receipt".to_string(),
            ));
        }
        if !names.insert(name.as_str().to_ascii_lowercase()) {
            return Err(VoiceError::validation(
                "manifest.files",
                format!("duplicate file name: {name:?}"),
            ));
        }
        if raw.size_bytes == 0 || raw.size_bytes > MAX_MODEL_FILE_BYTES {
            return Err(VoiceError::validation(
                "manifest.files[].sizeBytes",
                format!("invalid size for {}", name.as_str()),
            ));
        }
        let url = reqwest::Url::parse(&raw.url)
            .map_err(|error| VoiceError::validation("manifest.files[].url", error.to_string()))?;
        if url.scheme() != "https" || url.host_str().is_none() {
            return Err(VoiceError::Security(format!(
                "model file URL must use HTTPS: {url}"
            )));
        }
        files.push(ValidatedManifestFile {
            name,
            url,
            size_bytes: raw.size_bytes,
            sha256: Sha256Hex::parse(raw.sha256)?,
        });
    }
    if !files
        .iter()
        .any(|file| is_transformer_model(file.name.as_str()))
        || !files
            .iter()
            .any(|file| file.name.as_str() == "qwen3-tts-tokenizer-f16.gguf")
    {
        return Err(VoiceError::validation(
            "manifest.files",
            "must include one supported transformer GGUF and qwen3-tts-tokenizer-f16.gguf",
        ));
    }

    Ok(ValidatedModelManifest {
        model_version,
        files,
        manifest_sha256,
    })
}

pub async fn install_manifest<R: Runtime>(
    app_handle: &AppHandle<R>,
    client: &reqwest::Client,
    voice_root: &Path,
    manifest: &ValidatedModelManifest,
    source: ModelDownloadSource,
    cancel: &CancellationToken,
) -> VoiceResult<InstallReceipt> {
    let model_dir = model_dir(voice_root, &manifest.model_version);
    tokio::fs::create_dir_all(&model_dir)
        .await
        .map_err(|error| VoiceError::io(format!("create {}", model_dir.display()), error))?;

    for file in &manifest.files {
        if cancel.is_cancelled() {
            emit(app_handle, ModelDownloadProgress::Cancelled);
            return Err(VoiceError::Cancelled(
                "model download cancelled".to_string(),
            ));
        }
        let dest_path = model_dir.join(file.name.as_str());
        if tokio::fs::metadata(&dest_path)
            .await
            .is_ok_and(|metadata| metadata.len() == file.size_bytes)
            && verify_sha256_async(dest_path.clone(), file.sha256.as_str().to_string()).await?
        {
            info!(target: "app::voice", "model file already verified: {}", dest_path.display());
            continue;
        }

        if let Err(error) =
            download_file_with_sources(client, file, &dest_path, source, cancel, |progress| {
                emit(app_handle, progress)
            })
            .await
        {
            if matches!(error, VoiceError::Cancelled(_)) {
                emit(app_handle, ModelDownloadProgress::Cancelled);
                return Err(error);
            }
            emit(
                app_handle,
                ModelDownloadProgress::Error {
                    error: error.to_string(),
                },
            );
            return Err(error);
        }
    }

    let receipt = InstallReceipt {
        schema_version: 1,
        model_version: manifest.model_version.as_str().to_string(),
        manifest_sha256: Some(manifest.manifest_sha256.clone()),
        source: "official".to_string(),
        installed_at_ms: timestamp_ms(),
        files: manifest
            .files
            .iter()
            .map(|file| InstallReceiptFile {
                name: file.name.as_str().to_string(),
                size_bytes: file.size_bytes,
                sha256: file.sha256.as_str().to_string(),
            })
            .collect(),
    };
    write_receipt(&model_dir, &receipt).await?;
    emit(
        app_handle,
        ModelDownloadProgress::AllDone {
            model_version: receipt.model_version.clone(),
        },
    );
    Ok(receipt)
}

async fn download_file_with_sources<F>(
    client: &reqwest::Client,
    file: &ValidatedManifestFile,
    dest_path: &Path,
    source: ModelDownloadSource,
    cancel: &CancellationToken,
    mut emit_progress: F,
) -> VoiceResult<ModelDownloadSource>
where
    F: FnMut(ModelDownloadProgress),
{
    let mut source_errors = Vec::new();
    for attempt_source in source.ordered() {
        let url = match file_url_for_source(file, attempt_source) {
            Ok(url) => url,
            Err(error) => {
                source_errors.push(format!("{}: {error}", attempt_source.as_str()));
                continue;
            }
        };
        emit_progress(ModelDownloadProgress::FileStart {
            name: file.name.as_str().to_string(),
            total_bytes: file.size_bytes,
            source: attempt_source,
        });
        if let Err(error) = download_with_resume_inner(
            client,
            file,
            url,
            dest_path,
            attempt_source,
            cancel,
            |progress| emit_progress(progress),
        )
        .await
        {
            if matches!(error, VoiceError::Cancelled(_)) {
                return Err(error);
            }
            source_errors.push(format!("{}: {error}", attempt_source.as_str()));
            continue;
        }
        emit_progress(ModelDownloadProgress::FileVerifying {
            name: file.name.as_str().to_string(),
            source: attempt_source,
        });
        if verify_sha256_async(dest_path.to_path_buf(), file.sha256.as_str().to_string()).await? {
            emit_progress(ModelDownloadProgress::FileDone {
                name: file.name.as_str().to_string(),
                source: attempt_source,
            });
            return Ok(attempt_source);
        }
        let _ = tokio::fs::remove_file(dest_path).await;
        source_errors.push(format!(
            "{}: SHA-256 mismatch for {}",
            attempt_source.as_str(),
            file.name.as_str()
        ));
    }
    Err(VoiceError::Security(format!(
        "all model download sources failed for {}: {}",
        file.name.as_str(),
        source_errors.join("; ")
    )))
}

async fn download_with_resume_inner<F>(
    client: &reqwest::Client,
    file: &ValidatedManifestFile,
    url: reqwest::Url,
    dest_path: &Path,
    source: ModelDownloadSource,
    cancel: &CancellationToken,
    mut emit_progress: F,
) -> VoiceResult<()>
where
    F: FnMut(ModelDownloadProgress),
{
    let part_path = source_part_path(dest_path, source);
    let mut existing_len = tokio::fs::metadata(&part_path)
        .await
        .map_or(0, |metadata| metadata.len());
    if existing_len >= file.size_bytes {
        existing_len = 0;
    }

    if cancel.is_cancelled() {
        return Err(VoiceError::Cancelled(
            "model download cancelled".to_string(),
        ));
    }

    let mut request = client.get(url);
    if existing_len > 0 {
        request = request.header("Range", format!("bytes={existing_len}-"));
    }
    let response = tokio::select! {
        _ = cancel.cancelled() => {
            return Err(VoiceError::Cancelled("model download cancelled".to_string()));
        }
        response = request.send() => response.map_err(|source| VoiceError::Http {
            context: format!("download {}", file.name.as_str()),
            source,
        })?,
    };
    if source == ModelDownloadSource::HfMirror
        && response.url().host_str() == Some(HUGGINGFACE_HOST)
    {
        return Err(VoiceError::Process(
            "HF-Mirror redirected to Hugging Face".to_string(),
        ));
    }
    if !response.status().is_success() {
        return Err(VoiceError::Process(format!(
            "download of {} returned HTTP {}",
            file.name.as_str(),
            response.status()
        )));
    }
    let resumed = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if resumed {
        let content_range = response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                VoiceError::Security(format!(
                    "partial response for {} omitted Content-Range",
                    file.name.as_str()
                ))
            })?;
        let expected_prefix = format!("bytes {existing_len}-");
        if !content_range.starts_with(&expected_prefix) {
            return Err(VoiceError::Security(format!(
                "partial response for {} starts at the wrong offset",
                file.name.as_str()
            )));
        }
    }
    if !resumed {
        existing_len = 0;
    }

    let mut output = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(&part_path)
        .await
        .map_err(|error| VoiceError::io(format!("open {}", part_path.display()), error))?;
    if resumed {
        output
            .seek(std::io::SeekFrom::Start(existing_len))
            .await
            .map_err(|error| VoiceError::io(format!("seek {}", part_path.display()), error))?;
    } else {
        output
            .set_len(0)
            .await
            .map_err(|error| VoiceError::io(format!("truncate {}", part_path.display()), error))?;
    }

    let mut stream = std::pin::pin!(response.bytes_stream());
    let mut downloaded = existing_len;
    let mut last_emit = std::time::Instant::now();
    loop {
        let chunk = tokio::select! {
            _ = cancel.cancelled() => {
                return Err(VoiceError::Cancelled("model download cancelled".to_string()));
            }
            chunk = stream.next() => chunk,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk = chunk.map_err(|source| VoiceError::Http {
            context: format!("stream {}", file.name.as_str()),
            source,
        })?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > file.size_bytes {
            return Err(VoiceError::Security(format!(
                "download of {} exceeded declared size",
                file.name.as_str()
            )));
        }
        output
            .write_all(&chunk)
            .await
            .map_err(|error| VoiceError::io(format!("write {}", part_path.display()), error))?;
        if last_emit.elapsed() >= std::time::Duration::from_millis(200) {
            last_emit = std::time::Instant::now();
            emit_progress(ModelDownloadProgress::FileProgress {
                name: file.name.as_str().to_string(),
                downloaded_bytes: downloaded,
                total_bytes: file.size_bytes,
                source,
            });
        }
    }
    if downloaded != file.size_bytes {
        return Err(VoiceError::Security(format!(
            "downloaded size for {} is {downloaded}, expected {}",
            file.name.as_str(),
            file.size_bytes
        )));
    }
    output
        .flush()
        .await
        .map_err(|error| VoiceError::io(format!("flush {}", part_path.display()), error))?;
    drop(output);
    tokio::fs::rename(&part_path, dest_path)
        .await
        .map_err(|error| VoiceError::io(format!("finalize {}", dest_path.display()), error))?;
    emit_progress(ModelDownloadProgress::FileProgress {
        name: file.name.as_str().to_string(),
        downloaded_bytes: downloaded,
        total_bytes: file.size_bytes,
        source,
    });
    Ok(())
}

pub async fn verify_sha256_async(path: PathBuf, expected: String) -> VoiceResult<bool> {
    tokio::task::spawn_blocking(move || verify_sha256(&path, &expected))
        .await
        .map_err(|error| VoiceError::Internal(format!("hash task failed: {error}")))?
}

pub fn verify_sha256(path: &Path, expected_hex: &str) -> VoiceResult<bool> {
    let expected = Sha256Hex::parse(expected_hex.to_string())?;
    let mut file = std::fs::File::open(path)
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
    Ok(hex::encode(hasher.finalize()) == expected.as_str())
}

pub fn manual_import(
    voice_root: &Path,
    model_version: &ModelVersion,
    source_files: &[PathBuf],
) -> VoiceResult<InstallReceipt> {
    let sources = validate_manual_import_sources(source_files)?;
    let models_dir = super::catalog::models_dir(voice_root);
    std::fs::create_dir_all(&models_dir)
        .map_err(|error| VoiceError::io(format!("create {}", models_dir.display()), error))?;

    let model_dir = model_dir(voice_root, model_version);
    let operation_id = format!("{}-{}", std::process::id(), timestamp_ms());
    let staging_path =
        models_dir.join(format!(".{}.import-{operation_id}", model_version.as_str()));
    let backup_path = models_dir.join(format!(".{}.backup-{operation_id}", model_version.as_str()));
    if staging_path.exists() || backup_path.exists() {
        return Err(VoiceError::Conflict(format!(
            "another model import is already using operation {operation_id}"
        )));
    }
    let mut staging = PendingDirectory::create(staging_path)?;

    let mut files = Vec::with_capacity(sources.len());
    for source in sources {
        let destination = staging.path.join(source.name.as_str());
        std::fs::copy(&source.path, &destination).map_err(|error| {
            VoiceError::io(
                format!(
                    "copy {} to {}",
                    source.path.display(),
                    destination.display()
                ),
                error,
            )
        })?;
        let size_bytes = std::fs::metadata(&destination)
            .map_err(|error| VoiceError::io(format!("inspect {}", destination.display()), error))?
            .len();
        let sha256 = hash_file(&destination)?;
        files.push(InstallReceiptFile {
            name: source.name.into_inner(),
            size_bytes,
            sha256,
        });
    }
    let receipt = InstallReceipt {
        schema_version: 1,
        model_version: model_version.as_str().to_string(),
        manifest_sha256: None,
        source: "manual".to_string(),
        installed_at_ms: timestamp_ms(),
        files,
    };
    write_receipt_blocking(&staging.path, &receipt)?;
    load_valid_receipt(&staging.path, model_version)?;
    commit_import_directory(&mut staging, &model_dir, &backup_path)?;
    Ok(receipt)
}

fn validate_manual_import_sources(
    source_files: &[PathBuf],
) -> VoiceResult<Vec<ManualImportSource>> {
    if source_files.is_empty() {
        return Err(VoiceError::validation(
            "sourceFiles",
            "must contain at least one model file",
        ));
    }

    let mut names = HashSet::with_capacity(source_files.len());
    let mut sources = Vec::with_capacity(source_files.len());
    for source in source_files {
        if !source.is_file() {
            return Err(VoiceError::validation(
                "sourceFiles",
                format!("not a regular file: {}", source.display()),
            ));
        }
        let raw_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| VoiceError::validation("sourceFiles", "file name is not valid UTF-8"))?;
        let name = ManifestFileName::parse(raw_name.to_string())?;
        if !name.as_str().ends_with(".gguf") {
            return Err(VoiceError::validation(
                "sourceFiles",
                format!("unsupported model file: {}", name.as_str()),
            ));
        }
        if !names.insert(name.as_str().to_ascii_lowercase()) {
            return Err(VoiceError::validation(
                "sourceFiles",
                format!("duplicate model file: {}", name.as_str()),
            ));
        }
        sources.push(ManualImportSource {
            path: source.clone(),
            name,
        });
    }

    if !sources
        .iter()
        .any(|source| is_transformer_model(source.name.as_str()))
        || !sources
            .iter()
            .any(|source| source.name.as_str() == TOKENIZER_FILE)
    {
        return Err(VoiceError::validation(
            "sourceFiles",
            format!("must include one supported transformer GGUF and {TOKENIZER_FILE}"),
        ));
    }
    Ok(sources)
}

fn commit_import_directory(
    staging: &mut PendingDirectory,
    model_dir: &Path,
    backup_path: &Path,
) -> VoiceResult<()> {
    if !model_dir.exists() {
        std::fs::rename(&staging.path, model_dir).map_err(|error| {
            VoiceError::io(
                format!(
                    "finalize model import {} to {}",
                    staging.path.display(),
                    model_dir.display()
                ),
                error,
            )
        })?;
        staging.commit();
        return Ok(());
    }

    std::fs::rename(model_dir, backup_path).map_err(|error| {
        VoiceError::io(
            format!(
                "move existing model {} to {}",
                model_dir.display(),
                backup_path.display()
            ),
            error,
        )
    })?;
    if let Err(error) = std::fs::rename(&staging.path, model_dir) {
        if let Err(rollback_error) = std::fs::rename(backup_path, model_dir) {
            return Err(VoiceError::Internal(format!(
                "failed to finalize model import ({error}) and restore the previous model ({rollback_error})"
            )));
        }
        return Err(VoiceError::io("finalize replacement model import", error));
    }
    staging.commit();
    if let Err(error) = std::fs::remove_dir_all(backup_path) {
        warn!(
            target: "app::voice",
            "model import succeeded but old model backup {} could not be removed: {error}",
            backup_path.display()
        );
    }
    Ok(())
}

pub fn validate_installed_model(voice_root: &Path, model_version: &str) -> ModelState {
    let version = match ModelVersion::parse(model_version.to_string()) {
        Ok(version) => version,
        Err(error) => {
            return ModelState::Corrupt {
                version: model_version.to_string(),
                reason: error.to_string(),
            };
        }
    };
    let model_dir = model_dir(voice_root, &version);
    if !model_dir.is_dir() {
        return ModelState::NotInstalled;
    }
    match load_valid_receipt(&model_dir, &version) {
        Ok(_) => ModelState::Ready {
            version: version.into_inner(),
        },
        Err(error) => ModelState::Corrupt {
            version: version.into_inner(),
            reason: error.to_string(),
        },
    }
}

pub fn inspect_model(
    model_dir: &Path,
    expected_version: &ModelVersion,
) -> VoiceResult<ModelValidationSnapshot> {
    let path = model_dir.join(INSTALL_RECEIPT_FILE);
    let bytes = std::fs::read(&path)
        .map_err(|error| VoiceError::io(format!("read {}", path.display()), error))?;
    let receipt_sha256 = hex::encode(Sha256::digest(&bytes));
    let receipt: InstallReceipt = serde_json::from_slice(&bytes)
        .map_err(|source| VoiceError::json(format!("parse {}", path.display()), source))?;
    if receipt.schema_version != 1 || receipt.model_version != expected_version.as_str() {
        return Err(VoiceError::Incompatible(
            "model install receipt version does not match".to_string(),
        ));
    }
    if receipt.files.is_empty() {
        return Err(VoiceError::Security(
            "model install receipt contains no files".to_string(),
        ));
    }

    let mut names = HashSet::with_capacity(receipt.files.len());
    let mut files = Vec::with_capacity(receipt.files.len());
    for file in &receipt.files {
        let name = ManifestFileName::parse(file.name.clone())?;
        Sha256Hex::parse(file.sha256.clone())?;
        if !names.insert(name.as_str().to_ascii_lowercase()) {
            return Err(VoiceError::Security(format!(
                "model install receipt contains duplicate file: {}",
                name.as_str()
            )));
        }
        let file_path = model_dir.join(name.as_str());
        let metadata = std::fs::metadata(&file_path)
            .map_err(|error| VoiceError::io(format!("inspect {}", file_path.display()), error))?;
        if !metadata.is_file() || metadata.len() != file.size_bytes {
            return Err(VoiceError::Security(format!(
                "model file size mismatch: {}",
                name.as_str()
            )));
        }
        let modified_nanos = metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_nanos());
        files.push(ModelFileFingerprint {
            name: name.into_inner(),
            size_bytes: metadata.len(),
            modified_nanos,
        });
    }

    Ok(ModelValidationSnapshot {
        receipt,
        fingerprint: ModelValidationFingerprint {
            receipt_sha256,
            files,
        },
    })
}

pub fn verify_model_snapshot(
    model_dir: &Path,
    snapshot: &ModelValidationSnapshot,
) -> VoiceResult<()> {
    for file in &snapshot.receipt.files {
        let name = ManifestFileName::parse(file.name.clone())?;
        if !verify_sha256(&model_dir.join(name.as_str()), &file.sha256)? {
            return Err(VoiceError::Security(format!(
                "model file hash mismatch: {}",
                name.as_str()
            )));
        }
    }
    Ok(())
}

/// Reads the on-disk record of the last fingerprint (`inspect_model`'s cheap
/// size+mtime snapshot, not the file contents) that a full
/// `verify_model_snapshot` SHA-256 pass actually succeeded against. Returns
/// `None` on any read/parse error so callers always fall back to
/// re-verifying instead of trusting a corrupt cache file.
fn load_persisted_fingerprint(model_dir: &Path) -> Option<ModelValidationFingerprint> {
    let path = model_dir.join(VERIFIED_FINGERPRINT_FILE);
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_persisted_fingerprint_blocking(
    model_dir: &Path,
    fingerprint: &ModelValidationFingerprint,
) -> VoiceResult<()> {
    let bytes = serde_json::to_vec_pretty(fingerprint)
        .map_err(|source| VoiceError::json("serialize verified model fingerprint", source))?;
    let temporary = model_dir.join(format!("{VERIFIED_FINGERPRINT_FILE}.tmp"));
    std::fs::write(&temporary, bytes)
        .map_err(|error| VoiceError::io(format!("write {}", temporary.display()), error))?;
    std::fs::rename(&temporary, model_dir.join(VERIFIED_FINGERPRINT_FILE))
        .map_err(|error| VoiceError::io("finalize verified model fingerprint", error))
}

fn clear_persisted_fingerprint(model_dir: &Path) {
    let path = model_dir.join(VERIFIED_FINGERPRINT_FILE);
    if path.exists()
        && let Err(error) = std::fs::remove_file(&path)
    {
        warn!(
            target: "app::voice",
            "failed to remove stale verified-fingerprint cache {}: {error}",
            path.display()
        );
    }
}

/// Like `verify_model_snapshot`, but persists successful verifications to
/// disk (keyed by the cheap size+mtime fingerprint) so a subsequent process
/// — most commonly the app being restarted — can skip re-hashing every
/// model file when nothing on disk has changed. Falls back to a full
/// re-verify (and refreshes/clears the persisted record) whenever the
/// fingerprint doesn't match, the cache file is missing, or it fails to
/// parse. `force` bypasses the persisted-fingerprint shortcut entirely
/// (used for the user-initiated "verify model" action, which should always
/// re-hash on disk regardless of what was previously recorded).
pub fn verify_model_snapshot_cached(
    model_dir: &Path,
    snapshot: &ModelValidationSnapshot,
    force: bool,
) -> VoiceResult<()> {
    if !force && load_persisted_fingerprint(model_dir).as_ref() == Some(&snapshot.fingerprint) {
        return Ok(());
    }
    match verify_model_snapshot(model_dir, snapshot) {
        Ok(()) => {
            if let Err(error) =
                write_persisted_fingerprint_blocking(model_dir, &snapshot.fingerprint)
            {
                warn!(target: "app::voice", "failed to persist verified model fingerprint: {error}");
            }
            Ok(())
        }
        Err(error) => {
            clear_persisted_fingerprint(model_dir);
            Err(error)
        }
    }
}

pub fn load_valid_receipt(
    model_dir: &Path,
    expected_version: &ModelVersion,
) -> VoiceResult<InstallReceipt> {
    let snapshot = inspect_model(model_dir, expected_version)?;
    verify_model_snapshot(model_dir, &snapshot)?;
    Ok(snapshot.receipt)
}

pub fn remove_model(voice_root: &Path, model_version: &ModelVersion) -> VoiceResult<()> {
    let model_dir = model_dir(voice_root, model_version);
    if model_dir.exists() {
        std::fs::remove_dir_all(&model_dir)
            .map_err(|error| VoiceError::io(format!("remove {}", model_dir.display()), error))?;
    }
    Ok(())
}

pub fn model_dir(voice_root: &Path, model_version: &ModelVersion) -> PathBuf {
    super::catalog::models_dir(voice_root).join(model_version.as_str())
}

async fn write_receipt(model_dir: &Path, receipt: &InstallReceipt) -> VoiceResult<()> {
    let bytes = serde_json::to_vec_pretty(receipt)
        .map_err(|source| VoiceError::json("serialize model install receipt", source))?;
    let temporary = model_dir.join(format!("{INSTALL_RECEIPT_FILE}.tmp"));
    tokio::fs::write(&temporary, bytes)
        .await
        .map_err(|error| VoiceError::io(format!("write {}", temporary.display()), error))?;
    tokio::fs::rename(&temporary, model_dir.join(INSTALL_RECEIPT_FILE))
        .await
        .map_err(|error| VoiceError::io("finalize model install receipt", error))
}

fn write_receipt_blocking(model_dir: &Path, receipt: &InstallReceipt) -> VoiceResult<()> {
    let bytes = serde_json::to_vec_pretty(receipt)
        .map_err(|source| VoiceError::json("serialize model install receipt", source))?;
    let temporary = model_dir.join(format!("{INSTALL_RECEIPT_FILE}.tmp"));
    std::fs::write(&temporary, bytes)
        .map_err(|error| VoiceError::io(format!("write {}", temporary.display()), error))?;
    std::fs::rename(&temporary, model_dir.join(INSTALL_RECEIPT_FILE))
        .map_err(|error| VoiceError::io("finalize model install receipt", error))
}

fn hash_file(path: &Path) -> VoiceResult<String> {
    let mut file = std::fs::File::open(path)
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

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

fn is_transformer_model(name: &str) -> bool {
    TRANSFORMER_FILES_BY_PRIORITY.contains(&name)
}

#[cfg(test)]
mod tests {
    use std::io::{Read as _, Write as _};
    use std::net::TcpListener;
    use std::thread;

    use ed25519_dalek::{Signer, SigningKey};

    use super::*;

    fn serve_once(
        response: Vec<u8>,
        expected_request_fragment: Option<&'static str>,
    ) -> (reqwest::Url, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .unwrap();
            let mut request = [0_u8; 4096];
            let count = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..count]);
            if let Some(expected) = expected_request_fragment {
                assert!(
                    request
                        .to_ascii_lowercase()
                        .contains(&expected.to_ascii_lowercase()),
                    "request was: {request}"
                );
            }
            stream.write_all(&response).unwrap();
            stream.flush().unwrap();
        });
        (
            reqwest::Url::parse(&format!("http://{address}/model.gguf")).unwrap(),
            handle,
        )
    }

    fn test_manifest_file(url: reqwest::Url, size_bytes: u64) -> ValidatedManifestFile {
        ValidatedManifestFile {
            name: ManifestFileName::parse(Q8_TRANSFORMER_FILE).unwrap(),
            url,
            size_bytes,
            sha256: Sha256Hex::parse("a".repeat(64)).unwrap(),
        }
    }

    #[test]
    fn rejects_traversal_in_signed_manifest() {
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let manifest = ModelManifest {
            model_version: "test-v1".to_string(),
            min_app_version: None,
            files: vec![ModelManifestFile {
                name: "../escape.gguf".to_string(),
                url: "https://example.com/model.gguf".to_string(),
                size_bytes: 10,
                sha256: "a".repeat(64),
            }],
        };
        let canonical = serde_json::to_vec(&manifest).unwrap();
        let envelope = SignedModelManifest {
            signature: BASE64.encode(signing_key.sign(&canonical).to_bytes()),
            manifest,
        };
        assert!(verify_signed_manifest(envelope, &signing_key.verifying_key()).is_err());
    }

    #[test]
    fn rejects_invalid_manifest_signature() {
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let manifest = ModelManifest {
            model_version: "test-v1".to_string(),
            min_app_version: None,
            files: vec![
                ModelManifestFile {
                    name: Q8_TRANSFORMER_FILE.to_string(),
                    url: "https://example.com/model.gguf".to_string(),
                    size_bytes: 10,
                    sha256: "a".repeat(64),
                },
                ModelManifestFile {
                    name: TOKENIZER_FILE.to_string(),
                    url: "https://example.com/tokenizer.gguf".to_string(),
                    size_bytes: 10,
                    sha256: "b".repeat(64),
                },
            ],
        };
        let envelope = SignedModelManifest {
            manifest,
            signature: BASE64.encode([0_u8; 64]),
        };

        let error = verify_signed_manifest(envelope, &signing_key.verifying_key()).unwrap_err();
        assert!(matches!(error, VoiceError::Security(_)));
    }

    #[test]
    fn manifest_body_limit_is_enforced_while_streaming() {
        let mut bytes = vec![0_u8; MAX_MANIFEST_BYTES - 1];
        append_manifest_chunk(&mut bytes, &[1]).unwrap();
        assert_eq!(bytes.len(), MAX_MANIFEST_BYTES);
        assert!(append_manifest_chunk(&mut bytes, &[2]).is_err());
    }

    #[test]
    fn derives_mirror_url_only_from_huggingface() {
        let file = test_manifest_file(
            reqwest::Url::parse(
                "https://huggingface.co/badlogicgames/model/resolve/main/model.gguf?download=1",
            )
            .unwrap(),
            1,
        );
        let mirror = file_url_for_source(&file, ModelDownloadSource::HfMirror).unwrap();
        assert_eq!(mirror.host_str(), Some(HF_MIRROR_HOST));
        assert_eq!(
            mirror.path(),
            "/badlogicgames/model/resolve/main/model.gguf"
        );
        assert_eq!(mirror.query(), Some("download=1"));

        let non_hf = test_manifest_file(
            reqwest::Url::parse("https://example.com/model.gguf").unwrap(),
            1,
        );
        assert!(file_url_for_source(&non_hf, ModelDownloadSource::HfMirror).is_err());
    }

    #[test]
    fn source_order_prefers_requested_source() {
        assert_eq!(
            ModelDownloadSource::HfMirror.ordered(),
            [
                ModelDownloadSource::HfMirror,
                ModelDownloadSource::HuggingFace
            ]
        );
        assert_eq!(
            ModelDownloadSource::HuggingFace.ordered(),
            [
                ModelDownloadSource::HuggingFace,
                ModelDownloadSource::HfMirror
            ]
        );
        assert_eq!(
            ModelDownloadSource::Auto.ordered(),
            [
                ModelDownloadSource::HuggingFace,
                ModelDownloadSource::HfMirror
            ]
        );
    }

    #[tokio::test]
    async fn source_fallback_uses_huggingface_when_mirror_url_is_unavailable() {
        let response =
            b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc".to_vec();
        let (url, server) = serve_once(response, None);
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join(Q8_TRANSFORMER_FILE);
        let mut file = test_manifest_file(url.clone(), 3);
        file.sha256 = Sha256Hex::parse(hex::encode(Sha256::digest(b"abc"))).unwrap();

        let used = download_file_with_sources(
            &reqwest::Client::new(),
            &file,
            &destination,
            ModelDownloadSource::HfMirror,
            &CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap();
        server.join().unwrap();

        assert_eq!(used, ModelDownloadSource::HuggingFace);
        assert_eq!(std::fs::read(destination).unwrap(), b"abc");
    }

    #[tokio::test]
    async fn resumable_download_requests_and_appends_from_existing_offset() {
        let response = b"HTTP/1.1 206 Partial Content\r\nContent-Length: 3\r\nContent-Range: bytes 3-5/6\r\nConnection: close\r\n\r\ndef".to_vec();
        let (url, server) = serve_once(response, Some("Range: bytes=3-"));
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join(Q8_TRANSFORMER_FILE);
        let partial = source_part_path(&destination, ModelDownloadSource::HuggingFace);
        std::fs::write(&partial, b"abc").unwrap();

        download_with_resume_inner(
            &reqwest::Client::new(),
            &test_manifest_file(url.clone(), 6),
            url.clone(),
            &destination,
            ModelDownloadSource::HuggingFace,
            &CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap();
        server.join().unwrap();

        assert_eq!(std::fs::read(destination).unwrap(), b"abcdef");
        assert!(!partial.exists());
    }

    #[tokio::test]
    async fn download_rejects_declared_size_mismatch() {
        let response =
            b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc".to_vec();
        let (url, server) = serve_once(response, None);
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join(Q8_TRANSFORMER_FILE);

        let error = download_with_resume_inner(
            &reqwest::Client::new(),
            &test_manifest_file(url.clone(), 4),
            url.clone(),
            &destination,
            ModelDownloadSource::HuggingFace,
            &CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap_err();
        server.join().unwrap();

        assert!(matches!(error, VoiceError::Security(_)));
        assert!(!destination.exists());
    }

    #[tokio::test]
    async fn download_honors_preexisting_cancellation_before_network_io() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join(Q8_TRANSFORMER_FILE);
        let url = reqwest::Url::parse("http://127.0.0.1:9/model.gguf").unwrap();
        let cancel = CancellationToken::new();
        cancel.cancel();

        let error = download_with_resume_inner(
            &reqwest::Client::new(),
            &test_manifest_file(url.clone(), 1),
            url.clone(),
            &destination,
            ModelDownloadSource::HuggingFace,
            &cancel,
            |_| {},
        )
        .await
        .unwrap_err();

        assert!(matches!(error, VoiceError::Cancelled(_)));
        assert!(!destination.exists());
    }

    #[test]
    fn receipt_detects_hash_mismatch() {
        let directory = tempfile::tempdir().unwrap();
        let version = ModelVersion::parse("test-v1").unwrap();
        let model_dir = model_dir(directory.path(), &version);
        std::fs::create_dir_all(&model_dir).unwrap();
        std::fs::write(model_dir.join("model.gguf"), b"wrong").unwrap();
        let receipt = InstallReceipt {
            schema_version: 1,
            model_version: version.as_str().to_string(),
            manifest_sha256: None,
            source: "manual".to_string(),
            installed_at_ms: 0,
            files: vec![InstallReceiptFile {
                name: "model.gguf".to_string(),
                size_bytes: 5,
                sha256: "a".repeat(64),
            }],
        };
        write_receipt_blocking(&model_dir, &receipt).unwrap();
        assert!(load_valid_receipt(&model_dir, &version).is_err());
    }

    fn write_receipt_and_model(model_dir: &Path, version: &ModelVersion, contents: &[u8]) {
        std::fs::write(model_dir.join("model.gguf"), contents).unwrap();
        let sha256 = hash_file(&model_dir.join("model.gguf")).unwrap();
        let receipt = InstallReceipt {
            schema_version: 1,
            model_version: version.as_str().to_string(),
            manifest_sha256: None,
            source: "manual".to_string(),
            installed_at_ms: 0,
            files: vec![InstallReceiptFile {
                name: "model.gguf".to_string(),
                size_bytes: contents.len() as u64,
                sha256,
            }],
        };
        write_receipt_blocking(model_dir, &receipt).unwrap();
    }

    #[test]
    fn cached_verification_skips_rehash_until_the_fingerprint_changes() {
        let directory = tempfile::tempdir().unwrap();
        let version = ModelVersion::parse("test-v1").unwrap();
        let model_dir = model_dir(directory.path(), &version);
        std::fs::create_dir_all(&model_dir).unwrap();
        write_receipt_and_model(&model_dir, &version, b"correct-bytes");

        let snapshot = inspect_model(&model_dir, &version).unwrap();
        assert!(verify_model_snapshot_cached(&model_dir, &snapshot, false).is_ok());
        assert!(
            model_dir.join(VERIFIED_FINGERPRINT_FILE).is_file(),
            "a successful verify should persist the fingerprint"
        );

        // Re-running with the exact same (unchanged) fingerprint must not
        // re-hash: deleting the model file entirely would make a real
        // re-verify fail, so success here proves the persisted-fingerprint
        // shortcut is what's being taken.
        std::fs::remove_file(model_dir.join("model.gguf")).unwrap();
        assert!(
            verify_model_snapshot_cached(&model_dir, &snapshot, false).is_ok(),
            "unchanged fingerprint should short-circuit the re-hash"
        );

        // Restore the file with different (still same-length, same-receipt)
        // content -- this changes the mtime, so the fingerprint no longer
        // matches and a real re-verify must run and catch the mismatch.
        std::fs::write(model_dir.join("model.gguf"), b"wrongcontent!").unwrap();
        let changed_snapshot = inspect_model(&model_dir, &version).unwrap();
        assert_ne!(changed_snapshot.fingerprint, snapshot.fingerprint);
        assert!(verify_model_snapshot_cached(&model_dir, &changed_snapshot, false).is_err());
        assert!(
            !model_dir.join(VERIFIED_FINGERPRINT_FILE).is_file(),
            "a failed re-verify should clear the stale persisted fingerprint"
        );
    }

    #[test]
    fn force_bypasses_the_persisted_fingerprint_shortcut() {
        let directory = tempfile::tempdir().unwrap();
        let version = ModelVersion::parse("test-v1").unwrap();
        let model_dir = model_dir(directory.path(), &version);
        std::fs::create_dir_all(&model_dir).unwrap();
        write_receipt_and_model(&model_dir, &version, b"correct-bytes");

        let snapshot = inspect_model(&model_dir, &version).unwrap();
        assert!(verify_model_snapshot_cached(&model_dir, &snapshot, false).is_ok());

        // Same fingerprint, but force=true must still re-hash on disk (and
        // does, successfully, since the bytes are still intact here).
        assert!(verify_model_snapshot_cached(&model_dir, &snapshot, true).is_ok());
    }

    #[test]
    fn incomplete_manual_import_does_not_modify_existing_model() {
        let directory = tempfile::tempdir().unwrap();
        let version = ModelVersion::parse("test-v1").unwrap();
        let destination = model_dir(directory.path(), &version);
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::write(destination.join("existing.marker"), b"preserve").unwrap();

        let transformer = directory.path().join(Q8_TRANSFORMER_FILE);
        std::fs::write(&transformer, b"model").unwrap();
        let error = manual_import(directory.path(), &version, &[transformer]).unwrap_err();

        assert!(matches!(error, VoiceError::Validation { .. }));
        assert_eq!(
            std::fs::read(destination.join("existing.marker")).unwrap(),
            b"preserve"
        );
    }

    #[test]
    fn manual_import_commits_a_verified_receipt() {
        let directory = tempfile::tempdir().unwrap();
        let source_directory = directory.path().join("source");
        std::fs::create_dir(&source_directory).unwrap();
        let transformer = source_directory.join(Q8_TRANSFORMER_FILE);
        let tokenizer = source_directory.join(TOKENIZER_FILE);
        std::fs::write(&transformer, b"model").unwrap();
        std::fs::write(&tokenizer, b"tokenizer").unwrap();
        let version = ModelVersion::parse("test-v1").unwrap();

        let receipt = manual_import(directory.path(), &version, &[transformer, tokenizer]).unwrap();

        assert_eq!(receipt.files.len(), 2);
        assert!(matches!(
            validate_installed_model(directory.path(), version.as_str()),
            ModelState::Ready { version: ready_version } if ready_version == version.as_str()
        ));
    }

    #[test]
    fn primary_model_hash_uses_sidecar_q8_priority() {
        let receipt = InstallReceipt {
            schema_version: 1,
            model_version: "test-v1".to_string(),
            manifest_sha256: None,
            source: "manual".to_string(),
            installed_at_ms: 0,
            files: vec![
                InstallReceiptFile {
                    name: F16_TRANSFORMER_FILE.to_string(),
                    size_bytes: 1,
                    sha256: "f".repeat(64),
                },
                InstallReceiptFile {
                    name: Q8_TRANSFORMER_FILE.to_string(),
                    size_bytes: 1,
                    sha256: "8".repeat(64),
                },
            ],
        };

        assert_eq!(
            receipt.primary_model_sha256(),
            Some("8".repeat(64).as_str())
        );
    }

    #[test]
    fn embedded_manifest_is_signed_and_complete() {
        let manifest = embedded_manifest().unwrap();
        assert!(
            manifest
                .model_version
                .as_str()
                .contains("11f12ba6add0fc708be86c51b384a76489fe2608")
        );
        assert_eq!(manifest.files.len(), 2);
        assert!(manifest.files.iter().all(|file| {
            file.url
                .as_str()
                .contains("11f12ba6add0fc708be86c51b384a76489fe2608")
        }));
        assert_eq!(
            manifest.primary_model_sha256().as_deref(),
            Some("c6ed09d25e6ce06d5804233fcce3f0c62661cc12ab5549bc25edf3d61f0dd4f8")
        );
    }
}
