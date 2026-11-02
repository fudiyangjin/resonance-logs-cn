/**
 * @file Pure view model behind the live window's buff coverage page: which
 * players can be picked, which one is shown, and the buff rows in display
 * order. Kept free of runes so it can be unit tested.
 */
import { compareByPartyRole } from "$lib/class-roles";
import type {
  HistoryBuffLaneView,
  HistoryBuffTimelineView,
} from "$lib/history-derived";

export type CoverageRow = {
  baseId: number;
  /** `null` when the player never had this buff during the encounter. */
  lane: HistoryBuffLaneView | null;
};

/**
 * Recorded buff ids in display order: the configured watch-list order first
 * (what the HUD shows), then ids no longer configured in recording order.
 * Configured ids missing from the recording are left out: whether they were
 * watched back then is unknown.
 */
export function coverageBuffOrder(
  view: HistoryBuffTimelineView,
  configuredIds: readonly number[],
): number[] {
  const recorded = new Set(view.lanes.map((lane) => lane.baseId));
  const order = new Set<number>();
  for (const id of configuredIds) {
    if (recorded.has(id)) order.add(id);
  }
  for (const lane of view.lanes) order.add(lane.baseId);
  return [...order];
}

export type CoveragePlayer = { entityUuid: string; classId: number };

/**
 * Players offered by the picker: the local player always comes first, then
 * teammates with at least one recorded lane in party order (healers, tanks,
 * damage dealers; one class kept together; `players` order within a class).
 * Teammates without any watched buff would only show empty rows, so they
 * are left out.
 */
export function coveragePlayerUuids(
  view: HistoryBuffTimelineView,
  players: readonly CoveragePlayer[],
  localUuid: string | null,
): string[] {
  const owners = new Set(view.lanes.map((lane) => lane.entityUuid));
  const teammates = players
    .filter(
      (player) =>
        player.entityUuid !== localUuid && owners.has(player.entityUuid),
    )
    .sort((left, right) => compareByPartyRole(left.classId, right.classId))
    .map((player) => player.entityUuid);
  const hasLocal =
    localUuid !== null &&
    players.some((player) => player.entityUuid === localUuid);
  return hasLocal ? [localUuid, ...teammates] : teammates;
}

/**
 * The player actually shown: the requested one while this encounter has
 * them, otherwise the local player, otherwise the first candidate. The
 * request itself is kept, so stepping back to an encounter with that player
 * shows them again.
 */
export function resolveCoveragePlayer(
  candidates: readonly string[],
  requested: string | null,
  localUuid: string | null,
): string | null {
  if (requested !== null && candidates.includes(requested)) return requested;
  if (localUuid !== null && candidates.includes(localUuid)) return localUuid;
  return candidates[0] ?? null;
}

/** One row per buff in `order`; buffs the player never had sink to the end. */
export function coverageRowsFor(
  view: HistoryBuffTimelineView,
  entityUuid: string,
  order: readonly number[],
): CoverageRow[] {
  const lanes = new Map<number, HistoryBuffLaneView>();
  for (const lane of view.lanes) {
    if (lane.entityUuid === entityUuid) lanes.set(lane.baseId, lane);
  }
  const present: CoverageRow[] = [];
  const absent: CoverageRow[] = [];
  for (const baseId of order) {
    const lane = lanes.get(baseId) ?? null;
    (lane ? present : absent).push({ baseId, lane });
  }
  return [...present, ...absent];
}
