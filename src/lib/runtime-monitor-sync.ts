import {
  commands,
  type CounterRule,
  type MonitorRuntimeSnapshot,
} from "$lib/bindings";
import {
  buildBuffTimelineIds,
  buildConfiguredBuffPlan,
  buildPublishedBuffIds,
} from "$lib/buff-monitor-plan";
import { expandBuffSelection } from "$lib/config/buff-name-table";
import { activeProfile as getActiveProfile } from "$lib/skill-monitor-profile.svelte.js";
import { ensureEntityDurationEntries } from "$lib/entity-duration-entries";
import { SETTINGS } from "$lib/settings-store";
import {
  getCounterRules,
  getSeasonCultivateFactorTemplates,
  resolveUserCounterRulesToPresets,
} from "$lib/skill-mappings";
import {
  compileVoiceRules,
  prepareMinimapVoicePhrases,
} from "$lib/voice-binding-compile.svelte.js";
import { getEnabledCounterVoiceRuleIds } from "$lib/voice-binding-counter";

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

function stripUiOnlyCounterRuleFields(rule: {
  ruleId: number;
  sources: CounterRule["sources"];
  effectSlots: Array<
    CounterRule["effectSlots"][number] & { displayMode?: unknown }
  >;
}): CounterRule {
  return {
    ruleId: rule.ruleId,
    sources: rule.sources,
    effectSlots: rule.effectSlots.map(({ displayMode, ...slot }) => {
      void displayMode;
      return slot;
    }),
  };
}

function buildSkillRuntimeSnapshot(): MonitorRuntimeSnapshot["skill"] {
  const profile = getActiveProfile();
  const buffPlan = buildConfiguredBuffPlan(profile);
  const skillMonitorEnabled = buffPlan.enabled;
  const monitoredSkillIds = profile?.monitoredSkillIds ?? [];
  const mergedSkillIds = uniqueSortedNumbers(monitoredSkillIds);
  const monitoredPanelAttrs = profile?.monitoredPanelAttrs ?? [];
  const customPanelEntries = buffPlan.manualEntries;
  const hasSeasonCultivateFactorGroup =
    skillMonitorEnabled && buffPlan.hasFactorPanel;
  const inlineCounterRuleIds = skillMonitorEnabled
    ? customPanelEntries
        .filter((entry) => entry.sourceType === "counter")
        .map((entry) => entry.sourceId)
    : [];
  const voiceCounterRuleIds = SETTINGS.voice.state.enabled
    ? getEnabledCounterVoiceRuleIds(profile)
    : [];
  const monitorAllBuff = buffPlan.monitorAll;
  const activeCounterRuleIds = uniqueSortedNumbers([
    ...inlineCounterRuleIds,
    ...voiceCounterRuleIds,
  ]);
  const userCounterRuleIds = new Set(
    (profile?.userCounterRules ?? []).map((rule) => rule.ruleId),
  );
  const enabledPresetCounterRules = getCounterRules()
    .filter(
      (rule) =>
        activeCounterRuleIds.includes(rule.ruleId) &&
        !userCounterRuleIds.has(rule.ruleId),
    )
    .map((rule) =>
      stripUiOnlyCounterRuleFields({
        ruleId: rule.ruleId,
        sources: rule.sources,
        effectSlots: rule.effectSlots,
      }),
    );
  const enabledUserCounterRules = resolveUserCounterRulesToPresets(
    (profile?.userCounterRules ?? []).filter((rule) =>
      activeCounterRuleIds.includes(rule.ruleId),
    ),
  ).map(({ name, ...rule }) => {
    void name;
    return stripUiOnlyCounterRuleFields(rule);
  });
  const enabledCounterRules = normalizeCounterRules([
    ...enabledPresetCounterRules,
    ...enabledUserCounterRules,
  ]);
  const seasonCultivateFactorTemplates = hasSeasonCultivateFactorGroup
    ? getSeasonCultivateFactorTemplates()
    : [];
  const buffTimelineIds = buildBuffTimelineIds(buffPlan);
  const mergedBuffIds = buildPublishedBuffIds(buffPlan);
  const monitoredPanelAttrIds = uniqueSortedNumbers(
    monitoredPanelAttrs
      .filter((item) => item.enabled)
      .map((item) => item.attrId),
  );

  const runtimeEnabled = skillMonitorEnabled || enabledCounterRules.length > 0;
  if (!runtimeEnabled) {
    return {
      enabled: false,
      monitoredSkillIds: [],
      monitoredBuffIds: [],
      monitorAllBuff: false,
      monitoredPanelAttrIds: [],
      buffCounterRules: [],
      seasonCultivateFactorTemplates: [],
      buffTimelineIds: [],
    };
  }

  return {
    enabled: true,
    monitoredSkillIds: skillMonitorEnabled ? mergedSkillIds : [],
    monitoredBuffIds: mergedBuffIds,
    monitorAllBuff: skillMonitorEnabled && monitorAllBuff,
    monitoredPanelAttrIds: skillMonitorEnabled ? monitoredPanelAttrIds : [],
    buffCounterRules: enabledCounterRules,
    seasonCultivateFactorTemplates,
    buffTimelineIds,
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
      watchedEntityIds: [],
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
    watchedEntityIds: uniqueSortedNumbers(
      ensureEntityDurationEntries(
        SETTINGS.monsterMonitor.state.entityDurationEntries,
      ).map((entry) => entry.monsterId),
    ),
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

function buildVoiceRuntimeSnapshot(): MonitorRuntimeSnapshot["voice"] {
  const voice = SETTINGS.voice.state;
  prepareMinimapVoicePhrases();
  if (!voice.enabled) {
    return {
      enabled: false,
      volume: voice.volume,
      queuePolicy: voice.queuePolicy,
      rules: [],
    };
  }

  return {
    enabled: true,
    volume: voice.volume,
    queuePolicy: voice.queuePolicy,
    rules: compileVoiceRules(),
  };
}

export function buildMonitorRuntimeSnapshot(): MonitorRuntimeSnapshot {
  return {
    i18n: {
      locale: SETTINGS.i18n.state.locale,
    },
    live: {
      eventUpdateRateMs: SETTINGS.live.general.state.eventUpdateRateMs,
      trainingWindowMs: SETTINGS.live.general.state.trainingWindowMs,
      trainingLockPolicy: SETTINGS.live.general.state.trainingLockPolicy,
    },
    skill: buildSkillRuntimeSnapshot(),
    monster: buildMonsterRuntimeSnapshot(),
    teammate: buildTeammateRuntimeSnapshot(),
    voice: buildVoiceRuntimeSnapshot(),
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
