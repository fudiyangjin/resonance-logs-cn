//! Relay client: one task that holds a WebSocket to the team relay while
//! sharing is enabled and the character is in a team.
//!
//! Nothing is batched on a timer. The live runtime publishes its latest
//! share state through a `watch`; the loop sends the difference as soon as it
//! is woken, so changes that arrive while a send is in flight fold into the
//! next frame on their own.

use std::collections::hash_map::RandomState;
use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasher, Hasher};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use log::{debug, info, warn};
use tauri::AppHandle;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, watch};
use tokio::time::Instant;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::{self, Message};
use tokio_tungstenite::{Connector, MaybeTlsStream, WebSocketStream};
use tokio_util::sync::CancellationToken;

use super::protocol::{CdTuple, ClientFrame, MAX_ENTRIES_PER_FRAME, SUBPROTOCOL, ServerFrame};
use super::settings::SettingsStore;
use super::status::{StatusReporter, TeamShareStatus};
use crate::live::team_link::{CharId, ShareIdentity, ShareSnapshot, TeamLinkEvent};

const DEFAULT_ENDPOINT: &str = "wss://bptimer.cn/v1/team/ws";
/// Overrides the relay endpoint (local development, self-hosted relays).
const ENDPOINT_ENV: &str = "RESONANCE_TEAM_SHARE_URL";
const APP_NAME: &str = "resonance-logs-cn";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// The relay pings every 20 s; silence this long means the link is dead.
const INBOUND_TIMEOUT: Duration = Duration::from_secs(60);
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(5);
/// Keep the socket briefly after leaving a team: teams are often re-formed.
const LINGER_AFTER_TEAM: Duration = Duration::from_secs(60);
/// A connection that lived this long resets the reconnect backoff.
const STABLE_AFTER: Duration = Duration::from_secs(30);
const CLOSE_GRACE: Duration = Duration::from_millis(500);
const MAX_INBOUND_MESSAGE_BYTES: usize = 1 << 20;
const BACKOFF_BASE_MS: u64 = 1_000;
const BACKOFF_MAX_MS: u64 = 30_000;

type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct ClientContext {
    pub app: AppHandle,
    pub settings: Arc<SettingsStore>,
    pub enabled: watch::Receiver<bool>,
    pub share: watch::Receiver<ShareSnapshot>,
    pub events: mpsc::Sender<TeamLinkEvent>,
    pub status: StatusReporter,
    pub cancel: CancellationToken,
}

#[derive(Debug, thiserror::Error)]
enum ShareError {
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
    #[error("relay closed the connection ({0})")]
    Closed(u16),
    #[error("relay refused the character: {0}")]
    Refused(String),
    #[error("no data from the relay for {}s", INBOUND_TIMEOUT.as_secs())]
    Silent,
}

enum SessionEnd {
    Cancelled,
    /// Sharing was switched off or the character left the team.
    Idle,
    Failed(ShareError),
}

pub async fn run(mut ctx: ClientContext) {
    let tls = match tls_config() {
        Ok(config) => Arc::new(config),
        Err(error) => {
            warn!(target: "app::team_share", "{error}");
            ctx.status.set(TeamShareStatus::Retrying {
                error: error.to_string(),
                retry_ms: 0,
            });
            return;
        }
    };
    let http = match reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(Duration::from_secs(15))
        .user_agent(user_agent())
        .build()
    {
        Ok(http) => http,
        Err(error) => {
            warn!(target: "app::team_share", "http client setup failed: {error}");
            return;
        }
    };
    let endpoint = endpoint();
    let mut backoff = Backoff::default();

    loop {
        if !wait_until_shareable(&mut ctx).await {
            return;
        }
        ctx.status.set(TeamShareStatus::Connecting);
        let started = Instant::now();
        let end = session(&mut ctx, &endpoint, &http, &tls).await;
        if ctx.events.send(TeamLinkEvent::LinkDown).await.is_err() {
            return;
        }
        match end {
            SessionEnd::Cancelled => return,
            SessionEnd::Idle => backoff.reset(),
            SessionEnd::Failed(error) => {
                if started.elapsed() >= STABLE_AFTER {
                    backoff.reset();
                }
                if matches!(error, ShareError::Rejected(401)) {
                    // The relay no longer knows the token; register again.
                    let _ = ctx
                        .settings
                        .update(&ctx.app, |settings| settings.token = None);
                }
                let delay = backoff.next_delay();
                warn!(target: "app::team_share", "{error}; retrying in {} ms", delay.as_millis());
                ctx.status.set(TeamShareStatus::Retrying {
                    error: error.to_string(),
                    retry_ms: u32::try_from(delay.as_millis()).unwrap_or(u32::MAX),
                });
                tokio::select! {
                    () = ctx.cancel.cancelled() => return,
                    () = tokio::time::sleep(delay) => {}
                    () = wait_disabled(&mut ctx.enabled) => {}
                }
            }
        }
    }
}

/// Waits until sharing is enabled and the character has a room identity.
/// Returns `false` on cancellation.
async fn wait_until_shareable(ctx: &mut ClientContext) -> bool {
    loop {
        let enabled = *ctx.enabled.borrow_and_update();
        let shareable = ctx.share.borrow_and_update().identity.is_some();
        if enabled && shareable {
            return true;
        }
        ctx.status.set(if enabled {
            TeamShareStatus::Idle
        } else {
            TeamShareStatus::Disabled
        });
        tokio::select! {
            () = ctx.cancel.cancelled() => return false,
            changed = ctx.enabled.changed() => if changed.is_err() { return false },
            changed = ctx.share.changed() => if changed.is_err() { return false },
        }
    }
}

async fn wait_disabled(enabled: &mut watch::Receiver<bool>) {
    loop {
        if !*enabled.borrow_and_update() {
            return;
        }
        if enabled.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

async fn session(
    ctx: &mut ClientContext,
    endpoint: &str,
    http: &reqwest::Client,
    tls: &Arc<rustls::ClientConfig>,
) -> SessionEnd {
    let token = match ensure_token(ctx, http, endpoint).await {
        Ok(token) => token,
        Err(error) => return SessionEnd::Failed(error),
    };
    let mut ws = tokio::select! {
        () = ctx.cancel.cancelled() => return SessionEnd::Cancelled,
        connected = tokio::time::timeout(CONNECT_TIMEOUT, connect(endpoint, &token, tls)) => match connected {
            Ok(Ok(ws)) => ws,
            Ok(Err(error)) => return SessionEnd::Failed(error),
            Err(_) => return SessionEnd::Failed(ShareError::Connect("timed out".into())),
        },
    };
    info!(target: "app::team_share", "connected to team relay");
    ctx.status.set(TeamShareStatus::Connected { teammates: 0 });

    let mut sent = SentState::default();
    let mut peers: HashSet<CharId> = HashSet::new();
    let initial = ctx.share.borrow_and_update().clone();
    let mut linger_until = initial
        .identity
        .is_none()
        .then(|| Instant::now() + LINGER_AFTER_TEAM);
    if let Err(error) = send_frames(&mut ws, sent.plan(&initial)).await {
        return SessionEnd::Failed(error);
    }
    let mut last_inbound = Instant::now();
    let mut watchdog = tokio::time::interval(WATCHDOG_INTERVAL);

    loop {
        let linger = linger_until;
        tokio::select! {
            biased;
            () = ctx.cancel.cancelled() => {
                goodbye(&mut ws).await;
                return SessionEnd::Cancelled;
            }
            changed = ctx.enabled.changed() => {
                if changed.is_err() || !*ctx.enabled.borrow_and_update() {
                    goodbye(&mut ws).await;
                    return SessionEnd::Idle;
                }
            }
            changed = ctx.share.changed() => {
                if changed.is_err() {
                    goodbye(&mut ws).await;
                    return SessionEnd::Cancelled;
                }
                let snapshot = ctx.share.borrow_and_update().clone();
                linger_until = match (&snapshot.identity, linger_until) {
                    (Some(_), _) => None,
                    (None, Some(deadline)) => Some(deadline),
                    (None, None) => Some(Instant::now() + LINGER_AFTER_TEAM),
                };
                if snapshot.identity.is_none() && !peers.is_empty() {
                    peers.clear();
                    ctx.status.set(TeamShareStatus::Connected { teammates: 0 });
                }
                if let Err(error) = send_frames(&mut ws, sent.plan(&snapshot)).await {
                    return SessionEnd::Failed(error);
                }
            }
            incoming = ws.next() => {
                last_inbound = Instant::now();
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(end) = handle_text(ctx, text.as_str(), &mut peers).await {
                            goodbye(&mut ws).await;
                            return end;
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let code = frame.map_or(1005, |frame| u16::from(frame.code));
                        return SessionEnd::Failed(ShareError::Closed(code));
                    }
                    Some(Ok(_)) => {}
                    Some(Err(error)) => return SessionEnd::Failed(ShareError::Transport(error.to_string())),
                    None => return SessionEnd::Failed(ShareError::Transport("stream ended".into())),
                }
            }
            () = sleep_until(linger), if linger.is_some() => {
                goodbye(&mut ws).await;
                return SessionEnd::Idle;
            }
            _ = watchdog.tick() => {
                if last_inbound.elapsed() >= INBOUND_TIMEOUT {
                    return SessionEnd::Failed(ShareError::Silent);
                }
            }
        }
    }
}

async fn sleep_until(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

async fn handle_text(
    ctx: &ClientContext,
    text: &str,
    peers: &mut HashSet<CharId>,
) -> Result<(), SessionEnd> {
    let frame: ServerFrame = match serde_json::from_str(text) {
        Ok(frame) => frame,
        Err(error) => {
            debug!(target: "app::team_share", "ignoring unknown relay frame: {error}");
            return Ok(());
        }
    };
    let before = peers.len();
    match &frame {
        ServerFrame::Error { code } => {
            return match code.as_str() {
                "conflict" | "room_full" | "invalid" => {
                    Err(SessionEnd::Failed(ShareError::Refused(code.clone())))
                }
                _ => {
                    warn!(target: "app::team_share", "relay error: {code}");
                    Ok(())
                }
            };
        }
        ServerFrame::Snapshot { members } => {
            peers.clear();
            peers.extend(members.iter().map(|member| CharId(member.char_id.0)));
        }
        ServerFrame::Member { char_id, .. } | ServerFrame::Cd { char_id, .. } => {
            peers.insert(CharId(char_id.0));
        }
        ServerFrame::Left { char_id } => {
            peers.remove(&CharId(char_id.0));
        }
        ServerFrame::Clear { .. } => {}
    }
    if peers.len() != before || matches!(frame, ServerFrame::Snapshot { .. }) {
        ctx.status.set(TeamShareStatus::Connected {
            teammates: u32::try_from(peers.len()).unwrap_or(u32::MAX),
        });
    }
    if let Some(event) = frame.into_event()
        && ctx.events.send(event).await.is_err()
    {
        return Err(SessionEnd::Cancelled);
    }
    Ok(())
}

async fn send_frames(ws: &mut Ws, frames: Vec<ClientFrame>) -> Result<(), ShareError> {
    for frame in frames {
        ws.feed(Message::text(frame.encode()))
            .await
            .map_err(|error| ShareError::Transport(error.to_string()))?;
    }
    ws.flush()
        .await
        .map_err(|error| ShareError::Transport(error.to_string()))
}

async fn goodbye(ws: &mut Ws) {
    let _ = tokio::time::timeout(CLOSE_GRACE, ws.close(None)).await;
}

/// What the relay has already been told during the current connection.
#[derive(Debug, Default)]
struct SentState {
    joined: Option<ShareIdentity>,
    epoch: Option<u64>,
    versions: HashMap<i32, u64>,
}

impl SentState {
    /// Frames that bring the relay up to `snapshot`. A (re-)join is followed
    /// by `clear` and the whole table, so the relay never keeps entries the
    /// table dropped while the link was down.
    fn plan(&mut self, snapshot: &ShareSnapshot) -> Vec<ClientFrame> {
        let mut frames = Vec::new();
        let Some(identity) = &snapshot.identity else {
            if self.joined.take().is_some() {
                frames.push(ClientFrame::Leave);
            }
            self.epoch = None;
            self.versions.clear();
            return frames;
        };
        if self.joined.as_ref() != Some(identity) {
            frames.push(ClientFrame::join(identity));
            self.joined = Some(identity.clone());
            self.epoch = None;
        }
        if self.epoch != Some(snapshot.cds.epoch) {
            frames.push(ClientFrame::Clear);
            self.epoch = Some(snapshot.cds.epoch);
            self.versions.clear();
        }
        let changed: Vec<(i32, u64, CdTuple)> = snapshot
            .cds
            .entries
            .iter()
            .filter(|(skill_level_id, (_, version))| {
                self.versions.get(*skill_level_id) != Some(version)
            })
            .map(|(skill_level_id, (sample, version))| {
                (*skill_level_id, *version, CdTuple::from(sample))
            })
            .collect();
        for (skill_level_id, version, _) in &changed {
            self.versions.insert(*skill_level_id, *version);
        }
        let tuples: Vec<CdTuple> = changed.into_iter().map(|(_, _, tuple)| tuple).collect();
        frames.extend(
            tuples
                .chunks(MAX_ENTRIES_PER_FRAME)
                .map(|chunk| ClientFrame::Cd { e: chunk.to_vec() }),
        );
        frames
    }
}

#[derive(Debug, Default)]
struct Backoff {
    attempt: u32,
}

impl Backoff {
    fn reset(&mut self) {
        self.attempt = 0;
    }

    /// Exponential from 1 s to 30 s with ±20 % jitter.
    fn next_delay(&mut self) -> Duration {
        let base = BACKOFF_BASE_MS
            .saturating_mul(1_u64 << self.attempt.min(16))
            .min(BACKOFF_MAX_MS);
        self.attempt = self.attempt.saturating_add(1);
        let jitter = RandomState::new().build_hasher().finish() % 401;
        Duration::from_millis(base * (800 + jitter) / 1_000)
    }
}

fn tls_config() -> Result<rustls::ClientConfig, ShareError> {
    use rustls_platform_verifier::BuilderVerifierExt;
    // Both aws-lc-rs and ring are compiled in, so the provider must be explicit;
    // aws-lc-rs matches what reqwest uses.
    let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    Ok(rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| ShareError::Tls(error.to_string()))?
        .with_platform_verifier()
        .map_err(|error| ShareError::Tls(error.to_string()))?
        .with_no_client_auth())
}

async fn connect(
    endpoint: &str,
    token: &str,
    tls: &Arc<rustls::ClientConfig>,
) -> Result<Ws, ShareError> {
    let invalid = |error: String| ShareError::Connect(error);
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
        HeaderValue::from_static(SUBPROTOCOL),
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
    match tokio_tungstenite::connect_async_tls_with_config(
        request,
        Some(config),
        true,
        Some(connector),
    )
    .await
    {
        Ok((ws, _)) => Ok(ws),
        Err(tungstenite::Error::Http(response)) => {
            Err(ShareError::Rejected(response.status().as_u16()))
        }
        Err(error) => Err(ShareError::Connect(error.to_string())),
    }
}

async fn ensure_token(
    ctx: &ClientContext,
    http: &reqwest::Client,
    endpoint: &str,
) -> Result<String, ShareError> {
    if let Some(token) = ctx
        .settings
        .get(&ctx.app)
        .token
        .filter(|token| !token.is_empty())
    {
        return Ok(token);
    }
    #[derive(serde::Deserialize)]
    struct Registered {
        token: String,
    }
    let url = registration_url(endpoint)
        .ok_or_else(|| ShareError::Register(format!("invalid endpoint {endpoint}")))?;
    let response = http
        .post(url)
        .json(&serde_json::json!({ "app": APP_NAME }))
        .send()
        .await
        .map_err(|error| ShareError::Register(error.to_string()))?;
    if !response.status().is_success() {
        return Err(ShareError::Register(format!(
            "HTTP {}",
            response.status().as_u16()
        )));
    }
    let registered: Registered = response
        .json()
        .await
        .map_err(|error| ShareError::Register(error.to_string()))?;
    if let Err(error) = ctx.settings.update(&ctx.app, |settings| {
        settings.token = Some(registered.token.clone())
    }) {
        warn!(target: "app::team_share", "could not persist relay token: {error}");
    }
    Ok(registered.token)
}

fn endpoint() -> String {
    std::env::var(ENDPOINT_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string())
}

/// `wss://host[:port]/...` → `https://host[:port]/v1/clients`.
fn registration_url(endpoint: &str) -> Option<String> {
    let (scheme, rest) = endpoint.split_once("://")?;
    let http_scheme = match scheme {
        "wss" => "https",
        "ws" => "http",
        _ => return None,
    };
    let authority = rest
        .split('/')
        .next()
        .filter(|authority| !authority.is_empty())?;
    Some(format!("{http_scheme}://{authority}/v1/clients"))
}

fn user_agent() -> String {
    format!("{APP_NAME}/{}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::team_link::{CdSample, CdTable, Distribution, TeamId};
    use std::collections::BTreeMap;

    fn identity(roster: &[i64]) -> ShareIdentity {
        ShareIdentity {
            distribution: Distribution::Star,
            team_id: TeamId(7),
            char_id: CharId(1),
            roster: roster.iter().copied().map(CharId).collect(),
            name: "me".into(),
            class_id: 4,
        }
    }

    fn sample(skill_level_id: i32) -> CdSample {
        CdSample {
            skill_level_id,
            duration: 30_000,
            cd_type: 0,
            valid_cd_time: 0,
            calculated_duration: 30_000,
            accelerate_rate: 0.0,
            anchor_server_ms: 1,
        }
    }

    fn snapshot(roster: &[i64], epoch: u64, entries: &[(i32, u64)]) -> ShareSnapshot {
        ShareSnapshot {
            identity: Some(identity(roster)),
            cds: Arc::new(CdTable {
                epoch,
                entries: entries
                    .iter()
                    .map(|(id, version)| (*id, (sample(*id), *version)))
                    .collect::<BTreeMap<_, _>>(),
            }),
        }
    }

    fn kinds(frames: &[ClientFrame]) -> Vec<&'static str> {
        frames
            .iter()
            .map(|frame| match frame {
                ClientFrame::Join { .. } => "join",
                ClientFrame::Cd { .. } => "cd",
                ClientFrame::Clear => "clear",
                ClientFrame::Leave => "leave",
            })
            .collect()
    }

    #[test]
    fn plan_joins_then_sends_only_new_versions() {
        let mut sent = SentState::default();
        let first = sent.plan(&snapshot(&[1, 2], 0, &[(142_001, 1), (150_101, 2)]));
        assert_eq!(kinds(&first), vec!["join", "clear", "cd"]);
        let ClientFrame::Cd { e } = &first[2] else {
            unreachable!()
        };
        assert_eq!(e.len(), 2);

        let same = sent.plan(&snapshot(&[1, 2], 0, &[(142_001, 1), (150_101, 2)]));
        assert!(same.is_empty());

        let update = sent.plan(&snapshot(&[1, 2], 0, &[(142_001, 3), (150_101, 2)]));
        assert_eq!(kinds(&update), vec!["cd"]);
        let ClientFrame::Cd { e } = &update[0] else {
            unreachable!()
        };
        assert_eq!(e[0].0, 142_001);
    }

    #[test]
    fn plan_rejoins_on_roster_change_and_clears_on_epoch() {
        let mut sent = SentState::default();
        sent.plan(&snapshot(&[1, 2], 0, &[(142_001, 1)]));
        let rejoin = sent.plan(&snapshot(&[1, 2, 3], 0, &[(142_001, 1)]));
        assert_eq!(kinds(&rejoin), vec!["join", "clear", "cd"]);
        let reset = sent.plan(&snapshot(&[1, 2, 3], 1, &[]));
        assert_eq!(kinds(&reset), vec!["clear"]);
        let left = sent.plan(&ShareSnapshot::default());
        assert_eq!(kinds(&left), vec!["leave"]);
        assert!(sent.plan(&ShareSnapshot::default()).is_empty());
    }

    #[test]
    fn plan_splits_large_tables() {
        let mut sent = SentState::default();
        let entries: Vec<(i32, u64)> = (1..=300).map(|i| (i * 100 + 1, i as u64)).collect();
        let frames = sent.plan(&snapshot(&[1], 0, &entries));
        assert_eq!(kinds(&frames), vec!["join", "clear", "cd", "cd", "cd"]);
    }

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

    #[test]
    fn registration_url_follows_the_ws_endpoint() {
        assert_eq!(
            registration_url("wss://bptimer.cn/v1/team/ws").as_deref(),
            Some("https://bptimer.cn/v1/clients")
        );
        assert_eq!(
            registration_url("ws://127.0.0.1:8090/v1/team/ws").as_deref(),
            Some("http://127.0.0.1:8090/v1/clients")
        );
        assert_eq!(registration_url("https://bptimer.cn"), None);
    }
}
