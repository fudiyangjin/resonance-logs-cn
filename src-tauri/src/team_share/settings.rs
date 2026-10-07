//! `stores/teamShare.json`: the sharing switch and the anonymous relay token.
//! Only the switch ever crosses IPC; the token stays in the backend.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::live::store_file::{load_store_json, save_store_json};

const FILE_NAME: &str = "teamShare.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StoredSettings {
    pub enabled: bool,
    pub token: Option<String>,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            token: None,
        }
    }
}

/// Lazily loaded on first use, so commands that race `setup` still see the
/// persisted value.
#[derive(Debug, Default)]
pub struct SettingsStore {
    state: Mutex<Option<StoredSettings>>,
}

fn load(app: &AppHandle) -> StoredSettings {
    load_store_json::<StoredSettings>(app, FILE_NAME)
        .map(|(_, settings)| settings)
        .unwrap_or_default()
}

impl SettingsStore {
    pub fn get(&self, app: &AppHandle) -> StoredSettings {
        self.state.lock().get_or_insert_with(|| load(app)).clone()
    }

    /// Applies `edit` and persists the result. The lock is held across the
    /// write so concurrent updates reach the file in order.
    ///
    /// # Errors
    /// Returns the write error; the in-memory value is updated regardless so
    /// the current session keeps working.
    pub fn update(
        &self,
        app: &AppHandle,
        edit: impl FnOnce(&mut StoredSettings),
    ) -> Result<StoredSettings, String> {
        let mut state = self.state.lock();
        let current = state.get_or_insert_with(|| load(app));
        edit(current);
        let snapshot = current.clone();
        save_store_json(app, FILE_NAME, &snapshot)?;
        Ok(snapshot)
    }
}
