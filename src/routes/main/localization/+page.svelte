<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import {
    resolveLocalizationTranslation,
    uiT,
    type LocaleCode,
  } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import LanguagesIcon from "virtual:icons/lucide/languages";

  import { discoverTranslationFileTabs } from "./lib/file-discovery";
  import {
    readTranslationRuntimeJson,
    writeTranslationRuntimeJson,
    writeTranslationRuntimeLocalePatch,
  } from "./lib/file-io";
  import { normalizeTranslationRows } from "./lib/normalize";
  import { filterTranslationRows } from "./lib/search";
  import type {
    LocalizationSection,
    TranslationCompareSelection,
    TranslationFieldStatus,
    TranslationFileTab,
    TranslationWorkspaceRow,
  } from "./lib/types";

  const SHOW_UI_JSON_TABS_STORAGE_KEY = "resonance.localization.showUiJsonTabs";
const SHOW_LEGACY_TRANSLATION_DEBUG_SETTINGS = false;
  const ROWS_PAGE_SIZE = 250;

  type LocalePatchEntry = Record<string, string>;
  type LocalePatchPayload = Record<string, LocalePatchEntry>;

  function readStoredBoolean(key: string, fallback: boolean): boolean {
    if (typeof window === "undefined") {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "1" || raw === "true") return true;
      if (raw === "0" || raw === "false") return false;
    } catch (error) {
      console.warn(`[localization] Failed to read setting ${key}:`, error);
    }

    return fallback;
  }

  let activeSection = $state<LocalizationSection>("editLocal");

  let editLocalTabs = $state<TranslationFileTab[]>([]);
  let compareMergeTabs = $state<TranslationFileTab[]>([]);

  let activeEditLocalTab = $state<string | null>(null);
  let activeCompareMergeTab = $state<string | null>(null);

  let searchQuery = $state("");
  let editShowAllRows = $state(false);
  let compareShowAllRows = $state(false);
  let compareDifferencesOnly = $state(true);

  let isLoadingTabs = $state(true);

  let isLoadingRows = $state(false);
  let isSaving = $state(false);

  let editLocalError = $state("");
  let editLocalSaveMessage = $state("");
  let editLocalRawJson = $state<unknown>(null);
  let editLocalRows = $state<TranslationWorkspaceRow[]>([]);
  let lastLoadedEditLocalPath = $state<string | null>(null);
  let hasUnsavedChanges = $state(false);
  let editLocalVisibleLimit = $state(ROWS_PAGE_SIZE);
  let lastEditLocalListKey = $state("");
  const editDirtyRowIds = new Set<string>();

  let isLoadingCompareRows = $state(false);
  let isSavingCompare = $state(false);

  let compareError = $state("");
  let compareSaveMessage = $state("");
  let compareImportedFileName = $state("");

  let compareLocalRawJson = $state<unknown>(null);
  let compareLocalRows = $state<TranslationWorkspaceRow[]>([]);
  let compareImportedRawJson = $state<unknown>(null);
  let compareImportedRows = $state<TranslationWorkspaceRow[]>([]);
  let compareRows = $state<TranslationWorkspaceRow[]>([]);
  let compareHasUnsavedChanges = $state(false);
  let lastLoadedCompareLocalPath = $state<string | null>(null);
  let compareVisibleLimit = $state(ROWS_PAGE_SIZE);
  let lastCompareListKey = $state("");
  const compareDirtyRowIds = new Set<string>();

  let compareFileInput = $state<HTMLInputElement | null>(null);

  let isRepairingRuntimeLocaleFolder = $state(false);
  let isOpeningTranslationDir = $state(false);
  let isGeneratingAllUiTranslations = $state(false);
  let showTranslationGenerateInfo = $state(false);
  let showUiJsonTabs = $state(readStoredBoolean(SHOW_UI_JSON_TABS_STORAGE_KEY, false));
  let showGeneralSettings = $state(true);
  let showTranslationDebugSettings = $state(true);

  type TranslationRuntimeStatus = {
    runtimeDir: string;
    runtimeExists: boolean;
    runtimeManifestExists: boolean;
    sourceDir: string | null;
    sourceExists: boolean;
    sourceManifestExists: boolean;
    sourceCandidates: string[];
    sourceError: string | null;
  };

  let translationRuntimeStatus = $state<TranslationRuntimeStatus | null>(null);
  let isLoadingTranslationRuntimeStatus = $state(false);

  $effect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        SHOW_UI_JSON_TABS_STORAGE_KEY,
        showUiJsonTabs ? "1" : "0",
      );
    } catch (error) {
      console.warn("[localization] Failed to persist UI/Search tab visibility:", error);
    }
  });

  const filteredEditLocalRows = $derived(
    filterTranslationRows(editLocalRows, searchQuery, editShowAllRows),
  );
  const visibleEditLocalRows = $derived(
    filteredEditLocalRows.slice(0, editLocalVisibleLimit),
  );
  const hiddenEditLocalRowCount = $derived(
    Math.max(0, filteredEditLocalRows.length - visibleEditLocalRows.length),
  );

  const filteredCompareRows = $derived.by(() => {
    let rows = compareRows;

    if (compareDifferencesOnly) {
      rows = rows.filter((row) => isCompareRowDifferent(row));
    }

    return filterTranslationRows(rows, searchQuery, compareShowAllRows);
  });
  const visibleCompareRows = $derived(
    filteredCompareRows.slice(0, compareVisibleLimit),
  );
  const hiddenCompareRowCount = $derived(
    Math.max(0, filteredCompareRows.length - visibleCompareRows.length),
  );

  const editLocalShowsOverlayAliasColumn = $derived(false);

  const selectedCompareFieldCount = $derived.by(() =>
    compareRows.reduce((count, row) => {
      let nextCount = count;
      if (row.selection?.nameSelected) nextCount += 1;
      return nextCount;
    }, 0),
  );

  function getTabLabel(tab: TranslationFileTab) {
    return tab.displayName;
  }

  function splitTabsByCategory(tabs: TranslationFileTab[]) {
    const parserTabs: TranslationFileTab[] = [];
    const uiTabs: TranslationFileTab[] = [];
    const searchTabs: TranslationFileTab[] = [];

    for (const tab of tabs) {
      if (tab.relativePath.startsWith("generated/")) {
        parserTabs.push(tab);
      } else {
        uiTabs.push(tab);
      }
    }

    return { parserTabs, uiTabs, searchTabs };
  }

  const editLocalTabGroups = $derived(splitTabsByCategory(editLocalTabs));
  const compareMergeTabGroups = $derived(splitTabsByCategory(compareMergeTabs));

  function getLocale(): LocaleCode {
    return SETTINGS.live.general.state.language as LocaleCode;
  }

  function t(key: string, fallback: string) {
    return resolveLocalizationTranslation(key, getLocale(), fallback);
  }

  function currentInputValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement).value;
  }

  function currentSelectValue(event: Event): string {
    return (event.currentTarget as HTMLSelectElement).value;
  }

  function currentTextareaValue(event: Event): string {
    return (event.currentTarget as HTMLTextAreaElement).value;
  }

  function currentChecked(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  const tn = uiT("localization-tool", () => getLocale());

  const sections: { id: LocalizationSection; key: string; fallback: string }[] = [
    {
      id: "editLocal",
      key: "sections.editLocal",
      fallback: "Edit Local",
    },
    {
      id: "compareMerge",
      key: "sections.compareMerge",
      fallback: "Compare / Merge",
    },
    {
      id: "settings",
      key: "sections.settings",
      fallback: "Settings",
    },
  ];

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function hasOwnKey(object: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function getDirectLocaleValue(value: unknown, locale: LocaleCode): string {
    if (!isRecord(value)) {
      return "";
    }

    const localized = value[locale];
    return typeof localized === "string" ? localized.trim() : "";
  }

  function buildSearchBlob(row: TranslationWorkspaceRow): string {
    return [
      row.id,
      row.baseName,
      row.baseNote,
      row.baseOverlayAlias ?? "",
      row.localName,
      row.localOverlayAlias ?? "",
      row.localNote,
      row.compareName ?? "",
      row.compareOverlayAlias ?? "",
      row.compareNote ?? "",
    ]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .join(" ");
  }

  function hydrateEditableLocaleFields(
    rows: TranslationWorkspaceRow[],
    locale: LocaleCode,
  ): TranslationWorkspaceRow[] {
    return rows.map((row) => {
      if (!isRecord(row.raw)) {
        const nextRow = {
          ...row,
          localName: "",
          localOverlayAlias: "",
          localNote: "",
        };
        nextRow.searchBlob = buildSearchBlob(nextRow);
        return nextRow;
      }

      const raw = row.raw;
      const hasGeneratedNameShape = isRecord(raw["Names"]);
      const hasBuffNameShape = isRecord(raw["NameDesign"]);
      const hasNamedShape =
        isRecord(raw["name"]) || isRecord(raw["note"]) || isRecord(raw["notes"]);
      const hasOverlayAliasShape = isRecord(raw["overlayAlias"]) || hasOwnKey(raw, "overlayAlias");

      const localName = hasGeneratedNameShape
        ? getDirectLocaleValue(raw["Names"], locale) || row.localName
        : hasBuffNameShape
        ? getDirectLocaleValue(raw["NameDesign"], locale)
        : hasNamedShape
          ? getDirectLocaleValue(raw["name"], locale)
          : getDirectLocaleValue(raw, locale);

      const localOverlayAlias = hasOverlayAliasShape
        ? getDirectLocaleValue(raw["overlayAlias"], locale)
        : "";

      const localNote = hasGeneratedNameShape
        ? (typeof raw["UserNote"] === "string" ? raw["UserNote"].trim() : "")
          || getDirectLocaleValue(raw["Notes"], locale)
          || getDirectLocaleValue(raw["Note"], locale)
          || getDirectLocaleValue(raw["note"], locale)
          || row.localNote
        : hasBuffNameShape
        ? ""
        : hasNamedShape
          ? getDirectLocaleValue(raw["notes"], locale) || getDirectLocaleValue(raw["note"], locale)
          : "";

      const nextRow: TranslationWorkspaceRow = {
        ...row,
        localName,
        localOverlayAlias,
        localNote,
      };

      nextRow.searchBlob = buildSearchBlob(nextRow);
      return nextRow;
    });
  }

  function applyLocaleValuesToEntry(
    entry: Record<string, unknown>,
    row: TranslationWorkspaceRow,
    locale: LocaleCode,
  ): Record<string, unknown> {
    const nextEntry = cloneJson(entry) as Record<string, unknown>;

    if (isRecord(nextEntry["Names"])) {
      const nextName = { ...(nextEntry["Names"] as Record<string, unknown>) };

      if (hasOwnKey(nextName, locale) || row.localName !== "") {
        nextName[locale] = row.localName;
      }

      nextEntry["Names"] = nextName;

      if (row.localNote !== "" || hasOwnKey(nextEntry, "UserNote")) {
        nextEntry["UserNote"] = row.localNote;
      }

      return nextEntry;
    }

    if (isRecord(nextEntry["NameDesign"])) {
      const nextName = { ...(nextEntry["NameDesign"] as Record<string, unknown>) };

      if (hasOwnKey(nextName, locale) || row.localName !== "") {
        nextName[locale] = row.localName;
      }

      nextEntry["NameDesign"] = nextName;
      return nextEntry;
    }

    const hasNamedShape =
      isRecord(nextEntry["name"]) || isRecord(nextEntry["note"]) || isRecord(nextEntry["notes"]);

    if (hasNamedShape) {
      const nextName = isRecord(nextEntry["name"])
        ? { ...(nextEntry["name"] as Record<string, unknown>) }
        : {};

      if (hasOwnKey(nextName, locale) || row.localName !== "") {
        nextName[locale] = row.localName;
      }

      nextEntry["name"] = nextName;

      const hasOverlayAliasShape = isRecord(nextEntry["overlayAlias"]) || hasOwnKey(nextEntry, "overlayAlias");
      const nextOverlayAlias = isRecord(nextEntry["overlayAlias"])
        ? { ...(nextEntry["overlayAlias"] as Record<string, unknown>) }
        : {};

      if (hasOwnKey(nextOverlayAlias, locale) || (row.localOverlayAlias ?? "") !== "") {
        nextOverlayAlias[locale] = row.localOverlayAlias ?? "";
      }

      if (hasOverlayAliasShape || (row.localOverlayAlias ?? "") !== "") {
        nextEntry["overlayAlias"] = nextOverlayAlias;
      }

      const noteKey = isRecord(nextEntry["notes"]) || hasOwnKey(nextEntry, "notes")
        ? "notes"
        : "note";
      const hadNoteObject = isRecord(nextEntry[noteKey]);
      const nextNote = hadNoteObject
        ? { ...(nextEntry[noteKey] as Record<string, unknown>) }
        : {};

      if (hasOwnKey(nextNote, locale) || row.localNote !== "") {
        nextNote[locale] = row.localNote;
      }

      if (hadNoteObject || row.localNote !== "") {
        nextEntry[noteKey] = nextNote;
      }

      return nextEntry;
    }

    if (hasOwnKey(nextEntry, locale) || row.localName !== "") {
      nextEntry[locale] = row.localName;
    }

    return nextEntry;
  }

  function rowNeedsSave(
    rawEntry: Record<string, unknown>,
    row: TranslationWorkspaceRow,
    locale: LocaleCode,
  ): boolean {
    const hasGeneratedNameShape = isRecord(rawEntry["Names"]);
    const hasBuffNameShape = isRecord(rawEntry["NameDesign"]);
    const hasNamedShape =
      isRecord(rawEntry["name"]) || isRecord(rawEntry["note"]) || isRecord(rawEntry["notes"]);
    const hasOverlayAliasShape = isRecord(rawEntry["overlayAlias"]) || hasOwnKey(rawEntry, "overlayAlias");

    const currentLocalName = hasGeneratedNameShape
      ? getDirectLocaleValue(rawEntry["Names"], locale)
      : hasBuffNameShape
      ? getDirectLocaleValue(rawEntry["NameDesign"], locale)
      : hasNamedShape
        ? getDirectLocaleValue(rawEntry["name"], locale)
        : getDirectLocaleValue(rawEntry, locale);

    const currentLocalOverlayAlias = hasOverlayAliasShape
      ? getDirectLocaleValue(rawEntry["overlayAlias"], locale)
      : "";

    const currentLocalNote = hasGeneratedNameShape
      ? (typeof rawEntry["UserNote"] === "string" ? rawEntry["UserNote"].trim() : "")
        || getDirectLocaleValue(rawEntry["Notes"], locale)
        || getDirectLocaleValue(rawEntry["Note"], locale)
        || getDirectLocaleValue(rawEntry["note"], locale)
      : hasBuffNameShape
      ? ""
      : hasNamedShape
        ? getDirectLocaleValue(rawEntry["notes"], locale) || getDirectLocaleValue(rawEntry["note"], locale)
        : "";

    return currentLocalName !== row.localName
      || currentLocalOverlayAlias !== (row.localOverlayAlias ?? "")
      || currentLocalNote !== row.localNote;
  }

  function toLocalePatchEntry(row: TranslationWorkspaceRow): LocalePatchEntry {
    return {
      value: row.localName,
    };
  }

  function getRawRootEntry(rawJson: unknown, id: string): Record<string, unknown> | null {
    if (Array.isArray(rawJson)) {
      const entry = rawJson.find((candidate) =>
        isRecord(candidate) && String(candidate["Id"] ?? candidate["id"] ?? "") === id
      );
      return isRecord(entry) ? entry : null;
    }

    if (!isRecord(rawJson)) {
      return null;
    }

    const entry = rawJson[id];
    return isRecord(entry) ? entry : null;
  }

  function buildLocalePatchPayload(
    rawJson: unknown,
    rows: TranslationWorkspaceRow[],
    dirtyIds: Set<string>,
    locale: LocaleCode,
  ): {
    patch: LocalePatchPayload;
    changedRows: TranslationWorkspaceRow[];
  } {
    const patch: LocalePatchPayload = {};
    const changedRows: TranslationWorkspaceRow[] = [];

    for (const row of rows) {
      if (!dirtyIds.has(row.id)) {
        continue;
      }

      const rawEntry = getRawRootEntry(rawJson, row.id) ?? (isRecord(row.raw) ? row.raw : null);
      if (rawEntry && !rowNeedsSave(rawEntry, row, locale)) {
        continue;
      }

      patch[row.id] = toLocalePatchEntry(row);
      changedRows.push(row);
    }

    return { patch, changedRows };
  }

  function applyRowsToRawJson(
    rawJson: unknown,
    rows: TranslationWorkspaceRow[],
    locale: LocaleCode,
  ): unknown {
    if (Array.isArray(rawJson)) {
      return rawJson.map((entry) => {
        if (!isRecord(entry)) {
          return entry;
        }
        const id = String(entry["Id"] ?? entry["id"] ?? "");
        const row = rows.find((candidate) => candidate.id === id);
        return row ? applyLocaleValuesToEntry(entry, row, locale) : entry;
      });
    }

    if (!isRecord(rawJson)) {
      return rawJson;
    }

    const nextRoot = { ...(rawJson as Record<string, unknown>) };

    for (const row of rows) {
      const rawEntry = getRawRootEntry(rawJson, row.id) ?? (isRecord(row.raw) ? row.raw : null);
      if (!rawEntry) {
        continue;
      }

      nextRoot[row.id] = applyLocaleValuesToEntry(rawEntry, row, locale);
    }

    return nextRoot;
  }

  function getActiveTab(tabs: TranslationFileTab[], activePath: string | null) {
    if (!activePath) return null;
    return tabs.find((tab) => tab.relativePath === activePath) ?? null;
  }

  function getFieldStatus(
    localValue: string,
    compareValue: string,
  ): TranslationFieldStatus {
    const local = localValue.trim();
    const compare = compareValue.trim();

    if (!local && !compare) return "empty-both";
    if (local === compare) return "same";
    if (!local && compare) return "missing-local";
    if (local && !compare) return "missing-compare";
    return "different";
  }

  function isMergeableField(
    status: TranslationFieldStatus | undefined,
    compareValue: string,
  ): boolean {
    if (!status) return false;
    if (status === "same" || status === "empty-both") return false;
    return compareValue.trim() !== "";
  }

  function isCompareRowDifferent(row: TranslationWorkspaceRow): boolean {
    return isMergeableField(row.nameStatus, row.compareName ?? "") ||
      isMergeableField(row.noteStatus, row.compareNote ?? "");
  }

  function sortRows(rows: TranslationWorkspaceRow[]): TranslationWorkspaceRow[] {
    return [...rows].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
  }

  function resetEditLocalRowsFromSource() {
    const activeTab = getEditLocalActiveTab();
    if (!activeTab || !editLocalRawJson) {
      editLocalRows = [];
      editDirtyRowIds.clear();
      hasUnsavedChanges = false;
      return;
    }

    const normalizedRows = normalizeTranslationRows(
      editLocalRawJson,
      activeTab.kind,
      getLocale(),
    );
    const hydratedRows = hydrateEditableLocaleFields(normalizedRows, getLocale());

    editLocalRows = hydratedRows;
    editDirtyRowIds.clear();
    hasUnsavedChanges = false;
  }

  function resetCompareLocalRowsFromSource() {
    const activeTab = getCompareMergeActiveTab();
    if (!activeTab || !compareLocalRawJson) {
      compareLocalRows = [];
      compareDirtyRowIds.clear();
      compareHasUnsavedChanges = false;
      return;
    }

    const normalizedRows = normalizeTranslationRows(
      compareLocalRawJson,
      activeTab.kind,
      getLocale(),
    );
    const hydratedRows = hydrateEditableLocaleFields(normalizedRows, getLocale());

    compareLocalRows = hydratedRows;
    compareDirtyRowIds.clear();
    compareHasUnsavedChanges = false;
  }

  function clearCompareState() {
    compareImportedRawJson = null;
    compareImportedRows = [];
    compareImportedFileName = "";
    compareRows = [];
    compareError = "";
    compareSaveMessage = "";
    compareDirtyRowIds.clear();
    compareHasUnsavedChanges = false;
  }

  function rebuildCompareRows(preserveSelections = true) {
    const previousSelections = new Map<string, TranslationCompareSelection>(
      preserveSelections
        ? compareRows.map((row) => [
            row.id,
            row.selection ?? {
              rowSelected: false,
              nameSelected: false,
              noteSelected: false,
            },
          ])
        : [],
    );

    const localMap = new Map(compareLocalRows.map((row) => [row.id, row]));
    const importedMap = new Map(compareImportedRows.map((row) => [row.id, row]));

    const ids = new Set<string>([
      ...localMap.keys(),
      ...importedMap.keys(),
    ]);

    const nextRows: TranslationWorkspaceRow[] = [];

    for (const id of ids) {
      const localRow = localMap.get(id);
      const importedRow = importedMap.get(id);

      const compareName = importedRow?.localName ?? "";
      const compareNote = importedRow?.localNote ?? "";

      const nameStatus = getFieldStatus(localRow?.localName ?? "", compareName);
      const noteStatus = getFieldStatus(localRow?.localNote ?? "", compareNote);

      const previousSelection = previousSelections.get(id);

      const nameSelectable = isMergeableField(nameStatus, compareName);
      const noteSelectable = isMergeableField(noteStatus, compareNote);

      const nameSelected = nameSelectable
        ? (previousSelection?.nameSelected ?? false)
        : false;

      const noteSelected = noteSelectable
        ? (previousSelection?.noteSelected ?? false)
        : false;

      const nextRow: TranslationWorkspaceRow = {
        id,
        baseName: localRow?.baseName ?? importedRow?.baseName ?? "",
        baseNote: localRow?.baseNote ?? importedRow?.baseNote ?? "",
        baseOverlayAlias: localRow?.baseOverlayAlias ?? importedRow?.baseOverlayAlias ?? "",
        localName: localRow?.localName ?? "",
        localOverlayAlias: localRow?.localOverlayAlias ?? "",
        localNote: localRow?.localNote ?? "",
        compareName,
        compareOverlayAlias: importedRow?.localOverlayAlias ?? "",
        compareNote,
        nameStatus,
        noteStatus,
        selection: {
          rowSelected: nameSelected || noteSelected,
          nameSelected,
          noteSelected,
        },
        searchBlob: "",
        raw: localRow?.raw ?? importedRow?.raw,
      };

      nextRow.searchBlob = buildSearchBlob(nextRow);
      nextRows.push(nextRow);
    }

    compareRows = sortRows(nextRows);
  }

  async function loadTabs() {
    isLoadingTabs = true;

    const discoveredTabs = await discoverTranslationFileTabs();

    editLocalTabs = discoveredTabs;
    compareMergeTabs = discoveredTabs;

    isLoadingTabs = false;
  }

  async function loadEditLocalFile(relativePath: string) {
    const tab = getActiveTab(editLocalTabs, relativePath);
    if (!tab) {
      editLocalRawJson = null;
      editLocalRows = [];
      editDirtyRowIds.clear();
      hasUnsavedChanges = false;
      return;
    }

    isLoadingRows = true;
    editLocalError = "";
    editLocalSaveMessage = "";

    const rawJson = await readTranslationRuntimeJson<unknown>(relativePath);

    if (rawJson === null) {
      editLocalRawJson = null;
      editLocalRows = [];
      editDirtyRowIds.clear();
      hasUnsavedChanges = false;
      editLocalError = t(
        "errors.readFailed",
        "Could not read or parse the selected translation file.",
      );
      isLoadingRows = false;
      return;
    }

    editLocalRawJson = rawJson;
    resetEditLocalRowsFromSource();

    isLoadingRows = false;
  }

  async function loadCompareLocalFile(relativePath: string) {
    const tab = getActiveTab(compareMergeTabs, relativePath);
    if (!tab) {
      compareLocalRawJson = null;
      compareLocalRows = [];
      compareDirtyRowIds.clear();
      clearCompareState();
      return;
    }

    isLoadingCompareRows = true;
    compareError = "";
    compareSaveMessage = "";

    const rawJson = await readTranslationRuntimeJson<unknown>(relativePath);

    if (rawJson === null) {
      compareLocalRawJson = null;
      compareLocalRows = [];
      compareDirtyRowIds.clear();
      clearCompareState();
      compareError = t(
        "errors.readFailed",
        "Could not read or parse the selected translation file.",
      );
      isLoadingCompareRows = false;
      return;
    }

    compareLocalRawJson = rawJson;
    resetCompareLocalRowsFromSource();
    clearCompareState();

    isLoadingCompareRows = false;
  }

  async function saveEditLocalFile() {
    const activeTab = getEditLocalActiveTab();
    if (!activeTab || !editLocalRawJson || !hasUnsavedChanges) {
      return;
    }

    isSaving = true;
    editLocalError = "";
    editLocalSaveMessage = "";

    try {
      const locale = getLocale();
      const { patch, changedRows } = buildLocalePatchPayload(
        editLocalRawJson,
        editLocalRows,
        editDirtyRowIds,
        locale,
      );

      if (changedRows.length === 0) {
        editDirtyRowIds.clear();
        hasUnsavedChanges = false;
        editLocalSaveMessage = t(
          "messages.saved",
          "Saved.",
        );
        return;
      }

      const result = activeTab.kind === "generated"
        ? await writeTranslationRuntimeJson(
            activeTab.relativePath,
            applyRowsToRawJson(editLocalRawJson, changedRows, locale),
          )
        : await writeTranslationRuntimeLocalePatch(
            activeTab.relativePath,
            locale,
            patch,
          );

      if (!result.ok) {
        editLocalError = result.error || t(
          "errors.saveFailed",
          "Failed to save the selected translation file.",
        );
        return;
      }

      editLocalRawJson = applyRowsToRawJson(editLocalRawJson, changedRows, locale);
      editDirtyRowIds.clear();
      hasUnsavedChanges = false;
      editLocalSaveMessage = t(
        "messages.saved",
        "Saved.",
      );
    } catch (error) {
      console.warn("[localization] Failed to save translation file:", error);
      editLocalError = error instanceof Error
        ? error.message
        : t(
            "errors.saveFailed",
            "Failed to save the selected translation file.",
          );
    } finally {
      isSaving = false;
    }
  }

  async function saveCompareMergedFile() {
    const activeTab = getCompareMergeActiveTab();
    if (!activeTab || !compareLocalRawJson || !compareHasUnsavedChanges) {
      return;
    }

    isSavingCompare = true;
    compareError = "";
    compareSaveMessage = "";

    try {
      const locale = getLocale();
      const { patch, changedRows } = buildLocalePatchPayload(
        compareLocalRawJson,
        compareLocalRows,
        compareDirtyRowIds,
        locale,
      );

      if (changedRows.length === 0) {
        compareDirtyRowIds.clear();
        compareHasUnsavedChanges = false;
        rebuildCompareRows(false);
        compareSaveMessage = t(
          "messages.saved",
          "Saved.",
        );
        return;
      }

      const result = activeTab.kind === "generated"
        ? await writeTranslationRuntimeJson(
            activeTab.relativePath,
            applyRowsToRawJson(compareLocalRawJson, changedRows, locale),
          )
        : await writeTranslationRuntimeLocalePatch(
            activeTab.relativePath,
            locale,
            patch,
          );

      if (!result.ok) {
        compareError = result.error || t(
          "errors.saveFailed",
          "Failed to save the selected translation file.",
        );
        return;
      }

      compareLocalRawJson = applyRowsToRawJson(compareLocalRawJson, changedRows, locale);
      compareDirtyRowIds.clear();
      compareHasUnsavedChanges = false;
      rebuildCompareRows(false);
      compareSaveMessage = t(
        "messages.saved",
        "Saved.",
      );
    } catch (error) {
      console.warn("[localization] Failed to save merged translation file:", error);
      compareError = error instanceof Error
        ? error.message
        : t(
            "errors.saveFailed",
            "Failed to save the selected translation file.",
          );
    } finally {
      isSavingCompare = false;
    }
  }

  function cancelEditLocalEdits() {
    editLocalError = "";
    editLocalSaveMessage = "";
    editDirtyRowIds.clear();
    resetEditLocalRowsFromSource();
  }

  function cancelCompareMergedEdits() {
    compareError = "";
    compareSaveMessage = "";
    compareDirtyRowIds.clear();
    resetCompareLocalRowsFromSource();
    rebuildCompareRows(false);
  }

  function toggleEditViewAll() {
    editShowAllRows = !editShowAllRows;
    editLocalVisibleLimit = ROWS_PAGE_SIZE;
  }

  function toggleCompareViewAll() {
    compareShowAllRows = !compareShowAllRows;
    compareVisibleLimit = ROWS_PAGE_SIZE;
  }

  function showMoreEditRows() {
    editLocalVisibleLimit += ROWS_PAGE_SIZE;
  }

  function showMoreCompareRows() {
    compareVisibleLimit += ROWS_PAGE_SIZE;
  }

  function updateRowField(
    rowId: string,
    field: "localName" | "localOverlayAlias" | "localNote",
    value: string,
  ) {
    editLocalSaveMessage = "";

    const row = editLocalRows.find((candidate) => candidate.id === rowId);
    if (!row) {
      return;
    }

    if (field === "localName") {
      if (row.localName === value) return;
      row.localName = value;
    } else if (field === "localOverlayAlias") {
      if ((row.localOverlayAlias ?? "") === value) return;
      row.localOverlayAlias = value;
    } else {
      if (row.localNote === value) return;
      row.localNote = value;
    }

    row.searchBlob = buildSearchBlob(row);
    editDirtyRowIds.add(rowId);
    hasUnsavedChanges = true;
  }

  function openCompareFilePicker() {
    compareFileInput?.click();
  }

  async function handleCompareFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const activeTab = getCompareMergeActiveTab();
    if (!activeTab) {
      compareError = t(
        "compare.noLocalFile",
        "Please select a local translation file tab first.",
      );
      input.value = "";
      return;
    }

    compareError = "";
    compareSaveMessage = "";

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as unknown;

      const normalizedRows = normalizeTranslationRows(
        parsed,
        activeTab.kind,
        getLocale(),
      );
      const hydratedRows = hydrateEditableLocaleFields(normalizedRows, getLocale());

      compareImportedRawJson = parsed;
      compareImportedRows = hydratedRows;
      compareImportedFileName = file.name;
      compareHasUnsavedChanges = false;

      rebuildCompareRows(false);
    } catch (error) {
      console.warn("[localization] Failed to load compare JSON:", error);
      clearCompareState();
      compareError = t(
        "compare.invalidJson",
        "Could not read or parse the compare JSON file.",
      );
    } finally {
      input.value = "";
    }
  }

  function clearCompareFile() {
    clearCompareState();
  }

  function toggleCompareFieldSelection(
    rowId: string,
    field: "nameSelected" | "noteSelected",
    checked: boolean,
  ) {
    const row = compareRows.find((candidate) => candidate.id === rowId);
    if (!row) {
      return;
    }

    const nextSelection: TranslationCompareSelection = {
      rowSelected: false,
      nameSelected: row.selection?.nameSelected ?? false,
      noteSelected: row.selection?.noteSelected ?? false,
    };

    nextSelection[field] = checked;
    nextSelection.noteSelected = false;
    nextSelection.rowSelected = nextSelection.nameSelected;
    row.selection = nextSelection;
  }

  function toggleCompareRowSelection(rowId: string, checked: boolean) {
    const row = compareRows.find((candidate) => candidate.id === rowId);
    if (!row) {
      return;
    }

    const nameSelectable = isMergeableField(
      row.nameStatus,
      row.compareName ?? "",
    );
    row.selection = {
      rowSelected: checked && nameSelectable,
      nameSelected: checked ? nameSelectable : false,
      noteSelected: false,
    };
  }

  function applySelectedCompareChanges() {
    if (selectedCompareFieldCount === 0) {
      return;
    }

    const localMap = new Map(compareLocalRows.map((row) => [row.id, row]));
    const importedMap = new Map(compareImportedRows.map((row) => [row.id, row]));

    for (const compareRow of compareRows) {
      const selection = compareRow.selection;
      if (!selection?.nameSelected) {
        continue;
      }

      const localRow = localMap.get(compareRow.id);
      const importedRow = importedMap.get(compareRow.id);

      if (!importedRow) {
        continue;
      }

      const nextRow: TranslationWorkspaceRow = localRow
        ? { ...localRow }
        : {
            id: importedRow.id,
            baseName: importedRow.baseName,
            baseNote: importedRow.baseNote,
            baseOverlayAlias: importedRow.baseOverlayAlias ?? "",
            localName: "",
            localOverlayAlias: "",
            localNote: "",
            searchBlob: "",
            raw: importedRow.raw,
          };

      if (selection.nameSelected) {
        nextRow.localName = importedRow.localName;
      }


      nextRow.searchBlob = buildSearchBlob(nextRow);
      localMap.set(compareRow.id, nextRow);
      compareDirtyRowIds.add(compareRow.id);
    }

    compareLocalRows = sortRows(Array.from(localMap.values()));
    compareHasUnsavedChanges = true;
    compareSaveMessage = "";
    rebuildCompareRows(false);
  }

  async function loadTranslationRuntimeStatus() {
    if (isLoadingTranslationRuntimeStatus) return;
    isLoadingTranslationRuntimeStatus = true;

    try {
      translationRuntimeStatus = await invoke<TranslationRuntimeStatus>("get_translation_runtime_status");
    } catch (error) {
      console.error(error);
      toast.error(`${tn("settings.translationStatusError", "Failed to read the translation runtime status.")} ${String(error)}`);
    } finally {
      isLoadingTranslationRuntimeStatus = false;
    }
  }

  async function repairRuntimeLocaleFolder() {
    if (isRepairingRuntimeLocaleFolder) return;
    isRepairingRuntimeLocaleFolder = true;

    try {
      const message = await invoke<string>("repair_runtime_locale_folder");
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(`${t("settings.repairRuntimeLocaleError", "Failed to repair the runtime locale folder.")} ${String(error)}`);
    } finally {
      isRepairingRuntimeLocaleFolder = false;
      await loadTranslationRuntimeStatus();
    }
  }

  async function openTranslationDataDir() {
    if (isOpeningTranslationDir) return;
    isOpeningTranslationDir = true;

    try {
      await invoke("open_translation_data_dir");
    } catch (error) {
      console.error(error);
      toast.error(`${t("settings.openDirError", "Failed to open the translation folder.")} ${String(error)}`);
    } finally {
      isOpeningTranslationDir = false;
      await loadTranslationRuntimeStatus();
    }
  }

  async function runGenerator(
    command: string,
    start: () => void,
    end: () => void,
    failureFallback: string,
    args?: Record<string, unknown>,
  ) {
    start();
    try {
      const message = await invoke<string>(command, args);
      await invoke<string>("refresh_translation_runtime_data");
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(`${failureFallback} ${String(error)}`);
    } finally {
      end();
    }
  }

  async function generateAllUiTranslationScaffolds() {
    if (isGeneratingAllUiTranslations) return;
    await runGenerator(
      "generate_all_ui_translation_scaffolds",
      () => (isGeneratingAllUiTranslations = true),
      () => (isGeneratingAllUiTranslations = false),
      t("settings.generateAllUiError", "Failed to generate all UI translation scaffolds."),
    );
  }

  function translationGenerateInfoText(): string {
    return tn(
      "debug.generateInfoBody",
      `Generate All UI Files repairs UI translation files in the runtime locale folder.

Generated parser data is seeded separately into AppData/generated for local edits. Personal notes are stored in generated/Notes.json and overlaid onto generated entries at runtime.`
    );
  }

  function getEditLocalActiveTab() {
    return getActiveTab(editLocalTabs, activeEditLocalTab);
  }

  function getCompareMergeActiveTab() {
    return getActiveTab(compareMergeTabs, activeCompareMergeTab);
  }

  function getStatusClass(status: TranslationFieldStatus | undefined): string {
    switch (status) {
      case "different":
      case "missing-local":
        return "compare-different";
      case "missing-compare":
        return "compare-missing";
      default:
        return "";
    }
  }

  $effect(() => {
    const key = `${activeEditLocalTab ?? ""}::${searchQuery}::${editShowAllRows}`;
    if (key !== lastEditLocalListKey) {
      lastEditLocalListKey = key;
      editLocalVisibleLimit = ROWS_PAGE_SIZE;
    }
  });

  $effect(() => {
    const key = `${activeCompareMergeTab ?? ""}::${searchQuery}::${compareShowAllRows}::${compareDifferencesOnly}`;
    if (key !== lastCompareListKey) {
      lastCompareListKey = key;
      compareVisibleLimit = ROWS_PAGE_SIZE;
    }
  });

  $effect(() => {
    if (
      activeSection === "editLocal" &&
      activeEditLocalTab &&
      activeEditLocalTab !== lastLoadedEditLocalPath
    ) {
      lastLoadedEditLocalPath = activeEditLocalTab;
      void loadEditLocalFile(activeEditLocalTab);
    }
  });

  $effect(() => {
    if (
      activeSection === "compareMerge" &&
      activeCompareMergeTab &&
      activeCompareMergeTab !== lastLoadedCompareLocalPath
    ) {
      lastLoadedCompareLocalPath = activeCompareMergeTab;
      void loadCompareLocalFile(activeCompareMergeTab);
    }
  });

  onMount(() => {
    void loadTabs();
    void loadTranslationRuntimeStatus();
  });
</script>

<svelte:head>
  <title>{t("meta.title", "Localization Tool")}</title>
</svelte:head>

<div class="localization-page">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <LanguagesIcon class="w-5 h-5" />
      </div>
      <div class="space-y-1">
        <h1 class="text-xl font-bold text-foreground">{t("title", "Localization Tool")}</h1>
        <p class="text-sm text-muted-foreground">{t("description", "Manage local translations, compare JSON files, and choose what to merge.")}</p>
      </div>
    </div>
  </div>

  <div class="section-tabs">
    {#each sections as section}
      <button
        type="button"
        class:active={activeSection === section.id}
        onclick={() => (activeSection = section.id)}
      >
        {t(section.key, section.fallback)}
      </button>
    {/each}
  </div>

  <div class="section-content">
    {#if activeSection === "editLocal"}
      <div class="panel">
        <div class="file-picker">
          <label for="edit-local-file">{t("labels.currentFile", "Current File")}</label>
          {#if isLoadingTabs}
            <div class="tab-message">{t("tabs.loading", "Loading translation files...")}</div>
          {:else if editLocalTabs.length === 0}
            <div class="tab-message">{t("tabs.empty", "No translation JSON files were found yet.")}</div>
          {:else}
            <select
              id="edit-local-file"
              value={activeEditLocalTab ?? ""}
              disabled={hasUnsavedChanges || isLoadingRows || isSaving}
              onchange={(event) => {
                activeEditLocalTab = currentSelectValue(event) || null;
              }}
            >
              <option value="">{t("tabs.selectFile", "Select a file")}</option>
              {#if editLocalTabGroups.parserTabs.length > 0}
                <optgroup label={t("tabs.group.parser", "Parser data")}>
                  {#each editLocalTabGroups.parserTabs as tab}
                    <option value={tab.relativePath}>{getTabLabel(tab)}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if showUiJsonTabs && editLocalTabGroups.uiTabs.length > 0}
                <optgroup label={t("tabs.group.ui", "UI text")}>
                  {#each editLocalTabGroups.uiTabs as tab}
                    <option value={tab.relativePath}>{getTabLabel(tab)}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if showUiJsonTabs && editLocalTabGroups.searchTabs.length > 0}
                <optgroup label={t("tabs.group.search", "Search indexes")}>
                  {#each editLocalTabGroups.searchTabs as tab}
                    <option value={tab.relativePath}>{getTabLabel(tab)}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
            {#if hasUnsavedChanges}
              <span class="file-picker-note">{t("labels.unsaved", "Unsaved Changes")}</span>
            {/if}
          {/if}
        </div>
        <div class="tab-box">
          <div class="file-tabs">
            {#if isLoadingTabs}
              <div class="tab-message">
                {t("tabs.loading", "Loading translation files...")}
              </div>
            {:else if editLocalTabs.length === 0}
              <div class="tab-message">
                {t("tabs.empty", "No translation JSON files were found yet.")}
              </div>
            {:else}
              {#if editLocalTabGroups.parserTabs.length > 0}
                <div class="file-tab-row">
                  {#each editLocalTabGroups.parserTabs as tab}
                    <button
                      type="button"
                      class="file-tab"
                      class:active={activeEditLocalTab === tab.relativePath}
                      onclick={() => (activeEditLocalTab = tab.relativePath)}
                    >
                      {getTabLabel(tab)}
                    </button>
                  {/each}
                </div>
              {/if}

              {#if showUiJsonTabs && editLocalTabGroups.uiTabs.length > 0}
                <div class="file-tab-row">
                  {#each editLocalTabGroups.uiTabs as tab}
                    <button
                      type="button"
                      class="file-tab"
                      class:active={activeEditLocalTab === tab.relativePath}
                      onclick={() => (activeEditLocalTab = tab.relativePath)}
                    >
                      {getTabLabel(tab)}
                    </button>
                  {/each}
                </div>
              {/if}

              {#if showUiJsonTabs && editLocalTabGroups.searchTabs.length > 0}
                <div class="file-tab-row">
                  {#each editLocalTabGroups.searchTabs as tab}
                    <button
                      type="button"
                      class="file-tab"
                      class:active={activeEditLocalTab === tab.relativePath}
                      onclick={() => (activeEditLocalTab = tab.relativePath)}
                    >
                      {getTabLabel(tab)}
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </div>

        <div class="panel-top">
          <div
            class="search-shell"
            class:locked={hasUnsavedChanges}
            title={hasUnsavedChanges
              ? t(
                  "search.locked",
                  "Save or cancel your current edits before searching again.",
                )
              : ""}
          >
            <input
              type="text"
              bind:value={searchQuery}
              placeholder={t("search.placeholder", "Search ID, name, or note...")}
              disabled={hasUnsavedChanges}
            />

            {#if hasUnsavedChanges}
              <div class="search-lock-indicator" aria-hidden="true">!</div>
            {/if}
          </div>

          <button type="button" onclick={toggleEditViewAll}>
            {editShowAllRows
              ? t("actions.hideAll", "Hide All")
              : t("actions.viewAll", "View All")}
          </button>

          <button
            type="button"
            class="save-button"
            onclick={saveEditLocalFile}
            disabled={!hasUnsavedChanges || isSaving || isLoadingRows || !getEditLocalActiveTab()}
          >
            {isSaving
              ? t("actions.saving", "Saving...")
              : t("actions.save", "Save")}
          </button>

          <button
            type="button"
            onclick={cancelEditLocalEdits}
            disabled={!hasUnsavedChanges || isSaving || isLoadingRows}
          >
            {t("actions.cancel", "Cancel")}
          </button>
        </div>


        <div class="panel-body">
          {#if !isLoadingTabs && getEditLocalActiveTab()}
            <div class="active-file-label">
              {t("labels.currentFile", "Current File")}:
              <span>{getEditLocalActiveTab()?.relativePath}</span>

              {#if hasUnsavedChanges}
                <strong class="dirty-indicator">
                  {t("labels.unsaved", "Unsaved Changes")}
                </strong>
              {/if}
            </div>
          {/if}

          {#if editLocalSaveMessage}
            <div class="save-state success-state">{editLocalSaveMessage}</div>
          {/if}

          {#if !getEditLocalActiveTab()}
            <div class="empty-state">
              {t("tabs.selectFilePrompt", "Choose a translation file to load it.")}
            </div>
          {:else if isLoadingRows}
            <div class="empty-state">
              {t("rows.loading", "Loading file contents...")}
            </div>
          {:else if editLocalError}
            <div class="error-state">{editLocalError}</div>
          {:else if visibleEditLocalRows.length === 0}
            <div class="empty-state">
              {editShowAllRows
                ? t("rows.empty", "This file has no displayable entries.")
                : t("rows.searchPrompt", "Type a search query, or click View All to show every entry.")}
            </div>
          {:else}
            <div class="results-table" class:overlay-alias-mode={editLocalShowsOverlayAliasColumn}>
              <div class="results-header" class:overlay-alias-mode={editLocalShowsOverlayAliasColumn}>
                <div>{t("columns.id", "ID / Key")}</div>
                <div>{t("columns.baseName", "Base Name (CN)")}</div>
                <div>{t("columns.localName", "Current Language Name")}</div>
                {#if editLocalShowsOverlayAliasColumn}
                  <div>{t("columns.localOverlayAlias", "Current Overlay Alias")}</div>
                {/if}
                <div>{t("columns.localNote", "Current Language Note")}</div>
              </div>

              {#each visibleEditLocalRows as row}
                <div class="results-row" class:overlay-alias-mode={editLocalShowsOverlayAliasColumn}>
                  <div class="cell cell-id">{row.id}</div>

                  <div class="cell base-text-cell">{row.baseName}</div>

                  <div class="cell">
                    <input
                      type="text"
                      value={row.localName}
                      oninput={(event) =>
                        updateRowField(
                          row.id,
                          "localName",
                          currentInputValue(event),
                        )}
                    />
                  </div>

                  {#if editLocalShowsOverlayAliasColumn}
                    <div class="cell">
                      <input
                        type="text"
                        value={row.localOverlayAlias ?? ""}
                        oninput={(event) =>
                          updateRowField(
                            row.id,
                            "localOverlayAlias",
                            currentInputValue(event),
                          )}
                      />
                    </div>
                  {/if}

                  <div class="cell">
                    <textarea
                      rows="2"
                      oninput={(event) =>
                        updateRowField(
                          row.id,
                          "localNote",
                          currentTextareaValue(event),
                        )}
                    >{row.localNote}</textarea>
                  </div>
                </div>
              {/each}
            </div>
            {#if hiddenEditLocalRowCount > 0}
              <div class="row-limit-bar">
                <span>
                  {t("rows.showing", "Showing")} {visibleEditLocalRows.length}
                  {t("rows.of", "of")} {filteredEditLocalRows.length}
                </span>
                <button type="button" onclick={showMoreEditRows}>
                  {t("rows.showMore", "Show more")}
                </button>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {:else if activeSection === "compareMerge"}
      <div class="panel">
        <div class="file-picker">
          <label for="compare-local-file">{t("labels.currentFile", "Current File")}</label>
          {#if isLoadingTabs}
            <div class="tab-message">{t("tabs.loading", "Loading translation files...")}</div>
          {:else if compareMergeTabs.length === 0}
            <div class="tab-message">{t("tabs.empty", "No translation JSON files were found yet.")}</div>
          {:else}
            <select
              id="compare-local-file"
              value={activeCompareMergeTab ?? ""}
              disabled={compareHasUnsavedChanges || isLoadingCompareRows || isSavingCompare}
              onchange={(event) => {
                activeCompareMergeTab = currentSelectValue(event) || null;
              }}
            >
              <option value="">{t("tabs.selectFile", "Select a file")}</option>
              {#if compareMergeTabGroups.parserTabs.length > 0}
                <optgroup label={t("tabs.group.parser", "Parser data")}>
                  {#each compareMergeTabGroups.parserTabs as tab}
                    <option value={tab.relativePath}>{getTabLabel(tab)}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if showUiJsonTabs && compareMergeTabGroups.uiTabs.length > 0}
                <optgroup label={t("tabs.group.ui", "UI text")}>
                  {#each compareMergeTabGroups.uiTabs as tab}
                    <option value={tab.relativePath}>{getTabLabel(tab)}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if showUiJsonTabs && compareMergeTabGroups.searchTabs.length > 0}
                <optgroup label={t("tabs.group.search", "Search indexes")}>
                  {#each compareMergeTabGroups.searchTabs as tab}
                    <option value={tab.relativePath}>{getTabLabel(tab)}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
            {#if compareHasUnsavedChanges}
              <span class="file-picker-note">{t("labels.unsaved", "Unsaved Changes")}</span>
            {/if}
          {/if}
        </div>
        <div class="tab-box">
          <div class="file-tabs">
            {#if isLoadingTabs}
              <div class="tab-message">
                {t("tabs.loading", "Loading translation files...")}
              </div>
            {:else if compareMergeTabs.length === 0}
              <div class="tab-message">
                {t("tabs.empty", "No translation JSON files were found yet.")}
              </div>
            {:else}
              {#if compareMergeTabGroups.parserTabs.length > 0}
                <div class="file-tab-row">
                  {#each compareMergeTabGroups.parserTabs as tab}
                    <button
                      type="button"
                      class="file-tab"
                      class:active={activeCompareMergeTab === tab.relativePath}
                      onclick={() => (activeCompareMergeTab = tab.relativePath)}
                    >
                      {getTabLabel(tab)}
                    </button>
                  {/each}
                </div>
              {/if}

              {#if showUiJsonTabs && compareMergeTabGroups.uiTabs.length > 0}
                <div class="file-tab-row">
                  {#each compareMergeTabGroups.uiTabs as tab}
                    <button
                      type="button"
                      class="file-tab"
                      class:active={activeCompareMergeTab === tab.relativePath}
                      onclick={() => (activeCompareMergeTab = tab.relativePath)}
                    >
                      {getTabLabel(tab)}
                    </button>
                  {/each}
                </div>
              {/if}

              {#if showUiJsonTabs && compareMergeTabGroups.searchTabs.length > 0}
                <div class="file-tab-row">
                  {#each compareMergeTabGroups.searchTabs as tab}
                    <button
                      type="button"
                      class="file-tab"
                      class:active={activeCompareMergeTab === tab.relativePath}
                      onclick={() => (activeCompareMergeTab = tab.relativePath)}
                    >
                      {getTabLabel(tab)}
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </div>

        <div class="panel-top compare-search-row">
          <div class="search-shell">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder={t("search.placeholder", "Search ID, name, or note...")}
            />
          </div>

          <button type="button" onclick={toggleCompareViewAll}>
            {compareShowAllRows
              ? t("actions.hideAll", "Hide All")
              : t("actions.viewAll", "View All")}
          </button>
        </div>

        <input
          bind:this={compareFileInput}
          class="hidden-file-input"
          type="file"
          accept=".json,application/json"
          onchange={handleCompareFileChange}
        />


        <div class="panel-body">
          {#if !isLoadingTabs && getCompareMergeActiveTab()}
            <div class="active-file-label">
              {t("labels.currentFile", "Current File")}:
              <span>{getCompareMergeActiveTab()?.relativePath}</span>

              {#if compareImportedFileName}
                <span class="compare-file-pill">
                  {t("compare.compareFile", "Compare File")}: {compareImportedFileName}
                </span>
              {/if}

              {#if compareHasUnsavedChanges}
                <strong class="dirty-indicator">
                  {t("labels.unsaved", "Unsaved Changes")}
                </strong>
              {/if}
            </div>
          {/if}

          <div class="compare-secondary-actions">
            <button type="button" onclick={openCompareFilePicker}>
              {t("compare.loadJson", "Load Compare JSON")}
            </button>

            <button
              type="button"
              onclick={clearCompareFile}
              disabled={!compareImportedRawJson}
            >
              {t("compare.clearJson", "Clear Compare File")}
            </button>
          </div>

          <div class="compare-primary-actions">
            <button
              type="button"
              class:toggle-active={compareDifferencesOnly}
              onclick={() => (compareDifferencesOnly = !compareDifferencesOnly)}
              disabled={!compareImportedRawJson}
            >
              {t("actions.differencesOnly", "Differences Only")}
            </button>

            <button
              type="button"
              onclick={applySelectedCompareChanges}
              disabled={!compareImportedRawJson || selectedCompareFieldCount === 0}
            >
              {t("compare.applySelected", "Apply Selected Changes")}
            </button>

            <button
              type="button"
              class="save-button"
              onclick={saveCompareMergedFile}
              disabled={!compareHasUnsavedChanges || isSavingCompare || isLoadingCompareRows}
            >
              {isSavingCompare
                ? t("actions.saving", "Saving...")
                : t("compare.saveMerged", "Save Merged Result")}
            </button>

            <button
              type="button"
              onclick={cancelCompareMergedEdits}
              disabled={!compareHasUnsavedChanges || isSavingCompare || isLoadingCompareRows}
            >
              {t("actions.cancel", "Cancel")}
            </button>
          </div>

          {#if compareSaveMessage}
            <div class="save-state success-state">{compareSaveMessage}</div>
          {/if}

          {#if !getCompareMergeActiveTab()}
            <div class="empty-state">
              {t("tabs.selectFilePrompt", "Choose a translation file to load it.")}
            </div>
          {:else if isLoadingCompareRows}
            <div class="empty-state">
              {t("rows.loading", "Loading file contents...")}
            </div>
          {:else if compareError}
            <div class="error-state">{compareError}</div>
          {:else if !compareImportedRawJson}
            <div class="empty-state">
              {t(
                "compare.loadPrompt",
                "Load a compare JSON file to view differences and choose which fields to merge.",
              )}
            </div>
          {:else if visibleCompareRows.length === 0}
            <div class="empty-state">
              {compareShowAllRows
                ? t("rows.empty", "This file has no displayable entries.")
                : t(
                    "compare.noMatches",
                    "There are no comparison results to display with the current filters.",
                  )}
            </div>
          {:else}
            <div class="compare-table">
              <div class="compare-header">
                <div>{t("columns.id", "ID / Key")}</div>
                <div>{t("columns.baseName", "Base Name (CN)")}</div>
                <div>{t("compare.localName", "Current Name")}</div>
                <div>{t("compare.compareName", "Compare Name")}</div>
                <div>{t("compare.mergeName", "Merge Name")}</div>
                <div>{t("compare.mergeRow", "Whole Row")}</div>
              </div>

              {#each visibleCompareRows as row}
                <div class="compare-row">
                  <div class="cell cell-id">{row.id}</div>

                  <div class="cell base-text-cell">{row.baseName}</div>

                  <div class="cell readonly-cell {getStatusClass(row.nameStatus)}">
                    {row.localName}
                  </div>

                  <div class="cell readonly-cell {getStatusClass(row.nameStatus)}">
                    {row.compareName}
                  </div>

                  <div class="cell checkbox-cell">
                    <input
                      type="checkbox"
                      checked={row.selection?.nameSelected ?? false}
                      disabled={!isMergeableField(row.nameStatus, row.compareName ?? "")}
                      onchange={(event) =>
                        toggleCompareFieldSelection(
                          row.id,
                          "nameSelected",
                          currentChecked(event),
                        )}
                    />
                  </div>

                  <div class="cell checkbox-cell">
                    <input
                      type="checkbox"
                      checked={row.selection?.rowSelected ?? false}
                      disabled={!isMergeableField(row.nameStatus, row.compareName ?? "")}
                      onchange={(event) =>
                        toggleCompareRowSelection(
                          row.id,
                          currentChecked(event),
                        )}
                    />
                  </div>
                </div>
              {/each}
            </div>
            {#if hiddenCompareRowCount > 0}
              <div class="row-limit-bar">
                <span>
                  {t("rows.showing", "Showing")} {visibleCompareRows.length}
                  {t("rows.of", "of")} {filteredCompareRows.length}
                </span>
                <button type="button" onclick={showMoreCompareRows}>
                  {t("rows.showMore", "Show more")}
                </button>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {:else}
      <div class="panel">
        <div class="settings-debug-panel">
          <div class="settings-group">
            <div class="settings-group-header">
              <button
                type="button"
                class="settings-collapse-button"
                onclick={() => (showGeneralSettings = !showGeneralSettings)}
                aria-expanded={showGeneralSettings}
              >
                <span class="settings-collapse-button-label">{t("settings.general.title", "General")}</span>
                <span class="settings-collapse-chevron" aria-hidden="true">{showGeneralSettings ? "v" : ">"}</span>
              </button>
            </div>

            {#if showGeneralSettings}
              <div class="settings-debug-body">
                <div class="settings-debug-row">
                  <div class="settings-debug-copy">
                    <div class="settings-debug-title">
                      {t("settings.visibility.uiJsons.title", "UI JSON Tabs")}
                    </div>
                    <div class="settings-debug-description">
                      {t("settings.visibility.uiJsons.description", "Show or hide UI JSON rows in Edit Local and Compare / Merge.")}
                    </div>
                  </div>

                  <button type="button" onclick={() => (showUiJsonTabs = !showUiJsonTabs)}>
                    {showUiJsonTabs
                      ? t("settings.visibility.uiJsons.hide", "Hide UI JSONs")
                      : t("settings.visibility.uiJsons.show", "Show UI JSONs")}
                  </button>
                </div>
              </div>
            {/if}
          </div>

          {#if SHOW_LEGACY_TRANSLATION_DEBUG_SETTINGS}
            <div class="settings-group">
              <div class="settings-group-header settings-group-header-inline">
              <div class="settings-header-main">
                <button
                  type="button"
                  class="settings-collapse-button settings-collapse-button-inline settings-collapse-button-text"
                  onclick={() => (showTranslationDebugSettings = !showTranslationDebugSettings)}
                  aria-expanded={showTranslationDebugSettings}
                >
                  <span class="settings-collapse-button-label">{t("settings.translationDebug.title", "Translation Debug Settings")}</span>
                </button>

                <button
                  type="button"
                  class="settings-info-icon-button"
                  class:active={showTranslationGenerateInfo}
                  aria-label={tn("debug.generateInfoButton", "Show generate behavior info")}
                  title={tn("debug.generateInfoButton", "Show generate behavior info")}
                  onclick={() => (showTranslationGenerateInfo = !showTranslationGenerateInfo)}
                >
                  i
                </button>
              </div>

              <button
                type="button"
                class="settings-collapse-icon-button"
                onclick={() => (showTranslationDebugSettings = !showTranslationDebugSettings)}
                aria-expanded={showTranslationDebugSettings}
                aria-label={showTranslationDebugSettings
                  ? t("settings.collapse.hide", "Collapse")
                  : t("settings.collapse.show", "Expand")}
                title={showTranslationDebugSettings
                  ? t("settings.collapse.hide", "Collapse")
                  : t("settings.collapse.show", "Expand")}
              >
                <span class="settings-collapse-chevron" aria-hidden="true">{showTranslationDebugSettings ? "v" : ">"}</span>
              </button>
            </div>

            {#if showTranslationGenerateInfo}
              <div class="settings-info-panel">
                <div class="settings-debug-info-title">
                  {tn("debug.generateInfoTitle", "What happens when you click Generate?")}
                </div>
                {translationGenerateInfoText()}
              </div>
            {/if}

            {#if showTranslationDebugSettings}
              <div class="settings-debug-body">
                <div class="settings-debug-row settings-debug-row-status">
                  <div class="settings-debug-copy">
                    <div class="settings-debug-title">
                      {tn("debug.runtimePathsTitle", "Runtime Locale Path Status")}
                    </div>
                    <div class="settings-debug-description">
                      {tn("debug.runtimePathsDescription", "Shows how the app data runtime locale folder and the bundled source locale folder were resolved, so packaged-build translation folder issues are easier to debug.")}
                    </div>

                    {#if translationRuntimeStatus}
                      <div class="settings-debug-status-grid">
                        <div class="settings-debug-status-line">
                          <span class="settings-debug-status-label">{tn("debug.runtimeLocalePathLabel", "Runtime Locale Path")}</span>
                          <code>{translationRuntimeStatus.runtimeDir}</code>
                        </div>
                        <div class="settings-debug-status-line">
                          <span class="settings-debug-status-label">{tn("debug.runtimeLocaleExistsLabel", "Runtime Directory Exists")}</span>
                          <span>{translationRuntimeStatus.runtimeExists ? tn("debug.statusYes", "Yes") : tn("debug.statusNo", "No")}</span>
                        </div>
                        <div class="settings-debug-status-line">
                          <span class="settings-debug-status-label">{tn("debug.runtimeManifestExistsLabel", "Runtime Manifest Exists")}</span>
                          <span>{translationRuntimeStatus.runtimeManifestExists ? tn("debug.statusYes", "Yes") : tn("debug.statusNo", "No")}</span>
                        </div>
                        <div class="settings-debug-status-line">
                          <span class="settings-debug-status-label">{tn("debug.sourceLocalePathLabel", "Source Locale Path")}</span>
                          <code>{translationRuntimeStatus.sourceDir ?? tn("debug.pathMissing", "Not Found")}</code>
                        </div>
                        <div class="settings-debug-status-line">
                          <span class="settings-debug-status-label">{tn("debug.sourceLocaleExistsLabel", "Source Directory Exists")}</span>
                          <span>{translationRuntimeStatus.sourceExists ? tn("debug.statusYes", "Yes") : tn("debug.statusNo", "No")}</span>
                        </div>
                        <div class="settings-debug-status-line">
                          <span class="settings-debug-status-label">{tn("debug.sourceManifestExistsLabel", "Source Manifest Exists")}</span>
                          <span>{translationRuntimeStatus.sourceManifestExists ? tn("debug.statusYes", "Yes") : tn("debug.statusNo", "No")}</span>
                        </div>
                        {#if translationRuntimeStatus.sourceError}
                          <div class="settings-debug-status-line settings-debug-status-line-error">
                            <span class="settings-debug-status-label">{tn("debug.sourceResolutionErrorLabel", "Source Resolution Error")}</span>
                            <span>{translationRuntimeStatus.sourceError}</span>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>

                  <button
                    type="button"
                    onclick={loadTranslationRuntimeStatus}
                    disabled={isLoadingTranslationRuntimeStatus}
                  >
                    {isLoadingTranslationRuntimeStatus
                      ? t("actions.processing", "Processing...")
                      : tn("debug.refreshStatusButton", "Refresh Path Status")}
                  </button>
                </div>

                <div class="settings-debug-row">
                  <div class="settings-debug-copy">
                    <div class="settings-debug-title">
                      {tn("debug.repairRuntimeLocaleTitle", "Repair Runtime Locale Folder")}
                    </div>
                    <div class="settings-debug-description">
                      {tn("debug.repairRuntimeLocaleDescription", "Check and repair the runtime locale folder in app data, restore missing manifest entries, folders, and files, and only backfill missing items without overwriting existing translations.")}
                    </div>
                  </div>

                  <button
                    type="button"
                    onclick={repairRuntimeLocaleFolder}
                    disabled={isRepairingRuntimeLocaleFolder}
                  >
                    {isRepairingRuntimeLocaleFolder
                      ? t("actions.processing", "Processing...")
                      : tn("debug.repairRuntimeLocaleButton", "Repair Runtime Locale Folder")}
                  </button>
                </div>

                <div class="settings-debug-row">
                  <div class="settings-debug-copy">
                    <div class="settings-debug-title">
                      {tn("debug.translationOpenTitle", "Open Translation Folder")}
                    </div>
                    <div class="settings-debug-description">
                      {tn("debug.translationOpenDescription", "Open the runtime translation directory in app data.")}
                    </div>
                  </div>

                  <button
                    type="button"
                    onclick={openTranslationDataDir}
                    disabled={isOpeningTranslationDir}
                  >
                    {isOpeningTranslationDir
                      ? t("actions.processing", "Processing...")
                      : tn("debug.translationOpenButton", "Open Translation Folder")}
                  </button>
                </div>

                <div class="settings-debug-row">
                  <div class="settings-debug-copy">
                    <div class="settings-debug-title">
                      {tn("debug.generateAllUiTitle", "Generate All UI Runtime Files")}
                    </div>
                    <div class="settings-debug-description">
                      {tn("debug.generateAllUiDescription", "Generate or patch all runtime UI files from the source UI tool/feature files while preserving existing translations in other locales.")}
                    </div>
                  </div>

                  <button
                    type="button"
                    onclick={generateAllUiTranslationScaffolds}
                    disabled={isGeneratingAllUiTranslations}
                  >
                    {isGeneratingAllUiTranslations
                      ? t("actions.processing", "Processing...")
                      : tn("debug.generateAllUiButton", "Generate All UI Files")}
                  </button>
                </div>

              </div>
            {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .localization-page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    height: calc(100vh - 132px);
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
  }


  .section-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .section-tabs button {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
    color: inherit;
    cursor: pointer;
    transition: 0.15s ease;
  }

  .section-tabs button:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  }

  .section-tabs button.active {
    background: var(--accent-color, rgba(255, 255, 255, 0.14));
    border-color: var(--accent-color, rgba(255, 255, 255, 0.2));
  }

  .section-content {
    display: flex;
    flex: 1 1 auto;
    min-height: min(560px, calc(100vh - 260px));
    min-height: 0;
    height: 100%;
  }

  .panel {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-secondary, rgba(255, 255, 255, 0.03));
  }

  .tab-box {
    display: none;
  }

  .file-picker {
    display: grid;
    grid-template-columns: max-content minmax(220px, 420px) auto;
    gap: 10px;
    align-items: center;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
  }

  .file-picker label {
    font-size: 12px;
    font-weight: 700;
    opacity: 0.8;
    text-transform: uppercase;
  }

  .file-picker select {
    width: 100%;
    min-height: 38px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
    padding: 8px 10px;
  }

  .file-picker select option,
  .file-picker select optgroup {
    background: rgb(36, 36, 36);
    color: rgba(255, 255, 255, 0.92);
  }

  .file-picker-note {
    color: rgba(255, 200, 80, 1);
    font-size: 12px;
    font-weight: 700;
  }

  .panel-top {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: stretch;
  }

  .search-shell {
    position: relative;
    flex: 1 1 280px;
    min-width: 220px;
  }

  .search-shell input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
  }

  .search-shell.locked input {
    opacity: 0.55;
    cursor: not-allowed;
    background: rgba(255, 255, 255, 0.015);
  }

  .search-lock-indicator {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    font-size: 18px;
    line-height: 1;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .search-shell.locked:hover .search-lock-indicator {
    opacity: 0.85;
  }

  .hidden-file-input {
    display: none;
  }

  .panel-top button {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
    cursor: pointer;
    transition: 0.15s ease;
  }

  .panel-top button:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  }

  .panel-top button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }


  .toggle-active {
    background: var(--accent-color, rgba(255, 255, 255, 0.14));
    border-color: var(--accent-color, rgba(255, 255, 255, 0.2));
  }

  .compare-secondary-actions,
  .compare-primary-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .compare-primary-actions {
    margin-top: -2px;
  }

  .compare-secondary-actions button,
  .compare-primary-actions button {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
    cursor: pointer;
    transition: 0.15s ease;
  }

  .compare-secondary-actions button:hover,
  .compare-primary-actions button:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  }

  .compare-secondary-actions button:disabled,
  .compare-primary-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .compare-primary-actions button.toggle-active {
    background: var(--accent-color, rgba(255, 255, 255, 0.14));
    border-color: var(--accent-color, rgba(255, 255, 255, 0.2));
  }

  .save-button {
    font-weight: 600;
  }

  .file-tabs {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 40px;
  }

  .file-tab-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .file-tab {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
    cursor: pointer;
    transition: 0.15s ease;
  }

  .file-tab:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  }

  .file-tab.active {
    background: var(--accent-color, rgba(255, 255, 255, 0.14));
    border-color: var(--accent-color, rgba(255, 255, 255, 0.2));
  }

  .tab-message {
    padding: 8px 0;
    opacity: 0.75;
    font-size: 14px;
  }

  .panel-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .active-file-label {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 13px;
    opacity: 0.8;
  }

  .active-file-label span {
    opacity: 1;
    font-family: monospace;
  }

  .compare-file-pill {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 12px;
  }

  .dirty-indicator {
    color: rgba(255, 200, 80, 1);
    font-size: 12px;
    font-weight: 700;
  }

  .results-table,
  .compare-table {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    scrollbar-gutter: stable both-edges;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
  }


  .results-table::-webkit-scrollbar,
  .compare-table::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .results-table::-webkit-scrollbar-track,
  .compare-table::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 999px;
  }

  .results-table::-webkit-scrollbar-thumb,
  .compare-table::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.22);
    border-radius: 999px;
  }

  .results-table::-webkit-scrollbar-thumb:hover,
  .compare-table::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.32);
  }

  .results-header,
  .results-row {
    display: grid;
    grid-template-columns:
      minmax(120px, 1fr)
      minmax(180px, 1.25fr)
      minmax(220px, 1.4fr)
      minmax(240px, 1.6fr);
    gap: 8px;
    align-items: start;
  }

  .results-header.overlay-alias-mode,
  .results-row.overlay-alias-mode {
    grid-template-columns:
      minmax(110px, 0.9fr)
      minmax(180px, 1.2fr)
      minmax(220px, 1.3fr)
      minmax(220px, 1.3fr)
      minmax(240px, 1.5fr);
  }

  .compare-header,
  .compare-row {
    display: grid;
    grid-template-columns:
      minmax(110px, 1fr)
      minmax(180px, 1.3fr)
      minmax(180px, 1.3fr)
      minmax(180px, 1.3fr)
      96px
      72px;
    gap: 8px;
    align-items: start;
  }

  .results-header,
  .compare-header {
    position: sticky;
    top: 0;
    z-index: 2;
    font-size: 12px;
    opacity: 0.95;
    font-weight: 600;
    padding: 12px 6px 10px;
    margin: -10px -10px 10px;
    background: rgba(24, 24, 24, 0.98);
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(6px);
  }

  .results-row,
  .compare-row {
    padding: 8px;
    border-radius: 10px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: var(--bg-primary, rgba(255, 255, 255, 0.015));
  }

  .cell {
    min-width: 0;
  }

  .cell-id {
    font-family: monospace;
    font-size: 13px;
    word-break: break-word;
    padding-top: 10px;
  }

  .base-text-cell {
    font-size: 13px;
    line-height: 1.4;
    padding: 10px 12px;
    min-height: 42px;
    display: flex;
    align-items: center;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .readonly-cell {
    font-size: 13px;
    line-height: 1.4;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.03);
    min-height: 42px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .note-cell {
    min-height: 56px;
  }

  .compare-different {
    background: rgba(255, 80, 80, 0.08);
    border-color: rgba(255, 80, 80, 0.2);
  }

  .compare-missing {
    background: rgba(255, 180, 80, 0.06);
    border-color: rgba(255, 180, 80, 0.18);
  }

  .checkbox-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
  }

  .checkbox-cell input {
    width: 16px;
    height: 16px;
  }

  .cell input,
  .cell textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
    font: inherit;
    resize: vertical;
    box-sizing: border-box;
  }

  .cell textarea {
    min-height: 56px;
  }

  .empty-state {
    padding: 20px 8px;
    opacity: 0.75;
    font-size: 14px;
  }

  .error-state {
    padding: 14px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 80, 80, 0.25);
    background: rgba(255, 80, 80, 0.08);
    color: inherit;
    font-size: 14px;
  }

  .save-state {
    padding: 12px 14px;
    border-radius: 8px;
    font-size: 14px;
  }

  .success-state {
    border: 1px solid rgba(80, 200, 120, 0.25);
    background: rgba(80, 200, 120, 0.08);
  }

  .row-limit-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
  }

  .row-limit-bar button {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.04));
    color: inherit;
    cursor: pointer;
  }

  .settings-debug-panel {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    gap: 18px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable both-edges;
    padding-right: 4px;
  }

  .settings-debug-panel::-webkit-scrollbar {
    width: 10px;
  }

  .settings-debug-panel::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 999px;
  }

  .settings-debug-panel::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.22);
    border-radius: 999px;
  }

  .settings-debug-panel::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.32);
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
  }

  .settings-group-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .settings-group-header-inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .settings-collapse-button {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .settings-collapse-button-inline {
    width: auto;
    flex: 1 1 auto;
  }

  .settings-collapse-button-text {
    justify-content: flex-start;
    flex: 0 1 auto;
  }

  .settings-collapse-button-label {
    font-size: 16px;
    font-weight: 700;
  }

  .settings-collapse-chevron {
    font-size: 16px;
    opacity: 0.8;
    line-height: 1;
  }


  .settings-header-main {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .settings-title-with-icon {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .settings-collapse-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .settings-info-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    transition: 0.15s ease;
  }

  .settings-info-icon-button:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .settings-info-icon-button.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.22);
  }

  .settings-debug-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px 0 0;
  }

  .settings-debug-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .settings-debug-row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .settings-debug-copy {
    min-width: 0;
    flex: 1 1 auto;
    padding-right: 8px;
  }

  .settings-debug-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 3px;
  }

  .settings-debug-description {
    opacity: 0.76;
    font-size: 13px;
    line-height: 1.45;
  }

  .settings-debug-row button,
  .secondary-button {
    flex: 0 0 auto;
    min-width: 210px;
    white-space: nowrap;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    background: var(--bg-primary, rgba(255, 255, 255, 0.02));
    color: inherit;
    cursor: pointer;
    transition: 0.15s ease;
    text-align: center;
  }

  .settings-debug-row button:hover,
  .secondary-button:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  }

  .settings-debug-row button:disabled,
  .secondary-button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .settings-info-panel {
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    white-space: pre-wrap;
    line-height: 1.5;
    font-size: 13px;
  }

  .settings-debug-info-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .settings-debug-row-status {
    align-items: flex-start;
  }

  .settings-debug-status-grid {
    margin-top: 10px;
    display: grid;
    gap: 6px;
  }

  .settings-debug-status-line {
    display: grid;
    grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    font-size: 12px;
    line-height: 1.45;
  }

  .settings-debug-status-line code {
    white-space: pre-wrap;
    word-break: break-word;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
  }

  .settings-debug-status-label {
    font-weight: 600;
    opacity: 0.85;
  }

  .settings-debug-status-line-error {
    color: #ffb4b4;
  }

  @media (max-width: 900px) {
    .file-picker {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .row-limit-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .row-limit-bar button {
      width: 100%;
    }

    .settings-debug-row {
      flex-direction: column;
      align-items: stretch;
    }

    .settings-debug-row button,
    .secondary-button {
      min-width: 0;
      width: 100%;
    }
  }

</style>
