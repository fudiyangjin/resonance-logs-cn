use crate::packets::opcodes::NotifyKey;
use bytes::Bytes;
use log::debug;

/// Parse a single notify fragment from a frame slice and return opcode + payload.
pub fn parse_notify_fragment(
    frame: &Bytes,
    payload_start: usize,
    payload_end: usize,
    compressed: bool,
) -> Option<(NotifyKey, Bytes)> {
    let payload = frame.get(payload_start..payload_end)?;
    if payload.len() < 16 {
        debug!("Notify: payload too short: {}", payload.len());
        return None;
    }

    let service_uuid = u64::from_be_bytes(payload[0..8].try_into().ok()?);
    // read and ignore stub id (4 bytes)
    let _stub_id = u32::from_be_bytes(payload[8..12].try_into().ok()?);
    let method_id_raw = u32::from_be_bytes(payload[12..16].try_into().ok()?);

    let key = NotifyKey {
        service_id: service_uuid,
        method_id: method_id_raw,
    };

    if compressed {
        match zstd::decode_all(&payload[16..]) {
            Ok(decoded) => Some((key, Bytes::from(decoded))),
            Err(e) => {
                debug!("Notify: zstd decompression failed: {e}");
                None
            }
        }
    } else {
        Some((key, frame.slice(payload_start + 16..payload_end)))
    }
}
