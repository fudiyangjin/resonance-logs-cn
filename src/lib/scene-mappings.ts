import sceneNamesData from "$parserData/generated/scenenames.json";
import {
    DEFAULT_LOCALE,
    PRIMARY_FALLBACK_LOCALE,
    SUPPORTED_LOCALES,
    isLocaleCode,
    type LocaleCode,
} from "$lib/i18n";
import { settings } from "$lib/settings-store";

type MultiLangValue = Partial<Record<LocaleCode, string>>;

type SceneTranslationEntry = MultiLangValue;

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstGeneratedString(entry: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = entry[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function buildGeneratedSceneTranslations(source: unknown): Record<string, SceneTranslationEntry> {
    const out: Record<string, SceneTranslationEntry> = {};
    if (!isRecord(source)) return out;

    for (const [id, value] of Object.entries(source)) {
        const entry = isRecord(value) ? value : { Name: value };
        const names: SceneTranslationEntry = {};
        const rawNames = entry["Names"];
        if (isRecord(rawNames)) {
            for (const locale of SUPPORTED_LOCALES) {
                const text = rawNames[locale];
                if (typeof text === "string" && text.trim()) {
                    names[locale] = text.trim();
                }
            }
        }

        if (Object.keys(names).length === 0) {
            const fallback = firstGeneratedString(entry, ["Name", "NameDesign", "DesignName"]);
            if (fallback) names[PRIMARY_FALLBACK_LOCALE] = fallback;
        }

        if (Object.keys(names).length > 0) {
            out[id] = names;
        }
    }

    return out;
}

const SCENE_NAME_TRANSLATIONS: Record<string, SceneTranslationEntry> = cloneJson(
    buildGeneratedSceneTranslations(sceneNamesData),
);

export async function initializeSceneNameRuntimeData(): Promise<void> {
    return;
}

export async function reloadSceneNameRuntimeData(): Promise<void> {
    return;
}

function getCurrentLocale(localeOverride?: LocaleCode): LocaleCode {
  if (localeOverride && isLocaleCode(localeOverride)) {
    return localeOverride;
  }

  const locale = String(settings.state.live.general.language);

  if (isLocaleCode(locale)) {
    return locale;
  }

  return DEFAULT_LOCALE;
}

function resolveMultiLangName(
  value: MultiLangValue | undefined,
  fallback: string,
  localeOverride?: LocaleCode,
): string {
  const locale = getCurrentLocale(localeOverride);
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
    localeOverride?: LocaleCode,
): string {
    const normalized = normalizeSceneId(sceneId);
    const fallback = fallbackRawName?.trim() || getUnknownSceneFallback(sceneId);

    if (!normalized) {
        return localizeRawSceneName(fallbackRawName, fallback, localeOverride);
    }

    const entry = SCENE_NAME_TRANSLATIONS[normalized];
    if (!entry) {
        return localizeRawSceneName(fallbackRawName, fallback, localeOverride);
    }

    return appendSceneDifficultySuffix(resolveMultiLangName(entry, fallback, localeOverride), fallbackRawName);
}

export function localizeSceneName(
    sceneId: number | string | null | undefined,
    fallbackRawName?: string | null,
    localeOverride?: LocaleCode,
): string {
    return getLocalizedSceneName(sceneId, fallbackRawName, localeOverride);
}



export function localizeRawSceneName(
    rawSceneName: string | null | undefined,
    fallbackRawName?: string | null,
    localeOverride?: LocaleCode,
): string {
    const fallback = fallbackRawName?.trim() || rawSceneName?.trim() || "Unknown Scene";
    const entry = findSceneEntryByRawName(rawSceneName);
    if (!entry) {
        return fallback;
    }
    return appendSceneDifficultySuffix(resolveMultiLangName(entry, fallback, localeOverride), rawSceneName);
}

export function hasSceneTranslation(sceneId: number | string | null | undefined): boolean {
    const normalized = normalizeSceneId(sceneId);
    return normalized ? Boolean(SCENE_NAME_TRANSLATIONS[normalized]) : false;
}

void initializeSceneNameRuntimeData();
