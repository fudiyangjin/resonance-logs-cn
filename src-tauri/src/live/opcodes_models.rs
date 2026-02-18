use crate::live::opcodes_models::class::ClassSpec;
use crate::live::recount_names;
use crate::live::skill_names;
use blueprotobuf_lib::blueprotobuf::{EEntityType, SyncContainerData};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use tokio::sync::RwLock;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Encounter {
    pub is_encounter_paused: bool,
    pub time_last_combat_packet_ms: u128, // in ms
    pub time_fight_start_ms: u128,        // in ms
    pub total_dmg: u128,
    pub total_dmg_boss_only: u128,
    pub total_heal: u128,
    pub local_player_uid: i64,
    pub entity_uid_to_entity: HashMap<i64, Entity>, // key: entity uid
    pub local_player: SyncContainerData,
    pub current_scene_id: Option<i32>,
    pub current_scene_name: Option<String>,
    // Pending player death events detected during packet processing. Each tuple is
    // Pending player revive events detected during packet processing. Each tuple is
    // (actor_uid, helper_uid_opt, skill_id_opt, timestamp_ms)
    pub pending_player_revives: Vec<(i64, Option<i64>, Option<i32>, i64)>,
    // Last recorded revive timestamp per actor (ms) to avoid immediate duplicates.
    pub last_revive_ms: HashMap<i64, u128>,
    // Last recorded death timestamp per actor (ms) used only for deduplicating
    // DB death inserts. We no longer use death tracking for wipe detection; revives
    // are tracked for UI purposes while death DB inserts are still written.
    pub last_death_db_ms: HashMap<i64, u128>,
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
}

/// Player attribute types from Blue Protocol packets.
///
/// These represent all known attribute IDs that can be extracted from player sync data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AttrType {
    Name,
    TeamId,
    GuildId,
    AttackPower,
    DefensePower,
    StarLevel,
    GearTier,
    BaseStrength,
    Gender,
    TotalDefense,
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
            attr_type::ATTR_TEAM_ID => Some(AttrType::TeamId),
            attr_type::ATTR_GUILD_ID => Some(AttrType::GuildId),
            attr_type::ATTR_ATTACK_POWER => Some(AttrType::AttackPower),
            attr_type::ATTR_DEFENSE_POWER => Some(AttrType::DefensePower),
            attr_type::ATTR_STAR_LEVEL => Some(AttrType::StarLevel),
            attr_type::ATTR_GEAR_TIER => Some(AttrType::GearTier),
            attr_type::ATTR_BASE_STRENGTH => Some(AttrType::BaseStrength),
            attr_type::ATTR_GENDER => Some(AttrType::Gender),
            attr_type::ATTR_TOTAL_DEFENSE => Some(AttrType::TotalDefense),
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
            AttrType::TeamId => attr_type::ATTR_TEAM_ID,
            AttrType::GuildId => attr_type::ATTR_GUILD_ID,
            AttrType::AttackPower => attr_type::ATTR_ATTACK_POWER,
            AttrType::DefensePower => attr_type::ATTR_DEFENSE_POWER,
            AttrType::StarLevel => attr_type::ATTR_STAR_LEVEL,
            AttrType::GearTier => attr_type::ATTR_GEAR_TIER,
            AttrType::BaseStrength => attr_type::ATTR_BASE_STRENGTH,
            AttrType::Gender => attr_type::ATTR_GENDER,
            AttrType::TotalDefense => attr_type::ATTR_TOTAL_DEFENSE,
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
    pub crit_total: u128,
    pub crit_hits: u128,
    pub lucky_total: u128,
    pub lucky_hits: u128,
    pub hits: u128,
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
    // Extended attribute storage (HP, stats, flags, etc.)
    pub attributes: HashMap<AttrType, AttrValue>,
    // Damage
    pub damage: CombatStats,
    pub skill_uid_to_dmg_skill: HashMap<i64, Skill>,
    // Boss-only damage
    pub damage_boss_only: CombatStats,
    /// Accumulated active damage time in milliseconds for True DPS.
    pub active_dmg_time_ms: u128,
    /// Timestamp of the last damage event used to compute active time.
    pub last_dmg_timestamp_ms: Option<u128>,
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
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SkillTargetStats {
    pub hits: u128,
    pub total_value: u128,
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
    pub crit_total_value: u128,
    pub crit_hits: u128,
    pub lucky_total_value: u128,
    pub lucky_hits: u128,
    pub hits: u128,
}

// Monster names mapping (id -> name)
static MONSTER_NAMES: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    let data = include_str!("../../meter-data/MonsterName.json");
    serde_json::from_str(data).expect("invalid MonsterName.json")
});

// Boss monster IDs (from game data main_category == "boss")
static MONSTER_NAMES_BOSS: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    let data = include_str!("../../meter-data/MonsterNameBoss.json");
    serde_json::from_str(data).expect("invalid MonsterNameBoss.json")
});

// Boss exclusion list (names that should NEVER be treated as bosses)
static BOSS_EXCLUSION_NAMES: LazyLock<HashSet<String>> = LazyLock::new(|| {
    let mut s = HashSet::new();
    s.insert("divine defense tower".to_string());
    s
});

impl Skill {
    pub fn get_skill_name(skill_uid: i64) -> String {
        if let Some(name) = recount_names::lookup_name(skill_uid) {
            return name;
        }

        i32::try_from(skill_uid)
            .ok()
            .and_then(skill_names::lookup)
            .map(|name| format!("{name} ({skill_uid})"))
            .unwrap_or_else(|| skill_uid.to_string())
    }
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
        self.total_dmg = 0;
        self.total_dmg_boss_only = 0;
        self.total_heal = 0;

        // Reset per-entity combat stats while preserving identity
        for entity in self.entity_uid_to_entity.values_mut() {
            // Damage
            entity.damage = CombatStats::default();
            entity.damage_boss_only = CombatStats::default();
            entity.skill_uid_to_dmg_skill.clear();
            entity.dmg_to_target.clear();
            entity.skill_dmg_to_target.clear();
            entity.active_dmg_time_ms = 0;
            entity.last_dmg_timestamp_ms = None;

            // Clear stale HP attributes for monsters so new encounters don't reuse old boss health
            entity.attributes.remove(&AttrType::CurrentHp);
            entity.attributes.remove(&AttrType::MaxHp);

            // Healing
            entity.healing = CombatStats::default();
            entity.skill_uid_to_heal_skill.clear();
            entity.skill_heal_to_target.clear();

            // Taken
            entity.taken = CombatStats::default();
            entity.skill_uid_to_taken_skill.clear();
        }
        // Clear any pending player death tracking for a fresh encounter
        self.pending_player_revives.clear();
        self.last_revive_ms.clear();
        self.last_death_db_ms.clear();

    }
}

pub mod attr_type {
    // TOOD: rename some of these to actual attribute names for now, idk.
    pub const ATTR_NAME: i32 = 0x01;
    pub const ATTR_ID: i32 = 0x0a;
    pub const ATTR_TEAM_ID: i32 = 0x0b; // Party/raid group number
    pub const ATTR_GUILD_ID: i32 = 0x1e; // Guild/clan ID
    pub const ATTR_ATTACK_POWER: i32 = 0x32; // Attack stat
    pub const ATTR_DEFENSE_POWER: i32 = 0x33; // Defense stat
    pub const ATTR_STAR_LEVEL: i32 = 0x34; // Enhancement/star level
    pub const ATTR_GEAR_TIER: i32 = 0x35; // Gear tier/grade
    pub const ATTR_BASE_STRENGTH: i32 = 0x46; // Base strength/attack stat
    pub const ATTR_GENDER: i32 = 0x47; // Character gender/appearance
    pub const ATTR_TOTAL_DEFENSE: i32 = 0x64; // Total defense stat
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
    pub const ATTR_BUFF_SLOT_2: i32 = 0xea92; // Active buff/consumable slot (type 2)
    pub const ATTR_ENERGY_FLAG: i32 = 0x543cd3c6;
}

// TODO: this logic needs to be severely cleaned up
pub mod class {
    pub const UNKNOWN: i32 = 0;
    pub const STORMBLADE: i32 = 1;
    pub const FROST_MAGE: i32 = 2;
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
            WIND_KNIGHT => "Wind Knight",
            VERDANT_ORACLE => "Verdant Oracle",
            HEAVY_GUARDIAN => "Heavy Guardian",
            MARKSMAN => "Marksman",
            SHIELD_KNIGHT => "Shield Knight",
            BEAT_PERFORMER => "Beat Performer",
            _ => "", // empty string for unknown
        })
    }

    #[derive(
        Debug,
        Default,
        Clone,
        Copy,
        PartialEq,
        Eq,
        serde::Serialize,
        serde::Deserialize
    )]
    pub enum ClassSpec {
        #[default]
        Unknown,
        // Stormblade
        Iaido,
        Moonstrike,
        // Frost Mage
        Icicle,
        Frostbeam,
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
            1714 | 1734 => ClassSpec::Iaido,
            1715 | 1733 | 1742 => ClassSpec::Moonstrike,

            120901 | 120902 => ClassSpec::Icicle,
            1241 => ClassSpec::Frostbeam,

            1405 | 1418 => ClassSpec::Vanguard,
            1419 => ClassSpec::Skyward,

            1518 | 1541 | 21402 => ClassSpec::Smite,
            20301 => ClassSpec::Lifebind,

            199902 => ClassSpec::Earthfort,
            1930 | 1931 | 1934 | 1935 => ClassSpec::Block,

            220112 | 2203622 => ClassSpec::Falconry,
            2292 | 1700820 | 1700825 | 1700827 => ClassSpec::Wildpack,

            2406 => ClassSpec::Shield,
            2405 => ClassSpec::Recovery,

            2306 => ClassSpec::Dissonance,
            2307 | 2361 | 55302 => ClassSpec::Concerto,
            _ => ClassSpec::Unknown,
        }
    }

    pub fn get_class_id_from_spec(class_spec: ClassSpec) -> i32 {
        match class_spec {
            ClassSpec::Iaido | ClassSpec::Moonstrike => STORMBLADE,
            ClassSpec::Icicle | ClassSpec::Frostbeam => FROST_MAGE,
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
    /// Get an attribute value by type. TODO: Rename some of these to actual attribute names.
    pub fn get_attr(&self, attr_type: AttrType) -> Option<&AttrValue> {
        self.attributes.get(&attr_type)
    }

    /// Set an attribute value.
    pub fn set_attr(&mut self, attr_type: AttrType, value: AttrValue) {
        self.attributes.insert(attr_type, value);
    }

    /// Get current HP as i64.
    pub fn hp(&self) -> Option<i64> {
        self.get_attr(AttrType::CurrentHp).and_then(|v| v.as_int())
    }

    /// Get max HP as i64.
    pub fn max_hp(&self) -> Option<i64> {
        self.get_attr(AttrType::MaxHp).and_then(|v| v.as_int())
    }

    /// Get rank level as i64.
    pub fn rank_level(&self) -> Option<i64> {
        self.get_attr(AttrType::RankLevel).and_then(|v| v.as_int())
    }

    /// Get crit stat as i64.
    pub fn crit(&self) -> Option<i64> {
        self.get_attr(AttrType::Crit).and_then(|v| v.as_int())
    }

    /// Get lucky stat as i64.
    pub fn lucky(&self) -> Option<i64> {
        self.get_attr(AttrType::Lucky).and_then(|v| v.as_int())
    }

    /// Get haste stat as i64.
    pub fn haste(&self) -> Option<i64> {
        self.get_attr(AttrType::Haste).and_then(|v| v.as_int())
    }

    /// Get mastery stat as i64.
    pub fn mastery(&self) -> Option<i64> {
        self.get_attr(AttrType::Mastery).and_then(|v| v.as_int())
    }

    /// Get element flag as string.
    #[allow(dead_code)]
    pub fn element_flag(&self) -> Option<&str> {
        self.get_attr(AttrType::ElementFlag)
            .and_then(|v| v.as_string())
    }

    /// Get energy flag as string.
    #[allow(dead_code)]
    pub fn energy_flag(&self) -> Option<&str> {
        self.get_attr(AttrType::EnergyFlag)
            .and_then(|v| v.as_string())
    }

    /// Get reduction level as i64.
    pub fn reduction_level(&self) -> Option<i64> {
        self.get_attr(AttrType::ReductionLevel)
            .and_then(|v| v.as_int())
    }

    /// Get team/party ID as i64.
    pub fn team_id(&self) -> Option<i64> {
        self.get_attr(AttrType::TeamId).and_then(|v| v.as_int())
    }

    /// Get attack power as i64.
    #[allow(dead_code)]
    pub fn attack_power(&self) -> Option<i64> {
        self.get_attr(AttrType::AttackPower)
            .and_then(|v| v.as_int())
    }

    /// Get defense power as i64.
    #[allow(dead_code)]
    pub fn defense_power(&self) -> Option<i64> {
        self.get_attr(AttrType::DefensePower)
            .and_then(|v| v.as_int())
    }

    /// Get star/enhancement level as i64.
    #[allow(dead_code)]
    pub fn star_level(&self) -> Option<i64> {
        self.get_attr(AttrType::StarLevel).and_then(|v| v.as_int())
    }

    /// Get gear tier as i64.
    #[allow(dead_code)]
    pub fn gear_tier(&self) -> Option<i64> {
        self.get_attr(AttrType::GearTier).and_then(|v| v.as_int())
    }

    /// Get PvP rank as i64.
    #[allow(dead_code)]
    pub fn pvp_rank(&self) -> Option<i64> {
        self.get_attr(AttrType::PvpRank).and_then(|v| v.as_int())
    }

    /// Get total combat power as i64.
    #[allow(dead_code)]
    pub fn total_power(&self) -> Option<i64> {
        self.get_attr(AttrType::TotalPower).and_then(|v| v.as_int())
    }

    /// Get physical attack stat as i64.
    #[allow(dead_code)]
    pub fn physical_attack(&self) -> Option<i64> {
        self.get_attr(AttrType::PhysicalAttack)
            .and_then(|v| v.as_int())
    }

    /// Get magic attack stat as i64.
    #[allow(dead_code)]
    pub fn magic_attack(&self) -> Option<i64> {
        self.get_attr(AttrType::MagicAttack)
            .and_then(|v| v.as_int())
    }

    /// Get weapon type as i64.
    #[allow(dead_code)]
    pub fn weapon_type(&self) -> Option<i64> {
        self.get_attr(AttrType::WeaponType).and_then(|v| v.as_int())
    }

    /// Get resurrection count as i64.
    #[allow(dead_code)]
    pub fn resurrection_count(&self) -> Option<i64> {
        self.get_attr(AttrType::ResurrectionCount)
            .and_then(|v| v.as_int())
    }

    /// Get party role as i64.
    #[allow(dead_code)]
    pub fn party_role(&self) -> Option<i64> {
        self.get_attr(AttrType::PartyRole).and_then(|v| v.as_int())
    }

    /// Get combat state as i64.
    #[allow(dead_code)]
    pub fn combat_state(&self) -> Option<i64> {
        self.get_attr(AttrType::CombatState)
            .and_then(|v| v.as_int())
    }

    /// Get equipment slot 1 data as i64.
    #[allow(dead_code)]
    pub fn equipment_slot_1(&self) -> Option<i64> {
        self.get_attr(AttrType::EquipmentSlot1)
            .and_then(|v| v.as_int())
    }

    /// Get equipment slot 2 data as i64.
    #[allow(dead_code)]
    pub fn equipment_slot_2(&self) -> Option<i64> {
        self.get_attr(AttrType::EquipmentSlot2)
            .and_then(|v| v.as_int())
    }

    /// Get current shield value as i64.
    #[allow(dead_code)]
    pub fn current_shield(&self) -> Option<i64> {
        self.get_attr(AttrType::CurrentShield)
            .and_then(|v| v.as_int())
    }

    /// Get elemental resistance 1 as i64.
    #[allow(dead_code)]
    pub fn elemental_res_1(&self) -> Option<i64> {
        self.get_attr(AttrType::ElementalRes1)
            .and_then(|v| v.as_int())
    }

    /// Get elemental resistance 2 as i64.
    #[allow(dead_code)]
    pub fn elemental_res_2(&self) -> Option<i64> {
        self.get_attr(AttrType::ElementalRes2)
            .and_then(|v| v.as_int())
    }

    /// Get elemental resistance 3 as i64.
    #[allow(dead_code)]
    pub fn elemental_res_3(&self) -> Option<i64> {
        self.get_attr(AttrType::ElementalRes3)
            .and_then(|v| v.as_int())
    }

    /// Get buff slot data as i64.
    #[allow(dead_code)]
    pub fn buff_slot(&self) -> Option<i64> {
        self.get_attr(AttrType::BuffSlot).and_then(|v| v.as_int())
    }

    /// Assign monster type id and update display name from mapping if available.
    pub fn set_monster_type(&mut self, monster_id: i32) {
        self.monster_type_id = Some(monster_id);
        if let Some(name) = MONSTER_NAMES.get(&monster_id.to_string()) {
            self.name = name.clone();
        }
    }

    /// Determine whether this entity is a boss based on game data categorization.
    /// Uses MONSTER_NAMES_BOSS which contains IDs marked as main_category == "boss"
    /// in the game's quest log data.
    pub fn is_boss(&self) -> bool {
        if self.entity_type != EEntityType::EntMonster {
            return false;
        }

        // Check exclusion list first
        if BOSS_EXCLUSION_NAMES.contains(&self.name.to_lowercase()) {
            return false;
        }
        if let Some(packet_name) = &self.monster_name_packet {
            if BOSS_EXCLUSION_NAMES.contains(&packet_name.to_lowercase()) {
                return false;
            }
        }

        // Check if monster_type_id exists in the boss list
        if self
            .monster_type_id
            .map(|id| MONSTER_NAMES_BOSS.contains_key(&id.to_string()))
            .unwrap_or(false)
        {
            return true;
        }

        // If not identified by ID, check for 'Boss' text in the raw packet name
        if let Some(packet_name) = &self.monster_name_packet {
            if packet_name.to_lowercase().contains("boss") {
                return true;
            }
        }

        // Fallback: if ATTR_ELITE_STATUS is present and non-zero, consider it a boss
        if let Some(elite_status) = self
            .attributes
            .get(&AttrType::EliteStatus)
            .and_then(|v| v.as_int())
        {
            if elite_status > 0 {
                return true;
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excluded_boss_is_not_boss() {
        let mut e = Entity::default();
        e.entity_type = EEntityType::EntMonster;
        e.name = "Divine Defense Tower".to_string();
        // Even if it has boss attributes or name, it should be excluded
        e.monster_name_packet = Some("Boss - Divine Defense Tower".to_string());
        assert!(!e.is_boss());
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
        assert_eq!(AttrType::from_id(0x0b), Some(AttrType::TeamId));
        assert_eq!(AttrType::from_id(0x32), Some(AttrType::AttackPower));
        assert_eq!(AttrType::from_id(0x33), Some(AttrType::DefensePower));
        assert_eq!(AttrType::from_id(0x34), Some(AttrType::StarLevel));
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
        assert_eq!(AttrType::TeamId.to_id(), 0x0b);
        assert_eq!(AttrType::AttackPower.to_id(), 0x32);
        assert_eq!(AttrType::DefensePower.to_id(), 0x33);
        assert_eq!(AttrType::StarLevel.to_id(), 0x34);
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
    fn entity_attribute_storage() {
        let mut entity = Entity::default();

        // Set attributes
        entity.set_attr(AttrType::CurrentHp, AttrValue::Int(1000));
        entity.set_attr(AttrType::MaxHp, AttrValue::Int(1500));
        entity.set_attr(AttrType::RankLevel, AttrValue::Int(50));
        entity.set_attr(AttrType::Crit, AttrValue::Int(250));
        entity.set_attr(AttrType::Lucky, AttrValue::Int(180));
        entity.set_attr(AttrType::Haste, AttrValue::Int(100));
        entity.set_attr(AttrType::Mastery, AttrValue::Int(200));
        entity.set_attr(AttrType::AttackPower, AttrValue::Int(5000));
        entity.set_attr(AttrType::DefensePower, AttrValue::Int(5000));
        entity.set_attr(AttrType::PhysicalAttack, AttrValue::Int(1200));
        entity.set_attr(AttrType::MagicAttack, AttrValue::Int(800));

        // Verify typed getters
        assert_eq!(entity.hp(), Some(1000));
        assert_eq!(entity.max_hp(), Some(1500));
        assert_eq!(entity.rank_level(), Some(50));
        assert_eq!(entity.crit(), Some(250));
        assert_eq!(entity.lucky(), Some(180));
        assert_eq!(entity.haste(), Some(100));
        assert_eq!(entity.mastery(), Some(200));
        assert_eq!(entity.attack_power(), Some(5000));
        assert_eq!(entity.defense_power(), Some(5000));
        assert_eq!(entity.physical_attack(), Some(1200));
        assert_eq!(entity.magic_attack(), Some(800));
    }

    #[test]
    fn entity_attribute_retrieval() {
        let mut entity = Entity::default();
        entity.set_attr(AttrType::CurrentHp, AttrValue::Int(500));

        // Test get_attr
        assert_eq!(
            entity.get_attr(AttrType::CurrentHp),
            Some(&AttrValue::Int(500))
        );
        assert_eq!(entity.get_attr(AttrType::MaxHp), None);
    }

    #[test]
    fn entity_missing_attributes() {
        let entity = Entity::default();

        // All attribute getters should return None for default entity
        assert_eq!(entity.hp(), None);
        assert_eq!(entity.max_hp(), None);
        assert_eq!(entity.rank_level(), None);
        assert_eq!(entity.crit(), None);
        assert_eq!(entity.lucky(), None);
        assert_eq!(entity.haste(), None);
        assert_eq!(entity.mastery(), None);
        assert_eq!(entity.element_flag(), None);
        assert_eq!(entity.energy_flag(), None);
        assert_eq!(entity.reduction_level(), None);
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
