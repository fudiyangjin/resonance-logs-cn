/**
 * @file Monster skill search for the monster-monitor watch list picker.
 *
 * Ranks the same way as the buff search (`searchBuffsByName`): id and alias
 * matches first, then names, ties by ascending id. Every match is returned —
 * a one-digit id prefix matches thousands of skills, so paging is left to the
 * result grid instead of truncating here.
 */
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";
import type { AppLocale } from "$lib/i18n/locales";

export type MonsterSkillSearchItem = {
  skillId: number;
  /** Alias when one is set, else the game name, else `#id`. */
  name: string;
  /** Game name, `null` for an id the skill table does not list. */
  defaultName: string | null;
};

/** Rust side stores skill ids as `i32`. */
const MAX_SKILL_ID = 2_147_483_647;

const catalogByLocale = new Map<AppLocale, Map<number, string>>();

/** Skill id -> name across the locale fallback chain, built once per locale. */
function catalog(locale: AppLocale): Map<number, string> {
  const cached = catalogByLocale.get(locale);
  if (cached) return cached;
  const names = new Map<number, string>();
  for (const candidate of getGameDataFallbackChain(locale)) {
    for (const [id, raw] of Object.entries(
      getGameData(candidate).monsterSkillNames,
    )) {
      const skillId = Number(id);
      const name = normalizeGameDataText(raw);
      if (name && Number.isSafeInteger(skillId) && !names.has(skillId)) {
        names.set(skillId, name);
      }
    }
  }
  catalogByLocale.set(locale, names);
  return names;
}

export function lookupMonsterSkillDefaultName(
  skillId: number,
  locale: AppLocale,
): string | null {
  return catalog(locale).get(skillId) ?? null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function textRank(
  text: string | null | undefined,
  keyword: string,
  exactRank: number,
  containsRank: number,
): number | null {
  const normalized = text ? normalizeText(text) : "";
  if (!normalized) return null;
  if (normalized === keyword) return exactRank;
  if (normalized.includes(keyword)) return containsRank;
  return null;
}

function idRank(skillId: number, idKeyword: string | null): number | null {
  if (idKeyword === null) return null;
  const text = String(skillId);
  if (text === idKeyword) return 0;
  if (text.startsWith(idKeyword)) return 2;
  if (text.includes(idKeyword)) return 5;
  return null;
}

function parseIdKeyword(keyword: string): string | null {
  const digits = keyword.replace(/^#/, "");
  return /^\d+$/.test(digits) ? digits : null;
}

/**
 * Every skill matching `keyword` by id (`#` optional), alias or game name,
 * best match first. An exact id the table does not list is still returned
 * so it can be watched by id.
 */
export function searchMonsterSkills(
  keyword: string,
  aliases: Readonly<Record<string, string>>,
  locale: AppLocale,
): MonsterSkillSearchItem[] {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return [];
  const idKeyword = parseIdKeyword(normalizedKeyword);
  const names = catalog(locale);

  const matches: { skillId: number; rank: number }[] = [];
  const consider = (skillId: number) => {
    const rank = Math.min(
      idRank(skillId, idKeyword) ?? Infinity,
      textRank(aliases[String(skillId)], normalizedKeyword, 1, 2) ?? Infinity,
      textRank(names.get(skillId), normalizedKeyword, 3, 4) ?? Infinity,
    );
    if (Number.isFinite(rank)) matches.push({ skillId, rank });
  };
  for (const skillId of names.keys()) consider(skillId);
  for (const id of Object.keys(aliases)) {
    const skillId = Number(id);
    if (Number.isSafeInteger(skillId) && !names.has(skillId)) {
      consider(skillId);
    }
  }

  const exactId = idKeyword === null ? NaN : Number(idKeyword);
  if (
    Number.isSafeInteger(exactId) &&
    exactId > 0 &&
    exactId <= MAX_SKILL_ID &&
    !matches.some((match) => match.skillId === exactId)
  ) {
    matches.push({ skillId: exactId, rank: 0 });
  }

  matches.sort((a, b) => a.rank - b.rank || a.skillId - b.skillId);
  return matches.map(({ skillId }) => {
    const defaultName = names.get(skillId) ?? null;
    const alias = aliases[String(skillId)]?.trim();
    return {
      skillId,
      name: alias || defaultName || `#${skillId}`,
      defaultName,
    };
  });
}
