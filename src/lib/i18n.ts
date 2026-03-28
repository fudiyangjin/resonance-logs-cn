import skillNameTranslations from "$lib/translations/common/skillnames.json";
import navigationTranslations from "$lib/translations/common/navigation.json";
import moduleCalcTranslations from "$lib/translations/module-calc.json";
import monsterMonitorTranslations from "$lib/translations/monster-monitor.json";
import skillMonitorTranslations from "$lib/translations/skill-monitor.json";
import classLabelTranslations from "$lib/translations/class-labels.json";
import settingsStoreTranslations from "$lib/translations/settings-store.json";

export type LocaleCode = "zh-CN" | "en" | "ja";
export type SkillIdDisplayMode = "off" | "hover" | "column";

export type MultiLangValue = Partial<Record<LocaleCode, string>>;
export type TranslationTable = Record<string, MultiLangValue>;

export type SkillTranslationEntry = {
  name: MultiLangValue;
  note?: MultiLangValue;
};

export type SkillTranslationTable = Record<string, SkillTranslationEntry>;

export const DEFAULT_LOCALE: LocaleCode = "zh-CN";

export const SKILL_NAME_TRANSLATIONS: SkillTranslationTable =
  skillNameTranslations as SkillTranslationTable;

export const NAVIGATION_TRANSLATIONS: TranslationTable =
  navigationTranslations as TranslationTable;

export const MODULE_CALC_TRANSLATIONS: TranslationTable =
  moduleCalcTranslations as TranslationTable;

export const MONSTER_MONITOR_TRANSLATIONS: TranslationTable =
  monsterMonitorTranslations as TranslationTable;

export const SKILL_MONITOR_TRANSLATIONS: TranslationTable =
  skillMonitorTranslations as TranslationTable;

export const CLASS_LABEL_TRANSLATIONS: TranslationTable =
  classLabelTranslations as TranslationTable;

export const SETTINGS_STORE_TRANSLATIONS: TranslationTable =
  settingsStoreTranslations as unknown as TranslationTable;;

export function resolveMultiLangValue(
  value: MultiLangValue | undefined,
  locale: LocaleCode,
  fallback: string,
): string {
  const selected = value?.[locale]?.trim();
  if (selected) return selected;

  const zh = value?.[DEFAULT_LOCALE]?.trim();
  if (zh) return zh;

  return fallback;
}

export function resolveTranslation(
  table: TranslationTable | undefined,
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  const entry = table?.[key];
  return resolveMultiLangValue(entry, locale, fallback);
}

export function resolveNavigationTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(NAVIGATION_TRANSLATIONS, key, locale, fallback);
}

export function resolveModuleCalcTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(MODULE_CALC_TRANSLATIONS, key, locale, fallback);
}

export function resolveMonsterMonitorTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(MONSTER_MONITOR_TRANSLATIONS, key, locale, fallback);
}

export function resolveSkillMonitorTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(SKILL_MONITOR_TRANSLATIONS, key, locale, fallback);
}

export function resolveClassLabelTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(CLASS_LABEL_TRANSLATIONS, key, locale, fallback);
}

export function resolveSettingsStoreTranslation(
  key: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveTranslation(SETTINGS_STORE_TRANSLATIONS, key, locale, fallback);
}

export function buildSkillMonitorClassNameKey(classKey: string): string {
  return `className.${classKey}`;
}

export function buildSkillMonitorClassSkillKey(
  classKey: string,
  skillId: string | number,
): string {
  return `classSkill.${classKey}.${String(skillId)}`;
}

export function buildSkillMonitorDerivedSkillKey(
  classKey: string,
  sourceSkillId: string | number,
  triggerBuffBaseId: string | number,
): string {
  return `classSkillDerived.${classKey}.${String(sourceSkillId)}.${String(triggerBuffBaseId)}`;
}

export function resolveSkillMonitorClassName(
  classKey: string,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveSkillMonitorTranslation(
    buildSkillMonitorClassNameKey(classKey),
    locale,
    fallback,
  );
}

export function resolveSkillMonitorClassSkillName(
  classKey: string,
  skillId: string | number,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveSkillMonitorTranslation(
    buildSkillMonitorClassSkillKey(classKey, skillId),
    locale,
    fallback,
  );
}

export function resolveSkillMonitorDerivedSkillName(
  classKey: string,
  sourceSkillId: string | number,
  triggerBuffBaseId: string | number,
  locale: LocaleCode,
  fallback: string,
): string {
  return resolveSkillMonitorTranslation(
    buildSkillMonitorDerivedSkillKey(classKey, sourceSkillId, triggerBuffBaseId),
    locale,
    fallback,
  );
}

export function resolveSkillTranslation(
  id: string | number,
  locale: LocaleCode,
  fallbackName: string,
): string {
  const entry = SKILL_NAME_TRANSLATIONS[String(id)];
  return resolveMultiLangValue(entry?.name, locale, fallbackName);
}

export function resolveSkillNote(
  id: string | number,
  locale: LocaleCode,
): string {
  const entry = SKILL_NAME_TRANSLATIONS[String(id)];
  return resolveMultiLangValue(entry?.note, locale, "");
}

export function fallbackIdLabel(id: string | number): string {
  return String(id);
}
