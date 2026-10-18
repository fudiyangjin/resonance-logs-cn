/**
 * @file Pure helpers for the monster-monitor "monster skill" watch list.
 *
 * Entries are persisted inside the monster-monitor profile and keyed by
 * skill id; every read path runs them through `ensureMonsterSkillEntries` so
 * malformed or legacy data never reaches the runtime snapshot or the HUD.
 */
import type { MonsterSkillWatchEntry } from "./settings-store";

export const MAX_MONSTER_SKILL_ENTRIES = 32;
export const MIN_MONSTER_SKILL_DISPLAY_MS = 500;
export const MAX_MONSTER_SKILL_DISPLAY_MS = 60_000;
export const DEFAULT_MONSTER_SKILL_DISPLAY_MS = 5_000;
/** Rust side stores skill ids as `i32`. */
const MAX_SKILL_ID = 2_147_483_647;

export function isValidMonsterSkillId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_SKILL_ID
  );
}

/** Clamps to the allowed range; anything unusable becomes the default. */
export function normalizeMonsterSkillDisplayMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MONSTER_SKILL_DISPLAY_MS;
  }
  return Math.min(
    MAX_MONSTER_SKILL_DISPLAY_MS,
    Math.max(MIN_MONSTER_SKILL_DISPLAY_MS, Math.round(value)),
  );
}

function buildEntry(
  skillId: number,
  label: unknown,
  displayMs: unknown,
): MonsterSkillWatchEntry {
  return {
    skillId,
    label: typeof label === "string" ? label.trim() : "",
    displayMs: normalizeMonsterSkillDisplayMs(displayMs),
  };
}

/**
 * Normalizes a persisted list: drops entries with invalid skill ids, keeps
 * the first entry per skill id, trims labels, clamps display times and
 * truncates to `MAX_MONSTER_SKILL_ENTRIES`.
 */
export function ensureMonsterSkillEntries(
  entries: readonly Partial<MonsterSkillWatchEntry>[] | null | undefined,
): MonsterSkillWatchEntry[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<number>();
  const result: MonsterSkillWatchEntry[] = [];
  for (const raw of entries) {
    if (result.length >= MAX_MONSTER_SKILL_ENTRIES) break;
    if (!raw || typeof raw !== "object") continue;
    if (!isValidMonsterSkillId(raw.skillId) || seen.has(raw.skillId)) continue;
    seen.add(raw.skillId);
    result.push(buildEntry(raw.skillId, raw.label, raw.displayMs));
  }
  return result;
}

/** Appends `skillId` with the default display time; a no-op for a skill
 * already on the list, an invalid id or a full list. */
export function addMonsterSkillEntry(
  entries: readonly MonsterSkillWatchEntry[],
  skillId: number,
): MonsterSkillWatchEntry[] {
  if (
    !isValidMonsterSkillId(skillId) ||
    entries.length >= MAX_MONSTER_SKILL_ENTRIES ||
    entries.some((entry) => entry.skillId === skillId)
  ) {
    return [...entries];
  }
  return [
    ...entries,
    buildEntry(skillId, "", DEFAULT_MONSTER_SKILL_DISPLAY_MS),
  ];
}

export type MonsterSkillEntryPatch = {
  label?: string;
  displayMs?: number;
};

export function patchMonsterSkillEntry(
  entries: readonly MonsterSkillWatchEntry[],
  skillId: number,
  patch: MonsterSkillEntryPatch,
): MonsterSkillWatchEntry[] {
  return entries.map((entry) =>
    entry.skillId === skillId
      ? buildEntry(
          skillId,
          patch.label ?? entry.label,
          patch.displayMs ?? entry.displayMs,
        )
      : entry,
  );
}

export function moveMonsterSkillEntry(
  entries: readonly MonsterSkillWatchEntry[],
  skillId: number,
  direction: "up" | "down",
): MonsterSkillWatchEntry[] {
  const index = entries.findIndex((entry) => entry.skillId === skillId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= entries.length) {
    return [...entries];
  }
  const next = [...entries];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function removeMonsterSkillEntry(
  entries: readonly MonsterSkillWatchEntry[],
  skillId: number,
): MonsterSkillWatchEntry[] {
  return entries.filter((entry) => entry.skillId !== skillId);
}
