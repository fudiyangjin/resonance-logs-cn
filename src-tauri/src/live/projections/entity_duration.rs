//! Entity-duration watch list: the present entities that match configured
//! entries, folded into display *tracks*.
//!
//! A track is one row of the monster overlay's entity-duration panel. An
//! entry without `merge` yields one track per entity; a merged entry yields
//! one track per caster, holding every entity with the monster id that the
//! caster has on the field. The HUD payload and the voice projection both
//! read tracks from here, so scope filtering, grouping and expiry rules live
//! in one place.
//!
//! Discovery mode also admits the local player's entities whose id is not on
//! the watch list. They never form tracks (so they have no voice cues); the
//! HUD lists them per monster id so the player can find the id to add.

use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::fmt;

use crate::live::bootstrap_snapshot::{MonsterRuntimeSnapshot, WatchedEntitySpec};
use crate::live::ipc::models::{DiscoveredEntityState, EntityDurationTrackState};
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    EntityIdentity, EntityKind, EntityRef, EntityUuid, MonoTimeMs, wall_now_ms,
};
use crate::voice::models::EntityOwnerScope;

/// Most unlisted entities discovery mode keeps at once. Further ones are
/// ignored until some leave, so a burst of short-lived entities cannot grow
/// the payload without bound.
const MAX_DISCOVERED_ENTITIES: usize = 64;

/// The published view a record change touched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WatchView {
    /// The watch-list tracks, which the HUD and the voice cues read.
    Watched,
    /// Discovery mode's unlisted entities, which only the HUD reads.
    Discovered,
}

/// Whether `owner` is known and is the local player.
fn is_owned_by(owner: Option<EntityUuid>, local_player: Option<EntityUuid>) -> bool {
    owner.is_some() && owner == local_player
}

/// A present entity admitted by the entity-duration watch: its `monster_id`
/// is on the watch list, or discovery mode admitted it as the local player's.
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
    /// Discovery mode: also admit the local player's entities whose id is
    /// not on the watch list.
    monitor_all_own: bool,
    /// Records of both views. Whether a record's `monster_id` is in
    /// `watched_ids` decides its view, so an id moving onto or off the list
    /// keeps its detection time.
    records: HashMap<EntityUuid, WatchedEntityRecord>,
}

impl EntityDurationWatch {
    /// Replaces the watch entries and the discovery switch, then re-admits
    /// the scene (see [`Self::reseed`]).
    pub fn apply_config(
        &mut self,
        config: &MonsterRuntimeSnapshot,
        entities: &EntityContext,
        local_player: Option<EntityUuid>,
        now_mono: MonoTimeMs,
    ) {
        self.specs.clone_from(&config.watched_entities);
        self.watched_ids.clear();
        self.watched_ids.extend(config.watched_monster_ids());
        self.monitor_all_own = config.monitor_all_own_entities;
        self.reseed(entities, local_player, wall_now_ms(), now_mono);
    }

    /// Re-admits the scene against the current rules: drops the records no
    /// rule admits any more (an id taken off the list, discovery switched
    /// off, another local player) and seeds the present entities, so a newly
    /// admitted entity shows up immediately instead of waiting for its next
    /// identity update. Records that stay keep their detection time.
    pub fn reseed(
        &mut self,
        entities: &EntityContext,
        local_player: Option<EntityUuid>,
        now_wall_ms: i64,
        now_mono: MonoTimeMs,
    ) {
        let watched = &self.watched_ids;
        let monitor_all_own = self.monitor_all_own;
        self.records.retain(|_, record| {
            watched.contains(&record.monster_id)
                || (monitor_all_own && is_owned_by(record.owner, local_player))
        });
        for state in entities.entities().filter(|state| state.is_present) {
            // Seeding republishes the whole view anyway.
            let _ = self.sync(
                state.entity,
                &state.identity,
                true,
                local_player,
                now_wall_ms,
                now_mono,
            );
        }
    }

    /// Keeps the record for `entity` in sync with its identity and presence.
    /// Returns the view that changed, if any; a record whose id moved
    /// between the views reports [`WatchView::Watched`].
    /// `detected_at_ms` is consumed only when a record is created or a reused
    /// uuid comes back with a new generation.
    #[must_use]
    pub fn sync(
        &mut self,
        entity: EntityRef,
        identity: &EntityIdentity,
        is_present: bool,
        local_player: Option<EntityUuid>,
        detected_at_ms: i64,
        detected_mono_ms: MonoTimeMs,
    ) -> Option<WatchView> {
        let recorded_id = self
            .records
            .get(&entity.uuid)
            .map(|record| record.monster_id);
        let admitted_id = identity.monster_id.filter(|monster_id| {
            is_present
                && (self.watched_ids.contains(monster_id)
                    || (self.monitor_all_own
                        && is_owned_by(identity.owner_uuid, local_player)
                        && (recorded_id.is_some()
                            || self.discovered_len() < MAX_DISCOVERED_ENTITIES)))
        });
        let Some(monster_id) = admitted_id else {
            return self.remove(entity.uuid);
        };
        let changed = self.upsert(
            entity,
            monster_id,
            identity,
            detected_at_ms,
            detected_mono_ms,
        );
        let touches_watched = self.watched_ids.contains(&monster_id)
            || recorded_id.is_some_and(|id| self.watched_ids.contains(&id));
        changed.then_some(if touches_watched {
            WatchView::Watched
        } else {
            WatchView::Discovered
        })
    }

    /// Creates or refreshes the record of an admitted entity; returns
    /// whether it changed.
    fn upsert(
        &mut self,
        entity: EntityRef,
        monster_id: i32,
        identity: &EntityIdentity,
        detected_at_ms: i64,
        detected_mono_ms: MonoTimeMs,
    ) -> bool {
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

    /// Forgets `entity`; returns the view it was in, if it was admitted.
    #[must_use]
    pub fn remove(&mut self, entity: EntityUuid) -> Option<WatchView> {
        self.records
            .remove(&entity)
            .map(|record| self.view_of(record.monster_id))
    }

    fn view_of(&self, monster_id: i32) -> WatchView {
        if self.watched_ids.contains(&monster_id) {
            WatchView::Watched
        } else {
            WatchView::Discovered
        }
    }

    /// Discovered records (ids not on the watch list).
    fn discovered(&self) -> impl Iterator<Item = &WatchedEntityRecord> + '_ {
        self.records
            .values()
            .filter(|record| !self.watched_ids.contains(&record.monster_id))
    }

    fn discovered_len(&self) -> usize {
        self.discovered().count()
    }

    /// Discovery mode's unlisted entities as the HUD payload: one entry per
    /// monster id, in order of first detection, with how many are present
    /// and the earliest detection time. Names and kinds are read from
    /// `entities` at publish time; the first member with a name names the
    /// entry.
    #[must_use]
    pub fn discovered_states(&self, entities: &EntityContext) -> Vec<DiscoveredEntityState> {
        let mut records = self.discovered().collect::<Vec<_>>();
        records.sort_unstable_by_key(|record| (record.detected_mono_ms, record.entity.uuid));

        let mut states: Vec<DiscoveredEntityState> = Vec::new();
        let mut slots: HashMap<i32, usize> = HashMap::new();
        for record in records {
            let identity = entities
                .entity(record.entity.uuid)
                .map(|state| &state.identity);
            let name = || identity.and_then(|identity| identity.name.clone());
            match slots.entry(record.monster_id) {
                Entry::Occupied(slot) => {
                    let state = &mut states[*slot.get()];
                    state.count = state.count.saturating_add(1);
                    if state.name.is_none() {
                        state.name = name();
                    }
                }
                Entry::Vacant(slot) => {
                    slot.insert(states.len());
                    states.push(DiscoveredEntityState {
                        monster_id: record.monster_id,
                        name: name(),
                        is_monster: identity
                            .is_some_and(|identity| identity.kind == EntityKind::Monster),
                        count: 1,
                        detected_at_ms: record.detected_at_ms,
                    });
                }
            }
        }
        states
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
            ..EntityDurationWatch::default()
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

    /// An unlisted id, numbered like a field.
    const FIELD: i32 = 53;

    fn entity_ref(uuid: i64) -> EntityRef {
        EntityRef {
            uuid: EntityUuid(uuid),
            generation: 1,
        }
    }

    fn identity(monster_id: i32, owner: Option<EntityUuid>) -> EntityIdentity {
        EntityIdentity {
            monster_id: Some(monster_id),
            owner_uuid: owner,
            ..EntityIdentity::default()
        }
    }

    /// A watch on the cart entry with discovery switched on.
    fn discovering() -> EntityDurationWatch {
        let mut watch = watch(
            vec![spec(EntityOwnerScope::LocalPlayer, Some(35_000), true)],
            Vec::new(),
        );
        watch.monitor_all_own = true;
        watch
    }

    /// Syncs a present entity with `LOCAL` as the local player.
    fn sync_at(
        watch: &mut EntityDurationWatch,
        uuid: i64,
        monster_id: i32,
        owner: Option<EntityUuid>,
        detected_ms: u64,
    ) -> Option<WatchView> {
        watch.sync(
            entity_ref(uuid),
            &identity(monster_id, owner),
            true,
            Some(LOCAL),
            detected_ms as i64,
            MonoTimeMs(detected_ms),
        )
    }

    fn config(
        specs: Vec<WatchedEntitySpec>,
        monitor_all_own_entities: bool,
    ) -> MonsterRuntimeSnapshot {
        MonsterRuntimeSnapshot {
            watched_entities: specs,
            monitor_all_own_entities,
            ..MonsterRuntimeSnapshot::default()
        }
    }

    /// `(monster id, count, detected at)` of each discovered entry.
    fn discovered(watch: &EntityDurationWatch) -> Vec<(i32, u32, i64)> {
        watch
            .discovered_states(&EntityContext::new())
            .iter()
            .map(|state| (state.monster_id, state.count, state.detected_at_ms))
            .collect()
    }

    #[test]
    fn discovery_admits_own_unlisted_entities_without_forming_tracks() {
        let mut watch = discovering();
        assert_eq!(
            sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000),
            Some(WatchView::Discovered)
        );
        assert!(watch.tracks_with(|owner| owner == LOCAL).is_empty());
        assert_eq!(discovered(&watch), vec![(FIELD, 1, 1_000)]);
    }

    #[test]
    fn discovery_skips_entities_of_other_or_unknown_casters() {
        let mut watch = discovering();
        assert_eq!(sync_at(&mut watch, 600, FIELD, Some(TEAMMATE), 1_000), None);
        assert_eq!(sync_at(&mut watch, 601, FIELD, None, 1_000), None);
        // Without a known local player nothing is the local player's.
        let no_local = watch.sync(
            entity_ref(602),
            &identity(FIELD, Some(LOCAL)),
            true,
            None,
            1_000,
            MonoTimeMs(1_000),
        );
        assert_eq!(no_local, None);
        assert!(discovered(&watch).is_empty());
    }

    #[test]
    fn without_discovery_only_watched_ids_are_admitted() {
        let mut watch = discovering();
        watch.monitor_all_own = false;
        assert_eq!(sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000), None);
        assert_eq!(
            sync_at(&mut watch, 500, CART, Some(LOCAL), 1_000),
            Some(WatchView::Watched)
        );
        assert!(discovered(&watch).is_empty());
    }

    #[test]
    fn sync_and_remove_report_the_view_they_changed() {
        let mut watch = discovering();
        assert_eq!(
            sync_at(&mut watch, 500, CART, Some(LOCAL), 1_000),
            Some(WatchView::Watched)
        );
        assert_eq!(
            sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000),
            Some(WatchView::Discovered)
        );
        assert_eq!(sync_at(&mut watch, 600, FIELD, Some(LOCAL), 2_000), None);
        // The cart turning into an unlisted id leaves the tracks.
        assert_eq!(
            sync_at(&mut watch, 500, FIELD, Some(LOCAL), 2_000),
            Some(WatchView::Watched)
        );
        assert_eq!(discovered(&watch), vec![(FIELD, 2, 1_000)]);
        assert_eq!(watch.remove(EntityUuid(600)), Some(WatchView::Discovered));
        assert_eq!(watch.remove(EntityUuid(600)), None);
        let left_view = watch.sync(
            entity_ref(500),
            &identity(FIELD, Some(LOCAL)),
            false,
            Some(LOCAL),
            3_000,
            MonoTimeMs(3_000),
        );
        assert_eq!(left_view, Some(WatchView::Discovered));
    }

    #[test]
    fn an_id_moving_onto_or_off_the_list_keeps_its_detection_time() {
        let entities = EntityContext::new();
        let mut watch = discovering();
        let _ = sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000);

        let field_spec = WatchedEntitySpec {
            monster_id: FIELD,
            ..spec(EntityOwnerScope::LocalPlayer, Some(15_000), false)
        };
        watch.apply_config(
            &config(vec![field_spec], true),
            &entities,
            Some(LOCAL),
            MonoTimeMs(5_000),
        );
        assert!(discovered(&watch).is_empty());
        let tracks = watch.tracks_with(|owner| owner == LOCAL);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].members[0].detected_at_ms, 1_000);

        watch.apply_config(
            &config(Vec::new(), true),
            &entities,
            Some(LOCAL),
            MonoTimeMs(6_000),
        );
        assert!(watch.tracks_with(|owner| owner == LOCAL).is_empty());
        assert_eq!(discovered(&watch), vec![(FIELD, 1, 1_000)]);
    }

    #[test]
    fn switching_discovery_off_drops_only_discovered_records() {
        let entities = EntityContext::new();
        let mut watch = discovering();
        let _ = sync_at(&mut watch, 500, CART, Some(LOCAL), 1_000);
        let _ = sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000);
        watch.apply_config(
            &config(
                vec![spec(EntityOwnerScope::LocalPlayer, Some(35_000), true)],
                false,
            ),
            &entities,
            Some(LOCAL),
            MonoTimeMs(2_000),
        );
        assert!(discovered(&watch).is_empty());
        assert_eq!(watch.tracks_with(|owner| owner == LOCAL).len(), 1);
    }

    #[test]
    fn another_local_player_drops_the_previous_ones_discoveries() {
        let mut watch = discovering();
        let _ = sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000);
        watch.reseed(
            &EntityContext::new(),
            Some(TEAMMATE),
            2_000,
            MonoTimeMs(2_000),
        );
        assert!(discovered(&watch).is_empty());
    }

    #[test]
    fn discovery_stops_admitting_at_the_cap_but_watched_ids_still_enter() {
        let mut watch = discovering();
        let cap = i64::try_from(MAX_DISCOVERED_ENTITIES).expect("cap fits in i64");
        for offset in 0..cap {
            assert_eq!(
                sync_at(&mut watch, 1_000 + offset, FIELD, Some(LOCAL), 1_000),
                Some(WatchView::Discovered)
            );
        }
        assert_eq!(sync_at(&mut watch, 5_000, FIELD, Some(LOCAL), 1_000), None);
        // Entities already admitted keep updating at the cap.
        assert_eq!(
            sync_at(&mut watch, 1_000, FIELD + 1, Some(LOCAL), 2_000),
            Some(WatchView::Discovered)
        );
        assert_eq!(
            sync_at(&mut watch, 500, CART, Some(LOCAL), 1_000),
            Some(WatchView::Watched)
        );
    }

    #[test]
    fn discovered_states_fold_each_id_with_count_and_earliest_detection() {
        let mut watch = discovering();
        let _ = sync_at(&mut watch, 601, FIELD, Some(LOCAL), 2_000);
        let _ = sync_at(&mut watch, 700, 77, Some(LOCAL), 1_500);
        let _ = sync_at(&mut watch, 600, FIELD, Some(LOCAL), 1_000);
        assert_eq!(discovered(&watch), vec![(FIELD, 2, 1_000), (77, 1, 1_500)]);
    }
}
