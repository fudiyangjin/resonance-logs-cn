import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  BuffUpdateState,
  CounterUpdateState,
  ShieldDetailEntry,
  SkillCdState,
} from "$lib/api";
import type { BuffDefinition } from "$lib/config/buff-name-table";
import type {
  DragState,
  ResizeState,
  SkillDurationState,
} from "./overlay-types";

export const overlayRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  isInitialized: false,
  isMounted: false,
  cdMap: new Map<number, SkillCdState>(),
  skillDurationMap: new Map<number, SkillDurationState>(),
  fightResMap: new Map<number, number>(),
  buffMap: new Map<number, BuffUpdateState>(),
  counterMap: new Map<number, CounterUpdateState>(),
  panelAttrMap: new Map<number, number>(),
  shieldDetailHp: { current: 0, max: 0 },
  shieldDetailEntries: [] as ShieldDetailEntry[],
  buffDefinitions: new Map<number, BuffDefinition>(),
  isEditing: false,
  dragState: null as DragState | null,
  resizeState: null as ResizeState | null,
});

export function cdMap() {
  return overlayRuntime.cdMap;
}

export function skillDurationMap() {
  return overlayRuntime.skillDurationMap;
}

export function fightResMap() {
  return overlayRuntime.fightResMap;
}

export function buffMap() {
  return overlayRuntime.buffMap;
}

export function counterMap() {
  return overlayRuntime.counterMap;
}

export function panelAttrMap() {
  return overlayRuntime.panelAttrMap;
}

export function shieldDetailHp() {
  return overlayRuntime.shieldDetailHp;
}

export function shieldDetailEntries() {
  return overlayRuntime.shieldDetailEntries;
}

export function buffDefinitions() {
  return overlayRuntime.buffDefinitions;
}

export function isEditing() {
  return overlayRuntime.isEditing;
}

export function dragState() {
  return overlayRuntime.dragState;
}

export function resizeState() {
  return overlayRuntime.resizeState;
}
