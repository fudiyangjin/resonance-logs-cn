import { resolveBuffOverlayDisplayName } from "$lib/config/buff-name-table";
import { localizeRawMonsterName } from "$lib/monster-mappings";
import { resolveMonsterMonitorTranslation } from "$lib/i18n";
import { SETTINGS, ensureBuffAliases } from "$lib/settings-store";
import type { HateEntry } from "$lib/api";
import { buildBuffTextRow } from "../game-overlay/overlay-utils";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import { monsterRuntime } from "./monster-runtime.svelte.js";
import type {
  MonsterBossBuffSection,
  MonsterHateSection,
} from "./monster-types";


function tMonster(key: string, fallback: string): string {
  return resolveMonsterMonitorTranslation(
    key,
    SETTINGS.live.general.state.language,
    fallback,
  );
}

function targetTitle(uid: number): string {
  return `${tMonster("placeholder.targetPrefix", "Target")} ${uid}`;
}

function resolveMonsterSectionTitle(uid: number): string {
  const rawName = monsterRuntime.nameCache.get(uid)?.trim();
  if (rawName) {
    return localizeRawMonsterName(rawName, rawName);
  }
  return targetTitle(uid);
}

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
        resolveBuffOverlayDisplayName(baseId, aliases),
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
      label: tMonster("placeholder.selectBuff", "Select buffs in Monster Monitor"),
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

function buildHateRows(entries: HateEntry[], maxDisplay: number): TextBuffDisplay[] {
  const sortedEntries = [...entries].sort((left, right) => {
    if (right.hateVal !== left.hateVal) {
      return right.hateVal - left.hateVal;
    }
    return left.uid - right.uid;
  });

  const normalizedHateValues = sortedEntries.map((entry) => Math.max(entry.hateVal, 0));
  const totalHate = normalizedHateValues.reduce((sum, hateVal) => sum + hateVal, 0);

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

    let remainingPercent = 100 - percentParts.reduce(
      (sum, part) => sum + part.basePercent,
      0,
    );

    percentParts
      .sort((left, right) =>
        right.remainder - left.remainder || left.index - right.index)
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
      key: `hate_${entry.uid}`,
      label: `${index + 1}. ${monsterRuntime.nameCache.get(entry.uid) ?? `UID ${entry.uid}`}`,
      valueText: `${displayPercents[index] ?? 0}%`,
      progressPercent: 0,
      showProgress: false,
    }))
    .slice(0, maxDisplay);
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
          resolveBuffOverlayDisplayName(buff.baseId, aliases),
          buff,
          now,
        ))
      .filter((row): row is TextBuffDisplay => row !== null);

    if (buffRows.length === 0) continue;
    nextSections.push({
      bossUid,
      title: resolveMonsterSectionTitle(bossUid),
      rows: buffRows,
    });
  }

  if (SETTINGS.monsterMonitor.state.hateListEnabled) {
    const sortedHateBossUids = Array.from(monsterRuntime.bossHateMap.keys())
      .sort((leftUid, rightUid) => leftUid - rightUid);
    const maxDisplay = SETTINGS.monsterMonitor.state.hateListMaxDisplay ?? 5;

    for (const bossUid of sortedHateBossUids) {
      const hateRows = buildHateRows(
        monsterRuntime.bossHateMap.get(bossUid) ?? [],
        maxDisplay,
      );
      if (hateRows.length === 0) continue;
      nextHateSections.push({
        bossUid,
        title: resolveMonsterSectionTitle(bossUid),
        rows: hateRows,
      });
    }
  }

  if (nextSections.length === 0 && monsterRuntime.isEditing) {
    nextSections.push({
      bossUid: 0,
      title: tMonster("placeholder.preview", "Preview"),
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
      title: targetTitle(0),
      rows: buildHatePlaceholderRows(),
      isPlaceholder: true,
    });
  }

  monsterRuntime.bossSections = nextSections;
  monsterRuntime.hateSections = nextHateSections;
  monsterRuntime.rafId = requestAnimationFrame(updateMonsterDisplay);
}
