//! Fixtures shared by the `voice::*` unit tests.

#![allow(dead_code)]

use std::io::{Read as _, Write as _};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

use super::model_manager::{self, InstallReceipt, ModelValidationFingerprint};
use super::models::{VoiceAssetMeta, VoicePhraseMeta};

/// Answers successive loopback connections with `responses`, one raw HTTP
/// response each, then exits. Returns the server's base URL.
pub(super) fn serve_sequence(responses: Vec<Vec<u8>>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        for response in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            read_request(&mut stream);
            stream.write_all(&response).unwrap();
            stream.flush().unwrap();
        }
    });
    (format!("http://{address}"), handle)
}

/// Consumes one request (headers plus a `Content-Length` body) so the
/// client never sees its connection reset mid-send.
fn read_request(stream: &mut TcpStream) {
    let mut request = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let count = stream.read(&mut buffer).unwrap();
        if count == 0 {
            return;
        }
        request.extend_from_slice(&buffer[..count]);
        let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") else {
            continue;
        };
        let headers = String::from_utf8_lossy(&request[..header_end]).to_ascii_lowercase();
        let body_len = headers
            .lines()
            .find_map(|line| line.strip_prefix("content-length:"))
            .and_then(|value| value.trim().parse::<usize>().ok())
            .unwrap_or(0);
        if request.len() >= header_end + 4 + body_len {
            return;
        }
    }
}

pub(super) fn phrase_stub(id: &str, active_asset_id: Option<&str>) -> VoicePhraseMeta {
    VoicePhraseMeta {
        id: id.to_string(),
        active_asset_id: active_asset_id.map(str::to_string),
        ..VoicePhraseMeta::default()
    }
}

pub(super) fn asset_stub(id: &str, phrase_id: &str, created_at_ms: i64) -> VoiceAssetMeta {
    VoiceAssetMeta {
        id: id.to_string(),
        phrase_id: phrase_id.to_string(),
        created_at_ms,
        ..VoiceAssetMeta::default()
    }
}

pub(super) fn test_receipt() -> InstallReceipt {
    InstallReceipt {
        schema_version: 1,
        model_version: "test-v1".to_string(),
        manifest_sha256: None,
        source: "test".to_string(),
        installed_at_ms: 0,
        files: vec![model_manager::InstallReceiptFile {
            name: "model.gguf".to_string(),
            size_bytes: 1,
            sha256: "a".repeat(64),
        }],
    }
}

pub(super) fn test_fingerprint(receipt_sha256: &str) -> ModelValidationFingerprint {
    ModelValidationFingerprint {
        receipt_sha256: receipt_sha256.to_string(),
        files: Vec::new(),
    }
}
