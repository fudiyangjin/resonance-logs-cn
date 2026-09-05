/**
 * @file Adapters from the encounter-history DTOs (`EncounterDetailData` /
 * `EncounterRangeData`) to the row shapes consumed by the existing meter
 * table machinery (`computePlayerRowsFromEntities`, `groupSkillsByRecount`,
 * `buildSourceEntities`, death-replay components). Keeping the mapping in one
 * place lets the history page reuse the live table columns and settings
 * instead of duplicating formatting logic.
 */
import type {
  EncounterBuffTimelineData,
  EncounterDamageHitsData,
  EncounterEntityData,
  EncounterSkillData,
  EncounterStatsData,
  HistoryMetric,
} from "$lib/bindings";
import type {
  RawCombatStats,
  RawEntityData,
  RawSkillStats,
  RawPerSourceStats,
} from "$lib/api";
import type { DeathPlayerEntry } from "$lib/components/death-replay/death-player-list.svelte";
import type { EntityDamageHits } from "$lib/components/encounter-timeline/timeline-data";
import { formatClassSpecLabel } from "$lib/class-labels";
import { t } from "$lib/i18n/index.svelte";
import { ipcBigInt } from "$lib/ipc-decimal";
import { computePlayerRowsFromEntities } from "$lib/live-derived";
import { CLASS_MAP } from "$lib/utils.svelte";

/** Per-target breakdown in the shape the restored drill-down views consume. */
export type HistoryPerTargetStats = {
  targetEntityUuid: string;
  targetDisplayUid: number;
  targetMonsterId: number | null;
  targetName: string | null;
  isBoss: boolean;
  totalValue: string;
  damage: RawCombatStats;
  skills: Partial<Record<number, RawSkillStats>>;
};

/** A history entity with the drill-down extras the old page relied on. */
export type HistoryEntity = RawEntityData & {
  monsterId: number | null;
  dmgPerTarget: HistoryPerTargetStats[];
  healPerTarget: HistoryPerTargetStats[];
  deaths: EncounterEntityData["deaths"];
};

function zeroCombatStats(): RawCombatStats {
  return {
    total: "0",
    effectiveTotal: "0",
    hits: "0",
    critHits: "0",
    critTotal: "0",
    luckyHits: "0",
    luckyTotal: "0",
    triggerHits: "0",
    blockHits: "0",
    luckyBlockHits: "0",
  };
}

/** Rename the history stats DTO into the meter's `RawCombatStats` shape. */
export function historyStatsToCombat(
  stats: EncounterStatsData,
): RawCombatStats {
  return {
    total: stats.total,
    effectiveTotal: stats.effectiveTotal,
    hits: stats.hits,
    critHits: stats.criticalHits,
    critTotal: stats.criticalTotal,
    luckyHits: stats.luckyHits,
    luckyTotal: stats.luckyTotal,
    triggerHits: stats.triggerHits,
    blockHits: stats.blockedHits,
    luckyBlockHits: stats.luckyBlockHits,
  };
}

function historySkillStats(skill: EncounterSkillData): RawSkillStats {
  return {
    totalValue: skill.stats.total,
    effectiveTotalValue: skill.stats.effectiveTotal,
    hits: skill.stats.hits,
    critHits: skill.stats.criticalHits,
    critTotalValue: skill.stats.criticalTotal,
    luckyHits: skill.stats.luckyHits,
    luckyTotalValue: skill.stats.luckyTotal,
    property: skill.property,
    damageMode: skill.damageMode,
    triggerHits: skill.stats.triggerHits,
    blockHits: skill.stats.blockedHits,
    luckyBlockHits: skill.stats.luckyBlockHits,
    extrema: skill.stats.extrema ?? null,
  };
}

/** Skill map keyed by numeric id, filtered to one metric. */
export function historySkillRecord(
  skills: EncounterSkillData[],
  metric: HistoryMetric,
): Partial<Record<number, RawSkillStats>> {
  const record: Partial<Record<number, RawSkillStats>> = {};
  for (const skill of skills) {
    if (skill.metric !== metric) continue;
    const skillId = Number(skill.skillId);
    if (!Number.isFinite(skillId)) continue;
    record[skillId] = historySkillStats(skill);
  }
  return record;
}

/** Sum per-skill stats into one combat-stats bucket (bigint-exact). */
export function aggregateMetricStats(
  skills: EncounterSkillData[],
  metric: HistoryMetric,
): RawCombatStats {
  const total = zeroCombatStats();
  for (const skill of skills) {
    if (skill.metric !== metric) continue;
    const stats = historyStatsToCombat(skill.stats);
    total.total = (ipcBigInt(total.total) + ipcBigInt(stats.total)).toString();
    total.effectiveTotal = (
      ipcBigInt(total.effectiveTotal) + ipcBigInt(stats.effectiveTotal)
    ).toString();
    total.hits = (ipcBigInt(total.hits) + ipcBigInt(stats.hits)).toString();
    total.critHits = (
      ipcBigInt(total.critHits) + ipcBigInt(stats.critHits)
    ).toString();
    total.critTotal = (
      ipcBigInt(total.critTotal) + ipcBigInt(stats.critTotal)
    ).toString();
    total.luckyHits = (
      ipcBigInt(total.luckyHits) + ipcBigInt(stats.luckyHits)
    ).toString();
    total.luckyTotal = (
      ipcBigInt(total.luckyTotal) + ipcBigInt(stats.luckyTotal)
    ).toString();
    total.triggerHits = (
      ipcBigInt(total.triggerHits) + ipcBigInt(stats.triggerHits)
    ).toString();
    total.blockHits = (
      ipcBigInt(total.blockHits) + ipcBigInt(stats.blockHits)
    ).toString();
    total.luckyBlockHits = (
      ipcBigInt(total.luckyBlockHits) + ipcBigInt(stats.luckyBlockHits)
    ).toString();
  }
  return total;
}

function combatStatsFromTotal(total: string): RawCombatStats {
  return { ...zeroCombatStats(), total };
}

function historyPerTarget(
  target: EncounterEntityData["damageTargets"][number],
  metric: HistoryMetric,
): HistoryPerTargetStats {
  return {
    targetEntityUuid: target.targetEntityId,
    targetDisplayUid: target.targetDisplayUid,
    targetMonsterId: target.targetMonsterId,
    targetName: target.targetName,
    isBoss: target.isBoss,
    totalValue: target.stats.total,
    damage: historyStatsToCombat(target.stats),
    skills: historySkillRecord(target.skills, metric),
  };
}

/** Adapt one history entity into the meter's raw-entity row shape. */
export function historyEntityToRaw(entity: EncounterEntityData): HistoryEntity {
  return {
    entityUuid: entity.entityId,
    displayUid: entity.displayUid,
    name: entity.name ?? "",
    classId: entity.classId ?? 0,
    classSpec: entity.classSpec ?? 0,
    className: CLASS_MAP[entity.classId ?? 0] ?? "",
    classSpecName: entity.classSpecName ?? "",
    abilityScore: entity.abilityScore ?? 0,
    seasonStrength: entity.seasonStrength ?? 0,
    damage: aggregateMetricStats(entity.skills, "damage"),
    damageBossOnly: combatStatsFromTotal(entity.totals.bossDamage),
    healing: aggregateMetricStats(entity.skills, "healing"),
    taken: aggregateMetricStats(entity.skills, "damage_taken"),
    dmgSkills: historySkillRecord(entity.skills, "damage"),
    healSkills: historySkillRecord(entity.skills, "healing"),
    takenSkills: historySkillRecord(entity.skills, "damage_taken"),
    takenPerSource: entity.takenSources.map(
      (source): RawPerSourceStats => ({
        sourceMonsterId: source.sourceMonsterId,
        totalValue: source.stats.total,
        taken: historyStatsToCombat(source.stats),
        skills: historySkillRecord(source.skills, "damage_taken"),
      }),
    ),
    monsterId: entity.monsterId,
    dmgPerTarget: entity.damageTargets.map((target) =>
      historyPerTarget(target, "damage"),
    ),
    healPerTarget: entity.healingTargets.map((target) =>
      historyPerTarget(target, "healing"),
    ),
    deaths: entity.deaths,
  };
}

/** Death-replay player entries; only deaths carrying a replay are listed. */
export function historyDeathEntries(
  entities: EncounterEntityData[],
): DeathPlayerEntry[] {
  return entities
    .filter(
      (entity) =>
        entity.monsterId === null &&
        entity.deaths.some((death) => death.replay !== null),
    )
    .map((entity) => ({
      entityUuid: entity.entityId,
      displayUid: entity.displayUid,
      name: entity.name ?? `#${entity.displayUid}`,
      className: CLASS_MAP[entity.classId ?? 0] ?? "",
      classSpecName: entity.classSpecName ?? "",
      deaths: entity.deaths.flatMap((death) =>
        death.replay ? [death.replay] : [],
      ),
    }));
}

/** Map backend per-entity damage hit streams onto the chart component's DTO. */
export function historyDamageHits(
  hits: EncounterDamageHitsData[] | undefined,
): EntityDamageHits[] {
  return (hits ?? []).map((row) => ({
    entityUuid: row.entityId,
    timesMs: row.offsetsMs,
    amounts: row.amounts,
  }));
}

/**
 * Merged per-player row covering all three metrics, matching the column keys
 * of the history player tables (`historyDpsPlayerColumns` & friends).
 */
export type HistoryPlayerRow = {
  entityUuid: string;
  displayUid: number;
  name: string;
  isLocalPlayer: boolean;
  className: string;
  classSpecName: string;
  classDisplay: string;
  abilityScore: number;
  seasonStrength: number;
  totalDmg: number;
  dps: number;
  tdps: number;
  activeTimeMs: number;
  dmgPct: number;
  bossDmg: number;
  bossDps: number;
  bossDmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  blockRate: number;
  luckyBlockRate: number;
  hits: number;
  hitsPerMinute: number;
  damageTaken: number;
  tankedPS: number;
  tankedPct: number;
  critTakenRate: number;
  hitsTaken: number;
  healDealt: number;
  hps: number;
  effectiveHeal: number;
  ehps: number;
  healPct: number;
  critHealRate: number;
  hitsHeal: number;
};

function sumTotals(entities: RawEntityData[], metric: HistoryMetric): string {
  const total = entities.reduce((sum, entity) => {
    const stats =
      metric === "healing"
        ? entity.healing
        : metric === "damage_taken"
          ? entity.taken
          : entity.damage;
    return sum + ipcBigInt(stats.total);
  }, 0n);
  return total.toString();
}

/**
 * Build merged player rows from adapted history entities. `activeCombatMs`
 * drives the TDPS column; pass `null` to fall back to `elapsedMs` (e.g. when
 * viewing a brushed range, which has no separate active-combat window).
 */
export function buildHistoryPlayerRows(
  entities: RawEntityData[],
  elapsedMs: number,
  activeCombatMs: number | null,
  localUuid: string | null,
): HistoryPlayerRow[] {
  const source = {
    entities,
    elapsedMs,
    damageElapsedMs: elapsedMs,
    activeCombatTimeMs: activeCombatMs ?? elapsedMs,
    totalDmg: sumTotals(entities, "damage"),
    totalHeal: sumTotals(entities, "healing"),
    totalDmgBossOnly: entities
      .reduce((sum, entity) => sum + ipcBigInt(entity.damageBossOnly.total), 0n)
      .toString(),
  };

  const dpsRows = computePlayerRowsFromEntities(source, "dps");
  const healRows = computePlayerRowsFromEntities(source, "heal");
  const tankRows = computePlayerRowsFromEntities(source, "tanked");
  const dpsByUid = new Map(dpsRows.map((row) => [row.entityUuid, row]));
  const healByUid = new Map(healRows.map((row) => [row.entityUuid, row]));
  const tankByUid = new Map(tankRows.map((row) => [row.entityUuid, row]));

  return entities
    .map((entity) => {
      const dps = dpsByUid.get(entity.entityUuid);
      const heal = healByUid.get(entity.entityUuid);
      const tank = tankByUid.get(entity.entityUuid);
      const className = entity.className || "";
      const classSpecName = entity.classSpecName || "";
      return {
        entityUuid: entity.entityUuid,
        displayUid: entity.displayUid,
        name: entity.name || `#${entity.displayUid}`,
        isLocalPlayer: localUuid !== null && entity.entityUuid === localUuid,
        className,
        classSpecName,
        classDisplay:
          formatClassSpecLabel(className, classSpecName) ||
          t("history.detail.player.unknownClass"),
        abilityScore: entity.abilityScore || 0,
        seasonStrength: entity.seasonStrength || 0,
        totalDmg: dps?.totalDmg ?? 0,
        dps: dps?.dps ?? 0,
        tdps: dps?.tdps ?? 0,
        activeTimeMs: dps?.activeTimeMs ?? 0,
        dmgPct: dps?.dmgPct ?? 0,
        bossDmg: dps?.bossDmg ?? 0,
        bossDps: dps?.bossDps ?? 0,
        bossDmgPct: dps?.bossDmgPct ?? 0,
        critRate: dps?.critRate ?? 0,
        critDmgRate: dps?.critDmgRate ?? 0,
        luckyRate: dps?.luckyRate ?? 0,
        luckyDmgRate: dps?.luckyDmgRate ?? 0,
        hits: dps?.hits ?? 0,
        hitsPerMinute: dps?.hitsPerMinute ?? 0,
        damageTaken: tank?.totalDmg ?? 0,
        tankedPS: tank?.dps ?? 0,
        tankedPct: tank?.dmgPct ?? 0,
        critTakenRate: tank?.critRate ?? 0,
        blockRate: tank?.blockRate ?? 0,
        luckyBlockRate: tank?.luckyBlockRate ?? 0,
        hitsTaken: tank?.hits ?? 0,
        healDealt: heal?.totalDmg ?? 0,
        hps: heal?.dps ?? 0,
        effectiveHeal: heal?.effectiveTotal ?? 0,
        ehps: heal?.effectiveDps ?? 0,
        healPct: heal?.dmgPct ?? 0,
        critHealRate: heal?.critRate ?? 0,
        hitsHeal: heal?.hits ?? 0,
      };
    })
    .filter(
      (row) => row.totalDmg > 0 || row.healDealt > 0 || row.damageTaken > 0,
    );
}

/** One (player, buff) coverage lane view derived from `buffTimeline`. */
export type HistoryBuffLaneView = {
  /** `${entityUuid}:${baseId}` — stable across detail/range recounts. */
  key: string;
  entityUuid: string;
  baseId: number;
  coveredActiveMs: number;
  /** Active-window coverage percent, 0..100. */
  coveragePct: number;
  triggerCount: number;
  spans: { startMs: number; endMs: number }[];
  gracePoints: { offsetMs: number; creditedMs: number }[];
};

export type HistoryBuffTimelineView = {
  activeWindowMs: number;
  activeSpans: { startMs: number; endMs: number }[];
  gracePoints: { offsetMs: number; creditedMs: number }[];
  lanes: HistoryBuffLaneView[];
};

export function historyBuffLaneKey(entityUuid: string, baseId: number): string {
  return `${entityUuid}:${baseId}`;
}

/** Adapts the DTO to lane views; `null` marks encounters recorded before
 * buff timeline persistence existed (frontend degradation signal). */
export function historyBuffTimeline(
  data: EncounterBuffTimelineData | null | undefined,
): HistoryBuffTimelineView | null {
  if (!data) return null;
  const activeWindowMs = Math.max(0, data.activeWindowMs);
  return {
    activeWindowMs,
    activeSpans: (data.activeSpans ?? []).map((span) => ({
      startMs: span.startMs,
      endMs: span.endMsExclusive,
    })),
    gracePoints: data.gracePoints ?? [],
    lanes: data.lanes.map((lane) => {
      const spans = lane.spans.map((span) => ({
        startMs: span.startMs,
        endMs: span.endMsExclusive,
      }));
      return {
        key: historyBuffLaneKey(lane.entityId, lane.baseId),
        entityUuid: lane.entityId,
        baseId: lane.baseId,
        coveredActiveMs: lane.coveredActiveMs,
        coveragePct:
          activeWindowMs > 0
            ? Math.min(100, (lane.coveredActiveMs / activeWindowMs) * 100)
            : 0,
        triggerCount: spans.length,
        spans,
        gracePoints: lane.gracePoints ?? [],
      };
    }),
  };
}

function intersectDuration(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): number {
  return Math.max(
    0,
    Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart),
  );
}

function intersectSortedSpans(
  left: readonly { startMs: number; endMs: number }[],
  right: readonly { startMs: number; endMs: number }[],
): number {
  let leftIndex = 0;
  let rightIndex = 0;
  let total = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftSpan = left[leftIndex]!;
    const rightSpan = right[rightIndex]!;
    total += intersectDuration(
      leftSpan.startMs,
      leftSpan.endMs,
      rightSpan.startMs,
      rightSpan.endMs,
    );
    if (leftSpan.endMs <= rightSpan.endMs) leftIndex += 1;
    else rightIndex += 1;
  }
  return total;
}

/** Clips the encounter-global active windows and buff presence to a selected
 * range. The range never creates a new first-hit grace credit. */
export function historyBuffTimelineRange(
  view: HistoryBuffTimelineView | null,
  startMs: number,
  endMs: number,
): HistoryBuffTimelineView | null {
  if (!view || endMs <= startMs) return null;
  const activeSpans = view.activeSpans
    .map((span) => ({
      startMs: Math.max(span.startMs, startMs),
      endMs: Math.min(span.endMs, endMs),
    }))
    .filter((span) => span.endMs > span.startMs);
  const gracePoints = view.gracePoints.filter(
    (point) => point.offsetMs >= startMs && point.offsetMs < endMs,
  );
  const rawActiveMs =
    activeSpans.reduce((total, span) => total + span.endMs - span.startMs, 0) +
    gracePoints.reduce((total, point) => total + point.creditedMs, 0);
  const activeWindowMs = Math.min(endMs - startMs, rawActiveMs);

  const lanes = view.lanes.map((lane) => {
    const spans = lane.spans
      .map((span) => ({
        startMs: Math.max(span.startMs, startMs),
        endMs: Math.min(span.endMs, endMs),
      }))
      .filter((span) => span.endMs > span.startMs);
    let coveredActiveMs = intersectSortedSpans(spans, activeSpans);
    const laneGrace = lane.gracePoints.filter(
      (point) => point.offsetMs >= startMs && point.offsetMs < endMs,
    );
    coveredActiveMs += laneGrace.reduce(
      (total, point) => total + point.creditedMs,
      0,
    );
    coveredActiveMs = Math.min(activeWindowMs, coveredActiveMs);
    return {
      ...lane,
      coveredActiveMs,
      coveragePct:
        activeWindowMs > 0
          ? Math.min(100, (coveredActiveMs / activeWindowMs) * 100)
          : 0,
      triggerCount: spans.length,
      spans,
      gracePoints: laneGrace,
    };
  });
  return { activeWindowMs, activeSpans, gracePoints, lanes };
}

/** Coverage percent per lane key, for range-recount overrides. */
export function historyBuffCoverageByKey(
  view: HistoryBuffTimelineView | null,
): Map<string, number> | null {
  if (!view) return null;
  return new Map(view.lanes.map((lane) => [lane.key, lane.coveragePct]));
}
