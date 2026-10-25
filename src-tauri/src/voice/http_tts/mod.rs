//! HTTP TTS providers: user-configured web endpoints (a local forwarder, an
//! OpenAI-compatible server, Google Cloud TTS, ...) used as a generation
//! source. Takes are synthesized ahead of time into ordinary catalog WAVs,
//! so cue playback never touches the network.

mod batch;
mod config;
mod endpoint;
mod request;
mod synth;

use serde::Serialize;
use specta::Type;
use tokio_util::sync::CancellationToken;

pub(super) use batch::clear_previews;
pub use config::{
    HttpBodyEncoding, HttpBodyTemplate, HttpHeaderTemplate, HttpLanguageParam, HttpLanguageParams,
    HttpMethod, HttpProviderInput, HttpProviderMeta, HttpRequestSpec, HttpResponseFormat,
};
pub(super) use endpoint::build_client;

use self::batch::{HttpJob, run_batch, write_clip_blocking};
use self::config::mark_mismatched_http_assets_stale;
use super::error::{VoiceError, VoiceResult};
use super::generation::{
    GenerateItemRequest, GenerationArtifactsGuard, GenerationSummary, apply_generated_assets,
    ensure_generatable, generation_fingerprint,
};
use super::generator::emit_progress;
use super::models::{VoiceGenerationProgress, VoiceLanguage, VoiceOperationState};
use super::phrases::{remove_asset_files_best_effort, validate_label};
use super::service::VoiceService;
use super::types::HttpProviderId;
use super::{catalog, new_id};

pub struct HttpGenerateRequest {
    pub provider_id: HttpProviderId,
    pub items: Vec<GenerateItemRequest>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HttpProviderTestResult {
    pub duration_sec: f64,
}

impl VoiceService {
    pub fn save_http_provider(&self, input: HttpProviderInput) -> VoiceResult<HttpProviderMeta> {
        let is_new = input.id.is_none();
        let provider = input.into_provider()?;
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        let mut catalog = self.inner.catalog.lock().clone();
        match catalog
            .http_providers
            .iter_mut()
            .find(|existing| existing.id == provider.id)
        {
            Some(existing) => *existing = provider.clone(),
            None if is_new => catalog.http_providers.push(provider.clone()),
            None => return Err(VoiceError::not_found("HTTP provider", provider.id)),
        }
        mark_mismatched_http_assets_stale(&mut catalog);
        self.commit_catalog(catalog)?;
        Ok(provider)
    }

    pub fn delete_http_provider(&self, id: HttpProviderId) -> VoiceResult<()> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::UpdatingCatalog)?;
        let mut catalog = self.inner.catalog.lock().clone();
        let count = catalog.http_providers.len();
        catalog
            .http_providers
            .retain(|provider| provider.id != id.as_str());
        if catalog.http_providers.len() == count {
            return Err(VoiceError::not_found("HTTP provider", id.into_inner()));
        }
        mark_mismatched_http_assets_stale(&mut catalog);
        self.commit_catalog(catalog)
    }

    /// Synthesizes `text` with an unsaved provider draft and plays it. The
    /// take is never cataloged.
    pub async fn test_http_provider(
        &self,
        input: HttpProviderInput,
        text: String,
        language: VoiceLanguage,
    ) -> VoiceResult<HttpProviderTestResult> {
        validate_label("text", &text, 1000)?;
        let provider = input.into_provider()?;
        let audio = synth::synthesize(
            &self.inner.tts_http_client,
            &provider,
            &text,
            language,
            &CancellationToken::new(),
        )
        .await?;
        let path =
            catalog::preview_dir(&self.inner.voice_root).join(format!("{}.wav", new_id("preview")));
        let wav = write_clip_blocking(audio, path.clone(), true).await?;
        self.play_preview_file(path);
        Ok(HttpProviderTestResult {
            duration_sec: wav.duration_sec,
        })
    }

    /// Synthesizes every requested phrase through one provider and commits
    /// the successful takes in a single catalog write. Takes that succeeded
    /// before a cancel or a fatal provider error are still committed: those
    /// requests were already paid for.
    pub async fn generate_http(
        &self,
        request: HttpGenerateRequest,
    ) -> VoiceResult<GenerationSummary> {
        let _guard = self
            .inner
            .operation
            .try_begin(VoiceOperationState::Generating { cancelling: false })?;
        let cancel = CancellationToken::new();
        *self.inner.generation_cancel.lock() = cancel.clone();
        let (provider, jobs) = self.snapshot_http_jobs(&request)?;
        let mut artifacts = GenerationArtifactsGuard::default();
        artifacts.track_output_files(jobs.iter().map(|job| job.output_path.clone()));

        let outcome = run_batch(
            &self.inner.tts_http_client,
            &provider,
            jobs,
            &cancel,
            |progress| emit_progress(&self.inner.app_handle, progress),
        )
        .await;

        let completed = outcome.generated.len() as u32;
        let asset_ids = outcome
            .generated
            .iter()
            .map(|asset| asset.id.clone())
            .collect();
        if !outcome.generated.is_empty() {
            let mut catalog = self.inner.catalog.lock().clone();
            let replaced = apply_generated_assets(&mut catalog, outcome.generated);
            self.commit_catalog(catalog)?;
            artifacts.commit();
            remove_asset_files_best_effort(&self.inner.voice_root, &replaced);
        }
        emit_progress(
            &self.inner.app_handle,
            VoiceGenerationProgress::Finished {
                completed,
                failed: outcome.failed,
            },
        );
        if cancel.is_cancelled() {
            return Err(synth::cancelled());
        }
        if let Some(error) = outcome.fatal {
            return Err(error);
        }
        Ok(GenerationSummary {
            completed,
            failed: outcome.failed,
            profile_id: None,
            asset_ids,
        })
    }

    fn snapshot_http_jobs(
        &self,
        request: &HttpGenerateRequest,
    ) -> VoiceResult<(HttpProviderMeta, Vec<HttpJob>)> {
        if request.items.is_empty() {
            return Err(VoiceError::validation("phraseIds", "must not be empty"));
        }
        let catalog = self.inner.catalog.lock();
        let provider = catalog
            .http_providers
            .iter()
            .find(|provider| provider.id == request.provider_id.as_str())
            .cloned()
            .ok_or_else(|| {
                VoiceError::not_found("HTTP provider", request.provider_id.to_string())
            })?;
        ensure_generatable(&catalog, &request.items)?;
        let source_key = format!("http:{}:{}", provider.id, provider.config_fingerprint);
        let jobs = request
            .items
            .iter()
            .map(|item| {
                let phrase = catalog
                    .phrases
                    .iter()
                    .find(|phrase| phrase.id == item.phrase_id.as_str())
                    .ok_or_else(|| {
                        VoiceError::not_found("voice phrase", item.phrase_id.to_string())
                    })?;
                let asset_id = new_id("asset");
                Ok(HttpJob {
                    output_path: catalog::asset_wav_path(
                        &self.inner.voice_root,
                        &phrase.id,
                        &asset_id,
                    ),
                    params_fingerprint: generation_fingerprint(phrase, "", Some(&source_key)),
                    asset_id,
                    phrase_id: phrase.id.clone(),
                    text: phrase.text.clone(),
                    language: phrase.language,
                })
            })
            .collect::<VoiceResult<Vec<_>>>()?;
        Ok((provider, jobs))
    }
}
