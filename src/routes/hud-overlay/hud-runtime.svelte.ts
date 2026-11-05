import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  HUD_DOMAINS,
  type HudDomain,
  type HudDomainVisibility,
} from "$lib/hud-overlay";
import { overlayRuntime } from "../game-overlay/overlay-runtime.svelte.js";
import { monsterRuntime } from "../monster-overlay/monster-runtime.svelte.js";
import { minimapRuntime } from "../minimap-overlay/minimap-runtime.svelte.js";

const visibility = $state<HudDomainVisibility>({
  game: false,
  monster: false,
  minimap: false,
  damage: false,
});

export const hudRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  editing: false,
});

export function hudVisibility(): HudDomainVisibility {
  return visibility;
}

export function isHudDomainVisible(domain: HudDomain): boolean {
  return visibility[domain];
}

export function hasVisibleHudDomain(): boolean {
  return HUD_DOMAINS.some((domain) => visibility[domain]);
}

export function setHudDomainVisible(domain: HudDomain, visible: boolean): void {
  visibility[domain] = visible;
}

export function isHudEditing(): boolean {
  return hudRuntime.editing;
}

export function attachHudWindow(
  currentWindow: ReturnType<typeof getCurrentWindow>,
): void {
  hudRuntime.currentWindow = currentWindow;
  overlayRuntime.currentWindow = currentWindow;
  monsterRuntime.currentWindow = currentWindow;
  minimapRuntime.currentWindow = currentWindow;
}

export function detachHudWindow(): void {
  hudRuntime.currentWindow = null;
  overlayRuntime.currentWindow = null;
  monsterRuntime.currentWindow = null;
  minimapRuntime.currentWindow = null;
}

export function applyHudEditingState(editing: boolean): void {
  hudRuntime.editing = editing;
  overlayRuntime.isEditing = editing;
  monsterRuntime.isEditing = editing;
  minimapRuntime.isEditing = editing;
}
