import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  BossDbmEvent,
  BuffUpdateState,
  HateEntry,
  StunEntry,
  TeammateFantasyState,
} from "$lib/api";
import type { EntityId } from "$lib/entity-id";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import type {
  MonsterBossBuffSection,
  MonsterDragState,
  MonsterFantasyRow,
  MonsterHateSection,
  MonsterStunSection,
  MonsterTeammateBuffColumn,
  MonsterTeammateBuffRow,
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
  bossStunMap: new Map<EntityId, StunEntry>(),
  fantasyEntries: [] as TeammateFantasyState[],
  bossDbmMap: new Map<number, BossDbmEvent>(),
  bossSections: [] as MonsterBossBuffSection[],
  teammateColumns: [] as MonsterTeammateBuffColumn[],
  teammateRows: [] as MonsterTeammateBuffRow[],
  hateSections: [] as MonsterHateSection[],
  stunSections: [] as MonsterStunSection[],
  fantasyRows: [] as MonsterFantasyRow[],
  dbmRows: [] as TextBuffDisplay[],
  isEditing: false,
  // True while this overlay is shown beneath the game-overlay as its reference
  // layer (passive role). Driven by the "monster-overlay-reference-toggle" event.
  isReferenceMode: false,
  dragState: null as MonsterDragState | null,
  resizeState: null as MonsterResizeState | null,
});

export function monsterBossSections() {
  return monsterRuntime.bossSections;
}

export function monsterHateSections() {
  return monsterRuntime.hateSections;
}

export function monsterStunSections() {
  return monsterRuntime.stunSections;
}

export function monsterFantasyRows() {
  return monsterRuntime.fantasyRows;
}

export function monsterDbmRows() {
  return monsterRuntime.dbmRows;
}

export function monsterTeammateRows() {
  return monsterRuntime.teammateRows;
}

export function monsterTeammateColumns() {
  return monsterRuntime.teammateColumns;
}

export function isMonsterReferenceMode() {
  return monsterRuntime.isReferenceMode;
}

// Whether to render the full layout scaffold (placeholder sections/rows for
// configured-but-inactive panels). True both in this overlay's own edit mode AND
// when it is used as a reference layer beneath the game-overlay.
export function isMonsterLayoutScaffold() {
  return monsterRuntime.isEditing || monsterRuntime.isReferenceMode;
}

export function isMonsterEditing() {
  return monsterRuntime.isEditing;
}
