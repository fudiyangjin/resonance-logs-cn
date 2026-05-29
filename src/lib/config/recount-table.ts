import { getLocale, t, type AppLocale } from "$lib/i18n/index.svelte";
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";

export type RawSkillStatsLike = {
  totalValue: number;
  effectiveTotalValue: number;
  hits: number;
  critHits: number;
  critTotalValue: number;
  luckyHits: number;
  luckyTotalValue: number;
  property?: number | null;
  damageMode?: number | null;
  triggerHits?: number;
  blockHits?: number;
  luckyBlockHits?: number;
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
  skills: SkillDisplayRow[];
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

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function rate(hits: number, totalHits: number): number {
  if (totalHits <= 0) return 0;
  return (hits / totalHits) * 100;
}

function perMinute(value: number, elapsedSecs: number): number {
  if (elapsedSecs <= 0) return 0;
  return (value / elapsedSecs) * 60;
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
  parentTotal: number,
  locale = getLocale(),
): SkillDisplayRow {
  const totalDmg = Number(stats.totalValue || 0);
  const effectiveTotal = Number(stats.effectiveTotalValue || 0);
  const hits = Number(stats.hits || 0);
  const triggerHits = Number(stats.triggerHits || stats.hits || 0);
  return {
    skillId,
    name: lookupDamageIdName(skillId, locale),
    totalDmg,
    effectiveTotal,
    dps: elapsedSecs > 0 ? totalDmg / elapsedSecs : 0,
    effectiveDps: elapsedSecs > 0 ? effectiveTotal / elapsedSecs : 0,
    dmgPct: pct(totalDmg, parentTotal),
    critRate: rate(Number(stats.critHits || 0), hits),
    critDmgRate: pct(Number(stats.critTotalValue || 0), totalDmg),
    luckyRate: rate(Number(stats.luckyHits || 0), triggerHits),
    luckyDmgRate: pct(Number(stats.luckyTotalValue || 0), totalDmg),
    blockRate: rate(Number(stats.blockHits || 0), hits),
    luckyBlockRate: rate(Number(stats.luckyBlockHits || 0), hits),
    hits,
    hitsPerMinute: perMinute(hits, elapsedSecs),
    property: stats.property ?? null,
    damageMode: stats.damageMode ?? null,
    raw: stats,
  };
}

export function groupSkillsByRecount(
  skills: Partial<Record<number, RawSkillStatsLike>>,
  elapsedSecs: number,
  parentTotal: number,
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
        skills: [],
      };
      groupMap.set(mapping.recountId, group);
    }

    group.totalDmg += row.totalDmg;
    group.effectiveTotal += row.effectiveTotal;
    group.hits += row.hits;
    row.name = lookupChildDamageIdName(skillId, locale);
    group.skills.push(row);
  }

  const groups = Array.from(groupMap.values()).map((group) => {
    const critHits = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.critHits || 0),
      0,
    );
    const critTotal = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.critTotalValue || 0),
      0,
    );
    const luckyHits = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.luckyHits || 0),
      0,
    );
    const luckyTotal = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.luckyTotalValue || 0),
      0,
    );
    const triggerHitsSum = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.triggerHits || s.raw.hits || 0),
      0,
    );
    const blockHitsSum = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.blockHits || 0),
      0,
    );
    const luckyBlockHitsSum = group.skills.reduce(
      (sum, s) => sum + Number(s.raw.luckyBlockHits || 0),
      0,
    );
    group.dps = elapsedSecs > 0 ? group.totalDmg / elapsedSecs : 0;
    group.effectiveDps =
      elapsedSecs > 0 ? group.effectiveTotal / elapsedSecs : 0;
    group.dmgPct = pct(group.totalDmg, parentTotal);
    group.critRate = rate(critHits, group.hits);
    group.critDmgRate = pct(critTotal, group.totalDmg);
    group.luckyRate = rate(luckyHits, triggerHitsSum);
    group.luckyDmgRate = pct(luckyTotal, group.totalDmg);
    group.blockRate = rate(blockHitsSum, group.hits);
    group.luckyBlockRate = rate(luckyBlockHitsSum, group.hits);
    group.hitsPerMinute = perMinute(group.hits, elapsedSecs);
    const nameCount = new Map<string, number>();
    for (const skill of group.skills) {
      nameCount.set(skill.name, (nameCount.get(skill.name) ?? 0) + 1);
    }
    for (const skill of group.skills) {
      skill.showSkillId = (nameCount.get(skill.name) ?? 0) > 1;
    }
    group.skills.sort((a, b) => b.totalDmg - a.totalDmg);
    return group;
  });

  groups.sort((a, b) => b.totalDmg - a.totalDmg);
  ungrouped.sort((a, b) => b.totalDmg - a.totalDmg);

  return { groups, ungrouped };
}
