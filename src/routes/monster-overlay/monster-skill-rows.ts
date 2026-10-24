/**
 * @file Pure row builder for the monster-monitor monster skill panel.
 *
 * The backend publishes the latest cast of each watched skill; this layer
 * keeps the casts still inside their entry's display time, in watch-list
 * order so rows do not jump, and reports the nearest expiry so the HUD
 * re-projects exactly when a row has to disappear. A cast has no duration
 * of its own, so rows carry no countdown or progress.
 */
import { DEFAULT_MONSTER_SKILL_DISPLAY_MS } from "$lib/monster-skill-entries";
import type { MonsterSkillWatchEntry } from "$lib/settings-store";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";

export type MonsterSkillRowsInput = {
  monitorAll?: boolean;
  resolveSkillName?: (skillId: number) => string;
  entries: readonly MonsterSkillWatchEntry[];
  /** Skill id -> wall time of its latest cast. */
  casts: ReadonlyMap<number, number>;
  now: number;
  resolveLabel: (entry: MonsterSkillWatchEntry) => string;
};

export type MonsterSkillRowsOutput = {
  rows: TextBuffDisplay[];
  nextDeadlineMs: number | null;
};

export function monsterSkillRow(
  key: string,
  label: string,
  isPlaceholder = false,
): TextBuffDisplay {
  return {
    key,
    label,
    valueText: "",
    progressPercent: 0,
    showProgress: false,
    ...(isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

export function buildMonsterSkillRows(
  input: MonsterSkillRowsInput,
): MonsterSkillRowsOutput {
  const rows: TextBuffDisplay[] = [];
  let nextDeadlineMs: number | null = null;
  const configured = new Map(
    input.entries.map((entry) => [entry.skillId, entry]),
  );
  const entries = input.monitorAll
    ? [...input.casts.keys()]
        .sort((a, b) => a - b)
        .map(
          (skillId) =>
            configured.get(skillId) ?? {
              skillId,
              label: "",
              displayMs: DEFAULT_MONSTER_SKILL_DISPLAY_MS,
            },
        )
    : input.entries;
  for (const entry of entries) {
    const castAtMs = input.casts.get(entry.skillId);
    if (castAtMs === undefined) continue;
    const deadlineMs = castAtMs + entry.displayMs;
    if (deadlineMs <= input.now) continue;
    if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
      nextDeadlineMs = deadlineMs;
    }
    rows.push(
      monsterSkillRow(
        `monster_skill_${entry.skillId}`,
        input.monitorAll
          ? `${input.resolveSkillName?.(entry.skillId) ?? input.resolveLabel(entry)}#${entry.skillId}`
          : input.resolveLabel(entry),
      ),
    );
  }
  return { rows, nextDeadlineMs };
}
