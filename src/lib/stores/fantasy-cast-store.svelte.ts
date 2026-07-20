/**
 * @file Aggregates `teammate-fantasy-update` detections into "most recent N
 * *distinct* fantasy types per player", for the live window's inline fantasy
 * icons.
 *
 * The backend reports one `TeammateFantasyState` per *summoned entity*, but a
 * single ability cast can spawn several entities at once (e.g. a goblin
 * king's escort types). Those collapse into one cast here via
 * `resolveFantasyCastKey`, which maps every monster id from the same cast to
 * the same key.
 *
 * Kept entries are deduplicated by `castKey` across the *entire* list, not
 * just against the most recent one: if a fantasy type already has a slot
 * (whether that's from the same summon tick or a genuine re-cast much
 * later), a new detection refreshes that slot in place and bumps it to the
 * front, rather than pushing a duplicate. Only a fantasy type with no
 * existing slot allocates a new one, evicting the oldest once
 * `MAX_CASTS_PER_PLAYER` is exceeded. This guarantees an A, B, B cast
 * sequence keeps showing "A, B" (with B refreshed), never "B, B".
 */
import type { TeammateFantasyState } from "$lib/api";
import {
  type FantasyIconInfo,
  resolveFantasyCastKey,
  resolveFantasyDisplayName,
  resolveFantasyIcon,
} from "$lib/fantasy-icons";

const MAX_CASTS_PER_PLAYER = 2;

export type FantasyCastEntry = {
  /**
   * Unique per cast slot, for use as the `{#each}` key. Neither `key` (the
   * fantasy type) nor `lastSeenAtMs` (its detection timestamp) are safe for
   * that on their own: the same fantasy can occupy both kept slots after a
   * re-cast, and multiple *different* fantasies detected in the same
   * backend sync tick share the exact same `lastSeenAtMs`.
   */
  id: number;
  key: string;
  monsterId: number;
  name: string;
  skillId: number | null;
  iconPath: string;
  remodelLevel: number;
  lastSeenAtMs: number;
};

let castsBySummoner = $state<Map<string, FantasyCastEntry[]>>(new Map());
let nextCastId = 0;

function toCastEntry(
  entry: TeammateFantasyState,
  castKey: string,
  id: number,
  icon: FantasyIconInfo,
): FantasyCastEntry {
  return {
    id,
    key: castKey,
    monsterId: entry.monsterId,
    name: resolveFantasyDisplayName(entry.monsterId),
    skillId: icon.skillId,
    iconPath: icon.iconPath,
    remodelLevel: entry.remodelLevel,
    lastSeenAtMs: entry.detectedAtMs,
  };
}

/** Merges freshly detected fantasy casts into the per-player cast history. */
export function mergeFantasyCasts(entries: TeammateFantasyState[]): void {
  if (entries.length === 0) return;

  const next = new Map(castsBySummoner);
  for (const entry of entries) {
    const icon = resolveFantasyIcon(entry.monsterId);
    // No curated monsterId -> skill mapping: skip entirely rather than
    // showing a generic placeholder icon.
    if (icon.isPlaceholder) continue;

    const castKey = resolveFantasyCastKey(entry.monsterId);
    const casts = next.get(entry.summonerUuid) ?? [];
    const existingIndex = casts.findIndex((cast) => cast.key === castKey);
    const existing = existingIndex !== -1 ? casts[existingIndex] : undefined;

    if (existingIndex !== -1 && existing !== undefined) {
      // This fantasy type already has a slot (same summon tick spawning
      // multiple entities, or a genuine re-cast later on): refresh it in
      // place and move it to the front, instead of adding a duplicate.
      const rest = [
        ...casts.slice(0, existingIndex),
        ...casts.slice(existingIndex + 1),
      ];
      next.set(entry.summonerUuid, [
        toCastEntry(entry, castKey, existing.id, icon),
        ...rest,
      ]);
      continue;
    }

    next.set(
      entry.summonerUuid,
      [toCastEntry(entry, castKey, nextCastId++, icon), ...casts].slice(
        0,
        MAX_CASTS_PER_PLAYER,
      ),
    );
  }
  castsBySummoner = next;
}

export function getFantasyCasts(summonerUuid: string): FantasyCastEntry[] {
  return castsBySummoner.get(summonerUuid) ?? [];
}

export function clearFantasyCasts(): void {
  castsBySummoner = new Map();
}
