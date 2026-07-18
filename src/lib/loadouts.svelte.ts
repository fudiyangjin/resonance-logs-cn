/**
 * @file Accessors for the top-level "loadout" concept: a named combination
 * of a skill-monitor profile + a monster-monitor profile. Switching the
 * active loadout swaps the entire live monitoring setup (skills/buffs,
 * monster monitor, and their voice bindings) in one action.
 *
 * Monster-monitor profiles are "mirrored" into `SETTINGS.monsterMonitor`'s
 * top-level fields (see `monster-monitor-profile.svelte.ts`), so switching
 * the active monster profile is an explicit, imperative copy. Skill-monitor
 * profiles are resolved on read (see `skill-monitor-profile.svelte.ts`), so
 * no explicit action is needed for them here.
 */
import {
  SETTINGS,
  createDefaultSkillMonitorProfile,
  deepCloneSettings,
  generateProfileId,
  omitProfileId,
  type Loadout,
  type SkillMonitorProfile,
} from "./settings-store";
import {
  createMonsterProfile,
  getMonsterProfileSnapshot,
  removeMonsterProfileById,
  switchMonsterProfile,
} from "./monster-monitor-profile.svelte.js";
import {
  createLiveProfile,
  getLiveProfileSnapshot,
  removeLiveProfileById,
  switchLiveProfile,
} from "./live-meter-profile.svelte.js";
import type { LoadoutPreset } from "./config/loadout-presets";
import type { LoadoutExport } from "./loadout-import";
import { profilesToCollectAfterLoadoutRemoval } from "./loadout-lifecycle";
import { isReplaceableStarterLoadout } from "./starter-loadout";
import { t } from "$lib/i18n/index.svelte";

const _activeLoadout = $derived.by<Loadout | null>(() => {
  const items = SETTINGS.loadouts.state.items;
  if (items.length === 0) return null;
  return (
    items.find((item) => item.id === SETTINGS.loadouts.state.activeId) ??
    items[0] ??
    null
  );
});

export function activeLoadout(): Loadout | null {
  return _activeLoadout;
}

export function listLoadouts(): Loadout[] {
  return SETTINGS.loadouts.state.items;
}

export function findLoadout(id: string): Loadout | undefined {
  return SETTINGS.loadouts.state.items.find((item) => item.id === id);
}

/** Switches the active loadout, materializing its monster + live profiles into the mirror. */
export function switchLoadout(id: string): void {
  const target = findLoadout(id);
  if (!target) return;
  SETTINGS.loadouts.state.activeId = target.id;
  switchMonsterProfile(target.monsterProfileId);
  switchLiveProfile(target.liveProfileId);
}

function ensureUniqueLoadoutName(baseName: string): string {
  const existingNames = new Set(
    SETTINGS.loadouts.state.items.map((item) => item.name),
  );
  if (!existingNames.has(baseName)) return baseName;
  let index = 2;
  while (existingNames.has(`${baseName} (${index})`)) index += 1;
  return `${baseName} (${index})`;
}

/**
 * Creates a new loadout. If no skill/monster profile ids are supplied, a
 * brand-new profile of each kind is created for it (so the new loadout
 * starts fully independent rather than sharing another loadout's setup).
 */
export function createLoadout(options?: {
  name?: string;
  skillProfileId?: string;
  monsterProfileId?: string;
  liveProfileId?: string;
  activate?: boolean;
}): string {
  const skillState = SETTINGS.skillMonitor.state;
  const skillProfileId =
    options?.skillProfileId ??
    (() => {
      const profile = createDefaultSkillMonitorProfile();
      skillState.profiles = [...skillState.profiles, profile];
      return profile.id;
    })();
  const monsterProfileId =
    options?.monsterProfileId ?? createMonsterProfile("");
  const liveProfileId = options?.liveProfileId ?? createLiveProfile("");

  const id = generateProfileId("loadout");
  const name = ensureUniqueLoadoutName(
    options?.name?.trim() || t("loadout.defaults.new"),
  );
  const loadout: Loadout = {
    id,
    name,
    skillProfileId,
    monsterProfileId,
    liveProfileId,
    starterPlaceholder: false,
  };
  SETTINGS.loadouts.state.items = [...SETTINGS.loadouts.state.items, loadout];

  if (options?.activate ?? true) {
    switchLoadout(id);
  }
  return id;
}

export function renameLoadout(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  SETTINGS.loadouts.state.items = SETTINGS.loadouts.state.items.map((item) =>
    item.id === id
      ? { ...item, name: trimmed, starterPlaceholder: false }
      : item,
  );
}

/** Duplicates a loadout along with its own copies of the referenced profiles. */
export function duplicateLoadout(id: string): string | null {
  const source = findLoadout(id);
  if (!source) return null;

  const skillState = SETTINGS.skillMonitor.state;
  const sourceSkillProfile = skillState.profiles.find(
    (profile) => profile.id === source.skillProfileId,
  );
  const newSkillProfile: SkillMonitorProfile = sourceSkillProfile
    ? // Deep-clone so the copy owns its nested arrays/objects instead of
      // aliasing the source profile's.
      {
        ...deepCloneSettings(sourceSkillProfile),
        id: generateProfileId("skill"),
      }
    : createDefaultSkillMonitorProfile();
  skillState.profiles = [...skillState.profiles, newSkillProfile];

  const newMonsterProfileId = duplicateMonsterProfileFor(
    source.monsterProfileId,
  );
  const newLiveProfileId = duplicateLiveProfileFor(source.liveProfileId);

  return createLoadout({
    name: t("loadout.defaults.copyName", { name: source.name }),
    skillProfileId: newSkillProfile.id,
    monsterProfileId: newMonsterProfileId,
    liveProfileId: newLiveProfileId,
    activate: false,
  });
}

function duplicateMonsterProfileFor(sourceProfileId: string): string {
  return createMonsterProfile("", getMonsterProfileSnapshot(sourceProfileId));
}

function duplicateLiveProfileFor(sourceProfileId: string): string {
  return createLiveProfile("", getLiveProfileSnapshot(sourceProfileId));
}

/** Removes a loadout. Always keeps at least one loadout around. */
export function removeLoadout(id: string): void {
  const state = SETTINGS.loadouts.state;
  if (state.items.length <= 1) return;
  const removed = state.items.find((item) => item.id === id);
  if (!removed) return;
  const wasActive = state.activeId === id;
  state.items = state.items.filter((item) => item.id !== id);
  if (wasActive && state.items[0]) {
    switchLoadout(state.items[0].id);
  }

  const profilesToCollect = profilesToCollectAfterLoadoutRemoval(
    removed,
    state.items,
  );
  if (
    profilesToCollect.skillProfileId &&
    SETTINGS.skillMonitor.state.profiles.length > 1
  ) {
    SETTINGS.skillMonitor.state.profiles =
      SETTINGS.skillMonitor.state.profiles.filter(
        (profile) => profile.id !== profilesToCollect.skillProfileId,
      );
  }

  if (profilesToCollect.monsterProfileId) {
    removeMonsterProfileById(profilesToCollect.monsterProfileId);
  }

  if (profilesToCollect.liveProfileId) {
    removeLiveProfileById(profilesToCollect.liveProfileId);
  }
}

export function setLoadoutSkillProfile(
  loadoutId: string,
  skillProfileId: string,
): void {
  SETTINGS.loadouts.state.items = SETTINGS.loadouts.state.items.map((item) =>
    item.id === loadoutId
      ? { ...item, skillProfileId, starterPlaceholder: false }
      : item,
  );
}

export function setLoadoutMonsterProfile(
  loadoutId: string,
  monsterProfileId: string,
): void {
  const state = SETTINGS.loadouts.state;
  state.items = state.items.map((item) =>
    item.id === loadoutId
      ? { ...item, monsterProfileId, starterPlaceholder: false }
      : item,
  );
  if (state.activeId === loadoutId) {
    switchMonsterProfile(monsterProfileId);
  }
}

export function setLoadoutLiveProfile(
  loadoutId: string,
  liveProfileId: string,
): void {
  const state = SETTINGS.loadouts.state;
  state.items = state.items.map((item) =>
    item.id === loadoutId
      ? { ...item, liveProfileId, starterPlaceholder: false }
      : item,
  );
  if (state.activeId === loadoutId) {
    switchLiveProfile(liveProfileId);
  }
}

/** Removes a monster profile, re-pointing any loadouts that referenced it. */
export function removeMonsterProfileEverywhere(monsterProfileId: string): void {
  const fallbackId = removeMonsterProfileById(monsterProfileId);
  if (!fallbackId) return;
  const state = SETTINGS.loadouts.state;
  state.items = state.items.map((item) =>
    item.monsterProfileId === monsterProfileId
      ? {
          ...item,
          monsterProfileId: fallbackId,
          starterPlaceholder: false,
        }
      : item,
  );
  if (
    findLoadout(state.activeId)?.monsterProfileId === fallbackId &&
    SETTINGS.monsterMonitor.state.mirroredProfileId !== fallbackId
  ) {
    switchMonsterProfile(fallbackId);
  }
}

/** Removes a skill profile, re-pointing any loadouts that referenced it. */
export function removeSkillProfileEverywhere(skillProfileId: string): void {
  const skillState = SETTINGS.skillMonitor.state;
  if (skillState.profiles.length <= 1) return;
  const remaining = skillState.profiles.filter(
    (profile) => profile.id !== skillProfileId,
  );
  skillState.profiles = remaining;
  const fallbackId = remaining[0]!.id;

  SETTINGS.loadouts.state.items = SETTINGS.loadouts.state.items.map((item) =>
    item.skillProfileId === skillProfileId
      ? { ...item, skillProfileId: fallbackId, starterPlaceholder: false }
      : item,
  );
}

/** Removes a live-meter profile, re-pointing any loadouts that referenced it. */
export function removeLiveProfileEverywhere(liveProfileId: string): void {
  const fallbackId = removeLiveProfileById(liveProfileId);
  if (!fallbackId) return;
  const state = SETTINGS.loadouts.state;
  state.items = state.items.map((item) =>
    item.liveProfileId === liveProfileId
      ? { ...item, liveProfileId: fallbackId, starterPlaceholder: false }
      : item,
  );
  if (
    findLoadout(state.activeId)?.liveProfileId === fallbackId &&
    SETTINGS.monitoring.state.liveMeter.mirroredProfileId !== fallbackId
  ) {
    switchLiveProfile(fallbackId);
  }
}

/** Creates a brand-new loadout (with its own fresh profiles) from a built-in preset. */
export function createLoadoutFromPreset(preset: LoadoutPreset): string {
  // On a fresh install there is exactly one untouched auto-created loadout;
  // replace it with the preset instead of leaving a confusing empty entry.
  const items = SETTINGS.loadouts.state.items;
  const onlyLoadout = items.length === 1 ? items[0] : undefined;
  const replaceableDefaultId =
    onlyLoadout && isStarterPlaceholderUntouched(onlyLoadout)
      ? onlyLoadout.id
      : null;

  const skillState = SETTINGS.skillMonitor.state;
  const skillProfile: SkillMonitorProfile = {
    // Deep-clone: preset objects are shared across repeated applications.
    ...deepCloneSettings(preset.skillProfile),
    id: generateProfileId("skill"),
  };
  skillState.profiles = [...skillState.profiles, skillProfile];

  const monsterProfileId = createMonsterProfile(
    preset.monsterProfile.name,
    preset.monsterProfile,
  );

  const newId = createLoadout({
    name: preset.className,
    skillProfileId: skillProfile.id,
    monsterProfileId,
  });

  if (replaceableDefaultId) {
    removeLoadout(replaceableDefaultId);
  }
  return newId;
}

/**
 * A loadout counts as "untouched" when its skill profile still has no
 * monitored skills/buffs/groups — i.e. the user never configured it.
 */
function isStarterPlaceholderUntouched(loadout: Loadout): boolean {
  const skillProfile = SETTINGS.skillMonitor.state.profiles.find(
    (profile) => profile.id === loadout.skillProfileId,
  );
  const monsterProfile = getMonsterProfileSnapshot(loadout.monsterProfileId);
  return isReplaceableStarterLoadout(loadout, skillProfile, monsterProfile);
}

/**
 * Heuristic for "this is a brand-new install that hasn't configured
 * anything yet": exactly one (auto-created) loadout whose skill profile is
 * still untouched. Used to offer the starter-preset picker once.
 */
export function shouldShowFirstRunPrompt(): boolean {
  const state = SETTINGS.loadouts.state;
  if (state.firstRunPromptDismissed) return false;
  if (state.items.length !== 1) return false;
  const only = state.items[0];
  if (!only) return false;
  return isStarterPlaceholderUntouched(only);
}

export function dismissFirstRunPrompt(): void {
  SETTINGS.loadouts.state.firstRunPromptDismissed = true;
}

export function exportLoadout(id: string): LoadoutExport | null {
  const loadout = findLoadout(id);
  if (!loadout) return null;
  const skillProfile = SETTINGS.skillMonitor.state.profiles.find(
    (profile) => profile.id === loadout.skillProfileId,
  );
  const monsterProfile = getMonsterProfileSnapshot(loadout.monsterProfileId);
  const liveProfile = getLiveProfileSnapshot(loadout.liveProfileId);
  if (!skillProfile || !monsterProfile || !liveProfile) return null;

  return {
    kind: "resonance-logs-loadout",
    version: 1,
    name: loadout.name,
    skillProfile: omitProfileId(skillProfile),
    monsterProfile: omitProfileId(monsterProfile),
    liveProfile: omitProfileId(liveProfile),
  };
}

/** Imports a previously-exported loadout, generating fresh ids for its profiles. */
export function importLoadout(data: LoadoutExport): string {
  const skillState = SETTINGS.skillMonitor.state;
  const skillProfile: SkillMonitorProfile = {
    // Deep-clone so the imported profile owns its nested data.
    ...deepCloneSettings(data.skillProfile),
    id: generateProfileId("skill"),
  };
  skillState.profiles = [...skillState.profiles, skillProfile];

  const monsterProfileId = createMonsterProfile(
    data.monsterProfile.name,
    data.monsterProfile,
  );

  const liveProfileId = createLiveProfile(
    data.liveProfile?.name ?? "",
    data.liveProfile,
  );

  return createLoadout({
    name: data.name,
    skillProfileId: skillProfile.id,
    monsterProfileId,
    liveProfileId,
    activate: false,
  });
}
