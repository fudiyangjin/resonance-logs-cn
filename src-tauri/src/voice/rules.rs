//! Pure, synchronous trigger matching for real-time voice cues.
//!
//! This intentionally has no dependency on Tauri or the sidecar: it only
//! turns "buff snapshot" / "DBM event" edges into `VoiceCueIntent`s so it can
//! be called directly from the hot packet-processing path in
//! `live::state::AppStateManager` without any locking or IPC.

use std::collections::{HashMap, HashSet};

use crate::live::commands_models::CounterUpdateState;

use super::models::{MonsterBuffSourceScope, VoiceCueIntent, VoiceRule, VoiceTrigger};
use super::scheduler::CueScheduler;

/// Which buff-holding entity a buff snapshot/expiry call is about. Lets the
/// same edge-detection logic in `VoiceRuleTracker` serve multiple
/// independent triggers (the local player, the current monster target, ...)
/// without their gained/lost edges crossing over.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VoiceBuffScope {
    LocalPlayer,
    MonsterTarget(MonsterBuffSourceScope),
}

/// Tracks edge-detection and per-rule cooldown state across calls.
#[derive(Debug, Default)]
pub struct VoiceRuleTracker {
    last_buff_ids: HashMap<VoiceBuffScope, HashSet<i32>>,
    /// Fantasy remodel level (0-5 tier) of the summon that applied each
    /// base id present in the matching scope's last snapshot, mirroring
    /// `last_buff_ids`. Consulted by `try_fire` to pick a per-tier phrase
    /// variant (`VoiceRule::phrase_id_by_tier`) for buff gained/lost cues.
    last_tier_by_scope: HashMap<VoiceBuffScope, HashMap<i32, u8>>,
    last_fire_ms: HashMap<String, i64>,
    scheduler: CueScheduler,
    /// Whether a `(ruleId, slotId)` counter threshold was crossed the last
    /// time it was checked, so we only fire on the rising edge.
    counter_threshold_armed: HashMap<(i32, i32), bool>,
}

impl VoiceRuleTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns edge tracking to an uninitialized state for every scope. The
    /// next complete snapshot establishes the baseline and deliberately
    /// emits no cues.
    pub fn reset_buff_edges(&mut self) {
        self.last_buff_ids.clear();
        self.last_tier_by_scope.clear();
    }

    /// Returns edge tracking for a single scope to an uninitialized state
    /// (e.g. the current monster target changed), leaving other scopes'
    /// baselines untouched.
    pub fn reset_scope_edges(&mut self, scope: VoiceBuffScope) {
        self.last_buff_ids.remove(&scope);
        self.last_tier_by_scope.remove(&scope);
    }

    /// Clears all pending scheduled cues and counter-threshold edge state.
    /// Called on encounter reset so stale timers from the previous pull
    /// don't fire during the next one.
    pub fn reset_scheduled_cues(&mut self) {
        self.scheduler.clear();
        self.counter_threshold_armed.clear();
    }

    /// Diffs `scope`'s current buff id set against its previous snapshot and
    /// returns cues for any matching, non-cooling-down rules. Takes
    /// ownership of `current_buff_ids` since it is moved straight into the
    /// tracker's baseline (the caller was building it fresh anyway).
    pub fn on_buff_scope_snapshot(
        &mut self,
        scope: VoiceBuffScope,
        rules: &[VoiceRule],
        now_ms: i64,
        current_buff_ids: HashSet<i32>,
        current_tier_by_base_id: HashMap<i32, u8>,
    ) -> Vec<VoiceCueIntent> {
        let previous_buff_ids = self.last_buff_ids.insert(scope, current_buff_ids);
        let previous_tier_by_base_id = self
            .last_tier_by_scope
            .insert(scope, current_tier_by_base_id)
            .unwrap_or_default();
        let Some(previous_buff_ids) = previous_buff_ids else {
            return Vec::new();
        };
        // Just inserted above, so `scope` is guaranteed present. Cloned
        // (rather than borrowed) since the loop below needs `&mut self` to
        // fire cues.
        let current_buff_ids = self.last_buff_ids[&scope].clone();
        let current_tier_by_base_id = self.last_tier_by_scope[&scope].clone();

        let gained: Vec<i32> = current_buff_ids
            .difference(&previous_buff_ids)
            .copied()
            .collect();
        let lost: Vec<i32> = previous_buff_ids
            .difference(&current_buff_ids)
            .copied()
            .collect();
        if gained.is_empty() && lost.is_empty() {
            return Vec::new();
        }

        let mut intents = Vec::new();
        for rule in rules {
            if !rule.enabled {
                continue;
            }
            // Gained edges resolve their tier against the just-updated
            // (current) map; lost edges use the pre-update (previous) map,
            // since the buff (and its fantasy source) is no longer present
            // in the current snapshot.
            let (matched, tier) = match (scope, &rule.trigger) {
                (VoiceBuffScope::LocalPlayer, VoiceTrigger::BuffGained { buff_id }) => (
                    gained.contains(buff_id),
                    current_tier_by_base_id.get(buff_id).copied(),
                ),
                (VoiceBuffScope::LocalPlayer, VoiceTrigger::BuffLost { buff_id }) => (
                    lost.contains(buff_id),
                    previous_tier_by_base_id.get(buff_id).copied(),
                ),
                (
                    VoiceBuffScope::MonsterTarget(scope),
                    VoiceTrigger::MonsterBuffGained {
                        buff_id,
                        source_scope,
                    },
                ) if scope == *source_scope => (
                    gained.contains(buff_id),
                    current_tier_by_base_id.get(buff_id).copied(),
                ),
                (
                    VoiceBuffScope::MonsterTarget(scope),
                    VoiceTrigger::MonsterBuffLost {
                        buff_id,
                        source_scope,
                    },
                ) if scope == *source_scope => (
                    lost.contains(buff_id),
                    previous_tier_by_base_id.get(buff_id).copied(),
                ),
                _ => (false, None),
            };
            if matched {
                self.try_fire(rule, now_ms, tier, &mut intents);
            }
        }
        intents
    }

    /// Matches freshly observed boss DBM base skill ids against `BossDbm` rules.
    pub fn on_boss_dbm_events(
        &mut self,
        rules: &[VoiceRule],
        now_ms: i64,
        base_skill_ids: &[i32],
    ) -> Vec<VoiceCueIntent> {
        if rules.is_empty() || base_skill_ids.is_empty() {
            return Vec::new();
        }

        let mut intents = Vec::new();
        for rule in rules {
            if !rule.enabled {
                continue;
            }
            let VoiceTrigger::BossDbm { base_skill_id } = rule.trigger else {
                continue;
            };
            if base_skill_ids.contains(&base_skill_id) {
                self.try_fire(rule, now_ms, None, &mut intents);
            }
        }
        intents
    }

    /// Arms/disarms `scope`'s `*Expiring` buff rules against its current
    /// buff facts. `active_buffs` is `(base_id, expires_at_ms)`; buffs with
    /// no known expiry (e.g. permanent) should simply be omitted.
    pub fn sync_buff_expiry(
        &mut self,
        scope: VoiceBuffScope,
        rules: &[VoiceRule],
        now_ms: i64,
        active_buffs: &[(i32, i64)],
    ) {
        for rule in rules {
            let (buff_id, seconds_before) = match (scope, &rule.trigger) {
                (
                    VoiceBuffScope::LocalPlayer,
                    VoiceTrigger::BuffExpiring {
                        buff_id,
                        seconds_before,
                    },
                ) => (*buff_id, *seconds_before),
                (
                    VoiceBuffScope::MonsterTarget(scope),
                    VoiceTrigger::MonsterBuffExpiring {
                        buff_id,
                        seconds_before,
                        source_scope,
                    },
                ) if scope == *source_scope => (*buff_id, *seconds_before),
                _ => continue,
            };
            let expiry = active_buffs
                .iter()
                .find(|(base_id, _)| *base_id == buff_id)
                .map(|(_, expires_at_ms)| *expires_at_ms);
            self.sync_expiry_rule(rule, now_ms, seconds_before, expiry);
        }
    }

    /// Arms `BossDbmExpiring` rules against freshly observed DBM events.
    /// `events` is `(base_skill_id, expires_at_ms)`.
    pub fn sync_boss_dbm_expiry(
        &mut self,
        rules: &[VoiceRule],
        now_ms: i64,
        events: &[(i32, i64)],
    ) {
        for rule in rules {
            let VoiceTrigger::BossDbmExpiring {
                base_skill_id,
                seconds_before,
            } = rule.trigger
            else {
                continue;
            };
            let expiry = events
                .iter()
                .find(|(id, _)| *id == base_skill_id)
                .map(|(_, expires_at_ms)| *expires_at_ms);
            self.sync_expiry_rule(rule, now_ms, seconds_before, expiry);
        }
    }

    /// Matches `CounterThreshold` rules (rising-edge) and arms/disarms
    /// `CounterExpiring` rules, from the latest counter update payload.
    /// Returns cues for any threshold rules that just crossed.
    pub fn sync_counter_state(
        &mut self,
        rules: &[VoiceRule],
        now_ms: i64,
        updates: &[CounterUpdateState],
    ) -> Vec<VoiceCueIntent> {
        let mut intents = Vec::new();
        for rule in rules {
            if !rule.enabled {
                continue;
            }
            match rule.trigger {
                VoiceTrigger::CounterThreshold { rule_id, slot_id } => {
                    let slot = updates
                        .iter()
                        .find(|update| update.rule_id == rule_id)
                        .and_then(|update| {
                            update.slots.iter().find(|slot| slot.slot_id == slot_id)
                        });
                    let crossed = slot.is_some_and(|slot| {
                        slot.effective_threshold
                            .is_some_and(|threshold| slot.current_count >= threshold)
                    });
                    let key = (rule_id, slot_id);
                    let was_armed = self
                        .counter_threshold_armed
                        .get(&key)
                        .copied()
                        .unwrap_or(false);
                    self.counter_threshold_armed.insert(key, crossed);
                    if crossed && !was_armed {
                        self.try_fire(rule, now_ms, None, &mut intents);
                    }
                }
                VoiceTrigger::CounterExpiring {
                    rule_id,
                    slot_id,
                    seconds_before,
                } => {
                    let expiry = updates
                        .iter()
                        .find(|update| update.rule_id == rule_id)
                        .and_then(|update| update.slots.iter().find(|slot| slot.slot_id == slot_id))
                        .and_then(|slot| slot.freeze_until_ms);
                    self.sync_expiry_rule(rule, now_ms, seconds_before, expiry);
                }
                _ => {}
            }
        }
        intents
    }

    /// Pops every scheduled cue due by `now_ms` (from any of the `sync_*`
    /// calls above) and resolves them against the current rule set.
    pub fn poll_due(&mut self, rules: &[VoiceRule], now_ms: i64) -> Vec<VoiceCueIntent> {
        let due_rule_ids = self.scheduler.poll(now_ms);
        if due_rule_ids.is_empty() {
            return Vec::new();
        }
        let mut intents = Vec::new();
        for rule_id in &due_rule_ids {
            let Some(rule) = rules.iter().find(|rule| &rule.id == rule_id) else {
                continue;
            };
            if !rule.enabled {
                continue;
            }
            self.try_fire(rule, now_ms, None, &mut intents);
        }
        intents
    }

    /// Shared helper: arms `rule.id` to fire `seconds_before` seconds ahead
    /// of `expiry`, or disarms it when there is nothing to expire (buff/DBM
    /// timer/freeze window not currently active) or the lead time has
    /// already passed (avoids firing stale cues right after app start).
    fn sync_expiry_rule(
        &mut self,
        rule: &VoiceRule,
        now_ms: i64,
        seconds_before: u32,
        expiry: Option<i64>,
    ) {
        if !rule.enabled {
            self.scheduler.cancel(&rule.id);
            return;
        }
        let Some(expires_at_ms) = expiry else {
            self.scheduler.cancel(&rule.id);
            return;
        };
        let fire_at_ms =
            expires_at_ms.saturating_sub(i64::from(seconds_before).saturating_mul(1000));
        if fire_at_ms <= now_ms {
            self.scheduler.cancel(&rule.id);
            return;
        }
        self.scheduler.schedule(&rule.id, fire_at_ms);
    }

    /// `tier` is the fantasy remodel level (0-5) associated with the buff
    /// that (un)triggered this fire, when known; selects a variant from
    /// `rule.phrase_id_by_tier`, falling back to `rule.phrase_id` when
    /// absent, unmapped for this tier, or not tier-driven (e.g. `BossDbm`,
    /// `CounterThreshold`, and all `*Expiring` triggers).
    fn try_fire(
        &mut self,
        rule: &VoiceRule,
        now_ms: i64,
        tier: Option<u8>,
        intents: &mut Vec<VoiceCueIntent>,
    ) {
        if let Some(&last) = self.last_fire_ms.get(&rule.id)
            && now_ms.saturating_sub(last) < rule.cooldown_ms as i64
        {
            return;
        }
        self.last_fire_ms.insert(rule.id.clone(), now_ms);
        let phrase_id = tier
            .and_then(|tier| rule.phrase_id_by_tier.as_ref()?.get(&tier))
            .cloned()
            .unwrap_or_else(|| rule.phrase_id.clone());
        intents.push(VoiceCueIntent {
            rule_id: rule.id.clone(),
            phrase_id,
            priority: rule.priority,
            triggered_at_ms: now_ms,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(id: &str, trigger: VoiceTrigger, phrase_id: &str, cooldown_ms: u64) -> VoiceRule {
        VoiceRule {
            id: id.to_string(),
            enabled: true,
            trigger,
            phrase_id: phrase_id.to_string(),
            priority: 100,
            cooldown_ms,
            phrase_id_by_tier: None,
        }
    }

    fn rule_with_tiers(
        id: &str,
        trigger: VoiceTrigger,
        phrase_id: &str,
        phrase_id_by_tier: HashMap<u8, String>,
    ) -> VoiceRule {
        VoiceRule {
            phrase_id_by_tier: Some(phrase_id_by_tier),
            ..rule(id, trigger, phrase_id, 0)
        }
    }

    /// `on_buff_scope_snapshot` without any fantasy tier facts, for tests
    /// that don't care about tier-variant selection.
    fn snapshot(
        tracker: &mut VoiceRuleTracker,
        scope: VoiceBuffScope,
        rules: &[VoiceRule],
        now_ms: i64,
        current_buff_ids: HashSet<i32>,
    ) -> Vec<VoiceCueIntent> {
        tracker.on_buff_scope_snapshot(scope, rules, now_ms, current_buff_ids, HashMap::new())
    }

    #[test]
    fn fires_on_buff_gained_edge_only() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::BuffGained { buff_id: 42 },
            "p1",
            0,
        )];

        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::new(),
        );
        assert!(intents.is_empty());

        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            1,
            HashSet::from([42]),
        );
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p1");

        // Same buff still present next tick: no re-fire (not a new edge).
        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            10,
            HashSet::from([42]),
        );
        assert!(intents.is_empty());
    }

    #[test]
    fn fires_on_buff_lost_edge() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule("r1", VoiceTrigger::BuffLost { buff_id: 7 }, "p1", 0)];

        snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::from([7]),
        );
        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            10,
            HashSet::new(),
        );
        assert_eq!(intents.len(), 1);
    }

    #[test]
    fn buff_scopes_do_not_cross_talk() {
        let mut tracker = VoiceRuleTracker::new();
        let local_rules = vec![rule(
            "local",
            VoiceTrigger::BuffGained { buff_id: 42 },
            "p1",
            0,
        )];
        let monster_rules = vec![rule(
            "monster",
            VoiceTrigger::MonsterBuffGained {
                buff_id: 42,
                source_scope: MonsterBuffSourceScope::AnySource,
            },
            "p2",
            0,
        )];

        // Establish baselines for both scopes independently.
        snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &local_rules,
            0,
            HashSet::new(),
        );
        snapshot(
            &mut tracker,
            VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource),
            &monster_rules,
            0,
            HashSet::new(),
        );

        // Local player gains buff 42: only the local rule should fire, even
        // though a monster rule for the same base id exists.
        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &local_rules,
            1,
            HashSet::from([42]),
        );
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p1");

        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource),
            &monster_rules,
            1,
            HashSet::new(),
        );
        assert!(
            intents.is_empty(),
            "monster scope baseline is unaffected by local player edge"
        );
    }

    #[test]
    fn resetting_one_scope_does_not_affect_the_other() {
        let mut tracker = VoiceRuleTracker::new();
        let monster_rules = vec![rule(
            "monster",
            VoiceTrigger::MonsterBuffGained {
                buff_id: 42,
                source_scope: MonsterBuffSourceScope::AnySource,
            },
            "p1",
            0,
        )];
        let local_rules = vec![rule(
            "local",
            VoiceTrigger::BuffLost { buff_id: 1 },
            "p2",
            0,
        )];

        snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &local_rules,
            0,
            HashSet::from([1]),
        );
        let monster_scope = VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource);
        snapshot(
            &mut tracker,
            monster_scope,
            &monster_rules,
            0,
            HashSet::new(),
        );

        // Simulate an attack-target switch: only the monster scope resets.
        tracker.reset_scope_edges(monster_scope);

        // Monster scope baseline was cleared, so this snapshot establishes a
        // new baseline rather than firing a gained edge.
        let intents = snapshot(
            &mut tracker,
            monster_scope,
            &monster_rules,
            1,
            HashSet::from([42]),
        );
        assert!(intents.is_empty());

        // Local player scope's baseline (established before the monster
        // reset) is untouched: losing buff 1 still fires the lost edge.
        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &local_rules,
            2,
            HashSet::new(),
        );
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p2");
    }

    #[test]
    fn monster_source_scopes_do_not_cross_talk() {
        let mut tracker = VoiceRuleTracker::new();
        let any_scope = VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource);
        let local_scope = VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::LocalPlayerSource);
        let rules = vec![
            rule(
                "any-gained",
                VoiceTrigger::MonsterBuffGained {
                    buff_id: 42,
                    source_scope: MonsterBuffSourceScope::AnySource,
                },
                "any-phrase",
                0,
            ),
            rule(
                "local-gained",
                VoiceTrigger::MonsterBuffGained {
                    buff_id: 42,
                    source_scope: MonsterBuffSourceScope::LocalPlayerSource,
                },
                "local-phrase",
                0,
            ),
            rule(
                "local-lost",
                VoiceTrigger::MonsterBuffLost {
                    buff_id: 42,
                    source_scope: MonsterBuffSourceScope::LocalPlayerSource,
                },
                "local-lost-phrase",
                0,
            ),
        ];

        snapshot(&mut tracker, any_scope, &rules, 0, HashSet::new());
        snapshot(&mut tracker, local_scope, &rules, 0, HashSet::new());

        let any_cues = snapshot(&mut tracker, any_scope, &rules, 1, HashSet::from([42]));
        assert_eq!(any_cues.len(), 1);
        assert_eq!(any_cues[0].phrase_id, "any-phrase");

        let local_cues = snapshot(&mut tracker, local_scope, &rules, 2, HashSet::from([42]));
        assert_eq!(local_cues.len(), 1);
        assert_eq!(local_cues[0].phrase_id, "local-phrase");

        assert!(snapshot(&mut tracker, any_scope, &rules, 3, HashSet::from([42])).is_empty());
        let local_lost = snapshot(&mut tracker, local_scope, &rules, 4, HashSet::new());
        assert_eq!(local_lost.len(), 1);
        assert_eq!(local_lost[0].phrase_id, "local-lost-phrase");
    }

    #[test]
    fn monster_expiry_only_matches_its_source_scope() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "local-expiring",
            VoiceTrigger::MonsterBuffExpiring {
                buff_id: 42,
                seconds_before: 5,
                source_scope: MonsterBuffSourceScope::LocalPlayerSource,
            },
            "local-phrase",
            0,
        )];

        tracker.sync_buff_expiry(
            VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource),
            &rules,
            0,
            &[(42, 10_000)],
        );
        assert!(tracker.poll_due(&rules, 5_000).is_empty());

        tracker.sync_buff_expiry(
            VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::LocalPlayerSource),
            &rules,
            5_001,
            &[(42, 15_001)],
        );
        assert_eq!(tracker.poll_due(&rules, 10_001).len(), 1);
    }

    #[test]
    fn clearing_monster_scope_cancels_pending_expiry() {
        let mut tracker = VoiceRuleTracker::new();
        let scope = VoiceBuffScope::MonsterTarget(MonsterBuffSourceScope::AnySource);
        let rules = vec![rule(
            "monster-expiring",
            VoiceTrigger::MonsterBuffExpiring {
                buff_id: 42,
                seconds_before: 5,
                source_scope: MonsterBuffSourceScope::AnySource,
            },
            "phrase",
            0,
        )];

        tracker.sync_buff_expiry(scope, &rules, 0, &[(42, 10_000)]);
        tracker.sync_buff_expiry(scope, &rules, 1_000, &[]);

        assert!(tracker.poll_due(&rules, 5_000).is_empty());
    }

    #[test]
    fn respects_cooldown() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::BossDbm { base_skill_id: 99 },
            "p1",
            5000,
        )];

        let intents = tracker.on_boss_dbm_events(&rules, 0, &[99]);
        assert_eq!(intents.len(), 1);
        let intents = tracker.on_boss_dbm_events(&rules, 1000, &[99]);
        assert!(intents.is_empty(), "should still be cooling down");
        let intents = tracker.on_boss_dbm_events(&rules, 6000, &[99]);
        assert_eq!(intents.len(), 1, "cooldown elapsed, should fire again");
    }

    #[test]
    fn disabled_rule_never_fires() {
        let mut tracker = VoiceRuleTracker::new();
        let mut r = rule("r1", VoiceTrigger::BuffGained { buff_id: 1 }, "p1", 0);
        r.enabled = false;
        snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &[r.clone()],
            0,
            HashSet::new(),
        );
        let intents = snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &[r],
            1,
            HashSet::from([1]),
        );
        assert!(intents.is_empty());
    }

    #[test]
    fn reset_uses_next_snapshot_as_baseline() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::BuffGained { buff_id: 42 },
            "p1",
            0,
        )];
        snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::new(),
        );
        assert_eq!(
            snapshot(
                &mut tracker,
                VoiceBuffScope::LocalPlayer,
                &rules,
                1,
                HashSet::from([42])
            )
            .len(),
            1
        );
        tracker.reset_buff_edges();
        assert!(
            snapshot(
                &mut tracker,
                VoiceBuffScope::LocalPlayer,
                &rules,
                2,
                HashSet::from([42])
            )
            .is_empty()
        );
    }

    fn slot(
        slot_id: i32,
        current_count: u32,
        threshold: Option<u32>,
    ) -> crate::live::commands_models::SlotUpdateState {
        crate::live::commands_models::SlotUpdateState {
            slot_id,
            current_count,
            threshold,
            effective_threshold: threshold,
            is_counting: true,
            reset_buff_active: false,
            freeze_until_ms: None,
            freeze_duration_ms: None,
            effective_freeze_duration_ms: None,
        }
    }

    fn counter_update(
        rule_id: i32,
        slots: Vec<crate::live::commands_models::SlotUpdateState>,
    ) -> CounterUpdateState {
        CounterUpdateState { rule_id, slots }
    }

    #[test]
    fn buff_expiring_fires_once_before_expiry_and_not_after() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::BuffExpiring {
                buff_id: 42,
                seconds_before: 5,
            },
            "p1",
            0,
        )];

        // Buff active, expires at t=10_000ms -> cue should arm at 5_000ms.
        tracker.sync_buff_expiry(VoiceBuffScope::LocalPlayer, &rules, 0, &[(42, 10_000)]);
        assert!(tracker.poll_due(&rules, 4_999).is_empty());
        let intents = tracker.poll_due(&rules, 5_000);
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p1");

        // Firing is one-shot: polling again at/after the same time does nothing
        // until re-armed.
        assert!(tracker.poll_due(&rules, 6_000).is_empty());
    }

    #[test]
    fn buff_expiring_cancels_when_buff_disappears() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::BuffExpiring {
                buff_id: 42,
                seconds_before: 5,
            },
            "p1",
            0,
        )];

        tracker.sync_buff_expiry(VoiceBuffScope::LocalPlayer, &rules, 0, &[(42, 10_000)]);
        // Buff removed before the cue fires (e.g. dispelled early).
        tracker.sync_buff_expiry(VoiceBuffScope::LocalPlayer, &rules, 4_000, &[]);
        assert!(tracker.poll_due(&rules, 5_000).is_empty());
    }

    #[test]
    fn buff_expiring_reschedules_on_refresh() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::BuffExpiring {
                buff_id: 42,
                seconds_before: 5,
            },
            "p1",
            0,
        )];

        tracker.sync_buff_expiry(VoiceBuffScope::LocalPlayer, &rules, 0, &[(42, 10_000)]);
        // Buff refreshed, pushing expiry further out; old fire time must not
        // trigger anymore.
        tracker.sync_buff_expiry(VoiceBuffScope::LocalPlayer, &rules, 1_000, &[(42, 20_000)]);
        assert!(tracker.poll_due(&rules, 5_000).is_empty());
        assert_eq!(tracker.poll_due(&rules, 15_000).len(), 1);
    }

    #[test]
    fn counter_threshold_fires_on_rising_edge_only() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::CounterThreshold {
                rule_id: 1,
                slot_id: 1,
            },
            "p1",
            0,
        )];

        let below = vec![counter_update(1, vec![slot(1, 2, Some(5))])];
        assert!(tracker.sync_counter_state(&rules, 0, &below).is_empty());

        let at_threshold = vec![counter_update(1, vec![slot(1, 5, Some(5))])];
        let intents = tracker.sync_counter_state(&rules, 1, &at_threshold);
        assert_eq!(intents.len(), 1);

        // Still at/above threshold: no re-fire until it drops and rises again.
        assert!(
            tracker
                .sync_counter_state(&rules, 2, &at_threshold)
                .is_empty()
        );

        let reset = vec![counter_update(1, vec![slot(1, 0, Some(5))])];
        tracker.sync_counter_state(&rules, 3, &reset);
        let intents = tracker.sync_counter_state(&rules, 4, &at_threshold);
        assert_eq!(
            intents.len(),
            1,
            "should re-fire after dropping below and crossing again"
        );
    }

    #[test]
    fn counter_expiring_fires_before_freeze_window_ends() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule(
            "r1",
            VoiceTrigger::CounterExpiring {
                rule_id: 1,
                slot_id: 1,
                seconds_before: 3,
            },
            "p1",
            0,
        )];

        let mut freezing_slot = slot(1, 1, None);
        freezing_slot.freeze_until_ms = Some(10_000);
        let updates = vec![counter_update(1, vec![freezing_slot])];
        tracker.sync_counter_state(&rules, 0, &updates);

        assert!(tracker.poll_due(&rules, 6_999).is_empty());
        assert_eq!(tracker.poll_due(&rules, 7_000).len(), 1);
    }

    #[test]
    fn complete_empty_snapshot_fires_lost() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule("r1", VoiceTrigger::BuffLost { buff_id: 7 }, "p1", 0)];
        snapshot(
            &mut tracker,
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::from([7]),
        );
        assert_eq!(
            snapshot(
                &mut tracker,
                VoiceBuffScope::LocalPlayer,
                &rules,
                1,
                HashSet::new()
            )
            .len(),
            1
        );
    }

    #[test]
    fn buff_gained_selects_phrase_variant_by_fantasy_tier() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule_with_tiers(
            "r1",
            VoiceTrigger::BuffGained { buff_id: 42 },
            "p1-fallback",
            HashMap::from([(5u8, "p1-tier5".to_string()), (3u8, "p1-tier3".to_string())]),
        )];

        tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::new(),
            HashMap::new(),
        );
        // Gained with a known tier variant: use it.
        let intents = tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            1,
            HashSet::from([42]),
            HashMap::from([(42, 5u8)]),
        );
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p1-tier5");
    }

    #[test]
    fn buff_gained_falls_back_to_base_phrase_for_unmapped_tier() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule_with_tiers(
            "r1",
            VoiceTrigger::BuffGained { buff_id: 42 },
            "p1-fallback",
            HashMap::from([(5u8, "p1-tier5".to_string())]),
        )];

        tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::new(),
            HashMap::new(),
        );
        // Gained but with a tier absent from the map (e.g. tier 2): fall
        // back to the base phrase rather than dropping the cue.
        let intents = tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            1,
            HashSet::from([42]),
            HashMap::from([(42, 2u8)]),
        );
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p1-fallback");

        // Not applied by any known fantasy summon at all: also falls back.
        let intents = tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            2,
            HashSet::new(),
            HashMap::new(),
        );
        assert!(intents.is_empty(), "no edge yet since buff wasn't removed");
    }

    #[test]
    fn buff_lost_selects_phrase_variant_by_tier_held_before_removal() {
        let mut tracker = VoiceRuleTracker::new();
        let rules = vec![rule_with_tiers(
            "r1",
            VoiceTrigger::BuffLost { buff_id: 42 },
            "p1-fallback",
            HashMap::from([(5u8, "p1-tier5-lost".to_string())]),
        )];

        tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            0,
            HashSet::from([42]),
            HashMap::from([(42, 5u8)]),
        );
        // Buff removed: the current snapshot no longer carries a tier for
        // it, so the lost cue must fall back to the *previous* tier map.
        let intents = tracker.on_buff_scope_snapshot(
            VoiceBuffScope::LocalPlayer,
            &rules,
            1,
            HashSet::new(),
            HashMap::new(),
        );
        assert_eq!(intents.len(), 1);
        assert_eq!(intents[0].phrase_id, "p1-tier5-lost");
    }
}
