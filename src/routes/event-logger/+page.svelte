<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { dev } from "$app/environment";
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
  import {
    decodeGearStatLine,
    decodeGearStatLineByPairId,
    decodeGearStatLinesForItem,
    resolveItemName,
    type GearStatLine,
  } from "$lib/gear-stat-decoder";
  import { uiT, type LocaleCode } from "$lib/i18n";
  import { localizeRawSceneName } from "$lib/scene-mappings";
  import { SETTINGS } from "$lib/settings-store";

  const t = uiT("custom-triggers/logger", () => SETTINGS.live.general.state.language);

  type DisplayRow = EventLoggerEntry & { localId: number };
  type ContextMenuState = { x: number; y: number; row: DisplayRow } | null;
  type HeaderMenuState = { x: number; y: number; column: ColumnKey } | null;
  type DetailsTab = "details" | "filters" | "settings" | "debug";

  type EventLoggerFileStoragePayload = {
    configuredDirectory: string | null;
    resolvedDirectory: string;
    usingDefault: boolean;
    storeLogFiles: boolean;
    includeRepeatedSnapshotRows: boolean;
    deleteOlderThanDays: number | null;
    captureCensusEnabled: boolean;
    attributionCensusEnabled: boolean;
  };
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
    { key: "system", label: "System", enabledByDefault: false },
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
  let loggerFileStorage = $state<EventLoggerFileStoragePayload | null>(null);
  let loggerFileStorageLoading = $state(false);
  let loggerFileStorageError = $state("");
  let exportingLoggerSession = $state(false);
  let deleteOldFilesEnabled = $state(false);
  let deleteOldFilesDaysInput = $state("30");
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
  let actionSelections = $state<Record<string, boolean>>({
    panel_attr: false,
    stream_limit: false,
    connection_seen: false,
  });
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

  function parsePositiveUid(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.trunc(parsed);
  }

  function isNumericLikeLabel(value: string | null | undefined): boolean {
    const trimmed = normalizeLabel(value);
    return Boolean(trimmed) && /^\d+$/.test(trimmed);
  }

  function tryParseRawObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== "string") return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  function tryGetRawChildObject(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const child = value[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return child as Record<string, unknown>;
    }
    return null;
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

  const knownEntityLabels = $derived.by(() => {
    const labels = new Map<number, string>();

    for (const row of rows) {
      const ownUid = parsePositiveUid(row.uid);
      const preferredName = getPreferredName(row);
      if (ownUid && preferredName) {
        labels.set(ownUid, preferredName);
      }

      const sourceUid = parsePositiveUid(row.sourceUid);
      const sourceLabel = normalizeLabel(row.sourceLabel);
      if (sourceUid && sourceLabel && !isNumericLikeLabel(sourceLabel)) {
        labels.set(sourceUid, sourceLabel);
      }

      const targetUid = parsePositiveUid(row.targetUid);
      const targetLabel = normalizeLabel(row.targetLabel);
      if (targetUid && targetLabel && !isNumericLikeLabel(targetLabel)) {
        labels.set(targetUid, targetLabel);
      }

      const rawObject = tryParseRawObject(row.raw);
      if (!rawObject) continue;

      const playerUid = parsePositiveUid(rawObject["playerUid"]);
      const playerName = normalizeLabel(typeof rawObject["playerName"] === "string" ? rawObject["playerName"] : null);
      if (playerUid && playerName && !isNumericLikeLabel(playerName)) {
        labels.set(playerUid, playerName);
      }

      const sourceUidRaw = parsePositiveUid(rawObject["sourceUid"]);
      const sourceNameRaw = normalizeLabel(typeof rawObject["sourceName"] === "string" ? rawObject["sourceName"] : null);
      if (sourceUidRaw && sourceNameRaw && !isNumericLikeLabel(sourceNameRaw)) {
        labels.set(sourceUidRaw, sourceNameRaw);
      }

      const targetUidRaw = parsePositiveUid(rawObject["targetUid"]);
      const targetNameRaw = normalizeLabel(typeof rawObject["targetName"] === "string" ? rawObject["targetName"] : null);
      if (targetUidRaw && targetNameRaw && !isNumericLikeLabel(targetNameRaw)) {
        labels.set(targetUidRaw, targetNameRaw);
      }
    }

    return labels;
  });

  function resolveKnownEntityLabel(uid: unknown): string {
    const normalizedUid = parsePositiveUid(uid);
    if (!normalizedUid) return "";
    return knownEntityLabels.get(normalizedUid) ?? "";
  }

  function formatEntityReference(uid: unknown): string {
    const normalizedUid = parsePositiveUid(uid);
    if (!normalizedUid) return t("meta.none", "—");
    return resolveKnownEntityLabel(normalizedUid) || String(normalizedUid);
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

  function currentLoggerLocale(): LocaleCode {
    return SETTINGS.live.general.state.language as LocaleCode;
  }

  function localizeSceneLabel(value: string | null | undefined): string {
    const normalized = normalizeLabel(value);
    if (!normalized) return "";
    return localizeRawSceneName(normalized, normalized, currentLoggerLocale());
  }

  function shouldLocalizeSourceAsScene(row: DisplayRow): boolean {
    return row.category === "scene";
  }

  function shouldLocalizeTargetAsScene(row: DisplayRow): boolean {
    return (
      row.category === "scene" ||
      row.category === "live_totals" ||
      row.category === "player" ||
      row.category === "boss_hp" ||
      row.category === "mob" ||
      row.category === "encounter"
    );
  }

  function getActionLabel(action: string): string {
    return t(`action.${action}`, action);
  }

  function getSummary(row: DisplayRow): string {
    const gearStatSummary = getGearStatSummary(row);
    if (gearStatSummary) return gearStatSummary;

    const itemDropSummary = getItemDropFallbackSummary(row);
    if (itemDropSummary) return itemDropSummary;

    const summary = normalizeText(row.summary);
    if (summary) {
      if (row.category === "scene" || row.category === "encounter") {
        return appendSummaryDetail(localizeSceneLabel(summary) || summary, gearStatSummary);
      }
      if (row.category === "buff" || row.category === "monster_buff") {
        const resolvedSummary = summary
          .replace(/host=(\d+)/g, (_match, uid) => `host=${formatEntityReference(uid)}`)
          .replace(/src=(\d+)/g, (_match, uid) => `src=${formatEntityReference(uid)}`)
          .replace(/boss=(\d+)/g, (_match, uid) => `boss=${formatEntityReference(uid)}`);
        return appendSummaryDetail(resolvedSummary, gearStatSummary);
      }
      return appendSummaryDetail(summary, gearStatSummary);
    }

    const value = normalizeText(row.value);
    if (value) return appendSummaryDetail(value, gearStatSummary);

    const nameHint = normalizeText(row.nameHint);
    if (nameHint) {
      if (row.category === "scene" || row.category === "encounter") {
        return appendSummaryDetail(localizeSceneLabel(nameHint) || nameHint, gearStatSummary);
      }
      return appendSummaryDetail(nameHint, gearStatSummary);
    }

    if (gearStatSummary) return gearStatSummary;

    return t("meta.none", "—");
  }

  function getItemDropGearItemId(row: DisplayRow): number | null {
    const decoded = getItemDropDecoded(row);
    if (!decoded) return null;

    return getItemDropActualGearItemId(decoded, row);
  }

  function getGearStatSummary(row: DisplayRow): string {
    const decoded = getItemDropDecoded(row);
    if (!isGearItemDrop(row, decoded)) return "";

    const gearItemId = getItemDropGearItemId(row);
    if (!gearItemId) return "";

    const gearSlot = getGearSlotLabel(gearItemId);
    const detailLines = decoded ? getItemDropDetailStatLines(decoded) : [];
    const pairIds = decoded ? getItemDropPairIds(decoded) : [];
    const matchedLines = decodeGearStatLinesByPairIds(gearItemId, pairIds);
    const statLines = matchedLines.length || pairIds.length ? matchedLines : decodeGearStatLinesForItem(gearItemId);
    const statSummary = formatGearStatDetails(statLines, detailLines, canShowGearSpecialStats(decoded));

    return formatGearDropSummary(gearSlot, statSummary);
  }

  function canShowGearSpecialStats(decoded: Record<string, unknown> | null): boolean {
    if (!decoded) return false;

    const rawQualityLabel = typeof decoded["qualityLabel"] === "string" ? decoded["qualityLabel"].trim().toLowerCase() : "";
    if (["white", "green", "blue", "purple", "unknown"].includes(rawQualityLabel)) return false;
    if (
      rawQualityLabel.includes("gold") ||
      rawQualityLabel.includes("legendary") ||
      rawQualityLabel.includes("orange")
    ) {
      return true;
    }

    const qualityTier = parseFiniteInteger(decoded["qualityTier"]);
    if (qualityTier === null || [0, 1, 2, 3, 4, 40, 60, 80, 100].includes(qualityTier)) return false;
    return qualityTier > 4;
  }

  function formatGearDropSummary(slotLabel: string, statSummary: string): string {
    return [slotLabel, statSummary].filter(Boolean).join(": ");
  }

  function getGearSlotLabel(itemId: number): string {
    const group = Math.trunc(itemId / 10000);

    switch (group) {
      case 200:
        return "Weapon";
      case 201:
        return "Mask";
      case 202:
        return "Armor";
      case 203:
        return "Gloves";
      case 204:
        return "Boots";
      case 205:
        return "Earring";
      case 206:
        return "Necklace";
      case 207:
        return "Ring";
      case 208:
        return "Bracelet (L)";
      case 209:
        return "Bracelet (R)";
      case 210:
        return "Charm";
      default:
        return "";
    }
  }

  function getItemDropDecoded(row: DisplayRow): Record<string, unknown> | null {
    if (row.category !== "item_drop") return null;

    const rawObject = tryParseRawObject(row.raw);
    if (!rawObject) return null;

    return tryGetRawChildObject(rawObject, "decoded");
  }

  function isGearItemDrop(row: DisplayRow, decoded = getItemDropDecoded(row)): boolean {
    if (row.category !== "item_drop" || !decoded) return false;

    const itemKind = typeof decoded["itemKind"] === "string" ? decoded["itemKind"].trim().toLowerCase() : "";
    if (itemKind && itemKind !== "gear") return false;

    const gearItemId = getItemDropActualGearItemId(decoded, row);
    if (!gearItemId) return false;

    return decoded["isGear"] === true || itemKind === "gear" || getItemDropPairIds(decoded).length > 0;
  }

  function getItemDropActualGearItemId(decoded: Record<string, unknown>, row?: DisplayRow): number | null {
    return getItemDropCandidateItemIds(decoded, row).find(itemIdLooksLikeGearItem) ?? null;
  }

  function getItemDropCandidateItemIds(decoded: Record<string, unknown>, row?: DisplayRow): number[] {
    return dedupeNumbers([
      parsePositiveUid(decoded["detailGearInstanceId"]),
      parsePositiveUid(decoded["instanceId"]),
      parsePositiveUid(decoded["detailGearConfigId"]),
      parsePositiveUid(decoded["configId"]),
      parsePositiveUid(row?.targetUid),
      parsePositiveUid(row?.uid),
    ].filter((candidate): candidate is number => candidate !== null));
  }

  function itemIdLooksLikeGearItem(itemId: number): boolean {
    return itemId >= 2_000_000 && itemId <= 2_200_000;
  }

  function isLegendaryRewardBoxItemId(itemId: number | null): boolean {
    return itemId !== null && itemId >= 1_049_705 && itemId <= 1_049_740;
  }

  function getItemDropDisplayQualityLabel(row: DisplayRow): string {
    const decoded = getItemDropDecoded(row);
    if (!decoded) return "";

    const itemIds = getItemDropCandidateItemIds(decoded, row);

    if (itemIds.some(isLegendaryRewardBoxItemId)) return "Legendary";

    const itemName = itemIds
      .map((itemId) => (itemId ? resolveItemName(itemId, "en") : null))
      .find((name) => typeof name === "string" && name.trim());
    if (itemName && /\blegendary\b/i.test(itemName)) return "Legendary";

    const gearItemId = getItemDropActualGearItemId(decoded, row);
    const qualityTier = parseFiniteInteger(decoded["qualityTier"]);
    const rawQualityLabel = typeof decoded["qualityLabel"] === "string" ? decoded["qualityLabel"].trim() : "";
    const displayQualityLabel =
      typeof decoded["displayQualityLabel"] === "string" ? decoded["displayQualityLabel"].trim() : "";

    if (!gearItemId) return "";

    const normalizedQuality = (displayQualityLabel || rawQualityLabel).toLowerCase();
    if (qualityTier === 5 || normalizedQuality === "quality 5" || normalizedQuality === "gold") {
      return "Legendary";
    }

    if (["purple", "blue", "green", "white"].includes(normalizedQuality)) {
      return normalizedQuality.charAt(0).toUpperCase() + normalizedQuality.slice(1);
    }

    return displayQualityLabel || "";
  }

  function getItemDropFallbackSummary(row: DisplayRow): string {
    const decoded = getItemDropDecoded(row);
    if (!decoded) return "";

    const itemIds = getItemDropCandidateItemIds(decoded, row);
    if (itemIds.some(isLegendaryRewardBoxItemId)) return "Legendary gift box";

    if (!getItemDropActualGearItemId(decoded, row) && /^(?:Gold|Quality 5)\s+item\b/i.test(normalizeText(row.summary))) {
      return formatItemDropTechnicalSummary(decoded);
    }

    return "";
  }

  function formatItemDropTechnicalSummary(decoded: Record<string, unknown>): string {
    const configId = parsePositiveUid(decoded["configId"]);
    const instanceId = parsePositiveUid(decoded["instanceId"]);
    const lineCount = parseFiniteInteger(decoded["lineCountHint"]);
    const detailCandidates = decoded["matchedDetailCandidates"];
    const detailSize =
      Array.isArray(detailCandidates) && detailCandidates[0] && typeof detailCandidates[0] === "object"
        ? parseFiniteInteger((detailCandidates[0] as Record<string, unknown>)["payload_len"] ?? (detailCandidates[0] as Record<string, unknown>)["payloadLen"])
        : null;
    return [
      "Item",
      configId ? `cfg=${configId}` : "",
      instanceId ? `inst=${instanceId}` : "",
      lineCount !== null ? `lines=${lineCount}` : "",
      detailSize !== null ? `details=${detailSize}B` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getItemDropPairIds(decoded: Record<string, unknown>): number[] {
    return dedupeNumbers([
      ...getItemDropDetailStatPairIds(decoded),
      ...parseItemLinePairIds(decoded["field10Pairs"]),
      ...parseItemLinePairIds(decoded["field11Pairs"]),
      ...parseItemLinePairIds(decoded["field14Pairs"]),
      ...parsePositiveNumberArray(decoded["field10Ids"]),
      ...parsePositiveNumberArray(decoded["field11Ids"]),
      ...parsePositiveNumberArray(decoded["field14Ids"]),
    ]);
  }

  function getItemDropDetailStatPairIds(decoded: Record<string, unknown>): number[] {
    const rawLines = decoded["detailStatLines"];
    if (!Array.isArray(rawLines)) return [];

    return rawLines
      .flatMap((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const rawEntry = entry as Record<string, unknown>;
        const pairId = parsePositiveUid(rawEntry["pairId"] ?? rawEntry["pair_id"]);
        if (!pairId) return [];
        return [{ slot: parseFiniteInteger(rawEntry["slot"]) ?? index, pairId }];
      })
      .sort((left, right) => left.slot - right.slot)
      .map((line) => line.pairId);
  }

  type ItemDropDetailStatLine = {
    slot: number;
    pairId: number;
    value: number;
  };

  type GearSubStatSummaryLine = {
    label: string;
    pairSlot: number;
    pairId: number;
    hasDetail: boolean;
    value: number | null;
  };

  const gearSubStatLabels = new Set(["Crit", "Haste", "Luck", "Mastery", "Versatility"]);

  function getItemDropDetailStatLines(decoded: Record<string, unknown>): ItemDropDetailStatLine[] {
    const rawLines = decoded["detailStatLines"];
    if (!Array.isArray(rawLines)) return getLegacyItemDropDetailStatLines(decoded);

    const lines = rawLines
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const rawEntry = entry as Record<string, unknown>;
        const slot = parseFiniteInteger(rawEntry["slot"]);
        const pairId = parsePositiveUid(rawEntry["pairId"] ?? rawEntry["pair_id"]);
        const value = parseFiniteInteger(rawEntry["value"]);
        if (slot === null || !pairId || value === null) return [];
        return [{ slot, pairId, value }];
      })
      .sort((left, right) => left.slot - right.slot);

    return lines.length ? lines : getLegacyItemDropDetailStatLines(decoded);
  }

  function getLegacyItemDropDetailStatLines(decoded: Record<string, unknown>): ItemDropDetailStatLine[] {
    const rawCandidates = decoded["matchedDetailCandidates"];
    if (!Array.isArray(rawCandidates)) return [];

    const pairIds = getItemDropPairIds(decoded);
    if (pairIds.length === 0) return [];

    const itemId =
      parsePositiveUid(decoded["detailGearInstanceId"]) ??
      parsePositiveUid(decoded["instanceId"]) ??
      parsePositiveUid(decoded["configId"]);
    const blockedValues = new Set([
      ...pairIds,
      parsePositiveUid(decoded["detailGearConfigId"]),
      parsePositiveUid(decoded["detailGearInstanceId"]),
      parsePositiveUid(decoded["configId"]),
      parsePositiveUid(decoded["instanceId"]),
      parsePositiveUid(decoded["perfectionValue"]),
      parsePositiveUid(decoded["perfectionCap"]),
    ].filter((value): value is number => Boolean(value)));

    for (const candidate of rawCandidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const rawCandidate = candidate as Record<string, unknown>;
      const rawValues = rawCandidate["firstValues"] ?? rawCandidate["first_values"];
      if (!Array.isArray(rawValues)) continue;
      const values = rawValues.flatMap((value) => {
        const parsed = parseFiniteInteger(value);
        return parsed === null ? [] : [parsed];
      });
      const itemIndex = itemId ? values.findIndex((value) => value === itemId) : -1;
      const displayValues = values
        .slice(Math.max(0, itemIndex + 1))
        .filter((value) => value >= 180 && value <= 5000 && !blockedValues.has(value));
      const dedupedValues = dedupeNumbers(displayValues);
      if (dedupedValues.length === 0) continue;

      return pairIds.slice(0, dedupedValues.length).flatMap((pairId, slot) => {
        const value = dedupedValues[slot];
        return value === undefined ? [] : [{ slot, pairId, value }];
      });
    }

    return [];
  }

  function formatGearStatDetails(
    statLines: GearStatLine[],
    detailLines: ItemDropDetailStatLine[],
    includeSpecialStats: boolean,
  ): string {
    const specialStats = includeSpecialStats
      ? statLines
          .filter(isGearSpecialStatLine)
          .sort((left, right) => left.pairSlot - right.pairSlot)
          .map((line) => formatGearSpecialStatLine(line, detailLines))
          .filter(Boolean)
      : [];

    const subStatSummary = formatGearSubStatDetails(statLines, detailLines);

    return [...specialStats, subStatSummary].filter(Boolean).join(", ");
  }

  function formatGearSubStatDetails(statLines: GearStatLine[], detailLines: ItemDropDetailStatLine[]): string {
    const subStats = statLines
      .filter((line) => isGearSubStatLabel(line.label))
      .map((line): GearSubStatSummaryLine => {
        return {
          label: canonicalGearSubStatLabel(line.label),
          pairSlot: line.pairSlot,
          pairId: line.pairId,
          hasDetail: Boolean(findItemDropDetailLine(line, detailLines)),
          value: getGearStatDisplayValue(line, detailLines),
        };
      })
      .sort(compareGearSubStatsForSummary);

    const summaries: string[] = [];
    const seenLabels = new Set<string>();
    for (const line of subStats) {
      if (seenLabels.has(line.label)) continue;
      seenLabels.add(line.label);
      summaries.push(formatGearSubStatSummaryLine(line));
    }

    return summaries.join(" > ");
  }

  function formatGearSubStatSummaryLine(line: GearSubStatSummaryLine): string {
    if (line.value === null) return line.label;
    return `${line.label} ${line.value}`;
  }

  function isGearSpecialStatLine(line: GearStatLine): boolean {
    return line.lane === "legendary-affix" && !isGearSubStatLabel(line.label) && line.canDisplayValue;
  }

  function formatGearSpecialStatLine(line: GearStatLine, detailLines: ItemDropDetailStatLine[]): string {
    const valueText = getGearStatDisplayValueText(line, detailLines);
    if (!valueText) return "";
    return `${canonicalGearSpecialStatLabel(line.label)} +${valueText}`;
  }

  function findItemDropDetailLine(line: GearStatLine, detailLines: ItemDropDetailStatLine[]): ItemDropDetailStatLine | null {
    return (
      detailLines.find((detailLine) => detailLine.slot === line.pairSlot && detailLine.pairId === line.pairId) ??
      detailLines.find((detailLine) => detailLine.pairId === line.pairId) ??
      null
    );
  }

  function getGearStatDisplayValue(line: GearStatLine, detailLines: ItemDropDetailStatLine[]): number | null {
    const detailLine = findItemDropDetailLine(line, detailLines);
    if (detailLine) return detailLine.value;
    if (typeof line.value === "number" && line.valueKind !== "unknown" && line.valueKind !== "locked") {
      return line.value;
    }
    return null;
  }

  function getGearStatDisplayValueText(line: GearStatLine, detailLines: ItemDropDetailStatLine[]): string | null {
    const value = getGearStatDisplayValue(line, detailLines);
    if (value === null) return line.valueText;
    const valueText = Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, "");
    return line.valueKind === "percent" ? `${valueText}%` : valueText;
  }

  function canonicalGearSpecialStatLabel(label: string): string {
    const trimmed = label.trim();
    if (trimmed === "Attack SPD") return "Attack Speed";
    if (trimmed === "All Resistance") return "All Element Resistance";
    return trimmed;
  }

  function canonicalGearSubStatLabel(label: string): string {
    const normalized = label.trim().toLowerCase();
    if (normalized === "crit") return "Crit";
    if (normalized === "haste") return "Haste";
    if (normalized === "luck") return "Luck";
    if (normalized === "mastery") return "Mastery";
    if (normalized === "versatility") return "Versatility";
    return label.trim();
  }

  function isGearSubStatLabel(label: string): boolean {
    return gearSubStatLabels.has(canonicalGearSubStatLabel(label));
  }

  function compareGearSubStatsForSummary(left: GearSubStatSummaryLine, right: GearSubStatSummaryLine): number {
    if (left.pairSlot !== right.pairSlot) return left.pairSlot - right.pairSlot;
    if (left.hasDetail !== right.hasDetail) return left.hasDetail ? -1 : 1;
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  }

  function decodeGearStatLinesByPairIds(itemId: number, pairIds: number[]): GearStatLine[] {
    const lines: GearStatLine[] = [];
    const seenSlots = new Set<number>();

    for (const [index, pairId] of pairIds.entries()) {
      const itemLine = decodeGearStatLine({ itemId, pairId });
      const pairLine = decodeGearStatLineByPairId({ itemId, pairId, pairSlot: index });
      const line = chooseGearStatLineForSummary(itemLine, pairLine);
      if (!line || seenSlots.has(line.pairSlot)) continue;
      seenSlots.add(line.pairSlot);
      lines.push(line);
    }

    return lines.sort((left, right) => left.pairSlot - right.pairSlot);
  }

  function chooseGearStatLineForSummary(itemLine: GearStatLine | null, pairLine: GearStatLine | null): GearStatLine | null {
    if (!itemLine) return pairLine;
    if (!pairLine) return itemLine;
    if (!itemLine.canDisplayValue && pairLine.canDisplayValue && areCompatibleGearStatLabels(itemLine.label, pairLine.label)) {
      return pairLine;
    }
    return itemLine;
  }

  function areCompatibleGearStatLabels(left: string, right: string): boolean {
    const leftSpecial = canonicalGearSpecialStatLabel(left);
    const rightSpecial = canonicalGearSpecialStatLabel(right);
    if (leftSpecial === rightSpecial) return true;

    const leftSub = canonicalGearSubStatLabel(left);
    const rightSub = canonicalGearSubStatLabel(right);
    return gearSubStatLabels.has(leftSub) && leftSub === rightSub;
  }

  function parsePositiveNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
      const parsed = parsePositiveUid(entry);
      return parsed ? [parsed] : [];
    });
  }

  function dedupeNumbers(values: number[]): number[] {
    return Array.from(new Set(values));
  }

  function parseItemLinePairIds(value: unknown): number[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const rawEntry = entry as Record<string, unknown>;
      const parsed = parsePositiveUid(rawEntry["id"] ?? rawEntry["pairId"] ?? rawEntry["pair_id"]);
      return parsed ? [parsed] : [];
    });
  }

  function parseFiniteInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  }

  function appendSummaryDetail(summary: string, detail: string): string {
    if (!detail) return summary;
    if (!summary) return detail;
    if (summary.includes(detail)) return summary;
    return `${summary} ${detail}`;
  }

  function syncLoggerFileStorageControls(payload: EventLoggerFileStoragePayload | null) {
    deleteOldFilesEnabled = Boolean(payload?.deleteOlderThanDays);
    deleteOldFilesDaysInput = String(payload?.deleteOlderThanDays ?? 30);
  }

  function parseDeleteOldFilesDays(): number | null {
    if (!deleteOldFilesEnabled) return null;
    const parsed = Math.floor(Number(deleteOldFilesDaysInput));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 30;
    }
    return parsed;
  }

  async function refreshLoggerFileStorage() {
    loggerFileStorageLoading = true;
    loggerFileStorageError = "";
    try {
      loggerFileStorage = await invoke<EventLoggerFileStoragePayload>("get_event_logger_file_storage_settings");
      syncLoggerFileStorageControls(loggerFileStorage);
    } catch (error) {
      console.error("[event-logger] failed to load logger file storage settings", error);
      loggerFileStorageError = String(error);
    } finally {
      loggerFileStorageLoading = false;
    }
  }

  async function saveLoggerFileStorage() {
    if (!loggerFileStorage) return;
    loggerFileStorageLoading = true;
    loggerFileStorageError = "";
    try {
      loggerFileStorage = await invoke<EventLoggerFileStoragePayload>(
        "set_event_logger_file_storage_settings",
        {
          storeLogFiles: loggerFileStorage.storeLogFiles,
          includeRepeatedSnapshotRows: loggerFileStorage.includeRepeatedSnapshotRows,
          deleteOlderThanDays: parseDeleteOldFilesDays(),
          captureCensusEnabled: loggerFileStorage.captureCensusEnabled,
          attributionCensusEnabled: loggerFileStorage.attributionCensusEnabled,
        },
      );
      syncLoggerFileStorageControls(loggerFileStorage);
    } catch (error) {
      console.error("[event-logger] failed to save logger file storage settings", error);
      loggerFileStorageError = String(error);
    } finally {
      loggerFileStorageLoading = false;
    }
  }

  async function openLoggerFileStorageFolder() {
    loggerFileStorageError = "";
    try {
      await invoke("open_event_logger_session_dir");
    } catch (error) {
      console.error("[event-logger] failed to open logger file storage folder", error);
      loggerFileStorageError = String(error);
    }
  }

  async function exportLoggerSession() {
    if (exportingLoggerSession) return;

    exportingLoggerSession = true;
    loggerFileStorageError = "";
    try {
      const exportedPath = await invoke<string | null>("export_event_logger_session");
      showToast(
        exportedPath
          ? t("debug.exported", "Exported event log")
          : t("debug.noSessionToExport", "No event log to export"),
        40,
        40,
      );
    } catch (error) {
      console.error("[event-logger] failed to export logger session", error);
      loggerFileStorageError = String(error);
      showToast(t("debug.exportFailed", "Export failed"), 40, 40);
    } finally {
      exportingLoggerSession = false;
    }
  }

  function getKnownLabel(row: DisplayRow): string {
    return isKnownEntry(row) ? t("status.known", "Known") : t("status.unknown", "Unknown");
  }

  function getSourceText(row: DisplayRow): string {
    const sourceLabel = normalizeLabel(row.sourceLabel);
    if (sourceLabel && !isNumericLikeLabel(sourceLabel)) {
      if (shouldLocalizeSourceAsScene(row)) {
        return localizeSceneLabel(sourceLabel) || sourceLabel;
      }
      return sourceLabel;
    }

    const resolved = resolveKnownEntityLabel(row.sourceUid);
    if (resolved) return resolved;

    const sourceUid = parsePositiveUid(row.sourceUid);
    return sourceUid ? String(sourceUid) : t("meta.none", "—");
  }

  function getTargetText(row: DisplayRow): string {
    const itemDropQualityLabel = getItemDropDisplayQualityLabel(row);
    if (row.category === "item_drop") return itemDropQualityLabel || t("meta.none", "—");

    const targetLabel = normalizeLabel(row.targetLabel);
    if (targetLabel && !isNumericLikeLabel(targetLabel)) {
      if (shouldLocalizeTargetAsScene(row)) {
        return localizeSceneLabel(targetLabel) || targetLabel;
      }
      return targetLabel;
    }

    const resolved = resolveKnownEntityLabel(row.targetUid);
    if (resolved) return resolved;

    const targetUid = parsePositiveUid(row.targetUid);
    return targetUid ? String(targetUid) : t("meta.none", "—");
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
      await refreshLoggerFileStorage();
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

<div class="flex h-screen flex-col bg-background-main text-foreground">
  <header class="border-b border-border/60 bg-card/85 px-4 py-3 shadow-sm backdrop-blur">
    <div class="flex flex-wrap items-center gap-2">
      <input
        bind:value={searchText}
        class="min-w-[220px] flex-1 rounded-md border border-border/60 bg-background-main px-3 py-2 text-sm"
        placeholder={t("controls.search", "Search")}
      />

      <div class="flex items-center gap-1 rounded-md border border-border/60 bg-background-main p-1">
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
      <Button
        variant="destructive"
        disabled={exportingLoggerSession}
        onclick={() => void exportLoggerSession()}
      >
        {exportingLoggerSession ? t("controls.exporting", "Exporting...") : t("controls.endExport", "End / Export")}
      </Button>
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
                    <td class="px-3 py-2 text-xs uppercase text-muted-foreground whitespace-nowrap">{getActionLabel(row.action)}</td>
                  {:else if columnKey === "name"}
                    <td class="px-3 py-2 select-text">
                      <div class="flex items-center gap-2 overflow-hidden">
                        {#if getNameCellText(row)}
                          <span class="truncate font-medium">{getNameCellText(row)}</span>
                        {/if}
                        {#if shouldShowUidChip(row)}
                          <button
                            type="button"
                            class="shrink-0 rounded-md border border-border/60 bg-background-main px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
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
          <Button size="sm" variant={detailsTab === "debug" ? "default" : "outline"} onclick={() => (detailsTab = "debug")}>{t("tabs.debug", "Debug")}</Button>
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
        {:else if detailsTab === "settings"}
          <div>
            <h2 class="text-base font-semibold">{t("settings.title", "Settings")}</h2>
            <p class="text-xs text-muted-foreground">{t("settings.startWithMeterDescription", "Open the event logger automatically when the app starts.")}</p>
          </div>
        {:else}
          <div>
            <h2 class="text-base font-semibold">{t("debug.title", "Debug")}</h2>
            <p class="text-xs text-muted-foreground">{t("debug.subtitle", "Store scene rollover log files for debugging and packet verification.")}</p>
          </div>
        {/if}
      </div>

      {#if detailsTab === "details"}
        {#if selectedRow}
          <div class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg border border-border/60 bg-background-main/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.category", "Category")}</div>
                <div class="mt-1 font-medium">{getCategoryLabel(selectedRow.category)}</div>
              </div>
              <div class="rounded-lg border border-border/60 bg-background-main/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.action", "Action")}</div>
                <div class="mt-1 font-medium uppercase">{selectedRow.action}</div>
              </div>
              <div class="rounded-lg border border-border/60 bg-background-main/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.source", "Source")}</div>
                <div class="mt-1 font-medium break-all">{getSourceText(selectedRow)}</div>
              </div>
              <div class="rounded-lg border border-border/60 bg-background-main/60 p-3 text-sm">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("table.target", "Target")}</div>
                <div class="mt-1 font-medium break-all">{getTargetText(selectedRow)}</div>
              </div>
            </div>

            <textarea
              readonly
              class="min-h-[420px] w-full rounded-lg border border-border/60 bg-background-main/60 p-3 font-mono text-xs leading-5"
              value={selectedRowRaw}
            ></textarea>
          </div>
        {:else}
          <div class="rounded-lg border border-dashed border-border/60 bg-background-main/40 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("details.empty", "Select an event to inspect its payload.")}
          </div>
        {/if}
      {:else if detailsTab === "filters"}
        <div class="space-y-4">
          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
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


          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
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
                    <span>{getActionLabel(actionValue)}</span>
                  </label>
                {/each}
              {/if}
            </div>
          </section>
          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
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
      {:else if detailsTab === "settings"}
        <div class="space-y-4">
          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
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

          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
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
      {:else}
        <div class="space-y-4">
          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold">{t("debug.logFiles", "Log Files")}</h3>
                <p class="mt-1 text-xs text-muted-foreground">{t("debug.description", "Automatically save the current Event Logger session to AppData\\EventLogs whenever the scene changes, the encounter resets, or the live loop exits.")}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onclick={() => void refreshLoggerFileStorage()}>
                  {loggerFileStorageLoading ? t("debug.loading", "Loading…") : t("debug.reload", "Reload")}
                </Button>
                <Button size="sm" variant="outline" onclick={() => void openLoggerFileStorageFolder()}>
                  {t("debug.openFolder", "Open Folder")}
                </Button>
              </div>
            </div>

            <div class="space-y-3">
              <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={loggerFileStorage?.storeLogFiles ?? false}
                  onchange={(event) => {
                    if (!loggerFileStorage) return;
                    loggerFileStorage = {
                      ...loggerFileStorage,
                      storeLogFiles: (event.currentTarget as HTMLInputElement).checked,
                    };
                    void saveLoggerFileStorage();
                  }}
                  class="h-4 w-4"
                />
                <div>
                  <div>{t("debug.storeLogFiles", "Store Log Files")}</div>
                  <div class="text-xs text-muted-foreground">{t("debug.storeLogFilesDescription", "Writes Event Logger scene rollover files to your AppData EventLogs folder for debugging.")}</div>
                </div>
              </label>

              <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={loggerFileStorage?.includeRepeatedSnapshotRows ?? false}
                  disabled={!(loggerFileStorage?.storeLogFiles ?? false)}
                  onchange={(event) => {
                    if (!loggerFileStorage) return;
                    loggerFileStorage = {
                      ...loggerFileStorage,
                      includeRepeatedSnapshotRows: (event.currentTarget as HTMLInputElement).checked,
                    };
                    void saveLoggerFileStorage();
                  }}
                  class="h-4 w-4"
                />
                <div>
                  <div>{t("debug.includeRepeatedSnapshotRows", "Include repeated snapshot rows")}</div>
                  <div class="text-xs text-muted-foreground">{t("debug.includeRepeatedSnapshotRowsDescription", "Off by default. When disabled, exported log files omit repeated idle snapshot rows to keep file sizes smaller.")}</div>
                </div>
              </label>

              {#if dev}
                <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={loggerFileStorage?.captureCensusEnabled ?? false}
                    disabled={!loggerFileStorage}
                    onchange={(event) => {
                      if (!loggerFileStorage) return;
                      loggerFileStorage = {
                        ...loggerFileStorage,
                        captureCensusEnabled: (event.currentTarget as HTMLInputElement).checked,
                      };
                      void saveLoggerFileStorage();
                    }}
                    class="h-4 w-4"
                  />
                  <div>
                    <div>{t("debug.captureCensus", "Capture census")}</div>
                    <div class="text-xs text-muted-foreground">{t("debug.captureCensusDescription", "Dev-only packet census rows for service and fragment discovery. Off on every app start.")}</div>
                  </div>
                </label>

                <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={loggerFileStorage?.attributionCensusEnabled ?? false}
                    disabled={!loggerFileStorage}
                    onchange={(event) => {
                      if (!loggerFileStorage) return;
                      loggerFileStorage = {
                        ...loggerFileStorage,
                        attributionCensusEnabled: (event.currentTarget as HTMLInputElement).checked,
                      };
                      void saveLoggerFileStorage();
                    }}
                    class="h-4 w-4"
                  />
                  <div>
                    <div>{t("debug.attributionCensus", "Attribution census")}</div>
                    <div class="text-xs text-muted-foreground">{t("debug.attributionCensusDescription", "Dev-only aggregate damage-id census for attribution discovery. Off on every app start.")}</div>
                  </div>
                </label>
              {/if}

              <label class="flex items-center gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  bind:checked={deleteOldFilesEnabled}
                  onchange={() => void saveLoggerFileStorage()}
                  class="h-4 w-4"
                />
                <div class="flex flex-1 flex-wrap items-center gap-3">
                  <div>
                    <div>{t("debug.deleteOldFiles", "Delete log files older than")}</div>
                    <div class="text-xs text-muted-foreground">{t("debug.deleteOldFilesDescription", "Automatically removes older log files from the EventLogs folder.")}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      bind:value={deleteOldFilesDaysInput}
                      class="w-24 rounded-md border border-border/60 bg-background-main px-3 py-2 text-sm"
                      disabled={!deleteOldFilesEnabled}
                      onchange={() => void saveLoggerFileStorage()}
                    />
                    <span class="text-xs text-muted-foreground">{t("debug.days", "days")}</span>
                  </div>
                </div>
              </label>
            </div>
          </section>

          <section class="rounded-lg border border-border/60 bg-background-main/50 p-4">
            <h3 class="mb-3 text-sm font-semibold">{t("debug.storagePath", "Storage Path")}</h3>
            <div class="space-y-3 text-sm">
              <div class="space-y-1">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("debug.currentFolder", "Current folder")}</div>
                <div class="break-all rounded-md border border-border/60 bg-background-main px-3 py-2 font-mono text-xs">
                  {#if loggerFileStorage}
                    {loggerFileStorage.resolvedDirectory}
                  {:else if loggerFileStorageLoading}
                    {t("debug.loading", "Loading…")}
                  {:else}
                    {t("debug.unavailable", "Unavailable")}
                  {/if}
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">{t("debug.filePattern", "File pattern")}</div>
                <div class="rounded-md border border-border/60 bg-background-main px-3 py-2 font-mono text-xs">
                  EventLogs\&lt;YYYY.MM.DD&gt;\&lt;characterName&gt;.&lt;characterUid&gt;.&lt;sceneName&gt;.&lt;DDMMYYYY-HHMMSS&gt;.json
                </div>
              </div>

              <p class="text-xs text-muted-foreground">
                {t("debug.sceneChangeNotice", "Files are written automatically when the scene changes, the encounter resets, or the live loop exits. Each day is stored in its own YYYY.MM.DD subfolder.")}
              </p>

              {#if loggerFileStorageError}
                <div class="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {loggerFileStorageError}
                </div>
              {/if}
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
            <input class="w-full rounded-md border border-border/60 bg-background-main px-3 py-2 font-mono" readonly value={definitionEditor.uid} />
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
            <input bind:value={definitionEditor.name} class="w-full rounded-md border border-border/60 bg-background-main px-3 py-2" placeholder={t("editor.placeholder.name", "Enter a custom display name")} />
          </label>

          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">{t("editor.notes", "Notes")}</span>
            <textarea bind:value={definitionEditor.notes} class="min-h-[96px] w-full rounded-md border border-border/60 bg-background-main px-3 py-2" placeholder={t("editor.placeholder.notes", "Optional notes")}></textarea>
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
