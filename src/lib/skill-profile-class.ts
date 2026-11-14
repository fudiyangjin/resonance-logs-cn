import {
  deepCloneSettings,
  type Loadout,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import { normalizeSkillCdRegions } from "$lib/skill-cd-layout";
import { pruneSkillProfileVoice } from "$lib/voice/association";

export const MONITOR_CLASS_SELECT_ID = "monitor-profile-class";

/** Identity captured when the user starts an edit, never a live binding. */
export type SkillProfileEditContext = {
  loadoutId: string;
  profileId: string;
  classKey: string;
};

export function skillProfileClassImpact(
  profile: SkillMonitorProfile,
  loadouts: readonly Loadout[],
) {
  return {
    skillCount: new Set(profile.monitoredSkillIds).size,
    voiceCount: Object.keys(profile.skillVoiceConfigs ?? {}).length,
    consumers: loadouts.filter((item) => item.skillProfileId === profile.id),
  };
}

export function matchesSkillProfileEdit(
  context: SkillProfileEditContext,
  loadout: Loadout | null | undefined,
  profile: SkillMonitorProfile | null | undefined,
): boolean {
  return (
    loadout?.id === context.loadoutId &&
    profile?.id === context.profileId &&
    profile?.selectedClass === context.classKey
  );
}

export function changeSkillProfileClass(
  profile: SkillMonitorProfile,
  classKey: string,
): SkillMonitorProfile {
  if (profile.selectedClass === classKey) return profile;
  return pruneSkillProfileVoice({
    ...profile,
    selectedClass: classKey,
    monitoredSkillIds: [],
    skillCdRegions: normalizeSkillCdRegions({
      ...profile,
      monitoredSkillIds: [],
    }),
    skillVoiceConfigs: {},
  });
}

export function uniqueSkillProfileCopyName(
  baseName: string,
  profiles: readonly SkillMonitorProfile[],
): string {
  const names = new Set(profiles.map((profile) => profile.name));
  let name = baseName;
  let index = 2;
  while (names.has(name)) name = `${baseName} (${index++})`;
  return name;
}

/** Prepare both collections before publishing either; stale dialogs do nothing. */
export function prepareSkillProfileEdit(
  profiles: readonly SkillMonitorProfile[],
  loadouts: readonly Loadout[],
  activeLoadoutId: string,
  context: SkillProfileEditContext,
  classKey: string,
  copy?: { id: string; name: string },
): { profiles: SkillMonitorProfile[]; loadouts: Loadout[] } | null {
  const loadout = loadouts.find((item) => item.id === activeLoadoutId);
  const profile =
    profiles.find((item) => item.id === loadout?.skillProfileId) ?? profiles[0];
  if (!profile || !matchesSkillProfileEdit(context, loadout, profile))
    return null;
  if (!copy && profile.selectedClass === classKey) return null;
  if (copy) {
    if (profiles.some((item) => item.id === copy.id)) return null;
    const next = changeSkillProfileClass(
      { ...deepCloneSettings(profile), id: copy.id, name: copy.name },
      classKey,
    );
    return {
      profiles: [...profiles, next],
      loadouts: loadouts.map((item) =>
        item.id === context.loadoutId
          ? { ...item, skillProfileId: next.id, starterPlaceholder: false }
          : item,
      ),
    };
  }
  return {
    profiles: profiles.map((item) =>
      item.id === profile.id ? changeSkillProfileClass(item, classKey) : item,
    ),
    loadouts: [...loadouts],
  };
}
