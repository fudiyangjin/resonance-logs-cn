// @generated automatically by Diesel CLI, but maintained manually here.
// Keep in sync with migrations.

// Represents the `entities` table.
diesel::table! {
    entities (entity_id) {
        // The unique ID of the entity.
        entity_id -> BigInt,
        // The name of the entity.
        name -> Nullable<Text>,
        // The class ID of the entity.
        class_id -> Nullable<Integer>,
        // The class spec of the entity.
        class_spec -> Nullable<Integer>,
        // The ability score of the entity.
        ability_score -> Nullable<Integer>,
        // The level of the entity.
        level -> Nullable<Integer>,
        // The timestamp of when the entity was first seen, in milliseconds since the Unix epoch.
        first_seen_ms -> Nullable<BigInt>,
        // The timestamp of when the entity was last seen, in milliseconds since the Unix epoch.
        last_seen_ms -> Nullable<BigInt>,
        // The attributes of the entity.
        attributes -> Nullable<Text>,
    }
}

// Represents the `detailed_playerdata` table.
diesel::table! {
    detailed_playerdata (player_id) {
        // The unique ID of the player.
        player_id -> BigInt,
        // The timestamp of when the player data was last seen.
        last_seen_ms -> BigInt,
        // The raw binary data of the `CharSerialize` payload.
        vdata_bytes -> Nullable<Binary>,
    }
}

// Represents the `encounters` table.
diesel::table! {
    encounters (id) {
        // The unique ID of the encounter.
        id -> Integer,
        // The timestamp of when the encounter started, in milliseconds since the Unix epoch.
        started_at_ms -> BigInt,
        // The timestamp of when the encounter ended, in milliseconds since the Unix epoch.
        ended_at_ms -> Nullable<BigInt>,
        // The ID of the local player.
        local_player_id -> Nullable<BigInt>,
        // The total damage dealt in the encounter.
        total_dmg -> Nullable<BigInt>,
        // The total healing done in the encounter.
        total_heal -> Nullable<BigInt>,
        // Exact non-negative encounter totals.
        total_dmg_exact -> Nullable<Text>,
        total_heal_exact -> Nullable<Text>,
        // The ID of the scene where the encounter took place.
        scene_id -> Nullable<Integer>,
        // Dungeon difficulty suffix for the scene, if known.
        dungeon_difficulty -> Nullable<Integer>,
        // The duration of the encounter in seconds.
        duration -> Double,
        // The accumulated active combat duration in seconds.
        active_combat_duration -> Nullable<Double>,
        // Timestamp (ms) when this encounter was successfully uploaded to the website.
        uploaded_at_ms -> Nullable<BigInt>,
        // The encounter ID on the remote website/server after successful upload.
        remote_encounter_id -> Nullable<BigInt>,
        // Whether the encounter is favorited.
        is_favorite -> Integer,
        // User-authored note used to identify this encounter.
        note -> Nullable<Text>,
        // Whether this encounter was manually reset by the user (should not be uploaded).
        is_manually_reset -> Integer,
        // JSON-encoded array of boss monster template IDs for fast list/filter queries.
        boss_monster_ids -> Nullable<Text>,
        // JSON-encoded array of player names for fast list/filter queries.
        player_names -> Nullable<Text>,
        // Bitset describing any known loss or degradation in encounter detail.
        quality_flags -> Integer,
    }
}

// Immutable raw historical facts, sealed independently per stream.
diesel::table! {
    encounter_event_chunks (encounter_id, stream_kind, chunk_index) {
        encounter_id -> Integer,
        stream_kind -> Text,
        chunk_index -> BigInt,
        first_sequence -> BigInt,
        last_sequence -> BigInt,
        start_offset_ms -> BigInt,
        end_offset_ms_exclusive -> BigInt,
        event_count -> BigInt,
        data -> Binary,
    }
}

// Finalized full-encounter projection used by the detail view.
diesel::table! {
    encounter_projection (encounter_id) {
        encounter_id -> Integer,
        last_sequence -> BigInt,
        quality_flags -> Integer,
        data -> Binary,
    }
}

// Simple key-value config table for app settings.
diesel::table! {
    app_config (key) {
        // The config key.
        key -> Text,
        // The config value.
        value -> Text,
    }
}

diesel::joinable!(encounter_event_chunks -> encounters (encounter_id));
diesel::joinable!(encounter_projection -> encounters (encounter_id));
diesel::allow_tables_to_appear_in_same_query!(
    entities,
    encounters,
    encounter_event_chunks,
    encounter_projection,
    detailed_playerdata,
    app_config,
);
