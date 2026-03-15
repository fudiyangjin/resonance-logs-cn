// NOTE: opcodes_process works on Encounter directly; avoid importing opcodes_models at top-level.
use crate::database::{flush_playerdata, now_ms};
use crate::live::commands_models::HateEntry;
use crate::live::damage_id;
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::opcodes_models::class::{
    ClassSpec, get_class_id_from_spec, get_class_spec_from_skill_id,
};
use crate::live::opcodes_models::{AttrType, AttrValue, Encounter, Entity, Skill, attr_type};
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::{Attr, EDamageType, EEntityType};
use bytes::Buf;
use log::{info, warn};
use std::default::Default;

/// Parses packed varints from ATTR_FIGHT_RESOURCES (50002) raw data.
/// The raw data is expected to be a protobuf message with field 1 containing packed varints.
/// Format: Tag (0x0A) | Length | Varint1 | Varint2 | ...
pub fn parse_fight_resources(raw_data: &[u8]) -> Option<Vec<i64>> {
    let mut buf = raw_data;

    // Attempt to decode the tag. Expect Field 1, WireType 2 (Length Delimited) -> (1 << 3) | 2 = 0x0A (10)
    if let Ok(tag) = prost::encoding::decode_varint(&mut buf) {
        if tag != 0x0A {
            return None;
        }
    } else {
        return None;
    }

    // Decode length of the packed field
    let len = match prost::encoding::decode_varint(&mut buf) {
        Ok(l) => l as usize,
        Err(_) => return None,
    };

    if buf.remaining() < len {
        return None;
    }

    // Take the slice containing the packed varints
    let mut packed_buf = buf.copy_to_bytes(len);
    let mut values = Vec::new();

    // Decode all varints in the slice
    while packed_buf.has_remaining() {
        match prost::encoding::decode_varint(&mut packed_buf) {
            Ok(val) => values.push(val as i64),
            Err(_) => break,
        }
    }

    Some(values)
}

#[derive(Debug, Default)]
pub struct SyncToMeDeltaResult {
    pub skill_cds: Vec<ParsedSkillCd>,
    pub buff_effect_bytes: Option<Vec<u8>>,
    pub fight_resources: Option<Vec<i64>>,
    pub local_damage_events: Vec<LocalDamageEvent>,
}

#[derive(Debug, Default, Clone)]
pub struct LocalDamageEvent {
    pub skill_key: i64,
    pub target_uid: i64,
}

#[derive(Debug, Default, Clone)]
pub struct ParsedSkillCd {
    pub skill_level_id: Option<i32>,
    pub begin_time: Option<i64>,
    pub duration: Option<i32>,
    pub skill_cd_type: Option<i32>,
    pub valid_cd_time: Option<i32>,
}

#[derive(Debug, Default)]
pub(crate) struct EnterSceneResult {
    pub scene_id: Option<i32>,
}
use std::time::{SystemTime, UNIX_EPOCH};

/// Increment global active combat time used for True DPS calculations.
/// Adds a small grace window for single hits and ignores long idle gaps.
fn update_active_damage_time(encounter: &mut Encounter, timestamp_ms: u128) {
    const INACTIVITY_CUTOFF_MS: u128 = 3_000;
    const HIT_GRACE_MS: u128 = 500;

    let additional = if let Some(last) = encounter.last_combat_timestamp_ms {
        let delta = timestamp_ms.saturating_sub(last);
        if delta <= INACTIVITY_CUTOFF_MS {
            delta
        } else {
            HIT_GRACE_MS
        }
    } else {
        HIT_GRACE_MS
    };

    encounter.active_combat_time_ms = encounter.active_combat_time_ms.saturating_add(additional);
    encounter.last_combat_timestamp_ms = Some(timestamp_ms);
}

pub fn on_server_change(encounter: &mut Encounter) {
    info!("on server change");
    // Preserve entity identity and local player info; only reset combat state
    encounter.reset_combat_state();
}

pub fn process_sync_near_entities(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    sync_near_entities: blueprotobuf::SyncNearEntities,
) -> Option<()> {
    for pkt_entity in sync_near_entities.appear {
        let target_uuid = pkt_entity.uuid?;
        let target_uid = target_uuid >> 16;
        let target_entity_type = EEntityType::from(target_uuid);

        let target_entity = encounter
            .entity_uid_to_entity
            .entry(target_uid)
            .or_default();
        target_entity.entity_type = target_entity_type;

        match target_entity_type {
            EEntityType::EntChar => {
                process_player_attrs(
                    target_entity,
                    target_uid,
                    pkt_entity.attrs?.attrs,
                    attr_store,
                );
            }
            EEntityType::EntMonster => {
                process_monster_attrs(
                    target_entity,
                    target_uid,
                    pkt_entity.attrs?.attrs,
                    attr_store,
                );
            }
            _ => {}
        }
    }

    // Track party members for wipe detection (collect data first to avoid borrow issues)
    Some(())
}

pub fn process_sync_container_data(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    sync_container_data: blueprotobuf::SyncContainerData,
) -> Option<()> {
    let v_data = sync_container_data.v_data?;
    let player_uid = v_data.char_id?;

    let target_entity = encounter
        .entity_uid_to_entity
        .entry(player_uid)
        .or_default();
    let char_base = v_data.char_base.as_ref()?;
    let name = char_base.name.clone()?;
    target_entity.name = name;
    let _ = attr_store.set_attr(
        player_uid,
        AttrType::Name,
        AttrValue::String(target_entity.name.clone()),
    );

    // Player names are automatically stored in the database via UpsertEntity tasks
    // No need to maintain a separate cache anymore
    target_entity.entity_type = EEntityType::EntChar;
    let profession_list = v_data.profession_list.as_ref()?;
    let class_id = profession_list.cur_profession_id?;
    target_entity.class_id = class_id;
    let _ = attr_store.set_attr(
        player_uid,
        AttrType::ProfessionId,
        AttrValue::Int(target_entity.class_id as i64),
    );

    target_entity.ability_score = char_base.fight_point?;
    let _ = attr_store.set_attr(
        player_uid,
        AttrType::FightPoint,
        AttrValue::Int(target_entity.ability_score as i64),
    );

    let role_level = v_data.role_level.as_ref()?;
    target_entity.level = role_level.level?;
    let _ = attr_store.set_attr(
        player_uid,
        AttrType::Level,
        AttrValue::Int(target_entity.level as i64),
    );

    // Note: HP data comes from attribute packets (ATTR_CURRENT_HP, ATTR_MAX_HP)
    // CharBaseInfo doesn't contain HP fields

    // Only store players in the database
    if matches!(target_entity.entity_type, EEntityType::EntChar) {
        // Persist detailed player data for the local player.
        let now = now_ms();

        // Serialize v_data to protobuf bytes
        let vdata_bytes = <blueprotobuf::CharSerialize as prost::Message>::encode_to_vec(&v_data);

        flush_playerdata(player_uid, now, vdata_bytes);
    }

    Some(())
}

pub fn process_sync_container_dirty_data(
    _encounter: &mut Encounter,
    _sync_container_dirty_data: blueprotobuf::SyncContainerDirtyData,
) -> Option<()> {
    // SyncContainerDirtyData.v_data is a BufferStream (raw bytes)
    // Incremental attribute updates come through process_player_attrs via AoiSyncDelta
    // which handles attr packets with proper typing
    Some(())
}

pub fn process_sync_dungeon_data(
    battle_state: &mut BattleStateMachine,
    sync_dungeon_data: blueprotobuf::SyncDungeonData,
    encounter_has_stats: bool,
) -> Option<EncounterResetReason> {
    let mut reset_reason = None;
    info!(
        target: "app::live",
        "Processing SyncDungeonData (encounter_has_stats={})",
        encounter_has_stats
    );
    if let Some(v_data) = sync_dungeon_data.v_data {
        if let Some(flow_info) = v_data.flow_info {
            if let Some(state) = flow_info.state {
                info!(target: "app::live", "SyncDungeonData flow_info.state={}", state);
            }
        }

        if let Some(target) = v_data.target {
            for (_, target_data) in target.target_data {
                let target_id = target_data.target_id.unwrap_or_default();
                let nums = target_data.nums.unwrap_or_default();
                let complete = target_data.complete.unwrap_or_default();
                info!(
                    target: "app::live",
                    "SyncDungeonData target entry target_id={} complete={} nums={}",
                    target_id,
                    complete,
                    nums
                );
                if let Some(reason) = battle_state.record_dungeon_target(target_id, nums, complete)
                {
                    reset_reason = Some(reason);
                }
            }
        }
    }

    if let Some(reason) = reset_reason {
        info!(target: "app::live", "SyncDungeonData produced reset reason: {:?}", reason);
    }
    reset_reason
}

pub fn process_sync_dungeon_dirty_data(
    battle_state: &mut BattleStateMachine,
    sync_dungeon_dirty_data: blueprotobuf::SyncDungeonDirtyData,
    encounter_has_stats: bool,
) -> Option<EncounterResetReason> {
    info!(
        target: "app::live",
        "Processing SyncDungeonDirtyData (encounter_has_stats={})",
        encounter_has_stats
    );
    let Some(v_data) = sync_dungeon_dirty_data.v_data else {
        warn!(target: "app::live", "SyncDungeonDirtyData missing v_data");
        return None;
    };
    let Some(bytes) = v_data.buffer else {
        warn!(target: "app::live", "SyncDungeonDirtyData missing buffer");
        return None;
    };
    info!(
        target: "app::live",
        "SyncDungeonDirtyData buffer length={} bytes",
        bytes.len()
    );
    let dirty_sync =
        match crate::live::dungeon_dirty_blob::parse_dirty_dungeon_data(bytes.as_slice()) {
            Ok(v) => v,
            Err(e) => {
                warn!(
                    target: "app::live",
                    "Failed to decode dirty dungeon blob from buffer: {}",
                    e
                );
                return None;
            }
        };

    let mut reset_reason = None;
    if let Some(state) = dirty_sync.flow_state {
        info!(
            target: "app::live",
            "SyncDungeonDirtyData flow_info.state={}",
            state
        );
    }

    for target_data in dirty_sync.targets {
        let target_id = target_data.target_id;
        let nums = target_data.nums;
        let complete = target_data.complete;
        info!(
            target: "app::live",
            "SyncDungeonDirtyData target entry target_id={} complete={} nums={}",
            target_id,
            complete,
            nums
        );
        if let Some(reason) = battle_state.record_dungeon_target(target_id, nums, complete) {
            reset_reason = Some(reason);
        }
    }

    if let Some(reason) = reset_reason {
        info!(
            target: "app::live",
            "SyncDungeonDirtyData produced reset reason: {:?}",
            reason
        );
    }
    reset_reason
}

pub fn process_sync_to_me_delta_info(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    monitored_panel_attr_ids: &[i32],
) -> SyncToMeDeltaResult {
    use crate::live::opcodes_models::attr_type::ATTR_FIGHT_RESOURCES;

    let mut result = SyncToMeDeltaResult::default();
    let delta_info = match sync_to_me_delta_info.delta_info {
        Some(info) => info,
        None => {
            // This is normal during gameplay - packet may not always contain delta_info
            return result;
        }
    };

    if let Some(uuid) = delta_info.uuid {
        encounter.local_player_uid = uuid >> 16; // UUID =/= uid (have to >> 16)
        attr_store.set_local_uid(encounter.local_player_uid);
    }

    result.skill_cds = delta_info
        .sync_skill_c_ds
        .into_iter()
        .map(|cd| ParsedSkillCd {
            skill_level_id: cd.skill_level_id,
            begin_time: cd.begin_time,
            duration: cd.duration,
            skill_cd_type: cd.skill_cd_type,
            valid_cd_time: cd.valid_cd_time,
        })
        .collect();

    if let Some(mut base_delta) = delta_info.base_delta {
        result.buff_effect_bytes = base_delta.buff_effect.take();
        if let Some(attrs_collection) = base_delta.attrs.as_ref() {
            result.fight_resources = attrs_collection
                .attrs
                .iter()
                .find(|a| a.id == Some(ATTR_FIGHT_RESOURCES))
                .and_then(|a| a.raw_data.as_ref())
                .and_then(|raw| parse_fight_resources(raw));
            apply_panel_attrs(attr_store, attrs_collection, monitored_panel_attr_ids);
        }
        if let Some(temp_attr_collection) = base_delta.temp_attrs.as_ref() {
            for temp_attr in &temp_attr_collection.attrs {
                let Some(id) = temp_attr.id else {
                    continue;
                };
                let value = temp_attr.value.unwrap_or(0);
                let _ = attr_store.set_temp_attr(id, value);
            }
        }
        if let Some(events) = process_aoi_sync_delta(encounter, attr_store, base_delta) {
            result.local_damage_events = events;
        }
    }

    result
}

pub(crate) fn extract_scene_id_from_attr_collection(
    attrs: &blueprotobuf::AttrCollection,
) -> Option<i32> {
    for attr in &attrs.attrs {
        if attr.id == Some(attr_type::ATTR_SCENE_BASIC_ID) {
            if let Some(raw) = &attr.raw_data {
                let mut buf = raw.as_slice();
                if let Ok(v) = prost::encoding::decode_varint(&mut buf) {
                    if v <= i32::MAX as u64 {
                        let scene_id = v as i32;
                        info!(
                            "Found scene_id {} from AttrSceneBasicId({})",
                            scene_id,
                            attr_type::ATTR_SCENE_BASIC_ID
                        );
                        return Some(scene_id);
                    }
                }
            }
        }
    }

    None
}

pub(crate) fn process_enter_scene(
    attr_store: &mut EntityAttrStore,
    enter_scene: &blueprotobuf::EnterScene,
    monitored_panel_attr_ids: &[i32],
) -> EnterSceneResult {
    if let Some(info) = enter_scene.enter_scene_info.as_ref() {
        if let Some(player_ent) = info.player_ent.as_ref() {
            if let Some(attrs) = player_ent.attrs.as_ref() {
                apply_panel_attrs(attr_store, attrs, monitored_panel_attr_ids);
            }
        }
    }

    let scene_id = enter_scene
        .enter_scene_info
        .as_ref()
        .and_then(|info| info.scene_attrs.as_ref())
        .and_then(extract_scene_id_from_attr_collection);

    EnterSceneResult { scene_id }
}

pub(crate) fn aoi_delta_has_player_damage(delta: &blueprotobuf::AoiSyncDelta) -> bool {
    delta
        .skill_effects
        .as_ref()
        .is_some_and(|effects| effects.damages.iter().any(is_valid_player_damage))
}

fn is_valid_player_damage(dmg: &blueprotobuf::SyncDamageInfo) -> bool {
    if dmg.r#type.unwrap_or(0) == EDamageType::Heal as i32 {
        return false;
    }
    if dmg.value.is_none() && dmg.lucky_value.is_none() {
        return false;
    }
    let attacker_uuid = match dmg.top_summoner_id.or(dmg.attacker_uuid) {
        Some(uuid) => uuid,
        None => return false,
    };
    if dmg.owner_id.is_none() {
        return false;
    }

    EEntityType::from(attacker_uuid) == EEntityType::EntChar
}

fn decode_single_attr_i32(attr: &blueprotobuf::Attr) -> Option<i32> {
    match attr.raw_data.as_ref() {
        None => Some(0),
        Some(raw) if raw.is_empty() => Some(0),
        Some(raw) => {
            let mut buf = raw.as_slice();
            prost::encoding::decode_varint(&mut buf)
                .ok()
                .and_then(|v| i32::try_from(v).ok())
        }
    }
}

pub fn apply_panel_attrs(
    attr_store: &mut EntityAttrStore,
    attrs: &blueprotobuf::AttrCollection,
    monitored_panel_attr_ids: &[i32],
) {
    if monitored_panel_attr_ids.is_empty() {
        return;
    }

    for attr in &attrs.attrs {
        let Some(attr_id) = attr.id else {
            continue;
        };
        if !monitored_panel_attr_ids.contains(&attr_id) {
            continue;
        }
        let Some(value) = decode_single_attr_i32(attr) else {
            continue;
        };
        let _ = attr_store.set_panel_attr(attr_id, value);
    }
}

pub fn process_aoi_sync_delta(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    aoi_sync_delta: blueprotobuf::AoiSyncDelta,
) -> Option<Vec<LocalDamageEvent>> {
    let target_uuid = aoi_sync_delta.uuid?; // UUID =/= uid (have to >> 16)
    let target_uid = target_uuid >> 16;

    // Process attributes
    let target_entity_type = EEntityType::from(target_uuid);
    let mut target_entity = encounter
        .entity_uid_to_entity
        .entry(target_uid)
        .or_insert_with(|| Entity {
            entity_type: target_entity_type,
            ..Default::default()
        });

    if let Some(attrs_collection) = aoi_sync_delta.attrs {
        match target_entity_type {
            EEntityType::EntChar => {
                process_player_attrs(
                    &mut target_entity,
                    target_uid,
                    attrs_collection.attrs,
                    attr_store,
                );
            }
            EEntityType::EntMonster => {
                process_monster_attrs(
                    &mut target_entity,
                    target_uid,
                    attrs_collection.attrs,
                    attr_store,
                );
            }
            _ => {}
        }
    }

    let Some(skill_effect) = aoi_sync_delta.skill_effects else {
        return Some(Vec::new()); // return ok since this variable usually doesn't exist
    };

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut local_damage_events = Vec::new();
    let mut had_player_damage = false;
    // Process Damage
    for sync_damage_info in skill_effect.damages {
        let non_lucky_dmg = sync_damage_info.value;
        let lucky_value = sync_damage_info.lucky_value;

        #[allow(clippy::cast_sign_loss)]
        let actual_value = if let Some(actual_dmg) = non_lucky_dmg.or(lucky_value) {
            actual_dmg as u128
        } else {
            continue; // skip this iteration
        };

        let attacker_uuid = sync_damage_info
            .top_summoner_id
            .or(sync_damage_info.attacker_uuid)?;
        let attacker_uid = attacker_uuid >> 16;

        // Local copies of fields needed later (avoid holding map borrows across operations)
        let owner_id = sync_damage_info.owner_id?;
        let damage_id = damage_id::compute_damage_id(
            sync_damage_info.damage_source,
            owner_id,
            sync_damage_info.owner_level,
            sync_damage_info.hit_event_id,
        );
        let skill_key = damage_id;
        if attacker_uid == encounter.local_player_uid {
            local_damage_events.push(LocalDamageEvent {
                skill_key,
                target_uid,
            });
        }
        let flag = sync_damage_info.type_flag.unwrap_or_default();
        // Pre-calculate whether this target is recognized as a boss and local player id
        let is_boss_target = encounter
            .entity_uid_to_entity
            .get(&target_uid)
            .map(|e| e.is_boss())
            .unwrap_or(false);

        let target_name_opt = encounter
            .entity_uid_to_entity
            .get(&target_uid)
            .and_then(|e| {
                if e.name.is_empty() {
                    None
                } else {
                    Some(e.name.clone())
                }
            });

        // First update attacker-side state in its own scope (single mutable borrow)
        let (is_crit, is_lucky, attacker_entity_type_copy, was_heal_event) = {
            let attacker_entity = encounter
                .entity_uid_to_entity
                .entry(attacker_uid)
                .or_insert_with(|| Entity {
                    entity_type: EEntityType::from(attacker_uuid),
                    ..Default::default()
                });

            let determined_spec = get_class_spec_from_skill_id(owner_id);
            if determined_spec != ClassSpec::Unknown {
                attacker_entity.class_id = get_class_id_from_spec(determined_spec);
                attacker_entity.class_spec = determined_spec;
            }

            let is_heal = sync_damage_info.r#type.unwrap_or(0) == EDamageType::Heal as i32;
            let is_lucky_local = lucky_value.is_some();
            const CRIT_BIT: i32 = 0b00_00_00_01;
            let is_crit_local = (flag & CRIT_BIT) != 0;

            if is_heal {
                let skill = attacker_entity
                    .skill_uid_to_heal_skill
                    .entry(skill_key)
                    .or_insert_with(|| Skill::default());
                if is_crit_local {
                    attacker_entity.healing.crit_hits += 1;
                    attacker_entity.healing.crit_total += actual_value;
                    skill.crit_hits += 1;
                    skill.crit_total_value += actual_value;
                }
                if is_lucky_local {
                    attacker_entity.healing.lucky_hits += 1;
                    attacker_entity.healing.lucky_total += actual_value;
                    skill.lucky_hits += 1;
                    skill.lucky_total_value += actual_value;
                }
                encounter.total_heal += actual_value;
                attacker_entity.healing.hits += 1;
                attacker_entity.healing.total += actual_value;
                skill.hits += 1;
                skill.total_value += actual_value;

                // Track per-skill per-target stats for healing
                let key = (skill_key, target_uid);
                let stats = attacker_entity.skill_heal_to_target.entry(key).or_default();

                stats.hits += 1;
                stats.total_value += actual_value;
                if is_crit_local {
                    stats.crit_hits += 1;
                    stats.crit_total += actual_value;
                }
                if is_lucky_local {
                    stats.lucky_hits += 1;
                    stats.lucky_total += actual_value;
                }
                stats.hp_loss_total = 0;
                stats.shield_loss_total = 0;

                (
                    is_crit_local,
                    is_lucky_local,
                    attacker_entity.entity_type,
                    true,
                )
            } else {
                let skill = attacker_entity
                    .skill_uid_to_dmg_skill
                    .entry(skill_key)
                    .or_insert_with(|| Skill::default());
                if is_crit_local {
                    attacker_entity.damage.crit_hits += 1;
                    attacker_entity.damage.crit_total += actual_value;
                    skill.crit_hits += 1;
                    skill.crit_total_value += actual_value;
                }
                if is_lucky_local {
                    attacker_entity.damage.lucky_hits += 1;
                    attacker_entity.damage.lucky_total += actual_value;
                    skill.lucky_hits += 1;
                    skill.lucky_total_value += actual_value;
                }
                if attacker_entity.entity_type == EEntityType::EntChar {
                    encounter.total_dmg += actual_value;
                }
                attacker_entity.damage.hits += 1;
                attacker_entity.damage.total += actual_value;
                skill.hits += 1;
                skill.total_value += actual_value;

                if is_boss_target {
                    let skill_boss_only = attacker_entity
                        .skill_uid_to_dmg_skill
                        .entry(skill_key)
                        .or_insert_with(|| Skill::default());
                    if is_crit_local {
                        attacker_entity.damage_boss_only.crit_hits += 1;
                        attacker_entity.damage_boss_only.crit_total += actual_value;
                        skill_boss_only.crit_hits += 1;
                        skill_boss_only.crit_total_value += actual_value;
                    }
                    if is_lucky_local {
                        attacker_entity.damage_boss_only.lucky_hits += 1;
                        attacker_entity.damage_boss_only.lucky_total += actual_value;
                        skill_boss_only.lucky_hits += 1;
                        skill_boss_only.lucky_total_value += actual_value;
                    }
                    if attacker_entity.entity_type == EEntityType::EntChar {
                        encounter.total_dmg_boss_only += actual_value;
                    }
                    attacker_entity.damage_boss_only.hits += 1;
                    attacker_entity.damage_boss_only.total += actual_value;
                    skill_boss_only.hits += 1;
                    skill_boss_only.total_value += actual_value;
                }

                // Track per-target totals
                use std::collections::hash_map::Entry;
                match attacker_entity.dmg_to_target.entry(target_uid) {
                    Entry::Occupied(mut e) => {
                        *e.get_mut() += actual_value;
                    }
                    Entry::Vacant(e) => {
                        e.insert(actual_value);
                    }
                }

                // Track per-skill per-target stats
                let key = (skill_key, target_uid);
                let stats = attacker_entity.skill_dmg_to_target.entry(key).or_default();

                stats.hits += 1;
                stats.total_value += actual_value;
                if is_crit_local {
                    stats.crit_hits += 1;
                    stats.crit_total += actual_value;
                }
                if is_lucky_local {
                    stats.lucky_hits += 1;
                    stats.lucky_total += actual_value;
                }

                let hp_loss_val = sync_damage_info.hp_lessen_value.unwrap_or(0).max(0) as u128;
                let shield_loss_val =
                    sync_damage_info.shield_lessen_value.unwrap_or(0).max(0) as u128;
                stats.hp_loss_total += hp_loss_val;
                stats.shield_loss_total += shield_loss_val;

                if stats.monster_name.is_none() {
                    stats.monster_name = target_name_opt.clone();
                }

                (
                    is_crit_local,
                    is_lucky_local,
                    attacker_entity.entity_type,
                    false,
                )
            }
        };

        if !was_heal_event && attacker_entity_type_copy == EEntityType::EntChar {
            had_player_damage = true;
        }

        // Track damage taken when a non-player attacks the defender.
        if !was_heal_event {
            let hp_loss = sync_damage_info.hp_lessen_value.unwrap_or(0).max(0) as u128;
            let shield_loss = sync_damage_info.shield_lessen_value.unwrap_or(0).max(0) as u128;
            let effective_value = if hp_loss + shield_loss > 0 {
                hp_loss + shield_loss
            } else {
                actual_value
            };

            let defender_entity = encounter
                .entity_uid_to_entity
                .entry(target_uid)
                .or_insert_with(|| Entity {
                    entity_type: EEntityType::from(target_uuid),
                    ..Default::default()
                });

            if attacker_entity_type_copy != EEntityType::EntChar {
                let taken_skill = defender_entity
                    .skill_uid_to_taken_skill
                    .entry(skill_key)
                    .or_insert_with(|| Skill::default());
                if is_crit {
                    defender_entity.taken.crit_hits += 1;
                    defender_entity.taken.crit_total += effective_value;
                    taken_skill.crit_hits += 1;
                    taken_skill.crit_total_value += effective_value;
                }
                if is_lucky {
                    defender_entity.taken.lucky_hits += 1;
                    defender_entity.taken.lucky_total += effective_value;
                    taken_skill.lucky_hits += 1;
                    taken_skill.lucky_total_value += effective_value;
                }
                defender_entity.taken.hits += 1;
                defender_entity.taken.total += effective_value;
                taken_skill.hits += 1;
                taken_skill.total_value += effective_value;
            }
        }
    }

    if had_player_damage {
        update_active_damage_time(encounter, timestamp_ms);
    }

    if encounter.time_fight_start_ms == Default::default() {
        encounter.time_fight_start_ms = timestamp_ms;
    }

    encounter.time_last_combat_packet_ms = timestamp_ms;
    Some(local_damage_events)
}

fn decode_varint_i64(raw: &[u8]) -> Option<i64> {
    let mut buf = raw;
    prost::encoding::decode_varint(&mut buf)
        .ok()
        .map(|v| v as i64)
}

#[derive(Clone, PartialEq, prost::Message)]
struct HateInfoWire {
    #[prost(int64, tag = "1")]
    uuid: i64,
    #[prost(uint32, tag = "2")]
    hate_val: u32,
}

fn parse_hate_list_into(raw: &[u8], entries: &mut Vec<HateEntry>) -> Option<()> {
    let mut buf = raw;
    entries.clear();

    while buf.has_remaining() {
        let tag = prost::encoding::decode_varint(&mut buf).ok()?;
        if tag != 0x0A {
            return None;
        }

        let entry = <HateInfoWire as prost::Message>::decode_length_delimited(&mut buf).ok()?;
        entries.push(HateEntry {
            uid: entry.uuid >> 16,
            hate_val: entry.hate_val,
        });
    }

    Some(())
}

fn decode_varint_i64_or_default(raw: Option<&[u8]>) -> i64 {
    raw.and_then(decode_varint_i64).unwrap_or(0)
}

fn decode_prefixed_string(raw: &[u8]) -> Option<String> {
    let mut buf = raw;
    let len = prost::encoding::decode_varint(&mut buf).ok()? as usize;
    if buf.len() < len {
        return None;
    }
    String::from_utf8(buf[..len].to_vec()).ok()
}

fn decode_prefixed_string_or_default(raw: Option<&[u8]>) -> String {
    raw.and_then(decode_prefixed_string).unwrap_or_default()
}

fn decode_unknown_attr_value(attr_id: i32, raw: &[u8]) -> Option<(AttrType, AttrValue)> {
    if attr_id <= 0 || matches!(attr_id, attr_type::ATTR_ID | attr_type::ATTR_REDUCTION_ID) {
        return None;
    }
    if let Some(v) = decode_varint_i64(raw) {
        return Some((AttrType::Unknown(attr_id), AttrValue::Int(v)));
    }
    if let Some(s) = decode_prefixed_string(raw) {
        return Some((AttrType::Unknown(attr_id), AttrValue::String(s)));
    }
    let hex_str: String = raw
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join("");
    Some((
        AttrType::Unknown(attr_id),
        AttrValue::String(format!("0x{}", hex_str)),
    ))
}

fn process_player_attrs(
    _player_entity: &mut Entity,
    target_uid: i64,
    attrs: Vec<Attr>,
    attr_store: &mut EntityAttrStore,
) {
    for attr in attrs {
        let Some(attr_id) = attr.id else { continue };
        let raw_bytes_opt = attr.raw_data.as_deref();

        if attr_id == attr_type::ATTR_FIGHT_RESOURCES {
            if let Some(values) = raw_bytes_opt.and_then(parse_fight_resources) {
                log::debug!(
                    "Decoded ATTR_FIGHT_RESOURCES for UID {}: {:?}",
                    target_uid,
                    values
                );
            }
            continue;
        }

        let decoded = if attr_id == attr_type::ATTR_NAME {
            let name = decode_prefixed_string_or_default(raw_bytes_opt);
            if !name.is_empty() {
                info!("Found player {} with UID {}", name, target_uid);
            }
            Some((AttrType::Name, AttrValue::String(name)))
        } else if let Some(attr_type) = AttrType::from_id(attr_id) {
            let value = decode_varint_i64_or_default(raw_bytes_opt);
            Some((attr_type, AttrValue::Int(value)))
        } else {
            raw_bytes_opt.and_then(|raw_bytes| decode_unknown_attr_value(attr_id, raw_bytes))
        };

        if let Some((attr_type, value)) = decoded {
            let _ = attr_store.set_attr(target_uid, attr_type, value);
        }
    }
}

fn process_monster_attrs(
    monster_entity: &mut Entity,
    target_uid: i64,
    attrs: Vec<Attr>,
    attr_store: &mut EntityAttrStore,
) {
    for attr in attrs {
        let Some(attr_id) = attr.id else { continue };
        let raw_bytes_opt = attr.raw_data.as_deref();

        if attr_id == attr_type::ATTR_ID {
            if let Some(monster_id) =
                i32::try_from(decode_varint_i64_or_default(raw_bytes_opt)).ok()
            {
                if monster_id > 0 {
                    monster_entity.set_monster_type(monster_id);
                    let _ = attr_store.set_attr(
                        target_uid,
                        AttrType::MonsterId,
                        AttrValue::Int(i64::from(monster_id)),
                    );
                }
            }
            continue;
        }

        if attr_id == attr_type::ATTR_NAME {
            let name = decode_prefixed_string_or_default(raw_bytes_opt);
            monster_entity.monster_name_packet = Some(name.clone());
            if monster_entity.monster_type_id.is_none() {
                monster_entity.name = name;
            }
            continue;
        }

        if attr_id == attr_type::ATTR_HATE_LIST {
            if let Some(raw) = raw_bytes_opt {
                let hate_list = attr_store.hate_list_mut(target_uid);
                let _ = parse_hate_list_into(raw, hate_list);
            }
            continue;
        }

        if let Some(attr_type) = AttrType::from_id(attr_id) {
            let value = decode_varint_i64_or_default(raw_bytes_opt);
            let _ = attr_store.set_attr(target_uid, attr_type, AttrValue::Int(value));
        }
    }
}
