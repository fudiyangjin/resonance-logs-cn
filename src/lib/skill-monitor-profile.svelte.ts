import {
  SETTINGS,
  createDefaultSkillMonitorProfile,
  type SkillMonitorProfile,
} from "$lib/settings-store";

const _clampedProfileIndex = $derived.by(() => {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  if (profiles.length === 0) return 0;
  return Math.min(
    Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
    profiles.length - 1,
  );
});

const _activeProfile = $derived.by(() => {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  return profiles[_clampedProfileIndex] ?? null;
});

export function clampedProfileIndex(): number {
  return _clampedProfileIndex;
}

export function activeProfile(): SkillMonitorProfile | null {
  return _activeProfile;
}

export function activeProfileOrDefault(): SkillMonitorProfile {
  return _activeProfile ?? createDefaultSkillMonitorProfile();
}

export function updateActiveProfile(
  updater: (profile: SkillMonitorProfile) => SkillMonitorProfile,
  options?: { createDefaultIfEmpty?: boolean },
): void {
  const state = SETTINGS.skillMonitor.state;
  const profiles = state.profiles;
  if (profiles.length === 0) {
    if (options?.createDefaultIfEmpty) {
      state.profiles = [createDefaultSkillMonitorProfile()];
      state.activeProfileIndex = 0;
    }
    return;
  }
  const index = Math.min(
    Math.max(state.activeProfileIndex, 0),
    profiles.length - 1,
  );
  state.profiles = profiles.map((profile, i) =>
    i === index ? updater(profile) : profile,
  );
}
