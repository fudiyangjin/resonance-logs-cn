import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  BuffUpdateState,
  CounterUpdateState,
  ShieldDetailEntry,
  SkillCdState,
} from "$lib/api";
import {
  liveBuffsStore,
  liveStatusStore,
} from "$lib/stores/live-topics.svelte";
import type { BuffCoverageEntry } from "$lib/bindings";
import type { BuffDefinition } from "$lib/config/buff-name-table";
import { reuseIfSame, reuseMap, reuseSet } from "$lib/structural-reuse";
import type { DragState, ResizeState } from "./overlay-types";

function latestBuffsByBaseId(buffs: BuffUpdateState[]) {
  const result = new Map<number, BuffUpdateState>();
  for (const buff of buffs) {
    const current = result.get(buff.baseId);
    if (!current || buff.createTimeMs >= current.createTimeMs) {
      result.set(buff.baseId, buff);
    }
  }
  return result;
}

// The local buff list can hold hundreds of entries ("monitor all"), so it
// compares the known fields directly instead of a generic deep compare.
function sameBuffState(left: BuffUpdateState, right: BuffUpdateState) {
  return (
    left.baseId === right.baseId &&
    left.layer === right.layer &&
    left.durationMs === right.durationMs &&
    left.createTimeMs === right.createTimeMs &&
    left.sourceRemodelLevel === right.sourceRemodelLevel
  );
}

// Status and buffs payloads are replaced whenever any field changes (local
// HP, coverage ticks, ...). Each view keeps its previous instance while its
// own content is unchanged, so unrelated frames do not rebuild the panels.
let cdMapCache: Map<number, SkillCdState> | undefined;
let fightResMapCache: Map<number, number> | undefined;
let buffMapCache: Map<number, BuffUpdateState> | undefined;
let buffCoverageCache: BuffCoverageEntry[] | undefined;
let counterMapCache: Map<number, CounterUpdateState> | undefined;
let factorCounterMapCache: Map<number, CounterUpdateState> | undefined;
let panelAttrMapCache: Map<number, number> | undefined;
let factorSourceItemIdsCache: number[] | undefined;
let factorSlotItemIdsCache: number[] | undefined;
let seasonActiveTemplateIdsCache: Set<number> | undefined;
let shieldHpCache: { current: number; max: number } | undefined;
let shieldEntriesCache: ShieldDetailEntry[] | undefined;

const _cdMap = $derived.by(() => {
  const result = new Map<number, SkillCdState>();
  for (const cd of liveStatusStore.data?.skillCds ?? []) {
    result.set(Math.floor(cd.skillLevelId / 100), cd);
  }
  return (cdMapCache = reuseMap(cdMapCache, result));
});

const _fightResMap = $derived.by(() => {
  const result = new Map<number, number>();
  for (const entry of liveStatusStore.data?.fightResource?.entries ?? []) {
    result.set(entry.id, entry.value);
  }
  return (fightResMapCache = reuseMap(fightResMapCache, result));
});

const _buffMap = $derived.by(
  () =>
    (buffMapCache = reuseMap(
      buffMapCache,
      latestBuffsByBaseId(liveBuffsStore.data?.localBuffs ?? []),
      sameBuffState,
    )),
);

const _buffCoverage = $derived.by(
  () =>
    (buffCoverageCache = reuseIfSame(
      buffCoverageCache,
      liveBuffsStore.data?.coverage ?? [],
    )),
);

function countersByRuleId(counters: CounterUpdateState[]) {
  return new Map(counters.map((counter) => [counter.ruleId, counter]));
}

const _counterMap = $derived.by(
  () =>
    (counterMapCache = reuseMap(
      counterMapCache,
      countersByRuleId(liveStatusStore.data?.counters ?? []),
    )),
);
const _factorCounterMap = $derived.by(
  () =>
    (factorCounterMapCache = reuseMap(
      factorCounterMapCache,
      countersByRuleId(liveStatusStore.data?.factorCounters ?? []),
    )),
);
const _panelAttrMap = $derived.by(
  () =>
    (panelAttrMapCache = reuseMap(
      panelAttrMapCache,
      new Map(
        (liveStatusStore.data?.panelAttrs ?? []).map((attr) => [
          attr.attrId,
          attr.value,
        ]),
      ),
    )),
);
const _factorSourceItemIds = $derived.by(
  () =>
    (factorSourceItemIdsCache = reuseIfSame(
      factorSourceItemIdsCache,
      liveStatusStore.data?.factorSourceItemIds ?? [],
    )),
);
const _factorSlotItemIds = $derived.by(
  () =>
    (factorSlotItemIdsCache = reuseIfSame(
      factorSlotItemIdsCache,
      liveStatusStore.data?.factorSlotItemIds ?? [],
    )),
);
const _shieldHp = $derived.by(
  () =>
    (shieldHpCache = reuseIfSame(shieldHpCache, {
      current: liveStatusStore.data?.shieldCurrentHp ?? 0,
      max: liveStatusStore.data?.shieldMaxHp ?? 0,
    })),
);
const _shieldEntries = $derived.by(
  () =>
    (shieldEntriesCache = reuseIfSame(
      shieldEntriesCache,
      liveStatusStore.data?.shieldEntries ?? [],
    )),
);

export const overlayRuntime = $state({
  currentWindow: null as ReturnType<typeof getCurrentWindow> | null,
  cleanup: null as (() => void) | null,
  isInitialized: false,
  isMounted: false,
  buffDefinitions: new Map<number, BuffDefinition>(),
  isEditing: false,
  dragState: null as DragState | null,
  resizeState: null as ResizeState | null,
  layoutPreviewRafId: null as number | null,
});

export function cdMap() {
  return _cdMap;
}

export function fightResMap() {
  return _fightResMap;
}

export function buffMap() {
  return _buffMap;
}

export function buffCoverage() {
  return _buffCoverage;
}

export function counterMap() {
  return _counterMap;
}

export function factorCounterMap() {
  return _factorCounterMap;
}

export function seasonCultivateFactorSourceItemIds() {
  return _factorSourceItemIds;
}

export function seasonCultivateFactorSlotItemIds() {
  return _factorSlotItemIds;
}

const _seasonActiveTemplateIds = $derived.by(
  () =>
    (seasonActiveTemplateIdsCache = reuseSet(
      seasonActiveTemplateIdsCache,
      new Set(liveStatusStore.data?.seasonActiveTemplateIds ?? []),
    )),
);

/** Highest deep-sleep (800522) `seasonId` resolved by the backend; `0`
 * before any season data has been observed. */
export function seasonCultivateSeasonId() {
  return liveStatusStore.data?.seasonId ?? 0;
}

/** Talent template id(s) currently equipped (`cultivateLineAreaList`).
 * Meaningful from S4 on (`seasonCultivateSeasonId() >= 4`). */
export function seasonActiveTemplateIds() {
  return _seasonActiveTemplateIds;
}

export function panelAttrMap() {
  return _panelAttrMap;
}

export function shieldDetailHp() {
  return _shieldHp;
}

export function shieldDetailEntries(): ShieldDetailEntry[] {
  return _shieldEntries;
}

export function buffDefinitions() {
  return overlayRuntime.buffDefinitions;
}

export function isEditing() {
  return overlayRuntime.isEditing;
}

// Whether to render configured-but-inactive placeholders while editing.
export function isLayoutScaffold() {
  return overlayRuntime.isEditing;
}

export function dragState() {
  return overlayRuntime.dragState;
}

export function resizeState() {
  return overlayRuntime.resizeState;
}
