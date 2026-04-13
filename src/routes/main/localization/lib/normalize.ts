import type { LocaleCode } from "$lib/i18n";

import type {
    GenericTranslationTable,
    SkillTranslationTable,
    TranslationFileKind,
    TranslationWorkspaceRow,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
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

function buildSearchBlob(parts: Array<string | undefined>): string {
    return parts
        .map((value) => (value ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");
}

function sortRows(rows: TranslationWorkspaceRow[]): TranslationWorkspaceRow[] {
    return [...rows].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function normalizeSkillnamesRows(
    rawJson: unknown,
    locale: LocaleCode,
): TranslationWorkspaceRow[] {
    if (!isRecord(rawJson)) {
        return [];
    }

    const table = rawJson as SkillTranslationTable;
    const rows: TranslationWorkspaceRow[] = [];

    for (const [id, entry] of Object.entries(table)) {
        if (!isRecord(entry)) {
            continue;
        }

        const nameValue = isRecord(entry["name"]) ? entry["name"] : undefined;
        const noteValue = isRecord(entry["note"]) ? entry["note"] : undefined;

        const baseName = resolveLocalizedValue(nameValue, "zh-CN");
        const baseNote = resolveLocalizedValue(noteValue, "zh-CN");
        const localName = resolveLocalizedValue(nameValue, locale);
        const localNote = resolveLocalizedValue(noteValue, locale);

        rows.push({
            id,
            baseName,
            baseNote,
            baseOverlayAlias: "",
            localName,
            localNote,
            localOverlayAlias: "",
            searchBlob: buildSearchBlob([id, baseName, baseNote, localName, localNote]),
            raw: entry,
        });
    }

    return sortRows(rows);
}

function normalizeBuffNameRows(
    rawJson: unknown,
    locale: LocaleCode,
): TranslationWorkspaceRow[] {
    if (!isRecord(rawJson)) {
        return [];
    }

    const table = rawJson as Record<string, Record<string, unknown>>;
    const rows: TranslationWorkspaceRow[] = [];

    for (const [id, entry] of Object.entries(table)) {
        if (!isRecord(entry)) {
            continue;
        }

        const nameValue = isRecord(entry["NameDesign"]) ? entry["NameDesign"] : undefined;
        const baseName = resolveLocalizedValue(nameValue, "zh-CN");
        const localName = resolveLocalizedValue(nameValue, locale);

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

function normalizeSearchTableRows(
    rawJson: unknown,
    locale: LocaleCode,
): TranslationWorkspaceRow[] {
    if (!isRecord(rawJson)) {
        return [];
    }

    const table = rawJson as Record<string, Record<string, unknown>>;
    const rows: TranslationWorkspaceRow[] = [];

    for (const [id, entry] of Object.entries(table)) {
        if (!isRecord(entry)) {
            continue;
        }

        const nameValue = isRecord(entry["name"]) ? entry["name"] : undefined;
        const noteValue = isRecord(entry["notes"])
            ? entry["notes"]
            : isRecord(entry["note"])
                ? entry["note"]
                : undefined;
        const overlayAliasValue = isRecord(entry["overlayAlias"])
            ? entry["overlayAlias"]
            : undefined;

        const baseName = resolveLocalizedValue(nameValue, "zh-CN");
        const baseNote = resolveLocalizedValue(noteValue, "zh-CN");
        const baseOverlayAlias = resolveLocalizedValue(overlayAliasValue, "zh-CN");
        const localName = resolveLocalizedValue(nameValue, locale);
        const localNote = resolveLocalizedValue(noteValue, locale);
        const localOverlayAlias = resolveLocalizedValue(overlayAliasValue, locale);

        rows.push({
            id,
            baseName,
            baseNote,
            baseOverlayAlias,
            localName,
            localNote,
            localOverlayAlias,
            searchBlob: buildSearchBlob([
                id,
                baseName,
                baseNote,
                baseOverlayAlias,
                localName,
                localNote,
                localOverlayAlias,
            ]),
            raw: entry,
        });
    }

    return sortRows(rows);
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
        case "skillnames":
            return normalizeSkillnamesRows(rawJson, locale);

        case "buffname":
            return normalizeBuffNameRows(rawJson, locale);

        case "searchtable":
            return normalizeSearchTableRows(rawJson, locale);

        case "navigation":
        case "generic":
        default:
            return normalizeGenericRows(rawJson, locale);
    }
}
