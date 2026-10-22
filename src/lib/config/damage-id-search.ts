/**
 * @file Damage id search for the counter editor's damage pickers.
 *
 * Ranks like the monster skill search: id matches first, then names. Every
 * match is returned; paging is left to the result grid. Named mechanic groups
 * (RecountTable) match by name and add all of their damage ids at once.
 */
import {
  getDamageCatalog,
  type DamageSearchResult,
} from "$lib/challenge-damage-search";
import type { AppLocale } from "$lib/i18n/locales";

function idRank(id: number, idKeyword: string | null): number | null {
  if (idKeyword === null) return null;
  const text = String(id);
  if (text === idKeyword) return 0;
  if (text.startsWith(idKeyword)) return 2;
  return null;
}

function nameRank(nameLower: string, keyword: string): number | null {
  if (nameLower === keyword) return 1;
  if (nameLower.includes(keyword)) return 3;
  return null;
}

/**
 * Every damage id or group matching `keyword` by id (`#` optional) or name,
 * best match first, groups before single ids on ties. An exact id the tables
 * do not list is still returned so it can be added by id.
 */
export function searchDamageIds(
  keyword: string,
  locale: AppLocale,
): DamageSearchResult[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  const digits = normalized.replace(/^#/, "");
  const idKeyword = /^\d+$/.test(digits) ? digits : null;

  const matches: { entry: DamageSearchResult; rank: number }[] = [];
  for (const { nameLower, ...entry } of getDamageCatalog(locale)) {
    const rank = Math.min(
      nameRank(nameLower, normalized) ?? Infinity,
      entry.isGroup
        ? Infinity
        : (idRank(entry.ids[0] ?? 0, idKeyword) ?? Infinity),
    );
    if (Number.isFinite(rank)) matches.push({ entry, rank });
  }

  const exactId = idKeyword === null ? NaN : Number(idKeyword);
  if (
    Number.isSafeInteger(exactId) &&
    exactId > 0 &&
    !matches.some(({ entry }) => !entry.isGroup && entry.ids[0] === exactId)
  ) {
    matches.push({
      entry: {
        key: `s:${exactId}`,
        name: `#${exactId}`,
        ids: [exactId],
        isGroup: false,
      },
      rank: 0,
    });
  }

  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.entry.isGroup) - Number(a.entry.isGroup) ||
      (a.entry.ids[0] ?? 0) - (b.entry.ids[0] ?? 0),
  );
  return matches.map(({ entry }) => entry);
}
