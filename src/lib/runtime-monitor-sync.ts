import {
  commands,
  type CounterRule,
  type MonitorRuntimeSnapshot,
  type VoiceRuntimeSnapshot,
} from "$lib/bindings";
import { buildConfiguredBuffPlan } from "$lib/buff-monitor-plan";
import { buffCompositeSpecs, ensureBuffComposites } from "$lib/buff-composites";
import { expandBuffSelection } from "$lib/config/buff-name-table";
import { activeProfile as getActiveProfile } from "$lib/skill-monitor-profile.svelte.js";
import { ensureEntityDurationEntries } from "$lib/entity-duration-entries";
import { ensureMonsterSkillEntries } from "$lib/monster-skill-entries";
import { SETTINGS, normalizeTeammateCdSkills } from "$lib/settings-store";
import {
  getClassConfigs,
  getCounterRules,
  getSeasonCultivateFactorTemplates,
  resolveUserCounterRulesToPresets,
} from "$lib/skill-mappings";
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
  // A custom-panel counter row counts its reset buff down from the published
  // buffs, so subscribe it; publication never implies display.
  const counterResetBuffIds = enabledCounterRules
    .filter((rule) => inlineCounterRuleIds.includes(rule.ruleId))
    .flatMap((rule) => rule.effectSlots.map((slot) => slot.resetBuffId))
    .filter((buffId) => buffId > 0);
  const mergedBuffIds = uniqueSortedNumbers([
    ...buffPlan.publishedIds,
    ...counterResetBuffIds,
  ]);
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
    buffTimelineIds: [...buffPlan.timelineIds],
  };
}

function buildMonsterRuntimeSnapshot(): MonitorRuntimeSnapshot["monster"] {
  const enabled = SETTINGS.monsterMonitor.state.enabled;
  // Entity voice bindings speak whether or not the monster HUD is on, so the
  // watch list always goes down; the backend hides the HUD tracks itself.
  const watchedEntities = ensureEntityDurationEntries(
    SETTINGS.monsterMonitor.state.entityDurationEntries,
  )
    .map((entry) => ({
      monsterId: entry.monsterId,
      durationMs: entry.durationMs ?? null,
      scope: entry.scope,
      merge: entry.merge === true,
    }))
    .sort((a, b) => a.monsterId - b.monsterId);
  // Same as the entity watch list: monster skill voice does not follow the
  // HUD toggle.
  const watchedSkillIds = uniqueSortedNumbers(
    ensureMonsterSkillEntries(
      SETTINGS.monsterMonitor.state.monsterSkillEntries,
    ).map((entry) => entry.skillId),
  );
  if (!enabled) {
    return {
      enabled: false,
      globalIds: [],
      selfAppliedIds: [],
      monitorAllSelfApplied: false,
      watchedEntities,
      watchedSkillIds,
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
    watchedEntities,
    watchedSkillIds,
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

/**
 * Teammates share every cooldown; this selection (per class, in display
 * order) is what the backend publishes to the teammate CD panel.
 */
function buildTeammateCdRuntimeSnapshot(): MonitorRuntimeSnapshot["teammateCd"] {
  const state = SETTINGS.monsterMonitor.state;
  const visible =
    state.enabled && (state.overlayVisibility?.showTeammateCdPanel ?? false);
  if (!visible) return { enabled: false, classes: [] };

  const selection = normalizeTeammateCdSkills(state.teammateCdSkills);
  const classes = getClassConfigs()
    .map((config) => ({
      classId: config.classId,
      skillIds: selection[config.classKey] ?? [],
    }))
    .filter((entry) => entry.skillIds.length > 0)
    .sort((a, b) => a.classId - b.classId);
  return { enabled: classes.length > 0, classes };
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
    teammateCd: buildTeammateCdRuntimeSnapshot(),
    buffComposites: buffCompositeSpecs(
      ensureBuffComposites(SETTINGS.skillMonitor.state.buffComposites),
    ),
  };
}

export function createMonitorRuntimeSnapshotSignature(
  snapshot: MonitorRuntimeSnapshot,
): string {
  return JSON.stringify(snapshot);
}

/**
 * Voice rules travel on their own IPC lane so a volume tweak never
 * re-applies the whole monitor snapshot; see `$lib/voice/sync.svelte.ts`.
 */
export async function saveAndApplyVoiceRuntimeSnapshot(
  snapshot: VoiceRuntimeSnapshot,
): Promise<void> {
  const result = await commands.saveAndApplyVoiceRuntimeSnapshot(snapshot);
  if (result.status === "error") {
    throw new Error(String(result.error));
  }
}

export async function saveAndApplyMonitorRuntimeSnapshot(
  snapshot: MonitorRuntimeSnapshot,
): Promise<void> {
  const result = await commands.saveAndApplyMonitorRuntimeSnapshot(snapshot);
  if (result.status === "error") {
    throw new Error(String(result.error));
  }
}
