/**
 * @file Monster-monitor profile switching.
 *
 * Unlike skill-monitor profiles (which are resolved on read from an array,
 * see `skill-monitor-profile.svelte.ts`), monster-monitor profile data is
 * "mirrored" directly onto `SETTINGS.monsterMonitor.state`'s top-level
 * fields. This lets every existing consumer keep reading/writing
 * `SETTINGS.monsterMonitor.state.<field>` exactly as before; only switching
 * profiles needs to go through this module, which flushes the mirror into
 * its previous slot before copying in the newly active profile.
 */
import {
  SETTINGS,
  createDefaultMonsterMonitorProfile,
  deepCloneSettings,
  ensureTeammatePanelStyle,
  extractMonsterProfileData,
  generateProfileId,
  type MonsterMonitorProfile,
  type MonsterMonitorProfileData,
} from "./settings-store";
import { ensureEntityDurationEntries } from "./entity-duration-entries";
import { normalizeCustomPanelStyle } from "./skill-monitor-normalize";

export function listMonsterProfiles(): MonsterMonitorProfile[] {
  return SETTINGS.monsterMonitor.state.profiles;
}

export function activeMonsterProfileId(): string {
  return SETTINGS.monsterMonitor.state.mirroredProfileId;
}

export function findMonsterProfile(
  id: string,
): MonsterMonitorProfile | undefined {
  return SETTINGS.monsterMonitor.state.profiles.find(
    (profile) => profile.id === id,
  );
}

/**
 * Returns the profile's current data, live-merging in the mirror fields
 * when it's the currently-active profile (whose latest edits only live in
 * the mirror until the next switch flushes them back into `profiles`).
 */
export function getMonsterProfileSnapshot(
  id: string,
): MonsterMonitorProfile | undefined {
  const state = SETTINGS.monsterMonitor.state;
  const record = findMonsterProfile(id);
  if (!record) return undefined;
  if (state.mirroredProfileId === id) {
    // extractMonsterProfileData already returns a deep clone.
    return { ...record, ...extractMonsterProfileData(state) };
  }
  return deepCloneSettings(record);
}

function applyProfileData(data: MonsterMonitorProfileData): void {
  // Deep-clone so the mirror never aliases the profile slot's nested
  // arrays/objects — otherwise in-place edits would silently leak into the
  // stored profile without going through flushMirrorToProfile.
  Object.assign(SETTINGS.monsterMonitor.state, deepCloneSettings(data));
}

/** Flushes the current mirror fields into their profile slot (if it still exists). */
function flushMirrorToProfile(): void {
  const state = SETTINGS.monsterMonitor.state;
  const currentId = state.mirroredProfileId;
  const index = state.profiles.findIndex((profile) => profile.id === currentId);
  if (index === -1) return;
  const data = extractMonsterProfileData(state);
  state.profiles = state.profiles.map((profile, i) =>
    i === index ? { ...profile, ...data } : profile,
  );
}

/**
 * Switches which profile is materialized into the mirror fields. Flushes
 * any pending edits into the outgoing profile first, then copies the
 * target profile's data (falling back to the first profile if the id
 * doesn't resolve, e.g. after external deletion).
 */
export function switchMonsterProfile(nextId: string): void {
  const state = SETTINGS.monsterMonitor.state;
  if (state.profiles.length === 0) {
    const fallback = createDefaultMonsterMonitorProfile();
    state.profiles = [fallback];
  }

  const target =
    state.profiles.find((profile) => profile.id === nextId) ??
    state.profiles[0]!;

  // Already materialized: nothing to do. Re-applying the slot's data here
  // would silently discard live mirror edits that haven't been flushed yet
  // (the slot only gets updated on flush). This matters because multiple
  // loadouts can share one monster profile — switching between them must
  // not touch the mirror.
  if (state.mirroredProfileId === target.id) return;

  flushMirrorToProfile();
  applyProfileData(target);
  state.mirroredProfileId = target.id;
}

/**
 * Creates a new monster-monitor profile. When `sourceData` is provided the
 * new profile starts as a copy of it (used for duplication); otherwise it
 * starts from the built-in defaults.
 */
export function createMonsterProfile(
  name: string,
  sourceData?: MonsterMonitorProfileData,
): string {
  const state = SETTINGS.monsterMonitor.state;
  const base = sourceData
    ? // Deep-clone: the source may be a store record or a shared preset
      // object; the new profile must own its nested data.
      deepCloneSettings(sourceData)
    : (() => {
        const {
          id,
          name: _name,
          ...rest
        } = createDefaultMonsterMonitorProfile();
        void id;
        void _name;
        return rest;
      })();
  const profile: MonsterMonitorProfile = {
    ...base,
    id: generateProfileId("monster"),
    name,
  };
  state.profiles = [...state.profiles, profile];
  return profile.id;
}

export function renameMonsterProfile(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const state = SETTINGS.monsterMonitor.state;
  state.profiles = state.profiles.map((profile) =>
    profile.id === id ? { ...profile, name: trimmed } : profile,
  );
}

/**
 * Removes a profile (keeping at least one around). Returns the id that
 * callers should re-point any references to (the mirror's new active
 * profile), or `null` if nothing was removed.
 */
export function removeMonsterProfileById(id: string): string | null {
  const state = SETTINGS.monsterMonitor.state;
  if (state.profiles.length <= 1) return null;

  const wasMirrored = state.mirroredProfileId === id;
  if (wasMirrored) {
    // Flush is pointless here (we're deleting this slot); just drop it and
    // copy in the fallback profile directly.
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
export function currentMirroredProfileData(): MonsterMonitorProfileData {
  return extractMonsterProfileData(SETTINGS.monsterMonitor.state);
}

/**
 * Backfills the text-style fields (text shadow, background) on every panel
 * style of a monster-monitor profile. Only the currently-mirrored profile
 * gets refreshed from the live overlay editors; other profiles (and
 * profiles restored from an old export) can still be missing fields added
 * after they were created. Pure/idempotent, like `normalizeSkillProfile`.
 */
export function normalizeMonsterProfileStyles<
  T extends MonsterMonitorProfileData,
>(profile: T): T {
  const defaults = createDefaultMonsterMonitorProfile();
  return {
    ...profile,
    hpListEnabled: profile.hpListEnabled ?? defaults.hpListEnabled,
    overlayPositions: {
      ...defaults.overlayPositions,
      ...profile.overlayPositions,
    },
    overlaySizes: { ...defaults.overlaySizes, ...profile.overlaySizes },
    overlayVisibility: {
      ...defaults.overlayVisibility,
      ...profile.overlayVisibility,
    },
    panelStyle: normalizeCustomPanelStyle(profile.panelStyle),
    teammatePanelStyle: ensureTeammatePanelStyle(profile.teammatePanelStyle),
    hatePanelStyle: normalizeCustomPanelStyle(profile.hatePanelStyle),
    fantasyPanelStyle: normalizeCustomPanelStyle(profile.fantasyPanelStyle),
    bossDbmPanelStyle: normalizeCustomPanelStyle(profile.bossDbmPanelStyle),
    stunPanelStyle: normalizeCustomPanelStyle(profile.stunPanelStyle),
    hpPanelStyle: normalizeCustomPanelStyle(
      profile.hpPanelStyle ?? defaults.hpPanelStyle,
    ),
    entityDurationEntries: ensureEntityDurationEntries(
      profile.entityDurationEntries,
    ),
    entityDurationPanelStyle: normalizeCustomPanelStyle(
      profile.entityDurationPanelStyle ?? defaults.entityDurationPanelStyle,
    ),
  };
}
