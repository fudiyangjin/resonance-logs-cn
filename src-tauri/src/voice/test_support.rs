//! Fixtures shared by the `voice::*` unit tests.

#![allow(dead_code)]

use super::model_manager::{self, InstallReceipt, ModelValidationFingerprint};
use super::models::{VoiceAssetMeta, VoicePhraseMeta};

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
