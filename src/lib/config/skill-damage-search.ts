import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";
import type { AppLocale } from "$lib/i18n/locales";

export type SkillDamageSearchItem = {
  skillId: number;
  name: string;
  defaultName: string | null;
};

type CatalogEntry = { defaultName: string | null; names: Set<string> };
const catalogs = new Map<AppLocale, Map<number, CatalogEntry>>();

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

function catalog(locale: AppLocale) {
  const cached = catalogs.get(locale);
  if (cached) return cached;
  const entries = new Map<number, CatalogEntry>();
  const add = (id: number, name: string | null) => {
    if (!validId(id)) return;
    let entry = entries.get(id);
    if (!entry) {
      entry = { defaultName: null, names: new Set() };
      entries.set(id, entry);
    }
    if (name) {
      entry.defaultName ??= name;
      entry.names.add(name.toLowerCase());
    }
  };
  const locales = getGameDataFallbackChain(locale);
  // Prefer the damage ID's own name; group names are also searchable.
  for (const candidate of locales) {
    for (const [id, name] of Object.entries(
      getGameData(candidate).damageAttrIdNames,
    )) {
      add(Number(id), normalizeGameDataText(name));
    }
  }
  for (const candidate of locales) {
    for (const group of Object.values(getGameData(candidate).recountTable)) {
      for (const id of group.DamageId)
        add(id, normalizeGameDataText(group.RecountName));
    }
  }
  catalogs.set(locale, entries);
  return entries;
}

/** Search actual damage IDs by their own names, recount names, aliases or ID. */
export function searchSkillDamage(
  keyword: string,
  aliases: Readonly<Record<string, string>>,
  locale: AppLocale,
): SkillDamageSearchItem[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];
  const digits = query.replace(/^#/, "");
  const idQuery = /^\d+$/.test(digits) ? digits : null;
  const entries = catalog(locale);
  const ids = new Set(entries.keys());
  for (const id of Object.keys(aliases))
    if (validId(Number(id))) ids.add(Number(id));
  const exactId = idQuery === null ? NaN : Number(idQuery);
  if (validId(exactId)) ids.add(exactId);
  const results: (SkillDamageSearchItem & { rank: number })[] = [];
  for (const skillId of ids) {
    const entry = entries.get(skillId);
    const alias = aliases[String(skillId)]?.trim();
    const aliasText = alias?.toLowerCase();
    const id = String(skillId);
    let rank = Infinity;
    if (idQuery !== null) {
      if (skillId === exactId) rank = 0;
      else if (id.startsWith(idQuery)) rank = 2;
      else if (id.includes(idQuery)) rank = 5;
    }
    if (aliasText === query) rank = Math.min(rank, 1);
    else if (aliasText?.includes(query)) rank = Math.min(rank, 2);
    if (entry?.names.has(query)) rank = Math.min(rank, 3);
    else if (entry && [...entry.names].some((name) => name.includes(query)))
      rank = Math.min(rank, 4);
    if (!Number.isFinite(rank)) continue;
    const defaultName = entry?.defaultName ?? null;
    results.push({
      skillId,
      name: alias || defaultName || `#${skillId}`,
      defaultName,
      rank,
    });
  }
  return results
    .sort((a, b) => a.rank - b.rank || a.skillId - b.skillId)
    .map(({ skillId, name, defaultName }) => ({ skillId, name, defaultName }));
}
