use crate::database::{EncounterMetadata, PlayerNameEntry, now_ms, save_encounter};
use crate::live::cd_calc::calculate_skill_cd;
use crate::live::commands_models::{
    BuffUpdateState, FightResourceState, PanelAttrState, SkillCdState,
};
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::event_manager::EventManager;
use crate::live::opcodes_models::Encounter;
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::{
    BuffChange, BuffEffectSync, BuffInfo, EBuffEffectLogicPbType, EBuffEventType, EEntityType,
};
use log::{info, warn};
use prost::Message;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};

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
    /// Monitoring context for the local player.
    pub local_monitor: EntityMonitor,
    /// A map of low HP bosses.
    pub low_hp_bosses: HashMap<i64, u128>,
    /// Whether we've already handled the first scene change after startup.
    pub initial_scene_change_handled: bool,
    /// Event update rate in milliseconds (default: 200ms). Controls how often events are emitted to frontend.
    pub event_update_rate_ms: u64,
    /// Centralized store for all parsed Attr / TempAttr values.
    pub attr_store: EntityAttrStore,
    /// Estimated offset: local_ms - server_ms. Used to convert server buff
    /// timestamps into local time domain for clock-skew-safe rendering.
    pub server_clock_offset: i64,
    /// battle state machine for objective/state driven resets.
    pub battle_state: BattleStateMachine,
    /// If set, automatic reset can execute only after this timestamp.
    pub pending_auto_reset: Option<Instant>,
}

#[derive(Debug)]
pub struct EntityMonitor {
    pub uid: i64,
    pub buff_monitor: BuffMonitor,
    pub skill_cd_monitor: SkillCdMonitor,
    pub monitored_panel_attr_ids: Vec<i32>,
    pub fight_res_state: Option<FightResourceState>,
}

impl EntityMonitor {
    fn new(uid: i64) -> Self {
        Self {
            uid,
            buff_monitor: BuffMonitor::new(),
            skill_cd_monitor: SkillCdMonitor::new(),
            monitored_panel_attr_ids: Vec::new(),
            fight_res_state: None,
        }
    }
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

#[derive(Debug, Default)]
pub struct BuffMonitor {
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
    /// Monitor all buffs.
    pub monitor_all_buff: bool,
}

impl BuffMonitor {
    fn new() -> Self {
        Self {
            monitored_buff_ids: Vec::new(),
            priority_buff_ids: Vec::new(),
            active_buffs: HashMap::new(),
            ordered_buff_uuids: Vec::new(),
            buff_order_dirty: true,
            monitor_all_buff: false,
        }
    }
}

#[derive(Debug, Default)]
pub struct SkillCdMonitor {
    /// Skill cooldown map keyed by skill level ID.
    pub skill_cd_map: HashMap<i32, SkillCdState>,
    /// Ordered list of monitored skill IDs.
    pub monitored_skill_ids: Vec<i32>,
}

impl SkillCdMonitor {
    fn new() -> Self {
        Self {
            skill_cd_map: HashMap::new(),
            monitored_skill_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum LiveControlCommand {
    StateEvent(StateEvent),
    TogglePauseEncounter,
    SetEventUpdateRateMs(u64),
    SetMonitoredBuffs(Vec<i32>),
    SetMonitoredPanelAttrs(Vec<i32>),
    SetMonitoredSkills(Vec<i32>),
    SetMonitorAllBuff(bool),
    SetBuffPriority(Vec<i32>),
}

impl AppState {
    /// Creates a new `AppState`.
    ///
    /// # Arguments
    ///
    pub fn new() -> Self {
        Self {
            encounter: Encounter::default(),
            event_manager: EventManager::new(),
            local_monitor: EntityMonitor::new(0),
            low_hp_bosses: HashMap::new(),
            initial_scene_change_handled: false,
            event_update_rate_ms: 200,
            attr_store: EntityAttrStore::with_capacity(256),
            server_clock_offset: 0,
            battle_state: BattleStateMachine::default(),
            pending_auto_reset: None,
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

impl SkillCdMonitor {
    fn recalculate_cached_skill_cds(&mut self, attr_store: &EntityAttrStore) {
        let (attr_skill_cd, attr_skill_cd_pct, attr_cd_accelerate_pct) = attr_store.cd_inputs();
        for cd in self.skill_cd_map.values_mut() {
            if cd.duration > 0 {
                let (calculated_duration, cd_accelerate_rate) = calculate_skill_cd(
                    cd.duration as f32,
                    cd.skill_level_id,
                    attr_store.temp_attrs(),
                    attr_skill_cd,
                    attr_skill_cd_pct,
                    attr_cd_accelerate_pct,
                );
                cd.calculated_duration = calculated_duration.round() as i32;
                cd.cd_accelerate_rate = cd_accelerate_rate;
            } else {
                cd.calculated_duration = cd.duration;
                cd.cd_accelerate_rate = 0.0;
            }
        }
    }

    fn build_filtered_skill_cds(&self) -> Vec<SkillCdState> {
        if self.monitored_skill_ids.is_empty() {
            return Vec::new();
        }
        let mut filtered = Vec::with_capacity(self.monitored_skill_ids.len());
        for monitored_skill_id in &self.monitored_skill_ids {
            if let Some(cd) = self
                .skill_cd_map
                .values()
                .filter(|cd| cd.skill_level_id / 100 == *monitored_skill_id)
                .max_by_key(|cd| cd.received_at)
                .cloned()
            {
                filtered.push(cd);
            }
        }
        filtered
    }

    fn apply_skill_cd_updates(
        &mut self,
        skill_cds: &[crate::live::opcodes_process::ParsedSkillCd],
        attr_store: &EntityAttrStore,
    ) {
        let now = now_ms();
        for cd in skill_cds {
            let Some(id) = cd.skill_level_id else {
                continue;
            };
            if !self.monitored_skill_ids.contains(&(id / 100)) {
                continue;
            }

            let duration = cd.duration.unwrap_or(0);
            let (attr_skill_cd, attr_skill_cd_pct, attr_cd_accelerate_pct) = attr_store.cd_inputs();
            let (calculated_duration, cd_accelerate_rate) = if duration > 0 {
                calculate_skill_cd(
                    duration as f32,
                    id,
                    attr_store.temp_attrs(),
                    attr_skill_cd,
                    attr_skill_cd_pct,
                    attr_cd_accelerate_pct,
                )
            } else {
                (duration as f32, 0.0)
            };

            self.skill_cd_map.insert(
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

fn emit_skill_cd_update_if_needed(state: &mut AppState, payload: Vec<SkillCdState>) {
    if payload.is_empty() {
        return;
    }
    info!(
        "[skill-cd] emit update for {} skills (monitored={:?})",
        payload.len(),
        state.local_monitor.skill_cd_monitor.monitored_skill_ids
    );
    info!("[skill-cd] payload={:?}", payload);
    state.event_manager.emit_skill_cd_update(payload);
}

fn emit_panel_attr_update_if_needed(state: &mut AppState, payload: Vec<PanelAttrState>) {
    if payload.is_empty() {
        return;
    }
    state.event_manager.emit_panel_attr_update(payload);
}

fn hydrate_entities_from_attr_store(state: &mut AppState) {
    for (&uid, entity) in &mut state.encounter.entity_uid_to_entity {
        state.attr_store.hydrate_entity(uid, entity);
    }
}

fn collect_player_names(encounter: &Encounter) -> Vec<PlayerNameEntry> {
    let mut player_names: Vec<PlayerNameEntry> =
        Vec::with_capacity(encounter.entity_uid_to_entity.len());
    player_names.extend(
        encounter
            .entity_uid_to_entity
            .iter()
            .filter(|(_, entity)| {
                entity.entity_type == EEntityType::EntChar
                    && !entity.name.is_empty()
                    && (entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0)
            })
            .map(|(_, entity)| PlayerNameEntry {
                name: entity.name.clone(),
                class_id: entity.class_id,
            }),
    );
    player_names.sort_by(|a, b| a.name.cmp(&b.name));
    player_names.dedup_by(|a, b| a.name == b.name);
    player_names
}

fn build_encounter_metadata(
    encounter: &Encounter,
    boss_names: Vec<String>,
    player_names: Vec<PlayerNameEntry>,
    is_manual: bool,
) -> EncounterMetadata {
    EncounterMetadata {
        started_at_ms: encounter.time_fight_start_ms as i64,
        ended_at_ms: Some(now_ms()),
        local_player_id: Some(encounter.local_player_uid),
        total_dmg: encounter.total_dmg.min(i64::MAX as u128) as i64,
        total_heal: encounter.total_heal.min(i64::MAX as u128) as i64,
        scene_id: encounter.current_scene_id,
        scene_name: encounter.current_scene_name.clone(),
        duration: ((encounter
            .time_last_combat_packet_ms
            .saturating_sub(encounter.time_fight_start_ms)) as f64)
            / 1000.0,
        is_manually_reset: is_manual,
        boss_names,
        player_names,
    }
}

fn persist_and_save_encounter(state: &mut AppState, is_manual: bool, source: &str) {
    hydrate_entities_from_attr_store(state);
    let defeated = state.event_manager.take_dead_bosses();
    let player_names = collect_player_names(&state.encounter);
    let metadata = build_encounter_metadata(&state.encounter, defeated, player_names, is_manual);

    if metadata.started_at_ms > 0 {
        info!(
            target: "app::live",
            "persist_encounter_on_{} started_at_ms={} ended_at_ms={:?} total_dmg={} total_heal={} scene_id={:?} players={} bosses={} is_manual={}",
            source,
            metadata.started_at_ms,
            metadata.ended_at_ms,
            metadata.total_dmg,
            metadata.total_heal,
            metadata.scene_id,
            metadata.player_names.len(),
            metadata.boss_names.len(),
            metadata.is_manually_reset
        );
        save_encounter(&state.encounter, &metadata);
    } else {
        warn!(
            target: "app::live",
            "persist_encounter_on_{}_skipped reason=time_fight_start_ms_zero total_dmg={} total_heal={} scene_id={:?}",
            source,
            metadata.total_dmg,
            metadata.total_heal,
            metadata.scene_id
        );
    }
}

/// Manages the state of the application.
#[derive(Clone)]
pub struct AppStateManager {
    control_tx: UnboundedSender<LiveControlCommand>,
}

impl AppStateManager {
    /// Creates a new `AppStateManager`.
    pub fn new() -> (Self, UnboundedReceiver<LiveControlCommand>) {
        let (control_tx, control_rx) = unbounded_channel();
        (Self { control_tx }, control_rx)
    }

    fn send_control(&self, command: LiveControlCommand) -> Result<(), String> {
        self.control_tx
            .send(command)
            .map_err(|_| "live runtime channel is unavailable".to_string())
    }

    pub fn handle_events_batch_with_state(&self, state: &mut AppState, events: Vec<StateEvent>) {
        if events.is_empty() {
            return;
        }
        for event in events {
            self.apply_event(state, event);
        }
    }

    pub fn drain_control_commands(
        &self,
        state: &mut AppState,
        control_rx: &mut UnboundedReceiver<LiveControlCommand>,
    ) {
        loop {
            let Ok(command) = control_rx.try_recv() else {
                break;
            };
            self.apply_control_command(state, command);
        }
    }

    pub fn send_state_event(&self, event: StateEvent) -> Result<(), String> {
        self.send_control(LiveControlCommand::StateEvent(event))
    }

    pub fn send_toggle_pause_encounter(&self) -> Result<(), String> {
        self.send_control(LiveControlCommand::TogglePauseEncounter)
    }

    fn apply_event(&self, state: &mut AppState, event: StateEvent) {
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
                self.on_server_change(state);
            }
            StateEvent::EnterScene(data) => {
                self.process_enter_scene(state, data);
            }
            StateEvent::SyncNearEntities(data) => {
                self.process_sync_near_entities(state, data);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerData(data) => {
                // store local_player copy
                state.encounter.local_player = data.clone();

                self.process_sync_container_data(state, data);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerDirtyData(data) => {
                self.process_sync_container_dirty_data(state, data);
            }
            StateEvent::SyncServerTime(_data) => {
                // todo: this is skipped, not sure what info it has
            }
            StateEvent::SyncDungeonData(data) => {
                self.process_sync_dungeon_data(state, data);
                self.apply_battle_state_resets_if_needed(state);
            }
            StateEvent::SyncDungeonDirtyData(data) => {
                self.process_sync_dungeon_dirty_data(state, data);
                self.apply_battle_state_resets_if_needed(state);
            }
            StateEvent::SyncToMeDeltaInfo(data) => {
                self.process_sync_to_me_delta_info(state, data);
                self.apply_battle_state_resets_if_needed(state);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncNearDeltaInfo(data) => {
                self.process_sync_near_delta_info(state, data);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::NotifyReviveUser(data) => {
                self.process_notify_revive_user(state, data);
            }
            StateEvent::ResetEncounter { is_manual } => {
                state.pending_auto_reset = None;
                self.reset_encounter(state, is_manual);
            }
        }
        self.apply_attr_store_changes(state);
    }

    pub(crate) fn apply_control_command(&self, state: &mut AppState, command: LiveControlCommand) {
        match command {
            LiveControlCommand::StateEvent(event) => {
                self.apply_event(state, event);
            }
            LiveControlCommand::TogglePauseEncounter => {
                let paused = state.encounter.is_encounter_paused;
                state.set_encounter_paused(!paused);
            }
            LiveControlCommand::SetEventUpdateRateMs(rate_ms) => {
                state.event_update_rate_ms = rate_ms;
            }
            LiveControlCommand::SetMonitoredBuffs(buff_base_ids) => {
                state.local_monitor.buff_monitor.monitored_buff_ids = buff_base_ids;
            }
            LiveControlCommand::SetMonitoredPanelAttrs(attr_ids) => {
                state.local_monitor.monitored_panel_attr_ids = attr_ids;
                let payload: Vec<PanelAttrState> = state
                    .local_monitor
                    .monitored_panel_attr_ids
                    .iter()
                    .filter_map(|attr_id| {
                        state
                            .attr_store
                            .panel_attr_value(*attr_id)
                            .map(|value| PanelAttrState {
                                attr_id: *attr_id,
                                value,
                            })
                    })
                    .collect();
                emit_panel_attr_update_if_needed(state, payload);
            }
            LiveControlCommand::SetMonitoredSkills(skill_level_ids) => {
                state.local_monitor.skill_cd_monitor.monitored_skill_ids = skill_level_ids;
                let monitored_skill_ids = &state.local_monitor.skill_cd_monitor.monitored_skill_ids;
                let old_map =
                    std::mem::take(&mut state.local_monitor.skill_cd_monitor.skill_cd_map);
                state.local_monitor.skill_cd_monitor.skill_cd_map = old_map
                    .into_iter()
                    .filter(|(skill_level_id, _)| {
                        monitored_skill_ids.contains(&(skill_level_id / 100))
                    })
                    .collect();
            }
            LiveControlCommand::SetMonitorAllBuff(monitor_all_buff) => {
                state.local_monitor.buff_monitor.monitor_all_buff = monitor_all_buff;
            }
            LiveControlCommand::SetBuffPriority(priority_buff_ids) => {
                state.local_monitor.buff_monitor.priority_buff_ids = priority_buff_ids;
                state.local_monitor.buff_monitor.buff_order_dirty = true;
            }
        }
    }

    fn on_server_change(&self, state: &mut AppState) {
        use crate::live::opcodes_process::on_server_change;
        state.pending_auto_reset = None;

        persist_and_save_encounter(state, false, "server_change");
        on_server_change(&mut state.encounter);

        // Emit encounter reset event
        if state.event_manager.should_emit_events() {
            state.event_manager.emit_encounter_reset();
            // Clear dead bosses tracking on server change
            state.event_manager.clear_dead_bosses();
        }

        state.low_hp_bosses.clear();
        state.battle_state = BattleStateMachine::default();
    }

    // all scene id extraction logic is here (its pretty rough)
    fn process_enter_scene(&self, state: &mut AppState, enter_scene: blueprotobuf::EnterScene) {
        use crate::live::opcodes_process::process_enter_scene as parse_enter_scene;
        use crate::live::scene_names;

        info!("EnterScene packet received");

        let parsed = parse_enter_scene(
            &mut state.attr_store,
            &enter_scene,
            &state.local_monitor.monitored_panel_attr_ids,
        );

        if !state.initial_scene_change_handled {
            info!("Initial scene detected");
            state.initial_scene_change_handled = true;
        }

        if let Some(scene_id) = parsed.scene_id {
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
                state.pending_auto_reset = None;
                info!("Scene changed: ending active encounter");
                self.reset_encounter(state, false);
            }

            // Update encounter with scene info
            state.encounter.current_scene_id = Some(scene_id);
            state.encounter.current_scene_name = Some(scene_name.clone());
            state.encounter.current_dungeon_difficulty = None;

            info!("Scene changed to: {} (ID: {})", scene_name, scene_id);

            // Emit scene change event
            if state.event_manager.should_emit_events() {
                info!("Emitting scene change event for: {}", scene_name);
                state.event_manager.emit_scene_change(scene_name);
            } else {
                warn!("Event manager not ready, skipping scene change emit");
            }
        } else {
            warn!("Could not extract scene_id from EnterScene packet");
        }
    }

    fn process_sync_near_entities(
        &self,
        state: &mut AppState,
        sync_near_entities: blueprotobuf::SyncNearEntities,
    ) {
        use crate::live::opcodes_process::process_sync_near_entities;
        if process_sync_near_entities(
            &mut state.encounter,
            &mut state.attr_store,
            sync_near_entities,
        )
        .is_none()
        {
            warn!("Error processing SyncNearEntities.. ignoring.");
        }
    }

    fn process_sync_container_data(
        &self,
        state: &mut AppState,
        sync_container_data: blueprotobuf::SyncContainerData,
    ) {
        use crate::live::opcodes_process::process_sync_container_data;

        if process_sync_container_data(
            &mut state.encounter,
            &mut state.attr_store,
            sync_container_data,
        )
        .is_none()
        {
            warn!("Error processing SyncContainerData.. ignoring.");
        }
    }

    fn process_sync_container_dirty_data(
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

    fn process_sync_dungeon_data(
        &self,
        state: &mut AppState,
        sync_dungeon_data: blueprotobuf::SyncDungeonData,
    ) {
        use crate::live::opcodes_process::process_sync_dungeon_data;
        use crate::live::scene_names;

        let difficulty = sync_dungeon_data
            .v_data
            .as_ref()
            .and_then(|v| v.dungeon_scene_info.as_ref())
            .and_then(|info| info.difficulty);

        if let Some(difficulty) = difficulty {
            state.encounter.current_dungeon_difficulty = Some(difficulty);

            if let Some(scene_id) = state.encounter.current_scene_id {
                let scene_name = scene_names::lookup_with_difficulty(scene_id, Some(difficulty));
                let should_emit = state
                    .encounter
                    .current_scene_name
                    .as_ref()
                    .map(|name| name != &scene_name)
                    .unwrap_or(true);

                state.encounter.current_scene_name = Some(scene_name.clone());

                if should_emit && state.event_manager.should_emit_events() {
                    state.event_manager.emit_scene_change(scene_name.clone());
                }
            }
        }

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
            self.apply_reset_reason(state, reason);
        }
    }

    fn process_sync_dungeon_dirty_data(
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
            self.apply_reset_reason(state, reason);
        }
    }

    fn process_sync_to_me_delta_info(
        &self,
        state: &mut AppState,
        sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    ) {
        use crate::live::opcodes_process::{
            aoi_delta_has_player_damage, process_sync_to_me_delta_info,
        };
        if state.pending_auto_reset.is_some() {
            let has_damage = sync_to_me_delta_info
                .delta_info
                .as_ref()
                .and_then(|d| d.base_delta.as_ref())
                .is_some_and(aoi_delta_has_player_damage);
            self.try_deferred_reset(state, has_damage, "SyncToMeDeltaInfo");
        }

        let result = process_sync_to_me_delta_info(
            &mut state.encounter,
            &mut state.attr_store,
            sync_to_me_delta_info,
            &state.local_monitor.monitored_panel_attr_ids,
        );

        if state.local_monitor.uid != state.encounter.local_player_uid {
            state.local_monitor.uid = state.encounter.local_player_uid;
        }

        if !result.skill_cds.is_empty() {
            let ids: Vec<i32> = result
                .skill_cds
                .iter()
                .filter_map(|cd| cd.skill_level_id)
                .collect();
            info!(
                "[skill-cd] received {} cd entries, ids={:?}",
                ids.len(),
                ids
            );
        }

        if let Some(values) = result.fight_resources {
            let now = crate::database::now_ms();
            let new_state = FightResourceState {
                values,
                received_at: now,
            };
            state.local_monitor.fight_res_state = Some(new_state.clone());
            state.event_manager.emit_fight_resource_update(new_state);
        }

        if let Some(raw_bytes) = result.buff_effect_bytes {
            if let Some(payload) = state
                .local_monitor
                .buff_monitor
                .process_buff_effect_bytes(&raw_bytes, &mut state.server_clock_offset)
            {
                state.event_manager.emit_buff_update(payload);
            }
        }

        if !result.skill_cds.is_empty() {
            state.attr_store.mark_cd_dirty();
            state
                .local_monitor
                .skill_cd_monitor
                .apply_skill_cd_updates(&result.skill_cds, &state.attr_store);
        }
    }

    fn process_sync_near_delta_info(
        &self,
        state: &mut AppState,
        sync_near_delta_info: blueprotobuf::SyncNearDeltaInfo,
    ) {
        use crate::live::opcodes_process::{aoi_delta_has_player_damage, process_aoi_sync_delta};
        if state.pending_auto_reset.is_some() {
            let has_damage = sync_near_delta_info
                .delta_infos
                .iter()
                .any(aoi_delta_has_player_damage);
            self.try_deferred_reset(state, has_damage, "SyncNearDeltaInfo");
        }

        for aoi_sync_delta in sync_near_delta_info.delta_infos {
            // Missing fields are normal, no need to log
            let _ =
                process_aoi_sync_delta(&mut state.encounter, &mut state.attr_store, aoi_sync_delta);
        }
    }

    fn try_deferred_reset(&self, state: &mut AppState, has_damage: bool, source: &str) {
        if !state
            .pending_auto_reset
            .is_some_and(|trigger_at| Instant::now() >= trigger_at)
        {
            return;
        }
        if !has_damage {
            return;
        }

        if state.encounter.total_dmg > 0 {
            info!(
                target: "app::live",
                "Deferred reset executing: damage in {}",
                source
            );
            self.reset_encounter(state, false);
        } else {
            info!(
                target: "app::live",
                "Deferred reset skipped: zero total_dmg in {} (total_heal={})",
                source,
                state.encounter.total_heal
            );
        }
        state.pending_auto_reset = None;
    }

    fn process_notify_revive_user(
        &self,
        state: &mut AppState,
        notify: blueprotobuf::NotifyReviveUser,
    ) {
        use crate::live::opcodes_process::process_notify_revive_user;
        if process_notify_revive_user(&mut state.encounter, notify).is_none() {
            warn!("Error processing NotifyReviveUser.. ignoring.");
        }
    }

    fn apply_reset_reason(&self, state: &mut AppState, reason: EncounterResetReason) {
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
            EncounterResetReason::NewObjective | EncounterResetReason::Wipe => {
                let trigger_at = Instant::now() + Duration::from_secs(3);
                state.pending_auto_reset = Some(trigger_at);
                info!(
                    target: "app::live",
                    "Deferred auto-reset armed (3s): {:?}",
                    reason
                );
            }
        }
    }

    fn apply_attr_store_changes(&self, state: &mut AppState) {
        let changes = state.attr_store.drain_changes();

        if !changes.panel_dirty_attrs.is_empty() {
            emit_panel_attr_update_if_needed(state, changes.panel_dirty_attrs);
        }

        if changes.cd_dirty {
            state
                .local_monitor
                .skill_cd_monitor
                .recalculate_cached_skill_cds(&state.attr_store);
            let filtered = state
                .local_monitor
                .skill_cd_monitor
                .build_filtered_skill_cds();
            emit_skill_cd_update_if_needed(state, filtered);
        }
    }

    fn apply_battle_state_resets_if_needed(&self, state: &mut AppState) {
        if let Some(reason) = state.battle_state.check_deferred_calls() {
            self.apply_reset_reason(state, reason);
            return;
        }

        if let Some(reason) = state
            .battle_state
            .check_for_wipe(&mut state.local_monitor.buff_monitor.active_buffs)
        {
            self.apply_reset_reason(state, reason);
        }
    }

    fn reset_encounter(&self, state: &mut AppState, is_manual: bool) {
        persist_and_save_encounter(state, is_manual, "reset");
        state.encounter.reset_combat_state();

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

    pub fn set_event_update_rate_ms(&self, rate_ms: u64) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetEventUpdateRateMs(rate_ms))
    }

    pub fn set_monitored_buffs(&self, buff_base_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitoredBuffs(buff_base_ids))
    }

    pub fn set_monitored_panel_attrs(&self, attr_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitoredPanelAttrs(attr_ids))
    }

    pub fn set_monitored_skills(&self, skill_level_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitoredSkills(skill_level_ids))
    }

    pub fn set_monitor_all_buff(&self, monitor_all_buff: bool) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetMonitorAllBuff(monitor_all_buff))
    }

    pub fn set_buff_priority(&self, priority_buff_ids: Vec<i32>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetBuffPriority(priority_buff_ids))
    }
}

impl BuffMonitor {
    fn process_buff_effect_bytes(
        &mut self,
        raw_bytes: &[u8],
        server_clock_offset: &mut i64,
    ) -> Option<Vec<BuffUpdateState>> {
        if self.monitored_buff_ids.is_empty() && !self.monitor_all_buff {
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

                        self.active_buffs.insert(
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
                        self.buff_order_dirty = true;
                    }
                } else if effect_type == EBuffEffectLogicPbType::BuffEffectBuffChange as i32 {
                    if let Ok(change_info) = BuffChange::decode(raw.as_slice()) {
                        if let Some(entry) = self.active_buffs.get_mut(&buff_uuid) {
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

            if buff_effect.r#type == Some(EBuffEventType::BuffEventRemove as i32)
                && self.active_buffs.remove(&buff_uuid).is_some()
            {
                self.buff_order_dirty = true;
            }
        }

        if self.buff_order_dirty {
            let priority_index: HashMap<i32, usize> = self
                .priority_buff_ids
                .iter()
                .enumerate()
                .map(|(idx, &base_id)| (base_id, idx))
                .collect();
            self.ordered_buff_uuids.clear();
            self.ordered_buff_uuids
                .extend(self.active_buffs.keys().copied());
            self.ordered_buff_uuids.sort_by_key(|uuid| {
                let (base_id, create_time, buff_uuid) = self
                    .active_buffs
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
            self.buff_order_dirty = false;
        }

        let payload: Vec<BuffUpdateState> = self
            .ordered_buff_uuids
            .iter()
            .filter_map(|uuid| self.active_buffs.get(uuid))
            .filter(|buff| self.monitor_all_buff || self.monitored_buff_ids.contains(&buff.base_id))
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
}

impl AppStateManager {
    /// Updates and emits events.
    pub fn update_and_emit_events_with_state(&self, state: &mut AppState) {
        if !state.event_manager.should_emit_events() {
            return;
        }

        let mut payload = crate::live::event_manager::generate_live_data_payload(
            &state.encounter,
            &state.attr_store,
        );

        let mut boss_deaths: Vec<(i64, String)> = Vec::new();
        let current_time_ms = now_ms() as u128;
        for boss in &mut payload.bosses {
            let hp_percent = if let (Some(curr_hp), Some(max_hp)) = (boss.current_hp, boss.max_hp) {
                if max_hp > 0 {
                    curr_hp as f64 / max_hp as f64 * 100.0
                } else {
                    100.0
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
                    boss_deaths.push((boss.uid, boss.name.clone()));
                    boss.current_hp = Some(0);
                }
            } else {
                state.low_hp_bosses.remove(&boss.uid);
            }
        }

        state.event_manager.emit_live_data(payload);

        if !boss_deaths.is_empty() {
            for (boss_uid, boss_name) in boss_deaths {
                let first_time = state.event_manager.emit_boss_death(boss_name, boss_uid);
                if !first_time {
                    continue;
                }
            }
        }
    }
}
