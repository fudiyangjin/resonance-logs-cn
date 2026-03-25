import { commands, type CounterRule } from "$lib/bindings";
import { expandBuffSelection } from "$lib/config/buff-name-table";
import { SETTINGS, type SkillMonitorProfile } from "$lib/settings-store";
import { getCounterRules, getDefaultMonitoredBuffIds } from "$lib/skill-mappings";

export type MonitorRuntimeSnapshot = {
  live: {
    eventUpdateRateMs: number;
  };
  skill: {
    enabled: boolean;
    monitoredSkillIds: number[];
    monitoredBuffIds: number[];
    monitorAllBuff: boolean;
    monitoredPanelAttrIds: number[];
    buffCounterRules: CounterRule[];
  };
  monster: {
    enabled: boolean;
    globalIds: number[];
    selfAppliedIds: number[];
  };
};

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

function uniqueSortedNumbersLimited(values: number[], limit: number): number[] {
  return Array.from(new Set(values))
    .slice(0, limit)
    .sort((a, b) => a - b);
}

function normalizeCounterRules(rules: CounterRule[]): CounterRule[] {
  const deduped = new Map<number, CounterRule>();
  for (const rule of rules) {
    deduped.set(rule.ruleId, rule);
  }
  return Array.from(deduped.values()).sort((a, b) => a.ruleId - b.ruleId);
}

function buildSkillRuntimeSnapshot(): MonitorRuntimeSnapshot["skill"] {
  const enabled = SETTINGS.skillMonitor.state.enabled;
  const activeProfile = getActiveSkillMonitorProfile();
  const selectedClass = activeProfile?.selectedClass ?? "wind_knight";
  const monitoredSkillIds = activeProfile?.monitoredSkillIds ?? [];
  const monitoredSkillDurationIds = activeProfile?.monitoredSkillDurationIds ?? [];
  const mergedSkillIds = uniqueSortedNumbersLimited([
    ...monitoredSkillIds,
    ...monitoredSkillDurationIds,
  ], 10);
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
    (buffDisplayMode === "grouped" && buffGroups.some((group) => group.monitorAll))
    || (buffDisplayMode === "individual" && !!individualAllGroup);
  const groupBuffIds = buffDisplayMode === "grouped"
    ? buffGroups.flatMap((group) => (group.monitorAll ? [] : group.buffIds))
    : [];
  const inlineBuffIds = customPanelEntries
    .filter((entry) => entry.sourceType === "buff")
    .map((entry) => entry.sourceId);
  const activeCounterRuleIds = inlineCounterRuleIds;
  const enabledCounterRules = normalizeCounterRules(
    getCounterRules()
      .filter((rule) => activeCounterRuleIds.includes(rule.ruleId))
      .map((rule) => ({
        ruleId: rule.ruleId,
        trigger: rule.trigger,
        linkedBuffId: rule.linkedBuffId,
        threshold: rule.threshold,
        onBuffAdd: rule.onBuffAdd,
        onBuffRemove: rule.onBuffRemove,
      })),
  );
  const counterLinkedBuffIds = enabledCounterRules.map((rule) => rule.linkedBuffId);
  const defaultLinkedBuffIds = getDefaultMonitoredBuffIds(selectedClass);
  const mergedBuffIds = uniqueSortedNumbers([
    ...monitoredBuffIds,
    ...groupBuffIds,
    ...inlineBuffIds,
    ...counterLinkedBuffIds,
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
    globalIds: uniqueSortedNumbers(SETTINGS.monsterMonitor.state.monitoredBuffIds),
    selfAppliedIds: uniqueSortedNumbers(SETTINGS.monsterMonitor.state.selfAppliedBuffIds),
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
