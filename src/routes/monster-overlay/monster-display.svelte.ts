import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
import { SETTINGS, ensureBuffAliases } from "$lib/settings-store";
import type { HateEntry } from "$lib/api";
import { buildBuffTextRow } from "../game-overlay/overlay-utils";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import { monsterRuntime } from "./monster-runtime.svelte.js";
import type {
  MonsterBossBuffSection,
  MonsterHateSection,
} from "./monster-types";

function selectedMonsterBuffIds() {
  return Array.from(new Set([
    ...SETTINGS.monsterMonitor.state.monitoredBuffIds,
    ...SETTINGS.monsterMonitor.state.selfAppliedBuffIds,
  ]));
}

function buildPlaceholderRows(now: number): TextBuffDisplay[] {
  const aliases = ensureBuffAliases(SETTINGS.monsterMonitor.state.buffAliases);
  const selectedIds = selectedMonsterBuffIds();
  const rows = selectedIds
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
      ))
    .filter((row): row is TextBuffDisplay => row !== null);

  if (rows.length > 0) return rows;

  return [
    {
      key: "monster_preview_empty",
      label: "在怪物监控页选择 Buff",
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
      label: "1. UID 10001",
      valueText: "100%",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
    {
      key: "monster_hate_preview_2",
      label: "2. UID 10002",
      valueText: "68%",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
    {
      key: "monster_hate_preview_3",
      label: "3. UID 10003",
      valueText: "41%",
      progressPercent: 0,
      showProgress: false,
      isPlaceholder: true,
    },
  ];
}

function buildHateRows(entries: HateEntry[]): TextBuffDisplay[] {
  const sortedEntries = [...entries].sort((left, right) => {
    if (right.hateVal !== left.hateVal) {
      return right.hateVal - left.hateVal;
    }
    return left.uid - right.uid;
  });
  const topHate = sortedEntries[0]?.hateVal ?? 0;

  return sortedEntries.map((entry, index) => ({
    key: `hate_${entry.uid}`,
    label: `${index + 1}. ${monsterRuntime.nameCache.get(entry.uid) ?? `UID ${entry.uid}`}`,
    valueText: topHate > 0
      ? `${Math.round((entry.hateVal / topHate) * 100)}%`
      : "0%",
    progressPercent: 0,
    showProgress: false,
  }));
}

export function updateMonsterDisplay() {
  const now = Date.now();
  const aliases = ensureBuffAliases(SETTINGS.monsterMonitor.state.buffAliases);
  const selectedIds = selectedMonsterBuffIds();
  const priorityIndex = new Map(selectedIds.map((id, index) => [id, index]));
  const nextSections: MonsterBossBuffSection[] = [];
  const nextHateSections: MonsterHateSection[] = [];

  const sortedBossUids = Array.from(monsterRuntime.bossBuffMap.keys())
    .sort((leftUid, rightUid) => leftUid - rightUid);

  for (const bossUid of sortedBossUids) {
    const buffMap = monsterRuntime.bossBuffMap.get(bossUid) ?? new Map();
    const buffRows = Array.from(buffMap.values())
      .sort((left, right) => {
        const leftPriority = priorityIndex.get(left.baseId) ?? Number.MAX_SAFE_INTEGER;
        const rightPriority = priorityIndex.get(right.baseId) ?? Number.MAX_SAFE_INTEGER;
        return leftPriority - rightPriority || left.baseId - right.baseId;
      })
      .map((buff) =>
        buildBuffTextRow(
          `monster_${bossUid}_${buff.baseId}`,
          resolveBuffDisplayName(buff.baseId, aliases),
          buff,
          now,
        ))
      .filter((row): row is TextBuffDisplay => row !== null);

    if (buffRows.length === 0) continue;
    nextSections.push({
      bossUid,
      title: monsterRuntime.nameCache.get(bossUid) ?? `目标 ${bossUid}`,
      rows: buffRows,
    });
  }

  if (SETTINGS.monsterMonitor.state.hateListEnabled) {
    const sortedHateBossUids = Array.from(monsterRuntime.bossHateMap.keys())
      .sort((leftUid, rightUid) => leftUid - rightUid);

    for (const bossUid of sortedHateBossUids) {
      const hateRows = buildHateRows(monsterRuntime.bossHateMap.get(bossUid) ?? []);
      if (hateRows.length === 0) continue;
      nextHateSections.push({
        bossUid,
        title: monsterRuntime.nameCache.get(bossUid) ?? `目标 ${bossUid}`,
        rows: hateRows,
      });
    }
  }

  if (nextSections.length === 0 && monsterRuntime.isEditing) {
    nextSections.push({
      bossUid: 0,
      title: "预览",
      rows: buildPlaceholderRows(now),
      isPlaceholder: true,
    });
  }

  if (
    SETTINGS.monsterMonitor.state.hateListEnabled
    && nextHateSections.length === 0
    && monsterRuntime.isEditing
  ) {
    nextHateSections.push({
      bossUid: 0,
      title: "目标 0",
      rows: buildHatePlaceholderRows(),
      isPlaceholder: true,
    });
  }

  monsterRuntime.bossSections = nextSections;
  monsterRuntime.hateSections = nextHateSections;
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);
}
