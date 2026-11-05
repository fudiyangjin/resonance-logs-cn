/**
 * @file Uniform read/write access to each HUD domain's enable switch.
 *
 * The domains store their intent in structurally different places: `game`
 * in the active skill-monitor profile, `monster` in the mirrored
 * monster-monitor state, `minimap` in its own config store, `damage` in the
 * active skill damage profile. These accessors hide that difference so the
 * toggle buttons and the visibility resolver can treat them all the same way.
 *
 * Reads stay lazy (plain getters) so Svelte still tracks the underlying
 * `$state` when they are called inside an effect or `$derived`.
 */
import { SETTINGS } from "$lib/settings-store";
import type { HudDomain } from "$lib/hud-domain";
import {
  activeProfileOrDefault,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte";
import { activeSkillDamageProfile } from "$lib/skill-damage-profile.svelte";
import type { HudDomainRules } from "$lib/hud-scene-visibility";

export type HudDomainRulesAccessor = {
  read: () => HudDomainRules;
  setEnabled: (enabled: boolean) => void;
};

export const HUD_DOMAIN_RULES: Record<HudDomain, HudDomainRulesAccessor> = {
  game: {
    read: () => {
      const profile = activeProfileOrDefault();
      return {
        enabled: profile.enabled,
        autoHideInDailyScenes: profile.autoHideInDailyScenes ?? false,
      };
    },
    setEnabled: (enabled) => {
      updateActiveProfile((profile) => ({ ...profile, enabled }));
    },
  },
  monster: {
    read: () => ({
      enabled: SETTINGS.monsterMonitor.state.enabled,
      autoHideInDailyScenes:
        SETTINGS.monsterMonitor.state.autoHideInDailyScenes ?? false,
    }),
    setEnabled: (enabled) => {
      SETTINGS.monsterMonitor.state.enabled = enabled;
    },
  },
  minimap: {
    read: () => ({
      // `enabled` postdates the minimap config, so older persisted stores are
      // missing it. Default to true: before this switch existed the panel was
      // controlled only by the scene rules and the toggle button.
      enabled: SETTINGS.minimap.state.enabled ?? true,
      autoHideInDailyScenes:
        SETTINGS.minimap.state.autoHideInDailyScenes ?? false,
    }),
    setEnabled: (enabled) => {
      SETTINGS.minimap.state.enabled = enabled;
    },
  },
  damage: {
    read: () => {
      const profile = activeSkillDamageProfile();
      return {
        enabled: profile?.enabled ?? false,
        autoHideInDailyScenes: profile?.autoHideInDailyScenes ?? false,
      };
    },
    setEnabled: (enabled) => {
      const profile = activeSkillDamageProfile();
      if (profile) profile.enabled = enabled;
    },
  },
};

export function readHudDomainRules(domain: HudDomain): HudDomainRules {
  return HUD_DOMAIN_RULES[domain].read();
}

export function isHudDomainEnabled(domain: HudDomain): boolean {
  return readHudDomainRules(domain).enabled;
}

export function setHudDomainEnabled(domain: HudDomain, enabled: boolean): void {
  HUD_DOMAIN_RULES[domain].setEnabled(enabled);
}

export function toggleHudDomainEnabled(domain: HudDomain): void {
  setHudDomainEnabled(domain, !isHudDomainEnabled(domain));
}
