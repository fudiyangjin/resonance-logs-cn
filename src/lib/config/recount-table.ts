import damageAttrIdNamesData from "$parserData/generated/DamageAttrIdName.json";
import buffNamesData from "$parserData/generated/BuffName.json";
import effectSourcesData from "$parserData/generated/EffectSources.json";
import recountTableData from "$parserData/generated/RecountTable.json";
import seasonPhantomFactorsData from "$parserData/generated/SeasonPhantomFactors.json";
import skillBreakdownDetailsData from "$parserData/generated/SkillBreakdownDetails.json";
import { lookupFirstSkillIconPath } from "$lib/skill-mappings";
import { resolveStaticIconUrl } from "$lib/config/static-icon-resolver";

export type RawSkillStatsLike = {
  totalValue: number;
  effectiveTotalValue?: number;
  hits: number;
  critHits: number;
  critTotalValue: number;
  luckyHits: number;
  luckyTotalValue: number;
  property?: number | null;
  damageMode?: number | null;
};

export type LocalizedTextMap = Record<string, string>;
export type SkillContributionKind = "exact" | "source-only";

export type SkillContributionAttribution = {
  kind: SkillContributionKind;
  basis:
    | "direct-damage-row"
    | "source-evidence";
  label: string;
  detail: string;
  modifierPercent?: number;
  allocatedFromTotal?: number;
  gradeStatus?: string;
};

export type SkillBreakdownDetail = {
  Id: number | string;
  DisplayName?: string;
  DisplayNames?: LocalizedTextMap;
  DisplayDetailName?: string;
  DisplayDetailNames?: LocalizedTextMap;
  DisplayDetailKind?: string;
  DisplayDetailSource?: string;
  DisplayDetailEvidence?: Record<string, string | number | boolean>;
  DisplayVariantName?: string;
  DisplayVariantNames?: LocalizedTextMap;
  DisplayVariantKind?: string;
  DisplayVariantSource?: string;
  DisplayVariantEvidence?: Record<string, string | number | boolean>;
  Category?: string;
  CategoryLabel?: string;
  Badge?: string;
  SourceKind?: string;
  SourceRole?: string;
  SourceType?: string;
  Confidence?: number;
  Reason?: string;
  Reasons?: string[];
  DamageName?: string;
  DamageNames?: LocalizedTextMap;
  DamageKind?: string;
  DetailKind?: string;
  ParentRecountId?: number | string;
  ParentRecountName?: string;
  ParentRecountNames?: LocalizedTextMap;
  ParentBaseSkillId?: number | string;
  ParentBaseSkillName?: string;
  ParentBaseSkillNames?: LocalizedTextMap;
  ParentTalentId?: number | string;
  ParentTalentName?: string;
  ParentTalentNames?: LocalizedTextMap;
  TalentFormulaBridge?: string;
  TalentNameBridge?: string;
  LinkedTalentBuffIds?: Array<number | string>;
  LinkedTalentFormulaIds?: Array<number | string>;
  SourceTalentId?: number | string;
  SourceTalentName?: string;
  SourceTalentNames?: LocalizedTextMap;
  SourceTalentBridge?: string;
  SourceTalentSkillBridgeMatches?: number | Array<Record<string, unknown>>;
  LinkedSourceTalentSkillIds?: Array<number | string>;
  LinkedSource?: string;
  LinkedId?: number | string;
  LinkedName?: string;
  LinkedNames?: LocalizedTextMap;
  LinkedSkillId?: number | string;
  LinkedSkillEffectId?: number | string;
  LinkedBuffId?: number | string;
  BuffSourceId?: number | string;
  RecountOwnerSkillId?: number | string;
  RecountOwnerSkillName?: string;
  RecountOwnerSkillNames?: LocalizedTextMap;
  MonsterOwnerIds?: Array<number | string>;
  MonsterOwnerName?: string;
  MonsterOwnerNames?: LocalizedTextMap;
  MonsterOwnerSource?: string;
  MonsterOwners?: Array<Record<string, unknown>>;
  UnderlyingSkillId?: number | string;
  UnderlyingSkillName?: string;
  UnderlyingSkillNames?: LocalizedTextMap;
  IsRecountOwnerSkillMismatch?: boolean;
  IsRecountOwnerNameMismatch?: boolean;
  IconPath?: string;
  IconPaths?: string[];
  IconSource?: string;
  LinkedBaseSkillIconPath?: string;
  LinkedTalentIconPath?: string;
  LinkedSourceTalentIconPath?: string;
  SourceFiles?: string[];
  SourceOffsets?: number[];
};

export type ActiveFactorBuffLike = {
  factorBuffId: number;
  observedBuffId?: number;
  buffLevel?: number | null;
  partId?: number | null;
  count?: number | null;
  fightSourceType?: number | null;
  sourceConfigId?: number | null;
};

export type ActiveFactorItemLike = {
  factorBuffId: number;
  itemConfigId: number;
  itemUuid?: number | null;
  packageKey: number;
  packageType?: number | null;
  grade?: number | null;
  familyId?: number | null;
  runtimeSource?: string;
  selectorPath?: string | null;
  selectorSignature?: string | null;
  selectorOffset?: number | null;
};

export type ActiveEffectBuffLike = {
  effectSourceBuffId: number;
  observedBuffId?: number;
  buffLevel?: number | null;
  partId?: number | null;
  count?: number | null;
  fightSourceType?: number | null;
  sourceConfigId?: number | null;
};

export type ActiveEffectSourceLike = {
  sourceId: string;
  runtimeSource?: string;
  sourceEntityId?: number | null;
  nodeId?: number | null;
  nodeLevel?: number | null;
  slot?: number | null;
};

export type SkillGroupingOptions = {
  includeContributionSources?: boolean;
};

export type ActiveSkillFactor = {
  factorBuffId: number;
  observedBuffId: number;
  runtimeObserved?: boolean;
  runtimeDetection?: string;
  buffLevel?: number | null;
  partId?: number | null;
  count?: number | null;
  fightSourceType?: number | null;
  familyId: number;
  familyName: string;
  familyNames?: LocalizedTextMap;
  evidenceSource: string;
  evidenceStatuses?: string[];
  relationshipKind?: string;
  targetKind: "damage" | "recount";
  affectedDamageId?: number;
  affectedRecountId?: number;
  gradeKnown: false;
  observedItemId?: number;
  observedItemIds?: number[];
  observedGrade?: number;
  observedGrades?: number[];
  observedValueTexts?: string[];
  observedResolvedDescription?: string;
  observedResolvedDescriptions?: string[];
  runtimeGradeSource?: string;
  runtimeGradeStatus?: string;
};

export type ActiveSkillEffect = {
  sourceId: string;
  sourceKind: string;
  sourceType?: string;
  sourceEntityId?: number;
  sourceName: string;
  sourceNames?: LocalizedTextMap;
  effectSourceBuffId?: number;
  observedBuffId?: number;
  buffLevel?: number | null;
  partId?: number | null;
  count?: number | null;
  fightSourceType?: number | null;
  runtimeSource?: string;
  selectedSourceId?: string;
  selectedNodeId?: number | null;
  selectedNodeLevel?: number | null;
  selectedSlot?: number | null;
  evidenceSource: string;
  evidenceStatus?: string;
  relationshipKind?: string;
  runtimeDetection?: string;
  runtimeObserved: boolean;
  targetKind: "damage" | "recount";
  affectedDamageId?: number;
  affectedRecountId?: number;
  modifierEvidence?: EffectModifierEvidence;
};

export type EffectModifierGradeRow = {
  grade?: number;
  itemId?: number;
  itemQualityTier?: number;
  parameterValues?: number[];
  valueTexts?: string[];
  cleanResolvedDescription?: string;
  sourceOffset?: number;
};

export type EffectModifierEvidence = {
  source?: string;
  valueStatus?: string;
  runtimeSelectionStatus?: string;
  descriptionId?: number;
  cleanDescription?: string;
  valueTexts?: string[];
  gradeRows?: EffectModifierGradeRow[];
};

export type SkillDisplayRow = {
  skillId: number;
  mergedSkillIds?: number[];
  name: string;
  names?: LocalizedTextMap;
  sourceRowKind?: "factor";
  sourceFactorId?: number;
  sourceName?: string;
  sourceNames?: LocalizedTextMap;
  attribution: SkillContributionAttribution;
  details?: SkillBreakdownDetail;
  activeFactors?: ActiveSkillFactor[];
  activeEffects?: ActiveSkillEffect[];
  showSkillId?: boolean;
  totalDmg: number;
  effectiveTotal: number;
  dps: number;
  effectiveDps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  hits: number;
  hitsPerMinute: number;
  property: number | null;
  damageMode: number | null;
  raw: RawSkillStatsLike;
};

export type RecountGroup = {
  recountId: number;
  recountName: string;
  totalDmg: number;
  effectiveTotal: number;
  dps: number;
  effectiveDps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  hits: number;
  hitsPerMinute: number;
  property: number | null;
  damageMode: number | null;
  raw: RawSkillStatsLike;
  activeFactors?: ActiveSkillFactor[];
  activeEffects?: ActiveSkillEffect[];
  skills: SkillDisplayRow[];
};

type RecountEntry = {
  Id: number;
  RecountName: string;
  Names?: LocalizedTextMap;
  DamageId: number[];
  IconPath?: string;
  IconPaths?: string[];
  LinkedBaseSkillId?: number | string;
  LinkedBaseSkillIconPath?: string;
  LinkedTalentIconPath?: string;
  LinkedSourceTalentIconPath?: string;
};

type DamageAttrNameEntry = string | {
  Name?: string;
  Names?: LocalizedTextMap;
  DamageName?: string;
  IconPath?: string;
  IconPaths?: string[];
  LinkedBaseSkillIconPath?: string;
  LinkedTalentIconPath?: string;
  LinkedSourceTalentIconPath?: string;
  LinkedSkillEffectSkillTableIconPath?: string;
  LinkedSkillEffectSkillTableParentIconPath?: string;
  LinkedSkillTableIconPath?: string;
  LinkedSkillTableParentIconPath?: string;
  LinkedBuffIconFamilySourceId?: number | string;
  LinkedBuffIconFamilySourceName?: string;
};

type BuffNameEntry = {
  Id?: number | string;
  Name?: string;
  Names?: LocalizedTextMap;
  NameDesign?: string;
  DesignName?: string;
};

type SeasonPhantomFactorEntry = {
  familyId?: number;
  buffId: number;
  familyName?: string;
  familyNames?: LocalizedTextMap;
  modifierEvidence?: EffectModifierEvidence;
  affectedDamageIds?: number[];
  affectedRecountIds?: number[];
  affectedDamageEvidence?: Record<string, SeasonPhantomFactorEvidence>;
  affectedRecountEvidence?: Record<string, SeasonPhantomFactorEvidence>;
};

type SeasonPhantomFactorEvidence = {
    source?: string;
    sourceTable?: string;
    relationshipKind?: string;
    evidenceStatuses?: string[];
    descriptionId?: number;
    localeId?: string;
    targetText?: string;
    candidateText?: string;
    matchedText?: string;
    category?: string;
    categoryLabel?: string;
    sourceKind?: string;
    sourceType?: string;
};

type SeasonPhantomFactorData = {
  factorBuffIds?: number[];
  factorsByBuffId?: Record<string, SeasonPhantomFactorEntry>;
  damageIdToFactorBuffIds?: Record<string, number[]>;
  recountIdToFactorBuffIds?: Record<string, number[]>;
};

type EffectSourceTarget = {
  targetKind?: "damage" | "recount";
  damageId?: number;
  recountId?: number;
  relationshipKind?: string;
  evidenceSource?: string;
  evidenceStatus?: string;
};

type EffectSourceEntry = {
  sourceId: string;
  sourceKind?: string;
  sourceType?: string;
  sourceName?: string;
  sourceNames?: LocalizedTextMap;
  sourceEntityId?: number;
  familyId?: number;
  runtimeDetection?: string;
  buffIds?: number[];
  targets?: EffectSourceTarget[];
  modifierEvidence?: EffectModifierEvidence;
};

type EffectSourcesData = {
  effectSourcesById?: Record<string, EffectSourceEntry>;
  buffIdToEffectSourceIds?: Record<string, string[]>;
  damageIdToEffectSourceIds?: Record<string, string[]>;
  recountIdToEffectSourceIds?: Record<string, string[]>;
};

const recountTable = recountTableData as Record<string, RecountEntry>;
const damageAttrIdNames = damageAttrIdNamesData as Record<string, DamageAttrNameEntry>;
const buffNamesById = new Map<string, BuffNameEntry>(
  (buffNamesData as BuffNameEntry[])
    .filter((entry) => entry.Id !== undefined)
    .map((entry) => [String(entry.Id), entry]),
);
const skillBreakdownDetails = skillBreakdownDetailsData as Record<
  string,
  SkillBreakdownDetail
>;
const seasonPhantomFactors = seasonPhantomFactorsData as SeasonPhantomFactorData;
const factorsByBuffId = seasonPhantomFactors.factorsByBuffId ?? {};
const damageIdToFactorBuffIds = seasonPhantomFactors.damageIdToFactorBuffIds ?? {};
const recountIdToFactorBuffIds = seasonPhantomFactors.recountIdToFactorBuffIds ?? {};
const effectSources = effectSourcesData as EffectSourcesData;
const effectSourcesById = effectSources.effectSourcesById ?? {};
const buffIdToEffectSourceIds = effectSources.buffIdToEffectSourceIds ?? {};
const damageIdToEffectSourceIds = effectSources.damageIdToEffectSourceIds ?? {};
const recountIdToEffectSourceIds = effectSources.recountIdToEffectSourceIds ?? {};

const DAMAGE_TO_RECOUNT = new Map<number, { recountId: number; recountName: string }>();

for (const entry of Object.values(recountTable)) {
  for (const did of entry.DamageId) {
    DAMAGE_TO_RECOUNT.set(did, { recountId: entry.Id, recountName: entry.RecountName });
  }
}

for (const factor of Object.values(factorsByBuffId)) {
  const recountIds = uniqueNumberList((factor.affectedRecountIds ?? []).map(Number));
  if (recountIds.length !== 1) continue;
  const recountId = recountIds[0]!;
  const recount = recountTable[String(recountId)];
  if (!recount) continue;
  for (const damageId of uniqueNumberList((factor.affectedDamageIds ?? []).map(Number))) {
    if (DAMAGE_TO_RECOUNT.has(damageId)) continue;
    DAMAGE_TO_RECOUNT.set(damageId, {
      recountId,
      recountName: recount.RecountName,
    });
  }
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function rate(hits: number, totalHits: number): number {
  if (totalHits <= 0) return 0;
  return (hits / totalHits) * 100;
}

function exactContribution(detail = "Measured directly from emitted damage packets."): SkillContributionAttribution {
  return {
    kind: "exact",
    basis: "direct-damage-row",
    label: "Exact",
    detail,
  };
}

function sourceOnlyContribution(detail = "Linked source evidence is present, but no separate emitted damage row is available."): SkillContributionAttribution {
  return {
    kind: "source-only",
    basis: "source-evidence",
    label: "Source only",
    detail,
  };
}

function perMinute(value: number, elapsedSecs: number): number {
  if (elapsedSecs <= 0) return 0;
  return (value / elapsedSecs) * 60;
}

function isDesignOnlyTextMap(values: LocalizedTextMap | undefined): boolean {
  if (!values) return false;
  return Object.entries(values).every(([locale, value]) =>
    locale === "design" || !value?.trim()
  );
}

function resolveLinkedBuffFamilyName(
  entry: DamageAttrNameEntry | undefined,
  locale: string,
): string | undefined {
  if (!entry || typeof entry === "string") return undefined;
  const familyId = entry.LinkedBuffIconFamilySourceId;
  if (familyId === undefined || familyId === null) return undefined;
  const familyEntry = buffNamesById.get(String(familyId));
  const familyName = resolveLocalizedText(
    familyEntry?.Names,
    locale,
    entry.LinkedBuffIconFamilySourceName ?? familyEntry?.Name ?? familyEntry?.NameDesign ?? "",
  ).trim();
  return familyName || undefined;
}

function resolveDamageAttrName(
  entry: DamageAttrNameEntry | undefined,
  locale = "en",
): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry) return undefined;
  const localized = resolveLocalizedText(
    entry.Names,
    locale,
    entry.Name ?? entry.DamageName ?? "",
  ).trim();
  if (localized && !isDesignOnlyTextMap(entry.Names)) return localized;

  return resolveLinkedBuffFamilyName(entry, locale)
    ?? localized
    ?? entry.Name
    ?? entry.DamageName;
}

function lookupDamageAttrIconPath(damageId: number | string): string | undefined {
  const entry = damageAttrIdNames[String(damageId)];
  if (!entry || typeof entry === "string") return undefined;

  return resolveStaticIconUrl(
    entry.IconPath,
    ...(entry.IconPaths ?? []),
    entry.LinkedBaseSkillIconPath,
    entry.LinkedTalentIconPath,
    entry.LinkedSourceTalentIconPath,
    entry.LinkedSkillEffectSkillTableIconPath,
    entry.LinkedSkillEffectSkillTableParentIconPath,
    entry.LinkedSkillTableIconPath,
    entry.LinkedSkillTableParentIconPath,
  );
}

export function lookupDamageIdName(damageId: number): string {
  const recount = DAMAGE_TO_RECOUNT.get(damageId);
  if (recount) return recount.recountName;
  return resolveDamageAttrName(damageAttrIdNames[String(damageId)]) ?? `Unknown (${damageId})`;
}

export function lookupChildDamageIdName(damageId: number): string {
  const individual = resolveDamageAttrName(damageAttrIdNames[String(damageId)]);
  if (individual) return individual;
  return lookupDamageIdName(damageId);
}

function lookupLocalizedDamageIdName(damageId: number | string, locale: string): string {
  const damageIdNumber = Number(damageId);
  if (Number.isFinite(damageIdNumber)) {
    const recount = DAMAGE_TO_RECOUNT.get(damageIdNumber);
    if (recount) {
      const group = recountTable[String(recount.recountId)];
      return resolveLocalizedText(group?.Names, locale, recount.recountName);
    }
  }
  return resolveDamageAttrName(damageAttrIdNames[String(damageId)], locale) ?? `Unknown (${damageId})`;
}

export function lookupSkillBreakdownDetail(
  skillId: number | string,
): SkillBreakdownDetail | undefined {
  return skillBreakdownDetails[String(skillId)];
}

export function lookupSkillBreakdownIconPath(skillId: number | string): string | undefined {
  const detail = lookupSkillBreakdownDetail(skillId);
  const iconPath = resolveStaticIconUrl(
    detail?.IconPath,
    ...(detail?.IconPaths ?? []),
    detail?.LinkedBaseSkillIconPath,
    detail?.LinkedTalentIconPath,
    detail?.LinkedSourceTalentIconPath,
  );
  if (iconPath) return iconPath;

  const damageIconPath = lookupDamageAttrIconPath(skillId);
  if (damageIconPath) return damageIconPath;

  return lookupFirstSkillIconPath([
    skillId,
    detail?.ParentBaseSkillId,
    detail?.LinkedSkillId,
    detail?.UnderlyingSkillId,
    detail?.RecountOwnerSkillId,
  ]);
}

export function lookupRecountGroupIconPath(recountId: number | string): string | undefined {
  const group = recountTable[String(recountId)];
  const iconPath = resolveStaticIconUrl(
    group?.IconPath,
    ...(group?.IconPaths ?? []),
    group?.LinkedBaseSkillIconPath,
    group?.LinkedTalentIconPath,
    group?.LinkedSourceTalentIconPath,
  );
  if (iconPath) return iconPath;

  const linkedIconPath = lookupFirstSkillIconPath([recountId, group?.LinkedBaseSkillId]);
  if (linkedIconPath) return linkedIconPath;

  for (const damageId of group?.DamageId ?? []) {
    const damageIconPath = lookupSkillBreakdownIconPath(damageId);
    if (damageIconPath) return damageIconPath;
  }
  return undefined;
}

export function resolveLocalizedText(
  values: LocalizedTextMap | undefined,
  locale: string,
  fallback: string,
): string {
  if (!values) return fallback;
  const direct = values[locale]?.trim();
  if (direct) return direct;
  const primary = values["en"]?.trim();
  if (primary) return primary;
  const simplified = values["zh-CN"]?.trim();
  if (simplified) return simplified;
  const design = values["design"]?.trim();
  if (design) return design;
  return fallback;
}

function normalizeDisplayText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveOwnerQualifiedLocalizedText(
  values: LocalizedTextMap | undefined,
  ownerValues: LocalizedTextMap | undefined,
  locale: string,
  fallback: string,
): string {
  const name = resolveLocalizedText(values, locale, fallback);
  const ownerName = resolveLocalizedText(ownerValues, locale, "");
  if (!name || !ownerName) return name;

  const normalizedName = normalizeDisplayText(name);
  const normalizedOwnerName = normalizeDisplayText(ownerName);
  if (
    normalizedName === normalizedOwnerName
    || normalizedName.includes(normalizedOwnerName)
  ) {
    return name;
  }

  return `${ownerName} - ${name}`;
}

function toFiniteNumber(value: number | string | undefined): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function directFactorLinksForSkill(
  skillId: number,
  detail: SkillBreakdownDetail | undefined,
): Map<number, string> {
  const links = new Map<number, string>();
  for (const factorBuffId of damageIdToFactorBuffIds[String(skillId)] ?? []) {
    if (factorsByBuffId[String(factorBuffId)]) {
      links.set(factorBuffId, "SeasonPhantomFactors.damageIdToFactorBuffIds");
    }
  }

  if (!detail) return links;

  const fields: Array<[string, number | string | undefined]> = [
    ["LinkedBuffId", detail.LinkedBuffId],
    ["BuffSourceId", detail.BuffSourceId],
    ["LinkedId", detail.LinkedId],
  ];
  for (const [field, value] of fields) {
    const factorBuffId = toFiniteNumber(value);
    if (factorBuffId === null || !factorsByBuffId[String(factorBuffId)]) continue;
    if (field === "LinkedId" && detail.LinkedSource && detail.LinkedSource !== "BuffName") {
      continue;
    }
    links.set(factorBuffId, `SkillBreakdownDetails.${field}`);
  }

  return links;
}

function buildStaticFactorForDamageRow(
  skillId: number,
  detail: SkillBreakdownDetail | undefined,
): ActiveSkillFactor | undefined {
  for (const [factorBuffId, fallbackSource] of directFactorLinksForSkill(skillId, detail)) {
    const factor = factorsByBuffId[String(factorBuffId)];
    if (!factor) continue;
    const evidence = factor.affectedDamageEvidence?.[String(skillId)];
    return {
      factorBuffId,
      observedBuffId: factorBuffId,
      runtimeObserved: false,
      runtimeDetection: "damage-row-observed-factor-link",
      familyId: factor.familyId ?? 0,
      familyName: factor.familyName ?? `Phantom Factor #${factorBuffId}`,
      ...(factor.familyNames ? { familyNames: factor.familyNames } : {}),
      evidenceSource: evidence?.source ?? fallbackSource,
      ...(evidence?.evidenceStatuses?.length ? { evidenceStatuses: evidence.evidenceStatuses } : {}),
      ...(evidence?.relationshipKind ? { relationshipKind: evidence.relationshipKind } : {}),
      targetKind: "damage",
      affectedDamageId: skillId,
      gradeKnown: false,
    };
  }
  return undefined;
}

function observedFactorItemsByFactorId(
  activeFactorItems: ActiveFactorItemLike[] = [],
): Map<number, ActiveFactorItemLike[]> {
  const observed = new Map<number, ActiveFactorItemLike[]>();
  for (const item of activeFactorItems) {
    if (!String(item.runtimeSource ?? "").startsWith("SyncContainerDirtyData.v_data.dirty_tree.")) {
      continue;
    }
    const factorBuffId = Number(item.factorBuffId);
    const itemConfigId = Number(item.itemConfigId);
    if (
      !Number.isFinite(factorBuffId)
      || !Number.isFinite(itemConfigId)
      || !factorsByBuffId[String(factorBuffId)]
    ) {
      continue;
    }
    const items = observed.get(factorBuffId) ?? [];
    items.push(item);
    observed.set(factorBuffId, items);
  }
  return observed;
}

function modifierGradeRowForItem(
  factor: SeasonPhantomFactorEntry,
  itemConfigId: number,
): EffectModifierGradeRow | undefined {
  return factor.modifierEvidence?.gradeRows?.find((row) => row.itemId === itemConfigId);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function attachObservedFactorItemEvidence(
  activeFactor: ActiveSkillFactor,
  factor: SeasonPhantomFactorEntry,
  observedItems: ActiveFactorItemLike[] | undefined,
): void {
  if (!observedItems?.length) return;

  const sortedItems = [...observedItems].sort((left, right) =>
    (Number(left.grade ?? 0) - Number(right.grade ?? 0))
      || (Number(left.itemConfigId ?? 0) - Number(right.itemConfigId ?? 0))
      || (Number(left.itemUuid ?? 0) - Number(right.itemUuid ?? 0))
  );
  const itemIds = uniqueNumberList(sortedItems.map((item) => Number(item.itemConfigId)));
  const grades = uniqueNumberList(
    sortedItems
      .map((item) =>
        Number(item.grade ?? modifierGradeRowForItem(factor, item.itemConfigId)?.grade)
      ),
  );
  const rows = sortedItems
    .map((item) => modifierGradeRowForItem(factor, item.itemConfigId))
    .filter((row): row is EffectModifierGradeRow => row !== undefined);
  const valueTexts = uniqueStrings(rows.flatMap((row) => row.valueTexts ?? []));
  const descriptions = uniqueStrings(
    rows.flatMap((row) => row.cleanResolvedDescription ? [row.cleanResolvedDescription] : []),
  );
  const sources = uniqueStrings(
    sortedItems.flatMap((item) => item.runtimeSource ? [item.runtimeSource] : []),
  );

  activeFactor.observedItemIds = itemIds;
  if (itemIds.length === 1) activeFactor.observedItemId = itemIds[0]!;
  if (grades.length) activeFactor.observedGrades = grades;
  if (grades.length === 1) activeFactor.observedGrade = grades[0]!;
  if (valueTexts.length) activeFactor.observedValueTexts = valueTexts;
  if (descriptions.length) activeFactor.observedResolvedDescriptions = descriptions;
  if (descriptions.length === 1) {
    activeFactor.observedResolvedDescription = descriptions[0]!;
  }
  if (sources.length) activeFactor.runtimeGradeSource = sources.join(", ");
  const packetProven = sortedItems.every((item) =>
    String(item.runtimeSource ?? "").startsWith("SyncContainerDirtyData.v_data.dirty_tree.")
  );
  activeFactor.runtimeGradeStatus = packetProven && sortedItems.length === 1
    ? "packet-selected-grade"
    : sortedItems.length === 1
      ? "item-package-observed-selection-not-proven"
      : "multiple-item-package-grade-items-observed-selection-not-proven";
}

function resolveObservedSkillFactors(
  skillId: number,
  detail: SkillBreakdownDetail | undefined,
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeFactorItems: ActiveFactorItemLike[] = [],
): ActiveSkillFactor[] {
  const observedByFactorId = new Map<number, ActiveFactorBuffLike>();
  for (const buff of activeFactorBuffs) {
    const factorBuffId = Number(buff.factorBuffId);
    if (!Number.isFinite(factorBuffId) || !factorsByBuffId[String(factorBuffId)]) continue;
    observedByFactorId.set(factorBuffId, buff);
  }

  const observedItemsByFactorId = observedFactorItemsByFactorId(activeFactorItems);
  if (!observedByFactorId.size && !observedItemsByFactorId.size) return [];

  const directLinks = directFactorLinksForSkill(skillId, detail);
  return [...directLinks.entries()]
    .filter(([factorBuffId]) =>
      observedByFactorId.has(factorBuffId) || observedItemsByFactorId.has(factorBuffId)
    )
    .flatMap(([factorBuffId, fallbackSource]) => {
      const factor = factorsByBuffId[String(factorBuffId)];
      if (!factor) return [];
      const observed = observedByFactorId.get(factorBuffId);
      const evidence = factor.affectedDamageEvidence?.[String(skillId)];
      const runtimeObserved = observed !== undefined;
      const activeFactor: ActiveSkillFactor = {
        factorBuffId,
        observedBuffId: observed?.observedBuffId ?? factorBuffId,
        runtimeObserved,
        runtimeDetection: runtimeObserved
          ? "active-factor-buff"
          : "factor-grade-item-observed-selection-not-proven",
        ...(observed?.buffLevel !== undefined ? { buffLevel: observed.buffLevel } : {}),
        ...(observed?.partId !== undefined ? { partId: observed.partId } : {}),
        ...(observed?.count !== undefined ? { count: observed.count } : {}),
        ...(observed?.fightSourceType !== undefined
          ? { fightSourceType: observed.fightSourceType }
          : {}),
        familyId: factor.familyId ?? 0,
        familyName: factor.familyName ?? `Phantom Factor #${factorBuffId}`,
        evidenceSource: evidence?.source ?? fallbackSource,
        targetKind: "damage",
        affectedDamageId: skillId,
        gradeKnown: false,
      };
      if (evidence?.evidenceStatuses?.length) {
        activeFactor.evidenceStatuses = evidence.evidenceStatuses;
      }
      if (evidence?.relationshipKind) {
        activeFactor.relationshipKind = evidence.relationshipKind;
      }
      if (factor.familyNames) {
        activeFactor.familyNames = factor.familyNames;
      }
      attachObservedFactorItemEvidence(
        activeFactor,
        factor,
        observedItemsByFactorId.get(factorBuffId),
      );
      return [activeFactor];
    });
}

function resolveObservedRecountFactors(
  recountId: number,
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeFactorItems: ActiveFactorItemLike[] = [],
): ActiveSkillFactor[] {
  const observedByFactorId = new Map<number, ActiveFactorBuffLike>();
  for (const buff of activeFactorBuffs) {
    const factorBuffId = Number(buff.factorBuffId);
    if (!Number.isFinite(factorBuffId) || !factorsByBuffId[String(factorBuffId)]) continue;
    observedByFactorId.set(factorBuffId, buff);
  }

  const observedItemsByFactorId = observedFactorItemsByFactorId(activeFactorItems);
  if (!observedByFactorId.size && !observedItemsByFactorId.size) return [];

  return (recountIdToFactorBuffIds[String(recountId)] ?? [])
    .filter((factorBuffId) =>
      observedByFactorId.has(Number(factorBuffId))
      || observedItemsByFactorId.has(Number(factorBuffId))
    )
    .flatMap((factorBuffId) => {
      const factor = factorsByBuffId[String(factorBuffId)];
      if (!factor) return [];
      const observed = observedByFactorId.get(Number(factorBuffId));
      const evidence = factor.affectedRecountEvidence?.[String(recountId)];
      const runtimeObserved = observed !== undefined;
      const activeFactor: ActiveSkillFactor = {
        factorBuffId: Number(factorBuffId),
        observedBuffId: observed?.observedBuffId ?? Number(factorBuffId),
        runtimeObserved,
        runtimeDetection: runtimeObserved
          ? "active-factor-buff"
          : "factor-grade-item-observed-selection-not-proven",
        ...(observed?.buffLevel !== undefined ? { buffLevel: observed.buffLevel } : {}),
        ...(observed?.partId !== undefined ? { partId: observed.partId } : {}),
        ...(observed?.count !== undefined ? { count: observed.count } : {}),
        ...(observed?.fightSourceType !== undefined
          ? { fightSourceType: observed.fightSourceType }
          : {}),
        familyId: factor.familyId ?? 0,
        familyName: factor.familyName ?? `Phantom Factor #${factorBuffId}`,
        evidenceSource:
          evidence?.source ?? "SeasonPhantomFactors.recountIdToFactorBuffIds",
        targetKind: "recount",
        affectedRecountId: recountId,
        gradeKnown: false,
      };
      if (evidence?.evidenceStatuses?.length) {
        activeFactor.evidenceStatuses = evidence.evidenceStatuses;
      }
      if (evidence?.relationshipKind) {
        activeFactor.relationshipKind = evidence.relationshipKind;
      }
      if (factor.familyNames) {
        activeFactor.familyNames = factor.familyNames;
      }
      attachObservedFactorItemEvidence(
        activeFactor,
        factor,
        observedItemsByFactorId.get(Number(factorBuffId)),
      );
      return [activeFactor];
    });
}

type ObservedEffectRuntime = {
  effectSourceBuffId?: number;
  observedBuffId?: number;
  buffLevel?: number | null;
  partId?: number | null;
  count?: number | null;
  fightSourceType?: number | null;
  sourceConfigId?: number | null;
  runtimeSource?: string;
  selectedSourceId?: string;
  selectedNodeId?: number | null;
  selectedNodeLevel?: number | null;
  selectedSlot?: number | null;
  source: "activeEffectBuffs" | "activeFactorBuffs" | "activeEffectSources";
};

function seasonTalentNodeIdFromSourceId(sourceId: string): number | null {
  const match = /^season-talent-node:(\d+)$/.exec(sourceId);
  return match ? toFiniteNumber(match[1]) : null;
}

function seasonTalentTreeBandFromSourceId(sourceId: string): number | null {
  const nodeId = seasonTalentNodeIdFromSourceId(sourceId);
  return nodeId !== null && nodeId >= 1000 ? Math.floor(nodeId / 100) : null;
}

function sourceIdsForBuffId(buffId: number | null): string[] {
  if (buffId === null || !Number.isFinite(buffId)) return [];
  return (buffIdToEffectSourceIds[String(buffId)] ?? []).filter((sourceId) => effectSourcesById[sourceId]);
}

function activeSeasonTalentTreeBands(
  activeEffectBuffs: ActiveEffectBuffLike[] = [],
  activeEffectSources: ActiveEffectSourceLike[] = [],
): Set<number> {
  const bands = new Set<number>();

  for (const source of activeEffectSources) {
    const band = seasonTalentTreeBandFromSourceId(String(source.sourceId || ""));
    if (band !== null) bands.add(band);
  }

  for (const buff of activeEffectBuffs) {
    const buffIds = [
      toFiniteNumber(buff.effectSourceBuffId),
      toFiniteNumber(buff.observedBuffId),
      toFiniteNumber(buff.sourceConfigId ?? undefined),
    ];
    for (const buffId of buffIds) {
      const sourceBands = new Set(
        sourceIdsForBuffId(buffId)
          .map(seasonTalentTreeBandFromSourceId)
          .filter((band): band is number => band !== null),
      );
      if (sourceBands.size === 1) {
        for (const band of sourceBands) bands.add(band);
      }
    }
  }

  return bands;
}

function scopedSourceIdsForBuffId(buffId: number | null, activeTreeBands: Set<number>): string[] {
  const sourceIds = sourceIdsForBuffId(buffId);
  if (!sourceIds.length || activeTreeBands.size === 0) return sourceIds;

  const sourceBands = new Set(
    sourceIds
      .map(seasonTalentTreeBandFromSourceId)
      .filter((band): band is number => band !== null),
  );
  if (sourceBands.size <= 1) return sourceIds;

  const filtered = sourceIds.filter((sourceId) => {
    const band = seasonTalentTreeBandFromSourceId(sourceId);
    return band === null || activeTreeBands.has(band);
  });
  return filtered.some((sourceId) => seasonTalentTreeBandFromSourceId(sourceId) !== null)
    ? filtered
    : sourceIds;
}

function addObservedEffectSourcesForBuffId(
  observed: Map<string, ObservedEffectRuntime>,
  buffId: number | null,
  runtime: ObservedEffectRuntime,
  activeTreeBands: Set<number>,
) {
  for (const sourceId of scopedSourceIdsForBuffId(buffId, activeTreeBands)) {
    if (!observed.has(sourceId) || runtime.source === "activeEffectBuffs") {
      observed.set(sourceId, runtime);
    }
  }
}

function addObservedEffectSourceForSourceId(
  observed: Map<string, ObservedEffectRuntime>,
  sourceId: string | undefined,
  runtime: ObservedEffectRuntime,
) {
  if (!sourceId || !effectSourcesById[sourceId]) return;
  observed.set(sourceId, runtime);
}

function observedEffectSourceRuntime(
  activeEffectBuffs: ActiveEffectBuffLike[] = [],
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeEffectSources: ActiveEffectSourceLike[] = [],
): Map<string, ObservedEffectRuntime> {
  const observed = new Map<string, ObservedEffectRuntime>();
  const activeTreeBands = activeSeasonTalentTreeBands(activeEffectBuffs, activeEffectSources);

  for (const buff of activeFactorBuffs) {
    const factorBuffId = toFiniteNumber(buff.factorBuffId);
    if (factorBuffId === null) continue;
    const runtime: ObservedEffectRuntime = {
      effectSourceBuffId: factorBuffId,
      observedBuffId: toFiniteNumber(buff.observedBuffId) ?? factorBuffId,
      ...(buff.buffLevel !== undefined ? { buffLevel: buff.buffLevel } : {}),
      ...(buff.partId !== undefined ? { partId: buff.partId } : {}),
      ...(buff.count !== undefined ? { count: buff.count } : {}),
      ...(buff.fightSourceType !== undefined ? { fightSourceType: buff.fightSourceType } : {}),
      source: "activeFactorBuffs",
    };
    if (buff.sourceConfigId !== undefined) {
      runtime.sourceConfigId = buff.sourceConfigId;
    }
    addObservedEffectSourcesForBuffId(observed, factorBuffId, runtime, activeTreeBands);
    addObservedEffectSourcesForBuffId(observed, toFiniteNumber(buff.observedBuffId), runtime, activeTreeBands);
    addObservedEffectSourcesForBuffId(
      observed,
      toFiniteNumber(buff.sourceConfigId ?? undefined),
      runtime,
      activeTreeBands,
    );
  }

  for (const buff of activeEffectBuffs) {
    const effectSourceBuffId = toFiniteNumber(buff.effectSourceBuffId);
    if (effectSourceBuffId === null) continue;
    const runtime: ObservedEffectRuntime = {
      effectSourceBuffId,
      observedBuffId: toFiniteNumber(buff.observedBuffId) ?? effectSourceBuffId,
      ...(buff.buffLevel !== undefined ? { buffLevel: buff.buffLevel } : {}),
      ...(buff.partId !== undefined ? { partId: buff.partId } : {}),
      ...(buff.count !== undefined ? { count: buff.count } : {}),
      ...(buff.fightSourceType !== undefined ? { fightSourceType: buff.fightSourceType } : {}),
      source: "activeEffectBuffs",
    };
    if (buff.sourceConfigId !== undefined) {
      runtime.sourceConfigId = buff.sourceConfigId;
    }
    addObservedEffectSourcesForBuffId(observed, effectSourceBuffId, runtime, activeTreeBands);
    addObservedEffectSourcesForBuffId(observed, toFiniteNumber(buff.observedBuffId), runtime, activeTreeBands);
    addObservedEffectSourcesForBuffId(
      observed,
      toFiniteNumber(buff.sourceConfigId ?? undefined),
      runtime,
      activeTreeBands,
    );
  }

  for (const source of activeEffectSources) {
    const sourceId = String(source.sourceId || "");
    if (!sourceId) continue;
    const runtime: ObservedEffectRuntime = {
      source: "activeEffectSources",
      selectedSourceId: sourceId,
    };
    if (source.runtimeSource !== undefined) runtime.runtimeSource = source.runtimeSource;
    if (source.nodeId !== undefined) runtime.selectedNodeId = source.nodeId;
    if (source.nodeLevel !== undefined) runtime.selectedNodeLevel = source.nodeLevel;
    if (source.slot !== undefined) runtime.selectedSlot = source.slot;
    addObservedEffectSourceForSourceId(observed, sourceId, runtime);
  }

  return observed;
}

function effectTargetFor(
  source: EffectSourceEntry,
  targetKind: "damage" | "recount",
  targetId: number,
): EffectSourceTarget | undefined {
  return source.targets?.find((target) =>
    target.targetKind === targetKind
      && (targetKind === "damage"
        ? target.damageId === targetId
        : target.recountId === targetId)
  );
}

function shouldExposeEffectSource(
  source: EffectSourceEntry,
  runtime: ObservedEffectRuntime | undefined,
): boolean {
  if (source.runtimeDetection === "active-buff") return runtime !== undefined;
  return source.runtimeDetection === "row-observed-or-active-buff" || runtime !== undefined;
}

function toActiveSkillEffect(
  sourceId: string,
  source: EffectSourceEntry,
  target: EffectSourceTarget | undefined,
  targetKind: "damage" | "recount",
  targetId: number,
  runtime: ObservedEffectRuntime | undefined,
): ActiveSkillEffect {
  return {
    sourceId,
    sourceKind: source.sourceKind ?? "unknown",
    ...(source.sourceType ? { sourceType: source.sourceType } : {}),
    ...(source.sourceEntityId !== undefined ? { sourceEntityId: source.sourceEntityId } : {}),
    sourceName: source.sourceName ?? sourceId,
    ...(source.sourceNames ? { sourceNames: source.sourceNames } : {}),
    ...(runtime?.effectSourceBuffId !== undefined
      ? { effectSourceBuffId: runtime.effectSourceBuffId }
      : {}),
    ...(runtime?.observedBuffId !== undefined ? { observedBuffId: runtime.observedBuffId } : {}),
    ...(runtime?.buffLevel !== undefined ? { buffLevel: runtime.buffLevel } : {}),
    ...(runtime?.partId !== undefined ? { partId: runtime.partId } : {}),
    ...(runtime?.count !== undefined ? { count: runtime.count } : {}),
    ...(runtime?.fightSourceType !== undefined
      ? { fightSourceType: runtime.fightSourceType }
      : {}),
    ...(runtime?.runtimeSource ? { runtimeSource: runtime.runtimeSource } : {}),
    ...(runtime?.selectedSourceId ? { selectedSourceId: runtime.selectedSourceId } : {}),
    ...(runtime?.selectedNodeId !== undefined ? { selectedNodeId: runtime.selectedNodeId } : {}),
    ...(runtime?.selectedNodeLevel !== undefined
      ? { selectedNodeLevel: runtime.selectedNodeLevel }
      : {}),
    ...(runtime?.selectedSlot !== undefined ? { selectedSlot: runtime.selectedSlot } : {}),
    evidenceSource: target?.evidenceSource
      ?? `EffectSources.${targetKind}IdToEffectSourceIds`,
    ...(target?.evidenceStatus ? { evidenceStatus: target.evidenceStatus } : {}),
    ...(target?.relationshipKind ? { relationshipKind: target.relationshipKind } : {}),
    ...(source.runtimeDetection ? { runtimeDetection: source.runtimeDetection } : {}),
    ...(source.modifierEvidence ? { modifierEvidence: source.modifierEvidence } : {}),
    runtimeObserved: runtime !== undefined,
    targetKind,
    ...(targetKind === "damage"
      ? { affectedDamageId: targetId }
      : { affectedRecountId: targetId }),
  };
}

function resolveObservedSkillEffects(
  skillId: number,
  activeEffectBuffs: ActiveEffectBuffLike[] = [],
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeEffectSources: ActiveEffectSourceLike[] = [],
): ActiveSkillEffect[] {
  const observed = observedEffectSourceRuntime(
    activeEffectBuffs,
    activeFactorBuffs,
    activeEffectSources,
  );
  return (damageIdToEffectSourceIds[String(skillId)] ?? []).flatMap((sourceId) => {
    const source = effectSourcesById[sourceId];
    if (!source) return [];
    const runtime = observed.get(sourceId);
    if (!shouldExposeEffectSource(source, runtime)) return [];
    const target = effectTargetFor(source, "damage", skillId);
    return [toActiveSkillEffect(sourceId, source, target, "damage", skillId, runtime)];
  });
}

function resolveObservedRecountEffects(
  recountId: number,
  activeEffectBuffs: ActiveEffectBuffLike[] = [],
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeEffectSources: ActiveEffectSourceLike[] = [],
): ActiveSkillEffect[] {
  const observed = observedEffectSourceRuntime(
    activeEffectBuffs,
    activeFactorBuffs,
    activeEffectSources,
  );
  return (recountIdToEffectSourceIds[String(recountId)] ?? []).flatMap((sourceId) => {
    const source = effectSourcesById[sourceId];
    if (!source) return [];
    const runtime = observed.get(sourceId);
    if (!shouldExposeEffectSource(source, runtime)) return [];
    const target = effectTargetFor(source, "recount", recountId);
    return [toActiveSkillEffect(sourceId, source, target, "recount", recountId, runtime)];
  });
}

function mergeActiveFactors(
  left: ActiveSkillFactor[] | undefined,
  right: ActiveSkillFactor[] | undefined,
): ActiveSkillFactor[] | undefined {
  if (!left?.length && !right?.length) return undefined;
  const merged = new Map<string, ActiveSkillFactor>();
  for (const factor of [...(left ?? []), ...(right ?? [])]) {
    const targetId = factor.targetKind === "recount"
      ? factor.affectedRecountId
      : factor.affectedDamageId;
    merged.set(`${factor.factorBuffId}:${factor.targetKind}:${targetId ?? 0}`, factor);
  }
  return [...merged.values()].sort((a, b) =>
    a.familyName.localeCompare(b.familyName)
      || a.targetKind.localeCompare(b.targetKind)
      || (a.affectedDamageId ?? a.affectedRecountId ?? 0)
        - (b.affectedDamageId ?? b.affectedRecountId ?? 0),
  );
}

function mergeActiveEffects(
  left: ActiveSkillEffect[] | undefined,
  right: ActiveSkillEffect[] | undefined,
): ActiveSkillEffect[] | undefined {
  if (!left?.length && !right?.length) return undefined;
  const merged = new Map<string, ActiveSkillEffect>();
  for (const effect of [...(left ?? []), ...(right ?? [])]) {
    const targetId = effect.targetKind === "recount"
      ? effect.affectedRecountId
      : effect.affectedDamageId;
    merged.set(`${effect.sourceId}:${effect.targetKind}:${targetId ?? 0}`, effect);
  }
  return [...merged.values()].sort((a, b) =>
    a.sourceName.localeCompare(b.sourceName)
      || a.sourceKind.localeCompare(b.sourceKind)
      || a.targetKind.localeCompare(b.targetKind)
      || (a.affectedDamageId ?? a.affectedRecountId ?? 0)
        - (b.affectedDamageId ?? b.affectedRecountId ?? 0),
  );
}

function formatObservedFactorGradeValue(factor: ActiveSkillFactor): string {
  const grades = factor.observedGrades
    ?? (factor.observedGrade !== undefined ? [factor.observedGrade] : []);
  const gradeText = grades.length
    ? grades.map((grade) => `G${grade}`).join("/")
    : "";
  const valueText = factor.observedValueTexts?.length
    ? factor.observedValueTexts.join(", ")
    : "";
  return [gradeText, valueText].filter(Boolean).join(" ");
}

function formatRuntimeGradeStatus(status: string | undefined): string {
  if (status === "item-package-observed-selection-not-proven") {
    return "selection not separately proven";
  }
  if (status === "multiple-item-package-grade-items-observed-selection-not-proven") {
    return "multiple item-package grade items observed; selection not separately proven";
  }
  return status ?? "";
}

function formatActiveFactorNames(
  factors: ActiveSkillFactor[] | undefined,
  locale: string,
): string {
  if (!factors?.length) return "";
  return factors
    .map((factor) => {
      const name = resolveLocalizedText(
        factor.familyNames,
        locale,
        factor.familyName || `Phantom Factor #${factor.factorBuffId}`,
      );
      const observedValue = formatObservedFactorGradeValue(factor);
      return observedValue ? `${name} ${observedValue}` : name;
    })
    .filter(Boolean)
    .join(", ");
}

function formatActiveEffectNames(
  effects: ActiveSkillEffect[] | undefined,
  locale: string,
): string {
  if (!effects?.length) return "";
  return effects
    .map((effect) => resolveLocalizedText(
      effect.sourceNames,
      locale,
      effect.sourceName || effect.sourceId,
    ))
    .filter(Boolean)
    .join(", ");
}

function formatRuntimeFields(
  fields: Pick<
    ActiveSkillFactor | ActiveSkillEffect,
    "buffLevel" | "partId" | "count" | "fightSourceType"
  >,
): string {
  const values = [
    fields.buffLevel !== undefined && fields.buffLevel !== null
      ? `level ${fields.buffLevel}`
      : "",
    fields.partId !== undefined && fields.partId !== null ? `part ${fields.partId}` : "",
    fields.count !== undefined && fields.count !== null ? `count ${fields.count}` : "",
    fields.fightSourceType !== undefined && fields.fightSourceType !== null
      ? `fight source type ${fields.fightSourceType}`
      : "",
  ].filter(Boolean);
  return values.length ? ` Fields captured: ${values.join(", ")}.` : "";
}

function formatActiveFactorGradeEvidence(factor: ActiveSkillFactor): string {
  if (!factor.observedItemIds?.length) {
    return "Factor grade/value: no item-package grade evidence attached to this row.";
  }

  const itemText = factor.observedItemIds.map((itemId) => `#${itemId}`).join(", ");
  const gradeValue = formatObservedFactorGradeValue(factor);
  const source = factor.runtimeGradeSource ? ` from ${factor.runtimeGradeSource}` : "";
  const status = formatRuntimeGradeStatus(factor.runtimeGradeStatus);
  return [
    "Factor grade/value:",
    gradeValue ? `${gradeValue};` : "",
    `v_data item${factor.observedItemIds.length === 1 ? "" : "s"} ${itemText}${source}.`,
    status ? `Status: ${status}.` : "",
  ].filter(Boolean).join(" ");
}

export function buildActiveFactorEvidenceNote(
  factors: ActiveSkillFactor[] | undefined,
  locale: string,
): string {
  if (!factors?.length) return "";
  const rows = factors.map((factor) => {
    const name = resolveLocalizedText(
      factor.familyNames,
      locale,
      factor.familyName || `Phantom Factor #${factor.factorBuffId}`,
    );
    const observed =
      factor.observedBuffId !== factor.factorBuffId
        ? `, observed buff #${factor.observedBuffId}`
        : "";
    const target = factor.targetKind === "recount"
      ? `recount #${factor.affectedRecountId ?? "?"}`
      : `damage #${factor.affectedDamageId ?? "?"}`;
    const sourceLabel = factor.evidenceSource.includes("DescriptionText")
      ? "Game-file target clause"
      : "Game-file link";
    const evidenceStatus = factor.evidenceStatuses?.length
      ? ` (${factor.evidenceStatuses.join(", ")})`
      : "";
    const runtimeFields = formatRuntimeFields(factor);
    const gradeEvidence = formatActiveFactorGradeEvidence(factor);
    const runtimeLine = factor.runtimeObserved === false
      ? factor.runtimeDetection === "damage-row-observed-factor-link"
        ? `Runtime: source damage row observed; active/selected factor state is not separately proven.${runtimeFields}`
        : `Runtime: factor grade item observed, but active/selected factor state is not proven.${runtimeFields}`
      : `Runtime: active factor buff observed.${runtimeFields}`;
    return [
      `- ${name} (#${factor.factorBuffId}${observed}; family #${factor.familyId || "?"})`,
      `  ${runtimeLine}`,
      `  ${gradeEvidence}`,
      `  ${sourceLabel}: ${factor.evidenceSource}${evidenceStatus} -> ${target}.`,
      `  Contribution: modifier evidence is attached to this ${target}; numeric formula split is not inferred yet.`,
    ].join("\n");
  });
  return ["Observed Phantom Factor evidence:", ...rows].join("\n");
}

function formatModifierEvidence(evidence: EffectModifierEvidence | undefined): string {
  if (!evidence) return "";
  if (evidence.gradeRows?.length) {
    const gradeValues = evidence.gradeRows
      .map((row) => {
        const values = row.valueTexts?.length
          ? row.valueTexts.join(", ")
          : row.cleanResolvedDescription;
        if (!values) return "";
        return `G${row.grade ?? "?"} ${values}`;
      })
      .filter(Boolean)
      .join("; ");
    const runtimeStatus = evidence.runtimeSelectionStatus
      ? ` ${evidence.runtimeSelectionStatus}.`
      : "";
    return gradeValues
      ? `  Values: ${gradeValues}.${runtimeStatus}`
      : "";
  }

  if (evidence.cleanDescription) {
    const values = evidence.valueTexts?.length
      ? ` Values: ${evidence.valueTexts.join(", ")}.`
      : "";
    return `  Effect text: ${evidence.cleanDescription}.${values}`;
  }

  return "";
}

export function buildActiveEffectEvidenceNote(
  effects: ActiveSkillEffect[] | undefined,
  locale: string,
): string {
  if (!effects?.length) return "";
  const rows = effects.map((effect) => {
    const name = resolveLocalizedText(
      effect.sourceNames,
      locale,
      effect.sourceName || effect.sourceId,
    );
    const runtimeObserved = effect.runtimeObserved
      ? effect.selectedSourceId
        ? `selected source observed (${effect.runtimeSource ?? effect.selectedSourceId})`
        : `active buff observed${effect.effectSourceBuffId !== undefined ? ` (#${effect.effectSourceBuffId})` : ""}`
      : "target row observed; no contribution math inferred";
    const observed =
      effect.observedBuffId !== undefined
        && effect.effectSourceBuffId !== undefined
        && effect.observedBuffId !== effect.effectSourceBuffId
        ? `, observed buff #${effect.observedBuffId}`
        : "";
    const target = effect.targetKind === "recount"
      ? `recount #${effect.affectedRecountId ?? "?"}`
      : `damage #${effect.affectedDamageId ?? "?"}`;
    const sourceLabel = effect.evidenceSource.includes("DescriptionText")
      ? "Game-file target clause"
      : "Game-file link";
    const evidenceStatus = effect.evidenceStatus ? ` (${effect.evidenceStatus})` : "";
    const sourceEntity =
      effect.sourceEntityId !== undefined ? `; source #${effect.sourceEntityId}` : "";
    const modifierLine = formatModifierEvidence(effect.modifierEvidence);
    const selectedLine = effect.selectedSourceId
      ? `  Selected node: ${effect.selectedSourceId}`
        + `${effect.selectedNodeLevel !== undefined && effect.selectedNodeLevel !== null
          ? ` level ${effect.selectedNodeLevel}`
          : ""}`
        + `${effect.selectedSlot !== undefined && effect.selectedSlot !== null
          ? ` slot ${effect.selectedSlot}`
          : ""}.`
      : "";
    const runtimeFields = formatRuntimeFields(effect);
    return [
      `- ${name} (${effect.sourceKind}${sourceEntity}${observed})`,
      `  Runtime: ${runtimeObserved}.${runtimeFields}`,
      selectedLine,
      `  ${sourceLabel}: ${effect.evidenceSource}${evidenceStatus} -> ${target}.`,
      `  Contribution: source evidence is attached to this ${target}; numeric formula split is not inferred yet.`,
      modifierLine,
    ].join("\n");
  });
  return ["Effect source evidence:", ...rows].join("\n");
}

export function buildSkillSourceEvidenceNote(
  effects: ActiveSkillEffect[] | undefined,
  factors: ActiveSkillFactor[] | undefined,
  locale: string,
): string {
  return [
    buildActiveEffectEvidenceNote(effects, locale),
    buildActiveFactorEvidenceNote(factors, locale),
  ].filter(Boolean).join("\n\n");
}

export function resolveActiveFactorDetailName(
  factors: ActiveSkillFactor[] | undefined,
  locale: string,
): string {
  return formatActiveFactorNames(factors, locale);
}

export function resolveActiveEffectDetailName(
  effects: ActiveSkillEffect[] | undefined,
  factors: ActiveSkillFactor[] | undefined,
  locale: string,
): string {
  return formatActiveEffectNames(effects, locale)
    || formatActiveFactorNames(factors, locale);
}

export function resolveSkillBreakdownName(
  row: Pick<
    SkillDisplayRow,
    "skillId" | "name" | "names" | "details" | "sourceRowKind"
  >,
  locale: string,
): string {
  if (row.sourceRowKind === "factor") {
    return resolveLocalizedText(row.names, locale, row.name);
  }
  const detail = row.details ?? lookupSkillBreakdownDetail(row.skillId);
  const damageName = lookupLocalizedDamageIdName(row.skillId, locale);
  if (
    detail?.DisplayNames &&
    isDesignOnlyTextMap(detail.DisplayNames) &&
    damageName &&
    damageName !== resolveLocalizedText(detail.DisplayNames, locale, row.name)
  ) {
    return damageName;
  }
  return resolveOwnerQualifiedLocalizedText(
    detail?.DisplayNames,
    detail?.MonsterOwnerNames,
    locale,
    row.name,
  );
}

export function resolveSkillBreakdownDetailName(
  row: Pick<
    SkillDisplayRow,
    | "skillId"
    | "details"
    | "activeFactors"
    | "activeEffects"
    | "sourceRowKind"
    | "sourceName"
    | "sourceNames"
  >,
  locale: string,
): string {
  if (row.sourceRowKind === "factor") {
    return resolveLocalizedText(row.sourceNames, locale, row.sourceName ?? "");
  }
  const detail = row.details ?? lookupSkillBreakdownDetail(row.skillId);
  const detailName = resolveLocalizedText(detail?.DisplayDetailNames, locale, detail?.DisplayDetailName ?? "");
  const variantName = resolveLocalizedText(detail?.DisplayVariantNames, locale, detail?.DisplayVariantName ?? "");
  const effectNames = resolveActiveEffectDetailName(row.activeEffects, row.activeFactors, locale);
  const baseSkillLabel = detail?.Category === "base-skill" && !detailName && !variantName
    ? "Base skill"
    : "";
  return compactDisplayParts([detailName, variantName, effectNames, baseSkillLabel]);
}

export function resolveRecountGroupName(
  recountId: number | string,
  locale: string,
  fallback: string,
): string {
  const group = recountTable[String(recountId)];
  return resolveLocalizedText(group?.Names, locale, group?.RecountName ?? fallback);
}

export function resolveSkillContributionLabel(
  row: Pick<SkillDisplayRow, "attribution">,
): string {
  return row.attribution.label;
}

export function buildSkillContributionNote(
  row: Pick<SkillDisplayRow, "attribution">,
): string {
  const attribution = row.attribution;
  const modifier = attribution.modifierPercent !== undefined
    ? `Modifier: +${attribution.modifierPercent}%.`
    : "";
  const grade = attribution.gradeStatus ? `Grade/runtime: ${attribution.gradeStatus}.` : "";
  return compactLines([
    `Contribution: ${attribution.label}`,
    attribution.detail,
    modifier,
    grade,
  ]).join("\n");
}

export function buildSkillBreakdownHoverText(
  skillId: number | string,
  locale: string,
  note = "",
): string {
  const detail = lookupSkillBreakdownDetail(skillId);
  if (!detail) {
    return compactLines([
      `ID: #${skillId}`,
      "Sources:",
      "- Runtime damage event",
      note.trim() ? `\nNote:\n${note.trim()}` : "",
    ]).join("\n");
  }

  const damageEntry = damageAttrIdNames[String(skillId)];
  const parentName = resolveLocalizedText(
    detail.ParentRecountNames,
    locale,
    detail.ParentRecountName ?? "",
  );
  const rawDamageName = resolveLocalizedText(
    detail.DamageNames,
    locale,
    detail.DamageName ?? "",
  );
  const familyDamageName = resolveDamageAttrName(damageEntry, locale);
  const damageName = detail.DamageNames && isDesignOnlyTextMap(detail.DamageNames) && familyDamageName
    ? familyDamageName
    : rawDamageName;
  const rawLinkedName = resolveLocalizedText(
    detail.LinkedNames,
    locale,
    detail.LinkedName ?? "",
  );
  const linkedName = detail.LinkedNames && isDesignOnlyTextMap(detail.LinkedNames)
    ? resolveLinkedBuffFamilyName(damageEntry, locale) ?? rawLinkedName
    : rawLinkedName;
  const detailName = resolveLocalizedText(
    detail.DisplayDetailNames,
    locale,
    detail.DisplayDetailName ?? "",
  );
  const variantName = resolveLocalizedText(
    detail.DisplayVariantNames,
    locale,
    detail.DisplayVariantName ?? "",
  );
  const ownerName = resolveLocalizedText(
    detail.RecountOwnerSkillNames,
    locale,
    detail.RecountOwnerSkillName ?? "",
  );
  const monsterOwnerName = resolveLocalizedText(
    detail.MonsterOwnerNames,
    locale,
    detail.MonsterOwnerName ?? "",
  );
  const talentName = resolveLocalizedText(
    detail.ParentTalentNames,
    locale,
    detail.ParentTalentName ?? "",
  );
  const sourceTalentName = resolveLocalizedText(
    detail.SourceTalentNames,
    locale,
    detail.SourceTalentName ?? "",
  );
  const underlyingName = resolveLocalizedText(
    detail.UnderlyingSkillNames,
    locale,
    detail.UnderlyingSkillName ?? "",
  );
  const linkedId = detail.LinkedId ?? detail.LinkedSkillId ?? detail.LinkedBuffId;
  const sourceFiles = detail.SourceFiles?.length
    ? detail.SourceFiles
    : ["DamageAttrTable.ctb"];
  const detailEvidence = formatDetailEvidence(detail.DisplayDetailEvidence);
  const variantEvidence = formatDetailEvidence(detail.DisplayVariantEvidence);
  const showOwnerLine =
    Boolean(ownerName) &&
    (detail.SourceRole === "recount-owned-reused-skill-hit" ||
      Boolean(detail.IsRecountOwnerSkillMismatch) ||
      Boolean(detail.IsRecountOwnerNameMismatch));

  return compactLines([
    `ID: #${skillId}`,
    detail.CategoryLabel ? `Type: ${detail.CategoryLabel}` : "",
    detail.SourceRole ? `Role: ${detail.SourceRole}` : "",
    parentName
      ? `Rolls up to: ${parentName}${detail.ParentRecountId ? ` (#${detail.ParentRecountId})` : ""}`
      : "",
    talentName
      ? `Talent: ${talentName}${detail.ParentTalentId ? ` (#${detail.ParentTalentId})` : ""}`
      : "",
    sourceTalentName
      ? `Source talent/passive: ${sourceTalentName}${detail.SourceTalentId ? ` (#${detail.SourceTalentId})` : ""}`
      : "",
    detail.SourceTalentBridge ? `Source talent bridge: ${detail.SourceTalentBridge}` : "",
    detailName ? `Detail: ${detailName}` : "",
    variantName ? `Variant: ${variantName}` : "",
    detail.DisplayDetailSource ? `Detail source: ${detail.DisplayDetailSource}` : "",
    detail.DisplayVariantSource ? `Variant source: ${detail.DisplayVariantSource}` : "",
    detailEvidence ? `Bridge IDs: ${detailEvidence}` : "",
    variantEvidence ? `Variant IDs: ${variantEvidence}` : "",
    showOwnerLine
      ? `Owner: ${ownerName}${detail.RecountOwnerSkillId ? ` (#${detail.RecountOwnerSkillId})` : ""}`
      : "",
    monsterOwnerName
      ? `Monster owner: ${monsterOwnerName}${detail.MonsterOwnerIds?.length ? ` (#${detail.MonsterOwnerIds.join(", #")})` : ""}`
      : "",
    detail.MonsterOwnerSource ? `Monster bridge: ${detail.MonsterOwnerSource}` : "",
    underlyingName
      ? `Underlying source: ${underlyingName}${detail.UnderlyingSkillId ? ` (#${detail.UnderlyingSkillId})` : ""}`
      : "",
    damageName ? `Damage row: ${damageName}` : "",
    linkedName
      ? `Linked: ${linkedName}${detail.LinkedSource ? ` via ${detail.LinkedSource}` : ""}${linkedId ? ` (#${linkedId})` : ""}`
      : "",
    detail.DamageKind ? `Damage kind: ${detail.DamageKind}` : "",
    detail.Reason ? `Evidence: ${detail.Reason}` : "",
    "Sources:",
    ...sourceFiles.map((source) => `- ${source}`),
    note.trim() ? `\nNote:\n${note.trim()}` : "",
  ]).join("\n");
}

export function buildRecountGroupHoverText(
  recountId: number | string,
  locale: string,
  note = "",
): string {
  const group = recountTable[String(recountId)];
  const groupName = resolveLocalizedText(group?.Names, locale, group?.RecountName ?? "");
  return compactLines([
    `ID: #${recountId}`,
    "Type: Recount rollup group",
    groupName ? `Group: ${groupName}` : "",
    "Sources:",
    "- RecountTable.ctb",
    note.trim() ? `\nNote:\n${note.trim()}` : "",
  ]).join("\n");
}

export function buildSkillDisplayRow(
  skillId: number,
  stats: RawSkillStatsLike,
  elapsedSecs: number,
  parentTotal: number,
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeEffectBuffs: ActiveEffectBuffLike[] = [],
  activeEffectSources: ActiveEffectSourceLike[] = [],
  activeFactorItems: ActiveFactorItemLike[] = [],
): SkillDisplayRow {
  const totalDmg = Number(stats.totalValue || 0);
  const effectiveTotal = Number(stats.effectiveTotalValue || 0);
  const hits = Number(stats.hits || 0);
  const details = lookupSkillBreakdownDetail(skillId);
  const activeFactors = resolveObservedSkillFactors(
    skillId,
    details,
    activeFactorBuffs,
    activeFactorItems,
  );
  const activeEffects = resolveObservedSkillEffects(
    skillId,
    activeEffectBuffs,
    activeFactorBuffs,
    activeEffectSources,
  );
  return {
    skillId,
    name: lookupDamageIdName(skillId),
    ...(details ? { details } : {}),
    ...(activeFactors.length ? { activeFactors } : {}),
    ...(activeEffects.length ? { activeEffects } : {}),
    attribution: exactContribution(),
    totalDmg,
    effectiveTotal,
    dps: elapsedSecs > 0 ? totalDmg / elapsedSecs : 0,
    effectiveDps: elapsedSecs > 0 ? effectiveTotal / elapsedSecs : 0,
    dmgPct: pct(totalDmg, parentTotal),
    critRate: rate(Number(stats.critHits || 0), hits),
    critDmgRate: pct(Number(stats.critTotalValue || 0), totalDmg),
    luckyRate: rate(Number(stats.luckyHits || 0), hits),
    luckyDmgRate: pct(Number(stats.luckyTotalValue || 0), totalDmg),
    hits,
    hitsPerMinute: perMinute(hits, elapsedSecs),
    property: stats.property ?? null,
    damageMode: stats.damageMode ?? null,
    raw: stats,
  };
}

function compactLines(lines: string[]): string[] {
  return lines.filter((line) => line.trim().length > 0);
}

function compactDisplayParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

function formatDetailEvidence(
  evidence: SkillBreakdownDetail["DisplayDetailEvidence"],
): string {
  if (!evidence) return "";
  const keys = [
    "DamageAttrId",
    "LinkedSkillFightId",
    "LinkedSkillTableId",
    "ParentSkillTableId",
    "BuffId",
    "RecountId",
    "HeavyAttackTermId",
    "AreaTermId",
    "LocalizedTermId",
    "SourceDamageAttrId",
    "SourceBuffFamilyId",
    "SourceTalentId",
    "MatchedSkillIds",
    "SourceTalentBridge",
    "RawVariantText",
    "SourceSkillDescriptionNameId",
  ];
  return keys
    .map((key) => evidence[key] !== undefined ? `${key}=${evidence[key]}` : "")
    .filter(Boolean)
    .join(", ");
}

function buildChildRollupKey(row: SkillDisplayRow): string {
  if (row.sourceRowKind === "factor" && row.sourceFactorId !== undefined) {
    return `factor:${row.sourceFactorId}`;
  }
  const detail = row.details;
  if (!detail) return `id:${row.skillId}`;
  const semanticKey = [
    "detail",
    localizedVisibleKey(detail.DisplayNames, row.name),
    localizedVisibleKey(detail.DisplayDetailNames, detail.DisplayDetailName ?? ""),
    localizedVisibleKey(detail.DisplayVariantNames, detail.DisplayVariantName ?? ""),
    detail.DisplayDetailKind ?? "",
    detail.SourceRole ?? "",
    detail.Badge ?? "",
    detail.SourceTalentId ?? "",
    detail.ParentTalentId ?? "",
  ].join("|");

  if (hasSemanticSourceDetail(detail)) {
    return semanticKey;
  }

  return [
    semanticKey,
    detail.LinkedSource ?? "",
    detail.LinkedId ?? "",
    detail.LinkedSkillId ?? "",
    detail.LinkedBuffId ?? "",
  ].join("|");
}

function hasSemanticSourceDetail(detail: SkillBreakdownDetail): boolean {
  return detail.DisplayDetailKind === "source-talent"
    || detail.DisplayDetailKind === "sibling-buff-family-source";
}

function localizedVisibleKey(values: LocalizedTextMap | undefined, fallback: string): string {
  if (!values) return fallback.trim().toLowerCase();
  return [
    values["en"],
    values["zh-CN"],
    values["zh-TW"],
    values["ja"],
    values["ko-KR"],
    values["fr"],
    values["de"],
    values["es"],
    values["pt-BR"],
    values["th"],
    fallback,
  ]
    .filter(Boolean)
    .join("/")
    .trim()
    .toLowerCase();
}

function buildChildDisplayKey(row: SkillDisplayRow): string {
  if (row.sourceRowKind === "factor" && row.sourceFactorId !== undefined) {
    return `factor:${row.sourceFactorId}`;
  }
  const detail = row.details;
  if (!detail) return row.name;
  return [
    localizedKey(detail.DisplayNames, row.name),
    localizedKey(detail.DisplayDetailNames, detail.DisplayDetailName ?? ""),
    localizedKey(detail.DisplayVariantNames, detail.DisplayVariantName ?? ""),
    detail.Badge ?? "",
  ].join("|");
}

function localizedKey(values: LocalizedTextMap | undefined, fallback: string): string {
  if (!values) return fallback.trim().toLowerCase();
  return [
    values["en"],
    values["zh-CN"],
    values["zh-TW"],
    values["design"],
    fallback,
  ]
    .filter(Boolean)
    .join("/")
    .trim()
    .toLowerCase();
}

function mergeSkillRows(
  target: SkillDisplayRow,
  incoming: SkillDisplayRow,
  elapsedSecs: number,
  parentTotal: number,
) {
  const mergedRaw = mergeRawStats(target.raw, incoming.raw);
  target.raw = mergedRaw;
  target.mergedSkillIds = uniqueNumberList([
    ...(target.mergedSkillIds ?? [target.skillId]),
    ...(incoming.mergedSkillIds ?? [incoming.skillId]),
  ]);
  target.totalDmg = Number(mergedRaw.totalValue || 0);
  target.effectiveTotal = Number(mergedRaw.effectiveTotalValue || 0);
  target.hits = Number(mergedRaw.hits || 0);
  target.dps = elapsedSecs > 0 ? target.totalDmg / elapsedSecs : 0;
  target.effectiveDps = elapsedSecs > 0 ? target.effectiveTotal / elapsedSecs : 0;
  target.dmgPct = pct(target.totalDmg, parentTotal);
  target.critRate = rate(Number(mergedRaw.critHits || 0), target.hits);
  target.critDmgRate = pct(Number(mergedRaw.critTotalValue || 0), target.totalDmg);
  target.luckyRate = rate(Number(mergedRaw.luckyHits || 0), target.hits);
  target.luckyDmgRate = pct(Number(mergedRaw.luckyTotalValue || 0), target.totalDmg);
  target.hitsPerMinute = perMinute(target.hits, elapsedSecs);
  if (!target.sourceRowKind && incoming.sourceRowKind) {
    target.sourceRowKind = incoming.sourceRowKind;
    if (incoming.sourceFactorId !== undefined) {
      target.sourceFactorId = incoming.sourceFactorId;
    }
    if (incoming.sourceName !== undefined) {
      target.sourceName = incoming.sourceName;
    }
    if (incoming.sourceNames) {
      target.sourceNames = incoming.sourceNames;
    } else {
      delete target.sourceNames;
    }
    target.name = incoming.name;
    if (incoming.names) {
      target.names = incoming.names;
    } else {
      delete target.names;
    }
  }
  const activeFactors = mergeActiveFactors(target.activeFactors, incoming.activeFactors);
  if (activeFactors?.length) {
    target.activeFactors = activeFactors;
  } else {
    delete target.activeFactors;
  }
  const activeEffects = mergeActiveEffects(target.activeEffects, incoming.activeEffects);
  if (activeEffects?.length) {
    target.activeEffects = activeEffects;
  } else {
    delete target.activeEffects;
  }
}

function mergeRawStats(
  left: RawSkillStatsLike,
  right: RawSkillStatsLike,
): RawSkillStatsLike {
  return {
    totalValue: Number(left.totalValue || 0) + Number(right.totalValue || 0),
    effectiveTotalValue:
      Number(left.effectiveTotalValue || 0) + Number(right.effectiveTotalValue || 0),
    hits: Number(left.hits || 0) + Number(right.hits || 0),
    critHits: Number(left.critHits || 0) + Number(right.critHits || 0),
    critTotalValue:
      Number(left.critTotalValue || 0) + Number(right.critTotalValue || 0),
    luckyHits: Number(left.luckyHits || 0) + Number(right.luckyHits || 0),
    luckyTotalValue:
      Number(left.luckyTotalValue || 0) + Number(right.luckyTotalValue || 0),
  };
}

function uniqueNumberList(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))]
    .sort((left, right) => left - right);
}

function applyFactorSourcePresentation(
  row: SkillDisplayRow,
  factor: ActiveSkillFactor,
  mapping: { recountId: number; recountName: string },
) {
  const recount = recountTable[String(mapping.recountId)];
  row.sourceRowKind = "factor";
  row.sourceFactorId = factor.factorBuffId;
  row.sourceName = factor.familyName;
  if (factor.familyNames) {
    row.sourceNames = factor.familyNames;
  } else {
    delete row.sourceNames;
  }
  row.name = mapping.recountName;
  if (recount?.Names) {
    row.names = recount.Names;
  }
}

function buildFactorSourceOnlyRow(
  factor: ActiveSkillFactor,
  group: RecountGroup,
  elapsedSecs: number,
  parentTotal: number,
): SkillDisplayRow {
  const recount = recountTable[String(group.recountId)];
  const raw: RawSkillStatsLike = {
    totalValue: 0,
    effectiveTotalValue: 0,
    hits: 0,
    critHits: 0,
    critTotalValue: 0,
    luckyHits: 0,
    luckyTotalValue: 0,
  };
  return {
    skillId: -Math.abs(factor.factorBuffId),
    mergedSkillIds: [],
    name: group.recountName,
    ...(recount?.Names ? { names: recount.Names } : {}),
    sourceRowKind: "factor",
    sourceFactorId: factor.factorBuffId,
    sourceName: factor.familyName,
    ...(factor.familyNames ? { sourceNames: factor.familyNames } : {}),
    attribution: sourceOnlyContribution(),
    activeFactors: [factor],
    totalDmg: 0,
    effectiveTotal: 0,
    dps: elapsedSecs > 0 ? 0 / elapsedSecs : 0,
    effectiveDps: 0,
    dmgPct: pct(0, parentTotal),
    critRate: 0,
    critDmgRate: 0,
    luckyRate: 0,
    luckyDmgRate: 0,
    hits: 0,
    hitsPerMinute: 0,
    property: null,
    damageMode: null,
    raw,
  };
}

export function groupSkillsByRecount(
  skills: Partial<Record<number, RawSkillStatsLike>>,
  elapsedSecs: number,
  parentTotal: number,
  activeFactorBuffs: ActiveFactorBuffLike[] = [],
  activeEffectBuffs: ActiveEffectBuffLike[] = [],
  activeEffectSources: ActiveEffectSourceLike[] = [],
  activeFactorItems: ActiveFactorItemLike[] = [],
  options: SkillGroupingOptions = {},
): { groups: RecountGroup[]; ungrouped: SkillDisplayRow[] } {
  const includeContributionSources = options.includeContributionSources ?? true;
  const groupMap = new Map<number, RecountGroup>();
  const childRowsByGroup = new Map<number, Map<string, SkillDisplayRow>>();
  const ungrouped: SkillDisplayRow[] = [];

  for (const [skillIdText, stats] of Object.entries(skills)) {
    if (!stats) continue;
    const skillId = Number(skillIdText);
    if (!Number.isFinite(skillId)) continue;

    const row = buildSkillDisplayRow(
      skillId,
      stats,
      elapsedSecs,
      parentTotal,
      activeFactorBuffs,
      activeEffectBuffs,
      activeEffectSources,
      activeFactorItems,
    );
    const mapping = DAMAGE_TO_RECOUNT.get(skillId);
    if (!mapping) {
      ungrouped.push(row);
      continue;
    }
    if (includeContributionSources) {
      const rowSourceFactor = row.activeFactors?.find((factor) =>
        factor.targetKind === "damage" && factor.affectedDamageId === skillId
      ) ?? buildStaticFactorForDamageRow(skillId, row.details);
      if (rowSourceFactor) {
        const rowActiveFactors = mergeActiveFactors(row.activeFactors, [rowSourceFactor]);
        if (rowActiveFactors) {
          row.activeFactors = rowActiveFactors;
        }
        applyFactorSourcePresentation(row, rowSourceFactor, mapping);
      }
    }

    let group = groupMap.get(mapping.recountId);
    if (!group) {
      const groupActiveFactors = resolveObservedRecountFactors(
        mapping.recountId,
        activeFactorBuffs,
        activeFactorItems,
      );
      const groupActiveEffects = resolveObservedRecountEffects(
        mapping.recountId,
        activeEffectBuffs,
        activeFactorBuffs,
        activeEffectSources,
      );
      group = {
        recountId: mapping.recountId,
        recountName: mapping.recountName,
        totalDmg: 0,
        effectiveTotal: 0,
        dps: 0,
        effectiveDps: 0,
        dmgPct: 0,
        critRate: 0,
        critDmgRate: 0,
        luckyRate: 0,
        luckyDmgRate: 0,
        hits: 0,
        hitsPerMinute: 0,
        property: null,
        damageMode: null,
        raw: {
          totalValue: 0,
          effectiveTotalValue: 0,
          hits: 0,
          critHits: 0,
          critTotalValue: 0,
          luckyHits: 0,
          luckyTotalValue: 0,
          property: null,
          damageMode: null,
        },
        ...(groupActiveFactors.length ? { activeFactors: groupActiveFactors } : {}),
        ...(groupActiveEffects.length ? { activeEffects: groupActiveEffects } : {}),
        skills: [],
      };
      groupMap.set(mapping.recountId, group);
      childRowsByGroup.set(mapping.recountId, new Map<string, SkillDisplayRow>());
    }

    group.totalDmg += row.totalDmg;
    group.effectiveTotal += row.effectiveTotal;
    group.hits += row.hits;
    group.raw = mergeRawStats(group.raw, row.raw);
    const activeFactors = mergeActiveFactors(group.activeFactors, row.activeFactors);
    if (activeFactors?.length) {
      group.activeFactors = activeFactors;
    } else {
      delete group.activeFactors;
    }
    const activeEffects = mergeActiveEffects(group.activeEffects, row.activeEffects);
    if (activeEffects?.length) {
      group.activeEffects = activeEffects;
    } else {
      delete group.activeEffects;
    }
    row.name = lookupChildDamageIdName(skillId);
    row.mergedSkillIds = [skillId];
    const childRows = childRowsByGroup.get(mapping.recountId);
    const rollupKey = includeContributionSources
      ? buildChildRollupKey(row)
      : `id:${skillId}`;
    const existing = childRows?.get(rollupKey);
    if (existing) {
      mergeSkillRows(existing, row, elapsedSecs, parentTotal);
    } else {
      childRows?.set(rollupKey, row);
      group.skills.push(row);
    }
  }

  if (includeContributionSources) {
    for (const group of groupMap.values()) {
      const childRows = childRowsByGroup.get(group.recountId);
      if (!childRows) continue;
      const sourceFactorsById = new Map<number, ActiveSkillFactor>();
      for (const factor of group.activeFactors ?? []) {
        if (!sourceFactorsById.has(factor.factorBuffId)) {
          sourceFactorsById.set(factor.factorBuffId, factor);
        }
      }
      for (const factor of sourceFactorsById.values()) {
        const sourceRow = buildFactorSourceOnlyRow(factor, group, elapsedSecs, parentTotal);
        const rollupKey = buildChildRollupKey(sourceRow);
        if (childRows.has(rollupKey)) continue;
        childRows.set(rollupKey, sourceRow);
        group.skills.push(sourceRow);
      }
    }
  }

  const groups = Array.from(groupMap.values()).map((group) => {
    group.dps = elapsedSecs > 0 ? group.totalDmg / elapsedSecs : 0;
    group.effectiveDps = elapsedSecs > 0 ? group.effectiveTotal / elapsedSecs : 0;
    group.dmgPct = pct(group.totalDmg, parentTotal);
    group.critRate = rate(Number(group.raw.critHits || 0), group.hits);
    group.critDmgRate = pct(Number(group.raw.critTotalValue || 0), group.totalDmg);
    group.luckyRate = rate(Number(group.raw.luckyHits || 0), group.hits);
    group.luckyDmgRate = pct(Number(group.raw.luckyTotalValue || 0), group.totalDmg);
    group.hitsPerMinute = perMinute(group.hits, elapsedSecs);
    const nameCount = new Map<string, number>();
    for (const skill of group.skills) {
      const nameKey = buildChildDisplayKey(skill);
      nameCount.set(nameKey, (nameCount.get(nameKey) ?? 0) + 1);
    }
    for (const skill of group.skills) {
      skill.showSkillId = (nameCount.get(buildChildDisplayKey(skill)) ?? 0) > 1;
    }
    group.skills.sort((a, b) => b.totalDmg - a.totalDmg);
    return group;
  });

  groups.sort((a, b) => b.totalDmg - a.totalDmg);
  ungrouped.sort((a, b) => b.totalDmg - a.totalDmg);

  return { groups, ungrouped };
}
