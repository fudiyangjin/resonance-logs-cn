/**
 * @file Applying a HUD color scheme to the active loadout's skill and
 * monster monitor profiles, and reading their current panel styles. Styles
 * are normalized first so a profile that never saved a panel's style gets a
 * complete one (with the scheme's colors) instead of a colors-only stub.
 */
import {
  SETTINGS,
  ensureTeammateCdPanelStyle,
  ensureTeammatePanelStyle,
  type CustomPanelStyle,
  type MonsterMonitorState,
  type SkillMonitorProfile,
} from "./settings-store";
import {
  ensureBuffCoverageStyle,
  ensureTextBuffPanelStyle,
  normalizeCustomPanelStyle,
  normalizeRosterPanelStyle,
} from "./skill-monitor-normalize";
import {
  applySchemeToMonsterStyles,
  applySchemeToSkillStyles,
  getHudColorScheme,
  type HudColorSchemeId,
  type MonsterSchemeStyles,
  type SkillSchemeStyles,
} from "./hud-color-schemes";
import { activeLoadout } from "./loadouts.svelte.js";
import {
  activeProfile,
  updateActiveProfile,
} from "./skill-monitor-profile.svelte";
import { updateMonsterMonitor } from "./monster-monitor-profile.svelte";

export type HudSchemeTargets = { skill: boolean; monster: boolean };

export function skillSchemeStyles(
  profile: SkillMonitorProfile,
): SkillSchemeStyles {
  const fallback = profile.customPanelStyle;
  return {
    textBuffPanelStyle: ensureTextBuffPanelStyle(profile),
    buffCoverageStyle: ensureBuffCoverageStyle(profile),
    customPanelGroups: (profile.customPanelGroups ?? []).map((group) => ({
      ...group,
      style: normalizeCustomPanelStyle(group.style ?? fallback),
    })),
    customPanelStyle: fallback
      ? normalizeCustomPanelStyle(fallback)
      : undefined,
  };
}

/** The monster panel styles as the settings page and HUD resolve them. */
export function monsterSchemeStyles(
  state: MonsterMonitorState,
): MonsterSchemeStyles {
  const base = state.panelStyle;
  // Same fallbacks as the settings page and the monster overlay.
  const resolve = (style: CustomPanelStyle | undefined) =>
    normalizeCustomPanelStyle(style ?? base);
  return {
    panelStyle: normalizeCustomPanelStyle(base),
    teammatePanelStyle: ensureTeammatePanelStyle(
      state.teammatePanelStyle ?? base,
    ),
    teammateCdPanelStyle: ensureTeammateCdPanelStyle(
      state.teammateCdPanelStyle,
    ),
    hatePanelStyle: resolve(state.hatePanelStyle),
    fantasyPanelStyle: resolve(state.fantasyPanelStyle),
    bossDbmPanelStyle: resolve(state.bossDbmPanelStyle),
    stunPanelStyle: resolve(state.stunPanelStyle),
    hpPanelStyle: resolve(state.hpPanelStyle),
    entityDurationPanelStyle: resolve(state.entityDurationPanelStyle),
    monsterSkillPanelStyle: resolve(state.monsterSkillPanelStyle),
    rosterPanelStyle: normalizeRosterPanelStyle(
      state.rosterPanelStyle ?? state.hpPanelStyle,
    ),
  };
}

/**
 * Applies the scheme to the active profiles in one synchronous batch: both
 * live in the monitoring store, so this is a single persisted write.
 */
export function applyHudSchemeToActive(
  schemeId: HudColorSchemeId,
  targets: HudSchemeTargets,
): void {
  const scheme = getHudColorScheme(schemeId);
  if (targets.skill && activeProfile()) {
    updateActiveProfile((profile) => {
      const applied = applySchemeToSkillStyles(
        skillSchemeStyles(profile),
        scheme,
      );
      const next: SkillMonitorProfile = {
        ...profile,
        textBuffPanelStyle: applied.textBuffPanelStyle,
        buffCoverageStyle: applied.buffCoverageStyle,
        customPanelGroups: applied.customPanelGroups,
      };
      if (applied.customPanelStyle) {
        next.customPanelStyle = applied.customPanelStyle;
      }
      return next;
    });
  }
  if (targets.monster) {
    updateMonsterMonitor((state) =>
      applySchemeToMonsterStyles(monsterSchemeStyles(state), scheme),
    );
  }
}

/**
 * Names of every loadout that shares the active skill and/or monster
 * profile (the active loadout included), for the confirmation dialog.
 */
export function loadoutsSharingActiveHudProfiles(
  targets: HudSchemeTargets,
): string[] {
  const loadout = activeLoadout();
  if (!loadout) return [];
  return SETTINGS.loadouts.state.items
    .filter(
      (item) =>
        (targets.skill && item.skillProfileId === loadout.skillProfileId) ||
        (targets.monster && item.monsterProfileId === loadout.monsterProfileId),
    )
    .map((item) => item.name);
}
