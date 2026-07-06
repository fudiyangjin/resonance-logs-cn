import resonanceSkillIconsRaw from "$lib/config/skill_aoyi_icons.json";
import classSkillConfigsRaw from "$lib/config/class_skill_configs.json";
import classResourcesRaw from "$lib/config/class_resources.json";
import classSpecialBuffDisplaysRaw from "$lib/config/class_special_buff_displays.json";
import counterRulesRaw from "$lib/config/counter_rules.json";
import counterSourceTemplatesRaw from "$lib/config/counter_source_templates.json";
import counterSlotTemplatesRaw from "$lib/config/counter_slot_templates.json";
import seasonCultivateFactorCostsRaw from "$lib/config/season_cultivate_factor_costs.json";
import type {
  CounterAction,
  CounterSource,
  FactorCounterTemplate,
  ResetBuffTarget,
} from "$lib/bindings";
import { getLocale, type AppLocale } from "$lib/i18n/index.svelte";
import { APP_LOCALES } from "$lib/i18n/locales";
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
  currentId: number;
  maxId: number;
  imageOn: string;
  imageOff: string;
  buffBaseId?: number;
  buffBaseIds?: number[];
  compactAbove?: number;
  compactMultiplierPrefix?: string;
};

export type SpecialBuffDisplay = {
  buffBaseId: number;
  layerImages?: string[][];
  digitImages?: string[];
  displayStyle?: "woodCounter";
};

export type ResourceRequirement = {
  resourceId: number;
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

export type CounterSlotDisplayMode =
  | "raw"
  | "rawWithThreshold"
  | "remainingToThreshold"
  | "percentOfThreshold";

export type AttrModifierPreset = {
  attrId: number;
  basisPointsPerUnit?: number;
  maxReductionBasisPoints: number;
};

export type CounterEffectSlotPreset = {
  slotId: number;
  threshold: number | null;
  resetBuffId: number;
  resetSourceConfigId?: number;
  resetBuffTarget?: ResetBuffTarget;
  onBuffAdd: CounterAction;
  onBuffChange: CounterAction;
  onBuffRemove: CounterAction;
  freezeDurationMs?: number;
  dungeonStartFreezeMs?: number;
  onFreezeExpire?: CounterAction;
  altFreeze?: { conditionBuffId: number; freezeDurationMs: number };
  thresholdModifier?: AttrModifierPreset;
  freezeDurationModifier?: AttrModifierPreset;
  resetSkillKeys?: number[];
  onResetSkill?: CounterAction;
  displayMode?: CounterSlotDisplayMode;
};

export type CounterSourceInput = CounterSource | CounterSource[];

export type SourceTemplate = {
  sourceId: string;
  itemIds: number[];
  name: string;
  description: string;
  source: CounterSourceInput;
};

export type SlotTemplate = {
  slotTemplateId: string;
  itemIds: number[];
  effectBuffIds?: number[];
  name: string;
  description: string;
  slot: Omit<CounterEffectSlotPreset, "slotId">;
};

export type CounterDisplayLabelInput = {
  sourceId: number;
  counterSlotId?: number | undefined;
  label?: string | null | undefined;
  ruleName?: string | null | undefined;
};

type ClassSkillConfigOverride = Partial<ClassSkillConfig> & {
  classKey?: string;
  skills?: Array<Partial<SkillDefinition> & { skillId?: number }>;
  derivations?: Array<Partial<SkillDerivation>>;
};

type ResourceOverride = Partial<ResourceDefinition>;
type CounterRuleOverride = Partial<CounterRulePreset> & { ruleId?: number };
type SourceTemplateOverride = Partial<SourceTemplate> & { sourceId?: string };
type SlotTemplateOverride = Partial<SlotTemplate> & {
  slotTemplateId?: string;
};
type ResonanceSkillIconOverride = Partial<ResonanceSkillIconRaw> & {
  id?: number;
};

export const FACTOR_RULE_ID_BASE = 900_000_000;

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

const RESONANCE_SKILL_ICONS =
  resonanceSkillIconsRaw as ResonanceSkillIconRaw[];

export const RESONANCE_SKILLS: ResonanceSkillDefinition[] =
  buildResonanceSkills(RESONANCE_SKILL_ICONS, new Map());

export const COUNTER_RULES: CounterRulePreset[] =
  counterRulesRaw as CounterRulePreset[];
export const SOURCE_TEMPLATES: SourceTemplate[] =
  counterSourceTemplatesRaw as SourceTemplate[];
export const SLOT_TEMPLATES: SlotTemplate[] =
  counterSlotTemplatesRaw as SlotTemplate[];
export const SEASON_CULTIVATE_FACTOR_COSTS: Record<string, number> =
  seasonCultivateFactorCostsRaw as Record<string, number>;

const LOCALE_CONFIG_MODULES = import.meta.glob("./config/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const CLASS_CONFIGS_BY_LOCALE = new Map<
  AppLocale,
  Record<string, ClassSkillConfig>
>();
const CLASS_RESOURCES_BY_LOCALE = new Map<
  AppLocale,
  Record<string, ResourceDefinition[]>
>();
const COUNTER_RULES_BY_LOCALE = new Map<AppLocale, CounterRulePreset[]>();
const SOURCE_TEMPLATES_BY_LOCALE = new Map<AppLocale, SourceTemplate[]>();
const SLOT_TEMPLATES_BY_LOCALE = new Map<AppLocale, SlotTemplate[]>();
const RESONANCE_SKILLS_BY_LOCALE = new Map<
  AppLocale,
  ResonanceSkillDefinition[]
>();

function getLocaleConfig<T>(locale: AppLocale, fileName: string): T | null {
  const config = LOCALE_CONFIG_MODULES[`./config/${locale}/${fileName}`];
  return config === undefined ? null : (config as T);
}

function normalizeDisplayText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function localizedText(value: unknown, fallback: string): string {
  return normalizeDisplayText(value) ?? fallback;
}

function numberKey(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringKey(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function valuesFromMaybeRecord<T>(
  value: unknown,
  getKey: (item: T, recordKey?: string) => string | null,
): Map<string, T> {
  const map = new Map<string, T>();
  if (Array.isArray(value)) {
    for (const item of value as T[]) {
      const key = getKey(item);
      if (key) map.set(key, item);
    }
    return map;
  }

  if (!value || typeof value !== "object") return map;
  for (const [recordKey, item] of Object.entries(value)) {
    if (!item || typeof item !== "object") continue;
    const typedItem = item as T;
    const key = getKey(typedItem, recordKey);
    if (key) map.set(key, typedItem);
  }
  return map;
}

function mapByNumber<T>(
  items: readonly T[] | undefined,
  getKey: (item: T) => number | null,
): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items ?? []) {
    const key = getKey(item);
    if (key !== null) map.set(key, item);
  }
  return map;
}

function derivationKey(
  item: Pick<
    Partial<SkillDerivation>,
    "sourceSkillId" | "derivedSkillId" | "triggerBuffBaseId"
  >,
): string | null {
  const sourceSkillId = numberKey(item.sourceSkillId);
  const derivedSkillId = numberKey(item.derivedSkillId);
  const triggerBuffBaseId = numberKey(item.triggerBuffBaseId);
  if (
    sourceSkillId === null ||
    derivedSkillId === null ||
    triggerBuffBaseId === null
  ) {
    return null;
  }
  return `${sourceSkillId}:${derivedSkillId}:${triggerBuffBaseId}`;
}

function resourceKey(
  item: Pick<
    Partial<ResourceDefinition>,
    "type" | "currentId" | "maxId"
  >,
): string | null {
  const type = item.type === "bar" || item.type === "charges" ? item.type : null;
  const currentId = numberKey(item.currentId);
  const maxId = numberKey(item.maxId);
  if (!type || currentId === null || maxId === null) return null;
  return `${type}:${currentId}:${maxId}`;
}

function counterRuleSlotLabel(
  rule: CounterRulePreset | undefined,
  slotId?: number,
): string | null {
  if (!rule) return null;
  if (slotId === undefined) return rule.name;
  return `${rule.name} #${slotId}`;
}

function counterRuleNameSlotLabel(
  ruleName: string | null | undefined,
  slotId?: number,
): string | null {
  const normalized = normalizeDisplayText(ruleName);
  if (!normalized) return null;
  if (slotId === undefined) return normalized;
  return `${normalized} #${slotId}`;
}

function isCounterDefaultLabel(
  label: string,
  sourceId: number,
  counterSlotId?: number,
): boolean {
  const canonicalRule = COUNTER_RULES.find((rule) => rule.ruleId === sourceId);
  if (label === counterRuleSlotLabel(canonicalRule, counterSlotId)) return true;

  return APP_LOCALES.some((locale) => {
    const localizedRule = findCounterRule(sourceId, locale);
    return label === counterRuleSlotLabel(localizedRule, counterSlotId);
  });
}

function getClassConfigOverrides(
  locale: AppLocale,
): Map<string, ClassSkillConfigOverride> {
  return valuesFromMaybeRecord<ClassSkillConfigOverride>(
    getLocaleConfig(locale, "class_skill_configs.json"),
    (item, recordKey) => stringKey(item.classKey) ?? recordKey ?? null,
  );
}

function getClassResourceOverrides(
  locale: AppLocale,
): Map<string, ResourceOverride[]> {
  const config = getLocaleConfig(locale, "class_resources.json");
  const map = new Map<string, ResourceOverride[]>();
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return map;
  }
  for (const [classKey, resources] of Object.entries(config)) {
    if (Array.isArray(resources)) {
      map.set(classKey, resources as ResourceOverride[]);
    }
  }
  return map;
}

function getCounterRuleOverrides(
  locale: AppLocale,
): Map<number, CounterRuleOverride> {
  const overrides = valuesFromMaybeRecord<CounterRuleOverride>(
    getLocaleConfig(locale, "counter_rules.json"),
    (item, recordKey) => {
      const id = numberKey(item.ruleId);
      if (id !== null) return String(id);
      const recordId = Number(recordKey);
      return Number.isFinite(recordId) ? String(recordId) : null;
    },
  );
  return new Map(
    [...overrides.entries()]
      .map(([key, value]) => [Number(key), value] as const)
      .filter(([key]) => Number.isFinite(key)),
  );
}

function getSourceTemplateOverrides(
  locale: AppLocale,
): Map<string, SourceTemplateOverride> {
  return valuesFromMaybeRecord<SourceTemplateOverride>(
    getLocaleConfig(locale, "counter_source_templates.json"),
    (item) => stringKey(item.sourceId),
  );
}

function getSlotTemplateOverrides(
  locale: AppLocale,
): Map<string, SlotTemplateOverride> {
  return valuesFromMaybeRecord<SlotTemplateOverride>(
    getLocaleConfig(locale, "counter_slot_templates.json"),
    (item) => stringKey(item.slotTemplateId),
  );
}

function getResonanceSkillOverrides(
  locale: AppLocale,
): Map<number, ResonanceSkillIconOverride> {
  return mapByNumber(
    getLocaleConfig<ResonanceSkillIconOverride[]>(
      locale,
      "skill_aoyi_icons.json",
    ) ?? [],
    (item) => numberKey(item.id),
  );
}

function buildLocalizedClassConfig(
  config: ClassSkillConfig,
  override: ClassSkillConfigOverride | undefined,
): ClassSkillConfig {
  const skillOverrides = mapByNumber(override?.skills, (item) =>
    numberKey(item.skillId),
  );
  const derivationOverrides = new Map<string, Partial<SkillDerivation>>();
  for (const item of override?.derivations ?? []) {
    const key = derivationKey(item);
    if (key) derivationOverrides.set(key, item);
  }

  return {
    ...config,
    className: localizedText(override?.className, config.className),
    skills: config.skills.map((skill) => ({
      ...skill,
      name: localizedText(skillOverrides.get(skill.skillId)?.name, skill.name),
    })),
    ...(config.derivations
      ? {
          derivations: config.derivations.map((derivation) => {
            const key = derivationKey(derivation);
            const localized = key ? derivationOverrides.get(key) : undefined;
            return {
              ...derivation,
              derivedName: localizedText(
                localized?.derivedName,
                derivation.derivedName,
              ),
            };
          }),
        }
      : {}),
  };
}

function getClassConfigMap(locale = getLocale()): Record<string, ClassSkillConfig> {
  const cached = CLASS_CONFIGS_BY_LOCALE.get(locale);
  if (cached) return cached;

  const overrides = getClassConfigOverrides(locale);
  const localized: Record<string, ClassSkillConfig> = {};
  for (const [classKey, config] of Object.entries(CLASS_SKILL_CONFIGS)) {
    localized[classKey] = buildLocalizedClassConfig(
      config,
      overrides.get(classKey),
    );
  }
  CLASS_CONFIGS_BY_LOCALE.set(locale, localized);
  return localized;
}

function getClassResourceMap(
  locale = getLocale(),
): Record<string, ResourceDefinition[]> {
  const cached = CLASS_RESOURCES_BY_LOCALE.get(locale);
  if (cached) return cached;

  const overrides = getClassResourceOverrides(locale);
  const localized: Record<string, ResourceDefinition[]> = {};
  for (const [classKey, resources] of Object.entries(CLASS_RESOURCES)) {
    const localizedByKey = new Map<string, ResourceOverride>();
    for (const resource of overrides.get(classKey) ?? []) {
      const key = resourceKey(resource);
      if (key) localizedByKey.set(key, resource);
    }
    localized[classKey] = resources.map((resource) => {
      const key = resourceKey(resource);
      const override = key ? localizedByKey.get(key) : undefined;
      return {
        ...resource,
        label: localizedText(override?.label, resource.label),
      };
    });
  }
  CLASS_RESOURCES_BY_LOCALE.set(locale, localized);
  return localized;
}

function getResonanceSkills(locale = getLocale()): ResonanceSkillDefinition[] {
  const cached = RESONANCE_SKILLS_BY_LOCALE.get(locale);
  if (cached) return cached;

  const localized = buildResonanceSkills(
    RESONANCE_SKILL_ICONS,
    getResonanceSkillOverrides(locale),
  );
  RESONANCE_SKILLS_BY_LOCALE.set(locale, localized);
  return localized;
}

function buildResonanceSkills(
  skills: ResonanceSkillIconRaw[],
  overrides: Map<number, ResonanceSkillIconOverride>,
): ResonanceSkillDefinition[] {
  return skills.map((skill) => {
    const override = overrides.get(skill.id);
    return {
      skillId: skill.id,
      name: localizedText(override?.NameDesign, skill.NameDesign),
      imagePath: `/images/resonance_skill/${skill.Icon}`,
      ...(skill.maxCharges !== undefined
        ? { maxCharges: skill.maxCharges }
        : {}),
      ...(skill.maxValidCdTime !== undefined
        ? { maxValidCdTime: skill.maxValidCdTime }
        : {}),
    };
  });
}

export function getClassConfigs(locale = getLocale()): ClassSkillConfig[] {
  return Object.values(getClassConfigMap(locale));
}

export function getCounterRules(locale = getLocale()): CounterRulePreset[] {
  const cached = COUNTER_RULES_BY_LOCALE.get(locale);
  if (cached) return cached;

  const overrides = getCounterRuleOverrides(locale);
  const localized = COUNTER_RULES.map((rule) => ({
    ...rule,
    name: localizedText(overrides.get(rule.ruleId)?.name, rule.name),
  }));
  COUNTER_RULES_BY_LOCALE.set(locale, localized);
  return localized;
}

export function findCounterRule(
  ruleId: number,
  locale = getLocale(),
): CounterRulePreset | undefined {
  return getCounterRules(locale).find((rule) => rule.ruleId === ruleId);
}

export function getCounterDisplayLabel(
  entry: CounterDisplayLabelInput,
  locale = getLocale(),
): string {
  const localizedRule = findCounterRule(entry.sourceId, locale);
  const localizedDefault =
    counterRuleNameSlotLabel(entry.ruleName, entry.counterSlotId) ??
    counterRuleSlotLabel(localizedRule, entry.counterSlotId) ??
    `#${entry.sourceId}`;
  const savedLabel = normalizeDisplayText(entry.label);
  if (
    !savedLabel ||
    isCounterDefaultLabel(savedLabel, entry.sourceId, entry.counterSlotId)
  ) {
    return localizedDefault;
  }
  return savedLabel;
}

export function getSourceTemplates(locale = getLocale()): SourceTemplate[] {
  const cached = SOURCE_TEMPLATES_BY_LOCALE.get(locale);
  if (cached) return cached;

  const overrides = getSourceTemplateOverrides(locale);
  const localized = SOURCE_TEMPLATES.map((template) => {
    const override = overrides.get(template.sourceId);
    return {
      ...template,
      name: localizedText(override?.name, template.name),
      description: localizedText(
        override?.description,
        template.description,
      ),
    };
  });
  SOURCE_TEMPLATES_BY_LOCALE.set(locale, localized);
  return localized;
}

export function getSlotTemplates(locale = getLocale()): SlotTemplate[] {
  const cached = SLOT_TEMPLATES_BY_LOCALE.get(locale);
  if (cached) return cached;

  const overrides = getSlotTemplateOverrides(locale);
  const localized = SLOT_TEMPLATES.map((template) => {
    const override = overrides.get(template.slotTemplateId);
    return {
      ...template,
      name: localizedText(override?.name, template.name),
      description: localizedText(
        override?.description,
        template.description,
      ),
    };
  });
  SLOT_TEMPLATES_BY_LOCALE.set(locale, localized);
  return localized;
}

export function getSeasonCultivateFactorRuleId(itemId: number): number {
  return FACTOR_RULE_ID_BASE + itemId;
}

function normalizeTemplateItemIds(item: { itemIds: number[] }): number[] {
  return Array.from(
    new Set(
      item.itemIds.filter(
        (itemId) => Number.isInteger(itemId) && itemId > 0,
      ),
    ),
  ).sort((left, right) => left - right);
}

function normalizeTemplateEffectBuffIds(item: {
  effectBuffIds?: number[];
}): number[] {
  const result: number[] = [];
  const seen = new Set<number>();
  for (const buffId of item.effectBuffIds ?? []) {
    if (!Number.isInteger(buffId) || buffId <= 0 || seen.has(buffId)) continue;
    seen.add(buffId);
    result.push(buffId);
  }
  return result;
}

function resolveSourceTemplateSources(template: SourceTemplate): CounterSource[] {
  return Array.isArray(template.source) ? template.source : [template.source];
}

function getSeasonCultivateFactorCost(itemId: number): number | null {
  const value = SEASON_CULTIVATE_FACTOR_COSTS[String(itemId)];
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function resolveSeasonCultivateFactorEffectSlots(
  template: SlotTemplate,
  itemId: number,
): CounterEffectSlotPreset[] {
  return resolveCounterEffectSlots([template.slotTemplateId]).map((slot) => ({
    ...slot,
    threshold: getSeasonCultivateFactorCost(itemId) ?? slot.threshold,
    displayMode: "rawWithThreshold",
  }));
}

export function getSeasonCultivateFactorTemplates(): FactorCounterTemplate[] {
  return [
    ...SOURCE_TEMPLATES.map((template) => ({
      itemIds: normalizeTemplateItemIds(template),
      sources: resolveSourceTemplateSources(template),
      effectSlots: [],
    })),
    ...SLOT_TEMPLATES.flatMap((template) =>
      normalizeTemplateItemIds(template).map((itemId) => ({
        itemIds: [itemId],
        sources: [],
        effectSlots: resolveSeasonCultivateFactorEffectSlots(
          template,
          itemId,
        ).map(({ displayMode: _displayMode, ...slot }) => slot),
      })),
    ),
  ];
}

export function getSeasonCultivateFactorRuleMap(
  locale = getLocale(),
): Map<number, CounterRulePreset> {
  const map = new Map<number, CounterRulePreset>();
  for (const template of getSlotTemplates(locale)) {
    const itemIds = normalizeTemplateItemIds(template);
    for (const itemId of itemIds) {
      map.set(getSeasonCultivateFactorRuleId(itemId), {
        ruleId: getSeasonCultivateFactorRuleId(itemId),
        name: template.name,
        sources: [],
        effectSlots: resolveSeasonCultivateFactorEffectSlots(template, itemId),
      });
    }
  }
  return map;
}

export function getSeasonCultivateFactorItemSlotTemplateMap(): Map<
  number,
  string
> {
  const map = new Map<number, string>();
  for (const template of SLOT_TEMPLATES) {
    for (const itemId of normalizeTemplateItemIds(template)) {
      map.set(itemId, template.slotTemplateId);
    }
  }
  return map;
}

export function getSeasonCultivateFactorEffectBuffIdMap(): Map<
  number,
  number[]
> {
  const map = new Map<number, number[]>();
  for (const template of SLOT_TEMPLATES) {
    const effectBuffIds = normalizeTemplateEffectBuffIds(template);
    if (effectBuffIds.length === 0) continue;
    for (const itemId of normalizeTemplateItemIds(template)) {
      map.set(itemId, effectBuffIds);
    }
  }
  return map;
}

export function getSeasonCultivateFactorConfiguredEffectBuffIds(): number[] {
  return Array.from(
    new Set(
      SLOT_TEMPLATES.flatMap((template) =>
        normalizeTemplateEffectBuffIds(template),
      ),
    ),
  ).sort((left, right) => left - right);
}

export function resolveCounterSources(sourceRefs: string[]): CounterSource[] {
  const templateMap = new Map(
    SOURCE_TEMPLATES.map((item) => [item.sourceId, item]),
  );
  return sourceRefs.flatMap((ref) => {
    const item = templateMap.get(ref);
    return item ? resolveSourceTemplateSources(item) : [];
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
            ...(item.slot.resetSourceConfigId !== undefined
              ? { resetSourceConfigId: item.slot.resetSourceConfigId }
              : {}),
            ...(item.slot.resetBuffTarget !== undefined
              ? { resetBuffTarget: item.slot.resetBuffTarget }
              : {}),
            onBuffAdd: item.slot.onBuffAdd,
            onBuffChange: item.slot.onBuffChange,
            onBuffRemove: item.slot.onBuffRemove,
            ...(item.slot.freezeDurationMs !== undefined
              ? { freezeDurationMs: item.slot.freezeDurationMs }
              : {}),
            ...(item.slot.dungeonStartFreezeMs !== undefined
              ? { dungeonStartFreezeMs: item.slot.dungeonStartFreezeMs }
              : {}),
            ...(item.slot.onFreezeExpire !== undefined
              ? { onFreezeExpire: item.slot.onFreezeExpire }
              : {}),
            ...(item.slot.altFreeze !== undefined
              ? { altFreeze: item.slot.altFreeze }
              : {}),
            ...(item.slot.thresholdModifier !== undefined
              ? { thresholdModifier: item.slot.thresholdModifier }
              : {}),
            ...(item.slot.freezeDurationModifier !== undefined
              ? { freezeDurationModifier: item.slot.freezeDurationModifier }
              : {}),
            ...(item.slot.resetSkillKeys !== undefined
              ? { resetSkillKeys: item.slot.resetSkillKeys }
              : {}),
            ...(item.slot.onResetSkill !== undefined
              ? { onResetSkill: item.slot.onResetSkill }
              : {}),
            ...(item.slot.displayMode !== undefined
              ? { displayMode: item.slot.displayMode }
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
    name:
      rule.name?.trim() ||
      `#${Number.isInteger(rule.ruleId) ? rule.ruleId : 10001 + idx}`,
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

export function getSkillsByClass(
  classKey: string,
  locale = getLocale(),
): SkillDefinition[] {
  return getClassConfigMap(locale)[classKey]?.skills ?? [];
}

export function getDurationSkillsByClass(
  classKey: string,
  locale = getLocale(),
): SkillDefinition[] {
  return getSkillsByClass(classKey, locale).filter(
    (skill) => skill.effectDurationMs !== undefined,
  );
}

export function findSkillById(
  classKey: string,
  skillId: number,
  locale = getLocale(),
): SkillDefinition | undefined {
  return getClassConfigMap(locale)[classKey]?.skills.find(
    (skill) => skill.skillId === skillId,
  );
}

export function findResourcesByClass(
  classKey: string,
  locale = getLocale(),
): ResourceDefinition[] {
  return getClassResourceMap(locale)[classKey] || [];
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
  locale = getLocale(),
): SkillDerivation | undefined {
  return getClassConfigMap(locale)[classKey]?.derivations?.find(
    (derivation) => derivation.sourceSkillId === sourceSkillId,
  );
}

export function findResonanceSkill(
  skillId: number,
  locale = getLocale(),
): ResonanceSkillDefinition | undefined {
  return getResonanceSkills(locale).find((skill) => skill.skillId === skillId);
}

export function searchResonanceSkills(
  keyword: string,
  locale = getLocale(),
): ResonanceSkillDefinition[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  return getResonanceSkills(locale).filter((skill) =>
    skill.name.toLowerCase().includes(normalized),
  );
}

export function findAnySkillByBaseId(
  classKey: string,
  skillId: number,
  locale = getLocale(),
): SkillDisplayInfo | undefined {
  return (
    findSkillById(classKey, skillId, locale) ??
    findResonanceSkill(skillId, locale)
  );
}
