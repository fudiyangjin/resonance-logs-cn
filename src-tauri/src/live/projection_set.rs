//! Concrete, statically routed live projections.

use crate::database::commands::{EncounterSummaryDto, PlayerSummaryDto};
use crate::database::event_journal::{FinalizeEncounterMetadata, RecordingEncounter};
use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::live::counter::engine::{CounterEngine, CounterNamespace};
use crate::live::history_writer::HistoryWriterHandle;
use crate::live::ipc::models::{
    LiveBuffsPayload, LiveCombatPayload, LiveDataPayload, LiveDeathsPayload, LiveFantasyPayload,
    LiveMonsterPayload, LiveScenePayload, LiveStatusPayload, MinimapUpdatePayload,
};
use crate::live::ipc::topic::{Topic, TopicMask};
use crate::live::projections::buff_timeline::BuffTimelineProjection;
use crate::live::projections::combat::accumulator::CombatHitFact;
use crate::live::projections::combat::projection::CombatProjection;
use crate::live::projections::death::DeathProjection;
use crate::live::projections::entity_monitor::EntityMonitorProjection;
use crate::live::projections::history::HistoryProjection;
use crate::live::projections::minimap::MinimapProjection;
use crate::live::projections::presentation::{ActiveCombat, PresentationProjection};
use crate::live::projections::timeline::TimelineProjection;
use crate::live::projections::voice::VoiceProjection;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    AttributeValue, DomainEnvelope, DomainEvent, EntityKind, MonoTimeMs, SegmentReason,
};
use crate::live::runtime::scheduler::{DeadlineScheduler, DueTimer};
use crate::live::runtime::segment::SegmentState;
use crate::voice::models::VoiceCueIntent;

/// Topics served by [`EntityMonitorProjection::snapshot`].
const MONITORED_TOPICS: TopicMask = TopicMask::STATUS
    .union(TopicMask::BUFFS)
    .union(TopicMask::MONSTER)
    .union(TopicMask::FANTASY);
/// Everything except the minimap, which keeps its own incremental payload.
const SEGMENT_TOPICS: TopicMask = MONITORED_TOPICS
    .union(TopicMask::COMBAT)
    .union(TopicMask::DEATHS);
/// The scene is persistent `EntityContext` state, not segment-scoped, so it
/// sits outside `SEGMENT_TOPICS` next to the minimap.
const ALL_TOPICS: TopicMask = SEGMENT_TOPICS
    .union(TopicMask::MINIMAP)
    .union(TopicMask::SCENE);

/// One replace-only payload for a single dirty topic.
#[derive(Debug)]
pub enum TopicPublication {
    Combat(LiveCombatPayload),
    Status(LiveStatusPayload),
    Buffs(LiveBuffsPayload),
    Monster(LiveMonsterPayload),
    Fantasy(LiveFantasyPayload),
    Minimap(MinimapUpdatePayload),
    Deaths(LiveDeathsPayload),
    Scene(LiveScenePayload),
}

impl TopicPublication {
    #[must_use]
    pub const fn topic(&self) -> Topic {
        match self {
            Self::Combat(_) => Topic::Combat,
            Self::Status(_) => Topic::Status,
            Self::Buffs(_) => Topic::Buffs,
            Self::Monster(_) => Topic::Monster,
            Self::Fantasy(_) => Topic::Fantasy,
            Self::Minimap(_) => Topic::Minimap,
            Self::Deaths(_) => Topic::Deaths,
            Self::Scene(_) => Topic::Scene,
        }
    }
}

#[derive(Debug)]
pub struct ProjectionSet {
    buff_timeline: BuffTimelineProjection,
    combat: CombatProjection,
    counter: CounterEngine,
    entity_monitor: EntityMonitorProjection,
    death: DeathProjection,
    minimap: MinimapProjection,
    timeline: TimelineProjection,
    voice: VoiceProjection,
    history: HistoryProjection,
    presentation: PresentationProjection,
    counter_side_effect_dirty: bool,
    dirty: TopicMask,
}

impl ProjectionSet {
    pub fn new(history_writer: HistoryWriterHandle) -> Self {
        Self {
            buff_timeline: BuffTimelineProjection::default(),
            combat: CombatProjection::default(),
            counter: CounterEngine::new(),
            entity_monitor: EntityMonitorProjection::default(),
            death: DeathProjection::default(),
            minimap: MinimapProjection::default(),
            timeline: TimelineProjection::default(),
            voice: VoiceProjection::default(),
            history: HistoryProjection::new(history_writer),
            presentation: PresentationProjection::default(),
            counter_side_effect_dirty: false,
            dirty: ALL_TOPICS,
        }
    }

    pub fn apply_config(
        &mut self,
        config: std::sync::Arc<MonitorRuntimeSnapshot>,
        entities: &EntityContext,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> Result<(), String> {
        self.counter
            .apply_config(
                CounterNamespace::Normal,
                config.skill.buff_counter_rules.clone(),
                scheduler,
            )
            .map_err(|error| error.to_string())?;
        self.counter
            .apply_factor_templates(
                config.skill.season_cultivate_factor_templates.clone(),
                scheduler,
            )
            .map_err(|error| error.to_string())?;
        self.entity_monitor.apply_config(config.as_ref(), entities);
        self.voice
            .apply_config(&config, entities, now_mono, scheduler);
        {
            let combat = &self.combat;
            let current_offset = combat
                .segment_id()
                .map(|_| combat.segment_offset_ms(now_mono));
            let edges = self.buff_timeline.apply_config(
                &config.skill.buff_timeline_ids,
                entities,
                current_offset,
                |mono| combat.segment_offset_ms(mono),
            );
            if let Some(offset) = current_offset {
                for edge in edges {
                    self.history.persist_buff(edge, entities, offset)?;
                }
            }
        }
        self.counter_side_effect_dirty = true;
        self.dirty |= SEGMENT_TOPICS;
        Ok(())
    }

    pub fn begin_batch(&mut self, batch_id: crate::live::runtime::events::BatchId) {
        let changed = self.counter.begin_batch(batch_id);
        self.mark_counter_change(changed);
    }

    pub fn apply(
        &mut self,
        envelope: &DomainEnvelope,
        entities: &EntityContext,
        scheduler: &mut DeadlineScheduler,
    ) -> Result<(), String> {
        match &envelope.event {
            DomainEvent::SegmentStarted {
                segment_id,
                started_at_mono_ms,
                started_at_wall_ms,
                ..
            } => {
                self.start_segment(
                    *segment_id,
                    *started_at_mono_ms,
                    *started_at_wall_ms,
                    entities,
                )?;
                return Ok(());
            }
            DomainEvent::SegmentEnded {
                segment_id,
                reason,
                ended_at_wall_ms,
                ended_at_mono_ms,
            } => {
                self.end_segment(
                    *segment_id,
                    *reason,
                    *ended_at_wall_ms,
                    *ended_at_mono_ms,
                    entities,
                )?;
                return Ok(());
            }
            _ => {}
        }

        let counter_changed = self
            .counter
            .apply_event(envelope, scheduler)
            .map_err(|error| error.to_string())?;
        self.mark_counter_change(counter_changed);

        // Each projection reports the topics its own state actually changed;
        // their OR replaces the old static routing table. Combat/minimap
        // observers return `bool`, so their bits are accumulated separately
        // and ORed in at the end (avoids overlapping mutable borrows).
        let mut reported = TopicMask::EMPTY;
        let mut combat_changed = false;
        let mut minimap_changed = false;

        match &envelope.event {
            DomainEvent::ContainerReset => {
                self.reset_runtime(scheduler);
                return Ok(());
            }
            DomainEvent::EntityAppeared { .. } => {
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
                minimap_changed |= self.minimap.apply(envelope);
            }
            DomainEvent::EntityDisappeared { entity } => {
                combat_changed |= self.combat.remove_entity(*entity);
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.death.apply(envelope);
                self.voice.apply(envelope, entities, scheduler);
                minimap_changed |= self.minimap.apply(envelope);
                let offset = self.combat.segment_offset_ms(envelope.meta.mono_ms());
                let edges = self
                    .buff_timeline
                    .on_entity_disappeared(entity.uuid.0, offset);
                if !edges.is_empty() {
                    reported |= TopicMask::BUFFS;
                    for edge in edges {
                        self.history.persist_buff(edge, entities, offset)?;
                    }
                }
            }
            DomainEvent::IdentityChanged {
                entity,
                previous,
                current,
            } => {
                combat_changed |= self.combat.observe_identity(*entity, current, entities);
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
                minimap_changed |= self.minimap.apply(envelope);
                self.history.apply(
                    envelope,
                    entities,
                    self.combat.segment_offset_ms(envelope.meta.mono_ms()),
                    None,
                )?;
                if previous.kind != current.kind {
                    let offset = self.combat.segment_offset_ms(envelope.meta.mono_ms());
                    let combat = &self.combat;
                    let edges =
                        self.buff_timeline
                            .reconcile_from_entities(entities, offset, &mut |mono| {
                                combat.segment_offset_ms(mono)
                            });
                    if !edges.is_empty() {
                        reported |= TopicMask::BUFFS;
                        for edge in edges {
                            self.history.persist_buff(edge, entities, offset)?;
                        }
                    }
                }
            }
            DomainEvent::AttributeChanged {
                entity,
                attr_id,
                current,
                ..
            } => {
                if let AttributeValue::Int(value) = current {
                    combat_changed |= self.combat.observe_attribute(*entity, *attr_id, *value);
                }
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.history.apply(
                    envelope,
                    entities,
                    self.combat.segment_offset_ms(envelope.meta.mono_ms()),
                    None,
                )?;
                minimap_changed |= self.minimap.apply(envelope);
            }
            DomainEvent::PositionChanged { .. }
            | DomainEvent::TeamMembershipChanged { .. }
            | DomainEvent::TeamChanged { .. }
            | DomainEvent::LocalPlayerChanged { .. }
            | DomainEvent::BuffChanged(_)
            | DomainEvent::SkillLifecycleChanged { .. }
            | DomainEvent::PassiveSkillObserved { .. } => {
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                minimap_changed |= self.minimap.apply(envelope);
                if matches!(
                    envelope.event,
                    DomainEvent::BuffChanged(_)
                        | DomainEvent::LocalPlayerChanged { .. }
                        | DomainEvent::SkillLifecycleChanged { .. }
                ) {
                    self.voice.apply(envelope, entities, scheduler);
                }
                if let DomainEvent::BuffChanged(event) = &envelope.event {
                    let offset = self.combat.segment_offset_ms(envelope.meta.mono_ms());
                    let target_is_character = entities
                        .entity(event.state.target.uuid)
                        .is_some_and(|state| state.identity.kind == EntityKind::Character);
                    let expires_offset = event
                        .state
                        .expires_mono_ms
                        .map(|mono| self.combat.segment_offset_ms(mono));
                    let edges = self.buff_timeline.apply_buff(
                        event,
                        target_is_character,
                        offset,
                        expires_offset,
                    );
                    if !edges.is_empty() {
                        reported |= TopicMask::BUFFS;
                        for edge in edges {
                            self.history.apply_buff(envelope, edge, entities, offset)?;
                        }
                    }
                }
                if let DomainEvent::LocalPlayerChanged { current, .. } = &envelope.event {
                    combat_changed |= self.combat.set_local_player(*current);
                    let offset = self.combat.segment_offset_ms(envelope.meta.mono_ms());
                    self.buff_timeline.rebind_local_player(entities, offset);
                    reported |= TopicMask::BUFFS;
                }
            }
            DomainEvent::HateListUpdated { .. }
            | DomainEvent::SkillCooldownUpdated { .. }
            | DomainEvent::ShieldDetailsUpdated { .. }
            | DomainEvent::TempAttributeChanged { .. }
            | DomainEvent::FightResourceLayoutChanged { .. }
            | DomainEvent::FightResourceChanged { .. }
            | DomainEvent::FantasyChanged { .. }
            | DomainEvent::GameTimerSnapshot { .. }
            | DomainEvent::GameTimerChanged(_) => {
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                if matches!(envelope.event, DomainEvent::FantasyChanged { .. }) {
                    minimap_changed |= self.minimap.apply(envelope);
                }
            }
            DomainEvent::BossMechanicStarted(_) => {
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
            }
            DomainEvent::MatchmakingPopped
            | DomainEvent::ReadyCheckStarted
            | DomainEvent::TeamVoteStarted => {
                self.voice.apply(envelope, entities, scheduler);
            }
            DomainEvent::DeathOccurred { victim, .. } => {
                combat_changed |= self.combat.observe_death(*victim);
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
                let replay = self.death.apply(envelope);
                if replay.is_some() {
                    reported |= TopicMask::DEATHS;
                }
                minimap_changed |= self.minimap.apply(envelope);
                self.history.apply(
                    envelope,
                    entities,
                    self.combat.segment_offset_ms(envelope.meta.mono_ms()),
                    replay.as_ref(),
                )?;
            }
            DomainEvent::Revived { .. } => {
                minimap_changed |= self.minimap.apply(envelope);
            }
            DomainEvent::CombatHitAccepted(hit) => {
                let fact = CombatHitFact::from_domain(hit);
                let outcome = self.combat.apply_hit(
                    hit,
                    fact.as_ref(),
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                    entities,
                );
                combat_changed |= outcome.had_combat;
                self.death.apply_hit(envelope, hit, fact.as_ref());
                let offset = self.combat.segment_offset_ms(envelope.meta.mono_ms());
                self.history
                    .apply_hit(envelope, fact.as_ref(), entities, offset)?;
                if self.buff_timeline.observe_hit(outcome.active_window) {
                    reported |= TopicMask::BUFFS;
                }
            }
            DomainEvent::SceneChanged {
                scene_id,
                difficulty,
                ..
            } => {
                combat_changed |= self.combat.set_scene(*scene_id, *difficulty);
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
                minimap_changed |= self.minimap.apply(envelope);
                reported |= TopicMask::SCENE;
            }
            DomainEvent::LocalTalentChanged { .. } => {
                reported |= TopicMask::SCENE;
            }
            DomainEvent::PauseChanged { is_paused } => {
                combat_changed |= self.combat.set_paused(
                    *is_paused,
                    envelope.meta.mono_ms(),
                    envelope.occurred_at_ms,
                );
                if !*is_paused {
                    let offset = self.combat.segment_offset_ms(envelope.meta.mono_ms());
                    let combat = &self.combat;
                    let edges =
                        self.buff_timeline
                            .reconcile_from_entities(entities, offset, &mut |mono| {
                                combat.segment_offset_ms(mono)
                            });
                    if !edges.is_empty() {
                        reported |= TopicMask::BUFFS;
                        for edge in edges {
                            self.history.persist_buff(edge, entities, offset)?;
                        }
                    }
                }
            }
            DomainEvent::DeadlineReached { .. } => {
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
            }
            DomainEvent::AttackTargetChanged { .. } => {
                reported |= self.entity_monitor.apply(envelope, entities, scheduler);
                self.voice.apply(envelope, entities, scheduler);
            }
            DomainEvent::HitResolved(_)
            | DomainEvent::WipeDetected { .. }
            | DomainEvent::DungeonFlowChanged { .. }
            | DomainEvent::DungeonObjectiveChanged { .. }
            | DomainEvent::DungeonProgressStateChanged { .. }
            | DomainEvent::SeasonCultivateChanged { .. } => {}
            DomainEvent::SegmentStarted { .. } | DomainEvent::SegmentEnded { .. } => {
                unreachable!("segment events returned above")
            }
        }

        if combat_changed {
            reported |= TopicMask::COMBAT;
        }
        if minimap_changed {
            reported |= TopicMask::MINIMAP;
        }
        self.dirty |= reported;
        Ok(())
    }

    pub fn apply_marker(
        &mut self,
        envelope: &DomainEnvelope,
        entities: &EntityContext,
    ) -> Result<(), String> {
        let Some(marker) = self.timeline.classify(envelope, entities) else {
            return Ok(());
        };
        self.history.apply_marker(
            envelope,
            marker,
            entities,
            self.combat.segment_offset_ms(envelope.meta.mono_ms()),
        )?;
        self.dirty |= TopicMask::COMBAT;
        Ok(())
    }

    pub fn on_due(
        &mut self,
        due: DueTimer,
        fired_at: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let changed = self.counter.on_due(due, fired_at, scheduler);
        self.mark_counter_change(changed);
    }

    pub fn end_batch(
        &mut self,
        now_wall_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let changed = self.counter.end_batch();
        self.mark_counter_change(changed);
        self.flush_counter_side_effects(now_wall_ms, now_mono, scheduler);
    }

    /// Removes the voice cues matched since the last drain, for the caller to
    /// hand to `VoiceService`. Keeping playback out of the projections is what
    /// lets every projection stay a pure function of the domain events.
    pub fn take_voice_cues(&mut self) -> Vec<VoiceCueIntent> {
        self.voice.take_cues()
    }

    pub fn clear_display(&mut self) {
        self.presentation.clear_display();
        self.entity_monitor.clear_segment_display();
        self.buff_timeline.clear();
        self.combat.clear_segment();
        self.death.start_segment();
        self.counter_side_effect_dirty = false;
        self.dirty |= SEGMENT_TOPICS;
    }

    /// Marks topics dirty without changing projection state. Used when
    /// segment policy changes (e.g. arming training) so the next combat
    /// publication can carry the new phase.
    pub fn mark_dirty(&mut self, mask: TopicMask) {
        self.dirty |= mask;
    }

    fn reset_runtime(&mut self, scheduler: &mut DeadlineScheduler) {
        self.presentation.hold_runtime_display(
            self.death.snapshot(),
            self.entity_monitor.displayed_fantasies(),
        );
        self.buff_timeline.clear();
        self.combat.clear_segment();
        self.combat.set_local_player(None);
        self.entity_monitor.reset_runtime(scheduler);
        self.death.start_segment();
        self.minimap.reset_runtime();
        self.timeline.reset_runtime();
        self.voice.reset_runtime(scheduler);
        self.counter_side_effect_dirty = true;
        self.dirty = ALL_TOPICS;
    }

    /// The live combat payload for the segment currently being recorded, if
    /// any. `CombatProjection::segment_id()` is the single source of truth
    /// for "is a segment active" — presentation derives everything else from
    /// it instead of mirroring the id itself.
    fn active_combat(&self) -> Option<ActiveCombat> {
        self.combat.segment_id().map(|segment_id| ActiveCombat {
            segment_id,
            payload: self.combat.payload(),
            clock: self.combat.display_clock(),
        })
    }

    #[must_use]
    #[cfg(test)]
    pub fn peek_combat(&self, segment_state: &SegmentState) -> LiveCombatPayload {
        self.presentation
            .peek_combat_payload(self.active_combat(), segment_state)
    }

    #[must_use]
    #[cfg(test)]
    pub fn peek_deaths(&self) -> LiveDeathsPayload {
        self.presentation
            .peek_deaths_payload(self.combat.segment_id().is_some(), self.death.snapshot())
    }

    #[must_use]
    #[cfg(test)]
    pub fn peek_fantasy(&self) -> LiveFantasyPayload {
        let monitored = crate::live::projections::entity_monitor::EntityMonitorSnapshot {
            teammate_fantasies: self.entity_monitor.displayed_fantasies(),
            ..crate::live::projections::entity_monitor::EntityMonitorSnapshot::default()
        };
        self.presentation
            .peek_fantasy_payload(self.combat.segment_id().is_some(), &monitored)
    }

    /// Builds one payload per topic that is both requested and dirty, clearing
    /// only the taken bits so topics on a slower cadence stay pending.
    pub fn take_publications(
        &mut self,
        entities: &EntityContext,
        segment_state: &SegmentState,
        topics: TopicMask,
    ) -> Vec<TopicPublication> {
        let due = self.dirty.intersection(topics);
        if due.is_empty() {
            return Vec::new();
        }
        // Only pay for the monitor snapshot when a topic sourced from it is due.
        let monitor_snapshot = due
            .intersects(MONITORED_TOPICS)
            .then(|| self.entity_monitor.snapshot(entities));
        let monitored = || {
            monitor_snapshot
                .as_ref()
                .expect("monitored topics prepared an entity monitor snapshot")
        };

        let mut publications = Vec::new();
        for topic in due.iter() {
            publications.push(match topic {
                Topic::Combat => {
                    let active_combat = self.active_combat();
                    TopicPublication::Combat(
                        self.presentation
                            .take_combat_payload(active_combat, segment_state),
                    )
                }
                Topic::Status => TopicPublication::Status(
                    self.presentation
                        .take_status_payload(monitored(), self.counter.snapshot()),
                ),
                Topic::Buffs => TopicPublication::Buffs(
                    self.presentation.take_buffs_payload(
                        monitored(),
                        self.buff_timeline
                            .coverage_payload(entities, coverage_active_ms(&self.combat)),
                        self.combat.segment_id().is_some(),
                    ),
                ),
                Topic::Monster => {
                    TopicPublication::Monster(self.presentation.take_monster_payload(monitored()))
                }
                Topic::Fantasy => TopicPublication::Fantasy(
                    self.presentation
                        .take_fantasy_payload(self.combat.segment_id().is_some(), monitored()),
                ),
                Topic::Minimap => TopicPublication::Minimap(self.minimap.take_payload()),
                Topic::Deaths => TopicPublication::Deaths(self.presentation.take_deaths_payload(
                    self.combat.segment_id().is_some(),
                    self.death.snapshot(),
                )),
                Topic::Scene => TopicPublication::Scene(self.presentation.take_scene_payload(
                    entities.current_scene_id(),
                    entities.current_difficulty(),
                    entities.local_talent(),
                )),
            });
        }

        self.dirty.remove(due);
        publications
    }

    /// True when any topic in `mask` is pending publication.
    #[cfg(test)]
    pub const fn is_dirty(&self, mask: TopicMask) -> bool {
        self.dirty.intersects(mask)
    }

    #[must_use]
    pub const fn dirty_mask(&self) -> TopicMask {
        self.dirty
    }

    fn start_segment(
        &mut self,
        segment_id: crate::live::runtime::events::SegmentId,
        started_at_mono_ms: MonoTimeMs,
        started_at_wall_ms: i64,
        entities: &EntityContext,
    ) -> Result<(), String> {
        self.combat
            .start_segment(segment_id, started_at_mono_ms, started_at_wall_ms);
        self.combat.set_local_player(entities.local_player());
        if let Some(scene_id) = entities.current_scene_id() {
            self.combat
                .set_scene(scene_id, entities.current_difficulty());
        }
        self.entity_monitor.start_segment(started_at_wall_ms);
        self.death.start_segment();
        self.history.start_segment(
            segment_id,
            RecordingEncounter {
                started_at_ms: started_at_wall_ms,
                local_player_id: entities.local_player().map(|entity| entity.uuid.0),
                scene_id: entities.current_scene_id(),
                dungeon_difficulty: entities.current_difficulty(),
            },
        )?;
        self.presentation.segment_started(segment_id);
        {
            let combat = &self.combat;
            let edges = self
                .buff_timeline
                .start_segment(entities, |mono| combat.segment_offset_ms(mono));
            for edge in edges {
                self.history.persist_buff(edge, entities, 0)?;
            }
        }
        self.counter_side_effect_dirty = true;
        self.dirty |= SEGMENT_TOPICS;
        Ok(())
    }

    fn end_segment(
        &mut self,
        segment_id: crate::live::runtime::events::SegmentId,
        reason: SegmentReason,
        ended_at_wall_ms: i64,
        ended_at_mono_ms: MonoTimeMs,
        entities: &EntityContext,
    ) -> Result<(), String> {
        let damage_ms = self.combat.damage_elapsed_ms();
        let scheduled_window_ms = u128::from(
            ended_at_mono_ms
                .0
                .saturating_sub(self.combat.started_at_mono_ms().0),
        );
        let duration_ms = finalized_duration_ms(reason, damage_ms, scheduled_window_ms);
        if reason == SegmentReason::Manual {
            self.presentation.clear_display();
        } else {
            let mut clock = self.combat.display_clock();
            clock.freeze(ended_at_wall_ms);
            self.presentation.freeze_segment(
                segment_id,
                payload_for_end(self.combat.payload(), reason, duration_ms),
                clock,
            );
            self.presentation.freeze_coverage(
                segment_id,
                self.buff_timeline
                    .coverage_payload(entities, coverage_active_ms(&self.combat)),
            );
        }

        self.buff_timeline.clear();
        let active_ms = self.combat.active_combat_time_ms().min(duration_ms);
        let total_damage_exact = self.combat.total_damage();
        let total_healing_exact = self.combat.total_healing();
        let total_damage = clamp_u128_to_i64(total_damage_exact);
        let total_healing = clamp_u128_to_i64(total_healing_exact);
        let boss_ids = self.combat.boss_monster_ids();
        let player_names = self.combat.player_names();
        let players = player_names
            .iter()
            .map(|player| PlayerSummaryDto {
                name: player.name.clone(),
                class_id: player.class_id,
            })
            .collect();
        let metadata = FinalizeEncounterMetadata {
            ended_at_ms: ended_at_wall_ms,
            local_player_id: self.combat.local_player_id(),
            total_damage,
            total_healing,
            scene_id: self.combat.scene_id(),
            dungeon_difficulty: self.combat.dungeon_difficulty(),
            duration_seconds: duration_ms as f64 / 1_000.0,
            active_combat_duration_seconds: Some(active_ms as f64 / 1_000.0),
            is_manually_reset: reason == SegmentReason::Manual,
            boss_monster_ids_json: serde_json::to_string(&boss_ids)
                .map_err(|error| error.to_string())?,
            player_names_json: serde_json::to_string(&player_names)
                .map_err(|error| error.to_string())?,
            quality_flags: 0,
        };
        self.history.finalize(
            segment_id,
            self.combat.accumulator(),
            metadata,
            EncounterSummaryDto {
                id: 0,
                started_at_ms: self.combat.started_at_wall_ms(),
                ended_at_ms: Some(ended_at_wall_ms),
                total_dmg: total_damage_exact.to_string(),
                total_heal: total_healing_exact.to_string(),
                scene_id: self.combat.scene_id(),
                dungeon_difficulty: self.combat.dungeon_difficulty(),
                duration: duration_ms as f64 / 1_000.0,
                active_combat_duration: Some(active_ms as f64 / 1_000.0),
                local_player_id: self.combat.local_player_id(),
                bosses: self.combat.boss_summaries(),
                players,
                remote_encounter_id: None,
                is_favorite: false,
                detail_available: true,
                display_index: 0,
            },
        )?;

        self.combat.clear_segment();
        self.counter_side_effect_dirty = false;
        self.dirty |= TopicMask::COMBAT | TopicMask::STATUS | TopicMask::BUFFS;
        Ok(())
    }

    fn mark_counter_change(&mut self, changed: bool) {
        if !changed {
            return;
        }
        self.counter_side_effect_dirty = true;
        self.dirty |= TopicMask::STATUS;
    }

    fn flush_counter_side_effects(
        &mut self,
        now_wall_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        if !self.counter_side_effect_dirty {
            return;
        }
        self.voice
            .apply_counters(&self.counter, now_wall_ms, now_mono, scheduler);
        self.counter_side_effect_dirty = false;
        self.dirty |= TopicMask::STATUS;
    }
}

fn clamp_u128_to_i64(value: u128) -> i64 {
    value.min(i64::MAX as u128) as i64
}

fn coverage_active_ms(combat: &CombatProjection) -> u64 {
    u64::try_from(
        combat
            .active_combat_time_ms()
            .min(combat.observed_duration_ms()),
    )
    .unwrap_or(u64::MAX)
}

fn finalized_duration_ms(
    reason: SegmentReason,
    damage_ms: u128,
    scheduled_window_ms: u128,
) -> u128 {
    match reason {
        SegmentReason::TrainingElapsed => scheduled_window_ms,
        _ => damage_ms,
    }
}

fn payload_for_end(
    mut payload: LiveDataPayload,
    reason: SegmentReason,
    duration_ms: u128,
) -> LiveDataPayload {
    if reason == SegmentReason::TrainingElapsed {
        payload.elapsed_ms = duration_ms.to_string();
        payload.damage_elapsed_ms = duration_ms.to_string();
    }
    payload
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::ipc::models::{BuffCoverageEntry, LiveDisplayClock, TrainingDummyPhase};
    use crate::live::runtime::events::{
        BatchId, DomainHit, EntityRef, EntityUuid, EventMeta, HitChannel, HitKind, SegmentId,
    };
    use crate::live::runtime::segment::{IdleMode, TRAINING_WINDOW_MS};

    #[test]
    fn command_peek_does_not_consume_pending_publication() {
        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let state = SegmentState::Idle {
            mode: IdleMode::Standard,
        };

        let command_peek = projections.peek_combat(&state);
        assert!(projections.is_dirty(TopicMask::COMBAT));

        let publications = projections.take_publications(&entities, &state, TopicMask::COMBAT);
        let [TopicPublication::Combat(publication)] = publications.as_slice() else {
            panic!("pending combat publication remains available");
        };
        assert!(publication.revision > command_peek.revision);
        assert!(!projections.is_dirty(TopicMask::COMBAT));
        assert!(
            projections
                .take_publications(&entities, &state, TopicMask::COMBAT)
                .is_empty()
        );

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    #[test]
    fn arming_training_publishes_armed_only_after_combat_is_dirtied() {
        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let idle = SegmentState::Idle {
            mode: IdleMode::Standard,
        };
        let armed = SegmentState::Idle {
            mode: IdleMode::TrainingArmed,
        };

        let _ = projections.take_publications(&entities, &idle, ALL_TOPICS);
        assert!(projections.dirty_mask().is_empty());
        assert!(
            projections
                .take_publications(&entities, &armed, TopicMask::COMBAT)
                .is_empty()
        );

        projections.mark_dirty(TopicMask::COMBAT);
        let publications = projections.take_publications(&entities, &armed, TopicMask::COMBAT);
        let [TopicPublication::Combat(publication)] = publications.as_slice() else {
            panic!("dirtied combat should publish");
        };
        assert_eq!(publication.training.phase, TrainingDummyPhase::Armed);

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    #[test]
    fn training_elapsed_uses_the_window_not_the_last_hit() {
        assert_eq!(
            finalized_duration_ms(
                SegmentReason::TrainingElapsed,
                182_500,
                u128::from(TRAINING_WINDOW_MS)
            ),
            u128::from(TRAINING_WINDOW_MS)
        );
        assert_eq!(
            finalized_duration_ms(SegmentReason::TrainingElapsed, 59_000, 60_000),
            60_000
        );
        assert_eq!(
            finalized_duration_ms(
                SegmentReason::Manual,
                60_000,
                u128::from(TRAINING_WINDOW_MS)
            ),
            60_000
        );
        assert_eq!(
            finalized_duration_ms(SegmentReason::Wipe, 12_345, u128::from(TRAINING_WINDOW_MS)),
            12_345
        );
    }

    #[test]
    fn training_elapsed_freeze_payload_reports_the_window() {
        let frozen = payload_for_end(
            LiveDataPayload {
                elapsed_ms: "182500".to_string(),
                active_combat_time_ms: "182000".to_string(),
                ..LiveDataPayload::default()
            },
            SegmentReason::TrainingElapsed,
            u128::from(TRAINING_WINDOW_MS),
        );
        assert_eq!(frozen.elapsed_ms, TRAINING_WINDOW_MS.to_string());
        assert_eq!(frozen.damage_elapsed_ms, TRAINING_WINDOW_MS.to_string());
        assert_eq!(frozen.active_combat_time_ms, "182000");

        let early = payload_for_end(
            LiveDataPayload {
                elapsed_ms: "60000".to_string(),
                ..LiveDataPayload::default()
            },
            SegmentReason::Manual,
            60_000,
        );
        assert_eq!(early.elapsed_ms, "60000");
    }

    #[test]
    fn taking_one_topic_leaves_the_others_pending() {
        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let state = SegmentState::Idle {
            mode: IdleMode::Standard,
        };

        assert_eq!(projections.dirty_mask(), ALL_TOPICS);
        let publications = projections.take_publications(&entities, &state, TopicMask::MINIMAP);
        assert!(matches!(
            publications.as_slice(),
            [TopicPublication::Minimap(_)]
        ));
        assert_eq!(
            projections.dirty_mask(),
            SEGMENT_TOPICS.union(TopicMask::SCENE)
        );

        assert_eq!(
            projections
                .take_publications(&entities, &state, ALL_TOPICS)
                .len(),
            SEGMENT_TOPICS.union(TopicMask::SCENE).iter().count()
        );
        assert!(projections.dirty_mask().is_empty());

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    /// `LiveCore` always runs the container boundary (which ends and freezes
    /// the active segment) before the `ContainerReset` event that follows it
    /// reaches `ProjectionSet::apply`. By the time `reset_runtime` sees that
    /// event, the presentation layer already holds the frozen display for
    /// the just-ended segment — this asserts `reset_runtime` leaves it alone
    /// instead of blanking the meter like a manual reset would.
    #[test]
    fn container_reset_clears_runtime_but_keeps_the_frozen_meter() {
        use crate::live::projections::combat::accumulator::CombatHitFact;
        use crate::live::runtime::events::{
            BatchId, DeathBuffCheckpoint, DomainHit, EntityKind, EntityRef, EntityUuid, EventMeta,
            FantasyState, FantasyTransition, HitChannel, HitKind, SegmentId,
        };

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let idle = SegmentState::Idle {
            mode: IdleMode::Standard,
        };

        // Stand in for the state `end_segment` leaves behind for a
        // non-manual boundary, without exercising the real history writer.
        projections.presentation.segment_started(SegmentId(1));
        projections.presentation.freeze_segment(
            SegmentId(1),
            LiveDataPayload::default(),
            LiveDisplayClock {
                started_at_wall_ms: 1_000,
                accumulated_paused_ms: 0,
                paused_at_wall_ms: None,
                ended_at_wall_ms: Some(4_000),
            },
        );

        let attacker = EntityRef {
            uuid: EntityUuid(10),
            generation: 1,
        };
        let victim = EntityRef {
            uuid: EntityUuid(20),
            generation: 1,
        };
        let hit = DomainHit {
            channel: HitChannel::ToMe,
            source: Some(attacker),
            packet_owner: None,
            resolved_owner: None,
            target: victim,
            source_kind: Some(EntityKind::Monster),
            target_kind: EntityKind::Character,
            source_monster_id: Some(9_001),
            target_monster_id: None,
            target_is_boss: false,
            source_is_player: false,
            source_is_local_player: false,
            skill_key: 17_140_101,
            skill_id: Some(1_714),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 100,
            has_loss_breakdown: false,
            hp_loss: 0,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        };
        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 1_000,
            captured_mono_ns: 1_000_000_000,
            source_time_ms: None,
        };
        let hit_envelope = DomainEnvelope {
            sequence: 1,
            batch_id: meta.batch_id,
            occurred_at_ms: 1_000,
            meta,
            event_index: 0,
            segment_id: None,
            event: DomainEvent::CombatHitAccepted(hit),
        };
        let fact = CombatHitFact::from_domain(&hit);
        projections
            .death
            .apply_hit(&hit_envelope, &hit, fact.as_ref());
        assert!(
            projections
                .death
                .apply(&DomainEnvelope {
                    sequence: 2,
                    occurred_at_ms: 1_500,
                    event_index: 1,
                    event: DomainEvent::DeathOccurred {
                        victim,
                        killer: None,
                        skill_key: None,
                        buff_checkpoint: DeathBuffCheckpoint::default(),
                    },
                    ..hit_envelope.clone()
                })
                .is_some()
        );
        projections.entity_monitor.apply(
            &DomainEnvelope {
                sequence: 3,
                occurred_at_ms: 1_200,
                event_index: 2,
                event: DomainEvent::FantasyChanged {
                    transition: FantasyTransition::Summoned,
                    fantasy: FantasyState {
                        summon: EntityRef {
                            uuid: EntityUuid(30),
                            generation: 1,
                        },
                        summoner: attacker,
                        monster_id: 900,
                        remodel_level: 2,
                        resonance_skill_id: Some(77),
                    },
                },
                ..hit_envelope.clone()
            },
            &entities,
            &mut scheduler,
        );
        assert_eq!(projections.death.snapshot().len(), 1);
        assert_eq!(projections.entity_monitor.displayed_fantasies().len(), 1);

        let envelope = DomainEnvelope {
            sequence: 4,
            event_index: 3,
            event: DomainEvent::ContainerReset,
            ..hit_envelope
        };

        projections
            .apply(&envelope, &entities, &mut scheduler)
            .expect("container reset clears runtime state");

        let combat = projections.peek_combat(&idle);
        assert_eq!(combat.active_segment_id, None);
        assert_eq!(combat.displayed_segment_id, Some(1));
        assert!(
            combat.combat.is_some(),
            "the meter must keep showing the segment finalized right before the resync"
        );
        assert_eq!(
            combat.display_clock,
            Some(LiveDisplayClock {
                started_at_wall_ms: 1_000,
                accumulated_paused_ms: 0,
                paused_at_wall_ms: None,
                ended_at_wall_ms: Some(4_000),
            })
        );
        assert!(
            projections.death.snapshot().is_empty(),
            "the death engine must reset with the container"
        );
        assert!(
            projections.entity_monitor.displayed_fantasies().is_empty(),
            "the fantasy engine must reset with the container"
        );
        let deaths = projections.peek_deaths();
        assert_eq!(deaths.deaths.len(), 1);
        assert_eq!(deaths.deaths[0].victim_entity_uuid, "20");
        let fantasy = projections.peek_fantasy();
        assert_eq!(fantasy.teammate_fantasies.len(), 1);
        assert_eq!(fantasy.teammate_fantasies[0].summon_uuid, "30");

        projections
            .apply(&envelope, &entities, &mut scheduler)
            .expect("a second container reset stays idempotent");
        assert_eq!(projections.peek_deaths().deaths[0].victim_entity_uuid, "20");
        assert_eq!(
            projections.peek_fantasy().teammate_fantasies[0].summon_uuid,
            "30"
        );

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    #[test]
    fn monitor_attribute_reports_the_topics_of_its_consumers() {
        use crate::live::protocol::attrs as attr_type;
        use crate::live::runtime::events::{EntityRef, EntityUuid};

        // Local-player attributes feed panel/skill-CD display and the shield
        // bar, both on STATUS.
        let mut local_projection = EntityMonitorProjection::default();
        let entities = EntityContext::new();
        let local = EntityRef {
            uuid: EntityUuid(1),
            generation: 0,
        };
        local_projection.set_local_player_for_test(local);
        local_projection.monitor_panel_attr_for_test(attr_type::ATTR_CURRENT_HP);
        assert_eq!(
            local_projection.apply_integer_attribute(
                local,
                attr_type::ATTR_CURRENT_HP,
                50,
                &entities,
            ),
            TopicMask::STATUS
        );
        assert_eq!(
            local_projection.apply_integer_attribute(
                local,
                attr_type::ATTR_SKILL_CD,
                50,
                &entities,
            ),
            TopicMask::STATUS
        );
        // A local attribute nobody consumes dirties nothing.
        assert_eq!(
            local_projection.apply_integer_attribute(
                local,
                attr_type::ATTR_MAX_STUNNED,
                50,
                &entities,
            ),
            TopicMask::EMPTY
        );

        // Stagger matters only on the current attack target.
        let mut target_projection = EntityMonitorProjection::default();
        let target = EntityRef {
            uuid: EntityUuid(2),
            generation: 0,
        };
        target_projection.set_current_target_for_test(target);
        assert_eq!(
            target_projection.apply_integer_attribute(
                target,
                attr_type::ATTR_CURRENT_STUNNED,
                40,
                &entities,
            ),
            TopicMask::MONSTER
        );
        assert_eq!(
            target_projection.apply_integer_attribute(
                target,
                attr_type::ATTR_MAX_STUNNED,
                100,
                &entities,
            ),
            TopicMask::MONSTER
        );
        assert_eq!(
            target_projection.apply_integer_attribute(
                target,
                attr_type::ATTR_CURRENT_HP,
                1,
                &entities,
            ),
            TopicMask::MONSTER
        );

        // Plain bystanders dirty nothing.
        let mut plain_projection = EntityMonitorProjection::default();
        let plain = EntityRef {
            uuid: EntityUuid(3),
            generation: 0,
        };
        assert_eq!(
            plain_projection.apply_integer_attribute(plain, attr_type::ATTR_MAX_HP, 1, &entities,),
            TopicMask::EMPTY
        );
    }

    #[test]
    fn death_occurred_dirties_deaths_but_a_plain_hit_does_not() {
        use crate::live::runtime::events::{
            BatchId, DeathBuffCheckpoint, DomainHit, EntityKind, EntityRef, EntityUuid, EventMeta,
            HitChannel, HitKind, SegmentId,
        };

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();

        let attacker = EntityRef {
            uuid: EntityUuid(10),
            generation: 0,
        };
        let victim = EntityRef {
            uuid: EntityUuid(20),
            generation: 0,
        };
        let hit = DomainHit {
            channel: HitChannel::ToMe,
            source: Some(attacker),
            packet_owner: None,
            resolved_owner: None,
            target: victim,
            source_kind: Some(EntityKind::Monster),
            target_kind: EntityKind::Character,
            source_monster_id: Some(9_001),
            target_monster_id: None,
            target_is_boss: false,
            source_is_player: false,
            source_is_local_player: false,
            skill_key: 17_140_101,
            skill_id: Some(1_714),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 100,
            has_loss_breakdown: false,
            hp_loss: 0,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        };
        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 1_000,
            captured_mono_ns: 1_000_000_000,
            source_time_ms: None,
        };

        let mut dirty = projections.dirty_mask();
        dirty.remove(ALL_TOPICS);
        projections.dirty = dirty;

        // A plain accepted hit only buffers pending damage; it must not by
        // itself mark the deaths topic dirty.
        projections
            .apply(
                &DomainEnvelope {
                    sequence: 1,
                    batch_id: meta.batch_id,
                    occurred_at_ms: 1_000,
                    meta,
                    event_index: 0,
                    segment_id: Some(SegmentId(1)),
                    event: DomainEvent::CombatHitAccepted(hit),
                },
                &entities,
                &mut scheduler,
            )
            .unwrap();
        assert!(!projections.is_dirty(TopicMask::DEATHS));

        // The death itself, having consumed that buffered damage, dirties it.
        projections
            .apply(
                &DomainEnvelope {
                    sequence: 2,
                    batch_id: meta.batch_id,
                    occurred_at_ms: 1_500,
                    meta,
                    event_index: 1,
                    segment_id: Some(SegmentId(1)),
                    event: DomainEvent::DeathOccurred {
                        victim,
                        killer: None,
                        skill_key: None,
                        buff_checkpoint: DeathBuffCheckpoint::default(),
                    },
                },
                &entities,
                &mut scheduler,
            )
            .unwrap();
        assert!(projections.is_dirty(TopicMask::DEATHS));

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    #[test]
    fn facing_attributes_dirty_only_the_minimap() {
        use crate::live::protocol::attrs as attr_type;
        use crate::live::runtime::events::{BatchId, EntityRef, EntityUuid, EventMeta, SegmentId};

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let mut dirty = projections.dirty_mask();
        dirty.remove(ALL_TOPICS);
        projections.dirty = dirty;

        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 1_000,
            captured_mono_ns: 1_000_000,
            source_time_ms: None,
        };
        let envelope = DomainEnvelope {
            sequence: 1,
            batch_id: meta.batch_id,
            occurred_at_ms: 1_000,
            meta,
            event_index: 0,
            segment_id: Some(SegmentId(1)),
            event: DomainEvent::AttributeChanged {
                entity: EntityRef {
                    uuid: EntityUuid(1),
                    generation: 0,
                },
                attr_id: attr_type::ATTR_FACING,
                previous: None,
                current: AttributeValue::Int(0),
                is_baseline: false,
            },
        };
        projections
            .apply(&envelope, &entities, &mut scheduler)
            .unwrap();
        assert_eq!(projections.dirty_mask(), TopicMask::MINIMAP);

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    #[test]
    fn local_talent_change_dirties_only_the_scene_topic() {
        use crate::live::runtime::events::LocalTalent;

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let mut dirty = projections.dirty_mask();
        dirty.remove(ALL_TOPICS);
        projections.dirty = dirty;

        let envelope = test_envelope(
            1,
            1_000,
            1,
            DomainEvent::LocalTalentChanged {
                previous: LocalTalent::default(),
                current: LocalTalent {
                    profession_id: Some(4),
                    talent_stage_cfg_id: Some(108),
                },
            },
        );
        projections
            .apply(&envelope, &entities, &mut scheduler)
            .unwrap();
        assert_eq!(projections.dirty_mask(), TopicMask::SCENE);

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    fn test_meta(sequence: u64, wall_ms: i64, mono_ms: u64) -> EventMeta {
        EventMeta {
            batch_id: BatchId(sequence),
            capture_sequence: sequence,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: wall_ms,
            captured_mono_ns: mono_ms.saturating_mul(1_000_000),
            source_time_ms: None,
        }
    }

    fn test_envelope(
        sequence: u64,
        wall_ms: i64,
        mono_ms: u64,
        event: DomainEvent,
    ) -> DomainEnvelope {
        DomainEnvelope {
            sequence,
            batch_id: BatchId(sequence),
            occurred_at_ms: wall_ms,
            meta: test_meta(sequence, wall_ms, mono_ms),
            event_index: 0,
            segment_id: Some(SegmentId(1)),
            event,
        }
    }

    fn local_player() -> EntityRef {
        EntityRef {
            uuid: EntityUuid(10),
            generation: 1,
        }
    }

    fn player_hit() -> DomainHit {
        DomainHit {
            channel: HitChannel::ToMe,
            source: Some(local_player()),
            packet_owner: None,
            resolved_owner: None,
            target: EntityRef {
                uuid: EntityUuid(20),
                generation: 1,
            },
            source_kind: Some(EntityKind::Character),
            target_kind: EntityKind::Monster,
            source_monster_id: None,
            target_monster_id: Some(30_001),
            target_is_boss: true,
            source_is_player: true,
            source_is_local_player: true,
            skill_key: 17_140_101,
            skill_id: Some(1_714),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 100,
            has_loss_breakdown: true,
            hp_loss: 100,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        }
    }

    fn published_coverage(publications: &[TopicPublication]) -> &[BuffCoverageEntry] {
        publications
            .iter()
            .find_map(|publication| match publication {
                TopicPublication::Buffs(payload) => Some(payload.coverage.as_slice()),
                _ => None,
            })
            .expect("buffs publication")
    }

    #[test]
    fn ended_segment_freezes_coverage_metrics_and_forces_inactive() {
        use crate::live::runtime::events::{
            BuffEvent, BuffState, BuffTransition, BuffWireKind, EntityRoles, ProtocolBatch,
            ProtocolObservation,
        };
        use std::sync::Arc;

        const BASE: i32 = 2_201;

        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let mut entities = EntityContext::new();
        let idle = SegmentState::Idle {
            mode: IdleMode::Standard,
        };

        entities.apply_batch(ProtocolBatch {
            meta: test_meta(1, 0, 0),
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: EntityUuid(10),
                    kind: EntityKind::Character,
                },
                ProtocolObservation::LocalPlayerChanged {
                    uuid: Some(EntityUuid(10)),
                },
            ],
        });

        projections
            .buff_timeline
            .apply_config(&[BASE], &entities, None, |_| 0);
        projections
            .combat
            .start_segment(SegmentId(1), MonoTimeMs(0), 0);
        projections.combat.set_local_player(entities.local_player());
        projections.presentation.segment_started(SegmentId(1));
        let _ = projections
            .buff_timeline
            .start_segment(&entities, |mono| projections.combat.segment_offset_ms(mono));

        let _ = projections.buff_timeline.apply_buff(
            &BuffEvent {
                transition: BuffTransition::Applied,
                wire_kind: BuffWireKind::Add,
                duration_updated: false,
                previous_layer: None,
                state: BuffState {
                    target: local_player(),
                    instance_id: 1,
                    base_id: BASE,
                    layer: 2,
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
                target_roles: EntityRoles {
                    is_local_player: true,
                    is_team_member: true,
                    is_current_target: false,
                },
            },
            true,
            0,
            Some(10_000),
        );

        for at_ms in [1_000_u64, 3_000] {
            let hit = player_hit();
            let fact = CombatHitFact::from_domain(&hit);
            let outcome = projections.combat.apply_hit(
                &hit,
                fact.as_ref(),
                i64::try_from(at_ms).expect("hit offset fits"),
                MonoTimeMs(at_ms),
                &entities,
            );
            assert!(projections.buff_timeline.observe_hit(outcome.active_window));
        }

        projections.dirty |= TopicMask::BUFFS;
        let live = projections.take_publications(&entities, &idle, TopicMask::BUFFS);
        let live_coverage = published_coverage(&live);
        assert_eq!(live_coverage.len(), 1);
        assert_eq!(live_coverage[0].covered_ms, 2_500);
        assert_eq!(live_coverage[0].active_ms, 2_500);
        assert!(live_coverage[0].active_now);
        assert_eq!(live_coverage[0].count, 1);

        // Same hold-then-clear order as a non-manual `end_segment`, without
        // the history writer (this fixture has no database).
        let coverage = projections
            .buff_timeline
            .coverage_payload(&entities, coverage_active_ms(&projections.combat));
        projections
            .presentation
            .freeze_coverage(SegmentId(1), coverage);
        projections.buff_timeline.clear();
        projections.combat.clear_segment();
        projections.dirty |= TopicMask::BUFFS;

        let frozen = projections.take_publications(&entities, &idle, TopicMask::BUFFS);
        let frozen_coverage = published_coverage(&frozen);
        assert_eq!(frozen_coverage.len(), 1);
        assert_eq!(frozen_coverage[0].covered_ms, 2_500);
        assert_eq!(frozen_coverage[0].active_ms, 2_500);
        assert_eq!(frozen_coverage[0].count, 1);
        assert!(!frozen_coverage[0].active_now);
        assert_eq!(frozen_coverage[0].layer, 0);

        projections.mark_dirty(TopicMask::BUFFS);
        let republished = projections.take_publications(&entities, &idle, TopicMask::BUFFS);
        let republished_coverage = published_coverage(&republished);
        assert_eq!(republished_coverage[0].covered_ms, 2_500);
        assert_eq!(republished_coverage[0].active_ms, 2_500);
        assert!(!republished_coverage[0].active_now);

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }

    #[test]
    fn container_reset_keeps_frozen_coverage() {
        let (writer, join) = HistoryWriterHandle::start().expect("history writer starts");
        let mut projections = ProjectionSet::new(writer);
        let entities = EntityContext::new();
        let mut scheduler = DeadlineScheduler::new();
        let idle = SegmentState::Idle {
            mode: IdleMode::Standard,
        };

        projections.presentation.segment_started(SegmentId(1));
        projections.presentation.freeze_coverage(
            SegmentId(1),
            vec![BuffCoverageEntry {
                base_id: 2_201,
                covered_ms: 1_500,
                active_ms: 2_000,
                active_now: true,
                layer: 2,
                count: 3,
            }],
        );

        projections
            .apply(
                &test_envelope(1, 1_000, 1_000, DomainEvent::ContainerReset),
                &entities,
                &mut scheduler,
            )
            .expect("container reset clears runtime state");

        let publications = projections.take_publications(&entities, &idle, TopicMask::BUFFS);
        let coverage = published_coverage(&publications);
        assert_eq!(coverage[0].covered_ms, 1_500);
        assert_eq!(coverage[0].active_ms, 2_000);
        assert_eq!(coverage[0].count, 3);
        assert!(!coverage[0].active_now);
        assert_eq!(coverage[0].layer, 0);

        drop(projections);
        join.join().expect("history writer stops after disconnect");
    }
}
