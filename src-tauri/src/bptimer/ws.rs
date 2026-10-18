//! WebSocket sessions to the bptimer server: TLS, the authenticated
//! handshake, frame sending, liveness constants and reconnect backoff.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::Arc;
use std::time::Duration;

use futures_util::SinkExt;
use tokio::net::TcpStream;
use tokio::sync::watch;
use tokio::time::Instant;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::{self, Message};
use tokio_tungstenite::{Connector, MaybeTlsStream, WebSocketStream};

use super::user_agent;

pub type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// The server pings every 20 s; silence this long means the link is dead.
pub const INBOUND_TIMEOUT: Duration = Duration::from_secs(60);
pub const WATCHDOG_INTERVAL: Duration = Duration::from_secs(5);
/// A connection that lived this long resets the reconnect backoff.
pub const STABLE_AFTER: Duration = Duration::from_secs(30);
const CLOSE_GRACE: Duration = Duration::from_millis(500);
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_INBOUND_MESSAGE_BYTES: usize = 1 << 20;
const BACKOFF_BASE_MS: u64 = 1_000;
const BACKOFF_MAX_MS: u64 = 30_000;

#[derive(Debug, thiserror::Error)]
pub enum LinkError {
    #[error("tls setup failed: {0}")]
    Tls(String),
    #[error("registration failed: {0}")]
    Register(String),
    #[error("handshake rejected with HTTP {0}")]
    Rejected(u16),
    #[error("connection failed: {0}")]
    Connect(String),
    #[error("connection lost: {0}")]
    Transport(String),
    #[error("server closed the connection ({0})")]
    Closed(u16),
    #[error("server refused the session: {0}")]
    Refused(String),
    #[error("no data from the server for {}s", INBOUND_TIMEOUT.as_secs())]
    Silent,
}

/// HTTP client for the server's REST endpoints.
///
/// # Errors
/// Returns [`LinkError::Tls`] when the TLS backend cannot be set up.
pub fn http_client() -> Result<reqwest::Client, LinkError> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(HTTP_TIMEOUT)
        .user_agent(user_agent())
        .build()
        .map_err(|error| LinkError::Tls(error.to_string()))
}

/// TLS settings for `wss://` endpoints, verified against the platform store.
///
/// # Errors
/// Returns [`LinkError::Tls`] when the platform verifier is unavailable.
pub fn tls_config() -> Result<Arc<rustls::ClientConfig>, LinkError> {
    use rustls_platform_verifier::BuilderVerifierExt;
    // Both aws-lc-rs and ring are compiled in, so the provider must be explicit;
    // aws-lc-rs matches what reqwest uses.
    let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| LinkError::Tls(error.to_string()))?
        .with_platform_verifier()
        .map_err(|error| LinkError::Tls(error.to_string()))?
        .with_no_client_auth();
    Ok(Arc::new(config))
}

/// Opens an authenticated WebSocket speaking `subprotocol`.
///
/// # Errors
/// [`LinkError::Rejected`] carries the HTTP status of a refused handshake
/// (`401` means the token is unknown); other failures map to
/// [`LinkError::Connect`].
pub async fn connect(
    endpoint: &str,
    token: &str,
    subprotocol: &'static str,
    tls: &Arc<rustls::ClientConfig>,
) -> Result<Ws, LinkError> {
    let invalid = |error: String| LinkError::Connect(error);
    let mut request = endpoint
        .into_client_request()
        .map_err(|error| invalid(error.to_string()))?;
    let headers = request.headers_mut();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {token}")).map_err(|e| invalid(e.to_string()))?,
    );
    headers.insert(
        "sec-websocket-protocol",
        HeaderValue::from_static(subprotocol),
    );
    headers.insert(
        "user-agent",
        HeaderValue::from_str(&user_agent()).map_err(|e| invalid(e.to_string()))?,
    );
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_INBOUND_MESSAGE_BYTES))
        .max_frame_size(Some(MAX_INBOUND_MESSAGE_BYTES));
    let connector = if endpoint.starts_with("wss://") {
        Connector::Rustls(Arc::clone(tls))
    } else {
        Connector::Plain
    };
    // `disable_nagle`: small frames must not wait for delayed-ACK coalescing.
    let handshake = tokio_tungstenite::connect_async_tls_with_config(
        request,
        Some(config),
        true,
        Some(connector),
    );
    match tokio::time::timeout(CONNECT_TIMEOUT, handshake).await {
        Ok(Ok((ws, _))) => Ok(ws),
        Ok(Err(tungstenite::Error::Http(response))) => {
            Err(LinkError::Rejected(response.status().as_u16()))
        }
        Ok(Err(error)) => Err(LinkError::Connect(error.to_string())),
        Err(_) => Err(LinkError::Connect("timed out".into())),
    }
}

/// Sends text frames and flushes once.
///
/// # Errors
/// Returns [`LinkError::Transport`] when the socket fails.
pub async fn send_texts(
    ws: &mut Ws,
    texts: impl IntoIterator<Item = String>,
) -> Result<(), LinkError> {
    for text in texts {
        ws.feed(Message::text(text))
            .await
            .map_err(|error| LinkError::Transport(error.to_string()))?;
    }
    ws.flush()
        .await
        .map_err(|error| LinkError::Transport(error.to_string()))
}

/// Closes the socket, giving the server a moment to acknowledge.
pub async fn goodbye(ws: &mut Ws) {
    let _ = tokio::time::timeout(CLOSE_GRACE, ws.close(None)).await;
}

/// Sleeps until `deadline`, or forever when there is none.
pub async fn sleep_until(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

/// Resolves once the switch is off; never resolves when its sender is gone.
pub async fn wait_disabled(enabled: &mut watch::Receiver<bool>) {
    loop {
        if !*enabled.borrow_and_update() {
            return;
        }
        if enabled.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

#[derive(Debug, Default)]
pub struct Backoff {
    attempt: u32,
}

impl Backoff {
    pub fn reset(&mut self) {
        self.attempt = 0;
    }

    /// Exponential from 1 s to 30 s with ±20 % jitter.
    pub fn next_delay(&mut self) -> Duration {
        let base = BACKOFF_BASE_MS
            .saturating_mul(1_u64 << self.attempt.min(16))
            .min(BACKOFF_MAX_MS);
        self.attempt = self.attempt.saturating_add(1);
        let jitter = RandomState::new().build_hasher().finish() % 401;
        Duration::from_millis(base * (800 + jitter) / 1_000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_to_the_cap_with_jitter() {
        let mut backoff = Backoff::default();
        let first = backoff.next_delay().as_millis();
        assert!((800..=1_200).contains(&first), "{first}");
        for _ in 0..10 {
            backoff.next_delay();
        }
        let capped = backoff.next_delay().as_millis();
        assert!((24_000..=36_000).contains(&capped), "{capped}");
        backoff.reset();
        assert!(backoff.next_delay().as_millis() <= 1_200);
    }
}
