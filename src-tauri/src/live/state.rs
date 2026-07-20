use crate::database::{EncounterMetadata, PlayerNameEntry, now_ms, save_encounter};
use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::live::buff_monitor::{
    ActiveBuff, BuffTargetKind, BuffWatchProfile, EntityBuffMonitorConfig, EntityBuffMonitors,
};
use crate::live::commands_models::{
    BossDbmEvent, CounterUpdateState, FightResourceEntry, FightResourceState, MinimapSkillCast,
    PanelAttrState, ShieldDetailEntry, SkillCdState, StunEntry, TeammateFantasyState,
    TrainingDummyState, to_death_record,
};
use crate::live::counter_tracker::{BuffCounterTracker, CounterRule};
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::entity_id::entity_uuid_string;
use crate::live::event_manager::EventManager;
use crate::live::fantasy_registry::FantasyRegistry;
use crate::live::opcodes_models::{
    AttrType, AttrValue, DeathBuffSnapshot, DeathParticipantBuffSnapshot, DeathRecord, Encounter,
    Entity, attr_type,
};
use crate::live::season_cultivate::{FactorCounterTemplate, SeasonCultivateRuntimeState};
use crate::live::skill_cd_monitor::SkillCdMonitor;
use crate::live::skill_lifecycle::{
    ClientSkillCast, ServerSkillEnd, SkillLifecycleOutput, SkillLifecycleRuntime,
};
use crate::live::team::{TeamEvent, TeamRuntimeState};
use crate::live::training_dummy::{CombatGate, TrainingDummyRuntime, inspect_aoi_delta};
use crate::voice::models::{MonsterBuffSourceScope, VoiceRule};
use crate::voice::rules::{VoiceBuffScope, VoiceRuleTracker};
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::AoiSyncDelta;
use blueprotobuf_lib::blueprotobuf::EEntityType;
use log::{info, warn};
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};

const APPLY_EVENT_KIND_COUNT: usize = 14;
const APPLY_EVENT_STATS_WINDOW: Duration = Duration::from_secs(20);
const APPLY_EVENT_SLOW_THRESHOLD: Duration = Duration::from_millis(1);
const APPLY_EVENT_KIND_NAMES: [&str; APPLY_EVENT_KIND_COUNT] = [
    "EnterScene",
    "SyncNearEntities",
    "SyncSceneEvents",
    "SyncContainerData",
    "SyncContainerDirtyData",
    "SyncServerTime",
    "SyncDungeonData",
    "SyncDungeonDirtyData",
    "SyncToMeDeltaInfo",
    "SyncNearDeltaInfo",
    "Team",
    "ResetEncounter",
    "ClientSkillCast",
    "ServerSkillEnd",
];

const WORLD_EVENT_TYPE_BOSS_DBM: i32 = 29;

/// Represents the possible events that can be handled by the state manager.
#[derive(Debug, Clone)]
pub enum StateEvent {
    /// An enter scene event.
    EnterScene(blueprotobuf::EnterScene),
    /// A sync near entities event.
    SyncNearEntities(blueprotobuf::SyncNearEntities),
    /// A sync scene events packet.
    SyncSceneEvents(blueprotobuf::SyncSceneEvents),
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
    /// Client uplink skill cast request.
    ClientSkillCast(ClientSkillCast),
    /// Server notification that a skill has ended.
    ServerSkillEnd(ServerSkillEnd),
}

impl StateEvent {
    fn kind(&self) -> &'static str {
        APPLY_EVENT_KIND_NAMES[self.timing_index()]
    }

    fn timing_index(&self) -> usize {
        match self {
            StateEvent::EnterScene(_) => 0,
            StateEvent::SyncNearEntities(_) => 1,
            StateEvent::SyncSceneEvents(_) => 2,
            StateEvent::SyncContainerData(_) => 3,
            StateEvent::SyncContainerDirtyData(_) => 4,
            StateEvent::SyncServerTime(_) => 5,
            StateEvent::SyncDungeonData(_) => 6,
            StateEvent::SyncDungeonDirtyData(_) => 7,
            StateEvent::SyncToMeDeltaInfo(_) => 8,
            StateEvent::SyncNearDeltaInfo(_) => 9,
            StateEvent::Team(_) => 10,
            StateEvent::ResetEncounter { .. } => 11,
            StateEvent::ClientSkillCast(_) => 12,
            StateEvent::ServerSkillEnd(_) => 13,
        }
    }
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
    /// One-shot skill casts waiting for the minimap overlay emit cycle.
    pending_minimap_skill_casts: Vec<MinimapSkillCast>,
    /// Whether the minimap overlay currently has a live scene snapshot.
    minimap_snapshot_active: bool,
    apply_event_timing: ApplyEventTimingStats,
    /// Active voice broadcast rules (trigger -> phrase), hot-synced from settings.
    pub voice_rules: Vec<VoiceRule>,
    /// Edge-detection + cooldown state for the voice rule engine.
    pub voice_rule_tracker: VoiceRuleTracker,
    /// The attack target uuid the monster voice-buff scope was last
    /// evaluated against, so a target switch can reset that scope's edge
    /// baseline instead of misreading the new target's buffs as a burst of
    /// gained/lost edges.
    voice_monster_target_uuid: Option<i64>,
    /// Detected fantasy summons indexed both by summon uuid and by the
    /// summoner/source-skill pair used by character-attributed buffs.
    pub fantasy_registry: FantasyRegistry,
}

#[derive(Debug, Clone, Copy, Default)]
struct ApplyEventTimingBucket {
    count: u64,
    dropped_count: u64,
    total_us: u128,
    max_us: u128,
}

#[derive(Debug)]
struct ApplyEventTimingStats {
    window_started_at: Instant,
    buckets: [ApplyEventTimingBucket; APPLY_EVENT_KIND_COUNT],
}

impl ApplyEventTimingStats {
    fn new() -> Self {
        Self {
            window_started_at: Instant::now(),
            buckets: [ApplyEventTimingBucket::default(); APPLY_EVENT_KIND_COUNT],
        }
    }

    fn record(&mut self, event_index: usize, elapsed: Duration, dropped: bool) {
        let elapsed_us = elapsed.as_micros();
        let bucket = &mut self.buckets[event_index];
        bucket.count += 1;
        bucket.total_us += elapsed_us;
        bucket.max_us = bucket.max_us.max(elapsed_us);
        if dropped {
            bucket.dropped_count += 1;
        }

        let window_elapsed = self.window_started_at.elapsed();
        if window_elapsed >= APPLY_EVENT_STATS_WINDOW {
            self.log_and_reset(window_elapsed);
        }
    }

    fn log_and_reset(&mut self, window_elapsed: Duration) {
        for (event_index, bucket) in self.buckets.iter().enumerate() {
            if bucket.count == 0 {
                continue;
            }

            info!(
                target: "app::live",
                "apply_event stats window_ms={} event={} count={} dropped={} avg_us={:.1} max_us={}",
                window_elapsed.as_millis(),
                APPLY_EVENT_KIND_NAMES[event_index],
                bucket.count,
                bucket.dropped_count,
                bucket.total_us as f64 / bucket.count as f64,
                bucket.max_us
            );
        }

        self.window_started_at = Instant::now();
        self.buckets = [ApplyEventTimingBucket::default(); APPLY_EVENT_KIND_COUNT];
    }
}

#[derive(Debug)]
pub struct EntityMonitor {
    pub entity_uuid: i64,
    pub skill_cd_monitor: SkillCdMonitor,
    pub monitored_panel_attr_ids: Vec<i32>,
    pub fight_res_state: Option<FightResourceState>,
    pub skill_lifecycle: SkillLifecycleRuntime,
    pub counter_tracker: BuffCounterTracker,
    pub factor_counter_tracker: BuffCounterTracker,
    pub season_cultivate: SeasonCultivateRuntimeState,
}

impl EntityMonitor {
    fn new(entity_uuid: i64) -> Self {
        Self {
            entity_uuid,
            skill_cd_monitor: SkillCdMonitor::new(),
            monitored_panel_attr_ids: Vec::new(),
            fight_res_state: None,
            skill_lifecycle: SkillLifecycleRuntime::default(),
            counter_tracker: BuffCounterTracker::default(),
            factor_counter_tracker: BuffCounterTracker::default(),
            season_cultivate: SeasonCultivateRuntimeState::default(),
        }
    }

    fn clear_runtime_state(&mut self) {
        self.skill_cd_monitor.skill_cd_map.clear();
        self.fight_res_state = None;
        self.skill_lifecycle.reset();
        self.counter_tracker.reset_counts();
        self.factor_counter_tracker.reset_counts();
    }
}

#[derive(Debug, Clone)]
pub enum LiveControlCommand {
    StateEvent(StateEvent),
    TogglePauseEncounter,
    ApplyMonitorRuntimeSnapshot(MonitorRuntimeSnapshot),
    StartTrainingDummy,
    StopTrainingDummy,
    SetEventUpdateRateMs(u64),
    SetMonitoredBuffs(Vec<i32>),
    SetMonitorAllBuff(bool),
    SetBossMonitoredBuffs {
        global_ids: Vec<i32>,
        self_applied_ids: Vec<i32>,
        monitor_all_self_applied: bool,
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
    SetSeasonCultivateFactorTemplates(Vec<FactorCounterTemplate>),
    SetVoiceRules(Vec<VoiceRule>),
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
            pending_minimap_skill_casts: Vec::new(),
            minimap_snapshot_active: false,
            apply_event_timing: ApplyEventTimingStats::new(),
            voice_rules: Vec::new(),
            voice_rule_tracker: VoiceRuleTracker::new(),
            voice_monster_target_uuid: None,
            fantasy_registry: FantasyRegistry::default(),
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

fn emit_season_cultivate_factor_counter_update(state: &mut AppState) {
    let selection = state.local_monitor.season_cultivate.active_selection();
    let counters = state
        .local_monitor
        .factor_counter_tracker
        .build_payload(&state.attr_store, state.encounter.local_player_uuid);
    state
        .event_manager
        .emit_season_cultivate_factor_counter_update(selection, counters);
}

fn apply_factor_counter_rules(state: &mut AppState, rules: Vec<CounterRule>) {
    state.local_monitor.factor_counter_tracker.set_rules(rules);
}

fn apply_skill_lifecycle_outputs(
    state: &mut AppState,
    outputs: Vec<SkillLifecycleOutput>,
) -> (bool, bool) {
    let mut counter_dirty = false;
    let mut factor_counter_dirty = false;
    for output in outputs {
        counter_dirty |= state
            .local_monitor
            .counter_tracker
            .on_skill_lifecycle_output(output);
        factor_counter_dirty |= state
            .local_monitor
            .factor_counter_tracker
            .on_skill_lifecycle_output(output);
    }
    (counter_dirty, factor_counter_dirty)
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

fn is_known_character_entity(state: &AppState, entity_uuid: i64) -> bool {
    state
        .encounter
        .entity_uuid_to_entity
        .get(&entity_uuid)
        .is_some_and(|entity| entity.entity_type == EEntityType::EntChar)
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
    if is_known_character_entity(state, target_uuid) {
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

#[derive(Debug, Default)]
struct VoiceBuffFacts {
    buff_ids: HashSet<i32>,
    expiry_by_base_id: HashMap<i32, i64>,
    non_expiring_base_ids: HashSet<i32>,
    tier_by_base_id: HashMap<i32, u8>,
}

type VoiceBuffSnapshot = (HashSet<i32>, HashMap<i32, u8>, Vec<(i32, i64)>);

impl VoiceBuffFacts {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            buff_ids: HashSet::with_capacity(capacity),
            expiry_by_base_id: HashMap::with_capacity(capacity),
            non_expiring_base_ids: HashSet::new(),
            tier_by_base_id: HashMap::new(),
        }
    }

    fn record(
        &mut self,
        buff: &ActiveBuff,
        server_clock_offset: i64,
        fantasy_registry: &FantasyRegistry,
    ) {
        self.buff_ids.insert(buff.base_id);
        if let Some(tier) = fantasy_registry
            .resolve_remodel_level(buff.fire_uuid, buff.source_config_id)
            .and_then(|level| u8::try_from(level).ok())
        {
            self.tier_by_base_id.insert(buff.base_id, tier);
        }
        if buff.duration <= 0 {
            self.non_expiring_base_ids.insert(buff.base_id);
            self.expiry_by_base_id.remove(&buff.base_id);
            return;
        }
        if self.non_expiring_base_ids.contains(&buff.base_id) {
            return;
        }
        let expires_at_ms = buff
            .create_time
            .saturating_add(server_clock_offset)
            .saturating_add(i64::from(buff.duration));
        self.expiry_by_base_id
            .entry(buff.base_id)
            .and_modify(|existing| *existing = (*existing).max(expires_at_ms))
            .or_insert(expires_at_ms);
    }

    fn into_snapshot(self) -> VoiceBuffSnapshot {
        (
            self.buff_ids,
            self.tier_by_base_id,
            self.expiry_by_base_id.into_iter().collect(),
        )
    }
}

/// Borrows `entity_uuid`'s active-buff monitor (if any) to build the buff-id
/// snapshot and per-base-id expiry facts the voice rule engine needs, without
/// cloning `ActiveBuff` (which owns a `Vec<i32>` of effect ids the rule
/// engine never reads).
fn collect_buff_snapshot_and_expiry(state: &AppState, entity_uuid: i64) -> VoiceBuffSnapshot {
    let Some(monitor) = state.entity_buff_monitors.monitors.get(&entity_uuid) else {
        return (HashSet::new(), HashMap::new(), Vec::new());
    };
    let mut facts = VoiceBuffFacts::with_capacity(monitor.active_buffs.len());
    for buff in monitor.active_buffs.values() {
        facts.record(buff, state.server_clock_offset, &state.fantasy_registry);
    }
    facts.into_snapshot()
}

fn collect_monster_buff_snapshots(
    state: &AppState,
    entity_uuid: i64,
    local_player_uuid: i64,
) -> (VoiceBuffSnapshot, VoiceBuffSnapshot) {
    let Some(monitor) = state.entity_buff_monitors.monitors.get(&entity_uuid) else {
        return (
            (HashSet::new(), HashMap::new(), Vec::new()),
            (HashSet::new(), HashMap::new(), Vec::new()),
        );
    };
    collect_monster_buff_snapshots_from_buffs(
        monitor.active_buffs.values(),
        monitor.active_buffs.len(),
        state.server_clock_offset,
        local_player_uuid,
        &state.fantasy_registry,
    )
}

fn collect_monster_buff_snapshots_from_buffs<'a>(
    buffs: impl Iterator<Item = &'a ActiveBuff>,
    capacity: usize,
    server_clock_offset: i64,
    local_player_uuid: i64,
    fantasy_registry: &FantasyRegistry,
) -> (VoiceBuffSnapshot, VoiceBuffSnapshot) {
    let mut any_source = VoiceBuffFacts::with_capacity(capacity);
    let mut local_player_source = VoiceBuffFacts::with_capacity(capacity);
    for buff in buffs {
        any_source.record(buff, server_clock_offset, fantasy_registry);
        if buff.fire_uuid == Some(local_player_uuid) {
            local_player_source.record(buff, server_clock_offset, fantasy_registry);
        }
    }
    (
        any_source.into_snapshot(),
        local_player_source.into_snapshot(),
    )
}

fn evaluate_voice_buff_scope(
    state: &mut AppState,
    scope: VoiceBuffScope,
    event_time_ms: i64,
    snapshot: VoiceBuffSnapshot,
) {
    let (buff_ids, tier_by_base_id, expiry_facts) = snapshot;
    let cues = state.voice_rule_tracker.on_buff_scope_snapshot(
        scope,
        &state.voice_rules,
        event_time_ms,
        buff_ids,
        tier_by_base_id,
    );
    state.event_manager.emit_voice_cues(cues);
    state.voice_rule_tracker.sync_buff_expiry(
        scope,
        &state.voice_rules,
        event_time_ms,
        &expiry_facts,
    );
}

fn evaluate_voice_buff_rules(state: &mut AppState, local_player_uuid: i64, event_time_ms: i64) {
    if state.voice_rules.is_empty() {
        return;
    }
    let snapshot = collect_buff_snapshot_and_expiry(state, local_player_uuid);
    evaluate_voice_buff_scope(state, VoiceBuffScope::LocalPlayer, event_time_ms, snapshot);
}

/// Mirrors `evaluate_voice_buff_rules` for the player's current attack
/// target (a monster), resetting the scope's edge baseline whenever the
/// target changes so switching targets never reads as a burst of
/// gained/lost buffs.
fn evaluate_voice_monster_buff_rules(state: &mut AppState, event_time_ms: i64) {
    if state.voice_rules.is_empty() {
        return;
    }
    let target_uuid = current_attack_target_uuid(state);
    if state.voice_monster_target_uuid != target_uuid {
        state.voice_monster_target_uuid = target_uuid;
        for source_scope in [
            MonsterBuffSourceScope::AnySource,
            MonsterBuffSourceScope::LocalPlayerSource,
        ] {
            let scope = VoiceBuffScope::MonsterTarget(source_scope);
            state.voice_rule_tracker.reset_scope_edges(scope);
            state.voice_rule_tracker.sync_buff_expiry(
                scope,
                &state.voice_rules,
                event_time_ms,
                &[],
            );
        }
    }
    let Some(target_uuid) = target_uuid else {
        return;
    };

    let (any_source, local_player_source) =
        collect_monster_buff_snapshots(state, target_uuid, state.encounter.local_player_uuid);
    evaluate_voice_buff_scope(
        state,
        VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource),
        event_time_ms,
        any_source,
    );
    evaluate_voice_buff_scope(
        state,
        VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::LocalPlayerSource),
        event_time_ms,
        local_player_source,
    );
}

fn active_buff_to_death_snapshot(
    buff_uuid: i32,
    buff: &ActiveBuff,
    server_clock_offset: i64,
) -> DeathBuffSnapshot {
    DeathBuffSnapshot {
        base_id: buff.base_id,
        buff_uuid,
        layer: buff.layer,
        duration_ms: buff.duration,
        create_time_ms: buff.create_time.saturating_add(server_clock_offset),
        source_entity_uuid: buff.fire_uuid,
        source_config_id: buff.source_config_id,
    }
}

fn death_buff_snapshot_for_entity(state: &AppState, entity_uuid: i64) -> Vec<DeathBuffSnapshot> {
    let Some(monitor) = state.entity_buff_monitors.monitors.get(&entity_uuid) else {
        return Vec::new();
    };

    let mut buffs: Vec<_> = monitor
        .active_buffs
        .iter()
        .map(|(&buff_uuid, buff)| {
            active_buff_to_death_snapshot(buff_uuid, buff, state.server_clock_offset)
        })
        .collect();
    buffs.sort_by_key(|buff| (buff.create_time_ms, buff.base_id, buff.buff_uuid));
    buffs
}

fn death_participant_buff_snapshots(
    state: &AppState,
    damages: &[crate::live::opcodes_models::DamageSnapshot],
) -> Vec<DeathParticipantBuffSnapshot> {
    let mut seen_entities = HashSet::new();
    let mut seen_monsters_without_entity = HashSet::new();
    let mut participants = Vec::new();

    for damage in damages {
        if let Some(entity_uuid) = damage.attacker_entity_uuid {
            if !seen_entities.insert(entity_uuid) {
                continue;
            }
            participants.push(DeathParticipantBuffSnapshot {
                entity_uuid: Some(entity_uuid),
                monster_type_id: damage.attacker_monster_type_id,
                buffs: death_buff_snapshot_for_entity(state, entity_uuid),
            });
            continue;
        }

        if let Some(monster_type_id) = damage.attacker_monster_type_id {
            if !seen_monsters_without_entity.insert(monster_type_id) {
                continue;
            }
            participants.push(DeathParticipantBuffSnapshot {
                entity_uuid: None,
                monster_type_id: Some(monster_type_id),
                buffs: Vec::new(),
            });
        }
    }

    participants
}

fn minimap_monster_id_of(state: &AppState, entity_uuid: i64) -> Option<i32> {
    state
        .attr_store
        .attr(entity_uuid, AttrType::MonsterId)
        .and_then(AttrValue::as_int)
        .or_else(|| {
            state
                .encounter
                .entity_uuid_to_entity
                .get(&entity_uuid)
                .and_then(|entity| entity.monster_type_id.map(i64::from))
        })
        .and_then(|id| i32::try_from(id).ok())
        .filter(|id| *id > 0)
}

fn is_minimap_relevant_entity(state: &AppState, entity_uuid: i64, scene_id: i32) -> bool {
    if entity_uuid == state.encounter.local_player_uuid || state.team.members.contains(&entity_uuid)
    {
        return true;
    }

    let Some(config) = crate::live::minimap::scene::scene_config_for(scene_id) else {
        return false;
    };
    minimap_monster_id_of(state, entity_uuid)
        .is_some_and(|monster_id| config.relevant_monster_ids.contains(&monster_id))
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
    // Minimap scenes may need mechanic buffs from helper entities that are not
    // part of the normal combat watch profiles.
    let kind = classify_buff_effect_target(state, target_uuid).or_else(|| {
        let scene_id = state.encounter.current_scene_id.unwrap_or_default();
        (crate::live::minimap::scene::is_minimap_scene(scene_id)).then_some(BuffTargetKind::Monster)
    })?;

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

/// Persist the current encounter unless it is an already-saved frozen
/// training-dummy segment. The segment is written to history once, the moment
/// it finishes (`prepare_training_dummy_for_delta`); every later reset path
/// (manual reset, stop, scene resync, auto reset) must not duplicate it.
fn persist_segment_unless_saved(state: &mut AppState, is_manual: bool, source: &str) {
    if state.training_dummy.segment_saved {
        return;
    }
    persist_and_save_encounter(state, is_manual, source);
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

fn record_apply_event_elapsed(
    state: &mut AppState,
    event_kind: &str,
    event_index: usize,
    elapsed: Duration,
    dropped: bool,
) {
    if elapsed > APPLY_EVENT_SLOW_THRESHOLD {
        info!(
            target: "app::live",
            "apply_event slow event={} elapsed_us={} elapsed_ms={:.3} dropped={}",
            event_kind,
            elapsed.as_micros(),
            elapsed.as_secs_f64() * 1000.0,
            dropped
        );
    }
    state
        .apply_event_timing
        .record(event_index, elapsed, dropped);
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

    /// Queues a minimap snapshot for registered minimap scenes.
    pub fn emit_minimap_if_active(&self, state: &mut AppState) {
        let scene_id = state.encounter.current_scene_id.unwrap_or_default();
        if !crate::live::minimap::scene::is_minimap_scene(scene_id) {
            state.pending_minimap_skill_casts.clear();
            if state.minimap_snapshot_active {
                state.event_manager.emit_minimap_update(None, Vec::new());
                state.minimap_snapshot_active = false;
            }
            return;
        }

        let skill_casts = std::mem::take(&mut state.pending_minimap_skill_casts);
        let snapshot = Some(crate::live::minimap::build_minimap_snapshot(state));
        state
            .event_manager
            .emit_minimap_update(snapshot, skill_casts);
        state.minimap_snapshot_active = true;
    }

    pub fn send_state_event(&self, event: StateEvent) -> Result<(), String> {
        self.send_control(LiveControlCommand::StateEvent(event))
    }

    pub fn send_toggle_pause_encounter(&self) -> Result<(), String> {
        self.send_control(LiveControlCommand::TogglePauseEncounter)
    }

    fn apply_event(&self, state: &mut AppState, event: StateEvent) {
        let apply_started_at = Instant::now();
        let event_kind = event.kind();
        let event_index = event.timing_index();

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
            record_apply_event_elapsed(
                state,
                event_kind,
                event_index,
                apply_started_at.elapsed(),
                true,
            );
            info!("packet dropped due to encounter paused");
            return;
        }

        let tick_now_ms = now_ms();
        let local_player_uuid = state.encounter.local_player_uuid;
        let mut counter_dirty = state.local_monitor.counter_tracker.tick_counters(
            tick_now_ms,
            &state.attr_store,
            local_player_uuid,
        );
        let mut factor_counter_dirty = state.local_monitor.factor_counter_tracker.tick_counters(
            tick_now_ms,
            &state.attr_store,
            local_player_uuid,
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
            StateEvent::SyncSceneEvents(data) => {
                self.process_scene_events(state, data);
            }
            StateEvent::SyncContainerData(data) => {
                // store local_player copy
                state.encounter.local_player = data.clone();

                if let Some(result) = self.process_sync_container_data(state, &data) {
                    let next_rules = if let Some(data) = result.season_cultivate_line_data {
                        state.local_monitor.season_cultivate.replace_data(data)
                    } else {
                        state.local_monitor.season_cultivate.clear_data()
                    };
                    if let Some(rules) = next_rules {
                        apply_factor_counter_rules(state, rules);
                    }
                }
                factor_counter_dirty = true;
                counter_dirty = true;
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncContainerDirtyData(data) => {
                let dirty_bytes = self
                    .process_sync_container_dirty_data(state, &data)
                    .and_then(|result| result.season_cultivate_dirty_bytes);
                if let Some(rules) = dirty_bytes.and_then(|bytes| {
                    state
                        .local_monitor
                        .season_cultivate
                        .apply_dirty_bytes(bytes)
                }) {
                    apply_factor_counter_rules(state, rules);
                    factor_counter_dirty = true;
                }
            }
            StateEvent::SyncServerTime(_data) => {
                // todo: this is skipped, not sure what info it has
            }
            StateEvent::SyncDungeonData(data) => {
                let (next_counter_dirty, next_factor_counter_dirty) =
                    self.process_sync_dungeon_data(state, data);
                counter_dirty |= next_counter_dirty;
                factor_counter_dirty |= next_factor_counter_dirty;
                self.apply_battle_state_resets_if_needed(state);
            }
            StateEvent::SyncDungeonDirtyData(data) => {
                let (next_counter_dirty, next_factor_counter_dirty) =
                    self.process_sync_dungeon_dirty_data(state, data);
                counter_dirty |= next_counter_dirty;
                factor_counter_dirty |= next_factor_counter_dirty;
                self.apply_battle_state_resets_if_needed(state);
            }
            StateEvent::SyncToMeDeltaInfo(data) => {
                let (next_counter_dirty, next_factor_counter_dirty) =
                    self.process_sync_to_me_delta_info(state, data);
                counter_dirty |= next_counter_dirty;
                factor_counter_dirty |= next_factor_counter_dirty;
                self.apply_battle_state_resets_if_needed(state);
                // Note: Player names are automatically stored in the database via UpsertEntity tasks
                // No need to maintain a separate cache anymore
            }
            StateEvent::SyncNearDeltaInfo(data) => {
                let (next_counter_dirty, next_factor_counter_dirty) =
                    self.process_sync_near_delta_info(state, data);
                counter_dirty |= next_counter_dirty;
                factor_counter_dirty |= next_factor_counter_dirty;
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
            StateEvent::ClientSkillCast(event) => {
                let outputs = state
                    .local_monitor
                    .skill_lifecycle
                    .on_client_skill_cast(event);
                let (next_counter_dirty, next_factor_counter_dirty) =
                    apply_skill_lifecycle_outputs(state, outputs);
                counter_dirty |= next_counter_dirty;
                factor_counter_dirty |= next_factor_counter_dirty;
            }
            StateEvent::ServerSkillEnd(event) => {
                let outputs = state
                    .local_monitor
                    .skill_lifecycle
                    .on_server_skill_end(event);
                let (next_counter_dirty, next_factor_counter_dirty) =
                    apply_skill_lifecycle_outputs(state, outputs);
                counter_dirty |= next_counter_dirty;
                factor_counter_dirty |= next_factor_counter_dirty;
            }
        }
        if counter_dirty {
            let counter_payload = state
                .local_monitor
                .counter_tracker
                .build_payload(&state.attr_store, state.encounter.local_player_uuid);
            if !state.voice_rules.is_empty() {
                let cues = state.voice_rule_tracker.sync_counter_state(
                    &state.voice_rules,
                    tick_now_ms,
                    &counter_payload,
                );
                state.event_manager.emit_voice_cues(cues);
            }
            emit_buff_counter_update_if_needed(state, counter_payload);
        }
        if factor_counter_dirty {
            emit_season_cultivate_factor_counter_update(state);
        }
        if !state.voice_rules.is_empty() {
            let due_cues = state
                .voice_rule_tracker
                .poll_due(&state.voice_rules, tick_now_ms);
            state.event_manager.emit_voice_cues(due_cues);
        }
        self.apply_attr_store_changes(state);
        record_apply_event_elapsed(
            state,
            event_kind,
            event_index,
            apply_started_at.elapsed(),
            false,
        );
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
            LiveControlCommand::StartTrainingDummy => {
                let previous = build_training_dummy_state(&state.training_dummy);
                state.training_dummy.arm();
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
                monitor_all_self_applied,
            } => {
                state.entity_buff_config.monster =
                    BuffWatchProfile::from_any_and_local_player_source_ids(
                        global_ids,
                        self_applied_ids,
                        monitor_all_self_applied,
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
            LiveControlCommand::SetSeasonCultivateFactorTemplates(templates) => {
                if let Some(rules) = state
                    .local_monitor
                    .season_cultivate
                    .set_templates(templates)
                {
                    apply_factor_counter_rules(state, rules);
                    emit_season_cultivate_factor_counter_update(state);
                }
            }
            LiveControlCommand::SetVoiceRules(rules) => {
                state.voice_rules = rules;
                // Settings changed: forget prior buff-edge state so the next
                // snapshot isn't misread as a burst of newly gained buffs,
                // and drop any timers armed against now-stale rule ids.
                state.voice_rule_tracker.reset_buff_edges();
                state.voice_rule_tracker.reset_scheduled_cues();
            }
        }
    }

    pub(crate) fn apply_monitor_runtime_snapshot_with_state(
        &self,
        state: &mut AppState,
        snapshot: MonitorRuntimeSnapshot,
    ) {
        let MonitorRuntimeSnapshot {
            i18n: _,
            live,
            skill,
            monster,
            teammate,
            voice,
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
            "[boss-buff] set monitored buffs: global={:?} self_applied={:?} monitor_all_self={:?}",
            monster.global_ids,
            monster.self_applied_ids,
            monster.monitor_all_self_applied
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
            LiveControlCommand::SetSeasonCultivateFactorTemplates(
                skill.season_cultivate_factor_templates,
            ),
        );
        self.apply_control_command(
            state,
            LiveControlCommand::SetBossMonitoredBuffs {
                global_ids: monster.global_ids,
                self_applied_ids: monster.self_applied_ids,
                monitor_all_self_applied: monster.monitor_all_self_applied,
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
        self.apply_control_command(state, LiveControlCommand::SetVoiceRules(voice.rules));
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
            // Update encounter with scene info. Markers are scene-scoped:
            // drop them whenever the scene actually changes.
            if state.encounter.current_scene_id != Some(scene_id) {
                state.encounter.markers.clear();
            }
            state.encounter.current_scene_id = Some(scene_id);
            state.encounter.current_dungeon_difficulty = None;
            // Only buffer monster skill casts while inside a minimap scene.
            state
                .attr_store
                .set_skill_cast_recording(crate::live::minimap::scene::is_minimap_scene(scene_id));

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
        let Some(result) = process_sync_near_entities(
            &mut state.encounter,
            &mut state.attr_store,
            sync_near_entities,
        ) else {
            warn!("Error processing SyncNearEntities.. ignoring.");
            return;
        };

        let detected_at_ms = now_ms();
        let teammate_fantasies = result
            .teammate_fantasies
            .into_iter()
            .map(|fantasy| {
                state.fantasy_registry.register_summon(
                    fantasy.summon_uuid,
                    fantasy.summoner_uuid,
                    fantasy.monster_id,
                    fantasy.remodel_level,
                    fantasy.marker_source_config_id,
                );
                let summoner_entity = state
                    .encounter
                    .entity_uuid_to_entity
                    .get(&fantasy.summoner_uuid);
                TeammateFantasyState {
                    summon_uuid: entity_uuid_string(fantasy.summon_uuid),
                    summoner_uuid: entity_uuid_string(fantasy.summoner_uuid),
                    summoner_name: resolve_known_player_display_name(
                        fantasy.summoner_uuid,
                        summoner_entity,
                        &state.attr_store,
                    ),
                    monster_id: fantasy.monster_id,
                    remodel_level: fantasy.remodel_level,
                    detected_at_ms,
                }
            })
            .collect();
        state
            .event_manager
            .emit_teammate_fantasy_update(teammate_fantasies);

        for (target_uuid, buff_infos) in result.initial_buff_snapshots {
            state
                .entity_buff_monitors
                .monitor_for(target_uuid)
                .apply_buff_info_snapshot(&buff_infos);
            if target_uuid == state.encounter.local_player_uuid && target_uuid != 0 {
                evaluate_voice_buff_rules(state, target_uuid, detected_at_ms);
            }
        }

        for target_uuid in result.disappeared {
            state.entity_buff_monitors.remove(target_uuid);
            state.sent_overlay_entity_uuids.remove(&target_uuid);
        }
    }

    fn process_scene_events(
        &self,
        state: &mut AppState,
        sync_scene_events: blueprotobuf::SyncSceneEvents,
    ) {
        let Some(event_data_list) = sync_scene_events.evt else {
            return;
        };

        let received_at_ms = now_ms();
        let mut dbm_events = Vec::new();
        for event in event_data_list.events {
            if event.event_type != Some(WORLD_EVENT_TYPE_BOSS_DBM) {
                continue;
            }

            let Some(skill_effect_id) = event.int_params.first().copied() else {
                warn!("BossDbm event missing skill effect id");
                continue;
            };
            let Some(duration_sec) = event.int_params.get(1).copied() else {
                warn!("BossDbm event missing duration");
                continue;
            };

            let duration_ms = duration_sec.saturating_mul(1000);
            if duration_ms <= 0 {
                warn!(
                    "BossDbm event has non-positive duration: skill_effect_id={}, duration_sec={}",
                    skill_effect_id, duration_sec
                );
                continue;
            }

            dbm_events.push(BossDbmEvent {
                skill_effect_id,
                base_skill_id: skill_effect_id / 100,
                duration_ms,
                create_time_ms: received_at_ms,
                insertion: event.int_params.get(2).copied().unwrap_or_default(),
                server_timestamp_ms: event.long_params.first().copied(),
            });
        }

        if !state.voice_rules.is_empty() && !dbm_events.is_empty() {
            let base_skill_ids: Vec<i32> = dbm_events.iter().map(|e| e.base_skill_id).collect();
            let cues = state.voice_rule_tracker.on_boss_dbm_events(
                &state.voice_rules,
                received_at_ms,
                &base_skill_ids,
            );
            state.event_manager.emit_voice_cues(cues);

            let expiry_facts: Vec<(i32, i64)> = dbm_events
                .iter()
                .map(|event| {
                    (
                        event.base_skill_id,
                        event
                            .create_time_ms
                            .saturating_add(i64::from(event.duration_ms)),
                    )
                })
                .collect();
            state.voice_rule_tracker.sync_boss_dbm_expiry(
                &state.voice_rules,
                received_at_ms,
                &expiry_facts,
            );
        }

        state.event_manager.emit_boss_dbm_update(dbm_events);
    }

    fn process_sync_container_data(
        &self,
        state: &mut AppState,
        sync_container_data: &blueprotobuf::SyncContainerData,
    ) -> Option<crate::live::opcodes_process::SyncContainerProcessResult> {
        use crate::live::opcodes_process::process_sync_container_data;

        persist_segment_unless_saved(state, false, "container_data_resync");
        state.encounter.entity_uuid_to_entity.clear();
        state.attr_store.clear_all_entities();
        state.encounter.reset_combat_state();
        state.local_monitor.clear_runtime_state();
        state.entity_buff_monitors.clear();
        state.sent_overlay_entity_uuids.clear();
        state.battle_state = BattleStateMachine::default();
        state.pending_auto_reset = None;
        state.pending_minimap_skill_casts.clear();
        state.encounter.markers.clear();
        state.fantasy_registry.clear();
        state.event_manager.emit_teammate_fantasy_clear();
        let previous = build_training_dummy_state(&state.training_dummy);
        state.training_dummy.clear();
        emit_training_dummy_update_if_changed(state, previous);
        info!("team members: {:?}", state.team.members);

        let result = process_sync_container_data(
            &mut state.encounter,
            &mut state.attr_store,
            sync_container_data,
        );
        if result.is_none() {
            warn!("Error processing SyncContainerData.. ignoring.");
        }
        result
    }

    fn process_sync_container_dirty_data<'a>(
        &self,
        state: &mut AppState,
        sync_container_dirty_data: &'a blueprotobuf::SyncContainerDirtyData,
    ) -> Option<crate::live::opcodes_process::SyncContainerDirtyProcessResult<'a>> {
        use crate::live::opcodes_process::process_sync_container_dirty_data;
        let result =
            process_sync_container_dirty_data(&mut state.encounter, sync_container_dirty_data);
        if result.is_none() {
            warn!("Error processing SyncContainerDirtyData.. ignoring.");
        }
        result
    }

    fn process_sync_dungeon_data(
        &self,
        state: &mut AppState,
        sync_dungeon_data: blueprotobuf::SyncDungeonData,
    ) -> (bool, bool) {
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

        let result = process_sync_dungeon_data(
            &mut state.battle_state,
            sync_dungeon_data,
            encounter_has_stats,
        );
        let (counter_dirty, factor_counter_dirty) = if result.entered_playing {
            let now = now_ms();
            (
                state
                    .local_monitor
                    .counter_tracker
                    .on_mechanic_dungeon_started(now),
                state
                    .local_monitor
                    .factor_counter_tracker
                    .on_mechanic_dungeon_started(now),
            )
        } else {
            (false, false)
        };

        if let Some(reason) = result.reset_reason {
            info!(
                target: "app::live",
                "State layer applying reset from SyncDungeonData: {:?}",
                reason
            );
            self.apply_reset_reason(state, reason);
        }
        (counter_dirty, factor_counter_dirty)
    }

    fn process_sync_dungeon_dirty_data(
        &self,
        state: &mut AppState,
        sync_dungeon_dirty_data: blueprotobuf::SyncDungeonDirtyData,
    ) -> (bool, bool) {
        use crate::live::opcodes_process::process_sync_dungeon_dirty_data;

        let encounter_has_stats = encounter_has_stats(&state.encounter);

        let result = process_sync_dungeon_dirty_data(
            &mut state.battle_state,
            sync_dungeon_dirty_data,
            encounter_has_stats,
        );
        let (counter_dirty, factor_counter_dirty) = if result.entered_playing {
            let now = now_ms();
            (
                state
                    .local_monitor
                    .counter_tracker
                    .on_mechanic_dungeon_started(now),
                state
                    .local_monitor
                    .factor_counter_tracker
                    .on_mechanic_dungeon_started(now),
            )
        } else {
            (false, false)
        };

        if let Some(reason) = result.reset_reason {
            info!(
                target: "app::live",
                "State layer applying reset from SyncDungeonDirtyData: {:?}",
                reason
            );
            self.apply_reset_reason(state, reason);
        }
        (counter_dirty, factor_counter_dirty)
    }

    fn process_sync_to_me_delta_info(
        &self,
        state: &mut AppState,
        sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    ) -> (bool, bool) {
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

        let combat_gate = sync_to_me_delta_info
            .delta_info
            .as_ref()
            .and_then(|delta| delta.base_delta.as_ref())
            .map(|base_delta| {
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
            })
            .unwrap_or(CombatGate::AllowAll);

        let result = process_sync_to_me_delta_info(
            &mut state.encounter,
            &mut state.attr_store,
            sync_to_me_delta_info,
            &state.local_monitor.monitored_panel_attr_ids,
            combat_gate,
        );

        if state.local_monitor.entity_uuid != state.encounter.local_player_uuid {
            state.local_monitor.entity_uuid = state.encounter.local_player_uuid;
        }

        let mut counter_dirty = false;
        let mut factor_counter_dirty = false;

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
                factor_counter_dirty |= state
                    .local_monitor
                    .factor_counter_tracker
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
            factor_counter_dirty |= state.local_monitor.factor_counter_tracker.on_damage_events(
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
            factor_counter_dirty |= state
                .local_monitor
                .factor_counter_tracker
                .on_damage_taken_events(
                    &result.local_damage_taken_events,
                    state.encounter.local_player_uuid,
                );
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
                evaluate_voice_buff_rules(state, local_player_uuid, now_ms());
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
                            &state.fantasy_registry,
                        )
                    })
                    .unwrap_or_default();
                state.event_manager.emit_buff_update(payload);
                counter_dirty |= state.local_monitor.counter_tracker.on_buff_changes(
                    &buff_process_result.changes,
                    &state.attr_store,
                    local_player_uuid,
                );
                counter_dirty |= state
                    .local_monitor
                    .counter_tracker
                    .on_external_team_buff_changes(
                        &buff_process_result.changes,
                        &state.attr_store,
                        local_player_uuid,
                    );
                factor_counter_dirty |= state.local_monitor.factor_counter_tracker.on_buff_changes(
                    &buff_process_result.changes,
                    &state.attr_store,
                    local_player_uuid,
                );
                factor_counter_dirty |= state
                    .local_monitor
                    .factor_counter_tracker
                    .on_external_team_buff_changes(
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
        factor_counter_dirty |= state
            .local_monitor
            .factor_counter_tracker
            .on_movement_sample(&state.attr_store, state.encounter.local_player_uuid);

        (counter_dirty, factor_counter_dirty)
    }

    fn process_sync_near_delta_info(
        &self,
        state: &mut AppState,
        sync_near_delta_info: blueprotobuf::SyncNearDeltaInfo,
    ) -> (bool, bool) {
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
        let mut factor_counter_dirty = false;
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
            let combat_gate = self.prepare_training_dummy_for_delta(
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
                combat_gate,
                false,
            ) {
                aggregated_damage_events.extend(events);
            }

            if let (Some(target_uuid), Some(raw_bytes)) = (target_uuid, buff_bytes) {
                if let Some((kind, buff_process_result)) =
                    process_entity_buff_effect_bytes(state, target_uuid, &raw_bytes)
                {
                    match kind {
                        BuffTargetKind::LocalPlayer | BuffTargetKind::Teammate => {
                            counter_dirty |= state
                                .local_monitor
                                .counter_tracker
                                .on_external_team_buff_changes(
                                    &buff_process_result.changes,
                                    &state.attr_store,
                                    local_player_uuid,
                                );
                            factor_counter_dirty |= state
                                .local_monitor
                                .factor_counter_tracker
                                .on_external_team_buff_changes(
                                    &buff_process_result.changes,
                                    &state.attr_store,
                                    local_player_uuid,
                                );
                        }
                        BuffTargetKind::Monster => {
                            if current_attack_target_uuid(state) == Some(target_uuid) {
                                evaluate_voice_monster_buff_rules(state, now_ms());
                            }
                        }
                    }
                }
            }
        }

        if !aggregated_damage_events.is_empty() {
            counter_dirty |= state.local_monitor.counter_tracker.on_damage_events(
                &aggregated_damage_events,
                state.encounter.local_player_uuid,
                &state.attr_store,
            );
            factor_counter_dirty |= state.local_monitor.factor_counter_tracker.on_damage_events(
                &aggregated_damage_events,
                state.encounter.local_player_uuid,
                &state.attr_store,
            );
        }

        counter_dirty |= state
            .local_monitor
            .counter_tracker
            .on_movement_sample(&state.attr_store, local_player_uuid);
        factor_counter_dirty |= state
            .local_monitor
            .factor_counter_tracker
            .on_movement_sample(&state.attr_store, local_player_uuid);

        (counter_dirty, factor_counter_dirty)
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

        let scene_id = state.encounter.current_scene_id.unwrap_or_default();
        if crate::live::minimap::scene::is_minimap_scene(scene_id) {
            for cast in changes.skill_cast_events {
                if is_minimap_relevant_entity(state, cast.entity_uuid, scene_id) {
                    let position = state
                        .attr_store
                        .attr_position_by_id(cast.entity_uuid, attr_type::ATTR_POS);
                    let facing = state
                        .attr_store
                        .attr(cast.entity_uuid, AttrType::Facing)
                        .and_then(AttrValue::as_int)
                        .map(|v| v as f32 / 100.0);
                    state.pending_minimap_skill_casts.push(MinimapSkillCast {
                        entity_uuid: entity_uuid_string(cast.entity_uuid),
                        skill_id: cast.skill_id,
                        time_ms: cast.timestamp_ms,
                        x: position.as_ref().map(|position| position.x),
                        z: position.as_ref().map(|position| position.z),
                        facing,
                    });
                }
            }
        }

        for death in changes.death_events {
            let Some(recent_damages) = state
                .encounter
                .entity_uuid_to_entity
                .get_mut(&death.entity_uuid)
                .map(|entity| entity.recent_taken_events.drain(..).collect::<Vec<_>>())
            else {
                continue;
            };

            if recent_damages.is_empty() {
                continue;
            }

            let victim_buffs = death_buff_snapshot_for_entity(state, death.entity_uuid);
            let participant_buffs = death_participant_buff_snapshots(state, &recent_damages);

            if let Some(entity) = state
                .encounter
                .entity_uuid_to_entity
                .get_mut(&death.entity_uuid)
            {
                entity.deaths.push(DeathRecord {
                    victim_entity_uuid: death.entity_uuid,
                    death_timestamp_ms: death.timestamp_ms,
                    recent_damages,
                    victim_buffs,
                    participant_buffs,
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
        persist_segment_unless_saved(state, is_manual, "reset");
        state.encounter.reset_combat_state();
        state.death_snapshot_dirty = false;
        state.pending_minimap_skill_casts.clear();
        state.voice_rule_tracker.reset_buff_edges();
        state.voice_rule_tracker.reset_scheduled_cues();
        state.voice_monster_target_uuid = None;

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
            if state.training_dummy.is_active() {
                let previous = build_training_dummy_state(&state.training_dummy);
                state.training_dummy.rearm();
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

    pub fn start_training_dummy(&self) -> Result<(), String> {
        self.send_control(LiveControlCommand::StartTrainingDummy)
    }

    pub fn stop_training_dummy(&self) -> Result<(), String> {
        self.send_control(LiveControlCommand::StopTrainingDummy)
    }
}

#[cfg(test)]
mod voice_buff_fact_tests {
    use super::*;

    fn active_buff(
        base_id: i32,
        duration: i32,
        create_time: i64,
        fire_uuid: Option<i64>,
    ) -> ActiveBuff {
        ActiveBuff {
            base_id,
            layer: 1,
            duration,
            create_time,
            fire_uuid,
            source_config_id: None,
            effect_ids: Vec::new(),
        }
    }

    fn expiry_map(snapshot: &VoiceBuffSnapshot) -> HashMap<i32, i64> {
        snapshot.2.iter().copied().collect()
    }

    #[test]
    fn monster_snapshots_filter_local_player_before_aggregation() {
        let buffs = [
            active_buff(42, 20_000, 1_000, Some(200)),
            active_buff(42, 10_000, 1_000, Some(100)),
            active_buff(99, 5_000, 1_000, None),
        ];

        let (any_source, local_player_source) = collect_monster_buff_snapshots_from_buffs(
            buffs.iter(),
            buffs.len(),
            500,
            100,
            &FantasyRegistry::default(),
        );

        assert_eq!(any_source.0, HashSet::from([42, 99]));
        assert_eq!(local_player_source.0, HashSet::from([42]));
        assert_eq!(expiry_map(&any_source).get(&42), Some(&21_500));
        assert_eq!(expiry_map(&local_player_source).get(&42), Some(&11_500));
        assert!(!local_player_source.0.contains(&99));
    }

    #[test]
    fn permanent_instance_suppresses_aggregate_expiry() {
        let buffs = [
            active_buff(42, 10_000, 1_000, Some(100)),
            active_buff(42, 0, 1_000, Some(200)),
        ];

        let (any_source, local_player_source) = collect_monster_buff_snapshots_from_buffs(
            buffs.iter(),
            buffs.len(),
            0,
            100,
            &FantasyRegistry::default(),
        );

        assert!(!expiry_map(&any_source).contains_key(&42));
        assert_eq!(expiry_map(&local_player_source).get(&42), Some(&11_000));
    }

    #[test]
    fn server_clock_offset_is_applied_to_expiry() {
        let buff = active_buff(42, 5_000, 10_000, Some(100));
        let mut facts = VoiceBuffFacts::with_capacity(1);

        facts.record(&buff, 750, &FantasyRegistry::default());
        let snapshot = facts.into_snapshot();

        assert_eq!(expiry_map(&snapshot).get(&42), Some(&15_750));
    }

    #[test]
    fn record_resolves_tier_from_fantasy_registry_via_fire_uuid() {
        let buff = active_buff(42, 5_000, 1_000, Some(100));
        let mut fantasy_registry = FantasyRegistry::default();
        fantasy_registry.register_summon(100, 1, 3_000_010, 5, None);
        let mut facts = VoiceBuffFacts::with_capacity(1);

        facts.record(&buff, 0, &fantasy_registry);
        let snapshot = facts.into_snapshot();

        assert_eq!(snapshot.1.get(&42), Some(&5));
    }

    #[test]
    fn record_resolves_tier_when_character_applies_fantasy_buff() {
        let mut buff = active_buff(2_110_103, 20_000, 1_000, Some(335_969_124_992));
        buff.source_config_id = Some(3_944);
        let mut fantasy_registry = FantasyRegistry::default();
        fantasy_registry.register_summon(100, 335_969_124_992, 3_000_038, 5, None);
        let mut facts = VoiceBuffFacts::with_capacity(1);

        facts.record(&buff, 0, &fantasy_registry);
        let snapshot = facts.into_snapshot();

        assert_eq!(snapshot.1.get(&2_110_103), Some(&5));
    }

    #[test]
    fn record_leaves_tier_unset_when_fire_uuid_is_unknown() {
        let buff = active_buff(42, 5_000, 1_000, Some(999));
        let mut facts = VoiceBuffFacts::with_capacity(1);

        facts.record(&buff, 0, &FantasyRegistry::default());
        let snapshot = facts.into_snapshot();

        assert!(snapshot.1.is_empty());
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
            &state.fantasy_registry,
            classify,
        );
        let boss_buff_snapshot = state.entity_buff_monitors.build_snapshots_for_kind(
            BuffTargetKind::Monster,
            &state.entity_buff_config,
            local_player_uuid,
            state.server_clock_offset,
            &state.fantasy_registry,
            classify,
        );
        let teammate_buff_snapshot = state.entity_buff_monitors.build_snapshots_for_kind(
            BuffTargetKind::Teammate,
            &state.entity_buff_config,
            local_player_uuid,
            state.server_clock_offset,
            &state.fantasy_registry,
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

        let mut stun_entries = Vec::new();
        if let Some(target_uuid) = current_target_uuid {
            let max = state
                .attr_store
                .attr_int_by_id(target_uuid, attr_type::ATTR_MAX_STUNNED)
                .unwrap_or(0);
            let current = state
                .attr_store
                .attr_int_by_id(target_uuid, attr_type::ATTR_CURRENT_STUNNED)
                .unwrap_or(0);
            if max > 0 {
                let monster_id = minimap_monster_id_of(state, target_uuid).unwrap_or(0);
                stun_entries.push(StunEntry {
                    boss_entity_uuid: entity_uuid_string(target_uuid),
                    monster_id,
                    current,
                    max,
                });
            }
        }
        state.event_manager.emit_stun_update(stun_entries);

        if !player_names.is_empty() || !monster_ids.is_empty() {
            state
                .event_manager
                .emit_entity_identity_map(player_names, monster_ids);
        }
        evaluate_voice_buff_rules(state, local_player_uuid, now_ms());
        // Also re-evaluated here (not just on new buff packets) so an
        // attack-target switch with no accompanying buff delta still resets
        // the monster scope's edge baseline promptly.
        evaluate_voice_monster_buff_rules(state, now_ms());
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
    ) -> CombatGate {
        if !state.training_dummy.is_active() {
            return CombatGate::AllowAll;
        }

        // Running -> Finished once the segment duration elapses: persist the
        // segment to history exactly once and freeze the live panel in place.
        // Return immediately so this very delta does not also start a new
        // segment — the next round is entirely user-driven (manual reset).
        // Snapshot BEFORE `maybe_finish` mutates the phase so the running ->
        // finished change is actually emitted to the live header.
        let previous = build_training_dummy_state(&state.training_dummy);
        if state.training_dummy.maybe_finish() {
            persist_segment_unless_saved(state, false, "training_dummy_segment");
            state.training_dummy.segment_saved = true;
            emit_training_dummy_update_if_changed(state, previous);
            info!(
                target: "app::live",
                "training_dummy_segment_finished source={}",
                source
            );
            return CombatGate::BlockAll;
        }

        let matched = inspect_aoi_delta(&state.encounter, delta, local_player_uuid);

        // Only an armed dummy auto-locks; a finished (frozen) segment ignores
        // all attacks until the user resets back to armed.
        if let Some(matched) = matched {
            if state.training_dummy.should_lock_on_match(matched) {
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

        state.training_dummy.combat_gate()
    }
}
