//! Team cooldown sharing.
//!
//! Local side: reads the local character's cooldown records from
//! [`EntityMonitorProjection`] by revision (like voice) and turns them into a
//! [`ShareSnapshot`] anchored in game-server time. Remote side: keeps the
//! teammates' shared samples and re-anchors them with this machine's
//! server-clock offset, so every client derives charges and ready times with
//! the same [`SkillCdRecord`] math as its own HUD.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use crate::live::bootstrap_snapshot::TeammateCdRuntimeSnapshot;
use crate::live::entity_id::{canonical_player_uuid, uid_from_uuid};
use crate::live::ipc::models::{
    LiveTeamPayload, SkillCdState, TeamLayoutKind, TeamLayoutPayload, TeamSlotPayload,
    TeammateCdPayload,
};
use crate::live::projections::entity_monitor::{EntityMonitorProjection, SkillCdRecord};
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{MonoTimeMs, TeamKind};
use crate::live::team_link::{
    CdSample, CdTable, CharId, ShareIdentity, ShareSnapshot, TeamId, TeamLinkEvent,
    TeammateProfile, TeammateSnapshot,
};

/// Packet-derived fields of a local record; the anchor is derived from these
/// once, so a later clock-offset update does not re-send unchanged skills.
#[derive(Debug, Clone, Copy, PartialEq)]
struct RecordKey {
    duration: i32,
    cd_type: i32,
    valid_cd_time: i32,
    calculated_duration: i32,
    accelerate_rate: f32,
    received_at: i64,
}

impl RecordKey {
    fn of(record: &SkillCdRecord) -> Self {
        let state = &record.state;
        Self {
            duration: state.duration,
            cd_type: state.skill_cd_type,
            valid_cd_time: state.valid_cd_time,
            calculated_duration: state.calculated_duration,
            accelerate_rate: state.cd_accelerate_rate,
            received_at: state.received_at,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct Teammate {
    profile: Option<TeammateProfile>,
    /// `skill_level_id` → latest sample.
    samples: HashMap<i32, CdSample>,
}

#[derive(Debug, Default)]
pub struct TeamCdProjection {
    seen_skill_revision: Option<u64>,
    seen_roster_revision: u64,
    offset_known: bool,
    identity: Option<ShareIdentity>,
    table: CdTable,
    shared_keys: HashMap<i32, RecordKey>,
    next_version: u64,
    pending_share: Option<ShareSnapshot>,
    config: TeammateCdRuntimeSnapshot,
    teammates: BTreeMap<CharId, Teammate>,
    link_online: bool,
    revision: u64,
}

impl TeamCdProjection {
    /// Returns whether the published teammate view changed.
    pub fn apply_config(&mut self, config: &TeammateCdRuntimeSnapshot) -> bool {
        if self.config == *config {
            return false;
        }
        self.config = config.clone();
        true
    }

    /// Re-derives what the local character shares. Returns whether the
    /// published teammate view changed (a roster change prunes teammates).
    pub fn sync_local(
        &mut self,
        monitor: &EntityMonitorProjection,
        entities: &EntityContext,
    ) -> bool {
        let offset = entities.server_clock_offset_ms();
        let mut share_changed = false;

        let skill_revision = monitor.revisions().skill_cds;
        if self.seen_skill_revision != Some(skill_revision) || self.offset_known != offset.is_some()
        {
            self.seen_skill_revision = Some(skill_revision);
            self.offset_known = offset.is_some();
            share_changed |= self.rebuild_table(monitor, offset);
        }

        let roster_revision = entities.team_roster().revision();
        let mut view_changed = roster_revision != self.seen_roster_revision;
        self.seen_roster_revision = roster_revision;
        let identity = local_identity(entities);
        if identity != self.identity {
            let before = self.teammates.len();
            match &identity {
                Some(identity) => self
                    .teammates
                    .retain(|char_id, _| is_teammate(identity, *char_id)),
                None => self.teammates.clear(),
            }
            view_changed |= self.teammates.len() != before;
            self.identity = identity;
            share_changed = true;
        }

        if share_changed {
            self.pending_share = Some(ShareSnapshot {
                identity: self.identity.clone(),
                cds: Arc::new(self.table.clone()),
            });
        }
        view_changed
    }

    fn rebuild_table(&mut self, monitor: &EntityMonitorProjection, offset: Option<i64>) -> bool {
        let current: BTreeMap<i32, &SkillCdRecord> = match offset {
            Some(_) => monitor
                .skill_cooldowns()
                .map(|record| (record.state.skill_level_id, record))
                .collect(),
            None => BTreeMap::new(),
        };
        let removed = self
            .table
            .entries
            .keys()
            .any(|skill_level_id| !current.contains_key(skill_level_id));
        if removed {
            self.table.epoch = self.table.epoch.wrapping_add(1);
            self.table.entries.clear();
            self.shared_keys.clear();
        }
        let mut changed = removed;
        for (skill_level_id, record) in current {
            let key = RecordKey::of(record);
            if self.shared_keys.get(&skill_level_id) == Some(&key) {
                continue;
            }
            let Some(offset) = offset else { continue };
            self.next_version = self.next_version.wrapping_add(1);
            self.table
                .entries
                .insert(skill_level_id, (sample(record, offset), self.next_version));
            self.shared_keys.insert(skill_level_id, key);
            changed = true;
        }
        changed
    }

    /// The latest share state, if it changed since the last call.
    pub fn take_share(&mut self) -> Option<ShareSnapshot> {
        self.pending_share.take()
    }

    /// Applies one relay update. Always changes the published view.
    pub fn apply_event(&mut self, event: TeamLinkEvent) -> bool {
        let identity = self.identity.as_ref();
        let allowed = |char_id: CharId| identity.is_some_and(|id| is_teammate(id, char_id));
        match event {
            TeamLinkEvent::Snapshot(members) => {
                self.link_online = true;
                self.teammates = members
                    .into_iter()
                    .filter(|member| allowed(member.char_id))
                    .map(
                        |TeammateSnapshot {
                             char_id,
                             profile,
                             samples,
                         }| {
                            let samples = samples
                                .into_iter()
                                .map(|sample| (sample.skill_level_id, sample))
                                .collect();
                            (
                                char_id,
                                Teammate {
                                    profile: Some(profile),
                                    samples,
                                },
                            )
                        },
                    )
                    .collect();
            }
            TeamLinkEvent::Member { char_id, profile } => {
                if allowed(char_id) {
                    self.teammates.entry(char_id).or_default().profile = Some(profile);
                }
            }
            TeamLinkEvent::Cd { char_id, samples } => {
                if allowed(char_id) {
                    let teammate = self.teammates.entry(char_id).or_default();
                    for sample in samples {
                        teammate.samples.insert(sample.skill_level_id, sample);
                    }
                }
            }
            TeamLinkEvent::Clear { char_id } => {
                if let Some(teammate) = self.teammates.get_mut(&char_id) {
                    teammate.samples.clear();
                }
            }
            TeamLinkEvent::Left { char_id } => {
                self.teammates.remove(&char_id);
            }
            TeamLinkEvent::LinkDown => self.link_online = false,
        }
        true
    }

    /// Builds the HUD payload with cooldowns in the local time domain.
    pub fn payload(
        &mut self,
        entities: &EntityContext,
        now_wall_ms: i64,
        now_mono: MonoTimeMs,
    ) -> LiveTeamPayload {
        self.revision = self.revision.wrapping_add(1);
        let offset = entities.server_clock_offset_ms();
        let teammates = if self.config.enabled {
            self.teammates
                .iter()
                .filter_map(|(char_id, teammate)| {
                    let profile = teammate.profile.as_ref()?;
                    let wanted = self.config.skills_for(profile.class_id);
                    let mut skill_cds: Vec<SkillCdState> = match offset {
                        Some(offset) => teammate
                            .samples
                            .values()
                            .filter(|sample| wanted.contains(&sample.skill_id()))
                            .map(|sample| local_state(sample, offset, now_wall_ms, now_mono))
                            .collect(),
                        None => Vec::new(),
                    };
                    skill_cds.sort_by_key(|state| state.received_at);
                    Some(TeammateCdPayload {
                        uuid: canonical_player_uuid(char_id.0).to_string(),
                        name: profile.name.clone(),
                        class_id: profile.class_id,
                        skill_cds,
                    })
                })
                .collect()
        } else {
            Vec::new()
        };
        let layout = self.config.enabled.then(|| team_layout(entities)).flatten();
        LiveTeamPayload {
            revision: self.revision,
            link_online: self.link_online,
            teammates,
            layout,
        }
    }
}

fn team_layout(entities: &EntityContext) -> Option<TeamLayoutPayload> {
    let layout = entities.team_roster().layout();
    if layout.slots.is_empty() {
        return None;
    }
    let local = entities.local_player().map(|local| local.uuid.0);
    Some(TeamLayoutPayload {
        kind: match layout.kind {
            TeamKind::Five => TeamLayoutKind::Five,
            TeamKind::Twenty => TeamLayoutKind::Twenty,
        },
        slots: layout
            .slots
            .into_iter()
            .map(|slot| {
                let uuid = canonical_player_uuid(slot.char_id);
                TeamSlotPayload {
                    uuid: uuid.to_string(),
                    group: slot.group,
                    row: slot.row,
                    is_self: local == Some(uuid),
                }
            })
            .collect(),
    })
}

fn is_teammate(identity: &ShareIdentity, char_id: CharId) -> bool {
    char_id != identity.char_id && identity.roster.binary_search(&char_id).is_ok()
}

/// The local character's room identity, or `None` while any part is unknown.
fn local_identity(entities: &EntityContext) -> Option<ShareIdentity> {
    let distribution = entities.game_client()?;
    let team_id = entities.team_id();
    if team_id == 0 {
        return None;
    }
    entities.server_clock_offset_ms()?;
    let local = entities.local_player()?;
    let char_id = CharId(uid_from_uuid(local.uuid.0));
    if char_id.0 <= 0 {
        return None;
    }
    let mut roster: Vec<CharId> = entities
        .team_roster()
        .member_ids()
        .map(CharId)
        .chain([char_id])
        .filter(|id| id.0 > 0)
        .collect();
    roster.sort_unstable();
    roster.dedup();
    let state = entities.entity(local.uuid);
    let name = state
        .and_then(|state| state.identity.name.clone())
        .unwrap_or_default();
    let class_id = state
        .and_then(|state| state.identity.profession_id)
        .or(entities.local_talent().profession_id)
        .unwrap_or_default();
    Some(ShareIdentity {
        distribution,
        team_id: TeamId(team_id),
        char_id,
        roster,
        name,
        class_id,
    })
}

fn sample(record: &SkillCdRecord, offset_ms: i64) -> CdSample {
    let state = &record.state;
    CdSample {
        skill_level_id: state.skill_level_id,
        duration: state.duration,
        cd_type: state.skill_cd_type,
        valid_cd_time: state.valid_cd_time,
        calculated_duration: state.calculated_duration,
        accelerate_rate: state.cd_accelerate_rate,
        anchor_server_ms: state.received_at.saturating_sub(offset_ms),
    }
}

/// Re-anchors a teammate sample: `anchor + offset` is when this machine
/// would have captured the packet, mapped onto the monotonic clock as well.
fn local_state(
    sample: &CdSample,
    offset_ms: i64,
    now_wall_ms: i64,
    now_mono: MonoTimeMs,
) -> SkillCdState {
    let received_at = sample.anchor_server_ms.saturating_add(offset_ms);
    let age_ms = now_wall_ms.saturating_sub(received_at);
    let received_mono = if age_ms >= 0 {
        now_mono.0.saturating_sub(age_ms.unsigned_abs())
    } else {
        now_mono.0.saturating_add(age_ms.unsigned_abs())
    };
    let mut record = SkillCdRecord {
        state: SkillCdState {
            skill_level_id: sample.skill_level_id,
            begin_time: 0,
            duration: sample.duration,
            skill_cd_type: sample.cd_type,
            valid_cd_time: sample.valid_cd_time,
            received_at,
            calculated_duration: sample.calculated_duration,
            cd_accelerate_rate: sample.accelerate_rate,
            ready_at_ms: None,
            max_charges: None,
            max_valid_cd_time: None,
        },
        received_mono_ms: MonoTimeMs(received_mono),
    };
    record.refresh_derived();
    record.state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::bootstrap_snapshot::TeammateCdClassSkills;
    use crate::live::team_link::Distribution;

    fn cd(skill_level_id: i32, anchor: i64) -> CdSample {
        CdSample {
            skill_level_id,
            duration: 30_000,
            cd_type: 0,
            valid_cd_time: 0,
            calculated_duration: 30_000,
            accelerate_rate: 0.0,
            anchor_server_ms: anchor,
        }
    }

    fn identity(roster: &[i64]) -> ShareIdentity {
        ShareIdentity {
            distribution: Distribution::Star,
            team_id: TeamId(7),
            char_id: CharId(1),
            roster: roster.iter().copied().map(CharId).collect(),
            name: "me".into(),
            class_id: 4,
        }
    }

    fn profile(class_id: i32) -> TeammateProfile {
        TeammateProfile {
            name: "mate".into(),
            class_id,
        }
    }

    #[test]
    fn remote_anchor_maps_into_local_time() {
        // Game server says the packet was captured at 1_000_000; this machine
        // runs 250 ms ahead of the server, so it would have seen it at 1_000_250.
        let state = local_state(&cd(142_001, 1_000_000), 250, 1_010_250, MonoTimeMs(50_000));
        assert_eq!(state.received_at, 1_000_250);
        // 10 s already elapsed of a 30 s cooldown: ready 20 s from now.
        assert_eq!(state.ready_at_ms, Some(1_030_250));
    }

    #[test]
    fn events_only_keep_listed_teammates_and_filter_by_class() {
        let mut projection = TeamCdProjection {
            identity: Some(identity(&[1, 2, 3])),
            config: TeammateCdRuntimeSnapshot {
                enabled: true,
                classes: vec![TeammateCdClassSkills {
                    class_id: 4,
                    skill_ids: vec![1420],
                }],
            },
            ..TeamCdProjection::default()
        };
        projection.apply_event(TeamLinkEvent::Snapshot(vec![
            TeammateSnapshot {
                char_id: CharId(2),
                profile: profile(4),
                samples: vec![cd(142_001, 1), cd(150_101, 1)],
            },
            TeammateSnapshot {
                char_id: CharId(9),
                profile: profile(4),
                samples: vec![cd(142_001, 1)],
            },
        ]));
        projection.apply_event(TeamLinkEvent::Cd {
            char_id: CharId(3),
            samples: vec![cd(142_001, 1)],
        });

        let no_clock = EntityContext::new();
        let payload = projection.payload(&no_clock, 0, MonoTimeMs(0));
        assert_eq!(
            payload.teammates.len(),
            1,
            "unknown profile and outsiders are hidden"
        );
        assert!(
            payload.teammates[0].skill_cds.is_empty(),
            "no server clock yet"
        );
        assert!(payload.link_online);

        let entities = with_server_clock(0);
        let payload = projection.payload(&entities, 10, MonoTimeMs(10));
        let skills: Vec<i32> = payload.teammates[0]
            .skill_cds
            .iter()
            .map(|state| state.skill_level_id)
            .collect();
        assert_eq!(
            skills,
            vec![142_001],
            "only the class selection is published"
        );
        assert_eq!(
            payload.teammates[0].uuid,
            canonical_player_uuid(2).to_string()
        );

        projection.apply_event(TeamLinkEvent::LinkDown);
        projection.apply_event(TeamLinkEvent::Left { char_id: CharId(2) });
        let payload = projection.payload(&entities, 10, MonoTimeMs(10));
        assert!(!payload.link_online);
        assert!(payload.teammates.is_empty());
    }

    fn with_server_clock(offset_ms: i64) -> EntityContext {
        use crate::live::runtime::events::{BatchId, EventMeta, ProtocolBatch};
        let mut entities = EntityContext::new();
        entities.apply_batch(ProtocolBatch {
            meta: EventMeta {
                batch_id: BatchId(1),
                capture_sequence: 1,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: 1_000 + offset_ms,
                captured_mono_ns: 0,
                source_time_ms: Some(1_000),
            },
            observations: Vec::new(),
        });
        entities
    }

    #[test]
    fn payload_publishes_the_team_panel_layout() {
        use crate::live::runtime::events::{
            BatchId, EntityKind, EntityUuid, EventMeta, ObservedTeamBase, ObservedTeamMember,
            ProtocolBatch, ProtocolObservation, TeamRosterUpdate,
        };
        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 5_000,
            captured_mono_ns: 0,
            source_time_ms: None,
        };
        let local = EntityUuid(canonical_player_uuid(11));
        let mut entities = EntityContext::new();
        entities.apply_batch(ProtocolBatch {
            meta,
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
            ],
        });
        let monitor = EntityMonitorProjection::default();
        let mut projection = TeamCdProjection {
            config: TeammateCdRuntimeSnapshot {
                enabled: true,
                classes: Vec::new(),
            },
            ..TeamCdProjection::default()
        };
        projection.sync_local(&monitor, &entities);
        assert!(
            projection
                .payload(&entities, 0, MonoTimeMs(0))
                .layout
                .is_none()
        );

        entities.apply_batch(ProtocolBatch {
            meta,
            observations: vec![ProtocolObservation::TeamRoster(TeamRosterUpdate::Joined {
                base: Some(ObservedTeamBase {
                    team_id: 7,
                    leader_id: 11,
                    kind: TeamKind::Five,
                    create_time_ms: 0,
                    groups: vec![(1, vec![22, 11])],
                }),
                members: vec![
                    ObservedTeamMember {
                        char_id: 11,
                        enter_time: Some(1),
                        group_id: Some(1),
                    },
                    ObservedTeamMember {
                        char_id: 22,
                        enter_time: Some(2),
                        group_id: Some(1),
                    },
                ],
            })],
        });
        assert!(
            projection.sync_local(&monitor, &entities),
            "a layout change republishes"
        );
        assert!(!projection.sync_local(&monitor, &entities));

        let layout = projection
            .payload(&entities, 0, MonoTimeMs(0))
            .layout
            .expect("layout");
        assert_eq!(layout.kind, TeamLayoutKind::Five);
        assert_eq!(
            layout.slots,
            vec![
                TeamSlotPayload {
                    uuid: canonical_player_uuid(11).to_string(),
                    group: 1,
                    row: 1,
                    is_self: true,
                },
                TeamSlotPayload {
                    uuid: canonical_player_uuid(22).to_string(),
                    group: 1,
                    row: 2,
                    is_self: false,
                },
            ]
        );

        projection.apply_config(&TeammateCdRuntimeSnapshot::default());
        assert!(
            projection
                .payload(&entities, 0, MonoTimeMs(0))
                .layout
                .is_none(),
            "disabled sharing publishes nothing"
        );
    }

    #[test]
    fn local_identity_needs_client_team_player_and_clock() {
        use crate::live::runtime::events::{
            BatchId, EntityKind, EntityUuid, EventMeta, ProtocolBatch, ProtocolObservation,
            TeamRosterUpdate,
        };
        use crate::live::runtime::team_roster::test_support::joined_team;
        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 5_000,
            captured_mono_ns: 0,
            source_time_ms: Some(4_000),
        };
        let local = EntityUuid(canonical_player_uuid(11));
        let mate = EntityUuid(canonical_player_uuid(22));
        let mut entities = EntityContext::new();
        entities.apply_batch(ProtocolBatch {
            meta,
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: local,
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                joined_team(77, &[mate, local]),
            ],
        });
        assert_eq!(
            local_identity(&entities),
            None,
            "game client not identified yet"
        );

        entities.apply_batch(ProtocolBatch {
            meta,
            observations: vec![ProtocolObservation::GameClientIdentified {
                distribution: Distribution::Bpsr,
            }],
        });
        let identity = local_identity(&entities).expect("identity");
        assert_eq!(identity.distribution, Distribution::Bpsr);
        assert_eq!(identity.team_id, TeamId(77));
        assert_eq!(identity.char_id, CharId(11));
        assert_eq!(identity.roster, vec![CharId(11), CharId(22)]);

        entities.apply_batch(ProtocolBatch {
            meta,
            observations: vec![ProtocolObservation::TeamRoster(TeamRosterUpdate::Dissolved)],
        });
        assert_eq!(local_identity(&entities), None, "left the team");
    }
}
