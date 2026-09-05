/**
 * @file Live-meter profile switching.
 *
 * Live-meter settings are scattered across many RuneStores (`SETTINGS.live.*`)
 * so that every existing consumer can keep reading/writing
 * `SETTINGS.live.<section>.state.<field>` exactly as before. This module
 * treats those stores as a "mirror": it holds a live working copy of
 * whichever profile in `SETTINGS.monitoring.state.liveMeter.profiles`
 * matches `mirroredProfileId`. Switching loadouts flushes the mirror into
 * its previous slot, then copies the newly-selected profile into the
 * mirror — the same pattern as `monster-monitor-profile.svelte.ts`, just
 * spread across several stores instead of one object.
 */
import {
  SETTINGS,
  createDefaultLiveMeterProfileData,
  deepCloneSettings,
  mergeLiveHeaderCustomization,
  normalizeDeathReplayColumnOrder,
  normalizeDpsSkillColumnOrder,
  normalizeHealSkillColumnOrder,
  normalizeTankedSkillColumnOrder,
  generateProfileId,
  type LiveMeterProfile,
  type LiveMeterProfileData,
} from "./settings-store";
import { normalizeDpsColumnLabels } from "./column-labels";
import { untrack } from "svelte";

type LiveStore<T> = { readonly state: T };

type LiveStoreMap = {
  general: LiveStore<LiveMeterProfileData["general"]>;
  history: {
    general: LiveStore<LiveMeterProfileData["history"]["general"]>;
    dpsPlayers: LiveStore<LiveMeterProfileData["history"]["dpsPlayers"]>;
    dpsSkillBreakdown: LiveStore<
      LiveMeterProfileData["history"]["dpsSkillBreakdown"]
    >;
    healPlayers: LiveStore<LiveMeterProfileData["history"]["healPlayers"]>;
    healSkillBreakdown: LiveStore<
      LiveMeterProfileData["history"]["healSkillBreakdown"]
    >;
    tankedPlayers: LiveStore<LiveMeterProfileData["history"]["tankedPlayers"]>;
    tankedSkillBreakdown: LiveStore<
      LiveMeterProfileData["history"]["tankedSkillBreakdown"]
    >;
  };
  columnLabels: LiveStore<LiveMeterProfileData["columnLabels"]>;
  dpsPlayers: LiveStore<LiveMeterProfileData["dpsPlayers"]>;
  dpsSkillBreakdown: LiveStore<LiveMeterProfileData["dpsSkillBreakdown"]>;
  healPlayers: LiveStore<LiveMeterProfileData["healPlayers"]>;
  healSkillBreakdown: LiveStore<LiveMeterProfileData["healSkillBreakdown"]>;
  tankedPlayers: LiveStore<LiveMeterProfileData["tankedPlayers"]>;
  tankedSkillBreakdown: LiveStore<LiveMeterProfileData["tankedSkillBreakdown"]>;
  deathReplay: LiveStore<LiveMeterProfileData["deathReplay"]>;
  tableCustomization: LiveStore<LiveMeterProfileData["tableCustomization"]>;
  headerCustomization: LiveStore<LiveMeterProfileData["headerCustomization"]>;
  columnOrder: {
    dpsPlayers: LiveStore<LiveMeterProfileData["columnOrder"]["dpsPlayers"]>;
    dpsSkills: LiveStore<LiveMeterProfileData["columnOrder"]["dpsSkills"]>;
    healPlayers: LiveStore<LiveMeterProfileData["columnOrder"]["healPlayers"]>;
    healSkills: LiveStore<LiveMeterProfileData["columnOrder"]["healSkills"]>;
    tankedPlayers: LiveStore<
      LiveMeterProfileData["columnOrder"]["tankedPlayers"]
    >;
    tankedSkills: LiveStore<
      LiveMeterProfileData["columnOrder"]["tankedSkills"]
    >;
    deathReplay: LiveStore<LiveMeterProfileData["columnOrder"]["deathReplay"]>;
  };
  sorting: {
    dpsPlayers: LiveStore<LiveMeterProfileData["sorting"]["dpsPlayers"]>;
    dpsSkills: LiveStore<LiveMeterProfileData["sorting"]["dpsSkills"]>;
    healPlayers: LiveStore<LiveMeterProfileData["sorting"]["healPlayers"]>;
    healSkills: LiveStore<LiveMeterProfileData["sorting"]["healSkills"]>;
    tankedPlayers: LiveStore<LiveMeterProfileData["sorting"]["tankedPlayers"]>;
    tankedSkills: LiveStore<LiveMeterProfileData["sorting"]["tankedSkills"]>;
  };
  challengeWatch: LiveStore<LiveMeterProfileData["challengeWatch"]>;
  appearance: LiveStore<LiveMeterProfileData["appearance"]>;
};

// Compile-time exhaustiveness guard: if a field is added to
// `LiveMeterProfileData` without a matching entry in `LiveStoreMap` (and
// thus in `liveStores()`/`extractLiveProfileData()`/`applyProfileData()`
// below), this stops compiling instead of silently behaving as a global,
// non-exported setting. Mirrors `MONSTER_PROFILE_FIELD_KEYS` in
// `settings-store.ts`.
type MissingLiveMirrorFieldKeys = Exclude<
  keyof LiveMeterProfileData,
  keyof LiveStoreMap
>;
const _liveMirrorFieldKeysExhaustive: Record<
  MissingLiveMirrorFieldKeys,
  never
> = {};
void _liveMirrorFieldKeysExhaustive;

function liveStores(): LiveStoreMap {
  const live = SETTINGS.live;
  return {
    general: live.general,
    history: {
      general: SETTINGS.history.general,
      dpsPlayers: SETTINGS.history.dps.players,
      dpsSkillBreakdown: SETTINGS.history.dps.skillBreakdown,
      healPlayers: SETTINGS.history.heal.players,
      healSkillBreakdown: SETTINGS.history.heal.skillBreakdown,
      tankedPlayers: SETTINGS.history.tanked.players,
      tankedSkillBreakdown: SETTINGS.history.tanked.skillBreakdown,
    },
    columnLabels: live.columnLabels,
    dpsPlayers: live.dps.players,
    dpsSkillBreakdown: live.dps.skillBreakdown,
    healPlayers: live.heal.players,
    healSkillBreakdown: live.heal.skillBreakdown,
    tankedPlayers: live.tanked.players,
    tankedSkillBreakdown: live.tanked.skills,
    deathReplay: live.deathReplay,
    tableCustomization: live.tableCustomization,
    headerCustomization: live.headerCustomization,
    columnOrder: live.columnOrder,
    sorting: live.sorting,
    challengeWatch: SETTINGS.challengeWatch,
    appearance: live.appearance,
  };
}

export function listLiveProfiles(): LiveMeterProfile[] {
  return SETTINGS.monitoring.state.liveMeter.profiles;
}

export function activeLiveProfileId(): string {
  return SETTINGS.monitoring.state.liveMeter.mirroredProfileId;
}

export function findLiveProfile(id: string): LiveMeterProfile | undefined {
  return SETTINGS.monitoring.state.liveMeter.profiles.find(
    (profile) => profile.id === id,
  );
}

/**
 * Returns the profile's current data, live-merging in the mirror stores
 * when it's the currently-active profile (whose latest edits only live in
 * the mirror until the next switch flushes them back into `profiles`).
 */
export function getLiveProfileSnapshot(
  id: string,
): LiveMeterProfile | undefined {
  const state = SETTINGS.monitoring.state.liveMeter;
  const record = findLiveProfile(id);
  if (!record) return undefined;
  if (state.mirroredProfileId === id) {
    return { ...record, ...extractLiveProfileData() };
  }
  return deepCloneSettings(record);
}

/** Reads the current mirror stores into a fresh profile-data snapshot. */
export function extractLiveProfileData(): LiveMeterProfileData {
  const stores = liveStores();
  return deepCloneSettings({
    general: { ...stores.general.state },
    history: {
      general: { ...stores.history.general.state },
      dpsPlayers: { ...stores.history.dpsPlayers.state },
      dpsSkillBreakdown: { ...stores.history.dpsSkillBreakdown.state },
      healPlayers: { ...stores.history.healPlayers.state },
      healSkillBreakdown: { ...stores.history.healSkillBreakdown.state },
      tankedPlayers: { ...stores.history.tankedPlayers.state },
      tankedSkillBreakdown: { ...stores.history.tankedSkillBreakdown.state },
    },
    columnLabels: normalizeDpsColumnLabels(stores.columnLabels.state),
    dpsPlayers: { ...stores.dpsPlayers.state },
    dpsSkillBreakdown: { ...stores.dpsSkillBreakdown.state },
    healPlayers: { ...stores.healPlayers.state },
    healSkillBreakdown: { ...stores.healSkillBreakdown.state },
    tankedPlayers: { ...stores.tankedPlayers.state },
    tankedSkillBreakdown: { ...stores.tankedSkillBreakdown.state },
    deathReplay: { ...stores.deathReplay.state },
    tableCustomization: { ...stores.tableCustomization.state },
    headerCustomization: { ...stores.headerCustomization.state },
    columnOrder: {
      dpsPlayers: { order: [...stores.columnOrder.dpsPlayers.state.order] },
      dpsSkills: { order: [...stores.columnOrder.dpsSkills.state.order] },
      healPlayers: { order: [...stores.columnOrder.healPlayers.state.order] },
      healSkills: { order: [...stores.columnOrder.healSkills.state.order] },
      tankedPlayers: {
        order: [...stores.columnOrder.tankedPlayers.state.order],
      },
      tankedSkills: { order: [...stores.columnOrder.tankedSkills.state.order] },
      deathReplay: { order: [...stores.columnOrder.deathReplay.state.order] },
    },
    sorting: {
      dpsPlayers: { ...stores.sorting.dpsPlayers.state },
      dpsSkills: { ...stores.sorting.dpsSkills.state },
      healPlayers: { ...stores.sorting.healPlayers.state },
      healSkills: { ...stores.sorting.healSkills.state },
      tankedPlayers: { ...stores.sorting.tankedPlayers.state },
      tankedSkills: { ...stores.sorting.tankedSkills.state },
    },
    challengeWatch: { ...stores.challengeWatch.state },
    appearance: { ...stores.appearance.state },
  });
}

function applyProfileData(data: LiveMeterProfileData): void {
  // Deep-clone so the mirror stores never alias the profile slot's nested
  // arrays/objects — otherwise in-place edits would silently leak into the
  // stored profile without going through flushMirrorToProfile. Mutate each
  // store's state in place (Object.assign) so RuneStore reactivity tracks
  // the change the same way individual field edits do.
  const cloned = deepCloneSettings(data);
  const stores = liveStores();
  Object.assign(stores.general.state, cloned.general);
  Object.assign(stores.history.general.state, cloned.history.general);
  Object.assign(stores.history.dpsPlayers.state, cloned.history.dpsPlayers);
  Object.assign(
    stores.history.dpsSkillBreakdown.state,
    cloned.history.dpsSkillBreakdown,
  );
  Object.assign(stores.history.healPlayers.state, cloned.history.healPlayers);
  Object.assign(
    stores.history.healSkillBreakdown.state,
    cloned.history.healSkillBreakdown,
  );
  Object.assign(
    stores.history.tankedPlayers.state,
    cloned.history.tankedPlayers,
  );
  Object.assign(
    stores.history.tankedSkillBreakdown.state,
    cloned.history.tankedSkillBreakdown,
  );
  Object.assign(
    stores.columnLabels.state,
    normalizeDpsColumnLabels(cloned.columnLabels),
  );
  Object.assign(stores.dpsPlayers.state, cloned.dpsPlayers);
  Object.assign(stores.dpsSkillBreakdown.state, cloned.dpsSkillBreakdown);
  Object.assign(stores.healPlayers.state, cloned.healPlayers);
  Object.assign(stores.healSkillBreakdown.state, cloned.healSkillBreakdown);
  Object.assign(stores.tankedPlayers.state, cloned.tankedPlayers);
  Object.assign(stores.tankedSkillBreakdown.state, cloned.tankedSkillBreakdown);
  Object.assign(stores.deathReplay.state, cloned.deathReplay);
  Object.assign(stores.tableCustomization.state, cloned.tableCustomization);
  Object.assign(
    stores.headerCustomization.state,
    mergeLiveHeaderCustomization(cloned.headerCustomization),
  );
  stores.columnOrder.dpsPlayers.state.order =
    cloned.columnOrder.dpsPlayers.order;
  stores.columnOrder.dpsSkills.state.order = normalizeDpsSkillColumnOrder(
    cloned.columnOrder.dpsSkills.order,
  );
  stores.columnOrder.healPlayers.state.order =
    cloned.columnOrder.healPlayers.order;
  stores.columnOrder.healSkills.state.order = normalizeHealSkillColumnOrder(
    cloned.columnOrder.healSkills.order,
  );
  stores.columnOrder.tankedPlayers.state.order =
    cloned.columnOrder.tankedPlayers.order;
  stores.columnOrder.tankedSkills.state.order = normalizeTankedSkillColumnOrder(
    cloned.columnOrder.tankedSkills.order,
  );
  stores.columnOrder.deathReplay.state.order = normalizeDeathReplayColumnOrder(
    cloned.columnOrder.deathReplay?.order,
  );
  Object.assign(stores.sorting.dpsPlayers.state, cloned.sorting.dpsPlayers);
  Object.assign(stores.sorting.dpsSkills.state, cloned.sorting.dpsSkills);
  Object.assign(stores.sorting.healPlayers.state, cloned.sorting.healPlayers);
  Object.assign(stores.sorting.healSkills.state, cloned.sorting.healSkills);
  Object.assign(
    stores.sorting.tankedPlayers.state,
    cloned.sorting.tankedPlayers,
  );
  Object.assign(stores.sorting.tankedSkills.state, cloned.sorting.tankedSkills);
  Object.assign(stores.challengeWatch.state, cloned.challengeWatch);
  Object.assign(stores.appearance.state, cloned.appearance);
}

/** Flushes mirror data into its profile slot (if it still exists). */
function flushMirrorToProfile(
  data: LiveMeterProfileData = extractLiveProfileData(),
): void {
  const state = SETTINGS.monitoring.state.liveMeter;
  const currentId = state.mirroredProfileId;
  const index = state.profiles.findIndex((profile) => profile.id === currentId);
  if (index === -1) return;
  state.profiles = state.profiles.map((profile, i) =>
    i === index ? { ...profile, ...data } : profile,
  );
}

export function persistLiveProfileData(data: LiveMeterProfileData): void {
  flushMirrorToProfile(deepCloneSettings(data));
}

let stopPersistenceRoot: (() => void) | null = null;

export function stopLiveProfilePersistence(): void {
  stopPersistenceRoot?.();
  stopPersistenceRoot = null;
}

/**
 * Keeps the materialized live RuneStores persisted in the mirrored profile.
 * This must only be started by the main window after initialization finishes;
 * other windows sync their RuneStores through the Tauri backend instead of
 * writing the monitoring store directly.
 */
export function startLiveProfilePersistence(): () => void {
  if (!stopPersistenceRoot) {
    let isFirstRun = true;
    stopPersistenceRoot = $effect.root(() => {
      $effect(() => {
        const data = extractLiveProfileData();
        if (isFirstRun) {
          isFirstRun = false;
          return;
        }
        untrack(() => persistLiveProfileData(data));
      });
    });
  }
  return stopLiveProfilePersistence;
}

/**
 * Switches which profile is materialized into the mirror stores. Flushes
 * any pending edits into the outgoing profile first, then copies the
 * target profile's data (falling back to the first profile if the id
 * doesn't resolve, e.g. after external deletion).
 */
export function switchLiveProfile(nextId: string): void {
  const state = SETTINGS.monitoring.state.liveMeter;
  if (state.profiles.length === 0) {
    const fallback: LiveMeterProfile = {
      ...createDefaultLiveMeterProfileData(),
      id: generateProfileId("live"),
      name: "",
    };
    state.profiles = [fallback];
  }

  const target =
    state.profiles.find((profile) => profile.id === nextId) ??
    state.profiles[0]!;

  // Already materialized: nothing to do. Re-applying the slot's data here
  // would silently discard live mirror edits that haven't been flushed yet.
  if (state.mirroredProfileId === target.id) return;

  flushMirrorToProfile();
  applyProfileData(target);
  state.mirroredProfileId = target.id;
}

/**
 * Force-applies the active loadout's live-meter profile into the mirror
 * stores without flushing first. Used at startup / after migration, when
 * the live RuneStores may hold stale data that doesn't belong to any
 * profile and must not be flushed back into a slot.
 */
export function applyActiveLiveProfileToMirror(): void {
  const state = SETTINGS.monitoring.state.liveMeter;
  if (state.profiles.length === 0) {
    const fallback: LiveMeterProfile = {
      ...createDefaultLiveMeterProfileData(),
      id: generateProfileId("live"),
      name: "",
    };
    state.profiles = [fallback];
    state.mirroredProfileId = fallback.id;
    applyProfileData(fallback);
    return;
  }
  // Resolve via the active loadout so the mirror matches what the sidebar
  // shows as current (the loadout's liveProfileId), falling back to the
  // stored mirroredProfileId, then the first profile. Read directly from
  // the loadouts store to avoid a circular import with loadouts.svelte.ts.
  const loadoutsState = SETTINGS.loadouts.state;
  const activeLoadout = loadoutsState.items.find(
    (item) => item.id === loadoutsState.activeId,
  );
  const target =
    state.profiles.find((p) => p.id === activeLoadout?.liveProfileId) ??
    state.profiles.find((p) => p.id === state.mirroredProfileId) ??
    state.profiles[0]!;
  applyProfileData(target);
  state.mirroredProfileId = target.id;
}

/**
 * Creates a new live-meter profile. When `sourceData` is provided the new
 * profile starts as a copy of it (used for duplication); otherwise it
 * starts from the built-in defaults.
 */
export function createLiveProfile(
  name: string,
  sourceData?: LiveMeterProfileData,
): string {
  const state = SETTINGS.monitoring.state.liveMeter;
  const base = sourceData
    ? deepCloneSettings(sourceData)
    : createDefaultLiveMeterProfileData();
  const profile: LiveMeterProfile = {
    ...base,
    id: generateProfileId("live"),
    name,
  };
  state.profiles = [...state.profiles, profile];
  return profile.id;
}

export function renameLiveProfile(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const state = SETTINGS.monitoring.state.liveMeter;
  state.profiles = state.profiles.map((profile) =>
    profile.id === id ? { ...profile, name: trimmed } : profile,
  );
}

/**
 * Removes a profile (keeping at least one around). Returns the id that
 * callers should re-point any references to (the mirror's new active
 * profile), or `null` if nothing was removed.
 */
export function removeLiveProfileById(id: string): string | null {
  const state = SETTINGS.monitoring.state.liveMeter;
  if (state.profiles.length <= 1) return null;

  const wasMirrored = state.mirroredProfileId === id;
  if (wasMirrored) {
    const remaining = state.profiles.filter((profile) => profile.id !== id);
    state.profiles = remaining;
    const fallback = remaining[0]!;
    applyProfileData(fallback);
    state.mirroredProfileId = fallback.id;
    return fallback.id;
  }

  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  return state.mirroredProfileId;
}

/** Extracts the profile-shaped data currently materialized in the mirror. */
export function currentMirroredLiveProfileData(): LiveMeterProfileData {
  return extractLiveProfileData();
}
