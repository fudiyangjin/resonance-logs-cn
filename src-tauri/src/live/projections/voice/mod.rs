//! Voice rule projection: turns live state into [`VoiceCueIntent`]s.
//!
//! Every stateful trigger follows one pattern. Edges (buff gained/lost,
//! entity appeared/gone, skill charge refilled, counter threshold reached)
//! come from diffing a subject's state against what the projection saw
//! last. Lead cues ("N seconds left") are derived as the complete set of
//! timers the subjects should have right now and handed to the
//! [`DeadlineTracker`], which arms, moves and cancels to match — a subject
//! that is gone simply drops out of that set, so there is no separate
//! cleanup path. Buffs are re-derived per event; counters, skill cooldowns,
//! watched entities and boss mechanics once per batch, and only when their
//! input's revision moved. Casts and alerts are plain event edges.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use crate::live::counter::engine::CounterEngine;
use crate::live::projections::buff_presence::BuffCompositeCatalog;
use crate::live::projections::entity_monitor::EntityMonitorProjection;
use crate::live::projections::monster_skill_watch::is_world_monster;
use crate::live::runtime::entity_context::EntityContext;
use crate::live::runtime::events::{
    BatchId, BuffTransition, DomainEnvelope, DomainEvent, MonoTimeMs, SkillPhase, TimerKey,
    VoiceRuleHandle, VoiceTimer,
};
use crate::live::runtime::scheduler::DeadlineScheduler;
use crate::voice::models::{
    AlertKind, EntityOwnerScope, VoiceCueIntent, VoiceEvent, VoiceRule, VoiceRuntimeSnapshot,
};

mod boss;
mod buff;
mod counter;
mod deadline;
mod entity;
mod rule_book;
mod skill;
#[cfg(test)]
mod tests;

use buff::{BuffAggregates, collect_buff_aggregates};
use deadline::{DeadlineTracker, Fire, Lead, TimerClass};
use rule_book::{RuleBook, SubjectKey};
use skill::SkillTrack;

/// Whether a sync follows live game updates or re-establishes state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VoiceSyncReason {
    /// Configuration changes, snapshots and context switches (another local
    /// player or attack target): state is rebuilt silently, so no edge fires
    /// and no cue is announced late.
    Baseline,
    /// Live game updates: edges fire, and a pending cue that an update
    /// pulls into the past is announced right away.
    Runtime,
}

/// The sibling projections the batch-scoped subjects are derived from.
pub(crate) struct VoiceInputs<'a> {
    pub(crate) entities: &'a EntityContext,
    pub(crate) monitor: &'a EntityMonitorProjection,
    pub(crate) counters: &'a CounterEngine,
}

/// The input revision a derivation last consumed. `None` until the first
/// sync after (re)configuration or a runtime reset, which seeds silently.
#[derive(Debug, Default, Clone, Copy)]
struct Seen(Option<u64>);

impl Seen {
    /// The reason to derive with, or `None` when the input did not move.
    fn observe(&mut self, revision: u64, reason: VoiceSyncReason) -> Option<VoiceSyncReason> {
        let seeded = self.0.is_some();
        if self.0 == Some(revision) {
            return None;
        }
        self.0 = Some(revision);
        Some(if seeded {
            reason
        } else {
            VoiceSyncReason::Baseline
        })
    }
}

#[derive(Debug, Default)]
struct SeenInputs {
    counters: Seen,
    skill_cds: Seen,
    entities: Seen,
    boss_mechanics: Seen,
}

#[derive(Debug, Default)]
pub struct VoiceProjection {
    book: RuleBook,
    /// Sole owner of every voice timer.
    tracker: DeadlineTracker,
    buffs: BuffAggregates,
    /// Composite buffs aggregate as local-player buff subjects.
    buff_composites: Arc<BuffCompositeCatalog>,
    /// Whether each watched counter slot had reached its threshold.
    counter_crossed: HashMap<(i32, i32), bool>,
    /// Cooldown timeline and last seen charges of every watched skill.
    skills: HashMap<i32, SkillTrack>,
    /// `(monster_id, scope)` pairs with a present watched entity at the last
    /// derivation; `Entity/Started|Ended` fire on set differences.
    entity_presence: BTreeSet<(i32, EntityOwnerScope)>,
    /// Monster skills already announced in `monster_skill_batch`: one cast
    /// can reach the context more than once per batch.
    monster_skill_batch: Option<BatchId>,
    monster_skills_fired: HashSet<i32>,
    seen: SeenInputs,
    /// Cues matched since the last [`Self::take_cues`].
    pending_cues: Vec<VoiceCueIntent>,
    /// Scratch buffers reused by every derivation so a busy batch does not
    /// allocate per subject.
    leads: Vec<Lead>,
    fires: Vec<Fire>,
    handles: Vec<VoiceRuleHandle>,
}

impl VoiceProjection {
    /// Removes the cues matched since the last drain. The caller owns the
    /// `VoiceService` handle; this projection stays free of Tauri.
    pub fn take_cues(&mut self) -> Vec<VoiceCueIntent> {
        std::mem::take(&mut self.pending_cues)
    }

    /// Container reset: a new timer epoch, and every input re-seeds silently
    /// on its next sync.
    pub fn reset_runtime(&mut self, scheduler: &mut DeadlineScheduler) {
        self.tracker.restart(scheduler);
        self.book.clear_cooldowns();
        self.clear_derived_state();
    }

    /// Replaces the rule set. `config` must already be normalized (sorted,
    /// deduplicated, validated, emptied when voice is disabled), which
    /// `LiveCore` does for every snapshot it accepts. Returns whether the
    /// rules changed; the caller then re-syncs the batch-scoped inputs.
    pub fn apply_config(
        &mut self,
        config: &VoiceRuntimeSnapshot,
        entities: &EntityContext,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) -> bool {
        debug_assert!(
            (config.enabled || config.rules.is_empty())
                && config.rules.windows(2).all(|pair| pair[0].id < pair[1].id),
            "voice snapshots are normalized before they reach the projection"
        );
        let rules: Vec<VoiceRule> = config
            .rules
            .iter()
            .filter(|rule| rule.enabled)
            .cloned()
            .collect();
        if self.book.rules() == rules.as_slice() {
            return false;
        }
        self.book = RuleBook::build(rules, &self.book);
        self.tracker.restart(scheduler);
        self.clear_derived_state();
        self.buffs.replace(
            collect_buff_aggregates(entities, &self.buff_composites),
            false,
        );
        self.sync_buff_leads(VoiceSyncReason::Baseline, now_ms, now_mono, scheduler);
        true
    }

    /// Replaces the composite-buff definitions and silently re-derives the
    /// buff aggregates, so composite rules follow an edit right away.
    pub fn set_buff_composites(
        &mut self,
        buff_composites: Arc<BuffCompositeCatalog>,
        entities: &EntityContext,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        self.buff_composites = buff_composites;
        if !self.book.is_empty() {
            self.refresh_buffs(
                entities,
                VoiceSyncReason::Baseline,
                now_ms,
                now_mono,
                scheduler,
            );
        }
    }

    fn clear_derived_state(&mut self) {
        self.buffs.clear();
        self.counter_crossed.clear();
        self.skills.clear();
        self.entity_presence.clear();
        self.monster_skill_batch = None;
        self.monster_skills_fired.clear();
        self.seen = SeenInputs::default();
    }

    /// Per-event triggers: buff edges and leads, cast and alert edges, and
    /// timer deliveries.
    pub fn apply(
        &mut self,
        envelope: &DomainEnvelope,
        entities: &EntityContext,
        scheduler: &mut DeadlineScheduler,
    ) {
        if self.book.is_empty() {
            return;
        }
        let now_ms = envelope.occurred_at_ms;
        let now_mono = envelope.meta.mono_ms();
        match &envelope.event {
            DomainEvent::BuffChanged(buff) => {
                // Only the local player's and the current target's buffs feed
                // voice aggregates (see `collect_buff_aggregates`). Teammate
                // buff churn would otherwise rebuild and diff both scopes for
                // nothing on every raid-wide buff packet.
                if !buff.target_roles.is_local_player && !buff.target_roles.is_current_target {
                    return;
                }
                let reason = if buff.transition == BuffTransition::Baseline {
                    VoiceSyncReason::Baseline
                } else {
                    VoiceSyncReason::Runtime
                };
                self.refresh_buffs(entities, reason, now_ms, now_mono, scheduler);
            }
            DomainEvent::EntityDisappeared { .. } => {
                self.refresh_buffs(
                    entities,
                    VoiceSyncReason::Runtime,
                    now_ms,
                    now_mono,
                    scheduler,
                );
            }
            // These swap *whose* buffs are watched rather than changing a
            // buff, so they rebuild silently.
            DomainEvent::EntityAppeared { .. }
            | DomainEvent::IdentityChanged { .. }
            | DomainEvent::LocalPlayerChanged { .. }
            | DomainEvent::AttackTargetChanged { .. }
            | DomainEvent::DeathOccurred { .. } => {
                self.refresh_buffs(
                    entities,
                    VoiceSyncReason::Baseline,
                    now_ms,
                    now_mono,
                    scheduler,
                );
            }
            // The local player's casts arrive exactly once per cast as the
            // authoritative `CastStarted` (`Observed` echoes are dropped by
            // the entity context), so no dedup is needed here.
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase: SkillPhase::CastStarted,
                ..
            } if entities.local_player() == Some(*caster) => {
                self.fire_started(SubjectKey::Skill(*skill_id), now_ms);
            }
            DomainEvent::SkillLifecycleChanged {
                caster,
                skill_id,
                phase: SkillPhase::CastStarted | SkillPhase::Observed,
                ..
            } if !self
                .book
                .matching(SubjectKey::MonsterSkill(*skill_id))
                .is_empty()
                && is_world_monster(entities, caster.uuid) =>
            {
                if self.monster_skill_batch != Some(envelope.batch_id) {
                    self.monster_skill_batch = Some(envelope.batch_id);
                    self.monster_skills_fired.clear();
                }
                if self.monster_skills_fired.insert(*skill_id) {
                    self.fire_started(SubjectKey::MonsterSkill(*skill_id), now_ms);
                }
            }
            DomainEvent::BossMechanicStarted(mechanic) => {
                self.fire_started(SubjectKey::BossDbm(mechanic.base_skill_id), now_ms);
            }
            DomainEvent::MatchmakingPopped => {
                self.fire_started(SubjectKey::Alert(AlertKind::MatchmakingPopped), now_ms);
            }
            DomainEvent::ReadyCheckStarted => {
                self.fire_started(SubjectKey::Alert(AlertKind::ReadyCheckStarted), now_ms);
            }
            DomainEvent::TeamVoteStarted => {
                self.fire_started(SubjectKey::Alert(AlertKind::TeamVoteStarted), now_ms);
            }
            DomainEvent::DeadlineReached {
                key,
                scheduled_for,
                fired_at,
                ..
            } => self.on_deadline(*key, *scheduled_for, *fired_at, now_ms, scheduler),
            _ => {}
        }
    }

    /// Re-derives the batch-scoped subjects whose inputs moved since the
    /// last sync. Called at the end of every batch (runtime) and right after
    /// a configuration change (baseline); O(1) when nothing moved.
    pub(crate) fn sync_inputs(
        &mut self,
        reason: VoiceSyncReason,
        inputs: &VoiceInputs<'_>,
        now_ms: i64,
        now_mono: MonoTimeMs,
        scheduler: &mut DeadlineScheduler,
    ) {
        if self.book.is_empty() {
            return;
        }
        self.sync_counters(reason, inputs.counters, now_ms, now_mono, scheduler);
        self.sync_skills(reason, inputs.monitor, now_ms, now_mono, scheduler);
        self.sync_entities(
            reason,
            inputs.monitor,
            inputs.entities,
            now_ms,
            now_mono,
            scheduler,
        );
        self.sync_boss_mechanics(reason, inputs.monitor, now_ms, now_mono, scheduler);
    }

    fn on_deadline(
        &mut self,
        key: TimerKey,
        scheduled_for: MonoTimeMs,
        fired_at: MonoTimeMs,
        now_ms: i64,
        scheduler: &mut DeadlineScheduler,
    ) {
        // The tracker is the single source of truth for what is armed: a
        // stale, superseded or other-epoch delivery is rejected here.
        let Some((timer, armed)) = self.tracker.confirm(key, scheduled_for, fired_at) else {
            return;
        };
        match timer {
            VoiceTimer::Lead { rule, .. } => {
                self.fire(rule, now_ms, None, armed.valid_for_ms(fired_at));
            }
            // A refill wakeup carries no cue of its own: re-deriving at the
            // refill fires the charge edge and re-aims the lead cues.
            VoiceTimer::SkillRefill { .. } => {
                self.derive_skills(VoiceSyncReason::Runtime, now_ms, fired_at, scheduler);
            }
        }
    }

    /// Fires every `Started` rule on `key`: casts and alerts are
    /// instantaneous edges.
    fn fire_started(&mut self, key: SubjectKey, now_ms: i64) {
        let mut handles = std::mem::take(&mut self.handles);
        handles.clear();
        handles.extend(self.book.matching(key).iter().copied().filter(|handle| {
            self.book
                .get(*handle)
                .is_some_and(|rule| rule.trigger.event == VoiceEvent::Started)
        }));
        for &handle in &handles {
            self.fire(handle, now_ms, None, None);
        }
        self.handles = handles;
    }

    /// Reconciles `class` to the derived `self.leads` and announces the
    /// cues a runtime update pulled into the past.
    fn reconcile_leads(
        &mut self,
        class: TimerClass,
        now_ms: i64,
        now: MonoTimeMs,
        reason: VoiceSyncReason,
        scheduler: &mut DeadlineScheduler,
    ) {
        let mut fires = std::mem::take(&mut self.fires);
        fires.clear();
        self.tracker
            .reconcile(class, &self.leads, now, reason, scheduler, &mut fires);
        for fire in &fires {
            self.fire(fire.rule, now_ms, None, fire.valid_for_ms);
        }
        self.fires = fires;
    }

    fn fire(
        &mut self,
        handle: VoiceRuleHandle,
        now_ms: i64,
        tier: Option<u8>,
        valid_for_ms: Option<u64>,
    ) {
        let Some(rule) = self.book.try_fire(handle, now_ms) else {
            return;
        };
        let phrase_id = tier
            .and_then(|tier| {
                rule.phrase_id_by_tier
                    .as_ref()
                    .and_then(|phrases| phrases.get(&tier))
            })
            .unwrap_or(&rule.phrase_id)
            .clone();
        self.pending_cues.push(VoiceCueIntent {
            rule_id: rule.id.clone(),
            phrase_id,
            priority: rule.priority,
            triggered_at_ms: now_ms,
            valid_for_ms,
        });
    }
}
