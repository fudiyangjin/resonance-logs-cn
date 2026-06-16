//! Converts live state into reusable minimap facts.

pub(crate) mod scene;
mod scenes;

use crate::live::commands_models::{
    MinimapBuffFact, MinimapEntity, MinimapEntityKind, MinimapEntityType, MinimapSnapshot,
};
use crate::live::entity_id::{EntityUuid, entity_uuid_string};
use crate::live::minimap::scene::{SceneConfig, scene_config_for};
use crate::live::monster_registry::{self, MonsterType};
use crate::live::opcodes_models::{AttrType, AttrValue, attr_type};
use crate::live::state::AppState;
use crate::live::team::TeamRuntimeState;
use blueprotobuf_lib::blueprotobuf::EEntityType;

#[must_use]
pub(crate) fn build_minimap_snapshot(state: &AppState) -> MinimapSnapshot {
    let scene_id = state.encounter.current_scene_id.unwrap_or_default();
    let attr_store = &state.attr_store;
    let local_uuid = state.encounter.local_player_uuid;
    let config = scene_config_for(scene_id);

    let mut entities = Vec::with_capacity(state.encounter.entity_uuid_to_entity.len());
    for (&uuid, entity) in &state.encounter.entity_uuid_to_entity {
        let Some(position) = attr_store.attr_position_by_id(uuid, attr_type::ATTR_POS) else {
            continue;
        };

        let monster_id = monster_id_of(state, uuid);
        if !is_minimap_relevant(uuid, local_uuid, &state.team, monster_id, config) {
            continue;
        }

        let entity_type = resolved_entity_type(entity.entity_type, uuid);
        let kind = classify(uuid, local_uuid, entity_type, monster_id);
        let current_skill_id = int_attr_i32(state, uuid, AttrType::SkillId);
        let top_summoner_id = state
            .attr_store
            .attr(uuid, AttrType::TopSummonerId)
            .and_then(AttrValue::as_int)
            .filter(|id| *id > 0)
            .map(entity_uuid_string);

        let name = attr_store
            .attr(uuid, AttrType::Name)
            .and_then(AttrValue::as_string)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .or_else(|| (!entity.name.is_empty()).then(|| entity.name.clone()));

        entities.push(MinimapEntity {
            entity_uuid: entity_uuid_string(uuid),
            entity_type: entity_type_fact(entity_type),
            kind,
            x: position.x,
            y: position.y,
            z: position.z,
            name,
            monster_id,
            is_dead: attr_store.is_dead(uuid),
            current_skill_id,
            top_summoner_id,
        });
    }

    MinimapSnapshot {
        scene_id,
        local_player_uuid: entity_uuid_string(local_uuid),
        entities,
        buffs: collect_mechanic_buffs(state, scene_id),
    }
}

fn resolved_entity_type(entity_type: EEntityType, uuid: EntityUuid) -> EEntityType {
    if entity_type == EEntityType::EntErrType {
        EEntityType::from(uuid)
    } else {
        entity_type
    }
}

fn monster_id_of(state: &AppState, uuid: EntityUuid) -> Option<i32> {
    state
        .attr_store
        .attr(uuid, AttrType::MonsterId)
        .and_then(AttrValue::as_int)
        .or_else(|| {
            state
                .encounter
                .entity_uuid_to_entity
                .get(&uuid)
                .and_then(|entity| entity.monster_type_id.map(i64::from))
        })
        .and_then(|id| i32::try_from(id).ok())
        .filter(|id| *id > 0)
}

/// Whether an entity is worth pushing to the minimap overlay: a team member
/// (the local player is part of the team, with a single-player fallback), or an
/// entity whose template id is whitelisted for the current scene.
#[inline]
fn is_minimap_relevant(
    uuid: EntityUuid,
    local_uuid: EntityUuid,
    team: &TeamRuntimeState,
    monster_id: Option<i32>,
    config: Option<&SceneConfig>,
) -> bool {
    if uuid == local_uuid || team.members.contains(&uuid) {
        return true;
    }
    matches!(
        (monster_id, config),
        (Some(id), Some(config)) if config.relevant_monster_ids.contains(&id)
    )
}

fn int_attr_i32(state: &AppState, uuid: EntityUuid, attr_type: AttrType) -> Option<i32> {
    state
        .attr_store
        .attr(uuid, attr_type)
        .and_then(AttrValue::as_int)
        .and_then(|id| i32::try_from(id).ok())
        .filter(|id| *id > 0)
}

fn classify(
    uuid: EntityUuid,
    local_uuid: EntityUuid,
    entity_type: EEntityType,
    monster_id: Option<i32>,
) -> MinimapEntityKind {
    match entity_type {
        EEntityType::EntChar => {
            if uuid == local_uuid {
                MinimapEntityKind::Local
            } else {
                MinimapEntityKind::Teammate
            }
        }
        EEntityType::EntMonster => {
            let is_boss = monster_id
                .and_then(monster_registry::monster_type)
                .is_some_and(|kind| kind == MonsterType::Boss);
            if is_boss {
                MinimapEntityKind::Boss
            } else {
                MinimapEntityKind::Monster
            }
        }
        EEntityType::EntDummy => MinimapEntityKind::Dummy,
        _ => MinimapEntityKind::Other,
    }
}

fn entity_type_fact(entity_type: EEntityType) -> MinimapEntityType {
    match entity_type {
        EEntityType::EntMonster => MinimapEntityType::Monster,
        EEntityType::EntNpc => MinimapEntityType::Npc,
        EEntityType::EntSceneObject => MinimapEntityType::SceneObject,
        EEntityType::EntZone => MinimapEntityType::Zone,
        EEntityType::EntBullet => MinimapEntityType::Bullet,
        EEntityType::EntClientBullet => MinimapEntityType::ClientBullet,
        EEntityType::EntPet => MinimapEntityType::Pet,
        EEntityType::EntChar => MinimapEntityType::Char,
        EEntityType::EntDummy => MinimapEntityType::Dummy,
        EEntityType::EntDrop => MinimapEntityType::Drop,
        EEntityType::EntField => MinimapEntityType::Field,
        EEntityType::EntTrap => MinimapEntityType::Trap,
        EEntityType::EntCollection => MinimapEntityType::Collection,
        EEntityType::EntStaticObject => MinimapEntityType::StaticObject,
        EEntityType::EntVehicle => MinimapEntityType::Vehicle,
        EEntityType::EntToy => MinimapEntityType::Toy,
        EEntityType::EntCommunityHouse => MinimapEntityType::CommunityHouse,
        EEntityType::EntHouseItem => MinimapEntityType::HouseItem,
        EEntityType::EntErrType | EEntityType::EntCount => MinimapEntityType::Unknown,
    }
}

fn collect_mechanic_buffs(state: &AppState, scene_id: i32) -> Vec<MinimapBuffFact> {
    let Some(config) = scene_config_for(scene_id) else {
        return Vec::new();
    };

    let offset = state.server_clock_offset;
    let mut out = Vec::new();
    for (&target_uuid, monitor) in &state.entity_buff_monitors.monitors {
        for (&buff_uuid, buff) in &monitor.active_buffs {
            if !config.mechanic_buff_ids.contains(&buff.base_id) {
                continue;
            }
            out.push(MinimapBuffFact {
                target_entity_uuid: entity_uuid_string(target_uuid),
                buff_uuid,
                base_id: buff.base_id,
                layer: buff.layer,
                create_time_ms: buff.create_time.saturating_add(offset),
                duration_ms: buff.duration,
                fire_uuid: buff.fire_uuid.map(entity_uuid_string),
                source_config_id: buff.source_config_id,
            });
        }
    }
    out
}
