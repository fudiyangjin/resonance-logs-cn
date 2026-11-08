/**
 * @file Monster template search for the monster roster block picker.
 *
 * Ranks like the monster skill search (`searchMonsterSkills`): exact id,
 * exact name, id prefix, name prefix, then substrings, ties by ascending
 * id. Every match is returned; paging is left to the result grid.
 */
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";
import type { AppLocale } from "$lib/i18n/locales";

export type MonsterSearchItem = {
  monsterId: number;
  /** Game name, `null` for an id the monster table does not list. */
  name: string | null;
  /** `0` normal, `1` elite, `2` boss; `null` when unknown. */
  monsterType: number | null;
};

/** Rust side stores monster ids as `i32`. */
const MAX_MONSTER_ID = 2_147_483_647;

type CatalogEntry = { name: string; monsterType: number | null };

const catalogByLocale = new Map<AppLocale, Map<number, CatalogEntry>>();

/** Monster id -> name and type across the locale fallback chain. */
function catalog(locale: AppLocale): Map<number, CatalogEntry> {
  const cached = catalogByLocale.get(locale);
  if (cached) return cached;
  const entries = new Map<number, CatalogEntry>();
  for (const candidate of getGameDataFallbackChain(locale)) {
    for (const [id, info] of Object.entries(
      getGameData(candidate).monsterInfoById,
    )) {
      const monsterId = Number(id);
      const name = normalizeGameDataText(info?.Name);
      if (!name || !Number.isSafeInteger(monsterId) || entries.has(monsterId)) {
        continue;
      }
      entries.set(monsterId, {
        name,
        monsterType:
          typeof info?.MonsterType === "number" ? info.MonsterType : null,
      });
    }
  }
  catalogByLocale.set(locale, entries);
  return entries;
}

function idRank(monsterId: number, idKeyword: string | null): number | null {
  if (idKeyword === null) return null;
  const text = String(monsterId);
  if (text === idKeyword) return 0;
  if (text.startsWith(idKeyword)) return 2;
  if (text.includes(idKeyword)) return 5;
  return null;
}

function nameRank(name: string, keyword: string): number | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === keyword) return 1;
  if (normalized.startsWith(keyword)) return 3;
  if (normalized.includes(keyword)) return 4;
  return null;
}

/**
 * Every monster matching `keyword` by id (`#` optional) or name, best match
 * first. An exact id the table does not list is still returned so it can
 * be blocked by id.
 */
export function searchMonsters(
  keyword: string,
  locale: AppLocale,
): MonsterSearchItem[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return [];
  const digits = normalizedKeyword.replace(/^#/, "");
  const idKeyword = /^\d+$/.test(digits) ? digits : null;
  const entries = catalog(locale);

  const matches: { monsterId: number; rank: number }[] = [];
  for (const [monsterId, entry] of entries) {
    const rank = Math.min(
      idRank(monsterId, idKeyword) ?? Infinity,
      nameRank(entry.name, normalizedKeyword) ?? Infinity,
    );
    if (Number.isFinite(rank)) matches.push({ monsterId, rank });
  }

  const exactId = idKeyword === null ? NaN : Number(idKeyword);
  if (
    Number.isSafeInteger(exactId) &&
    exactId > 0 &&
    exactId <= MAX_MONSTER_ID &&
    !entries.has(exactId)
  ) {
    matches.push({ monsterId: exactId, rank: 0 });
  }

  matches.sort((a, b) => a.rank - b.rank || a.monsterId - b.monsterId);
  return matches.map(({ monsterId }) => {
    const entry = entries.get(monsterId);
    return {
      monsterId,
      name: entry?.name ?? null,
      monsterType: entry?.monsterType ?? null,
    };
  });
}
