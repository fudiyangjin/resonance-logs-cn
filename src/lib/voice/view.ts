/**
 * @file Bridges the reactive settings stores to the pure binding layer:
 * `buildVoiceBindingView()` snapshots everything adapters read (tracked when
 * called inside `$derived` / `$effect`), and `SETTINGS_WRITER` is the one
 * place binding edits are committed back.
 */
import { getLocale, t } from "$lib/i18n/index.svelte";
import {
  activeProfile,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte.js";
import { getGlobalBuffAliases, SETTINGS } from "$lib/settings-store";
import { allMinimapVoiceCues } from "../../routes/minimap-overlay/scene-registry";
import type { VoiceBindingView, VoiceBindingWriter } from "./subject-types";

export function buildVoiceBindingView(): VoiceBindingView {
  return {
    skillProfile: activeProfile(),
    // Pass the store state itself: adapters only read the `MonsterVoiceSlice`
    // fields, and reading through the proxy keeps the dependencies tracked.
    monster: SETTINGS.monsterMonitor.state,
    mechanicVoiceConfigs: SETTINGS.minimap.state.mechanicVoiceConfigs,
    alertConfigs: SETTINGS.voice.state.alertConfigs,
    minimapCues: allMinimapVoiceCues(),
    buffAliases: getGlobalBuffAliases(),
    locale: getLocale(),
    t,
  };
}

export const SETTINGS_WRITER: VoiceBindingWriter = {
  updateSkillProfile(update) {
    updateActiveProfile(update);
  },
  patchMonster(patch) {
    const state = SETTINGS.monsterMonitor.state;
    const next = patch(state);
    if (next.monsterBuffVoiceConfigs !== undefined) {
      state.monsterBuffVoiceConfigs = next.monsterBuffVoiceConfigs;
    }
    if (next.dbmVoiceConfigs !== undefined) {
      state.dbmVoiceConfigs = next.dbmVoiceConfigs;
    }
  },
  updateMechanicVoiceConfigs(update) {
    SETTINGS.minimap.state.mechanicVoiceConfigs = update(
      SETTINGS.minimap.state.mechanicVoiceConfigs,
    );
  },
  updateAlertConfigs(update) {
    SETTINGS.voice.state.alertConfigs = update(
      SETTINGS.voice.state.alertConfigs,
    );
  },
};
