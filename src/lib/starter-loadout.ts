import {
  createDefaultMonsterMonitorState,
  createDefaultSkillMonitorProfile,
  extractMonsterProfileData,
  omitProfileId,
  type Loadout,
  type MonsterMonitorProfile,
  type MonsterMonitorState,
  type SkillMonitorProfile,
  type SkillMonitorState,
} from "./settings-store";
import {
  LEGACY_MONSTER_PANEL_KEYS,
  type LegacyMonsterPanelFlags,
} from "./monster-panel-migration";

function jsonSettingsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((item, index) => jsonSettingsEqual(item, right[index]))
    );
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonSettingsEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function normalizeWithDefaults(value: unknown, defaults: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof defaults !== "object" ||
    defaults === null ||
    Array.isArray(defaults)
  ) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const defaultRecord = defaults as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of new Set([
    ...Object.keys(defaultRecord),
    ...Object.keys(source),
  ])) {
    normalized[key] =
      key in source
        ? normalizeWithDefaults(source[key], defaultRecord[key])
        : defaultRecord[key];
  }
  return normalized;
}

export function isDefaultSkillMonitorProfile(
  profile: SkillMonitorProfile,
): boolean {
  const defaults = omitProfileId(createDefaultSkillMonitorProfile());
  return jsonSettingsEqual(
    normalizeWithDefaults(omitProfileId(profile), defaults),
    defaults,
  );
}

export function isDefaultMonsterMonitorProfile(
  profile: MonsterMonitorProfile,
): boolean {
  const defaults = createDefaultMonsterMonitorState().profiles[0]!;
  // Compare legacy settings against their original defaults, before collapsing
  // the switches. Otherwise a user's hidden custom setup could become a starter.
  if (LEGACY_MONSTER_PANEL_KEYS.some((key) => key in profile)) {
    Object.assign(defaults, {
      hateListEnabled: false,
      stunListEnabled: false,
      hpListEnabled: false,
    });
    defaults.overlayVisibility.showHatePanel = true;
  }
  const defaultsWithoutId = omitProfileId(defaults);
  return jsonSettingsEqual(
    normalizeWithDefaults(omitProfileId(profile), defaultsWithoutId),
    defaultsWithoutId,
  );
}

export function isPristineLegacyMonitoring(
  skillMonitor: SkillMonitorState,
  monsterMonitor: MonsterMonitorState,
): boolean {
  if (skillMonitor.profiles.length !== 1) return false;
  if (!isDefaultSkillMonitorProfile(skillMonitor.profiles[0]!)) return false;

  const monsterDefaults = createDefaultMonsterMonitorState();
  if (monsterMonitor.profiles.length > 1) return false;
  if (
    monsterMonitor.profiles[0] &&
    !isDefaultMonsterMonitorProfile(monsterMonitor.profiles[0])
  ) {
    return false;
  }
  if (
    !jsonSettingsEqual(
      {
        enabled: monsterMonitor.enabled,
        autoHideInDailyScenes: monsterMonitor.autoHideInDailyScenes,
        buffAliases: monsterMonitor.buffAliases,
      },
      {
        enabled: monsterDefaults.enabled,
        autoHideInDailyScenes: monsterDefaults.autoHideInDailyScenes,
        buffAliases: monsterDefaults.buffAliases,
      },
    )
  ) {
    return false;
  }

  const mirrorProfile: MonsterMonitorProfile = {
    ...extractMonsterProfileData(monsterMonitor),
    id: "mirror",
    name: monsterMonitor.profiles[0]?.name ?? "",
  };
  for (const key of LEGACY_MONSTER_PANEL_KEYS) {
    if (key in monsterMonitor) {
      (mirrorProfile as MonsterMonitorProfile & LegacyMonsterPanelFlags)[key] =
        (monsterMonitor as MonsterMonitorState & LegacyMonsterPanelFlags)[
          key
        ] ?? false;
    }
  }
  return isDefaultMonsterMonitorProfile(mirrorProfile);
}

export function isReplaceableStarterLoadout(
  loadout: Loadout,
  skillProfile: SkillMonitorProfile | undefined,
  monsterProfile: MonsterMonitorProfile | undefined,
): boolean {
  return Boolean(
    loadout.starterPlaceholder &&
      skillProfile &&
      monsterProfile &&
      isDefaultSkillMonitorProfile(skillProfile) &&
      isDefaultMonsterMonitorProfile(monsterProfile),
  );
}
