import modifierRecountTableData from "$parserData/generated/ModifierRecountTable.json";
import modifierClassificationTableUrl from "$parserData/generated/ModifierClassificationRuntime.json?url";
import modifierContributionTableUrl from "$parserData/generated/ModifierContributionRuntime.json?url";
import modifierDescriptionsTableUrl from "$parserData/generated/ModifierDescriptions.json?url";
import modifierDisplayTableData from "$parserData/generated/ModifierDisplayTable.json";
import skillAoyiIconsData from "$parserData/generated/skill_aoyi_icons.json";
import type { HistoryEntityData } from "$lib/bindings";
import { lookupBuffLocalizedNames, lookupDefaultBuffName } from "$lib/config/buff-name-table";
import type {
  LocalizedTextMap,
  ModifierAttributionModel,
  ModifierContributionModel,
  ModifierSourceClassification,
  TalentOwnershipMetadata,
} from "$lib/history-modifier-report-display";

export type ModifierSourceCatalogEntry = {
  sourceRuleId?: string;
  sourceId: string;
  sourceKind: string;
  sourceType?: string;
  sourceEntityId?: number;
  sourceName?: string;
  sourceNames?: LocalizedTextMap;
  description?: string;
  descriptions?: LocalizedTextMap;
  iconPath?: string;
  runtimeDetection?: string;
  providerAggregation?: "actor-kind" | "source-uid";
  displayOwnerKind?: "battle-imagine";
  buffIds: number[];
  evidence: string[];
  reportPolicy?: "include" | "debug-only" | "ignore";
  runtimeSourceConfigIds?: number[];
  runtimeBaseIds?: number[];
  rowPolicy?: "static-target" | "formula" | "timing" | "proc" | "uptime" | "defensive" | "unknown";
  contributionStatus?: string;
  contributionGroups?: string[];
  predicateTags?: string[];
  relationshipKinds?: string[];
  componentClasses?: string[];
  attributionModel?: ModifierAttributionModel;
  contributionModel?: ModifierContributionModel;
  talentOwnership?: TalentOwnershipMetadata;
  classification?: ModifierSourceClassification;
  uidEdges?: ModifierSourceUidEdge[];
  targetDamageIds?: number[];
  targetRecountIds?: number[];
};

export type ModifierSourceUidEdge = {
  edgeKind: string;
  uidKind: string;
  uid: number | string;
  role?: string;
  scope?: string;
  source?: string;
  status?: string;
  relationshipKind?: string;
  parentUidKind?: string;
  parentUid?: number | string;
  componentKey?: string;
  componentClass?: string;
  direction?: string;
  contributionScope?: string;
  valueScope?: string;
  formulaTermIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
};

export type ModifierSourceCatalog = {
  byBuffId: Record<string, ModifierSourceCatalogEntry[]>;
  ignoredBuffIds: number[];
  reportableBuffIds: number[];
  debugBuffIds: number[];
  unmappedObservedBuffs: ModifierObservedBuffSummary[];
  ownerClassId?: number;
  ownerSpecIds?: number[];
};

export type ModifierObservedBuffSummary = {
  buffId: number;
  roles: ("base" | "sourceConfig")[];
  bucketCount: number;
  hits: number;
  totalValue: number;
  effectiveTotalValue: number;
  pairedBaseIds: number[];
  pairedSourceConfigIds: number[];
  sampleSkillIds: number[];
  sampleDamageIds: number[];
};

type ModifierRecountTable = {
  sourcesById?: Record<string, ModifierSourceCatalogEntry>;
  byBuffId?: Record<string, string[]>;
  ignoredBuffIds?: number[];
  reportableBuffIds?: number[];
  debugBuffIds?: number[];
};

type ModifierClassificationTable = {
  sourcesByRuleId?: Record<string, ModifierSourceClassification>;
};

type ModifierContributionTable = {
  sourcesByRuleId?: Record<string, ModifierContributionModel>;
};

type ModifierDisplayEntry = {
  sourceId?: string;
  sourceName?: string;
  sourceNames?: LocalizedTextMap;
  iconPath?: string;
  displayOwnerKind?: "battle-imagine";
};

type ModifierDisplayTable = {
  sourcesByRuleId?: Record<string, ModifierDisplayEntry>;
};

type ModifierDescriptionEntry = {
  description?: string;
  descriptions?: LocalizedTextMap;
};

type ModifierDescriptionTable = {
  sourcesByRuleId?: Record<string, ModifierDescriptionEntry>;
};

const modifierRecountTable = modifierRecountTableData as ModifierRecountTable;
let modifierContributionTable: ModifierContributionTable = {};
let modifierContributionTablePromise: Promise<ModifierContributionTable> | null = null;
let modifierClassificationTable: ModifierClassificationTable = {};
let modifierClassificationTablePromise: Promise<ModifierClassificationTable> | null = null;
let modifierDescriptionsTable: ModifierDescriptionTable = {};
let modifierDescriptionsTablePromise: Promise<ModifierDescriptionTable> | null = null;
const MODIFIER_CLASSIFICATION_LOAD_TIMEOUT_MS = 3_000;
const MODIFIER_CONTRIBUTION_LOAD_TIMEOUT_MS = 3_000;
const MODIFIER_DESCRIPTIONS_LOAD_TIMEOUT_MS = 3_000;
const modifierDisplayTable = modifierDisplayTableData as ModifierDisplayTable;
const skillAoyiIcons = skillAoyiIconsData as Array<{
  id?: number;
  Id?: number;
  Name?: string;
  Names?: LocalizedTextMap;
  MonsterNames?: LocalizedTextMap;
  IconPath?: string;
}>;

function finitePositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...new Set([...values].filter(Number.isFinite))].sort((left, right) => left - right);
}

function decodeProfessionTalentNodeId(nodeId: number): number | null {
  if (!Number.isFinite(nodeId)) return null;
  if (nodeId >= 1_000_000) return Math.floor(nodeId / 1000);
  return null;
}

function normalizeSourceConfigSkillKey(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function aoyiOwnerDisplay(row: (typeof skillAoyiIcons)[number]): { name: string; names?: LocalizedTextMap } | null {
  const names = row.MonsterNames;
  const name = names?.["en"]?.trim() || names?.["zh-CN"]?.trim() || "";
  return name ? { name, ...(names ? { names } : {}) } : null;
}

function sourceConfigSkillNameIndex(): Map<number, { name: string; names?: LocalizedTextMap }> {
  const index = new Map<number, { name: string; names?: LocalizedTextMap }>();
  const ownerBySkillName = new Map<string, { name: string; names?: LocalizedTextMap }>();

  for (const row of skillAoyiIcons) {
    const owner = aoyiOwnerDisplay(row);
    if (!owner) continue;
    const labels = [
      row.Name,
      ...(row.Names ? Object.values(row.Names) : []),
    ];
    for (const label of labels) {
      const key = normalizeSourceConfigSkillKey(label);
      if (key && !ownerBySkillName.has(key)) ownerBySkillName.set(key, owner);
    }
  }

  for (const row of skillAoyiIcons) {
    const id = finitePositiveNumber(row.Id ?? row.id);
    if (id === null) continue;
    const owner = aoyiOwnerDisplay(row)
      ?? ownerBySkillName.get(normalizeSourceConfigSkillKey(row.Name))
      ?? Object.values(row.Names ?? {})
        .map((label) => ownerBySkillName.get(normalizeSourceConfigSkillKey(label)))
        .find((match): match is { name: string; names?: LocalizedTextMap } => Boolean(match));
    const names = owner?.names ?? row.Names;
    const name = names?.["en"]?.trim() || row.Name?.trim() || names?.["zh-CN"]?.trim() || String(id);
    index.set(id, names ? { name, names } : { name });
  }
  return index;
}

const sourceConfigSkillNames = sourceConfigSkillNameIndex();

function normalizeDisplayOwnerKey(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function imagineOwnerNameIndex(): Map<string, { name: string; names?: LocalizedTextMap }> {
  const index = new Map<string, { name: string; names?: LocalizedTextMap }>();
  for (const row of skillAoyiIcons) {
    const monsterNames = row.MonsterNames;
    if (!monsterNames) continue;
    const name = monsterNames["en"]?.trim() || monsterNames["zh-CN"]?.trim() || row.Name?.trim();
    if (!name) continue;
    const owner = { name, names: monsterNames };
    const designNames = new Set<string>([
      row.Name,
      ...(row.Names ? Object.values(row.Names) : []),
    ].map((value) => value?.trim()).filter((value): value is string => Boolean(value)));
    for (const designName of designNames) {
      const key = normalizeDisplayOwnerKey(designName);
      if (key) index.set(key, owner);
    }
  }
  return index;
}

const imagineOwnerNamesByDesignName = imagineOwnerNameIndex();

const RUNTIME_WINDOW_ROW_POLICIES = new Set(["formula", "timing", "uptime"]);
const RUNTIME_WINDOW_GROUPS = new Set([
  "baseattack",
  "critical",
  "elemental",
  "genericdamage",
  "hittiming",
  "targetmitigation",
  "versatility",
]);
const RUNTIME_WINDOW_SOURCE_KINDS = new Set([
  "active-skill",
  "consumable",
  "imagine",
  "phantom-factor",
  "runtime-buff",
  "season-rogue-entry",
  "season-talent-node",
  "set-effect",
  "talent-passive",
  "talent-skill",
]);

function entryHasStaticTargets(entry: ModifierSourceCatalogEntry): boolean {
  return (entry.targetDamageIds?.length ?? 0) > 0 || (entry.targetRecountIds?.length ?? 0) > 0;
}

function entryContributionGroups(entry: ModifierSourceCatalogEntry): string[] {
  return [
    ...(entry.contributionGroups ?? []),
    ...(entry.attributionModel?.contributionGroups ?? []),
  ]
    .map((group) => String(group).trim().toLowerCase())
    .filter(Boolean);
}

function isRuntimeWindowCatalogEntry(entry: ModifierSourceCatalogEntry): boolean {
  if ((entry.reportPolicy ?? "include") !== "debug-only") return false;
  if (entryHasStaticTargets(entry)) return false;
  const rowPolicy = String(entry.rowPolicy ?? "").toLowerCase();
  if (!RUNTIME_WINDOW_ROW_POLICIES.has(rowPolicy)) return false;

  const groups = entryContributionGroups(entry);
  if (groups.some((group) => RUNTIME_WINDOW_GROUPS.has(group))) return true;

  if (rowPolicy !== "uptime") return false;
  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  const sourceType = String(entry.sourceType ?? "").toLowerCase();
  return RUNTIME_WINDOW_SOURCE_KINDS.has(sourceKind)
    || sourceType.includes("buff")
    || sourceType.includes("debuff");
}

function isCatalogReportEntry(entry: ModifierSourceCatalogEntry): boolean {
  return (entry.reportPolicy ?? "include") === "include" || isRuntimeWindowCatalogEntry(entry);
}

async function loadModifierClassificationTable(): Promise<ModifierClassificationTable> {
  if (modifierClassificationTable.sourcesByRuleId) return modifierClassificationTable;
  modifierClassificationTablePromise ??= (async () => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), MODIFIER_CLASSIFICATION_LOAD_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(modifierClassificationTableUrl, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`Failed to load modifier classification table: ${response.status}`);
      }
      modifierClassificationTable = await response.json() as ModifierClassificationTable;
      return modifierClassificationTable;
    } catch (err) {
      console.warn("[history] modifier classification table unavailable", err);
      modifierClassificationTable = {};
      return modifierClassificationTable;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  })();
  return modifierClassificationTablePromise;
}

async function loadModifierContributionTable(): Promise<ModifierContributionTable> {
  if (modifierContributionTable.sourcesByRuleId) return modifierContributionTable;
  modifierContributionTablePromise ??= (async () => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), MODIFIER_CONTRIBUTION_LOAD_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(modifierContributionTableUrl, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`Failed to load modifier contribution table: ${response.status}`);
      }
      modifierContributionTable = await response.json() as ModifierContributionTable;
      return modifierContributionTable;
    } catch (err) {
      console.warn("[history] modifier contribution table unavailable", err);
      modifierContributionTable = {};
      return modifierContributionTable;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  })();
  return modifierContributionTablePromise;
}

async function loadModifierDescriptionsTable(): Promise<ModifierDescriptionTable> {
  if (modifierDescriptionsTable.sourcesByRuleId) return modifierDescriptionsTable;
  modifierDescriptionsTablePromise ??= (async () => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), MODIFIER_DESCRIPTIONS_LOAD_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(modifierDescriptionsTableUrl, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`Failed to load modifier descriptions table: ${response.status}`);
      }
      modifierDescriptionsTable = await response.json() as ModifierDescriptionTable;
      return modifierDescriptionsTable;
    } catch (err) {
      console.warn("[history] modifier descriptions table unavailable", err);
      modifierDescriptionsTable = {};
      return modifierDescriptionsTable;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  })();
  return modifierDescriptionsTablePromise;
}

function displayFieldsForRule(ruleId: string, entry: ModifierSourceCatalogEntry): Pick<
  ModifierSourceCatalogEntry,
  "sourceName" | "sourceNames" | "iconPath" | "displayOwnerKind"
> {
  const display = modifierDisplayTable.sourcesByRuleId?.[ruleId];
  return {
    sourceName: display?.sourceName?.trim() || entry.sourceName?.trim() || entry.sourceId,
    ...(display?.sourceNames ?? entry.sourceNames
      ? { sourceNames: display?.sourceNames ?? entry.sourceNames }
      : {}),
    ...(display?.iconPath ?? entry.iconPath
      ? { iconPath: display?.iconPath ?? entry.iconPath }
      : {}),
    ...(display?.displayOwnerKind ?? entry.displayOwnerKind
      ? { displayOwnerKind: display?.displayOwnerKind ?? entry.displayOwnerKind }
      : {}),
  };
}

function enrichCatalogEntry(ruleId: string, entry: ModifierSourceCatalogEntry): ModifierSourceCatalogEntry {
  const classification = modifierClassificationTable.sourcesByRuleId?.[ruleId];
  const contributionModel = modifierContributionTable.sourcesByRuleId?.[ruleId];
  const descriptionFields = modifierDescriptionsTable.sourcesByRuleId?.[ruleId];
  const displayFields = displayFieldsForRule(ruleId, entry);
  if (!classification) {
    return {
      ...entry,
      sourceRuleId: ruleId,
      ...displayFields,
      ...(descriptionFields?.description ? { description: descriptionFields.description } : {}),
      ...(descriptionFields?.descriptions ? { descriptions: descriptionFields.descriptions } : {}),
      ...(contributionModel ? { contributionModel } : {}),
    };
  }
  return {
    ...entry,
    sourceRuleId: ruleId,
    ...displayFields,
    ...(descriptionFields?.description ? { description: descriptionFields.description } : {}),
    ...(descriptionFields?.descriptions ? { descriptions: descriptionFields.descriptions } : {}),
    classification,
    ...(contributionModel ? { contributionModel } : {}),
    ...((entry.talentOwnership ?? classification.ownership)
      ? { talentOwnership: entry.talentOwnership ?? classification.ownership }
      : {}),
  };
}

function isAlreadyOwnerQualified(entry: ModifierSourceCatalogEntry): boolean {
  const candidates = [
    entry.sourceName,
    entry.sourceNames?.["en"],
    entry.sourceNames?.["zh-CN"],
    entry.sourceNames?.["design"],
  ];
  return candidates.some((value) => /\s+-\s+| - |！|!/.test(value?.trim() ?? ""));
}

function qualifyLocalizedNames(
  ownerNames: LocalizedTextMap | undefined,
  childNames: LocalizedTextMap | undefined,
  ownerFallback: string,
  childFallback: string,
): LocalizedTextMap {
  const locales = new Set([
    ...Object.keys(ownerNames ?? {}),
    ...Object.keys(childNames ?? {}),
    "en",
  ]);
  const out: LocalizedTextMap = {};
  for (const locale of locales) {
    const owner = ownerNames?.[locale]?.trim() || ownerNames?.["en"]?.trim() || ownerFallback;
    const child = childNames?.[locale]?.trim() || childNames?.["en"]?.trim() || childFallback;
    out[locale] = `${owner} - ${child}`;
  }
  return out;
}

function splitOwnerQualifiedLabel(value: string | undefined): { owner: string; child: string } | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const match = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const owner = match[1]?.trim();
  const child = match[2]?.trim();
  return owner && child ? { owner, child } : null;
}

function replaceImagineDesignOwnerNames(entry: ModifierSourceCatalogEntry): ModifierSourceCatalogEntry {
  if (entry.sourceKind !== "imagine") return entry;
  const fallbackParts = splitOwnerQualifiedLabel(entry.sourceNames?.["en"] ?? entry.sourceName);
  if (!fallbackParts) return entry;
  const owner = imagineOwnerNamesByDesignName.get(normalizeDisplayOwnerKey(fallbackParts.owner));
  if (!owner) return entry;

  const locales = new Set([
    ...Object.keys(entry.sourceNames ?? {}),
    ...Object.keys(owner.names ?? {}),
    "en",
  ]);
  const sourceNames: LocalizedTextMap = {};
  for (const locale of locales) {
    const sourceLabel = entry.sourceNames?.[locale]?.trim()
      || entry.sourceNames?.["en"]?.trim()
      || entry.sourceName;
    const parts = splitOwnerQualifiedLabel(sourceLabel) ?? fallbackParts;
    const ownerName = owner.names?.[locale]?.trim()
      || owner.names?.["en"]?.trim()
      || owner.name;
    sourceNames[locale] = `${ownerName} - ${parts.child}`;
  }

  return {
    ...entry,
    sourceName: sourceNames["en"] ?? `${owner.name} - ${fallbackParts.child}`,
    sourceNames,
  };
}

function mergeLocalizedTextMaps(
  base: LocalizedTextMap | undefined,
  incoming: LocalizedTextMap | undefined,
  overwrite = false,
): LocalizedTextMap | undefined {
  if (!base && !incoming) return undefined;
  const merged: LocalizedTextMap = { ...(base ?? {}) };
  for (const [locale, value] of Object.entries(incoming ?? {})) {
    const text = value.trim();
    if (!text) continue;
    if (overwrite || !merged[locale]?.trim()) merged[locale] = text;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buffSourceIdFromEntry(entry: ModifierSourceCatalogEntry): number | null {
  const match = entry.sourceId.match(/^buff-source:(\d+)(?:$|\|)/);
  if (match) return finitePositiveNumber(match[1]);
  return null;
}

function isRuntimeSourceConfigQualified(entry: ModifierSourceCatalogEntry): boolean {
  return entry.sourceId.includes("|source-config:")
    || (entry.runtimeSourceConfigIds?.length ?? 0) > 0;
}

function hasOwnerQualifiedImagineBuffName(
  entry: ModifierSourceCatalogEntry,
  names: LocalizedTextMap | undefined,
): boolean {
  return entry.sourceKind === "imagine"
    && Object.values(names ?? {}).some((value) => /\s+-\s+/.test(value.trim()));
}

function decorateBuffSourceCatalogEntry(entry: ModifierSourceCatalogEntry): ModifierSourceCatalogEntry {
  const ownerDecorated = replaceImagineDesignOwnerNames(entry);
  if (isRuntimeSourceConfigQualified(ownerDecorated)) return ownerDecorated;
  const buffId = buffSourceIdFromEntry(ownerDecorated);
  if (buffId === null) return ownerDecorated;

  const buffNames = lookupBuffLocalizedNames(buffId);
  if (!hasOwnerQualifiedImagineBuffName(ownerDecorated, buffNames)) return ownerDecorated;
  const sourceNames = mergeLocalizedTextMaps(ownerDecorated.sourceNames, buffNames, true);
  const sourceName = sourceNames?.["en"]?.trim()
    || lookupDefaultBuffName(buffId)
    || ownerDecorated.sourceName
    || ownerDecorated.sourceId;
  return {
    ...ownerDecorated,
    sourceName,
    ...(sourceNames ? { sourceNames } : {}),
  };
}

function shouldQualifyRuntimeImagineEntry(
  entry: ModifierSourceCatalogEntry,
  sourceConfigId: number,
): boolean {
  if (entry.sourceKind !== "imagine") return false;
  if ((entry.targetDamageIds?.length ?? 0) > 0 || (entry.targetRecountIds?.length ?? 0) > 0) return false;
  if (!sourceConfigSkillNames.has(sourceConfigId)) return false;
  return !isAlreadyOwnerQualified(entry);
}

function qualifyRuntimeImagineEntry(
  entry: ModifierSourceCatalogEntry,
  baseId: number,
  sourceConfigId: number,
): ModifierSourceCatalogEntry {
  const owner = sourceConfigSkillNames.get(sourceConfigId);
  if (!owner) return entry;
  const { displayOwnerKind: _displayOwnerKind, ...entryWithoutGenericOwner } = entry;
  const sourceNames = qualifyLocalizedNames(owner.names, entry.sourceNames, owner.name, entry.sourceName ?? entry.sourceId);
  return {
    ...entryWithoutGenericOwner,
    sourceId: `${entry.sourceId}|source-config:${sourceConfigId}`,
    sourceEntityId: sourceConfigId,
    sourceName: sourceNames["en"] ?? `${owner.name} - ${entry.sourceName}`,
    sourceNames,
    runtimeSourceConfigIds: sortedNumbers([sourceConfigId]),
    runtimeBaseIds: sortedNumbers([baseId]),
    evidence: [
      ...entry.evidence,
      `runtimeSourceConfig:${sourceConfigId}`,
      `runtimeBaseBuff:${baseId}`,
    ],
  };
}

function bucketIds(entity: HistoryEntityData): number[] {
  const ids = new Set<number>();
  for (const bucket of entity.modifierHitBuckets ?? []) {
    const baseId = finitePositiveNumber(bucket.modifierBaseId);
    const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
    if (baseId !== null) ids.add(baseId);
    if (sourceConfigId !== null) ids.add(sourceConfigId);
  }
  return sortedNumbers(ids);
}

function reportableEntriesForBuffId(buffId: number): ModifierSourceCatalogEntry[] {
  return (modifierRecountTable.byBuffId?.[String(buffId)] ?? [])
    .map((entryId) => {
      const entry = modifierRecountTable.sourcesById?.[entryId];
      return entry ? enrichCatalogEntry(entryId, entry) : undefined;
    })
    .filter((entry): entry is ModifierSourceCatalogEntry => Boolean(entry))
    .filter(isCatalogReportEntry);
}

function ownershipSpecIds(ownership: ModifierSourceCatalogEntry["talentOwnership"] | undefined): number[] {
  const typedOwnership = ownership as (ModifierSourceCatalogEntry["talentOwnership"] & {
    allowedSpecIds?: number[];
  }) | undefined;
  return sortedNumbers([
    ...(typedOwnership?.specIds ?? []),
    ...(typedOwnership?.allowedSpecIds ?? []),
  ].map(finitePositiveNumber).filter((id): id is number => id !== null));
}

function inferEntitySpecIdsFromCatalog(
  entity: HistoryEntityData,
  byBuffId: Record<string, ModifierSourceCatalogEntry[]>,
): number[] {
  const specIds = new Set<number>();

  for (const talent of entity.activeProfessionTalents ?? []) {
    const professionId = finitePositiveNumber(talent.professionId);
    if (professionId !== null && entity.classId > 0 && professionId !== entity.classId) continue;
    const nodeId = finitePositiveNumber(talent.talentNodeId);
    const decoded = nodeId !== null ? decodeProfessionTalentNodeId(nodeId) : null;
    if (decoded !== null) {
      for (const entry of modifierRecountTable.sourcesById ? Object.entries(modifierRecountTable.sourcesById) : []) {
        const [ruleId, source] = entry;
        const enriched = enrichCatalogEntry(ruleId, source);
        const ownership = enriched.talentOwnership;
        if (ownership?.ownershipKind !== "spec-selector") continue;
        if (finitePositiveNumber(enriched.sourceEntityId) !== decoded) continue;
        for (const specId of ownershipSpecIds(ownership)) specIds.add(specId);
      }
    }
  }

  for (const buffId of bucketIds(entity)) {
    for (const entry of byBuffId[String(buffId)] ?? []) {
      const ownership = entry.talentOwnership;
      if (ownership?.ownershipKind !== "spec-selector") continue;
      const classId = finitePositiveNumber(ownership.classId);
      if (classId !== null && entity.classId > 0 && classId !== entity.classId) continue;
      for (const specId of ownershipSpecIds(ownership)) specIds.add(specId);
    }
  }

  return sortedNumbers(specIds);
}

function addCatalogEntry(
  byBuffId: Record<string, ModifierSourceCatalogEntry[]>,
  buffId: number,
  entry: ModifierSourceCatalogEntry,
): void {
  const key = String(buffId);
  const rows = byBuffId[key] ?? [];
  if (!rows.some((existing) => existing.sourceId === entry.sourceId)) rows.push(entry);
  byBuffId[key] = rows;
}

function addRuntimeQualifiedImagineEntries(
  byBuffId: Record<string, ModifierSourceCatalogEntry[]>,
  reportableBuffIds: Set<number>,
  entity: HistoryEntityData,
): void {
  const seenPairs = new Set<string>();
  for (const bucket of entity.modifierHitBuckets ?? []) {
    const baseId = finitePositiveNumber(bucket.modifierBaseId);
    const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
    if (baseId === null || sourceConfigId === null || sourceConfigId === baseId) continue;
    const pairKey = `${baseId}:${sourceConfigId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const baseEntries = reportableEntriesForBuffId(baseId);
    for (const entry of baseEntries) {
      if (!shouldQualifyRuntimeImagineEntry(entry, sourceConfigId)) continue;
      const qualified = qualifyRuntimeImagineEntry(entry, baseId, sourceConfigId);
      addCatalogEntry(byBuffId, sourceConfigId, qualified);
      reportableBuffIds.add(sourceConfigId);
    }
  }
}

function recordObservedBuff(
  summaries: Map<number, ModifierObservedBuffSummary>,
  buffId: number,
  role: "base" | "sourceConfig",
  bucket: HistoryEntityData["modifierHitBuckets"][number],
): void {
  let summary = summaries.get(buffId);
  if (!summary) {
    summary = {
      buffId,
      roles: [],
      bucketCount: 0,
      hits: 0,
      totalValue: 0,
      effectiveTotalValue: 0,
      pairedBaseIds: [],
      pairedSourceConfigIds: [],
      sampleSkillIds: [],
      sampleDamageIds: [],
    };
    summaries.set(buffId, summary);
  }
  if (!summary.roles.includes(role)) summary.roles.push(role);
  summary.bucketCount += 1;
  summary.hits += Number(bucket.hits) || 0;
  summary.totalValue += Number(bucket.totalValue) || 0;
  summary.effectiveTotalValue += Number(bucket.effectiveTotalValue) || 0;
  const baseId = finitePositiveNumber(bucket.modifierBaseId);
  const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
  const skillId = finitePositiveNumber(bucket.skillKey);
  const damageId = finitePositiveNumber(bucket.damageId);
  if (baseId !== null && !summary.pairedBaseIds.includes(baseId)) summary.pairedBaseIds.push(baseId);
  if (sourceConfigId !== null && !summary.pairedSourceConfigIds.includes(sourceConfigId)) {
    summary.pairedSourceConfigIds.push(sourceConfigId);
  }
  if (skillId !== null && summary.sampleSkillIds.length < 12 && !summary.sampleSkillIds.includes(skillId)) {
    summary.sampleSkillIds.push(skillId);
  }
  if (damageId !== null && summary.sampleDamageIds.length < 12 && !summary.sampleDamageIds.includes(damageId)) {
    summary.sampleDamageIds.push(damageId);
  }
}

function observedBuffSummaries(
  entity: HistoryEntityData,
  reportableBuffIds: Set<number>,
  ignoredBuffIds: Set<number>,
): ModifierObservedBuffSummary[] {
  const summaries = new Map<number, ModifierObservedBuffSummary>();
  for (const bucket of entity.modifierHitBuckets ?? []) {
    const baseId = finitePositiveNumber(bucket.modifierBaseId);
    const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
    if (baseId !== null) recordObservedBuff(summaries, baseId, "base", bucket);
    if (sourceConfigId !== null) recordObservedBuff(summaries, sourceConfigId, "sourceConfig", bucket);
  }

  return [...summaries.values()]
    .filter((summary) => !reportableBuffIds.has(summary.buffId) && !ignoredBuffIds.has(summary.buffId))
    .map((summary) => ({
      ...summary,
      roles: [...summary.roles].sort(),
      pairedBaseIds: sortedNumbers(summary.pairedBaseIds),
      pairedSourceConfigIds: sortedNumbers(summary.pairedSourceConfigIds),
      sampleSkillIds: sortedNumbers(summary.sampleSkillIds),
      sampleDamageIds: sortedNumbers(summary.sampleDamageIds),
    }))
    .sort((left, right) => (right.hits - left.hits) || (right.totalValue - left.totalValue) || (left.buffId - right.buffId))
    .slice(0, 80);
}

function decorateCatalogEntries(
  byBuffId: Record<string, ModifierSourceCatalogEntry[]>,
): Record<string, ModifierSourceCatalogEntry[]> {
  return Object.fromEntries(
    Object.entries(byBuffId).map(([buffId, entries]) => [
      buffId,
      entries.map(decorateBuffSourceCatalogEntry),
    ]),
  );
}

export async function buildModifierSourceCatalog(entity: HistoryEntityData): Promise<ModifierSourceCatalog> {
  await Promise.all([
    loadModifierClassificationTable(),
    loadModifierContributionTable(),
    loadModifierDescriptionsTable(),
  ]);
  let byBuffId: Record<string, ModifierSourceCatalogEntry[]> = {};
  const reportableBuffIds = new Set<number>();
  for (const buffId of bucketIds(entity)) {
    const entries = reportableEntriesForBuffId(buffId);
    if (entries.length > 0) {
      byBuffId[String(buffId)] = entries;
      reportableBuffIds.add(buffId);
    }
  }
  addRuntimeQualifiedImagineEntries(byBuffId, reportableBuffIds, entity);
  byBuffId = decorateCatalogEntries(byBuffId);
  const ownerSpecIds = inferEntitySpecIdsFromCatalog(entity, byBuffId);
  const ignoredBuffIds = sortedNumbers(modifierRecountTable.ignoredBuffIds ?? []);
  const ignoredBuffIdSet = new Set(ignoredBuffIds);
  return {
    byBuffId,
    ignoredBuffIds,
    reportableBuffIds: sortedNumbers(reportableBuffIds),
    debugBuffIds: sortedNumbers(modifierRecountTable.debugBuffIds ?? []),
    unmappedObservedBuffs: observedBuffSummaries(entity, reportableBuffIds, ignoredBuffIdSet),
    ...(entity.classId > 0 ? { ownerClassId: entity.classId } : {}),
    ...(ownerSpecIds.length > 0 ? { ownerSpecIds } : {}),
  };
}
