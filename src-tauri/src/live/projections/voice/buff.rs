//! Buff subjects: per `(scope, base id)` aggregates of the local player's
//! and the current target's buffs, rebuilt on every event that can change
//! them. Gained/lost edges are the difference between two aggregates; lead
//! cues are derived from the latest one.

use std::collections::{BTreeSet, HashMap};

use super::deadline::{Lead, TimerClass};
use super::rule_book::{SubjectKey, buff_rule_scope};
use super::{VoiceProjection, VoiceSyncReason};
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    BuffState, MonoTimeMs, VoiceBuffScope, VoiceLeadSubject, VoiceTimer,
};
use crate::live::runtime::scheduler::DeadlineScheduler;
use crate::voice::models::{VoiceEvent, VoiceTrigger};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct BuffAggregate {
    pub(super) expires_mono_ms: Option<MonoTimeMs>,
    pub(super) fantasy_tier: Option<u8>,
}

#[derive(Debug, Default)]
pub(super) struct BuffAggregateBuilder {
    latest_expiry: Option<MonoTimeMs>,
    has_unbounded_instance: bool,
    fantasy_tier: Option<u8>,
}

impl BuffAggregateBuilder {
    pub(super) fn record(&mut self, buff: &BuffState, entities: &EntityContext) {
        // Legacy registry lookup at snapshot time. Multi-instance conflicts
        // used to be arbitrary-order last-wins; max() is the deterministic
        // tie-break across instances of the same base id.
        let tier = entities
            .resolve_fantasy_remodel_level(
                buff.source.map(|source| source.uuid),
                buff.source_config_id,
            )
            .and_then(|level| u8::try_from(level).ok());
        self.fantasy_tier = self.fantasy_tier.max(tier);
        if buff.duration_ms.is_none_or(|duration| duration == 0) || buff.expires_mono_ms.is_none() {
            self.has_unbounded_instance = true;
            self.latest_expiry = None;
            return;
        }
        if self.has_unbounded_instance {
            return;
        }
        if let Some(expires) = buff.expires_mono_ms {
            self.latest_expiry = Some(self.latest_expiry.map_or(expires, |old| old.max(expires)));
        }
    }

    pub(super) fn finish(self) -> BuffAggregate {
        BuffAggregate {
            expires_mono_ms: (!self.has_unbounded_instance)
                .then_some(self.latest_expiry)
                .flatten(),
            fantasy_tier: self.fantasy_tier,
        }
    }
}

pub(super) type BuffAggregateMap = HashMap<VoiceBuffScope, HashMap<i32, BuffAggregate>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct BuffEdge {
    pub(super) scope: VoiceBuffScope,
    pub(super) base_id: i32,
    pub(super) gained: bool,
    pub(super) fantasy_tier: Option<u8>,
}

/// The aggregates the projection last saw.
#[derive(Debug, Default)]
pub(super) struct BuffAggregates(BuffAggregateMap);

impl BuffAggregates {
    pub(super) fn clear(&mut self) {
        self.0.clear();
    }

    pub(super) fn get(&self, scope: VoiceBuffScope, base_id: i32) -> Option<&BuffAggregate> {
        self.0.get(&scope).and_then(|buffs| buffs.get(&base_id))
    }

    /// Swaps in `current` and, when `emit_edges`, returns the aggregates
    /// that appeared (gained) or disappeared (lost).
    pub(super) fn replace(&mut self, current: BuffAggregateMap, emit_edges: bool) -> Vec<BuffEdge> {
        if !emit_edges {
            self.0 = current;
            return Vec::new();
        }

        let mut keys = BTreeSet::new();
        for (scope, buffs) in self.0.iter().chain(&current) {
            keys.extend(buffs.keys().map(|base_id| (*scope, *base_id)));
        }

        let mut edges = Vec::new();
        for (scope, base_id) in keys {
            let previous = self.get(scope, base_id);
            let next = current.get(&scope).and_then(|buffs| buffs.get(&base_id));
            let edge = match (previous, next) {
                (None, Some(aggregate)) => (true, aggregate.fantasy_tier),
                (Some(aggregate), None) => (false, aggregate.fantasy_tier),
                _ => continue,
            };
            edges.push(BuffEdge {
                scope,
                base_id,
                gained: edge.0,
                fantasy_tier: edge.1,
            });
        }
        self.0 = current;
        edges
    }

    #[cfg(test)]
    pub(super) fn set(&mut self, scope: VoiceBuffScope, base_id: i32, aggregate: BuffAggregate) {
        self.0.entry(scope).or_default().insert(base_id, aggregate);
    }
}

impl VoiceProjection {
    /// Rebuilds the buff aggregates from `entities`, fires the resulting
    /// gained/lost edges (runtime only) and re-derives the lead cues. Shared
    /// by every buff-affecting event so they all stay in lockstep.
    pub(super) fn refresh_buffs(
        &mut self,
        entities: &EntityContext,
        reason: VoiceSyncReason,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        let edges = self.buffs.replace(
            collect_buff_aggregates(entities),
            reason == VoiceSyncReason::Runtime,
        );
        self.fire_buff_edges(&edges, now_ms);
        self.sync_buff_leads(reason, now_ms, now_mono, scheduler);
    }

    pub(super) fn fire_buff_edges(&mut self, edges: &[BuffEdge], now_ms: i64) {
        let mut handles = std::mem::take(&mut self.handles);
        for edge in edges {
            handles.clear();
            handles.extend(
                self.book
                    .matching(SubjectKey::buff(edge.scope, edge.base_id))
                    .iter()
                    .copied()
                    .filter(|handle| {
                        self.book
                            .get(*handle)
                            .is_some_and(|rule| matches_buff_edge(&rule.trigger, *edge))
                    }),
            );
            for &handle in &handles {
                self.fire(handle, now_ms, edge.fantasy_tier, None);
            }
        }
        self.handles = handles;
    }

    /// One lead timer per buff `ExpiringIn` rule whose aggregate is present
    /// and bounded; the rest are cancelled by the reconcile.
    pub(super) fn sync_buff_leads(
        &mut self,
        reason: VoiceSyncReason,
        now_ms: i64,
        now: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        self.leads.clear();
        for rule in &self.book.buff_leads {
            let Some(expires) = self
                .buffs
                .get(rule.scope, rule.base_id)
                .and_then(|aggregate| aggregate.expires_mono_ms)
            else {
                continue;
            };
            self.leads.push(Lead {
                timer: VoiceTimer::Lead {
                    rule: rule.handle,
                    subject: VoiceLeadSubject::Buff {
                        scope: rule.scope,
                        base_id: rule.base_id,
                    },
                },
                expires,
                lead_ms: rule.lead_ms,
            });
        }
        self.reconcile_leads(TimerClass::Buff, now_ms, now, reason, scheduler);
    }
}

pub(super) fn collect_buff_aggregates(entities: &EntityContext) -> BuffAggregateMap {
    let mut builders: HashMap<VoiceBuffScope, HashMap<i32, BuffAggregateBuilder>> = HashMap::new();
    if let Some(local) = entities.local_player() {
        for buff in entities.active_buffs(local.uuid) {
            record_aggregate(&mut builders, VoiceBuffScope::LocalPlayer, buff, entities);
        }
    }

    if let Some(target) = entities.current_attack_target() {
        let local = entities.local_player();
        for buff in entities.active_buffs(target.uuid) {
            record_aggregate(
                &mut builders,
                VoiceBuffScope::MonsterAnySource,
                buff,
                entities,
            );
            // Legacy parity: "local player source" means the buff's raw source
            // is the player, not a summon/fantasy owned by the player.
            if local.is_some() && buff.source == local {
                record_aggregate(
                    &mut builders,
                    VoiceBuffScope::MonsterLocalPlayerSource,
                    buff,
                    entities,
                );
            }
        }
    }

    builders
        .into_iter()
        .map(|(scope, buffs)| {
            (
                scope,
                buffs
                    .into_iter()
                    .map(|(base_id, aggregate)| (base_id, aggregate.finish()))
                    .collect(),
            )
        })
        .collect()
}

fn record_aggregate(
    builders: &mut HashMap<VoiceBuffScope, HashMap<i32, BuffAggregateBuilder>>,
    scope: VoiceBuffScope,
    buff: &BuffState,
    entities: &EntityContext,
) {
    builders
        .entry(scope)
        .or_default()
        .entry(buff.base_id)
        .or_default()
        .record(buff, entities);
}

fn matches_buff_edge(trigger: &VoiceTrigger, edge: BuffEdge) -> bool {
    if buff_rule_scope(&trigger.subject) != Some((edge.scope, edge.base_id)) {
        return false;
    }
    match trigger.event {
        VoiceEvent::Started => edge.gained,
        VoiceEvent::Ended => !edge.gained,
        _ => false,
    }
}
