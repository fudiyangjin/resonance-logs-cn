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
  categoryCatalog: Record<BuffCategoryKey, { buffIds: number[] }>;
};

const BUFF_CATALOG_BY_LOCALE = new Map<AppLocale, BuffCatalog>();

const BUFF_CATEGORY_LABEL_KEYS: Record<
  BuffCategoryKey,
  "game.buffCategory.food" | "game.buffCategory.alchemy"
> = {
  food: "game.buffCategory.food",
  alchemy: "game.buffCategory.alchemy",
};

const BUFF_NAME_KEYWORDS: Record<
  AppLocale,
  Record<BuffCategoryKey, string[]>
> = {
  "zh-CN": {
    food: ["物攻", "魔攻", "护甲", "耐力", "生命恢复"],
    alchemy: ["元素强度", "元素抗性", "增效强度"],
  },
  "en-US": {
    food: [
      "physical attack",
      "magic attack",
      "armor",
      "stamina",
      "health recovery",
    ],
    alchemy: ["elemental strength", "elemental resistance", "amplification"],
  },
};

function isAlchemyBuffName(defaultName: string, locale: AppLocale): boolean {
  const normalizedName = normalizeText(defaultName);
  return getBuffNameKeywords(locale).alchemy.some((keyword) =>
    normalizedName.includes(normalizeText(keyword)),
  );
}

function getBuffNameKeywords(
  locale: AppLocale,
): Record<BuffCategoryKey, string[]> {
  return BUFF_NAME_KEYWORDS[locale] ?? BUFF_NAME_KEYWORDS["zh-CN"];
}

function resolveBuffCategories(
  defaultName: string,
  iconKey: string | null,
  locale: AppLocale,
): BuffCategoryKey[] {
  const categories: BuffCategoryKey[] = [];
  const normalizedName = normalizeText(defaultName);
  if (
    iconKey?.startsWith("buff_food_up") &&
    getBuffNameKeywords(locale).food.some((keyword) =>
      normalizedName.includes(normalizeText(keyword)),
    )
  ) {
    categories.push("food");
  }
  if (
    iconKey?.startsWith("buff_agentia_up") &&
    isAlchemyBuffName(defaultName, locale)
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

function buildBuffCatalog(locale: AppLocale): BuffCatalog {
  const metaMap = new Map<number, BuffMeta>();
  const availableDefinitions: BuffDefinition[] = [];
  const categoryCatalog: Record<BuffCategoryKey, { buffIds: number[] }> = {
    food: { buffIds: [] },
    alchemy: { buffIds: [] },
  };

  for (const entry of mergeBuffEntries(locale)) {
    const defaultName = normalizeGameDataText(entry.NameDesign);
    if (!defaultName) continue;

    const iconKey = normalizeGameDataText(entry.Icon);
    const spriteFile = normalizeGameDataText(entry.SpriteFile);
    const categories = resolveBuffCategories(defaultName, iconKey, locale);
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
    for (const category of categories) {
      categoryCatalog[category].buffIds.push(entry.Id);
    }

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
  for (const category of Object.values(categoryCatalog)) {
    category.buffIds.sort((a, b) => a - b);
  }

  return { metaMap, availableDefinitions, categoryCatalog };
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
  locale = getLocale(),
): BuffCategoryDefinition[] {
  const categoryCatalog = getBuffCatalog(locale).categoryCatalog;
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
  locale = getLocale(),
): number[] {
  return [...(getBuffCatalog(locale).categoryCatalog[category]?.buffIds ?? [])];
}

export function getBuffCategoryLabel(category: BuffCategoryKey): string {
  return t(BUFF_CATEGORY_LABEL_KEYS[category]);
}

export function resolveBuffCategoryKey(
  baseId: number,
  locale = getLocale(),
): BuffCategoryKey | undefined {
  return lookupBuffMeta(baseId, locale)?.categories[0];
}

export function expandBuffSelection(
  buffIds: number[],
  categories?: BuffCategoryKey[] | null,
  locale = getLocale(),
): number[] {
  return Array.from(
    new Set([
      ...buffIds,
      ...normalizeBuffCategoryKeys(categories).flatMap((category) =>
        getBuffIdsByCategory(category, locale),
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
    const aliasRank = getMatchRank(alias, normalizedKeyword, 1, 2);
    const defaultRank = getMatchRank(meta.defaultName, normalizedKeyword, 3, 4);
    const rank = Math.min(
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
