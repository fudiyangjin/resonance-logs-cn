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

const MONSTER_RUNTIME_RELATIVE_PATH = "parser/MonsterName.json";

const MONSTER_NAME_TRANSLATIONS: Record<string, MultiLangValue> = cloneJson(
    getBundledTranslationTable("parser/MonsterName.json") as unknown as Record<string, MultiLangValue>,
);

const BUNDLED_MONSTER_NAME_TRANSLATIONS = cloneJson(MONSTER_NAME_TRANSLATIONS);

let monsterRuntimeInitPromise: Promise<void> | null = null;
let monsterRuntimeListenerPromise: Promise<void> | null = null;
let monsterSourceModeListenerRegistered = false;

async function ensureMonsterTranslationRuntimeFiles(): Promise<void> {
    try {
        await invoke<string>("initialize_translation_runtime_files");
    } catch (error) {
        console.warn(
            "[monster-mappings] Failed to initialize runtime translation files:",
            error,
        );
    }
}

async function readRuntimeMonsterTranslations(): Promise<
    Record<string, MultiLangValue> | null
> {
    try {
        const raw = await invoke<string>("read_translation_runtime_file", {
            relativePath: MONSTER_RUNTIME_RELATIVE_PATH,
        });
        const parsed: unknown = JSON.parse(raw);

        if (!isRecord(parsed)) {
            console.warn(
                `[monster-mappings] Runtime monster translation file is not an object: ${MONSTER_RUNTIME_RELATIVE_PATH}`,
            );
            return null;
        }

        return parsed as Record<string, MultiLangValue>;
    } catch (error) {
        console.warn(
            `[monster-mappings] Failed to read runtime monster translation file: ${MONSTER_RUNTIME_RELATIVE_PATH}`,
            error,
        );
        return null;
    }
}

async function loadMonsterRuntimeData(): Promise<void> {
    if (getCurrentTranslationSourceMode() === "bundled") {
        replaceRecordContents(
            MONSTER_NAME_TRANSLATIONS,
            cloneJson(BUNDLED_MONSTER_NAME_TRANSLATIONS),
        );
        return;
    }

    await ensureMonsterTranslationRuntimeFiles();

    const runtimeValue = await readRuntimeMonsterTranslations();
    const nextValue = runtimeValue ?? BUNDLED_MONSTER_NAME_TRANSLATIONS;

    replaceRecordContents(MONSTER_NAME_TRANSLATIONS, cloneJson(nextValue));
}

async function registerMonsterRuntimeListener(): Promise<void> {
    if (typeof window === "undefined") {
        return;
    }

    if (!monsterRuntimeListenerPromise) {
        monsterRuntimeListenerPromise = listen("translation-data-refreshed", async () => {
            await loadMonsterRuntimeData();
        })
            .then(() => undefined)
            .catch((error) => {
                console.warn(
                    "[monster-mappings] Failed to register translation refresh listener:",
                    error,
                );
            });
    }

    if (!monsterSourceModeListenerRegistered) {
        window.addEventListener(TRANSLATION_SOURCE_MODE_EVENT, async () => {
            await loadMonsterRuntimeData();
        });
        monsterSourceModeListenerRegistered = true;
    }

    await monsterRuntimeListenerPromise;
}

export async function initializeMonsterRuntimeData(): Promise<void> {
    if (!monsterRuntimeInitPromise) {
        monsterRuntimeInitPromise = (async () => {
            await registerMonsterRuntimeListener();
            await loadMonsterRuntimeData();
        })();
    }

    await monsterRuntimeInitPromise;
}

export async function reloadMonsterRuntimeData(): Promise<void> {
    await loadMonsterRuntimeData();
}

function normalizeText(value: string | null | undefined): string {
    return value?.trim() ?? "";
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

    const selected = normalizeText(value?.[locale]);
    if (selected) return selected;

    if (locale !== PRIMARY_FALLBACK_LOCALE) {
        const en = normalizeText(value?.[PRIMARY_FALLBACK_LOCALE]);
        if (en) return en;
    }

    if (locale !== DEFAULT_LOCALE) {
        const zh = normalizeText(value?.[DEFAULT_LOCALE]);
        if (zh) return zh;
    }

    return fallback;
}

function normalizeMonsterLookupName(rawName: string | null | undefined): string {
    const normalized = normalizeText(rawName);
    if (!normalized) {
        return "";
    }

    return normalized
        .replace(/_Coordinates$/i, "")
        .replace(/_/g, " ")
        .trim();
}

function splitCompositeMonsterNames(rawName: string | null | undefined): string[] {
    const normalized = normalizeText(rawName);
    if (!normalized) {
        return [];
    }

    return normalized
        .split(/[;,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function buildRawNameIndex(): Map<string, string> {
    const index = new Map<string, string>();

    for (const [monsterId, entry] of Object.entries(MONSTER_NAME_TRANSLATIONS)) {
        for (const locale of SUPPORTED_LOCALES) {
            const localized = normalizeText(entry?.[locale]);
            if (localized) index.set(localized, monsterId);
        }
    }

    return index;
}

function findMonsterIdByRawName(rawName: string | null | undefined): string | null {
    const normalized = normalizeText(rawName);
    if (!normalized) return null;

    const index = buildRawNameIndex();
    const candidates = [normalized, normalizeMonsterLookupName(normalized)].filter(Boolean);

    for (const candidate of candidates) {
        const exactId = index.get(candidate);
        if (exactId) {
            return exactId;
        }
    }

    return null;
}

export function hasMonsterTranslation(monsterId: string | number): boolean {
    return Boolean(MONSTER_NAME_TRANSLATIONS[String(monsterId)]);
}

export function getLocalizedMonsterName(
    monsterId: string | number,
    fallbackRawName?: string | null,
): string {
    const id = String(monsterId);
    const entry = MONSTER_NAME_TRANSLATIONS[id];

    return resolveMultiLangName(
        entry,
        normalizeText(fallbackRawName) || `Unknown Monster ${id}`,
    );
}

export function localizeMonsterName(
    monsterId: string | number,
    fallbackRawName?: string | null,
): string {
    return getLocalizedMonsterName(monsterId, fallbackRawName);
}

export function localizeRawMonsterName(
    rawMonsterName: string | null | undefined,
    fallback?: string | null,
): string {
    const normalizedRawName = normalizeText(rawMonsterName);
    const compositeParts = splitCompositeMonsterNames(normalizedRawName);

    if (compositeParts.length > 1) {
        return compositeParts
            .map((part) => localizeRawMonsterName(part, part))
            .filter(Boolean)
            .join(", ");
    }

    const matchedId = findMonsterIdByRawName(normalizedRawName);
    if (matchedId) {
        return getLocalizedMonsterName(
            matchedId,
            normalizeMonsterLookupName(normalizedRawName) || normalizedRawName,
        );
    }

    return normalizeMonsterLookupName(normalizedRawName)
        || normalizedRawName
        || normalizeText(fallback)
        || "Unknown Monster";
}

void initializeMonsterRuntimeData();
