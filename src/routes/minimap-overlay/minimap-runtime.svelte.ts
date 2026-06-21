import { getCurrentWindow } from "@tauri-apps/api/window";
import { SvelteMap } from "svelte/reactivity";
import type { MinimapSkillCast, MinimapSnapshot } from "$lib/api";
import type { EntityId } from "$lib/entity-id";

const MAX_SKILL_CAST_LOG = 64;

/**
 * Reactive runtime state for the minimap overlay window.
 *
 * `snapshot` is replaced wholesale on each `minimap-update` event; consumers
 * read it via `$derived`/`$effect` so canvas and info bar stay in sync.
 */
export const minimapRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  isInitialized: false,
  isMounted: false,
  isEditing: false,
  snapshot: null as MinimapSnapshot | null,
  lastSceneId: null as number | null,
  skillCastLog: [] as MinimapSkillCast[],
  playerNameCache: new SvelteMap<EntityId, string>(),
  entityFirstSeenMs: new SvelteMap<string, number>(),
});

export function minimapSnapshot() {
  return minimapRuntime.snapshot;
}

export function isMinimapEditing() {
  return minimapRuntime.isEditing;
}

export function minimapPlayerNames() {
  return minimapRuntime.playerNameCache;
}

export function minimapSkillCasts() {
  return minimapRuntime.skillCastLog;
}

export function clearSkillCastLog() {
  minimapRuntime.skillCastLog = [];
  minimapRuntime.entityFirstSeenMs.clear();
}

export function entityFirstSeen(entityUuid: string): number | undefined {
  return minimapRuntime.entityFirstSeenMs.get(entityUuid);
}

/**
 * Records the first-seen time for every entity in the snapshot (set-if-absent).
 * Stale uuids are intentionally not pruned here: rows are only generated for
 * entities present in the current snapshot, so retaining old entries is
 * harmless and avoids resetting a countdown if an entity blinks out for a
 * single frame. The whole map is cleared on scene change via clearSkillCastLog.
 */
export function updateEntityFirstSeen(
  snapshot: MinimapSnapshot,
  nowMs: number,
) {
  for (const entity of snapshot.entities) {
    if (!minimapRuntime.entityFirstSeenMs.has(entity.entityUuid)) {
      minimapRuntime.entityFirstSeenMs.set(entity.entityUuid, nowMs);
    }
  }
}

export function consumeMinimapSkillCasts(skillCasts: MinimapSkillCast[]) {
  if (skillCasts.length === 0) return;
  minimapRuntime.skillCastLog = [
    ...minimapRuntime.skillCastLog,
    ...skillCasts,
  ].slice(-MAX_SKILL_CAST_LOG);
}
