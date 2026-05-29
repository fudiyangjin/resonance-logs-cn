use crate::database::{EncounterMetadata, PlayerNameEntry, now_ms, save_encounter};
use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::live::buff_monitor::{
    ActiveBuff, BossBuffMonitors, BuffChangeEvent, BuffChangeType, BuffMonitor,
};
use crate::live::commands_models::{
    CounterUpdateState, DeathRecord, FightResourceEntry, FightResourceState, PanelAttrState,
    ShieldDetailEntry, SkillCdState, TrainingDummyState,
};
use crate::live::counter_tracker::{BuffCounterTracker, CounterRule};
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::event_manager::EventManager;
use crate::live::monster_registry;
use crate::live::opcodes_models::{
    AttrType, AttrValue, Encounter, Entity, ObservedActiveBuff, ObservedDamageHit,
    ObservedEffectBuff, ObservedEffectSource, ObservedFactorBuff, ObservedFactorItem,
    ObservedModifierHitBucket, ObservedModifierReplayHit, ObservedModifierReplaySource,
    ObservedModifierWindow, ObservedSkillCastEvent, ObservedSkillCooldownEvent,
};
use crate::live::seasonal_factor_selector::{
    FactorSelectorDirtyNode, SELECTED_FACTOR_TRANSITION_RUNTIME_SOURCE,
};
use crate::live::skill_cd_monitor::{SkillCdMonitor, calculate_skill_cd};
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

const MAX_SKILL_TIMING_EVENTS: usize = 20_000;
const ACTIVE_EFFECT_BUFF_SOURCE_RUNTIME_PREFIX: &str = "activeEffectBuffs.";
const SELECTED_FACTOR_RUNTIME_PREFIX: &str = "SyncContainerDirtyData.v_data.dirty_tree.";
const MAX_FACTOR_SELECTOR_ZERO_SLOTS: usize = 128;
const FACTOR_SELECTOR_ZERO_SLOT_TTL: Duration = Duration::from_secs(120);

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
    /// Player buff state observed from nearby-player deltas for modifier history.
    pub modifier_buff_monitor: BuffMonitor,
    /// Whether WIP modifier evidence capture is enabled for live/history reports.
    pub modifier_capture_enabled: bool,
    /// Boss buff monitoring state and configuration.
    pub boss_buff_monitors: BossBuffMonitors,
    /// Non-player/proxy source UIDs observed acting on behalf of the local player.
    pub local_owned_source_uids: HashSet<i64>,
    /// Source config IDs observed through local-owned proxy buff sources.
    pub local_owned_source_config_ids: HashSet<i32>,
    /// Selected Deep-Slumber/Phantom Factor items observed from local loadout dirty packets.
    pub local_selected_factor_items: Vec<ObservedFactorItem>,
    /// Set when packet-proven selected factor grades need to be saved to disk.
    pub selected_factor_cache_dirty: bool,
    /// Recently emptied factor-selector slots, used to prove later zero-to-grade selections.
    local_factor_selector_zero_slots: Vec<FactorSelectorZeroSlot>,
    /// Whether we've already handled the first scene change after startup.
    pub initial_scene_change_handled: bool,
    /// Event update rate in milliseconds (default: 200ms). Controls how often events are emitted to frontend.
    pub event_update_rate_ms: u64,
    /// Whether the meter auto-saves and clears the encounter when the game scene/server changes.
    pub auto_clear_on_scene_change: bool,
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
    /// UIDs whose display names have already been pushed to the monster overlay.
    pub sent_overlay_uids: HashSet<i64>,
    /// Set after a new death replay record is appended and cleared after the next frontend emit.
    pub death_snapshot_dirty: bool,
}

#[derive(Debug, Clone)]
struct FactorSelectorZeroSlot {
    path: String,
    tree_signature: String,
    offset: usize,
    observed_at: Instant,
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
    ApplyMonitorRuntimeSnapshot(MonitorRuntimeSnapshot),
    StartTrainingDummy {
        monster_id: TrainingDummyMonsterId,
    },
    StopTrainingDummy,
    SetEventUpdateRateMs(u64),
    SetAutoClearOnSceneChange(bool),
    SetModifierCaptureEnabled(bool),
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
            modifier_buff_monitor: BuffMonitor::new(),
            modifier_capture_enabled: false,
            boss_buff_monitors: BossBuffMonitors::new(),
            local_owned_source_uids: HashSet::new(),
            local_owned_source_config_ids: HashSet::new(),
            local_selected_factor_items: Vec::new(),
            selected_factor_cache_dirty: false,
            local_factor_selector_zero_slots: Vec::new(),
            initial_scene_change_handled: false,
            event_update_rate_ms: 200,
            auto_clear_on_scene_change: true,
            attr_store: EntityAttrStore::with_capacity(256),
            server_clock_offset: 0,
            battle_state: BattleStateMachine::default(),
            pending_auto_reset: None,
            training_dummy: TrainingDummyRuntime::default(),
            sent_overlay_uids: HashSet::new(),
            death_snapshot_dirty: false,
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

fn emit_local_buff_update_snapshot(state: &mut AppState) {
    let payload = state
        .local_monitor
        .buff_monitor
        .build_update_payload(state.server_clock_offset)
        .unwrap_or_default();
    state.event_manager.emit_buff_update(payload);
}

fn emit_boss_buff_update_snapshot(state: &mut AppState) {
    let mut payload = state
        .boss_buff_monitors
        .build_all_buff_snapshots(state.server_clock_offset);
    payload.retain(|&uid, _| !state.attr_store.is_dead(uid));
    state.event_manager.emit_boss_buff_update(payload);
}

fn emit_shield_detail_update_if_needed(state: &mut AppState, mut entries: Vec<ShieldDetailEntry>) {
    let uid = state.attr_store.local_player_uid();
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
    let clock_offset = state.server_clock_offset;

    for entry in &mut entries {
        if let Some(active_buff) = state
            .local_monitor
            .buff_monitor
            .active_buffs
            .get(&(entry.buff_uuid as i32))
        {
            entry.base_id = active_buff.base_id;
            if active_buff.duration > 0 {
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
    for (&uid, entity) in &mut state.encounter.entity_uid_to_entity {
        state.attr_store.hydrate_entity(uid, entity);
    }
}

pub(crate) fn resolve_entity_display_name(
    uid: i64,
    entity: &Entity,
    attr_store: &EntityAttrStore,
) -> String {
    if let Some(name) = attr_store
        .attr(uid, AttrType::Name)
        .and_then(|value| value.as_string())
    {
        return name.to_string();
    }
    if !entity.name.is_empty() {
        return entity.name.clone();
    }
    format!("目标 {uid}")
}

fn resolve_player_display_name(
    uid: i64,
    entity: Option<&Entity>,
    attr_store: &EntityAttrStore,
) -> String {
    if let Some(name) = attr_store
        .attr(uid, AttrType::Name)
        .and_then(|value| value.as_string())
    {
        return name.to_string();
    }
    if let Some(entity) = entity {
        if !entity.name.is_empty() {
            return entity.name.clone();
        }
    }
    format!("UID {uid}")
}

fn collect_player_names(encounter: &Encounter) -> Vec<PlayerNameEntry> {
    let mut player_names: Vec<PlayerNameEntry> =
        Vec::with_capacity(encounter.entity_uid_to_entity.len());
    player_names.extend(
        encounter
            .entity_uid_to_entity
            .iter()
            .filter(|(uid, entity)| {
                entity_has_player_identity_surface(**uid, entity, encounter.local_player_uid)
            })
            .map(|(uid, entity)| PlayerNameEntry {
                uid: *uid,
                name: if entity.name.trim().is_empty() {
                    format!("#{uid}")
                } else {
                    entity.name.clone()
                },
                class_id: entity.class_id,
                class_spec: entity.class_spec,
            }),
    );
    player_names.sort_by(|a, b| a.name.cmp(&b.name));
    player_names.dedup_by(|a, b| a.name == b.name);
    player_names
}

fn entity_has_player_identity_surface(uid: i64, entity: &Entity, local_player_uid: i64) -> bool {
    entity.entity_type == EEntityType::EntChar
        && (uid == local_player_uid
            || !entity.name.trim().is_empty()
            || entity.class_id > 0
            || entity.ability_score > 0
            || entity.level > 0
            || entity.season_strength > 0
            || entity.damage.hits > 0
            || entity.healing.hits > 0
            || entity.taken.hits > 0)
}

fn infer_scene_id_from_scene_uuid(scene_uuid: i64) -> Option<i32> {
    if scene_uuid <= 0 {
        return None;
    }

    let mut candidates = Vec::new();
    for candidate in [
        i32::try_from(scene_uuid).ok(),
        i32::try_from(scene_uuid >> 16).ok(),
        i32::try_from(scene_uuid & 0xffff).ok(),
    ]
    .into_iter()
    .flatten()
    {
        if candidate > 0
            && crate::live::scene_names::contains(candidate)
            && !candidates.contains(&candidate)
        {
            candidates.push(candidate);
        }
    }

    match candidates.as_slice() {
        [scene_id] => Some(*scene_id),
        _ => None,
    }
}

fn encounter_has_stats(encounter: &Encounter) -> bool {
    encounter.total_dmg > 0
        || encounter.total_heal > 0
        || encounter
            .entity_uid_to_entity
            .values()
            .any(|e| e.damage.hits > 0 || e.healing.hits > 0 || e.taken.hits > 0)
}

fn build_training_dummy_state(runtime: &TrainingDummyRuntime) -> TrainingDummyState {
    TrainingDummyState {
        phase: runtime.phase,
    }
}

fn is_known_other_player_source(state: &AppState, source_uid: i64) -> bool {
    let local_player_uid = state.encounter.local_player_uid;
    source_uid > 0
        && source_uid != local_player_uid
        && state
            .encounter
            .entity_uid_to_entity
            .get(&source_uid)
            .map(|entity| entity.entity_type == EEntityType::EntChar)
            .unwrap_or(false)
}

fn remember_local_owned_source_uid(state: &mut AppState, source_uid: i64) -> bool {
    let local_player_uid = state.encounter.local_player_uid;
    if source_uid <= 0
        || source_uid == local_player_uid
        || is_known_other_player_source(state, source_uid)
    {
        return false;
    }
    state.local_owned_source_uids.insert(source_uid);
    true
}

fn remember_local_owned_sources_from_buff_changes(
    state: &mut AppState,
    changes: &[BuffChangeEvent],
) {
    let local_player_uid = state.encounter.local_player_uid;
    if local_player_uid <= 0 {
        return;
    }

    for change in changes {
        if !matches!(
            change.change_type,
            BuffChangeType::Added | BuffChangeType::Changed
        ) {
            continue;
        }
        if change.host_uid != 0 && change.host_uid != local_player_uid {
            continue;
        }

        let source_uid = change.source_uid;
        let source_is_proxy = remember_local_owned_source_uid(state, source_uid);
        if source_is_proxy {
            if let Some(source_config_id) = change.source_config_id.filter(|id| *id > 0) {
                state.local_owned_source_config_ids.insert(source_config_id);
            }
            if change.base_id > 0 {
                state.local_owned_source_config_ids.insert(change.base_id);
            }
        }
    }
}

fn remember_local_owned_sources_from_damage_events(
    state: &mut AppState,
    events: &[crate::live::opcodes_process::LocalDamageEvent],
) {
    let local_player_uid = state.encounter.local_player_uid;
    if local_player_uid <= 0 {
        return;
    }

    for event in events {
        if event.attacker_uid != local_player_uid
            && event.top_summoner_uid != Some(local_player_uid)
        {
            continue;
        }
        remember_local_owned_source_uid(state, event.original_attacker_uid);
    }
}

fn monster_buff_source_matches_local(
    source_uid: i64,
    source_config_id: Option<i32>,
    local_player_uid: i64,
    local_owned_source_uids: &HashSet<i64>,
    local_owned_source_config_ids: &HashSet<i32>,
) -> bool {
    source_uid == local_player_uid
        || (source_uid > 0 && local_owned_source_uids.contains(&source_uid))
        || (source_uid <= 0
            && source_config_id
                .filter(|id| *id > 0)
                .is_some_and(|id| local_owned_source_config_ids.contains(&id)))
}

fn emit_training_dummy_update_if_changed(state: &mut AppState, previous: TrainingDummyState) {
    let current = build_training_dummy_state(&state.training_dummy);
    if current != previous && state.event_manager.should_emit_events() {
        state.event_manager.emit_training_dummy_update(current);
    }
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

fn collect_observed_active_buffs(
    active_buffs: &HashMap<i32, ActiveBuff>,
    local_player_uid: i64,
) -> Vec<ObservedActiveBuff> {
    let mut observed = Vec::new();

    for (&buff_uuid, buff) in active_buffs {
        observed.push(ObservedActiveBuff {
            buff_uuid,
            base_id: buff.base_id,
            buff_level: buff.buff_level,
            part_id: buff.part_id,
            count: buff.count,
            fight_source_type: buff.fight_source_type,
            source_config_id: buff.source_config_id,
            layer: buff.layer,
            duration: buff.duration,
            create_time: buff.create_time,
            received_time_ms: buff.received_time_ms,
            host_uid: if buff.host_uid != 0 {
                buff.host_uid
            } else {
                local_player_uid
            },
            source_uid: buff.source_uid,
        });
    }

    observed.sort_by_key(|buff| (buff.base_id, buff.buff_uuid));
    observed
}

fn collect_observed_factor_buffs(
    active_buffs: &HashMap<i32, ActiveBuff>,
    local_player_uid: i64,
) -> Vec<ObservedFactorBuff> {
    let mut by_key = HashMap::<(i32, i32), ObservedFactorBuff>::new();

    for buff in active_buffs.values() {
        let source_factor_id = buff
            .source_config_id
            .filter(|id| crate::live::season_phantom_factors::is_factor_buff_id(*id));
        let factor_buff_id = if crate::live::season_phantom_factors::is_factor_buff_id(buff.base_id)
        {
            Some(buff.base_id)
        } else {
            source_factor_id
        };
        let Some(factor_buff_id) = factor_buff_id else {
            continue;
        };

        by_key.insert(
            (factor_buff_id, buff.base_id),
            ObservedFactorBuff {
                factor_buff_id,
                observed_buff_id: buff.base_id,
                buff_level: buff.buff_level,
                part_id: buff.part_id,
                count: buff.count,
                fight_source_type: buff.fight_source_type,
                source_config_id: buff.source_config_id,
                layer: buff.layer,
                duration: buff.duration,
                create_time: buff.create_time,
                received_time_ms: buff.received_time_ms,
                host_uid: if buff.host_uid != 0 {
                    buff.host_uid
                } else {
                    local_player_uid
                },
                source_uid: buff.source_uid,
            },
        );
    }

    let mut observed: Vec<_> = by_key.into_values().collect();
    observed.sort_by_key(|buff| (buff.factor_buff_id, buff.observed_buff_id));
    observed
}

fn collect_observed_effect_buffs(
    active_buffs: &HashMap<i32, ActiveBuff>,
    local_player_uid: i64,
) -> Vec<ObservedEffectBuff> {
    let mut by_key = HashMap::<(i32, i32), ObservedEffectBuff>::new();

    for buff in active_buffs.values() {
        let source_effect_id = buff
            .source_config_id
            .filter(|id| crate::live::effect_sources::is_effect_buff_id(*id));
        let effect_source_buff_id = if crate::live::effect_sources::is_effect_buff_id(buff.base_id)
        {
            Some(buff.base_id)
        } else {
            source_effect_id
        };
        let Some(effect_source_buff_id) = effect_source_buff_id else {
            continue;
        };

        by_key.insert(
            (effect_source_buff_id, buff.base_id),
            ObservedEffectBuff {
                effect_source_buff_id,
                observed_buff_id: buff.base_id,
                buff_level: buff.buff_level,
                part_id: buff.part_id,
                count: buff.count,
                fight_source_type: buff.fight_source_type,
                source_config_id: buff.source_config_id,
                layer: buff.layer,
                duration: buff.duration,
                create_time: buff.create_time,
                received_time_ms: buff.received_time_ms,
                host_uid: if buff.host_uid != 0 {
                    buff.host_uid
                } else {
                    local_player_uid
                },
                source_uid: buff.source_uid,
            },
        );
    }

    let mut observed: Vec<_> = by_key.into_values().collect();
    observed.sort_by_key(|buff| (buff.effect_source_buff_id, buff.observed_buff_id));
    observed
}

fn source_entity_id_from_effect_source_id(source_id: &str) -> Option<i32> {
    source_id
        .rsplit_once(':')
        .and_then(|(_, value)| value.parse::<i32>().ok())
}

fn season_talent_node_id_from_effect_source_id(source_id: &str) -> Option<u32> {
    source_id
        .strip_prefix("season-talent-node:")
        .and_then(|value| value.parse::<u32>().ok())
}

fn season_talent_tree_band_from_source_id(source_id: &str) -> Option<u32> {
    let node_id = season_talent_node_id_from_effect_source_id(source_id)?;
    (node_id >= 1_000).then_some(node_id / 100)
}

fn active_season_talent_tree_bands_from_buffs(
    active_effect_buffs: &[ObservedEffectBuff],
) -> HashSet<u32> {
    let mut bands = HashSet::new();

    for buff in active_effect_buffs {
        let mut buff_ids = vec![buff.effect_source_buff_id, buff.observed_buff_id];
        if let Some(source_config_id) = buff.source_config_id {
            buff_ids.push(source_config_id);
        }
        for buff_id in buff_ids {
            let source_ids = crate::live::effect_sources::effect_source_ids_for_buff_id(buff_id);
            let source_bands = source_ids
                .iter()
                .filter_map(|source_id| season_talent_tree_band_from_source_id(source_id))
                .collect::<HashSet<_>>();
            if source_bands.len() == 1 {
                bands.extend(source_bands);
            }
        }
    }

    bands
}

fn effect_source_ids_for_buff_id_scoped(
    buff_id: i32,
    active_tree_bands: &HashSet<u32>,
) -> Vec<String> {
    let source_ids = crate::live::effect_sources::effect_source_ids_for_buff_id(buff_id);
    if source_ids.is_empty() || active_tree_bands.is_empty() {
        return source_ids;
    }

    let source_bands = source_ids
        .iter()
        .filter_map(|source_id| season_talent_tree_band_from_source_id(source_id))
        .collect::<HashSet<_>>();
    if source_bands.len() <= 1 {
        return source_ids;
    }

    let filtered = source_ids
        .iter()
        .filter(|source_id| {
            season_talent_tree_band_from_source_id(source_id)
                .is_none_or(|band| active_tree_bands.contains(&band))
        })
        .cloned()
        .collect::<Vec<_>>();
    if filtered
        .iter()
        .any(|source_id| season_talent_tree_band_from_source_id(source_id).is_some())
    {
        filtered
    } else {
        source_ids
    }
}

fn push_observed_effect_sources_for_buff_id(
    rows: &mut Vec<(i64, ObservedEffectSource)>,
    seen: &mut HashSet<(i64, String)>,
    host_uid: i64,
    buff_id: i32,
    runtime_source: &'static str,
    active_tree_bands: &HashSet<u32>,
) {
    for source_id in effect_source_ids_for_buff_id_scoped(buff_id, active_tree_bands) {
        if !seen.insert((host_uid, source_id.clone())) {
            continue;
        }
        rows.push((
            host_uid,
            ObservedEffectSource {
                source_entity_id: source_entity_id_from_effect_source_id(&source_id),
                node_id: season_talent_node_id_from_effect_source_id(&source_id),
                source_id,
                runtime_source: runtime_source.to_string(),
                node_level: None,
                slot: None,
            },
        ));
    }
}

fn collect_observed_effect_sources_from_buffs(
    active_effect_buffs: &[ObservedEffectBuff],
    local_player_uid: i64,
) -> Vec<(i64, ObservedEffectSource)> {
    let mut rows = Vec::new();
    let mut seen = HashSet::<(i64, String)>::new();
    let active_tree_bands = active_season_talent_tree_bands_from_buffs(active_effect_buffs);

    for buff in active_effect_buffs {
        let host_uid = if buff.host_uid > 0 {
            buff.host_uid
        } else {
            local_player_uid
        };
        if host_uid <= 0 {
            continue;
        }

        push_observed_effect_sources_for_buff_id(
            &mut rows,
            &mut seen,
            host_uid,
            buff.effect_source_buff_id,
            "activeEffectBuffs.effect_source_buff_id",
            &active_tree_bands,
        );
        push_observed_effect_sources_for_buff_id(
            &mut rows,
            &mut seen,
            host_uid,
            buff.observed_buff_id,
            "activeEffectBuffs.observed_buff_id",
            &active_tree_bands,
        );
        if let Some(source_config_id) = buff.source_config_id {
            push_observed_effect_sources_for_buff_id(
                &mut rows,
                &mut seen,
                host_uid,
                source_config_id,
                "activeEffectBuffs.source_config_id",
                &active_tree_bands,
            );
        }
    }

    rows.sort_by(|(left_uid, left), (right_uid, right)| {
        (*left_uid, &left.source_id).cmp(&(*right_uid, &right.source_id))
    });
    rows
}

fn combined_modifier_active_buffs(state: &AppState) -> HashMap<i32, ActiveBuff> {
    let mut active_buffs = if state.modifier_capture_enabled {
        state.modifier_buff_monitor.active_buffs.clone()
    } else {
        HashMap::new()
    };
    for (&buff_uuid, buff) in &state.local_monitor.buff_monitor.active_buffs {
        active_buffs.insert(buff_uuid, buff.clone());
    }
    active_buffs
}

fn clear_modifier_capture_state(state: &mut AppState) {
    state.modifier_buff_monitor.active_buffs.clear();
    state.local_selected_factor_items.clear();
    state.selected_factor_cache_dirty = false;
    state.local_factor_selector_zero_slots.clear();
    for entity in state.encounter.entity_uid_to_entity.values_mut() {
        entity.active_factor_buffs.clear();
        entity.active_effect_buffs.clear();
        entity.active_effect_sources.clear();
        entity.active_factor_items.clear();
        entity.active_passive_skills.clear();
        entity.active_profession_skills.clear();
        entity.active_profession_talents.clear();
        entity.modifier_windows.clear();
        entity.modifier_hit_buckets.clear();
        entity.modifier_replay_hits.clear();
        entity.skill_cast_events.clear();
        entity.skill_cooldown_events.clear();
        entity.observed_damage_hits.clear();
    }
}

fn upsert_selected_factor_items(
    target: &mut Vec<ObservedFactorItem>,
    selected: &[ObservedFactorItem],
) {
    for item in selected {
        let incoming_slot_key = selected_factor_item_slot_key(item);
        target.retain(|existing| {
            if existing.factor_buff_id == item.factor_buff_id {
                return false;
            }
            if let (Some(incoming), Some(existing_key)) = (
                incoming_slot_key.as_ref(),
                selected_factor_item_slot_key(existing),
            ) {
                if existing_key == *incoming {
                    return false;
                }
            }
            if incoming_slot_key.is_some()
                && selected_factor_item_slot_key(existing).is_none()
                && observed_factor_item_is_packet_selected(existing)
            {
                return false;
            }
            true
        });
        target.push(item.clone());
    }
    target.sort_by_key(|item| {
        (
            item.factor_buff_id,
            item.grade.unwrap_or(0),
            item.item_config_id,
            item.item_uuid.unwrap_or(0),
        )
    });
}

fn observed_factor_item_is_packet_selected(item: &ObservedFactorItem) -> bool {
    item.runtime_source
        .starts_with(SELECTED_FACTOR_RUNTIME_PREFIX)
}

fn selector_offset_as_i32(offset: usize) -> Option<i32> {
    i32::try_from(offset).ok()
}

fn selected_factor_slot_key(path: &str, tree_signature: &str, offset: Option<i32>) -> String {
    format!(
        "{}|{}|{}",
        tree_signature,
        path,
        offset
            .map(|value| value.to_string())
            .unwrap_or_else(|| "?".to_string())
    )
}

fn selected_factor_item_slot_key(item: &ObservedFactorItem) -> Option<String> {
    Some(selected_factor_slot_key(
        item.selector_path.as_ref()?,
        item.selector_signature.as_ref()?,
        item.selector_offset,
    ))
}

fn factor_selector_node_slot_key(node: &FactorSelectorDirtyNode) -> String {
    selected_factor_slot_key(
        &node.path,
        &node.tree_signature,
        selector_offset_as_i32(node.offset),
    )
}

fn remove_selected_factor_slot(
    target: &mut Vec<ObservedFactorItem>,
    node: &FactorSelectorDirtyNode,
) -> bool {
    let slot_key = factor_selector_node_slot_key(node);
    let before = target.len();
    target.retain(|item| match selected_factor_item_slot_key(item) {
        Some(existing_key) => existing_key != slot_key,
        None => true,
    });
    before != target.len()
}

fn prune_factor_selector_zero_slots(state: &mut AppState) {
    state
        .local_factor_selector_zero_slots
        .retain(|slot| slot.observed_at.elapsed() <= FACTOR_SELECTOR_ZERO_SLOT_TTL);
    if state.local_factor_selector_zero_slots.len() > MAX_FACTOR_SELECTOR_ZERO_SLOTS {
        let excess = state
            .local_factor_selector_zero_slots
            .len()
            .saturating_sub(MAX_FACTOR_SELECTOR_ZERO_SLOTS);
        state.local_factor_selector_zero_slots.drain(0..excess);
    }
}

fn remember_factor_selector_zero_slot(state: &mut AppState, node: &FactorSelectorDirtyNode) {
    prune_factor_selector_zero_slots(state);

    if let Some(slot) = state
        .local_factor_selector_zero_slots
        .iter_mut()
        .find(|slot| {
            slot.path == node.path
                && slot.tree_signature == node.tree_signature
                && slot.offset == node.offset
        })
    {
        slot.observed_at = Instant::now();
        return;
    }

    state
        .local_factor_selector_zero_slots
        .push(FactorSelectorZeroSlot {
            path: node.path.clone(),
            tree_signature: node.tree_signature.clone(),
            offset: node.offset,
            observed_at: Instant::now(),
        });
    prune_factor_selector_zero_slots(state);
}

fn take_factor_selector_zero_slot(state: &mut AppState, node: &FactorSelectorDirtyNode) -> bool {
    prune_factor_selector_zero_slots(state);
    let Some(index) = state
        .local_factor_selector_zero_slots
        .iter()
        .rposition(|slot| {
            slot.path == node.path
                && slot.tree_signature == node.tree_signature
                && slot.offset == node.offset
        })
    else {
        return false;
    };
    state.local_factor_selector_zero_slots.remove(index);
    true
}

fn selected_factor_item_from_transition_node(
    node: &FactorSelectorDirtyNode,
) -> Option<ObservedFactorItem> {
    Some(ObservedFactorItem {
        factor_buff_id: node.factor_buff_id?,
        item_config_id: node.item_config_id?,
        item_uuid: None,
        package_key: 0,
        package_type: None,
        grade: node.grade,
        family_id: node.family_id,
        runtime_source: SELECTED_FACTOR_TRANSITION_RUNTIME_SOURCE.to_string(),
        selector_path: Some(node.path.clone()),
        selector_signature: Some(node.tree_signature.clone()),
        selector_offset: selector_offset_as_i32(node.offset),
    })
}

fn selected_factor_items_from_dirty_transitions(
    state: &mut AppState,
    sync_container_dirty_data: &blueprotobuf::SyncContainerDirtyData,
) -> Vec<ObservedFactorItem> {
    let nodes = crate::live::seasonal_factor_selector::factor_selector_dirty_nodes_from_dirty_data(
        sync_container_dirty_data,
    );
    if nodes.is_empty() {
        return Vec::new();
    }

    let mut selected = Vec::new();
    let mut seen_item_config_ids = HashSet::new();
    for node in nodes {
        if node.value == 0 {
            if remove_selected_factor_slot(&mut state.local_selected_factor_items, &node) {
                state.selected_factor_cache_dirty = true;
            }
            remember_factor_selector_zero_slot(state, &node);
            continue;
        }
        if node.item_config_id.is_none() || !take_factor_selector_zero_slot(state, &node) {
            continue;
        }
        let Some(item) = selected_factor_item_from_transition_node(&node) else {
            continue;
        };
        if !seen_item_config_ids.insert(item.item_config_id) {
            continue;
        }
        selected.push(item);
    }

    selected.sort_by_key(|item| {
        (
            item.factor_buff_id,
            item.grade.unwrap_or(0),
            item.item_config_id,
        )
    });
    selected
}

fn sync_selected_factor_items_to_local_entity(state: &mut AppState) {
    let local_player_uid = state.encounter.local_player_uid;
    if local_player_uid <= 0 {
        return;
    }
    let entity = state
        .encounter
        .entity_uid_to_entity
        .entry(local_player_uid)
        .or_insert_with(|| Entity {
            entity_type: EEntityType::EntChar,
            ..Default::default()
        });
    if state.local_selected_factor_items.is_empty() {
        entity
            .active_factor_items
            .retain(|item| !observed_factor_item_is_packet_selected(item));
        return;
    }
    upsert_selected_factor_items(
        &mut entity.active_factor_items,
        &state.local_selected_factor_items,
    );
}

fn sync_active_buffs_to_encounter(state: &mut AppState) {
    let local_player_uid = state.encounter.local_player_uid;
    if local_player_uid <= 0 {
        return;
    }
    let active_buff_map = combined_modifier_active_buffs(state);

    let active_buffs = collect_observed_active_buffs(&active_buff_map, local_player_uid);
    let active_factor_buffs = if state.modifier_capture_enabled {
        collect_observed_factor_buffs(&active_buff_map, local_player_uid)
    } else {
        Vec::new()
    };
    let active_effect_buffs = if state.modifier_capture_enabled {
        collect_observed_effect_buffs(&active_buff_map, local_player_uid)
    } else {
        Vec::new()
    };
    let active_effect_sources_from_buffs = if state.modifier_capture_enabled {
        collect_observed_effect_sources_from_buffs(&active_effect_buffs, local_player_uid)
    } else {
        Vec::new()
    };

    for entity in state.encounter.entity_uid_to_entity.values_mut() {
        entity.active_buffs.clear();
        entity.active_factor_buffs.clear();
        entity.active_effect_buffs.clear();
        entity.active_effect_sources.retain(|source| {
            !source
                .runtime_source
                .starts_with(ACTIVE_EFFECT_BUFF_SOURCE_RUNTIME_PREFIX)
        });
    }

    for buff in active_buffs {
        let host_uid = if buff.host_uid > 0 {
            buff.host_uid
        } else {
            local_player_uid
        };
        if host_uid <= 0 {
            continue;
        }
        let entity = state
            .encounter
            .entity_uid_to_entity
            .entry(host_uid)
            .or_insert_with(|| Entity {
                entity_type: EEntityType::EntChar,
                ..Default::default()
            });
        entity.active_buffs.push(buff);
    }

    for buff in active_factor_buffs {
        let host_uid = if buff.host_uid > 0 {
            buff.host_uid
        } else {
            local_player_uid
        };
        if host_uid <= 0 {
            continue;
        }
        let entity = state
            .encounter
            .entity_uid_to_entity
            .entry(host_uid)
            .or_insert_with(|| Entity {
                entity_type: EEntityType::EntChar,
                ..Default::default()
            });
        entity.active_factor_buffs.push(buff);
    }

    for buff in active_effect_buffs {
        let host_uid = if buff.host_uid > 0 {
            buff.host_uid
        } else {
            local_player_uid
        };
        if host_uid <= 0 {
            continue;
        }
        let entity = state
            .encounter
            .entity_uid_to_entity
            .entry(host_uid)
            .or_insert_with(|| Entity {
                entity_type: EEntityType::EntChar,
                ..Default::default()
            });
        entity.active_effect_buffs.push(buff);
    }

    for (host_uid, source) in active_effect_sources_from_buffs {
        let entity = state
            .encounter
            .entity_uid_to_entity
            .entry(host_uid)
            .or_insert_with(|| Entity {
                entity_type: EEntityType::EntChar,
                ..Default::default()
            });
        if !entity
            .active_effect_sources
            .iter()
            .any(|existing| existing.source_id == source.source_id)
        {
            entity.active_effect_sources.push(source);
        }
        entity
            .active_effect_sources
            .sort_by(|left, right| left.source_id.cmp(&right.source_id));
    }

    if state.modifier_capture_enabled {
        sync_selected_factor_items_to_local_entity(state);
    }
}

fn modifier_window_host_uid(change: &BuffChangeEvent, fallback_host_uid: i64) -> i64 {
    if change.host_uid > 0 {
        change.host_uid
    } else {
        fallback_host_uid
    }
}

fn modifier_window_from_change(
    change: &BuffChangeEvent,
    start_time_ms: i64,
) -> ObservedModifierWindow {
    ObservedModifierWindow {
        buff_uuid: change.buff_uuid,
        base_id: change.base_id,
        buff_level: change.buff_level,
        part_id: change.part_id,
        count: change.count,
        fight_source_type: change.fight_source_type,
        source_config_id: change.source_config_id,
        layer: change.layer,
        duration: change.duration_ms.unwrap_or(0),
        start_time_ms,
        end_time_ms: None,
        host_uid: change.host_uid,
        source_uid: change.source_uid,
    }
}

fn close_open_modifier_window(
    entity: &mut Entity,
    buff_uuid: i32,
    host_uid: i64,
    end_time_ms: i64,
) -> bool {
    if let Some(window) = entity.modifier_windows.iter_mut().rev().find(|window| {
        window.buff_uuid == buff_uuid && window.host_uid == host_uid && window.end_time_ms.is_none()
    }) {
        window.end_time_ms = Some(end_time_ms.max(window.start_time_ms));
        return true;
    }
    false
}

fn apply_modifier_buff_changes(
    state: &mut AppState,
    changes: &[BuffChangeEvent],
    fallback_host_uid: i64,
) {
    if !state.modifier_capture_enabled {
        return;
    }
    let local_player_uid = state.encounter.local_player_uid;
    let fallback_host_uid = if fallback_host_uid > 0 {
        fallback_host_uid
    } else {
        local_player_uid
    };
    if fallback_host_uid <= 0 || changes.is_empty() {
        return;
    }

    for change in changes {
        let host_uid = modifier_window_host_uid(change, fallback_host_uid);
        if host_uid <= 0 {
            continue;
        }
        if let Some(active_buff) = state
            .modifier_buff_monitor
            .active_buffs
            .get_mut(&change.buff_uuid)
        {
            if active_buff.host_uid <= 0 {
                active_buff.host_uid = host_uid;
            }
        }
        let entity = state
            .encounter
            .entity_uid_to_entity
            .entry(host_uid)
            .or_insert_with(|| Entity {
                entity_type: EEntityType::EntChar,
                ..Default::default()
            });
        match change.change_type {
            BuffChangeType::Added => {
                close_open_modifier_window(
                    entity,
                    change.buff_uuid,
                    host_uid,
                    change.event_time_ms,
                );
                let mut window = modifier_window_from_change(
                    change,
                    change.create_time_ms.unwrap_or(change.event_time_ms),
                );
                window.host_uid = host_uid;
                entity.modifier_windows.push(window);
            }
            BuffChangeType::Changed => {
                if let Some(window) = entity.modifier_windows.iter_mut().rev().find(|window| {
                    window.buff_uuid == change.buff_uuid
                        && window.host_uid == host_uid
                        && window.end_time_ms.is_none()
                }) {
                    window.layer = change.layer;
                    window.duration = change.duration_ms.unwrap_or(window.duration);
                    window.buff_level = change.buff_level;
                    window.part_id = change.part_id;
                    window.count = change.count;
                    window.fight_source_type = change.fight_source_type;
                    window.source_config_id = change.source_config_id;
                    window.source_uid = change.source_uid;
                }
            }
            BuffChangeType::Removed => {
                if !close_open_modifier_window(
                    entity,
                    change.buff_uuid,
                    host_uid,
                    change.event_time_ms,
                ) {
                    let duration_ms = i64::from(change.duration_ms.unwrap_or(0).max(0));
                    let mut window = modifier_window_from_change(
                        change,
                        change.event_time_ms.saturating_sub(duration_ms),
                    );
                    window.host_uid = host_uid;
                    window.end_time_ms = Some(change.event_time_ms);
                    entity.modifier_windows.push(window);
                }
            }
        }
    }
}

fn temp_attr_modifier_buff_uuid(temp_attr_id: i32) -> i32 {
    -temp_attr_id.abs()
}

fn apply_temp_attr_modifier_changes(
    state: &mut AppState,
    changes: &[crate::live::opcodes_process::TempAttrModifierChange],
) {
    if !state.modifier_capture_enabled {
        return;
    }
    let host_uid = state.encounter.local_player_uid;
    if host_uid <= 0 || changes.is_empty() {
        return;
    }

    let entity = state
        .encounter
        .entity_uid_to_entity
        .entry(host_uid)
        .or_insert_with(|| Entity {
            entity_type: EEntityType::EntChar,
            ..Default::default()
        });
    if !matches!(entity.entity_type, EEntityType::EntChar) {
        return;
    }

    for change in changes {
        let buff_uuid = temp_attr_modifier_buff_uuid(change.temp_attr_id);
        if change.value > 0 && change.previous_value <= 0 {
            close_open_modifier_window(entity, buff_uuid, host_uid, change.event_time_ms);
            entity.modifier_windows.push(ObservedModifierWindow {
                buff_uuid,
                base_id: change.buff_id,
                buff_level: None,
                part_id: Some(change.temp_attr_id),
                count: Some(change.value),
                fight_source_type: None,
                source_config_id: None,
                layer: 1,
                duration: 0,
                start_time_ms: change.event_time_ms,
                end_time_ms: None,
                host_uid,
                source_uid: host_uid,
            });
        } else if change.value > 0 {
            if let Some(window) = entity.modifier_windows.iter_mut().rev().find(|window| {
                window.buff_uuid == buff_uuid
                    && window.host_uid == host_uid
                    && window.end_time_ms.is_none()
            }) {
                window.count = Some(change.value);
                window.part_id = Some(change.temp_attr_id);
            }
        } else if change.previous_value > 0 {
            close_open_modifier_window(entity, buff_uuid, host_uid, change.event_time_ms);
        }
    }
}

fn active_modifier_start_ms(
    buff: &ActiveBuff,
    encounter_start_ms: i64,
    encounter_end_ms: i64,
    server_clock_offset: i64,
) -> i64 {
    let adjusted_create_time = buff.create_time.saturating_add(server_clock_offset);
    let duration_start = if buff.duration > 0 {
        encounter_end_ms.saturating_sub(i64::from(buff.duration))
    } else {
        encounter_start_ms
    };
    let start = if adjusted_create_time > 0 {
        adjusted_create_time
    } else {
        duration_start
    };
    start.clamp(encounter_start_ms, encounter_end_ms)
}

fn seed_open_modifier_windows_from_active_buffs(
    state: &mut AppState,
    encounter_start_ms: i64,
    encounter_end_ms: i64,
) {
    if !state.modifier_capture_enabled {
        return;
    }
    let local_player_uid = state.encounter.local_player_uid;
    if local_player_uid <= 0 {
        return;
    }
    let active_buffs = combined_modifier_active_buffs(state);
    for (&buff_uuid, buff) in &active_buffs {
        let host_uid = if buff.host_uid > 0 {
            buff.host_uid
        } else {
            local_player_uid
        };
        if host_uid <= 0 {
            continue;
        }
        let entity = state
            .encounter
            .entity_uid_to_entity
            .entry(host_uid)
            .or_insert_with(|| Entity {
                entity_type: EEntityType::EntChar,
                ..Default::default()
            });
        let has_open_window = entity.modifier_windows.iter().any(|window| {
            window.buff_uuid == buff_uuid
                && window.host_uid == host_uid
                && window.end_time_ms.is_none()
        });
        if has_open_window {
            continue;
        }

        entity.modifier_windows.push(ObservedModifierWindow {
            buff_uuid,
            base_id: buff.base_id,
            buff_level: buff.buff_level,
            part_id: buff.part_id,
            count: buff.count,
            fight_source_type: buff.fight_source_type,
            source_config_id: buff.source_config_id,
            layer: buff.layer,
            duration: buff.duration,
            start_time_ms: active_modifier_start_ms(
                buff,
                encounter_start_ms,
                encounter_end_ms,
                state.server_clock_offset,
            ),
            end_time_ms: None,
            host_uid,
            source_uid: buff.source_uid,
        });
    }
}

fn finalize_modifier_windows_for_save(state: &mut AppState, encounter_end_ms: i64) {
    if !state.modifier_capture_enabled {
        for entity in state.encounter.entity_uid_to_entity.values_mut() {
            entity.modifier_windows.clear();
        }
        return;
    }
    let encounter_start_ms = if state.encounter.time_fight_start_ms > 0 {
        state.encounter.time_fight_start_ms as i64
    } else {
        encounter_end_ms
    };
    seed_open_modifier_windows_from_active_buffs(state, encounter_start_ms, encounter_end_ms);
    for entity in state.encounter.entity_uid_to_entity.values_mut() {
        for window in &mut entity.modifier_windows {
            if window.end_time_ms.is_none() {
                window.end_time_ms = Some(encounter_end_ms.max(window.start_time_ms));
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModifierHitBucketKey {
    modifier_buff_uuid: i32,
    modifier_base_id: i32,
    modifier_buff_level: Option<i32>,
    modifier_part_id: Option<i32>,
    modifier_fight_source_type: Option<i32>,
    modifier_source_config_id: Option<i32>,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    skill_key: i64,
    damage_id: i64,
    owner_id: i32,
    owner_level: Option<i32>,
    hit_event_id: Option<i32>,
    damage_source: Option<i32>,
    property: Option<i32>,
    damage_mode: Option<i32>,
    attacker_uid: i64,
    original_attacker_uid: i64,
    top_summoner_uid: Option<i64>,
    target_uid: i64,
    target_monster_type_id: Option<i32>,
    is_heal: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModifierHitSeenKey {
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    skill_key: i64,
    damage_id: i64,
    owner_id: i32,
    owner_level: Option<i32>,
    hit_event_id: Option<i32>,
    damage_source: Option<i32>,
    property: Option<i32>,
    damage_mode: Option<i32>,
    attacker_uid: i64,
    original_attacker_uid: i64,
    top_summoner_uid: Option<i64>,
    target_uid: i64,
    target_monster_type_id: Option<i32>,
    is_heal: bool,
}

fn modifier_window_covers_hit(window: &ObservedModifierWindow, hit: &ObservedDamageHit) -> bool {
    if window.base_id <= 0 {
        return false;
    }
    let start = window.start_time_ms;
    let end = window.end_time_ms.unwrap_or(hit.timestamp_ms).max(start);
    hit.timestamp_ms >= start && hit.timestamp_ms <= end
}

fn modifier_hit_seen_key(
    window: &ObservedModifierWindow,
    hit: &ObservedDamageHit,
) -> ModifierHitSeenKey {
    ModifierHitSeenKey {
        modifier_base_id: window.base_id,
        modifier_source_config_id: window.source_config_id,
        skill_key: hit.skill_key,
        damage_id: hit.damage_id,
        owner_id: hit.owner_id,
        owner_level: hit.owner_level,
        hit_event_id: hit.hit_event_id,
        damage_source: hit.damage_source,
        property: hit.property,
        damage_mode: hit.damage_mode,
        attacker_uid: hit.attacker_uid,
        original_attacker_uid: hit.original_attacker_uid,
        top_summoner_uid: hit.top_summoner_uid,
        target_uid: hit.target_uid,
        target_monster_type_id: hit.target_monster_type_id,
        is_heal: hit.is_heal,
    }
}

fn modifier_hit_bucket_key(
    window: &ObservedModifierWindow,
    hit: &ObservedDamageHit,
) -> ModifierHitBucketKey {
    ModifierHitBucketKey {
        modifier_buff_uuid: window.buff_uuid,
        modifier_base_id: window.base_id,
        modifier_buff_level: window.buff_level,
        modifier_part_id: window.part_id,
        modifier_fight_source_type: window.fight_source_type,
        modifier_source_config_id: window.source_config_id,
        modifier_host_uid: window.host_uid,
        modifier_source_uid: window.source_uid,
        skill_key: hit.skill_key,
        damage_id: hit.damage_id,
        owner_id: hit.owner_id,
        owner_level: hit.owner_level,
        hit_event_id: hit.hit_event_id,
        damage_source: hit.damage_source,
        property: hit.property,
        damage_mode: hit.damage_mode,
        attacker_uid: hit.attacker_uid,
        original_attacker_uid: hit.original_attacker_uid,
        top_summoner_uid: hit.top_summoner_uid,
        target_uid: hit.target_uid,
        target_monster_type_id: hit.target_monster_type_id,
        is_heal: hit.is_heal,
    }
}

fn empty_modifier_hit_bucket(
    window: &ObservedModifierWindow,
    hit: &ObservedDamageHit,
) -> ObservedModifierHitBucket {
    ObservedModifierHitBucket {
        modifier_buff_uuid: window.buff_uuid,
        modifier_base_id: window.base_id,
        modifier_buff_level: window.buff_level,
        modifier_part_id: window.part_id,
        modifier_count: window.count,
        modifier_fight_source_type: window.fight_source_type,
        modifier_source_config_id: window.source_config_id,
        modifier_layer: window.layer,
        modifier_duration: window.duration,
        modifier_start_time_ms: window.start_time_ms,
        modifier_end_time_ms: window.end_time_ms,
        modifier_host_uid: window.host_uid,
        modifier_source_uid: window.source_uid,
        skill_key: hit.skill_key,
        damage_id: hit.damage_id,
        owner_id: hit.owner_id,
        owner_level: hit.owner_level,
        hit_event_id: hit.hit_event_id,
        damage_source: hit.damage_source,
        property: hit.property,
        damage_mode: hit.damage_mode,
        attacker_uid: hit.attacker_uid,
        original_attacker_uid: hit.original_attacker_uid,
        top_summoner_uid: hit.top_summoner_uid,
        target_uid: hit.target_uid,
        target_monster_type_id: hit.target_monster_type_id,
        is_heal: hit.is_heal,
        hits: 0,
        total_value: 0,
        effective_total_value: 0,
        crit_hits: 0,
        crit_total_value: 0,
        lucky_hits: 0,
        lucky_total_value: 0,
        hp_loss_total: 0,
        shield_loss_total: 0,
        first_hit_time_ms: hit.timestamp_ms,
        last_hit_time_ms: hit.timestamp_ms,
    }
}

fn add_hit_to_modifier_bucket(bucket: &mut ObservedModifierHitBucket, hit: &ObservedDamageHit) {
    bucket.hits += 1;
    bucket.total_value += hit.value;
    bucket.effective_total_value += hit.effective_value;
    if hit.is_crit {
        bucket.crit_hits += 1;
        bucket.crit_total_value += hit.value;
    }
    if hit.is_lucky {
        bucket.lucky_hits += 1;
        bucket.lucky_total_value += hit.value;
    }
    bucket.hp_loss_total += hit.hp_loss_value;
    bucket.shield_loss_total += hit.shield_loss_value;
    bucket.first_hit_time_ms = bucket.first_hit_time_ms.min(hit.timestamp_ms);
    bucket.last_hit_time_ms = bucket.last_hit_time_ms.max(hit.timestamp_ms);
}

fn build_modifier_hit_buckets(
    entity_uid: i64,
    hits: &[ObservedDamageHit],
    windows_by_host_uid: &HashMap<i64, Vec<ObservedModifierWindow>>,
) -> Vec<ObservedModifierHitBucket> {
    let mut buckets = HashMap::<ModifierHitBucketKey, ObservedModifierHitBucket>::new();
    for hit in hits {
        let mut host_uids = vec![entity_uid];
        if hit.target_uid != entity_uid {
            host_uids.push(hit.target_uid);
        }

        let mut seen_keys_for_hit = HashSet::<ModifierHitSeenKey>::new();
        for host_uid in host_uids {
            let Some(windows) = windows_by_host_uid.get(&host_uid) else {
                continue;
            };
            for window in windows {
                if !modifier_window_covers_hit(window, hit) {
                    continue;
                }
                let seen_key = modifier_hit_seen_key(window, hit);
                if !seen_keys_for_hit.insert(seen_key) {
                    continue;
                }
                let key = modifier_hit_bucket_key(window, hit);
                let bucket = buckets
                    .entry(key)
                    .or_insert_with(|| empty_modifier_hit_bucket(window, hit));
                add_hit_to_modifier_bucket(bucket, hit);
            }
        }
    }

    let mut rows: Vec<ObservedModifierHitBucket> = buckets.into_values().collect();
    rows.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.modifier_base_id.cmp(&right.modifier_base_id))
            .then_with(|| left.skill_key.cmp(&right.skill_key))
    });
    rows
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModifierReplaySourceKey {
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
}

fn replay_source_key(window: &ObservedModifierWindow) -> ModifierReplaySourceKey {
    ModifierReplaySourceKey {
        modifier_base_id: window.base_id,
        modifier_source_config_id: window.source_config_id,
        modifier_host_uid: window.host_uid,
        modifier_source_uid: window.source_uid,
    }
}

fn modifier_replay_source(window: &ObservedModifierWindow) -> ObservedModifierReplaySource {
    ObservedModifierReplaySource {
        modifier_base_id: window.base_id,
        modifier_source_config_id: window.source_config_id,
        modifier_buff_level: window.buff_level,
        modifier_count: window.count,
        modifier_layer: window.layer,
        modifier_host_uid: window.host_uid,
        modifier_source_uid: window.source_uid,
    }
}

fn build_modifier_replay_hits(
    entity_uid: i64,
    hits: &[ObservedDamageHit],
    windows_by_host_uid: &HashMap<i64, Vec<ObservedModifierWindow>>,
) -> Vec<ObservedModifierReplayHit> {
    let mut rows = Vec::new();
    for hit in hits {
        let mut host_uids = vec![entity_uid];
        if hit.target_uid != entity_uid {
            host_uids.push(hit.target_uid);
        }

        let mut seen_sources = HashSet::<ModifierReplaySourceKey>::new();
        let mut active_modifiers = Vec::new();
        for host_uid in host_uids {
            let Some(windows) = windows_by_host_uid.get(&host_uid) else {
                continue;
            };
            for window in windows {
                if !modifier_window_covers_hit(window, hit) {
                    continue;
                }
                if !crate::live::modifier_recount::is_reportable_modifier_bucket(
                    window.base_id,
                    window.source_config_id,
                ) {
                    continue;
                }
                let key = replay_source_key(window);
                if !seen_sources.insert(key) {
                    continue;
                }
                active_modifiers.push(modifier_replay_source(window));
            }
        }
        if active_modifiers.is_empty() {
            continue;
        }
        active_modifiers.sort_by(|left, right| {
            left.modifier_base_id
                .cmp(&right.modifier_base_id)
                .then_with(|| {
                    left.modifier_source_config_id
                        .cmp(&right.modifier_source_config_id)
                })
                .then_with(|| left.modifier_source_uid.cmp(&right.modifier_source_uid))
                .then_with(|| left.modifier_host_uid.cmp(&right.modifier_host_uid))
        });
        rows.push(ObservedModifierReplayHit {
            timestamp_ms: hit.timestamp_ms,
            skill_key: hit.skill_key,
            damage_id: hit.damage_id,
            owner_id: hit.owner_id,
            owner_level: hit.owner_level,
            hit_event_id: hit.hit_event_id,
            damage_source: hit.damage_source,
            property: hit.property,
            damage_mode: hit.damage_mode,
            attacker_uid: hit.attacker_uid,
            original_attacker_uid: hit.original_attacker_uid,
            top_summoner_uid: hit.top_summoner_uid,
            target_uid: hit.target_uid,
            target_monster_type_id: hit.target_monster_type_id,
            is_heal: hit.is_heal,
            is_crit: hit.is_crit,
            is_lucky: hit.is_lucky,
            value: hit.value,
            effective_value: hit.effective_value,
            hp_loss_value: hit.hp_loss_value,
            shield_loss_value: hit.shield_loss_value,
            active_modifiers,
            attacker_attrs: hit.attacker_attrs.clone(),
            target_attrs: hit.target_attrs.clone(),
        });
    }

    rows.sort_by(|left, right| {
        left.timestamp_ms
            .cmp(&right.timestamp_ms)
            .then_with(|| left.damage_id.cmp(&right.damage_id))
            .then_with(|| left.target_uid.cmp(&right.target_uid))
    });
    rows
}

fn finalize_modifier_hit_buckets_for_save(state: &mut AppState) {
    if !state.modifier_capture_enabled {
        for entity in state.encounter.entity_uid_to_entity.values_mut() {
            entity.modifier_hit_buckets.clear();
            entity.modifier_replay_hits.clear();
            entity.observed_damage_hits.clear();
        }
        return;
    }
    let mut windows_by_host_uid = HashMap::<i64, Vec<ObservedModifierWindow>>::new();
    for (&entity_uid, entity) in &state.encounter.entity_uid_to_entity {
        for window in &entity.modifier_windows {
            let mut window = window.clone();
            if window.host_uid <= 0 {
                window.host_uid = entity_uid;
            }
            windows_by_host_uid
                .entry(window.host_uid)
                .or_default()
                .push(window);
        }
    }

    for (&entity_uid, entity) in &mut state.encounter.entity_uid_to_entity {
        entity.modifier_hit_buckets = build_modifier_hit_buckets(
            entity_uid,
            &entity.observed_damage_hits,
            &windows_by_host_uid,
        );
        entity.modifier_replay_hits = build_modifier_replay_hits(
            entity_uid,
            &entity.observed_damage_hits,
            &windows_by_host_uid,
        );
    }
}

fn trim_skill_timing_events(entity: &mut Entity) {
    if entity.skill_cast_events.len() > MAX_SKILL_TIMING_EVENTS {
        let overflow = entity.skill_cast_events.len() - MAX_SKILL_TIMING_EVENTS;
        entity.skill_cast_events.drain(0..overflow);
    }
    if entity.skill_cooldown_events.len() > MAX_SKILL_TIMING_EVENTS {
        let overflow = entity.skill_cooldown_events.len() - MAX_SKILL_TIMING_EVENTS;
        entity.skill_cooldown_events.drain(0..overflow);
    }
}

fn record_local_skill_cast_event(state: &mut AppState, skill_id: i32) {
    if skill_id <= 0 {
        return;
    }
    let local_uid = state.encounter.local_player_uid;
    let Some(entity) = state.encounter.entity_uid_to_entity.get_mut(&local_uid) else {
        return;
    };
    entity.skill_cast_events.push(ObservedSkillCastEvent {
        timestamp_ms: now_ms(),
        skill_id,
        source: "attr-skill-id".to_string(),
    });
    trim_skill_timing_events(entity);
}

fn record_local_skill_cooldown_events(
    state: &mut AppState,
    skill_cds: &[crate::live::opcodes_process::ParsedSkillCd],
) {
    if skill_cds.is_empty() {
        return;
    }

    let now = now_ms();
    let (attr_skill_cd, attr_skill_cd_pct, attr_cd_accelerate_pct) = state.attr_store.cd_inputs();
    let temp_attrs = state.attr_store.temp_attrs();
    let events: Vec<ObservedSkillCooldownEvent> = skill_cds
        .iter()
        .filter_map(|cd| {
            let skill_level_id = cd.skill_level_id?;
            if skill_level_id <= 0 {
                return None;
            }
            let duration = cd.duration.unwrap_or(0);
            let (calculated_duration, cd_accelerate_rate) = if duration > 0 {
                calculate_skill_cd(
                    duration as f32,
                    skill_level_id,
                    temp_attrs,
                    attr_skill_cd,
                    attr_skill_cd_pct,
                    attr_cd_accelerate_pct,
                )
            } else {
                (duration as f32, 0.0)
            };
            Some(ObservedSkillCooldownEvent {
                timestamp_ms: now,
                skill_level_id,
                skill_id: skill_level_id / 100,
                begin_time: cd.begin_time.unwrap_or(0),
                duration,
                calculated_duration: calculated_duration.round() as i32,
                cd_accelerate_rate,
                skill_cd_type: cd.skill_cd_type.unwrap_or(0),
                valid_cd_time: cd.valid_cd_time.unwrap_or(0),
                attr_skill_cd,
                attr_skill_cd_pct,
                attr_cd_accelerate_pct,
            })
        })
        .collect();
    if events.is_empty() {
        return;
    }

    let local_uid = state.encounter.local_player_uid;
    let Some(entity) = state.encounter.entity_uid_to_entity.get_mut(&local_uid) else {
        return;
    };
    entity.skill_cooldown_events.extend(events);
    trim_skill_timing_events(entity);
}

fn persist_and_save_encounter(state: &mut AppState, is_manual: bool, source: &str) {
    hydrate_entities_from_attr_store(state);
    sync_active_buffs_to_encounter(state);
    let defeated: Vec<String> = state
        .encounter
        .entity_uid_to_entity
        .values()
        .filter(|entity| entity.is_boss_metric_target())
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
    finalize_modifier_windows_for_save(
        state,
        metadata
            .ended_at_ms
            .unwrap_or_else(|| state.encounter.time_last_combat_packet_ms as i64),
    );
    finalize_modifier_hit_buckets_for_save(state);

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

        let mut counter_dirty = state.local_monitor.counter_tracker.tick_counters(
            now_ms(),
            &state.attr_store,
            state.encounter.local_player_uid,
        );
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
            StateEvent::ResetEncounter { is_manual } => {
                info!(
                    target: "app::live",
                    "ResetEncounter state event received is_manual={}",
                    is_manual
                );
                state.pending_auto_reset = None;
                self.reset_encounter(state, is_manual);
            }
        }
        if counter_dirty {
            let payload = state
                .local_monitor
                .counter_tracker
                .build_payload(&state.attr_store, state.encounter.local_player_uid);
            emit_buff_counter_update_if_needed(state, payload);
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
            LiveControlCommand::ApplyMonitorRuntimeSnapshot(snapshot) => {
                self.apply_monitor_runtime_snapshot_with_state(state, snapshot);
            }
            LiveControlCommand::StartTrainingDummy { monster_id } => {
                let previous = build_training_dummy_state(&state.training_dummy);
                info!(
                    target: "app::live",
                    "training_dummy_start requested monster_id={}",
                    monster_id.id()
                );
                state.training_dummy.arm(monster_id);
                emit_training_dummy_update_if_changed(state, previous);
            }
            LiveControlCommand::StopTrainingDummy => {
                let previous = build_training_dummy_state(&state.training_dummy);
                if state.training_dummy.locked_target_uid.is_some()
                    && encounter_has_stats(&state.encounter)
                {
                    info!(
                        target: "app::live",
                        "training_dummy_stop resetting active training dummy encounter"
                    );
                    self.reset_encounter(state, false);
                }
                state.training_dummy.clear();
                emit_training_dummy_update_if_changed(state, previous);
            }
            LiveControlCommand::SetEventUpdateRateMs(rate_ms) => {
                state.event_update_rate_ms = rate_ms;
            }
            LiveControlCommand::SetAutoClearOnSceneChange(enabled) => {
                state.auto_clear_on_scene_change = enabled;
            }
            LiveControlCommand::SetModifierCaptureEnabled(enabled) => {
                if state.modifier_capture_enabled != enabled {
                    state.modifier_capture_enabled = enabled;
                    if !enabled {
                        clear_modifier_capture_state(state);
                    }
                }
            }
            LiveControlCommand::SetMonitoredBuffs(buff_base_ids) => {
                state.local_monitor.buff_monitor.monitored_buff_ids =
                    buff_base_ids.into_iter().collect();
                emit_local_buff_update_snapshot(state);
            }
            LiveControlCommand::SetBossMonitoredBuffs {
                global_ids,
                self_applied_ids,
            } => {
                state
                    .boss_buff_monitors
                    .set_config(global_ids, self_applied_ids);
                emit_boss_buff_update_snapshot(state);
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
                emit_local_buff_update_snapshot(state);
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
        } = snapshot;

        info!(
            target: "app::live",
            "[runtime-monitor] applying snapshot: event_update_rate_ms={} auto_clear_on_scene_change={} modifier_reports_enabled={} skill_enabled={} monster_enabled={}",
            live.event_update_rate_ms,
            live.auto_clear_on_scene_change,
            live.modifier_reports_enabled,
            skill.enabled,
            monster.enabled
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

        self.apply_control_command(
            state,
            LiveControlCommand::SetEventUpdateRateMs(live.event_update_rate_ms),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetAutoClearOnSceneChange(live.auto_clear_on_scene_change),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetModifierCaptureEnabled(live.modifier_reports_enabled),
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
    }

    fn on_server_change(&self, state: &mut AppState) {
        use crate::live::opcodes_process::on_server_change;
        state.pending_auto_reset = None;
        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.clear();
        emit_training_dummy_update_if_changed(state, previous);
        state.modifier_buff_monitor.active_buffs.clear();
        state.boss_buff_monitors.clear();
        state.local_owned_source_uids.clear();
        state.local_owned_source_config_ids.clear();
        state.local_factor_selector_zero_slots.clear();

        if !state.auto_clear_on_scene_change {
            info!(target: "app::live", "server_change_auto_clear_skipped");
            return;
        }

        persist_and_save_encounter(state, false, "server_change");
        on_server_change(&mut state.encounter);
        state.battle_state = BattleStateMachine::default();
    }

    // all scene id extraction logic is here (its pretty rough)
    fn process_enter_scene(&self, state: &mut AppState, enter_scene: blueprotobuf::EnterScene) {
        use crate::live::opcodes_process::process_enter_scene as parse_enter_scene;
        use crate::live::scene_names;

        info!("EnterScene packet received");

        let parsed = parse_enter_scene(
            &mut state.encounter,
            &mut state.attr_store,
            &enter_scene,
            &state.local_monitor.monitored_panel_attr_ids,
            state.modifier_capture_enabled,
        );

        if !state.initial_scene_change_handled {
            info!("Initial scene detected");
            state.initial_scene_change_handled = true;
        }
        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.clear();
        emit_training_dummy_update_if_changed(state, previous);

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
            state.modifier_capture_enabled,
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
        state.modifier_buff_monitor.active_buffs.clear();
        state.boss_buff_monitors.clear();
        state.local_owned_source_uids.clear();
        state.local_owned_source_config_ids.clear();
        state.local_factor_selector_zero_slots.clear();
        state.sent_overlay_uids.clear();
        state.battle_state = BattleStateMachine::default();
        state.pending_auto_reset = None;
        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.clear();
        emit_training_dummy_update_if_changed(state, previous);

        if process_sync_container_data(
            &mut state.encounter,
            &mut state.attr_store,
            sync_container_data,
            state.modifier_capture_enabled,
        )
        .is_none()
        {
            warn!("Error processing SyncContainerData.. ignoring.");
        }
        if state.modifier_capture_enabled {
            sync_selected_factor_items_to_local_entity(state);
        }
    }

    fn process_sync_container_dirty_data(
        &self,
        state: &mut AppState,
        sync_container_dirty_data: blueprotobuf::SyncContainerDirtyData,
    ) {
        use crate::live::opcodes_process::process_sync_container_dirty_data;
        if state.modifier_capture_enabled {
            let mut selected_factor_items =
                crate::live::seasonal_factor_selector::selected_factor_items_from_dirty_data(
                    &sync_container_dirty_data,
                );
            selected_factor_items.extend(selected_factor_items_from_dirty_transitions(
                state,
                &sync_container_dirty_data,
            ));
            if !selected_factor_items.is_empty() {
                upsert_selected_factor_items(
                    &mut state.local_selected_factor_items,
                    &selected_factor_items,
                );
                state.selected_factor_cache_dirty = true;
            }
        }
        if process_sync_container_dirty_data(
            &mut state.encounter,
            sync_container_dirty_data,
            state.modifier_capture_enabled,
        )
        .is_none()
        {
            warn!("Error processing SyncContainerDirtyData.. ignoring.");
        }
        if state.modifier_capture_enabled {
            sync_selected_factor_items_to_local_entity(state);
        }
    }

    fn process_sync_dungeon_data(
        &self,
        state: &mut AppState,
        sync_dungeon_data: blueprotobuf::SyncDungeonData,
    ) {
        use crate::live::opcodes_process::process_sync_dungeon_data;
        use crate::live::scene_names;

        let scene_uuid = sync_dungeon_data.v_data.as_ref().and_then(|v| v.scene_uuid);
        let difficulty = sync_dungeon_data
            .v_data
            .as_ref()
            .and_then(|v| v.dungeon_scene_info.as_ref())
            .and_then(|info| info.difficulty);
        let inferred_scene_id = scene_uuid.and_then(infer_scene_id_from_scene_uuid);

        if let Some(difficulty) = difficulty {
            state.encounter.current_dungeon_difficulty = Some(difficulty);
        }

        let scene_id_to_refresh = inferred_scene_id.or(state.encounter.current_scene_id);
        if let Some(scene_id) = scene_id_to_refresh {
            let scene_name = scene_names::lookup_with_difficulty(
                scene_id,
                state.encounter.current_dungeon_difficulty,
            );
            let should_emit = state
                .encounter
                .current_scene_name
                .as_ref()
                .map(|name| name != &scene_name)
                .unwrap_or(true);

            state.encounter.current_scene_id = Some(scene_id);
            state.encounter.current_scene_name = Some(scene_name.clone());

            if inferred_scene_id.is_some() {
                info!(
                    target: "app::live",
                    "Scene inferred from SyncDungeonData scene_uuid={:?}: {} (ID: {})",
                    scene_uuid,
                    scene_name,
                    scene_id
                );
            }

            if should_emit && state.event_manager.should_emit_events() {
                state.event_manager.emit_scene_change(scene_name.clone());
            }
        } else if let Some(scene_uuid) = scene_uuid {
            info!(
                target: "app::live",
                "SyncDungeonData scene_uuid={} did not resolve to a known scene id",
                scene_uuid
            );
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
                let local_player_uid = sync_to_me_delta_info
                    .delta_info
                    .as_ref()
                    .and_then(|delta| delta.uuid)
                    .map(|uuid| uuid >> 16)
                    .unwrap_or(state.encounter.local_player_uid);
                self.prepare_training_dummy_for_delta(
                    state,
                    base_delta,
                    local_player_uid,
                    "SyncToMeDeltaInfo",
                )
            });

        let result = process_sync_to_me_delta_info(
            &mut state.encounter,
            &mut state.attr_store,
            sync_to_me_delta_info,
            &state.local_monitor.monitored_panel_attr_ids,
            combat_target_filter,
            state.modifier_capture_enabled,
        );

        if state.local_monitor.uid != state.encounter.local_player_uid {
            state.local_monitor.uid = state.encounter.local_player_uid;
        }

        if state.modifier_capture_enabled {
            apply_temp_attr_modifier_changes(state, &result.temp_attr_modifier_changes);
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
                .fight_resource_ids(state.encounter.local_player_uid);
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
            remember_local_owned_sources_from_damage_events(state, &result.local_damage_events);
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_events(
                &result.local_damage_events,
                state.encounter.local_player_uid,
                &state.attr_store,
            );
        }

        if !result.local_damage_taken_events.is_empty() {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_taken_events(
                &result.local_damage_taken_events,
                state.encounter.local_player_uid,
            );
        }

        if let Some(skill_base_id) = result.attr_skill_id {
            record_local_skill_cast_event(state, skill_base_id);
            counter_dirty |= state
                .local_monitor
                .counter_tracker
                .on_skill_cast(skill_base_id);
        }

        if !result.skill_cds.is_empty() {
            record_local_skill_cooldown_events(state, &result.skill_cds);
            state.attr_store.mark_cd_dirty();
            state
                .local_monitor
                .skill_cd_monitor
                .apply_skill_cd_updates(&result.skill_cds, &state.attr_store);
        }

        if let Some(raw_bytes) = result.buff_effect_bytes {
            let buff_process_result = state.local_monitor.buff_monitor.process_buff_effect_bytes(
                &raw_bytes,
                &mut state.server_clock_offset,
                state.encounter.local_player_uid,
            );
            remember_local_owned_sources_from_buff_changes(state, &buff_process_result.changes);
            if let Some(payload) = buff_process_result.update_payload {
                state.event_manager.emit_buff_update(payload);
            }
            if state.modifier_capture_enabled {
                apply_modifier_buff_changes(
                    state,
                    &buff_process_result.changes,
                    state.encounter.local_player_uid,
                );
            }
            counter_dirty |= state.local_monitor.counter_tracker.on_buff_changes(
                &buff_process_result.changes,
                &state.attr_store,
                state.encounter.local_player_uid,
            );
        }

        counter_dirty |= state
            .local_monitor
            .counter_tracker
            .on_movement_sample(&state.attr_store, state.encounter.local_player_uid);

        counter_dirty
    }

    fn process_sync_near_delta_info(
        &self,
        state: &mut AppState,
        sync_near_delta_info: blueprotobuf::SyncNearDeltaInfo,
    ) -> bool {
        use crate::live::opcodes_process::{aoi_delta_has_player_damage, process_aoi_sync_delta};
        if state.pending_auto_reset.is_some() {
            let has_damage = sync_near_delta_info
                .delta_infos
                .iter()
                .any(aoi_delta_has_player_damage);
            self.try_deferred_reset(state, has_damage, "SyncNearDeltaInfo");
        }

        let mut counter_dirty = false;
        let mut aggregated_damage_events = Vec::new();
        for mut aoi_sync_delta in sync_near_delta_info.delta_infos {
            let target_uuid = aoi_sync_delta.uuid;
            let target_uid = target_uuid.map(|uuid| uuid >> 16);
            let target_entity_type = target_uuid.map(EEntityType::from);
            let raw_extra_buff_monitored_target = inspect_aoi_delta(
                &state.encounter,
                &aoi_sync_delta,
                state.encounter.local_player_uid,
            )
            .is_some_and(|matched| {
                monster_registry::is_extra_buff_monitored_monster(matched.monster_id.id())
            });
            let buff_bytes = aoi_sync_delta.buff_effect.take();
            let combat_target_filter = self.prepare_training_dummy_for_delta(
                state,
                &aoi_sync_delta,
                state.encounter.local_player_uid,
                "SyncNearDeltaInfo",
            );

            // Missing fields are normal, no need to log
            if let Some((events, _)) = process_aoi_sync_delta(
                &mut state.encounter,
                &mut state.attr_store,
                aoi_sync_delta,
                combat_target_filter,
                false,
                state.modifier_capture_enabled,
            ) {
                remember_local_owned_sources_from_damage_events(state, &events);
                aggregated_damage_events.extend(events);
            }

            if let (Some(target_uid), Some(raw_bytes)) = (target_uid, buff_bytes) {
                let is_non_player_target = target_uid != state.encounter.local_player_uid
                    && !matches!(target_entity_type, Some(EEntityType::EntChar));
                let should_monitor_monster_buffs = state
                    .encounter
                    .entity_uid_to_entity
                    .get(&target_uid)
                    .map(|entity| {
                        entity.is_boss()
                            || entity
                                .monster_type_id
                                .is_some_and(monster_registry::is_extra_buff_monitored_monster)
                    })
                    .unwrap_or(false)
                    || (is_non_player_target && raw_extra_buff_monitored_target);
                if state.modifier_capture_enabled
                    && matches!(target_entity_type, Some(EEntityType::EntChar))
                {
                    let local_player_uid = state.encounter.local_player_uid;
                    let buff_process_result =
                        state.modifier_buff_monitor.process_buff_effect_bytes(
                            &raw_bytes,
                            &mut state.server_clock_offset,
                            local_player_uid,
                        );
                    apply_modifier_buff_changes(state, &buff_process_result.changes, target_uid);
                }
                if should_monitor_monster_buffs {
                    let local_player_uid = state.encounter.local_player_uid;
                    let local_owned_source_uids = state.local_owned_source_uids.clone();
                    let local_owned_source_config_ids = state.local_owned_source_config_ids.clone();
                    let monitor = state.boss_buff_monitors.monitor_for(target_uid);
                    let buff_process_result = monitor
                        .process_buff_effect_bytes_with_self_source_filter(
                            &raw_bytes,
                            &mut state.server_clock_offset,
                            |_, source_uid, source_config_id, _| {
                                monster_buff_source_matches_local(
                                    source_uid,
                                    source_config_id,
                                    local_player_uid,
                                    &local_owned_source_uids,
                                    &local_owned_source_config_ids,
                                )
                            },
                        );
                    if !buff_process_result.changes.is_empty() {
                        info!(
                            target: "app::live",
                            "[boss-buff] processed target_uid={} changes={} entity_type={:?} extra_target={}",
                            target_uid,
                            buff_process_result.changes.len(),
                            target_entity_type,
                            raw_extra_buff_monitored_target
                        );
                    }
                }
            }
        }

        if !aggregated_damage_events.is_empty() {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_events(
                &aggregated_damage_events,
                state.encounter.local_player_uid,
                &state.attr_store,
            );
        }

        counter_dirty |= state
            .local_monitor
            .counter_tracker
            .on_movement_sample(&state.attr_store, state.encounter.local_player_uid);

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
            if let Some(entity) = state.encounter.entity_uid_to_entity.get_mut(&death.uid) {
                let recent_damages: Vec<_> = entity.recent_taken_events.drain(..).collect();
                if recent_damages.is_empty() {
                    continue;
                }
                entity.deaths.push(DeathRecord {
                    victim_uid: death.uid,
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
        sync_selected_factor_items_to_local_entity(state);
        if is_manual && state.encounter.is_encounter_paused {
            info!(
                target: "app::live",
                "manual reset cleared paused state so parsing can resume"
            );
            state.encounter.is_encounter_paused = false;
            state.event_manager.emit_encounter_pause(false);
        }
        state.modifier_buff_monitor.active_buffs.clear();
        state.local_owned_source_uids.clear();
        state.local_owned_source_config_ids.clear();
        state.local_factor_selector_zero_slots.clear();
        state.death_snapshot_dirty = false;

        state.event_manager.emit_encounter_reset();

        // Reset is a user/control event, so do not gate it behind the normal live
        // update throttle. The frontend must clear immediately even if a combat
        // update was emitted a few milliseconds earlier.
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
            training_dummy: build_training_dummy_state(&state.training_dummy),
        };
        state
            .event_manager
            .emit_encounter_update(cleared_header, state.encounter.is_encounter_paused);
        let cleared_live_data = crate::live::event_manager::generate_live_data_payload(
            &state.encounter,
            &state.attr_store,
        );
        state.event_manager.emit_live_data(cleared_live_data);
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

impl AppStateManager {
    /// Updates and emits events.
    pub fn update_and_emit_events_with_state(&self, state: &mut AppState) {
        if !state.event_manager.should_emit_events() {
            return;
        }

        sync_active_buffs_to_encounter(state);
        let payload = crate::live::event_manager::generate_live_data_payload(
            &state.encounter,
            &state.attr_store,
        );

        state.event_manager.emit_live_data(payload);

        if state.death_snapshot_dirty {
            let mut records: Vec<DeathRecord> = state
                .encounter
                .entity_uid_to_entity
                .values()
                .flat_map(|entity| entity.deaths.iter().cloned())
                .collect();
            records.sort_by_key(|record| record.death_timestamp_ms);
            state.event_manager.emit_death_replay(records);
            state.death_snapshot_dirty = false;
        }
        let mut boss_buff_snapshot = state
            .boss_buff_monitors
            .build_all_buff_snapshots(state.server_clock_offset);
        boss_buff_snapshot.retain(|&uid, _| !state.attr_store.is_dead(uid));

        let boss_count = state
            .encounter
            .entity_uid_to_entity
            .values()
            .filter(|entity| entity.is_boss_metric_target())
            .count();
        let mut all_hate_lists = HashMap::with_capacity(boss_count);
        let mut new_names =
            HashMap::with_capacity(boss_count.saturating_add(boss_buff_snapshot.len()));
        let mut player_names =
            HashMap::with_capacity(boss_count.saturating_add(boss_buff_snapshot.len()));
        let mut monster_ids =
            HashMap::with_capacity(boss_count.saturating_add(boss_buff_snapshot.len()));

        for (&boss_uid, entity) in &state.encounter.entity_uid_to_entity {
            if !entity.is_boss_metric_target() {
                continue;
            }
            if state.attr_store.is_dead(boss_uid) {
                continue;
            }

            if state.sent_overlay_uids.insert(boss_uid) {
                new_names.insert(
                    boss_uid,
                    resolve_entity_display_name(boss_uid, entity, &state.attr_store),
                );
                if let Some(monster_id) = entity.monster_type_id {
                    monster_ids.insert(boss_uid, monster_id);
                }
            }

            let entries = state
                .attr_store
                .hate_lists()
                .get(&boss_uid)
                .cloned()
                .unwrap_or_default();

            for entry in &entries {
                if state.sent_overlay_uids.insert(entry.uid) {
                    let entity = state.encounter.entity_uid_to_entity.get(&entry.uid);
                    let name = state
                        .attr_store
                        .attr(entry.uid, AttrType::Name)
                        .and_then(|value| value.as_string())
                        .map(ToString::to_string)
                        .unwrap_or_else(|| format!("UID {}", entry.uid));
                    new_names.insert(entry.uid, name);
                    if let Some(monster_id) = entity.and_then(|entity| entity.monster_type_id) {
                        monster_ids.insert(entry.uid, monster_id);
                    } else {
                        player_names.insert(
                            entry.uid,
                            resolve_player_display_name(entry.uid, entity, &state.attr_store),
                        );
                    }
                }
            }

            if !entries.is_empty() {
                all_hate_lists.insert(boss_uid, entries);
            }
        }

        for &target_uid in boss_buff_snapshot.keys() {
            if !state.sent_overlay_uids.insert(target_uid) {
                continue;
            }

            let Some(entity) = state.encounter.entity_uid_to_entity.get(&target_uid) else {
                continue;
            };

            new_names.insert(
                target_uid,
                resolve_entity_display_name(target_uid, entity, &state.attr_store),
            );
            if let Some(monster_id) = entity.monster_type_id {
                monster_ids.insert(target_uid, monster_id);
            }
        }

        state.event_manager.emit_hate_list_update(all_hate_lists);

        if !new_names.is_empty() {
            state.event_manager.emit_entity_name_map(new_names);
        }
        if !player_names.is_empty() || !monster_ids.is_empty() {
            state
                .event_manager
                .emit_entity_identity_map(player_names, monster_ids);
        }
        state
            .event_manager
            .emit_boss_buff_update(boss_buff_snapshot);
    }

    fn prepare_training_dummy_for_delta(
        &self,
        state: &mut AppState,
        delta: &AoiSyncDelta,
        local_player_uid: i64,
        source: &str,
    ) -> Option<i64> {
        if !state.training_dummy.has_selection() {
            return None;
        }

        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.maybe_enter_pending_rollover();
        emit_training_dummy_update_if_changed(state, previous);
        let matched = inspect_aoi_delta(&state.encounter, delta, local_player_uid);

        if let Some(matched) = matched {
            if state.training_dummy.should_lock_on_match(matched)
                || state.training_dummy.should_rollover_on_match(matched)
            {
                if encounter_has_stats(&state.encounter) {
                    info!(
                        target: "app::live",
                        "training_dummy_reset_before_lock source={} target_uid={} monster_id={}",
                        source,
                        matched.target_uid,
                        matched.monster_id.id()
                    );
                    self.reset_encounter(state, false);
                }
                let previous = build_training_dummy_state(&state.training_dummy);
                state.training_dummy.lock_target(matched);
                emit_training_dummy_update_if_changed(state, previous);
                info!(
                    target: "app::live",
                    "training_dummy_locked source={} target_uid={} monster_id={}",
                    source,
                    matched.target_uid,
                    matched.monster_id.id()
                );
            }
        }

        state.training_dummy.combat_target_filter()
    }
}
