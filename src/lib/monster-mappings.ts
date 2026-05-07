import monsterNamesData from "$parserData/generated/monsternames.json";
import {
    DEFAULT_LOCALE,
    PRIMARY_FALLBACK_LOCALE,
    SUPPORTED_LOCALES,
    isLocaleCode,
    type LocaleCode,
} from "$lib/i18n";
import { settings } from "$lib/settings-store";

type MultiLangValue = Partial<Record<LocaleCode, string>>;

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

function buildGeneratedMonsterTranslations(source: unknown): Record<string, MultiLangValue> {
    const out: Record<string, MultiLangValue> = {};
    if (!isRecord(source)) return out;

    for (const [id, value] of Object.entries(source)) {
        const entry = isRecord(value) ? value : { Name: value };
        const names: MultiLangValue = {};
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

const MONSTER_NAME_TRANSLATIONS: Record<string, MultiLangValue> = cloneJson(
    buildGeneratedMonsterTranslations(monsterNamesData),
);

export async function initializeMonsterRuntimeData(): Promise<void> {
    return;
}

export async function reloadMonsterRuntimeData(): Promise<void> {
    return;
}

function normalizeText(value: string | null | undefined): string {
    return value?.trim() ?? "";
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
    localeOverride?: LocaleCode,
): string {
    const id = String(monsterId);
    const entry = MONSTER_NAME_TRANSLATIONS[id];

    return resolveMultiLangName(
        entry,
        normalizeText(fallbackRawName) || `Unknown Monster ${id}`,
        localeOverride,
    );
}

export function localizeMonsterName(
    monsterId: string | number,
    fallbackRawName?: string | null,
    localeOverride?: LocaleCode,
): string {
    return getLocalizedMonsterName(monsterId, fallbackRawName, localeOverride);
}

export function localizeRawMonsterName(
    rawMonsterName: string | null | undefined,
    fallback?: string | null,
    localeOverride?: LocaleCode,
): string {
    const normalizedRawName = normalizeText(rawMonsterName);
    const compositeParts = splitCompositeMonsterNames(normalizedRawName);

    if (compositeParts.length > 1) {
        return compositeParts
            .map((part) => localizeRawMonsterName(part, part, localeOverride))
            .filter(Boolean)
            .join(", ");
    }

    const matchedId = findMonsterIdByRawName(normalizedRawName);
    if (matchedId) {
        return getLocalizedMonsterName(
            matchedId,
            normalizeMonsterLookupName(normalizedRawName) || normalizedRawName,
            localeOverride,
        );
    }

    return normalizeMonsterLookupName(normalizedRawName)
        || normalizedRawName
        || normalizeText(fallback)
        || "Unknown Monster";
}

void initializeMonsterRuntimeData();
