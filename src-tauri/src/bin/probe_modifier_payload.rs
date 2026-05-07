use diesel::prelude::*;
use diesel::sql_types::{Binary, Integer};
use blueprotobuf_lib::blueprotobuf::EEntityType;
use resonance_logs_lib::live::commands_models as lc;
use resonance_logs_lib::live::opcodes_models::{Entity, ObservedModifierHitBucket};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::time::Instant;

#[derive(QueryableByName)]
struct EncounterDataRow {
    #[diesel(sql_type = Integer)]
    encounter_id: i32,
    #[diesel(sql_type = Binary)]
    data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ReportKey {
    modifier_base_id: i32,
    modifier_source_config_id: Option<i32>,
    modifier_host_uid: i64,
    modifier_source_uid: i64,
    skill_key: i64,
    damage_id: i64,
    is_heal: bool,
}

#[derive(Serialize)]
struct ProbeReport {
    database_path: String,
    encounter_id: i32,
    player_uid: i64,
    entities: usize,
    player_name: String,
    player_damage_hits: u128,
    raw_modifier_buckets: usize,
    raw_modifier_buckets_with_hits: usize,
    report_compact_buckets: usize,
    report_compact_ratio: f64,
    no_target_compact_buckets: usize,
    no_target_compact_ratio: f64,
    source_skill_compact_buckets: usize,
    source_skill_compact_ratio: f64,
    source_skill_target_compact_buckets: usize,
    source_skill_target_compact_ratio: f64,
    modifier_windows: usize,
    unique_modifier_ids: usize,
    unique_source_config_ids: usize,
    unique_damage_lanes: usize,
    unique_targets: usize,
    load_ms: u128,
    decompress_ms: u128,
    decode_ms: u128,
    count_ms: u128,
    total_ms: u128,
}

fn default_db_path() -> PathBuf {
    if let Some(mut dir) = dirs::data_local_dir() {
        dir.push("resonance-logs-global");
        dir.join("resonance-logs-global.db")
    } else {
        PathBuf::from("resonance-logs-global.db")
    }
}

fn report_key(bucket: &ObservedModifierHitBucket) -> ReportKey {
    ReportKey {
        modifier_base_id: bucket.modifier_base_id,
        modifier_source_config_id: bucket.modifier_source_config_id,
        modifier_host_uid: bucket.modifier_host_uid,
        modifier_source_uid: bucket.modifier_source_uid,
        skill_key: bucket.skill_key,
        damage_id: bucket.damage_id,
        is_heal: bucket.is_heal,
    }
}

fn parse_arg<T: std::str::FromStr>(args: &[String], name: &str, default: T) -> T {
    args.windows(2)
        .find_map(|pair| {
            (pair[0] == name)
                .then(|| pair[1].parse::<T>().ok())
                .flatten()
        })
        .unwrap_or(default)
}

fn report_key_for_state(bucket: &lc::ModifierHitBucketState) -> ReportKey {
    ReportKey {
        modifier_base_id: bucket.modifier_base_id,
        modifier_source_config_id: bucket.modifier_source_config_id,
        modifier_host_uid: bucket.modifier_host_uid,
        modifier_source_uid: bucket.modifier_source_uid,
        skill_key: bucket.skill_key,
        damage_id: bucket.damage_id,
        is_heal: bucket.is_heal,
    }
}

fn merge_state_bucket(target: &mut lc::ModifierHitBucketState, source: lc::ModifierHitBucketState) {
    target.hits = target.hits.saturating_add(source.hits);
    target.total_value = target.total_value.saturating_add(source.total_value);
    target.effective_total_value = target
        .effective_total_value
        .saturating_add(source.effective_total_value);
    target.crit_hits = target.crit_hits.saturating_add(source.crit_hits);
    target.crit_total_value = target
        .crit_total_value
        .saturating_add(source.crit_total_value);
    target.lucky_hits = target.lucky_hits.saturating_add(source.lucky_hits);
    target.lucky_total_value = target
        .lucky_total_value
        .saturating_add(source.lucky_total_value);
    target.hp_loss_total = target.hp_loss_total.saturating_add(source.hp_loss_total);
    target.shield_loss_total = target
        .shield_loss_total
        .saturating_add(source.shield_loss_total);
    target.first_hit_time_ms = target.first_hit_time_ms.min(source.first_hit_time_ms);
    target.last_hit_time_ms = target.last_hit_time_ms.max(source.last_hit_time_ms);
    target.modifier_start_time_ms = target.first_hit_time_ms;
    target.modifier_end_time_ms = Some(target.last_hit_time_ms);
}

fn compact_state_buckets_for_report(
    buckets: impl IntoIterator<Item = lc::ModifierHitBucketState>,
) -> Vec<lc::ModifierHitBucketState> {
    let mut compacted = HashMap::<ReportKey, lc::ModifierHitBucketState>::new();
    for mut bucket in buckets {
        bucket.modifier_buff_uuid = 0;
        bucket.modifier_buff_level = None;
        bucket.modifier_part_id = None;
        bucket.modifier_count = None;
        bucket.modifier_fight_source_type = None;
        bucket.modifier_layer = 0;
        bucket.modifier_duration_ms = 0;
        bucket.modifier_start_time_ms = bucket.first_hit_time_ms;
        bucket.modifier_end_time_ms = Some(bucket.last_hit_time_ms);
        bucket.owner_id = 0;
        bucket.owner_level = None;
        bucket.damage_source = None;
        bucket.property = None;
        bucket.damage_mode = None;
        bucket.attacker_uid = 0;
        bucket.original_attacker_uid = 0;
        bucket.top_summoner_uid = None;
        bucket.target_uid = 0;
        bucket.target_monster_type_id = None;

        let key = report_key_for_state(&bucket);
        if let Some(existing) = compacted.get_mut(&key) {
            merge_state_bucket(existing, bucket);
        } else {
            compacted.insert(key, bucket);
        }
    }

    let mut rows: Vec<_> = compacted.into_values().collect();
    rows.sort_by(|left, right| {
        right
            .total_value
            .cmp(&left.total_value)
            .then_with(|| right.hits.cmp(&left.hits))
            .then_with(|| left.modifier_base_id.cmp(&right.modifier_base_id))
            .then_with(|| left.skill_key.cmp(&right.skill_key))
    });
    rows
}

fn push_unique_i32(values: &mut Vec<i32>, value: i32) {
    if value > 0 && !values.contains(&value) {
        values.push(value);
    }
}

fn source_actor_display_name(uid: i64, entity: Option<&Entity>) -> String {
    if let Some(entity) = entity {
        let name = entity.name.trim();
        if !name.is_empty() {
            return name.to_string();
        }
        if let Some(monster_name) = entity.monster_name_packet.as_ref().map(|name| name.trim()) {
            if !monster_name.is_empty() {
                return monster_name.to_string();
            }
        }
    }
    format!("#{}", uid)
}

fn is_hosted_on(host_uid: i64, fallback_uid: i64, target_uid: i64) -> bool {
    let resolved_host_uid = if host_uid > 0 { host_uid } else { fallback_uid };
    resolved_host_uid == target_uid
}

fn source_actor_entity_type(entity: Option<&Entity>) -> String {
    entity
        .map(|entity| format!("{:?}", entity.entity_type))
        .unwrap_or_else(|| "Unknown".to_string())
}

fn add_modifier_source_owner_hint(
    owners: &mut HashMap<i64, (i64, String)>,
    ambiguous_sources: &mut HashSet<i64>,
    entities: &HashMap<i64, Entity>,
    target_uid: i64,
    owner_uid: i64,
    owner_entity: &Entity,
    host_uid: i64,
    source_uid: i64,
) {
    if source_uid <= 0
        || source_uid == owner_uid
        || ambiguous_sources.contains(&source_uid)
        || !is_hosted_on(host_uid, owner_uid, target_uid)
        || entities
            .get(&source_uid)
            .is_some_and(|entity| entity.entity_type == EEntityType::EntChar)
    {
        return;
    }

    if let Some((existing_owner_uid, _)) = owners.get(&source_uid) {
        if *existing_owner_uid != owner_uid {
            owners.remove(&source_uid);
            ambiguous_sources.insert(source_uid);
        }
        return;
    }

    owners.insert(
        source_uid,
        (
            owner_uid,
            source_actor_display_name(owner_uid, Some(owner_entity)),
        ),
    );
}

fn build_modifier_source_owner_index(
    target_uid: i64,
    entities: &HashMap<i64, Entity>,
) -> HashMap<i64, (i64, String)> {
    let mut owners = HashMap::<i64, (i64, String)>::new();
    let mut ambiguous_sources = HashSet::<i64>::new();

    for (&owner_uid, owner_entity) in entities {
        if owner_entity.entity_type != EEntityType::EntChar {
            continue;
        }

        for buff in &owner_entity.active_buffs {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                buff.host_uid,
                buff.source_uid,
            );
        }
        for buff in &owner_entity.active_factor_buffs {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                buff.host_uid,
                buff.source_uid,
            );
        }
        for buff in &owner_entity.active_effect_buffs {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                buff.host_uid,
                buff.source_uid,
            );
        }
        for window in &owner_entity.modifier_windows {
            add_modifier_source_owner_hint(
                &mut owners,
                &mut ambiguous_sources,
                entities,
                target_uid,
                owner_uid,
                owner_entity,
                window.host_uid,
                window.source_uid,
            );
        }
    }

    owners
}

fn source_actor_owner_hint_from_bucket(
    source_uid: i64,
    bucket: &ObservedModifierHitBucket,
    entities: &HashMap<i64, Entity>,
) -> Option<(i64, String)> {
    if source_uid <= 0
        || bucket.original_attacker_uid != source_uid
        || entities
            .get(&source_uid)
            .is_some_and(|entity| entity.entity_type == EEntityType::EntChar)
    {
        return None;
    }

    let owner_uid = bucket
        .top_summoner_uid
        .filter(|uid| *uid > 0 && *uid != source_uid)
        .or_else(|| {
            (bucket.attacker_uid > 0 && bucket.attacker_uid != source_uid)
                .then_some(bucket.attacker_uid)
        })?;
    let owner_entity = entities.get(&owner_uid)?;
    if owner_entity.entity_type != EEntityType::EntChar {
        return None;
    }

    Some((
        owner_uid,
        source_actor_display_name(owner_uid, Some(owner_entity)),
    ))
}

fn build_modifier_source_actor_refs(
    target_uid: i64,
    entity: &Entity,
    entities: &HashMap<i64, Entity>,
) -> Vec<lc::ModifierSourceActorState> {
    let mut actors = HashMap::<i64, lc::ModifierSourceActorState>::new();
    let owner_index = build_modifier_source_owner_index(target_uid, entities);
    for bucket in &entity.modifier_hit_buckets {
        if !resonance_logs_lib::live::modifier_recount::is_reportable_modifier_bucket(
            bucket.modifier_base_id,
            bucket.modifier_source_config_id,
        ) {
            continue;
        }
        if bucket.modifier_source_uid <= 0 {
            continue;
        }
        let source_entity = entities.get(&bucket.modifier_source_uid);
        let owner_hint = owner_index
            .get(&bucket.modifier_source_uid)
            .cloned()
            .or_else(|| {
                source_actor_owner_hint_from_bucket(bucket.modifier_source_uid, bucket, entities)
            });
        let actor = actors.entry(bucket.modifier_source_uid).or_insert_with(|| {
            lc::ModifierSourceActorState {
                uid: bucket.modifier_source_uid,
                name: source_actor_display_name(bucket.modifier_source_uid, source_entity),
                entity_type: source_actor_entity_type(source_entity),
                owner_uid: owner_hint.as_ref().map(|(owner_uid, _)| *owner_uid),
                owner_name: owner_hint.as_ref().map(|(_, owner_name)| owner_name.clone()),
                source_config_ids: Vec::new(),
                base_ids: Vec::new(),
            }
        });
        if actor.owner_uid.is_none() {
            if let Some((owner_uid, owner_name)) = owner_hint {
                actor.owner_uid = Some(owner_uid);
                actor.owner_name = Some(owner_name);
            }
        }
        if let Some(source_config_id) = bucket.modifier_source_config_id {
            push_unique_i32(&mut actor.source_config_ids, source_config_id);
        }
        push_unique_i32(&mut actor.base_ids, bucket.modifier_base_id);
    }

    let mut rows: Vec<_> = actors.into_values().collect();
    for row in &mut rows {
        row.source_config_ids.sort_unstable();
        row.base_ids.sort_unstable();
    }
    rows.sort_by_key(|row| row.uid);
    rows
}

fn build_report_entity(
    uid: i64,
    entity: &Entity,
    entities: &HashMap<i64, Entity>,
) -> lc::HistoryEntityData {
    lc::HistoryEntityData {
        uid,
        name: entity.name.clone(),
        class_id: entity.class_id,
        class_spec: entity.class_spec as i32,
        class_name: String::new(),
        class_spec_name: String::new(),
        ability_score: entity.ability_score,
        season_strength: entity.season_strength,
        damage: lc::to_raw_combat_stats(&entity.damage),
        damage_boss_only: lc::RawCombatStats::default(),
        healing: lc::RawCombatStats::default(),
        taken: lc::RawCombatStats::default(),
        dmg_skills: entity
            .skill_uid_to_dmg_skill
            .iter()
            .map(|(skill_id, stats)| (*skill_id, lc::to_raw_skill_stats(stats)))
            .collect(),
        heal_skills: HashMap::new(),
        taken_skills: HashMap::new(),
        active_buffs: entity
            .active_buffs
            .iter()
            .map(lc::to_active_buff_state)
            .collect(),
        active_factor_buffs: entity
            .active_factor_buffs
            .iter()
            .map(lc::to_active_factor_buff_state)
            .collect(),
        active_effect_buffs: entity
            .active_effect_buffs
            .iter()
            .map(lc::to_active_effect_buff_state)
            .collect(),
        modifier_windows: entity
            .modifier_windows
            .iter()
            .map(lc::to_modifier_window_state)
            .collect(),
        modifier_hit_buckets: compact_state_buckets_for_report(
            entity
                .modifier_hit_buckets
                .iter()
                .map(lc::to_modifier_hit_bucket_state),
        ),
        modifier_replay_hits: entity
            .modifier_replay_hits
            .iter()
            .map(lc::to_modifier_replay_hit_state)
            .collect(),
        skill_cast_events: entity
            .skill_cast_events
            .iter()
            .map(lc::to_skill_cast_event_state)
            .collect(),
        skill_cooldown_events: entity
            .skill_cooldown_events
            .iter()
            .map(lc::to_skill_cooldown_event_state)
            .collect(),
        active_effect_sources: entity
            .active_effect_sources
            .iter()
            .map(lc::to_active_effect_source_state)
            .collect(),
        active_factor_items: entity
            .active_factor_items
            .iter()
            .map(lc::to_active_factor_item_state)
            .collect(),
        active_passive_skills: entity
            .active_passive_skills
            .iter()
            .map(lc::to_active_passive_skill_state)
            .collect(),
        active_profession_talents: entity
            .active_profession_talents
            .iter()
            .map(lc::to_active_profession_talent_state)
            .collect(),
        modifier_source_actors: build_modifier_source_actor_refs(uid, entity, entities),
        dmg_per_target: Vec::new(),
        heal_per_target: Vec::new(),
        deaths: Vec::new(),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let started = Instant::now();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let db_path = args
        .windows(2)
        .find_map(|pair| (pair[0] == "--db").then(|| PathBuf::from(&pair[1])))
        .unwrap_or_else(default_db_path);
    let encounter_id = parse_arg(&args, "--encounter-id", 195_i32);
    let player_uid = parse_arg(&args, "--player-uid", 3296036_i64);
    let entity_json_out = args
        .windows(2)
        .find_map(|pair| (pair[0] == "--entity-json-out").then(|| PathBuf::from(&pair[1])));

    let load_started = Instant::now();
    let mut conn = diesel::sqlite::SqliteConnection::establish(&db_path.to_string_lossy())?;
    let row: EncounterDataRow = diesel::sql_query(
        "SELECT encounter_id, data FROM encounter_data WHERE encounter_id = ? LIMIT 1",
    )
    .bind::<Integer, _>(encounter_id)
    .get_result(&mut conn)?;
    let load_ms = load_started.elapsed().as_millis();

    let decompress_started = Instant::now();
    let decompressed = zstd::decode_all(&row.data[..])?;
    let decompress_ms = decompress_started.elapsed().as_millis();

    let decode_started = Instant::now();
    let entities: HashMap<i64, Entity> = rmp_serde::from_slice(&decompressed)?;
    let decode_ms = decode_started.elapsed().as_millis();

    let count_started = Instant::now();
    let Some(entity) = entities.get(&player_uid) else {
        return Err(format!("player uid {player_uid} was not found").into());
    };

    if let Some(path) = entity_json_out {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let report_entity = build_report_entity(player_uid, entity, &entities);
        std::fs::write(path, serde_json::to_vec(&report_entity)?)?;
    }

    let mut report_keys = HashSet::<ReportKey>::new();
    let mut no_target_keys = HashSet::<String>::new();
    let mut source_skill_keys = HashSet::<String>::new();
    let mut source_skill_target_keys = HashSet::<String>::new();
    let mut modifier_ids = HashSet::<i32>::new();
    let mut source_config_ids = HashSet::<i32>::new();
    let mut damage_lanes = HashSet::<String>::new();
    let mut targets = HashSet::<i64>::new();
    let mut raw_with_hits = 0usize;

    for bucket in &entity.modifier_hit_buckets {
        if bucket.hits > 0 {
            raw_with_hits += 1;
        }
        if bucket.modifier_base_id > 0 {
            modifier_ids.insert(bucket.modifier_base_id);
        }
        if let Some(source_config_id) = bucket.modifier_source_config_id {
            if source_config_id > 0 {
                source_config_ids.insert(source_config_id);
            }
        }
        damage_lanes.insert(
            [
                bucket.skill_key.to_string(),
                bucket.damage_id.to_string(),
                bucket.owner_id.to_string(),
                bucket
                    .damage_source
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket
                    .property
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket
                    .damage_mode
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.is_heal.to_string(),
            ]
            .join(":"),
        );
        if bucket.target_uid > 0 {
            targets.insert(bucket.target_uid);
        }
        report_keys.insert(report_key(bucket));
        no_target_keys.insert(
            [
                bucket.modifier_base_id.to_string(),
                bucket
                    .modifier_source_config_id
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.modifier_host_uid.to_string(),
                bucket.modifier_source_uid.to_string(),
                bucket.skill_key.to_string(),
                bucket.damage_id.to_string(),
                bucket.owner_id.to_string(),
                bucket
                    .owner_level
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket
                    .damage_source
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket
                    .property
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket
                    .damage_mode
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.attacker_uid.to_string(),
                bucket.original_attacker_uid.to_string(),
                bucket
                    .top_summoner_uid
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.is_heal.to_string(),
            ]
            .join(":"),
        );
        source_skill_keys.insert(
            [
                bucket.modifier_base_id.to_string(),
                bucket
                    .modifier_source_config_id
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.modifier_host_uid.to_string(),
                bucket.modifier_source_uid.to_string(),
                bucket.skill_key.to_string(),
                bucket.damage_id.to_string(),
                bucket.is_heal.to_string(),
            ]
            .join(":"),
        );
        source_skill_target_keys.insert(
            [
                bucket.modifier_base_id.to_string(),
                bucket
                    .modifier_source_config_id
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.modifier_host_uid.to_string(),
                bucket.modifier_source_uid.to_string(),
                bucket.skill_key.to_string(),
                bucket.damage_id.to_string(),
                bucket.target_uid.to_string(),
                bucket
                    .target_monster_type_id
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                bucket.is_heal.to_string(),
            ]
            .join(":"),
        );
    }
    let count_ms = count_started.elapsed().as_millis();

    let report = ProbeReport {
        database_path: db_path.to_string_lossy().to_string(),
        encounter_id: row.encounter_id,
        player_uid,
        entities: entities.len(),
        player_name: entity.name.clone(),
        player_damage_hits: entity.damage.hits,
        raw_modifier_buckets: entity.modifier_hit_buckets.len(),
        raw_modifier_buckets_with_hits: raw_with_hits,
        report_compact_buckets: report_keys.len(),
        report_compact_ratio: if entity.modifier_hit_buckets.is_empty() {
            0.0
        } else {
            report_keys.len() as f64 / entity.modifier_hit_buckets.len() as f64
        },
        no_target_compact_buckets: no_target_keys.len(),
        no_target_compact_ratio: if entity.modifier_hit_buckets.is_empty() {
            0.0
        } else {
            no_target_keys.len() as f64 / entity.modifier_hit_buckets.len() as f64
        },
        source_skill_compact_buckets: source_skill_keys.len(),
        source_skill_compact_ratio: if entity.modifier_hit_buckets.is_empty() {
            0.0
        } else {
            source_skill_keys.len() as f64 / entity.modifier_hit_buckets.len() as f64
        },
        source_skill_target_compact_buckets: source_skill_target_keys.len(),
        source_skill_target_compact_ratio: if entity.modifier_hit_buckets.is_empty() {
            0.0
        } else {
            source_skill_target_keys.len() as f64 / entity.modifier_hit_buckets.len() as f64
        },
        modifier_windows: entity.modifier_windows.len(),
        unique_modifier_ids: modifier_ids.len(),
        unique_source_config_ids: source_config_ids.len(),
        unique_damage_lanes: damage_lanes.len(),
        unique_targets: targets.len(),
        load_ms,
        decompress_ms,
        decode_ms,
        count_ms,
        total_ms: started.elapsed().as_millis(),
    };

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
