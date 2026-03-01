// NOTE: opcodes_process works on Encounter directly; avoid importing opcodes_models at top-level.
use crate::database::{CachedEntity, CachedPlayerData, now_ms};
use crate::live::dungeon_log::{self, BattleStateMachine, DungeonLogRuntime, EncounterResetReason};
use crate::live::opcodes_models::class::{
    ClassSpec, get_class_id_from_spec, get_class_spec_from_skill_id,
};
use crate::live::opcodes_models::{AttrType, AttrValue, Encounter, Entity, Skill, attr_type};
use crate::live::damage_id;
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::{Attr, EDamageType, EEntityType};
use log::{info, warn};
use std::collections::HashMap;
use bytes::Buf;
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
use std::time::{SystemTime, UNIX_EPOCH};

/// Record a death event into the encounter and enqueue a DB task.
fn record_death(
    encounter: &mut Encounter,
    actor_id: i64,
    killer_id: Option<i64>,
    skill_id: Option<i32>,
    timestamp_ms: i64,
) {
    // Dedupe close-together events for the same actor (2s window) using a
    // dedicated map for DB death inserts. We no longer use death tracking for
    // wipe detection/UI; death events are still persisted to the DB.
    let should_record = match encounter.last_death_db_ms.get(&actor_id) {
        Some(last_ms) => {
            let diff = (timestamp_ms as i128 - *last_ms as i128).abs();
            diff > 2000
        }
        None => true,
    };

    if !should_record {
        return;
    }

    encounter
        .last_death_db_ms
        .insert(actor_id, timestamp_ms as u128);

    // Enqueue DB task; mark as local player when matching tracked local UID
    let is_local = encounter.local_player_uid == actor_id;
    let _ = (timestamp_ms, actor_id, killer_id, skill_id, is_local);
}

/// Record a revive event into the encounter for UI emission.
fn record_revive(encounter: &mut Encounter, actor_id: i64, timestamp_ms: i64) {
    // Dedupe close-together revives for the same actor (2s window)
    let should_record = match encounter.last_revive_ms.get(&actor_id) {
        Some(last_ms) => {
            let diff = (timestamp_ms as i128 - *last_ms as i128).abs();
            diff > 2000
        }
        None => true,
    };

    if !should_record {
        return;
    }

    encounter
        .last_revive_ms
        .insert(actor_id, timestamp_ms as u128);

    // Push to pending player revives for UI emission
    encounter
        .pending_player_revives
        .push((actor_id, None, None, timestamp_ms));

    info!("Recorded revive for UID {}", actor_id);
}

/// Increment per-entity active damage time used for True DPS calculations.
/// Adds a small grace window for single hits and ignores long idle gaps.
fn update_active_damage_time(entity: &mut Entity, timestamp_ms: u128) {
    const INACTIVITY_CUTOFF_MS: u128 = 3_000;
    const HIT_GRACE_MS: u128 = 500;

    let additional = if let Some(last) = entity.last_dmg_timestamp_ms {
        let delta = timestamp_ms.saturating_sub(last);
        if delta <= INACTIVITY_CUTOFF_MS {
            delta
        } else {
            HIT_GRACE_MS
        }
    } else {
        HIT_GRACE_MS
    };

    entity.active_dmg_time_ms = entity.active_dmg_time_ms.saturating_add(additional);
    entity.last_dmg_timestamp_ms = Some(timestamp_ms);
}

fn did_target_die(
    is_dead_flag: Option<bool>,
    hp_loss: u128,
    shield_loss: u128,
    prev_hp: Option<i64>,
    max_hp: Option<i64>,
) -> bool {
    if let Some(true) = is_dead_flag {
        return true;
    }

    let total_loss = hp_loss.saturating_add(shield_loss);
    if total_loss == 0 {
        return false;
    }

    if let Some(prev_hp_val) = prev_hp.filter(|hp| *hp > 0) {
        let prev_hp_u128 = prev_hp_val as u128;
        if total_loss >= prev_hp_u128 {
            return true;
        }
    }

    if let Some(max_hp_val) = max_hp.filter(|hp| *hp > 0) {
        let max_hp_u128 = max_hp_val as u128;
        if total_loss >= max_hp_u128 {
            return true;
        }
    }

    false
}

/// Serialize entity attributes HashMap to JSON string for database storage.
/// Converts AttrType keys to string representation for JSON compatibility.
pub(crate) fn serialize_attributes(entity: &Entity) -> Option<String> {
    if entity.attributes.is_empty() {
        return None;
    }

    // Convert HashMap<AttrType, AttrValue> to HashMap<String, serde_json::Value> for JSON serialization
    // This is necessary because JSON object keys must be strings, and AttrType::Unknown(i32)
    // cannot be directly serialized as a JSON object key
    use crate::live::opcodes_models::{AttrType, AttrValue};
    use serde_json::json;

    let string_map: serde_json::Map<String, serde_json::Value> = entity
        .attributes
        .iter()
        .map(|(k, v)| {
            let key_str = match k {
                AttrType::Unknown(id) => format!("Unknown_0x{:x}", id),
                _ => format!("{:?}", k), // Uses Debug trait for named variants
            };
            let value_json = match v {
                AttrValue::Int(i) => json!(i),
                AttrValue::Float(f) => json!(f),
                AttrValue::String(s) => json!(s),
                AttrValue::Bool(b) => json!(b),
            };
            (key_str, value_json)
        })
        .collect();

    serde_json::to_string(&string_map).ok()
}

fn upsert_entity_cache_entry(
    cache: &mut HashMap<i64, CachedEntity>,
    entity_id: i64,
    entity: &Entity,
    name_opt: Option<String>,
    seen_at_ms: i64,
) {
    let attributes = serialize_attributes(entity);
    let mut first_seen = Some(seen_at_ms);
    cache
        .entry(entity_id)
        .and_modify(|entry| {
            first_seen = entry.first_seen_ms;
            entry.name = name_opt.clone();
            entry.class_id = Some(entity.class_id);
            entry.class_spec = Some(entity.class_spec as i32);
            entry.ability_score = Some(entity.ability_score);
            entry.level = Some(entity.level);
            entry.last_seen_ms = Some(seen_at_ms);
            entry.attributes = attributes.clone();
            entry.dirty = true;
        })
        .or_insert_with(|| CachedEntity {
            entity_id,
            name: name_opt,
            class_id: Some(entity.class_id),
            class_spec: Some(entity.class_spec as i32),
            ability_score: Some(entity.ability_score),
            level: Some(entity.level),
            first_seen_ms: first_seen,
            last_seen_ms: Some(seen_at_ms),
            attributes,
            dirty: true,
        });
}

pub fn on_server_change(encounter: &mut Encounter) {
    info!("on server change");
    // Preserve entity identity and local player info; only reset combat state
    encounter.reset_combat_state();
}

/// Process a NotifyReviveUser packet: record a revive for the actor.
///
/// This will add a revive entry to the encounter's pending revives for UI emission
/// (we no longer clear death markers here because death tracking is not used for
/// wipe detection).
pub fn process_notify_revive_user(
    encounter: &mut Encounter,
    notify_revive: blueprotobuf::NotifyReviveUser,
) -> Option<()> {
    let actor_uuid = notify_revive.v_actor_uuid?;
    // Actor UUID in protobuf is signed i64; interpret bits as u64 for shifting
    let actor_uuid_u = actor_uuid as u64;
    let uid = (actor_uuid_u >> 16) as i64;

    // Record revive for UI emission (timestamp using now_ms helper)
    let ts = now_ms();
    record_revive(encounter, uid, ts);
    // Persist revive to DB (increment per-actor revive counter)
    let is_local = encounter.local_player_uid == uid;
    let _ = is_local;
    info!(
        "Processed NotifyReviveUser: recorded revive for UID {}",
        uid
    );
    Some(())
}

pub fn process_sync_near_entities(
    encounter: &mut Encounter,
    entity_cache: &mut HashMap<i64, CachedEntity>,
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
                    entity_cache,
                );
            }
            EEntityType::EntMonster => {
                process_monster_attrs(target_entity, pkt_entity.attrs?.attrs);
            }
            _ => {}
        }

        // Lazy upsert entity into DB (only players are persisted)
        if matches!(target_entity_type, EEntityType::EntChar) {
            let name_opt = if target_entity.name.is_empty() {
                None
            } else {
                Some(target_entity.name.clone())
            };
            upsert_entity_cache_entry(entity_cache, target_uid, target_entity, name_opt, now_ms());
        }
    }

    // Track party members for wipe detection (collect data first to avoid borrow issues)
    Some(())
}

pub fn process_sync_container_data(
    encounter: &mut Encounter,
    entity_cache: &mut HashMap<i64, CachedEntity>,
    playerdata_cache: &mut Option<CachedPlayerData>,
    sync_container_data: blueprotobuf::SyncContainerData,
) -> Option<()> {
    use crate::live::opcodes_models::{AttrType, AttrValue};

    let v_data = sync_container_data.v_data?;
    let player_uid = v_data.char_id?;

    let target_entity = encounter
        .entity_uid_to_entity
        .entry(player_uid)
        .or_default();
    let char_base = v_data.char_base.as_ref()?;
    let name = char_base.name.clone()?;
    target_entity.name = name;
    target_entity.set_attr(
        AttrType::Name,
        AttrValue::String(target_entity.name.clone()),
    );

    // Player names are automatically stored in the database via UpsertEntity tasks
    // No need to maintain a separate cache anymore
    target_entity.entity_type = EEntityType::EntChar;
    let profession_list = v_data.profession_list.as_ref()?;
    let class_id = profession_list.cur_profession_id?;
    target_entity.class_id = class_id;
    target_entity.set_attr(
        AttrType::ProfessionId,
        AttrValue::Int(target_entity.class_id as i64),
    );

    target_entity.ability_score = char_base.fight_point?;
    target_entity.set_attr(
        AttrType::FightPoint,
        AttrValue::Int(target_entity.ability_score as i64),
    );

    let role_level = v_data.role_level.as_ref()?;
    target_entity.level = role_level.level?;
    target_entity.set_attr(AttrType::Level, AttrValue::Int(target_entity.level as i64));

    // Note: HP data comes from attribute packets (ATTR_CURRENT_HP, ATTR_MAX_HP)
    // CharBaseInfo doesn't contain HP fields

    // Lazy upsert with richer info
    let name_opt = if target_entity.name.is_empty() {
        None
    } else {
        Some(target_entity.name.clone())
    };
    // Only store players in the database
    if matches!(target_entity.entity_type, EEntityType::EntChar) {
        upsert_entity_cache_entry(entity_cache, player_uid, target_entity, name_opt, now_ms());

        // Persist detailed player data for the local player.
        let now = now_ms();

        // Serialize v_data to protobuf bytes
        let vdata_bytes = <blueprotobuf::CharSerialize as prost::Message>::encode_to_vec(&v_data);

        *playerdata_cache = Some(CachedPlayerData {
            player_id: player_uid,
            last_seen_ms: now,
            vdata_bytes,
            dirty: true,
        });
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
                if let Some(reason) = battle_state.record_dungeon_target(target_id, nums, complete) {
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
    let dirty_sync = match crate::live::dungeon_dirty_blob::parse_dirty_dungeon_data(bytes.as_slice())
    {
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
    entity_cache: &mut HashMap<i64, CachedEntity>,
    sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    dungeon_runtime: Option<&DungeonLogRuntime>,
) -> Option<()> {
    let delta_info = match sync_to_me_delta_info.delta_info {
        Some(info) => info,
        None => {
            // This is normal during gameplay - packet may not always contain delta_info
            return None;
        }
    };

    if let Some(uuid) = delta_info.uuid {
        encounter.local_player_uid = uuid >> 16; // UUID =/= uid (have to >> 16)
    }

    if let Some(base_delta) = delta_info.base_delta {
        process_aoi_sync_delta(encounter, entity_cache, base_delta, dungeon_runtime);
    }

    Some(())
}

pub fn process_aoi_sync_delta(
    encounter: &mut Encounter,
    entity_cache: &mut HashMap<i64, CachedEntity>,
    aoi_sync_delta: blueprotobuf::AoiSyncDelta,
    dungeon_runtime: Option<&DungeonLogRuntime>,
) -> Option<()> {
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
                    entity_cache,
                );
            }
            EEntityType::EntMonster => {
                process_monster_attrs(&mut target_entity, attrs_collection.attrs);
            }
            _ => {}
        }

        // Lazy upsert target entity after attrs
        let name_opt = if target_entity.name.is_empty() {
            None
        } else {
            Some(target_entity.name.clone())
        };
        // Only store players in the database
        if matches!(target_entity_type, EEntityType::EntChar) {
            upsert_entity_cache_entry(entity_cache, target_uid, target_entity, name_opt, now_ms());
        }
    }

    // // Dump BuffInfoSync if present (for debugging)
    // if let Some(ref buff_info_sync) = aoi_sync_delta.buff_infos {
    //     if !buff_info_sync.buff_infos.is_empty() {
    //         match serde_json::to_string_pretty(buff_info_sync) {
    //             Ok(json) => {
    //                 info!(
    //                     "BuffInfoSync (from AoiSyncDelta, target_uid={}): \n{}",
    //                     target_uid, json
    //                 );
    //             }
    //             Err(e) => {
    //                 info!(
    //                     "BuffInfoSync (from AoiSyncDelta, target_uid={}, JSON failed: {}): {:?}",
    //                     target_uid, e, buff_info_sync
    //                 );
    let Some(skill_effect) = aoi_sync_delta.skill_effects else {
        return Some(()); // return ok since this variable usually doesn't exist
    };

    // Process Damage
    for sync_damage_info in skill_effect.damages {
        // Timestamp for this event
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis();
        let timestamp_ms_i64 = timestamp_ms.min(i64::MAX as u128) as i64;
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
                update_active_damage_time(attacker_entity, timestamp_ms);

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

        // Now handle defender-side updates in their own scope and compute death info
        let (death_info_local, target_name, target_monster_type_id) = {
            // Track damage taken
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

            let target_name = if defender_entity.name.is_empty() {
                None
            } else {
                Some(defender_entity.name.clone())
            };
            let target_monster_type_id = defender_entity.monster_type_id.map(|id| i64::from(id));

            // Check for death
            let prev_hp_opt = defender_entity.hp();
            let max_hp_opt = defender_entity.max_hp();
            let died = did_target_die(
                sync_damage_info.is_dead,
                hp_loss,
                shield_loss,
                prev_hp_opt,
                max_hp_opt,
            );

            // Only record damage/taken stats if this event is not a heal
            if !was_heal_event {
                // Insert damage event

                // Taken stats (only when attacker is not a player)
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

            let death_info = if died {
                Some((
                    target_uid,
                    Some(attacker_uid),
                    Some(owner_id),
                    timestamp_ms_i64,
                ))
            } else {
                None
            };

            (death_info, target_name, target_monster_type_id)
        };

        if let Some(runtime) = dungeon_runtime {
            if !was_heal_event {
                let damage_amount = actual_value.min(i64::MAX as u128) as i64;
                let is_boss_target_hint = encounter
                    .entity_uid_to_entity
                    .get(&target_uid)
                    .map(|entity| entity.is_boss())
                    .unwrap_or(false);

                let damage_event = dungeon_log::build_damage_event(
                    timestamp_ms_i64,
                    attacker_uid,
                    target_uid,
                    target_name.clone(),
                    target_monster_type_id,
                    damage_amount,
                    death_info_local.is_some(),
                    is_boss_target_hint,
                );
                let (boss_died, new_boss_started) = runtime.process_damage_event(damage_event);

                // Persist segments if a boss died or a new boss started (implies previous segment closed)
                if boss_died || new_boss_started {
                    dungeon_log::persist_segments(&runtime.shared_log, false);
                }
            }
        }

        // If death detected, record it (dedupe handled inside record_death)
        if let Some((actor, killer, skill, ts)) = death_info_local {
            record_death(encounter, actor, killer, skill, ts);
        }
    }

    // Figure out timestamps.
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis();

    if encounter.time_fight_start_ms == Default::default() {
        encounter.time_fight_start_ms = timestamp_ms;
    }

    encounter.time_last_combat_packet_ms = timestamp_ms;
    Some(())
}

fn process_player_attrs(
    player_entity: &mut Entity,
    target_uid: i64,
    attrs: Vec<Attr>,
    entity_cache: &mut HashMap<i64, CachedEntity>,
) {
    use crate::live::opcodes_models::{AttrType, AttrValue};
    use bytes::Buf;

    for attr in attrs {
        let Some(raw_bytes) = attr.raw_data else {
            continue;
        };
        let Some(attr_id) = attr.id else { continue };

        // Create a bytes buffer for protobuf decoding
        let mut buf = &raw_bytes[..];

        match attr_id {
            attr_type::ATTR_NAME => {
                // Decode protobuf string (varint length prefix + UTF-8 bytes)
                match prost::encoding::decode_varint(&mut buf) {
                    Ok(len) => {
                        let len = len as usize;
                        if buf.remaining() >= len {
                            let bytes = buf.copy_to_bytes(len);
                            match String::from_utf8(bytes.to_vec()) {
                                Ok(player_name) => {
                                    player_entity.name = player_name.clone();
                                    player_entity.set_attr(
                                        AttrType::Name,
                                        AttrValue::String(player_name.clone()),
                                    );
                                    info! {"Found player {} with UID {}", player_entity.name, target_uid}

                                    // Store player in database
                                    if matches!(player_entity.entity_type, EEntityType::EntChar) {
                                        upsert_entity_cache_entry(
                                            entity_cache,
                                            target_uid,
                                            player_entity,
                                            Some(player_name),
                                            now_ms(),
                                        );
                                    }
                                }
                                Err(e) => log::warn!(
                                    "Failed to decode ATTR_NAME UTF-8 for UID {}: {:?}",
                                    target_uid,
                                    e
                                ),
                            }
                        } else {
                            log::warn!("ATTR_NAME buffer too short for UID {}", target_uid);
                        }
                    }
                    Err(e) => log::warn!(
                        "Failed to decode ATTR_NAME varint for UID {}: {:?}",
                        target_uid,
                        e
                    ),
                }
            }
            #[allow(clippy::cast_possible_truncation)]
            attr_type::ATTR_PROFESSION_ID => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    let value = value as i32;
                    player_entity.class_id = value;
                    player_entity.set_attr(AttrType::ProfessionId, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_PROFESSION_ID: {:?}", e),
            },
            #[allow(clippy::cast_possible_truncation)]
            attr_type::ATTR_FIGHT_POINT => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    let value = value as i32;
                    player_entity.ability_score = value;
                    player_entity.set_attr(AttrType::FightPoint, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_FIGHT_POINT: {:?}", e),
            },
            #[allow(clippy::cast_possible_truncation)]
            attr_type::ATTR_LEVEL => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    let value = value as i32;
                    player_entity.level = value;
                    player_entity.set_attr(AttrType::Level, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_LEVEL: {:?}", e),
            },
            attr_type::ATTR_RANK_LEVEL => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::RankLevel, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_RANK_LEVEL: {:?}", e),
            },
            attr_type::ATTR_CRIT => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Crit, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_CRIT: {:?}", e),
            },
            attr_type::ATTR_LUCKY => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Lucky, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_LUCKY: {:?}", e),
            },
            attr_type::ATTR_SEASON_STRENGTH => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity
                        .set_attr(AttrType::SeasonStrength, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_SEASON_STRENGTH: {:?}", e),
            },
            attr_type::ATTR_CURRENT_HP => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::CurrentHp, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_CURRENT_HP: {:?}", e),
            },
            attr_type::ATTR_MAX_HP => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MaxHp, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MAX_HP: {:?}", e),
            },
            attr_type::ATTR_HASTE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Haste, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_HASTE: {:?}", e),
            },
            attr_type::ATTR_MASTERY => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Mastery, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MASTERY: {:?}", e),
            },
            attr_type::ATTR_ELEMENT_FLAG => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::ElementFlag, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ELEMENT_FLAG: {:?}", e),
            },
            attr_type::ATTR_ENERGY_FLAG => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::EnergyFlag, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ENERGY_FLAG: {:?}", e),
            },
            attr_type::ATTR_REDUCTION_LEVEL => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::ReductionLevel, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_REDUCTION_LEVEL: {:?}", e),
            },
            attr_type::ATTR_TEAM_ID => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::TeamId, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_TEAM_ID: {:?}", e),
            },
            attr_type::ATTR_ATTACK_POWER => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::AttackPower, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ATTACK_POWER: {:?}", e),
            },
            attr_type::ATTR_DEFENSE_POWER => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::DefensePower, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_DEFENSE_POWER: {:?}", e),
            },
            attr_type::ATTR_STAR_LEVEL => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::StarLevel, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_STAR_LEVEL: {:?}", e),
            },
            attr_type::ATTR_GEAR_TIER => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::GearTier, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_GEAR_TIER: {:?}", e),
            },
            attr_type::ATTR_PVP_RANK => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::PvpRank, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_PVP_RANK: {:?}", e),
            },
            attr_type::ATTR_TOTAL_POWER => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::TotalPower, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_TOTAL_POWER: {:?}", e),
            },
            attr_type::ATTR_PHYSICAL_ATTACK => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::PhysicalAttack, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_PHYSICAL_ATTACK: {:?}", e),
            },
            attr_type::ATTR_MAGIC_ATTACK => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MagicAttack, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MAGIC_ATTACK: {:?}", e),
            },
            attr_type::ATTR_WEAPON_TYPE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::WeaponType, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_WEAPON_TYPE: {:?}", e),
            },
            attr_type::ATTR_RESURRECTION_COUNT => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity
                        .set_attr(AttrType::ResurrectionCount, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_RESURRECTION_COUNT: {:?}", e),
            },
            attr_type::ATTR_PARTY_ROLE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::PartyRole, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_PARTY_ROLE: {:?}", e),
            },
            attr_type::ATTR_COMBAT_STATE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::CombatState, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_COMBAT_STATE: {:?}", e),
            },
            attr_type::ATTR_EQUIPMENT_SLOT_1 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::EquipmentSlot1, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_EQUIPMENT_SLOT_1: {:?}", e),
            },
            attr_type::ATTR_EQUIPMENT_SLOT_2 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::EquipmentSlot2, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_EQUIPMENT_SLOT_2: {:?}", e),
            },
            attr_type::ATTR_CURRENT_SHIELD => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::CurrentShield, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_CURRENT_SHIELD: {:?}", e),
            },
            attr_type::ATTR_ELEMENTAL_RES_1 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::ElementalRes1, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ELEMENTAL_RES_1: {:?}", e),
            },
            attr_type::ATTR_ELEMENTAL_RES_2 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::ElementalRes2, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ELEMENTAL_RES_2: {:?}", e),
            },
            attr_type::ATTR_ELEMENTAL_RES_3 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::ElementalRes3, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ELEMENTAL_RES_3: {:?}", e),
            },
            attr_type::ATTR_FIGHT_RESOURCES => {
                if let Some(values) = parse_fight_resources(&raw_bytes) {
                    log::debug!(
                        "Decoded ATTR_FIGHT_RESOURCES for UID {}: {:?}",
                        target_uid,
                        values
                    );
                } else {
                    log::warn!(
                        "Failed to decode ATTR_FIGHT_RESOURCES for UID {}",
                        target_uid
                    );
                }
            }
            attr_type::ATTR_GUILD_ID => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::GuildId, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_GUILD_ID: {:?}", e),
            },
            attr_type::ATTR_GENDER => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Gender, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_GENDER: {:?}", e),
            },
            attr_type::ATTR_TOTAL_DEFENSE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::TotalDefense, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_TOTAL_DEFENSE: {:?}", e),
            },
            attr_type::ATTR_ENDURANCE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Endurance, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ENDURANCE: {:?}", e),
            },
            attr_type::ATTR_CHARACTER_TIMESTAMP => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity
                        .set_attr(AttrType::CharacterTimestamp, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_CHARACTER_TIMESTAMP: {:?}", e),
            },
            attr_type::ATTR_SESSION_TIMESTAMP => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity
                        .set_attr(AttrType::SessionTimestamp, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_SESSION_TIMESTAMP: {:?}", e),
            },
            attr_type::ATTR_MOVEMENT_SPEED => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MovementSpeed, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MOVEMENT_SPEED: {:?}", e),
            },
            attr_type::ATTR_TALENT_SPEC => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::TalentSpec, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_TALENT_SPEC: {:?}", e),
            },
            attr_type::ATTR_ELITE_STATUS => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::EliteStatus, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ELITE_STATUS: {:?}", e),
            },
            attr_type::ATTR_MAX_MP => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MaxMp, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MAX_MP: {:?}", e),
            },
            attr_type::ATTR_STAMINA => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::Stamina, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_STAMINA: {:?}", e),
            },
            attr_type::ATTR_BUFF_SLOT_2 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::BuffSlot2, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_BUFF_SLOT_2: {:?}", e),
            },
            attr_type::ATTR_BASE_STRENGTH => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::BaseStrength, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_BASE_STRENGTH: {:?}", e),
            },
            attr_type::ATTR_COMBAT_MODE => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::CombatMode, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_COMBAT_MODE: {:?}", e),
            },
            attr_type::ATTR_LAST_ACTION_TIMESTAMP => {
                match prost::encoding::decode_varint(&mut buf) {
                    Ok(value) => {
                        player_entity
                            .set_attr(AttrType::LastActionTimestamp, AttrValue::Int(value as i64));
                    }
                    Err(e) => log::warn!("Failed to decode ATTR_LAST_ACTION_TIMESTAMP: {:?}", e),
                }
            }
            attr_type::ATTR_BUFF_SLOT_3 => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::BuffSlot3, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_BUFF_SLOT_3: {:?}", e),
            },
            attr_type::ATTR_MOUNT_STATUS => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MountStatus, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MOUNT_STATUS: {:?}", e),
            },
            attr_type::ATTR_MOUNT_TIMESTAMP => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MountTimestamp, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MOUNT_TIMESTAMP: {:?}", e),
            },
            attr_type::ATTR_MOUNT_SPEED => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MountSpeed, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MOUNT_SPEED: {:?}", e),
            },
            attr_type::ATTR_MOUNT_DURATION => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MountDuration, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MOUNT_DURATION: {:?}", e),
            },
            attr_type::ATTR_MIN_ENERGY => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MinEnergy, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MIN_ENERGY: {:?}", e),
            },
            attr_type::ATTR_MAX_ENERGY => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::MaxEnergy, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MAX_ENERGY: {:?}", e),
            },
            attr_type::ATTR_ENERGY_REGEN => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity.set_attr(AttrType::EnergyRegen, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_ENERGY_REGEN: {:?}", e),
            },
            attr_type::ATTR_PHYSICAL_PENETRATION => {
                match prost::encoding::decode_varint(&mut buf) {
                    Ok(value) => {
                        player_entity
                            .set_attr(AttrType::PhysicalPenetration, AttrValue::Int(value as i64));
                    }
                    Err(e) => log::warn!("Failed to decode ATTR_PHYSICAL_PENETRATION: {:?}", e),
                }
            }
            attr_type::ATTR_MAGIC_PENETRATION => match prost::encoding::decode_varint(&mut buf) {
                Ok(value) => {
                    player_entity
                        .set_attr(AttrType::MagicPenetration, AttrValue::Int(value as i64));
                }
                Err(e) => log::warn!("Failed to decode ATTR_MAGIC_PENETRATION: {:?}", e),
            },
            _ => {
                // Store unknown attribute IDs with their decoded values
                // This captures all attributes, even ones we don't explicitly handle yet
                if attr_id > 0
                    && !matches!(attr_id, attr_type::ATTR_ID | attr_type::ATTR_REDUCTION_ID)
                {
                    use crate::live::opcodes_models::AttrValue;

                    // Try to decode as varint first (most common)
                    let mut debug_buf = &raw_bytes[..];
                    match prost::encoding::decode_varint(&mut debug_buf) {
                        Ok(val) => {
                            // Store as unknown varint attribute
                            player_entity
                                .set_attr(AttrType::Unknown(attr_id), AttrValue::Int(val as i64));
                            // log::trace!("Unknown player attribute ID: 0x{:x} = {}", attr_id, val);
                        }
                        Err(_) => {
                            // Try as string
                            let mut str_buf = &raw_bytes[..];
                            match prost::encoding::decode_varint(&mut str_buf) {
                                Ok(len) => {
                                    if str_buf.remaining() >= len as usize {
                                        let bytes = str_buf.copy_to_bytes(len as usize);
                                        match String::from_utf8(bytes.to_vec()) {
                                            Ok(s) => {
                                                // Store as unknown string attribute
                                                player_entity.set_attr(
                                                    AttrType::Unknown(attr_id),
                                                    AttrValue::String(s.clone()),
                                                );
                                                // log::trace!(
                                                //     "Unknown player attribute ID: 0x{:x} = \"{}\"",
                                                //     attr_id,
                                                //     s
                                                // );
                                            }
                                            Err(_) => {
                                                // Store as hex string for binary data
                                                let hex_str: String = raw_bytes
                                                    .iter()
                                                    .map(|b| format!("{:02x}", b))
                                                    .collect::<Vec<_>>()
                                                    .join("");
                                                player_entity.set_attr(
                                                    AttrType::Unknown(attr_id),
                                                    AttrValue::String(format!("0x{}", hex_str)),
                                                );
                                                // log::trace!(
                                                //     "Unknown player attribute ID: 0x{:x} = hex {}",
                                                //     attr_id,
                                                //     hex_str
                                                // );
                                            }
                                        }
                                    } else {
                                        let hex_str: String = raw_bytes
                                            .iter()
                                            .map(|b| format!("{:02x}", b))
                                            .collect::<Vec<_>>()
                                            .join("");
                                        player_entity.set_attr(
                                            AttrType::Unknown(attr_id),
                                            AttrValue::String(format!("0x{}", hex_str)),
                                        );
                                        // log::trace!(
                                        //     "Unknown player attribute ID: 0x{:x} = hex {}",
                                        //     attr_id,
                                        //     hex_str
                                        // );
                                    }
                                }
                                Err(_) => {
                                    let hex_str: String = raw_bytes
                                        .iter()
                                        .map(|b| format!("{:02x}", b))
                                        .collect::<Vec<_>>()
                                        .join("");
                                    player_entity.set_attr(
                                        AttrType::Unknown(attr_id),
                                        AttrValue::String(format!("0x{}", hex_str)),
                                    );
                                    // log::trace!(
                                    //     "Unknown player attribute ID: 0x{:x} = hex {}",
                                    //     attr_id,
                                    //     hex_str
                                    // );
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn process_monster_attrs(monster_entity: &mut Entity, attrs: Vec<Attr>) {
    use crate::live::opcodes_models::attr_type;
    for attr in attrs {
        let Some(mut raw_bytes) = attr.raw_data else {
            continue;
        };
        let Some(attr_id) = attr.id else { continue };
        match attr_id {
            attr_type::ATTR_ID => {
                let monster_id =
                    prost::encoding::decode_varint(&mut raw_bytes.as_slice()).unwrap_or(0) as i32;
                if monster_id > 0 {
                    monster_entity.set_monster_type(monster_id);
                }
            }
            attr_type::ATTR_NAME => {
                if !raw_bytes.is_empty() {
                    raw_bytes.remove(0);
                }
                if let Ok(name) = String::from_utf8(raw_bytes) {
                    // Always capture the raw packet name for monsters
                    monster_entity.monster_name_packet = Some(name.clone());
                    if monster_entity.monster_type_id.is_none() {
                        monster_entity.name = name;
                    }
                }
            }
            attr_type::ATTR_CURRENT_HP => {
                if let Ok(value) = prost::encoding::decode_varint(&mut raw_bytes.as_slice()) {
                    monster_entity.set_attr(AttrType::CurrentHp, AttrValue::Int(value as i64));
                }
            }
            attr_type::ATTR_MAX_HP => {
                if let Ok(value) = prost::encoding::decode_varint(&mut raw_bytes.as_slice()) {
                    monster_entity.set_attr(AttrType::MaxHp, AttrValue::Int(value as i64));
                }
            }
            attr_type::ATTR_ELITE_STATUS => {
                match prost::encoding::decode_varint(&mut raw_bytes.as_slice()) {
                    Ok(value) => {
                        monster_entity
                            .set_attr(AttrType::EliteStatus, AttrValue::Int(value as i64));
                    }
                    Err(e) => log::warn!("Failed to decode ATTR_ELITE_STATUS: {:?}", e),
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::did_target_die;

    #[test]
    fn uses_packet_flag_when_present() {
        assert!(did_target_die(Some(true), 0, 0, None, None));
        assert!(!did_target_die(Some(false), 0, 0, Some(10), Some(20)));
    }

    #[test]
    fn hp_loss_must_exceed_previous_hp() {
        assert!(!did_target_die(None, 50, 0, Some(100), Some(200)));
        assert!(did_target_die(None, 150, 0, Some(100), Some(200)));
    }

    #[test]
    fn falls_back_to_max_hp_when_needed() {
        assert!(did_target_die(None, 1_500, 0, None, Some(1_000)));
        assert!(!did_target_die(None, 500, 0, None, Some(1_000)));
    }

    #[test]
    fn zero_loss_never_marks_death() {
        assert!(!did_target_die(None, 0, 0, Some(1), Some(2)));
    }
}
