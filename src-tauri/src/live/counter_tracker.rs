use crate::database::now_ms;
use crate::live::buff_monitor::{BuffChangeEvent, BuffChangeType};
use crate::live::commands_models::{CounterUpdateState, SlotUpdateState};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::opcodes_models::{AttrType, AttrValue};
use crate::live::opcodes_process::LocalDamageEvent;
use blueprotobuf_lib::blueprotobuf::EActorState;
use log::info;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, specta::Type)]
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
    },
    DamageBySkillKeyOnce {
        #[serde(rename = "skillKeys")]
        skill_keys: Vec<i64>,
        increment: u32,
    },
    DamageBySkillKeySelfTarget {
        #[serde(rename = "skillKeys")]
        skill_keys: Vec<i64>,
        increment: u32,
        #[serde(default, rename = "hitsRequired")]
        hits_required: Option<u32>,
    },
    AnyDamage {
        increment: u32,
        #[serde(default, rename = "hitsRequired")]
        hits_required: Option<u32>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TickAttrCondition {
    pub attr_id: i32,
    pub required_value: i32,
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
    pub on_buff_add: CounterAction,
    #[serde(default)]
    pub on_buff_change: CounterAction,
    #[serde(default)]
    pub on_buff_remove: CounterAction,
    #[serde(default)]
    pub freeze_duration_ms: Option<u64>,
    #[serde(default = "default_on_freeze_expire")]
    pub on_freeze_expire: CounterAction,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, Default)]
#[serde(rename_all = "camelCase")]
pub enum CounterAction {
    Reset,
    Freeze,
    ResetAndFreeze,
    ResetAndStartCount,
    StartCount,
    #[default]
    NoOp,
}

#[derive(Debug, Clone)]
pub(crate) struct CounterModelState {
    pub rule_id: i32,
    pub slot_states: Vec<SlotState>,
    pub tick_states: Vec<BuffTickState>,
    pub skill_tick_states: Vec<SkillCastTickState>,
    pub damage_hit_accumulators: Vec<u32>,
}

#[derive(Debug, Clone)]
pub(crate) struct SlotState {
    pub slot_id: i32,
    pub current_count: u32,
    pub threshold: Option<u32>,
    pub is_counting: bool,
    pub reset_buff_active: bool,
    pub freeze_until_ms: Option<i64>,
    pub freeze_duration_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub(crate) struct BuffTickState {
    pub buff_id: i32,
    pub active_buff_uuid: i32,
    pub is_active: bool,
    pub start_time_ms: i64,
    pub buff_duration_ms: i64,
    pub applied_ticks: u64,
    pub tick_interval_ms: u64,
    pub increment: u32,
    pub attr_condition: Option<TickAttrCondition>,
    pub attr_type: Option<AttrType>,
}

#[derive(Debug, Clone)]
pub(crate) struct SkillCastTickState {
    pub skill_base_id: i32,
    pub is_active: bool,
    pub start_time_ms: i64,
    pub applied_ticks: u64,
    pub tick_interval_ms: u64,
    pub increment: u32,
}

#[derive(Debug, Default)]
pub struct BuffCounterTracker {
    rules: Vec<CounterRule>,
    states: HashMap<i32, CounterModelState>,
}

impl<'de> Deserialize<'de> for CounterRule {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        match CounterRuleRepr::deserialize(deserializer)? {
            CounterRuleRepr::Current(rule) => Ok(CounterRule {
                rule_id: rule.rule_id,
                sources: rule.sources,
                effect_slots: rule.effect_slots,
            }),
            CounterRuleRepr::Legacy(rule) => Ok(CounterRule {
                rule_id: rule.rule_id,
                sources: vec![rule.trigger.into_source()],
                effect_slots: vec![EffectSlotConfig {
                    slot_id: 1,
                    threshold: rule.threshold,
                    reset_buff_id: rule.linked_buff_id,
                    reset_source_config_id: None,
                    on_buff_add: rule.on_buff_add,
                    on_buff_change: CounterAction::NoOp,
                    on_buff_remove: rule.on_buff_remove,
                    freeze_duration_ms: None,
                    on_freeze_expire: default_on_freeze_expire(),
                }],
            }),
        }
    }
}

impl BuffCounterTracker {
    pub fn set_rules(&mut self, rules: Vec<CounterRule>) {
        info!(
            target: "app::live",
            "[buff-counter] applying {} rules",
            rules.len()
        );
        for rule in &rules {
            info!(
                target: "app::live",
                "[buff-counter] rule_id={} sources={:?} effect_slots={:?}",
                rule.rule_id,
                rule.sources,
                rule.effect_slots
            );
        }

        let mut states = HashMap::with_capacity(rules.len());
        for rule in &rules {
            let slot_states = rule
                .effect_slots
                .iter()
                .map(|slot| SlotState {
                    slot_id: slot.slot_id,
                    current_count: 0,
                    threshold: slot.threshold,
                    is_counting: true,
                    reset_buff_active: false,
                    freeze_until_ms: None,
                    freeze_duration_ms: slot.freeze_duration_ms,
                })
                .collect();
            let tick_states = rule
                .sources
                .iter()
                .filter_map(|source| match source {
                    CounterSource::BuffDurationTick {
                        buff_id,
                        tick_interval_ms,
                        increment,
                        attr_condition,
                    } => Some(BuffTickState {
                        buff_id: *buff_id,
                        active_buff_uuid: 0,
                        is_active: false,
                        start_time_ms: 0,
                        buff_duration_ms: 0,
                        applied_ticks: 0,
                        tick_interval_ms: (*tick_interval_ms).max(1),
                        increment: *increment,
                        attr_condition: attr_condition.clone(),
                        attr_type: attr_condition
                            .as_ref()
                            .and_then(|condition| AttrType::from_id(condition.attr_id)),
                    }),
                    _ => None,
                })
                .collect();
            let skill_tick_states = rule
                .sources
                .iter()
                .filter_map(|source| match source {
                    CounterSource::SkillDurationTick {
                        skill_base_id,
                        tick_interval_ms,
                        increment,
                    } => Some(SkillCastTickState {
                        skill_base_id: *skill_base_id,
                        is_active: false,
                        start_time_ms: 0,
                        applied_ticks: 0,
                        tick_interval_ms: (*tick_interval_ms).max(1),
                        increment: *increment,
                    }),
                    _ => None,
                })
                .collect();
            states.insert(
                rule.rule_id,
                CounterModelState {
                    rule_id: rule.rule_id,
                    slot_states,
                    tick_states,
                    skill_tick_states,
                    damage_hit_accumulators: vec![0; rule.sources.len()],
                },
            );
        }

        self.rules = rules;
        self.states = states;
    }

    pub fn on_damage_events(&mut self, events: &[LocalDamageEvent], local_player_uid: i64) -> bool {
        if events.is_empty() {
            return false;
        }

        let mut changed = false;
        let (rules, states) = (&self.rules, &mut self.states);
        for rule in rules {
            let Some(state) = states.get_mut(&rule.rule_id) else {
                continue;
            };
            for (source_idx, source) in rule.sources.iter().enumerate() {
                let increment = match source {
                    CounterSource::DamageBySkillKey {
                        skill_keys,
                        increment,
                        hits_required,
                    } => apply_damage_hits_required(
                        &mut state.damage_hit_accumulators[source_idx],
                        *increment,
                        *hits_required,
                        events
                            .iter()
                            .filter(|event| skill_keys.contains(&event.skill_key))
                            .count(),
                    ),
                    CounterSource::DamageBySkillKeyOnce {
                        skill_keys,
                        increment,
                    } => {
                        let distinct_count = skill_keys
                            .iter()
                            .filter(|sk| events.iter().any(|e| e.skill_key == **sk))
                            .count();
                        scaled_increment(*increment, distinct_count)
                    }
                    CounterSource::DamageBySkillKeySelfTarget {
                        skill_keys,
                        increment,
                        hits_required,
                    } => apply_damage_hits_required(
                        &mut state.damage_hit_accumulators[source_idx],
                        *increment,
                        *hits_required,
                        events
                            .iter()
                            .filter(|event| {
                                skill_keys.contains(&event.skill_key)
                                    && event.target_uid == local_player_uid
                            })
                            .count(),
                    ),
                    CounterSource::AnyDamage {
                        increment,
                        hits_required,
                    } => apply_damage_hits_required(
                        &mut state.damage_hit_accumulators[source_idx],
                        *increment,
                        *hits_required,
                        events.len(),
                    ),
                    _ => continue,
                };
                let Some(increment) = increment else {
                    continue;
                };
                changed |= add_increment_to_slots(state, increment);
            }
        }
        changed
    }

    pub fn on_skill_cast(&mut self, skill_base_id: i32) -> bool {
        let mut changed = false;
        let (rules, states) = (&self.rules, &mut self.states);
        for rule in rules {
            let Some(state) = states.get_mut(&rule.rule_id) else {
                continue;
            };
            for source in &rule.sources {
                let CounterSource::SkillCast {
                    skill_base_ids,
                    increment,
                } = source
                else {
                    continue;
                };
                if skill_base_ids.contains(&skill_base_id) {
                    changed |= add_increment_to_slots(state, *increment);
                }
            }
            for tick_state in &mut state.skill_tick_states {
                if tick_state.skill_base_id != skill_base_id {
                    continue;
                }
                changed |= activate_skill_tick_state(tick_state);
            }
        }
        changed
    }

    pub fn on_buff_changes(&mut self, changes: &[BuffChangeEvent]) -> bool {
        let mut changed = false;
        let (rules, states) = (&self.rules, &mut self.states);
        for change in changes {
            for rule in rules {
                let Some(state) = states.get_mut(&rule.rule_id) else {
                    continue;
                };
                for tick_state in &mut state.tick_states {
                    if tick_state.buff_id != change.base_id {
                        continue;
                    }
                    changed |= apply_tick_change(tick_state, change);
                }
                for (slot_config, slot_state) in
                    rule.effect_slots.iter().zip(&mut state.slot_states)
                {
                    if slot_config.reset_buff_id != change.base_id {
                        continue;
                    }
                    if let Some(required_source_config_id) = slot_config.reset_source_config_id {
                        if change.source_config_id != Some(required_source_config_id) {
                            continue;
                        }
                    }
                    let action = match change.change_type {
                        BuffChangeType::Added => slot_config.on_buff_add,
                        BuffChangeType::Changed => slot_config.on_buff_change,
                        BuffChangeType::Removed => slot_config.on_buff_remove,
                    };
                    match change.change_type {
                        BuffChangeType::Added => {
                            if !slot_state.reset_buff_active {
                                slot_state.reset_buff_active = true;
                                changed = true;
                            }
                        }
                        BuffChangeType::Changed => {}
                        BuffChangeType::Removed => {
                            if slot_state.reset_buff_active {
                                slot_state.reset_buff_active = false;
                                changed = true;
                            }
                        }
                    }
                    changed |= apply_action(slot_state, action);
                    changed |= start_fixed_freeze_timer(slot_state, action, change.create_time_ms);
                }
            }
        }
        changed
    }

    pub fn tick_counters(
        &mut self,
        now_ms: i64,
        attr_store: &EntityAttrStore,
        local_player_uid: i64,
    ) -> bool {
        let mut changed = false;
        let (rules, states) = (&self.rules, &mut self.states);
        for rule in rules {
            let Some(state) = states.get_mut(&rule.rule_id) else {
                continue;
            };
            for (slot_config, slot_state) in rule.effect_slots.iter().zip(&mut state.slot_states) {
                let Some(freeze_until_ms) = slot_state.freeze_until_ms else {
                    continue;
                };
                if now_ms < freeze_until_ms {
                    continue;
                }
                slot_state.freeze_until_ms = None;
                changed |= apply_action(slot_state, slot_config.on_freeze_expire);
            }

            let mut pending_increment = 0u32;
            for tick_state in &mut state.tick_states {
                if !tick_state.is_active {
                    continue;
                }

                if now_ms < tick_state.start_time_ms {
                    continue;
                }

                let elapsed_ms = if tick_state.buff_duration_ms <= 0 {
                    now_ms.saturating_sub(tick_state.start_time_ms) as u64
                } else {
                    let effective_end = tick_state
                        .start_time_ms
                        .saturating_add(tick_state.buff_duration_ms);
                    let effective_now = now_ms.min(effective_end.saturating_sub(1));
                    if effective_now < tick_state.start_time_ms {
                        if now_ms >= effective_end && tick_state.is_active {
                            tick_state.is_active = false;
                            tick_state.active_buff_uuid = 0;
                            changed = true;
                        }
                        continue;
                    }

                    let elapsed_ms = effective_now.saturating_sub(tick_state.start_time_ms) as u64;
                    if now_ms >= effective_end && tick_state.is_active {
                        tick_state.is_active = false;
                        tick_state.active_buff_uuid = 0;
                        changed = true;
                    }
                    elapsed_ms
                };
                let expected_ticks = elapsed_ms / tick_state.tick_interval_ms.max(1) + 1;

                if expected_ticks > tick_state.applied_ticks {
                    let new_ticks = expected_ticks - tick_state.applied_ticks;
                    tick_state.applied_ticks = expected_ticks;

                    let condition_met =
                        matches_attr_condition(attr_store, local_player_uid, tick_state);
                    if condition_met {
                        let multiplier = u32::try_from(new_ticks).unwrap_or(u32::MAX);
                        let increment_total = tick_state.increment.saturating_mul(multiplier);
                        pending_increment = pending_increment.saturating_add(increment_total);
                    }
                }
            }
            for tick_state in &mut state.skill_tick_states {
                if !tick_state.is_active {
                    continue;
                }

                if !matches_skill_duration_tick_state(attr_store, local_player_uid, tick_state) {
                    tick_state.is_active = false;
                    changed = true;
                    continue;
                }

                if now_ms < tick_state.start_time_ms {
                    continue;
                }

                let elapsed_ms = now_ms.saturating_sub(tick_state.start_time_ms) as u64;
                let expected_ticks = elapsed_ms / tick_state.tick_interval_ms.max(1) + 1;

                if expected_ticks > tick_state.applied_ticks {
                    let new_ticks = expected_ticks - tick_state.applied_ticks;
                    tick_state.applied_ticks = expected_ticks;

                    let multiplier = u32::try_from(new_ticks).unwrap_or(u32::MAX);
                    let increment_total = tick_state.increment.saturating_mul(multiplier);
                    pending_increment = pending_increment.saturating_add(increment_total);
                }
            }

            if pending_increment > 0 {
                changed |= add_increment_to_slots(state, pending_increment);
            }
        }
        changed
    }

    pub fn build_payload(&self) -> Vec<CounterUpdateState> {
        let mut rows: Vec<CounterUpdateState> = self
            .states
            .values()
            .map(|state| CounterUpdateState {
                rule_id: state.rule_id,
                slots: state
                    .slot_states
                    .iter()
                    .map(|slot| SlotUpdateState {
                        slot_id: slot.slot_id,
                        current_count: slot.current_count,
                        threshold: slot.threshold,
                        is_counting: slot.is_counting,
                        reset_buff_active: slot.reset_buff_active,
                        freeze_until_ms: slot.freeze_until_ms,
                        freeze_duration_ms: slot.freeze_duration_ms,
                    })
                    .collect(),
            })
            .collect();
        rows.sort_by(|a, b| a.rule_id.cmp(&b.rule_id));
        rows
    }

    pub fn reset_counts(&mut self) {
        for state in self.states.values_mut() {
            for slot in &mut state.slot_states {
                slot.current_count = 0;
                slot.is_counting = true;
                slot.reset_buff_active = false;
                slot.freeze_until_ms = None;
            }
            for tick in &mut state.tick_states {
                tick.is_active = false;
                tick.active_buff_uuid = 0;
                tick.start_time_ms = 0;
                tick.buff_duration_ms = 0;
                tick.applied_ticks = 0;
            }
            for tick in &mut state.skill_tick_states {
                tick.is_active = false;
                tick.start_time_ms = 0;
                tick.applied_ticks = 0;
            }
            for accumulator in &mut state.damage_hit_accumulators {
                *accumulator = 0;
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CounterRuleCurrent {
    rule_id: i32,
    #[serde(default)]
    sources: Vec<CounterSource>,
    #[serde(default)]
    effect_slots: Vec<EffectSlotConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CounterRuleLegacy {
    rule_id: i32,
    trigger: CounterTriggerLegacy,
    linked_buff_id: i32,
    threshold: Option<u32>,
    #[serde(default)]
    on_buff_add: CounterAction,
    #[serde(default)]
    on_buff_remove: CounterAction,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CounterTriggerLegacy {
    DamageBySkillKey(Vec<i64>),
    DamageBySkillKeySelfTarget(Vec<i64>),
    AnyDamage,
}

impl CounterTriggerLegacy {
    fn into_source(self) -> CounterSource {
        match self {
            CounterTriggerLegacy::DamageBySkillKey(skill_keys) => CounterSource::DamageBySkillKey {
                skill_keys,
                increment: 1,
                hits_required: None,
            },
            CounterTriggerLegacy::DamageBySkillKeySelfTarget(skill_keys) => {
                CounterSource::DamageBySkillKeySelfTarget {
                    skill_keys,
                    increment: 1,
                    hits_required: None,
                }
            }
            CounterTriggerLegacy::AnyDamage => CounterSource::AnyDamage {
                increment: 1,
                hits_required: None,
            },
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum CounterRuleRepr {
    Current(CounterRuleCurrent),
    Legacy(CounterRuleLegacy),
}

fn default_on_freeze_expire() -> CounterAction {
    CounterAction::ResetAndStartCount
}

fn scaled_increment(increment: u32, matches: usize) -> Option<u32> {
    if matches == 0 {
        return None;
    }

    Some(increment.saturating_mul(u32::try_from(matches).unwrap_or(u32::MAX)))
}

fn apply_damage_hits_required(
    accumulator: &mut u32,
    increment: u32,
    hits_required: Option<u32>,
    matches: usize,
) -> Option<u32> {
    let matches = u32::try_from(matches).unwrap_or(u32::MAX);
    if matches == 0 {
        return None;
    }

    match hits_required {
        Some(required) if required > 1 => {
            *accumulator = accumulator.saturating_add(matches);
            let triggers = *accumulator / required;
            *accumulator %= required;
            if triggers == 0 {
                None
            } else {
                Some(increment.saturating_mul(triggers))
            }
        }
        _ => Some(increment.saturating_mul(matches)),
    }
}

fn matches_attr_condition(
    attr_store: &EntityAttrStore,
    local_player_uid: i64,
    tick_state: &BuffTickState,
) -> bool {
    match (tick_state.attr_condition.as_ref(), tick_state.attr_type) {
        (None, _) => true,
        (Some(_condition), None) => false,
        (Some(condition), Some(attr_type)) => {
            attr_store
                .attr(local_player_uid, attr_type)
                .and_then(AttrValue::as_int)
                .and_then(|value| i32::try_from(value).ok())
                == Some(condition.required_value)
        }
    }
}

fn is_actor_state_skill(attr_store: &EntityAttrStore, local_player_uid: i64) -> bool {
    attr_store
        .attr(local_player_uid, AttrType::ActorState)
        .and_then(AttrValue::as_int)
        .is_some_and(|value| value == i64::from(EActorState::ActorStateSkill as i32))
}

fn matches_skill_duration_tick_state(
    attr_store: &EntityAttrStore,
    local_player_uid: i64,
    tick_state: &SkillCastTickState,
) -> bool {
    is_actor_state_skill(attr_store, local_player_uid)
        && attr_store
            .attr(local_player_uid, AttrType::SkillId)
            .and_then(AttrValue::as_int)
            .and_then(|value| i32::try_from(value).ok())
            == Some(tick_state.skill_base_id)
}

fn activate_skill_tick_state(tick_state: &mut SkillCastTickState) -> bool {
    let start_time_ms = now_ms();
    let changed = !tick_state.is_active
        || tick_state.start_time_ms != start_time_ms
        || tick_state.applied_ticks != 0;
    tick_state.is_active = true;
    tick_state.start_time_ms = start_time_ms;
    tick_state.applied_ticks = 0;
    changed
}

fn add_increment_to_slots(state: &mut CounterModelState, increment: u32) -> bool {
    let mut changed = false;
    for slot_state in &mut state.slot_states {
        if !slot_state.is_counting {
            continue;
        }
        let next = slot_state.current_count.saturating_add(increment);
        if next != slot_state.current_count {
            slot_state.current_count = next;
            changed = true;
        }
    }
    changed
}

fn start_fixed_freeze_timer(
    slot_state: &mut SlotState,
    action: CounterAction,
    event_time_ms: Option<i64>,
) -> bool {
    if !matches!(
        action,
        CounterAction::Freeze | CounterAction::ResetAndFreeze
    ) {
        return false;
    }
    let Some(freeze_duration_ms) = slot_state.freeze_duration_ms else {
        return false;
    };
    let freeze_until_ms = event_time_ms
        .unwrap_or_else(now_ms)
        .saturating_add(i64::try_from(freeze_duration_ms).unwrap_or(i64::MAX));
    if slot_state.freeze_until_ms == Some(freeze_until_ms) {
        return false;
    }
    slot_state.freeze_until_ms = Some(freeze_until_ms);
    true
}

fn apply_tick_change(tick_state: &mut BuffTickState, change: &BuffChangeEvent) -> bool {
    let mut changed = false;
    match change.change_type {
        BuffChangeType::Added => {
            if tick_state.active_buff_uuid != change.buff_uuid {
                tick_state.active_buff_uuid = change.buff_uuid;
                changed = true;
            }
            if !tick_state.is_active {
                tick_state.is_active = true;
                changed = true;
            }
            if let Some(create_time_ms) = change.create_time_ms {
                tick_state.start_time_ms = create_time_ms;
                tick_state.applied_ticks = 0;
                changed = true;
            }
            if let Some(duration_ms) = change.duration_ms {
                let duration_ms = i64::from(duration_ms.max(0));
                if tick_state.buff_duration_ms != duration_ms {
                    tick_state.buff_duration_ms = duration_ms;
                    changed = true;
                }
            }
        }
        BuffChangeType::Changed => {
            if tick_state.active_buff_uuid != change.buff_uuid {
                tick_state.active_buff_uuid = change.buff_uuid;
                changed = true;
            }
            if let Some(create_time_ms) = change.create_time_ms {
                if tick_state.start_time_ms != create_time_ms {
                    tick_state.start_time_ms = create_time_ms;
                    tick_state.applied_ticks = 0;
                    changed = true;
                }
            }
            if let Some(duration_ms) = change.duration_ms {
                let duration_ms = i64::from(duration_ms.max(0));
                if tick_state.buff_duration_ms != duration_ms {
                    tick_state.buff_duration_ms = duration_ms;
                    changed = true;
                }
            }
            if !tick_state.is_active {
                tick_state.is_active = true;
                changed = true;
            }
        }
        BuffChangeType::Removed => {
            if tick_state.active_buff_uuid == change.buff_uuid && tick_state.is_active {
                tick_state.is_active = false;
                tick_state.active_buff_uuid = 0;
                changed = true;
            }
        }
    }
    changed
}

fn apply_action(state: &mut SlotState, action: CounterAction) -> bool {
    match action {
        CounterAction::Reset => {
            if state.current_count == 0 {
                false
            } else {
                state.current_count = 0;
                true
            }
        }
        CounterAction::Freeze => {
            if state.is_counting {
                state.is_counting = false;
                true
            } else {
                false
            }
        }
        CounterAction::ResetAndFreeze => {
            let mut changed = false;
            if state.current_count != 0 {
                state.current_count = 0;
                changed = true;
            }
            if state.is_counting {
                state.is_counting = false;
                changed = true;
            }
            changed
        }
        CounterAction::ResetAndStartCount => {
            let mut changed = false;
            if state.current_count != 0 {
                state.current_count = 0;
                changed = true;
            }
            if !state.is_counting {
                state.is_counting = true;
                changed = true;
            }
            if state.freeze_until_ms.take().is_some() {
                changed = true;
            }
            changed
        }
        CounterAction::StartCount => {
            let mut changed = false;
            if !state.is_counting {
                state.is_counting = true;
                changed = true;
            }
            if state.freeze_until_ms.take().is_some() {
                changed = true;
            }
            changed
        }
        CounterAction::NoOp => false,
    }
}
