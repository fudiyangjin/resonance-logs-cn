/**
 * @file Challenge watch (forbidden damage) data model.
 *
 * A loadout's live profile holds named groups of forbidden damage ids. A
 * group is self-contained (name + ids) so loadout exports carry it whole.
 * Presets — the built-in ones and the user's own library — are templates:
 * adding one copies it into a new group, later preset edits do not touch it.
 *
 * Plain TypeScript (no runes) so settings migration, loadout import and the
 * pages share it and it stays unit-testable.
 */
import { CHALLENGE_PRESETS } from "$lib/challenge-presets";

export type ChallengeGroup = {
  id: string;
  /** User-given name; empty falls back to the preset label. */
  name: string;
  /** Built-in or user preset this group was created from, if any. */
  presetId: string | null;
  damageIds: number[];
};

export type ChallengeWatchState = { groups: ChallengeGroup[] };

export type ChallengeUserPreset = {
  id: string;
  name: string;
  damageIds: number[];
};

export type ChallengePresetLibrary = { presets: ChallengeUserPreset[] };

/** A forbidden damage id a player took, with how many hits. */
export type ForbiddenHit = { id: number; hits: number };

/** Group id of the ids a legacy flat list held outside every preset. */
export const LEGACY_CHALLENGE_GROUP_ID = "legacy";

export function presetGroupId(presetId: string): string {
  return `preset:${presetId}`;
}

export function createDefaultChallengeWatchState(): ChallengeWatchState {
  return { groups: [] };
}

export function createDefaultChallengePresetLibrary(): ChallengePresetLibrary {
  return { presets: [] };
}

export function isChallengeDamageId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Valid damage ids, deduplicated, first occurrence order. */
function sanitizeDamageIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const id of value) {
    if (isChallengeDamageId(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function uniqueId(candidate: unknown, fallback: string, seen: Set<string>) {
  const base =
    typeof candidate === "string" && candidate ? candidate : fallback;
  let id = base;
  for (let suffix = 2; seen.has(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  seen.add(id);
  return id;
}

/**
 * Splits a legacy flat id list into groups: ids of a built-in preset go to
 * that preset's group (in preset order), the rest to one unnamed group.
 */
function groupsFromLegacyIds(value: unknown): ChallengeGroup[] {
  const remaining = sanitizeDamageIds(value);
  const groups: ChallengeGroup[] = [];
  for (const preset of CHALLENGE_PRESETS) {
    const members = preset.damageIds.filter((id) => remaining.includes(id));
    if (members.length === 0) continue;
    groups.push({
      id: presetGroupId(preset.id),
      name: "",
      presetId: preset.id,
      damageIds: members,
    });
    for (const id of members) remaining.splice(remaining.indexOf(id), 1);
  }
  if (remaining.length > 0) {
    groups.push({
      id: LEGACY_CHALLENGE_GROUP_ID,
      name: "",
      presetId: null,
      damageIds: remaining,
    });
  }
  return groups;
}

/**
 * Any stored or imported challenge watch value -> the current shape.
 * `groups` wins when present (stale legacy keys are dropped); otherwise a
 * legacy `forbiddenDamageIds` list is converted. Idempotent.
 */
export function normalizeChallengeWatch(value: unknown): ChallengeWatchState {
  const record = asRecord(value);
  if (!record) return createDefaultChallengeWatchState();
  if (!Array.isArray(record["groups"])) {
    return { groups: groupsFromLegacyIds(record["forbiddenDamageIds"]) };
  }
  const seen = new Set<string>();
  const groups: ChallengeGroup[] = [];
  record["groups"].forEach((raw, index) => {
    const group = asRecord(raw);
    if (!group) return;
    const presetId = group["presetId"];
    groups.push({
      id: uniqueId(group["id"], `group-${index + 1}`, seen),
      name: typeof group["name"] === "string" ? group["name"] : "",
      presetId: typeof presetId === "string" && presetId ? presetId : null,
      damageIds: sanitizeDamageIds(group["damageIds"]),
    });
  });
  return { groups };
}

export function normalizeChallengePresetLibrary(
  value: unknown,
): ChallengePresetLibrary {
  const record = asRecord(value);
  if (!record || !Array.isArray(record["presets"])) {
    return createDefaultChallengePresetLibrary();
  }
  const seen = new Set<string>();
  const presets: ChallengeUserPreset[] = [];
  record["presets"].forEach((raw, index) => {
    const preset = asRecord(raw);
    if (!preset) return;
    presets.push({
      id: uniqueId(preset["id"], `preset-${index + 1}`, seen),
      name: typeof preset["name"] === "string" ? preset["name"] : "",
      damageIds: sanitizeDamageIds(preset["damageIds"]),
    });
  });
  return { presets };
}

/** Every forbidden id across the groups (what the live rows check). */
export function collectForbiddenDamageIds(
  groups: readonly ChallengeGroup[],
): Set<number> {
  const ids = new Set<number>();
  for (const group of groups) {
    for (const id of group.damageIds) ids.add(id);
  }
  return ids;
}

export function createChallengeGroup(
  init: Partial<Omit<ChallengeGroup, "id">> = {},
): ChallengeGroup {
  return {
    id: `challenge_group_${crypto.randomUUID()}`,
    name: init.name ?? "",
    presetId: init.presetId ?? null,
    damageIds: sanitizeDamageIds(init.damageIds ?? []),
  };
}

/** True when some group of the loadout was created from `presetId`. */
export function hasPresetGroup(
  groups: readonly ChallengeGroup[],
  presetId: string,
): boolean {
  return groups.some((group) => group.presetId === presetId);
}

/** `group` with `ids` appended (already present ids are skipped). */
export function addGroupDamageIds(
  group: ChallengeGroup,
  ids: readonly number[],
): ChallengeGroup {
  const merged = sanitizeDamageIds([...group.damageIds, ...ids]);
  return merged.length === group.damageIds.length
    ? group
    : { ...group, damageIds: merged };
}

export function removeGroupDamageIds(
  group: ChallengeGroup,
  ids: readonly number[],
): ChallengeGroup {
  const removed = new Set(ids);
  return {
    ...group,
    damageIds: group.damageIds.filter((id) => !removed.has(id)),
  };
}

/**
 * Saves `group` into the user preset library under `name`: updates the user
 * preset it is linked to when that still exists, else creates one and links
 * the group to it (taking the name, so a former built-in group keeps it).
 */
export function saveGroupAsUserPreset(
  presets: readonly ChallengeUserPreset[],
  group: ChallengeGroup,
  name: string,
): { presets: ChallengeUserPreset[]; group: ChallengeGroup } {
  const trimmed = name.trim();
  const damageIds = [...group.damageIds];
  const linked = presets.findIndex((preset) => preset.id === group.presetId);
  if (linked !== -1) {
    return {
      presets: presets.map((preset, index) =>
        index === linked ? { ...preset, name: trimmed, damageIds } : preset,
      ),
      group,
    };
  }
  const preset: ChallengeUserPreset = {
    id: `challenge_preset_${crypto.randomUUID()}`,
    name: trimmed,
    damageIds,
  };
  return {
    presets: [...presets, preset],
    group: { ...group, name: trimmed, presetId: preset.id },
  };
}
