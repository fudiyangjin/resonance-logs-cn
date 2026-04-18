use crate::live::state::{resolve_entity_display_name, AppState, AppStateManager, StateEvent};
use crate::live::{
    commands_models::{
        BossBuffUpdatePayload, BuffCounterUpdatePayload, BuffUpdatePayload, EntityNameMapPayload,
        FightResourceUpdatePayload, HateListUpdatePayload, LiveDataPayload,
        PanelAttrUpdatePayload, SkillCdUpdatePayload,
    },
    custom_trigger_events::emit_custom_trigger_entries,
    event_logger::{
        emit_logger_entries, flush_current_session_to_file, now_ms, EventLoggerEntry,
        EventLoggerSessionContext,
    },
    event_manager::{EncounterUpdatePayload, SceneChangePayload},
    event_manager::{OutboundEvent, safe_emit_to},
    opcodes_models::AttrType,
};
use crate::packets;
use blueprotobuf_lib::blueprotobuf;
use bytes::Bytes;
use log::{debug, info, trace, warn};
use prost::Message;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc::UnboundedReceiver;


fn emit_auxiliary_entries(app_handle: &AppHandle, entries: Vec<EventLoggerEntry>) {
    emit_custom_trigger_entries(app_handle, entries.clone());
    emit_logger_entries(app_handle, entries);
}

fn sync_log_channel_from_text(text: &str) -> Option<&'static str> {
    let lower = text.to_lowercase();
    if lower.contains("[team]") || lower.contains(" team ") || lower.contains("队伍") || lower.contains("队聊") {
        return Some("team");
    }
    if lower.contains("[guild]") || lower.contains(" guild ") || lower.contains("公会") {
        return Some("guild");
    }
    if lower.contains("[world]") || lower.contains(" world ") || lower.contains("世界") || lower.contains("频道#") || lower.contains("频道 #") {
        return Some("world");
    }
    if lower.contains("[general]") || lower.contains(" general ") || lower.contains("综合") || lower.contains("附近") {
        return Some("general");
    }
    if lower.contains("[system]") || lower.contains(" system ") || lower.contains("系统") {
        return Some("system");
    }
    None
}

fn sync_log_looks_like_chat(text: &str) -> bool {
    let trimmed = text.trim();
    let lower = trimmed.to_lowercase();
    if sync_log_channel_from_text(trimmed).is_some() {
        return true;
    }
    if lower.starts_with('#') || lower.contains("[chat]") || lower.contains("聊天") {
        return true;
    }
    let has_speaker_delimiter = trimmed.contains(": ") || trimmed.contains("：") || trimmed.contains("] ");
    let has_chat_hint = ["team", "guild", "world", "general", "system", "队伍", "公会", "世界", "综合", "系统"]
        .iter()
        .any(|needle| lower.contains(needle));
    has_speaker_delimiter && has_chat_hint
}

fn sync_log_contains_drop_hint(text: &str) -> bool {
    let lower = text.to_lowercase();
    ["obtained", "received", "loot", "looted", "drop", "picked up", "reward", "奖励", "获得", "掉落", "拾取"]
        .iter()
        .any(|needle| lower.contains(needle))
}

fn logger_value_as_string(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(v) => Some(v.clone()),
        serde_json::Value::Number(v) => Some(v.to_string()),
        serde_json::Value::Bool(v) => Some(v.to_string()),
        _ => None,
    }
}

fn logger_find_string_field(value: &serde_json::Value, field_names: &[&str]) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            for field_name in field_names {
                if let Some(found) = map.get(*field_name).and_then(logger_value_as_string) {
                    let trimmed = found.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
            for nested in map.values() {
                if let Some(found) = logger_find_string_field(nested, field_names) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| logger_find_string_field(item, field_names)),
        _ => None,
    }
}

fn logger_find_i64_field(value: &serde_json::Value, field_names: &[&str]) -> Option<i64> {
    match value {
        serde_json::Value::Object(map) => {
            for field_name in field_names {
                if let Some(found) = map.get(*field_name) {
                    match found {
                        serde_json::Value::Number(v) => {
                            if let Some(parsed) = v.as_i64() {
                                return Some(parsed);
                            }
                        }
                        serde_json::Value::String(v) => {
                            if let Ok(parsed) = v.trim().parse::<i64>() {
                                return Some(parsed);
                            }
                        }
                        _ => {}
                    }
                }
            }
            for nested in map.values() {
                if let Some(found) = logger_find_i64_field(nested, field_names) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| logger_find_i64_field(item, field_names)),
        _ => None,
    }
}

fn build_sync_log_logger_entry(ts_ms: i64, sync_log: blueprotobuf::SyncLog) -> Option<EventLoggerEntry> {
    let raw_log = sync_log.log.unwrap_or_default();
    let trimmed = raw_log.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed_json = serde_json::from_str::<serde_json::Value>(trimmed).ok();
    let text = parsed_json
        .as_ref()
        .and_then(|value| {
            logger_find_string_field(
                value,
                &[
                    "text",
                    "content",
                    "message",
                    "msg",
                    "summary",
                    "body",
                    "chatText",
                    "chat_text",
                    "log",
                ],
            )
        })
        .unwrap_or_else(|| trimmed.to_string());

    let sender_name = parsed_json.as_ref().and_then(|value| {
        logger_find_string_field(
            value,
            &["senderName", "fromName", "speakerName", "roleName", "playerName", "name"],
        )
    });
    let source_uid = parsed_json.as_ref().and_then(|value| {
        logger_find_i64_field(
            value,
            &["sourceUid", "senderUid", "speakerUid", "charId", "roleId", "playerUid", "uid"],
        )
    });
    let channel_name = parsed_json
        .as_ref()
        .and_then(|value| {
            logger_find_string_field(
                value,
                &["channelName", "channel", "chatChannel", "channelType", "chatType", "targetChannel"],
            )
        })
        .or_else(|| {
            parsed_json.as_ref().and_then(|value| {
                logger_find_i64_field(value, &["channelId", "channel_id"]).map(|id| format!("channel:{id}"))
            })
        })
        .or_else(|| sync_log_channel_from_text(&text).map(str::to_string));

    let item_id = parsed_json.as_ref().and_then(|value| {
        logger_find_i64_field(
            value,
            &["itemId", "item_id", "configId", "config_id", "itemConfigId", "item_config_id"],
        )
    });
    let item_count = parsed_json
        .as_ref()
        .and_then(|value| logger_find_i64_field(value, &["count", "itemCount", "amount", "quantity", "num"]))
        .and_then(|value| i32::try_from(value).ok());
    let item_name = parsed_json.as_ref().and_then(|value| {
        logger_find_string_field(
            value,
            &["itemName", "item_name", "itemDisplayName", "dropName", "displayName", "nameDesign", "name"],
        )
    });

    let looks_like_chat = channel_name.is_some() || sync_log_looks_like_chat(&text);
    let looks_like_item_drop = item_id.is_some() || item_count.is_some() || sync_log_contains_drop_hint(&text);

    let category = if looks_like_item_drop {
        "item_drop"
    } else if looks_like_chat {
        "chat"
    } else {
        "system"
    };
    let action = if looks_like_item_drop {
        "drop"
    } else if looks_like_chat {
        "message"
    } else {
        "sync_log"
    };

    let summary = if looks_like_item_drop {
        if let Some(item_name) = item_name.clone() {
            if let Some(item_count) = item_count {
                Some(format!("{item_name} x{item_count}"))
            } else {
                Some(item_name)
            }
        } else {
            Some(text.clone())
        }
    } else {
        Some(text.clone())
    };

    let raw = parsed_json
        .as_ref()
        .and_then(|value| serde_json::to_string_pretty(value).ok())
        .unwrap_or_else(|| raw_log.clone());

    Some(EventLoggerEntry {
        ts_ms,
        category: category.into(),
        action: action.into(),
        uid: item_id,
        target_uid: None,
        source_uid,
        source_label: sender_name.clone(),
        target_label: channel_name,
        name_hint: item_name.or(sender_name),
        summary,
        stacks: item_count,
        duration_ms: None,
        remaining_ms: None,
        value: if looks_like_item_drop {
            item_count.map(|count| count.to_string())
        } else {
            Some(text)
        },
        raw,
    })
}

fn decode_auxiliary_logger_entries(op: &packets::opcodes::Pkt, data: Bytes) -> Vec<EventLoggerEntry> {
    match op {
        packets::opcodes::Pkt::SyncLog => match blueprotobuf::SyncLog::decode(data) {
            Ok(sync_log) => build_sync_log_logger_entry(now_ms(), sync_log)
                .into_iter()
                .collect(),
            Err(error) => {
                warn!("Error decoding SyncLog.. ignoring: {error}");
                Vec::new()
            }
        },
        _ => Vec::new(),
    }
}


fn build_event_logger_session_context(state: &AppState) -> EventLoggerSessionContext {
    let character_uid = (state.encounter.local_player_uid > 0).then_some(state.encounter.local_player_uid);
    let character_name = character_uid
        .and_then(|uid| {
            state
                .attr_store
                .attr(uid, AttrType::Name)
                .and_then(|value| value.as_string())
                .map(|value| value.to_string())
                .or_else(|| {
                    state
                        .encounter
                        .entity_uid_to_entity
                        .get(&uid)
                        .map(|entity| entity.name.clone())
                        .filter(|value| !value.trim().is_empty())
                })
        });

    EventLoggerSessionContext {
        character_name,
        character_uid,
        scene_name: state.encounter.current_scene_name.clone(),
    }
}

fn clamp_u128_to_i32(value: u128) -> i32 {
    value.min(i32::MAX as u128) as i32
}

fn logger_entity_name(uid: i64, base_name: String, local_player_uid: i64) -> String {
    if uid == local_player_uid {
        if base_name.trim().is_empty() {
            format!("UID {uid} (You)")
        } else if base_name.contains("(You)") {
            base_name
        } else {
            format!("{base_name} (You)")
        }
    } else if base_name.trim().is_empty() {
        format!("UID {uid}")
    } else {
        base_name
    }
}

fn build_live_snapshot_logger_entries(
    state: &AppState,
    payload: &LiveDataPayload,
    ts_ms: i64,
) -> Vec<EventLoggerEntry> {
    let mut entries = Vec::new();
    let local_player_uid = payload.local_player_uid;

    let local_player_name = if local_player_uid > 0 {
        state
            .encounter
            .entity_uid_to_entity
            .get(&local_player_uid)
            .map(|entity| resolve_entity_display_name(local_player_uid, entity, &state.attr_store))
            .map(|name| logger_entity_name(local_player_uid, name, local_player_uid))
    } else {
        None
    };

    entries.push(EventLoggerEntry {
        ts_ms,
        category: "live_totals".into(),
        action: "snapshot".into(),
        uid: payload.scene_id.map(i64::from),
        target_uid: None,
        source_uid: (local_player_uid > 0).then_some(local_player_uid),
        source_label: local_player_name.clone(),
        target_label: payload.scene_name.clone(),
        name_hint: payload.scene_name.clone(),
        summary: Some(format!(
            "dmg={} bossOnly={} heal={} effectiveHeal={} active={}ms paused={}",
            payload.total_dmg,
            payload.total_dmg_boss_only,
            payload.total_heal,
            payload.total_effective_heal,
            payload.active_combat_time_ms,
            payload.is_paused
        )),
        stacks: None,
        duration_ms: Some(clamp_u128_to_i32(payload.elapsed_ms)),
        remaining_ms: None,
        value: Some(payload.total_dmg.to_string()),
        raw: serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "null".to_string()),
    });

    for boss in &payload.bosses {
        entries.push(EventLoggerEntry {
            ts_ms,
            category: "boss_hp".into(),
            action: "snapshot".into(),
            uid: Some(boss.uid),
            target_uid: None,
            source_uid: None,
            source_label: None,
            target_label: payload.scene_name.clone(),
            name_hint: Some(logger_entity_name(boss.uid, boss.name.clone(), local_player_uid)),
            summary: Some(format!(
                "hp={}/{} dead={}",
                boss.current_hp
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "?".to_string()),
                boss.max_hp
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "?".to_string()),
                boss.is_dead
            )),
            stacks: None,
            duration_ms: None,
            remaining_ms: None,
            value: boss.current_hp.map(|value| value.to_string()),
            raw: serde_json::to_string_pretty(boss).unwrap_or_else(|_| "null".to_string()),
        });
    }

    for (&uid, entity) in &state.encounter.entity_uid_to_entity {
        let base_name = resolve_entity_display_name(uid, entity, &state.attr_store);
        let display_name = logger_entity_name(uid, base_name, local_player_uid);
        let current_hp = state
            .attr_store
            .attr(uid, AttrType::CurrentHp)
            .and_then(|value| value.as_int());
        let max_hp = state
            .attr_store
            .attr(uid, AttrType::MaxHp)
            .and_then(|value| value.as_int());
        let has_combat = entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
        let has_hp = current_hp.is_some() || max_hp.is_some();
        let is_player = entity.entity_type == blueprotobuf::EEntityType::EntChar;
        let is_boss = entity.is_boss();

        if is_player && (has_combat || uid == local_player_uid) {
            entries.push(EventLoggerEntry {
                ts_ms,
                category: "player".into(),
                action: "snapshot".into(),
                uid: Some(uid),
                target_uid: None,
                source_uid: Some(uid),
                source_label: Some(display_name.clone()),
                target_label: payload.scene_name.clone(),
                name_hint: Some(display_name.clone()),
                summary: Some(format!(
                    "dmg={} boss={} heal={} taken={} hp={}/{}",
                    entity.damage.total,
                    entity.damage_boss_only.total,
                    entity.healing.total,
                    entity.taken.total,
                    current_hp
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "?".to_string()),
                    max_hp
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "?".to_string())
                )),
                stacks: None,
                duration_ms: None,
                remaining_ms: None,
                value: Some(entity.damage.total.to_string()),
                raw: serde_json::to_string_pretty(&serde_json::json!({
                    "uid": uid,
                    "name": display_name.clone(),
                    "classId": entity.class_id,
                    "classSpec": entity.class_spec,
                    "abilityScore": entity.ability_score,
                    "seasonStrength": entity.season_strength,
                    "currentHp": current_hp,
                    "maxHp": max_hp,
                    "damage": entity.damage,
                    "damageBossOnly": entity.damage_boss_only,
                    "healing": entity.healing,
                    "taken": entity.taken,
                }))
                .unwrap_or_else(|_| "null".to_string()),
            });

            for (&skill_id, skill) in &entity.skill_uid_to_dmg_skill {
                if skill.hits == 0 && skill.total_value == 0 {
                    continue;
                }
                entries.push(EventLoggerEntry {
                    ts_ms,
                    category: "player_skill_damage".into(),
                    action: "snapshot".into(),
                    uid: Some(skill_id),
                    target_uid: None,
                    source_uid: Some(uid),
                    source_label: Some(display_name.clone()),
                    target_label: None,
                    name_hint: None,
                    summary: Some(format!(
                        "total={} hits={} critHits={} luckyHits={}",
                        skill.total_value, skill.hits, skill.crit_hits, skill.lucky_hits
                    )),
                    stacks: Some(clamp_u128_to_i32(skill.hits)),
                    duration_ms: None,
                    remaining_ms: None,
                    value: Some(skill.total_value.to_string()),
                    raw: serde_json::to_string_pretty(&serde_json::json!({
                        "playerUid": uid,
                        "playerName": display_name.clone(),
                        "kind": "damage",
                        "skillId": skill_id,
                        "stats": skill,
                    }))
                    .unwrap_or_else(|_| "null".to_string()),
                });
            }

            for (&skill_id, skill) in &entity.skill_uid_to_heal_skill {
                if skill.hits == 0 && skill.total_value == 0 {
                    continue;
                }
                entries.push(EventLoggerEntry {
                    ts_ms,
                    category: "player_skill_heal".into(),
                    action: "snapshot".into(),
                    uid: Some(skill_id),
                    target_uid: None,
                    source_uid: Some(uid),
                    source_label: Some(display_name.clone()),
                    target_label: None,
                    name_hint: None,
                    summary: Some(format!(
                        "total={} hits={} critHits={} luckyHits={}",
                        skill.total_value, skill.hits, skill.crit_hits, skill.lucky_hits
                    )),
                    stacks: Some(clamp_u128_to_i32(skill.hits)),
                    duration_ms: None,
                    remaining_ms: None,
                    value: Some(skill.total_value.to_string()),
                    raw: serde_json::to_string_pretty(&serde_json::json!({
                        "playerUid": uid,
                        "playerName": display_name.clone(),
                        "kind": "heal",
                        "skillId": skill_id,
                        "stats": skill,
                    }))
                    .unwrap_or_else(|_| "null".to_string()),
                });
            }

            for (&skill_id, skill) in &entity.skill_uid_to_taken_skill {
                if skill.hits == 0 && skill.total_value == 0 {
                    continue;
                }
                entries.push(EventLoggerEntry {
                    ts_ms,
                    category: "player_skill_taken".into(),
                    action: "snapshot".into(),
                    uid: Some(skill_id),
                    target_uid: None,
                    source_uid: Some(uid),
                    source_label: Some(display_name.clone()),
                    target_label: None,
                    name_hint: None,
                    summary: Some(format!(
                        "total={} hits={} critHits={} luckyHits={}",
                        skill.total_value, skill.hits, skill.crit_hits, skill.lucky_hits
                    )),
                    stacks: Some(clamp_u128_to_i32(skill.hits)),
                    duration_ms: None,
                    remaining_ms: None,
                    value: Some(skill.total_value.to_string()),
                    raw: serde_json::to_string_pretty(&serde_json::json!({
                        "playerUid": uid,
                        "playerName": display_name.clone(),
                        "kind": "taken",
                        "skillId": skill_id,
                        "stats": skill,
                    }))
                    .unwrap_or_else(|_| "null".to_string()),
                });
            }

            for (&target_uid, &total_value) in &entity.dmg_to_target {
                if total_value == 0 {
                    continue;
                }
                let target_name = state
                    .encounter
                    .entity_uid_to_entity
                    .get(&target_uid)
                    .map(|target| resolve_entity_display_name(target_uid, target, &state.attr_store))
                    .map(|name| logger_entity_name(target_uid, name, local_player_uid))
                    .unwrap_or_else(|| format!("UID {target_uid}"));
                entries.push(EventLoggerEntry {
                    ts_ms,
                    category: "player_target_damage".into(),
                    action: "snapshot".into(),
                    uid: Some(uid),
                    target_uid: Some(target_uid),
                    source_uid: Some(uid),
                    source_label: Some(display_name.clone()),
                    target_label: Some(target_name.clone()),
                    name_hint: Some(display_name.clone()),
                    summary: Some(format!("target={} total={}", target_name, total_value)),
                    stacks: None,
                    duration_ms: None,
                    remaining_ms: None,
                    value: Some(total_value.to_string()),
                    raw: serde_json::to_string_pretty(&serde_json::json!({
                        "playerUid": uid,
                        "playerName": display_name.clone(),
                        "targetUid": target_uid,
                        "targetName": target_name.clone(),
                        "totalValue": total_value,
                    }))
                    .unwrap_or_else(|_| "null".to_string()),
                });
            }

            for (&(skill_id, target_uid), stats) in &entity.skill_dmg_to_target {
                if stats.hits == 0 && stats.total_value == 0 {
                    continue;
                }
                let target_name = state
                    .encounter
                    .entity_uid_to_entity
                    .get(&target_uid)
                    .map(|target| resolve_entity_display_name(target_uid, target, &state.attr_store))
                    .map(|name| logger_entity_name(target_uid, name, local_player_uid))
                    .unwrap_or_else(|| format!("UID {target_uid}"));
                entries.push(EventLoggerEntry {
                    ts_ms,
                    category: "player_target_skill_damage".into(),
                    action: "snapshot".into(),
                    uid: Some(skill_id),
                    target_uid: Some(target_uid),
                    source_uid: Some(uid),
                    source_label: Some(display_name.clone()),
                    target_label: Some(target_name.clone()),
                    name_hint: None,
                    summary: Some(format!(
                        "target={} total={} hits={}",
                        target_name, stats.total_value, stats.hits
                    )),
                    stacks: Some(clamp_u128_to_i32(stats.hits)),
                    duration_ms: None,
                    remaining_ms: None,
                    value: Some(stats.total_value.to_string()),
                    raw: serde_json::to_string_pretty(&serde_json::json!({
                        "playerUid": uid,
                        "playerName": display_name.clone(),
                        "targetUid": target_uid,
                        "targetName": target_name.clone(),
                        "skillId": skill_id,
                        "stats": stats,
                    }))
                    .unwrap_or_else(|_| "null".to_string()),
                });
            }

            for (&(skill_id, target_uid), stats) in &entity.skill_heal_to_target {
                if stats.hits == 0 && stats.total_value == 0 {
                    continue;
                }
                let target_name = state
                    .encounter
                    .entity_uid_to_entity
                    .get(&target_uid)
                    .map(|target| resolve_entity_display_name(target_uid, target, &state.attr_store))
                    .map(|name| logger_entity_name(target_uid, name, local_player_uid))
                    .unwrap_or_else(|| format!("UID {target_uid}"));
                entries.push(EventLoggerEntry {
                    ts_ms,
                    category: "player_target_skill_heal".into(),
                    action: "snapshot".into(),
                    uid: Some(skill_id),
                    target_uid: Some(target_uid),
                    source_uid: Some(uid),
                    source_label: Some(display_name.clone()),
                    target_label: Some(target_name.clone()),
                    name_hint: None,
                    summary: Some(format!(
                        "target={} total={} hits={}",
                        target_name, stats.total_value, stats.hits
                    )),
                    stacks: Some(clamp_u128_to_i32(stats.hits)),
                    duration_ms: None,
                    remaining_ms: None,
                    value: Some(stats.total_value.to_string()),
                    raw: serde_json::to_string_pretty(&serde_json::json!({
                        "playerUid": uid,
                        "playerName": display_name.clone(),
                        "targetUid": target_uid,
                        "targetName": target_name.clone(),
                        "skillId": skill_id,
                        "stats": stats,
                    }))
                    .unwrap_or_else(|_| "null".to_string()),
                });
            }
        }

        if !is_player && !is_boss && (has_combat || has_hp) {
            entries.push(EventLoggerEntry {
                ts_ms,
                category: "mob".into(),
                action: "snapshot".into(),
                uid: Some(uid),
                target_uid: None,
                source_uid: None,
                source_label: None,
                target_label: payload.scene_name.clone(),
                name_hint: Some(display_name.clone()),
                summary: Some(format!(
                    "hp={}/{} dmg={} taken={}",
                    current_hp
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "?".to_string()),
                    max_hp
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "?".to_string()),
                    entity.damage.total,
                    entity.taken.total
                )),
                stacks: None,
                duration_ms: None,
                remaining_ms: None,
                value: current_hp.map(|value| value.to_string()),
                raw: serde_json::to_string_pretty(&serde_json::json!({
                    "uid": uid,
                    "name": display_name.clone(),
                    "monsterTypeId": entity.monster_type_id,
                    "currentHp": current_hp,
                    "maxHp": max_hp,
                    "damage": entity.damage,
                    "taken": entity.taken,
                }))
                .unwrap_or_else(|_| "null".to_string()),
            });
        }
    }

    entries
}

const QUEUE_DEPTH_WARN_THRESHOLD: usize = 100;
const QUEUE_DEPTH_ERROR_THRESHOLD: usize = 500;
const QUEUE_DEPTH_CRITICAL_THRESHOLD: usize = 2000;
const QUEUE_DEPTH_LOG_INTERVAL: Duration = Duration::from_millis(500);

fn log_queue_depth_if_needed(
    queue_depth: &std::sync::atomic::AtomicUsize,
    warn_counter: &mut usize,
    last_log_at: &mut Instant,
) {
    if last_log_at.elapsed() < QUEUE_DEPTH_LOG_INTERVAL {
        return;
    }
    *last_log_at = Instant::now();

    let current = queue_depth.load(Ordering::Relaxed);
    if current >= QUEUE_DEPTH_CRITICAL_THRESHOLD {
        *warn_counter += 1;
        if *warn_counter % 5 == 1 {
            warn!(
                target: "app::live",
                "queue_depth_critical depth={} - consumer severely behind, risk of OOM",
                current
            );
        }
    } else if current >= QUEUE_DEPTH_ERROR_THRESHOLD {
        *warn_counter += 1;
        if *warn_counter % 3 == 1 {
            warn!(
                target: "app::live",
                "queue_depth_high depth={} - consumer significantly behind",
                current
            );
        }
    } else if current >= QUEUE_DEPTH_WARN_THRESHOLD {
        *warn_counter += 1;
        if *warn_counter % 2 == 1 {
            warn!(
                target: "app::live",
                "queue_depth_elevated depth={} - consumer falling behind",
                current
            );
        }
    } else {
        *warn_counter = 0;
    }
}

/// Decodes packet payload into a state event.
fn decode_state_event(op: packets::opcodes::Pkt, data: Bytes) -> Option<StateEvent> {
    match op {
        packets::opcodes::Pkt::ServerChangeInfo => Some(StateEvent::ServerChange),
        packets::opcodes::Pkt::EnterScene => {
            info!(target: "app::live", "Received EnterScene packet");
            match blueprotobuf::EnterScene::decode(data) {
                Ok(v) => Some(StateEvent::EnterScene(v)),
                Err(e) => {
                    warn!("Error decoding EnterScene.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncNearEntities => {
            match blueprotobuf::SyncNearEntities::decode(data) {
                Ok(v) => Some(StateEvent::SyncNearEntities(v)),
                Err(e) => {
                    warn!("Error decoding SyncNearEntities.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncContainerData => {
            match blueprotobuf::SyncContainerData::decode(data) {
                Ok(v) => Some(StateEvent::SyncContainerData(v)),
                Err(e) => {
                    warn!("Error decoding SyncContainerData.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncContainerDirtyData => {
            match blueprotobuf::SyncContainerDirtyData::decode(data) {
                Ok(v) => Some(StateEvent::SyncContainerDirtyData(v)),
                Err(e) => {
                    warn!("Error decoding SyncContainerDirtyData.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncServerTime => match blueprotobuf::SyncServerTime::decode(data) {
            Ok(v) => Some(StateEvent::SyncServerTime(v)),
            Err(e) => {
                warn!("Error decoding SyncServerTime.. ignoring: {e}");
                None
            }
        },
        packets::opcodes::Pkt::SyncDungeonData => {
            info!(target: "app::live", "Received SyncDungeonData packet");
            match blueprotobuf::SyncDungeonData::decode(data) {
                Ok(v) => {
                    let has_flow = v
                        .v_data
                        .as_ref()
                        .and_then(|d| d.flow_info.as_ref())
                        .is_some();
                    let target_count = v
                        .v_data
                        .as_ref()
                        .and_then(|d| d.target.as_ref())
                        .map(|t| t.target_data.len())
                        .unwrap_or(0);
                    info!(
                        target: "app::live",
                        "Decoded SyncDungeonData (has_flow_info={}, target_entries={})",
                        has_flow,
                        target_count
                    );
                    Some(StateEvent::SyncDungeonData(v))
                }
                Err(e) => {
                    warn!("Error decoding SyncDungeonData.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncDungeonDirtyData => {
            info!(target: "app::live", "Received SyncDungeonDirtyData packet");
            match blueprotobuf::SyncDungeonDirtyData::decode(data) {
                Ok(v) => {
                    let buffer_len = v
                        .v_data
                        .as_ref()
                        .and_then(|s| s.buffer.as_ref())
                        .map(|b| b.len())
                        .unwrap_or(0);
                    info!(
                        target: "app::live",
                        "Decoded SyncDungeonDirtyData (buffer_len={})",
                        buffer_len
                    );
                    Some(StateEvent::SyncDungeonDirtyData(v))
                }
                Err(e) => {
                    warn!("Error decoding SyncDungeonDirtyData.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncToMeDeltaInfo => {
            match blueprotobuf::SyncToMeDeltaInfo::decode(data) {
                Ok(v) => Some(StateEvent::SyncToMeDeltaInfo(v)),
                Err(e) => {
                    warn!("Error decoding SyncToMeDeltaInfo.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::SyncNearDeltaInfo => {
            match blueprotobuf::SyncNearDeltaInfo::decode(data) {
                Ok(v) => Some(StateEvent::SyncNearDeltaInfo(v)),
                Err(e) => {
                    warn!("Error decoding SyncNearDeltaInfo.. ignoring: {e}");
                    None
                }
            }
        }
        packets::opcodes::Pkt::BuffInfoSync => match blueprotobuf::BuffInfoSync::decode(data) {
            Ok(v) => {
                // Dump the packet as JSON for debugging
                match serde_json::to_string_pretty(&v) {
                    Ok(json) => {
                        debug!(target: "app::live", "BuffInfoSync packet received:\n{}", json);
                    }
                    Err(e) => {
                        debug!(
                            target: "app::live",
                            "BuffInfoSync packet received (JSON serialization failed: {}): {:?}",
                            e, v
                        );
                    }
                }
                None // Not processed further for now
            }
            Err(e) => {
                warn!("Error decoding BuffInfoSync.. ignoring: {e}");
                None
            }
        },
        _ => {
            trace!("Unhandled packet opcode: {op:?}");
            None
        }
    }
}

/// Starts the live meter.
///
/// This function captures packets, processes them, and emits events to the frontend.
///
/// # Arguments
///
/// * `app_handle` - A handle to the Tauri application instance.
pub async fn start(
    app_handle: AppHandle,
    mut control_rx: UnboundedReceiver<crate::live::state::LiveControlCommand>,
) {
    let live_span = tracing::info_span!(
        target: "app::live",
        "live_meter",
        window_live = crate::WINDOW_LIVE_LABEL,
        window_main = crate::WINDOW_MAIN_LABEL
    );
    let _live_guard = live_span.enter();

    // Get the state manager from app state
    let state_manager = app_handle.state::<AppStateManager>().inner().clone();
    let mut state = AppState::new();
    if let Some(snapshot) =
        crate::live::bootstrap_snapshot::load_monitor_runtime_snapshot(&app_handle)
    {
        state_manager.apply_monitor_runtime_snapshot_with_state(&mut state, snapshot);
    }

    // Throttling for events - rate is read dynamically from state each iteration
    let mut last_emit_time = Instant::now();

    // Heartbeat: ensure we emit events periodically even during idle periods
    // to prevent frontend from thinking the connection is dead
    let heartbeat_duration = Duration::from_secs(2);

    // 1. Start capturing packets and send to rx
    let method = get_capture_method(&app_handle);
    let (mut rx, queue_depth) = packets::packet_capture::start_capture(method);
    let mut queue_depth_warn_counter = 0usize;
    let mut queue_depth_last_log_at = Instant::now();

    // 2. Use channels to receive packets and control commands, and process whichever arrives first
    loop {
        log_queue_depth_if_needed(
            queue_depth.as_ref(),
            &mut queue_depth_warn_counter,
            &mut queue_depth_last_log_at,
        );
        tokio::select! {
            biased;

            Some(command) = control_rx.recv() => {
                state_manager.apply_control_command(&mut state, command);
                state_manager.drain_control_commands(&mut state, &mut control_rx);
                flush_outbound_events(&app_handle, &mut state);
            }
            packet = rx.recv() => match packet {
            Some((op, data)) => {
                queue_depth
                    .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |depth| {
                        Some(depth.saturating_sub(1))
                    })
                    .ok();
                // Process the first packet immediately (low-latency path)
                let mut batch_events = Vec::new();
                let auxiliary_entries = decode_auxiliary_logger_entries(&op, data.clone());
                if !auxiliary_entries.is_empty() {
                    emit_auxiliary_entries(&app_handle, auxiliary_entries);
                }
                if let Some(event) = decode_state_event(op, data) {
                    batch_events.push(event);
                }

                // Drain additional queued packets quickly but with a strict time budget
                let drain_start = Instant::now();
                let drain_time_budget = Duration::from_millis(20);
                const MAX_DRAIN: usize = 20;
                let mut drained = 0usize;

                loop {
                    if drained >= MAX_DRAIN {
                        break;
                    }
                    if Instant::now().duration_since(drain_start) >= drain_time_budget {
                        break;
                    }

                    match rx.try_recv() {
                        Ok((op, data)) => {
                            queue_depth
                                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |depth| {
                                    Some(depth.saturating_sub(1))
                                })
                                .ok();
                            let auxiliary_entries = decode_auxiliary_logger_entries(&op, data.clone());
                            if !auxiliary_entries.is_empty() {
                                emit_auxiliary_entries(&app_handle, auxiliary_entries);
                            }
                            if let Some(event) = decode_state_event(op, data) {
                                let is_server_change = matches!(event, StateEvent::ServerChange);
                                batch_events.push(event);
                                drained += 1;
                                if is_server_change {
                                    break;
                                }
                            } else {
                                drained += 1;
                            }
                        }
                        Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                        Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                            warn!(
                                target: "app::live",
                                "Packet capture channel closed (disconnected) while draining"
                            );
                            break;
                        }
                    }
                }

                state_manager.handle_events_batch_with_state(&mut state, batch_events);
                state_manager.drain_control_commands(&mut state, &mut control_rx);
                flush_outbound_events(&app_handle, &mut state);

                // Check if we should emit events (throttling)
                // Read current event update rate from state dynamically
                let emit_rate_ms = state.event_update_rate_ms;
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                if now.duration_since(last_emit_time) >= emit_throttle_duration {
                    last_emit_time = now;
                    state_manager.update_and_emit_events_with_state(&mut state);
                }
                flush_outbound_events(&app_handle, &mut state);
            }
            None => {
                warn!(
                    target: "app::live",
                    "Packet capture channel closed, exiting live meter loop"
                );
                break;
            }
            },
            _ = tokio::time::sleep(heartbeat_duration) => {
                // Timeout occurred - read rate dynamically
                let emit_rate_ms = state.event_update_rate_ms;
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                if now.duration_since(last_emit_time) >= emit_throttle_duration {
                    last_emit_time = now;
                    state_manager.update_and_emit_events_with_state(&mut state);
                }
                flush_outbound_events(&app_handle, &mut state);
            }
        }
    }

    if let Err(error) = flush_current_session_to_file(
        &app_handle,
        "live_loop_exit",
        build_event_logger_session_context(&state),
    ) {
        warn!(target: "app::live", "event_logger_session_flush_failed boundary=live_loop_exit error={}", error);
    }
}

fn flush_outbound_events(app_handle: &AppHandle, state: &mut AppState) {
    for event in state.event_manager.drain_outbound_events() {
        let ts_ms = now_ms();

        match event {
            OutboundEvent::EncounterUpdate {
                header_info,
                is_paused,
            } => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "encounter-update",
                    EncounterUpdatePayload {
                        header_info: header_info.clone(),
                        is_paused,
                    },
                );

                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "encounter".into(),
                        action: "update".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: header_info.scene_name.clone(),
                        summary: Some(format!("elapsed={}ms paused={}", header_info.elapsed_ms, is_paused)),
                        stacks: None,
                        duration_ms: Some(header_info.elapsed_ms as i32),
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&EncounterUpdatePayload {
                            header_info,
                            is_paused,
                        })
                        .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
            OutboundEvent::EncounterReset => {
                safe_emit_to(app_handle, crate::WINDOW_LIVE_LABEL, "reset-encounter", "");
                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "encounter".into(),
                        action: "reset".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some("Encounter reset".into()),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&serde_json::json!({ "event": "reset-encounter" }))
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
                if let Err(error) = flush_current_session_to_file(
                    app_handle,
                    "encounter_reset",
                    build_event_logger_session_context(state),
                ) {
                    warn!(target: "app::live", "event_logger_session_flush_failed boundary=encounter_reset error={}", error);
                }
            }
            OutboundEvent::EncounterPause(is_paused) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "pause-encounter",
                    is_paused,
                );
                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "encounter".into(),
                        action: "pause".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("paused={}", is_paused)),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: Some(is_paused.to_string()),
                        raw: serde_json::to_string_pretty(&serde_json::json!({ "paused": is_paused }))
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
            OutboundEvent::SceneChange(scene_name) => {
                if let Err(error) = flush_current_session_to_file(
                    app_handle,
                    "scene_change",
                    build_event_logger_session_context(state),
                ) {
                    warn!(target: "app::live", "event_logger_session_flush_failed boundary=scene_change error={}", error);
                }

                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "scene-change",
                    SceneChangePayload {
                        scene_name: scene_name.clone(),
                    },
                );
                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "scene".into(),
                        action: "change".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: Some(scene_name.clone()),
                        summary: Some(scene_name.clone()),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&SceneChangePayload { scene_name })
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
            OutboundEvent::TrainingDummyUpdate(training_dummy) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "training-dummy-update",
                    training_dummy.clone(),
                );
                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "system".into(),
                        action: "training_dummy".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: Some("training-dummy".into()),
                        summary: Some(format!("phase={:?}", training_dummy.phase)),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&training_dummy)
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
            OutboundEvent::LiveData(payload) => {
                safe_emit_to(app_handle, crate::WINDOW_LIVE_LABEL, "live-data", payload.clone());
                let snapshot_entries = build_live_snapshot_logger_entries(state, &payload, ts_ms);
                emit_auxiliary_entries(app_handle, snapshot_entries);
            }
            OutboundEvent::BuffUpdate(buffs) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "buff-update",
                    BuffUpdatePayload {
                        buffs: buffs.clone(),
                    },
                );
                let entries = buffs
                    .into_iter()
                    .map(|buff| EventLoggerEntry {
                        ts_ms,
                        category: "buff".into(),
                        action: "update".into(),
                        uid: Some(buff.base_id as i64),
                        target_uid: Some(buff.host_uid),
                        source_uid: Some(buff.source_uid),
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("host={} src={}", buff.host_uid, buff.source_uid)),
                        stacks: Some(buff.layer),
                        duration_ms: Some(buff.duration_ms),
                        remaining_ms: Some(buff.duration_ms),
                        value: None,
                        raw: serde_json::to_string_pretty(&buff)
                            .unwrap_or_else(|_| "null".to_string()),
                    })
                    .collect();
                emit_auxiliary_entries(app_handle, entries);
            }
            OutboundEvent::BossBuffUpdate(boss_buffs) => {
                let payload = BossBuffUpdatePayload {
                    boss_buffs: boss_buffs.clone(),
                };
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "boss-buff-update",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "boss-buff-update",
                    payload,
                );
                let mut entries = Vec::new();
                for (boss_uid, buffs) in boss_buffs {
                    for buff in buffs {
                        entries.push(EventLoggerEntry {
                            ts_ms,
                            category: "monster_buff".into(),
                            action: "update".into(),
                            uid: Some(buff.base_id as i64),
                            target_uid: Some(boss_uid),
                            source_uid: Some(buff.source_uid),
                        source_label: None,
                        target_label: None,
                            name_hint: None,
                            summary: Some(format!("boss={} src={}", boss_uid, buff.source_uid)),
                            stacks: Some(buff.layer),
                            duration_ms: Some(buff.duration_ms),
                            remaining_ms: Some(buff.duration_ms),
                            value: None,
                            raw: serde_json::to_string_pretty(&buff)
                            .unwrap_or_else(|_| "null".to_string()),
                        });
                    }
                }
                emit_auxiliary_entries(app_handle, entries);
            }
            OutboundEvent::HateListUpdate(hate_lists) => {
                let payload = HateListUpdatePayload {
                    hate_lists: hate_lists.clone(),
                };
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "hate-list-update",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "hate-list-update",
                    payload,
                );
                let mut entries = Vec::new();
                for (boss_uid, entries_for_boss) in hate_lists {
                    for hate in entries_for_boss {
                        entries.push(EventLoggerEntry {
                            ts_ms,
                            category: "hate".into(),
                            action: "update".into(),
                            uid: Some(hate.uid),
                            target_uid: Some(boss_uid),
                            source_uid: None,
                        source_label: None,
                        target_label: None,
                            name_hint: None,
                            summary: Some(format!("boss={} hate={}", boss_uid, hate.hate_val)),
                            stacks: None,
                            duration_ms: None,
                            remaining_ms: None,
                            value: Some(hate.hate_val.to_string()),
                            raw: serde_json::to_string_pretty(&hate)
                            .unwrap_or_else(|_| "null".to_string()),
                        });
                    }
                }
                emit_auxiliary_entries(app_handle, entries);
            }
            OutboundEvent::EntityNameMap { names } => {
                let payload = EntityNameMapPayload {
                    names: names.clone(),
                };
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "entity-names",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "entity-names",
                    payload,
                );
                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "system".into(),
                        action: "entity_names".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("count={}", names.len())),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&EntityNameMapPayload { names })
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
            OutboundEvent::BuffCounterUpdate(counters) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "buff-counter-update",
                    BuffCounterUpdatePayload {
                        counters: counters.clone(),
                    },
                );
                let entries = counters
                    .into_iter()
                    .map(|counter| EventLoggerEntry {
                        ts_ms,
                        category: "counter".into(),
                        action: "update".into(),
                        uid: Some(counter.rule_id as i64),
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("slots={}", counter.slots.len())),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&counter)
                            .unwrap_or_else(|_| "null".to_string()),
                    })
                    .collect();
                emit_auxiliary_entries(app_handle, entries);
            }
            OutboundEvent::SkillCdUpdate(skill_cds) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "skill-cd-update",
                    SkillCdUpdatePayload {
                        skill_cds: skill_cds.clone(),
                    },
                );
                let entries = skill_cds
                    .into_iter()
                    .map(|skill_cd| EventLoggerEntry {
                        ts_ms,
                        category: "skill_cd".into(),
                        action: "update".into(),
                        uid: Some(skill_cd.skill_level_id as i64),
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("type={} accelerate={:.2}", skill_cd.skill_cd_type, skill_cd.cd_accelerate_rate)),
                        stacks: None,
                        duration_ms: Some(skill_cd.calculated_duration),
                        remaining_ms: Some(skill_cd.valid_cd_time),
                        value: Some(skill_cd.valid_cd_time.to_string()),
                        raw: serde_json::to_string_pretty(&skill_cd)
                            .unwrap_or_else(|_| "null".to_string()),
                    })
                    .collect();
                emit_auxiliary_entries(app_handle, entries);
            }
            OutboundEvent::PanelAttrUpdate(attrs) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "panel-attr-update",
                    PanelAttrUpdatePayload {
                        attrs: attrs.clone(),
                    },
                );
                let entries = attrs
                    .into_iter()
                    .map(|attr| EventLoggerEntry {
                        ts_ms,
                        category: "system".into(),
                        action: "panel_attr".into(),
                        uid: Some(attr.attr_id as i64),
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("value={}", attr.value)),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: Some(attr.value.to_string()),
                        raw: serde_json::to_string_pretty(&attr)
                            .unwrap_or_else(|_| "null".to_string()),
                    })
                    .collect();
                emit_auxiliary_entries(app_handle, entries);
            }
            OutboundEvent::FightResourceUpdate(fight_res) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "fight-res-update",
                    FightResourceUpdatePayload {
                        fight_res: fight_res.clone(),
                    },
                );
                emit_auxiliary_entries(
                    app_handle,
                    vec![EventLoggerEntry {
                        ts_ms,
                        category: "system".into(),
                        action: "fight_resource".into(),
                        uid: None,
                        target_uid: None,
                        source_uid: None,
                        source_label: None,
                        target_label: None,
                        name_hint: None,
                        summary: Some(format!("values={}", fight_res.values.len())),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&fight_res)
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
        }
    }
}

fn get_capture_method(app: &AppHandle) -> packets::packet_capture::CaptureMethod {
    use packets::packet_capture::CaptureMethod;

    let filename_candidates = ["packetCapture.json", "packetCapture.bin", "packetCapture"];
    let mut dir_candidates = Vec::new();
    if let Some(dir) = app.path().app_data_dir().ok() {
        dir_candidates.push(dir.join("stores"));
        dir_candidates.push(dir.clone());
    }
    if let Some(dir) = app.path().app_local_data_dir().ok() {
        dir_candidates.push(dir.join("stores"));
        dir_candidates.push(dir.clone());
    }

    for dir in dir_candidates.into_iter() {
        for file_name in filename_candidates {
            let path = dir.join(file_name);
            if !path.exists() {
                continue;
            }
            if let Ok(file) = std::fs::File::open(&path) {
                if let Ok(json) = serde_json::from_reader::<_, serde_json::Value>(file) {
                    let method = json
                        .get("method")
                        .and_then(|v| v.as_str())
                        .unwrap_or("WinDivert");
                    let device = json
                        .get("npcapDevice")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    info!(
                        target: "app::capture",
                        "Packet capture config found at {} (method={}, device={})",
                        path.display(),
                        method,
                        device
                    );

                    if method == "Npcap" {
                        info!(target: "app::capture", "Using Npcap capture method device={}", device);
                        return CaptureMethod::Npcap(device.to_string());
                    } else {
                        info!(target: "app::capture", "Using WinDivert capture method (from config)");
                        return CaptureMethod::WinDivert;
                    }
                } else {
                    warn!(
                        "Failed to parse packet capture config at {}",
                        path.display()
                    );
                }
            }
        }

        // If specific filenames failed, try any file starting with packetCapture*
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if !name.starts_with("packetCapture") {
                        continue;
                    }
                }
                if let Ok(file) = std::fs::File::open(&path) {
                    if let Ok(json) = serde_json::from_reader::<_, serde_json::Value>(file) {
                        let method = json
                            .get("method")
                            .and_then(|v| v.as_str())
                            .unwrap_or("WinDivert");
                        let device = json
                            .get("npcapDevice")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        info!(
                            target: "app::capture",
                            "Packet capture config found at {} (method={}, device={})",
                            path.display(),
                            method,
                            device
                        );

                        if method == "Npcap" {
                            info!(target: "app::capture", "Using Npcap capture method device={}", device);
                            return CaptureMethod::Npcap(device.to_string());
                        } else {
                            info!(target: "app::capture", "Using WinDivert capture method (from config)");
                            return CaptureMethod::WinDivert;
                        }
                    } else {
                        warn!(
                            "Failed to parse packet capture config at {}",
                            path.display()
                        );
                    }
                }
            }
        }
    }

    warn!(target: "app::capture", "No packetCapture config found in app data dirs; falling back to WinDivert");

    info!(target: "app::capture", "Using WinDivert capture method (default)");
    CaptureMethod::WinDivert
}
