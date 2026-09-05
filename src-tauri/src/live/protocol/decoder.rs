//! Protocol decoder for the live event pipeline.
//!
//! Protobuf and dirty-wire formats terminate in this module. Every input
//! capture envelope produces exactly one protocol-neutral batch so downstream
//! watermarks always advance. Unsupported or malformed packets yield an empty
//! observation list.
//!
//! The decoder is deliberately close to stateless: it only keeps what cannot
//! be reconstructed from a single packet (the season-cultivate baseline the
//! dirty-wire deltas patch, and the server clock offset used for buff times).
//! Entity, buff, passive and team tables live in `EntityContext`.

use crate::live::damage_id;
use crate::live::entity_id::{canonical_player_uuid, entity_type_bits};
use crate::live::monster_registry::{self, MonsterType};
use crate::live::protocol::attrs as attr_type;
use crate::live::protocol::{COUNTER_PASSIVE_SKILL_IDS, MARKER_SKILL_ID_BASE};
use crate::live::runtime::events::{
    AttributeValue, BatchId, BossMechanicObservation, CaptureEnvelope, EntityIdentityPatch,
    EntityKind, EntityUuid, FieldPatch, GameTimerKey, GameTimerState, HateEntry, HitChannel,
    HitKind, LOCAL_PLAYER, LocalTalent, MonoTimeMs, ObservationOrigin, ObservedBuff,
    ObservedBuffChange, ObservedHit, PacketDirection, PassiveSkillObservation, Position,
    ProtocolBatch, ProtocolObservation, ShieldDetail, SkillCooldownState, SkillPhase,
};
use crate::packets::opcodes::{
    GRPC_TEAM_NTF_SERVICE_ID, MATCH_NTF_SERVICE_ID, Pkt, WORLD_CALL_SERVICE_ID,
    WORLD_NTF_SERVICE_ID, grpc_team_method, match_ntf_method, world_call_method,
};
use crate::packets::packet_process::{
    SYNTHETIC_DECODE_ISSUE_OPCODE, SYNTHETIC_REASSEMBLY_RESET_OPCODE, SYNTHETIC_STREAM_GAP_OPCODE,
};
use blueprotobuf_lib::blueprotobuf;
use bytes::Buf;
use prost::Message;
use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

const ATTR_SHIELD_DISPLAY: i32 = 60_050;
const WORLD_EVENT_TYPE_BOSS_DBM: i32 = 29;
const RESONANCE_FANTASY_MARKER_BUFF_ID: i32 = 2_199_999;
const CHAR_SERIALIZE_FIELD_SEASON_CULTIVATE: i32 = 101;
const CHAR_SERIALIZE_FIELD_PROFESSION_LIST: i32 = 61;
const DIRTY_BEGIN: i32 = -2;
const DIRTY_END: i32 = -3;
const SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP: i32 = 800_522;

#[derive(Debug, Clone, Copy)]
struct HitCore {
    value: u128,
    is_heal: bool,
    is_lucky_bonus_only: bool,
    has_loss_breakdown: bool,
    hp_loss: u128,
    shield_loss: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TeamWireEvent {
    TeamInfoUpdated {
        team_id: i64,
        leader_uuid: i64,
    },
    MemberInfoUpdated {
        members: Vec<i64>,
    },
    Joined {
        team_id: i64,
        leader_uuid: i64,
        members: Vec<i64>,
    },
    Left {
        member_uuid: i64,
    },
    Dissolved,
    TeamVoteStarted {
        creator_uuid: Option<i64>,
    },
}

#[derive(Default)]
pub struct ProtocolDecoder {
    /// Baseline the `SyncContainerDirtyData` wire format patches in place.
    season_data: Option<blueprotobuf::SeasonCultivateLineData>,
    /// Same dirty-wire baseline role as `season_data`, for
    /// `CharSerialize.profession_list` (field 61). Kept independently so
    /// profession/talent deltas still merge when no season snapshot exists.
    profession_list: Option<blueprotobuf::ProfessionList>,
    /// `captured_wall_ms - server_ms`, used to project buff create times.
    server_clock_offset_ms: Option<i64>,
}

impl ProtocolDecoder {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Decode one ordered capture envelope into exactly one batch.
    #[must_use]
    pub fn decode(&mut self, envelope: CaptureEnvelope) -> ProtocolBatch {
        let batch_id = BatchId(envelope.capture_sequence);
        let mut meta = envelope.event_meta(batch_id, None);
        let observations = self.decode_envelope(&envelope, &mut meta.source_time_ms);
        ProtocolBatch { meta, observations }
    }

    fn decode_envelope(
        &mut self,
        envelope: &CaptureEnvelope,
        source_time_ms: &mut Option<i64>,
    ) -> Vec<ProtocolObservation> {
        if is_synthetic_opcode(envelope.key.opcode) {
            return Vec::new();
        }

        let service_id = envelope.key.service_id.map(u64::from);
        if service_id == Some(WORLD_NTF_SERVICE_ID)
            && envelope.direction == PacketDirection::ServerToClient
        {
            let Ok(opcode) = Pkt::try_from(envelope.key.opcode) else {
                return Vec::new();
            };
            return self.decode_world_notify(opcode, envelope, source_time_ms);
        }

        if service_id == Some(WORLD_CALL_SERVICE_ID)
            && envelope.direction == PacketDirection::ClientToServer
        {
            return decode_world_call(envelope);
        }

        if service_id == Some(GRPC_TEAM_NTF_SERVICE_ID)
            && envelope.direction == PacketDirection::ServerToClient
        {
            return decode_team(envelope);
        }

        if service_id == Some(MATCH_NTF_SERVICE_ID)
            && envelope.direction == PacketDirection::ServerToClient
        {
            return decode_match(envelope);
        }

        Vec::new()
    }

    fn decode_world_notify(
        &mut self,
        opcode: Pkt,
        envelope: &CaptureEnvelope,
        source_time_ms: &mut Option<i64>,
    ) -> Vec<ProtocolObservation> {
        macro_rules! decoded {
            ($message:ty, $handler:expr) => {
                match decode_message::<$message>(&envelope.payload) {
                    Ok(message) => ($handler)(message),
                    Err(_) => Vec::new(),
                }
            };
        }

        match opcode {
            Pkt::EnterScene => decoded!(
                blueprotobuf::EnterScene,
                |message: blueprotobuf::EnterScene| { self.decode_enter_scene(message, envelope) }
            ),
            Pkt::SyncNearEntities => decoded!(
                blueprotobuf::SyncNearEntities,
                |message: blueprotobuf::SyncNearEntities| {
                    self.decode_near_entities(message, envelope)
                }
            ),
            Pkt::SyncSceneEvents => decoded!(
                blueprotobuf::SyncSceneEvents,
                |message: blueprotobuf::SyncSceneEvents| { decode_scene_events(message, envelope) }
            ),
            Pkt::SyncContainerData => decoded!(
                blueprotobuf::SyncContainerData,
                |message: blueprotobuf::SyncContainerData| {
                    self.decode_container_snapshot(message, envelope.captured_wall_ms)
                }
            ),
            Pkt::SyncContainerDirtyData => {
                decoded!(
                    blueprotobuf::SyncContainerDirtyData,
                    |message: blueprotobuf::SyncContainerDirtyData| {
                        self.decode_container_delta(message)
                    }
                )
            }
            Pkt::SyncServerTime => decoded!(
                blueprotobuf::SyncServerTime,
                |message: blueprotobuf::SyncServerTime| {
                    *source_time_ms = message.server_milliseconds;
                    if let Some(server_ms) = message.server_milliseconds {
                        self.server_clock_offset_ms =
                            Some(envelope.captured_wall_ms.saturating_sub(server_ms));
                    }
                    Vec::new()
                }
            ),
            Pkt::SyncDungeonData => decoded!(
                blueprotobuf::SyncDungeonData,
                |message: blueprotobuf::SyncDungeonData| { decode_dungeon_snapshot(message) }
            ),
            Pkt::SyncDungeonDirtyData => {
                decoded!(
                    blueprotobuf::SyncDungeonDirtyData,
                    |message: blueprotobuf::SyncDungeonDirtyData| { decode_dungeon_delta(message) }
                )
            }
            Pkt::SyncToMeDeltaInfo => decoded!(
                blueprotobuf::SyncToMeDeltaInfo,
                |message: blueprotobuf::SyncToMeDeltaInfo| {
                    self.decode_to_me_delta(message, envelope)
                }
            ),
            Pkt::SyncNearDeltaInfo => decoded!(
                blueprotobuf::SyncNearDeltaInfo,
                |message: blueprotobuf::SyncNearDeltaInfo| {
                    self.decode_near_delta(message, envelope)
                }
            ),
            Pkt::SyncServerSkillEnd => decoded!(
                blueprotobuf::SyncServerSkillEnd,
                |message: blueprotobuf::SyncServerSkillEnd| {
                    message
                        .skill_uuid
                        .filter(|skill_id| *skill_id > 0)
                        .map(|skill_id| ProtocolObservation::LocalSkillCompleted { skill_id })
                        .into_iter()
                        .collect()
                }
            ),
            Pkt::NotifyAllMemberReady => {
                log::info!("ready-check notification detected");
                vec![ProtocolObservation::ReadyCheckStarted]
            }
            Pkt::NotifyTimerList => decoded!(
                blueprotobuf::NotifyTimerList,
                |message: blueprotobuf::NotifyTimerList| {
                    let timers = message
                        .timer_info
                        .map(|list| {
                            list.timer_info_list
                                .into_iter()
                                .filter_map(timer_state)
                                .collect()
                        })
                        .unwrap_or_default();
                    vec![ProtocolObservation::GameTimerSnapshot { timers }]
                }
            ),
            Pkt::NotifyTimerUpdate => decoded!(
                blueprotobuf::NotifyTimerUpdate,
                |message: blueprotobuf::NotifyTimerUpdate| {
                    message
                        .timer_info
                        .and_then(timer_state)
                        .map(|timer| ProtocolObservation::GameTimerUpserted { timer })
                        .into_iter()
                        .collect()
                }
            ),
            // Standalone BuffInfoSync packets are ignored like the legacy
            // pipeline did: the wire behavior is unverified.
            Pkt::BuffInfoSync => Vec::new(),
            _ => Vec::new(),
        }
    }

    fn decode_enter_scene(
        &mut self,
        message: blueprotobuf::EnterScene,
        envelope: &CaptureEnvelope,
    ) -> Vec<ProtocolObservation> {
        let mut observations = Vec::new();
        let Some(info) = message.enter_scene_info else {
            return observations;
        };

        if let Some(scene_attrs) = info.scene_attrs.as_ref()
            && let Some(scene_id) = scene_id_from_attrs(scene_attrs)
        {
            observations.push(ProtocolObservation::SceneChanged {
                scene_id,
                difficulty: None,
            });
        }
        if let Some(player) = info.player_ent.as_ref() {
            self.decode_entity_snapshot(
                player,
                ObservationOrigin::Snapshot,
                envelope,
                &mut observations,
            );
            if let Some(uuid) = player.uuid.map(EntityUuid) {
                observations.push(ProtocolObservation::LocalPlayerChanged { uuid: Some(uuid) });
            }
        }
        observations
    }

    fn decode_near_entities(
        &mut self,
        message: blueprotobuf::SyncNearEntities,
        envelope: &CaptureEnvelope,
    ) -> Vec<ProtocolObservation> {
        let mut observations = Vec::with_capacity(message.appear.len() + message.disappear.len());
        for entity in &message.appear {
            self.decode_entity_snapshot(
                entity,
                ObservationOrigin::Snapshot,
                envelope,
                &mut observations,
            );
        }
        for disappeared in message.disappear {
            let Some(uuid) = disappeared.uuid.map(EntityUuid) else {
                continue;
            };
            observations.push(ProtocolObservation::EntityDisappeared { uuid });
        }
        observations
    }

    fn decode_entity_snapshot(
        &mut self,
        entity: &blueprotobuf::Entity,
        origin: ObservationOrigin,
        envelope: &CaptureEnvelope,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let Some(uuid) = entity.uuid.map(EntityUuid) else {
            return;
        };
        let kind = entity_kind(entity.ent_type, uuid);
        observations.push(ProtocolObservation::EntityAppeared { uuid, kind });

        // Attributes carry owner/monster identity that `EntityContext` needs
        // before it can resolve the fantasy marker emitted below.
        if let Some(attrs) = entity.attrs.as_ref() {
            Self::decode_attributes(uuid, kind, attrs, origin, observations);
        }
        if let Some(temp_attrs) = entity.temp_attrs.as_ref() {
            decode_temp_attributes(uuid, temp_attrs, origin, observations);
        }
        if let Some(passives) = entity.passive_skill_infos.as_ref() {
            Self::decode_passive_starts(uuid, passives, origin, observations);
        }
        if let Some(snapshot) = entity.buff_infos.as_ref() {
            self.decode_buff_snapshot(uuid, snapshot, envelope, observations);
            Self::detect_fantasy(uuid, kind, snapshot, observations);
        }
        // `entity.buff_effect` on appear entities is intentionally not
        // decoded: the wire behavior is unverified and the legacy pipeline
        // only consumed `buff_infos`.
    }

    fn decode_to_me_delta(
        &mut self,
        message: blueprotobuf::SyncToMeDeltaInfo,
        envelope: &CaptureEnvelope,
    ) -> Vec<ProtocolObservation> {
        let mut observations = Vec::new();
        let Some(delta) = message.delta_info else {
            return observations;
        };
        // A to-me delta always addresses the local player; the uuid is often
        // omitted, in which case the sentinel lets `EntityContext` resolve it.
        let entity_uuid = delta.uuid.map(EntityUuid).unwrap_or(LOCAL_PLAYER);
        if entity_uuid != LOCAL_PLAYER {
            observations.push(ProtocolObservation::LocalPlayerChanged {
                uuid: Some(entity_uuid),
            });
        }
        if !delta.sync_skill_c_ds.is_empty() {
            observations.push(ProtocolObservation::SkillCooldownUpdated {
                entity_uuid,
                cooldowns: delta
                    .sync_skill_c_ds
                    .into_iter()
                    .filter_map(skill_cooldown_state)
                    .collect(),
            });
        }
        if let Some(base_delta) = delta.base_delta {
            self.decode_aoi_delta(base_delta, HitChannel::ToMe, envelope, &mut observations);
        }
        observations
    }

    fn decode_near_delta(
        &mut self,
        message: blueprotobuf::SyncNearDeltaInfo,
        envelope: &CaptureEnvelope,
    ) -> Vec<ProtocolObservation> {
        let mut observations = Vec::with_capacity(message.delta_infos.len());
        for delta in message.delta_infos {
            self.decode_aoi_delta(delta, HitChannel::Near, envelope, &mut observations);
        }
        observations
    }

    fn decode_aoi_delta(
        &mut self,
        delta: blueprotobuf::AoiSyncDelta,
        channel: HitChannel,
        envelope: &CaptureEnvelope,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let Some(uuid) = delta.uuid.map(EntityUuid) else {
            return;
        };
        // Deltas never carry an entity type, so the uuid bits are the only
        // source. `EntityContext` drops the redundant appearances.
        let kind = entity_kind(None, uuid);
        observations.push(ProtocolObservation::EntityAppeared { uuid, kind });

        if let Some(attrs) = delta.attrs.as_ref() {
            Self::decode_attributes(uuid, kind, attrs, ObservationOrigin::Delta, observations);
        }
        if let Some(temp_attrs) = delta.temp_attrs.as_ref() {
            decode_temp_attributes(uuid, temp_attrs, ObservationOrigin::Delta, observations);
        }
        if let Some(passives) = delta.passive_skill_infos.as_ref() {
            Self::decode_passive_starts(uuid, passives, ObservationOrigin::Delta, observations);
        }
        if let Some(ended) = delta.passive_skill_end_infos.as_ref() {
            Self::decode_passive_ends(uuid, ended, observations);
        }
        if let Some(skill_effects) = delta.skill_effects {
            for damage in skill_effects.damages {
                let Some(core) = parse_hit_core(&damage) else {
                    continue;
                };
                let Some(skill_id) = damage.owner_id else {
                    continue;
                };
                let skill_key = damage_id::compute_damage_id(
                    damage.damage_source,
                    skill_id,
                    damage.owner_level,
                    damage.hit_event_id,
                );
                let source_owner_uuid = damage
                    .top_summoner_id
                    .filter(|uuid| *uuid != 0)
                    .map(EntityUuid);
                let source_uuid = damage
                    .attacker_uuid
                    .filter(|uuid| *uuid != 0)
                    .map(EntityUuid)
                    .or(source_owner_uuid);
                let kind = if core.is_heal {
                    HitKind::Healing
                } else {
                    HitKind::Damage
                };
                observations.push(ProtocolObservation::HitResolved(ObservedHit {
                    channel,
                    source_uuid,
                    source_owner_uuid,
                    target_uuid: uuid,
                    skill_key,
                    skill_id: Some(skill_id),
                    type_flags: damage.type_flag.unwrap_or_default(),
                    kind,
                    amount: core.value,
                    has_loss_breakdown: core.has_loss_breakdown,
                    hp_loss: core.hp_loss,
                    shield_loss: core.shield_loss,
                    is_lucky_bonus_only: core.is_lucky_bonus_only,
                    property: damage.property,
                    damage_mode: damage.damage_mode,
                    effective_amount: None,
                }));
            }
        }

        // Preserve the established in-packet reducer order: damage sources
        // are observed before reset/condition Buff edges from the same AOI
        // delta. Batch-aware `DamageBySkillKeyOnce` commits before the first
        // following non-hit counter event.
        if let Some(raw) = delta.buff_effect.as_deref()
            && let Ok(effects) = decode_message::<blueprotobuf::BuffEffectSync>(raw)
        {
            self.decode_buff_effect_sync(uuid, &effects, envelope, observations);
        }
    }

    /// Wire attributes are self-contained, so this is a pure fan-out from one
    /// `AttrCollection` to observations; no decoder state is consulted.
    fn decode_attributes(
        uuid: EntityUuid,
        kind: EntityKind,
        collection: &blueprotobuf::AttrCollection,
        origin: ObservationOrigin,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let mut identity = EntityIdentityPatch::default();
        let mut pending_resource_values = None;

        for attr in &collection.attrs {
            let Some(attr_id) = attr.id else {
                continue;
            };
            let raw = attr.raw_data.as_deref();
            match attr_id {
                attr_type::ATTR_POS => {
                    if let Some(position) = raw.and_then(decode_position) {
                        observations.push(ProtocolObservation::PositionUpdated {
                            uuid,
                            attr_id,
                            position,
                            origin,
                        });
                    }
                }
                attr_type::ATTR_NAME => {
                    if let Some(name) = raw.and_then(decode_prefixed_string) {
                        identity.name = FieldPatch::Set(name.clone());
                        observations.push(ProtocolObservation::AttributeUpdated {
                            uuid,
                            attr_id,
                            value: AttributeValue::Text(name),
                            origin,
                        });
                    }
                }
                attr_type::ATTR_ID => {
                    if let Some(monster_id) = raw
                        .and_then(decode_varint_i64)
                        .and_then(|value| i32::try_from(value).ok())
                        .filter(|value| *value > 0)
                    {
                        identity.monster_id = FieldPatch::Set(monster_id);
                        identity.is_boss = FieldPatch::Set(
                            kind == EntityKind::Monster
                                && monster_registry::monster_type(monster_id)
                                    == Some(MonsterType::Boss),
                        );
                        observations.push(integer_attribute(
                            uuid,
                            attr_id,
                            i64::from(monster_id),
                            origin,
                        ));
                    }
                }
                attr_type::ATTR_PROFESSION_ID => {
                    let value = decode_optional_varint(raw);
                    if let Ok(profession_id) = i32::try_from(value) {
                        identity.profession_id = FieldPatch::Set(profession_id);
                    }
                    observations.push(integer_attribute(uuid, attr_id, value, origin));
                }
                attr_type::ATTR_TOP_SUMMONER_ID => {
                    let value = decode_optional_varint(raw);
                    identity.owner_uuid = if value == 0 {
                        FieldPatch::Clear
                    } else {
                        FieldPatch::Set(EntityUuid(value))
                    };
                    observations.push(integer_attribute(uuid, attr_id, value, origin));
                }
                attr_type::ATTR_SKILL_REMODEL_LEVEL => {
                    let value = decode_optional_varint(raw);
                    identity.fantasy_tier = u8::try_from(value)
                        .map(FieldPatch::Set)
                        .unwrap_or(FieldPatch::Unchanged);
                    observations.push(integer_attribute(uuid, attr_id, value, origin));
                }
                attr_type::ATTR_TARGET_ID => {
                    let value = decode_optional_varint(raw);
                    observations.push(integer_attribute(uuid, attr_id, value, origin));
                    observations.push(ProtocolObservation::AttackTargetChanged {
                        actor_uuid: uuid,
                        target_uuid: (value != 0).then_some(EntityUuid(value)),
                    });
                }
                attr_type::ATTR_SKILL_ID => {
                    let value = decode_optional_varint(raw);
                    observations.push(integer_attribute(uuid, attr_id, value, origin));
                    if origin == ObservationOrigin::Delta
                        && let Ok(skill_id) = i32::try_from(value)
                        && skill_id > 0
                    {
                        observations.push(ProtocolObservation::SkillLifecycleChanged {
                            caster_uuid: uuid,
                            skill_id,
                            phase: SkillPhase::Observed,
                            target_uuid: None,
                        });
                    }
                }
                attr_type::ATTR_FIGHT_RESOURCE_IDS => {
                    if let Some(resource_ids) = raw.and_then(parse_i64_sequence).map(|values| {
                        values
                            .into_iter()
                            .filter_map(|value| i32::try_from(value).ok())
                            .collect::<Vec<_>>()
                    }) {
                        observations.push(ProtocolObservation::FightResourceLayout {
                            entity_uuid: uuid,
                            resource_ids,
                        });
                    }
                }
                attr_type::ATTR_FIGHT_RESOURCES => {
                    pending_resource_values = raw.and_then(parse_i64_sequence);
                }
                attr_type::ATTR_HATE_LIST => {
                    if let Some(entries) = raw.and_then(decode_hate_list) {
                        observations.push(ProtocolObservation::HateListUpdated {
                            entity_uuid: uuid,
                            entries,
                        });
                    }
                }
                ATTR_SHIELD_DISPLAY => {
                    let entries = raw.map(decode_shield_details).unwrap_or_default();
                    let total = entries.iter().map(|entry| entry.current).sum();
                    observations.push(ProtocolObservation::ShieldDetailsUpdated {
                        entity_uuid: uuid,
                        entries,
                    });
                    observations.push(integer_attribute(
                        uuid,
                        attr_type::ATTR_CURRENT_SHIELD,
                        total,
                        origin,
                    ));
                }
                attr_type::ATTR_REDUCTION_ID => {}
                _ => {
                    if attr_type::is_known_integer(attr_id) {
                        observations.push(integer_attribute(
                            uuid,
                            attr_id,
                            decode_optional_varint(raw),
                            origin,
                        ));
                    } else if let Some(value) = raw.and_then(decode_attribute_value) {
                        observations.push(ProtocolObservation::AttributeUpdated {
                            uuid,
                            attr_id,
                            value,
                            origin,
                        });
                    }
                }
            }
        }

        identity.kind = FieldPatch::Set(kind);
        observations.push(ProtocolObservation::IdentityUpdated {
            uuid,
            patch: identity,
        });

        if let Some(values) = pending_resource_values {
            observations.push(ProtocolObservation::FightResourceValues {
                entity_uuid: uuid,
                values,
                origin,
            });
        }
    }

    fn decode_passive_starts(
        fallback_entity: EntityUuid,
        sequence: &blueprotobuf::SeqPassiveSkillInfo,
        origin: ObservationOrigin,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let entity_uuid = sequence
            .actor_uuid
            .map(EntityUuid)
            .unwrap_or(fallback_entity);
        for passive in &sequence.passive_infos {
            let (Some(instance_id), Some(skill_id)) = (passive.uuid, passive.skill_id) else {
                continue;
            };
            let marker_range = (MARKER_SKILL_ID_BASE + 1)..=(MARKER_SKILL_ID_BASE + 6);
            let is_counter_delta =
                origin == ObservationOrigin::Delta && COUNTER_PASSIVE_SKILL_IDS.contains(&skill_id);
            if !marker_range.contains(&skill_id) && !is_counter_delta {
                continue;
            }
            observations.push(ProtocolObservation::PassiveSkillObserved(
                PassiveSkillObservation {
                    entity_uuid,
                    passive_instance_id: instance_id,
                    skill_id,
                    target_position: passive.tar_pos.as_ref().and_then(vector_position),
                    ended: false,
                },
            ));
        }
    }

    /// End notifications only carry instance ids. `EntityContext` owns the
    /// instance table and restores skill id and target position from it, so
    /// the unknown skill id is reported as zero.
    fn decode_passive_ends(
        fallback_entity: EntityUuid,
        sequence: &blueprotobuf::SeqPassiveSkillEndInfo,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let entity_uuid = sequence
            .actor_uuid
            .map(EntityUuid)
            .unwrap_or(fallback_entity);
        for raw_instance_id in &sequence.uuids {
            let Ok(passive_instance_id) = i32::try_from(*raw_instance_id) else {
                continue;
            };
            observations.push(ProtocolObservation::PassiveSkillObserved(
                PassiveSkillObservation {
                    entity_uuid,
                    passive_instance_id,
                    skill_id: 0,
                    target_position: None,
                    ended: true,
                },
            ));
        }
    }

    fn decode_buff_snapshot(
        &mut self,
        target_uuid: EntityUuid,
        snapshot: &blueprotobuf::BuffInfoSync,
        envelope: &CaptureEnvelope,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let mut normalized = Vec::with_capacity(snapshot.buff_infos.len());
        for info in &snapshot.buff_infos {
            let Some(instance_id) = info.buff_uuid.map(i64::from) else {
                continue;
            };
            if let Some(buff) = self.observed_buff(instance_id, info, envelope) {
                normalized.push(buff);
            }
        }
        observations.push(ProtocolObservation::BuffSnapshot {
            target_uuid,
            buffs: normalized,
        });
    }

    fn decode_buff_effect_sync(
        &mut self,
        fallback_target: EntityUuid,
        sync: &blueprotobuf::BuffEffectSync,
        envelope: &CaptureEnvelope,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        let sync_target = sync.uuid.map(EntityUuid).unwrap_or(fallback_target);
        for effect in &sync.buff_effects {
            let target_uuid = effect.host_uuid.map(EntityUuid).unwrap_or(sync_target);
            let Some(instance_id) = effect.buff_uuid.map(i64::from) else {
                continue;
            };
            let effect_ids = decode_play_effect_ids(&effect.logic_effect);
            let effect_ids =
                (!effect_ids.is_empty()).then(|| Arc::<[i32]>::from(effect_ids.into_boxed_slice()));

            for logic in &effect.logic_effect {
                let effect_type = logic
                    .effect_type
                    .unwrap_or(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32);
                let Some(raw) = logic.raw_data.as_deref() else {
                    continue;
                };
                if effect_type == blueprotobuf::EBuffEffectLogicPbType::BuffEffectAddBuff as i32 {
                    if let Ok(info) = decode_message::<blueprotobuf::BuffInfo>(raw)
                        && let Some(mut buff) = self.observed_buff(instance_id, &info, envelope)
                    {
                        if let Some(effect_ids) = &effect_ids {
                            buff.effect_ids = Arc::clone(effect_ids);
                        }
                        observations.push(ProtocolObservation::BuffChanged {
                            target_uuid,
                            change: ObservedBuffChange::Applied { buff },
                        });
                    }
                } else if effect_type
                    == blueprotobuf::EBuffEffectLogicPbType::BuffEffectBuffChange as i32
                    && let Ok(change) = decode_message::<blueprotobuf::BuffChange>(raw)
                {
                    observations.push(ProtocolObservation::BuffChanged {
                        target_uuid,
                        change: ObservedBuffChange::Delta {
                            instance_id,
                            layer: change.layer,
                            duration_ms: change
                                .duration
                                .and_then(|value| u64::try_from(value).ok()),
                            create_time: change.create_time,
                            effect_ids: effect_ids.clone(),
                        },
                    });
                }
            }

            if effect.r#type == Some(blueprotobuf::EBuffEventType::BuffEventCustomize as i32) {
                let customize_ids = decode_customize_values(&effect.logic_effect);
                if !customize_ids.is_empty() {
                    observations.push(ProtocolObservation::BuffChanged {
                        target_uuid,
                        change: ObservedBuffChange::Delta {
                            instance_id,
                            layer: None,
                            duration_ms: None,
                            create_time: None,
                            effect_ids: Some(Arc::from(customize_ids.into_boxed_slice())),
                        },
                    });
                }
            }

            if effect.r#type == Some(blueprotobuf::EBuffEventType::BuffEventRemove as i32) {
                observations.push(ProtocolObservation::BuffChanged {
                    target_uuid,
                    change: ObservedBuffChange::Remove { instance_id },
                });
            }
        }
    }

    fn observed_buff(
        &self,
        instance_id: i64,
        info: &blueprotobuf::BuffInfo,
        envelope: &CaptureEnvelope,
    ) -> Option<ObservedBuff> {
        let base_id = info.base_id?;
        let mut buff = ObservedBuff {
            instance_id,
            base_id,
            layer: info.layer.unwrap_or(1),
            source_uuid: info.fire_uuid.filter(|uuid| *uuid != 0).map(EntityUuid),
            source_config_id: info
                .fight_source_info
                .as_ref()
                .and_then(|source| source.source_config_id),
            duration_ms: info.duration.and_then(|value| u64::try_from(value).ok()),
            started_wall_ms: None,
            expires_wall_ms: None,
            started_mono_ms: None,
            expires_mono_ms: None,
            effect_ids: Arc::from(decode_play_effect_ids(&info.logic_effect).into_boxed_slice()),
        };
        update_buff_times(
            &mut buff,
            info.create_time,
            envelope,
            self.server_clock_offset_ms,
        );
        Some(buff)
    }

    /// Reports the marker buff only. Summoner, monster id and remodel level
    /// come from the identity patch emitted just before this call.
    fn detect_fantasy(
        summon_uuid: EntityUuid,
        kind: EntityKind,
        buffs: &blueprotobuf::BuffInfoSync,
        observations: &mut Vec<ProtocolObservation>,
    ) {
        if kind != EntityKind::Monster {
            return;
        }
        let Some(marker) = buffs
            .buff_infos
            .iter()
            .find(|buff| buff.base_id == Some(RESONANCE_FANTASY_MARKER_BUFF_ID))
        else {
            return;
        };
        observations.push(ProtocolObservation::FantasyMarkerObserved {
            summon_uuid,
            source_config_id: marker
                .fight_source_info
                .as_ref()
                .and_then(|source| source.source_config_id),
        });
    }

    fn decode_container_snapshot(
        &mut self,
        message: blueprotobuf::SyncContainerData,
        last_seen_ms: i64,
    ) -> Vec<ProtocolObservation> {
        let mut observations = vec![ProtocolObservation::ContainerReset];
        self.season_data = None;
        self.profession_list = None;
        let Some(mut data) = message.v_data else {
            observations.push(ProtocolObservation::SeasonCultivateSnapshot {
                season_id: 0,
                active_template_ids: Vec::new(),
                active_item_ids: Vec::new(),
            });
            observations.push(ProtocolObservation::LocalTalentChanged(LocalTalent::default()));
            return observations;
        };
        if let Some(char_id) = data.char_id {
            crate::database::flush_playerdata(char_id, last_seen_ms, data.encode_to_vec());
            let uuid = EntityUuid(canonical_player_uuid(char_id));
            observations.push(ProtocolObservation::EntityAppeared {
                uuid,
                kind: EntityKind::Character,
            });
            observations.push(ProtocolObservation::LocalPlayerChanged { uuid: Some(uuid) });
            let mut patch = EntityIdentityPatch {
                kind: FieldPatch::Set(EntityKind::Character),
                ..Default::default()
            };
            if let Some(name) = data.char_base.as_ref().and_then(|base| base.name.clone()) {
                patch.name = FieldPatch::Set(name);
            }
            let profession_list = data.profession_list.take();
            if let Some(profession_id) = profession_list
                .as_ref()
                .and_then(|list| list.cur_profession_id)
            {
                patch.profession_id = FieldPatch::Set(profession_id);
            }
            observations.push(ProtocolObservation::IdentityUpdated { uuid, patch });
            let talent = profession_list
                .as_ref()
                .map_or_else(LocalTalent::default, local_talent);
            self.profession_list = profession_list;
            observations.push(ProtocolObservation::LocalTalentChanged(talent));
            if let Some(fight_point) = data.char_base.as_ref().and_then(|base| base.fight_point) {
                observations.push(integer_attribute(
                    uuid,
                    attr_type::ATTR_FIGHT_POINT,
                    i64::from(fight_point),
                    ObservationOrigin::Snapshot,
                ));
            }
            if let Some(level) = data.role_level.as_ref().and_then(|level| level.level) {
                observations.push(integer_attribute(
                    uuid,
                    attr_type::ATTR_LEVEL,
                    i64::from(level),
                    ObservationOrigin::Snapshot,
                ));
            }
        }

        if let Some(season) = data.season_cultivate_line_data {
            let state = season_cultivate_state(&season);
            self.season_data = Some(season);
            observations.push(ProtocolObservation::SeasonCultivateSnapshot {
                season_id: state.season_id,
                active_template_ids: state.active_template_ids,
                active_item_ids: state.active_item_ids,
            });
        } else {
            observations.push(ProtocolObservation::SeasonCultivateSnapshot {
                season_id: 0,
                active_template_ids: Vec::new(),
                active_item_ids: Vec::new(),
            });
        }
        observations
    }

    fn decode_container_delta(
        &mut self,
        message: blueprotobuf::SyncContainerDirtyData,
    ) -> Vec<ProtocolObservation> {
        let Some(bytes) = message.v_data.and_then(|stream| stream.buffer) else {
            return Vec::new();
        };

        // Season and profession sections are independent: either may be absent
        // from a given dirty blob, and the season baseline may not exist yet
        // while profession deltas (e.g. a respec) still need to merge.
        let previous_items = self
            .season_data
            .as_ref()
            .map(|season| {
                season_cultivate_state(season)
                    .active_item_ids
                    .into_iter()
                    .collect::<BTreeSet<_>>()
            })
            .unwrap_or_default();

        let mut reader = DirtyReader::new(&bytes);
        let touched = match merge_char_serialize_dirty(
            &mut reader,
            self.season_data.as_mut(),
            self.profession_list.get_or_insert_with(Default::default),
        ) {
            Ok(touched) => touched,
            Err(error) => {
                log::warn!(target: "app::live", "container_dirty_merge_failed error={error:?}");
                return Vec::new();
            }
        };

        let mut observations = Vec::new();
        if touched.season && let Some(season) = self.season_data.as_ref() {
            let next = season_cultivate_state(season);
            let next_items = next
                .active_item_ids
                .iter()
                .copied()
                .collect::<BTreeSet<_>>();
            observations.push(ProtocolObservation::SeasonCultivateDelta {
                season_id: next.season_id,
                active_template_ids: next.active_template_ids,
                activated_item_ids: next_items.difference(&previous_items).copied().collect(),
                deactivated_item_ids: previous_items
                    .difference(&next_items)
                    .copied()
                    .collect(),
            });
        }
        if touched.profession {
            let talent = self
                .profession_list
                .as_ref()
                .map_or_else(LocalTalent::default, local_talent);
            observations.push(ProtocolObservation::LocalTalentChanged(talent));
        }
        observations
    }
}

fn decode_world_call(envelope: &CaptureEnvelope) -> Vec<ProtocolObservation> {
    if envelope.key.method_id != Some(world_call_method::USE_SLOT) {
        return Vec::new();
    }
    let use_slot = match decode_message::<blueprotobuf::UseSlot>(&envelope.payload) {
        Ok(message) => message,
        Err(_) => return Vec::new(),
    };
    let Some(request) = use_slot.v_request else {
        return Vec::new();
    };
    if request.use_type != Some(blueprotobuf::EUseSlotType::UseSlotTypeSkill as i32) {
        return Vec::new();
    }
    let Some(extra) = request.extra_data else {
        return Vec::new();
    };
    let param = match decode_message::<blueprotobuf::UseSkillParam>(&extra) {
        Ok(message) => message,
        Err(_) => return Vec::new(),
    };
    let Some(skill_id) = param.skillid else {
        return Vec::new();
    };
    vec![ProtocolObservation::LocalSkillRequested {
        skill_id,
        target_uuid: param.target_uuid.map(EntityUuid),
    }]
}

fn decode_match(envelope: &CaptureEnvelope) -> Vec<ProtocolObservation> {
    if envelope.key.method_id != Some(match_ntf_method::ENTER_MATCH_RESULT) {
        return Vec::new();
    }
    let Ok(message) = decode_message::<blueprotobuf::EnterMatchResultNtf>(&envelope.payload) else {
        return Vec::new();
    };
    let is_waiting_for_ready = message
        .v_request
        .and_then(|request| request.match_info)
        .and_then(|info| info.match_status)
        == Some(blueprotobuf::EMatchStatus::WaitReady as i32);
    if !is_waiting_for_ready {
        return Vec::new();
    }

    log::info!("matchmaking ready notification detected");
    vec![ProtocolObservation::MatchmakingPopped]
}

fn decode_team(envelope: &CaptureEnvelope) -> Vec<ProtocolObservation> {
    let Some(method_id) = envelope.key.method_id else {
        return Vec::new();
    };
    let Some(event) = decode_team_event(method_id, &envelope.payload) else {
        return Vec::new();
    };
    match event {
        TeamWireEvent::TeamInfoUpdated {
            team_id,
            leader_uuid,
        } => vec![team_info_updated(team_id, leader_uuid)],
        TeamWireEvent::MemberInfoUpdated { members } => {
            vec![team_members_updated(members)]
        }
        TeamWireEvent::Joined {
            team_id,
            leader_uuid,
            members,
        } => vec![
            team_info_updated(team_id, leader_uuid),
            team_members_updated(members),
        ],
        TeamWireEvent::Left { member_uuid } => vec![ProtocolObservation::TeamMemberLeft {
            member_uuid: EntityUuid(member_uuid),
        }],
        TeamWireEvent::Dissolved => vec![ProtocolObservation::TeamDissolved],
        TeamWireEvent::TeamVoteStarted { creator_uuid } => {
            log::info!("team activity vote notification detected");
            vec![ProtocolObservation::TeamVoteStarted {
                creator_uuid: creator_uuid.map(EntityUuid),
            }]
        }
    }
}

fn team_info_updated(team_id: i64, leader_uuid: i64) -> ProtocolObservation {
    ProtocolObservation::TeamInfoUpdated {
        team_id,
        leader_uuid: (leader_uuid != 0).then_some(EntityUuid(leader_uuid)),
    }
}

fn team_members_updated(members: Vec<i64>) -> ProtocolObservation {
    ProtocolObservation::TeamMembersUpdated {
        members: members
            .into_iter()
            .filter(|uuid| *uuid != 0)
            .map(EntityUuid)
            .collect(),
    }
}

fn parse_hit_core(info: &blueprotobuf::SyncDamageInfo) -> Option<HitCore> {
    let non_lucky_damage = info.value;
    let lucky_value = info.lucky_value;
    let value = u128::try_from(non_lucky_damage.or(lucky_value)?).ok()?;
    let hp_loss = u128::try_from(info.hp_lessen_value.unwrap_or(0).max(0))
        .expect("non-negative hp loss fits u128");
    let shield_loss = u128::try_from(info.shield_lessen_value.unwrap_or(0).max(0))
        .expect("non-negative shield loss fits u128");

    Some(HitCore {
        value,
        is_heal: info.r#type.unwrap_or_default() == blueprotobuf::EDamageType::Heal as i32,
        is_lucky_bonus_only: non_lucky_damage.is_none() && lucky_value.is_some(),
        has_loss_breakdown: info.hp_lessen_value.is_some() || info.shield_lessen_value.is_some(),
        hp_loss,
        shield_loss,
    })
}

fn decode_team_event(method_id: u32, payload: &[u8]) -> Option<TeamWireEvent> {
    match method_id {
        grpc_team_method::NOTICE_UPDATE_TEAM_INFO => {
            match decode_message::<blueprotobuf::NoticeUpdateTeamInfo>(payload) {
                Ok(message) => {
                    message
                        .v_request
                        .and_then(|request| request.base_info)
                        .map(|base_info| TeamWireEvent::TeamInfoUpdated {
                            team_id: base_info.team_id.unwrap_or_default(),
                            leader_uuid: canonical_player_uuid(
                                base_info.leader_id.unwrap_or_default(),
                            ),
                        })
                }
                Err(category) => {
                    log::warn!("failed to decode NoticeUpdateTeamInfo: {category:?}");
                    None
                }
            }
        }
        grpc_team_method::NOTICE_UPDATE_TEAM_MEMBER_INFO => {
            match decode_message::<blueprotobuf::NoticeUpdateTeamMemberInfo>(payload) {
                Ok(message) => message.v_request.map(|request| {
                    let mut members = Vec::new();
                    for member in request.team_member_social_datas {
                        push_team_member_id(&mut members, member.char_id);
                    }
                    for member in request.team_member_sync_datas {
                        push_team_member_id(&mut members, member.char_id);
                    }
                    TeamWireEvent::MemberInfoUpdated { members }
                }),
                Err(category) => {
                    log::warn!("failed to decode NoticeUpdateTeamMemberInfo: {category:?}");
                    None
                }
            }
        }
        grpc_team_method::NOTIFY_JOIN_TEAM => {
            match decode_message::<blueprotobuf::NotifyJoinTeam>(payload) {
                Ok(message) => message.v_request.and_then(|request| {
                    let base_info = request.base_info?;
                    let mut members = Vec::new();
                    for member in request.member_data {
                        push_team_member_id(&mut members, member.char_id);
                    }
                    let mut sync_members: Vec<_> = request.member_sync_datas.into_iter().collect();
                    sync_members.sort_by_key(|(char_id, _)| *char_id);
                    for (char_id, member) in sync_members {
                        push_team_member_id(&mut members, Some(char_id));
                        push_team_member_id(&mut members, member.char_id);
                    }
                    Some(TeamWireEvent::Joined {
                        team_id: base_info.team_id.unwrap_or_default(),
                        leader_uuid: canonical_player_uuid(base_info.leader_id.unwrap_or_default()),
                        members,
                    })
                }),
                Err(category) => {
                    log::warn!("failed to decode NotifyJoinTeam: {category:?}");
                    None
                }
            }
        }
        grpc_team_method::NOTIFY_LEAVE_TEAM => {
            match decode_message::<blueprotobuf::NotifyLeaveTeam>(payload) {
                Ok(message) => message.v_request.map(|request| TeamWireEvent::Left {
                    member_uuid: canonical_player_uuid(request.char_id.unwrap_or_default()),
                }),
                Err(category) => {
                    log::warn!("failed to decode NotifyLeaveTeam: {category:?}");
                    None
                }
            }
        }
        grpc_team_method::NOTICE_TEAM_DISSOLVE => Some(TeamWireEvent::Dissolved),
        grpc_team_method::NOTIFY_TEAM_ACTIVITY_STATE => {
            match decode_message::<blueprotobuf::NotifyTeamActivityState>(payload) {
                Ok(message) => message.v_request.and_then(|request| {
                    let state = request.state?;
                    if state.state != Some(blueprotobuf::ETeamActivityState::Voting as i32) {
                        return None;
                    }
                    let creator_uuid = state
                        .assign_scene_params
                        .and_then(|params| params.creator_char_id)
                        .filter(|char_id| *char_id != 0)
                        .map(canonical_player_uuid);
                    Some(TeamWireEvent::TeamVoteStarted { creator_uuid })
                }),
                Err(category) => {
                    log::warn!("failed to decode NotifyTeamActivityState: {category:?}");
                    None
                }
            }
        }
        grpc_team_method::NOTIFY_BE_TRANSFER_LEADER => {
            log::debug!(
                "GrpcTeamNtf NotifyBeTransferLeader received; state decode not implemented"
            );
            None
        }
        method_id => {
            log::trace!("unhandled GrpcTeamNtf method_id={method_id}");
            None
        }
    }
}

fn push_team_member_id(members: &mut Vec<i64>, member_id: Option<i64>) {
    let Some(member_id) = member_id.filter(|member_id| *member_id != 0) else {
        return;
    };
    let member_uuid = canonical_player_uuid(member_id);
    if !members.contains(&member_uuid) {
        members.push(member_uuid);
    }
}

struct SeasonCultivateState {
    season_id: i32,
    active_template_ids: Vec<i32>,
    active_item_ids: Vec<i32>,
}

fn season_cultivate_state(data: &blueprotobuf::SeasonCultivateLineData) -> SeasonCultivateState {
    let Some((&season_id, sub_type)) = data
        .season_cultivate_line_map
        .iter()
        .filter_map(|(season_id, line)| {
            let sub_type = line
                .cultivate_line_map
                .get(&SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP)?;
            (!sub_type.cultivate_line_data_map.is_empty()).then_some((season_id, sub_type))
        })
        .max_by_key(|(season_id, _)| **season_id)
    else {
        return SeasonCultivateState {
            season_id: 0,
            active_template_ids: Vec::new(),
            active_item_ids: Vec::new(),
        };
    };

    let mut active_template_ids: Vec<i32> = if sub_type.cultivate_line_area_list.is_empty() {
        sub_type
            .cultivate_line_data_map
            .iter()
            .filter(|(_, area)| area.is_active.unwrap_or(false))
            .map(|(template_id, _)| *template_id)
            .collect()
    } else {
        sub_type.cultivate_line_area_list.clone()
    };

    let mut active_item_ids = Vec::new();
    for template_id in &active_template_ids {
        if let Some(area) = sub_type.cultivate_line_data_map.get(template_id) {
            active_item_ids.extend(
                area.cultivate_middle_node_map
                    .values()
                    .filter_map(|node| node.item_id),
            );
        }
    }

    active_template_ids.sort_unstable();
    active_template_ids.dedup();
    active_item_ids.sort_unstable();
    active_item_ids.dedup();

    SeasonCultivateState {
        season_id,
        active_template_ids,
        active_item_ids,
    }
}

/// Which `CharSerialize` sections a dirty blob actually touched.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct CharSerializeDirtyTouched {
    season: bool,
    profession: bool,
}

/// Local talent state derived from a (possibly partially merged)
/// `ProfessionList`: the current profession plus its active talent branch.
fn local_talent(list: &blueprotobuf::ProfessionList) -> LocalTalent {
    let profession_id = list.cur_profession_id;
    let talent_stage_cfg_id = profession_id
        .and_then(|id| list.talent_list.get(&id))
        .and_then(|info| info.talent_stage_cfg_id);
    LocalTalent {
        profession_id,
        talent_stage_cfg_id,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DirtyParseError {
    UnexpectedEnd,
    InvalidMarker(i32),
    InvalidBlockSize(i32),
    InvalidFieldId(i32),
}

type DirtyResult<T> = Result<T, DirtyParseError>;

struct DirtyReader<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> DirtyReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    fn i32(&mut self) -> DirtyResult<i32> {
        if self.offset + 4 > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        let value = i32::from_le_bytes([
            self.data[self.offset],
            self.data[self.offset + 1],
            self.data[self.offset + 2],
            self.data[self.offset + 3],
        ]);
        self.offset += 4;
        Ok(value)
    }

    fn i64(&mut self) -> DirtyResult<i64> {
        if self.offset + 8 > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&self.data[self.offset..self.offset + 8]);
        self.offset += 8;
        Ok(i64::from_le_bytes(bytes))
    }

    fn bool(&mut self) -> DirtyResult<bool> {
        if self.offset >= self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        let value = self.data[self.offset] != 0;
        self.offset += 1;
        Ok(value)
    }

    fn skip_to(&mut self, offset: usize) -> DirtyResult<()> {
        if offset > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        self.offset = offset;
        Ok(())
    }

    fn peek_i32(&self) -> DirtyResult<i32> {
        if self.offset + 4 > self.data.len() {
            return Err(DirtyParseError::UnexpectedEnd);
        }
        Ok(i32::from_le_bytes([
            self.data[self.offset],
            self.data[self.offset + 1],
            self.data[self.offset + 2],
            self.data[self.offset + 3],
        ]))
    }
}

fn read_object_header(reader: &mut DirtyReader<'_>) -> DirtyResult<Option<usize>> {
    let begin = reader.i32()?;
    if begin != DIRTY_BEGIN {
        return Err(DirtyParseError::InvalidMarker(begin));
    }
    let size = reader.i32()?;
    if size == DIRTY_END {
        return Ok(None);
    }
    if size < 0 {
        return Err(DirtyParseError::InvalidBlockSize(size));
    }
    let end = reader
        .offset
        .checked_add(usize::try_from(size).map_err(|_| DirtyParseError::InvalidBlockSize(size))?)
        .ok_or(DirtyParseError::UnexpectedEnd)?;
    if end.checked_add(4).is_none_or(|end| end > reader.data.len()) {
        return Err(DirtyParseError::UnexpectedEnd);
    }
    Ok(Some(end))
}

fn finish_object(reader: &mut DirtyReader<'_>, end: usize) -> DirtyResult<()> {
    reader.skip_to(end)?;
    let marker = reader.i32()?;
    if marker != DIRTY_END {
        return Err(DirtyParseError::InvalidMarker(marker));
    }
    Ok(())
}

fn skip_object(reader: &mut DirtyReader<'_>) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    finish_object(reader, end)
}

fn merge_char_serialize_dirty(
    reader: &mut DirtyReader<'_>,
    season_data: Option<&mut blueprotobuf::SeasonCultivateLineData>,
    profession_list: &mut blueprotobuf::ProfessionList,
) -> DirtyResult<CharSerializeDirtyTouched> {
    let mut season_data = season_data;
    let mut touched = CharSerializeDirtyTouched::default();
    let Some(end) = read_object_header(reader)? else {
        return Ok(touched);
    };
    while reader.offset < end {
        let field_id = reader.i32()?;
        if field_id <= 0 {
            return Err(DirtyParseError::InvalidFieldId(field_id));
        }
        match field_id {
            CHAR_SERIALIZE_FIELD_SEASON_CULTIVATE => {
                if let Some(season) = season_data.as_deref_mut() {
                    merge_season_cultivate_line_data(reader, season)?;
                    touched.season = true;
                } else {
                    skip_object(reader)?;
                }
            }
            CHAR_SERIALIZE_FIELD_PROFESSION_LIST => {
                merge_profession_list(reader, profession_list)?;
                touched.profession = true;
            }
            _ if reader.peek_i32()? == DIRTY_BEGIN => skip_object(reader)?,
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)?;
    Ok(touched)
}

fn merge_season_cultivate_line_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::SeasonCultivateLineData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        let field_id = reader.i32()?;
        if field_id == 1 {
            merge_i32_object_map(
                reader,
                &mut data.season_cultivate_line_map,
                merge_cultivate_line_data,
                blueprotobuf::CultivateLineData::default,
            )?;
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_line_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateLineData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        let field_id = reader.i32()?;
        if field_id == 1 {
            merge_i32_object_map(
                reader,
                &mut data.cultivate_line_map,
                merge_cultivate_line_sub_type_data,
                blueprotobuf::CultivateLineSubTypeData::default,
            )?;
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_line_sub_type_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateLineSubTypeData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        match reader.i32()? {
            1 => merge_i32_object_map(
                reader,
                &mut data.cultivate_line_data_map,
                merge_cultivate_area_data,
                blueprotobuf::CultivateAreaData::default,
            )?,
            2 => data.cultivate_line_area_list = parse_repeated_i32(reader)?,
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_area_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateAreaData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    // Every tag `CultivateAreaData` defines is handled below. This matters
    // beyond just dropping the unknown field's own value: the dirty-wire
    // format has no per-field length prefix, so `_ => reader.skip_to(end)`
    // jumps straight to the object's end and silently drops every field
    // that would otherwise follow it in the same patch.
    while reader.offset < end {
        match reader.i32()? {
            1 => merge_i32_object_map(
                reader,
                &mut data.cultivate_normal_node_map,
                merge_cultivate_normal_node_data,
                blueprotobuf::CultivateNormalNodeData::default,
            )?,
            2 => merge_i32_object_map(
                reader,
                &mut data.cultivate_middle_node_map,
                merge_cultivate_middle_node_data,
                blueprotobuf::CultivateMiddleNodeData::default,
            )?,
            3 => merge_i32_object_map(
                reader,
                &mut data.cultivate_big_node_map,
                merge_cultivate_big_node_data,
                blueprotobuf::CultivateBigNodeData::default,
            )?,
            4 => data.activate_effect_score = Some(reader.i32()?),
            5 => data.is_active = Some(reader.bool()?),
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_normal_node_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateNormalNodeData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        if reader.i32()? == 1 {
            data.active_level = Some(reader.i32()?);
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_middle_node_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateMiddleNodeData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        if reader.i32()? == 1 {
            data.item_id = Some(reader.i32()?);
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_cultivate_big_node_data(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::CultivateBigNodeData,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        if reader.i32()? == 1 {
            data.fantasy_id = Some(reader.i32()?);
        } else {
            reader.skip_to(end)?;
        }
    }
    finish_object(reader, end)
}

fn merge_i32_object_map<T>(
    reader: &mut DirtyReader<'_>,
    map: &mut HashMap<i32, T>,
    merge_value: fn(&mut DirtyReader<'_>, &mut T) -> DirtyResult<()>,
    default_value: fn() -> T,
) -> DirtyResult<()> {
    let first = reader.i32()?;
    if first == -4 {
        return Ok(());
    }
    let (update_count, remove_count, add_count) = if first == -1 {
        (reader.i32()?, 0, 0)
    } else {
        (first, reader.i32()?, reader.i32()?)
    };
    for _ in 0..update_count {
        let key = reader.i32()?;
        let entry = map.entry(key).or_insert_with(default_value);
        merge_value(reader, entry)?;
    }
    for _ in 0..remove_count {
        map.remove(&reader.i32()?);
    }
    for _ in 0..add_count {
        let key = reader.i32()?;
        let entry = map.entry(key).or_insert_with(default_value);
        merge_value(reader, entry)?;
    }
    Ok(())
}

/// Same map header semantics as [`merge_i32_object_map`], for maps whose
/// values are scalars instead of nested dirty objects.
fn merge_i32_value_map<T>(
    reader: &mut DirtyReader<'_>,
    map: &mut HashMap<i32, T>,
    read_value: fn(&mut DirtyReader<'_>) -> DirtyResult<T>,
) -> DirtyResult<()> {
    let first = reader.i32()?;
    if first == -4 {
        return Ok(());
    }
    let (update_count, remove_count, add_count) = if first == -1 {
        (reader.i32()?, 0, 0)
    } else {
        (first, reader.i32()?, reader.i32()?)
    };
    for _ in 0..update_count {
        let key = reader.i32()?;
        map.insert(key, read_value(reader)?);
    }
    for _ in 0..remove_count {
        map.remove(&reader.i32()?);
    }
    for _ in 0..add_count {
        let key = reader.i32()?;
        map.insert(key, read_value(reader)?);
    }
    Ok(())
}

/// `ProfessionList` dirty merge. Every tag the message defines must be
/// handled (or explicitly consumed) because the dirty-wire format has no
/// per-field length prefix: falling through to `skip_to(end)` would drop
/// every field after the first unknown scalar. Tags 11-17 exist on the wire
/// (resetProfessionListFlag, total*Mark, resetTalentMark*, pickProfessionId)
/// but are not in the local proto, so they are read and discarded.
fn merge_profession_list(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::ProfessionList,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        match reader.i32()? {
            1 => data.cur_profession_id = Some(reader.i32()?),
            3 => data.cur_assist_professions = parse_repeated_i32(reader)?,
            4 => merge_i32_object_map(
                reader,
                &mut data.profession_list,
                merge_profession_info,
                blueprotobuf::ProfessionInfo::default,
            )?,
            7 => merge_i32_object_map(
                reader,
                &mut data.aoyi_skill_info_map,
                merge_profession_skill_info,
                blueprotobuf::ProfessionSkillInfo::default,
            )?,
            8 => data.total_talent_points = Some(u32::try_from(reader.i32()?).unwrap_or(0)),
            9 => {
                data.total_talent_reset_count = Some(u32::try_from(reader.i32()?).unwrap_or(0));
            }
            10 => merge_i32_object_map(
                reader,
                &mut data.talent_list,
                merge_profession_talent_info,
                blueprotobuf::ProfessionTalentInfo::default,
            )?,
            11 => data.reset_profession_list_flag = Some(reader.i32()?),
            12 => data.total_attack_mark = Some(u32::try_from(reader.i32()?).unwrap_or(0)),
            13 => data.total_guard_mark = Some(u32::try_from(reader.i32()?).unwrap_or(0)),
            14 => data.total_heal_mark = Some(u32::try_from(reader.i32()?).unwrap_or(0)),
            15 => data.reset_talent_mark_item_flag = Some(reader.i32()?),
            16 => data.reset_talent_mark_item_pop_up_notice = Some(reader.i32()?),
            17 => data.pick_profession_id = Some(reader.i32()?),
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_profession_talent_info(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::ProfessionTalentInfo,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        match reader.i32()? {
            1 => data.used_talent_points = Some(u32::try_from(reader.i32()?).unwrap_or(0)),
            2 => {
                data.talent_node_ids = parse_repeated_i32(reader)?
                    .into_iter()
                    .map(|id| u32::try_from(id).unwrap_or(0))
                    .collect();
            }
            // Proto tag 3 does not exist; the stage is field 4.
            4 => data.talent_stage_cfg_id = Some(reader.i32()?),
            5 => data.talent_ilegal_reset_count = Some(reader.i32()?),
            6 => data.used_attack_mark = Some(reader.i32()?),
            7 => data.used_guard_mark = Some(reader.i32()?),
            8 => data.used_heal_mark = Some(reader.i32()?),
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_profession_info(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::ProfessionInfo,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        match reader.i32()? {
            1 => data.profession_id = Some(reader.i32()?),
            2 => data.level = Some(reader.i32()?),
            3 => data.experience = Some(reader.i64()?),
            4 => merge_i32_object_map(
                reader,
                &mut data.skill_info_map,
                merge_profession_skill_info,
                blueprotobuf::ProfessionSkillInfo::default,
            )?,
            6 => data.active_skill_ids = parse_repeated_i32(reader)?,
            7 => merge_i32_value_map(reader, &mut data.slot_skill_info_map, |r| r.i32())?,
            8 => data.use_skin_id = Some(reader.i32()?),
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn merge_profession_skill_info(
    reader: &mut DirtyReader<'_>,
    data: &mut blueprotobuf::ProfessionSkillInfo,
) -> DirtyResult<()> {
    let Some(end) = read_object_header(reader)? else {
        return Ok(());
    };
    while reader.offset < end {
        match reader.i32()? {
            1 => data.skill_id = Some(reader.i32()?),
            2 => data.level = Some(reader.i32()?),
            3 => data.replace_skill_ids = parse_repeated_i32(reader)?,
            4 => data.remodel_level = Some(reader.i32()?),
            5 => data.cur_skill_skin = Some(reader.i32()?),
            6 => merge_i32_value_map(reader, &mut data.active_skill_skins, |r| r.bool())?,
            _ => reader.skip_to(end)?,
        }
    }
    finish_object(reader, end)
}

fn parse_repeated_i32(reader: &mut DirtyReader<'_>) -> DirtyResult<Vec<i32>> {
    let count = reader.i32()?;
    if count < 0 {
        return Err(DirtyParseError::InvalidBlockSize(count));
    }
    let capacity = usize::try_from(count).map_err(|_| DirtyParseError::InvalidBlockSize(count))?;
    let mut result = Vec::with_capacity(capacity);
    for _ in 0..count {
        result.push(reader.i32()?);
    }
    Ok(result)
}

fn entity_kind(explicit: Option<i32>, uuid: EntityUuid) -> EntityKind {
    let entity_type = explicit
        .and_then(|value| blueprotobuf::EEntityType::try_from(value).ok())
        .or_else(|| blueprotobuf::EEntityType::try_from(entity_type_bits(uuid.0)).ok())
        .unwrap_or(blueprotobuf::EEntityType::EntErrType);
    match entity_type {
        blueprotobuf::EEntityType::EntChar => EntityKind::Character,
        blueprotobuf::EEntityType::EntMonster => EntityKind::Monster,
        blueprotobuf::EEntityType::EntDummy => EntityKind::Dummy,
        blueprotobuf::EEntityType::EntBullet | blueprotobuf::EEntityType::EntClientBullet => {
            EntityKind::Bullet
        }
        blueprotobuf::EEntityType::EntSceneObject | blueprotobuf::EEntityType::EntStaticObject => {
            EntityKind::SceneObject
        }
        blueprotobuf::EEntityType::EntErrType => EntityKind::Unknown,
        other => EntityKind::Other(other as i32),
    }
}

fn integer_attribute(
    uuid: EntityUuid,
    attr_id: i32,
    value: i64,
    origin: ObservationOrigin,
) -> ProtocolObservation {
    ProtocolObservation::AttributeUpdated {
        uuid,
        attr_id,
        value: AttributeValue::Int(value),
        origin,
    }
}

fn decode_optional_varint(raw: Option<&[u8]>) -> i64 {
    raw.and_then(decode_varint_i64).unwrap_or_default()
}

fn decode_varint_i64(raw: &[u8]) -> Option<i64> {
    let mut bytes = raw;
    prost::encoding::decode_varint(&mut bytes)
        .ok()
        .map(|value| value as i64)
}

fn decode_prefixed_string(raw: &[u8]) -> Option<String> {
    let mut bytes = raw;
    let length = usize::try_from(prost::encoding::decode_varint(&mut bytes).ok()?).ok()?;
    let value = bytes.get(..length)?;
    String::from_utf8(value.to_vec()).ok()
}

fn decode_attribute_value(raw: &[u8]) -> Option<AttributeValue> {
    decode_varint_i64(raw)
        .map(AttributeValue::Int)
        .or_else(|| decode_prefixed_string(raw).map(AttributeValue::Text))
}

fn decode_position(raw: &[u8]) -> Option<Position> {
    let position = decode_message::<blueprotobuf::Position>(raw).ok()?;
    Some(Position {
        x: position.x?,
        y: position.y?,
        z: position.z?,
    })
}

fn vector_position(position: &blueprotobuf::Vector3) -> Option<Position> {
    Some(Position {
        x: position.x?,
        y: position.y?,
        z: position.z?,
    })
}

fn decode_temp_attributes(
    uuid: EntityUuid,
    collection: &blueprotobuf::TempAttrCollection,
    origin: ObservationOrigin,
    observations: &mut Vec<ProtocolObservation>,
) {
    observations.extend(collection.attrs.iter().filter_map(|attr| {
        Some(ProtocolObservation::TempAttributeUpdated {
            entity_uuid: uuid,
            attr_id: attr.id?,
            value: attr.value.unwrap_or_default(),
            origin,
        })
    }));
}

fn parse_i64_sequence(raw: &[u8]) -> Option<Vec<i64>> {
    let mut bytes = raw;
    if prost::encoding::decode_varint(&mut bytes).ok()? != 0x0a {
        return None;
    }
    let length = usize::try_from(prost::encoding::decode_varint(&mut bytes).ok()?).ok()?;
    if bytes.remaining() < length {
        return None;
    }
    let mut packed = bytes.copy_to_bytes(length);
    let mut values = Vec::new();
    while packed.has_remaining() {
        values.push(prost::encoding::decode_varint(&mut packed).ok()? as i64);
    }
    Some(values)
}

#[derive(Clone, PartialEq, Message)]
struct HateInfoWire {
    #[prost(int64, tag = "1")]
    uuid: i64,
    #[prost(uint32, tag = "2")]
    value: u32,
}

fn decode_hate_list(raw: &[u8]) -> Option<Vec<HateEntry>> {
    let mut bytes = raw;
    let mut entries = Vec::new();
    while bytes.has_remaining() {
        if prost::encoding::decode_varint(&mut bytes).ok()? != 0x0a {
            return None;
        }
        let entry = HateInfoWire::decode_length_delimited(&mut bytes).ok()?;
        entries.push(HateEntry {
            entity_uuid: EntityUuid(entry.uuid),
            value: entry.value,
        });
    }
    Some(entries)
}

fn decode_shield_details(raw: &[u8]) -> Vec<ShieldDetail> {
    let mut bytes = raw;
    let mut entries = Vec::new();
    while bytes.has_remaining() {
        if prost::encoding::decode_varint(&mut bytes).ok() != Some(0x0a) {
            break;
        }
        let Some(length) = prost::encoding::decode_varint(&mut bytes)
            .ok()
            .and_then(|value| usize::try_from(value).ok())
        else {
            break;
        };
        if bytes.remaining() < length {
            break;
        }
        let mut entry = &bytes[..length];
        bytes.advance(length);
        let mut detail = ShieldDetail {
            buff_instance_id: 0,
            display_type: 0,
            current: 0,
            initial: 0,
            max: 0,
        };
        while entry.has_remaining() {
            let Some(tag) = prost::encoding::decode_varint(&mut entry).ok() else {
                break;
            };
            if tag & 7 != 0 {
                break;
            }
            let Some(value) = prost::encoding::decode_varint(&mut entry).ok() else {
                break;
            };
            match tag >> 3 {
                1 => detail.buff_instance_id = value as i64,
                2 => detail.display_type = value as i32,
                3 => detail.current = value as i64,
                4 => detail.initial = value as i64,
                5 => detail.max = value as i64,
                _ => {}
            }
        }
        entries.push(detail);
    }
    entries
}

fn decode_play_effect_ids(logic_effects: &[blueprotobuf::BuffEffectLogicInfo]) -> Vec<i32> {
    logic_effects
        .iter()
        .filter(|logic| {
            logic
                .effect_type
                .unwrap_or(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32)
                == blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32
        })
        .filter_map(|logic| {
            logic
                .raw_data
                .as_deref()
                .and_then(|raw| decode_message::<blueprotobuf::BuffEffectLogicPlayEffect>(raw).ok())
                .and_then(|effect| effect.effect_id)
        })
        .collect()
}

/// Slot/lock values from `BuffEventCustomize` (`logicIdx` 1-4).
///
/// Skips `BuffEffectStopAll` (init/refresh/settle wipe, not "already matched").
/// Each remaining payload is a PlayEffect `effect_id` or a 1-/2-byte integer;
/// parsers that treat the 2-byte blob as `BuffUuid` misread these.
fn decode_customize_values(logic_effects: &[blueprotobuf::BuffEffectLogicInfo]) -> Vec<i32> {
    logic_effects
        .iter()
        .filter(|logic| {
            logic
                .effect_type
                .unwrap_or(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32)
                != blueprotobuf::EBuffEffectLogicPbType::BuffEffectStopAll as i32
        })
        .filter_map(|logic| logic.raw_data.as_deref().and_then(decode_customize_value))
        .collect()
}

fn decode_customize_value(raw: &[u8]) -> Option<i32> {
    if let Ok(effect) = decode_message::<blueprotobuf::BuffEffectLogicPlayEffect>(raw)
        && let Some(effect_id) = effect.effect_id.filter(|id| *id != 0)
    {
        return Some(effect_id);
    }
    match raw {
        [byte] => Some(i32::from(*byte)),
        [low, high] => Some(i32::from(i16::from_le_bytes([*low, *high]))),
        _ => None,
    }
}

fn update_buff_times(
    buff: &mut ObservedBuff,
    source_create_time: Option<i64>,
    envelope: &CaptureEnvelope,
    clock_offset_ms: Option<i64>,
) {
    let started_wall_ms = source_create_time
        .and_then(|create_time| clock_offset_ms.map(|offset| create_time.saturating_add(offset)))
        .unwrap_or(envelope.captured_wall_ms);
    buff.started_wall_ms = Some(started_wall_ms);
    let captured_mono_ms = envelope.captured_mono_ns / 1_000_000;
    let elapsed_ms = envelope.captured_wall_ms.saturating_sub(started_wall_ms);
    let started_mono_ms = if elapsed_ms >= 0 {
        captured_mono_ms.saturating_sub(u64::try_from(elapsed_ms).unwrap_or(u64::MAX))
    } else {
        captured_mono_ms.saturating_add(elapsed_ms.unsigned_abs())
    };
    buff.started_mono_ms = Some(MonoTimeMs(started_mono_ms));
    buff.expires_wall_ms = None;
    buff.expires_mono_ms = None;
    if let Some(duration_ms) = buff.duration_ms.filter(|duration| *duration > 0) {
        buff.expires_wall_ms =
            Some(started_wall_ms.saturating_add(i64::try_from(duration_ms).unwrap_or(i64::MAX)));
        buff.expires_mono_ms = Some(MonoTimeMs(started_mono_ms.saturating_add(duration_ms)));
    }
}

fn skill_cooldown_state(cooldown: blueprotobuf::SkillCd) -> Option<SkillCooldownState> {
    Some(SkillCooldownState {
        skill_level_id: cooldown.skill_level_id?,
        begin_time: cooldown.begin_time,
        duration: cooldown.duration,
        cooldown_type: cooldown.skill_cd_type,
        valid_time: cooldown.valid_cd_time,
    })
}

fn scene_id_from_attrs(collection: &blueprotobuf::AttrCollection) -> Option<i32> {
    collection.attrs.iter().find_map(|attr| {
        (attr.id == Some(attr_type::ATTR_SCENE_BASIC_ID))
            .then(|| attr.raw_data.as_deref().and_then(decode_varint_i64))
            .flatten()
            .and_then(|value| i32::try_from(value).ok())
    })
}

fn decode_scene_events(
    message: blueprotobuf::SyncSceneEvents,
    envelope: &CaptureEnvelope,
) -> Vec<ProtocolObservation> {
    let Some(events) = message.evt else {
        return Vec::new();
    };
    events
        .events
        .into_iter()
        .filter_map(|event| {
            if event.event_type != Some(WORLD_EVENT_TYPE_BOSS_DBM) {
                return None;
            }
            let skill_effect_id = *event.int_params.first()?;
            let duration_seconds = *event.int_params.get(1)?;
            let duration_ms = u64::try_from(duration_seconds).ok()?.checked_mul(1_000)?;
            if duration_ms == 0 {
                return None;
            }
            let captured_mono_ms = envelope.captured_mono_ns / 1_000_000;
            Some(ProtocolObservation::BossMechanicStarted(
                BossMechanicObservation {
                    base_skill_id: skill_effect_id / 100,
                    skill_effect_id,
                    insertion: event.int_params.get(2).copied().unwrap_or_default(),
                    server_timestamp_ms: event.long_params.first().copied(),
                    duration_ms,
                    expires_mono_ms: MonoTimeMs(captured_mono_ms.saturating_add(duration_ms)),
                },
            ))
        })
        .collect()
}

const PROGRESS_STATE_VAR: &str = "ProgressState";

fn progress_state_from_dungeon_var(var: &blueprotobuf::DungeonVar) -> Option<i32> {
    var.dungeon_var_data.iter().find_map(|entry| {
        if entry.name.as_deref() == Some(PROGRESS_STATE_VAR) {
            entry.value
        } else {
            None
        }
    })
}

fn decode_dungeon_snapshot(message: blueprotobuf::SyncDungeonData) -> Vec<ProtocolObservation> {
    let mut observations = Vec::new();
    let Some(data) = message.v_data else {
        return observations;
    };
    if let Some(state) = data.flow_info.and_then(|flow| flow.state) {
        observations.push(ProtocolObservation::DungeonFlowChanged { state });
    }
    if let Some(targets) = data.target {
        observations.extend(targets.target_data.into_values().map(|target| {
            ProtocolObservation::DungeonObjectiveChanged {
                target_id: target.target_id.unwrap_or_default(),
                count: target.nums.unwrap_or_default(),
                complete: target.complete.unwrap_or_default() != 0,
            }
        }));
    }
    if let Some(value) = data
        .dungeon_var
        .as_ref()
        .and_then(progress_state_from_dungeon_var)
    {
        observations.push(ProtocolObservation::DungeonProgressStateChanged { value });
    }
    observations
}

fn decode_dungeon_delta(message: blueprotobuf::SyncDungeonDirtyData) -> Vec<ProtocolObservation> {
    let Some(bytes) = message.v_data.and_then(|stream| stream.buffer) else {
        return Vec::new();
    };
    let decoded = match crate::live::dungeon_dirty_blob::parse_dirty_dungeon_data(&bytes) {
        Ok(decoded) => decoded,
        Err(_) => return Vec::new(),
    };
    let mut observations = Vec::with_capacity(decoded.targets.len() + 2);
    if let Some(state) = decoded.flow_state {
        observations.push(ProtocolObservation::DungeonFlowChanged { state });
    }
    observations.extend(decoded.targets.into_iter().map(|target| {
        ProtocolObservation::DungeonObjectiveChanged {
            target_id: target.target_id,
            count: target.nums,
            complete: target.complete != 0,
        }
    }));
    if let Some(value) = decoded.progress_state {
        observations.push(ProtocolObservation::DungeonProgressStateChanged { value });
    }
    observations
}

fn decode_message<M>(payload: &[u8]) -> Result<M, prost::DecodeError>
where
    M: Message + Default,
{
    M::decode(payload)
}

fn is_synthetic_opcode(opcode: u32) -> bool {
    matches!(
        opcode,
        SYNTHETIC_STREAM_GAP_OPCODE
            | SYNTHETIC_REASSEMBLY_RESET_OPCODE
            | SYNTHETIC_DECODE_ISSUE_OPCODE
    )
}

fn timer_state(info: blueprotobuf::TimerInfo) -> Option<GameTimerState> {
    Some(GameTimerState {
        key: GameTimerKey {
            cfg_id: info.cfg_id?,
            timer_type: info.timer_type.unwrap_or_default(),
        },
        execution_type: info.cur_type.unwrap_or_default(),
        start_timestamp: info.start_timestamp,
        end_timestamp: info.end_timestamp,
        last_timestamp: info.last_time_stamp,
        last_end_timestamp: info.last_end_time_stamp,
        next_timestamp: info.next_time_stamp,
        next_end_timestamp: info.next_end_time_stamp,
        offsets: info.offset_list,
        duration_ms: info.duration,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notify<M: Message>(sequence: u64, opcode: Pkt, message: &M) -> CaptureEnvelope {
        CaptureEnvelope {
            capture_sequence: sequence,
            stream_id: 7,
            stream_epoch: 2,
            captured_wall_ms: 50_000,
            captured_mono_ns: sequence * 1_000_000,
            direction: PacketDirection::ServerToClient,
            key: crate::live::runtime::events::PacketKey {
                opcode: opcode as u32,
                service_id: Some(u32::try_from(WORLD_NTF_SERVICE_ID).unwrap()),
                method_id: Some(opcode as u32),
            },
            payload: message.encode_to_vec().into(),
        }
    }

    fn world_call<M: Message>(sequence: u64, method_id: u32, message: &M) -> CaptureEnvelope {
        CaptureEnvelope {
            capture_sequence: sequence,
            stream_id: 7,
            stream_epoch: 2,
            captured_wall_ms: 50_000,
            captured_mono_ns: sequence * 1_000_000,
            direction: PacketDirection::ClientToServer,
            key: crate::live::runtime::events::PacketKey {
                opcode: 0,
                service_id: Some(u32::try_from(WORLD_CALL_SERVICE_ID).unwrap()),
                method_id: Some(method_id),
            },
            payload: message.encode_to_vec().into(),
        }
    }

    fn service_notify<M: Message>(
        sequence: u64,
        service_id: u64,
        method_id: u32,
        message: &M,
    ) -> CaptureEnvelope {
        CaptureEnvelope {
            capture_sequence: sequence,
            stream_id: 7,
            stream_epoch: 2,
            captured_wall_ms: 50_000,
            captured_mono_ns: sequence * 1_000_000,
            direction: PacketDirection::ServerToClient,
            key: crate::live::runtime::events::PacketKey {
                opcode: method_id,
                service_id: Some(u32::try_from(service_id).expect("test service id fits u32")),
                method_id: Some(method_id),
            },
            payload: message.encode_to_vec().into(),
        }
    }

    fn canonical(char_id: i64) -> i64 {
        canonical_player_uuid(char_id)
    }

    #[test]
    fn negative_reported_hit_values_are_rejected() {
        let info = blueprotobuf::SyncDamageInfo {
            value: Some(-1),
            ..Default::default()
        };

        assert!(parse_hit_core(&info).is_none());
    }

    #[test]
    fn explicit_zero_hit_loss_does_not_fall_back_to_reported_damage() {
        let info = blueprotobuf::SyncDamageInfo {
            owner_id: Some(10),
            value: Some(100),
            hp_lessen_value: Some(0),
            shield_lessen_value: Some(0),
            ..Default::default()
        };

        let core = parse_hit_core(&info).expect("valid hit");
        assert!(core.has_loss_breakdown);
        assert_eq!(core.hp_loss.saturating_add(core.shield_loss), 0);
    }

    #[test]
    fn missing_hit_loss_breakdown_falls_back_to_reported_damage() {
        let info = blueprotobuf::SyncDamageInfo {
            owner_id: Some(10),
            value: Some(100),
            ..Default::default()
        };

        let core = parse_hit_core(&info).expect("valid hit");
        assert!(!core.has_loss_breakdown);
        assert_eq!(core.value, 100);
    }

    #[test]
    fn team_member_update_extracts_social_and_sync_member_ids() {
        let message = blueprotobuf::NoticeUpdateTeamMemberInfo {
            v_request: Some(blueprotobuf::NoticeUpdateTeamMemberInfoRequest {
                team_member_social_datas: vec![
                    blueprotobuf::TeamMemData {
                        char_id: Some(10),
                        ..Default::default()
                    },
                    blueprotobuf::TeamMemData {
                        char_id: Some(20),
                        ..Default::default()
                    },
                ],
                team_member_sync_datas: vec![
                    blueprotobuf::TeamMemberFastSyncData {
                        char_id: Some(20),
                        ..Default::default()
                    },
                    blueprotobuf::TeamMemberFastSyncData {
                        char_id: Some(0),
                        ..Default::default()
                    },
                ],
            }),
        };

        let event = decode_team_event(
            grpc_team_method::NOTICE_UPDATE_TEAM_MEMBER_INFO,
            &message.encode_to_vec(),
        );

        assert_eq!(
            event,
            Some(TeamWireEvent::MemberInfoUpdated {
                members: vec![canonical(10), canonical(20)],
            })
        );
    }

    #[test]
    fn join_team_merges_member_sources_in_stable_order() {
        let mut member_sync_datas = HashMap::new();
        member_sync_datas.insert(
            30,
            blueprotobuf::TeamMemberFastSyncData {
                char_id: None,
                ..Default::default()
            },
        );
        member_sync_datas.insert(
            20,
            blueprotobuf::TeamMemberFastSyncData {
                char_id: Some(25),
                ..Default::default()
            },
        );
        let message = blueprotobuf::NotifyJoinTeam {
            v_request: Some(blueprotobuf::NotifyJoinTeamRequest {
                base_info: Some(blueprotobuf::TeamBaseInfo {
                    team_id: Some(7),
                    leader_id: Some(10),
                    ..Default::default()
                }),
                member_data: vec![blueprotobuf::TeamMemData {
                    char_id: Some(10),
                    ..Default::default()
                }],
                member_sync_datas,
                ..Default::default()
            }),
        };

        let event = decode_team_event(grpc_team_method::NOTIFY_JOIN_TEAM, &message.encode_to_vec());

        assert_eq!(
            event,
            Some(TeamWireEvent::Joined {
                team_id: 7,
                leader_uuid: canonical(10),
                members: vec![canonical(10), canonical(20), canonical(25), canonical(30)],
            })
        );
    }

    #[test]
    fn every_input_produces_a_batch_and_malformed_is_dropped() {
        let mut decoder = ProtocolDecoder::new();
        let mut envelope = notify(
            9,
            Pkt::NotifyTimerList,
            &blueprotobuf::NotifyTimerList::default(),
        );
        envelope.payload = bytes::Bytes::from_static(&[0x0a, 0xff]);

        let batch = decoder.decode(envelope);
        assert_eq!(batch.meta.capture_sequence, 9);
        assert!(batch.observations.is_empty());
    }

    #[test]
    fn timer_list_and_update_are_protocol_neutral() {
        let listed_timer = blueprotobuf::TimerInfo {
            cfg_id: Some(42),
            timer_type: Some(3),
            cur_type: Some(1),
            start_timestamp: Some(100),
            end_timestamp: Some(200),
            duration: Some(100),
            ..Default::default()
        };
        let list = blueprotobuf::NotifyTimerList {
            timer_info: Some(blueprotobuf::NotifyTimerListParam {
                timer_info_list: vec![listed_timer.clone()],
            }),
        };
        let update = blueprotobuf::NotifyTimerUpdate {
            timer_info: Some(blueprotobuf::TimerInfo {
                cur_type: Some(2),
                ..listed_timer
            }),
        };
        let mut decoder = ProtocolDecoder::new();

        let list_batch = decoder.decode(notify(1, Pkt::NotifyTimerList, &list));
        let update_batch = decoder.decode(notify(2, Pkt::NotifyTimerUpdate, &update));

        let [ProtocolObservation::GameTimerSnapshot { timers }] =
            list_batch.observations.as_slice()
        else {
            panic!("timer snapshot observation expected");
        };
        assert_eq!(timers[0].key.cfg_id, 42);
        assert_eq!(timers[0].execution_type, 1);
        assert_eq!(timers[0].end_timestamp, Some(200));
        let [ProtocolObservation::GameTimerUpserted { timer }] =
            update_batch.observations.as_slice()
        else {
            panic!("timer update observation expected");
        };
        assert_eq!(timer.key, timers[0].key);
        assert_eq!(timer.execution_type, 2);
    }

    #[test]
    fn local_cast_request_and_skill_attribute_stay_separate_observations() {
        const SKILL_ID: i32 = 1_714;
        let caster = EntityUuid(10);
        let param = blueprotobuf::UseSkillParam {
            skillid: Some(SKILL_ID),
            target_uuid: Some(77),
            ..Default::default()
        };
        let call = blueprotobuf::UseSlot {
            v_request: Some(blueprotobuf::UseSlotRequest {
                use_type: Some(blueprotobuf::EUseSlotType::UseSlotTypeSkill as i32),
                extra_data: Some(param.encode_to_vec()),
                ..Default::default()
            }),
        };
        let mut raw_skill_id = Vec::new();
        prost::encoding::encode_varint(SKILL_ID as u64, &mut raw_skill_id);
        let attr_delta = blueprotobuf::SyncNearDeltaInfo {
            delta_infos: vec![blueprotobuf::AoiSyncDelta {
                uuid: Some(caster.0),
                attrs: Some(blueprotobuf::AttrCollection {
                    attrs: vec![blueprotobuf::Attr {
                        id: Some(attr_type::ATTR_SKILL_ID),
                        raw_data: Some(raw_skill_id),
                    }],
                    ..Default::default()
                }),
                ..Default::default()
            }],
        };
        let mut decoder = ProtocolDecoder::new();

        let requested = decoder.decode(world_call(1, world_call_method::USE_SLOT, &call));
        let observed = decoder.decode(notify(2, Pkt::SyncNearDeltaInfo, &attr_delta));

        // The decoder reports both wire facts verbatim; collapsing the request
        // and the resulting attribute into one cast belongs to EntityContext.
        assert_eq!(
            requested.observations,
            vec![ProtocolObservation::LocalSkillRequested {
                skill_id: SKILL_ID,
                target_uuid: Some(EntityUuid(77)),
            }]
        );
        assert!(
            observed
                .observations
                .contains(&ProtocolObservation::SkillLifecycleChanged {
                    caster_uuid: caster,
                    skill_id: SKILL_ID,
                    phase: SkillPhase::Observed,
                    target_uuid: None,
                })
        );
    }

    #[test]
    fn server_skill_end_reports_local_completion_without_a_caster() {
        let message = blueprotobuf::SyncServerSkillEnd {
            skill_uuid: Some(1_714),
        };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::SyncServerSkillEnd, &message));

        assert_eq!(
            batch.observations,
            vec![ProtocolObservation::LocalSkillCompleted { skill_id: 1_714 }]
        );
    }

    #[test]
    fn to_me_delta_without_uuid_addresses_the_local_player_sentinel() {
        let message = blueprotobuf::SyncToMeDeltaInfo {
            delta_info: Some(blueprotobuf::AoiSyncToMeDelta {
                sync_skill_c_ds: vec![blueprotobuf::SkillCd {
                    skill_level_id: Some(5),
                    ..Default::default()
                }],
                ..Default::default()
            }),
        };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::SyncToMeDeltaInfo, &message));

        let [ProtocolObservation::SkillCooldownUpdated { entity_uuid, .. }] =
            batch.observations.as_slice()
        else {
            panic!("cooldown observation expected");
        };
        assert_eq!(*entity_uuid, LOCAL_PLAYER);
    }

    #[test]
    fn team_events_are_reported_without_decoder_side_membership_state() {
        let dissolve = CaptureEnvelope {
            capture_sequence: 1,
            stream_id: 7,
            stream_epoch: 2,
            captured_wall_ms: 50_000,
            captured_mono_ns: 1_000_000,
            direction: PacketDirection::ServerToClient,
            key: crate::live::runtime::events::PacketKey {
                opcode: 0,
                service_id: Some(u32::try_from(GRPC_TEAM_NTF_SERVICE_ID).unwrap()),
                method_id: Some(grpc_team_method::NOTICE_TEAM_DISSOLVE),
            },
            payload: bytes::Bytes::new(),
        };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(dissolve);

        assert_eq!(batch.observations, vec![ProtocolObservation::TeamDissolved]);
    }

    #[test]
    fn matchmaking_alert_only_fires_while_waiting_for_ready() {
        let message = |status| blueprotobuf::EnterMatchResultNtf {
            v_request: Some(blueprotobuf::EnterMatchResultNtfRequest {
                match_info: Some(blueprotobuf::MatchInfo {
                    match_status: Some(status as i32),
                }),
            }),
        };
        let mut decoder = ProtocolDecoder::new();

        let waiting = decoder.decode(service_notify(
            1,
            MATCH_NTF_SERVICE_ID,
            match_ntf_method::ENTER_MATCH_RESULT,
            &message(blueprotobuf::EMatchStatus::WaitReady),
        ));
        let matching = decoder.decode(service_notify(
            2,
            MATCH_NTF_SERVICE_ID,
            match_ntf_method::ENTER_MATCH_RESULT,
            &message(blueprotobuf::EMatchStatus::Matching),
        ));

        assert_eq!(
            waiting.observations,
            vec![ProtocolObservation::MatchmakingPopped]
        );
        assert!(matching.observations.is_empty());
    }

    #[test]
    fn team_vote_alert_only_fires_for_voting_state() {
        let message = |state| blueprotobuf::NotifyTeamActivityState {
            v_request: Some(blueprotobuf::NotifyTeamActivityStateRequest {
                state: Some(blueprotobuf::TeamActivity {
                    state: Some(state as i32),
                    assign_scene_params: Some(blueprotobuf::AssignSceneParams {
                        creator_char_id: Some(42),
                    }),
                }),
            }),
        };
        let mut decoder = ProtocolDecoder::new();

        let voting = decoder.decode(service_notify(
            1,
            GRPC_TEAM_NTF_SERVICE_ID,
            grpc_team_method::NOTIFY_TEAM_ACTIVITY_STATE,
            &message(blueprotobuf::ETeamActivityState::Voting),
        ));
        let doing = decoder.decode(service_notify(
            2,
            GRPC_TEAM_NTF_SERVICE_ID,
            grpc_team_method::NOTIFY_TEAM_ACTIVITY_STATE,
            &message(blueprotobuf::ETeamActivityState::Doing),
        ));

        assert_eq!(
            voting.observations,
            vec![ProtocolObservation::TeamVoteStarted {
                creator_uuid: Some(EntityUuid(canonical(42))),
            }]
        );
        assert!(doing.observations.is_empty());
    }

    #[test]
    fn ready_check_opcode_fires_without_decoding_payload() {
        let message = blueprotobuf::NoticeTeamDissolveRequest {};
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::NotifyAllMemberReady, &message));

        assert_eq!(
            batch.observations,
            vec![ProtocolObservation::ReadyCheckStarted]
        );
    }

    #[test]
    fn hit_fields_are_preserved_and_missing_owner_is_rejected() {
        let damage = blueprotobuf::SyncDamageInfo {
            damage_source: Some(2),
            value: Some(123),
            hp_lessen_value: Some(100),
            shield_lessen_value: Some(23),
            attacker_uuid: Some(10),
            top_summoner_id: Some(11),
            owner_id: Some(99),
            owner_level: Some(2),
            hit_event_id: Some(7),
            type_flag: Some(5),
            property: Some(8),
            damage_mode: Some(9),
            is_dead: Some(true),
            ..Default::default()
        };
        let missing_owner = blueprotobuf::SyncDamageInfo {
            value: Some(999),
            attacker_uuid: Some(10),
            ..Default::default()
        };
        let message = blueprotobuf::SyncNearDeltaInfo {
            delta_infos: vec![blueprotobuf::AoiSyncDelta {
                uuid: Some(20),
                skill_effects: Some(blueprotobuf::SkillEffect {
                    damages: vec![damage, missing_owner],
                    ..Default::default()
                }),
                ..Default::default()
            }],
        };
        let mut decoder = ProtocolDecoder::new();
        let batch = decoder.decode(notify(1, Pkt::SyncNearDeltaInfo, &message));
        let hits: Vec<_> = batch
            .observations
            .iter()
            .filter_map(|observation| match observation {
                ProtocolObservation::HitResolved(hit) => Some(hit),
                _ => None,
            })
            .collect();

        assert_eq!(hits.len(), 1);
        assert!(
            !batch.observations.iter().any(|observation| {
                !matches!(
                    observation,
                    ProtocolObservation::EntityAppeared { .. }
                        | ProtocolObservation::HitResolved(_)
                )
            }),
            "is_dead on a damage packet must not emit a death observation: {:?}",
            batch.observations
        );
        assert_eq!(hits[0].source_uuid, Some(EntityUuid(10)));
        assert_eq!(hits[0].source_owner_uuid, Some(EntityUuid(11)));
        assert_eq!(hits[0].amount, 123);
        assert_eq!(hits[0].hp_loss, 100);
        assert_eq!(hits[0].shield_loss, 23);
        assert_eq!(hits[0].property, Some(8));
        assert_eq!(hits[0].damage_mode, Some(9));
    }

    #[test]
    fn buff_snapshot_contains_only_normalized_state() {
        let message = blueprotobuf::SyncNearEntities {
            appear: vec![blueprotobuf::Entity {
                uuid: Some(20),
                buff_infos: Some(blueprotobuf::BuffInfoSync {
                    uuid: Some(20),
                    buff_infos: vec![
                        blueprotobuf::BuffInfo {
                            buff_uuid: Some(7),
                            base_id: Some(8),
                            layer: Some(2),
                            duration: Some(3_000),
                            fire_uuid: Some(10),
                            ..Default::default()
                        },
                        blueprotobuf::BuffInfo {
                            buff_uuid: Some(9),
                            base_id: Some(10),
                            ..Default::default()
                        },
                    ],
                }),
                ..Default::default()
            }],
            ..Default::default()
        };
        let mut decoder = ProtocolDecoder::new();
        let batch = decoder.decode(notify(1, Pkt::SyncNearEntities, &message));

        let [.., ProtocolObservation::BuffSnapshot { target_uuid, buffs }] =
            batch.observations.as_slice()
        else {
            panic!("buff snapshot observation expected last");
        };
        assert_eq!(*target_uuid, EntityUuid(20));
        assert_eq!(buffs[0].instance_id, 7);
        assert_eq!(buffs[0].base_id, 8);
        assert_eq!(buffs[0].duration_ms, Some(3_000));
        assert_eq!(buffs[0].started_wall_ms, Some(50_000));
        assert_eq!(buffs[0].started_mono_ms, Some(MonoTimeMs(1)));
        assert_eq!(buffs[0].expires_wall_ms, Some(53_000));
        assert_eq!(buffs[0].expires_mono_ms, Some(MonoTimeMs(3_001)));
        assert_eq!(buffs[1].duration_ms, None);
        assert_eq!(buffs[1].started_wall_ms, Some(50_000));
        assert_eq!(buffs[1].started_mono_ms, Some(MonoTimeMs(1)));
        assert_eq!(buffs[1].expires_wall_ms, None);
        assert_eq!(buffs[1].expires_mono_ms, None);
    }

    #[test]
    fn buff_effect_uses_outer_id_and_preserves_logic_order() {
        let add = blueprotobuf::BuffEffectLogicInfo {
            effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::BuffEffectAddBuff as i32),
            raw_data: Some(
                blueprotobuf::BuffInfo {
                    buff_uuid: None,
                    base_id: Some(8),
                    duration: Some(0),
                    ..Default::default()
                }
                .encode_to_vec(),
            ),
            ..Default::default()
        };
        let play_effect = blueprotobuf::BuffEffectLogicInfo {
            effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32),
            raw_data: Some(
                blueprotobuf::BuffEffectLogicPlayEffect {
                    effect_id: Some(900),
                }
                .encode_to_vec(),
            ),
            ..Default::default()
        };
        let change = |layer, duration| blueprotobuf::BuffEffectLogicInfo {
            effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::BuffEffectBuffChange as i32),
            raw_data: Some(
                blueprotobuf::BuffChange {
                    layer: Some(layer),
                    duration: Some(duration),
                    ..Default::default()
                }
                .encode_to_vec(),
            ),
            ..Default::default()
        };
        let sync = blueprotobuf::BuffEffectSync {
            uuid: Some(20),
            buff_effects: vec![blueprotobuf::BuffEffect {
                r#type: Some(blueprotobuf::EBuffEventType::BuffEventRemove as i32),
                buff_uuid: Some(77),
                host_uuid: Some(30),
                logic_effect: vec![add, play_effect, change(2, 100), change(3, 0)],
                ..Default::default()
            }],
        };
        let envelope = notify(
            1,
            Pkt::SyncNearDeltaInfo,
            &blueprotobuf::SyncNearDeltaInfo::default(),
        );
        let mut decoder = ProtocolDecoder::new();
        let mut observations = Vec::new();

        decoder.decode_buff_effect_sync(EntityUuid(10), &sync, &envelope, &mut observations);

        assert_eq!(observations.len(), 4);
        let ProtocolObservation::BuffChanged {
            target_uuid,
            change: ObservedBuffChange::Applied { buff },
        } = &observations[0]
        else {
            panic!("applied buff expected first");
        };
        assert_eq!(*target_uuid, EntityUuid(30));
        assert_eq!(buff.instance_id, 77);
        assert_eq!(buff.effect_ids.as_ref(), &[900]);
        assert_eq!(buff.duration_ms, Some(0));
        assert_eq!(buff.started_wall_ms, Some(50_000));
        assert_eq!(buff.started_mono_ms, Some(MonoTimeMs(1)));
        assert_eq!(buff.expires_wall_ms, None);
        assert_eq!(buff.expires_mono_ms, None);

        for (observation, (expected_layer, expected_duration)) in
            observations[1..3].iter().zip([(2, 100), (3, 0)])
        {
            let ProtocolObservation::BuffChanged {
                target_uuid,
                change:
                    ObservedBuffChange::Delta {
                        instance_id,
                        layer,
                        duration_ms,
                        effect_ids,
                        ..
                    },
            } = observation
            else {
                panic!("ordered buff delta expected");
            };
            assert_eq!(*target_uuid, EntityUuid(30));
            assert_eq!(*instance_id, 77);
            assert_eq!(*layer, Some(expected_layer));
            assert_eq!(*duration_ms, Some(expected_duration));
            assert_eq!(effect_ids.as_deref(), Some([900].as_slice()));
        }
        assert!(matches!(
            &observations[3],
            ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(30),
                change: ObservedBuffChange::Remove { instance_id: 77 },
            }
        ));
    }

    #[test]
    fn play_effect_only_does_not_emit_a_synthetic_change() {
        let play_effect = blueprotobuf::BuffEffectLogicInfo {
            effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32),
            raw_data: Some(
                blueprotobuf::BuffEffectLogicPlayEffect {
                    effect_id: Some(900),
                }
                .encode_to_vec(),
            ),
            ..Default::default()
        };
        let sync = blueprotobuf::BuffEffectSync {
            uuid: Some(20),
            buff_effects: vec![
                blueprotobuf::BuffEffect {
                    buff_uuid: Some(70),
                    logic_effect: vec![play_effect.clone()],
                    ..Default::default()
                },
                blueprotobuf::BuffEffect {
                    r#type: Some(blueprotobuf::EBuffEventType::BuffEventRemove as i32),
                    buff_uuid: Some(71),
                    logic_effect: vec![play_effect],
                    ..Default::default()
                },
            ],
        };
        let envelope = notify(
            1,
            Pkt::SyncNearDeltaInfo,
            &blueprotobuf::SyncNearDeltaInfo::default(),
        );
        let mut decoder = ProtocolDecoder::new();
        let mut observations = Vec::new();

        decoder.decode_buff_effect_sync(EntityUuid(10), &sync, &envelope, &mut observations);

        assert!(matches!(
            observations.as_slice(),
            [ProtocolObservation::BuffChanged {
                target_uuid: EntityUuid(20),
                change: ObservedBuffChange::Remove { instance_id: 71 },
            }]
        ));
    }

    fn play_effect_logic(effect_id: i32) -> blueprotobuf::BuffEffectLogicInfo {
        blueprotobuf::BuffEffectLogicInfo {
            effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32),
            raw_data: Some(
                blueprotobuf::BuffEffectLogicPlayEffect {
                    effect_id: Some(effect_id),
                }
                .encode_to_vec(),
            ),
            ..Default::default()
        }
    }

    fn customize_sync(
        host_uuid: i64,
        instance_id: i32,
        logic_effect: Vec<blueprotobuf::BuffEffectLogicInfo>,
    ) -> blueprotobuf::BuffEffectSync {
        blueprotobuf::BuffEffectSync {
            uuid: Some(host_uuid),
            buff_effects: vec![blueprotobuf::BuffEffect {
                r#type: Some(blueprotobuf::EBuffEventType::BuffEventCustomize as i32),
                buff_uuid: Some(instance_id),
                host_uuid: Some(host_uuid),
                logic_effect,
                ..Default::default()
            }],
        }
    }

    fn decode_customize_delta(
        sync: &blueprotobuf::BuffEffectSync,
    ) -> (EntityUuid, i64, Option<Arc<[i32]>>) {
        let envelope = notify(
            1,
            Pkt::SyncNearDeltaInfo,
            &blueprotobuf::SyncNearDeltaInfo::default(),
        );
        let mut decoder = ProtocolDecoder::new();
        let mut observations = Vec::new();
        decoder.decode_buff_effect_sync(EntityUuid(10), sync, &envelope, &mut observations);
        match observations.as_slice() {
            [
                ProtocolObservation::BuffChanged {
                    target_uuid,
                    change:
                        ObservedBuffChange::Delta {
                            instance_id,
                            effect_ids,
                            layer: None,
                            duration_ms: None,
                            create_time: None,
                        },
                },
            ] => (*target_uuid, *instance_id, effect_ids.clone()),
            other => panic!("customize delta expected, got {other:?}"),
        }
    }

    #[test]
    fn buff_event_customize_decodes_pair_mark_play_effects() {
        let cases: [(&str, [i32; 4]); 2] = [
            ("black-white-black lock 2", [1, 5, 3, 8]),
            ("white-black-white lock 2", [4, 2, 6, 8]),
        ];
        for (name, values) in cases {
            let sync = customize_sync(
                30,
                77,
                values.iter().copied().map(play_effect_logic).collect(),
            );
            let (target, instance_id, effect_ids) = decode_customize_delta(&sync);
            assert_eq!(target, EntityUuid(30), "{name}");
            assert_eq!(instance_id, 77, "{name}");
            assert_eq!(effect_ids.as_deref(), Some(values.as_slice()), "{name}");
        }
    }

    #[test]
    fn buff_event_customize_decodes_raw_little_endian_values() {
        let sync = customize_sync(
            30,
            77,
            [1_i16, 5, 3, 8]
                .into_iter()
                .map(|value| blueprotobuf::BuffEffectLogicInfo {
                    effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32),
                    raw_data: Some(value.to_le_bytes().to_vec()),
                    ..Default::default()
                })
                .collect(),
        );
        let (_, _, effect_ids) = decode_customize_delta(&sync);
        assert_eq!(effect_ids.as_deref(), Some([1, 5, 3, 8].as_slice()));
    }

    #[test]
    fn buff_event_customize_stop_all_only_does_not_emit_delta() {
        let sync = customize_sync(
            30,
            77,
            vec![blueprotobuf::BuffEffectLogicInfo {
                effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::BuffEffectStopAll as i32),
                raw_data: None,
                ..Default::default()
            }],
        );
        let envelope = notify(
            1,
            Pkt::SyncNearDeltaInfo,
            &blueprotobuf::SyncNearDeltaInfo::default(),
        );
        let mut decoder = ProtocolDecoder::new();
        let mut observations = Vec::new();
        decoder.decode_buff_effect_sync(EntityUuid(10), &sync, &envelope, &mut observations);
        assert!(observations.is_empty());
    }

    #[test]
    fn buff_event_customize_skips_stop_all_and_keeps_slot_values() {
        let mut logic_effect = vec![blueprotobuf::BuffEffectLogicInfo {
            effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::BuffEffectStopAll as i32),
            raw_data: None,
            ..Default::default()
        }];
        logic_effect.extend([1_i16, 5, 6, 9].into_iter().map(|value| {
            blueprotobuf::BuffEffectLogicInfo {
                effect_type: Some(blueprotobuf::EBuffEffectLogicPbType::PlayEffect as i32),
                raw_data: Some(value.to_le_bytes().to_vec()),
                ..Default::default()
            }
        }));
        let sync = customize_sync(30, 77, logic_effect);
        let (_, _, effect_ids) = decode_customize_delta(&sync);
        assert_eq!(effect_ids.as_deref(), Some([1, 5, 6, 9].as_slice()));
    }

    #[test]
    fn container_snapshot_announces_the_local_player_entity() {
        let container = blueprotobuf::SyncContainerData {
            v_data: Some(blueprotobuf::CharSerialize {
                char_id: Some(42),
                ..Default::default()
            }),
        };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::SyncContainerData, &container));

        let uuid = EntityUuid(canonical(42));
        let [
            ProtocolObservation::ContainerReset,
            ProtocolObservation::EntityAppeared {
                uuid: appeared,
                kind: EntityKind::Character,
            },
            ProtocolObservation::LocalPlayerChanged { uuid: local },
            ..,
        ] = batch.observations.as_slice()
        else {
            panic!("reset, appearance and local player must lead the container snapshot");
        };
        assert_eq!(*appeared, uuid);
        assert_eq!(*local, Some(uuid));
        assert!(!batch.observations.iter().any(|observation| matches!(
            observation,
            ProtocolObservation::EntityDisappeared { .. }
        )));
    }

    #[test]
    fn counter_passive_start_is_decoded_only_from_delta() {
        let delta = blueprotobuf::SyncNearDeltaInfo {
            delta_infos: vec![blueprotobuf::AoiSyncDelta {
                uuid: Some(30),
                passive_skill_infos: Some(blueprotobuf::SeqPassiveSkillInfo {
                    passive_infos: vec![
                        blueprotobuf::PassiveSkillInfo {
                            uuid: Some(900),
                            skill_id: Some(1434),
                            ..Default::default()
                        },
                        blueprotobuf::PassiveSkillInfo {
                            uuid: Some(901),
                            skill_id: Some(1107),
                            ..Default::default()
                        },
                    ],
                    ..Default::default()
                }),
                ..Default::default()
            }],
        };
        let snapshot = blueprotobuf::SyncNearEntities {
            appear: vec![blueprotobuf::Entity {
                uuid: Some(30),
                passive_skill_infos: Some(blueprotobuf::SeqPassiveSkillInfo {
                    passive_infos: vec![
                        blueprotobuf::PassiveSkillInfo {
                            uuid: Some(902),
                            skill_id: Some(1434),
                            ..Default::default()
                        },
                        blueprotobuf::PassiveSkillInfo {
                            uuid: Some(903),
                            skill_id: Some(1101),
                            ..Default::default()
                        },
                    ],
                    ..Default::default()
                }),
                ..Default::default()
            }],
            ..Default::default()
        };
        let mut decoder = ProtocolDecoder::new();

        let delta_batch = decoder.decode(notify(1, Pkt::SyncNearDeltaInfo, &delta));
        let snapshot_batch = decoder.decode(notify(2, Pkt::SyncNearEntities, &snapshot));

        assert!(
            delta_batch
                .observations
                .contains(&ProtocolObservation::PassiveSkillObserved(
                    PassiveSkillObservation {
                        entity_uuid: EntityUuid(30),
                        passive_instance_id: 900,
                        skill_id: 1434,
                        target_position: None,
                        ended: false,
                    }
                ))
        );
        assert!(!delta_batch.observations.iter().any(|observation| matches!(
            observation,
            ProtocolObservation::PassiveSkillObserved(passive) if passive.skill_id == 1107
        )));
        assert!(
            !snapshot_batch
                .observations
                .iter()
                .any(|observation| matches!(
                    observation,
                    ProtocolObservation::PassiveSkillObserved(passive) if passive.skill_id == 1434
                ))
        );
        assert!(
            snapshot_batch
                .observations
                .iter()
                .any(|observation| matches!(
                    observation,
                    ProtocolObservation::PassiveSkillObserved(passive) if passive.skill_id == 1101
                ))
        );
    }

    #[test]
    fn passive_end_defers_the_skill_id_to_the_reducer() {
        let message = blueprotobuf::SyncNearDeltaInfo {
            delta_infos: vec![blueprotobuf::AoiSyncDelta {
                uuid: Some(30),
                passive_skill_end_infos: Some(blueprotobuf::SeqPassiveSkillEndInfo {
                    uuids: vec![900],
                    ..Default::default()
                }),
                ..Default::default()
            }],
        };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::SyncNearDeltaInfo, &message));

        assert!(
            batch
                .observations
                .contains(&ProtocolObservation::PassiveSkillObserved(
                    PassiveSkillObservation {
                        entity_uuid: EntityUuid(30),
                        passive_instance_id: 900,
                        skill_id: 0,
                        target_position: None,
                        ended: true,
                    }
                ))
        );
    }

    fn cultivate_area(
        normal_nodes: &[(i32, i32)],
        item_ids: &[i32],
        is_active: bool,
    ) -> blueprotobuf::CultivateAreaData {
        blueprotobuf::CultivateAreaData {
            cultivate_normal_node_map: normal_nodes
                .iter()
                .map(|&(node_id, active_level)| {
                    (
                        node_id,
                        blueprotobuf::CultivateNormalNodeData {
                            active_level: Some(active_level),
                        },
                    )
                })
                .collect(),
            cultivate_middle_node_map: item_ids
                .iter()
                .enumerate()
                .map(|(index, &item_id)| {
                    (
                        i32::try_from(index).unwrap(),
                        blueprotobuf::CultivateMiddleNodeData {
                            item_id: Some(item_id),
                        },
                    )
                })
                .collect(),
            is_active: Some(is_active),
            ..Default::default()
        }
    }

    fn deep_sleep_line(
        area_id: i32,
        area: blueprotobuf::CultivateAreaData,
    ) -> blueprotobuf::CultivateLineData {
        function_line(SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP, area_id, area)
    }

    fn function_line(
        function_id: i32,
        area_id: i32,
        area: blueprotobuf::CultivateAreaData,
    ) -> blueprotobuf::CultivateLineData {
        blueprotobuf::CultivateLineData {
            cultivate_line_map: HashMap::from([(
                function_id,
                blueprotobuf::CultivateLineSubTypeData {
                    cultivate_line_data_map: HashMap::from([(area_id, area)]),
                    cultivate_line_area_list: vec![area_id],
                },
            )]),
        }
    }

    #[test]
    fn season_state_picks_the_highest_season_with_non_empty_deep_sleep_data() {
        // Older seasons (still active on JP/EN) must not leak their item ids
        // into the resolved state once a higher season (CN, S4) has data.
        let data = blueprotobuf::SeasonCultivateLineData {
            season_cultivate_line_map: HashMap::from([
                (
                    2,
                    deep_sleep_line(1, cultivate_area(&[(100, 1)], &[9001], true)),
                ),
                (
                    3,
                    deep_sleep_line(1, cultivate_area(&[(200, 1)], &[9002], true)),
                ),
            ]),
        };

        let state = season_cultivate_state(&data);

        assert_eq!(state.season_id, 3);
        assert_eq!(state.active_template_ids, vec![1]);
        assert_eq!(state.active_item_ids, vec![9002]);
    }

    #[test]
    fn season_state_skips_seasons_with_no_deep_sleep_configuration() {
        // A season key can exist in the map (e.g. reserved server-side)
        // without ever having deep-sleep data; it must not win over a real
        // lower season just because its id is numerically higher.
        let data = blueprotobuf::SeasonCultivateLineData {
            season_cultivate_line_map: HashMap::from([
                (
                    3,
                    deep_sleep_line(1, cultivate_area(&[(200, 1)], &[9002], true)),
                ),
                (4, blueprotobuf::CultivateLineData::default()),
            ]),
        };

        let state = season_cultivate_state(&data);

        assert_eq!(state.season_id, 3);
        assert_eq!(state.active_template_ids, vec![1]);
    }

    #[test]
    fn season_state_never_reads_the_rogue_mode_line() {
        // 800523 (rogue mode) shares the season map with 800522 (deep
        // sleep) but must be excluded unconditionally, even when it is the
        // only line with data for that season.
        const SEASON_CULTIVATE_FUNCTION_ROGUE: i32 = 800_523;
        let mut season4 = deep_sleep_line(14, cultivate_area(&[(2301, 1)], &[500], true));
        season4.cultivate_line_map.insert(
            SEASON_CULTIVATE_FUNCTION_ROGUE,
            blueprotobuf::CultivateLineSubTypeData {
                cultivate_line_data_map: HashMap::from([(
                    20002,
                    cultivate_area(&[(9999, 1)], &[9999], true),
                )]),
                cultivate_line_area_list: vec![20002],
            },
        );
        let data = blueprotobuf::SeasonCultivateLineData {
            season_cultivate_line_map: HashMap::from([(4, season4)]),
        };

        let state = season_cultivate_state(&data);

        assert_eq!(state.season_id, 4);
        assert_eq!(state.active_template_ids, vec![14]);
        assert_eq!(state.active_item_ids, vec![500]);
    }

    #[test]
    fn season_state_ignores_unequipped_templates_even_with_fully_leveled_nodes() {
        // Regression for a real capture: a player can have fully invested
        // (`activeLevel: 1` on every basic node) in several talent
        // templates simultaneously, but `cultivateLineAreaList` still names
        // only the one actually equipped (e.g. `[14]` while templates 9/13/
        // 16 all sit at 100% node activation from past investment). Node
        // activation must never be read as an "enabled" signal on its own --
        // only membership in `cultivateLineAreaList` (or `isActive` as the
        // fallback) may drive `active_template_ids`.
        let data = blueprotobuf::SeasonCultivateLineData {
            season_cultivate_line_map: HashMap::from([(
                4,
                blueprotobuf::CultivateLineData {
                    cultivate_line_map: HashMap::from([(
                        SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP,
                        blueprotobuf::CultivateLineSubTypeData {
                            cultivate_line_data_map: HashMap::from([
                                (13, cultivate_area(&[(2201, 1), (2202, 1)], &[100], false)),
                                (14, cultivate_area(&[(2301, 1)], &[200], true)),
                            ]),
                            cultivate_line_area_list: vec![14],
                        },
                    )]),
                },
            )]),
        };

        let state = season_cultivate_state(&data);

        assert_eq!(state.active_template_ids, vec![14]);
        assert_eq!(state.active_item_ids, vec![200]);
    }

    #[test]
    fn season_state_falls_back_to_is_active_when_area_list_is_empty() {
        let data = blueprotobuf::SeasonCultivateLineData {
            season_cultivate_line_map: HashMap::from([(
                3,
                blueprotobuf::CultivateLineData {
                    cultivate_line_map: HashMap::from([(
                        SEASON_CULTIVATE_FUNCTION_DEEP_SLEEP,
                        blueprotobuf::CultivateLineSubTypeData {
                            cultivate_line_data_map: HashMap::from([
                                (1, cultivate_area(&[(100, 1)], &[9001], true)),
                                (2, cultivate_area(&[(200, 1)], &[9002], false)),
                            ]),
                            cultivate_line_area_list: Vec::new(),
                        },
                    )]),
                },
            )]),
        };

        let state = season_cultivate_state(&data);

        assert_eq!(state.active_template_ids, vec![1]);
        assert_eq!(state.active_item_ids, vec![9001]);
    }

    fn dirty_object(body: Vec<u8>) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&DIRTY_BEGIN.to_le_bytes());
        out.extend_from_slice(&i32::try_from(body.len()).unwrap().to_le_bytes());
        out.extend_from_slice(&body);
        out.extend_from_slice(&DIRTY_END.to_le_bytes());
        out
    }

    fn single_field_update(field_tag: i32, value: i32) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(&field_tag.to_le_bytes());
        body.extend_from_slice(&value.to_le_bytes());
        dirty_object(body)
    }

    /// `merge_i32_object_map`'s explicit-update-count form: `-1`, then the
    /// count, then `key + nested-object` pairs.
    fn map_single_update(key: i32, entry: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&(-1i32).to_le_bytes());
        out.extend_from_slice(&1i32.to_le_bytes());
        out.extend_from_slice(&key.to_le_bytes());
        out.extend_from_slice(entry);
        out
    }

    #[test]
    fn cultivate_area_dirty_merge_applies_every_tag_regardless_of_order() {
        // Regression guard: `CultivateAreaData` previously only recognized
        // tags 2 and 5, so a patch touching tag 1 first hit the
        // `_ => reader.skip_to(end)` branch and silently dropped every field
        // that followed it in the same patch -- including tag 2 here.
        let normal_node_map_patch = map_single_update(200, &single_field_update(1, 2));
        let middle_node_map_patch = map_single_update(0, &single_field_update(1, 9099));

        let mut area_body = Vec::new();
        area_body.extend_from_slice(&1i32.to_le_bytes());
        area_body.extend_from_slice(&normal_node_map_patch);
        area_body.extend_from_slice(&2i32.to_le_bytes());
        area_body.extend_from_slice(&middle_node_map_patch);
        let area_patch = dirty_object(area_body);

        let mut reader = DirtyReader::new(&area_patch);
        let mut area = blueprotobuf::CultivateAreaData::default();
        merge_cultivate_area_data(&mut reader, &mut area).expect("valid patch");

        assert_eq!(
            area.cultivate_normal_node_map
                .get(&200)
                .and_then(|node| node.active_level),
            Some(2),
        );
        assert_eq!(
            area.cultivate_middle_node_map
                .get(&0)
                .and_then(|node| node.item_id),
            Some(9099),
        );
    }

    #[test]
    fn cultivate_area_dirty_merge_applies_big_node_and_effect_score_tags() {
        let big_node_map_patch = map_single_update(5, &single_field_update(1, 777));
        let mut area_body = Vec::new();
        area_body.extend_from_slice(&3i32.to_le_bytes());
        area_body.extend_from_slice(&big_node_map_patch);
        area_body.extend_from_slice(&4i32.to_le_bytes());
        area_body.extend_from_slice(&42i32.to_le_bytes());
        let area_patch = dirty_object(area_body);

        let mut reader = DirtyReader::new(&area_patch);
        let mut area = blueprotobuf::CultivateAreaData::default();
        merge_cultivate_area_data(&mut reader, &mut area).expect("valid patch");

        assert_eq!(
            area.cultivate_big_node_map
                .get(&5)
                .and_then(|node| node.fantasy_id),
            Some(777),
        );
        assert_eq!(area.activate_effect_score, Some(42));
    }

    #[test]
    fn profession_dirty_merge_updates_talent_stage_cfg_id() {
        let talent_patch = map_single_update(4, &single_field_update(4, 108));
        let mut profession_body = Vec::new();
        profession_body.extend_from_slice(&10i32.to_le_bytes());
        profession_body.extend_from_slice(&talent_patch);
        let char_body = dirty_object(profession_body);

        let mut list = blueprotobuf::ProfessionList {
            cur_profession_id: Some(4),
            ..Default::default()
        };
        let mut reader = DirtyReader::new(&char_body);
        merge_profession_list(&mut reader, &mut list).expect("valid patch");

        let talent = local_talent(&list);
        assert_eq!(talent.profession_id, Some(4));
        assert_eq!(talent.talent_stage_cfg_id, Some(108));
    }

    #[test]
    fn profession_dirty_merge_applies_every_tag_regardless_of_order() {
        // Same regression class as the cultivate-area guard: the dirty wire
        // has no per-field length, so every tag must be consumed explicitly
        // or the fields after the first unknown scalar are silently dropped.
        let mut body = Vec::new();
        // 16: reset_talent_mark_item_pop_up_notice, a scalar we store but
        // never read; it must still be consumed so later fields parse.
        body.extend_from_slice(&16i32.to_le_bytes());
        body.extend_from_slice(&7i32.to_le_bytes());
        // 1: cur_profession_id.
        body.extend_from_slice(&1i32.to_le_bytes());
        body.extend_from_slice(&4i32.to_le_bytes());
        // 3: cur_assist_professions.
        body.extend_from_slice(&3i32.to_le_bytes());
        body.extend_from_slice(&2i32.to_le_bytes());
        body.extend_from_slice(&5i32.to_le_bytes());
        body.extend_from_slice(&6i32.to_le_bytes());
        // 8/9: u32 scalars.
        body.extend_from_slice(&8i32.to_le_bytes());
        body.extend_from_slice(&30i32.to_le_bytes());
        body.extend_from_slice(&9i32.to_le_bytes());
        body.extend_from_slice(&2i32.to_le_bytes());
        // 10: talent_list map with the stage under tag 4.
        body.extend_from_slice(&10i32.to_le_bytes());
        body.extend_from_slice(&map_single_update(4, &single_field_update(4, 107)));
        // 4: profession_list map with level + experience (i64).
        let mut info_body = Vec::new();
        info_body.extend_from_slice(&2i32.to_le_bytes());
        info_body.extend_from_slice(&60i32.to_le_bytes());
        info_body.extend_from_slice(&3i32.to_le_bytes());
        info_body.extend_from_slice(&123_456_i64.to_le_bytes());
        body.extend_from_slice(&4i32.to_le_bytes());
        body.extend_from_slice(&map_single_update(4, &dirty_object(info_body)));
        let patch = dirty_object(body);

        let mut list = blueprotobuf::ProfessionList::default();
        let mut reader = DirtyReader::new(&patch);
        merge_profession_list(&mut reader, &mut list).expect("valid patch");

        assert_eq!(list.cur_profession_id, Some(4));
        assert_eq!(list.cur_assist_professions, vec![5, 6]);
        assert_eq!(list.reset_talent_mark_item_pop_up_notice, Some(7));
        assert_eq!(list.total_talent_points, Some(30));
        assert_eq!(list.total_talent_reset_count, Some(2));
        assert_eq!(
            list.talent_list
                .get(&4)
                .and_then(|info| info.talent_stage_cfg_id),
            Some(107),
        );
        let info = list.profession_list.get(&4).expect("profession entry");
        assert_eq!(info.level, Some(60));
        assert_eq!(info.experience, Some(123_456));
    }

    #[test]
    fn container_delta_merges_profession_without_a_season_snapshot() {
        // A respec dirty blob arrives with no season section and before any
        // season snapshot was ever captured: it must still merge and emit.
        let talent_patch = map_single_update(4, &single_field_update(4, 108));
        let mut profession_body = Vec::new();
        profession_body.extend_from_slice(&1i32.to_le_bytes());
        profession_body.extend_from_slice(&4i32.to_le_bytes());
        profession_body.extend_from_slice(&10i32.to_le_bytes());
        profession_body.extend_from_slice(&talent_patch);
        let mut char_body = Vec::new();
        char_body.extend_from_slice(&CHAR_SERIALIZE_FIELD_PROFESSION_LIST.to_le_bytes());
        char_body.extend_from_slice(&dirty_object(profession_body));
        let blob = dirty_object(char_body);

        let mut decoder = ProtocolDecoder::new();
        let message = blueprotobuf::SyncContainerDirtyData {
            v_data: Some(blueprotobuf::BufferStream {
                buffer: Some(blob),
            }),
        };
        let observations = decoder.decode_container_delta(message);

        assert_eq!(
            observations,
            vec![ProtocolObservation::LocalTalentChanged(LocalTalent {
                profession_id: Some(4),
                talent_stage_cfg_id: Some(108),
            })]
        );
    }

    #[test]
    fn container_snapshot_announces_local_talent() {
        let container = blueprotobuf::SyncContainerData {
            v_data: Some(blueprotobuf::CharSerialize {
                char_id: Some(42),
                profession_list: Some(blueprotobuf::ProfessionList {
                    cur_profession_id: Some(4),
                    talent_list: HashMap::from([(
                        4,
                        blueprotobuf::ProfessionTalentInfo {
                            talent_stage_cfg_id: Some(108),
                            ..Default::default()
                        },
                    )]),
                    ..Default::default()
                }),
                ..Default::default()
            }),
        };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::SyncContainerData, &container));

        assert!(batch.observations.iter().any(|observation| matches!(
            observation,
            ProtocolObservation::LocalTalentChanged(LocalTalent {
                profession_id: Some(4),
                talent_stage_cfg_id: Some(108),
            })
        )));
    }

    #[test]
    fn talent_stage_cfg_id_uses_proto_wire_tag_4() {
        // Regression lock: the struct roundtrip tests above cannot catch a
        // wrong prost tag (encode and decode would share the mistake). The
        // official proto declares talentStageCfgId = 4, i.e. wire key 0x20.
        use prost::Message as _;
        let encoded = blueprotobuf::ProfessionTalentInfo {
            talent_stage_cfg_id: Some(108),
            ..Default::default()
        }
        .encode_to_vec();
        assert_eq!(encoded, vec![0x20, 108]);
    }

    #[test]
    fn container_snapshot_without_v_data_resets_local_talent() {
        let container = blueprotobuf::SyncContainerData { v_data: None };
        let mut decoder = ProtocolDecoder::new();

        let batch = decoder.decode(notify(1, Pkt::SyncContainerData, &container));

        assert!(batch.observations.iter().any(|observation| matches!(
            observation,
            ProtocolObservation::LocalTalentChanged(LocalTalent {
                profession_id: None,
                talent_stage_cfg_id: None,
            })
        )));
    }

    fn identity_patch_for_monster_id(kind: EntityKind, monster_id: i32) -> EntityIdentityPatch {
        let mut raw = Vec::new();
        prost::encoding::encode_varint(u64::try_from(monster_id).expect("id"), &mut raw);
        let collection = blueprotobuf::AttrCollection {
            attrs: vec![blueprotobuf::Attr {
                id: Some(attr_type::ATTR_ID),
                raw_data: Some(raw),
            }],
            ..Default::default()
        };
        let mut observations = Vec::new();
        ProtocolDecoder::decode_attributes(
            EntityUuid(1),
            kind,
            &collection,
            ObservationOrigin::Snapshot,
            &mut observations,
        );
        observations
            .into_iter()
            .find_map(|observation| match observation {
                ProtocolObservation::IdentityUpdated { patch, .. } => Some(patch),
                _ => None,
            })
            .expect("identity patch")
    }

    #[test]
    fn boss_flag_requires_monster_entity_kind() {
        const BOSS_TEMPLATE: i32 = 7001;

        let dummy = identity_patch_for_monster_id(EntityKind::Dummy, BOSS_TEMPLATE);
        assert_eq!(dummy.monster_id, FieldPatch::Set(BOSS_TEMPLATE));
        assert_eq!(dummy.is_boss, FieldPatch::Set(false));

        let monster = identity_patch_for_monster_id(EntityKind::Monster, BOSS_TEMPLATE);
        assert_eq!(monster.monster_id, FieldPatch::Set(BOSS_TEMPLATE));
        assert_eq!(monster.is_boss, FieldPatch::Set(true));
    }

    #[test]
    fn dungeon_snapshot_emits_progress_state_when_present() {
        let message = blueprotobuf::SyncDungeonData {
            v_data: Some(blueprotobuf::DungeonSyncData {
                dungeon_var: Some(blueprotobuf::DungeonVar {
                    dungeon_var_data: vec![
                        blueprotobuf::DungeonVarData {
                            name: Some("eatball".into()),
                            value: Some(22),
                        },
                        blueprotobuf::DungeonVarData {
                            name: Some("ProgressState".into()),
                            value: Some(1),
                        },
                    ],
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        let observations = decode_dungeon_snapshot(message);
        assert_eq!(
            observations,
            vec![ProtocolObservation::DungeonProgressStateChanged { value: 1 }]
        );
    }

    #[test]
    fn dungeon_snapshot_skips_progress_state_without_value() {
        let message = blueprotobuf::SyncDungeonData {
            v_data: Some(blueprotobuf::DungeonSyncData {
                dungeon_var: Some(blueprotobuf::DungeonVar {
                    dungeon_var_data: vec![blueprotobuf::DungeonVarData {
                        name: Some("eatball".into()),
                        value: Some(22),
                    }],
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        assert!(decode_dungeon_snapshot(message).is_empty());
    }
}
