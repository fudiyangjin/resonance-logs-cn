//! Entity-duration watch list: the present entities that match configured
//! entries, folded into display *tracks*.
//!
//! A track is one row of the monster overlay's entity-duration panel. An
//! entry without `merge` yields one track per entity; a merged entry yields
//! one track per caster, holding every entity with the monster id that the
//! caster has on the field. The HUD payload and the voice projection both
//! read tracks from here, so scope filtering, grouping and expiry rules live
//! in one place.

use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::fmt;

use crate::live::bootstrap_snapshot::{MonsterRuntimeSnapshot, WatchedEntitySpec};
use crate::live::ipc::models::EntityDurationTrackState;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    EntityIdentity, EntityRef, EntityUuid, MonoTimeMs, wall_now_ms,
};
use crate::voice::models::EntityOwnerScope;

/// A present entity whose `monster_id` is on the entity-duration watch list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct WatchedEntityRecord {
    pub entity: EntityRef,
    pub monster_id: i32,
    pub owner: Option<EntityUuid>,
    pub detected_at_ms: i64,
    /// Monotonic twin of `detected_at_ms`, for scheduling expiry cues.
    pub detected_mono_ms: MonoTimeMs,
}

/// What a track stands for within its watch entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum TrackKey {
    /// Unmerged entry: a single entity.
    Entity(EntityUuid),
    /// Merged entry: every entity of one caster (`None` = caster unknown).
    Caster(Option<EntityUuid>),
}

impl fmt::Display for TrackKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Entity(entity) => write!(f, "e{}", entity.0),
            Self::Caster(Some(owner)) => write!(f, "c{}", owner.0),
            Self::Caster(None) => f.write_str("c-"),
        }
    }
}

/// One display row: the present entities of one watch entry that share a
/// [`TrackKey`].
#[derive(Debug)]
pub(crate) struct EntityDurationTrack<'a> {
    pub spec: &'a WatchedEntitySpec,
    pub key: TrackKey,
    pub owner: Option<EntityUuid>,
    /// Never empty. Ascending by detection, which is also expiry order since
    /// every member shares `spec.duration_ms`.
    pub members: Vec<&'a WatchedEntityRecord>,
}

impl EntityDurationTrack<'_> {
    /// Members whose "N seconds left" cue is audible, with their expiry.
    ///
    /// The HUD counts down to the earliest member that has not expired yet,
    /// so member `k` takes over the row when member `k - 1` expires, and its
    /// countdown only crosses `lead_ms` on screen if it is still above it at
    /// that hand-over. Entities summoned together therefore cue once, while a
    /// later summon that takes over with time to spare cues again. The first
    /// member always qualifies, so single-member (unmerged) tracks keep one
    /// cue per entity; a track without a duration has none.
    pub fn audible_expiries(
        &self,
        lead_ms: u64,
    ) -> impl Iterator<Item = (EntityUuid, MonoTimeMs)> + '_ {
        let mut handover: Option<MonoTimeMs> = None;
        self.members.iter().filter_map(move |record| {
            let expires = record
                .detected_mono_ms
                .saturating_add(self.spec.duration_ms?);
            let audible =
                handover.is_none_or(|handover| expires.saturating_sub(lead_ms) > handover);
            handover = Some(expires);
            audible.then_some((record.entity.uuid, expires))
        })
    }

    fn to_state(&self, entities: &EntityContext) -> EntityDurationTrackState {
        let spec = self.spec;
        EntityDurationTrackState {
            key: format!("{}:{}:{}", spec.monster_id, spec.scope.as_str(), self.key),
            monster_id: spec.monster_id,
            scope: spec.scope,
            owner_uuid: self.owner.map(|owner| owner.0.to_string()),
            owner_name: self
                .owner
                .and_then(|owner| entities.entity(owner))
                .and_then(|state| state.identity.name.clone()),
            duration_ms: spec.duration_ms,
            deadlines_ms: spec.duration_ms.map_or_else(Vec::new, |duration_ms| {
                let duration_ms = i64::try_from(duration_ms).unwrap_or(i64::MAX);
                self.members
                    .iter()
                    .map(|record| record.detected_at_ms.saturating_add(duration_ms))
                    .collect()
            }),
        }
    }
}

/// The configured watch entries and the present entities they admit.
#[derive(Debug, Default)]
pub(crate) struct EntityDurationWatch {
    specs: Vec<WatchedEntitySpec>,
    watched_ids: HashSet<i32>,
    records: HashMap<EntityUuid, WatchedEntityRecord>,
}

impl EntityDurationWatch {
    /// Replaces the watch entries. Records whose monster id is no longer
    /// watched are dropped, and entities already in the scene are seeded so
    /// a newly watched id shows up immediately instead of waiting for its
    /// next identity update.
    pub fn apply_config(
        &mut self,
        config: &MonsterRuntimeSnapshot,
        entities: &EntityContext,
        now_mono: MonoTimeMs,
    ) {
        self.specs.clone_from(&config.watched_entities);
        self.watched_ids.clear();
        self.watched_ids.extend(config.watched_monster_ids());
        let watched = &self.watched_ids;
        self.records
            .retain(|_, record| watched.contains(&record.monster_id));
        let now = wall_now_ms();
        for state in entities.entities().filter(|state| state.is_present) {
            self.sync(state.entity, &state.identity, true, now, now_mono);
        }
    }

    /// Keeps the record for `entity` in sync with its identity and presence.
    /// Returns whether the published view changed.
    /// `detected_at_ms` is consumed only when a record is created or a reused
    /// uuid comes back with a new generation.
    pub fn sync(
        &mut self,
        entity: EntityRef,
        identity: &EntityIdentity,
        is_present: bool,
        detected_at_ms: i64,
        detected_mono_ms: MonoTimeMs,
    ) -> bool {
        let watched_id = identity
            .monster_id
            .filter(|monster_id| is_present && self.watched_ids.contains(monster_id));
        let Some(monster_id) = watched_id else {
            return self.records.remove(&entity.uuid).is_some();
        };
        match self.records.entry(entity.uuid) {
            Entry::Vacant(slot) => {
                slot.insert(WatchedEntityRecord {
                    entity,
                    monster_id,
                    owner: identity.owner_uuid,
                    detected_at_ms,
                    detected_mono_ms,
                });
                true
            }
            Entry::Occupied(mut slot) => {
                let record = slot.get_mut();
                if record.entity.generation != entity.generation {
                    *record = WatchedEntityRecord {
                        entity,
                        monster_id,
                        owner: identity.owner_uuid,
                        detected_at_ms,
                        detected_mono_ms,
                    };
                    return true;
                }
                let changed =
                    record.owner != identity.owner_uuid || record.monster_id != monster_id;
                record.owner = identity.owner_uuid;
                record.monster_id = monster_id;
                changed
            }
        }
    }

    pub fn remove(&mut self, entity: EntityUuid) {
        self.records.remove(&entity);
    }

    /// Forgets every present entity; the watch entries stay.
    pub fn clear(&mut self) {
        self.records.clear();
    }

    /// Display tracks, with casters classified via `entities`.
    #[must_use]
    pub fn tracks(&self, entities: &EntityContext) -> Vec<EntityDurationTrack<'_>> {
        self.tracks_with(|owner| entities.roles(owner).is_local_player)
    }

    /// [`Self::tracks`] as the HUD payload, with caster names resolved.
    #[must_use]
    pub fn track_states(&self, entities: &EntityContext) -> Vec<EntityDurationTrackState> {
        self.tracks(entities)
            .iter()
            .map(|track| track.to_state(entities))
            .collect()
    }

    /// Tracks in display order: by first member detection, which is the
    /// order they are created in. Watch lists and live entities number a
    /// handful, so tracks are rebuilt per read instead of being maintained
    /// incrementally.
    fn tracks_with(&self, is_local: impl Fn(EntityUuid) -> bool) -> Vec<EntityDurationTrack<'_>> {
        let mut records = self
            .records
            .values()
            .map(|record| (record, record.owner.is_some_and(&is_local)))
            .collect::<Vec<_>>();
        records.sort_unstable_by_key(|(record, _)| (record.detected_mono_ms, record.entity.uuid));

        let mut tracks: Vec<EntityDurationTrack<'_>> = Vec::new();
        let mut slots: HashMap<(usize, TrackKey), usize> = HashMap::new();
        for (record, owner_is_local) in records {
            for (spec_index, spec) in self.specs.iter().enumerate() {
                if spec.monster_id != record.monster_id
                    || (spec.scope == EntityOwnerScope::LocalPlayer && !owner_is_local)
                {
                    continue;
                }
                let key = if spec.merge {
                    TrackKey::Caster(record.owner)
                } else {
                    TrackKey::Entity(record.entity.uuid)
                };
                match slots.entry((spec_index, key)) {
                    Entry::Occupied(slot) => tracks[*slot.get()].members.push(record),
                    Entry::Vacant(slot) => {
                        slot.insert(tracks.len());
                        tracks.push(EntityDurationTrack {
                            spec,
                            key,
                            owner: record.owner,
                            members: vec![record],
                        });
                    }
                }
            }
        }
        tracks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CART: i32 = 179_903;
    const LOCAL: EntityUuid = EntityUuid(10);
    const TEAMMATE: EntityUuid = EntityUuid(20);

    fn spec(scope: EntityOwnerScope, duration_ms: Option<u64>, merge: bool) -> WatchedEntitySpec {
        WatchedEntitySpec {
            monster_id: CART,
            duration_ms,
            scope,
            merge,
        }
    }

    fn record(uuid: i64, owner: Option<EntityUuid>, detected_ms: u64) -> WatchedEntityRecord {
        WatchedEntityRecord {
            entity: EntityRef {
                uuid: EntityUuid(uuid),
                generation: 1,
            },
            monster_id: CART,
            owner,
            detected_at_ms: detected_ms as i64,
            detected_mono_ms: MonoTimeMs(detected_ms),
        }
    }

    fn watch(
        specs: Vec<WatchedEntitySpec>,
        records: Vec<WatchedEntityRecord>,
    ) -> EntityDurationWatch {
        EntityDurationWatch {
            watched_ids: specs.iter().map(|spec| spec.monster_id).collect(),
            specs,
            records: records
                .into_iter()
                .map(|record| (record.entity.uuid, record))
                .collect(),
        }
    }

    fn member_uuids(track: &EntityDurationTrack<'_>) -> Vec<i64> {
        track
            .members
            .iter()
            .map(|record| record.entity.uuid.0)
            .collect()
    }

    fn audible(track: &EntityDurationTrack<'_>, lead_ms: u64) -> Vec<(i64, u64)> {
        track
            .audible_expiries(lead_ms)
            .map(|(entity, expires)| (entity.0, expires.0))
            .collect()
    }

    #[test]
    fn unmerged_entry_yields_one_track_per_entity_in_detection_order() {
        let watch = watch(
            vec![spec(EntityOwnerScope::Any, Some(35_000), false)],
            vec![
                record(502, Some(TEAMMATE), 3_000),
                record(501, Some(LOCAL), 1_000),
                record(500, Some(LOCAL), 1_000),
            ],
        );
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        let keys = tracks.iter().map(|track| track.key).collect::<Vec<_>>();
        assert_eq!(
            keys,
            vec![
                TrackKey::Entity(EntityUuid(500)),
                TrackKey::Entity(EntityUuid(501)),
                TrackKey::Entity(EntityUuid(502)),
            ]
        );
        assert!(tracks.iter().all(|track| track.members.len() == 1));
    }

    #[test]
    fn merged_entry_groups_each_caster_and_orders_members_by_detection() {
        let watch = watch(
            vec![spec(EntityOwnerScope::Any, Some(35_000), true)],
            vec![
                record(503, None, 4_000),
                record(502, Some(TEAMMATE), 2_000),
                record(501, Some(LOCAL), 1_300),
                record(500, Some(LOCAL), 1_000),
            ],
        );
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0].key, TrackKey::Caster(Some(LOCAL)));
        assert_eq!(member_uuids(&tracks[0]), vec![500, 501]);
        assert_eq!(tracks[1].key, TrackKey::Caster(Some(TEAMMATE)));
        assert_eq!(tracks[1].owner, Some(TEAMMATE));
        assert_eq!(tracks[2].key, TrackKey::Caster(None));
        assert_eq!(member_uuids(&tracks[2]), vec![503]);
    }

    #[test]
    fn self_scope_drops_other_and_unknown_casters() {
        let watch = watch(
            vec![spec(EntityOwnerScope::LocalPlayer, Some(35_000), true)],
            vec![
                record(500, Some(LOCAL), 1_000),
                record(501, Some(TEAMMATE), 1_000),
                record(502, None, 1_000),
            ],
        );
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        assert_eq!(tracks.len(), 1);
        assert_eq!(member_uuids(&tracks[0]), vec![500]);
    }

    #[test]
    fn same_id_under_both_scopes_feeds_one_track_per_entry() {
        let watch = watch(
            vec![
                spec(EntityOwnerScope::LocalPlayer, Some(10_000), false),
                spec(EntityOwnerScope::Any, Some(30_000), true),
            ],
            vec![
                record(500, Some(LOCAL), 1_000),
                record(501, Some(TEAMMATE), 2_000),
            ],
        );
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        let shape = tracks
            .iter()
            .map(|track| (track.spec.scope, track.key))
            .collect::<Vec<_>>();
        assert_eq!(
            shape,
            vec![
                (
                    EntityOwnerScope::LocalPlayer,
                    TrackKey::Entity(EntityUuid(500))
                ),
                (EntityOwnerScope::Any, TrackKey::Caster(Some(LOCAL))),
                (EntityOwnerScope::Any, TrackKey::Caster(Some(TEAMMATE))),
            ]
        );
    }

    #[test]
    fn members_summoned_together_cue_once() {
        let watch = watch(
            vec![spec(EntityOwnerScope::LocalPlayer, Some(35_000), true)],
            vec![
                record(500, Some(LOCAL), 1_000),
                record(501, Some(LOCAL), 1_000),
                record(502, Some(LOCAL), 1_300),
            ],
        );
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        assert_eq!(audible(&tracks[0], 5_000), vec![(500, 36_000)]);
    }

    #[test]
    fn later_member_cues_only_when_it_takes_over_above_the_lead() {
        let watch = watch(
            vec![spec(EntityOwnerScope::LocalPlayer, Some(35_000), true)],
            vec![
                record(500, Some(LOCAL), 1_000),
                // Takes over at 36 000 with 3 s left: below a 5 s lead.
                record(501, Some(LOCAL), 4_000),
                // Takes over at 39 000 with 10 s left.
                record(502, Some(LOCAL), 14_000),
            ],
        );
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        assert_eq!(
            audible(&tracks[0], 5_000),
            vec![(500, 36_000), (502, 49_000)]
        );
        assert_eq!(
            audible(&tracks[0], 2_000),
            vec![(500, 36_000), (501, 39_000), (502, 49_000)]
        );
    }

    #[test]
    fn unmerged_tracks_keep_one_cue_per_entity_and_open_ended_tracks_have_none() {
        let timed = watch(
            vec![spec(EntityOwnerScope::Any, Some(10_000), false)],
            vec![
                record(500, Some(LOCAL), 1_000),
                record(501, Some(LOCAL), 1_000),
            ],
        );
        let tracks = timed.tracks_with(|owner| owner == LOCAL);
        assert_eq!(audible(&tracks[0], 5_000), vec![(500, 11_000)]);
        assert_eq!(audible(&tracks[1], 5_000), vec![(501, 11_000)]);

        let open_ended = watch(
            vec![spec(EntityOwnerScope::Any, None, true)],
            vec![record(500, Some(LOCAL), 1_000)],
        );
        let tracks = open_ended.tracks_with(|owner| owner == LOCAL);
        assert!(audible(&tracks[0], 5_000).is_empty());
    }

    #[test]
    fn track_state_carries_key_scope_and_ascending_wall_deadlines() {
        let entities = EntityContext::new();
        let merged = watch(
            vec![spec(EntityOwnerScope::Any, Some(35_000), true)],
            vec![
                record(501, Some(LOCAL), 1_300),
                record(500, Some(LOCAL), 1_000),
            ],
        );
        let tracks = merged.tracks_with(|owner| owner == LOCAL);
        let state = tracks[0].to_state(&entities);
        assert_eq!(state.key, "179903:any:c10");
        assert_eq!(state.scope, EntityOwnerScope::Any);
        assert_eq!(state.owner_uuid.as_deref(), Some("10"));
        assert_eq!(state.duration_ms, Some(35_000));
        assert_eq!(state.deadlines_ms, vec![36_000, 36_300]);

        let unmerged = watch(
            vec![spec(EntityOwnerScope::LocalPlayer, None, false)],
            vec![record(500, Some(LOCAL), 1_000)],
        );
        let tracks = unmerged.tracks_with(|owner| owner == LOCAL);
        let state = tracks[0].to_state(&entities);
        assert_eq!(state.key, "179903:self:e500");
        assert!(state.deadlines_ms.is_empty());
    }
}
