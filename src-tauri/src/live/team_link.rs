//! Boundary between the live runtime and the team-share network client.
//!
//! The live side publishes the local character's shareable state through a
//! `watch` channel (only the latest value matters, so a busy network task
//! coalesces bursts on its own) and receives teammate updates through a
//! bounded `mpsc`. Everything here is plain data: the network adapter depends
//! on these types, never the other way round.

use std::collections::BTreeMap;
use std::sync::Arc;

use tokio::sync::{mpsc, watch};

pub use crate::packets::game_connections::Distribution;

/// Teammate updates buffered between the network task and the live runtime.
pub const EVENT_CAPACITY: usize = 256;

/// In-game character id (`EntityUuid >> 16`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CharId(pub i64);

/// In-game team id; never zero.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TeamId(pub i64);

/// One cooldown packet as shared with teammates. The sender already applied
/// its own cooldown-reduction attributes; `anchor_server_ms` is the packet's
/// capture time in game-server Unix milliseconds.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CdSample {
    pub skill_level_id: i32,
    pub duration: i32,
    pub cd_type: i32,
    pub valid_cd_time: i32,
    pub calculated_duration: i32,
    pub accelerate_rate: f32,
    pub anchor_server_ms: i64,
}

impl CdSample {
    #[must_use]
    pub const fn skill_id(&self) -> i32 {
        self.skill_level_id / 100
    }
}

/// Who the local character is, as far as a team room is concerned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShareIdentity {
    pub distribution: Distribution,
    pub team_id: TeamId,
    pub char_id: CharId,
    /// Sorted, deduplicated, contains `char_id`.
    pub roster: Vec<CharId>,
    pub name: String,
    pub class_id: i32,
}

/// The local cooldown table. `version` values are unique for the table's
/// lifetime, so a sender can diff by "newer than what I sent".
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CdTable {
    /// Bumped whenever entries disappear; peers must drop everything and
    /// take the table again.
    pub epoch: u64,
    /// `skill_level_id` → (sample, version).
    pub entries: BTreeMap<i32, (CdSample, u64)>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ShareSnapshot {
    /// `None` while the character cannot share (no team, no game client,
    /// no server clock yet).
    pub identity: Option<ShareIdentity>,
    pub cds: Arc<CdTable>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeammateProfile {
    pub name: String,
    pub class_id: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TeammateSnapshot {
    pub char_id: CharId,
    pub profile: TeammateProfile,
    pub samples: Vec<CdSample>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TeamLinkEvent {
    /// Replaces every teammate; sent after each join.
    Snapshot(Vec<TeammateSnapshot>),
    Member {
        char_id: CharId,
        profile: TeammateProfile,
    },
    Cd {
        char_id: CharId,
        samples: Vec<CdSample>,
    },
    Clear {
        char_id: CharId,
    },
    Left {
        char_id: CharId,
    },
    /// The relay connection is gone; known teammate state is now stale.
    LinkDown,
}

/// Ends owned by the live runtime.
pub struct LiveEnds {
    pub share: watch::Sender<ShareSnapshot>,
    pub events: mpsc::Receiver<TeamLinkEvent>,
}

/// Ends owned by the network client.
pub struct NetEnds {
    pub share: watch::Receiver<ShareSnapshot>,
    pub events: mpsc::Sender<TeamLinkEvent>,
}

#[must_use]
pub fn channel() -> (LiveEnds, NetEnds) {
    let (share_tx, share_rx) = watch::channel(ShareSnapshot::default());
    let (events_tx, events_rx) = mpsc::channel(EVENT_CAPACITY);
    (
        LiveEnds {
            share: share_tx,
            events: events_rx,
        },
        NetEnds {
            share: share_rx,
            events: events_tx,
        },
    )
}
