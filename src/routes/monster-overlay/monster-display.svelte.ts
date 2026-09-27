import {
  getBuffCategoryLabel,
  getBuffIdsByCategory,
  resolveBuffDisplayName,
  type BuffCategoryKey,
} from "$lib/config/buff-name-table";
import { untrack } from "svelte";
import { resolveDbmSkillName } from "$lib/config/dbm-table";
import { resolveMonsterName } from "$lib/config/game-names";
import { t } from "$lib/i18n/index.svelte";
import { uidFromEntityUuid, type EntityId } from "$lib/entity-id";
import {
  SETTINGS,
  ensureBuffAlerts,
  getGlobalBuffAliases,
  type EntityDurationEntry,
  type TeammateDeadRowPlacement,
} from "$lib/settings-store";
import { ensureEntityDurationEntries } from "$lib/entity-duration-entries";
import {
  orderedTeammateColumns,
  type TeammateColumnRef,
} from "$lib/teammate-buff-columns";
import { buildEntityDurationRows } from "./monster-entity-duration";
import type {
  BuffUpdateState,
  HateEntry,
  HpEntry,
  StunEntry,
  TeammateFantasyState,
} from "$lib/api";
import {
  buildBuffTextRow,
  formatTimerText,
} from "../game-overlay/overlay-utils";
import type {
  BuffAlertState,
  TextBuffDisplay,
} from "../game-overlay/overlay-types";
import {
  clearHudProjectionDeadline,
  hudProjectionRevision,
  hudTemporalProgressPercent,
  hudTemporalRemainingMs,
  setHudProjectionDeadline,
  type HudTemporalValue,
} from "$lib/hud-temporal.svelte.js";
import {
  isMonsterLayoutScaffold,
  monsterBossBuffs,
  monsterBossMechanics,
  monsterDeadTeammates,
  monsterEntityDurationTracks,
  monsterFantasyEntries,
  monsterHateLists,
  monsterHpEntries,
  monsterIds,
  monsterPlayerNames,
  monsterRuntime,
  monsterStunEntries,
  monsterTeammateBuffs,
} from "./monster-runtime.svelte.js";
import {
  fantasyEntryKey,
  withPreservedFantasySummonerName,
} from "./monster-fantasy";
import type {
  MonsterBossBuffSection,
  MonsterFantasyRow,
  MonsterHateSection,
  MonsterHpSection,
  MonsterStunSection,
  MonsterTeammateBuffCell,
  MonsterTeammateBuffColumn,
  MonsterTeammateBuffRow,
} from "./monster-types";
import {
  getMonsterOverlayVisibility,
  teammatePanelStyle,
} from "./monster-layout.svelte.js";
import {
  latestBuffsByCategory,
  orderTeammateUuids,
} from "./monster-teammate-projection";

const FANTASY_DISPLAY_TTL_MS = 5000;
const STUN_BROKEN_HIGHLIGHT_COLOR = "#ff4d4f";
const STUN_BROKEN_FLASH_INTERVAL_MS = 600;
export const MONSTER_TEAMMATE_DEADLINE_SOURCE = "hud-overlay:monster-teammate";
export const MONSTER_BOSS_DEADLINE_SOURCE = "hud-overlay:monster-boss";
export const MONSTER_FANTASY_DEADLINE_SOURCE = "hud-overlay:monster-fantasy";
export const MONSTER_DBM_DEADLINE_SOURCE = "hud-overlay:monster-dbm";
export const MONSTER_ENTITY_DURATION_DEADLINE_SOURCE =
  "hud-overlay:monster-entity-duration";
export const MONSTER_PROJECTION_DEADLINE_SOURCES = [
  MONSTER_TEAMMATE_DEADLINE_SOURCE,
  MONSTER_BOSS_DEADLINE_SOURCE,
  MONSTER_FANTASY_DEADLINE_SOURCE,
  MONSTER_DBM_DEADLINE_SOURCE,
  MONSTER_ENTITY_DURATION_DEADLINE_SOURCE,
] as const;

type TeammateDisplay = {
  columns: MonsterTeammateBuffColumn[];
  rows: MonsterTeammateBuffRow[];
};

let lastTeammateDisplay: TeammateDisplay = { columns: [], rows: [] };

function sameTemporal(
  left: HudTemporalValue | undefined,
  right: HudTemporalValue | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.deadlineMs === right.deadlineMs &&
    left.durationMs === right.durationMs &&
    left.alert?.thresholdMs === right.alert?.thresholdMs &&
    left.alert?.state.highlightColor === right.alert?.state.highlightColor &&
    left.alert?.state.flash === right.alert?.state.flash
  );
}

function sameTeammateCell(
  left: MonsterTeammateBuffCell,
  right: MonsterTeammateBuffCell,
): boolean {
  return (
    left.key === right.key &&
    left.buffId === right.buffId &&
    left.buffName === right.buffName &&
    left.hasBuff === right.hasBuff &&
    left.metaText === right.metaText &&
    left.categoryKey === right.categoryKey &&
    left.matchedBuffId === right.matchedBuffId &&
    sameTemporal(left.temporal, right.temporal)
  );
}

function reuseTeammateCell(
  previous: MonsterTeammateBuffCell | undefined,
  next: MonsterTeammateBuffCell,
): MonsterTeammateBuffCell {
  return previous && sameTeammateCell(previous, next) ? previous : next;
}

function reuseTeammateRow(
  previous: MonsterTeammateBuffRow | undefined,
  next: MonsterTeammateBuffRow,
): MonsterTeammateBuffRow {
  if (!previous || previous.teammateEntityUuid !== next.teammateEntityUuid) {
    return next;
  }
  const cells = next.cells.map((cell, index) =>
    reuseTeammateCell(previous.cells[index], cell),
  );
  const cellsUnchanged =
    cells.length === previous.cells.length &&
    cells.every((cell, index) => cell === previous.cells[index]);
  if (
    cellsUnchanged &&
    previous.teammateName === next.teammateName &&
    previous.isDead === next.isDead
  ) {
    return previous;
  }
  return { ...next, cells };
}

function reuseTeammateColumns(
  previous: MonsterTeammateBuffColumn[],
  next: MonsterTeammateBuffColumn[],
): MonsterTeammateBuffColumn[] {
  if (
    previous.length === next.length &&
    previous.every((column, index) => {
      const candidate = next[index];
      return (
        candidate !== undefined &&
        column.key === candidate.key &&
        column.label === candidate.label &&
        column.categoryKey === candidate.categoryKey
      );
    })
  ) {
    return previous;
  }
  return next;
}

function stabilizeTeammateDisplay(
  columns: MonsterTeammateBuffColumn[],
  rows: MonsterTeammateBuffRow[],
): TeammateDisplay {
  const previousByUuid = new Map(
    lastTeammateDisplay.rows.map((row) => [row.teammateEntityUuid, row]),
  );
  const nextRows = rows.map((row) =>
    reuseTeammateRow(previousByUuid.get(row.teammateEntityUuid), row),
  );
  const rowsUnchanged =
    nextRows.length === lastTeammateDisplay.rows.length &&
    nextRows.every((row, index) => row === lastTeammateDisplay.rows[index]);
  const next = {
    columns: reuseTeammateColumns(lastTeammateDisplay.columns, columns),
    rows: rowsUnchanged ? lastTeammateDisplay.rows : nextRows,
  };
  lastTeammateDisplay = next;
  return next;
}

export function resetMonsterTeammateDisplayStabilizer(): void {
  lastTeammateDisplay = { columns: [], rows: [] };
}

type TeammateColumnDefinition =
  | (Extract<TeammateColumnRef, { kind: "buff" }> & { label: string })
  | (Extract<TeammateColumnRef, { kind: "category" }> & {
      label: string;
      buffIds: number[];
    });

/** Shared by teammates with no watched buffs (dead rows). */
const NO_TEAMMATE_BUFFS: ReadonlyMap<number, BuffUpdateState> = new Map();

type TeammateColumnProjection = {
  definitions: TeammateColumnDefinition[];
  displayColumns: MonsterTeammateBuffColumn[];
  categoryKeysByBuffId: Map<number, BuffCategoryKey[]>;
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
          sourceRemodelLevel: null,
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

/**
 * Edit-mode preview: one living teammate with sample cells and one dead
 * teammate with empty cells, placed like real dead rows.
 */
function buildTeammatePlaceholderRows(
  columns: MonsterTeammateBuffColumn[],
  deadRowPlacement: TeammateDeadRowPlacement,
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

  const living: MonsterTeammateBuffRow = {
    teammateEntityUuid: "teammate_preview_1",
    teammateName: t("monsterOverlay.placeholder.teammate"),
    isDead: false,
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
  };
  const dead: MonsterTeammateBuffRow = {
    teammateEntityUuid: "teammate_preview_2",
    teammateName: t("monsterOverlay.placeholder.deadTeammate"),
    isDead: true,
    isPlaceholder: true,
    cells: effectiveColumns.map((column, index) => ({
      key: `teammate_preview_dead_cell_${index + 1}`,
      buffId: column.buffIds[0] ?? 0,
      buffName: column.label,
      valueText: "",
      progressPercent: 0,
      hasBuff: false,
      categoryKey: "categoryKey" in column ? column.categoryKey : undefined,
    })),
  };
  return deadRowPlacement === "first" ? [dead, living] : [living, dead];
}

function buildTeammateColumnDefinitions(
  aliases: ReturnType<typeof getGlobalBuffAliases>,
): TeammateColumnDefinition[] {
  return orderedTeammateColumns(SETTINGS.monsterMonitor.state).map(
    (column): TeammateColumnDefinition =>
      column.kind === "buff"
        ? { ...column, label: resolveBuffDisplayName(column.buffId, aliases) }
        : {
            ...column,
            label: getBuffCategoryLabel(column.categoryKey),
            buffIds: getBuffIdsByCategory(column.categoryKey),
          },
  );
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
      .filter((row) => row.isDead || row.cells.some((cell) => cell.hasBuff)),
  };
}

function createBuffNameResolver(
  aliases: ReturnType<typeof getGlobalBuffAliases>,
) {
  const names = new Map<number, string>();
  return (baseId: number): string => {
    const cached = names.get(baseId);
    if (cached !== undefined) return cached;
    const resolved = resolveBuffDisplayName(baseId, aliases);
    names.set(baseId, resolved);
    return resolved;
  };
}

function resolveEntityDisplayName(entityUuid: EntityId): string {
  const playerName = monsterPlayerNames().get(entityUuid);
  if (playerName) return playerName;

  const monsterId = monsterIds().get(entityUuid);
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

function sortFantasyEntries(entries: TeammateFantasyState[]) {
  return [...entries].sort(
    (left, right) => right.detectedAtMs - left.detectedAtMs,
  );
}

function buildFantasyRows(now: number): MonsterFantasyRow[] {
  const state = SETTINGS.monsterMonitor.state;
  const latestByFantasy = new Map<string, TeammateFantasyState>();
  for (const entry of monsterFantasyEntries()) {
    if (entry.detectedAtMs + FANTASY_DISPLAY_TTL_MS <= now) {
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

  const activeEntries = sortFantasyEntries([...latestByFantasy.values()]);
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
      monsterPlayerNames().get(entry.summonerUuid) ||
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
  const monsterId = monsterIds().get(entityUuid);
  if (monsterId !== undefined) return resolveMonsterName(monsterId);

  return t("monsterOverlay.placeholder.target", {
    uid: uidFromEntityUuid(entityUuid),
  });
}

function buildDbmRows(now: number): TextBuffDisplay[] {
  const entries: { createTimeMs: number; row: TextBuffDisplay }[] = [];
  for (const event of monsterBossMechanics().values()) {
    const temporal = {
      deadlineMs: event.createTimeMs + event.durationMs,
      durationMs: event.durationMs,
    };
    const remainingMs = hudTemporalRemainingMs(temporal, now);
    if (remainingMs <= 0) {
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
        progressPercent: hudTemporalProgressPercent(temporal, now),
        showProgress: true,
        temporal,
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

function buildHpRows(entry: HpEntry): TextBuffDisplay[] {
  if (entry.max <= 0) return [];
  const ratio = Math.min(1, Math.max(0, entry.current / entry.max));
  return [
    {
      key: `hp_${entry.bossEntityUuid}`,
      label: t("monsterOverlay.hpLabel"),
      metaText: `${Math.round(ratio * 100)}%`,
      valueText: `${entry.current} / ${entry.max}`,
      progressPercent: Math.round(ratio * 100),
      showProgress: true,
    },
  ];
}

function buildHpPlaceholderRows(): TextBuffDisplay[] {
  return [
    {
      key: "hp_preview",
      label: t("monsterOverlay.hpLabel"),
      metaText: "80%",
      valueText: "80000 / 100000",
      progressPercent: 80,
      showProgress: true,
      isPlaceholder: true,
    },
  ];
}

function createDeadlineTracker(now: number) {
  let nextDeadlineMs: number | null = null;
  return {
    include(deadlineMs: number) {
      if (deadlineMs <= now) return;
      if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
        nextDeadlineMs = deadlineMs;
      }
    },
    value() {
      return nextDeadlineMs;
    },
  };
}

function resolveAlertFor(baseId: number) {
  const alertMap = ensureBuffAlerts(SETTINGS.monsterMonitor.state.buffAlerts);
  return alertMap[String(baseId)];
}

function buildBossBuffPriorityIndex() {
  const selectedIds = selectedMonsterBuffIds();
  const priorityIds = SETTINGS.monsterMonitor.state.buffPriorityIds ?? [];
  const priorityIndex = new Map<number, number>();
  priorityIds.forEach((id, idx) => priorityIndex.set(id, idx));
  const fallbackBase = priorityIds.length;
  selectedIds.forEach((id, idx) => {
    if (!priorityIndex.has(id)) {
      priorityIndex.set(id, fallbackBase + idx);
    }
  });
  return priorityIndex;
}

function buildTeammateDisplay(
  now: number,
  columnProjection: TeammateColumnProjection,
  aliases: ReturnType<typeof getGlobalBuffAliases>,
  deadRowPlacement: TeammateDeadRowPlacement,
): {
  columns: MonsterTeammateBuffColumn[];
  rows: MonsterTeammateBuffRow[];
  nextDeadlineMs: number | null;
} {
  const teammateColumns = columnProjection.definitions;
  const fullTeammateDisplayColumns = columnProjection.displayColumns;
  const resolveTeammateBuffName = createBuffNameResolver(aliases);
  const alertMap = ensureBuffAlerts(SETTINGS.monsterMonitor.state.buffAlerts);
  const resolveTeammateAlert = (baseId: number) => alertMap[String(baseId)];
  const nextTeammateRows: MonsterTeammateBuffRow[] = [];
  const deadlines = createDeadlineTracker(now);
  const teammateBuffs = monsterTeammateBuffs();
  const deadTeammates = monsterDeadTeammates();
  const teammateUuids = orderTeammateUuids(
    [...teammateBuffs.keys(), ...deadTeammates],
    deadTeammates,
    deadRowPlacement,
  );

  for (const buffs of teammateBuffs.values()) {
    for (const buff of buffs.values()) {
      if (buff.durationMs > 0) {
        deadlines.include(buff.createTimeMs + buff.durationMs);
      }
    }
  }

  for (const teammateUuid of teammateUuids) {
    const buffMap = teammateBuffs.get(teammateUuid) ?? NO_TEAMMATE_BUFFS;
    const isDead = deadTeammates.has(teammateUuid);
    const latestByCategory = latestBuffsByCategory(
      buffMap,
      columnProjection.categoryKeysByBuffId,
    );
    const cells = teammateColumns.map((column) => {
      if (column.kind === "buff") {
        const buff = buffMap.get(column.buffId);
        const buffName = column.label;
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
          resolveTeammateAlert,
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
          temporal: row.temporal,
        };
      }

      const buff = latestByCategory.get(column.categoryKey);
      const buffName = buff
        ? resolveTeammateBuffName(buff.baseId)
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
        resolveTeammateAlert,
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
        temporal: row.temporal,
        categoryKey: column.categoryKey,
        matchedBuffId: buff.baseId,
      };
    });

    if (!isDead && !cells.some((cell) => cell.hasBuff)) continue;

    nextTeammateRows.push({
      teammateEntityUuid: teammateUuid,
      teammateName: resolveEntityDisplayName(teammateUuid),
      cells,
      isDead,
    });
  }

  if (nextTeammateRows.length > 0) {
    const filteredTeammates = filterInactiveTeammateColumns(
      fullTeammateDisplayColumns,
      nextTeammateRows,
    );
    return {
      columns: filteredTeammates.columns,
      rows: filteredTeammates.rows,
      nextDeadlineMs: deadlines.value(),
    };
  }

  return {
    columns: fullTeammateDisplayColumns,
    rows: isMonsterLayoutScaffold()
      ? buildTeammatePlaceholderRows(fullTeammateDisplayColumns, deadRowPlacement)
      : [],
    nextDeadlineMs: deadlines.value(),
  };
}

function buildBossDisplay(now: number): {
  sections: MonsterBossBuffSection[];
  nextDeadlineMs: number | null;
} {
  const aliases = getGlobalBuffAliases();
  const priorityIndex = buildBossBuffPriorityIndex();
  const nextSections: MonsterBossBuffSection[] = [];
  const deadlines = createDeadlineTracker(now);
  const bossBuffs = monsterBossBuffs();

  for (const buffs of bossBuffs.values()) {
    for (const buff of buffs.values()) {
      if (buff.durationMs > 0) {
        deadlines.include(buff.createTimeMs + buff.durationMs);
      }
    }
  }

  const sortedBossUids = Array.from(bossBuffs.keys()).sort();
  for (const bossUid of sortedBossUids) {
    const buffMap = bossBuffs.get(bossUid) ?? new Map();
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
          resolveAlertFor,
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

  if (nextSections.length === 0 && isMonsterLayoutScaffold()) {
    nextSections.push({
      bossEntityUuid: "0",
      title: t("monsterOverlay.placeholder.preview"),
      rows: buildPlaceholderRows(now),
      isPlaceholder: true,
    });
  }

  return {
    sections: nextSections,
    nextDeadlineMs: deadlines.value(),
  };
}

function buildHateDisplay(): MonsterHateSection[] {
  const nextHateSections: MonsterHateSection[] = [];
  if (getMonsterOverlayVisibility().showHatePanel) {
    const hateLists = monsterHateLists();
    const sortedHateBossUids = Array.from(hateLists.keys()).sort();
    const maxDisplay = SETTINGS.monsterMonitor.state.hateListMaxDisplay ?? 5;

    for (const bossUid of sortedHateBossUids) {
      const hateRows = buildHateRows(hateLists.get(bossUid) ?? [], maxDisplay);
      if (hateRows.length === 0) continue;
      nextHateSections.push({
        bossEntityUuid: bossUid,
        title: resolveMonsterSectionTitle(bossUid),
        rows: hateRows,
      });
    }
  }

  if (
    getMonsterOverlayVisibility().showHatePanel &&
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

  return nextHateSections;
}

function buildStunDisplay(): MonsterStunSection[] {
  const nextStunSections: MonsterStunSection[] = [];
  if (getMonsterOverlayVisibility().showStunPanel) {
    const stunEntries = monsterStunEntries();
    const sortedStunBossUids = Array.from(stunEntries.keys()).sort();
    for (const bossUid of sortedStunBossUids) {
      const entry = stunEntries.get(bossUid);
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
    getMonsterOverlayVisibility().showStunPanel &&
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

  return nextStunSections;
}

function buildHpDisplay(): MonsterHpSection[] {
  const sections: MonsterHpSection[] = [];
  if (getMonsterOverlayVisibility().showHpPanel) {
    for (const [bossUid, entry] of Array.from(
      monsterHpEntries().entries(),
    ).sort()) {
      const rows = buildHpRows(entry);
      if (rows.length > 0)
        sections.push({
          bossEntityUuid: bossUid,
          title: resolveMonsterSectionTitle(bossUid),
          rows,
        });
    }
  }
  if (
    getMonsterOverlayVisibility().showHpPanel &&
    sections.length === 0 &&
    isMonsterLayoutScaffold()
  ) {
    sections.push({
      bossEntityUuid: "0",
      title: t("monsterOverlay.placeholder.target", { uid: 0 }),
      rows: buildHpPlaceholderRows(),
      isPlaceholder: true,
    });
  }
  return sections;
}

function buildFantasyDisplay(now: number): {
  rows: MonsterFantasyRow[];
  nextDeadlineMs: number | null;
} {
  const deadlines = createDeadlineTracker(now);
  for (const entry of monsterFantasyEntries()) {
    deadlines.include(entry.detectedAtMs + FANTASY_DISPLAY_TTL_MS);
  }
  let rows = buildFantasyRows(now);
  if (rows.length === 0 && isMonsterLayoutScaffold()) {
    rows = buildFantasyPlaceholderRows();
  }
  return { rows, nextDeadlineMs: deadlines.value() };
}

function buildDbmDisplay(now: number): {
  rows: TextBuffDisplay[];
  nextDeadlineMs: number | null;
} {
  const deadlines = createDeadlineTracker(now);
  for (const event of monsterBossMechanics().values()) {
    deadlines.include(event.createTimeMs + event.durationMs);
  }
  let rows = buildDbmRows(now);
  if (rows.length === 0 && isMonsterLayoutScaffold()) {
    rows = buildDbmPlaceholderRows();
  }
  return { rows, nextDeadlineMs: deadlines.value() };
}

function entityDurationEntryLabel(entry: EntityDurationEntry): string {
  const label = entry.label.trim();
  return label || resolveMonsterName(entry.monsterId);
}

function buildEntityDurationPlaceholderRows(
  entries: readonly EntityDurationEntry[],
): TextBuffDisplay[] {
  if (entries.length === 0) {
    return [
      {
        key: "monster_entity_duration_preview",
        label: t("monsterOverlay.placeholder.entityDuration"),
        valueText: "12.0",
        progressPercent: 60,
        showProgress: true,
        isPlaceholder: true,
      },
    ];
  }
  return entries.slice(0, 3).map((entry) => ({
    key: `monster_entity_duration_preview_${entry.id}`,
    label: entityDurationEntryLabel(entry),
    valueText:
      entry.durationMs === undefined
        ? formatTimerText(Number.POSITIVE_INFINITY)
        : "12.0",
    progressPercent: entry.durationMs === undefined ? 0 : 60,
    showProgress: entry.durationMs !== undefined,
    isPlaceholder: true,
  }));
}

function buildEntityDurationDisplay(now: number): {
  rows: TextBuffDisplay[];
  nextDeadlineMs: number | null;
} {
  const entries = ensureEntityDurationEntries(
    SETTINGS.monsterMonitor.state.entityDurationEntries,
  );
  const playerNames = monsterPlayerNames();
  const built = buildEntityDurationRows({
    entries,
    tracks: monsterEntityDurationTracks(),
    now,
    resolveEntryLabel: entityDurationEntryLabel,
    resolveOwnerName: (track) => {
      if (track.ownerName) return track.ownerName;
      if (!track.ownerUuid) return "";
      return (
        playerNames.get(track.ownerUuid) ??
        t("monsterOverlay.entity.uid", {
          uid: uidFromEntityUuid(track.ownerUuid),
        })
      );
    },
    formatRemaining: formatTimerText,
    infiniteText: formatTimerText(Number.POSITIVE_INFINITY),
  });
  let rows = built.rows;
  if (rows.length === 0 && isMonsterLayoutScaffold()) {
    rows = buildEntityDurationPlaceholderRows(entries);
  }
  return { rows, nextDeadlineMs: built.nextDeadlineMs };
}

const globalBuffAliasesProjection = $derived.by(() => getGlobalBuffAliases());

const teammateColumnProjection = $derived.by(() => {
  const definitions = buildTeammateColumnDefinitions(
    globalBuffAliasesProjection,
  );
  const categoryKeysByBuffId = new Map<number, BuffCategoryKey[]>();
  for (const column of definitions) {
    if (column.kind !== "category") continue;
    for (const buffId of column.buffIds) {
      const categories = categoryKeysByBuffId.get(buffId) ?? [];
      categories.push(column.categoryKey);
      categoryKeysByBuffId.set(buffId, categories);
    }
  }
  return {
    definitions,
    displayColumns: toTeammateDisplayColumns(definitions),
    categoryKeysByBuffId,
  };
});

// A primitive, so panel style edits (sizes, colors) do not rebuild the rows.
const teammateDeadRowPlacement = $derived(
  teammatePanelStyle().deadRowPlacement,
);

const teammateDisplayProjection = $derived.by(() => {
  void hudProjectionRevision(MONSTER_TEAMMATE_DEADLINE_SOURCE);
  return buildTeammateDisplay(
    Date.now(),
    teammateColumnProjection,
    globalBuffAliasesProjection,
    teammateDeadRowPlacement,
  );
});

const bossDisplayProjection = $derived.by(() => {
  void hudProjectionRevision(MONSTER_BOSS_DEADLINE_SOURCE);
  return buildBossDisplay(Date.now());
});

const hateDisplayProjection = $derived.by(() => buildHateDisplay());

const stunDisplayProjection = $derived.by(() => buildStunDisplay());

const hpDisplayProjection = $derived.by(() => buildHpDisplay());

const fantasyDisplayProjection = $derived.by(() => {
  void hudProjectionRevision(MONSTER_FANTASY_DEADLINE_SOURCE);
  return buildFantasyDisplay(Date.now());
});

const dbmDisplayProjection = $derived.by(() => {
  void hudProjectionRevision(MONSTER_DBM_DEADLINE_SOURCE);
  return buildDbmDisplay(Date.now());
});

const entityDurationDisplayProjection = $derived.by(() => {
  void hudProjectionRevision(MONSTER_ENTITY_DURATION_DEADLINE_SOURCE);
  return buildEntityDurationDisplay(Date.now());
});

function assignRuntime<
  K extends
    | "bossSections"
    | "teammateColumns"
    | "teammateRows"
    | "hateSections"
    | "stunSections"
    | "hpSections"
    | "fantasyRows"
    | "dbmRows"
    | "entityDurationRows",
>(key: K, value: (typeof monsterRuntime)[K]) {
  if (untrack(() => monsterRuntime[key]) !== value) {
    monsterRuntime[key] = value;
  }
}

export function updateMonsterDisplay() {
  const teammate = stabilizeTeammateDisplay(
    teammateDisplayProjection.columns,
    teammateDisplayProjection.rows,
  );
  assignRuntime("teammateColumns", teammate.columns);
  assignRuntime("teammateRows", teammate.rows);
  assignRuntime("bossSections", bossDisplayProjection.sections);
  assignRuntime("hateSections", hateDisplayProjection);
  assignRuntime("stunSections", stunDisplayProjection);
  assignRuntime("hpSections", hpDisplayProjection);
  assignRuntime("fantasyRows", fantasyDisplayProjection.rows);
  assignRuntime("dbmRows", dbmDisplayProjection.rows);
  assignRuntime("entityDurationRows", entityDurationDisplayProjection.rows);
}

export function syncMonsterProjectionDeadlines() {
  setHudProjectionDeadline(
    MONSTER_TEAMMATE_DEADLINE_SOURCE,
    teammateDisplayProjection.nextDeadlineMs,
  );
  setHudProjectionDeadline(
    MONSTER_BOSS_DEADLINE_SOURCE,
    bossDisplayProjection.nextDeadlineMs,
  );
  setHudProjectionDeadline(
    MONSTER_FANTASY_DEADLINE_SOURCE,
    fantasyDisplayProjection.nextDeadlineMs,
  );
  setHudProjectionDeadline(
    MONSTER_DBM_DEADLINE_SOURCE,
    dbmDisplayProjection.nextDeadlineMs,
  );
  setHudProjectionDeadline(
    MONSTER_ENTITY_DURATION_DEADLINE_SOURCE,
    entityDurationDisplayProjection.nextDeadlineMs,
  );
}

export function clearMonsterProjectionDeadlines() {
  for (const source of MONSTER_PROJECTION_DEADLINE_SOURCES) {
    clearHudProjectionDeadline(source);
  }
}

export function nextMonsterProjectionDeadline(): number | null {
  const candidates = [
    teammateDisplayProjection.nextDeadlineMs,
    bossDisplayProjection.nextDeadlineMs,
    fantasyDisplayProjection.nextDeadlineMs,
    dbmDisplayProjection.nextDeadlineMs,
    entityDurationDisplayProjection.nextDeadlineMs,
  ].filter((value): value is number => value !== null);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}
