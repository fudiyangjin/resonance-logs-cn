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
import {
  definedEntries,
  reuseEntityBuffMap,
  reuseEntityMap,
  reuseEntitySet,
  type EntityBuffMapCache,
} from "./monster-payload-reuse";
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

// Previous views, reused while a payload leaves their content unchanged.
let playerNameCache: Map<EntityId, string> | null = null;
let monsterIdCache: Map<EntityId, number> | null = null;
let bossBuffCache: EntityBuffMapCache | null = null;
let teammateBuffCache: EntityBuffMapCache | null = null;
let deadTeammateCache: ReadonlySet<EntityId> | null = null;

const _playerNameCache = $derived.by(() => {
  playerNameCache = reuseEntityMap(
    playerNameCache,
    liveMonsterStore.data?.playerNames ?? {},
  );
  return playerNameCache;
});
const _monsterIdCache = $derived.by(() => {
  monsterIdCache = reuseEntityMap(
    monsterIdCache,
    liveMonsterStore.data?.monsterIds ?? {},
  );
  return monsterIdCache;
});
const _bossBuffMap = $derived.by(() => {
  bossBuffCache = reuseEntityBuffMap(
    bossBuffCache,
    liveMonsterStore.data?.bossBuffs ?? {},
    buffsByBaseId,
  );
  return bossBuffCache.value;
});
const _teammateBuffMap = $derived.by(() => {
  teammateBuffCache = reuseEntityBuffMap(
    teammateBuffCache,
    liveMonsterStore.data?.teammateBuffs ?? {},
    buffsByBaseId,
  );
  return teammateBuffCache.value;
});
const _deadTeammateSet = $derived.by((): ReadonlySet<EntityId> => {
  deadTeammateCache = reuseEntitySet(
    deadTeammateCache,
    liveMonsterStore.data?.deadTeammates ?? [],
  );
  return deadTeammateCache;
});
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

// Display projections are replaced wholesale, never mutated. Raw state keeps
// the assigned instance, so `assignRuntime`'s identity check holds and a
// frame that leaves a projection unchanged does not re-render its panel (a
// deep `$state` re-proxies every assignment into a new, unequal value).
class MonsterRuntimeState {
  currentWindow = $state<ReturnType<typeof getCurrentWindow> | null>(null);
  cleanup = $state<(() => void) | null>(null);
  isInitialized = $state(false);
  isMounted = $state(false);
  bossSections = $state.raw<MonsterBossBuffSection[]>([]);
  teammateColumns = $state.raw<MonsterTeammateBuffColumn[]>([]);
  teammateRows = $state.raw<MonsterTeammateBuffRow[]>([]);
  hateSections = $state.raw<MonsterHateSection[]>([]);
  stunSections = $state.raw<MonsterStunSection[]>([]);
  hpSections = $state.raw<MonsterHpSection[]>([]);
  fantasyRows = $state.raw<MonsterFantasyRow[]>([]);
  dbmRows = $state.raw<TextBuffDisplay[]>([]);
  entityDurationRows = $state.raw<TextBuffDisplay[]>([]);
  isEditing = $state(false);
  dragState = $state<MonsterDragState | null>(null);
  resizeState = $state<MonsterResizeState | null>(null);
  layoutPreviewRafId = $state<number | null>(null);
}

export const monsterRuntime = new MonsterRuntimeState();

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

/** Teammates in range that are dead; their rows stay even without buffs. */
export function monsterDeadTeammates() {
  return _deadTeammateSet;
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
