//! Persistence for the voice runtime snapshot (`stores/voiceRuntime.json`).
//!
//! Voice settings are synced independently of `MonitorRuntimeSnapshot` so a
//! volume nudge or a rebound phrase does not re-apply the whole monitor
//! configuration, and so a voice-rule shape change can never reject the
//! monitor config sync.

use log::{info, warn};
use tauri::AppHandle;

use crate::live::store_file::{load_store_json, save_store_json};
use crate::voice::models::VoiceRuntimeSnapshot;

const VOICE_RUNTIME_FILE_NAME: &str = "voiceRuntime.json";

/// Saves an already-normalized snapshot.
pub(crate) fn save_voice_runtime_snapshot(
    app_handle: &AppHandle,
    snapshot: &VoiceRuntimeSnapshot,
) -> Result<(), String> {
    let path = save_store_json(app_handle, VOICE_RUNTIME_FILE_NAME, snapshot)?;
    info!(
        target: "app::voice",
        "saved voice runtime snapshot to {} (enabled={} volume={:.2} rules={})",
        path.display(),
        snapshot.enabled,
        snapshot.volume,
        snapshot.rules.len()
    );
    Ok(())
}

/// Loads and normalizes the persisted snapshot. A missing or unparsable
/// file yields `None`; the caller falls back to defaults (voice disabled)
/// and the frontend re-syncs the real settings shortly after startup.
pub(crate) fn load_voice_runtime_snapshot(app_handle: &AppHandle) -> Option<VoiceRuntimeSnapshot> {
    let (path, mut snapshot) =
        load_store_json::<VoiceRuntimeSnapshot>(app_handle, VOICE_RUNTIME_FILE_NAME)?;
    let raw_rules = snapshot.rules.len();
    snapshot.normalize();
    if snapshot.rules.len() != raw_rules && snapshot.enabled {
        warn!(
            target: "app::voice",
            "voice runtime snapshot {} dropped {} invalid rule(s)",
            path.display(),
            raw_rules - snapshot.rules.len()
        );
    }
    info!(
        target: "app::voice",
        "loaded voice runtime snapshot from {} (enabled={} volume={:.2} rules={})",
        path.display(),
        snapshot.enabled,
        snapshot.volume,
        snapshot.rules.len()
    );
    Some(snapshot)
}

#[cfg(test)]
mod tests {
    use crate::voice::models::{
        AlertKind, VoiceEvent, VoiceQueuePolicy, VoiceRule, VoiceRuntimeSnapshot, VoiceSubject,
        VoiceTrigger,
    };

    #[test]
    fn snapshot_round_trips_through_json() {
        let snapshot = VoiceRuntimeSnapshot {
            enabled: true,
            volume: 0.4,
            queue_policy: VoiceQueuePolicy::InterruptForHigherPriority,
            rules: vec![VoiceRule {
                id: "voice:alert:matchReady".to_string(),
                enabled: true,
                trigger: VoiceTrigger::new(
                    VoiceSubject::Alert {
                        alert: AlertKind::MatchmakingPopped,
                    },
                    VoiceEvent::Started,
                ),
                phrase_id: "p1".to_string(),
                priority: 3,
                cooldown_ms: 100,
                phrase_id_by_tier: None,
            }],
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(json.contains(r#""subject":{"kind":"alert","alert":"matchmakingPopped"}"#));
        assert!(json.contains(r#""event":{"kind":"started"}"#));
        let parsed: VoiceRuntimeSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.rules.len(), 1);
        assert_eq!(parsed.rules[0].trigger, snapshot.rules[0].trigger);
        assert_eq!(parsed.queue_policy, snapshot.queue_policy);
    }

    #[test]
    fn missing_fields_default_to_disabled() {
        let parsed: VoiceRuntimeSnapshot = serde_json::from_str("{}").unwrap();
        assert!(!parsed.enabled);
        assert!(parsed.rules.is_empty());
    }
}
