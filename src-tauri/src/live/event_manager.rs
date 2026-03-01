use crate::live::commands_models::{
    BossHealth, HeaderInfo, LiveDataPayload, RawEntityData, to_raw_combat_stats, to_raw_skill_stats,
};
use crate::live::opcodes_models::{Encounter, class};
use blueprotobuf_lib::blueprotobuf::EEntityType;
use log::{info, trace, warn};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

/// Safely emits an event to the frontend, handling WebView2 state errors gracefully.
/// This prevents the app from freezing when the WebView is in an invalid state
/// (e.g., minimized, hidden, or transitioning).
///
/// Returns `true` if the event was emitted successfully, `false` otherwise.
fn safe_emit<S: Serialize + Clone>(app_handle: &AppHandle, event: &str, payload: S) -> bool {
    // First check if the live window exists and is valid
    let live_window = app_handle.get_webview_window(crate::WINDOW_LIVE_LABEL);
    let main_window = app_handle.get_webview_window(crate::WINDOW_MAIN_LABEL);

    // If no windows are available, skip emitting
    if live_window.is_none() && main_window.is_none() {
        trace!("Skipping emit for '{}': no windows available", event);
        return false;
    }

    // Try to emit the event, catching WebView2 errors
    match app_handle.emit(event, payload) {
        Ok(_) => true,
        Err(e) => {
            // Check if this is a WebView2 state error (0x8007139F)
            let error_str = format!("{:?}", e);
            if error_str.contains("0x8007139F") || error_str.contains("not in the correct state") {
                // This is expected when windows are minimized/hidden - don't spam logs
                trace!(
                    "WebView2 not ready for '{}' (window may be minimized/hidden)",
                    event
                );
            } else {
                // Log other errors as warnings
                warn!("Failed to emit '{}': {}", event, e);
            }
            false
        }
    }
}

/// Manages events and emits them to the frontend.
#[derive(Debug)]
pub struct EventManager {
    app_handle: Option<AppHandle>,
    dead_bosses: HashSet<i64>,
    // Map boss_uid -> boss_name for persisted marking
    dead_boss_names: HashMap<i64, String>,
}

impl EventManager {
    /// Creates a new `EventManager`.
    pub fn new() -> Self {
        Self {
            app_handle: None,
            dead_bosses: HashSet::new(),
            dead_boss_names: HashMap::new(),
        }
    }

    /// Initializes the `EventManager` with a Tauri app handle.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - A handle to the Tauri application instance.
    pub fn initialize(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
        info!("Event manager initialized");
    }

    /// Emits an encounter update event.
    ///
    /// # Arguments
    ///
    /// * `header_info` - The header information for the encounter.
    /// * `is_paused` - Whether the encounter is paused.
    pub fn emit_encounter_update(&self, header_info: HeaderInfo, is_paused: bool) {
        if let Some(app_handle) = &self.app_handle {
            let payload = EncounterUpdatePayload {
                header_info,
                is_paused,
            };
            safe_emit(app_handle, "encounter-update", payload);
        }
    }

    /// Emits an encounter reset event.
    pub fn emit_encounter_reset(&self) {
        if let Some(app_handle) = &self.app_handle {
            if safe_emit(app_handle, "reset-encounter", "") {
                trace!("Emitted reset-encounter event");
            }
        }
    }

    /// Emits a reset event specifically for player metrics when a new segment begins.
    /// This is intentionally separate from an encounter reset so the frontend can
    /// clear only player metrics without clearing the entire dungeon log.
    /// Emits a reset event specifically for player metrics when a new segment begins.
    /// Optionally include a segment name for displaying in UI toasts.

    /// Emits an encounter pause event.
    ///
    /// # Arguments
    ///
    /// * `is_paused` - Whether the encounter is paused.
    pub fn emit_encounter_pause(&self, is_paused: bool) {
        if let Some(app_handle) = &self.app_handle {
            if safe_emit(app_handle, "pause-encounter", is_paused) {
                trace!("Emitted pause-encounter event: {}", is_paused);
            }
        }
    }

    /// Emits a scene change event.
    ///
    /// # Arguments
    ///
    /// * `scene_name` - The name of the new scene.
    pub fn emit_scene_change(&self, scene_name: String) {
        if let Some(app_handle) = &self.app_handle {
            let payload = SceneChangePayload { scene_name };
            if safe_emit(app_handle, "scene-change", payload) {
                info!("Emitted scene-change event");
            }
        }
    }

    /// Emits a boss death event.
    ///
    /// # Arguments
    ///
    /// * `boss_name` - The name of the boss that died.
    /// * `boss_uid` - The UID of the boss that died.
    /// Returns true if this is the first time we saw this boss die.
    pub fn emit_boss_death(&mut self, boss_name: String, boss_uid: i64) -> bool {
        // Only emit if we haven't already emitted for this boss
        if self.dead_bosses.insert(boss_uid) {
            // record the boss name for later persistence
            self.dead_boss_names.insert(boss_uid, boss_name.clone());
            if let Some(app_handle) = &self.app_handle {
                let payload = BossDeathPayload { boss_name };
                if safe_emit(app_handle, "boss-death", payload) {
                    info!("Emitted boss-death event for {}", boss_uid);
                }
            }
            return true;
        }
        false
    }

    /// Drain and return any dead boss names that have been recorded by the event manager.
    /// This consumes the stored names and uids so they won't be double-persisted.
    pub fn take_dead_bosses(&mut self) -> Vec<String> {
        let mut names = Vec::new();
        for (_uid, name) in self.dead_boss_names.drain() {
            names.push(name);
        }
        // also clear uids set to keep parity
        self.dead_bosses.clear();
        names
    }

    /// Clears the list of dead bosses.
    pub fn clear_dead_bosses(&mut self) {
        self.dead_bosses.clear();
    }

    /// Returns whether the `EventManager` should emit events.
    pub fn should_emit_events(&self) -> bool {
        self.app_handle.is_some()
    }

    /// Returns a clone of the app handle for lock-free event emission.
    pub fn get_app_handle(&self) -> Option<AppHandle> {
        self.app_handle.clone()
    }
}

/// The payload for an encounter update event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncounterUpdatePayload {
    /// The header information for the encounter.
    pub header_info: HeaderInfo,
    /// Whether the encounter is paused.
    pub is_paused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossDeathPayload {
    /// The name of the boss that died.
    pub boss_name: String,
}

/// The payload for a scene change event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneChangePayload {
    /// The name of the new scene.
    pub scene_name: String,
}

impl Default for EventManager {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
pub type EventManagerMutex = RwLock<EventManager>;

pub fn generate_live_data_payload(
    encounter: &Encounter,
    current_segment_type: Option<String>,
    current_segment_name: Option<String>,
) -> LiveDataPayload {
    let elapsed_ms = encounter
        .time_last_combat_packet_ms
        .saturating_sub(encounter.time_fight_start_ms);

    let mut entities = Vec::new();
    for (&uid, entity) in &encounter.entity_uid_to_entity {
        if entity.entity_type != EEntityType::EntChar {
            continue;
        }

        let has_combat = entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
        if !has_combat {
            continue;
        }

        entities.push(RawEntityData {
            uid,
            name: entity.name.clone(),
            class_id: entity.class_id,
            class_spec: entity.class_spec as i32,
            class_name: class::get_class_name(entity.class_id),
            class_spec_name: class::get_class_spec(entity.class_spec),
            ability_score: entity.ability_score,
            season_strength: entity.season_strength().unwrap_or(0) as i32,
            damage: to_raw_combat_stats(&entity.damage),
            damage_boss_only: to_raw_combat_stats(&entity.damage_boss_only),
            healing: to_raw_combat_stats(&entity.healing),
            taken: to_raw_combat_stats(&entity.taken),
            active_dmg_time_ms: entity.active_dmg_time_ms,
            dmg_skills: entity
                .skill_uid_to_dmg_skill
                .iter()
                .map(|(skill_id, stats)| (*skill_id, to_raw_skill_stats(stats)))
                .collect(),
            heal_skills: entity
                .skill_uid_to_heal_skill
                .iter()
                .map(|(skill_id, stats)| (*skill_id, to_raw_skill_stats(stats)))
                .collect(),
            taken_skills: entity
                .skill_uid_to_taken_skill
                .iter()
                .map(|(skill_id, stats)| (*skill_id, to_raw_skill_stats(stats)))
                .collect(),
        });
    }

    let mut bosses: Vec<BossHealth> = encounter
        .entity_uid_to_entity
        .iter()
        .filter_map(|(&uid, entity)| {
            if !entity.is_boss() {
                return None;
            }

            let current_hp = entity.hp();
            let max_hp = entity.max_hp();
            if current_hp.is_none() && max_hp.is_none() {
                return None;
            }

            let name = if !entity.name.is_empty() {
                entity.name.clone()
            } else if let Some(packet_name) = &entity.monster_name_packet {
                packet_name.clone()
            } else {
                format!("Boss {uid}")
            };

            Some(BossHealth {
                uid,
                name,
                current_hp,
                max_hp,
            })
        })
        .collect();
    bosses.sort_by_key(|boss| boss.uid);

    LiveDataPayload {
        elapsed_ms,
        fight_start_timestamp_ms: encounter.time_fight_start_ms,
        total_dmg: encounter.total_dmg,
        total_dmg_boss_only: encounter.total_dmg_boss_only,
        total_heal: encounter.total_heal,
        local_player_uid: encounter.local_player_uid,
        scene_id: encounter.current_scene_id,
        scene_name: encounter.current_scene_name.clone(),
        is_paused: encounter.is_encounter_paused,
        bosses,
        entities,
        current_segment_type,
        current_segment_name,
    }
}
