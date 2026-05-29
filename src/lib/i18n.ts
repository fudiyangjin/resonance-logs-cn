import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writable } from "svelte/store";

import classLabelsData from "$parserData/generated/class-labels.json";
import {
  getBundledTranslationTable,
  getLocaleManifest,
  hydrateAllBundledUiLocales,
} from "$lib/locale-bundles";


export const SUPPORTED_LOCALES = ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id"] as const;
export type LocaleCode = typeof SUPPORTED_LOCALES[number];
export const LOCALE_OPTIONS: Array<{ value: LocaleCode; label: string }> = [
  { value: "en", label: "EN" },
  { value: "zh-CN", label: "CN" },
  { value: "zh-TW", label: "TW" },
  { value: "ja", label: "JP" },
  { value: "ko-KR", label: "KR" },
  { value: "fr", label: "FR" },
  { value: "de", label: "DE" },
  { value: "es", label: "ES" },
  { value: "pt-BR", label: "PT-BR" },
  { value: "th", label: "TH" },
  { value: "id", label: "ID" },
];
export type SkillIdDisplayMode = "off" | "hover" | "column";
export type TranslationSourceMode = "runtime" | "bundled";

export type MultiLangValue = Partial<Record<LocaleCode, string>>;
export type TranslationTable = Record<string, MultiLangValue>;

export type SkillTranslationEntry = {
  name: MultiLangValue;
  note?: MultiLangValue;
};

export type SkillTranslationTable = Record<string, SkillTranslationEntry>;

export const DEFAULT_LOCALE: LocaleCode = "zh-CN";
export const PRIMARY_FALLBACK_LOCALE: LocaleCode = "en";

export function isLocaleCode(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export const DEFAULT_TRANSLATION_SOURCE_MODE: TranslationSourceMode = "bundled";
export const TRANSLATION_SOURCE_MODE_STORAGE_KEY = "resonance.translationSourceMode";
export const TRANSLATION_SOURCE_MODE_EVENT = "translation-source-mode-changed";

function isTranslationSourceMode(value: unknown): value is TranslationSourceMode {
  return value === "runtime" || value === "bundled";
}

function readStoredTranslationSourceMode(): TranslationSourceMode {
  if (typeof window === "undefined") {
    return DEFAULT_TRANSLATION_SOURCE_MODE;
  }

  try {
    const storedValue = window.localStorage.getItem(
      TRANSLATION_SOURCE_MODE_STORAGE_KEY,
    );

    if (isTranslationSourceMode(storedValue)) {
      return storedValue;
    }
  } catch (error) {
    console.warn("[i18n] Failed to read translation source mode:", error);
  }

  return DEFAULT_TRANSLATION_SOURCE_MODE;
}

let currentTranslationSourceMode: TranslationSourceMode = readStoredTranslationSourceMode();

export const TRANSLATION_SOURCE_MODE = writable<TranslationSourceMode>(
  currentTranslationSourceMode,
);

function persistTranslationSourceMode(mode: TranslationSourceMode): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TRANSLATION_SOURCE_MODE_STORAGE_KEY, mode);
}

function emitTranslationSourceModeChanged(mode: TranslationSourceMode): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(TRANSLATION_SOURCE_MODE_EVENT, {
      detail: { mode },
    }),
  );
}

export function getCurrentTranslationSourceMode(): TranslationSourceMode {
  return currentTranslationSourceMode;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replaceRecordContents<T extends Record<string, unknown>>(target: T, source: T): void {
  for (const key of Object.keys(target)) {
    delete target[key as keyof T];
  }
  Object.assign(target, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractLocaleStringMap(value: unknown): MultiLangValue {
  const out: MultiLangValue = {};
  if (!isRecord(value)) return out;

  for (const locale of SUPPORTED_LOCALES) {
    const text = value[locale];
    if (typeof text === "string" && text.trim()) {
      out[locale] = text.trim();
    }
  }

  return out;
}

function buildGeneratedSkillNameTranslations(source: unknown): SkillTranslationTable {
  const out: SkillTranslationTable = {};
  if (!isRecord(source)) return out;

  for (const [id, rawEntry] of Object.entries(source)) {
    if (!isRecord(rawEntry)) continue;

    const name = extractLocaleStringMap(rawEntry["Names"]);
    const fallbackName = firstString(rawEntry["Name"], rawEntry["NameDesign"], rawEntry["name"]);
    if (Object.keys(name).length === 0 && fallbackName) {
      name[PRIMARY_FALLBACK_LOCALE] = fallbackName;
    }

    const note = extractLocaleStringMap(rawEntry["Notes"] ?? rawEntry["Note"] ?? rawEntry["note"]);
    const userNote = firstString(rawEntry["UserNote"]);
    if (userNote) {
      for (const locale of SUPPORTED_LOCALES) {
        note[locale] = userNote;
      }
    }
    const entry: SkillTranslationEntry = { name };
    if (Object.keys(note).length > 0) {
      entry.note = note;
    }

    out[id] = entry;
  }

  return out;
}

function normalizeRuntimePath(relativePath: string): string {
  return relativePath;
}

async function ensureTranslationRuntimeFiles(): Promise<void> {
  try {
    await invoke<string>("initialize_translation_runtime_files");
  } catch (error) {
    console.warn("[i18n] Failed to initialize runtime translation files:", error);
  }
}

async function readRuntimeJson<T extends Record<string, unknown>>(
  relativePath: string,
): Promise<T | null> {
  const runtimePath = normalizeRuntimePath(relativePath);

  try {
    const raw = await invoke<string>("read_translation_runtime_file", {
      relativePath,
    });
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      console.warn(`[i18n] Runtime translation file is not an object: ${runtimePath}`);
      return null;
    }

    return parsed as T;
  } catch (error) {
    console.warn(`[i18n] Failed to read runtime translation file: ${runtimePath}`, error);
    return null;
  }
}

export const SKILL_NAME_TRANSLATIONS: SkillTranslationTable = {};

const UI_TRANSLATION_PATHS = (getLocaleManifest().categories["ui"] ?? []).map(
  (relativePath) => `ui/${relativePath}`,
);

function buildUiTranslationTables(): Record<string, TranslationTable> {
  const tables: Record<string, TranslationTable> = {};

  for (const relativePath of UI_TRANSLATION_PATHS) {
    tables[relativePath] = cloneJson(
      getBundledTranslationTable(relativePath) as TranslationTable,
    );
  }

  return tables;
}

export const UI_TRANSLATION_TABLES = buildUiTranslationTables();

export const MODULE_CALC_TRANSLATIONS: TranslationTable =
  UI_TRANSLATION_TABLES["ui/module-calc.json"] ?? {};

export const MONSTER_MONITOR_TRANSLATIONS: TranslationTable =
  UI_TRANSLATION_TABLES["ui/overlay/monster-monitor.json"] ?? {};

export const CLASS_LABEL_TRANSLATIONS: TranslationTable = cloneJson(
  classLabelsData as TranslationTable,
);

const BUNDLED_UI_TRANSLATION_TABLES = cloneJson(UI_TRANSLATION_TABLES);
const BUNDLED_CLASS_LABEL_TRANSLATIONS = cloneJson(CLASS_LABEL_TRANSLATIONS);
let bundledUiLocaleHydrationPromise: Promise<void> | null = null;

const RUNTIME_TRANSLATION_DESCRIPTORS = [
  ...UI_TRANSLATION_PATHS.map((relativePath) => ({
    relativePath,
    target: UI_TRANSLATION_TABLES[relativePath],
    fallback: cloneJson(BUNDLED_UI_TRANSLATION_TABLES[relativePath] ?? {}),
    runtimeOnly: false,
  })),
  {
    relativePath: "generated/class-labels.json",
    target: CLASS_LABEL_TRANSLATIONS,
    fallback: BUNDLED_CLASS_LABEL_TRANSLATIONS,
    runtimeOnly: false,
  },
] as const;

type TranslationRefreshPayload = {
  dir?: string;
  createdCount?: number;
  relativePath?: string;
  locale?: string;
  timestamp?: string;
};

export const TRANSLATION_RUNTIME_REVISION = writable(0);

let translationRuntimeInitPromise: Promise<void> | null = null;
let translationRuntimeListenerPromise: Promise<void> | null = null;
let bundledSkillNameTranslations: SkillTranslationTable | null = null;
let skillNameTranslationInitPromise: Promise<void> | null = null;
let skillNameTranslationsLoaded = false;

async function loadBundledSkillNameTranslations(): Promise<SkillTranslationTable> {
  if (!bundledSkillNameTranslations) {
    const module = await import("$parserData/generated/skillnames.json");
    bundledSkillNameTranslations = buildGeneratedSkillNameTranslations(module.default);
  }

  return bundledSkillNameTranslations;
}

async function loadSkillNameTranslationTable(): Promise<void> {
  const fallback = await loadBundledSkillNameTranslations();
  if (getCurrentTranslationSourceMode() === "runtime") {
    await ensureTranslationRuntimeFiles();
    const runtimeValue = await readRuntimeJson("generated/skillnames.json");
    const nextValue = runtimeValue
      ? buildGeneratedSkillNameTranslations(runtimeValue)
      : fallback;
    replaceRecordContents(SKILL_NAME_TRANSLATIONS, cloneJson(nextValue));
  } else {
    replaceRecordContents(SKILL_NAME_TRANSLATIONS, cloneJson(fallback));
  }
  skillNameTranslationsLoaded = true;
  TRANSLATION_RUNTIME_REVISION.update((value) => value + 1);
}

export async function initializeSkillNameTranslationData(): Promise<void> {
  if (!skillNameTranslationInitPromise) {
    skillNameTranslationInitPromise = loadSkillNameTranslationTable().finally(() => {
      skillNameTranslationInitPromise = null;
    });
  }

  await skillNameTranslationInitPromise;
}

function ensureSkillNameTranslationsLoading(): void {
  if (!skillNameTranslationsLoaded) {
    void initializeSkillNameTranslationData();
  }
}

async function loadRuntimeTranslationTables(): Promise<void> {
  const sourceMode = getCurrentTranslationSourceMode();
  const needsRuntime = sourceMode === "runtime" || RUNTIME_TRANSLATION_DESCRIPTORS.some((descriptor) => descriptor.runtimeOnly);

  if (needsRuntime) {
    await ensureTranslationRuntimeFiles();
  }

  await Promise.all(
    RUNTIME_TRANSLATION_DESCRIPTORS.map(async (descriptor) => {
      const targetRecord = descriptor.target;
      if (!targetRecord) {
        return;
      }

      if (sourceMode === "bundled" && !descriptor.runtimeOnly) {
        const fallbackValue = (descriptor.fallback ?? {}) as Record<string, unknown>;
        replaceRecordContents(targetRecord, cloneJson(fallbackValue));
        return;
      }

      const runtimeValue = await readRuntimeJson(descriptor.relativePath);
      const nextValue = (runtimeValue ?? descriptor.fallback ?? {}) as Record<string, unknown>;
      replaceRecordContents(targetRecord, cloneJson(nextValue));
    }),
  );

  TRANSLATION_RUNTIME_REVISION.update((value) => value + 1);
}

async function hydrateBundledUiLocaleFallbacks(): Promise<void> {
  if (!bundledUiLocaleHydrationPromise) {
    bundledUiLocaleHydrationPromise = (async () => {
      const changed = await hydrateAllBundledUiLocales();
      if (!changed) return;

      const bundledTables = BUNDLED_UI_TRANSLATION_TABLES as Record<string, TranslationTable>;
      for (const relativePath of UI_TRANSLATION_PATHS) {
        const nextTable = cloneJson(
          getBundledTranslationTable(relativePath) as TranslationTable,
        );
        const bundledTarget = bundledTables[relativePath] ?? {};
        replaceRecordContents(bundledTarget, nextTable);
        bundledTables[relativePath] = bundledTarget;

        if (getCurrentTranslationSourceMode() === "bundled") {
          const runtimeTarget = UI_TRANSLATION_TABLES[relativePath];
          if (runtimeTarget) {
            replaceRecordContents(runtimeTarget, cloneJson(nextTable));
          }
        }
      }

      TRANSLATION_RUNTIME_REVISION.update((value) => value + 1);
    })().finally(() => {
      bundledUiLocaleHydrationPromise = null;
    });
  }

  await bundledUiLocaleHydrationPromise;
}

export async function setTranslationSourceMode(
  mode: TranslationSourceMode,
): Promise<void> {
  if (!isTranslationSourceMode(mode)) {
    throw new Error(`Invalid translation source mode: ${String(mode)}`);
  }

  if (currentTranslationSourceMode === mode) {
    return;
  }

  currentTranslationSourceMode = mode;
  persistTranslationSourceMode(mode);
  TRANSLATION_SOURCE_MODE.set(mode);

  await loadRuntimeTranslationTables();
  await loadSkillNameTranslationTable();
  emitTranslationSourceModeChanged(mode);
}

async function registerTranslationRuntimeListener(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (!translationRuntimeListenerPromise) {
    translationRuntimeListenerPromise = listen<TranslationRefreshPayload>(
      "translation-data-refreshed",
      async (event) => {
        const relativePath = event.payload?.relativePath;
        const isSkillNameRefresh = relativePath === "generated/skillnames.json";
        if (relativePath && !isSkillNameRefresh && !RUNTIME_TRANSLATION_DESCRIPTORS.some((descriptor) => descriptor.relativePath === relativePath)) {
          return;
        }

        await loadRuntimeTranslationTables();
        if (isSkillNameRefresh || !relativePath) {
          await loadSkillNameTranslationTable();
        }
      },
    )
      .then(() => undefined)
      .catch((error) => {
        console.warn("[i18n] Failed to register translation refresh listener:", error);
      });
  }

  await translationRuntimeListenerPromise;
}

export async function initializeTranslationRuntimeData(): Promise<void> {
  if (!translationRuntimeInitPromise) {
    translationRuntimeInitPromise = (async () => {
      await registerTranslationRuntimeListener();
      await loadRuntimeTranslationTables();
      if (typeof window !== "undefined") {
        void hydrateBundledUiLocaleFallbacks();
      }
    })();
  }

  await translationRuntimeInitPromise;
}

export async function reloadTranslationRuntimeData(): Promise<void> {
  await loadRuntimeTranslationTables();
}

export function resolveMultiLangValue(
  value: MultiLangValue | undefined,
  locale: LocaleCode,
  fallback: string,
): string {
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

export function resolveTranslation(
  table: TranslationTable | undefined,
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  const entry = table?.[key];
  return resolveMultiLangValue(entry, locale, fallback);
}

function normalizeUiVirtualPath(relativePath: string): string {
  let normalized = relativePath.replace(/^\/+/, "").trim();

  if (!normalized.startsWith("ui/")) {
    normalized = `ui/${normalized}`;
  }

  if (!normalized.endsWith(".json")) {
    normalized = `${normalized}.json`;
  }

  return normalized;
}

function getUiPathsByPrefix(prefix: string): string[] {
  const normalizedPrefix = prefix.replace(/^\/+/, "");
  return UI_TRANSLATION_PATHS.filter((path) => path.startsWith(`ui/${normalizedPrefix}`));
}

function resolveTranslationFromUiPaths(
  paths: string[],
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  for (const path of paths) {
    const entry = UI_TRANSLATION_TABLES[path]?.[key];
    if (entry) {
      return resolveMultiLangValue(entry, locale, fallback);
    }
  }

  return fallback;
}

export function resolveUiTranslation(
  relativePathOrKey: string,
  keyOrLocale: string | LocaleCode,
  localeOrFallback: LocaleCode | string,
  fallback?: string,
): string {
  if (fallback === undefined) {
    return resolveTranslationFromUiPaths(
      UI_TRANSLATION_PATHS,
      relativePathOrKey,
      keyOrLocale as LocaleCode,
      localeOrFallback as string,
    );
  }

  const normalizedPath = normalizeUiVirtualPath(relativePathOrKey);
  return resolveTranslation(
    UI_TRANSLATION_TABLES[normalizedPath],
    keyOrLocale as string,
    localeOrFallback as LocaleCode,
    fallback,
  );
}

export function uiT(
  relativePath: string,
  locale: LocaleCode | (() => LocaleCode),
): (key: string, fallback: string) => string {
  const normalizedPath = normalizeUiVirtualPath(relativePath);

  return (key: string, fallback: string) =>
    resolveUiTranslation(
      normalizedPath,
      key,
      typeof locale === "function" ? locale() : locale,
      fallback,
    );
}

const DPS_UI_TRANSLATION_PATHS = getUiPathsByPrefix("dps/");
const SKILL_MONITOR_UI_TRANSLATION_PATHS = getUiPathsByPrefix("overlay/skill-monitor/");
export function resolveNavigationTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslationFromUiPaths(
    ["ui/shell.json", ...DPS_UI_TRANSLATION_PATHS],
    key,
    locale,
    fallback,
  );
}

export function resolveModuleCalcTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveUiTranslation("ui/module-calc.json", key, locale, fallback);
}

export function resolveMonsterMonitorTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveUiTranslation("ui/overlay/monster-monitor.json", key, locale, fallback);
}

export function resolveSkillMonitorTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslationFromUiPaths(
    SKILL_MONITOR_UI_TRANSLATION_PATHS,
    key,
    locale,
    fallback,
  );
}

export function resolveClassLabelTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(CLASS_LABEL_TRANSLATIONS, key, locale, fallback);
}

export function resolveLocalizationTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveUiTranslation("ui/localization-tool.json", key, locale, fallback);
}

export function buildSkillMonitorClassNameKey(classKey: string): string {
  return `className.${classKey}`;
}

export function buildSkillMonitorClassSkillKey(
  classKey: string,
  skillId: string | number,
): string {
  return `classSkill.${classKey}.${String(skillId)}`;
}

export function buildSkillMonitorDerivedSkillKey(
  classKey: string,
  sourceSkillId: string | number,
  triggerBuffBaseId: string | number,
): string {
  return `classSkillDerived.${classKey}.${String(sourceSkillId)}.${String(triggerBuffBaseId)}`;
}

export function resolveSkillMonitorClassName(
  classKey: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveUiTranslation(
    "ui/overlay/skill-monitor/skill-cd.json",
    buildSkillMonitorClassNameKey(classKey),
    locale,
    fallback,
  );
}

export function resolveSkillMonitorClassSkillName(
  classKey: string,
  skillId: string | number,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveUiTranslation(
    "ui/overlay/skill-monitor/skill-cd.json",
    buildSkillMonitorClassSkillKey(classKey, skillId),
    locale,
    fallback,
  );
}

export function resolveSkillMonitorDerivedSkillName(
  classKey: string,
  sourceSkillId: string | number,
  triggerBuffBaseId: string | number,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveUiTranslation(
    "ui/overlay/skill-monitor/skill-cd.json",
    buildSkillMonitorDerivedSkillKey(classKey, sourceSkillId, triggerBuffBaseId),
    locale,
    fallback,
  );
}

export function resolveSkillTranslation(
  id: string | number,
  locale: LocaleCode,
  fallbackName: string,
): string {
  ensureSkillNameTranslationsLoading();
  const entry = SKILL_NAME_TRANSLATIONS[String(id)];
  return resolveMultiLangValue(entry?.name, locale, fallbackName);
}

export function resolveSkillNote(
  id: string | number,
  locale: LocaleCode,
): string {
  ensureSkillNameTranslationsLoading();
  const entry = SKILL_NAME_TRANSLATIONS[String(id)];
  return resolveMultiLangValue(entry?.note, locale, "");
}

export function fallbackIdLabel(id: string | number): string {
  return String(id);
}

if (typeof window !== "undefined") {
  void initializeTranslationRuntimeData();
}
