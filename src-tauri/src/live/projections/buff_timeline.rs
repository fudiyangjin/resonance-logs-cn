//! Whitelist-driven buff presence timeline and live coverage.
//!
//! Tracks the configured watch list on every visible character entity,
//! merging concurrent instances of one base id into a single presence.
//! Presence edges are handed back for history persistence; live coverage is
//! accumulated for the local player through the shared
//! [`BuffCoverageTracker`] so live numbers match a later history replay.
//!
//! The projection keeps its own open-presence table because entity despawn
//! clears `EntityContext::active_buffs` before the disappearance event is
//! observed here, and it never reads `started_*` timestamps (refreshes
//! re-anchor them).
//!
//! Whitelisted composite buffs (negative ids) live in the same table; they
//! are re-derived from the entity table whenever one of their members
//! changes, so history replay and coverage treat them like any buff.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::database::history_codec::{HistoryBuff, HistoryBuffEdge};
use crate::live::active_window::{ActiveWindowAdvance, BuffCoverageTracker};
use crate::live::ipc::models::BuffCoverageEntry;
use crate::live::projections::buff_presence::BuffCompositeCatalog;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{BuffEvent, BuffTransition, EntityKind, MonoTimeMs};

#[derive(Debug, Default, PartialEq, Eq)]
struct OpenBuff {
    instances: HashSet<i64>,
    layer: i32,
    expires_hint_ms: Option<u64>,
}

#[derive(Debug, Default)]
pub struct BuffTimelineProjection {
    whitelist: HashSet<i32>,
    /// Configured entry order; drives the HUD coverage row order.
    hud_order: Vec<i32>,
    composites: Arc<BuffCompositeCatalog>,
    tracker: BuffCoverageTracker,
    /// entity id -> base id -> merged presence.
    open: HashMap<i64, HashMap<i32, OpenBuff>>,
    segment_active: bool,
}

impl BuffTimelineProjection {
    pub fn apply_config(
        &mut self,
        ids: &[i32],
        composites: Arc<BuffCompositeCatalog>,
        entities: &EntityContext,
        current_offset_ms: Option<u64>,
        mut expires_offset: impl FnMut(MonoTimeMs) -> u64,
    ) -> Vec<HistoryBuff> {
        self.composites = composites;
        self.whitelist = ids.iter().copied().collect();
        self.hud_order.clear();
        for id in ids.iter().copied() {
            if !self.hud_order.contains(&id) {
                self.hud_order.push(id);
            }
        }
        current_offset_ms.map_or_else(Vec::new, |at| {
            self.reconcile_from_entities(entities, at, &mut expires_offset)
        })
    }

    /// Resets per-segment state and opens Baseline presences (clamped to
    /// offset 0) for whitelisted buffs already present on player entities.
    pub fn start_segment(
        &mut self,
        entities: &EntityContext,
        mut expires_offset: impl FnMut(MonoTimeMs) -> u64,
    ) -> Vec<HistoryBuff> {
        self.clear();
        self.segment_active = true;
        self.reconcile_from_entities(entities, 0, &mut expires_offset)
    }

    /// Clears runtime coverage state, keeping the configured watch list.
    pub fn clear(&mut self) {
        self.tracker.reset();
        self.open.clear();
        self.segment_active = false;
    }

    /// Rebinds live coverage to the current local player. Historical
    /// character presence is intentionally left untouched.
    pub fn rebind_local_player(&mut self, entities: &EntityContext, at: u64) {
        self.tracker.reset();
        let Some(local) = entities.local_player() else {
            return;
        };
        let entity_id = local.uuid.0;
        let Some(buffs) = self.open.get(&entity_id) else {
            return;
        };
        for (base_id, state) in buffs {
            self.tracker
                .set_on((entity_id, *base_id), at, state.expires_hint_ms);
        }
    }

    pub fn apply_buff(
        &mut self,
        event: &BuffEvent,
        target_is_character: bool,
        offset_ms: u64,
        expires_offset_ms: Option<u64>,
    ) -> Vec<HistoryBuff> {
        if !self.segment_active
            || !self.whitelist.contains(&event.state.base_id)
            || !(event.target_roles.is_local_player || target_is_character)
        {
            return Vec::new();
        }
        let entity_id = event.state.target.uuid.0;
        let base_id = event.state.base_id;
        let key = (entity_id, base_id);
        let layer = event.state.layer;
        let mut edges = Vec::new();

        match event.transition {
            BuffTransition::Baseline | BuffTransition::Applied => {
                let state = self
                    .open
                    .entry(entity_id)
                    .or_default()
                    .entry(base_id)
                    .or_default();
                let newly_open = state.instances.is_empty();
                state.instances.insert(event.state.instance_id);
                state.layer = layer;
                if newly_open {
                    state.expires_hint_ms = expires_offset_ms;
                    if event.target_roles.is_local_player {
                        self.tracker.set_on(key, offset_ms, expires_offset_ms);
                    }
                    edges.push(HistoryBuff {
                        entity_id,
                        base_id,
                        edge: if event.transition == BuffTransition::Baseline {
                            HistoryBuffEdge::Baseline
                        } else {
                            HistoryBuffEdge::Applied
                        },
                        layer,
                        expires_offset_ms,
                    });
                } else if extends_hint(state.expires_hint_ms, expires_offset_ms) {
                    // A second instance stretched the merged expiry: record it
                    // so a lost remove still truncates at the right time.
                    state.expires_hint_ms = expires_offset_ms;
                    if event.target_roles.is_local_player {
                        self.tracker.refresh_hint(key, offset_ms, expires_offset_ms);
                    }
                    edges.push(HistoryBuff {
                        entity_id,
                        base_id,
                        edge: HistoryBuffEdge::Refreshed,
                        layer,
                        expires_offset_ms,
                    });
                }
            }
            BuffTransition::Refreshed | BuffTransition::LayerChanged => {
                let state = self
                    .open
                    .entry(entity_id)
                    .or_default()
                    .entry(base_id)
                    .or_default();
                let newly_open = state.instances.is_empty();
                state.instances.insert(event.state.instance_id);
                let layer_changed =
                    event.transition == BuffTransition::LayerChanged && state.layer != layer;
                state.layer = layer;
                if newly_open {
                    // A refresh for an instance we never saw open: treat as an
                    // application so the presence is not lost.
                    state.expires_hint_ms = expires_offset_ms;
                    if event.target_roles.is_local_player {
                        self.tracker.set_on(key, offset_ms, expires_offset_ms);
                    }
                    edges.push(HistoryBuff {
                        entity_id,
                        base_id,
                        edge: HistoryBuffEdge::Applied,
                        layer,
                        expires_offset_ms,
                    });
                } else {
                    if event.duration_updated {
                        state.expires_hint_ms = expires_offset_ms;
                        if event.target_roles.is_local_player {
                            self.tracker.refresh_hint(key, offset_ms, expires_offset_ms);
                        }
                        edges.push(HistoryBuff {
                            entity_id,
                            base_id,
                            edge: HistoryBuffEdge::Refreshed,
                            layer,
                            expires_offset_ms,
                        });
                    }
                    if layer_changed {
                        edges.push(HistoryBuff {
                            entity_id,
                            base_id,
                            edge: HistoryBuffEdge::LayerChanged,
                            layer,
                            expires_offset_ms: None,
                        });
                    }
                }
            }
            BuffTransition::Removed => {
                let Some(buffs) = self.open.get_mut(&entity_id) else {
                    return edges;
                };
                let Some(state) = buffs.get_mut(&base_id) else {
                    return edges;
                };
                state.instances.remove(&event.state.instance_id);
                if state.instances.is_empty() {
                    buffs.remove(&base_id);
                    if buffs.is_empty() {
                        self.open.remove(&entity_id);
                    }
                    if event.target_roles.is_local_player {
                        self.tracker.set_off(key, offset_ms);
                    }
                    edges.push(HistoryBuff {
                        entity_id,
                        base_id,
                        edge: HistoryBuffEdge::Removed,
                        layer,
                        expires_offset_ms: None,
                    });
                }
            }
        }
        edges
    }

    /// Re-derives the whitelisted composites that `event`'s buff belongs to
    /// from the entity table, which already reflects the event. Buffs outside
    /// every composite return after one lookup.
    pub fn apply_composites(
        &mut self,
        event: &BuffEvent,
        target_is_character: bool,
        entities: &EntityContext,
        offset_ms: u64,
        mut expires_offset: impl FnMut(MonoTimeMs) -> u64,
    ) -> Vec<HistoryBuff> {
        if !self.segment_active || !(event.target_roles.is_local_player || target_is_character) {
            return Vec::new();
        }
        let target = event.state.target.uuid;
        let entity_id = target.0;
        let mut sink = EdgeSink {
            tracker: &mut self.tracker,
            edges: Vec::new(),
            at: offset_ms,
            local_id: event.target_roles.is_local_player.then_some(entity_id),
        };
        for composite in self.composites.with_member(event.state.base_id) {
            if !self.whitelist.contains(&composite.id) {
                continue;
            }
            let next = entities
                .entity(target)
                .and_then(|state| composite.presence(state.active_buffs.values()))
                .map(|presence| OpenBuff {
                    instances: HashSet::new(),
                    layer: presence.layer,
                    expires_hint_ms: presence.expires_mono_ms().map(&mut expires_offset),
                });
            let previous = self
                .open
                .get(&entity_id)
                .and_then(|buffs| buffs.get(&composite.id));
            sink.diff(
                (entity_id, composite.id),
                previous,
                next.as_ref(),
                HistoryBuffEdge::Applied,
            );
            match next {
                Some(next) => {
                    self.open
                        .entry(entity_id)
                        .or_default()
                        .insert(composite.id, next);
                }
                None => {
                    if let Some(buffs) = self.open.get_mut(&entity_id) {
                        buffs.remove(&composite.id);
                        if buffs.is_empty() {
                            self.open.remove(&entity_id);
                        }
                    }
                }
            }
        }
        sink.edges
    }

    /// Synthesizes close edges when an entity leaves visibility; the entity
    /// context has already cleared its buff table at this point.
    pub fn on_entity_disappeared(&mut self, entity_id: i64, offset_ms: u64) -> Vec<HistoryBuff> {
        if !self.segment_active {
            return Vec::new();
        }
        let Some(buffs) = self.open.remove(&entity_id) else {
            return Vec::new();
        };
        buffs
            .into_iter()
            .map(|(base_id, state)| {
                self.tracker.set_off((entity_id, base_id), offset_ms);
                HistoryBuff {
                    entity_id,
                    base_id,
                    edge: HistoryBuffEdge::Removed,
                    layer: state.layer,
                    expires_offset_ms: None,
                }
            })
            .collect()
    }

    /// Applies the authoritative combat-clock advance. The caller may mark
    /// the 50ms-throttled BUFFS topic dirty without scanning row percentages.
    pub fn observe_hit(&mut self, advance: Option<ActiveWindowAdvance>) -> bool {
        if !self.segment_active || self.hud_order.is_empty() {
            return false;
        }
        let Some(advance) = advance else {
            return false;
        };
        self.tracker.apply_advance(advance);
        true
    }

    /// Coverage rows for the local player, in configured order.
    #[must_use]
    pub fn coverage_payload(
        &self,
        entities: &EntityContext,
        active_ms: u64,
    ) -> Vec<BuffCoverageEntry> {
        let Some(local) = entities.local_player() else {
            return Vec::new();
        };
        let entity_id = local.uuid.0;
        self.hud_order
            .iter()
            .map(|base_id| {
                let key = (entity_id, *base_id);
                BuffCoverageEntry {
                    base_id: *base_id,
                    covered_ms: u64::try_from(self.tracker.coverage_ms(key))
                        .unwrap_or(u64::MAX)
                        .min(active_ms),
                    active_ms,
                    active_now: self.tracker.is_on(key),
                    layer: self
                        .open
                        .get(&entity_id)
                        .and_then(|buffs| buffs.get(base_id))
                        .map_or(0, |state| state.layer),
                    count: self.tracker.trigger_count(key),
                }
            })
            .collect()
    }

    /// Reconciles the low-frequency character-presence state against the
    /// authoritative entity table. Used at segment/config/identity/resume
    /// boundaries, never on the accepted-hit hot path.
    pub fn reconcile_from_entities(
        &mut self,
        entities: &EntityContext,
        at: u64,
        expires_offset: &mut impl FnMut(MonoTimeMs) -> u64,
    ) -> Vec<HistoryBuff> {
        if !self.segment_active {
            return Vec::new();
        }
        let local_id = entities.local_player().map(|entity| entity.uuid.0);
        let mut next_open = HashMap::<i64, HashMap<i32, OpenBuff>>::new();
        for state in entities.entities().filter(|state| {
            state.is_present
                && (Some(state.entity.uuid.0) == local_id
                    || state.identity.kind == EntityKind::Character)
        }) {
            let entity_id = state.entity.uuid.0;
            let mut merged: HashMap<i32, OpenBuff> = HashMap::new();
            for buff in state.active_buffs.values() {
                if !self.whitelist.contains(&buff.base_id) {
                    continue;
                }
                let open = merged.entry(buff.base_id).or_default();
                open.instances.insert(buff.instance_id);
                open.layer = open.layer.max(buff.layer);
                let hint = buff.expires_mono_ms.map(&mut *expires_offset);
                // The first instance sets the merged expiry; later ones only
                // extend it (a permanent instance dominates).
                if open.instances.len() == 1 || extends_hint(open.expires_hint_ms, hint) {
                    open.expires_hint_ms = hint;
                }
            }
            for composite in self
                .composites
                .iter()
                .filter(|composite| self.whitelist.contains(&composite.id))
            {
                if let Some(presence) = composite.presence(state.active_buffs.values()) {
                    merged.insert(
                        composite.id,
                        OpenBuff {
                            instances: HashSet::new(),
                            layer: presence.layer,
                            expires_hint_ms: presence.expires_mono_ms().map(&mut *expires_offset),
                        },
                    );
                }
            }
            if !merged.is_empty() {
                next_open.insert(entity_id, merged);
            }
        }

        let previous_open = std::mem::take(&mut self.open);
        let mut sink = EdgeSink {
            tracker: &mut self.tracker,
            edges: Vec::new(),
            at,
            local_id,
        };
        for (entity_id, previous_buffs) in &previous_open {
            for (base_id, previous) in previous_buffs {
                let next = next_open
                    .get(entity_id)
                    .and_then(|buffs| buffs.get(base_id));
                sink.diff(
                    (*entity_id, *base_id),
                    Some(previous),
                    next,
                    HistoryBuffEdge::Baseline,
                );
            }
        }
        for (entity_id, next_buffs) in &next_open {
            for (base_id, next) in next_buffs {
                if previous_open
                    .get(entity_id)
                    .is_some_and(|buffs| buffs.contains_key(base_id))
                {
                    continue;
                }
                sink.diff(
                    (*entity_id, *base_id),
                    None,
                    Some(next),
                    HistoryBuffEdge::Baseline,
                );
            }
        }
        let edges = sink.edges;
        self.open = next_open;
        edges
    }
}

/// Collects the edges of one diff pass and keeps the local player's live
/// coverage in step with them.
struct EdgeSink<'a> {
    tracker: &'a mut BuffCoverageTracker,
    edges: Vec<HistoryBuff>,
    at: u64,
    local_id: Option<i64>,
}

impl EdgeSink<'_> {
    fn diff(
        &mut self,
        key: (i64, i32),
        previous: Option<&OpenBuff>,
        next: Option<&OpenBuff>,
        opened: HistoryBuffEdge,
    ) {
        let (entity_id, base_id) = key;
        let is_local = self.local_id == Some(entity_id);
        match (previous, next) {
            (None, None) => {}
            (None, Some(next)) => {
                if is_local {
                    self.tracker.set_on(key, self.at, next.expires_hint_ms);
                }
                self.edges.push(HistoryBuff {
                    entity_id,
                    base_id,
                    edge: opened,
                    layer: next.layer,
                    expires_offset_ms: next.expires_hint_ms,
                });
            }
            (Some(previous), None) => {
                if is_local {
                    self.tracker.set_off(key, self.at);
                }
                self.edges.push(HistoryBuff {
                    entity_id,
                    base_id,
                    edge: HistoryBuffEdge::Removed,
                    layer: previous.layer,
                    expires_offset_ms: None,
                });
            }
            (Some(previous), Some(next)) => {
                if next.expires_hint_ms != previous.expires_hint_ms {
                    if is_local {
                        self.tracker
                            .refresh_hint(key, self.at, next.expires_hint_ms);
                    }
                    self.edges.push(HistoryBuff {
                        entity_id,
                        base_id,
                        edge: HistoryBuffEdge::Refreshed,
                        layer: next.layer,
                        expires_offset_ms: next.expires_hint_ms,
                    });
                }
                if next.layer != previous.layer {
                    self.edges.push(HistoryBuff {
                        entity_id,
                        base_id,
                        edge: HistoryBuffEdge::LayerChanged,
                        layer: next.layer,
                        expires_offset_ms: None,
                    });
                }
            }
        }
    }
}

/// True when `next` stretches the merged expiry beyond `current`.
/// `None` means permanent and can never be extended.
fn extends_hint(current: Option<u64>, next: Option<u64>) -> bool {
    match (current, next) {
        (None, _) => false,
        (Some(_), None) => true,
        (Some(current), Some(next)) => next > current,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{
        BuffState, BuffWireKind, EntityRef, EntityRoles, EntityUuid, MonoTimeMs,
    };
    use std::sync::Arc;

    const BASE: i32 = 2_201;

    fn buff_event(
        transition: BuffTransition,
        instance_id: i64,
        layer: i32,
        duration_updated: bool,
        roles: EntityRoles,
    ) -> BuffEvent {
        BuffEvent {
            transition,
            wire_kind: BuffWireKind::Add,
            duration_updated,
            previous_layer: None,
            state: BuffState {
                target: EntityRef {
                    uuid: EntityUuid(10),
                    generation: 1,
                },
                instance_id,
                base_id: BASE,
                layer,
                source: None,
                resolved_owner: None,
                source_config_id: None,
                duration_ms: Some(10_000),
                started_wall_ms: None,
                expires_wall_ms: None,
                started_mono_ms: Some(MonoTimeMs(0)),
                expires_mono_ms: Some(MonoTimeMs(10_000)),
                effect_ids: Arc::from([]),
            },
            target_roles: roles,
        }
    }

    fn local_roles() -> EntityRoles {
        EntityRoles {
            is_local_player: true,
            is_team_member: true,
            is_current_target: false,
        }
    }

    fn projection() -> BuffTimelineProjection {
        let mut projection = BuffTimelineProjection::default();
        projection.apply_config(&[BASE], Arc::default(), &EntityContext::new(), None, |_| 0);
        projection.segment_active = true;
        projection
    }

    #[test]
    fn two_instances_merge_into_one_presence() {
        let mut projection = projection();
        let edges = projection.apply_buff(
            &buff_event(BuffTransition::Applied, 1, 1, false, local_roles()),
            true,
            100,
            Some(10_100),
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Applied);
        // Second concurrent instance extends the merged expiry -> Refreshed.
        let edges = projection.apply_buff(
            &buff_event(BuffTransition::Applied, 2, 1, false, local_roles()),
            true,
            500,
            Some(12_000),
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Refreshed);
        // Removing one instance keeps the presence open.
        let edges = projection.apply_buff(
            &buff_event(BuffTransition::Removed, 1, 0, false, local_roles()),
            true,
            900,
            None,
        );
        assert!(edges.is_empty());
        let edges = projection.apply_buff(
            &buff_event(BuffTransition::Removed, 2, 0, false, local_roles()),
            true,
            1_200,
            None,
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Removed);
    }

    #[test]
    fn refresh_records_only_duration_updates() {
        let mut projection = projection();
        projection.apply_buff(
            &buff_event(BuffTransition::Applied, 1, 1, false, local_roles()),
            true,
            0,
            Some(10_000),
        );
        let edges = projection.apply_buff(
            &buff_event(BuffTransition::Refreshed, 1, 1, false, local_roles()),
            true,
            1_000,
            Some(11_000),
        );
        assert!(edges.is_empty());
        let edges = projection.apply_buff(
            &buff_event(BuffTransition::Refreshed, 1, 1, true, local_roles()),
            true,
            2_000,
            Some(12_000),
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Refreshed);
        assert_eq!(edges[0].expires_offset_ms, Some(12_000));
    }

    #[test]
    fn despawn_synthesizes_close_edges() {
        let mut projection = projection();
        projection.apply_buff(
            &buff_event(BuffTransition::Applied, 1, 2, false, local_roles()),
            true,
            0,
            None,
        );
        let edges = projection.on_entity_disappeared(10, 3_000);
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Removed);
        assert_eq!(edges[0].layer, 2);
        assert!(!projection.tracker.is_on((10, BASE)));
    }

    #[test]
    fn whitelist_and_character_identity_drive_history_tracking() {
        let mut projection = projection();
        let mut event = buff_event(BuffTransition::Applied, 1, 1, false, local_roles());
        event.state.base_id = 999;
        assert!(projection.apply_buff(&event, true, 0, None).is_empty());

        let roles = EntityRoles {
            is_local_player: false,
            is_team_member: false,
            is_current_target: true,
        };
        let event = buff_event(BuffTransition::Applied, 1, 1, false, roles);
        assert!(projection.apply_buff(&event, false, 0, None).is_empty());

        let event = buff_event(
            BuffTransition::Applied,
            2,
            1,
            false,
            EntityRoles {
                is_local_player: false,
                is_team_member: false,
                is_current_target: false,
            },
        );
        let edges = projection.apply_buff(&event, true, 0, None);
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Applied);
        assert_eq!(projection.tracker.coverage_ms((10, BASE)), 0);
    }

    #[test]
    fn config_change_closes_dropped_ids_mid_segment() {
        let mut projection = projection();
        projection.apply_buff(
            &buff_event(BuffTransition::Applied, 1, 1, false, local_roles()),
            true,
            0,
            None,
        );
        let edges = projection.apply_config(
            &[],
            Arc::default(),
            &EntityContext::new(),
            Some(2_000),
            |_| 0,
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge, HistoryBuffEdge::Removed);
        assert!(
            projection
                .coverage_payload(&EntityContext::new(), 0)
                .is_empty()
        );
    }

    #[test]
    fn accepted_hits_mark_the_throttled_topic_dirty_without_percent_scan() {
        let mut projection = projection();
        projection.apply_buff(
            &buff_event(BuffTransition::Applied, 1, 1, false, local_roles()),
            true,
            0,
            None,
        );
        assert!(
            projection.observe_hit(Some(crate::live::active_window::active_window_advance(
                None, 1_000,
            )))
        );
        assert!(
            projection.observe_hit(Some(crate::live::active_window::active_window_advance(
                Some(1_000),
                1_001,
            )))
        );
        assert!(!projection.observe_hit(None));
    }

    mod composites {
        use super::*;
        use crate::live::bootstrap_snapshot::BuffCompositeSpec;
        use crate::live::runtime::events::{
            BatchId, DomainEvent, EventMeta, ObservedBuff, ObservedBuffChange, ProtocolBatch,
            ProtocolObservation,
        };

        const COMPOSITE: i32 = -1;
        const OTHER: i32 = 2_202;
        const LOCAL: EntityUuid = EntityUuid(10);

        fn batch(sequence: u64, observations: Vec<ProtocolObservation>) -> ProtocolBatch {
            ProtocolBatch {
                meta: EventMeta {
                    batch_id: BatchId(sequence),
                    capture_sequence: sequence,
                    stream_id: 1,
                    stream_epoch: 1,
                    captured_wall_ms: sequence as i64 * 100,
                    captured_mono_ns: sequence * 100_000_000,
                    source_time_ms: None,
                },
                observations,
            }
        }

        /// The entity table derives expiry from start + duration, so a buff
        /// started at mono 0 expires at `expires_mono_ms`.
        fn observed(instance_id: i64, base_id: i32, expires_mono_ms: u64) -> ObservedBuff {
            ObservedBuff {
                instance_id,
                base_id,
                layer: 1,
                source_uuid: Some(LOCAL),
                source_config_id: None,
                duration_ms: Some(expires_mono_ms),
                started_wall_ms: Some(0),
                expires_wall_ms: None,
                started_mono_ms: Some(MonoTimeMs(0)),
                expires_mono_ms: None,
                effect_ids: Arc::from([]),
            }
        }

        fn local_character() -> EntityContext {
            let mut entities = EntityContext::new();
            entities.apply_batch(batch(
                1,
                vec![
                    ProtocolObservation::EntityAppeared {
                        uuid: LOCAL,
                        kind: EntityKind::Character,
                    },
                    ProtocolObservation::LocalPlayerChanged { uuid: Some(LOCAL) },
                ],
            ));
            entities
        }

        fn composite_projection() -> BuffTimelineProjection {
            projection_for(vec![BASE, OTHER], None)
        }

        fn projection_for(member_ids: Vec<i32>, min_active: Option<u32>) -> BuffTimelineProjection {
            let catalog = BuffCompositeCatalog::from_specs(&[BuffCompositeSpec {
                id: COMPOSITE,
                member_ids,
                min_active,
            }]);
            let mut projection = BuffTimelineProjection::default();
            projection.apply_config(
                &[COMPOSITE],
                Arc::new(catalog),
                &EntityContext::new(),
                None,
                |_| 0,
            );
            projection.segment_active = true;
            projection
        }

        /// Applies `changes` to the local character and feeds every
        /// resulting buff event through the composite path at `at`.
        fn apply(
            projection: &mut BuffTimelineProjection,
            entities: &mut EntityContext,
            sequence: u64,
            at: u64,
            changes: Vec<ObservedBuffChange>,
        ) -> Vec<HistoryBuff> {
            let events = entities.apply_batch(batch(
                sequence,
                changes
                    .into_iter()
                    .map(|change| ProtocolObservation::BuffChanged {
                        target_uuid: LOCAL,
                        change,
                    })
                    .collect(),
            ));
            let mut edges = Vec::new();
            for envelope in &events {
                if let DomainEvent::BuffChanged(event) = &envelope.event {
                    edges.extend(
                        projection.apply_composites(event, true, entities, at, |mono| mono.0),
                    );
                }
            }
            edges
        }

        fn applied(buff: ObservedBuff) -> ObservedBuffChange {
            ObservedBuffChange::Applied { buff }
        }

        #[test]
        fn opens_with_the_last_member_and_closes_with_the_first_to_leave() {
            let mut projection = composite_projection();
            let mut entities = local_character();

            let edges = apply(
                &mut projection,
                &mut entities,
                2,
                100,
                vec![applied(observed(1, BASE, 9_000))],
            );
            assert!(edges.is_empty());

            let edges = apply(
                &mut projection,
                &mut entities,
                3,
                200,
                vec![applied(observed(2, OTHER, 5_000))],
            );
            assert_eq!(edges.len(), 1);
            assert_eq!(edges[0].base_id, COMPOSITE);
            assert_eq!(edges[0].edge, HistoryBuffEdge::Applied);
            assert_eq!(edges[0].expires_offset_ms, Some(5_000));
            assert!(projection.tracker.is_on((LOCAL.0, COMPOSITE)));

            let edges = apply(
                &mut projection,
                &mut entities,
                4,
                300,
                vec![ObservedBuffChange::Remove { instance_id: 1 }],
            );
            assert_eq!(edges.len(), 1);
            assert_eq!(edges[0].edge, HistoryBuffEdge::Removed);
            assert!(!projection.tracker.is_on((LOCAL.0, COMPOSITE)));
        }

        #[test]
        fn expiry_follows_the_member_expiring_first() {
            let mut projection = composite_projection();
            let mut entities = local_character();
            apply(
                &mut projection,
                &mut entities,
                2,
                100,
                vec![
                    applied(observed(1, BASE, 9_000)),
                    applied(observed(2, OTHER, 5_000)),
                ],
            );

            // Refreshing the limiting member moves the composite expiry.
            let edges = apply(
                &mut projection,
                &mut entities,
                3,
                200,
                vec![applied(observed(3, OTHER, 7_000))],
            );
            assert_eq!(edges.len(), 1);
            assert_eq!(edges[0].edge, HistoryBuffEdge::Refreshed);
            assert_eq!(edges[0].expires_offset_ms, Some(7_000));

            // A later non-limiting refresh changes nothing.
            let edges = apply(
                &mut projection,
                &mut entities,
                4,
                300,
                vec![applied(observed(4, BASE, 12_000))],
            );
            assert!(edges.is_empty());
        }

        #[test]
        fn ignores_unwhitelisted_composites_and_unrelated_buffs() {
            let mut projection = composite_projection();
            projection.whitelist.clear();
            let mut entities = local_character();
            let edges = apply(
                &mut projection,
                &mut entities,
                2,
                100,
                vec![
                    applied(observed(1, BASE, 9_000)),
                    applied(observed(2, OTHER, 5_000)),
                ],
            );
            assert!(edges.is_empty());

            let mut projection = composite_projection();
            let edges = apply(
                &mut projection,
                &mut entities,
                3,
                200,
                vec![applied(observed(3, 9_999, 5_000))],
            );
            assert!(edges.is_empty());
        }

        #[test]
        fn threshold_composite_tracks_member_count_without_reopening() {
            const THIRD: i32 = 2_203;
            let mut projection = projection_for(vec![BASE, OTHER, THIRD], Some(2));
            let mut entities = local_character();
            let edge_kinds = |edges: &[HistoryBuff]| {
                edges
                    .iter()
                    .map(|edge| (edge.edge, edge.layer, edge.expires_offset_ms))
                    .collect::<Vec<_>>()
            };

            let edges = apply(
                &mut projection,
                &mut entities,
                2,
                100,
                vec![applied(observed(1, BASE, 9_000))],
            );
            assert!(edges.is_empty());

            // Two of three: open, lasting until the earlier of the two ends.
            let edges = apply(
                &mut projection,
                &mut entities,
                3,
                200,
                vec![applied(observed(2, OTHER, 5_000))],
            );
            assert_eq!(
                edge_kinds(&edges),
                vec![(HistoryBuffEdge::Applied, 2, Some(5_000))]
            );
            assert!(projection.tracker.is_on((LOCAL.0, COMPOSITE)));

            // A third member extends the expiry and raises the count.
            let edges = apply(
                &mut projection,
                &mut entities,
                4,
                300,
                vec![applied(observed(3, THIRD, 7_000))],
            );
            assert_eq!(
                edge_kinds(&edges),
                vec![
                    (HistoryBuffEdge::Refreshed, 3, Some(7_000)),
                    (HistoryBuffEdge::LayerChanged, 3, None),
                ]
            );

            // Dropping back to two keeps the composite open.
            let edges = apply(
                &mut projection,
                &mut entities,
                5,
                400,
                vec![ObservedBuffChange::Remove { instance_id: 1 }],
            );
            assert_eq!(
                edge_kinds(&edges),
                vec![
                    (HistoryBuffEdge::Refreshed, 2, Some(5_000)),
                    (HistoryBuffEdge::LayerChanged, 2, None),
                ]
            );

            let edges = apply(
                &mut projection,
                &mut entities,
                6,
                500,
                vec![ObservedBuffChange::Remove { instance_id: 2 }],
            );
            assert_eq!(
                edge_kinds(&edges),
                vec![(HistoryBuffEdge::Removed, 2, None)]
            );
            assert!(!projection.tracker.is_on((LOCAL.0, COMPOSITE)));
        }

        #[test]
        fn reconcile_and_despawn_open_and_close_the_composite() {
            let mut projection = composite_projection();
            let mut entities = local_character();
            entities.apply_batch(batch(
                2,
                vec![
                    ProtocolObservation::BuffChanged {
                        target_uuid: LOCAL,
                        change: applied(observed(1, BASE, 9_000)),
                    },
                    ProtocolObservation::BuffChanged {
                        target_uuid: LOCAL,
                        change: applied(observed(2, OTHER, 5_000)),
                    },
                ],
            ));

            let edges = projection.start_segment(&entities, |mono| mono.0);
            assert_eq!(edges.len(), 1);
            assert_eq!(edges[0].base_id, COMPOSITE);
            assert_eq!(edges[0].edge, HistoryBuffEdge::Baseline);
            let rows = projection.coverage_payload(&entities, 1_000);
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].base_id, COMPOSITE);
            assert!(rows[0].active_now);

            let edges = projection.on_entity_disappeared(LOCAL.0, 400);
            assert_eq!(edges.len(), 1);
            assert_eq!(edges[0].edge, HistoryBuffEdge::Removed);
        }
    }
}
