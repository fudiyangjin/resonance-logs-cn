use crate::database::{EncounterMetadata, PlayerNameEntry, now_ms, save_encounter};
use crate::live::buff_monitor::{BossBuffMonitors, BuffMonitor};
use crate::live::commands_models::{
    CounterUpdateState, FightResourceState, PanelAttrState, SkillCdState,
};
use crate::live::counter_tracker::{BuffCounterTracker, CounterRule};
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::event_manager::EventManager;
use crate::live::opcodes_models::{AttrType, Encounter, Entity};
use crate::live::skill_cd_monitor::SkillCdMonitor;
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::EEntityType;
use log::{info, warn};
use std::collections::{HashMap, HashSet};
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
    /// Boss buff monitoring state and configuration.
    pub boss_buff_monitors: BossBuffMonitors,
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
    /// UIDs whose display names have already been pushed to the monster overlay.
    pub sent_overlay_uids: HashSet<i64>,
}

#[derive(Debug)]
pub struct EntityMonitor {
    pub uid: i64,
    pub buff_monitor: BuffMonitor,
    pub skill_cd_monitor: SkillCdMonitor,
    pub monitored_panel_attr_ids: Vec<i32>,
    pub fight_res_state: Option<FightResourceState>,
    pub counter_tracker: BuffCounterTracker,
}

impl EntityMonitor {
    fn new(uid: i64) -> Self {
        Self {
            uid,
            buff_monitor: BuffMonitor::new(),
            skill_cd_monitor: SkillCdMonitor::new(),
            monitored_panel_attr_ids: Vec::new(),
            fight_res_state: None,
            counter_tracker: BuffCounterTracker::default(),
        }
    }

    fn clear_runtime_state(&mut self) {
        self.buff_monitor.active_buffs.clear();
        self.skill_cd_monitor.skill_cd_map.clear();
        self.fight_res_state = None;
        self.counter_tracker.reset_counts();
    }
}

#[derive(Debug, Clone)]
pub enum LiveControlCommand {
    StateEvent(StateEvent),
    TogglePauseEncounter,
    SetEventUpdateRateMs(u64),
    SetMonitoredBuffs(Vec<i32>),
    SetBossMonitoredBuffs {
        global_ids: Vec<i32>,
        self_applied_ids: Vec<i32>,
    },
    SetMonitoredPanelAttrs(Vec<i32>),
    SetMonitoredSkills(Vec<i32>),
    SetMonitorAllBuff(bool),
    SetBuffCounterRules(Vec<CounterRule>),
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
            boss_buff_monitors: BossBuffMonitors::new(),
            initial_scene_change_handled: false,
            event_update_rate_ms: 200,
            attr_store: EntityAttrStore::with_capacity(256),
            server_clock_offset: 0,
            battle_state: BattleStateMachine::default(),
            pending_auto_reset: None,
            sent_overlay_uids: HashSet::new(),
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

fn emit_buff_counter_update_if_needed(state: &mut AppState, payload: Vec<CounterUpdateState>) {
    state.event_manager.emit_buff_counter_update(payload);
}

fn hydrate_entities_from_attr_store(state: &mut AppState) {
    for (&uid, entity) in &mut state.encounter.entity_uid_to_entity {
        state.attr_store.hydrate_entity(uid, entity);
    }
}

fn resolve_entity_display_name(uid: i64, entity: &Entity, attr_store: &EntityAttrStore) -> String {
    if let Some(name) = attr_store
        .attr(uid, AttrType::Name)
        .and_then(|value| value.as_string())
    {
        return name.to_string();
    }
    if !entity.name.is_empty() {
        return entity.name.clone();
    }
    format!("Boss {uid}")
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
    let elapsed_ms = encounter
        .time_last_combat_packet_ms
        .saturating_sub(encounter.time_fight_start_ms);
    let active_combat_time_ms = encounter.active_combat_time_ms.min(elapsed_ms);

    EncounterMetadata {
        started_at_ms: encounter.time_fight_start_ms as i64,
        ended_at_ms: Some(now_ms()),
        local_player_id: Some(encounter.local_player_uid),
        total_dmg: encounter.total_dmg.min(i64::MAX as u128) as i64,
        total_heal: encounter.total_heal.min(i64::MAX as u128) as i64,
        scene_id: encounter.current_scene_id,
        scene_name: encounter.current_scene_name.clone(),
        duration: (elapsed_ms as f64) / 1000.0,
        active_combat_duration: Some(active_combat_time_ms as f64 / 1000.0),
        is_manually_reset: is_manual,
        boss_names,
        player_names,
    }
}

fn persist_and_save_encounter(state: &mut AppState, is_manual: bool, source: &str) {
    hydrate_entities_from_attr_store(state);
    let defeated: Vec<String> = state
        .encounter
        .entity_uid_to_entity
        .values()
        .filter(|entity| entity.is_boss())
        .filter_map(|entity| {
            if entity.name.is_empty() {
                None
            } else {
                Some(entity.name.clone())
            }
        })
        .collect();
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
                state.local_monitor.buff_monitor.monitored_buff_ids =
                    buff_base_ids.into_iter().collect();
            }
            LiveControlCommand::SetBossMonitoredBuffs {
                global_ids,
                self_applied_ids,
            } => {
                state
                    .boss_buff_monitors
                    .set_config(global_ids, self_applied_ids);
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
            LiveControlCommand::SetBuffCounterRules(rules) => {
                state.local_monitor.counter_tracker.set_rules(rules);
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
        }
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

        persist_and_save_encounter(state, false, "container_data_resync");
        state.encounter.entity_uid_to_entity.clear();
        state.attr_store.clear_all_entities();
        state.encounter.reset_combat_state();
        state.local_monitor.clear_runtime_state();
        state.boss_buff_monitors.clear();
        state.sent_overlay_uids.clear();
        state.battle_state = BattleStateMachine::default();
        state.pending_auto_reset = None;

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

        let mut counter_dirty = false;
        for damage_event in &result.local_damage_events {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_event(
                damage_event.skill_key,
                damage_event.target_uid,
                state.encounter.local_player_uid,
            );
        }

        if let Some(raw_bytes) = result.buff_effect_bytes {
            let buff_process_result = state.local_monitor.buff_monitor.process_buff_effect_bytes(
                &raw_bytes,
                &mut state.server_clock_offset,
                state.encounter.local_player_uid,
            );
            if let Some(payload) = buff_process_result.update_payload {
                state.event_manager.emit_buff_update(payload);
            }
            counter_dirty |= state
                .local_monitor
                .counter_tracker
                .on_buff_changes(&buff_process_result.changes);
        }

        if counter_dirty {
            emit_buff_counter_update_if_needed(
                state,
                state.local_monitor.counter_tracker.build_payload(),
            );
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

        let mut counter_dirty = false;
        for mut aoi_sync_delta in sync_near_delta_info.delta_infos {
            let target_uid = aoi_sync_delta.uuid.map(|uuid| uuid >> 16);
            let buff_bytes = aoi_sync_delta.buff_effect.take();

            // Missing fields are normal, no need to log
            if let Some(events) =
                process_aoi_sync_delta(&mut state.encounter, &mut state.attr_store, aoi_sync_delta)
            {
                for event in &events {
                    counter_dirty |= state.local_monitor.counter_tracker.on_damage_event(
                        event.skill_key,
                        event.target_uid,
                        state.encounter.local_player_uid,
                    );
                }
            }

            if let (Some(target_uid), Some(raw_bytes)) = (target_uid, buff_bytes) {
                let is_boss = state
                    .encounter
                    .entity_uid_to_entity
                    .get(&target_uid)
                    .map(|entity| entity.is_boss())
                    .unwrap_or(false);
                if is_boss {
                    let local_player_uid = state.encounter.local_player_uid;
                    let monitor = state.boss_buff_monitors.monitor_for(target_uid);
                    let buff_process_result = monitor.process_buff_effect_bytes(
                        &raw_bytes,
                        &mut state.server_clock_offset,
                        local_player_uid,
                    );
                    if let Some(payload) = buff_process_result.update_payload {
                        state
                            .event_manager
                            .emit_boss_buff_update(target_uid, payload);
                    }
                }
            }
        }

        if counter_dirty {
            emit_buff_counter_update_if_needed(
                state,
                state.local_monitor.counter_tracker.build_payload(),
            );
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

            // Emit an encounter update with cleared state so frontend updates immediately
            use crate::live::commands_models::HeaderInfo;
            let cleared_header = HeaderInfo {
                total_dps: 0.0,
                total_dmg: 0,
                elapsed_ms: 0,
                active_combat_time_ms: 0,
                fight_start_timestamp_ms: 0,
                bosses: vec![],
                scene_id: state.encounter.current_scene_id,
                scene_name: state.encounter.current_scene_name.clone(),
            };
            state
                .event_manager
                .emit_encounter_update(cleared_header, false);
        }
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

    pub fn set_boss_monitored_buffs(
        &self,
        global_ids: Vec<i32>,
        self_applied_ids: Vec<i32>,
    ) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetBossMonitoredBuffs {
            global_ids,
            self_applied_ids,
        })
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

    pub fn set_buff_counter_rules(&self, rules: Vec<CounterRule>) -> Result<(), String> {
        self.send_control(LiveControlCommand::SetBuffCounterRules(rules))
    }
}

impl AppStateManager {
    /// Updates and emits events.
    pub fn update_and_emit_events_with_state(&self, state: &mut AppState) {
        if !state.event_manager.should_emit_events() {
            return;
        }

        let payload = crate::live::event_manager::generate_live_data_payload(
            &state.encounter,
            &state.attr_store,
        );

        state.event_manager.emit_live_data(payload);

        let mut new_names = HashMap::new();

        for (&boss_uid, entity) in &state.encounter.entity_uid_to_entity {
            if !entity.is_boss() {
                continue;
            }

            if state.sent_overlay_uids.insert(boss_uid) {
                new_names.insert(
                    boss_uid,
                    resolve_entity_display_name(boss_uid, entity, &state.attr_store),
                );
            }

            let entries = state
                .attr_store
                .hate_lists()
                .get(&boss_uid)
                .cloned()
                .unwrap_or_default();

            for entry in &entries {
                if state.sent_overlay_uids.insert(entry.uid) {
                    let name = state
                        .attr_store
                        .attr(entry.uid, AttrType::Name)
                        .and_then(|value| value.as_string())
                        .map(ToString::to_string)
                        .unwrap_or_else(|| format!("UID {}", entry.uid));
                    new_names.insert(entry.uid, name);
                }
            }

            state.event_manager.emit_hate_list_update(boss_uid, entries);
        }

        if !new_names.is_empty() {
            state.event_manager.emit_entity_name_map(new_names);
        }
    }
}
