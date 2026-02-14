use crate::database::{
    ActorAggData, BossAggData, DbTask, EncounterAggData, SkillAggData, enqueue, now_ms,
};
use crate::live::attempt_detector::AttemptConfig;
use crate::live::commands_models::{
    BuffUpdatePayload, BuffUpdateState, FightResourceState, FightResourceUpdatePayload,
    SkillCdState, SkillCdUpdatePayload,
};
use crate::live::cd_calc::calculate_skill_cd;
use crate::live::dungeon_log::{self, DungeonLogRuntime, SegmentType, SharedDungeonLog};
use crate::live::event_manager::{EventManager, MetricType};
use crate::live::opcodes_models::Encounter;
use crate::live::player_names::PlayerNames;
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::{
    BuffChange, BuffEffectSync, BuffInfo, EBuffEffectLogicPbType, EBuffEventType, EEntityType,
};
use log::{info, trace, warn};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use prost::Message;

/// Safely emits an event to the frontend, handling WebView2 state errors gracefully.
/// This prevents the app from freezing when the WebView is in an invalid state, maybe.
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

pub(crate) fn build_encounter_snapshot(
    encounter: &Encounter,
    local_player_id: i64,
) -> EncounterAggData {
    let mut actors = Vec::new();
    let mut damage_skills = Vec::new();
    let mut heal_skills = Vec::new();
    let mut bosses_map: HashMap<String, BossAggData> = HashMap::new();

    for (uid, entity) in &encounter.entity_uid_to_entity {
        let is_player = entity.entity_type == EEntityType::EntChar;
        if !is_player {
            continue;
        }

        // Serialize attributes to JSON string for storage
        let attributes_json = crate::live::opcodes_process::serialize_attributes(entity);

        actors.push(ActorAggData {
            actor_id: *uid,
            name: if entity.name.is_empty() {
                None
            } else {
                Some(entity.name.clone())
            },
            class_id: Some(entity.class_id),
            class_spec: Some(entity.class_spec as i32),
            ability_score: Some(entity.ability_score),
            level: Some(entity.level),
            is_player: true,
            is_local_player: *uid == local_player_id,
            attributes: attributes_json,
            damage_dealt: entity.total_dmg.min(i64::MAX as u128) as i64,
            hits_dealt: entity.hits_dmg.min(i64::MAX as u128) as i64,
            crit_hits_dealt: entity.crit_hits_dmg.min(i64::MAX as u128) as i64,
            lucky_hits_dealt: entity.lucky_hits_dmg.min(i64::MAX as u128) as i64,
            crit_total_dealt: entity.crit_total_dmg.min(i64::MAX as u128) as i64,
            lucky_total_dealt: entity.lucky_total_dmg.min(i64::MAX as u128) as i64,
            boss_damage_dealt: entity.total_dmg_boss_only.min(i64::MAX as u128) as i64,
            boss_hits_dealt: entity.hits_dmg_boss_only.min(i64::MAX as u128) as i64,
            boss_crit_hits_dealt: entity.crit_hits_dmg_boss_only.min(i64::MAX as u128) as i64,
            boss_lucky_hits_dealt: entity.lucky_hits_dmg_boss_only.min(i64::MAX as u128) as i64,
            boss_crit_total_dealt: entity.crit_total_dmg_boss_only.min(i64::MAX as u128) as i64,
            boss_lucky_total_dealt: entity.lucky_total_dmg_boss_only.min(i64::MAX as u128) as i64,
            heal_dealt: entity.total_heal.min(i64::MAX as u128) as i64,
            hits_heal: entity.hits_heal.min(i64::MAX as u128) as i64,
            crit_hits_heal: entity.crit_hits_heal.min(i64::MAX as u128) as i64,
            lucky_hits_heal: entity.lucky_hits_heal.min(i64::MAX as u128) as i64,
            crit_total_heal: entity.crit_total_heal.min(i64::MAX as u128) as i64,
            lucky_total_heal: entity.lucky_total_heal.min(i64::MAX as u128) as i64,
            damage_taken: entity.total_taken.min(i64::MAX as u128) as i64,
            hits_taken: entity.hits_taken.min(i64::MAX as u128) as i64,
            crit_hits_taken: entity.crit_hits_taken.min(i64::MAX as u128) as i64,
            lucky_hits_taken: entity.lucky_hits_taken.min(i64::MAX as u128) as i64,
            crit_total_taken: entity.crit_total_taken.min(i64::MAX as u128) as i64,
            lucky_total_taken: entity.lucky_total_taken.min(i64::MAX as u128) as i64,
            active_dmg_time_ms: entity.active_dmg_time_ms.min(i64::MAX as u128) as i64,
            revives: 0, // Revives are tracked separately via upsert_stats_add_revive
        });

        // Collect damage skills (grouped by target)
        for ((skill_id, target_id), stats) in &entity.skill_dmg_to_target {
            damage_skills.push(SkillAggData {
                actor_id: *uid,
                target_id: Some(*target_id),
                skill_id: *skill_id,
                monster_name: stats.monster_name.clone(),
                hits: stats.hits.min(i32::MAX as u128) as i32,
                total_value: stats.total_value.min(i64::MAX as u128) as i64,
                crit_hits: stats.crit_hits.min(i32::MAX as u128) as i32,
                lucky_hits: stats.lucky_hits.min(i32::MAX as u128) as i32,
                crit_total: stats.crit_total.min(i64::MAX as u128) as i64,
                lucky_total: stats.lucky_total.min(i64::MAX as u128) as i64,
                hp_loss_total: stats.hp_loss_total.min(i64::MAX as u128) as i64,
                shield_loss_total: stats.shield_loss_total.min(i64::MAX as u128) as i64,
            });

            // Accumulate boss stats if this target has a monster name
            if let Some(ref name) = stats.monster_name {
                let boss = bosses_map.entry(name.clone()).or_insert_with(|| BossAggData {
                    monster_name: name.clone(),
                    hits: 0,
                    total_damage: 0,
                    max_hp: None,
                    is_defeated: false,
                });
                boss.hits = boss.hits.saturating_add(stats.hits.min(i32::MAX as u128) as i32);
                boss.total_damage = boss
                    .total_damage
                    .saturating_add(stats.total_value.min(i64::MAX as u128) as i64);
            }
        }

        // Collect heal skills (grouped by target)
        for ((skill_id, target_id), stats) in &entity.skill_heal_to_target {
            heal_skills.push(SkillAggData {
                actor_id: *uid,
                target_id: Some(*target_id),
                skill_id: *skill_id,
                monster_name: None,
                hits: stats.hits.min(i32::MAX as u128) as i32,
                total_value: stats.total_value.min(i64::MAX as u128) as i64,
                crit_hits: stats.crit_hits.min(i32::MAX as u128) as i32,
                lucky_hits: stats.lucky_hits.min(i32::MAX as u128) as i32,
                crit_total: stats.crit_total.min(i64::MAX as u128) as i64,
                lucky_total: stats.lucky_total.min(i64::MAX as u128) as i64,
                hp_loss_total: 0,
                shield_loss_total: 0,
            });
        }
    }

    EncounterAggData {
        total_dmg: encounter.total_dmg.min(i64::MAX as u128) as i64,
        total_heal: encounter.total_heal.min(i64::MAX as u128) as i64,
        combat_duration_ms: encounter
            .time_last_combat_packet_ms
            .saturating_sub(encounter.time_fight_start_ms)
            .min(i64::MAX as u128) as i64,
        actors,
        damage_skills,
        heal_skills,
        bosses: bosses_map.into_values().collect(),
    }
}

/// Represents the possible events that can be handled by the state manager.
#[derive(Debug, Clone)]
pub enum StateEvent {
    /// A server change event.
    ServerChange,
    /// An enter scene event.
    EnterScene(blueprotobuf::EnterScene),
    /// A sync near entities event.
    SyncNearEntities(blueprotobuf::SyncNearEntities),
    /// A sync container data event.
    SyncContainerData(blueprotobuf::SyncContainerData),
    /// A sync container dirty data event.
    SyncContainerDirtyData(blueprotobuf::SyncContainerDirtyData),
    /// A sync server time event.
    SyncServerTime(blueprotobuf::SyncServerTime),
    /// A sync to me delta info event.
    SyncToMeDeltaInfo(blueprotobuf::SyncToMeDeltaInfo),
    /// A sync near delta info event.
    SyncNearDeltaInfo(blueprotobuf::SyncNearDeltaInfo),
    /// A notify revive user event.
    NotifyReviveUser(blueprotobuf::NotifyReviveUser),
    /// A sync scene attrs event.
    #[allow(dead_code)]
    SyncSceneAttrs(blueprotobuf::SyncSceneAttrs),
    /// A pause encounter event.
    PauseEncounter(bool),
    /// A reset encounter event. Contains whether this was a manual reset by the user.
    #[allow(dead_code)]
    ResetEncounter {
        /// Whether this was a manual reset by the user (true) vs automatic (false).
        is_manual: bool,
    },
}

/// Represents the state of the application.
#[derive(Debug)]
pub struct AppState {
    /// The current encounter.
    pub encounter: Encounter,
    /// The event manager.
    pub event_manager: EventManager,
    /// The set of skill subscriptions.
    pub skill_subscriptions: HashSet<(i64, String)>,
    /// Skill cooldown map keyed by skill level ID.
    pub skill_cd_map: HashMap<i32, SkillCdState>,
    /// Ordered list of monitored skill IDs.
    pub monitored_skill_ids: Vec<i32>,
    /// Ordered list of monitored buff base IDs.
    pub monitored_buff_ids: Vec<i32>,
    /// Active buffs keyed by buff UUID.
    pub active_buffs: HashMap<i32, ActiveBuff>,
    /// A handle to the Tauri application instance.
    pub app_handle: AppHandle,
    /// Whether to only show boss DPS.
    pub boss_only_dps: bool,
    /// A map of low HP bosses.
    pub low_hp_bosses: HashMap<i64, u128>,
    /// Whether we've already handled the first scene change after startup.
    pub initial_scene_change_handled: bool,
    /// Shared dungeon log used for segment tracking.
    pub dungeon_log: SharedDungeonLog,
    /// Feature flag for dungeon segment tracking.
    pub dungeon_segments_enabled: bool,
    /// Configuration for attempt detection.
    pub attempt_config: AttemptConfig,
    /// Event update rate in milliseconds (default: 200ms). Controls how often events are emitted to frontend.
    pub event_update_rate_ms: u64,
    /// Current fight resource state.
    pub fight_res_state: Option<FightResourceState>,
    /// TempAttr values keyed by TempAttr id.
    pub temp_attr_values: HashMap<i32, i32>,
    /// AttrSkillCD (11750) fixed cooldown reduction.
    pub attr_skill_cd: i32,
    /// AttrSkillCDPCT (11760) cooldown percentage reduction in per-10k units.
    pub attr_skill_cd_pct: i32,
    /// AttrCdAcceleratePct (11960) skill acceleration in per-10k units.
    pub attr_cd_accelerate_pct: i32,
    /// Cached snapshot built from the last emitted live encounter frame.
    pub last_encounter_snapshot: Option<EncounterAggData>,
    /// Monitor All buff?
    pub monitor_all_buff: bool
}

#[derive(Debug, Clone)]
pub struct ActiveBuff {
    pub buff_uuid: i32,
    pub base_id: i32,
    pub layer: i32,
    pub duration: i32,
    pub create_time: i64,
    pub source_config_id: i32,
}

impl AppState {
    /// Creates a new `AppState`.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - A handle to the Tauri application instance.
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            encounter: Encounter::default(),
            event_manager: EventManager::new(),
            skill_subscriptions: HashSet::new(),
            skill_cd_map: HashMap::new(),
            monitored_skill_ids: Vec::new(),
            monitored_buff_ids: Vec::new(),
            monitor_all_buff: false,
            active_buffs: HashMap::new(),
            app_handle,
            boss_only_dps: false,
            low_hp_bosses: HashMap::new(),
            initial_scene_change_handled: false,
            dungeon_log: dungeon_log::create_shared_log(),
            dungeon_segments_enabled: false,
            attempt_config: AttemptConfig::default(),
            event_update_rate_ms: 200,
            fight_res_state: None,
            temp_attr_values: HashMap::new(),
            attr_skill_cd: 0,
            attr_skill_cd_pct: 0,
            attr_cd_accelerate_pct: 0,
            last_encounter_snapshot: None,
        }
    }

    /// Returns whether the encounter is paused.
    pub fn is_encounter_paused(&self) -> bool {
        self.encounter.is_encounter_paused
    }

    /// Sets whether the encounter is paused.
    ///
    /// # Arguments
    ///
    /// * `paused` - Whether the encounter is paused.
    pub fn set_encounter_paused(&mut self, paused: bool) {
        self.encounter.is_encounter_paused = paused;
        self.event_manager.emit_encounter_pause(paused);
    }
}

fn decode_attr_i32(attrs: &blueprotobuf::AttrCollection, attr_id: i32) -> Option<i32> {
    let attr = attrs.attrs.iter().find(|a| a.id == Some(attr_id))?;
    match attr.raw_data.as_ref() {
        // Server may send "key exists, value absent" as an explicit clear signal.
        None => Some(0),
        Some(raw) if raw.is_empty() => Some(0),
        Some(raw) => {
            let mut buf = raw.as_slice();
            prost::encoding::decode_varint(&mut buf)
                .ok()
                .and_then(|v| i32::try_from(v).ok())
        }
    }
}

fn recalculate_cached_skill_cds(state: &mut AppState) {
    for cd in state.skill_cd_map.values_mut() {
        if cd.duration > 0 {
            let (calculated_duration, cd_accelerate_rate) = calculate_skill_cd(
                cd.duration as f32,
                cd.skill_level_id,
                &state.temp_attr_values,
                state.attr_skill_cd as f32,
                state.attr_skill_cd_pct as f32,
                state.attr_cd_accelerate_pct as f32,
            );
            cd.calculated_duration = calculated_duration.round() as i32;
            cd.cd_accelerate_rate = cd_accelerate_rate;
        } else {
            cd.calculated_duration = cd.duration;
            cd.cd_accelerate_rate = 0.0;
        }
    }
}

fn build_filtered_skill_cds(state: &AppState) -> Vec<SkillCdState> {
    if state.monitored_skill_ids.is_empty() {
        return Vec::new();
    }
    state
        .monitored_skill_ids
        .iter()
        .filter_map(|monitored_skill_id| {
            state
                .skill_cd_map
                .values()
                .filter(|cd| cd.skill_level_id / 100 == *monitored_skill_id)
                .max_by_key(|cd| cd.received_at)
                .cloned()
        })
        .collect()
}

fn emit_skill_cd_update_if_needed(state: &AppState, payload: Vec<SkillCdState>) {
    if payload.is_empty() {
        return;
    }
    if let Some(app_handle) = state.event_manager.get_app_handle() {
        info!(
            "[skill-cd] emit update for {} skills (monitored={:?})",
            payload.len(),
            state.monitored_skill_ids
        );
        info!("[skill-cd] payload={:?}", payload);
        safe_emit(
            &app_handle,
            "skill-cd-update",
            SkillCdUpdatePayload { skill_cds: payload },
        );
    }
}

/// Helper: try to find a known scene id by scanning varints at every offset in binary data
fn find_scene_id_in_bytes(data: &[u8]) -> Option<i32> {
    use crate::live::scene_names;

    // 1) Try protobuf varint decoding at every offset
    for offset in 0..data.len() {
        let mut slice = &data[offset..];
        if let Ok(v) = prost::encoding::decode_varint(&mut slice) {
            if v <= i32::MAX as u64 {
                let cand = v as i32;
                if scene_names::contains(cand) {
                    return Some(cand);
                }
            }
        }
    }

    // 2) Try 4-byte little-endian and big-endian ints
    if data.len() >= 4 {
        for i in 0..=data.len() - 4 {
            let le = i32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
            if le > 0 && scene_names::contains(le) {
                return Some(le);
            }
            let be = i32::from_be_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
            if be > 0 && scene_names::contains(be) {
                return Some(be);
            }
        }
    }

    // 3) Try ASCII decimal substrings of length 2..6
    let mut i = 0;
    while i < data.len() {
        if data[i].is_ascii_digit() {
            let start = i;
            i += 1;
            while i < data.len() && data[i].is_ascii_digit() {
                i += 1;
            }
            let len_digits = i - start;
            if len_digits >= 2 && len_digits <= 6 {
                if let Ok(s) = std::str::from_utf8(&data[start..i]) {
                    if let Ok(v) = s.parse::<i32>() {
                        if scene_names::contains(v) {
                            return Some(v);
                        }
                    }
                }
            }
        } else {
            i += 1;
        }
    }

    None
}

/// Extracts scene ID from an AttrCollection by scanning attrs and map_attrs
fn extract_scene_id_from_attr_collection(attrs: &blueprotobuf::AttrCollection) -> Option<i32> {
    use crate::live::scene_names;

    // Check simple attrs (varint or length-prefixed)
    for attr in &attrs.attrs {
        if let Some(raw) = &attr.raw_data {
            // If attr id suggests a scene id, prefer that first
            if let Some(attr_id) = attr.id {
                // Prefer ATTR_ID (0x0a) which contains numeric identifiers.
                // Do NOT treat ATTR_NAME (0x01) as a varint: its raw_data is a
                // length-prefixed string and decoding it as a varint can yield
                // the string length (false positive scene id).
                if attr_id == crate::live::opcodes_models::attr_type::ATTR_ID {
                    let mut buf = raw.as_slice();
                    if let Ok(v) = prost::encoding::decode_varint(&mut buf) {
                        let cand = v as i32;
                        if scene_names::contains(cand) {
                            info!("Found scene_id {} in attr {}", cand, attr_id);
                            return Some(cand);
                        }
                    }
                }
            }

            // Fallback: scan all varints in the raw bytes for a known scene id
            if let Some(cand) = find_scene_id_in_bytes(raw) {
                info!("Found scene_id {} by scanning attr raw bytes", cand);
                return Some(cand);
            }
        }
    }

    // Check map_attrs entries (keys/values may contain the id)
    for map_attr in &attrs.map_attrs {
        for kv in &map_attr.attrs {
            if let Some(val) = &kv.value {
                if let Some(cand) = find_scene_id_in_bytes(val) {
                    info!(
                        "Found scene_id {} in map_attr value (map id {:?})",
                        cand, map_attr.id
                    );
                    return Some(cand);
                }
            }
            if let Some(key) = &kv.key {
                if let Some(cand) = find_scene_id_in_bytes(key) {
                    info!(
                        "Found scene_id {} in map_attr key (map id {:?})",
                        cand, map_attr.id
                    );
                    return Some(cand);
                }
            }
        }
    }

    None
}

/// Manages the state of the application.
#[derive(Clone)]
pub struct AppStateManager {
    /// The state of the application.
    pub state: Arc<RwLock<AppState>>,
}

impl AppStateManager {
    /// Creates a new `AppStateManager`.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - A handle to the Tauri application instance.
    pub fn new(app_handle: AppHandle) -> Self {
        let state = AppState::new(app_handle);
        Self {
            state: Arc::new(RwLock::new(state)),
        }
    }

    /// Handles a state event.
    ///
    /// # Arguments
    ///
    /// * `event` - The event to handle.
    pub async fn handle_event(&self, event: StateEvent) {
        let mut state = self.state.write().await;

        // Check if encounter is paused for events that should be dropped
        if state.is_encounter_paused()
            && matches!(
                event,
                StateEvent::SyncNearEntities(_)
                    | StateEvent::SyncContainerData(_)
                    | StateEvent::SyncContainerDirtyData(_)
                    | StateEvent::SyncToMeDeltaInfo(_)
                    | StateEvent::SyncNearDeltaInfo(_)
            )
        {
            info!("packet dropped due to encounter paused");
            return;
        }

        match event {
            StateEvent::ServerChange => {
                self.on_server_change(&mut state).await;
            }
            StateEvent::EnterScene(data) => {
                self.process_enter_scene(&mut state, data).await;
            }
            StateEvent::SyncNearEntities(data) => {
                self.process_sync_near_entities(&mut state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerData(data) => {
                // store local_player copy
                state.encounter.local_player = data.clone();

                self.process_sync_container_data(&mut state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerDirtyData(data) => {
                self.process_sync_container_dirty_data(&mut state, data)
                    .await;
            }
            StateEvent::SyncServerTime(_data) => {
                // todo: this is skipped, not sure what info it has
            }
            StateEvent::SyncToMeDeltaInfo(data) => {
                self.process_sync_to_me_delta_info(&mut state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncNearDeltaInfo(data) => {
                self.process_sync_near_delta_info(&mut state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::NotifyReviveUser(data) => {
                self.process_notify_revive_user(&mut state, data).await;
            }
            StateEvent::SyncSceneAttrs(_) => {
                // SyncSceneAttrs handling is disabled to possibly remedy crashing bug.
            }
            StateEvent::PauseEncounter(paused) => {
                state.set_encounter_paused(paused);
            }
            StateEvent::ResetEncounter { is_manual } => {
                self.reset_encounter(&mut state, is_manual).await;
            }
        }
    }

    async fn on_server_change(&self, state: &mut AppState) {
        use crate::live::opcodes_process::on_server_change;

        // Persist dungeon segments if enabled
        if state.dungeon_segments_enabled {
            dungeon_log::persist_segments(&state.dungeon_log, true);
        }

        // End any active encounter in DB. Drain any detected dead boss names for persistence.
        let defeated = state.event_manager.take_dead_bosses();
        let encounter_data = state.last_encounter_snapshot.take();
        
        enqueue(DbTask::EndEncounter {
            ended_at_ms: now_ms(),
            defeated_bosses: if defeated.is_empty() {
                None
            } else {
                Some(defeated)
            },
            is_manually_reset: false,
            encounter_data,
        });
        on_server_change(&mut state.encounter);

        // Emit encounter reset event
        if state.event_manager.should_emit_events() {
            state.event_manager.emit_encounter_reset();
            // Clear dead bosses tracking on server change
            state.event_manager.clear_dead_bosses();
        }

        // Clear skill subscriptions
        state.skill_subscriptions.clear();
        state.low_hp_bosses.clear();
    }

    async fn snapshot_segment_and_reset_live_meter(&self, state: &mut AppState) {
        // Persist dungeon segments
        // dungeon_log::persist_segments(&state.dungeon_log, true);

        // Store the original fight start time before reset
        let original_fight_start_ms = state.encounter.time_fight_start_ms;

        // Reset combat state (live meter)
        state.encounter.reset_combat_state();
        state.last_encounter_snapshot = None;
        state.skill_subscriptions.clear();

        // Restore the original fight start time to preserve total encounter duration
        state.encounter.time_fight_start_ms = original_fight_start_ms;

        if state.event_manager.should_emit_events() {
            state.event_manager.emit_encounter_reset();
            // Clear dead bosses tracking for the new segment
            state.event_manager.clear_dead_bosses();

            // Emit an encounter update with cleared state so frontend updates immediately
            use crate::live::commands_models::HeaderInfo;
            let cleared_header = HeaderInfo {
                total_dps: 0.0,
                total_dmg: 0,
                elapsed_ms: 0,
                fight_start_timestamp_ms: 0,
                bosses: vec![],
                scene_id: state.encounter.current_scene_id,
                scene_name: state.encounter.current_scene_name.clone(),
                current_segment_type: None,
                current_segment_name: None,
            };
            state
                .event_manager
                .emit_encounter_update(cleared_header, false);
        }

        state.low_hp_bosses.clear();
    }
    // all scene id extraction logic is here (its pretty rough)
    async fn process_enter_scene(
        &self,
        state: &mut AppState,
        enter_scene: blueprotobuf::EnterScene,
    ) {
        use crate::live::scene_names;

        info!("EnterScene packet received");

        let dungeon_runtime = dungeon_runtime_if_enabled(state);

        if !state.initial_scene_change_handled {
            info!("Initial scene detected; finalizing any dangling encounters");
            enqueue(DbTask::EndAllActiveEncounters {
                ended_at_ms: now_ms(),
            });
            state.initial_scene_change_handled = true;
        }

        // Quick check: if a scene_guid string is present, try to parse digits from it
        if let Some(info) = enter_scene.enter_scene_info.as_ref() {
            if let Some(guid) = &info.scene_guid {
                info!("EnterScene.scene_guid present: {}", guid);
                // Try to extract numeric part of the guid
                let digits: String = guid.chars().filter(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() {
                    if let Ok(v) = digits.parse::<i32>() {
                        if scene_names::contains(v) {
                            info!("Parsed scene id {} from scene_guid", v);
                            // Directly use this id
                            let name = scene_names::lookup(v);
                            state.encounter.current_scene_id = Some(v);
                            state.encounter.current_scene_name = Some(name.clone());
                            if state.event_manager.should_emit_events() {
                                state.event_manager.emit_scene_change(name);
                            }
                            return;
                        }
                    }
                }
            }
            if let Some(connect) = &info.connect_guid {
                info!("EnterScene.connect_guid present: {}", connect);
            }
        }

        // Try several likely locations in the EnterSceneInfo where a scene id might be present
        let mut found_scene: Option<i32> = None;
        if let Some(info) = enter_scene.enter_scene_info.as_ref() {
            // 1) Inspect explicit attr collections (subscene_attrs then scene_attrs)
            for maybe_attrs in [info.subscene_attrs.as_ref(), info.scene_attrs.as_ref()] {
                if let Some(attrs) = maybe_attrs {
                    if let Some(scene_id) = extract_scene_id_from_attr_collection(attrs) {
                        found_scene = Some(scene_id);
                        break;
                    }
                }
            }

            // 2) As a fallback, inspect player_ent.attrs if present
            if found_scene.is_none() {
                if let Some(player_ent) = &info.player_ent {
                    if let Some(player_attrs) = &player_ent.attrs {
                        for attr in &player_attrs.attrs {
                            if let Some(raw) = &attr.raw_data {
                                if let Some(cand) = find_scene_id_in_bytes(raw) {
                                    info!("Found scene_id {} in player_ent attrs", cand);
                                    found_scene = Some(cand);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(scene_id) = found_scene {
            let scene_name = scene_names::lookup(scene_id);
            let prev_scene = state.encounter.current_scene_id;

            // If we have an active encounter and the scene actually changed, end it so we don't leave zombie rows
            if prev_scene.map(|id| id != scene_id).unwrap_or(false)
                && state.encounter.time_fight_start_ms != 0
            {
                info!(
                    "Scene changed from {:?} to {}; checking segment logic",
                    prev_scene, scene_id
                );

                if state.dungeon_segments_enabled {
                    info!(
                        "Dungeon segments enabled: snapshotting segment and resetting live meter"
                    );
                    self.snapshot_segment_and_reset_live_meter(state).await;
                } else {
                    info!("Standard mode: ending active encounter");
                    self.reset_encounter(state, false).await;
                }
            }

            // Update encounter with scene info
            state.encounter.current_scene_id = Some(scene_id);
            state.encounter.current_scene_name = Some(scene_name.clone());

            info!("Scene changed to: {} (ID: {})", scene_name, scene_id);

            // Emit scene change event
            if state.event_manager.should_emit_events() {
                info!("Emitting scene change event for: {}", scene_name);
                state.event_manager.emit_scene_change(scene_name.clone());
            } else {
                warn!("Event manager not ready, skipping scene change emit");
            }

            match dungeon_runtime.as_ref() {
                Some(runtime) => {
                    runtime.reset_for_scene(
                        state.encounter.current_scene_id,
                        state.encounter.current_scene_name.clone(),
                    );
                }
                None => {
                    let _ = dungeon_log::reset_for_scene(
                        &state.dungeon_log,
                        state.encounter.current_scene_id,
                        state.encounter.current_scene_name.clone(),
                    );
                }
            }
        } else {
            warn!(
                "Could not extract scene_id from EnterScene packet - dumping attrs for debugging"
            );

            // Helper to produce a short hex snippet for binary data
            let to_hex_snip = |data: &[u8]| -> String {
                data.iter()
                    .take(16)
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join("")
            };

            if let Some(info) = enter_scene.enter_scene_info.as_ref() {
                for (label, maybe_attrs) in [
                    ("subscene_attrs", info.subscene_attrs.as_ref()),
                    ("scene_attrs", info.scene_attrs.as_ref()),
                ] {
                    if let Some(attrs) = maybe_attrs {
                        info!(
                            "Inspecting {}: uuid={:?}, #attrs={}, #map_attrs={}",
                            label,
                            attrs.uuid,
                            attrs.attrs.len(),
                            attrs.map_attrs.len()
                        );

                        for attr in &attrs.attrs {
                            let id = attr.id.unwrap_or(-1);
                            let len = attr.raw_data.as_ref().map(|b| b.len()).unwrap_or(0);
                            let snip = attr
                                .raw_data
                                .as_ref()
                                .map(|b| to_hex_snip(b))
                                .unwrap_or_default();
                            info!("  attr id={} len={} snippet={}", id, len, snip);
                        }

                        for map_attr in &attrs.map_attrs {
                            info!(
                                "  map_attr id={:?} #entries={}",
                                map_attr.id,
                                map_attr.attrs.len()
                            );
                            for kv in &map_attr.attrs {
                                let key_len = kv.key.as_ref().map(|k| k.len()).unwrap_or(0);
                                let val_len = kv.value.as_ref().map(|v| v.len()).unwrap_or(0);
                                let key_snip =
                                    kv.key.as_ref().map(|k| to_hex_snip(k)).unwrap_or_default();
                                let val_snip = kv
                                    .value
                                    .as_ref()
                                    .map(|v| to_hex_snip(v))
                                    .unwrap_or_default();
                                info!(
                                    "    entry key_len={} val_len={} key_snip={} val_snip={}",
                                    key_len, val_len, key_snip, val_snip
                                );
                            }
                        }
                    }
                }
            }

            // Emit a fallback scene change event so frontend still notifies the user
            let fallback_name = enter_scene
                .enter_scene_info
                .as_ref()
                .and_then(|i| i.scene_guid.clone())
                .map(|g| format!("Scene GUID: {}", g))
                .unwrap_or_else(|| "Unknown Scene".to_string());

            // Explicitly set scene_id to None for fallback scene change
            state.encounter.current_scene_id = None;
            state.encounter.current_scene_name = Some(fallback_name.clone());
            if state.event_manager.should_emit_events() {
                info!("Emitting fallback scene change event: {}", fallback_name);
                state.event_manager.emit_scene_change(fallback_name);
            }

            match dungeon_runtime.as_ref() {
                Some(runtime) => {
                    runtime.reset_for_scene(None, state.encounter.current_scene_name.clone());
                }
                None => {
                    let _ = dungeon_log::reset_for_scene(
                        &state.dungeon_log,
                        None,
                        state.encounter.current_scene_name.clone(),
                    );
                }
            }
        }
    }

    async fn process_sync_near_entities(
        &self,
        state: &mut AppState,
        sync_near_entities: blueprotobuf::SyncNearEntities,
    ) {
        use crate::live::opcodes_process::process_sync_near_entities;
        if process_sync_near_entities(&mut state.encounter, sync_near_entities).is_none() {
            warn!("Error processing SyncNearEntities.. ignoring.");
        }
    }

    #[allow(dead_code)]
    async fn process_sync_scene_attrs(
        &self,
        state: &mut AppState,
        sync_scene_attrs: blueprotobuf::SyncSceneAttrs,
    ) {
        use crate::live::scene_names;

        // Only act as fallback if current scene is unknown/unset
        let should_process = state.encounter.current_scene_id.is_none()
            || state
                .encounter
                .current_scene_name
                .as_ref()
                .map(|name| name.starts_with("Unknown") || name.starts_with("Scene GUID:"))
                .unwrap_or(false);

        if !should_process {
            // Scene already detected, no need to process as fallback
            return;
        }

        let Some(attrs) = sync_scene_attrs.attrs else {
            return;
        };

        let Some(scene_id) = extract_scene_id_from_attr_collection(&attrs) else {
            return;
        };

        // Deduplicate: only update if different from current scene
        if state.encounter.current_scene_id == Some(scene_id) {
            return;
        }

        let scene_name = scene_names::lookup(scene_id);
        info!(
            "[SyncSceneAttrs fallback] Detected scene: {} (ID: {})",
            scene_name, scene_id
        );

        // Update scene info (but don't reset encounter - only update metadata)
        state.encounter.current_scene_id = Some(scene_id);
        state.encounter.current_scene_name = Some(scene_name.clone());

        // Emit scene change event
        if state.event_manager.should_emit_events() {
            info!(
                "[SyncSceneAttrs] Emitting scene change event for: {}",
                scene_name
            );
            state.event_manager.emit_scene_change(scene_name.clone());
        }

        // Update dungeon log scene context if enabled
        let dungeon_runtime = dungeon_runtime_if_enabled(state);
        match dungeon_runtime.as_ref() {
            Some(runtime) => {
                runtime.reset_for_scene(
                    state.encounter.current_scene_id,
                    state.encounter.current_scene_name.clone(),
                );
            }
            None => {
                let _ = dungeon_log::reset_for_scene(
                    &state.dungeon_log,
                    state.encounter.current_scene_id,
                    state.encounter.current_scene_name.clone(),
                );
            }
        }
    }

    async fn process_sync_container_data(
        &self,
        state: &mut AppState,
        sync_container_data: blueprotobuf::SyncContainerData,
    ) {
        use crate::live::opcodes_process::process_sync_container_data;

        if process_sync_container_data(&mut state.encounter, sync_container_data).is_none() {
            warn!("Error processing SyncContainerData.. ignoring.");
        }
    }

    async fn process_sync_container_dirty_data(
        &self,
        state: &mut AppState,
        sync_container_dirty_data: blueprotobuf::SyncContainerDirtyData,
    ) {
        use crate::live::opcodes_process::process_sync_container_dirty_data;
        if process_sync_container_dirty_data(&mut state.encounter, sync_container_dirty_data)
            .is_none()
        {
            warn!("Error processing SyncContainerDirtyData.. ignoring.");
        }
    }

    async fn process_sync_to_me_delta_info(
        &self,
        state: &mut AppState,
        sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    ) {
        use crate::live::opcodes_process::{process_sync_to_me_delta_info, parse_fight_resources};
        use crate::live::opcodes_models::attr_type::{
            ATTR_CD_ACCELERATE_PCT, ATTR_FIGHT_RESOURCES, ATTR_SKILL_CD, ATTR_SKILL_CD_PCT,
        };

        let skill_cds = sync_to_me_delta_info
            .delta_info
            .as_ref()
            .map(|d| d.sync_skill_c_ds.clone())
            .unwrap_or_default();
        let buff_effect_bytes = sync_to_me_delta_info
            .delta_info
            .as_ref()
            .and_then(|d| d.base_delta.as_ref())
            .and_then(|d| d.buff_effect.as_ref())
            .cloned();

        if !skill_cds.is_empty() {
            let ids: Vec<i32> = skill_cds
                .iter()
                .filter_map(|cd| cd.skill_level_id)
                .collect();
            info!(
                "[skill-cd] received {} cd entries, ids={:?}",
                ids.len(),
                ids
            );
        }

        // Check for fight resources
        let fight_res_values = if let Some(ref delta) = sync_to_me_delta_info.delta_info {
            if let Some(ref base) = delta.base_delta {
                if let Some(ref col) = base.attrs {
                    col.attrs.iter()
                        .find(|a| a.id == Some(ATTR_FIGHT_RESOURCES))
                        .and_then(|a| a.raw_data.as_ref())
                        .and_then(|raw| parse_fight_resources(raw))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        if let Some(values) = fight_res_values {
            let now = crate::database::now_ms();
            let new_state = FightResourceState {
                values: values.clone(),
                received_at: now,
            };
            state.fight_res_state = Some(new_state.clone());
            
            if let Some(app_handle) = state.event_manager.get_app_handle() {
                safe_emit(
                    &app_handle,
                    "fight-res-update",
                    FightResourceUpdatePayload { fight_res: new_state },
                );
            }
        }

        let mut should_recalculate = false;
        if let Some(delta) = sync_to_me_delta_info.delta_info.as_ref() {
            if let Some(base) = delta.base_delta.as_ref() {
                if let Some(col) = base.attrs.as_ref() {
                    if let Some(value) = decode_attr_i32(col, ATTR_SKILL_CD) {
                        if value != state.attr_skill_cd {
                            state.attr_skill_cd = value;
                            should_recalculate = true;
                        }
                    }
                    if let Some(value) = decode_attr_i32(col, ATTR_SKILL_CD_PCT) {
                        if value != state.attr_skill_cd_pct {
                            state.attr_skill_cd_pct = value;
                            should_recalculate = true;
                        }
                    }
                    if let Some(value) = decode_attr_i32(col, ATTR_CD_ACCELERATE_PCT) {
                        if value != state.attr_cd_accelerate_pct {
                            state.attr_cd_accelerate_pct = value;
                            should_recalculate = true;
                        }
                    }
                }

                if let Some(temp_attr_collection) = base.temp_attrs.as_ref() {
                    for temp_attr in &temp_attr_collection.attrs {
                        let Some(id) = temp_attr.id else {
                            continue;
                        };
                        let value = temp_attr.value.unwrap_or(0);
                        let prev = state.temp_attr_values.insert(id, value);
                        if prev != Some(value) {
                            should_recalculate = true;
                        }
                    }
                }
            }
        }

        // Missing fields are normal, no need to log
        let dungeon_ctx = dungeon_runtime_if_enabled(state);
        let _ = process_sync_to_me_delta_info(
            &mut state.encounter,
            sync_to_me_delta_info,
            dungeon_ctx.as_ref(),
            &state.attempt_config,
        );

        if let Some(raw_bytes) = buff_effect_bytes {
            if let Some(payload) =
                process_buff_effect_bytes(&mut state.active_buffs, &raw_bytes, &state.monitored_buff_ids, state.monitor_all_buff)
            {
                if let Some(app_handle) = state.event_manager.get_app_handle() {
                    safe_emit(
                        &app_handle,
                        "buff-update",
                        BuffUpdatePayload { buffs: payload },
                    );
                }
            }
        }

        if !skill_cds.is_empty() {
            let now = crate::database::now_ms();
            for cd in &skill_cds {
                if let Some(id) = cd.skill_level_id {
                    if !state.monitored_skill_ids.contains(&(id / 100)) {
                        continue;
                    }
                    let duration = cd.duration.unwrap_or(0);
                    let (calculated_duration, cd_accelerate_rate) = if duration > 0 {
                        calculate_skill_cd(
                            duration as f32,
                            id,
                            &state.temp_attr_values,
                            state.attr_skill_cd as f32,
                            state.attr_skill_cd_pct as f32,
                            state.attr_cd_accelerate_pct as f32,
                        )
                    } else {
                        (duration as f32, 0.0)
                    };
                    state.skill_cd_map.insert(
                        id,
                        SkillCdState {
                            skill_level_id: id,
                            begin_time: cd.begin_time.unwrap_or(0),
                            duration,
                            skill_cd_type: cd.skill_cd_type.unwrap_or(0),
                            valid_cd_time: cd.valid_cd_time.unwrap_or(0),
                            received_at: now,
                            calculated_duration: calculated_duration.round() as i32,
                            cd_accelerate_rate,
                        },
                    );
                }
            }
        }

        if should_recalculate {
            recalculate_cached_skill_cds(state);
        }

        if !skill_cds.is_empty() || should_recalculate {
            let filtered = build_filtered_skill_cds(state);
            emit_skill_cd_update_if_needed(state, filtered);
        }
    }

    async fn process_sync_near_delta_info(
        &self,
        state: &mut AppState,
        sync_near_delta_info: blueprotobuf::SyncNearDeltaInfo,
    ) {
        use crate::live::opcodes_process::process_aoi_sync_delta;
        let dungeon_ctx = dungeon_runtime_if_enabled(state);
        for aoi_sync_delta in sync_near_delta_info.delta_infos {
            // Missing fields are normal, no need to log
            let _ = process_aoi_sync_delta(
                &mut state.encounter,
                aoi_sync_delta,
                dungeon_ctx.as_ref(),
                &state.attempt_config,
            );
        }
    }

    async fn process_notify_revive_user(
        &self,
        state: &mut AppState,
        notify: blueprotobuf::NotifyReviveUser,
    ) {
        use crate::live::opcodes_process::process_notify_revive_user;
        if process_notify_revive_user(&mut state.encounter, notify).is_none() {
            warn!("Error processing NotifyReviveUser.. ignoring.");
        }
    }

    async fn reset_encounter(&self, state: &mut AppState, is_manual: bool) {
        // Persist dungeon segments if enabled
        if state.dungeon_segments_enabled {
            dungeon_log::persist_segments(&state.dungeon_log, true);
        }

        // End any active encounter in DB. Drain any detected dead boss names for persistence.
        let defeated = state.event_manager.take_dead_bosses();
        let encounter_data = state.last_encounter_snapshot.take();

        enqueue(DbTask::EndEncounter {
            ended_at_ms: now_ms(),
            defeated_bosses: if defeated.is_empty() {
                None
            } else {
                Some(defeated)
            },
            is_manually_reset: is_manual,
            encounter_data,
        });
        state.encounter.reset_combat_state();
        state.last_encounter_snapshot = None;
        state.skill_subscriptions.clear();
        state.active_buffs.clear();

        if state.event_manager.should_emit_events() {
            state.event_manager.emit_encounter_reset();
            // Clear dead bosses tracking on reset
            state.event_manager.clear_dead_bosses();

            if !state.monitored_buff_ids.is_empty() {
                if let Some(app_handle) = state.event_manager.get_app_handle() {
                    safe_emit(&app_handle, "buff-update", BuffUpdatePayload { buffs: Vec::new() });
                }
            }

            // Emit an encounter update with cleared state so frontend updates immediately
            use crate::live::commands_models::HeaderInfo;
            let cleared_header = HeaderInfo {
                total_dps: 0.0,
                total_dmg: 0,
                elapsed_ms: 0,
                fight_start_timestamp_ms: 0,
                bosses: vec![],
                scene_id: state.encounter.current_scene_id,
                scene_name: state.encounter.current_scene_name.clone(),
                current_segment_type: None,
                current_segment_name: None,
            };
            state
                .event_manager
                .emit_encounter_update(cleared_header, false);
        }

        state.low_hp_bosses.clear();
        state.skill_subscriptions.clear();
    }

    /// Gets a clone of the current encounter.
    pub async fn get_encounter(&self) -> Encounter {
        self.state.read().await.encounter.clone()
    }

    /// Updates the skill subscriptions.
    ///
    /// # Arguments
    ///
    /// * `update_fn` - A function that takes a mutable reference to the skill subscriptions and modifies it.
    pub async fn update_skill_subscriptions<F>(&self, update_fn: F)
    where
        F: FnOnce(&mut HashSet<(i64, String)>),
    {
        let mut state = self.state.write().await;
        update_fn(&mut state.skill_subscriptions);
    }

    /// Get player name by UID from database
    ///
    /// # Arguments
    ///
    /// * `uid` - The UID of the player.
    ///
    /// # Returns
    ///
    /// * `Option<String>` - The name of the player, or `None` if not found.
    #[allow(dead_code)]
    pub async fn get_player_name(&self, uid: i64) -> Option<String> {
        PlayerNames::get_name_by_uid(uid)
    }

    /// Get recent players ordered by last seen (most recent first)
    ///
    /// # Arguments
    ///
    /// * `limit` - The maximum number of players to return.
    ///
    /// # Returns
    ///
    /// * `Vec<(i64, String)>` - A list of recent players.
    #[allow(dead_code)]
    pub async fn get_recent_players(&self, limit: usize) -> Vec<(i64, String)> {
        PlayerNames::get_recent_players(limit)
    }

    /// Get multiple names by UIDs (batch query for performance)
    ///
    /// # Arguments
    ///
    /// * `uids` - A slice of UIDs.
    ///
    /// # Returns
    ///
    /// * `std::collections::HashMap<i64, String>` - A map of UIDs to names.
    #[allow(dead_code)]
    pub async fn get_player_names(&self, uids: &[i64]) -> std::collections::HashMap<i64, String> {
        PlayerNames::get_names_by_uids(uids)
    }

    /// Check if a player exists in the database
    ///
    /// # Arguments
    ///
    /// * `uid` - The UID of the player.
    ///
    /// # Returns
    ///
    /// * `bool` - Whether the player exists.
    #[allow(dead_code)]
    pub async fn contains_player(&self, uid: i64) -> bool {
        PlayerNames::contains_player(uid)
    }

    /// Updates the encounter.
    ///
    /// # Arguments
    ///
    /// * `update_fn` - A function that takes a mutable reference to the encounter and modifies it.
    #[allow(dead_code)]
    pub async fn update_encounter<F>(&self, update_fn: F)
    where
        F: FnOnce(&mut Encounter),
    {
        let mut state = self.state.write().await;
        update_fn(&mut state.encounter);
    }

    /// Gets a read guard for the application state.
    #[allow(dead_code)]
    pub async fn get_encounter_ref(&self) -> tokio::sync::RwLockReadGuard<'_, AppState> {
        self.state.read().await
    }

    /// Executes a function with a read-only reference to the application state.
    ///
    /// # Arguments
    ///
    /// * `f` - The function to execute.
    pub async fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&AppState) -> R,
    {
        let state = self.state.read().await;
        f(&*state)
    }

    /// Executes a function with a mutable reference to the application state.
    ///
    /// # Arguments
    ///
    /// * `f` - The function to execute.
    pub async fn with_state_mut<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut AppState) -> R,
    {
        let mut state = self.state.write().await;
        f(&mut *state)
    }
}

fn process_buff_effect_bytes(
    active_buffs: &mut HashMap<i32, ActiveBuff>,
    raw_bytes: &[u8],
    monitored_base_ids: &[i32],
    monitor_all_buff:bool,
) -> Option<Vec<BuffUpdateState>> {
    if monitored_base_ids.is_empty() && !monitor_all_buff {
        return None;
    }

    let buff_effect_sync = BuffEffectSync::decode(raw_bytes).ok()?;
    let now = now_ms();

    for buff_effect in buff_effect_sync.buff_effects {
        let buff_uuid = match buff_effect.buff_uuid {
            Some(id) => id,
            None => continue,
        };

        for logic_effect in buff_effect.logic_effect {
            let Some(effect_type) = logic_effect.effect_type else {
                continue;
            };
            let Some(raw) = logic_effect.raw_data else {
                continue;
            };

            if effect_type == EBuffEffectLogicPbType::BuffEffectAddBuff as i32 {
                if let Ok(buff_info) = BuffInfo::decode(raw.as_slice()) {
                    let Some(base_id) = buff_info.base_id else {
                        continue;
                    };
                    let layer = buff_info.layer.unwrap_or(1);
                    let duration = buff_info.duration.unwrap_or(0);
                    let create_time = buff_info.create_time.unwrap_or(now);
                    let source_config_id = buff_info
                        .fight_source_info
                        .and_then(|info| info.source_config_id)
                        .unwrap_or(0);

                    active_buffs.insert(
                        buff_uuid,
                        ActiveBuff {
                            buff_uuid,
                            base_id,
                            layer,
                            duration,
                            create_time,
                            source_config_id,
                        },
                    );
                }
            } else if effect_type == EBuffEffectLogicPbType::BuffEffectBuffChange as i32 {
                if let Ok(change_info) = BuffChange::decode(raw.as_slice()) {
                    if let Some(entry) = active_buffs.get_mut(&buff_uuid) {
                        if let Some(layer) = change_info.layer {
                            entry.layer = layer;
                        }
                        if let Some(duration) = change_info.duration {
                            entry.duration = duration;
                        }
                        if let Some(create_time) = change_info.create_time {
                            entry.create_time = create_time;
                        }
                    }
                }
            }
        }

        if buff_effect.r#type == Some(EBuffEventType::BuffEventRemove as i32) {
            active_buffs.remove(&buff_uuid);
        }
    }

    let mut payload: Vec<BuffUpdateState> = active_buffs
        .values()
        .filter(|buff| { monitor_all_buff ||
            monitored_base_ids.contains(&buff.base_id)
                || (buff.source_config_id != 0
                    && crate::live::buff_names::get_related_base_ids(buff.source_config_id)
                        .iter()
                        .any(|id| monitored_base_ids.contains(id)))
        })
        .map(|buff| BuffUpdateState {
            buff_uuid: buff.buff_uuid,
            base_id: buff.base_id,
            layer: buff.layer,
            duration_ms: buff.duration,
            create_time_ms: buff.create_time,
            source_config_id: buff.source_config_id,
        })
        .collect();

    payload.sort_by_key(|entry| (entry.base_id, entry.create_time_ms, entry.buff_uuid));
    Some(payload)
}

fn dungeon_runtime_if_enabled(state: &AppState) -> Option<DungeonLogRuntime> {
    if state.dungeon_segments_enabled {
        Some(DungeonLogRuntime::new(
            state.dungeon_log.clone(),
            state.app_handle.clone(),
        ))
    } else {
        None
    }
}

impl AppStateManager {
    /// Updates and emits events.
    pub async fn update_and_emit_events(&self) {
        // First, read the encounter data to generate all the necessary information
        let (encounter, should_emit, boss_only, dungeon_ctx) = {
            let state = self.state.read().await;
            (
                state.encounter.clone(),
                state.event_manager.should_emit_events(),
                false, // Always emit full damage totals; boss damage is exposed as a separate column.
                dungeon_runtime_if_enabled(&state),
            )
        };

        if !should_emit {
            return;
        }

        let active_segment_snapshot = dungeon_ctx
            .as_ref()
            .and_then(|runtime| runtime.snapshot())
            .and_then(|log| {
                log.segments
                    .iter()
                    .rev()
                    .find(|s| s.ended_at_ms.is_none())
                    .cloned()
            });

        let (segment_timing, active_segment) = if let Some(segment) = active_segment_snapshot {
            let segment_type = match segment.segment_type {
                SegmentType::Boss => "boss".to_string(),
                SegmentType::Trash => "trash".to_string(),
            };

            let start_ms = segment.started_at_ms.max(0) as u128;
            let end_ms = segment
                .ended_at_ms
                .map(|t| t.max(0) as u128)
                .unwrap_or(encounter.time_last_combat_packet_ms);
            let elapsed_ms = end_ms.saturating_sub(start_ms);

            (
                Some((start_ms, elapsed_ms)),
                Some((segment_type, segment.boss_name.clone())),
            )
        } else {
            (None, None)
        };

        let segment_elapsed_ms = segment_timing.map(|(_, elapsed)| elapsed);

        // Generate all the data we need without holding the lock
        let header_info_with_deaths =
            crate::live::event_manager::generate_header_info(&encounter, boss_only, segment_timing);
        let dps_players = crate::live::event_manager::generate_players_window_dps(
            &encounter,
            boss_only,
            segment_elapsed_ms,
        );
        let heal_players = crate::live::event_manager::generate_players_window_heal(
            &encounter,
            segment_elapsed_ms,
        );
        let tanked_players = crate::live::event_manager::generate_players_window_tanked(
            &encounter,
            segment_elapsed_ms,
        );
        let snapshot = build_encounter_snapshot(&encounter, encounter.local_player_uid);

        // Generate skill windows for all players
        let mut dps_skill_windows = Vec::new();
        let mut heal_skill_windows = Vec::new();
        let mut tanked_skill_windows = Vec::new();
        let mut subscribed_players = Vec::new();

        for (&entity_uid, entity) in &encounter.entity_uid_to_entity {
            let is_player = entity.entity_type == blueprotobuf::EEntityType::EntChar;
            let has_dmg_skills = !entity.skill_uid_to_dmg_skill.is_empty();
            let has_heal_skills = !entity.skill_uid_to_heal_skill.is_empty();
            let has_taken_skills = !entity.skill_uid_to_taken_skill.is_empty();

            if is_player && has_dmg_skills {
                if let Some(skills_window) = crate::live::event_manager::generate_skills_window_dps(
                    &encounter,
                    entity_uid,
                    boss_only,
                    segment_elapsed_ms,
                ) {
                    dps_skill_windows.push((entity_uid, skills_window));
                }
            }

            if is_player && has_heal_skills {
                if let Some(skills_window) = crate::live::event_manager::generate_skills_window_heal(
                    &encounter,
                    entity_uid,
                    segment_elapsed_ms,
                ) {
                    heal_skill_windows.push((entity_uid, skills_window));
                }
            }

            if is_player && has_taken_skills {
                if let Some(skills_window) =
                    crate::live::event_manager::generate_skills_window_tanked(
                        &encounter,
                        entity_uid,
                        segment_elapsed_ms,
                    )
                {
                    tanked_skill_windows.push((entity_uid, skills_window));
                }
            }

            // Collect subscribed players for later emission
            subscribed_players.push(entity_uid);
        }
        // Process boss death detection and collect ALL data needed for emission
        // We'll do ALL emissions without holding any locks to prevent deadlock
        let (final_header_info, boss_deaths, skill_subscriptions_clone, app_handle_opt) = {
            let mut state = self.state.write().await;
            state.last_encounter_snapshot = Some(snapshot);

            let (final_header, final_deaths) = if let Some((mut header_info, mut dead_bosses)) =
                header_info_with_deaths
            {
                use std::collections::HashSet;

                if let Some((segment_type, segment_name)) = &active_segment {
                    header_info.current_segment_type = Some(segment_type.clone());
                    header_info.current_segment_name = segment_name.clone();
                } else {
                    header_info.current_segment_type = None;
                    header_info.current_segment_name = None;
                }

                let mut dead_ids: HashSet<i64> = dead_bosses.iter().map(|(uid, _)| *uid).collect();
                let current_time_ms = now_ms() as u128;

                for boss in &mut header_info.bosses {
                    let hp_percent =
                        if let (Some(curr_hp), Some(max_hp)) = (boss.current_hp, boss.max_hp) {
                            if max_hp > 0 {
                                curr_hp as f64 / max_hp as f64 * 100.0
                            } else {
                                0.0
                            }
                        } else {
                            100.0
                        };

                    if hp_percent < 5.0 {
                        let entry = state
                            .low_hp_bosses
                            .entry(boss.uid)
                            .or_insert(current_time_ms);
                        if current_time_ms.saturating_sub(*entry) >= 5_000 {
                            if dead_ids.insert(boss.uid) {
                                dead_bosses.push((boss.uid, boss.name.clone()));
                            }
                        }
                    } else {
                        state.low_hp_bosses.remove(&boss.uid);
                    }

                    if dead_ids.contains(&boss.uid) {
                        boss.current_hp = Some(0);
                        state.low_hp_bosses.remove(&boss.uid);
                    }
                }

                (Some(header_info), dead_bosses)
            } else {
                (None, Vec::new())
            };

            // Clone app_handle and skill_subscriptions to use outside the lock
            (
                final_header,
                final_deaths,
                state.skill_subscriptions.clone(),
                state.event_manager.get_app_handle(),
            )
        }; // Write lock is FULLY released here - CRITICAL for preventing deadlock!

        // ALL emissions happen here WITHOUT holding ANY locks
        // This completely prevents deadlock scenarios
        if let Some(app_handle) = app_handle_opt {
            // Emit encounter update
            if let Some(header_info) = final_header_info {
                let payload = crate::live::event_manager::EncounterUpdatePayload {
                    header_info,
                    is_paused: encounter.is_encounter_paused,
                };
                safe_emit(&app_handle, "encounter-update", payload);
            }

            // Emit boss death events using EventManager for deduplication
            if !boss_deaths.is_empty() {
                let mut state = self.state.write().await;
                let mut any_new_death = false;
                for (boss_uid, boss_name) in boss_deaths {
                    let first_time = state.event_manager.emit_boss_death(boss_name, boss_uid);
                    if first_time {
                        state.encounter.waiting_for_next_boss = true;
                        any_new_death = true;
                    }
                }

                if any_new_death && state.dungeon_segments_enabled {
                    dungeon_log::persist_segments(&state.dungeon_log, true);
                }
            }

            // Emit DPS players update
            if !dps_players.player_rows.is_empty() {
                let payload = crate::live::event_manager::PlayersUpdatePayload {
                    metric_type: MetricType::Dps,
                    players_window: dps_players,
                };
                safe_emit(&app_handle, "players-update", payload);
            }

            // Emit heal players update
            if !heal_players.player_rows.is_empty() {
                let payload = crate::live::event_manager::PlayersUpdatePayload {
                    metric_type: MetricType::Heal,
                    players_window: heal_players,
                };
                safe_emit(&app_handle, "players-update", payload);
            }

            // Emit tanked players update
            if !tanked_players.player_rows.is_empty() {
                let payload = crate::live::event_manager::PlayersUpdatePayload {
                    metric_type: MetricType::Tanked,
                    players_window: tanked_players,
                };
                safe_emit(&app_handle, "players-update", payload);
            }

            // Emit skills updates only for subscribed players
            for (entity_uid, skills_window) in &dps_skill_windows {
                if skill_subscriptions_clone.contains(&(*entity_uid, "dps".to_string())) {
                    let payload = crate::live::event_manager::SkillsUpdatePayload {
                        metric_type: MetricType::Dps,
                        player_uid: *entity_uid,
                        skills_window: skills_window.clone(),
                    };
                    safe_emit(&app_handle, "skills-update", payload);
                }
            }
            for (entity_uid, skills_window) in &heal_skill_windows {
                if skill_subscriptions_clone.contains(&(*entity_uid, "heal".to_string())) {
                    let payload = crate::live::event_manager::SkillsUpdatePayload {
                        metric_type: MetricType::Heal,
                        player_uid: *entity_uid,
                        skills_window: skills_window.clone(),
                    };
                    safe_emit(&app_handle, "skills-update", payload);
                }
            }
            for (entity_uid, skills_window) in &tanked_skill_windows {
                if skill_subscriptions_clone.contains(&(*entity_uid, "tanked".to_string())) {
                    let payload = crate::live::event_manager::SkillsUpdatePayload {
                        metric_type: MetricType::Tanked,
                        player_uid: *entity_uid,
                        skills_window: skills_window.clone(),
                    };
                    safe_emit(&app_handle, "skills-update", payload);
                }
            }
        }

        if let Some(runtime) = dungeon_ctx {
            runtime.check_for_timeout(Instant::now());
        }
    }
}
