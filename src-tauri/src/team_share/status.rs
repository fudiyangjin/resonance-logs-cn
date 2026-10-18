use serde::Serialize;

pub const STATUS_EVENT: &str = "team-share-status-changed";

/// Relay connection state shown in the settings page.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum TeamShareStatus {
    #[default]
    Disabled,
    /// Sharing is on but the character is not in a team, the game client is
    /// not detected yet, or the server clock is still unknown.
    Idle,
    Connecting,
    Connected {
        teammates: u32,
    },
    Retrying {
        error: String,
        #[serde(rename = "retryMs")]
        retry_ms: u32,
    },
}

pub type StatusReporter = crate::bptimer::status::StatusReporter<TeamShareStatus>;
