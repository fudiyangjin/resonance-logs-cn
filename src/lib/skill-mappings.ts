import resonanceSkillIcons from "$lib/config/skill_aoyi_icons.json";
import classSkillConfigsRaw from "$lib/config/class_skill_configs.json";
import classResourcesRaw from "$lib/config/class_resources.json";
import classSpecialBuffDisplaysRaw from "$lib/config/class_special_buff_displays.json";
import counterRulesRaw from "$lib/config/counter_rules.json";
import counterSourceTemplatesRaw from "$lib/config/counter_source_templates.json";
import counterSlotTemplatesRaw from "$lib/config/counter_slot_templates.json";
import type { CounterAction, CounterSource } from "$lib/bindings";
import type { UserCounterRule } from "$lib/settings-store";

export type SkillDisplayInfo = {
  skillId: number;
  name: string;
  imagePath: string;
  maxCharges?: number;
  maxValidCdTime?: number;
  effectDurationMs?: number;
  resourceRequirement?: ResourceRequirement;
};

export type SkillDefinition = SkillDisplayInfo;

export type ClassSkillConfig = {
  classKey: string;
  className: string;
  classId: number;
  skills: SkillDefinition[];
  derivations?: SkillDerivation[];
  defaultMonitoredBuffIds?: number[];
};

export type ResourceDefinition = {
  type: "bar" | "charges";
  label: string;
  currentIndex: number;
  maxIndex: number;
  imageOn: string;
  imageOff: string;
  buffBaseId?: number;
  buffBaseIds?: number[];
};

export type SpecialBuffDisplay = {
  buffBaseId: number;
  layerImages: string[][];
};

export type ResourceRequirement = {
  resourceIndex: number;
  amount: number;
};

type ResonanceSkillIconRaw = {
  id: number;
  NameDesign: string;
  Icon: string;
  maxCharges?: number;
  maxValidCdTime?: number;
};

export type ResonanceSkillDefinition = SkillDisplayInfo;

export type CounterRulePreset = {
  ruleId: number;
  name: string;
  sources: CounterSource[];
  effectSlots: CounterEffectSlotPreset[];
};

export type CounterEffectSlotPreset = {
  slotId: number;
  threshold: number | null;
  resetBuffId: number;
  onBuffAdd: CounterAction;
  onBuffChange: CounterAction;
  onBuffRemove: CounterAction;
  freezeDurationMs?: number;
  onFreezeExpire?: CounterAction;
};

export type SourceTemplate = {
  sourceId: string;
  name: string;
  description: string;
  source: CounterSource;
};

export type SlotTemplate = {
  slotTemplateId: string;
  name: string;
  description: string;
  slot: Omit<CounterEffectSlotPreset, "slotId">;
};

export const CLASS_RESOURCES: Record<string, ResourceDefinition[]> =
  classResourcesRaw as Record<string, ResourceDefinition[]>;

export const CLASS_SPECIAL_BUFF_DISPLAYS: Record<string, SpecialBuffDisplay[]> =
  classSpecialBuffDisplaysRaw as Record<string, SpecialBuffDisplay[]>;

export const CLASS_SKILL_CONFIGS: Record<string, ClassSkillConfig> =
  classSkillConfigsRaw as Record<string, ClassSkillConfig>;

export type SkillDerivation = {
  sourceSkillId: number;
  derivedSkillId: number;
  triggerBuffBaseId: number;
  derivedName: string;
  derivedImagePath: string;
  keepCdWhenDerived?: boolean;
};

export const RESONANCE_SKILLS: ResonanceSkillDefinition[] = (
  resonanceSkillIcons as ResonanceSkillIconRaw[]
).map((skill) => ({
  skillId: skill.id,
  name: skill.NameDesign,
  imagePath: `/images/resonance_skill/${skill.Icon}`,
  ...(skill.maxCharges !== undefined ? { maxCharges: skill.maxCharges } : {}),
  ...(skill.maxValidCdTime !== undefined
    ? { maxValidCdTime: skill.maxValidCdTime }
    : {}),
}));

export const COUNTER_RULES: CounterRulePreset[] =
  counterRulesRaw as CounterRulePreset[];
export const SOURCE_TEMPLATES: SourceTemplate[] =
  counterSourceTemplatesRaw as SourceTemplate[];
export const SLOT_TEMPLATES: SlotTemplate[] =
  counterSlotTemplatesRaw as SlotTemplate[];

export function getClassConfigs(): ClassSkillConfig[] {
  return Object.values(CLASS_SKILL_CONFIGS);
}

export function getCounterRules(): CounterRulePreset[] {
  return COUNTER_RULES;
}

export function getSourceTemplates(): SourceTemplate[] {
  return SOURCE_TEMPLATES;
}

export function getSlotTemplates(): SlotTemplate[] {
  return SLOT_TEMPLATES;
}

export function resolveCounterSources(sourceRefs: string[]): CounterSource[] {
  const templateMap = new Map(
    SOURCE_TEMPLATES.map((item) => [item.sourceId, item]),
  );
  return sourceRefs.flatMap((ref) => {
    const item = templateMap.get(ref);
    return item ? [item.source] : [];
  });
}

export function resolveCounterEffectSlots(
  slotRefs: string[],
): CounterEffectSlotPreset[] {
  const templateMap = new Map(
    SLOT_TEMPLATES.map((item) => [item.slotTemplateId, item]),
  );
  return slotRefs.flatMap((ref, idx) => {
    const item = templateMap.get(ref);
    return item
      ? [
          {
            slotId: idx + 1,
            threshold: item.slot.threshold,
            resetBuffId: item.slot.resetBuffId,
            onBuffAdd: item.slot.onBuffAdd,
            onBuffChange: item.slot.onBuffChange,
            onBuffRemove: item.slot.onBuffRemove,
            ...(item.slot.freezeDurationMs !== undefined
              ? { freezeDurationMs: item.slot.freezeDurationMs }
              : {}),
            ...(item.slot.onFreezeExpire !== undefined
              ? { onFreezeExpire: item.slot.onFreezeExpire }
              : {}),
          },
        ]
      : [];
  });
}

export function ensureUserCounterRules(
  rules: UserCounterRule[] | undefined,
): UserCounterRule[] {
  return (rules ?? []).map((rule, idx) => ({
    ruleId: Number.isInteger(rule.ruleId) ? rule.ruleId : 10001 + idx,
    name: rule.name?.trim() || `自定义计数器 ${idx + 1}`,
    sourceRefs: Array.from(
      new Set(
        (rule.sourceRefs ?? []).filter(
          (item) => typeof item === "string" && item.trim(),
        ),
      ),
    ),
    slotRefs: Array.from(
      new Set(
        (rule.slotRefs ?? []).filter(
          (item) => typeof item === "string" && item.trim(),
        ),
      ),
    ),
  }));
}

export function resolveUserCounterRulesToPresets(
  rules: UserCounterRule[] | undefined,
): CounterRulePreset[] {
  return ensureUserCounterRules(rules).flatMap((rule) => {
    const sources = resolveCounterSources(rule.sourceRefs);
    const effectSlots = resolveCounterEffectSlots(rule.slotRefs);
    if (sources.length === 0 || effectSlots.length === 0) {
      return [];
    }
    return [
      {
        ruleId: rule.ruleId,
        name: rule.name,
        sources,
        effectSlots,
      },
    ];
  });
}

export function getSkillsByClass(classKey: string): SkillDefinition[] {
  return CLASS_SKILL_CONFIGS[classKey]?.skills ?? [];
}

export function getDurationSkillsByClass(classKey: string): SkillDefinition[] {
  return getSkillsByClass(classKey).filter(
    (skill) => skill.effectDurationMs !== undefined,
  );
}

export function findSkillById(
  classKey: string,
  skillId: number,
): SkillDefinition | undefined {
  return CLASS_SKILL_CONFIGS[classKey]?.skills.find(
    (skill) => skill.skillId === skillId,
  );
}

export function findResourcesByClass(classKey: string): ResourceDefinition[] {
  return CLASS_RESOURCES[classKey] || [];
}

export function findSpecialBuffDisplays(
  classKey: string,
): SpecialBuffDisplay[] {
  return CLASS_SPECIAL_BUFF_DISPLAYS[classKey] ?? [];
}

export function getDefaultMonitoredBuffIds(classKey: string): number[] {
  return CLASS_SKILL_CONFIGS[classKey]?.defaultMonitoredBuffIds ?? [];
}

export function findSkillDerivationBySource(
  classKey: string,
  sourceSkillId: number,
): SkillDerivation | undefined {
  return CLASS_SKILL_CONFIGS[classKey]?.derivations?.find(
    (derivation) => derivation.sourceSkillId === sourceSkillId,
  );
}

export function findResonanceSkill(
  skillId: number,
): ResonanceSkillDefinition | undefined {
  return RESONANCE_SKILLS.find((skill) => skill.skillId === skillId);
}

export function searchResonanceSkills(
  keyword: string,
): ResonanceSkillDefinition[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  return RESONANCE_SKILLS.filter((skill) =>
    skill.name.toLowerCase().includes(normalized),
  );
}

export function findAnySkillByBaseId(
  classKey: string,
  skillId: number,
): SkillDisplayInfo | undefined {
  return findSkillById(classKey, skillId) ?? findResonanceSkill(skillId);
}
