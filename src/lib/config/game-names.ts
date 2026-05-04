import { getLocale, t, type AppLocale } from "$lib/i18n/index.svelte";
import {
  getGameData,
  getGameDataFallbackChain,
  normalizeGameDataText,
} from "$lib/i18n/game-data";

export type NameOption = {
  label: string;
  ids: number[];
};

function normalizeId(id: number | null | undefined): number | null {
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  return id;
}

function uniqueSortedIds(ids: number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function optionComparator(
  left: NameOption,
  right: NameOption,
  locale: AppLocale,
): number {
  const collatorLocale = locale === "zh-CN" ? "zh-Hans-CN" : locale;
  return (
    left.label.localeCompare(right.label, collatorLocale) ||
    (left.ids[0] ?? 0) - (right.ids[0] ?? 0)
  );
}

function buildGroupedOptions(
  ids: number[],
  resolveLabel: (id: number) => string,
  locale: AppLocale,
): NameOption[] {
  const grouped = new Map<string, number[]>();
  for (const id of uniqueSortedIds(ids)) {
    const label = resolveLabel(id);
    const existing = grouped.get(label);
    if (existing) {
      existing.push(id);
    } else {
      grouped.set(label, [id]);
    }
  }

  return [...grouped.entries()]
    .map(([label, optionIds]) => ({ label, ids: optionIds }))
    .sort((left, right) => optionComparator(left, right, locale));
}

function lookupSceneName(id: number, locale: AppLocale): string | null {
  for (const candidate of getGameDataFallbackChain(locale)) {
    const name = normalizeGameDataText(
      getGameData(candidate).sceneNames[String(id)],
    );
    if (name) return name;
  }
  return null;
}

function lookupMonsterName(id: number, locale: AppLocale): string | null {
  for (const candidate of getGameDataFallbackChain(locale)) {
    const name = normalizeGameDataText(
      getGameData(candidate).monsterInfoById[String(id)]?.Name,
    );
    if (name) return name;
  }
  return null;
}

export function resolveSceneName(
  sceneId: number | null | undefined,
  dungeonDifficulty?: number | null,
  locale = getLocale(),
): string {
  const id = normalizeId(sceneId);
  if (id === null) return "";

  const baseName =
    lookupSceneName(id, locale) ?? t("game.scene.unknown", { id });
  return dungeonDifficulty === null || dungeonDifficulty === undefined
    ? baseName
    : `${baseName}-${dungeonDifficulty}`;
}

export function resolveMonsterName(
  monsterId: number | null | undefined,
  locale = getLocale(),
): string {
  const id = normalizeId(monsterId);
  if (id === null) return "";

  return lookupMonsterName(id, locale) ?? t("game.monster.unknown", { id });
}

export function resolveMonsterType(
  monsterId: number | null | undefined,
  locale = getLocale(),
): number | null {
  const id = normalizeId(monsterId);
  if (id === null) return null;

  for (const candidate of getGameDataFallbackChain(locale)) {
    const monsterType =
      getGameData(candidate).monsterInfoById[String(id)]?.MonsterType;
    if (typeof monsterType === "number") return monsterType;
  }
  return null;
}

export function getSceneOptions(
  sceneIds: number[],
  locale = getLocale(),
): NameOption[] {
  return buildGroupedOptions(
    sceneIds,
    (sceneId) => resolveSceneName(sceneId, undefined, locale),
    locale,
  );
}

export function getBossOptions(
  monsterIds: number[],
  locale = getLocale(),
): NameOption[] {
  return buildGroupedOptions(
    monsterIds,
    (monsterId) => resolveMonsterName(monsterId, locale),
    locale,
  );
}
