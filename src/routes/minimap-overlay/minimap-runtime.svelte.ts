import { getCurrentWindow } from "@tauri-apps/api/window";
import { SvelteMap } from "svelte/reactivity";
import type { MinimapSnapshot } from "$lib/api";
import type { EntityId } from "$lib/entity-id";

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
  playerNameCache: new SvelteMap<EntityId, string>(),
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
