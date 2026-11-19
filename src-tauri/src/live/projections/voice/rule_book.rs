//! The enabled rules of one voice rule set, indexed the way every trigger
//! path looks them up, plus each rule's cooldown clock.

use std::collections::HashMap;

use super::deadline::Lead;
use crate::live::runtime::events::{
    MonoTimeMs, VoiceBuffScope, VoiceLeadSubject, VoiceRuleHandle, VoiceTimer,
};
use crate::voice::models::{
    AlertKind, EntityOwnerScope, MAX_COUNTDOWN_FROM, MAX_LEAD_ADVANCE_MS, MonsterBuffSourceScope,
    VoiceEvent, VoiceRule, VoiceSubject,
};

/// How late a lead cue may still start: past this it would talk about a
/// moment that is no longer where the listener expects it.
const LATE_TOLERANCE_MS: u64 = 1_500;
/// How late a countdown digit may still start; later it is skipped.
const TICK_LATE_MS: u64 = 300;

/// When one `ExpiringIn` rule speaks relative to its subject's expiry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct LeadSpec {
    pub(super) handle: VoiceRuleHandle,
    /// The configured "N seconds before".
    pub(super) mark_ms: u64,
    /// When the phrase starts: `mark_ms` plus the rule's head start.
    lead_ms: u64,
    /// See [`Lead::late_ms`].
    late_ms: Option<u64>,
    /// Digits counted down after the phrase, highest first.
    ticks: u8,
}

impl LeadSpec {
    fn of(handle: VoiceRuleHandle, rule: &VoiceRule, seconds_before: u32) -> Self {
        let mark_ms = u64::from(seconds_before).saturating_mul(1_000);
        let advance = u64::from(rule.lead_advance_ms.min(MAX_LEAD_ADVANCE_MS));
        let lead_ms = mark_ms.saturating_add(advance);
        Self {
            handle,
            mark_ms,
            lead_ms,
            // A cue due at the expiry itself *is* that moment: never stale.
            late_ms: (lead_ms > 0).then(|| advance.saturating_add(LATE_TOLERANCE_MS).min(lead_ms)),
            ticks: rule
                .countdown_from
                .min(MAX_COUNTDOWN_FROM)
                .min(u8::try_from(seconds_before).unwrap_or(u8::MAX)),
        }
    }

    /// Whether the phrase is due at the expiry itself.
    pub(super) const fn is_at_expiry(self) -> bool {
        self.lead_ms == 0
    }

    /// Every timer this rule wants for a subject expiring at `expires`: the
    /// phrase, then one per counted digit.
    pub(super) fn push_timers(
        self,
        subject: VoiceLeadSubject,
        expires: MonoTimeMs,
        out: &mut Vec<Lead>,
    ) {
        out.push(Lead {
            timer: VoiceTimer::Lead {
                rule: self.handle,
                subject,
            },
            expires,
            lead_ms: self.lead_ms,
            late_ms: self.late_ms,
        });
        push_ticks(self.handle, subject, expires, self.ticks, out);
    }
}

pub(super) fn push_ticks(
    rule: VoiceRuleHandle,
    subject: VoiceLeadSubject,
    expires: MonoTimeMs,
    ticks: u8,
    out: &mut Vec<Lead>,
) {
    out.extend((1..=ticks).map(|n| Lead {
        timer: VoiceTimer::Tick { rule, subject, n },
        expires,
        lead_ms: u64::from(n) * 1_000,
        late_ms: Some(TICK_LATE_MS),
    }));
}

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
    MonsterSkill(i32),
    RosterSkill(i32),
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
            VoiceSubject::MonsterSkill { skill_id } => Self::MonsterSkill(*skill_id),
            VoiceSubject::RosterSkill { skill_id } => Self::RosterSkill(*skill_id),
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
    pub(super) lead: LeadSpec,
    pub(super) scope: VoiceBuffScope,
    pub(super) base_id: i32,
}

/// What a counter rule announces.
#[derive(Debug, Clone, Copy)]
pub(super) enum CounterCue {
    /// The slot's count reaching its threshold.
    Threshold,
    /// Ahead of the end of the slot's freeze window.
    Freeze(LeadSpec),
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
    /// `ExpiringIn`, aimed at the next refill.
    pub(super) ready_in: Vec<LeadSpec>,
}

/// An entity `ExpiringIn` rule.
#[derive(Debug, Clone, Copy)]
pub(super) struct EntityLeadRule {
    pub(super) lead: LeadSpec,
    pub(super) monster_id: i32,
    pub(super) scope: EntityOwnerScope,
}

/// A boss mechanic `ExpiringIn` rule.
#[derive(Debug, Clone, Copy)]
pub(super) struct BossLeadRule {
    pub(super) lead: LeadSpec,
    pub(super) base_skill_id: i32,
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
    /// Whether any rule listens to the battle roster, so the roster must be
    /// tracked even while its panel is hidden.
    pub(super) roster: bool,
    /// Roster skill `ExpiringIn` rules by skill id: ahead of the moment a
    /// roster monster may cast the skill (again).
    pub(super) roster_leads: HashMap<i32, Vec<LeadSpec>>,
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
        let lead = rule
            .trigger
            .seconds_before()
            .map(|seconds| LeadSpec::of(handle, rule, seconds));
        match (&rule.trigger.subject, &rule.trigger.event) {
            (VoiceSubject::Buff { .. } | VoiceSubject::MonsterBuff { .. }, _) => {
                if let (Some(lead), Some((scope, base_id))) =
                    (lead, buff_rule_scope(&rule.trigger.subject))
                {
                    self.buff_leads.push(BuffLeadRule {
                        lead,
                        scope,
                        base_id,
                    });
                }
            }
            (VoiceSubject::Counter { rule_id, slot_id }, event) => {
                let cue = match (event, lead) {
                    (VoiceEvent::Threshold, _) => CounterCue::Threshold,
                    (_, Some(lead)) => CounterCue::Freeze(lead),
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
            (VoiceSubject::Skill { skill_id }, event) => match (event, lead) {
                (VoiceEvent::Ended, _) => {
                    self.skills.entry(*skill_id).or_default().ready.push(handle);
                }
                (_, Some(lead)) if lead.is_at_expiry() => {
                    self.skills.entry(*skill_id).or_default().ready.push(handle);
                }
                (_, Some(lead)) => {
                    self.skills
                        .entry(*skill_id)
                        .or_default()
                        .ready_in
                        .push(lead);
                }
                _ => {}
            },
            (VoiceSubject::Entity { monster_id, scope }, event) => match (event, lead) {
                (VoiceEvent::Started | VoiceEvent::Ended, _) => self.entity_edges = true,
                (_, Some(lead)) => self.entity_leads.push(EntityLeadRule {
                    lead,
                    monster_id: *monster_id,
                    scope: *scope,
                }),
                _ => {}
            },
            (VoiceSubject::BossDbm { base_skill_id }, _) => {
                if let Some(lead) = lead {
                    self.boss_leads.push(BossLeadRule {
                        lead,
                        base_skill_id: *base_skill_id,
                    });
                }
            }
            // `Started` rides the cast edge the roster reports.
            (VoiceSubject::RosterSkill { skill_id }, _) => {
                self.roster = true;
                if let Some(lead) = lead {
                    self.roster_leads.entry(*skill_id).or_default().push(lead);
                }
            }
            // Cast edges only: a nearby monster's skill has no cooldown the
            // watch list tracks.
            (VoiceSubject::MonsterSkill { .. } | VoiceSubject::Alert { .. }, _) => {}
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
