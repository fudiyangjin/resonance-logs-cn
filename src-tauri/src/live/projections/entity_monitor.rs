//! Incremental DTO projection for live skill/entity monitoring.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::live::ipc::models::{
    BossDbmEvent, BuffUpdateState, EntityDurationTrackState, FightResourceEntry,
    FightResourceState, HateEntry as HateEntryDto, HpEntry, MonsterSkillCastState, PanelAttrState,
    ShieldDetailEntry, SkillCdState, StunEntry, TeammateFantasyState,
};
use crate::live::ipc::topic::TopicMask;
use crate::live::projections::buff_presence::{BuffCompositeCatalog, BuffPresence};
use crate::live::projections::entity_duration::EntityDurationWatch;
use crate::live::projections::monster_skill_watch::MonsterSkillWatch;
use crate::live::projections::skill_cd;
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    AttributeValue, BuffState, DomainEnvelope, DomainEvent, EntityRef, EntityUuid,
    FantasyTransition, MonoTimeMs, SkillPhase, TimerKey, TimerScope,
};
use crate::live::runtime::scheduler::{DeadlineScheduler, TimerTask};

const CD_PANEL_ATTRS: &[i32] = &[
    attr_type::ATTR_SKILL_CD,
    attr_type::ATTR_SKILL_CD_PCT,
    attr_type::ATTR_CD_ACCELERATE_PCT,
];

#[derive(Debug, Default, Clone)]
pub struct EntityMonitorSnapshot {
    pub local_buffs: Vec<BuffUpdateState>,
    pub boss_buffs: HashMap<String, Vec<BuffUpdateState>>,
    pub teammate_buffs: HashMap<String, Vec<BuffUpdateState>>,
    pub dead_teammates: Vec<String>,
    pub skill_cds: Vec<SkillCdState>,
    pub panel_attrs: Vec<PanelAttrState>,
    pub shield_current_hp: i64,
    pub shield_max_hp: i64,
    pub shield_entries: Vec<ShieldDetailEntry>,
    pub fight_resource: Option<FightResourceState>,
    pub teammate_fantasies: Vec<TeammateFantasyState>,
    pub boss_mechanics: Vec<BossDbmEvent>,
    pub hate_lists: HashMap<String, Vec<HateEntryDto>>,
    pub stun: Vec<StunEntry>,
    pub hp: Vec<HpEntry>,
    pub player_names: HashMap<String, String>,
    pub monster_ids: HashMap<String, i32>,
    pub entity_duration_tracks: Vec<EntityDurationTrackState>,
    pub monster_skill_casts: Vec<MonsterSkillCastState>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FantasyCastKey {
    summoner: EntityUuid,
    cast_key: i32,
}

#[derive(Debug, Clone)]
struct RecentFantasy {
    key: FantasyCastKey,
    dto: TeammateFantasyState,
}

/// Publish-time buff views keyed for the snapshot payload: local-player
/// buffs, boss buffs grouped by entity, teammate buffs grouped by entity.
type BuffViews = (
    Vec<BuffUpdateState>,
    HashMap<String, Vec<BuffUpdateState>>,
    HashMap<String, Vec<BuffUpdateState>>,
);

#[derive(Debug, Default)]
struct BuffPublishFilter {
    monitor_all_local: bool,
    local_ids: HashSet<i32>,
    local_composite_members: HashSet<i32>,
    monster_global_ids: HashSet<i32>,
    monitor_all_monster_self_applied: bool,
    monster_self_applied_ids: HashSet<i32>,
    monitor_all_teammate: bool,
    teammate_any_source_ids: HashSet<i32>,
    teammate_local_source_ids: HashSet<i32>,
    teammate_self_source_ids: HashSet<i32>,
}

impl BuffPublishFilter {
    fn from_snapshot(config: &MonitorRuntimeSnapshot, composites: &BuffCompositeCatalog) -> Self {
        let local_ids: HashSet<i32> = config.skill.monitored_buff_ids.iter().copied().collect();
        let local_composite_members = local_ids
            .iter()
            .filter_map(|id| composites.get(*id))
            .flat_map(|composite| composite.members.iter().copied())
            .collect();
        Self {
            monitor_all_local: config.skill.monitor_all_buff,
            local_ids,
            local_composite_members,
            monster_global_ids: config.monster.global_ids.iter().copied().collect(),
            monitor_all_monster_self_applied: config.monster.monitor_all_self_applied,
            monster_self_applied_ids: config.monster.self_applied_ids.iter().copied().collect(),
            monitor_all_teammate: config.teammate.monitor_all,
            teammate_any_source_ids: config.teammate.any_source_ids.iter().copied().collect(),
            teammate_local_source_ids: config
                .teammate
                .local_player_source_ids
                .iter()
                .copied()
                .collect(),
            teammate_self_source_ids: config
                .teammate
                .target_self_source_ids
                .iter()
                .copied()
                .collect(),
        }
    }

    fn watches_local(&self, base_id: i32) -> bool {
        self.monitor_all_local || self.local_ids.contains(&base_id)
    }

    fn affects_local(&self, base_id: i32) -> bool {
        self.watches_local(base_id) || self.local_composite_members.contains(&base_id)
    }

    fn publishes_local_composite(&self, id: i32) -> bool {
        self.local_ids.contains(&id)
    }

    fn watches_monster(&self, base_id: i32, local_player_applied: bool) -> bool {
        self.monster_global_ids.contains(&base_id)
            || (local_player_applied
                && (self.monitor_all_monster_self_applied
                    || self.monster_self_applied_ids.contains(&base_id)))
    }

    fn watches_teammate(
        &self,
        base_id: i32,
        local_player_applied: bool,
        target_self_applied: bool,
    ) -> bool {
        self.monitor_all_teammate
            || self.teammate_any_source_ids.contains(&base_id)
            || (local_player_applied && self.teammate_local_source_ids.contains(&base_id))
            || (target_self_applied && self.teammate_self_source_ids.contains(&base_id))
    }

    fn has_teammate_watches(&self) -> bool {
        self.monitor_all_teammate
            || !self.teammate_any_source_ids.is_empty()
            || !self.teammate_local_source_ids.is_empty()
            || !self.teammate_self_source_ids.is_empty()
    }
}

/// One local-player cooldown entry plus the monotonic receipt time the
/// scheduler needs (the DTO's `received_at` is wall clock, for the HUD).
#[derive(Debug, Clone)]
pub struct SkillCdRecord {
    pub state: SkillCdState,
    pub received_mono_ms: MonoTimeMs,
}

impl SkillCdRecord {
    #[must_use]
    pub fn skill_id(&self) -> i32 {
        self.state.skill_level_id / 100
    }

    /// Charge timeline of the current `state`, using the bundled charge table.
    #[must_use]
    pub fn timeline(&self) -> skill_cd::CooldownTimeline {
        skill_cd::CooldownTimeline::new(
            &self.state,
            self.received_mono_ms,
            skill_cd::skill_charge(self.skill_id()),
        )
    }

    /// Re-derives the DTO's readiness / charge fields after `state`'s
    /// duration inputs changed.
    pub(crate) fn refresh_derived(&mut self) {
        let charge = skill_cd::skill_charge(self.skill_id());
        self.state.max_charges = charge.and_then(|charge| charge.max_charges);
        self.state.max_valid_cd_time = charge.and_then(|charge| charge.max_valid_cd_time);
        self.state.ready_at_ms = self.timeline().ready_at().map(|ready_at| {
            let offset = ready_at.0.saturating_sub(self.received_mono_ms.0);
            self.state.received_at.saturating_add(offset as i64)
        });
    }
}

/// Change counters for the state sibling projections derive from, so a
/// consumer (voice) re-reads a part only when it actually moved.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct MonitorRevisions {
    /// Local-player cooldown records.
    pub skill_cds: u64,
    /// Watched entities and anything that regroups their tracks (watch
    /// entries, the local player that owner scopes compare against).
    pub watched_entities: u64,
    /// Live boss mechanics.
    pub boss_mechanics: u64,
}

/// A live boss mechanic: the HUD DTO plus the monotonic expiry voice cues
/// are scheduled against.
#[derive(Debug, Clone)]
struct BossMechanicRecord {
    event: BossDbmEvent,
    expires_mono_ms: MonoTimeMs,
}

#[derive(Debug, Default)]
pub struct EntityMonitorProjection {
    buff_filter: BuffPublishFilter,
    buff_composites: Arc<BuffCompositeCatalog>,
    revisions: MonitorRevisions,
    /// The monster monitor is switched off: watched entities and monster
    /// skill casts are still tracked (voice cues do not follow the HUD
    /// toggle), only the HUD payload hides them.
    entity_duration_hidden: bool,
    local_player: Option<EntityRef>,
    current_target: Option<EntityRef>,
    skill_cds: HashMap<i32, SkillCdRecord>,
    monitored_panel_attr_ids: HashSet<i32>,
    panel_attrs: HashMap<i32, i32>,
    shield_current_hp: i64,
    shield_max_hp: i64,
    shield_entries: Vec<ShieldDetailEntry>,
    fight_resource_ids: Vec<i32>,
    fight_resources: HashMap<i32, i64>,
    fight_resource_received_at: i64,
    active_fantasies: HashMap<EntityUuid, FantasyCastKey>,
    recent_fantasies: VecDeque<RecentFantasy>,
    boss_mechanics: HashMap<i32, BossMechanicRecord>,
    hate_lists: HashMap<EntityUuid, Vec<HateEntryDto>>,
    stun_values: HashMap<EntityUuid, (i64, i64)>,
    hp_values: HashMap<EntityUuid, (i64, i64)>,
    player_names: HashMap<EntityUuid, String>,
    monster_ids: HashMap<EntityUuid, i32>,
    entity_duration: EntityDurationWatch,
    monster_skills: MonsterSkillWatch,
}

impl EntityMonitorProjection {
    pub fn reset_runtime(&mut self, scheduler: &mut DeadlineScheduler) {
        self.local_player = None;
        self.current_target = None;
        self.clear_local_runtime();
        self.active_fantasies.clear();
        self.recent_fantasies.clear();
        self.clear_boss_mechanics(scheduler);
        self.hate_lists.clear();
        self.stun_values.clear();
        self.hp_values.clear();
        self.player_names.clear();
        self.monster_ids.clear();
        self.entity_duration.clear();
        self.monster_skills.clear();
        bump(&mut self.revisions.watched_entities);
    }

    pub fn start_segment(&mut self, started_at_wall_ms: i64) {
        let opener_cutoff = started_at_wall_ms.saturating_sub(10_000);
        self.recent_fantasies
            .retain(|fantasy| fantasy.dto.detected_at_ms >= opener_cutoff);
    }

    pub fn clear_segment_display(&mut self) {
        self.active_fantasies.clear();
        self.recent_fantasies.clear();
    }

    #[must_use]
    pub fn displayed_fantasies(&self) -> Vec<TeammateFantasyState> {
        self.recent_fantasies
            .iter()
            .map(|fantasy| fantasy.dto.clone())
            .collect()
    }

    pub fn apply_config(
        &mut self,
        config: &MonitorRuntimeSnapshot,
        buff_composites: Arc<BuffCompositeCatalog>,
        entities: &EntityContext,
        now_mono: MonoTimeMs,
    ) {
        self.local_player = entities.local_player();
        self.current_target = entities.current_attack_target();
        self.rebuild_current_target_details(entities);
        self.monitored_panel_attr_ids.clear();
        self.monitored_panel_attr_ids
            .extend(config.skill.monitored_panel_attr_ids.iter().copied());
        self.buff_filter = BuffPublishFilter::from_snapshot(config, &buff_composites);
        self.buff_composites = buff_composites;
        self.entity_duration_hidden = !config.monster.enabled;
        self.entity_duration
            .apply_config(&config.monster, entities, now_mono);
        self.monster_skills
            .apply_config(&config.monster.watched_skill_ids);
        bump(&mut self.revisions.watched_entities);
        self.panel_attrs
            .retain(|attr_id, _| self.monitored_panel_attr_ids.contains(attr_id));
        if let Some(local) = self
            .local_player
            .and_then(|entity| entities.entity(entity.uuid))
        {
            for attr_id in &self.monitored_panel_attr_ids {
                if let Some(AttributeValue::Int(value)) = local.attributes.get(attr_id) {
                    self.panel_attrs.insert(*attr_id, *value as i32);
                }
            }
        }
    }

    /// Applies one event and reports the publication topics whose payloads
    /// could change as a result.
    pub fn apply(
        &mut self,
        envelope: &DomainEnvelope,
        entities: &EntityContext,
        scheduler: &mut DeadlineScheduler,
    ) -> TopicMask {
        match &envelope.event {
            DomainEvent::LocalPlayerChanged { .. } => {
                self.local_player = entities.local_player();
                self.clear_local_runtime();
                self.sync_current_target(entities);
                // Owner scopes compare casters against the local player.
                bump(&mut self.revisions.watched_entities);
                TopicMask::STATUS | TopicMask::MONSTER
            }
            DomainEvent::IdentityChanged {
                entity, current, ..
            } => {
                let key = entity.uuid;
                match &current.name {
                    Some(name) => {
                        self.player_names.insert(key, name.clone());
                    }
                    None => {
                        self.player_names.remove(&key);
                    }
                }
                match current.monster_id {
                    Some(monster_id) => {
                        self.monster_ids.insert(key, monster_id);
                    }
                    None => {
                        self.monster_ids.remove(&key);
                    }
                }
                let is_present = entities.entity(key).is_some_and(|state| state.is_present);
                if self.entity_duration.sync(
                    *entity,
                    current,
                    is_present,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                ) {
                    bump(&mut self.revisions.watched_entities);
                }
                let mut mask = TopicMask::MONSTER;
                for fantasy in &mut self.recent_fantasies {
                    if fantasy.key.summoner == entity.uuid {
                        fantasy.dto.summoner_name.clone_from(&current.name);
                        mask |= TopicMask::FANTASY;
                    }
                }
                mask
            }
            DomainEvent::EntityAppeared { entity, .. } => {
                self.local_player = entities.local_player();
                self.sync_current_target(entities);
                // Identity may have arrived before the appearance; re-sync so
                // the watched record reflects the now-present entity.
                let changed = entities.entity(entity.uuid).is_some_and(|state| {
                    self.entity_duration.sync(
                        *entity,
                        &state.identity,
                        state.is_present,
                        envelope.occurred_at_ms,
                        envelope.meta.mono_ms(),
                    )
                });
                if changed {
                    bump(&mut self.revisions.watched_entities);
                    TopicMask::MONSTER
                } else {
                    TopicMask::EMPTY
                }
            }
            DomainEvent::EntityDisappeared { entity } => {
                if self
                    .local_player
                    .is_some_and(|local| local.uuid == entity.uuid)
                {
                    self.clear_local_runtime();
                    bump(&mut self.revisions.watched_entities);
                }
                let had_monster_state = self.hate_lists.contains_key(&entity.uuid)
                    || self.stun_values.contains_key(&entity.uuid)
                    || self.player_names.contains_key(&entity.uuid)
                    || self.monster_ids.contains_key(&entity.uuid);
                let had_fantasy = self.active_fantasies.remove(&entity.uuid).is_some();
                self.remove_entity(entity.uuid);
                self.local_player = entities.local_player();
                self.sync_current_target(entities);
                let mut mask = TopicMask::STATUS | TopicMask::MONSTER;
                if had_monster_state {
                    mask |= TopicMask::BUFFS;
                }
                if had_fantasy {
                    mask |= TopicMask::FANTASY;
                }
                mask
            }
            DomainEvent::AttributeChanged {
                entity,
                attr_id,
                previous,
                current: AttributeValue::Int(value),
                ..
            } => {
                let mut mask = self.apply_integer_attribute(*entity, *attr_id, *value, entities);
                if *attr_id == attr_type::ATTR_ACTOR_STATE
                    && self.is_teammate_death_edge(*entity, previous.as_ref(), *value, entities)
                {
                    mask |= TopicMask::MONSTER;
                }
                mask
            }
            DomainEvent::TeamMembershipChanged { .. }
                if self.buff_filter.has_teammate_watches() =>
            {
                TopicMask::MONSTER
            }
            DomainEvent::TempAttributeChanged { entity, .. }
                if self.local_player == Some(*entity) =>
            {
                self.recalculate_skill_cds(entities);
                TopicMask::STATUS
            }
            DomainEvent::AttackTargetChanged { .. } | DomainEvent::DeathOccurred { .. } => {
                self.sync_current_target(entities);
                TopicMask::MONSTER
            }
            DomainEvent::BuffChanged(event) => {
                // Buff state lives in EntityContext; only classify whether this
                // change enters a published view.
                let roles = event.target_roles;
                let state = &event.state;
                let local_player_applied = state.source == self.local_player;
                let watched = if roles.is_local_player {
                    self.buff_filter.affects_local(state.base_id)
                } else if roles.is_current_target {
                    self.buff_filter
                        .watches_monster(state.base_id, local_player_applied)
                } else if roles.is_team_member {
                    self.buff_filter.watches_teammate(
                        state.base_id,
                        local_player_applied,
                        state.source == Some(state.target),
                    )
                } else {
                    false
                };
                if !watched {
                    TopicMask::EMPTY
                } else if roles.is_local_player {
                    TopicMask::BUFFS
                } else {
                    TopicMask::MONSTER
                }
            }
            DomainEvent::SkillCooldownUpdated { entity, cooldowns }
                if self.local_player == Some(*entity) =>
            {
                for cooldown in cooldowns {
                    let duration = cooldown.duration.unwrap_or_default();
                    let begin_time = cooldown.begin_time.unwrap_or_default();
                    // Match legacy meter: every server CD packet is authoritative
                    // (valid_cd_time may include server-side CD reduction), so reset
                    // the local interpolation clock on each upsert.
                    let (calculated_duration, cd_accelerate_rate) =
                        self.calculate_duration(cooldown.skill_level_id, duration, entities);
                    let mut record = SkillCdRecord {
                        state: SkillCdState {
                            skill_level_id: cooldown.skill_level_id,
                            begin_time,
                            duration,
                            skill_cd_type: cooldown.cooldown_type.unwrap_or_default(),
                            valid_cd_time: cooldown.valid_time.unwrap_or_default(),
                            received_at: envelope.occurred_at_ms,
                            calculated_duration,
                            cd_accelerate_rate,
                            ready_at_ms: None,
                            max_charges: None,
                            max_valid_cd_time: None,
                        },
                        received_mono_ms: envelope.meta.mono_ms(),
                    };
                    record.refresh_derived();
                    self.skill_cds.insert(cooldown.skill_level_id, record);
                }
                bump(&mut self.revisions.skill_cds);
                TopicMask::STATUS
            }
            DomainEvent::ShieldDetailsUpdated { entity, entries }
                if self.local_player == Some(*entity) =>
            {
                self.shield_entries = entries
                    .iter()
                    .map(|entry| ShieldDetailEntry {
                        buff_uuid: entry.detail.buff_instance_id,
                        display_type: entry.detail.display_type,
                        current: entry.detail.current,
                        initial_shield: entry.detail.initial,
                        max_shield: entry.detail.max,
                        base_id: entry.base_id.unwrap_or_default(),
                        expire_time_ms: entry.expires_wall_ms.unwrap_or_default(),
                    })
                    .collect();
                TopicMask::STATUS
            }
            DomainEvent::FightResourceLayoutChanged {
                entity, current, ..
            } if self.local_player == Some(*entity) => {
                self.fight_resource_ids.clone_from(current);
                self.fight_resources
                    .retain(|resource_id, _| current.contains(resource_id));
                self.fight_resource_received_at = envelope.occurred_at_ms;
                TopicMask::STATUS
            }
            DomainEvent::FightResourceChanged {
                entity,
                resource_id,
                current,
                ..
            } if self.local_player == Some(*entity) => {
                self.fight_resources.insert(*resource_id, *current);
                self.fight_resource_received_at = envelope.occurred_at_ms;
                TopicMask::STATUS
            }
            DomainEvent::FantasyChanged {
                transition,
                fantasy,
            } => match transition {
                FantasyTransition::Ended => {
                    self.active_fantasies.remove(&fantasy.summon.uuid);
                    // Buff DTOs resolve `source_remodel_level` from the fantasy
                    // registry at publish time, so a registration change can
                    // alter existing buff views on both buff topics.
                    TopicMask::FANTASY | TopicMask::BUFFS | TopicMask::MONSTER
                }
                FantasyTransition::Summoned | FantasyTransition::Updated => {
                    let summoner_name = entities
                        .entity(fantasy.summoner.uuid)
                        .and_then(|state| state.identity.name.clone());
                    let key = FantasyCastKey {
                        summoner: fantasy.summoner.uuid,
                        cast_key: fantasy.resonance_skill_id.unwrap_or(fantasy.monster_id),
                    };
                    let previous_detected_at = self
                        .recent_fantasies
                        .iter()
                        .find(|entry| entry.key == key)
                        .map(|entry| entry.dto.detected_at_ms);
                    let detected_at_ms = match transition {
                        FantasyTransition::Summoned => envelope.occurred_at_ms,
                        FantasyTransition::Updated => {
                            previous_detected_at.unwrap_or(envelope.occurred_at_ms)
                        }
                        FantasyTransition::Ended => unreachable!("handled above"),
                    };
                    self.recent_fantasies.retain(|entry| entry.key != key);
                    self.recent_fantasies.push_back(RecentFantasy {
                        key,
                        dto: TeammateFantasyState {
                            summon_uuid: fantasy.summon.uuid.0.to_string(),
                            summoner_uuid: fantasy.summoner.uuid.0.to_string(),
                            summoner_name,
                            monster_id: fantasy.monster_id,
                            resonance_skill_id: fantasy.resonance_skill_id,
                            remodel_level: fantasy.remodel_level,
                            detected_at_ms,
                        },
                    });
                    while self
                        .recent_fantasies
                        .iter()
                        .filter(|entry| entry.key.summoner == fantasy.summoner.uuid)
                        .count()
                        > 2
                    {
                        if let Some(index) = self
                            .recent_fantasies
                            .iter()
                            .position(|entry| entry.key.summoner == fantasy.summoner.uuid)
                        {
                            self.recent_fantasies.remove(index);
                        }
                    }
                    self.active_fantasies.insert(fantasy.summon.uuid, key);
                    TopicMask::FANTASY | TopicMask::BUFFS | TopicMask::MONSTER
                }
            },
            DomainEvent::BossMechanicStarted(mechanic) => {
                self.boss_mechanics.insert(
                    mechanic.base_skill_id,
                    BossMechanicRecord {
                        event: BossDbmEvent {
                            skill_effect_id: mechanic.skill_effect_id,
                            base_skill_id: mechanic.base_skill_id,
                            duration_ms: mechanic.duration_ms.min(i32::MAX as u64) as i32,
                            create_time_ms: envelope.occurred_at_ms,
                            insertion: mechanic.insertion,
                            server_timestamp_ms: mechanic.server_timestamp_ms,
                        },
                        expires_mono_ms: mechanic.expires_mono_ms,
                    },
                );
                scheduler.schedule(
                    boss_deadline_key(mechanic.base_skill_id),
                    TimerScope::Runtime,
                    mechanic.expires_mono_ms,
                    TimerTask::BossDbmExpiry,
                );
                bump(&mut self.revisions.boss_mechanics);
                TopicMask::MONSTER
            }
            DomainEvent::DeadlineReached { key, .. } => {
                if let TimerKey::BossDbmExpiry { base_skill_id } = key {
                    if self.boss_mechanics.remove(base_skill_id).is_some() {
                        bump(&mut self.revisions.boss_mechanics);
                    }
                    TopicMask::MONSTER
                } else {
                    TopicMask::EMPTY
                }
            }
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase: SkillPhase::CastStarted | SkillPhase::Observed,
                ..
            } => {
                if self.monster_skills.observe(
                    entities,
                    caster.uuid,
                    *skill_id,
                    envelope.occurred_at_ms,
                ) {
                    TopicMask::MONSTER
                } else {
                    TopicMask::EMPTY
                }
            }
            DomainEvent::HateListUpdated { entity, entries } => {
                if self.current_target == Some(*entity) {
                    self.set_hate_list(entity.uuid, entries);
                    TopicMask::MONSTER
                } else {
                    TopicMask::EMPTY
                }
            }
            DomainEvent::SceneChanged { .. } => {
                self.clear_boss_mechanics(scheduler);
                self.monster_skills.clear();
                self.hate_lists.clear();
                self.stun_values.clear();
                self.hp_values.clear();
                TopicMask::MONSTER
            }
            _ => TopicMask::EMPTY,
        }
    }

    #[must_use]
    pub fn snapshot(&self, entities: &EntityContext) -> EntityMonitorSnapshot {
        let (local_buffs, boss_buffs, teammate_buffs) = self.buff_views(entities);
        let mut panel_attrs = self
            .panel_attrs
            .iter()
            .map(|(attr_id, value)| PanelAttrState {
                attr_id: *attr_id,
                value: *value,
            })
            .collect::<Vec<_>>();
        panel_attrs.sort_unstable_by_key(|entry| entry.attr_id);

        let mut stun = self
            .current_target
            .and_then(|target| {
                let (current, max) = self.stun_values.get(&target.uuid)?;
                let monster_id = self.monster_ids.get(&target.uuid)?;
                (*max > 0).then(|| StunEntry {
                    boss_entity_uuid: target.uuid.0.to_string(),
                    monster_id: *monster_id,
                    current: *current,
                    max: *max,
                })
            })
            .into_iter()
            .collect::<Vec<_>>();
        stun.sort_unstable_by(|left, right| left.boss_entity_uuid.cmp(&right.boss_entity_uuid));

        let hp = self
            .current_target
            .and_then(|target| {
                let (current, max) = self.hp_values.get(&target.uuid)?;
                let monster_id = self.monster_ids.get(&target.uuid)?;
                (*max > 0).then(|| HpEntry {
                    boss_entity_uuid: target.uuid.0.to_string(),
                    monster_id: *monster_id,
                    current: *current,
                    max: *max,
                })
            })
            .into_iter()
            .collect::<Vec<_>>();

        let mut skill_cds = self
            .skill_cds
            .values()
            .map(|record| record.state.clone())
            .collect::<Vec<_>>();
        // Ascending received_at so frontend last-wins map keeps the newest entry
        // when multiple level IDs share the same base skill id.
        skill_cds.sort_unstable_by_key(|cd| cd.received_at);

        EntityMonitorSnapshot {
            local_buffs,
            boss_buffs,
            teammate_buffs,
            dead_teammates: self.dead_teammates(entities),
            skill_cds,
            panel_attrs,
            shield_current_hp: self.shield_current_hp,
            shield_max_hp: self.shield_max_hp,
            shield_entries: self.shield_entries.clone(),
            fight_resource: (!self.fight_resource_ids.is_empty()).then(|| FightResourceState {
                entries: self
                    .fight_resource_ids
                    .iter()
                    .map(|resource_id| FightResourceEntry {
                        id: *resource_id,
                        value: self
                            .fight_resources
                            .get(resource_id)
                            .copied()
                            .unwrap_or_default(),
                    })
                    .collect(),
                received_at: self.fight_resource_received_at,
            }),
            teammate_fantasies: self.displayed_fantasies(),
            boss_mechanics: self
                .boss_mechanics
                .values()
                .map(|record| record.event.clone())
                .collect(),
            hate_lists: self
                .current_target
                .and_then(|target| {
                    self.hate_lists
                        .get(&target.uuid)
                        .filter(|entries| !entries.is_empty())
                        .map(|entries| (target.uuid.0.to_string(), entries.clone()))
                })
                .into_iter()
                .collect(),
            stun,
            hp,
            player_names: self
                .player_names
                .iter()
                .map(|(entity, name)| (entity.0.to_string(), name.clone()))
                .collect(),
            monster_ids: self
                .monster_ids
                .iter()
                .map(|(entity, monster_id)| (entity.0.to_string(), *monster_id))
                .collect(),
            entity_duration_tracks: if self.entity_duration_hidden {
                Vec::new()
            } else {
                self.entity_duration.track_states(entities)
            },
            monster_skill_casts: if self.entity_duration_hidden {
                Vec::new()
            } else {
                self.monster_skills.states()
            },
        }
    }

    fn is_teammate_death_edge(
        &self,
        entity: EntityRef,
        previous: Option<&AttributeValue>,
        current: i64,
        entities: &EntityContext,
    ) -> bool {
        if is_dead_actor_state(previous) == (current == attr_type::ACTOR_STATE_DEAD)
            || !self.buff_filter.has_teammate_watches()
        {
            return false;
        }
        let roles = entities.roles(entity.uuid);
        roles.is_team_member && !roles.is_local_player
    }

    fn dead_teammates(&self, entities: &EntityContext) -> Vec<String> {
        if !self.buff_filter.has_teammate_watches() {
            return Vec::new();
        }
        let local = entities.local_player().map(|entity| entity.uuid);
        let mut dead: Vec<EntityUuid> = entities
            .team_members()
            .filter(|uuid| Some(*uuid) != local)
            .filter(|uuid| {
                entities
                    .entity(*uuid)
                    .is_some_and(|state| state.is_present && state.is_dead)
            })
            .collect();
        dead.sort_unstable();
        dead.into_iter().map(|uuid| uuid.0.to_string()).collect()
    }

    fn clear_local_runtime(&mut self) {
        self.skill_cds.clear();
        bump(&mut self.revisions.skill_cds);
        self.panel_attrs.clear();
        self.shield_current_hp = 0;
        self.shield_max_hp = 0;
        self.shield_entries.clear();
        self.fight_resource_ids.clear();
        self.fight_resources.clear();
        self.fight_resource_received_at = 0;
    }

    fn remove_entity(&mut self, entity: EntityUuid) {
        if self.entity_duration.remove(entity) {
            bump(&mut self.revisions.watched_entities);
        }
        self.active_fantasies.remove(&entity);
        self.hate_lists.remove(&entity);
        self.stun_values.remove(&entity);
        self.hp_values.remove(&entity);
        self.player_names.remove(&entity);
        self.monster_ids.remove(&entity);
    }

    fn clear_boss_mechanics(&mut self, scheduler: &mut DeadlineScheduler) {
        for base_skill_id in self.boss_mechanics.keys().copied() {
            scheduler.cancel(boss_deadline_key(base_skill_id));
        }
        self.boss_mechanics.clear();
        bump(&mut self.revisions.boss_mechanics);
    }

    /// Re-reads the current attack target from the context, returning whether
    /// the tracked target changed.
    fn sync_current_target(&mut self, entities: &EntityContext) -> bool {
        let current = entities.current_attack_target();
        if self.current_target == current {
            return false;
        }
        self.current_target = current;
        self.rebuild_current_target_details(entities);
        true
    }

    fn rebuild_current_target_details(&mut self, entities: &EntityContext) {
        self.hate_lists.clear();
        self.stun_values.clear();
        self.hp_values.clear();
        let Some(target) = self.current_target else {
            return;
        };
        let Some(state) = entities.entity(target.uuid) else {
            return;
        };
        self.set_hate_list(target.uuid, &state.hate_entries);
        let current = integer_attr(&state.attributes, attr_type::ATTR_CURRENT_STUNNED);
        let max = integer_attr(&state.attributes, attr_type::ATTR_MAX_STUNNED);
        if current != 0 || max != 0 {
            self.stun_values.insert(target.uuid, (current, max));
        }
        let current_hp = integer_attr(&state.attributes, attr_type::ATTR_CURRENT_HP);
        let max_hp = integer_attr(&state.attributes, attr_type::ATTR_MAX_HP);
        if current_hp != 0 || max_hp != 0 {
            self.hp_values.insert(target.uuid, (current_hp, max_hp));
        }
    }

    fn set_hate_list(
        &mut self,
        entity: EntityUuid,
        entries: &[crate::live::runtime::events::HateEntry],
    ) {
        if entries.is_empty() {
            self.hate_lists.remove(&entity);
            return;
        }
        self.hate_lists.insert(
            entity,
            entries
                .iter()
                .map(|entry| HateEntryDto {
                    entity_uuid: entry.entity_uuid.0.to_string(),
                    hate_val: entry.value,
                })
                .collect(),
        );
    }

    pub(crate) fn apply_integer_attribute(
        &mut self,
        entity: EntityRef,
        attr_id: i32,
        value: i64,
        entities: &EntityContext,
    ) -> TopicMask {
        let mut mask = TopicMask::EMPTY;
        if self.local_player == Some(entity) {
            if self.monitored_panel_attr_ids.contains(&attr_id) {
                self.panel_attrs.insert(attr_id, value as i32);
                mask |= TopicMask::STATUS;
            }
            match attr_id {
                attr_type::ATTR_CURRENT_HP => {
                    self.shield_current_hp = value;
                    mask |= TopicMask::STATUS;
                }
                attr_type::ATTR_MAX_HP => {
                    self.shield_max_hp = value;
                    mask |= TopicMask::STATUS;
                }
                _ => {}
            }
            if CD_PANEL_ATTRS.contains(&attr_id) {
                self.recalculate_skill_cds(entities);
                mask |= TopicMask::STATUS;
            }
        }
        if self.current_target == Some(entity) {
            if matches!(
                attr_id,
                attr_type::ATTR_CURRENT_STUNNED | attr_type::ATTR_MAX_STUNNED
            ) {
                let stun = self.stun_values.entry(entity.uuid).or_default();
                match attr_id {
                    attr_type::ATTR_CURRENT_STUNNED => stun.0 = value,
                    attr_type::ATTR_MAX_STUNNED => stun.1 = value,
                    _ => unreachable!("filtered above"),
                }
                mask |= TopicMask::MONSTER;
            } else if matches!(attr_id, attr_type::ATTR_CURRENT_HP | attr_type::ATTR_MAX_HP) {
                let hp = self.hp_values.entry(entity.uuid).or_default();
                match attr_id {
                    attr_type::ATTR_CURRENT_HP => hp.0 = value,
                    attr_type::ATTR_MAX_HP => hp.1 = value,
                    _ => unreachable!("filtered above"),
                }
                mask |= TopicMask::MONSTER;
            }
        }
        mask
    }

    fn recalculate_skill_cds(&mut self, entities: &EntityContext) {
        let Some(local) = self.local_player else {
            return;
        };
        let (attr_skill_cd, attr_skill_cd_pct, attr_cd_accelerate_pct, temp_attrs) =
            cd_inputs(entities, local.uuid);
        for record in self.skill_cds.values_mut() {
            let cd = &mut record.state;
            if cd.duration > 0 {
                let (calculated_duration, cd_accelerate_rate) = skill_cd::calculate_skill_cd(
                    cd.duration as f32,
                    cd.skill_level_id,
                    &temp_attrs,
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
            record.refresh_derived();
        }
        bump(&mut self.revisions.skill_cds);
    }

    /// Change counters of the state below, for sibling projections (voice).
    pub(crate) const fn revisions(&self) -> MonitorRevisions {
        self.revisions
    }

    /// Local-player cooldown records, for sibling projections (voice).
    pub(crate) fn skill_cooldowns(&self) -> impl Iterator<Item = &SkillCdRecord> {
        self.skill_cds.values()
    }

    /// The entity-duration watch list, for sibling projections (voice).
    pub(crate) fn entity_duration(&self) -> &EntityDurationWatch {
        &self.entity_duration
    }

    /// When the live mechanic `base_skill_id` expires, for sibling
    /// projections (voice).
    pub(crate) fn boss_mechanic_expiry(&self, base_skill_id: i32) -> Option<MonoTimeMs> {
        self.boss_mechanics
            .get(&base_skill_id)
            .map(|record| record.expires_mono_ms)
    }

    #[cfg(test)]
    pub(crate) fn set_local_player_for_test(&mut self, entity: EntityRef) {
        self.local_player = Some(entity);
    }

    #[cfg(test)]
    pub(crate) fn set_current_target_for_test(&mut self, entity: EntityRef) {
        self.current_target = Some(entity);
    }

    #[cfg(test)]
    pub(crate) fn monitor_panel_attr_for_test(&mut self, attr_id: i32) {
        self.monitored_panel_attr_ids.insert(attr_id);
    }

    fn calculate_duration(
        &self,
        skill_level_id: i32,
        duration: i32,
        entities: &EntityContext,
    ) -> (i32, f32) {
        if duration <= 0 {
            return (duration, 0.0);
        }
        let Some(local) = self.local_player else {
            return (duration, 0.0);
        };
        let (attr_skill_cd, attr_skill_cd_pct, attr_cd_accelerate_pct, temp_attrs) =
            cd_inputs(entities, local.uuid);
        let (calculated_duration, cd_accelerate_rate) = skill_cd::calculate_skill_cd(
            duration as f32,
            skill_level_id,
            &temp_attrs,
            attr_skill_cd,
            attr_skill_cd_pct,
            attr_cd_accelerate_pct,
        );
        (calculated_duration.round() as i32, cd_accelerate_rate)
    }

    /// Computes the filtered buff views from the entity context at publish
    /// time. Legacy parity (`build_snapshots_for_kind` per emit cycle):
    /// classification reads live roles, and "applied by the player" compares
    /// the buff's raw source — a summon/fantasy owned by a player does not
    /// count as player-applied for display.
    fn buff_views(&self, entities: &EntityContext) -> BuffViews {
        let local_player = entities.local_player();
        let current_target = entities.current_attack_target();
        let mut local_buffs = Vec::new();
        let mut boss_buffs: HashMap<String, Vec<BuffUpdateState>> = HashMap::new();
        let mut teammate_buffs: HashMap<String, Vec<BuffUpdateState>> = HashMap::new();

        for entity in entities.entities() {
            if entity.active_buffs.is_empty() {
                continue;
            }
            let target = entity.entity;
            let is_local = local_player == Some(target);
            let is_current_target = current_target == Some(target);
            let is_teammate = entities.roles(target.uuid).is_team_member;
            if !is_local && !is_current_target && !is_teammate {
                continue;
            }

            if is_local {
                for composite in self.buff_composites.iter() {
                    if !self.buff_filter.publishes_local_composite(composite.id) {
                        continue;
                    }
                    if let Some(presence) = composite.presence(entity.active_buffs.values()) {
                        local_buffs.push(composite_dto(composite.id, presence));
                    }
                }
            }

            for state in entity.active_buffs.values() {
                if is_local {
                    if self.buff_filter.watches_local(state.base_id) {
                        local_buffs.push(buff_dto(state, entities));
                    }
                    continue;
                }

                if is_current_target {
                    let local_player_applied = state.source == local_player;
                    let watched = self
                        .buff_filter
                        .watches_monster(state.base_id, local_player_applied);
                    if watched {
                        boss_buffs
                            .entry(target.uuid.0.to_string())
                            .or_default()
                            .push(buff_dto(state, entities));
                    }
                    continue;
                }

                let watched = self.buff_filter.watches_teammate(
                    state.base_id,
                    state.source == local_player,
                    state.source == Some(target),
                );
                if watched {
                    teammate_buffs
                        .entry(target.uuid.0.to_string())
                        .or_default()
                        .push(buff_dto(state, entities));
                }
            }
        }

        local_buffs.sort_unstable_by_key(|buff| (buff.base_id, buff.create_time_ms));
        for buffs in boss_buffs.values_mut().chain(teammate_buffs.values_mut()) {
            buffs.sort_unstable_by_key(|buff| (buff.base_id, buff.create_time_ms));
        }
        (local_buffs, boss_buffs, teammate_buffs)
    }
}

fn buff_dto(state: &BuffState, entities: &EntityContext) -> BuffUpdateState {
    // Resolved at publish time so a fantasy registered after the buff was
    // applied still yields the remodel level (legacy publish-time registry
    // lookup).
    let source_remodel_level = entities.resolve_fantasy_remodel_level(
        state.source.map(|source| source.uuid),
        state.source_config_id,
    );
    timed_buff_dto(state, state.base_id, state.layer, source_remodel_level)
}

/// A composite counts down with the member that expires first.
fn composite_dto(id: i32, presence: BuffPresence<'_>) -> BuffUpdateState {
    timed_buff_dto(presence.timing, id, presence.layer, None)
}

fn timed_buff_dto(
    timing: &BuffState,
    base_id: i32,
    layer: i32,
    source_remodel_level: Option<i64>,
) -> BuffUpdateState {
    BuffUpdateState {
        base_id,
        layer,
        duration_ms: timing.duration_ms.unwrap_or_default().min(i32::MAX as u64) as i32,
        create_time_ms: timing.started_wall_ms.unwrap_or_default(),
        source_remodel_level,
    }
}

fn cd_inputs(entities: &EntityContext, uuid: EntityUuid) -> (f32, f32, f32, HashMap<i32, i32>) {
    let Some(state) = entities.entity(uuid) else {
        return (0.0, 0.0, 0.0, HashMap::new());
    };
    let attr_skill_cd = int_attr(&state.attributes, attr_type::ATTR_SKILL_CD);
    let attr_skill_cd_pct = int_attr(&state.attributes, attr_type::ATTR_SKILL_CD_PCT);
    let attr_cd_accelerate_pct = int_attr(&state.attributes, attr_type::ATTR_CD_ACCELERATE_PCT);
    (
        attr_skill_cd,
        attr_skill_cd_pct,
        attr_cd_accelerate_pct,
        state.temp_attributes.clone(),
    )
}

fn is_dead_actor_state(value: Option<&AttributeValue>) -> bool {
    matches!(value, Some(AttributeValue::Int(state)) if *state == attr_type::ACTOR_STATE_DEAD)
}

fn integer_attr(attributes: &HashMap<i32, AttributeValue>, attr_id: i32) -> i64 {
    match attributes.get(&attr_id) {
        Some(AttributeValue::Int(value)) => *value,
        _ => 0,
    }
}

fn int_attr(attributes: &HashMap<i32, AttributeValue>, attr_id: i32) -> f32 {
    match attributes.get(&attr_id) {
        Some(AttributeValue::Int(value)) => *value as f32,
        _ => 0.0,
    }
}

fn boss_deadline_key(base_skill_id: i32) -> TimerKey {
    TimerKey::BossDbmExpiry { base_skill_id }
}

fn bump(revision: &mut u64) {
    *revision = revision.wrapping_add(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::team_roster::test_support::{joined_team, player};
    use std::sync::Arc;

    use crate::live::runtime::events::{
        BatchId, EventMeta, FantasyState, ObservationOrigin, ObservedBuff, ObservedBuffChange,
        ProtocolBatch, ProtocolObservation, SegmentId, SkillCooldownState,
    };

    fn meta(sequence: u64, occurred_at_ms: i64) -> EventMeta {
        EventMeta {
            batch_id: BatchId(sequence),
            capture_sequence: sequence,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: occurred_at_ms,
            captured_mono_ns: u64::try_from(occurred_at_ms).unwrap_or_default() * 1_000_000,
            source_time_ms: None,
        }
    }

    fn envelope(sequence: u64, occurred_at_ms: i64, event: DomainEvent) -> DomainEnvelope {
        let meta = meta(sequence, occurred_at_ms);
        DomainEnvelope {
            sequence,
            batch_id: meta.batch_id,
            occurred_at_ms,
            meta,
            event_index: 0,
            segment_id: Some(SegmentId(1)),
            event,
        }
    }

    fn fantasy_event(
        sequence: u64,
        occurred_at_ms: i64,
        transition: FantasyTransition,
        summon_uuid: i64,
    ) -> DomainEnvelope {
        envelope(
            sequence,
            occurred_at_ms,
            DomainEvent::FantasyChanged {
                transition,
                fantasy: FantasyState {
                    summon: EntityRef {
                        uuid: EntityUuid(summon_uuid),
                        generation: 1,
                    },
                    summoner: EntityRef {
                        uuid: EntityUuid(10),
                        generation: 1,
                    },
                    monster_id: 900,
                    remodel_level: 2,
                    resonance_skill_id: Some(77),
                },
            },
        )
    }

    fn local_ref() -> EntityRef {
        EntityRef {
            uuid: EntityUuid(10),
            generation: 1,
        }
    }

    fn observed_buff(instance_id: i64, target: EntityUuid) -> ObservedBuff {
        ObservedBuff {
            instance_id,
            base_id: 77,
            layer: 1,
            source_uuid: Some(target),
            source_config_id: None,
            duration_ms: Some(5_000),
            started_wall_ms: Some(1_000),
            expires_wall_ms: Some(6_000),
            started_mono_ms: Some(crate::live::runtime::events::MonoTimeMs(1_000)),
            expires_mono_ms: Some(crate::live::runtime::events::MonoTimeMs(6_000)),
            effect_ids: Arc::from([]),
        }
    }

    fn apply_observations(
        projection: &mut EntityMonitorProjection,
        entities: &mut EntityContext,
        scheduler: &mut DeadlineScheduler,
        sequence: u64,
        observations: Vec<ProtocolObservation>,
    ) -> TopicMask {
        let events = entities.apply_batch(ProtocolBatch {
            meta: meta(sequence, sequence as i64 * 1_000),
            observations,
        });
        events.iter().fold(TopicMask::EMPTY, |mask, event| {
            mask | projection.apply(event, entities, scheduler)
        })
    }

    fn seed_local_player(
        projection: &mut EntityMonitorProjection,
        entities: &mut EntityContext,
        scheduler: &mut DeadlineScheduler,
    ) {
        let local = local_ref();
        entities.apply_batch(ProtocolBatch {
            meta: meta(1, 1_000),
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local.uuid,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(local.uuid),
                },
            ],
        });
        // EntityContext assigns generation; mirror that into the projection local ref.
        let resolved = entities
            .entity(local.uuid)
            .map(|state| state.entity)
            .unwrap_or(local);
        projection.apply(
            &envelope(
                1,
                1_000,
                DomainEvent::LocalPlayerChanged {
                    previous: None,
                    current: Some(resolved),
                },
            ),
            entities,
            scheduler,
        );
    }

    #[test]
    fn replay_of_same_cast_key_refreshes_detection_time_but_update_does_not() {
        let mut projection = EntityMonitorProjection::default();
        let entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();

        projection.apply(
            &fantasy_event(1, 1_000, FantasyTransition::Summoned, 20),
            &entities,
            &mut scheduler,
        );
        projection.apply(
            &fantasy_event(2, 1_500, FantasyTransition::Updated, 20),
            &entities,
            &mut scheduler,
        );
        assert_eq!(
            projection.snapshot(&entities).teammate_fantasies[0].detected_at_ms,
            1_000
        );

        projection.apply(
            &fantasy_event(3, 2_000, FantasyTransition::Summoned, 21),
            &entities,
            &mut scheduler,
        );
        let fantasies = projection.snapshot(&entities).teammate_fantasies;
        assert_eq!(fantasies.len(), 1);
        assert_eq!(fantasies[0].detected_at_ms, 2_000);
    }

    #[test]
    fn skill_cooldown_updates_merge_incrementally_and_refresh_received_at() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        let local = entities
            .entity(EntityUuid(10))
            .map(|state| state.entity)
            .unwrap();

        projection.apply(
            &envelope(
                2,
                2_000,
                DomainEvent::SkillCooldownUpdated {
                    entity: local,
                    cooldowns: vec![SkillCooldownState {
                        skill_level_id: 12_301,
                        begin_time: Some(1_000),
                        duration: Some(10_000),
                        cooldown_type: Some(0),
                        valid_time: Some(0),
                    }],
                },
            ),
            &entities,
            &mut scheduler,
        );
        projection.apply(
            &envelope(
                3,
                3_000,
                DomainEvent::SkillCooldownUpdated {
                    entity: local,
                    cooldowns: vec![SkillCooldownState {
                        skill_level_id: 45_601,
                        begin_time: Some(2_000),
                        duration: Some(8_000),
                        cooldown_type: Some(0),
                        valid_time: Some(0),
                    }],
                },
            ),
            &entities,
            &mut scheduler,
        );
        assert_eq!(projection.snapshot(&entities).skill_cds.len(), 2);

        projection.apply(
            &envelope(
                4,
                4_000,
                DomainEvent::SkillCooldownUpdated {
                    entity: local,
                    cooldowns: vec![SkillCooldownState {
                        skill_level_id: 12_301,
                        begin_time: Some(1_000),
                        duration: Some(10_000),
                        cooldown_type: Some(0),
                        valid_time: Some(100),
                    }],
                },
            ),
            &entities,
            &mut scheduler,
        );
        let cds = projection.snapshot(&entities).skill_cds;
        let skill_a = cds
            .iter()
            .find(|cd| cd.skill_level_id == 12_301)
            .expect("skill A");
        // Server valid_cd_time is authoritative; refresh local clock each packet.
        assert_eq!(skill_a.received_at, 4_000);
        assert_eq!(skill_a.valid_cd_time, 100);
        assert!(cds.iter().any(|cd| cd.skill_level_id == 45_601));
    }

    #[test]
    fn skill_cooldown_uses_panel_cd_attrs_and_recalculates_on_change() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        let local = entities
            .entity(EntityUuid(10))
            .map(|state| state.entity)
            .unwrap();

        // 10% panel CD pct: 1000 / 10000.
        entities.apply_batch(ProtocolBatch {
            meta: meta(10, 1_500),
            observations: vec![ProtocolObservation::AttributeUpdated {
                uuid: local.uuid,
                attr_id: attr_type::ATTR_SKILL_CD_PCT,
                value: AttributeValue::Int(1_000),
                origin: ObservationOrigin::Delta,
            }],
        });
        projection.apply(
            &envelope(
                10,
                1_500,
                DomainEvent::AttributeChanged {
                    entity: local,
                    attr_id: attr_type::ATTR_SKILL_CD_PCT,
                    previous: None,
                    current: AttributeValue::Int(1_000),
                    is_baseline: false,
                },
            ),
            &entities,
            &mut scheduler,
        );

        projection.apply(
            &envelope(
                11,
                2_000,
                DomainEvent::SkillCooldownUpdated {
                    entity: local,
                    cooldowns: vec![SkillCooldownState {
                        skill_level_id: 12_301,
                        begin_time: Some(1_000),
                        duration: Some(10_000),
                        cooldown_type: Some(0),
                        valid_time: Some(0),
                    }],
                },
            ),
            &entities,
            &mut scheduler,
        );
        let first = projection.snapshot(&entities).skill_cds[0].calculated_duration;
        // (1 - 0.1) * 10000 = 9000
        assert_eq!(first, 9_000);

        entities.apply_batch(ProtocolBatch {
            meta: meta(12, 2_500),
            observations: vec![ProtocolObservation::AttributeUpdated {
                uuid: local.uuid,
                attr_id: attr_type::ATTR_SKILL_CD_PCT,
                value: AttributeValue::Int(2_000),
                origin: ObservationOrigin::Delta,
            }],
        });
        projection.apply(
            &envelope(
                12,
                2_500,
                DomainEvent::AttributeChanged {
                    entity: local,
                    attr_id: attr_type::ATTR_SKILL_CD_PCT,
                    previous: Some(AttributeValue::Int(1_000)),
                    current: AttributeValue::Int(2_000),
                    is_baseline: false,
                },
            ),
            &entities,
            &mut scheduler,
        );
        let second = projection.snapshot(&entities).skill_cds[0].calculated_duration;
        // (1 - 0.2) * 10000 = 8000
        assert_eq!(second, 8_000);
    }

    #[test]
    fn temp_attribute_change_triggers_skill_cd_recalculation() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        let local = entities
            .entity(EntityUuid(10))
            .map(|state| state.entity)
            .unwrap();

        projection.apply(
            &envelope(
                2,
                2_000,
                DomainEvent::SkillCooldownUpdated {
                    entity: local,
                    cooldowns: vec![SkillCooldownState {
                        skill_level_id: 12_301,
                        begin_time: Some(1_000),
                        duration: Some(10_000),
                        cooldown_type: Some(0),
                        valid_time: Some(0),
                    }],
                },
            ),
            &entities,
            &mut scheduler,
        );
        assert_eq!(
            projection.snapshot(&entities).skill_cds[0].calculated_duration,
            10_000
        );

        // Unknown temp-attr id still exercises the recalculation path.
        entities.apply_batch(ProtocolBatch {
            meta: meta(3, 3_000),
            observations: vec![ProtocolObservation::TempAttributeUpdated {
                entity_uuid: local.uuid,
                attr_id: 9_999_001,
                value: 0,
                origin: ObservationOrigin::Delta,
            }],
        });
        projection.apply(
            &envelope(
                3,
                3_000,
                DomainEvent::TempAttributeChanged {
                    entity: local,
                    attr_id: 9_999_001,
                    previous: None,
                    current: 0,
                    is_baseline: false,
                },
            ),
            &entities,
            &mut scheduler,
        );
        assert_eq!(
            projection.snapshot(&entities).skill_cds[0].calculated_duration,
            10_000
        );
    }

    #[test]
    fn config_filters_local_buffs_on_next_snapshot() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(10),
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(EntityUuid(10)),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: EntityUuid(10),
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(1, EntityUuid(10)),
                    },
                },
            ],
        );
        assert!(projection.snapshot(&entities).local_buffs.is_empty());

        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitor_all_buff = true;
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));
        assert_eq!(projection.snapshot(&entities).local_buffs.len(), 1);

        projection.apply_config(
            &MonitorRuntimeSnapshot::default(),
            Arc::default(),
            &entities,
            MonoTimeMs(0),
        );
        assert!(projection.snapshot(&entities).local_buffs.is_empty());
    }

    #[test]
    fn timeline_only_buff_is_not_published_as_local_buff() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let mut timeline_only = observed_buff(2, EntityUuid(10));
        timeline_only.base_id = 88;
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(10),
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(EntityUuid(10)),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: EntityUuid(10),
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(1, EntityUuid(10)),
                    },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: EntityUuid(10),
                    change: ObservedBuffChange::Applied {
                        buff: timeline_only,
                    },
                },
            ],
        );

        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitored_buff_ids.push(77);
        config.skill.buff_timeline_ids.push(88);
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));

        let local_buffs = &projection.snapshot(&entities).local_buffs;
        assert_eq!(local_buffs.len(), 1);
        assert_eq!(local_buffs[0].base_id, 77);
    }

    #[test]
    fn unwatched_local_buff_does_not_dirty_buff_topic() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitored_buff_ids.push(77);
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));

        let mut unwatched = observed_buff(1, EntityUuid(10));
        unwatched.base_id = 88;
        let events = entities.apply_batch(ProtocolBatch {
            meta: meta(2, 2_000),
            observations: vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(10),
                change: ObservedBuffChange::Applied { buff: unwatched },
            }],
        });
        let mask = events.into_iter().fold(TopicMask::EMPTY, |mask, event| {
            mask | projection.apply(&event, &entities, &mut scheduler)
        });
        assert_eq!(mask, TopicMask::EMPTY);

        let events = entities.apply_batch(ProtocolBatch {
            meta: meta(3, 3_000),
            observations: vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(10),
                change: ObservedBuffChange::Applied {
                    buff: observed_buff(2, EntityUuid(10)),
                },
            }],
        });
        let mask = events.into_iter().fold(TopicMask::EMPTY, |mask, event| {
            mask | projection.apply(&event, &entities, &mut scheduler)
        });
        assert_eq!(mask, TopicMask::BUFFS);
    }

    fn composite_catalog() -> Arc<BuffCompositeCatalog> {
        Arc::new(BuffCompositeCatalog::from_specs(&[
            crate::live::bootstrap_snapshot::BuffCompositeSpec {
                id: -1,
                member_ids: vec![77, 78],
                min_active: None,
            },
        ]))
    }

    fn apply_local_buffs(
        projection: &mut EntityMonitorProjection,
        entities: &mut EntityContext,
        scheduler: &mut DeadlineScheduler,
        sequence: u64,
        buffs: Vec<ObservedBuff>,
    ) -> TopicMask {
        let events = entities.apply_batch(ProtocolBatch {
            meta: meta(sequence, sequence as i64 * 1_000),
            observations: buffs
                .into_iter()
                .map(|buff| ProtocolObservation::BuffChanged {
                    target_uuid: EntityUuid(10),
                    change: ObservedBuffChange::Applied { buff },
                })
                .collect(),
        });
        events.into_iter().fold(TopicMask::EMPTY, |mask, event| {
            mask | projection.apply(&event, entities, scheduler)
        })
    }

    #[test]
    fn subscribed_composite_is_published_only_while_every_member_is_present() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitored_buff_ids.push(-1);
        projection.apply_config(&config, composite_catalog(), &entities, MonoTimeMs(0));

        let first = observed_buff(1, EntityUuid(10));
        apply_local_buffs(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![first],
        );
        assert!(projection.snapshot(&entities).local_buffs.is_empty());

        let mut second = observed_buff(2, EntityUuid(10));
        second.base_id = 78;
        second.layer = 3;
        second.duration_ms = Some(2_000);
        second.started_wall_ms = Some(2_000);
        second.expires_mono_ms = Some(MonoTimeMs(4_000));
        apply_local_buffs(
            &mut projection,
            &mut entities,
            &mut scheduler,
            3,
            vec![second],
        );

        // Members are not published for the composite's sake; the composite
        // counts down with the member expiring first and the lowest layer.
        let local_buffs = projection.snapshot(&entities).local_buffs;
        assert_eq!(local_buffs.len(), 1);
        assert_eq!(local_buffs[0].base_id, -1);
        assert_eq!(local_buffs[0].layer, 1);
        assert_eq!(local_buffs[0].duration_ms, 2_000);
        assert_eq!(local_buffs[0].create_time_ms, 2_000);
        assert_eq!(local_buffs[0].source_remodel_level, None);
    }

    #[test]
    fn composite_members_dirty_the_buff_topic_only_while_subscribed() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        projection.apply_config(
            &MonitorRuntimeSnapshot::default(),
            composite_catalog(),
            &entities,
            MonoTimeMs(0),
        );
        let mut member = observed_buff(1, EntityUuid(10));
        member.base_id = 78;
        let mask = apply_local_buffs(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![member.clone()],
        );
        assert_eq!(mask, TopicMask::EMPTY);

        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitored_buff_ids.push(-1);
        projection.apply_config(&config, composite_catalog(), &entities, MonoTimeMs(0));
        member.instance_id = 2;
        let mask = apply_local_buffs(
            &mut projection,
            &mut entities,
            &mut scheduler,
            3,
            vec![member],
        );
        assert_eq!(mask, TopicMask::BUFFS);
    }

    #[test]
    fn monitor_all_does_not_publish_unsubscribed_composites() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);
        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitor_all_buff = true;
        projection.apply_config(&config, composite_catalog(), &entities, MonoTimeMs(0));
        let mut second = observed_buff(2, EntityUuid(10));
        second.base_id = 78;
        apply_local_buffs(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![observed_buff(1, EntityUuid(10)), second],
        );

        let mut ids = projection
            .snapshot(&entities)
            .local_buffs
            .iter()
            .map(|buff| buff.base_id)
            .collect::<Vec<_>>();
        ids.sort_unstable();
        assert_eq!(ids, vec![77, 78]);
    }

    #[test]
    fn remodel_level_is_resolved_from_fantasy_registry_at_publish_time() {
        use crate::live::runtime::events::{EntityIdentityPatch, FieldPatch};

        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let summon = EntityUuid(11);
        let mut buff = observed_buff(1, local);
        buff.source_uuid = Some(summon);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: summon,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::BuffChanged {
                    target_uuid: local,
                    change: ObservedBuffChange::Applied { buff },
                },
            ],
        );

        let mut config = MonitorRuntimeSnapshot::default();
        config.skill.monitor_all_buff = true;
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));

        // A remodel tier on the source identity alone never tags the buff:
        // only a marker-observed fantasy registration does.
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![ProtocolObservation::IdentityUpdated {
                uuid: summon,
                patch: EntityIdentityPatch {
                    owner_uuid: FieldPatch::Set(local),
                    monster_id: FieldPatch::Set(3_000_038),
                    fantasy_tier: FieldPatch::Set(2),
                    ..Default::default()
                },
            }],
        );
        assert_eq!(
            projection.snapshot(&entities).local_buffs[0].source_remodel_level,
            None
        );

        // The marker observation registers the summon; the publish-time
        // lookup tags the buff that was applied before registration.
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            3,
            vec![ProtocolObservation::FantasyMarkerObserved {
                summon_uuid: summon,
                source_config_id: None,
            }],
        );
        assert_eq!(
            projection.snapshot(&entities).local_buffs[0].source_remodel_level,
            Some(2)
        );

        // Summoner-sourced buffs resolve through the registered fantasy
        // skill, normalized from the skill-effect source config id.
        let mut skill_buff = observed_buff(2, local);
        skill_buff.base_id = 88;
        skill_buff.source_uuid = Some(local);
        skill_buff.source_config_id = Some(394_401);
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            4,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: local,
                change: ObservedBuffChange::Applied { buff: skill_buff },
            }],
        );
        let snapshot = projection.snapshot(&entities);
        assert_eq!(
            snapshot
                .local_buffs
                .iter()
                .find(|buff| buff.base_id == 88)
                .and_then(|buff| buff.source_remodel_level),
            Some(2)
        );

        // Unrelated skills stay unresolved.
        let mut other_buff = observed_buff(3, local);
        other_buff.base_id = 89;
        other_buff.source_uuid = Some(local);
        other_buff.source_config_id = Some(999_999);
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            5,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: local,
                change: ObservedBuffChange::Applied { buff: other_buff },
            }],
        );
        let snapshot = projection.snapshot(&entities);
        assert_eq!(
            snapshot
                .local_buffs
                .iter()
                .find(|buff| buff.base_id == 89)
                .and_then(|buff| buff.source_remodel_level),
            None
        );
    }

    #[test]
    fn current_target_has_priority_over_teammate_and_switch_updates_boss_view() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let target_a = player(20);
        let target_b = player(30);
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target_a,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target_b,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                joined_team(1, &[target_a, target_b]),
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target_a),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target_a,
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(1, target_a),
                    },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target_b,
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(2, target_b),
                    },
                },
            ],
        );
        let mut config = MonitorRuntimeSnapshot::default();
        config.monster.global_ids.push(77);
        config.teammate.any_source_ids.push(77);
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));

        let snapshot = projection.snapshot(&entities);
        assert_eq!(snapshot.boss_buffs.len(), 1);
        assert!(snapshot.boss_buffs.contains_key(&target_a.0.to_string()));
        assert!(
            !snapshot
                .teammate_buffs
                .contains_key(&target_a.0.to_string())
        );
        assert!(
            snapshot
                .teammate_buffs
                .contains_key(&target_b.0.to_string())
        );

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![ProtocolObservation::AttackTargetChanged {
                actor_uuid: local,
                target_uuid: Some(target_b),
            }],
        );
        let snapshot = projection.snapshot(&entities);
        assert_eq!(snapshot.boss_buffs.len(), 1);
        assert!(snapshot.boss_buffs.contains_key(&target_b.0.to_string()));
        assert!(
            snapshot
                .teammate_buffs
                .contains_key(&target_a.0.to_string())
        );
        assert!(
            !snapshot
                .teammate_buffs
                .contains_key(&target_b.0.to_string())
        );
    }

    #[test]
    fn monster_self_applied_filter_uses_original_source_not_summoner() {
        use crate::live::runtime::events::{EntityIdentityPatch, FieldPatch};

        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let summon = EntityUuid(11);
        let other = EntityUuid(12);
        let target = EntityUuid(20);
        let mut direct = observed_buff(1, target);
        direct.source_uuid = Some(local);
        direct.started_wall_ms = Some(9_000);
        let mut summoned = observed_buff(2, target);
        summoned.source_uuid = Some(summon);
        let mut from_teammate = observed_buff(3, target);
        from_teammate.source_uuid = Some(other);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: summon,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: other,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::IdentityUpdated {
                    uuid: summon,
                    patch: EntityIdentityPatch {
                        owner_uuid: FieldPatch::Set(local),
                        ..Default::default()
                    },
                },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: direct },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: summoned },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied {
                        buff: from_teammate,
                    },
                },
            ],
        );

        let mut config = MonitorRuntimeSnapshot::default();
        config.monster.self_applied_ids.push(77);
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));

        // Only the buff whose raw source is the local player matches
        // self-applied; summon/fantasy sources and teammates do not.
        let boss_buffs = &projection.snapshot(&entities).boss_buffs[&target.0.to_string()];
        assert_eq!(boss_buffs.len(), 1);
        assert_eq!(boss_buffs[0].base_id, 77);
        assert_eq!(boss_buffs[0].create_time_ms, 9_000);
    }

    #[test]
    fn entity_disappearance_clears_its_buff_view() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let target = EntityUuid(20);
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(1, target),
                    },
                },
            ],
        );
        let mut config = MonitorRuntimeSnapshot::default();
        config.monster.global_ids.push(77);
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));
        assert_eq!(projection.snapshot(&entities).boss_buffs.len(), 1);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: target }],
        );
        assert!(projection.snapshot(&entities).boss_buffs.is_empty());
    }

    #[test]
    fn reappeared_current_target_buffs_return_without_retarget() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let target = EntityUuid(20);
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: crate::live::runtime::events::EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(1, target),
                    },
                },
            ],
        );
        let mut config = MonitorRuntimeSnapshot::default();
        config.monster.global_ids.push(77);
        projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));
        assert_eq!(projection.snapshot(&entities).boss_buffs.len(), 1);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: target }],
        );
        assert!(projection.snapshot(&entities).boss_buffs.is_empty());

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            3,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: crate::live::runtime::events::EntityKind::Monster,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied {
                        buff: observed_buff(2, target),
                    },
                },
            ],
        );
        let snapshot = projection.snapshot(&entities);
        assert_eq!(snapshot.boss_buffs.len(), 1);
        assert!(snapshot.boss_buffs.contains_key(&target.0.to_string()));
    }

    #[test]
    fn local_entity_disappearance_clears_all_local_runtime_state() {
        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        seed_local_player(&mut projection, &mut entities, &mut scheduler);

        projection.skill_cds.insert(
            1,
            SkillCdRecord {
                state: SkillCdState {
                    skill_level_id: 1,
                    begin_time: 1,
                    duration: 1,
                    skill_cd_type: 0,
                    valid_cd_time: 1,
                    received_at: 1,
                    calculated_duration: 1,
                    cd_accelerate_rate: 0.0,
                    ready_at_ms: None,
                    max_charges: None,
                    max_valid_cd_time: None,
                },
                received_mono_ms: MonoTimeMs(1),
            },
        );
        projection.panel_attrs.insert(1, 1);
        projection.shield_current_hp = 100;
        projection.shield_max_hp = 200;
        projection.shield_entries.push(ShieldDetailEntry {
            buff_uuid: 1,
            display_type: 0,
            current: 100,
            initial_shield: 100,
            max_shield: 200,
            base_id: 77,
            expire_time_ms: 6_000,
        });
        projection.fight_resource_ids.push(1);
        projection.fight_resources.insert(1, 2);
        projection.fight_resource_received_at = 3_000;

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![ProtocolObservation::EntityDisappeared {
                uuid: EntityUuid(10),
            }],
        );

        let snapshot = projection.snapshot(&entities);
        assert!(snapshot.local_buffs.is_empty());
        assert!(snapshot.skill_cds.is_empty());
        assert!(snapshot.panel_attrs.is_empty());
        assert_eq!(snapshot.shield_current_hp, 0);
        assert_eq!(snapshot.shield_max_hp, 0);
        assert!(snapshot.shield_entries.is_empty());
        assert!(snapshot.fight_resource.is_none());
        assert_eq!(projection.fight_resource_received_at, 0);
    }

    #[test]
    fn monster_target_runtime_is_scoped_and_cleared_on_lifecycle_end() {
        use crate::live::runtime::events::{
            EntityIdentityPatch, EntityKind, FieldPatch, HateEntry,
        };

        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let target_a = EntityUuid(20);
        let target_b = EntityUuid(30);
        let identity = |monster_id| EntityIdentityPatch {
            monster_id: FieldPatch::Set(monster_id),
            ..Default::default()
        };

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target_a,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target_b,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: target_a,
                    patch: identity(101),
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: target_b,
                    patch: identity(102),
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target_a),
                },
                ProtocolObservation::HateListUpdated {
                    entity_uuid: target_a,
                    entries: vec![HateEntry {
                        entity_uuid: local,
                        value: 100,
                    }],
                },
                ProtocolObservation::HateListUpdated {
                    entity_uuid: target_b,
                    entries: vec![HateEntry {
                        entity_uuid: local,
                        value: 200,
                    }],
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: target_a,
                    attr_id: attr_type::ATTR_CURRENT_STUNNED,
                    value: AttributeValue::Int(40),
                    origin: ObservationOrigin::Delta,
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: target_a,
                    attr_id: attr_type::ATTR_MAX_STUNNED,
                    value: AttributeValue::Int(100),
                    origin: ObservationOrigin::Delta,
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: target_b,
                    attr_id: attr_type::ATTR_CURRENT_STUNNED,
                    value: AttributeValue::Int(60),
                    origin: ObservationOrigin::Delta,
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: target_b,
                    attr_id: attr_type::ATTR_MAX_STUNNED,
                    value: AttributeValue::Int(120),
                    origin: ObservationOrigin::Delta,
                },
            ],
        );

        let snapshot = projection.snapshot(&entities);
        assert_eq!(snapshot.hate_lists.len(), 1);
        assert_eq!(
            snapshot.hate_lists[&target_a.0.to_string()][0].hate_val,
            100
        );
        assert_eq!(snapshot.stun.len(), 1);
        assert_eq!(snapshot.stun[0].boss_entity_uuid, target_a.0.to_string());

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            2,
            vec![ProtocolObservation::AttackTargetChanged {
                actor_uuid: local,
                target_uuid: Some(target_b),
            }],
        );
        let snapshot = projection.snapshot(&entities);
        assert_eq!(snapshot.hate_lists.len(), 1);
        assert_eq!(
            snapshot.hate_lists[&target_b.0.to_string()][0].hate_val,
            200
        );
        assert_eq!(snapshot.stun.len(), 1);
        assert_eq!(snapshot.stun[0].boss_entity_uuid, target_b.0.to_string());
        assert!(scheduler.is_empty());

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            3,
            vec![ProtocolObservation::AttributeUpdated {
                uuid: target_b,
                attr_id: attr_type::ATTR_ACTOR_STATE,
                value: AttributeValue::Int(attr_type::ACTOR_STATE_DEAD),
                origin: ObservationOrigin::Delta,
            }],
        );
        let snapshot = projection.snapshot(&entities);
        assert!(snapshot.hate_lists.is_empty());
        assert!(snapshot.stun.is_empty());
        assert!(scheduler.is_empty());

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            4,
            vec![ProtocolObservation::EntityDisappeared { uuid: target_b }],
        );
        let snapshot = projection.snapshot(&entities);
        assert!(snapshot.hate_lists.is_empty());
        assert!(snapshot.stun.is_empty());
        assert!(scheduler.is_empty());
    }

    #[test]
    fn boss_dbm_is_scene_scoped_and_latest_event_wins_per_base_skill() {
        use crate::live::runtime::events::{
            BossMechanicObservation, EntityKind, MonoTimeMs, TimerKind,
        };

        fn mechanic(
            base_skill_id: i32,
            duration_ms: u64,
            expires_mono_ms: u64,
        ) -> ProtocolObservation {
            ProtocolObservation::BossMechanicStarted(BossMechanicObservation {
                base_skill_id,
                skill_effect_id: base_skill_id.saturating_mul(100).saturating_add(1),
                insertion: 0,
                server_timestamp_ms: None,
                duration_ms,
                expires_mono_ms: MonoTimeMs(expires_mono_ms),
            })
        }

        let mut projection = EntityMonitorProjection::default();
        let mut entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let local = EntityUuid(10);
        let target_a = EntityUuid(20);
        let target_b = EntityUuid(30);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target_a,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target_b,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target_a),
                },
                mechanic(77, 15_000, 16_000),
            ],
        );
        assert_eq!(projection.snapshot(&entities).boss_mechanics.len(), 1);
        assert_eq!(scheduler.len(), 1);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            4,
            vec![mechanic(88, 10_000, 14_000), mechanic(77, 10_000, 14_000)],
        );
        let snapshot = projection.snapshot(&entities);
        assert_eq!(snapshot.boss_mechanics.len(), 2);
        let refreshed = snapshot
            .boss_mechanics
            .iter()
            .find(|event| event.base_skill_id == 77)
            .expect("refreshed DBM event");
        assert_eq!(refreshed.duration_ms, 10_000);
        assert_eq!(refreshed.create_time_ms, 4_000);
        assert_eq!(scheduler.len(), 2);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(14_000)));

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            5,
            vec![ProtocolObservation::AttackTargetChanged {
                actor_uuid: local,
                target_uuid: Some(target_b),
            }],
        );
        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            6,
            vec![ProtocolObservation::AttributeUpdated {
                uuid: target_b,
                attr_id: attr_type::ATTR_ACTOR_STATE,
                value: AttributeValue::Int(attr_type::ACTOR_STATE_DEAD),
                origin: ObservationOrigin::Delta,
            }],
        );
        assert_eq!(projection.snapshot(&entities).boss_mechanics.len(), 2);
        assert_eq!(scheduler.len(), 2);

        apply_observations(
            &mut projection,
            &mut entities,
            &mut scheduler,
            7,
            vec![ProtocolObservation::EntityDisappeared { uuid: target_b }],
        );
        assert_eq!(projection.snapshot(&entities).boss_mechanics.len(), 2);
        assert_eq!(scheduler.len(), 2);

        scheduler.cancel(boss_deadline_key(88));
        projection.apply(
            &envelope(
                8,
                14_000,
                DomainEvent::DeadlineReached {
                    key: boss_deadline_key(88),
                    kind: TimerKind::BossDbmExpiry,
                    scope: TimerScope::Runtime,
                    scheduled_for: MonoTimeMs(14_000),
                    fired_at: MonoTimeMs(14_000),
                    generation: 1,
                },
            ),
            &entities,
            &mut scheduler,
        );
        assert_eq!(projection.snapshot(&entities).boss_mechanics.len(), 1);

        projection.apply(
            &envelope(
                9,
                15_000,
                DomainEvent::SceneChanged {
                    previous_scene_id: Some(1),
                    scene_id: 2,
                    difficulty: None,
                },
            ),
            &entities,
            &mut scheduler,
        );
        assert!(projection.snapshot(&entities).boss_mechanics.is_empty());
        assert!(scheduler.is_empty());
    }

    mod watched_entities {
        use super::*;
        use crate::live::bootstrap_snapshot::WatchedEntitySpec;
        use crate::live::runtime::events::{EntityIdentityPatch, EntityKind, FieldPatch};
        use crate::voice::models::EntityOwnerScope;

        const SCYTHE_CART: i32 = 179_901;
        /// Every test entry's lifetime, so a track deadline is its detection
        /// time plus this.
        const LIFETIME_MS: u64 = 10_000;

        fn spec(monster_id: i32, scope: EntityOwnerScope, merge: bool) -> WatchedEntitySpec {
            WatchedEntitySpec {
                monster_id,
                duration_ms: Some(LIFETIME_MS),
                scope,
                merge,
            }
        }

        fn config_with(specs: Vec<WatchedEntitySpec>) -> MonitorRuntimeSnapshot {
            let mut config = MonitorRuntimeSnapshot::default();
            config.monster.enabled = true;
            config.monster.watched_entities = specs;
            config
        }

        fn watched_config(ids: &[i32]) -> MonitorRuntimeSnapshot {
            config_with(
                ids.iter()
                    .map(|monster_id| spec(*monster_id, EntityOwnerScope::Any, false))
                    .collect(),
            )
        }

        fn setup() -> (EntityMonitorProjection, EntityContext, DeadlineScheduler) {
            let mut projection = EntityMonitorProjection::default();
            let mut entities = EntityContext::default();
            let mut scheduler = DeadlineScheduler::default();
            seed_local_player(&mut projection, &mut entities, &mut scheduler);
            projection.apply_config(
                &watched_config(&[SCYTHE_CART]),
                Arc::default(),
                &entities,
                MonoTimeMs(0),
            );
            (projection, entities, scheduler)
        }

        fn appear(uuid: EntityUuid) -> ProtocolObservation {
            ProtocolObservation::EntityAppeared {
                uuid,
                kind: EntityKind::Monster,
            }
        }

        fn identity(
            uuid: EntityUuid,
            monster_id: Option<i32>,
            owner: Option<EntityUuid>,
        ) -> ProtocolObservation {
            ProtocolObservation::IdentityUpdated {
                uuid,
                patch: EntityIdentityPatch {
                    monster_id: monster_id.map_or(FieldPatch::Unchanged, FieldPatch::Set),
                    owner_uuid: owner.map_or(FieldPatch::Unchanged, FieldPatch::Set),
                    ..Default::default()
                },
            }
        }

        fn summon(uuid: EntityUuid, owner: Option<EntityUuid>) -> Vec<ProtocolObservation> {
            vec![appear(uuid), identity(uuid, Some(SCYTHE_CART), owner)]
        }

        fn tracks(
            projection: &EntityMonitorProjection,
            entities: &EntityContext,
        ) -> Vec<EntityDurationTrackState> {
            projection.snapshot(entities).entity_duration_tracks
        }

        #[test]
        fn watched_entity_with_identity_and_owner_is_published_with_batch_time() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                summon(cart, Some(local_ref().uuid)),
            );
            let rows = tracks(&projection, &entities);
            assert_eq!(rows.len(), 1);
            let row = &rows[0];
            assert_eq!(row.key, "179901:any:e500");
            assert_eq!(row.monster_id, SCYTHE_CART);
            assert_eq!(row.owner_uuid.as_deref(), Some("10"));
            assert_eq!(row.duration_ms, Some(LIFETIME_MS));
            assert_eq!(row.deadlines_ms, vec![2_000 + 10_000]);
        }

        #[test]
        fn owner_arriving_in_later_patch_updates_record_without_resetting_detected_at() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                summon(cart, None),
            );
            let before = tracks(&projection, &entities);
            assert_eq!(before.len(), 1);
            assert!(before[0].owner_uuid.is_none());

            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                vec![identity(cart, None, Some(local_ref().uuid))],
            );
            let after = tracks(&projection, &entities);
            assert_eq!(after.len(), 1);
            assert_eq!(after[0].owner_uuid.as_deref(), Some("10"));
            assert_eq!(after[0].deadlines_ms, vec![2_000 + 10_000]);
        }

        #[test]
        fn identity_before_appearance_is_tracked_when_entity_appears() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                vec![identity(cart, Some(SCYTHE_CART), Some(local_ref().uuid))],
            );
            assert!(tracks(&projection, &entities).is_empty());

            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                vec![appear(cart)],
            );
            let rows = tracks(&projection, &entities);
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].deadlines_ms, vec![3_000 + 10_000]);
        }

        #[test]
        fn watched_entity_disappearance_removes_record() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                summon(cart, Some(local_ref().uuid)),
            );
            assert_eq!(tracks(&projection, &entities).len(), 1);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                vec![ProtocolObservation::EntityDisappeared { uuid: cart }],
            );
            assert!(tracks(&projection, &entities).is_empty());
        }

        #[test]
        fn same_uuid_reappearance_starts_a_new_record() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                summon(cart, Some(local_ref().uuid)),
            );
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                vec![ProtocolObservation::EntityDisappeared { uuid: cart }],
            );
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                4,
                summon(cart, Some(local_ref().uuid)),
            );
            let rows = tracks(&projection, &entities);
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].deadlines_ms, vec![4_000 + 10_000]);
        }

        #[test]
        fn unwatched_monster_id_is_ignored() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let other = EntityUuid(600);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                vec![
                    appear(other),
                    identity(other, Some(12_345), Some(local_ref().uuid)),
                ],
            );
            assert!(tracks(&projection, &entities).is_empty());
        }

        #[test]
        fn apply_config_narrowing_prunes_records_and_widening_seeds_present_entities() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            let other = EntityUuid(600);
            let mut observations = summon(cart, Some(local_ref().uuid));
            observations.push(appear(other));
            observations.push(identity(other, Some(12_345), None));
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                observations,
            );
            assert_eq!(tracks(&projection, &entities).len(), 1);

            projection.apply_config(
                &watched_config(&[]),
                Arc::default(),
                &entities,
                MonoTimeMs(0),
            );
            assert!(tracks(&projection, &entities).is_empty());

            projection.apply_config(
                &watched_config(&[SCYTHE_CART, 12_345]),
                Arc::default(),
                &entities,
                MonoTimeMs(0),
            );
            let rows = tracks(&projection, &entities);
            let mut ids = rows.iter().map(|row| row.monster_id).collect::<Vec<_>>();
            ids.sort_unstable();
            assert_eq!(ids, vec![12_345, SCYTHE_CART]);
        }

        #[test]
        fn owner_name_resolves_and_self_scope_keeps_only_local_summons() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let stranger = EntityUuid(20);
            let mine = EntityUuid(500);
            let theirs = EntityUuid(501);
            let mut observations = vec![
                ProtocolObservation::EntityAppeared {
                    uuid: stranger,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: stranger,
                    patch: EntityIdentityPatch {
                        name: FieldPatch::Set("Rin".to_string()),
                        ..Default::default()
                    },
                },
            ];
            observations.extend(summon(mine, Some(local_ref().uuid)));
            observations.extend(summon(theirs, Some(stranger)));
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                observations,
            );
            let rows = tracks(&projection, &entities);
            assert_eq!(rows.len(), 2);
            let mine_row = rows
                .iter()
                .find(|row| row.key == "179901:any:e500")
                .expect("own cart");
            let theirs_row = rows
                .iter()
                .find(|row| row.key == "179901:any:e501")
                .expect("stranger cart");
            assert_eq!(mine_row.owner_uuid.as_deref(), Some("10"));
            assert_eq!(theirs_row.owner_name.as_deref(), Some("Rin"));
            assert_eq!(theirs_row.owner_uuid.as_deref(), Some("20"));

            projection.apply_config(
                &config_with(vec![spec(
                    SCYTHE_CART,
                    EntityOwnerScope::LocalPlayer,
                    false,
                )]),
                Arc::default(),
                &entities,
                MonoTimeMs(0),
            );
            let keys = tracks(&projection, &entities)
                .into_iter()
                .map(|row| row.key)
                .collect::<Vec<_>>();
            assert_eq!(keys, vec!["179901:self:e500".to_string()]);
        }

        #[test]
        fn merged_entry_folds_each_casters_summons_into_one_track() {
            let (mut projection, mut entities, mut scheduler) = setup();
            projection.apply_config(
                &config_with(vec![spec(SCYTHE_CART, EntityOwnerScope::Any, true)]),
                Arc::default(),
                &entities,
                MonoTimeMs(0),
            );
            let stranger = EntityUuid(20);
            let mut observations = summon(EntityUuid(500), Some(local_ref().uuid));
            observations.extend(summon(EntityUuid(501), Some(local_ref().uuid)));
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                observations,
            );
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                summon(EntityUuid(502), Some(stranger)),
            );
            let rows = tracks(&projection, &entities);
            let shape = rows
                .iter()
                .map(|row| (row.key.as_str(), row.deadlines_ms.clone()))
                .collect::<Vec<_>>();
            assert_eq!(
                shape,
                vec![
                    ("179901:any:c10", vec![12_000, 12_000]),
                    ("179901:any:c20", vec![13_000]),
                ]
            );

            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                4,
                vec![ProtocolObservation::EntityDisappeared {
                    uuid: EntityUuid(500),
                }],
            );
            let rows = tracks(&projection, &entities);
            assert_eq!(rows[0].key, "179901:any:c10");
            assert_eq!(rows[0].deadlines_ms, vec![12_000]);
        }

        #[test]
        fn scene_change_despawns_watched_entities() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                summon(cart, Some(local_ref().uuid)),
            );
            assert_eq!(tracks(&projection, &entities).len(), 1);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                vec![ProtocolObservation::SceneChanged {
                    scene_id: 77,
                    difficulty: None,
                }],
            );
            assert!(tracks(&projection, &entities).is_empty());
        }

        #[test]
        fn reset_runtime_clears_watched_entities_but_keeps_watch_set() {
            let (mut projection, mut entities, mut scheduler) = setup();
            let cart = EntityUuid(500);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                summon(cart, Some(local_ref().uuid)),
            );
            projection.reset_runtime(&mut scheduler);
            assert!(tracks(&projection, &entities).is_empty());

            let cart2 = EntityUuid(502);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                summon(cart2, None),
            );
            assert_eq!(tracks(&projection, &entities).len(), 1);
        }
    }

    mod monster_skills {
        use super::*;
        use crate::live::runtime::events::EntityKind;

        const SKILL: i32 = 101_403;
        const MONSTER: EntityUuid = EntityUuid(30);

        fn setup(
            monster_enabled: bool,
        ) -> (EntityMonitorProjection, EntityContext, DeadlineScheduler) {
            let mut projection = EntityMonitorProjection::default();
            let mut entities = EntityContext::default();
            let mut scheduler = DeadlineScheduler::default();
            seed_local_player(&mut projection, &mut entities, &mut scheduler);
            let mut config = MonitorRuntimeSnapshot::default();
            config.monster.enabled = monster_enabled;
            config.monster.watched_skill_ids = vec![SKILL];
            projection.apply_config(&config, Arc::default(), &entities, MonoTimeMs(0));
            (projection, entities, scheduler)
        }

        fn monster_cast() -> Vec<ProtocolObservation> {
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: MONSTER,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::SkillLifecycleChanged {
                    caster_uuid: MONSTER,
                    skill_id: SKILL,
                    phase: SkillPhase::Observed,
                    target_uuid: None,
                },
            ]
        }

        #[test]
        fn nearby_monster_cast_is_published_with_batch_time() {
            let (mut projection, mut entities, mut scheduler) = setup(true);

            let mask = apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                monster_cast(),
            );

            assert!(mask.contains(TopicMask::MONSTER));
            assert_eq!(
                projection.snapshot(&entities).monster_skill_casts,
                vec![MonsterSkillCastState {
                    skill_id: SKILL,
                    cast_at_ms: 2_000,
                }]
            );
        }

        #[test]
        fn cast_outlives_its_caster_but_not_a_scene_change() {
            let (mut projection, mut entities, mut scheduler) = setup(true);
            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                monster_cast(),
            );

            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                3,
                vec![ProtocolObservation::EntityDisappeared { uuid: MONSTER }],
            );
            assert_eq!(projection.snapshot(&entities).monster_skill_casts.len(), 1);

            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                4,
                vec![ProtocolObservation::SceneChanged {
                    scene_id: 2,
                    difficulty: None,
                }],
            );
            assert!(
                projection
                    .snapshot(&entities)
                    .monster_skill_casts
                    .is_empty()
            );
        }

        #[test]
        fn disabled_monster_monitor_hides_casts_from_the_hud() {
            let (mut projection, mut entities, mut scheduler) = setup(false);

            apply_observations(
                &mut projection,
                &mut entities,
                &mut scheduler,
                2,
                monster_cast(),
            );

            assert!(
                projection
                    .snapshot(&entities)
                    .monster_skill_casts
                    .is_empty()
            );
        }
    }

    mod dead_teammates {
        use super::*;
        use crate::live::runtime::events::EntityKind;

        const LOCAL: EntityUuid = EntityUuid(10);
        /// Any non-dead `EActorState`; only `ACTOR_STATE_DEAD` is special.
        const ALIVE: i64 = 1;
        const BUSY: i64 = 2;

        struct Harness {
            projection: EntityMonitorProjection,
            entities: EntityContext,
            scheduler: DeadlineScheduler,
            sequence: u64,
        }

        impl Harness {
            /// The local player in a party with `members`, every one in range,
            /// while the teammate matrix watches a buff when `watching`.
            fn new(members: &[EntityUuid], strangers: &[EntityUuid], watching: bool) -> Self {
                let mut harness = Self {
                    projection: EntityMonitorProjection::default(),
                    entities: EntityContext::new(),
                    scheduler: DeadlineScheduler::new(),
                    sequence: 0,
                };
                if watching {
                    harness.watch_teammates();
                }
                let mut observations = vec![
                    appeared(LOCAL),
                    ProtocolObservation::LocalPlayerChanged { uuid: Some(LOCAL) },
                ];
                observations.extend(members.iter().chain(strangers).map(|uuid| appeared(*uuid)));
                observations.push(joined_team(1, members));
                harness.apply(observations);
                harness
            }

            fn watch_teammates(&mut self) {
                let mut config = MonitorRuntimeSnapshot::default();
                config.teammate.any_source_ids.push(77);
                self.projection.apply_config(
                    &config,
                    Arc::default(),
                    &self.entities,
                    MonoTimeMs(0),
                );
            }

            fn apply(&mut self, observations: Vec<ProtocolObservation>) -> TopicMask {
                self.sequence += 1;
                apply_observations(
                    &mut self.projection,
                    &mut self.entities,
                    &mut self.scheduler,
                    self.sequence,
                    observations,
                )
            }

            fn dead_teammates(&self) -> Vec<String> {
                self.projection.snapshot(&self.entities).dead_teammates
            }
        }

        fn appeared(uuid: EntityUuid) -> ProtocolObservation {
            ProtocolObservation::EntityAppeared {
                uuid,
                kind: EntityKind::Character,
            }
        }

        fn actor_state(
            uuid: EntityUuid,
            state: i64,
            origin: ObservationOrigin,
        ) -> ProtocolObservation {
            ProtocolObservation::AttributeUpdated {
                uuid,
                attr_id: attr_type::ATTR_ACTOR_STATE,
                value: AttributeValue::Int(state),
                origin,
            }
        }

        fn died(uuid: EntityUuid) -> ProtocolObservation {
            actor_state(uuid, attr_type::ACTOR_STATE_DEAD, ObservationOrigin::Delta)
        }

        #[test]
        fn lists_only_in_range_dead_party_members_in_ascending_order() {
            let (first, second, alive, departed, stranger) =
                (player(2), player(3), player(4), player(5), player(6));
            let mut harness = Harness::new(&[second, first, alive, departed], &[stranger], true);
            harness.apply(vec![
                died(second),
                died(first),
                died(LOCAL),
                died(departed),
                died(stranger),
            ]);
            harness.apply(vec![ProtocolObservation::EntityDisappeared {
                uuid: departed,
            }]);

            assert_eq!(
                harness.dead_teammates(),
                vec![first.0.to_string(), second.0.to_string()]
            );
        }

        #[test]
        fn corpse_first_seen_in_a_snapshot_is_published() {
            let teammate = player(2);
            let mut harness = Harness::new(&[], &[], true);
            harness.apply(vec![joined_team(1, &[teammate])]);
            harness.apply(vec![appeared(teammate)]);

            // A snapshot corpse raises no `DeathOccurred`; only the ActorState
            // flip can mark the matrix dirty.
            let mask = harness.apply(vec![actor_state(
                teammate,
                attr_type::ACTOR_STATE_DEAD,
                ObservationOrigin::Snapshot,
            )]);

            assert!(mask.contains(TopicMask::MONSTER));
            assert_eq!(harness.dead_teammates(), vec![teammate.0.to_string()]);
        }

        #[test]
        fn revival_marks_monster_but_living_state_changes_and_strangers_do_not() {
            let (teammate, stranger) = (player(2), player(6));
            let mut harness = Harness::new(&[teammate], &[stranger], true);
            harness.apply(vec![died(teammate), died(stranger)]);
            assert_eq!(harness.dead_teammates(), vec![teammate.0.to_string()]);

            let revived =
                harness.apply(vec![actor_state(teammate, ALIVE, ObservationOrigin::Delta)]);
            assert!(revived.contains(TopicMask::MONSTER));
            assert!(harness.dead_teammates().is_empty());

            let busy = harness.apply(vec![actor_state(teammate, BUSY, ObservationOrigin::Delta)]);
            assert!(!busy.contains(TopicMask::MONSTER));

            let stranger_revived =
                harness.apply(vec![actor_state(stranger, ALIVE, ObservationOrigin::Delta)]);
            assert!(!stranger_revived.contains(TopicMask::MONSTER));
        }

        #[test]
        fn nothing_is_published_while_the_teammate_matrix_is_unused() {
            let teammate = player(2);
            let mut harness = Harness::new(&[teammate], &[], false);
            harness.apply(vec![died(teammate)]);
            assert!(harness.dead_teammates().is_empty());

            let revived =
                harness.apply(vec![actor_state(teammate, ALIVE, ObservationOrigin::Delta)]);
            assert!(!revived.contains(TopicMask::MONSTER));
        }

        #[test]
        fn roster_changes_mark_monster_only_while_teammates_are_watched() {
            let mut harness = Harness::new(&[], &[], false);
            let unwatched = harness.apply(vec![joined_team(1, &[player(2)])]);
            assert!(!unwatched.contains(TopicMask::MONSTER));

            harness.watch_teammates();
            let watched = harness.apply(vec![joined_team(1, &[player(3)])]);
            assert!(watched.contains(TopicMask::MONSTER));
        }
    }
}
