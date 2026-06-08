use crate::live::skill_lifecycle::{ClientSkillCast, ServerSkillEnd, SkillId};
use crate::live::state::StateEvent;
use crate::live::team::decode_team_event;
use crate::packets;
use crate::packets::opcodes::{
    CaptureEvent, GRPC_TEAM_NTF_SERVICE_ID, WORLD_CALL_SERVICE_ID, WORLD_NTF_SERVICE_ID,
    world_call_method,
};
use blueprotobuf_lib::blueprotobuf;
use bytes::Bytes;
use log::{debug, info, trace, warn};
use prost::Message;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

fn decode_client_skill_cast(req: &blueprotobuf::UseSlotRequest) -> Option<ClientSkillCast> {
    let is_skill_slot = req.use_type == Some(blueprotobuf::EUseSlotType::UseSlotTypeSkill as i32);
    if !is_skill_slot {
        return None;
    }

    let extra = req.extra_data.as_deref()?;
    if extra.is_empty() {
        return None;
    }

    let param = blueprotobuf::UseSkillParam::decode(extra).ok()?;
    let skill_id = SkillId::new(param.skillid?)?;
    Some(ClientSkillCast {
        skill_id,
        slot_id: req.slot_id,
        begin_time_ms: param.begin_time,
        target_uuid: param.target_uuid,
    })
}

fn decode_use_slot_client_skill_cast(data: Bytes) -> Option<StateEvent> {
    let use_slot = match blueprotobuf::UseSlot::decode(data) {
        Ok(v) => v,
        Err(e) => {
            warn!("Error decoding UseSlot.. ignoring: {e}");
            return None;
        }
    };
    use_slot
        .v_request
        .as_ref()
        .and_then(decode_client_skill_cast)
        .map(StateEvent::ClientSkillCast)
}

/// Decodes packet payload into a state event.
fn decode_state_event(op: packets::opcodes::Pkt, data: Bytes) -> Option<StateEvent> {
    match op {
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
                None
            }
            Err(e) => {
                warn!("Error decoding BuffInfoSync.. ignoring: {e}");
                None
            }
        },
        packets::opcodes::Pkt::SyncServerSkillEnd => {
            match blueprotobuf::SyncServerSkillEnd::decode(data) {
                Ok(v) => v
                    .skill_uuid
                    .and_then(SkillId::new)
                    .map(|skill_id| StateEvent::ServerSkillEnd(ServerSkillEnd { skill_id })),
                Err(e) => {
                    warn!("Error decoding SyncServerSkillEnd.. ignoring: {e}");
                    None
                }
            }
        }
        _ => {
            trace!("Unhandled packet opcode: {op:?}");
            None
        }
    }
}

pub fn decode_capture_event(event: CaptureEvent) -> Option<StateEvent> {
    match event {
        CaptureEvent::Notify { key, payload } if key.service_id == WORLD_NTF_SERVICE_ID => {
            let op = match packets::opcodes::Pkt::try_from(key.method_id) {
                Ok(op) => op,
                Err(_) => {
                    trace!("Unhandled WorldNtf method_id={}", key.method_id);
                    return None;
                }
            };
            decode_state_event(op, payload)
        }
        CaptureEvent::Notify { key, payload } if key.service_id == GRPC_TEAM_NTF_SERVICE_ID => {
            decode_team_event(key, payload).map(StateEvent::Team)
        }
        CaptureEvent::Notify { key, .. } => {
            trace!(
                "Unhandled notify service_id={} method_id={}",
                key.service_id, key.method_id
            );
            None
        }
        CaptureEvent::Call { key, payload } if key.service_id == WORLD_CALL_SERVICE_ID => {
            match key.method_id {
                world_call_method::USE_SLOT => decode_use_slot_client_skill_cast(payload),
                method_id => {
                    trace!("Unhandled World Call method_id={method_id}");
                    None
                }
            }
        }
        CaptureEvent::Call { key, .. } => {
            trace!(
                "Unhandled call service_id={} method_id={} call_id={}",
                key.service_id, key.method_id, key.call_id
            );
            None
        }
    }
}

/// Spawn a single decode worker thread that reads `CaptureEvent`s from `rx`,
/// decodes them into `StateEvent`s, and forwards them to `tx`.
///
/// Uses a dedicated OS thread (not a tokio task) so that CPU-heavy protobuf
/// decoding and zstd decompression don't block the tokio runtime.
///
/// ## Counter semantics
///
/// `queue_depth` reflects the number of `StateEvent`s sitting in `state_rx`
/// waiting for `live_main` to consume. It is incremented here **after** a
/// successful `blocking_send`, and decremented by `live_main` on each `recv`.
/// Events that decode to `None` (unhandled opcodes, unknown service IDs, etc.)
/// are silently dropped and never touch the counter.
pub fn spawn_decode_worker(
    rx: tokio::sync::mpsc::Receiver<CaptureEvent>,
    tx: tokio::sync::mpsc::Sender<StateEvent>,
    queue_depth: Arc<AtomicUsize>,
) {
    let mut rx = rx;
    std::thread::Builder::new()
        .name("decode-worker".into())
        .spawn(move || {
            while let Some(event) = rx.blocking_recv() {
                if let Some(state_event) = decode_capture_event(event) {
                    match tx.blocking_send(state_event) {
                        Ok(()) => {
                            queue_depth.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(_) => break,
                    }
                }
            }
            info!(target: "app::live", "decode worker exiting");
        })
        .expect("failed to spawn decode worker thread");
}
