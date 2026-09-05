//! Incremental, UUID-keyed entity context and protocol observation reducer.

use std::collections::{HashMap, HashSet, VecDeque};

use crate::live::protocol::attrs as attr_type;

use super::events::{
    AttributeValue, BuffEvent, BuffState, BuffTransition, BuffWireKind, DeathBuffCheckpoint,
    DomainEnvelope, DomainEvent, DomainHit, EntityIdentity, EntityIdentityPatch, EntityKind,
    EntityRef, EntityRoles, EntityUuid, EventMeta, FantasyState, FantasyTransition, FieldPatch,
    GameTimerKey, GameTimerState, HateEntry, LOCAL_PLAYER, LocalTalent, MonoTimeMs,
    ObservationOrigin, ObservedBuff, ObservedBuffChange, PassiveSkillObservation, Position,
    ProtocolBatch, ProtocolObservation, ResolvedShieldDetail, SegmentId, ShieldDetail,
    SkillCooldownState, SkillPhase,
};
use super::fantasy_registry::{
    FantasyRegistry, is_resonance_fantasy_monster_id, resolve_fantasy_skill_id,
};

#[derive(Debug, Clone)]
pub struct EntityState {
    pub entity: EntityRef,
    pub is_present: bool,
    pub is_dead: bool,
    pub identity: EntityIdentity,
    pub attributes: HashMap<i32, AttributeValue>,
    pub hate_entries: Vec<HateEntry>,
    pub positions: HashMap<i32, Position>,
    pub active_buffs: HashMap<i64, BuffState>,
    pub skill_cooldowns: Vec<SkillCooldownState>,
    pub shield_details: Vec<ShieldDetail>,
    pub temp_attributes: HashMap<i32, i32>,
    pub fight_resource_ids: Vec<i32>,
    pub fight_resources: HashMap<i32, i64>,
    has_been_present: bool,
}

impl EntityState {
    fn new(uuid: EntityUuid) -> Self {
        Self {
            entity: EntityRef {
                uuid,
                generation: 1,
            },
            is_present: false,
            is_dead: false,
            identity: EntityIdentity::default(),
            attributes: HashMap::new(),
            hate_entries: Vec::new(),
            positions: HashMap::new(),
            active_buffs: HashMap::new(),
            skill_cooldowns: Vec::new(),
            shield_details: Vec::new(),
            temp_attributes: HashMap::new(),
            fight_resource_ids: Vec::new(),
            fight_resources: HashMap::new(),
            has_been_present: false,
        }
    }

    /// Reads an integer attribute, returning `None` when absent or non-integer.
    #[must_use]
    pub fn int_attr(&self, attr_id: i32) -> Option<i64> {
        match self.attributes.get(&attr_id) {
            Some(AttributeValue::Int(value)) => Some(*value),
            _ => None,
        }
    }
}

const WIPE_BUFF_BASE_ID: i32 = 510_072;
const IMMEDIATE_COMPLETE_SKILL_IDS: [i32; 3] = [1_215, 1_238, 1_237];
const PENDING_SKILL_MAX_AGE_MS: u64 = 10_000;

/// ActorState death held until the rest of the batch (or the victim despawns).
#[derive(Debug)]
struct PendingDeath {
    victim: EntityRef,
    buff_checkpoint: DeathBuffCheckpoint,
}

#[derive(Debug)]
struct PendingSkill {
    meta: EventMeta,
    skill_id: i32,
    phase: super::events::SkillPhase,
    target: Option<EntityRef>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ActiveSkill {
    skill_id: i32,
    target: Option<EntityRef>,
}

/// Start-packet payload of a passive skill instance. The matching end packet
/// only carries the instance id, so the descriptor is kept until it ends.
#[derive(Debug, Clone, Copy)]
struct PassiveWireState {
    entity_uuid: EntityUuid,
    skill_id: i32,
    target_position: Option<Position>,
}

#[derive(Debug, Default)]
struct CasterSkillLifecycle {
    pending_main_casts: VecDeque<ActiveSkill>,
    duration_skill: Option<ActiveSkill>,
}

#[derive(Debug, Default)]
pub struct EntityContext {
    entities: HashMap<EntityUuid, EntityState>,
    local_player: Option<EntityUuid>,
    team_id: i64,
    team_leader: Option<EntityUuid>,
    team_members: HashSet<EntityUuid>,
    passive_skills: HashMap<i32, PassiveWireState>,
    passive_instances_by_entity: HashMap<EntityUuid, HashSet<i32>>,
    attack_targets: HashMap<EntityUuid, EntityUuid>,
    attackers_by_target: HashMap<EntityUuid, HashSet<EntityUuid>>,
    target_epochs: HashMap<EntityUuid, u64>,
    fantasies: HashMap<EntityUuid, FantasyState>,
    fantasy_registry: FantasyRegistry,
    game_timers: HashMap<GameTimerKey, GameTimerState>,
    watched_skill_ids: HashSet<i32>,
    pending_skills_by_caster: HashMap<EntityUuid, Vec<PendingSkill>>,
    pending_skill_expiries: VecDeque<(MonoTimeMs, EntityUuid)>,
    skill_lifecycles: HashMap<EntityUuid, CasterSkillLifecycle>,
    active_season_items: HashSet<i32>,
    active_season_id: i32,
    active_season_template_ids: Vec<i32>,
    local_talent: LocalTalent,
    current_scene_id: Option<i32>,
    current_difficulty: Option<i32>,
    dungeon_flow_state: Option<i32>,
    progress_state: Option<i32>,
    is_paused: bool,
    /// `wall_ms - server_ms`, learned from server time packets. Buff deltas
    /// carry raw server creation timestamps that need it.
    server_clock_offset_ms: Option<i64>,
    /// ActorState deaths queued for the current `apply_batch` only.
    pending_deaths: Vec<PendingDeath>,
}

impl EntityContext {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_watched_skill_ids(&mut self, watched_skill_ids: HashSet<i32>) {
        self.watched_skill_ids = watched_skill_ids;
        let watched_skill_ids = &self.watched_skill_ids;
        self.pending_skills_by_caster.retain(|_, pending| {
            pending.retain(|skill| watched_skill_ids.contains(&skill.skill_id));
            !pending.is_empty()
        });
    }

    pub fn reset_combat_lifecycles(&mut self) {
        self.skill_lifecycles.clear();
    }

    fn reset_container_runtime(&mut self) {
        self.entities.clear();
        self.local_player = None;
        self.passive_skills.clear();
        self.passive_instances_by_entity.clear();
        self.attack_targets.clear();
        self.attackers_by_target.clear();
        self.target_epochs.clear();
        self.fantasies.clear();
        self.fantasy_registry.clear();
        self.game_timers.clear();
        self.pending_skills_by_caster.clear();
        self.pending_skill_expiries.clear();
        self.skill_lifecycles.clear();
        self.active_season_items.clear();
        self.active_season_id = 0;
        self.active_season_template_ids.clear();
        self.local_talent = LocalTalent::default();
        self.dungeon_flow_state = None;
        self.progress_state = None;
        self.pending_deaths.clear();
    }

    /// Applies one decoded packet atomically and returns canonical events.
    /// Actor-state deaths are held until the rest of the batch (or the
    /// victim's despawn) so same-packet hits land in the death-replay window.
    /// All envelopes share the packet's `batch_id` and time.
    pub fn apply_batch(&mut self, batch: ProtocolBatch) -> Vec<DomainEnvelope> {
        if let Some(source_time_ms) = batch.meta.source_time_ms {
            self.server_clock_offset_ms =
                Some(batch.meta.captured_wall_ms.saturating_sub(source_time_ms));
        }
        self.expire_pending_skills(batch.meta.mono_ms());
        let mut events = Vec::with_capacity(batch.observations.len());
        let mut event_index = 0_u32;
        for observation in batch.observations {
            let before = events.len();
            self.reduce_observation(batch.meta, observation, &mut events);
            for event in &mut events[before..] {
                event.event_index = event_index;
                event_index = event_index.saturating_add(1);
            }
        }
        let before = events.len();
        self.flush_pending_deaths(batch.meta, &mut events);
        for event in &mut events[before..] {
            event.event_index = event_index;
            event_index = event_index.saturating_add(1);
        }
        events
    }

    #[cfg(test)]
    fn reduce_batch(&mut self, batch: ProtocolBatch) -> Vec<DomainEnvelope> {
        self.apply_batch(batch)
    }

    #[must_use]
    pub fn entity(&self, uuid: EntityUuid) -> Option<&EntityState> {
        self.entities.get(&uuid)
    }

    #[must_use]
    pub fn entity_ref(&self, uuid: EntityUuid) -> Option<EntityRef> {
        self.entities.get(&uuid).map(|entity| entity.entity)
    }

    #[must_use]
    pub(crate) fn entities(&self) -> impl Iterator<Item = &EntityState> {
        self.entities.values()
    }

    #[must_use]
    pub(crate) fn active_buffs(&self, uuid: EntityUuid) -> impl Iterator<Item = &BuffState> {
        self.entities
            .get(&uuid)
            .into_iter()
            .flat_map(|entity| entity.active_buffs.values())
    }

    /// Legacy fantasy-registry lookup: a buff only carries a remodel level
    /// when its source is a marker-observed summon, or the summoner casting
    /// through the registered fantasy skill. Resolved at publish/snapshot
    /// time so a fantasy registered after the buff still tags it.
    #[must_use]
    pub fn resolve_fantasy_remodel_level(
        &self,
        source_uuid: Option<EntityUuid>,
        source_config_id: Option<i32>,
    ) -> Option<i64> {
        self.fantasy_registry
            .resolve_remodel_level(source_uuid, source_config_id)
    }

    #[must_use]
    pub fn local_player(&self) -> Option<EntityRef> {
        self.local_player.and_then(|uuid| self.entity_ref(uuid))
    }

    #[must_use]
    pub(crate) fn local_talent(&self) -> LocalTalent {
        self.local_talent
    }

    #[must_use]
    pub(crate) fn current_attack_target(&self) -> Option<EntityRef> {
        let local = self.local_player?;
        let target = self.attack_targets.get(&local).copied()?;
        self.roles(target)
            .is_current_target
            .then(|| self.entity_ref(target))
            .flatten()
    }

    #[must_use]
    pub fn current_scene_id(&self) -> Option<i32> {
        self.current_scene_id
    }

    #[must_use]
    pub fn current_difficulty(&self) -> Option<i32> {
        self.current_difficulty
    }

    #[must_use]
    pub fn is_paused(&self) -> bool {
        self.is_paused
    }

    #[must_use]
    pub fn game_timer(&self, key: GameTimerKey) -> Option<&GameTimerState> {
        self.game_timers.get(&key)
    }

    #[must_use]
    pub fn roles(&self, uuid: EntityUuid) -> EntityRoles {
        // Dead targets no longer count as the current attack target (legacy
        // `current_attack_target_uuid` semantics).
        let is_current_target = self
            .local_player
            .and_then(|local| self.attack_targets.get(&local).copied())
            == Some(uuid)
            && !self
                .entities
                .get(&uuid)
                .is_some_and(|entity| entity.is_dead);
        EntityRoles {
            is_local_player: self.local_player == Some(uuid),
            is_team_member: self.team_members.contains(&uuid),
            is_current_target,
        }
    }

    fn reduce_observation(
        &mut self,
        meta: EventMeta,
        observation: ProtocolObservation,
        out: &mut Vec<DomainEnvelope>,
    ) {
        match observation {
            ProtocolObservation::ContainerReset => {
                self.reset_container_runtime();
                self.emit(meta, DomainEvent::ContainerReset, out);
            }
            ProtocolObservation::EntityAppeared { uuid, kind } => {
                let Some(uuid) = self.resolve_observation_uuid(uuid) else {
                    return;
                };
                let entity = self
                    .entities
                    .entry(uuid)
                    .or_insert_with(|| EntityState::new(uuid));
                // Containers re-announce entities on every resync; only the
                // first appearance of a generation is a domain appearance.
                if entity.is_present {
                    if kind != EntityKind::Unknown && entity.identity.kind == EntityKind::Unknown {
                        entity.identity.kind = kind;
                        self.flush_pending_skills(uuid, meta.mono_ms(), out);
                    }
                    return;
                }
                if entity.has_been_present {
                    entity.entity.generation = entity.entity.generation.wrapping_add(1).max(1);
                    entity.identity = EntityIdentity::default();
                }
                entity.has_been_present = true;
                entity.is_present = true;
                entity.is_dead = false;
                entity.identity.kind = kind;
                let entity_ref = entity.entity;
                self.emit(
                    meta,
                    DomainEvent::EntityAppeared {
                        entity: entity_ref,
                        kind,
                    },
                    out,
                );
                if kind != EntityKind::Unknown {
                    self.flush_pending_skills(uuid, meta.mono_ms(), out);
                }
            }
            ProtocolObservation::EntityDisappeared { uuid } => {
                let Some(uuid) = self.resolve_observation_uuid(uuid) else {
                    return;
                };
                self.despawn_entity(meta, uuid, out);
            }
            ProtocolObservation::IdentityUpdated { uuid, patch } => {
                let Some(uuid) = self.resolve_observation_uuid(uuid) else {
                    return;
                };
                let entity_ref = self.ensure_ref(uuid);
                let previous = self.entities[&uuid].identity.clone();
                let mut current = previous.clone();
                apply_identity_patch(&mut current, patch);
                if current == previous {
                    return;
                }
                self.entities
                    .get_mut(&uuid)
                    .expect("ensured above")
                    .identity = current.clone();
                self.emit(
                    meta,
                    DomainEvent::IdentityChanged {
                        entity: entity_ref,
                        previous,
                        current,
                    },
                    out,
                );
                if self.identity_is_known(uuid) {
                    self.flush_pending_skills(uuid, meta.mono_ms(), out);
                }
            }
            ProtocolObservation::AttributeUpdated {
                uuid,
                attr_id,
                value,
                origin,
            } => {
                let Some(uuid) = self.resolve_observation_uuid(uuid) else {
                    return;
                };
                let entity_ref = self.ensure_ref(uuid);
                let previous = self
                    .entities
                    .get_mut(&uuid)
                    .expect("ensured above")
                    .attributes
                    .insert(attr_id, value.clone());
                if previous.as_ref() == Some(&value) {
                    return;
                }
                // ActorState transitions are the only death signal. Baseline
                // snapshots only update the flag: an entity first observed as
                // a corpse is not a fresh death.
                let mut actor_state_death = false;
                let mut actor_state_revival = false;
                if attr_id == attr_type::ATTR_ACTOR_STATE
                    && let AttributeValue::Int(state_value) = &value
                {
                    let entity = self.entities.get_mut(&uuid).expect("ensured above");
                    let now_dead = *state_value == attr_type::ACTOR_STATE_DEAD;
                    let was_dead = std::mem::replace(&mut entity.is_dead, now_dead);
                    actor_state_death =
                        now_dead && !was_dead && origin != ObservationOrigin::Snapshot;
                    // `was_dead` proves prior death knowledge, so no origin
                    // filter is needed here: a first observation of a living
                    // entity cannot produce this edge (is_dead starts false),
                    // and a snapshot-confirmed revival is still genuine.
                    actor_state_revival = !now_dead && was_dead;
                }
                self.emit(
                    meta,
                    DomainEvent::AttributeChanged {
                        entity: entity_ref,
                        attr_id,
                        previous,
                        current: value,
                        is_baseline: origin == ObservationOrigin::Snapshot,
                    },
                    out,
                );
                if actor_state_death {
                    // Hold until the rest of this batch (or despawn) so the
                    // same-packet killing blow can enter the replay window.
                    self.pending_deaths.push(PendingDeath {
                        victim: entity_ref,
                        buff_checkpoint: self.death_buff_checkpoint_for(uuid),
                    });
                }
                if actor_state_revival {
                    self.cancel_pending_death(uuid);
                    self.emit(meta, DomainEvent::Revived { entity: entity_ref }, out);
                }
            }
            ProtocolObservation::HateListUpdated {
                entity_uuid,
                entries,
            } => {
                let Some(entity_uuid) = self.resolve_observation_uuid(entity_uuid) else {
                    return;
                };
                let entity = self.ensure_ref(entity_uuid);
                let state = self.entities.get_mut(&entity_uuid).expect("ensured above");
                if state.hate_entries == entries {
                    return;
                }
                state.hate_entries.clone_from(&entries);
                self.emit(meta, DomainEvent::HateListUpdated { entity, entries }, out);
            }
            ProtocolObservation::PositionUpdated {
                uuid,
                attr_id,
                position,
                origin,
            } => {
                let Some(uuid) = self.resolve_observation_uuid(uuid) else {
                    return;
                };
                let entity_ref = self.ensure_ref(uuid);
                let previous = self
                    .entities
                    .get_mut(&uuid)
                    .expect("ensured above")
                    .positions
                    .insert(attr_id, position);
                if previous == Some(position) {
                    return;
                }
                self.emit(
                    meta,
                    DomainEvent::PositionChanged {
                        entity: entity_ref,
                        attr_id,
                        previous,
                        current: position,
                        is_baseline: origin == ObservationOrigin::Snapshot,
                    },
                    out,
                );
            }
            ProtocolObservation::BuffSnapshot { target_uuid, buffs } => {
                let Some(target_uuid) = self.resolve_observation_uuid(target_uuid) else {
                    return;
                };
                self.apply_buff_snapshot(meta, target_uuid, buffs, out);
            }
            ProtocolObservation::BuffChanged {
                target_uuid,
                change,
            } => {
                let Some(target_uuid) = self.resolve_observation_uuid(target_uuid) else {
                    return;
                };
                self.apply_buff_change(meta, target_uuid, change, out);
            }
            ProtocolObservation::LocalPlayerChanged { uuid } => {
                let previous = self.local_player.and_then(|id| self.entity_ref(id));
                let current = uuid.map(|id| self.ensure_ref(id));
                if previous == current {
                    return;
                }
                self.local_player = uuid;
                self.local_talent = LocalTalent::default();
                self.emit(
                    meta,
                    DomainEvent::LocalPlayerChanged { previous, current },
                    out,
                );
            }
            ProtocolObservation::LocalTalentChanged(raw) => {
                let profession_id = raw.profession_id.or_else(|| {
                    self.local_player
                        .and_then(|uuid| self.entities.get(&uuid))
                        .and_then(|entity| entity.identity.profession_id)
                });
                let current = LocalTalent {
                    profession_id,
                    talent_stage_cfg_id: raw.talent_stage_cfg_id,
                };
                if current == self.local_talent {
                    return;
                }
                let previous = std::mem::replace(&mut self.local_talent, current);
                log::info!(
                    target: "app::live",
                    "local_talent changed profession_id={:?}->{:?} talent_stage_cfg_id={:?}->{:?}",
                    previous.profession_id,
                    current.profession_id,
                    previous.talent_stage_cfg_id,
                    current.talent_stage_cfg_id,
                );
                self.emit(
                    meta,
                    DomainEvent::LocalTalentChanged { previous, current },
                    out,
                );
            }
            ProtocolObservation::LocalSkillRequested {
                skill_id,
                target_uuid,
            } => {
                let Some(local_uuid) = self.local_player else {
                    return;
                };
                let caster = self.ensure_ref(local_uuid);
                let target = target_uuid
                    .and_then(|uuid| self.resolve_observation_uuid(uuid))
                    .map(|uuid| self.ensure_ref(uuid));
                self.apply_known_skill_lifecycle(
                    meta,
                    caster,
                    skill_id,
                    SkillPhase::CastStarted,
                    target,
                    out,
                );
            }
            ProtocolObservation::LocalSkillCompleted { skill_id } => {
                let Some(local_uuid) = self.local_player else {
                    return;
                };
                let caster = self.ensure_ref(local_uuid);
                self.apply_known_skill_lifecycle(
                    meta,
                    caster,
                    skill_id,
                    SkillPhase::Completed,
                    None,
                    out,
                );
            }
            ProtocolObservation::TeamInfoUpdated {
                team_id,
                leader_uuid,
            } => {
                let leader = leader_uuid.filter(|uuid| uuid.0 != 0);
                let mut members = self.team_members.clone();
                members.extend(leader);
                self.apply_team_state(meta, team_id, leader, members, out);
            }
            ProtocolObservation::TeamMembersUpdated { members } => {
                // Member notices are partial: the roster only grows until a
                // leave/dissolve notice prunes it.
                let mut next = self.team_members.clone();
                next.extend(members.into_iter().filter(|uuid| uuid.0 != 0));
                let (team_id, leader) = (self.team_id, self.team_leader);
                self.apply_team_state(meta, team_id, leader, next, out);
            }
            ProtocolObservation::TeamMemberLeft { member_uuid } => {
                if member_uuid.0 == 0 {
                    return;
                }
                if self.local_player == Some(member_uuid) {
                    self.apply_team_state(meta, 0, None, HashSet::new(), out);
                    return;
                }
                let mut next = self.team_members.clone();
                next.remove(&member_uuid);
                let team_id = self.team_id;
                let leader = self.team_leader.filter(|uuid| *uuid != member_uuid);
                self.apply_team_state(meta, team_id, leader, next, out);
            }
            ProtocolObservation::TeamDissolved => {
                self.apply_team_state(meta, 0, None, HashSet::new(), out);
            }
            ProtocolObservation::MatchmakingPopped => {
                self.emit(meta, DomainEvent::MatchmakingPopped, out);
            }
            ProtocolObservation::ReadyCheckStarted => {
                self.emit(meta, DomainEvent::ReadyCheckStarted, out);
            }
            ProtocolObservation::TeamVoteStarted { creator_uuid } => {
                if creator_uuid.is_some_and(|creator| self.local_player == Some(creator)) {
                    return;
                }
                self.emit(meta, DomainEvent::TeamVoteStarted, out);
            }
            ProtocolObservation::AttackTargetChanged {
                actor_uuid,
                target_uuid,
            } => {
                let Some(actor_uuid) = self.resolve_observation_uuid(actor_uuid) else {
                    return;
                };
                let actor = self.ensure_ref(actor_uuid);
                let previous_uuid = self.attack_targets.get(&actor_uuid).copied();
                if previous_uuid == target_uuid {
                    return;
                }
                let previous = previous_uuid.and_then(|uuid| self.entity_ref(uuid));
                let current = target_uuid.map(|uuid| self.ensure_ref(uuid));
                self.remove_attack_target(actor_uuid);
                if let Some(target) = target_uuid {
                    self.attack_targets.insert(actor_uuid, target);
                    self.attackers_by_target
                        .entry(target)
                        .or_default()
                        .insert(actor_uuid);
                }
                let epoch = self.target_epochs.entry(actor_uuid).or_default();
                *epoch = epoch.wrapping_add(1);
                let target_epoch = *epoch;
                self.emit(
                    meta,
                    DomainEvent::AttackTargetChanged {
                        actor,
                        previous,
                        current,
                        target_epoch,
                    },
                    out,
                );
            }
            ProtocolObservation::HitResolved(hit) => {
                let target = self.ensure_ref(hit.target_uuid);
                let source = hit.source_uuid.map(|uuid| self.ensure_ref(uuid));
                let packet_owner = hit.source_owner_uuid.map(|uuid| self.ensure_ref(uuid));
                let resolved_owner = packet_owner
                    .or_else(|| hit.source_uuid.and_then(|uuid| self.resolved_owner(uuid)));
                let source_identity = source.and_then(|entity| self.entity(entity.uuid));
                let owner_identity = resolved_owner.and_then(|entity| self.entity(entity.uuid));
                let source_kind = source_identity.map(|entity| entity.identity.kind);
                let target_identity = &self.entities[&target.uuid].identity;
                let source_is_player = owner_identity
                    .or(source_identity)
                    .is_some_and(|entity| entity.identity.kind == EntityKind::Character);
                let source_is_local_player = self.local_player.is_some_and(|local| {
                    resolved_owner.map(|owner| owner.uuid).or(hit.source_uuid) == Some(local)
                });
                let domain_hit = DomainHit {
                    channel: hit.channel,
                    source,
                    packet_owner,
                    resolved_owner,
                    target,
                    source_kind,
                    target_kind: target_identity.kind,
                    source_monster_id: source_identity
                        .and_then(|entity| entity.identity.monster_id),
                    target_monster_id: target_identity.monster_id,
                    target_is_boss: target_identity.is_boss_monster(),
                    source_is_player,
                    source_is_local_player,
                    skill_key: hit.skill_key,
                    skill_id: hit.skill_id,
                    type_flags: hit.type_flags,
                    kind: hit.kind,
                    amount: hit.amount,
                    has_loss_breakdown: hit.has_loss_breakdown,
                    hp_loss: hit.hp_loss,
                    shield_loss: hit.shield_loss,
                    is_lucky_bonus_only: hit.is_lucky_bonus_only,
                    property: hit.property,
                    damage_mode: hit.damage_mode,
                    effective_amount: hit.effective_amount,
                };
                self.emit(meta, DomainEvent::HitResolved(domain_hit), out);
            }
            ProtocolObservation::FantasyMarkerObserved {
                summon_uuid,
                source_config_id,
            } => {
                // The marker buff only identifies the summon; everything else
                // comes from the identity this context already tracks.
                let Some(entity) = self.entities.get(&summon_uuid) else {
                    return;
                };
                if entity.identity.kind != EntityKind::Monster {
                    return;
                }
                let (Some(summoner_uuid), Some(monster_id)) =
                    (entity.identity.owner_uuid, entity.identity.monster_id)
                else {
                    return;
                };
                let remodel_level = entity.identity.fantasy_tier.map_or(0, i64::from);
                self.apply_fantasy(
                    meta,
                    summon_uuid,
                    summoner_uuid,
                    monster_id,
                    remodel_level,
                    source_config_id,
                    out,
                );
            }
            ProtocolObservation::SkillLifecycleChanged {
                caster_uuid,
                skill_id,
                phase,
                target_uuid,
            } => {
                let Some(caster_uuid) = self.resolve_observation_uuid(caster_uuid) else {
                    return;
                };
                // The local player's lifecycle is driven by the authoritative
                // client request / server end packets instead.
                if self.local_player == Some(caster_uuid) {
                    return;
                }
                let caster = self.ensure_ref(caster_uuid);
                let target = target_uuid.map(|uuid| self.ensure_ref(uuid));
                if self.identity_is_known(caster_uuid) {
                    self.apply_known_skill_lifecycle(meta, caster, skill_id, phase, target, out);
                } else if self.watched_skill_ids.contains(&skill_id) {
                    self.pending_skills_by_caster
                        .entry(caster_uuid)
                        .or_default()
                        .push(PendingSkill {
                            meta,
                            skill_id,
                            phase,
                            target,
                        });
                    self.pending_skill_expiries.push_back((
                        meta.mono_ms().saturating_add(PENDING_SKILL_MAX_AGE_MS),
                        caster_uuid,
                    ));
                }
            }
            ProtocolObservation::SkillCooldownUpdated {
                entity_uuid,
                cooldowns,
            } => {
                let Some(entity_uuid) = self.resolve_observation_uuid(entity_uuid) else {
                    return;
                };
                let entity_ref = self.ensure_ref(entity_uuid);
                let state = self.entities.get_mut(&entity_uuid).expect("ensured above");
                // SyncSkillCDs is incremental (full snapshots are rare). Upsert by
                // skill_level_id so unchanged skills are retained across packets.
                for cooldown in &cooldowns {
                    if let Some(existing) = state
                        .skill_cooldowns
                        .iter_mut()
                        .find(|entry| entry.skill_level_id == cooldown.skill_level_id)
                    {
                        if *existing != *cooldown {
                            *existing = *cooldown;
                        }
                    } else {
                        state.skill_cooldowns.push(*cooldown);
                    }
                }
                // Every SyncSkillCDs packet is an authoritative progress sample.
                // Forward identical repeats as well so presentation can reset its
                // local interpolation clock, matching the pre-pipeline monitor.
                self.emit(
                    meta,
                    DomainEvent::SkillCooldownUpdated {
                        entity: entity_ref,
                        cooldowns,
                    },
                    out,
                );
            }
            ProtocolObservation::ShieldDetailsUpdated {
                entity_uuid,
                entries,
            } => {
                let Some(entity_uuid) = self.resolve_observation_uuid(entity_uuid) else {
                    return;
                };
                let entity_ref = self.ensure_ref(entity_uuid);
                let state = self.entities.get_mut(&entity_uuid).expect("ensured above");
                if state.shield_details == entries {
                    return;
                }
                state.shield_details.clone_from(&entries);
                let resolved = entries
                    .into_iter()
                    .map(|detail| self.resolve_shield_detail(entity_uuid, detail))
                    .collect();
                self.emit(
                    meta,
                    DomainEvent::ShieldDetailsUpdated {
                        entity: entity_ref,
                        entries: resolved,
                    },
                    out,
                );
            }
            ProtocolObservation::TempAttributeUpdated {
                entity_uuid,
                attr_id,
                value,
                origin,
            } => {
                let Some(entity_uuid) = self.resolve_observation_uuid(entity_uuid) else {
                    return;
                };
                self.apply_temp_attribute(meta, entity_uuid, attr_id, value, origin, out);
            }
            ProtocolObservation::FightResourceLayout {
                entity_uuid,
                resource_ids,
            } => {
                let Some(entity_uuid) = self.resolve_observation_uuid(entity_uuid) else {
                    return;
                };
                // The layout is the positional axis for the values packet:
                // it must be stored in wire order. Sorting, deduplicating or
                // filtering would shift positions and misalign the zip.
                let entity_ref = self.ensure_ref(entity_uuid);
                let state = self.entities.get_mut(&entity_uuid).expect("ensured above");
                if state.fight_resource_ids == resource_ids {
                    return;
                }
                // Drop values whose id left the layout so a re-added id
                // re-emits with `previous: None` instead of comparing
                // against a stale value.
                state
                    .fight_resources
                    .retain(|resource_id, _| resource_ids.contains(resource_id));
                let previous =
                    std::mem::replace(&mut state.fight_resource_ids, resource_ids.clone());
                self.emit(
                    meta,
                    DomainEvent::FightResourceLayoutChanged {
                        entity: entity_ref,
                        previous,
                        current: resource_ids,
                    },
                    out,
                );
            }
            ProtocolObservation::FightResourceValues {
                entity_uuid,
                values,
                origin,
            } => {
                let Some(entity_uuid) = self.resolve_observation_uuid(entity_uuid) else {
                    return;
                };
                let entity_ref = self.ensure_ref(entity_uuid);
                let state = self.entities.get_mut(&entity_uuid).expect("ensured above");
                // Values are positional against the layout; without it the
                // resource ids are unknowable and the packet is dropped.
                let resource_ids = std::mem::take(&mut state.fight_resource_ids);
                let changes: Vec<_> = resource_ids
                    .iter()
                    .copied()
                    .zip(values)
                    .filter_map(|(resource_id, current)| {
                        let previous = state.fight_resources.insert(resource_id, current);
                        (previous != Some(current)).then_some((resource_id, previous, current))
                    })
                    .collect();
                state.fight_resource_ids = resource_ids;
                for (resource_id, previous, current) in changes {
                    self.emit(
                        meta,
                        DomainEvent::FightResourceChanged {
                            entity: entity_ref,
                            resource_id,
                            previous,
                            current,
                            is_baseline: origin == ObservationOrigin::Snapshot,
                        },
                        out,
                    );
                }
            }
            ProtocolObservation::SceneChanged {
                scene_id,
                difficulty,
            } => {
                self.reset_combat_lifecycles();
                // Scene transitions never send per-entity leave packets, so
                // the old scene is despawned explicitly.
                let mut stale: Vec<_> = self
                    .entities
                    .values()
                    .filter(|entity| {
                        entity.is_present && Some(entity.entity.uuid) != self.local_player
                    })
                    .map(|entity| entity.entity.uuid)
                    .collect();
                stale.sort_unstable();
                for uuid in stale {
                    self.despawn_entity(meta, uuid, out);
                }
                let previous_scene_id = self.current_scene_id.replace(scene_id);
                self.current_difficulty = difficulty;
                if previous_scene_id != Some(scene_id) {
                    self.emit(
                        meta,
                        DomainEvent::SceneChanged {
                            previous_scene_id,
                            scene_id,
                            difficulty,
                        },
                        out,
                    );
                }
            }
            ProtocolObservation::DungeonFlowChanged { state } => {
                let previous = self.dungeon_flow_state.replace(state);
                if previous != Some(state) {
                    self.emit(
                        meta,
                        DomainEvent::DungeonFlowChanged {
                            previous,
                            current: state,
                        },
                        out,
                    );
                }
            }
            ProtocolObservation::DungeonObjectiveChanged {
                target_id,
                count,
                complete,
            } => self.emit(
                meta,
                DomainEvent::DungeonObjectiveChanged {
                    target_id,
                    count,
                    complete,
                },
                out,
            ),
            ProtocolObservation::DungeonProgressStateChanged { value } => {
                let previous = self.progress_state.replace(value);
                if previous != Some(value) {
                    self.emit(
                        meta,
                        DomainEvent::DungeonProgressStateChanged {
                            previous,
                            current: value,
                        },
                        out,
                    );
                }
            }
            ProtocolObservation::SeasonCultivateSnapshot {
                season_id,
                active_template_ids,
                active_item_ids,
            } => {
                let normalized_items = normalized_ids(active_item_ids);
                let normalized_templates = normalized_ids(active_template_ids);
                self.active_season_items = normalized_items.iter().copied().collect();
                self.active_season_id = season_id;
                self.active_season_template_ids = normalized_templates.clone();
                self.emit(
                    meta,
                    DomainEvent::SeasonCultivateChanged {
                        season_id,
                        active_template_ids: normalized_templates,
                        active_item_ids: normalized_items,
                        is_baseline: true,
                    },
                    out,
                );
            }
            ProtocolObservation::SeasonCultivateDelta {
                season_id,
                active_template_ids,
                activated_item_ids,
                deactivated_item_ids,
            } => {
                let mut changed = false;
                for id in activated_item_ids {
                    changed |= self.active_season_items.insert(id);
                }
                for id in deactivated_item_ids {
                    changed |= self.active_season_items.remove(&id);
                }
                // Which template is equipped and which middle-node item
                // sockets are filled are independent, so the template set
                // can change even when the item diff above is empty;
                // compare full snapshots for it.
                let normalized_templates = normalized_ids(active_template_ids);
                if self.active_season_id != season_id {
                    self.active_season_id = season_id;
                    changed = true;
                }
                if self.active_season_template_ids != normalized_templates {
                    self.active_season_template_ids = normalized_templates;
                    changed = true;
                }
                if changed {
                    let mut active_item_ids: Vec<_> =
                        self.active_season_items.iter().copied().collect();
                    active_item_ids.sort_unstable();
                    self.emit(
                        meta,
                        DomainEvent::SeasonCultivateChanged {
                            season_id: self.active_season_id,
                            active_template_ids: self.active_season_template_ids.clone(),
                            active_item_ids,
                            is_baseline: false,
                        },
                        out,
                    );
                }
            }
            ProtocolObservation::PassiveSkillObserved(observation) => {
                self.apply_passive_skill(meta, observation, out);
            }
            ProtocolObservation::BossMechanicStarted(mechanic) => {
                self.emit(meta, DomainEvent::BossMechanicStarted(mechanic), out);
            }
            ProtocolObservation::GameTimerSnapshot { timers } => {
                self.game_timers = timers
                    .iter()
                    .cloned()
                    .map(|timer| (timer.key, timer))
                    .collect();
                self.emit(meta, DomainEvent::GameTimerSnapshot { timers }, out);
            }
            ProtocolObservation::GameTimerUpserted { timer } => {
                let mut changed = true;
                match self.game_timers.entry(timer.key) {
                    std::collections::hash_map::Entry::Occupied(mut entry) => {
                        if entry.get() == &timer {
                            changed = false;
                        } else {
                            entry.get_mut().clone_from(&timer);
                        }
                    }
                    std::collections::hash_map::Entry::Vacant(entry) => {
                        entry.insert(timer.clone());
                    }
                }
                if changed {
                    self.emit(meta, DomainEvent::GameTimerChanged(timer), out);
                }
            }
            ProtocolObservation::PauseChanged { is_paused } => {
                if self.is_paused != is_paused {
                    self.is_paused = is_paused;
                    self.emit(meta, DomainEvent::PauseChanged { is_paused }, out);
                }
            }
        }
    }

    /// Applies a fully resolved team state and emits the membership deltas
    /// plus a single roster event when anything actually moved.
    fn apply_team_state(
        &mut self,
        meta: EventMeta,
        team_id: i64,
        leader_uuid: Option<EntityUuid>,
        members: HashSet<EntityUuid>,
        out: &mut Vec<DomainEnvelope>,
    ) {
        let mut removed: Vec<_> = self.team_members.difference(&members).copied().collect();
        let mut added: Vec<_> = members.difference(&self.team_members).copied().collect();
        if removed.is_empty()
            && added.is_empty()
            && self.team_id == team_id
            && self.team_leader == leader_uuid
        {
            return;
        }
        removed.sort_unstable();
        added.sort_unstable();
        self.team_members = members;
        self.team_id = team_id;
        self.team_leader = leader_uuid;
        for uuid in removed {
            let entity = self.ensure_ref(uuid);
            self.emit(
                meta,
                DomainEvent::TeamMembershipChanged {
                    entity,
                    is_member: false,
                },
                out,
            );
        }
        for uuid in added {
            let entity = self.ensure_ref(uuid);
            self.emit(
                meta,
                DomainEvent::TeamMembershipChanged {
                    entity,
                    is_member: true,
                },
                out,
            );
        }

        let leader = leader_uuid.map(|uuid| self.ensure_ref(uuid));
        let member_uuids: Vec<_> = self.team_members.iter().copied().collect();
        let mut member_refs: Vec<_> = member_uuids
            .into_iter()
            .map(|uuid| self.ensure_ref(uuid))
            .collect();
        member_refs.sort_unstable();
        self.emit(
            meta,
            DomainEvent::TeamChanged {
                team_id,
                leader,
                members: member_refs,
            },
            out,
        );
    }

    fn apply_buff_snapshot(
        &mut self,
        meta: EventMeta,
        target_uuid: EntityUuid,
        buffs: Vec<ObservedBuff>,
        out: &mut Vec<DomainEnvelope>,
    ) {
        if !self.accepts_buff_upsert(target_uuid) {
            return;
        }
        let target = self.ensure_ref(target_uuid);
        for observed in buffs {
            let previous_layer = self.entities[&target_uuid]
                .active_buffs
                .get(&observed.instance_id)
                .map(|buff| buff.layer);
            let state = self.resolve_buff_state(meta, target, observed);
            self.entities
                .get_mut(&target_uuid)
                .expect("ensured above")
                .active_buffs
                .insert(state.instance_id, state.clone());
            let event = BuffEvent {
                transition: BuffTransition::Baseline,
                wire_kind: BuffWireKind::Snapshot,
                duration_updated: false,
                previous_layer,
                state,
                target_roles: self.roles(target_uuid),
            };
            self.emit(meta, DomainEvent::BuffChanged(event), out);
        }
    }

    fn apply_buff_change(
        &mut self,
        meta: EventMeta,
        target_uuid: EntityUuid,
        change: ObservedBuffChange,
        out: &mut Vec<DomainEnvelope>,
    ) {
        match change {
            ObservedBuffChange::Applied { buff } => {
                if !self.accepts_buff_upsert(target_uuid) {
                    return;
                }
                let target = self.ensure_ref(target_uuid);
                let previous_layer = self.entities[&target_uuid]
                    .active_buffs
                    .get(&buff.instance_id)
                    .map(|buff| buff.layer);
                let state = self.resolve_buff_state(meta, target, buff);
                self.entities
                    .get_mut(&target_uuid)
                    .expect("ensured above")
                    .active_buffs
                    .insert(state.instance_id, state.clone());
                let transition = match previous_layer {
                    None => BuffTransition::Applied,
                    Some(layer) if layer != state.layer => BuffTransition::LayerChanged,
                    Some(_) => BuffTransition::Refreshed,
                };
                let event = BuffEvent {
                    transition,
                    wire_kind: BuffWireKind::Add,
                    duration_updated: false,
                    previous_layer,
                    state,
                    target_roles: self.roles(target_uuid),
                };
                let wipe_detected = event.transition == BuffTransition::Applied
                    && event.state.base_id == WIPE_BUFF_BASE_ID
                    && event.target_roles.is_local_player;
                let wipe_instance_id = event.state.instance_id;
                self.emit(meta, DomainEvent::BuffChanged(event), out);
                if wipe_detected {
                    self.emit(
                        meta,
                        DomainEvent::WipeDetected {
                            entity: Some(target),
                            buff_instance_id: Some(wipe_instance_id),
                        },
                        out,
                    );
                }
            }
            ObservedBuffChange::Delta {
                instance_id,
                layer,
                duration_ms,
                create_time,
                effect_ids,
            } => {
                let clock_offset_ms = self.server_clock_offset_ms;
                let Some(existing) = self
                    .entities
                    .get_mut(&target_uuid)
                    .and_then(|entity| entity.active_buffs.get_mut(&instance_id))
                else {
                    // A delta without a known instance cannot be
                    // reconstructed; the next snapshot re-establishes it.
                    return;
                };
                let previous_layer = existing.layer;
                if let Some(layer) = layer {
                    existing.layer = layer;
                }
                if let Some(duration_ms) = duration_ms {
                    existing.duration_ms = Some(duration_ms);
                }
                if let Some(effect_ids) = effect_ids {
                    existing.effect_ids = effect_ids;
                }
                if let Some(create_time) = create_time {
                    apply_buff_create_time(existing, create_time, meta, clock_offset_ms);
                } else if duration_ms.is_some() {
                    existing.started_mono_ms = Some(meta.mono_ms());
                    existing.started_wall_ms = Some(meta.captured_wall_ms);
                    refresh_buff_deadlines(existing);
                }
                let state = existing.clone();
                let transition = if state.layer == previous_layer {
                    BuffTransition::Refreshed
                } else {
                    BuffTransition::LayerChanged
                };
                let event = BuffEvent {
                    transition,
                    wire_kind: BuffWireKind::Change,
                    duration_updated: duration_ms.is_some(),
                    previous_layer: Some(previous_layer),
                    state,
                    target_roles: self.roles(target_uuid),
                };
                self.emit(meta, DomainEvent::BuffChanged(event), out);
            }
            ObservedBuffChange::Remove { instance_id } => {
                let Some(state) = self
                    .entities
                    .get_mut(&target_uuid)
                    .and_then(|entity| entity.active_buffs.remove(&instance_id))
                else {
                    return;
                };
                let event = BuffEvent {
                    transition: BuffTransition::Removed,
                    wire_kind: BuffWireKind::Remove,
                    duration_updated: false,
                    previous_layer: Some(state.layer),
                    state,
                    target_roles: self.roles(target_uuid),
                };
                self.emit(meta, DomainEvent::BuffChanged(event), out);
            }
        }
    }

    fn accepts_buff_upsert(&self, target_uuid: EntityUuid) -> bool {
        !self
            .entities
            .get(&target_uuid)
            .is_some_and(|entity| entity.has_been_present && !entity.is_present)
    }

    fn resolve_buff_state(
        &mut self,
        meta: EventMeta,
        target: EntityRef,
        observed: ObservedBuff,
    ) -> BuffState {
        let source = observed.source_uuid.map(|uuid| self.ensure_ref(uuid));
        let resolved_owner = observed
            .source_uuid
            .and_then(|uuid| self.resolved_owner(uuid));
        let mut state = BuffState {
            target,
            instance_id: observed.instance_id,
            base_id: observed.base_id,
            layer: observed.layer,
            source,
            resolved_owner,
            source_config_id: observed.source_config_id,
            duration_ms: observed.duration_ms,
            started_wall_ms: Some(observed.started_wall_ms.unwrap_or(meta.captured_wall_ms)),
            expires_wall_ms: None,
            started_mono_ms: Some(observed.started_mono_ms.unwrap_or_else(|| meta.mono_ms())),
            expires_mono_ms: None,
            effect_ids: observed.effect_ids,
        };
        refresh_buff_deadlines(&mut state);
        state
    }

    fn apply_fantasy(
        &mut self,
        meta: EventMeta,
        summon_uuid: EntityUuid,
        summoner_uuid: EntityUuid,
        monster_id: i32,
        remodel_level: i64,
        source_config_id: Option<i32>,
        out: &mut Vec<DomainEnvelope>,
    ) {
        if !is_resonance_fantasy_monster_id(monster_id) {
            return;
        }
        let summon = self.ensure_ref(summon_uuid);
        let summoner = self.ensure_ref(summoner_uuid);
        let observed = FantasyState {
            summon,
            summoner,
            monster_id,
            remodel_level,
            resonance_skill_id: resolve_fantasy_skill_id(monster_id, source_config_id),
        };
        self.fantasy_registry.register_summon(
            summon_uuid,
            summoner_uuid,
            monster_id,
            remodel_level,
            source_config_id,
        );
        let transition = if self.fantasies.contains_key(&summon_uuid) {
            FantasyTransition::Updated
        } else {
            FantasyTransition::Summoned
        };
        self.fantasies.insert(summon_uuid, observed);
        self.emit(
            meta,
            DomainEvent::FantasyChanged {
                transition,
                fantasy: observed,
            },
            out,
        );
    }

    fn end_fantasy(
        &mut self,
        meta: EventMeta,
        summon_uuid: EntityUuid,
        out: &mut Vec<DomainEnvelope>,
    ) {
        let Some(fantasy) = self.fantasies.remove(&summon_uuid) else {
            return;
        };
        self.emit(
            meta,
            DomainEvent::FantasyChanged {
                transition: FantasyTransition::Ended,
                fantasy,
            },
            out,
        );
    }

    fn apply_temp_attribute(
        &mut self,
        meta: EventMeta,
        entity_uuid: EntityUuid,
        attr_id: i32,
        value: i32,
        origin: ObservationOrigin,
        out: &mut Vec<DomainEnvelope>,
    ) {
        let entity = self.ensure_ref(entity_uuid);
        let state = self.entities.get_mut(&entity_uuid).expect("ensured above");
        let previous = state.temp_attributes.insert(attr_id, value);
        if previous == Some(value) {
            return;
        }
        self.emit(
            meta,
            DomainEvent::TempAttributeChanged {
                entity,
                attr_id,
                previous,
                current: value,
                is_baseline: origin == ObservationOrigin::Snapshot,
            },
            out,
        );
    }

    fn apply_passive_skill(
        &mut self,
        meta: EventMeta,
        observation: PassiveSkillObservation,
        out: &mut Vec<DomainEnvelope>,
    ) {
        let passive_instance_id = observation.passive_instance_id;
        let observed_uuid = self.resolve_observation_uuid(observation.entity_uuid);
        // End packets identify the instance only, so the start descriptor is
        // replayed on the way out.
        let wire = if observation.ended {
            if let Some(started) = self.forget_passive_instance(passive_instance_id) {
                started
            } else {
                let Some(entity_uuid) = observed_uuid.filter(|_| observation.skill_id != 0) else {
                    return;
                };
                PassiveWireState {
                    entity_uuid,
                    skill_id: observation.skill_id,
                    target_position: observation.target_position,
                }
            }
        } else {
            let Some(entity_uuid) = observed_uuid else {
                return;
            };
            let observed = PassiveWireState {
                entity_uuid,
                skill_id: observation.skill_id,
                target_position: observation.target_position,
            };
            self.passive_skills.insert(passive_instance_id, observed);
            self.passive_instances_by_entity
                .entry(entity_uuid)
                .or_default()
                .insert(passive_instance_id);
            observed
        };
        let entity = self.ensure_ref(wire.entity_uuid);
        self.emit(
            meta,
            DomainEvent::PassiveSkillObserved {
                entity,
                passive_instance_id,
                skill_id: wire.skill_id,
                target_position: wire.target_position,
                ended: observation.ended,
            },
            out,
        );
    }

    fn forget_passive_instance(&mut self, passive_instance_id: i32) -> Option<PassiveWireState> {
        let started = self.passive_skills.remove(&passive_instance_id)?;
        if let Some(instances) = self
            .passive_instances_by_entity
            .get_mut(&started.entity_uuid)
        {
            instances.remove(&passive_instance_id);
            if instances.is_empty() {
                self.passive_instances_by_entity
                    .remove(&started.entity_uuid);
            }
        }
        Some(started)
    }

    fn forget_passive_skills(&mut self, uuid: EntityUuid) {
        let Some(instances) = self.passive_instances_by_entity.remove(&uuid) else {
            return;
        };
        for passive_instance_id in instances {
            self.passive_skills.remove(&passive_instance_id);
        }
    }

    /// Clears all per-generation state of an entity and reports the departure.
    fn despawn_entity(&mut self, meta: EventMeta, uuid: EntityUuid, out: &mut Vec<DomainEnvelope>) {
        self.flush_pending_death(uuid, meta, out);
        let Some(entity_ref) = self.entities.get(&uuid).map(|entity| entity.entity) else {
            return;
        };
        self.end_fantasy(meta, uuid, out);
        if let Some(entity) = self.entities.get_mut(&uuid) {
            entity.is_present = false;
            entity.hate_entries.clear();
            entity.positions.clear();
            entity.active_buffs.clear();
            entity.skill_cooldowns.clear();
            entity.shield_details.clear();
            entity.temp_attributes.clear();
            entity.fight_resource_ids.clear();
            entity.fight_resources.clear();
            entity.attributes.clear();
        }
        self.remove_attack_target(uuid);
        self.target_epochs.remove(&uuid);
        self.pending_skills_by_caster.remove(&uuid);
        self.skill_lifecycles.remove(&uuid);
        self.forget_passive_skills(uuid);
        self.emit(
            meta,
            DomainEvent::EntityDisappeared { entity: entity_ref },
            out,
        );
    }

    fn resolve_shield_detail(
        &self,
        entity_uuid: EntityUuid,
        detail: ShieldDetail,
    ) -> ResolvedShieldDetail {
        let buff = self
            .entities
            .get(&entity_uuid)
            .and_then(|entity| entity.active_buffs.get(&detail.buff_instance_id));
        ResolvedShieldDetail {
            detail,
            base_id: buff.map(|buff| buff.base_id),
            expires_wall_ms: buff.and_then(|buff| buff.expires_wall_ms),
        }
    }

    /// Resolves the [`LOCAL_PLAYER`] sentinel used by observations that address
    /// the local player without knowing its uuid. Observations that arrive
    /// before the local player is known are dropped by the caller.
    fn resolve_observation_uuid(&self, uuid: EntityUuid) -> Option<EntityUuid> {
        if uuid == LOCAL_PLAYER {
            self.local_player
        } else {
            Some(uuid)
        }
    }

    fn ensure_ref(&mut self, uuid: EntityUuid) -> EntityRef {
        let uuid = self.resolve_observation_uuid(uuid).unwrap_or(uuid);
        self.entities
            .entry(uuid)
            .or_insert_with(|| EntityState::new(uuid))
            .entity
    }

    fn identity_is_known(&self, uuid: EntityUuid) -> bool {
        self.entities
            .get(&uuid)
            .is_some_and(|entity| entity.identity.kind != EntityKind::Unknown)
    }

    fn flush_pending_skills(
        &mut self,
        uuid: EntityUuid,
        now: MonoTimeMs,
        out: &mut Vec<DomainEnvelope>,
    ) {
        let Some(pending) = self.pending_skills_by_caster.remove(&uuid) else {
            return;
        };
        let Some(caster) = self.entity_ref(uuid) else {
            return;
        };
        for skill in pending.into_iter().filter(|skill| {
            now.0.saturating_sub(skill.meta.mono_ms().0) <= PENDING_SKILL_MAX_AGE_MS
        }) {
            self.apply_known_skill_lifecycle(
                skill.meta,
                caster,
                skill.skill_id,
                skill.phase,
                skill.target,
                out,
            );
        }
    }

    fn expire_pending_skills(&mut self, now: MonoTimeMs) {
        let cutoff = now.saturating_sub(PENDING_SKILL_MAX_AGE_MS);
        while self
            .pending_skill_expiries
            .front()
            .is_some_and(|(deadline, _)| *deadline < now)
        {
            let (_, caster) = self
                .pending_skill_expiries
                .pop_front()
                .expect("checked pending skill expiry");
            let remove = self
                .pending_skills_by_caster
                .get_mut(&caster)
                .is_some_and(|pending| {
                    pending.retain(|skill| skill.meta.mono_ms() >= cutoff);
                    pending.is_empty()
                });
            if remove {
                self.pending_skills_by_caster.remove(&caster);
            }
        }
    }

    fn remove_attack_target(&mut self, actor: EntityUuid) -> Option<EntityUuid> {
        let target = self.attack_targets.remove(&actor)?;
        let remove_target = self
            .attackers_by_target
            .get_mut(&target)
            .is_some_and(|attackers| {
                attackers.remove(&actor);
                attackers.is_empty()
            });
        if remove_target {
            self.attackers_by_target.remove(&target);
        }
        Some(target)
    }

    fn apply_known_skill_lifecycle(
        &mut self,
        meta: EventMeta,
        caster: EntityRef,
        skill_id: i32,
        phase: super::events::SkillPhase,
        target: Option<EntityRef>,
        out: &mut Vec<DomainEnvelope>,
    ) {
        use super::events::SkillPhase;

        let skill = ActiveSkill { skill_id, target };
        let mut transitions = Vec::with_capacity(3);
        match phase {
            SkillPhase::CastStarted => {
                transitions.push(skill_phase(skill, SkillPhase::CastStarted));
                if IMMEDIATE_COMPLETE_SKILL_IDS.contains(&skill_id) {
                    transitions.push(skill_phase(skill, SkillPhase::Completed));
                } else {
                    let lifecycle = self.skill_lifecycles.entry(caster.uuid).or_default();
                    lifecycle.pending_main_casts.push_back(skill);
                    if lifecycle.duration_skill.is_none() {
                        lifecycle.duration_skill = Some(skill);
                        transitions.push(skill_phase(skill, SkillPhase::DurationStarted));
                    }
                }
            }
            SkillPhase::Completed => {
                let remove_lifecycle;
                {
                    let Some(lifecycle) = self.skill_lifecycles.get_mut(&caster.uuid) else {
                        return;
                    };
                    let Some(index) = lifecycle
                        .pending_main_casts
                        .iter()
                        .position(|pending| pending.skill_id == skill_id)
                    else {
                        return;
                    };
                    let was_front = index == 0;
                    let completed = lifecycle
                        .pending_main_casts
                        .remove(index)
                        .expect("matched pending skill index");
                    if was_front && lifecycle.duration_skill == Some(completed) {
                        lifecycle.duration_skill = None;
                        transitions.push(skill_phase(completed, SkillPhase::DurationEnded));
                        if let Some(next) = lifecycle.pending_main_casts.front().copied() {
                            lifecycle.duration_skill = Some(next);
                            transitions.push(skill_phase(next, SkillPhase::DurationStarted));
                        }
                    }
                    transitions.push(skill_phase(completed, SkillPhase::Completed));
                    remove_lifecycle = lifecycle.pending_main_casts.is_empty();
                }
                if remove_lifecycle {
                    self.skill_lifecycles.remove(&caster.uuid);
                }
            }
            SkillPhase::Observed | SkillPhase::DurationStarted | SkillPhase::DurationEnded => {
                transitions.push((skill_id, phase, target));
            }
        }

        for (skill_id, phase, target) in transitions {
            self.emit(
                meta,
                DomainEvent::SkillLifecycleChanged {
                    caster,
                    skill_id,
                    phase,
                    target,
                },
                out,
            );
        }
    }

    #[must_use]
    pub(crate) fn resolved_owner(&self, uuid: EntityUuid) -> Option<EntityRef> {
        let mut current = uuid;
        for _ in 0..8 {
            let entity = self.entities.get(&current)?;
            let Some(owner) = entity.identity.owner_uuid else {
                return Some(entity.entity);
            };
            if owner == current {
                return Some(entity.entity);
            }
            current = owner;
        }
        self.entity_ref(current)
    }

    /// Death replay only records player-side victims: `CombatHitFact::from_domain`
    /// requires `target_kind == EntityKind::Character` to emit a `DamageTaken`
    /// fact at all, so `DeathProjection`'s replay window can never hold pending
    /// damage for a non-`Character` victim (including `Dummy` and `Unknown`,
    /// whose identity has not resolved yet). Cloning every entity's buff list
    /// for such a death would be built and immediately dropped, so this is
    /// gated on the exact kind the replay path can ever consume.
    fn death_buff_checkpoint_for(&self, uuid: EntityUuid) -> DeathBuffCheckpoint {
        let kind = self
            .entities
            .get(&uuid)
            .map_or(EntityKind::Unknown, |entity| entity.identity.kind);
        if kind == EntityKind::Character {
            self.death_buff_checkpoint()
        } else {
            DeathBuffCheckpoint::default()
        }
    }

    fn cancel_pending_death(&mut self, uuid: EntityUuid) {
        self.pending_deaths
            .retain(|death| death.victim.uuid != uuid);
    }

    fn flush_pending_death(
        &mut self,
        uuid: EntityUuid,
        meta: EventMeta,
        out: &mut Vec<DomainEnvelope>,
    ) {
        let pending = std::mem::take(&mut self.pending_deaths);
        let mut remaining = Vec::with_capacity(pending.len());
        for death in pending {
            if death.victim.uuid == uuid {
                self.emit_pending_death(meta, death, out);
            } else {
                remaining.push(death);
            }
        }
        self.pending_deaths = remaining;
    }

    fn flush_pending_deaths(&mut self, meta: EventMeta, out: &mut Vec<DomainEnvelope>) {
        let pending = std::mem::take(&mut self.pending_deaths);
        for death in pending {
            self.emit_pending_death(meta, death, out);
        }
    }

    fn emit_pending_death(
        &mut self,
        meta: EventMeta,
        death: PendingDeath,
        out: &mut Vec<DomainEnvelope>,
    ) {
        self.emit(
            meta,
            DomainEvent::DeathOccurred {
                victim: death.victim,
                killer: None,
                skill_key: None,
                buff_checkpoint: death.buff_checkpoint,
            },
            out,
        );
    }

    fn death_buff_checkpoint(&self) -> DeathBuffCheckpoint {
        let buffs = self
            .entities
            .values()
            .filter_map(|entity| {
                (!entity.active_buffs.is_empty()).then(|| {
                    (
                        entity.entity,
                        entity.active_buffs.values().cloned().collect(),
                    )
                })
            })
            .collect();
        DeathBuffCheckpoint::new(buffs)
    }

    fn emit(&mut self, meta: EventMeta, event: DomainEvent, out: &mut Vec<DomainEnvelope>) {
        out.push(DomainEnvelope {
            // LiveCore assigns the strict sequence while interleaving derived
            // events such as CombatHitAccepted with protocol-domain events.
            sequence: 0,
            batch_id: meta.batch_id,
            occurred_at_ms: meta.captured_wall_ms,
            meta,
            event_index: 0,
            segment_id: None::<SegmentId>,
            event,
        });
    }
}

fn apply_identity_patch(identity: &mut EntityIdentity, patch: EntityIdentityPatch) {
    apply_required_patch(&mut identity.kind, patch.kind, EntityKind::Unknown);
    apply_optional_patch(&mut identity.name, patch.name);
    apply_optional_patch(&mut identity.monster_id, patch.monster_id);
    apply_optional_patch(&mut identity.profession_id, patch.profession_id);
    apply_optional_patch(&mut identity.owner_uuid, patch.owner_uuid);
    apply_optional_patch(&mut identity.fantasy_tier, patch.fantasy_tier);
    apply_required_patch(&mut identity.is_boss, patch.is_boss, false);
}

fn apply_optional_patch<T>(target: &mut Option<T>, patch: FieldPatch<T>) {
    match patch {
        FieldPatch::Unchanged => {}
        FieldPatch::Set(value) => *target = Some(value),
        FieldPatch::Clear => *target = None,
    }
}

fn apply_required_patch<T>(target: &mut T, patch: FieldPatch<T>, clear_value: T) {
    match patch {
        FieldPatch::Unchanged => {}
        FieldPatch::Set(value) => *target = value,
        FieldPatch::Clear => *target = clear_value,
    }
}

/// Re-anchors a buff on the server-side creation timestamp carried by a delta.
/// Without a known server clock offset the packet itself is the only anchor.
fn apply_buff_create_time(
    buff: &mut BuffState,
    create_time: i64,
    meta: EventMeta,
    clock_offset_ms: Option<i64>,
) {
    let started_wall_ms = clock_offset_ms.map_or(meta.captured_wall_ms, |offset| {
        create_time.saturating_add(offset)
    });
    let elapsed_ms = meta.captured_wall_ms.saturating_sub(started_wall_ms);
    let captured_mono_ms = meta.mono_ms().0;
    let started_mono_ms = if elapsed_ms >= 0 {
        captured_mono_ms.saturating_sub(u64::try_from(elapsed_ms).unwrap_or(u64::MAX))
    } else {
        captured_mono_ms.saturating_add(elapsed_ms.unsigned_abs())
    };
    buff.started_wall_ms = Some(started_wall_ms);
    buff.started_mono_ms = Some(MonoTimeMs(started_mono_ms));
    refresh_buff_deadlines(buff);
}

fn refresh_buff_deadlines(buff: &mut BuffState) {
    buff.expires_mono_ms = None;
    buff.expires_wall_ms = None;
    let Some(duration_ms) = buff.duration_ms.filter(|duration| *duration > 0) else {
        return;
    };
    if let Some(started_mono_ms) = buff.started_mono_ms {
        buff.expires_mono_ms = Some(started_mono_ms.saturating_add(duration_ms));
    }
    if let Some(started_wall_ms) = buff.started_wall_ms {
        buff.expires_wall_ms =
            Some(started_wall_ms.saturating_add(i64::try_from(duration_ms).unwrap_or(i64::MAX)));
    }
}

fn normalized_ids(mut ids: Vec<i32>) -> Vec<i32> {
    let mut seen = HashSet::with_capacity(ids.len());
    ids.retain(|id| *id > 0 && seen.insert(*id));
    ids
}

fn skill_phase(
    skill: ActiveSkill,
    phase: super::events::SkillPhase,
) -> (i32, super::events::SkillPhase, Option<EntityRef>) {
    (skill.skill_id, phase, skill.target)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::super::events::{BatchId, HitChannel, HitKind, MonoTimeMs, ObservedHit};
    use super::*;

    fn meta(batch: u64) -> EventMeta {
        EventMeta {
            batch_id: BatchId(batch),
            capture_sequence: batch,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 10_000 + batch as i64,
            captured_mono_ns: batch * 1_000_000,
            source_time_ms: None,
        }
    }

    fn batch(batch: u64, observations: Vec<ProtocolObservation>) -> ProtocolBatch {
        ProtocolBatch {
            meta: meta(batch),
            observations,
        }
    }

    fn buff(instance_id: i64, base_id: i32) -> ObservedBuff {
        ObservedBuff {
            instance_id,
            base_id,
            layer: 1,
            source_uuid: None,
            source_config_id: None,
            duration_ms: Some(5_000),
            started_wall_ms: None,
            expires_wall_ms: None,
            started_mono_ms: None,
            expires_mono_ms: None,
            effect_ids: Arc::from([]),
        }
    }

    fn buff_delta(instance_id: i64, layer: Option<i32>) -> ObservedBuffChange {
        ObservedBuffChange::Delta {
            instance_id,
            layer,
            duration_ms: Some(5_000),
            create_time: None,
            effect_ids: None,
        }
    }

    fn skill_phases(events: &[DomainEnvelope]) -> Vec<super::super::events::SkillPhase> {
        events
            .iter()
            .filter_map(|envelope| match envelope.event {
                DomainEvent::SkillLifecycleChanged { phase, .. } => Some(phase),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn uuid_updates_are_incremental_and_noop_values_emit_nothing() {
        let mut context = EntityContext::new();
        let appeared = context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: EntityUuid(10),
                kind: EntityKind::Character,
            }],
        ));
        assert_eq!(appeared.len(), 1);

        let first = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::AttributeUpdated {
                uuid: EntityUuid(10),
                attr_id: 7,
                value: AttributeValue::Int(42),
                origin: ObservationOrigin::Delta,
            }],
        ));
        assert_eq!(first.len(), 1);
        let duplicate = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::AttributeUpdated {
                uuid: EntityUuid(10),
                attr_id: 7,
                value: AttributeValue::Int(42),
                origin: ObservationOrigin::Delta,
            }],
        ));
        assert!(duplicate.is_empty());
        assert_eq!(context.entity(EntityUuid(10)).unwrap().attributes.len(), 1);
    }

    #[test]
    fn reappearance_increments_generation_and_disappearance_keeps_identity() {
        let mut context = EntityContext::new();
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(10),
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: EntityUuid(10),
                    patch: EntityIdentityPatch {
                        name: FieldPatch::Set("retained".to_string()),
                        monster_id: FieldPatch::Set(115),
                        ..Default::default()
                    },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: EntityUuid(10),
                    change: ObservedBuffChange::Applied { buff: buff(7, 42) },
                },
            ],
        ));
        let generation = context.entity_ref(EntityUuid(10)).unwrap().generation;
        {
            let state = context.entities.get_mut(&EntityUuid(10)).unwrap();
            state.attributes.insert(7, AttributeValue::Int(42));
            state.temp_attributes.insert(8, 9);
            state.fight_resource_ids.push(10);
            state.fight_resources.insert(10, 11);
        }
        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared {
                uuid: EntityUuid(10),
            }],
        ));
        assert_eq!(
            context
                .entity(EntityUuid(10))
                .unwrap()
                .identity
                .name
                .as_deref(),
            Some("retained")
        );
        let disappeared = context.entity(EntityUuid(10)).unwrap();
        assert!(disappeared.attributes.is_empty());
        assert!(disappeared.temp_attributes.is_empty());
        assert!(disappeared.fight_resource_ids.is_empty());
        assert!(disappeared.fight_resources.is_empty());
        assert!(disappeared.active_buffs.is_empty());

        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::EntityAppeared {
                uuid: EntityUuid(10),
                kind: EntityKind::Monster,
            }],
        ));
        assert_eq!(
            context.entity_ref(EntityUuid(10)).unwrap().generation,
            generation + 1
        );
        let reappeared = context.entity(EntityUuid(10)).unwrap();
        assert_eq!(reappeared.identity.kind, EntityKind::Monster);
        assert!(reappeared.identity.name.is_none());
        assert!(reappeared.identity.monster_id.is_none());
    }

    #[test]
    fn repeated_appearance_of_a_present_entity_is_not_re_announced() {
        let mut context = EntityContext::new();
        let uuid = EntityUuid(10);
        assert_eq!(
            context
                .reduce_batch(batch(
                    1,
                    vec![ProtocolObservation::EntityAppeared {
                        uuid,
                        kind: EntityKind::Unknown,
                    }],
                ))
                .len(),
            1
        );
        let generation = context.entity_ref(uuid).unwrap().generation;

        let resync = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityAppeared {
                uuid,
                kind: EntityKind::Character,
            }],
        ));
        assert!(resync.is_empty());
        assert_eq!(context.entity_ref(uuid).unwrap().generation, generation);
        assert_eq!(
            context.entity(uuid).unwrap().identity.kind,
            EntityKind::Character
        );
    }

    #[test]
    fn scene_change_despawns_the_old_scene_but_keeps_the_local_player() {
        let mut context = EntityContext::new();
        let local = EntityUuid(10);
        let monster = EntityUuid(11);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::EntityAppeared {
                    uuid: monster,
                    kind: EntityKind::Monster,
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::SceneChanged {
                scene_id: 3,
                difficulty: Some(1),
            }],
        ));
        assert!(matches!(
            events[0].event,
            DomainEvent::EntityDisappeared { entity } if entity.uuid == monster
        ));
        assert!(matches!(events[1].event, DomainEvent::SceneChanged { .. }));
        assert!(!context.entity(monster).unwrap().is_present);
        assert!(context.entity(local).unwrap().is_present);
    }

    fn talent_events(events: &[DomainEnvelope]) -> Vec<(LocalTalent, LocalTalent)> {
        events
            .iter()
            .filter_map(|envelope| match envelope.event {
                DomainEvent::LocalTalentChanged { previous, current } => Some((previous, current)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn local_talent_emits_only_on_real_changes() {
        let mut context = EntityContext::new();
        let talent = LocalTalent {
            profession_id: Some(4),
            talent_stage_cfg_id: Some(108),
        };

        let first = context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::LocalTalentChanged(talent)],
        ));
        let second = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::LocalTalentChanged(talent)],
        ));

        assert_eq!(
            talent_events(&first),
            vec![(LocalTalent::default(), talent)]
        );
        assert!(talent_events(&second).is_empty());
        assert_eq!(context.local_talent(), talent);
    }

    #[test]
    fn local_talent_falls_back_to_local_identity_profession() {
        // Dirty-only sessions (app started after login) never see the
        // snapshot's cur_profession_id; the published class must come from
        // the local entity's identity instead.
        let mut context = EntityContext::new();
        let local = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::IdentityUpdated {
                    uuid: local,
                    patch: EntityIdentityPatch {
                        profession_id: FieldPatch::Set(4),
                        ..Default::default()
                    },
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::LocalTalentChanged(LocalTalent {
                profession_id: None,
                talent_stage_cfg_id: Some(108),
            })],
        ));

        assert_eq!(
            talent_events(&events),
            vec![(
                LocalTalent::default(),
                LocalTalent {
                    profession_id: Some(4),
                    talent_stage_cfg_id: Some(108),
                },
            )]
        );
    }

    #[test]
    fn local_player_change_resets_talent_so_the_same_value_reemits() {
        // Account switch to a character with the same class/spec: the talent
        // cache is reset alongside the player, so the new account's snapshot
        // still registers as a change and the frontend re-evaluates.
        let mut context = EntityContext::new();
        let talent = LocalTalent {
            profession_id: Some(4),
            talent_stage_cfg_id: Some(108),
        };
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(10),
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(EntityUuid(10)),
                },
                ProtocolObservation::LocalTalentChanged(talent),
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(20),
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(EntityUuid(20)),
                },
                ProtocolObservation::LocalTalentChanged(talent),
            ],
        ));

        assert_eq!(
            talent_events(&events),
            vec![(LocalTalent::default(), talent)]
        );
    }

    #[test]
    fn local_skill_lifecycle_comes_from_client_packets_only() {
        use super::super::events::SkillPhase;

        let mut context = EntityContext::new();
        let local = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
            ],
        ));

        let requested = context.reduce_batch(batch(
            2,
            vec![
                ProtocolObservation::LocalSkillRequested {
                    skill_id: 100,
                    target_uuid: Some(EntityUuid(11)),
                },
                ProtocolObservation::SkillLifecycleChanged {
                    caster_uuid: LOCAL_PLAYER,
                    skill_id: 100,
                    phase: SkillPhase::CastStarted,
                    target_uuid: None,
                },
            ],
        ));
        assert_eq!(
            skill_phases(&requested),
            vec![SkillPhase::CastStarted, SkillPhase::DurationStarted]
        );

        let completed = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::LocalSkillCompleted { skill_id: 100 }],
        ));
        assert_eq!(
            skill_phases(&completed),
            vec![SkillPhase::DurationEnded, SkillPhase::Completed]
        );

        // ATTR_SKILL_ID Observed for the local player must not duplicate lifecycle.
        let observed = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: local,
                skill_id: 100,
                phase: SkillPhase::Observed,
                target_uuid: None,
            }],
        ));
        assert!(
            observed
                .iter()
                .all(|event| !matches!(event.event, DomainEvent::SkillLifecycleChanged { .. }))
        );
    }

    #[test]
    fn observations_addressed_to_an_unknown_local_player_are_dropped() {
        let mut context = EntityContext::new();
        assert!(
            context
                .reduce_batch(batch(
                    1,
                    vec![ProtocolObservation::AttributeUpdated {
                        uuid: LOCAL_PLAYER,
                        attr_id: 7,
                        value: AttributeValue::Int(42),
                        origin: ObservationOrigin::Delta,
                    }],
                ))
                .is_empty()
        );
        assert!(context.entity(LOCAL_PLAYER).is_none());

        let local = EntityUuid(10);
        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::LocalPlayerChanged { uuid: Some(local) }],
        ));
        let events = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::AttributeUpdated {
                uuid: LOCAL_PLAYER,
                attr_id: 7,
                value: AttributeValue::Int(42),
                origin: ObservationOrigin::Delta,
            }],
        ));
        assert!(matches!(
            events[0].event,
            DomainEvent::AttributeChanged { entity, .. } if entity.uuid == local
        ));
    }

    #[test]
    fn initial_buff_snapshot_seeds_state_without_gained_edge() {
        let mut context = EntityContext::new();
        let events = context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::BuffSnapshot {
                target_uuid: EntityUuid(10),
                buffs: vec![buff(1, 42)],
            }],
        ));
        let DomainEvent::BuffChanged(event) = &events[0].event else {
            panic!("expected buff event");
        };
        assert_eq!(event.transition, BuffTransition::Baseline);
        assert!(
            context
                .entity(EntityUuid(10))
                .unwrap()
                .active_buffs
                .contains_key(&1)
        );

        let empty = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::BuffSnapshot {
                target_uuid: EntityUuid(10),
                buffs: Vec::new(),
            }],
        ));
        assert!(empty.is_empty());
        let partial = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::BuffSnapshot {
                target_uuid: EntityUuid(10),
                buffs: vec![buff(2, 43)],
            }],
        ));
        assert_eq!(partial.len(), 1);
        assert_eq!(context.active_buffs(EntityUuid(10)).count(), 2);

        let remove = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(10),
                change: ObservedBuffChange::Remove { instance_id: 1 },
            }],
        ));
        let DomainEvent::BuffChanged(event) = &remove[0].event else {
            panic!("expected buff event");
        };
        assert_eq!(event.transition, BuffTransition::Removed);
        assert_eq!(event.state.base_id, 42);
        let remaining = &context.entity(EntityUuid(10)).unwrap().active_buffs;
        assert_eq!(remaining.len(), 1);
        assert!(remaining.contains_key(&2));
    }

    #[test]
    fn entity_disappearance_clears_all_buffs_without_synthetic_removes() {
        let mut context = EntityContext::new();
        let target = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: buff(1, 42) },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: buff(2, 43) },
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: target }],
        ));

        assert!(context.active_buffs(target).next().is_none());
        assert!(matches!(
            events.as_slice(),
            [DomainEnvelope {
                event: DomainEvent::EntityDisappeared { entity },
                ..
            }] if entity.uuid == target
        ));
    }

    #[test]
    fn late_buff_upserts_are_ignored_between_entity_generations() {
        let mut context = EntityContext::new();
        let target = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: buff(1, 41) },
                },
            ],
        ));
        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: target }],
        ));

        let late_add = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: target,
                change: ObservedBuffChange::Applied { buff: buff(2, 42) },
            }],
        ));
        let late_snapshot = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::BuffSnapshot {
                target_uuid: target,
                buffs: vec![buff(3, 43)],
            }],
        ));

        assert!(late_add.is_empty());
        assert!(late_snapshot.is_empty());
        assert!(context.active_buffs(target).next().is_none());

        context.reduce_batch(batch(
            5,
            vec![ProtocolObservation::EntityAppeared {
                uuid: target,
                kind: EntityKind::Character,
            }],
        ));
        assert!(context.active_buffs(target).next().is_none());
    }

    #[test]
    fn reappeared_entity_accepts_buff_upserts_for_new_generation() {
        let mut context = EntityContext::new();
        let target = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: target,
                kind: EntityKind::Character,
            }],
        ));
        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: target }],
        ));
        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::EntityAppeared {
                uuid: target,
                kind: EntityKind::Character,
            }],
        ));

        let events = context.reduce_batch(batch(
            4,
            vec![
                ProtocolObservation::BuffSnapshot {
                    target_uuid: target,
                    buffs: vec![buff(1, 41)],
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: buff(2, 42) },
                },
            ],
        ));

        assert_eq!(events.len(), 2);
        assert_eq!(context.active_buffs(target).count(), 2);
        assert!(matches!(
            events[0].event,
            DomainEvent::BuffChanged(BuffEvent {
                transition: BuffTransition::Baseline,
                ..
            })
        ));
        assert!(matches!(
            events[1].event,
            DomainEvent::BuffChanged(BuffEvent {
                transition: BuffTransition::Applied,
                ..
            })
        ));
    }

    #[test]
    fn container_reset_clears_runtime_but_preserves_stable_context() {
        let mut context = EntityContext::new();
        let local = EntityUuid(10);
        let teammate = EntityUuid(20);
        let target = EntityUuid(30);
        let timer_key = GameTimerKey {
            cfg_id: 7,
            timer_type: 8,
        };
        context.set_watched_skill_ids(HashSet::from([77]));
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: teammate,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::TeamInfoUpdated {
                    team_id: 99,
                    leader_uuid: Some(local),
                },
                ProtocolObservation::TeamMembersUpdated {
                    members: vec![local, teammate],
                },
                ProtocolObservation::SceneChanged {
                    scene_id: 101,
                    difficulty: Some(3),
                },
                ProtocolObservation::PauseChanged { is_paused: true },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target),
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: target,
                    change: ObservedBuffChange::Applied { buff: buff(1, 42) },
                },
                ProtocolObservation::SeasonCultivateSnapshot {
                    season_id: 3,
                    active_template_ids: vec![10],
                    active_item_ids: vec![1, 2],
                },
                ProtocolObservation::DungeonFlowChanged { state: 2 },
                ProtocolObservation::DungeonProgressStateChanged { value: 1 },
                ProtocolObservation::GameTimerUpserted {
                    timer: GameTimerState {
                        key: timer_key,
                        execution_type: 1,
                        start_timestamp: Some(1_000),
                        end_timestamp: Some(2_000),
                        last_timestamp: None,
                        last_end_timestamp: None,
                        next_timestamp: None,
                        next_end_timestamp: None,
                        offsets: Vec::new(),
                        duration_ms: Some(1_000),
                    },
                },
            ],
        ));
        assert_eq!(context.progress_state, Some(1));

        let events = context.reduce_batch(batch(2, vec![ProtocolObservation::ContainerReset]));

        assert!(matches!(
            events.as_slice(),
            [DomainEnvelope {
                event: DomainEvent::ContainerReset,
                ..
            }]
        ));
        assert!(context.entities.is_empty());
        assert!(context.local_player().is_none());
        assert!(context.current_attack_target().is_none());
        assert!(context.game_timer(timer_key).is_none());
        assert!(context.active_season_items.is_empty());
        assert_eq!(context.active_season_id, 0);
        assert!(context.active_season_template_ids.is_empty());
        assert!(context.dungeon_flow_state.is_none());
        assert!(context.progress_state.is_none());
        assert_eq!(context.team_id, 99);
        assert_eq!(context.team_leader, Some(local));
        assert!(context.team_members.contains(&teammate));
        assert_eq!(context.current_scene_id(), Some(101));
        assert_eq!(context.current_difficulty(), Some(3));
        assert!(context.is_paused());
        assert!(context.watched_skill_ids.contains(&77));
    }

    #[test]
    fn progress_state_emits_only_when_value_changes() {
        let mut context = EntityContext::new();

        let first = context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::DungeonProgressStateChanged { value: 1 }],
        ));
        assert_eq!(context.progress_state, Some(1));
        assert!(matches!(
            first.as_slice(),
            [DomainEnvelope {
                event: DomainEvent::DungeonProgressStateChanged {
                    previous: None,
                    current: 1,
                },
                ..
            }]
        ));

        let repeat = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::DungeonProgressStateChanged { value: 1 }],
        ));
        assert!(repeat.is_empty());
        assert_eq!(context.progress_state, Some(1));

        context.reduce_batch(batch(3, vec![ProtocolObservation::ContainerReset]));
        assert!(context.progress_state.is_none());
    }

    #[test]
    fn local_wipe_buff_emits_once_on_each_real_application() {
        let mut context = EntityContext::new();
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::LocalPlayerChanged {
                uuid: Some(EntityUuid(10)),
            }],
        ));

        let baseline = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::BuffSnapshot {
                target_uuid: EntityUuid(10),
                buffs: vec![buff(7, WIPE_BUFF_BASE_ID)],
            }],
        ));
        assert_eq!(baseline.len(), 1);
        assert!(matches!(baseline[0].event, DomainEvent::BuffChanged(_)));

        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(10),
                change: ObservedBuffChange::Remove { instance_id: 7 },
            }],
        ));
        let applied = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(10),
                change: ObservedBuffChange::Applied {
                    buff: buff(7, WIPE_BUFF_BASE_ID),
                },
            }],
        ));
        assert_eq!(applied.len(), 2);
        assert!(matches!(applied[0].event, DomainEvent::BuffChanged(_)));
        assert!(matches!(
            applied[1].event,
            DomainEvent::WipeDetected {
                entity: Some(EntityRef {
                    uuid: EntityUuid(10),
                    ..
                }),
                buff_instance_id: Some(7),
            }
        ));

        let refreshed = context.reduce_batch(batch(
            5,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(10),
                change: buff_delta(7, None),
            }],
        ));
        assert_eq!(refreshed.len(), 1);
        assert!(matches!(refreshed[0].event, DomainEvent::BuffChanged(_)));
    }

    #[test]
    fn buff_delta_for_unknown_instance_is_dropped_and_layers_are_merged() {
        let mut context = EntityContext::new();
        let target = EntityUuid(12);
        let stale = context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: target,
                change: buff_delta(3, Some(2)),
            }],
        ));
        assert!(stale.is_empty());
        assert!(context.entity(target).is_none());
        let stale_remove = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: target,
                change: ObservedBuffChange::Remove { instance_id: 3 },
            }],
        ));
        assert!(stale_remove.is_empty());
        assert!(context.entity(target).is_none());

        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: target,
                change: ObservedBuffChange::Applied { buff: buff(3, 42) },
            }],
        ));
        let merged = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: target,
                change: buff_delta(3, Some(4)),
            }],
        ));
        let DomainEvent::BuffChanged(event) = &merged[0].event else {
            panic!("expected buff event");
        };
        assert_eq!(event.transition, BuffTransition::LayerChanged);
        assert_eq!(event.previous_layer, Some(1));
        assert_eq!(event.state.layer, 4);
        assert_eq!(event.state.base_id, 42);
    }

    #[test]
    fn teammate_wipe_buff_does_not_end_the_local_segment() {
        let mut context = EntityContext::new();
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::LocalPlayerChanged {
                uuid: Some(EntityUuid(10)),
            }],
        ));
        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(11),
                change: ObservedBuffChange::Applied {
                    buff: buff(8, WIPE_BUFF_BASE_ID),
                },
            }],
        ));
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0].event, DomainEvent::BuffChanged(_)));
    }

    #[test]
    fn fantasy_reappearing_with_same_uuid_starts_a_new_cast() {
        let mut context = EntityContext::new();
        let summon_uuid = EntityUuid(70);
        let summoner_uuid = EntityUuid(71);
        let observed = ProtocolObservation::FantasyMarkerObserved {
            summon_uuid,
            source_config_id: Some(55),
        };
        let identity = ProtocolObservation::IdentityUpdated {
            uuid: summon_uuid,
            patch: EntityIdentityPatch {
                monster_id: FieldPatch::Set(3_000_038),
                owner_uuid: FieldPatch::Set(summoner_uuid),
                fantasy_tier: FieldPatch::Set(2),
                ..Default::default()
            },
        };

        let summoned = context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: summon_uuid,
                    kind: EntityKind::Monster,
                },
                identity.clone(),
                observed.clone(),
            ],
        ));
        assert!(matches!(
            summoned[2].event,
            DomainEvent::FantasyChanged {
                transition: FantasyTransition::Summoned,
                fantasy: FantasyState {
                    monster_id: 3_000_038,
                    remodel_level: 2,
                    ..
                },
            }
        ));

        let refreshed = context.reduce_batch(batch(2, vec![observed.clone()]));
        assert!(matches!(
            refreshed[0].event,
            DomainEvent::FantasyChanged {
                transition: FantasyTransition::Updated,
                ..
            }
        ));

        let disappeared = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::EntityDisappeared { uuid: summon_uuid }],
        ));
        assert!(matches!(
            disappeared[0].event,
            DomainEvent::FantasyChanged {
                transition: FantasyTransition::Ended,
                ..
            }
        ));
        assert!(matches!(
            disappeared[1].event,
            DomainEvent::EntityDisappeared { .. }
        ));

        let replayed = context.reduce_batch(batch(
            4,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: summon_uuid,
                    kind: EntityKind::Monster,
                },
                identity,
                observed,
            ],
        ));
        assert!(matches!(
            replayed[2].event,
            DomainEvent::FantasyChanged {
                transition: FantasyTransition::Summoned,
                ..
            }
        ));
    }

    #[test]
    fn pet_marker_does_not_register_as_character_fantasy() {
        let mut context = EntityContext::new();
        let summon_uuid = EntityUuid(70);
        let summoner_uuid = EntityUuid(71);
        let events = context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: summon_uuid,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: summon_uuid,
                    patch: EntityIdentityPatch {
                        monster_id: FieldPatch::Set(3_100_002),
                        owner_uuid: FieldPatch::Set(summoner_uuid),
                        fantasy_tier: FieldPatch::Set(0),
                        ..Default::default()
                    },
                },
                ProtocolObservation::FantasyMarkerObserved {
                    summon_uuid,
                    source_config_id: None,
                },
            ],
        ));

        assert!(
            !events
                .iter()
                .any(|envelope| matches!(envelope.event, DomainEvent::FantasyChanged { .. }))
        );
        assert_eq!(
            context.resolve_fantasy_remodel_level(Some(summon_uuid), None),
            None
        );
    }

    #[test]
    fn known_character_is_not_a_team_member_without_team_state() {
        let mut context = EntityContext::new();
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: EntityUuid(20),
                kind: EntityKind::Character,
            }],
        ));
        assert!(!context.roles(EntityUuid(20)).is_team_member);

        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::TeamInfoUpdated {
                team_id: 7,
                leader_uuid: Some(EntityUuid(20)),
            }],
        ));
        assert!(context.roles(EntityUuid(20)).is_team_member);
    }

    #[test]
    fn leaving_the_team_clears_membership_for_the_local_player() {
        let mut context = EntityContext::new();
        let local = EntityUuid(20);
        let mate = EntityUuid(21);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::TeamInfoUpdated {
                    team_id: 7,
                    leader_uuid: Some(local),
                },
                ProtocolObservation::TeamMembersUpdated {
                    members: vec![local, mate],
                },
            ],
        ));
        assert!(context.roles(mate).is_team_member);

        let left = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::TeamMemberLeft { member_uuid: mate }],
        ));
        assert!(!context.roles(mate).is_team_member);
        assert!(context.roles(local).is_team_member);
        assert!(matches!(
            left[0].event,
            DomainEvent::TeamMembershipChanged {
                is_member: false,
                ..
            }
        ));

        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::TeamMemberLeft { member_uuid: local }],
        ));
        assert!(!context.roles(local).is_team_member);
        assert_eq!(context.team_id, 0);
        assert_eq!(context.team_leader, None);

        assert!(
            context
                .reduce_batch(batch(4, vec![ProtocolObservation::TeamDissolved]))
                .is_empty()
        );
    }

    #[test]
    fn team_vote_alert_ignores_votes_started_by_local_player() {
        let mut context = EntityContext::new();
        let local = EntityUuid(20);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::LocalPlayerChanged { uuid: Some(local) }],
        ));

        let own_vote = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::TeamVoteStarted {
                creator_uuid: Some(local),
            }],
        ));
        let other_vote = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::TeamVoteStarted {
                creator_uuid: Some(EntityUuid(21)),
            }],
        ));

        assert!(own_vote.is_empty());
        assert!(matches!(
            other_vote.as_slice(),
            [DomainEnvelope {
                event: DomainEvent::TeamVoteStarted,
                ..
            }]
        ));
    }

    #[test]
    fn hit_is_enriched_once_without_scanning_entities() {
        let mut context = EntityContext::new();
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(1),
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(EntityUuid(1)),
                },
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(2),
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: EntityUuid(2),
                    patch: EntityIdentityPatch {
                        monster_id: FieldPatch::Set(900),
                        is_boss: FieldPatch::Set(true),
                        ..Default::default()
                    },
                },
            ],
        ));
        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::HitResolved(
                super::super::events::ObservedHit {
                    channel: super::super::events::HitChannel::ToMe,
                    source_uuid: Some(EntityUuid(1)),
                    source_owner_uuid: None,
                    target_uuid: EntityUuid(2),
                    skill_key: 99,
                    skill_id: Some(10),
                    type_flags: 3,
                    kind: HitKind::Damage,
                    amount: 100,
                    has_loss_breakdown: true,
                    hp_loss: 80,
                    shield_loss: 20,
                    is_lucky_bonus_only: false,
                    property: Some(1),
                    damage_mode: Some(2),
                    effective_amount: None,
                },
            )],
        ));
        let DomainEvent::HitResolved(hit) = &events[0].event else {
            panic!("expected hit");
        };
        assert!(hit.source_is_local_player);
        assert!(hit.source_is_player);
        assert!(hit.target_is_boss);
        assert_eq!(hit.target_monster_id, Some(900));
        assert_eq!(hit.shield_loss, 20);
    }

    #[test]
    fn dummy_with_boss_template_is_not_target_is_boss() {
        let mut context = EntityContext::new();
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(1),
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(2),
                    kind: EntityKind::Dummy,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid: EntityUuid(2),
                    patch: EntityIdentityPatch {
                        monster_id: FieldPatch::Set(7001),
                        is_boss: FieldPatch::Set(true),
                        ..Default::default()
                    },
                },
            ],
        ));
        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::HitResolved(
                super::super::events::ObservedHit {
                    channel: super::super::events::HitChannel::ToMe,
                    source_uuid: Some(EntityUuid(1)),
                    source_owner_uuid: None,
                    target_uuid: EntityUuid(2),
                    skill_key: 99,
                    skill_id: Some(10),
                    type_flags: 0,
                    kind: HitKind::Damage,
                    amount: 100,
                    has_loss_breakdown: true,
                    hp_loss: 80,
                    shield_loss: 20,
                    is_lucky_bonus_only: false,
                    property: None,
                    damage_mode: None,
                    effective_amount: None,
                },
            )],
        ));
        let DomainEvent::HitResolved(hit) = &events[0].event else {
            panic!("expected hit");
        };
        assert!(!hit.target_is_boss);
        assert_eq!(hit.target_kind, EntityKind::Dummy);
        assert_eq!(hit.target_monster_id, Some(7001));
    }

    #[test]
    fn buff_times_fall_back_to_capture_and_zero_duration_clears_deadlines() {
        let mut context = EntityContext::new();
        let snapshot = context.reduce_batch(batch(
            5,
            vec![ProtocolObservation::BuffSnapshot {
                target_uuid: EntityUuid(1),
                buffs: vec![buff(1, 42)],
            }],
        ));
        let DomainEvent::BuffChanged(snapshot) = &snapshot[0].event else {
            panic!("expected buff");
        };
        assert_eq!(snapshot.state.started_wall_ms, Some(10_005));
        assert_eq!(snapshot.state.started_mono_ms, Some(MonoTimeMs(5)));
        assert_eq!(snapshot.state.expires_wall_ms, Some(15_005));
        assert_eq!(snapshot.state.expires_mono_ms, Some(MonoTimeMs(5_005)));

        let finite_refresh = context.reduce_batch(batch(
            10,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(1),
                change: ObservedBuffChange::Delta {
                    instance_id: 1,
                    layer: None,
                    duration_ms: Some(2_000),
                    create_time: None,
                    effect_ids: None,
                },
            }],
        ));
        let DomainEvent::BuffChanged(finite_refresh) = &finite_refresh[0].event else {
            panic!("expected buff");
        };
        assert_eq!(finite_refresh.state.started_wall_ms, Some(10_010));
        assert_eq!(finite_refresh.state.started_mono_ms, Some(MonoTimeMs(10)));
        assert_eq!(finite_refresh.state.expires_wall_ms, Some(12_010));
        assert_eq!(
            finite_refresh.state.expires_mono_ms,
            Some(MonoTimeMs(2_010))
        );

        let zero_duration = context.reduce_batch(batch(
            15,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(1),
                change: ObservedBuffChange::Delta {
                    instance_id: 1,
                    layer: None,
                    duration_ms: Some(0),
                    create_time: None,
                    effect_ids: None,
                },
            }],
        ));
        let DomainEvent::BuffChanged(zero_duration) = &zero_duration[0].event else {
            panic!("expected buff");
        };
        assert_eq!(zero_duration.state.duration_ms, Some(0));
        assert_eq!(zero_duration.state.started_wall_ms, Some(10_015));
        assert_eq!(zero_duration.state.started_mono_ms, Some(MonoTimeMs(15)));
        assert_eq!(zero_duration.state.expires_wall_ms, None);
        assert_eq!(zero_duration.state.expires_mono_ms, None);

        let reanchored = context.reduce_batch(batch(
            20,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(1),
                change: ObservedBuffChange::Delta {
                    instance_id: 1,
                    layer: None,
                    duration_ms: Some(1_000),
                    create_time: Some(123),
                    effect_ids: None,
                },
            }],
        ));
        let DomainEvent::BuffChanged(reanchored) = &reanchored[0].event else {
            panic!("expected buff");
        };
        assert_eq!(reanchored.state.started_wall_ms, Some(10_020));
        assert_eq!(reanchored.state.started_mono_ms, Some(MonoTimeMs(20)));
        assert_eq!(reanchored.state.expires_wall_ms, Some(11_020));
        assert_eq!(reanchored.state.expires_mono_ms, Some(MonoTimeMs(1_020)));
    }

    #[test]
    fn normalized_ids_dedup_preserves_order() {
        assert_eq!(
            normalized_ids(vec![30, 10, 30, 0, -1, 20, 10]),
            vec![30, 10, 20]
        );
    }

    #[test]
    fn fight_resource_layout_is_stored_in_wire_order() {
        let mut context = EntityContext::new();
        let uuid = EntityUuid(30);
        let layout = || ProtocolObservation::FightResourceLayout {
            entity_uuid: uuid,
            resource_ids: vec![20, 10],
        };
        let events = context.reduce_batch(batch(1, vec![layout()]));
        assert_eq!(events.len(), 1);
        assert!(matches!(
            &events[0].event,
            DomainEvent::FightResourceLayoutChanged {
                previous,
                current,
                ..
            } if previous.is_empty() && *current == vec![20, 10]
        ));
        // An identical layout is a no-op.
        assert!(context.reduce_batch(batch(2, vec![layout()])).is_empty());
    }

    #[test]
    fn fight_resource_values_are_zipped_against_the_known_layout() {
        let mut context = EntityContext::new();
        let uuid = EntityUuid(30);
        let values = || ProtocolObservation::FightResourceValues {
            entity_uuid: uuid,
            values: vec![5, 6],
            origin: ObservationOrigin::Delta,
        };
        // Without a layout the positions cannot be named.
        assert!(context.reduce_batch(batch(1, vec![values()])).is_empty());

        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::FightResourceLayout {
                entity_uuid: uuid,
                resource_ids: vec![20, 10],
            }],
        ));
        // Wire-order pairing: position 0 belongs to id 20, position 1 to id 10.
        let events = context.reduce_batch(batch(3, vec![values()]));
        assert_eq!(events.len(), 2);
        assert!(matches!(
            events[0].event,
            DomainEvent::FightResourceChanged {
                resource_id: 20,
                previous: None,
                current: 5,
                ..
            }
        ));
        assert!(matches!(
            events[1].event,
            DomainEvent::FightResourceChanged {
                resource_id: 10,
                previous: None,
                current: 6,
                ..
            }
        ));
        assert!(context.reduce_batch(batch(4, vec![values()])).is_empty());
    }

    #[test]
    fn fight_resource_layout_change_prunes_stale_values() {
        let mut context = EntityContext::new();
        let uuid = EntityUuid(30);
        let layout = |ids: Vec<i32>| ProtocolObservation::FightResourceLayout {
            entity_uuid: uuid,
            resource_ids: ids,
        };
        let values = |values: Vec<i64>| ProtocolObservation::FightResourceValues {
            entity_uuid: uuid,
            values,
            origin: ObservationOrigin::Delta,
        };

        context.reduce_batch(batch(1, vec![layout(vec![10])]));
        context.reduce_batch(batch(2, vec![values(vec![5])]));
        // The id leaves the layout: its value is pruned.
        context.reduce_batch(batch(3, vec![layout(vec![20])]));
        context.reduce_batch(batch(4, vec![values(vec![7])]));
        // Re-added later, the same value must re-emit with no previous,
        // matching the old full-rebuild-per-packet display semantics.
        context.reduce_batch(batch(5, vec![layout(vec![10])]));
        let events = context.reduce_batch(batch(6, vec![values(vec![5])]));
        assert_eq!(events.len(), 1);
        assert!(matches!(
            events[0].event,
            DomainEvent::FightResourceChanged {
                resource_id: 10,
                previous: None,
                current: 5,
                ..
            }
        ));
    }

    #[test]
    fn passive_skill_end_replays_the_start_descriptor() {
        let mut context = EntityContext::new();
        let uuid = EntityUuid(40);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::PassiveSkillObserved(
                PassiveSkillObservation {
                    entity_uuid: uuid,
                    passive_instance_id: 5,
                    skill_id: 700,
                    target_position: Some(Position {
                        x: 1.0,
                        y: 2.0,
                        z: 3.0,
                    }),
                    ended: false,
                },
            )],
        ));

        // The end packet carries the instance id only.
        let end = ProtocolObservation::PassiveSkillObserved(PassiveSkillObservation {
            entity_uuid: LOCAL_PLAYER,
            passive_instance_id: 5,
            skill_id: 0,
            target_position: None,
            ended: true,
        });
        let ended = context.reduce_batch(batch(2, vec![end.clone()]));
        assert!(matches!(
            ended[0].event,
            DomainEvent::PassiveSkillObserved {
                entity,
                skill_id: 700,
                target_position: Some(_),
                ended: true,
                ..
            } if entity.uuid == uuid
        ));
        assert!(context.reduce_batch(batch(3, vec![end])).is_empty());
    }

    #[test]
    fn disappearing_entity_forgets_its_passive_skills() {
        let mut context = EntityContext::new();
        let uuid = EntityUuid(41);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::PassiveSkillObserved(PassiveSkillObservation {
                    entity_uuid: uuid,
                    passive_instance_id: 6,
                    skill_id: 701,
                    target_position: None,
                    ended: false,
                }),
            ],
        ));
        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid }],
        ));
        assert!(context.passive_skills.is_empty());
        assert!(context.passive_instances_by_entity.is_empty());
    }

    #[test]
    fn unknown_unwatched_skill_is_not_buffered() {
        let mut context = EntityContext::new();
        let caster = EntityUuid(41);
        let first = context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id: 900,
                phase: super::super::events::SkillPhase::CastStarted,
                target_uuid: None,
            }],
        ));
        assert!(first.is_empty());

        let completed = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityAppeared {
                uuid: caster,
                kind: EntityKind::Character,
            }],
        ));
        assert_eq!(completed.len(), 1);
        assert!(matches!(
            completed[0].event,
            DomainEvent::EntityAppeared { .. }
        ));
    }

    #[test]
    fn identity_completion_releases_only_that_casters_watched_skills() {
        let mut context = EntityContext::new();
        context.set_watched_skill_ids(HashSet::from([77]));
        let caster_a = EntityUuid(51);
        let caster_b = EntityUuid(52);
        assert!(
            context
                .reduce_batch(batch(
                    1,
                    vec![
                        ProtocolObservation::SkillLifecycleChanged {
                            caster_uuid: caster_a,
                            skill_id: 77,
                            phase: super::super::events::SkillPhase::CastStarted,
                            target_uuid: None,
                        },
                        ProtocolObservation::SkillLifecycleChanged {
                            caster_uuid: caster_b,
                            skill_id: 77,
                            phase: super::super::events::SkillPhase::CastStarted,
                            target_uuid: None,
                        },
                    ],
                ))
                .is_empty()
        );

        let released_a = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::IdentityUpdated {
                uuid: caster_a,
                patch: EntityIdentityPatch {
                    kind: FieldPatch::Set(EntityKind::Character),
                    ..Default::default()
                },
            }],
        ));
        assert_eq!(released_a.len(), 3);
        let DomainEvent::SkillLifecycleChanged { caster, .. } = released_a[1].event else {
            panic!("expected released skill");
        };
        assert_eq!(caster.uuid, caster_a);
        assert_eq!(released_a[1].occurred_at_ms, meta(1).captured_wall_ms);
        assert!(matches!(
            released_a[2].event,
            DomainEvent::SkillLifecycleChanged {
                phase: super::super::events::SkillPhase::DurationStarted,
                ..
            }
        ));

        let released_b = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::IdentityUpdated {
                uuid: caster_b,
                patch: EntityIdentityPatch {
                    kind: FieldPatch::Set(EntityKind::Character),
                    ..Default::default()
                },
            }],
        ));
        assert_eq!(released_b.len(), 3);
        let DomainEvent::SkillLifecycleChanged { caster, .. } = released_b[1].event else {
            panic!("expected released skill");
        };
        assert_eq!(caster.uuid, caster_b);
    }

    #[test]
    fn expired_unknown_caster_skill_is_not_released_into_a_later_segment() {
        let mut context = EntityContext::new();
        context.set_watched_skill_ids(HashSet::from([77]));
        let caster = EntityUuid(53);
        assert!(
            context
                .reduce_batch(batch(
                    1,
                    vec![ProtocolObservation::SkillLifecycleChanged {
                        caster_uuid: caster,
                        skill_id: 77,
                        phase: super::super::events::SkillPhase::Observed,
                        target_uuid: None,
                    }],
                ))
                .is_empty()
        );

        let completed = context.reduce_batch(batch(
            PENDING_SKILL_MAX_AGE_MS + 2,
            vec![ProtocolObservation::IdentityUpdated {
                uuid: caster,
                patch: EntityIdentityPatch {
                    kind: FieldPatch::Set(EntityKind::Character),
                    ..Default::default()
                },
            }],
        ));

        assert!(
            completed
                .iter()
                .all(|event| !matches!(event.event, DomainEvent::SkillLifecycleChanged { .. }))
        );
        assert!(!context.pending_skills_by_caster.contains_key(&caster));
        assert!(context.pending_skill_expiries.is_empty());
    }

    #[test]
    fn disappearing_target_keeps_attacker_target_mapping() {
        let mut context = EntityContext::new();
        let local = EntityUuid(70);
        let target = EntityUuid(71);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: target,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(target),
                },
            ],
        ));
        assert!(context.roles(target).is_current_target);

        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: target }],
        ));
        assert!(context.roles(target).is_current_target);
        assert!(context.attackers_by_target.contains_key(&target));

        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::EntityAppeared {
                uuid: target,
                kind: EntityKind::Monster,
            }],
        ));

        assert!(context.roles(target).is_current_target);
        assert!(context.attackers_by_target.contains_key(&target));
    }

    #[test]
    fn skill_lifecycle_preserves_main_cast_duration_order() {
        use super::super::events::SkillPhase;

        let mut context = EntityContext::new();
        let caster = EntityUuid(90);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: caster,
                kind: EntityKind::Character,
            }],
        ));

        let first = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id: 100,
                phase: SkillPhase::CastStarted,
                target_uuid: Some(EntityUuid(1000)),
            }],
        ));
        assert_eq!(
            skill_phases(&first),
            vec![SkillPhase::CastStarted, SkillPhase::DurationStarted]
        );

        let queued = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id: 200,
                phase: SkillPhase::CastStarted,
                target_uuid: Some(EntityUuid(2000)),
            }],
        ));
        assert_eq!(skill_phases(&queued), vec![SkillPhase::CastStarted]);

        let first_complete = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id: 100,
                phase: SkillPhase::Completed,
                target_uuid: None,
            }],
        ));
        assert_eq!(
            skill_phases(&first_complete),
            vec![
                SkillPhase::DurationEnded,
                SkillPhase::DurationStarted,
                SkillPhase::Completed,
            ]
        );
        let DomainEvent::SkillLifecycleChanged { target, .. } = first_complete[1].event else {
            panic!("duration transition expected");
        };
        assert_eq!(target.map(|entity| entity.uuid), Some(EntityUuid(2000)));

        let second_complete = context.reduce_batch(batch(
            5,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id: 200,
                phase: SkillPhase::Completed,
                target_uuid: None,
            }],
        ));
        assert_eq!(
            skill_phases(&second_complete),
            vec![SkillPhase::DurationEnded, SkillPhase::Completed]
        );
    }

    #[test]
    fn immediate_skill_completes_without_occupying_duration() {
        use super::super::events::SkillPhase;

        let mut context = EntityContext::new();
        let caster = EntityUuid(91);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: caster,
                kind: EntityKind::Character,
            }],
        ));
        let events = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id: IMMEDIATE_COMPLETE_SKILL_IDS[0],
                phase: SkillPhase::CastStarted,
                target_uuid: None,
            }],
        ));
        assert_eq!(
            skill_phases(&events),
            vec![SkillPhase::CastStarted, SkillPhase::Completed]
        );
    }

    #[test]
    fn config_removal_discards_pending_skill() {
        let mut context = EntityContext::new();
        let caster = EntityUuid(61);
        context.set_watched_skill_ids(HashSet::from([88]));
        assert!(
            context
                .reduce_batch(batch(
                    1,
                    vec![ProtocolObservation::SkillLifecycleChanged {
                        caster_uuid: caster,
                        skill_id: 88,
                        phase: super::super::events::SkillPhase::Observed,
                        target_uuid: None,
                    }],
                ))
                .is_empty()
        );
        context.set_watched_skill_ids(HashSet::new());

        let completed = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityAppeared {
                uuid: caster,
                kind: EntityKind::Character,
            }],
        ));
        assert_eq!(completed.len(), 1);
    }

    fn actor_state(uuid: EntityUuid, value: i64, origin: ObservationOrigin) -> ProtocolObservation {
        ProtocolObservation::AttributeUpdated {
            uuid,
            attr_id: attr_type::ATTR_ACTOR_STATE,
            value: AttributeValue::Int(value),
            origin,
        }
    }

    fn incoming_hit(source: EntityUuid, target: EntityUuid) -> ProtocolObservation {
        ProtocolObservation::HitResolved(ObservedHit {
            channel: HitChannel::ToMe,
            source_uuid: Some(source),
            source_owner_uuid: None,
            target_uuid: target,
            skill_key: 99,
            skill_id: Some(10),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 100,
            has_loss_breakdown: false,
            hp_loss: 0,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        })
    }

    fn death_events(events: &[DomainEnvelope]) -> Vec<DomainEvent> {
        events
            .iter()
            .filter_map(|envelope| match &envelope.event {
                event @ DomainEvent::DeathOccurred { .. } => Some(event.clone()),
                _ => None,
            })
            .collect()
    }

    fn revived_events(events: &[DomainEnvelope]) -> Vec<DomainEvent> {
        events
            .iter()
            .filter_map(|envelope| match &envelope.event {
                event @ DomainEvent::Revived { .. } => Some(event.clone()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn actor_state_transition_to_dead_emits_death_once() {
        let mut context = EntityContext::new();
        let victim_uuid = EntityUuid(70);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: victim_uuid,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: victim_uuid,
                    change: ObservedBuffChange::Applied { buff: buff(7, 42) },
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![actor_state(victim_uuid, 9, ObservationOrigin::Delta)],
        ));
        let deaths = death_events(&events);
        assert_eq!(deaths.len(), 1);
        let DomainEvent::DeathOccurred {
            victim,
            killer: None,
            skill_key: None,
            buff_checkpoint,
        } = &deaths[0]
        else {
            panic!("actor-state death expected");
        };
        assert_eq!(victim.uuid, victim_uuid);
        assert_eq!(buff_checkpoint.buffs(*victim)[0].instance_id, 7);

        // A duplicate delta with the same value emits nothing (no-op value).
        let duplicate = context.reduce_batch(batch(
            3,
            vec![actor_state(victim_uuid, 9, ObservationOrigin::Delta)],
        ));
        assert!(death_events(&duplicate).is_empty());
    }

    #[test]
    fn monster_victim_death_carries_empty_buff_checkpoint() {
        let mut context = EntityContext::new();
        let monster = EntityUuid(78);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: monster,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: monster,
                    change: ObservedBuffChange::Applied { buff: buff(7, 42) },
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![actor_state(monster, 9, ObservationOrigin::Delta)],
        ));
        let deaths = death_events(&events);
        assert_eq!(deaths.len(), 1);
        let DomainEvent::DeathOccurred {
            victim,
            buff_checkpoint,
            ..
        } = &deaths[0]
        else {
            panic!("death expected");
        };
        // Monster deaths are dropped by the death replay downstream, so the
        // checkpoint is not built for them at all.
        assert_eq!(victim.uuid, monster);
        assert!(buff_checkpoint.buffs(*victim).is_empty());
    }

    #[test]
    fn dummy_victim_death_carries_empty_buff_checkpoint() {
        // `CombatHitFact::from_domain` only emits `DamageTaken` for
        // `target_kind == EntityKind::Character`, so a training dummy can
        // never populate `DeathProjection`'s replay window either. The
        // checkpoint must stay empty rather than cloning every entity's buff
        // list for a death the replay path can never consume.
        let mut context = EntityContext::new();
        let dummy = EntityUuid(88);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: dummy,
                    kind: EntityKind::Dummy,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: dummy,
                    change: ObservedBuffChange::Applied { buff: buff(7, 42) },
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![actor_state(dummy, 9, ObservationOrigin::Delta)],
        ));
        let deaths = death_events(&events);
        assert_eq!(deaths.len(), 1);
        let DomainEvent::DeathOccurred {
            victim,
            buff_checkpoint,
            ..
        } = &deaths[0]
        else {
            panic!("death expected");
        };
        assert_eq!(victim.uuid, dummy);
        assert!(buff_checkpoint.buffs(*victim).is_empty());
    }

    #[test]
    fn actor_state_death_is_emitted_after_same_batch_hits() {
        let mut context = EntityContext::new();
        let victim = EntityUuid(70);
        let attacker = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: victim,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::EntityAppeared {
                    uuid: attacker,
                    kind: EntityKind::Monster,
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![
                actor_state(victim, 9, ObservationOrigin::Delta),
                incoming_hit(attacker, victim),
            ],
        ));

        let hit_pos = events
            .iter()
            .position(|envelope| matches!(envelope.event, DomainEvent::HitResolved(_)));
        let death_pos = events
            .iter()
            .position(|envelope| matches!(envelope.event, DomainEvent::DeathOccurred { .. }));
        assert!(
            hit_pos
                .zip(death_pos)
                .is_some_and(|(hit, death)| hit < death),
            "same-batch ActorState death must follow the killing blow: {events:?}"
        );
        assert_eq!(death_events(&events).len(), 1);
    }

    #[test]
    fn same_batch_revival_cancels_pending_death() {
        let mut context = EntityContext::new();
        let victim = EntityUuid(71);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: victim,
                kind: EntityKind::Character,
            }],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![
                actor_state(victim, 9, ObservationOrigin::Delta),
                actor_state(victim, 0, ObservationOrigin::Delta),
            ],
        ));
        assert!(death_events(&events).is_empty());
        assert_eq!(revived_events(&events).len(), 1);
        assert!(!context.entities[&victim].is_dead);
    }

    #[test]
    fn death_before_disappear_keeps_point_in_time_buffs() {
        let mut context = EntityContext::new();
        let victim_uuid = EntityUuid(75);
        let attacker_uuid = EntityUuid(175);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: victim_uuid,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: victim_uuid,
                    change: ObservedBuffChange::Applied { buff: buff(7, 42) },
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: attacker_uuid,
                    change: ObservedBuffChange::Applied { buff: buff(8, 43) },
                },
            ],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![
                actor_state(victim_uuid, 9, ObservationOrigin::Delta),
                ProtocolObservation::EntityDisappeared { uuid: victim_uuid },
            ],
        ));

        let death_pos = events
            .iter()
            .position(|envelope| matches!(envelope.event, DomainEvent::DeathOccurred { .. }));
        let disappear_pos = events
            .iter()
            .position(|envelope| matches!(envelope.event, DomainEvent::EntityDisappeared { .. }));
        assert!(
            death_pos
                .zip(disappear_pos)
                .is_some_and(|(death, disappear)| death < disappear),
            "pending death must flush before despawn: {events:?}"
        );

        let deaths = death_events(&events);
        let DomainEvent::DeathOccurred {
            victim,
            killer: None,
            buff_checkpoint,
            ..
        } = &deaths[0]
        else {
            panic!("death expected");
        };
        let attacker = context
            .entity_ref(attacker_uuid)
            .expect("attacker still present");
        assert_eq!(buff_checkpoint.buffs(*victim)[0].instance_id, 7);
        assert_eq!(buff_checkpoint.buffs(attacker)[0].instance_id, 8);
        assert_eq!(context.active_buffs(victim_uuid).count(), 0);
    }

    #[test]
    fn remove_before_death_is_absent_from_checkpoint() {
        let mut context = EntityContext::new();
        let victim_uuid = EntityUuid(76);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::BuffChanged {
                target_uuid: victim_uuid,
                change: ObservedBuffChange::Applied { buff: buff(7, 42) },
            }],
        ));

        let events = context.reduce_batch(batch(
            2,
            vec![
                ProtocolObservation::BuffChanged {
                    target_uuid: victim_uuid,
                    change: ObservedBuffChange::Remove { instance_id: 7 },
                },
                actor_state(victim_uuid, 9, ObservationOrigin::Delta),
            ],
        ));

        let deaths = death_events(&events);
        let DomainEvent::DeathOccurred {
            victim,
            buff_checkpoint,
            ..
        } = &deaths[0]
        else {
            panic!("death expected");
        };
        assert!(buff_checkpoint.buffs(*victim).is_empty());
    }

    #[test]
    fn reappeared_generation_does_not_inherit_old_buffs() {
        let mut context = EntityContext::new();
        let victim_uuid = EntityUuid(77);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: victim_uuid,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::BuffChanged {
                    target_uuid: victim_uuid,
                    change: ObservedBuffChange::Applied { buff: buff(7, 42) },
                },
            ],
        ));
        let old_generation = context.entity_ref(victim_uuid).expect("appeared entity");
        context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::EntityDisappeared { uuid: victim_uuid }],
        ));
        context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::EntityAppeared {
                uuid: victim_uuid,
                kind: EntityKind::Character,
            }],
        ));

        let events = context.reduce_batch(batch(
            4,
            vec![actor_state(victim_uuid, 9, ObservationOrigin::Delta)],
        ));

        let deaths = death_events(&events);
        let DomainEvent::DeathOccurred {
            victim,
            buff_checkpoint,
            ..
        } = &deaths[0]
        else {
            panic!("death expected");
        };
        assert_ne!(*victim, old_generation);
        assert!(buff_checkpoint.buffs(old_generation).is_empty());
        assert!(buff_checkpoint.buffs(*victim).is_empty());
    }

    #[test]
    fn actor_state_death_survives_resurrection_and_reappearing_resets() {
        let mut context = EntityContext::new();
        let monster = EntityUuid(72);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: monster,
                kind: EntityKind::Monster,
            }],
        ));
        context.reduce_batch(batch(
            2,
            vec![actor_state(monster, 9, ObservationOrigin::Delta)],
        ));

        // Resurrection: state flips back, then dies again -> second death.
        context.reduce_batch(batch(
            3,
            vec![actor_state(monster, 0, ObservationOrigin::Delta)],
        ));
        let events = context.reduce_batch(batch(
            4,
            vec![actor_state(monster, 9, ObservationOrigin::Delta)],
        ));
        assert_eq!(death_events(&events).len(), 1);

        // Disappear keeps the dead flag (corpse), reappear resets it.
        context.reduce_batch(batch(
            5,
            vec![ProtocolObservation::EntityDisappeared { uuid: monster }],
        ));
        assert!(context.entities[&monster].is_dead);
        context.reduce_batch(batch(
            6,
            vec![ProtocolObservation::EntityAppeared {
                uuid: monster,
                kind: EntityKind::Monster,
            }],
        ));
        assert!(!context.entities[&monster].is_dead);
    }

    #[test]
    fn baseline_snapshot_of_corpse_sets_flag_without_death_event() {
        let mut context = EntityContext::new();
        let corpse = EntityUuid(73);
        let events = context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: corpse,
                    kind: EntityKind::Monster,
                },
                actor_state(corpse, 9, ObservationOrigin::Snapshot),
            ],
        ));
        assert!(death_events(&events).is_empty());
        assert!(context.entities[&corpse].is_dead);
    }

    #[test]
    fn actor_state_revival_emits_revived_once() {
        let mut context = EntityContext::new();
        let victim = EntityUuid(71);
        context.reduce_batch(batch(
            1,
            vec![ProtocolObservation::EntityAppeared {
                uuid: victim,
                kind: EntityKind::Character,
            }],
        ));

        // Death edge, then the revival edge: exactly one Revived.
        context.reduce_batch(batch(
            2,
            vec![actor_state(victim, 9, ObservationOrigin::Delta)],
        ));
        let events = context.reduce_batch(batch(
            3,
            vec![actor_state(victim, 0, ObservationOrigin::Delta)],
        ));
        let revived = revived_events(&events);
        assert_eq!(revived.len(), 1);
        assert!(matches!(
            &revived[0],
            DomainEvent::Revived { entity } if entity.uuid == victim
        ));

        // Staying alive is a level, not an edge: no further Revived.
        let events = context.reduce_batch(batch(
            4,
            vec![actor_state(victim, 0, ObservationOrigin::Delta)],
        ));
        assert!(revived_events(&events).is_empty());
        assert!(death_events(&events).is_empty());
    }

    #[test]
    fn dead_entity_is_not_the_current_attack_target() {
        let mut context = EntityContext::new();
        let local = EntityUuid(10);
        let monster = EntityUuid(74);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::EntityAppeared {
                    uuid: monster,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::AttackTargetChanged {
                    actor_uuid: local,
                    target_uuid: Some(monster),
                },
            ],
        ));
        assert!(context.roles(monster).is_current_target);

        context.reduce_batch(batch(
            2,
            vec![actor_state(monster, 9, ObservationOrigin::Delta)],
        ));
        assert!(!context.roles(monster).is_current_target);
    }

    #[test]
    fn skill_cooldown_updates_upsert_and_forward_authoritative_repeats() {
        let mut context = EntityContext::new();
        let local = EntityUuid(10);
        context.reduce_batch(batch(
            1,
            vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
            ],
        ));

        let first = context.reduce_batch(batch(
            2,
            vec![ProtocolObservation::SkillCooldownUpdated {
                entity_uuid: local,
                cooldowns: vec![SkillCooldownState {
                    skill_level_id: 12_301,
                    begin_time: Some(1_000),
                    duration: Some(10_000),
                    cooldown_type: Some(0),
                    valid_time: Some(0),
                }],
            }],
        ));
        assert_eq!(first.len(), 1);
        assert_eq!(context.entity(local).unwrap().skill_cooldowns.len(), 1);

        let second = context.reduce_batch(batch(
            3,
            vec![ProtocolObservation::SkillCooldownUpdated {
                entity_uuid: local,
                cooldowns: vec![SkillCooldownState {
                    skill_level_id: 45_601,
                    begin_time: Some(2_000),
                    duration: Some(8_000),
                    cooldown_type: Some(0),
                    valid_time: Some(0),
                }],
            }],
        ));
        assert_eq!(second.len(), 1);
        assert_eq!(context.entity(local).unwrap().skill_cooldowns.len(), 2);

        let updated = context.reduce_batch(batch(
            4,
            vec![ProtocolObservation::SkillCooldownUpdated {
                entity_uuid: local,
                cooldowns: vec![SkillCooldownState {
                    skill_level_id: 12_301,
                    begin_time: Some(3_000),
                    duration: Some(9_000),
                    cooldown_type: Some(0),
                    valid_time: Some(500),
                }],
            }],
        ));
        assert_eq!(updated.len(), 1);
        let cds = &context.entity(local).unwrap().skill_cooldowns;
        assert_eq!(cds.len(), 2);
        let skill_a = cds
            .iter()
            .find(|cd| cd.skill_level_id == 12_301)
            .expect("skill A retained");
        assert_eq!(skill_a.begin_time, Some(3_000));
        assert_eq!(skill_a.duration, Some(9_000));
        assert!(
            cds.iter().any(|cd| cd.skill_level_id == 45_601),
            "skill B still present after A update"
        );

        let repeated = context.reduce_batch(batch(
            5,
            vec![ProtocolObservation::SkillCooldownUpdated {
                entity_uuid: local,
                cooldowns: vec![SkillCooldownState {
                    skill_level_id: 12_301,
                    begin_time: Some(3_000),
                    duration: Some(9_000),
                    cooldown_type: Some(0),
                    valid_time: Some(500),
                }],
            }],
        ));
        assert_eq!(repeated.len(), 1);
        assert!(matches!(
            repeated[0].event,
            DomainEvent::SkillCooldownUpdated { .. }
        ));
        assert_eq!(context.entity(local).unwrap().skill_cooldowns.len(), 2);
    }
}
