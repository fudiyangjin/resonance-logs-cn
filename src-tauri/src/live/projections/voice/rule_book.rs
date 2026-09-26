//! The enabled rules of one voice rule set, indexed the way every trigger
//! path looks them up, plus each rule's cooldown clock.

use std::collections::HashMap;

use crate::live::runtime::events::{VoiceBuffScope, VoiceRuleHandle};
use crate::voice::models::{
    AlertKind, EntityOwnerScope, MonsterBuffSourceScope, VoiceEvent, VoiceRule, VoiceSubject,
};

/// Lookup key derived from a [`VoiceSubject`] with scope details stripped:
/// the buff aggregates are keyed per base id, and the source scope is
/// checked when matching an edge against the candidate rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum SubjectKey {
    Buff(i32),
    MonsterBuff(i32),
    Skill(i32),
    Entity(i32),
    BossDbm(i32),
    Counter { rule_id: i32, slot_id: i32 },
    Alert(AlertKind),
}

impl SubjectKey {
    fn of(subject: &VoiceSubject) -> Self {
        match subject {
            VoiceSubject::Buff { buff_id } => Self::Buff(*buff_id),
            VoiceSubject::MonsterBuff { buff_id, .. } => Self::MonsterBuff(*buff_id),
            VoiceSubject::Skill { skill_id } => Self::Skill(*skill_id),
            VoiceSubject::Entity { monster_id, .. } => Self::Entity(*monster_id),
            VoiceSubject::BossDbm { base_skill_id } => Self::BossDbm(*base_skill_id),
            VoiceSubject::Counter { rule_id, slot_id } => Self::Counter {
                rule_id: *rule_id,
                slot_id: *slot_id,
            },
            VoiceSubject::Alert { alert } => Self::Alert(*alert),
        }
    }

    pub(super) const fn buff(scope: VoiceBuffScope, base_id: i32) -> Self {
        match scope {
            VoiceBuffScope::LocalPlayer => Self::Buff(base_id),
            VoiceBuffScope::MonsterAnySource | VoiceBuffScope::MonsterLocalPlayerSource => {
                Self::MonsterBuff(base_id)
            }
        }
    }
}

/// A buff `ExpiringIn` rule.
#[derive(Debug, Clone, Copy)]
pub(super) struct BuffLeadRule {
    pub(super) handle: VoiceRuleHandle,
    pub(super) scope: VoiceBuffScope,
    pub(super) base_id: i32,
    pub(super) lead_ms: u64,
}

/// What a counter rule announces.
#[derive(Debug, Clone, Copy)]
pub(super) enum CounterCue {
    /// The slot's count reaching its threshold.
    Threshold,
    /// `lead_ms` before the slot's freeze window ends.
    Freeze { lead_ms: u64 },
}

#[derive(Debug, Clone, Copy)]
pub(super) struct CounterRule {
    pub(super) handle: VoiceRuleHandle,
    pub(super) rule_id: i32,
    pub(super) slot_id: i32,
    pub(super) cue: CounterCue,
}

/// Cooldown rules of one local skill (`Skill/Started` is a cast edge).
#[derive(Debug, Default)]
pub(super) struct SkillRules {
    /// `Ended` and zero-lead `ExpiringIn`: every refilled charge.
    pub(super) ready: Vec<VoiceRuleHandle>,
    /// `ExpiringIn` as `(handle, lead_ms)`, aimed at the next refill.
    pub(super) ready_in: Vec<(VoiceRuleHandle, u64)>,
}

/// An entity `ExpiringIn` rule.
#[derive(Debug, Clone, Copy)]
pub(super) struct EntityLeadRule {
    pub(super) handle: VoiceRuleHandle,
    pub(super) monster_id: i32,
    pub(super) scope: EntityOwnerScope,
    pub(super) lead_ms: u64,
}

/// A boss mechanic `ExpiringIn` rule.
#[derive(Debug, Clone, Copy)]
pub(super) struct BossLeadRule {
    pub(super) handle: VoiceRuleHandle,
    pub(super) base_skill_id: i32,
    pub(super) lead_ms: u64,
}

#[derive(Debug, Default)]
pub(super) struct RuleBook {
    rules: Vec<VoiceRule>,
    by_subject: HashMap<SubjectKey, Vec<VoiceRuleHandle>>,
    pub(super) buff_leads: Vec<BuffLeadRule>,
    pub(super) counters: Vec<CounterRule>,
    pub(super) skills: HashMap<i32, SkillRules>,
    pub(super) entity_leads: Vec<EntityLeadRule>,
    /// Whether any `Entity/Started|Ended` rule needs presence edges.
    pub(super) entity_edges: bool,
    pub(super) boss_leads: Vec<BossLeadRule>,
    /// When each rule last spoke, by handle.
    last_fired_ms: Vec<Option<i64>>,
}

impl RuleBook {
    /// Indexes `rules` (enabled ones only). Each surviving rule keeps its
    /// cooldown clock from `previous` by rule id, so a config push — e.g. a
    /// phrase finishing generation — cannot make a rule speak twice inside
    /// its cooldown.
    pub(super) fn build(rules: Vec<VoiceRule>, previous: &Self) -> Self {
        let carried: HashMap<&str, i64> = previous
            .rules
            .iter()
            .zip(&previous.last_fired_ms)
            .filter_map(|(rule, last)| last.map(|at| (rule.id.as_str(), at)))
            .collect();
        let mut book = Self {
            last_fired_ms: rules
                .iter()
                .map(|rule| carried.get(rule.id.as_str()).copied())
                .collect(),
            ..Self::default()
        };
        for (index, rule) in rules.iter().enumerate() {
            let Ok(raw) = u32::try_from(index) else {
                break;
            };
            book.index(VoiceRuleHandle(raw), rule);
        }
        book.rules = rules;
        book
    }

    fn index(&mut self, handle: VoiceRuleHandle, rule: &VoiceRule) {
        self.by_subject
            .entry(SubjectKey::of(&rule.trigger.subject))
            .or_default()
            .push(handle);
        let lead_ms = rule
            .trigger
            .seconds_before()
            .map(|seconds| u64::from(seconds).saturating_mul(1_000));
        match (&rule.trigger.subject, &rule.trigger.event) {
            (VoiceSubject::Buff { .. } | VoiceSubject::MonsterBuff { .. }, _) => {
                if let (Some(lead_ms), Some((scope, base_id))) =
                    (lead_ms, buff_rule_scope(&rule.trigger.subject))
                {
                    self.buff_leads.push(BuffLeadRule {
                        handle,
                        scope,
                        base_id,
                        lead_ms,
                    });
                }
            }
            (VoiceSubject::Counter { rule_id, slot_id }, event) => {
                let cue = match (event, lead_ms) {
                    (VoiceEvent::Threshold, _) => CounterCue::Threshold,
                    (_, Some(lead_ms)) => CounterCue::Freeze { lead_ms },
                    _ => return,
                };
                self.counters.push(CounterRule {
                    handle,
                    rule_id: *rule_id,
                    slot_id: *slot_id,
                    cue,
                });
            }
            // "Ready in 0 s" is the refill itself, so it rides the edge. A
            // cast-only skill gets no entry: it needs no cooldown tracking.
            (VoiceSubject::Skill { skill_id }, event) => match (event, lead_ms) {
                (VoiceEvent::Ended, _) | (_, Some(0)) => {
                    self.skills.entry(*skill_id).or_default().ready.push(handle);
                }
                (_, Some(lead_ms)) => {
                    self.skills
                        .entry(*skill_id)
                        .or_default()
                        .ready_in
                        .push((handle, lead_ms));
                }
                _ => {}
            },
            (VoiceSubject::Entity { monster_id, scope }, event) => match (event, lead_ms) {
                (VoiceEvent::Started | VoiceEvent::Ended, _) => self.entity_edges = true,
                (_, Some(lead_ms)) => self.entity_leads.push(EntityLeadRule {
                    handle,
                    monster_id: *monster_id,
                    scope: *scope,
                    lead_ms,
                }),
                _ => {}
            },
            (VoiceSubject::BossDbm { base_skill_id }, _) => {
                if let Some(lead_ms) = lead_ms {
                    self.boss_leads.push(BossLeadRule {
                        handle,
                        base_skill_id: *base_skill_id,
                        lead_ms,
                    });
                }
            }
            (VoiceSubject::Alert { .. }, _) => {}
        }
    }

    pub(super) fn rules(&self) -> &[VoiceRule] {
        &self.rules
    }

    pub(super) fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }

    pub(super) fn get(&self, handle: VoiceRuleHandle) -> Option<&VoiceRule> {
        self.rules.get(handle.0 as usize)
    }

    /// Handles of every rule on `key`.
    pub(super) fn matching(&self, key: SubjectKey) -> &[VoiceRuleHandle] {
        self.by_subject.get(&key).map_or(&[], Vec::as_slice)
    }

    /// Starts `handle`'s cooldown unless it is still running; returns the
    /// rule when it may speak now.
    pub(super) fn try_fire(&mut self, handle: VoiceRuleHandle, now_ms: i64) -> Option<&VoiceRule> {
        let index = handle.0 as usize;
        let rule = self.rules.get(index)?;
        let last = self.last_fired_ms.get_mut(index)?;
        if last.is_some_and(|at| now_ms.saturating_sub(at) < rule.cooldown_ms as i64) {
            return None;
        }
        *last = Some(now_ms);
        Some(rule)
    }

    pub(super) fn clear_cooldowns(&mut self) {
        self.last_fired_ms.fill(None);
    }
}

/// The aggregate a buff-subject rule observes, or `None` for other subjects.
pub(super) fn buff_rule_scope(subject: &VoiceSubject) -> Option<(VoiceBuffScope, i32)> {
    match subject {
        VoiceSubject::Buff { buff_id } => Some((VoiceBuffScope::LocalPlayer, *buff_id)),
        VoiceSubject::MonsterBuff {
            buff_id,
            source_scope,
        } => Some((
            match source_scope {
                MonsterBuffSourceScope::AnySource => VoiceBuffScope::MonsterAnySource,
                MonsterBuffSourceScope::LocalPlayerSource => {
                    VoiceBuffScope::MonsterLocalPlayerSource
                }
            },
            *buff_id,
        )),
        _ => None,
    }
}
