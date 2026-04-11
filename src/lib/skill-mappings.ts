import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import resonanceSkillIcons from "$lib/config/skill_aoyi_icons.json";
import classSkillConfigsRaw from "$lib/config/class_skill_configs.json";
import classResourcesRaw from "$lib/config/class_resources.json";
import classSpecialBuffDisplaysRaw from "$lib/config/class_special_buff_displays.json";
import counterRulesRaw from "$lib/config/counter_rules.json";
import counterSourceTemplatesRaw from "$lib/config/counter_source_templates.json";
import counterSlotTemplatesRaw from "$lib/config/counter_slot_templates.json";
import {
  DEFAULT_LOCALE,
  PRIMARY_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  TRANSLATION_SOURCE_MODE_EVENT,
  isLocaleCode,
  type LocaleCode,
} from "$lib/i18n";
import { settings } from "$lib/settings-store";
import type { UserCounterRule } from "$lib/settings-store";
import type { CounterAction, CounterSource } from "$lib/bindings";

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

type MultiLangValue = Partial<Record<LocaleCode, string>>;
type MultiLangKeywords = Partial<Record<LocaleCode, string[]>>;

type ResonanceSkillSearchEntry = {
  name?: MultiLangValue;
  keywords?: MultiLangKeywords;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replaceRecordContents<T extends Record<string, any>>(target: T, source: T): void {
  for (const key of Object.keys(target)) {
    delete target[key as keyof T];
  }
  Object.assign(target, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RESONANCE_RUNTIME_RELATIVE_PATH = "search/resonance-skill-search.json";

const RESONANCE_SKILL_SEARCH_TRANSLATIONS: Record<string, ResonanceSkillSearchEntry> = {};

const BUNDLED_RESONANCE_SKILL_SEARCH_TRANSLATIONS: Record<string, ResonanceSkillSearchEntry> = {};

let resonanceRuntimeInitPromise: Promise<void> | null = null;
let resonanceRuntimeListenerPromise: Promise<void> | null = null;
let resonanceSourceModeListenerRegistered = false;

async function ensureResonanceTranslationRuntimeFiles(): Promise<void> {
  try {
    await invoke<string>("initialize_translation_runtime_files");
  } catch (error) {
    console.warn(
      "[skill-mappings] Failed to initialize runtime translation files:",
      error,
    );
  }
}

async function readRuntimeResonanceTranslations(): Promise<
  Record<string, ResonanceSkillSearchEntry> | null
> {
  try {
    const raw = await invoke<string>("read_translation_runtime_file", {
      relativePath: RESONANCE_RUNTIME_RELATIVE_PATH,
    });
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      console.warn(
        `[skill-mappings] Runtime resonance translation file is not an object: ${RESONANCE_RUNTIME_RELATIVE_PATH}`,
      );
      return null;
    }

    return parsed as Record<string, ResonanceSkillSearchEntry>;
  } catch (error) {
    console.warn(
      `[skill-mappings] Failed to read runtime resonance translation file: ${RESONANCE_RUNTIME_RELATIVE_PATH}`,
      error,
    );
    return null;
  }
}

async function loadResonanceSkillSearchRuntimeData(): Promise<void> {
  await ensureResonanceTranslationRuntimeFiles();

  const runtimeValue = await readRuntimeResonanceTranslations();
  const nextValue = runtimeValue ?? BUNDLED_RESONANCE_SKILL_SEARCH_TRANSLATIONS;

  replaceRecordContents(RESONANCE_SKILL_SEARCH_TRANSLATIONS, cloneJson(nextValue));
}

async function registerResonanceRuntimeListener(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (!resonanceRuntimeListenerPromise) {
    resonanceRuntimeListenerPromise = listen("translation-data-refreshed", async () => {
      await loadResonanceSkillSearchRuntimeData();
    })
      .then(() => undefined)
      .catch((error) => {
        console.warn(
          "[skill-mappings] Failed to register translation refresh listener:",
          error,
        );
      });
  }

  if (!resonanceSourceModeListenerRegistered) {
    window.addEventListener(TRANSLATION_SOURCE_MODE_EVENT, async () => {
      await loadResonanceSkillSearchRuntimeData();
    });
    resonanceSourceModeListenerRegistered = true;
  }

  await resonanceRuntimeListenerPromise;
}

export async function initializeResonanceSkillSearchRuntimeData(): Promise<void> {
  if (!resonanceRuntimeInitPromise) {
    resonanceRuntimeInitPromise = (async () => {
      await registerResonanceRuntimeListener();
      await loadResonanceSkillSearchRuntimeData();
    })();
  }

  await resonanceRuntimeInitPromise;
}

export async function reloadResonanceSkillSearchRuntimeData(): Promise<void> {
  await loadResonanceSkillSearchRuntimeData();
}

function normalizeSearchText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function collectMultiLangTexts(value: MultiLangValue | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const locale of SUPPORTED_LOCALES) {
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
  for (const locale of SUPPORTED_LOCALES) {
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

  if (isLocaleCode(locale)) {
    return locale;
  }

  return DEFAULT_LOCALE;
}

function resolveMultiLangName(value: MultiLangValue | undefined, fallback: string): string {
  const locale = getCurrentLocale();
  const selected = value?.[locale]?.trim();
  if (selected) return selected;

  if (locale !== PRIMARY_FALLBACK_LOCALE) {
    const en = value?.[PRIMARY_FALLBACK_LOCALE]?.trim();
    if (en) return en;
  }

  if (locale !== DEFAULT_LOCALE) {
    const zh = value?.[DEFAULT_LOCALE]?.trim();
    if (zh) return zh;
  }

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
  sources: CounterSource[];
  effectSlots: CounterEffectSlotPreset[];
};

export type CounterEffectSlotPreset = {
  slotId: number;
  threshold: number | null;
  resetBuffId: number;
  resetSourceConfigId?: number;
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
            ...(item.slot.resetSourceConfigId !== undefined
              ? { resetSourceConfigId: item.slot.resetSourceConfigId }
              : {}),
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

void initializeResonanceSkillSearchRuntimeData();
