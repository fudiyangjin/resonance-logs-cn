use crate::live::state::{AppState, AppStateManager, StateEvent};
use crate::live::{
    commands_models::{
        BossBuffUpdatePayload, BossDbmUpdatePayload, BuffCounterUpdatePayload, BuffUpdatePayload,
        DeathReplayPayload, EntityIdentityMapPayload, FightResourceUpdatePayload,
        HateListUpdatePayload, PanelAttrUpdatePayload, SeasonCultivateFactorCounterUpdatePayload,
        ShieldDetailUpdatePayload, SkillCdUpdatePayload, StunUpdatePayload,
        TeammateBuffUpdatePayload, TeammateFantasyUpdatePayload,
    },
    event_manager::{EncounterUpdatePayload, SceneChangePayload},
    event_manager::{OutboundEvent, safe_emit_to},
};
use crate::packets;
use crate::packets::packet_capture::CaptureMethod;
use log::{info, warn};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc::UnboundedReceiver;

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

const DECODE_CHANNEL_CAP: usize = 4096;
const MINIMAP_EMIT_INTERVAL: Duration = Duration::from_millis(50);

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
    let mut last_minimap_emit_time = Instant::now();

    // Heartbeat: ensure we emit events periodically even during idle periods
    // to prevent frontend from thinking the connection is dead
    let heartbeat_duration = Duration::from_secs(2);

    // 1. Start capturing packets → decode worker → state_rx
    let capture_method = get_capture_method(&app_handle);
    let capture_rx = packets::packet_capture::start_capture(capture_method);
    let queue_depth: Arc<AtomicUsize> = Arc::new(AtomicUsize::new(0));
    let (state_tx, mut state_rx) = tokio::sync::mpsc::channel::<StateEvent>(DECODE_CHANNEL_CAP);
    packets::decode_worker::spawn_decode_worker(capture_rx, state_tx, Arc::clone(&queue_depth));

    let mut queue_depth_warn_counter = 0usize;
    let mut queue_depth_last_log_at = Instant::now();

    // 2. Use channels to receive decoded state events and control commands
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
            event = state_rx.recv() => match event {
            Some(event) => {
                queue_depth
                    .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |depth| {
                        Some(depth.saturating_sub(1))
                    })
                    .ok();

                let mut batch_events = Vec::with_capacity(64);
                batch_events.push(event);

                let drain_start = Instant::now();
                let drain_time_budget = Duration::from_millis(20);
                const MAX_DRAIN: usize = 64;
                let mut drained = 0usize;

                loop {
                    if drained >= MAX_DRAIN {
                        break;
                    }
                    if Instant::now().duration_since(drain_start) >= drain_time_budget {
                        break;
                    }

                    match state_rx.try_recv() {
                        Ok(event) => {
                            queue_depth
                                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |depth| {
                                    Some(depth.saturating_sub(1))
                                })
                                .ok();
                            let is_container_resync =
                                matches!(event, StateEvent::SyncContainerData(_));
                            batch_events.push(event);
                            drained += 1;
                            if is_container_resync {
                                break;
                            }
                        }
                        Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                        Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                            warn!(
                                target: "app::live",
                                "Decode worker channel closed while draining"
                            );
                            break;
                        }
                    }
                }

                state_manager.handle_events_batch_with_state(&mut state, batch_events);
                state_manager.drain_control_commands(&mut state, &mut control_rx);
                flush_outbound_events(&app_handle, &mut state);

                let emit_rate_ms = state.event_update_rate_ms;
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                if now.duration_since(last_emit_time) >= emit_throttle_duration {
                    last_emit_time = now;
                    state_manager.update_and_emit_events_with_state(&mut state);
                }
                if now.duration_since(last_minimap_emit_time) >= MINIMAP_EMIT_INTERVAL {
                    last_minimap_emit_time = now;
                    state_manager.emit_minimap_if_active(&mut state);
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
                let emit_rate_ms = state.event_update_rate_ms;
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                if now.duration_since(last_emit_time) >= emit_throttle_duration {
                    last_emit_time = now;
                    state_manager.update_and_emit_events_with_state(&mut state);
                }
                if now.duration_since(last_minimap_emit_time) >= MINIMAP_EMIT_INTERVAL {
                    last_minimap_emit_time = now;
                    state_manager.emit_minimap_if_active(&mut state);
                }
                flush_outbound_events(&app_handle, &mut state);
            }
        }
    }
}

fn flush_outbound_events(app_handle: &AppHandle, state: &mut AppState) {
    for event in state.event_manager.drain_outbound_events() {
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
                        header_info,
                        is_paused,
                    },
                );
            }
            OutboundEvent::EncounterReset => {
                safe_emit_to(app_handle, crate::WINDOW_LIVE_LABEL, "reset-encounter", "");
            }
            OutboundEvent::EncounterPause(is_paused) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "pause-encounter",
                    is_paused,
                );
            }
            OutboundEvent::SceneChange {
                scene_id,
                dungeon_difficulty,
            } => {
                let payload = SceneChangePayload {
                    scene_id,
                    dungeon_difficulty,
                };
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "scene-change",
                    payload.clone(),
                );
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MAIN_LABEL,
                    "scene-change",
                    payload,
                );
            }
            OutboundEvent::TrainingDummyUpdate(training_dummy) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_LIVE_LABEL,
                    "training-dummy-update",
                    training_dummy,
                );
            }
            OutboundEvent::LiveData(payload) => {
                safe_emit_to(app_handle, crate::WINDOW_LIVE_LABEL, "live-data", payload);
            }
            OutboundEvent::BuffUpdate(buffs) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "buff-update",
                    BuffUpdatePayload { buffs },
                );
            }
            OutboundEvent::BossBuffUpdate(boss_buffs) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "boss-buff-update",
                    BossBuffUpdatePayload { boss_buffs },
                );
            }
            OutboundEvent::TeammateBuffUpdate(teammate_buffs) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "teammate-buff-update",
                    TeammateBuffUpdatePayload { teammate_buffs },
                );
            }
            OutboundEvent::TeammateFantasyUpdate(fantasies) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "teammate-fantasy-update",
                    TeammateFantasyUpdatePayload { fantasies },
                );
            }
            OutboundEvent::TeammateFantasyClear => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "teammate-fantasy-clear",
                    (),
                );
            }
            OutboundEvent::HateListUpdate(hate_lists) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "hate-list-update",
                    HateListUpdatePayload { hate_lists },
                );
            }
            OutboundEvent::StunUpdate(entries) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "stun-update",
                    StunUpdatePayload { entries },
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
                    BuffCounterUpdatePayload { counters },
                );
            }
            OutboundEvent::SeasonCultivateFactorCounterUpdate {
                selection,
                counters,
            } => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "season-cultivate-factor-counter-update",
                    SeasonCultivateFactorCounterUpdatePayload {
                        source_item_ids: selection.source_item_ids,
                        slot_item_ids: selection.slot_item_ids,
                        counters,
                    },
                );
            }
            OutboundEvent::SkillCdUpdate(skill_cds) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "skill-cd-update",
                    SkillCdUpdatePayload { skill_cds },
                );
            }
            OutboundEvent::PanelAttrUpdate(attrs) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "panel-attr-update",
                    PanelAttrUpdatePayload { attrs },
                );
            }
            OutboundEvent::FightResourceUpdate(fight_res) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_GAME_OVERLAY_LABEL,
                    "fight-res-update",
                    FightResourceUpdatePayload { fight_res },
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
            OutboundEvent::MinimapUpdate(payload) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MINIMAP_OVERLAY_LABEL,
                    "minimap-update",
                    payload,
                );
            }
            OutboundEvent::BossDbmUpdate(events) => {
                safe_emit_to(
                    app_handle,
                    crate::WINDOW_MONSTER_OVERLAY_LABEL,
                    "boss-dbm-update",
                    BossDbmUpdatePayload { events },
                );
            }
        }
    }
}

fn get_capture_method(app: &AppHandle) -> CaptureMethod {
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
                    return capture_method_from_json(&json, &path);
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
                        return capture_method_from_json(&json, &path);
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

    warn!(target: "app::capture", "No packetCapture config found in app data dirs; using WinDivert");
    CaptureMethod::WinDivert
}

fn capture_method_from_json(json: &serde_json::Value, path: &Path) -> CaptureMethod {
    let method = json.get("method").and_then(|v| v.as_str());
    let device = json
        .get("npcapDevice")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let (capture_method, method_source) = resolve_capture_method(method, device);

    info!(
        target: "app::capture",
        "Packet capture config found at {} (method={} device={} method_source={})",
        path.display(),
        method.unwrap_or("<missing>"),
        device,
        method_source
    );

    match &capture_method {
        CaptureMethod::WinDivert => {
            info!(target: "app::capture", "Using WinDivert capture");
        }
        CaptureMethod::Npcap(device) => {
            info!(target: "app::capture", "Using Npcap capture device={device}");
        }
    }

    if let Some(other) = method.filter(|value| *value != "WinDivert" && *value != "Npcap") {
        warn!(
            target: "app::capture",
            "Unknown packet capture method {}; selected fallback source={}",
            other,
            method_source
        );
    }

    capture_method
}

fn resolve_capture_method(method: Option<&str>, device: &str) -> (CaptureMethod, &'static str) {
    match method {
        Some("WinDivert") => (CaptureMethod::WinDivert, "explicit"),
        Some("Npcap") => (CaptureMethod::Npcap(device.to_string()), "explicit"),
        Some(_) | None => {
            if device.trim().is_empty() {
                (CaptureMethod::WinDivert, "default_windivert")
            } else {
                (
                    CaptureMethod::Npcap(device.to_string()),
                    "legacy_npcap_device",
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_capture_method;
    use crate::packets::packet_capture::CaptureMethod;

    fn assert_npcap(method: Option<&str>, device: &str) {
        match resolve_capture_method(method, device).0 {
            CaptureMethod::Npcap(actual) => assert_eq!(actual, device),
            CaptureMethod::WinDivert => panic!("expected Npcap"),
        }
    }

    fn assert_windivert(method: Option<&str>, device: &str) {
        match resolve_capture_method(method, device).0 {
            CaptureMethod::WinDivert => {}
            CaptureMethod::Npcap(actual) => panic!("expected WinDivert, got Npcap({actual})"),
        }
    }

    #[test]
    fn explicit_windivert_wins() {
        assert_windivert(Some("WinDivert"), "npcap-device");
    }

    #[test]
    fn explicit_npcap_wins() {
        assert_npcap(Some("Npcap"), "npcap-device");
    }

    #[test]
    fn legacy_npcap_device_selects_npcap() {
        assert_npcap(None, "npcap-device");
    }

    #[test]
    fn empty_or_missing_legacy_config_defaults_to_windivert() {
        assert_windivert(None, "");
        assert_windivert(None, "   ");
    }

    #[test]
    fn unknown_method_falls_back_by_device_presence() {
        assert_npcap(Some("Other"), "npcap-device");
        assert_windivert(Some("Other"), "");
    }
}
