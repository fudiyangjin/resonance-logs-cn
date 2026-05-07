import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  BuffUpdateState,
  CounterUpdateState,
  LiveDataPayload,
  ShieldDetailEntry,
  SkillCdState,
} from "$lib/api";
import type { BuffDefinition } from "$lib/config/buff-name-table";
import type {
  DragState,
  ResizeState,
  SkillDurationState,
} from "./overlay-types";

export type BuffUptimeTotals = {
  baseId: number;
  trackingMode: "self" | "global";
  hostUid: number;
  sourceUid: number;
  sourceConfigId: number | null;
  encounterActiveMs: number;
  trueActiveMs: number;
};

export const overlayRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  isInitialized: false,
  isMounted: false,
  cdMap: new Map<number, SkillCdState>(),
  skillDurationMap: new Map<number, SkillDurationState>(),
  fightResMap: new Map<number, number>(),
  buffMap: new Map<number, BuffUpdateState>(),
  localBuffs: [] as BuffUpdateState[],
  bossBuffLists: new Map<number, BuffUpdateState[]>(),
  activeUptimeRowKeys: new Set<string>(),
  nameCache: new Map<number, string>(),
  counterMap: new Map<number, CounterUpdateState>(),
  panelAttrMap: new Map<number, number>(),
  shieldDetailEntries: [] as ShieldDetailEntry[],
  shieldDetailHp: { current: 0, max: 0 },
  buffDefinitions: new Map<number, BuffDefinition>(),
  liveData: null as LiveDataPayload | null,
  uptimeTotals: new Map<string, BuffUptimeTotals>(),
  uptimeFightStartTimestampMs: 0,
  uptimeLastElapsedMs: 0,
  uptimeLastActiveCombatTimeMs: 0,
  isEditing: false,
  restoreVisibilityAfterEditing: false,
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

export function localBuffs() {
  return overlayRuntime.localBuffs;
}

export function bossBuffLists() {
  return overlayRuntime.bossBuffLists;
}

export function activeUptimeRowKeys() {
  return overlayRuntime.activeUptimeRowKeys;
}

export function nameCache() {
  return overlayRuntime.nameCache;
}

export function counterMap() {
  return overlayRuntime.counterMap;
}

export function panelAttrMap() {
  return overlayRuntime.panelAttrMap;
}

export function shieldDetailEntries() {
  return overlayRuntime.shieldDetailEntries;
}

export function shieldDetailHp() {
  return overlayRuntime.shieldDetailHp;
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


export function liveData() {
  return overlayRuntime.liveData;
}

export function uptimeTotals() {
  return overlayRuntime.uptimeTotals;
}
