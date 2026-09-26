//! Offline voice broadcasting and voice-cloning service. `service.rs` owns
//! the [`VoiceService`] shell; behaviour lives in the sibling feature modules
//! (`playback`, `phrases`, `generation`, `model_lifecycle`, `operation`).

pub mod audio;
pub mod catalog;
pub mod commands;
pub mod error;
pub mod finetuned;
pub mod generation;
pub mod generator;
pub mod import;
pub mod model_lifecycle;
pub mod model_manager;
pub mod models;
mod operation;
pub(crate) mod phrase_name;
pub mod phrases;
mod playback;
pub mod player;
pub mod presets;
pub mod prompts;
pub mod service;
#[cfg(test)]
mod test_support;
pub mod types;

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub use generation::{
    GenerateItemRequest, GenerateRequest, GenerationSummary, ProfileSelection, ProfileSelectionNew,
    VoiceSourceSelection,
};
pub use phrases::ImportTarget;
pub use service::VoiceService;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}

fn new_id(prefix: &str) -> String {
    let sequence = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}_{sequence}", now_ms())
}
