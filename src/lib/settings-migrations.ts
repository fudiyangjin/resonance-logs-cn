import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { RuneStore } from "@tauri-store/svelte";
import { tick } from "svelte";
import { commands } from "./bindings";
import {
  ensureBuffComposites,
  pruneUnknownCompositeRefs,
} from "./buff-composites";
import { ensureBuffIconOverrides } from "./buff-icons";
import {
  SETTINGS,
  createDefaultLoadoutsState,
  createDefaultLiveAppearance,
  createDefaultLiveMeterProfileData,
  createDefaultLiveMeterState,
  mergeLiveHeaderCustomization,
  normalizeHistorySettings,
  normalizeDeathReplayColumnOrder,
  normalizeDpsSkillColumnOrder,
  normalizeHealSkillColumnOrder,
  normalizeTankedSkillColumnOrder,
  createDefaultMonsterMonitorState,
  createDefaultSkillMonitorProfile,
  deepCloneSettings,
  ensureDbmAliases,
  extractMonsterProfileData,
  generateProfileId,
  startAccessibilityStore,
  startLiveMeterStores,
  type LiveAppearance,
  type LiveMeterProfile,
  type LiveMeterProfileData,
  type LiveMeterState,
  type Loadout,
  type LoadoutsState,
  type MonitoringSettingsState,
  type MonsterMonitorProfile,
  type MonsterMonitorState,
  type SkillMonitorProfile,
  type SkillMonitorState,
} from "./settings-store";
import { normalizeDpsColumnLabels } from "./column-labels";
import { lookupDbmDefaultName } from "./config/dbm-table";
import { ensureEntityDurationEntries } from "./entity-duration-entries";
import { entriesFromLegacySkillDurationIds } from "./entity-duration-migration";
import { t } from "$lib/i18n/index.svelte";
import { normalizeMonsterProfileStyles } from "./monster-monitor-profile.svelte.js";
import { normalizeSkillProfile } from "./skill-monitor-normalize";
import { isPristineLegacyMonitoring } from "./starter-loadout";
import { migrateLegacyMonsterPanels } from "./monster-panel-migration";
import { pruneMonsterVoice, pruneSkillProfileVoice } from "./voice/association";
import type { MonsterVoiceSlice } from "./voice/subject-types";

export const CURRENT_MONITORING_SCHEMA_VERSION = 7;

const READY_EVENT = "monitoring-settings-ready";
const ERROR_EVENT = "monitoring-settings-error";
const RECOVERY_EVENT = "monitoring-settings-recovery-reload";
const RECOVERY_ATTEMPTED_SESSION_KEY = "monitoring-recovery-attempted";
const REMOTE_INITIALIZATION_TIMEOUT_MS = 15_000;
export const RECOVERY_NOTICE_STORAGE_KEY = "monitoring-recovery-notice";

export type MonitoringInitializationResult =
  | { status: "ready" }
  | { status: "reload-required"; recoveryPath: string };

type RecoveryEventPayload = { recoveryPath: string };

export function isMonitoringRecoveryAuthority(windowLabel: string): boolean {
  return windowLabel === "main";
}

export function canAttemptMonitoringRecovery(
  recoveryAttempted: string | null,
): boolean {
  return recoveryAttempted !== "1";
}

function waitForRemoteInitialization(
  remoteResult: Promise<MonitoringSettingsState | RecoveryEventPayload>,
): Promise<MonitoringSettingsState | RecoveryEventPayload> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () =>
        reject(
          new Error("timed out waiting for main-window monitoring recovery"),
        ),
      REMOTE_INITIALIZATION_TIMEOUT_MS,
    );
    remoteResult.then(
      (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

type LegacySkillMonitorState = SkillMonitorState & {
  // Pre-v2 global flags that now live per-profile. Kept on the legacy shape
  // so old persisted stores can still be read during migration.
  enabled?: boolean;
  autoHideInDailyScenes?: boolean;
  activeProfileIndex?: number;
};

type LegacyLoadoutsState = LoadoutsState & {
  schemaVersion?: number;
};

/**
 * Pre-schema-3 `accessibility` also held the fields that moved into each
 * live profile's `appearance` (see `LiveAppearance`). Kept here only so the
 * v2 -> v3 migration can read whatever a user had already customized before
 * those fields are dropped from the `accessibility` store's type.
 */
type LegacyAccessibilityAppearance = {
  classColors?: Record<string, string>;
  useClassSpecColors?: boolean;
  classSpecColors?: Record<string, string>;
};

/** Reads the pre-migration global color settings to seed each live profile's new `appearance` field. */
function extractLegacyAppearanceFromAccessibility(): LiveAppearance {
  const legacy = SETTINGS.accessibility
    .state as unknown as typeof SETTINGS.accessibility.state &
    LegacyAccessibilityAppearance;
  const defaults = createDefaultLiveAppearance();
  return {
    themeColors: { ...defaults.themeColors, ...legacy.customThemeColors },
    classColors: { ...defaults.classColors, ...legacy.classColors },
    useClassSpecColors:
      legacy.useClassSpecColors ?? defaults.useClassSpecColors,
    classSpecColors: { ...defaults.classSpecColors, ...legacy.classSpecColors },
  };
}

export type LegacyMonitoringSources = {
  skillMonitor: LegacySkillMonitorState;
  monsterMonitor: MonsterMonitorState;
  loadouts: LegacyLoadoutsState;
};

function nextUniqueId(
  currentId: unknown,
  prefix: string,
  seen: Set<string>,
): string {
  const candidate = typeof currentId === "string" ? currentId.trim() : "";
  if (candidate && !seen.has(candidate)) {
    seen.add(candidate);
    return candidate;
  }
  let generated = generateProfileId(prefix);
  while (seen.has(generated)) generated = generateProfileId(prefix);
  seen.add(generated);
  return generated;
}

function normalizeSkillProfiles(
  profiles: SkillMonitorProfile[] | null | undefined,
): SkillMonitorProfile[] {
  const source = Array.isArray(profiles) ? profiles : [];
  const fallback =
    source.length > 0 ? source : [createDefaultSkillMonitorProfile()];
  const seen = new Set<string>();
  return fallback.map((profile) => {
    // Backfills fields added after this profile was first created (overlay
    // text-style toggles, panel-attr text style, etc.) so persisted storage
    // — and anything exported from it — converges on the current schema
    // instead of carrying stale gaps forever.
    const normalized = normalizeSkillProfile(profile);
    return {
      ...normalized,
      enabled: profile.enabled ?? false,
      autoHideInDailyScenes: profile.autoHideInDailyScenes ?? false,
      id: nextUniqueId(profile.id, "skill", seen),
    };
  });
}

function normalizeMonsterProfiles(
  state: MonsterMonitorState,
): MonsterMonitorProfile[] {
  const source = Array.isArray(state.profiles) ? state.profiles : [];
  const fallback =
    source.length > 0
      ? source
      : [
          {
            ...extractMonsterProfileData(state),
            id: generateProfileId("monster"),
            name: "",
          },
        ];
  const seen = new Set<string>();
  return fallback.map((profile) => {
    const normalized = normalizeMonsterProfileStyles(profile);
    return {
      ...normalized,
      enabled: profile.enabled ?? false,
      autoHideInDailyScenes: profile.autoHideInDailyScenes ?? false,
      id: nextUniqueId(profile.id, "monster", seen),
    };
  });
}

function materializeLegacyMonsterMirror(
  state: MonsterMonitorState,
): MonsterMonitorProfile[] {
  const profiles = normalizeMonsterProfiles(state);
  const mirroredIndex = profiles.findIndex(
    (profile) => profile.id === state.mirroredProfileId,
  );
  const targetIndex = mirroredIndex === -1 ? 0 : mirroredIndex;
  const target = profiles[targetIndex]!;
  profiles[targetIndex] = {
    ...target,
    ...extractMonsterProfileData(state),
  };
  state.mirroredProfileId = target.id;
  return profiles;
}

function defaultLoadoutName(
  profile: SkillMonitorProfile,
  index: number,
): string {
  return (
    profile.name.trim() ||
    (index === 0
      ? t("skillMonitor.defaults.defaultProfileName")
      : t("skillMonitor.defaults.profileName", { index: index + 1 }))
  );
}

function buildDefaultLoadouts(
  skillProfiles: SkillMonitorProfile[],
  monsterProfileId: string,
  liveProfileId: string,
  activeProfileIndex = 0,
  starterPlaceholder = false,
): LoadoutsState {
  const items = skillProfiles.map<Loadout>((profile, index) => ({
    id: generateProfileId("loadout"),
    name: defaultLoadoutName(profile, index),
    skillProfileId: profile.id,
    monsterProfileId,
    liveProfileId,
    starterPlaceholder: starterPlaceholder && skillProfiles.length === 1,
    linkedTalentStageCfgId: null,
  }));
  const activeIndex = Math.min(
    Math.max(Number.isFinite(activeProfileIndex) ? activeProfileIndex : 0, 0),
    items.length - 1,
  );
  return {
    ...createDefaultLoadoutsState(),
    activeId: items[activeIndex]?.id ?? items[0]?.id ?? "",
    items,
  };
}

function normalizeLoadouts(
  state: LoadoutsState,
  skillProfiles: SkillMonitorProfile[],
  monsterProfiles: MonsterMonitorProfile[],
  liveProfiles: LiveMeterProfile[],
): LoadoutsState {
  const skillIds = new Set(skillProfiles.map((profile) => profile.id));
  const monsterIds = new Set(monsterProfiles.map((profile) => profile.id));
  const liveIds = new Set(liveProfiles.map((profile) => profile.id));
  const fallbackSkillId = skillProfiles[0]!.id;
  const fallbackMonsterId = monsterProfiles[0]!.id;
  const fallbackLiveId = liveProfiles[0]!.id;
  const seen = new Set<string>();
  const items = (Array.isArray(state.items) ? state.items : []).map(
    (item, index): Loadout => ({
      id: nextUniqueId(item.id, "loadout", seen),
      name: item.name.trim() || `Loadout ${index + 1}`,
      skillProfileId: skillIds.has(item.skillProfileId)
        ? item.skillProfileId
        : fallbackSkillId,
      monsterProfileId: monsterIds.has(item.monsterProfileId)
        ? item.monsterProfileId
        : fallbackMonsterId,
      liveProfileId: liveIds.has(item.liveProfileId)
        ? item.liveProfileId
        : fallbackLiveId,
      starterPlaceholder: Boolean(item.starterPlaceholder),
      linkedTalentStageCfgId:
        typeof item.linkedTalentStageCfgId === "number" &&
        Number.isFinite(item.linkedTalentStageCfgId)
          ? item.linkedTalentStageCfgId
          : null,
    }),
  );
  if (items.length === 0) {
    return buildDefaultLoadouts(
      skillProfiles,
      fallbackMonsterId,
      fallbackLiveId,
    );
  }
  return {
    activeId: items.some((item) => item.id === state.activeId)
      ? state.activeId
      : items[0]!.id,
    items,
    firstRunPromptDismissed: Boolean(state.firstRunPromptDismissed),
    autoSwitchBySpec: state.autoSwitchBySpec ?? true,
  };
}

function normalizeLiveProfiles(
  state: LiveMeterState | null | undefined,
): LiveMeterState {
  if (!state || !Array.isArray(state.profiles) || state.profiles.length === 0) {
    return createDefaultLiveMeterState();
  }
  const seen = new Set<string>();
  const profiles = state.profiles.map((profile) => {
    const defaults = createDefaultLiveMeterProfileData();
    return {
      ...defaults,
      ...profile,
      general: {
        ...defaults.general,
        ...profile.general,
        showFantasyCastIcons: profile.general?.showFantasyCastIcons === true,
      },
      history: normalizeHistorySettings(profile.history),
      columnLabels: normalizeDpsColumnLabels(profile.columnLabels),
      deathReplay: {
        ...defaults.deathReplay,
        ...profile.deathReplay,
      },
      columnOrder: {
        ...defaults.columnOrder,
        ...profile.columnOrder,
        dpsSkills: {
          order: normalizeDpsSkillColumnOrder(
            profile.columnOrder?.dpsSkills?.order,
          ),
        },
        healSkills: {
          order: normalizeHealSkillColumnOrder(
            profile.columnOrder?.healSkills?.order,
          ),
        },
        tankedSkills: {
          order: normalizeTankedSkillColumnOrder(
            profile.columnOrder?.tankedSkills?.order,
          ),
        },
        deathReplay: {
          order: normalizeDeathReplayColumnOrder(
            profile.columnOrder?.deathReplay?.order,
          ),
        },
      },
      headerCustomization: mergeLiveHeaderCustomization(
        profile.headerCustomization,
      ),
      id: nextUniqueId(profile.id, "live", seen),
    };
  });
  const mirroredId = profiles.some((p) => p.id === state.mirroredProfileId)
    ? state.mirroredProfileId
    : profiles[0]!.id;
  return { mirroredProfileId: mirroredId, profiles };
}

/**
 * Points the live-meter mirror at the active loadout's live profile. The
 * actual mirror stores (`SETTINGS.live.*`) are separate RuneStores and get
 * synced separately (see `applyActiveLiveProfileToMirror` in
 * `live-meter-profile.svelte.ts`), because they can't be reached through the
 * cloned `MonitoringSettingsState` the way monster's mirror fields can.
 */
function reconcileLiveMirror(state: MonitoringSettingsState): void {
  const active = state.loadouts.items.find(
    (item) => item.id === state.loadouts.activeId,
  );
  const target =
    state.liveMeter.profiles.find(
      (profile) => profile.id === active?.liveProfileId,
    ) ?? state.liveMeter.profiles[0]!;
  state.liveMeter.mirroredProfileId = target.id;
}

function reconcileMonsterMirror(state: MonitoringSettingsState): void {
  const monsterState = state.monsterMonitor;
  const mirroredIndex = monsterState.profiles.findIndex(
    (profile) => profile.id === monsterState.mirroredProfileId,
  );
  if (mirroredIndex !== -1) {
    monsterState.profiles[mirroredIndex] = {
      ...monsterState.profiles[mirroredIndex]!,
      ...extractMonsterProfileData(monsterState),
    };
  }

  const active = state.loadouts.items.find(
    (item) => item.id === state.loadouts.activeId,
  );
  const target =
    monsterState.profiles.find(
      (profile) => profile.id === active?.monsterProfileId,
    ) ?? monsterState.profiles[0]!;
  Object.assign(
    monsterState,
    deepCloneSettings(extractMonsterProfileData(target)),
  );
  monsterState.mirroredProfileId = target.id;
}

/**
 * Schema v7: DBM voice bindings used to compile without a DBM entry (the
 * DBM list is the alias map), so no page showed them. A binding now needs
 * its entry (`voice/association.ts`); each one gets a default-named entry
 * instead of being pruned, so what played keeps playing and can be removed.
 */
function adoptDbmVoiceEntries<M extends MonsterVoiceSlice>(monster: M): M {
  const aliases = ensureDbmAliases(monster.dbmAliases);
  const orphans = Object.keys(monster.dbmVoiceConfigs ?? {}).filter(
    (id) => Number.isInteger(Number(id)) && !aliases[id],
  );
  if (orphans.length === 0) return monster;
  for (const id of orphans) {
    aliases[id] = lookupDbmDefaultName(Number(id)) ?? `#${id}`;
  }
  return { ...monster, dbmAliases: aliases };
}

/**
 * Schema v7: a skill voice binding used to play only while its skill was
 * monitored on the cooldown HUD; the others sat silent in storage. Skill
 * bindings now form their own list, so the silent ones are dropped once
 * instead of starting to speak.
 */
function dropSilentSkillVoice(
  profile: SkillMonitorProfile,
): SkillMonitorProfile {
  const configs = profile.skillVoiceConfigs;
  if (!configs) return profile;
  const monitored = new Set(
    Array.isArray(profile.monitoredSkillIds) ? profile.monitoredSkillIds : [],
  );
  const kept = Object.fromEntries(
    Object.entries(configs).filter(([skillId]) =>
      monitored.has(Number(skillId)),
    ),
  );
  return Object.keys(kept).length === Object.keys(configs).length
    ? profile
    : { ...profile, skillVoiceConfigs: kept };
}

function adoptAllDbmVoiceEntries(
  state: MonsterMonitorState,
): MonsterMonitorState {
  return {
    ...adoptDbmVoiceEntries(state),
    profiles: (state.profiles ?? []).map((profile) =>
      adoptDbmVoiceEntries(profile),
    ),
  };
}

export function reconcileMonitoringState(
  input: MonitoringSettingsState,
): MonitoringSettingsState {
  const state = deepCloneSettings(input);
  if (state.schemaVersion < 6) {
    state.monsterMonitor = migrateMonsterPanelState(state.monsterMonitor);
  }
  if (state.schemaVersion < 7) {
    state.monsterMonitor = adoptAllDbmVoiceEntries(state.monsterMonitor);
  }
  state.skillMonitor.buffIconOverrides = ensureBuffIconOverrides(
    state.skillMonitor.buffIconOverrides,
  );
  state.skillMonitor.buffComposites = ensureBuffComposites(
    state.skillMonitor.buffComposites,
  );
  const compositeIds = new Set(
    state.skillMonitor.buffComposites.map((composite) => composite.id),
  );
  // Voice bindings live exactly as long as their subject in the profile
  // that holds them: prune each profile (and the monster mirror) on its
  // own. This also re-keys entity bindings written before they were keyed
  // by monster id. References to composites that no longer exist go the
  // same way. Idempotent, so every window can run it.
  const dropSilentSkills = state.schemaVersion < 7;
  state.skillMonitor.profiles = normalizeSkillProfiles(
    state.skillMonitor.profiles,
  ).map((profile) =>
    pruneSkillProfileVoice(
      pruneUnknownCompositeRefs(
        dropSilentSkills ? dropSilentSkillVoice(profile) : profile,
        compositeIds,
      ),
    ),
  );
  state.monsterMonitor.profiles = normalizeMonsterProfiles(
    state.monsterMonitor,
  ).map((profile) => pruneMonsterVoice(profile));
  Object.assign(state.monsterMonitor, pruneMonsterVoice(state.monsterMonitor));
  state.liveMeter = normalizeLiveProfiles(state.liveMeter);
  state.loadouts = normalizeLoadouts(
    state.loadouts,
    state.skillMonitor.profiles,
    state.monsterMonitor.profiles,
    state.liveMeter.profiles,
  );
  reconcileMonsterMirror(state);
  reconcileLiveMirror(state);
  state.schemaVersion = CURRENT_MONITORING_SCHEMA_VERSION;
  return state;
}

export function migrateLegacyMonitoringState(
  sources: LegacyMonitoringSources,
  liveProfileData: LiveMeterProfileData,
): MonitoringSettingsState {
  const skillMonitor = deepCloneSettings(sources.skillMonitor);
  let monsterMonitor = deepCloneSettings(sources.monsterMonitor);
  const legacySkillEnabled = skillMonitor.enabled ?? false;
  const legacySkillAutoHide = skillMonitor.autoHideInDailyScenes ?? false;
  delete skillMonitor.enabled;
  delete skillMonitor.autoHideInDailyScenes;
  const legacySkillProfiles =
    skillMonitor.profiles.length > 0
      ? skillMonitor.profiles
      : [createDefaultSkillMonitorProfile()];
  skillMonitor.profiles = normalizeSkillProfiles(
    legacySkillProfiles.map((profile) => ({
      ...profile,
      enabled: profile.enabled ?? legacySkillEnabled,
      autoHideInDailyScenes:
        profile.autoHideInDailyScenes ?? legacySkillAutoHide,
    })),
  );

  const hasExistingLoadouts = sources.loadouts.items.length > 0;
  const pristineLegacyMonitoring =
    !hasExistingLoadouts &&
    isPristineLegacyMonitoring(skillMonitor, monsterMonitor);
  monsterMonitor = adoptAllDbmVoiceEntries(
    migrateMonsterPanelState(monsterMonitor),
  );
  if (!hasExistingLoadouts) {
    monsterMonitor.profiles = materializeLegacyMonsterMirror(monsterMonitor);
  } else {
    monsterMonitor.profiles = normalizeMonsterProfiles(monsterMonitor);
  }

  const activeMonsterProfileId =
    monsterMonitor.profiles.find(
      (profile) => profile.id === monsterMonitor.mirroredProfileId,
    )?.id ?? monsterMonitor.profiles[0]!.id;

  const liveProfile: LiveMeterProfile = {
    ...deepCloneSettings(liveProfileData),
    id: generateProfileId("live"),
    name: "",
  };

  const loadouts = hasExistingLoadouts
    ? deepCloneSettings(sources.loadouts)
    : buildDefaultLoadouts(
        skillMonitor.profiles,
        activeMonsterProfileId,
        liveProfile.id,
        sources.skillMonitor.activeProfileIndex ?? 0,
        pristineLegacyMonitoring,
      );
  // Legacy loadouts predate liveProfileId; point them all at the new profile.
  loadouts.items = loadouts.items.map((item) => ({
    ...item,
    liveProfileId: item.liveProfileId ?? liveProfile.id,
  }));
  if (!hasExistingLoadouts && !pristineLegacyMonitoring) {
    loadouts.firstRunPromptDismissed = true;
  }
  delete (loadouts as LegacyLoadoutsState).schemaVersion;

  return reconcileMonitoringState({
    schemaVersion: CURRENT_MONITORING_SCHEMA_VERSION,
    skillMonitor,
    monsterMonitor,
    loadouts,
    liveMeter: { mirroredProfileId: liveProfile.id, profiles: [liveProfile] },
  });
}

/** Convert raw mirrors and slots before extraction can discard legacy flags. */
function migrateMonsterPanelState(
  state: MonsterMonitorState,
): MonsterMonitorState {
  return {
    ...migrateLegacyMonsterPanels(state),
    profiles: (state.profiles ?? []).map(migrateLegacyMonsterPanels),
  };
}

/** The legacy store must supply legacy defaults until its data is converted. */
function createLegacyMonsterMonitorState(): MonsterMonitorState {
  const state = createDefaultMonsterMonitorState();
  const flags = {
    hateListEnabled: false,
    stunListEnabled: false,
    hpListEnabled: false,
  };
  Object.assign(state, flags);
  state.overlayVisibility.showHatePanel = true;
  for (const profile of state.profiles) {
    Object.assign(profile, flags);
    profile.overlayVisibility.showHatePanel = true;
  }
  return state;
}

function applyMonitoringState(next: MonitoringSettingsState): void {
  const target = SETTINGS.monitoring.state;
  target.schemaVersion = next.schemaVersion;
  target.skillMonitor = deepCloneSettings(next.skillMonitor);
  target.monsterMonitor = deepCloneSettings(next.monsterMonitor);
  target.loadouts = deepCloneSettings(next.loadouts);
  target.liveMeter = deepCloneSettings(next.liveMeter);
}

type V1MonitoringState = MonitoringSettingsState & {
  skillMonitor: SkillMonitorState & {
    enabled?: boolean;
    autoHideInDailyScenes?: boolean;
  };
};

/**
 * In-place migration from monitoring schema v1 (or v2) up to the current
 * schema. v1 kept the skill/monster on/off switches and daily-scene
 * auto-hide as global fields and had no live-meter profile; v2 moves those
 * flags onto each profile and introduces a live-meter profile that every
 * existing loadout shares. v3 moves the (until then still global)
 * challenge-watch forbidden-damage list and appearance colors onto each
 * live-meter profile too. v4 adds the formerly-global history settings so
 * they switch and travel with the same profile. v5 removes the skill-monitor
 * "duration skills" and re-expresses them as monster-monitor entity-duration
 * entries on the loadout's monster profile.
 */
export function migrateMonitoringStateIncrementally(
  input: MonitoringSettingsState,
  liveProfileData: LiveMeterProfileData,
): MonitoringSettingsState {
  const state = deepCloneSettings(input) as V1MonitoringState;
  const fromSchemaVersion = state.schemaVersion || 1;
  const legacySkillEnabled = state.skillMonitor.enabled ?? false;
  const legacySkillAutoHide = state.skillMonitor.autoHideInDailyScenes ?? false;
  delete state.skillMonitor.enabled;
  delete state.skillMonitor.autoHideInDailyScenes;

  state.skillMonitor.profiles = state.skillMonitor.profiles.map((profile) => ({
    ...profile,
    enabled: profile.enabled ?? legacySkillEnabled,
    autoHideInDailyScenes: profile.autoHideInDailyScenes ?? legacySkillAutoHide,
  }));

  // Monster profiles already carry enabled/autoHideInDailyScenes through the
  // mirror in v1; normalize any that are missing them.
  state.monsterMonitor.profiles = state.monsterMonitor.profiles.map(
    (profile) => ({
      ...profile,
      enabled: profile.enabled ?? state.monsterMonitor.enabled ?? false,
      autoHideInDailyScenes:
        profile.autoHideInDailyScenes ??
        state.monsterMonitor.autoHideInDailyScenes ??
        false,
    }),
  );

  if (fromSchemaVersion < 2) {
    // Schema v1 had no live-meter profile at all. Ignore any default
    // `liveMeter` injected by the current store shape and seed a single
    // profile from the legacy live stores (which, at this point, already
    // include `challengeWatch`/`appearance` — see below).
    const liveProfile: LiveMeterProfile = {
      ...deepCloneSettings(liveProfileData),
      id: generateProfileId("live"),
      name: "",
    };
    state.liveMeter = {
      mirroredProfileId: liveProfile.id,
      profiles: [liveProfile],
    };
    state.loadouts.items = state.loadouts.items.map((item) => ({
      ...item,
      liveProfileId: item.liveProfileId ?? liveProfile.id,
    }));
  }

  if (fromSchemaVersion < 3) {
    // Schema v2 already had (possibly several) live-meter profiles, but none
    // of them carry `challengeWatch`/`appearance` yet — backfill every
    // profile from the same legacy snapshot instead of only the mirror.
    state.liveMeter.profiles = state.liveMeter.profiles.map((profile) => ({
      ...profile,
      challengeWatch:
        profile.challengeWatch ??
        deepCloneSettings(liveProfileData.challengeWatch),
      appearance:
        profile.appearance ?? deepCloneSettings(liveProfileData.appearance),
    }));
  }

  if (fromSchemaVersion < 4) {
    // History settings used to live in seven global stores. The snapshot was
    // read before the monitoring store started, so seed every existing
    // profile with the user's current history preferences. Assign
    // unconditionally: the current default shape may already have injected an
    // empty `history` field into an older persisted profile.
    state.liveMeter.profiles = state.liveMeter.profiles.map((profile) => ({
      ...profile,
      history: deepCloneSettings(liveProfileData.history),
      columnLabels: normalizeDpsColumnLabels(
        profile.columnLabels ?? liveProfileData.columnLabels,
      ),
    }));
  }

  if (fromSchemaVersion < 5) {
    migrateSkillDurationIdsToEntityDuration(state);
  }

  return reconcileMonitoringState(state);
}

type LegacySkillDurationProfile = Omit<
  SkillMonitorProfile,
  | "monitoredSkillDurationIds"
  | "overlayPositions"
  | "overlaySizes"
  | "overlayVisibility"
> & {
  monitoredSkillDurationIds?: number[];
  overlayPositions?: Record<string, unknown> & {
    skillDurationPositions?: unknown;
  };
  overlaySizes?: Record<string, unknown> & { skillDurationSizes?: unknown };
  overlayVisibility?: Record<string, unknown> & {
    showSkillDurationGroup?: unknown;
  };
};

/**
 * Schema v5: every loadout whose skill profile still lists legacy duration
 * skills gets matching entity-duration entries on its monster profile. The
 * mirror is updated alongside the slot because `reconcileMonsterMirror`
 * flushes mirror over slot before re-copying. Legacy fields are removed from
 * every skill profile afterwards.
 */
function migrateSkillDurationIdsToEntityDuration(
  state: MonitoringSettingsState,
): void {
  const skillProfiles = state.skillMonitor
    .profiles as unknown as LegacySkillDurationProfile[];
  const skillById = new Map(
    skillProfiles.map((profile) => [profile.id, profile]),
  );

  for (const loadout of state.loadouts.items) {
    const skillIds = skillById.get(
      loadout.skillProfileId,
    )?.monitoredSkillDurationIds;
    if (!skillIds?.length) continue;
    const index = state.monsterMonitor.profiles.findIndex(
      (profile) => profile.id === loadout.monsterProfileId,
    );
    if (index === -1) continue;
    const profile = state.monsterMonitor.profiles[index]!;
    const existing = ensureEntityDurationEntries(profile.entityDurationEntries);
    const added = entriesFromLegacySkillDurationIds(skillIds, existing);
    if (added.length === 0) continue;
    state.monsterMonitor.profiles[index] = {
      ...profile,
      entityDurationEntries: [...existing, ...added],
    };
  }

  // v4 mirrors never carried this field (or carry an injected empty default);
  // re-seed it from the mirrored slot so reconciliation does not wipe the slot.
  const mirrored = state.monsterMonitor.profiles.find(
    (profile) => profile.id === state.monsterMonitor.mirroredProfileId,
  );
  if (mirrored) {
    state.monsterMonitor.entityDurationEntries = deepCloneSettings(
      ensureEntityDurationEntries(mirrored.entityDurationEntries),
    );
  }

  for (const profile of skillProfiles) {
    delete profile.monitoredSkillDurationIds;
    delete profile.overlayPositions?.skillDurationPositions;
    delete profile.overlaySizes?.skillDurationSizes;
    delete profile.overlayVisibility?.showSkillDurationGroup;
  }
}

/** Pushes the active loadout's live-meter profile into the live RuneStores. */
async function syncLiveMirrorToActiveLoadout(): Promise<void> {
  const { applyActiveLiveProfileToMirror } = await import(
    "./live-meter-profile.svelte.js"
  );
  applyActiveLiveProfileToMirror();
}

async function readLiveMirrorSnapshot(): Promise<LiveMeterProfileData> {
  const { extractLiveProfileData } = await import(
    "./live-meter-profile.svelte.js"
  );
  return extractLiveProfileData();
}

async function startLivePersistence(): Promise<void> {
  const { startLiveProfilePersistence } = await import(
    "./live-meter-profile.svelte.js"
  );
  startLiveProfilePersistence();
  await tick();
}

function createLegacyStores() {
  const options = {
    autoStart: false,
    save: false,
    saveOnChange: false,
    saveOnExit: false,
    sync: false,
  } as const;
  return {
    skillMonitor: new RuneStore<LegacySkillMonitorState>(
      "skillMonitor",
      {
        enabled: false,
        autoHideInDailyScenes: false,
        buffAliases: {},
        buffIconOverrides: {},
        buffComposites: [],
        profiles: [createDefaultSkillMonitorProfile()],
        activeProfileIndex: 0,
      },
      options,
    ),
    monsterMonitor: new RuneStore<MonsterMonitorState>(
      "monsterMonitor",
      createLegacyMonsterMonitorState(),
      options,
    ),
    loadouts: new RuneStore<LegacyLoadoutsState>(
      "loadouts",
      { ...createDefaultLoadoutsState(), schemaVersion: 0 },
      options,
    ),
  };
}

async function migrateAsMainWindow(
  liveProfileData: LiveMeterProfileData,
): Promise<void> {
  try {
    const result = await commands.backupSettingsStores();
    if (result.status === "error") throw new Error(String(result.error));
  } catch (error) {
    console.error("[monitoring-settings] backup failed, continuing", error);
  }

  const legacy = createLegacyStores();
  try {
    await Promise.all([
      legacy.skillMonitor.start(),
      legacy.monsterMonitor.start(),
      legacy.loadouts.start(),
    ]);
    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: legacy.skillMonitor.state,
        monsterMonitor: legacy.monsterMonitor.state,
        loadouts: legacy.loadouts.state,
      },
      liveProfileData,
    );
    applyMonitoringState(migrated);
    await tick();
    await SETTINGS.monitoring.saveNow();
  } finally {
    await Promise.allSettled([
      legacy.skillMonitor.stop(),
      legacy.monsterMonitor.stop(),
      legacy.loadouts.stop(),
    ]);
  }
}

async function destroyMonitoringStores(): Promise<void> {
  const legacy = createLegacyStores();
  const stores = [
    SETTINGS.monitoring,
    legacy.skillMonitor,
    legacy.monsterMonitor,
    legacy.loadouts,
  ];
  const failures: string[] = [];
  for (const store of stores) {
    try {
      await store.stop();
    } catch (error) {
      console.warn(`[monitoring-settings] failed to stop ${store.id}`, error);
    }
    try {
      await store.destroy();
    } catch (error) {
      failures.push(
        `${store.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `failed to reset monitoring stores: ${failures.join("; ")}`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function recoverAsMainWindow(
  originalError: unknown,
): Promise<MonitoringInitializationResult> {
  if (
    !canAttemptMonitoringRecovery(
      sessionStorage.getItem(RECOVERY_ATTEMPTED_SESSION_KEY),
    )
  ) {
    const message = errorMessage(originalError);
    await emit(ERROR_EVENT, message).catch(() => {});
    throw new Error(message);
  }
  sessionStorage.setItem(RECOVERY_ATTEMPTED_SESSION_KEY, "1");

  try {
    const backupResult = await commands.backupFailedMonitoringStores();
    if (backupResult.status === "error") {
      throw new Error(String(backupResult.error));
    }
    const recoveryPath = backupResult.data;
    await destroyMonitoringStores();
    localStorage.setItem(RECOVERY_NOTICE_STORAGE_KEY, recoveryPath);
    await emit(RECOVERY_EVENT, { recoveryPath }).catch((error) => {
      console.error(
        "[monitoring-settings] failed to broadcast recovery",
        error,
      );
    });
    return { status: "reload-required", recoveryPath };
  } catch (recoveryError) {
    const message = `initialization failed: ${errorMessage(originalError)}; recovery failed: ${errorMessage(recoveryError)}`;
    await emit(ERROR_EVENT, message).catch(() => {});
    throw new Error(message);
  }
}

let initializationPromise: Promise<MonitoringInitializationResult> | null =
  null;

export function initializeMonitoringSettings(): Promise<MonitoringInitializationResult> {
  initializationPromise ??= (async () => {
    const isMainWindow = isMonitoringRecoveryAuthority(
      getCurrentWebviewWindow().label,
    );
    let resolveRemote:
      | ((result: MonitoringSettingsState | RecoveryEventPayload) => void)
      | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const remoteResult = new Promise<
      MonitoringSettingsState | RecoveryEventPayload
    >((resolve, reject) => {
      resolveRemote = resolve;
      rejectReady = reject;
    });
    const unlistenReady = await listen<MonitoringSettingsState>(
      READY_EVENT,
      (event) => resolveRemote?.(event.payload),
    );
    const unlistenRecovery = await listen<RecoveryEventPayload>(
      RECOVERY_EVENT,
      (event) => resolveRemote?.(event.payload),
    );
    const unlistenError = await listen<string>(ERROR_EVENT, (event) =>
      rejectReady?.(new Error(event.payload)),
    );

    try {
      await Promise.all([startAccessibilityStore(), startLiveMeterStores()]);
      const legacyLiveProfileData = await readLiveMirrorSnapshot();
      // `appearance` is a brand-new store (unlike `challengeWatch`, which
      // reuses the pre-existing global store id), so its snapshot only has
      // built-in defaults — override with whatever the user had already
      // customized on the old global `accessibility` fields.
      legacyLiveProfileData.appearance =
        extractLegacyAppearanceFromAccessibility();
      try {
        await SETTINGS.monitoring.start();
        if (
          SETTINGS.monitoring.state.schemaVersion >=
          CURRENT_MONITORING_SCHEMA_VERSION
        ) {
          const reconciled = reconcileMonitoringState(
            SETTINGS.monitoring.state,
          );
          applyMonitoringState(reconciled);
          await syncLiveMirrorToActiveLoadout();
          await tick();
          await SETTINGS.monitoring.saveNow();
          if (isMainWindow) {
            await startLivePersistence();
            await emit(READY_EVENT, deepCloneSettings(reconciled));
          }
          sessionStorage.removeItem(RECOVERY_ATTEMPTED_SESSION_KEY);
          return { status: "ready" };
        }

        // Already a consolidated monitoring store (schemaVersion >= 1) but
        // behind the current schema: run incremental migrations in place
        // rather than re-reading the pre-consolidation legacy stores.
        if (SETTINGS.monitoring.state.schemaVersion >= 1) {
          if (isMainWindow) {
            const migrated = migrateMonitoringStateIncrementally(
              SETTINGS.monitoring.state,
              legacyLiveProfileData,
            );
            applyMonitoringState(migrated);
            await syncLiveMirrorToActiveLoadout();
            await tick();
            await SETTINGS.monitoring.saveNow();
            await startLivePersistence();
            await emit(
              READY_EVENT,
              deepCloneSettings(SETTINGS.monitoring.state),
            );
            sessionStorage.removeItem(RECOVERY_ATTEMPTED_SESSION_KEY);
            return { status: "ready" };
          }
        } else if (isMainWindow) {
          await migrateAsMainWindow(legacyLiveProfileData);
          await syncLiveMirrorToActiveLoadout();
          await startLivePersistence();
          await emit(READY_EVENT, deepCloneSettings(SETTINGS.monitoring.state));
          sessionStorage.removeItem(RECOVERY_ATTEMPTED_SESSION_KEY);
          return { status: "ready" };
        }
      } catch (error) {
        if (isMainWindow) return await recoverAsMainWindow(error);
        console.error(
          "[monitoring-settings] waiting for main-window recovery",
          error,
        );
      }

      const remote = await waitForRemoteInitialization(remoteResult);
      if ("recoveryPath" in remote) {
        return {
          status: "reload-required",
          recoveryPath: remote.recoveryPath,
        };
      }
      applyMonitoringState(remote);
      await syncLiveMirrorToActiveLoadout();
      await tick();
      sessionStorage.removeItem(RECOVERY_ATTEMPTED_SESSION_KEY);
      return { status: "ready" };
    } finally {
      unlistenReady();
      unlistenRecovery();
      unlistenError();
    }
  })();
  return initializationPromise;
}
