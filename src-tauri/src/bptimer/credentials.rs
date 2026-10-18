//! The anonymous client token every bptimer service authenticates with.
//! Stored in `stores/bptimer.json`; it never crosses IPC.

use log::warn;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::sync::Mutex;

use super::ws::LinkError;
use super::{APP_NAME, Endpoints};
use crate::live::store_file::{load_store_json, save_store_json};

const FILE_NAME: &str = "bptimer.json";
/// Releases before the shared store kept the token with the team-share switch.
const LEGACY_FILE_NAME: &str = "teamShare.json";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StoredToken {
    token: Option<String>,
}

/// Shared by all services, so concurrent first uses register only once.
#[derive(Debug, Default)]
pub struct Credentials {
    /// `None` until first use, then the stored token (if any).
    token: Mutex<Option<Option<String>>>,
}

impl Credentials {
    /// Loads (and migrates) the stored token before any service runs, so a
    /// settings write cannot drop the legacy copy first.
    pub fn prime(&self, app: &AppHandle) {
        if let Ok(mut state) = self.token.try_lock() {
            state.get_or_insert_with(|| load(app));
        }
    }

    /// The stored token, registering a new one with the server when there is
    /// none. The lock is held across the registration on purpose: callers
    /// racing for a first token wait for the same one.
    ///
    /// # Errors
    /// Returns [`LinkError::Register`] when the registration request fails.
    pub async fn token(
        &self,
        app: &AppHandle,
        http: &reqwest::Client,
        endpoints: &Endpoints,
    ) -> Result<String, LinkError> {
        let mut state = self.token.lock().await;
        let stored = state.get_or_insert_with(|| load(app));
        if let Some(token) = stored.as_ref().filter(|token| !token.is_empty()) {
            return Ok(token.clone());
        }
        let token = register(http, endpoints).await?;
        *stored = Some(token.clone());
        save(app, Some(&token));
        Ok(token)
    }

    /// Forgets `token` after the server rejected it, unless another service
    /// already replaced it with a newer one.
    pub async fn invalidate(&self, app: &AppHandle, token: &str) {
        let mut state = self.token.lock().await;
        if let Some(stored) = state.as_mut()
            && stored.as_deref() == Some(token)
        {
            *stored = None;
            save(app, None);
        }
    }
}

fn load(app: &AppHandle) -> Option<String> {
    if let Some((_, stored)) = load_store_json::<StoredToken>(app, FILE_NAME) {
        return stored.token;
    }
    let token = load_store_json::<StoredToken>(app, LEGACY_FILE_NAME)
        .and_then(|(_, legacy)| legacy.token)?;
    save(app, Some(&token));
    Some(token)
}

fn save(app: &AppHandle, token: Option<&str>) {
    let stored = StoredToken {
        token: token.map(str::to_owned),
    };
    if let Err(error) = save_store_json(app, FILE_NAME, &stored) {
        warn!(target: "app::bptimer", "could not persist the client token: {error}");
    }
}

async fn register(http: &reqwest::Client, endpoints: &Endpoints) -> Result<String, LinkError> {
    #[derive(Deserialize)]
    struct Registered {
        token: String,
    }
    let response = http
        .post(endpoints.clients())
        .json(&serde_json::json!({ "app": APP_NAME }))
        .send()
        .await
        .map_err(|error| LinkError::Register(error.to_string()))?;
    if !response.status().is_success() {
        return Err(LinkError::Register(format!(
            "HTTP {}",
            response.status().as_u16()
        )));
    }
    let registered: Registered = response
        .json()
        .await
        .map_err(|error| LinkError::Register(error.to_string()))?;
    Ok(registered.token)
}
