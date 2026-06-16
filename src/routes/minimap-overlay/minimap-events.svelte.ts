import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onEntityIdentities, onMinimapUpdate } from "$lib/api";
import { initOverlayClock } from "../game-overlay/overlay-clock.svelte.js";
import { minimapRuntime } from "./minimap-runtime.svelte.js";
import { setMinimapEditMode } from "./minimap-state.svelte.js";

/**
 * Wires up the minimap overlay: edit-mode toggle, the high-frequency
 * `minimap-update` stream, entity-name identities, and the shared overlay clock
 * (drives buff countdowns). Returns a cleanup function that unsubscribes all
 * listeners; safe to call repeatedly (idempotent via the runtime guard).
 */
export function initMinimapOverlay() {
  if (minimapRuntime.cleanup) return minimapRuntime.cleanup;
  if (typeof window === "undefined") {
    return () => {};
  }

  minimapRuntime.isMounted = true;
  minimapRuntime.isInitialized = true;
  minimapRuntime.currentWindow = getCurrentWindow();

  document.documentElement.style.setProperty(
    "background",
    "transparent",
    "important",
  );
  document.body.style.setProperty("background", "transparent", "important");

  const stopClock = initOverlayClock();
  void setMinimapEditMode(false);

  const unlistenEditToggle = listen("minimap-overlay-edit-toggle", () => {
    void setMinimapEditMode(!minimapRuntime.isEditing);
  });

  const unlistenMinimap = onMinimapUpdate((event) => {
    minimapRuntime.snapshot = event.payload.snapshot;
  });

  const unlistenIdentities = onEntityIdentities((event) => {
    for (const [entityUuid, name] of Object.entries(
      event.payload.playerNames,
    )) {
      minimapRuntime.playerNameCache.set(entityUuid, name);
    }
  });

  const cleanup = () => {
    stopClock();
    void unlistenEditToggle.then((fn) => fn());
    void unlistenMinimap.then((fn) => fn());
    void unlistenIdentities.then((fn) => fn());
    minimapRuntime.cleanup = null;
    minimapRuntime.isMounted = false;
  };
  minimapRuntime.cleanup = cleanup;
  return cleanup;
}
