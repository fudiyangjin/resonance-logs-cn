//! Indexed counter projection.
//!
//! Rules are compiled when configuration changes. Domain-event hot paths only
//! visit handlers indexed by the event key; they never scan every rule.
//!
//! Counters are NOT segment-scoped: like the old pipeline, they keep counting
//! across combat segments (including training windows and the 183s dummy
//! freeze) and are only cleared by the `ContainerReset` emitted at the start
//! of a SyncContainerData batch. Pause drops data events but never shifts
//! timers.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::live::counter::season_cultivate::{FactorCounterCompiler, FactorCounterTemplate};
use crate::live::ipc::models::{CounterUpdateState, SlotUpdateState};
use crate::live::runtime::events::{
    AttributeValue, BatchId, BuffEvent, BuffWireKind, DomainEnvelope, DomainEvent, DomainHit,
    EntityRef, EntityUuid, HitChannel, HitKind, MonoTimeMs, Position, SkillPhase, TimerKey,
    TimerScope,
};
use crate::live::runtime::scheduler::{DeadlineScheduler, DueTimer, TickSchedule, TimerTask};

const FULL_SCALE_BASIS_POINTS: u64 = 10_000;
const DUNGEON_FLOW_PLAYING: i32 = 3;
const MAX_MOVEMENT_DELTA_METERS: f32 = 50.0;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct CounterRule {
    pub rule_id: i32,
    pub sources: Vec<CounterSource>,
    pub effect_slots: Vec<EffectSlotConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum CounterSource {
    DamageBySkillKey {
        #[serde(rename = "skillKeys")]
        skill_keys: Vec<i64>,
        increment: u32,
        #[serde(default, rename = "hitsRequired")]
        hits_required: Option<u32>,
        #[serde(default, rename = "requiredTypeFlags")]
        required_type_flags: Option<i32>,
    },
    DamageBySkillKeyOnce {
        #[serde(rename = "skillKeys")]
        skill_keys: Vec<i64>,
        increment: u32,
        #[serde(default, rename = "requiredTypeFlags")]
        required_type_flags: Option<i32>,
    },
    DamageBySkillKeySelfTarget {
        #[serde(rename = "skillKeys")]
        skill_keys: Vec<i64>,
        increment: u32,
        #[serde(default, rename = "hitsRequired")]
        hits_required: Option<u32>,
        #[serde(default, rename = "requiredTypeFlags")]
        required_type_flags: Option<i32>,
    },
    AnyDamage {
        increment: u32,
        #[serde(default, rename = "hitsRequired")]
        hits_required: Option<u32>,
        #[serde(default, rename = "requiredTypeFlags")]
        required_type_flags: Option<i32>,
    },
    DamageTaken {
        #[serde(default, rename = "skillKeys")]
        skill_keys: Option<Vec<i64>>,
        increment: u32,
        #[serde(default, rename = "hitsRequired")]
        hits_required: Option<u32>,
        #[serde(default, rename = "requiredTypeFlags")]
        required_type_flags: Option<i32>,
    },
    FightResourceSpent {
        #[serde(rename = "resourceId")]
        resource_id: i32,
        #[serde(rename = "unitsRequired")]
        units_required: u32,
        increment: u32,
    },
    BuffAdded {
        #[serde(rename = "buffId")]
        buff_id: i32,
        #[serde(default, rename = "sourceConfigId")]
        source_config_id: Option<i32>,
        increment: u32,
    },
    BuffLayerSpent {
        #[serde(rename = "buffId")]
        buff_id: i32,
        #[serde(rename = "unitsRequired")]
        units_required: u32,
        increment: u32,
    },
    BuffDurationTick {
        #[serde(rename = "buffId")]
        buff_id: i32,
        #[serde(rename = "tickIntervalMs")]
        tick_interval_ms: u64,
        increment: u32,
        #[serde(default, rename = "attrCondition")]
        attr_condition: Option<TickAttrCondition>,
    },
    SkillCast {
        #[serde(rename = "skillBaseIds")]
        skill_base_ids: Vec<i32>,
        increment: u32,
    },
    SkillDurationTick {
        #[serde(rename = "skillBaseId")]
        skill_base_id: i32,
        #[serde(rename = "tickIntervalMs")]
        tick_interval_ms: u64,
        increment: u32,
    },
    SkillCastComplete {
        #[serde(rename = "skillBaseIds")]
        skill_base_ids: Vec<i32>,
        increment: u32,
    },
    MovementDistance {
        #[serde(rename = "buffId")]
        buff_id: i32,
        #[serde(rename = "attrId")]
        attr_id: i32,
        #[serde(rename = "metersRequired")]
        meters_required: f32,
        increment: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TickAttrCondition {
    pub attr_id: i32,
    pub required_value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AltFreezeConfig {
    pub condition_buff_id: i32,
    pub freeze_duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AttrModifier {
    pub attr_id: i32,
    #[serde(default = "default_basis_points_per_unit")]
    pub basis_points_per_unit: u32,
    pub max_reduction_basis_points: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ResetBuffTarget {
    #[default]
    SelfPlayer,
    AnyTeam,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EffectSlotConfig {
    pub slot_id: i32,
    pub threshold: Option<u32>,
    pub reset_buff_id: i32,
    #[serde(default)]
    pub reset_source_config_id: Option<i32>,
    #[serde(default)]
    pub reset_buff_target: ResetBuffTarget,
    #[serde(default)]
    pub on_buff_add: CounterAction,
    #[serde(default)]
    pub on_buff_change: CounterAction,
    #[serde(default)]
    pub on_buff_remove: CounterAction,
    #[serde(default)]
    pub freeze_duration_ms: Option<u64>,
    #[serde(default = "default_on_freeze_expire")]
    pub on_freeze_expire: CounterAction,
    #[serde(default)]
    pub alt_freeze: Option<AltFreezeConfig>,
    #[serde(default)]
    pub threshold_modifier: Option<AttrModifier>,
    #[serde(default)]
    pub freeze_duration_modifier: Option<AttrModifier>,
    #[serde(default)]
    pub reset_skill_keys: Option<Vec<i64>>,
    #[serde(default)]
    pub on_reset_skill: CounterAction,
    #[serde(default)]
    pub wrap_at_threshold: bool,
    #[serde(default)]
    pub reset_passive_skill_ids: Option<Vec<i32>>,
    #[serde(default)]
    pub on_passive_skill: CounterAction,
    #[serde(default)]
    pub dungeon_start_freeze_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CounterAction {
    Reset,
    Freeze,
    ResetAndFreeze,
    ResetAndFreezeKeepCounting,
    ResetAndStartCount,
    StartCount,
    #[default]
    NoOp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CounterNamespace {
    Normal,
    Factor,
}

impl CounterNamespace {
    const fn index(self) -> usize {
        match self {
            Self::Normal => 0,
            Self::Factor => 1,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct CounterSnapshot {
    pub counters: Vec<CounterUpdateState>,
    pub factor_counters: Vec<CounterUpdateState>,
    pub factor_source_item_ids: Vec<i32>,
    pub factor_slot_item_ids: Vec<i32>,
    pub season_id: i32,
    pub season_active_template_ids: Vec<i32>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CounterConfigError {
    #[error("duplicate counter rule id {rule_id} in {namespace:?} namespace")]
    DuplicateRuleId {
        namespace: CounterNamespace,
        rule_id: i32,
    },
    #[error("duplicate slot id {slot_id} in counter rule {rule_id}")]
    DuplicateSlotId { rule_id: i32, slot_id: i32 },
    #[error("counter rule {rule_id} has more than u32::MAX sources")]
    TooManySources { rule_id: i32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct SourceHandle {
    rule_index: usize,
    source_index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct SlotHandle {
    rule_index: usize,
    slot_index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum PhaseKey {
    CastStarted,
    DurationStarted,
    DurationEnded,
    Completed,
}

impl PhaseKey {
    fn from_phase(phase: SkillPhase) -> Option<Self> {
        match phase {
            SkillPhase::CastStarted => Some(Self::CastStarted),
            SkillPhase::DurationStarted => Some(Self::DurationStarted),
            SkillPhase::DurationEnded => Some(Self::DurationEnded),
            SkillPhase::Completed => Some(Self::Completed),
            SkillPhase::Observed => None,
        }
    }
}

#[derive(Debug, Default)]
struct EventIndexes {
    outgoing_by_skill: HashMap<i64, Vec<SourceHandle>>,
    outgoing_any: Vec<SourceHandle>,
    incoming_by_skill: HashMap<i64, Vec<SourceHandle>>,
    incoming_any: Vec<SourceHandle>,
    reset_by_skill: HashMap<i64, Vec<SlotHandle>>,
    buff_by_id: HashMap<i32, BuffHandlers>,
    resource_by_id: HashMap<i32, Vec<SourceHandle>>,
    position_by_attr: HashMap<i32, Vec<SourceHandle>>,
    watched_attrs: HashSet<i32>,
    skill_phase: HashMap<(i32, PhaseKey), Vec<SourceHandle>>,
    passive_reset_by_skill: HashMap<i32, Vec<SlotHandle>>,
    dungeon_start_slots: Vec<SlotHandle>,
}

#[derive(Debug, Default)]
struct BuffHandlers {
    sources: Vec<SourceHandle>,
    reset_slots: Vec<SlotHandle>,
    condition_slots: Vec<SlotHandle>,
}

#[derive(Debug)]
struct RuleRuntime {
    rule_id: i32,
    sources: Vec<SourceRuntime>,
    slots: Vec<SlotRuntime>,
    slot_by_id: HashMap<i32, usize>,
}

#[derive(Debug)]
enum SourceRuntime {
    Damage {
        kind: DamageSourceKind,
        increment: u32,
        hits_required: Option<u32>,
        required_type_flags: Option<i32>,
        hit_accumulator: u32,
    },
    DamageOnce {
        increment: u32,
        required_type_flags: Option<i32>,
        batch_counts: HashMap<(i64, EntityUuid), u32>,
        batch_maxima: HashMap<i64, u32>,
        touched: bool,
    },
    FightResourceSpent {
        units_required: u32,
        increment: u32,
        previous_value: Option<i64>,
        accumulated_spent: u32,
    },
    BuffAdded {
        source_config_id: Option<i32>,
        increment: u32,
    },
    BuffLayerSpent {
        units_required: u32,
        increment: u32,
        accumulated_spent: u32,
    },
    BuffTick {
        interval_ms: u64,
        increment: u32,
        attr_condition: Option<TickAttrCondition>,
        active: Option<ActiveBuffTick>,
    },
    SkillCast {
        increment: u32,
    },
    SkillTick {
        interval_ms: u64,
        increment: u32,
        next_cast_sequence: u64,
        active: Option<ActiveSkillTick>,
    },
    SkillComplete {
        increment: u32,
    },
    Movement {
        meters_required: f32,
        increment: u32,
        active_target: Option<EntityRef>,
        last_position: Option<Position>,
        accumulated_meters: f32,
        /// Latest position observed this batch; sampled once at batch end
        /// (old pipeline sampled the attr store once per packet).
        staged_position: Option<Position>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DamageSourceKind {
    Outgoing,
    OutgoingSelfTarget,
    Incoming,
}

/// Single tracked buff-tick instance. The wire instance id is kept so that
/// `Change` only updates the expiry of the tracked instance and `Remove` only
/// stops the tick when it names the tracked instance (old parity).
#[derive(Debug, Clone, Copy)]
struct ActiveBuffTick {
    target: EntityRef,
    instance_id: i64,
    schedule: TickSchedule,
}

#[derive(Debug, Clone, Copy)]
struct ActiveSkillTick {
    caster: EntityRef,
    cast_sequence: u64,
    schedule: TickSchedule,
}

#[derive(Debug, Clone, Copy)]
struct FreezeState {
    deadline_mono: MonoTimeMs,
    deadline_wall_ms: i64,
    duration_ms: u64,
}

#[derive(Debug)]
struct SlotRuntime {
    config: EffectSlotConfig,
    current_count: u32,
    is_counting: bool,
    reset_buff_target: Option<EntityRef>,
    condition_buff_target: Option<EntityRef>,
    freeze: Option<FreezeState>,
}

#[derive(Debug)]
struct NamespaceState {
    rule_set: u64,
    rules: Vec<RuleRuntime>,
    rule_by_id: HashMap<i32, usize>,
    indexes: EventIndexes,
    current_batch: Option<BatchId>,
    touched_once: Vec<SourceHandle>,
}

impl Default for NamespaceState {
    fn default() -> Self {
        Self {
            rule_set: 0,
            rules: Vec::new(),
            rule_by_id: HashMap::new(),
            indexes: EventIndexes::default(),
            current_batch: None,
            touched_once: Vec::new(),
        }
    }
}

const SEASON_NODE_BUFF_MIN_ID: i32 = 4;

#[derive(Debug, Default)]
pub struct CounterEngine {
    namespaces: [NamespaceState; 2],
    next_rule_set: u64,
    /// Bumped by every operation that reports a change, so readers of
    /// [`Self::slot_state`] can skip work when nothing moved.
    revision: u64,
    local_player: Option<EntityRef>,
    attrs: HashMap<i32, i64>,
    paused: bool,
    factor_compiler: FactorCounterCompiler,
    season_id: i32,
    season_active_template_ids: Vec<i32>,
}

impl CounterEngine {
    #[must_use]
    pub fn new() -> Self {
        Self {
            next_rule_set: 1,
            ..Self::default()
        }
    }

    pub fn apply_config(
        &mut self,
        namespace: CounterNamespace,
        rules: Vec<CounterRule>,
        scheduler: &mut DeadlineScheduler,
    ) -> Result<bool, CounterConfigError> {
        let rule_set = self.next_rule_set.max(1);
        let compiled = NamespaceState::compile(namespace, rule_set, rules)?;
        self.next_rule_set = rule_set.wrapping_add(1).max(1);

        let index = namespace.index();
        let previous_rule_set = self.namespaces[index].rule_set;
        if previous_rule_set != 0 {
            scheduler.invalidate_scope(TimerScope::RuleSet(previous_rule_set));
        }
        self.namespaces[index] = compiled;
        Ok(self.note_change(true))
    }

    /// Change counter for everything [`Self::slot_state`] reads.
    #[must_use]
    pub const fn revision(&self) -> u64 {
        self.revision
    }

    fn note_change(&mut self, changed: bool) -> bool {
        if changed {
            self.revision = self.revision.wrapping_add(1);
        }
        changed
    }

    pub fn apply_factor_templates(
        &mut self,
        templates: Vec<FactorCounterTemplate>,
        scheduler: &mut DeadlineScheduler,
    ) -> Result<bool, CounterConfigError> {
        let Some(rules) = self.factor_compiler.set_templates(templates) else {
            return Ok(false);
        };
        self.apply_config(CounterNamespace::Factor, rules, scheduler)
    }

    pub fn begin_batch(&mut self, batch_id: BatchId) -> bool {
        let changed = self
            .namespaces
            .iter_mut()
            .fold(false, |changed, namespace| {
                namespace.begin_batch(batch_id) | changed
            });
        self.note_change(changed)
    }

    pub fn apply_event(
        &mut self,
        envelope: &DomainEnvelope,
        scheduler: &mut DeadlineScheduler,
    ) -> Result<bool, CounterConfigError> {
        let changed = self.apply_event_inner(envelope, scheduler)?;
        Ok(self.note_change(changed))
    }

    fn apply_event_inner(
        &mut self,
        envelope: &DomainEnvelope,
        scheduler: &mut DeadlineScheduler,
    ) -> Result<bool, CounterConfigError> {
        let now_mono = envelope.meta.mono_ms();
        let now_wall = envelope.occurred_at_ms;
        let mut changed = false;

        if let DomainEvent::PauseChanged { is_paused } = envelope.event {
            self.paused = is_paused;
            return Ok(false);
        }

        if let DomainEvent::EntityDisappeared { entity } = envelope.event {
            return Ok(self.clear_entity_runtime(entity, scheduler));
        }

        if matches!(envelope.event, DomainEvent::ContainerReset) {
            changed |= self.local_player.take().is_some();
            changed |= !self.attrs.is_empty();
            self.attrs.clear();
            changed |= self.reset_counts(scheduler);
            return Ok(changed);
        }

        if self.paused {
            // Old-pipeline parity: while paused only skill lifecycle, dungeon
            // start, container resyncs and local-player changes are processed;
            // damage/buff/resource/position/attribute events are dropped and
            // timers keep running in real time.
            match &envelope.event {
                DomainEvent::LocalPlayerChanged { current, .. } => {
                    changed |= self.set_local_player(*current);
                }
                DomainEvent::SeasonCultivateChanged {
                    season_id,
                    active_template_ids,
                    active_item_ids,
                    is_baseline: true,
                } => {
                    changed |= self.apply_season_state(
                        *season_id,
                        active_template_ids,
                        active_item_ids,
                        scheduler,
                    )?;
                }
                DomainEvent::SkillLifecycleChanged {
                    caster,
                    skill_id,
                    phase,
                    ..
                } if self.is_local(*caster) => {
                    for namespace in &mut self.namespaces {
                        changed |= namespace
                            .apply_skill_phase(*caster, *skill_id, *phase, now_mono, scheduler);
                    }
                }
                DomainEvent::DungeonFlowChanged { previous, current }
                    if *current == DUNGEON_FLOW_PLAYING
                        && *previous != Some(DUNGEON_FLOW_PLAYING) =>
                {
                    for namespace in &mut self.namespaces {
                        changed |= namespace.apply_dungeon_start(
                            now_mono,
                            now_wall,
                            &self.attrs,
                            scheduler,
                        );
                    }
                }
                _ => {}
            }
            return Ok(changed);
        }

        match &envelope.event {
            DomainEvent::LocalPlayerChanged { current, .. } => {
                changed |= self.set_local_player(*current);
            }
            DomainEvent::AttributeChanged {
                entity,
                attr_id,
                current,
                ..
            } if self.is_local(*entity) => {
                if let AttributeValue::Int(value) = current {
                    changed |= self.record_attr(*attr_id, *value);
                }
            }
            DomainEvent::PositionChanged {
                entity,
                attr_id,
                current,
                ..
            } if self.is_local(*entity) => {
                for namespace in &mut self.namespaces {
                    namespace.stage_position_change(*attr_id, *current);
                }
            }
            DomainEvent::HitResolved(hit) | DomainEvent::CombatHitAccepted(hit) => {
                for namespace in &mut self.namespaces {
                    changed |= namespace.apply_hit(
                        hit,
                        self.local_player,
                        &self.attrs,
                        now_mono,
                        now_wall,
                        scheduler,
                    );
                }
            }
            DomainEvent::BuffChanged(buff) => {
                for namespace in &mut self.namespaces {
                    changed |=
                        namespace.apply_buff(buff, now_mono, now_wall, &self.attrs, scheduler);
                }
            }
            DomainEvent::FightResourceChanged {
                entity,
                resource_id,
                current,
                ..
            } if self.is_local(*entity) => {
                for namespace in &mut self.namespaces {
                    changed |= namespace.apply_resource(*resource_id, *current);
                }
            }
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase,
                ..
            } if self.is_local(*caster) => {
                for namespace in &mut self.namespaces {
                    changed |= namespace
                        .apply_skill_phase(*caster, *skill_id, *phase, now_mono, scheduler);
                }
            }
            DomainEvent::PassiveSkillObserved {
                entity,
                skill_id,
                ended,
                ..
            } if self.is_local(*entity) => {
                for namespace in &mut self.namespaces {
                    changed |= namespace.apply_passive_skill(
                        *skill_id,
                        *ended,
                        now_mono,
                        now_wall,
                        &self.attrs,
                        scheduler,
                    );
                }
            }
            DomainEvent::DungeonFlowChanged { previous, current }
                if *current == DUNGEON_FLOW_PLAYING && *previous != Some(DUNGEON_FLOW_PLAYING) =>
            {
                for namespace in &mut self.namespaces {
                    changed |=
                        namespace.apply_dungeon_start(now_mono, now_wall, &self.attrs, scheduler);
                }
            }
            DomainEvent::SeasonCultivateChanged {
                season_id,
                active_template_ids,
                active_item_ids,
                is_baseline: _,
            } => {
                changed |= self.apply_season_state(
                    *season_id,
                    active_template_ids,
                    active_item_ids,
                    scheduler,
                )?;
            }
            _ => {}
        }

        Ok(changed)
    }

    pub fn end_batch(&mut self) -> bool {
        let changed = self
            .namespaces
            .iter_mut()
            .fold(false, |changed, namespace| namespace.end_batch() | changed);
        self.note_change(changed)
    }

    pub fn on_due(
        &mut self,
        due: DueTimer,
        fired_at: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let changed = self
            .namespaces
            .iter_mut()
            .find(|namespace| namespace.rule_set_matches(due.key))
            .is_some_and(|namespace| namespace.on_due(due, fired_at, &self.attrs, scheduler));
        self.note_change(changed)
    }

    /// Old-pipeline `reset_counts` parity: called on container resync
    /// (SyncContainerData), never on segment boundaries or manual resets.
    fn reset_counts(&mut self, scheduler: &mut DeadlineScheduler) -> bool {
        self.namespaces
            .iter_mut()
            .fold(false, |changed, namespace| {
                namespace.reset_counts(scheduler) | changed
            })
    }

    fn clear_entity_runtime(
        &mut self,
        entity: EntityRef,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let is_local = self
            .local_player
            .is_some_and(|local| local.uuid == entity.uuid);
        let mut changed = false;
        if is_local {
            changed |= !self.attrs.is_empty();
            self.attrs.clear();
        }
        for namespace in &mut self.namespaces {
            changed |= namespace.clear_entity_runtime(entity, is_local, scheduler);
        }
        changed
    }

    #[must_use]
    pub fn snapshot(&self) -> CounterSnapshot {
        let selection = self.factor_compiler.active_selection();
        CounterSnapshot {
            counters: self.namespaces[CounterNamespace::Normal.index()].snapshot(&self.attrs),
            factor_counters: self.namespaces[CounterNamespace::Factor.index()]
                .snapshot(&self.attrs),
            factor_source_item_ids: selection.source_item_ids,
            factor_slot_item_ids: selection.slot_item_ids,
            season_id: self.season_id,
            season_active_template_ids: self.season_active_template_ids.clone(),
        }
    }

    pub(crate) fn slot_state(
        &self,
        namespace: CounterNamespace,
        rule_id: i32,
        slot_id: i32,
    ) -> Option<SlotUpdateState> {
        let namespace = &self.namespaces[namespace.index()];
        let rule = namespace
            .rule_by_id
            .get(&rule_id)
            .and_then(|index| namespace.rules.get(*index))?;
        let slot = rule
            .slot_by_id
            .get(&slot_id)
            .and_then(|index| rule.slots.get(*index))?;
        Some(slot.snapshot(&self.attrs))
    }

    fn is_local(&self, entity: EntityRef) -> bool {
        self.local_player
            .is_some_and(|local| local.uuid == entity.uuid)
    }

    fn set_local_player(&mut self, current: Option<EntityRef>) -> bool {
        if self.local_player == current {
            return false;
        }
        self.local_player = current;
        self.attrs.clear();
        true
    }

    fn apply_factor_selection(
        &mut self,
        active_item_ids: &[i32],
        scheduler: &mut DeadlineScheduler,
    ) -> Result<bool, CounterConfigError> {
        let Some(rules) = self
            .factor_compiler
            .set_active_item_ids(active_item_ids.to_vec())
        else {
            return Ok(false);
        };
        self.apply_config(CounterNamespace::Factor, rules, scheduler)
    }

    /// Records the resolved season context and, for S3 and earlier, keeps
    /// compiling the factor-socket rules from the active item ids. From S4
    /// on an empty slice is fed instead so `FactorCounterCompiler` clears
    /// its rules once and does no further work per batch.
    fn apply_season_state(
        &mut self,
        season_id: i32,
        active_template_ids: &[i32],
        active_item_ids: &[i32],
        scheduler: &mut DeadlineScheduler,
    ) -> Result<bool, CounterConfigError> {
        self.season_id = season_id;
        let mut changed = self.season_active_template_ids != active_template_ids;
        if changed {
            self.season_active_template_ids.clear();
            self.season_active_template_ids
                .extend_from_slice(active_template_ids);
        }
        let factor_item_ids: &[i32] = if season_id >= SEASON_NODE_BUFF_MIN_ID {
            &[]
        } else {
            active_item_ids
        };
        changed |= self.apply_factor_selection(factor_item_ids, scheduler)?;
        Ok(changed)
    }

    fn record_attr(&mut self, attr_id: i32, value: i64) -> bool {
        let value_changed = self.attrs.insert(attr_id, value) != Some(value);
        value_changed
            && self
                .namespaces
                .iter()
                .any(|namespace| namespace.indexes.watched_attrs.contains(&attr_id))
    }
}

impl NamespaceState {
    fn compile(
        namespace: CounterNamespace,
        rule_set: u64,
        rules: Vec<CounterRule>,
    ) -> Result<Self, CounterConfigError> {
        let mut result = Self {
            rule_set,
            rules: Vec::with_capacity(rules.len()),
            rule_by_id: HashMap::with_capacity(rules.len()),
            indexes: EventIndexes::default(),
            current_batch: None,
            touched_once: Vec::new(),
        };

        for rule in rules {
            if result.rule_by_id.contains_key(&rule.rule_id) {
                return Err(CounterConfigError::DuplicateRuleId {
                    namespace,
                    rule_id: rule.rule_id,
                });
            }
            let rule_index = result.rules.len();
            let mut slot_by_id = HashMap::with_capacity(rule.effect_slots.len());
            let mut slots = Vec::with_capacity(rule.effect_slots.len());
            for (slot_index, config) in rule.effect_slots.into_iter().enumerate() {
                if slot_by_id.insert(config.slot_id, slot_index).is_some() {
                    return Err(CounterConfigError::DuplicateSlotId {
                        rule_id: rule.rule_id,
                        slot_id: config.slot_id,
                    });
                }
                result.index_slot(rule_index, slot_index, &config);
                slots.push(SlotRuntime::new(config));
            }
            let mut sources = Vec::with_capacity(rule.sources.len());
            for (source_index, source) in rule.sources.into_iter().enumerate() {
                let _ = u32::try_from(source_index).map_err(|_| {
                    CounterConfigError::TooManySources {
                        rule_id: rule.rule_id,
                    }
                })?;
                result.index_source(rule_index, source_index, &source);
                sources.push(SourceRuntime::compile(source));
            }
            result.rule_by_id.insert(rule.rule_id, rule_index);
            result.rules.push(RuleRuntime {
                rule_id: rule.rule_id,
                sources,
                slots,
                slot_by_id,
            });
        }

        Ok(result)
    }

    fn index_source(&mut self, rule_index: usize, source_index: usize, source: &CounterSource) {
        let handle = SourceHandle {
            rule_index,
            source_index,
        };
        match source {
            CounterSource::DamageBySkillKey { skill_keys, .. }
            | CounterSource::DamageBySkillKeySelfTarget { skill_keys, .. }
            | CounterSource::DamageBySkillKeyOnce { skill_keys, .. } => {
                let mut seen = HashSet::with_capacity(skill_keys.len());
                for skill_key in skill_keys {
                    if !matches!(source, CounterSource::DamageBySkillKeyOnce { .. })
                        && !seen.insert(*skill_key)
                    {
                        continue;
                    }
                    self.indexes
                        .outgoing_by_skill
                        .entry(*skill_key)
                        .or_default()
                        .push(handle);
                }
            }
            CounterSource::AnyDamage { .. } => self.indexes.outgoing_any.push(handle),
            CounterSource::DamageTaken { skill_keys, .. } => {
                if let Some(skill_keys) = skill_keys {
                    let mut seen = HashSet::with_capacity(skill_keys.len());
                    for skill_key in skill_keys {
                        if seen.insert(*skill_key) {
                            self.indexes
                                .incoming_by_skill
                                .entry(*skill_key)
                                .or_default()
                                .push(handle);
                        }
                    }
                } else {
                    self.indexes.incoming_any.push(handle);
                }
            }
            CounterSource::FightResourceSpent { resource_id, .. } => self
                .indexes
                .resource_by_id
                .entry(*resource_id)
                .or_default()
                .push(handle),
            CounterSource::BuffAdded { buff_id, .. }
            | CounterSource::BuffLayerSpent { buff_id, .. }
            | CounterSource::BuffDurationTick { buff_id, .. }
            | CounterSource::MovementDistance { buff_id, .. } => self
                .indexes
                .buff_by_id
                .entry(*buff_id)
                .or_default()
                .sources
                .push(handle),
            CounterSource::SkillCast { skill_base_ids, .. } => index_skill_ids(
                &mut self.indexes.skill_phase,
                skill_base_ids,
                PhaseKey::CastStarted,
                handle,
            ),
            CounterSource::SkillDurationTick { skill_base_id, .. } => {
                self.indexes
                    .skill_phase
                    .entry((*skill_base_id, PhaseKey::DurationStarted))
                    .or_default()
                    .push(handle);
                self.indexes
                    .skill_phase
                    .entry((*skill_base_id, PhaseKey::DurationEnded))
                    .or_default()
                    .push(handle);
            }
            CounterSource::SkillCastComplete { skill_base_ids, .. } => index_skill_ids(
                &mut self.indexes.skill_phase,
                skill_base_ids,
                PhaseKey::Completed,
                handle,
            ),
        }

        match source {
            CounterSource::BuffDurationTick {
                attr_condition: Some(condition),
                ..
            } => {
                self.indexes.watched_attrs.insert(condition.attr_id);
            }
            CounterSource::MovementDistance { attr_id, .. } => {
                self.indexes
                    .position_by_attr
                    .entry(*attr_id)
                    .or_default()
                    .push(handle);
            }
            _ => {}
        }
    }

    fn index_slot(&mut self, rule_index: usize, slot_index: usize, config: &EffectSlotConfig) {
        let handle = SlotHandle {
            rule_index,
            slot_index,
        };
        self.indexes
            .buff_by_id
            .entry(config.reset_buff_id)
            .or_default()
            .reset_slots
            .push(handle);
        if let Some(alt) = &config.alt_freeze {
            self.indexes
                .buff_by_id
                .entry(alt.condition_buff_id)
                .or_default()
                .condition_slots
                .push(handle);
        }
        if let Some(keys) = &config.reset_skill_keys {
            let mut seen = HashSet::with_capacity(keys.len());
            for key in keys {
                if seen.insert(*key) {
                    self.indexes
                        .reset_by_skill
                        .entry(*key)
                        .or_default()
                        .push(handle);
                }
            }
        }
        if let Some(skill_ids) = &config.reset_passive_skill_ids {
            let mut seen = HashSet::with_capacity(skill_ids.len());
            for skill_id in skill_ids {
                if seen.insert(*skill_id) {
                    self.indexes
                        .passive_reset_by_skill
                        .entry(*skill_id)
                        .or_default()
                        .push(handle);
                }
            }
        }
        if config
            .dungeon_start_freeze_ms
            .is_some_and(|duration| duration > 0)
        {
            self.indexes.dungeon_start_slots.push(handle);
        }
        if let Some(modifier) = &config.threshold_modifier {
            self.indexes.watched_attrs.insert(modifier.attr_id);
        }
        if let Some(modifier) = &config.freeze_duration_modifier {
            self.indexes.watched_attrs.insert(modifier.attr_id);
        }
    }

    fn begin_batch(&mut self, batch_id: BatchId) -> bool {
        if self.current_batch == Some(batch_id) {
            return false;
        }
        let changed = self.end_batch();
        self.current_batch = Some(batch_id);
        changed
    }

    fn end_batch(&mut self) -> bool {
        self.current_batch = None;
        self.flush_damage_phase() | self.flush_position_changes()
    }

    fn flush_damage_phase(&mut self) -> bool {
        let mut changed = false;
        for handle in self.touched_once.drain(..) {
            let rule = &mut self.rules[handle.rule_index];
            let increment = match &mut rule.sources[handle.source_index] {
                SourceRuntime::DamageOnce {
                    increment,
                    batch_counts,
                    batch_maxima,
                    touched,
                    ..
                } => {
                    *touched = false;
                    batch_counts.clear();
                    let matches = batch_maxima
                        .drain()
                        .fold(0u32, |sum, (_, count)| sum.saturating_add(count));
                    increment.saturating_mul(matches)
                }
                _ => 0,
            };
            changed |= rule.add_increment(increment);
        }
        changed
    }

    /// Stages the latest local-player position of this batch per movement
    /// source; sampled once at batch end like the old per-packet attr-store
    /// sample. Later events in the same batch overwrite earlier ones.
    fn stage_position_change(&mut self, attr_id: i32, position: Position) {
        let Some(handles) = self.indexes.position_by_attr.get(&attr_id) else {
            return;
        };
        for &handle in handles {
            if let Some(SourceRuntime::Movement {
                staged_position, ..
            }) = self.rules[handle.rule_index]
                .sources
                .get_mut(handle.source_index)
            {
                *staged_position = Some(position);
            }
        }
    }

    fn flush_position_changes(&mut self) -> bool {
        let mut changed = false;
        for rule in &mut self.rules {
            let mut pending_increment = 0u32;
            for source in &mut rule.sources {
                let SourceRuntime::Movement {
                    meters_required,
                    increment,
                    active_target,
                    last_position,
                    accumulated_meters,
                    staged_position,
                } = source
                else {
                    continue;
                };
                let Some(position) = staged_position.take() else {
                    continue;
                };
                if active_target.is_none() {
                    continue;
                }
                let Some(previous) = last_position.replace(position) else {
                    continue;
                };
                let distance = distance_between(previous, position);
                if !distance.is_finite() || distance <= 0.0 {
                    continue;
                }
                if distance > MAX_MOVEMENT_DELTA_METERS {
                    *accumulated_meters = 0.0;
                    continue;
                }
                *accumulated_meters += distance;
                let triggers = (*accumulated_meters / *meters_required).floor() as u32;
                *accumulated_meters -= *meters_required * triggers as f32;
                pending_increment =
                    pending_increment.saturating_add(increment.saturating_mul(triggers));
            }
            changed |= rule.add_increment(pending_increment);
        }
        changed
    }

    fn apply_hit(
        &mut self,
        hit: &DomainHit,
        local_player: Option<EntityRef>,
        attrs: &HashMap<i32, i64>,
        now_mono: MonoTimeMs,
        now_wall: i64,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let Some(local_player) = local_player else {
            return false;
        };
        let mut changed = false;
        let rule_set = self.rule_set;
        let (indexes, rules, touched_once) =
            (&self.indexes, &mut self.rules, &mut self.touched_once);

        // Old parity: attacker = top_summoner_id.or(attacker_uuid), straight
        // from the packet with no registry-chain resolution.
        let source_is_local = hit
            .packet_owner
            .or(hit.source)
            .is_some_and(|source| source.uuid == local_player.uuid);

        if source_is_local {
            if let Some(handles) = indexes.outgoing_by_skill.get(&hit.skill_key) {
                for &handle in handles {
                    changed |= apply_outgoing_damage_handler(
                        rules,
                        touched_once,
                        handle,
                        hit,
                        local_player,
                    );
                }
            }
            for &handle in &indexes.outgoing_any {
                changed |=
                    apply_outgoing_damage_handler(rules, touched_once, handle, hit, local_player);
            }
            if let Some(handles) = indexes.reset_by_skill.get(&hit.skill_key) {
                for &handle in handles {
                    let rule_id = rules[handle.rule_index].rule_id;
                    let slot = &mut rules[handle.rule_index].slots[handle.slot_index];
                    changed |= slot.apply_action(
                        slot.config.on_reset_skill,
                        rule_set,
                        rule_id,
                        now_mono,
                        now_wall,
                        attrs,
                        scheduler,
                    );
                }
            }
        }

        // Old parity: taken damage is only produced by the to-me channel.
        if hit.kind == HitKind::Damage
            && hit.channel == HitChannel::ToMe
            && hit.target.uuid == local_player.uuid
            && !source_is_local
        {
            if let Some(handles) = indexes.incoming_by_skill.get(&hit.skill_key) {
                for &handle in handles {
                    changed |= apply_incoming_damage_handler(rules, handle, hit);
                }
            }
            for &handle in &indexes.incoming_any {
                changed |= apply_incoming_damage_handler(rules, handle, hit);
            }
        }

        changed
    }

    fn apply_resource(&mut self, resource_id: i32, current: i64) -> bool {
        let (indexes, rules) = (&self.indexes, &mut self.rules);
        let Some(handles) = indexes.resource_by_id.get(&resource_id) else {
            return false;
        };
        let mut changed = false;
        for &handle in handles {
            let rule = &mut rules[handle.rule_index];
            let increment = match &mut rule.sources[handle.source_index] {
                SourceRuntime::FightResourceSpent {
                    units_required,
                    increment,
                    previous_value,
                    accumulated_spent,
                } => {
                    let previous = previous_value.replace(current);
                    if let Some(previous) = previous {
                        if current < previous {
                            let spent =
                                u32::try_from(previous.saturating_sub(current)).unwrap_or(u32::MAX);
                            *accumulated_spent = accumulated_spent.saturating_add(spent);
                            let triggers = *accumulated_spent / *units_required;
                            *accumulated_spent %= *units_required;
                            increment.saturating_mul(triggers)
                        } else {
                            0
                        }
                    } else {
                        0
                    }
                }
                _ => 0,
            };
            changed |= rule.add_increment(increment);
        }
        changed
    }

    fn apply_skill_phase(
        &mut self,
        caster: EntityRef,
        skill_id: i32,
        phase: SkillPhase,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let Some(phase_key) = PhaseKey::from_phase(phase) else {
            return false;
        };
        let (indexes, rules) = (&self.indexes, &mut self.rules);
        let Some(handles) = indexes.skill_phase.get(&(skill_id, phase_key)) else {
            return false;
        };
        let mut changed = false;
        for &handle in handles {
            let rule_id = rules[handle.rule_index].rule_id;
            let rule = &mut rules[handle.rule_index];
            let increment = match &mut rule.sources[handle.source_index] {
                SourceRuntime::SkillCast { increment } if phase_key == PhaseKey::CastStarted => {
                    *increment
                }
                SourceRuntime::SkillComplete { increment } if phase_key == PhaseKey::Completed => {
                    *increment
                }
                SourceRuntime::SkillTick {
                    interval_ms,
                    next_cast_sequence,
                    active,
                    ..
                } if phase_key == PhaseKey::DurationStarted => {
                    if let Some(previous) = active.take() {
                        scheduler.cancel(skill_tick_key(
                            self.rule_set,
                            rule_id,
                            handle.source_index,
                            previous.caster,
                            previous.cast_sequence,
                        ));
                    }
                    let cast_sequence = *next_cast_sequence;
                    *next_cast_sequence = next_cast_sequence.wrapping_add(1);
                    let schedule = TickSchedule::new(now_mono, *interval_ms, None);
                    *active = Some(ActiveSkillTick {
                        caster,
                        cast_sequence,
                        schedule,
                    });
                    schedule_skill_tick(
                        scheduler,
                        self.rule_set,
                        rule_id,
                        handle.source_index,
                        caster,
                        cast_sequence,
                        schedule,
                    );
                    0
                }
                SourceRuntime::SkillTick { active, .. } if phase_key == PhaseKey::DurationEnded => {
                    if let Some(previous) = active.take() {
                        scheduler.cancel(skill_tick_key(
                            self.rule_set,
                            rule_id,
                            handle.source_index,
                            previous.caster,
                            previous.cast_sequence,
                        ));
                    }
                    0
                }
                _ => 0,
            };
            changed |= rule.add_increment(increment);
        }
        changed
    }

    fn apply_passive_skill(
        &mut self,
        skill_id: i32,
        ended: bool,
        now_mono: MonoTimeMs,
        now_wall: i64,
        attrs: &HashMap<i32, i64>,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        if ended {
            return false;
        }
        let rule_set = self.rule_set;
        let (indexes, rules) = (&self.indexes, &mut self.rules);
        let Some(handles) = indexes.passive_reset_by_skill.get(&skill_id) else {
            return false;
        };
        let mut changed = false;
        for &handle in handles {
            let rule_id = rules[handle.rule_index].rule_id;
            let slot = &mut rules[handle.rule_index].slots[handle.slot_index];
            let action = slot.config.on_passive_skill;
            changed |= slot.apply_action(
                action, rule_set, rule_id, now_mono, now_wall, attrs, scheduler,
            );
        }
        changed
    }

    fn apply_dungeon_start(
        &mut self,
        now_mono: MonoTimeMs,
        now_wall: i64,
        attrs: &HashMap<i32, i64>,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let rule_set = self.rule_set;
        let (indexes, rules) = (&self.indexes, &mut self.rules);
        let mut changed = false;
        for &handle in &indexes.dungeon_start_slots {
            let rule_id = rules[handle.rule_index].rule_id;
            let slot = &mut rules[handle.rule_index].slots[handle.slot_index];
            let duration = slot.config.dungeon_start_freeze_ms.unwrap_or_default();
            changed |= slot.apply_fixed_freeze(
                duration, rule_set, rule_id, now_mono, now_wall, attrs, scheduler,
            );
        }
        changed
    }

    fn apply_buff(
        &mut self,
        buff: &BuffEvent,
        now_mono: MonoTimeMs,
        now_wall: i64,
        attrs: &HashMap<i32, i64>,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let wire = buff.wire_kind;
        if wire == BuffWireKind::Snapshot {
            // Snapshots establish no counter state.
            return false;
        }
        let rule_set = self.rule_set;
        let (indexes, rules) = (&self.indexes, &mut self.rules);
        let Some(handlers) = indexes.buff_by_id.get(&buff.state.base_id) else {
            return false;
        };
        let is_local = buff.target_roles.is_local_player;
        let mut changed = false;

        if is_local {
            for &handle in &handlers.sources {
                let rule_id = rules[handle.rule_index].rule_id;
                let rule = &mut rules[handle.rule_index];
                let increment = match &mut rule.sources[handle.source_index] {
                    SourceRuntime::BuffAdded {
                        source_config_id,
                        increment,
                    } if wire == BuffWireKind::Add
                        && source_config_id.is_none_or(|required| {
                            buff.state.source_config_id == Some(required)
                        }) =>
                    {
                        *increment
                    }
                    SourceRuntime::BuffLayerSpent {
                        units_required,
                        increment,
                        accumulated_spent,
                    } if wire == BuffWireKind::Change => {
                        let previous = buff.previous_layer.unwrap_or(buff.state.layer);
                        if previous > buff.state.layer {
                            let spent = u32::try_from(previous.saturating_sub(buff.state.layer))
                                .unwrap_or(u32::MAX);
                            *accumulated_spent = accumulated_spent.saturating_add(spent);
                            let triggers = *accumulated_spent / *units_required;
                            *accumulated_spent %= *units_required;
                            increment.saturating_mul(triggers)
                        } else {
                            0
                        }
                    }
                    SourceRuntime::BuffTick {
                        interval_ms,
                        active,
                        ..
                    } => {
                        update_buff_tick(
                            active,
                            *interval_ms,
                            handle,
                            rule_set,
                            rule_id,
                            buff,
                            now_mono,
                            scheduler,
                        );
                        0
                    }
                    SourceRuntime::Movement {
                        active_target,
                        last_position,
                        accumulated_meters,
                        ..
                    } => {
                        match wire {
                            BuffWireKind::Add => {
                                *active_target = Some(buff.state.target);
                                *last_position = None;
                                *accumulated_meters = 0.0;
                            }
                            BuffWireKind::Change => {
                                if active_target.is_none() {
                                    *active_target = Some(buff.state.target);
                                    *last_position = None;
                                    *accumulated_meters = 0.0;
                                }
                            }
                            BuffWireKind::Remove => {
                                *active_target = None;
                                *last_position = None;
                                *accumulated_meters = 0.0;
                            }
                            BuffWireKind::Snapshot => {}
                        }
                        0
                    }
                    _ => 0,
                };
                changed |= rule.add_increment(increment);
            }

            for &handle in &handlers.condition_slots {
                let slot = &mut rules[handle.rule_index].slots[handle.slot_index];
                changed |= match wire {
                    BuffWireKind::Add => replace_if_different(
                        &mut slot.condition_buff_target,
                        Some(buff.state.target),
                    ),
                    BuffWireKind::Remove => slot.condition_buff_target.take().is_some(),
                    _ => false,
                };
            }
        }

        for &handle in &handlers.reset_slots {
            let rule_id = rules[handle.rule_index].rule_id;
            let slot = &mut rules[handle.rule_index].slots[handle.slot_index];
            let target_matches = match slot.config.reset_buff_target {
                ResetBuffTarget::SelfPlayer => buff.target_roles.is_local_player,
                ResetBuffTarget::AnyTeam => {
                    buff.target_roles.is_local_player || buff.target_roles.is_team_member
                }
            };
            if !target_matches
                || slot
                    .config
                    .reset_source_config_id
                    .is_some_and(|required| buff.state.source_config_id != Some(required))
            {
                continue;
            }
            let action = match wire {
                BuffWireKind::Add => {
                    changed |=
                        replace_if_different(&mut slot.reset_buff_target, Some(buff.state.target));
                    slot.config.on_buff_add
                }
                BuffWireKind::Change => slot.config.on_buff_change,
                BuffWireKind::Remove => {
                    changed |= slot.reset_buff_target.take().is_some();
                    slot.config.on_buff_remove
                }
                BuffWireKind::Snapshot => CounterAction::NoOp,
            };
            changed |= slot.apply_action(
                action, rule_set, rule_id, now_mono, now_wall, attrs, scheduler,
            );
        }
        changed
    }

    fn on_due(
        &mut self,
        due: DueTimer,
        fired_at: MonoTimeMs,
        attrs: &HashMap<i32, i64>,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        match due.key {
            TimerKey::CounterFreeze {
                rule_set,
                rule_id,
                slot_id,
            } if rule_set == self.rule_set => {
                let Some(&rule_index) = self.rule_by_id.get(&rule_id) else {
                    return false;
                };
                let Some(slot) = self.rules[rule_index]
                    .slots
                    .iter_mut()
                    .find(|slot| slot.config.slot_id == slot_id)
                else {
                    return false;
                };
                if !slot
                    .freeze
                    .is_some_and(|freeze| freeze.deadline_mono == due.scheduled_for)
                {
                    return false;
                }
                slot.freeze = None;
                slot.apply_expiry_action()
            }
            TimerKey::BuffTick {
                rule_set,
                rule_id,
                source_id,
            } if rule_set == self.rule_set => {
                let Some(&rule_index) = self.rule_by_id.get(&rule_id) else {
                    return false;
                };
                let source_index = source_id as usize;
                let Some(source) = self.rules[rule_index].sources.get_mut(source_index) else {
                    return false;
                };
                let SourceRuntime::BuffTick {
                    increment,
                    attr_condition,
                    active,
                    ..
                } = source
                else {
                    return false;
                };
                let Some(tracked) = active.as_mut() else {
                    return false;
                };
                if tracked.schedule.next_deadline() != Some(due.scheduled_for) {
                    return false;
                }
                let advance = tracked.schedule.advance_to(fired_at);
                tracked.schedule = advance.schedule;
                let condition_met = attr_condition.as_ref().is_none_or(|condition| {
                    attrs.get(&condition.attr_id).copied()
                        == Some(i64::from(condition.required_value))
                });
                let total = if condition_met {
                    increment.saturating_mul(u32::try_from(advance.tick_count).unwrap_or(u32::MAX))
                } else {
                    0
                };
                if let Some(next_deadline) = advance.next_deadline {
                    scheduler.schedule(
                        due.key,
                        TimerScope::RuleSet(self.rule_set),
                        next_deadline,
                        TimerTask::BuffTick(advance.schedule),
                    );
                }
                // Expiry keeps the tracked instance (old kept `active_buff_uuid`)
                // so a later same-instance Change can refresh the expiry.
                self.rules[rule_index].add_increment(total)
            }
            TimerKey::SkillTick {
                rule_set,
                rule_id,
                source_id,
                caster,
                cast_sequence,
            } if rule_set == self.rule_set => {
                let Some(&rule_index) = self.rule_by_id.get(&rule_id) else {
                    return false;
                };
                let source_index = source_id as usize;
                let Some(source) = self.rules[rule_index].sources.get_mut(source_index) else {
                    return false;
                };
                let increment = match source {
                    SourceRuntime::SkillTick {
                        increment, active, ..
                    } => {
                        let Some(current) = active.as_mut() else {
                            return false;
                        };
                        if current.caster != caster
                            || current.cast_sequence != cast_sequence
                            || current.schedule.next_deadline() != Some(due.scheduled_for)
                        {
                            return false;
                        }
                        let advance = current.schedule.advance_to(fired_at);
                        current.schedule = advance.schedule;
                        if let Some(next_deadline) = advance.next_deadline {
                            scheduler.schedule(
                                due.key,
                                TimerScope::RuleSet(self.rule_set),
                                next_deadline,
                                TimerTask::SkillTick(advance.schedule),
                            );
                        }
                        increment
                            .saturating_mul(u32::try_from(advance.tick_count).unwrap_or(u32::MAX))
                    }
                    _ => return false,
                };
                self.rules[rule_index].add_increment(increment)
            }
            _ => false,
        }
    }

    fn rule_set_matches(&self, key: TimerKey) -> bool {
        match key {
            TimerKey::CounterFreeze { rule_set, .. }
            | TimerKey::BuffTick { rule_set, .. }
            | TimerKey::SkillTick { rule_set, .. } => rule_set == self.rule_set,
            _ => false,
        }
    }

    fn clear_entity_runtime(
        &mut self,
        entity: EntityRef,
        is_local: bool,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let mut changed = false;
        for rule in &mut self.rules {
            for slot in &mut rule.slots {
                if slot.reset_buff_target == Some(entity) {
                    slot.reset_buff_target = None;
                    changed = true;
                }
                if slot.condition_buff_target == Some(entity) {
                    slot.condition_buff_target = None;
                    changed = true;
                }
            }
            for (source_index, source) in rule.sources.iter_mut().enumerate() {
                match source {
                    SourceRuntime::FightResourceSpent {
                        previous_value,
                        accumulated_spent,
                        ..
                    } if is_local => {
                        changed |= previous_value.take().is_some();
                        changed |= replace_if_different(accumulated_spent, 0);
                    }
                    SourceRuntime::BuffLayerSpent {
                        accumulated_spent, ..
                    } if is_local => {
                        changed |= replace_if_different(accumulated_spent, 0);
                    }
                    SourceRuntime::BuffTick { active, .. }
                        if active.is_some_and(|tracked| tracked.target == entity) =>
                    {
                        *active = None;
                        scheduler.cancel(buff_tick_key(self.rule_set, rule.rule_id, source_index));
                        changed = true;
                    }
                    SourceRuntime::Movement {
                        active_target,
                        last_position,
                        accumulated_meters,
                        staged_position,
                        ..
                    } if *active_target == Some(entity) => {
                        *active_target = None;
                        changed = true;
                        changed |= last_position.take().is_some();
                        changed |= replace_if_different(accumulated_meters, 0.0);
                        changed |= staged_position.take().is_some();
                    }
                    _ => {}
                }
            }
        }
        changed
    }

    /// Old `reset_counts` parity: clears counts and all derived runtime state
    /// on container resync. Timers die with the rule-set scope invalidation.
    fn reset_counts(&mut self, scheduler: &mut DeadlineScheduler) -> bool {
        if self.rule_set != 0 {
            scheduler.invalidate_scope(TimerScope::RuleSet(self.rule_set));
        }
        self.current_batch = None;
        self.touched_once.clear();
        let mut changed = false;
        for rule in &mut self.rules {
            for slot in &mut rule.slots {
                changed |= replace_if_different(&mut slot.current_count, 0);
                changed |= replace_if_different(&mut slot.is_counting, true);
                changed |= slot.reset_buff_target.take().is_some();
                changed |= slot.condition_buff_target.take().is_some();
                changed |= slot.freeze.take().is_some();
            }
            for source in &mut rule.sources {
                changed |= source.reset_counts();
            }
        }
        changed
    }

    fn snapshot(&self, attrs: &HashMap<i32, i64>) -> Vec<CounterUpdateState> {
        let mut rows = Vec::with_capacity(self.rules.len());
        for rule in &self.rules {
            rows.push(CounterUpdateState {
                rule_id: rule.rule_id,
                slots: rule.slots.iter().map(|slot| slot.snapshot(attrs)).collect(),
            });
        }
        rows.sort_unstable_by_key(|row| row.rule_id);
        rows
    }
}

fn apply_outgoing_damage_handler(
    rules: &mut [RuleRuntime],
    touched_once: &mut Vec<SourceHandle>,
    handle: SourceHandle,
    hit: &DomainHit,
    local_player: EntityRef,
) -> bool {
    let rule = &mut rules[handle.rule_index];
    let increment = match &mut rule.sources[handle.source_index] {
        SourceRuntime::Damage {
            kind,
            increment,
            hits_required,
            required_type_flags,
            hit_accumulator,
        } if *kind != DamageSourceKind::Incoming
            && (*kind != DamageSourceKind::OutgoingSelfTarget
                || hit.target.uuid == local_player.uuid)
            && matches_required_type_flags(hit.type_flags, *required_type_flags) =>
        {
            apply_required_hits(hit_accumulator, *increment, *hits_required)
        }
        SourceRuntime::DamageOnce {
            increment: _,
            required_type_flags,
            batch_counts,
            batch_maxima,
            touched,
        } if matches_required_type_flags(hit.type_flags, *required_type_flags) => {
            let count = batch_counts
                .entry((hit.skill_key, hit.target.uuid))
                .or_default();
            *count = count.saturating_add(1);
            let maximum = batch_maxima.entry(hit.skill_key).or_default();
            *maximum = (*maximum).max(*count);
            if !*touched {
                *touched = true;
                touched_once.push(handle);
            }
            0
        }
        _ => 0,
    };
    rule.add_increment(increment)
}

fn apply_incoming_damage_handler(
    rules: &mut [RuleRuntime],
    handle: SourceHandle,
    hit: &DomainHit,
) -> bool {
    let rule = &mut rules[handle.rule_index];
    let increment = match &mut rule.sources[handle.source_index] {
        SourceRuntime::Damage {
            kind: DamageSourceKind::Incoming,
            increment,
            hits_required,
            required_type_flags,
            hit_accumulator,
        } if matches_required_type_flags(hit.type_flags, *required_type_flags) => {
            apply_required_hits(hit_accumulator, *increment, *hits_required)
        }
        _ => 0,
    };
    rule.add_increment(increment)
}

impl RuleRuntime {
    fn add_increment(&mut self, increment: u32) -> bool {
        if increment == 0 {
            return false;
        }
        let mut changed = false;
        for slot in &mut self.slots {
            if !slot.is_counting {
                continue;
            }
            // Self-cycling counters: once the count reaches the threshold, the
            // next increment restarts the cycle at zero instead of stacking.
            if slot.config.wrap_at_threshold
                && slot
                    .config
                    .threshold
                    .is_some_and(|threshold| slot.current_count >= threshold)
            {
                changed |= slot.current_count != 0;
                slot.current_count = 0;
                continue;
            }
            let next = slot.current_count.saturating_add(increment);
            changed |= next != slot.current_count;
            slot.current_count = next;
        }
        changed
    }
}

impl SourceRuntime {
    fn reset_counts(&mut self) -> bool {
        match self {
            Self::Damage {
                hit_accumulator, ..
            } => replace_if_different(&mut *hit_accumulator, 0),
            Self::DamageOnce {
                batch_counts,
                batch_maxima,
                touched,
                ..
            } => {
                let changed = !batch_counts.is_empty() || !batch_maxima.is_empty() || *touched;
                batch_counts.clear();
                batch_maxima.clear();
                *touched = false;
                changed
            }
            Self::FightResourceSpent {
                previous_value,
                accumulated_spent,
                ..
            } => previous_value.take().is_some() | replace_if_different(&mut *accumulated_spent, 0),
            Self::BuffLayerSpent {
                accumulated_spent, ..
            } => replace_if_different(&mut *accumulated_spent, 0),
            Self::BuffTick { active, .. } => active.take().is_some(),
            Self::SkillTick {
                active,
                next_cast_sequence,
                ..
            } => active.take().is_some() | replace_if_different(&mut *next_cast_sequence, 1),
            Self::Movement {
                active_target,
                last_position,
                accumulated_meters,
                staged_position,
                ..
            } => {
                active_target.take().is_some()
                    | last_position.take().is_some()
                    | replace_if_different(&mut *accumulated_meters, 0.0)
                    | staged_position.take().is_some()
            }
            Self::BuffAdded { .. } | Self::SkillCast { .. } | Self::SkillComplete { .. } => false,
        }
    }
}

impl SlotRuntime {
    #[allow(clippy::too_many_arguments)]
    fn apply_action(
        &mut self,
        action: CounterAction,
        rule_set: u64,
        rule_id: i32,
        now_mono: MonoTimeMs,
        now_wall: i64,
        attrs: &HashMap<i32, i64>,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let mut changed = self.apply_action_state(action);
        if matches!(
            action,
            CounterAction::Freeze
                | CounterAction::ResetAndFreeze
                | CounterAction::ResetAndFreezeKeepCounting
        ) {
            if let Some(duration_ms) = self.effective_freeze_duration(attrs) {
                changed |= self.schedule_freeze(
                    duration_ms,
                    rule_set,
                    rule_id,
                    now_mono,
                    now_wall,
                    scheduler,
                );
            }
        } else if matches!(
            action,
            CounterAction::ResetAndStartCount | CounterAction::StartCount
        ) {
            changed |= self.clear_freeze(rule_set, rule_id, scheduler);
        }
        changed
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_fixed_freeze(
        &mut self,
        duration_ms: u64,
        rule_set: u64,
        rule_id: i32,
        now_mono: MonoTimeMs,
        now_wall: i64,
        _attrs: &HashMap<i32, i64>,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        if duration_ms == 0 {
            return false;
        }
        let mut changed = self.apply_action_state(CounterAction::Freeze);
        changed |= self.schedule_freeze(
            duration_ms,
            rule_set,
            rule_id,
            now_mono,
            now_wall,
            scheduler,
        );
        changed
    }

    fn apply_action_state(&mut self, action: CounterAction) -> bool {
        match action {
            CounterAction::Reset => replace_if_different(&mut self.current_count, 0),
            CounterAction::Freeze => replace_if_different(&mut self.is_counting, false),
            CounterAction::ResetAndFreeze => {
                replace_if_different(&mut self.current_count, 0)
                    | replace_if_different(&mut self.is_counting, false)
            }
            CounterAction::ResetAndFreezeKeepCounting => {
                replace_if_different(&mut self.current_count, 0)
                    | replace_if_different(&mut self.is_counting, true)
            }
            CounterAction::ResetAndStartCount => {
                replace_if_different(&mut self.current_count, 0)
                    | replace_if_different(&mut self.is_counting, true)
            }
            CounterAction::StartCount => replace_if_different(&mut self.is_counting, true),
            CounterAction::NoOp => false,
        }
    }

    fn apply_expiry_action(&mut self) -> bool {
        self.apply_action_state(self.config.on_freeze_expire)
    }

    fn schedule_freeze(
        &mut self,
        duration_ms: u64,
        rule_set: u64,
        rule_id: i32,
        now_mono: MonoTimeMs,
        now_wall: i64,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let deadline_mono = now_mono.saturating_add(duration_ms);
        let deadline_wall_ms =
            now_wall.saturating_add(i64::try_from(duration_ms).unwrap_or(i64::MAX));
        let next = FreezeState {
            deadline_mono,
            deadline_wall_ms,
            duration_ms,
        };
        let changed = self.freeze.is_none_or(|previous| {
            previous.deadline_mono != deadline_mono || previous.duration_ms != duration_ms
        });
        self.freeze = Some(next);
        scheduler.schedule(
            freeze_key(rule_set, rule_id, self.config.slot_id),
            TimerScope::RuleSet(rule_set),
            deadline_mono,
            TimerTask::CounterFreeze,
        );
        changed
    }

    fn clear_freeze(
        &mut self,
        rule_set: u64,
        rule_id: i32,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        let changed = self.freeze.take().is_some();
        scheduler.cancel(freeze_key(rule_set, rule_id, self.config.slot_id));
        changed
    }

    fn effective_threshold(&self, attrs: &HashMap<i32, i64>) -> Option<u32> {
        self.config.threshold.map(|threshold| {
            let scale = attr_scale(self.config.threshold_modifier.as_ref(), attrs);
            u32::try_from(scale_basis_points_ceil(u64::from(threshold), scale)).unwrap_or(u32::MAX)
        })
    }

    fn effective_freeze_duration(&self, attrs: &HashMap<i32, i64>) -> Option<u64> {
        let duration = if let Some(alt) = &self.config.alt_freeze {
            if self.condition_buff_target.is_some() {
                alt.freeze_duration_ms
            } else {
                self.config.freeze_duration_ms?
            }
        } else {
            self.config.freeze_duration_ms?
        };
        let scale = attr_scale(self.config.freeze_duration_modifier.as_ref(), attrs);
        Some(scale_basis_points_ceil(duration, scale))
    }

    fn snapshot(&self, attrs: &HashMap<i32, i64>) -> SlotUpdateState {
        SlotUpdateState {
            slot_id: self.config.slot_id,
            current_count: self.current_count,
            threshold: self.config.threshold,
            effective_threshold: self.effective_threshold(attrs),
            is_counting: self.is_counting,
            reset_buff_active: self.reset_buff_target.is_some(),
            freeze_until_ms: self.freeze.map(|freeze| freeze.deadline_wall_ms),
            freeze_duration_ms: self.config.freeze_duration_ms,
            effective_freeze_duration_ms: self.effective_freeze_duration(attrs),
        }
    }
}

/// Old `apply_tick_change` parity, single tracked instance:
/// - `Add` always restarts at the event's arrival time; expiry derives from
///   the duration only (never the server-provided create/expire timestamps).
/// - `Change` for the tracked instance only refreshes the expiry when the
///   wire carried a new duration; for a different instance it restarts.
/// - `Remove` stops the tick only when it names the tracked instance.
/// - Snapshot events never reach here (filtered by the caller).
#[allow(clippy::too_many_arguments)]
fn update_buff_tick(
    active: &mut Option<ActiveBuffTick>,
    interval_ms: u64,
    handle: SourceHandle,
    rule_set: u64,
    rule_id: i32,
    buff: &BuffEvent,
    now_mono: MonoTimeMs,
    scheduler: &mut DeadlineScheduler,
) {
    let key = buff_tick_key(rule_set, rule_id, handle.source_index);
    let restart = |active: &mut Option<ActiveBuffTick>, scheduler: &mut DeadlineScheduler| {
        let schedule = TickSchedule::new(
            now_mono,
            interval_ms,
            duration_expiry(now_mono, buff.state.duration_ms),
        );
        *active = Some(ActiveBuffTick {
            target: buff.state.target,
            instance_id: buff.state.instance_id,
            schedule,
        });
        schedule_buff_tick(scheduler, rule_set, rule_id, handle.source_index, schedule);
    };
    match buff.wire_kind {
        BuffWireKind::Add => restart(active, scheduler),
        BuffWireKind::Change => match *active {
            Some(tracked) if tracked.instance_id == buff.state.instance_id => {
                if buff.duration_updated {
                    let schedule = TickSchedule {
                        expires_at: duration_expiry(now_mono, buff.state.duration_ms),
                        ..tracked.schedule
                    };
                    *active = Some(ActiveBuffTick {
                        schedule,
                        ..tracked
                    });
                    scheduler.cancel(key);
                    schedule_buff_tick(scheduler, rule_set, rule_id, handle.source_index, schedule);
                }
            }
            _ => restart(active, scheduler),
        },
        BuffWireKind::Remove => {
            if active.is_some_and(|tracked| tracked.instance_id == buff.state.instance_id) {
                *active = None;
                scheduler.cancel(key);
            }
        }
        BuffWireKind::Snapshot => {}
    }
}

/// Old `duration_expires_at` parity: expiry is start time plus duration;
/// a missing or non-positive duration means the buff never expires.
fn duration_expiry(started_at: MonoTimeMs, duration_ms: Option<u64>) -> Option<MonoTimeMs> {
    duration_ms
        .filter(|duration| *duration > 0)
        .map(|duration| started_at.saturating_add(duration))
}

fn schedule_buff_tick(
    scheduler: &mut DeadlineScheduler,
    rule_set: u64,
    rule_id: i32,
    source_index: usize,
    schedule: TickSchedule,
) {
    let Some(deadline) = schedule.next_deadline() else {
        return;
    };
    scheduler.schedule(
        buff_tick_key(rule_set, rule_id, source_index),
        TimerScope::RuleSet(rule_set),
        deadline,
        TimerTask::BuffTick(schedule),
    );
}

fn schedule_skill_tick(
    scheduler: &mut DeadlineScheduler,
    rule_set: u64,
    rule_id: i32,
    source_index: usize,
    caster: EntityRef,
    cast_sequence: u64,
    schedule: TickSchedule,
) {
    let Some(deadline) = schedule.next_deadline() else {
        return;
    };
    scheduler.schedule(
        skill_tick_key(rule_set, rule_id, source_index, caster, cast_sequence),
        TimerScope::RuleSet(rule_set),
        deadline,
        TimerTask::SkillTick(schedule),
    );
}

fn freeze_key(rule_set: u64, rule_id: i32, slot_id: i32) -> TimerKey {
    TimerKey::CounterFreeze {
        rule_set,
        rule_id,
        slot_id,
    }
}

fn buff_tick_key(rule_set: u64, rule_id: i32, source_index: usize) -> TimerKey {
    TimerKey::BuffTick {
        rule_set,
        rule_id,
        source_id: u32::try_from(source_index).unwrap_or(u32::MAX),
    }
}

fn skill_tick_key(
    rule_set: u64,
    rule_id: i32,
    source_index: usize,
    caster: EntityRef,
    cast_sequence: u64,
) -> TimerKey {
    TimerKey::SkillTick {
        rule_set,
        rule_id,
        source_id: u32::try_from(source_index).unwrap_or(u32::MAX),
        caster,
        cast_sequence,
    }
}

fn apply_required_hits(accumulator: &mut u32, increment: u32, hits_required: Option<u32>) -> u32 {
    match hits_required {
        Some(required) if required > 1 => {
            *accumulator = accumulator.saturating_add(1);
            if *accumulator < required {
                0
            } else {
                let triggers = *accumulator / required;
                *accumulator %= required;
                increment.saturating_mul(triggers)
            }
        }
        _ => increment,
    }
}

fn matches_required_type_flags(type_flags: i32, required: Option<i32>) -> bool {
    required.is_none_or(|required| (type_flags & required) == required)
}

fn attr_scale(modifier: Option<&AttrModifier>, attrs: &HashMap<i32, i64>) -> u32 {
    let Some(modifier) = modifier else {
        return FULL_SCALE_BASIS_POINTS as u32;
    };
    let raw = attrs
        .get(&modifier.attr_id)
        .copied()
        .unwrap_or_default()
        .max(0) as u64;
    let divisor = u64::from(modifier.basis_points_per_unit.max(1));
    let reduction = (raw / divisor).min(u64::from(modifier.max_reduction_basis_points));
    FULL_SCALE_BASIS_POINTS.saturating_sub(reduction) as u32
}

fn scale_basis_points_ceil(value: u64, scale: u32) -> u64 {
    value
        .saturating_mul(u64::from(scale))
        .saturating_add(FULL_SCALE_BASIS_POINTS - 1)
        / FULL_SCALE_BASIS_POINTS
}

fn distance_between(a: Position, b: Position) -> f32 {
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    (dx.mul_add(dx, dz * dz)).sqrt()
}

fn normalize_meters_required(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        1.0
    }
}

fn replace_if_different<T: PartialEq>(target: &mut T, next: T) -> bool {
    if *target == next {
        false
    } else {
        *target = next;
        true
    }
}

fn default_on_freeze_expire() -> CounterAction {
    CounterAction::ResetAndStartCount
}

fn default_basis_points_per_unit() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{
        BuffState, BuffTransition, EntityRoles, EventMeta, SegmentId,
    };

    const LOCAL: EntityRef = EntityRef {
        uuid: EntityUuid(1),
        generation: 1,
    };
    const TARGET_A: EntityRef = EntityRef {
        uuid: EntityUuid(2),
        generation: 1,
    };
    const TARGET_B: EntityRef = EntityRef {
        uuid: EntityUuid(3),
        generation: 1,
    };
    const SUMMON: EntityRef = EntityRef {
        uuid: EntityUuid(4),
        generation: 1,
    };

    fn slot(slot_id: i32) -> EffectSlotConfig {
        EffectSlotConfig {
            slot_id,
            threshold: Some(1_000),
            reset_buff_id: 0,
            reset_source_config_id: None,
            reset_buff_target: ResetBuffTarget::SelfPlayer,
            on_buff_add: CounterAction::NoOp,
            on_buff_change: CounterAction::NoOp,
            on_buff_remove: CounterAction::NoOp,
            freeze_duration_ms: None,
            on_freeze_expire: CounterAction::ResetAndStartCount,
            alt_freeze: None,
            threshold_modifier: None,
            freeze_duration_modifier: None,
            reset_skill_keys: None,
            on_reset_skill: CounterAction::NoOp,
            wrap_at_threshold: false,
            reset_passive_skill_ids: None,
            on_passive_skill: CounterAction::NoOp,
            dungeon_start_freeze_ms: None,
        }
    }

    fn envelope(batch_id: u64, mono_ms: u64, event: DomainEvent) -> DomainEnvelope {
        DomainEnvelope {
            sequence: batch_id,
            batch_id: BatchId(batch_id),
            occurred_at_ms: 100_000 + mono_ms as i64,
            meta: EventMeta {
                batch_id: BatchId(batch_id),
                capture_sequence: batch_id,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: 100_000 + mono_ms as i64,
                captured_mono_ns: mono_ms * 1_000_000,
                source_time_ms: None,
            },
            event_index: 0,
            segment_id: Some(SegmentId(1)),
            event,
        }
    }

    fn local_changed(batch_id: u64, mono_ms: u64) -> DomainEnvelope {
        envelope(
            batch_id,
            mono_ms,
            DomainEvent::LocalPlayerChanged {
                previous: None,
                current: Some(LOCAL),
            },
        )
    }

    fn hit(skill_key: i64, target: EntityRef) -> DomainHit {
        DomainHit {
            channel: HitChannel::ToMe,
            source: Some(LOCAL),
            packet_owner: Some(LOCAL),
            resolved_owner: Some(LOCAL),
            target,
            source_kind: None,
            target_kind: crate::live::runtime::events::EntityKind::Monster,
            source_monster_id: None,
            target_monster_id: Some(10),
            target_is_boss: false,
            source_is_player: true,
            source_is_local_player: true,
            skill_key,
            skill_id: Some(1),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 1,
            has_loss_breakdown: false,
            hp_loss: 0,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        }
    }

    fn incoming_hit(skill_key: i64, channel: HitChannel) -> DomainHit {
        DomainHit {
            channel,
            source: Some(TARGET_A),
            packet_owner: None,
            resolved_owner: None,
            target: LOCAL,
            source_kind: Some(crate::live::runtime::events::EntityKind::Monster),
            target_kind: crate::live::runtime::events::EntityKind::Character,
            source_monster_id: Some(10),
            target_monster_id: None,
            target_is_boss: false,
            source_is_player: false,
            source_is_local_player: false,
            skill_key,
            skill_id: Some(1),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 1,
            has_loss_breakdown: false,
            hp_loss: 0,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        }
    }

    fn local_buff(wire: BuffWireKind, layer: i32, previous_layer: Option<i32>) -> BuffEvent {
        BuffEvent {
            transition: match wire {
                BuffWireKind::Add => BuffTransition::Applied,
                BuffWireKind::Change => BuffTransition::LayerChanged,
                BuffWireKind::Remove => BuffTransition::Removed,
                BuffWireKind::Snapshot => BuffTransition::Baseline,
            },
            wire_kind: wire,
            duration_updated: false,
            previous_layer,
            state: BuffState {
                target: LOCAL,
                instance_id: 900,
                base_id: 77,
                layer,
                source: Some(LOCAL),
                resolved_owner: Some(LOCAL),
                source_config_id: Some(8),
                duration_ms: None,
                started_wall_ms: None,
                expires_wall_ms: None,
                started_mono_ms: None,
                expires_mono_ms: None,
                effect_ids: std::sync::Arc::from([]),
            },
            target_roles: EntityRoles {
                is_local_player: true,
                is_team_member: true,
                is_current_target: false,
            },
        }
    }

    fn count(engine: &CounterEngine, namespace: CounterNamespace, rule_id: i32) -> u32 {
        let snapshot = engine.snapshot();
        let rows = match namespace {
            CounterNamespace::Normal => snapshot.counters,
            CounterNamespace::Factor => snapshot.factor_counters,
        };
        rows.into_iter()
            .find(|row| row.rule_id == rule_id)
            .and_then(|row| row.slots.into_iter().next())
            .map_or(0, |slot| slot.current_count)
    }

    #[test]
    fn hit_resolved_and_accepted_both_count_once_max_at_batch_end() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 1,
                    sources: vec![CounterSource::DamageBySkillKeyOnce {
                        skill_keys: vec![10, 11],
                        increment: 25,
                        required_type_flags: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine.begin_batch(BatchId(2));

        // 训练模式/冻结段只产 HitResolved(未被 combat 接受),计数引擎无条件计数(旧版 parity)。
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::HitResolved(hit(10, TARGET_A))),
                &mut scheduler,
            )
            .expect("resolved hit also counts");
        for domain_hit in [
            hit(10, TARGET_A),
            hit(10, TARGET_A),
            hit(10, TARGET_B),
            hit(11, TARGET_A),
            hit(11, TARGET_B),
            hit(11, TARGET_B),
            hit(11, TARGET_B),
        ] {
            engine
                .apply_event(
                    &envelope(2, 20, DomainEvent::CombatHitAccepted(domain_hit)),
                    &mut scheduler,
                )
                .expect("accepted hit");
        }

        assert_eq!(count(&engine, CounterNamespace::Normal, 1), 0);
        assert!(engine.end_batch());
        // skill 10: max(A=3, B=1)=3;skill 11: max(A=1, B=3)=3;共 6 * 25。
        assert_eq!(count(&engine, CounterNamespace::Normal, 1), 150);
    }

    #[test]
    fn death_between_hits_does_not_split_packet_once_maximum() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 1,
                    sources: vec![CounterSource::DamageBySkillKeyOnce {
                        skill_keys: vec![10],
                        increment: 25,
                        required_type_flags: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine.begin_batch(BatchId(2));

        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(hit(10, TARGET_A))),
                &mut scheduler,
            )
            .expect("first accepted hit");
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::DeathOccurred {
                        victim: TARGET_A,
                        killer: Some(LOCAL),
                        skill_key: Some(10),
                        buff_checkpoint: Default::default(),
                    },
                ),
                &mut scheduler,
            )
            .expect("informational death");
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(hit(10, TARGET_B))),
                &mut scheduler,
            )
            .expect("second accepted hit");

        assert_eq!(count(&engine, CounterNamespace::Normal, 1), 0);
        assert!(engine.end_batch());
        assert_eq!(count(&engine, CounterNamespace::Normal, 1), 25);
    }

    #[test]
    fn attribute_buff_and_position_between_hits_do_not_split_packet_once_maximum() {
        let separators = [
            DomainEvent::AttributeChanged {
                entity: TARGET_B,
                attr_id: 999,
                previous: None,
                current: AttributeValue::Int(1),
                is_baseline: false,
            },
            DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
            DomainEvent::PositionChanged {
                entity: TARGET_B,
                attr_id: 6,
                previous: None,
                current: Position {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                },
                is_baseline: false,
            },
        ];

        for separator in separators {
            let mut scheduler = DeadlineScheduler::new();
            let mut engine = CounterEngine::new();
            engine
                .apply_config(
                    CounterNamespace::Normal,
                    vec![CounterRule {
                        rule_id: 1,
                        sources: vec![CounterSource::DamageBySkillKeyOnce {
                            skill_keys: vec![10],
                            increment: 25,
                            required_type_flags: None,
                        }],
                        effect_slots: vec![slot(1)],
                    }],
                    &mut scheduler,
                )
                .expect("valid rules");
            engine
                .apply_event(&local_changed(1, 10), &mut scheduler)
                .expect("local change");
            engine.begin_batch(BatchId(2));

            for event in [
                DomainEvent::CombatHitAccepted(hit(10, TARGET_A)),
                separator,
                DomainEvent::CombatHitAccepted(hit(10, TARGET_B)),
            ] {
                engine
                    .apply_event(&envelope(2, 20, event), &mut scheduler)
                    .expect("same-packet event");
            }

            assert_eq!(count(&engine, CounterNamespace::Normal, 1), 0);
            assert!(engine.end_batch());
            assert_eq!(count(&engine, CounterNamespace::Normal, 1), 25);
        }
    }

    #[test]
    fn once_commits_after_a_following_reset_buff_in_the_same_batch() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut reset_slot = slot(1);
        reset_slot.reset_buff_id = 77;
        reset_slot.on_buff_add = CounterAction::Reset;
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 10,
                    sources: vec![CounterSource::DamageBySkillKeyOnce {
                        skill_keys: vec![10],
                        increment: 25,
                        required_type_flags: None,
                    }],
                    effect_slots: vec![reset_slot],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine.begin_batch(BatchId(2));
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(hit(10, TARGET_A))),
                &mut scheduler,
            )
            .expect("accepted hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 10), 0);

        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("reset buff");

        assert_eq!(count(&engine, CounterNamespace::Normal, 10), 0);
        assert!(engine.end_batch());
        assert_eq!(count(&engine, CounterNamespace::Normal, 10), 25);
    }

    #[test]
    fn snapshot_has_no_counter_effect() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut effect_slot = slot(1);
        effect_slot.reset_buff_id = 77;
        effect_slot.on_buff_add = CounterAction::Reset;
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 2,
                    sources: vec![
                        CounterSource::BuffAdded {
                            buff_id: 77,
                            source_config_id: None,
                            increment: 7,
                        },
                        CounterSource::BuffLayerSpent {
                            buff_id: 77,
                            units_required: 2,
                            increment: 11,
                        },
                        CounterSource::BuffDurationTick {
                            buff_id: 77,
                            tick_interval_ms: 100,
                            increment: 1,
                            attr_condition: None,
                        },
                    ],
                    effect_slots: vec![effect_slot],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 900), &mut scheduler)
            .expect("local change");

        // 旧版 parity:快照基线对计数器完全 no-op —— 不计数、不置 active、不起 tick。
        engine
            .apply_event(
                &envelope(
                    2,
                    1_000,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Snapshot, 3, None)),
                ),
                &mut scheduler,
            )
            .expect("snapshot");
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.counters[0].slots[0].current_count, 0);
        assert!(!snapshot.counters[0].slots[0].reset_buff_active);
        assert_eq!(scheduler.next_deadline(), None);

        // 真正的 Add:置 active、按事件时刻起 tick(立即 tick),Add 计数后被 reset 动作清零。
        engine
            .apply_event(
                &envelope(
                    4,
                    1_100,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 3, None)),
                ),
                &mut scheduler,
            )
            .expect("add");
        let snapshot = engine.snapshot();
        assert!(snapshot.counters[0].slots[0].reset_buff_active);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_100)));
        let due = scheduler.drain_due(MonoTimeMs(1_100));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(1_100), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 2), 1);

        // Change 层数 3→1:BuffLayerSpent 累计 2 层,触发一次 +11。
        engine
            .apply_event(
                &envelope(
                    5,
                    1_150,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Change, 1, Some(3))),
                ),
                &mut scheduler,
            )
            .expect("layer change");
        assert_eq!(count(&engine, CounterNamespace::Normal, 2), 12);
    }

    #[test]
    fn unrelated_entity_buff_does_not_change_local_alt_freeze_condition() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut effect_slot = slot(1);
        effect_slot.freeze_duration_ms = Some(100);
        effect_slot.alt_freeze = Some(AltFreezeConfig {
            condition_buff_id: 77,
            freeze_duration_ms: 200,
        });
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 20,
                    sources: Vec::new(),
                    effect_slots: vec![effect_slot],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let mut unrelated = local_buff(BuffWireKind::Add, 1, None);
        unrelated.state.target = TARGET_A;
        unrelated.target_roles = EntityRoles {
            is_local_player: false,
            is_team_member: false,
            is_current_target: true,
        };
        assert!(
            !engine
                .apply_event(
                    &envelope(2, 20, DomainEvent::BuffChanged(unrelated)),
                    &mut scheduler,
                )
                .expect("unrelated buff")
        );
        assert_eq!(
            engine.snapshot().counters[0].slots[0].effective_freeze_duration_ms,
            Some(100)
        );

        engine
            .apply_event(
                &envelope(
                    3,
                    30,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("local condition buff");
        assert_eq!(
            engine.snapshot().counters[0].slots[0].effective_freeze_duration_ms,
            Some(200)
        );
    }

    #[test]
    fn buff_add_starts_tick_at_event_time_and_expires_by_duration() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 21,
                    sources: vec![CounterSource::BuffDurationTick {
                        buff_id: 77,
                        tick_interval_ms: 100,
                        increment: 1,
                        attr_condition: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 700), &mut scheduler)
            .expect("local change");

        // 旧版 parity:起算点 = Add 事件到达时刻(1000),过期 = 起算 + duration(250),
        // 服务端携带的 started/expires(800/1050)一律忽略。
        let mut buff = local_buff(BuffWireKind::Add, 1, None);
        buff.state.duration_ms = Some(250);
        buff.state.started_mono_ms = Some(MonoTimeMs(800));
        buff.state.expires_mono_ms = Some(MonoTimeMs(1_050));
        engine
            .apply_event(
                &envelope(2, 1_000, DomainEvent::BuffChanged(buff)),
                &mut scheduler,
            )
            .expect("buff applied");

        // 排他过期界:tick 落在 1000/1100/1200,1250 到期;合并补计共 3 次。
        let due = scheduler.drain_due(MonoTimeMs(1_249));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(1_249), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 21), 3);
        assert_eq!(scheduler.next_deadline(), None);
    }

    #[test]
    fn entity_disappearance_silently_clears_buff_runtime_while_paused() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut effect_slot = slot(1);
        effect_slot.reset_buff_id = 77;
        effect_slot.on_buff_remove = CounterAction::Reset;
        effect_slot.freeze_duration_ms = Some(100);
        effect_slot.alt_freeze = Some(AltFreezeConfig {
            condition_buff_id: 77,
            freeze_duration_ms: 200,
        });
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 52,
                    sources: vec![
                        CounterSource::AnyDamage {
                            increment: 5,
                            hits_required: None,
                            required_type_flags: None,
                        },
                        CounterSource::BuffDurationTick {
                            buff_id: 77,
                            tick_interval_ms: 100,
                            increment: 1,
                            attr_condition: None,
                        },
                        CounterSource::MovementDistance {
                            buff_id: 77,
                            attr_id: 6,
                            meters_required: 10.0,
                            increment: 1,
                        },
                    ],
                    effect_slots: vec![effect_slot],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(hit(1, TARGET_A))),
                &mut scheduler,
            )
            .expect("damage");
        engine
            .apply_event(
                &envelope(
                    3,
                    30,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("buff add");
        assert_eq!(count(&engine, CounterNamespace::Normal, 52), 5);
        assert!(engine.snapshot().counters[0].slots[0].reset_buff_active);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(30)));

        engine
            .apply_event(
                &envelope(4, 40, DomainEvent::PauseChanged { is_paused: true }),
                &mut scheduler,
            )
            .expect("pause");
        engine
            .apply_event(
                &envelope(5, 50, DomainEvent::EntityDisappeared { entity: LOCAL }),
                &mut scheduler,
            )
            .expect("entity disappearance");

        let snapshot = engine.snapshot();
        assert_eq!(snapshot.counters[0].slots[0].current_count, 5);
        assert!(!snapshot.counters[0].slots[0].reset_buff_active);
        assert_eq!(
            snapshot.counters[0].slots[0].effective_freeze_duration_ms,
            Some(100)
        );
        assert!(scheduler.is_empty());
        let sources = &engine.namespaces[CounterNamespace::Normal.index()].rules[0].sources;
        assert!(matches!(
            sources[1],
            SourceRuntime::BuffTick { active: None, .. }
        ));
        assert!(matches!(
            sources[2],
            SourceRuntime::Movement {
                active_target: None,
                ..
            }
        ));
    }

    #[test]
    fn pause_keeps_buff_timer_running_realtime() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 22,
                    sources: vec![CounterSource::BuffDurationTick {
                        buff_id: 77,
                        tick_interval_ms: 100,
                        increment: 1,
                        attr_condition: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 900), &mut scheduler)
            .expect("local change");

        // duration 300:tick 落在 1000/1100/1200,1300 到期。
        let mut buff = local_buff(BuffWireKind::Add, 1, None);
        buff.state.duration_ms = Some(300);
        engine
            .apply_event(
                &envelope(2, 1_000, DomainEvent::BuffChanged(buff)),
                &mut scheduler,
            )
            .expect("buff applied");
        let due = scheduler.drain_due(MonoTimeMs(1_000));
        assert!(engine.on_due(due[0], MonoTimeMs(1_000), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 22), 1);

        // 旧版 parity:暂停不取消、不平移计时器,buff 寿命按真实时间流逝。
        engine
            .apply_event(
                &envelope(3, 1_050, DomainEvent::PauseChanged { is_paused: true }),
                &mut scheduler,
            )
            .expect("pause");
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_100)));
        engine
            .apply_event(
                &envelope(4, 1_450, DomainEvent::PauseChanged { is_paused: false }),
                &mut scheduler,
            )
            .expect("resume");

        // 恢复后一次 drain 合并补计暂停期间错过的 tick(1100/1200),到期即止。
        let due = scheduler.drain_due(MonoTimeMs(1_450));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(1_450), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 22), 3);
        assert_eq!(scheduler.next_deadline(), None);
    }

    #[test]
    fn delayed_tick_is_merged_and_pause_does_not_shift_counter_time() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 3,
                    sources: vec![
                        CounterSource::BuffDurationTick {
                            buff_id: 77,
                            tick_interval_ms: 100,
                            increment: 1,
                            attr_condition: None,
                        },
                        CounterSource::AnyDamage {
                            increment: 10,
                            hits_required: None,
                            required_type_flags: None,
                        },
                    ],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 900), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(
                    2,
                    1_000,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("buff applied");

        // 延迟 drain:1000..1400 共 5 次 tick 合并补计。
        let due = scheduler.drain_due(MonoTimeMs(1_450));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(1_450), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 3), 5);

        // 暂停期间:伤害事件丢弃,计时器照走(下一个截止时间保持 1500,不平移)。
        engine
            .apply_event(
                &envelope(3, 1_450, DomainEvent::PauseChanged { is_paused: true }),
                &mut scheduler,
            )
            .expect("pause");
        engine.begin_batch(BatchId(4));
        engine
            .apply_event(
                &envelope(4, 1_500, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("paused hit");
        engine.end_batch();
        assert_eq!(count(&engine, CounterNamespace::Normal, 3), 5);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_500)));

        // 恢复后:1500..2400 共 10 次 tick 合并补计。
        engine
            .apply_event(
                &envelope(5, 2_450, DomainEvent::PauseChanged { is_paused: false }),
                &mut scheduler,
            )
            .expect("resume");
        let due = scheduler.drain_due(MonoTimeMs(2_450));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(2_450), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 3), 15);
    }

    #[test]
    fn duplicate_rule_or_slot_ids_are_rejected_without_replacing_config() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let duplicate_rules = vec![
            CounterRule {
                rule_id: 1,
                sources: Vec::new(),
                effect_slots: vec![slot(1)],
            },
            CounterRule {
                rule_id: 1,
                sources: Vec::new(),
                effect_slots: vec![slot(2)],
            },
        ];
        assert_eq!(
            engine.apply_config(CounterNamespace::Normal, duplicate_rules, &mut scheduler),
            Err(CounterConfigError::DuplicateRuleId {
                namespace: CounterNamespace::Normal,
                rule_id: 1,
            })
        );

        assert_eq!(
            engine.apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 2,
                    sources: Vec::new(),
                    effect_slots: vec![slot(1), slot(1)],
                }],
                &mut scheduler,
            ),
            Err(CounterConfigError::DuplicateSlotId {
                rule_id: 2,
                slot_id: 1,
            })
        );
        assert!(engine.snapshot().counters.is_empty());
    }

    #[test]
    fn decoded_active_factor_ids_build_rules_in_factor_namespace() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_factor_templates(
                vec![
                    FactorCounterTemplate {
                        item_ids: vec![100],
                        sources: vec![CounterSource::AnyDamage {
                            increment: 3,
                            hits_required: None,
                            required_type_flags: None,
                        }],
                        effect_slots: Vec::new(),
                    },
                    FactorCounterTemplate {
                        item_ids: vec![200],
                        sources: Vec::new(),
                        effect_slots: vec![slot(99)],
                    },
                ],
                &mut scheduler,
            )
            .expect("valid factor templates");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::SeasonCultivateChanged {
                        season_id: 3,
                        active_template_ids: Vec::new(),
                        active_item_ids: vec![200, 100, 100],
                        is_baseline: true,
                    },
                ),
                &mut scheduler,
            )
            .expect("decoded active ids");
        engine.begin_batch(BatchId(3));
        engine
            .apply_event(
                &envelope(3, 30, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("accepted hit");
        engine.end_batch();

        let snapshot = engine.snapshot();
        assert_eq!(snapshot.factor_source_item_ids, vec![100]);
        assert_eq!(snapshot.factor_slot_item_ids, vec![200]);
        assert_eq!(
            count(
                &engine,
                CounterNamespace::Factor,
                crate::live::counter::season_cultivate::factor_rule_id(200)
            ),
            3
        );
    }

    #[test]
    fn season_4_short_circuits_s3_factor_rule_compilation() {
        // S4+ moves the gameplay to basic-node buffs; `apply_season_state`
        // must feed an empty slice into `apply_factor_selection` so the
        // Factor namespace never compiles S3 factor-socket rules, even
        // though the packet still reports the old item ids.
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_factor_templates(
                vec![FactorCounterTemplate {
                    item_ids: vec![100],
                    sources: vec![CounterSource::AnyDamage {
                        increment: 3,
                        hits_required: None,
                        required_type_flags: None,
                    }],
                    effect_slots: Vec::new(),
                }],
                &mut scheduler,
            )
            .expect("valid factor templates");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::SeasonCultivateChanged {
                        season_id: 4,
                        active_template_ids: vec![2301],
                        active_item_ids: vec![100],
                        is_baseline: true,
                    },
                ),
                &mut scheduler,
            )
            .expect("s4 season change");
        engine.begin_batch(BatchId(3));
        engine
            .apply_event(
                &envelope(3, 30, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("accepted hit");
        engine.end_batch();

        let snapshot = engine.snapshot();
        assert_eq!(snapshot.season_id, 4);
        assert_eq!(snapshot.season_active_template_ids, vec![2301]);
        assert!(snapshot.factor_source_item_ids.is_empty());
        assert!(snapshot.factor_slot_item_ids.is_empty());
        assert!(snapshot.factor_counters.is_empty());
    }

    #[test]
    fn season_id_below_4_keeps_compiling_s3_factor_rules() {
        // The inverse guard: seasons below the S4 threshold must keep
        // building Factor namespace rules exactly as before (mirrors
        // `decoded_active_factor_ids_build_rules_in_factor_namespace`, just
        // with an explicit `season_id` on the event instead of the default).
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_factor_templates(
                vec![
                    FactorCounterTemplate {
                        item_ids: vec![100],
                        sources: vec![CounterSource::AnyDamage {
                            increment: 3,
                            hits_required: None,
                            required_type_flags: None,
                        }],
                        effect_slots: Vec::new(),
                    },
                    FactorCounterTemplate {
                        item_ids: vec![200],
                        sources: Vec::new(),
                        effect_slots: vec![slot(99)],
                    },
                ],
                &mut scheduler,
            )
            .expect("valid factor templates");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::SeasonCultivateChanged {
                        season_id: 3,
                        active_template_ids: Vec::new(),
                        active_item_ids: vec![200, 100],
                        is_baseline: true,
                    },
                ),
                &mut scheduler,
            )
            .expect("s3 season change");
        engine.begin_batch(BatchId(3));
        engine
            .apply_event(
                &envelope(3, 30, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("accepted hit");
        engine.end_batch();

        let snapshot = engine.snapshot();
        assert_eq!(snapshot.season_id, 3);
        assert_eq!(snapshot.factor_source_item_ids, vec![100]);
        assert_eq!(snapshot.factor_slot_item_ids, vec![200]);
        assert_eq!(
            count(
                &engine,
                CounterNamespace::Factor,
                crate::live::counter::season_cultivate::factor_rule_id(200)
            ),
            3
        );
    }

    #[test]
    fn damage_taken_counts_tome_channel_only() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 40,
                    sources: vec![CounterSource::DamageTaken {
                        skill_keys: None,
                        increment: 1,
                        hits_required: None,
                        required_type_flags: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        // ToMe 承伤计数;Near 同形 hit 不计;自己打自己(packet_owner 本地)不计。
        for event in [
            DomainEvent::CombatHitAccepted(incoming_hit(42, HitChannel::ToMe)),
            DomainEvent::CombatHitAccepted(incoming_hit(42, HitChannel::Near)),
            DomainEvent::CombatHitAccepted(hit(42, LOCAL)),
        ] {
            engine
                .apply_event(&envelope(2, 20, event), &mut scheduler)
                .expect("hit");
        }
        assert_eq!(count(&engine, CounterNamespace::Normal, 40), 1);
    }

    #[test]
    fn packet_owner_determines_attribution_for_summons_and_self_hits() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 41,
                    sources: vec![
                        CounterSource::AnyDamage {
                            increment: 1,
                            hits_required: None,
                            required_type_flags: None,
                        },
                        CounterSource::DamageTaken {
                            skill_keys: None,
                            increment: 10,
                            hits_required: None,
                            required_type_flags: None,
                        },
                    ],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        // 召唤物伤害:包级 top_summoner(packet_owner)= 本地 → 算本地 outgoing,
        // 与 registry 解析链 resolved_owner 无关。
        let mut summon_hit = hit(50, TARGET_B);
        summon_hit.source = Some(SUMMON);
        summon_hit.source_kind = None;
        summon_hit.source_is_player = false;
        summon_hit.source_is_local_player = false;
        summon_hit.resolved_owner = Some(TARGET_A);
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(summon_hit)),
                &mut scheduler,
            )
            .expect("summon hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 41), 1);

        // 自残:算 outgoing,不算承伤。
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(hit(50, LOCAL))),
                &mut scheduler,
            )
            .expect("self hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 41), 2);

        // 怪物承伤(ToMe):+10。
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::CombatHitAccepted(incoming_hit(50, HitChannel::ToMe)),
                ),
                &mut scheduler,
            )
            .expect("taken hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 41), 12);

        // resolved_owner 指向本地但包级 packet_owner 是别人 → 不算本地 outgoing,算承伤。
        let mut registry_owned = incoming_hit(50, HitChannel::ToMe);
        registry_owned.packet_owner = Some(TARGET_A);
        registry_owned.resolved_owner = Some(LOCAL);
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(registry_owned)),
                &mut scheduler,
            )
            .expect("registry-owned hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 41), 22);
    }

    #[test]
    fn buff_add_on_existing_triggers_added_source_and_reset_action_every_time() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut reset_slot = slot(1);
        reset_slot.reset_buff_id = 77;
        reset_slot.on_buff_add = CounterAction::Reset;
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![
                    CounterRule {
                        rule_id: 30,
                        sources: vec![CounterSource::BuffAdded {
                            buff_id: 77,
                            source_config_id: None,
                            increment: 7,
                        }],
                        effect_slots: vec![slot(1)],
                    },
                    CounterRule {
                        rule_id: 31,
                        sources: vec![CounterSource::BuffAdded {
                            buff_id: 88,
                            source_config_id: None,
                            increment: 5,
                        }],
                        effect_slots: vec![reset_slot],
                    },
                ],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let mut buff_88 = local_buff(BuffWireKind::Add, 1, None);
        buff_88.state.base_id = 88;

        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::BuffChanged(buff_88.clone())),
                &mut scheduler,
            )
            .expect("add 88");
        assert_eq!(count(&engine, CounterNamespace::Normal, 31), 5);

        engine
            .apply_event(
                &envelope(
                    3,
                    30,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("add 77");
        assert_eq!(count(&engine, CounterNamespace::Normal, 30), 7);
        assert_eq!(count(&engine, CounterNamespace::Normal, 31), 0);

        engine
            .apply_event(
                &envelope(4, 40, DomainEvent::BuffChanged(buff_88)),
                &mut scheduler,
            )
            .expect("add 88 again");
        assert_eq!(count(&engine, CounterNamespace::Normal, 31), 5);

        // 旧版 parity:同实例 Add-on-existing 仍按事件触发 —— BuffAdded 再计数,
        // on_buff_add 动作再次触发(非边沿触发),rule 31 被再次清零。
        engine
            .apply_event(
                &envelope(
                    5,
                    50,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("add 77 on existing");
        assert_eq!(count(&engine, CounterNamespace::Normal, 30), 14);
        assert_eq!(count(&engine, CounterNamespace::Normal, 31), 0);
    }

    #[test]
    fn buff_tick_restarts_on_different_instance_and_ignores_unmatched_remove() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 42,
                    sources: vec![CounterSource::BuffDurationTick {
                        buff_id: 77,
                        tick_interval_ms: 100,
                        increment: 1,
                        attr_condition: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let mut add = local_buff(BuffWireKind::Add, 1, None);
        add.state.duration_ms = Some(10_000);
        engine
            .apply_event(
                &envelope(2, 1_000, DomainEvent::BuffChanged(add)),
                &mut scheduler,
            )
            .expect("add");
        let due = scheduler.drain_due(MonoTimeMs(1_000));
        assert!(engine.on_due(due[0], MonoTimeMs(1_000), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 42), 1);

        // 不同实例 Change → 重启 tick(起算点 = Change 事件时刻,立即 tick)。
        let mut change = local_buff(BuffWireKind::Change, 1, None);
        change.state.instance_id = 901;
        change.duration_updated = true;
        change.state.duration_ms = Some(10_000);
        engine
            .apply_event(
                &envelope(3, 1_100, DomainEvent::BuffChanged(change)),
                &mut scheduler,
            )
            .expect("change different instance");
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_100)));
        let due = scheduler.drain_due(MonoTimeMs(1_100));
        assert!(engine.on_due(due[0], MonoTimeMs(1_100), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 42), 2);

        // Remove 非跟踪实例(900)→ 不影响 901 的 tick。
        let mut remove = local_buff(BuffWireKind::Remove, 0, None);
        remove.state.instance_id = 900;
        engine
            .apply_event(
                &envelope(4, 1_150, DomainEvent::BuffChanged(remove)),
                &mut scheduler,
            )
            .expect("remove untracked instance");
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_200)));
        let due = scheduler.drain_due(MonoTimeMs(1_250));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(1_250), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 42), 3);
    }

    #[test]
    fn buff_tick_same_instance_change_updates_expiry_only() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 43,
                    sources: vec![CounterSource::BuffDurationTick {
                        buff_id: 77,
                        tick_interval_ms: 100,
                        increment: 1,
                        attr_condition: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        // duration 200:原过期点 1200(排他)。
        let mut add = local_buff(BuffWireKind::Add, 1, None);
        add.state.duration_ms = Some(200);
        engine
            .apply_event(
                &envelope(2, 1_000, DomainEvent::BuffChanged(add)),
                &mut scheduler,
            )
            .expect("add");
        let due = scheduler.drain_due(MonoTimeMs(1_000));
        assert!(engine.on_due(due[0], MonoTimeMs(1_000), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 43), 1);

        // 同实例 Change 带 duration → 只更新过期点(1050 + 1000 = 2050),不重排起算点。
        let mut change = local_buff(BuffWireKind::Change, 1, None);
        change.duration_updated = true;
        change.state.duration_ms = Some(1_000);
        engine
            .apply_event(
                &envelope(3, 1_050, DomainEvent::BuffChanged(change)),
                &mut scheduler,
            )
            .expect("change with duration");

        // 同实例 Change 不带 duration → 完全不动。
        let plain_change = local_buff(BuffWireKind::Change, 1, None);
        engine
            .apply_event(
                &envelope(4, 1_060, DomainEvent::BuffChanged(plain_change)),
                &mut scheduler,
            )
            .expect("change without duration");
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_100)));

        // 原过期点 1200 已被延长:tick 1100/1200 照常补计。
        let due = scheduler.drain_due(MonoTimeMs(1_250));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(1_250), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 43), 3);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(1_300)));

        // Remove 跟踪实例 → 停 tick。
        let remove = local_buff(BuffWireKind::Remove, 0, None);
        engine
            .apply_event(
                &envelope(5, 1_300, DomainEvent::BuffChanged(remove)),
                &mut scheduler,
            )
            .expect("remove tracked instance");
        assert_eq!(scheduler.next_deadline(), None);
    }

    #[test]
    fn buff_layer_spent_counts_only_layer_decrease_on_change() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 44,
                    sources: vec![CounterSource::BuffLayerSpent {
                        buff_id: 77,
                        units_required: 2,
                        increment: 11,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        // Add 永远不计层数消耗。
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 3, None)),
                ),
                &mut scheduler,
            )
            .expect("add");
        assert_eq!(count(&engine, CounterNamespace::Normal, 44), 0);

        // Change 3→1:消耗 2 层,触发一次。
        engine
            .apply_event(
                &envelope(
                    3,
                    30,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Change, 1, Some(3))),
                ),
                &mut scheduler,
            )
            .expect("decrease");
        assert_eq!(count(&engine, CounterNamespace::Normal, 44), 11);

        // 层数上升/不变/无 previous 均不计。
        for (layer, previous) in [(2, Some(1)), (2, Some(2)), (1, None)] {
            engine
                .apply_event(
                    &envelope(
                        4,
                        40,
                        DomainEvent::BuffChanged(local_buff(BuffWireKind::Change, layer, previous)),
                    ),
                    &mut scheduler,
                )
                .expect("non-decrease change");
        }
        assert_eq!(count(&engine, CounterNamespace::Normal, 44), 11);
    }

    #[test]
    fn resource_first_value_baselines_then_spends_without_baseline_reset() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 45,
                    sources: vec![CounterSource::FightResourceSpent {
                        resource_id: 7,
                        units_required: 30,
                        increment: 2,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let resource = |previous: Option<i64>, current: i64, is_baseline: bool| {
            DomainEvent::FightResourceChanged {
                entity: LOCAL,
                resource_id: 7,
                previous,
                current,
                is_baseline,
            }
        };

        // 首值只建基线,不计。
        engine
            .apply_event(&envelope(2, 20, resource(None, 100, false)), &mut scheduler)
            .expect("first value");
        assert_eq!(count(&engine, CounterNamespace::Normal, 45), 0);

        // 100→55:消耗 45,触发 1 次,余 15。
        engine
            .apply_event(
                &envelope(3, 30, resource(Some(100), 55, false)),
                &mut scheduler,
            )
            .expect("spend 45");
        assert_eq!(count(&engine, CounterNamespace::Normal, 45), 2);

        // is_baseline 标记不重置累计:55→90 上升不计,余数保留。
        engine
            .apply_event(
                &envelope(4, 40, resource(Some(55), 90, true)),
                &mut scheduler,
            )
            .expect("baseline flag ignored");
        assert_eq!(count(&engine, CounterNamespace::Normal, 45), 2);

        // 90→75:消耗 15,与余数凑满 30 再触发一次。
        engine
            .apply_event(
                &envelope(5, 50, resource(Some(90), 75, false)),
                &mut scheduler,
            )
            .expect("spend 15");
        assert_eq!(count(&engine, CounterNamespace::Normal, 45), 4);
    }

    #[test]
    fn pause_drops_data_events_but_skill_and_dungeon_still_apply() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut freeze_slot = slot(1);
        freeze_slot.dungeon_start_freeze_ms = Some(5_000);
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 46,
                    sources: vec![
                        CounterSource::SkillCast {
                            skill_base_ids: vec![55],
                            increment: 3,
                        },
                        CounterSource::AnyDamage {
                            increment: 10,
                            hits_required: None,
                            required_type_flags: None,
                        },
                        CounterSource::FightResourceSpent {
                            resource_id: 7,
                            units_required: 1,
                            increment: 1,
                        },
                        CounterSource::BuffAdded {
                            buff_id: 77,
                            source_config_id: None,
                            increment: 7,
                        },
                    ],
                    effect_slots: vec![freeze_slot],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        engine
            .apply_event(
                &envelope(2, 100, DomainEvent::PauseChanged { is_paused: true }),
                &mut scheduler,
            )
            .expect("pause");

        // 暂停期间:伤害 / buff / 资源事件全部丢弃(资源连基线都不建)。
        engine
            .apply_event(
                &envelope(3, 110, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("paused hit dropped");
        engine
            .apply_event(
                &envelope(
                    3,
                    120,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("paused buff dropped");
        engine
            .apply_event(
                &envelope(
                    3,
                    130,
                    DomainEvent::FightResourceChanged {
                        entity: LOCAL,
                        resource_id: 7,
                        previous: None,
                        current: 100,
                        is_baseline: false,
                    },
                ),
                &mut scheduler,
            )
            .expect("paused resource dropped");
        assert_eq!(count(&engine, CounterNamespace::Normal, 46), 0);

        // 暂停期间:技能生命周期仍计数。
        engine
            .apply_event(
                &envelope(
                    3,
                    150,
                    DomainEvent::SkillLifecycleChanged {
                        caster: LOCAL,
                        skill_id: 55,
                        phase: SkillPhase::CastStarted,
                        target: None,
                    },
                ),
                &mut scheduler,
            )
            .expect("skill cast while paused");
        assert_eq!(count(&engine, CounterNamespace::Normal, 46), 3);

        // 暂停期间:进本 freeze 仍触发,冻结中的计数被抑制。
        engine
            .apply_event(
                &envelope(
                    3,
                    200,
                    DomainEvent::DungeonFlowChanged {
                        previous: Some(1),
                        current: 3,
                    },
                ),
                &mut scheduler,
            )
            .expect("dungeon start while paused");
        assert!(!engine.snapshot().counters[0].slots[0].is_counting);
        engine
            .apply_event(
                &envelope(
                    3,
                    250,
                    DomainEvent::SkillLifecycleChanged {
                        caster: LOCAL,
                        skill_id: 55,
                        phase: SkillPhase::CastStarted,
                        target: None,
                    },
                ),
                &mut scheduler,
            )
            .expect("skill cast while frozen");
        assert_eq!(count(&engine, CounterNamespace::Normal, 46), 3);

        // 恢复后:暂停期被丢的资源事件没建基线,99 只作首值不计。
        engine
            .apply_event(
                &envelope(4, 300, DomainEvent::PauseChanged { is_paused: false }),
                &mut scheduler,
            )
            .expect("resume");
        engine
            .apply_event(
                &envelope(
                    5,
                    310,
                    DomainEvent::FightResourceChanged {
                        entity: LOCAL,
                        resource_id: 7,
                        previous: Some(100),
                        current: 99,
                        is_baseline: false,
                    },
                ),
                &mut scheduler,
            )
            .expect("first resource value after resume");
        assert_eq!(count(&engine, CounterNamespace::Normal, 46), 3);

        // freeze 计时器真实时间到点:ResetAndStartCount 清零并恢复计数。
        let due = scheduler.drain_due(MonoTimeMs(5_200));
        assert_eq!(due.len(), 1);
        assert!(engine.on_due(due[0], MonoTimeMs(5_200), &mut scheduler));
        assert_eq!(count(&engine, CounterNamespace::Normal, 46), 0);
        assert!(engine.snapshot().counters[0].slots[0].is_counting);

        engine
            .apply_event(
                &envelope(6, 5_300, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("hit after freeze expiry");
        assert_eq!(count(&engine, CounterNamespace::Normal, 46), 10);
    }

    #[test]
    fn container_reset_resets_both_namespaces_even_while_paused() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 47,
                    sources: vec![CounterSource::AnyDamage {
                        increment: 10,
                        hits_required: None,
                        required_type_flags: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_factor_templates(
                vec![
                    FactorCounterTemplate {
                        item_ids: vec![100],
                        sources: vec![CounterSource::AnyDamage {
                            increment: 3,
                            hits_required: None,
                            required_type_flags: None,
                        }],
                        effect_slots: Vec::new(),
                    },
                    FactorCounterTemplate {
                        item_ids: vec![200],
                        sources: Vec::new(),
                        effect_slots: vec![slot(99)],
                    },
                ],
                &mut scheduler,
            )
            .expect("valid factor templates");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::SeasonCultivateChanged {
                        season_id: 3,
                        active_template_ids: Vec::new(),
                        active_item_ids: vec![200, 100],
                        is_baseline: true,
                    },
                ),
                &mut scheduler,
            )
            .expect("initial baseline");

        let factor_count = |engine: &CounterEngine| {
            count(
                engine,
                CounterNamespace::Factor,
                crate::live::counter::season_cultivate::factor_rule_id(200),
            )
        };

        engine
            .apply_event(
                &envelope(3, 30, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 47), 10);
        assert_eq!(factor_count(&engine), 3);

        // 暂停期间:脏数据(is_baseline=false)丢弃,因子选择不变。
        engine
            .apply_event(
                &envelope(4, 40, DomainEvent::PauseChanged { is_paused: true }),
                &mut scheduler,
            )
            .expect("pause");
        engine
            .apply_event(
                &envelope(
                    5,
                    50,
                    DomainEvent::SeasonCultivateChanged {
                        season_id: 3,
                        active_template_ids: Vec::new(),
                        active_item_ids: vec![100],
                        is_baseline: false,
                    },
                ),
                &mut scheduler,
            )
            .expect("dirty data dropped while paused");
        assert_eq!(engine.snapshot().factor_source_item_ids, vec![100]);
        assert_eq!(engine.snapshot().factor_slot_item_ids, vec![200]);
        assert_eq!(count(&engine, CounterNamespace::Normal, 47), 10);
        assert_eq!(factor_count(&engine), 3);

        // Container reset remains authoritative while paused.
        engine
            .apply_event(
                &envelope(6, 60, DomainEvent::ContainerReset),
                &mut scheduler,
            )
            .expect("container reset while paused");
        assert_eq!(count(&engine, CounterNamespace::Normal, 47), 0);
        assert_eq!(factor_count(&engine), 0);

        engine
            .apply_event(&local_changed(7, 70), &mut scheduler)
            .expect("container local player");

        engine
            .apply_event(
                &envelope(8, 80, DomainEvent::PauseChanged { is_paused: false }),
                &mut scheduler,
            )
            .expect("resume");
        engine
            .apply_event(
                &envelope(9, 90, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("hit after resume");
        assert_eq!(count(&engine, CounterNamespace::Normal, 47), 10);
        assert_eq!(factor_count(&engine), 3);
    }

    #[test]
    fn movement_samples_last_position_once_per_batch_and_jump_resets() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 48,
                    sources: vec![CounterSource::MovementDistance {
                        buff_id: 77,
                        attr_id: 6,
                        meters_required: 10.0,
                        increment: 3,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let position = |x: f32| DomainEvent::PositionChanged {
            entity: LOCAL,
            attr_id: 6,
            previous: None,
            current: Position { x, y: 0.0, z: 0.0 },
            is_baseline: false,
        };

        // Add 激活移动采样。
        engine.begin_batch(BatchId(2));
        engine
            .apply_event(
                &envelope(
                    2,
                    20,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("add movement buff");
        engine.end_batch();

        // 首个位置只建基线。
        engine.begin_batch(BatchId(3));
        engine
            .apply_event(&envelope(3, 30, position(0.0)), &mut scheduler)
            .expect("baseline position");
        engine.end_batch();
        assert_eq!(count(&engine, CounterNamespace::Normal, 48), 0);

        // 同 batch 多次变化只按最后值采样一次:0 → 8 → 0,净位移 0。
        engine.begin_batch(BatchId(4));
        for x in [8.0_f32, 0.0] {
            engine
                .apply_event(&envelope(4, 40, position(x)), &mut scheduler)
                .expect("position");
        }
        engine.end_batch();
        assert_eq!(count(&engine, CounterNamespace::Normal, 48), 0);

        // 0 → 11:累计 11m,触发一次,余 1m。
        engine.begin_batch(BatchId(5));
        engine
            .apply_event(&envelope(5, 50, position(11.0)), &mut scheduler)
            .expect("position");
        engine.end_batch();
        assert_eq!(count(&engine, CounterNamespace::Normal, 48), 3);

        // 11 → 200:单次跳变 >50m,清零累计(自身不计)。
        engine.begin_batch(BatchId(6));
        engine
            .apply_event(&envelope(6, 60, position(200.0)), &mut scheduler)
            .expect("teleport");
        engine.end_batch();
        assert_eq!(count(&engine, CounterNamespace::Normal, 48), 3);

        // 200 → 201:1m,不足 10m 不触发。
        engine.begin_batch(BatchId(7));
        engine
            .apply_event(&envelope(7, 70, position(201.0)), &mut scheduler)
            .expect("short move");
        engine.end_batch();
        assert_eq!(count(&engine, CounterNamespace::Normal, 48), 3);
    }

    #[test]
    fn local_player_change_keeps_counts() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 49,
                    sources: vec![CounterSource::AnyDamage {
                        increment: 10,
                        hits_required: None,
                        required_type_flags: None,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::CombatHitAccepted(hit(999, TARGET_A))),
                &mut scheduler,
            )
            .expect("hit");
        assert_eq!(count(&engine, CounterNamespace::Normal, 49), 10);

        // 旧版 parity:本地角色切换只清 attrs,不清计数。
        engine
            .apply_event(
                &envelope(
                    3,
                    30,
                    DomainEvent::LocalPlayerChanged {
                        previous: Some(LOCAL),
                        current: Some(TARGET_A),
                    },
                ),
                &mut scheduler,
            )
            .expect("local player change");
        assert_eq!(count(&engine, CounterNamespace::Normal, 49), 10);

        // 旧本地角色的伤害不再计数。
        engine
            .apply_event(
                &envelope(4, 40, DomainEvent::CombatHitAccepted(hit(999, TARGET_B))),
                &mut scheduler,
            )
            .expect("hit from previous local");
        assert_eq!(count(&engine, CounterNamespace::Normal, 49), 10);
    }

    #[test]
    fn buff_added_filters_by_source_config_id() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 50,
                    sources: vec![CounterSource::BuffAdded {
                        buff_id: 77,
                        source_config_id: Some(8),
                        increment: 1,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let mut mismatch = local_buff(BuffWireKind::Add, 1, None);
        mismatch.state.source_config_id = Some(9);
        engine
            .apply_event(
                &envelope(2, 20, DomainEvent::BuffChanged(mismatch)),
                &mut scheduler,
            )
            .expect("mismatched buff");
        assert_eq!(count(&engine, CounterNamespace::Normal, 50), 0);

        engine
            .apply_event(
                &envelope(
                    3,
                    30,
                    DomainEvent::BuffChanged(local_buff(BuffWireKind::Add, 1, None)),
                ),
                &mut scheduler,
            )
            .expect("matching buff");
        assert_eq!(count(&engine, CounterNamespace::Normal, 50), 1);
    }

    #[test]
    fn passive_skill_start_resets_slots_only_for_local_starts() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        let mut reset_slot = slot(1);
        reset_slot.reset_passive_skill_ids = Some(vec![1434]);
        reset_slot.on_passive_skill = CounterAction::Reset;
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 53,
                    sources: vec![CounterSource::SkillCastComplete {
                        skill_base_ids: vec![1434],
                        increment: 1,
                    }],
                    effect_slots: vec![reset_slot],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        let cast_complete = || DomainEvent::SkillLifecycleChanged {
            caster: LOCAL,
            skill_id: 1434,
            phase: SkillPhase::Completed,
            target: None,
        };
        let passive = |entity, passive_instance_id, ended| DomainEvent::PassiveSkillObserved {
            entity,
            passive_instance_id,
            skill_id: 1434,
            target_position: None,
            ended,
        };

        for batch in 2..=3 {
            engine
                .apply_event(
                    &envelope(batch, batch * 10, cast_complete()),
                    &mut scheduler,
                )
                .expect("cast complete");
        }
        assert_eq!(count(&engine, CounterNamespace::Normal, 53), 2);

        // 结束事件不触发重置。
        engine
            .apply_event(&envelope(4, 40, passive(LOCAL, 100, true)), &mut scheduler)
            .expect("passive end");
        assert_eq!(count(&engine, CounterNamespace::Normal, 53), 2);

        // 队友的被动开始不触发重置。
        engine
            .apply_event(
                &envelope(5, 50, passive(TARGET_A, 200, false)),
                &mut scheduler,
            )
            .expect("remote passive start");
        assert_eq!(count(&engine, CounterNamespace::Normal, 53), 2);

        // 本地被动开始(额外神影螺旋触发)重置计数。
        engine
            .apply_event(&envelope(6, 60, passive(LOCAL, 100, false)), &mut scheduler)
            .expect("local passive start");
        assert_eq!(count(&engine, CounterNamespace::Normal, 53), 0);

        // 暂停期间丢弃被动事件,不触发重置。
        engine
            .apply_event(&envelope(7, 70, cast_complete()), &mut scheduler)
            .expect("cast complete");
        engine
            .apply_event(
                &envelope(8, 80, DomainEvent::PauseChanged { is_paused: true }),
                &mut scheduler,
            )
            .expect("pause");
        engine
            .apply_event(&envelope(9, 90, passive(LOCAL, 300, false)), &mut scheduler)
            .expect("paused passive start");
        assert_eq!(count(&engine, CounterNamespace::Normal, 53), 1);
    }

    fn infusion_4pc_engine(scheduler: &mut DeadlineScheduler) -> CounterEngine {
        let mut engine = CounterEngine::new();
        let mut wrap_slot = slot(1);
        wrap_slot.threshold = Some(2);
        wrap_slot.wrap_at_threshold = true;
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 54,
                    sources: vec![CounterSource::SkillCast {
                        skill_base_ids: vec![1243],
                        increment: 1,
                    }],
                    effect_slots: vec![wrap_slot],
                }],
                scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), scheduler)
            .expect("local change");
        engine
    }

    fn infusion_cast() -> DomainEvent {
        DomainEvent::SkillLifecycleChanged {
            caster: LOCAL,
            skill_id: 1243,
            phase: SkillPhase::CastStarted,
            target: None,
        }
    }

    #[test]
    fn wrap_at_threshold_restarts_cycle_on_empowered_cast() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = infusion_4pc_engine(&mut scheduler);

        // 灌注 1 → 1(显示 1);灌注 2 → 2(显示 0,强化就绪);
        // 灌注 3 是强化灌注,释放即归零(显示回 2),与是否命中无关。
        for (batch, expected) in [(2, 1), (3, 2), (4, 0)] {
            engine
                .apply_event(
                    &envelope(batch, batch * 10, infusion_cast()),
                    &mut scheduler,
                )
                .expect("infusion cast");
            assert_eq!(count(&engine, CounterNamespace::Normal, 54), expected);
        }
    }

    #[test]
    fn wrap_at_threshold_cycle_repeats() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = infusion_4pc_engine(&mut scheduler);

        // 环绕消耗触发它的 increment:循环为 1 → 2 → 0 → 1 → 2 → 0。
        for (batch, expected) in [(2, 1), (3, 2), (4, 0), (5, 1), (6, 2), (7, 0)] {
            engine
                .apply_event(
                    &envelope(batch, batch * 10, infusion_cast()),
                    &mut scheduler,
                )
                .expect("infusion cast");
            assert_eq!(count(&engine, CounterNamespace::Normal, 54), expected);
        }
    }

    #[test]
    fn wrap_at_threshold_disabled_accumulates_past_threshold() {
        let mut scheduler = DeadlineScheduler::new();
        let mut engine = CounterEngine::new();
        engine
            .apply_config(
                CounterNamespace::Normal,
                vec![CounterRule {
                    rule_id: 55,
                    sources: vec![CounterSource::SkillCast {
                        skill_base_ids: vec![1243],
                        increment: 1,
                    }],
                    effect_slots: vec![slot(1)],
                }],
                &mut scheduler,
            )
            .expect("valid rules");
        engine
            .apply_event(&local_changed(1, 10), &mut scheduler)
            .expect("local change");

        // 默认行为不变:计数越过阈值继续累加。
        for batch in 2..=4 {
            engine
                .apply_event(
                    &envelope(batch, batch * 10, infusion_cast()),
                    &mut scheduler,
                )
                .expect("infusion cast");
        }
        assert_eq!(count(&engine, CounterNamespace::Normal, 55), 3);
    }
}

fn index_skill_ids(
    index: &mut HashMap<(i32, PhaseKey), Vec<SourceHandle>>,
    skill_ids: &[i32],
    phase: PhaseKey,
    handle: SourceHandle,
) {
    let mut seen = HashSet::with_capacity(skill_ids.len());
    for skill_id in skill_ids {
        if seen.insert(*skill_id) {
            index.entry((*skill_id, phase)).or_default().push(handle);
        }
    }
}

impl SourceRuntime {
    fn compile(source: CounterSource) -> Self {
        match source {
            CounterSource::DamageBySkillKey {
                increment,
                hits_required,
                required_type_flags,
                ..
            } => Self::Damage {
                kind: DamageSourceKind::Outgoing,
                increment,
                hits_required,
                required_type_flags,
                hit_accumulator: 0,
            },
            CounterSource::DamageBySkillKeySelfTarget {
                increment,
                hits_required,
                required_type_flags,
                ..
            } => Self::Damage {
                kind: DamageSourceKind::OutgoingSelfTarget,
                increment,
                hits_required,
                required_type_flags,
                hit_accumulator: 0,
            },
            CounterSource::AnyDamage {
                increment,
                hits_required,
                required_type_flags,
            } => Self::Damage {
                kind: DamageSourceKind::Outgoing,
                increment,
                hits_required,
                required_type_flags,
                hit_accumulator: 0,
            },
            CounterSource::DamageTaken {
                increment,
                hits_required,
                required_type_flags,
                ..
            } => Self::Damage {
                kind: DamageSourceKind::Incoming,
                increment,
                hits_required,
                required_type_flags,
                hit_accumulator: 0,
            },
            CounterSource::DamageBySkillKeyOnce {
                increment,
                required_type_flags,
                ..
            } => Self::DamageOnce {
                increment,
                required_type_flags,
                batch_counts: HashMap::new(),
                batch_maxima: HashMap::new(),
                touched: false,
            },
            CounterSource::FightResourceSpent {
                units_required,
                increment,
                ..
            } => Self::FightResourceSpent {
                units_required: units_required.max(1),
                increment,
                previous_value: None,
                accumulated_spent: 0,
            },
            CounterSource::BuffAdded {
                source_config_id,
                increment,
                ..
            } => Self::BuffAdded {
                source_config_id,
                increment,
            },
            CounterSource::BuffLayerSpent {
                units_required,
                increment,
                ..
            } => Self::BuffLayerSpent {
                units_required: units_required.max(1),
                increment,
                accumulated_spent: 0,
            },
            CounterSource::BuffDurationTick {
                tick_interval_ms,
                increment,
                attr_condition,
                ..
            } => Self::BuffTick {
                interval_ms: tick_interval_ms.max(1),
                increment,
                attr_condition,
                active: None,
            },
            CounterSource::SkillCast { increment, .. } => Self::SkillCast { increment },
            CounterSource::SkillDurationTick {
                tick_interval_ms,
                increment,
                ..
            } => Self::SkillTick {
                interval_ms: tick_interval_ms.max(1),
                increment,
                next_cast_sequence: 1,
                active: None,
            },
            CounterSource::SkillCastComplete { increment, .. } => Self::SkillComplete { increment },
            CounterSource::MovementDistance {
                meters_required,
                increment,
                ..
            } => Self::Movement {
                meters_required: normalize_meters_required(meters_required),
                increment,
                active_target: None,
                last_position: None,
                accumulated_meters: 0.0,
                staged_position: None,
            },
        }
    }
}

impl SlotRuntime {
    fn new(config: EffectSlotConfig) -> Self {
        Self {
            config,
            current_count: 0,
            is_counting: true,
            reset_buff_target: None,
            condition_buff_target: None,
            freeze: None,
        }
    }
}
