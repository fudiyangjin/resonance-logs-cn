import { getLocale, t, type AppLocale } from "$lib/i18n/index.svelte";
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";
import {
  ipcBigInt,
  ipcCompare,
  ipcIsZero,
  ipcNumber,
  ipcRatio,
  type IpcDecimal,
} from "$lib/ipc-decimal";

export type HitExtremaLike = {
  min: IpcDecimal;
  max: IpcDecimal;
};

export type RawSkillStatsLike = {
  totalValue: IpcDecimal;
  effectiveTotalValue: IpcDecimal;
  hits: IpcDecimal;
  critHits: IpcDecimal;
  critTotalValue: IpcDecimal;
  luckyHits: IpcDecimal;
  luckyTotalValue: IpcDecimal;
  property?: number | null;
  damageMode?: number | null;
  triggerHits?: IpcDecimal;
  blockHits?: IpcDecimal;
  luckyBlockHits?: IpcDecimal;
  extrema?: HitExtremaLike | null;
};

export type SkillDisplayRow = {
  skillId: number;
  name: string;
  showSkillId?: boolean;
  totalDmg: number;
  effectiveTotal: number;
  dps: number;
  effectiveDps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  blockRate: number;
  luckyBlockRate: number;
  hits: number;
  hitsPerMinute: number;
  avgDmg: number;
  maxDmg: number | null;
  minDmg: number | null;
  property: number | null;
  damageMode: number | null;
  raw: RawSkillStatsLike;
};

export type RecountGroup = {
  recountId: number;
  recountName: string;
  totalDmg: number;
  effectiveTotal: number;
  dps: number;
  effectiveDps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  blockRate: number;
  luckyBlockRate: number;
  hits: number;
  hitsPerMinute: number;
  avgDmg: number;
  maxDmg: number | null;
  minDmg: number | null;
  skills: SkillDisplayRow[];
  raw: RawSkillStatsLike;
};

type RecountEntry = {
  Id: number;
  RecountName: string;
  DamageId: number[];
};

const DAMAGE_TO_RECOUNT_BY_LOCALE = new Map<
  AppLocale,
  Map<number, { recountId: number; recountName: string }>
>();

function getDamageToRecount(locale: AppLocale) {
  const cached = DAMAGE_TO_RECOUNT_BY_LOCALE.get(locale);
  if (cached) return cached;

  const damageToRecount = new Map<
    number,
    { recountId: number; recountName: string }
  >();
  const recountTable = getGameData(locale).recountTable as Record<
    string,
    RecountEntry
  >;
  for (const entry of Object.values(recountTable)) {
    for (const did of entry.DamageId) {
      damageToRecount.set(did, {
        recountId: entry.Id,
        recountName: entry.RecountName,
      });
    }
  }

  DAMAGE_TO_RECOUNT_BY_LOCALE.set(locale, damageToRecount);
  return damageToRecount;
}

function lookupDamageAttrIdName(
  damageId: number,
  locale: AppLocale,
): string | null {
  for (const candidate of getGameDataFallbackChain(locale)) {
    const name = normalizeGameDataText(
      getGameData(candidate).damageAttrIdNames[String(damageId)],
    );
    if (name) return name;
  }
  return null;
}

function lookupRecountName(
  recountId: number,
  recountName: string,
  locale: AppLocale,
): string | null {
  const currentName = normalizeGameDataText(recountName);
  if (currentName) return currentName;

  for (const candidate of getGameDataFallbackChain(locale).slice(1)) {
    const fallbackName = normalizeGameDataText(
      getGameData(candidate).recountTable[String(recountId)]?.RecountName,
    );
    if (fallbackName) return fallbackName;
  }
  return null;
}

function pct(numerator: unknown, denominator: unknown): number {
  return ipcRatio(numerator, denominator, 100);
}

function rate(hits: unknown, totalHits: unknown): number {
  return ipcRatio(hits, totalHits, 100);
}

function elapsedMilliseconds(elapsedSecs: number): number {
  return Number.isFinite(elapsedSecs) && elapsedSecs > 0
    ? Math.round(elapsedSecs * 1_000)
    : 0;
}

function triggerHits(stats: RawSkillStatsLike): bigint {
  return ipcIsZero(stats.triggerHits)
    ? ipcBigInt(stats.hits)
    : ipcBigInt(stats.triggerHits);
}

function displayExtrema(
  extrema: HitExtremaLike | null | undefined,
): { min: number; max: number } | null {
  if (!extrema) return null;
  return {
    min: ipcNumber(extrema.min),
    max: ipcNumber(extrema.max),
  };
}

function mergeHitExtrema(
  current: HitExtremaLike | null,
  next: HitExtremaLike | null | undefined,
): HitExtremaLike | null {
  if (!next) return current;
  const nextMin = ipcBigInt(next.min);
  const nextMax = ipcBigInt(next.max);
  if (!current) return { min: nextMin, max: nextMax };
  const currentMin = ipcBigInt(current.min);
  const currentMax = ipcBigInt(current.max);
  return {
    min: currentMin < nextMin ? currentMin : nextMin,
    max: currentMax > nextMax ? currentMax : nextMax,
  };
}

export function aggregateRawSkillStats(
  statsList: Iterable<RawSkillStatsLike>,
): RawSkillStatsLike {
  const total: RawSkillStatsLike = {
    totalValue: 0n,
    effectiveTotalValue: 0n,
    hits: 0n,
    critHits: 0n,
    critTotalValue: 0n,
    luckyHits: 0n,
    luckyTotalValue: 0n,
    triggerHits: 0n,
    blockHits: 0n,
    luckyBlockHits: 0n,
    extrema: null,
  };
  for (const stats of statsList) {
    total.totalValue = ipcBigInt(total.totalValue) + ipcBigInt(stats.totalValue);
    total.effectiveTotalValue =
      ipcBigInt(total.effectiveTotalValue) +
      ipcBigInt(stats.effectiveTotalValue);
    total.hits = ipcBigInt(total.hits) + ipcBigInt(stats.hits);
    total.critHits = ipcBigInt(total.critHits) + ipcBigInt(stats.critHits);
    total.critTotalValue =
      ipcBigInt(total.critTotalValue) + ipcBigInt(stats.critTotalValue);
    total.luckyHits = ipcBigInt(total.luckyHits) + ipcBigInt(stats.luckyHits);
    total.luckyTotalValue =
      ipcBigInt(total.luckyTotalValue) + ipcBigInt(stats.luckyTotalValue);
    total.triggerHits = ipcBigInt(total.triggerHits) + triggerHits(stats);
    total.blockHits = ipcBigInt(total.blockHits) + ipcBigInt(stats.blockHits);
    total.luckyBlockHits =
      ipcBigInt(total.luckyBlockHits) + ipcBigInt(stats.luckyBlockHits);
    total.extrema = mergeHitExtrema(total.extrema ?? null, stats.extrema);
  }
  return total;
}

export function lookupDamageIdName(
  damageId: number,
  locale = getLocale(),
): string {
  const recount = getDamageToRecount(locale).get(damageId);
  if (recount) {
    return (
      lookupRecountName(recount.recountId, recount.recountName, locale) ??
      t("game.damage.unknown", { id: damageId })
    );
  }
  return (
    lookupDamageAttrIdName(damageId, locale) ??
    t("game.damage.unknown", { id: damageId })
  );
}

export function lookupChildDamageIdName(
  damageId: number,
  locale = getLocale(),
): string {
  const individual = lookupDamageAttrIdName(damageId, locale);
  if (individual) return individual;
  return lookupDamageIdName(damageId, locale);
}

export function buildSkillDisplayRow(
  skillId: number,
  stats: RawSkillStatsLike,
  elapsedSecs: number,
  parentTotal: IpcDecimal,
  locale = getLocale(),
): SkillDisplayRow {
  const elapsedMs = elapsedMilliseconds(elapsedSecs);
  const totalDmg = ipcBigInt(stats.totalValue);
  const effectiveTotal = ipcBigInt(stats.effectiveTotalValue);
  const hits = ipcBigInt(stats.hits);
  const effectiveTriggerHits = triggerHits(stats);
  const extrema = displayExtrema(stats.extrema);
  return {
    skillId,
    name: lookupDamageIdName(skillId, locale),
    totalDmg: ipcNumber(totalDmg),
    effectiveTotal: ipcNumber(effectiveTotal),
    dps: ipcRatio(totalDmg, elapsedMs, 1_000),
    effectiveDps: ipcRatio(effectiveTotal, elapsedMs, 1_000),
    dmgPct: pct(totalDmg, parentTotal),
    critRate: rate(stats.critHits, hits),
    critDmgRate: pct(stats.critTotalValue, totalDmg),
    luckyRate: rate(stats.luckyHits, effectiveTriggerHits),
    luckyDmgRate: pct(stats.luckyTotalValue, totalDmg),
    blockRate: rate(stats.blockHits, hits),
    luckyBlockRate: rate(stats.luckyBlockHits, hits),
    hits: ipcNumber(hits),
    hitsPerMinute: ipcRatio(hits, elapsedMs, 60_000),
    avgDmg: ipcRatio(totalDmg, hits, 1),
    maxDmg: extrema?.max ?? null,
    minDmg: extrema?.min ?? null,
    property: stats.property ?? null,
    damageMode: stats.damageMode ?? null,
    raw: stats,
  };
}

export function groupSkillsByRecount(
  skills: Partial<Record<number, RawSkillStatsLike>>,
  elapsedSecs: number,
  parentTotal: IpcDecimal,
  locale = getLocale(),
): { groups: RecountGroup[]; ungrouped: SkillDisplayRow[] } {
  const groupMap = new Map<number, RecountGroup>();
  const ungrouped: SkillDisplayRow[] = [];
  const damageToRecount = getDamageToRecount(locale);

  for (const [skillIdText, stats] of Object.entries(skills)) {
    if (!stats) continue;
    const skillId = Number(skillIdText);
    if (!Number.isFinite(skillId)) continue;

    const row = buildSkillDisplayRow(
      skillId,
      stats,
      elapsedSecs,
      parentTotal,
      locale,
    );
    const mapping = damageToRecount.get(skillId);
    if (!mapping) {
      ungrouped.push(row);
      continue;
    }

    let group = groupMap.get(mapping.recountId);
    if (!group) {
      group = {
        recountId: mapping.recountId,
        recountName:
          lookupRecountName(mapping.recountId, mapping.recountName, locale) ??
          t("game.damage.unknown", { id: skillId }),
        totalDmg: 0,
        effectiveTotal: 0,
        dps: 0,
        effectiveDps: 0,
        dmgPct: 0,
        critRate: 0,
        critDmgRate: 0,
        luckyRate: 0,
        luckyDmgRate: 0,
        blockRate: 0,
        luckyBlockRate: 0,
        hits: 0,
        hitsPerMinute: 0,
        avgDmg: 0,
        maxDmg: null,
        minDmg: null,
        skills: [],
        raw: aggregateRawSkillStats([]),
      };
      groupMap.set(mapping.recountId, group);
    }

    row.name = lookupChildDamageIdName(skillId, locale);
    group.skills.push(row);
  }

  const groups = Array.from(groupMap.values()).map((group) => {
    const elapsedMs = elapsedMilliseconds(elapsedSecs);
    const raw = aggregateRawSkillStats(group.skills.map((skill) => skill.raw));
    group.raw = raw;
    group.totalDmg = ipcNumber(raw.totalValue);
    group.effectiveTotal = ipcNumber(raw.effectiveTotalValue);
    group.hits = ipcNumber(raw.hits);
    group.dps = ipcRatio(raw.totalValue, elapsedMs, 1_000);
    group.effectiveDps = ipcRatio(raw.effectiveTotalValue, elapsedMs, 1_000);
    group.dmgPct = pct(raw.totalValue, parentTotal);
    group.critRate = rate(raw.critHits, raw.hits);
    group.critDmgRate = pct(raw.critTotalValue, raw.totalValue);
    group.luckyRate = rate(raw.luckyHits, raw.triggerHits);
    group.luckyDmgRate = pct(raw.luckyTotalValue, raw.totalValue);
    group.blockRate = rate(raw.blockHits, raw.hits);
    group.luckyBlockRate = rate(raw.luckyBlockHits, raw.hits);
    group.hitsPerMinute = ipcRatio(raw.hits, elapsedMs, 60_000);
    group.avgDmg = ipcRatio(raw.totalValue, raw.hits, 1);
    const extrema = displayExtrema(raw.extrema);
    group.maxDmg = extrema?.max ?? null;
    group.minDmg = extrema?.min ?? null;
    const nameCount = new Map<string, number>();
    for (const skill of group.skills) {
      nameCount.set(skill.name, (nameCount.get(skill.name) ?? 0) + 1);
    }
    for (const skill of group.skills) {
      skill.showSkillId = (nameCount.get(skill.name) ?? 0) > 1;
    }
    group.skills.sort((a, b) => ipcCompare(b.raw.totalValue, a.raw.totalValue));
    return group;
  });

  groups.sort((a, b) => ipcCompare(b.raw.totalValue, a.raw.totalValue));
  ungrouped.sort((a, b) => ipcCompare(b.raw.totalValue, a.raw.totalValue));

  return { groups, ungrouped };
}
