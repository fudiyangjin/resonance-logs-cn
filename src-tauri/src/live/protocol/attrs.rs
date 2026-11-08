//! Attribute identifiers used while decoding protocol observations.

pub const ATTR_NAME: i32 = 0x01;
pub const ATTR_ID: i32 = 0x0a;
pub const ATTR_ACTOR_STATE: i32 = 0x0b;
/// `EActorState::ActorStateDead` — kept as a literal so the protocol-neutral
/// runtime does not depend on the wire crate.
pub const ACTOR_STATE_DEAD: i64 = 9;
pub const ATTR_TARGET_ID: i32 = 0x1e;
pub const ATTR_FACING: i32 = 0x32;
pub const ATTR_DEFENSE_POWER: i32 = 0x33;
pub const ATTR_POS: i32 = 0x34;
pub const ATTR_GEAR_TIER: i32 = 0x35;
pub const ATTR_BASE_STRENGTH: i32 = 0x46;
pub const ATTR_MOVE_TYPE: i32 = 0x47;
pub const ATTR_TOP_SUMMONER_ID: i32 = 0x5b;
pub const ATTR_SKILL_ID: i32 = 0x64;
pub const ATTR_RESURRECTION_COUNT: i32 = 0x65;
pub const ATTR_ENDURANCE: i32 = 0x67;
pub const ATTR_COMBAT_MODE: i32 = 0x68;
/// `AttrSkillBeginTime`: server ms at which the current skill started.
pub const ATTR_SKILL_BEGIN_TIME: i32 = 0x6a;
pub const ATTR_PARTY_ROLE: i32 = 0x6c;
/// `AttrSkillUuid`: changes with every new skill instance, even when the
/// skill id repeats.
pub const ATTR_SKILL_UUID: i32 = 0x6f;
pub const ATTR_COMBAT_STATE: i32 = 0x71;
pub const ATTR_LAST_ACTION_TIMESTAMP: i32 = 0x72;
pub const ATTR_MOVEMENT_SPEED: i32 = 0x74;
pub const ATTR_EQUIPMENT_SLOT_1: i32 = 0x76;
pub const ATTR_EQUIPMENT_SLOT_2: i32 = 0x78;
pub const ATTR_SKILL_REMODEL_LEVEL: i32 = 0x79;
pub const ATTR_ELITE_STATUS: i32 = 0xb6;
pub const ATTR_PROFESSION_ID: i32 = 0xdc;
pub const ATTR_BUFF_SLOT_3: i32 = 0xe2;
pub const ATTR_PVP_RANK: i32 = 0xf9;
pub const ATTR_TOTAL_POWER: i32 = 0x105;
pub const ATTR_PHYSICAL_ATTACK: i32 = 0x106;
pub const ATTR_MAGIC_ATTACK: i32 = 0x107;
pub const ATTR_WEAPON_TYPE: i32 = 0x108;
pub const ATTR_SCENE_BASIC_ID: i32 = 0x155;
pub const ATTR_MAX_STUNNED: i32 = 0x1ba;
pub const ATTR_CURRENT_STUNNED: i32 = 0x1bb;
pub const ATTR_HATE_LIST: i32 = 0x1da;
pub const ATTR_MOUNT_STATUS: i32 = 0x226;
pub const ATTR_MOUNT_TIMESTAMP: i32 = 0x228;
pub const ATTR_MOUNT_SPEED: i32 = 0x22a;
pub const ATTR_MOUNT_DURATION: i32 = 0x22d;
pub const ATTR_LEVEL: i32 = 0x2710;
pub const ATTR_FIGHT_POINT: i32 = 0x272e;
pub const ATTR_RANK_LEVEL: i32 = 0x274c;
pub const ATTR_CRIT: i32 = 0x2b66;
pub const ATTR_LUCKY: i32 = 0x2b7a;
pub const ATTR_HASTE: i32 = 0x2b84;
pub const ATTR_MASTERY: i32 = 0x2b8e;
pub const ATTR_CURRENT_HP: i32 = 0x2c2e;
pub const ATTR_MAX_HP: i32 = 0x2c38;
pub const ATTR_MAX_MP: i32 = 0x2c39;
pub const ATTR_STAMINA: i32 = 0x2c3c;
pub const ATTR_CURRENT_SHIELD: i32 = 0x2c3d;
pub const ATTR_MIN_ENERGY: i32 = 0x2c42;
pub const ATTR_MAX_ENERGY: i32 = 0x2c43;
pub const ATTR_ENERGY_REGEN: i32 = 0x2c46;
pub const ATTR_SEASON_STRENGTH: i32 = 0x2cb0;
pub const ATTR_PHYSICAL_PENETRATION: i32 = 0x2dc8;
pub const ATTR_MAGIC_PENETRATION: i32 = 0x2dd2;
pub const ATTR_SKILL_CD: i32 = 0x2de6;
pub const ATTR_SKILL_CD_PCT: i32 = 0x2df0;
pub const ATTR_CD_ACCELERATE_PCT: i32 = 0x2eb8;
pub const ATTR_ELEMENTAL_RES_1: i32 = 0x3372;
pub const ATTR_ELEMENTAL_RES_2: i32 = 0x3373;
pub const ATTR_ELEMENTAL_RES_3: i32 = 0x3374;
pub const ATTR_REDUCTION_LEVEL: i32 = 0x64696d;
pub const ATTR_REDUCTION_ID: i32 = 0x6f6c65;
pub const ATTR_ELEMENT_FLAG: i32 = 0x646d6c;
pub const ATTR_FIGHT_RESOURCE_IDS: i32 = 0xc351;
pub const ATTR_FIGHT_RESOURCES: i32 = 0xc352;
pub const ATTR_BUFF_SLOT_2: i32 = 0xea92;
pub const ATTR_ENERGY_FLAG: i32 = 0x543cd3c6;

#[must_use]
pub const fn is_known_integer(id: i32) -> bool {
    matches!(
        id,
        ATTR_NAME
            | ATTR_ID
            | ATTR_ACTOR_STATE
            | ATTR_TARGET_ID
            | ATTR_FACING
            | ATTR_DEFENSE_POWER
            | ATTR_POS
            | ATTR_GEAR_TIER
            | ATTR_BASE_STRENGTH
            | ATTR_MOVE_TYPE
            | ATTR_TOP_SUMMONER_ID
            | ATTR_SKILL_ID
            | ATTR_RESURRECTION_COUNT
            | ATTR_ENDURANCE
            | ATTR_COMBAT_MODE
            | ATTR_SKILL_BEGIN_TIME
            | ATTR_PARTY_ROLE
            | ATTR_SKILL_UUID
            | ATTR_COMBAT_STATE
            | ATTR_LAST_ACTION_TIMESTAMP
            | ATTR_MOVEMENT_SPEED
            | ATTR_EQUIPMENT_SLOT_1
            | ATTR_EQUIPMENT_SLOT_2
            | ATTR_SKILL_REMODEL_LEVEL
            | ATTR_ELITE_STATUS
            | ATTR_PROFESSION_ID
            | ATTR_BUFF_SLOT_3
            | ATTR_PVP_RANK
            | ATTR_TOTAL_POWER
            | ATTR_PHYSICAL_ATTACK
            | ATTR_MAGIC_ATTACK
            | ATTR_WEAPON_TYPE
            | ATTR_MOUNT_STATUS
            | ATTR_MOUNT_TIMESTAMP
            | ATTR_MOUNT_SPEED
            | ATTR_MOUNT_DURATION
            | ATTR_LEVEL
            | ATTR_FIGHT_POINT
            | ATTR_RANK_LEVEL
            | ATTR_CRIT
            | ATTR_LUCKY
            | ATTR_HASTE
            | ATTR_MASTERY
            | ATTR_CURRENT_HP
            | ATTR_MAX_HP
            | ATTR_MAX_MP
            | ATTR_STAMINA
            | ATTR_CURRENT_SHIELD
            | ATTR_MIN_ENERGY
            | ATTR_MAX_ENERGY
            | ATTR_ENERGY_REGEN
            | ATTR_SEASON_STRENGTH
            | ATTR_PHYSICAL_PENETRATION
            | ATTR_MAGIC_PENETRATION
            | ATTR_SKILL_CD
            | ATTR_SKILL_CD_PCT
            | ATTR_CD_ACCELERATE_PCT
            | ATTR_ELEMENTAL_RES_1
            | ATTR_ELEMENTAL_RES_2
            | ATTR_ELEMENTAL_RES_3
            | ATTR_REDUCTION_LEVEL
            | ATTR_ELEMENT_FLAG
            | ATTR_FIGHT_RESOURCES
            | ATTR_BUFF_SLOT_2
            | ATTR_ENERGY_FLAG
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_integer_filter_excludes_special_payload_attributes() {
        assert!(is_known_integer(ATTR_CURRENT_HP));
        assert!(!is_known_integer(ATTR_HATE_LIST));
        assert!(!is_known_integer(ATTR_FIGHT_RESOURCE_IDS));
        assert!(!is_known_integer(ATTR_REDUCTION_ID));
    }
}
