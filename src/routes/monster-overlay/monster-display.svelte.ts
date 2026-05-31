import {
  getBuffCategoryLabel,
  getBuffIdsByCategory,
  resolveBuffDisplayName,
  type BuffCategoryKey,
} from "$lib/config/buff-name-table";
import { resolveMonsterName } from "$lib/config/game-names";
import { t } from "$lib/i18n/index.svelte";
import { uidFromEntityUuid, type EntityId } from "$lib/entity-id";
import {
  SETTINGS,
  ensureBuffAliases,
  ensureBuffAlerts,
} from "$lib/settings-store";
import type { BuffUpdateState, HateEntry } from "$lib/api";
import {
  buildBuffTextRow,
  resolveAlertState,
} from "../game-overlay/overlay-utils";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import { monsterRuntime } from "./monster-runtime.svelte.js";
import type {
  MonsterBossBuffSection,
  MonsterHateSection,
  MonsterTeammateBuffColumn,
  MonsterTeammateBuffRow,
} from "./monster-types";

type TeammateColumnDefinition =
  | {
      key: string;
      label: string;
      kind: "buff";
      buffId: number;
    }
  | {
      key: string;
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
  const aliases = ensureBuffAliases(SETTINGS.monsterMonitor.state.buffAliases);
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
  aliases: ReturnType<typeof ensureBuffAliases>,
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

  return columns;
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

function resolveMonsterSectionTitle(entityUuid: EntityId): string {
  const monsterId = monsterRuntime.monsterIdCache.get(entityUuid);
  if (monsterId !== undefined) return resolveMonsterName(monsterId);

  return t("monsterOverlay.placeholder.target", {
    uid: uidFromEntityUuid(entityUuid),
  });
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

export function updateMonsterDisplay() {
  const now = Date.now();
  const aliases = ensureBuffAliases(SETTINGS.monsterMonitor.state.buffAliases);
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

  if (nextSections.length === 0 && monsterRuntime.isEditing) {
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
    monsterRuntime.isEditing
  ) {
    nextHateSections.push({
      bossEntityUuid: "0",
      title: t("monsterOverlay.placeholder.target", { uid: 0 }),
      rows: buildHatePlaceholderRows(),
      isPlaceholder: true,
    });
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
    monsterRuntime.teammateRows = monsterRuntime.isEditing
      ? buildTeammatePlaceholderRows(fullTeammateDisplayColumns)
      : [];
  }
  monsterRuntime.hateSections = nextHateSections;
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);
}
