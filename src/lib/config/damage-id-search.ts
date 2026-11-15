/**
 * @file Damage id search for the counter editor's and challenge watch's
 * damage pickers.
 *
 * Ranks like the monster skill search: id matches first, then names. Every
 * match is returned; paging is left to the result grid. Named mechanic groups
 * (RecountTable) match by name and add all of their damage ids at once.
 *
 * A one-digit id prefix matches thousands of ids, so nothing is sorted per
 * keystroke: the catalog is pre-sorted in tie order (groups first, then by
 * id), id prefixes come from a per-locale index bucketed by digit count and
 * binary-searched, and the rank lists are concatenated in rank order.
 */
import {
  getDamageCatalog,
  type DamageCatalogEntry,
  type DamageSearchResult,
} from "$lib/challenge-damage-search";
import type { AppLocale } from "$lib/i18n/locales";

/** Single damage ids sharing one digit count, sorted by their text. */
type IdBucket = {
  length: number;
  texts: string[];
  entries: DamageCatalogEntry[];
};

const ID_INDEX_BY_LOCALE = new Map<AppLocale, IdBucket[]>();

/**
 * Buckets by digit count, ascending. Within one digit count text order is
 * numeric order, so walking the buckets in order yields ascending ids.
 */
function getIdIndex(locale: AppLocale): IdBucket[] {
  const cached = ID_INDEX_BY_LOCALE.get(locale);
  if (cached) return cached;
  const byLength = new Map<
    number,
    { text: string; entry: DamageCatalogEntry }[]
  >();
  for (const entry of getDamageCatalog(locale)) {
    if (entry.isGroup) continue;
    const text = String(entry.ids[0] ?? "");
    if (!text) continue;
    const bucket = byLength.get(text.length) ?? [];
    bucket.push({ text, entry });
    byLength.set(text.length, bucket);
  }
  const index = [...byLength]
    .sort(([a], [b]) => a - b)
    .map(([length, items]) => {
      items.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
      return {
        length,
        texts: items.map((item) => item.text),
        entries: items.map((item) => item.entry),
      };
    });
  ID_INDEX_BY_LOCALE.set(locale, index);
  return index;
}

function lowerBound(texts: readonly string[], key: string): number {
  let lo = 0;
  let hi = texts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((texts[mid] as string) < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Single entries whose id starts with `prefix`, ascending by id. */
function idPrefixMatches(
  prefix: string,
  locale: AppLocale,
): DamageCatalogEntry[] {
  const matches: DamageCatalogEntry[] = [];
  for (const bucket of getIdIndex(locale)) {
    if (bucket.length < prefix.length) continue;
    for (
      let i = lowerBound(bucket.texts, prefix);
      i < bucket.texts.length && (bucket.texts[i] as string).startsWith(prefix);
      i += 1
    ) {
      matches.push(bucket.entries[i] as DamageCatalogEntry);
    }
  }
  return matches;
}

/**
 * Every damage id or group matching `keyword` by id (`#` optional) or name,
 * best match first: exact id, exact name, id prefix, name substring; groups
 * before single ids, then ascending id, on ties. An exact id the tables do
 * not list is still returned so it can be added by id.
 */
export function searchDamageIds(
  keyword: string,
  locale: AppLocale,
): DamageSearchResult[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  const digits = normalized.replace(/^#/, "");
  const idKeyword = /^\d+$/.test(digits) ? digits : null;

  const nameExact: DamageCatalogEntry[] = [];
  const nameContains: DamageCatalogEntry[] = [];
  for (const entry of getDamageCatalog(locale)) {
    if (entry.nameLower === normalized) nameExact.push(entry);
    else if (entry.nameLower.includes(normalized)) nameContains.push(entry);
  }

  const idMatches =
    idKeyword === null ? [] : idPrefixMatches(idKeyword, locale);
  const first = idMatches[0];
  const exactEntry =
    first && String(first.ids[0]) === idKeyword ? first : undefined;

  const results: DamageSearchResult[] = [];
  const seen = new Set<DamageSearchResult>();
  const push = (entry: DamageSearchResult) => {
    if (seen.has(entry)) return;
    seen.add(entry);
    results.push(entry);
  };

  if (exactEntry) push(exactEntry);
  const exactId = idKeyword === null ? NaN : Number(idKeyword);
  // An id prefix match equal to the typed id is `exactEntry`; only a name
  // match can otherwise list it (e.g. "0123" naming id 123).
  const listsTypedId = (list: readonly DamageCatalogEntry[]) =>
    list.some((entry) => !entry.isGroup && entry.ids[0] === exactId);
  const typedIdListed =
    exactEntry !== undefined ||
    listsTypedId(nameExact) ||
    listsTypedId(nameContains);
  if (Number.isSafeInteger(exactId) && exactId > 0 && !typedIdListed) {
    push({
      key: `s:${exactId}`,
      name: `#${exactId}`,
      ids: [exactId],
      isGroup: false,
    });
  }
  for (const entry of nameExact) push(entry);
  for (const entry of idMatches) push(entry);
  for (const entry of nameContains) push(entry);
  return results;
}
