use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::database::schema as sch;

/// Represents a row in the `detailed_playerdata` table.
#[derive(Debug, Clone, Queryable, Identifiable, Serialize, Deserialize)]
#[diesel(table_name = sch::detailed_playerdata, primary_key(player_id))]
pub struct DetailedPlayerDataRow {
    /// The unique ID of the player.
    pub player_id: i64,
    /// The timestamp of when the player data was last seen.
    pub last_seen_ms: i64,
    /// The raw binary data of the `CharSerialize` payload.
    pub vdata_bytes: Option<Vec<u8>>,
}

/// Represents a new row to insert into the `detailed_playerdata` table.
#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = sch::detailed_playerdata)]
pub struct NewDetailedPlayerData<'a> {
    /// The unique ID of the player.
    pub player_id: i64,
    /// The timestamp of when the player data was last seen.
    pub last_seen_ms: i64,
    /// The raw binary data of the `CharSerialize` payload.
    pub vdata_bytes: Option<&'a [u8]>,
}

/// Represents an update to an existing row in the `detailed_playerdata` table.
#[derive(Debug, Clone, AsChangeset)]
#[diesel(table_name = sch::detailed_playerdata)]
pub struct UpdateDetailedPlayerData<'a> {
    /// The timestamp of when the player data was last seen.
    pub last_seen_ms: i64,
    /// The raw binary data of the `CharSerialize` payload.
    pub vdata_bytes: Option<&'a [u8]>,
}

/// Represents a row in the `entities` table.
#[derive(Debug, Clone, Queryable, Identifiable, Serialize, Deserialize)]
#[diesel(table_name = sch::entities, primary_key(entity_id))]
pub struct EntityRow {
    /// The unique ID of the entity.
    pub entity_id: i64,
    /// The name of the entity.
    pub name: Option<String>,
    /// The class ID of the entity.
    pub class_id: Option<i32>,
    /// The class spec of the entity.
    pub class_spec: Option<i32>,
    /// The ability score of the entity.
    pub ability_score: Option<i32>,
    /// The level of the entity.
    pub level: Option<i32>,
    /// The timestamp of when the entity was first seen, in milliseconds since the Unix epoch.
    pub first_seen_ms: Option<i64>,
    /// The timestamp of when the entity was last seen, in milliseconds since the Unix epoch.
    pub last_seen_ms: Option<i64>,
    /// The attributes of the entity.
    pub attributes: Option<String>,
}

/// Represents a new entity to be inserted into the `entities` table.
#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = sch::entities)]
pub struct NewEntity<'a> {
    /// The unique ID of the entity.
    pub entity_id: i64,
    /// The name of the entity.
    pub name: Option<&'a str>,
    /// The class ID of the entity.
    pub class_id: Option<i32>,
    /// The class spec of the entity.
    pub class_spec: Option<i32>,
    /// The ability score of the entity.
    pub ability_score: Option<i32>,
    /// The level of the entity.
    pub level: Option<i32>,
    /// The timestamp of when the entity was first seen, in milliseconds since the Unix epoch.
    pub first_seen_ms: Option<i64>,
    /// The timestamp of when the entity was last seen, in milliseconds since the Unix epoch.
    pub last_seen_ms: Option<i64>,
    /// The attributes of the entity.
    pub attributes: Option<&'a str>,
}

/// Represents an update to an entity in the `entities` table.
#[derive(Debug, Clone, AsChangeset)]
#[diesel(table_name = sch::entities)]
pub struct UpdateEntity<'a> {
    /// The name of the entity.
    pub name: Option<&'a str>,
    /// The class ID of the entity.
    pub class_id: Option<i32>,
    /// The class spec of the entity.
    pub class_spec: Option<i32>,
    /// The ability score of the entity.
    pub ability_score: Option<i32>,
    /// The level of the entity.
    pub level: Option<i32>,
    /// The timestamp of when the entity was last seen, in milliseconds since the Unix epoch.
    pub last_seen_ms: Option<i64>,
    /// The attributes of the entity.
    pub attributes: Option<&'a str>,
}

/// Represents a row in the `encounters` table.
#[derive(Debug, Clone, Queryable, Identifiable, Serialize, Deserialize)]
#[diesel(table_name = sch::encounters)]
pub struct EncounterRow {
    /// The unique ID of the encounter.
    pub id: i32,
    /// The timestamp of when the encounter started, in milliseconds since the Unix epoch.
    pub started_at_ms: i64,
    /// The timestamp of when the encounter ended, in milliseconds since the Unix epoch.
    pub ended_at_ms: Option<i64>,
    /// The ID of the local player.
    pub local_player_id: Option<i64>,
    /// The total damage dealt in the encounter.
    pub total_dmg: Option<i64>,
    /// The total healing done in the encounter.
    pub total_heal: Option<i64>,
    /// The ID of the scene where the encounter took place.
    pub scene_id: Option<i32>,
    /// The name of the scene where the encounter took place.
    pub scene_name: Option<String>,
    /// The duration of the encounter in seconds.
    pub duration: f64,
    /// When this encounter was uploaded to the website (ms since epoch).
    pub uploaded_at_ms: Option<i64>,
    /// The encounter ID on the remote website/server after successful upload.
    pub remote_encounter_id: Option<i64>,
    /// Whether the encounter is favorited.
    pub is_favorite: i32,
    /// Whether the encounter was manually reset (should not be uploaded).
    pub is_manually_reset: i32,
    pub boss_names: Option<String>,
    pub player_names: Option<String>,
}

/// Represents a new encounter to be inserted into the `encounters` table.
#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = sch::encounters)]
pub struct NewEncounter {
    /// The timestamp of when the encounter started, in milliseconds since the Unix epoch.
    pub started_at_ms: i64,
    /// The timestamp of when the encounter ended, in milliseconds since the Unix epoch.
    pub ended_at_ms: Option<i64>,
    /// The ID of the local player.
    pub local_player_id: Option<i64>,
    /// The total damage dealt in the encounter.
    pub total_dmg: Option<i64>,
    /// The total healing done in the encounter.
    pub total_heal: Option<i64>,
    /// The ID of the scene where the encounter took place.
    pub scene_id: Option<i32>,
    /// The name of the scene where the encounter took place.
    pub scene_name: Option<String>,
    /// The duration of the encounter in seconds.
    pub duration: f64,
}

#[derive(Debug, Clone, Queryable, Identifiable, Associations, Serialize, Deserialize)]
#[diesel(table_name = sch::encounter_data, primary_key(encounter_id))]
#[diesel(belongs_to(EncounterRow, foreign_key = encounter_id))]
pub struct EncounterDataRow {
    pub encounter_id: i32,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = sch::encounter_data)]
pub struct NewEncounterData<'a> {
    pub encounter_id: i32,
    pub data: &'a [u8],
}
