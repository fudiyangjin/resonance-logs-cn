//! Relay client: one task that holds a WebSocket to the team relay while
//! sharing is enabled and the character is in a team.
//!
//! Nothing is batched on a timer. The live runtime publishes its latest
//! share state through a `watch`; the loop sends the difference as soon as it
//! is woken, so changes that arrive while a send is in flight fold into the
//! next frame on their own.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use log::{debug, info, warn};
use tauri::AppHandle;
use tokio::sync::{mpsc, watch};
use tokio::time::Instant;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use super::protocol::{CdTuple, ClientFrame, MAX_ENTRIES_PER_FRAME, SUBPROTOCOL, ServerFrame};
use super::status::{StatusReporter, TeamShareStatus};
use crate::bptimer::ws::{
    self, Backoff, INBOUND_TIMEOUT, LinkError, STABLE_AFTER, WATCHDOG_INTERVAL, Ws,
};
use crate::bptimer::{Credentials, Endpoints};
use crate::live::team_link::{CharId, ShareIdentity, ShareSnapshot, TeamLinkEvent};

/// Keep the socket briefly after leaving a team: teams are often re-formed.
const LINGER_AFTER_TEAM: Duration = Duration::from_secs(60);

pub struct ClientContext {
    pub app: AppHandle,
    pub credentials: Arc<Credentials>,
    pub enabled: watch::Receiver<bool>,
    pub share: watch::Receiver<ShareSnapshot>,
    pub events: mpsc::Sender<TeamLinkEvent>,
    pub status: StatusReporter,
    pub cancel: CancellationToken,
}

enum SessionEnd {
    Cancelled,
    /// Sharing was switched off or the character left the team.
    Idle,
    Failed(LinkError),
}

pub async fn run(mut ctx: ClientContext) {
    let (tls, http) = match ws::tls_config().and_then(|tls| Ok((tls, ws::http_client()?))) {
        Ok(clients) => clients,
        Err(error) => {
            warn!(target: "app::team_share", "{error}");
            ctx.status.set(TeamShareStatus::Retrying {
                error: error.to_string(),
                retry_ms: 0,
            });
            return;
        }
    };
    let endpoints = Endpoints::from_env();
    let mut backoff = Backoff::default();

    loop {
        if !wait_until_shareable(&mut ctx).await {
            return;
        }
        ctx.status.set(TeamShareStatus::Connecting);
        let started = Instant::now();
        let end = session(&mut ctx, &endpoints, &http, &tls).await;
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
                let delay = backoff.next_delay();
                warn!(target: "app::team_share", "{error}; retrying in {} ms", delay.as_millis());
                ctx.status.set(TeamShareStatus::Retrying {
                    error: error.to_string(),
                    retry_ms: u32::try_from(delay.as_millis()).unwrap_or(u32::MAX),
                });
                tokio::select! {
                    () = ctx.cancel.cancelled() => return,
                    () = tokio::time::sleep(delay) => {}
                    () = ws::wait_disabled(&mut ctx.enabled) => {}
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
    let endpoint = endpoints.team_ws();
    let mut ws = tokio::select! {
        () = ctx.cancel.cancelled() => return SessionEnd::Cancelled,
        connected = ws::connect(&endpoint, &token, SUBPROTOCOL, tls) => match connected {
            Ok(ws) => ws,
            Err(error) => {
                if matches!(error, LinkError::Rejected(401)) {
                    // The relay no longer knows the token; register again.
                    ctx.credentials.invalidate(&ctx.app, &token).await;
                }
                return SessionEnd::Failed(error);
            }
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
                    Err(SessionEnd::Failed(LinkError::Refused(code.clone())))
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

async fn send_frames(ws: &mut Ws, frames: Vec<ClientFrame>) -> Result<(), LinkError> {
    ws::send_texts(ws, frames.iter().map(ClientFrame::encode)).await
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
}
