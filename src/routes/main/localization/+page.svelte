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

  import { discoverTranslationFileTabs } from "./lib/file-discovery";
  import {
    readTranslationRuntimeJson,
    writeTranslationRuntimeJson,
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

  let compareFileInput = $state<HTMLInputElement | null>(null);

  let isRepairingRuntimeLocaleFolder = $state(false);
  let isOpeningTranslationDir = $state(false);
  let isGeneratingBuffNameSearch = $state(false);
  let isGeneratingBuffNameTranslation = $state(false);
  let isGeneratingSceneNameTranslation = $state(false);
  let isGeneratingMonsterNameTranslation = $state(false);
  let isGeneratingSkillNameTranslation = $state(false);
    let isGeneratingAllUiTranslations = $state(false);
  let showTranslationGenerateInfo = $state(false);
  let showUiJsonTabs = $state(false);

  const visibleEditLocalRows = $derived(
    filterTranslationRows(editLocalRows, searchQuery, editShowAllRows),
  );

  const visibleCompareRows = $derived.by(() => {
    let rows = compareRows;

    if (compareDifferencesOnly) {
      rows = rows.filter((row) => isCompareRowDifferent(row));
    }

    return filterTranslationRows(rows, searchQuery, compareShowAllRows);
  });

  const selectedCompareFieldCount = $derived.by(() =>
    compareRows.reduce((count, row) => {
      let nextCount = count;
      if (row.selection?.nameSelected) nextCount += 1;
      return nextCount;
    }, 0),
  );

  function getTabLabel(tab: TranslationFileTab) {
    if (tab.relativePath === "parser/skillnames.json") return t("tabs.skillNames", "技能名称");
    if (tab.relativePath === "parser/MonsterName.json") return t("tabs.monsterNames", "怪物名称");
    if (tab.relativePath === "parser/SceneName.json") return t("tabs.sceneNames", "场景名称");
    if (tab.relativePath === "parser/BuffName.json") return t("tabs.buffName", "Buff 名称");
    if (tab.relativePath === "parser/class-labels.json") return t("tabs.classLabels", "职业标签");
    if (tab.relativePath === "search/BuffNameSearch.json") return t("tabs.buffNameSearch", "Buff 名称搜索");
    if (tab.relativePath === "search/resonance-skill-search.json") return t("tabs.resonanceSkillSearch", "共鸣技能搜索");
    return tab.displayName;
  }

  function splitTabsByCategory(tabs: TranslationFileTab[]) {
    const parserTabs: TranslationFileTab[] = [];
    const uiTabs: TranslationFileTab[] = [];
    const searchTabs: TranslationFileTab[] = [];

    for (const tab of tabs) {
      if (tab.relativePath.startsWith("parser/")) {
        parserTabs.push(tab);
      } else if (tab.relativePath.startsWith("search/")) {
        searchTabs.push(tab);
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
      fallback: "本地编辑",
    },
    {
      id: "compareMerge",
      key: "sections.compareMerge",
      fallback: "对比 / 合并",
    },
    {
      id: "settings",
      key: "sections.settings",
      fallback: "设置",
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
      row.localName,
      row.localNote,
      row.compareName ?? "",
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
        const nextRow = { ...row, localName: "", localNote: "" };
        nextRow.searchBlob = buildSearchBlob(nextRow);
        return nextRow;
      }

      const raw = row.raw;
      const isSkillnamesShape =
        isRecord(raw["name"]) || isRecord(raw["note"]);

      const localName = isSkillnamesShape
        ? getDirectLocaleValue(raw["name"], locale)
        : getDirectLocaleValue(raw, locale);

      const localNote = isSkillnamesShape
        ? getDirectLocaleValue(raw["note"], locale)
        : "";

      const nextRow: TranslationWorkspaceRow = {
        ...row,
        localName,
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
    const isSkillnamesShape =
      isRecord(nextEntry["name"]) || isRecord(nextEntry["note"]);

    if (isSkillnamesShape) {
      const nextName = isRecord(nextEntry["name"])
        ? { ...(nextEntry["name"] as Record<string, unknown>) }
        : {};

      if (hasOwnKey(nextName, locale) || row.localName !== "") {
        nextName[locale] = row.localName;
      }

      nextEntry["name"] = nextName;

      const hadNoteObject = isRecord(nextEntry["note"]);
      const nextNote = hadNoteObject
        ? { ...(nextEntry["note"] as Record<string, unknown>) }
        : {};

      if (hasOwnKey(nextNote, locale) || row.localNote !== "") {
        nextNote[locale] = row.localNote;
      }

      if (hadNoteObject || row.localNote !== "") {
        nextEntry["note"] = nextNote;
      }

      return nextEntry;
    }

    if (hasOwnKey(nextEntry, locale) || row.localName !== "") {
      nextEntry[locale] = row.localName;
    }

    return nextEntry;
  }

  function buildSavePayload(
    rawJson: unknown,
    rows: TranslationWorkspaceRow[],
    locale: LocaleCode,
  ): unknown {
    if (!isRecord(rawJson)) {
      return rawJson;
    }

    const nextRoot = cloneJson(rawJson) as Record<string, unknown>;
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const processedIds = new Set<string>();

    for (const [id, rawEntry] of Object.entries(nextRoot)) {
      const row = rowMap.get(id);
      if (!row || !isRecord(rawEntry)) {
        continue;
      }

      nextRoot[id] = applyLocaleValuesToEntry(rawEntry, row, locale);
      processedIds.add(id);
    }

    for (const row of rows) {
      if (processedIds.has(row.id)) {
        continue;
      }

      if (!isRecord(row.raw)) {
        continue;
      }

      nextRoot[row.id] = applyLocaleValuesToEntry(row.raw, row, locale);
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
    hasUnsavedChanges = false;
  }

  function resetCompareLocalRowsFromSource() {
    const activeTab = getCompareMergeActiveTab();
    if (!activeTab || !compareLocalRawJson) {
      compareLocalRows = [];
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
    compareHasUnsavedChanges = false;
  }

  function clearCompareState() {
    compareImportedRawJson = null;
    compareImportedRows = [];
    compareImportedFileName = "";
    compareRows = [];
    compareError = "";
    compareSaveMessage = "";
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
        localName: localRow?.localName ?? "",
        localNote: localRow?.localNote ?? "",
        compareName,
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

    if (!activeEditLocalTab && editLocalTabs.length > 0) {
      activeEditLocalTab = editLocalTabs[0]!.relativePath;
    }

    if (!activeCompareMergeTab && compareMergeTabs.length > 0) {
      activeCompareMergeTab = compareMergeTabs[0]!.relativePath;
    }

    isLoadingTabs = false;
  }

  async function loadEditLocalFile(relativePath: string) {
    const tab = getActiveTab(editLocalTabs, relativePath);
    if (!tab) {
      editLocalRawJson = null;
      editLocalRows = [];
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
      hasUnsavedChanges = false;
      editLocalError = t(
        "errors.readFailed",
        "无法读取或解析所选翻译文件。",
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
      clearCompareState();
      compareError = t(
        "errors.readFailed",
        "无法读取或解析所选翻译文件。",
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
      const payload = buildSavePayload(
        editLocalRawJson,
        editLocalRows,
        getLocale(),
      );

      const result = await writeTranslationRuntimeJson(
        activeTab.relativePath,
        payload,
      );

      if (!result.ok) {
        editLocalError = result.error || t(
          "errors.saveFailed",
          "保存所选翻译文件失败。",
        );
        return;
      }

      editLocalRawJson = payload;
      resetEditLocalRowsFromSource();
      editLocalSaveMessage = t(
        "messages.saved",
        "已保存。",
      );
    } catch (error) {
      console.warn("[localization] Failed to save translation file:", error);
      editLocalError = error instanceof Error
        ? error.message
        : t(
            "errors.saveFailed",
            "保存所选翻译文件失败。",
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
      const payload = buildSavePayload(
        compareLocalRawJson,
        compareLocalRows,
        getLocale(),
      );

      const result = await writeTranslationRuntimeJson(
        activeTab.relativePath,
        payload,
      );

      if (!result.ok) {
        compareError = result.error || t(
          "errors.saveFailed",
          "保存所选翻译文件失败。",
        );
        return;
      }

      compareLocalRawJson = payload;
      resetCompareLocalRowsFromSource();
      rebuildCompareRows(false);
      compareSaveMessage = t(
        "messages.saved",
        "已保存。",
      );
    } catch (error) {
      console.warn("[localization] Failed to save merged translation file:", error);
      compareError = error instanceof Error
        ? error.message
        : t(
            "errors.saveFailed",
            "保存所选翻译文件失败。",
          );
    } finally {
      isSavingCompare = false;
    }
  }

  function cancelEditLocalEdits() {
    editLocalError = "";
    editLocalSaveMessage = "";
    resetEditLocalRowsFromSource();
  }

  function cancelCompareMergedEdits() {
    compareError = "";
    compareSaveMessage = "";
    resetCompareLocalRowsFromSource();
    rebuildCompareRows(false);
  }

  function toggleEditViewAll() {
    editShowAllRows = !editShowAllRows;
  }

  function toggleCompareViewAll() {
    compareShowAllRows = !compareShowAllRows;
  }

  function updateRowField(
    rowId: string,
    field: "localName" | "localNote",
    value: string,
  ) {
    editLocalSaveMessage = "";

    editLocalRows = editLocalRows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      return {
        ...row,
        [field]: value,
      };
    });

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
        "请先选择一个本地翻译文件标签。",
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
        "无法读取或解析对比 JSON 文件。",
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
    compareRows = compareRows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const nextSelection: TranslationCompareSelection = {
        rowSelected: false,
        nameSelected: row.selection?.nameSelected ?? false,
        noteSelected: row.selection?.noteSelected ?? false,
      };

      nextSelection[field] = checked;
      nextSelection.noteSelected = false;
      nextSelection.rowSelected = nextSelection.nameSelected;

      return {
        ...row,
        selection: nextSelection,
      };
    });
  }

  function toggleCompareRowSelection(rowId: string, checked: boolean) {
    compareRows = compareRows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const nameSelectable = isMergeableField(
        row.nameStatus,
        row.compareName ?? "",
      );
      const nextSelection: TranslationCompareSelection = {
        rowSelected: checked && nameSelectable,
        nameSelected: checked ? nameSelectable : false,
        noteSelected: false,
      };

      return {
        ...row,
        selection: nextSelection,
      };
    });
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
            localName: "",
            localNote: "",
            searchBlob: "",
            raw: importedRow.raw,
          };

      if (selection.nameSelected) {
        nextRow.localName = importedRow.localName;
      }


      nextRow.searchBlob = buildSearchBlob(nextRow);
      localMap.set(compareRow.id, nextRow);
    }

    compareLocalRows = sortRows(Array.from(localMap.values()));
    compareHasUnsavedChanges = true;
    compareSaveMessage = "";
    rebuildCompareRows(false);
  }

  async function repairRuntimeLocaleFolder() {
    if (isRepairingRuntimeLocaleFolder) return;
    isRepairingRuntimeLocaleFolder = true;

    try {
      const message = await invoke<string>("repair_runtime_locale_folder");
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(`${t("settings.repairRuntimeLocaleError", "修复运行时语言环境文件夹失败。")} ${String(error)}`);
    } finally {
      isRepairingRuntimeLocaleFolder = false;
    }
  }

  async function openTranslationDataDir() {
    if (isOpeningTranslationDir) return;
    isOpeningTranslationDir = true;

    try {
      await invoke("open_translation_data_dir");
    } catch (error) {
      console.error(error);
      toast.error(`${t("settings.openDirError", "打开翻译文件夹失败。")} ${String(error)}`);
    } finally {
      isOpeningTranslationDir = false;
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
      t("settings.generateAllUiError", "生成全部 UI 翻译脚手架失败。"),
    );
  }

  async function generateBuffNameSearchScaffold() {
    if (isGeneratingBuffNameSearch) return;
    await runGenerator(
      "generate_buff_name_search_scaffold",
      () => (isGeneratingBuffNameSearch = true),
      () => (isGeneratingBuffNameSearch = false),
      t("settings.generateBuffNameSearchError", "生成 BuffNameSearch 脚手架失败。"),
    );
  }

  async function generateBuffNameTranslationScaffold() {
    if (isGeneratingBuffNameTranslation) return;
    await runGenerator(
      "generate_buff_name_translation_scaffold",
      () => (isGeneratingBuffNameTranslation = true),
      () => (isGeneratingBuffNameTranslation = false),
      t("settings.generateBuffNameError", "生成 BuffName 翻译脚手架失败。"),
    );
  }

  async function generateSceneNameTranslationScaffold() {
    if (isGeneratingSceneNameTranslation) return;
    await runGenerator(
      "generate_scene_name_translation_scaffold",
      () => (isGeneratingSceneNameTranslation = true),
      () => (isGeneratingSceneNameTranslation = false),
      t("settings.generateSceneNameError", "生成 SceneName 翻译脚手架失败。"),
    );
  }

  async function generateMonsterNameTranslationScaffold() {
    if (isGeneratingMonsterNameTranslation) return;
    await runGenerator(
      "generate_monster_name_translation_scaffold",
      () => (isGeneratingMonsterNameTranslation = true),
      () => (isGeneratingMonsterNameTranslation = false),
      t("settings.generateMonsterNameError", "生成 MonsterName 翻译脚手架失败。"),
    );
  }

  async function generateSkillNameTranslationScaffold() {
    if (isGeneratingSkillNameTranslation) return;
    await runGenerator(
      "generate_skill_name_translation_scaffold",
      () => (isGeneratingSkillNameTranslation = true),
      () => (isGeneratingSkillNameTranslation = false),
      t("settings.generateSkillNameError", "生成技能翻译脚手架失败。"),
    );
  }

  function translationGenerateInfoText(): string {
    return tn(
      "debug.generateInfoBody",
      `Using skillnames.json as the example:

When you click Generate Skill Translations, it now does the following:

• reads the existing runtime skillnames.json
• rebuilds the file from the source tables
• adds new IDs it finds from the source JSONs
• preserves existing entries that are not in the current source pass
• writes the merged result back to runtime locales/<locale>/parser/skillnames.json

The current generator is source-based and pulls from these, in this priority order:

1. RecountTable.json
2. DamageAttrIdName.json
3. SkillEffectTable.json
4. SkillFightLevelTable.json
5. TempAttrTable.json

What is preserved:

• existing en
• existing ja
• existing extra fields on an entry
• existing entries that are only in your runtime file and not found in the current bundled sources

What is not preserved:

• generated zh-CN values for name
• generated zh-CN values for note when a source note exists

So the accurate behavior is:

• New IDs from the bundle: yes, they get added
• Your English/Japanese custom translations: yes, they are preserved
• Your comments or extra custom fields: yes, they should stay if they live on the entry object
• Your manual zh-CN edits: no, those can be overwritten by the generator
• Your manual zh-CN notes: also no, those can be overwritten if the source provides a note`
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
  });
</script>

<svelte:head>
  <title>{t("meta.title", "本地化工具")}</title>
</svelte:head>

<div class="localization-page">
  <div class="localization-header">
    <h1>{t("title", "本地化工具")}</h1>
    <p>{t("description", "管理本地翻译、对比 JSON，并选择要合并的内容。")}</p>
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
        <div class="tab-box">
          <div class="file-tabs">
            {#if isLoadingTabs}
              <div class="tab-message">
                {t("tabs.loading", "正在加载翻译文件…")}
              </div>
            {:else if editLocalTabs.length === 0}
              <div class="tab-message">
                {t("tabs.empty", "暂未发现可用的翻译 JSON 文件。")}
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
                  "保存或取消当前编辑后才能再次搜索。",
                )
              : ""}
          >
            <input
              type="text"
              bind:value={searchQuery}
              placeholder={t("search.placeholder", "搜索 ID、名称或备注…")}
              disabled={hasUnsavedChanges}
            />

            {#if hasUnsavedChanges}
              <div class="search-lock-indicator" aria-hidden="true">⊘</div>
            {/if}
          </div>

          <button type="button" onclick={toggleEditViewAll}>
            {editShowAllRows
              ? t("actions.hideAll", "隐藏全部")
              : t("actions.viewAll", "查看全部")}
          </button>

          <button
            type="button"
            class="save-button"
            onclick={saveEditLocalFile}
            disabled={!hasUnsavedChanges || isSaving || isLoadingRows || !getEditLocalActiveTab()}
          >
            {isSaving
              ? t("actions.saving", "保存中…")
              : t("actions.save", "保存")}
          </button>

          <button
            type="button"
            onclick={cancelEditLocalEdits}
            disabled={!hasUnsavedChanges || isSaving || isLoadingRows}
          >
            {t("actions.cancel", "取消")}
          </button>
        </div>


        <div class="panel-body">
          {#if !isLoadingTabs && getEditLocalActiveTab()}
            <div class="active-file-label">
              {t("labels.currentFile", "当前文件")}:
              <span>{getEditLocalActiveTab()?.relativePath}</span>

              {#if hasUnsavedChanges}
                <strong class="dirty-indicator">
                  {t("labels.unsaved", "未保存更改")}
                </strong>
              {/if}
            </div>
          {/if}

          {#if editLocalSaveMessage}
            <div class="save-state success-state">{editLocalSaveMessage}</div>
          {/if}

          {#if isLoadingRows}
            <div class="empty-state">
              {t("rows.loading", "正在加载文件内容…")}
            </div>
          {:else if editLocalError}
            <div class="error-state">{editLocalError}</div>
          {:else if visibleEditLocalRows.length === 0}
            <div class="empty-state">
              {editShowAllRows
                ? t("rows.empty", "此文件没有可显示的条目。")
                : t("rows.searchPrompt", "输入搜索内容，或点击“查看全部”显示所有条目。")}
            </div>
          {:else}
            <div class="results-table">
              <div class="results-header">
                <div>{t("columns.id", "ID / 键")}</div>
                <div>{t("columns.baseName", "基础名称 (CN)")}</div>
                <div>{t("columns.localName", "当前语言名称")}</div>
                <div>{t("columns.localNote", "当前语言备注")}</div>
              </div>

              {#each visibleEditLocalRows as row}
                <div class="results-row">
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
          {/if}
        </div>
      </div>
    {:else if activeSection === "compareMerge"}
      <div class="panel">
        <div class="tab-box">
          <div class="file-tabs">
            {#if isLoadingTabs}
              <div class="tab-message">
                {t("tabs.loading", "正在加载翻译文件…")}
              </div>
            {:else if compareMergeTabs.length === 0}
              <div class="tab-message">
                {t("tabs.empty", "暂未发现可用的翻译 JSON 文件。")}
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
              placeholder={t("search.placeholder", "搜索 ID、名称或备注…")}
            />
          </div>

          <button type="button" onclick={toggleCompareViewAll}>
            {compareShowAllRows
              ? t("actions.hideAll", "隐藏全部")
              : t("actions.viewAll", "查看全部")}
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
              {t("labels.currentFile", "当前文件")}:
              <span>{getCompareMergeActiveTab()?.relativePath}</span>

              {#if compareImportedFileName}
                <span class="compare-file-pill">
                  {t("compare.compareFile", "对比文件")}: {compareImportedFileName}
                </span>
              {/if}

              {#if compareHasUnsavedChanges}
                <strong class="dirty-indicator">
                  {t("labels.unsaved", "未保存更改")}
                </strong>
              {/if}
            </div>
          {/if}

          <div class="compare-secondary-actions">
            <button type="button" onclick={openCompareFilePicker}>
              {t("compare.loadJson", "加载对比 JSON")}
            </button>

            <button
              type="button"
              onclick={clearCompareFile}
              disabled={!compareImportedRawJson}
            >
              {t("compare.clearJson", "清除对比文件")}
            </button>
          </div>

          <div class="compare-primary-actions">
            <button
              type="button"
              class:toggle-active={compareDifferencesOnly}
              onclick={() => (compareDifferencesOnly = !compareDifferencesOnly)}
              disabled={!compareImportedRawJson}
            >
              {t("actions.differencesOnly", "仅显示差异")}
            </button>

            <button
              type="button"
              onclick={applySelectedCompareChanges}
              disabled={!compareImportedRawJson || selectedCompareFieldCount === 0}
            >
              {t("compare.applySelected", "应用所选更改")}
            </button>

            <button
              type="button"
              class="save-button"
              onclick={saveCompareMergedFile}
              disabled={!compareHasUnsavedChanges || isSavingCompare || isLoadingCompareRows}
            >
              {isSavingCompare
                ? t("actions.saving", "保存中…")
                : t("compare.saveMerged", "保存合并结果")}
            </button>

            <button
              type="button"
              onclick={cancelCompareMergedEdits}
              disabled={!compareHasUnsavedChanges || isSavingCompare || isLoadingCompareRows}
            >
              {t("actions.cancel", "取消")}
            </button>
          </div>

          {#if compareSaveMessage}
            <div class="save-state success-state">{compareSaveMessage}</div>
          {/if}

          {#if isLoadingCompareRows}
            <div class="empty-state">
              {t("rows.loading", "正在加载文件内容…")}
            </div>
          {:else if compareError}
            <div class="error-state">{compareError}</div>
          {:else if !compareImportedRawJson}
            <div class="empty-state">
              {t(
                "compare.loadPrompt",
                "加载一个对比 JSON 文件以查看差异并选择要合并的字段。",
              )}
            </div>
          {:else if visibleCompareRows.length === 0}
            <div class="empty-state">
              {compareShowAllRows
                ? t("rows.empty", "此文件没有可显示的条目。")
                : t(
                    "compare.noMatches",
                    "当前筛选条件下没有可显示的对比结果。",
                  )}
            </div>
          {:else}
            <div class="compare-table">
              <div class="compare-header">
                <div>{t("columns.id", "ID / 键")}</div>
                <div>{t("columns.baseName", "基础名称 (CN)")}</div>
                <div>{t("compare.localName", "当前名称")}</div>
                <div>{t("compare.compareName", "对比名称")}</div>
                <div>{t("compare.mergeName", "合并名称")}</div>
                <div>{t("compare.mergeRow", "整行")}</div>
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
          {/if}
        </div>
      </div>
    {:else}
      <div class="panel">
        <div class="settings-debug-panel">
          <div class="settings-group">
            <div class="settings-group-header settings-group-header-inline">
              <div class="settings-title-with-icon">
                <h2>{t("settings.translationDebug.title", "翻译调试设置")}</h2>
                <button
                  type="button"
                  class="settings-info-icon-button"
                  class:active={showTranslationGenerateInfo}
                  aria-label={tn("debug.generateInfoButton", "点击查看“生成”行为说明")}
                  title={tn("debug.generateInfoButton", "点击查看“生成”行为说明")}
                  onclick={() => (showTranslationGenerateInfo = !showTranslationGenerateInfo)}
                >
                  ⓘ
                </button>
              </div>
            </div>

            {#if showTranslationGenerateInfo}
              <div class="settings-info-panel">
                <div class="settings-debug-info-title">
                  {tn("debug.generateInfoTitle", "点击“生成”后会发生什么？")}
                </div>
                {translationGenerateInfoText()}
              </div>
            {/if}

            <div class="settings-debug-body">
              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {t("settings.visibility.uiJsons.title", "UI / 搜索 JSON 标签页")}
                  </div>
                  <div class="settings-debug-description">
                    {t("settings.visibility.uiJsons.description", "在“本地编辑”和“对比 / 合并”中显示或隐藏 UI 与搜索 JSON 行。")}
                  </div>
                </div>

                <button type="button" onclick={() => (showUiJsonTabs = !showUiJsonTabs)}>
                  {showUiJsonTabs
                    ? t("settings.visibility.uiJsons.hide", "隐藏 UI / 搜索 JSON")
                    : t("settings.visibility.uiJsons.show", "显示 UI / 搜索 JSON")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.repairRuntimeLocaleTitle", "修复运行时语言环境文件夹")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.repairRuntimeLocaleDescription", "检查并修复应用数据中的运行时语言环境文件夹，补齐缺失的清单、目录与文件，并仅回填缺失项而不覆盖现有翻译。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={repairRuntimeLocaleFolder}
                  disabled={isRepairingRuntimeLocaleFolder}
                >
                  {isRepairingRuntimeLocaleFolder
                    ? t("actions.processing", "处理中…")
                    : tn("debug.repairRuntimeLocaleButton", "修复运行时语言环境文件夹")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.translationOpenTitle", "打开翻译文件夹")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.translationOpenDescription", "打开应用数据中的运行时翻译目录。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={openTranslationDataDir}
                  disabled={isOpeningTranslationDir}
                >
                  {isOpeningTranslationDir
                    ? t("actions.processing", "处理中…")
                    : tn("debug.translationOpenButton", "打开翻译文件夹")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.generateAllUiTitle", "生成全部 UI 运行时文件")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.generateAllUiDescription", "根据源码 UI 文件结构，为所有 UI 工具 / 功能文件生成或补齐对应的运行时文件，并保留其他语言的已有翻译。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={generateAllUiTranslationScaffolds}
                  disabled={isGeneratingAllUiTranslations}
                >
                  {isGeneratingAllUiTranslations
                    ? t("actions.processing", "处理中…")
                    : tn("debug.generateAllUiButton", "生成全部 UI 文件")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.generateBuffNameSearchTitle", "生成 BuffNameSearch 运行时文件")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.generateBuffNameSearchDescription", "根据 src/lib/config/BuffName.json 在 AppData 中生成或更新各语言的 search/BuffNameSearch.json 运行时文件。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={generateBuffNameSearchScaffold}
                  disabled={isGeneratingBuffNameSearch}
                >
                  {isGeneratingBuffNameSearch
                    ? t("actions.processing", "处理中…")
                    : tn("debug.generateBuffNameSearchButton", "生成 BuffNameSearch")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.generateBuffNameTitle", "生成 BuffName 运行时文件")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.generateBuffNameDescription", "根据 src/lib/config/BuffName.json 在 AppData 中生成或更新各语言的 parser/BuffName.json 运行时文件。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={generateBuffNameTranslationScaffold}
                  disabled={isGeneratingBuffNameTranslation}
                >
                  {isGeneratingBuffNameTranslation
                    ? t("actions.processing", "处理中…")
                    : tn("debug.generateBuffNameButton", "生成 BuffName")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.generateSceneNameTitle", "生成 SceneName 运行时文件")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.generateSceneNameDescription", "根据 src-tauri/meter-data/SceneName.json 在 AppData 中生成或更新各语言的 parser/SceneName.json 运行时文件。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={generateSceneNameTranslationScaffold}
                  disabled={isGeneratingSceneNameTranslation}
                >
                  {isGeneratingSceneNameTranslation
                    ? t("actions.processing", "处理中…")
                    : tn("debug.generateSceneNameButton", "生成 SceneName")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.generateMonsterNameTitle", "生成 MonsterName 运行时文件")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.generateMonsterNameDescription", "根据 src-tauri/meter-data/MonsterIdNameType.json 在 AppData 中生成或更新各语言的 parser/MonsterName.json 运行时文件。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={generateMonsterNameTranslationScaffold}
                  disabled={isGeneratingMonsterNameTranslation}
                >
                  {isGeneratingMonsterNameTranslation
                    ? t("actions.processing", "处理中…")
                    : tn("debug.generateMonsterNameButton", "生成 MonsterName")}
                </button>
              </div>

              <div class="settings-debug-row">
                <div class="settings-debug-copy">
                  <div class="settings-debug-title">
                    {tn("debug.generateSkillNamesTitle", "生成技能翻译运行时文件")}
                  </div>
                  <div class="settings-debug-description">
                    {tn("debug.generateSkillNamesDescription", "根据 RecountTable.json、DamageAttrIdName.json、SkillEffectTable.json、SkillFightLevelTable.json 与 TempAttrTable.json，在 AppData 中生成或更新各语言的 parser/skillnames.json 运行时文件。")}
                  </div>
                </div>

                <button
                  type="button"
                  onclick={generateSkillNameTranslationScaffold}
                  disabled={isGeneratingSkillNameTranslation}
                >
                  {isGeneratingSkillNameTranslation
                    ? t("actions.processing", "处理中…")
                    : tn("debug.generateSkillNamesButton", "生成技能翻译")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .localization-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    height: calc(100vh - 132px);
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  .localization-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .localization-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }

  .localization-header p {
    margin: 0;
    opacity: 0.8;
    font-size: 14px;
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
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
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
    z-index: 1;
    font-size: 12px;
    opacity: 0.9;
    font-weight: 600;
    padding: 0 4px 8px;
    background: rgba(33, 33, 33, 0.96);
    backdrop-filter: blur(4px);
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

  .settings-debug-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .settings-group-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .settings-group-header-inline {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .settings-group-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }

  .settings-title-with-icon {
    display: inline-flex;
    align-items: center;
    gap: 8px;
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

  @media (max-width: 900px) {
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