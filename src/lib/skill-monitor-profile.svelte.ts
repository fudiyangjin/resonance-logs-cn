import {
  SETTINGS,
  createDefaultSkillMonitorProfile,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import { activeLoadout } from "$lib/loadouts.svelte.js";
import { pruneSkillProfileVoice } from "$lib/voice/association";

function resolveActiveIndex(profiles: SkillMonitorProfile[]): number {
  if (profiles.length === 0) return -1;
  const targetId = activeLoadout()?.skillProfileId;
  const index = profiles.findIndex((profile) => profile.id === targetId);
  return index !== -1 ? index : 0;
}

const _activeProfileIndex = $derived.by(() => {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  return Math.max(0, resolveActiveIndex(profiles));
});

const _activeProfile = $derived.by(() => {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  const index = resolveActiveIndex(profiles);
  return index === -1 ? null : (profiles[index] ?? null);
});

/**
 * @deprecated Kept only so existing `{#key}` blocks keyed off the active
 * profile keep re-rendering when it changes. Prefer `activeProfile()?.id`
 * for new code.
 */
export function clampedProfileIndex(): number {
  return _activeProfileIndex;
}

export function activeProfile(): SkillMonitorProfile | null {
  return _activeProfile;
}

export function activeProfileOrDefault(): SkillMonitorProfile {
  return _activeProfile ?? createDefaultSkillMonitorProfile();
}

/**
 * The write path for the active skill profile. Voice bindings whose subject
 * the update dissociated (an unmonitored skill, a removed counter rule) go
 * in the same write — only this profile's, never another loadout's.
 */
export function updateActiveProfile(
  updater: (profile: SkillMonitorProfile) => SkillMonitorProfile,
  options?: { createDefaultIfEmpty?: boolean },
): void {
  const state = SETTINGS.skillMonitor.state;
  const profiles = state.profiles;
  if (profiles.length === 0) {
    if (options?.createDefaultIfEmpty) {
      state.profiles = [createDefaultSkillMonitorProfile()];
    }
    return;
  }
  const index = resolveActiveIndex(profiles);
  const resolvedIndex = index === -1 ? 0 : index;
  state.profiles = profiles.map((profile, i) =>
    i === resolvedIndex ? pruneSkillProfileVoice(updater(profile)) : profile,
  );
}
