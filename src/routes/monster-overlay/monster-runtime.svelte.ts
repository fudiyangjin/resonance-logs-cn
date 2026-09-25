import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  BossDbmEvent,
  BuffUpdateState,
  EntityDurationTrackState,
  HateEntry,
  HpEntry,
  StunEntry,
  TeammateFantasyState,
} from "$lib/api";
import {
  liveFantasyStore,
  liveMonsterStore,
} from "$lib/stores/live-topics.svelte";
import type { EntityId } from "$lib/entity-id";
import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import type {
  MonsterBossBuffSection,
  MonsterDragState,
  MonsterFantasyRow,
  MonsterHateSection,
  MonsterHpSection,
  MonsterStunSection,
  MonsterTeammateBuffColumn,
  MonsterTeammateBuffRow,
  MonsterResizeState,
} from "./monster-types";

function buffsByBaseId(buffs: BuffUpdateState[]) {
  const result = new Map<number, BuffUpdateState>();
  for (const buff of buffs) {
    const current = result.get(buff.baseId);
    if (!current || buff.createTimeMs >= current.createTimeMs) {
      result.set(buff.baseId, buff);
    }
  }
  return result;
}

function definedEntries<T>(
  source: Partial<Record<string, T>>,
): Array<[EntityId, T]> {
  const result: Array<[EntityId, T]> = [];
  for (const [entityUuid, value] of Object.entries(source)) {
    if (value !== undefined) result.push([entityUuid, value]);
  }
  return result;
}

function entityBuffMap(source: Partial<Record<string, BuffUpdateState[]>>) {
  return new Map<EntityId, Map<number, BuffUpdateState>>(
    definedEntries(source).map(([entityUuid, buffs]) => [
      entityUuid,
      buffsByBaseId(buffs),
    ]),
  );
}

const _playerNameCache = $derived.by(
  () =>
    new Map<EntityId, string>(
      definedEntries(liveMonsterStore.data?.playerNames ?? {}),
    ),
);
const _monsterIdCache = $derived.by(
  () =>
    new Map<EntityId, number>(
      definedEntries(liveMonsterStore.data?.monsterIds ?? {}),
    ),
);
const _bossBuffMap = $derived.by(() =>
  entityBuffMap(liveMonsterStore.data?.bossBuffs ?? {}),
);
const _teammateBuffMap = $derived.by(() =>
  entityBuffMap(liveMonsterStore.data?.teammateBuffs ?? {}),
);
const _bossHateMap = $derived.by(
  () =>
    new Map<EntityId, HateEntry[]>(
      definedEntries(liveMonsterStore.data?.hateLists ?? {}),
    ),
);
const _bossStunMap = $derived.by(
  () =>
    new Map<EntityId, StunEntry>(
      (liveMonsterStore.data?.stun ?? []).map((entry) => [
        entry.bossEntityUuid,
        entry,
      ]),
    ),
);
const _bossHpMap = $derived.by(
  () =>
    new Map<EntityId, HpEntry>(
      (liveMonsterStore.data?.hp ?? []).map((entry) => [
        entry.bossEntityUuid,
        entry,
      ]),
    ),
);
const _bossDbmMap = $derived.by(() => {
  const result = new Map<number, BossDbmEvent>();
  for (const event of liveMonsterStore.data?.bossMechanics ?? []) {
    const current = result.get(event.baseSkillId);
    if (!current || event.createTimeMs >= current.createTimeMs) {
      result.set(event.baseSkillId, event);
    }
  }
  return result;
});

const _entityDurationTrackCache = $derived.by(
  (): EntityDurationTrackState[] =>
    liveMonsterStore.data?.entityDurationTracks ?? [],
);

export const monsterRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  isInitialized: false,
  isMounted: false,
  bossSections: [] as MonsterBossBuffSection[],
  teammateColumns: [] as MonsterTeammateBuffColumn[],
  teammateRows: [] as MonsterTeammateBuffRow[],
  hateSections: [] as MonsterHateSection[],
  stunSections: [] as MonsterStunSection[],
  hpSections: [] as MonsterHpSection[],
  fantasyRows: [] as MonsterFantasyRow[],
  dbmRows: [] as TextBuffDisplay[],
  entityDurationRows: [] as TextBuffDisplay[],
  isEditing: false,
  dragState: null as MonsterDragState | null,
  resizeState: null as MonsterResizeState | null,
  layoutPreviewRafId: null as number | null,
});

export function monsterPlayerNames() {
  return _playerNameCache;
}

export function monsterIds() {
  return _monsterIdCache;
}

export function monsterBossBuffs() {
  return _bossBuffMap;
}

export function monsterTeammateBuffs() {
  return _teammateBuffMap;
}

export function monsterHateLists() {
  return _bossHateMap;
}

export function monsterStunEntries() {
  return _bossStunMap;
}

export function monsterHpEntries() {
  return _bossHpMap;
}

export function monsterFantasyEntries(): TeammateFantasyState[] {
  return liveFantasyStore.data?.teammateFantasies ?? [];
}

export function monsterBossMechanics() {
  return _bossDbmMap;
}

export function monsterBossSections() {
  return monsterRuntime.bossSections;
}

export function monsterHateSections() {
  return monsterRuntime.hateSections;
}

export function monsterStunSections() {
  return monsterRuntime.stunSections;
}

export function monsterHpSections() {
  return monsterRuntime.hpSections;
}

export function monsterFantasyRows() {
  return monsterRuntime.fantasyRows;
}

export function monsterDbmRows() {
  return monsterRuntime.dbmRows;
}

export function monsterEntityDurationTracks(): EntityDurationTrackState[] {
  return _entityDurationTrackCache;
}

export function monsterEntityDurationRows() {
  return monsterRuntime.entityDurationRows;
}

export function monsterTeammateRows() {
  return monsterRuntime.teammateRows;
}

export function monsterTeammateColumns() {
  return monsterRuntime.teammateColumns;
}

// Whether to render configured-but-inactive panel placeholders while editing.
export function isMonsterLayoutScaffold() {
  return monsterRuntime.isEditing;
}

export function isMonsterEditing() {
  return monsterRuntime.isEditing;
}
