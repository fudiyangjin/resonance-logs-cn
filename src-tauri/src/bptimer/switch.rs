//! A service's persisted on/off switch in `stores/<file>`. Only the switch
//! crosses IPC.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::live::store_file::{load_store_json, save_store_json};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StoredSwitch {
    enabled: bool,
}

impl Default for StoredSwitch {
    fn default() -> Self {
        Self { enabled: true }
    }
}

/// Lazily loaded on first use, so commands that race `setup` still see the
/// persisted value.
#[derive(Debug)]
pub struct SwitchStore {
    file_name: &'static str,
    enabled: Mutex<Option<bool>>,
}

impl SwitchStore {
    #[must_use]
    pub const fn new(file_name: &'static str) -> Self {
        Self {
            file_name,
            enabled: Mutex::new(None),
        }
    }

    pub fn is_enabled(&self, app: &AppHandle) -> bool {
        *self.enabled.lock().get_or_insert_with(|| self.load(app))
    }

    /// Persists the switch. The lock is held across the write so concurrent
    /// updates reach the file in order.
    ///
    /// # Errors
    /// Returns the write error; the in-memory value is updated regardless so
    /// the current session keeps working.
    pub fn set(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        let mut state = self.enabled.lock();
        *state = Some(enabled);
        save_store_json(app, self.file_name, &StoredSwitch { enabled }).map(|_| ())
    }

    fn load(&self, app: &AppHandle) -> bool {
        load_store_json::<StoredSwitch>(app, self.file_name)
            .map(|(_, stored)| stored)
            .unwrap_or_default()
            .enabled
    }
}
