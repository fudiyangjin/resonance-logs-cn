//! Shared data types for the voice (TTS) feature: on-disk catalog entries,
//! runtime rule definitions, and the JSON contracts used to talk to the
//! `qwen3-tts-sidecar` batch process.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::http_tts::HttpProviderMeta;
use super::presets::VoicePresetTag;

pub const VOICE_CATALOG_SCHEMA_VERSION: u32 = 3;
pub const SIDECAR_PROTOCOL_VERSION: u32 = 3;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum VoiceGenerationBackend {
    #[default]
    Auto,
    Cpu,
    Vulkan,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EngineBackend {
    Cpu,
    Vulkan,
}

impl EngineBackend {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            Self::Vulkan => "vulkan",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EngineDeviceType {
    Cpu,
    DiscreteGpu,
    IntegratedGpu,
    Accelerator,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineDevice {
    pub backend: EngineBackend,
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: EngineDeviceType,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum VoiceLanguage {
    #[default]
    ZhCn,
    EnUs,
    JaJp,
}

impl VoiceLanguage {
    /// The serialized name, as the frontend spells it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ZhCn => "zhCn",
            Self::EnUs => "enUs",
            Self::JaJp => "jaJp",
        }
    }

    pub fn sidecar_id(self) -> i32 {
        match self {
            Self::ZhCn => 2055,
            Self::EnUs => 2050,
            Self::JaJp => 2058,
        }
    }
}

/// A persisted speaker profile (voice clone), backed by a `.q3sp` file on disk.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceProfileMeta {
    pub id: String,
    pub name: String,
    pub created_at_ms: i64,
    pub model_version: String,
    pub embedding_dim: u32,
    pub model_sha256: String,
    pub ref_audio_sha256: String,
    /// Whether the original reference WAV was kept on disk (opt-in).
    pub ref_audio_retained: bool,
    /// Set when this profile was auto-created from a bundled preset
    /// reference (see `voice::presets`) rather than audio the user
    /// supplied, so generation can detect a stale preset (bundled asset
    /// revision bumped) and re-extract instead of silently reusing
    /// outdated audio. `None` for user-provided clone profiles.
    pub preset: Option<VoicePresetTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FineTunedVoiceMeta {
    pub package_path: String,
    pub transformer_path: String,
    pub display_name: String,
    pub speaker_name: String,
    pub speaker_token_id: i32,
    pub model_sha256: String,
    pub size_bytes: u64,
    pub quantization: String,
    pub tokenizer_abi: String,
    pub imported_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct FineTunedModelInspection {
    pub architecture: String,
    pub model_type: String,
    pub speaker_name: String,
    pub speaker_token_id: i32,
    pub tokenizer_abi: String,
    pub tensor_count: u32,
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum FineTunedVoiceState {
    #[default]
    NotConfigured,
    Ready {
        voice: FineTunedVoiceMeta,
    },
    Missing {
        voice: FineTunedVoiceMeta,
    },
    Modified {
        voice: FineTunedVoiceMeta,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum VoiceAssetSource {
    CloneProfile {
        #[specta(rename = "profileId")]
        profile_id: String,
    },
    FineTuned {
        #[specta(rename = "modelSha256")]
        model_sha256: String,
        #[specta(rename = "speakerName")]
        speaker_name: String,
        #[specta(rename = "speakerTokenId")]
        speaker_token_id: i32,
    },
    /// A final, ready-to-play WAV shipped with the application.
    BundledPrompt {
        key: String,
        locale: super::presets::VoicePresetLocale,
        revision: u32,
    },
    /// A user-supplied audio clip imported through the phrase library and
    /// normalized to the catalog WAV format. Never regenerated and never
    /// marked stale by phrase text/model changes.
    Imported {
        sha256: String,
        #[specta(rename = "originalFileName")]
        original_file_name: String,
    },
    /// Synthesized by a user-configured HTTP TTS provider. Goes stale when
    /// the provider's request shape changes (`config_fingerprint`) or the
    /// provider is removed, like any other text-derived take.
    Http {
        #[specta(rename = "providerId")]
        provider_id: String,
        #[specta(rename = "configFingerprint")]
        config_fingerprint: String,
    },
}

/// `model_version` recorded on imported assets (no TTS model involved).
pub const IMPORTED_MODEL_VERSION: &str = "imported";

/// `model_version` recorded on assets synthesized by an HTTP provider.
pub const HTTP_MODEL_VERSION: &str = "http";

impl VoiceAssetSource {
    /// True for audio that did not come out of the TTS pipeline: imported
    /// clips and bundled prompts. External audio is never regenerated and
    /// never goes stale when the phrase text, language or model changes.
    pub fn is_external(&self) -> bool {
        matches!(self, Self::Imported { .. } | Self::BundledPrompt { .. })
    }
}

impl Default for VoiceAssetSource {
    fn default() -> Self {
        Self::CloneProfile {
            profile_id: String::new(),
        }
    }
}

/// A fixed phrase (short line) that can be synthesized ahead of time, e.g.
/// "机制来了" / "增益结束".
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct VoicePhraseMeta {
    pub id: String,
    pub name: String,
    pub text: String,
    pub language: VoiceLanguage,
    pub active_asset_id: Option<String>,
    pub updated_at_ms: i64,
}

/// A single generated take (WAV) for a phrase, using a specific profile/model/params.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceAssetMeta {
    pub id: String,
    pub phrase_id: String,
    pub source: VoiceAssetSource,
    pub model_version: String,
    /// Fingerprint of (text, language, profile version, model sha, generation params).
    /// Used to detect staleness without storing absolute paths in rules.
    pub params_fingerprint: String,
    pub created_at_ms: i64,
    pub duration_sec: f64,
    pub sample_rate: i32,
    /// True when the phrase/profile/model changed after this asset was generated.
    pub stale: bool,
}

/// The full persisted voice catalog (`catalog.json`).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceCatalog {
    pub schema_version: u32,
    pub profiles: Vec<VoiceProfileMeta>,
    pub phrases: Vec<VoicePhraseMeta>,
    pub assets: Vec<VoiceAssetMeta>,
    pub installed_model_version: Option<String>,
    pub installed_model_sha256: Option<String>,
    pub fine_tuned_voice: Option<FineTunedVoiceMeta>,
    pub http_providers: Vec<HttpProviderMeta>,
}

/// Which caster population a monster-buff voice rule observes.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum MonsterBuffSourceScope {
    AnySource,
    LocalPlayerSource,
}

/// Whose summons an entity-duration voice rule observes. Mirrors the
/// frontend `EntityDurationScope` (`"self" | "any"`).
#[derive(
    Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, PartialOrd, Ord, Hash, Default,
)]
#[serde(rename_all = "camelCase")]
pub enum EntityOwnerScope {
    /// Only entities owned by the local player.
    #[serde(rename = "self")]
    LocalPlayer,
    /// Every entity with the monster id, regardless of owner.
    #[default]
    Any,
}

impl EntityOwnerScope {
    /// The serialized name, as the frontend spells it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::LocalPlayer => "self",
            Self::Any => "any",
        }
    }
}

/// Game-wide alerts that can carry a voice cue.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AlertKind {
    /// The matchmaking queue popped and is waiting for acceptance.
    MatchmakingPopped,
    /// The party leader started a ready check.
    ReadyCheckStarted,
    /// A team activity vote started.
    TeamVoteStarted,
}

/// *What* a voice rule observes. Combined with a [`VoiceEvent`] this forms a
/// [`VoiceTrigger`]; not every pairing is meaningful, see
/// [`VoiceTrigger::validate`].
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum VoiceSubject {
    /// A buff (by base id) on the local player.
    Buff {
        #[serde(rename = "buffId")]
        buff_id: i32,
    },
    /// A buff (by base id) on the current attack target, filtered by who
    /// applied it.
    MonsterBuff {
        #[serde(rename = "buffId")]
        buff_id: i32,
        #[serde(rename = "sourceScope")]
        source_scope: MonsterBuffSourceScope,
    },
    /// One of the local player's skills, by base skill id
    /// (`skill_level_id / 100`). `Started` = cast, `Ended` = a charge is
    /// ready (every refill counts), `ExpiringIn` = the next charge is ready
    /// in N seconds.
    Skill {
        #[serde(rename = "skillId")]
        skill_id: i32,
    },
    /// A watched entity (by monster id) from the entity-duration list.
    /// `Started` = appeared, `Ended` = gone, `ExpiringIn` = configured
    /// duration runs out in N seconds.
    Entity {
        #[serde(rename = "monsterId")]
        monster_id: i32,
        scope: EntityOwnerScope,
    },
    /// A boss "DBM" mechanic world event with this base skill id.
    BossDbm {
        #[serde(rename = "baseSkillId")]
        base_skill_id: i32,
    },
    /// A skill on the monster-skill watch list. `Started` = any nearby
    /// monster cast it.
    MonsterSkill {
        #[serde(rename = "skillId")]
        skill_id: i32,
    },
    /// One effect slot of a counter rule.
    Counter {
        #[serde(rename = "ruleId")]
        rule_id: i32,
        #[serde(rename = "slotId")]
        slot_id: i32,
    },
    /// A game-wide alert.
    Alert { alert: AlertKind },
}

/// *When* a voice rule fires relative to its subject.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum VoiceEvent {
    /// Buff gained / mechanic fired / alert raised.
    Started,
    /// Buff lost (all layers).
    Ended,
    /// The subject's timer will run out in `seconds_before` seconds.
    ExpiringIn {
        #[serde(rename = "secondsBefore")]
        seconds_before: u32,
    },
    /// A counter slot reached its effective threshold.
    Threshold,
}

/// Which real-time game event should trigger a voice cue.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTrigger {
    pub subject: VoiceSubject,
    pub event: VoiceEvent,
}

impl VoiceTrigger {
    pub const fn new(subject: VoiceSubject, event: VoiceEvent) -> Self {
        Self { subject, event }
    }

    /// Rejects (subject, event) pairs that no engine path can ever fire, so
    /// they are dropped at config time instead of silently never playing.
    pub fn validate(&self) -> Result<(), String> {
        use VoiceEvent as E;
        use VoiceSubject as S;
        let ok = matches!(
            (&self.subject, &self.event),
            (
                S::Buff { .. } | S::MonsterBuff { .. } | S::Skill { .. } | S::Entity { .. },
                E::Started | E::Ended | E::ExpiringIn { .. }
            ) | (S::BossDbm { .. }, E::Started | E::ExpiringIn { .. })
                | (S::Counter { .. }, E::Threshold | E::ExpiringIn { .. })
                | (S::MonsterSkill { .. } | S::Alert { .. }, E::Started)
        );
        if ok {
            Ok(())
        } else {
            Err(format!(
                "unsupported voice trigger: {:?} does not support {:?}",
                self.subject, self.event
            ))
        }
    }

    /// Lead time for `ExpiringIn` triggers; `None` for edge triggers.
    pub fn seconds_before(&self) -> Option<u32> {
        match self.event {
            VoiceEvent::ExpiringIn { seconds_before } => Some(seconds_before),
            _ => None,
        }
    }
}

/// A user-defined rule mapping a trigger to a phrase to play.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRule {
    pub id: String,
    pub enabled: bool,
    pub trigger: VoiceTrigger,
    pub phrase_id: String,
    /// 0 = lowest, 255 = highest. Higher priority can interrupt lower priority playback.
    pub priority: u8,
    pub cooldown_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phrase_id_by_tier: Option<HashMap<u8, String>>,
}

/// A resolved intent to play a specific phrase, produced by the rule engine and
/// consumed by the playback worker. Carries no absolute paths; the player resolves
/// the active asset for `phrase_id` from the catalog at playback time.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCueIntent {
    pub rule_id: String,
    pub phrase_id: String,
    pub priority: u8,
    pub triggered_at_ms: i64,
    /// How long the cue stays worth playing: a lead cue ("N seconds left")
    /// is stale once the moment it warns about has come. `None` never
    /// expires (edges, and zero-lead cues that *are* that moment).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valid_for_ms: Option<u64>,
}

/// Playback queue policy when the queue is full or a higher priority cue arrives.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum VoiceQueuePolicy {
    /// Drop new low-priority cues when the queue is full.
    #[default]
    DropLowPriority,
    /// Higher priority cues interrupt whatever is currently playing.
    InterruptForHigherPriority,
}

// ---------------------------------------------------------------------------
// Sidecar batch job contract (mirrors docs/SIDECAR_PROTOCOL.md in qwen3-tts.cpp)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SidecarSourceSpec {
    pub mode: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_wav_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub save_q3sp_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_q3sp_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_token_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SidecarItem {
    pub id: String,
    pub text: String,
    pub language_id: i32,
    pub output_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repetition_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_audio_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_duration_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_duration_sec: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SidecarJob {
    pub protocol_version: u32,
    pub transformer_path: String,
    pub tokenizer_path: String,
    pub source: SidecarSourceSpec,
    pub items: Vec<SidecarItem>,
}

/// One line of JSONL emitted by the sidecar on stdout.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SidecarEvent {
    Hello {
        protocol_version: u32,
        engine: String,
        source_commit: String,
        backend: EngineBackend,
        device: String,
    },
    Stage {
        stage: String,
        status: String,
        #[serde(default)]
        elapsed_ms: Option<i64>,
        #[serde(default)]
        embedding_dim: Option<u32>,
        #[serde(default)]
        model_sha256: Option<String>,
        #[serde(default)]
        ref_audio_sha256: Option<String>,
        #[serde(default)]
        error: Option<String>,
    },
    Item {
        id: String,
        status: String,
        #[serde(default)]
        output_path: Option<String>,
        #[serde(default)]
        duration_sec: Option<serde_json::Number>,
        #[serde(default)]
        sample_rate: Option<i32>,
        #[serde(default)]
        elapsed_ms: Option<i64>,
        #[serde(default)]
        error: Option<String>,
    },
    Batch {
        status: String,
        #[serde(default)]
        completed: u32,
        #[serde(default)]
        failed: u32,
    },
    Fatal {
        error: String,
    },
}

/// Progress event forwarded to the frontend while a generation batch runs.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum VoiceGenerationProgress {
    Stage {
        stage: String,
        status: String,
        error: Option<String>,
    },
    Item {
        id: String,
        status: String,
        error: Option<String>,
    },
    Finished {
        completed: u32,
        failed: u32,
    },
    Fatal {
        error: String,
    },
}

/// Persisted + hot-synced runtime settings for the voice feature.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceRuntimeSnapshot {
    pub enabled: bool,
    pub volume: f32,
    pub queue_policy: VoiceQueuePolicy,
    pub rules: Vec<VoiceRule>,
}

pub const MAX_VOICE_RULE_COOLDOWN_MS: u64 = 600_000;

impl VoiceRuntimeSnapshot {
    /// Canonicalizes the snapshot: clamps volume, sorts/dedups rules by id,
    /// caps cooldowns, drops rules whose trigger can never fire (with a
    /// warning) and clears rules entirely when voice is disabled.
    pub fn normalize(&mut self) {
        self.volume = self.volume.clamp(0.0, 1.0);
        self.rules.sort_by(|a, b| a.id.cmp(&b.id));
        self.rules.dedup_by(|a, b| a.id == b.id);
        self.rules.retain(|rule| match rule.trigger.validate() {
            Ok(()) => true,
            Err(reason) => {
                log::warn!(target: "app::voice", "dropping voice rule {}: {reason}", rule.id);
                false
            }
        });
        for rule in &mut self.rules {
            rule.cooldown_ms = rule.cooldown_ms.min(MAX_VOICE_RULE_COOLDOWN_MS);
        }
        if !self.enabled {
            self.rules.clear();
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineProbe {
    pub engine: String,
    pub protocol_version: u32,
    pub source_commit: String,
    pub build_type: String,
    pub variant: String,
    pub stub: bool,
    pub compiled_backends: Vec<EngineBackend>,
    pub devices: Vec<EngineDevice>,
    pub supported_languages: Vec<VoiceLanguage>,
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceBackendStatus {
    pub backend: EngineBackend,
    pub engine: EngineState,
    pub component_version: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceBackendInventory {
    pub cpu: VoiceBackendStatus,
    pub vulkan: VoiceBackendStatus,
    pub recommended: EngineBackend,
}

impl Default for VoiceBackendInventory {
    fn default() -> Self {
        let status = |backend| VoiceBackendStatus {
            backend,
            engine: EngineState::Missing,
            component_version: None,
            update_available: false,
        };
        Self {
            cpu: status(EngineBackend::Cpu),
            vulkan: status(EngineBackend::Vulkan),
            recommended: EngineBackend::Cpu,
        }
    }
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq, Default)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum EngineState {
    #[default]
    Missing,
    Ready {
        probe: EngineProbe,
    },
    Incompatible {
        reason: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq, Default)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum ModelState {
    #[default]
    NotInstalled,
    Installing,
    Ready {
        version: String,
    },
    Corrupt {
        version: String,
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum GenerationState {
    #[default]
    Idle,
    Running,
    Cancelling,
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq, Default)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum VoiceOperationState {
    #[default]
    Idle,
    InstallingModel {
        cancelling: bool,
    },
    ImportingModel,
    VerifyingModel,
    RemovingModel,
    Generating {
        cancelling: bool,
    },
    UpdatingCatalog,
}

impl VoiceOperationState {
    pub fn generation_state(&self) -> GenerationState {
        match self {
            Self::Generating { cancelling: false } => GenerationState::Running,
            Self::Generating { cancelling: true } => GenerationState::Cancelling,
            _ => GenerationState::Idle,
        }
    }
}

/// Overall status snapshot returned to the frontend for the voice feature.
#[derive(Debug, Clone, Serialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub catalog: VoiceCatalog,
    pub model: ModelState,
    pub operation: VoiceOperationState,
    pub generation: GenerationState,
    pub engine: EngineState,
    pub backends: VoiceBackendInventory,
    pub fine_tuned_voice: FineTunedVoiceState,
}

impl Default for VoiceCatalog {
    fn default() -> Self {
        Self {
            schema_version: VOICE_CATALOG_SCHEMA_VERSION,
            profiles: Vec::new(),
            phrases: Vec::new(),
            assets: Vec::new(),
            installed_model_version: None,
            installed_model_sha256: None,
            fine_tuned_voice: None,
            http_providers: Vec::new(),
        }
    }
}
