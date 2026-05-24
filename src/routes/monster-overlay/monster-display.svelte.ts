import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
import { resolveMonsterName } from "$lib/config/game-names";
import { t } from "$lib/i18n/index.svelte";
import { uidFromEntityUuid, type EntityId } from "$lib/entity-id";
import {
  SETTINGS,
  ensureBuffAliases,
  ensureBuffAlerts,
} from "$lib/settings-store";
import type { HateEntry } from "$lib/api";
import {
  buildBuffTextRow,
  resolveAlertState,
} from "../game-overlay/overlay-utils";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import { monsterRuntime } from "./monster-runtime.svelte.js";
import type {
  MonsterBossBuffSection,
  MonsterHateSection,
} from "./monster-types";

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
    const buffMap = monsterRuntime.teammateBuffMap.get(teammateUuid) ?? new Map();
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
          `teammate_${teammateUuid}_${buff.baseId}`,
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
      bossEntityUuid: teammateUuid,
      title: resolveEntityDisplayName(teammateUuid),
      rows: buffRows,
      kind: "teammate",
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
  monsterRuntime.hateSections = nextHateSections;
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);
}
