<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { onMount } from "svelte";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";

  import { Button } from "$lib/components/ui/button/index.js";
  import {
    buildLoggerDisplayLabel,
    loggerCategoryToDefinitionType,
    resolveLoggerEntryName,
  } from "$lib/custom-trigger-resolver";
  import {
    customDefinitions,
    loadCustomDefinitions,
    upsertCustomDefinition,
    type CustomDefinitionType,
  } from "$lib/custom-definitions-store";
  import { setEventLoggerAlwaysOnTop } from "$lib/event-logger-window";
  import type {
    EventLoggerBatchPayload,
    EventLoggerEntry,
    LoggerDisplayMode,
    LoggerCategory,
  } from "$lib/event-logger-types";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  const t = uiT("custom-triggers/logger", () => SETTINGS.live.general.state.language);

  type DisplayRow = EventLoggerEntry & { localId: number };
  type ContextMenuState = { x: number; y: number; row: DisplayRow } | null;
  type HeaderMenuState = { x: number; y: number; column: ColumnKey } | null;
  type DetailsTab = "details" | "filters" | "settings";
  type SortDirection = "asc" | "desc";
  type ColumnKey =
    | "time"
    | "category"
    | "action"
    | "name"
    | "known"
    | "uid"
    | "source"
    | "target"
    | "stacks"
    | "duration"
    | "summary";

  const columnOrder: ColumnKey[] = [
    "time",
    "category",
    "action",
    "name",
    "known",
    "uid",
    "source",
    "target",
    "stacks",
    "duration",
    "summary",
  ];

  const columnMinimumWidths: Record<ColumnKey, number> = {
    time: 28,
    category: 28,
    action: 28,
    name: 28,
    known: 28,
    uid: 28,
    source: 28,
    target: 28,
    stacks: 28,
    duration: 28,
    summary: 28,
  };

  const defaultColumnVisibility: Record<ColumnKey, boolean> = {
    time: true,
    category: true,
    action: true,
    name: true,
    known: true,
    uid: true,
    source: true,
    target: true,
    stacks: true,
    duration: true,
    summary: true,
  };

  const loggerCategories: Array<{ key: LoggerCategory; label: string; enabledByDefault: boolean }> = [
    { key: "buff", label: "Buff", enabledByDefault: true },
    { key: "monster_buff", label: "Monster Buff", enabledByDefault: true },
    { key: "skill", label: "Skill", enabledByDefault: true },
    { key: "skill_cd", label: "Skill CD", enabledByDefault: true },
    { key: "counter", label: "Counter", enabledByDefault: true },
    { key: "encounter", label: "Encounter", enabledByDefault: true },
    { key: "scene", label: "Scene", enabledByDefault: true },
    { key: "system", label: "System", enabledByDefault: true },
    { key: "hate", label: "Hate", enabledByDefault: true },
    { key: "chat", label: "Chat", enabledByDefault: true },
    { key: "item_drop", label: "Item Drop", enabledByDefault: true },
    { key: "live_totals", label: "Live Totals", enabledByDefault: true },
    { key: "boss_hp", label: "Boss HP", enabledByDefault: true },
    { key: "player", label: "Player", enabledByDefault: true },
    { key: "mob", label: "Mob", enabledByDefault: true },
    { key: "player_skill_damage", label: "Player Skill Damage", enabledByDefault: true },
    { key: "player_skill_heal", label: "Player Skill Heal", enabledByDefault: true },
    { key: "player_skill_taken", label: "Player Skill Taken", enabledByDefault: true },
    { key: "player_target_damage", label: "Player Target Damage", enabledByDefault: true },
    { key: "player_target_skill_damage", label: "Player Target Skill Damage", enabledByDefault: true },
    { key: "player_target_skill_heal", label: "Player Target Skill Heal", enabledByDefault: true },
  ];

  const defaultCategorySelections = Object.fromEntries(
    loggerCategories.map((item) => [item.key, item.enabledByDefault]),
  );

  function ensureLoggerSettingsShape() {
    SETTINGS.customTriggers.state.loggerVisibleColumns ??= { ...defaultColumnVisibility };
    SETTINGS.customTriggers.state.loggerStartWithMeter ??= false;
    SETTINGS.customTriggers.state.loggerReduceClutter ??= true;
  }

  ensureLoggerSettingsShape();

  let columnWidths = $state<Record<ColumnKey, number>>({
    time: 96,
    category: 84,
    action: 92,
    name: 180,
    known: 72,
    uid: 84,
    source: 92,
    target: 92,
    stacks: 70,
    duration: 70,
    summary: 220,
  });

  let rows = $state<DisplayRow[]>([]);
  let selectedRowId = $state<number | null>(null);
  let searchText = $state("");
  let paused = $state(false);
  let contextMenu = $state<ContextMenuState>(null);
  let headerMenu = $state<HeaderMenuState>(null);
  let copyToast = $state<{ text: string; x: number; y: number } | null>(null);
  let detailsTab = $state<DetailsTab>("details");
  let definitionEditor = $state<{
    row: DisplayRow;
    uid: number;
    type: CustomDefinitionType;
    name: string;
    notes: string;
  } | null>(null);
  let categorySelections = $state<Record<string, boolean>>({
    ...defaultCategorySelections,
  });
  let actionSelections = $state<Record<string, boolean>>({});
  let knownSelections = $state({ known: true, unknown: true });
  let sortState = $state<{ column: ColumnKey | null; direction: SortDirection }>({
    column: null,
    direction: "asc",
  });

  let queue: EventLoggerEntry[] = [];
  let nextRowId = 1;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let copyToastTimer: ReturnType<typeof setTimeout> | null = null;

  const loggerWindow = getCurrentWebviewWindow();

  function normalizeText(value: string | null | undefined): string {
    return value?.trim() ?? "";
  }

  function normalizeLabel(value: string | null | undefined): string {
    const trimmed = normalizeText(value);
    if (!trimmed) return "";
    if (/^null\d*$/i.test(trimmed)) return "";
    if (/^undefined$/i.test(trimmed)) return "";
    return trimmed;
  }

  function formatTime(tsMs: number): string {
    const date = new Date(tsMs);
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
    return `${time}.${milliseconds}`;
  }

  function formatDuration(durationMs: number | null | undefined): string {
    if (!Number.isFinite(Number(durationMs))) return t("meta.none", "—");
    const value = Number(durationMs);
    if (value < 1000) return `${value}ms`;
    return `${(value / 1000).toFixed(1)}s`;
  }

  function isKnownEntry(row: DisplayRow): boolean {
    return Boolean(getPreferredName(row));
  }

  function getCategoryLabel(category: string): string {
    return t(`controls.category.${category}`, category);
  }

  function getResolvedName(row: DisplayRow): string {
    return resolveLoggerEntryName(row, SETTINGS.live.general.state.language, $customDefinitions);
  }

  function getPreferredName(row: DisplayRow): string {
    const resolved = normalizeLabel(getResolvedName(row));
    const uid = Number.isFinite(Number(row.uid)) ? String(row.uid) : "";
    if (!resolved) return "";
    if (uid && resolved === uid) return "";
    return resolved;
  }

  function getDisplayLabel(row: DisplayRow): string {
    return buildLoggerDisplayLabel(
      row,
      SETTINGS.live.general.state.language,
      SETTINGS.customTriggers.state.loggerDisplayMode as LoggerDisplayMode,
      $customDefinitions,
    );
  }

  function getNameCellText(row: DisplayRow): string {
    const mode = SETTINGS.customTriggers.state.loggerDisplayMode as LoggerDisplayMode;
    if (mode === "uid") return "";
    return getPreferredName(row);
  }

  function shouldShowUidChip(row: DisplayRow): boolean {
    if (!Number.isFinite(Number(row.uid))) return false;

    const mode = SETTINGS.customTriggers.state.loggerDisplayMode as LoggerDisplayMode;
    const explicitName = getPreferredName(row);

    if (mode === "uid") return true;
    if (mode === "name_uid") return true;
    return !explicitName;
  }

  function getSummary(row: DisplayRow): string {
    return (
      normalizeText(row.summary) ||
      normalizeText(row.value) ||
      normalizeText(row.nameHint) ||
      t("meta.none", "—")
    );
  }

  function getKnownLabel(row: DisplayRow): string {
    return isKnownEntry(row) ? t("status.known", "Known") : t("status.unknown", "Unknown");
  }

  function getSourceText(row: DisplayRow): string {
    return (
      normalizeLabel(row.sourceLabel) ||
      (Number.isFinite(Number(row.sourceUid)) ? String(row.sourceUid) : t("meta.none", "—"))
    );
  }

  function getTargetText(row: DisplayRow): string {
    return (
      normalizeLabel(row.targetLabel) ||
      (Number.isFinite(Number(row.targetUid)) ? String(row.targetUid) : t("meta.none", "—"))
    );
  }

  function getColumnLabel(columnKey: ColumnKey): string {
    switch (columnKey) {
      case "time":
        return t("table.time", "Time");
      case "category":
        return t("table.category", "Category");
      case "action":
        return t("table.action", "Action");
      case "name":
        return t("table.name", "Name");
      case "known":
        return t("table.known", "Known");
      case "uid":
        return t("table.uid", "UID");
      case "source":
        return t("table.source", "Source");
      case "target":
        return t("table.target", "Target");
      case "stacks":
        return t("table.stacks", "Stacks");
      case "duration":
        return t("table.duration", "Duration");
      case "summary":
        return t("table.summary", "Summary");
    }
  }


  function sanitizeRawForFingerprint(raw: unknown): unknown {
    if (typeof raw === "string") {
      return raw;
    }
    if (!raw || typeof raw !== "object") {
      return raw ?? null;
    }
    if (Array.isArray(raw)) {
      return raw.map((value) => sanitizeRawForFingerprint(value));
    }

    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key === "tsMs" || key === "timestamp" || key === "time") continue;
      next[key] = sanitizeRawForFingerprint(value);
    }
    return next;
  }

  function getEntryFingerprint(entry: EventLoggerEntry | DisplayRow): string {
    return JSON.stringify({
      category: entry.category ?? null,
      action: entry.action ?? null,
      uid: entry.uid ?? null,
      sourceUid: entry.sourceUid ?? null,
      targetUid: entry.targetUid ?? null,
      nameHint: entry.nameHint ?? null,
      sourceLabel: entry.sourceLabel ?? null,
      targetLabel: entry.targetLabel ?? null,
      value: entry.value ?? null,
      summary: entry.summary ?? null,
      stacks: entry.stacks ?? null,
      durationMs: entry.durationMs ?? null,
      raw: sanitizeRawForFingerprint(entry.raw ?? null),
    });
  }

  function dedupeAdjacentEntries<T extends EventLoggerEntry>(entries: T[], previousEntry?: EventLoggerEntry | DisplayRow | null): T[] {
    if (!SETTINGS.customTriggers.state.loggerReduceClutter) return entries;

    const deduped: T[] = [];
    let previousFingerprint = previousEntry ? getEntryFingerprint(previousEntry) : null;

    for (const entry of entries) {
      const nextFingerprint = getEntryFingerprint(entry);
      if (nextFingerprint === previousFingerprint) {
        continue;
      }
      deduped.push(entry);
      previousFingerprint = nextFingerprint;
    }

    return deduped;
  }

  function isColumnVisible(columnKey: ColumnKey): boolean {
    return SETTINGS.customTriggers.state.loggerVisibleColumns?.[columnKey] !== false;
  }

  function setColumnVisible(columnKey: ColumnKey, visible: boolean) {
    SETTINGS.customTriggers.state.loggerVisibleColumns = {
      ...SETTINGS.customTriggers.state.loggerVisibleColumns,
      [columnKey]: visible,
    };
  }

  function startColumnResize(columnKey: ColumnKey, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnKey];
    const minWidth = columnMinimumWidths[columnKey];

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = startWidth + (moveEvent.clientX - startX);
      columnWidths = {
        ...columnWidths,
        [columnKey]: Math.max(minWidth, Math.round(nextWidth)),
      };
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function openHeaderMenu(column: ColumnKey, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    headerMenu = { x: event.clientX, y: event.clientY, column };
    contextMenu = null;
  }

  function getColumnSortValue(row: DisplayRow, column: ColumnKey): string | number {
    switch (column) {
      case "time":
        return row.tsMs ?? 0;
      case "category":
        return getCategoryLabel(row.category).toLowerCase();
      case "action":
        return normalizeText(row.action).toLowerCase();
      case "name":
        return (getPreferredName(row) || String(row.uid ?? "")).toLowerCase();
      case "known":
        return isKnownEntry(row) ? 1 : 0;
      case "uid":
        return Number(row.uid ?? Number.NEGATIVE_INFINITY);
      case "source":
        return getSourceText(row).toLowerCase();
      case "target":
        return getTargetText(row).toLowerCase();
      case "stacks":
        return Number(row.stacks ?? Number.NEGATIVE_INFINITY);
      case "duration":
        return Number(row.durationMs ?? Number.NEGATIVE_INFINITY);
      case "summary":
        return getSummary(row).toLowerCase();
    }
  }

  function toggleSort(column: ColumnKey) {
    if (!paused) return;
    if (sortState.column === column) {
      sortState = {
        column,
        direction: sortState.direction === "asc" ? "desc" : "asc",
      };
    } else {
      sortState = { column, direction: "asc" };
    }
    headerMenu = null;
  }

  function hideColumn(column: ColumnKey) {
    setColumnVisible(column, false);
    headerMenu = null;
  }

  function selectRow(row: DisplayRow) {
    selectedRowId = row.localId;
    contextMenu = null;
  }

  function toggleAllCategories(nextValue: boolean) {
    categorySelections = Object.fromEntries(
      loggerCategories.map((item) => [item.key, nextValue]),
    );
  }

  function setCategorySelected(category: string, nextValue: boolean) {
    categorySelections = {
      ...categorySelections,
      [category]: nextValue,
    };
  }

  function toggleAllActions(nextValue: boolean) {
    actionSelections = Object.fromEntries(
      availableActions.map((action) => [action, nextValue]),
    );
  }

  function setActionSelected(action: string, nextValue: boolean) {
    actionSelections = {
      ...actionSelections,
      [action]: nextValue,
    };
  }

  function toggleAllKnownStates(nextValue: boolean) {
    knownSelections = { known: nextValue, unknown: nextValue };
  }

  const selectedRow = $derived(rows.find((row) => row.localId === selectedRowId) ?? null);

  const allCategoriesSelected = $derived(
    loggerCategories.every((item) => categorySelections[item.key] !== false),
  );

  const availableActions = $derived.by(() =>
    Array.from(new Set(rows.map((row) => normalizeText(row.action)).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
  );

  const allActionsSelected = $derived(
    availableActions.length === 0 || availableActions.every((action) => actionSelections[action] !== false),
  );

  const allKnownStatesSelected = $derived(knownSelections.known && knownSelections.unknown);

  const visibleColumns = $derived(columnOrder.filter((columnKey) => isColumnVisible(columnKey)));

  const filteredRows = $derived.by(() => {
    const keyword = searchText.trim().toLowerCase();

    const nextRows = rows.filter((row) => {
      if (categorySelections[row.category] === false) {
        return false;
      }

      if (actionSelections[row.action] === false) {
        return false;
      }

      if (isKnownEntry(row) && !knownSelections.known) {
        return false;
      }

      if (!isKnownEntry(row) && !knownSelections.unknown) {
        return false;
      }

      if (!keyword) return true;

      const haystack = [
        getDisplayLabel(row),
        row.category,
        row.action,
        String(row.uid ?? ""),
        getSourceText(row),
        getTargetText(row),
        getSummary(row),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });

    if (!sortState.column) {
      return [...nextRows].reverse();
    }

    const sorted = [...nextRows].sort((a, b) => {
      const aValue = getColumnSortValue(a, sortState.column!);
      const bValue = getColumnSortValue(b, sortState.column!);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return aValue - bValue;
      }

      return String(aValue).localeCompare(String(bValue), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    return sortState.direction === "asc" ? sorted : sorted.reverse();
  });

  const selectedRowRaw = $derived.by(() => {
    if (!selectedRow) return "";
    const raw = selectedRow.raw ?? selectedRow;
    return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  });

  const contextMenuRow = $derived(contextMenu?.row ?? null);
  const tableMinWidth = $derived.by(() =>
    visibleColumns.reduce((sum, columnKey) => sum + columnWidths[columnKey], 0),
  );

  function showToast(message: string, x?: number, y?: number) {
    if (copyToastTimer) {
      clearTimeout(copyToastTimer);
    }

    copyToast = {
      text: message,
      x: (x ?? 24) + 14,
      y: (y ?? 24) + 14,
    };

    copyToastTimer = setTimeout(() => {
      copyToast = null;
      copyToastTimer = null;
    }, 850);
  }

  async function copyWithFeedback(text: string, message: string, x?: number, y?: number) {
    await writeText(text);
    showToast(message, x, y);
  }

  async function copyUid(row: DisplayRow, event?: MouseEvent) {
    if (!Number.isFinite(Number(row.uid))) return;
    await copyWithFeedback(
      String(row.uid),
      t("copy.uid", "Copied UID"),
      event?.clientX,
      event?.clientY,
    );
    contextMenu = null;
  }

  async function copyName(row: DisplayRow, event?: MouseEvent) {
    await copyWithFeedback(
      getPreferredName(row) || String(row.uid ?? ""),
      t("copy.name", "Copied name"),
      event?.clientX,
      event?.clientY,
    );
    contextMenu = null;
  }

  async function copyUidAndName(row: DisplayRow, event?: MouseEvent) {
    const preferredName = getPreferredName(row);
    const value = [preferredName, row.uid ? `(${row.uid})` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();
    await copyWithFeedback(
      value || String(row.uid ?? ""),
      t("copy.uidName", "Copied UID + name"),
      event?.clientX,
      event?.clientY,
    );
    contextMenu = null;
  }

  async function copySummary(row: DisplayRow, event?: MouseEvent) {
    await copyWithFeedback(
      getSummary(row),
      t("copy.summary", "Copied summary"),
      event?.clientX,
      event?.clientY,
    );
    contextMenu = null;
  }

  async function copyRaw(row: DisplayRow, event?: MouseEvent) {
    const raw = row.raw ?? row;
    await copyWithFeedback(
      typeof raw === "string" ? raw : JSON.stringify(raw, null, 2),
      t("copy.raw", "Copied raw event"),
      event?.clientX,
      event?.clientY,
    );
    contextMenu = null;
  }

  function openDefinitionEditor(row: DisplayRow) {
    if (!Number.isFinite(Number(row.uid))) return;
    definitionEditor = {
      row,
      uid: Number(row.uid),
      type: loggerCategoryToDefinitionType(row.category),
      name: resolveLoggerEntryName(row, SETTINGS.live.general.state.language, $customDefinitions),
      notes: "",
    };
    contextMenu = null;
  }

  async function saveDefinition() {
    if (!definitionEditor) return;

    const saved = await upsertCustomDefinition({
      uid: definitionEditor.uid,
      type: definitionEditor.type,
      name: definitionEditor.name,
      notes: definitionEditor.notes,
    });

    if (saved) {
      showToast(t("context.saveDefinition", "Save as custom definition"), 40, 40);
      definitionEditor = null;
    }
  }

  async function flushQueue() {
    if (paused || queue.length === 0) return;

    const drainedQueue = queue.splice(0, queue.length);
    const previousEntry = rows.at(-1) ?? null;
    const pending = dedupeAdjacentEntries(drainedQueue, previousEntry).map((entry) => ({
      ...entry,
      localId: nextRowId++,
    }));

    if (pending.length === 0) return;

    const nextRows = [...rows, ...pending];
    const maxRows = Math.max(
      100,
      Math.min(5000, Number(SETTINGS.customTriggers.state.loggerBufferSize) || 1000),
    );
    rows = nextRows.slice(-maxRows);

    if (selectedRowId && !rows.some((row) => row.localId === selectedRowId)) {
      selectedRowId = rows.at(-1)?.localId ?? null;
    }

  }

  async function clearRows() {
    rows = [];
    queue = [];
    selectedRowId = null;
    await invoke("clear_event_logger_buffer");
  }

  function openContextMenu(event: MouseEvent, row: DisplayRow) {
    event.preventDefault();
    selectRow(row);
    contextMenu = { x: event.clientX, y: event.clientY, row };
    headerMenu = null;
  }

  async function applyAlwaysOnTop(nextValue: boolean) {
    SETTINGS.customTriggers.state.loggerAlwaysOnTop = nextValue;
    await setEventLoggerAlwaysOnTop(nextValue);
  }

  async function hydrateFromBuffer() {
    try {
      const payload = await invoke<EventLoggerBatchPayload>("read_event_logger_buffer");
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      const dedupedEntries = dedupeAdjacentEntries(entries);
      rows = dedupedEntries.map((entry) => ({ ...entry, localId: nextRowId++ }));
      selectedRowId = rows.at(-1)?.localId ?? null;
    } catch (error) {
      console.error("[event-logger] failed to hydrate logger buffer", error);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | null = null;
    let unlistenClose: (() => void) | null = null;

    void (async () => {
      await loadCustomDefinitions();
      await setEventLoggerAlwaysOnTop(SETTINGS.customTriggers.state.loggerAlwaysOnTop);
      await hydrateFromBuffer();
      unlisten = await listen<EventLoggerBatchPayload>("event-logger-batch", (event) => {
        if (Array.isArray(event.payload?.entries)) {
          queue.push(...event.payload.entries);
        }
      });
      unlistenClose = await loggerWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await loggerWindow.hide();
      });
    })();

    const dismissMenus = () => {
      contextMenu = null;
      headerMenu = null;
    };

    window.addEventListener("click", dismissMenus);

    flushTimer = setInterval(() => {
      void flushQueue();
    }, 75);

    return () => {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      if (copyToastTimer) {
        clearTimeout(copyToastTimer);
        copyToastTimer = null;
      }
      if (unlisten) {
        unlisten();
      }
      if (unlistenClose) {
        unlistenClose();
      }
      window.removeEventListener("click", dismissMenus);
    };
  });
</script>

<div class="flex h-screen flex-col bg-background text-foreground">
  <header class="border-b border-border/60 bg-card/85 px-4 py-3 shadow-sm backdrop-blur">
    <div class="flex flex-wrap items-center gap-2">
      <input
        bind:value={searchText}
        class="min-w-[220px] flex-1 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
        placeholder={t("controls.search", "Search")}
      />

      <div class="flex items-center gap-1 rounded-md border border-border/60 bg-background p-1">
        <Button
          size="sm"
          variant={SETTINGS.customTriggers.state.loggerDisplayMode === "name" ? "default" : "ghost"}
          onclick={() => (SETTINGS.customTriggers.state.loggerDisplayMode = "name")}
        >
          {t("controls.displayMode", "Display mode")} · {t("displayMode.name", "Name")}
        </Button>
        <Button
          size="sm"
          variant={SETTINGS.customTriggers.state.loggerDisplayMode === "name_uid" ? "default" : "ghost"}
          onclick={() => (SETTINGS.customTriggers.state.loggerDisplayMode = "name_uid")}
        >
          {t("displayMode.nameUid", "Name + UID")}
        </Button>
        <Button
          size="sm"
          variant={SETTINGS.customTriggers.state.loggerDisplayMode === "uid" ? "default" : "ghost"}
          onclick={() => (SETTINGS.customTriggers.state.loggerDisplayMode = "uid")}
        >
          {t("displayMode.uid", "UID")}
        </Button>
      </div>

      <Button variant="outline" onclick={() => (paused = !paused)}>
        {paused ? t("controls.resume", "Resume") : t("controls.pause", "Pause")}
      </Button>
      <Button variant="outline" onclick={() => void clearRows()}>{t("controls.clear", "Clear")}</Button>
    </div>
  </header>

  <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
    <section class="min-h-0 border-r border-border/60">
      <div class="h-full overflow-auto">
        <table class="w-full border-collapse text-sm table-fixed" style={`min-width:${tableMinWidth}px`}>
          <colgroup>
            {#each visibleColumns as columnKey (columnKey)}
              <col style={`width:${columnWidths[columnKey]}px;`} />
            {/each}
          </colgroup>
          <thead class="sticky top-0 z-10 bg-card/95 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              {#each visibleColumns as columnKey (columnKey)}
                <th
                  class="group relative border-r border-border/40 px-3 py-2 last:border-r-0"
                  oncontextmenu={(event) => openHeaderMenu(columnKey, event)}
                >
                  <div class="pr-3">{getColumnLabel(columnKey)}</div>
                  <button
                    type="button"
                    class="absolute top-0 right-0 h-full w-3 cursor-col-resize opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Resize ${getColumnLabel(columnKey)} column`}
                    onmousedown={(event) => startColumnResize(columnKey, event)}
                  >
                    <span class="mx-auto block h-full w-px bg-border/70"></span>
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each filteredRows as row (row.localId)}
              <tr
                class={`cursor-default border-t border-border/40 align-top transition-colors ${selectedRowId === row.localId ? "bg-muted/60" : "hover:bg-muted/30"}`}
                onclick={() => selectRow(row)}
                oncontextmenu={(event) => openContextMenu(event, row)}
              >
                {#each visibleColumns as columnKey (columnKey)}
                  {#if columnKey === "time"}
                    <td class="px-3 py-2 font-mono text-xs select-text whitespace-nowrap">{formatTime(row.tsMs)}</td>
                  {:else if columnKey === "category"}
                    <td class="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{getCategoryLabel(row.category)}</td>
                  {:else if columnKey === "action"}
                    <td class="px-3 py-2 text-xs uppercase text-muted-foreground whitespace-nowrap">{row.action}</td>
                  {:else if columnKey === "name"}
                    <td class="px-3 py-2 select-text">
                      <div class="flex items-center gap-2 overflow-hidden">
                        {#if getNameCellText(row)}
                          <span class="truncate font-medium">{getNameCellText(row)}</span>
                        {/if}
                        {#if shouldShowUidChip(row)}
                          <button
                            type="button"
                            class="shrink-0 rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                            onclick={(event) => {
                              event.stopPropagation();
                              void copyUid(row, event);
                            }}
                            title={t("context.copyUid", "Copy UID")}
                          >
                            {row.uid}
                          </button>
                        {/if}
                        {#if !getNameCellText(row) && !shouldShowUidChip(row)}
                          <span class="truncate font-medium text-muted-foreground">{t("meta.none", "—")}</span>
                        {/if}
                      </div>
                    </td>
                  {:else if columnKey === "known"}
                    <td class="px-3 py-2 whitespace-nowrap">
                      <span class={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${isKnownEntry(row) ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-300"}`}>
                        {getKnownLabel(row)}
                      </span>
                    </td>
                  {:else if columnKey === "uid"}
                    <td class="px-3 py-2 font-mono text-xs select-text whitespace-nowrap">{row.uid ?? t("meta.none", "—")}</td>
                  {:else if columnKey === "source"}
                    <td class="px-3 py-2 font-mono text-xs select-text whitespace-nowrap">{getSourceText(row)}</td>
                  {:else if columnKey === "target"}
                    <td class="px-3 py-2 font-mono text-xs select-text whitespace-nowrap">{getTargetText(row)}</td>
                  {:else if columnKey === "stacks"}
                    <td class="px-3 py-2 font-mono text-xs select-text whitespace-nowrap">{row.stacks ?? t("meta.none", "—")}</td>
                  {:else if columnKey === "duration"}
                    <td class="px-3 py-2 font-mono text-xs select-text whitespace-nowrap">{formatDuration(row.durationMs)}</td>
                  {:else if columnKey === "summary"}
                    <td class="px-3 py-2 text-xs text-muted-foreground select-text">{getSummary(row)}</td>
                  {/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <aside class="min-h-0 overflow-auto bg-card/40 p-4">
      <div class="mb-4 border-b border-border/60 pb-3">
        <div class="mb-3 flex items-center gap-2">
          <Button size="sm" variant={detailsTab === "details" ? "default" : "outline"} onclick={() => (detailsTab = "details")}>{t("tabs.details", "Details")}</Button>
          <Button size="sm" variant={detailsTab === "filters" ? "default" : "outline"} onclick={() => (detailsTab = "filters")}>{t("tabs.filters", "Filters")}</Button>
          <Button size="sm" variant={detailsTab === "settings" ? "default" : "outline"} onclick={() => (detailsTab = "settings")}>{t("tabs.settings", "Settings")}</Button>
        </div>

        {#if detailsTab === "details"}
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold">{t("details.title", "Details")}</h2>
              <p class="text-xs text-muted-foreground">
                {selectedRow
                  ? getDisplayLabel(selectedRow)
                  : t("details.empty", "Select an event to inspect its payload.")}
              </p>
            </div>
            {#if selectedRow}
              <div class="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onclick={(event) => void copySummary(selectedRow, event)}>
                  {t("details.copySummary", "Copy summary")}
                </Button>
                <Button size="sm" variant="outline" onclick={(event) => void copyRaw(selectedRow, event)}>
                  {t("details.copyRaw", "Copy raw event")}
                </Button>
                {#if Number.isFinite(Number(selectedRow.uid))}
                  <Button size="sm" variant="outline" onclick={() => openDefinitionEditor(selectedRow)}>
                    {t("context.saveDefinition", "Save as custom definition")}
                  </Button>
                {/if}
              </div>
            {/if}
          </div>
        {:else if detailsTab === "filters"}
          <div>
            <h2 class="text-base font-semibold">{t("filters.title", "Filters")}</h2>
            <p class="text-xs text-muted-foreground">{t("details.empty", "Select an event to inspect its payload.")}</p>
          </div>
        {:else}
          <div>
            <h2 class="text-base font-semibold">{t("settings.title", "Settings")}</h2>
            <p class="text-xs text-muted-foreground">{t("settings.startWithMeterDescription", "Open the event logger automatically when the app starts.")}</p>
          </div>
        {/if}
      </div>

      {#if detailsTab === "details"}
        {#if selectedRow}
          <div class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.category", "Category")}</div>
                <div class="mt-1 font-medium">{getCategoryLabel(selectedRow.category)}</div>
              </div>
              <div class="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.action", "Action")}</div>
                <div class="mt-1 font-medium uppercase">{selectedRow.action}</div>
              </div>
              <div class="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.source", "Source")}</div>
                <div class="mt-1 font-medium break-all">{getSourceText(selectedRow)}</div>
              </div>
              <div class="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.target", "Target")}</div>
                <div class="mt-1 font-medium break-all">{getTargetText(selectedRow)}</div>
              </div>
            </div>

            <textarea
              readonly
              class="min-h-[420px] w-full rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-xs leading-5"
              value={selectedRowRaw}
            ></textarea>
          </div>
        {:else}
          <div class="rounded-lg border border-dashed border-border/60 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("details.empty", "Select an event to inspect its payload.")}
          </div>
        {/if}
      {:else if detailsTab === "filters"}
        <div class="space-y-4">
          <section class="rounded-lg border border-border/60 bg-background/50 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold">{t("filters.categories", "Categories")}</h3>
              <label class="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allCategoriesSelected}
                  onchange={(event) => toggleAllCategories((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4"
                />
                {t("filters.allCategories", "All categories")}
              </label>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each loggerCategories as item (item.key)}
                <label class="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={categorySelections[item.key] !== false}
                    onchange={(event) => setCategorySelected(item.key, (event.currentTarget as HTMLInputElement).checked)}
                    class="h-4 w-4"
                  />
                  <span>{getCategoryLabel(item.key)}</span>
                </label>
              {/each}
            </div>
          </section>


          <section class="rounded-lg border border-border/60 bg-background/50 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold">{t("filters.actions", "Actions")}</h3>
              <label class="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allActionsSelected}
                  onchange={(event) => toggleAllActions((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4"
                />
                {t("filters.allActions", "All actions")}
              </label>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              {#if availableActions.length === 0}
                <div class="rounded-md border border-dashed border-border/50 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
                  {t("filters.noActions", "No action values available yet.")}
                </div>
              {:else}
                {#each availableActions as actionValue (actionValue)}
                  <label class="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={actionSelections[actionValue] !== false}
                      onchange={(event) => setActionSelected(actionValue, (event.currentTarget as HTMLInputElement).checked)}
                      class="h-4 w-4"
                    />
                    <span>{actionValue}</span>
                  </label>
                {/each}
              {/if}
            </div>
          </section>
          <section class="rounded-lg border border-border/60 bg-background/50 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold">{t("filters.knownState", "Known state")}</h3>
              <label class="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allKnownStatesSelected}
                  onchange={(event) => toggleAllKnownStates((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4"
                />
                {t("filters.allStates", "All states")}
              </label>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  bind:checked={knownSelections.known}
                  class="h-4 w-4"
                />
                <span>{t("status.known", "Known")}</span>
              </label>
              <label class="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  bind:checked={knownSelections.unknown}
                  class="h-4 w-4"
                />
                <span>{t("status.unknown", "Unknown")}</span>
              </label>
            </div>
          </section>
        </div>
      {:else}
        <div class="space-y-4">
          <section class="rounded-lg border border-border/60 bg-background/50 p-4">
            <h3 class="mb-3 text-sm font-semibold">{t("settings.behavior", "Behavior")}</h3>
            <div class="space-y-2">
              <div class="rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm text-muted-foreground">
                {t("settings.newestFirstDescription", "Newest events appear at the top of the list and older events flow downward.")}
              </div>
              <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input type="checkbox" bind:checked={SETTINGS.customTriggers.state.loggerReduceClutter} class="h-4 w-4" />
                <div>
                  <div>{t("settings.reduceClutter", "Reduce clutter")}</div>
                  <div class="text-xs text-muted-foreground">{t("settings.reduceClutterDescription", "Skip a new row when it matches the immediately previous logged event.")}</div>
                </div>
              </label>
              <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={SETTINGS.customTriggers.state.loggerAlwaysOnTop}
                  onchange={(event) => void applyAlwaysOnTop((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4"
                />
                <span>{t("controls.alwaysOnTop", "Always on top")}</span>
              </label>
              <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input type="checkbox" bind:checked={SETTINGS.customTriggers.state.loggerStartWithMeter} class="h-4 w-4" />
                <div>
                  <div>{t("settings.startWithMeter", "Start with App")}</div>
                  <div class="text-xs text-muted-foreground">{t("settings.startWithMeterDescription", "Open the event logger automatically when the app starts.")}</div>
                </div>
              </label>
            </div>
          </section>

          <section class="rounded-lg border border-border/60 bg-background/50 p-4">
            <h3 class="mb-3 text-sm font-semibold">{t("settings.headers", "Headers")}</h3>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each columnOrder as columnKey (columnKey)}
                <label class="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isColumnVisible(columnKey)}
                    onchange={(event) => setColumnVisible(columnKey, (event.currentTarget as HTMLInputElement).checked)}
                    class="h-4 w-4"
                  />
                  <span>{getColumnLabel(columnKey)}</span>
                </label>
              {/each}
            </div>
          </section>
        </div>
      {/if}
    </aside>
  </div>

  {#if headerMenu}
    {@const menu = headerMenu}
    <div
      class="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-border/60 bg-zinc-950 text-zinc-100 shadow-xl"
      style={`left:${menu.x}px; top:${menu.y}px;`}
    >
      <button
        class={`block w-full px-3 py-2 text-left text-sm ${paused ? 'hover:bg-zinc-800' : 'cursor-not-allowed text-zinc-500'}`}
        onclick={() => toggleSort(menu.column)}
        disabled={!paused}
      >
        {sortState.column === menu.column && sortState.direction === 'asc'
          ? t("context.sortDesc", "Sort Z → A")
          : t("context.sortAsc", "Sort A → Z")}
      </button>
      {#if !paused}
        <div class="border-t border-zinc-800 px-3 py-1.5 text-xs text-zinc-500">{t("context.sortPausedOnly", "Pause the logger to sort")}</div>
      {/if}
      <button
        class="block w-full border-t border-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
        onclick={() => hideColumn(menu.column)}
        disabled={visibleColumns.length <= 1}
      >
        {t("context.hideColumn", "Hide column")}
      </button>
    </div>
  {/if}

  {#if contextMenu && contextMenuRow}
    <div
      class="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-border/60 bg-zinc-950 text-zinc-100 shadow-xl"
      style={`left:${contextMenu.x}px; top:${contextMenu.y}px;`}
    >
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onclick={(event) => void copyUid(contextMenuRow, event)}>{t("context.copyUid", "Copy UID")}</button>
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onclick={(event) => void copyName(contextMenuRow, event)}>{t("context.copyName", "Copy name")}</button>
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onclick={(event) => void copyUidAndName(contextMenuRow, event)}>{t("context.copyUidName", "Copy UID + Name")}</button>
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onclick={(event) => void copySummary(contextMenuRow, event)}>{t("context.copySummary", "Copy summary")}</button>
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onclick={(event) => void copyRaw(contextMenuRow, event)}>{t("context.copyRaw", "Copy raw event")}</button>
      {#if Number.isFinite(Number(contextMenuRow.uid))}
        <button class="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onclick={() => openDefinitionEditor(contextMenuRow)}>{t("context.saveDefinition", "Save as custom definition")}</button>
      {/if}
    </div>
  {/if}

  {#if definitionEditor}
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
      <div class="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
        <h3 class="text-lg font-semibold">{t("editor.title", "Save Custom Definition")}</h3>
        <div class="mt-4 space-y-3">
          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">{t("editor.uid", "UID")}</span>
            <input class="w-full rounded-md border border-border/60 bg-background px-3 py-2 font-mono" readonly value={definitionEditor.uid} />
          </label>

          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">{t("editor.type", "Type")}</span>
            <select bind:value={definitionEditor.type} class="w-full rounded-md border border-border/60 bg-zinc-950 px-3 py-2 text-zinc-100">
              <option value="buff">{t("editor.type.buff", "Buff")}</option>
              <option value="skill">{t("editor.type.skill", "Skill")}</option>
              <option value="monster">{t("editor.type.monster", "Monster")}</option>
              <option value="counter">{t("editor.type.counter", "Counter")}</option>
              <option value="unknown">{t("editor.type.unknown", "Unknown")}</option>
            </select>
          </label>

          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">{t("editor.name", "Name")}</span>
            <input bind:value={definitionEditor.name} class="w-full rounded-md border border-border/60 bg-background px-3 py-2" placeholder={t("editor.placeholder.name", "Enter a custom display name")} />
          </label>

          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">{t("editor.notes", "Notes")}</span>
            <textarea bind:value={definitionEditor.notes} class="min-h-[96px] w-full rounded-md border border-border/60 bg-background px-3 py-2" placeholder={t("editor.placeholder.notes", "Optional notes")}></textarea>
          </label>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" onclick={() => (definitionEditor = null)}>{t("editor.cancel", "Cancel")}</Button>
          <Button onclick={() => void saveDefinition()}>{t("editor.save", "Save")}</Button>
        </div>
      </div>
    </div>
  {/if}

  {#if copyToast}
    <div
      class="pointer-events-none fixed z-[60] rounded-md border border-border/60 bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg"
      style={`left:${copyToast.x}px; top:${copyToast.y}px;`}
    >
      {copyToast.text}
    </div>
  {/if}
</div>
