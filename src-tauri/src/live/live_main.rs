use crate::live::chat_feed;
use crate::live::state::{AppState, AppStateManager, StateEvent, resolve_entity_display_name};
use crate::live::{
    attribution_census::flush_current_census_to_file,
    commands_models::{
        BossBuffUpdatePayload, BuffCounterUpdatePayload, BuffUpdatePayload, DeathReplayPayload,
        EntityIdentityMapPayload, EntityNameMapPayload, FightResourceUpdatePayload,
        HateListUpdatePayload, LiveDataPayload, PanelAttrUpdatePayload, ShieldDetailUpdatePayload,
        SkillCdUpdatePayload,
    },
    custom_trigger_events::emit_custom_trigger_entries,
    event_logger::{
        EventLoggerEntry, EventLoggerSessionContext, drain_background_logger_entries,
        emit_logger_entries, flush_current_session_to_file, now_ms,
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
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc::UnboundedReceiver;

static RAW_SERVICE_PROBE_ALL_COUNT: AtomicUsize = AtomicUsize::new(0);
static RAW_SERVICE_PROBE_NEAR_DELTA_COUNT: AtomicUsize = AtomicUsize::new(0);

fn debug_env_flag_enabled(name: &str) -> bool {
    cfg!(debug_assertions)
        && std::env::var(name)
            .map(|value| {
                let value = value.trim();
                value == "1"
                    || value.eq_ignore_ascii_case("true")
                    || value.eq_ignore_ascii_case("yes")
                    || value.eq_ignore_ascii_case("on")
            })
            .unwrap_or(false)
}

fn debug_env_usize(name: &str, fallback: usize) -> usize {
    if !cfg!(debug_assertions) {
        return fallback;
    }

    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(fallback)
}

fn dungeon_probes_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();

    *ENABLED.get_or_init(|| debug_env_flag_enabled("RESONANCE_ENABLE_DUNGEON_PROBES"))
}

fn container_probes_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();

    *ENABLED.get_or_init(|| debug_env_flag_enabled("RESONANCE_ENABLE_CONTAINER_PROBES"))
}

fn container_probes_verbose_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();

    *ENABLED.get_or_init(|| debug_env_flag_enabled("RESONANCE_ENABLE_CONTAINER_PROBES_VERBOSE"))
}

fn emit_auxiliary_entries(app_handle: &AppHandle, entries: Vec<EventLoggerEntry>) {
    emit_custom_trigger_entries(app_handle, entries.clone());
    emit_logger_entries(app_handle, entries);
}

fn emit_pending_background_logger_entries(app_handle: &AppHandle) {
    let entries = drain_background_logger_entries();
    if entries.is_empty() {
        return;
    }
    emit_auxiliary_entries(app_handle, entries);
}

fn handle_capture_event(
    app_handle: &AppHandle,
    capture_event: packets::packet_capture::CaptureEvent,
    batch_events: &mut Vec<StateEvent>,
) -> bool {
    match capture_event {
        packets::packet_capture::CaptureEvent::Notify(notify) => {
            let auxiliary_entries = decode_auxiliary_logger_entries(&notify);
            if !auxiliary_entries.is_empty() {
                emit_auxiliary_entries(app_handle, auxiliary_entries);
            }

            let Some(op) = notify.recognized_pkt else {
                return false;
            };
            let Some(event) = decode_state_event(op, notify.payload.clone()) else {
                return false;
            };
            let is_server_change = matches!(event, StateEvent::ServerChange);
            batch_events.push(event);
            is_server_change
        }
        packets::packet_capture::CaptureEvent::Packet(op, payload) => {
            let Some(event) = decode_state_event(op, payload) else {
                return false;
            };
            let is_server_change = matches!(event, StateEvent::ServerChange);
            batch_events.push(event);
            is_server_change
        }
        packets::packet_capture::CaptureEvent::AuxiliaryEntries(entries) => {
            emit_auxiliary_entries(app_handle, entries);
            false
        }
    }
}

const ITEM_DETAIL_LOOKBACK_MS: i64 = 750;
const ITEM_DETAIL_RECENT_LIMIT: usize = 32;
const GEAR_CONFIG_ID_MIN: i64 = 14_000;
const GEAR_CONFIG_ID_MAX: i64 = 16_999;
const GEAR_ITEM_ID_MIN: i64 = 2_000_000;
const GEAR_ITEM_ID_MAX: i64 = 2_200_000;
const DIRTY_PAD_SENTINEL: i32 = -559_038_737;
const DEAD_BEEF_DELIMITER: [u8; 4] = [0xEF, 0xBE, 0xAD, 0xDE];

#[derive(Debug, Clone, serde::Serialize)]
struct FrequentDirtyValue {
    value: i32,
    count: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
struct DetailValueCandidate {
    offset: usize,
    value: i64,
    signed: i64,
    width: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
struct DetailStatLine {
    slot: usize,
    pair_id: i64,
    value: i64,
    value_offset: usize,
    pair_offset: Option<usize>,
    resolution: &'static str,
}

#[derive(Debug, Clone, serde::Serialize)]
struct ItemLinePair {
    id: i64,
    value: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
struct RecentItemDetailCandidate {
    ts_ms: i64,
    payload_len: usize,
    dirty_blob_len: usize,
    dirty_i32_count: usize,
    gear_config_id: Option<i64>,
    gear_instance_id: Option<i64>,
    first_values: Vec<i32>,
    large_values: Vec<i64>,
    frequent_small_values: Vec<FrequentDirtyValue>,
    stat_value_candidates: Vec<DetailValueCandidate>,
}

#[derive(Debug, Default)]
struct ItemProbeState {
    recent_dirty_candidates: VecDeque<RecentItemDetailCandidate>,
}

fn item_probe_state() -> &'static Mutex<ItemProbeState> {
    static ITEM_PROBE_STATE: OnceLock<Mutex<ItemProbeState>> = OnceLock::new();
    ITEM_PROBE_STATE.get_or_init(|| Mutex::new(ItemProbeState::default()))
}

#[derive(Debug, Clone, serde::Serialize, Default)]
struct DecodedItemCandidate {
    quality_tier: u64,
    quality_label: String,
    item_kind: String,
    config_id: i64,
    instance_id: i64,
    state_flag: Option<u64>,
    server_ts_ms: Option<i64>,
    unknown_field8: Option<i64>,
    line_count_hint: Option<u64>,
    perfection_value: Option<u64>,
    perfection_cap: Option<u64>,
    field10_pairs: Vec<ItemLinePair>,
    field11_pairs: Vec<ItemLinePair>,
    field14_pairs: Vec<ItemLinePair>,
    field10_ids: Vec<i64>,
    field11_ids: Vec<i64>,
    field14_ids: Vec<i64>,
    detail_stat_lines: Vec<DetailStatLine>,
    detail_gear_config_id: Option<i64>,
    detail_gear_instance_id: Option<i64>,
    unknown_field16: Option<i64>,
    matched_detail_candidates: Vec<RecentItemDetailCandidate>,
}

fn item_quality_label(quality_tier: u64) -> String {
    match quality_tier {
        5 => "Quality 5".to_string(),
        100 | 4 => "Purple".to_string(),
        80 | 3 => "Blue".to_string(),
        60 | 2 => "Green".to_string(),
        40 | 1 => "White".to_string(),
        0 => "Unknown".to_string(),
        value => format!("Quality {value}"),
    }
}

fn item_id_looks_like_gear(config_id: i64) -> bool {
    (GEAR_ITEM_ID_MIN..=GEAR_ITEM_ID_MAX).contains(&config_id)
}

fn gear_config_id_looks_like_gear(config_id: i64) -> bool {
    (GEAR_CONFIG_ID_MIN..=GEAR_CONFIG_ID_MAX).contains(&config_id)
}

fn gear_instance_id_looks_like_gear(instance_id: i64) -> bool {
    item_id_looks_like_gear(instance_id)
}

fn item_id_looks_like_legendary_reward_box(item_id: i64) -> bool {
    (1_049_705..=1_049_740).contains(&item_id)
}

fn item_display_rarity_label(decoded: &DecodedItemCandidate) -> Option<String> {
    if item_id_looks_like_legendary_reward_box(decoded.instance_id)
        || decoded
            .detail_gear_instance_id
            .is_some_and(item_id_looks_like_legendary_reward_box)
    {
        return Some("Legendary".to_string());
    }

    if decoded.item_kind == "gear" {
        return match decoded.quality_tier {
            5 => Some("Legendary".to_string()),
            100 | 4 => Some("Purple".to_string()),
            80 | 3 => Some("Blue".to_string()),
            60 | 2 => Some("Green".to_string()),
            40 | 1 => Some("White".to_string()),
            _ => None,
        };
    }

    None
}

fn item_candidate_kind(decoded: &DecodedItemCandidate) -> &'static str {
    if decoded.perfection_value.is_some()
        || decoded.perfection_cap.is_some()
        || !decoded.field10_ids.is_empty()
        || !decoded.field11_ids.is_empty()
        || !decoded.field14_ids.is_empty()
        || item_id_looks_like_gear(decoded.instance_id)
        || decoded
            .detail_gear_instance_id
            .is_some_and(item_id_looks_like_gear)
    {
        "gear"
    } else {
        "item"
    }
}

fn dedup_i64(values: Vec<i64>) -> Vec<i64> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value) {
            out.push(value);
        }
    }
    out
}

fn extract_dirty_blob_bytes_from_sync_container_dirty_payload<'a>(
    payload: &'a [u8],
) -> Option<&'a [u8]> {
    let outer = proto_first_len(payload, 1)?;
    proto_first_len(outer, 1)
}

fn read_padded_i32_values(bytes: &[u8], max_values: usize) -> Vec<i32> {
    let mut out = Vec::new();
    let mut offset = 0usize;
    while offset + 8 <= bytes.len() && out.len() < max_values {
        let value = i32::from_le_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ]);
        out.push(value);
        offset += 8;
    }
    out
}

fn detail_value_is_interesting(value: i64) -> bool {
    (GEAR_ITEM_ID_MIN..=GEAR_ITEM_ID_MAX).contains(&value)
        || (2_500..=3_600).contains(&value)
        || (10..=120).contains(&value)
        || (180..=2_000).contains(&value)
        || (12_000_000..=12_999_999).contains(&value)
}

fn detail_value_is_display_candidate(value: i64) -> bool {
    (180..=5_000).contains(&value)
}

fn push_detail_value_candidate(
    out: &mut Vec<DetailValueCandidate>,
    seen: &mut HashSet<(usize, i64, usize)>,
    offset: usize,
    value: i64,
    signed: i64,
    width: usize,
) {
    if seen.insert((offset, value, width)) {
        out.push(DetailValueCandidate {
            offset,
            value,
            signed,
            width,
        });
    }
}

fn read_dead_beef_detail_values(payload: &[u8], max_values: usize) -> Vec<DetailValueCandidate> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut segment_start = 0usize;
    let mut search_offset = 0usize;

    while search_offset + DEAD_BEEF_DELIMITER.len() <= payload.len() && out.len() < max_values {
        let Some(relative_offset) = payload[search_offset..]
            .windows(DEAD_BEEF_DELIMITER.len())
            .position(|window| window == DEAD_BEEF_DELIMITER)
        else {
            break;
        };
        let delimiter_offset = search_offset + relative_offset;
        let segment_len = delimiter_offset.saturating_sub(segment_start);

        if segment_len >= 4 {
            let value_offset = delimiter_offset - 4;
            let unsigned = u32::from_le_bytes([
                payload[value_offset],
                payload[value_offset + 1],
                payload[value_offset + 2],
                payload[value_offset + 3],
            ]) as i64;
            let signed = i32::from_le_bytes([
                payload[value_offset],
                payload[value_offset + 1],
                payload[value_offset + 2],
                payload[value_offset + 3],
            ]) as i64;
            if detail_value_is_interesting(unsigned) || detail_value_is_interesting(signed.abs()) {
                push_detail_value_candidate(&mut out, &mut seen, value_offset, unsigned, signed, 4);
            }
        }

        if segment_len >= 8 {
            let value_offset = delimiter_offset - 8;
            let low = u32::from_le_bytes([
                payload[value_offset],
                payload[value_offset + 1],
                payload[value_offset + 2],
                payload[value_offset + 3],
            ]) as i64;
            let high = u32::from_le_bytes([
                payload[value_offset + 4],
                payload[value_offset + 5],
                payload[value_offset + 6],
                payload[value_offset + 7],
            ]) as i64;
            if high == 0 && detail_value_is_interesting(low) {
                push_detail_value_candidate(&mut out, &mut seen, value_offset, low, low, 8);
            }
        }

        segment_start = delimiter_offset + DEAD_BEEF_DELIMITER.len();
        search_offset = segment_start;
    }

    out.sort_by(|left, right| {
        left.offset
            .cmp(&right.offset)
            .then_with(|| left.width.cmp(&right.width))
    });
    out.truncate(max_values);
    out
}

fn find_detail_gear_identity(values: &[i32]) -> (Option<i64>, Option<i64>) {
    for (index, value) in values.iter().copied().enumerate() {
        let config_id = i64::from(value);
        if !gear_config_id_looks_like_gear(config_id) {
            continue;
        }

        let instance_id = values
            .iter()
            .skip(index + 1)
            .take(8)
            .map(|value| i64::from(*value))
            .find(|value| gear_instance_id_looks_like_gear(*value));
        return (Some(config_id), instance_id);
    }

    (None, None)
}

fn summarize_recent_item_detail_candidate(
    ts_ms: i64,
    payload: &[u8],
) -> Option<RecentItemDetailCandidate> {
    let dirty_blob = extract_dirty_blob_bytes_from_sync_container_dirty_payload(payload)?;
    let dirty_values = read_padded_i32_values(dirty_blob, 256);
    if dirty_values.is_empty() {
        return None;
    }

    let filtered_values: Vec<i32> = dirty_values
        .iter()
        .copied()
        .filter(|value| *value != DIRTY_PAD_SENTINEL)
        .collect();

    let mut large_values = Vec::new();
    let mut large_seen = HashSet::new();
    for value in filtered_values.iter().copied() {
        if value > 1_000 && large_seen.insert(value) {
            large_values.push(value as i64);
            if large_values.len() >= 24 {
                break;
            }
        }
    }

    let mut small_counts: HashMap<i32, usize> = HashMap::new();
    for value in filtered_values.iter().copied() {
        if matches!(value, -4 | -3 | -2 | -1 | 0 | 1 | 2) || value.abs() >= 1_000 {
            continue;
        }
        *small_counts.entry(value).or_insert(0) += 1;
    }

    let mut frequent_small_values: Vec<FrequentDirtyValue> = small_counts
        .into_iter()
        .map(|(value, count)| FrequentDirtyValue { value, count })
        .collect();
    frequent_small_values.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.value.cmp(&right.value))
    });
    frequent_small_values.truncate(12);
    let (gear_config_id, gear_instance_id) = find_detail_gear_identity(&filtered_values);

    Some(RecentItemDetailCandidate {
        ts_ms,
        payload_len: payload.len(),
        dirty_blob_len: dirty_blob.len(),
        dirty_i32_count: dirty_values.len(),
        gear_config_id,
        gear_instance_id,
        first_values: filtered_values.into_iter().take(32).collect(),
        large_values,
        frequent_small_values,
        stat_value_candidates: read_dead_beef_detail_values(payload, 160),
    })
}

fn remember_recent_item_detail_candidate(ts_ms: i64, payload: &[u8]) {
    if payload.len() < 128 {
        return;
    }

    let Some(candidate) = summarize_recent_item_detail_candidate(ts_ms, payload) else {
        return;
    };

    let mut guard = item_probe_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    while guard.recent_dirty_candidates.len() >= ITEM_DETAIL_RECENT_LIMIT {
        guard.recent_dirty_candidates.pop_front();
    }
    guard.recent_dirty_candidates.push_back(candidate);
    while guard
        .recent_dirty_candidates
        .front()
        .is_some_and(|entry| ts_ms - entry.ts_ms > ITEM_DETAIL_LOOKBACK_MS * 4)
    {
        guard.recent_dirty_candidates.pop_front();
    }
}

fn recent_item_detail_candidates_for(
    config_id: i64,
    instance_id: i64,
    ts_ms: i64,
) -> Vec<RecentItemDetailCandidate> {
    let mut guard = item_probe_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    while guard
        .recent_dirty_candidates
        .front()
        .is_some_and(|entry| ts_ms - entry.ts_ms > ITEM_DETAIL_LOOKBACK_MS * 4)
    {
        guard.recent_dirty_candidates.pop_front();
    }

    let mut exact_matches = Vec::new();
    let mut nearby_matches = Vec::new();
    for entry in guard.recent_dirty_candidates.iter() {
        let age_ms = ts_ms - entry.ts_ms;
        if !(0..=ITEM_DETAIL_LOOKBACK_MS).contains(&age_ms) {
            continue;
        }

        if entry.large_values.contains(&(config_id as i64))
            || entry.large_values.contains(&(instance_id as i64))
        {
            exact_matches.push(entry.clone());
            continue;
        }

        let looks_like_gear_detail = entry.payload_len >= 192
            || entry.dirty_blob_len >= 176
            || entry.large_values.len() >= 8
            || entry
                .frequent_small_values
                .iter()
                .any(|value| value.count >= 3 && value.value.abs() >= 3);

        if looks_like_gear_detail {
            nearby_matches.push(entry.clone());
        }
    }

    exact_matches.sort_by(|left, right| {
        right
            .payload_len
            .cmp(&left.payload_len)
            .then_with(|| right.ts_ms.cmp(&left.ts_ms))
    });
    nearby_matches.sort_by(|left, right| {
        right
            .payload_len
            .cmp(&left.payload_len)
            .then_with(|| right.ts_ms.cmp(&left.ts_ms))
    });

    if !exact_matches.is_empty() {
        exact_matches.truncate(3);
        exact_matches
    } else {
        nearby_matches.truncate(2);
        nearby_matches
    }
}

fn collect_item_line_ids(buf: &[u8], field_number: u32) -> Vec<i64> {
    dedup_i64(
        proto_all_len(buf, field_number)
            .into_iter()
            .filter_map(|slice| proto_first_varint(slice, 1).map(|value| value as i64))
            .collect(),
    )
}

fn collect_item_line_pairs(buf: &[u8], field_number: u32) -> Vec<ItemLinePair> {
    let mut seen = HashSet::new();
    let mut pairs = Vec::new();
    for slice in proto_all_len(buf, field_number) {
        let Some(id) = proto_first_varint(slice, 1) else {
            continue;
        };
        let value = proto_first_varint(slice, 2).unwrap_or_default() as i64;
        let id = id as i64;
        if !seen.insert((id, value)) {
            continue;
        }
        pairs.push(ItemLinePair { id, value });
    }
    pairs
}

fn first_detail_value_offset(
    values: &[DetailValueCandidate],
    target: i64,
    after_offset: Option<usize>,
) -> Option<usize> {
    values
        .iter()
        .filter(|entry| entry.value == target)
        .filter(|entry| after_offset.is_none_or(|offset| entry.offset > offset))
        .map(|entry| entry.offset)
        .next()
}

fn detail_stat_pair_ids(decoded: &DecodedItemCandidate) -> Vec<i64> {
    dedup_i64(
        decoded
            .field10_ids
            .iter()
            .chain(decoded.field11_ids.iter())
            .chain(decoded.field14_ids.iter())
            .copied()
            .collect(),
    )
}

fn resolve_detail_stat_lines(
    decoded: &DecodedItemCandidate,
    candidate: &RecentItemDetailCandidate,
) -> Vec<DetailStatLine> {
    let gear_item_id = decoded
        .detail_gear_instance_id
        .unwrap_or(decoded.instance_id);
    let pair_ids = detail_stat_pair_ids(decoded);
    if pair_ids.is_empty() || candidate.stat_value_candidates.is_empty() {
        return Vec::new();
    }

    let item_offset =
        first_detail_value_offset(&candidate.stat_value_candidates, gear_item_id, None)
            .or_else(|| {
                first_detail_value_offset(&candidate.stat_value_candidates, decoded.config_id, None)
            })
            .unwrap_or(0);
    let pair_offsets = pair_ids
        .iter()
        .map(|pair_id| {
            first_detail_value_offset(
                &candidate.stat_value_candidates,
                *pair_id,
                Some(item_offset),
            )
        })
        .collect::<Vec<_>>();
    let first_pair_offset = pair_offsets.iter().flatten().copied().min();
    let identifier_values: HashSet<i64> = pair_ids
        .iter()
        .chain(
            [
                decoded.config_id,
                decoded.instance_id,
                gear_item_id,
                decoded.detail_gear_config_id.unwrap_or_default(),
                decoded.detail_gear_instance_id.unwrap_or_default(),
                decoded
                    .perfection_value
                    .map(|value| value as i64)
                    .unwrap_or_default(),
                decoded
                    .perfection_cap
                    .map(|value| value as i64)
                    .unwrap_or_default(),
            ]
            .iter(),
        )
        .copied()
        .filter(|value| *value != 0)
        .collect();

    let mut picked = candidate
        .stat_value_candidates
        .iter()
        .filter(|entry| entry.offset >= item_offset)
        .filter(|entry| !identifier_values.contains(&entry.value))
        .filter(|entry| detail_value_is_display_candidate(entry.value))
        .filter(|entry| first_pair_offset.is_none_or(|offset| entry.offset < offset))
        .cloned()
        .collect::<Vec<_>>();

    if picked.is_empty() {
        picked = candidate
            .stat_value_candidates
            .iter()
            .filter(|entry| entry.offset >= item_offset)
            .filter(|entry| !identifier_values.contains(&entry.value))
            .filter(|entry| detail_value_is_display_candidate(entry.value))
            .cloned()
            .collect();
    }

    let mut seen_values = HashSet::new();
    picked.retain(|entry| seen_values.insert((entry.offset, entry.value)));
    picked.sort_by(|left, right| left.offset.cmp(&right.offset));

    pair_ids
        .into_iter()
        .zip(picked)
        .enumerate()
        .map(|(slot, (pair_id, value))| {
            let pair_offset = pair_offsets.get(slot).copied().flatten();
            DetailStatLine {
                slot,
                pair_id,
                value: value.value,
                value_offset: value.offset,
                pair_offset,
                resolution: if pair_offset.is_none_or(|offset| value.offset < offset) {
                    "ordered-prefix"
                } else {
                    "ordered-fallback"
                },
            }
        })
        .collect()
}

fn decode_item_candidate_payload(payload: &[u8], ts_ms: i64) -> Option<DecodedItemCandidate> {
    let wrapper = proto_first_len(payload, 1)?;
    let quality_tier = proto_first_varint(wrapper, 1)?;
    let detail = proto_first_len(wrapper, 2)?;
    let config_id = proto_first_varint(detail, 1)? as i64;
    let instance_id = proto_first_varint(detail, 2)? as i64;
    let nested = proto_first_len(detail, 10);

    let field10_pairs = nested
        .map(|value| collect_item_line_pairs(value, 10))
        .unwrap_or_default();
    let field11_pairs = nested
        .map(|value| collect_item_line_pairs(value, 11))
        .unwrap_or_default();
    let field14_pairs = nested
        .map(|value| collect_item_line_pairs(value, 14))
        .unwrap_or_default();
    let field10_ids = nested
        .map(|value| collect_item_line_ids(value, 10))
        .unwrap_or_default();
    let field11_ids = nested
        .map(|value| collect_item_line_ids(value, 11))
        .unwrap_or_default();
    let field14_ids = nested
        .map(|value| collect_item_line_ids(value, 14))
        .unwrap_or_default();
    let matched_detail_candidates =
        recent_item_detail_candidates_for(config_id, instance_id, ts_ms);
    let detail_gear_config_id = matched_detail_candidates
        .iter()
        .find_map(|candidate| candidate.gear_config_id);
    let detail_gear_instance_id = matched_detail_candidates
        .iter()
        .find_map(|candidate| candidate.gear_instance_id);

    let mut decoded = DecodedItemCandidate {
        quality_tier,
        quality_label: item_quality_label(quality_tier).to_string(),
        config_id,
        instance_id,
        state_flag: proto_first_varint(detail, 3),
        server_ts_ms: proto_first_varint(detail, 6).map(|value| value as i64),
        unknown_field8: proto_first_varint(detail, 8).map(|value| value as i64),
        line_count_hint: proto_first_varint(detail, 9),
        perfection_value: nested.and_then(|value| proto_first_varint(value, 7)),
        perfection_cap: nested.and_then(|value| proto_first_varint(value, 15)),
        field10_pairs,
        field11_pairs,
        field14_pairs,
        field10_ids,
        field11_ids,
        field14_ids,
        detail_gear_config_id,
        detail_gear_instance_id,
        unknown_field16: proto_first_varint(detail, 16).map(|value| value as i64),
        matched_detail_candidates,
        ..DecodedItemCandidate::default()
    };
    decoded.item_kind = item_candidate_kind(&decoded).to_string();
    decoded.detail_stat_lines = decoded
        .matched_detail_candidates
        .iter()
        .flat_map(|candidate| resolve_detail_stat_lines(&decoded, candidate))
        .collect();

    Some(decoded)
}

fn build_item_candidate_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let decoded = decode_item_candidate_payload(notify.payload.as_ref(), ts_ms)?;
    let display_rarity_label = item_display_rarity_label(&decoded);
    let gear_item_id = decoded
        .detail_gear_instance_id
        .unwrap_or(decoded.instance_id);
    let gear_slot_label = if decoded.item_kind == "gear" {
        gear_slot_label_from_item_id(gear_item_id)
    } else {
        None
    };

    let perfection_summary = match (decoded.perfection_value, decoded.perfection_cap) {
        (Some(value), Some(cap)) => format!(" perfection={value}/{cap}"),
        (Some(value), None) => format!(" perfection={value}"),
        (None, Some(cap)) => format!(" cap={cap}"),
        (None, None) => String::new(),
    };
    let detail_summary = if decoded.matched_detail_candidates.is_empty() {
        String::new()
    } else {
        let sizes = decoded
            .matched_detail_candidates
            .iter()
            .map(|entry| entry.payload_len.to_string())
            .collect::<Vec<_>>()
            .join(",");
        format!(" details={sizes}B")
    };
    let field14_summary = if decoded.field14_ids.is_empty() {
        String::new()
    } else {
        format!(" field14={}", decoded.field14_ids.len())
    };
    let line_count_summary = decoded
        .line_count_hint
        .map(|value| format!(" lines={value}"))
        .unwrap_or_default();
    let detail_gear_summary = if decoded.item_kind == "gear"
        && decoded
            .detail_gear_config_id
            .is_some_and(|value| value != decoded.config_id)
    {
        match (
            decoded.detail_gear_config_id,
            decoded.detail_gear_instance_id,
        ) {
            (Some(config_id), Some(instance_id)) => {
                format!(" gearCfg={config_id} gearInst={instance_id}")
            }
            (Some(config_id), None) => format!(" gearCfg={config_id}"),
            (None, Some(instance_id)) => format!(" gearInst={instance_id}"),
            (None, None) => String::new(),
        }
    } else {
        String::new()
    };

    let summary = if item_id_looks_like_legendary_reward_box(decoded.instance_id) {
        format!(
            "{} gift box cfg={} inst={}{}{}{}",
            display_rarity_label.as_deref().unwrap_or("Legendary"),
            decoded.config_id,
            decoded.instance_id,
            line_count_summary,
            field14_summary,
            detail_summary,
        )
    } else if let Some(slot_label) = gear_slot_label {
        gear_drop_summary_from_decoded(slot_label, &decoded)
    } else {
        let rarity_prefix = display_rarity_label
            .as_ref()
            .map(|label| format!("{label} "))
            .unwrap_or_default();
        let item_kind_summary = if decoded.item_kind == "gear" {
            "gear"
        } else {
            "Item"
        };
        format!(
            "{}{} cfg={} inst={}{}{}{}{}{}",
            rarity_prefix,
            item_kind_summary,
            decoded.config_id,
            decoded.instance_id,
            perfection_summary,
            detail_gear_summary,
            line_count_summary,
            field14_summary,
            detail_summary,
        )
    };

    let name_config_id = if decoded.item_kind == "gear" {
        decoded.detail_gear_config_id.unwrap_or(decoded.config_id)
    } else {
        decoded.config_id
    };
    let kind_label = if decoded.item_kind == "gear" {
        "Gear"
    } else {
        "Item"
    };
    let name_hint = Some(match display_rarity_label.as_ref() {
        Some(label) => format!("{label} {kind_label} {name_config_id}"),
        None => format!("{kind_label} {name_config_id}"),
    });
    let value = match (decoded.perfection_value, decoded.perfection_cap) {
        (Some(value), Some(cap)) => Some(format!("{value}/{cap}")),
        (Some(value), None) => Some(value.to_string()),
        (None, Some(cap)) => Some(cap.to_string()),
        (None, None) => Some(decoded.config_id.to_string()),
    };

    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "item_drop",
        "obtained",
        Some(decoded.instance_id),
        None,
        Some("Inventory".to_string()),
        Some(decoded.config_id),
        display_rarity_label.clone(),
        name_hint,
        Some(summary),
        value,
        serde_json::json!({
            "itemKind": decoded.item_kind,
            "isGear": decoded.item_kind == "gear",
            "qualityTier": decoded.quality_tier,
            "qualityLabel": decoded.quality_label,
            "displayQualityLabel": display_rarity_label,
            "configId": decoded.config_id,
            "instanceId": decoded.instance_id,
            "stateFlag": decoded.state_flag,
            "serverTsMs": decoded.server_ts_ms,
            "unknownField8": decoded.unknown_field8,
            "lineCountHint": decoded.line_count_hint,
            "perfectionValue": decoded.perfection_value,
            "perfectionCap": decoded.perfection_cap,
            "field10Pairs": decoded.field10_pairs,
            "field11Pairs": decoded.field11_pairs,
            "field14Pairs": decoded.field14_pairs,
            "field10Ids": decoded.field10_ids,
            "field11Ids": decoded.field11_ids,
            "field14Ids": decoded.field14_ids,
            "detailStatLines": decoded.detail_stat_lines,
            "detailGearConfigId": decoded.detail_gear_config_id,
            "detailGearInstanceId": decoded.detail_gear_instance_id,
            "gearSlot": gear_slot_label,
            "unknownField16": decoded.unknown_field16,
            "matchedDetailCandidates": decoded.matched_detail_candidates,
        }),
    ))
}

fn gear_slot_label_from_item_id(item_id: i64) -> Option<&'static str> {
    match item_id / 10_000 {
        200 => Some("Weapon"),
        201 => Some("Mask"),
        202 => Some("Armor"),
        203 => Some("Gloves"),
        204 => Some("Boots"),
        205 => Some("Earring"),
        206 => Some("Necklace"),
        207 => Some("Ring"),
        208 => Some("Bracelet (L)"),
        209 => Some("Bracelet (R)"),
        210 => Some("Charm"),
        _ => None,
    }
}

fn gear_drop_summary_from_decoded(slot_label: &str, decoded: &DecodedItemCandidate) -> String {
    let mut parts = Vec::new();
    let mut sub_stats = Vec::new();
    let include_special_stats = gear_can_show_special_stats(decoded);
    let gear_item_id = decoded
        .detail_gear_instance_id
        .unwrap_or(decoded.instance_id);

    for (slot, pair_id) in detail_stat_pair_ids(decoded).into_iter().enumerate() {
        if include_special_stats
            && let Some(summary) = gear_special_stat_summary(gear_item_id, pair_id)
        {
            parts.push(summary.to_string());
        } else if let Some(summary) = gear_sub_stat_summary(gear_item_id, pair_id) {
            sub_stats.push((summary, slot));
        }
    }

    sub_stats.sort_by(|left, right| left.1.cmp(&right.1));

    let mut sub_summaries = Vec::new();
    for (summary, _) in sub_stats {
        if sub_summaries.contains(&summary) {
            continue;
        }
        sub_summaries.push(summary);
    }

    if !sub_summaries.is_empty() {
        parts.push(sub_summaries.join(" > "));
    }

    if parts.is_empty() {
        slot_label.to_string()
    } else {
        format!("{slot_label}: {}", parts.join(", "))
    }
}

fn gear_can_show_special_stats(decoded: &DecodedItemCandidate) -> bool {
    let quality_label = decoded.quality_label.trim().to_ascii_lowercase();
    if matches!(
        quality_label.as_str(),
        "white" | "green" | "blue" | "purple" | "unknown"
    ) {
        return false;
    }
    if quality_label.contains("gold")
        || quality_label.contains("legendary")
        || quality_label.contains("orange")
    {
        return true;
    }

    !matches!(decoded.quality_tier, 0 | 1 | 2 | 3 | 4 | 40 | 60 | 80 | 100)
        && decoded.quality_tier > 4
}

fn gear_special_stat_summary(gear_item_id: i64, pair_id: i64) -> Option<&'static str> {
    match (gear_item_id, pair_id) {
        (2_030_814, 2724) => Some("All Element Resistance +24"),
        (2_030_819, 2724) => Some("All Element Resistance +48"),
        (2_050_816, 2723) => Some("DMG Bonus vs. Bosses +1.5%"),
        (2_050_818, 2723) => Some("DMG Bonus vs. Bosses +2%"),
        (2_051_014, 2741) => Some("Attack Speed +1%"),
        _ => None,
    }
}

fn gear_sub_stat_summary(gear_item_id: i64, pair_id: i64) -> Option<&'static str> {
    match (gear_item_id, pair_id) {
        (2_030_814, 2959) => Some("Haste 451"),
        (2_030_814, 2805) => Some("Mastery 225"),
        (2_030_819, 2955) => Some("Versatility 451"),
        (2_030_819, 2811) => Some("Haste 225"),
        (2_050_816, 2959) => Some("Mastery 225"),
        (2_050_816, 2807) => Some("Luck 451"),
        (2_050_818, 2957) => Some("Luck 225"),
        (2_050_818, 2809) => Some("Mastery 450"),
        (2_051_014, 2883) => Some("Crit 680"),
        (2_051_014, 3039) => Some("Mastery 339"),
        _ => None,
    }
}

fn sync_log_channel_from_text(text: &str) -> Option<&'static str> {
    let lower = text.to_lowercase();
    if lower.contains("[team]")
        || lower.contains(" team ")
        || lower.contains("队伍")
        || lower.contains("队聊")
    {
        return Some("team");
    }
    if lower.contains("[guild]") || lower.contains(" guild ") || lower.contains("公会") {
        return Some("guild");
    }
    if lower.contains("[world]")
        || lower.contains(" world ")
        || lower.contains("世界")
        || lower.contains("频道#")
        || lower.contains("频道 #")
    {
        return Some("world");
    }
    if lower.contains("[general]")
        || lower.contains(" general ")
        || lower.contains("综合")
        || lower.contains("附近")
    {
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
    let has_speaker_delimiter =
        trimmed.contains(": ") || trimmed.contains("：") || trimmed.contains("] ");
    let has_chat_hint = [
        "team", "guild", "world", "general", "system", "队伍", "公会", "世界", "综合", "系统",
    ]
    .iter()
    .any(|needle| lower.contains(needle));
    has_speaker_delimiter && has_chat_hint
}

fn sync_log_contains_drop_hint(text: &str) -> bool {
    let lower = text.to_lowercase();
    [
        "obtained",
        "received",
        "loot",
        "looted",
        "drop",
        "picked up",
        "reward",
        "奖励",
        "获得",
        "掉落",
        "拾取",
    ]
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

fn dungeon_state_label(state: i32) -> String {
    blueprotobuf::EDungeonState::try_from(state)
        .map(|value| {
            value
                .as_str_name()
                .trim_start_matches("DungeonState")
                .to_string()
        })
        .unwrap_or_else(|_| format!("Unknown({state})"))
}

fn summarize_dungeon_targets(target: Option<&blueprotobuf::DungeonTarget>) -> Option<String> {
    let target = target?;
    if target.target_data.is_empty() {
        return None;
    }

    let total = target.target_data.len();
    let completed = target
        .target_data
        .values()
        .filter(|entry| entry.complete.unwrap_or_default() > 0)
        .count();

    Some(format!("targets={completed}/{total}"))
}

fn build_sync_dungeon_data_logger_entry(
    ts_ms: i64,
    sync_dungeon_data: blueprotobuf::SyncDungeonData,
) -> EventLoggerEntry {
    let mut summary_parts = Vec::new();
    let mut value = None;
    let mut uid = None;
    let mut name_hint = Some("SyncDungeonData".to_string());

    if let Some(v_data) = sync_dungeon_data.v_data.as_ref() {
        uid = v_data.scene_uuid;

        if let Some(flow_info) = v_data.flow_info.as_ref() {
            if let Some(state) = flow_info.state {
                let state_label = dungeon_state_label(state);
                summary_parts.push(format!("state={state_label}"));
                value = Some(state_label.clone());
                name_hint = Some(format!("SyncDungeonData · {state_label}"));
            }
            if let Some(ready_time) = flow_info.ready_time {
                summary_parts.push(format!("readyTime={ready_time}"));
            }
            if let Some(active_time) = flow_info.active_time {
                summary_parts.push(format!("activeTime={active_time}"));
            }
            if let Some(play_time) = flow_info.play_time {
                summary_parts.push(format!("playTime={play_time}"));
            }
            if let Some(result) = flow_info.result {
                summary_parts.push(format!("result={result}"));
            }
        }

        if let Some(target_summary) = summarize_dungeon_targets(v_data.target.as_ref()) {
            summary_parts.push(target_summary);
        }

        if let Some(vote) = v_data.vote.as_ref() {
            let yes_votes = vote.vote.values().filter(|&&value| value > 0).count();
            summary_parts.push(format!("votes={}/{}", yes_votes, vote.vote.len()));
        }

        if let Some(player_list) = v_data.dungeon_player_list.as_ref() {
            summary_parts.push(format!("players={}", player_list.player_infos.len()));
        }

        if let Some(hero_key) = v_data.hero_key.as_ref() {
            let use_item = hero_key
                .use_item
                .as_ref()
                .and_then(|item| item.config_id)
                .map(|config_id| format!("useItem={config_id}"));
            summary_parts.push(format!(
                "heroKeyItems={} awards={}{}",
                hero_key.hero_key_item.len(),
                hero_key.hero_key_award_item.len(),
                use_item
                    .map(|value| format!(" {value}"))
                    .unwrap_or_default()
            ));
        }

        if let Some(revive_info) = v_data.revive_info.as_ref() {
            summary_parts.push(format!(
                "reviveIds={} reviveMap={}",
                revive_info.revive_ids.len(),
                revive_info.revive_map.len()
            ));
        }
    } else {
        summary_parts.push("vData=missing".to_string());
    }

    EventLoggerEntry {
        ts_ms,
        category: "dungeon_probe".into(),
        action: "sync_data".into(),
        uid,
        target_uid: None,
        source_uid: None,
        source_label: None,
        target_label: None,
        name_hint,
        summary: Some(summary_parts.join(" ")),
        stacks: None,
        duration_ms: None,
        remaining_ms: None,
        value,
        raw: serde_json::to_string_pretty(&sync_dungeon_data)
            .unwrap_or_else(|_| "null".to_string()),
    }
}

fn build_sync_dungeon_dirty_data_logger_entry(
    ts_ms: i64,
    sync_dungeon_dirty_data: blueprotobuf::SyncDungeonDirtyData,
) -> EventLoggerEntry {
    let mut summary_parts = Vec::new();
    let mut raw_json = serde_json::json!({
        "packet": "SyncDungeonDirtyData",
        "vData": "missing",
    });
    let mut value = None;
    let mut name_hint = Some("SyncDungeonDirtyData".to_string());

    if let Some(v_data) = sync_dungeon_dirty_data.v_data.as_ref() {
        if let Some(buffer) = v_data.buffer.as_ref() {
            summary_parts.push(format!("bufferLen={}B", buffer.len()));
            match crate::live::dungeon_dirty_blob::parse_dirty_dungeon_data(buffer.as_slice()) {
                Ok(parsed) => {
                    if let Some(state) = parsed.flow_state {
                        let state_label = dungeon_state_label(state);
                        summary_parts.push(format!("state={state_label}"));
                        value = Some(state_label.clone());
                        name_hint = Some(format!("SyncDungeonDirtyData · {state_label}"));
                    }
                    summary_parts.push(format!("targets={}", parsed.targets.len()));
                    raw_json = serde_json::json!({
                        "packet": "SyncDungeonDirtyData",
                        "bufferLen": buffer.len(),
                        "parsed": {
                            "flowState": parsed.flow_state,
                            "flowStateLabel": parsed.flow_state.map(dungeon_state_label),
                            "targets": parsed.targets.iter().map(|target| serde_json::json!({
                                "targetId": target.target_id,
                                "nums": target.nums,
                                "complete": target.complete,
                            })).collect::<Vec<_>>(),
                        }
                    });
                }
                Err(error) => {
                    summary_parts.push(format!("parseError={error}"));
                    raw_json = serde_json::json!({
                        "packet": "SyncDungeonDirtyData",
                        "bufferLen": buffer.len(),
                        "parseError": error,
                    });
                }
            }
        } else {
            summary_parts.push("buffer=missing".to_string());
            raw_json = serde_json::json!({
                "packet": "SyncDungeonDirtyData",
                "vData": {
                    "buffer": "missing",
                }
            });
        }
    } else {
        summary_parts.push("vData=missing".to_string());
    }

    EventLoggerEntry {
        ts_ms,
        category: "dungeon_probe".into(),
        action: "dirty_sync_data".into(),
        uid: None,
        target_uid: None,
        source_uid: None,
        source_label: None,
        target_label: None,
        name_hint,
        summary: Some(summary_parts.join(" ")),
        stacks: None,
        duration_ms: None,
        remaining_ms: None,
        value,
        raw: serde_json::to_string_pretty(&raw_json).unwrap_or_else(|_| "null".to_string()),
    }
}

fn is_cjk_name_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x3040..=0x30FF
            | 0xAC00..=0xD7AF
    )
}

fn is_candidate_name_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == ':' || is_cjk_name_char(ch)
}

fn looks_like_candidate_name(token: &str) -> bool {
    let trimmed = token.trim_matches(|ch: char| !is_candidate_name_char(ch));
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.chars().all(|ch| ch.is_ascii_digit()) {
        return false;
    }
    let lower = trimmed.to_lowercase();
    let blocked = [
        "http",
        "https",
        "photo",
        "playbpsr",
        "xinghen",
        "prod",
        "snapshot",
        "halflength",
        "com",
        "bpsrsteam",
        "unionid",
        "service",
        "notify",
        "return",
        "call",
        "echo",
        "blue",
        "protocol",
        "star",
        "resonance",
        "survey",
        "experience",
        "signrewardnotify",
    ];
    if blocked.iter().any(|value| lower == *value) {
        return false;
    }
    let has_ascii_alpha = trimmed.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_non_ascii_name = trimmed.chars().any(is_cjk_name_char);
    if has_ascii_alpha {
        return (2..=32).contains(&trimmed.chars().count());
    }
    if has_non_ascii_name {
        return (1..=16).contains(&trimmed.chars().count());
    }
    false
}

fn extract_candidate_names_from_payload(payload: &[u8]) -> Vec<String> {
    let preview = String::from_utf8_lossy(payload);
    let mut current = String::new();
    let mut names = Vec::new();

    let push_current = |current: &mut String, names: &mut Vec<String>| {
        if current.is_empty() {
            return;
        }
        let token = current.clone();
        current.clear();
        if !looks_like_candidate_name(&token) {
            return;
        }
        if names.iter().any(|existing| existing == &token) {
            return;
        }
        names.push(token);
    };

    for ch in preview.chars() {
        if is_candidate_name_char(ch) {
            current.push(ch);
        } else {
            push_current(&mut current, &mut names);
        }
        if names.len() >= 6 {
            break;
        }
    }
    push_current(&mut current, &mut names);
    names
}

#[derive(Debug, Default)]
struct ProbeStringBuckets {
    loadouts: Vec<String>,
    playerish: Vec<String>,
    service_ids: Vec<String>,
    urls: Vec<String>,
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        if !out.iter().any(|existing| existing == &value) {
            out.push(value);
        }
    }
    out
}

fn classify_probe_strings(values: &[String]) -> ProbeStringBuckets {
    let mut buckets = ProbeStringBuckets::default();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if lower.starts_with("http") {
            buckets.urls.push(trimmed.to_string());
            continue;
        }
        if lower.starts_with("com.") || lower.contains("bpsrsteam") {
            buckets.service_ids.push(trimmed.to_string());
            continue;
        }
        if trimmed.contains(':') || trimmed.contains('-') {
            buckets.loadouts.push(trimmed.to_string());
            continue;
        }
        buckets.playerish.push(trimmed.to_string());
    }

    let loadouts_snapshot = buckets.loadouts.clone();
    buckets.playerish.retain(|candidate| {
        !loadouts_snapshot.iter().any(|loadout| {
            loadout != candidate
                && (loadout.contains(candidate)
                    || loadout
                        .split([':', '-'])
                        .any(|part| part.eq_ignore_ascii_case(candidate)))
        })
    });

    buckets.loadouts = dedupe_strings(buckets.loadouts);
    buckets.playerish = dedupe_strings(buckets.playerish);
    buckets.service_ids = dedupe_strings(buckets.service_ids);
    buckets.urls = dedupe_strings(buckets.urls);
    buckets
}

fn choose_probe_name_hint(method_name: Option<&str>, buckets: &ProbeStringBuckets) -> String {
    if !buckets.loadouts.is_empty() {
        let first = &buckets.loadouts[0];
        if buckets.loadouts.len() > 1 {
            return format!("Loadouts: {} (+{})", first, buckets.loadouts.len() - 1);
        }
        return format!("Loadouts: {}", first);
    }
    if let Some(method_name) = method_name {
        return method_name.to_string();
    }
    if let Some(first_name) = buckets.playerish.first() {
        if buckets.playerish.len() > 1 {
            return format!("{} (+{})", first_name, buckets.playerish.len() - 1);
        }
        return first_name.clone();
    }
    if let Some(first_service_id) = buckets.service_ids.first() {
        if buckets.service_ids.len() > 1 {
            return format!("{} (+{})", first_service_id, buckets.service_ids.len() - 1);
        }
        return first_service_id.clone();
    }
    "Unknown Service Fragment".to_string()
}

#[derive(Debug, Clone, Copy)]
enum ProtoFieldValue<'a> {
    Varint(u64),
    Len(&'a [u8]),
    Fixed32,
    Fixed64,
}

fn proto_read_varint(buf: &[u8], offset: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    let mut shift = 0u32;
    while *offset < buf.len() && shift < 64 {
        let byte = buf[*offset];
        *offset += 1;
        value |= u64::from(byte & 0x7F) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
        shift += 7;
    }
    None
}

fn proto_visit_fields<'a, F>(buf: &'a [u8], mut visitor: F)
where
    F: FnMut(u32, ProtoFieldValue<'a>) -> bool,
{
    let mut offset = 0usize;
    while offset < buf.len() {
        let Some(key) = proto_read_varint(buf, &mut offset) else {
            break;
        };
        let field_number = (key >> 3) as u32;
        let wire_type = (key & 0x07) as u8;
        let should_continue = match wire_type {
            0 => match proto_read_varint(buf, &mut offset) {
                Some(value) => visitor(field_number, ProtoFieldValue::Varint(value)),
                None => false,
            },
            1 => {
                let end = match offset.checked_add(8) {
                    Some(value) => value,
                    None => break,
                };
                if end > buf.len() {
                    break;
                }
                offset = end;
                visitor(field_number, ProtoFieldValue::Fixed64)
            }
            2 => {
                let Some(len) = proto_read_varint(buf, &mut offset) else {
                    break;
                };
                let len = len as usize;
                let end = match offset.checked_add(len) {
                    Some(value) => value,
                    None => break,
                };
                if end > buf.len() {
                    break;
                }
                let slice = &buf[offset..end];
                offset = end;
                visitor(field_number, ProtoFieldValue::Len(slice))
            }
            5 => {
                let end = match offset.checked_add(4) {
                    Some(value) => value,
                    None => break,
                };
                if end > buf.len() {
                    break;
                }
                offset = end;
                visitor(field_number, ProtoFieldValue::Fixed32)
            }
            _ => break,
        };

        if !should_continue {
            break;
        }
    }
}

fn proto_first_varint(buf: &[u8], field_number: u32) -> Option<u64> {
    let mut found = None;
    proto_visit_fields(buf, |field, value| {
        if field == field_number {
            if let ProtoFieldValue::Varint(varint) = value {
                found = Some(varint);
                return false;
            }
        }
        true
    });
    found
}

fn proto_first_len<'a>(buf: &'a [u8], field_number: u32) -> Option<&'a [u8]> {
    let mut found = None;
    proto_visit_fields(buf, |field, value| {
        if field == field_number {
            if let ProtoFieldValue::Len(slice) = value {
                found = Some(slice);
                return false;
            }
        }
        true
    });
    found
}

fn proto_all_len<'a>(buf: &'a [u8], field_number: u32) -> Vec<&'a [u8]> {
    let mut values = Vec::new();
    proto_visit_fields(buf, |field, value| {
        if field == field_number {
            if let ProtoFieldValue::Len(slice) = value {
                values.push(slice);
            }
        }
        true
    });
    values
}

fn proto_all_varint(buf: &[u8], field_number: u32) -> Vec<u64> {
    let mut values = Vec::new();
    proto_visit_fields(buf, |field, value| {
        if field == field_number {
            if let ProtoFieldValue::Varint(varint) = value {
                values.push(varint);
            }
        }
        true
    });
    values
}

fn proto_first_string(buf: &[u8], field_number: u32) -> Option<String> {
    let slice = proto_first_len(buf, field_number)?;
    let value = String::from_utf8_lossy(slice).trim().to_string();
    if value.is_empty() { None } else { Some(value) }
}

fn looks_like_uuidish(value: &str) -> bool {
    let trimmed = value.trim_matches(|ch| ch == '$' || ch == 'R' || ch == 'X');
    trimmed.len() >= 32
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_hexdigit() || ch == '-')
        && trimmed.matches('-').count() >= 3
}

fn chat_channel_label(channel_type: u64) -> &'static str {
    match channel_type {
        1 => "world",
        2 => "general",
        3 => "team",
        4 => "guild",
        5 => "private",
        6 => "group",
        7 => "notice",
        99 => "system",
        _ => "unknown",
    }
}

fn chat_message_type_label(msg_type: u64) -> &'static str {
    match msg_type {
        0 => "text",
        1 => "notice",
        2 => "multi_lang_notice",
        3 => "sticker",
        4 => "picture",
        5 => "voice",
        6 => "hypertext",
        _ => "unknown",
    }
}

fn match_status_label(status: u64) -> &'static str {
    match status {
        0 => "null",
        1 => "matching",
        2 => "wait_ready",
        3 => "all_ready",
        4 => "success",
        _ => "unknown",
    }
}

fn match_ready_status_label(status: u64) -> &'static str {
    match status {
        0 => "wait",
        1 => "ready",
        2 => "unready",
        _ => "unknown",
    }
}

fn team_vote_result_label(code: u64) -> &'static str {
    match code {
        0 => "null",
        1 => "agree",
        2 => "refuse",
        3 => "cancel",
        4 => "timeout",
        _ => "unknown",
    }
}

fn team_activity_state_label(state: u64) -> &'static str {
    match state {
        0 => "none",
        1 => "start",
        2 => "checking",
        3 => "voting",
        4 => "doing",
        5 => "end",
        _ => "unknown",
    }
}

fn error_code_label(code: u64) -> String {
    if code == 0 {
        "ErrSuccess".to_string()
    } else {
        format!("Err({code})")
    }
}

#[derive(Debug, Clone, Default)]
struct MatchPlayerSnapshot {
    char_id: Option<i64>,
    ready_status: Option<u64>,
    name: Option<String>,
    is_bot: bool,
}

fn parse_match_player_info(buf: &[u8]) -> MatchPlayerSnapshot {
    let show_info = proto_first_len(buf, 7);
    MatchPlayerSnapshot {
        char_id: proto_first_varint(buf, 1).map(|value| value as i64),
        ready_status: proto_first_varint(buf, 2),
        name: show_info.and_then(|value| proto_first_string(value, 1)),
        is_bot: proto_first_varint(buf, 6).unwrap_or(0) != 0,
    }
}

fn parse_match_player_map_entries(buf: &[u8], field_number: u32) -> Vec<MatchPlayerSnapshot> {
    let mut players = Vec::new();
    for entry in proto_all_len(buf, field_number) {
        let key_char_id = proto_first_varint(entry, 1).map(|value| value as i64);
        let player = proto_first_len(entry, 2)
            .map(parse_match_player_info)
            .unwrap_or_else(|| MatchPlayerSnapshot {
                char_id: key_char_id,
                ..Default::default()
            });
        players.push(MatchPlayerSnapshot {
            char_id: player.char_id.or(key_char_id),
            ..player
        });
    }
    players
}

fn count_match_ready_states(players: &[MatchPlayerSnapshot]) -> (usize, usize, usize) {
    let mut wait = 0usize;
    let mut ready = 0usize;
    let mut unready = 0usize;
    for player in players {
        match player.ready_status.unwrap_or_default() {
            1 => ready += 1,
            2 => unready += 1,
            _ => wait += 1,
        }
    }
    (wait, ready, unready)
}

fn build_promoted_service_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
    category: &str,
    action: &str,
    uid: Option<i64>,
    source_uid: Option<i64>,
    source_label: Option<String>,
    target_uid: Option<i64>,
    target_label: Option<String>,
    name_hint: Option<String>,
    summary: Option<String>,
    value: Option<String>,
    decoded: serde_json::Value,
) -> EventLoggerEntry {
    let label =
        crate::packets::dispatch::label(notify.fragment_type, notify.service_id, notify.method_id);
    let raw = serde_json::json!({
        "fragmentType": label.fragment_label,
        "serviceId": notify.service_id,
        "serviceIdHex": format!("0x{:016X}", notify.service_id),
        "serviceName": label.service_name,
        "methodId": notify.method_id,
        "methodIdHex": format!("0x{:X}", notify.method_id),
        "methodName": label.method_name,
        "payloadLength": notify.payload.len(),
        "decoded": decoded,
    });

    EventLoggerEntry {
        ts_ms,
        category: category.into(),
        action: action.into(),
        uid,
        target_uid,
        source_uid,
        source_label,
        target_label,
        name_hint,
        summary,
        stacks: None,
        duration_ms: None,
        remaining_ms: None,
        value,
        raw: serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "null".to_string()),
    }
}

#[derive(Debug, Clone, Default)]
struct DecodedChatMsgInfo {
    msg_type: Option<u64>,
    target_id: Option<i64>,
    msg_text: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct DecodedBasicShowInfo {
    char_id: Option<i64>,
    name: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct DecodedChitChatMsg {
    msg_id: Option<i64>,
    sender: DecodedBasicShowInfo,
    timestamp: Option<i64>,
    msg_info: DecodedChatMsgInfo,
}

#[derive(Debug, Clone, Default)]
struct DecodedNotifyNewestChitChatMsgsRequest {
    channel_type: Option<u64>,
    chat_msgs: Vec<DecodedChitChatMsg>,
}

#[derive(Debug, Clone, Default)]
struct DecodedSendChitChatMsgRequest {
    channel_type: Option<u64>,
    same_rate: Option<u64>,
    msg_info: DecodedChatMsgInfo,
    send_to_me: Option<bool>,
}

#[derive(Debug, Clone, Default)]
struct DecodedSendChitChatMsgReply {
    show_msg: DecodedChitChatMsg,
    cd_end_time: Option<i64>,
    err_code: Option<u64>,
}

fn decode_basic_show_info(buf: &[u8]) -> Option<DecodedBasicShowInfo> {
    let char_id = proto_first_varint(buf, 1).map(|value| value as i64);
    let name = proto_first_string(buf, 2);
    if char_id.is_none() && name.is_none() {
        return None;
    }
    Some(DecodedBasicShowInfo { char_id, name })
}

fn decode_chat_msg_info(buf: &[u8]) -> Option<DecodedChatMsgInfo> {
    let msg_type = proto_first_varint(buf, 1);
    let target_id = proto_first_varint(buf, 2).map(|value| value as i64);
    let msg_text = proto_first_string(buf, 3).and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    if msg_type.is_none() && target_id.is_none() && msg_text.is_none() {
        return None;
    }
    Some(DecodedChatMsgInfo {
        msg_type,
        target_id,
        msg_text,
    })
}

fn decode_chit_chat_msg(buf: &[u8]) -> Option<DecodedChitChatMsg> {
    let msg_id = proto_first_varint(buf, 1).map(|value| value as i64);
    let sender = proto_first_len(buf, 2)
        .and_then(decode_basic_show_info)
        .unwrap_or_default();
    let timestamp = proto_first_varint(buf, 3).map(|value| value as i64);
    let msg_info = proto_first_len(buf, 4)
        .and_then(decode_chat_msg_info)
        .unwrap_or_default();
    if msg_id.is_none()
        && sender.char_id.is_none()
        && sender.name.is_none()
        && timestamp.is_none()
        && msg_info.msg_type.is_none()
        && msg_info.target_id.is_none()
        && msg_info.msg_text.is_none()
    {
        return None;
    }
    Some(DecodedChitChatMsg {
        msg_id,
        sender,
        timestamp,
        msg_info,
    })
}

fn decode_notify_newest_chit_chat_msgs_request(
    buf: &[u8],
) -> Option<DecodedNotifyNewestChitChatMsgsRequest> {
    let channel_type = proto_first_varint(buf, 1);
    let chat_msgs = proto_all_len(buf, 2)
        .into_iter()
        .filter_map(decode_chit_chat_msg)
        .collect::<Vec<_>>();
    if chat_msgs.is_empty() {
        return None;
    }
    Some(DecodedNotifyNewestChitChatMsgsRequest {
        channel_type,
        chat_msgs,
    })
}

fn decode_notify_newest_chit_chat_msgs_payloads(
    buf: &[u8],
) -> Vec<DecodedNotifyNewestChitChatMsgsRequest> {
    let mut decoded = proto_all_len(buf, 1)
        .into_iter()
        .filter_map(decode_notify_newest_chit_chat_msgs_request)
        .collect::<Vec<_>>();
    if decoded.is_empty() {
        if let Some(request) = decode_notify_newest_chit_chat_msgs_request(buf) {
            decoded.push(request);
        }
    }
    decoded
}

fn decode_send_chit_chat_msg_request(buf: &[u8]) -> Option<DecodedSendChitChatMsgRequest> {
    let channel_type = proto_first_varint(buf, 2);
    let msg_info = proto_first_len(buf, 4).and_then(decode_chat_msg_info)?;
    Some(DecodedSendChitChatMsgRequest {
        channel_type,
        same_rate: proto_first_varint(buf, 3),
        msg_info,
        send_to_me: proto_first_varint(buf, 5).map(|value| value != 0),
    })
}

fn decode_send_chit_chat_msg_reply(buf: &[u8]) -> Option<DecodedSendChitChatMsgReply> {
    let show_msg = proto_first_len(buf, 3).and_then(decode_chit_chat_msg)?;
    Some(DecodedSendChitChatMsgReply {
        show_msg,
        cd_end_time: proto_first_varint(buf, 4).map(|value| value as i64),
        err_code: proto_first_varint(buf, 5),
    })
}

fn build_strict_chat_message_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
    channel_type: Option<u64>,
    sender_uid: Option<i64>,
    sender_name: Option<String>,
    msg_id: Option<i64>,
    timestamp: Option<i64>,
    msg_type: Option<u64>,
    target_id: Option<i64>,
    msg_text: String,
    action: &str,
    extra_decoded: serde_json::Value,
) -> Option<EventLoggerEntry> {
    let trimmed = msg_text.trim().to_string();
    if trimmed.is_empty() || looks_like_uuidish(&trimmed) {
        return None;
    }

    let channel_label = channel_type
        .map(chat_channel_label)
        .unwrap_or("unknown")
        .to_string();
    let sender_display = sender_name
        .clone()
        .or_else(|| sender_uid.map(|value| format!("UID {value}")))
        .unwrap_or_else(|| "Unknown Sender".to_string());
    let msg_type_label = msg_type
        .map(chat_message_type_label)
        .unwrap_or("text")
        .to_string();
    let summary = if action == "send" {
        format!("[{}] {} -> {}", channel_label, sender_display, trimmed)
    } else {
        format!("[{}] {}: {}", channel_label, sender_display, trimmed)
    };

    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "chat",
        action,
        msg_id.or(sender_uid),
        sender_uid,
        Some(sender_display.clone()),
        target_id,
        Some(channel_label.clone()),
        Some(sender_display),
        Some(summary),
        Some(trimmed.clone()),
        serde_json::json!({
            "channelType": channel_type,
            "channelLabel": channel_label,
            "msgId": msg_id,
            "timestamp": timestamp,
            "senderUid": sender_uid,
            "senderName": sender_name,
            "msgType": msg_type,
            "msgTypeLabel": msg_type_label,
            "targetId": target_id,
            "msgText": trimmed,
            "extra": extra_decoded,
        }),
    ))
}

fn decode_strict_chat_entries(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Vec<EventLoggerEntry> {
    let mut entries = Vec::new();
    let mut seen = HashSet::new();

    for decoded in decode_notify_newest_chit_chat_msgs_payloads(notify.payload.as_ref()) {
        for chat_msg in decoded.chat_msgs {
            let msg_text = match chat_msg.msg_info.msg_text.clone() {
                Some(value) => value,
                None => continue,
            };
            let dedupe_key = format!(
                "notify|{}|{}|{}|{}|{}",
                decoded.channel_type.unwrap_or_default(),
                chat_msg.msg_id.unwrap_or_default(),
                chat_msg.sender.char_id.unwrap_or_default(),
                chat_msg.timestamp.unwrap_or_default(),
                msg_text
            );
            if !seen.insert(dedupe_key) {
                continue;
            }
            if let Some(entry) = build_strict_chat_message_entry(
                ts_ms,
                notify,
                decoded.channel_type,
                chat_msg.sender.char_id,
                chat_msg.sender.name.clone(),
                chat_msg.msg_id,
                chat_msg.timestamp,
                chat_msg.msg_info.msg_type,
                chat_msg.msg_info.target_id,
                msg_text,
                "message",
                serde_json::json!({
                    "decodePath": "notify_newest_chit_chat_msgs",
                }),
            ) {
                entries.push(entry);
            }
        }
    }

    if !entries.is_empty() {
        return entries;
    }

    if let Some(decoded) = decode_send_chit_chat_msg_request(notify.payload.as_ref()) {
        if let Some(msg_text) = decoded.msg_info.msg_text.clone() {
            if let Some(entry) = build_strict_chat_message_entry(
                ts_ms,
                notify,
                decoded.channel_type,
                None,
                None,
                None,
                None,
                decoded.msg_info.msg_type,
                decoded.msg_info.target_id,
                msg_text,
                "send",
                serde_json::json!({
                    "decodePath": "send_chit_chat_msg_request",
                    "sameRate": decoded.same_rate,
                    "sendToMe": decoded.send_to_me,
                }),
            ) {
                entries.push(entry);
            }
        }
    }

    if entries.is_empty() {
        if let Some(decoded) = decode_send_chit_chat_msg_reply(notify.payload.as_ref()) {
            if let Some(msg_text) = decoded.show_msg.msg_info.msg_text.clone() {
                if let Some(entry) = build_strict_chat_message_entry(
                    ts_ms,
                    notify,
                    None,
                    decoded.show_msg.sender.char_id,
                    decoded.show_msg.sender.name.clone(),
                    decoded.show_msg.msg_id,
                    decoded.show_msg.timestamp,
                    decoded.show_msg.msg_info.msg_type,
                    decoded.show_msg.msg_info.target_id,
                    msg_text,
                    "send_result",
                    serde_json::json!({
                        "decodePath": "send_chit_chat_msg_reply",
                        "cdEndTime": decoded.cd_end_time,
                        "errCode": decoded.err_code,
                    }),
                ) {
                    entries.push(entry);
                }
            }
        }
    }

    entries
}

fn build_ready_check_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let open = proto_first_varint(notify.payload.as_ref(), 1)? != 0;
    let state = if open { "opened" } else { "closed" };
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "ready_check",
        None,
        None,
        None,
        None,
        Some("Ready Check".to_string()),
        Some("Ready Check".to_string()),
        Some(format!("Ready check {state}")),
        Some(state.to_string()),
        serde_json::json!({
            "openOrClose": open,
        }),
    ))
}

fn build_ready_response_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let payload = notify.payload.as_ref();
    let member_name = proto_first_string(payload, 1);
    let char_id = proto_first_varint(payload, 2).map(|value| value as i64);
    let ready_info = proto_first_len(payload, 3);
    let is_ready = ready_info
        .and_then(|value| proto_first_varint(value, 1))
        .unwrap_or_default()
        != 0;
    let buff_count = ready_info
        .map(|value| proto_all_len(value, 2).len())
        .unwrap_or_default();
    let medicament_count = ready_info
        .map(|value| proto_all_len(value, 3).len())
        .unwrap_or_default();
    let item_count = ready_info
        .map(|value| proto_all_len(value, 4).len())
        .unwrap_or_default();
    let display_name = member_name
        .clone()
        .or_else(|| char_id.map(|value| format!("UID {value}")))
        .unwrap_or_else(|| "Unknown Member".to_string());
    let summary = format!(
        "{} responded {} buffs={} medicaments={} items={}",
        display_name,
        if is_ready { "ready" } else { "not ready" },
        buff_count,
        medicament_count,
        item_count
    );

    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "ready_response",
        char_id,
        char_id,
        Some(display_name.clone()),
        None,
        Some("Ready Check".to_string()),
        Some(display_name),
        Some(summary),
        Some(if is_ready { "ready" } else { "not_ready" }.to_string()),
        serde_json::json!({
            "memberName": member_name,
            "charId": char_id,
            "ready": is_ready,
            "buffCount": buff_count,
            "medicamentCount": medicament_count,
            "itemCount": item_count,
        }),
    ))
}

fn build_match_enter_result_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let err_code = proto_first_varint(request, 1).unwrap_or_default();
    let is_re_enter = proto_first_varint(request, 3).unwrap_or_default() != 0;
    let match_info = proto_first_len(request, 2);
    let match_status = match_info.and_then(|value| proto_first_varint(value, 2));
    let match_time = match_info.and_then(|value| proto_first_varint(value, 3));
    let players = match_info
        .map(|value| parse_match_player_map_entries(value, 5))
        .unwrap_or_default();
    let match_token = match_info.and_then(|value| proto_first_string(value, 6));
    let ready_time = match_info.and_then(|value| proto_first_varint(value, 7));
    let match_key_info = match_info.and_then(|value| proto_first_len(value, 8));
    let match_id = match_key_info.and_then(|value| proto_first_varint(value, 1));
    let match_type = match_key_info.and_then(|value| proto_first_varint(value, 2));
    let match_type_uuid = match_key_info.and_then(|value| proto_first_varint(value, 3));
    let (wait_count, ready_count, unready_count) = count_match_ready_states(&players);
    let status_label = match_status
        .map(match_status_label)
        .unwrap_or("unknown")
        .to_string();
    let summary = format!(
        "err={} status={} players={} ready={} wait={} unready={} matchId={} reEnter={}",
        error_code_label(err_code),
        status_label,
        players.len(),
        ready_count,
        wait_count,
        unready_count,
        match_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "?".to_string()),
        is_re_enter
    );
    let player_json = players
        .iter()
        .map(|player| {
            serde_json::json!({
                "charId": player.char_id,
                "readyStatus": player.ready_status,
                "readyStatusLabel": player.ready_status.map(match_ready_status_label),
                "name": player.name,
                "isBot": player.is_bot,
            })
        })
        .collect::<Vec<_>>();

    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "matchmaking",
        "enter_result",
        match_id.map(|value| value as i64),
        None,
        None,
        None,
        Some("Matchmaking".to_string()),
        Some(
            match_id
                .map(|value| format!("Match {}", value))
                .unwrap_or_else(|| "Matchmaking".to_string()),
        ),
        Some(summary),
        Some(status_label.clone()),
        serde_json::json!({
            "errCode": err_code,
            "errCodeLabel": error_code_label(err_code),
            "isReEnter": is_re_enter,
            "matchStatus": match_status,
            "matchStatusLabel": status_label,
            "matchTime": match_time,
            "matchReadyTime": ready_time,
            "matchId": match_id,
            "matchType": match_type,
            "matchTypeUuid": match_type_uuid,
            "matchToken": match_token,
            "players": player_json,
        }),
    ))
}

fn build_match_ready_status_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let err_code = proto_first_varint(request, 1).unwrap_or_default();
    let leader_char_id = proto_first_varint(request, 2).map(|value| value as i64);
    let match_token = proto_first_string(request, 3);
    let match_key_info = proto_first_len(request, 4);
    let match_id = match_key_info.and_then(|value| proto_first_varint(value, 1));
    let match_type = match_key_info.and_then(|value| proto_first_varint(value, 2));
    let match_type_uuid = match_key_info.and_then(|value| proto_first_varint(value, 3));
    let players = proto_all_len(request, 5)
        .into_iter()
        .map(parse_match_player_info)
        .collect::<Vec<_>>();
    let (wait_count, ready_count, unready_count) = count_match_ready_states(&players);
    let summary = format!(
        "err={} players={} ready={} wait={} unready={} leader={} matchId={}",
        error_code_label(err_code),
        players.len(),
        ready_count,
        wait_count,
        unready_count,
        leader_char_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "?".to_string()),
        match_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "?".to_string())
    );
    let player_json = players
        .iter()
        .map(|player| {
            serde_json::json!({
                "charId": player.char_id,
                "readyStatus": player.ready_status,
                "readyStatusLabel": player.ready_status.map(match_ready_status_label),
                "name": player.name,
                "isBot": player.is_bot,
            })
        })
        .collect::<Vec<_>>();

    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "matchmaking",
        "ready_status",
        match_id.map(|value| value as i64),
        leader_char_id,
        leader_char_id.map(|value| format!("Leader {value}")),
        None,
        Some("Match Ready".to_string()),
        Some("Match Ready".to_string()),
        Some(summary),
        Some(format!(
            "ready={ready_count} wait={wait_count} unready={unready_count}"
        )),
        serde_json::json!({
            "errCode": err_code,
            "errCodeLabel": error_code_label(err_code),
            "leaderCharId": leader_char_id,
            "matchToken": match_token,
            "matchId": match_id,
            "matchType": match_type,
            "matchTypeUuid": match_type_uuid,
            "players": player_json,
        }),
    ))
}

fn parse_team_base_info_summary(
    buf: &[u8],
) -> (Option<i64>, Option<i64>, serde_json::Value, Vec<String>) {
    let team_id = proto_first_varint(buf, 1).map(|value| value as i64);
    let target_id = proto_first_varint(buf, 2).map(|value| value as i64);
    let leader_id = proto_first_varint(buf, 3).map(|value| value as i64);
    let desc = proto_first_string(buf, 4);
    let auto_match = proto_first_varint(buf, 5).unwrap_or_default() != 0;
    let hall_show = proto_first_varint(buf, 6).unwrap_or_default() != 0;
    let matching = proto_first_varint(buf, 7).unwrap_or_default() != 0;
    let team_member_type = proto_first_varint(buf, 8);
    let create_time = proto_first_varint(buf, 10);
    let mut summary_parts = Vec::new();
    if let Some(team_id) = team_id {
        summary_parts.push(format!("teamId={team_id}"));
    }
    if let Some(target_id) = target_id {
        summary_parts.push(format!("targetId={target_id}"));
    }
    if let Some(leader_id) = leader_id {
        summary_parts.push(format!("leaderId={leader_id}"));
    }
    if matching {
        summary_parts.push("matching=true".to_string());
    }
    if auto_match {
        summary_parts.push("autoMatch=true".to_string());
    }
    if let Some(desc) = desc.clone().filter(|value| !value.is_empty()) {
        summary_parts.push(format!("desc={desc}"));
    }
    (
        team_id,
        leader_id,
        serde_json::json!({
            "teamId": team_id,
            "targetId": target_id,
            "leaderId": leader_id,
            "desc": desc,
            "autoMatch": auto_match,
            "hallShow": hall_show,
            "matching": matching,
            "teamMemberType": team_member_type,
            "createTime": create_time,
        }),
        summary_parts,
    )
}

fn build_team_info_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
    action: &str,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let base_info = proto_first_len(request, 1)?;
    let (team_id, leader_id, base_json, mut summary_parts) =
        parse_team_base_info_summary(base_info);
    let member_count = proto_all_len(request, 2).len();
    if member_count > 0 {
        summary_parts.push(format!("members={member_count}"));
    }
    let summary = summary_parts.join(" ");
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        action,
        team_id,
        leader_id,
        leader_id.map(|value| format!("Leader {value}")),
        None,
        Some("Party".to_string()),
        Some(
            team_id
                .map(|value| format!("Team {value}"))
                .unwrap_or_else(|| "Party".to_string()),
        ),
        Some(summary),
        team_id.map(|value| value.to_string()),
        serde_json::json!({
            "baseInfo": base_json,
            "memberCount": member_count,
        }),
    ))
}

fn build_team_activity_state_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let state = proto_first_len(request, 1)?;
    let activity_id = proto_first_varint(state, 1);
    let activity_state = proto_first_varint(state, 2).unwrap_or_default();
    let time = proto_first_varint(state, 3);
    let agree_mem = proto_all_varint(state, 5);
    let check_members = proto_all_varint(state, 6);
    let refuse_id = proto_first_varint(state, 7).map(|value| value as i64);
    let state_label = team_activity_state_label(activity_state).to_string();
    let summary = format!(
        "activityId={} state={} agree={} check={} refuseId={}",
        activity_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "?".to_string()),
        state_label,
        agree_mem.len(),
        check_members.len(),
        refuse_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "0".to_string())
    );
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "team_activity_state",
        activity_id.map(|value| value as i64),
        refuse_id,
        refuse_id.map(|value| format!("UID {value}")),
        None,
        Some("Team Activity".to_string()),
        Some("Team Activity".to_string()),
        Some(summary),
        Some(state_label.clone()),
        serde_json::json!({
            "activityId": activity_id,
            "state": activity_state,
            "stateLabel": state_label,
            "time": time,
            "agreeMembers": agree_mem,
            "checkMembers": check_members,
            "refuseId": refuse_id,
        }),
    ))
}

fn build_team_activity_result_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let char_id = proto_first_varint(request, 1).map(|value| value as i64);
    let err_code = proto_first_varint(request, 2).unwrap_or_default();
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "team_activity_result",
        char_id,
        char_id,
        char_id.map(|value| format!("UID {value}")),
        None,
        Some("Team Activity".to_string()),
        Some("Team Activity Result".to_string()),
        Some(format!(
            "charId={} err={}",
            char_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string()),
            error_code_label(err_code)
        )),
        Some(error_code_label(err_code)),
        serde_json::json!({
            "charId": char_id,
            "errCode": err_code,
            "errCodeLabel": error_code_label(err_code),
        }),
    ))
}

fn build_team_activity_vote_result_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let code = proto_first_varint(request, 1).unwrap_or_default();
    let char_id = proto_first_varint(request, 2).map(|value| value as i64);
    let code_label = team_vote_result_label(code).to_string();
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "team_activity_vote_result",
        char_id,
        char_id,
        char_id.map(|value| format!("UID {value}")),
        None,
        Some("Team Activity Vote".to_string()),
        Some("Team Activity Vote".to_string()),
        Some(format!(
            "charId={} vote={}",
            char_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string()),
            code_label
        )),
        Some(code_label.clone()),
        serde_json::json!({
            "charId": char_id,
            "voteCode": code,
            "voteCodeLabel": code_label,
        }),
    ))
}

fn build_team_member_call_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let leader_id = proto_first_varint(request, 1).map(|value| value as i64);
    let call_time = proto_first_varint(request, 2);
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "team_member_call",
        leader_id,
        leader_id,
        leader_id.map(|value| format!("UID {value}")),
        None,
        Some("Team Call".to_string()),
        Some("Team Call".to_string()),
        Some(format!(
            "leaderId={} time={}",
            leader_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string()),
            call_time
                .map(|value| value.to_string())
                .unwrap_or_else(|| "0".to_string())
        )),
        Some("call".to_string()),
        serde_json::json!({
            "leaderId": leader_id,
            "time": call_time,
        }),
    ))
}

fn build_team_member_call_result_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let member_id = proto_first_varint(request, 1).map(|value| value as i64);
    let tips_id = proto_first_varint(request, 2);
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "team_member_call_result",
        member_id,
        member_id,
        member_id.map(|value| format!("UID {value}")),
        None,
        Some("Team Call Result".to_string()),
        Some("Team Call Result".to_string()),
        Some(format!(
            "memberId={} tipsId={}",
            member_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string()),
            tips_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "0".to_string())
        )),
        tips_id.map(|value| value.to_string()),
        serde_json::json!({
            "memberId": member_id,
            "tipsId": tips_id,
        }),
    ))
}

fn build_dungeon_invite_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    let request = proto_first_len(notify.payload.as_ref(), 1)?;
    let group_key = proto_first_string(request, 1);
    let dungeon_id = proto_first_varint(request, 2).map(|value| value as i64);
    let sender_id = proto_first_varint(request, 3).map(|value| value as i64);
    Some(build_promoted_service_entry(
        ts_ms,
        notify,
        "party",
        "dungeon_invite",
        dungeon_id,
        sender_id,
        sender_id.map(|value| format!("UID {value}")),
        dungeon_id,
        Some("Dungeon Invite".to_string()),
        Some("Dungeon Invite".to_string()),
        Some(format!(
            "senderId={} dungeonId={} groupKey={}",
            sender_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string()),
            dungeon_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string()),
            group_key.clone().unwrap_or_default()
        )),
        dungeon_id.map(|value| value.to_string()),
        serde_json::json!({
            "groupKey": group_key,
            "dungeonId": dungeon_id,
            "senderId": sender_id,
        }),
    ))
}

fn decode_promoted_service_entries(
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Vec<EventLoggerEntry> {
    let ts_ms = now_ms();

    if let Some(entry) = build_choose_core_season_hole_node_probe_logger_entry(ts_ms, notify) {
        return vec![entry];
    }

    if matches!(notify.fragment_type, packets::opcodes::FragmentType::Notify)
        && notify.service_id == crate::packets::parser::WORLD_NTF_SERVICE_ID
        && notify.method_id == 0x16
    {
        remember_recent_item_detail_candidate(ts_ms, notify.payload.as_ref());
    }

    if matches!(notify.fragment_type, packets::opcodes::FragmentType::Notify)
        && notify.service_id == crate::packets::parser::CHIT_CHAT_NTF_SERVICE_ID
        && notify.method_id == 0x1
    {
        let strict_entries = decode_strict_chat_entries(ts_ms, notify);
        if !strict_entries.is_empty() {
            return strict_entries;
        }

        let conversation_entries =
            chat_feed::build_conversation_logger_entries(ts_ms, notify.payload.as_ref());
        if !conversation_entries.is_empty() {
            return conversation_entries;
        }
    }

    let strict_entries = decode_strict_chat_entries(ts_ms, notify);
    if !strict_entries.is_empty() {
        return strict_entries;
    }

    match (notify.fragment_type, notify.service_id, notify.method_id) {
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::WORLD_NTF_SERVICE_ID,
            0x39,
        ) => build_item_candidate_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::WORLD_NTF_SERVICE_ID,
            0x46,
        ) => build_ready_check_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::WORLD_NTF_SERVICE_ID,
            0x47,
        ) => build_ready_response_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::MATCH_NTF_SERVICE_ID,
            0x4,
        ) => build_match_enter_result_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::MATCH_NTF_SERVICE_ID,
            0x6,
        ) => build_match_ready_status_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x01,
        ) => build_team_info_logger_entry(ts_ms, notify, "team_info")
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x03,
        ) => build_team_info_logger_entry(ts_ms, notify, "join_team")
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x0E,
        ) => build_team_activity_state_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x0F,
        ) => build_team_activity_result_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x11,
        ) => build_team_activity_vote_result_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x16,
        ) => build_team_member_call_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x17,
        ) => build_team_member_call_result_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        (
            packets::opcodes::FragmentType::Notify,
            crate::packets::parser::GRPC_TEAM_NTF_SERVICE_ID,
            0x1E,
        ) => build_dungeon_invite_logger_entry(ts_ms, notify)
            .into_iter()
            .collect(),
        _ => Vec::new(),
    }
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct ChooseCoreSeasonHoleNodeProbe {
    #[prost(message, repeated, tag = "1")]
    pub chosen_node_ids: Vec<blueprotobuf::MedalNode>,
}

fn container_probe_canonical_season_medal_node_id(node_id: u32) -> u32 {
    if (100_000..=199_999).contains(&node_id) {
        node_id - 100_000
    } else {
        node_id
    }
}

fn container_probe_medal_node_json(
    node: &blueprotobuf::MedalNode,
    map_key: Option<u32>,
    runtime_source: &'static str,
) -> serde_json::Value {
    serde_json::json!({
        "mapKey": map_key,
        "nodeId": node.node_id,
        "canonicalNodeId": node.node_id.map(container_probe_canonical_season_medal_node_id),
        "nodeLevel": node.node_level,
        "choose": node.choose,
        "slot": node.slot,
        "runtimeSource": runtime_source,
    })
}

fn looks_like_choose_core_season_hole_node_probe(probe: &ChooseCoreSeasonHoleNodeProbe) -> bool {
    if probe.chosen_node_ids.is_empty() || probe.chosen_node_ids.len() > 16 {
        return false;
    }

    probe.chosen_node_ids.iter().all(|node| {
        let Some(node_id) = node.node_id else {
            return false;
        };
        if node_id == 0 || node_id > 1_000_000 {
            return false;
        }
        if node.node_level.is_some_and(|level| level > 1_000) {
            return false;
        }
        if node.slot.is_some_and(|slot| !(-1..=32).contains(&slot)) {
            return false;
        }
        true
    })
}

fn build_choose_core_season_hole_node_probe_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Option<EventLoggerEntry> {
    if !container_probes_enabled() {
        return None;
    }
    if !matches!(notify.fragment_type, packets::opcodes::FragmentType::Call) {
        return None;
    }
    if notify.service_id != crate::packets::parser::WORLD_NTF_SERVICE_ID {
        return None;
    }

    let decoded = ChooseCoreSeasonHoleNodeProbe::decode(notify.payload.clone()).ok()?;
    if !looks_like_choose_core_season_hole_node_probe(&decoded) {
        return None;
    }

    let dispatch_label =
        crate::packets::dispatch::label(notify.fragment_type, notify.service_id, notify.method_id);
    let chosen_node_ids = decoded
        .chosen_node_ids
        .iter()
        .map(|node| {
            container_probe_medal_node_json(
                node,
                None,
                "World.ChooseCoreSeasonHoleNode.chosenNodeIds",
            )
        })
        .collect::<Vec<_>>();
    let payload_hex_limit = raw_service_probe_payload_hex_limit();
    let payload_slice = if notify.payload.len() > payload_hex_limit {
        &notify.payload[..payload_hex_limit]
    } else {
        notify.payload.as_ref()
    };
    let is_truncated = notify.payload.len() > payload_hex_limit;
    let method_label = dispatch_label
        .method_name
        .map(|name| format!("{} (0x{:X})", name, notify.method_id))
        .unwrap_or_else(|| format!("0x{:X}", notify.method_id));
    let summary = format!(
        "method=ChooseCoreSeasonHoleNode? rawMethod={} chosenNodes={} payload={}B",
        method_label,
        chosen_node_ids.len(),
        notify.payload.len()
    );

    let raw = serde_json::json!({
        "probe": "World.ChooseCoreSeasonHoleNode",
        "decodeBasis": "field 1 repeated zproto.MedalNode",
        "fragmentType": dispatch_label.fragment_label,
        "serviceId": notify.service_id,
        "serviceIdHex": format!("0x{:016X}", notify.service_id),
        "serviceName": dispatch_label.service_name,
        "methodId": notify.method_id,
        "methodIdHex": format!("0x{:X}", notify.method_id),
        "methodName": dispatch_label.method_name,
        "payloadLength": notify.payload.len(),
        "payloadHex": hex::encode(payload_slice),
        "payloadHexTruncated": is_truncated,
        "chooseCoreSeasonHoleNode": {
            "chosenNodeIds": chosen_node_ids,
        },
    });

    Some(EventLoggerEntry {
        ts_ms,
        category: "container_probe".to_string(),
        action: "choose_core_season_hole_node".to_string(),
        uid: None,
        target_uid: None,
        source_uid: None,
        source_label: Some(dispatch_label.service_name.to_string()),
        target_label: Some(method_label),
        name_hint: Some("ChooseCoreSeasonHoleNode".to_string()),
        summary: Some(summary),
        stacks: i32::try_from(decoded.chosen_node_ids.len()).ok(),
        duration_ms: None,
        remaining_ms: None,
        value: Some(format!("0x{:X}", notify.method_id)),
        raw: serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "null".to_string()),
    })
}

fn should_emit_raw_service_probe(notify: &crate::packets::parser::ParsedNotifyFragment) -> bool {
    if !raw_service_probes_enabled() {
        return false;
    }

    if crate::packets::dispatch::should_emit_shadow_probe(
        notify.fragment_type,
        notify.service_id,
        notify.recognized_pkt.is_some(),
    ) {
        return true;
    }

    if notify.recognized_pkt.is_some() {
        return false;
    }

    !scan_container_factor_candidates(&notify.payload).is_empty()
}

fn raw_service_probes_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();

    *ENABLED.get_or_init(|| debug_env_flag_enabled("RESONANCE_ENABLE_RAW_SERVICE_PROBES"))
}

fn raw_service_probe_all_limit() -> usize {
    static LIMIT: OnceLock<usize> = OnceLock::new();

    *LIMIT.get_or_init(|| debug_env_usize("RESONANCE_RAW_SERVICE_PROBE_ALL_LIMIT", 0))
}

fn raw_service_probe_all_max_payload() -> usize {
    static MAX_PAYLOAD: OnceLock<usize> = OnceLock::new();

    *MAX_PAYLOAD
        .get_or_init(|| debug_env_usize("RESONANCE_RAW_SERVICE_PROBE_ALL_MAX_PAYLOAD", 262_144))
}

fn raw_service_probe_payload_hex_limit() -> usize {
    static LIMIT: OnceLock<usize> = OnceLock::new();

    *LIMIT.get_or_init(|| debug_env_usize("RESONANCE_RAW_SERVICE_PROBE_HEX_LIMIT", 4096))
}

fn raw_service_probe_near_delta_limit() -> usize {
    static LIMIT: OnceLock<usize> = OnceLock::new();

    *LIMIT.get_or_init(|| debug_env_usize("RESONANCE_RAW_SERVICE_PROBE_NEAR_DELTA_LIMIT", 150))
}

fn is_sync_near_delta_probe(notify: &crate::packets::parser::ParsedNotifyFragment) -> bool {
    matches!(
        notify.recognized_pkt.as_ref(),
        Some(packets::opcodes::Pkt::SyncNearDeltaInfo)
    )
}

fn should_emit_raw_service_probe_sample(
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> bool {
    if !raw_service_probes_enabled() {
        return false;
    }

    let limit = raw_service_probe_all_limit();
    if limit == 0 {
        return false;
    }

    let max_payload = raw_service_probe_all_max_payload();
    if max_payload > 0 && notify.payload.len() > max_payload {
        return false;
    }

    if is_sync_near_delta_probe(notify) {
        let near_delta_limit = raw_service_probe_near_delta_limit();
        if near_delta_limit > 0
            && RAW_SERVICE_PROBE_NEAR_DELTA_COUNT.fetch_add(1, Ordering::Relaxed)
                >= near_delta_limit
        {
            return false;
        }
    }

    RAW_SERVICE_PROBE_ALL_COUNT.fetch_add(1, Ordering::Relaxed) < limit
}

fn build_raw_service_probe_logger_entry(
    ts_ms: i64,
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> EventLoggerEntry {
    let dispatch_label =
        crate::packets::dispatch::label(notify.fragment_type, notify.service_id, notify.method_id);
    let service_name = dispatch_label.service_name;
    let method_name = dispatch_label.method_name;
    let payload_hex_limit = raw_service_probe_payload_hex_limit();
    let payload_slice = if notify.payload.len() > payload_hex_limit {
        &notify.payload[..payload_hex_limit]
    } else {
        notify.payload.as_ref()
    };
    let payload_hex = hex::encode(payload_slice);
    let payload_utf8 = String::from_utf8_lossy(payload_slice).to_string();
    let is_truncated = notify.payload.len() > payload_hex_limit;
    let method_label = method_name
        .map(|name| format!("{} (0x{:X})", name, notify.method_id))
        .unwrap_or_else(|| format!("0x{:X}", notify.method_id));
    let detected_names = extract_candidate_names_from_payload(payload_slice);
    let string_buckets = classify_probe_strings(&detected_names);
    let seasonal_candidates = scan_container_factor_candidates(&notify.payload);
    let seasonal_raw_proto_candidates = scan_container_raw_proto_candidates(&notify.payload);

    let category = dispatch_label.category;
    let action = dispatch_label.action;
    let fragment_label = dispatch_label.fragment_label;

    let mut summary_parts = vec![
        format!("fragment={fragment_label}"),
        format!("service={service_name}"),
        format!("method={method_label}"),
        format!("payload={}B", notify.payload.len()),
    ];
    if is_truncated {
        summary_parts.push(format!("preview={}B", payload_hex_limit));
    }
    if !string_buckets.loadouts.is_empty() {
        summary_parts.push(format!("loadouts={}", string_buckets.loadouts.join(",")));
    }
    if !string_buckets.playerish.is_empty() {
        summary_parts.push(format!("names={}", string_buckets.playerish.join(",")));
    }
    if !string_buckets.service_ids.is_empty() {
        summary_parts.push(format!("services={}", string_buckets.service_ids.join(",")));
    }
    if !seasonal_candidates.is_empty() {
        summary_parts.push(format!("seasonalCandidates={}", seasonal_candidates.len()));
    }
    if !seasonal_raw_proto_candidates.is_empty() {
        summary_parts.push(format!(
            "seasonalProtoCandidates={}",
            seasonal_raw_proto_candidates.len()
        ));
    }

    let seasonal_candidates_json = seasonal_candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "offset": row.offset,
                "encoding": row.encoding,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();
    let seasonal_raw_proto_candidates_json = seasonal_raw_proto_candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "path": row.path,
                "offset": row.offset,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();

    let raw = serde_json::json!({
        "fragmentType": fragment_label,
        "serviceId": notify.service_id,
        "serviceIdHex": format!("0x{:016X}", notify.service_id),
        "serviceName": service_name,
        "methodId": notify.method_id,
        "methodIdHex": format!("0x{:X}", notify.method_id),
        "methodName": method_name,
        "payloadLength": notify.payload.len(),
        "payloadHex": payload_hex,
        "payloadHexTruncated": is_truncated,
        "payloadUtf8Preview": payload_utf8,
        "detectedNames": detected_names,
        "detectedLoadouts": string_buckets.loadouts.clone(),
        "detectedPlayerish": string_buckets.playerish.clone(),
        "detectedServiceIds": string_buckets.service_ids.clone(),
        "seasonalCandidateCount": seasonal_candidates.len(),
        "seasonalCandidatesTruncated": seasonal_candidates.len() > seasonal_candidates_json.len(),
        "seasonalCandidates": seasonal_candidates_json,
        "seasonalRawProtoCandidateCount": seasonal_raw_proto_candidates.len(),
        "seasonalRawProtoCandidatesTruncated": seasonal_raw_proto_candidates.len() > seasonal_raw_proto_candidates_json.len(),
        "seasonalRawProtoCandidates": seasonal_raw_proto_candidates_json,
        "shadowDispatch": {
            "serviceName": dispatch_label.service_name,
            "methodName": dispatch_label.method_name,
            "category": dispatch_label.category,
            "action": dispatch_label.action,
            "fragmentLabel": dispatch_label.fragment_label
        },
    });

    let probe_name_hint = choose_probe_name_hint(method_name, &string_buckets);

    EventLoggerEntry {
        ts_ms,
        category: category.into(),
        action: action.into(),
        uid: None,
        target_uid: None,
        source_uid: None,
        source_label: Some(service_name.to_string()),
        target_label: method_name.map(|value| value.to_string()),
        name_hint: Some(probe_name_hint),
        summary: Some(summary_parts.join(" ")),
        stacks: None,
        duration_ms: None,
        remaining_ms: None,
        value: Some(format!("0x{:X}", notify.method_id)),
        raw: serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "null".to_string()),
    }
}

#[derive(Clone, Debug)]
struct ContainerCandidateId {
    offset: usize,
    encoding: &'static str,
    kind: &'static str,
    value: u32,
}

#[derive(Clone, Debug)]
struct ContainerRawProtoCandidateId {
    path: String,
    offset: usize,
    kind: &'static str,
    value: u32,
}

#[derive(Clone, Debug)]
struct ContainerJsonCandidateId {
    path: String,
    location: &'static str,
    kind: &'static str,
    value: u32,
}

fn classify_container_candidate_id(value: u32) -> Option<&'static str> {
    match value {
        100_000..=199_999 => Some("season-medal-core-node-id"),
        200_000..=209_999 => Some("seasonal-factor-family-id"),
        3_050_000..=3_059_999 => Some("seasonal-factor-buff-id"),
        20_010_000..=20_019_999 => Some("seasonal-factor-grade-item-id"),
        1_000..=9_999
            if crate::live::effect_sources::is_effect_source_id(&format!(
                "season-talent-node:{value}"
            )) =>
        {
            Some("seasonal-talent-node-id")
        }
        _ if crate::live::season_phantom_factors::is_factor_affected_damage_id(value) => {
            Some("seasonal-factor-affected-damage-id")
        }
        _ => None,
    }
}

fn push_container_candidate_id(
    rows: &mut Vec<ContainerCandidateId>,
    seen: &mut HashSet<(usize, &'static str, u32)>,
    offset: usize,
    encoding: &'static str,
    value: u32,
) {
    let Some(kind) = classify_container_candidate_id(value) else {
        return;
    };
    if !seen.insert((offset, encoding, value)) {
        return;
    }
    rows.push(ContainerCandidateId {
        offset,
        encoding,
        kind,
        value,
    });
}

fn scan_container_factor_candidates(buffer: &[u8]) -> Vec<ContainerCandidateId> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();

    for offset in 0..buffer.len() {
        if offset + 4 <= buffer.len() {
            let value = u32::from_le_bytes([
                buffer[offset],
                buffer[offset + 1],
                buffer[offset + 2],
                buffer[offset + 3],
            ]);
            push_container_candidate_id(&mut rows, &mut seen, offset, "u32-le", value);
        }

        let mut value = 0u32;
        let mut shift = 0u32;
        for width in 0..5 {
            let Some(byte) = buffer.get(offset + width).copied() else {
                break;
            };
            value |= u32::from(byte & 0x7F) << shift;
            if byte & 0x80 == 0 {
                push_container_candidate_id(&mut rows, &mut seen, offset, "varint", value);
                break;
            }
            shift += 7;
        }
    }

    rows.sort_by_key(|row| (row.value, row.offset, row.encoding));
    rows
}

fn push_container_json_candidate_id(
    rows: &mut Vec<ContainerJsonCandidateId>,
    seen: &mut HashSet<(String, &'static str, &'static str, u32)>,
    path: &str,
    location: &'static str,
    value: u64,
) {
    const JSON_CANDIDATE_LIMIT: usize = 512;
    if rows.len() >= JSON_CANDIDATE_LIMIT {
        return;
    }
    let Ok(value) = u32::try_from(value) else {
        return;
    };
    let Some(kind) = classify_container_candidate_id(value) else {
        return;
    };
    let key = (path.to_string(), location, kind, value);
    if !seen.insert(key) {
        return;
    }
    rows.push(ContainerJsonCandidateId {
        path: path.to_string(),
        location,
        kind,
        value,
    });
}

fn scan_container_json_value(
    value: &serde_json::Value,
    path: &str,
    rows: &mut Vec<ContainerJsonCandidateId>,
    seen: &mut HashSet<(String, &'static str, &'static str, u32)>,
) {
    match value {
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                let child_path = format!("{path}.{}", key.replace('.', "\\."));
                if let Ok(parsed) = key.parse::<u64>() {
                    push_container_json_candidate_id(rows, seen, &child_path, "object-key", parsed);
                }
                scan_container_json_value(child, &child_path, rows, seen);
            }
        }
        serde_json::Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                let child_path = format!("{path}[{index}]");
                scan_container_json_value(child, &child_path, rows, seen);
            }
        }
        serde_json::Value::Number(number) => {
            if let Some(parsed) = number.as_u64() {
                push_container_json_candidate_id(rows, seen, path, "number", parsed);
            }
        }
        serde_json::Value::String(text) => {
            if let Ok(parsed) = text.parse::<u64>() {
                push_container_json_candidate_id(rows, seen, path, "string", parsed);
            }
        }
        _ => {}
    }
}

fn scan_container_json_candidates(value: &serde_json::Value) -> Vec<ContainerJsonCandidateId> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    scan_container_json_value(value, "$", &mut rows, &mut seen);
    rows.sort_by(|left, right| {
        left.value
            .cmp(&right.value)
            .then_with(|| left.path.cmp(&right.path))
            .then_with(|| left.location.cmp(right.location))
    });
    rows
}

fn collect_container_probe_equipped_factor_items(
    v_data: &blueprotobuf::CharSerialize,
) -> Vec<serde_json::Value> {
    let Some(item_package) = v_data.item_package.as_ref() else {
        return Vec::new();
    };
    let Some(equip) = v_data.equip.as_ref() else {
        return Vec::new();
    };

    let mut items = Vec::new();
    for (equip_slot, info) in &equip.equip_list {
        let Some(equipped_uuid) = info.item_uuid else {
            continue;
        };
        for (package_key, package) in &item_package.packages {
            for item in package.items.values() {
                let Some(item_uuid) = item.uuid.and_then(|uuid| u64::try_from(uuid).ok()) else {
                    continue;
                };
                if item_uuid != equipped_uuid {
                    continue;
                }
                let Some(config_id) = item.config_id else {
                    continue;
                };
                let Some(factor_grade) =
                    crate::live::season_phantom_factors::factor_grade_item_for_config_id(config_id)
                else {
                    continue;
                };
                items.push(serde_json::json!({
                    "equipSlot": equip_slot,
                    "factorBuffId": factor_grade.factor_buff_id,
                    "familyId": factor_grade.family_id,
                    "itemConfigId": factor_grade.item_config_id,
                    "itemUuid": item.uuid,
                    "packageKey": package_key,
                    "packageType": package.r#type,
                    "grade": factor_grade.grade,
                    "runtimeSource": "SyncContainerData.v_data.equip.equip_list.item_uuid->item_package.config_id",
                }));
            }
        }
    }
    items.sort_by_key(|item| {
        (
            item.get("factorBuffId")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or_default(),
            item.get("grade")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or_default(),
            item.get("itemConfigId")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or_default(),
        )
    });
    items
}

fn collect_container_probe_season_medal_nodes(
    v_data: &blueprotobuf::CharSerialize,
) -> Option<serde_json::Value> {
    let info = v_data.season_medal_info.as_ref()?;
    let mut normal_hole_infos = info
        .normal_hole_infos
        .iter()
        .map(|(map_key, hole)| {
            serde_json::json!({
                "mapKey": map_key,
                "holeId": hole.hole_id,
                "holeLevel": hole.hole_level,
                "curExp": hole.cur_exp,
            })
        })
        .collect::<Vec<_>>();
    normal_hole_infos.sort_by_key(|row| {
        (
            row.get("mapKey")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or_default(),
            row.get("holeId")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or_default(),
        )
    });

    let mut core_hole_node_infos = info
        .core_hole_node_infos
        .iter()
        .map(|(map_key, node)| {
            container_probe_medal_node_json(
                node,
                Some(*map_key),
                "SyncContainerData.v_data.season_medal_info.core_hole_node_infos",
            )
        })
        .collect::<Vec<_>>();
    core_hole_node_infos.sort_by_key(|row| {
        (
            row.get("choose")
                .and_then(serde_json::Value::as_bool)
                .map(|chosen| if chosen { 0_u8 } else { 1_u8 })
                .unwrap_or(2_u8),
            row.get("slot")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(i64::MAX),
            row.get("nodeId")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or_default(),
        )
    });

    let selected_core_hole_node_infos = core_hole_node_infos
        .iter()
        .filter(|row| {
            row.get("choose")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();

    Some(serde_json::json!({
        "seasonId": info.season_id,
        "coreHoleInfo": info.core_hole_info.as_ref().map(|hole| serde_json::json!({
            "holeId": hole.hole_id,
            "holeLevel": hole.hole_level,
            "curExp": hole.cur_exp,
        })),
        "normalHoleInfos": normal_hole_infos,
        "coreHoleNodeInfos": core_hole_node_infos,
        "selectedCoreHoleNodeInfos": selected_core_hole_node_infos,
    }))
}

fn push_container_raw_proto_candidate_id(
    rows: &mut Vec<ContainerRawProtoCandidateId>,
    seen: &mut HashSet<(String, usize, &'static str, u32)>,
    path: &str,
    offset: usize,
    value: u64,
) {
    const RAW_PROTO_CANDIDATE_LIMIT: usize = 512;
    if rows.len() >= RAW_PROTO_CANDIDATE_LIMIT {
        return;
    }
    let Ok(value) = u32::try_from(value) else {
        return;
    };
    let Some(kind) = classify_container_candidate_id(value) else {
        return;
    };
    let key = (path.to_string(), offset, kind, value);
    if !seen.insert(key) {
        return;
    }
    rows.push(ContainerRawProtoCandidateId {
        path: path.to_string(),
        offset,
        kind,
        value,
    });
}

fn decode_container_varint(bytes: &[u8], mut pos: usize, end: usize) -> Option<(u64, usize)> {
    let mut value = 0u64;
    let mut shift = 0u32;
    for _ in 0..10 {
        if pos >= end {
            return None;
        }
        let byte = bytes[pos];
        pos += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Some((value, pos));
        }
        shift += 7;
    }
    None
}

fn collect_container_raw_proto_candidates(
    bytes: &[u8],
    start: usize,
    end: usize,
    path: &str,
    depth: usize,
    max_depth: usize,
    max_len: usize,
    rows: &mut Vec<ContainerRawProtoCandidateId>,
    seen: &mut HashSet<(String, usize, &'static str, u32)>,
) -> Option<()> {
    if start > end || end > bytes.len() {
        return None;
    }
    let mut pos = start;
    let mut saw_field = false;
    let mut field_counts: HashMap<u64, usize> = HashMap::new();

    while pos < end {
        let field_offset = pos;
        let (key, next_pos) = decode_container_varint(bytes, pos, end)?;
        pos = next_pos;
        let field_number = key >> 3;
        let wire_type = key & 0x07;
        if field_number == 0 {
            return None;
        }

        let occurrence = field_counts.entry(field_number).or_insert(0);
        let field_path = format!("{path}.{field_number}[{occurrence}]");
        *occurrence += 1;

        match wire_type {
            0 => {
                let (value, next_pos) = decode_container_varint(bytes, pos, end)?;
                pos = next_pos;
                push_container_raw_proto_candidate_id(rows, seen, &field_path, field_offset, value);
            }
            1 => {
                pos = pos.checked_add(8)?;
                if pos > end {
                    return None;
                }
            }
            2 => {
                let (len, next_pos) = decode_container_varint(bytes, pos, end)?;
                pos = next_pos;
                let len = usize::try_from(len).ok()?;
                let child_start = pos;
                let child_end = pos.checked_add(len)?;
                if child_end > end {
                    return None;
                }
                if len > 0 && len <= max_len && depth < max_depth {
                    let mut child_rows = Vec::new();
                    let mut child_seen = seen.clone();
                    if collect_container_raw_proto_candidates(
                        bytes,
                        child_start,
                        child_end,
                        &field_path,
                        depth + 1,
                        max_depth,
                        max_len,
                        &mut child_rows,
                        &mut child_seen,
                    )
                    .is_some()
                    {
                        for row in child_rows {
                            let key = (row.path.clone(), row.offset, row.kind, row.value);
                            if seen.insert(key) {
                                rows.push(row);
                            }
                        }
                    }
                }
                pos = child_end;
            }
            5 => {
                pos = pos.checked_add(4)?;
                if pos > end {
                    return None;
                }
            }
            _ => return None,
        }
        saw_field = true;
    }

    (saw_field && pos == end).then_some(())
}

fn scan_container_raw_proto_candidates(buffer: &[u8]) -> Vec<ContainerRawProtoCandidateId> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    let _ = collect_container_raw_proto_candidates(
        buffer,
        0,
        buffer.len(),
        "$",
        0,
        10,
        32_768,
        &mut rows,
        &mut seen,
    );
    rows.sort_by(|left, right| {
        left.value
            .cmp(&right.value)
            .then_with(|| left.offset.cmp(&right.offset))
            .then_with(|| left.path.cmp(&right.path))
    });
    rows
}

fn build_sync_container_probe_logger_entry(
    ts_ms: i64,
    sync_container_data: blueprotobuf::SyncContainerData,
) -> Option<EventLoggerEntry> {
    let Some(v_data) = sync_container_data.v_data else {
        if !container_probes_verbose_enabled() {
            return None;
        }
        let raw = serde_json::json!({
            "probe": "sync-container",
            "hasVData": false,
        });
        return Some(EventLoggerEntry {
            ts_ms,
            category: "container_probe".to_string(),
            action: "sync_container".to_string(),
            uid: None,
            target_uid: None,
            source_uid: None,
            source_label: Some("WorldNtf".to_string()),
            target_label: Some("SyncContainerData".to_string()),
            name_hint: Some("SyncContainerData".to_string()),
            summary: Some("method=SyncContainerData hasVData=false".to_string()),
            stacks: None,
            duration_ms: None,
            remaining_ms: None,
            value: Some("0".to_string()),
            raw: serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "null".to_string()),
        });
    };

    let vdata_bytes = <blueprotobuf::CharSerialize as prost::Message>::encode_to_vec(&v_data);
    let offset_candidates = scan_container_factor_candidates(&vdata_bytes);
    let raw_proto_candidates = scan_container_raw_proto_candidates(&vdata_bytes);
    let vdata_json = serde_json::to_value(&v_data).unwrap_or(serde_json::Value::Null);
    let json_candidates = scan_container_json_candidates(&vdata_json);
    let equipped_factor_items = collect_container_probe_equipped_factor_items(&v_data);
    let season_medal = collect_container_probe_season_medal_nodes(&v_data);
    let selected_season_medal_node_count = season_medal
        .as_ref()
        .and_then(|value| value.get("selectedCoreHoleNodeInfos"))
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    if offset_candidates.is_empty()
        && raw_proto_candidates.is_empty()
        && json_candidates.is_empty()
        && equipped_factor_items.is_empty()
        && selected_season_medal_node_count == 0
        && !container_probes_verbose_enabled()
    {
        return None;
    }

    let mut value_counts: HashMap<u32, usize> = HashMap::new();
    for row in &offset_candidates {
        *value_counts.entry(row.value).or_insert(0) += 1;
    }
    for row in &raw_proto_candidates {
        *value_counts.entry(row.value).or_insert(0) += 1;
    }
    for row in &json_candidates {
        *value_counts.entry(row.value).or_insert(0) += 1;
    }
    let mut values = value_counts.into_iter().collect::<Vec<_>>();
    values.sort_by_key(|(value, _)| *value);
    let value_summary = values
        .iter()
        .take(8)
        .map(|(value, count)| {
            if *count > 1 {
                format!("{value}x{count}")
            } else {
                value.to_string()
            }
        })
        .collect::<Vec<_>>();

    let char_id = v_data.char_id;
    let name = v_data.char_base.as_ref().and_then(|base| base.name.clone());
    let top_level_sections = vdata_json
        .as_object()
        .map(|object| object.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    let raw_candidates = offset_candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "offset": row.offset,
                "encoding": row.encoding,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();
    let raw_proto_candidates_json = raw_proto_candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "path": row.path,
                "offset": row.offset,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();
    let json_candidates_json = json_candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "path": row.path,
                "location": row.location,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();

    let mut summary_parts = vec![
        "method=SyncContainerData".to_string(),
        format!("vdata={}B", vdata_bytes.len()),
        format!("offsetCandidates={}", offset_candidates.len()),
        format!("protoCandidates={}", raw_proto_candidates.len()),
        format!("jsonCandidates={}", json_candidates.len()),
        format!("equippedFactorItems={}", equipped_factor_items.len()),
        format!("seasonMedalSelectedNodes={selected_season_medal_node_count}"),
    ];
    if let Some(char_id) = char_id {
        summary_parts.push(format!("charId={char_id}"));
    }
    if !value_summary.is_empty() {
        summary_parts.push(format!("values={}", value_summary.join(",")));
    }

    let raw = serde_json::json!({
        "probe": "sync-container",
        "hasVData": true,
        "charId": char_id,
        "name": name.clone(),
        "vdataBytesLength": vdata_bytes.len(),
        "topLevelSections": top_level_sections,
        "factorCandidateCount": offset_candidates.len(),
        "factorCandidatesTruncated": offset_candidates.len() > raw_candidates.len(),
        "factorCandidates": raw_candidates,
        "rawProtoCandidateCount": raw_proto_candidates.len(),
        "rawProtoCandidatesTruncated": raw_proto_candidates.len() > raw_proto_candidates_json.len(),
        "rawProtoCandidates": raw_proto_candidates_json,
        "jsonCandidateCount": json_candidates.len(),
        "jsonCandidatesTruncated": json_candidates.len() > json_candidates_json.len(),
        "jsonCandidates": json_candidates_json,
        "equippedFactorItems": equipped_factor_items.clone(),
        "seasonMedal": season_medal,
    });

    Some(EventLoggerEntry {
        ts_ms,
        category: "container_probe".to_string(),
        action: "sync_container".to_string(),
        uid: char_id,
        target_uid: None,
        source_uid: char_id,
        source_label: name.clone(),
        target_label: Some("SyncContainerData".to_string()),
        name_hint: Some(
            if offset_candidates.is_empty()
                && raw_proto_candidates.is_empty()
                && json_candidates.is_empty()
                && equipped_factor_items.is_empty()
                && selected_season_medal_node_count == 0
            {
                "SyncContainerData".to_string()
            } else {
                "SyncContainerData factor candidate".to_string()
            },
        ),
        summary: Some(summary_parts.join(" ")),
        stacks: i32::try_from(
            offset_candidates.len()
                + raw_proto_candidates.len()
                + json_candidates.len()
                + equipped_factor_items.len(),
        )
        .ok(),
        duration_ms: None,
        remaining_ms: None,
        value: Some(vdata_bytes.len().to_string()),
        raw: serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "null".to_string()),
    })
}

fn build_sync_container_dirty_probe_logger_entry(
    ts_ms: i64,
    sync_container_dirty_data: blueprotobuf::SyncContainerDirtyData,
) -> Option<EventLoggerEntry> {
    let buffer = sync_container_dirty_data
        .v_data
        .as_ref()
        .and_then(|stream| stream.buffer.as_deref())
        .unwrap_or_default();
    let candidates = scan_container_factor_candidates(buffer);
    let raw_proto_candidates = scan_container_raw_proto_candidates(buffer);
    if candidates.is_empty()
        && raw_proto_candidates.is_empty()
        && !container_probes_verbose_enabled()
    {
        return None;
    }

    let buffer_hex_limit = 32_768usize;
    let buffer_slice = if buffer.len() > buffer_hex_limit {
        &buffer[..buffer_hex_limit]
    } else {
        buffer
    };
    let is_truncated = buffer.len() > buffer_hex_limit;
    let mut value_counts: HashMap<u32, usize> = HashMap::new();
    for row in &candidates {
        *value_counts.entry(row.value).or_insert(0) += 1;
    }
    for row in &raw_proto_candidates {
        *value_counts.entry(row.value).or_insert(0) += 1;
    }
    let mut values = value_counts.into_iter().collect::<Vec<_>>();
    values.sort_by_key(|(value, _)| *value);
    let value_summary = values
        .iter()
        .take(8)
        .map(|(value, count)| {
            if *count > 1 {
                format!("{value}x{count}")
            } else {
                value.to_string()
            }
        })
        .collect::<Vec<_>>();

    let mut summary_parts = vec![
        "method=SyncContainerDirtyData".to_string(),
        format!("buffer={}B", buffer.len()),
        format!("factorCandidates={}", candidates.len()),
        format!("protoCandidates={}", raw_proto_candidates.len()),
    ];
    if is_truncated {
        summary_parts.push(format!("preview={}B", buffer_hex_limit));
    }
    if !value_summary.is_empty() {
        summary_parts.push(format!("values={}", value_summary.join(",")));
    }

    let raw_candidates = candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "offset": row.offset,
                "encoding": row.encoding,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();
    let raw_proto_candidates_json = raw_proto_candidates
        .iter()
        .take(200)
        .map(|row| {
            serde_json::json!({
                "path": row.path,
                "offset": row.offset,
                "kind": row.kind,
                "value": row.value,
            })
        })
        .collect::<Vec<_>>();

    let raw = serde_json::json!({
        "probe": "sync-container-dirty",
        "bufferLength": buffer.len(),
        "bufferHex": hex::encode(buffer_slice),
        "bufferHexTruncated": is_truncated,
        "factorCandidateCount": candidates.len(),
        "factorCandidatesTruncated": candidates.len() > raw_candidates.len(),
        "factorCandidates": raw_candidates,
        "rawProtoCandidateCount": raw_proto_candidates.len(),
        "rawProtoCandidatesTruncated": raw_proto_candidates.len() > raw_proto_candidates_json.len(),
        "rawProtoCandidates": raw_proto_candidates_json,
    });

    Some(EventLoggerEntry {
        ts_ms,
        category: "container_probe".to_string(),
        action: "sync_container_dirty".to_string(),
        uid: None,
        target_uid: None,
        source_uid: None,
        source_label: Some("WorldNtf".to_string()),
        target_label: Some("SyncContainerDirtyData".to_string()),
        name_hint: Some(
            if candidates.is_empty() && raw_proto_candidates.is_empty() {
                "SyncContainerDirtyData".to_string()
            } else {
                "SyncContainerDirtyData factor candidate".to_string()
            },
        ),
        summary: Some(summary_parts.join(" ")),
        stacks: i32::try_from(candidates.len() + raw_proto_candidates.len()).ok(),
        duration_ms: None,
        remaining_ms: None,
        value: Some(buffer.len().to_string()),
        raw: serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "null".to_string()),
    })
}

fn build_sync_log_logger_entry(
    ts_ms: i64,
    sync_log: blueprotobuf::SyncLog,
) -> Option<EventLoggerEntry> {
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
            &[
                "senderName",
                "fromName",
                "speakerName",
                "roleName",
                "playerName",
                "name",
            ],
        )
    });
    let source_uid = parsed_json.as_ref().and_then(|value| {
        logger_find_i64_field(
            value,
            &[
                "sourceUid",
                "senderUid",
                "speakerUid",
                "charId",
                "roleId",
                "playerUid",
                "uid",
            ],
        )
    });
    let channel_name = parsed_json
        .as_ref()
        .and_then(|value| {
            logger_find_string_field(
                value,
                &[
                    "channelName",
                    "channel",
                    "chatChannel",
                    "channelType",
                    "chatType",
                    "targetChannel",
                ],
            )
        })
        .or_else(|| {
            parsed_json.as_ref().and_then(|value| {
                logger_find_i64_field(value, &["channelId", "channel_id"])
                    .map(|id| format!("channel:{id}"))
            })
        })
        .or_else(|| sync_log_channel_from_text(&text).map(str::to_string));

    let item_id = parsed_json.as_ref().and_then(|value| {
        logger_find_i64_field(
            value,
            &[
                "itemId",
                "item_id",
                "configId",
                "config_id",
                "itemConfigId",
                "item_config_id",
            ],
        )
    });
    let item_count = parsed_json
        .as_ref()
        .and_then(|value| {
            logger_find_i64_field(value, &["count", "itemCount", "amount", "quantity", "num"])
        })
        .and_then(|value| i32::try_from(value).ok());
    let item_name = parsed_json.as_ref().and_then(|value| {
        logger_find_string_field(
            value,
            &[
                "itemName",
                "item_name",
                "itemDisplayName",
                "dropName",
                "displayName",
                "nameDesign",
                "name",
            ],
        )
    });

    let looks_like_chat = channel_name.is_some() || sync_log_looks_like_chat(&text);
    let looks_like_item_drop =
        item_id.is_some() || item_count.is_some() || sync_log_contains_drop_hint(&text);

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

fn decode_auxiliary_logger_entries(
    notify: &crate::packets::parser::ParsedNotifyFragment,
) -> Vec<EventLoggerEntry> {
    let mut entries = Vec::new();

    let mut promoted_entries = decode_promoted_service_entries(notify);
    if !promoted_entries.is_empty() {
        if should_emit_raw_service_probe_sample(notify) {
            promoted_entries.insert(0, build_raw_service_probe_logger_entry(now_ms(), notify));
        }
        promoted_entries.extend(entries);
        return promoted_entries;
    }

    if should_emit_raw_service_probe(notify) {
        entries.insert(0, build_raw_service_probe_logger_entry(now_ms(), notify));
        return entries;
    }

    let mut decoded_entries = match notify.recognized_pkt {
        Some(packets::opcodes::Pkt::SyncLog) => {
            match blueprotobuf::SyncLog::decode(notify.payload.clone()) {
                Ok(sync_log) => build_sync_log_logger_entry(now_ms(), sync_log)
                    .into_iter()
                    .collect(),
                Err(error) => {
                    warn!("Error decoding SyncLog.. ignoring: {error}");
                    Vec::new()
                }
            }
        }
        Some(packets::opcodes::Pkt::SyncContainerData) if container_probes_enabled() => {
            match blueprotobuf::SyncContainerData::decode(notify.payload.clone()) {
                Ok(sync_container_data) => {
                    build_sync_container_probe_logger_entry(now_ms(), sync_container_data)
                        .into_iter()
                        .collect()
                }
                Err(error) => {
                    warn!("Error decoding SyncContainerData probe.. ignoring: {error}");
                    Vec::new()
                }
            }
        }
        Some(packets::opcodes::Pkt::SyncContainerDirtyData) if container_probes_enabled() => {
            match blueprotobuf::SyncContainerDirtyData::decode(notify.payload.clone()) {
                Ok(sync_container_dirty_data) => build_sync_container_dirty_probe_logger_entry(
                    now_ms(),
                    sync_container_dirty_data,
                )
                .into_iter()
                .collect(),
                Err(error) => {
                    warn!("Error decoding SyncContainerDirtyData probe.. ignoring: {error}");
                    Vec::new()
                }
            }
        }
        Some(packets::opcodes::Pkt::SyncDungeonData) if dungeon_probes_enabled() => {
            match blueprotobuf::SyncDungeonData::decode(notify.payload.clone()) {
                Ok(sync_dungeon_data) => vec![build_sync_dungeon_data_logger_entry(
                    now_ms(),
                    sync_dungeon_data,
                )],
                Err(error) => {
                    warn!("Error decoding SyncDungeonData.. ignoring: {error}");
                    Vec::new()
                }
            }
        }
        Some(packets::opcodes::Pkt::SyncDungeonDirtyData) if dungeon_probes_enabled() => {
            match blueprotobuf::SyncDungeonDirtyData::decode(notify.payload.clone()) {
                Ok(sync_dungeon_dirty_data) => vec![build_sync_dungeon_dirty_data_logger_entry(
                    now_ms(),
                    sync_dungeon_dirty_data,
                )],
                Err(error) => {
                    warn!("Error decoding SyncDungeonDirtyData.. ignoring: {error}");
                    Vec::new()
                }
            }
        }
        _ => Vec::new(),
    };

    if should_emit_raw_service_probe_sample(notify) {
        decoded_entries.insert(0, build_raw_service_probe_logger_entry(now_ms(), notify));
    }

    decoded_entries.append(&mut entries);
    decoded_entries
}

fn build_event_logger_session_context(state: &AppState) -> EventLoggerSessionContext {
    let character_uid =
        (state.encounter.local_player_uid > 0).then_some(state.encounter.local_player_uid);
    let character_name = character_uid.and_then(|uid| {
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

fn flush_attribution_census(app_handle: &AppHandle, boundary: &str, state: &AppState) {
    if let Err(error) = flush_current_census_to_file(
        app_handle,
        boundary,
        build_event_logger_session_context(state),
    ) {
        warn!(
            target: "app::live",
            "attribution_census_flush_failed boundary={} error={}",
            boundary,
            error
        );
    }
}

fn clamp_u128_to_i32(value: u128) -> i32 {
    value.min(i32::MAX as u128) as i32
}

fn logger_placeholder_name_for_uid(uid: i64) -> String {
    format!("目标 {uid}")
}

fn normalize_logger_base_name(uid: i64, base_name: String, fallback_name: Option<&str>) -> String {
    let trimmed = base_name.trim();
    let placeholder = logger_placeholder_name_for_uid(uid);
    if let Some(fallback) = fallback_name {
        let fallback_trimmed = fallback.trim();
        if !fallback_trimmed.is_empty()
            && (trimmed.is_empty() || trimmed == placeholder || trimmed == format!("UID {uid}"))
        {
            return fallback_trimmed.to_string();
        }
    }

    if trimmed == placeholder {
        return format!("UID {uid}");
    }

    base_name
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
    let session_context = build_event_logger_session_context(state);
    let local_player_uid = if payload.local_player_uid > 0 {
        payload.local_player_uid
    } else {
        state.encounter.local_player_uid
    };
    let scene_label = payload
        .scene_name
        .clone()
        .or_else(|| state.encounter.current_scene_name.clone())
        .or_else(|| session_context.scene_name.clone());
    let effective_scene_id = payload.scene_id.or(state.encounter.current_scene_id);

    let local_player_name = if local_player_uid > 0 {
        let fallback_name = session_context
            .character_uid
            .filter(|uid| *uid == local_player_uid)
            .and_then(|_| session_context.character_name.clone());

        state
            .encounter
            .entity_uid_to_entity
            .get(&local_player_uid)
            .map(|entity| resolve_entity_display_name(local_player_uid, entity, &state.attr_store))
            .map(|name| {
                normalize_logger_base_name(local_player_uid, name, fallback_name.as_deref())
            })
            .map(|name| logger_entity_name(local_player_uid, name, local_player_uid))
            .or_else(|| {
                fallback_name
                    .map(|name| logger_entity_name(local_player_uid, name, local_player_uid))
            })
    } else {
        None
    };

    let live_totals_raw = serde_json::json!({
        "elapsedMs": payload.elapsed_ms,
        "activeCombatTimeMs": payload.active_combat_time_ms,
        "fightStartTimestampMs": payload.fight_start_timestamp_ms,
        "totalDmg": payload.total_dmg,
        "totalDmgBossOnly": payload.total_dmg_boss_only,
        "totalHeal": payload.total_heal,
        "totalEffectiveHeal": payload.total_effective_heal,
        "localPlayerUid": local_player_uid,
        "sceneId": effective_scene_id,
        "sceneName": scene_label.clone(),
        "isPaused": payload.is_paused,
        "bosses": payload.bosses.clone(),
        "entities": payload.entities.clone(),
    });

    entries.push(EventLoggerEntry {
        ts_ms,
        category: "live_totals".into(),
        action: "snapshot".into(),
        uid: effective_scene_id.map(i64::from),
        target_uid: None,
        source_uid: (local_player_uid > 0).then_some(local_player_uid),
        source_label: local_player_name.clone(),
        target_label: scene_label.clone(),
        name_hint: scene_label.clone(),
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
        raw: serde_json::to_string_pretty(&live_totals_raw).unwrap_or_else(|_| "null".to_string()),
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
            target_label: scene_label.clone(),
            name_hint: Some(logger_entity_name(
                boss.uid,
                boss.name.clone(),
                local_player_uid,
            )),
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
        let fallback_name = if uid == local_player_uid {
            session_context
                .character_uid
                .filter(|current_uid| *current_uid == uid)
                .and_then(|_| session_context.character_name.clone())
        } else {
            None
        };
        let display_name = logger_entity_name(
            uid,
            normalize_logger_base_name(uid, base_name, fallback_name.as_deref()),
            local_player_uid,
        );
        let current_hp = state
            .attr_store
            .attr(uid, AttrType::CurrentHp)
            .and_then(|value| value.as_int());
        let max_hp = state
            .attr_store
            .attr(uid, AttrType::MaxHp)
            .and_then(|value| value.as_int());
        let effective_class_id = state
            .attr_store
            .attr(uid, AttrType::ProfessionId)
            .and_then(|value| value.as_int())
            .filter(|value| *value > 0)
            .map_or(entity.class_id, |value| value as i32);
        let effective_ability_score = state
            .attr_store
            .attr(uid, AttrType::FightPoint)
            .and_then(|value| value.as_int())
            .filter(|value| *value > 0)
            .map_or(entity.ability_score, |value| value as i32);
        let effective_season_strength = state
            .attr_store
            .attr(uid, AttrType::SeasonStrength)
            .and_then(|value| value.as_int())
            .filter(|value| *value > 0)
            .map_or(entity.season_strength, |value| value as i32);
        let has_combat = entity.damage.hits > 0 || entity.healing.hits > 0 || entity.taken.hits > 0;
        let has_hp = current_hp.is_some() || max_hp.is_some();
        let is_player = entity.entity_type == blueprotobuf::EEntityType::EntChar;
        let is_boss = entity.is_boss_metric_target();

        if is_player && (has_combat || uid == local_player_uid) {
            entries.push(EventLoggerEntry {
                ts_ms,
                category: "player".into(),
                action: "snapshot".into(),
                uid: Some(uid),
                target_uid: None,
                source_uid: Some(uid),
                source_label: Some(display_name.clone()),
                target_label: scene_label.clone(),
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
                    "classId": effective_class_id,
                    "classSpec": entity.class_spec,
                    "abilityScore": effective_ability_score,
                    "seasonStrength": effective_season_strength,
                    "currentHp": current_hp,
                    "maxHp": max_hp,
                    "damage": entity.damage,
                    "damageBossOnly": entity.damage_boss_only,
                    "healing": entity.healing,
                    "taken": entity.taken,
                    "activeFactorBuffs": &entity.active_factor_buffs,
                    "activeEffectBuffs": &entity.active_effect_buffs,
                    "activeEffectSources": &entity.active_effect_sources,
                    "activeFactorItems": &entity.active_factor_items,
                    "activePassiveSkills": &entity.active_passive_skills,
                    "activeProfessionSkills": &entity.active_profession_skills,
                    "activeProfessionTalents": &entity.active_profession_talents,
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
                    .map(|target| {
                        resolve_entity_display_name(target_uid, target, &state.attr_store)
                    })
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
                    .map(|target| {
                        resolve_entity_display_name(target_uid, target, &state.attr_store)
                    })
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
                    .map(|target| {
                        resolve_entity_display_name(target_uid, target, &state.attr_store)
                    })
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
                target_label: scene_label.clone(),
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
            debug!(target: "app::live", "Received SyncDungeonData packet");
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
                    debug!(
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
            debug!(target: "app::live", "Received SyncDungeonDirtyData packet");
            match blueprotobuf::SyncDungeonDirtyData::decode(data) {
                Ok(v) => {
                    let buffer_len = v
                        .v_data
                        .as_ref()
                        .and_then(|s| s.buffer.as_ref())
                        .map(|b| b.len())
                        .unwrap_or(0);
                    debug!(
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
    state.local_selected_factor_items =
        crate::live::selected_factor_cache::load_selected_factor_items(&app_handle);
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
                emit_pending_background_logger_entries(&app_handle);
            }
            packet = rx.recv() => match packet {
            Some(notify) => {
                queue_depth
                    .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |depth| {
                        Some(depth.saturating_sub(1))
                    })
                    .ok();
                // Process the first packet immediately (low-latency path)
                let mut batch_events = Vec::new();
                handle_capture_event(&app_handle, notify, &mut batch_events);

                // Drain additional queued packets quickly but with a strict time budget
                let drain_start = Instant::now();
                let queued_at_batch_start = queue_depth.load(Ordering::Relaxed);
                let (drain_time_budget, max_drain) =
                    if queued_at_batch_start >= QUEUE_DEPTH_CRITICAL_THRESHOLD {
                        (Duration::from_millis(120), 1_000usize)
                    } else if queued_at_batch_start >= QUEUE_DEPTH_ERROR_THRESHOLD {
                        (Duration::from_millis(90), 600usize)
                    } else if queued_at_batch_start >= QUEUE_DEPTH_WARN_THRESHOLD {
                        (Duration::from_millis(60), 240usize)
                    } else {
                        (Duration::from_millis(20), 40usize)
                    };
                let mut drained = 0usize;

                loop {
                    if drained >= max_drain {
                        break;
                    }
                    if Instant::now().duration_since(drain_start) >= drain_time_budget {
                        break;
                    }

                    match rx.try_recv() {
                        Ok(notify) => {
                            queue_depth
                                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |depth| {
                                    Some(depth.saturating_sub(1))
                                })
                                .ok();
                            let is_server_change = handle_capture_event(&app_handle, notify, &mut batch_events);
                            drained += 1;
                            if is_server_change {
                                break;
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
                emit_pending_background_logger_entries(&app_handle);

                // Check if we should emit events (throttling)
                // Read current event update rate from state dynamically
                let emit_rate_ms = state.event_update_rate_ms;
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                let time_since_last_emit = now.duration_since(last_emit_time);
                let backlog_elevated =
                    queue_depth.load(Ordering::Relaxed) >= QUEUE_DEPTH_WARN_THRESHOLD;
                let should_emit = (!backlog_elevated
                    && time_since_last_emit >= emit_throttle_duration)
                    || time_since_last_emit >= heartbeat_duration;
                if should_emit {
                    last_emit_time = now;
                    state_manager.update_and_emit_events_with_state(&mut state);
                }
                flush_outbound_events(&app_handle, &mut state);
                emit_pending_background_logger_entries(&app_handle);
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
                emit_pending_background_logger_entries(&app_handle);
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
    flush_attribution_census(&app_handle, "live_loop_exit", &state);
    flush_selected_factor_cache_if_needed(&app_handle, &mut state);
}

fn flush_outbound_events(app_handle: &AppHandle, state: &mut AppState) {
    flush_selected_factor_cache_if_needed(app_handle, state);

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
                        summary: Some(format!(
                            "elapsed={}ms paused={}",
                            header_info.elapsed_ms, is_paused
                        )),
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
                        raw: serde_json::to_string_pretty(
                            &serde_json::json!({ "event": "reset-encounter" }),
                        )
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
                flush_attribution_census(app_handle, "encounter_reset", state);
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
                        raw: serde_json::to_string_pretty(
                            &serde_json::json!({ "paused": is_paused }),
                        )
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
                flush_attribution_census(app_handle, "scene_change", state);

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
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "live-data",
                    payload.clone(),
                );
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
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "boss-buff-update",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
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
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "hate-list-update",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
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
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "entity-names",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
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
            OutboundEvent::EntityIdentityMap {
                player_names,
                monster_ids,
            } => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "entity-identities",
                    EntityIdentityMapPayload {
                        player_names,
                        monster_ids,
                    },
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
                        summary: Some(format!(
                            "type={} accelerate={:.2}",
                            skill_cd.skill_cd_type, skill_cd.cd_accelerate_rate
                        )),
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
                        summary: Some(format!("entries={}", fight_res.entries.len())),
                        stacks: None,
                        duration_ms: None,
                        remaining_ms: None,
                        value: None,
                        raw: serde_json::to_string_pretty(&fight_res)
                            .unwrap_or_else(|_| "null".to_string()),
                    }],
                );
            }
            OutboundEvent::ShieldDetailUpdate {
                current_hp,
                max_hp,
                entries,
            } => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "shield-detail-update",
                    ShieldDetailUpdatePayload {
                        current_hp,
                        max_hp,
                        entries,
                    },
                );
            }
            OutboundEvent::DeathReplay(records) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "death-replay",
                    DeathReplayPayload { records },
                );
            }
        }
    }
}

fn flush_selected_factor_cache_if_needed(app_handle: &AppHandle, state: &mut AppState) {
    if !state.selected_factor_cache_dirty {
        return;
    }

    match crate::live::selected_factor_cache::save_selected_factor_items(
        app_handle,
        &state.local_selected_factor_items,
    ) {
        Ok(_) => {
            state.selected_factor_cache_dirty = false;
        }
        Err(error) => {
            warn!(
                target: "app::live",
                "failed to save selected factor cache: {}",
                error
            );
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
