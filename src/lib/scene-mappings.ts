import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import sceneNameTranslationsRaw from "$lib/translations/SceneName.json";
import {
    TRANSLATION_SOURCE_MODE_EVENT,
    getCurrentTranslationSourceMode,
} from "$lib/i18n";
import { settings } from "$lib/settings-store";

type LocaleCode = "zh-CN" | "en" | "ja";
type MultiLangValue = Partial<Record<LocaleCode, string>>;

type SceneTranslationEntry = MultiLangValue;

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

const SCENE_RUNTIME_RELATIVE_PATH = "SceneName.json";

const SCENE_NAME_TRANSLATIONS: Record<string, SceneTranslationEntry> = cloneJson(
    sceneNameTranslationsRaw as unknown as Record<string, SceneTranslationEntry>,
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
        sceneRuntimeListenerPromise = listen("translation-data-refreshed", async () => {
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

    if (locale === "en" || locale === "ja" || locale === "zh-CN") {
        return locale;
    }

    return "zh-CN";
}

function resolveMultiLangName(value: MultiLangValue | undefined, fallback: string): string {
    const locale = getCurrentLocale();
    const selected = value?.[locale]?.trim();
    if (selected) return selected;

    const zh = value?.["zh-CN"]?.trim();
    if (zh) return zh;

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

function findSceneEntryByRawName(rawSceneName: string | null | undefined): SceneTranslationEntry | undefined {
    const normalized = rawSceneName?.trim();
    if (!normalized) {
        return undefined;
    }

    for (const entry of Object.values(SCENE_NAME_TRANSLATIONS)) {
        if (!entry) continue;
        if (
            entry["zh-CN"]?.trim() === normalized ||
            entry.en?.trim() === normalized ||
            entry.ja?.trim() === normalized
        ) {
            return entry;
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
        return fallback;
    }

    const entry = SCENE_NAME_TRANSLATIONS[normalized];
    if (!entry) {
        return fallback;
    }

    return resolveMultiLangName(entry, fallback);
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
    return resolveMultiLangName(entry, fallback);
}

export function hasSceneTranslation(sceneId: number | string | null | undefined): boolean {
    const normalized = normalizeSceneId(sceneId);
    return normalized ? Boolean(SCENE_NAME_TRANSLATIONS[normalized]) : false;
}

void initializeSceneNameRuntimeData();
