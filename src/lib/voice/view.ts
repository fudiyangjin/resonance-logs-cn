/**
 * @file Bridges the reactive settings stores to the pure binding layer:
 * `buildVoiceBindingView()` snapshots everything adapters read (tracked when
 * called inside `$derived` / `$effect`), and `SETTINGS_WRITER` is the one
 * place binding edits are committed back.
 */
import { getLocale, t } from "$lib/i18n/index.svelte";
import { updateMonsterMonitor } from "$lib/monster-monitor-profile.svelte.js";
import {
  activeProfile,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte.js";
import { getGlobalBuffAliases, SETTINGS } from "$lib/settings-store";
import { allMinimapVoiceCues } from "../../routes/minimap-overlay/scene-registry";
import {
  pruneAlertVoiceConfigs,
  pruneMechanicVoiceConfigs,
} from "./association";
import type {
  MonsterVoiceSlice,
  VoiceBindingView,
  VoiceBindingWriter,
} from "./subject-types";

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

const EMPTY_MONSTER_SLICE: MonsterVoiceSlice = {
  monsterBuffVoiceConfigs: {},
  dbmVoiceConfigs: {},
  dbmAliases: {},
  monitoredBuffIds: [],
  selfAppliedBuffIds: [],
  selfAppliedMonitorAll: false,
  entityDurationEntries: [],
  entityVoiceConfigs: {},
  monsterSkillEntries: [],
  monsterSkillVoiceConfigs: {},
};

/**
 * What the phrase GC must see: one view per stored profile — managed
 * phrase names are shared by every loadout, so the inactive ones count as
 * much as the active one — plus one for the global minimap and alert
 * bindings. The monster mirror stands in for its own profile slot, which
 * only catches up on the next profile switch.
 */
export function buildVoiceGcViews(): VoiceBindingView[] {
  const global = buildVoiceBindingView();
  const profileView = (
    skillProfile: VoiceBindingView["skillProfile"],
    monster: MonsterVoiceSlice,
  ): VoiceBindingView => ({
    ...global,
    skillProfile,
    monster,
    mechanicVoiceConfigs: {},
    alertConfigs: {},
    minimapCues: [],
  });
  const monsterState = SETTINGS.monsterMonitor.state;
  return [
    { ...global, skillProfile: null, monster: EMPTY_MONSTER_SLICE },
    ...SETTINGS.skillMonitor.state.profiles.map((profile) =>
      profileView(profile, EMPTY_MONSTER_SLICE),
    ),
    profileView(null, monsterState),
    ...monsterState.profiles
      .filter((profile) => profile.id !== monsterState.mirroredProfileId)
      .map((profile) => profileView(null, profile)),
  ];
}

export const SETTINGS_WRITER: VoiceBindingWriter = {
  updateSkillProfile(update) {
    updateActiveProfile(update);
  },
  patchMonster(patch) {
    updateMonsterMonitor((state) => patch(state));
  },
  updateMechanicVoiceConfigs(update) {
    const known = new Set(allMinimapVoiceCues().map((cue) => cue.id));
    SETTINGS.minimap.state.mechanicVoiceConfigs =
      pruneMechanicVoiceConfigs(
        update(SETTINGS.minimap.state.mechanicVoiceConfigs),
        known,
      ) ?? {};
  },
  updateAlertConfigs(update) {
    SETTINGS.voice.state.alertConfigs =
      pruneAlertVoiceConfigs(update(SETTINGS.voice.state.alertConfigs)) ?? {};
  },
};
