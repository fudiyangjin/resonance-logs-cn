//! Main-HUD profession counter (`profession_buff_icon_group`).
//!
//! The client routes every buff carrying a `BuffEffectEnergyDisplay` logic
//! effect into `buff_data.SetProfessionBuff(buffId, effectId, layer)`; the
//! widget then shows the row of the latest call. This tracker keeps the same
//! three pieces of state for the local player: the latest (buff, row), the
//! layer per buff, and the rows whose buff still has layers (the flower layer
//! lights one petal per such row).
//!
//! It reads buff events directly, independent of the buff watch list: which
//! buffs carry the effect is not in `BuffTable`, so they cannot be listed.

use std::collections::{HashMap, HashSet};

use crate::live::ipc::models::ProfessionCountState;
use crate::live::runtime::events::{BuffEvent, BuffTransition};

#[derive(Debug, Default)]
pub(crate) struct ProfessionCountTracker {
    latest: Option<(i32, i32)>,
    layers: HashMap<i32, i32>,
    active_effect_ids: Vec<i32>,
    logged_base_ids: HashSet<i32>,
}

impl ProfessionCountTracker {
    /// Applies a local-player buff event; returns whether the published
    /// state changed.
    pub(crate) fn apply(&mut self, event: &BuffEvent) -> bool {
        let Some(effect_id) = event.state.energy_display_id else {
            return false;
        };
        let base_id = event.state.base_id;
        if self.logged_base_ids.insert(base_id) {
            log::debug!(
                target: "app::live",
                "profession_count buff={base_id} effect={effect_id} layer={}",
                event.state.layer
            );
        }
        let layer = if event.transition == BuffTransition::Removed {
            0
        } else {
            event.state.layer.max(0)
        };
        let before = self.snapshot();
        self.latest = Some((base_id, effect_id));
        self.layers.insert(base_id, layer);
        // `cacheResIconId_` keeps a row while its buff has layers. The Lua
        // removes by value, so a row leaves once any of its buffs drops out.
        if layer > 0 {
            if !self.active_effect_ids.contains(&effect_id) {
                self.active_effect_ids.push(effect_id);
            }
        } else {
            self.active_effect_ids.retain(|id| *id != effect_id);
        }
        before != self.snapshot()
    }

    #[must_use]
    pub(crate) fn snapshot(&self) -> Option<ProfessionCountState> {
        let (base_id, effect_id) = self.latest?;
        Some(ProfessionCountState {
            buff_base_id: base_id,
            effect_id,
            layer: self.layers.get(&base_id).copied().unwrap_or_default(),
            any_layer: self.layers.values().any(|layer| *layer != 0),
            active_effect_ids: self.active_effect_ids.clone(),
        })
    }

    pub(crate) fn clear(&mut self) {
        self.latest = None;
        self.layers.clear();
        self.active_effect_ids.clear();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::live::runtime::events::{
        BuffState, BuffWireKind, EntityRef, EntityRoles, EntityUuid,
    };

    fn event(
        base_id: i32,
        effect_id: Option<i32>,
        layer: i32,
        transition: BuffTransition,
    ) -> BuffEvent {
        BuffEvent {
            transition,
            wire_kind: BuffWireKind::Add,
            duration_updated: false,
            previous_layer: None,
            state: BuffState {
                target: EntityRef {
                    uuid: EntityUuid(1),
                    generation: 1,
                },
                instance_id: i64::from(base_id),
                base_id,
                layer,
                source: None,
                resolved_owner: None,
                source_config_id: None,
                duration_ms: None,
                started_wall_ms: None,
                expires_wall_ms: None,
                started_mono_ms: None,
                expires_mono_ms: None,
                effect_ids: Arc::from([]),
                energy_display_id: effect_id,
            },
            target_roles: EntityRoles {
                is_local_player: true,
                is_team_member: false,
                is_current_target: false,
            },
        }
    }

    #[test]
    fn ignores_buffs_without_energy_display() {
        let mut tracker = ProfessionCountTracker::default();
        assert!(!tracker.apply(&event(100, None, 3, BuffTransition::Applied)));
        assert_eq!(tracker.snapshot(), None);
    }

    #[test]
    fn follows_the_latest_buff_and_its_layer() {
        let mut tracker = ProfessionCountTracker::default();
        assert!(tracker.apply(&event(2202251, Some(41), 2, BuffTransition::Applied)));
        assert!(tracker.apply(&event(2202251, Some(41), 5, BuffTransition::LayerChanged)));
        let state = tracker.snapshot().expect("tracked");
        assert_eq!(
            (state.buff_base_id, state.effect_id, state.layer),
            (2202251, 41, 5)
        );
        assert!(!tracker.apply(&event(2202251, Some(41), 5, BuffTransition::Refreshed)));
    }

    #[test]
    fn removal_drops_the_layer_to_zero() {
        let mut tracker = ProfessionCountTracker::default();
        tracker.apply(&event(2205211, Some(22), 2, BuffTransition::Applied));
        tracker.apply(&event(2205211, Some(22), 2, BuffTransition::Removed));
        let state = tracker.snapshot().expect("tracked");
        assert_eq!(state.layer, 0);
        assert!(!state.any_layer);
        assert!(state.active_effect_ids.is_empty());
    }

    #[test]
    fn flower_rows_stay_while_their_buffs_have_layers() {
        let mut tracker = ProfessionCountTracker::default();
        tracker.apply(&event(2202713, Some(42), 1, BuffTransition::Applied));
        tracker.apply(&event(2202714, Some(43), 1, BuffTransition::Applied));
        tracker.apply(&event(2202713, Some(42), 1, BuffTransition::Removed));
        let state = tracker.snapshot().expect("tracked");
        assert_eq!(state.effect_id, 42);
        assert_eq!(state.layer, 0);
        assert!(state.any_layer);
        assert_eq!(state.active_effect_ids, [43]);
    }

    #[test]
    fn clear_forgets_everything() {
        let mut tracker = ProfessionCountTracker::default();
        tracker.apply(&event(2202251, Some(41), 2, BuffTransition::Applied));
        tracker.clear();
        assert_eq!(tracker.snapshot(), None);
    }
}
