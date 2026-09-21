//! Single-owner orchestration for the protocol-neutral live domain.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::live::counter::engine::CounterSource;
use crate::live::dungeon_objectives::{classify_objective, classify_progress_state};
use crate::live::history_writer::HistoryWriterHandle;
use crate::live::ipc::topic::{Topic, TopicMask};
use crate::live::marker_skills::KEY_SKILL_IDS;
use crate::live::projection_set::{ProjectionSet, TopicPublication};
use crate::live::projections::timeline::classify_marker;
use crate::live::protocol::attrs as attr_type;
use crate::live::runtime::entity_context::{EntityContext, EntityState};
use crate::live::runtime::events::{
    AttributeValue, BatchId, DomainEnvelope, DomainEvent, DomainHit, EntityUuid, EventMeta,
    GameTimerKey, GameTimerState, HitKind, MonoTimeMs, ProtocolBatch, ProtocolObservation,
    SegmentReason, TimerKey, TimerScope, monotonic_now_ms, wall_now_ms,
};
use crate::live::runtime::scheduler::{DeadlineScheduler, TimerTask};
use crate::live::runtime::segment::{CombatGate, SegmentController, SegmentState};
use crate::live::runtime_handle::RuntimeCommand;
use crate::voice::models::VoiceRuntimeSnapshot;

#[derive(Debug, Default)]
pub struct Publications {
    pub topics: Vec<TopicPublication>,
}

/// Publication cadence bookkeeping for a single topic.
#[derive(Debug, Default, Clone, Copy)]
struct PublishSchedule {
    next: Option<MonoTimeMs>,
    last: Option<MonoTimeMs>,
}

#[derive(Debug)]
pub enum LiveCoreFlow {
    Continue,
    ShutdownRequested {
        reply: oneshot::Sender<Result<(), String>>,
    },
}

#[derive(Debug, Clone, Copy)]
struct ClockAnchor {
    mono: MonoTimeMs,
    wall_ms: i64,
}

pub struct LiveCore {
    app: AppHandle,
    entities: EntityContext,
    segments: SegmentController,
    scheduler: DeadlineScheduler,
    projections: ProjectionSet,
    game_timer_keys: HashSet<GameTimerKey>,
    active_dungeon_objective: Option<i32>,
    next_domain_sequence: u64,
    next_synthetic_batch: u64,
    clock_anchor: ClockAnchor,
    live_publish_interval_ms: u64,
    publish: [PublishSchedule; Topic::COUNT],
    shutdown_complete: bool,
}

impl LiveCore {
    pub fn new(
        app: AppHandle,
        history_writer: HistoryWriterHandle,
        initial_config: MonitorRuntimeSnapshot,
        mut initial_voice: VoiceRuntimeSnapshot,
    ) -> Result<Self, String> {
        let config = Arc::new(initial_config.normalize()?);
        initial_voice.normalize();
        let now = monotonic_now_ms();
        let wall_now = wall_now_ms();
        let mut scheduler = DeadlineScheduler::new();
        let mut entities = EntityContext::new();
        let mut projections = ProjectionSet::new(history_writer);
        projections.apply_config(
            Arc::clone(&config),
            &entities,
            wall_now,
            now,
            &mut scheduler,
        )?;
        projections.apply_voice_config(&initial_voice, &entities, wall_now, now, &mut scheduler);
        entities.set_watched_skill_ids(watched_skill_ids(&config));
        // The worker starts disabled. Publish persisted settings before any
        // cue can be produced, including cold starts without the main window.
        sync_voice_service_settings(&app, &initial_voice);

        let mut core = Self {
            app,
            entities,
            segments: SegmentController::new(),
            scheduler,
            projections,
            game_timer_keys: HashSet::new(),
            active_dungeon_objective: None,
            next_domain_sequence: 0,
            next_synthetic_batch: u64::MAX,
            clock_anchor: ClockAnchor {
                mono: now,
                wall_ms: wall_now,
            },
            live_publish_interval_ms: config.live.event_update_rate_ms,
            publish: [PublishSchedule::default(); Topic::COUNT],
            shutdown_complete: false,
        };
        core.segments
            .set_training_window_ms(config.live.training_window_ms);
        core.segments
            .set_training_lock_policy(config.live.training_lock_policy);
        core.request_publications(now, true);
        Ok(core)
    }

    pub fn process_batch(&mut self, batch: ProtocolBatch) -> Result<(), String> {
        if self.shutdown_complete {
            return Err("live core has already shut down".to_string());
        }

        let meta = batch.meta;
        let packet_mono = meta.mono_ms();
        self.clock_anchor = ClockAnchor {
            mono: packet_mono,
            wall_ms: meta.captured_wall_ms,
        };
        self.drain_due_before(packet_mono)?;

        let paused_at_batch_start = self.entities.is_paused();
        let mut hp_shadow = BatchHpShadow::from_batch(&self.entities, &batch);
        let events = self.entities.apply_batch(batch);

        let mut transitions = Vec::with_capacity(3);
        for envelope in &events {
            let boundary = match &envelope.event {
                DomainEvent::ContainerReset => self
                    .segments
                    .container_boundary(envelope.meta, &mut self.scheduler),
                _ => Vec::new(),
            };
            transitions.extend(boundary);
        }

        let decision =
            self.segments
                .preflight_batch(&events, paused_at_batch_start, &mut self.scheduler);
        transitions.extend(decision.transitions);
        // Always classify dungeon objectives so pre-combat snapshots remember
        // the active target. Arm only while a standard segment is recording.
        self.arm_automatic_boundaries(&events);
        let force_publication = !transitions.is_empty();
        let segment_id = decision.segment_id;
        let combat_gate = decision.combat_gate;
        let accept_hits_from_event_index = decision.accept_hits_from_event_index;

        self.projections.begin_batch(meta.batch_id);
        let result: Result<(), String> = (|| {
            for event in transitions {
                let mut envelope = transition_envelope(meta, event);
                self.apply_projection_envelope(&mut envelope)?;
            }
            for opener in decision.released_openers {
                self.projections.apply_marker(&opener, &self.entities)?;
            }

            let mut paused = paused_at_batch_start;
            for mut envelope in events {
                envelope.segment_id = segment_id;
                hp_shadow.observe_event(&envelope.event);
                let accepted_hit = match &mut envelope.event {
                    DomainEvent::HitResolved(hit)
                        if accept_hits_from_event_index
                            .is_none_or(|first| envelope.event_index >= first)
                            && accepts_hit(
                                is_recording(self.segments.state()),
                                paused,
                                combat_gate,
                                hit,
                            ) =>
                    {
                        hp_shadow.apply_accepted_hit(hit);
                        Some(*hit)
                    }
                    _ => None,
                };
                let pause_change = match envelope.event {
                    DomainEvent::PauseChanged { is_paused } => Some(is_paused),
                    _ => None,
                };

                if let Some(hit) = accepted_hit {
                    envelope.event = DomainEvent::CombatHitAccepted(hit);
                }
                self.apply_projection_envelope(&mut envelope)?;
                if classify_marker(&envelope, &self.entities).is_some()
                    && let Some(marker) = self.segments.route_marker(&envelope)
                {
                    self.projections.apply_marker(&marker, &self.entities)?;
                }

                if let Some(is_paused) = pause_change {
                    paused = is_paused;
                }
            }
            Ok(())
        })();
        self.projections.end_batch(
            &self.entities,
            meta.captured_wall_ms,
            packet_mono,
            &mut self.scheduler,
        );
        self.flush_voice_cues();
        result?;

        self.request_publications(packet_mono, force_publication);
        self.drain_due_through(packet_mono)
    }

    pub fn drain_due_before(&mut self, packet_time: MonoTimeMs) -> Result<(), String> {
        let Some(horizon) = strictly_before(packet_time) else {
            return Ok(());
        };
        self.drain_due_horizon(horizon)
    }

    pub fn drain_due_through(&mut self, time: MonoTimeMs) -> Result<(), String> {
        self.drain_due_horizon(time)
    }

    #[must_use]
    pub fn next_wakeup(&mut self) -> Option<MonoTimeMs> {
        self.publish
            .iter()
            .filter_map(|schedule| schedule.next)
            .chain(self.scheduler.next_deadline())
            .min()
    }

    pub fn take_due_publications(&mut self, now: MonoTimeMs) -> Result<Publications, String> {
        self.drain_due_through(now)?;
        let due = self.due_topics(now);
        if due.is_empty() {
            return Ok(Publications::default());
        }

        let topics = self
            .projections
            .take_publications(&self.entities, self.segments.state(), due);
        for publication in &topics {
            let schedule = &mut self.publish[publication.topic().index()];
            schedule.next = None;
            schedule.last = Some(now);
        }
        Ok(Publications { topics })
    }

    pub fn publish_now(&mut self) -> Result<Publications, String> {
        let now = self.refresh_clock();
        self.request_publications(now, true);
        self.take_due_publications(now)
    }

    pub fn handle_command(&mut self, command: RuntimeCommand) -> Result<LiveCoreFlow, String> {
        match command {
            RuntimeCommand::ManualReset => {
                self.manual_reset()?;
                Ok(LiveCoreFlow::Continue)
            }
            RuntimeCommand::TogglePause => {
                self.toggle_pause()?;
                Ok(LiveCoreFlow::Continue)
            }
            RuntimeCommand::ApplyMonitorConfig(config) => {
                self.apply_config(config)?;
                Ok(LiveCoreFlow::Continue)
            }
            RuntimeCommand::ApplyVoiceConfig(snapshot) => {
                self.apply_voice_config(snapshot)?;
                Ok(LiveCoreFlow::Continue)
            }
            RuntimeCommand::StartTraining => {
                let now = self.refresh_clock();
                self.drain_due_through(now)?;
                self.segments.arm_training(&mut self.scheduler);
                self.projections.mark_dirty(TopicMask::COMBAT);
                self.request_publications(now, true);
                Ok(LiveCoreFlow::Continue)
            }
            RuntimeCommand::StopTraining => {
                self.stop_training()?;
                Ok(LiveCoreFlow::Continue)
            }
            RuntimeCommand::Shutdown { reply } => Ok(LiveCoreFlow::ShutdownRequested { reply }),
        }
    }

    /// Finalizes the active segment after capture and decode have been drained.
    /// The outer runtime owns the subsequent history-writer fence and join.
    pub fn shutdown(&mut self) -> Result<(), String> {
        if self.shutdown_complete {
            return Ok(());
        }
        let now = self.refresh_clock();
        self.drain_due_through(now)?;
        let meta = self.synthetic_meta(now, self.wall_at(now));
        let transitions = self.segments.shutdown_boundary(meta, &mut self.scheduler);
        self.apply_transition_batch(meta, transitions)?;
        self.shutdown_complete = true;
        Ok(())
    }

    fn arm_automatic_boundaries(&mut self, events: &[DomainEnvelope]) {
        for envelope in events {
            let reason = match &envelope.event {
                DomainEvent::WipeDetected { .. } => Some(SegmentReason::Wipe),
                DomainEvent::DungeonObjectiveChanged {
                    target_id,
                    count,
                    complete,
                } => classify_objective(
                    *target_id,
                    *count,
                    *complete,
                    &mut self.active_dungeon_objective,
                )
                .then_some(SegmentReason::AutomaticObjective),
                DomainEvent::DungeonProgressStateChanged { previous, current } => {
                    classify_progress_state(*previous, *current)
                        .then_some(SegmentReason::AutomaticObjective)
                }
                _ => None,
            };
            if let Some(reason) = reason
                && is_recording(self.segments.state())
            {
                self.segments
                    .arm_automatic_boundary(envelope.meta, reason, &mut self.scheduler);
            }
        }
    }

    fn manual_reset(&mut self) -> Result<(), String> {
        let now = self.refresh_clock();
        self.drain_due_through(now)?;
        let meta = self.synthetic_meta(now, self.wall_at(now));
        let transitions = self.segments.manual_boundary(meta, &mut self.scheduler);
        self.apply_transition_batch(meta, transitions)?;
        self.projections.clear_display();
        self.request_publications(now, true);
        Ok(())
    }

    fn toggle_pause(&mut self) -> Result<(), String> {
        let now = self.refresh_clock();
        let meta = self.synthetic_meta(now, self.wall_at(now));
        self.process_batch(ProtocolBatch {
            meta,
            observations: vec![ProtocolObservation::PauseChanged {
                is_paused: !self.entities.is_paused(),
            }],
        })?;
        self.request_publications(now, true);
        Ok(())
    }

    fn apply_config(&mut self, config: MonitorRuntimeSnapshot) -> Result<(), String> {
        let config = Arc::new(config.normalize()?);
        let now = self.refresh_clock();
        self.drain_due_through(now)?;
        self.live_publish_interval_ms = config.live.event_update_rate_ms;
        self.segments
            .set_training_window_ms(config.live.training_window_ms);
        self.segments
            .set_training_lock_policy(config.live.training_lock_policy);
        self.projections.apply_config(
            Arc::clone(&config),
            &self.entities,
            self.wall_at(now),
            now,
            &mut self.scheduler,
        )?;
        self.entities
            .set_watched_skill_ids(watched_skill_ids(&config));
        self.flush_voice_cues();
        self.request_publications(now, true);
        Ok(())
    }

    /// Applies a pre-normalized voice snapshot. Only the deadline drain can
    /// fail here (history persistence), same as every other command; the
    /// voice-specific part is infallible so a bad rule can never take the
    /// runtime down — validation happens in the Tauri command instead.
    fn apply_voice_config(&mut self, mut snapshot: VoiceRuntimeSnapshot) -> Result<(), String> {
        snapshot.normalize();
        let now = self.refresh_clock();
        self.drain_due_through(now)?;
        let now_wall = self.wall_at(now);
        self.projections.apply_voice_config(
            &snapshot,
            &self.entities,
            now_wall,
            now,
            &mut self.scheduler,
        );
        // Playback settings are a service concern, not projection state: sync
        // them here so `VoiceProjection` stays free of the Tauri handle.
        sync_voice_service_settings(&self.app, &snapshot);
        self.flush_voice_cues();
        self.request_publications(now, true);
        Ok(())
    }

    /// Hands every cue matched by [`VoiceProjection`] to the playback service.
    /// Called at each batch boundary so cues reach the player in the same
    /// order the domain events produced them.
    fn flush_voice_cues(&mut self) {
        let cues = self.projections.take_voice_cues();
        if cues.is_empty() {
            return;
        }
        let Some(service) = self.app.try_state::<crate::voice::VoiceService>() else {
            return;
        };
        for cue in cues {
            service.enqueue_cue(cue);
        }
    }

    fn stop_training(&mut self) -> Result<(), String> {
        let now = self.refresh_clock();
        self.drain_due_through(now)?;
        let meta = self.synthetic_meta(now, self.wall_at(now));
        let transitions = self.segments.stop_training(meta, &mut self.scheduler);
        self.apply_transition_batch(meta, transitions)?;
        self.projections.clear_display();
        self.request_publications(now, true);
        Ok(())
    }

    fn apply_transition_batch(
        &mut self,
        meta: EventMeta,
        transitions: Vec<DomainEvent>,
    ) -> Result<(), String> {
        let changed = !transitions.is_empty();
        self.projections.begin_batch(meta.batch_id);
        let result: Result<(), String> = (|| {
            for event in transitions {
                let mut envelope = transition_envelope(meta, event);
                self.apply_projection_envelope(&mut envelope)?;
            }
            Ok(())
        })();
        self.projections.end_batch(
            &self.entities,
            meta.captured_wall_ms,
            meta.mono_ms(),
            &mut self.scheduler,
        );
        self.flush_voice_cues();
        result?;
        self.request_publications(meta.mono_ms(), changed);
        Ok(())
    }

    fn apply_projection_envelope(&mut self, envelope: &mut DomainEnvelope) -> Result<(), String> {
        self.next_domain_sequence = self
            .next_domain_sequence
            .checked_add(1)
            .ok_or_else(|| "domain sequence exhausted".to_string())?;
        envelope.sequence = self.next_domain_sequence;
        if matches!(envelope.event, DomainEvent::SegmentEnded { .. }) {
            self.entities.reset_combat_lifecycles();
        }
        self.update_game_timer_schedule(envelope);
        self.projections
            .apply(envelope, &self.entities, &mut self.scheduler)
    }

    fn update_game_timer_schedule(&mut self, envelope: &DomainEnvelope) {
        match &envelope.event {
            DomainEvent::ContainerReset => {
                self.scheduler.invalidate_scope(TimerScope::Runtime);
                self.game_timer_keys.clear();
                self.active_dungeon_objective = None;
            }
            DomainEvent::GameTimerSnapshot { timers } => {
                let next: HashSet<_> = timers.iter().map(|timer| timer.key).collect();
                let stale: Vec<_> = self
                    .game_timer_keys
                    .iter()
                    .filter(|key| !next.contains(key))
                    .copied()
                    .collect();
                for key in stale {
                    self.scheduler.cancel(TimerKey::GameTimer(key));
                }
                self.game_timer_keys = next;
                for timer in timers {
                    schedule_game_timer(
                        &mut self.scheduler,
                        timer,
                        envelope.occurred_at_ms,
                        envelope.meta.mono_ms(),
                    );
                }
            }
            DomainEvent::GameTimerChanged(timer) => {
                self.game_timer_keys.insert(timer.key);
                schedule_game_timer(
                    &mut self.scheduler,
                    timer,
                    envelope.occurred_at_ms,
                    envelope.meta.mono_ms(),
                );
            }
            _ => {}
        }
    }

    fn drain_due_horizon(&mut self, horizon: MonoTimeMs) -> Result<(), String> {
        if self
            .scheduler
            .next_deadline()
            .is_none_or(|deadline| deadline > horizon)
        {
            return Ok(());
        }

        let fired_wall_ms = self.wall_at(horizon);
        let meta = self.synthetic_meta(horizon, fired_wall_ms);
        let mut event_index = 0_u32;
        let mut force_publication = false;
        self.projections.begin_batch(meta.batch_id);
        let result: Result<(), String> = (|| {
            loop {
                let due_timers = self.scheduler.drain_due(horizon);
                if due_timers.is_empty() {
                    break;
                }
                for due in due_timers {
                    self.schedule_following_game_timer(due);
                    self.projections.on_due(due, horizon, &mut self.scheduler);
                    let mut deadline = DomainEnvelope {
                        sequence: 0,
                        batch_id: meta.batch_id,
                        occurred_at_ms: fired_wall_ms,
                        meta,
                        event_index,
                        segment_id: self.segments.current_segment_id(),
                        event: DomainEvent::DeadlineReached {
                            key: due.key,
                            kind: due.kind,
                            scope: due.scope,
                            scheduled_for: due.scheduled_for,
                            fired_at: horizon,
                            generation: due.generation,
                        },
                    };
                    event_index = event_index.saturating_add(1);
                    self.apply_projection_envelope(&mut deadline)?;

                    let ended_at_wall_ms = self.wall_at(due.scheduled_for);
                    let transitions =
                        self.segments
                            .on_timer(due, ended_at_wall_ms, &mut self.scheduler);
                    force_publication |= !transitions.is_empty();
                    for event in transitions {
                        let mut transition = transition_envelope(meta, event);
                        transition.event_index = event_index;
                        event_index = event_index.saturating_add(1);
                        self.apply_projection_envelope(&mut transition)?;
                    }
                }
            }
            Ok(())
        })();
        self.projections
            .end_batch(&self.entities, fired_wall_ms, horizon, &mut self.scheduler);
        self.flush_voice_cues();
        result?;
        self.request_publications(horizon, force_publication);
        Ok(())
    }

    fn schedule_following_game_timer(&mut self, due: crate::live::runtime::scheduler::DueTimer) {
        let TimerKey::GameTimer(key) = due.key else {
            return;
        };
        let Some(timer) = self.entities.game_timer(key) else {
            return;
        };
        let fired_wall_ms = self.wall_at(due.scheduled_for);
        if let Some(deadline) = game_timer_deadline_after(
            timer,
            fired_wall_ms,
            due.scheduled_for,
            DeadlineBound::Exclusive,
        ) {
            self.scheduler.schedule(
                TimerKey::GameTimer(key),
                TimerScope::Runtime,
                deadline,
                TimerTask::GameTimer,
            );
        }
    }

    /// Schedules every dirty topic on its own cadence. Forced publications
    /// (`immediate`) land on `now` so the caller's `take_due_publications`
    /// picks them up within the same turn. No topic is inherently immediate.
    fn request_publications(&mut self, now: MonoTimeMs, immediate: bool) {
        for topic in self.projections.dirty_mask().iter() {
            let deadline = if immediate {
                now
            } else {
                let interval = topic.throttle_ms().unwrap_or(self.live_publish_interval_ms);
                self.publish[topic.index()]
                    .last
                    .map_or(now, |last| now.max(last.saturating_add(interval)))
            };
            let schedule = &mut self.publish[topic.index()];
            schedule.next = earlier(schedule.next, deadline);
        }
    }

    /// Dirty topics whose publication deadline has arrived.
    fn due_topics(&self, now: MonoTimeMs) -> TopicMask {
        self.projections
            .dirty_mask()
            .iter()
            .filter(|topic| {
                self.publish[topic.index()]
                    .next
                    .is_some_and(|deadline| deadline <= now)
            })
            .fold(TopicMask::EMPTY, |due, topic| due.union(topic.mask()))
    }

    fn refresh_clock(&mut self) -> MonoTimeMs {
        let mono = monotonic_now_ms();
        self.clock_anchor = ClockAnchor {
            mono,
            wall_ms: wall_now_ms(),
        };
        mono
    }

    fn wall_at(&self, mono: MonoTimeMs) -> i64 {
        if mono >= self.clock_anchor.mono {
            self.clock_anchor.wall_ms.saturating_add(
                i64::try_from(mono.0.saturating_sub(self.clock_anchor.mono.0)).unwrap_or(i64::MAX),
            )
        } else {
            self.clock_anchor.wall_ms.saturating_sub(
                i64::try_from(self.clock_anchor.mono.0.saturating_sub(mono.0)).unwrap_or(i64::MAX),
            )
        }
    }

    fn synthetic_meta(&mut self, mono: MonoTimeMs, wall_ms: i64) -> EventMeta {
        let batch_id = BatchId(self.next_synthetic_batch);
        self.next_synthetic_batch = self.next_synthetic_batch.wrapping_sub(1);
        EventMeta {
            batch_id,
            capture_sequence: batch_id.0,
            stream_id: 0,
            stream_epoch: 0,
            captured_wall_ms: wall_ms,
            captured_mono_ns: mono.0.saturating_mul(1_000_000),
            source_time_ms: None,
        }
    }
}

fn transition_envelope(meta: EventMeta, event: DomainEvent) -> DomainEnvelope {
    let (segment_id, occurred_at_ms) = match &event {
        DomainEvent::SegmentStarted {
            segment_id,
            started_at_wall_ms,
            ..
        } => (Some(*segment_id), *started_at_wall_ms),
        DomainEvent::SegmentEnded {
            segment_id,
            ended_at_wall_ms,
            ..
        } => (Some(*segment_id), *ended_at_wall_ms),
        _ => (None, meta.captured_wall_ms),
    };
    DomainEnvelope {
        sequence: 0,
        batch_id: meta.batch_id,
        occurred_at_ms,
        meta,
        event_index: 0,
        segment_id,
        event,
    }
}

fn is_recording(state: &SegmentState) -> bool {
    matches!(state, SegmentState::Recording { .. })
}

fn accepts_hit(
    recording: bool,
    paused: bool,
    gate: CombatGate,
    hit: &crate::live::runtime::events::DomainHit,
) -> bool {
    recording && !paused && gate.accepts(hit)
}

#[derive(Debug, Default, Clone, Copy)]
struct TargetHpState {
    current_hp: Option<u128>,
    max_hp: Option<u128>,
}

impl TargetHpState {
    fn from_entity(entity: Option<&EntityState>) -> Self {
        let current_hp =
            entity.and_then(|entity| nonnegative_int_attr(entity, attr_type::ATTR_CURRENT_HP));
        let max_hp = entity
            .and_then(|entity| nonnegative_int_attr(entity, attr_type::ATTR_MAX_HP))
            .filter(|value| *value > 0);
        Self { current_hp, max_hp }
    }

    fn observe_attribute(&mut self, attr_id: i32, value: &AttributeValue) {
        let value = match value {
            AttributeValue::Int(value) => u128::try_from(*value).ok(),
            _ => None,
        };
        match attr_id {
            attr_type::ATTR_CURRENT_HP => self.current_hp = value,
            attr_type::ATTR_MAX_HP => self.max_hp = value.filter(|value| *value > 0),
            _ => {}
        }
    }

    fn apply_damage(&mut self, hp_loss: u128) {
        if let (Some(current_hp), Some(max_hp)) = (&mut self.current_hp, self.max_hp) {
            *current_hp = (*current_hp).min(max_hp).saturating_sub(hp_loss);
        }
    }

    fn apply_heal(&mut self, raw_heal: u128) -> u128 {
        let (Some(current_hp), Some(max_hp)) = (&mut self.current_hp, self.max_hp) else {
            return raw_heal;
        };
        let clamped_current = (*current_hp).min(max_hp);
        let effective = raw_heal.min(max_hp.saturating_sub(clamped_current));
        *current_hp = clamped_current.saturating_add(effective).min(max_hp);
        effective
    }
}

#[derive(Debug, Default)]
struct BatchHpShadow {
    targets: HashMap<EntityUuid, TargetHpState>,
}

impl BatchHpShadow {
    fn from_batch(entities: &EntityContext, batch: &ProtocolBatch) -> Self {
        let mut targets = HashMap::new();
        for observation in &batch.observations {
            let ProtocolObservation::HitResolved(hit) = observation else {
                continue;
            };
            targets
                .entry(hit.target_uuid)
                .or_insert_with(|| TargetHpState::from_entity(entities.entity(hit.target_uuid)));
        }
        Self { targets }
    }

    fn observe_event(&mut self, event: &DomainEvent) {
        let DomainEvent::AttributeChanged {
            entity,
            attr_id,
            current,
            ..
        } = event
        else {
            return;
        };
        if let Some(target) = self.targets.get_mut(&entity.uuid) {
            target.observe_attribute(*attr_id, current);
        }
    }

    fn apply_accepted_hit(&mut self, hit: &mut DomainHit) {
        let Some(target) = self.targets.get_mut(&hit.target.uuid) else {
            return;
        };
        match hit.kind {
            HitKind::Damage => {
                let hp_loss = if hit.has_loss_breakdown {
                    hit.hp_loss
                } else {
                    hit.amount
                };
                target.apply_damage(hp_loss);
            }
            HitKind::Healing => {
                hit.effective_amount = Some(target.apply_heal(hit.amount));
            }
        }
    }
}

fn nonnegative_int_attr(entity: &EntityState, attr_id: i32) -> Option<u128> {
    let AttributeValue::Int(value) = entity.attributes.get(&attr_id)? else {
        return None;
    };
    u128::try_from(*value).ok()
}

fn sync_voice_service_settings(app: &AppHandle, snapshot: &VoiceRuntimeSnapshot) {
    if let Some(service) = app.try_state::<crate::voice::VoiceService>() {
        service.apply_runtime_settings(snapshot.enabled, snapshot.volume, snapshot.queue_policy);
    }
}

fn watched_skill_ids(config: &MonitorRuntimeSnapshot) -> HashSet<i32> {
    let mut watched: HashSet<_> = config.skill.monitored_skill_ids.iter().copied().collect();
    watched.extend(KEY_SKILL_IDS.iter().copied());
    for rule in &config.skill.buff_counter_rules {
        for source in &rule.sources {
            collect_counter_skill_ids(source, &mut watched);
        }
    }
    for template in &config.skill.season_cultivate_factor_templates {
        for source in &template.sources {
            collect_counter_skill_ids(source, &mut watched);
        }
    }
    watched
}

fn collect_counter_skill_ids(source: &CounterSource, watched: &mut HashSet<i32>) {
    match source {
        CounterSource::SkillCast { skill_base_ids, .. }
        | CounterSource::SkillCastComplete { skill_base_ids, .. } => {
            watched.extend(skill_base_ids.iter().copied());
        }
        CounterSource::SkillDurationTick { skill_base_id, .. } => {
            watched.insert(*skill_base_id);
        }
        _ => {}
    }
}

fn schedule_game_timer(
    scheduler: &mut DeadlineScheduler,
    timer: &GameTimerState,
    observed_wall_ms: i64,
    observed_mono: MonoTimeMs,
) {
    let key = TimerKey::GameTimer(timer.key);
    if let Some(deadline) = game_timer_deadline(timer, observed_wall_ms, observed_mono) {
        scheduler.schedule(key, TimerScope::Runtime, deadline, TimerTask::GameTimer);
    } else {
        scheduler.cancel(key);
    }
}

fn game_timer_deadline(
    timer: &GameTimerState,
    observed_wall_ms: i64,
    observed_mono: MonoTimeMs,
) -> Option<MonoTimeMs> {
    game_timer_deadline_after(
        timer,
        observed_wall_ms,
        observed_mono,
        DeadlineBound::Inclusive,
    )
}

#[derive(Debug, Clone, Copy)]
enum DeadlineBound {
    Inclusive,
    Exclusive,
}

fn game_timer_deadline_after(
    timer: &GameTimerState,
    reference_wall_ms: i64,
    reference_mono: MonoTimeMs,
    bound: DeadlineBound,
) -> Option<MonoTimeMs> {
    let wall_deadline = [
        timer.next_timestamp,
        timer.next_end_timestamp,
        timer.end_timestamp,
    ]
    .into_iter()
    .flatten()
    .filter(|candidate| match bound {
        DeadlineBound::Inclusive => *candidate >= reference_wall_ms,
        DeadlineBound::Exclusive => *candidate > reference_wall_ms,
    })
    .min()?;
    let delta_ms = u64::try_from(wall_deadline.saturating_sub(reference_wall_ms)).ok()?;
    Some(reference_mono.saturating_add(delta_ms))
}

fn earlier(current: Option<MonoTimeMs>, candidate: MonoTimeMs) -> Option<MonoTimeMs> {
    Some(current.map_or(candidate, |current| current.min(candidate)))
}

fn strictly_before(time: MonoTimeMs) -> Option<MonoTimeMs> {
    time.0.checked_sub(1).map(MonoTimeMs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::{
        DomainHit, EntityKind, EntityRef, EntityUuid, HitChannel, HitKind, ObservationOrigin,
        ObservedHit,
    };

    fn hit(target: EntityRef) -> DomainHit {
        DomainHit {
            channel: HitChannel::ToMe,
            source: None,
            packet_owner: None,
            resolved_owner: None,
            target,
            source_kind: Some(EntityKind::Character),
            target_kind: EntityKind::Monster,
            source_monster_id: None,
            target_monster_id: None,
            target_is_boss: false,
            source_is_player: true,
            source_is_local_player: true,
            skill_key: 1,
            skill_id: Some(1),
            type_flags: 0,
            kind: HitKind::Damage,
            amount: 1,
            has_loss_breakdown: true,
            hp_loss: 1,
            shield_loss: 0,
            is_lucky_bonus_only: false,
            property: None,
            damage_mode: None,
            effective_amount: None,
        }
    }

    #[test]
    fn packet_deadline_is_excluded_from_before_horizon() {
        let mut scheduler = DeadlineScheduler::new();
        scheduler.schedule(
            TimerKey::SegmentBoundary,
            TimerScope::Runtime,
            MonoTimeMs(99),
            TimerTask::SegmentBoundary {
                reason: SegmentReason::Wipe,
            },
        );
        scheduler.schedule(
            TimerKey::GameTimer(GameTimerKey {
                cfg_id: 1,
                timer_type: 0,
            }),
            TimerScope::Runtime,
            MonoTimeMs(100),
            TimerTask::GameTimer,
        );

        let before = strictly_before(MonoTimeMs(100)).unwrap();
        assert_eq!(scheduler.drain_due(before).len(), 1);
        assert_eq!(scheduler.next_deadline(), Some(MonoTimeMs(100)));
    }

    #[test]
    fn pause_and_training_gate_block_accepted_hits() {
        let target = EntityRef {
            uuid: EntityUuid(20),
            generation: 1,
        };
        let hit = hit(target);
        assert!(!accepts_hit(true, true, CombatGate::AllowAll, &hit));
        assert!(!accepts_hit(false, false, CombatGate::AllowAll, &hit));
        assert!(!accepts_hit(true, false, CombatGate::BlockAll, &hit));
        assert!(accepts_hit(true, false, CombatGate::Only(target), &hit));
    }

    #[test]
    fn game_timer_uses_earliest_future_wall_deadline() {
        let timer = GameTimerState {
            key: GameTimerKey {
                cfg_id: 1,
                timer_type: 2,
            },
            execution_type: 3,
            start_timestamp: None,
            end_timestamp: Some(1_500),
            last_timestamp: None,
            last_end_timestamp: None,
            next_timestamp: Some(1_300),
            next_end_timestamp: Some(1_400),
            offsets: Vec::new(),
            duration_ms: None,
        };
        assert_eq!(
            game_timer_deadline(&timer, 1_000, MonoTimeMs(10_000)),
            Some(MonoTimeMs(10_300))
        );
        assert_eq!(
            game_timer_deadline_after(&timer, 1_300, MonoTimeMs(10_300), DeadlineBound::Exclusive,),
            Some(MonoTimeMs(10_400))
        );
        assert_eq!(
            game_timer_deadline_after(&timer, 1_400, MonoTimeMs(10_400), DeadlineBound::Exclusive,),
            Some(MonoTimeMs(10_500))
        );
        assert_eq!(
            game_timer_deadline_after(&timer, 1_500, MonoTimeMs(10_500), DeadlineBound::Exclusive,),
            None
        );
    }

    #[test]
    fn batch_hp_shadow_clamps_healing_in_protocol_order() {
        let target_uuid = EntityUuid(30);
        let meta = EventMeta {
            batch_id: BatchId(1),
            capture_sequence: 1,
            stream_id: 1,
            stream_epoch: 1,
            captured_wall_ms: 1_000,
            captured_mono_ns: 1_000_000,
            source_time_ms: None,
        };
        let observed_hit = |kind, amount, has_loss_breakdown, hp_loss| {
            ProtocolObservation::HitResolved(ObservedHit {
                channel: HitChannel::ToMe,
                source_uuid: None,
                source_owner_uuid: None,
                target_uuid,
                skill_key: 1,
                skill_id: Some(1),
                type_flags: 0,
                kind,
                amount,
                has_loss_breakdown,
                hp_loss,
                shield_loss: 0,
                is_lucky_bonus_only: false,
                property: None,
                damage_mode: None,
                effective_amount: None,
            })
        };
        let batch = ProtocolBatch {
            meta,
            observations: vec![
                ProtocolObservation::EntityAppeared {
                    uuid: target_uuid,
                    kind: EntityKind::Monster,
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: target_uuid,
                    attr_id: attr_type::ATTR_CURRENT_HP,
                    value: AttributeValue::Int(90),
                    origin: ObservationOrigin::Snapshot,
                },
                ProtocolObservation::AttributeUpdated {
                    uuid: target_uuid,
                    attr_id: attr_type::ATTR_MAX_HP,
                    value: AttributeValue::Int(100),
                    origin: ObservationOrigin::Snapshot,
                },
                observed_hit(HitKind::Damage, 30, true, 30),
                observed_hit(HitKind::Healing, 50, false, 0),
                observed_hit(HitKind::Healing, 20, false, 0),
            ],
        };

        let mut entities = EntityContext::new();
        let mut hp_shadow = BatchHpShadow::from_batch(&entities, &batch);
        let events = entities.apply_batch(batch);
        let mut effective_heals = Vec::new();
        for envelope in events {
            hp_shadow.observe_event(&envelope.event);
            if let DomainEvent::HitResolved(mut hit) = envelope.event {
                hp_shadow.apply_accepted_hit(&mut hit);
                if hit.kind == HitKind::Healing {
                    effective_heals.push(hit.effective_amount);
                }
            }
        }

        assert_eq!(effective_heals, vec![Some(40), Some(0)]);
    }
}
