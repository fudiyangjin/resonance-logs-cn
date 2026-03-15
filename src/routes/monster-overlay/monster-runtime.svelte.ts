import { getCurrentWindow } from "@tauri-apps/api/window";
import type { BuffUpdateState, HateEntry } from "$lib/api";
import type {
  MonsterBossBuffSection,
  MonsterDragState,
  MonsterHateSection,
  MonsterResizeState,
} from "./monster-types";

export const monsterRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  isInitialized: false,
  isMounted: false,
  rafId: null as number | null,
  nameCache: new Map<number, string>(),
  bossBuffMap: new Map<number, Map<number, BuffUpdateState>>(),
  bossHateMap: new Map<number, HateEntry[]>(),
  bossSections: [] as MonsterBossBuffSection[],
  hateSections: [] as MonsterHateSection[],
  isEditing: false,
  dragState: null as MonsterDragState | null,
  resizeState: null as MonsterResizeState | null,
});

export function monsterBossSections() {
  return monsterRuntime.bossSections;
}

export function monsterHateSections() {
  return monsterRuntime.hateSections;
}

export function isMonsterEditing() {
  return monsterRuntime.isEditing;
}
