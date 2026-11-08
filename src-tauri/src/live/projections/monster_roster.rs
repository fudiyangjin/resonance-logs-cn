//! Every monster the team is fighting, for the battle roster panel.
//!
//! A world monster is on the roster while it is alive and either its own hate
//! list names the local player or a teammate, a player-side hate list of the
//! local player or a teammate names it, or it is the local player's attack
//! target. Membership is re-evaluated only for the entities an event touches;
//! HP, target and position are read from [`EntityContext`] at publish time.
//!
//! Casts of the watched skills are tracked per member: the latest cast of
//! each watched skill, and the one being cast right now. Cooldowns, battle
//! start windows and sing bars are derived on the frontend from these
//! timestamps and the skill tables. Each new watched cast is also reported
//! to the caller, which hands it to the voice rules.
//!
//! Tracking runs while the panel is shown or a voice rule listens for roster
//! casts; only the panel makes the roster published.
//!
//! The projection also remembers, for this run only, which monster templates
//! (and which of their skills) have been on the roster so the settings page
//! can offer them for blocking and watching.

use std::collections::HashMap;
use std::collections::hash_map::Entry;

use crate::live::bootstrap_snapshot::MonsterRosterRuntimeSnapshot;
use crate::live::entity_id::is_character_uuid;
use crate::live::ipc::models::{
    LiveMonsterRosterPayload, RecentRosterMonster, RosterMonsterKind, RosterMonsterState,
    RosterPlayerState, RosterSkillCast,
};
use crate::live::monster_registry::{self, MonsterType};
use crate::live::projections::monster_skill_watch::is_world_monster;
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    AttributeValue, DomainEnvelope, DomainEvent, EntityKind, EntityUuid, Position, SkillPhase,
};

/// Distinct monster templates remembered for the block picker.
const MAX_RECENT_MONSTERS: usize = 200;
/// Distinct skills remembered per recent template.
const MAX_RECENT_SKILLS: usize = 32;
/// `ActorState` while an entity is casting a skill.
const ACTOR_STATE_SKILL: i64 = 2;
/// A skill begin time this far from the event is not trusted.
const MAX_SKILL_TIME_SKEW_MS: u64 = 10_000;

/// One roster publication: the live payload, plus the recent-monster list
/// when it changed since the previous publication.
#[derive(Debug)]
pub struct MonsterRosterPublication {
    pub payload: LiveMonsterRosterPayload,
    pub recent: Option<Vec<RecentRosterMonster>>,
}

/// What one event did to the roster.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct RosterOutcome {
    /// The published roster changed; always false while the panel is hidden.
    pub republish: bool,
    /// A member started a cast of this watched skill.
    pub watched_cast: Option<i32>,
}

#[derive(Debug)]
struct Member {
    joined_seq: u64,
    /// Wall-clock ms of joining: the battle start of the monster.
    joined_at_ms: i64,
    /// Last skill instance seen, so repeated deltas of one cast count once.
    last_skill_uuid: Option<i64>,
    /// Latest cast of each watched skill.
    casts: Vec<RosterSkillCast>,
    /// The watched skill being cast now.
    current_cast: Option<RosterSkillCast>,
}

#[derive(Debug, Default)]
pub struct MonsterRosterProjection {
    /// The panel is shown: the roster is published.
    panel: bool,
    /// A voice rule announces roster casts.
    voiced: bool,
    /// Sorted and deduplicated (normalized by the runtime snapshot).
    watched: Vec<i32>,
    members: HashMap<EntityUuid, Member>,
    /// Player-side hate lists (the monsters each player is fighting) of the
    /// local player and teammates, as last received.
    player_lists: HashMap<EntityUuid, Vec<EntityUuid>>,
    join_sequence: u64,
    recent: HashMap<i32, RecentRosterMonster>,
    recent_changed: bool,
    revision: u64,
}

impl MonsterRosterProjection {
    /// Applies the panel's visibility and replaces the watched skills.
    /// Returns true when the roster should be republished.
    pub fn apply_config(
        &mut self,
        config: &MonsterRosterRuntimeSnapshot,
        entities: &EntityContext,
        now_wall_ms: i64,
    ) -> bool {
        let was_tracking = self.tracking();
        let panel_toggled = config.enabled != self.panel;
        self.panel = config.enabled;
        let mut changed = self.retrack(was_tracking, entities, now_wall_ms);
        if config.watched_skill_ids != self.watched {
            self.watched.clone_from(&config.watched_skill_ids);
            let watched = &self.watched;
            for member in self.members.values_mut() {
                let before = (member.casts.len(), member.current_cast);
                member
                    .casts
                    .retain(|cast| watched.binary_search(&cast.skill_id).is_ok());
                member.current_cast = member
                    .current_cast
                    .filter(|cast| watched.binary_search(&cast.skill_id).is_ok());
                changed |= before != (member.casts.len(), member.current_cast);
            }
        }
        // Showing the panel publishes what voice-only tracking gathered.
        self.panel && (changed || panel_toggled)
    }

    /// Turns tracking for the voice rules on or off. Returns true when the
    /// roster should be republished.
    pub fn set_voiced(&mut self, voiced: bool, entities: &EntityContext, now_wall_ms: i64) -> bool {
        let was_tracking = self.tracking();
        self.voiced = voiced;
        self.retrack(was_tracking, entities, now_wall_ms) && self.panel
    }

    /// Does nothing while neither the panel nor a voice rule needs the
    /// roster.
    pub fn apply(&mut self, envelope: &DomainEnvelope, entities: &EntityContext) -> RosterOutcome {
        if !self.tracking() {
            return RosterOutcome::default();
        }
        let (changed, watched_cast) = match &envelope.event {
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase: SkillPhase::Observed,
                ..
            } => self.observe_cast(entities, caster.uuid, *skill_id, envelope.occurred_at_ms),
            _ => (self.apply_membership(envelope, entities), None),
        };
        RosterOutcome {
            republish: changed && self.panel,
            watched_cast,
        }
    }

    const fn tracking(&self) -> bool {
        self.panel || self.voiced
    }

    /// Rebuilds or drops the members when tracking switched; true when they
    /// changed.
    fn retrack(&mut self, was_tracking: bool, entities: &EntityContext, now_ms: i64) -> bool {
        match (was_tracking, self.tracking()) {
            (false, true) => {
                self.rebuild(entities, now_ms);
                true
            }
            (true, false) => self.clear_members(),
            _ => false,
        }
    }

    /// Every event except casts: membership, HP, targets and positions.
    /// True when the roster changed.
    fn apply_membership(&mut self, envelope: &DomainEnvelope, entities: &EntityContext) -> bool {
        let now_ms = envelope.occurred_at_ms;
        match &envelope.event {
            DomainEvent::HateListUpdated { entity, entries } => {
                if !is_tracked_player(entities, entity.uuid) {
                    return self.reevaluate(entities, entity.uuid, now_ms);
                }
                let next: Vec<EntityUuid> = entries.iter().map(|entry| entry.entity_uuid).collect();
                let mut affected = self.player_lists.remove(&entity.uuid).unwrap_or_default();
                affected.extend_from_slice(&next);
                if !next.is_empty() {
                    self.player_lists.insert(entity.uuid, next);
                }
                self.reevaluate_all(entities, affected, now_ms)
            }
            DomainEvent::AttributeChanged {
                entity, attr_id, ..
            } if matches!(
                *attr_id,
                attr_type::ATTR_CURRENT_HP | attr_type::ATTR_MAX_HP
            ) =>
            {
                let was_member = self.members.contains_key(&entity.uuid);
                if was_member && *attr_id == attr_type::ATTR_MAX_HP {
                    self.note_recent(entities, entity.uuid, now_ms);
                }
                self.reevaluate(entities, entity.uuid, now_ms) || was_member
            }
            DomainEvent::AttributeChanged {
                entity,
                attr_id,
                current: AttributeValue::Int(state),
                ..
            } if *attr_id == attr_type::ATTR_ACTOR_STATE && *state != ACTOR_STATE_SKILL => self
                .members
                .get_mut(&entity.uuid)
                .is_some_and(|member| member.current_cast.take().is_some()),
            DomainEvent::AttackTargetChanged {
                actor,
                previous,
                current,
                ..
            } => {
                if entities.roles(actor.uuid).is_local_player {
                    let targets = [*previous, *current].into_iter().flatten();
                    self.reevaluate_all(entities, targets.map(|target| target.uuid), now_ms);
                    // The published current target changed.
                    return true;
                }
                self.members.contains_key(&actor.uuid)
            }
            DomainEvent::PositionChanged { entity, .. } => {
                !self.members.is_empty()
                    && (self.members.contains_key(&entity.uuid)
                        || entities.roles(entity.uuid).is_local_player)
            }
            DomainEvent::EntityDisappeared { entity } => {
                let mut changed = self.reevaluate(entities, entity.uuid, now_ms);
                // Despawning clears the player's hate list without an event.
                if let Some(monsters) = self.player_lists.remove(&entity.uuid) {
                    changed |= self.reevaluate_all(entities, monsters, now_ms);
                }
                changed
            }
            DomainEvent::EntityAppeared { entity, .. }
            | DomainEvent::IdentityChanged { entity, .. }
            | DomainEvent::Revived { entity }
            | DomainEvent::DeathOccurred { victim: entity, .. } => {
                self.reevaluate(entities, entity.uuid, now_ms)
            }
            DomainEvent::TeamMembershipChanged { .. }
            | DomainEvent::TeamChanged { .. }
            | DomainEvent::LocalPlayerChanged { .. } => {
                self.rebuild(entities, now_ms);
                true
            }
            DomainEvent::SceneChanged { .. } | DomainEvent::ContainerReset => self.clear_members(),
            _ => false,
        }
    }

    /// Drops the roster; the recent-monster list survives for the run.
    pub fn reset_runtime(&mut self) {
        self.clear_members();
    }

    pub fn payload(&mut self, entities: &EntityContext) -> MonsterRosterPublication {
        self.revision = self.revision.wrapping_add(1);
        let local = entities.local_player().map(|entity| entity.uuid);
        let local_position = local.and_then(|uuid| position_of(entities, uuid));

        let mut ordered: Vec<(&EntityUuid, &Member)> = self.members.iter().collect();
        ordered.sort_unstable_by_key(|(_, member)| member.joined_seq);

        let mut monsters = Vec::with_capacity(ordered.len());
        let mut targeted_players: Vec<EntityUuid> = Vec::new();
        for (&uuid, member) in ordered {
            let Some(state) = entities.entity(uuid) else {
                continue;
            };
            let target = entities.attack_target_of(uuid);
            if let Some(player) = target.filter(|target| {
                Some(*target) != local
                    && is_character_uuid(target.0)
                    && !targeted_players.contains(target)
            }) {
                targeted_players.push(player);
            }
            monsters.push(RosterMonsterState {
                uuid: uuid.0.to_string(),
                monster_id: state.identity.monster_id,
                kind: kind_of(state.identity.monster_id),
                hp: state.int_attr(attr_type::ATTR_CURRENT_HP).unwrap_or(0),
                max_hp: state.int_attr(attr_type::ATTR_MAX_HP).unwrap_or(0),
                target_uuid: target.map(|target| target.0.to_string()),
                distance_m: local_position
                    .zip(position_of(entities, uuid))
                    .map(|(from, to)| from.planar_distance_to(to)),
                joined_seq: member.joined_seq,
                joined_at_ms: member.joined_at_ms,
                skill_casts: member.casts.clone(),
                current_cast: member.current_cast,
            });
        }

        let players = targeted_players
            .into_iter()
            .map(|uuid| {
                let identity = entities.entity(uuid).map(|state| &state.identity);
                RosterPlayerState {
                    uuid: uuid.0.to_string(),
                    name: identity.and_then(|identity| identity.name.clone()),
                    profession_id: identity.and_then(|identity| identity.profession_id),
                }
            })
            .collect();

        MonsterRosterPublication {
            payload: LiveMonsterRosterPayload {
                revision: self.revision,
                local_uuid: local.map(|uuid| uuid.0.to_string()),
                current_target_uuid: entities
                    .current_attack_target()
                    .map(|target| target.uuid.0.to_string()),
                monsters,
                players,
            },
            recent: self.take_recent(),
        }
    }

    fn rebuild(&mut self, entities: &EntityContext, now_ms: i64) {
        self.player_lists.clear();
        for state in entities.entities() {
            if state.identity.kind == EntityKind::Character
                && !state.hate_entries.is_empty()
                && is_tracked_player(entities, state.entity.uuid)
            {
                self.player_lists.insert(
                    state.entity.uuid,
                    state
                        .hate_entries
                        .iter()
                        .map(|entry| entry.entity_uuid)
                        .collect(),
                );
            }
        }
        let candidates: Vec<EntityUuid> = entities
            .entities()
            .filter(|state| is_monster_kind(state.identity.kind))
            .map(|state| state.entity.uuid)
            .chain(self.members.keys().copied())
            .collect();
        self.reevaluate_all(entities, candidates, now_ms);
    }

    fn reevaluate_all(
        &mut self,
        entities: &EntityContext,
        uuids: impl IntoIterator<Item = EntityUuid>,
        now_ms: i64,
    ) -> bool {
        let mut changed = false;
        for uuid in uuids {
            changed |= self.reevaluate(entities, uuid, now_ms);
        }
        changed
    }

    /// Adds or removes `uuid`; true when its membership changed.
    fn reevaluate(&mut self, entities: &EntityContext, uuid: EntityUuid, now_ms: i64) -> bool {
        let qualifies = self.qualifies(entities, uuid);
        match (qualifies, self.members.contains_key(&uuid)) {
            (true, false) => {
                self.join_sequence = self.join_sequence.wrapping_add(1);
                self.members.insert(
                    uuid,
                    Member {
                        joined_seq: self.join_sequence,
                        joined_at_ms: now_ms,
                        last_skill_uuid: None,
                        casts: Vec::new(),
                        current_cast: None,
                    },
                );
                self.note_recent(entities, uuid, now_ms);
                true
            }
            (false, true) => {
                self.members.remove(&uuid);
                true
            }
            _ => false,
        }
    }

    fn qualifies(&self, entities: &EntityContext, uuid: EntityUuid) -> bool {
        let Some(state) = entities.entity(uuid) else {
            return false;
        };
        let is_monster =
            state.identity.kind == EntityKind::Dummy || is_world_monster(entities, uuid);
        let alive = state.is_present
            && !state.is_dead
            && state
                .int_attr(attr_type::ATTR_CURRENT_HP)
                .is_some_and(|hp| hp > 0)
            && state
                .int_attr(attr_type::ATTR_MAX_HP)
                .is_some_and(|max_hp| max_hp > 0);
        is_monster
            && alive
            && (entities.roles(uuid).is_current_target
                || state
                    .hate_entries
                    .iter()
                    .any(|entry| is_tracked_player(entities, entry.entity_uuid))
                || self.player_lists.values().any(|list| list.contains(&uuid)))
    }

    fn note_recent(&mut self, entities: &EntityContext, uuid: EntityUuid, now_ms: i64) {
        let Some(state) = entities.entity(uuid) else {
            return;
        };
        let Some(monster_id) = state.identity.monster_id else {
            return;
        };
        let max_hp = state.int_attr(attr_type::ATTR_MAX_HP).unwrap_or(0);
        let scene_id = entities.current_scene_id();
        if !self.recent.contains_key(&monster_id)
            && self.recent.len() >= MAX_RECENT_MONSTERS
            && let Some(oldest) = self
                .recent
                .values()
                .min_by_key(|entry| entry.last_seen_ms)
                .map(|entry| entry.monster_id)
        {
            self.recent.remove(&oldest);
        }
        match self.recent.entry(monster_id) {
            Entry::Occupied(mut entry) => {
                let entry = entry.get_mut();
                entry.max_hp = entry.max_hp.max(max_hp);
                entry.scene_id = scene_id.or(entry.scene_id);
                entry.last_seen_ms = now_ms;
            }
            Entry::Vacant(entry) => {
                entry.insert(RecentRosterMonster {
                    monster_id,
                    kind: kind_of(Some(monster_id)),
                    max_hp,
                    scene_id,
                    last_seen_ms: now_ms,
                    skill_ids: Vec::new(),
                });
            }
        }
        self.recent_changed = true;
    }

    /// Records a cast by a member. A watched skill becomes the latest cast
    /// of that skill and the current cast of the member; any other skill
    /// ends the current one. Every skill also goes to the recent list of the
    /// member's template. Returns whether the publication changed (the
    /// roster, or the recent list: the settings page reads it from the last
    /// publication, so a new skill must not wait for another roster change)
    /// and the watched skill a member started casting, if any.
    fn observe_cast(
        &mut self,
        entities: &EntityContext,
        uuid: EntityUuid,
        skill_id: i32,
        now_ms: i64,
    ) -> (bool, Option<i32>) {
        let Some(member) = self.members.get_mut(&uuid) else {
            return (false, None);
        };
        let state = entities.entity(uuid);
        let skill_uuid = state.and_then(|state| state.int_attr(attr_type::ATTR_SKILL_UUID));
        if skill_uuid.is_some() && skill_uuid == member.last_skill_uuid {
            return (false, None);
        }
        member.last_skill_uuid = skill_uuid;
        let cast_at_ms = state
            .and_then(|state| state.int_attr(attr_type::ATTR_SKILL_BEGIN_TIME))
            .zip(entities.server_clock_offset_ms())
            .map(|(server_ms, offset_ms)| server_ms.saturating_add(offset_ms))
            .filter(|at_ms| at_ms.abs_diff(now_ms) <= MAX_SKILL_TIME_SKEW_MS)
            .unwrap_or(now_ms);

        let watched = self.watched.binary_search(&skill_id).is_ok();
        let changed = if watched {
            let cast = RosterSkillCast {
                skill_id,
                cast_at_ms,
            };
            match member
                .casts
                .iter_mut()
                .find(|existing| existing.skill_id == skill_id)
            {
                Some(existing) => *existing = cast,
                None => member.casts.push(cast),
            }
            member.current_cast = Some(cast);
            true
        } else {
            member.current_cast.take().is_some()
        };

        let noted = state
            .and_then(|state| state.identity.monster_id)
            .is_some_and(|monster_id| self.note_recent_skill(monster_id, skill_id));
        (changed || noted, watched.then_some(skill_id))
    }

    /// Adds `skill_id` to the recent skills of `monster_id`; true when it was
    /// new.
    fn note_recent_skill(&mut self, monster_id: i32, skill_id: i32) -> bool {
        let Some(entry) = self.recent.get_mut(&monster_id) else {
            return false;
        };
        if entry.skill_ids.len() < MAX_RECENT_SKILLS
            && let Err(index) = entry.skill_ids.binary_search(&skill_id)
        {
            entry.skill_ids.insert(index, skill_id);
            self.recent_changed = true;
            return true;
        }
        false
    }

    /// The recent-monster list, most recently seen first, if it changed.
    fn take_recent(&mut self) -> Option<Vec<RecentRosterMonster>> {
        if !std::mem::take(&mut self.recent_changed) {
            return None;
        }
        let mut recent: Vec<RecentRosterMonster> = self.recent.values().cloned().collect();
        recent.sort_unstable_by(|a, b| {
            b.last_seen_ms
                .cmp(&a.last_seen_ms)
                .then(a.monster_id.cmp(&b.monster_id))
        });
        Some(recent)
    }

    fn clear_members(&mut self) -> bool {
        let changed = !self.members.is_empty();
        self.members.clear();
        self.player_lists.clear();
        changed
    }
}

/// The local player or a teammate.
fn is_tracked_player(entities: &EntityContext, uuid: EntityUuid) -> bool {
    let roles = entities.roles(uuid);
    roles.is_local_player || roles.is_team_member
}

const fn is_monster_kind(kind: EntityKind) -> bool {
    matches!(kind, EntityKind::Monster | EntityKind::Dummy)
}

fn kind_of(monster_id: Option<i32>) -> RosterMonsterKind {
    match monster_id.and_then(monster_registry::monster_type) {
        Some(MonsterType::Boss) => RosterMonsterKind::Boss,
        Some(MonsterType::Elite) => RosterMonsterKind::Elite,
        Some(MonsterType::Normal) | None => RosterMonsterKind::Normal,
    }
}

fn position_of(entities: &EntityContext, uuid: EntityUuid) -> Option<Position> {
    entities
        .entity(uuid)?
        .positions
        .get(&attr_type::ATTR_POS)
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::entity_id::canonical_player_uuid;
    use crate::live::runtime::events::{
        BatchId, EntityIdentityPatch, EventMeta, FieldPatch, HateEntry, MonoTimeMs,
        ObservationOrigin, ObservedTeamBase, ObservedTeamMember, ProtocolBatch,
        ProtocolObservation, TeamKind, TeamRosterUpdate,
    };

    /// `103303` is an elite in `MonsterIdType.json`.
    const ELITE_TEMPLATE: i32 = 103_303;
    const MONSTER: EntityUuid = EntityUuid(9);
    const OTHER_MONSTER: EntityUuid = EntityUuid(10);
    const SUMMON: EntityUuid = EntityUuid(11);

    fn local() -> EntityUuid {
        EntityUuid(canonical_player_uuid(42))
    }

    fn teammate() -> EntityUuid {
        EntityUuid(canonical_player_uuid(43))
    }

    fn stranger() -> EntityUuid {
        EntityUuid(canonical_player_uuid(44))
    }

    fn meta() -> EventMeta {
        EventMeta {
            batch_id: BatchId(0),
            capture_sequence: 0,
            stream_id: 0,
            stream_epoch: 0,
            captured_wall_ms: 1_000,
            captured_mono_ns: MonoTimeMs(1_000).0 * 1_000_000,
            source_time_ms: None,
        }
    }

    fn appear(
        uuid: EntityUuid,
        kind: EntityKind,
        owner: Option<EntityUuid>,
    ) -> Vec<ProtocolObservation> {
        vec![
            ProtocolObservation::EntityAppeared { uuid, kind },
            ProtocolObservation::IdentityUpdated {
                uuid,
                patch: EntityIdentityPatch {
                    kind: FieldPatch::Set(kind),
                    owner_uuid: owner.map_or(FieldPatch::Unchanged, FieldPatch::Set),
                    monster_id: if kind == EntityKind::Monster {
                        FieldPatch::Set(ELITE_TEMPLATE)
                    } else {
                        FieldPatch::Unchanged
                    },
                    ..Default::default()
                },
            },
        ]
    }

    fn int_attr(uuid: EntityUuid, attr_id: i32, value: i64) -> ProtocolObservation {
        ProtocolObservation::AttributeUpdated {
            uuid,
            attr_id,
            value: AttributeValue::Int(value),
            origin: ObservationOrigin::Snapshot,
        }
    }

    fn hp(uuid: EntityUuid, current: i64, max: i64) -> Vec<ProtocolObservation> {
        vec![
            int_attr(uuid, attr_type::ATTR_MAX_HP, max),
            int_attr(uuid, attr_type::ATTR_CURRENT_HP, current),
        ]
    }

    fn hate(entity: EntityUuid, members: &[EntityUuid]) -> ProtocolObservation {
        ProtocolObservation::HateListUpdated {
            entity_uuid: entity,
            entries: members
                .iter()
                .map(|uuid| HateEntry {
                    entity_uuid: *uuid,
                    value: 100,
                })
                .collect(),
        }
    }

    fn team_with_teammate() -> ProtocolObservation {
        ProtocolObservation::TeamRoster(TeamRosterUpdate::Joined {
            base: Some(ObservedTeamBase {
                team_id: 7,
                leader_id: 42,
                kind: TeamKind::Five,
                create_time_ms: 0,
                groups: vec![(1, vec![42, 43])],
            }),
            members: [42, 43]
                .into_iter()
                .map(|char_id| ObservedTeamMember {
                    char_id,
                    enter_time: Some(1),
                    group_id: Some(1),
                })
                .collect(),
        })
    }

    /// Local player, a teammate, a stranger, two monsters with HP and a
    /// summon of the local player, in a team.
    fn scene() -> EntityContext {
        let mut observations = appear(local(), EntityKind::Character, None);
        observations.push(ProtocolObservation::LocalPlayerChanged {
            uuid: Some(local()),
        });
        observations.extend(appear(teammate(), EntityKind::Character, None));
        observations.extend(appear(stranger(), EntityKind::Character, None));
        observations.push(team_with_teammate());
        for monster in [MONSTER, OTHER_MONSTER] {
            observations.extend(appear(monster, EntityKind::Monster, None));
            observations.extend(hp(monster, 800, 1_000));
        }
        observations.extend(appear(SUMMON, EntityKind::Monster, Some(local())));
        observations.extend(hp(SUMMON, 500, 500));
        let mut entities = EntityContext::new();
        entities.apply_batch(ProtocolBatch {
            meta: meta(),
            observations,
        });
        entities
    }

    fn config(enabled: bool, watched: &[i32]) -> MonsterRosterRuntimeSnapshot {
        MonsterRosterRuntimeSnapshot {
            enabled,
            watched_skill_ids: watched.to_vec(),
        }
    }

    fn enabled(entities: &EntityContext) -> MonsterRosterProjection {
        let mut roster = MonsterRosterProjection::default();
        assert!(roster.apply_config(&config(true, &[]), entities, 0));
        roster
    }

    fn watching(entities: &EntityContext, skills: &[i32]) -> MonsterRosterProjection {
        let mut roster = MonsterRosterProjection::default();
        assert!(roster.apply_config(&config(true, skills), entities, 0));
        roster
    }

    /// A new skill instance on `caster`, as the decoder reports it.
    fn cast(caster: EntityUuid, skill_id: i32, instance: i64) -> Vec<ProtocolObservation> {
        vec![
            int_attr(caster, attr_type::ATTR_ACTOR_STATE, 2),
            ProtocolObservation::SkillLifecycleChanged {
                caster_uuid: caster,
                skill_id,
                phase: SkillPhase::Observed,
                target_uuid: None,
            },
            int_attr(caster, attr_type::ATTR_SKILL_UUID, instance),
        ]
    }

    fn roster_monster(
        roster: &mut MonsterRosterProjection,
        entities: &EntityContext,
        uuid: EntityUuid,
    ) -> RosterMonsterState {
        roster
            .payload(entities)
            .payload
            .monsters
            .into_iter()
            .find(|monster| monster.uuid == uuid.0.to_string())
            .expect("roster member")
    }

    /// Applies `observations` and feeds the resulting events to `roster`.
    fn outcomes(
        entities: &mut EntityContext,
        roster: &mut MonsterRosterProjection,
        observations: Vec<ProtocolObservation>,
    ) -> Vec<RosterOutcome> {
        let envelopes = entities.apply_batch(ProtocolBatch {
            meta: meta(),
            observations,
        });
        envelopes
            .iter()
            .map(|envelope| roster.apply(envelope, entities))
            .collect()
    }

    /// True when any event changed the published roster.
    fn step(
        entities: &mut EntityContext,
        roster: &mut MonsterRosterProjection,
        observations: Vec<ProtocolObservation>,
    ) -> bool {
        outcomes(entities, roster, observations)
            .iter()
            .any(|outcome| outcome.republish)
    }

    /// The watched casts the events reported, in order.
    fn watched_casts(
        entities: &mut EntityContext,
        roster: &mut MonsterRosterProjection,
        observations: Vec<ProtocolObservation>,
    ) -> Vec<i32> {
        outcomes(entities, roster, observations)
            .iter()
            .filter_map(|outcome| outcome.watched_cast)
            .collect()
    }

    fn member_uuids(roster: &mut MonsterRosterProjection, entities: &EntityContext) -> Vec<String> {
        roster
            .payload(entities)
            .payload
            .monsters
            .into_iter()
            .map(|monster| monster.uuid)
            .collect()
    }

    #[test]
    fn monster_hating_a_teammate_joins_the_roster() {
        let mut entities = scene();
        let mut roster = enabled(&entities);

        assert!(step(
            &mut entities,
            &mut roster,
            vec![hate(MONSTER, &[teammate()])]
        ));

        let publication = roster.payload(&entities);
        let [monster] = publication.payload.monsters.as_slice() else {
            panic!("{:?}", publication.payload.monsters);
        };
        assert_eq!(monster.uuid, MONSTER.0.to_string());
        assert_eq!(monster.kind, RosterMonsterKind::Elite);
        assert_eq!((monster.hp, monster.max_hp), (800, 1_000));
    }

    #[test]
    fn monster_only_on_a_player_side_list_joins_the_roster() {
        let mut entities = scene();
        let mut roster = enabled(&entities);

        assert!(step(
            &mut entities,
            &mut roster,
            vec![hate(local(), &[OTHER_MONSTER])]
        ));
        assert_eq!(
            member_uuids(&mut roster, &entities),
            vec![OTHER_MONSTER.0.to_string()]
        );

        assert!(step(&mut entities, &mut roster, vec![hate(local(), &[])]));
        assert!(member_uuids(&mut roster, &entities).is_empty());
    }

    #[test]
    fn current_target_joins_without_any_hate() {
        let mut entities = scene();
        let mut roster = enabled(&entities);

        assert!(step(
            &mut entities,
            &mut roster,
            vec![ProtocolObservation::AttackTargetChanged {
                actor_uuid: local(),
                target_uuid: Some(MONSTER),
            }],
        ));

        let payload = roster.payload(&entities).payload;
        assert_eq!(payload.current_target_uuid, Some(MONSTER.0.to_string()));
        assert_eq!(payload.monsters.len(), 1);
    }

    #[test]
    fn strangers_fights_and_summons_stay_off_the_roster() {
        let mut entities = scene();
        let mut roster = enabled(&entities);

        assert!(!step(
            &mut entities,
            &mut roster,
            vec![hate(MONSTER, &[stranger()]), hate(SUMMON, &[local()])],
        ));
        assert!(member_uuids(&mut roster, &entities).is_empty());
    }

    #[test]
    fn dead_or_cleared_monsters_leave_the_roster() {
        let mut entities = scene();
        let mut roster = enabled(&entities);
        step(
            &mut entities,
            &mut roster,
            vec![hate(MONSTER, &[local()]), hate(OTHER_MONSTER, &[local()])],
        );
        assert_eq!(member_uuids(&mut roster, &entities).len(), 2);

        assert!(step(
            &mut entities,
            &mut roster,
            vec![int_attr(MONSTER, attr_type::ATTR_CURRENT_HP, 0)],
        ));
        assert!(step(
            &mut entities,
            &mut roster,
            vec![hate(OTHER_MONSTER, &[])]
        ));
        assert!(member_uuids(&mut roster, &entities).is_empty());
    }

    #[test]
    fn member_hp_and_target_changes_republish() {
        let mut entities = scene();
        let mut roster = enabled(&entities);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);

        assert!(step(
            &mut entities,
            &mut roster,
            vec![int_attr(MONSTER, attr_type::ATTR_CURRENT_HP, 700)],
        ));
        assert!(!step(
            &mut entities,
            &mut roster,
            vec![int_attr(OTHER_MONSTER, attr_type::ATTR_CURRENT_HP, 700)],
        ));
        assert!(step(
            &mut entities,
            &mut roster,
            vec![ProtocolObservation::AttackTargetChanged {
                actor_uuid: MONSTER,
                target_uuid: Some(teammate()),
            }],
        ));

        let payload = roster.payload(&entities).payload;
        assert_eq!(payload.monsters[0].hp, 700);
        assert_eq!(
            payload.monsters[0].target_uuid,
            Some(teammate().0.to_string())
        );
        assert_eq!(
            payload
                .players
                .iter()
                .map(|player| player.uuid.clone())
                .collect::<Vec<_>>(),
            vec![teammate().0.to_string()]
        );
    }

    #[test]
    fn disabled_roster_tracks_nothing_and_enabling_rebuilds() {
        let mut entities = scene();
        let mut roster = MonsterRosterProjection::default();

        assert!(!step(
            &mut entities,
            &mut roster,
            vec![hate(MONSTER, &[local()])]
        ));
        assert!(member_uuids(&mut roster, &entities).is_empty());

        assert!(roster.apply_config(&config(true, &[]), &entities, 0));
        assert_eq!(
            member_uuids(&mut roster, &entities),
            vec![MONSTER.0.to_string()]
        );

        // Hiding the panel stops tracking; the hidden panel needs no update.
        assert!(!roster.apply_config(&config(false, &[]), &entities, 0));
        assert!(member_uuids(&mut roster, &entities).is_empty());
    }

    #[test]
    fn voice_alone_tracks_the_roster_without_publishing_it() {
        let mut entities = scene();
        let mut roster = MonsterRosterProjection::default();
        assert!(!roster.apply_config(&config(false, &[WATCHED]), &entities, 0));
        assert!(!roster.set_voiced(true, &entities, 0));

        assert!(!step(
            &mut entities,
            &mut roster,
            vec![hate(MONSTER, &[local()])]
        ));
        assert_eq!(
            watched_casts(&mut entities, &mut roster, cast(MONSTER, WATCHED, 31)),
            vec![WATCHED]
        );

        // Showing the panel publishes what was tracked meanwhile.
        assert!(roster.apply_config(&config(true, &[WATCHED]), &entities, 0));
        assert_eq!(
            member_uuids(&mut roster, &entities),
            vec![MONSTER.0.to_string()]
        );

        // The panel keeps tracking on without the voice rules.
        assert!(!roster.set_voiced(false, &entities, 0));
        assert_eq!(member_uuids(&mut roster, &entities).len(), 1);
        assert!(!roster.apply_config(&config(false, &[WATCHED]), &entities, 0));
        assert!(member_uuids(&mut roster, &entities).is_empty());
    }

    #[test]
    fn recent_monsters_are_deduplicated_and_only_sent_when_changed() {
        let mut entities = scene();
        let mut roster = enabled(&entities);
        step(
            &mut entities,
            &mut roster,
            vec![hate(MONSTER, &[local()]), hate(OTHER_MONSTER, &[local()])],
        );

        let recent = roster.payload(&entities).recent.expect("recent changed");
        assert_eq!(recent.len(), 1, "both monsters share one template");
        assert_eq!(recent[0].monster_id, ELITE_TEMPLATE);
        assert_eq!(recent[0].max_hp, 1_000);
        assert!(roster.payload(&entities).recent.is_none());

        // Leaving the scene keeps the list for the rest of the run.
        roster.reset_runtime();
        assert!(member_uuids(&mut roster, &entities).is_empty());
        assert_eq!(roster.recent.len(), 1);
    }

    #[test]
    fn recent_monsters_evict_the_least_recently_seen() {
        let mut roster = MonsterRosterProjection::default();
        for id in 0..MAX_RECENT_MONSTERS as i32 {
            roster.recent.insert(
                id,
                RecentRosterMonster {
                    monster_id: id,
                    kind: RosterMonsterKind::Normal,
                    max_hp: 1,
                    scene_id: None,
                    last_seen_ms: i64::from(id) + 10,
                    skill_ids: Vec::new(),
                },
            );
        }
        let mut entities = scene();
        roster.apply_config(&config(true, &[]), &entities, 0);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);

        assert_eq!(roster.recent.len(), MAX_RECENT_MONSTERS);
        assert!(!roster.recent.contains_key(&0));
        assert!(roster.recent.contains_key(&ELITE_TEMPLATE));
    }

    const WATCHED: i32 = 1_009_804;
    const OTHER_SKILL: i32 = 1_009_805;

    #[test]
    fn watched_casts_are_recorded_once_per_instance() {
        let mut entities = scene();
        let mut roster = watching(&entities, &[WATCHED]);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);

        assert!(step(&mut entities, &mut roster, cast(MONSTER, WATCHED, 11)));
        // A repeated delta of the same instance is not a new cast.
        assert!(!step(
            &mut entities,
            &mut roster,
            cast(MONSTER, WATCHED, 11)
        ));

        let monster = roster_monster(&mut roster, &entities, MONSTER);
        let expected = RosterSkillCast {
            skill_id: WATCHED,
            cast_at_ms: 1_000,
        };
        assert_eq!(monster.skill_casts, vec![expected]);
        assert_eq!(monster.current_cast, Some(expected));
        assert_eq!(monster.joined_at_ms, 1_000);
    }

    #[test]
    fn watched_casts_are_reported_for_members_once_per_instance() {
        let mut entities = scene();
        let mut roster = watching(&entities, &[WATCHED]);

        assert!(
            watched_casts(&mut entities, &mut roster, cast(OTHER_MONSTER, WATCHED, 41)).is_empty(),
            "not on the roster"
        );

        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);
        assert_eq!(
            watched_casts(&mut entities, &mut roster, cast(MONSTER, WATCHED, 42)),
            vec![WATCHED]
        );
        assert!(
            watched_casts(&mut entities, &mut roster, cast(MONSTER, WATCHED, 42)).is_empty(),
            "the same instance again"
        );
        assert!(
            watched_casts(&mut entities, &mut roster, cast(MONSTER, OTHER_SKILL, 43)).is_empty(),
            "not watched"
        );
    }

    #[test]
    fn cast_time_comes_from_the_server_skill_begin_time() {
        let mut entities = scene();
        let mut roster = watching(&entities, &[WATCHED]);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);

        // Server clock 400 ms behind the capture clock; the skill began
        // 100 ms before the packet was captured.
        let envelopes = entities.apply_batch(ProtocolBatch {
            meta: EventMeta {
                source_time_ms: Some(600),
                ..meta()
            },
            observations: {
                let mut observations = cast(MONSTER, WATCHED, 12);
                observations.push(int_attr(MONSTER, attr_type::ATTR_SKILL_BEGIN_TIME, 500));
                observations
            },
        });
        for envelope in &envelopes {
            let _ = roster.apply(envelope, &entities);
        }

        let monster = roster_monster(&mut roster, &entities, MONSTER);
        assert_eq!(monster.skill_casts[0].cast_at_ms, 900);
    }

    #[test]
    fn current_cast_ends_on_another_skill_or_leaving_the_skill_state() {
        let mut entities = scene();
        let mut roster = watching(&entities, &[WATCHED]);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);

        step(&mut entities, &mut roster, cast(MONSTER, WATCHED, 21));
        assert!(step(
            &mut entities,
            &mut roster,
            cast(MONSTER, OTHER_SKILL, 22)
        ));
        let monster = roster_monster(&mut roster, &entities, MONSTER);
        assert_eq!(monster.current_cast, None);
        assert_eq!(monster.skill_casts.len(), 1, "the latest cast stays");

        step(&mut entities, &mut roster, cast(MONSTER, WATCHED, 23));
        assert!(step(
            &mut entities,
            &mut roster,
            vec![int_attr(MONSTER, attr_type::ATTR_ACTOR_STATE, 1)],
        ));
        assert_eq!(
            roster_monster(&mut roster, &entities, MONSTER).current_cast,
            None
        );
    }

    #[test]
    fn unwatched_casts_only_reach_the_recent_skill_list() {
        let mut entities = scene();
        let mut roster = watching(&entities, &[WATCHED]);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);
        roster.payload(&entities);

        // A skill new to the recent list asks for a publication by itself,
        // with nothing else changing on the roster.
        assert!(step(
            &mut entities,
            &mut roster,
            cast(MONSTER, OTHER_SKILL, 31)
        ));
        let publication = roster.payload(&entities);
        assert!(publication.payload.monsters[0].skill_casts.is_empty());
        let recent = publication.recent.expect("recent skills changed");
        assert_eq!(recent[0].skill_ids, vec![OTHER_SKILL]);

        // Casting it again changes nothing.
        assert!(!step(
            &mut entities,
            &mut roster,
            cast(MONSTER, OTHER_SKILL, 32)
        ));
        assert!(roster.payload(&entities).recent.is_none());
    }

    /// The settings page reads the recent list from the publication cache,
    /// so a newly seen skill has to make it through the whole chain on its
    /// own: projection set dirty bit, publication, cache.
    #[test]
    fn a_newly_seen_skill_reaches_the_published_recent_list_by_itself() {
        use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
        use crate::live::history_writer::HistoryWriterHandle;
        use crate::live::ipc::publisher::LivePublicationCache;
        use crate::live::ipc::topic::TopicMask;
        use crate::live::projection_set::ProjectionSet;
        use crate::live::runtime::scheduler::DeadlineScheduler;
        use crate::live::runtime::segment::SegmentState;
        use std::sync::Arc;

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let mut scheduler = DeadlineScheduler::new();
        let cache = LivePublicationCache::new();
        let idle = SegmentState::default();
        let mut entities = scene();
        let monitor = MonitorRuntimeSnapshot {
            monster_roster: config(true, &[WATCHED]),
            ..MonitorRuntimeSnapshot::default()
        };
        projections
            .apply_config(
                Arc::new(monitor),
                &entities,
                0,
                MonoTimeMs(0),
                &mut scheduler,
            )
            .unwrap();

        let mut feed = |entities: &mut EntityContext, observations| {
            let envelopes = entities.apply_batch(ProtocolBatch {
                meta: meta(),
                observations,
            });
            for envelope in &envelopes {
                projections
                    .apply(envelope, entities, &mut scheduler)
                    .unwrap();
            }
            cache.publish(projections.take_publications(
                entities,
                &idle,
                TopicMask::MONSTER_ROSTER,
            ));
        };
        feed(&mut entities, vec![hate(MONSTER, &[local()])]);
        assert!(
            cache.current_monster_roster_recent()[0]
                .skill_ids
                .is_empty()
        );

        // Only the cast, nothing else about the roster changes.
        feed(&mut entities, cast(MONSTER, OTHER_SKILL, 51));
        assert_eq!(
            cache.current_monster_roster_recent()[0].skill_ids,
            vec![OTHER_SKILL]
        );

        drop(projections);
        join.join().expect("history writer stops");
    }

    /// A roster voice rule keeps the roster tracked behind a hidden panel:
    /// a member's cast is announced, and nothing is published.
    #[test]
    fn a_hidden_roster_still_announces_member_casts() {
        use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
        use crate::live::history_writer::HistoryWriterHandle;
        use crate::live::ipc::topic::TopicMask;
        use crate::live::projection_set::ProjectionSet;
        use crate::live::runtime::scheduler::DeadlineScheduler;
        use crate::live::runtime::segment::SegmentState;
        use crate::voice::models::{
            VoiceEvent, VoiceRule, VoiceRuntimeSnapshot, VoiceSubject, VoiceTrigger,
        };
        use std::sync::Arc;

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let mut scheduler = DeadlineScheduler::new();
        let idle = SegmentState::default();
        let mut entities = scene();
        let monitor = MonitorRuntimeSnapshot {
            monster_roster: config(false, &[WATCHED]),
            ..MonitorRuntimeSnapshot::default()
        };
        projections
            .apply_config(
                Arc::new(monitor),
                &entities,
                0,
                MonoTimeMs(0),
                &mut scheduler,
            )
            .unwrap();
        projections.apply_voice_config(
            &VoiceRuntimeSnapshot {
                enabled: true,
                volume: 1.0,
                queue_policy: Default::default(),
                rules: vec![VoiceRule {
                    id: "roster".to_owned(),
                    enabled: true,
                    trigger: VoiceTrigger::new(
                        VoiceSubject::RosterSkill { skill_id: WATCHED },
                        VoiceEvent::Started,
                    ),
                    phrase_id: "phrase".to_owned(),
                    priority: 0,
                    cooldown_ms: 0,
                    phrase_id_by_tier: None,
                }],
            },
            &entities,
            0,
            MonoTimeMs(0),
            &mut scheduler,
        );
        // Drop whatever the configuration itself marked dirty.
        let _ = projections.take_publications(&entities, &idle, TopicMask::MONSTER_ROSTER);

        let mut feed = |entities: &mut EntityContext, observations| {
            let envelopes = entities.apply_batch(ProtocolBatch {
                meta: meta(),
                observations,
            });
            for envelope in &envelopes {
                projections
                    .apply(envelope, entities, &mut scheduler)
                    .unwrap();
            }
        };
        feed(&mut entities, vec![hate(MONSTER, &[local()])]);
        feed(&mut entities, cast(MONSTER, WATCHED, 61));

        let cues = projections.take_voice_cues();
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].phrase_id, "phrase");
        assert!(
            projections
                .take_publications(&entities, &idle, TopicMask::MONSTER_ROSTER)
                .is_empty()
        );

        drop(projections);
        join.join().expect("history writer stops");
    }

    #[test]
    fn unwatching_a_skill_drops_its_casts() {
        let mut entities = scene();
        let mut roster = watching(&entities, &[WATCHED]);
        step(&mut entities, &mut roster, vec![hate(MONSTER, &[local()])]);
        step(&mut entities, &mut roster, cast(MONSTER, WATCHED, 41));

        assert!(roster.apply_config(&config(true, &[OTHER_SKILL]), &entities, 0));
        let monster = roster_monster(&mut roster, &entities, MONSTER);
        assert!(monster.skill_casts.is_empty());
        assert_eq!(monster.current_cast, None);
        assert!(!roster.apply_config(&config(true, &[OTHER_SKILL]), &entities, 0));
    }
}
