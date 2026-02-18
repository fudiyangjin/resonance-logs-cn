use crate::database::{
    CachedEntity, CachedPlayerData, EncounterMetadata, flush_entity_cache, flush_playerdata,
    now_ms, save_encounter,
};
use crate::live::cd_calc::calculate_skill_cd;
use crate::live::commands_models::{
    BuffUpdatePayload, BuffUpdateState, FightResourceState, FightResourceUpdatePayload,
    SkillCdState, SkillCdUpdatePayload,
};
use crate::live::dungeon_log::{
    self, BattleStateMachine, DungeonLogRuntime, EncounterResetReason, SegmentType,
    SharedDungeonLog,
};
use crate::live::event_manager::{EventManager, MetricType};
use crate::live::opcodes_models::Encounter;
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::{
    BuffChange, BuffEffectSync, BuffInfo, EBuffEffectLogicPbType, EBuffEventType, EEntityType,
};
use log::{info, trace, warn};
use prost::Message;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{
    mpsc::{UnboundedReceiver, UnboundedSender, error::TryRecvError, unbounded_channel},
    watch,
};

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
    /// A sync dungeon data event.
    SyncDungeonData(blueprotobuf::SyncDungeonData),
    /// A sync dungeon dirty data event.
    SyncDungeonDirtyData(blueprotobuf::SyncDungeonDirtyData),
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
    /// User configured buff priority order by base ID.
    pub priority_buff_ids: Vec<i32>,
    /// Active buffs keyed by buff UUID.
    pub active_buffs: HashMap<i32, ActiveBuff>,
    /// Cached ordered buff UUID list to avoid sorting every packet.
    pub ordered_buff_uuids: Vec<i32>,
    /// Whether ordered_buff_uuids needs recomputing.
    pub buff_order_dirty: bool,
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
    /// Estimated offset: local_ms - server_ms. Used to convert server buff
    /// timestamps into local time domain for clock-skew-safe rendering.
    pub server_clock_offset: i64,
    /// Monitor All buff?
    pub monitor_all_buff: bool,
    /// In-memory entity cache (single-threaded in live loop).
    pub entity_cache: HashMap<i64, CachedEntity>,
    /// Latest captured detailed player data.
    pub playerdata_cache: Option<CachedPlayerData>,
    /// battle state machine for objective/state driven resets.
    pub battle_state: BattleStateMachine,
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

#[derive(Debug, Clone)]
pub struct LiveStateSnapshot {
    pub encounter: Encounter,
    pub dungeon_log: Option<crate::live::dungeon_log::DungeonLog>,
    pub boss_only_dps: bool,
    pub event_update_rate_ms: u64,
    pub active_segment_elapsed_ms: Option<u128>,
}

#[derive(Debug, Clone)]
pub enum LiveControlCommand {
    StateEvent(StateEvent),
    SubscribePlayerSkill {
        uid: i64,
        skill_type: String,
    },
    UnsubscribePlayerSkill {
        uid: i64,
        skill_type: String,
    },
    SetBossOnlyDps(bool),
    SetDungeonSegmentsEnabled(bool),
    SetEventUpdateRateMs(u64),
    SetMonitoredBuffs(Vec<i32>),
    SetMonitoredSkills(Vec<i32>),
    SetMonitorAllBuff(bool),
    SetBuffPriority(Vec<i32>),
    ApplySkillMonitorStartup {
        monitored_skill_ids: Vec<i32>,
        monitored_buff_ids: Vec<i32>,
    },
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
            priority_buff_ids: Vec::new(),
            monitor_all_buff: false,
            active_buffs: HashMap::new(),
            ordered_buff_uuids: Vec::new(),
            buff_order_dirty: true,
            app_handle,
            boss_only_dps: false,
            low_hp_bosses: HashMap::new(),
            initial_scene_change_handled: false,
            dungeon_log: dungeon_log::create_shared_log(),
            dungeon_segments_enabled: false,
            event_update_rate_ms: 200,
            fight_res_state: None,
            temp_attr_values: HashMap::new(),
            attr_skill_cd: 0,
            attr_skill_cd_pct: 0,
            attr_cd_accelerate_pct: 0,
            server_clock_offset: 0,
            entity_cache: crate::database::load_initial_entity_cache(),
            playerdata_cache: None,
            battle_state: BattleStateMachine::default(),
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

    fn collect_dirty_entity_cache(&mut self) -> Vec<CachedEntity> {
        let mut dirty_entries = Vec::new();
        for entry in self.entity_cache.values_mut() {
            if entry.dirty {
                entry.dirty = false;
                dirty_entries.push(entry.clone());
            }
        }
        dirty_entries
    }

    fn take_dirty_playerdata(&mut self) -> Option<CachedPlayerData> {
        let mut cloned = self.playerdata_cache.clone()?;
        if !cloned.dirty {
            return None;
        }
        cloned.dirty = false;
        if let Some(existing) = self.playerdata_cache.as_mut() {
            existing.dirty = false;
        }
        Some(cloned)
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
    snapshot_tx: watch::Sender<Arc<LiveStateSnapshot>>,
    snapshot_rx: watch::Receiver<Arc<LiveStateSnapshot>>,
    control_tx: UnboundedSender<LiveControlCommand>,
    control_rx: Arc<Mutex<Option<UnboundedReceiver<LiveControlCommand>>>>,
}

impl AppStateManager {
    /// Creates a new `AppStateManager`.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - A handle to the Tauri application instance.
    pub fn new(app_handle: AppHandle) -> Self {
        let initial_state = AppState::new(app_handle);
        let initial_snapshot = Arc::new(build_live_state_snapshot(&initial_state));
        let (snapshot_tx, snapshot_rx) = watch::channel(initial_snapshot);
        let (control_tx, control_rx) = unbounded_channel();
        Self {
            snapshot_tx,
            snapshot_rx,
            control_tx,
            control_rx: Arc::new(Mutex::new(Some(control_rx))),
        }
    }

    pub fn latest_snapshot(&self) -> Arc<LiveStateSnapshot> {
        self.snapshot_rx.borrow().clone()
    }

    pub fn publish_snapshot_from_state(&self, state: &AppState) {
        let snapshot = Arc::new(build_live_state_snapshot(state));
        let _ = self.snapshot_tx.send(snapshot);
    }

    fn send_control(&self, command: LiveControlCommand) -> Result<(), String> {
        self.control_tx
            .send(command)
            .map_err(|_| "live runtime channel is unavailable".to_string())
    }

    pub async fn handle_events_batch_with_state(
        &self,
        state: &mut AppState,
        events: Vec<StateEvent>,
    ) {
        if events.is_empty() {
            return;
        }
        for event in events {
            self.apply_event(state, event).await;
        }
        self.publish_snapshot_from_state(state);
    }

    pub async fn apply_pending_control_commands(&self, state: &mut AppState) {
        loop {
            let command = {
                let mut guard = match self.control_rx.lock() {
                    Ok(guard) => guard,
                    Err(_) => return,
                };
                match guard.as_mut() {
                    Some(rx) => match rx.try_recv() {
                        Ok(cmd) => Some(cmd),
                        Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => None,
                    },
                    None => None,
                }
            };

            let Some(command) = command else {
                break;
            };
            self.apply_control_command(state, command).await;
        }
    }

    pub async fn send_state_event(&self, event: StateEvent) -> Result<(), String> {
        self.send_control(LiveControlCommand::StateEvent(event))
    }

    async fn apply_event(&self, state: &mut AppState, event: StateEvent) {
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
                self.on_server_change(state).await;
            }
            StateEvent::EnterScene(data) => {
                self.process_enter_scene(state, data).await;
            }
            StateEvent::SyncNearEntities(data) => {
                self.process_sync_near_entities(state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerData(data) => {
                // store local_player copy
                state.encounter.local_player = data.clone();

                self.process_sync_container_data(state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerDirtyData(data) => {
                self.process_sync_container_dirty_data(state, data).await;
            }
            StateEvent::SyncServerTime(_data) => {
                // todo: this is skipped, not sure what info it has
            }
            StateEvent::SyncDungeonData(data) => {
                self.process_sync_dungeon_data(state, data).await;
                self.apply_battle_state_resets_if_needed(state).await;
            }
            StateEvent::SyncDungeonDirtyData(data) => {
                self.process_sync_dungeon_dirty_data(state, data).await;
                self.apply_battle_state_resets_if_needed(state).await;
            }
            StateEvent::SyncToMeDeltaInfo(data) => {
                self.process_sync_to_me_delta_info(state, data).await;
                self.apply_battle_state_resets_if_needed(state).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncNearDeltaInfo(data) => {
                self.process_sync_near_delta_info(state, data).await;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::NotifyReviveUser(data) => {
                self.process_notify_revive_user(state, data).await;
            }
            StateEvent::SyncSceneAttrs(_) => {
                // SyncSceneAttrs handling is disabled to possibly remedy crashing bug.
            }
            StateEvent::PauseEncounter(paused) => {
                state.set_encounter_paused(paused);
            }
            StateEvent::ResetEncounter { is_manual } => {
                self.reset_encounter(state, is_manual).await;
            }
        }
    }

    async fn apply_control_command(&self, state: &mut AppState, command: LiveControlCommand) {
        match command {
            LiveControlCommand::StateEvent(event) => {
                self.apply_event(state, event).await;
            }
            LiveControlCommand::SubscribePlayerSkill { uid, skill_type } => {
                state.skill_subscriptions.insert((uid, skill_type));
            }
            LiveControlCommand::UnsubscribePlayerSkill { uid, skill_type } => {
                state.skill_subscriptions.remove(&(uid, skill_type));
            }
            LiveControlCommand::SetBossOnlyDps(enabled) => {
                state.boss_only_dps = enabled;
                self.update_and_emit_events_with_state(state).await;
            }
            LiveControlCommand::SetDungeonSegmentsEnabled(enabled) => {
                state.dungeon_segments_enabled = enabled;
                let runtime =
                    DungeonLogRuntime::new(state.dungeon_log.clone(), state.app_handle.clone());
                let snapshot = runtime.snapshot();
                dungeon_log::emit_if_changed(&runtime.app_handle, snapshot);
            }
            LiveControlCommand::SetEventUpdateRateMs(rate_ms) => {
                state.event_update_rate_ms = rate_ms;
            }
            LiveControlCommand::SetMonitoredBuffs(buff_base_ids) => {
                state.monitored_buff_ids = buff_base_ids;
            }
            LiveControlCommand::SetMonitoredSkills(skill_level_ids) => {
                state.monitored_skill_ids = skill_level_ids;
                let monitored_skill_ids = state.monitored_skill_ids.clone();
                state.skill_cd_map.retain(|skill_level_id, _| {
                    monitored_skill_ids.contains(&(skill_level_id / 100))
                });
            }
            LiveControlCommand::SetMonitorAllBuff(monitor_all_buff) => {
                state.monitor_all_buff = monitor_all_buff;
            }
            LiveControlCommand::SetBuffPriority(priority_buff_ids) => {
                state.priority_buff_ids = priority_buff_ids;
                state.buff_order_dirty = true;
            }
            LiveControlCommand::ApplySkillMonitorStartup {
                monitored_skill_ids,
                monitored_buff_ids,
            } => {
                state.monitored_skill_ids = monitored_skill_ids;
                state.monitored_buff_ids = monitored_buff_ids;
            }
        }

        self.publish_snapshot_from_state(state);
    }

    async fn on_server_change(&self, state: &mut AppState) {
        use crate::live::opcodes_process::on_server_change;

        // Persist dungeon segments if enabled
        if state.dungeon_segments_enabled {
            dungeon_log::persist_segments(&state.dungeon_log, true);
        }

        // Persist encounter directly on server change.
        let defeated = state.event_manager.take_dead_bosses();
        let mut player_names: Vec<String> = state
            .encounter
            .entity_uid_to_entity
            .values()
            .filter(|e| {
                e.entity_type == EEntityType::EntChar
                    && !e.name.is_empty()
                    && (e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0)
            })
            .map(|e| e.name.clone())
            .collect();
        player_names.sort();
        player_names.dedup();
        let metadata = EncounterMetadata {
            started_at_ms: state.encounter.time_fight_start_ms as i64,
            ended_at_ms: Some(now_ms()),
            local_player_id: Some(state.encounter.local_player_uid),
            total_dmg: state.encounter.total_dmg.min(i64::MAX as u128) as i64,
            total_heal: state.encounter.total_heal.min(i64::MAX as u128) as i64,
            scene_id: state.encounter.current_scene_id,
            scene_name: state.encounter.current_scene_name.clone(),
            duration: ((state
                .encounter
                .time_last_combat_packet_ms
                .saturating_sub(state.encounter.time_fight_start_ms))
                as f64)
                / 1000.0,
            is_manually_reset: false,
            boss_names: defeated,
            player_names,
        };
        if metadata.started_at_ms > 0 {
            info!(
                target: "app::live",
                "persist_encounter_on_server_change started_at_ms={} ended_at_ms={:?} total_dmg={} total_heal={} scene_id={:?} players={} bosses={}",
                metadata.started_at_ms,
                metadata.ended_at_ms,
                metadata.total_dmg,
                metadata.total_heal,
                metadata.scene_id,
                metadata.player_names.len(),
                metadata.boss_names.len()
            );
            match save_encounter(&state.encounter, &metadata) {
                Ok(encounter_id) => {
                    info!(
                        target: "app::live",
                        "persist_encounter_on_server_change_ok encounter_id={}",
                        encounter_id
                    );
                }
                Err(e) => {
                    warn!(
                        target: "app::live",
                        "persist_encounter_on_server_change_failed error={}",
                        e
                    );
                }
            }
            let dirty_entities = state.collect_dirty_entity_cache();
            if !dirty_entities.is_empty() {
                if let Err(e) = flush_entity_cache(dirty_entities) {
                    warn!(target: "app::live", "flush_entity_cache_failed error={}", e);
                }
            }
            if let Some(playerdata) = state.take_dirty_playerdata() {
                if let Err(e) = flush_playerdata(playerdata) {
                    warn!(target: "app::live", "flush_playerdata_failed error={}", e);
                }
            }
        } else {
            warn!(
                target: "app::live",
                "persist_encounter_on_server_change_skipped reason=time_fight_start_ms_zero total_dmg={} total_heal={} scene_id={:?}",
                metadata.total_dmg,
                metadata.total_heal,
                metadata.scene_id
            );
        }
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
        state.battle_state = BattleStateMachine::default();
    }

    async fn snapshot_segment_and_reset_live_meter(&self, state: &mut AppState) {
        // Persist dungeon segments
        // dungeon_log::persist_segments(&state.dungeon_log, true);

        // Store the original fight start time before reset
        let original_fight_start_ms = state.encounter.time_fight_start_ms;

        // Reset combat state (live meter)
        state.encounter.reset_combat_state();
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
            info!("Initial scene detected");
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
        if process_sync_near_entities(
            &mut state.encounter,
            &mut state.entity_cache,
            sync_near_entities,
        )
        .is_none()
        {
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

        if process_sync_container_data(
            &mut state.encounter,
            &mut state.entity_cache,
            &mut state.playerdata_cache,
            sync_container_data,
        )
        .is_none()
        {
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

    async fn process_sync_dungeon_data(
        &self,
        state: &mut AppState,
        sync_dungeon_data: blueprotobuf::SyncDungeonData,
    ) {
        use crate::live::opcodes_process::process_sync_dungeon_data;

        let encounter_has_stats = state.encounter.total_dmg > 0
            || state.encounter.total_heal > 0
            || state
                .encounter
                .entity_uid_to_entity
                .values()
                .any(|e| e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0);

        if let Some(reason) = process_sync_dungeon_data(
            &mut state.battle_state,
            sync_dungeon_data,
            encounter_has_stats,
        ) {
            info!(
                target: "app::live",
                "State layer applying reset from SyncDungeonData: {:?}",
                reason
            );
            self.apply_reset_reason(state, reason).await;
        }
    }

    async fn process_sync_dungeon_dirty_data(
        &self,
        state: &mut AppState,
        sync_dungeon_dirty_data: blueprotobuf::SyncDungeonDirtyData,
    ) {
        use crate::live::opcodes_process::process_sync_dungeon_dirty_data;

        let encounter_has_stats = state.encounter.total_dmg > 0
            || state.encounter.total_heal > 0
            || state
                .encounter
                .entity_uid_to_entity
                .values()
                .any(|e| e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0);

        if let Some(reason) = process_sync_dungeon_dirty_data(
            &mut state.battle_state,
            sync_dungeon_dirty_data,
            encounter_has_stats,
        ) {
            info!(
                target: "app::live",
                "State layer applying reset from SyncDungeonDirtyData: {:?}",
                reason
            );
            self.apply_reset_reason(state, reason).await;
        }
    }

    async fn process_sync_to_me_delta_info(
        &self,
        state: &mut AppState,
        sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    ) {
        use crate::live::opcodes_models::attr_type::{
            ATTR_CD_ACCELERATE_PCT, ATTR_FIGHT_RESOURCES, ATTR_SKILL_CD, ATTR_SKILL_CD_PCT,
        };
        use crate::live::opcodes_process::{parse_fight_resources, process_sync_to_me_delta_info};

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
                    col.attrs
                        .iter()
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
                    FightResourceUpdatePayload {
                        fight_res: new_state,
                    },
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
            &mut state.entity_cache,
            sync_to_me_delta_info,
            dungeon_ctx.as_ref(),
        );

        if let Some(raw_bytes) = buff_effect_bytes {
            if let Some(payload) = process_buff_effect_bytes(
                &mut state.active_buffs,
                &raw_bytes,
                &state.monitored_buff_ids,
                state.monitor_all_buff,
                &state.priority_buff_ids,
                &mut state.ordered_buff_uuids,
                &mut state.buff_order_dirty,
                &mut state.server_clock_offset,
            ) {
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
                &mut state.entity_cache,
                aoi_sync_delta,
                dungeon_ctx.as_ref(),
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

    async fn apply_reset_reason(&self, state: &mut AppState, reason: EncounterResetReason) {
        let encounter_has_stats = state.encounter.total_dmg > 0
            || state
                .encounter
                .entity_uid_to_entity
                .values()
                .any(|e| e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0);
        info!(
            target: "app::live",
            "Applying encounter reset due to rule: {:?} (has_stats={}, total_dmg={}, total_heal={})",
            reason,
            encounter_has_stats,
            state.encounter.total_dmg,
            state.encounter.total_heal
        );
        match reason {
            EncounterResetReason::NewObjective
            | EncounterResetReason::Wipe
            | EncounterResetReason::Force
            | EncounterResetReason::Restart
            | EncounterResetReason::DungeonStateEnd => {
                self.reset_encounter(state, false).await;
            }
        }
    }

    async fn apply_battle_state_resets_if_needed(&self, state: &mut AppState) {
        if let Some(reason) = state.battle_state.check_deferred_calls() {
            self.apply_reset_reason(state, reason).await;
            return;
        }

        if let Some(reason) = state.battle_state.check_for_wipe(&mut state.active_buffs)
        {
            self.apply_reset_reason(state, reason).await;
        }
    }

    async fn reset_encounter(&self, state: &mut AppState, is_manual: bool) {
        // Persist dungeon segments if enabled
        if state.dungeon_segments_enabled {
            dungeon_log::persist_segments(&state.dungeon_log, true);
        }

        // Persist encounter directly on reset.
        let defeated = state.event_manager.take_dead_bosses();
        let mut player_names: Vec<String> = state
            .encounter
            .entity_uid_to_entity
            .values()
            .filter(|e| {
                e.entity_type == EEntityType::EntChar
                    && !e.name.is_empty()
                    && (e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0)
            })
            .map(|e| e.name.clone())
            .collect();
        player_names.sort();
        player_names.dedup();
        let metadata = EncounterMetadata {
            started_at_ms: state.encounter.time_fight_start_ms as i64,
            ended_at_ms: Some(now_ms()),
            local_player_id: Some(state.encounter.local_player_uid),
            total_dmg: state.encounter.total_dmg.min(i64::MAX as u128) as i64,
            total_heal: state.encounter.total_heal.min(i64::MAX as u128) as i64,
            scene_id: state.encounter.current_scene_id,
            scene_name: state.encounter.current_scene_name.clone(),
            duration: ((state
                .encounter
                .time_last_combat_packet_ms
                .saturating_sub(state.encounter.time_fight_start_ms))
                as f64)
                / 1000.0,
            is_manually_reset: is_manual,
            boss_names: defeated,
            player_names,
        };
        if metadata.started_at_ms > 0 {
            info!(
                target: "app::live",
                "persist_encounter_on_reset started_at_ms={} ended_at_ms={:?} total_dmg={} total_heal={} scene_id={:?} players={} bosses={} is_manual={}",
                metadata.started_at_ms,
                metadata.ended_at_ms,
                metadata.total_dmg,
                metadata.total_heal,
                metadata.scene_id,
                metadata.player_names.len(),
                metadata.boss_names.len(),
                metadata.is_manually_reset
            );
            match save_encounter(&state.encounter, &metadata) {
                Ok(encounter_id) => {
                    info!(
                        target: "app::live",
                        "persist_encounter_on_reset_ok encounter_id={}",
                        encounter_id
                    );
                }
                Err(e) => {
                    warn!(
                        target: "app::live",
                        "persist_encounter_on_reset_failed error={}",
                        e
                    );
                }
            }
            let dirty_entities = state.collect_dirty_entity_cache();
            if !dirty_entities.is_empty() {
                if let Err(e) = flush_entity_cache(dirty_entities) {
                    warn!(target: "app::live", "flush_entity_cache_failed error={}", e);
                }
            }
            if let Some(playerdata) = state.take_dirty_playerdata() {
                if let Err(e) = flush_playerdata(playerdata) {
                    warn!(target: "app::live", "flush_playerdata_failed error={}", e);
                }
            }
        } else {
            warn!(
                target: "app::live",
                "persist_encounter_on_reset_skipped reason=time_fight_start_ms_zero total_dmg={} total_heal={} scene_id={:?}",
                metadata.total_dmg,
                metadata.total_heal,
                metadata.scene_id
            );
        }
        state.encounter.reset_combat_state();
        state.skill_subscriptions.clear();

        if state.event_manager.should_emit_events() {
            state.event_manager.emit_encounter_reset();
            // Clear dead bosses tracking on reset
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
        if is_manual {
            state.battle_state = BattleStateMachine::default();
        }
    }

    pub async fn subscribe_player_skill(&self, uid: i64, skill_type: String) -> Result<(), String> {
        self.send_control(LiveControlCommand::SubscribePlayerSkill { uid, skill_type })
    }

    pub async fn unsubscribe_player_skill(
        &self,
        uid: i64,
        skill_type: String,
    ) -> Result<(), String> {
        self.send_control(LiveControlCommand::UnsubscribePlayerSkill { uid, skill_type })
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
        crate::database::commands::get_name_by_uid(uid)
            .ok()
            .flatten()
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
        crate::database::commands::get_recent_players(limit as i64).unwrap_or_default()
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
        let mut result = std::collections::HashMap::new();
        for &uid in uids {
            if let Ok(Some(name)) = crate::database::commands::get_name_by_uid(uid) {
                result.insert(uid, name);
            }
        }
        result
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
        crate::database::commands::get_name_by_uid(uid)
            .ok()
            .flatten()
            .is_some()
    }

    pub async fn set_boss_only_dps(&self, enabled: bool) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetBossOnlyDps(enabled))
    }

    pub async fn set_dungeon_segments_enabled(&self, enabled: bool) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetDungeonSegmentsEnabled(enabled))
    }

    pub async fn set_event_update_rate_ms(&self, rate_ms: u64) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetEventUpdateRateMs(rate_ms))
    }

    pub async fn set_monitored_buffs(&self, buff_base_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitoredBuffs(buff_base_ids))
    }

    pub async fn set_monitored_skills(&self, skill_level_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitoredSkills(skill_level_ids))
    }

    pub async fn set_monitor_all_buff(&self, monitor_all_buff: bool) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitorAllBuff(monitor_all_buff))
    }

    pub async fn set_buff_priority(&self, priority_buff_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetBuffPriority(priority_buff_ids))
    }

    pub async fn apply_skill_monitor_startup(
        &self,
        monitored_skill_ids: Vec<i32>,
        monitored_buff_ids: Vec<i32>,
    ) -> Result<(), String> {
        self.send_control(LiveControlCommand::ApplySkillMonitorStartup {
            monitored_skill_ids,
            monitored_buff_ids,
        })
    }

    pub fn current_event_update_rate_ms(&self) -> u64 {
        self.snapshot_rx.borrow().event_update_rate_ms
    }
}

fn process_buff_effect_bytes(
    active_buffs: &mut HashMap<i32, ActiveBuff>,
    raw_bytes: &[u8],
    monitored_base_ids: &[i32],
    monitor_all_buff: bool,
    priority_buff_ids: &[i32],
    ordered_buff_uuids: &mut Vec<i32>,
    buff_order_dirty: &mut bool,
    server_clock_offset: &mut i64,
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
                    if buff_info.create_time.is_some() {
                        *server_clock_offset = now - create_time;
                    }
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
                    *buff_order_dirty = true;
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
            if active_buffs.remove(&buff_uuid).is_some() {
                *buff_order_dirty = true;
            }
        }
    }

    if *buff_order_dirty {
        let priority_index: HashMap<i32, usize> = priority_buff_ids
            .iter()
            .enumerate()
            .map(|(idx, &base_id)| (base_id, idx))
            .collect();
        ordered_buff_uuids.clear();
        ordered_buff_uuids.extend(active_buffs.keys().copied());
        ordered_buff_uuids.sort_by_key(|uuid| {
            let (base_id, create_time, buff_uuid) = active_buffs
                .get(uuid)
                .map(|buff| (buff.base_id, buff.create_time, buff.buff_uuid))
                .unwrap_or((i32::MAX, i64::MAX, i32::MAX));
            (
                priority_index.get(&base_id).copied().unwrap_or(usize::MAX),
                base_id,
                create_time,
                buff_uuid,
            )
        });
        *buff_order_dirty = false;
    }

    let payload: Vec<BuffUpdateState> = ordered_buff_uuids
        .iter()
        .filter_map(|uuid| active_buffs.get(uuid))
        .filter(|buff| {
            monitor_all_buff
                || monitored_base_ids.contains(&buff.base_id)
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
            create_time_ms: buff.create_time.saturating_add(*server_clock_offset),
            source_config_id: buff.source_config_id,
        })
        .collect();
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

fn build_live_state_snapshot(state: &AppState) -> LiveStateSnapshot {
    let active_segment_elapsed_ms = if state.dungeon_segments_enabled {
        dungeon_log::snapshot(&state.dungeon_log).and_then(|log| {
            log.segments
                .iter()
                .rev()
                .find(|s| s.ended_at_ms.is_none())
                .map(|segment| {
                    let start_ms = segment.started_at_ms.max(0) as u128;
                    let end_ms = segment
                        .ended_at_ms
                        .map(|t| t.max(0) as u128)
                        .unwrap_or(state.encounter.time_last_combat_packet_ms);
                    end_ms.saturating_sub(start_ms)
                })
        })
    } else {
        None
    };

    LiveStateSnapshot {
        encounter: state.encounter.clone(),
        dungeon_log: dungeon_log::snapshot(&state.dungeon_log),
        boss_only_dps: state.boss_only_dps,
        event_update_rate_ms: state.event_update_rate_ms,
        active_segment_elapsed_ms,
    }
}

impl AppStateManager {
    /// Updates and emits events.
    pub async fn update_and_emit_events_with_state(&self, state: &mut AppState) {
        let encounter = state.encounter.clone();
        let should_emit = state.event_manager.should_emit_events();
        let boss_only = false; // Always emit full damage totals; boss damage is exposed separately.
        let dungeon_ctx = dungeon_runtime_if_enabled(state);

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

        let header_info_with_deaths =
            crate::live::event_manager::generate_header_info(&encounter, boss_only, segment_timing);
        let dps_players = crate::live::event_manager::generate_players_window_dps(
            &encounter,
            &state.entity_cache,
            boss_only,
            segment_elapsed_ms,
        );
        let heal_players = crate::live::event_manager::generate_players_window_heal(
            &encounter,
            &state.entity_cache,
            segment_elapsed_ms,
        );
        let tanked_players = crate::live::event_manager::generate_players_window_tanked(
            &encounter,
            &state.entity_cache,
            segment_elapsed_ms,
        );
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
                    &state.entity_cache,
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
                    &state.entity_cache,
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
                        &state.entity_cache,
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
        let (final_header_info, boss_deaths) =
            if let Some((mut header_info, mut dead_bosses)) = header_info_with_deaths {
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

        let skill_subscriptions_clone = state.skill_subscriptions.clone();
        let app_handle_opt = state.event_manager.get_app_handle();
        self.publish_snapshot_from_state(state);

        if let Some(app_handle) = app_handle_opt {
            if let Some(header_info) = final_header_info {
                let payload = crate::live::event_manager::EncounterUpdatePayload {
                    header_info,
                    is_paused: encounter.is_encounter_paused,
                };
                safe_emit(&app_handle, "encounter-update", payload);
            }

            if !boss_deaths.is_empty() {
                let mut any_new_death = false;
                for (boss_uid, boss_name) in boss_deaths {
                    let first_time = state.event_manager.emit_boss_death(boss_name, boss_uid);
                    if first_time {
                        any_new_death = true;
                    }
                }

                if any_new_death && state.dungeon_segments_enabled {
                    dungeon_log::persist_segments(&state.dungeon_log, true);
                }
                self.publish_snapshot_from_state(state);
            }

            if !dps_players.player_rows.is_empty() {
                let payload = crate::live::event_manager::PlayersUpdatePayload {
                    metric_type: MetricType::Dps,
                    players_window: dps_players,
                };
                safe_emit(&app_handle, "players-update", payload);
            }

            if !heal_players.player_rows.is_empty() {
                let payload = crate::live::event_manager::PlayersUpdatePayload {
                    metric_type: MetricType::Heal,
                    players_window: heal_players,
                };
                safe_emit(&app_handle, "players-update", payload);
            }

            if !tanked_players.player_rows.is_empty() {
                let payload = crate::live::event_manager::PlayersUpdatePayload {
                    metric_type: MetricType::Tanked,
                    players_window: tanked_players,
                };
                safe_emit(&app_handle, "players-update", payload);
            }

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
