//! One synthesis call: build the request, send it (retrying throttling and
//! transient server errors), read a size-capped body and pull the audio
//! out of it.

use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use futures_util::StreamExt;
use reqwest::header::{CONTENT_TYPE, RETRY_AFTER};
use reqwest::{Response, StatusCode};
use tokio_util::sync::CancellationToken;

use super::config::{HttpProviderMeta, HttpResponseFormat};
use super::request;
use crate::voice::error::{VoiceError, VoiceResult};
use crate::voice::models::VoiceLanguage;

/// Generous for a short line in any container, base64 overhead included.
const MAX_RESPONSE_BYTES: usize = 24 * 1024 * 1024;
const MAX_ATTEMPTS: u32 = 3;
const MAX_RETRY_DELAY: Duration = Duration::from_secs(10);
const ERROR_SNIPPET_CHARS: usize = 300;
const RESPONSE_FIELD: &str = "response";

pub(super) struct FetchedAudio {
    pub bytes: Vec<u8>,
    /// Server-reported container, a decode hint; `None` for base64 payloads.
    pub mime_type: Option<String>,
}

/// Whether `error` means the provider is misconfigured or unreachable, so
/// every other phrase of the batch would fail the same way. Decoding the
/// returned audio (wrong duration, odd codec) stays a per-phrase failure.
pub(super) fn is_fatal(error: &VoiceError) -> bool {
    match error {
        VoiceError::Upstream { status, .. } => {
            (400..500).contains(status) && !is_retryable(*status)
        }
        VoiceError::Validation { field, .. } => {
            field.starts_with("request") || *field == RESPONSE_FIELD
        }
        VoiceError::Http { source, .. } => source.is_connect(),
        _ => false,
    }
}

const fn is_retryable(status: u16) -> bool {
    matches!(status, 408 | 429 | 500 | 502 | 503 | 504)
}

/// # Errors
/// `Cancelled` when `cancel` fires; `Http` for transport failures;
/// `Upstream` for an error status after retries; `Validation` for a bad
/// rendered request or a response that holds no audio.
pub(super) async fn synthesize(
    client: &reqwest::Client,
    provider: &HttpProviderMeta,
    text: &str,
    language: VoiceLanguage,
    cancel: &CancellationToken,
) -> VoiceResult<FetchedAudio> {
    let request = request::build(&provider.request, &provider.secret, text, language)?;
    let mut attempt = 1;
    loop {
        let attempt_request = request
            .try_clone()
            .ok_or_else(|| VoiceError::Internal("HTTP TTS request is not clonable".to_string()))?;
        let response = tokio::select! {
            () = cancel.cancelled() => return Err(cancelled()),
            response = client.execute(attempt_request) => {
                response.map_err(|source| VoiceError::Http {
                    context: format!("call HTTP TTS provider {}", provider.name),
                    source,
                })?
            }
        };
        let status = response.status();
        if status.is_success() {
            let mime_type = mime_essence(&response);
            let body = read_body(response, cancel).await?;
            return extract_audio(&provider.request.response, mime_type, body);
        }
        let delay = retry_delay(&response, attempt);
        let body = read_body(response, cancel).await.unwrap_or_default();
        if !is_retryable(status.as_u16()) || attempt >= MAX_ATTEMPTS {
            return Err(upstream_error(status, &body));
        }
        tokio::select! {
            () = cancel.cancelled() => return Err(cancelled()),
            () = tokio::time::sleep(delay) => {}
        }
        attempt += 1;
    }
}

pub(super) fn cancelled() -> VoiceError {
    VoiceError::Cancelled("voice generation cancelled".to_string())
}

fn mime_essence(response: &Response) -> Option<String> {
    let value = response.headers().get(CONTENT_TYPE)?.to_str().ok()?;
    let essence = value.split(';').next()?.trim().to_ascii_lowercase();
    (!essence.is_empty()).then_some(essence)
}

fn retry_delay(response: &Response, attempt: u32) -> Duration {
    response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map_or(
            Duration::from_secs(if attempt == 1 { 1 } else { 3 }),
            Duration::from_secs,
        )
        .min(MAX_RETRY_DELAY)
}

async fn read_body(response: Response, cancel: &CancellationToken) -> VoiceResult<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(too_large());
    }
    let capacity = response.content_length().unwrap_or(0) as usize;
    let mut bytes = Vec::with_capacity(capacity);
    let mut stream = std::pin::pin!(response.bytes_stream());
    loop {
        let chunk = tokio::select! {
            () = cancel.cancelled() => return Err(cancelled()),
            chunk = stream.next() => chunk,
        };
        let Some(chunk) = chunk else {
            return Ok(bytes);
        };
        let chunk = chunk.map_err(|source| VoiceError::Http {
            context: "read HTTP TTS response".to_string(),
            source,
        })?;
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(too_large());
        }
        bytes.extend_from_slice(&chunk);
    }
}

fn too_large() -> VoiceError {
    VoiceError::validation(
        RESPONSE_FIELD,
        format!("larger than {} MiB", MAX_RESPONSE_BYTES / (1024 * 1024)),
    )
}

fn snippet(body: &[u8]) -> String {
    String::from_utf8_lossy(body)
        .trim()
        .chars()
        .take(ERROR_SNIPPET_CHARS)
        .collect()
}

fn upstream_error(status: StatusCode, body: &[u8]) -> VoiceError {
    let detail = snippet(body);
    VoiceError::Upstream {
        status: status.as_u16(),
        message: if detail.is_empty() {
            status.canonical_reason().unwrap_or_default().to_string()
        } else {
            detail
        },
    }
}

fn extract_audio(
    format: &HttpResponseFormat,
    mime_type: Option<String>,
    body: Vec<u8>,
) -> VoiceResult<FetchedAudio> {
    match format {
        HttpResponseFormat::AudioBytes => {
            // A 200 carrying an error document is a template mistake; say so
            // instead of failing later with "corrupt audio".
            if let Some(mime) = mime_type
                .as_deref()
                .filter(|mime| mime.starts_with("text/") || mime.contains("json"))
            {
                return Err(VoiceError::validation(
                    RESPONSE_FIELD,
                    format!("expected audio but got {mime}: {}", snippet(&body)),
                ));
            }
            Ok(FetchedAudio {
                bytes: body,
                mime_type,
            })
        }
        HttpResponseFormat::JsonBase64 { pointer } => {
            let document: serde_json::Value = serde_json::from_slice(&body).map_err(|error| {
                VoiceError::validation(
                    RESPONSE_FIELD,
                    format!("not JSON ({error}): {}", snippet(&body)),
                )
            })?;
            let encoded = document
                .pointer(pointer)
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    VoiceError::validation(
                        RESPONSE_FIELD,
                        format!("no base64 string at {pointer}: {}", snippet(&body)),
                    )
                })?;
            let bytes = STANDARD.decode(encoded.trim()).map_err(|error| {
                VoiceError::validation(
                    RESPONSE_FIELD,
                    format!("invalid base64 at {pointer}: {error}"),
                )
            })?;
            Ok(FetchedAudio {
                bytes,
                mime_type: None,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_base64_audio_at_the_pointer() {
        let body = br#"{"audioContent":"UklGRg=="}"#.to_vec();
        let audio = extract_audio(
            &HttpResponseFormat::JsonBase64 {
                pointer: "/audioContent".to_string(),
            },
            Some("application/json".to_string()),
            body,
        )
        .unwrap();
        assert_eq!(audio.bytes, b"RIFF");
        assert_eq!(audio.mime_type, None);
    }

    #[test]
    fn reports_a_missing_pointer_and_error_documents_served_as_audio() {
        let missing = extract_audio(
            &HttpResponseFormat::JsonBase64 {
                pointer: "/audioContent".to_string(),
            },
            None,
            br#"{"error":{"message":"API key not valid"}}"#.to_vec(),
        );
        assert!(
            matches!(missing, Err(VoiceError::Validation { message, .. }) if message.contains("API key not valid"))
        );

        let json_as_audio = extract_audio(
            &HttpResponseFormat::AudioBytes,
            Some("application/json".to_string()),
            br#"{"detail":"voice not found"}"#.to_vec(),
        );
        assert!(
            matches!(json_as_audio, Err(VoiceError::Validation { message, .. }) if message.contains("voice not found"))
        );

        let audio = extract_audio(
            &HttpResponseFormat::AudioBytes,
            Some("audio/mpeg".to_string()),
            vec![1, 2, 3],
        )
        .unwrap();
        assert_eq!(audio.mime_type.as_deref(), Some("audio/mpeg"));
    }

    #[test]
    fn auth_and_template_errors_are_fatal_throttling_is_not() {
        let upstream = |status| VoiceError::Upstream {
            status,
            message: String::new(),
        };
        assert!(is_fatal(&upstream(401)));
        assert!(is_fatal(&upstream(404)));
        assert!(!is_fatal(&upstream(429)));
        assert!(!is_fatal(&upstream(503)));
        assert!(is_fatal(&VoiceError::validation("request.headers", "bad")));
        assert!(is_fatal(&VoiceError::validation(RESPONSE_FIELD, "bad")));
        assert!(!is_fatal(&VoiceError::validation("audio", "too long")));
    }
}
