use crate::live::opcodes_models::{Encounter, attr_type};
use blueprotobuf_lib::blueprotobuf::{AoiSyncDelta, EDamageType};
use std::time::{Duration, Instant};

pub const TRAINING_SEGMENT_DURATION: Duration = Duration::from_secs(183);

#[derive(
    Debug, Default, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub enum TrainingDummyPhase {
    #[default]
    Idle,
    Armed,
    Running,
    Finished,
}

/// Controls which combat deltas are allowed to accumulate into the encounter.
///
/// Produced by [`TrainingDummyRuntime::combat_gate`] and threaded into the AOI
/// delta processors. `BlockAll` is what freezes the live panel on a finished
/// training-dummy segment: no damage, heal, or fight-timer progress is recorded.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum CombatGate {
    /// Count every target's combat (default, non-training-dummy behaviour).
    #[default]
    AllowAll,
    /// Count combat only for the locked target uuid.
    Only(i64),
    /// Drop all combat — used to freeze a finished segment in place.
    BlockAll,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum TrainingDummyMonsterId {
    EliteEnemy = 115,
    EliteGuardian = 122,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("unsupported training dummy monster id: {0}")]
pub struct InvalidTrainingDummyMonsterId(pub i32);

impl TrainingDummyMonsterId {
    pub fn id(self) -> i32 {
        self as i32
    }
}

impl TryFrom<i32> for TrainingDummyMonsterId {
    type Error = InvalidTrainingDummyMonsterId;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            115 => Ok(Self::EliteEnemy),
            122 => Ok(Self::EliteGuardian),
            _ => Err(InvalidTrainingDummyMonsterId(value)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrainingDummyMatch {
    pub target_entity_uuid: i64,
    pub monster_id: TrainingDummyMonsterId,
    pub has_local_player_damage: bool,
}

#[derive(Debug, Clone, Default)]
pub struct TrainingDummyRuntime {
    pub phase: TrainingDummyPhase,
    pub locked_target_uuid: Option<i64>,
    pub rollover_ready_at: Option<Instant>,
    /// Set once the finished (frozen) segment has been written to history, so
    /// any later reset path skips persisting it a second time.
    pub segment_saved: bool,
}

impl TrainingDummyRuntime {
    /// Arm the dummy: wait for the first local-player hit on any supported
    /// monster (115/122) to lock on. No target needs to be pre-selected.
    pub fn arm(&mut self) {
        self.phase = TrainingDummyPhase::Armed;
        self.locked_target_uuid = None;
        self.rollover_ready_at = None;
        self.segment_saved = false;
    }

    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// Whether training-dummy mode is engaged at all (armed, running, or frozen).
    pub fn is_active(&self) -> bool {
        self.phase != TrainingDummyPhase::Idle
    }

    /// Re-arm after a manual reset, falling back to a full clear when inactive.
    pub fn rearm(&mut self) {
        if self.is_active() {
            self.arm();
        } else {
            self.clear();
        }
    }

    pub fn combat_gate(&self) -> CombatGate {
        match self.phase {
            TrainingDummyPhase::Idle | TrainingDummyPhase::Armed => CombatGate::AllowAll,
            TrainingDummyPhase::Running => self
                .locked_target_uuid
                .map_or(CombatGate::AllowAll, CombatGate::Only),
            TrainingDummyPhase::Finished => CombatGate::BlockAll,
        }
    }

    /// Advance `Running → Finished` once the segment duration has elapsed.
    /// Returns `true` exactly on the transition so the caller can persist and
    /// freeze the just-finished segment.
    pub fn maybe_finish(&mut self) -> bool {
        if self.phase != TrainingDummyPhase::Running {
            return false;
        }
        if self
            .rollover_ready_at
            .is_some_and(|trigger_at| Instant::now() >= trigger_at)
        {
            self.phase = TrainingDummyPhase::Finished;
            return true;
        }
        false
    }

    /// Only an `Armed` dummy auto-locks. A `Finished` (frozen) segment ignores
    /// all attacks — the user must manually reset back to `Armed` to continue.
    pub fn should_lock_on_match(&self, matched: TrainingDummyMatch) -> bool {
        self.phase == TrainingDummyPhase::Armed && matched.has_local_player_damage
    }

    pub fn lock_target(&mut self, matched: TrainingDummyMatch) {
        let now = Instant::now();
        self.phase = TrainingDummyPhase::Running;
        self.locked_target_uuid = Some(matched.target_entity_uuid);
        self.rollover_ready_at = Some(now + TRAINING_SEGMENT_DURATION);
        self.segment_saved = false;
    }
}

pub fn inspect_aoi_delta(
    encounter: &Encounter,
    delta: &AoiSyncDelta,
    local_player_uuid: i64,
) -> Option<TrainingDummyMatch> {
    let target_uuid = delta.uuid?;
    let monster_id = resolve_target_monster_id(encounter, delta, target_uuid)?;
    let has_local_player_damage = delta.skill_effects.as_ref().is_some_and(|effects| {
        effects
            .damages
            .iter()
            .any(|damage| is_local_player_damage(damage, local_player_uuid))
    });

    Some(TrainingDummyMatch {
        target_entity_uuid: target_uuid,
        monster_id,
        has_local_player_damage,
    })
}

fn resolve_target_monster_id(
    encounter: &Encounter,
    delta: &AoiSyncDelta,
    target_uuid: i64,
) -> Option<TrainingDummyMonsterId> {
    let attrs_monster_id = delta.attrs.as_ref().and_then(|attrs| {
        attrs.attrs.iter().find_map(|attr| {
            (attr.id == Some(attr_type::ATTR_ID))
                .then(|| {
                    attr.raw_data
                        .as_deref()
                        .and_then(|raw| decode_attr_id(Some(raw)))
                })
                .flatten()
        })
    });

    attrs_monster_id
        .or_else(|| {
            encounter
                .entity_uuid_to_entity
                .get(&target_uuid)
                .and_then(|entity| entity.monster_type_id)
        })
        .and_then(|monster_id| TrainingDummyMonsterId::try_from(monster_id).ok())
}

fn decode_attr_id(raw: Option<&[u8]>) -> Option<i32> {
    let mut buf = raw?;
    prost::encoding::decode_varint(&mut buf)
        .ok()
        .and_then(|value| i32::try_from(value).ok())
}

fn is_local_player_damage(
    damage: &blueprotobuf_lib::blueprotobuf::SyncDamageInfo,
    local_player_uuid: i64,
) -> bool {
    if local_player_uuid <= 0 {
        return false;
    }
    if damage.r#type.unwrap_or(0) == EDamageType::Heal as i32 {
        return false;
    }
    if damage.value.is_none() && damage.lucky_value.is_none() {
        return false;
    }
    if damage.owner_id.is_none() {
        return false;
    }

    damage
        .top_summoner_id
        .or(damage.attacker_uuid)
        .map(|uuid| uuid == local_player_uuid)
        .unwrap_or(false)
}
