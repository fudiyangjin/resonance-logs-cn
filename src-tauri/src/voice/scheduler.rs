//! Pure, synchronous min-heap scheduler for time-based voice cues (e.g. "buff
//! expires in 5s"). Kept separate from `rules.rs` edge-detection so each stays
//! simple: this file only answers "what rule ids are due by `now_ms`", using
//! a generation counter per rule id so stale heap entries (superseded by a
//! reschedule, or invalidated by a cancel) are cheaply skipped on pop instead
//! of requiring an O(n) heap search.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

#[derive(Debug, Clone, Copy)]
struct ScheduledState {
    generation: u64,
    fire_at_ms: i64,
}

#[derive(Debug, Default)]
pub struct CueScheduler {
    entries: HashMap<String, ScheduledState>,
    heap: BinaryHeap<Reverse<(i64, String, u64)>>,
}

impl CueScheduler {
    pub fn new() -> Self {
        Self::default()
    }

    /// Arms (or re-arms) `rule_id` to fire at `fire_at_ms`. A no-op if the
    /// rule is already scheduled for the exact same time, so callers can
    /// call this on every snapshot update without flooding the heap.
    pub fn schedule(&mut self, rule_id: &str, fire_at_ms: i64) {
        let generation = match self.entries.get(rule_id) {
            Some(existing) if existing.fire_at_ms == fire_at_ms => return,
            Some(existing) => existing.generation.wrapping_add(1),
            None => 0,
        };
        self.entries.insert(
            rule_id.to_string(),
            ScheduledState {
                generation,
                fire_at_ms,
            },
        );
        self.heap
            .push(Reverse((fire_at_ms, rule_id.to_string(), generation)));
    }

    /// Disarms `rule_id`, if armed. Any stale heap entry is left in place
    /// and simply discarded when popped, since its generation no longer
    /// matches.
    pub fn cancel(&mut self, rule_id: &str) {
        self.entries.remove(rule_id);
    }

    /// Pops and returns every rule id armed at or before `now_ms`, in
    /// ascending fire-time order. Each returned rule id is disarmed
    /// (one-shot); callers wanting a recurring cue must call `schedule`
    /// again once the underlying condition (e.g. a new buff instance)
    /// warrants it.
    pub fn poll(&mut self, now_ms: i64) -> Vec<String> {
        let mut due = Vec::new();
        while let Some(Reverse((fire_at_ms, _, _))) = self.heap.peek() {
            if *fire_at_ms > now_ms {
                break;
            }
            let Some(Reverse((fire_at_ms, rule_id, generation))) = self.heap.pop() else {
                break;
            };
            let is_current = matches!(
                self.entries.get(&rule_id),
                Some(state) if state.generation == generation && state.fire_at_ms == fire_at_ms
            );
            if is_current {
                self.entries.remove(&rule_id);
                due.push(rule_id);
            }
        }
        due
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.heap.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_when_due_and_not_before() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        assert!(scheduler.poll(999).is_empty());
        assert_eq!(scheduler.poll(1_000), vec!["r1".to_string()]);
    }

    #[test]
    fn is_one_shot() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        assert_eq!(scheduler.poll(1_000), vec!["r1".to_string()]);
        assert!(scheduler.poll(2_000).is_empty());
    }

    #[test]
    fn rescheduling_replaces_previous_fire_time() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        scheduler.schedule("r1", 5_000);
        assert!(
            scheduler.poll(1_000).is_empty(),
            "old fire time must be superseded"
        );
        assert_eq!(scheduler.poll(5_000), vec!["r1".to_string()]);
    }

    #[test]
    fn scheduling_same_time_twice_is_idempotent() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        scheduler.schedule("r1", 1_000);
        assert_eq!(scheduler.poll(1_000), vec!["r1".to_string()]);
        // Only one entry should have been in the heap.
        assert!(scheduler.heap.is_empty());
    }

    #[test]
    fn cancel_prevents_firing() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        scheduler.cancel("r1");
        assert!(scheduler.poll(1_000).is_empty());
    }

    #[test]
    fn cancel_then_reschedule_fires_again() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        scheduler.cancel("r1");
        scheduler.schedule("r1", 2_000);
        assert!(scheduler.poll(1_000).is_empty());
        assert_eq!(scheduler.poll(2_000), vec!["r1".to_string()]);
    }

    #[test]
    fn multiple_rules_fire_in_ascending_order() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("late", 3_000);
        scheduler.schedule("early", 1_000);
        scheduler.schedule("mid", 2_000);
        assert_eq!(
            scheduler.poll(3_000),
            vec!["early".to_string(), "mid".to_string(), "late".to_string()]
        );
    }

    #[test]
    fn clear_removes_all_pending_entries() {
        let mut scheduler = CueScheduler::new();
        scheduler.schedule("r1", 1_000);
        scheduler.schedule("r2", 1_000);
        scheduler.clear();
        assert!(scheduler.poll(10_000).is_empty());
    }
}
