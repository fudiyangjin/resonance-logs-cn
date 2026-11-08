/**
 * @file Pure row builder for the monster-monitor entity-duration panel.
 *
 * The backend already folds watched entities into display tracks (scope,
 * merging and order); this layer resolves labels and picks the countdown
 * each row shows: the first member deadline still in the future. It also
 * reports the nearest deadline so the HUD schedules its next re-projection,
 * which is also when a merged row hands over to its next member.
 *
 * In discovery mode (`monitorAll`) the local player's entities that are not
 * on the list follow the list rows, one row per monster id in order of first
 * detection: `name#id` (`#id` without a name), ` ×N` when several are
 * present, and the whole seconds since the earliest appeared, counting up.
 * Such a row re-projects at its next whole second.
 */
import type { DiscoveredEntityState, EntityDurationTrackState } from "$lib/api";
import type { EntityDurationEntry } from "$lib/settings-store";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import {
  hudTemporalProgressPercent,
  hudTemporalRemainingMs,
} from "$lib/hud-temporal.svelte.js";

export type EntityDurationRowsInput = {
  entries: readonly EntityDurationEntry[];
  tracks: readonly EntityDurationTrackState[];
  now: number;
  /** Display label for an entry (falls back when the entry label is empty). */
  resolveEntryLabel: (entry: EntityDurationEntry) => string;
  /** Caster name for the `-<name>` suffix; empty string when unknown. */
  resolveOwnerName: (track: EntityDurationTrackState) => string;
  formatRemaining: (remainingMs: number) => string;
  /** Text for rows without a configured duration (e.g. `∞`). */
  infiniteText: string;
  /** Discovery mode: also list `discovered`. */
  monitorAll?: boolean;
  discovered?: readonly DiscoveredEntityState[];
  /** Display name of a discovered entity, `null` when it has none. */
  resolveDiscoveredName?: (state: DiscoveredEntityState) => string | null;
  /** Text of the whole seconds a discovered entity has been present. */
  formatElapsed?: (seconds: number) => string;
};

export type EntityDurationRowsOutput = {
  rows: TextBuffDisplay[];
  nextDeadlineMs: number | null;
};

export function buildEntityDurationRows(
  input: EntityDurationRowsInput,
): EntityDurationRowsOutput {
  const entriesByMonsterId = new Map<number, EntityDurationEntry>();
  for (const entry of input.entries) {
    if (!entriesByMonsterId.has(entry.monsterId)) {
      entriesByMonsterId.set(entry.monsterId, entry);
    }
  }

  const rows: TextBuffDisplay[] = [];
  let nextDeadlineMs: number | null = null;

  for (const track of input.tracks) {
    // A scope mismatch is a track published before the entry was edited.
    const entry = entriesByMonsterId.get(track.monsterId);
    if (!entry || entry.scope !== track.scope) continue;

    let label = input.resolveEntryLabel(entry);
    if (track.scope === "any") {
      const ownerName = input.resolveOwnerName(track);
      if (ownerName) label = `${label}-${ownerName}`;
    }
    const key = `entity_duration_${track.key}`;

    if (track.durationMs === null) {
      rows.push({
        key,
        label,
        valueText: input.infiniteText,
        progressPercent: 0,
        showProgress: false,
      });
      continue;
    }

    const deadlineMs = track.deadlinesMs.find(
      (deadline) => deadline > input.now,
    );
    if (deadlineMs === undefined) continue;
    if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
      nextDeadlineMs = deadlineMs;
    }
    const temporal = { deadlineMs, durationMs: track.durationMs };
    rows.push({
      key,
      label,
      valueText: input.formatRemaining(
        hudTemporalRemainingMs(temporal, input.now),
      ),
      progressPercent: hudTemporalProgressPercent(temporal, input.now),
      showProgress: true,
      temporal,
    });
  }

  if (input.monitorAll) {
    for (const state of input.discovered ?? []) {
      // A listed id is a payload published before the entry was added.
      if (entriesByMonsterId.has(state.monsterId)) continue;
      const elapsedSeconds = Math.max(
        0,
        Math.floor((input.now - state.detectedAtMs) / 1000),
      );
      const nextSecondMs = state.detectedAtMs + (elapsedSeconds + 1) * 1000;
      if (nextDeadlineMs === null || nextSecondMs < nextDeadlineMs) {
        nextDeadlineMs = nextSecondMs;
      }
      const name = input.resolveDiscoveredName?.(state) ?? null;
      const label = name ? `${name}#${state.monsterId}` : `#${state.monsterId}`;
      rows.push({
        key: `entity_discovery_${state.monsterId}`,
        label: state.count > 1 ? `${label} ×${state.count}` : label,
        valueText:
          input.formatElapsed?.(elapsedSeconds) ?? `+${elapsedSeconds}s`,
        progressPercent: 0,
        showProgress: false,
      });
    }
  }

  return { rows, nextDeadlineMs };
}
