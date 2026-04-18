import type { CustomDefinitionType } from "$lib/custom-definitions-store";
import { getCustomDefinition, type CustomDefinitionsFile } from "$lib/custom-definitions-store";
import { resolveBuffNameInfo } from "$lib/config/buff-name-table";
import type { EventLoggerEntry, LoggerDisplayMode } from "$lib/event-logger-types";
import { resolveSkillTranslation, type LocaleCode } from "$lib/i18n";
import { getLocalizedMonsterName } from "$lib/monster-mappings";

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function loggerCategoryToDefinitionType(category: string): CustomDefinitionType {
  switch (category) {
    case "buff":
    case "monster_buff":
      return "buff";
    case "skill":
    case "skill_cd":
      return "skill";
    case "counter":
      return "counter";
    case "scene":
      return "monster";
    default:
      return "unknown";
  }
}

function resolveBuiltInName(entry: EventLoggerEntry, locale: LocaleCode): string {
  if (!Number.isFinite(Number(entry.uid))) {
    return normalizeText(entry.nameHint);
  }

  const uid = Number(entry.uid);

  if (entry.category === "buff" || entry.category === "monster_buff") {
    return resolveBuffNameInfo(uid).name;
  }

  if (
    entry.category === "skill" ||
    entry.category === "skill_cd" ||
    entry.category === "player_skill_damage" ||
    entry.category === "player_skill_heal" ||
    entry.category === "player_skill_taken" ||
    entry.category === "player_target_skill_damage" ||
    entry.category === "player_target_skill_heal"
  ) {
    return resolveSkillTranslation(uid, locale, normalizeText(entry.nameHint) || String(uid));
  }

  if (entry.category === "scene") {
    return getLocalizedMonsterName(uid, entry.nameHint);
  }

  if (entry.category === "chat" || entry.category === "item_drop") {
    return normalizeText(entry.nameHint);
  }

  return normalizeText(entry.nameHint);
}

export function resolveLoggerEntryName(
  entry: EventLoggerEntry,
  locale: LocaleCode,
  customDefinitionState?: CustomDefinitionsFile | null,
): string {
  const builtInName = resolveBuiltInName(entry, locale);
  if (builtInName && builtInName !== String(entry.uid ?? "")) {
    return builtInName;
  }

  const customType = loggerCategoryToDefinitionType(entry.category);
  const custom = customDefinitionState
    ? customDefinitionState.definitions.find(
        (definition) =>
          definition.uid === Number(entry.uid) && definition.type === customType,
      ) ?? null
    : getCustomDefinition(Number(entry.uid), customType);

  if (custom?.name) return custom.name;

  const nameHint = normalizeText(entry.nameHint);
  if (nameHint) return nameHint;

  if (Number.isFinite(Number(entry.uid))) return String(entry.uid);

  return "";
}

export function buildLoggerDisplayLabel(
  entry: EventLoggerEntry,
  locale: LocaleCode,
  mode: LoggerDisplayMode,
  customDefinitionState?: CustomDefinitionsFile | null,
): string {
  const uid = Number.isFinite(Number(entry.uid)) ? String(entry.uid) : "";
  const name = resolveLoggerEntryName(entry, locale, customDefinitionState);

  if (mode === "uid") {
    return uid || name;
  }

  if (mode === "name") {
    return name || uid;
  }

  if (mode === "name_uid") {
    return name || uid;
  }

  return name || uid;
}
