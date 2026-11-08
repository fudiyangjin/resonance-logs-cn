/**
 * @file Pure helpers for the skills watched on the battle roster.
 *
 * Entries are persisted inside the monster-monitor profile, keyed by skill
 * id; their order is the order of the skill cells at the end of a roster
 * row. Every read path runs them through `ensureRosterSkillEntries` so
 * malformed or legacy data never reaches the runtime snapshot or the HUD.
 */
import { isValidMonsterSkillId } from "./monster-skill-entries";
import type { RosterSkillEntry } from "./settings-store";

export const MAX_ROSTER_SKILL_ENTRIES = 32;
export const MIN_ROSTER_SKILL_COOLDOWN_SECONDS = 0.1;
export const MAX_ROSTER_SKILL_COOLDOWN_SECONDS = 600;

/** Clamped to 0.1–600 s with 0.1 s steps; `undefined` (use the table) for
 * anything unusable. */
export function normalizeRosterSkillCooldown(
  value: unknown,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const seconds = Math.round(value * 10) / 10;
  return Math.min(
    MAX_ROSTER_SKILL_COOLDOWN_SECONDS,
    Math.max(MIN_ROSTER_SKILL_COOLDOWN_SECONDS, seconds),
  );
}

/** `cooldownSeconds` is kept only when set, so table-driven entries stay as
 * they were persisted. */
function buildEntry(
  skillId: number,
  label: unknown,
  cooldownSeconds: unknown,
): RosterSkillEntry {
  const cooldown = normalizeRosterSkillCooldown(cooldownSeconds);
  return {
    skillId,
    label: typeof label === "string" ? label.trim() : "",
    ...(cooldown === undefined ? {} : { cooldownSeconds: cooldown }),
  };
}

/**
 * Normalizes a persisted list: drops invalid skill ids, keeps the first
 * entry per skill id, trims labels, clamps custom cooldowns and truncates
 * to `MAX_ROSTER_SKILL_ENTRIES`.
 */
export function ensureRosterSkillEntries(
  entries: readonly Partial<RosterSkillEntry>[] | null | undefined,
): RosterSkillEntry[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<number>();
  const result: RosterSkillEntry[] = [];
  for (const raw of entries) {
    if (result.length >= MAX_ROSTER_SKILL_ENTRIES) break;
    if (!raw || typeof raw !== "object") continue;
    if (!isValidMonsterSkillId(raw.skillId) || seen.has(raw.skillId)) continue;
    seen.add(raw.skillId);
    result.push(buildEntry(raw.skillId, raw.label, raw.cooldownSeconds));
  }
  return result;
}

/** Appends `skillId` using the table cooldown; a no-op for a skill already
 * on the list, an invalid id or a full list. */
export function addRosterSkillEntry(
  entries: readonly RosterSkillEntry[],
  skillId: number,
): RosterSkillEntry[] {
  if (
    !isValidMonsterSkillId(skillId) ||
    entries.length >= MAX_ROSTER_SKILL_ENTRIES ||
    entries.some((entry) => entry.skillId === skillId)
  ) {
    return [...entries];
  }
  return [...entries, buildEntry(skillId, "", undefined)];
}

export type RosterSkillEntryPatch = {
  label?: string;
  /** `null` goes back to the table cooldown. */
  cooldownSeconds?: number | null;
};

export function patchRosterSkillEntry(
  entries: readonly RosterSkillEntry[],
  skillId: number,
  patch: RosterSkillEntryPatch,
): RosterSkillEntry[] {
  return entries.map((entry) =>
    entry.skillId === skillId
      ? buildEntry(
          skillId,
          patch.label ?? entry.label,
          patch.cooldownSeconds === null
            ? undefined
            : (patch.cooldownSeconds ?? entry.cooldownSeconds),
        )
      : entry,
  );
}

export function moveRosterSkillEntry(
  entries: readonly RosterSkillEntry[],
  skillId: number,
  direction: "up" | "down",
): RosterSkillEntry[] {
  const index = entries.findIndex((entry) => entry.skillId === skillId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= entries.length) {
    return [...entries];
  }
  const next = [...entries];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function removeRosterSkillEntry(
  entries: readonly RosterSkillEntry[],
  skillId: number,
): RosterSkillEntry[] {
  return entries.filter((entry) => entry.skillId !== skillId);
}
