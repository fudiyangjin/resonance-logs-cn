import monsterIdNameTypeRaw from "./MonsterIdNameType.json";
import sceneNameRaw from "./SceneName.json";

export type NameOption = {
  label: string;
  ids: number[];
};

type RawMonsterInfo = {
  Name?: string | null;
  MonsterType?: number | null;
};

const sceneNames = sceneNameRaw as Record<string, string>;
const monsterInfoById = monsterIdNameTypeRaw as Record<string, RawMonsterInfo>;

function normalizeId(id: number | null | undefined): number | null {
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  return id;
}

function uniqueSortedIds(ids: number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function optionComparator(left: NameOption, right: NameOption): number {
  return (
    left.label.localeCompare(right.label, "zh-Hans-CN") ||
    (left.ids[0] ?? 0) - (right.ids[0] ?? 0)
  );
}

function buildGroupedOptions(
  ids: number[],
  resolveLabel: (id: number) => string,
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
    .sort(optionComparator);
}

export function resolveSceneName(
  sceneId: number | null | undefined,
  dungeonDifficulty?: number | null,
): string {
  const id = normalizeId(sceneId);
  if (id === null) return "";

  const baseName = sceneNames[String(id)] ?? `未知场景 ${id}`;
  return dungeonDifficulty === null || dungeonDifficulty === undefined
    ? baseName
    : `${baseName}-${dungeonDifficulty}`;
}

export function resolveMonsterName(monsterId: number | null | undefined): string {
  const id = normalizeId(monsterId);
  if (id === null) return "";

  return monsterInfoById[String(id)]?.Name?.trim() || `怪物 ${id}`;
}

export function resolveMonsterType(monsterId: number | null | undefined): number | null {
  const id = normalizeId(monsterId);
  if (id === null) return null;

  const monsterType = monsterInfoById[String(id)]?.MonsterType;
  return typeof monsterType === "number" ? monsterType : null;
}

export function getSceneOptions(sceneIds: number[]): NameOption[] {
  return buildGroupedOptions(sceneIds, (sceneId) => resolveSceneName(sceneId));
}

export function getBossOptions(monsterIds: number[]): NameOption[] {
  return buildGroupedOptions(monsterIds, (monsterId) =>
    resolveMonsterName(monsterId),
  );
}
