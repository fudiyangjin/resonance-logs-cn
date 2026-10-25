//! Monster skill watch: the latest cast of each configured skill by any
//! nearby monster.
//!
//! Casts come from `ATTR_SKILL_ID` deltas, which the server sends for every
//! entity in view. Only the latest cast per skill is kept. Discovery mode
//! also admits unlisted skills, with bounded storage. How long a cast stays on screen is a display
//! setting, so expiry is left to the HUD; a caster that dies or leaves view
//! does not take its cast with it.

use std::collections::{HashMap, HashSet};

use crate::live::entity_id::is_character_uuid;
use crate::live::ipc::models::MonsterSkillCastState;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{EntityKind, EntityUuid};

/// Whether `uuid` is a monster of the world rather than a player's summon:
/// a monster whose top summoner, if any, is not a character. The owner is
/// classified from its uuid, so this holds while the owner is out of view.
#[must_use]
pub(crate) fn is_world_monster(entities: &EntityContext, uuid: EntityUuid) -> bool {
    entities.entity(uuid).is_some_and(|state| {
        state.identity.kind == EntityKind::Monster
            && state
                .identity
                .owner_uuid
                .is_none_or(|owner| !is_character_uuid(owner.0))
    })
}

#[derive(Debug, Default)]
pub(crate) struct MonsterSkillWatch {
    watched: HashSet<i32>,
    monitor_all: bool,
    /// Skill id -> wall time of its latest cast.
    latest: HashMap<i32, i64>,
}

impl MonsterSkillWatch {
    /// Replaces the watch list, forgetting casts of skills no longer on it.
    pub fn apply_config(&mut self, skill_ids: &[i32]) {
        self.watched.clear();
        self.watched.extend(skill_ids.iter().copied());
        let watched = &self.watched;
        self.latest
            .retain(|skill_id, _| self.monitor_all || watched.contains(skill_id));
    }

    pub fn set_monitor_all(&mut self, enabled: bool) {
        self.monitor_all = enabled;
        self.latest
            .retain(|skill_id, _| enabled || self.watched.contains(skill_id));
    }

    /// Records a cast of `skill_id` by `caster`; returns whether the
    /// published view changed.
    pub fn observe(
        &mut self,
        entities: &EntityContext,
        caster: EntityUuid,
        skill_id: i32,
        cast_at_ms: i64,
    ) -> bool {
        if skill_id <= 0
            || (!self.monitor_all && !self.watched.contains(&skill_id))
            || !is_world_monster(entities, caster)
        {
            return false;
        }
        if self.monitor_all {
            self.latest.retain(|id, time| {
                self.watched.contains(id) || cast_at_ms.saturating_sub(*time) < 60_000
            });
            if !self.latest.contains_key(&skill_id) && self.latest.len() >= 512 {
                if let Some(oldest) = self
                    .latest
                    .iter()
                    .filter(|(id, _)| !self.watched.contains(id))
                    .min_by_key(|(id, time)| (**time, **id))
                    .map(|(&id, _)| id)
                {
                    self.latest.remove(&oldest);
                }
            }
        }
        self.latest.insert(skill_id, cast_at_ms) != Some(cast_at_ms)
    }

    /// Forgets every cast; the watch list stays. Returns whether any cast
    /// was forgotten.
    pub fn clear(&mut self) -> bool {
        let had_casts = !self.latest.is_empty();
        self.latest.clear();
        had_casts
    }

    /// Latest casts, ascending by skill id so the payload is stable.
    #[must_use]
    pub fn states(&self) -> Vec<MonsterSkillCastState> {
        let mut states = self
            .latest
            .iter()
            .map(|(&skill_id, &cast_at_ms)| MonsterSkillCastState {
                skill_id,
                cast_at_ms,
            })
            .collect::<Vec<_>>();
        states.sort_unstable_by_key(|state| state.skill_id);
        states
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::entity_id::canonical_player_uuid;
    use crate::live::runtime::events::{
        BatchId, EntityIdentityPatch, EventMeta, FieldPatch, MonoTimeMs, ProtocolBatch,
        ProtocolObservation,
    };

    const SKILL: i32 = 101_403;
    const MONSTER: EntityUuid = EntityUuid(9);
    const SUMMON: EntityUuid = EntityUuid(11);

    fn meta() -> EventMeta {
        EventMeta {
            batch_id: BatchId(0),
            capture_sequence: 0,
            stream_id: 0,
            stream_epoch: 0,
            captured_wall_ms: 1_000,
            captured_mono_ns: MonoTimeMs(1_000).0 * 1_000_000,
            source_time_ms: None,
        }
    }

    fn appear(
        uuid: EntityUuid,
        kind: EntityKind,
        owner: Option<EntityUuid>,
    ) -> Vec<ProtocolObservation> {
        vec![
            ProtocolObservation::EntityAppeared { uuid, kind },
            ProtocolObservation::IdentityUpdated {
                uuid,
                patch: EntityIdentityPatch {
                    kind: FieldPatch::Set(kind),
                    owner_uuid: owner.map_or(FieldPatch::Unchanged, FieldPatch::Set),
                    ..Default::default()
                },
            },
        ]
    }

    fn player() -> EntityUuid {
        EntityUuid(canonical_player_uuid(42))
    }

    /// A monster, a player, the player's summon and a monster summoned by
    /// the monster.
    fn scene() -> EntityContext {
        let mut entities = EntityContext::new();
        let mut observations = appear(MONSTER, EntityKind::Monster, None);
        observations.extend(appear(player(), EntityKind::Character, None));
        observations.extend(appear(SUMMON, EntityKind::Monster, Some(player())));
        observations.extend(appear(EntityUuid(12), EntityKind::Monster, Some(MONSTER)));
        entities.apply_batch(ProtocolBatch {
            meta: meta(),
            observations,
        });
        entities
    }

    fn watching(skill_ids: &[i32]) -> MonsterSkillWatch {
        let mut watch = MonsterSkillWatch::default();
        watch.apply_config(skill_ids);
        watch
    }

    #[test]
    fn watched_cast_by_monster_is_recorded() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);

        assert!(watch.observe(&entities, MONSTER, SKILL, 5_000));

        assert_eq!(
            watch.states(),
            vec![MonsterSkillCastState {
                skill_id: SKILL,
                cast_at_ms: 5_000,
            }]
        );
    }

    #[test]
    fn monster_summoned_by_monster_counts_as_world_monster() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);

        assert!(watch.observe(&entities, EntityUuid(12), SKILL, 5_000));
    }

    #[test]
    fn character_and_player_summon_casts_are_ignored() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);

        assert!(!watch.observe(&entities, player(), SKILL, 5_000));
        assert!(!watch.observe(&entities, SUMMON, SKILL, 5_000));
        assert!(!watch.observe(&entities, EntityUuid(99), SKILL, 5_000));

        assert!(watch.states().is_empty());
    }

    #[test]
    fn unwatched_skill_is_ignored() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);

        assert!(!watch.observe(&entities, MONSTER, SKILL + 1, 5_000));

        assert!(watch.states().is_empty());
    }

    #[test]
    fn discovery_records_unlisted_monster_skills_and_disable_removes_them() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);
        watch.set_monitor_all(true);
        assert!(watch.observe(&entities, MONSTER, SKILL + 1, 5_000));
        assert!(watch.observe(&entities, MONSTER, SKILL, 5_000));
        assert!(!watch.observe(&entities, player(), SKILL + 2, 5_000));
        assert!(!watch.observe(&entities, SUMMON, SKILL + 2, 5_000));
        assert!(!watch.observe(&entities, MONSTER, 0, 5_000));
        watch.apply_config(&[SKILL]);
        assert_eq!(watch.states().len(), 2);
        watch.set_monitor_all(false);
        assert_eq!(watch.states().len(), 1);
        assert_eq!(watch.states()[0].skill_id, SKILL);
    }

    #[test]
    fn discovery_bounds_storage_without_evicting_configured_skills() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);
        watch.set_monitor_all(true);
        watch.observe(&entities, MONSTER, SKILL, 1_000);
        for id in 1..600 {
            watch.observe(&entities, MONSTER, id, 2_000 + i64::from(id));
        }
        assert_eq!(watch.states().len(), 512);
        assert!(watch.states().iter().any(|state| state.skill_id == SKILL));
        watch.observe(&entities, MONSTER, 600, 70_000);
        assert_eq!(watch.states().len(), 2);
    }

    #[test]
    fn recast_refreshes_the_cast_time_and_duplicates_change_nothing() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);
        watch.observe(&entities, MONSTER, SKILL, 5_000);

        assert!(!watch.observe(&entities, MONSTER, SKILL, 5_000));
        assert!(watch.observe(&entities, EntityUuid(12), SKILL, 8_000));

        assert_eq!(watch.states()[0].cast_at_ms, 8_000);
    }

    #[test]
    fn config_change_keeps_only_casts_still_watched() {
        let entities = scene();
        let mut watch = watching(&[SKILL, SKILL + 1]);
        watch.observe(&entities, MONSTER, SKILL, 5_000);
        watch.observe(&entities, MONSTER, SKILL + 1, 6_000);

        watch.apply_config(&[SKILL + 1]);

        let skill_ids = watch
            .states()
            .iter()
            .map(|state| state.skill_id)
            .collect::<Vec<_>>();
        assert_eq!(skill_ids, vec![SKILL + 1]);
    }

    #[test]
    fn clear_reports_whether_casts_were_dropped() {
        let entities = scene();
        let mut watch = watching(&[SKILL]);
        assert!(!watch.clear());

        watch.observe(&entities, MONSTER, SKILL, 5_000);

        assert!(watch.clear());
        assert!(watch.states().is_empty());
    }
}
