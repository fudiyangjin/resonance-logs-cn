use crate::live::state::{AppState, AppStateManager, StateEvent};
use crate::packets;
use blueprotobuf_lib::blueprotobuf;
use bytes::Bytes;
use log::{debug, info, trace, warn};
use prost::Message;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

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

/// Starts the live meter.
///
/// This function captures packets, processes them, and emits events to the frontend.
///
/// # Arguments
///
/// * `app_handle` - A handle to the Tauri application instance.
pub async fn start(app_handle: AppHandle) {
    let live_span = tracing::info_span!(
        target: "app::live",
        "live_meter",
        window_live = crate::WINDOW_LIVE_LABEL,
        window_main = crate::WINDOW_MAIN_LABEL
    );
    let _live_guard = live_span.enter();

    // Get the state manager from app state
    let state_manager = app_handle.state::<AppStateManager>().inner().clone();
    let mut state = AppState::new(app_handle.clone());
    state.event_manager.initialize(app_handle.clone());
    state_manager.publish_snapshot_from_state(&state);

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

    // 2. Use the channel to receive packets back and process them
    loop {
        log_queue_depth_if_needed(
            queue_depth.as_ref(),
            &mut queue_depth_warn_counter,
            &mut queue_depth_last_log_at,
        );
        state_manager.apply_pending_control_commands(&mut state).await;

        // Use tokio::time::timeout to ensure we emit periodically even if no packets arrive
        let packet_result = tokio::time::timeout(heartbeat_duration, rx.recv()).await;

        // Helper to decode op/data into a StateEvent; returns None if decoding failed
        let decode_event = |op: packets::opcodes::Pkt, data: Bytes| -> Option<StateEvent> {
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
                packets::opcodes::Pkt::SyncServerTime => {
                    match blueprotobuf::SyncServerTime::decode(data) {
                        Ok(v) => Some(StateEvent::SyncServerTime(v)),
                        Err(e) => {
                            warn!("Error decoding SyncServerTime.. ignoring: {e}");
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
                packets::opcodes::Pkt::NotifyReviveUser => {
                    match blueprotobuf::NotifyReviveUser::decode(data) {
                        Ok(v) => Some(StateEvent::NotifyReviveUser(v)),
                        Err(e) => {
                            warn!("Error decoding NotifyReviveUser.. ignoring: {e}");
                            None
                        }
                    }
                }
                packets::opcodes::Pkt::BuffInfoSync => {
                    match blueprotobuf::BuffInfoSync::decode(data) {
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
                    }
                }
                _ => {
                    trace!("Unhandled packet opcode: {op:?}");
                    None
                }
            }
        };

        match packet_result {
            Ok(Some((op, data))) => {
                queue_depth.fetch_sub(1, Ordering::Relaxed);
                // Process the first packet immediately (low-latency path)
                let mut batch_events = Vec::new();
                if let Some(event) = decode_event(op, data) {
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
                            queue_depth.fetch_sub(1, Ordering::Relaxed);
                            if let Some(event) = decode_event(op, data) {
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

                state_manager
                    .handle_events_batch_with_state(&mut state, batch_events)
                    .await;
                state_manager.apply_pending_control_commands(&mut state).await;

                // Check if we should emit events (throttling)
                // Read current event update rate from state dynamically
                let emit_rate_ms = state_manager.current_event_update_rate_ms();
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                if now.duration_since(last_emit_time) >= emit_throttle_duration {
                    last_emit_time = now;
                    state_manager
                        .update_and_emit_events_with_state(&mut state)
                        .await;
                }
            }
            Ok(None) => {
                warn!(
                    target: "app::live",
                    "Packet capture channel closed, exiting live meter loop"
                );
                break;
            }
            Err(_) => {
                // Timeout occurred - read rate dynamically
                let emit_rate_ms = state_manager.current_event_update_rate_ms();
                let emit_throttle_duration = Duration::from_millis(emit_rate_ms);
                let now = Instant::now();
                if now.duration_since(last_emit_time) >= emit_throttle_duration {
                    last_emit_time = now;
                    state_manager
                        .update_and_emit_events_with_state(&mut state)
                        .await;
                }
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
