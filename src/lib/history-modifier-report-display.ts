export type LocalizedTextMap = Record<string, string>;

export type ModifierActivityScope = "all-active" | "static-targets";
export type ModifierActorFilter = "all" | "external";
export type ModifierContributionConfidence = "exact" | "low" | "medium";
export type ModifierContributionMode =
  | "exact-produced-damage"
  | "formula-replay-candidate"
  | "timing-only"
  | "defensive"
  | "overlap-only";
export type ModifierContributionTier =
  | "exact"
  | "replay-required"
  | "timing"
  | "non-damage"
  | "overlap-only";
export type ModifierFormulaReplayStatus =
  | "counterfactual-replayed"
  | "ready-for-replay"
  | "aggregate-only"
  | "blocked-missing-evidence";

export type ModifierSourceActor = {
  uid: number;
  name: string;
  entityType?: string;
  ownerUid?: number | null;
  ownerName?: string | null;
  sourceConfigIds?: number[];
  baseIds?: number[];
};

export type ModifierActorSummary = {
  hostUids: number[];
  sourceUids: number[];
  externalSourceUids: number[];
  selfSourceUids: number[];
  sourceActors: ModifierSourceActor[];
  externalSourceActors: ModifierSourceActor[];
  selfSourceActors: ModifierSourceActor[];
};

export type ModifierTimingModel = {
  kind: "cooldown-acceleration";
  status: "event-backed" | "needs-cooldown-events" | "needs-window";
  cooldownEvents: number;
  castEventsDuringWindow: number;
  affectedSkillIds: number[];
  affectedSkillLevelIds: number[];
  totalDirectReductionMs: number;
  totalAccelerationOpportunityMs: number;
  totalTimeSavedMs: number;
  extraCastOpportunity: number;
  estimatedOpportunityDamage?: number;
  averageAccelerateRate: number;
  notes: string[];
};

export type ModifierAttributionComponent = {
  componentKey?: string;
  label?: string;
  effectClass?: string;
  contributionScope?: string;
  direction?: string;
  stat?: string;
  valueScope?: ModifierContributionComponentValueScope;
  formulaTermIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  requiredRuntimeEvidence?: string[];
  valueTexts?: string[];
};

export type ModifierContributionComponentValueScope = "all" | "owner" | "party" | "ambiguous" | "unknown";
export type ModifierContributionComponentActorScope = "owner" | "party" | "mixed" | "unknown";
export type ModifierContributionComponentValueUnit = "percent" | "seconds" | "flat";
export type ModifierContributionComponentValueResolution =
  | "single"
  | "owner-party-split"
  | "ambiguous-multiple-values"
  | "unparsed";

export type ModifierContributionComponentValue = {
  scope?: ModifierContributionComponentValueScope;
  rawText?: string;
  unit?: ModifierContributionComponentValueUnit;
  value?: number;
  decimalValue?: number;
  formulaAmount?: boolean;
  parseStatus?: string;
  inferredFrom?: string;
};

export type ModifierContributionComponentValueHint = {
  componentKey?: string;
  label?: string;
  effectClass?: string;
  contributionScope?: string;
  direction?: string;
  stat?: string;
  valueScope?: ModifierContributionComponentValueScope;
  formulaTermIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  valueResolution?: ModifierContributionComponentValueResolution;
  values?: ModifierContributionComponentValue[];
};

export type ModifierResolvedContributionComponentValue = ModifierContributionComponentValue & {
  componentKey?: string;
  label?: string;
  effectClass?: string;
  contributionScope?: string;
  direction?: string;
  stat?: string;
  valueScope?: ModifierContributionComponentValueScope;
  formulaTermIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  valueResolution?: ModifierContributionComponentValueResolution;
  actorScope?: ModifierContributionComponentActorScope;
  resolved?: boolean;
  selectedBy?: string;
};

export type ModifierAttributionModel = {
  schemaVersion?: number;
  damageFormulaId?: string;
  status?: string;
  confidence?: string;
  formulaTermIds?: string[];
  formulaZoneIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  requiredRuntimeEvidence?: string[];
  relationshipKinds?: string[];
  components?: ModifierAttributionComponent[];
  notes?: string[];
};

export type ModifierContributionModel = {
  sourceRuleId?: string;
  sourceId?: string;
  contributionMode: ModifierContributionMode;
  contributionTier: ModifierContributionTier;
  confidence?: "exact" | "needs-replay" | "not-applicable" | "overlap-only";
  formulaTermIds?: string[];
  formulaZoneIds?: string[];
  contributionGroups?: string[];
  componentClasses?: string[];
  predicateTags?: string[];
  relationshipKinds?: string[];
  requiredRuntimeEvidence?: string[];
  blockers?: string[];
  valueTexts?: string[];
  componentValueHints?: ModifierContributionComponentValueHint[];
  notes?: string[];
};

export type ModifierFormulaReplayModel = {
  status: ModifierFormulaReplayStatus;
  availableEvidence: string[];
  missingEvidence: string[];
  blockers: string[];
  bucketCount: number;
  singleHitBucketCount: number;
  mixedCritBucketCount: number;
  mixedLuckyBucketCount: number;
  hitCount: number;
  formulaTermIds?: string[];
  formulaZoneIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  componentValues?: ModifierResolvedContributionComponentValue[];
  replayedContributionTotal?: number;
  counterfactualTotal?: number;
  replayedHitCount?: number;
  replayedAppliedHitCount?: number;
  replayedComponents?: {
    componentKey?: string;
    label?: string;
    formulaTermIds?: string[];
    decimalValue?: number;
    contributionTotal: number;
    hitCount: number;
    method: string;
  }[];
  skippedReplayComponents?: string[];
  notes?: string[];
};

export type TalentOwnershipParserPolicy = {
  selectedTalentEvidenceRequired?: boolean;
  safeToRejectWrongSpec?: boolean;
  keepRuntimeEvidenceForAmbiguousRows?: boolean;
};

export type TalentOwnershipMetadata = {
  classId?: number;
  className?: string;
  classNames?: LocalizedTextMap;
  ownershipKind?: string;
  ownershipStatus?: string;
  confidence?: number;
  hardFilterEligible?: boolean;
  specIds?: number[];
  specNameKeys?: string[];
  specNames?: string[];
  dpsRelevance?: {
    affectsDps?: boolean;
    status?: string;
    reasons?: string[];
  };
  parserPolicy?: TalentOwnershipParserPolicy;
};

export type ModifierSourceClassification = {
  sourceRuleId?: string;
  sourceId?: string;
  rowModel?: string;
  primaryRole?: "offensive" | "defensive" | "supportive" | "utility" | "unknown";
  reportDomains?: ("damage" | "tanked" | "healing" | "support" | "utility" | "unknown")[];
  offensiveKind?: string;
  providerAggregation?: "actor-kind" | "source-uid";
  displayOwnerKind?: "battle-imagine";
  classificationTags?: string[];
  ownership?: TalentOwnershipMetadata & {
    allowedSpecIds?: number[];
    blacklistedSpecIds?: number[];
    hardFilterEligible?: boolean;
  };
};

export type ModifierActivitySkillRow = {
  key: string;
  rowKind: "recount" | "skill";
  skillId: number;
  recountId?: number;
  name: string;
  names?: LocalizedTextMap;
  damageIds: number[];
  match: "direct-static-target" | "no-static-target";
  totalDmg: number;
  effectiveTotal: number;
  estimatedContributionTotal?: number;
  estimatedContributionPct?: number;
  estimatedContributionConfidence?: ModifierContributionConfidence;
  contributionModel?: ModifierContributionModel;
  formulaReplayModel?: ModifierFormulaReplayModel;
  observedDmgPerHit?: number;
  baselineDmgPerHit?: number;
  baselineHits?: number;
  timingModel?: ModifierTimingModel;
  baseTotalDmg: number;
  baseEffectiveTotal: number;
  baseDmgPct: number;
  baseDps: number;
  baseHits: number;
  baseHitsPerMinute: number;
  dmgPct: number;
  sourcePct: number;
  coveragePct: number;
  dps: number;
  hits: number;
  hitsPerMinute: number;
  critRate: number;
  luckyRate: number;
};

export type ModifierActivityRow = {
  key: string;
  sourceRuleId?: string;
  sourceRuleIds?: string[];
  sourceId: string;
  sourceIds: string[];
  sourceKind: string;
  sourceType?: string;
  sourceEntityId?: number;
  sourceName: string;
  sourceNames?: LocalizedTextMap;
  description?: string;
  descriptions?: LocalizedTextMap;
  descriptionByGrade?: Record<number, string>;
  iconPath?: string;
  runtimeDetection?: string;
  providerAggregation?: "actor-kind" | "source-uid";
  displayOwnerKind?: "battle-imagine";
  buffIds: number[];
  evidence: string[];
  attributionModel?: ModifierAttributionModel;
  talentOwnership?: TalentOwnershipMetadata;
  classification?: ModifierSourceClassification;
  actorSummary: ModifierActorSummary;
  match: "direct-static-target" | "active-static-target-fallback" | "no-static-target" | "mixed";
  targetDamageIds: number[];
  targetRecountIds: number[];
  totalDmg: number;
  effectiveTotal: number;
  estimatedContributionTotal?: number;
  estimatedContributionPct?: number;
  estimatedContributionConfidence?: ModifierContributionConfidence;
  contributionModel?: ModifierContributionModel;
  formulaReplayModel?: ModifierFormulaReplayModel;
  observedDmgPerHit?: number;
  baselineDmgPerHit?: number;
  baselineHits?: number;
  timingModel?: ModifierTimingModel;
  dmgPct: number;
  coveragePct: number;
  dps: number;
  hits: number;
  hitsPerMinute: number;
  critRate: number;
  luckyRate: number;
  skills: ModifierActivitySkillRow[];
};

export function resolveLocalizedText(
  localized: LocalizedTextMap | undefined,
  locale: string,
  fallback = "",
): string {
  return localized?.[locale]
    ?? localized?.["en"]
    ?? localized?.["zh-CN"]
    ?? localized?.["design"]
    ?? Object.values(localized ?? {}).find((value) => value.trim())
    ?? fallback;
}

const UNMAPPED_BUFF_LABEL_PREFIXES = [
  "Unmapped Buff",
  "\u672a\u6620\u5c04\u589e\u76ca",
  "\u672a\u5c0d\u61c9\u589e\u76ca",
  "\u672a\u30de\u30c3\u30d4\u30f3\u30b0\u30d0\u30d5",
  "\ub9e4\ud551\ub418\uc9c0 \uc54a\uc740 \ubc84\ud504",
  "Buff non mapp\u00e9",
  "Nicht zugeordneter Buff",
  "Mejora sin asignar",
  "B\u00f4nus n\u00e3o mapeado",
  "\u0e1a\u0e31\u0e1f\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e41\u0e21\u0e1b",
  "Buff belum dipetakan",
];

function isGeneratedUnmappedBuffLabel(value: string | undefined, buffId: number | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (/^Unknown Modifier$/i.test(text)) return true;
  if (/^(?:Unmapped Buff|Buff) \d+$/i.test(text)) return true;
  if (!Number.isFinite(buffId)) return false;
  return UNMAPPED_BUFF_LABEL_PREFIXES.some((prefix) => text === `${prefix} ${buffId}`);
}

function resolveModifierLocalizedText(
  localized: LocalizedTextMap | undefined,
  locale: string,
  fallback: string,
  placeholderBuffId: number | undefined,
): string {
  const candidates = [
    localized?.[locale],
    localized?.["en"],
    localized?.["zh-CN"],
    localized?.["design"],
    ...Object.values(localized ?? {}),
    fallback,
  ];
  for (const value of candidates) {
    const text = value?.trim() ?? "";
    if (text && !isGeneratedUnmappedBuffLabel(text, placeholderBuffId)) return text;
  }
  return fallback;
}

function singleEvidenceGrade(evidence: string[]): number | null {
  const grades = new Set<number>();
  for (const item of evidence) {
    for (const match of item.matchAll(/(?:^|[:|])G(\d+)(?=$|[:|])/g)) {
      const grade = Number(match[1]);
      if (Number.isFinite(grade)) grades.add(grade);
    }
  }
  if (grades.size !== 1) return null;
  for (const grade of grades) return grade;
  return null;
}

export function resolveModifierSourceName(row: ModifierActivityRow, locale: string): string {
  const placeholderBuffId = typeof row.sourceEntityId === "number" ? row.sourceEntityId : row.buffIds?.[0];
  return resolveModifierLocalizedText(row.sourceNames, locale, row.sourceName, placeholderBuffId);
}

export function resolveModifierSourceDescription(row: ModifierActivityRow, locale: string): string {
  const grade = singleEvidenceGrade(row.evidence);
  const gradeDescription = grade !== null ? row.descriptionByGrade?.[grade]?.trim() : undefined;
  if (gradeDescription) return gradeDescription;
  return resolveLocalizedText(row.descriptions, locale, row.description ?? "").trim();
}

export function resolveModifierSkillName(row: ModifierActivitySkillRow, locale: string): string {
  return resolveLocalizedText(row.names, locale, row.name);
}
