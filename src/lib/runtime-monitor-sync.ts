import {
  commands,
  type CounterRule,
  type MonitorRuntimeSnapshot,
} from "$lib/bindings";
import { expandBuffSelection } from "$lib/config/buff-name-table";
import { activeProfile as getActiveProfile } from "$lib/skill-monitor-profile.svelte.js";
import { SETTINGS } from "$lib/settings-store";
import {
  getCounterRules,
  getDefaultMonitoredBuffIds,
  getSeasonCultivateFactorConfiguredEffectBuffIds,
  getSeasonCultivateFactorTemplates,
  resolveUserCounterRulesToPresets,
} from "$lib/skill-mappings";

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

function getCounterConfigBuffIds(rule: {
  sources: CounterRule["sources"];
  effectSlots: CounterRule["effectSlots"];
}): number[] {
  const result = rule.effectSlots.map((slot) => slot.resetBuffId);
  for (const slot of rule.effectSlots) {
    if (slot.altFreeze) {
      result.push(slot.altFreeze.conditionBuffId);
    }
  }
  for (const source of rule.sources) {
    if ("buffDurationTick" in source) {
      result.push(source.buffDurationTick.buffId);
    }
    if ("buffAdded" in source) {
      result.push(source.buffAdded.buffId);
    }
    if ("buffLayerSpent" in source) {
      result.push(source.buffLayerSpent.buffId);
    }
    if ("movementDistance" in source) {
      result.push(source.movementDistance.buffId);
    }
  }
  return result;
}

function stripUiOnlyCounterRuleFields(rule: {
  ruleId: number;
  sources: CounterRule["sources"];
  effectSlots: Array<CounterRule["effectSlots"][number] & { displayMode?: unknown }>;
}): CounterRule {
  return {
    ruleId: rule.ruleId,
    sources: rule.sources,
    effectSlots: rule.effectSlots.map(({ displayMode: _displayMode, ...slot }) => slot),
  };
}

function buildSkillRuntimeSnapshot(): MonitorRuntimeSnapshot["skill"] {
  const enabled = SETTINGS.skillMonitor.state.enabled;
  const profile = getActiveProfile();
  const selectedClass = profile?.selectedClass ?? "wind_knight";
  const monitoredSkillIds = profile?.monitoredSkillIds ?? [];
  const monitoredSkillDurationIds =
    profile?.monitoredSkillDurationIds ?? [];
  const mergedSkillIds = uniqueSortedNumbers([
    ...monitoredSkillIds,
    ...monitoredSkillDurationIds,
  ]);
  const monitoredBuffIds = expandBuffSelection(
    profile?.monitoredBuffIds ?? [],
    profile?.monitoredBuffCategories,
  );
  const monitoredPanelAttrs = profile?.monitoredPanelAttrs ?? [];
  const customPanelEntries = profile?.customPanelGroups?.length
    ? profile.customPanelGroups
        .filter((group) => (group.kind ?? "manual") === "manual")
        .flatMap((group) => group.entries ?? [])
    : (profile?.inlineBuffEntries ?? []);
  const hasSeasonCultivateFactorGroup = Boolean(
    profile?.customPanelGroups?.some(
      (group) => group.kind === "seasonCultivateFactor",
    ),
  );
  const inlineCounterRuleIds = customPanelEntries
    .filter((entry) => entry.sourceType === "counter")
    .map((entry) => entry.sourceId);
  const buffDisplayMode = profile?.buffDisplayMode ?? "individual";
  const buffGroups = profile?.buffGroups ?? [];
  const individualAllGroup = profile?.individualMonitorAllGroup ?? null;
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
    .map((rule) => stripUiOnlyCounterRuleFields({
      ruleId: rule.ruleId,
      sources: rule.sources,
      effectSlots: rule.effectSlots,
    }));
  const enabledUserCounterRules = resolveUserCounterRulesToPresets(
    (profile?.userCounterRules ?? []).filter((rule) =>
      activeCounterRuleIds.includes(rule.ruleId),
    ),
  ).map(({ name: _name, ...rule }) => stripUiOnlyCounterRuleFields(rule));
  const enabledCounterRules = normalizeCounterRules([
    ...enabledPresetCounterRules,
    ...enabledUserCounterRules,
  ]);
  const seasonCultivateFactorTemplates = hasSeasonCultivateFactorGroup
    ? getSeasonCultivateFactorTemplates()
    : [];
  const counterBuffIds = enabledCounterRules.flatMap((rule) =>
    getCounterConfigBuffIds(rule),
  );
  const factorBuffIds = seasonCultivateFactorTemplates.flatMap((template) =>
    getCounterConfigBuffIds({
      sources: template.sources ?? [],
      effectSlots: template.effectSlots ?? [],
    }),
  );
  const factorEffectBuffIds = hasSeasonCultivateFactorGroup
    ? getSeasonCultivateFactorConfiguredEffectBuffIds()
    : [];
  const defaultLinkedBuffIds = getDefaultMonitoredBuffIds(selectedClass);
  const mergedBuffIds = uniqueSortedNumbers([
    ...monitoredBuffIds,
    ...groupBuffIds,
    ...inlineBuffIds,
    ...counterBuffIds,
    ...factorBuffIds,
    ...factorEffectBuffIds,
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
      seasonCultivateFactorTemplates: [],
    };
  }

  return {
    enabled: true,
    monitoredSkillIds: mergedSkillIds,
    monitoredBuffIds: mergedBuffIds,
    monitorAllBuff,
    monitoredPanelAttrIds,
    buffCounterRules: enabledCounterRules,
    seasonCultivateFactorTemplates,
  };
}

function buildMonsterRuntimeSnapshot(): MonitorRuntimeSnapshot["monster"] {
  const enabled = SETTINGS.monsterMonitor.state.enabled;
  if (!enabled) {
    return {
      enabled: false,
      globalIds: [],
      selfAppliedIds: [],
      monitorAllSelfApplied: false,
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
    monitorAllSelfApplied: SETTINGS.monsterMonitor.state.selfAppliedMonitorAll,
  };
}

function buildTeammateRuntimeSnapshot(): MonitorRuntimeSnapshot["teammate"] {
  const enabled = SETTINGS.monsterMonitor.state.enabled;
  const anySourceIds = uniqueSortedNumbers(
    expandBuffSelection(
      SETTINGS.monsterMonitor.state.teammateBuffIds,
      SETTINGS.monsterMonitor.state.teammateBuffCategories,
    ),
  );
  if (!enabled) {
    return {
      enabled: false,
      anySourceIds: [],
      localPlayerSourceIds: [],
      targetSelfSourceIds: [],
      monitorAll: false,
    };
  }

  return {
    enabled: anySourceIds.length > 0,
    anySourceIds,
    localPlayerSourceIds: [],
    targetSelfSourceIds: [],
    monitorAll: false,
  };
}

export function buildMonitorRuntimeSnapshot(): MonitorRuntimeSnapshot {
  return {
    i18n: {
      locale: SETTINGS.i18n.state.locale,
    },
    live: {
      eventUpdateRateMs: SETTINGS.live.general.state.eventUpdateRateMs,
    },
    skill: buildSkillRuntimeSnapshot(),
    monster: buildMonsterRuntimeSnapshot(),
    teammate: buildTeammateRuntimeSnapshot(),
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
