use crate::live::commands_models::{
    BossHealth, HeaderInfo, PlayerRow, PlayersWindow, SkillRow, SkillsWindow,
};
use crate::live::opcodes_models::{Encounter, Entity, Skill, class};
use crate::database::CachedEntity;
use blueprotobuf_lib::blueprotobuf::EEntityType;
use log::{info, trace, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::HashSet;
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
                trace!("WebView2 not ready for '{}' (window may be minimized/hidden)", event);
            } else {
                // Log other errors as warnings
                warn!("Failed to emit '{}': {}", event, e);
            }
            false
        }
    }
}

/// Represents the type of metric being displayed.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MetricType {
    /// Damage per second.
    Dps,
    /// Healing per second.
    Heal,
    /// Damage taken per second.
    Tanked,
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
        let mut names: Vec<String> = Vec::new();
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

/// The payload for a players update event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayersUpdatePayload {
    /// The type of metric being displayed.
    pub metric_type: MetricType,
    /// The players window data.
    pub players_window: PlayersWindow,
}

/// The payload for a skills update event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsUpdatePayload {
    /// The type of metric being displayed.
    pub metric_type: MetricType,
    /// The UID of the player.
    pub player_uid: i64,
    /// The skills window data.
    pub skills_window: SkillsWindow,
}

/// The payload for a boss death event.
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

/// The payload for a player metrics reset event (segment transition / partial reset)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMetricsResetPayload {
    /// Optional segment name (e.g., boss name) for display in UI
    pub segment_name: Option<String>,
}

impl Default for EventManager {
    fn default() -> Self {
        Self::new()
    }
}

// Use an async RwLock for non-blocking access from async tasks
#[allow(dead_code)]
pub type EventManagerMutex = RwLock<EventManager>;

// Helper: check if a target UID represents a boss entity
fn is_boss_target(encounter: &Encounter, target_uid: &i64) -> bool {
    encounter
        .entity_uid_to_entity
        .get(target_uid)
        .map(|e| e.is_boss())
        .unwrap_or(false)
}

// Helper functions for generating data structures
pub fn generate_players_window_dps(
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    _boss_only: bool,
    segment_elapsed_ms: Option<u128>,
) -> PlayersWindow {
    let (_, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    let mut players_window = PlayersWindow {
        player_rows: Vec::new(),
    };

    let total_scope_dmg: u128 = encounter.total_dmg;
    let total_boss_dmg: u128 = encounter
        .entity_uid_to_entity
        .iter()
        .filter(|(_, e)| e.entity_type == EEntityType::EntChar)
        .map(|(_, e)| {
            e.dmg_to_target
                .iter()
                .filter(|(tuid, _)| is_boss_target(encounter, tuid))
                .map(|(_, v)| *v)
                .sum::<u128>()
        })
        .sum();

    if total_scope_dmg == 0 && total_boss_dmg == 0 {
        return players_window;
    }

    for (&entity_uid, entity) in &encounter.entity_uid_to_entity {
        if let Some(player_row) = generate_player_row_filtered(
            entity_uid,
            entity,
            encounter,
            entity_cache,
            total_scope_dmg,
            total_boss_dmg,
            time_elapsed_secs,
        ) {
            players_window.player_rows.push(player_row);
        }
    }

    // Sort players descending by damage dealt
    players_window.player_rows.sort_by(|this_row, other_row| {
        other_row
            .total_dmg
            .partial_cmp(&this_row.total_dmg)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    players_window
}

pub fn generate_players_window_heal(
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    segment_elapsed_ms: Option<u128>,
) -> PlayersWindow {
    let (_, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    let mut players_window = PlayersWindow {
        player_rows: Vec::new(),
    };

    if encounter.total_heal == 0 {
        return players_window;
    }

    for (&entity_uid, entity) in &encounter.entity_uid_to_entity {
        let is_player = entity.entity_type == EEntityType::EntChar;
        let did_heal = !entity.skill_uid_to_heal_skill.is_empty();

        if is_player && did_heal {
            #[allow(clippy::cast_precision_loss)]
            let heal_row = PlayerRow {
                uid: entity_uid as u128,
                name: prettify_name(entity_uid, encounter.local_player_uid, &entity.name, entity_cache),
                class_name: class::get_class_name(entity.class_id),
                class_spec_name: class::get_class_spec(entity.class_spec),
                ability_score: entity.ability_score as u128,
                total_dmg: entity.healing.total,
                dps: nan_is_zero(entity.healing.total as f64 / time_elapsed_secs),
                tdps: 0.0,
                active_time_ms: 0,
                dmg_pct: nan_is_zero(
                    entity.healing.total as f64 / encounter.total_heal as f64 * 100.0,
                ),
                crit_rate: nan_is_zero(
                    entity.healing.crit_hits as f64 / entity.healing.hits as f64 * 100.0,
                ),
                crit_dmg_rate: nan_is_zero(
                    entity.healing.crit_total as f64 / entity.healing.total as f64 * 100.0,
                ),
                lucky_rate: nan_is_zero(
                    entity.healing.lucky_hits as f64 / entity.healing.hits as f64 * 100.0,
                ),
                lucky_dmg_rate: nan_is_zero(
                    entity.healing.lucky_total as f64 / entity.healing.total as f64 * 100.0,
                ),
                hits: entity.healing.hits,
                hits_per_minute: nan_is_zero(entity.healing.hits as f64 / time_elapsed_secs * 60.0),
                boss_dmg: 0,
                boss_dps: 0.0,
                boss_dmg_pct: 0.0,
                // Extended attributes from Stage 4
                rank_level: entity.rank_level(),
                current_hp: entity.hp(),
                max_hp: entity.max_hp(),
                crit_stat: entity.crit(),
                lucky_stat: entity.lucky(),
                haste: entity.haste(),
                mastery: entity.mastery(),
                element_flag: entity
                    .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
                    .and_then(|v| v.as_int()),
                energy_flag: entity
                    .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
                    .and_then(|v| v.as_int()),
                reduction_level: entity.reduction_level(),
            };
            players_window.player_rows.push(heal_row);
        }
    }

    // Sort players descending by heal dealt
    players_window.player_rows.sort_by(|this_row, other_row| {
        other_row
            .total_dmg
            .partial_cmp(&this_row.total_dmg)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    players_window
}

pub fn generate_players_window_tanked(
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    segment_elapsed_ms: Option<u128>,
) -> PlayersWindow {
    let (_, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    let mut players_window = PlayersWindow {
        player_rows: Vec::new(),
    };

    // Calculate total damage taken across all players
    let mut total_taken_all: u128 = 0;
    for entity in encounter.entity_uid_to_entity.values() {
        if entity.entity_type == EEntityType::EntChar {
            total_taken_all += entity.taken.total;
        }
    }

    if total_taken_all == 0 {
        return players_window;
    }

    for (&entity_uid, entity) in &encounter.entity_uid_to_entity {
        let is_player = entity.entity_type == EEntityType::EntChar;
        let took_damage = !entity.skill_uid_to_taken_skill.is_empty();

        if is_player && took_damage {
            #[allow(clippy::cast_precision_loss)]
            let tanked_row = PlayerRow {
                uid: entity_uid as u128,
                name: prettify_name(entity_uid, encounter.local_player_uid, &entity.name, entity_cache),
                class_name: class::get_class_name(entity.class_id),
                class_spec_name: class::get_class_spec(entity.class_spec),
                ability_score: entity.ability_score as u128,
                total_dmg: entity.taken.total,
                dps: nan_is_zero(entity.taken.total as f64 / time_elapsed_secs),
                tdps: 0.0,
                active_time_ms: 0,
                dmg_pct: nan_is_zero(entity.taken.total as f64 / total_taken_all as f64 * 100.0),
                crit_rate: nan_is_zero(
                    entity.taken.crit_hits as f64 / entity.taken.hits as f64 * 100.0,
                ),
                crit_dmg_rate: nan_is_zero(
                    entity.taken.crit_total as f64 / entity.taken.total as f64 * 100.0,
                ),
                lucky_rate: nan_is_zero(
                    entity.taken.lucky_hits as f64 / entity.taken.hits as f64 * 100.0,
                ),
                lucky_dmg_rate: nan_is_zero(
                    entity.taken.lucky_total as f64 / entity.taken.total as f64 * 100.0,
                ),
                hits: entity.taken.hits,
                hits_per_minute: nan_is_zero(entity.taken.hits as f64 / time_elapsed_secs * 60.0),
                boss_dmg: 0,
                boss_dps: 0.0,
                boss_dmg_pct: 0.0,
                // Extended attributes from Stage 4
                rank_level: entity.rank_level(),
                current_hp: entity.hp(),
                max_hp: entity.max_hp(),
                crit_stat: entity.crit(),
                lucky_stat: entity.lucky(),
                haste: entity.haste(),
                mastery: entity.mastery(),
                element_flag: entity
                    .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
                    .and_then(|v| v.as_int()),
                energy_flag: entity
                    .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
                    .and_then(|v| v.as_int()),
                reduction_level: entity.reduction_level(),
            };
            players_window.player_rows.push(tanked_row);
        }
    }

    // Sort players descending by damage taken
    players_window.player_rows.sort_by(|this_row, other_row| {
        other_row
            .total_dmg
            .partial_cmp(&this_row.total_dmg)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    players_window
}

pub fn generate_skills_window_dps(
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    player_uid: i64,
    boss_only: bool,
    segment_elapsed_ms: Option<u128>,
) -> Option<SkillsWindow> {
    let entity = encounter.entity_uid_to_entity.get(&player_uid)?;
    let (_, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    let total_boss_dmg: u128 = encounter
        .entity_uid_to_entity
        .iter()
        .filter(|(_, e)| e.entity_type == EEntityType::EntChar)
        .map(|(_, e)| {
            e.dmg_to_target
                .iter()
                .filter(|(tuid, _)| is_boss_target(encounter, tuid))
                .map(|(_, v)| *v)
                .sum::<u128>()
        })
        .sum();

    let player_boss_total: u128 = entity
        .dmg_to_target
        .iter()
        .filter(|(tuid, _)| is_boss_target(encounter, tuid))
        .map(|(_, v)| *v)
        .sum();

    // Compute encounter and player totals within scope
    let total_scope_dmg: u128 = if boss_only {
        total_boss_dmg
    } else {
        encounter.total_dmg
    };

    let player_total: u128 = if boss_only { player_boss_total } else { entity.damage.total };
    let active_time_ms = entity.active_dmg_time_ms;
    #[allow(clippy::cast_precision_loss)]
    let active_time_secs = if active_time_ms > 0 {
        active_time_ms as f64 / 1000.0
    } else {
        0.0
    };

    // Player DPS Stats
    #[allow(clippy::cast_precision_loss)]
    let mut skills_window = SkillsWindow {
        curr_player: vec![PlayerRow {
            uid: player_uid as u128,
            name: prettify_name(player_uid, encounter.local_player_uid, &entity.name, entity_cache),
            class_name: class::get_class_name(entity.class_id),
            class_spec_name: class::get_class_spec(entity.class_spec),
            ability_score: entity.ability_score as u128,
            total_dmg: player_total,
            dps: nan_is_zero(player_total as f64 / time_elapsed_secs),
            tdps: nan_is_zero(player_total as f64 / active_time_secs),
            active_time_ms,
            dmg_pct: if total_scope_dmg == 0 {
                0.0
            } else {
                nan_is_zero(player_total as f64 / total_scope_dmg as f64 * 100.0)
            },
            boss_dmg: player_boss_total,
            boss_dps: nan_is_zero(player_boss_total as f64 / time_elapsed_secs),
            boss_dmg_pct: if total_boss_dmg == 0 {
                0.0
            } else {
                nan_is_zero(player_boss_total as f64 / total_boss_dmg as f64 * 100.0)
            },
            crit_rate: nan_is_zero(entity.damage.crit_hits as f64 / entity.damage.hits as f64 * 100.0),
            crit_dmg_rate: nan_is_zero(
                entity.damage.crit_total as f64 / entity.damage.total as f64 * 100.0,
            ),
            lucky_rate: nan_is_zero(entity.damage.lucky_hits as f64 / entity.damage.hits as f64 * 100.0),
            lucky_dmg_rate: nan_is_zero(
                entity.damage.lucky_total as f64 / entity.damage.total as f64 * 100.0,
            ),
            hits: entity.damage.hits,
            hits_per_minute: nan_is_zero(entity.damage.hits as f64 / time_elapsed_secs * 60.0),
            // Extended attributes from Stage 4
            rank_level: entity.rank_level(),
            current_hp: entity.hp(),
            max_hp: entity.max_hp(),
            crit_stat: entity.crit(),
            lucky_stat: entity.lucky(),
            haste: entity.haste(),
            mastery: entity.mastery(),
            element_flag: entity
                .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
                .and_then(|v| v.as_int()),
            energy_flag: entity
                .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
                .and_then(|v| v.as_int()),
            reduction_level: entity.reduction_level(),
        }],
        skill_rows: Vec::new(),
    };

    // Skills for this player
    for (&skill_uid, skill) in &entity.skill_uid_to_dmg_skill {
        let skill_total: u128 = if boss_only {
            // New structure is (skill_id, target_id) -> stats
            // We iterate over all keys, filter by skill_uid and boss target
            entity
                .skill_dmg_to_target
                .iter()
                .filter(|((sid, tuid), _)| *sid == skill_uid && is_boss_target(encounter, tuid))
                .map(|(_, stats)| stats.total_value)
                .sum()
        } else {
            skill.total_value
        };
        #[allow(clippy::cast_precision_loss)]
        let skill_row = SkillRow {
            skill_id: skill_uid,
            name: Skill::get_skill_name(skill_uid),
            total_dmg: skill_total,
            dps: nan_is_zero(skill_total as f64 / time_elapsed_secs),
            dmg_pct: if player_total == 0 {
                0.0
            } else {
                nan_is_zero(skill_total as f64 / player_total as f64 * 100.0)
            },
            crit_rate: nan_is_zero(skill.crit_hits as f64 / skill.hits as f64 * 100.0),
            crit_dmg_rate: nan_is_zero(
                skill.crit_total_value as f64 / skill.total_value as f64 * 100.0,
            ),
            lucky_rate: nan_is_zero(skill.lucky_hits as f64 / skill.hits as f64 * 100.0),
            lucky_dmg_rate: nan_is_zero(
                skill.lucky_total_value as f64 / skill.total_value as f64 * 100.0,
            ),
            hits: skill.hits,
            hits_per_minute: nan_is_zero(skill.hits as f64 / time_elapsed_secs * 60.0),
        };
        skills_window.skill_rows.push(skill_row);
    }

    // Sort skills descending by damage dealt
    skills_window.skill_rows.sort_by(|this_row, other_row| {
        other_row
            .total_dmg
            .partial_cmp(&this_row.total_dmg)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Some(skills_window)
}

pub fn generate_skills_window_heal(
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    player_uid: i64,
    segment_elapsed_ms: Option<u128>,
) -> Option<SkillsWindow> {
    let entity = encounter.entity_uid_to_entity.get(&player_uid)?;
    let (_, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    // Player Heal Stats
    #[allow(clippy::cast_precision_loss)]
    let mut skills_window = SkillsWindow {
        curr_player: vec![PlayerRow {
            uid: player_uid as u128,
            name: prettify_name(player_uid, encounter.local_player_uid, &entity.name, entity_cache),
            class_name: class::get_class_name(entity.class_id),
            class_spec_name: class::get_class_spec(entity.class_spec),
            ability_score: entity.ability_score as u128,
            total_dmg: entity.healing.total,
            dps: nan_is_zero(entity.healing.total as f64 / time_elapsed_secs),
            tdps: 0.0,
            active_time_ms: 0,
            dmg_pct: nan_is_zero(entity.healing.total as f64 / encounter.total_heal as f64 * 100.0),
            crit_rate: nan_is_zero(entity.healing.crit_hits as f64 / entity.healing.hits as f64 * 100.0),
            crit_dmg_rate: nan_is_zero(
                entity.healing.crit_total as f64 / entity.healing.total as f64 * 100.0,
            ),
            lucky_rate: nan_is_zero(
                entity.healing.lucky_hits as f64 / entity.healing.hits as f64 * 100.0,
            ),
            lucky_dmg_rate: nan_is_zero(
                entity.healing.lucky_total as f64 / entity.healing.total as f64 * 100.0,
            ),
            hits: entity.healing.hits,
            hits_per_minute: nan_is_zero(entity.healing.hits as f64 / time_elapsed_secs * 60.0),
            boss_dmg: 0,
            boss_dps: 0.0,
            boss_dmg_pct: 0.0,
            // Extended attributes from Stage 4
            rank_level: entity.rank_level(),
            current_hp: entity.hp(),
            max_hp: entity.max_hp(),
            crit_stat: entity.crit(),
            lucky_stat: entity.lucky(),
            haste: entity.haste(),
            mastery: entity.mastery(),
            element_flag: entity
                .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
                .and_then(|v| v.as_int()),
            energy_flag: entity
                .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
                .and_then(|v| v.as_int()),
            reduction_level: entity.reduction_level(),
        }],
        skill_rows: Vec::new(),
    };

    // Skills for this player
    for (&skill_uid, skill) in &entity.skill_uid_to_heal_skill {
        #[allow(clippy::cast_precision_loss)]
        let skill_row = SkillRow {
            skill_id: skill_uid,
            name: Skill::get_skill_name(skill_uid),
            total_dmg: skill.total_value,
            dps: nan_is_zero(skill.total_value as f64 / time_elapsed_secs),
            dmg_pct: nan_is_zero(skill.total_value as f64 / entity.healing.total as f64 * 100.0),
            crit_rate: nan_is_zero(skill.crit_hits as f64 / skill.hits as f64 * 100.0),
            crit_dmg_rate: nan_is_zero(
                skill.crit_total_value as f64 / skill.total_value as f64 * 100.0,
            ),
            lucky_rate: nan_is_zero(skill.lucky_hits as f64 / skill.hits as f64 * 100.0),
            lucky_dmg_rate: nan_is_zero(
                skill.lucky_total_value as f64 / skill.total_value as f64 * 100.0,
            ),
            hits: skill.hits,
            hits_per_minute: nan_is_zero(skill.hits as f64 / time_elapsed_secs * 60.0),
        };
        skills_window.skill_rows.push(skill_row);
    }

    // Sort skills descending by heal dealt
    skills_window.skill_rows.sort_by(|this_row, other_row| {
        other_row
            .total_dmg
            .partial_cmp(&this_row.total_dmg)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Some(skills_window)
}

pub fn generate_skills_window_tanked(
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    player_uid: i64,
    segment_elapsed_ms: Option<u128>,
) -> Option<SkillsWindow> {
    let entity = encounter.entity_uid_to_entity.get(&player_uid)?;
    let (_, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    // Player Tanked Stats
    #[allow(clippy::cast_precision_loss)]
    let mut skills_window = SkillsWindow {
        curr_player: vec![PlayerRow {
            uid: player_uid as u128,
            name: prettify_name(player_uid, encounter.local_player_uid, &entity.name, entity_cache),
            class_name: class::get_class_name(entity.class_id),
            class_spec_name: class::get_class_spec(entity.class_spec),
            ability_score: entity.ability_score as u128,
            total_dmg: entity.taken.total,
            dps: nan_is_zero(entity.taken.total as f64 / time_elapsed_secs),
            tdps: 0.0,
            active_time_ms: 0,
            dmg_pct: 100.0, // Always 100% for the current player view
            crit_rate: nan_is_zero(
                entity.taken.crit_hits as f64 / entity.taken.hits as f64 * 100.0,
            ),
            crit_dmg_rate: nan_is_zero(
                entity.taken.crit_total as f64 / entity.taken.total as f64 * 100.0,
            ),
            lucky_rate: nan_is_zero(
                entity.taken.lucky_hits as f64 / entity.taken.hits as f64 * 100.0,
            ),
            lucky_dmg_rate: nan_is_zero(
                entity.taken.lucky_total as f64 / entity.taken.total as f64 * 100.0,
            ),
            hits: entity.taken.hits,
            hits_per_minute: nan_is_zero(entity.taken.hits as f64 / time_elapsed_secs * 60.0),
            boss_dmg: 0,
            boss_dps: 0.0,
            boss_dmg_pct: 0.0,
            // Extended attributes from Stage 4
            rank_level: entity.rank_level(),
            current_hp: entity.hp(),
            max_hp: entity.max_hp(),
            crit_stat: entity.crit(),
            lucky_stat: entity.lucky(),
            haste: entity.haste(),
            mastery: entity.mastery(),
            element_flag: entity
                .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
                .and_then(|v| v.as_int()),
            energy_flag: entity
                .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
                .and_then(|v| v.as_int()),
            reduction_level: entity.reduction_level(),
        }],
        skill_rows: Vec::new(),
    };

    // Skills for this player (damage taken from various sources)
    for (&skill_uid, skill) in &entity.skill_uid_to_taken_skill {
        #[allow(clippy::cast_precision_loss)]
        let skill_row = SkillRow {
            skill_id: skill_uid,
            name: Skill::get_skill_name(skill_uid),
            total_dmg: skill.total_value,
            dps: nan_is_zero(skill.total_value as f64 / time_elapsed_secs),
            dmg_pct: nan_is_zero(skill.total_value as f64 / entity.taken.total as f64 * 100.0),
            crit_rate: nan_is_zero(skill.crit_hits as f64 / skill.hits as f64 * 100.0),
            crit_dmg_rate: nan_is_zero(
                skill.crit_total_value as f64 / skill.total_value as f64 * 100.0,
            ),
            lucky_rate: nan_is_zero(skill.lucky_hits as f64 / skill.hits as f64 * 100.0),
            lucky_dmg_rate: nan_is_zero(
                skill.lucky_total_value as f64 / skill.total_value as f64 * 100.0,
            ),
            hits: skill.hits,
            hits_per_minute: nan_is_zero(skill.hits as f64 / time_elapsed_secs * 60.0),
        };
        skills_window.skill_rows.push(skill_row);
    }

    // Sort skills descending by damage taken
    skills_window.skill_rows.sort_by(|this_row, other_row| {
        other_row
            .total_dmg
            .partial_cmp(&this_row.total_dmg)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Some(skills_window)
}

fn prettify_name(
    player_uid: i64,
    local_player_uid: i64,
    player_name: &str,
    entity_cache: &HashMap<i64, CachedEntity>,
) -> String {
    // If entity name is empty, try in-memory entity cache first.
    let effective_name = if player_name.is_empty() {
        entity_cache
            .get(&player_uid)
            .and_then(|cached| cached.name.clone())
            .unwrap_or_default()
    } else {
        player_name.to_string()
    };

    if player_uid == local_player_uid && effective_name.is_empty() {
        String::from("You")
    } else if player_uid == local_player_uid && !effective_name.is_empty() {
        format!("{effective_name} (You)")
    } else if effective_name.is_empty() {
        format!("#{player_uid}")
    } else {
        effective_name
    }
}

fn nan_is_zero(value: f64) -> f64 {
    if value.is_nan() || value.is_infinite() {
        0.0
    } else {
        value
    }
}

fn resolve_elapsed(encounter: &Encounter, segment_elapsed_ms: Option<u128>) -> (u128, f64) {
    let elapsed_ms = segment_elapsed_ms.unwrap_or_else(|| {
        encounter
            .time_last_combat_packet_ms
            .saturating_sub(encounter.time_fight_start_ms)
    });

    #[allow(clippy::cast_precision_loss)]
    let elapsed_secs = elapsed_ms as f64 / 1000.0;

    (elapsed_ms, elapsed_secs)
}

pub fn generate_player_row_filtered(
    entity_uid: i64,
    entity: &Entity,
    encounter: &Encounter,
    entity_cache: &HashMap<i64, CachedEntity>,
    total_scope_dmg: u128,
    total_boss_dmg: u128,
    time_elapsed_secs: f64,
) -> Option<PlayerRow> {
    let is_player = entity.entity_type == EEntityType::EntChar;
    let did_damage = !entity.skill_uid_to_dmg_skill.is_empty();

    if !is_player || !did_damage {
        return None;
    }

    let entity_total: u128 = entity.damage.total;
    let boss_total: u128 = entity
        .dmg_to_target
        .iter()
        .filter(|(tuid, _)| is_boss_target(encounter, tuid))
        .map(|(_, v)| *v)
        .sum();
    if total_scope_dmg == 0 && total_boss_dmg == 0 {
        return None;
    }

    let active_time_ms = entity.active_dmg_time_ms;
    #[allow(clippy::cast_precision_loss)]
    let active_time_secs = if active_time_ms > 0 {
        active_time_ms as f64 / 1000.0
    } else {
        0.0
    };

    #[allow(clippy::cast_precision_loss)]
    Some(PlayerRow {
        uid: entity_uid as u128,
        name: prettify_name(entity_uid, encounter.local_player_uid, &entity.name, entity_cache),
        class_name: class::get_class_name(entity.class_id),
        class_spec_name: class::get_class_spec(entity.class_spec),
        ability_score: entity.ability_score as u128,
        total_dmg: entity_total,
        dps: nan_is_zero(entity_total as f64 / time_elapsed_secs),
        tdps: nan_is_zero(entity_total as f64 / active_time_secs),
        active_time_ms,
        dmg_pct: if total_scope_dmg == 0 {
            0.0
        } else {
            nan_is_zero(entity_total as f64 / total_scope_dmg as f64 * 100.0)
        },
        boss_dmg: boss_total,
        boss_dps: nan_is_zero(boss_total as f64 / time_elapsed_secs),
        boss_dmg_pct: if total_boss_dmg == 0 {
            0.0
        } else {
            nan_is_zero(boss_total as f64 / total_boss_dmg as f64 * 100.0)
        },
        crit_rate: nan_is_zero(entity.damage.crit_hits as f64 / entity.damage.hits as f64 * 100.0),
        crit_dmg_rate: nan_is_zero(entity.damage.crit_total as f64 / entity.damage.total as f64 * 100.0),
        lucky_rate: nan_is_zero(entity.damage.lucky_hits as f64 / entity.damage.hits as f64 * 100.0),
        lucky_dmg_rate: nan_is_zero(
            entity.damage.lucky_total as f64 / entity.damage.total as f64 * 100.0,
        ),
        hits: entity.damage.hits,
        hits_per_minute: nan_is_zero(entity.damage.hits as f64 / time_elapsed_secs * 60.0),
        // Extended attributes from Stage 4
        rank_level: entity.rank_level(),
        current_hp: entity.hp(),
        max_hp: entity.max_hp(),
        crit_stat: entity.crit(),
        lucky_stat: entity.lucky(),
        haste: entity.haste(),
        mastery: entity.mastery(),
        element_flag: entity
            .get_attr(crate::live::opcodes_models::AttrType::ElementFlag)
            .and_then(|v| v.as_int()),
        energy_flag: entity
            .get_attr(crate::live::opcodes_models::AttrType::EnergyFlag)
            .and_then(|v| v.as_int()),
        reduction_level: entity.reduction_level(),
    })
}

pub fn generate_header_info(
    encounter: &Encounter,
    boss_only: bool,
    segment_timing: Option<(u128, u128)>,
) -> Option<(HeaderInfo, Vec<(i64, String)>)> {
    let segment_elapsed_ms = segment_timing.as_ref().map(|(_, elapsed)| *elapsed);
    let segment_start_ms = segment_timing.as_ref().map(|(start, _)| *start);
    let (time_elapsed_ms, time_elapsed_secs) = resolve_elapsed(encounter, segment_elapsed_ms);

    let total_scope_dmg: u128 = if boss_only {
        encounter
            .entity_uid_to_entity
            .iter()
            .filter(|(_, e)| e.entity_type == EEntityType::EntChar)
            .map(|(_, e)| {
                e.dmg_to_target
                    .iter()
                    .filter(|(tuid, _)| is_boss_target(encounter, tuid))
                    .map(|(_, v)| *v)
                    .sum::<u128>()
            })
            .sum()
    } else {
        encounter.total_dmg
    };

    // Calculate team DPS for boss death detection
    #[allow(clippy::cast_precision_loss)]
    let team_dps = nan_is_zero(total_scope_dmg as f64 / time_elapsed_secs);

    let mut dead_bosses: Vec<(i64, String)> = Vec::new();
    let mut bosses: Vec<BossHealth> = encounter
        .entity_uid_to_entity
        .iter()
        .filter_map(|(&uid, entity)| {
            if entity.is_boss() {
                let current_hp = entity.hp();
                let max_hp = entity.max_hp();

                // Filter out bosses without HP attributes (cleared after reset)
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

                // Boss death detection: if boss has <5% HP and team DPS is high enough, assume boss is dead
                let is_dead = if let (Some(curr_hp), Some(max_hp_val)) = (current_hp, max_hp) {
                    if max_hp_val > 0 {
                        let hp_percent = (curr_hp as f64 / max_hp_val as f64) * 100.0;
                        // If boss is below 5% HP and team DPS is at least 10k, assume dead
                        hp_percent < 5.0 && team_dps >= 5000.0
                    } else {
                        false
                    }
                } else {
                    false
                };

                if is_dead {
                    dead_bosses.push((uid, name.clone()));
                }

                Some(BossHealth {
                    uid,
                    name,
                    // Set HP to 0 if boss is detected as dead
                    current_hp: if is_dead { Some(0) } else { current_hp },
                    max_hp,
                })
            } else {
                None
            }
        })
        .collect();

    bosses.sort_by_key(|boss| boss.uid);

    #[allow(clippy::cast_precision_loss)]
    Some((
        HeaderInfo {
            total_dps: team_dps,
            total_dmg: total_scope_dmg,
            elapsed_ms: time_elapsed_ms,
            fight_start_timestamp_ms: segment_start_ms.unwrap_or(encounter.time_fight_start_ms),
            bosses,
            scene_id: encounter.current_scene_id,
            scene_name: encounter.current_scene_name.clone(),
            current_segment_type: None,
            current_segment_name: None,
        },
        dead_bosses,
    ))
}
