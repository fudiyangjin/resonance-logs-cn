//! Renders a provider's request templates into a ready-to-send request.
//!
//! Only `{text}`, `{lang}`, `{voice}` and `{secret}` are recognized; every
//! other brace (JSON bodies are full of them) passes through untouched.
//! Substitution is a single left-to-right pass, so a value that itself
//! contains a placeholder (a phrase reading "{secret}") is inserted
//! literally and never expanded.

use std::fmt::Write as _;

use reqwest::header::{CONTENT_TYPE, HeaderName, HeaderValue};
use reqwest::{Method, Request, Url};

use super::config::{HttpMethod, HttpRequestSpec};
use super::endpoint::check_endpoint;
use crate::voice::error::{VoiceError, VoiceResult};
use crate::voice::models::VoiceLanguage;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Escape {
    None,
    /// RFC 3986: everything but unreserved characters is `%XX`-encoded, which
    /// is valid both in URLs and in form bodies.
    Percent,
    /// JSON string contents (the template supplies the quotes).
    Json,
    Xml,
}

struct Placeholders<'a> {
    text: &'a str,
    lang: &'a str,
    voice: &'a str,
    secret: &'a str,
}

impl Placeholders<'_> {
    /// The placeholder `template` starts with, as (token length, value).
    fn leading(&self, template: &str) -> Option<(usize, &str)> {
        [
            ("{text}", self.text),
            ("{lang}", self.lang),
            ("{voice}", self.voice),
            ("{secret}", self.secret),
        ]
        .into_iter()
        .find(|(token, _)| template.starts_with(token))
        .map(|(token, value)| (token.len(), value))
    }
}

fn render(template: &str, values: &Placeholders<'_>, escape: Escape) -> String {
    let mut out = String::with_capacity(template.len() + values.text.len());
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        match values.leading(tail) {
            Some((token_len, value)) => {
                push_escaped(&mut out, value, escape);
                rest = &tail[token_len..];
            }
            None => {
                out.push('{');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn push_escaped(out: &mut String, value: &str, escape: Escape) {
    match escape {
        Escape::None => out.push_str(value),
        Escape::Percent => {
            for byte in value.bytes() {
                if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
                    out.push(char::from(byte));
                } else {
                    let _ = write!(out, "%{byte:02X}");
                }
            }
        }
        Escape::Json => {
            for ch in value.chars() {
                match ch {
                    '"' => out.push_str("\\\""),
                    '\\' => out.push_str("\\\\"),
                    '\n' => out.push_str("\\n"),
                    '\r' => out.push_str("\\r"),
                    '\t' => out.push_str("\\t"),
                    ch if ch < ' ' => {
                        let _ = write!(out, "\\u{:04x}", u32::from(ch));
                    }
                    ch => out.push(ch),
                }
            }
        }
        Escape::Xml => {
            for ch in value.chars() {
                match ch {
                    '&' => out.push_str("&amp;"),
                    '<' => out.push_str("&lt;"),
                    '>' => out.push_str("&gt;"),
                    '"' => out.push_str("&quot;"),
                    '\'' => out.push_str("&apos;"),
                    ch => out.push(ch),
                }
            }
        }
    }
}

/// Builds the request for one phrase. Used both to call the provider and,
/// with sample text, to validate a provider before it is saved.
///
/// # Errors
/// `Validation` when the rendered URL is malformed or not an allowed
/// endpoint, or a header name/value is invalid.
pub(super) fn build(
    spec: &HttpRequestSpec,
    secret: &str,
    text: &str,
    language: VoiceLanguage,
) -> VoiceResult<Request> {
    let param = spec.languages.for_language(language);
    let values = Placeholders {
        text,
        lang: &param.lang,
        voice: &param.voice,
        secret,
    };
    let url = Url::parse(render(&spec.url, &values, Escape::Percent).trim())
        .map_err(|error| VoiceError::validation("request.url", error.to_string()))?;
    check_endpoint(&url)?;
    let method = match spec.method {
        HttpMethod::Get => Method::GET,
        HttpMethod::Post => Method::POST,
    };
    let mut request = Request::new(method, url);
    let headers = request.headers_mut();
    for header in &spec.headers {
        let name = HeaderName::from_bytes(header.name.trim().as_bytes()).map_err(|_| {
            VoiceError::validation(
                "request.headers",
                format!("invalid header name {:?}", header.name),
            )
        })?;
        let value =
            HeaderValue::from_str(&render(&header.value, &values, Escape::None)).map_err(|_| {
                VoiceError::validation(
                    "request.headers",
                    format!("invalid value for header {}", header.name),
                )
            })?;
        headers.append(name, value);
    }
    if let Some(body) = &spec.body {
        if !headers.contains_key(CONTENT_TYPE) {
            headers.insert(
                CONTENT_TYPE,
                HeaderValue::from_static(body.encoding.default_content_type()),
            );
        }
        *request.body_mut() = Some(render(&body.template, &values, body.encoding.escape()).into());
    }
    Ok(request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::http_tts::config::{
        HttpBodyEncoding, HttpBodyTemplate, HttpHeaderTemplate, HttpLanguageParam,
        HttpLanguageParams, HttpResponseFormat,
    };

    const VALUES: Placeholders<'static> = Placeholders {
        text: "a \"b\" & <c>\n{secret}",
        lang: "zh-CN",
        voice: "v1",
        secret: "s3cr3t",
    };

    #[test]
    fn escapes_each_placeholder_for_its_position() {
        assert_eq!(
            render(r#"{"t":"{text}"}"#, &VALUES, Escape::Json),
            r#"{"t":"a \"b\" & <c>\n{secret}"}"#
        );
        assert_eq!(
            render("<speak>{text}</speak>", &VALUES, Escape::Xml),
            "<speak>a &quot;b&quot; &amp; &lt;c&gt;\n{secret}</speak>"
        );
        assert_eq!(
            render("q={text}", &VALUES, Escape::Percent),
            "q=a%20%22b%22%20%26%20%3Cc%3E%0A%7Bsecret%7D"
        );
        assert_eq!(render("{lang}/{voice}", &VALUES, Escape::None), "zh-CN/v1");
    }

    #[test]
    fn substitutes_in_one_pass_and_leaves_other_braces_alone() {
        // `{secret}` inside the substituted text stays literal.
        assert!(!render("{text}", &VALUES, Escape::None).contains("s3cr3t"));
        assert_eq!(
            render("{x} {{text}} {secret", &VALUES, Escape::None),
            "{x} {a \"b\" & <c>\n{secret}} {secret"
        );
        assert_eq!(render("中文{voice}尾", &VALUES, Escape::None), "中文v1尾");
    }

    fn spec(url: &str) -> HttpRequestSpec {
        HttpRequestSpec {
            method: HttpMethod::Post,
            url: url.to_string(),
            headers: vec![HttpHeaderTemplate {
                name: "x-goog-api-key".to_string(),
                value: "{secret}".to_string(),
            }],
            body: Some(HttpBodyTemplate {
                encoding: HttpBodyEncoding::Json,
                template: r#"{"voice":{"languageCode":"{lang}","name":"{voice}"}}"#.to_string(),
            }),
            response: HttpResponseFormat::JsonBase64 {
                pointer: "/audioContent".to_string(),
            },
            languages: HttpLanguageParams {
                ja_jp: HttpLanguageParam {
                    lang: "ja-JP".to_string(),
                    voice: "ja-JP-Wavenet-A".to_string(),
                },
                ..HttpLanguageParams::default()
            },
        }
    }

    #[test]
    fn builds_a_request_with_language_values_and_a_default_content_type() {
        let request = build(
            &spec("https://tts.example.com/v1?text={text}"),
            "k",
            "こんにちは 1&2",
            VoiceLanguage::JaJp,
        )
        .unwrap();
        assert_eq!(request.method(), Method::POST);
        assert_eq!(
            request.url().query(),
            Some("text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%201%262")
        );
        assert_eq!(request.headers()["x-goog-api-key"], "k");
        assert_eq!(request.headers()[CONTENT_TYPE], "application/json");
        let body = request.body().and_then(|body| body.as_bytes()).unwrap();
        assert_eq!(
            std::str::from_utf8(body).unwrap(),
            r#"{"voice":{"languageCode":"ja-JP","name":"ja-JP-Wavenet-A"}}"#
        );
    }

    #[test]
    fn an_explicit_content_type_header_wins() {
        let mut spec = spec("https://tts.example.com/v1");
        spec.headers.push(HttpHeaderTemplate {
            name: "Content-Type".to_string(),
            value: "application/vnd.tts+json".to_string(),
        });
        let request = build(&spec, "k", "hi", VoiceLanguage::ZhCn).unwrap();
        assert_eq!(request.headers()[CONTENT_TYPE], "application/vnd.tts+json");
    }

    #[test]
    fn text_cannot_redirect_the_request_to_another_host() {
        let request = build(
            &spec("https://tts.example.com/{text}"),
            "k",
            "@evil.example/x?y#z",
            VoiceLanguage::ZhCn,
        )
        .unwrap();
        assert_eq!(request.url().host_str(), Some("tts.example.com"));
    }
}
