//! Boundary between the live runtime and the boss HP report client.
//!
//! Same shape as [`team_link`](super::team_link): the live side publishes the
//! bosses it currently sees through a `watch` (only the latest table matters,
//! so a busy network task skips intermediate steps on its own) and receives
//! the server's list of reportable mobs through a bounded `mpsc`. Everything
//! here is plain data; the network adapter depends on it, never the reverse.

use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use tokio::sync::{mpsc, watch};

pub use crate::live::runtime::events::{Distribution, LineId};

/// Link events buffered between the network task and the live runtime.
pub const EVENT_CAPACITY: usize = 8;

/// Game monster id (`AttrId`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct MonsterId(pub i32);

/// Where the reported bosses are.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HpContext {
    pub distribution: Distribution,
    pub line: LineId,
}

/// One boss as reported: HP in 5 % steps (`0` only once dead) and, for mobs
/// whose spawn point matters, the rounded `[x, z]` position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HpSample {
    pub hp: u8,
    pub position: Option<[i32; 2]>,
}

/// The tracked bosses in view. Versions are unique for the table's lifetime,
/// so a sender can diff by "newer than what I sent".
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HpTable {
    pub entries: BTreeMap<MonsterId, (HpSample, u64)>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HpShare {
    /// `None` while nothing may be reported: unknown distribution or line,
    /// or the character is inside a dungeon.
    pub context: Option<HpContext>,
    pub table: Arc<HpTable>,
}

/// Mobs the server accepts reports for.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrackedMobs {
    pub ids: HashSet<MonsterId>,
    /// Mobs whose reports must carry a position.
    pub located: HashSet<MonsterId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HpLinkEvent {
    /// Replaces the list of reportable mobs.
    Tracked(Arc<TrackedMobs>),
}

/// Ends owned by the live runtime.
pub struct LiveEnds {
    pub share: watch::Sender<HpShare>,
    pub events: mpsc::Receiver<HpLinkEvent>,
}

/// Ends owned by the network client.
pub struct NetEnds {
    pub share: watch::Receiver<HpShare>,
    pub events: mpsc::Sender<HpLinkEvent>,
}

#[must_use]
pub fn channel() -> (LiveEnds, NetEnds) {
    let (share_tx, share_rx) = watch::channel(HpShare::default());
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
