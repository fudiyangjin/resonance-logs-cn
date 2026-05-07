import type { LocaleCode } from "$lib/i18n";

import type {
    GenericTranslationTable,
    TranslationFileKind,
    TranslationWorkspaceRow,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return normalizeText(value);
}

function resolveLocalizedValue(
    value: Record<string, unknown> | undefined,
    locale: LocaleCode,
): string {
    if (!value) {
        return "";
    }

    const selected = normalizeText(value[locale]);
    if (selected) {
        return selected;
    }

    const zhCn = normalizeText(value["zh-CN"]);
    if (zhCn) {
        return zhCn;
    }

    return "";
}

function resolveGeneratedLocalizedValue(
    value: Record<string, unknown> | undefined,
    locale: LocaleCode,
): string {
    if (!value) {
        return "";
    }

    return resolveLocalizedValue(value, locale)
        || normalizeText(value["en"])
        || normalizeText(value["design"])
        || normalizeText(value["und"]);
}

function buildSearchBlob(parts: Array<string | undefined>): string {
    return parts
        .map((value) => (value ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");
}

function normalizeGeneratedEntry(
    id: string,
    entry: Record<string, unknown>,
    locale: LocaleCode,
): TranslationWorkspaceRow {
    const names = isRecord(entry["Names"])
        ? entry["Names"]
        : isRecord(entry["NameDesign"])
            ? entry["NameDesign"]
            : isRecord(entry["name"])
                ? entry["name"]
                : isRecord(entry)
                    && ["en", "zh-CN", "zh-TW", "ja", "ko-KR", "fr", "de", "es", "pt-BR", "th", "id"].some((key) => typeof entry[key] === "string")
                        ? entry
                        : undefined;
    const notes = isRecord(entry["Notes"])
        ? entry["Notes"]
        : isRecord(entry["Note"])
            ? entry["Note"]
            : isRecord(entry["note"])
                ? entry["note"]
                : undefined;
    const baseName = resolveGeneratedLocalizedValue(names, "zh-CN")
        || normalizeText(entry["Name"])
        || normalizeText(entry["NameDesign"])
        || normalizeText(entry["RecountName"])
        || normalizeText(entry["DamageName"])
        || normalizeText(entry["name"]);
    const localName = resolveGeneratedLocalizedValue(names, locale)
        || normalizeText(entry["Name"])
        || normalizeText(entry["NameDesign"])
        || normalizeText(entry["RecountName"])
        || normalizeText(entry["DamageName"])
        || normalizeText(entry["name"]);
    const baseNote = resolveGeneratedLocalizedValue(notes, "zh-CN");
    const userNote = normalizeText(entry["UserNote"]);
    const localNote = userNote || resolveGeneratedLocalizedValue(notes, locale);

    return {
        id,
        baseName,
        baseNote,
        localName,
        localNote,
        localOverlayAlias: "",
        baseOverlayAlias: "",
        searchBlob: buildSearchBlob([
            id,
            baseName,
            localName,
            normalizeText(entry["Name"]),
            normalizeText(entry["NameDesign"]),
            normalizeText(entry["RecountName"]),
            normalizeText(entry["DamageName"]),
            baseNote,
            localNote,
        ]),
        raw: entry,
    };
}

function normalizeGeneratedRows(
    rawJson: unknown,
    locale: LocaleCode,
): TranslationWorkspaceRow[] {
    const rows: TranslationWorkspaceRow[] = [];

    if (Array.isArray(rawJson)) {
        for (const entry of rawJson) {
            if (!isRecord(entry)) {
                continue;
            }
            const id = normalizeId(entry["Id"]) || normalizeId(entry["id"]);
            if (!id) {
                continue;
            }
            rows.push(normalizeGeneratedEntry(id, entry, locale));
        }
        return sortRows(rows);
    }

    if (!isRecord(rawJson)) {
        return [];
    }

    for (const [id, entry] of Object.entries(rawJson)) {
        if (!isRecord(entry)) {
            continue;
        }

        rows.push(normalizeGeneratedEntry(id, entry, locale));
    }

    return sortRows(rows);
}

function sortRows(rows: TranslationWorkspaceRow[]): TranslationWorkspaceRow[] {
    return [...rows].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function normalizeGenericRows(
    rawJson: unknown,
    locale: LocaleCode,
): TranslationWorkspaceRow[] {
    if (!isRecord(rawJson)) {
        return [];
    }

    const table = rawJson as GenericTranslationTable;
    const rows: TranslationWorkspaceRow[] = [];

    for (const [id, entry] of Object.entries(table)) {
        if (!isRecord(entry)) {
            continue;
        }

        const baseName = resolveLocalizedValue(entry, "zh-CN");
        const localName = resolveLocalizedValue(entry, locale);

        rows.push({
            id,
            baseName,
            baseNote: "",
            baseOverlayAlias: "",
            localName,
            localNote: "",
            localOverlayAlias: "",
            searchBlob: buildSearchBlob([id, baseName, localName]),
            raw: entry,
        });
    }

    return sortRows(rows);
}

export function normalizeTranslationRows(
    rawJson: unknown,
    fileKind: TranslationFileKind,
    locale: LocaleCode,
): TranslationWorkspaceRow[] {
    switch (fileKind) {
        case "generated":
            return normalizeGeneratedRows(rawJson, locale);
        case "navigation":
        case "generic":
        default:
            return normalizeGenericRows(rawJson, locale);
    }
}
