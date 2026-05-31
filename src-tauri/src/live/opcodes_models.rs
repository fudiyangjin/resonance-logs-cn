use crate::live::commands_models::{DamageSnapshot, DeathRecord};
use crate::live::monster_registry::{self, MonsterType};
use crate::live::opcodes_models::class::ClassSpec;
use blueprotobuf_lib::blueprotobuf::{EEntityType, SyncContainerData};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use tokio::sync::RwLock;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Encounter {
    pub is_encounter_paused: bool,
    pub time_last_combat_packet_ms: u128, // in ms
    pub time_fight_start_ms: u128,        // in ms
    /// Accumulated active combat time in milliseconds for global True DPS.
    pub active_combat_time_ms: u128,
    /// Timestamp of the last damage event used to compute global active time.
    pub last_combat_timestamp_ms: Option<u128>,
    pub total_dmg: u128,
    pub total_dmg_boss_only: u128,
    pub total_heal: u128,
    pub total_effective_heal: u128,
    pub local_player_uid: i64,
    pub entity_uid_to_entity: HashMap<i64, Entity>, // key: entity uid
    pub local_player: SyncContainerData,
    pub current_scene_id: Option<i32>,
    pub current_scene_name: Option<String>,
    pub current_dungeon_difficulty: Option<i32>,
}

// Use an async-aware RwLock so readers don't block the tokio runtime threads.
#[allow(dead_code)]
pub type EncounterMutex = RwLock<Encounter>;

/// Flexible attribute value storage supporting various data types from packet attributes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AttrValue {
    Int(i64),
    Float(f64),
    String(String),
    Bool(bool),
    Position(PositionAttr),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PositionAttr {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Player attribute types from Blue Protocol packets.
///
/// These represent all known attribute IDs that can be extracted from player sync data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AttrType {
    Name,
    MonsterId,
    ActorState,
    GuildId,
    AttackPower,
    DefensePower,
    Position,
    GearTier,
    BaseStrength,
    MoveType,
    SkillId,
    ResurrectionCount,
    Endurance,
    CombatMode,
    CharacterTimestamp,
    PartyRole,
    SessionTimestamp,
    CombatState,
    LastActionTimestamp,
    MovementSpeed,
    EquipmentSlot1,
    EquipmentSlot2,
    TalentSpec,
    EliteStatus,
    ProfessionId,
    BuffSlot3,
    PvpRank,
    TotalPower,
    PhysicalAttack,
    MagicAttack,
    WeaponType,
    MountStatus,
    MountTimestamp,
    MountSpeed,
    MountDuration,
    FightPoint,
    SeasonStrength,
    SkillCd,
    SkillCdPct,
    CdAcceleratePct,
    Level,
    RankLevel,
    Crit,
    Lucky,
    CurrentHp,
    MaxHp,
    MaxMp,
    Stamina,
    CurrentShield,
    MinEnergy,
    MaxEnergy,
    EnergyRegen,
    Haste,
    Mastery,
    PhysicalPenetration,
    MagicPenetration,
    ElementalRes1,
    ElementalRes2,
    ElementalRes3,
    ElementFlag,
    EnergyFlag,
    ReductionLevel,
    BuffSlot,
    BuffSlot2,
    /// Unknown attribute ID with raw packet ID
    Unknown(i32),
}

impl AttrType {
    /// Convert packet attribute ID to AttrType enum.
    #[allow(dead_code)]
    pub fn from_id(id: i32) -> Option<Self> {
        match id {
            attr_type::ATTR_NAME => Some(AttrType::Name),
            attr_type::ATTR_ID => Some(AttrType::MonsterId),
            attr_type::ATTR_ACTOR_STATE => Some(AttrType::ActorState),
            attr_type::ATTR_GUILD_ID => Some(AttrType::GuildId),
            attr_type::ATTR_ATTACK_POWER => Some(AttrType::AttackPower),
            attr_type::ATTR_DEFENSE_POWER => Some(AttrType::DefensePower),
            attr_type::ATTR_POS => Some(AttrType::Position),
            attr_type::ATTR_GEAR_TIER => Some(AttrType::GearTier),
            attr_type::ATTR_BASE_STRENGTH => Some(AttrType::BaseStrength),
            attr_type::ATTR_MOVE_TYPE => Some(AttrType::MoveType),
            attr_type::ATTR_SKILL_ID => Some(AttrType::SkillId),
            attr_type::ATTR_RESURRECTION_COUNT => Some(AttrType::ResurrectionCount),
            attr_type::ATTR_ENDURANCE => Some(AttrType::Endurance),
            attr_type::ATTR_COMBAT_MODE => Some(AttrType::CombatMode),
            attr_type::ATTR_CHARACTER_TIMESTAMP => Some(AttrType::CharacterTimestamp),
            attr_type::ATTR_PARTY_ROLE => Some(AttrType::PartyRole),
            attr_type::ATTR_SESSION_TIMESTAMP => Some(AttrType::SessionTimestamp),
            attr_type::ATTR_COMBAT_STATE => Some(AttrType::CombatState),
            attr_type::ATTR_LAST_ACTION_TIMESTAMP => Some(AttrType::LastActionTimestamp),
            attr_type::ATTR_MOVEMENT_SPEED => Some(AttrType::MovementSpeed),
            attr_type::ATTR_EQUIPMENT_SLOT_1 => Some(AttrType::EquipmentSlot1),
            attr_type::ATTR_EQUIPMENT_SLOT_2 => Some(AttrType::EquipmentSlot2),
            attr_type::ATTR_TALENT_SPEC => Some(AttrType::TalentSpec),
            attr_type::ATTR_ELITE_STATUS => Some(AttrType::EliteStatus),
            attr_type::ATTR_PROFESSION_ID => Some(AttrType::ProfessionId),
            attr_type::ATTR_BUFF_SLOT_3 => Some(AttrType::BuffSlot3),
            attr_type::ATTR_PVP_RANK => Some(AttrType::PvpRank),
            attr_type::ATTR_TOTAL_POWER => Some(AttrType::TotalPower),
            attr_type::ATTR_PHYSICAL_ATTACK => Some(AttrType::PhysicalAttack),
            attr_type::ATTR_MAGIC_ATTACK => Some(AttrType::MagicAttack),
            attr_type::ATTR_WEAPON_TYPE => Some(AttrType::WeaponType),
            attr_type::ATTR_MOUNT_STATUS => Some(AttrType::MountStatus),
            attr_type::ATTR_MOUNT_TIMESTAMP => Some(AttrType::MountTimestamp),
            attr_type::ATTR_MOUNT_SPEED => Some(AttrType::MountSpeed),
            attr_type::ATTR_MOUNT_DURATION => Some(AttrType::MountDuration),
            attr_type::ATTR_FIGHT_POINT => Some(AttrType::FightPoint),
            attr_type::ATTR_SEASON_STRENGTH => Some(AttrType::SeasonStrength),
            attr_type::ATTR_SKILL_CD => Some(AttrType::SkillCd),
            attr_type::ATTR_SKILL_CD_PCT => Some(AttrType::SkillCdPct),
            attr_type::ATTR_CD_ACCELERATE_PCT => Some(AttrType::CdAcceleratePct),
            attr_type::ATTR_LEVEL => Some(AttrType::Level),
            attr_type::ATTR_RANK_LEVEL => Some(AttrType::RankLevel),
            attr_type::ATTR_CRIT => Some(AttrType::Crit),
            attr_type::ATTR_LUCKY => Some(AttrType::Lucky),
            attr_type::ATTR_CURRENT_HP => Some(AttrType::CurrentHp),
            attr_type::ATTR_MAX_HP => Some(AttrType::MaxHp),
            attr_type::ATTR_MAX_MP => Some(AttrType::MaxMp),
            attr_type::ATTR_STAMINA => Some(AttrType::Stamina),
            attr_type::ATTR_CURRENT_SHIELD => Some(AttrType::CurrentShield),
            attr_type::ATTR_MIN_ENERGY => Some(AttrType::MinEnergy),
            attr_type::ATTR_MAX_ENERGY => Some(AttrType::MaxEnergy),
            attr_type::ATTR_ENERGY_REGEN => Some(AttrType::EnergyRegen),
            attr_type::ATTR_HASTE => Some(AttrType::Haste),
            attr_type::ATTR_MASTERY => Some(AttrType::Mastery),
            attr_type::ATTR_PHYSICAL_PENETRATION => Some(AttrType::PhysicalPenetration),
            attr_type::ATTR_MAGIC_PENETRATION => Some(AttrType::MagicPenetration),
            attr_type::ATTR_ELEMENTAL_RES_1 => Some(AttrType::ElementalRes1),
            attr_type::ATTR_ELEMENTAL_RES_2 => Some(AttrType::ElementalRes2),
            attr_type::ATTR_ELEMENTAL_RES_3 => Some(AttrType::ElementalRes3),
            attr_type::ATTR_ELEMENT_FLAG => Some(AttrType::ElementFlag),
            attr_type::ATTR_ENERGY_FLAG => Some(AttrType::EnergyFlag),
            attr_type::ATTR_REDUCTION_LEVEL => Some(AttrType::ReductionLevel),
            attr_type::ATTR_BUFF_SLOT_2 => Some(AttrType::BuffSlot2),
            attr_type::ATTR_FIGHT_RESOURCES => Some(AttrType::BuffSlot),
            _ => None,
        }
    }

    /// Get the packet attribute ID for this type.
    #[allow(dead_code)]
    pub fn to_id(self) -> i32 {
        match self {
            AttrType::Name => attr_type::ATTR_NAME,
            AttrType::MonsterId => attr_type::ATTR_ID,
            AttrType::ActorState => attr_type::ATTR_ACTOR_STATE,
            AttrType::GuildId => attr_type::ATTR_GUILD_ID,
            AttrType::AttackPower => attr_type::ATTR_ATTACK_POWER,
            AttrType::DefensePower => attr_type::ATTR_DEFENSE_POWER,
            AttrType::Position => attr_type::ATTR_POS,
            AttrType::GearTier => attr_type::ATTR_GEAR_TIER,
            AttrType::BaseStrength => attr_type::ATTR_BASE_STRENGTH,
            AttrType::MoveType => attr_type::ATTR_MOVE_TYPE,
            AttrType::SkillId => attr_type::ATTR_SKILL_ID,
            AttrType::ResurrectionCount => attr_type::ATTR_RESURRECTION_COUNT,
            AttrType::Endurance => attr_type::ATTR_ENDURANCE,
            AttrType::CombatMode => attr_type::ATTR_COMBAT_MODE,
            AttrType::CharacterTimestamp => attr_type::ATTR_CHARACTER_TIMESTAMP,
            AttrType::PartyRole => attr_type::ATTR_PARTY_ROLE,
            AttrType::SessionTimestamp => attr_type::ATTR_SESSION_TIMESTAMP,
            AttrType::CombatState => attr_type::ATTR_COMBAT_STATE,
            AttrType::LastActionTimestamp => attr_type::ATTR_LAST_ACTION_TIMESTAMP,
            AttrType::MovementSpeed => attr_type::ATTR_MOVEMENT_SPEED,
            AttrType::EquipmentSlot1 => attr_type::ATTR_EQUIPMENT_SLOT_1,
            AttrType::EquipmentSlot2 => attr_type::ATTR_EQUIPMENT_SLOT_2,
            AttrType::TalentSpec => attr_type::ATTR_TALENT_SPEC,
            AttrType::EliteStatus => attr_type::ATTR_ELITE_STATUS,
            AttrType::ProfessionId => attr_type::ATTR_PROFESSION_ID,
            AttrType::BuffSlot3 => attr_type::ATTR_BUFF_SLOT_3,
            AttrType::PvpRank => attr_type::ATTR_PVP_RANK,
            AttrType::TotalPower => attr_type::ATTR_TOTAL_POWER,
            AttrType::PhysicalAttack => attr_type::ATTR_PHYSICAL_ATTACK,
            AttrType::MagicAttack => attr_type::ATTR_MAGIC_ATTACK,
            AttrType::WeaponType => attr_type::ATTR_WEAPON_TYPE,
            AttrType::MountStatus => attr_type::ATTR_MOUNT_STATUS,
            AttrType::MountTimestamp => attr_type::ATTR_MOUNT_TIMESTAMP,
            AttrType::MountSpeed => attr_type::ATTR_MOUNT_SPEED,
            AttrType::MountDuration => attr_type::ATTR_MOUNT_DURATION,
            AttrType::FightPoint => attr_type::ATTR_FIGHT_POINT,
            AttrType::SeasonStrength => attr_type::ATTR_SEASON_STRENGTH,
            AttrType::SkillCd => attr_type::ATTR_SKILL_CD,
            AttrType::SkillCdPct => attr_type::ATTR_SKILL_CD_PCT,
            AttrType::CdAcceleratePct => attr_type::ATTR_CD_ACCELERATE_PCT,
            AttrType::Level => attr_type::ATTR_LEVEL,
            AttrType::RankLevel => attr_type::ATTR_RANK_LEVEL,
            AttrType::Crit => attr_type::ATTR_CRIT,
            AttrType::Lucky => attr_type::ATTR_LUCKY,
            AttrType::CurrentHp => attr_type::ATTR_CURRENT_HP,
            AttrType::MaxHp => attr_type::ATTR_MAX_HP,
            AttrType::MaxMp => attr_type::ATTR_MAX_MP,
            AttrType::Stamina => attr_type::ATTR_STAMINA,
            AttrType::CurrentShield => attr_type::ATTR_CURRENT_SHIELD,
            AttrType::MinEnergy => attr_type::ATTR_MIN_ENERGY,
            AttrType::MaxEnergy => attr_type::ATTR_MAX_ENERGY,
            AttrType::EnergyRegen => attr_type::ATTR_ENERGY_REGEN,
            AttrType::Haste => attr_type::ATTR_HASTE,
            AttrType::Mastery => attr_type::ATTR_MASTERY,
            AttrType::PhysicalPenetration => attr_type::ATTR_PHYSICAL_PENETRATION,
            AttrType::MagicPenetration => attr_type::ATTR_MAGIC_PENETRATION,
            AttrType::ElementalRes1 => attr_type::ATTR_ELEMENTAL_RES_1,
            AttrType::ElementalRes2 => attr_type::ATTR_ELEMENTAL_RES_2,
            AttrType::ElementalRes3 => attr_type::ATTR_ELEMENTAL_RES_3,
            AttrType::ElementFlag => attr_type::ATTR_ELEMENT_FLAG,
            AttrType::EnergyFlag => attr_type::ATTR_ENERGY_FLAG,
            AttrType::ReductionLevel => attr_type::ATTR_REDUCTION_LEVEL,
            AttrType::BuffSlot => attr_type::ATTR_FIGHT_RESOURCES,
            AttrType::BuffSlot2 => attr_type::ATTR_BUFF_SLOT_2,
            AttrType::Unknown(id) => id,
        }
    }
}

impl AttrValue {
    /// Try to extract an i64 from this attribute value.
    pub fn as_int(&self) -> Option<i64> {
        match self {
            AttrValue::Int(v) => Some(*v),
            _ => None,
        }
    }

    /// Try to extract an f64 from this attribute value.
    #[allow(dead_code)]
    pub fn as_float(&self) -> Option<f64> {
        match self {
            AttrValue::Float(v) => Some(*v),
            _ => None,
        }
    }

    /// Try to extract a String from this attribute value.
    pub fn as_string(&self) -> Option<&str> {
        match self {
            AttrValue::String(v) => Some(v),
            _ => None,
        }
    }

    /// Try to extract a bool from this attribute value.
    #[allow(dead_code)]
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            AttrValue::Bool(v) => Some(*v),
            _ => None,
        }
    }

    pub fn as_position(&self) -> Option<PositionAttr> {
        match self {
            AttrValue::Position(v) => Some(*v),
            _ => None,
        }
    }

    /// Parse a varint from raw bytes and create an Int variant.
    #[allow(dead_code)]
    pub fn from_varint(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        let value = prost::encoding::decode_varint(&mut &bytes[..])?;
        Ok(AttrValue::Int(value as i64))
    }

    /// Parse a string from raw bytes and create a String variant.
    #[allow(dead_code)]
    pub fn from_string_bytes(bytes: Vec<u8>) -> Result<Self, std::io::Error> {
        let mut bytes = bytes;
        if !bytes.is_empty() {
            bytes.remove(0); // Skip first byte (encoding marker)
        }
        let s = String::from_utf8(bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(AttrValue::String(s))
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CombatStats {
    pub total: u128,
    pub effective_total: u128,
    pub crit_total: u128,
    pub crit_hits: u128,
    pub lucky_total: u128,
    pub lucky_hits: u128,
    pub hits: u128,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedActiveBuff {
    pub buff_uuid: i32,
    pub base_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration: i32,
    pub create_time: i64,
    pub received_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedFactorBuff {
    pub factor_buff_id: i32,
    pub observed_buff_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration: i32,
    pub create_time: i64,
    pub received_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedEffectBuff {
    pub effect_source_buff_id: i32,
    pub observed_buff_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration: i32,
    pub create_time: i64,
    pub received_time_ms: i64,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedModifierWindow {
    pub buff_uuid: i32,
    pub base_id: i32,
    pub buff_level: Option<i32>,
    pub part_id: Option<i32>,
    pub count: Option<i32>,
    pub fight_source_type: Option<i32>,
    pub source_config_id: Option<i32>,
    pub layer: i32,
    pub duration: i32,
    pub start_time_ms: i64,
    pub end_time_ms: Option<i64>,
    pub host_uid: i64,
    pub source_uid: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedDamageHit {
    pub timestamp_ms: i64,
    pub skill_key: i64,
    pub damage_id: i64,
    pub owner_id: i32,
    pub owner_level: Option<i32>,
    pub hit_event_id: Option<i32>,
    pub damage_source: Option<i32>,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub attacker_uid: i64,
    pub original_attacker_uid: i64,
    pub top_summoner_uid: Option<i64>,
    pub target_uid: i64,
    pub target_monster_type_id: Option<i32>,
    pub value: u128,
    pub effective_value: u128,
    pub hp_loss_value: u128,
    pub shield_loss_value: u128,
    pub is_heal: bool,
    pub is_crit: bool,
    pub is_lucky: bool,
    pub attacker_attrs: Vec<ObservedFormulaAttr>,
    pub target_attrs: Vec<ObservedFormulaAttr>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedFormulaAttr {
    pub attr_id: i32,
    pub value_int: Option<i64>,
    pub value_float: Option<f64>,
    pub value_bool: Option<bool>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedModifierReplaySource {
    pub modifier_base_id: i32,
    pub modifier_source_config_id: Option<i32>,
    pub modifier_buff_level: Option<i32>,
    pub modifier_count: Option<i32>,
    pub modifier_layer: i32,
    pub modifier_host_uid: i64,
    pub modifier_source_uid: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedModifierReplayHit {
    pub timestamp_ms: i64,
    pub skill_key: i64,
    pub damage_id: i64,
    pub owner_id: i32,
    pub owner_level: Option<i32>,
    pub hit_event_id: Option<i32>,
    pub damage_source: Option<i32>,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub attacker_uid: i64,
    pub original_attacker_uid: i64,
    pub top_summoner_uid: Option<i64>,
    pub target_uid: i64,
    pub target_monster_type_id: Option<i32>,
    pub is_heal: bool,
    pub is_crit: bool,
    pub is_lucky: bool,
    pub value: u128,
    pub effective_value: u128,
    pub hp_loss_value: u128,
    pub shield_loss_value: u128,
    pub active_modifiers: Vec<ObservedModifierReplaySource>,
    pub attacker_attrs: Vec<ObservedFormulaAttr>,
    pub target_attrs: Vec<ObservedFormulaAttr>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedModifierHitBucket {
    pub modifier_buff_uuid: i32,
    pub modifier_base_id: i32,
    pub modifier_buff_level: Option<i32>,
    pub modifier_part_id: Option<i32>,
    pub modifier_count: Option<i32>,
    pub modifier_fight_source_type: Option<i32>,
    pub modifier_source_config_id: Option<i32>,
    pub modifier_layer: i32,
    pub modifier_duration: i32,
    pub modifier_start_time_ms: i64,
    pub modifier_end_time_ms: Option<i64>,
    pub modifier_host_uid: i64,
    pub modifier_source_uid: i64,
    pub skill_key: i64,
    pub damage_id: i64,
    pub owner_id: i32,
    pub owner_level: Option<i32>,
    pub hit_event_id: Option<i32>,
    pub damage_source: Option<i32>,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub attacker_uid: i64,
    pub original_attacker_uid: i64,
    pub top_summoner_uid: Option<i64>,
    pub target_uid: i64,
    pub target_monster_type_id: Option<i32>,
    pub is_heal: bool,
    pub hits: u128,
    pub total_value: u128,
    pub effective_total_value: u128,
    pub crit_hits: u128,
    pub crit_total_value: u128,
    pub lucky_hits: u128,
    pub lucky_total_value: u128,
    pub hp_loss_total: u128,
    pub shield_loss_total: u128,
    pub first_hit_time_ms: i64,
    pub last_hit_time_ms: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedSkillCastEvent {
    pub timestamp_ms: i64,
    pub skill_id: i32,
    pub source: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedSkillCooldownEvent {
    pub timestamp_ms: i64,
    pub skill_level_id: i32,
    pub skill_id: i32,
    pub begin_time: i64,
    pub duration: i32,
    pub calculated_duration: i32,
    pub cd_accelerate_rate: f32,
    pub skill_cd_type: i32,
    pub valid_cd_time: i32,
    pub attr_skill_cd: f32,
    pub attr_skill_cd_pct: f32,
    pub attr_cd_accelerate_pct: f32,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedEffectSource {
    pub source_id: String,
    pub runtime_source: String,
    pub source_entity_id: Option<i32>,
    pub node_id: Option<u32>,
    pub node_level: Option<u32>,
    pub slot: Option<i32>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedFactorItem {
    pub factor_buff_id: i32,
    pub item_config_id: i32,
    pub item_uuid: Option<i64>,
    pub package_key: i32,
    pub package_type: Option<i32>,
    pub grade: Option<i32>,
    pub family_id: Option<i32>,
    pub runtime_source: String,
    pub selector_path: Option<String>,
    pub selector_signature: Option<String>,
    pub selector_offset: Option<i32>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedPassiveSkill {
    pub passive_uuid: Option<i64>,
    pub target_uid: Option<i64>,
    pub stage_begin_time: Option<i64>,
    pub begin_time: Option<i64>,
    pub stage_play_num: Option<i32>,
    pub skill_id: Option<i32>,
    pub skill_level: Option<i32>,
    pub skill_stage: Option<i32>,
    pub runtime_source: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedProfessionSkill {
    pub skill_id: i32,
    pub base_skill_id: Option<i32>,
    pub skill_level_id: Option<i32>,
    pub level: Option<i32>,
    pub remodel_level: Option<i32>,
    pub slot: Option<i32>,
    pub equipped: Option<bool>,
    pub source_kind: String,
    pub replace_skill_ids: Vec<i32>,
    pub runtime_source: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ObservedProfessionTalent {
    pub profession_id: i32,
    pub talent_node_id: u32,
    pub used_talent_points: Option<u32>,
    pub talent_stage_cfg_id: Option<i32>,
    pub runtime_source: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub name: String,
    pub entity_type: EEntityType,
    pub class_id: i32,
    pub class_spec: ClassSpec,
    pub ability_score: i32,
    pub level: i32,
    // Raw monster name captured from packet ATTR_NAME when available (monsters only)
    pub monster_name_packet: Option<String>,
    // Legacy attribute storage retained for MessagePack compatibility with old encounter blobs.
    #[serde(default)]
    pub _legacy_attributes: HashMap<AttrType, AttrValue>,
    // Damage
    pub damage: CombatStats,
    pub skill_uid_to_dmg_skill: HashMap<i64, Skill>,
    // Boss-only damage
    pub damage_boss_only: CombatStats,
    // Healing
    pub healing: CombatStats,
    pub skill_uid_to_heal_skill: HashMap<i64, Skill>,
    // Tanked/Taken (damage received)
    pub taken: CombatStats,
    pub skill_uid_to_taken_skill: HashMap<i64, Skill>,
    // Monster metadata and per-target aggregates (for boss-only filtering)
    pub monster_type_id: Option<i32>,
    pub dmg_to_target: HashMap<i64, u128>,
    pub skill_dmg_to_target: HashMap<(i64, i64), SkillTargetStats>,
    pub skill_heal_to_target: HashMap<(i64, i64), SkillTargetStats>,
    pub season_strength: i32,
    #[serde(default)]
    pub active_buffs: Vec<ObservedActiveBuff>,
    #[serde(default)]
    pub active_factor_buffs: Vec<ObservedFactorBuff>,
    #[serde(default)]
    pub active_effect_buffs: Vec<ObservedEffectBuff>,
    #[serde(default)]
    pub modifier_windows: Vec<ObservedModifierWindow>,
    /// Runtime-only hit log used to build exact modifier-window attribution at save time.
    #[serde(skip)]
    pub observed_damage_hits: Vec<ObservedDamageHit>,
    /// Persisted per-skill/per-target hit buckets for damage or healing done during modifier windows.
    #[serde(default)]
    pub modifier_hit_buckets: Vec<ObservedModifierHitBucket>,
    /// Persisted per-hit replay evidence for future formula contribution math.
    #[serde(default)]
    pub modifier_replay_hits: Vec<ObservedModifierReplayHit>,
    /// Persisted local skill cast markers. Used for cooldown-acceleration attribution.
    #[serde(default)]
    pub skill_cast_events: Vec<ObservedSkillCastEvent>,
    /// Persisted skill cooldown starts and calculated cooldown-reduction state.
    #[serde(default)]
    pub skill_cooldown_events: Vec<ObservedSkillCooldownEvent>,
    #[serde(default)]
    pub active_effect_sources: Vec<ObservedEffectSource>,
    #[serde(default)]
    pub active_factor_items: Vec<ObservedFactorItem>,
    #[serde(default)]
    pub active_passive_skills: Vec<ObservedPassiveSkill>,
    #[serde(default)]
    pub active_profession_skills: Vec<ObservedProfessionSkill>,
    #[serde(default)]
    pub active_profession_talents: Vec<ObservedProfessionTalent>,
    /// Rolling 2s window of damage taken events; used to build death-replay snapshots.
    #[serde(skip)]
    pub recent_taken_events: VecDeque<DamageSnapshot>,
    #[serde(default)]
    pub deaths: Vec<DeathRecord>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SkillTargetStats {
    pub hits: u128,
    pub total_value: u128,
    pub effective_total_value: u128,
    pub crit_hits: u128,
    pub lucky_hits: u128,
    pub crit_total: u128,
    pub lucky_total: u128,
    pub hp_loss_total: u128,
    pub shield_loss_total: u128,
    pub monster_name: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub total_value: u128,
    pub effective_total_value: u128,
    pub crit_total_value: u128,
    pub crit_hits: u128,
    pub lucky_total_value: u128,
    pub lucky_hits: u128,
    pub hits: u128,
    #[serde(default)]
    pub property: Option<i32>,
    #[serde(default)]
    pub damage_mode: Option<i32>,
}

impl Encounter {
    /// Reset only combat-specific state while preserving player identity fields and cache.
    ///
    /// Preserves:
    /// - is_encounter_paused
    /// - local_player_uid
    /// - local_player (sync container data)
    /// - entity_uid_to_entity identity fields (name, class, spec, ability score, level, type)
    ///
    /// Clears:
    /// - encounter totals and timestamps
    /// - per-entity combat counters and per-encounter skill maps
    pub fn reset_combat_state(&mut self) {
        // Reset encounter-level combat state
        self.time_last_combat_packet_ms = 0;
        self.time_fight_start_ms = 0;
        self.active_combat_time_ms = 0;
        self.last_combat_timestamp_ms = None;
        self.total_dmg = 0;
        self.total_dmg_boss_only = 0;
        self.total_heal = 0;
        self.total_effective_heal = 0;

        // Reset per-entity combat stats while preserving identity
        for entity in self.entity_uid_to_entity.values_mut() {
            // Damage
            entity.damage = CombatStats::default();
            entity.damage_boss_only = CombatStats::default();
            entity.skill_uid_to_dmg_skill.clear();
            entity.dmg_to_target.clear();
            entity.skill_dmg_to_target.clear();

            // Healing
            entity.healing = CombatStats::default();
            entity.skill_uid_to_heal_skill.clear();
            entity.skill_heal_to_target.clear();

            // Taken
            entity.taken = CombatStats::default();
            entity.skill_uid_to_taken_skill.clear();
            entity.active_buffs.clear();
            entity.active_factor_buffs.clear();
            entity.active_effect_buffs.clear();
            entity.modifier_windows.clear();
            entity.observed_damage_hits.clear();
            entity.modifier_hit_buckets.clear();
            entity.skill_cast_events.clear();
            entity.skill_cooldown_events.clear();
            entity.active_effect_sources.clear();
            entity.active_factor_items.clear();
            entity.active_passive_skills.clear();
            entity.active_profession_skills.clear();
            entity.active_profession_talents.clear();
            entity.recent_taken_events.clear();
            entity.deaths.clear();
        }
    }
}

pub mod attr_type {
    // TOOD: rename some of these to actual attribute names for now, idk.
    pub const ATTR_NAME: i32 = 0x01;
    pub const ATTR_ID: i32 = 0x0a;
    pub const ATTR_SCENE_BASIC_ID: i32 = 0x155; // Scene basic ID (341)
    pub const ATTR_ACTOR_STATE: i32 = 0x0b; // Actor state, see EActorState
    pub const ATTR_GUILD_ID: i32 = 0x1e; // Guild/clan ID
    pub const ATTR_ATTACK_POWER: i32 = 0x32; // Attack stat
    pub const ATTR_DEFENSE_POWER: i32 = 0x33; // Defense stat
    pub const ATTR_POS: i32 = 0x34; // Position vector
    pub const ATTR_GEAR_TIER: i32 = 0x35; // Gear tier/grade
    pub const ATTR_BASE_STRENGTH: i32 = 0x46; // Base strength/attack stat
    pub const ATTR_MOVE_TYPE: i32 = 0x47; // AttrMoveType, see EMoveType
    pub const ATTR_SKILL_ID: i32 = 0x64; // AttrSkillId
    pub const ATTR_RESURRECTION_COUNT: i32 = 0x65; // Number of resurrections/revives
    pub const ATTR_ENDURANCE: i32 = 0x67; // Endurance/stamina stat
    pub const ATTR_COMBAT_MODE: i32 = 0x68; // PvP/combat mode toggle
    pub const ATTR_CHARACTER_TIMESTAMP: i32 = 0x6a; // Character creation or last login timestamp
    pub const ATTR_PARTY_ROLE: i32 = 0x6c; // Party role (DPS/Tank/Healer)
    pub const ATTR_SESSION_TIMESTAMP: i32 = 0x6f; // Session start or login timestamp
    pub const ATTR_COMBAT_STATE: i32 = 0x71; // Combat state/stance
    pub const ATTR_LAST_ACTION_TIMESTAMP: i32 = 0x72; // Last action/activity timestamp
    pub const ATTR_MOVEMENT_SPEED: i32 = 0x74; // Movement or action speed
    pub const ATTR_EQUIPMENT_SLOT_1: i32 = 0x76; // Equipment slot data
    pub const ATTR_EQUIPMENT_SLOT_2: i32 = 0x78; // Equipment slot data
    pub const ATTR_TALENT_SPEC: i32 = 0x79; // Talent tree/specialization selection
    pub const ATTR_ELITE_STATUS: i32 = 0xb6; // Elite/premium/special status flag
    pub const ATTR_PROFESSION_ID: i32 = 0xdc;
    pub const ATTR_BUFF_SLOT_3: i32 = 0xe2; // Active buff/consumable slot (type 3)
    pub const ATTR_PVP_RANK: i32 = 0xf9; // PvP rank or title ID
    pub const ATTR_TOTAL_POWER: i32 = 0x105; // Total combat power
    pub const ATTR_PHYSICAL_ATTACK: i32 = 0x106; // Physical attack stat
    pub const ATTR_MAGIC_ATTACK: i32 = 0x107; // Magic attack stat
    pub const ATTR_WEAPON_TYPE: i32 = 0x108; // Weapon type or stance
    pub const ATTR_HATE_LIST: i32 = 0x1da; // Monster hate/aggro list
    pub const ATTR_MOUNT_STATUS: i32 = 0x226; // Mount/vehicle status flag
    pub const ATTR_MOUNT_TIMESTAMP: i32 = 0x228; // Mount activation timestamp
    pub const ATTR_MOUNT_SPEED: i32 = 0x22a; // Mount speed or ID
    pub const ATTR_MOUNT_DURATION: i32 = 0x22d; // Mount duration or timer
    pub const ATTR_FIGHT_POINT: i32 = 0x272e;
    pub const ATTR_LEVEL: i32 = 0x2710;
    pub const ATTR_RANK_LEVEL: i32 = 0x274c;
    pub const ATTR_CRIT: i32 = 0x2b66;
    pub const ATTR_LUCKY: i32 = 0x2b7a;
    pub const ATTR_CURRENT_HP: i32 = 0x2c2e;
    pub const ATTR_MAX_HP: i32 = 0x2c38;
    pub const ATTR_MAX_MP: i32 = 0x2c39; // Maximum MP/energy
    pub const ATTR_STAMINA: i32 = 0x2c3c; // Current stamina/energy regen
    pub const ATTR_CURRENT_SHIELD: i32 = 0x2c3d; // Current shield/barrier value
    pub const ATTR_MIN_ENERGY: i32 = 0x2c42; // Minimum energy value
    pub const ATTR_MAX_ENERGY: i32 = 0x2c43; // Maximum energy value
    pub const ATTR_ENERGY_REGEN: i32 = 0x2c46; // Energy regeneration rate
    pub const ATTR_HASTE: i32 = 0x2b84;
    pub const ATTR_SEASON_STRENGTH: i32 = 0x2cb0; // 11440, AttrSeasonStrength (season strength)
    pub const ATTR_SKILL_CD: i32 = 0x2de6; // 11750, AttrSkillCD
    pub const ATTR_SKILL_CD_PCT: i32 = 0x2df0; // 11760, AttrSkillCDPCT
    pub const ATTR_CD_ACCELERATE_PCT: i32 = 0x2eb8; // 11960, AttrCdAcceleratePct
    pub const ATTR_MASTERY: i32 = 0x2b8e;
    pub const ATTR_PHYSICAL_PENETRATION: i32 = 0x2dc8; // Physical armor penetration
    pub const ATTR_MAGIC_PENETRATION: i32 = 0x2dd2; // Magic resistance penetration
    pub const ATTR_ELEMENTAL_RES_1: i32 = 0x3372; // Elemental resistance type 1
    pub const ATTR_ELEMENTAL_RES_2: i32 = 0x3373; // Elemental resistance type 2
    pub const ATTR_ELEMENTAL_RES_3: i32 = 0x3374; // Elemental resistance type 3
    pub const ATTR_ELEMENT_FLAG: i32 = 0x646d6c;
    pub const ATTR_REDUCTION_LEVEL: i32 = 0x64696d;
    pub const ATTR_REDUCTION_ID: i32 = 0x6f6c65;
    pub const ATTR_FIGHT_RESOURCES: i32 = 0xc352; // Active buff/consumable slot
    pub const ATTR_FIGHT_RESOURCE_IDS: i32 = 0xc351; // Fight resource IDs
    pub const ATTR_BUFF_SLOT_2: i32 = 0xea92; // Active buff/consumable slot (type 2)
    pub const ATTR_ENERGY_FLAG: i32 = 0x543cd3c6;
}

// TODO: this logic needs to be severely cleaned up
pub mod class {
    pub const UNKNOWN: i32 = 0;
    pub const STORMBLADE: i32 = 1;
    pub const FROST_MAGE: i32 = 2;
    pub const FLAME_BERSERKER: i32 = 3;
    pub const WIND_KNIGHT: i32 = 4;
    pub const VERDANT_ORACLE: i32 = 5;
    pub const HEAVY_GUARDIAN: i32 = 9;
    pub const MARKSMAN: i32 = 11;
    pub const SHIELD_KNIGHT: i32 = 12;
    pub const BEAT_PERFORMER: i32 = 13;

    pub fn get_class_name(id: i32) -> String {
        String::from(match id {
            STORMBLADE => "Stormblade",
            FROST_MAGE => "Frost Mage",
            FLAME_BERSERKER => "Flame Berserker",
            WIND_KNIGHT => "Wind Knight",
            VERDANT_ORACLE => "Verdant Oracle",
            HEAVY_GUARDIAN => "Heavy Guardian",
            MARKSMAN => "Marksman",
            SHIELD_KNIGHT => "Shield Knight",
            BEAT_PERFORMER => "Beat Performer",
            _ => "", // empty string for unknown
        })
    }

    #[derive(Debug, Default, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    pub enum ClassSpec {
        #[default]
        Unknown,
        // Stormblade
        Iaido,
        Moonstrike,
        // Frost Mage
        Icicle,
        Frostbeam,
        // Flame Berserker
        Voidflame,
        Blazecrimson,
        // Wind Knight
        Vanguard,
        Skyward,
        // Verdant Oracle
        Smite,
        Lifebind,
        // Heavy Guardian
        Earthfort,
        Block,
        // Marksman
        Wildpack,
        Falconry,
        // Shield Knight
        Recovery,
        Shield,
        // Beat Performer
        Dissonance,
        Concerto,
    }

    pub fn get_class_spec_from_skill_id(skill_id: i32) -> ClassSpec {
        match skill_id {
            1714 | 1728 | 1734 => ClassSpec::Iaido,
            1715 | 1737 | 1738 => ClassSpec::Moonstrike,

            1242 | 120902 => ClassSpec::Icicle,
            1241 => ClassSpec::Frostbeam,

            1605 => ClassSpec::Voidflame,
            1606 => ClassSpec::Blazecrimson,

            1405 | 1418 => ClassSpec::Vanguard,
            1419 => ClassSpec::Skyward,

            1518 | 1541 | 21402 => ClassSpec::Smite,
            1507 | 20301 => ClassSpec::Lifebind,

            1922 => ClassSpec::Earthfort,
            1930 => ClassSpec::Block,

            220112 | 2203622 | 2233 | 2234 | 223300..=223399 | 223400..=223499 => {
                ClassSpec::Falconry
            }
            2222 => ClassSpec::Falconry,
            2220 | 2292 | 1700820 | 1700825 | 1700827 => ClassSpec::Wildpack,

            2406 => ClassSpec::Shield,
            2405 => ClassSpec::Recovery,

            2306 | 2321 => ClassSpec::Dissonance,
            2301 | 2307 | 2361 | 55302 => ClassSpec::Concerto,
            _ => ClassSpec::Unknown,
        }
    }

    pub fn get_class_spec_from_talent_node_id(talent_node_id: u32) -> ClassSpec {
        match talent_node_id {
            130 => ClassSpec::Iaido,
            157 => ClassSpec::Moonstrike,
            212 => ClassSpec::Frostbeam,
            233 => ClassSpec::Icicle,
            312 => ClassSpec::Voidflame,
            342 => ClassSpec::Blazecrimson,
            432 => ClassSpec::Skyward,
            433 => ClassSpec::Vanguard,
            510 => ClassSpec::Smite,
            531 => ClassSpec::Lifebind,
            930 => ClassSpec::Block,
            931 => ClassSpec::Earthfort,
            1126 => ClassSpec::Wildpack,
            1129 => ClassSpec::Falconry,
            1208 => ClassSpec::Recovery,
            1218 => ClassSpec::Shield,
            1308 => ClassSpec::Dissonance,
            1317 => ClassSpec::Concerto,
            _ => ClassSpec::Unknown,
        }
    }

    pub fn get_class_spec_from_selector_buff_id(selector_buff_id: i32) -> ClassSpec {
        match selector_buff_id {
            2_200_320 => ClassSpec::Iaido,
            2_200_590 => ClassSpec::Moonstrike,
            2_204_120 => ClassSpec::Frostbeam,
            2_204_300 => ClassSpec::Icicle,
            2_208_130 => ClassSpec::Voidflame,
            2_208_430 => ClassSpec::Blazecrimson,
            2_205_290 => ClassSpec::Skyward,
            2_205_300 => ClassSpec::Vanguard,
            2_202_110 => ClassSpec::Smite,
            2_202_340 => ClassSpec::Lifebind,
            2_201_320 => ClassSpec::Block,
            2_201_330 => ClassSpec::Earthfort,
            2_203_260 => ClassSpec::Wildpack,
            2_203_290 => ClassSpec::Falconry,
            2_206_090 => ClassSpec::Recovery,
            2_206_190 => ClassSpec::Shield,
            2_207_090 => ClassSpec::Dissonance,
            2_207_180 => ClassSpec::Concerto,
            _ => ClassSpec::Unknown,
        }
    }

    pub fn get_class_spec_from_passive_buff_id(passive_buff_id: i32) -> ClassSpec {
        match passive_buff_id {
            // Generated from TalentSpecOwnership.json high-confidence sourceBuffIds.
            2_200_070 | 2_200_100 | 2_200_120 | 2_200_140 | 2_200_150 | 2_200_170 | 2_200_310
            | 2_200_340 | 2_200_350 | 2_200_380 | 2_200_410 | 2_200_420 | 2_200_450 | 2_200_480
            | 2_200_520 | 2_200_530 | 2_200_550 | 2_200_690 | 2_200_740 => ClassSpec::Iaido,
            2_200_020 | 2_200_090 | 2_200_230 | 2_200_470 | 2_200_580 | 2_200_620 | 2_200_640
            | 2_200_680 | 2_200_700 => ClassSpec::Moonstrike,

            2_204_150 | 2_204_160 | 2_204_200 | 2_204_420 | 2_204_440 | 2_204_460 => {
                ClassSpec::Icicle
            }
            2_204_050 | 2_204_060 | 2_204_070 | 2_204_110 | 2_204_230 | 2_204_290 | 2_204_320
            | 2_204_370 | 2_204_450 | 2_204_470 | 2_204_500 | 2_204_530 | 2_204_540 | 2_204_580
            | 2_204_590 | 2_204_600 | 2_204_610 | 2_204_640 | 2_204_660 => ClassSpec::Frostbeam,

            2_208_040 | 2_208_140 | 2_208_160 | 2_208_200 | 2_208_230 | 2_208_240 | 2_208_250
            | 2_208_280 => ClassSpec::Voidflame,
            2_208_460 | 2_208_550 | 2_208_560 | 2_208_620 | 2_208_630 | 2_208_640 | 2_208_650
            | 2_208_660 => ClassSpec::Blazecrimson,

            2_205_070 | 2_205_080 | 2_205_100 | 2_205_380 | 2_205_400 | 2_205_420 | 2_205_470 => {
                ClassSpec::Vanguard
            }
            2_205_150 | 2_205_180 | 2_205_210 | 2_205_360 | 2_205_390 | 2_205_580 | 2_205_600
            | 2_205_620 | 2_205_640 | 2_205_670 | 2_205_680 => ClassSpec::Skyward,

            2_202_080 | 2_202_100 | 2_202_120 | 2_202_140 | 2_202_320 | 2_202_440 | 2_202_450
            | 2_202_470 | 2_202_500 | 2_202_510 | 2_202_520 | 2_202_560 | 2_202_580 => {
                ClassSpec::Smite
            }
            2_202_050 | 2_202_060 | 2_202_180 | 2_202_200 | 2_202_210 | 2_202_230 | 2_202_300
            | 2_202_420 | 2_202_530 | 2_202_620 | 2_202_630 | 2_202_640 | 2_202_650 | 2_202_710 => {
                ClassSpec::Lifebind
            }

            2_201_160 | 2_201_180 | 2_201_240 | 2_201_540 => ClassSpec::Earthfort,
            2_201_080 | 2_201_090 | 2_201_360 | 2_201_580 | 2_201_590 | 2_201_600 | 2_201_650
            | 2_201_700 | 2_201_710 => ClassSpec::Block,

            2_203_040 | 2_203_110 | 2_203_120 | 2_203_140 | 2_203_360 | 2_203_400 | 2_203_440
            | 2_203_470 | 2_203_590 | 2_203_640 => ClassSpec::Wildpack,
            2_203_200 | 2_203_220 | 2_203_560 => ClassSpec::Falconry,

            2_206_120 | 2_206_370 | 2_206_420 | 2_206_460 | 2_206_490 => ClassSpec::Recovery,
            2_206_240 | 2_206_540 | 2_206_560 => ClassSpec::Shield,

            2_207_110 | 2_207_160 | 2_207_170 | 2_207_380 | 2_207_430 | 2_207_440 | 2_207_450 => {
                ClassSpec::Dissonance
            }
            2_207_190 | 2_207_200 | 2_207_220 | 2_207_240 | 2_207_250 | 2_207_260 | 2_207_530
            | 2_207_550 | 2_207_560 | 2_207_570 | 2_207_590 | 2_207_610 | 2_207_620 | 2_207_650 => {
                ClassSpec::Concerto
            }
            _ => ClassSpec::Unknown,
        }
    }

    pub fn get_class_spec_from_runtime_id(runtime_id: i32) -> ClassSpec {
        for spec in [
            get_class_spec_from_skill_id(runtime_id),
            get_class_spec_from_selector_buff_id(runtime_id),
            get_class_spec_from_passive_buff_id(runtime_id),
        ] {
            if spec != ClassSpec::Unknown {
                return spec;
            }
        }

        ClassSpec::Unknown
    }

    pub fn get_class_id_from_spec(class_spec: ClassSpec) -> i32 {
        match class_spec {
            ClassSpec::Iaido | ClassSpec::Moonstrike => STORMBLADE,
            ClassSpec::Icicle | ClassSpec::Frostbeam => FROST_MAGE,
            ClassSpec::Voidflame | ClassSpec::Blazecrimson => FLAME_BERSERKER,
            ClassSpec::Vanguard | ClassSpec::Skyward => WIND_KNIGHT,
            ClassSpec::Smite | ClassSpec::Lifebind => VERDANT_ORACLE,
            ClassSpec::Earthfort | ClassSpec::Block => HEAVY_GUARDIAN,
            ClassSpec::Wildpack | ClassSpec::Falconry => MARKSMAN,
            ClassSpec::Recovery | ClassSpec::Shield => SHIELD_KNIGHT,
            ClassSpec::Dissonance | ClassSpec::Concerto => BEAT_PERFORMER,
            ClassSpec::Unknown => UNKNOWN,
        }
    }

    pub fn get_class_spec(class_spec: ClassSpec) -> String {
        String::from(match class_spec {
            ClassSpec::Unknown => "",
            ClassSpec::Iaido => "Iaido",
            ClassSpec::Moonstrike => "Moonstrike",
            ClassSpec::Icicle => "Icicle",
            ClassSpec::Frostbeam => "Frostbeam",
            ClassSpec::Voidflame => "Voidflame",
            ClassSpec::Blazecrimson => "Blazecrimson",
            ClassSpec::Vanguard => "Vanguard",
            ClassSpec::Skyward => "Skyward",
            ClassSpec::Smite => "Smite",
            ClassSpec::Lifebind => "Lifebind",
            ClassSpec::Earthfort => "Earthfort",
            ClassSpec::Block => "Block",
            ClassSpec::Wildpack => "Wildpack",
            ClassSpec::Falconry => "Falconry",
            ClassSpec::Recovery => "Recovery",
            ClassSpec::Shield => "Shield",
            ClassSpec::Dissonance => "Dissonance",
            ClassSpec::Concerto => "Concerto",
        })
    }
}

impl Entity {
    /// Assign monster type id and update display name from mapping if available.
    pub fn set_monster_type(&mut self, monster_id: i32) {
        self.monster_type_id = Some(monster_id);
        if let Some(name) = monster_registry::monster_name(monster_id) {
            self.name = name.to_string();
        }
    }

    /// Determine whether this entity is a boss based on game data categorization.
    pub fn is_boss(&self) -> bool {
        if self.entity_type != EEntityType::EntMonster {
            return false;
        }

        self.monster_type_id
            .and_then(monster_registry::monster_type)
            .map(|monster_type| monster_type == MonsterType::Boss)
            .unwrap_or(false)
    }

    /// Determine whether this entity should appear in boss HP and boss aggregate metrics.
    pub fn is_boss_metric_target(&self) -> bool {
        if self.entity_type != EEntityType::EntMonster {
            return false;
        }

        self.monster_type_id
            .map(monster_registry::counts_as_boss_metric_monster)
            .unwrap_or(false)
    }

    /// Determine whether this entity should count for DPS boss aggregate columns.
    pub fn is_elite_or_boss(&self) -> bool {
        if self.entity_type != EEntityType::EntMonster {
            return false;
        }

        self.monster_type_id
            .and_then(monster_registry::monster_type)
            .map(|monster_type| matches!(monster_type, MonsterType::Elite | MonsterType::Boss))
            .unwrap_or(false)
    }

    /// Determine whether this entity should count for displayed boss aggregate columns.
    pub fn is_elite_or_boss_metric_target(&self) -> bool {
        if self.entity_type != EEntityType::EntMonster {
            return false;
        }

        self.monster_type_id
            .map(monster_registry::counts_as_elite_or_boss_metric_monster)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn class_spec_from_talent_node_id_maps_spec_roots() {
        assert_eq!(
            class::get_class_spec_from_talent_node_id(312),
            class::ClassSpec::Voidflame
        );
        assert_eq!(
            class::get_class_spec_from_talent_node_id(342),
            class::ClassSpec::Blazecrimson
        );
        assert_eq!(
            class::get_class_spec_from_talent_node_id(1129),
            class::ClassSpec::Falconry
        );
        assert_eq!(
            class::get_class_spec_from_talent_node_id(999_999),
            class::ClassSpec::Unknown
        );
    }

    #[test]
    fn class_spec_from_selector_buff_id_maps_spec_selectors() {
        assert_eq!(
            class::get_class_spec_from_selector_buff_id(2_208_430),
            class::ClassSpec::Blazecrimson
        );
        assert_eq!(
            class::get_class_spec_from_selector_buff_id(2_208_130),
            class::ClassSpec::Voidflame
        );
        assert_eq!(
            class::get_class_spec_from_selector_buff_id(2_203_290),
            class::ClassSpec::Falconry
        );
        assert_eq!(
            class::get_class_spec_from_selector_buff_id(999_999),
            class::ClassSpec::Unknown
        );
    }

    #[test]
    fn class_spec_from_skill_id_maps_cross_class_spec_pairs() {
        assert_eq!(
            class::get_class_spec_from_skill_id(1714),
            class::ClassSpec::Iaido
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(1728),
            class::ClassSpec::Iaido
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(1734),
            class::ClassSpec::Iaido
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(1715),
            class::ClassSpec::Moonstrike
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(1738),
            class::ClassSpec::Moonstrike
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(1242),
            class::ClassSpec::Icicle
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(1507),
            class::ClassSpec::Lifebind
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(2220),
            class::ClassSpec::Wildpack
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(2222),
            class::ClassSpec::Falconry
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(2321),
            class::ClassSpec::Dissonance
        );
        assert_eq!(
            class::get_class_spec_from_skill_id(2301),
            class::ClassSpec::Concerto
        );
    }

    #[test]
    fn class_spec_from_passive_buff_id_maps_high_confidence_ownership() {
        assert_eq!(
            class::get_class_spec_from_passive_buff_id(2_200_070),
            class::ClassSpec::Iaido
        );
        assert_eq!(
            class::get_class_spec_from_passive_buff_id(2_204_150),
            class::ClassSpec::Icicle
        );
        assert_eq!(
            class::get_class_spec_from_passive_buff_id(2_208_460),
            class::ClassSpec::Blazecrimson
        );
        assert_eq!(
            class::get_class_spec_from_passive_buff_id(2_203_200),
            class::ClassSpec::Falconry
        );
        assert_eq!(
            class::get_class_spec_from_passive_buff_id(2_207_190),
            class::ClassSpec::Concerto
        );
        assert_eq!(
            class::get_class_spec_from_passive_buff_id(999_999),
            class::ClassSpec::Unknown
        );
    }

    #[test]
    fn class_spec_from_runtime_id_checks_skills_selectors_and_passives() {
        assert_eq!(
            class::get_class_spec_from_runtime_id(2220),
            class::ClassSpec::Wildpack
        );
        assert_eq!(
            class::get_class_spec_from_runtime_id(2_203_290),
            class::ClassSpec::Falconry
        );
        assert_eq!(
            class::get_class_spec_from_runtime_id(2_203_200),
            class::ClassSpec::Falconry
        );
        assert_eq!(
            class::get_class_spec_from_runtime_id(999_999),
            class::ClassSpec::Unknown
        );
    }

    #[test]
    fn attr_value_float_conversion() {
        let val = AttrValue::Float(3.14);
        assert_eq!(val.as_float(), Some(3.14));
        assert_eq!(val.as_int(), None);
    }

    #[test]
    fn attr_value_string_conversion() {
        let val = AttrValue::String("test".to_string());
        assert_eq!(val.as_string(), Some("test"));
        assert_eq!(val.as_int(), None);
    }

    #[test]
    fn attr_value_bool_conversion() {
        let val = AttrValue::Bool(true);
        assert_eq!(val.as_bool(), Some(true));
        assert_eq!(val.as_int(), None);
    }

    #[test]
    fn attr_type_id_conversion() {
        assert_eq!(AttrType::from_id(0x01), Some(AttrType::Name));
        assert_eq!(AttrType::from_id(0x0b), Some(AttrType::ActorState));
        assert_eq!(AttrType::from_id(0x32), Some(AttrType::AttackPower));
        assert_eq!(AttrType::from_id(0x33), Some(AttrType::DefensePower));
        assert_eq!(AttrType::from_id(0x34), Some(AttrType::Position));
        assert_eq!(AttrType::from_id(0x35), Some(AttrType::GearTier));
        assert_eq!(AttrType::from_id(0xf9), Some(AttrType::PvpRank));
        assert_eq!(AttrType::from_id(0x105), Some(AttrType::TotalPower));
        assert_eq!(AttrType::from_id(0x106), Some(AttrType::PhysicalAttack));
        assert_eq!(AttrType::from_id(0x107), Some(AttrType::MagicAttack));
        assert_eq!(AttrType::from_id(0x108), Some(AttrType::WeaponType));
        assert_eq!(AttrType::from_id(0x2710), Some(AttrType::Level));
        assert_eq!(AttrType::from_id(0x274c), Some(AttrType::RankLevel));
        assert_eq!(AttrType::from_id(0x2c2e), Some(AttrType::CurrentHp));
        assert_eq!(AttrType::from_id(0x2c38), Some(AttrType::MaxHp));
        assert_eq!(AttrType::from_id(0x999999), None);
    }

    #[test]
    fn attr_type_to_id_conversion() {
        assert_eq!(AttrType::Name.to_id(), 0x01);
        assert_eq!(AttrType::ActorState.to_id(), 0x0b);
        assert_eq!(AttrType::AttackPower.to_id(), 0x32);
        assert_eq!(AttrType::DefensePower.to_id(), 0x33);
        assert_eq!(AttrType::Position.to_id(), 0x34);
        assert_eq!(AttrType::GearTier.to_id(), 0x35);
        assert_eq!(AttrType::TotalPower.to_id(), 0x105);
        assert_eq!(AttrType::PhysicalAttack.to_id(), 0x106);
        assert_eq!(AttrType::MagicAttack.to_id(), 0x107);
        assert_eq!(AttrType::WeaponType.to_id(), 0x108);
        assert_eq!(AttrType::Level.to_id(), 0x2710);
        assert_eq!(AttrType::RankLevel.to_id(), 0x274c);
        assert_eq!(AttrType::CurrentHp.to_id(), 0x2c2e);
        assert_eq!(AttrType::MaxHp.to_id(), 0x2c38);
    }

    #[test]
    fn attr_value_serialization() {
        // Test that AttrValue can be serialized and deserialized
        let val = AttrValue::Int(42);
        let json = serde_json::to_string(&val).unwrap();
        let deserialized: AttrValue = serde_json::from_str(&json).unwrap();
        assert_eq!(val, deserialized);

        let val = AttrValue::String("test".to_string());
        let json = serde_json::to_string(&val).unwrap();
        let deserialized: AttrValue = serde_json::from_str(&json).unwrap();
        assert_eq!(val, deserialized);
    }

    #[test]
    fn attr_type_serialization() {
        // Test that AttrType can be serialized and deserialized
        let attr_type = AttrType::CurrentHp;
        let json = serde_json::to_string(&attr_type).unwrap();
        let deserialized: AttrType = serde_json::from_str(&json).unwrap();
        assert_eq!(attr_type, deserialized);
    }
}
