use crate::live::commands_models::{
    BossHealth, BuffUpdateState, CounterUpdateState, FightResourceState, HateEntry, HeaderInfo,
    LiveDataPayload, PanelAttrState, RawEntityData, SkillCdState, TrainingDummyState,
    to_raw_combat_stats, to_raw_skill_stats,
};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::opcodes_models::{AttrType, Encounter, class};
use blueprotobuf_lib::blueprotobuf::EEntityType;
use log::{trace, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

/// Safely emits an event to the frontend, handling WebView2 state errors gracefully.
/// This prevents the app from freezing when the WebView is in an invalid state
/// (e.g., minimized, hidden, or transitioning).
///
/// Returns `true` if the event was emitted successfully, `false` otherwise.
#[allow(dead_code)]
pub(crate) fn safe_emit<S: Serialize + Clone>(
    app_handle: &AppHandle,
    event: &str,
    payload: S,
) -> bool {
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
            let error_msg = e.to_string();
            if error_msg.contains("0x8007139F") || error_msg.contains("not in the correct state") {
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

pub(crate) fn safe_emit_to<S: Serialize + Clone>(
    app_handle: &AppHandle,
    target_label: &str,
    event: &str,
    payload: S,
) -> bool {
    let Some(window) = app_handle.get_webview_window(target_label) else {
        trace!(
            "Skipping emit for '{}': target window '{}' unavailable",
            event, target_label
        );
        return false;
    };

    match window.emit(event, payload) {
        Ok(_) => true,
        Err(e) => {
            let error_msg = e.to_string();
            if error_msg.contains("0x8007139F") || error_msg.contains("not in the correct state") {
                trace!(
                    "WebView2 not ready for '{}' on '{}' (window may be minimized/hidden)",
                    event, target_label
                );
            } else {
                warn!("Failed to emit '{}' to '{}': {}", event, target_label, e);
            }
            false
        }
    }
}

/// Manages events and emits them to the frontend.
#[derive(Debug)]
pub struct EventManager {
    outbound_events: Vec<OutboundEvent>,
}

#[derive(Debug, Clone)]
pub enum OutboundEvent {
    EncounterUpdate {
        header_info: HeaderInfo,
        is_paused: bool,
    },
    EncounterReset,
    EncounterPause(bool),
    SceneChange(String),
    TrainingDummyUpdate(TrainingDummyState),
    LiveData(LiveDataPayload),
    BuffUpdate(Vec<BuffUpdateState>),
    BossBuffUpdate(HashMap<i64, Vec<BuffUpdateState>>),
    HateListUpdate(HashMap<i64, Vec<HateEntry>>),
    EntityNameMap {
        names: HashMap<i64, String>,
    },
    BuffCounterUpdate(Vec<CounterUpdateState>),
    SkillCdUpdate(Vec<SkillCdState>),
    PanelAttrUpdate(Vec<PanelAttrState>),
    FightResourceUpdate(FightResourceState),
}

impl EventManager {
    /// Creates a new `EventManager`.
    pub fn new() -> Self {
        Self {
            outbound_events: Vec::with_capacity(16),
        }
    }

    /// Emits an encounter update event.
    ///
    /// # Arguments
    ///
    /// * `header_info` - The header information for the encounter.
    /// * `is_paused` - Whether the encounter is paused.
    pub fn emit_encounter_update(&mut self, header_info: HeaderInfo, is_paused: bool) {
        self.outbound_events.push(OutboundEvent::EncounterUpdate {
            header_info,
            is_paused,
        });
    }

    /// Emits an encounter reset event.
    pub fn emit_encounter_reset(&mut self) {
        self.outbound_events.push(OutboundEvent::EncounterReset);
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
    pub fn emit_encounter_pause(&mut self, is_paused: bool) {
        self.outbound_events
            .push(OutboundEvent::EncounterPause(is_paused));
    }

    /// Emits a scene change event.
    ///
    /// # Arguments
    ///
    /// * `scene_name` - The name of the new scene.
    pub fn emit_scene_change(&mut self, scene_name: String) {
        self.outbound_events
            .push(OutboundEvent::SceneChange(scene_name));
    }

    pub fn emit_training_dummy_update(&mut self, training_dummy: TrainingDummyState) {
        self.outbound_events
            .push(OutboundEvent::TrainingDummyUpdate(training_dummy));
    }

    /// Returns whether the `EventManager` should emit events.
    pub fn should_emit_events(&self) -> bool {
        true
    }

    pub fn emit_live_data(&mut self, payload: LiveDataPayload) {
        self.outbound_events.push(OutboundEvent::LiveData(payload));
    }

    pub fn emit_buff_update(&mut self, buffs: Vec<BuffUpdateState>) {
        self.outbound_events.push(OutboundEvent::BuffUpdate(buffs));
    }

    pub fn emit_boss_buff_update(&mut self, boss_buffs: HashMap<i64, Vec<BuffUpdateState>>) {
        self.outbound_events
            .push(OutboundEvent::BossBuffUpdate(boss_buffs));
    }

    pub fn emit_hate_list_update(&mut self, hate_lists: HashMap<i64, Vec<HateEntry>>) {
        self.outbound_events
            .push(OutboundEvent::HateListUpdate(hate_lists));
    }

    pub fn emit_entity_name_map(&mut self, names: HashMap<i64, String>) {
        self.outbound_events
            .push(OutboundEvent::EntityNameMap { names });
    }

    pub fn emit_buff_counter_update(&mut self, counters: Vec<CounterUpdateState>) {
        self.outbound_events
            .push(OutboundEvent::BuffCounterUpdate(counters));
    }

    pub fn emit_skill_cd_update(&mut self, cds: Vec<SkillCdState>) {
        self.outbound_events.push(OutboundEvent::SkillCdUpdate(cds));
    }

    pub fn emit_panel_attr_update(&mut self, attrs: Vec<PanelAttrState>) {
        self.outbound_events
            .push(OutboundEvent::PanelAttrUpdate(attrs));
    }

    pub fn emit_fight_resource_update(&mut self, fight_res: FightResourceState) {
        self.outbound_events
            .push(OutboundEvent::FightResourceUpdate(fight_res));
    }

    pub fn drain_outbound_events(&mut self) -> Vec<OutboundEvent> {
        std::mem::take(&mut self.outbound_events)
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
    attr_store: &EntityAttrStore,
) -> LiveDataPayload {
    let elapsed_ms = encounter
        .time_last_combat_packet_ms
        .saturating_sub(encounter.time_fight_start_ms);
    let active_combat_time_ms = encounter.active_combat_time_ms.min(elapsed_ms);

    let mut entities = Vec::with_capacity(encounter.entity_uid_to_entity.len());
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
            name: attr_store
                .attr(uid, AttrType::Name)
                .and_then(|value| value.as_string())
                .unwrap_or(&entity.name)
                .to_string(),
            class_id: attr_store
                .attr(uid, AttrType::ProfessionId)
                .and_then(|value| value.as_int())
                .map_or(entity.class_id, |value| value as i32),
            class_spec: entity.class_spec as i32,
            class_name: class::get_class_name(
                attr_store
                    .attr(uid, AttrType::ProfessionId)
                    .and_then(|value| value.as_int())
                    .map_or(entity.class_id, |value| value as i32),
            ),
            class_spec_name: class::get_class_spec(entity.class_spec),
            ability_score: attr_store
                .attr(uid, AttrType::FightPoint)
                .and_then(|value| value.as_int())
                .map_or(entity.ability_score, |value| value as i32),
            season_strength: attr_store
                .attr(uid, AttrType::SeasonStrength)
                .and_then(|value| value.as_int())
                .map_or(0, |value| value as i32),
            damage: to_raw_combat_stats(&entity.damage),
            damage_boss_only: to_raw_combat_stats(&entity.damage_boss_only),
            healing: to_raw_combat_stats(&entity.healing),
            taken: to_raw_combat_stats(&entity.taken),
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

            if attr_store.is_dead(uid) {
                return None;
            }

            let current_hp = attr_store
                .attr(uid, AttrType::CurrentHp)
                .and_then(|value| value.as_int());
            let max_hp = attr_store
                .attr(uid, AttrType::MaxHp)
                .and_then(|value| value.as_int());
            if current_hp.is_none() && max_hp.is_none() {
                return None;
            }

            let name = if let Some(attr_name) = attr_store
                .attr(uid, AttrType::Name)
                .and_then(|value| value.as_string())
            {
                attr_name.to_string()
            } else if !entity.name.is_empty() {
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
                is_dead: attr_store.is_dead(uid),
            })
        })
        .collect();
    bosses.sort_by_key(|boss| boss.uid);

    LiveDataPayload {
        elapsed_ms,
        active_combat_time_ms,
        fight_start_timestamp_ms: encounter.time_fight_start_ms,
        total_dmg: encounter.total_dmg,
        total_dmg_boss_only: encounter.total_dmg_boss_only,
        total_heal: encounter.total_heal,
        total_effective_heal: encounter.total_effective_heal,
        local_player_uid: encounter.local_player_uid,
        scene_id: encounter.current_scene_id,
        scene_name: encounter.current_scene_name.clone(),
        is_paused: encounter.is_encounter_paused,
        bosses,
        entities,
    }
}
