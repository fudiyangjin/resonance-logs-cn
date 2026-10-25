//! Incremental minimap projection. Publishing never reads EntityContext.

pub mod scene;
mod scenes;

use std::collections::{BTreeMap, HashMap, HashSet};

use self::scene::{MinimapSceneConfig, scene_config};
use crate::live::ipc::models::{
    MinimapBuffFact, MinimapEntity, MinimapEntityKind, MinimapEntityType, MinimapMarker,
    MinimapSkillCast, MinimapSnapshot, MinimapUpdatePayload,
};
use crate::live::protocol::MARKER_SKILL_ID_BASE;
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::events::{
    AttributeValue, BuffTransition, DomainEnvelope, DomainEvent, EntityKind, EntityRef, EntityUuid,
    SceneMarkSnapshot, SkillPhase,
};

#[derive(Debug, Clone)]
struct MinimapEntityState {
    reference: EntityRef,
    entity_type: MinimapEntityType,
    kind: MinimapEntityKind,
    position: Option<(f32, f32, f32)>,
    name: Option<String>,
    monster_id: Option<i32>,
    facing: Option<f32>,
    current_hp: Option<i64>,
    max_hp: Option<i64>,
    target_entity: Option<EntityUuid>,
    is_dead: bool,
    owner: Option<EntityUuid>,
    is_boss: bool,
}

impl MinimapEntityState {
    fn new(reference: EntityRef, kind: EntityKind) -> Self {
        Self {
            reference,
            entity_type: entity_type(kind),
            kind: display_kind(kind, false, false, false),
            position: None,
            name: None,
            monster_id: None,
            facing: None,
            current_hp: None,
            max_hp: None,
            target_entity: None,
            is_dead: false,
            owner: None,
            is_boss: false,
        }
    }
}

#[derive(Debug, PartialEq)]
enum MarkerState {
    Legacy(BTreeMap<i32, (EntityRef, MinimapMarker)>),
    Synced(SceneMarkSnapshot),
}

impl Default for MarkerState {
    fn default() -> Self {
        Self::Legacy(BTreeMap::new())
    }
}

impl MarkerState {
    fn forget_entity(&mut self, entity: EntityRef) -> bool {
        let Self::Legacy(markers) = self else {
            return false;
        };
        let before = markers.len();
        markers.retain(|_, (owner, _)| *owner != entity);
        before != markers.len()
    }

    fn team_mark(&self, uuid: EntityUuid) -> Option<u8> {
        match self {
            Self::Legacy(_) => None,
            Self::Synced(snapshot) => snapshot.teammates.get(&uuid).copied(),
        }
    }

    fn ground_markers(&self) -> Vec<MinimapMarker> {
        match self {
            Self::Legacy(markers) => markers.values().map(|(_, marker)| marker.clone()).collect(),
            Self::Synced(snapshot) => snapshot
                .ground
                .iter()
                .map(|(mark_type, position)| MinimapMarker {
                    marker: i32::from(*mark_type) - 1,
                    x: Some(position.x),
                    z: Some(position.z),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Default)]
pub struct MinimapProjection {
    scene_id: Option<i32>,
    local_player: Option<EntityRef>,
    team_members: HashSet<EntityUuid>,
    entities: HashMap<EntityUuid, MinimapEntityState>,
    visible_entities: HashSet<EntityUuid>,
    buffs: HashMap<(EntityUuid, i64), MinimapBuffFact>,
    markers: MarkerState,
    pending_skill_casts: Vec<MinimapSkillCast>,
}

impl MinimapProjection {
    pub fn reset_runtime(&mut self) {
        self.local_player = None;
        self.entities.clear();
        self.visible_entities.clear();
        self.buffs.clear();
        self.markers = MarkerState::default();
        self.pending_skill_casts.clear();
    }

    /// Applies one event and returns whether the next published payload could
    /// change (snapshot contents or pending skill casts).
    pub fn apply(&mut self, envelope: &DomainEnvelope) -> bool {
        match &envelope.event {
            DomainEvent::EntityAppeared { entity, kind } => {
                let inserted = !self.entities.contains_key(&entity.uuid);
                self.entities
                    .entry(entity.uuid)
                    .or_insert_with(|| MinimapEntityState::new(*entity, *kind));
                let kind_changed = self.refresh_kind(entity.uuid);
                let visibility_changed = self.refresh_visibility(entity.uuid);
                inserted || kind_changed || visibility_changed
            }
            DomainEvent::EntityDisappeared { entity } => {
                let state_taken = self.entities.remove(&entity.uuid).is_some();
                let visible_taken = self.visible_entities.remove(&entity.uuid);
                let buffs_before = self.buffs.len();
                self.buffs.retain(|(target, _), _| *target != entity.uuid);
                let markers_changed = self.markers.forget_entity(*entity);
                let entity_uuid = entity.uuid.0.to_string();
                let casts_before = self.pending_skill_casts.len();
                self.pending_skill_casts
                    .retain(|cast| cast.entity_uuid != entity_uuid);
                let mut targets_cleared = false;
                for (uuid, state) in &mut self.entities {
                    if state.target_entity == Some(entity.uuid) {
                        state.target_entity = None;
                        targets_cleared |= self.visible_entities.contains(uuid);
                    }
                }
                state_taken
                    || visible_taken
                    || self.buffs.len() != buffs_before
                    || markers_changed
                    || self.pending_skill_casts.len() != casts_before
                    || targets_cleared
            }
            DomainEvent::IdentityChanged {
                entity, current, ..
            } => {
                let state = self
                    .entities
                    .entry(entity.uuid)
                    .or_insert_with(|| MinimapEntityState::new(*entity, current.kind));
                let changed = state.reference != *entity
                    || state.entity_type != entity_type(current.kind)
                    || state.name != current.name
                    || state.monster_id != current.monster_id
                    || state.owner != current.owner_uuid
                    || state.is_boss != current.is_boss;
                state.reference = *entity;
                state.entity_type = entity_type(current.kind);
                state.name.clone_from(&current.name);
                state.monster_id = current.monster_id;
                state.owner = current.owner_uuid;
                state.is_boss = current.is_boss;
                let kind_changed = self.refresh_kind(entity.uuid);
                let visibility_changed = self.refresh_visibility(entity.uuid);
                changed || kind_changed || visibility_changed
            }
            DomainEvent::PositionChanged {
                entity, current, ..
            } => {
                let state = self
                    .entities
                    .entry(entity.uuid)
                    .or_insert_with(|| MinimapEntityState::new(*entity, EntityKind::Unknown));
                let next = (current.x, current.y, current.z);
                let changed = state.position != Some(next);
                state.position = Some(next);
                changed
            }
            DomainEvent::AttributeChanged {
                entity,
                attr_id,
                current: AttributeValue::Int(value),
                ..
            } if matches!(
                *attr_id,
                attr_type::ATTR_FACING
                    | attr_type::ATTR_CURRENT_HP
                    | attr_type::ATTR_MAX_HP
                    | attr_type::ATTR_TARGET_ID
            ) =>
            {
                let state = self
                    .entities
                    .entry(entity.uuid)
                    .or_insert_with(|| MinimapEntityState::new(*entity, EntityKind::Unknown));
                let changed = match *attr_id {
                    attr_type::ATTR_FACING => {
                        let next = *value as f32 / 100.0;
                        let changed = state.facing != Some(next);
                        state.facing = Some(next);
                        changed
                    }
                    attr_type::ATTR_CURRENT_HP => {
                        let changed = state.current_hp != Some(*value);
                        state.current_hp = Some(*value);
                        changed && state.monster_id.is_some()
                    }
                    attr_type::ATTR_MAX_HP => {
                        let changed = state.max_hp != Some(*value);
                        state.max_hp = Some(*value);
                        changed && state.monster_id.is_some()
                    }
                    attr_type::ATTR_TARGET_ID => {
                        let next = (*value > 0).then_some(EntityUuid(*value));
                        let changed = state.target_entity != next;
                        state.target_entity = next;
                        changed
                    }
                    _ => false,
                };
                changed && self.visible_entities.contains(&entity.uuid)
            }
            DomainEvent::DeathOccurred { victim, .. } => {
                if let Some(state) = self.entities.get_mut(&victim.uuid)
                    && !state.is_dead
                {
                    state.is_dead = true;
                    return true;
                }
                false
            }
            DomainEvent::Revived { entity } => {
                if let Some(state) = self.entities.get_mut(&entity.uuid)
                    && state.is_dead
                {
                    state.is_dead = false;
                    return true;
                }
                false
            }
            DomainEvent::LocalPlayerChanged { previous, current } => {
                let mut changed = self.local_player != *current;
                self.local_player = *current;
                if let Some(previous) = previous {
                    changed |= self.refresh_kind(previous.uuid);
                    changed |= self.refresh_visibility(previous.uuid);
                }
                if let Some(current) = current {
                    changed |= self.refresh_kind(current.uuid);
                    changed |= self.refresh_visibility(current.uuid);
                }
                changed
            }
            DomainEvent::TeamMembershipChanged { entity, is_member } => {
                let membership_changed = if *is_member {
                    self.team_members.insert(entity.uuid)
                } else {
                    self.team_members.remove(&entity.uuid)
                };
                let kind_changed = self.refresh_kind(entity.uuid);
                let visibility_changed = self.refresh_visibility(entity.uuid);
                membership_changed || kind_changed || visibility_changed
            }
            DomainEvent::BuffChanged(event) => {
                let key = (event.state.target.uuid, event.state.instance_id);
                if event.transition == BuffTransition::Removed {
                    self.buffs.remove(&key).is_some()
                } else if self
                    .scene_id
                    .and_then(scene_config)
                    .is_some_and(|config| config.mechanic_buff_ids.contains(&event.state.base_id))
                {
                    let next = MinimapBuffFact {
                        target_entity_uuid: event.state.target.uuid.0.to_string(),
                        buff_uuid: i32::try_from(event.state.instance_id).unwrap_or_default(),
                        base_id: event.state.base_id,
                        layer: event.state.layer,
                        create_time_ms: event.state.started_wall_ms.unwrap_or_default(),
                        duration_ms: event
                            .state
                            .duration_ms
                            .unwrap_or_default()
                            .min(i32::MAX as u64) as i32,
                        fire_uuid: event.state.source.map(|source| source.uuid.0.to_string()),
                        source_config_id: event.state.source_config_id,
                        effect_ids: event.state.effect_ids.to_vec(),
                    };
                    self.buffs.insert(key, next.clone()) != Some(next)
                } else {
                    false
                }
            }
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase,
                ..
            } if matches!(phase, SkillPhase::CastStarted | SkillPhase::Observed) => {
                if !self.visible_entities.contains(&caster.uuid) {
                    return false;
                }
                let state = self.entities.get(&caster.uuid);
                let (x, z) = state
                    .and_then(|state| state.position)
                    .map_or((None, None), |(x, _, z)| (Some(x), Some(z)));
                self.pending_skill_casts.push(MinimapSkillCast {
                    entity_uuid: caster.uuid.0.to_string(),
                    skill_id: *skill_id,
                    time_ms: envelope.occurred_at_ms,
                    x,
                    z,
                    facing: state.and_then(|state| state.facing),
                });
                true
            }
            DomainEvent::PassiveSkillObserved {
                entity,
                passive_instance_id,
                skill_id,
                target_position,
                ended,
                ..
            } => {
                let MarkerState::Legacy(markers) = &mut self.markers else {
                    return false;
                };
                if *ended {
                    markers.remove(passive_instance_id).is_some()
                } else if let Some(marker) = marker_number(*skill_id) {
                    let next = (
                        *entity,
                        MinimapMarker {
                            marker,
                            x: target_position.map(|position| position.x),
                            z: target_position.map(|position| position.z),
                        },
                    );
                    markers.insert(*passive_instance_id, next.clone()) != Some(next)
                } else {
                    false
                }
            }
            DomainEvent::SceneMarkSnapshot(snapshot) => {
                if matches!(&self.markers, MarkerState::Synced(current) if current == snapshot) {
                    return false;
                }
                self.markers = MarkerState::Synced(snapshot.clone());
                true
            }
            DomainEvent::SceneChanged { scene_id, .. } => {
                self.scene_id = Some(*scene_id);
                self.entities.clear();
                self.visible_entities.clear();
                self.buffs.clear();
                self.markers = MarkerState::default();
                self.pending_skill_casts.clear();
                true
            }
            _ => false,
        }
    }

    pub fn take_payload(&mut self) -> MinimapUpdatePayload {
        let snapshot = self.scene_id.and_then(|scene_id| {
            scene_config(scene_id).map(|_| {
                let mut entities = self
                    .visible_entities
                    .iter()
                    .filter_map(|uuid| {
                        let state = self.entities.get(uuid)?;
                        let (x, y, z) = state.position?;
                        Some(MinimapEntity {
                            entity_uuid: state.reference.uuid.0.to_string(),
                            entity_type: state.entity_type,
                            kind: state.kind,
                            team_mark: self.markers.team_mark(state.reference.uuid),
                            x,
                            y,
                            z,
                            name: state.name.clone(),
                            monster_id: state.monster_id,
                            facing: state.facing,
                            current_hp: state.monster_id.and(state.current_hp),
                            max_hp: state.monster_id.and(state.max_hp),
                            target_entity_uuid: state
                                .target_entity
                                .map(|target| target.0.to_string()),
                            is_dead: state.is_dead,
                            top_summoner_id: state.owner.map(|owner| owner.0.to_string()),
                        })
                    })
                    .collect::<Vec<_>>();
                entities.sort_unstable_by(|left, right| left.entity_uuid.cmp(&right.entity_uuid));
                MinimapSnapshot {
                    scene_id,
                    local_player_uuid: self
                        .local_player
                        .map(|entity| entity.uuid.0.to_string())
                        .unwrap_or_default(),
                    entities,
                    buffs: self.buffs.values().cloned().collect(),
                    markers: self.markers.ground_markers(),
                }
            })
        });
        if snapshot.is_none() {
            self.pending_skill_casts.clear();
        }
        MinimapUpdatePayload {
            snapshot,
            skill_casts: std::mem::take(&mut self.pending_skill_casts),
        }
    }

    /// Returns whether the display kind changed.
    fn refresh_kind(&mut self, uuid: EntityUuid) -> bool {
        let Some(state) = self.entities.get_mut(&uuid) else {
            return false;
        };
        let domain_kind = match state.entity_type {
            MinimapEntityType::Monster => EntityKind::Monster,
            MinimapEntityType::Dummy => EntityKind::Dummy,
            MinimapEntityType::Char => EntityKind::Character,
            MinimapEntityType::Bullet | MinimapEntityType::ClientBullet => EntityKind::Bullet,
            MinimapEntityType::SceneObject => EntityKind::SceneObject,
            _ => EntityKind::Unknown,
        };
        let next = display_kind(
            domain_kind,
            self.local_player.is_some_and(|local| local.uuid == uuid),
            self.team_members.contains(&uuid),
            state.is_boss,
        );
        let changed = state.kind != next;
        state.kind = next;
        changed
    }

    /// Returns whether the visible set changed.
    fn refresh_visibility(&mut self, uuid: EntityUuid) -> bool {
        let visible = self
            .scene_id
            .and_then(scene_config)
            .is_some_and(|config| self.is_relevant(uuid, config));
        if visible {
            self.visible_entities.insert(uuid)
        } else {
            self.visible_entities.remove(&uuid)
        }
    }

    fn is_relevant(&self, uuid: EntityUuid, config: &MinimapSceneConfig) -> bool {
        self.local_player.is_some_and(|local| local.uuid == uuid)
            || self.team_members.contains(&uuid)
            || self
                .entities
                .get(&uuid)
                .and_then(|state| state.monster_id)
                .is_some_and(|monster_id| config.relevant_monster_ids.contains(&monster_id))
    }
}

fn entity_type(kind: EntityKind) -> MinimapEntityType {
    match kind {
        EntityKind::Character => MinimapEntityType::Char,
        EntityKind::Monster => MinimapEntityType::Monster,
        EntityKind::Dummy => MinimapEntityType::Dummy,
        EntityKind::Bullet => MinimapEntityType::Bullet,
        EntityKind::SceneObject => MinimapEntityType::SceneObject,
        EntityKind::Unknown | EntityKind::Other(_) => MinimapEntityType::Other,
    }
}

fn display_kind(
    kind: EntityKind,
    is_local: bool,
    is_team: bool,
    is_boss: bool,
) -> MinimapEntityKind {
    if is_local {
        MinimapEntityKind::Local
    } else if is_team {
        MinimapEntityKind::Teammate
    } else if is_boss {
        MinimapEntityKind::Boss
    } else {
        match kind {
            EntityKind::Monster => MinimapEntityKind::Monster,
            EntityKind::Dummy => MinimapEntityKind::Dummy,
            _ => MinimapEntityKind::Other,
        }
    }
}

/// Display number (1..=6) for a validated marker skill id; `None` for
/// out-of-range ids so a protocol drift never reaches the overlay.
fn marker_number(skill_id: i32) -> Option<i32> {
    let number = skill_id - MARKER_SKILL_ID_BASE;
    (1..=6).contains(&number).then_some(number)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::live::runtime::events::{
        BatchId, BuffEvent, BuffState, BuffWireKind, DeathBuffCheckpoint, EntityIdentity,
        EntityRoles, EventMeta, Position, SegmentId,
    };

    const LOCAL: EntityRef = entity(1);
    const TEAMMATE: EntityRef = entity(2);
    const CONFIGURED_MONSTER: EntityRef = entity(3);
    const UNRELATED_MONSTER: EntityRef = entity(4);

    const fn entity(uuid: i64) -> EntityRef {
        EntityRef {
            uuid: EntityUuid(uuid),
            generation: 1,
        }
    }

    fn envelope(sequence: u64, occurred_at_ms: i64, event: DomainEvent) -> DomainEnvelope {
        let batch_id = BatchId(sequence);
        DomainEnvelope {
            sequence,
            batch_id,
            occurred_at_ms,
            meta: EventMeta {
                batch_id,
                capture_sequence: sequence,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: occurred_at_ms,
                captured_mono_ns: u64::try_from(occurred_at_ms).unwrap_or_default() * 1_000_000,
                source_time_ms: None,
            },
            event_index: 0,
            segment_id: Some(SegmentId(1)),
            event,
        }
    }

    fn scene(sequence: u64, scene_id: i32) -> DomainEnvelope {
        envelope(
            sequence,
            10_000 + sequence as i64,
            DomainEvent::SceneChanged {
                previous_scene_id: None,
                scene_id,
                difficulty: None,
            },
        )
    }

    fn appeared(sequence: u64, entity: EntityRef, kind: EntityKind) -> DomainEnvelope {
        envelope(
            sequence,
            10_000 + sequence as i64,
            DomainEvent::EntityAppeared { entity, kind },
        )
    }

    fn identity(
        sequence: u64,
        entity: EntityRef,
        kind: EntityKind,
        monster_id: Option<i32>,
        is_boss: bool,
    ) -> DomainEnvelope {
        envelope(
            sequence,
            10_000 + sequence as i64,
            DomainEvent::IdentityChanged {
                entity,
                previous: EntityIdentity::default(),
                current: EntityIdentity {
                    kind,
                    name: Some(format!("entity-{}", entity.uuid.0)),
                    monster_id,
                    is_boss,
                    ..EntityIdentity::default()
                },
            },
        )
    }

    fn position(sequence: u64, entity: EntityRef, x: f32, z: f32) -> DomainEnvelope {
        envelope(
            sequence,
            10_000 + sequence as i64,
            DomainEvent::PositionChanged {
                entity,
                attr_id: 0,
                previous: None,
                current: Position { x, y: 0.0, z },
                is_baseline: false,
            },
        )
    }

    fn integer_attribute(
        sequence: u64,
        entity: EntityRef,
        attr_id: i32,
        value: i64,
    ) -> DomainEnvelope {
        envelope(
            sequence,
            10_000 + sequence as i64,
            DomainEvent::AttributeChanged {
                entity,
                attr_id,
                previous: None,
                current: AttributeValue::Int(value),
                is_baseline: false,
            },
        )
    }

    fn buff(
        sequence: u64,
        transition: BuffTransition,
        instance_id: i64,
        base_id: i32,
    ) -> DomainEnvelope {
        envelope(
            sequence,
            10_000 + sequence as i64,
            DomainEvent::BuffChanged(BuffEvent {
                transition,
                wire_kind: match transition {
                    BuffTransition::Baseline => BuffWireKind::Snapshot,
                    BuffTransition::Applied | BuffTransition::Refreshed => BuffWireKind::Add,
                    BuffTransition::LayerChanged => BuffWireKind::Change,
                    BuffTransition::Removed => BuffWireKind::Remove,
                },
                duration_updated: false,
                previous_layer: None,
                state: BuffState {
                    target: LOCAL,
                    instance_id,
                    base_id,
                    layer: 2,
                    source: Some(TEAMMATE),
                    resolved_owner: Some(TEAMMATE),
                    source_config_id: Some(88),
                    duration_ms: Some(5_000),
                    started_wall_ms: Some(10_000),
                    expires_wall_ms: Some(15_000),
                    started_mono_ms: None,
                    expires_mono_ms: None,
                    effect_ids: Arc::from([7, 8]),
                },
                target_roles: EntityRoles {
                    is_local_player: true,
                    is_team_member: true,
                    is_current_target: false,
                },
            }),
        )
    }

    fn add_positioned_entity(
        projection: &mut MinimapProjection,
        sequence: u64,
        entity: EntityRef,
        kind: EntityKind,
        monster_id: Option<i32>,
        is_boss: bool,
    ) {
        projection.apply(&appeared(sequence, entity, kind));
        projection.apply(&identity(sequence + 1, entity, kind, monster_id, is_boss));
        projection.apply(&position(
            sequence + 2,
            entity,
            entity.uuid.0 as f32,
            entity.uuid.0 as f32 * 10.0,
        ));
    }

    #[test]
    fn publishes_snapshots_only_for_registered_scenes() {
        let mut projection = MinimapProjection::default();

        projection.apply(&scene(1, 999_999));
        assert!(projection.take_payload().snapshot.is_none());

        projection.apply(&scene(2, 6563));
        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        assert_eq!(snapshot.scene_id, 6563);
    }

    #[test]
    fn exposes_only_local_teammate_and_configured_monster_entities() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));

        add_positioned_entity(
            &mut projection,
            10,
            LOCAL,
            EntityKind::Character,
            None,
            false,
        );
        add_positioned_entity(
            &mut projection,
            20,
            TEAMMATE,
            EntityKind::Character,
            None,
            false,
        );
        add_positioned_entity(
            &mut projection,
            30,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(4601),
            true,
        );
        add_positioned_entity(
            &mut projection,
            40,
            UNRELATED_MONSTER,
            EntityKind::Monster,
            Some(999_999),
            false,
        );
        projection.apply(&envelope(
            50,
            10_050,
            DomainEvent::LocalPlayerChanged {
                previous: None,
                current: Some(LOCAL),
            },
        ));
        projection.apply(&envelope(
            51,
            10_051,
            DomainEvent::TeamMembershipChanged {
                entity: TEAMMATE,
                is_member: true,
            },
        ));

        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        let visible = snapshot
            .entities
            .iter()
            .map(|entity| (entity.entity_uuid.as_str(), entity.kind))
            .collect::<Vec<_>>();

        assert_eq!(snapshot.local_player_uuid, "1");
        assert_eq!(
            visible,
            vec![
                ("1", MinimapEntityKind::Local),
                ("2", MinimapEntityKind::Teammate),
                ("3", MinimapEntityKind::Boss),
            ]
        );
    }

    #[test]
    fn retains_only_configured_mechanic_buffs_and_honors_removal() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        projection.apply(&buff(2, BuffTransition::Applied, 101, 883707));
        projection.apply(&buff(3, BuffTransition::Applied, 102, 123_456));

        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        assert_eq!(snapshot.buffs.len(), 1);
        assert_eq!(snapshot.buffs[0].buff_uuid, 101);
        assert_eq!(snapshot.buffs[0].base_id, 883707);
        assert_eq!(snapshot.buffs[0].effect_ids, [7, 8]);

        projection.apply(&buff(4, BuffTransition::Removed, 101, 883707));
        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        assert!(snapshot.buffs.is_empty());
    }

    #[test]
    fn entity_disappearance_clears_all_entity_minimap_state() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        projection.apply(&appeared(2, LOCAL, EntityKind::Character));
        projection.apply(&buff(3, BuffTransition::Applied, 101, 883707));
        projection.apply(&envelope(
            4,
            10_004,
            DomainEvent::LocalPlayerChanged {
                previous: None,
                current: Some(LOCAL),
            },
        ));
        projection.apply(&envelope(
            5,
            10_005,
            DomainEvent::PassiveSkillObserved {
                entity: LOCAL,
                passive_instance_id: 55,
                skill_id: 1103,
                target_position: None,
                ended: false,
            },
        ));
        projection.apply(&envelope(
            6,
            10_006,
            DomainEvent::SkillLifecycleChanged {
                caster: LOCAL,
                skill_id: 88,
                phase: SkillPhase::CastStarted,
                target: None,
            },
        ));
        assert!(projection.entities.contains_key(&LOCAL.uuid));
        assert_eq!(projection.buffs.len(), 1);
        assert_eq!(projection.markers.ground_markers().len(), 1);
        assert_eq!(projection.pending_skill_casts.len(), 1);

        projection.apply(&envelope(
            7,
            10_007,
            DomainEvent::EntityDisappeared { entity: LOCAL },
        ));

        assert!(!projection.entities.contains_key(&LOCAL.uuid));
        assert!(!projection.visible_entities.contains(&LOCAL.uuid));
        assert!(projection.buffs.is_empty());
        assert!(projection.markers.ground_markers().is_empty());
        assert!(projection.pending_skill_casts.is_empty());
        let payload = projection.take_payload();
        let snapshot = payload
            .snapshot
            .expect("registered scene should publish a snapshot");
        assert!(snapshot.buffs.is_empty());
        assert!(snapshot.markers.is_empty());
        assert!(payload.skill_casts.is_empty());
    }

    #[test]
    fn tracks_entity_hp_and_target_attributes_and_clears_disappeared_targets() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 13032));
        add_positioned_entity(
            &mut projection,
            10,
            LOCAL,
            EntityKind::Character,
            None,
            false,
        );
        add_positioned_entity(
            &mut projection,
            20,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(103404),
            false,
        );
        projection.apply(&envelope(
            30,
            10_030,
            DomainEvent::LocalPlayerChanged {
                previous: None,
                current: Some(LOCAL),
            },
        ));
        projection.apply(&integer_attribute(
            31,
            CONFIGURED_MONSTER,
            attr_type::ATTR_CURRENT_HP,
            42,
        ));
        projection.apply(&integer_attribute(
            32,
            CONFIGURED_MONSTER,
            attr_type::ATTR_MAX_HP,
            100,
        ));
        projection.apply(&integer_attribute(
            33,
            CONFIGURED_MONSTER,
            attr_type::ATTR_TARGET_ID,
            1,
        ));

        let entity = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot")
            .entities
            .into_iter()
            .find(|entity| entity.entity_uuid == "3")
            .expect("configured entity should be visible");
        assert_eq!(entity.current_hp, Some(42));
        assert_eq!(entity.max_hp, Some(100));
        assert_eq!(entity.target_entity_uuid.as_deref(), Some("1"));

        projection.apply(&integer_attribute(
            34,
            CONFIGURED_MONSTER,
            attr_type::ATTR_TARGET_ID,
            0,
        ));
        let entity = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot")
            .entities
            .into_iter()
            .find(|entity| entity.entity_uuid == "3")
            .expect("configured entity should be visible");
        assert_eq!(entity.target_entity_uuid, None);

        projection.apply(&envelope(
            35,
            10_035,
            DomainEvent::EntityDisappeared { entity: LOCAL },
        ));
        assert!(
            projection
                .take_payload()
                .snapshot
                .expect("registered scene should publish a snapshot")
                .entities
                .iter()
                .all(|entity| entity.target_entity_uuid.is_none())
        );
    }

    #[test]
    fn hp_changes_only_report_for_visible_monsters() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 13032));
        add_positioned_entity(
            &mut projection,
            10,
            LOCAL,
            EntityKind::Character,
            None,
            false,
        );
        projection.apply(&envelope(
            20,
            10_020,
            DomainEvent::LocalPlayerChanged {
                previous: None,
                current: Some(LOCAL),
            },
        ));
        add_positioned_entity(
            &mut projection,
            30,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(103404),
            false,
        );
        add_positioned_entity(
            &mut projection,
            40,
            UNRELATED_MONSTER,
            EntityKind::Monster,
            Some(1),
            false,
        );
        projection.take_payload();

        assert!(!projection.apply(&integer_attribute(
            50,
            LOCAL,
            attr_type::ATTR_CURRENT_HP,
            10,
        )));
        assert!(!projection.apply(&integer_attribute(
            51,
            UNRELATED_MONSTER,
            attr_type::ATTR_CURRENT_HP,
            10,
        )));
        assert!(projection.apply(&integer_attribute(
            52,
            CONFIGURED_MONSTER,
            attr_type::ATTR_CURRENT_HP,
            10,
        )));

        let local = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot")
            .entities
            .into_iter()
            .find(|entity| entity.entity_uuid == "1")
            .expect("local player should be visible");
        assert_eq!(local.current_hp, None);
    }

    #[test]
    fn scene_change_clears_entities_buffs_markers_and_pending_casts() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        add_positioned_entity(
            &mut projection,
            10,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(4601),
            false,
        );
        projection.apply(&buff(20, BuffTransition::Applied, 101, 883707));
        projection.apply(&envelope(
            21,
            10_021,
            DomainEvent::PassiveSkillObserved {
                entity: LOCAL,
                passive_instance_id: 55,
                skill_id: 1103,
                target_position: Some(Position {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                }),
                ended: false,
            },
        ));
        projection.apply(&envelope(
            22,
            10_022,
            DomainEvent::SkillLifecycleChanged {
                caster: CONFIGURED_MONSTER,
                skill_id: 9001,
                phase: SkillPhase::CastStarted,
                target: Some(LOCAL),
            },
        ));

        projection.apply(&scene(30, 6513));

        let payload = projection.take_payload();
        let snapshot = payload
            .snapshot
            .expect("new registered scene should publish an empty snapshot");
        assert_eq!(snapshot.scene_id, 6513);
        assert!(snapshot.entities.is_empty());
        assert!(snapshot.buffs.is_empty());
        assert!(snapshot.markers.is_empty());
        assert!(payload.skill_casts.is_empty());
    }

    #[test]
    fn marker_display_number_derives_from_skill_id() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        projection.apply(&envelope(
            2,
            10_002,
            DomainEvent::PassiveSkillObserved {
                entity: LOCAL,
                passive_instance_id: 900,
                skill_id: 1103,
                target_position: Some(Position {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                }),
                ended: false,
            },
        ));
        projection.apply(&envelope(
            3,
            10_003,
            DomainEvent::PassiveSkillObserved {
                entity: LOCAL,
                passive_instance_id: 901,
                skill_id: 1434,
                target_position: None,
                ended: false,
            },
        ));

        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        assert_eq!(snapshot.markers.len(), 1);
        assert_eq!(snapshot.markers[0].marker, 3);
    }

    fn legacy_mark(ended: bool) -> DomainEnvelope {
        envelope(
            1,
            10_001,
            DomainEvent::PassiveSkillObserved {
                entity: LOCAL,
                passive_instance_id: 900,
                skill_id: 1103,
                target_position: Some(Position {
                    x: 1.0,
                    y: 0.0,
                    z: 2.0,
                }),
                ended,
            },
        )
    }

    fn synced_marks(mark: u8) -> DomainEnvelope {
        envelope(
            2,
            10_002,
            DomainEvent::SceneMarkSnapshot(SceneMarkSnapshot {
                ground: BTreeMap::from([
                    (
                        1,
                        Position {
                            x: 0.0,
                            y: 0.0,
                            z: 0.0,
                        },
                    ),
                    (
                        10,
                        Position {
                            x: 2.0,
                            y: 0.0,
                            z: 3.0,
                        },
                    ),
                ]),
                teammates: BTreeMap::from([(TEAMMATE.uuid, mark), (LOCAL.uuid, 1)]),
            }),
        )
    }

    #[test]
    fn scene_marks_take_over_atomically_and_empty_sync_never_revives_legacy_marks() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        assert!(projection.apply(&legacy_mark(false)));
        assert!(projection.apply(&legacy_mark(true)));
        assert!(
            projection
                .take_payload()
                .snapshot
                .unwrap()
                .markers
                .is_empty()
        );
        projection.apply(&legacy_mark(false));
        assert!(projection.apply(&synced_marks(2)));
        assert!(!projection.apply(&synced_marks(2)));
        assert!(!projection.apply(&legacy_mark(true)));
        projection.apply(&envelope(
            3,
            10_003,
            DomainEvent::EntityDisappeared { entity: LOCAL },
        ));
        let snapshot = projection.take_payload().snapshot.unwrap();
        assert_eq!(
            snapshot
                .markers
                .iter()
                .map(|mark| mark.marker)
                .collect::<Vec<_>>(),
            [0, 9]
        );

        let empty = envelope(
            4,
            10_004,
            DomainEvent::SceneMarkSnapshot(SceneMarkSnapshot::default()),
        );
        assert!(projection.apply(&empty));
        assert!(!projection.apply(&empty));
        assert!(!projection.apply(&legacy_mark(false)));
        assert!(
            projection
                .take_payload()
                .snapshot
                .unwrap()
                .markers
                .is_empty()
        );
        assert_eq!(projection.markers.team_mark(TEAMMATE.uuid), None);
    }

    #[test]
    fn scene_marks_survive_unseen_entities_and_follow_reappearance_and_movement() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        projection.apply(&synced_marks(2));
        assert!(
            projection
                .take_payload()
                .snapshot
                .unwrap()
                .entities
                .is_empty()
        );
        projection.apply(&envelope(
            3,
            10_003,
            DomainEvent::TeamMembershipChanged {
                entity: TEAMMATE,
                is_member: true,
            },
        ));
        projection.apply(&appeared(4, TEAMMATE, EntityKind::Character));
        projection.apply(&position(5, TEAMMATE, 3.0, 4.0));
        let snapshot = projection.take_payload().snapshot.unwrap();
        assert_eq!(snapshot.entities[0].team_mark, Some(2));
        assert_eq!((snapshot.entities[0].x, snapshot.entities[0].z), (3.0, 4.0));

        projection.apply(&position(6, TEAMMATE, 5.0, 6.0));
        projection.apply(&synced_marks(6));
        let snapshot = projection.take_payload().snapshot.unwrap();
        assert_eq!(snapshot.entities[0].team_mark, Some(6));
        assert_eq!((snapshot.entities[0].x, snapshot.entities[0].z), (5.0, 6.0));
        projection.apply(&envelope(
            7,
            10_007,
            DomainEvent::EntityDisappeared { entity: TEAMMATE },
        ));
        assert!(
            projection
                .take_payload()
                .snapshot
                .unwrap()
                .entities
                .is_empty()
        );
        let returned = EntityRef {
            generation: 2,
            ..TEAMMATE
        };
        projection.apply(&appeared(8, returned, EntityKind::Character));
        projection.apply(&position(9, returned, 7.0, 8.0));
        assert_eq!(
            projection.take_payload().snapshot.unwrap().entities[0].team_mark,
            Some(6)
        );
        projection.apply(&envelope(
            10,
            10_010,
            DomainEvent::SceneMarkSnapshot(SceneMarkSnapshot::default()),
        ));
        assert_eq!(
            projection.take_payload().snapshot.unwrap().entities[0].team_mark,
            None
        );
    }

    #[test]
    fn scene_marks_reset_source_on_scene_change_and_runtime_reset() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        projection.apply(&synced_marks(2));
        projection.apply(&scene(2, 6513));
        assert!(
            projection
                .take_payload()
                .snapshot
                .unwrap()
                .markers
                .is_empty()
        );
        assert_eq!(projection.markers.team_mark(TEAMMATE.uuid), None);
        assert!(projection.apply(&legacy_mark(false)));
        projection.apply(&synced_marks(2));
        projection.reset_runtime();
        assert!(
            projection
                .take_payload()
                .snapshot
                .unwrap()
                .markers
                .is_empty()
        );
        assert_eq!(projection.markers.team_mark(TEAMMATE.uuid), None);
        assert!(projection.apply(&legacy_mark(false)));
    }

    #[test]
    fn out_of_range_marker_skill_is_dropped() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        projection.apply(&envelope(
            2,
            10_002,
            DomainEvent::PassiveSkillObserved {
                entity: LOCAL,
                passive_instance_id: 900,
                skill_id: 1107,
                target_position: None,
                ended: false,
            },
        ));

        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        assert!(snapshot.markers.is_empty());
    }

    #[test]
    fn revived_entity_clears_dead_marker() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        add_positioned_entity(
            &mut projection,
            10,
            TEAMMATE,
            EntityKind::Character,
            None,
            false,
        );
        projection.apply(&envelope(
            20,
            10_020,
            DomainEvent::TeamMembershipChanged {
                entity: TEAMMATE,
                is_member: true,
            },
        ));

        projection.apply(&envelope(
            21,
            10_021,
            DomainEvent::DeathOccurred {
                victim: TEAMMATE,
                killer: None,
                skill_key: None,
                buff_checkpoint: DeathBuffCheckpoint::default(),
            },
        ));
        let is_dead = |projection: &mut MinimapProjection| {
            projection
                .take_payload()
                .snapshot
                .expect("registered scene should publish a snapshot")
                .entities
                .iter()
                .find(|entity| entity.entity_uuid == "2")
                .expect("teammate stays visible")
                .is_dead
        };
        assert!(is_dead(&mut projection));

        projection.apply(&envelope(
            22,
            10_022,
            DomainEvent::Revived { entity: TEAMMATE },
        ));
        assert!(!is_dead(&mut projection));
    }

    #[test]
    fn emits_skill_cast_nodes_once_and_only_for_visible_casters() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 6563));
        add_positioned_entity(
            &mut projection,
            10,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(4601),
            false,
        );
        add_positioned_entity(
            &mut projection,
            20,
            UNRELATED_MONSTER,
            EntityKind::Monster,
            Some(999_999),
            false,
        );
        projection.apply(&envelope(
            30,
            10_030,
            DomainEvent::AttributeChanged {
                entity: CONFIGURED_MONSTER,
                attr_id: attr_type::ATTR_FACING,
                previous: None,
                current: AttributeValue::Int(1_234),
                is_baseline: false,
            },
        ));
        projection.apply(&envelope(
            31,
            12_345,
            DomainEvent::SkillLifecycleChanged {
                caster: CONFIGURED_MONSTER,
                skill_id: 9001,
                phase: SkillPhase::CastStarted,
                target: Some(LOCAL),
            },
        ));
        projection.apply(&envelope(
            32,
            12_346,
            DomainEvent::SkillLifecycleChanged {
                caster: UNRELATED_MONSTER,
                skill_id: 9002,
                phase: SkillPhase::Observed,
                target: Some(LOCAL),
            },
        ));
        projection.apply(&envelope(
            33,
            12_347,
            DomainEvent::SkillLifecycleChanged {
                caster: CONFIGURED_MONSTER,
                skill_id: 9003,
                phase: SkillPhase::Completed,
                target: Some(LOCAL),
            },
        ));

        let payload = projection.take_payload();
        assert_eq!(payload.skill_casts.len(), 1);
        let cast = &payload.skill_casts[0];
        assert_eq!(cast.entity_uuid, "3");
        assert_eq!(cast.skill_id, 9001);
        assert_eq!(cast.time_ms, 12_345);
        assert_eq!(cast.x, Some(3.0));
        assert_eq!(cast.z, Some(30.0));
        assert_eq!(cast.facing, Some(12.34));

        assert!(projection.take_payload().skill_casts.is_empty());
    }

    #[test]
    fn sky_end_turntable_ring_publishes_facing_and_layout_buff() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 13032));
        add_positioned_entity(
            &mut projection,
            10,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(103401),
            false,
        );
        projection.apply(&integer_attribute(
            20,
            CONFIGURED_MONSTER,
            attr_type::ATTR_FACING,
            13_015,
        ));
        projection.apply(&buff(21, BuffTransition::Baseline, 301, 829502));
        projection.apply(&buff(22, BuffTransition::Applied, 302, 829509));

        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        let ring = snapshot
            .entities
            .iter()
            .find(|entity| entity.entity_uuid == "3")
            .expect("turntable ring should be visible");
        assert_eq!(ring.monster_id, Some(103401));
        assert_eq!(ring.facing, Some(130.15));
        let mut base_ids = snapshot
            .buffs
            .iter()
            .map(|buff| buff.base_id)
            .collect::<Vec<_>>();
        base_ids.sort_unstable();
        assert_eq!(base_ids, [829502, 829509]);
    }

    #[test]
    fn sky_end_lapsis_night_publishes_balls_executor_casts_and_ritual_buffs() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 13032));
        add_positioned_entity(
            &mut projection,
            10,
            CONFIGURED_MONSTER,
            EntityKind::Monster,
            Some(103602),
            false,
        );
        add_positioned_entity(
            &mut projection,
            20,
            UNRELATED_MONSTER,
            EntityKind::Monster,
            Some(103611),
            false,
        );
        projection.apply(&envelope(
            30,
            12_000,
            DomainEvent::SkillLifecycleChanged {
                caster: UNRELATED_MONSTER,
                skill_id: 10360011,
                phase: SkillPhase::Observed,
                target: None,
            },
        ));
        projection.apply(&buff(31, BuffTransition::Applied, 401, 829712));
        projection.apply(&buff(32, BuffTransition::Applied, 402, 829602));
        projection.apply(&buff(33, BuffTransition::Applied, 403, 829601));

        let payload = projection.take_payload();
        let snapshot = payload
            .snapshot
            .expect("registered scene should publish a snapshot");
        let monsters = snapshot
            .entities
            .iter()
            .filter_map(|entity| entity.monster_id)
            .collect::<Vec<_>>();
        assert_eq!(monsters, [103602, 103611]);
        let mut base_ids = snapshot
            .buffs
            .iter()
            .map(|buff| buff.base_id)
            .collect::<Vec<_>>();
        base_ids.sort_unstable();
        assert_eq!(base_ids, [829602, 829712]);
        assert_eq!(payload.skill_casts.len(), 1);
        assert_eq!(payload.skill_casts[0].skill_id, 10360011);
    }

    #[test]
    fn sky_end_raid_publishes_share_tank_swap_erosion_and_fog_ball_buffs() {
        let mut projection = MinimapProjection::default();
        projection.apply(&scene(1, 13032));
        let published = [829649, 829650, 829654, 829721, 829722, 829725];
        for (offset, base_id) in published.into_iter().enumerate() {
            let offset = offset as u64;
            projection.apply(&buff(
                10 + offset,
                BuffTransition::Applied,
                500 + offset as i64,
                base_id,
            ));
        }
        // 罪罚叠层计数 is the hidden counter behind 罪罚; it stays out.
        projection.apply(&buff(20, BuffTransition::Applied, 520, 829604));

        let snapshot = projection
            .take_payload()
            .snapshot
            .expect("registered scene should publish a snapshot");
        let mut base_ids = snapshot
            .buffs
            .iter()
            .map(|buff| buff.base_id)
            .collect::<Vec<_>>();
        base_ids.sort_unstable();
        assert_eq!(base_ids, published);
    }
}
