//! Which endpoints a provider may call, and the HTTP client that enforces
//! it on every redirect hop.

use std::net::IpAddr;
use std::time::Duration;

use reqwest::Url;
use reqwest::redirect::Policy;

use crate::voice::error::{VoiceError, VoiceResult};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Local CPU TTS can take a while for one line; a dead server still fails
/// fast through the connect timeout.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_REDIRECTS: usize = 3;

/// HTTPS may go anywhere. Plain HTTP is limited to this machine and the
/// private IPv4 ranges (a TTS box on the LAN), so a key or text is never sent
/// unencrypted over the internet.
///
/// # Errors
/// `Validation` for any other scheme or a public plain-HTTP host.
pub(super) fn check_endpoint(url: &Url) -> VoiceResult<()> {
    match url.scheme() {
        "https" => Ok(()),
        "http" if is_local_host(url) => Ok(()),
        "http" => Err(VoiceError::validation(
            "request.url",
            "plain http is only allowed for localhost or a LAN IP address; use https",
        )),
        scheme => Err(VoiceError::validation(
            "request.url",
            format!("unsupported scheme {scheme}"),
        )),
    }
}

fn is_local_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private(),
        Ok(IpAddr::V6(ip)) => ip.is_loopback(),
        Err(_) => host.eq_ignore_ascii_case("localhost"),
    }
}

/// The client used for every provider call. Separate from the model
/// downloader's HTTPS-only client because local providers speak plain HTTP.
///
/// # Errors
/// `Http` if the TLS backend fails to initialize.
pub(in crate::voice) fn build_client() -> VoiceResult<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                attempt.error("too many redirects")
            } else if check_endpoint(attempt.url()).is_ok() {
                attempt.follow()
            } else {
                attempt.error("redirected to a disallowed endpoint")
            }
        }))
        .build()
        .map_err(|source| VoiceError::Http {
            context: "build HTTP TTS client".to_string(),
            source,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(url: &str) -> bool {
        check_endpoint(&Url::parse(url).unwrap()).is_ok()
    }

    #[test]
    fn https_anywhere_http_only_locally() {
        assert!(allowed(
            "https://texttospeech.googleapis.com/v1/text:synthesize"
        ));
        assert!(allowed("http://127.0.0.1:9880/tts"));
        assert!(allowed("http://localhost:8880/v1/audio/speech"));
        assert!(allowed("http://[::1]:5000/"));
        assert!(allowed("http://192.168.1.20:9880/"));
        assert!(allowed("http://10.0.0.5/"));
        assert!(!allowed("http://tts.example.com/"));
        assert!(!allowed("http://8.8.8.8/"));
        assert!(!allowed("http://localhost.example.com/"));
        assert!(!allowed("file:///C:/tts.wav"));
    }
}
