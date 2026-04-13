import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

type MultiLangValue = Partial<Record<LocaleCode, string>>;

type SceneTranslationEntry = MultiLangValue;

type TranslationRefreshPayload = {
    relativePath?: string;
    locale?: string;
};

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

const SCENE_RUNTIME_RELATIVE_PATH = "parser/SceneName.json";

const SCENE_NAME_TRANSLATIONS: Record<string, SceneTranslationEntry> = cloneJson(
    getBundledTranslationTable("parser/SceneName.json") as unknown as Record<string, SceneTranslationEntry>,
);

const BUNDLED_SCENE_NAME_TRANSLATIONS = cloneJson(SCENE_NAME_TRANSLATIONS);

let sceneRuntimeInitPromise: Promise<void> | null = null;
let sceneRuntimeListenerPromise: Promise<void> | null = null;
let sceneSourceModeListenerRegistered = false;

async function ensureSceneTranslationRuntimeFiles(): Promise<void> {
    try {
        await invoke<string>("initialize_translation_runtime_files");
    } catch (error) {
        console.warn(
            "[scene-mappings] Failed to initialize runtime translation files:",
            error,
        );
    }
}

async function readRuntimeSceneTranslations(): Promise<
    Record<string, SceneTranslationEntry> | null
> {
    try {
        const raw = await invoke<string>("read_translation_runtime_file", {
            relativePath: SCENE_RUNTIME_RELATIVE_PATH,
        });
        const parsed: unknown = JSON.parse(raw);

        if (!isRecord(parsed)) {
            console.warn(
                `[scene-mappings] Runtime scene translation file is not an object: ${SCENE_RUNTIME_RELATIVE_PATH}`,
            );
            return null;
        }

        return parsed as Record<string, SceneTranslationEntry>;
    } catch (error) {
        console.warn(
            `[scene-mappings] Failed to read runtime scene translation file: ${SCENE_RUNTIME_RELATIVE_PATH}`,
            error,
        );
        return null;
    }
}

async function loadSceneRuntimeData(): Promise<void> {
    if (getCurrentTranslationSourceMode() === "bundled") {
        replaceRecordContents(
            SCENE_NAME_TRANSLATIONS,
            cloneJson(BUNDLED_SCENE_NAME_TRANSLATIONS),
        );
        return;
    }

    await ensureSceneTranslationRuntimeFiles();

    const runtimeValue = await readRuntimeSceneTranslations();
    const nextValue = runtimeValue ?? BUNDLED_SCENE_NAME_TRANSLATIONS;

    replaceRecordContents(SCENE_NAME_TRANSLATIONS, cloneJson(nextValue));
}

async function registerSceneRuntimeListener(): Promise<void> {
    if (typeof window === "undefined") {
        return;
    }

    if (!sceneRuntimeListenerPromise) {
        sceneRuntimeListenerPromise = listen<TranslationRefreshPayload>("translation-data-refreshed", async (event) => {
            const relativePath = event.payload?.relativePath;
            if (relativePath && relativePath !== SCENE_RUNTIME_RELATIVE_PATH) {
                return;
            }

            await loadSceneRuntimeData();
        })
            .then(() => undefined)
            .catch((error) => {
                console.warn(
                    "[scene-mappings] Failed to register translation refresh listener:",
                    error,
                );
            });
    }

    if (!sceneSourceModeListenerRegistered) {
        window.addEventListener(TRANSLATION_SOURCE_MODE_EVENT, async () => {
            await loadSceneRuntimeData();
        });
        sceneSourceModeListenerRegistered = true;
    }

    await sceneRuntimeListenerPromise;
}

export async function initializeSceneNameRuntimeData(): Promise<void> {
    if (!sceneRuntimeInitPromise) {
        sceneRuntimeInitPromise = (async () => {
            await registerSceneRuntimeListener();
            await loadSceneRuntimeData();
        })();
    }

    await sceneRuntimeInitPromise;
}

export async function reloadSceneNameRuntimeData(): Promise<void> {
    await loadSceneRuntimeData();
}

function getCurrentLocale(): LocaleCode {
  const locale = String(settings.state.live.general.language);

  if (isLocaleCode(locale)) {
    return locale;
  }

  return DEFAULT_LOCALE;
}

function resolveMultiLangName(value: MultiLangValue | undefined, fallback: string): string {
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

function normalizeSceneId(sceneId: number | string | null | undefined): string | null {
    if (sceneId === null || sceneId === undefined) {
        return null;
    }

    const normalized = String(sceneId).trim();
    return normalized ? normalized : null;
}

function getUnknownSceneFallback(sceneId: number | string | null | undefined): string {
    const normalized = normalizeSceneId(sceneId);
    return normalized ? `Unknown Scene ${normalized}` : "Unknown Scene";
}

const SCENE_DIFFICULTY_SUFFIX_REGEX = /^(.*?)-(\d+)$/;

function splitSceneDifficultySuffix(
    rawSceneName: string | null | undefined,
): { baseName: string; suffix: string } | null {
    const normalized = rawSceneName?.trim();
    if (!normalized) {
        return null;
    }

    const match = normalized.match(SCENE_DIFFICULTY_SUFFIX_REGEX);
    if (!match) {
        return null;
    }

    const [, baseName, difficulty] = match;
    const trimmedBase = baseName?.trim();
    if (!trimmedBase) {
        return null;
    }

    return {
        baseName: trimmedBase,
        suffix: `-${difficulty}`,
    };
}

function appendSceneDifficultySuffix(
    localizedName: string,
    rawSceneName: string | null | undefined,
): string {
    const split = splitSceneDifficultySuffix(rawSceneName);
    if (!split) {
        return localizedName;
    }

    return localizedName.endsWith(split.suffix)
        ? localizedName
        : `${localizedName}${split.suffix}`;
}

function findSceneEntryByRawName(rawSceneName: string | null | undefined): SceneTranslationEntry | undefined {
    const normalized = rawSceneName?.trim();
    if (!normalized) {
        return undefined;
    }

    const candidates = [normalized];
    const split = splitSceneDifficultySuffix(normalized);
    if (split) {
        candidates.push(split.baseName);
    }

    for (const candidate of candidates) {
        for (const entry of Object.values(SCENE_NAME_TRANSLATIONS)) {
            if (!entry) continue;
            if (SUPPORTED_LOCALES.some((locale) => entry[locale]?.trim() === candidate)) {
                return entry;
            }
        }
    }

    return undefined;
}

export function getLocalizedSceneName(
    sceneId: number | string | null | undefined,
    fallbackRawName?: string | null,
): string {
    const normalized = normalizeSceneId(sceneId);
    const fallback = fallbackRawName?.trim() || getUnknownSceneFallback(sceneId);

    if (!normalized) {
        return localizeRawSceneName(fallbackRawName, fallback);
    }

    const entry = SCENE_NAME_TRANSLATIONS[normalized];
    if (!entry) {
        return localizeRawSceneName(fallbackRawName, fallback);
    }

    return appendSceneDifficultySuffix(resolveMultiLangName(entry, fallback), fallbackRawName);
}

export function localizeSceneName(
    sceneId: number | string | null | undefined,
    fallbackRawName?: string | null,
): string {
    return getLocalizedSceneName(sceneId, fallbackRawName);
}



export function localizeRawSceneName(
    rawSceneName: string | null | undefined,
    fallbackRawName?: string | null,
): string {
    const fallback = fallbackRawName?.trim() || rawSceneName?.trim() || "Unknown Scene";
    const entry = findSceneEntryByRawName(rawSceneName);
    if (!entry) {
        return fallback;
    }
    return appendSceneDifficultySuffix(resolveMultiLangName(entry, fallback), rawSceneName);
}

export function hasSceneTranslation(sceneId: number | string | null | undefined): boolean {
    const normalized = normalizeSceneId(sceneId);
    return normalized ? Boolean(SCENE_NAME_TRANSLATIONS[normalized]) : false;
}

void initializeSceneNameRuntimeData();
