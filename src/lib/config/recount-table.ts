import damageAttrIdNamesData from "$parserData/generated/DamageAttrIdName.json";
import buffNamesData from "$parserData/generated/BuffName.json";
import effectSourcesData from "$parserData/generated/EffectSources.json";
import recountTableData from "$parserData/generated/RecountTable.json";
import seasonPhantomFactorsData from "$parserData/generated/SeasonPhantomFactors.json";
import skillBreakdownDetailsData from "$parserData/generated/SkillBreakdownDetails.json";
import { lookupFirstSkillIconPath } from "$lib/skill-mappings";
import { resolveStaticIconUrl } from "$lib/config/static-icon-resolver";

const ICON_OVERRIDES_BY_RECOUNT_ID: Record<string, string> = {
  // Great Crimson Lotus and Formless Flame Slash are proc rows; the generated
  // damage rows do not carry the talent icon that actually enables them.
  "248": "ui/atlas/talent_passive_3/shuangfu364",
  "249": "ui/atlas/talent_passive_3/shuangfu362",
  // Generated row 238 includes the Flame Berserker basic attack icon before
  // the actual Unbound Meteor skill icon.
  "238": "ui/textures/skill_weapon_sf/weapon_sf-01_kx05",
};

const ICON_OVERRIDES_BY_DAMAGE_ID: Record<string, string> = {
  "116230101": "ui/atlas/talent_passive_3/shuangfu364",
  "23510703": "ui/atlas/talent_passive_3/shuangfu362",
  "23510803": "ui/atlas/talent_passive_3/shuangfu362",
  "23510903": "ui/atlas/talent_passive_3/shuangfu362",
  // Phantom Falcon AoE is linked through a design-only buff row, so use the
  // talent icon that owns the proc.
  "2220353101": "ui/atlas/talent_passive_11/gongjian1153",
};

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
  Id?: number | string;
  Name?: string;
  Names?: LocalizedTextMap;
  DamageName?: string;
  LinkedId?: number | string;
  LinkedSource?: string;
  LinkedBuffId?: number | string;
  BuffSourceId?: number | string;
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

const BURN_EFFECT_NAMES: LocalizedTextMap = {
  en: "Burn",
  "zh-CN": "燃烧",
  "zh-TW": "燃燒",
  ja: "バーニング",
  "ko-KR": "연소",
  fr: "Brûlure",
  de: "Verbrennung",
  es: "Quemadura",
  "pt-BR": "Queimadura",
  th: "เผาไหม้",
  id: "Burn",
};

const S2_SET_4B_SHIELD_NAMES: LocalizedTextMap = {
  en: "S2 Set 4B Shield",
  "zh-CN": "S2套装4B护盾",
  "zh-TW": "S2套裝4B護盾",
  ja: "S2セット4Bシールド",
  "ko-KR": "S2 세트 4B 보호막",
  fr: "Bouclier S2 Set 4B",
  de: "S2-Set-4B-Schild",
  es: "Escudo S2 Set 4B",
  "pt-BR": "Escudo S2 Set 4B",
  th: "โล่ S2 Set 4B",
  id: "Perisai S2 Set 4B",
};

const MOONLIGHT_SOLACE_SHIELD_NAMES: LocalizedTextMap = {
  en: "Moonlight Solace Shield",
  "zh-CN": "苍月慰藉护盾",
  "zh-TW": "蒼月慰藉護盾",
  ja: "蒼月の慰めバリア",
  "ko-KR": "창월의 위로 보호막",
  fr: "Bouclier Réconfort du clair de Lune",
  de: "Mondschein-Trost-Schild",
  es: "Escudo Solaz Claroluna",
  "pt-BR": "Escudo Consolo Lunar",
  th: "โล่ Moonlight Solace",
  id: "Shield Moonlight Solace",
};

const DRAGON_SCORCHING_GROUND_NAMES: LocalizedTextMap = {
  en: "Dragon's Scorching Ground",
  "zh-CN": "巨龙地板烫脚",
  "zh-TW": "巨龍地板燙腳",
  ja: "ドラゴンの灼熱地面",
  "ko-KR": "용의 불타는 지면",
  fr: "Sol brûlant du dragon",
  de: "Drachen-Glutboden",
  es: "Suelo abrasador del dragón",
  "pt-BR": "Chão abrasador do dragão",
  th: "พื้นแผดเผาของมังกร",
  id: "Lantai Membara Naga",
};

const PHANTOM_FALCON_AOE_NAMES: LocalizedTextMap = {
  en: "Phantom Falcon AoE",
  "zh-CN": "幻影雄鹰AOE",
  "zh-TW": "幻影雄鷹AOE",
  ja: "Phantom Falcon AoE",
  "ko-KR": "Phantom Falcon AoE",
  fr: "Phantom Falcon AoE",
  de: "Phantom Falcon AoE",
  es: "Phantom Falcon AoE",
  "pt-BR": "Phantom Falcon AoE",
  th: "Phantom Falcon AoE",
  id: "Phantom Falcon AoE",
};

const EFFECT_SOURCE_NAME_OVERRIDES: Record<string, LocalizedTextMap> = {
  // 2208181 is the Burn damage/buff source. It is linked to the Inferno
  // Explosion family icon, but should not inherit Explosion as its row name.
  "buff-source:2208181": BURN_EFFECT_NAMES,
  "buff-source:2203531": PHANTOM_FALCON_AOE_NAMES,
  "buff-source:2202705": MOONLIGHT_SOLACE_SHIELD_NAMES,
  "buff-source:2404271": S2_SET_4B_SHIELD_NAMES,
};

const DAMAGE_ID_NAME_OVERRIDES: Record<string, LocalizedTextMap> = {
  "11013510101": DRAGON_SCORCHING_GROUND_NAMES,
  "2220353101": PHANTOM_FALCON_AOE_NAMES,
  "2220818103": BURN_EFFECT_NAMES,
  "2220270501": MOONLIGHT_SOLACE_SHIELD_NAMES,
  "2240427101": S2_SET_4B_SHIELD_NAMES,
};

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

function isGeneratedPlaceholderText(value: string | undefined): boolean {
  return /\b(?:Unmapped|Unknown|Active)\s+(?:Buff|Skill|Source|Item|Monster|Scene)\s+\d+\b/i
    .test(value?.trim() ?? "");
}

function resolveNameOverride(
  values: LocalizedTextMap | undefined,
  locale: string,
): string | undefined {
  if (!values) return undefined;
  const localized = resolveLocalizedText(values, locale, values["en"] ?? values["design"] ?? "").trim();
  return localized || undefined;
}

function resolveDamageIdNameOverride(
  damageId: number | string,
  locale: string,
): string | undefined {
  return resolveNameOverride(DAMAGE_ID_NAME_OVERRIDES[String(damageId)], locale);
}

function resolveEffectSourceName(
  sourceId: string,
  locale: string,
): string | undefined {
  const overrideName = resolveNameOverride(EFFECT_SOURCE_NAME_OVERRIDES[sourceId], locale);
  if (overrideName) return overrideName;

  const source = effectSourcesById[sourceId];
  const englishName = source?.sourceNames?.["en"]?.trim();
  if (!source || !englishName || isGeneratedPlaceholderText(englishName)) {
    return undefined;
  }

  const localized = resolveLocalizedText(
    source.sourceNames,
    locale,
    source.sourceName ?? englishName,
  ).trim();
  return localized && !isGeneratedPlaceholderText(localized) ? localized : undefined;
}

function linkedBuffSourceIds(
  entry: DamageAttrNameEntry | undefined,
  detail?: SkillBreakdownDetail,
): string[] {
  const ids = new Set<string>();
  const addBuffId = (value: number | string | undefined) => {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) {
      ids.add(`buff-source:${numberValue}`);
    }
  };

  if (entry && typeof entry !== "string") {
    addBuffId(entry.BuffSourceId);
    addBuffId(entry.LinkedBuffId);
    if (!entry.LinkedSource || entry.LinkedSource === "BuffName") {
      addBuffId(entry.LinkedId);
    }
  }

  addBuffId(detail?.BuffSourceId);
  addBuffId(detail?.LinkedBuffId);
  if (!detail?.LinkedSource || detail.LinkedSource === "BuffName") {
    addBuffId(detail?.LinkedId);
  }

  return [...ids];
}

function resolveLinkedBuffSourceName(
  entry: DamageAttrNameEntry | undefined,
  locale: string,
  detail?: SkillBreakdownDetail,
): string | undefined {
  for (const sourceId of linkedBuffSourceIds(entry, detail)) {
    const sourceName = resolveEffectSourceName(sourceId, locale);
    if (sourceName) return sourceName;
  }
  return undefined;
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
  const overrideName = entry.Id !== undefined
    ? resolveDamageIdNameOverride(entry.Id, locale)
    : undefined;
  if (overrideName) return overrideName;

  const localized = resolveLocalizedText(
    entry.Names,
    locale,
    entry.Name ?? entry.DamageName ?? "",
  ).trim();
  if (localized && !isDesignOnlyTextMap(entry.Names)) return localized;

  const linkedSourceName = resolveLinkedBuffSourceName(entry, locale);
  if (linkedSourceName) return linkedSourceName;

  return resolveLinkedBuffFamilyName(entry, locale)
    ?? localized
    ?? entry.Name
    ?? entry.DamageName;
}

function lookupDamageAttrIconPath(damageId: number | string): string | undefined {
  const overrideIconPath = resolveStaticIconUrl(ICON_OVERRIDES_BY_DAMAGE_ID[String(damageId)]);
  if (overrideIconPath) return overrideIconPath;

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

function lookupSameIdRecountName(damageId: number | string, locale: string): string | undefined {
  const group = recountTable[String(damageId)];
  if (!group || isDesignOnlyTextMap(group.Names)) return undefined;
  const name = resolveLocalizedText(group.Names, locale, group.RecountName).trim();
  return name || undefined;
}

export function lookupDamageIdName(damageId: number): string {
  const overrideName = resolveDamageIdNameOverride(damageId, "en");
  if (overrideName) return overrideName;

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
  const overrideName = resolveDamageIdNameOverride(damageId, locale);
  if (overrideName) return overrideName;

  const damageIdNumber = Number(damageId);
  if (Number.isFinite(damageIdNumber)) {
    const recount = DAMAGE_TO_RECOUNT.get(damageIdNumber);
    if (recount) {
      const group = recountTable[String(recount.recountId)];
      return resolveLocalizedText(group?.Names, locale, recount.recountName);
    }
  }

  const damageEntry = damageAttrIdNames[String(damageId)];
  const sameIdRecountName = lookupSameIdRecountName(damageId, locale);
  if (
    sameIdRecountName
    && (!damageEntry || typeof damageEntry === "string" || isDesignOnlyTextMap(damageEntry.Names))
  ) {
    return sameIdRecountName;
  }

  return resolveDamageAttrName(damageEntry, locale) ?? `Unknown (${damageId})`;
}

export function lookupSkillBreakdownDetail(
  skillId: number | string,
): SkillBreakdownDetail | undefined {
  return skillBreakdownDetails[String(skillId)];
}

export function lookupSkillBreakdownIconPath(skillId: number | string): string | undefined {
  const overrideIconPath = resolveStaticIconUrl(ICON_OVERRIDES_BY_DAMAGE_ID[String(skillId)]);
  if (overrideIconPath) return overrideIconPath;

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
  const overrideIconPath = resolveStaticIconUrl(ICON_OVERRIDES_BY_RECOUNT_ID[String(recountId)]);
  if (overrideIconPath) return overrideIconPath;

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

const DESIGN_MONSTER_SKILL_ACTION_MARKERS = [
  "砸地冲击",
  "双拳重砸",
  "持续治疗",
  "疯狂射击",
  "连踩地板",
  "电能爆散",
  "能量粒子",
  "威慑吼叫",
  "瞬步刺杀",
  "火球术",
  "普攻",
  "连击",
  "爪击",
  "挥击",
  "挥砍",
  "戳刺",
  "突刺",
  "重斩",
  "连斩",
  "横扫",
  "下砸",
  "砸地",
  "重砸",
  "践踏",
  "甩尾",
  "吐息",
  "喷火",
  "射击",
  "治疗",
  "蓄力",
  "冲锋",
  "拳击",
  "连拳",
  "轰拳",
  "拍击",
  "重锤",
  "锤击",
  "地波",
  "风刀阵",
  "连续下砸",
  "蓄力重击",
  "横冲直撞",
  "跳跃重砸",
  "集束弹",
  "连斩虚拟体",
  "电磁脉冲",
  "强化脉冲",
  "充能连击",
  "坠击",
  "跃击",
  "挥拳",
  "顺劈",
  "致死",
  "印记",
  "红光",
  "前砍",
  "乱舞",
] as const;

const DESIGN_MONSTER_SKILL_EXACT_LABELS: Record<string, LocalizedTextMap> = {
  "普攻": { en: "Basic Attack" },
  "普攻1": { en: "Basic Attack 1" },
  "普攻2": { en: "Basic Attack 2" },
  "普攻01": { en: "Basic Attack 1" },
  "普攻02": { en: "Basic Attack 2" },
  "普攻03": { en: "Basic Attack 3" },
  "普攻04": { en: "Basic Attack 4" },
  "普攻四连": { en: "Four-Hit Basic Attack" },
  "普攻三连": { en: "Triple Basic Attack" },
  "普攻4段": { en: "Four-Hit Basic Attack" },
  "普攻-连拳": { en: "Basic Attack - Combo Punch" },
  "12连发": { en: "12-Round Burst" },
  "三连击": { en: "Triple Strike" },
  "二连击": { en: "Double Strike" },
  "爪击三连": { en: "Triple Claw Strike" },
  "火焰兽人爪击三连": { en: "Triple Claw Strike" },
  "火焰兽人砸地冲击": { en: "Ground Slam Shockwave" },
  "火焰兽人三连击（激昂）": { en: "Enraged Triple Strike" },
  "火焰兽人践踏": { en: "Stomp" },
  "火焰兽人吐息": { en: "Breath" },
  "火焰兽人前跳砸地": { en: "Forward Leap Ground Slam" },
  "机兵陷阱直线喷火": { en: "Linear Flamethrower" },
  "机兵旋转喷火": { en: "Spinning Flamethrower" },
  "双拳重砸（扩散）": { en: "Double-Fist Slam (Spread)" },
  "甩尾": { en: "Tail Swipe" },
  "大机器人-步进移动": { en: "Step Movement" },
  "遗留自动机像-蓄力重击": { en: "Charged Heavy Strike" },
  "遗留自动机像-三连击": { en: "Triple Strike" },
  "遗留自动机像-拳击": { en: "Punch" },
  "遗留自动机像-挥拳": { en: "Punch" },
  "遗留自动机像-过载": { en: "Overload" },
  "遗留自动机像-跃击": { en: "Leaping Strike" },
  "遗留自动机像-跳跃重砸": { en: "Leaping Heavy Slam" },
  "遗留自动机像-溅射激光": { en: "Splash Laser" },
  "遗留自动机像-电磁脉冲": { en: "Electromagnetic Pulse" },
  "遗留自动机像-强化脉冲": { en: "Empowered Pulse" },
  "遗留自动机像-能量倾泻": { en: "Energy Discharge" },
  "遗留自动机像-能量轰击": { en: "Energy Bombardment" },
  "遗留自动机像-能量轰击爆炸": { en: "Energy Bombardment Explosion" },
  "遗留自动机像-引力砸击": { en: "Gravity Slam" },
  "遗留自动机像-充能连击": { en: "Charged Combo" },
  "蜘蛛普攻01": { en: "Basic Attack 1" },
  "蜘蛛普攻02": { en: "Basic Attack 2" },
  "小刀哥布林二连击": { en: "Double Strike" },
  "剑盾哥布林二连击": { en: "Double Strike" },
  "剑盾哥布林戳刺": { en: "Stab" },
  "巫师哥布林火球术": { en: "Fireball" },
  "巫师哥布林持续治疗-英雄本": { en: "Heal over Time - Heroic" },
  "哥布林王三连击": { en: "Triple Strike" },
  "巨斧哥布林重斩": { en: "Heavy Slash" },
  "巨斧哥布林二连斩": { en: "Double Slash" },
  "巨斧哥布林挥砍-英雄本": { en: "Slash - Heroic" },
  "巨斧哥布林回旋斩": { en: "Spinning Slash" },
  "巨斧哥布林横扫": { en: "Sweep" },
  "弩箭哥布林疯狂射击": { en: "Rapid Fire" },
  "弩箭哥布林射击": { en: "Shot" },
  "巨龙爪击": { en: "Dragon Claw Strike" },
  "巨龙地板烫脚": DRAGON_SCORCHING_GROUND_NAMES,
  "巨龙站桩吐息": { en: "Dragon Breath" },
  "巨口吐息": { en: "Maw Breath" },
  "混乱吐息-左": { en: "Chaos Breath - Left" },
  "混乱吐息-右": { en: "Chaos Breath - Right" },
  "赤玉地狐-赤火印记": { en: "Scarlet Flame Mark" },
  "嗜血连喰": { en: "Bloodthirsty Devour Combo" },
  "神秘人普攻2": { en: "Basic Attack 2" },
  "幻祸娜宝-旗枪下砸": { en: "Banner Spear Downward Slam" },
  "幻祸娜宝-弓箭爆裂": { en: "Plague Nappo - Arrow Burst" },
  "翡翠角羊-冲锋": { en: "Charge" },
  "翡翠角羊-连踩地板": { en: "Repeated Floor Stomp" },
  "翡翠角羊-蓄力轰拳": { en: "Charged Power Punch" },
  "虚蚀连斩": { en: "Corrosion Combo Slash" },
  "虚蚀人类挥击": { en: "Corrupted Human Swing" },
  "吐息": { en: "Breath" },
  "突刺": { en: "Thrust" },
  "咬你一口": { en: "Bite" },
  "钢铁月环": { en: "Steel Moon Ring" },
  "奥尔维拉太刀普攻": { en: "Odachi Basic Attack" },
  "三连突刺": { en: "Triple Thrust" },
  "冲锋离子刃（右手）": { en: "Charging Ion Blade (Right Hand)" },
  "动漫岛-旋转激光": { en: "Spinning Laser" },
  "崩坏能量": { en: "Collapse Energy" },
  "多戈尔曼地波aoe2": { en: "Ground Wave AoE 2" },
  "多戈尔曼旋转锤击三连": { en: "Triple Spinning Hammer Strike" },
  "载人机兵-激昂重锤": { en: "Enraged Heavy Hammer" },
  "机甲A变身大招-蓄力重击": { en: "Mecha A Transform Ultimate - Charged Heavy Strike" },
  "机甲B变身-连续下砸": { en: "Mecha B Transform - Repeated Downward Slam" },
  "浮游炮激光跟踪（诅咒煌墓）": { en: "Floating Cannon Laser Tracking (Cursed Radiant Tomb)" },
  "能量柱dummy": { en: "Energy Pillar" },
  "Type-Ω主战机-拳击": { en: "Punch" },
  "Type-Ω主战机-挥拳": { en: "Punch" },
  "Type-Ω主战机-超载": { en: "Overload" },
  "Type-Ω主战机-下砸": { en: "Downward Slam" },
  "Type-Ω主战机-连续下砸": { en: "Repeated Downward Slam" },
  "Type-Ω主战机-冲锋": { en: "Charge" },
  "Type-Ω主战机-横冲直撞": { en: "Wild Charge" },
  "Type-Ω主战机-坠击": { en: "Plunging Strike" },
  "Type-Ω主战机-顺劈": { en: "Cleave" },
  "Type-Ω主战机-跳跃重砸": { en: "Leaping Heavy Slam" },
  "Type-Ω主战机-拍击": { en: "Smack" },
  "冲锋离子刃（左手）": { en: "Charging Ion Blade (Left Hand)" },
  "集束弹": { en: "Cluster Shot" },
  "集束弹（普攻）": { en: "Cluster Shot (Basic Attack)" },
  "集束弹（离子刃）": { en: "Cluster Shot (Ion Blade)" },
  "集束弹（顺劈）": { en: "Cluster Shot (Cleave)" },
  "追击集束弹": { en: "Follow-up Cluster Shot" },
  "连斩虚拟体-最小范围": { en: "Combo Slash Avatar - Minimum Range" },
  "连斩虚拟体-中等范围": { en: "Combo Slash Avatar - Medium Range" },
  "连斩虚拟体-最大范围": { en: "Combo Slash Avatar - Maximum Range" },
  "炎角-普攻三连": { en: "Triple Basic Attack" },
  "监视者打击（玩家）": { en: "Watcher Strike (Player)" },
  "野猪王踩地板": { en: "Floor Stomp" },
  "野猪王-踩地板": { en: "Floor Stomp" },
  "远程AOE地面伤害": { en: "Ranged Ground AoE" },
  "野猪王-压团血": { en: "Raidwide Damage" },
  "野猪王-雷球通电": { en: "Lightning Orb Charge" },
  "野猪王-蓄力普攻3连": { en: "Charged Triple Basic Attack" },
  "野猪王散落子弹": { en: "Scattered Bullets" },
  "野猪王-普攻2右侧攻击": { en: "Basic Attack 2 - Right Side" },
  "野猪王-普攻3左侧攻击": { en: "Basic Attack 3 - Left Side" },
  "野猪吼叫": { en: "Boar Roar" },
  "雷光野猪-普攻虚拟体": { en: "Blazing Boar - Basic Attack Avatar" },
  "炎光全场aoe": { en: "Sunfire Arena AoE" },
  "幻华全场aoe": { en: "Moonstrike Arena AoE" },
  "召唤隐形npc技能": { en: "Summon Invisible NPC Skill" },
  "领地共鸣伤害": { en: "Domain Resonance Damage" },
  "陨石雨": { en: "Meteor Shower" },
  "落雷虚拟体": { en: "Lightning Strike Avatar" },
  "普通黑色肉山左勾拳": { en: "Left Hook" },
  "普通棕色肉山右勾拳": { en: "Right Hook" },
  "宠物-地狐咬": { en: "Fox Pet Bite" },
  "检测炸团aoe": { en: "Explosion Check AoE" },
  "虚蚀蒂娜_虚蚀重击": { en: "Corroded Tina - Heavy Strike" },
  "殷红断狱-绯狱千斩点名": { en: "Scarlet Prison - Crimson Thousand Slashes Target" },
  "巨龙分摊": { en: "Dragon Shared Damage" },
  "神罚内上外下": { en: "Divine Punishment - Inner Up, Outer Down" },
  "神罚内下外上": { en: "Divine Punishment - Inner Down, Outer Up" },
  "肉鸽大秘境角羊平A": { en: "Caprahorn Basic Attack" },
  "睡眠叠盾炸人": { en: "Sleep Shield Stack Explosion" },
  "火焰兽人激昂": { en: "Enraged Flame Orc" },
  "幻影湮灭虚拟体": { en: "Phantom Annihilation Avatar" },
  "殷红断狱-顺劈": { en: "Scarlet Prison - Cleave" },
  "绯红剑影惩罚爆炸P1": { en: "Crimson Sword Shadow Punishment Explosion P1" },
  "机制-梦魇缠绕爆炸伤害": { en: "Mechanic - Nightmare Bind Explosion Damage" },
  "跳圈烟圈": { en: "Jump Circle Smoke Ring" },
  "光浪": { en: "Light Wave" },
  "致死虚拟体": { en: "Lethal Damage Avatar" },
  "机制-梦魇缠绕连线": { en: "Mechanic - Nightmare Bind Tether" },
  "蜥蜴-披甲": { en: "Lizard - Armored" },
  "幻祸娜宝-踩踏AOE": { en: "Plague Nappo - Stomp AoE" },
  "领地分摊": { en: "Domain Shared Damage" },
  "赤玉地狐-点名爆炸虚拟体": { en: "Scarlet Foxen - Targeted Explosion Avatar" },
  "迷失地板（45扇形单片）": { en: "Lost Floor (45-Degree Fan Segment)" },
  "全场aoe": { en: "Arena-Wide AoE" },
  "幻祸娜宝-娜宝炸弹": { en: "Plague Nappo - Nappo Bomb" },
  "娜宝飞扑": { en: "Nappo Pounce" },
  "牛羊犯病": { en: "Caprahorn Frenzy" },
  "光灵虚拟体": { en: "Light Spirit Avatar" },
  "闪电打击-虚拟体": { en: "Lightning Strike Avatar" },
  "愤怒践踏虚拟体": { en: "Angry Stomp Avatar" },
  "炎光誓死守护-攻": { en: "Sunfire Deathsworn Guard - Attack" },
  "死刑爆炸虚拟体": { en: "Execution Explosion Avatar" },
  "奥义！引力奇点": { en: "Ultimate! Gravitational Singularity" },
  "爬塔事件-自爆倒计时": { en: "Tower Event - Self-Destruct Countdown" },
  "石头人-追逐战阶段叠层计数": { en: "Golem - Chase Phase Stack Count" },
  "卷心菜特技-内外圈雷电": { en: "Cabbage Special - Inner/Outer Lightning" },
  "紫电爆炸aoe": { en: "Violet Lightning Explosion AoE" },
  "环形电弧": { en: "Ring Arc" },
  "践踏踩空后全场冲击波": { en: "Arena Shockwave After Missed Stomp" },
  "赤玉地狐-扫尾": { en: "Scarlet Foxen - Tail Sweep" },
  "幻祸娜宝-跳跃AOE": { en: "Plague Nappo - Jump AoE" },
  "太刀裂痕虚拟体": { en: "Katana Rift Avatar" },
  "迷途分散圈": { en: "Lost Spread Circle" },
  "迷途分摊圈": { en: "Lost Shared-Damage Circle" },
  "召唤心魔": { en: "Summon Inner Demon" },
  "召唤心魔E1": { en: "Summon Inner Demon E1" },
  "棒槌哥布林（虚蚀）三连击": { en: "Triple Strike" },
  "生存小招-生命护盾": { en: "Survival Skill - Life Shield" },
  "破": { en: "Break" },
  "蓄气": { en: "Charge Up" },
  "石头人直线地幔-延迟出": { en: "Golem Linear Mantle - Delayed" },
  "地板延迟打击点蟹蛛毒球-以自己为中心的随机圆形范围": {
    en: "Delayed Floor Strike - Spider Poison Orb Random Circle Around Self",
  },
  "污染区域": { en: "Contaminated Zone" },
  "绯红剑影普通爆炸P1": { en: "Crimson Sword Shadow Normal Explosion P1" },
  "肉山-幻蚀领域": { en: "Flesh Mound - Corrosion Field" },
  "小刀哥布林二连击（火）": { en: "Knife Goblin Double Strike (Fire)" },
  "砸死你": { en: "Crush You" },
  "石头人落石": { en: "Golem Falling Rocks" },
  "石头人落石-延迟出": { en: "Golem Falling Rocks - Delayed" },
  "迷失地板（90扇形整）": { en: "Lost Floor (Full 90-Degree Fan)" },
  "迷失地板（半场刀）": { en: "Lost Floor (Half-Arena Blade)" },
  "幻象施法（有特效）": { en: "Illusion Cast (With Effect)" },
  "迷失地板（矩形）": { en: "Lost Floor (Rectangle)" },
  "填充攻击-双手斩": { en: "Filler Attack - Two-Handed Slash" },
  "核心技能-缚魂之链-虚拟体": { en: "Core Skill - Soul Binding Chain Avatar" },
  "鬼人化关闭标记buff": { en: "Demon Form End Marker Buff" },
  "亡灵还魂-BOSS-结算全体伤害": { en: "Undead Revival - Boss - Final Raidwide Damage" },
  "点名分摊-分雷劫": { en: "Targeted Share - Split Thunder Calamity" },
  "对T致死-破影一击": { en: "Tank Lethal - Shadowbreak Strike" },
  "核心技能-斩杀之匕-匕首虚拟体": { en: "Core Skill - Execution Dagger Avatar" },
  "威慑吼叫": { en: "Intimidating Roar" },
  "领地致死": { en: "Domain Lethal Damage" },
};

const DESIGN_MONSTER_SKILL_TOKEN_LABELS: Array<[string, string]> = [
  ["连斩虚拟体", "Combo Slash Avatar"],
  ["连续下砸", "Repeated Downward Slam"],
  ["蓄力重击", "Charged Heavy Strike"],
  ["砸地冲击", "Ground Slam Shockwave"],
  ["双拳重砸", "Double-Fist Slam"],
  ["持续治疗", "Heal over Time"],
  ["疯狂射击", "Rapid Fire"],
  ["电磁脉冲", "Electromagnetic Pulse"],
  ["强化脉冲", "Empowered Pulse"],
  ["充能连击", "Charged Combo"],
  ["横冲直撞", "Wild Charge"],
  ["跳跃重砸", "Leaping Heavy Slam"],
  ["集束弹", "Cluster Shot"],
  ["追击", "Follow-up"],
  ["最小范围", "Minimum Range"],
  ["中等范围", "Medium Range"],
  ["最大范围", "Maximum Range"],
  ["连踩地板", "Repeated Floor Stomp"],
  ["电能爆散", "Electric Burst"],
  ["能量粒子", "Energy Particles"],
  ["威慑吼叫", "Intimidating Roar"],
  ["瞬步刺杀", "Flash-Step Assassination"],
  ["火球术", "Fireball"],
  ["十二连发", "12-Round Burst"],
  ["六连砸地", "Six-Hit Ground Slam"],
  ["四连", "Four-Hit"],
  ["三连", "Triple"],
  ["二连", "Double"],
  ["连发", "Burst"],
  ["连击", "Strike"],
  ["连斩", "Combo Slash"],
  ["普攻", "Basic Attack"],
  ["爪击", "Claw Strike"],
  ["挥击", "Swing"],
  ["挥砍", "Slash"],
  ["戳刺", "Stab"],
  ["突刺", "Thrust"],
  ["重斩", "Heavy Slash"],
  ["回旋斩", "Spinning Slash"],
  ["横扫", "Sweep"],
  ["下砸", "Downward Slam"],
  ["坠击", "Plunging Strike"],
  ["跃击", "Leaping Strike"],
  ["砸地", "Ground Slam"],
  ["重砸", "Heavy Slam"],
  ["践踏", "Stomp"],
  ["甩尾", "Tail Swipe"],
  ["吐息", "Breath"],
  ["喷火", "Flamethrower"],
  ["旋转", "Spinning"],
  ["直线", "Linear"],
  ["射击", "Shot"],
  ["治疗", "Heal"],
  ["英雄本", "Heroic"],
  ["蓄力", "Charged"],
  ["冲锋", "Charge"],
  ["拳击", "Punch"],
  ["挥拳", "Punch"],
  ["顺劈", "Cleave"],
  ["连拳", "Combo Punch"],
  ["轰拳", "Power Punch"],
  ["拍击", "Smack"],
  ["重锤", "Heavy Hammer"],
  ["锤击", "Hammer Strike"],
  ["地波", "Ground Wave"],
  ["风刀阵", "Wind Blade Field"],
  ["崩坏能量", "Collapse Energy"],
  ["致死", "Lethal Damage"],
  ["领地", "Domain"],
  ["印记", "Mark"],
  ["赤火", "Scarlet Flame"],
  ["红光", "Red Light"],
  ["平击", "Flat Strike"],
  ["前砍", "Forward Slash"],
  ["刺杀", "Assassination"],
  ["乱舞", "Flurry"],
  ["超绝大招", "Ultimate"],
  ["完整", "Complete"],
  ["事件用", "Event"],
  ["旗枪", "Banner Spear"],
  ["月环", "Moon Ring"],
  ["离子刃", "Ion Blade"],
  ["右手", "Right Hand"],
  ["左", "Left"],
  ["右", "Right"],
];

function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function normalizeDesignMonsterSkillCandidate(value: string): string {
  return value
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replaceAll("_", "-")
    .replace(/\s+/g, " ")
    .trim();
}

function trimDesignMonsterOwnerPrefix(value: string): string {
  const normalized = normalizeDesignMonsterSkillCandidate(value);
  const parts = normalized.split("-").map((part) => part.trim()).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart && DESIGN_MONSTER_SKILL_ACTION_MARKERS.some((marker) => lastPart.includes(marker))) {
    return lastPart;
  }

  let markerIndex = -1;
  for (const marker of DESIGN_MONSTER_SKILL_ACTION_MARKERS) {
    const index = normalized.indexOf(marker);
    if (index > 0 && (markerIndex < 0 || index < markerIndex)) {
      markerIndex = index;
    }
  }

  return markerIndex > 0 ? normalized.slice(markerIndex) : normalized;
}

function translateDesignMonsterSkillCandidate(candidate: string, locale: string): string | undefined {
  const raw = candidate.trim();
  const normalized = normalizeDesignMonsterSkillCandidate(candidate);
  const exact = DESIGN_MONSTER_SKILL_EXACT_LABELS[normalized]
    ?? DESIGN_MONSTER_SKILL_EXACT_LABELS[raw];
  if (exact) return resolveLocalizedText(exact, locale, normalized);

  let translated = normalized
    .replace(/普攻0?(\d+)/g, " Basic Attack $1 ")
    .replace(/(\d+)连发/gi, " $1-Round Burst ")
    .replace(/(\d+)连/g, " $1-Hit ");

  for (const [token, label] of DESIGN_MONSTER_SKILL_TOKEN_LABELS) {
    translated = translated.replaceAll(token, ` ${label} `);
  }

  translated = translated
    .replaceAll("(", " (")
    .replaceAll(")", ") ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  if (!translated || translated === normalized || hasCjkText(translated)) return undefined;
  return translated;
}

function translateDesignMonsterSkillName(designName: string | undefined, locale: string): string | undefined {
  const trimmed = designName?.trim();
  if (!trimmed || locale.toLowerCase().startsWith("zh")) return undefined;

  const candidates: string[] = [];
  for (const candidate of [trimmed, trimDesignMonsterOwnerPrefix(trimmed)]) {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  }

  for (const candidate of candidates) {
    const translated = translateDesignMonsterSkillCandidate(candidate, locale);
    if (translated) return translated;
  }

  return undefined;
}

function extractDesignDamageName(
  entry: DamageAttrNameEntry | undefined,
  detail: SkillBreakdownDetail | undefined,
): string | undefined {
  if (entry && typeof entry !== "string") {
    const direct = entry.Names?.["design"]?.trim()
      || entry.Name?.trim()
      || entry.DamageName?.trim();
    if (direct) return direct;
  }

  return detail?.DamageNames?.["design"]?.trim()
    || detail?.UnderlyingSkillNames?.["design"]?.trim()
    || detail?.LinkedNames?.["design"]?.trim()
    || detail?.DamageName?.trim()
    || detail?.UnderlyingSkillName?.trim()
    || detail?.LinkedName?.trim();
}

export function lookupDeathReplaySkillName(
  damageId: number | string,
  locale: string,
  options: { isMonsterDamage?: boolean } = {},
): string {
  const detail = lookupSkillBreakdownDetail(damageId);
  const damageEntry = damageAttrIdNames[String(damageId)];
  const designName = extractDesignDamageName(damageEntry, detail);
  const shouldTryMonsterFallback = options.isMonsterDamage || detail?.MonsterOwnerNames;
  const translatedDesignName = shouldTryMonsterFallback
    ? translateDesignMonsterSkillName(designName, locale)
    : undefined;
  if (translatedDesignName) return translatedDesignName;

  const localized = lookupLocalizedDamageIdName(damageId, locale);
  const localeAllowsCjk = locale.toLowerCase().startsWith("zh");
  if (localized && !localized.startsWith("Unknown") && (localeAllowsCjk || !hasCjkText(localized))) {
    return localized;
  }

  if (!shouldTryMonsterFallback) {
    const fallbackDesignName = translateDesignMonsterSkillName(designName, locale);
    if (fallbackDesignName) return fallbackDesignName;
  }

  const damageIdNumber = Number(damageId);
  return Number.isFinite(damageIdNumber)
    ? lookupDamageIdName(damageIdNumber)
    : `Unknown (${damageId})`;
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
  const overrideName = resolveDamageIdNameOverride(row.skillId, locale);
  if (overrideName) return overrideName;

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
    ? resolveLinkedBuffSourceName(damageEntry, locale, detail)
      ?? resolveLinkedBuffFamilyName(damageEntry, locale)
      ?? rawLinkedName
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
