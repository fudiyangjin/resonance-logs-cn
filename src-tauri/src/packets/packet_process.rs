use crate::packets::opcodes::CaptureEvent;
use crate::packets::opcodes::FragmentType;
use crate::packets::parser;
use bytes::Bytes;
use log::{debug, warn};
use std::sync::atomic::{AtomicUsize, Ordering};

const DROP_LOG_INTERVAL: usize = 500;

fn try_send_capture_event(
    packet_sender: &tokio::sync::mpsc::Sender<CaptureEvent>,
    dropped_total: &AtomicUsize,
    event: CaptureEvent,
) {
    match packet_sender.try_send(event) {
        Ok(()) => {}
        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
            let n = dropped_total.fetch_add(1, Ordering::Relaxed) + 1;
            if n % DROP_LOG_INTERVAL == 1 {
                warn!(
                    target: "app::capture",
                    "capture channel full, dropped_total={n}"
                );
            }
        }
        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
            debug!("capture channel closed");
        }
    }
}

fn process_nested_frame(
    frame: &Bytes,
    payload_start: usize,
    payload_end: usize,
    is_zstd_compressed: bool,
    packet_sender: &tokio::sync::mpsc::Sender<CaptureEvent>,
    dropped_total: &AtomicUsize,
) {
    if payload_end.saturating_sub(payload_start) < 4 {
        debug!("Nested frame: payload too short");
        return;
    }

    let nested_start = payload_start + 4;
    let nested_packet = &frame.as_ref()[nested_start..payload_end];
    if is_zstd_compressed {
        match zstd::decode_all(nested_packet) {
            Ok(tcp_fragment_decompressed) => {
                let nested_bytes = Bytes::from(tcp_fragment_decompressed);
                process_packet(&nested_bytes, packet_sender, dropped_total);
            }
            Err(_e) => {
                debug!("Nested frame: zstd decompression failed");
            }
        }
    } else {
        let nested_bytes = frame.slice(nested_start..payload_end);
        process_packet(&nested_bytes, packet_sender, dropped_total);
    }
}

pub fn process_packet(
    frame: &Bytes,
    packet_sender: &tokio::sync::mpsc::Sender<CaptureEvent>,
    dropped_total: &AtomicUsize,
) {
    let mut offset = 0usize;
    let buf = frame.as_ref();

    while offset + 6 <= buf.len() {
        let size_bytes = match buf.get(offset..offset + 4) {
            Some(v) => v,
            None => break,
        };
        let packet_size = u32::from_be_bytes(match size_bytes.try_into() {
            Ok(v) => v,
            Err(_) => break,
        }) as usize;

        if packet_size < 6 {
            debug!("Malformed packet: packet_size < 6");
            break;
        }
        let end = match offset.checked_add(packet_size) {
            Some(v) => v,
            None => break,
        };
        if end > buf.len() {
            break;
        }

        let packet_type = u16::from_be_bytes(match buf[offset + 4..offset + 6].try_into() {
            Ok(v) => v,
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
                    try_send_capture_event(
                        packet_sender,
                        dropped_total,
                        CaptureEvent::Notify { key, payload },
                    );
                }
            }
            FragmentType::Call => {
                if let Some((key, payload)) = parser::parse_call_fragment(
                    frame,
                    payload_start,
                    payload_end,
                    is_zstd_compressed,
                ) {
                    try_send_capture_event(
                        packet_sender,
                        dropped_total,
                        CaptureEvent::Call { key, payload },
                    );
                }
            }
            FragmentType::FrameDown | FragmentType::FrameUp => {
                process_nested_frame(
                    frame,
                    payload_start,
                    payload_end,
                    is_zstd_compressed,
                    packet_sender,
                    dropped_total,
                );
            }
            _ => {}
        }

        offset = end;
    }
}
