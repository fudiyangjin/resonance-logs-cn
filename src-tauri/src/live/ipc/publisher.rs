//! Read-optimized publication cache for WebView pull clients.
//!
//! `LiveCore` remains the only writer of domain state. It builds publications
//! on its existing cadence and moves them into this cache. Tauri commands read
//! the cache directly instead of entering the runtime control channel, whose
//! fence intentionally pauses packet capture for state-changing commands.

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use parking_lot::RwLock;

use super::models::{
    HudFrame, HudFrameRequest, LiveBuffsPayload, LiveCombatPayload, LiveDeathsPayload,
    LiveFantasyPayload, LiveMonsterPayload, LivePullWindow, LiveScenePayload, LiveStatusPayload,
    LiveTeamPayload, LiveWindowFrame, LiveWindowFrameRequest, MinimapSkillCast, MinimapSnapshot,
    MinimapSnapshotUpdate, MinimapUpdatePayload,
};
use crate::live::projection_set::TopicPublication;

const MINIMAP_CAST_RING_CAPACITY: usize = 512;
static NEXT_CACHE_EPOCH: AtomicU64 = AtomicU64::new(1);

trait Revisioned {
    fn revision(&self) -> u64;
}

macro_rules! impl_revisioned {
    ($($ty:ty),+ $(,)?) => {
        $(
            impl Revisioned for $ty {
                fn revision(&self) -> u64 {
                    self.revision
                }
            }
        )+
    };
}

impl_revisioned!(
    LiveCombatPayload,
    LiveStatusPayload,
    LiveBuffsPayload,
    LiveMonsterPayload,
    LiveFantasyPayload,
    LiveDeathsPayload,
    LiveScenePayload,
    LiveTeamPayload,
);

#[derive(Debug, Clone)]
struct SequencedCast {
    sequence: u64,
    cast: Arc<MinimapSkillCast>,
}

#[derive(Debug, Default)]
struct MinimapSlot {
    published: bool,
    snapshot_revision: u64,
    snapshot: Option<Arc<MinimapSnapshot>>,
    cast_sequence: u64,
    casts: VecDeque<SequencedCast>,
}

#[derive(Debug)]
struct PublishedState {
    epoch: u64,
    combat: Option<Arc<LiveCombatPayload>>,
    status: Option<Arc<LiveStatusPayload>>,
    buffs: Option<Arc<LiveBuffsPayload>>,
    monster: Option<Arc<LiveMonsterPayload>>,
    fantasy: Option<Arc<LiveFantasyPayload>>,
    deaths: Option<Arc<LiveDeathsPayload>>,
    scene: Option<Arc<LiveScenePayload>>,
    team: Option<Arc<LiveTeamPayload>>,
    minimap: MinimapSlot,
}

impl PublishedState {
    fn new() -> Self {
        let epoch = NEXT_CACHE_EPOCH.fetch_add(1, Ordering::Relaxed).max(1);
        Self {
            epoch,
            combat: None,
            status: None,
            buffs: None,
            monster: None,
            fantasy: None,
            deaths: None,
            scene: None,
            team: None,
            minimap: MinimapSlot::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LivePublicationCache {
    inner: Arc<RwLock<PublishedState>>,
    activity: Arc<PullActivity>,
}

#[derive(Debug)]
struct PullActivity {
    live: AtomicBool,
    hud_overlay: AtomicBool,
}

impl Default for PullActivity {
    fn default() -> Self {
        Self {
            live: AtomicBool::new(true),
            hud_overlay: AtomicBool::new(false),
        }
    }
}

impl Default for LivePublicationCache {
    fn default() -> Self {
        Self::new()
    }
}

impl LivePublicationCache {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(PublishedState::new())),
            activity: Arc::new(PullActivity::default()),
        }
    }

    pub fn set_window_active(&self, window: LivePullWindow, active: bool) -> bool {
        self.activity.slot(window).swap(active, Ordering::AcqRel) != active
    }

    #[must_use]
    pub fn is_window_active(&self, window: LivePullWindow) -> bool {
        self.activity.slot(window).load(Ordering::Acquire)
    }

    /// Moves runtime publications into their latest-value slots. Scene is also
    /// returned to the caller because it remains the one low-frequency event.
    pub fn publish(
        &self,
        publications: impl IntoIterator<Item = TopicPublication>,
    ) -> Option<LiveScenePayload> {
        let mut state = self.inner.write();
        let mut scene_event = None;

        for publication in publications {
            match publication {
                TopicPublication::Combat(payload) => state.combat = Some(Arc::new(payload)),
                TopicPublication::Status(payload) => state.status = Some(Arc::new(payload)),
                TopicPublication::Buffs(payload) => state.buffs = Some(Arc::new(payload)),
                TopicPublication::Monster(payload) => state.monster = Some(Arc::new(payload)),
                TopicPublication::Fantasy(payload) => state.fantasy = Some(Arc::new(payload)),
                TopicPublication::Deaths(payload) => state.deaths = Some(Arc::new(payload)),
                TopicPublication::Team(payload) => state.team = Some(Arc::new(payload)),
                TopicPublication::Scene(payload) => {
                    state.scene = Some(Arc::new(payload.clone()));
                    scene_event = Some(payload);
                }
                TopicPublication::Minimap(payload) => publish_minimap(&mut state.minimap, payload),
            }
        }

        scene_event
    }

    #[must_use]
    pub fn pull_live_window(
        &self,
        request: &LiveWindowFrameRequest,
        active: bool,
    ) -> LiveWindowFrame {
        let (epoch, combat, fantasy, deaths) = {
            let state = self.inner.read();
            if !active {
                return LiveWindowFrame {
                    active: false,
                    epoch: state.epoch,
                    ..LiveWindowFrame::default()
                };
            }
            let reset = request.epoch != Some(state.epoch);
            (
                state.epoch,
                changed(&state.combat, request.combat_revision, reset),
                changed(&state.fantasy, request.fantasy_revision, reset),
                request
                    .include_deaths
                    .then(|| changed(&state.deaths, request.deaths_revision, reset))
                    .flatten(),
            )
        };

        LiveWindowFrame {
            active: true,
            epoch,
            combat: clone_payload(combat),
            fantasy: clone_payload(fantasy),
            deaths: clone_payload(deaths),
        }
    }

    #[must_use]
    pub fn pull_hud(&self, request: &HudFrameRequest, active: bool) -> HudFrame {
        let (
            epoch,
            status,
            buffs,
            monster,
            fantasy,
            team,
            snapshot,
            skill_casts,
            skill_cast_cursor,
            casts_reset,
        ) = {
            let state = self.inner.read();
            let epoch = state.epoch;
            let skill_cast_cursor = state.minimap.cast_sequence;
            if !active {
                return HudFrame {
                    active: false,
                    epoch,
                    skill_cast_cursor,
                    ..HudFrame::default()
                };
            }

            let reset_epoch = request.epoch != Some(epoch);
            let status = request
                .game_interest
                .then(|| changed(&state.status, request.status_revision, reset_epoch))
                .flatten();
            let buffs = request
                .game_interest
                .then(|| changed(&state.buffs, request.buffs_revision, reset_epoch))
                .flatten();
            let monster = request
                .monster_interest
                .then(|| changed(&state.monster, request.monster_revision, reset_epoch))
                .flatten();
            let fantasy = request
                .monster_interest
                .then(|| changed(&state.fantasy, request.fantasy_revision, reset_epoch))
                .flatten();
            let team = request
                .monster_interest
                .then(|| changed(&state.team, request.team_revision, reset_epoch))
                .flatten();

            let minimap = &state.minimap;
            let initial_cast_cursor = reset_epoch || request.skill_cast_cursor.is_none();
            let mut casts_reset = false;
            let mut skill_casts = Vec::new();

            if request.minimap_interest && !initial_cast_cursor {
                let cursor = request.skill_cast_cursor.unwrap_or_default();
                let oldest_valid_cursor = minimap
                    .casts
                    .front()
                    .map_or(skill_cast_cursor, |entry| entry.sequence.saturating_sub(1));
                if cursor < oldest_valid_cursor || cursor > skill_cast_cursor {
                    casts_reset = true;
                } else {
                    skill_casts.extend(
                        minimap
                            .casts
                            .iter()
                            .filter(|entry| entry.sequence > cursor)
                            .map(|entry| Arc::clone(&entry.cast)),
                    );
                }
            }

            let snapshot_changed = request.minimap_interest
                && minimap.published
                && (initial_cast_cursor
                    || casts_reset
                    || request.snapshot_revision != Some(minimap.snapshot_revision));
            let snapshot = snapshot_changed.then(|| {
                (
                    minimap.snapshot_revision,
                    minimap.snapshot.as_ref().map(Arc::clone),
                )
            });

            (
                epoch,
                status,
                buffs,
                monster,
                fantasy,
                team,
                snapshot,
                skill_casts,
                skill_cast_cursor,
                casts_reset,
            )
        };

        HudFrame {
            active: true,
            epoch,
            status: clone_payload(status),
            buffs: clone_payload(buffs),
            monster: clone_payload(monster),
            fantasy: clone_payload(fantasy),
            team: clone_payload(team),
            snapshot: snapshot.map(|(revision, snapshot)| MinimapSnapshotUpdate {
                revision,
                snapshot: snapshot.map(|snapshot| (*snapshot).clone()),
            }),
            skill_casts: skill_casts
                .into_iter()
                .map(|cast| (*cast).clone())
                .collect(),
            skill_cast_cursor,
            casts_reset,
        }
    }

    #[must_use]
    pub fn current_status(&self) -> LiveStatusPayload {
        self.inner
            .read()
            .status
            .as_deref()
            .cloned()
            .unwrap_or_default()
    }

    #[must_use]
    pub fn current_scene(&self) -> LiveScenePayload {
        self.inner
            .read()
            .scene
            .as_deref()
            .cloned()
            .unwrap_or_default()
    }
}

impl PullActivity {
    fn slot(&self, window: LivePullWindow) -> &AtomicBool {
        match window {
            LivePullWindow::Live => &self.live,
            LivePullWindow::HudOverlay => &self.hud_overlay,
        }
    }
}

fn publish_minimap(slot: &mut MinimapSlot, payload: MinimapUpdatePayload) {
    let previous_scene = slot.snapshot.as_deref().map(|snapshot| snapshot.scene_id);
    let next_scene = payload.snapshot.as_ref().map(|snapshot| snapshot.scene_id);
    if previous_scene != next_scene {
        slot.casts.clear();
    }

    slot.published = true;
    slot.snapshot_revision = slot.snapshot_revision.saturating_add(1);
    slot.snapshot = payload.snapshot.map(Arc::new);

    for cast in payload.skill_casts {
        slot.cast_sequence = slot.cast_sequence.saturating_add(1);
        slot.casts.push_back(SequencedCast {
            sequence: slot.cast_sequence,
            cast: Arc::new(cast),
        });
        if slot.casts.len() > MINIMAP_CAST_RING_CAPACITY {
            slot.casts.pop_front();
        }
    }
}

fn changed<T: Revisioned>(
    slot: &Option<Arc<T>>,
    client_revision: Option<u64>,
    reset: bool,
) -> Option<Arc<T>> {
    slot.as_ref()
        .filter(|payload| reset || client_revision != Some(payload.revision()))
        .map(Arc::clone)
}

fn clone_payload<T: Clone>(payload: Option<Arc<T>>) -> Option<T> {
    payload.map(|payload| (*payload).clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cast(skill_id: i32) -> MinimapSkillCast {
        MinimapSkillCast {
            entity_uuid: "caster".to_string(),
            skill_id,
            time_ms: i64::from(skill_id),
            x: None,
            z: None,
            facing: None,
        }
    }

    fn minimap(scene_id: i32, casts: Vec<MinimapSkillCast>) -> MinimapUpdatePayload {
        MinimapUpdatePayload {
            snapshot: Some(MinimapSnapshot {
                scene_id,
                ..MinimapSnapshot::default()
            }),
            skill_casts: casts,
        }
    }

    #[test]
    fn window_pull_only_returns_changed_domains() {
        let cache = LivePublicationCache::new();
        let mut combat = LiveCombatPayload::default();
        combat.revision = 3;
        let mut fantasy = LiveFantasyPayload::default();
        fantasy.revision = 7;
        cache.publish([
            TopicPublication::Combat(combat),
            TopicPublication::Fantasy(fantasy),
        ]);

        let first = cache.pull_live_window(&LiveWindowFrameRequest::default(), true);
        assert!(first.combat.is_some());
        assert!(first.fantasy.is_some());

        let unchanged = cache.pull_live_window(
            &LiveWindowFrameRequest {
                epoch: Some(first.epoch),
                combat_revision: Some(3),
                fantasy_revision: Some(7),
                ..LiveWindowFrameRequest::default()
            },
            true,
        );
        assert!(unchanged.combat.is_none());
        assert!(unchanged.fantasy.is_none());
    }

    #[test]
    fn shared_topic_has_no_server_side_acknowledgement() {
        let cache = LivePublicationCache::new();
        let mut fantasy = LiveFantasyPayload::default();
        fantasy.revision = 9;
        cache.publish([TopicPublication::Fantasy(fantasy)]);

        let live = cache.pull_live_window(&LiveWindowFrameRequest::default(), true);
        let hud = cache.pull_hud(
            &HudFrameRequest {
                monster_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert_eq!(live.fantasy.unwrap().revision, 9);
        assert_eq!(hud.fantasy.unwrap().revision, 9);
    }

    #[test]
    fn hud_pull_respects_sparse_interests_and_revisions() {
        let cache = LivePublicationCache::new();
        let mut status = LiveStatusPayload::default();
        status.revision = 1;
        let mut buffs = LiveBuffsPayload::default();
        buffs.revision = 2;
        let mut monster = LiveMonsterPayload::default();
        monster.revision = 3;
        let mut fantasy = LiveFantasyPayload::default();
        fantasy.revision = 4;
        cache.publish([
            TopicPublication::Status(status),
            TopicPublication::Buffs(buffs),
            TopicPublication::Monster(monster),
            TopicPublication::Fantasy(fantasy),
            TopicPublication::Minimap(minimap(100, vec![cast(5)])),
        ]);

        let game = cache.pull_hud(
            &HudFrameRequest {
                game_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert_eq!(game.status.as_ref().map(|item| item.revision), Some(1));
        assert_eq!(game.buffs.as_ref().map(|item| item.revision), Some(2));
        assert!(game.monster.is_none());
        assert!(game.fantasy.is_none());
        assert!(game.snapshot.is_none());
        assert!(game.skill_casts.is_empty());
        assert_eq!(game.skill_cast_cursor, 1);

        let monster = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(game.epoch),
                status_revision: Some(0),
                buffs_revision: Some(0),
                monster_revision: Some(3),
                fantasy_revision: Some(0),
                snapshot_revision: Some(0),
                skill_cast_cursor: Some(0),
                monster_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(monster.status.is_none());
        assert!(monster.buffs.is_none());
        assert!(monster.monster.is_none());
        assert_eq!(monster.fantasy.as_ref().map(|item| item.revision), Some(4));
        assert!(monster.snapshot.is_none());
        assert!(monster.skill_casts.is_empty());
    }

    #[test]
    fn minimap_cursor_resume_skips_uninterested_casts_and_delivers_new_once() {
        let cache = LivePublicationCache::new();
        cache.publish([TopicPublication::Minimap(minimap(100, vec![cast(1)]))]);

        let initial = cache.pull_hud(
            &HudFrameRequest {
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(initial.snapshot.is_some());
        assert!(initial.skill_casts.is_empty());
        assert_eq!(initial.skill_cast_cursor, 1);

        cache.publish([TopicPublication::Minimap(minimap(100, vec![cast(2)]))]);
        let uninterested = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(initial.epoch),
                snapshot_revision: initial.snapshot.as_ref().map(|item| item.revision),
                skill_cast_cursor: Some(initial.skill_cast_cursor),
                minimap_interest: false,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(uninterested.snapshot.is_none());
        assert!(uninterested.skill_casts.is_empty());
        assert_eq!(uninterested.skill_cast_cursor, 2);

        cache.publish([TopicPublication::Minimap(minimap(100, vec![cast(3)]))]);
        let resumed = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(uninterested.epoch),
                snapshot_revision: initial.snapshot.as_ref().map(|item| item.revision),
                skill_cast_cursor: Some(uninterested.skill_cast_cursor),
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert_eq!(
            resumed
                .skill_casts
                .iter()
                .map(|item| item.skill_id)
                .collect::<Vec<_>>(),
            vec![3]
        );

        let repeated = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(resumed.epoch),
                snapshot_revision: resumed.snapshot.as_ref().map(|item| item.revision),
                skill_cast_cursor: Some(resumed.skill_cast_cursor),
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(repeated.skill_casts.is_empty());
    }

    #[test]
    fn minimap_scene_change_drops_previous_scene_but_keeps_new_casts() {
        let cache = LivePublicationCache::new();
        cache.publish([TopicPublication::Minimap(minimap(100, vec![cast(1)]))]);
        let initial = cache.pull_hud(
            &HudFrameRequest {
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );

        cache.publish([TopicPublication::Minimap(minimap(200, vec![cast(2)]))]);
        let changed = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(initial.epoch),
                snapshot_revision: initial.snapshot.as_ref().map(|item| item.revision),
                skill_cast_cursor: Some(initial.skill_cast_cursor),
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(!changed.casts_reset);
        assert_eq!(changed.skill_casts.len(), 1);
        assert_eq!(changed.skill_casts[0].skill_id, 2);
        assert_eq!(changed.snapshot.unwrap().snapshot.unwrap().scene_id, 200);
    }

    #[test]
    fn inactive_pull_returns_no_payload() {
        let cache = LivePublicationCache::new();
        let mut status = LiveStatusPayload::default();
        status.revision = 4;
        cache.publish([
            TopicPublication::Status(status),
            TopicPublication::Minimap(minimap(100, vec![cast(7)])),
        ]);

        let frame = cache.pull_hud(
            &HudFrameRequest {
                game_interest: true,
                monster_interest: true,
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            false,
        );
        assert!(!frame.active);
        assert!(frame.status.is_none());
        assert!(frame.buffs.is_none());
        assert!(frame.monster.is_none());
        assert!(frame.fantasy.is_none());
        assert!(frame.snapshot.is_none());
        assert!(frame.skill_casts.is_empty());
        assert_eq!(frame.skill_cast_cursor, 1);
    }

    #[test]
    fn pull_activity_defaults_match_window_startup_visibility() {
        let cache = LivePublicationCache::new();
        assert!(cache.is_window_active(LivePullWindow::Live));
        assert!(!cache.is_window_active(LivePullWindow::HudOverlay));

        cache.set_window_active(LivePullWindow::HudOverlay, true);
        assert!(cache.is_window_active(LivePullWindow::HudOverlay));
    }

    #[test]
    fn minimap_ring_overflow_resets_and_forces_snapshot() {
        let cache = LivePublicationCache::new();
        cache.publish([TopicPublication::Minimap(minimap(100, Vec::new()))]);
        let initial = cache.pull_hud(
            &HudFrameRequest {
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        let casts = (0..=MINIMAP_CAST_RING_CAPACITY)
            .map(|index| cast(index as i32))
            .collect();
        cache.publish([TopicPublication::Minimap(minimap(100, casts))]);

        let frame = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(initial.epoch),
                snapshot_revision: Some(2),
                skill_cast_cursor: Some(initial.skill_cast_cursor),
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(frame.casts_reset);
        assert!(frame.skill_casts.is_empty());
        assert!(frame.snapshot.is_some());
        assert_eq!(
            frame.skill_cast_cursor,
            (MINIMAP_CAST_RING_CAPACITY + 1) as u64
        );
    }

    #[test]
    fn minimap_epoch_reset_reissues_snapshot_without_replaying_history() {
        let cache = LivePublicationCache::new();
        cache.publish([TopicPublication::Minimap(minimap(
            100,
            vec![cast(1), cast(2)],
        ))]);
        let initial = cache.pull_hud(
            &HudFrameRequest {
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );

        cache.publish([TopicPublication::Minimap(minimap(100, vec![cast(3)]))]);
        let reset = cache.pull_hud(
            &HudFrameRequest {
                epoch: Some(initial.epoch + 1),
                snapshot_revision: Some(2),
                skill_cast_cursor: Some(initial.skill_cast_cursor),
                minimap_interest: true,
                ..HudFrameRequest::default()
            },
            true,
        );
        assert!(reset.snapshot.is_some());
        assert!(reset.skill_casts.is_empty());
        assert!(!reset.casts_reset);
        assert_eq!(reset.skill_cast_cursor, 3);
    }
}
