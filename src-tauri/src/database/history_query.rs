//! Pure historical projections and backend-neutral detail/range DTOs.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::ops::Range;

use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

use crate::live::ipc::models::{DeathRecord, RawHitExtrema, to_raw_hit_extrema};
use crate::live::projections::combat::accumulator::{
    CombatAccumulator, CombatHitFact, CombatMetric, CombatSourceStats, CombatTargetStats,
    CombatantStats,
};
use crate::live::projections::combat::stats::class::{
    ClassSpec, get_class_id_from_spec, get_class_spec,
};
use crate::live::projections::combat::stats::{CombatStats, Skill, SkillTargetStats};

use super::commands::EncounterSummaryDto;
use crate::live::active_window::{ActiveWindowAdvance, BuffCoverageTracker, active_window_advance};

use super::event_journal::{
    EncounterHistoryDescriptor, EventJournalError, StoredHistoryChunk, StoredProjection,
    load_chunks_for_range, load_encounter_descriptor, load_projection,
};
use super::history_codec::{
    HistoryBuff, HistoryBuffEdge, HistoryCastKind, HistoryChunkDocument, HistoryCodecError,
    HistoryEntityContext, HistoryEnvelope, HistoryEvent, HistoryMetric, decode_history_chunk,
};

const KNOWN_QUALITY_FLAGS: i32 = (1 << 3) - 1;

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub enum HistoryQualityFlag {
    IncompleteSegment,
    MissingEntityContext,
    SaturatedAmount,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterTotalsData {
    pub damage: String,
    pub boss_damage: String,
    pub healing: String,
    pub effective_healing: String,
    pub damage_taken: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterStatsData {
    pub total: String,
    pub effective_total: String,
    pub hits: String,
    pub critical_hits: String,
    pub critical_total: String,
    pub lucky_hits: String,
    pub lucky_total: String,
    pub trigger_hits: String,
    pub blocked_hits: String,
    pub lucky_block_hits: String,
    #[serde(default)]
    pub extrema: Option<RawHitExtrema>,
}

impl Default for EncounterStatsData {
    fn default() -> Self {
        Self {
            total: "0".to_string(),
            effective_total: "0".to_string(),
            hits: "0".to_string(),
            critical_hits: "0".to_string(),
            critical_total: "0".to_string(),
            lucky_hits: "0".to_string(),
            lucky_total: "0".to_string(),
            trigger_hits: "0".to_string(),
            blocked_hits: "0".to_string(),
            lucky_block_hits: "0".to_string(),
            extrema: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterSkillData {
    pub skill_id: String,
    pub metric: HistoryMetric,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub stats: EncounterStatsData,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterTargetBreakdownData {
    pub target_entity_id: String,
    pub target_display_uid: i64,
    pub target_name: Option<String>,
    pub target_monster_id: Option<i32>,
    pub is_boss: bool,
    pub stats: EncounterStatsData,
    pub skills: Vec<EncounterSkillData>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterSourceBreakdownData {
    pub source_monster_id: Option<i32>,
    pub stats: EncounterStatsData,
    pub skills: Vec<EncounterSkillData>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterDeathData {
    pub offset_ms: u64,
    pub source_entity_id: Option<String>,
    pub skill_id: Option<String>,
    pub replay: Option<DeathRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterEntityData {
    pub entity_id: String,
    pub display_uid: i64,
    pub name: Option<String>,
    pub class_id: Option<i32>,
    pub class_spec: Option<i32>,
    /// Resolved spec display name; `None` for monsters / unknown specs.
    /// `Option` fields decode as `None` from projections stored before this
    /// field existed, and are backfilled from `class_spec` at query time.
    #[serde(default)]
    pub class_spec_name: Option<String>,
    pub ability_score: Option<i32>,
    pub season_strength: Option<i32>,
    pub monster_id: Option<i32>,
    pub totals: EncounterTotalsData,
    pub skills: Vec<EncounterSkillData>,
    pub damage_targets: Vec<EncounterTargetBreakdownData>,
    pub healing_targets: Vec<EncounterTargetBreakdownData>,
    pub taken_sources: Vec<EncounterSourceBreakdownData>,
    pub deaths: Vec<EncounterDeathData>,
}

/// Per-entity damage hit stream: columnar (offset_ms, amount) pairs ordered
/// by time. Recomputed from raw chunks at query time; never persisted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterDamageHitsData {
    pub entity_id: String,
    pub offsets_ms: Vec<u64>,
    /// Single-hit amounts saturate at u64::MAX (u128 headroom only matters
    /// for accumulated totals, not individual hits).
    pub amounts: Vec<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterMarkerData {
    pub offset_ms: u64,
    pub sequence: u64,
    pub caster_entity_id: String,
    pub skill_id: String,
    pub kind: HistoryCastKind,
    /// Fantasy remodel tier when recorded. Absent on older encounters and non-fantasy casts.
    #[serde(default)]
    pub remodel_level: Option<i64>,
}

/// One contiguous wall-clock presence interval of a buff on an entity,
/// as segment offsets clamped to the queried range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterBuffSpanData {
    pub start_ms: u64,
    pub end_ms_exclusive: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterBuffLaneData {
    pub entity_id: String,
    pub base_id: i32,
    /// Buff-on time intersected with the active-combat windows (the
    /// "true dps" denominator rule). Compare against `active_window_ms`.
    pub covered_active_ms: u64,
    pub spans: Vec<EncounterBuffSpanData>,
    /// Grace credits sampled while this buff was present. Sequence ordering
    /// is resolved by the backend before exposing these compact points.
    #[serde(default)]
    pub grace_points: Vec<EncounterBuffGraceData>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterBuffGraceData {
    pub offset_ms: u64,
    pub credited_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterBuffTimelineData {
    pub active_window_ms: u64,
    /// Non-grace active intervals on the encounter offset axis.
    #[serde(default)]
    pub active_spans: Vec<EncounterBuffSpanData>,
    /// First-hit / post-inactivity credits for the denominator.
    #[serde(default)]
    pub grace_points: Vec<EncounterBuffGraceData>,
    pub lanes: Vec<EncounterBuffLaneData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterDetailData {
    pub encounter_id: i32,
    pub summary: EncounterSummaryDto,
    pub detail_available: bool,
    pub quality_flags: Vec<HistoryQualityFlag>,
    pub start_ms: u64,
    pub end_ms_exclusive: u64,
    pub totals: EncounterTotalsData,
    pub entities: Vec<EncounterEntityData>,
    /// Always recomputed from chunks on load; stored snapshots leave it empty.
    #[serde(default)]
    pub damage_hits: Vec<EncounterDamageHitsData>,
    pub markers: Vec<EncounterMarkerData>,
    /// Always recomputed from chunks on load; `None` for encounters recorded
    /// before buff timeline persistence existed.
    #[serde(default)]
    pub buff_timeline: Option<EncounterBuffTimelineData>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EncounterRangeData {
    pub encounter_id: i32,
    pub quality_flags: Vec<HistoryQualityFlag>,
    pub start_ms: u64,
    pub end_ms_exclusive: u64,
    pub totals: EncounterTotalsData,
    pub entities: Vec<EncounterEntityData>,
    /// Populated only on the detail path (which shares the range reducer
    /// drain); range recounts leave it empty since they render no curves.
    #[serde(default)]
    pub damage_hits: Vec<EncounterDamageHitsData>,
    pub markers: Vec<EncounterMarkerData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailProjectionSnapshot {
    pub last_sequence: u64,
    pub contexts: BTreeMap<i64, HistoryEntityContext>,
    pub detail: EncounterDetailData,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedProjectionSnapshot {
    pub last_sequence: u64,
    pub quality_flags: i32,
    pub data: Vec<u8>,
}

#[derive(Debug)]
pub struct EncounterDetailQuery {
    summary: EncounterSummaryDto,
    descriptor: EncounterHistoryDescriptor,
    projection: Option<StoredProjection>,
    chunks: Vec<StoredHistoryChunk>,
    timeline_end_ms_exclusive: u64,
}

#[derive(Debug)]
pub struct EncounterRangeQuery {
    encounter_id: i32,
    descriptor: EncounterHistoryDescriptor,
    projection: StoredProjection,
    chunks: Vec<StoredHistoryChunk>,
}

#[derive(Debug, thiserror::Error)]
pub enum HistoryProjectionError {
    #[error("range start {start_ms} is after end {end_ms}")]
    ReversedRange { start_ms: u64, end_ms: u64 },
    #[error("projection serialization failed: {0}")]
    Encode(String),
    #[error("projection decoding failed: {0}")]
    Decode(String),
}

/// Pure reducer shared by live finalization and historical range replay.
#[derive(Debug)]
pub struct HistoryProjectionReducer {
    range: Range<u64>,
    collect_dynamic_series: bool,
    collect_damage_hits: bool,
    accept_context_events: bool,
    last_sequence: u64,
    quality: BTreeSet<HistoryQualityFlag>,
    contexts: BTreeMap<i64, HistoryEntityContext>,
    combat: CombatAccumulator,
    deaths: BTreeMap<i64, Vec<EncounterDeathData>>,
    /// Per-actor damage hit stream: actor entity id -> (offset_ms, amount)
    /// pairs in replay order. Drained into the detail DTO; never persisted.
    entity_damage_hits: BTreeMap<i64, Vec<(u64, u64)>>,
    markers: Vec<EncounterMarkerData>,
    /// In-range player damage hits as (offset, sequence); the active-window
    /// clock for buff coverage replays exactly this stream.
    player_damage_hits: Vec<(u64, u64)>,
    /// Buff presence edges as (offset, sequence, record). Edges before the
    /// range are kept for state seeding and clamped at merge time.
    buff_edges: Vec<(u64, u64, HistoryBuff)>,
}

impl HistoryProjectionReducer {
    pub fn new(range: Range<u64>) -> Result<Self, HistoryProjectionError> {
        if range.start > range.end {
            return Err(HistoryProjectionError::ReversedRange {
                start_ms: range.start,
                end_ms: range.end,
            });
        }
        Ok(Self {
            range,
            collect_dynamic_series: true,
            collect_damage_hits: true,
            accept_context_events: true,
            last_sequence: 0,
            quality: BTreeSet::new(),
            contexts: BTreeMap::new(),
            combat: CombatAccumulator::default(),
            deaths: BTreeMap::new(),
            entity_damage_hits: BTreeMap::new(),
            markers: Vec::new(),
            player_damage_hits: Vec::new(),
            buff_edges: Vec::new(),
        })
    }

    #[must_use]
    pub fn without_dynamic_series(mut self) -> Self {
        self.collect_dynamic_series = false;
        self.collect_damage_hits = false;
        self
    }

    /// Toggles per-entity damage hit collection. Range recounts turn this off:
    /// they render no curves, so collecting the stream would be dead weight.
    #[must_use]
    pub fn with_damage_hits(mut self, collect: bool) -> Self {
        self.collect_damage_hits = collect;
        self
    }

    #[must_use]
    fn with_seeded_contexts_only(mut self) -> Self {
        self.accept_context_events = false;
        self
    }

    pub fn add_quality_flags(&mut self, flags: impl IntoIterator<Item = HistoryQualityFlag>) {
        self.quality.extend(flags);
    }

    pub fn seed_contexts(&mut self, contexts: impl IntoIterator<Item = HistoryEntityContext>) {
        for context in contexts {
            self.contexts.insert(context.entity_id, context);
        }
    }

    pub fn observe_sequence(&mut self, sequence: u64) {
        self.last_sequence = self.last_sequence.max(sequence);
    }

    pub fn apply_document(&mut self, document: &HistoryChunkDocument) {
        for envelope in document.envelopes() {
            self.apply(&envelope);
        }
    }

    pub fn apply(&mut self, envelope: &HistoryEnvelope) {
        self.last_sequence = self.last_sequence.max(envelope.sequence);
        if let HistoryEvent::EntityContext(context) = &envelope.event {
            if self.accept_context_events {
                self.contexts.insert(context.entity_id, context.clone());
            }
            return;
        }
        if let HistoryEvent::Buff(record) = &envelope.event {
            // Pre-range edges are kept to seed presence state; edges past the
            // range end can never influence it.
            if self.collect_dynamic_series && envelope.offset_ms < self.range.end {
                self.buff_edges
                    .push((envelope.offset_ms, envelope.sequence, *record));
            }
            return;
        }
        if envelope.offset_ms < self.range.start || envelope.offset_ms >= self.range.end {
            return;
        }

        match &envelope.event {
            HistoryEvent::Hit(hit) => {
                let fact = CombatHitFact::from(hit);
                if self.combat.apply(&fact) {
                    self.quality.insert(HistoryQualityFlag::SaturatedAmount);
                }
                if self.collect_dynamic_series && fact.metric == CombatMetric::Damage {
                    self.player_damage_hits
                        .push((envelope.offset_ms, envelope.sequence));
                    if self.collect_damage_hits {
                        let amount = match u64::try_from(fact.amount) {
                            Ok(value) => value,
                            Err(_) => {
                                self.quality.insert(HistoryQualityFlag::SaturatedAmount);
                                u64::MAX
                            }
                        };
                        self.entity_damage_hits
                            .entry(fact.actor_entity_id)
                            .or_default()
                            .push((envelope.offset_ms, amount));
                    }
                }
            }
            HistoryEvent::SkillCast(cast) if self.collect_dynamic_series => {
                self.markers.push(EncounterMarkerData {
                    offset_ms: envelope.offset_ms,
                    sequence: envelope.sequence,
                    caster_entity_id: cast.caster_entity_id.to_string(),
                    skill_id: cast.skill_id.to_string(),
                    kind: cast.kind,
                    remodel_level: cast.remodel_level,
                })
            }
            HistoryEvent::SkillCast(_) => {}
            HistoryEvent::Death(death) => {
                self.deaths
                    .entry(death.entity_id)
                    .or_default()
                    .push(EncounterDeathData {
                        offset_ms: envelope.offset_ms,
                        source_entity_id: death.source_entity_id.map(|id| id.to_string()),
                        skill_id: death.skill_id.map(|id| id.to_string()),
                        replay: death.replay.as_ref().map(DeathRecord::from),
                    });
            }
            HistoryEvent::EntityContext(_) | HistoryEvent::Buff(_) => {}
        }
    }

    #[cfg(test)]
    pub fn finish_detail(
        mut self,
        encounter_id: i32,
        summary: EncounterSummaryDto,
    ) -> DetailProjectionSnapshot {
        let combat = std::mem::take(&mut self.combat);
        self.finish_detail_with_combat(encounter_id, summary, &combat)
    }

    /// Build a finalized projection from the accumulator owned by live combat.
    pub fn finish_detail_with_combat(
        mut self,
        encounter_id: i32,
        summary: EncounterSummaryDto,
        combat: &CombatAccumulator,
    ) -> DetailProjectionSnapshot {
        let mut detail = self.build_detail(encounter_id, summary, combat);
        detail.start_ms = 0;
        detail.end_ms_exclusive = 0;
        detail.damage_hits.clear();
        detail.markers.clear();
        detail.buff_timeline = None;
        DetailProjectionSnapshot {
            last_sequence: self.last_sequence,
            contexts: self.contexts,
            detail,
        }
    }

    #[cfg(test)]
    fn finish_range(self, encounter_id: i32) -> EncounterRangeData {
        self.finish_range_with_buff(encounter_id).0
    }

    fn finish_range_with_buff(
        mut self,
        encounter_id: i32,
    ) -> (EncounterRangeData, Option<EncounterBuffTimelineData>) {
        let combat = std::mem::take(&mut self.combat);
        let detail = self.build_detail(encounter_id, empty_summary(encounter_id), &combat);
        let buff_timeline = detail.buff_timeline;
        let range = EncounterRangeData {
            encounter_id: detail.encounter_id,
            quality_flags: detail.quality_flags,
            start_ms: detail.start_ms,
            end_ms_exclusive: detail.end_ms_exclusive,
            totals: detail.totals,
            entities: detail.entities,
            damage_hits: detail.damage_hits,
            markers: detail.markers,
        };
        (range, buff_timeline)
    }

    fn build_detail(
        &mut self,
        encounter_id: i32,
        summary: EncounterSummaryDto,
        combat: &CombatAccumulator,
    ) -> EncounterDetailData {
        if combat.is_saturated() {
            self.quality.insert(HistoryQualityFlag::SaturatedAmount);
        }

        let mut entity_ids = combat.entities.keys().copied().collect::<BTreeSet<_>>();
        entity_ids.extend(self.deaths.keys().copied());
        entity_ids.extend(
            self.buff_edges
                .iter()
                .map(|(_, _, record)| record.entity_id),
        );
        for entity_id in &entity_ids {
            if !self.contexts.contains_key(entity_id) {
                self.quality
                    .insert(HistoryQualityFlag::MissingEntityContext);
            }
        }
        for stats in combat.entities.values() {
            for target_id in stats
                .damage_targets
                .keys()
                .chain(stats.healing_targets.keys())
            {
                if !self.contexts.contains_key(target_id) {
                    self.quality
                        .insert(HistoryQualityFlag::MissingEntityContext);
                }
            }
        }
        for marker in &self.markers {
            if marker
                .caster_entity_id
                .parse::<i64>()
                .ok()
                .is_none_or(|id| !self.contexts.contains_key(&id))
            {
                self.quality
                    .insert(HistoryQualityFlag::MissingEntityContext);
            }
        }

        let entities = entity_ids
            .into_iter()
            .map(|entity_id| {
                let context = self.contexts.get(&entity_id);
                let stats = combat.entities.get(&entity_id);
                let inferred_spec = stats
                    .map(|stats| stats.class_spec)
                    .filter(|spec| *spec != ClassSpec::Unknown);
                let context_spec = context.and_then(|value| value.class_spec);
                let spec_name = inferred_spec.or_else(|| {
                    context_spec
                        .map(ClassSpec::from_i32)
                        .filter(|spec| *spec != ClassSpec::Unknown)
                });
                let damage_targets = stats.map_or_else(Vec::new, |stats| {
                    history_targets(
                        &stats.damage_targets,
                        &stats.damage_skills,
                        HistoryMetric::Damage,
                        &self.contexts,
                    )
                });
                let healing_targets = stats.map_or_else(Vec::new, |stats| {
                    history_targets(
                        &stats.healing_targets,
                        &stats.healing_skills,
                        HistoryMetric::Healing,
                        &self.contexts,
                    )
                });
                let taken_sources =
                    stats.map_or_else(Vec::new, |stats| history_sources(&stats.taken_sources));
                let deaths = self.deaths.remove(&entity_id).unwrap_or_default();
                EncounterEntityData {
                    entity_id: entity_id.to_string(),
                    display_uid: context.map_or(entity_id, |value| value.display_uid),
                    name: context.and_then(|value| value.name.clone()),
                    class_id: inferred_spec
                        .map(get_class_id_from_spec)
                        .or_else(|| context.and_then(|value| value.class_id)),
                    class_spec: inferred_spec.map(|spec| spec as i32).or(context_spec),
                    class_spec_name: spec_name.map(get_class_spec),
                    ability_score: context.and_then(|value| value.ability_score),
                    season_strength: context.and_then(|value| value.season_strength),
                    monster_id: context.and_then(|value| value.monster_id),
                    totals: EncounterTotalsData {
                        damage: stats.map_or(0, |stats| stats.damage.total).to_string(),
                        boss_damage: stats
                            .map_or(0, |stats| stats.damage_boss_only.total)
                            .to_string(),
                        healing: stats.map_or(0, |stats| stats.healing.total).to_string(),
                        effective_healing: stats
                            .map_or(0, |stats| stats.healing.effective_total)
                            .to_string(),
                        damage_taken: stats.map_or(0, |stats| stats.taken.total).to_string(),
                    },
                    skills: stats.map_or_else(Vec::new, history_skills),
                    damage_targets,
                    healing_targets,
                    taken_sources,
                    deaths,
                }
            })
            .collect();
        let damage_hits = std::mem::take(&mut self.entity_damage_hits)
            .into_iter()
            .filter(|(_, hits)| !hits.is_empty())
            .map(|(entity_id, mut hits)| {
                // Chunks replay in time order, so hits arrive sorted; sort
                // defensively since the DTO contract requires ascending
                // offsets.
                hits.sort_by_key(|hit| hit.0);
                EncounterDamageHitsData {
                    entity_id: entity_id.to_string(),
                    offsets_ms: hits.iter().map(|hit| hit.0).collect(),
                    amounts: hits.into_iter().map(|hit| hit.1).collect(),
                }
            })
            .collect();
        self.markers.sort_unstable_by(|left, right| {
            left.offset_ms
                .cmp(&right.offset_ms)
                .then_with(|| left.sequence.cmp(&right.sequence))
        });

        let buff_timeline = build_buff_timeline(
            &self.range,
            std::mem::take(&mut self.player_damage_hits),
            std::mem::take(&mut self.buff_edges),
        );

        EncounterDetailData {
            encounter_id,
            summary,
            detail_available: true,
            quality_flags: self.quality.iter().copied().collect(),
            start_ms: self.range.start,
            end_ms_exclusive: self.range.end,
            totals: EncounterTotalsData {
                damage: combat.totals.damage.to_string(),
                boss_damage: combat.totals.boss_damage.to_string(),
                healing: combat.totals.healing.to_string(),
                effective_healing: combat.totals.effective_healing.to_string(),
                damage_taken: combat.totals.damage_taken.to_string(),
            },
            entities,
            damage_hits,
            markers: std::mem::take(&mut self.markers),
            buff_timeline,
        }
    }
}

/// Per-key wall-clock span state used while replaying merged buff edges.
#[derive(Debug, Default)]
struct BuffSpanState {
    on_since_ms: Option<u64>,
    expires_hint_ms: Option<u64>,
    spans: Vec<EncounterBuffSpanData>,
}

impl BuffSpanState {
    /// Closes an expired presence at its hint before applying time `at`.
    fn settle(&mut self, at: u64) {
        let Some(on_since) = self.on_since_ms else {
            return;
        };
        let Some(hint) = self.expires_hint_ms else {
            return;
        };
        if hint <= at {
            self.push_span(on_since, hint);
            self.on_since_ms = None;
            self.expires_hint_ms = None;
        }
    }

    fn push_span(&mut self, start: u64, end: u64) {
        if end > start {
            self.spans.push(EncounterBuffSpanData {
                start_ms: start,
                end_ms_exclusive: end,
            });
        }
    }

    fn set_on(&mut self, at: u64, hint: Option<u64>) {
        self.settle(at);
        if self.on_since_ms.is_none() {
            self.on_since_ms = Some(at);
        }
        self.expires_hint_ms = hint;
    }

    fn set_off(&mut self, at: u64) {
        self.settle(at);
        if let Some(on_since) = self.on_since_ms.take() {
            self.push_span(on_since, at);
        }
        self.expires_hint_ms = None;
    }

    fn finish(mut self, range_end: u64) -> Vec<EncounterBuffSpanData> {
        if let Some(on_since) = self.on_since_ms.take() {
            let end = self
                .expires_hint_ms
                .map_or(range_end, |hint| hint.min(range_end));
            self.push_span(on_since, end);
        }
        self.spans
    }
}

/// Replays merged (by sequence) buff edges and player damage hits through the
/// shared coverage tracker, and derives wall-clock presence spans in the same
/// pass. Returns `None` when the encounter carries no buff edges at all —
/// the frontend's "recorded before buff persistence" degradation signal.
fn build_buff_timeline(
    range: &Range<u64>,
    hits: Vec<(u64, u64)>,
    edges: Vec<(u64, u64, HistoryBuff)>,
) -> Option<EncounterBuffTimelineData> {
    if edges.is_empty() {
        return None;
    }

    enum ReplayItem {
        Hit {
            offset_ms: u64,
            sequence: u64,
        },
        Edge {
            offset_ms: u64,
            sequence: u64,
            record: HistoryBuff,
        },
    }

    impl ReplayItem {
        const fn sequence(&self) -> u64 {
            match self {
                Self::Hit { sequence, .. } | Self::Edge { sequence, .. } => *sequence,
            }
        }
    }

    let mut replay = Vec::with_capacity(hits.len() + edges.len());
    replay.extend(
        hits.into_iter()
            .map(|(offset_ms, sequence)| ReplayItem::Hit {
                offset_ms,
                sequence,
            }),
    );
    replay.extend(
        edges
            .into_iter()
            .map(|(offset_ms, sequence, record)| ReplayItem::Edge {
                offset_ms,
                sequence,
                record,
            }),
    );
    replay.sort_unstable_by_key(ReplayItem::sequence);

    let mut tracker = BuffCoverageTracker::default();
    let mut span_states: BTreeMap<(i64, i32), BuffSpanState> = BTreeMap::new();
    let mut lane_grace = BTreeMap::<(i64, i32), Vec<EncounterBuffGraceData>>::new();
    let mut active_spans = Vec::<EncounterBuffSpanData>::new();
    let mut grace_points = Vec::<EncounterBuffGraceData>::new();
    let mut last_hit_offset_ms = None;
    let mut active_window_ms = 0u128;

    for item in replay {
        match item {
            ReplayItem::Edge {
                offset_ms, record, ..
            } => {
                // Pre-range edges seed state at the range start without adding time.
                let at = offset_ms.max(range.start);
                let key = (record.entity_id, record.base_id);
                let state = span_states.entry(key).or_default();
                let hint = record.expires_offset_ms;
                match record.edge {
                    HistoryBuffEdge::Baseline | HistoryBuffEdge::Applied => {
                        tracker.set_on(key, at, hint);
                        state.set_on(at, hint);
                    }
                    HistoryBuffEdge::Refreshed => {
                        tracker.refresh_hint(key, at, hint);
                        state.set_on(at, hint);
                    }
                    HistoryBuffEdge::LayerChanged => {}
                    HistoryBuffEdge::Removed => {
                        tracker.set_off(key, at);
                        state.set_off(at);
                    }
                }
            }
            ReplayItem::Hit { offset_ms, .. } => {
                let advance = active_window_advance(last_hit_offset_ms, offset_ms);
                active_window_ms =
                    active_window_ms.saturating_add(u128::from(advance.credited_ms()));
                tracker.apply_advance(advance);
                match advance {
                    ActiveWindowAdvance::FullGap {
                        start_offset_ms,
                        end_offset_ms,
                    } => push_merged_span(
                        &mut active_spans,
                        start_offset_ms.max(range.start),
                        end_offset_ms.min(range.end),
                    ),
                    ActiveWindowAdvance::Grace {
                        at_offset_ms,
                        credited_ms,
                    } => {
                        let point = EncounterBuffGraceData {
                            offset_ms: at_offset_ms,
                            credited_ms,
                        };
                        grace_points.push(point);
                        for (key, state) in &mut span_states {
                            state.settle(at_offset_ms);
                            if state.on_since_ms.is_some() {
                                lane_grace.entry(*key).or_default().push(point);
                            }
                        }
                    }
                }
                last_hit_offset_ms = Some(offset_ms);
            }
        }
    }

    let effective_active_ms =
        active_window_ms.min(u128::from(range.end.saturating_sub(range.start)));
    let lanes = span_states
        .into_iter()
        .map(|(key, state)| EncounterBuffLaneData {
            entity_id: key.0.to_string(),
            base_id: key.1,
            covered_active_ms: u64::try_from(tracker.coverage_ms(key).min(effective_active_ms))
                .unwrap_or(u64::MAX),
            spans: state.finish(range.end),
            grace_points: lane_grace.remove(&key).unwrap_or_default(),
        })
        .collect();
    Some(EncounterBuffTimelineData {
        active_window_ms: u64::try_from(effective_active_ms).unwrap_or(u64::MAX),
        active_spans,
        grace_points,
        lanes,
    })
}

fn push_merged_span(spans: &mut Vec<EncounterBuffSpanData>, start: u64, end: u64) {
    if end <= start {
        return;
    }
    if let Some(last) = spans.last_mut()
        && start <= last.end_ms_exclusive
    {
        last.end_ms_exclusive = last.end_ms_exclusive.max(end);
        return;
    }
    spans.push(EncounterBuffSpanData {
        start_ms: start,
        end_ms_exclusive: end,
    });
}

fn history_skills(stats: &CombatantStats) -> Vec<EncounterSkillData> {
    let mut skills = Vec::with_capacity(
        stats.damage_skills.len() + stats.healing_skills.len() + stats.taken_skills.len(),
    );
    skills.extend(
        stats
            .damage_skills
            .iter()
            .map(|(skill_id, skill)| history_skill(*skill_id, HistoryMetric::Damage, skill)),
    );
    skills.extend(
        stats
            .healing_skills
            .iter()
            .map(|(skill_id, skill)| history_skill(*skill_id, HistoryMetric::Healing, skill)),
    );
    skills.extend(
        stats
            .taken_skills
            .iter()
            .map(|(skill_id, skill)| history_skill(*skill_id, HistoryMetric::DamageTaken, skill)),
    );
    sort_history_skills(&mut skills);
    skills
}

fn history_targets(
    targets: &HashMap<i64, CombatTargetStats>,
    overall_skills: &HashMap<i64, Skill>,
    metric: HistoryMetric,
    contexts: &BTreeMap<i64, HistoryEntityContext>,
) -> Vec<EncounterTargetBreakdownData> {
    let mut targets = targets.iter().collect::<Vec<_>>();
    targets.sort_unstable_by(|left, right| {
        right
            .1
            .stats
            .total_value
            .cmp(&left.1.stats.total_value)
            .then_with(|| left.0.cmp(right.0))
    });
    targets
        .into_iter()
        .map(|(target_id, target)| {
            let context = contexts.get(target_id);
            let mut skills = target
                .skills
                .iter()
                .map(|(skill_id, stats)| EncounterSkillData {
                    skill_id: skill_id.to_string(),
                    metric,
                    property: overall_skills
                        .get(skill_id)
                        .and_then(|skill| skill.property),
                    damage_mode: overall_skills
                        .get(skill_id)
                        .and_then(|skill| skill.damage_mode),
                    stats: target_stats_data(stats),
                })
                .collect::<Vec<_>>();
            sort_history_skills(&mut skills);
            EncounterTargetBreakdownData {
                target_entity_id: target_id.to_string(),
                target_display_uid: context.map_or_else(
                    || crate::live::entity_id::uid_from_uuid(*target_id),
                    |value| value.display_uid,
                ),
                target_name: context.and_then(|value| value.name.clone()),
                target_monster_id: target
                    .stats
                    .target_monster_id
                    .or_else(|| context.and_then(|value| value.monster_id)),
                is_boss: target.is_boss,
                stats: target_stats_data(&target.stats),
                skills,
            }
        })
        .collect()
}

fn history_sources(
    sources: &HashMap<Option<i32>, CombatSourceStats>,
) -> Vec<EncounterSourceBreakdownData> {
    let mut sources = sources.iter().collect::<Vec<_>>();
    sources.sort_unstable_by(|left, right| {
        right
            .1
            .stats
            .total
            .cmp(&left.1.stats.total)
            .then_with(|| left.0.cmp(right.0))
    });
    sources
        .into_iter()
        .map(|(source_monster_id, source)| {
            let mut skills = source
                .skills
                .iter()
                .map(|(skill_id, skill)| {
                    history_skill(*skill_id, HistoryMetric::DamageTaken, skill)
                })
                .collect::<Vec<_>>();
            sort_history_skills(&mut skills);
            EncounterSourceBreakdownData {
                source_monster_id: *source_monster_id,
                stats: combat_stats_data(&source.stats),
                skills,
            }
        })
        .collect()
}

fn sort_history_skills(skills: &mut [EncounterSkillData]) {
    skills.sort_unstable_by(|left, right| {
        right
            .stats
            .total
            .len()
            .cmp(&left.stats.total.len())
            .then_with(|| right.stats.total.cmp(&left.stats.total))
            .then_with(|| left.metric.cmp(&right.metric))
            .then_with(|| left.skill_id.cmp(&right.skill_id))
    });
}

fn history_skill(skill_id: i64, metric: HistoryMetric, skill: &Skill) -> EncounterSkillData {
    EncounterSkillData {
        skill_id: skill_id.to_string(),
        metric,
        property: skill.property,
        damage_mode: skill.damage_mode,
        stats: skill_stats_data(skill),
    }
}

fn skill_stats_data(skill: &Skill) -> EncounterStatsData {
    EncounterStatsData {
        total: skill.total_value.to_string(),
        effective_total: skill.effective_total_value.to_string(),
        hits: skill.hits.to_string(),
        critical_hits: skill.crit_hits.to_string(),
        critical_total: skill.crit_total_value.to_string(),
        lucky_hits: skill.lucky_hits.to_string(),
        lucky_total: skill.lucky_total_value.to_string(),
        trigger_hits: skill.trigger_hits.to_string(),
        blocked_hits: skill.block_hits.to_string(),
        lucky_block_hits: skill.lucky_block_hits.to_string(),
        extrema: to_raw_hit_extrema(skill.extrema),
    }
}

fn combat_stats_data(stats: &CombatStats) -> EncounterStatsData {
    EncounterStatsData {
        total: stats.total.to_string(),
        effective_total: stats.effective_total.to_string(),
        hits: stats.hits.to_string(),
        critical_hits: stats.crit_hits.to_string(),
        critical_total: stats.crit_total.to_string(),
        lucky_hits: stats.lucky_hits.to_string(),
        lucky_total: stats.lucky_total.to_string(),
        trigger_hits: stats.trigger_hits.to_string(),
        blocked_hits: stats.block_hits.to_string(),
        lucky_block_hits: stats.lucky_block_hits.to_string(),
        extrema: None,
    }
}

fn target_stats_data(stats: &SkillTargetStats) -> EncounterStatsData {
    EncounterStatsData {
        total: stats.total_value.to_string(),
        effective_total: stats.effective_total_value.to_string(),
        hits: stats.hits.to_string(),
        critical_hits: stats.crit_hits.to_string(),
        critical_total: stats.crit_total.to_string(),
        lucky_hits: stats.lucky_hits.to_string(),
        lucky_total: stats.lucky_total.to_string(),
        trigger_hits: stats.trigger_hits.to_string(),
        blocked_hits: "0".to_string(),
        lucky_block_hits: "0".to_string(),
        extrema: None,
    }
}

pub fn encode_detail_projection(
    snapshot: &DetailProjectionSnapshot,
) -> Result<EncodedProjectionSnapshot, HistoryProjectionError> {
    let encoded = rmp_serde::to_vec_named(snapshot)
        .map_err(|error| HistoryProjectionError::Encode(error.to_string()))?;
    let data = zstd::encode_all(&encoded[..], 3)
        .map_err(|error| HistoryProjectionError::Encode(error.to_string()))?;
    Ok(EncodedProjectionSnapshot {
        last_sequence: snapshot.last_sequence,
        quality_flags: quality_flags_to_bits(&snapshot.detail.quality_flags),
        data,
    })
}

pub fn decode_detail_projection(
    data: &[u8],
) -> Result<DetailProjectionSnapshot, HistoryProjectionError> {
    let decoded = zstd::decode_all(data)
        .map_err(|error| HistoryProjectionError::Decode(error.to_string()))?;
    let snapshot: DetailProjectionSnapshot = rmp_serde::from_slice(&decoded)
        .map_err(|error| HistoryProjectionError::Decode(error.to_string()))?;
    Ok(snapshot)
}

/// Read only compressed query inputs while borrowing the actor-owned connection.
pub fn load_encounter_detail_query(
    conn: &mut SqliteConnection,
    summary: EncounterSummaryDto,
) -> Result<EncounterDetailQuery, HistoryQueryError> {
    let descriptor = load_encounter_descriptor(conn, summary.id)?;
    let projection = load_projection(conn, summary.id)?;
    let timeline_end_ms_exclusive = encounter_duration_ms(&summary);
    let chunks = if projection.is_some() {
        load_chunks_for_range(conn, summary.id, 0, timeline_end_ms_exclusive)?
    } else {
        Vec::new()
    };
    Ok(EncounterDetailQuery {
        summary,
        descriptor,
        projection,
        chunks,
        timeline_end_ms_exclusive,
    })
}

/// Decode and project a detail query after releasing the SQLite actor.
pub fn project_encounter_detail(
    query: EncounterDetailQuery,
) -> Result<EncounterDetailData, HistoryQueryError> {
    let EncounterDetailQuery {
        summary,
        descriptor,
        projection,
        chunks,
        timeline_end_ms_exclusive,
    } = query;
    let Some(stored) = projection else {
        return Ok(unavailable_detail(summary, descriptor.quality_flags));
    };
    let snapshot = decode_detail_projection(&stored.data)?;
    let quality_flags = validate_projection_metadata(&descriptor, &stored, &snapshot)?;
    let (range, buff_timeline) = replay_chunks(
        summary.id,
        quality_flags,
        &snapshot,
        &chunks,
        0,
        timeline_end_ms_exclusive,
        true,
    )?;
    Ok(detail_from_range(summary, range, buff_timeline))
}

/// Replay only chunks intersecting the requested half-open range.
pub fn load_encounter_range_query(
    conn: &mut SqliteConnection,
    encounter_id: i32,
    start_ms: u64,
    end_ms_exclusive: u64,
) -> Result<EncounterRangeQuery, HistoryQueryError> {
    let descriptor = load_encounter_descriptor(conn, encounter_id)?;
    let projection = load_projection(conn, encounter_id)?
        .ok_or(HistoryQueryError::MissingProjection(encounter_id))?;
    let chunks = load_chunks_for_range(conn, encounter_id, start_ms, end_ms_exclusive)?;
    Ok(EncounterRangeQuery {
        encounter_id,
        descriptor,
        projection,
        chunks,
    })
}

/// Decode and replay a range after releasing the SQLite actor.
pub fn project_encounter_range(
    query: EncounterRangeQuery,
    start_ms: u64,
    end_ms_exclusive: u64,
) -> Result<EncounterRangeData, HistoryQueryError> {
    let snapshot = decode_detail_projection(&query.projection.data)?;
    let quality_flags =
        validate_projection_metadata(&query.descriptor, &query.projection, &snapshot)?;
    replay_chunks(
        query.encounter_id,
        quality_flags,
        &snapshot,
        &query.chunks,
        start_ms,
        end_ms_exclusive,
        false,
    )
    .map(|(range, _)| range)
}

fn replay_chunks(
    encounter_id: i32,
    quality_flags: i32,
    snapshot: &DetailProjectionSnapshot,
    chunks: &[StoredHistoryChunk],
    start_ms: u64,
    end_ms_exclusive: u64,
    collect_damage_hits: bool,
) -> Result<(EncounterRangeData, Option<EncounterBuffTimelineData>), HistoryQueryError> {
    let mut reducer = HistoryProjectionReducer::new(start_ms..end_ms_exclusive)?
        .with_seeded_contexts_only()
        .with_damage_hits(collect_damage_hits);
    reducer.seed_contexts(snapshot.contexts.values().cloned());
    reducer.add_quality_flags(quality_flags_from_bits(quality_flags));

    for chunk in chunks {
        let document = decode_history_chunk(&chunk.data, chunk.stream_kind)?;
        validate_chunk_metadata(chunk, &document)?;
        reducer.apply_document(&document);
    }
    Ok(reducer.finish_range_with_buff(encounter_id))
}

fn validate_projection_metadata(
    descriptor: &EncounterHistoryDescriptor,
    stored: &StoredProjection,
    snapshot: &DetailProjectionSnapshot,
) -> Result<i32, HistoryQueryError> {
    if stored.encounter_id != descriptor.encounter_id
        || stored.last_sequence != snapshot.last_sequence
    {
        return Err(HistoryQueryError::ProjectionSequenceMismatch {
            encounter_id: descriptor.encounter_id,
        });
    }

    let snapshot_flags = quality_flags_to_bits(&snapshot.detail.quality_flags);
    if descriptor.quality_flags < 0
        || stored.quality_flags < 0
        || descriptor.quality_flags & !KNOWN_QUALITY_FLAGS != 0
        || stored.quality_flags & !KNOWN_QUALITY_FLAGS != 0
        || descriptor.quality_flags != stored.quality_flags
        || snapshot_flags & !stored.quality_flags != 0
    {
        return Err(HistoryQueryError::ProjectionQualityMismatch {
            encounter_id: descriptor.encounter_id,
        });
    }
    Ok(descriptor.quality_flags | stored.quality_flags | snapshot_flags)
}

fn validate_chunk_metadata(
    chunk: &StoredHistoryChunk,
    document: &HistoryChunkDocument,
) -> Result<(), HistoryQueryError> {
    let event_count = u64::try_from(document.len()).ok();
    let first_sequence = document.sequences.first().copied();
    let last_sequence = document.sequences.last().copied();
    let start_offset_ms = document.offsets_ms.iter().copied().min();
    let end_offset_ms_exclusive = document
        .offsets_ms
        .iter()
        .copied()
        .max()
        .and_then(|value| value.checked_add(1));
    if event_count != Some(chunk.event_count)
        || first_sequence != Some(chunk.first_sequence)
        || last_sequence != Some(chunk.last_sequence)
        || start_offset_ms != Some(chunk.start_offset_ms)
        || end_offset_ms_exclusive != Some(chunk.end_offset_ms_exclusive)
    {
        return Err(HistoryQueryError::ChunkMetadataMismatch {
            encounter_id: chunk.encounter_id,
        });
    }
    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub enum HistoryQueryError {
    #[error(transparent)]
    Journal(#[from] EventJournalError),
    #[error(transparent)]
    Projection(#[from] HistoryProjectionError),
    #[error(transparent)]
    Chunk(#[from] HistoryCodecError),
    #[error("encounter {0} has no finalized projection")]
    MissingProjection(i32),
    #[error("encounter {encounter_id} projection sequence metadata is inconsistent")]
    ProjectionSequenceMismatch { encounter_id: i32 },
    #[error("encounter {encounter_id} projection quality metadata is inconsistent")]
    ProjectionQualityMismatch { encounter_id: i32 },
    #[error("encounter {encounter_id} chunk metadata is inconsistent")]
    ChunkMetadataMismatch { encounter_id: i32 },
}

fn encounter_duration_ms(summary: &EncounterSummaryDto) -> u64 {
    let duration_ms = if summary.duration.is_finite() && summary.duration > 0.0 {
        (summary.duration * 1_000.0).ceil().min(u64::MAX as f64) as u64
    } else {
        summary
            .ended_at_ms
            .and_then(|ended| ended.checked_sub(summary.started_at_ms))
            .and_then(|duration| u64::try_from(duration).ok())
            .unwrap_or_default()
    };
    duration_ms.max(1)
}

pub fn quality_flags_to_bits(flags: &[HistoryQualityFlag]) -> i32 {
    flags.iter().fold(0, |bits, flag| {
        bits | match flag {
            HistoryQualityFlag::IncompleteSegment => 1 << 0,
            HistoryQualityFlag::MissingEntityContext => 1 << 1,
            HistoryQualityFlag::SaturatedAmount => 1 << 2,
        }
    })
}

fn quality_flags_from_bits(bits: i32) -> Vec<HistoryQualityFlag> {
    let mut flags = Vec::with_capacity(3);
    if bits & (1 << 0) != 0 {
        flags.push(HistoryQualityFlag::IncompleteSegment);
    }
    if bits & (1 << 1) != 0 {
        flags.push(HistoryQualityFlag::MissingEntityContext);
    }
    if bits & (1 << 2) != 0 {
        flags.push(HistoryQualityFlag::SaturatedAmount);
    }
    flags
}

fn unavailable_detail(summary: EncounterSummaryDto, quality_flags: i32) -> EncounterDetailData {
    EncounterDetailData {
        encounter_id: summary.id,
        summary,
        detail_available: false,
        quality_flags: quality_flags_from_bits(quality_flags),
        start_ms: 0,
        end_ms_exclusive: 0,
        totals: EncounterTotalsData::default(),
        entities: Vec::new(),
        damage_hits: Vec::new(),
        markers: Vec::new(),
        buff_timeline: None,
    }
}

fn detail_from_range(
    summary: EncounterSummaryDto,
    range: EncounterRangeData,
    buff_timeline: Option<EncounterBuffTimelineData>,
) -> EncounterDetailData {
    EncounterDetailData {
        encounter_id: range.encounter_id,
        summary,
        detail_available: true,
        quality_flags: range.quality_flags,
        start_ms: range.start_ms,
        end_ms_exclusive: range.end_ms_exclusive,
        totals: range.totals,
        entities: range.entities,
        damage_hits: range.damage_hits,
        markers: range.markers,
        buff_timeline,
    }
}

fn empty_summary(encounter_id: i32) -> EncounterSummaryDto {
    EncounterSummaryDto {
        id: encounter_id,
        started_at_ms: 0,
        ended_at_ms: None,
        total_dmg: "0".to_string(),
        total_heal: "0".to_string(),
        scene_id: None,
        dungeon_difficulty: None,
        duration: 0.0,
        active_combat_duration: None,
        local_player_id: None,
        bosses: Vec::new(),
        players: Vec::new(),
        remote_encounter_id: None,
        is_favorite: false,
        detail_available: false,
        display_index: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::history_codec::{
        HistoryDeath, HistoryHit, HistorySkillCast, HistoryStream, encode_history_chunk,
    };
    use crate::live::projections::combat::accumulator::CombatHitFlags;
    use crate::live::projections::death::{
        DeathReplayBuff, DeathReplayDamage, DeathReplayParticipant, DeathReplaySnapshot,
    };

    fn hit(sequence: u64, offset_ms: u64, amount: u64) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::Hit(HistoryHit {
                actor_entity_id: 1,
                source_entity_id: Some(1),
                target_entity_id: 2,
                skill_id: 7,
                base_skill_id: Some(7),
                metric: HistoryMetric::Damage,
                amount: amount.into(),
                effective_amount: amount.into(),
                has_loss_breakdown: true,
                hp_loss: amount.into(),
                shield_loss: 0,
                flags: 0,
                target_is_boss: false,
                target_monster_id: None,
                source_monster_id: None,
                property: None,
                damage_mode: None,
            }),
        }
    }

    fn buff(
        sequence: u64,
        offset_ms: u64,
        edge: HistoryBuffEdge,
        expires_offset_ms: Option<u64>,
    ) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::Buff(HistoryBuff {
                entity_id: 1,
                base_id: 500,
                edge,
                layer: 1,
                expires_offset_ms,
            }),
        }
    }

    #[test]
    fn buff_timeline_is_none_without_buff_events() {
        let mut reducer = HistoryProjectionReducer::new(0..10_000).expect("reducer");
        reducer.apply(&hit(1, 1_000, 10));
        let detail = reducer.finish_detail(1, empty_summary(1));
        // finish_detail_with_combat clears dynamic fields, so check the range path.
        assert!(detail.detail.buff_timeline.is_none());

        let mut reducer = HistoryProjectionReducer::new(0..10_000).expect("reducer");
        reducer.apply(&hit(1, 1_000, 10));
        assert!(reducer.finish_range_with_buff(1).1.is_none());
    }

    #[test]
    fn buff_timeline_replay_matches_live_tracker() {
        // Live side: shared tracker fed in event order.
        let mut tracker = crate::live::active_window::BuffCoverageTracker::default();
        let key = (1i64, 500i32);
        let first = active_window_advance(None, 1_000);
        tracker.apply_advance(first);
        tracker.set_on(key, 1_500, Some(9_000));
        let second = active_window_advance(Some(1_000), 2_500);
        tracker.apply_advance(second);
        tracker.set_off(key, 3_000);
        let third = active_window_advance(Some(2_500), 4_000);
        tracker.apply_advance(third);
        let active_ms = first.credited_ms() + second.credited_ms() + third.credited_ms();

        // History side: same facts through the reducer.
        let mut reducer = HistoryProjectionReducer::new(0..20_000).expect("reducer");
        reducer.apply(&hit(1, 1_000, 10));
        reducer.apply(&buff(2, 1_500, HistoryBuffEdge::Applied, Some(9_000)));
        reducer.apply(&hit(3, 2_500, 10));
        reducer.apply(&buff(4, 3_000, HistoryBuffEdge::Removed, None));
        reducer.apply(&hit(5, 4_000, 10));
        let timeline = reducer.finish_range_with_buff(1).1.expect("buff timeline");

        assert_eq!(timeline.active_window_ms, active_ms);
        assert_eq!(timeline.lanes.len(), 1);
        assert_eq!(
            u128::from(timeline.lanes[0].covered_active_ms),
            tracker.coverage_ms(key)
        );
        assert_eq!(
            timeline.lanes[0].spans,
            vec![EncounterBuffSpanData {
                start_ms: 1_500,
                end_ms_exclusive: 3_000
            }]
        );
    }

    #[test]
    fn pre_range_edges_seed_state_clamped_to_range_start() {
        let mut reducer = HistoryProjectionReducer::new(5_000..10_000).expect("reducer");
        // Applied before the range with a hint inside it.
        reducer.apply(&buff(1, 2_000, HistoryBuffEdge::Applied, Some(8_000)));
        // First in-range damage hit earns the grace slice only.
        reducer.apply(&hit(2, 6_000, 10));
        reducer.apply(&hit(3, 7_000, 10));
        let timeline = reducer.finish_range_with_buff(1).1.expect("buff timeline");
        // active = 500 (grace) + 1000; buff covers all of it (expires at 8000).
        assert_eq!(timeline.active_window_ms, 1_500);
        assert_eq!(timeline.lanes[0].covered_active_ms, 1_500);
        assert_eq!(
            timeline.lanes[0].spans,
            vec![EncounterBuffSpanData {
                start_ms: 5_000,
                end_ms_exclusive: 8_000
            }]
        );
    }

    #[test]
    fn open_presence_is_closed_at_range_end() {
        let mut reducer = HistoryProjectionReducer::new(0..6_000).expect("reducer");
        reducer.apply(&buff(1, 1_000, HistoryBuffEdge::Applied, None));
        reducer.apply(&hit(2, 2_000, 10));
        let timeline = reducer.finish_range_with_buff(1).1.expect("buff timeline");
        assert_eq!(
            timeline.lanes[0].spans,
            vec![EncounterBuffSpanData {
                start_ms: 1_000,
                end_ms_exclusive: 6_000
            }]
        );
    }

    fn death(
        sequence: u64,
        offset_ms: u64,
        replay: Option<DeathReplaySnapshot>,
    ) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::Death(HistoryDeath {
                entity_id: 1,
                source_entity_id: Some(2),
                skill_id: Some(17_140_101),
                replay,
            }),
        }
    }

    fn death_replay(timestamp_ms: i64) -> DeathReplaySnapshot {
        DeathReplaySnapshot {
            victim_entity_uuid: 1,
            death_timestamp_ms: timestamp_ms,
            recent_damages: vec![DeathReplayDamage {
                timestamp_ms: timestamp_ms - 500,
                attacker_entity_uuid: Some(2),
                attacker_monster_type_id: Some(9_001),
                skill_key: 17_140_101,
                value: u128::MAX,
                property: Some(3),
                damage_mode: Some(2),
            }],
            victim_buffs: vec![DeathReplayBuff {
                base_id: 77,
                instance_id: 99,
                layer: 2,
                duration_ms: None,
                started_wall_ms: Some(timestamp_ms - 1_000),
                source_entity_uuid: Some(2),
                source_config_id: Some(700),
            }],
            participant_buffs: vec![DeathReplayParticipant {
                entity_uuid: Some(2),
                monster_type_id: Some(9_001),
                buffs: Vec::new(),
            }],
        }
    }

    fn metric_hit(sequence: u64, metric: HistoryMetric, amount: u64, flags: u8) -> HistoryEnvelope {
        metric_hit_at(sequence, sequence, metric, amount, flags)
    }

    fn metric_hit_at(
        sequence: u64,
        offset_ms: u64,
        metric: HistoryMetric,
        amount: u64,
        flags: u8,
    ) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::Hit(HistoryHit {
                actor_entity_id: 1,
                source_entity_id: Some(if metric == HistoryMetric::DamageTaken {
                    2
                } else {
                    1
                }),
                target_entity_id: if metric == HistoryMetric::DamageTaken {
                    1
                } else {
                    2
                },
                skill_id: 7,
                base_skill_id: Some(7),
                metric,
                amount: amount.into(),
                effective_amount: if metric == HistoryMetric::Healing {
                    u128::from(amount / 2)
                } else {
                    0
                },
                has_loss_breakdown: metric == HistoryMetric::DamageTaken,
                hp_loss: amount.into(),
                shield_loss: 0,
                flags,
                target_is_boss: metric == HistoryMetric::Damage,
                target_monster_id: None,
                source_monster_id: None,
                property: None,
                damage_mode: None,
            }),
        }
    }

    fn stored_chunk(
        encounter_id: i32,
        stream_kind: HistoryStream,
        chunk_index: u64,
        events: Vec<HistoryEnvelope>,
    ) -> StoredHistoryChunk {
        let chunk = encode_history_chunk(encounter_id, stream_kind, chunk_index, events)
            .expect("encode history chunk");
        StoredHistoryChunk {
            encounter_id: chunk.encounter_id,
            stream_kind: chunk.stream_kind,
            chunk_index: chunk.chunk_index,
            first_sequence: chunk.first_sequence,
            last_sequence: chunk.last_sequence,
            start_offset_ms: chunk.start_offset_ms,
            end_offset_ms_exclusive: chunk.end_offset_ms_exclusive,
            event_count: chunk.event_count,
            data: chunk.data,
        }
    }

    fn context_at(sequence: u64, offset_ms: u64, name: &str) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::EntityContext(HistoryEntityContext {
                entity_id: 1,
                display_uid: 1,
                name: Some(name.to_string()),
                class_id: None,
                class_spec: None,
                ability_score: None,
                season_strength: None,
                monster_id: None,
            }),
        }
    }

    fn replay_range(range: Range<u64>, chunks: &[StoredHistoryChunk]) -> EncounterRangeData {
        let mut seed = HistoryProjectionReducer::new(0..0).expect("seed reducer");
        seed.seed_contexts([HistoryEntityContext {
            entity_id: 1,
            display_uid: 1,
            name: Some("player".to_string()),
            class_id: None,
            class_spec: None,
            ability_score: None,
            season_strength: None,
            monster_id: None,
        }]);
        let mut snapshot = seed.finish_detail(1, empty_summary(1));
        snapshot.last_sequence = chunks
            .iter()
            .map(|chunk| chunk.last_sequence)
            .max()
            .unwrap_or_default();
        let intersecting = chunks
            .iter()
            .filter(|chunk| {
                chunk.start_offset_ms < range.end && chunk.end_offset_ms_exclusive > range.start
            })
            .cloned()
            .collect::<Vec<_>>();
        replay_chunks(
            1,
            0,
            &snapshot,
            &intersecting,
            range.start,
            range.end,
            false,
        )
        .map(|(range, _)| range)
        .expect("replay range")
    }

    #[test]
    fn range_replay_keeps_final_context_when_intersecting_chunk_contains_old_context() {
        let context_chunk = stored_chunk(
            1,
            HistoryStream::Context,
            0,
            vec![context_at(1, 0, "initial"), context_at(2, 1_000, "stale")],
        );
        let combat_chunk = stored_chunk(
            1,
            HistoryStream::Combat,
            0,
            vec![metric_hit_at(3, 100, HistoryMetric::Damage, 5, 0)],
        );
        let mut seed = HistoryProjectionReducer::new(0..0).expect("seed reducer");
        seed.seed_contexts([HistoryEntityContext {
            entity_id: 1,
            display_uid: 1,
            name: Some("final".to_string()),
            class_id: None,
            class_spec: None,
            ability_score: None,
            season_strength: None,
            monster_id: None,
        }]);
        let mut snapshot = seed.finish_detail(1, empty_summary(1));
        snapshot.last_sequence = 3;

        let (range, _) = replay_chunks(
            1,
            0,
            &snapshot,
            &[context_chunk, combat_chunk],
            0,
            500,
            false,
        )
        .expect("range replay");

        assert_eq!(range.entities[0].name.as_deref(), Some("final"));
    }

    #[test]
    fn adjacent_ranges_include_death_replays_by_death_offset_only() {
        let first_replay = death_replay(10_999);
        let second_replay = death_replay(11_000);
        let chunk = stored_chunk(
            1,
            HistoryStream::Combat,
            0,
            vec![
                death(1, 999, Some(first_replay.clone())),
                death(2, 1_000, Some(second_replay.clone())),
                death(3, 1_500, None),
            ],
        );

        let left = replay_range(0..1_000, std::slice::from_ref(&chunk));
        let right = replay_range(1_000..2_000, std::slice::from_ref(&chunk));

        assert_eq!(left.entities[0].deaths.len(), 1);
        assert_eq!(
            left.entities[0].deaths[0].replay,
            Some(DeathRecord::from(&first_replay))
        );
        assert_eq!(right.entities[0].deaths.len(), 2);
        assert_eq!(
            right.entities[0].deaths[0].replay,
            Some(DeathRecord::from(&second_replay))
        );
        assert!(right.entities[0].deaths[1].replay.is_none());
    }

    fn decimal(value: &str) -> u128 {
        value.parse().expect("decimal value")
    }

    fn assert_decimal_additive(whole: &str, left: &str, right: &str) {
        assert_eq!(decimal(whole), decimal(left) + decimal(right));
    }

    fn stats_for(range: &EncounterRangeData, metric: HistoryMetric) -> EncounterStatsData {
        range.entities[0]
            .skills
            .iter()
            .find(|skill| skill.metric == metric)
            .map(|skill| skill.stats.clone())
            .unwrap_or_else(|| EncounterStatsData {
                total: "0".to_string(),
                effective_total: "0".to_string(),
                critical_total: "0".to_string(),
                lucky_total: "0".to_string(),
                ..EncounterStatsData::default()
            })
    }

    fn target_stats_for(range: &EncounterRangeData, metric: HistoryMetric) -> EncounterStatsData {
        let Some(entity) = range.entities.first() else {
            return EncounterStatsData::default();
        };
        let targets = match metric {
            HistoryMetric::Damage => &entity.damage_targets,
            HistoryMetric::Healing => &entity.healing_targets,
            HistoryMetric::DamageTaken => return EncounterStatsData::default(),
        };
        targets
            .first()
            .map(|target| target.stats.clone())
            .unwrap_or_default()
    }

    fn source_stats_for(range: &EncounterRangeData) -> EncounterStatsData {
        range
            .entities
            .first()
            .and_then(|entity| entity.taken_sources.first())
            .map(|source| source.stats.clone())
            .unwrap_or_default()
    }

    fn assert_stats_additive(
        whole: &EncounterStatsData,
        left: &EncounterStatsData,
        right: &EncounterStatsData,
    ) {
        assert_decimal_additive(&whole.total, &left.total, &right.total);
        assert_decimal_additive(
            &whole.effective_total,
            &left.effective_total,
            &right.effective_total,
        );
        assert_decimal_additive(&whole.hits, &left.hits, &right.hits);
        assert_decimal_additive(
            &whole.critical_hits,
            &left.critical_hits,
            &right.critical_hits,
        );
        assert_decimal_additive(
            &whole.critical_total,
            &left.critical_total,
            &right.critical_total,
        );
        assert_decimal_additive(&whole.lucky_hits, &left.lucky_hits, &right.lucky_hits);
        assert_decimal_additive(&whole.lucky_total, &left.lucky_total, &right.lucky_total);
        assert_decimal_additive(&whole.trigger_hits, &left.trigger_hits, &right.trigger_hits);
        assert_decimal_additive(&whole.blocked_hits, &left.blocked_hits, &right.blocked_hits);
        assert_decimal_additive(
            &whole.lucky_block_hits,
            &left.lucky_block_hits,
            &right.lucky_block_hits,
        );
    }

    #[test]
    fn adjacent_half_open_ranges_are_additive_across_chunks() {
        let events = vec![
            metric_hit_at(0, 0, HistoryMetric::Damage, 5, CombatHitFlags::CRITICAL),
            metric_hit_at(1, 999, HistoryMetric::Healing, 8, 0),
            metric_hit_at(
                2,
                1_000,
                HistoryMetric::Damage,
                11,
                CombatHitFlags::ATTACKER_LUCKY,
            ),
            metric_hit_at(
                3,
                1_000,
                HistoryMetric::Healing,
                14,
                CombatHitFlags::ATTACKER_LUCKY,
            ),
            metric_hit_at(
                4,
                1_999,
                HistoryMetric::DamageTaken,
                17,
                CombatHitFlags::BLOCKED | CombatHitFlags::DEFENDER_LUCKY,
            ),
            metric_hit_at(5, 2_000, HistoryMetric::Damage, 19, 0),
        ];
        let chunks = vec![
            stored_chunk(1, HistoryStream::Combat, 0, events[..2].to_vec()),
            stored_chunk(1, HistoryStream::Combat, 1, events[2..].to_vec()),
        ];

        let whole = replay_range(0..2_000, &chunks);
        let left = replay_range(0..1_000, &chunks);
        let right = replay_range(1_000..2_000, &chunks);

        for totals in [
            (
                &whole.totals.damage,
                &left.totals.damage,
                &right.totals.damage,
            ),
            (
                &whole.totals.boss_damage,
                &left.totals.boss_damage,
                &right.totals.boss_damage,
            ),
            (
                &whole.totals.healing,
                &left.totals.healing,
                &right.totals.healing,
            ),
            (
                &whole.totals.effective_healing,
                &left.totals.effective_healing,
                &right.totals.effective_healing,
            ),
            (
                &whole.totals.damage_taken,
                &left.totals.damage_taken,
                &right.totals.damage_taken,
            ),
        ] {
            assert_decimal_additive(totals.0, totals.1, totals.2);
        }

        for metric in [
            HistoryMetric::Damage,
            HistoryMetric::Healing,
            HistoryMetric::DamageTaken,
        ] {
            assert_stats_additive(
                &stats_for(&whole, metric),
                &stats_for(&left, metric),
                &stats_for(&right, metric),
            );
        }
        for metric in [HistoryMetric::Damage, HistoryMetric::Healing] {
            assert_stats_additive(
                &target_stats_for(&whole, metric),
                &target_stats_for(&left, metric),
                &target_stats_for(&right, metric),
            );
        }
        assert_stats_additive(
            &source_stats_for(&whole),
            &source_stats_for(&left),
            &source_stats_for(&right),
        );
        assert_eq!(whole.totals.damage, "16");
        assert_eq!(whole.totals.healing, "22");
        assert_eq!(whole.totals.effective_healing, "11");
        assert_eq!(whole.totals.damage_taken, "17");
        assert_eq!(left.end_ms_exclusive, right.start_ms);
    }

    #[test]
    fn frozen_clock_offsets_have_no_pause_gap_and_remain_additive() {
        // These two events were captured six wall-clock seconds apart, but the
        // segment clock supplied to history froze for five paused seconds.
        let chunk = stored_chunk(
            1,
            HistoryStream::Combat,
            0,
            vec![
                metric_hit_at(0, 1_000, HistoryMetric::Damage, 10, 0),
                metric_hit_at(1, 2_000, HistoryMetric::Damage, 20, 0),
            ],
        );

        let whole = replay_range(1_000..2_001, std::slice::from_ref(&chunk));
        let left = replay_range(1_000..2_000, std::slice::from_ref(&chunk));
        let right = replay_range(2_000..2_001, &[chunk]);

        assert_eq!(whole.totals.damage, "30");
        assert_eq!(left.totals.damage, "10");
        assert_eq!(right.totals.damage, "20");
        assert_decimal_additive(
            &whole.totals.damage,
            &left.totals.damage,
            &right.totals.damage,
        );
        assert_eq!(whole.end_ms_exclusive - whole.start_ms, 1_001);
    }

    #[test]
    fn projection_codec_round_trips() {
        let mut reducer = HistoryProjectionReducer::new(0..10).expect("valid reducer");
        reducer.apply(&hit(0, 1, 42));
        let snapshot = reducer.finish_detail(9, empty_summary(9));
        let encoded = encode_detail_projection(&snapshot).expect("encode projection");
        let decoded = decode_detail_projection(&encoded.data).expect("decode projection");
        assert_eq!(decoded.detail.totals, snapshot.detail.totals);
        assert_eq!(decoded.last_sequence, snapshot.last_sequence);
        assert_eq!(HistoryStream::Combat.as_db_str(), "combat");
    }

    #[test]
    fn projection_metadata_merges_external_quality_and_rejects_divergence() {
        let mut reducer = HistoryProjectionReducer::new(0..10).expect("valid reducer");
        reducer.apply(&hit(0, 1, 42));
        let snapshot = reducer.finish_detail(9, empty_summary(9));
        let encoded = encode_detail_projection(&snapshot).expect("encode projection");
        let external_quality = quality_flags_to_bits(&[HistoryQualityFlag::IncompleteSegment]);
        let combined_quality = encoded.quality_flags | external_quality;
        let descriptor = EncounterHistoryDescriptor {
            encounter_id: 9,
            quality_flags: combined_quality,
            started_at_ms: 0,
            ended_at_ms: Some(10),
        };
        let mut stored = StoredProjection {
            encounter_id: 9,
            last_sequence: encoded.last_sequence,
            quality_flags: combined_quality,
            data: encoded.data,
        };

        assert_eq!(
            validate_projection_metadata(&descriptor, &stored, &snapshot)
                .expect("consistent metadata"),
            combined_quality
        );

        stored.quality_flags = encoded.quality_flags;
        assert!(matches!(
            validate_projection_metadata(&descriptor, &stored, &snapshot),
            Err(HistoryQueryError::ProjectionQualityMismatch { encounter_id: 9 })
        ));
    }

    #[test]
    fn canonical_metric_updates_exactly_one_combat_side() {
        let mut reducer = HistoryProjectionReducer::new(0..10).expect("reducer");
        reducer.seed_contexts([HistoryEntityContext {
            entity_id: 1,
            display_uid: 1,
            name: Some("player".to_string()),
            class_id: Some(1),
            class_spec: None,
            ability_score: None,
            season_strength: None,
            monster_id: None,
        }]);
        reducer.apply(&metric_hit(1, HistoryMetric::Damage, 100, 0));
        reducer.apply(&metric_hit(2, HistoryMetric::Healing, 40, 0));
        reducer.apply(&metric_hit(3, HistoryMetric::DamageTaken, 30, 0));

        let range = reducer.finish_range(1);
        assert_eq!(range.totals.damage, "100");
        assert_eq!(range.totals.healing, "40");
        assert_eq!(range.totals.effective_healing, "20");
        assert_eq!(range.totals.damage_taken, "30");
        let player = range
            .entities
            .iter()
            .find(|entity| entity.entity_id == "1")
            .expect("player projection");
        assert_eq!(player.totals.damage, "100");
        assert_eq!(player.totals.healing, "40");
        assert_eq!(player.totals.damage_taken, "30");
        assert!(range.entities.iter().all(|entity| entity.entity_id != "2"));
    }

    #[test]
    fn range_projects_target_and_source_breakdowns_without_top_level_pollution() {
        let mut reducer = HistoryProjectionReducer::new(0..1_000).expect("reducer");
        reducer.seed_contexts([
            HistoryEntityContext {
                entity_id: 1,
                display_uid: 101,
                name: Some("player".to_string()),
                class_id: Some(1),
                class_spec: None,
                ability_score: None,
                season_strength: None,
                monster_id: None,
            },
            HistoryEntityContext {
                entity_id: 2,
                display_uid: 202,
                name: Some("boss".to_string()),
                class_id: None,
                class_spec: None,
                ability_score: None,
                season_strength: None,
                monster_id: Some(30_001),
            },
            HistoryEntityContext {
                entity_id: 3,
                display_uid: 303,
                name: Some("ally".to_string()),
                class_id: Some(2),
                class_spec: None,
                ability_score: None,
                season_strength: None,
                monster_id: None,
            },
        ]);

        let mut damage = metric_hit_at(
            1,
            100,
            HistoryMetric::Damage,
            120,
            CombatHitFlags::CRITICAL | CombatHitFlags::ATTACKER_LUCKY,
        );
        let HistoryEvent::Hit(damage_hit) = &mut damage.event else {
            unreachable!("metric helper creates a hit")
        };
        damage_hit.target_entity_id = 2;
        damage_hit.target_is_boss = true;
        damage_hit.target_monster_id = Some(30_001);
        damage_hit.base_skill_id = Some(1_714);

        let mut healing =
            metric_hit_at(2, 200, HistoryMetric::Healing, 80, CombatHitFlags::CRITICAL);
        let HistoryEvent::Hit(healing_hit) = &mut healing.event else {
            unreachable!("metric helper creates a hit")
        };
        healing_hit.target_entity_id = 3;
        healing_hit.hp_loss = 0;

        let mut taken = metric_hit_at(
            3,
            300,
            HistoryMetric::DamageTaken,
            60,
            CombatHitFlags::BLOCKED | CombatHitFlags::DEFENDER_LUCKY,
        );
        let HistoryEvent::Hit(taken_hit) = &mut taken.event else {
            unreachable!("metric helper creates a hit")
        };
        taken_hit.source_monster_id = Some(9_001);

        reducer.apply(&damage);
        reducer.apply(&healing);
        reducer.apply(&taken);
        let range = reducer.finish_range(7);

        assert_eq!(range.entities.len(), 1, "targets are not top-level actors");
        let player = &range.entities[0];
        let damage_target = &player.damage_targets[0];
        assert_eq!(damage_target.target_entity_id, "2");
        assert_eq!(damage_target.target_display_uid, 202);
        assert_eq!(damage_target.target_name.as_deref(), Some("boss"));
        assert_eq!(damage_target.target_monster_id, Some(30_001));
        assert!(damage_target.is_boss);
        assert_eq!(damage_target.stats.total, "120");
        assert_eq!(damage_target.stats.critical_hits, "1");
        assert_eq!(damage_target.skills[0].stats.lucky_hits, "1");

        let healing_target = &player.healing_targets[0];
        assert_eq!(healing_target.target_entity_id, "3");
        assert_eq!(healing_target.target_name.as_deref(), Some("ally"));
        assert_eq!(healing_target.stats.total, "80");
        assert_eq!(healing_target.stats.effective_total, "40");

        let source = &player.taken_sources[0];
        assert_eq!(source.source_monster_id, Some(9_001));
        assert_eq!(source.stats.total, "60");
        assert_eq!(source.stats.blocked_hits, "1");
        assert_eq!(source.stats.lucky_hits, "1");
        assert_eq!(source.skills[0].metric, HistoryMetric::DamageTaken);
    }

    #[test]
    fn lucky_bonus_packets_do_not_count_as_triggers() {
        let mut reducer = HistoryProjectionReducer::new(0..10).expect("reducer");
        reducer.apply(&metric_hit(
            1,
            HistoryMetric::Damage,
            100,
            CombatHitFlags::ATTACKER_LUCKY,
        ));
        reducer.apply(&metric_hit(
            2,
            HistoryMetric::Damage,
            20,
            CombatHitFlags::LUCKY_BONUS_ONLY,
        ));

        let range = reducer.finish_range(1);
        let stats = &range.entities[0].skills[0].stats;
        assert_eq!(stats.total, "120");
        assert_eq!(stats.hits, "2");
        assert_eq!(stats.trigger_hits, "1");
        assert_eq!(stats.lucky_hits, "1");
        assert_eq!(stats.lucky_total, "20");
    }

    fn actor_hit(
        sequence: u64,
        offset_ms: u64,
        actor_entity_id: i64,
        metric: HistoryMetric,
        amount: u64,
    ) -> HistoryEnvelope {
        HistoryEnvelope {
            sequence,
            offset_ms,
            event: HistoryEvent::Hit(HistoryHit {
                actor_entity_id,
                source_entity_id: Some(actor_entity_id),
                target_entity_id: if metric == HistoryMetric::DamageTaken {
                    actor_entity_id
                } else {
                    99
                },
                skill_id: 7,
                base_skill_id: Some(7),
                metric,
                amount: amount.into(),
                effective_amount: amount.into(),
                has_loss_breakdown: metric == HistoryMetric::DamageTaken,
                hp_loss: amount.into(),
                shield_loss: 0,
                flags: 0,
                target_is_boss: false,
                target_monster_id: None,
                source_monster_id: None,
                property: None,
                damage_mode: None,
            }),
        }
    }

    fn damage_hits_row<'a>(
        range: &'a EncounterRangeData,
        entity_id: &str,
    ) -> Option<&'a EncounterDamageHitsData> {
        range
            .damage_hits
            .iter()
            .find(|row| row.entity_id == entity_id)
    }

    #[test]
    fn damage_hits_track_actors_per_hit_and_skip_other_metrics() {
        let mut reducer = HistoryProjectionReducer::new(0..10_000).expect("reducer");
        reducer.apply(&actor_hit(1, 100, 1, HistoryMetric::Damage, 100));
        reducer.apply(&actor_hit(2, 1_500, 1, HistoryMetric::Damage, 150));
        reducer.apply(&actor_hit(3, 100, 2, HistoryMetric::Damage, 300));
        reducer.apply(&actor_hit(4, 200, 2, HistoryMetric::Healing, 50));

        let range = reducer.finish_range(1);

        let actor_one = damage_hits_row(&range, "1").expect("actor 1 hits");
        assert_eq!(actor_one.offsets_ms, vec![100, 1_500]);
        assert_eq!(actor_one.amounts, vec![100, 150]);
        let actor_two = damage_hits_row(&range, "2").expect("actor 2 hits");
        assert_eq!(actor_two.offsets_ms, vec![100]);
        assert_eq!(actor_two.amounts, vec![300]);
        // Only damage hits are collected: healing/taken emit no rows, and the
        // per-entity streams partition the team damage total exactly.
        assert_eq!(range.damage_hits.len(), 2);
        let entity_damage: u64 = range
            .damage_hits
            .iter()
            .flat_map(|row| row.amounts.iter().copied())
            .sum();
        assert_eq!(entity_damage, 550);
        assert_eq!(range.totals.damage, "550");
    }

    #[test]
    fn damage_hits_are_sorted_and_saturate_at_u64_max() {
        let mut reducer = HistoryProjectionReducer::new(0..10_000).expect("reducer");
        reducer.apply(&actor_hit(1, 500, 1, HistoryMetric::Damage, 50));
        reducer.apply(&actor_hit(2, 100, 1, HistoryMetric::Damage, 10));
        let mut saturated = actor_hit(3, 800, 1, HistoryMetric::Damage, 1);
        if let HistoryEvent::Hit(hit) = &mut saturated.event {
            hit.amount = u128::MAX;
        }
        reducer.apply(&saturated);

        let range = reducer.finish_range(1);

        let row = damage_hits_row(&range, "1").expect("actor 1 hits");
        assert_eq!(row.offsets_ms, vec![100, 500, 800]);
        assert_eq!(row.amounts, vec![10, 50, u64::MAX]);
        assert!(
            range
                .quality_flags
                .contains(&HistoryQualityFlag::SaturatedAmount)
        );
    }

    #[test]
    fn range_replay_skips_damage_hits_collection() {
        let mut reducer = HistoryProjectionReducer::new(0..10_000)
            .expect("reducer")
            .with_damage_hits(false);
        reducer.apply(&actor_hit(1, 100, 1, HistoryMetric::Damage, 100));

        let range = reducer.finish_range(1);

        assert!(range.damage_hits.is_empty());
        assert_eq!(range.totals.damage, "100");
    }

    #[test]
    fn stored_projection_snapshot_drops_dynamic_series() {
        let mut reducer = HistoryProjectionReducer::new(0..10_000).expect("reducer");
        reducer.apply(&actor_hit(1, 100, 1, HistoryMetric::Damage, 100));

        let snapshot = reducer.finish_detail(1, empty_summary(1));

        assert!(snapshot.detail.damage_hits.is_empty());
        assert!(snapshot.detail.markers.is_empty());
    }

    #[test]
    fn context_class_spec_discriminant_resolves_spec_name() {
        let mut reducer = HistoryProjectionReducer::new(0..10).expect("reducer");
        reducer.seed_contexts([HistoryEntityContext {
            entity_id: 1,
            display_uid: 1,
            name: Some("player".to_string()),
            class_id: Some(12),
            class_spec: Some(15), // ClassSpec::Recovery discriminant
            ability_score: None,
            season_strength: None,
            monster_id: None,
        }]);
        reducer.apply(&actor_hit(1, 0, 1, HistoryMetric::Damage, 100));

        let range = reducer.finish_range(1);

        let entity = &range.entities[0];
        assert_eq!(entity.class_spec, Some(15));
        assert_eq!(entity.class_spec_name.as_deref(), Some("Recovery"));
    }

    #[test]
    fn default_detail_clips_trailing_heal_and_markers_to_duration() {
        let mut seed = HistoryProjectionReducer::new(0..0).expect("seed reducer");
        seed.seed_contexts([HistoryEntityContext {
            entity_id: 1,
            display_uid: 1,
            name: Some("player".to_string()),
            class_id: None,
            class_spec: None,
            ability_score: None,
            season_strength: None,
            monster_id: None,
        }]);
        let mut snapshot = seed.finish_detail(1, empty_summary(1));
        snapshot.last_sequence = 2;

        let combat_chunk = stored_chunk(
            1,
            HistoryStream::Combat,
            0,
            vec![
                metric_hit_at(0, 0, HistoryMetric::Damage, 100, 0),
                metric_hit_at(1, 2_000, HistoryMetric::Healing, 40, 0),
            ],
        );
        let timeline_chunk = stored_chunk(
            1,
            HistoryStream::Timeline,
            0,
            vec![HistoryEnvelope {
                sequence: 2,
                offset_ms: 2_500,
                event: HistoryEvent::SkillCast(HistorySkillCast {
                    caster_entity_id: 1,
                    skill_id: 42,
                    kind: HistoryCastKind::KeySkill,
                    remodel_level: None,
                }),
            }],
        );

        let encoded = encode_detail_projection(&snapshot).expect("encode snapshot");
        let stored = StoredProjection {
            encounter_id: 1,
            last_sequence: encoded.last_sequence,
            quality_flags: encoded.quality_flags,
            data: encoded.data,
        };
        let mut summary = empty_summary(1);
        summary.duration = 1.0;
        summary.detail_available = true;
        let descriptor = EncounterHistoryDescriptor {
            encounter_id: 1,
            quality_flags: stored.quality_flags,
            started_at_ms: 0,
            ended_at_ms: Some(3_000),
        };
        let chunks = vec![combat_chunk, timeline_chunk];
        let detail = project_encounter_detail(EncounterDetailQuery {
            summary: summary.clone(),
            descriptor: descriptor.clone(),
            projection: Some(stored.clone()),
            chunks: chunks.clone(),
            timeline_end_ms_exclusive: 1_000,
        })
        .expect("project clipped detail");

        assert_eq!(detail.end_ms_exclusive, 1_000);
        assert_eq!(detail.totals.damage, "100");
        assert_eq!(detail.totals.healing, "0");
        assert!(detail.markers.is_empty());

        let decoded = decode_detail_projection(&stored.data).expect("decode snapshot");
        let (full, _) =
            replay_chunks(1, 0, &decoded, &chunks, 0, 3_000, false).expect("full range");
        assert_eq!(full.totals.healing, "40");
        assert_eq!(full.markers.len(), 1);
        assert_eq!(full.markers[0].offset_ms, 2_500);
    }

    #[test]
    fn skill_cast_markers_preserve_remodel_level() {
        let mut reducer = HistoryProjectionReducer::new(0..10_000).expect("reducer");
        reducer.apply(&HistoryEnvelope {
            sequence: 1,
            offset_ms: 250,
            event: HistoryEvent::SkillCast(HistorySkillCast {
                caster_entity_id: 1,
                skill_id: 77,
                kind: HistoryCastKind::Fantasy,
                remodel_level: Some(5),
            }),
        });
        reducer.apply(&HistoryEnvelope {
            sequence: 2,
            offset_ms: 400,
            event: HistoryEvent::SkillCast(HistorySkillCast {
                caster_entity_id: 1,
                skill_id: 2316,
                kind: HistoryCastKind::KeySkill,
                remodel_level: None,
            }),
        });

        let range = reducer.finish_range(1);
        assert_eq!(range.markers.len(), 2);
        assert_eq!(range.markers[0].kind, HistoryCastKind::Fantasy);
        assert_eq!(range.markers[0].remodel_level, Some(5));
        assert_eq!(range.markers[1].kind, HistoryCastKind::KeySkill);
        assert_eq!(range.markers[1].remodel_level, None);
    }
}
