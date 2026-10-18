//! Report client: fetches the reportable mobs once, then holds a WebSocket to
//! the server while a tracked boss is in view and sends what changed.
//!
//! Like the team relay client, nothing is batched on a timer: the live runtime
//! publishes its latest table through a `watch` and the loop sends the
//! difference when woken, so steps that pass during a send fold together.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use log::{debug, info, warn};
use tauri::AppHandle;
use tokio::sync::{mpsc, watch};
use tokio::time::Instant;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use super::protocol::{
    ClientFrame, HpTuple, MAX_ENTRIES_PER_FRAME, MobsResponse, SUBPROTOCOL, ServerFrame,
};
use super::status::{HpReportStatus, StatusReporter};
use crate::bptimer::ws::{
    self, Backoff, INBOUND_TIMEOUT, LinkError, STABLE_AFTER, WATCHDOG_INTERVAL, Ws,
};
use crate::bptimer::{Credentials, Endpoints};
use crate::live::hp_link::{Distribution, HpContext, HpLinkEvent, HpShare, MonsterId, TrackedMobs};

/// Keep the socket briefly after the last boss leaves view: fights move
/// around and the same line is often re-entered.
const LINGER_AFTER_BOSSES: Duration = Duration::from_secs(60);

pub struct ClientContext {
    pub app: AppHandle,
    pub credentials: Arc<Credentials>,
    pub enabled: watch::Receiver<bool>,
    pub share: watch::Receiver<HpShare>,
    pub events: mpsc::Sender<HpLinkEvent>,
    pub status: StatusReporter,
    pub cancel: CancellationToken,
}

enum SessionEnd {
    Cancelled,
    /// Reporting was switched off or nothing was left to report.
    Idle,
    /// The server does not accept reports from this distribution.
    Unsupported(Distribution),
    Failed(LinkError),
}

pub async fn run(mut ctx: ClientContext) {
    let (tls, http) = match ws::tls_config().and_then(|tls| Ok((tls, ws::http_client()?))) {
        Ok(clients) => clients,
        Err(error) => {
            warn!(target: "app::hp_report", "{error}");
            ctx.status.set(HpReportStatus::Retrying {
                error: error.to_string(),
                retry_ms: 0,
            });
            return;
        }
    };
    let endpoints = Endpoints::from_env();
    let mut backoff = Backoff::default();
    if !load_tracked_mobs(&mut ctx, &http, &endpoints, &mut backoff).await {
        return;
    }
    backoff.reset();
    let mut unsupported = None;

    loop {
        if !wait_until_reportable(&mut ctx, unsupported).await {
            return;
        }
        ctx.status.set(HpReportStatus::Connecting);
        let started = Instant::now();
        match session(&mut ctx, &endpoints, &http, &tls).await {
            SessionEnd::Cancelled => return,
            SessionEnd::Idle => backoff.reset(),
            SessionEnd::Unsupported(distribution) => {
                info!(
                    target: "app::hp_report",
                    "server does not accept reports from {}",
                    distribution.as_str()
                );
                unsupported = Some(distribution);
            }
            SessionEnd::Failed(error) => {
                if started.elapsed() >= STABLE_AFTER {
                    backoff.reset();
                }
                if !retry_later(&mut ctx, &error, &mut backoff).await {
                    return;
                }
            }
        }
    }
}

/// Reports the failure and waits out the backoff (cut short when reporting
/// is switched off). Returns `false` on cancellation.
async fn retry_later(ctx: &mut ClientContext, error: &LinkError, backoff: &mut Backoff) -> bool {
    let delay = backoff.next_delay();
    warn!(target: "app::hp_report", "{error}; retrying in {} ms", delay.as_millis());
    ctx.status.set(HpReportStatus::Retrying {
        error: error.to_string(),
        retry_ms: u32::try_from(delay.as_millis()).unwrap_or(u32::MAX),
    });
    tokio::select! {
        () = ctx.cancel.cancelled() => false,
        () = tokio::time::sleep(delay) => true,
        () = ws::wait_disabled(&mut ctx.enabled) => true,
    }
}

/// Hands the server's reportable mobs to the live runtime, retrying while
/// reporting is enabled. Returns `false` on cancellation.
async fn load_tracked_mobs(
    ctx: &mut ClientContext,
    http: &reqwest::Client,
    endpoints: &Endpoints,
    backoff: &mut Backoff,
) -> bool {
    loop {
        if !wait_enabled(ctx).await {
            return false;
        }
        let fetched = tokio::select! {
            () = ctx.cancel.cancelled() => return false,
            fetched = fetch_tracked_mobs(http, endpoints) => fetched,
        };
        match fetched {
            Ok(tracked) => {
                info!(target: "app::hp_report", "tracking {} mobs", tracked.ids.len());
                let event = HpLinkEvent::Tracked(Arc::new(tracked));
                return ctx.events.send(event).await.is_ok();
            }
            Err(error) => {
                if !retry_later(ctx, &error, backoff).await {
                    return false;
                }
            }
        }
    }
}

async fn fetch_tracked_mobs(
    http: &reqwest::Client,
    endpoints: &Endpoints,
) -> Result<TrackedMobs, LinkError> {
    let response = http
        .get(endpoints.mobs())
        .send()
        .await
        .map_err(|error| LinkError::Connect(error.to_string()))?;
    if !response.status().is_success() {
        return Err(LinkError::Rejected(response.status().as_u16()));
    }
    let mobs: MobsResponse = response
        .json()
        .await
        .map_err(|error| LinkError::Transport(error.to_string()))?;
    Ok(TrackedMobs::from(mobs))
}

/// Returns `false` on cancellation.
async fn wait_enabled(ctx: &mut ClientContext) -> bool {
    loop {
        if *ctx.enabled.borrow_and_update() {
            return true;
        }
        ctx.status.set(HpReportStatus::Disabled);
        tokio::select! {
            () = ctx.cancel.cancelled() => return false,
            changed = ctx.enabled.changed() => if changed.is_err() { return false },
        }
    }
}

/// Waits until reporting is enabled and a tracked boss is in view on a known
/// open-world line. Returns `false` on cancellation.
async fn wait_until_reportable(ctx: &mut ClientContext, unsupported: Option<Distribution>) -> bool {
    loop {
        let enabled = *ctx.enabled.borrow_and_update();
        let share = ctx.share.borrow_and_update().clone();
        if enabled && is_reportable(&share, unsupported) {
            return true;
        }
        let blocked = share
            .context
            .is_some_and(|context| Some(context.distribution) == unsupported);
        ctx.status.set(match (enabled, blocked) {
            (false, _) => HpReportStatus::Disabled,
            (true, true) => HpReportStatus::Unsupported,
            (true, false) => HpReportStatus::Idle,
        });
        tokio::select! {
            () = ctx.cancel.cancelled() => return false,
            changed = ctx.enabled.changed() => if changed.is_err() { return false },
            changed = ctx.share.changed() => if changed.is_err() { return false },
        }
    }
}

fn is_reportable(share: &HpShare, unsupported: Option<Distribution>) -> bool {
    share
        .context
        .is_some_and(|context| Some(context.distribution) != unsupported)
        && !share.table.entries.is_empty()
}

fn connected(share: &HpShare) -> HpReportStatus {
    HpReportStatus::Connected {
        bosses: u32::try_from(share.table.entries.len()).unwrap_or(u32::MAX),
    }
}

async fn session(
    ctx: &mut ClientContext,
    endpoints: &Endpoints,
    http: &reqwest::Client,
    tls: &Arc<rustls::ClientConfig>,
) -> SessionEnd {
    let token = tokio::select! {
        () = ctx.cancel.cancelled() => return SessionEnd::Cancelled,
        token = ctx.credentials.token(&ctx.app, http, endpoints) => match token {
            Ok(token) => token,
            Err(error) => return SessionEnd::Failed(error),
        },
    };
    let endpoint = endpoints.hp_ws();
    let mut ws = tokio::select! {
        () = ctx.cancel.cancelled() => return SessionEnd::Cancelled,
        connected = ws::connect(&endpoint, &token, SUBPROTOCOL, tls) => match connected {
            Ok(ws) => ws,
            Err(error) => {
                if matches!(error, LinkError::Rejected(401)) {
                    // The server no longer knows the token; register again.
                    ctx.credentials.invalidate(&ctx.app, &token).await;
                }
                return SessionEnd::Failed(error);
            }
        },
    };
    info!(target: "app::hp_report", "connected to the HP report server");

    let mut sent = SentState::default();
    let initial = ctx.share.borrow_and_update().clone();
    ctx.status.set(connected(&initial));
    // The bosses may have left between the reportable check and this snapshot.
    let mut linger_until =
        (!is_reportable(&initial, None)).then(|| Instant::now() + LINGER_AFTER_BOSSES);
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
                ws::goodbye(&mut ws).await;
                return SessionEnd::Cancelled;
            }
            changed = ctx.enabled.changed() => {
                if changed.is_err() || !*ctx.enabled.borrow_and_update() {
                    ws::goodbye(&mut ws).await;
                    return SessionEnd::Idle;
                }
            }
            changed = ctx.share.changed() => {
                if changed.is_err() {
                    ws::goodbye(&mut ws).await;
                    return SessionEnd::Cancelled;
                }
                let share = ctx.share.borrow_and_update().clone();
                linger_until = if is_reportable(&share, None) {
                    None
                } else {
                    linger_until.or_else(|| Some(Instant::now() + LINGER_AFTER_BOSSES))
                };
                ctx.status.set(connected(&share));
                if let Err(error) = send_frames(&mut ws, sent.plan(&share)).await {
                    return SessionEnd::Failed(error);
                }
            }
            incoming = ws.next() => {
                last_inbound = Instant::now();
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Some(end) = handle_text(text.as_str(), &sent) {
                            ws::goodbye(&mut ws).await;
                            return end;
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let code = frame.map_or(1005, |frame| u16::from(frame.code));
                        return SessionEnd::Failed(LinkError::Closed(code));
                    }
                    Some(Ok(_)) => {}
                    Some(Err(error)) => return SessionEnd::Failed(LinkError::Transport(error.to_string())),
                    None => return SessionEnd::Failed(LinkError::Transport("stream ended".into())),
                }
            }
            () = ws::sleep_until(linger), if linger.is_some() => {
                ws::goodbye(&mut ws).await;
                return SessionEnd::Idle;
            }
            _ = watchdog.tick() => {
                if last_inbound.elapsed() >= INBOUND_TIMEOUT {
                    return SessionEnd::Failed(LinkError::Silent);
                }
            }
        }
    }
}

/// Returns how the session ends, if the frame ends it.
fn handle_text(text: &str, sent: &SentState) -> Option<SessionEnd> {
    let ServerFrame::Error { code } = match serde_json::from_str(text) {
        Ok(frame) => frame,
        Err(error) => {
            debug!(target: "app::hp_report", "ignoring unknown server frame: {error}");
            return None;
        }
    };
    if code == "unsupported_dist"
        && let Some(context) = sent.context
    {
        return Some(SessionEnd::Unsupported(context.distribution));
    }
    warn!(target: "app::hp_report", "server error: {code}");
    None
}

async fn send_frames(ws: &mut Ws, frames: Vec<ClientFrame>) -> Result<(), LinkError> {
    ws::send_texts(ws, frames.iter().map(ClientFrame::encode)).await
}

/// What the server has already been told during the current connection.
#[derive(Debug, Default)]
struct SentState {
    context: Option<HpContext>,
    versions: HashMap<MonsterId, u64>,
}

impl SentState {
    /// Frames that bring the server up to `share`. A new context is announced
    /// first and followed by the whole table, since its entries belong to
    /// another line.
    fn plan(&mut self, share: &HpShare) -> Vec<ClientFrame> {
        let Some(context) = share.context else {
            // Nothing may be reported now; the next context re-sends all.
            self.context = None;
            self.versions.clear();
            return Vec::new();
        };
        let mut frames = Vec::new();
        if self.context != Some(context) {
            frames.push(ClientFrame::ctx(&context));
            self.context = Some(context);
            self.versions.clear();
        }
        let entries = &share.table.entries;
        self.versions.retain(|id, _| entries.contains_key(id));
        let changed: Vec<HpTuple> = entries
            .iter()
            .filter(|(id, (_, version))| self.versions.get(*id) != Some(version))
            .map(|(id, (sample, _))| HpTuple::new(*id, sample))
            .collect();
        self.versions
            .extend(entries.iter().map(|(id, (_, version))| (*id, *version)));
        frames.extend(
            changed
                .chunks(MAX_ENTRIES_PER_FRAME)
                .map(|chunk| ClientFrame::Hp { e: chunk.to_vec() }),
        );
        frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::hp_link::{HpSample, HpTable, LineId};

    fn share(line: u32, entries: &[(i32, u8, u64)]) -> HpShare {
        HpShare {
            context: Some(HpContext {
                distribution: Distribution::Star,
                line: LineId(line),
            }),
            table: Arc::new(HpTable {
                entries: entries
                    .iter()
                    .map(|&(id, hp, version)| {
                        let sample = HpSample { hp, position: None };
                        (MonsterId(id), (sample, version))
                    })
                    .collect(),
            }),
        }
    }

    fn summary(frames: &[ClientFrame]) -> Vec<String> {
        frames
            .iter()
            .map(|frame| match frame {
                ClientFrame::Ctx { line, .. } => format!("ctx {line}"),
                ClientFrame::Hp { e } => format!("hp {}", e.len()),
            })
            .collect()
    }

    #[test]
    fn plan_announces_the_context_then_sends_only_new_versions() {
        let mut sent = SentState::default();
        let first = sent.plan(&share(16, &[(10_032, 100, 1), (10_086, 90, 2)]));
        assert_eq!(summary(&first), vec!["ctx 16", "hp 2"]);

        assert!(
            sent.plan(&share(16, &[(10_032, 100, 1), (10_086, 90, 2)]))
                .is_empty()
        );

        let update = sent.plan(&share(16, &[(10_032, 85, 3), (10_086, 90, 2)]));
        let [ClientFrame::Hp { e }] = update.as_slice() else {
            panic!("expected one hp frame, got {update:?}");
        };
        assert_eq!(e[0].monster_id, 10_032);
        assert_eq!(e[0].hp, 85);
    }

    #[test]
    fn plan_resends_everything_for_a_new_line_or_after_a_gap() {
        let mut sent = SentState::default();
        sent.plan(&share(16, &[(10_032, 100, 1)]));
        let moved = sent.plan(&share(6, &[(10_032, 100, 1)]));
        assert_eq!(summary(&moved), vec!["ctx 6", "hp 1"]);

        assert!(sent.plan(&HpShare::default()).is_empty());
        let back = sent.plan(&share(6, &[(10_032, 100, 1)]));
        assert_eq!(summary(&back), vec!["ctx 6", "hp 1"]);
    }

    #[test]
    fn plan_splits_large_tables_and_forgets_departed_bosses() {
        let mut sent = SentState::default();
        let many: Vec<(i32, u8, u64)> = (1..=100).map(|i| (i, 50, i as u64)).collect();
        assert_eq!(
            summary(&sent.plan(&share(1, &many))),
            vec!["ctx 1", "hp 64", "hp 36"]
        );

        sent.plan(&share(1, &[(1, 50, 1)]));
        assert_eq!(sent.versions.len(), 1);
    }
}
