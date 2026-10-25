//! Runs a batch of phrases through one provider: bounded concurrency,
//! per-phrase progress, and an early stop when the provider is clearly
//! misconfigured. Independent of `VoiceService` so it can be tested against
//! a loopback server.

use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use log::warn;
use tokio_util::sync::CancellationToken;

use super::config::HttpProviderMeta;
use super::synth::{self, FetchedAudio};
use crate::voice::audio::{self, WavInfo};
use crate::voice::error::{VoiceError, VoiceResult};
use crate::voice::generation::remove_file_if_present;
use crate::voice::import;
use crate::voice::models::{
    HTTP_MODEL_VERSION, VoiceAssetMeta, VoiceAssetSource, VoiceGenerationProgress, VoiceLanguage,
};
use crate::voice::now_ms;

/// Error field for decoding a returned clip: a per-phrase failure (too
/// long, odd codec), unlike request/response shape errors.
const AUDIO_FIELD: &str = "audio";

/// One phrase of a batch, snapshotted from the catalog before any request.
pub(super) struct HttpJob {
    pub asset_id: String,
    pub phrase_id: String,
    pub text: String,
    pub language: VoiceLanguage,
    pub params_fingerprint: String,
    pub output_path: PathBuf,
}

#[derive(Debug, Default)]
pub(super) struct BatchOutcome {
    /// Takes written to disk, ready to be applied to the catalog.
    pub generated: Vec<VoiceAssetMeta>,
    pub failed: u32,
    /// The error that stopped the batch early, if any.
    pub fatal: Option<VoiceError>,
}

/// Synthesizes `jobs` with up to `provider.max_concurrency` requests in
/// flight. A fatal error (see [`synth::is_fatal`]) stops dispatching the
/// remaining jobs; `cancel` stops everything. Neither discards takes that
/// already succeeded.
pub(super) async fn run_batch<F>(
    client: &reqwest::Client,
    provider: &HttpProviderMeta,
    jobs: Vec<HttpJob>,
    cancel: &CancellationToken,
    emit: F,
) -> BatchOutcome
where
    F: Fn(VoiceGenerationProgress) + Sync,
{
    // A child token, so a fatal stop is not mistaken for a user cancel.
    let stop = cancel.child_token();
    let (stop, emit) = (&stop, &emit);
    let results: Vec<(HttpJob, VoiceResult<WavInfo>)> = futures_util::stream::iter(jobs)
        .map(|job| async move {
            let result = run_job(client, provider, &job, stop, emit).await;
            (job, result)
        })
        .buffer_unordered(usize::from(provider.max_concurrency))
        .collect()
        .await;

    let source = VoiceAssetSource::Http {
        provider_id: provider.id.clone(),
        config_fingerprint: provider.config_fingerprint.clone(),
    };
    let mut outcome = BatchOutcome::default();
    for (job, result) in results {
        match result {
            Ok(wav) => outcome.generated.push(VoiceAssetMeta {
                id: job.asset_id,
                phrase_id: job.phrase_id,
                source: source.clone(),
                model_version: HTTP_MODEL_VERSION.to_string(),
                params_fingerprint: job.params_fingerprint,
                created_at_ms: now_ms(),
                duration_sec: wav.duration_sec,
                sample_rate: wav.sample_rate as i32,
                stale: false,
            }),
            // Never started, or interrupted by a cancel/fatal stop.
            Err(VoiceError::Cancelled(_)) => {}
            Err(error) => {
                outcome.failed += 1;
                if outcome.fatal.is_none() && synth::is_fatal(&error) {
                    outcome.fatal = Some(error);
                }
            }
        }
    }
    outcome
}

async fn run_job<F>(
    client: &reqwest::Client,
    provider: &HttpProviderMeta,
    job: &HttpJob,
    stop: &CancellationToken,
    emit: &F,
) -> VoiceResult<WavInfo>
where
    F: Fn(VoiceGenerationProgress),
{
    if stop.is_cancelled() {
        return Err(synth::cancelled());
    }
    let item = |status: &str, error: Option<String>| {
        emit(VoiceGenerationProgress::Item {
            id: job.asset_id.clone(),
            status: status.to_string(),
            error,
        });
    };
    item("start", None);
    let result = match synth::synthesize(client, provider, &job.text, job.language, stop).await {
        Ok(audio) => write_clip_blocking(audio, job.output_path.clone(), false).await,
        Err(error) => Err(error),
    };
    match &result {
        Ok(_) => item("ok", None),
        Err(VoiceError::Cancelled(_)) => {}
        Err(error) => {
            if synth::is_fatal(error) {
                stop.cancel();
            }
            item("error", Some(error.to_string()));
        }
    }
    result
}

/// Decodes a fetched clip into the canonical catalog WAV at `path`,
/// removing any partial file on failure.
fn write_clip(audio: FetchedAudio, path: &Path) -> VoiceResult<WavInfo> {
    let result = import::decode_bytes(audio.bytes, audio.mime_type.as_deref(), AUDIO_FIELD)
        .and_then(|clip| import::write_pcm16_wav(path, &clip.samples, import::IMPORT_SAMPLE_RATE))
        .and_then(|()| audio::read_wav_info(path));
    if result.is_err() {
        remove_file_if_present(path, "partial HTTP TTS audio");
    }
    result
}

/// [`write_clip`] off the async runtime. `clear_previews_first` empties the
/// target's directory beforehand (test takes replace each other).
pub(super) async fn write_clip_blocking(
    audio: FetchedAudio,
    path: PathBuf,
    clear_previews_first: bool,
) -> VoiceResult<WavInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        if clear_previews_first && let Some(directory) = path.parent() {
            clear_previews(directory);
        }
        write_clip(audio, &path)
    })
    .await
    .map_err(|error| VoiceError::Internal(format!("audio decode task failed: {error}")))?
}

/// Best-effort removal of earlier test takes. A take that is still playing
/// is deleted once the player closes it.
pub(in crate::voice) fn clear_previews(directory: &Path) {
    if let Err(error) = std::fs::remove_dir_all(directory)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        warn!(target: "app::voice", "failed to clear HTTP TTS previews {}: {error}", directory.display());
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::voice::http_tts::config::tests::input;
    use crate::voice::http_tts::endpoint::build_client;
    use crate::voice::import::{IMPORT_SAMPLE_RATE, write_pcm16_wav};
    use crate::voice::test_support::serve_sequence;

    fn wav_response() -> Vec<u8> {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.wav");
        write_pcm16_wav(&path, &vec![1_000; 12_000], IMPORT_SAMPLE_RATE).unwrap();
        let body = std::fs::read(path).unwrap();
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: audio/wav\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(&body);
        response
    }

    /// `Retry-After: 0` keeps retried statuses from slowing the test down.
    fn status_response(status: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nRetry-After: 0\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    fn jobs(dir: &Path, count: usize) -> Vec<HttpJob> {
        (0..count)
            .map(|index| HttpJob {
                asset_id: format!("asset_{index}"),
                phrase_id: format!("phrase_{index}"),
                text: format!("line {index}"),
                language: VoiceLanguage::ZhCn,
                params_fingerprint: String::new(),
                output_path: dir.join(format!("phrase_{index}/asset_{index}.wav")),
            })
            .collect()
    }

    fn provider(url: &str) -> HttpProviderMeta {
        let mut input = input(url);
        input.max_concurrency = 1;
        input.into_provider().unwrap()
    }

    #[tokio::test]
    async fn successful_takes_become_catalog_assets_and_failures_are_counted() {
        let (base, server) = serve_sequence(vec![
            wav_response(),
            status_response("500 Internal Server Error", "{}"),
            status_response("500 Internal Server Error", "{}"),
            status_response("500 Internal Server Error", r#"{"error":"busy"}"#),
            wav_response(),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let provider = provider(&format!("{base}/tts"));
        let events = Mutex::new(Vec::new());

        let outcome = run_batch(
            &build_client().unwrap(),
            &provider,
            jobs(dir.path(), 3),
            &CancellationToken::new(),
            |progress| events.lock().unwrap().push(progress),
        )
        .await;
        server.join().unwrap();

        assert_eq!(outcome.failed, 1);
        assert!(outcome.fatal.is_none());
        let ids: Vec<_> = outcome.generated.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, ["asset_0", "asset_2"]);
        let asset = &outcome.generated[0];
        assert_eq!(asset.model_version, HTTP_MODEL_VERSION);
        assert!(matches!(
            &asset.source,
            VoiceAssetSource::Http { provider_id, config_fingerprint }
                if *provider_id == provider.id && *config_fingerprint == provider.config_fingerprint
        ));
        assert!((asset.duration_sec - 0.5).abs() < 0.01);
        assert!(dir.path().join("phrase_0/asset_0.wav").is_file());
        assert!(!dir.path().join("phrase_1/asset_1.wav").exists());
        let errors: Vec<_> = events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|event| match event {
                VoiceGenerationProgress::Item { status, error, .. } if status == "error" => {
                    error.clone()
                }
                _ => None,
            })
            .collect();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("busy"), "{errors:?}");
    }

    #[tokio::test]
    async fn an_auth_failure_stops_the_batch_but_keeps_earlier_takes() {
        let (base, server) = serve_sequence(vec![
            wav_response(),
            status_response("401 Unauthorized", r#"{"error":"bad key"}"#),
        ]);
        let dir = tempfile::tempdir().unwrap();

        let outcome = run_batch(
            &build_client().unwrap(),
            &provider(&format!("{base}/tts")),
            jobs(dir.path(), 4),
            &CancellationToken::new(),
            |_| {},
        )
        .await;
        server.join().unwrap();

        assert_eq!(outcome.generated.len(), 1);
        assert_eq!(outcome.failed, 1);
        assert!(matches!(
            outcome.fatal,
            Some(VoiceError::Upstream { status: 401, ref message }) if message.contains("bad key")
        ));
    }

    #[tokio::test]
    async fn a_cancelled_batch_sends_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let cancel = CancellationToken::new();
        cancel.cancel();

        let outcome = run_batch(
            &build_client().unwrap(),
            &provider("http://127.0.0.1:9/tts"),
            jobs(dir.path(), 2),
            &cancel,
            |_| panic!("no progress expected"),
        )
        .await;

        assert!(outcome.generated.is_empty());
        assert_eq!(outcome.failed, 0);
        assert!(outcome.fatal.is_none());
    }
}
