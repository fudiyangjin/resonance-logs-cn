import type {
  HeaderInfo,
  LiveDataPayload,
  PlayerRow,
  RawCombatStats,
  RawEntityData,
  RawSkillStats,
  SkillRow,
} from "$lib/api";

type Metric = "dps" | "heal" | "tanked";

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function rate(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function statsByMetric(entity: RawEntityData, metric: Metric): RawCombatStats {
  if (metric === "heal") return entity.healing;
  if (metric === "tanked") return entity.taken;
  return entity.damage;
}

type PlayerRowsSource = {
  entities: RawEntityData[];
  elapsedMs: number;
  totalDmg: number;
  totalHeal: number;
  totalDmgBossOnly: number;
};

export function computePlayerRowsFromEntities(
  source: PlayerRowsSource,
  metric: Metric,
): PlayerRow[] {
  const elapsedSecs = source.elapsedMs > 0 ? source.elapsedMs / 1000 : 0;
  const totalMetric =
    metric === "heal"
      ? source.totalHeal
      : metric === "tanked"
        ? source.entities.reduce((sum, entity) => sum + (entity.taken?.total ?? 0), 0)
        : source.totalDmg;

  return source.entities
    .map((entity) => {
      const stats = statsByMetric(entity, metric);
      const total = Number(stats.total || 0);
      const hits = Number(stats.hits || 0);
      const activeSecs = entity.activeDmgTimeMs > 0 ? entity.activeDmgTimeMs / 1000 : 0;
      const bossDmg = metric === "dps" ? Number(entity.damageBossOnly?.total || 0) : 0;
      const bossTotal = Number(source.totalDmgBossOnly || 0);

      const row: PlayerRow = {
        uid: entity.uid,
        name: entity.name || `#${entity.uid}`,
        className: entity.className,
        classSpecName: entity.classSpecName,
        abilityScore: entity.abilityScore,
        seasonStrength: entity.seasonStrength ?? 0,
        totalDmg: total,
        dps: elapsedSecs > 0 ? total / elapsedSecs : 0,
        tdps: metric === "dps" && activeSecs > 0 ? total / activeSecs : 0,
        activeTimeMs: metric === "dps" ? entity.activeDmgTimeMs : 0,
        bossDps: metric === "dps" && elapsedSecs > 0 ? bossDmg / elapsedSecs : 0,
        dmgPct: percent(total, totalMetric),
        critRate: rate(Number(stats.critHits || 0), hits),
        critDmgRate: percent(Number(stats.critTotal || 0), total),
        luckyRate: rate(Number(stats.luckyHits || 0), hits),
        luckyDmgRate: percent(Number(stats.luckyTotal || 0), total),
        hits,
        hitsPerMinute: elapsedSecs > 0 ? (hits / elapsedSecs) * 60 : 0,
        bossDmg,
        bossDmgPct: metric === "dps" ? percent(bossDmg, bossTotal) : 0,
      };

      return row;
    })
    .filter((row) => row.totalDmg > 0);
}

export function computePlayerRows(data: LiveDataPayload, metric: Metric): PlayerRow[] {
  return computePlayerRowsFromEntities(
    {
      entities: data.entities,
      elapsedMs: data.elapsedMs,
      totalDmg: data.totalDmg,
      totalHeal: data.totalHeal,
      totalDmgBossOnly: data.totalDmgBossOnly,
    },
    metric,
  );
}

export function computeSkillRows(
  skills: Partial<Record<number, RawSkillStats>>,
  elapsedMs: number,
  parentTotal: number,
  nameResolver: (skillId: number) => string,
): SkillRow[] {
  const elapsedSecs = elapsedMs > 0 ? elapsedMs / 1000 : 0;

  return Object.entries(skills)
    .map(([skillIdText, stats]) => {
      if (!stats) return null;
      const skillId = Number(skillIdText);
      const total = Number(stats.totalValue || 0);
      const hits = Number(stats.hits || 0);

      const row: SkillRow = {
        skillId,
        name: nameResolver(skillId),
        totalDmg: total,
        dps: elapsedSecs > 0 ? total / elapsedSecs : 0,
        dmgPct: percent(total, parentTotal),
        critRate: rate(Number(stats.critHits || 0), hits),
        critDmgRate: percent(Number(stats.critTotalValue || 0), total),
        luckyRate: rate(Number(stats.luckyHits || 0), hits),
        luckyDmgRate: percent(Number(stats.luckyTotalValue || 0), total),
        hits,
        hitsPerMinute: elapsedSecs > 0 ? (hits / elapsedSecs) * 60 : 0,
      };
      return row;
    })
    .filter((row): row is SkillRow =>
      !!row && Number.isFinite(row.skillId) && row.totalDmg > 0,
    );
}

export function computeHeaderInfo(data: LiveDataPayload): HeaderInfo {
  const elapsedSecs = data.elapsedMs > 0 ? data.elapsedMs / 1000 : 0;
  return {
    totalDps: elapsedSecs > 0 ? data.totalDmg / elapsedSecs : 0,
    totalDmg: data.totalDmg,
    elapsedMs: data.elapsedMs,
    fightStartTimestampMs: data.fightStartTimestampMs,
    bosses: data.bosses,
    sceneId: data.sceneId,
    sceneName: data.sceneName,
    currentSegmentType: data.currentSegmentType,
    currentSegmentName: data.currentSegmentName,
  };
}
