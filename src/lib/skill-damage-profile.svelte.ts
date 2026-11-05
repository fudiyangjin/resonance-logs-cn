/**
 * @file Skill damage HUD profiles and their font library.
 *
 * Profiles are resolved on read from the active loadout's
 * `damageProfileId` (no mirror, like skill-monitor profiles), so switching
 * loadouts needs no explicit action. Editors mutate the returned profile
 * proxy directly.
 */
import { SETTINGS } from "./settings-store";
import { activeLoadout } from "./loadouts.svelte.js";
import {
  createDefaultSkillDamageProfileData,
  createSkillDamageProfile,
  mergeSkillDamageFonts,
  referencedSkillDamageFontIds,
  skillDamageFontId,
  type SkillDamageFont,
  type SkillDamageProfile,
  type SkillDamageProfileData,
} from "./skill-damage-settings";

function profiles(): SkillDamageProfile[] {
  return SETTINGS.monitoring.state.skillDamage.profiles;
}

const _activeProfile = $derived.by<SkillDamageProfile | null>(() => {
  const items = profiles();
  const targetId = activeLoadout()?.damageProfileId;
  return items.find((profile) => profile.id === targetId) ?? items[0] ?? null;
});

export function activeSkillDamageProfile(): SkillDamageProfile | null {
  return _activeProfile;
}

export function findSkillDamageProfile(
  id: string,
): SkillDamageProfile | undefined {
  return profiles().find((profile) => profile.id === id);
}

/** Appends a profile (a deep copy of `source` when given) and returns its id. */
export function createSkillDamageProfileSlot(
  name: string,
  source?: SkillDamageProfileData,
): string {
  const profile = createSkillDamageProfile(name, source);
  const state = SETTINGS.monitoring.state.skillDamage;
  state.profiles = [...state.profiles, profile];
  return profile.id;
}

export function renameSkillDamageProfile(id: string, name: string): void {
  const profile = findSkillDamageProfile(id);
  if (profile) profile.name = name;
}

/** Removes a profile unless it is the last one; returns the fallback id. */
export function removeSkillDamageProfileById(id: string): string | null {
  const state = SETTINGS.monitoring.state.skillDamage;
  if (state.profiles.length <= 1) return null;
  const remaining = state.profiles.filter((profile) => profile.id !== id);
  if (remaining.length === state.profiles.length) return null;
  state.profiles = remaining;
  pruneUnusedSkillDamageFonts();
  return remaining[0]!.id;
}

/** Deep copy without the id, for duplication and export. */
export function getSkillDamageProfileSnapshot(
  id: string,
): SkillDamageProfileData {
  const profile = findSkillDamageProfile(id);
  if (!profile) return createDefaultSkillDamageProfileData();
  const { id: _id, ...data } = JSON.parse(
    JSON.stringify(profile),
  ) as SkillDamageProfile;
  void _id;
  return data;
}

export function skillDamageFonts(): SkillDamageFont[] {
  return SETTINGS.skillDamageFonts.state.fonts;
}

export function findSkillDamageFont(
  id: string | null,
): SkillDamageFont | undefined {
  return id ? skillDamageFonts().find((font) => font.id === id) : undefined;
}

/** Adds fonts not stored yet (same content means same id). */
export function addSkillDamageFonts(fonts: readonly SkillDamageFont[]): void {
  const state = SETTINGS.skillDamageFonts.state;
  const merged = mergeSkillDamageFonts(state.fonts, fonts);
  if (merged.length !== state.fonts.length) state.fonts = merged;
}

/** Stores an uploaded font once and returns its id. */
export function addSkillDamageFont(name: string, dataUrl: string): string {
  const id = skillDamageFontId(dataUrl);
  addSkillDamageFonts([{ id, name, dataUrl }]);
  return id;
}

/** Drops fonts no profile references any more. */
export function pruneUnusedSkillDamageFonts(): void {
  const state = SETTINGS.skillDamageFonts.state;
  const used = referencedSkillDamageFontIds(profiles());
  if (state.fonts.every((font) => used.has(font.id))) return;
  state.fonts = state.fonts.filter((font) => used.has(font.id));
}

/** Fonts referenced by one profile, for loadout export. */
export function skillDamageFontsFor(
  profile: SkillDamageProfileData,
): SkillDamageFont[] {
  const ids = new Set(
    profile.groups.flatMap((group) => (group.fontId ? [group.fontId] : [])),
  );
  return skillDamageFonts()
    .filter((font) => ids.has(font.id))
    .map((font) => ({ ...font }));
}
