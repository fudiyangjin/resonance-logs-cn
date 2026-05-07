use crate::parser_data;
use log::info;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use std::time::Instant;

const RESET_IGNORE_TARGETS_RELATIVE: &str = "logic/ResetIgnoreTargets.json";

/// Dungeon target IDs that should not trigger objective-based resets.
pub static RESET_IGNORE_TARGETS: LazyLock<HashSet<i32>> = LazyLock::new(|| {
    let data = parser_data::read_to_string(RESET_IGNORE_TARGETS_RELATIVE).unwrap_or_default();
    serde_json::from_str::<Vec<i32>>(&data)
        .unwrap_or_default()
        .into_iter()
        .collect()
});

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncounterResetReason {
    NewObjective,
    Wipe,
}

#[derive(Debug, Default, Clone)]
pub struct BattleStateMachine {
    pub deferred_reset: Option<(Instant, EncounterResetReason)>,
    pub active_target_id: Option<i32>,
}

impl BattleStateMachine {
    pub fn record_dungeon_target(
        &mut self,
        target_id: i32,
        nums: i32,
        complete: i32,
    ) -> Option<EncounterResetReason> {
        if complete == 0 && nums == 0 {
            self.active_target_id = Some(target_id);
            if RESET_IGNORE_TARGETS.contains(&target_id) {
                info!(
                    target: "app::live",
                    "Reset suppressed: target_new_objective ignored target_id={} complete={} nums={}",
                    target_id,
                    complete,
                    nums
                );
                return None;
            }
            info!(
                target: "app::live",
                "Reset rule matched: target_new_objective target_id={} complete={} nums={} => {:?}",
                target_id,
                complete,
                nums,
                EncounterResetReason::NewObjective
            );
            self.deferred_reset = None;
            return Some(EncounterResetReason::NewObjective);
        } else if complete == 1 && nums > 0 {
            let effective_target_id = if target_id == 0 {
                self.active_target_id.unwrap_or(target_id)
            } else {
                target_id
            };

            if RESET_IGNORE_TARGETS.contains(&effective_target_id) {
                info!(
                    target: "app::live",
                    "Target completed ignored: raw_target_id={} effective_target_id={} complete={} nums={}",
                    target_id,
                    effective_target_id,
                    complete,
                    nums
                );
                return None;
            }

            info!(
                target: "app::live",
                "Reset rule matched: target_completed raw_target_id={} effective_target_id={} complete={} nums={} => {:?}",
                target_id,
                effective_target_id,
                complete,
                nums,
                EncounterResetReason::NewObjective
            );
            self.deferred_reset = None;
            return Some(EncounterResetReason::NewObjective);
        }
        None
    }

    pub fn check_deferred_calls(&mut self) -> Option<EncounterResetReason> {
        if let Some((trigger_at, reason)) = self.deferred_reset {
            if Instant::now() >= trigger_at {
                self.deferred_reset = None;
                info!(
                    target: "app::live",
                    "Reset rule matched: deferred_timer_elapsed => {:?}",
                    reason
                );
                return Some(reason);
            }
        }
        None
    }

    pub fn check_for_wipe(
        &mut self,
        active_buffs: &mut HashMap<i32, crate::live::buff_monitor::ActiveBuff>,
    ) -> Option<EncounterResetReason> {
        if let Some(buff_uuid) = active_buffs
            .iter()
            .find_map(|(uuid, buff)| (buff.base_id == 510072).then_some(*uuid))
        {
            active_buffs.remove(&buff_uuid);
            info!(
                target: "app::live",
                "Reset rule matched: wipe_buff_detected base_id=510072 buff_uuid={} => {:?}",
                buff_uuid,
                EncounterResetReason::Wipe
            );
            return Some(EncounterResetReason::Wipe);
        }

        None
    }
}
