import type { CustomDefinitionType } from "$lib/custom-definitions-store";
import { getCustomDefinition, type CustomDefinitionsFile } from "$lib/custom-definitions-store";
import { resolveBuffNameInfo } from "$lib/config/buff-name-table";
import type { EventLoggerEntry, LoggerDisplayMode } from "$lib/event-logger-types";
import { resolveGearItemName, resolveItemName } from "$lib/gear-stat-decoder";
import { resolveSkillTranslation, type LocaleCode } from "$lib/i18n";
import { localizeRawMonsterName } from "$lib/monster-mappings";
import { getLocalizedSceneName, localizeRawSceneName } from "$lib/scene-mappings";

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function tryParseRawObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function itemDropItemName(entry: EventLoggerEntry, locale: LocaleCode): string | null {
  const raw = tryParseRawObject(entry.raw);
  const decoded = raw?.["decoded"];
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return null;

  const decodedObject = decoded as Record<string, unknown>;
  const isGear = decodedObject["isGear"] === true || decodedObject["itemKind"] === "gear";

  const itemIds = [
    parsePositiveInteger(decodedObject["detailGearInstanceId"]),
    parsePositiveInteger(decodedObject["instanceId"]),
    parsePositiveInteger(decodedObject["configId"]),
    parsePositiveInteger(entry.targetUid),
    parsePositiveInteger(entry.uid),
  ];

  for (const itemId of itemIds) {
    const name = isGear ? resolveGearItemName(itemId, locale) : resolveItemName(itemId, locale);
    if (name) return name;
  }

  return null;
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
  const rawNameHint = normalizeText(entry.nameHint);

  if (entry.category === "scene" || entry.category === "live_totals" || entry.category === "encounter") {
    if (Number.isFinite(Number(entry.uid)) && entry.category !== "encounter") {
      return getLocalizedSceneName(Number(entry.uid), rawNameHint || undefined, locale);
    }

    return localizeRawSceneName(rawNameHint, rawNameHint, locale);
  }

  if (entry.category === "boss_hp" || entry.category === "mob") {
    return localizeRawMonsterName(rawNameHint, rawNameHint, locale);
  }

  if (!Number.isFinite(Number(entry.uid))) {
    return rawNameHint;
  }

  const uid = Number(entry.uid);

  if (entry.category === "buff" || entry.category === "monster_buff") {
    return resolveBuffNameInfo(uid, undefined, locale).name;
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
    return resolveSkillTranslation(uid, locale, rawNameHint || String(uid));
  }

  if (entry.category === "item_drop") {
    return itemDropItemName(entry, locale) ?? rawNameHint;
  }

  if (entry.category === "chat") {
    return rawNameHint;
  }

  return rawNameHint;
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
