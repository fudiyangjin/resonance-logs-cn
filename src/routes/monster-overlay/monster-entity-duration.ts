/**
 * @file Pure row builder for the monster-monitor entity-duration panel.
 *
 * The backend already folds watched entities into display tracks (scope,
 * merging and order); this layer resolves labels and picks the countdown
 * each row shows: the first member deadline still in the future. It also
 * reports the nearest deadline so the HUD schedules its next re-projection,
 * which is also when a merged row hands over to its next member.
 */
import type { EntityDurationTrackState } from "$lib/api";
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

  return { rows, nextDeadlineMs };
}
