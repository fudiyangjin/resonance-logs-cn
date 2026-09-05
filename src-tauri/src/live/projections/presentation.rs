//! Replace-only live topic composition from incremental projection DTOs.

use crate::live::counter::engine::CounterSnapshot;
use crate::live::ipc::models::{
    BuffCoverageEntry, DeathRecord, LiveBuffsPayload, LiveCombatPayload, LiveDataPayload,
    LiveDeathsPayload, LiveDisplayClock, LiveFantasyPayload, LiveMonsterPayload, LiveScenePayload,
    LiveStatusPayload, TeammateFantasyState, TrainingDummyPhase, TrainingDummyState,
};
use crate::live::projections::entity_monitor::EntityMonitorSnapshot;
use crate::live::runtime::events::{LocalTalent, SegmentId};
use crate::live::runtime::segment::{IdleMode, RecordingMode, SegmentState};

/// A live, in-progress combat payload paired with the segment it belongs to.
/// Callers derive this straight from [`CombatProjection`] (`segment_id()` /
/// `payload()`), so a live segment and its payload can never disagree about
/// which segment is active — unlike the old `Option<LiveDataPayload>` +
/// separately tracked id, which relied on an `expect()` to stay in sync.
///
/// [`CombatProjection`]: crate::live::projections::combat::projection::CombatProjection
#[derive(Debug, Clone)]
pub struct ActiveCombat {
    pub segment_id: SegmentId,
    pub payload: LiveDataPayload,
    pub clock: LiveDisplayClock,
}

#[derive(Debug, Default)]
pub struct PresentationProjection {
    combat_revision: u64,
    status_revision: u64,
    buffs_revision: u64,
    monster_revision: u64,
    fantasy_revision: u64,
    deaths_revision: u64,
    scene_revision: u64,
    displayed_segment_id: Option<SegmentId>,
    displayed_combat: Option<LiveDataPayload>,
    displayed_clock: Option<LiveDisplayClock>,
    displayed_deaths: Option<Vec<DeathRecord>>,
    displayed_fantasies: Option<Vec<TeammateFantasyState>>,
    displayed_coverage: Option<Vec<BuffCoverageEntry>>,
}

impl PresentationProjection {
    pub fn segment_started(&mut self, segment_id: SegmentId) {
        self.displayed_segment_id = Some(segment_id);
        self.displayed_combat = None;
        self.displayed_clock = None;
        self.displayed_deaths = None;
        self.displayed_fantasies = None;
        self.displayed_coverage = None;
    }

    /// Freezes only the combat (meter) payload. Counters are not segment
    /// scoped, so the status payload always reflects the live engine.
    pub fn freeze_segment(
        &mut self,
        segment_id: SegmentId,
        combat: LiveDataPayload,
        clock: LiveDisplayClock,
    ) {
        if self.displayed_segment_id == Some(segment_id) {
            self.displayed_combat = Some(combat);
            self.displayed_clock = Some(clock);
        }
    }

    /// Holds coverage metrics from the just-ended segment and forces every
    /// row inactive so the HUD cannot keep showing an in-flight buff.
    pub fn freeze_coverage(&mut self, segment_id: SegmentId, coverage: Vec<BuffCoverageEntry>) {
        if self.displayed_segment_id == Some(segment_id) {
            self.displayed_coverage = Some(deactivate_coverage(coverage));
        }
    }

    pub fn clear_display(&mut self) {
        self.displayed_segment_id = None;
        self.displayed_combat = None;
        self.displayed_clock = None;
        self.displayed_deaths = None;
        self.displayed_fantasies = None;
        self.displayed_coverage = None;
    }

    /// Snapshots death/fantasy display before a runtime wipe. Only fills empty
    /// slots so a second container resync cannot overwrite a freeze with `[]`.
    pub fn hold_runtime_display(
        &mut self,
        deaths: Vec<DeathRecord>,
        fantasies: Vec<TeammateFantasyState>,
    ) {
        if self.displayed_segment_id.is_none() {
            return;
        }
        if self.displayed_deaths.is_none() {
            self.displayed_deaths = Some(deaths);
        }
        if self.displayed_fantasies.is_none() {
            self.displayed_fantasies = Some(fantasies);
        }
    }

    /// Builds a combat payload and advances its revision (publication path).
    pub fn take_combat_payload(
        &mut self,
        active_combat: Option<ActiveCombat>,
        segment_state: &SegmentState,
    ) -> LiveCombatPayload {
        self.combat_revision = self.combat_revision.saturating_add(1);
        self.combat_payload(active_combat, segment_state)
    }

    /// Read-only combat payload for command-side bootstrap.
    #[must_use]
    #[cfg(test)]
    pub fn peek_combat_payload(
        &self,
        active_combat: Option<ActiveCombat>,
        segment_state: &SegmentState,
    ) -> LiveCombatPayload {
        self.combat_payload(active_combat, segment_state)
    }

    pub fn take_status_payload(
        &mut self,
        monitored: &EntityMonitorSnapshot,
        counters: CounterSnapshot,
    ) -> LiveStatusPayload {
        self.status_revision = self.status_revision.saturating_add(1);
        self.status_payload(monitored, counters)
    }

    #[must_use]
    #[cfg(test)]
    pub fn peek_status_payload(
        &self,
        monitored: &EntityMonitorSnapshot,
        counters: CounterSnapshot,
    ) -> LiveStatusPayload {
        self.status_payload(monitored, counters)
    }

    pub fn take_buffs_payload(
        &mut self,
        monitored: &EntityMonitorSnapshot,
        coverage: Vec<BuffCoverageEntry>,
        active: bool,
    ) -> LiveBuffsPayload {
        self.buffs_revision = self.buffs_revision.saturating_add(1);
        let mut payload = self.buffs_payload(monitored);
        payload.coverage = self.coverage_rows(coverage, active);
        payload
    }

    pub fn take_monster_payload(
        &mut self,
        monitored: &EntityMonitorSnapshot,
    ) -> LiveMonsterPayload {
        self.monster_revision = self.monster_revision.saturating_add(1);
        self.monster_payload(monitored)
    }

    pub fn take_fantasy_payload(
        &mut self,
        active: bool,
        monitored: &EntityMonitorSnapshot,
    ) -> LiveFantasyPayload {
        self.fantasy_revision = self.fantasy_revision.saturating_add(1);
        self.fantasy_payload(active, monitored)
    }

    /// Read-only fantasy payload for command-side bootstrap.
    #[must_use]
    #[cfg(test)]
    pub fn peek_fantasy_payload(
        &self,
        active: bool,
        monitored: &EntityMonitorSnapshot,
    ) -> LiveFantasyPayload {
        self.fantasy_payload(active, monitored)
    }

    /// Builds a deaths payload and advances its revision (publication path).
    pub fn take_deaths_payload(
        &mut self,
        active: bool,
        deaths: Vec<DeathRecord>,
    ) -> LiveDeathsPayload {
        self.deaths_revision = self.deaths_revision.saturating_add(1);
        self.deaths_payload(active, deaths)
    }

    /// Read-only deaths payload for command-side bootstrap.
    #[must_use]
    #[cfg(test)]
    pub fn peek_deaths_payload(&self, active: bool, deaths: Vec<DeathRecord>) -> LiveDeathsPayload {
        self.deaths_payload(active, deaths)
    }

    /// Builds a scene payload and advances its revision (publication path).
    pub fn take_scene_payload(
        &mut self,
        scene_id: Option<i32>,
        dungeon_difficulty: Option<i32>,
        local_talent: LocalTalent,
    ) -> LiveScenePayload {
        self.scene_revision = self.scene_revision.saturating_add(1);
        self.scene_payload(scene_id, dungeon_difficulty, local_talent)
    }

    /// Read-only scene payload for command-side bootstrap.
    #[must_use]
    #[cfg(test)]
    pub fn peek_scene_payload(
        &self,
        scene_id: Option<i32>,
        dungeon_difficulty: Option<i32>,
        local_talent: LocalTalent,
    ) -> LiveScenePayload {
        self.scene_payload(scene_id, dungeon_difficulty, local_talent)
    }

    fn combat_payload(
        &self,
        active_combat: Option<ActiveCombat>,
        segment_state: &SegmentState,
    ) -> LiveCombatPayload {
        let (active_segment_id, combat, display_clock) = match active_combat {
            Some(active) => (
                Some(active.segment_id),
                Some(active.payload),
                Some(active.clock),
            ),
            None => (None, self.displayed_combat.clone(), self.displayed_clock),
        };
        LiveCombatPayload {
            revision: self.combat_revision,
            active_segment_id: active_segment_id.map(|segment| segment.0),
            displayed_segment_id: self.displayed_segment_id.map(|segment| segment.0),
            combat,
            display_clock,
            training: TrainingDummyState {
                phase: training_phase(segment_state),
            },
        }
    }

    fn status_payload(
        &self,
        monitored: &EntityMonitorSnapshot,
        counters: CounterSnapshot,
    ) -> LiveStatusPayload {
        LiveStatusPayload {
            revision: self.status_revision,
            counters: counters.counters,
            factor_counters: counters.factor_counters,
            factor_source_item_ids: counters.factor_source_item_ids,
            factor_slot_item_ids: counters.factor_slot_item_ids,
            season_id: counters.season_id,
            season_active_template_ids: counters.season_active_template_ids,
            skill_cds: monitored.skill_cds.clone(),
            panel_attrs: monitored.panel_attrs.clone(),
            shield_current_hp: monitored.shield_current_hp,
            shield_max_hp: monitored.shield_max_hp,
            shield_entries: monitored.shield_entries.clone(),
            fight_resource: monitored.fight_resource.clone(),
        }
    }

    fn coverage_rows(&self, live: Vec<BuffCoverageEntry>, active: bool) -> Vec<BuffCoverageEntry> {
        if active {
            live
        } else {
            deactivate_coverage(self.displayed_coverage.clone().unwrap_or(live))
        }
    }

    fn buffs_payload(&self, monitored: &EntityMonitorSnapshot) -> LiveBuffsPayload {
        LiveBuffsPayload {
            revision: self.buffs_revision,
            local_buffs: monitored.local_buffs.clone(),
            coverage: Vec::new(),
        }
    }

    fn monster_payload(&self, monitored: &EntityMonitorSnapshot) -> LiveMonsterPayload {
        LiveMonsterPayload {
            revision: self.monster_revision,
            boss_buffs: monitored.boss_buffs.clone(),
            teammate_buffs: monitored.teammate_buffs.clone(),
            boss_mechanics: monitored.boss_mechanics.clone(),
            hate_lists: monitored.hate_lists.clone(),
            stun: monitored.stun.clone(),
            hp: monitored.hp.clone(),
            player_names: monitored.player_names.clone(),
            monster_ids: monitored.monster_ids.clone(),
        }
    }

    fn fantasy_payload(
        &self,
        active: bool,
        monitored: &EntityMonitorSnapshot,
    ) -> LiveFantasyPayload {
        let teammate_fantasies = if active {
            monitored.teammate_fantasies.clone()
        } else {
            self.displayed_fantasies
                .clone()
                .unwrap_or_else(|| monitored.teammate_fantasies.clone())
        };
        LiveFantasyPayload {
            revision: self.fantasy_revision,
            teammate_fantasies,
        }
    }

    fn deaths_payload(&self, active: bool, live: Vec<DeathRecord>) -> LiveDeathsPayload {
        let deaths = if active {
            live
        } else {
            self.displayed_deaths.clone().unwrap_or(live)
        };
        LiveDeathsPayload {
            revision: self.deaths_revision,
            deaths,
        }
    }

    fn scene_payload(
        &self,
        scene_id: Option<i32>,
        dungeon_difficulty: Option<i32>,
        local_talent: LocalTalent,
    ) -> LiveScenePayload {
        LiveScenePayload {
            revision: self.scene_revision,
            scene_id,
            dungeon_difficulty,
            local_class_id: local_talent.profession_id,
            local_talent_stage_cfg_id: local_talent.talent_stage_cfg_id,
        }
    }
}

fn deactivate_coverage(mut coverage: Vec<BuffCoverageEntry>) -> Vec<BuffCoverageEntry> {
    for entry in &mut coverage {
        entry.active_now = false;
        entry.layer = 0;
    }
    coverage
}

fn training_phase(state: &SegmentState) -> TrainingDummyPhase {
    match state {
        SegmentState::Idle {
            mode: IdleMode::Standard,
        }
        | SegmentState::Recording {
            mode:
                RecordingMode::Standard {
                    training_armed: false,
                    ..
                },
            ..
        } => TrainingDummyPhase::Idle,
        SegmentState::Idle {
            mode: IdleMode::TrainingArmed,
        }
        | SegmentState::Recording {
            mode:
                RecordingMode::Standard {
                    training_armed: true,
                    ..
                },
            ..
        } => TrainingDummyPhase::Armed,
        SegmentState::Recording {
            mode: RecordingMode::Training { .. },
            ..
        } => TrainingDummyPhase::Running,
        SegmentState::FrozenTraining { .. } => TrainingDummyPhase::Finished,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::projections::entity_monitor::EntityMonitorSnapshot;
    use crate::live::runtime::events::{EntityRef, EntityUuid, MonoTimeMs};
    use crate::live::runtime::segment::{ActiveSegment, BoundaryState};

    #[test]
    fn peek_does_not_advance_revision() {
        let mut presentation = PresentationProjection::default();
        let monitored = EntityMonitorSnapshot::default();
        let first = presentation.take_status_payload(&monitored, CounterSnapshot::default());
        assert_eq!(first.revision, 1);
        let peeked = presentation.peek_status_payload(&monitored, CounterSnapshot::default());
        assert_eq!(peeked.revision, 1);
        let second = presentation.take_status_payload(&monitored, CounterSnapshot::default());
        assert_eq!(second.revision, 2);
    }

    #[test]
    fn peek_deaths_does_not_advance_revision() {
        let mut presentation = PresentationProjection::default();
        let first = presentation.take_deaths_payload(true, Vec::new());
        assert_eq!(first.revision, 1);
        let peeked = presentation.peek_deaths_payload(true, Vec::new());
        assert_eq!(peeked.revision, 1);
        let second = presentation.take_deaths_payload(true, Vec::new());
        assert_eq!(second.revision, 2);
    }

    #[test]
    fn peek_scene_does_not_advance_revision() {
        let mut presentation = PresentationProjection::default();
        let talent = LocalTalent {
            profession_id: Some(4),
            talent_stage_cfg_id: Some(108),
        };
        let first = presentation.take_scene_payload(Some(101), Some(2), talent);
        assert_eq!(first.revision, 1);
        assert_eq!(first.scene_id, Some(101));
        assert_eq!(first.local_class_id, Some(4));
        assert_eq!(first.local_talent_stage_cfg_id, Some(108));
        let peeked = presentation.peek_scene_payload(Some(101), Some(2), talent);
        assert_eq!(peeked.revision, 1);
        let second = presentation.take_scene_payload(Some(101), Some(2), talent);
        assert_eq!(second.revision, 2);
    }

    fn idle_state() -> SegmentState {
        SegmentState::Idle {
            mode: IdleMode::Standard,
        }
    }

    fn recording_segment() -> ActiveSegment {
        ActiveSegment {
            id: SegmentId(1),
            started_at_mono_ms: MonoTimeMs(0),
            started_at_wall_ms: 0,
        }
    }

    fn dummy_target() -> EntityRef {
        EntityRef {
            uuid: EntityUuid(22),
            generation: 1,
        }
    }

    #[test]
    fn training_phase_maps_every_segment_state() {
        let recording = recording_segment();
        let target = dummy_target();
        let cases = [
            (
                SegmentState::Idle {
                    mode: IdleMode::Standard,
                },
                TrainingDummyPhase::Idle,
            ),
            (
                SegmentState::Idle {
                    mode: IdleMode::TrainingArmed,
                },
                TrainingDummyPhase::Armed,
            ),
            (
                SegmentState::Recording {
                    segment: recording,
                    mode: RecordingMode::Standard {
                        boundary: BoundaryState::Clear,
                        training_armed: false,
                    },
                },
                TrainingDummyPhase::Idle,
            ),
            (
                SegmentState::Recording {
                    segment: recording,
                    mode: RecordingMode::Standard {
                        boundary: BoundaryState::Clear,
                        training_armed: true,
                    },
                },
                TrainingDummyPhase::Armed,
            ),
            (
                SegmentState::Recording {
                    segment: recording,
                    mode: RecordingMode::Training {
                        target,
                        monster_id: 115,
                        deadline: MonoTimeMs(183_000),
                    },
                },
                TrainingDummyPhase::Running,
            ),
            (
                SegmentState::FrozenTraining {
                    segment: recording,
                    target,
                    monster_id: 115,
                    ended_at_mono_ms: MonoTimeMs(183_000),
                    ended_at_wall_ms: 183_000,
                },
                TrainingDummyPhase::Finished,
            ),
        ];

        for (state, expected) in cases {
            assert_eq!(training_phase(&state), expected, "{state:?}");
        }
    }

    fn payload_with_total_dmg(total_dmg: &str) -> LiveDataPayload {
        LiveDataPayload {
            total_dmg: total_dmg.to_string(),
            ..LiveDataPayload::default()
        }
    }

    fn frozen_clock() -> LiveDisplayClock {
        LiveDisplayClock {
            started_at_wall_ms: 1_000,
            accumulated_paused_ms: 0,
            paused_at_wall_ms: None,
            ended_at_wall_ms: Some(4_000),
        }
    }

    fn live_clock() -> LiveDisplayClock {
        LiveDisplayClock {
            started_at_wall_ms: 5_000,
            accumulated_paused_ms: 0,
            paused_at_wall_ms: None,
            ended_at_wall_ms: None,
        }
    }

    /// A container resync ends the segment (freezing its combat payload) but
    /// never runs `CombatProjection::start_segment` again on its own, so
    /// there is no active combat to report until the next real segment
    /// starts. The frozen payload from the just-ended segment must stay
    /// visible in the meantime, exactly as it did before the resync.
    #[test]
    fn frozen_segment_stays_visible_without_an_active_one() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        let frozen = payload_with_total_dmg("1234");
        presentation.freeze_segment(SegmentId(1), frozen.clone(), frozen_clock());

        let payload = presentation.take_combat_payload(None, &idle_state());

        assert_eq!(payload.active_segment_id, None);
        assert_eq!(payload.displayed_segment_id, Some(1));
        assert_eq!(
            payload.combat.map(|combat| combat.total_dmg),
            Some(frozen.total_dmg)
        );
        assert_eq!(payload.display_clock, Some(frozen_clock()));
    }

    /// Once a segment is actively recording again, its live payload must
    /// take priority over whatever was frozen from the previous one — the
    /// active/frozen distinction is derived entirely from the `Option`
    /// passed in by the caller, not from any state mirrored inside
    /// `PresentationProjection` itself.
    #[test]
    fn active_segment_payload_shadows_the_frozen_one() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.freeze_segment(SegmentId(1), payload_with_total_dmg("1234"), frozen_clock());

        let live = payload_with_total_dmg("5678");
        let active = ActiveCombat {
            segment_id: SegmentId(1),
            payload: live.clone(),
            clock: live_clock(),
        };

        let payload = presentation.take_combat_payload(Some(active), &idle_state());

        assert_eq!(payload.active_segment_id, Some(1));
        assert_eq!(
            payload.combat.map(|combat| combat.total_dmg),
            Some(live.total_dmg)
        );
        assert_eq!(payload.display_clock, Some(live_clock()));
    }

    #[test]
    fn clear_display_drops_the_frozen_clock() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.freeze_segment(SegmentId(1), payload_with_total_dmg("1234"), frozen_clock());
        presentation.clear_display();

        let payload = presentation.take_combat_payload(None, &idle_state());
        assert_eq!(payload.displayed_segment_id, None);
        assert_eq!(payload.display_clock, None);
    }

    fn death_record(uuid: &str) -> DeathRecord {
        DeathRecord {
            victim_entity_uuid: uuid.to_string(),
            death_timestamp_ms: "1000".to_string(),
            recent_damages: Vec::new(),
            victim_buffs: Vec::new(),
            participant_buffs: Vec::new(),
        }
    }

    fn fantasy_state(summon: &str) -> TeammateFantasyState {
        TeammateFantasyState {
            summon_uuid: summon.to_string(),
            summoner_uuid: "10".to_string(),
            summoner_name: Some("Alice".to_string()),
            monster_id: 900,
            resonance_skill_id: Some(77),
            remodel_level: 2,
            detected_at_ms: 1_000,
        }
    }

    fn monitored_with_fantasies(fantasies: Vec<TeammateFantasyState>) -> EntityMonitorSnapshot {
        EntityMonitorSnapshot {
            teammate_fantasies: fantasies,
            ..EntityMonitorSnapshot::default()
        }
    }

    #[test]
    fn held_runtime_display_is_used_when_inactive_and_live_is_empty() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.hold_runtime_display(vec![death_record("20")], vec![fantasy_state("30")]);

        let deaths = presentation.peek_deaths_payload(false, Vec::new());
        assert_eq!(deaths.deaths.len(), 1);
        assert_eq!(deaths.deaths[0].victim_entity_uuid, "20");

        let fantasy = presentation.peek_fantasy_payload(false, &EntityMonitorSnapshot::default());
        assert_eq!(fantasy.teammate_fantasies.len(), 1);
        assert_eq!(fantasy.teammate_fantasies[0].summon_uuid, "30");
    }

    #[test]
    fn active_segment_shadows_held_runtime_display() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.hold_runtime_display(vec![death_record("20")], vec![fantasy_state("30")]);

        let deaths = presentation.peek_deaths_payload(true, vec![death_record("21")]);
        assert_eq!(deaths.deaths[0].victim_entity_uuid, "21");

        let fantasy = presentation
            .peek_fantasy_payload(true, &monitored_with_fantasies(vec![fantasy_state("31")]));
        assert_eq!(fantasy.teammate_fantasies[0].summon_uuid, "31");
    }

    #[test]
    fn second_hold_does_not_overwrite_frozen_slots() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.hold_runtime_display(vec![death_record("20")], vec![fantasy_state("30")]);
        presentation.hold_runtime_display(Vec::new(), Vec::new());

        let deaths = presentation.peek_deaths_payload(false, Vec::new());
        assert_eq!(deaths.deaths[0].victim_entity_uuid, "20");
        let fantasy = presentation.peek_fantasy_payload(false, &EntityMonitorSnapshot::default());
        assert_eq!(fantasy.teammate_fantasies[0].summon_uuid, "30");
    }

    #[test]
    fn hold_is_a_noop_without_a_displayed_segment() {
        let mut presentation = PresentationProjection::default();
        presentation.hold_runtime_display(vec![death_record("20")], vec![fantasy_state("30")]);

        let deaths = presentation.peek_deaths_payload(false, Vec::new());
        assert!(deaths.deaths.is_empty());
        let fantasy = presentation.peek_fantasy_payload(false, &EntityMonitorSnapshot::default());
        assert!(fantasy.teammate_fantasies.is_empty());
    }

    #[test]
    fn clear_display_and_segment_started_drop_held_runtime_display() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.hold_runtime_display(vec![death_record("20")], vec![fantasy_state("30")]);
        presentation.clear_display();

        let deaths = presentation.peek_deaths_payload(false, Vec::new());
        assert!(deaths.deaths.is_empty());
        let fantasy = presentation.peek_fantasy_payload(false, &EntityMonitorSnapshot::default());
        assert!(fantasy.teammate_fantasies.is_empty());

        presentation.segment_started(SegmentId(1));
        presentation.hold_runtime_display(vec![death_record("20")], vec![fantasy_state("30")]);
        presentation.segment_started(SegmentId(2));

        let deaths = presentation.peek_deaths_payload(false, Vec::new());
        assert!(deaths.deaths.is_empty());
        let fantasy = presentation.peek_fantasy_payload(false, &EntityMonitorSnapshot::default());
        assert!(fantasy.teammate_fantasies.is_empty());
    }

    fn coverage_entry(active_now: bool) -> BuffCoverageEntry {
        BuffCoverageEntry {
            base_id: 2_201,
            covered_ms: 1_500,
            active_ms: 2_000,
            active_now,
            layer: 2,
            count: 3,
        }
    }

    fn collapsed_live_coverage() -> BuffCoverageEntry {
        BuffCoverageEntry {
            base_id: 2_201,
            covered_ms: 0,
            active_ms: 0,
            active_now: true,
            layer: 9,
            count: 99,
        }
    }

    #[test]
    fn freeze_coverage_keeps_metrics_and_forces_inactive() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.freeze_coverage(SegmentId(1), vec![coverage_entry(true)]);

        let payload = presentation.take_buffs_payload(
            &EntityMonitorSnapshot::default(),
            vec![collapsed_live_coverage()],
            false,
        );
        assert_eq!(payload.coverage.len(), 1);
        assert_eq!(payload.coverage[0].covered_ms, 1_500);
        assert_eq!(payload.coverage[0].active_ms, 2_000);
        assert_eq!(payload.coverage[0].count, 3);
        assert!(!payload.coverage[0].active_now);
        assert_eq!(payload.coverage[0].layer, 0);
    }

    #[test]
    fn inactive_fallback_still_deactivates_live_coverage() {
        let mut presentation = PresentationProjection::default();
        let payload = presentation.take_buffs_payload(
            &EntityMonitorSnapshot::default(),
            vec![coverage_entry(true)],
            false,
        );
        assert!(!payload.coverage[0].active_now);
        assert_eq!(payload.coverage[0].layer, 0);
        assert_eq!(payload.coverage[0].covered_ms, 1_500);
    }

    #[test]
    fn active_coverage_shadows_the_frozen_one() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.freeze_coverage(SegmentId(1), vec![coverage_entry(true)]);

        let live = BuffCoverageEntry {
            covered_ms: 100,
            ..coverage_entry(true)
        };
        let payload = presentation.take_buffs_payload(
            &EntityMonitorSnapshot::default(),
            vec![live.clone()],
            true,
        );
        assert_eq!(payload.coverage[0].covered_ms, 100);
        assert!(payload.coverage[0].active_now);
        assert_eq!(payload.coverage[0].layer, 2);
    }

    #[test]
    fn clear_display_and_segment_started_drop_frozen_coverage() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.freeze_coverage(SegmentId(1), vec![coverage_entry(true)]);
        presentation.clear_display();

        let payload =
            presentation.take_buffs_payload(&EntityMonitorSnapshot::default(), Vec::new(), false);
        assert!(payload.coverage.is_empty());

        presentation.segment_started(SegmentId(1));
        presentation.freeze_coverage(SegmentId(1), vec![coverage_entry(true)]);
        presentation.segment_started(SegmentId(2));

        let payload =
            presentation.take_buffs_payload(&EntityMonitorSnapshot::default(), Vec::new(), false);
        assert!(payload.coverage.is_empty());
    }

    #[test]
    fn freeze_coverage_ignores_a_mismatched_segment() {
        let mut presentation = PresentationProjection::default();
        presentation.segment_started(SegmentId(1));
        presentation.freeze_coverage(SegmentId(2), vec![coverage_entry(true)]);

        let payload =
            presentation.take_buffs_payload(&EntityMonitorSnapshot::default(), Vec::new(), false);
        assert!(payload.coverage.is_empty());
    }
}
