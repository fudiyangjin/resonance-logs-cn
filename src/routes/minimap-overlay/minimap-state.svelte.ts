import { SETTINGS, createDefaultMinimapConfig } from "$lib/settings-store";
import { minimapRuntime } from "./minimap-runtime.svelte.js";

function patchMinimapSettings(
  updater: (
    config: typeof SETTINGS.minimap.state,
  ) => typeof SETTINGS.minimap.state,
) {
  Object.assign(SETTINGS.minimap.state, updater(SETTINGS.minimap.state));
}

export async function setMinimapEditMode(editing: boolean) {
  minimapRuntime.isEditing = editing;
  if (minimapRuntime.currentWindow) {
    await minimapRuntime.currentWindow.setIgnoreCursorEvents(!editing);
  }
}

export function resetMinimapPositions() {
  const defaults = createDefaultMinimapConfig();
  patchMinimapSettings((config) => ({
    ...config,
    mapPanel: {
      ...config.mapPanel,
      x: defaults.mapPanel.x,
      y: defaults.mapPanel.y,
    },
    infoPanel: {
      ...config.infoPanel,
      x: defaults.infoPanel.x,
      y: defaults.infoPanel.y,
    },
  }));
}

export function resetMinimapSizes() {
  const defaults = createDefaultMinimapConfig();
  patchMinimapSettings((config) => ({
    ...config,
    mapPanel: {
      ...config.mapPanel,
      width: defaults.mapPanel.width,
      scale: defaults.mapPanel.scale,
    },
    infoPanel: {
      ...config.infoPanel,
      width: defaults.infoPanel.width,
      scale: defaults.infoPanel.scale,
    },
  }));
}

export function onWindowDragPointerDown(e: PointerEvent) {
  if (
    !minimapRuntime.isEditing ||
    e.button !== 0 ||
    !minimapRuntime.currentWindow
  ) {
    return;
  }
  const el = e.target as HTMLElement | null;
  if (el?.closest("button,a,input,textarea,select")) return;
  e.preventDefault();
  void minimapRuntime.currentWindow.startDragging();
}
