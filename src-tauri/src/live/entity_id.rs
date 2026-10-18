const ENTITY_TYPE_SHIFT: i64 = 6;
const ENTITY_UID_SHIFT: i64 = 16;
const ENTITY_TYPE_MASK: i64 = 0xff;
const ENTITY_TYPE_CHARACTER: i64 = 10;

#[inline]
pub fn uid_from_uuid(uuid: i64) -> i64 {
    uuid >> ENTITY_UID_SHIFT
}

#[inline]
pub fn canonical_player_uuid(char_id: i64) -> i64 {
    entity_id_to_uuid(char_id, ENTITY_TYPE_CHARACTER, false, false)
}

#[inline]
fn entity_id_to_uuid(uid: i64, entity_type: i64, is_summon: bool, is_client: bool) -> i64 {
    let summon_bit = if is_summon { 1_i64 } else { 0 };
    let client_bit = if is_client { 1_i64 } else { 0 };
    (uid << ENTITY_UID_SHIFT)
        | (summon_bit << 15)
        | (client_bit << 14)
        | ((entity_type & ENTITY_TYPE_MASK) << ENTITY_TYPE_SHIFT)
}

#[inline]
pub fn entity_type_bits(uuid: i64) -> i32 {
    ((uuid >> ENTITY_TYPE_SHIFT) & ENTITY_TYPE_MASK) as i32
}

/// Whether `uuid` addresses a player character, read from its type bits so
/// it holds even for entities this client has never seen.
#[inline]
pub fn is_character_uuid(uuid: i64) -> bool {
    i64::from(entity_type_bits(uuid)) == ENTITY_TYPE_CHARACTER
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_player_uuid_round_trips_to_uid() {
        let uid = 12_345_678;
        let uuid = canonical_player_uuid(uid);

        assert_eq!(uid_from_uuid(uuid), uid);
        assert_eq!(entity_type_bits(uuid), ENTITY_TYPE_CHARACTER as i32);
    }

    #[test]
    fn same_uid_can_have_distinct_entity_uuids() {
        let uid = 42;
        let player_uuid = entity_id_to_uuid(uid, ENTITY_TYPE_CHARACTER, false, false);
        let monster_uuid = entity_id_to_uuid(uid, 1, false, false);

        assert_eq!(uid_from_uuid(player_uuid), uid);
        assert_eq!(uid_from_uuid(monster_uuid), uid);
        assert_ne!(player_uuid, monster_uuid);
        assert_ne!(
            entity_type_bits(player_uuid),
            entity_type_bits(monster_uuid)
        );
    }

    #[test]
    fn is_character_uuid_reads_type_bits_only() {
        assert!(is_character_uuid(canonical_player_uuid(7)));
        assert!(!is_character_uuid(entity_id_to_uuid(7, 1, true, false)));
    }
}
