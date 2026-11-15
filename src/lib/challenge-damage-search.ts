import type { AppLocale } from "$lib/i18n/index.svelte";
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";

/**
 * A searchable damage entry the user can add to the forbidden list by name.
 * `ids` is what gets added: a single damage_id, or every id of a named
 * mechanic group from RecountTable.
 */
export type DamageSearchResult = {
  key: string;
  name: string;
  ids: number[];
  isGroup: boolean;
};

export type DamageCatalogEntry = DamageSearchResult & { nameLower: string };

// Built lazily once per locale — the underlying game-data tables are static.
const CATALOG_BY_LOCALE = new Map<AppLocale, DamageCatalogEntry[]>();

function resolveSingleName(id: number, locale: AppLocale): string | null {
  for (const candidate of getGameDataFallbackChain(locale)) {
    const name = normalizeGameDataText(
      getGameData(candidate).damageAttrIdNames[String(id)],
    );
    if (name) return name;
  }
  return null;
}

function resolveGroupName(
  recountId: number,
  rawName: string,
  locale: AppLocale,
): string | null {
  const current = normalizeGameDataText(rawName);
  if (current) return current;
  for (const candidate of getGameDataFallbackChain(locale)) {
    const name = normalizeGameDataText(
      getGameData(candidate).recountTable[String(recountId)]?.RecountName,
    );
    if (name) return name;
  }
  return null;
}

function buildCatalog(locale: AppLocale): DamageCatalogEntry[] {
  const entries: DamageCatalogEntry[] = [];

  // Named mechanic groups first (adding one bundles all of its damage ids).
  const recountTable = getGameData(locale).recountTable;
  for (const entry of Object.values(recountTable)) {
    if (!entry.DamageId?.length) continue;
    const name = resolveGroupName(entry.Id, entry.RecountName, locale);
    if (!name) continue;
    entries.push({
      key: `g:${entry.Id}`,
      name,
      ids: [...entry.DamageId],
      isGroup: true,
      nameLower: name.toLowerCase(),
    });
  }

  // Individual named damages.
  const damageNames = getGameData(locale).damageAttrIdNames;
  for (const idText of Object.keys(damageNames)) {
    const id = Number(idText);
    if (!Number.isFinite(id)) continue;
    const name = resolveSingleName(id, locale);
    if (!name) continue;
    entries.push({
      key: `s:${id}`,
      name,
      ids: [id],
      isGroup: false,
      nameLower: name.toLowerCase(),
    });
  }

  // Search tie order, fixed once here so searches never sort per keystroke.
  entries.sort(
    (a, b) =>
      Number(b.isGroup) - Number(a.isGroup) ||
      (a.ids[0] ?? 0) - (b.ids[0] ?? 0),
  );
  return entries;
}

/**
 * Every named damage group and damage id, built once per locale, ordered
 * groups first, then by (first) id. Immutable: searches return its entries.
 */
export function getDamageCatalog(locale: AppLocale): DamageCatalogEntry[] {
  const cached = CATALOG_BY_LOCALE.get(locale);
  if (cached) return cached;
  const built = buildCatalog(locale);
  CATALOG_BY_LOCALE.set(locale, built);
  return built;
}
