use serde::Serialize;

pub const STATUS_EVENT: &str = "hp-report-status-changed";

/// Report connection state shown in the settings page.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum HpReportStatus {
    #[default]
    Disabled,
    /// Reporting is on, but no tracked boss is in view on a known open-world
    /// line.
    Idle,
    Connecting,
    Connected {
        bosses: u32,
    },
    /// The server does not accept reports from this game distribution.
    Unsupported,
    Retrying {
        error: String,
        #[serde(rename = "retryMs")]
        retry_ms: u32,
    },
}

pub type StatusReporter = crate::bptimer::StatusReporter<HpReportStatus>;
