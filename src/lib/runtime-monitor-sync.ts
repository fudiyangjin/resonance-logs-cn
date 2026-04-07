import {
  commands,
  type CounterRule,
  type MonitorRuntimeSnapshot,
} from "$lib/bindings";
import { expandBuffSelection } from "$lib/config/buff-name-table";
import {
  SETTINGS,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import {
  getCounterRules,
  getDefaultMonitoredBuffIds,
  resolveUserCounterRulesToPresets,
} from "$lib/skill-mappings";

function getActiveSkillMonitorProfile(): SkillMonitorProfile | null {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  if (profiles.length === 0) return null;

  const index = Math.min(
    Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
    profiles.length - 1,
  );
  return profiles[index] ?? null;
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function normalizeCounterRules(rules: CounterRule[]): CounterRule[] {
  const deduped = new Map<number, CounterRule>();
  for (const rule of rules) {
    deduped.set(rule.ruleId, rule);
  }
  return Array.from(deduped.values()).sort((a, b) => a.ruleId - b.ruleId);
}

function getCounterRuleBuffIds(rule: CounterRule): number[] {
  const result = rule.effectSlots.map((slot) => slot.resetBuffId);
  for (const source of rule.sources) {
    if ("buffDurationTick" in source) {
      result.push(source.buffDurationTick.buffId);
    }
  }
  return result;
}

function buildSkillRuntimeSnapshot(): MonitorRuntimeSnapshot["skill"] {
  const enabled = SETTINGS.skillMonitor.state.enabled;
  const activeProfile = getActiveSkillMonitorProfile();
  const selectedClass = activeProfile?.selectedClass ?? "wind_knight";
  const monitoredSkillIds = activeProfile?.monitoredSkillIds ?? [];
  const monitoredSkillDurationIds =
    activeProfile?.monitoredSkillDurationIds ?? [];
  const mergedSkillIds = uniqueSortedNumbers([
    ...monitoredSkillIds,
    ...monitoredSkillDurationIds,
  ]);
  const monitoredBuffIds = expandBuffSelection(
    activeProfile?.monitoredBuffIds ?? [],
    activeProfile?.monitoredBuffCategories,
  );
  const monitoredPanelAttrs = activeProfile?.monitoredPanelAttrs ?? [];
  const customPanelEntries = activeProfile?.customPanelGroups?.length
    ? activeProfile.customPanelGroups.flatMap((group) => group.entries ?? [])
    : (activeProfile?.inlineBuffEntries ?? []);
  const inlineCounterRuleIds = customPanelEntries
    .filter((entry) => entry.sourceType === "counter")
    .map((entry) => entry.sourceId);
  const buffDisplayMode = activeProfile?.buffDisplayMode ?? "individual";
  const buffGroups = activeProfile?.buffGroups ?? [];
  const individualAllGroup = activeProfile?.individualMonitorAllGroup ?? null;
  const monitorAllBuff =
    (buffDisplayMode === "grouped" &&
      buffGroups.some((group) => group.monitorAll)) ||
    (buffDisplayMode === "individual" && !!individualAllGroup);
  const groupBuffIds =
    buffDisplayMode === "grouped"
      ? buffGroups.flatMap((group) => (group.monitorAll ? [] : group.buffIds))
      : [];
  const inlineBuffIds = customPanelEntries
    .filter((entry) => entry.sourceType === "buff")
    .map((entry) => entry.sourceId);
  const activeCounterRuleIds = uniqueSortedNumbers(inlineCounterRuleIds);
  const enabledPresetCounterRules = getCounterRules()
    .filter((rule) => activeCounterRuleIds.includes(rule.ruleId))
    .map((rule) => ({
      ruleId: rule.ruleId,
      sources: rule.sources,
      effectSlots: rule.effectSlots,
    }));
  const enabledUserCounterRules = resolveUserCounterRulesToPresets(
    (activeProfile?.userCounterRules ?? []).filter((rule) =>
      activeCounterRuleIds.includes(rule.ruleId),
    ),
  ).map(({ name: _name, ...rule }) => rule);
  const enabledCounterRules = normalizeCounterRules([
    ...enabledPresetCounterRules,
    ...enabledUserCounterRules,
  ]);
  const counterBuffIds = enabledCounterRules.flatMap((rule) =>
    getCounterRuleBuffIds(rule),
  );
  const defaultLinkedBuffIds = getDefaultMonitoredBuffIds(selectedClass);
  const mergedBuffIds = uniqueSortedNumbers([
    ...monitoredBuffIds,
    ...groupBuffIds,
    ...inlineBuffIds,
    ...counterBuffIds,
    ...defaultLinkedBuffIds,
  ]);
  const monitoredPanelAttrIds = uniqueSortedNumbers(
    monitoredPanelAttrs
      .filter((item) => item.enabled)
      .map((item) => item.attrId),
  );

  if (!enabled) {
    return {
      enabled: false,
      monitoredSkillIds: [],
      monitoredBuffIds: [],
      monitorAllBuff: false,
      monitoredPanelAttrIds: [],
      buffCounterRules: [],
    };
  }

  return {
    enabled: true,
    monitoredSkillIds: mergedSkillIds,
    monitoredBuffIds: mergedBuffIds,
    monitorAllBuff,
    monitoredPanelAttrIds,
    buffCounterRules: enabledCounterRules,
  };
}

function buildMonsterRuntimeSnapshot(): MonitorRuntimeSnapshot["monster"] {
  const enabled = SETTINGS.monsterMonitor.state.enabled;
  if (!enabled) {
    return {
      enabled: false,
      globalIds: [],
      selfAppliedIds: [],
    };
  }

  return {
    enabled: true,
    globalIds: uniqueSortedNumbers(
      SETTINGS.monsterMonitor.state.monitoredBuffIds,
    ),
    selfAppliedIds: uniqueSortedNumbers(
      SETTINGS.monsterMonitor.state.selfAppliedBuffIds,
    ),
  };
}

export function buildMonitorRuntimeSnapshot(): MonitorRuntimeSnapshot {
  return {
    live: {
      eventUpdateRateMs: SETTINGS.live.general.state.eventUpdateRateMs,
    },
    skill: buildSkillRuntimeSnapshot(),
    monster: buildMonsterRuntimeSnapshot(),
  };
}

export function createMonitorRuntimeSnapshotSignature(
  snapshot: MonitorRuntimeSnapshot,
): string {
  return JSON.stringify(snapshot);
}

export async function saveAndApplyMonitorRuntimeSnapshot(
  snapshot: MonitorRuntimeSnapshot,
): Promise<void> {
  const result = await commands.saveAndApplyMonitorRuntimeSnapshot(snapshot);
  if (result.status === "error") {
    throw new Error(String(result.error));
  }
}
