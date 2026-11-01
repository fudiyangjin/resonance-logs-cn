/**
 * @file Pure row builder for the monster-monitor monster skill panel.
 *
 * The backend publishes the latest cast of each watched skill; this layer
 * keeps the casts still inside their entry's display time, in watch-list
 * order so rows do not jump, and reports the nearest expiry so the HUD
 * re-projects exactly when a row has to disappear. A cast has no duration
 * of its own: a row shows only its name unless its entry turns on
 * `countdown`, which counts the display time down with a draining bar (for
 * a skill that announces another one that many seconds later).
 *
 * In discovery mode (`monitorAll`) listed skills still come first exactly as
 * above; casts of unlisted skills follow in ascending id order, labeled
 * `name#id` (`#id` when the skill table has no name) for the default time,
 * always without a countdown.
 */
import {
  hudTemporalProgressPercent,
  hudTemporalRemainingMs,
  type HudTemporalValue,
} from "$lib/hud-temporal.svelte.js";
import { DEFAULT_MONSTER_SKILL_DISPLAY_MS } from "$lib/monster-skill-entries";
import type { MonsterSkillWatchEntry } from "$lib/settings-store";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";

export type MonsterSkillRowsInput = {
  monitorAll?: boolean;
  /** Game name of an unlisted skill, `null` when the table has none. */
  resolveSkillName?: (skillId: number) => string | null;
  entries: readonly MonsterSkillWatchEntry[];
  /** Skill id -> wall time of its latest cast. */
  casts: ReadonlyMap<number, number>;
  now: number;
  resolveLabel: (entry: MonsterSkillWatchEntry) => string;
  /** Remaining-time text of a countdown row. */
  formatRemaining: (remainingMs: number) => string;
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

function monsterSkillCountdownRow(
  key: string,
  label: string,
  temporal: HudTemporalValue,
  now: number,
  formatRemaining: (remainingMs: number) => string,
): TextBuffDisplay {
  return {
    key,
    label,
    valueText: formatRemaining(hudTemporalRemainingMs(temporal, now)),
    progressPercent: hudTemporalProgressPercent(temporal, now),
    showProgress: true,
    temporal,
  };
}

export function buildMonsterSkillRows(
  input: MonsterSkillRowsInput,
): MonsterSkillRowsOutput {
  const rows: TextBuffDisplay[] = [];
  let nextDeadlineMs: number | null = null;
  // Labels are resolved only for rows still on screen.
  const show = (
    skillId: number,
    displayMs: number,
    countdown: boolean,
    label: () => string,
  ) => {
    const castAtMs = input.casts.get(skillId);
    if (castAtMs === undefined) return;
    const deadlineMs = castAtMs + displayMs;
    if (deadlineMs <= input.now) return;
    if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
      nextDeadlineMs = deadlineMs;
    }
    const key = `monster_skill_${skillId}`;
    rows.push(
      countdown
        ? monsterSkillCountdownRow(
            key,
            label(),
            { deadlineMs, durationMs: displayMs },
            input.now,
            input.formatRemaining,
          )
        : monsterSkillRow(key, label()),
    );
  };
  for (const entry of input.entries) {
    show(entry.skillId, entry.displayMs, entry.countdown === true, () =>
      input.resolveLabel(entry),
    );
  }
  if (input.monitorAll) {
    const listed = new Set(input.entries.map((entry) => entry.skillId));
    const discovered = [...input.casts.keys()]
      .filter((skillId) => !listed.has(skillId))
      .sort((a, b) => a - b);
    for (const skillId of discovered) {
      show(skillId, DEFAULT_MONSTER_SKILL_DISPLAY_MS, false, () => {
        const name = input.resolveSkillName?.(skillId);
        return name ? `${name}#${skillId}` : `#${skillId}`;
      });
    }
  }
  return { rows, nextDeadlineMs };
}
