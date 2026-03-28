import resonanceSkillIcons from "$lib/config/skill_aoyi_icons.json";
import classSkillConfigsRaw from "$lib/config/class_skill_configs.json";
import classResourcesRaw from "$lib/config/class_resources.json";
import classSpecialBuffDisplaysRaw from "$lib/config/class_special_buff_displays.json";
import counterRulesRaw from "$lib/config/counter_rules.json";
import resonanceSkillSearchTranslations from "$lib/translations/resonance-skill-search.json";
import { settings } from "$lib/settings-store";
import type { CounterAction, CounterTrigger } from "$lib/bindings";

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

type LocaleCode = "zh-CN" | "en" | "ja";
type MultiLangValue = Partial<Record<LocaleCode, string>>;
type MultiLangKeywords = Partial<Record<LocaleCode, string[]>>;

type ResonanceSkillSearchEntry = {
  name?: MultiLangValue;
  keywords?: MultiLangKeywords;
};

const RESONANCE_SKILL_SEARCH_TRANSLATIONS =
  resonanceSkillSearchTranslations as unknown as Record<string, ResonanceSkillSearchEntry>;

function normalizeSearchText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function collectMultiLangTexts(value: MultiLangValue | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const locale of ["zh-CN", "en", "ja"] as const) {
    const text = normalizeSearchText(value?.[locale]);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function collectKeywordTexts(value: MultiLangKeywords | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const locale of ["zh-CN", "en", "ja"] as const) {
    for (const keyword of value?.[locale] ?? []) {
      const text = normalizeSearchText(keyword);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

function getCurrentLocale(): LocaleCode {
  const locale = String(settings.state.live.general.language);

  if (locale === "en" || locale === "ja" || locale === "zh-CN") {
    return locale;
  }

  return "zh-CN";
}

function resolveMultiLangName(value: MultiLangValue | undefined, fallback: string): string {
  const locale = getCurrentLocale();
  const selected = value?.[locale]?.trim();
  if (selected) return selected;

  const zh = value?.["zh-CN"]?.trim();
  if (zh) return zh;

  return fallback;
}

function localizeResonanceSkill(skill: ResonanceSkillDefinition): ResonanceSkillDefinition {
  const entry = RESONANCE_SKILL_SEARCH_TRANSLATIONS[String(skill.skillId)];
  const displayName = resolveMultiLangName(entry?.name, skill.name);
  if (displayName === skill.name) return skill;
  return {
    ...skill,
    name: displayName,
  };
}

export type ResonanceSkillDefinition = SkillDisplayInfo;

function collectResonanceSearchTexts(skill: ResonanceSkillDefinition): string[] {
  const texts = new Set<string>();
  const entry = RESONANCE_SKILL_SEARCH_TRANSLATIONS[String(skill.skillId)];

  const rawName = normalizeSearchText(skill.name);
  if (rawName) texts.add(rawName);

  for (const text of collectMultiLangTexts(entry?.name)) {
    texts.add(text);
  }

  for (const text of collectKeywordTexts(entry?.keywords)) {
    texts.add(text);
  }

  return Array.from(texts);
}

export type CounterRulePreset = {
  ruleId: number;
  name: string;
  trigger: CounterTrigger;
  linkedBuffId: number;
  threshold: number | null;
  onBuffAdd: CounterAction;
  onBuffRemove: CounterAction;
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

export const COUNTER_RULES: CounterRulePreset[] = counterRulesRaw as CounterRulePreset[];

export function getClassConfigs(): ClassSkillConfig[] {
  return Object.values(CLASS_SKILL_CONFIGS);
}

export function getCounterRules(): CounterRulePreset[] {
  return COUNTER_RULES;
}

export function getSkillsByClass(classKey: string): SkillDefinition[] {
  return CLASS_SKILL_CONFIGS[classKey]?.skills ?? [];
}

export function getDurationSkillsByClass(classKey: string): SkillDefinition[] {
  return getSkillsByClass(classKey).filter((skill) => skill.effectDurationMs !== undefined);
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

export function findSpecialBuffDisplays(classKey: string): SpecialBuffDisplay[] {
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
  const skill = RESONANCE_SKILLS.find((item) => item.skillId === skillId);
  return skill ? localizeResonanceSkill(skill) : undefined;
}

export function searchResonanceSkills(
  keyword: string,
): ResonanceSkillDefinition[] {
  const normalized = normalizeSearchText(keyword);
  if (!normalized) return [];
  return RESONANCE_SKILLS
    .filter((skill) =>
      collectResonanceSearchTexts(skill).some((text) => text.includes(normalized)),
    )
    .map((skill) => localizeResonanceSkill(skill));
}

export function findAnySkillByBaseId(
  classKey: string,
  skillId: number,
): SkillDisplayInfo | undefined {
  return findSkillById(classKey, skillId) ?? findResonanceSkill(skillId);
}
