import type { LocaleCode } from "$lib/i18n";

export type LocalizationSection = "editLocal" | "compareMerge" | "settings";

export type TranslationFileKind =
    | "skillnames"
    | "navigation"
    | "generic";

export type TranslationFileTab = {
    relativePath: string;
    fileName: string;
    folderPath: string;
    displayName: string;
    kind: TranslationFileKind;
    sortKey: string;
};

export type TranslationFieldStatus =
    | "same"
    | "different"
    | "missing-local"
    | "missing-compare"
    | "empty-both";

export type TranslationCompareSelection = {
    rowSelected: boolean;
    nameSelected: boolean;
    noteSelected: boolean;
};

export type TranslationWorkspaceRow = {
    id: string;
    baseName: string;
    baseNote: string;
    localName: string;
    localNote: string;
    compareName?: string;
    compareNote?: string;
    nameStatus?: TranslationFieldStatus;
    noteStatus?: TranslationFieldStatus;
    selection?: TranslationCompareSelection;
    searchBlob: string;
    raw?: unknown;
};

export type TranslationSearchResult = {
    query: string;
    rows: TranslationWorkspaceRow[];
};

export type TranslationSearchContext = {
    locale: LocaleCode;
    relativePath: string;
    fileKind: TranslationFileKind;
};

export type GenericTranslationValue = Partial<Record<LocaleCode, string>>;

export type GenericTranslationTable = Record<string, GenericTranslationValue>;

export type SkillTranslationEntry = {
    name?: GenericTranslationValue;
    note?: GenericTranslationValue;
};

export type SkillTranslationTable = Record<string, SkillTranslationEntry>;