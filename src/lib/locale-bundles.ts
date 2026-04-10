import manifest from "$lib/locales/manifest.json";

import ui_zh_CN_DPS from "$lib/locales/zh-CN/ui/DPS.json";
import ui_zh_CN_module_calc from "$lib/locales/zh-CN/ui/module-calc.json";
import ui_zh_CN_monster_monitor from "$lib/locales/zh-CN/ui/monster-monitor.json";
import ui_zh_CN_skill_monitor from "$lib/locales/zh-CN/ui/skill-monitor.json";
import ui_zh_CN_settings_store from "$lib/locales/zh-CN/ui/settings-store.json";
import ui_zh_CN_localization from "$lib/locales/zh-CN/ui/localization.json";
import parser_zh_CN_class_labels from "$lib/locales/zh-CN/parser/class-labels.json";
import parser_zh_CN_MonsterName from "$lib/locales/zh-CN/parser/MonsterName.json";
import parser_zh_CN_SceneName from "$lib/locales/zh-CN/parser/SceneName.json";
import ui_en_DPS from "$lib/locales/en/ui/DPS.json";
import ui_en_module_calc from "$lib/locales/en/ui/module-calc.json";
import ui_en_monster_monitor from "$lib/locales/en/ui/monster-monitor.json";
import ui_en_skill_monitor from "$lib/locales/en/ui/skill-monitor.json";
import ui_en_settings_store from "$lib/locales/en/ui/settings-store.json";
import ui_en_localization from "$lib/locales/en/ui/localization.json";
import parser_en_class_labels from "$lib/locales/en/parser/class-labels.json";
import parser_en_MonsterName from "$lib/locales/en/parser/MonsterName.json";
import parser_en_SceneName from "$lib/locales/en/parser/SceneName.json";
import ui_ja_DPS from "$lib/locales/ja/ui/DPS.json";
import ui_ja_module_calc from "$lib/locales/ja/ui/module-calc.json";
import ui_ja_monster_monitor from "$lib/locales/ja/ui/monster-monitor.json";
import ui_ja_skill_monitor from "$lib/locales/ja/ui/skill-monitor.json";
import ui_ja_settings_store from "$lib/locales/ja/ui/settings-store.json";
import ui_ja_localization from "$lib/locales/ja/ui/localization.json";
import parser_ja_class_labels from "$lib/locales/ja/parser/class-labels.json";
import parser_ja_MonsterName from "$lib/locales/ja/parser/MonsterName.json";
import parser_ja_SceneName from "$lib/locales/ja/parser/SceneName.json";
import ui_de_DPS from "$lib/locales/de/ui/DPS.json";
import ui_de_module_calc from "$lib/locales/de/ui/module-calc.json";
import ui_de_monster_monitor from "$lib/locales/de/ui/monster-monitor.json";
import ui_de_skill_monitor from "$lib/locales/de/ui/skill-monitor.json";
import ui_de_settings_store from "$lib/locales/de/ui/settings-store.json";
import ui_de_localization from "$lib/locales/de/ui/localization.json";
import parser_de_class_labels from "$lib/locales/de/parser/class-labels.json";
import parser_de_MonsterName from "$lib/locales/de/parser/MonsterName.json";
import parser_de_SceneName from "$lib/locales/de/parser/SceneName.json";
import ui_es_DPS from "$lib/locales/es/ui/DPS.json";
import ui_es_module_calc from "$lib/locales/es/ui/module-calc.json";
import ui_es_monster_monitor from "$lib/locales/es/ui/monster-monitor.json";
import ui_es_skill_monitor from "$lib/locales/es/ui/skill-monitor.json";
import ui_es_settings_store from "$lib/locales/es/ui/settings-store.json";
import ui_es_localization from "$lib/locales/es/ui/localization.json";
import parser_es_class_labels from "$lib/locales/es/parser/class-labels.json";
import parser_es_MonsterName from "$lib/locales/es/parser/MonsterName.json";
import parser_es_SceneName from "$lib/locales/es/parser/SceneName.json";
import ui_fr_DPS from "$lib/locales/fr/ui/DPS.json";
import ui_fr_module_calc from "$lib/locales/fr/ui/module-calc.json";
import ui_fr_monster_monitor from "$lib/locales/fr/ui/monster-monitor.json";
import ui_fr_skill_monitor from "$lib/locales/fr/ui/skill-monitor.json";
import ui_fr_settings_store from "$lib/locales/fr/ui/settings-store.json";
import ui_fr_localization from "$lib/locales/fr/ui/localization.json";
import parser_fr_class_labels from "$lib/locales/fr/parser/class-labels.json";
import parser_fr_MonsterName from "$lib/locales/fr/parser/MonsterName.json";
import parser_fr_SceneName from "$lib/locales/fr/parser/SceneName.json";
import ui_pt_BR_DPS from "$lib/locales/pt-BR/ui/DPS.json";
import ui_pt_BR_module_calc from "$lib/locales/pt-BR/ui/module-calc.json";
import ui_pt_BR_monster_monitor from "$lib/locales/pt-BR/ui/monster-monitor.json";
import ui_pt_BR_skill_monitor from "$lib/locales/pt-BR/ui/skill-monitor.json";
import ui_pt_BR_settings_store from "$lib/locales/pt-BR/ui/settings-store.json";
import ui_pt_BR_localization from "$lib/locales/pt-BR/ui/localization.json";
import parser_pt_BR_class_labels from "$lib/locales/pt-BR/parser/class-labels.json";
import parser_pt_BR_MonsterName from "$lib/locales/pt-BR/parser/MonsterName.json";
import parser_pt_BR_SceneName from "$lib/locales/pt-BR/parser/SceneName.json";


export type LocaleManifest = {
  defaultLocale: string;
  fallbackLocale: string;
  locales: string[];
  categories: Record<string, string[]>;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

const MANIFEST = manifest as LocaleManifest;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const SMALL_BUNDLED_LOCALE_FILES: Record<string, JsonValue> = {
  "/src/lib/locales/zh-CN/ui/DPS.json": ui_zh_CN_DPS as JsonValue,
  "/src/lib/locales/zh-CN/ui/module-calc.json": ui_zh_CN_module_calc as JsonValue,
  "/src/lib/locales/zh-CN/ui/monster-monitor.json": ui_zh_CN_monster_monitor as JsonValue,
  "/src/lib/locales/zh-CN/ui/skill-monitor.json": ui_zh_CN_skill_monitor as JsonValue,
  "/src/lib/locales/zh-CN/ui/settings-store.json": ui_zh_CN_settings_store as JsonValue,
  "/src/lib/locales/zh-CN/ui/localization.json": ui_zh_CN_localization as JsonValue,
  "/src/lib/locales/zh-CN/parser/class-labels.json": parser_zh_CN_class_labels as JsonValue,
  "/src/lib/locales/zh-CN/parser/MonsterName.json": parser_zh_CN_MonsterName as JsonValue,
  "/src/lib/locales/zh-CN/parser/SceneName.json": parser_zh_CN_SceneName as JsonValue,
  "/src/lib/locales/en/ui/DPS.json": ui_en_DPS as JsonValue,
  "/src/lib/locales/en/ui/module-calc.json": ui_en_module_calc as JsonValue,
  "/src/lib/locales/en/ui/monster-monitor.json": ui_en_monster_monitor as JsonValue,
  "/src/lib/locales/en/ui/skill-monitor.json": ui_en_skill_monitor as JsonValue,
  "/src/lib/locales/en/ui/settings-store.json": ui_en_settings_store as JsonValue,
  "/src/lib/locales/en/ui/localization.json": ui_en_localization as JsonValue,
  "/src/lib/locales/en/parser/class-labels.json": parser_en_class_labels as JsonValue,
  "/src/lib/locales/en/parser/MonsterName.json": parser_en_MonsterName as JsonValue,
  "/src/lib/locales/en/parser/SceneName.json": parser_en_SceneName as JsonValue,
  "/src/lib/locales/ja/ui/DPS.json": ui_ja_DPS as JsonValue,
  "/src/lib/locales/ja/ui/module-calc.json": ui_ja_module_calc as JsonValue,
  "/src/lib/locales/ja/ui/monster-monitor.json": ui_ja_monster_monitor as JsonValue,
  "/src/lib/locales/ja/ui/skill-monitor.json": ui_ja_skill_monitor as JsonValue,
  "/src/lib/locales/ja/ui/settings-store.json": ui_ja_settings_store as JsonValue,
  "/src/lib/locales/ja/ui/localization.json": ui_ja_localization as JsonValue,
  "/src/lib/locales/ja/parser/class-labels.json": parser_ja_class_labels as JsonValue,
  "/src/lib/locales/ja/parser/MonsterName.json": parser_ja_MonsterName as JsonValue,
  "/src/lib/locales/ja/parser/SceneName.json": parser_ja_SceneName as JsonValue,
  "/src/lib/locales/de/ui/DPS.json": ui_de_DPS as JsonValue,
  "/src/lib/locales/de/ui/module-calc.json": ui_de_module_calc as JsonValue,
  "/src/lib/locales/de/ui/monster-monitor.json": ui_de_monster_monitor as JsonValue,
  "/src/lib/locales/de/ui/skill-monitor.json": ui_de_skill_monitor as JsonValue,
  "/src/lib/locales/de/ui/settings-store.json": ui_de_settings_store as JsonValue,
  "/src/lib/locales/de/ui/localization.json": ui_de_localization as JsonValue,
  "/src/lib/locales/de/parser/class-labels.json": parser_de_class_labels as JsonValue,
  "/src/lib/locales/de/parser/MonsterName.json": parser_de_MonsterName as JsonValue,
  "/src/lib/locales/de/parser/SceneName.json": parser_de_SceneName as JsonValue,
  "/src/lib/locales/es/ui/DPS.json": ui_es_DPS as JsonValue,
  "/src/lib/locales/es/ui/module-calc.json": ui_es_module_calc as JsonValue,
  "/src/lib/locales/es/ui/monster-monitor.json": ui_es_monster_monitor as JsonValue,
  "/src/lib/locales/es/ui/skill-monitor.json": ui_es_skill_monitor as JsonValue,
  "/src/lib/locales/es/ui/settings-store.json": ui_es_settings_store as JsonValue,
  "/src/lib/locales/es/ui/localization.json": ui_es_localization as JsonValue,
  "/src/lib/locales/es/parser/class-labels.json": parser_es_class_labels as JsonValue,
  "/src/lib/locales/es/parser/MonsterName.json": parser_es_MonsterName as JsonValue,
  "/src/lib/locales/es/parser/SceneName.json": parser_es_SceneName as JsonValue,
  "/src/lib/locales/fr/ui/DPS.json": ui_fr_DPS as JsonValue,
  "/src/lib/locales/fr/ui/module-calc.json": ui_fr_module_calc as JsonValue,
  "/src/lib/locales/fr/ui/monster-monitor.json": ui_fr_monster_monitor as JsonValue,
  "/src/lib/locales/fr/ui/skill-monitor.json": ui_fr_skill_monitor as JsonValue,
  "/src/lib/locales/fr/ui/settings-store.json": ui_fr_settings_store as JsonValue,
  "/src/lib/locales/fr/ui/localization.json": ui_fr_localization as JsonValue,
  "/src/lib/locales/fr/parser/class-labels.json": parser_fr_class_labels as JsonValue,
  "/src/lib/locales/fr/parser/MonsterName.json": parser_fr_MonsterName as JsonValue,
  "/src/lib/locales/fr/parser/SceneName.json": parser_fr_SceneName as JsonValue,
  "/src/lib/locales/pt-BR/ui/DPS.json": ui_pt_BR_DPS as JsonValue,
  "/src/lib/locales/pt-BR/ui/module-calc.json": ui_pt_BR_module_calc as JsonValue,
  "/src/lib/locales/pt-BR/ui/monster-monitor.json": ui_pt_BR_monster_monitor as JsonValue,
  "/src/lib/locales/pt-BR/ui/skill-monitor.json": ui_pt_BR_skill_monitor as JsonValue,
  "/src/lib/locales/pt-BR/ui/settings-store.json": ui_pt_BR_settings_store as JsonValue,
  "/src/lib/locales/pt-BR/ui/localization.json": ui_pt_BR_localization as JsonValue,
  "/src/lib/locales/pt-BR/parser/class-labels.json": parser_pt_BR_class_labels as JsonValue,
  "/src/lib/locales/pt-BR/parser/MonsterName.json": parser_pt_BR_MonsterName as JsonValue,
  "/src/lib/locales/pt-BR/parser/SceneName.json": parser_pt_BR_SceneName as JsonValue,
};


function getBundledLocaleValue(locale: string, category: string, fileName: string): JsonValue | null {
  const path = `/src/lib/locales/${locale}/${category}/${fileName}`;
  const value = SMALL_BUNDLED_LOCALE_FILES[path];
  return value === undefined ? null : cloneJson(value);
}

function combineGenericLocaleMaps(category: string, fileName: string): Record<string, Record<string, string>> {
  const combined: Record<string, Record<string, string>> = {};
  for (const locale of MANIFEST.locales) {
    const raw = getBundledLocaleValue(locale, category, fileName);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!combined[key]) combined[key] = {};
      combined[key][locale] = typeof value === 'string' ? value : '';
    }
  }
  return combined;
}

export function getLocaleManifest(): LocaleManifest {
  return cloneJson(MANIFEST);
}

export function getVirtualTranslationFiles(): string[] {
  const files: string[] = [];
  for (const [category, names] of Object.entries(MANIFEST.categories)) {
    for (const name of names) files.push(`${category}/${name}`);
  }
  return files;
}

export function getBundledTranslationTable(virtualPath: string): JsonRecord {
  switch (virtualPath) {
    case 'ui/DPS.json':
    case 'ui/module-calc.json':
    case 'ui/monster-monitor.json':
    case 'ui/skill-monitor.json':
    case 'ui/settings-store.json':
    case 'ui/localization.json':
    case 'parser/class-labels.json':
    case 'parser/MonsterName.json':
    case 'parser/SceneName.json': {
      const [category, fileName] = virtualPath.split('/');
      return combineGenericLocaleMaps(category!, fileName!);
    }
    default:
      return {};
  }
}
