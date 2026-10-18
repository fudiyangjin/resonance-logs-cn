//! Boss HP reporting.
//!
//! Turns the tracked bosses in view into the versioned [`HpTable`] the report
//! client diffs and sends (see `docs/HP_REPORT_PROTOCOL.md`). Events only mark
//! bosses dirty; [`HpReportProjection::sync`] reads their current values from
//! [`EntityContext`] once per batch, so a burst of hits costs one lookup.

use std::collections::HashMap;
use std::sync::Arc;

use crate::live::hp_link::{
    HpContext, HpLinkEvent, HpSample, HpShare, HpTable, MonsterId, TrackedMobs,
};
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::entity_context::{EntityContext, EntityState};
use crate::live::runtime::events::{DomainEvent, EntityIdentity, EntityKind, EntityUuid};

#[derive(Debug, Default)]
pub struct HpReportProjection {
    /// Empty until the report client delivers the server's list.
    tracked: Arc<TrackedMobs>,
    /// Present entities that are tracked bosses.
    watched: HashMap<EntityUuid, MonsterId>,
    /// Watched entities touched since the last sync; the buffer is reused.
    dirty: Vec<EntityUuid>,
    context: Option<HpContext>,
    table: HpTable,
    next_version: u64,
    changed: bool,
    pending: Option<HpShare>,
}

impl HpReportProjection {
    /// Notes which bosses an event may have changed. Runs for every event, so
    /// it only looks at the watched set.
    pub fn observe(&mut self, event: &DomainEvent) {
        match event {
            DomainEvent::IdentityChanged {
                entity, current, ..
            } => match tracked_id(&self.tracked, current) {
                Some(id) => {
                    self.watched.insert(entity.uuid, id);
                    self.touch(entity.uuid);
                }
                None => self.unwatch(entity.uuid),
            },
            DomainEvent::AttributeChanged {
                entity, attr_id, ..
            } if matches!(
                *attr_id,
                attr_type::ATTR_CURRENT_HP | attr_type::ATTR_MAX_HP
            ) =>
            {
                self.touch(entity.uuid);
            }
            DomainEvent::PositionChanged { entity, .. } | DomainEvent::Revived { entity } => {
                self.touch(entity.uuid);
            }
            DomainEvent::DeathOccurred { victim, .. } => self.touch(victim.uuid),
            DomainEvent::EntityDisappeared { entity } => self.unwatch(entity.uuid),
            DomainEvent::ContainerReset | DomainEvent::SceneChanged { .. } => self.clear_view(),
            _ => {}
        }
    }

    /// Re-derives the report context and the dirty bosses. Called once per
    /// batch.
    pub fn sync(&mut self, entities: &EntityContext) {
        let context = entities
            .game_client()
            .zip(entities.field_line())
            .map(|(distribution, line)| HpContext { distribution, line });
        if context != self.context {
            self.context = context;
            // Entries describe the previous line; rebuild them for this one.
            self.table.entries.clear();
            self.dirty.clear();
            self.dirty.extend(self.watched.keys().copied());
            self.changed = true;
        }
        let mut dirty = std::mem::take(&mut self.dirty);
        for uuid in dirty.drain(..) {
            self.refresh(uuid, entities);
        }
        self.dirty = dirty;
        if std::mem::take(&mut self.changed) {
            self.pending = Some(HpShare {
                context: self.context,
                table: Arc::new(self.table.clone()),
            });
        }
    }

    /// The latest share state, if it changed since the last call.
    pub fn take_share(&mut self) -> Option<HpShare> {
        self.pending.take()
    }

    /// Applies an update from the report client.
    pub fn apply_event(&mut self, event: HpLinkEvent, entities: &EntityContext) {
        match event {
            HpLinkEvent::Tracked(tracked) => {
                self.tracked = tracked;
                let tracked = &self.tracked;
                self.watched.clear();
                self.watched.extend(
                    entities
                        .entities()
                        .filter(|state| state.is_present)
                        .filter_map(|state| {
                            tracked_id(tracked, &state.identity).map(|id| (state.entity.uuid, id))
                        }),
                );
                self.table.entries.clear();
                self.dirty.clear();
                self.dirty.extend(self.watched.keys().copied());
                self.changed = true;
                self.sync(entities);
            }
        }
    }

    fn touch(&mut self, uuid: EntityUuid) {
        if self.watched.contains_key(&uuid) && !self.dirty.contains(&uuid) {
            self.dirty.push(uuid);
        }
    }

    fn unwatch(&mut self, uuid: EntityUuid) {
        let Some(id) = self.watched.remove(&uuid) else {
            return;
        };
        self.dirty.retain(|dirty| *dirty != uuid);
        // Another instance of the same boss may still be in view.
        let still_seen = self.watched.values().any(|other| *other == id);
        if !still_seen && self.table.entries.remove(&id).is_some() {
            self.changed = true;
        }
    }

    fn clear_view(&mut self) {
        self.watched.clear();
        self.dirty.clear();
        if !self.table.entries.is_empty() {
            self.table.entries.clear();
            self.changed = true;
        }
    }

    fn refresh(&mut self, uuid: EntityUuid, entities: &EntityContext) {
        let Some(&id) = self.watched.get(&uuid) else {
            return;
        };
        let located = self.tracked.located.contains(&id);
        let Some(sample) = entities
            .entity(uuid)
            .and_then(|state| sample(state, located))
        else {
            return;
        };
        if self
            .table
            .entries
            .get(&id)
            .is_some_and(|(current, _)| *current == sample)
        {
            return;
        }
        self.next_version += 1;
        self.table.entries.insert(id, (sample, self.next_version));
        self.changed = true;
    }
}

fn tracked_id(tracked: &TrackedMobs, identity: &EntityIdentity) -> Option<MonsterId> {
    identity
        .monster_id
        .filter(|_| identity.kind == EntityKind::Monster)
        .map(MonsterId)
        .filter(|id| tracked.ids.contains(id))
}

/// The reportable state of a boss, or `None` until its HP (and, for located
/// mobs, its position) is known.
fn sample(state: &EntityState, located: bool) -> Option<HpSample> {
    let hp = hp_step(state)?;
    let position = if located {
        let position = state.positions.get(&attr_type::ATTR_POS)?;
        Some([position.x.round() as i32, position.z.round() as i32])
    } else {
        None
    };
    Some(HpSample { hp, position })
}

/// HP rounded to the nearest 5 % step: `0` only once the boss is dead,
/// otherwise at least `5`, so a sliver of HP never reads as a kill.
fn hp_step(state: &EntityState) -> Option<u8> {
    if state.is_dead {
        return Some(0);
    }
    let current = state.int_attr(attr_type::ATTR_CURRENT_HP)?;
    if current <= 0 {
        return Some(0);
    }
    let max = state
        .int_attr(attr_type::ATTR_MAX_HP)
        .filter(|max| *max > 0)?;
    let steps = (i128::from(current) * 20 + i128::from(max) / 2) / i128::from(max);
    u8::try_from(steps.clamp(1, 20) * 5).ok()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::live::hp_link::{Distribution, LineId};
    use crate::live::runtime::events::{
        AttributeValue, BatchId, EntityIdentityPatch, EventMeta, FieldPatch, ObservationOrigin,
        Position, ProtocolBatch, ProtocolObservation,
    };
    use crate::live::runtime::team_roster::test_support::player;

    const BOSS: EntityUuid = EntityUuid(9_000_064);
    const BOSS_ID: i32 = 10_032;
    const BOARLET: EntityUuid = EntityUuid(9_100_064);
    const BOARLET_ID: i32 = 10_904;
    const FIELD_SCENE: i32 = 10;

    struct Harness {
        context: EntityContext,
        projection: HpReportProjection,
        batch: u64,
    }

    impl Harness {
        fn new() -> Self {
            Self {
                context: EntityContext::new(),
                projection: HpReportProjection::default(),
                batch: 0,
            }
        }

        fn tracked() -> Self {
            let mut harness = Self::new();
            harness.track();
            harness
        }

        fn track(&mut self) {
            let tracked = TrackedMobs {
                ids: HashSet::from([MonsterId(BOSS_ID), MonsterId(BOARLET_ID)]),
                located: HashSet::from([MonsterId(BOARLET_ID)]),
            };
            self.projection
                .apply_event(HpLinkEvent::Tracked(Arc::new(tracked)), &self.context);
        }

        fn apply(&mut self, observations: Vec<ProtocolObservation>) {
            self.batch += 1;
            let meta = EventMeta {
                batch_id: BatchId(self.batch),
                capture_sequence: self.batch,
                stream_id: 1,
                stream_epoch: 1,
                captured_wall_ms: 10_000,
                captured_mono_ns: self.batch * 1_000_000,
                source_time_ms: None,
            };
            let events = self
                .context
                .apply_batch(ProtocolBatch { meta, observations });
            for envelope in &events {
                self.projection.observe(&envelope.event);
            }
            self.projection.sync(&self.context);
        }

        fn enter_field(&mut self, line: u32) {
            let local = player(7);
            self.apply(vec![
                ProtocolObservation::GameClientIdentified {
                    distribution: Distribution::Star,
                },
                ProtocolObservation::LocalPlayerChanged { uuid: Some(local) },
                ProtocolObservation::SceneChanged {
                    scene_id: FIELD_SCENE,
                    difficulty: None,
                },
            ]);
            self.place(line);
        }

        fn place(&mut self, line: u32) {
            self.apply(vec![ProtocolObservation::SceneLineObserved {
                char_id: 7,
                map_id: FIELD_SCENE,
                line: LineId(line),
            }]);
        }

        fn spawn(&mut self, uuid: EntityUuid, monster_id: i32, hp: i64) {
            self.apply(vec![
                ProtocolObservation::EntityAppeared {
                    uuid,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::IdentityUpdated {
                    uuid,
                    patch: EntityIdentityPatch {
                        kind: FieldPatch::Set(EntityKind::Monster),
                        monster_id: FieldPatch::Set(monster_id),
                        ..Default::default()
                    },
                },
                hp_attr(uuid, attr_type::ATTR_MAX_HP, 1_000),
                hp_attr(uuid, attr_type::ATTR_CURRENT_HP, hp),
            ]);
        }

        fn hp(&mut self, uuid: EntityUuid, hp: i64) {
            self.apply(vec![hp_attr(uuid, attr_type::ATTR_CURRENT_HP, hp)]);
        }

        fn take(&mut self) -> Option<HpShare> {
            self.projection.take_share()
        }

        fn table(&mut self) -> Vec<(i32, u8, Option<[i32; 2]>)> {
            let share = self.take().expect("share published");
            share
                .table
                .entries
                .iter()
                .map(|(id, (sample, _))| (id.0, sample.hp, sample.position))
                .collect()
        }
    }

    fn hp_attr(uuid: EntityUuid, attr_id: i32, value: i64) -> ProtocolObservation {
        ProtocolObservation::AttributeUpdated {
            uuid,
            attr_id,
            value: AttributeValue::Int(value),
            origin: ObservationOrigin::Delta,
        }
    }

    #[test]
    fn reports_tracked_bosses_in_five_percent_steps() {
        let mut harness = Harness::tracked();
        harness.enter_field(16);
        harness.spawn(BOSS, BOSS_ID, 1_000);
        let share = harness.take().expect("share published");
        assert_eq!(
            share.context,
            Some(HpContext {
                distribution: Distribution::Star,
                line: LineId(16),
            })
        );
        assert_eq!(share.table.entries[&MonsterId(BOSS_ID)].0.hp, 100);

        harness.hp(BOSS, 874);
        assert_eq!(harness.table(), vec![(BOSS_ID, 85, None)]);
        harness.hp(BOSS, 870);
        assert!(harness.take().is_none(), "same step publishes nothing");
        harness.hp(BOSS, 20);
        assert_eq!(harness.table(), vec![(BOSS_ID, 5, None)]);
        harness.hp(BOSS, 0);
        assert_eq!(harness.table(), vec![(BOSS_ID, 0, None)]);
    }

    #[test]
    fn waits_for_the_server_list_and_ignores_untracked_monsters() {
        let mut harness = Harness::new();
        harness.enter_field(16);
        harness.spawn(BOSS, BOSS_ID, 1_000);
        harness.spawn(EntityUuid(9_200_064), 12_345, 1_000);
        harness.take();

        harness.track();
        assert_eq!(harness.table(), vec![(BOSS_ID, 100, None)]);
    }

    #[test]
    fn located_mobs_carry_their_rounded_position() {
        let mut harness = Harness::tracked();
        harness.enter_field(16);
        harness.spawn(BOARLET, BOARLET_ID, 500);
        assert!(
            harness
                .take()
                .is_none_or(|share| share.table.entries.is_empty()),
            "no position yet"
        );

        harness.apply(vec![ProtocolObservation::PositionUpdated {
            uuid: BOARLET,
            attr_id: attr_type::ATTR_POS,
            position: Position {
                x: -282.4,
                y: 157.0,
                z: 86.6,
            },
            origin: ObservationOrigin::Delta,
        }]);
        assert_eq!(harness.table(), vec![(BOARLET_ID, 50, Some([-282, 87]))]);
    }

    #[test]
    fn context_follows_the_line_and_the_dungeon_state() {
        let mut harness = Harness::tracked();
        harness.enter_field(16);
        harness.spawn(BOSS, BOSS_ID, 600);
        harness.take();

        harness.place(6);
        let share = harness.take().expect("line change publishes");
        assert_eq!(share.context.map(|context| context.line), Some(LineId(6)));
        assert_eq!(share.table.entries[&MonsterId(BOSS_ID)].0.hp, 60);

        harness.apply(vec![ProtocolObservation::DungeonFlowChanged { state: 2 }]);
        assert_eq!(harness.take().expect("context cleared").context, None);
    }

    #[test]
    fn bosses_leave_the_table_when_they_leave_view() {
        let mut harness = Harness::tracked();
        harness.enter_field(16);
        harness.spawn(BOSS, BOSS_ID, 1_000);
        harness.take();

        harness.apply(vec![ProtocolObservation::EntityDisappeared { uuid: BOSS }]);
        assert!(harness.table().is_empty());
    }
}
