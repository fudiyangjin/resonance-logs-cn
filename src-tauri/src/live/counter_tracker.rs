use crate::database::now_ms;
use crate::live::buff_monitor::{BuffChangeEvent, BuffChangeType};
use crate::live::commands_models::{CounterUpdateState, FightResourceEntry, SlotUpdateState};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::opcodes_models::PositionAttr;
use crate::live::opcodes_process::{DamageTakenSource, LocalDamageEvent, LocalDamageTakenEvent};
use crate::live::skill_lifecycle::{SkillId, SkillLifecycleOutput};
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
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, Default)]
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

#[derive(Debug, Clone)]
pub(crate) struct CounterModelState {
    pub rule_id: i32,
    pub slot_states: Vec<SlotState>,
    pub tick_states: Vec<BuffTickState>,
    pub skill_tick_states: Vec<SkillCastTickState>,
    pub skill_complete_states: Vec<SkillCastCompleteState>,
    pub fight_resource_spent_states: Vec<FightResourceSpentState>,
    pub buff_layer_spent_states: Vec<BuffLayerSpentState>,
    pub movement_distance_states: Vec<MovementDistanceState>,
    pub damage_hit_accumulators: Vec<u32>,
}

#[derive(Debug, Clone)]
pub(crate) struct SlotState {
    pub slot_id: i32,
    pub current_count: u32,
    pub threshold: Option<u32>,
    pub is_counting: bool,
    pub reset_buff_active: bool,
    pub condition_buff_active: bool,
    pub freeze_until_ms: Option<i64>,
    pub freeze_duration_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub(crate) struct BuffTickState {
    pub buff_id: i32,
    pub active_buff_uuid: i32,
    pub is_active: bool,
    pub start_time_ms: i64,
    pub expires_at_ms: Option<i64>,
    pub applied_ticks: u64,
    pub tick_interval_ms: u64,
    pub increment: u32,
    pub attr_condition: Option<TickAttrCondition>,
}

#[derive(Debug, Clone)]
pub(crate) struct SkillCastTickState {
    pub skill_id: SkillId,
    pub is_active: bool,
    pub start_time_ms: i64,
    pub applied_ticks: u64,
    pub tick_interval_ms: u64,
    pub increment: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct SkillCastCompleteState {
    pub skill_ids: Vec<SkillId>,
    pub increment: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct FightResourceSpentState {
    pub resource_id: i32,
    pub previous_value: Option<i64>,
    pub accumulated_spent: u32,
    pub units_required: u32,
    pub increment: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct BuffLayerSpentState {
    pub buff_id: i32,
    pub accumulated_spent: u32,
    pub units_required: u32,
    pub increment: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct MovementDistanceState {
    pub buff_id: i32,
    pub attr_id: i32,
    pub is_active: bool,
    pub last_position: Option<PositionAttr>,
    pub accumulated_meters: f32,
    pub meters_required: f32,
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
        use serde::de::Error as _;

        let value = serde_json::Value::deserialize(deserializer)?;
        let object = value
            .as_object()
            .ok_or_else(|| D::Error::custom("counter rule must be a json object"))?;
        let is_legacy = object.contains_key("trigger") || object.contains_key("linkedBuffId");

        if is_legacy {
            let rule: CounterRuleLegacy =
                serde_json::from_value(value).map_err(D::Error::custom)?;
            Ok(CounterRule {
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
                    alt_freeze: None,
                    threshold_modifier: None,
                    freeze_duration_modifier: None,
                    reset_skill_keys: None,
                    on_reset_skill: CounterAction::NoOp,
                }],
            })
        } else {
            let rule: CounterRuleCurrent =
                serde_json::from_value(value).map_err(D::Error::custom)?;
            Ok(CounterRule {
                rule_id: rule.rule_id,
                sources: rule.sources,
                effect_slots: rule.effect_slots,
            })
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
                    condition_buff_active: false,
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
                        expires_at_ms: None,
                        applied_ticks: 0,
                        tick_interval_ms: (*tick_interval_ms).max(1),
                        increment: *increment,
                        attr_condition: attr_condition.clone(),
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
                    } => SkillId::new(*skill_base_id).map(|skill_id| SkillCastTickState {
                        skill_id,
                        is_active: false,
                        start_time_ms: 0,
                        applied_ticks: 0,
                        tick_interval_ms: (*tick_interval_ms).max(1),
                        increment: *increment,
                    }),
                    _ => None,
                })
                .collect();
            let skill_complete_states = rule
                .sources
                .iter()
                .filter_map(|source| match source {
                    CounterSource::SkillCastComplete {
                        skill_base_ids,
                        increment,
                    } => Some(SkillCastCompleteState {
                        skill_ids: skill_base_ids
                            .iter()
                            .filter_map(|id| SkillId::new(*id))
                            .collect(),
                        increment: *increment,
                    }),
                    _ => None,
                })
                .collect();
            let fight_resource_spent_states = rule
                .sources
                .iter()
                .filter_map(|source| match source {
                    CounterSource::FightResourceSpent {
                        resource_id,
                        units_required,
                        increment,
                    } => Some(FightResourceSpentState {
                        resource_id: *resource_id,
                        previous_value: None,
                        accumulated_spent: 0,
                        units_required: (*units_required).max(1),
                        increment: *increment,
                    }),
                    _ => None,
                })
                .collect();
            let buff_layer_spent_states = rule
                .sources
                .iter()
                .filter_map(|source| match source {
                    CounterSource::BuffLayerSpent {
                        buff_id,
                        units_required,
                        increment,
                    } => Some(BuffLayerSpentState {
                        buff_id: *buff_id,
                        accumulated_spent: 0,
                        units_required: (*units_required).max(1),
                        increment: *increment,
                    }),
                    _ => None,
                })
                .collect();
            let movement_distance_states = rule
                .sources
                .iter()
                .filter_map(|source| match source {
                    CounterSource::MovementDistance {
                        buff_id,
                        attr_id,
                        meters_required,
                        increment,
                    } => Some(MovementDistanceState {
                        buff_id: *buff_id,
                        attr_id: *attr_id,
                        is_active: false,
                        last_position: None,
                        accumulated_meters: 0.0,
                        meters_required: normalize_meters_required(*meters_required),
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
                    skill_complete_states,
                    fight_resource_spent_states,
                    buff_layer_spent_states,
                    movement_distance_states,
                    damage_hit_accumulators: vec![0; rule.sources.len()],
                },
            );
        }

        self.rules = rules;
        self.states = states;
    }

    pub fn on_damage_events(
        &mut self,
        events: &[LocalDamageEvent],
        local_player_uuid: i64,
        attr_store: &EntityAttrStore,
    ) -> bool {
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
                        required_type_flags,
                    } => apply_damage_hits_required(
                        &mut state.damage_hit_accumulators[source_idx],
                        *increment,
                        *hits_required,
                        events
                            .iter()
                            .filter(|event| {
                                skill_keys.contains(&event.skill_key)
                                    && matches_required_type_flags(
                                        event.type_flag,
                                        *required_type_flags,
                                    )
                            })
                            .count(),
                    ),
                    CounterSource::DamageBySkillKeyOnce {
                        skill_keys,
                        increment,
                        required_type_flags,
                    } => apply_damage_by_skill_key_once_max(
                        events,
                        skill_keys,
                        *increment,
                        *required_type_flags,
                    ),
                    CounterSource::DamageBySkillKeySelfTarget {
                        skill_keys,
                        increment,
                        hits_required,
                        required_type_flags,
                    } => apply_damage_hits_required(
                        &mut state.damage_hit_accumulators[source_idx],
                        *increment,
                        *hits_required,
                        events
                            .iter()
                            .filter(|event| {
                                skill_keys.contains(&event.skill_key)
                                    && event.target_entity_uuid == local_player_uuid
                                    && matches_required_type_flags(
                                        event.type_flag,
                                        *required_type_flags,
                                    )
                            })
                            .count(),
                    ),
                    CounterSource::AnyDamage {
                        increment,
                        hits_required,
                        required_type_flags,
                    } => apply_damage_hits_required(
                        &mut state.damage_hit_accumulators[source_idx],
                        *increment,
                        *hits_required,
                        events
                            .iter()
                            .filter(|event| {
                                matches_required_type_flags(event.type_flag, *required_type_flags)
                            })
                            .count(),
                    ),
                    _ => continue,
                };
                let Some(increment) = increment else {
                    continue;
                };
                changed |= add_increment_to_slots(state, increment);
            }
            for (slot_config, slot_state) in rule.effect_slots.iter().zip(&mut state.slot_states) {
                let Some(reset_skill_keys) = slot_config.reset_skill_keys.as_ref() else {
                    continue;
                };
                if reset_skill_keys.is_empty()
                    || !events
                        .iter()
                        .any(|event| reset_skill_keys.contains(&event.skill_key))
                {
                    continue;
                }
                changed |= apply_action(slot_state, slot_config.on_reset_skill);
                changed |= start_freeze_with_resolved_duration(
                    slot_config,
                    slot_state,
                    slot_config.on_reset_skill,
                    None,
                    attr_store,
                    local_player_uuid,
                );
            }
        }
        changed
    }

    pub fn on_damage_taken_events(
        &mut self,
        events: &[LocalDamageTakenEvent],
        local_player_uuid: i64,
    ) -> bool {
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
                let CounterSource::DamageTaken {
                    skill_keys,
                    increment,
                    hits_required,
                    required_type_flags,
                } = source
                else {
                    continue;
                };
                let matches = events
                    .iter()
                    .filter(|event| {
                        !matches!(event.source, DamageTakenSource::Entity(uuid) if uuid == local_player_uuid)
                            && skill_keys
                                .as_ref()
                                .is_none_or(|keys| keys.contains(&event.skill_key))
                            && matches_required_type_flags(event.type_flag, *required_type_flags)
                    })
                    .count();
                let Some(increment) = apply_damage_hits_required(
                    &mut state.damage_hit_accumulators[source_idx],
                    *increment,
                    *hits_required,
                    matches,
                ) else {
                    continue;
                };
                changed |= add_increment_to_slots(state, increment);
            }
        }
        changed
    }

    pub fn on_fight_resource_update(&mut self, entries: &[FightResourceEntry]) -> bool {
        if entries.is_empty() {
            return false;
        }

        let mut changed = false;
        for state in self.states.values_mut() {
            let mut pending_increment = 0u32;
            for resource_state in &mut state.fight_resource_spent_states {
                let Some(entry) = entries
                    .iter()
                    .find(|entry| entry.id == resource_state.resource_id)
                else {
                    continue;
                };
                pending_increment = pending_increment
                    .saturating_add(apply_fight_resource_spent(resource_state, entry.value));
            }
            if pending_increment > 0 {
                changed |= add_increment_to_slots(state, pending_increment);
            }
        }
        changed
    }

    pub fn on_movement_sample(
        &mut self,
        attr_store: &EntityAttrStore,
        local_player_uuid: i64,
    ) -> bool {
        let mut changed = false;
        for state in self.states.values_mut() {
            let mut pending_increment = 0u32;
            for movement_state in &mut state.movement_distance_states {
                if !movement_state.is_active {
                    continue;
                }
                let Some(position) =
                    attr_store.attr_position_by_id(local_player_uuid, movement_state.attr_id)
                else {
                    continue;
                };
                pending_increment = pending_increment
                    .saturating_add(apply_movement_distance_sample(movement_state, position));
            }
            if pending_increment > 0 {
                changed |= add_increment_to_slots(state, pending_increment);
            }
        }
        changed
    }

    pub fn on_skill_lifecycle_output(&mut self, output: SkillLifecycleOutput) -> bool {
        match output {
            SkillLifecycleOutput::CastStarted(skill_id) => self.on_skill_cast_started(skill_id),
            SkillLifecycleOutput::DurationStarted(skill_id) => {
                self.on_skill_duration_started(skill_id)
            }
            SkillLifecycleOutput::DurationEnded(skill_id) => self.on_skill_duration_ended(skill_id),
            SkillLifecycleOutput::CastCompleted(skill_id) => self.on_skill_cast_completed(skill_id),
        }
    }

    pub fn on_skill_cast_started(&mut self, skill_id: SkillId) -> bool {
        self.apply_skill_cast_sources(skill_id)
    }

    pub fn on_skill_duration_started(&mut self, skill_id: SkillId) -> bool {
        self.activate_skill_duration_ticks(skill_id, now_ms())
    }

    pub fn on_skill_duration_ended(&mut self, skill_id: SkillId) -> bool {
        self.deactivate_skill_duration_ticks(skill_id)
    }

    pub fn on_skill_cast_completed(&mut self, skill_id: SkillId) -> bool {
        self.apply_skill_complete(skill_id)
    }

    fn apply_skill_cast_sources(&mut self, skill_id: SkillId) -> bool {
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
                if skill_base_ids.contains(&skill_id.get()) {
                    changed |= add_increment_to_slots(state, *increment);
                }
            }
        }
        changed
    }

    fn activate_skill_duration_ticks(&mut self, skill_id: SkillId, start_time_ms: i64) -> bool {
        let mut changed = false;
        for state in self.states.values_mut() {
            for tick_state in &mut state.skill_tick_states {
                if tick_state.skill_id == skill_id {
                    changed |= activate_skill_tick_state(tick_state, start_time_ms);
                }
            }
        }
        changed
    }

    fn deactivate_skill_duration_ticks(&mut self, skill_id: SkillId) -> bool {
        let mut changed = false;
        for state in self.states.values_mut() {
            for tick_state in &mut state.skill_tick_states {
                if tick_state.skill_id == skill_id && tick_state.is_active {
                    tick_state.is_active = false;
                    changed = true;
                }
            }
        }
        changed
    }

    fn apply_skill_complete(&mut self, skill_id: SkillId) -> bool {
        let mut changed = false;
        for state in self.states.values_mut() {
            let increment = state
                .skill_complete_states
                .iter()
                .filter(|complete_state| complete_state.skill_ids.contains(&skill_id))
                .fold(0u32, |acc, complete_state| {
                    acc.saturating_add(complete_state.increment)
                });
            if increment > 0 {
                changed |= add_increment_to_slots(state, increment);
            }
        }
        changed
    }

    pub fn on_buff_changes(
        &mut self,
        changes: &[BuffChangeEvent],
        attr_store: &EntityAttrStore,
        local_player_uuid: i64,
    ) -> bool {
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
                for movement_state in &mut state.movement_distance_states {
                    apply_movement_buff_change(movement_state, change);
                }
                let mut pending_increment = 0u32;
                for source in &rule.sources {
                    let CounterSource::BuffAdded {
                        buff_id,
                        source_config_id,
                        increment,
                    } = source
                    else {
                        continue;
                    };
                    if change.change_type == BuffChangeType::Added
                        && change.base_id == *buff_id
                        && source_config_id
                            .is_none_or(|required| change.source_config_id == Some(required))
                    {
                        pending_increment = pending_increment.saturating_add(*increment);
                    }
                }
                for layer_spent_state in &mut state.buff_layer_spent_states {
                    pending_increment = pending_increment
                        .saturating_add(apply_buff_layer_spent(layer_spent_state, change));
                }
                if pending_increment > 0 {
                    changed |= add_increment_to_slots(state, pending_increment);
                }
                for (slot_config, slot_state) in
                    rule.effect_slots.iter().zip(&mut state.slot_states)
                {
                    if let Some(alt_freeze) = &slot_config.alt_freeze {
                        if alt_freeze.condition_buff_id == change.base_id {
                            match change.change_type {
                                BuffChangeType::Added => {
                                    if !slot_state.condition_buff_active {
                                        slot_state.condition_buff_active = true;
                                    }
                                }
                                BuffChangeType::Removed => {
                                    if slot_state.condition_buff_active {
                                        slot_state.condition_buff_active = false;
                                    }
                                }
                                BuffChangeType::Changed => {}
                            }
                        }
                    }
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
                    changed |= start_freeze_with_resolved_duration(
                        slot_config,
                        slot_state,
                        action,
                        Some(change.event_time_ms),
                        attr_store,
                        local_player_uuid,
                    );
                }
            }
        }
        changed
    }

    pub fn tick_counters(
        &mut self,
        now_ms: i64,
        attr_store: &EntityAttrStore,
        local_player_uuid: i64,
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

                let elapsed_ms = if let Some(expires_at_ms) = tick_state.expires_at_ms {
                    let effective_now = now_ms.min(expires_at_ms.saturating_sub(1));
                    if effective_now < tick_state.start_time_ms {
                        if now_ms >= expires_at_ms && tick_state.is_active {
                            tick_state.is_active = false;
                            changed = true;
                        }
                        continue;
                    }

                    let elapsed_ms = effective_now.saturating_sub(tick_state.start_time_ms) as u64;
                    if now_ms >= expires_at_ms && tick_state.is_active {
                        tick_state.is_active = false;
                        changed = true;
                    }
                    elapsed_ms
                } else {
                    now_ms.saturating_sub(tick_state.start_time_ms) as u64
                };
                let expected_ticks = elapsed_ms / tick_state.tick_interval_ms.max(1) + 1;

                if expected_ticks > tick_state.applied_ticks {
                    let new_ticks = expected_ticks - tick_state.applied_ticks;
                    tick_state.applied_ticks = expected_ticks;

                    let condition_met =
                        matches_attr_condition(attr_store, local_player_uuid, tick_state);
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

    pub fn build_payload(
        &self,
        attr_store: &EntityAttrStore,
        local_player_uuid: i64,
    ) -> Vec<CounterUpdateState> {
        let mut rows: Vec<CounterUpdateState> = self
            .rules
            .iter()
            .filter_map(|rule| {
                let state = self.states.get(&rule.rule_id)?;
                Some(CounterUpdateState {
                    rule_id: state.rule_id,
                    slots: rule
                        .effect_slots
                        .iter()
                        .zip(&state.slot_states)
                        .map(|(slot_config, slot)| SlotUpdateState {
                            slot_id: slot.slot_id,
                            current_count: slot.current_count,
                            threshold: slot.threshold,
                            effective_threshold: resolve_effective_threshold(
                                slot.threshold,
                                slot_config,
                                attr_store,
                                local_player_uuid,
                            ),
                            is_counting: slot.is_counting,
                            reset_buff_active: slot.reset_buff_active,
                            freeze_until_ms: slot.freeze_until_ms,
                            freeze_duration_ms: slot.freeze_duration_ms,
                            effective_freeze_duration_ms: resolve_freeze_duration(
                                slot_config,
                                slot,
                                attr_store,
                                local_player_uuid,
                            ),
                        })
                        .collect(),
                })
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
                slot.condition_buff_active = false;
                slot.freeze_until_ms = None;
            }
            for tick in &mut state.tick_states {
                tick.is_active = false;
                tick.active_buff_uuid = 0;
                tick.start_time_ms = 0;
                tick.expires_at_ms = None;
                tick.applied_ticks = 0;
            }
            for tick in &mut state.skill_tick_states {
                tick.is_active = false;
                tick.start_time_ms = 0;
                tick.applied_ticks = 0;
            }
            for resource in &mut state.fight_resource_spent_states {
                resource.previous_value = None;
                resource.accumulated_spent = 0;
            }
            for layer_spent in &mut state.buff_layer_spent_states {
                layer_spent.accumulated_spent = 0;
            }
            for movement in &mut state.movement_distance_states {
                movement.is_active = false;
                movement.last_position = None;
                movement.accumulated_meters = 0.0;
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
                required_type_flags: None,
            },
            CounterTriggerLegacy::DamageBySkillKeySelfTarget(skill_keys) => {
                CounterSource::DamageBySkillKeySelfTarget {
                    skill_keys,
                    increment: 1,
                    hits_required: None,
                    required_type_flags: None,
                }
            }
            CounterTriggerLegacy::AnyDamage => CounterSource::AnyDamage {
                increment: 1,
                hits_required: None,
                required_type_flags: None,
            },
        }
    }
}

fn default_on_freeze_expire() -> CounterAction {
    CounterAction::ResetAndStartCount
}

fn default_basis_points_per_unit() -> u32 {
    1
}

fn resolve_attr_scale_bp(
    modifier: Option<&AttrModifier>,
    attr_store: &EntityAttrStore,
    local_player_uuid: i64,
) -> u32 {
    const FULL_SCALE_BASIS_POINTS: u64 = 10_000;

    let Some(modifier) = modifier else {
        return FULL_SCALE_BASIS_POINTS as u32;
    };
    let raw = attr_store
        .attr_int_by_id(local_player_uuid, modifier.attr_id)
        .unwrap_or(0)
        .max(0) as u64;
    let divisor = u64::from(modifier.basis_points_per_unit.max(1));
    let reduction = (raw / divisor).min(u64::from(modifier.max_reduction_basis_points));
    FULL_SCALE_BASIS_POINTS.saturating_sub(reduction) as u32
}

fn scale_basis_points_ceil(value: u64, scale_basis_points: u32) -> u64 {
    const FULL_SCALE_BASIS_POINTS: u64 = 10_000;

    value
        .saturating_mul(u64::from(scale_basis_points))
        .saturating_add(FULL_SCALE_BASIS_POINTS - 1)
        / FULL_SCALE_BASIS_POINTS
}

fn resolve_effective_threshold(
    threshold: Option<u32>,
    config: &EffectSlotConfig,
    attr_store: &EntityAttrStore,
    local_player_uuid: i64,
) -> Option<u32> {
    threshold.map(|value| {
        let scale = resolve_attr_scale_bp(
            config.threshold_modifier.as_ref(),
            attr_store,
            local_player_uuid,
        );
        u32::try_from(scale_basis_points_ceil(u64::from(value), scale)).unwrap_or(u32::MAX)
    })
}

fn scaled_increment(increment: u32, matches: usize) -> Option<u32> {
    if matches == 0 {
        return None;
    }

    Some(increment.saturating_mul(u32::try_from(matches).unwrap_or(u32::MAX)))
}

fn apply_damage_by_skill_key_once_max(
    events: &[LocalDamageEvent],
    skill_keys: &[i64],
    increment: u32,
    required_type_flags: Option<i32>,
) -> Option<u32> {
    if events.is_empty() || skill_keys.is_empty() {
        return None;
    }

    let mut hits: HashMap<(i64, i64), u32> = HashMap::new();
    for event in events {
        if skill_keys.contains(&event.skill_key)
            && matches_required_type_flags(event.type_flag, required_type_flags)
        {
            *hits
                .entry((event.skill_key, event.target_entity_uuid))
                .or_insert(0) += 1;
        }
    }

    let total = skill_keys
        .iter()
        .map(|skill_key| {
            hits.iter()
                .filter_map(|((matched_skill_key, _), count)| {
                    (matched_skill_key == skill_key).then_some(*count)
                })
                .max()
                .unwrap_or(0)
        })
        .sum::<u32>();

    scaled_increment(increment, usize::try_from(total).unwrap_or(usize::MAX))
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

#[inline]
fn matches_required_type_flags(type_flag: i32, required_type_flags: Option<i32>) -> bool {
    required_type_flags.is_none_or(|required| (type_flag & required) == required)
}

fn apply_fight_resource_spent(state: &mut FightResourceSpentState, current_value: i64) -> u32 {
    let Some(previous_value) = state.previous_value.replace(current_value) else {
        return 0;
    };
    if current_value >= previous_value {
        return 0;
    }

    let spent = u32::try_from(previous_value.saturating_sub(current_value)).unwrap_or(u32::MAX);
    state.accumulated_spent = state.accumulated_spent.saturating_add(spent);
    let triggers = state.accumulated_spent / state.units_required.max(1);
    state.accumulated_spent %= state.units_required.max(1);
    state.increment.saturating_mul(triggers)
}

fn apply_buff_layer_spent(state: &mut BuffLayerSpentState, change: &BuffChangeEvent) -> u32 {
    if change.change_type != BuffChangeType::Changed || change.base_id != state.buff_id {
        return 0;
    }
    let (Some(previous_layer), Some(current_layer)) = (change.previous_layer, change.current_layer)
    else {
        return 0;
    };
    if previous_layer <= current_layer {
        return 0;
    }

    let spent = u32::try_from(previous_layer.saturating_sub(current_layer)).unwrap_or(u32::MAX);
    state.accumulated_spent = state.accumulated_spent.saturating_add(spent);
    let units_required = state.units_required.max(1);
    let triggers = state.accumulated_spent / units_required;
    state.accumulated_spent %= units_required;
    state.increment.saturating_mul(triggers)
}

fn normalize_meters_required(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        1.0
    }
}

fn apply_movement_buff_change(state: &mut MovementDistanceState, change: &BuffChangeEvent) {
    if state.buff_id != change.base_id {
        return;
    }

    match change.change_type {
        BuffChangeType::Added => {
            state.is_active = true;
            state.last_position = None;
            state.accumulated_meters = 0.0;
        }
        BuffChangeType::Changed => {
            if !state.is_active {
                state.is_active = true;
                state.last_position = None;
                state.accumulated_meters = 0.0;
            }
        }
        BuffChangeType::Removed => {
            state.is_active = false;
            state.last_position = None;
            state.accumulated_meters = 0.0;
        }
    }
}

fn apply_movement_distance_sample(
    state: &mut MovementDistanceState,
    position: PositionAttr,
) -> u32 {
    const MAX_MOVEMENT_DELTA_METERS: f32 = 50.0;

    let Some(previous) = state.last_position.replace(position) else {
        return 0;
    };

    let distance = distance_between(previous, position);
    if distance <= 0.0 || !distance.is_finite() {
        return 0;
    }
    if distance > MAX_MOVEMENT_DELTA_METERS {
        state.accumulated_meters = 0.0;
        return 0;
    }

    state.accumulated_meters += distance;
    let triggers = (state.accumulated_meters / state.meters_required).floor() as u32;
    if triggers == 0 {
        return 0;
    }
    state.accumulated_meters -= state.meters_required * triggers as f32;
    state.increment.saturating_mul(triggers)
}

fn distance_between(a: PositionAttr, b: PositionAttr) -> f32 {
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    (dx.mul_add(dx, dz * dz)).sqrt()
}

fn matches_attr_condition(
    attr_store: &EntityAttrStore,
    local_player_uuid: i64,
    tick_state: &BuffTickState,
) -> bool {
    let Some(condition) = tick_state.attr_condition.as_ref() else {
        return true;
    };
    attr_store
        .attr_int_by_id(local_player_uuid, condition.attr_id)
        .and_then(|value| i32::try_from(value).ok())
        == Some(condition.required_value)
}

fn activate_skill_tick_state(tick_state: &mut SkillCastTickState, start_time_ms: i64) -> bool {
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

fn resolve_freeze_duration(
    config: &EffectSlotConfig,
    state: &SlotState,
    attr_store: &EntityAttrStore,
    local_player_uuid: i64,
) -> Option<u64> {
    let duration = if let Some(alt) = &config.alt_freeze {
        if state.condition_buff_active {
            alt.freeze_duration_ms
        } else {
            config.freeze_duration_ms?
        }
    } else {
        config.freeze_duration_ms?
    };
    let scale = resolve_attr_scale_bp(
        config.freeze_duration_modifier.as_ref(),
        attr_store,
        local_player_uuid,
    );
    Some(scale_basis_points_ceil(duration, scale))
}

fn start_freeze_with_resolved_duration(
    slot_config: &EffectSlotConfig,
    slot_state: &mut SlotState,
    action: CounterAction,
    event_time_ms: Option<i64>,
    attr_store: &EntityAttrStore,
    local_player_uuid: i64,
) -> bool {
    if !matches!(
        action,
        CounterAction::Freeze
            | CounterAction::ResetAndFreeze
            | CounterAction::ResetAndFreezeKeepCounting
    ) {
        return false;
    }
    let Some(duration) =
        resolve_freeze_duration(slot_config, slot_state, attr_store, local_player_uuid)
    else {
        return false;
    };
    let freeze_until_ms = event_time_ms
        .unwrap_or_else(now_ms)
        .saturating_add(i64::try_from(duration).unwrap_or(i64::MAX));
    if slot_state.freeze_until_ms == Some(freeze_until_ms) {
        return false;
    }
    slot_state.freeze_until_ms = Some(freeze_until_ms);
    slot_state.freeze_duration_ms = Some(duration);
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
            if tick_state.start_time_ms != change.event_time_ms || tick_state.applied_ticks != 0 {
                tick_state.start_time_ms = change.event_time_ms;
                tick_state.applied_ticks = 0;
                changed = true;
            }
            let expires_at_ms = duration_expires_at(change.event_time_ms, change.duration_ms);
            if tick_state.expires_at_ms != expires_at_ms {
                tick_state.expires_at_ms = expires_at_ms;
                changed = true;
            }
        }
        BuffChangeType::Changed => {
            if tick_state.active_buff_uuid != change.buff_uuid {
                tick_state.active_buff_uuid = change.buff_uuid;
                tick_state.start_time_ms = change.event_time_ms;
                tick_state.applied_ticks = 0;
                tick_state.expires_at_ms =
                    duration_expires_at(change.event_time_ms, change.duration_ms);
                changed = true;
            } else if let Some(duration_ms) = change.duration_ms {
                let expires_at_ms = duration_expires_at(change.event_time_ms, Some(duration_ms));
                if tick_state.expires_at_ms != expires_at_ms {
                    tick_state.expires_at_ms = expires_at_ms;
                    changed = true;
                }
            }
            let refreshed_to_future = tick_state
                .expires_at_ms
                .is_none_or(|expires_at_ms| change.event_time_ms < expires_at_ms);
            if !tick_state.is_active && refreshed_to_future {
                tick_state.is_active = true;
                changed = true;
            }
        }
        BuffChangeType::Removed => {
            if tick_state.active_buff_uuid == change.buff_uuid {
                if tick_state.is_active {
                    tick_state.is_active = false;
                    changed = true;
                }
                if tick_state.active_buff_uuid != 0 {
                    tick_state.active_buff_uuid = 0;
                    changed = true;
                }
                if tick_state.expires_at_ms.take().is_some() {
                    changed = true;
                }
            }
        }
    }
    changed
}

fn duration_expires_at(event_time_ms: i64, duration_ms: Option<i32>) -> Option<i64> {
    let duration_ms = duration_ms?;
    if duration_ms <= 0 {
        return None;
    }
    Some(event_time_ms.saturating_add(i64::from(duration_ms)))
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
        CounterAction::ResetAndFreezeKeepCounting => {
            let mut changed = false;
            if state.current_count != 0 {
                state.current_count = 0;
                changed = true;
            }
            if !state.is_counting {
                state.is_counting = true;
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
