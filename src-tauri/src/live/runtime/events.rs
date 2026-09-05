//! Protocol-neutral inputs and canonical live-domain events.
//!
//! The packet decoder constructs [`ProtocolBatch`] values. [`EntityContext`]
//! (in the sibling module) is the only reducer that turns those observations
//! into [`DomainEnvelope`] values.

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use bytes::Bytes;

/// Sentinel UUID used by protocol observations that address the local player
/// before the real entity id is known (e.g. SyncToMeDeltaInfo without uuid).
/// [`EntityContext`] resolves it to the current local player on reduce.
pub const LOCAL_PLAYER: EntityUuid = EntityUuid(0);

static MONOTONIC_EPOCH: OnceLock<Instant> = OnceLock::new();

#[must_use]
pub fn monotonic_now_ns() -> u64 {
    let epoch = MONOTONIC_EPOCH.get_or_init(Instant::now);
    u64::try_from(epoch.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

/// Current monotonic clock in milliseconds.
#[must_use]
pub fn monotonic_now_ms() -> MonoTimeMs {
    MonoTimeMs(monotonic_now_ns() / 1_000_000)
}

#[must_use]
pub fn wall_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct MonoTimeMs(pub u64);

impl MonoTimeMs {
    #[must_use]
    pub const fn saturating_add(self, duration_ms: u64) -> Self {
        Self(self.0.saturating_add(duration_ms))
    }

    #[must_use]
    pub const fn saturating_sub(self, duration_ms: u64) -> Self {
        Self(self.0.saturating_sub(duration_ms))
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct BatchId(pub u64);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct SegmentId(pub u64);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct EntityUuid(pub i64);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EntityRef {
    pub uuid: EntityUuid,
    /// Increments when a UUID disappears and later appears again.
    pub generation: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PacketDirection {
    ClientToServer,
    ServerToClient,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub struct PacketKey {
    pub opcode: u32,
    pub service_id: Option<u32>,
    pub method_id: Option<u32>,
}

/// Raw packet captured at ingress. The monotonic timestamp is assigned before
/// decode queueing, so decoder backlog cannot move event-time deadlines.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureEnvelope {
    pub capture_sequence: u64,
    pub stream_id: u64,
    pub stream_epoch: u64,
    pub captured_wall_ms: i64,
    /// Monotonic ingress timestamp in nanoseconds. It is kept at capture
    /// precision and converted to scheduler milliseconds only on demand.
    pub captured_mono_ns: u64,
    pub direction: PacketDirection,
    pub key: PacketKey,
    pub payload: Bytes,
}

impl CaptureEnvelope {
    #[must_use]
    pub const fn event_meta(&self, batch_id: BatchId, source_time_ms: Option<i64>) -> EventMeta {
        EventMeta {
            batch_id,
            capture_sequence: self.capture_sequence,
            stream_id: self.stream_id,
            stream_epoch: self.stream_epoch,
            captured_wall_ms: self.captured_wall_ms,
            captured_mono_ns: self.captured_mono_ns,
            source_time_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventMeta {
    pub batch_id: BatchId,
    pub capture_sequence: u64,
    pub stream_id: u64,
    pub stream_epoch: u64,
    pub captured_wall_ms: i64,
    pub captured_mono_ns: u64,
    /// Optional timestamp supplied by the game/server. It is diagnostic and
    /// presentation data; runtime deadline ordering uses [`EventMeta::mono_ms`].
    pub source_time_ms: Option<i64>,
}

impl EventMeta {
    #[must_use]
    pub const fn mono_ms(self) -> MonoTimeMs {
        MonoTimeMs(self.captured_mono_ns / 1_000_000)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ObservationOrigin {
    Snapshot,
    #[default]
    Delta,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProtocolBatch {
    pub meta: EventMeta,
    pub observations: Vec<ProtocolObservation>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum EntityKind {
    #[default]
    Unknown,
    Character,
    Monster,
    Dummy,
    Bullet,
    SceneObject,
    Other(i32),
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Position {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AttributeValue {
    Int(i64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum FieldPatch<T> {
    #[default]
    Unchanged,
    Set(T),
    Clear,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EntityIdentityPatch {
    pub kind: FieldPatch<EntityKind>,
    pub name: FieldPatch<String>,
    pub monster_id: FieldPatch<i32>,
    pub profession_id: FieldPatch<i32>,
    pub owner_uuid: FieldPatch<EntityUuid>,
    pub fantasy_tier: FieldPatch<u8>,
    pub is_boss: FieldPatch<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EntityIdentity {
    pub kind: EntityKind,
    pub name: Option<String>,
    pub monster_id: Option<i32>,
    pub profession_id: Option<i32>,
    pub owner_uuid: Option<EntityUuid>,
    pub fantasy_tier: Option<u8>,
    pub is_boss: bool,
}

impl EntityIdentity {
    #[must_use]
    pub const fn is_boss_monster(&self) -> bool {
        self.is_boss && matches!(self.kind, EntityKind::Monster)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObservedBuff {
    pub instance_id: i64,
    pub base_id: i32,
    pub layer: i32,
    pub source_uuid: Option<EntityUuid>,
    pub source_config_id: Option<i32>,
    pub duration_ms: Option<u64>,
    pub started_wall_ms: Option<i64>,
    pub expires_wall_ms: Option<i64>,
    pub started_mono_ms: Option<MonoTimeMs>,
    pub expires_mono_ms: Option<MonoTimeMs>,
    pub effect_ids: Arc<[i32]>,
}

/// Wire-level buff delta. The decoder emits raw observations; [`EntityContext`]
/// owns the authoritative buff table and merges `Delta` onto existing instances.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ObservedBuffChange {
    Applied {
        buff: ObservedBuff,
    },
    Delta {
        instance_id: i64,
        layer: Option<i32>,
        duration_ms: Option<u64>,
        create_time: Option<i64>,
        effect_ids: Option<Arc<[i32]>>,
    },
    Remove {
        instance_id: i64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HitKind {
    Damage,
    Healing,
}

/// Which packet channel carried a hit. Taken-damage counters only trust
/// `ToMe` (old pipeline parity: near deltas never fed `DamageTaken`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HitChannel {
    ToMe,
    Near,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObservedHit {
    pub channel: HitChannel,
    pub source_uuid: Option<EntityUuid>,
    pub source_owner_uuid: Option<EntityUuid>,
    pub target_uuid: EntityUuid,
    pub skill_key: i64,
    pub skill_id: Option<i32>,
    pub type_flags: i32,
    pub kind: HitKind,
    pub amount: u128,
    /// Whether the packet supplied an authoritative HP/shield split.
    pub has_loss_breakdown: bool,
    pub hp_loss: u128,
    pub shield_loss: u128,
    /// True when `amount` is only the bonus component from a lucky hit.
    pub is_lucky_bonus_only: bool,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    /// Filled by a combat projection with target HP shadow state. Decoders
    /// should leave this as `None`, especially for healing.
    pub effective_amount: Option<u128>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillPhase {
    CastStarted,
    DurationStarted,
    DurationEnded,
    Completed,
    Observed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SkillCooldownState {
    pub skill_level_id: i32,
    pub begin_time: Option<i64>,
    pub duration: Option<i32>,
    pub cooldown_type: Option<i32>,
    pub valid_time: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ShieldDetail {
    pub buff_instance_id: i64,
    pub display_type: i32,
    pub current: i64,
    pub initial: i64,
    pub max: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolvedShieldDetail {
    pub detail: ShieldDetail,
    pub base_id: Option<i32>,
    pub expires_wall_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PassiveSkillObservation {
    pub entity_uuid: EntityUuid,
    pub passive_instance_id: i32,
    pub skill_id: i32,
    pub target_position: Option<Position>,
    pub ended: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BossMechanicObservation {
    pub base_skill_id: i32,
    pub skill_effect_id: i32,
    pub insertion: i32,
    pub server_timestamp_ms: Option<i64>,
    pub duration_ms: u64,
    pub expires_mono_ms: MonoTimeMs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FantasyState {
    pub summon: EntityRef,
    pub summoner: EntityRef,
    pub monster_id: i32,
    pub remodel_level: i64,
    /// Normalized resonance skill id that summoned this fantasy, when known.
    pub resonance_skill_id: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FantasyTransition {
    Summoned,
    Updated,
    Ended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SegmentReason {
    FirstCombat,
    AutomaticObjective,
    Wipe,
    Manual,
    ContainerResync,
    TrainingStarted,
    TrainingElapsed,
    MaxDurationElapsed,
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GameTimerKey {
    pub cfg_id: i32,
    pub timer_type: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameTimerState {
    pub key: GameTimerKey,
    pub execution_type: i32,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub last_timestamp: Option<i64>,
    pub last_end_timestamp: Option<i64>,
    pub next_timestamp: Option<i64>,
    pub next_end_timestamp: Option<i64>,
    pub offsets: Vec<i32>,
    pub duration_ms: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TimerKind {
    CounterFreeze,
    BuffTick,
    SkillTick,
    VoiceExpiry,
    BossDbmExpiry,
    GameTimer,
    SegmentBoundary,
    SegmentMaxDuration,
    TrainingWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TimerKey {
    CounterFreeze {
        rule_set: u64,
        rule_id: i32,
        slot_id: i32,
    },
    BuffTick {
        rule_set: u64,
        rule_id: i32,
        source_id: u32,
    },
    SkillTick {
        rule_set: u64,
        rule_id: i32,
        source_id: u32,
        caster: EntityRef,
        cast_sequence: u64,
    },
    VoiceExpiry {
        rule_set: u64,
        rule_handle: u64,
        subject: u64,
        instance: u64,
    },
    BossDbmExpiry {
        base_skill_id: i32,
    },
    GameTimer(GameTimerKey),
    SegmentBoundary,
    SegmentMaxDuration {
        segment_id: SegmentId,
    },
    TrainingWindow {
        segment_id: SegmentId,
    },
}

impl TimerKey {
    #[must_use]
    pub const fn kind(self) -> TimerKind {
        match self {
            Self::CounterFreeze { .. } => TimerKind::CounterFreeze,
            Self::BuffTick { .. } => TimerKind::BuffTick,
            Self::SkillTick { .. } => TimerKind::SkillTick,
            Self::VoiceExpiry { .. } => TimerKind::VoiceExpiry,
            Self::BossDbmExpiry { .. } => TimerKind::BossDbmExpiry,
            Self::GameTimer(_) => TimerKind::GameTimer,
            Self::SegmentBoundary => TimerKind::SegmentBoundary,
            Self::SegmentMaxDuration { .. } => TimerKind::SegmentMaxDuration,
            Self::TrainingWindow { .. } => TimerKind::TrainingWindow,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TimerScope {
    Runtime,
    RuleSet(u64),
    Segment(SegmentId),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HateEntry {
    pub entity_uuid: EntityUuid,
    pub value: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LocalTalent {
    pub profession_id: Option<i32>,
    pub talent_stage_cfg_id: Option<i32>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProtocolObservation {
    ContainerReset,
    EntityAppeared {
        uuid: EntityUuid,
        kind: EntityKind,
    },
    EntityDisappeared {
        uuid: EntityUuid,
    },
    IdentityUpdated {
        uuid: EntityUuid,
        patch: EntityIdentityPatch,
    },
    AttributeUpdated {
        uuid: EntityUuid,
        attr_id: i32,
        value: AttributeValue,
        origin: ObservationOrigin,
    },
    HateListUpdated {
        entity_uuid: EntityUuid,
        entries: Vec<HateEntry>,
    },
    PositionUpdated {
        uuid: EntityUuid,
        attr_id: i32,
        position: Position,
        origin: ObservationOrigin,
    },
    BuffSnapshot {
        target_uuid: EntityUuid,
        buffs: Vec<ObservedBuff>,
    },
    BuffChanged {
        target_uuid: EntityUuid,
        change: ObservedBuffChange,
    },
    LocalPlayerChanged {
        uuid: Option<EntityUuid>,
    },
    /// Local player requested a skill cast via client→server UseSkillParam.
    LocalSkillRequested {
        skill_id: i32,
        target_uuid: Option<EntityUuid>,
    },
    /// Server acknowledged local skill completion (SyncServerSkillEnd).
    LocalSkillCompleted {
        skill_id: i32,
    },
    TeamInfoUpdated {
        team_id: i64,
        leader_uuid: Option<EntityUuid>,
    },
    TeamMembersUpdated {
        members: Vec<EntityUuid>,
    },
    TeamMemberLeft {
        member_uuid: EntityUuid,
    },
    TeamDissolved,
    MatchmakingPopped,
    ReadyCheckStarted,
    TeamVoteStarted {
        creator_uuid: Option<EntityUuid>,
    },
    /// Resonance fantasy marker buff observed on a summon. Summoner / monster_id
    /// / remodel_level are resolved from entity identity by [`EntityContext`].
    FantasyMarkerObserved {
        summon_uuid: EntityUuid,
        source_config_id: Option<i32>,
    },
    AttackTargetChanged {
        actor_uuid: EntityUuid,
        target_uuid: Option<EntityUuid>,
    },
    HitResolved(ObservedHit),
    SkillLifecycleChanged {
        caster_uuid: EntityUuid,
        skill_id: i32,
        phase: SkillPhase,
        target_uuid: Option<EntityUuid>,
    },
    SkillCooldownUpdated {
        entity_uuid: EntityUuid,
        cooldowns: Vec<SkillCooldownState>,
    },
    ShieldDetailsUpdated {
        entity_uuid: EntityUuid,
        entries: Vec<ShieldDetail>,
    },
    TempAttributeUpdated {
        entity_uuid: EntityUuid,
        attr_id: i32,
        value: i32,
        origin: ObservationOrigin,
    },
    FightResourceLayout {
        entity_uuid: EntityUuid,
        resource_ids: Vec<i32>,
    },
    /// Raw fight-resource values from ATTR_FIGHT_RESOURCES. Zipped against the
    /// entity's known layout by [`EntityContext`].
    FightResourceValues {
        entity_uuid: EntityUuid,
        values: Vec<i64>,
        origin: ObservationOrigin,
    },
    SceneChanged {
        scene_id: i32,
        difficulty: Option<i32>,
    },
    DungeonFlowChanged {
        state: i32,
    },
    DungeonObjectiveChanged {
        target_id: i32,
        count: i32,
        complete: bool,
    },
    DungeonProgressStateChanged {
        value: i32,
    },
    SeasonCultivateSnapshot {
        season_id: i32,
        active_template_ids: Vec<i32>,
        active_item_ids: Vec<i32>,
    },
    SeasonCultivateDelta {
        season_id: i32,
        active_template_ids: Vec<i32>,
        activated_item_ids: Vec<i32>,
        deactivated_item_ids: Vec<i32>,
    },

    LocalTalentChanged(LocalTalent),
    PassiveSkillObserved(PassiveSkillObservation),
    BossMechanicStarted(BossMechanicObservation),
    GameTimerSnapshot {
        timers: Vec<GameTimerState>,
    },
    GameTimerUpserted {
        timer: GameTimerState,
    },
    PauseChanged {
        is_paused: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EntityRoles {
    pub is_local_player: bool,
    pub is_team_member: bool,
    pub is_current_target: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuffState {
    pub target: EntityRef,
    pub instance_id: i64,
    pub base_id: i32,
    pub layer: i32,
    pub source: Option<EntityRef>,
    pub resolved_owner: Option<EntityRef>,
    pub source_config_id: Option<i32>,
    pub duration_ms: Option<u64>,
    pub started_wall_ms: Option<i64>,
    pub expires_wall_ms: Option<i64>,
    pub started_mono_ms: Option<MonoTimeMs>,
    pub expires_mono_ms: Option<MonoTimeMs>,
    pub effect_ids: Arc<[i32]>,
}

/// Point-in-time active buffs captured before a death event can be followed by
/// removals or entity disappearance in the same reduced batch.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeathBuffCheckpoint(Arc<HashMap<EntityRef, Vec<BuffState>>>);

impl DeathBuffCheckpoint {
    pub(crate) fn new(buffs: HashMap<EntityRef, Vec<BuffState>>) -> Self {
        Self(Arc::new(buffs))
    }

    #[must_use]
    pub(crate) fn buffs(&self, entity: EntityRef) -> &[BuffState] {
        self.0.get(&entity).map_or(&[], Vec::as_slice)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuffTransition {
    /// Establishes state from a full snapshot without producing gained/spent edges.
    Baseline,
    Applied,
    Refreshed,
    LayerChanged,
    Removed,
}

/// The raw wire message kind a buff event originated from. Unlike
/// [`BuffTransition`] (a merged view), this preserves the old pipeline's
/// Added/Changed/Removed distinction that counters dispatch on — notably an
/// Add landing on an existing instance stays `Add` even though the merged
/// transition becomes `Refreshed`/`LayerChanged`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuffWireKind {
    Add,
    Change,
    Remove,
    /// Established from an authoritative snapshot; counters ignore it.
    Snapshot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuffEvent {
    pub transition: BuffTransition,
    pub wire_kind: BuffWireKind,
    /// True when a wire `Change` carried a new duration. Buff-tick counters
    /// refresh the expiry only then (old parity: duration-less changes keep
    /// the existing expiry).
    pub duration_updated: bool,
    pub previous_layer: Option<i32>,
    pub state: BuffState,
    pub target_roles: EntityRoles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DomainHit {
    pub channel: HitChannel,
    pub source: Option<EntityRef>,
    /// Raw packet-level owner (`top_summoner_id`) without registry-chain
    /// resolution. Counters attribute summon damage with
    /// `packet_owner.or(source)` exactly like the old pipeline.
    pub packet_owner: Option<EntityRef>,
    pub resolved_owner: Option<EntityRef>,
    pub target: EntityRef,
    pub source_kind: Option<EntityKind>,
    pub target_kind: EntityKind,
    pub source_monster_id: Option<i32>,
    pub target_monster_id: Option<i32>,
    pub target_is_boss: bool,
    pub source_is_player: bool,
    pub source_is_local_player: bool,
    pub skill_key: i64,
    pub skill_id: Option<i32>,
    pub type_flags: i32,
    pub kind: HitKind,
    pub amount: u128,
    pub has_loss_breakdown: bool,
    pub hp_loss: u128,
    pub shield_loss: u128,
    pub is_lucky_bonus_only: bool,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub effective_amount: Option<u128>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DomainEvent {
    ContainerReset,
    EntityAppeared {
        entity: EntityRef,
        kind: EntityKind,
    },
    EntityDisappeared {
        entity: EntityRef,
    },
    IdentityChanged {
        entity: EntityRef,
        previous: EntityIdentity,
        current: EntityIdentity,
    },
    AttributeChanged {
        entity: EntityRef,
        attr_id: i32,
        previous: Option<AttributeValue>,
        current: AttributeValue,
        is_baseline: bool,
    },
    HateListUpdated {
        entity: EntityRef,
        entries: Vec<HateEntry>,
    },
    PositionChanged {
        entity: EntityRef,
        attr_id: i32,
        previous: Option<Position>,
        current: Position,
        is_baseline: bool,
    },
    BuffChanged(BuffEvent),
    LocalPlayerChanged {
        previous: Option<EntityRef>,
        current: Option<EntityRef>,
    },
    TeamMembershipChanged {
        entity: EntityRef,
        is_member: bool,
    },
    TeamChanged {
        team_id: i64,
        leader: Option<EntityRef>,
        members: Vec<EntityRef>,
    },
    MatchmakingPopped,
    ReadyCheckStarted,
    TeamVoteStarted,
    AttackTargetChanged {
        actor: EntityRef,
        previous: Option<EntityRef>,
        current: Option<EntityRef>,
        target_epoch: u64,
    },
    HitResolved(DomainHit),
    /// A segment policy accepted this hit for combat/counter/history projections.
    CombatHitAccepted(DomainHit),
    DeathOccurred {
        victim: EntityRef,
        killer: Option<EntityRef>,
        skill_key: Option<i64>,
        buff_checkpoint: DeathBuffCheckpoint,
    },
    /// A previously dead entity returned to life (ActorState flipped back).
    /// The dual of `DeathOccurred`; carries no replay payload.
    Revived {
        entity: EntityRef,
    },
    FantasyChanged {
        transition: FantasyTransition,
        fantasy: FantasyState,
    },
    WipeDetected {
        entity: Option<EntityRef>,
        buff_instance_id: Option<i64>,
    },
    SkillLifecycleChanged {
        caster: EntityRef,
        skill_id: i32,
        phase: SkillPhase,
        target: Option<EntityRef>,
    },
    SkillCooldownUpdated {
        entity: EntityRef,
        cooldowns: Vec<SkillCooldownState>,
    },
    ShieldDetailsUpdated {
        entity: EntityRef,
        entries: Vec<ResolvedShieldDetail>,
    },
    TempAttributeChanged {
        entity: EntityRef,
        attr_id: i32,
        previous: Option<i32>,
        current: i32,
        is_baseline: bool,
    },
    FightResourceLayoutChanged {
        entity: EntityRef,
        previous: Vec<i32>,
        current: Vec<i32>,
    },
    FightResourceChanged {
        entity: EntityRef,
        resource_id: i32,
        previous: Option<i64>,
        current: i64,
        is_baseline: bool,
    },
    SceneChanged {
        previous_scene_id: Option<i32>,
        scene_id: i32,
        difficulty: Option<i32>,
    },
    DungeonFlowChanged {
        previous: Option<i32>,
        current: i32,
    },
    DungeonObjectiveChanged {
        target_id: i32,
        count: i32,
        complete: bool,
    },
    DungeonProgressStateChanged {
        previous: Option<i32>,
        current: i32,
    },
    SeasonCultivateChanged {
        season_id: i32,
        active_template_ids: Vec<i32>,
        active_item_ids: Vec<i32>,
        is_baseline: bool,
    },

    LocalTalentChanged {
        previous: LocalTalent,
        current: LocalTalent,
    },
    PassiveSkillObserved {
        entity: EntityRef,
        passive_instance_id: i32,
        skill_id: i32,
        target_position: Option<Position>,
        ended: bool,
    },
    BossMechanicStarted(BossMechanicObservation),
    GameTimerSnapshot {
        timers: Vec<GameTimerState>,
    },
    GameTimerChanged(GameTimerState),
    PauseChanged {
        is_paused: bool,
    },
    SegmentStarted {
        segment_id: SegmentId,
        reason: SegmentReason,
        started_at_mono_ms: MonoTimeMs,
        started_at_wall_ms: i64,
    },
    SegmentEnded {
        segment_id: SegmentId,
        reason: SegmentReason,
        ended_at_mono_ms: MonoTimeMs,
        ended_at_wall_ms: i64,
    },
    DeadlineReached {
        key: TimerKey,
        kind: TimerKind,
        scope: TimerScope,
        scheduled_for: MonoTimeMs,
        fired_at: MonoTimeMs,
        generation: u64,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct DomainEnvelope {
    /// Strict runtime-domain sequence, independent from capture stream sequence.
    pub sequence: u64,
    pub batch_id: BatchId,
    pub occurred_at_ms: i64,
    pub meta: EventMeta,
    /// Wire/reducer order within `meta.batch_id`.
    pub event_index: u32,
    /// Filled by the segment controller for segment-scoped projections.
    pub segment_id: Option<SegmentId>,
    pub event: DomainEvent,
}
