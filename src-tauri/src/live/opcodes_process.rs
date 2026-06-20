// NOTE: opcodes_process works on Encounter directly; avoid importing opcodes_models at top-level.
use crate::database::{flush_playerdata, now_ms};
use crate::live::commands_models::{HateEntry, ShieldDetailEntry};
use crate::live::damage_id;
use crate::live::dungeon_log::{BattleStateMachine, EncounterResetReason};
use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::entity_id::{EntityUuid, canonical_player_uuid, uid_from_uuid};
use crate::live::opcodes_models::class::{
    ClassSpec, get_class_id_from_spec, get_class_spec_from_skill_id,
};
use crate::live::opcodes_models::{
    AttrType, AttrValue, DamageSnapshot, Encounter, Entity, PositionAttr, Skill, attr_type,
    damage_type_flag,
};
use crate::live::training_dummy::CombatGate;
use blueprotobuf_lib::blueprotobuf;
use blueprotobuf_lib::blueprotobuf::{Attr, EDamageType, EEntityType};
use bytes::Buf;
use log::{info, warn};
use prost::Message;
use std::collections::hash_map::Entry;
use std::default::Default;

/// Attr ID for the shield display data (nested protobuf with current/max shield values).
const ATTR_SHIELD_DISPLAY: i32 = 60050;
const RESONANCE_FANTASY_MARKER_BUFF_ID: i32 = 2_199_999;

#[derive(Debug, Default, Clone, Copy)]
pub struct DungeonProcessResult {
    pub reset_reason: Option<EncounterResetReason>,
    pub entered_playing: bool,
}

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
    pub attr_skill_id: Option<i32>,
    pub local_damage_events: Vec<LocalDamageEvent>,
    pub local_damage_taken_events: Vec<LocalDamageTakenEvent>,
}

#[derive(Debug, Default, Clone)]
pub struct LocalDamageEvent {
    pub skill_key: i64,
    pub target_entity_uuid: i64,
    pub type_flag: i32,
}

#[derive(Debug, Default, Clone)]
pub struct LocalDamageTakenEvent {
    pub skill_key: i64,
    pub source: DamageTakenSource,
    pub type_flag: i32,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum DamageTakenSource {
    Entity(i64),
    #[default]
    Unknown,
}

#[derive(Debug, Default, Clone, Copy)]
struct TargetHpState {
    current_hp: Option<u128>,
    max_hp: Option<u128>,
}

impl TargetHpState {
    fn from_attr_store(attr_store: &EntityAttrStore, target_uid: i64) -> Self {
        let current_hp = attr_store
            .attr(target_uid, AttrType::CurrentHp)
            .and_then(AttrValue::as_int)
            .and_then(|value| u128::try_from(value).ok());
        let max_hp = attr_store
            .attr(target_uid, AttrType::MaxHp)
            .and_then(AttrValue::as_int)
            .and_then(|value| u128::try_from(value).ok())
            .filter(|value| *value > 0);

        Self { current_hp, max_hp }
    }

    fn apply_damage(&mut self, hp_loss: u128, shield_loss: u128, fallback_damage: u128) {
        let hp_delta = if hp_loss > 0 {
            hp_loss
        } else if shield_loss == 0 {
            fallback_damage
        } else {
            0
        };

        if let (Some(current_hp), Some(max_hp)) = (&mut self.current_hp, self.max_hp) {
            *current_hp = (*current_hp).min(max_hp).saturating_sub(hp_delta);
        }
    }

    fn apply_heal(&mut self, raw_heal: u128) -> u128 {
        if let (Some(current_hp), Some(max_hp)) = (&mut self.current_hp, self.max_hp) {
            let clamped_current_hp = (*current_hp).min(max_hp);
            let missing_hp = max_hp.saturating_sub(clamped_current_hp);
            let effective_heal = raw_heal.min(missing_hp);
            *current_hp = clamped_current_hp
                .saturating_add(effective_heal)
                .min(max_hp);
            effective_heal
        } else {
            raw_heal
        }
    }
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

/// Decide whether a newly observed entity type should replace a cached one.
///
/// Entity type observations are not equally specific: `EntErrType` is an
/// unknown fallback, while `EntChar` and `EntMonster` are stable identities that
/// should not be downgraded or swapped by later UID-colliding observations.
pub(crate) fn should_overwrite_entity_type(existing: EEntityType, observed: EEntityType) -> bool {
    if existing == observed {
        return false;
    }

    if observed == EEntityType::EntErrType {
        return false;
    }

    if matches!(existing, EEntityType::EntChar | EEntityType::EntMonster) {
        return false;
    }

    true
}

#[derive(Debug, Clone)]
pub struct TeammateFantasyDetection {
    pub summon_uuid: i64,
    pub summoner_uuid: i64,
    pub monster_id: i32,
    pub remodel_level: i64,
}

#[derive(Debug, Default)]
pub struct SyncNearEntitiesProcessResult {
    pub initial_buff_snapshots: Vec<(i64, blueprotobuf::BuffInfoSync)>,
    pub teammate_fantasies: Vec<TeammateFantasyDetection>,
    pub disappeared: Vec<EntityUuid>,
}

fn has_resonance_fantasy_marker(buff_infos: Option<&blueprotobuf::BuffInfoSync>) -> bool {
    buff_infos.is_some_and(|sync| {
        sync.buff_infos
            .iter()
            .any(|buff| buff.base_id == Some(RESONANCE_FANTASY_MARKER_BUFF_ID))
    })
}

pub fn process_sync_near_entities(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    sync_near_entities: blueprotobuf::SyncNearEntities,
) -> Option<SyncNearEntitiesProcessResult> {
    let blueprotobuf::SyncNearEntities { appear, disappear } = sync_near_entities;
    let mut result = SyncNearEntitiesProcessResult {
        disappeared: Vec::with_capacity(disappear.len()),
        ..Default::default()
    };

    for pkt_entity in appear {
        let target_uuid = pkt_entity.uuid?;
        let initial_buff_infos = pkt_entity.buff_infos;
        let target_entity_type = pkt_entity
            .ent_type
            .and_then(|value| EEntityType::try_from(value).ok())
            .unwrap_or_else(|| EEntityType::from(target_uuid));
        let target_entity = match encounter.entity_uuid_to_entity.entry(target_uuid) {
            Entry::Occupied(mut entry) => {
                let existing_type = entry.get().entity_type;
                if should_overwrite_entity_type(existing_type, target_entity_type) {
                    entry.get_mut().entity_type = target_entity_type;
                } else if existing_type != target_entity_type {
                    info!(
                        target: "app::live",
                        "SyncNearEntities: blocked entity_type overwrite for uuid=0x{:x} uid={} from {:?} to {:?} (low16={})",
                        target_uuid,
                        uid_from_uuid(target_uuid),
                        existing_type,
                        target_entity_type,
                        target_uuid & 0xffff
                    );
                }
                entry.into_mut()
            }
            Entry::Vacant(entry) => entry.insert(Entity::new(target_uuid, target_entity_type)),
        };
        info!(
            target: "app::live",
            "SyncNearEntities: target_uuid={:?} target_entity_type={:?}",
            target_uuid,
            target_entity_type
        );

        let attr_collection = pkt_entity.attrs?;
        match target_entity_type {
            EEntityType::EntChar => {
                process_player_attrs(target_uuid, &attr_collection.attrs, attr_store);
            }
            EEntityType::EntMonster => {
                process_monster_attrs(
                    target_entity,
                    target_uuid,
                    &attr_collection.attrs,
                    attr_store,
                );
                if has_resonance_fantasy_marker(initial_buff_infos.as_ref()) {
                    if let Some(detection) = collect_teammate_fantasy_detection(
                        attr_store,
                        target_uuid,
                        attr_store.local_player_uuid(),
                    ) {
                        result.teammate_fantasies.push(detection);
                    }
                }
            }
            EEntityType::EntDummy | EEntityType::EntBullet | EEntityType::EntSceneObject => {
                process_mechanic_entity_attrs(
                    target_entity,
                    target_uuid,
                    &attr_collection.attrs,
                    attr_store,
                );
            }
            _ => {
                process_mechanic_entity_attrs(
                    target_entity,
                    target_uuid,
                    &attr_collection.attrs,
                    attr_store,
                );
            }
        }

        if let Some(buff_infos) = initial_buff_infos {
            result
                .initial_buff_snapshots
                .push((target_uuid, buff_infos));
        }
    }

    for disappear_entity in disappear {
        let Some(target_uuid) = disappear_entity.uuid else {
            continue;
        };
        let target_entity_type = encounter
            .entity_uuid_to_entity
            .get(&target_uuid)
            .map(|entity| entity.entity_type)
            .unwrap_or_else(|| EEntityType::from(target_uuid));

        if !matches!(
            target_entity_type,
            EEntityType::EntChar | EEntityType::EntMonster
        ) {
            encounter.entity_uuid_to_entity.remove(&target_uuid);
            attr_store.remove_entity(target_uuid);
        } else {
            attr_store.clear_transient_attrs(target_uuid);
        }

        result.disappeared.push(target_uuid);
    }

    // Track party members for wipe detection (collect data first to avoid borrow issues)
    Some(result)
}

fn collect_teammate_fantasy_detection(
    attr_store: &EntityAttrStore,
    target_uuid: i64,
    local_player_uuid: i64,
) -> Option<TeammateFantasyDetection> {
    let summoner_uuid = attr_store
        .attr(target_uuid, AttrType::TopSummonerId)
        .and_then(AttrValue::as_int)?;
    if summoner_uuid == 0 || summoner_uuid == local_player_uuid {
        return None;
    }

    let monster_id = attr_store
        .attr(target_uuid, AttrType::MonsterId)
        .and_then(AttrValue::as_int)
        .and_then(|value| i32::try_from(value).ok())?;
    if monster_id <= 0 {
        return None;
    }

    let remodel_level = attr_store
        .attr(target_uuid, AttrType::SkillRemodelLevel)
        .and_then(AttrValue::as_int)
        .unwrap_or(0);

    info!(
        target: "app::live",
        "CollectTeammateFantasyDetection: summon_uuid=0x{:x} summoner_uuid=0x{:x} monster_id={} remodel_level={}",
        target_uuid,
        summoner_uuid,
        monster_id,
        remodel_level
    );

    Some(TeammateFantasyDetection {
        summon_uuid: target_uuid,
        summoner_uuid,
        monster_id,
        remodel_level,
    })
}

pub fn process_sync_container_data(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    sync_container_data: &blueprotobuf::SyncContainerData,
) -> Option<SyncContainerProcessResult> {
    let v_data = sync_container_data.v_data.as_ref()?;
    let season_cultivate_line_data = v_data.season_cultivate_line_data.clone();
    let player_uid = v_data.char_id?;
    let player_uuid = canonical_player_uuid(player_uid);
    encounter.local_player_uuid = player_uuid;
    attr_store.set_local_uuid(player_uuid);

    let target_entity = encounter
        .entity_uuid_to_entity
        .entry(player_uuid)
        .or_insert_with(|| Entity::new(player_uuid, EEntityType::EntChar));
    let char_base = v_data.char_base.as_ref()?;
    let name = char_base.name.clone()?;
    target_entity.name = name;
    let _ = attr_store.set_attr(
        player_uuid,
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
        player_uuid,
        AttrType::ProfessionId,
        AttrValue::Int(target_entity.class_id as i64),
    );

    target_entity.ability_score = char_base.fight_point?;
    let _ = attr_store.set_attr(
        player_uuid,
        AttrType::FightPoint,
        AttrValue::Int(target_entity.ability_score as i64),
    );

    let role_level = v_data.role_level.as_ref()?;
    target_entity.level = role_level.level?;
    let _ = attr_store.set_attr(
        player_uuid,
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

    Some(SyncContainerProcessResult {
        season_cultivate_line_data,
    })
}

#[derive(Debug, Clone, Default)]
pub struct SyncContainerProcessResult {
    pub season_cultivate_line_data: Option<blueprotobuf::SeasonCultivateLineData>,
}

pub fn process_sync_container_dirty_data<'a>(
    _encounter: &mut Encounter,
    sync_container_dirty_data: &'a blueprotobuf::SyncContainerDirtyData,
) -> Option<SyncContainerDirtyProcessResult<'a>> {
    // SyncContainerDirtyData.v_data is a BufferStream (raw bytes)
    // Incremental attribute updates come through process_player_attrs via AoiSyncDelta
    // which handles attr packets with proper typing
    Some(SyncContainerDirtyProcessResult {
        season_cultivate_dirty_bytes: sync_container_dirty_data
            .v_data
            .as_ref()
            .and_then(|v_data| v_data.buffer.as_deref()),
    })
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SyncContainerDirtyProcessResult<'a> {
    pub season_cultivate_dirty_bytes: Option<&'a [u8]>,
}

pub fn process_sync_dungeon_data(
    battle_state: &mut BattleStateMachine,
    sync_dungeon_data: blueprotobuf::SyncDungeonData,
    encounter_has_stats: bool,
) -> DungeonProcessResult {
    let mut reset_reason = None;
    let mut entered_playing = false;
    info!(
        target: "app::live",
        "Processing SyncDungeonData (encounter_has_stats={})",
        encounter_has_stats
    );
    if let Some(v_data) = sync_dungeon_data.v_data {
        if let Some(flow_info) = v_data.flow_info {
            if let Some(state) = flow_info.state {
                info!(target: "app::live", "SyncDungeonData flow_info.state={}", state);
                entered_playing |= battle_state.record_dungeon_flow_state(state);
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
    DungeonProcessResult {
        reset_reason,
        entered_playing,
    }
}

pub fn process_sync_dungeon_dirty_data(
    battle_state: &mut BattleStateMachine,
    sync_dungeon_dirty_data: blueprotobuf::SyncDungeonDirtyData,
    encounter_has_stats: bool,
) -> DungeonProcessResult {
    info!(
        target: "app::live",
        "Processing SyncDungeonDirtyData (encounter_has_stats={})",
        encounter_has_stats
    );
    let Some(v_data) = sync_dungeon_dirty_data.v_data else {
        warn!(target: "app::live", "SyncDungeonDirtyData missing v_data");
        return DungeonProcessResult::default();
    };
    let Some(bytes) = v_data.buffer else {
        warn!(target: "app::live", "SyncDungeonDirtyData missing buffer");
        return DungeonProcessResult::default();
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
                return DungeonProcessResult::default();
            }
        };

    let mut reset_reason = None;
    let mut entered_playing = false;
    if let Some(state) = dirty_sync.flow_state {
        info!(
            target: "app::live",
            "SyncDungeonDirtyData flow_info.state={}",
            state
        );
        entered_playing |= battle_state.record_dungeon_flow_state(state);
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
    DungeonProcessResult {
        reset_reason,
        entered_playing,
    }
}

pub fn process_sync_to_me_delta_info(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    sync_to_me_delta_info: blueprotobuf::SyncToMeDeltaInfo,
    monitored_panel_attr_ids: &[i32],
    combat_gate: CombatGate,
) -> SyncToMeDeltaResult {
    use crate::live::opcodes_models::attr_type::{ATTR_FIGHT_RESOURCES, ATTR_SKILL_ID};

    let mut result = SyncToMeDeltaResult::default();
    let delta_info = match sync_to_me_delta_info.delta_info {
        Some(info) => info,
        None => {
            // This is normal during gameplay - packet may not always contain delta_info
            return result;
        }
    };

    if let Some(uuid) = delta_info.uuid {
        encounter.local_player_uuid = uuid;
        attr_store.set_local_uuid(uuid);
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
            result.attr_skill_id = attrs_collection
                .attrs
                .iter()
                .find(|attr| attr.id == Some(ATTR_SKILL_ID))
                .and_then(decode_single_attr_i32)
                .filter(|skill_id| *skill_id > 0);
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
        if let Some((damage_events, damage_taken_events)) =
            process_aoi_sync_delta(encounter, attr_store, base_delta, combat_gate, true)
        {
            result.local_damage_events = damage_events;
            result.local_damage_taken_events = damage_taken_events;
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
                if let Some(uuid) = player_ent.uuid {
                    process_player_attrs(uuid, &attrs.attrs, attr_store);
                }
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
    // Note: this function always scans attrs to decode ATTR_SHIELD_DISPLAY (60050)
    // for the shield detail overlay, regardless of whether any panel attrs are
    // monitored. Do not early-return when `monitored_panel_attr_ids` is empty.
    for attr in &attrs.attrs {
        let Some(attr_id) = attr.id else {
            continue;
        };
        // attr 60050 is decoded into shield detail entries for the shield detail overlay.
        // It is not exposed as a regular panel attr; see ShieldDetailGroup.svelte.
        if attr_id == ATTR_SHIELD_DISPLAY {
            let detail_entries = match attr.raw_data.as_deref() {
                Some(raw) => decode_shield_detail_entries(raw),
                None => Vec::new(),
            };
            attr_store.set_shield_detail(detail_entries);
            continue;
        }
        if !monitored_panel_attr_ids.contains(&attr_id) {
            continue;
        }
        let Some(value) = decode_single_attr_i32(attr) else {
            continue;
        };
        let _ = attr_store.set_panel_attr(attr_id, value);
    }
}

/// Apply one taken-damage event to a per-skill `Skill` accumulator.
///
/// Used for both the combined per-skill map and the per-source (per attacking
/// monster template) map so the two stay in sync. Entity-level `taken` totals
/// are accumulated separately by the caller so they are counted exactly once.
#[allow(clippy::too_many_arguments)]
fn apply_taken_skill_delta(
    skill: &mut Skill,
    effective_value: u128,
    is_crit: bool,
    is_lucky_bonus_only: bool,
    is_attacked_lucky_trigger: bool,
    is_block: bool,
    property: Option<i32>,
    damage_mode: Option<i32>,
) {
    if skill.property.is_none() {
        skill.property = property;
    }
    if skill.damage_mode.is_none() {
        skill.damage_mode = damage_mode;
    }
    if is_crit {
        skill.crit_hits += 1;
        skill.crit_total_value += effective_value;
    }
    if !is_lucky_bonus_only {
        skill.trigger_hits += 1;
        if is_attacked_lucky_trigger {
            skill.lucky_hits += 1;
        }
        if is_block {
            skill.block_hits += 1;
            if is_attacked_lucky_trigger {
                skill.lucky_block_hits += 1;
            }
        }
    } else {
        skill.lucky_total_value += effective_value;
    }
    skill.hits += 1;
    skill.total_value += effective_value;
}

pub fn process_aoi_sync_delta(
    encounter: &mut Encounter,
    attr_store: &mut EntityAttrStore,
    aoi_sync_delta: blueprotobuf::AoiSyncDelta,
    combat_gate: CombatGate,
    collect_taken: bool,
) -> Option<(Vec<LocalDamageEvent>, Vec<LocalDamageTakenEvent>)> {
    let target_uuid = aoi_sync_delta.uuid?;
    let allow_combat = match combat_gate {
        CombatGate::AllowAll => true,
        CombatGate::Only(locked_target_uuid) => locked_target_uuid == target_uuid,
        CombatGate::BlockAll => false,
    };

    // Process attributes
    let target_entity_type = encounter
        .entity_uuid_to_entity
        .get(&target_uuid)
        .map(|entity| entity.entity_type)
        .filter(|entity_type| *entity_type != EEntityType::EntErrType)
        .unwrap_or_else(|| EEntityType::from(target_uuid));
    let mut target_entity = encounter
        .entity_uuid_to_entity
        .entry(target_uuid)
        .or_insert_with(|| Entity::new(target_uuid, target_entity_type));

    if let Some(attrs_collection) = aoi_sync_delta.attrs.as_ref() {
        match target_entity_type {
            EEntityType::EntChar => {
                process_player_attrs(target_uuid, &attrs_collection.attrs, attr_store);
            }
            EEntityType::EntMonster => {
                process_monster_attrs(
                    &mut target_entity,
                    target_uuid,
                    &attrs_collection.attrs,
                    attr_store,
                );
            }
            EEntityType::EntDummy | EEntityType::EntBullet | EEntityType::EntSceneObject => {
                process_mechanic_entity_attrs(
                    &mut target_entity,
                    target_uuid,
                    &attrs_collection.attrs,
                    attr_store,
                );
            }
            _ => {
                process_mechanic_entity_attrs(
                    &mut target_entity,
                    target_uuid,
                    &attrs_collection.attrs,
                    attr_store,
                );
            }
        }
    }

    let Some(skill_effect) = aoi_sync_delta.skill_effects else {
        return Some((Vec::new(), Vec::new())); // return ok since this variable usually doesn't exist
    };

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut target_hp_state = TargetHpState::from_attr_store(attr_store, target_uuid);
    let mut local_damage_events = Vec::new();
    let mut local_damage_taken_events = Vec::new();
    let mut had_player_damage = false;
    let mut had_allowed_combat = false;
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
        let hp_loss_value = sync_damage_info.hp_lessen_value.unwrap_or(0).max(0) as u128;
        let shield_loss_value = sync_damage_info.shield_lessen_value.unwrap_or(0).max(0) as u128;
        let is_heal = sync_damage_info.r#type.unwrap_or(0) == EDamageType::Heal as i32;
        let effective_heal_value = if allow_combat && is_heal {
            target_hp_state.apply_heal(actual_value)
        } else {
            0
        };

        let attacker_uuid = sync_damage_info
            .top_summoner_id
            .or(sync_damage_info.attacker_uuid);

        // Local copies of fields needed later (avoid holding map borrows across operations)
        let Some(owner_id) = sync_damage_info.owner_id else {
            continue;
        };
        let damage_id = damage_id::compute_damage_id(
            sync_damage_info.damage_source,
            owner_id,
            sync_damage_info.owner_level,
            sync_damage_info.hit_event_id,
        );
        let skill_key = damage_id;
        let flag = sync_damage_info.type_flag.unwrap_or_default();
        if attacker_uuid == Some(encounter.local_player_uuid) {
            local_damage_events.push(LocalDamageEvent {
                skill_key,
                target_entity_uuid: target_uuid,
                type_flag: flag,
            });
        }
        if collect_taken && target_uuid == encounter.local_player_uuid && !is_heal {
            local_damage_taken_events.push(LocalDamageTakenEvent {
                skill_key,
                source: attacker_uuid.map_or(DamageTakenSource::Unknown, DamageTakenSource::Entity),
                type_flag: flag,
            });
        }
        // Pre-calculate whether this target is recognized as a boss and local player id
        let is_boss_target = encounter
            .entity_uuid_to_entity
            .get(&target_uuid)
            .map(|e| e.is_boss())
            .unwrap_or(false);

        let target_monster_id = encounter
            .entity_uuid_to_entity
            .get(&target_uuid)
            .and_then(|entity| entity.monster_type_id);

        let is_lucky_bonus_only = non_lucky_dmg.is_none() && lucky_value.is_some();
        let is_attacker_lucky_trigger = (flag & damage_type_flag::ATTACKER_LUCK) != 0;
        let is_attacked_lucky_trigger = (flag & damage_type_flag::ATTACKED_LUCK) != 0;
        let is_block = (flag & damage_type_flag::BLOCK) != 0;
        let is_crit = (flag & damage_type_flag::CRIT) != 0;
        let mut was_heal_event = is_heal;
        let mut attacker_entity_type = None;

        // First update attacker-side state in its own scope (single mutable borrow).
        // Unknown-source hits are intentionally limited to defender-side taken stats.
        if let Some(attacker_uuid) = attacker_uuid {
            let attacker_entity = encounter
                .entity_uuid_to_entity
                .entry(attacker_uuid)
                .or_insert_with(|| Entity::new(attacker_uuid, EEntityType::from(attacker_uuid)));

            let determined_spec = get_class_spec_from_skill_id(owner_id);
            if determined_spec != ClassSpec::Unknown {
                attacker_entity.class_id = get_class_id_from_spec(determined_spec);
                attacker_entity.class_spec = determined_spec;
            }

            if !allow_combat {
                attacker_entity_type = Some(attacker_entity.entity_type);
                was_heal_event = is_heal;
            } else if is_heal {
                had_allowed_combat = true;

                let skill = attacker_entity
                    .skill_uid_to_heal_skill
                    .entry(skill_key)
                    .or_insert_with(|| Skill::default());
                if is_crit {
                    attacker_entity.healing.crit_hits += 1;
                    attacker_entity.healing.crit_total += actual_value;
                    skill.crit_hits += 1;
                    skill.crit_total_value += actual_value;
                }
                if !is_lucky_bonus_only {
                    attacker_entity.healing.trigger_hits += 1;
                    skill.trigger_hits += 1;
                    if is_attacker_lucky_trigger {
                        attacker_entity.healing.lucky_hits += 1;
                        skill.lucky_hits += 1;
                    }
                } else {
                    attacker_entity.healing.lucky_total += actual_value;
                    skill.lucky_total_value += actual_value;
                }
                encounter.total_heal += actual_value;
                encounter.total_effective_heal += effective_heal_value;
                attacker_entity.healing.hits += 1;
                attacker_entity.healing.total += actual_value;
                attacker_entity.healing.effective_total += effective_heal_value;
                skill.hits += 1;
                skill.total_value += actual_value;
                skill.effective_total_value += effective_heal_value;

                // Track per-skill per-target stats for healing
                let key = (skill_key, target_uuid);
                let stats = attacker_entity.skill_heal_to_target.entry(key).or_default();

                stats.hits += 1;
                stats.total_value += actual_value;
                stats.effective_total_value += effective_heal_value;
                if is_crit {
                    stats.crit_hits += 1;
                    stats.crit_total += actual_value;
                }
                if !is_lucky_bonus_only {
                    stats.trigger_hits += 1;
                    if is_attacker_lucky_trigger {
                        stats.lucky_hits += 1;
                    }
                } else {
                    stats.lucky_total += actual_value;
                }
                stats.hp_loss_total = 0;
                stats.shield_loss_total = 0;
                if stats.target_monster_id.is_none() {
                    stats.target_monster_id = target_monster_id;
                }

                attacker_entity_type = Some(attacker_entity.entity_type);
                was_heal_event = true;
            } else {
                had_allowed_combat = true;
                let skill = attacker_entity
                    .skill_uid_to_dmg_skill
                    .entry(skill_key)
                    .or_insert_with(|| Skill::default());
                if is_crit {
                    attacker_entity.damage.crit_hits += 1;
                    attacker_entity.damage.crit_total += actual_value;
                    skill.crit_hits += 1;
                    skill.crit_total_value += actual_value;
                }
                if !is_lucky_bonus_only {
                    attacker_entity.damage.trigger_hits += 1;
                    skill.trigger_hits += 1;
                    if is_attacker_lucky_trigger {
                        attacker_entity.damage.lucky_hits += 1;
                        skill.lucky_hits += 1;
                    }
                } else {
                    attacker_entity.damage.lucky_total += actual_value;
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
                    if is_crit {
                        attacker_entity.damage_boss_only.crit_hits += 1;
                        attacker_entity.damage_boss_only.crit_total += actual_value;
                    }
                    if !is_lucky_bonus_only {
                        attacker_entity.damage_boss_only.trigger_hits += 1;
                        if is_attacker_lucky_trigger {
                            attacker_entity.damage_boss_only.lucky_hits += 1;
                        }
                    } else {
                        attacker_entity.damage_boss_only.lucky_total += actual_value;
                    }
                    if attacker_entity.entity_type == EEntityType::EntChar {
                        encounter.total_dmg_boss_only += actual_value;
                    }
                    attacker_entity.damage_boss_only.hits += 1;
                    attacker_entity.damage_boss_only.total += actual_value;
                }

                // Track per-target totals
                use std::collections::hash_map::Entry;
                match attacker_entity.dmg_to_target.entry(target_uuid) {
                    Entry::Occupied(mut e) => {
                        *e.get_mut() += actual_value;
                    }
                    Entry::Vacant(e) => {
                        e.insert(actual_value);
                    }
                }

                // Track per-skill per-target stats
                let key = (skill_key, target_uuid);
                let stats = attacker_entity.skill_dmg_to_target.entry(key).or_default();

                stats.hits += 1;
                stats.total_value += actual_value;
                if is_crit {
                    stats.crit_hits += 1;
                    stats.crit_total += actual_value;
                }
                if !is_lucky_bonus_only {
                    stats.trigger_hits += 1;
                    if is_attacker_lucky_trigger {
                        stats.lucky_hits += 1;
                    }
                } else {
                    stats.lucky_total += actual_value;
                }

                stats.hp_loss_total += hp_loss_value;
                stats.shield_loss_total += shield_loss_value;

                if stats.target_monster_id.is_none() {
                    stats.target_monster_id = target_monster_id;
                }

                attacker_entity_type = Some(attacker_entity.entity_type);
                was_heal_event = false;
            }
        } else if allow_combat && !is_heal {
            had_allowed_combat = true;
        }

        if allow_combat && !was_heal_event && attacker_entity_type == Some(EEntityType::EntChar) {
            had_player_damage = true;
        }

        if allow_combat && !was_heal_event {
            target_hp_state.apply_damage(hp_loss_value, shield_loss_value, actual_value);
        }

        // Track damage taken when a non-player attacks the defender.
        if allow_combat && !was_heal_event {
            let effective_value = if hp_loss_value + shield_loss_value > 0 {
                hp_loss_value + shield_loss_value
            } else {
                actual_value
            };

            // Snapshot attacker's monster_type_id before mutably borrowing defender_entity,
            // so the death-replay window can surface it without needing a second lookup.
            let attacker_monster_type_id = attacker_uuid.and_then(|attacker_uuid| {
                encounter
                    .entity_uuid_to_entity
                    .get(&attacker_uuid)
                    .and_then(|e| e.monster_type_id)
            });

            let defender_entity = encounter
                .entity_uuid_to_entity
                .entry(target_uuid)
                .or_insert_with(|| Entity::new(target_uuid, EEntityType::from(target_uuid)));

            if attacker_entity_type != Some(EEntityType::EntChar) {
                // Entity-level taken totals (counted exactly once per event).
                if is_crit {
                    defender_entity.taken.crit_hits += 1;
                    defender_entity.taken.crit_total += effective_value;
                }
                if !is_lucky_bonus_only {
                    defender_entity.taken.trigger_hits += 1;
                    if is_attacked_lucky_trigger {
                        defender_entity.taken.lucky_hits += 1;
                    }
                    if is_block {
                        defender_entity.taken.block_hits += 1;
                        if is_attacked_lucky_trigger {
                            defender_entity.taken.lucky_block_hits += 1;
                        }
                    }
                } else {
                    defender_entity.taken.lucky_total += effective_value;
                }
                defender_entity.taken.hits += 1;
                defender_entity.taken.total += effective_value;

                // Combined per-skill taken (all attackers merged).
                let taken_skill = defender_entity
                    .skill_uid_to_taken_skill
                    .entry(skill_key)
                    .or_default();
                apply_taken_skill_delta(
                    taken_skill,
                    effective_value,
                    is_crit,
                    is_lucky_bonus_only,
                    is_attacked_lucky_trigger,
                    is_block,
                    sync_damage_info.property,
                    sync_damage_info.damage_mode,
                );

                // Per-source taken (grouped by attacking monster template; 0 = unknown).
                let source_skill = defender_entity
                    .skill_taken_from_source
                    .entry((skill_key, attacker_monster_type_id.unwrap_or(0)))
                    .or_default();
                apply_taken_skill_delta(
                    source_skill,
                    effective_value,
                    is_crit,
                    is_lucky_bonus_only,
                    is_attacked_lucky_trigger,
                    is_block,
                    sync_damage_info.property,
                    sync_damage_info.damage_mode,
                );

                // Maintain a 2s sliding window of recent damage taken for death replay.
                const REPLAY_WINDOW_MS: u128 = 2000;
                while defender_entity
                    .recent_taken_events
                    .front()
                    .is_some_and(|ev| {
                        timestamp_ms.saturating_sub(ev.timestamp_ms) > REPLAY_WINDOW_MS
                    })
                {
                    defender_entity.recent_taken_events.pop_front();
                }
                defender_entity
                    .recent_taken_events
                    .push_back(DamageSnapshot {
                        timestamp_ms,
                        attacker_entity_uuid: attacker_uuid,
                        attacker_monster_type_id,
                        skill_key,
                        value: actual_value,
                    });
            }
        }
    }

    if had_player_damage {
        update_active_damage_time(encounter, timestamp_ms);
    }

    if had_allowed_combat {
        if encounter.time_fight_start_ms == Default::default() {
            encounter.time_fight_start_ms = timestamp_ms;
        }

        encounter.time_last_combat_packet_ms = timestamp_ms;
    }
    Some((local_damage_events, local_damage_taken_events))
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
            entity_uuid: entry.uuid.to_string(),
            hate_val: entry.hate_val,
        });
    }

    Some(())
}

fn decode_varint_i64_or_default(raw: Option<&[u8]>) -> i64 {
    raw.and_then(decode_varint_i64).unwrap_or(0)
}

/// Decodes attr 60050 shield display data into individual entries.
/// Each entry: field 1=buff_uuid, field 2=display_type, field 3=current, field 4=initial_shield (shield when buff applied), field 5=max_shield.
fn decode_shield_detail_entries(raw: &[u8]) -> Vec<ShieldDetailEntry> {
    let mut buf = raw;
    let mut entries = Vec::new();
    while buf.has_remaining() {
        let Some(tag) = prost::encoding::decode_varint(&mut buf).ok() else {
            break;
        };
        if tag != 0x0A {
            break;
        }
        let Some(entry_len) = prost::encoding::decode_varint(&mut buf)
            .ok()
            .map(|v| v as usize)
        else {
            break;
        };
        if buf.remaining() < entry_len {
            break;
        }
        let entry_bytes = &buf[..entry_len];
        buf.advance(entry_len);

        let mut entry_buf = entry_bytes;
        let mut buff_uuid: i64 = 0;
        let mut display_type: i32 = 0;
        let mut current: i64 = 0;
        let mut initial_shield: i64 = 0;
        let mut max_shield: i64 = 0;

        while entry_buf.has_remaining() {
            let Some(field_tag) = prost::encoding::decode_varint(&mut entry_buf).ok() else {
                break;
            };
            let field_num = field_tag >> 3;
            let wire_type = field_tag & 0x07;
            if wire_type != 0 {
                break;
            }
            let Some(val) = prost::encoding::decode_varint(&mut entry_buf).ok() else {
                break;
            };
            match field_num {
                1 => buff_uuid = val as i64,
                2 => display_type = val as i32,
                3 => current = val as i64,
                4 => initial_shield = val as i64,
                5 => max_shield = val as i64,
                _ => {}
            }
        }

        entries.push(ShieldDetailEntry {
            buff_uuid,
            display_type,
            current,
            initial_shield,
            max_shield,
            base_id: 0,
            expire_time_ms: 0,
        });
    }
    entries
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

fn decode_position_attr(raw: Option<&[u8]>) -> Option<PositionAttr> {
    let position = blueprotobuf::Position::decode(raw?).ok()?;
    Some(PositionAttr {
        x: position.x?,
        y: position.y?,
        z: position.z?,
    })
}

fn process_player_attrs(target_uuid: i64, attrs: &[Attr], attr_store: &mut EntityAttrStore) {
    for attr in attrs {
        let Some(attr_id) = attr.id else { continue };
        let raw_bytes_opt = attr.raw_data.as_deref();

        if attr_id == attr_type::ATTR_FIGHT_RESOURCE_IDS {
            if let Some(ids) = raw_bytes_opt.and_then(parse_fight_resources).map(|values| {
                values
                    .into_iter()
                    .filter_map(|value| i32::try_from(value).ok())
                    .collect::<Vec<_>>()
            }) {
                let _ = attr_store.set_fight_resource_ids(target_uuid, ids);
            }
            continue;
        }

        if attr_id == attr_type::ATTR_FIGHT_RESOURCES {
            if let Some(values) = raw_bytes_opt.and_then(parse_fight_resources) {
                log::debug!(
                    "Decoded ATTR_FIGHT_RESOURCES for entity UUID {}: {:?}",
                    target_uuid,
                    values
                );
            }
            continue;
        }

        // Decode shield display (attr 60050) for all players, store total shield as CurrentShield
        if attr_id == ATTR_SHIELD_DISPLAY {
            let total_shield = raw_bytes_opt
                .map(|raw| {
                    decode_shield_detail_entries(raw)
                        .iter()
                        .map(|e| e.current)
                        .sum::<i64>()
                })
                .unwrap_or(0);
            attr_store.set_attr(
                target_uuid,
                AttrType::CurrentShield,
                AttrValue::Int(total_shield),
            );
            continue;
        }

        if attr_id == attr_type::ATTR_POS {
            if let Some(position) = decode_position_attr(raw_bytes_opt) {
                let _ = attr_store.set_attr(
                    target_uuid,
                    AttrType::Position,
                    AttrValue::Position(position),
                );
            }
            continue;
        }

        let decoded = if attr_id == attr_type::ATTR_NAME {
            let name = decode_prefixed_string_or_default(raw_bytes_opt);
            if !name.is_empty() {
                info!("Found player {} with entity UUID {}", name, target_uuid);
            }
            Some((AttrType::Name, AttrValue::String(name)))
        } else if let Some(attr_type) = AttrType::from_id(attr_id) {
            let value = decode_varint_i64_or_default(raw_bytes_opt);
            Some((attr_type, AttrValue::Int(value)))
        } else {
            raw_bytes_opt.and_then(|raw_bytes| decode_unknown_attr_value(attr_id, raw_bytes))
        };

        if let Some((attr_type, value)) = decoded {
            attr_store.set_attr(target_uuid, attr_type, value);
        }
    }
}

fn process_mechanic_entity_attrs(
    target_entity: &mut Entity,
    target_uuid: i64,
    attrs: &[Attr],
    attr_store: &mut EntityAttrStore,
) {
    let packet_monster_id = attrs.iter().find_map(|attr| {
        (attr.id == Some(attr_type::ATTR_ID))
            .then(|| decode_varint_i64_or_default(attr.raw_data.as_deref()))
            .and_then(|id| i32::try_from(id).ok())
            .filter(|id| *id > 0)
    });

    for attr in attrs {
        let Some(attr_id) = attr.id else { continue };
        let raw_bytes_opt = attr.raw_data.as_deref();

        if attr_id == attr_type::ATTR_ID {
            if let Some(monster_id) = packet_monster_id {
                target_entity.set_monster_type(monster_id);
                let _ = attr_store.set_attr(
                    target_uuid,
                    AttrType::MonsterId,
                    AttrValue::Int(i64::from(monster_id)),
                );
            }
            continue;
        }

        if attr_id == attr_type::ATTR_NAME {
            continue;
        }

        if attr_id == attr_type::ATTR_HATE_LIST {
            let hate_list = attr_store.hate_list_mut(target_uuid);
            if let Some(raw) = raw_bytes_opt {
                let _ = parse_hate_list_into(raw, hate_list);
            } else {
                hate_list.clear();
            }
            continue;
        }

        if attr_id == attr_type::ATTR_POS {
            if let Some(position) = decode_position_attr(raw_bytes_opt) {
                let _ = attr_store.set_attr(
                    target_uuid,
                    AttrType::Position,
                    AttrValue::Position(position),
                );
            }
            continue;
        }

        if let Some(attr_type) = AttrType::from_id(attr_id) {
            let value = decode_varint_i64_or_default(raw_bytes_opt);
            if attr_type == AttrType::SkillId
                && let Ok(skill_id) = i32::try_from(value)
                && skill_id > 0
            {
                // Record every positive server report; relevance and scene
                // filtering happen once, downstream in the state layer.
                attr_store.push_skill_cast(target_uuid, skill_id);
            }
            let _ = attr_store.set_attr(target_uuid, attr_type, AttrValue::Int(value));
        }
    }
}

fn process_monster_attrs(
    monster_entity: &mut Entity,
    target_uuid: i64,
    attrs: &[Attr],
    attr_store: &mut EntityAttrStore,
) {
    process_mechanic_entity_attrs(monster_entity, target_uuid, attrs, attr_store);
}
