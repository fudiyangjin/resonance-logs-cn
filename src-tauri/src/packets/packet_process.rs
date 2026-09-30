use crate::live::runtime::events::{
    CaptureEnvelope, PacketDirection, PacketKey, monotonic_now_ns, wall_now_ms,
};
use crate::packets::game_connections::Distribution;
use crate::packets::opcodes::{CaptureEvent, FragmentType};
use crate::packets::parser;
use bytes::Bytes;
use log::debug;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// Reserved ingress keys for facts produced by TCP reassembly rather than a
/// game opcode. They still travel through the ordered capture/decode pipeline.
pub const SYNTHETIC_STREAM_GAP_OPCODE: u32 = u32::MAX - 1;
pub const SYNTHETIC_REASSEMBLY_RESET_OPCODE: u32 = u32::MAX - 2;
pub const SYNTHETIC_DECODE_ISSUE_OPCODE: u32 = u32::MAX - 3;
/// The owning game process of a stream was identified. Payload: one
/// [`Distribution::code`](crate::packets::game_connections::Distribution::code) byte.
pub const SYNTHETIC_GAME_CLIENT_OPCODE: u32 = u32::MAX - 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CaptureDecodeIssueCategory {
    Malformed = 0,
    Truncated = 1,
}

const BACKPRESSURE_POLL_INTERVAL: Duration = Duration::from_millis(1);
pub(crate) const CAPTURE_PIPELINE_FENCE: usize = 1 << (usize::BITS - 1);

/// Assigns capture-time ordering and clocks before an event can wait in the
/// decode queue. A single emitter is owned by the capture thread, so sequence
/// allocation does not require atomics and exactly matches enqueue order.
pub struct CaptureEmitter {
    sender: mpsc::Sender<CaptureEnvelope>,
    cancellation: CancellationToken,
    outstanding: Arc<AtomicUsize>,
    next_sequence: u64,
}

impl CaptureEmitter {
    pub fn new(
        sender: mpsc::Sender<CaptureEnvelope>,
        cancellation: CancellationToken,
        outstanding: Arc<AtomicUsize>,
    ) -> Self {
        Self {
            sender,
            cancellation,
            outstanding,
            next_sequence: 1,
        }
    }

    pub fn is_stopped(&self) -> bool {
        self.cancellation.is_cancelled() || self.sender.is_closed()
    }

    /// Emits a decoded frame with bounded backpressure. Queue saturation never
    /// silently drops a packet; cancellation or receiver shutdown is the only
    /// way an accepted capture loop stops waiting.
    pub fn emit(&mut self, stream_id: u64, stream_epoch: u64, event: CaptureEvent) -> bool {
        let (direction, key, payload) = match event {
            CaptureEvent::Notify { key, payload } => (
                PacketDirection::ServerToClient,
                PacketKey {
                    opcode: key.method_id,
                    service_id: u32::try_from(key.service_id).ok(),
                    method_id: Some(key.method_id),
                },
                payload,
            ),
            CaptureEvent::Call { key, payload } => (
                PacketDirection::ClientToServer,
                PacketKey {
                    opcode: key.method_id,
                    service_id: u32::try_from(key.service_id).ok(),
                    method_id: Some(key.method_id),
                },
                payload,
            ),
        };
        self.emit_envelope(stream_id, stream_epoch, direction, key, payload)
    }

    pub fn emit_stream_gap(
        &mut self,
        stream_id: u64,
        stream_epoch: u64,
        expected_sequence: u32,
        observed_sequence: u32,
    ) -> bool {
        let mut payload = Vec::with_capacity(8);
        payload.extend_from_slice(&expected_sequence.to_be_bytes());
        payload.extend_from_slice(&observed_sequence.to_be_bytes());
        self.emit_envelope(
            stream_id,
            stream_epoch,
            PacketDirection::ServerToClient,
            PacketKey {
                opcode: SYNTHETIC_STREAM_GAP_OPCODE,
                service_id: None,
                method_id: None,
            },
            Bytes::from(payload),
        )
    }

    pub fn emit_reassembly_reset(&mut self, stream_id: u64, stream_epoch: u64) -> bool {
        self.emit_envelope(
            stream_id,
            stream_epoch,
            PacketDirection::ServerToClient,
            PacketKey {
                opcode: SYNTHETIC_REASSEMBLY_RESET_OPCODE,
                service_id: None,
                method_id: None,
            },
            Bytes::new(),
        )
    }

    pub fn emit_game_client(
        &mut self,
        stream_id: u64,
        stream_epoch: u64,
        distribution: Distribution,
    ) -> bool {
        self.emit_envelope(
            stream_id,
            stream_epoch,
            PacketDirection::ServerToClient,
            PacketKey {
                opcode: SYNTHETIC_GAME_CLIENT_OPCODE,
                service_id: None,
                method_id: None,
            },
            Bytes::from(vec![distribution.code()]),
        )
    }

    pub fn emit_decode_issue(
        &mut self,
        stream_id: u64,
        stream_epoch: u64,
        original_opcode: Option<u32>,
        category: CaptureDecodeIssueCategory,
    ) -> bool {
        let mut payload = Vec::with_capacity(5);
        payload.push(category as u8);
        payload.extend_from_slice(&original_opcode.unwrap_or_default().to_be_bytes());
        self.emit_envelope(
            stream_id,
            stream_epoch,
            PacketDirection::ServerToClient,
            PacketKey {
                opcode: SYNTHETIC_DECODE_ISSUE_OPCODE,
                service_id: None,
                method_id: None,
            },
            Bytes::from(payload),
        )
    }

    fn emit_envelope(
        &mut self,
        stream_id: u64,
        stream_epoch: u64,
        direction: PacketDirection,
        key: PacketKey,
        payload: Bytes,
    ) -> bool {
        if !reserve_outstanding(&self.outstanding, &self.cancellation) {
            return false;
        }
        let sequence = self.next_sequence;
        self.next_sequence = self.next_sequence.saturating_add(1);
        let captured_mono_ns = monotonic_now_ns();
        let captured_wall_ms = wall_now_ms();
        let mut envelope = CaptureEnvelope {
            capture_sequence: sequence,
            stream_id,
            stream_epoch,
            captured_wall_ms,
            captured_mono_ns,
            direction,
            key,
            payload,
        };

        loop {
            if self.cancellation.is_cancelled() {
                self.outstanding.fetch_sub(1, Ordering::Release);
                return false;
            }
            match self.sender.try_send(envelope) {
                Ok(()) => return true,
                Err(mpsc::error::TrySendError::Full(returned)) => {
                    envelope = returned;
                    std::thread::sleep(BACKPRESSURE_POLL_INTERVAL);
                }
                Err(mpsc::error::TrySendError::Closed(_)) => {
                    self.outstanding.fetch_sub(1, Ordering::Release);
                    return false;
                }
            }
        }
    }
}

fn reserve_outstanding(outstanding: &AtomicUsize, cancellation: &CancellationToken) -> bool {
    loop {
        if cancellation.is_cancelled() {
            return false;
        }
        let current = outstanding.load(Ordering::Acquire);
        if current & CAPTURE_PIPELINE_FENCE != 0 {
            std::thread::sleep(BACKPRESSURE_POLL_INTERVAL);
            continue;
        }
        let Some(next) = current.checked_add(1) else {
            return false;
        };
        if outstanding
            .compare_exchange_weak(current, next, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            return true;
        }
    }
}

fn process_nested_frame(
    frame: &Bytes,
    payload_start: usize,
    payload_end: usize,
    is_zstd_compressed: bool,
    emitter: &mut CaptureEmitter,
    stream_id: u64,
    stream_epoch: u64,
) {
    if payload_end.saturating_sub(payload_start) < 4 {
        debug!("Nested frame: payload too short");
        emitter.emit_decode_issue(
            stream_id,
            stream_epoch,
            None,
            CaptureDecodeIssueCategory::Truncated,
        );
        return;
    }

    let nested_start = payload_start + 4;
    let nested_packet = &frame.as_ref()[nested_start..payload_end];
    if is_zstd_compressed {
        match zstd::decode_all(nested_packet) {
            Ok(tcp_fragment_decompressed) => {
                let nested_bytes = Bytes::from(tcp_fragment_decompressed);
                process_packet(&nested_bytes, emitter, stream_id, stream_epoch);
            }
            Err(_error) => {
                debug!("Nested frame: zstd decompression failed");
                emitter.emit_decode_issue(
                    stream_id,
                    stream_epoch,
                    None,
                    CaptureDecodeIssueCategory::Malformed,
                );
            }
        }
    } else {
        let nested_bytes = frame.slice(nested_start..payload_end);
        process_packet(&nested_bytes, emitter, stream_id, stream_epoch);
    }
}

pub fn process_packet(
    frame: &Bytes,
    emitter: &mut CaptureEmitter,
    stream_id: u64,
    stream_epoch: u64,
) {
    let mut offset = 0usize;
    let buf = frame.as_ref();

    while offset + 6 <= buf.len() && !emitter.is_stopped() {
        let size_bytes = match buf.get(offset..offset + 4) {
            Some(value) => value,
            None => break,
        };
        let packet_size = u32::from_be_bytes(match size_bytes.try_into() {
            Ok(value) => value,
            Err(_) => break,
        }) as usize;

        if packet_size < 6 {
            debug!("Malformed packet: packet_size < 6");
            emitter.emit_decode_issue(
                stream_id,
                stream_epoch,
                None,
                CaptureDecodeIssueCategory::Malformed,
            );
            break;
        }
        let end = match offset.checked_add(packet_size) {
            Some(value) => value,
            None => break,
        };
        if end > buf.len() {
            emitter.emit_decode_issue(
                stream_id,
                stream_epoch,
                None,
                CaptureDecodeIssueCategory::Truncated,
            );
            break;
        }

        let packet_type = u16::from_be_bytes(match buf[offset + 4..offset + 6].try_into() {
            Ok(value) => value,
            Err(_) => break,
        });
        let is_zstd_compressed = (packet_type & 0x8000) != 0;
        let msg_type_id = packet_type & 0x7fff;
        let payload_start = offset + 6;
        let payload_end = end;

        match FragmentType::from(msg_type_id) {
            FragmentType::Notify => {
                if let Some((key, payload)) = parser::parse_notify_fragment(
                    frame,
                    payload_start,
                    payload_end,
                    is_zstd_compressed,
                ) {
                    if !emitter.emit(
                        stream_id,
                        stream_epoch,
                        CaptureEvent::Notify { key, payload },
                    ) {
                        return;
                    }
                } else if !emitter.emit_decode_issue(
                    stream_id,
                    stream_epoch,
                    None,
                    CaptureDecodeIssueCategory::Malformed,
                ) {
                    return;
                }
            }
            FragmentType::Call => {
                if let Some((key, payload)) = parser::parse_call_fragment(
                    frame,
                    payload_start,
                    payload_end,
                    is_zstd_compressed,
                ) {
                    if !emitter.emit(stream_id, stream_epoch, CaptureEvent::Call { key, payload }) {
                        return;
                    }
                } else if !emitter.emit_decode_issue(
                    stream_id,
                    stream_epoch,
                    None,
                    CaptureDecodeIssueCategory::Malformed,
                ) {
                    return;
                }
            }
            FragmentType::FrameDown | FragmentType::FrameUp => {
                process_nested_frame(
                    frame,
                    payload_start,
                    payload_end,
                    is_zstd_compressed,
                    emitter,
                    stream_id,
                    stream_epoch,
                );
            }
            _ => {}
        }

        offset = end;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::packets::opcodes::NotifyKey;

    #[test]
    fn emitter_assigns_order_and_capture_time_before_queueing() {
        let cancellation = CancellationToken::new();
        let (sender, mut receiver) = mpsc::channel(2);
        let outstanding = Arc::new(AtomicUsize::new(0));
        let mut emitter = CaptureEmitter::new(sender, cancellation, Arc::clone(&outstanding));

        let payload = Bytes::from_static(&[1, 2, 3]);
        let payload_ptr = payload.as_ptr();
        assert!(emitter.emit(
            7,
            2,
            CaptureEvent::Notify {
                key: NotifyKey {
                    service_id: 7,
                    method_id: 11,
                },
                payload,
            }
        ));
        assert!(emitter.emit_stream_gap(7, 2, 100, 120));

        let first = receiver.blocking_recv().expect("first envelope");
        let second = receiver.blocking_recv().expect("second envelope");
        assert_eq!(first.capture_sequence, 1);
        assert_eq!(second.capture_sequence, 2);
        assert!(second.captured_mono_ns >= first.captured_mono_ns);
        assert_eq!(first.stream_id, 7);
        assert_eq!(first.stream_epoch, 2);
        assert_eq!(first.key.opcode, 11);
        assert_eq!(first.payload.as_ptr(), payload_ptr);
        assert_eq!(second.key.opcode, SYNTHETIC_STREAM_GAP_OPCODE);
        assert_eq!(outstanding.load(Ordering::Acquire), 2);
    }

    #[test]
    fn cancellation_stops_backpressure_without_dropping_a_queued_event() {
        let cancellation = CancellationToken::new();
        let (sender, _receiver) = mpsc::channel(1);
        let outstanding = Arc::new(AtomicUsize::new(0));
        let mut emitter =
            CaptureEmitter::new(sender, cancellation.clone(), Arc::clone(&outstanding));
        assert!(emitter.emit_reassembly_reset(7, 1));
        cancellation.cancel();
        assert!(!emitter.emit_reassembly_reset(7, 1));
        assert_eq!(outstanding.load(Ordering::Acquire), 1);
    }
}
