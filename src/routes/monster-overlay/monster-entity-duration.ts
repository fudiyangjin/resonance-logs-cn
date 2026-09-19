/**
 * @file Pure row builder for the monster-monitor entity-duration panel.
 *
 * Input is the configured watch list plus the live `watchedEntities` from
 * the monster topic; output is a list of `TextBuffRow`-shaped rows (label,
 * countdown text, progress) and the nearest future deadline so the HUD can
 * schedule its next re-projection.
 */
import type { WatchedEntityState } from "$lib/api";
import type {
  EntityDurationEntry,
  EntityDurationScope,
} from "$lib/settings-store";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";

export function matchesEntityDurationScope(
  scope: EntityDurationScope,
  entity: Pick<WatchedEntityState, "ownerIsLocalPlayer">,
): boolean {
  return scope === "any" || entity.ownerIsLocalPlayer;
}

export type EntityDurationRowsInput = {
  entries: readonly EntityDurationEntry[];
  watched: readonly WatchedEntityState[];
  now: number;
  /** Display label for an entry (falls back when the entry label is empty). */
  resolveEntryLabel: (entry: EntityDurationEntry) => string;
  /** Caster name for the `-<name>` suffix; empty string when unknown. */
  resolveOwnerName: (entity: WatchedEntityState) => string;
  formatRemaining: (remainingMs: number) => string;
  /** Text for rows without a configured duration (e.g. `∞`). */
  infiniteText: string;
};

export type EntityDurationRowsOutput = {
  rows: TextBuffDisplay[];
  nextDeadlineMs: number | null;
};

export function entityDurationRowKey(entityUuid: string): string {
  return `entity_duration_${entityUuid}`;
}

export function buildEntityDurationRows(
  input: EntityDurationRowsInput,
): EntityDurationRowsOutput {
  const entriesByMonsterId = new Map<number, EntityDurationEntry>();
  for (const entry of input.entries) {
    if (!entriesByMonsterId.has(entry.monsterId)) {
      entriesByMonsterId.set(entry.monsterId, entry);
    }
  }

  const candidates: { detectedAtMs: number; row: TextBuffDisplay }[] = [];
  let nextDeadlineMs: number | null = null;

  for (const entity of input.watched) {
    const entry = entriesByMonsterId.get(entity.monsterId);
    if (!entry || !matchesEntityDurationScope(entry.scope, entity)) continue;

    let label = input.resolveEntryLabel(entry);
    if (entry.scope === "any") {
      const ownerName = input.resolveOwnerName(entity);
      if (ownerName) label = `${label}-${ownerName}`;
    }
    const key = entityDurationRowKey(entity.entityUuid);

    if (entry.durationMs === undefined) {
      candidates.push({
        detectedAtMs: entity.detectedAtMs,
        row: {
          key,
          label,
          valueText: input.infiniteText,
          progressPercent: 0,
          showProgress: false,
        },
      });
      continue;
    }

    const deadlineMs = entity.detectedAtMs + entry.durationMs;
    const remainingMs = deadlineMs - input.now;
    if (remainingMs <= 0) continue;
    if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
      nextDeadlineMs = deadlineMs;
    }
    candidates.push({
      detectedAtMs: entity.detectedAtMs,
      row: {
        key,
        label,
        valueText: input.formatRemaining(remainingMs),
        progressPercent: Math.min(
          100,
          Math.max(0, (remainingMs / entry.durationMs) * 100),
        ),
        showProgress: true,
        temporal: { deadlineMs, durationMs: entry.durationMs },
      },
    });
  }

  candidates.sort(
    (left, right) =>
      left.detectedAtMs - right.detectedAtMs ||
      left.row.key.localeCompare(right.row.key),
  );
  return { rows: candidates.map((c) => c.row), nextDeadlineMs };
}
