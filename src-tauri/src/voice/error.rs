use serde::Serialize;
use specta::Type;
use thiserror::Error;

pub type VoiceResult<T> = Result<T, VoiceError>;

#[derive(Debug, Error)]
pub enum VoiceError {
    #[error("invalid {field}: {message}")]
    Validation {
        field: &'static str,
        message: String,
    },
    #[error("{resource} not found: {id}")]
    NotFound { resource: &'static str, id: String },
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Cancelled(String),
    #[error("{0}")]
    Incompatible(String),
    #[error("{0}")]
    Security(String),
    #[error("{context}: {source}")]
    Io {
        context: String,
        #[source]
        source: std::io::Error,
    },
    #[error("{context}: {source}")]
    Http {
        context: String,
        #[source]
        source: reqwest::Error,
    },
    #[error("{context}: {source}")]
    Json {
        context: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("{0}")]
    Process(String),
    #[error("{0}")]
    Internal(String),
}

impl VoiceError {
    pub fn validation(field: &'static str, message: impl Into<String>) -> Self {
        Self::Validation {
            field,
            message: message.into(),
        }
    }

    pub fn not_found(resource: &'static str, id: impl Into<String>) -> Self {
        Self::NotFound {
            resource,
            id: id.into(),
        }
    }

    pub fn io(context: impl Into<String>, source: std::io::Error) -> Self {
        Self::Io {
            context: context.into(),
            source,
        }
    }

    pub fn json(context: impl Into<String>, source: serde_json::Error) -> Self {
        Self::Json {
            context: context.into(),
            source,
        }
    }

    pub fn security(message: impl Into<String>) -> Self {
        Self::Security(message.into())
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation { .. } => "validation",
            Self::NotFound { .. } => "not_found",
            Self::Conflict(_) => "conflict",
            Self::Cancelled(_) => "cancelled",
            Self::Incompatible(_) => "incompatible",
            Self::Security(_) => "security",
            Self::Io { .. } => "io",
            Self::Http { .. } => "network",
            Self::Json { .. } => "invalid_data",
            Self::Process(_) => "sidecar",
            Self::Internal(_) => "internal",
        }
    }

    pub fn is_retriable(&self) -> bool {
        matches!(
            self,
            Self::Conflict(_)
                | Self::Cancelled(_)
                | Self::Io { .. }
                | Self::Http { .. }
                | Self::Process(_)
        )
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCommandError {
    pub code: String,
    pub message: String,
    pub retriable: bool,
}

impl From<VoiceError> for VoiceCommandError {
    fn from(error: VoiceError) -> Self {
        Self {
            code: error.code().to_string(),
            retriable: error.is_retriable(),
            message: error.to_string(),
        }
    }
}
