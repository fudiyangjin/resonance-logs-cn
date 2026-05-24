use crate::database::{EncounterMetadata, PlayerNameEntry, now_ms, save_encounter};
use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::live::buff_monitor::{
    BuffTargetKind, BuffWatchProfile, EntityBuffMonitorConfig, EntityBuffMonitors,
};
use crate::live::commands_models::{
    CounterUpdateState, FightResourceEntry, FightResourceState, PanelAttrState, ShieldDetailEntry,
    SkillCdState, TrainingDummyState, to_death_record,
};
use crate::live::counter_tracker::{BuffCounterTracker, CounterRule};
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::entity_id::entity_uuid_string;
use crate::live::event_manager::EventManager;
use crate::live::opcodes_models::{AttrType, AttrValue, DeathRecord, Encounter, Entity};
use crate::live::skill_cd_monitor::SkillCdMonitor;
use crate::live::team::{TeamEvent, TeamRuntimeState};
use crate::live::training_dummy::{
    TrainingDummyMonsterId, TrainingDummyRuntime, inspect_aoi_delta,
};
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::AoiSyncDelta;
use blueprotobuf_lib::blueprotobuf::EEntityType;
use log::{info, warn};
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};

/// Represents the possible events that can be handled by the state manager.
#[derive(Debug, Clone)]
pub enum StateEvent {
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
    /// A team service notification.
    Team(TeamEvent),
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
    /// Buff monitoring state for all tracked entities keyed by entity UUID.
    pub entity_buff_monitors: EntityBuffMonitors,
    /// Buff watch lists split by target kind.
    pub entity_buff_config: EntityBuffMonitorConfig,
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
    /// Runtime state for training dummy mode.
    pub training_dummy: TrainingDummyRuntime,
    /// Entity UUIDs whose display names have already been pushed to the monster overlay.
    pub sent_overlay_entity_uuids: HashSet<i64>,
    /// Set to true whenever a new DeathRecord has been appended to an Entity, signalling that
    /// the next emit cycle should push a full death-replay snapshot.
    pub death_snapshot_dirty: bool,
    /// Runtime state from GrpcTeamNtf packets, which can arrive on a separate TCP link.
    pub team: TeamRuntimeState,
}

#[derive(Debug)]
pub struct EntityMonitor {
    pub entity_uuid: i64,
    pub skill_cd_monitor: SkillCdMonitor,
    pub monitored_panel_attr_ids: Vec<i32>,
    pub fight_res_state: Option<FightResourceState>,
    pub counter_tracker: BuffCounterTracker,
}

impl EntityMonitor {
    fn new(entity_uuid: i64) -> Self {
        Self {
            entity_uuid,
            skill_cd_monitor: SkillCdMonitor::new(),
            monitored_panel_attr_ids: Vec::new(),
            fight_res_state: None,
            counter_tracker: BuffCounterTracker::default(),
        }
    }

    fn clear_runtime_state(&mut self) {
        self.skill_cd_monitor.skill_cd_map.clear();
        self.fight_res_state = None;
        self.counter_tracker.reset_counts();
    }
}

#[derive(Debug, Clone)]
pub enum LiveControlCommand {
    StateEvent(StateEvent),
    TogglePauseEncounter,
    ApplyMonitorRuntimeSnapshot(MonitorRuntimeSnapshot),
    StartTrainingDummy {
        monster_id: TrainingDummyMonsterId,
    },
    StopTrainingDummy,
    SetEventUpdateRateMs(u64),
    SetMonitoredBuffs(Vec<i32>),
    SetMonitorAllBuff(bool),
    SetBossMonitoredBuffs {
        global_ids: Vec<i32>,
        self_applied_ids: Vec<i32>,
    },
    SetTeammateMonitoredBuffs {
        any_source_ids: Vec<i32>,
        local_player_source_ids: Vec<i32>,
        target_self_source_ids: Vec<i32>,
        monitor_all: bool,
    },
    SetMonitoredPanelAttrs(Vec<i32>),
    SetMonitoredSkills(Vec<i32>),
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
            entity_buff_monitors: EntityBuffMonitors::new(),
            entity_buff_config: EntityBuffMonitorConfig::default(),
            initial_scene_change_handled: false,
            event_update_rate_ms: 200,
            attr_store: EntityAttrStore::with_capacity(256),
            server_clock_offset: 0,
            battle_state: BattleStateMachine::default(),
            pending_auto_reset: None,
            training_dummy: TrainingDummyRuntime::default(),
            sent_overlay_entity_uuids: HashSet::new(),
            death_snapshot_dirty: false,
            team: TeamRuntimeState::default(),
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

fn emit_shield_detail_update_if_needed(state: &mut AppState, mut entries: Vec<ShieldDetailEntry>) {
    // Note: unlike other *_if_needed emitters, empty `entries` is meaningful
    // (all shields expired) and must still be forwarded so the overlay clears.
    let uid = state.attr_store.local_player_uuid();
    let current_hp = state
        .attr_store
        .attr(uid, AttrType::CurrentHp)
        .and_then(AttrValue::as_int)
        .unwrap_or(0);
    let max_hp = state
        .attr_store
        .attr(uid, AttrType::MaxHp)
        .and_then(AttrValue::as_int)
        .unwrap_or(0);

    // Enrich entries with buff monitor data (base_id, expire_time)
    let clock_offset = state.server_clock_offset;
    for entry in &mut entries {
        let buff_uuid_i32 = entry.buff_uuid as i32;
        if let Some(active_buff) = state
            .entity_buff_monitors
            .monitors
            .get(&state.encounter.local_player_uuid)
            .and_then(|monitor| monitor.active_buffs.get(&buff_uuid_i32))
        {
            entry.base_id = active_buff.base_id;
            if active_buff.duration > 0 {
                // expire = server_create_time + offset (→ local time) + duration
                entry.expire_time_ms = active_buff
                    .create_time
                    .saturating_add(clock_offset)
                    .saturating_add(active_buff.duration as i64);
            }
        }
    }

    state
        .event_manager
        .emit_shield_detail_update(current_hp, max_hp, entries);
}

fn emit_buff_counter_update_if_needed(state: &mut AppState, payload: Vec<CounterUpdateState>) {
    state.event_manager.emit_buff_counter_update(payload);
}

fn hydrate_entities_from_attr_store(state: &mut AppState) {
    for (&entity_uuid, entity) in &mut state.encounter.entity_uuid_to_entity {
        state.attr_store.hydrate_entity(entity_uuid, entity);
    }
}

fn resolve_known_player_display_name(
    entity_uuid: i64,
    entity: Option<&Entity>,
    attr_store: &EntityAttrStore,
) -> Option<String> {
    if let Some(name) = attr_store
        .attr(entity_uuid, AttrType::Name)
        .and_then(|value| value.as_string())
        .filter(|name| !name.is_empty())
    {
        return Some(name.to_string());
    }
    entity.and_then(|entity| (!entity.name.is_empty()).then(|| entity.name.clone()))
}

fn collect_player_names(encounter: &Encounter) -> Vec<PlayerNameEntry> {
    let mut player_names: Vec<PlayerNameEntry> =
        Vec::with_capacity(encounter.entity_uuid_to_entity.len());
    player_names.extend(
        encounter
            .entity_uuid_to_entity
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

fn is_known_monster_entity(state: &AppState, entity_uuid: i64) -> bool {
    state
        .encounter
        .entity_uuid_to_entity
        .get(&entity_uuid)
        .is_some_and(|entity| entity.entity_type == EEntityType::EntMonster)
}

fn current_attack_target_uuid(state: &AppState) -> Option<i64> {
    let local_player_uuid = state.encounter.local_player_uuid;
    if local_player_uuid == 0 {
        return None;
    }

    let target_uuid = state
        .attr_store
        .attr(local_player_uuid, AttrType::TargetId)
        .and_then(AttrValue::as_int)
        .filter(|uuid| *uuid > 0)?;

    state
        .encounter
        .entity_uuid_to_entity
        .get(&target_uuid)
        .filter(|entity| entity.entity_type == EEntityType::EntMonster)?;

    if state.attr_store.is_dead(target_uuid) {
        return None;
    }

    Some(target_uuid)
}

fn classify_buff_effect_target(state: &AppState, target_uuid: i64) -> Option<BuffTargetKind> {
    if target_uuid == state.encounter.local_player_uuid && target_uuid != 0 {
        return Some(BuffTargetKind::LocalPlayer);
    }
    if is_known_monster_entity(state, target_uuid) {
        return Some(BuffTargetKind::Monster);
    }
    if state.team.members.contains(&target_uuid) {
        return Some(BuffTargetKind::Teammate);
    }
    None
}

fn classify_buff_snapshot_target(state: &AppState, target_uuid: i64) -> Option<BuffTargetKind> {
    if target_uuid == state.encounter.local_player_uuid && target_uuid != 0 {
        return Some(BuffTargetKind::LocalPlayer);
    }
    if current_attack_target_uuid(state) == Some(target_uuid) {
        return Some(BuffTargetKind::Monster);
    }
    if state.team.members.contains(&target_uuid) {
        return Some(BuffTargetKind::Teammate);
    }
    None
}

fn collect_overlay_identity_for_entity(
    state: &mut AppState,
    entity_uuid: i64,
    player_names: &mut HashMap<String, String>,
    monster_ids: &mut HashMap<String, i32>,
) {
    let entity_uuid_string = entity_uuid_string(entity_uuid);
    let entity = state.encounter.entity_uuid_to_entity.get(&entity_uuid);

    if let Some(monster_id) = entity.and_then(|entity| entity.monster_type_id) {
        if state.sent_overlay_entity_uuids.insert(entity_uuid) {
            monster_ids.insert(entity_uuid_string, monster_id);
        }
        return;
    }

    if let Some(name) = resolve_known_player_display_name(entity_uuid, entity, &state.attr_store) {
        if state.sent_overlay_entity_uuids.insert(entity_uuid) {
            player_names.insert(entity_uuid_string, name);
        }
    }
}

fn collect_overlay_identity_for_hate_entries(
    state: &mut AppState,
    entries: &[crate::live::commands_models::HateEntry],
    player_names: &mut HashMap<String, String>,
    monster_ids: &mut HashMap<String, i32>,
) {
    for entry in entries {
        let Ok(entity_uuid) = entry.entity_uuid.parse::<i64>() else {
            continue;
        };
        collect_overlay_identity_for_entity(state, entity_uuid, player_names, monster_ids);
    }
}

fn process_entity_buff_effect_bytes(
    state: &mut AppState,
    target_uuid: i64,
    raw_bytes: &[u8],
) -> Option<(BuffTargetKind, crate::live::buff_monitor::BuffProcessResult)> {
    let kind = classify_buff_effect_target(state, target_uuid)?;
    if kind != BuffTargetKind::LocalPlayer && !state.entity_buff_config.profile_for(kind).enabled {
        return None;
    }

    let result = state
        .entity_buff_monitors
        .monitor_for(target_uuid)
        .process_buff_effect_bytes(raw_bytes, &mut state.server_clock_offset);
    Some((kind, result))
}

fn encounter_has_stats(encounter: &Encounter) -> bool {
    encounter.total_dmg > 0
        || encounter.total_heal > 0
        || encounter
            .entity_uuid_to_entity
            .values()
            .any(|e| e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0)
}

fn build_training_dummy_state(runtime: &TrainingDummyRuntime) -> TrainingDummyState {
    TrainingDummyState {
        phase: runtime.phase,
    }
}

fn emit_training_dummy_update_if_changed(state: &mut AppState, previous: TrainingDummyState) {
    let current = build_training_dummy_state(&state.training_dummy);
    if current != previous && state.event_manager.should_emit_events() {
        state.event_manager.emit_training_dummy_update(current);
    }
}

fn build_encounter_metadata(
    encounter: &Encounter,
    boss_monster_ids: Vec<i32>,
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
        local_player_id: Some(encounter.local_player_uuid),
        total_dmg: encounter.total_dmg.min(i64::MAX as u128) as i64,
        total_heal: encounter.total_heal.min(i64::MAX as u128) as i64,
        scene_id: encounter.current_scene_id,
        dungeon_difficulty: encounter.current_dungeon_difficulty,
        duration: (elapsed_ms as f64) / 1000.0,
        active_combat_duration: Some(active_combat_time_ms as f64 / 1000.0),
        is_manually_reset: is_manual,
        boss_monster_ids,
        player_names,
    }
}

fn persist_and_save_encounter(state: &mut AppState, is_manual: bool, source: &str) {
    hydrate_entities_from_attr_store(state);
    let mut boss_monster_ids: Vec<i32> = state
        .encounter
        .entity_uuid_to_entity
        .values()
        .filter(|entity| entity.is_boss())
        .filter_map(|entity| entity.monster_type_id)
        .collect();
    boss_monster_ids.sort_unstable();
    boss_monster_ids.dedup();
    let player_names = collect_player_names(&state.encounter);
    let metadata =
        build_encounter_metadata(&state.encounter, boss_monster_ids, player_names, is_manual);

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
            metadata.boss_monster_ids.len(),
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
                    | StateEvent::SyncContainerDirtyData(_)
                    | StateEvent::SyncToMeDeltaInfo(_)
                    | StateEvent::SyncNearDeltaInfo(_)
            )
        {
            info!("packet dropped due to encounter paused");
            return;
        }

        let mut counter_dirty = state.local_monitor.counter_tracker.tick_counters(
            now_ms(),
            &state.attr_store,
            state.encounter.local_player_uuid,
        );
        match event {
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
                counter_dirty |= self.process_sync_to_me_delta_info(state, data);
                self.apply_battle_state_resets_if_needed(state);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncNearDeltaInfo(data) => {
                counter_dirty |= self.process_sync_near_delta_info(state, data);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::Team(event) => {
                self.process_team_event(state, event);
            }
            StateEvent::ResetEncounter { is_manual } => {
                state.pending_auto_reset = None;
                self.reset_encounter(state, is_manual);
            }
        }
        if counter_dirty {
            emit_buff_counter_update_if_needed(
                state,
                state
                    .local_monitor
                    .counter_tracker
                    .build_payload(&state.attr_store, state.encounter.local_player_uuid),
            );
        }
        self.apply_attr_store_changes(state);
    }

    fn process_team_event(&self, state: &mut AppState, event: TeamEvent) {
        info!(target: "app::live", "team event: {:?}", event);
        state
            .team
            .apply_event(event, state.encounter.local_player_uuid);
        info!(
            target: "app::live",
            "team state team_id={} leader_uuid={} members={:?}",
            state.team.team_id,
            state.team.leader_uuid,
            state.team.members
        );
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
            LiveControlCommand::ApplyMonitorRuntimeSnapshot(snapshot) => {
                self.apply_monitor_runtime_snapshot_with_state(state, snapshot);
            }
            LiveControlCommand::StartTrainingDummy { monster_id } => {
                let previous = build_training_dummy_state(&state.training_dummy);
                state.training_dummy.arm(monster_id);
                emit_training_dummy_update_if_changed(state, previous);
            }
            LiveControlCommand::StopTrainingDummy => {
                let previous = build_training_dummy_state(&state.training_dummy);
                if state.training_dummy.locked_target_uuid.is_some()
                    && encounter_has_stats(&state.encounter)
                {
                    self.reset_encounter(state, false);
                }
                state.training_dummy.clear();
                emit_training_dummy_update_if_changed(state, previous);
            }
            LiveControlCommand::SetEventUpdateRateMs(rate_ms) => {
                state.event_update_rate_ms = rate_ms;
            }
            LiveControlCommand::SetMonitoredBuffs(buff_base_ids) => {
                state.entity_buff_config.local_player = BuffWatchProfile::from_any_source_ids(
                    buff_base_ids,
                    state.entity_buff_config.local_player.monitor_all,
                );
            }
            LiveControlCommand::SetMonitorAllBuff(monitor_all_buff) => {
                state.entity_buff_config.local_player.monitor_all = monitor_all_buff;
                state.entity_buff_config.local_player.enabled = monitor_all_buff
                    || !state
                        .entity_buff_config
                        .local_player
                        .any_source_ids
                        .is_empty()
                    || !state
                        .entity_buff_config
                        .local_player
                        .local_player_source_ids
                        .is_empty()
                    || !state
                        .entity_buff_config
                        .local_player
                        .target_self_source_ids
                        .is_empty();
            }
            LiveControlCommand::SetBossMonitoredBuffs {
                global_ids,
                self_applied_ids,
            } => {
                state.entity_buff_config.monster =
                    BuffWatchProfile::from_any_and_local_player_source_ids(
                        global_ids,
                        self_applied_ids,
                    );
            }
            LiveControlCommand::SetTeammateMonitoredBuffs {
                any_source_ids,
                local_player_source_ids,
                target_self_source_ids,
                monitor_all,
            } => {
                state.entity_buff_config.teammate = BuffWatchProfile::from_all_sources(
                    any_source_ids,
                    local_player_source_ids,
                    target_self_source_ids,
                    monitor_all,
                );
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
            LiveControlCommand::SetBuffCounterRules(rules) => {
                state.local_monitor.counter_tracker.set_rules(rules);
            }
        }
    }

    pub(crate) fn apply_monitor_runtime_snapshot_with_state(
        &self,
        state: &mut AppState,
        snapshot: MonitorRuntimeSnapshot,
    ) {
        let MonitorRuntimeSnapshot {
            live,
            skill,
            monster,
            teammate,
        } = snapshot;

        info!(
            target: "app::live",
            "[runtime-monitor] applying snapshot: event_update_rate_ms={} skill_enabled={} monster_enabled={} teammate_enabled={}",
            live.event_update_rate_ms,
            skill.enabled,
            monster.enabled,
            teammate.enabled
        );
        info!(
            target: "app::live",
            "[monitor-buff] set monitorAllBuff: {:?}",
            skill.monitor_all_buff
        );
        info!(
            target: "app::live",
            "[skill-cd] set monitored skills: {:?}",
            skill.monitored_skill_ids
        );
        info!(
            target: "app::live",
            "[buff] set monitored buffs: {:?}",
            skill.monitored_buff_ids
        );
        info!(
            target: "app::live",
            "[panel-attr] set monitored attrs: {:?}",
            skill.monitored_panel_attr_ids
        );
        info!(
            target: "app::live",
            "[buff-counter] set rules: {}",
            skill.buff_counter_rules.len()
        );
        info!(
            target: "app::live",
            "[boss-buff] set monitored buffs: global={:?} self_applied={:?}",
            monster.global_ids,
            monster.self_applied_ids
        );
        info!(
            target: "app::live",
            "[teammate-buff] set monitored buffs: any={:?} local_player={:?} target_self={:?} monitor_all={:?}",
            teammate.any_source_ids,
            teammate.local_player_source_ids,
            teammate.target_self_source_ids,
            teammate.monitor_all
        );

        self.apply_control_command(
            state,
            LiveControlCommand::SetEventUpdateRateMs(live.event_update_rate_ms),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetMonitorAllBuff(skill.monitor_all_buff),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetMonitoredSkills(skill.monitored_skill_ids),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetMonitoredBuffs(skill.monitored_buff_ids),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetMonitoredPanelAttrs(skill.monitored_panel_attr_ids),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetBuffCounterRules(skill.buff_counter_rules),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetBossMonitoredBuffs {
                global_ids: monster.global_ids,
                self_applied_ids: monster.self_applied_ids,
            },
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetTeammateMonitoredBuffs {
                any_source_ids: teammate.any_source_ids,
                local_player_source_ids: teammate.local_player_source_ids,
                target_self_source_ids: teammate.target_self_source_ids,
                monitor_all: teammate.monitor_all,
            },
        );
    }

    // all scene id extraction logic is here (its pretty rough)
    fn process_enter_scene(&self, state: &mut AppState, enter_scene: blueprotobuf::EnterScene) {
        use crate::live::opcodes_process::process_enter_scene as parse_enter_scene;

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
        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.clear();
        emit_training_dummy_update_if_changed(state, previous);

        if let Some(scene_id) = parsed.scene_id {
            // Update encounter with scene info
            state.encounter.current_scene_id = Some(scene_id);
            state.encounter.current_dungeon_difficulty = None;

            info!("Scene changed to ID: {}", scene_id);

            // Emit scene change event
            if state.event_manager.should_emit_events() {
                info!("Emitting scene change event for ID: {}", scene_id);
                state.event_manager.emit_scene_change(scene_id, None);
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
        state.encounter.entity_uuid_to_entity.clear();
        state.attr_store.clear_all_entities();
        state.encounter.reset_combat_state();
        state.local_monitor.clear_runtime_state();
        state.entity_buff_monitors.clear();
        state.sent_overlay_entity_uuids.clear();
        state.battle_state = BattleStateMachine::default();
        state.pending_auto_reset = None;
        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.clear();
        emit_training_dummy_update_if_changed(state, previous);
        info!("team members: {:?}", state.team.members);

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

        let difficulty = sync_dungeon_data
            .v_data
            .as_ref()
            .and_then(|v| v.dungeon_scene_info.as_ref())
            .and_then(|info| info.difficulty);

        if let Some(difficulty) = difficulty {
            let previous_difficulty = state.encounter.current_dungeon_difficulty;
            state.encounter.current_dungeon_difficulty = Some(difficulty);

            if let Some(scene_id) = state.encounter.current_scene_id
                && previous_difficulty != Some(difficulty)
                && state.event_manager.should_emit_events()
            {
                state
                    .event_manager
                    .emit_scene_change(scene_id, Some(difficulty));
            }
        }

        let encounter_has_stats = encounter_has_stats(&state.encounter);

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

        let encounter_has_stats = encounter_has_stats(&state.encounter);

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
    ) -> bool {
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

        let combat_target_filter = sync_to_me_delta_info
            .delta_info
            .as_ref()
            .and_then(|delta| delta.base_delta.as_ref())
            .and_then(|base_delta| {
                let local_player_uuid = sync_to_me_delta_info
                    .delta_info
                    .as_ref()
                    .and_then(|delta| delta.uuid)
                    .unwrap_or(state.encounter.local_player_uuid);
                self.prepare_training_dummy_for_delta(
                    state,
                    base_delta,
                    local_player_uuid,
                    "SyncToMeDeltaInfo",
                )
            });

        let result = process_sync_to_me_delta_info(
            &mut state.encounter,
            &mut state.attr_store,
            sync_to_me_delta_info,
            &state.local_monitor.monitored_panel_attr_ids,
            combat_target_filter,
        );

        if state.local_monitor.entity_uuid != state.encounter.local_player_uuid {
            state.local_monitor.entity_uuid = state.encounter.local_player_uuid;
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

        let mut counter_dirty = false;

        if let Some(values) = result.fight_resources {
            let ids = state
                .attr_store
                .fight_resource_ids(state.encounter.local_player_uuid);
            if !ids.is_empty() {
                let now = crate::database::now_ms();
                let new_state = FightResourceState {
                    entries: ids
                        .iter()
                        .copied()
                        .zip(values)
                        .map(|(id, value)| FightResourceEntry { id, value })
                        .collect(),
                    received_at: now,
                };
                counter_dirty |= state
                    .local_monitor
                    .counter_tracker
                    .on_fight_resource_update(&new_state.entries);
                state.local_monitor.fight_res_state = Some(new_state.clone());
                state.event_manager.emit_fight_resource_update(new_state);
            }
        }

        if !result.local_damage_events.is_empty() {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_events(
                &result.local_damage_events,
                state.encounter.local_player_uuid,
                &state.attr_store,
            );
        }

        if !result.local_damage_taken_events.is_empty() {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_taken_events(
                &result.local_damage_taken_events,
                state.encounter.local_player_uuid,
            );
        }

        if let Some(skill_base_id) = result.attr_skill_id {
            counter_dirty |= state
                .local_monitor
                .counter_tracker
                .on_skill_cast(skill_base_id);
        }

        if !result.skill_cds.is_empty() {
            state.attr_store.mark_cd_dirty();
            state
                .local_monitor
                .skill_cd_monitor
                .apply_skill_cd_updates(&result.skill_cds, &state.attr_store);
        }

        if let Some(raw_bytes) = result.buff_effect_bytes {
            let local_player_uuid = state.encounter.local_player_uuid;
            if let Some((BuffTargetKind::LocalPlayer, buff_process_result)) =
                process_entity_buff_effect_bytes(state, local_player_uuid, &raw_bytes)
            {
                let payload = state
                    .entity_buff_monitors
                    .monitors
                    .get(&local_player_uuid)
                    .map(|monitor| {
                        monitor.build_update_payload(
                            local_player_uuid,
                            local_player_uuid,
                            &state.entity_buff_config.local_player,
                            state.server_clock_offset,
                        )
                    })
                    .unwrap_or_default();
                state.event_manager.emit_buff_update(payload);
                counter_dirty |= state.local_monitor.counter_tracker.on_buff_changes(
                    &buff_process_result.changes,
                    &state.attr_store,
                    local_player_uuid,
                );
            }
        }

        counter_dirty |= state
            .local_monitor
            .counter_tracker
            .on_movement_sample(&state.attr_store, state.encounter.local_player_uuid);

        counter_dirty
    }

    fn process_sync_near_delta_info(
        &self,
        state: &mut AppState,
        sync_near_delta_info: blueprotobuf::SyncNearDeltaInfo,
    ) -> bool {
        use crate::live::opcodes_process::{
            aoi_delta_has_player_damage, apply_panel_attrs, process_aoi_sync_delta,
        };
        if state.pending_auto_reset.is_some() {
            let has_damage = sync_near_delta_info
                .delta_infos
                .iter()
                .any(aoi_delta_has_player_damage);
            self.try_deferred_reset(state, has_damage, "SyncNearDeltaInfo");
        }

        let mut counter_dirty = false;
        let mut aggregated_damage_events = Vec::new();
        let local_player_uuid = state.encounter.local_player_uuid;
        for mut aoi_sync_delta in sync_near_delta_info.delta_infos {
            let target_uuid = aoi_sync_delta.uuid;
            let is_local_player = target_uuid == Some(local_player_uuid) && local_player_uuid != 0;

            // Apply panel attrs for local player from AoiSyncDelta
            if is_local_player {
                if let Some(uuid) = aoi_sync_delta.uuid {
                    if EEntityType::from(uuid) == EEntityType::EntChar {
                        if let Some(attrs) = aoi_sync_delta.attrs.as_ref() {
                            apply_panel_attrs(
                                &mut state.attr_store,
                                attrs,
                                &state.local_monitor.monitored_panel_attr_ids,
                            );
                        }
                    }
                }
            }

            let buff_bytes = aoi_sync_delta.buff_effect.take();
            let combat_target_filter = self.prepare_training_dummy_for_delta(
                state,
                &aoi_sync_delta,
                local_player_uuid,
                "SyncNearDeltaInfo",
            );

            // Missing fields are normal, no need to log
            if let Some((events, _)) = process_aoi_sync_delta(
                &mut state.encounter,
                &mut state.attr_store,
                aoi_sync_delta,
                combat_target_filter,
                false,
            ) {
                aggregated_damage_events.extend(events);
            }

            if let (Some(target_uuid), Some(raw_bytes)) = (target_uuid, buff_bytes) {
                process_entity_buff_effect_bytes(state, target_uuid, &raw_bytes);
            }
        }

        if !aggregated_damage_events.is_empty() {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_events(
                &aggregated_damage_events,
                state.encounter.local_player_uuid,
                &state.attr_store,
            );
        }

        counter_dirty |= state
            .local_monitor
            .counter_tracker
            .on_movement_sample(&state.attr_store, local_player_uuid);

        counter_dirty
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
        let encounter_has_stats = encounter_has_stats(&state.encounter);
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

        if changes.shield_detail_dirty {
            emit_shield_detail_update_if_needed(state, changes.shield_detail_entries);
        }

        for death in changes.death_events {
            if let Some(entity) = state
                .encounter
                .entity_uuid_to_entity
                .get_mut(&death.entity_uuid)
            {
                let recent_damages: Vec<_> = entity.recent_taken_events.drain(..).collect();
                if recent_damages.is_empty() {
                    continue;
                }
                entity.deaths.push(DeathRecord {
                    victim_entity_uuid: death.entity_uuid,
                    death_timestamp_ms: death.timestamp_ms,
                    recent_damages,
                });
                state.death_snapshot_dirty = true;
            }
        }
    }

    fn apply_battle_state_resets_if_needed(&self, state: &mut AppState) {
        if let Some(reason) = state.battle_state.check_deferred_calls() {
            self.apply_reset_reason(state, reason);
            return;
        }

        if let Some(local_monitor) = state
            .entity_buff_monitors
            .monitors
            .get_mut(&state.encounter.local_player_uuid)
        {
            if let Some(reason) = state
                .battle_state
                .check_for_wipe(&mut local_monitor.active_buffs)
            {
                self.apply_reset_reason(state, reason);
            }
        }
    }

    fn reset_encounter(&self, state: &mut AppState, is_manual: bool) {
        persist_and_save_encounter(state, is_manual, "reset");
        state.encounter.reset_combat_state();
        state.death_snapshot_dirty = false;

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
                dungeon_difficulty: state.encounter.current_dungeon_difficulty,
                training_dummy: build_training_dummy_state(&state.training_dummy),
            };
            state
                .event_manager
                .emit_encounter_update(cleared_header, false);
        }
        if is_manual {
            state.battle_state = BattleStateMachine::default();
            if state.training_dummy.has_selection() {
                let previous = build_training_dummy_state(&state.training_dummy);
                state.training_dummy.rearm_selected();
                emit_training_dummy_update_if_changed(state, previous);
            }
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

    pub fn apply_monitor_runtime_snapshot(
        &self,
        snapshot: MonitorRuntimeSnapshot,
    ) -> Result<(), String> {
        self.send_control(LiveControlCommand::ApplyMonitorRuntimeSnapshot(snapshot))
    }

    pub fn start_training_dummy(&self, monster_id: TrainingDummyMonsterId) -> Result<(), String> {
        self.send_control(LiveControlCommand::StartTrainingDummy { monster_id })
    }

    pub fn stop_training_dummy(&self) -> Result<(), String> {
        self.send_control(LiveControlCommand::StopTrainingDummy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::buff_monitor::{ActiveBuff, BuffWatchProfile};
    use crate::live::entity_id::{canonical_player_uuid, entity_id_to_uuid};

    fn monster_uuid(uid: i64) -> i64 {
        entity_id_to_uuid(uid, EEntityType::EntMonster, false, false)
    }

    fn player_uuid(uid: i64) -> i64 {
        canonical_player_uuid(uid)
    }

    fn add_entity(state: &mut AppState, uuid: i64, entity_type: EEntityType) {
        state
            .encounter
            .entity_uuid_to_entity
            .insert(uuid, Entity::new(uuid, entity_type));
    }

    fn set_current_target(state: &mut AppState, target_uuid: i64) {
        let local_player_uuid = state.encounter.local_player_uuid;
        let _ = state.attr_store.set_attr(
            local_player_uuid,
            AttrType::TargetId,
            AttrValue::Int(target_uuid),
        );
    }

    fn active_buff(base_id: i32) -> ActiveBuff {
        ActiveBuff {
            base_id,
            layer: 1,
            duration: 1000,
            create_time: 10,
            received_time_ms: 20,
            fire_uuid: None,
            source_config_id: None,
        }
    }

    #[test]
    fn current_attack_target_requires_live_known_monster() {
        let mut state = AppState::new();
        let local_player_uuid = player_uuid(100);
        let target_monster_uuid = monster_uuid(200);
        let other_player_uuid = player_uuid(300);
        state.encounter.local_player_uuid = local_player_uuid;
        state.attr_store.set_local_uuid(local_player_uuid);
        add_entity(&mut state, local_player_uuid, EEntityType::EntChar);
        add_entity(&mut state, target_monster_uuid, EEntityType::EntMonster);
        add_entity(&mut state, other_player_uuid, EEntityType::EntChar);

        set_current_target(&mut state, target_monster_uuid);
        assert_eq!(
            current_attack_target_uuid(&state),
            Some(target_monster_uuid)
        );

        set_current_target(&mut state, other_player_uuid);
        assert_eq!(current_attack_target_uuid(&state), None);

        set_current_target(&mut state, monster_uuid(404));
        assert_eq!(current_attack_target_uuid(&state), None);

        set_current_target(&mut state, target_monster_uuid);
        let _ = state.attr_store.set_attr(
            target_monster_uuid,
            AttrType::ActorState,
            AttrValue::Int(i64::from(blueprotobuf::EActorState::ActorStateDead as i32)),
        );
        assert_eq!(current_attack_target_uuid(&state), None);
    }

    #[test]
    fn buff_effect_classification_tracks_all_monsters_but_snapshot_tracks_current_target_only() {
        let mut state = AppState::new();
        let local_player_uuid = player_uuid(100);
        let current_monster_uuid = monster_uuid(200);
        let other_monster_uuid = monster_uuid(201);
        state.encounter.local_player_uuid = local_player_uuid;
        state.attr_store.set_local_uuid(local_player_uuid);
        add_entity(&mut state, local_player_uuid, EEntityType::EntChar);
        add_entity(&mut state, current_monster_uuid, EEntityType::EntMonster);
        add_entity(&mut state, other_monster_uuid, EEntityType::EntMonster);
        set_current_target(&mut state, current_monster_uuid);

        assert_eq!(
            classify_buff_effect_target(&state, other_monster_uuid),
            Some(BuffTargetKind::Monster)
        );
        assert_eq!(
            classify_buff_snapshot_target(&state, current_monster_uuid),
            Some(BuffTargetKind::Monster)
        );
        assert_eq!(
            classify_buff_snapshot_target(&state, other_monster_uuid),
            None
        );
    }

    #[test]
    fn monster_snapshot_contains_only_attr_target_id_target() {
        let mut state = AppState::new();
        let local_player_uuid = player_uuid(100);
        let current_monster_uuid = monster_uuid(200);
        let other_monster_uuid = monster_uuid(201);
        state.encounter.local_player_uuid = local_player_uuid;
        state.attr_store.set_local_uuid(local_player_uuid);
        add_entity(&mut state, local_player_uuid, EEntityType::EntChar);
        add_entity(&mut state, current_monster_uuid, EEntityType::EntMonster);
        add_entity(&mut state, other_monster_uuid, EEntityType::EntMonster);
        set_current_target(&mut state, current_monster_uuid);
        state.entity_buff_config.monster = BuffWatchProfile::from_any_source_ids(vec![1], false);
        state
            .entity_buff_monitors
            .monitor_for(current_monster_uuid)
            .active_buffs
            .insert(1, active_buff(1));
        state
            .entity_buff_monitors
            .monitor_for(other_monster_uuid)
            .active_buffs
            .insert(1, active_buff(1));

        let snapshot = state.entity_buff_monitors.build_snapshots_for_kind(
            BuffTargetKind::Monster,
            &state.entity_buff_config,
            local_player_uuid,
            0,
            |entity_uuid| classify_buff_snapshot_target(&state, entity_uuid),
        );

        assert_eq!(snapshot.len(), 1);
        assert!(snapshot.contains_key(&entity_uuid_string(current_monster_uuid)));
        assert!(!snapshot.contains_key(&entity_uuid_string(other_monster_uuid)));
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

        if state.death_snapshot_dirty {
            let mut records: Vec<_> = state
                .encounter
                .entity_uuid_to_entity
                .values()
                .flat_map(|entity| entity.deaths.iter().map(to_death_record))
                .collect();
            records.sort_by_key(|r| r.death_timestamp_ms);
            state.event_manager.emit_death_replay(records);
            state.death_snapshot_dirty = false;
        }
        let local_player_uuid = state.encounter.local_player_uuid;
        let classify = |entity_uuid| classify_buff_snapshot_target(state, entity_uuid);

        let local_buff_snapshot = state.entity_buff_monitors.build_snapshots_for_kind(
            BuffTargetKind::LocalPlayer,
            &state.entity_buff_config,
            local_player_uuid,
            state.server_clock_offset,
            classify,
        );
        let boss_buff_snapshot = state.entity_buff_monitors.build_snapshots_for_kind(
            BuffTargetKind::Monster,
            &state.entity_buff_config,
            local_player_uuid,
            state.server_clock_offset,
            classify,
        );
        let teammate_buff_snapshot = state.entity_buff_monitors.build_snapshots_for_kind(
            BuffTargetKind::Teammate,
            &state.entity_buff_config,
            local_player_uuid,
            state.server_clock_offset,
            classify,
        );
        let current_target_uuid = current_attack_target_uuid(state);
        let mut all_hate_lists = HashMap::with_capacity(usize::from(current_target_uuid.is_some()));
        let mut player_names = HashMap::with_capacity(
            boss_buff_snapshot
                .len()
                .saturating_add(teammate_buff_snapshot.len()),
        );
        let mut monster_ids = HashMap::with_capacity(boss_buff_snapshot.len());

        if let Some(target_uuid) = current_target_uuid {
            collect_overlay_identity_for_entity(
                state,
                target_uuid,
                &mut player_names,
                &mut monster_ids,
            );

            let entries = state
                .attr_store
                .hate_lists()
                .get(&target_uuid)
                .cloned()
                .unwrap_or_default();
            collect_overlay_identity_for_hate_entries(
                state,
                &entries,
                &mut player_names,
                &mut monster_ids,
            );

            if !entries.is_empty() {
                all_hate_lists.insert(entity_uuid_string(target_uuid), entries);
            }
        }

        for target_uuid in teammate_buff_snapshot.keys() {
            let Ok(target_uuid_value) = target_uuid.parse::<i64>() else {
                continue;
            };
            collect_overlay_identity_for_entity(
                state,
                target_uuid_value,
                &mut player_names,
                &mut monster_ids,
            );
        }

        state.event_manager.emit_hate_list_update(all_hate_lists);

        if !player_names.is_empty() || !monster_ids.is_empty() {
            state
                .event_manager
                .emit_entity_identity_map(player_names, monster_ids);
        }
        if let Some(local_buffs) = local_buff_snapshot
            .get(&entity_uuid_string(local_player_uuid))
            .cloned()
        {
            state.event_manager.emit_buff_update(local_buffs);
        }
        state
            .event_manager
            .emit_boss_buff_update(boss_buff_snapshot);
        state
            .event_manager
            .emit_teammate_buff_update(teammate_buff_snapshot);
    }

    fn prepare_training_dummy_for_delta(
        &self,
        state: &mut AppState,
        delta: &AoiSyncDelta,
        local_player_uuid: i64,
        source: &str,
    ) -> Option<i64> {
        if !state.training_dummy.has_selection() {
            return None;
        }

        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.maybe_enter_pending_rollover();
        emit_training_dummy_update_if_changed(state, previous);
        let matched = inspect_aoi_delta(&state.encounter, delta, local_player_uuid);

        if let Some(matched) = matched {
            if state.training_dummy.should_lock_on_match(matched)
                || state.training_dummy.should_rollover_on_match(matched)
            {
                if encounter_has_stats(&state.encounter) {
                    info!(
                        target: "app::live",
                        "training_dummy_reset_before_lock source={} target_uuid={} monster_id={}",
                        source,
                        matched.target_entity_uuid,
                        matched.monster_id.id()
                    );
                    self.reset_encounter(state, false);
                }
                let previous = build_training_dummy_state(&state.training_dummy);
                state.training_dummy.lock_target(matched);
                emit_training_dummy_update_if_changed(state, previous);
                info!(
                    target: "app::live",
                    "training_dummy_locked source={} target_uuid={} monster_id={}",
                    source,
                    matched.target_entity_uuid,
                    matched.monster_id.id()
                );
            }
        }

        state.training_dummy.combat_target_filter()
    }
}
