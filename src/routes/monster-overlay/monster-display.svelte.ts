import {
  getBuffCategoryLabel,
  getBuffIdsByCategory,
  resolveBuffDisplayName,
  type BuffCategoryKey,
} from "$lib/config/buff-name-table";
import { resolveDbmSkillName } from "$lib/config/dbm-table";
import { resolveMonsterName } from "$lib/config/game-names";
import { t } from "$lib/i18n/index.svelte";
import { uidFromEntityUuid, type EntityId } from "$lib/entity-id";
import {
  SETTINGS,
  ensureBuffAlerts,
  getGlobalBuffAliases,
  type TeammateBuffColumnKey,
} from "$lib/settings-store";
import type {
  BuffUpdateState,
  HateEntry,
  StunEntry,
  TeammateFantasyState,
} from "$lib/api";
import {
  buildBuffTextRow,
  formatTimerText,
  resolveAlertState,
} from "../game-overlay/overlay-utils";
import type { BuffAlertState, TextBuffDisplay } from "../game-overlay/overlay-types";
import {
  isMonsterLayoutScaffold,
  monsterRuntime,
} from "./monster-runtime.svelte.js";
import {
  fantasyEntryKey,
  withPreservedFantasySummonerName,
} from "./monster-fantasy";
import type {
  MonsterBossBuffSection,
  MonsterFantasyRow,
  MonsterHateSection,
  MonsterStunSection,
  MonsterTeammateBuffColumn,
  MonsterTeammateBuffRow,
} from "./monster-types";

const FANTASY_DISPLAY_TTL_MS = 5000;
const STUN_BROKEN_HIGHLIGHT_COLOR = "#ff4d4f";
const STUN_BROKEN_FLASH_INTERVAL_MS = 600;

type TeammateColumnDefinition =
  | {
      key: TeammateBuffColumnKey;
      label: string;
      kind: "buff";
      buffId: number;
    }
  | {
      key: TeammateBuffColumnKey;
      label: string;
      kind: "category";
      categoryKey: BuffCategoryKey;
      buffIds: number[];
    };

function selectedMonsterBuffIds() {
  return Array.from(
    new Set([
      ...SETTINGS.monsterMonitor.state.monitoredBuffIds,
      ...SETTINGS.monsterMonitor.state.selfAppliedBuffIds,
    ]),
  );
}

function buildPlaceholderRows(now: number): TextBuffDisplay[] {
  const aliases = getGlobalBuffAliases();
  const selectedIds = selectedMonsterBuffIds();
  const priorityIds = SETTINGS.monsterMonitor.state.buffPriorityIds ?? [];

  const priorityIndex = new Map<number, number>();
  priorityIds.forEach((id, idx) => priorityIndex.set(id, idx));
  const fallbackBase = priorityIds.length;

  const sortedIds = [...selectedIds].sort((left, right) => {
    const leftPriority = priorityIndex.has(left)
      ? priorityIndex.get(left)!
      : fallbackBase + selectedIds.indexOf(left);
    const rightPriority = priorityIndex.has(right)
      ? priorityIndex.get(right)!
      : fallbackBase + selectedIds.indexOf(right);
    return leftPriority - rightPriority;
  });

  const rows = sortedIds
    .map((baseId) =>
      buildBuffTextRow(
        `monster_preview_${baseId}`,
        resolveBuffDisplayName(baseId, aliases),
        {
          baseId,
          durationMs: 0,
          createTimeMs: now,
          layer: 1,
        },
        now,
        true,
      ),
    )
    .filter((row): row is TextBuffDisplay => row !== null);

  if (rows.length > 0) return rows;

  return [
    {
      key: "monster_preview_empty",
      label: t("monsterOverlay.placeholder.selectBuff"),
      valueText: "--",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
  ];
}

function buildHatePlaceholderRows(): TextBuffDisplay[] {
  return [
    {
      key: "monster_hate_preview_1",
      label: `1. ${t("monsterOverlay.entity.uid", { uid: 10001 })}`,
      valueText: "100%",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
    {
      key: "monster_hate_preview_2",
      label: `2. ${t("monsterOverlay.entity.uid", { uid: 10002 })}`,
      valueText: "68%",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
    {
      key: "monster_hate_preview_3",
      label: `3. ${t("monsterOverlay.entity.uid", { uid: 10003 })}`,
      valueText: "41%",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
  ];
}

function buildTeammatePlaceholderRows(
  columns: MonsterTeammateBuffColumn[],
): MonsterTeammateBuffRow[] {
  const effectiveColumns =
    columns.length > 0
      ? columns
      : [
          {
            key: "placeholder",
            label: t("monsterOverlay.placeholder.buffName"),
            buffIds: [0],
          },
        ];

  return [
    {
      teammateEntityUuid: "teammate_preview_1",
      teammateName: t("monsterOverlay.placeholder.teammate"),
      isPlaceholder: true,
      cells: effectiveColumns.map((column, index) => ({
        key: `teammate_preview_cell_${index + 1}`,
        buffId: column.buffIds[0] ?? 0,
        buffName: column.label,
        valueText: index === 0 ? "12s" : "--",
        metaText: index === 0 ? "x2" : undefined,
        progressPercent: index === 0 ? 60 : 0,
        hasBuff: true,
        categoryKey: "categoryKey" in column ? column.categoryKey : undefined,
      })),
    },
  ];
}

function buildTeammateColumnDefinitions(
  aliases: ReturnType<typeof getGlobalBuffAliases>,
): TeammateColumnDefinition[] {
  const state = SETTINGS.monsterMonitor.state;
  const teammateBuffIds = state.teammateBuffIds ?? [];
  const teammateBuffCategories = state.teammateBuffCategories ?? [];
  const columns: TeammateColumnDefinition[] = teammateBuffIds.map((buffId) => ({
    key: `buff:${buffId}`,
    label: resolveBuffDisplayName(buffId, aliases),
    kind: "buff",
    buffId,
  }));

  for (const categoryKey of teammateBuffCategories) {
    columns.push({
      key: `category:${categoryKey}`,
      label: getBuffCategoryLabel(categoryKey),
      kind: "category",
      categoryKey,
      buffIds: getBuffIdsByCategory(categoryKey),
    });
  }

  return orderTeammateColumns(columns, state.teammateBuffColumnOrder ?? []);
}

function orderTeammateColumns(
  columns: TeammateColumnDefinition[],
  order: TeammateBuffColumnKey[],
): TeammateColumnDefinition[] {
  const columnMap = new Map(columns.map((column) => [column.key, column]));
  const ordered: TeammateColumnDefinition[] = [];
  const used = new Set<TeammateBuffColumnKey>();

  for (const key of order) {
    const column = columnMap.get(key);
    if (!column || used.has(key)) continue;
    ordered.push(column);
    used.add(key);
  }

  for (const column of columns) {
    if (used.has(column.key)) continue;
    ordered.push(column);
  }

  return ordered;
}

function toTeammateDisplayColumns(
  columns: TeammateColumnDefinition[],
): MonsterTeammateBuffColumn[] {
  return columns.map((column) => ({
    key: column.key,
    buffIds: column.kind === "buff" ? [column.buffId] : [...column.buffIds],
    label: column.label,
    categoryKey: column.kind === "category" ? column.categoryKey : undefined,
  }));
}

function filterInactiveTeammateColumns(
  columns: MonsterTeammateBuffColumn[],
  rows: MonsterTeammateBuffRow[],
): {
  columns: MonsterTeammateBuffColumn[];
  rows: MonsterTeammateBuffRow[];
} {
  const activeColumnIndexes = columns
    .map((_, index) => index)
    .filter((index) => rows.some((row) => row.cells[index]?.hasBuff === true));

  return {
    columns: activeColumnIndexes.map((index) => columns[index]!),
    rows: rows
      .map((row) => {
        const cells = activeColumnIndexes
          .map((index) => row.cells[index])
          .filter((cell) => cell !== undefined);
        return { ...row, cells };
      })
      .filter((row) => row.cells.some((cell) => cell.hasBuff)),
  };
}

function pickLatestBuff(
  buffMap: Map<number, BuffUpdateState>,
  buffIds: number[],
): BuffUpdateState | undefined {
  let latest: BuffUpdateState | undefined;
  for (const buffId of buffIds) {
    const buff = buffMap.get(buffId);
    if (!buff) continue;
    if (!latest || buff.createTimeMs >= latest.createTimeMs) {
      latest = buff;
    }
  }
  return latest;
}

function resolveEntityDisplayName(entityUuid: EntityId): string {
  const playerName = monsterRuntime.playerNameCache.get(entityUuid);
  if (playerName) return playerName;

  const monsterId = monsterRuntime.monsterIdCache.get(entityUuid);
  if (monsterId !== undefined) return resolveMonsterName(monsterId);

  return t("monsterOverlay.entity.uid", { uid: uidFromEntityUuid(entityUuid) });
}

function stripFantasySuffix(name: string): string {
  const separatorIndex = name.indexOf("-");
  return (
    (separatorIndex >= 0 ? name.slice(0, separatorIndex) : name).trim() || name
  );
}

function resolveFantasyName(monsterId: number): string {
  const alias =
    SETTINGS.monsterMonitor.state.fantasyMonsterAliases?.[
      String(monsterId)
    ]?.trim();
  if (alias) return alias;
  return stripFantasySuffix(resolveMonsterName(monsterId));
}

function isResonanceFantasyMonsterId(monsterId: number): boolean {
  return /^300\d{4}$/.test(String(monsterId));
}

function buildFantasyPlaceholderRows(): MonsterFantasyRow[] {
  return [
    {
      key: "fantasy_preview_1",
      summonUuid: "fantasy_preview_1",
      summonerName: t("monsterOverlay.placeholder.teammate"),
      fantasyName: t("monsterOverlay.placeholder.fantasy"),
      levelText: "Lv3",
      isPlaceholder: true,
    },
    {
      key: "fantasy_preview_2",
      summonUuid: "fantasy_preview_2",
      summonerName: t("monsterOverlay.placeholder.teammate"),
      fantasyName: t("monsterOverlay.placeholder.fantasy"),
      levelText: "Lv2",
      isPlaceholder: true,
    },
  ];
}

function sortFantasyEntries(
  entries: TeammateFantasyState[],
  persistentDisplay: boolean,
) {
  return [...entries].sort((left, right) => {
    if (!persistentDisplay) {
      return right.detectedAtMs - left.detectedAtMs;
    }

    return (
      left.summonerUuid.localeCompare(right.summonerUuid) ||
      left.monsterId - right.monsterId ||
      left.remodelLevel - right.remodelLevel
    );
  });
}

function buildFantasyRows(now: number): MonsterFantasyRow[] {
  const state = SETTINGS.monsterMonitor.state;
  const persistentDisplay = state.fantasyPersistentDisplay === true;
  const latestByFantasy = new Map<string, TeammateFantasyState>();
  for (const entry of monsterRuntime.fantasyEntries) {
    if (
      !persistentDisplay &&
      entry.detectedAtMs + FANTASY_DISPLAY_TTL_MS <= now
    ) {
      continue;
    }
    const key = fantasyEntryKey(entry);
    const existing = latestByFantasy.get(key);
    if (!existing || entry.detectedAtMs >= existing.detectedAtMs) {
      latestByFantasy.set(
        key,
        withPreservedFantasySummonerName(entry, existing),
      );
      continue;
    }

    if (!existing.summonerName && entry.summonerName) {
      latestByFantasy.set(key, {
        ...existing,
        summonerName: entry.summonerName,
      });
    }
  }

  const activeEntries = sortFantasyEntries(
    [...latestByFantasy.values()],
    persistentDisplay,
  );
  monsterRuntime.fantasyEntries = activeEntries;

  const whitelist = new Set(state.fantasyWhitelistMonsterIds ?? []);
  const fantasyEntries = activeEntries.filter((entry) =>
    isResonanceFantasyMonsterId(entry.monsterId),
  );
  const filteredEntries =
    state.fantasyShowAll === true
      ? fantasyEntries
      : fantasyEntries.filter((entry) => whitelist.has(entry.monsterId));

  return filteredEntries.map((entry) => {
    const summonerName =
      entry.summonerName ||
      monsterRuntime.playerNameCache.get(entry.summonerUuid) ||
      t("monsterOverlay.entity.uid", {
        uid: uidFromEntityUuid(entry.summonerUuid),
      });
    const key = fantasyEntryKey(entry);
    return {
      key: `fantasy_${key}`,
      summonUuid: entry.summonUuid,
      summonerName,
      fantasyName: resolveFantasyName(entry.monsterId),
      levelText: `Lv${entry.remodelLevel}`,
    };
  });
}

function resolveMonsterSectionTitle(entityUuid: EntityId): string {
  const monsterId = monsterRuntime.monsterIdCache.get(entityUuid);
  if (monsterId !== undefined) return resolveMonsterName(monsterId);

  return t("monsterOverlay.placeholder.target", {
    uid: uidFromEntityUuid(entityUuid),
  });
}

function buildDbmRows(now: number): TextBuffDisplay[] {
  const entries: { createTimeMs: number; row: TextBuffDisplay }[] = [];
  for (const [baseSkillId, event] of monsterRuntime.bossDbmMap) {
    const remainingMs = Math.max(
      0,
      event.createTimeMs + event.durationMs - now,
    );
    if (remainingMs <= 0) {
      // Pulse expired: drop it so the map stays bounded across encounters.
      monsterRuntime.bossDbmMap.delete(baseSkillId);
      continue;
    }
    entries.push({
      createTimeMs: event.createTimeMs,
      row: {
        key: `${event.baseSkillId}:${event.skillEffectId}`,
        label: resolveDbmSkillName(
          event.skillEffectId,
          event.baseSkillId,
          SETTINGS.monsterMonitor.state.dbmAliases,
        ),
        valueText: formatTimerText(remainingMs),
        progressPercent: Math.min(
          100,
          Math.max(0, (remainingMs / event.durationMs) * 100),
        ),
        showProgress: true,
      },
    });
  }
  return entries
    .sort((left, right) => left.createTimeMs - right.createTimeMs)
    .map((entry) => entry.row);
}

function buildDbmPlaceholderRows(): TextBuffDisplay[] {
  return [
    {
      key: "monster_dbm_preview",
      label: t("monsterOverlay.placeholder.bossDbm"),
      valueText: "12.0",
      progressPercent: 60,
      showProgress: true,
      isPlaceholder: true,
    },
  ];
}

function buildHateRows(
  entries: HateEntry[],
  maxDisplay: number,
): TextBuffDisplay[] {
  const sortedEntries = [...entries].sort((left, right) => {
    if (right.hateVal !== left.hateVal) {
      return right.hateVal - left.hateVal;
    }
    return left.entityUuid.localeCompare(right.entityUuid);
  });

  const normalizedHateValues = sortedEntries.map((entry) =>
    Math.max(entry.hateVal, 0),
  );
  const totalHate = normalizedHateValues.reduce(
    (sum, hateVal) => sum + hateVal,
    0,
  );

  let displayPercents = new Array<number>(sortedEntries.length).fill(0);
  if (totalHate > 0) {
    const percentParts = normalizedHateValues.map((hateVal, index) => {
      const exactPercent = (hateVal / totalHate) * 100;
      const basePercent = Math.floor(exactPercent);
      return {
        index,
        basePercent,
        remainder: exactPercent - basePercent,
      };
    });

    let remainingPercent =
      100 - percentParts.reduce((sum, part) => sum + part.basePercent, 0);

    percentParts
      .sort(
        (left, right) =>
          right.remainder - left.remainder || left.index - right.index,
      )
      .forEach((part) => {
        if (remainingPercent <= 0) return;
        part.basePercent += 1;
        remainingPercent -= 1;
      });

    displayPercents = percentParts
      .sort((left, right) => left.index - right.index)
      .map((part) => part.basePercent);
  }

  return sortedEntries
    .map((entry, index) => ({
      key: `hate_${entry.entityUuid}`,
      label: `${index + 1}. ${resolveEntityDisplayName(entry.entityUuid)}`,
      valueText: `${displayPercents[index] ?? 0}%`,
      progressPercent: 0,
      showProgress: false,
    }))
    .slice(0, maxDisplay);
}

function buildStunRows(entry: StunEntry): TextBuffDisplay[] {
  const { current, max } = entry;
  if (max <= 0) return [];
  const ratio = Math.min(1, Math.max(0, current / max));
  const progressPercent = Math.round(ratio * 100);
  const isBroken = current <= 0;
  const alert: BuffAlertState | undefined = isBroken
    ? {
        highlightColor: STUN_BROKEN_HIGHLIGHT_COLOR,
        flash: true,
        flashIntervalMs: STUN_BROKEN_FLASH_INTERVAL_MS,
        applyToProgress: true,
      }
    : undefined;
  return [
    {
      key: `stun_${entry.bossEntityUuid}`,
      label: isBroken
        ? t("monsterOverlay.stunBroken")
        : t("monsterOverlay.stunLabel"),
      valueText: isBroken
        ? t("monsterOverlay.stunBrokenValue", { max })
        : `${current} / ${max}`,
      progressPercent,
      showProgress: true,
      alert,
    },
  ];
}

function buildStunPlaceholderRows(): TextBuffDisplay[] {
  return [
    {
      key: "stun_preview",
      label: t("monsterOverlay.stunLabel"),
      valueText: "1600 / 2000",
      progressPercent: 80,
      showProgress: true,
      isPlaceholder: true,
    },
  ];
}

export function updateMonsterDisplay() {
  const now = Date.now();
  const aliases = getGlobalBuffAliases();
  const alertMap = ensureBuffAlerts(SETTINGS.monsterMonitor.state.buffAlerts);
  const resolveAlert = (
    baseId: number,
    remainingMs: number,
    durationMs: number,
  ) => resolveAlertState(alertMap[String(baseId)], remainingMs, durationMs);
  const selectedIds = selectedMonsterBuffIds();
  const teammateColumns = buildTeammateColumnDefinitions(aliases);
  const fullTeammateDisplayColumns = toTeammateDisplayColumns(teammateColumns);

  const priorityIds = SETTINGS.monsterMonitor.state.buffPriorityIds ?? [];
  const priorityIndex = new Map<number, number>();
  priorityIds.forEach((id, idx) => priorityIndex.set(id, idx));
  const fallbackBase = priorityIds.length;
  selectedIds.forEach((id, idx) => {
    if (!priorityIndex.has(id)) {
      priorityIndex.set(id, fallbackBase + idx);
    }
  });

  const nextSections: MonsterBossBuffSection[] = [];
  const nextTeammateRows: MonsterTeammateBuffRow[] = [];
  const nextHateSections: MonsterHateSection[] = [];
  const nextStunSections: MonsterStunSection[] = [];
  let nextFantasyRows = buildFantasyRows(now);

  const sortedBossUids = Array.from(monsterRuntime.bossBuffMap.keys()).sort();

  for (const bossUid of sortedBossUids) {
    const buffMap = monsterRuntime.bossBuffMap.get(bossUid) ?? new Map();
    const buffRows = Array.from(buffMap.values())
      .sort((left, right) => {
        const leftPriority =
          priorityIndex.get(left.baseId) ?? Number.MAX_SAFE_INTEGER;
        const rightPriority =
          priorityIndex.get(right.baseId) ?? Number.MAX_SAFE_INTEGER;
        return leftPriority - rightPriority || left.baseId - right.baseId;
      })
      .map((buff) =>
        buildBuffTextRow(
          `monster_${bossUid}_${buff.baseId}`,
          resolveBuffDisplayName(buff.baseId, aliases),
          buff,
          now,
          false,
          false,
          resolveAlert,
        ),
      )
      .filter((row): row is TextBuffDisplay => row !== null);

    if (buffRows.length === 0) continue;
    nextSections.push({
      bossEntityUuid: bossUid,
      title: resolveMonsterSectionTitle(bossUid),
      rows: buffRows,
      kind: "monster",
    });
  }

  const sortedTeammateUuids = Array.from(
    monsterRuntime.teammateBuffMap.keys(),
  ).sort();

  for (const teammateUuid of sortedTeammateUuids) {
    const buffMap =
      monsterRuntime.teammateBuffMap.get(teammateUuid) ?? new Map();
    const cells = teammateColumns.map((column) => {
      if (column.kind === "buff") {
        const buff = buffMap.get(column.buffId);
        const buffName = resolveBuffDisplayName(column.buffId, aliases);
        if (!buff) {
          return {
            key: `teammate_${teammateUuid}_${column.key}_empty`,
            buffId: column.buffId,
            buffName,
            valueText: "",
            progressPercent: 0,
            hasBuff: false,
          };
        }

        const row = buildBuffTextRow(
          `teammate_${teammateUuid}_${column.key}`,
          buffName,
          buff,
          now,
          false,
          false,
          resolveAlert,
        );
        if (!row) {
          return {
            key: `teammate_${teammateUuid}_${column.key}_empty`,
            buffId: column.buffId,
            buffName,
            valueText: "",
            progressPercent: 0,
            hasBuff: false,
          };
        }

        return {
          key: `teammate_${teammateUuid}_${column.key}`,
          buffId: column.buffId,
          buffName,
          valueText: row.valueText,
          metaText: row.metaText,
          progressPercent: row.progressPercent,
          hasBuff: true,
          alert: row.alert,
        };
      }

      const buff = pickLatestBuff(buffMap, column.buffIds);
      const buffName = buff
        ? resolveBuffDisplayName(buff.baseId, aliases)
        : column.label;
      if (!buff) {
        return {
          key: `teammate_${teammateUuid}_${column.key}_empty`,
          buffId: column.buffIds[0] ?? 0,
          buffName: column.label,
          valueText: "",
          progressPercent: 0,
          hasBuff: false,
          categoryKey: column.categoryKey,
        };
      }

      const row = buildBuffTextRow(
        `teammate_${teammateUuid}_${column.key}`,
        buffName,
        buff,
        now,
        false,
        false,
        resolveAlert,
      );
      if (!row) {
        return {
          key: `teammate_${teammateUuid}_${column.key}_empty`,
          buffId: buff.baseId,
          buffName,
          valueText: "",
          progressPercent: 0,
          hasBuff: false,
          categoryKey: column.categoryKey,
          matchedBuffId: buff.baseId,
        };
      }

      return {
        key: `teammate_${teammateUuid}_${column.key}`,
        buffId: buff.baseId,
        buffName,
        valueText: row.valueText,
        metaText: row.metaText,
        progressPercent: row.progressPercent,
        hasBuff: true,
        alert: row.alert,
        categoryKey: column.categoryKey,
        matchedBuffId: buff.baseId,
      };
    });

    if (!cells.some((cell) => cell.hasBuff)) continue;

    nextTeammateRows.push({
      teammateEntityUuid: teammateUuid,
      teammateName: resolveEntityDisplayName(teammateUuid),
      cells,
    });
  }

  if (SETTINGS.monsterMonitor.state.hateListEnabled) {
    const sortedHateBossUids = Array.from(
      monsterRuntime.bossHateMap.keys(),
    ).sort();
    const maxDisplay = SETTINGS.monsterMonitor.state.hateListMaxDisplay ?? 5;

    for (const bossUid of sortedHateBossUids) {
      const hateRows = buildHateRows(
        monsterRuntime.bossHateMap.get(bossUid) ?? [],
        maxDisplay,
      );
      if (hateRows.length === 0) continue;
      nextHateSections.push({
        bossEntityUuid: bossUid,
        title: resolveMonsterSectionTitle(bossUid),
        rows: hateRows,
      });
    }
  }

  if (nextSections.length === 0 && isMonsterLayoutScaffold()) {
    nextSections.push({
      bossEntityUuid: "0",
      title: t("monsterOverlay.placeholder.preview"),
      rows: buildPlaceholderRows(now),
      isPlaceholder: true,
    });
  }

  if (
    SETTINGS.monsterMonitor.state.hateListEnabled &&
    nextHateSections.length === 0 &&
    isMonsterLayoutScaffold()
  ) {
    nextHateSections.push({
      bossEntityUuid: "0",
      title: t("monsterOverlay.placeholder.target", { uid: 0 }),
      rows: buildHatePlaceholderRows(),
      isPlaceholder: true,
    });
  }

  if (SETTINGS.monsterMonitor.state.stunListEnabled) {
    const sortedStunBossUids = Array.from(
      monsterRuntime.bossStunMap.keys(),
    ).sort();
    for (const bossUid of sortedStunBossUids) {
      const entry = monsterRuntime.bossStunMap.get(bossUid);
      if (!entry) continue;
      const stunRows = buildStunRows(entry);
      if (stunRows.length === 0) continue;
      nextStunSections.push({
        bossEntityUuid: bossUid,
        title: resolveMonsterSectionTitle(bossUid),
        rows: stunRows,
      });
    }
  }

  if (
    SETTINGS.monsterMonitor.state.stunListEnabled &&
    nextStunSections.length === 0 &&
    isMonsterLayoutScaffold()
  ) {
    nextStunSections.push({
      bossEntityUuid: "0",
      title: t("monsterOverlay.placeholder.target", { uid: 0 }),
      rows: buildStunPlaceholderRows(),
      isPlaceholder: true,
    });
  }

  if (nextFantasyRows.length === 0 && isMonsterLayoutScaffold()) {
    nextFantasyRows = buildFantasyPlaceholderRows();
  }

  let nextDbmRows = buildDbmRows(now);
  if (nextDbmRows.length === 0 && isMonsterLayoutScaffold()) {
    nextDbmRows = buildDbmPlaceholderRows();
  }

  monsterRuntime.bossSections = nextSections;
  if (nextTeammateRows.length > 0) {
    const filteredTeammates = filterInactiveTeammateColumns(
      fullTeammateDisplayColumns,
      nextTeammateRows,
    );
    monsterRuntime.teammateColumns = filteredTeammates.columns;
    monsterRuntime.teammateRows = filteredTeammates.rows;
  } else {
    monsterRuntime.teammateColumns = fullTeammateDisplayColumns;
    monsterRuntime.teammateRows = isMonsterLayoutScaffold()
      ? buildTeammatePlaceholderRows(fullTeammateDisplayColumns)
      : [];
  }
  monsterRuntime.hateSections = nextHateSections;
  monsterRuntime.stunSections = nextStunSections;
  monsterRuntime.fantasyRows = nextFantasyRows;
  monsterRuntime.dbmRows = nextDbmRows;
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);
}
