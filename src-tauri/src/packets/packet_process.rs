use crate::packets::opcodes::FragmentType;
use crate::packets::packet_capture::CaptureEvent;
use crate::packets::parser;
use bytes::Bytes;
use log::debug;
use std::sync::atomic::{AtomicUsize, Ordering};

pub fn process_packet(
    frame: &Bytes,
    packet_sender: &tokio::sync::mpsc::UnboundedSender<CaptureEvent>,
    queue_depth: &AtomicUsize,
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
            FragmentType::Notify
            | FragmentType::Call
            | FragmentType::Return
            | FragmentType::Echo => {
                let fragment_type = FragmentType::from(msg_type_id);
                if let Some(notify) = parser::parse_service_fragment(
                    frame,
                    payload_start,
                    payload_end,
                    is_zstd_compressed,
                    fragment_type,
                ) {
                    if let Err(err) = packet_sender.send(CaptureEvent::Notify(notify)) {
                        debug!("Failed to send packet: {err}");
                    } else {
                        queue_depth.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
            FragmentType::FrameDown => {
                if payload_end.saturating_sub(payload_start) < 4 {
                    debug!("FrameDown: payload too short");
                    offset = end;
                    continue;
                }

                let nested_start = payload_start + 4;
                let nested_packet = &buf[nested_start..payload_end];
                if is_zstd_compressed {
                    match zstd::decode_all(nested_packet) {
                        Ok(tcp_fragment_decompressed) => {
                            let nested_bytes = Bytes::from(tcp_fragment_decompressed);
                            process_packet(&nested_bytes, packet_sender, queue_depth);
                        }
                        Err(_e) => {
                            debug!("FrameDown: zstd decompression failed");
                        }
                    }
                } else {
                    let nested_bytes = frame.slice(nested_start..payload_end);
                    process_packet(&nested_bytes, packet_sender, queue_depth);
                }
            }
            _ => {}
        }

        offset = end;
    }
}
