import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import buffNameRaw from "./BuffName.json";
import { getBundledTranslationTable } from "$lib/locale-bundles";
import {
  DEFAULT_LOCALE,
  PRIMARY_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  TRANSLATION_SOURCE_MODE_EVENT,
  getCurrentTranslationSourceMode,
  isLocaleCode,
  type LocaleCode,
} from "$lib/i18n";
import { settings } from "$lib/settings-store";

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

type RawBuffEntry = {
  Id: number;
  Icon?: string | null;
  NameDesign?: string | null;
  SpriteFile?: string | null;
};

type MultiLangValue = Partial<Record<LocaleCode, string>>;
type MultiLangKeywords = Partial<Record<LocaleCode, string[]>>;

type TranslationRefreshPayload = {
  relativePath?: string;
  locale?: string;
};

type BuffNameTranslationEntry = {
  Id?: number;
  Icon?: string | null;
  NameDesign?: MultiLangValue;
  SpriteFile?: string | null;
};

type BuffSearchTranslationEntry = {
  name?: MultiLangValue;
  keywords?: MultiLangKeywords;
  notes?: MultiLangValue;
  overlayAlias?: MultiLangValue;
  categories?: BuffCategoryKey[];
  iconKey?: string | null;
  spriteFile?: string | null;
  hasSpriteFile?: boolean;
};

type BuffSearchIndexEntry = {
  baseId: number;
  texts: string[];
};

const DEFAULT_SEARCH_RESULT_LIMIT = 50;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replaceRecordContents<T extends Record<string, any>>(target: T, source: T): void {
  for (const key of Object.keys(target)) {
    delete target[key as keyof T];
  }
  Object.assign(target, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BUFF_NAME_RUNTIME_RELATIVE_PATH = "parser/BuffName.json";
const BUFF_SEARCH_RUNTIME_RELATIVE_PATH = "search/BuffNameSearch.json";

const BUFF_NAME_TRANSLATIONS: Record<string, BuffNameTranslationEntry> = cloneJson(
  getBundledTranslationTable("parser/BuffName.json") as unknown as Record<string, BuffNameTranslationEntry>,
);

const BUFF_SEARCH_TRANSLATIONS: Record<string, BuffSearchTranslationEntry> = cloneJson(
  getBundledTranslationTable("search/BuffNameSearch.json") as unknown as Record<string, BuffSearchTranslationEntry>,
);

const BUNDLED_BUFF_NAME_TRANSLATIONS: Record<string, BuffNameTranslationEntry> = cloneJson(BUFF_NAME_TRANSLATIONS);
const BUNDLED_BUFF_SEARCH_TRANSLATIONS: Record<string, BuffSearchTranslationEntry> = cloneJson(BUFF_SEARCH_TRANSLATIONS);

const BUFF_SEARCH_INDEX: BuffSearchIndexEntry[] = [];
const BUFF_SEARCH_INDEX_MAP = new Map<number, string[]>();

let buffTranslationRuntimeInitPromise: Promise<void> | null = null;
let buffTranslationRuntimeListenerPromise: Promise<void> | null = null;
let buffTranslationSourceModeListenerRegistered = false;

async function ensureBuffTranslationRuntimeFiles(): Promise<void> {
  try {
    await invoke<string>("initialize_translation_runtime_files");
  } catch (error) {
    console.warn(
      "[buff-name-table] Failed to initialize runtime translation files:",
      error,
    );
  }
}

async function readRuntimeBuffNameTranslations(): Promise<
  Record<string, BuffNameTranslationEntry> | null
> {
  try {
    const raw = await invoke<string>("read_translation_runtime_file", {
      relativePath: BUFF_NAME_RUNTIME_RELATIVE_PATH,
    });
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      console.warn(
        `[buff-name-table] Runtime buff translation file is not an object: ${BUFF_NAME_RUNTIME_RELATIVE_PATH}`,
      );
      return null;
    }

    return parsed as Record<string, BuffNameTranslationEntry>;
  } catch (error) {
    console.warn(
      `[buff-name-table] Failed to read runtime buff translation file: ${BUFF_NAME_RUNTIME_RELATIVE_PATH}`,
      error,
    );
    return null;
  }
}

async function readRuntimeBuffSearchTranslations(): Promise<
  Record<string, BuffSearchTranslationEntry> | null
> {
  try {
    const raw = await invoke<string>("read_translation_runtime_file", {
      relativePath: BUFF_SEARCH_RUNTIME_RELATIVE_PATH,
    });
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      console.warn(
        `[buff-name-table] Runtime buff search translation file is not an object: ${BUFF_SEARCH_RUNTIME_RELATIVE_PATH}`,
      );
      return null;
    }

    return parsed as Record<string, BuffSearchTranslationEntry>;
  } catch (error) {
    console.warn(
      `[buff-name-table] Failed to read runtime buff search translation file: ${BUFF_SEARCH_RUNTIME_RELATIVE_PATH}`,
      error,
    );
    return null;
  }
}

async function loadBuffTranslationRuntimeData(): Promise<void> {
  if (getCurrentTranslationSourceMode() === "bundled") {
    replaceRecordContents(BUFF_NAME_TRANSLATIONS, cloneJson(BUNDLED_BUFF_NAME_TRANSLATIONS));
    replaceRecordContents(BUFF_SEARCH_TRANSLATIONS, cloneJson(BUNDLED_BUFF_SEARCH_TRANSLATIONS));
    rebuildBuffSearchIndex();
    return;
  }

  await ensureBuffTranslationRuntimeFiles();

  const [runtimeBuffNameValue, runtimeBuffSearchValue] = await Promise.all([
    readRuntimeBuffNameTranslations(),
    readRuntimeBuffSearchTranslations(),
  ]);

  const nextBuffNameValue = runtimeBuffNameValue ?? BUNDLED_BUFF_NAME_TRANSLATIONS;
  const nextBuffSearchValue =
    runtimeBuffSearchValue ?? BUNDLED_BUFF_SEARCH_TRANSLATIONS;

  replaceRecordContents(BUFF_NAME_TRANSLATIONS, cloneJson(nextBuffNameValue));
  replaceRecordContents(BUFF_SEARCH_TRANSLATIONS, cloneJson(nextBuffSearchValue));
  rebuildBuffSearchIndex();
}

async function registerBuffTranslationRuntimeListener(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (!buffTranslationRuntimeListenerPromise) {
    buffTranslationRuntimeListenerPromise = listen<TranslationRefreshPayload>("translation-data-refreshed", async (event) => {
      const relativePath = event.payload?.relativePath;
      if (relativePath && relativePath !== BUFF_NAME_RUNTIME_RELATIVE_PATH && relativePath !== BUFF_SEARCH_RUNTIME_RELATIVE_PATH) {
        return;
      }

      await loadBuffTranslationRuntimeData();
    })
      .then(() => undefined)
      .catch((error) => {
        console.warn(
          "[buff-name-table] Failed to register translation refresh listener:",
          error,
        );
      });
  }

  if (!buffTranslationSourceModeListenerRegistered) {
    window.addEventListener(TRANSLATION_SOURCE_MODE_EVENT, async () => {
      await loadBuffTranslationRuntimeData();
    });
    buffTranslationSourceModeListenerRegistered = true;
  }

  await buffTranslationRuntimeListenerPromise;
}

export async function initializeBuffSearchRuntimeData(): Promise<void> {
  if (!buffTranslationRuntimeInitPromise) {
    buffTranslationRuntimeInitPromise = (async () => {
      await registerBuffTranslationRuntimeListener();
      await loadBuffTranslationRuntimeData();
    })();
  }

  await buffTranslationRuntimeInitPromise;
}

export async function reloadBuffSearchRuntimeData(): Promise<void> {
  await loadBuffTranslationRuntimeData();
}

const rawBuffEntries = buffNameRaw as RawBuffEntry[];

const BUFF_META_MAP = new Map<number, BuffMeta>();
const AVAILABLE_BUFF_IDS_WITH_SPRITE: number[] = [];
const BUFF_CATEGORY_CATALOG: Record<
  BuffCategoryKey,
  { label: string; buffIds: number[] }
> = {
  food: { label: "食物", buffIds: [] },
  alchemy: { label: "炼金", buffIds: [] },
};

function resolveBuffCategories(
  _defaultName: string,
  iconKey: string | null,
): BuffCategoryKey[] {
  const categories: BuffCategoryKey[] = [];

  if (iconKey?.startsWith("buff_food_up")) {
    categories.push("food");
  }

  if (iconKey?.startsWith("buff_agentia_up")) {
    categories.push("alchemy");
  }

  return categories;
}

for (const entry of rawBuffEntries) {
  const defaultName = entry.NameDesign?.trim() ?? "";
  if (!defaultName) continue;

  const iconKey = entry.Icon?.trim() || null;
  const spriteFile = entry.SpriteFile?.trim() || null;
  const categories = resolveBuffCategories(defaultName, iconKey);
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
  BUFF_META_MAP.set(entry.Id, meta);

  for (const category of categories) {
    BUFF_CATEGORY_CATALOG[category].buffIds.push(entry.Id);
  }

  if (spriteFile) {
    AVAILABLE_BUFF_IDS_WITH_SPRITE.push(entry.Id);
  }
}

AVAILABLE_BUFF_IDS_WITH_SPRITE.sort((a, b) => a - b);
for (const category of Object.values(BUFF_CATEGORY_CATALOG)) {
  category.buffIds.sort((a, b) => a - b);
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/cooldowns?/g, "cd")
    .replace(/cool\s+downs?/g, "cd")
    .replace(/cds/g, "cd");
}

function getCurrentLocale(): LocaleCode {
  const locale = String(settings.state.live.general.language);

  if (isLocaleCode(locale)) {
    return locale;
  }

  return DEFAULT_LOCALE;
}

function resolveMultiLangValue(
  value: MultiLangValue | undefined,
  fallback: string,
): string {
  const locale = getCurrentLocale();
  const selected = value?.[locale]?.trim();
  if (selected) return selected;

  if (locale !== PRIMARY_FALLBACK_LOCALE) {
    const en = value?.[PRIMARY_FALLBACK_LOCALE]?.trim();
    if (en) return en;
  }

  if (locale !== DEFAULT_LOCALE) {
    const zh = value?.[DEFAULT_LOCALE]?.trim();
    if (zh) return zh;
  }

  return fallback;
}

function getDirectMultiLangValue(
  value: MultiLangValue | undefined,
  locale = getCurrentLocale(),
): string {
  return value?.[locale]?.trim() ?? "";
}

function collectMultiLangTexts(value: MultiLangValue | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const locale of SUPPORTED_LOCALES) {
    const text = value?.[locale]?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }

  return out;
}

function collectKeywordTexts(value: MultiLangKeywords | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const locale of SUPPORTED_LOCALES) {
    for (const keyword of value?.[locale] ?? []) {
      const trimmed = keyword.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }

  return out;
}

function lookupBuffNameEntry(baseId: number): BuffNameTranslationEntry | undefined {
  return BUFF_NAME_TRANSLATIONS[String(baseId)];
}

function lookupBuffSearchEntry(baseId: number): BuffSearchTranslationEntry | undefined {
  return BUFF_SEARCH_TRANSLATIONS[String(baseId)];
}

function resolveEffectiveBuffCategories(meta: BuffMeta): BuffCategoryKey[] {
  const entryCategories = normalizeBuffCategoryKeys(
    lookupBuffSearchEntry(meta.baseId)?.categories,
  );

  if (entryCategories.length > 0) {
    return entryCategories;
  }

  return normalizeBuffCategoryKeys(meta.categories);
}


function rebuildBuffSearchIndex(): void {
  BUFF_SEARCH_INDEX.length = 0;
  BUFF_SEARCH_INDEX_MAP.clear();

  for (const meta of BUFF_META_MAP.values()) {
    const texts = collectBuffSearchTexts(meta);
    if (texts.length === 0) {
      continue;
    }

    BUFF_SEARCH_INDEX.push({
      baseId: meta.baseId,
      texts,
    });
    BUFF_SEARCH_INDEX_MAP.set(meta.baseId, texts);
  }
}

function resolveBuffTranslatedName(baseId: number, fallback: string): string {
  return resolveMultiLangValue(lookupBuffNameEntry(baseId)?.NameDesign, fallback);
}

function resolveBuffSearchTranslatedName(baseId: number, fallback: string): string {
  return resolveMultiLangValue(
    lookupBuffSearchEntry(baseId)?.name,
    resolveBuffTranslatedName(baseId, fallback),
  );
}

function resolveBuffOverlayAlias(baseId: number): string {
  return resolveMultiLangValue(lookupBuffSearchEntry(baseId)?.overlayAlias, "");
}

export function getDirectBuffOverlayAlias(baseId: number): string {
  return getDirectMultiLangValue(lookupBuffSearchEntry(baseId)?.overlayAlias);
}

export function getConfiguredBuffOverlayAliasIds(
  aliases?: BuffAliasMap,
): number[] {
  const directLocale = getCurrentLocale();
  const idSet = new Set<number>();

  for (const [baseId, entry] of Object.entries(BUFF_SEARCH_TRANSLATIONS)) {
    const id = Number(baseId);
    if (!Number.isFinite(id)) continue;
    const directOverlayAlias = getDirectMultiLangValue(entry.overlayAlias, directLocale);
    if (directOverlayAlias) {
      idSet.add(id);
    }
  }

  for (const baseId of Object.keys(normalizeAliasMap(aliases))) {
    const id = Number(baseId);
    if (Number.isFinite(id)) {
      idSet.add(id);
    }
  }

  return Array.from(idSet).sort((a, b) => a - b);
}

function buildSearchTranslationSeed(baseId: number): BuffSearchTranslationEntry {
  const meta = lookupBuffMeta(baseId);
  const defaultName = meta?.defaultName ?? `#${baseId}`;

  return {
    name: {
      [DEFAULT_LOCALE]: resolveBuffTranslatedName(baseId, defaultName),
    },
    notes: {},
    overlayAlias: {},
    keywords: {},
    categories: meta ? resolveEffectiveBuffCategories(meta) : [],
    iconKey: meta?.iconKey ?? null,
    spriteFile: meta?.spriteFile ?? null,
    hasSpriteFile: meta?.hasSpriteFile ?? false,
  };
}

export async function saveBuffOverlayAlias(
  baseId: number,
  overlayAlias: string,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const locale = getCurrentLocale();
  await ensureBuffTranslationRuntimeFiles();
  const runtimeTranslations = await readRuntimeBuffSearchTranslations();
  const nextTranslations = cloneJson(runtimeTranslations ?? BUFF_SEARCH_TRANSLATIONS);
  const key = String(baseId);
  const nextEntry = {
    ...buildSearchTranslationSeed(baseId),
    ...(nextTranslations[key] ?? {}),
  } satisfies BuffSearchTranslationEntry;

  nextEntry.overlayAlias = {
    ...(nextEntry.overlayAlias ?? {}),
    [locale]: overlayAlias.trim(),
  };

  nextTranslations[key] = nextEntry;

  try {
    const result = await invoke<string>("write_translation_runtime_locale_file", {
      relativePath: BUFF_SEARCH_RUNTIME_RELATIVE_PATH,
      locale,
      contents: JSON.stringify(nextTranslations, null, 2),
    });

    replaceRecordContents(BUFF_SEARCH_TRANSLATIONS, nextTranslations);
    rebuildBuffSearchIndex();

    return {
      ok: true,
      ...(typeof result === "string" && result.length > 0
        ? { message: result }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectBuffSearchTexts(meta: BuffMeta): string[] {
  const searchEntry = lookupBuffSearchEntry(meta.baseId);
  const buffNameEntry = lookupBuffNameEntry(meta.baseId);
  const texts = new Set<string>();

  const idText = String(meta.baseId);
  texts.add(idText);
  texts.add(`#${idText}`);

  const normalizedDefaultName = normalizeText(meta.defaultName);
  if (normalizedDefaultName) texts.add(normalizedDefaultName);

  for (const text of meta.searchKeywords) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectMultiLangTexts(buffNameEntry?.NameDesign)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectKeywordTexts(searchEntry?.keywords)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectMultiLangTexts(searchEntry?.notes)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  for (const text of collectMultiLangTexts(searchEntry?.overlayAlias)) {
    const normalized = normalizeText(text);
    if (normalized) texts.add(normalized);
  }

  return Array.from(texts);
}

rebuildBuffSearchIndex();

function getIndexedSearchTexts(baseId: number): string[] {
  return BUFF_SEARCH_INDEX_MAP.get(baseId) ?? [];
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

export function lookupBuffMeta(baseId: number): BuffMeta | undefined {
  return BUFF_META_MAP.get(baseId);
}

export function lookupDefaultBuffName(baseId: number): string | undefined {
  return lookupBuffMeta(baseId)?.defaultName;
}

export function getAvailableBuffDefinitions(): BuffDefinition[] {
  return AVAILABLE_BUFF_IDS_WITH_SPRITE.map((baseId) => {
    const meta = lookupBuffMeta(baseId);
    if (!meta?.spriteFile) {
      return {
        baseId,
        name: resolveBuffDisplayName(baseId),
        spriteFile: "",
        searchKeywords: [],
      };
    }

    return {
      baseId,
      name: resolveBuffDisplayName(baseId),
      spriteFile: meta.spriteFile,
      searchKeywords: getIndexedSearchTexts(baseId),
    };
  }).filter((definition) => Boolean(definition.spriteFile));
}

export function getBuffCategoryDefinitions(): BuffCategoryDefinition[] {
  const counts: Record<BuffCategoryKey, number> = {
    food: 0,
    alchemy: 0,
  };

  for (const meta of BUFF_META_MAP.values()) {
    for (const category of resolveEffectiveBuffCategories(meta)) {
      counts[category] += 1;
    }
  }

  return (Object.entries(BUFF_CATEGORY_CATALOG) as Array<
    [BuffCategoryKey, { label: string; buffIds: number[] }]
  >).map(([key, category]) => ({
    key,
    label: category.label,
    count: counts[key],
  }));
}

export function getBuffIdsByCategory(category: BuffCategoryKey): number[] {
  const buffIds: number[] = [];

  for (const meta of BUFF_META_MAP.values()) {
    if (resolveEffectiveBuffCategories(meta).includes(category)) {
      buffIds.push(meta.baseId);
    }
  }

  buffIds.sort((a, b) => a - b);
  return buffIds;
}

export function getBuffCategoryLabel(category: BuffCategoryKey): string {
  return BUFF_CATEGORY_CATALOG[category]?.label ?? category;
}

export function resolveBuffCategoryKey(
  baseId: number,
): BuffCategoryKey | undefined {
  const meta = lookupBuffMeta(baseId);
  if (!meta) return undefined;
  return resolveEffectiveBuffCategories(meta)[0];
}

export function expandBuffSelection(
  buffIds: number[],
  categories?: BuffCategoryKey[] | null,
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

export function lookupResolvedBuffBaseName(baseId: number): string | undefined {
  const defaultName = lookupDefaultBuffName(baseId);
  if (!defaultName) return undefined;
  return resolveBuffSearchTranslatedName(baseId, defaultName);
}

export function resolveBuffSearchDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;

  return lookupResolvedBuffBaseName(baseId) ?? `#${baseId}`;
}

export function resolveBuffDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;

  const defaultName = lookupDefaultBuffName(baseId) ?? `#${baseId}`;
  return resolveBuffTranslatedName(baseId, defaultName);
}

export function resolveBuffOverlayDisplayName(
  baseId: number,
  aliases?: BuffAliasMap,
): string {
  const alias = getAlias(baseId, aliases);
  if (alias) return alias;

  const overlayAlias = resolveBuffOverlayAlias(baseId);
  if (overlayAlias) return overlayAlias;

  return resolveBuffSearchDisplayName(baseId, aliases);
}

export function resolveBuffNameInfo(
  baseId: number,
  aliases?: BuffAliasMap,
): BuffNameInfo {
  const meta = lookupBuffMeta(baseId);
  return {
    baseId,
    name: resolveBuffSearchDisplayName(baseId, aliases),
    hasSpriteFile: meta?.hasSpriteFile ?? false,
  };
}

function isIconSearchableBuff(baseId: number): boolean {
  const meta = lookupBuffMeta(baseId);
  return Boolean(meta?.hasSpriteFile && meta.spriteFile);
}

function searchBuffs(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
  matcher?: (baseId: number) => boolean,
): BuffNameInfo[] {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return [];

  const normalizedAliases = normalizeAliasMap(aliases);
  const matches: Array<{ baseId: number; rank: number }> = [];

  for (const entry of BUFF_SEARCH_INDEX) {
    if (matcher && !matcher(entry.baseId)) {
      continue;
    }

    const alias = normalizedAliases[String(entry.baseId)] ?? null;
    const aliasRank = getMatchRank(alias, normalizedKeyword, 1, 2);

    let searchRank: number | null = null;
    for (const text of entry.texts) {
      const textRank = getMatchRank(text, normalizedKeyword, 3, 4);
      if (textRank === null) continue;
      searchRank = searchRank === null ? textRank : Math.min(searchRank, textRank);
    }

    const rank = Math.min(
      aliasRank ?? Number.POSITIVE_INFINITY,
      searchRank ?? Number.POSITIVE_INFINITY,
    );

    if (!Number.isFinite(rank)) continue;
    matches.push({ baseId: entry.baseId, rank });
  }

  matches.sort((a, b) => a.rank - b.rank || a.baseId - b.baseId);

  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit ?? 0))
    : DEFAULT_SEARCH_RESULT_LIMIT;
  const visibleMatches = matches.slice(0, normalizedLimit);

  return visibleMatches.map((match) =>
    resolveBuffNameInfo(match.baseId, normalizedAliases),
  );
}

export function searchBuffsByName(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
): BuffNameInfo[] {
  return searchBuffs(keyword, aliases, limit);
}

export function searchIconBuffsByName(
  keyword: string,
  aliases?: BuffAliasMap,
  limit?: number | null,
): BuffNameInfo[] {
  return searchBuffs(keyword, aliases, limit, isIconSearchableBuff);
}

void initializeBuffSearchRuntimeData();
