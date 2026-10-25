//! Provider configuration: the persisted shape, parsing the frontend's input
//! into a validated provider, the request fingerprint, and the staleness
//! rule that ties cataloged takes to it.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use super::request::{self, Escape};
use crate::voice::error::{VoiceError, VoiceResult};
use crate::voice::models::{VoiceAssetSource, VoiceCatalog, VoiceLanguage};
use crate::voice::phrases::validate_label;
use crate::voice::types::HttpProviderId;
use crate::voice::{new_id, now_ms};

pub const DEFAULT_MAX_CONCURRENCY: u8 = 2;
pub const MAX_CONCURRENCY: u8 = 8;
const MAX_TEMPLATE_BYTES: usize = 16 * 1024;
const MAX_PARAM_BYTES: usize = 256;
const MAX_SECRET_BYTES: usize = 4 * 1024;
const MAX_HEADERS: usize = 32;
const SAMPLE_TEXT: &str = "test";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HttpMethod {
    Get,
    Post,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpHeaderTemplate {
    pub name: String,
    pub value: String,
}

/// How placeholders are escaped inside the body, and the `Content-Type`
/// sent when the headers don't set one.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HttpBodyEncoding {
    Json,
    Form,
    Xml,
    Text,
}

impl HttpBodyEncoding {
    pub(super) const fn escape(self) -> Escape {
        match self {
            Self::Json => Escape::Json,
            Self::Form => Escape::Percent,
            Self::Xml => Escape::Xml,
            Self::Text => Escape::None,
        }
    }

    pub(super) const fn default_content_type(self) -> &'static str {
        match self {
            Self::Json => "application/json",
            Self::Form => "application/x-www-form-urlencoded",
            Self::Xml => "application/ssml+xml",
            Self::Text => "text/plain; charset=utf-8",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpBodyTemplate {
    pub encoding: HttpBodyEncoding,
    pub template: String,
}

/// Where the audio is in a successful response.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum HttpResponseFormat {
    /// The body is the audio file itself.
    AudioBytes,
    /// The body is JSON with the base64 audio at a JSON Pointer
    /// (e.g. Google's `/audioContent`).
    JsonBase64 { pointer: String },
}

/// Per-language values for the `{lang}` and `{voice}` placeholders.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HttpLanguageParam {
    pub lang: String,
    pub voice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HttpLanguageParams {
    pub zh_cn: HttpLanguageParam,
    pub en_us: HttpLanguageParam,
    pub ja_jp: HttpLanguageParam,
}

impl HttpLanguageParams {
    #[must_use]
    pub const fn for_language(&self, language: VoiceLanguage) -> &HttpLanguageParam {
        match language {
            VoiceLanguage::ZhCn => &self.zh_cn,
            VoiceLanguage::EnUs => &self.en_us,
            VoiceLanguage::JaJp => &self.ja_jp,
        }
    }

    fn iter(&self) -> impl Iterator<Item = (VoiceLanguage, &HttpLanguageParam)> {
        [
            (VoiceLanguage::ZhCn, &self.zh_cn),
            (VoiceLanguage::EnUs, &self.en_us),
            (VoiceLanguage::JaJp, &self.ja_jp),
        ]
        .into_iter()
    }
}

/// Everything that shapes the audio a provider returns. Its fingerprint is
/// what cataloged takes are checked against.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestSpec {
    pub method: HttpMethod,
    /// URL template; placeholders are percent-encoded.
    pub url: String,
    pub headers: Vec<HttpHeaderTemplate>,
    pub body: Option<HttpBodyTemplate>,
    pub response: HttpResponseFormat,
    pub languages: HttpLanguageParams,
}

/// A configured HTTP TTS provider, persisted in the catalog.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpProviderMeta {
    pub id: String,
    pub name: String,
    pub request: HttpRequestSpec,
    /// Substituted for `{secret}`. Stored in plain text with the catalog.
    pub secret: String,
    pub max_concurrency: u8,
    /// SHA-256 of `request` only: renaming the provider, rotating its
    /// secret or tuning concurrency never invalidates its audio.
    pub config_fingerprint: String,
    pub updated_at_ms: i64,
}

/// A provider as submitted by the settings UI. `id: None` creates one.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HttpProviderInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub request: HttpRequestSpec,
    #[serde(default)]
    pub secret: String,
    #[serde(default = "default_max_concurrency")]
    pub max_concurrency: u8,
}

const fn default_max_concurrency() -> u8 {
    DEFAULT_MAX_CONCURRENCY
}

impl HttpProviderInput {
    /// Validates the input into a provider ready to persist or call,
    /// minting an id when it is new.
    ///
    /// # Errors
    /// `Validation` for malformed templates, header names, pointers or
    /// oversized fields; `Validation` when the rendered URL points at a
    /// disallowed endpoint (see [`super::endpoint::check_endpoint`]).
    pub fn into_provider(self) -> VoiceResult<HttpProviderMeta> {
        let id = match self.id {
            Some(id) => HttpProviderId::parse(id)?.into_inner(),
            None => new_id("http"),
        };
        validate_label("name", &self.name, 120)?;
        if self.secret.len() > MAX_SECRET_BYTES {
            return Err(VoiceError::validation("secret", "is too long"));
        }
        if self.secret.contains(['\r', '\n']) {
            return Err(VoiceError::validation(
                "secret",
                "must not contain line breaks",
            ));
        }
        validate_request(&self.request, &self.secret)?;
        Ok(HttpProviderMeta {
            id,
            name: self.name.trim().to_string(),
            config_fingerprint: config_fingerprint(&self.request)?,
            request: self.request,
            secret: self.secret,
            max_concurrency: self.max_concurrency.clamp(1, MAX_CONCURRENCY),
            updated_at_ms: now_ms(),
        })
    }
}

fn validate_request(spec: &HttpRequestSpec, secret: &str) -> VoiceResult<()> {
    if spec.url.len() > MAX_TEMPLATE_BYTES {
        return Err(VoiceError::validation("request.url", "is too long"));
    }
    if spec.headers.len() > MAX_HEADERS {
        return Err(VoiceError::validation(
            "request.headers",
            "too many headers",
        ));
    }
    for header in &spec.headers {
        if header.value.len() > MAX_TEMPLATE_BYTES {
            return Err(VoiceError::validation(
                "request.headers",
                "value is too long",
            ));
        }
    }
    if let Some(body) = &spec.body {
        if spec.method == HttpMethod::Get {
            return Err(VoiceError::validation(
                "request.body",
                "GET requests cannot carry a body",
            ));
        }
        if body.template.len() > MAX_TEMPLATE_BYTES {
            return Err(VoiceError::validation("request.body", "is too long"));
        }
    }
    if let HttpResponseFormat::JsonBase64 { pointer } = &spec.response
        && !pointer.starts_with('/')
    {
        return Err(VoiceError::validation(
            "request.response.pointer",
            "must be a JSON Pointer starting with '/'",
        ));
    }
    // Rendering a sample request per language checks the URL, endpoint and
    // header names/values exactly the way a real request is built.
    for (language, param) in spec.languages.iter() {
        if param.lang.len() > MAX_PARAM_BYTES || param.voice.len() > MAX_PARAM_BYTES {
            return Err(VoiceError::validation(
                "request.languages",
                "values are too long",
            ));
        }
        request::build(spec, secret, SAMPLE_TEXT, language)?;
    }
    Ok(())
}

/// SHA-256 over the canonical JSON of the request shape.
fn config_fingerprint(spec: &HttpRequestSpec) -> VoiceResult<String> {
    let canonical = serde_json::to_vec(spec)
        .map_err(|error| VoiceError::json("serialize HTTP provider request", error))?;
    Ok(format!("{:x}", Sha256::digest(canonical)))
}

/// Flags every HTTP take whose provider is gone or whose request shape
/// changed since it was synthesized. Only ever sets `stale`, so a take that
/// is stale for another reason (edited text) stays stale.
pub(super) fn mark_mismatched_http_assets_stale(catalog: &mut VoiceCatalog) {
    let current: HashMap<&str, &str> = catalog
        .http_providers
        .iter()
        .map(|provider| (provider.id.as_str(), provider.config_fingerprint.as_str()))
        .collect();
    for asset in &mut catalog.assets {
        if let VoiceAssetSource::Http {
            provider_id,
            config_fingerprint,
        } = &asset.source
            && current.get(provider_id.as_str()) != Some(&config_fingerprint.as_str())
        {
            asset.stale = true;
        }
    }
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::voice::models::VoiceAssetMeta;

    pub(in crate::voice) fn input(url: &str) -> HttpProviderInput {
        HttpProviderInput {
            id: None,
            name: "Test".to_string(),
            request: HttpRequestSpec {
                method: HttpMethod::Post,
                url: url.to_string(),
                headers: vec![HttpHeaderTemplate {
                    name: "Authorization".to_string(),
                    value: "Bearer {secret}".to_string(),
                }],
                body: Some(HttpBodyTemplate {
                    encoding: HttpBodyEncoding::Json,
                    template: r#"{"input":"{text}","voice":"{voice}"}"#.to_string(),
                }),
                response: HttpResponseFormat::AudioBytes,
                languages: HttpLanguageParams::default(),
            },
            secret: "key-1".to_string(),
            max_concurrency: 2,
        }
    }

    fn http_asset(id: &str, provider_id: &str, fingerprint: &str) -> VoiceAssetMeta {
        VoiceAssetMeta {
            id: id.to_string(),
            phrase_id: format!("phrase_{id}"),
            source: VoiceAssetSource::Http {
                provider_id: provider_id.to_string(),
                config_fingerprint: fingerprint.to_string(),
            },
            ..VoiceAssetMeta::default()
        }
    }

    #[test]
    fn fingerprint_ignores_name_secret_and_concurrency_but_tracks_the_request() {
        let base = input("https://tts.example.com/v1").into_provider().unwrap();

        let mut cosmetic = input("https://tts.example.com/v1");
        cosmetic.name = "Renamed".to_string();
        cosmetic.secret = "key-2".to_string();
        cosmetic.max_concurrency = 6;
        let cosmetic = cosmetic.into_provider().unwrap();
        assert_eq!(cosmetic.config_fingerprint, base.config_fingerprint);

        let mut voice_changed = input("https://tts.example.com/v1");
        voice_changed.request.languages.zh_cn.voice = "other".to_string();
        let voice_changed = voice_changed.into_provider().unwrap();
        assert_ne!(voice_changed.config_fingerprint, base.config_fingerprint);
    }

    #[test]
    fn parsing_rejects_bad_shapes_and_clamps_concurrency() {
        let mut get_with_body = input("https://tts.example.com/v1");
        get_with_body.request.method = HttpMethod::Get;
        assert!(get_with_body.into_provider().is_err());

        let mut bad_pointer = input("https://tts.example.com/v1");
        bad_pointer.request.response = HttpResponseFormat::JsonBase64 {
            pointer: "audioContent".to_string(),
        };
        assert!(bad_pointer.into_provider().is_err());

        let mut bad_header = input("https://tts.example.com/v1");
        bad_header.request.headers[0].name = "Bad Header".to_string();
        assert!(bad_header.into_provider().is_err());

        let mut newline_secret = input("https://tts.example.com/v1");
        newline_secret.secret = "a\r\nX-Injected: 1".to_string();
        assert!(newline_secret.into_provider().is_err());

        assert!(input("http://tts.example.com/v1").into_provider().is_err());
        assert!(input("ftp://127.0.0.1/v1").into_provider().is_err());

        let mut zero = input("http://127.0.0.1:9880/tts");
        zero.max_concurrency = 0;
        assert_eq!(zero.into_provider().unwrap().max_concurrency, 1);
    }

    #[test]
    fn existing_ids_are_kept_and_validated() {
        let mut existing = input("https://tts.example.com/v1");
        existing.id = Some("http_1_1".to_string());
        assert_eq!(existing.into_provider().unwrap().id, "http_1_1");

        let mut unsafe_id = input("https://tts.example.com/v1");
        unsafe_id.id = Some("../escape".to_string());
        assert!(unsafe_id.into_provider().is_err());
    }

    #[test]
    fn mismatched_or_orphaned_http_takes_go_stale_and_never_come_back() {
        let provider = input("https://tts.example.com/v1").into_provider().unwrap();
        let mut catalog = VoiceCatalog {
            assets: vec![
                http_asset("current", &provider.id, &provider.config_fingerprint),
                http_asset("outdated", &provider.id, &"0".repeat(64)),
                http_asset("orphan", "http_gone_1", &provider.config_fingerprint),
                VoiceAssetMeta {
                    stale: true,
                    ..http_asset("edited", &provider.id, &provider.config_fingerprint)
                },
            ],
            http_providers: vec![provider],
            ..VoiceCatalog::default()
        };

        mark_mismatched_http_assets_stale(&mut catalog);

        let stale: Vec<_> = catalog
            .assets
            .iter()
            .map(|asset| (asset.id.as_str(), asset.stale))
            .collect();
        assert_eq!(
            stale,
            [
                ("current", false),
                ("outdated", true),
                ("orphan", true),
                ("edited", true),
            ]
        );
    }
}
