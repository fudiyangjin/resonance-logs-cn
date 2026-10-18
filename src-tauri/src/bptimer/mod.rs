//! Plumbing shared by the bptimer.cn clients (team cooldown relay, boss HP
//! reports): server endpoints, the anonymous client token, WebSocket
//! connections with reconnect backoff, and status reporting to the main window.

pub mod credentials;
pub mod status;
pub mod switch;
pub mod task;
pub mod ws;

pub use credentials::Credentials;
pub use status::StatusReporter;
pub use switch::SwitchStore;
pub use task::ClientTask;

pub const APP_NAME: &str = "resonance-logs-cn";
const DEFAULT_ORIGIN: &str = "https://bptimer.cn";
/// Overrides the server origin for local development or a self-hosted
/// server, e.g. `http://127.0.0.1:8090`.
const ORIGIN_ENV: &str = "RESONANCE_BPTIMER_ORIGIN";

#[must_use]
pub fn user_agent() -> String {
    format!("{APP_NAME}/{}", env!("CARGO_PKG_VERSION"))
}

/// Server URLs, all derived from one `http(s)://host[:port]` origin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    http: String,
    ws: String,
}

impl Endpoints {
    /// The default server unless the environment names a valid origin.
    #[must_use]
    pub fn from_env() -> Self {
        std::env::var(ORIGIN_ENV)
            .ok()
            .and_then(|origin| Self::parse(&origin))
            .unwrap_or_else(|| Self::parse(DEFAULT_ORIGIN).expect("default origin is valid"))
    }

    fn parse(origin: &str) -> Option<Self> {
        let origin = origin.trim().trim_end_matches('/');
        let (scheme, authority) = origin.split_once("://")?;
        let ws_scheme = match scheme {
            "https" => "wss",
            "http" => "ws",
            _ => return None,
        };
        if authority.is_empty() || authority.contains('/') {
            return None;
        }
        Some(Self {
            http: origin.to_string(),
            ws: format!("{ws_scheme}://{authority}"),
        })
    }

    /// `POST`: registers an anonymous client token.
    #[must_use]
    pub fn clients(&self) -> String {
        format!("{}/v1/clients", self.http)
    }

    /// `GET`: the mobs the server tracks.
    #[must_use]
    pub fn mobs(&self) -> String {
        format!("{}/v1/mobs", self.http)
    }

    #[must_use]
    pub fn team_ws(&self) -> String {
        format!("{}/v1/team/ws", self.ws)
    }

    #[must_use]
    pub fn hp_ws(&self) -> String {
        format!("{}/v1/hp/ws", self.ws)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_follow_the_origin() {
        let local = Endpoints::parse("http://127.0.0.1:8090/").unwrap();
        assert_eq!(local.clients(), "http://127.0.0.1:8090/v1/clients");
        assert_eq!(local.hp_ws(), "ws://127.0.0.1:8090/v1/hp/ws");

        let default = Endpoints::parse(DEFAULT_ORIGIN).unwrap();
        assert_eq!(default.mobs(), "https://bptimer.cn/v1/mobs");
        assert_eq!(default.team_ws(), "wss://bptimer.cn/v1/team/ws");
    }

    #[test]
    fn origins_must_be_bare_http_urls() {
        assert_eq!(Endpoints::parse("wss://bptimer.cn"), None);
        assert_eq!(Endpoints::parse("https://bptimer.cn/v1"), None);
        assert_eq!(Endpoints::parse("bptimer.cn"), None);
    }
}
