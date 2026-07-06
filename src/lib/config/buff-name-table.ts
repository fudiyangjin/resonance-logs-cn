import { getLocale, t, type AppLocale } from "$lib/i18n/index.svelte";
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
  type RawBuffEntry,
} from "$lib/i18n/game-data";

export type BuffAliasMap = Record<string, string>;
export type BuffCategoryKey = "food" | "alchemy";

export type BuffDefinition = {
  baseId: number;
  name: string;
  spriteFile: string;
  searchKeywords: string[];
};

export type BuffNameInfo = {
  baseId: number;
  name: string;
  hasSpriteFile: boolean;
};

export type BuffMeta = {
  baseId: number;
  defaultName: string;
  hasSpriteFile: boolean;
  spriteFile: string | null;
  iconKey: string | null;
  categories: BuffCategoryKey[];
  searchKeywords: string[];
};

export type BuffCategoryDefinition = {
  key: BuffCategoryKey;
  label: string;
  count: number;
};

type BuffCatalog = {
  metaMap: Map<number, BuffMeta>;
  availableDefinitions: BuffDefinition[];
};

type BuffCategoryCatalog = {
  categoryCatalog: Record<BuffCategoryKey, { buffIds: number[] }>;
  categoryByBuffId: Map<number, BuffCategoryKey[]>;
};

const BUFF_CATALOG_BY_LOCALE = new Map<AppLocale, BuffCatalog>();
let BUFF_CATEGORY_CATALOG: BuffCategoryCatalog | null = null;

const BUFF_CATEGORY_LABEL_KEYS: Record<
  BuffCategoryKey,
  "game.buffCategory.food" | "game.buffCategory.alchemy"
> = {
  food: "game.buffCategory.food",
  alchemy: "game.buffCategory.alchemy",
};

const BUFF_CATEGORY_MATCH_LOCALE: AppLocale = "zh-CN";

const BUFF_CATEGORY_NAME_KEYWORDS: Record<BuffCategoryKey, string[]> = {
  food: ["物攻", "魔攻", "护甲", "耐力", "生命恢复"],
  alchemy: ["元素强度", "元素抗性", "增效强度"],
};

function isAlchemyBuffName(defaultName: string): boolean {
  const normalizedName = normalizeText(defaultName);
  return BUFF_CATEGORY_NAME_KEYWORDS.alchemy.some((keyword) =>
    normalizedName.includes(normalizeText(keyword)),
  );
}

function resolveBuffCategories(
  defaultName: string,
  iconKey: string | null,
): BuffCategoryKey[] {
  const categories: BuffCategoryKey[] = [];
  const normalizedName = normalizeText(defaultName);
  if (
    iconKey?.startsWith("buff_food_up") &&
    BUFF_CATEGORY_NAME_KEYWORDS.food.some((keyword) =>
      normalizedName.includes(normalizeText(keyword)),
    )
  ) {
    categories.push("food");
  }
  if (
    iconKey?.startsWith("buff_agentia_up") &&
    isAlchemyBuffName(defaultName)
  ) {
    categories.push("alchemy");
  }
  return categories;
}

function mergeBuffEntries(locale: AppLocale): RawBuffEntry[] {
  const entriesById = new Map<number, RawBuffEntry>();
  for (const candidate of [...getGameDataFallbackChain(locale)].reverse()) {
    for (const entry of getGameData(candidate).buffNames) {
      entriesById.set(entry.Id, entry);
    }
  }
  return [...entriesById.values()];
}

function buildBuffCategoryCatalog(): BuffCategoryCatalog {
  const categoryCatalog: Record<BuffCategoryKey, { buffIds: number[] }> = {
    food: { buffIds: [] },
    alchemy: { buffIds: [] },
  };
  const categoryByBuffId = new Map<number, BuffCategoryKey[]>();

  for (const entry of mergeBuffEntries(BUFF_CATEGORY_MATCH_LOCALE)) {
    const defaultName = normalizeGameDataText(entry.NameDesign);
    if (!defaultName) continue;

    const iconKey = normalizeGameDataText(entry.Icon);
    const categories = resolveBuffCategories(defaultName, iconKey);
    if (categories.length === 0) continue;

    categoryByBuffId.set(entry.Id, categories);
    for (const category of categories) {
      categoryCatalog[category].buffIds.push(entry.Id);
    }
  }

  for (const category of Object.values(categoryCatalog)) {
    category.buffIds.sort((a, b) => a - b);
  }

  return { categoryCatalog, categoryByBuffId };
}

function getBuffCategoryCatalog(): BuffCategoryCatalog {
  if (BUFF_CATEGORY_CATALOG) return BUFF_CATEGORY_CATALOG;

  BUFF_CATEGORY_CATALOG = buildBuffCategoryCatalog();
  return BUFF_CATEGORY_CATALOG;
}

function buildBuffCatalog(locale: AppLocale): BuffCatalog {
  const metaMap = new Map<number, BuffMeta>();
  const availableDefinitions: BuffDefinition[] = [];
  const { categoryByBuffId } = getBuffCategoryCatalog();

  for (const entry of mergeBuffEntries(locale)) {
    const defaultName = normalizeGameDataText(entry.NameDesign);
    if (!defaultName) continue;

    const iconKey = normalizeGameDataText(entry.Icon);
    const spriteFile = normalizeGameDataText(entry.SpriteFile);
    const categories = categoryByBuffId.get(entry.Id) ?? [];
    const searchKeywords = [defaultName];
    const meta: BuffMeta = {
      baseId: entry.Id,
      defaultName,
      hasSpriteFile: Boolean(spriteFile),
      spriteFile,
      iconKey,
      categories,
      searchKeywords,
    };
    metaMap.set(entry.Id, meta);

    if (spriteFile) {
      availableDefinitions.push({
        baseId: entry.Id,
        name: defaultName,
        spriteFile,
        searchKeywords,
      });
    }
  }

  availableDefinitions.sort((a, b) => a.baseId - b.baseId);

  return { metaMap, availableDefinitions };
}

function getBuffCatalog(locale = getLocale()): BuffCatalog {
  const cached = BUFF_CATALOG_BY_LOCALE.get(locale);
  if (cached) return cached;

  const catalog = buildBuffCatalog(locale);
  BUFF_CATALOG_BY_LOCALE.set(locale, catalog);
  return catalog;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeBuffCategoryKeys(
  categories?: BuffCategoryKey[] | null,
): BuffCategoryKey[] {
  const normalized = new Set<BuffCategoryKey>();
  for (const category of categories ?? []) {
    if (category === "food" || category === "alchemy") {
      normalized.add(category);
    }
  }
  return Array.from(normalized);
}

function normalizeAliasMap(aliases?: BuffAliasMap): BuffAliasMap {
  if (!aliases) return {};
  const next: BuffAliasMap = {};
  for (const [baseId, alias] of Object.entries(aliases)) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    next[baseId] = trimmed;
  }
  return next;
}

function getAlias(baseId: number, aliases?: BuffAliasMap): string | null {
  const normalizedAliases = normalizeAliasMap(aliases);
  const alias = normalizedAliases[String(baseId)]?.trim();
  return alias ? alias : null;
}

function getMatchRank(
  text: string | null | undefined,
  normalizedKeyword: string,
  exactRank: number,
  containsRank: number,
): number | null {
  if (!text) return null;
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;
  if (normalizedText === normalizedKeyword) return exactRank;
  if (normalizedText.includes(normalizedKeyword)) return containsRank;
  return null;
}

function getIdMatchRank(
  baseId: number,
  normalizedKeyword: string,
): number | null {
  const normalizedIdKeyword = normalizedKeyword.replace(/^#/, "");
  if (!/^\d+$/.test(normalizedIdKeyword)) return null;

  const baseIdText = String(baseId);
  if (baseIdText === normalizedIdKeyword) return 0;
  if (baseIdText.startsWith(normalizedIdKeyword)) return 2;
  if (baseIdText.includes(normalizedIdKeyword)) return 5;
  return null;
}

export function lookupBuffMeta(
  baseId: number,
  locale = getLocale(),
): BuffMeta | undefined {
  return getBuffCatalog(locale).metaMap.get(baseId);
}

export function lookupDefaultBuffName(
  baseId: number,
  locale = getLocale(),
): string | undefined {
  return lookupBuffMeta(baseId, locale)?.defaultName;
}

export function getAvailableBuffDefinitions(
  locale = getLocale(),
): BuffDefinition[] {
  return getBuffCatalog(locale).availableDefinitions;
}

export function getBuffCategoryDefinitions(
  _locale = getLocale(),
): BuffCategoryDefinition[] {
  const categoryCatalog = getBuffCategoryCatalog().categoryCatalog;
  return (
    Object.entries(categoryCatalog) as Array<
      [BuffCategoryKey, { buffIds: number[] }]
    >
  ).map(([key, category]) => ({
    key,
    label: t(BUFF_CATEGORY_LABEL_KEYS[key]),
    count: category.buffIds.length,
  }));
}

export function getBuffIdsByCategory(
  category: BuffCategoryKey,
  _locale = getLocale(),
): number[] {
  return [
    ...(getBuffCategoryCatalog().categoryCatalog[category]?.buffIds ?? []),
  ];
}

export function getBuffCategoryLabel(category: BuffCategoryKey): string {
  return t(BUFF_CATEGORY_LABEL_KEYS[category]);
}

export function resolveBuffCategoryKey(
  baseId: number,
  _locale = getLocale(),
): BuffCategoryKey | undefined {
  return getBuffCategoryCatalog().categoryByBuffId.get(baseId)?.[0];
}

export function expandBuffSelection(
  buffIds: number[],
  categories?: BuffCategoryKey[] | null,
  _locale = getLocale(),
): number[] {
  return Array.from(
    new Set([
      ...buffIds,
      ...normalizeBuffCategoryKeys(categories).flatMap((category) =>
        getBuffIdsByCategory(category),
      ),
    ]),
  );
}

export function resolveBuffDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
  locale = getLocale(),
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;
  return lookupDefaultBuffName(baseId, locale) ?? `#${baseId}`;
}

export function resolveBuffNameInfo(
  baseId: number,
  aliases?: BuffAliasMap,
  locale = getLocale(),
): BuffNameInfo {
  const meta = lookupBuffMeta(baseId, locale);
  return {
    baseId,
    name: resolveBuffDisplayName(baseId, aliases, locale),
    hasSpriteFile: meta?.hasSpriteFile ?? false,
  };
}

export function searchBuffsByName(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
  locale = getLocale(),
): BuffNameInfo[] {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return [];

  const normalizedAliases = normalizeAliasMap(aliases);
  const matches: Array<{ baseId: number; rank: number }> = [];

  for (const meta of getBuffCatalog(locale).metaMap.values()) {
    const alias = normalizedAliases[String(meta.baseId)] ?? null;
    const idRank = getIdMatchRank(meta.baseId, normalizedKeyword);
    const aliasRank = getMatchRank(alias, normalizedKeyword, 1, 2);
    const defaultRank = getMatchRank(meta.defaultName, normalizedKeyword, 3, 4);
    const rank = Math.min(
      idRank ?? Number.POSITIVE_INFINITY,
      aliasRank ?? Number.POSITIVE_INFINITY,
      defaultRank ?? Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(rank)) continue;
    matches.push({ baseId: meta.baseId, rank });
  }

  matches.sort((a, b) => a.rank - b.rank || a.baseId - b.baseId);

  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit ?? 0))
    : null;
  const visibleMatches =
    normalizedLimit === null ? matches : matches.slice(0, normalizedLimit);

  return visibleMatches.map((match) =>
    resolveBuffNameInfo(match.baseId, normalizedAliases, locale),
  );
}
