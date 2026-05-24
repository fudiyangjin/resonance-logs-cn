import { getCurrentWindow } from "@tauri-apps/api/window";
import type { BuffUpdateState, HateEntry } from "$lib/api";
import type { EntityId } from "$lib/entity-id";
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
  playerNameCache: new Map<EntityId, string>(),
  monsterIdCache: new Map<EntityId, number>(),
  bossBuffMap: new Map<EntityId, Map<number, BuffUpdateState>>(),
  teammateBuffMap: new Map<EntityId, Map<number, BuffUpdateState>>(),
  bossHateMap: new Map<EntityId, HateEntry[]>(),
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
