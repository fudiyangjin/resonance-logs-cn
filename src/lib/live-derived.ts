import type {
  LiveDataPayload,
  PlayerRow,
  RawCombatStats,
  RawEntityData,
} from "$lib/api";
import {
  ipcBigInt,
  ipcIsZero,
  ipcNumber,
  ipcRatio,
  ipcSum,
  type IpcDecimal,
} from "$lib/ipc-decimal";
import type { ForbiddenHit } from "$lib/challenge-watch";

type Metric = "dps" | "heal" | "tanked";

function percent(part: unknown, total: unknown): number {
  return ipcRatio(part, total, 100);
}

function rate(part: unknown, total: unknown): number {
  return ipcRatio(part, total, 100);
}

function statsByMetric(entity: RawEntityData, metric: Metric): RawCombatStats {
  if (metric === "heal") return entity.healing;
  if (metric === "tanked") return entity.taken;
  return entity.damage;
}

type PlayerRowsSource = {
  entities: RawEntityData[];
  elapsedMs: IpcDecimal;
  damageElapsedMs: IpcDecimal;
  activeCombatTimeMs: IpcDecimal;
  totalDmg: IpcDecimal;
  totalHeal: IpcDecimal;
  totalDmgBossOnly: IpcDecimal;
};

export function computePlayerRowsFromEntities(
  source: PlayerRowsSource,
  metric: Metric,
  forbiddenIds?: Set<number>,
): PlayerRow[] {
  const elapsedMs = ipcBigInt(source.elapsedMs);
  const rateElapsedMs =
    metric === "dps" ? ipcBigInt(source.damageElapsedMs) : elapsedMs;
  const activeCombatTimeMs = ipcBigInt(source.activeCombatTimeMs);
  const effectiveActiveCombatMs =
    elapsedMs > 0n && activeCombatTimeMs > 0n
      ? activeCombatTimeMs < elapsedMs
        ? activeCombatTimeMs
        : elapsedMs
      : 0n;
  const totalMetric =
    metric === "heal"
      ? ipcBigInt(source.totalHeal)
      : metric === "tanked"
        ? ipcSum(source.entities.map((entity) => entity.taken.total))
        : ipcBigInt(source.totalDmg);
  const bossTotal = ipcBigInt(source.totalDmgBossOnly);

  return source.entities
    .map((entity) => {
      const stats = statsByMetric(entity, metric);
      const total = ipcBigInt(stats.total);
      const effectiveTotal =
        metric === "heal" ? ipcBigInt(stats.effectiveTotal) : 0n;
      const hits = ipcBigInt(stats.hits);
      const triggerHits = ipcIsZero(stats.triggerHits)
        ? hits
        : ipcBigInt(stats.triggerHits);
      const bossDmg =
        metric === "dps" ? ipcBigInt(entity.damageBossOnly.total) : 0n;

      const forbiddenHits: ForbiddenHit[] = [];
      for (const id of forbiddenIds ?? []) {
        const takenHits = entity.takenSkills[id]?.hits;
        if (!ipcIsZero(takenHits)) {
          forbiddenHits.push({ id, hits: ipcNumber(takenHits) });
        }
      }

      const row: PlayerRow = {
        entityUuid: entity.entityUuid,
        displayUid: entity.displayUid,
        name: entity.name || `#${entity.displayUid}`,
        className: entity.className,
        classSpecName: entity.classSpecName,
        abilityScore: entity.abilityScore,
        seasonStrength: entity.seasonStrength ?? 0,
        totalDmg: ipcNumber(total),
        dps: ipcRatio(total, rateElapsedMs, 1_000),
        tdps:
          metric === "dps"
            ? ipcRatio(total, effectiveActiveCombatMs, 1_000)
            : 0,
        activeTimeMs: metric === "dps" ? ipcNumber(effectiveActiveCombatMs) : 0,
        bossDps: metric === "dps" ? ipcRatio(bossDmg, rateElapsedMs, 1_000) : 0,
        dmgPct: percent(total, totalMetric),
        critRate: rate(stats.critHits, hits),
        critDmgRate: percent(stats.critTotal, total),
        luckyRate: rate(stats.luckyHits, triggerHits),
        luckyDmgRate: percent(stats.luckyTotal, total),
        blockRate: metric === "tanked" ? rate(stats.blockHits, hits) : 0,
        luckyBlockRate:
          metric === "tanked" ? rate(stats.luckyBlockHits, hits) : 0,
        hits: ipcNumber(hits),
        hitsPerMinute: ipcRatio(hits, rateElapsedMs, 60_000),
        bossDmg: ipcNumber(bossDmg),
        bossDmgPct: metric === "dps" ? percent(bossDmg, bossTotal) : 0,
        effectiveTotal: ipcNumber(effectiveTotal),
        effectiveDps:
          metric === "heal" ? ipcRatio(effectiveTotal, elapsedMs, 1_000) : 0,
        forbiddenHit: forbiddenHits.length > 0,
        forbiddenHits,
      };

      return row;
    })
    .filter((row) => row.totalDmg > 0);
}

export function computePlayerRows(
  data: LiveDataPayload,
  metric: Metric,
  forbiddenIds?: Set<number>,
): PlayerRow[] {
  return computePlayerRowsFromEntities(
    {
      entities: data.entities,
      elapsedMs: data.elapsedMs,
      damageElapsedMs: data.damageElapsedMs,
      activeCombatTimeMs: data.activeCombatTimeMs,
      totalDmg: data.totalDmg,
      totalHeal: data.totalHeal,
      totalDmgBossOnly: data.totalDmgBossOnly,
    },
    metric,
    forbiddenIds,
  );
}
