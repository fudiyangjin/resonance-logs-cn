import {
  ensureCounterVoiceConfigs,
  ensurePresetCounterVoiceConfigs,
  type CounterVoiceConfigMap,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import {
  ensureUserCounterRules,
  getCounterRules,
  resolveUserCounterRulesToPresets,
  type CounterEffectSlotPreset,
  type CounterRulePreset,
} from "$lib/skill-mappings";

export type ResolvedCounterVoiceRule = CounterRulePreset & {
  origin: "preset" | "user";
  voice: CounterVoiceConfigMap;
};

export function resolveCounterVoiceRules(
  profile: SkillMonitorProfile | null | undefined,
): ResolvedCounterVoiceRule[] {
  if (!profile) return [];

  const userRules = ensureUserCounterRules(profile.userCounterRules);
  const userRulesById = new Map(userRules.map((rule) => [rule.ruleId, rule]));
  const resolvedUsers = resolveUserCounterRulesToPresets(userRules).map(
    (rule): ResolvedCounterVoiceRule => ({
      ...rule,
      origin: "user",
      voice: ensureCounterVoiceConfigs(userRulesById.get(rule.ruleId)?.voice),
    }),
  );
  const userRuleIds = new Set(userRules.map((rule) => rule.ruleId));
  const presetConfigs = ensurePresetCounterVoiceConfigs(
    profile.presetCounterVoiceConfigs,
  );
  const presets = getCounterRules()
    .filter((rule) => !userRuleIds.has(rule.ruleId))
    .map(
      (rule): ResolvedCounterVoiceRule => ({
        ...rule,
        origin: "preset",
        voice: ensureCounterVoiceConfigs(presetConfigs[String(rule.ruleId)]),
      }),
    );

  return [...presets, ...resolvedUsers];
}

export function findCounterVoiceRule(
  profile: SkillMonitorProfile | null | undefined,
  ruleId: number,
): ResolvedCounterVoiceRule | undefined {
  return resolveCounterVoiceRules(profile).find(
    (rule) => rule.ruleId === ruleId,
  );
}

export function findCounterVoiceSlot(
  rule: ResolvedCounterVoiceRule,
  slotId: number,
): CounterEffectSlotPreset | undefined {
  return rule.effectSlots.find((slot) => slot.slotId === slotId);
}

export function counterSlotSupportsThreshold(
  slot: CounterEffectSlotPreset,
): boolean {
  return slot.threshold !== null;
}

export function counterSlotSupportsExpiry(
  slot: CounterEffectSlotPreset,
): boolean {
  return Boolean(
    (slot.freezeDurationMs !== undefined && slot.freezeDurationMs > 0) ||
      (slot.dungeonStartFreezeMs !== undefined &&
        slot.dungeonStartFreezeMs > 0) ||
      (slot.altFreeze !== undefined && slot.altFreeze.freezeDurationMs > 0),
  );
}

export function counterSlotLabel(
  rule: ResolvedCounterVoiceRule,
  slotId: number,
): string {
  return rule.effectSlots.length > 1 ? `${rule.name} #${slotId}` : rule.name;
}

export function getEnabledCounterVoiceRuleIds(
  profile: SkillMonitorProfile | null | undefined,
): number[] {
  return resolveCounterVoiceRules(profile)
    .filter((rule) =>
      rule.effectSlots.some((slot) => {
        const config = rule.voice[String(slot.slotId)];
        return Boolean(
          (counterSlotSupportsThreshold(slot) && config?.threshold?.enabled) ||
            (counterSlotSupportsExpiry(slot) && config?.expiring?.enabled),
        );
      }),
    )
    .map((rule) => rule.ruleId)
    .sort((a, b) => a - b);
}
