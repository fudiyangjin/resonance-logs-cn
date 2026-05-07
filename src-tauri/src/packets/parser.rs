use crate::packets::opcodes::{FragmentType, Pkt};
use bytes::Bytes;
use log::debug;

pub const WORLD_NTF_SERVICE_ID: u64 = 0x0000000063335342;
pub const CHIT_CHAT_NTF_SERVICE_ID: u64 = 164931432;
pub const GRPC_TEAM_NTF_SERVICE_ID: u64 = 0x00000000399fca69;
pub const SOCIAL_NTF_SERVICE_ID: u64 = 0xffff_ffff_ffff_ff01;
pub const UNION_NTF_SERVICE_ID: u64 = 0xffff_ffff_ffff_ff02;
pub const MATCH_NTF_SERVICE_ID: u64 = 0xffff_ffff_ffff_ff03;

#[derive(Clone, Debug)]
pub struct ParsedNotifyFragment {
    pub fragment_type: FragmentType,
    pub service_id: u64,
    pub method_id: u32,
    pub payload: Bytes,
    pub recognized_pkt: Option<Pkt>,
}

pub fn parse_service_fragment(
    frame: &Bytes,
    payload_start: usize,
    payload_end: usize,
    compressed: bool,
    fragment_type: FragmentType,
) -> Option<ParsedNotifyFragment> {
    let payload = frame.get(payload_start..payload_end)?;
    if payload.len() < 16 {
        debug!("Service fragment too short: {}", payload.len());
        return None;
    }

    let service_id = u64::from_be_bytes(payload[0..8].try_into().ok()?);
    let _stub_id = u32::from_be_bytes(payload[8..12].try_into().ok()?);
    let method_id = u32::from_be_bytes(payload[12..16].try_into().ok()?);

    let payload = if compressed {
        match zstd::decode_all(&payload[16..]) {
            Ok(decoded) => Bytes::from(decoded),
            Err(error) => {
                debug!("Service fragment zstd decompression failed: {error}");
                return None;
            }
        }
    } else {
        frame.slice(payload_start + 16..payload_end)
    };

    let recognized_pkt = if service_id == WORLD_NTF_SERVICE_ID {
        Pkt::try_from(method_id).ok()
    } else {
        None
    };

    Some(ParsedNotifyFragment {
        fragment_type,
        service_id,
        method_id,
        payload,
        recognized_pkt,
    })
}
