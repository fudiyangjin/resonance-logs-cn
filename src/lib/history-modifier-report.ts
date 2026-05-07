import effectSourcesData from "$parserData/generated/EffectSources.json";
import seasonPhantomFactorsData from "$parserData/generated/SeasonPhantomFactors.json";
import skillCooldownsData from "$parserData/generated/SkillCooldowns.json";
import type {
  ActiveBuffState,
  ActiveEffectBuffState,
  ActiveFactorBuffState,
  HistoryEntityData,
  ModifierHitBucketState,
  ModifierWindowState,
  RawSkillStats,
} from "$lib/bindings";
import { lookupBuffLocalizedNames, lookupDefaultBuffName } from "$lib/config/buff-name-table";
import {
  groupSkillsByRecount,
  lookupDamageIdName,
  resolveLocalizedText,
  type LocalizedTextMap,
  type RecountGroup,
} from "$lib/config/recount-table";

export type ModifierActivityScope = "all-active" | "static-targets";
export type ModifierActorFilter = "all" | "external";
export type ModifierContributionConfidence = "low" | "medium";

export type ModifierActorSummary = {
  hostUids: number[];
  sourceUids: number[];
  externalSourceUids: number[];
  selfSourceUids: number[];
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
  buffIds: number[];
  evidence: string[];
  attributionModel?: ModifierAttributionModel;
  talentOwnership?: TalentOwnershipMetadata;
  actorSummary: ModifierActorSummary;
  match: "direct-static-target" | "no-static-target" | "mixed";
  targetDamageIds: number[];
  targetRecountIds: number[];
  totalDmg: number;
  effectiveTotal: number;
  estimatedContributionTotal?: number;
  estimatedContributionPct?: number;
  estimatedContributionConfidence?: ModifierContributionConfidence;
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

type EffectSourceTarget = {
  targetKind?: "damage" | "recount";
  damageId?: number;
  recountId?: number;
  targetId?: number;
  relationshipKind?: string;
};

type ModifierEvidenceGradeRow = {
  grade?: number;
  cleanResolvedDescription?: string;
  resolvedDescription?: string;
};

type ModifierEvidence = {
  cleanDescription?: string;
  cleanDescriptions?: LocalizedTextMap;
  resolvedDescription?: string;
  resolvedDescriptions?: LocalizedTextMap;
  gradeRows?: ModifierEvidenceGradeRow[];
};

export type ModifierAttributionComponent = {
  componentKey?: string;
  label?: string;
  effectClass?: string;
  contributionScope?: string;
  direction?: string;
  stat?: string;
  formulaTermIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  requiredRuntimeEvidence?: string[];
  valueTexts?: string[];
};

export type ModifierAttributionModel = {
  schemaVersion?: number;
  damageFormulaId?: string;
  status?: string;
  confidence?: string;
  formulaTermIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  requiredRuntimeEvidence?: string[];
  relationshipKinds?: string[];
  components?: ModifierAttributionComponent[];
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

type EffectSourceEntry = {
  sourceId: string;
  sourceKind?: string;
  sourceType?: string;
  sourceName?: string;
  sourceNames?: LocalizedTextMap;
  descriptions?: LocalizedTextMap;
  cleanDescriptions?: LocalizedTextMap;
  modifierEvidence?: ModifierEvidence;
  iconPath?: string;
  sourceEntityId?: number;
  runtimeDetection?: string;
  buffIds?: number[];
  targets?: EffectSourceTarget[];
  evidence?: Array<{ source?: string; relationshipPolicy?: string }>;
  attributionModel?: ModifierAttributionModel;
  talentOwnership?: TalentOwnershipMetadata;
};

type EffectSourcesData = {
  effectSourcesById?: Record<string, EffectSourceEntry>;
  buffIdToEffectSourceIds?: Record<string, string[]>;
};

type SeasonPhantomFactorEntry = {
  familyId?: number;
  buffId: number;
  familyName?: string;
  familyNames?: LocalizedTextMap;
  descriptions?: LocalizedTextMap;
  cleanDescriptions?: LocalizedTextMap;
  modifierEvidence?: ModifierEvidence;
  iconPath?: string;
  affectedDamageIds?: number[];
  affectedRecountIds?: number[];
};

type SeasonPhantomFactorData = {
  factorsByBuffId?: Record<string, SeasonPhantomFactorEntry>;
};

type SkillCooldownLevelEntry = {
  skillLevelId?: number;
  skillId?: number;
  level?: number;
  pveCooldownSeconds?: number;
  noCdReduce?: boolean;
};

type SkillCooldownSkillEntry = {
  skillId?: number;
  name?: string;
  names?: LocalizedTextMap;
  levelIds?: number[];
  maxPveCooldownSeconds?: number;
  minPveCooldownSeconds?: number;
  noCdReduce?: boolean;
};

type SkillCooldownsData = {
  skillCooldownsByLevelId?: Record<string, SkillCooldownLevelEntry>;
  skillCooldownsBySkillId?: Record<string, SkillCooldownSkillEntry>;
};

type ModifierSource = {
  groupKey: string;
  sourceId: string;
  sourceIds: Set<string>;
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
  buffIds: Set<number>;
  evidence: Set<string>;
  attributionModel?: ModifierAttributionModel;
  talentOwnership?: TalentOwnershipMetadata;
  actorHints: Set<string>;
  targetDamageIds: Set<number>;
  targetRecountIds: Set<number>;
  producedDamageIds: Set<number>;
  producedRecountIds: Set<number>;
  targetRelationshipKinds: Set<string>;
  coveragePct: number | null;
  windows: ModifierSourceWindow[];
};

type ModifierSourceWindow = {
  startMs: number;
  endMs: number;
};

type SkillParent = {
  rowKind: "recount" | "skill";
  key: string;
  skillId: number;
  recountId?: number;
  name: string;
  names?: LocalizedTextMap;
  damageIds: number[];
  totalDmg: number;
  effectiveTotal: number;
  dps: number;
  hits: number;
  hitsPerMinute: number;
  critRate: number;
  luckyRate: number;
};

type ExactSkillAggregate = {
  skill: SkillParent;
  match: "direct-static-target" | "no-static-target";
  totalDmg: number;
  effectiveTotal: number;
  hits: number;
  critHits: number;
  critTotal: number;
  luckyHits: number;
  luckyTotal: number;
};

type EstimatedContribution = {
  estimatedContributionTotal: number;
  estimatedContributionPct: number;
  estimatedContributionConfidence: ModifierContributionConfidence;
  observedDmgPerHit: number;
  baselineDmgPerHit: number;
  baselineHits: number;
};

type BucketObservedWindowSummary = {
  window: ModifierWindowState;
  intervals: ModifierSourceWindow[];
  intervalKeys: Set<string>;
};

type SkillParentLookup = Map<number, SkillParent>;

type ModifierBuildCaches = {
  sourceSearchText: Map<string, string>;
  parsedActorHints: Map<string, Array<{ hostUid: number | null; sourceUid: number | null }>>;
  timingLockout: Map<string, boolean>;
  broadDamage: Map<string, boolean>;
  runtimeBroadDamage: Map<string, boolean>;
  sourceCoveragePct: Map<string, number>;
  cooldownTimingModel: Map<string, ModifierTimingModel | null>;
};

const effectSources = effectSourcesData as EffectSourcesData;
const seasonPhantomFactors = seasonPhantomFactorsData as SeasonPhantomFactorData;
const skillCooldowns = skillCooldownsData as SkillCooldownsData;
const effectSourcesById = effectSources.effectSourcesById ?? {};
const buffIdToEffectSourceIds = effectSources.buffIdToEffectSourceIds ?? {};
const factorsByBuffId = seasonPhantomFactors.factorsByBuffId ?? {};
const skillCooldownsByLevelId = skillCooldowns.skillCooldownsByLevelId ?? {};
const skillCooldownsBySkillId = skillCooldowns.skillCooldownsBySkillId ?? {};
const sourcesByEntityId = new Map<number, EffectSourceEntry[]>();
const IGNORED_MODIFIER_BUFF_IDS = new Set([
  510072, // Hero dungeon wipe recovery: refill HP + clear cooldowns.
  900122, // Encounter reset utility: refill HP + clear cooldowns.
]);

for (const source of Object.values(effectSourcesById)) {
  if (typeof source.sourceEntityId !== "number" || !Number.isFinite(source.sourceEntityId)) {
    continue;
  }
  const rows = sourcesByEntityId.get(source.sourceEntityId) ?? [];
  rows.push(source);
  sourcesByEntityId.set(source.sourceEntityId, rows);
}

type ModifierBuildContext = {
  elapsedSecs: number;
  encounterStartMs?: number | null;
  encounterEndMs?: number | null;
  allEntities?: HistoryEntityData[];
};

type EncounterWindow = {
  startMs: number;
  endMs: number;
  durationMs: number;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finitePositiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...new Set([...values].filter(Number.isFinite))].sort((left, right) => left - right);
}

function modifierContextEntities(
  entity: HistoryEntityData,
  allEntities: HistoryEntityData[] | undefined,
): HistoryEntityData[] {
  const rows = [entity];
  const seen = new Set([entity.uid]);
  for (const row of allEntities ?? []) {
    if (seen.has(row.uid)) continue;
    seen.add(row.uid);
    rows.push(row);
  }
  return rows;
}

function sortedStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function rate(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function perMinute(value: number, elapsedSecs: number): number {
  return elapsedSecs > 0 ? (value / elapsedSecs) * 60 : 0;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 99.95) return 100;
  return Math.min(100, value);
}

function safePct(part: number, total: number): number {
  return clampPct(pct(part, total));
}

function isIgnoredModifierBuffId(value: unknown): boolean {
  const id = finitePositiveNumber(value);
  return id !== null && IGNORED_MODIFIER_BUFF_IDS.has(id);
}

function encounterWindow(context: ModifierBuildContext): EncounterWindow {
  const durationMs = Math.max(1, Math.round(context.elapsedSecs * 1000));
  const start = finitePositiveNumber(context.encounterStartMs);
  const end = finitePositiveNumber(context.encounterEndMs);
  if (start !== null && end !== null && end > start) {
    return { startMs: start, endMs: end, durationMs: Math.max(1, end - start) };
  }
  if (start !== null) {
    return { startMs: start, endMs: start + durationMs, durationMs };
  }
  if (end !== null) {
    return { startMs: end - durationMs, endMs: end, durationMs };
  }
  return { startMs: 0, endMs: durationMs, durationMs };
}

function plausibleEpochMs(value: unknown, window: EncounterWindow): number | null {
  const timestamp = finitePositiveNumber(value);
  if (timestamp === null) return null;
  if (timestamp < 1_500_000_000_000 || timestamp > 4_000_000_000_000) return null;
  const toleranceMs = Math.max(6 * 60 * 60 * 1000, window.durationMs * 4);
  if (timestamp < window.startMs - toleranceMs || timestamp > window.endMs + toleranceMs) {
    return null;
  }
  return timestamp;
}

function timedBuffCoveragePct(
  buff: ActiveBuffState | ActiveEffectBuffState | ActiveFactorBuffState,
  context: ModifierBuildContext,
): number {
  const window = encounterWindow(context);
  const durationMs = Math.max(0, finiteNumber(buff.durationMs) ?? 0);
  let startMs =
    plausibleEpochMs(buff.createTimeMs, window)
    ?? plausibleEpochMs(buff.receivedTimeMs, window);

  if (startMs === null) {
    startMs = durationMs > 0 ? window.endMs - durationMs : window.startMs;
  } else if (startMs > window.endMs && durationMs > 0) {
    startMs = window.endMs - durationMs;
  }

  const activeStart = Math.max(window.startMs, Math.min(startMs, window.endMs));
  return clampPct(((window.endMs - activeStart) / window.durationMs) * 100);
}

function modifierWindowInterval(
  modifierWindow: ModifierWindowState,
  context: ModifierBuildContext,
): ModifierSourceWindow {
  const window = encounterWindow(context);
  const startMs = finiteNumber(modifierWindow.startTimeMs) ?? window.startMs;
  let endMs = finiteNumber(modifierWindow.endTimeMs);
  if (endMs === null) {
    const durationMs = finitePositiveNumber(modifierWindow.durationMs);
    endMs = durationMs !== null ? startMs + durationMs : window.endMs;
  }
  return { startMs, endMs };
}

function sourceWindowCoveragePct(source: ModifierSource, context: ModifierBuildContext): number {
  if (source.windows.length === 0) return clampPct(source.coveragePct ?? 100);
  const window = encounterWindow(context);
  const seenIntervals = new Set<string>();
  const intervals = [];
  for (const interval of source.windows) {
    const startMs = Math.max(window.startMs, Math.min(interval.startMs, window.endMs));
    const endMs = Math.max(window.startMs, Math.min(interval.endMs, window.endMs));
    if (endMs <= startMs) continue;
    const key = `${startMs}:${endMs}`;
    if (seenIntervals.has(key)) continue;
    seenIntervals.add(key);
    intervals.push({ startMs, endMs });
  }
  intervals.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  let coveredMs = 0;
  let activeStart: number | null = null;
  let activeEnd: number | null = null;
  for (const interval of intervals) {
    if (activeStart === null || activeEnd === null) {
      activeStart = interval.startMs;
      activeEnd = interval.endMs;
      continue;
    }
    if (interval.startMs <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.endMs);
      continue;
    }
    coveredMs += activeEnd - activeStart;
    activeStart = interval.startMs;
    activeEnd = interval.endMs;
  }
  if (activeStart !== null && activeEnd !== null) {
    coveredMs += activeEnd - activeStart;
  }

  return clampPct((coveredMs / window.durationMs) * 100);
}

function cachedSourceWindowCoveragePct(
  source: ModifierSource,
  context: ModifierBuildContext,
  caches: ModifierBuildCaches,
): number {
  const key = [
    source.groupKey,
    context.elapsedSecs,
    context.encounterStartMs ?? "",
    context.encounterEndMs ?? "",
  ].join("|");
  const cached = caches.sourceCoveragePct.get(key);
  if (cached !== undefined) return cached;
  const value = sourceWindowCoveragePct(source, context);
  caches.sourceCoveragePct.set(key, value);
  return value;
}

function coalesceSourceWindows(windows: ModifierSourceWindow[]): ModifierSourceWindow[] {
  const intervals = windows
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: ModifierSourceWindow[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    } else {
      merged.push({ startMs: interval.startMs, endMs: interval.endMs });
    }
  }
  return merged;
}

function normalizeSourceNameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sourceNameForGrouping(source: ModifierSource): string {
  return source.sourceNames?.["en"]?.trim()
    || source.sourceNames?.["zh-CN"]?.trim()
    || source.sourceNames?.["design"]?.trim()
    || source.sourceName.trim();
}

function sourceGroupKey(source: ModifierSource): string {
  const name = normalizeSourceNameKey(sourceNameForGrouping(source));
  const id = normalizeSourceNameKey(source.sourceId);
  const isRawActiveBuffFallback = source.sourceKind === "active-buff" && /^active buff \d+$/.test(name);
  if (name && name !== id && !isRawActiveBuffFallback) {
    return ["source-name", source.sourceKind, source.sourceType ?? "", name].join("|");
  }
  return source.sourceId;
}

function mergeLocalizedNames(
  target: LocalizedTextMap | undefined,
  incoming: LocalizedTextMap | undefined,
): LocalizedTextMap | undefined {
  if (!target && !incoming) return undefined;
  const merged: LocalizedTextMap = { ...(target ?? {}) };
  for (const [locale, value] of Object.entries(incoming ?? {})) {
    const trimmed = value.trim();
    if (trimmed && !merged[locale]?.trim()) {
      merged[locale] = trimmed;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function effectSourceBuffId(row: EffectSourceEntry): number | null {
  if (!row.sourceId.startsWith("buff-source:")) return null;
  return finitePositiveNumber(row.sourceEntityId) ?? finitePositiveNumber(row.buffIds?.[0]);
}

function effectSourceNames(row: EffectSourceEntry): LocalizedTextMap | undefined {
  const buffId = effectSourceBuffId(row);
  if (buffId === null) return row.sourceNames;
  return mergeLocalizedNames(row.sourceNames, lookupBuffLocalizedNames(buffId));
}

function effectSourceName(row: EffectSourceEntry, names: LocalizedTextMap | undefined): string {
  const buffId = effectSourceBuffId(row);
  if (buffId !== null) {
    return names?.["en"] ?? row.sourceName ?? lookupDefaultBuffName(buffId) ?? row.sourceId;
  }
  return row.sourceName ?? row.sourceId;
}

function cleanDescriptionText(value: string | undefined): string | undefined {
  const cleaned = (value ?? "")
    .replace(/\u200b/g, "")
    .replace(/<\/?style[^>]*>/g, "")
    .replace(/\{\*[^}]*\*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function cleanDescriptionMap(map: LocalizedTextMap | undefined): LocalizedTextMap | undefined {
  const cleaned: LocalizedTextMap = {};
  for (const [locale, value] of Object.entries(map ?? {})) {
    const text = cleanDescriptionText(value);
    if (text) cleaned[locale] = text;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function mergeDescriptionByGrade(
  target: Record<number, string> | undefined,
  incoming: Record<number, string> | undefined,
): Record<number, string> | undefined {
  if (!target && !incoming) return undefined;
  const merged: Record<number, string> = { ...(target ?? {}) };
  for (const [grade, value] of Object.entries(incoming ?? {})) {
    if (!merged[Number(grade)] && value.trim()) {
      merged[Number(grade)] = value.trim();
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function descriptionFields(
  cleanDescriptions: LocalizedTextMap | undefined,
  descriptions: LocalizedTextMap | undefined,
  evidence: ModifierEvidence | undefined,
): {
  description?: string;
  descriptions?: LocalizedTextMap;
  descriptionByGrade?: Record<number, string>;
} {
  let descriptionMap = mergeLocalizedNames(undefined, cleanDescriptionMap(cleanDescriptions));
  descriptionMap = mergeLocalizedNames(descriptionMap, cleanDescriptionMap(evidence?.cleanDescriptions));
  descriptionMap = mergeLocalizedNames(descriptionMap, cleanDescriptionMap(evidence?.resolvedDescriptions));
  descriptionMap = mergeLocalizedNames(descriptionMap, cleanDescriptionMap(descriptions));

  const description = cleanDescriptionText(evidence?.cleanDescription)
    ?? cleanDescriptionText(evidence?.resolvedDescription)
    ?? descriptionMap?.["en"]
    ?? descriptionMap?.["zh-CN"]
    ?? Object.values(descriptionMap ?? {}).find((value) => value.trim());

  const descriptionByGrade: Record<number, string> = {};
  for (const row of evidence?.gradeRows ?? []) {
    const grade = finiteNumber(row.grade);
    const text = cleanDescriptionText(row.cleanResolvedDescription ?? row.resolvedDescription);
    if (grade !== null && text) {
      descriptionByGrade[grade] = text;
    }
  }

  return {
    ...(description ? { description } : {}),
    ...(descriptionMap ? { descriptions: descriptionMap } : {}),
    ...(Object.keys(descriptionByGrade).length > 0 ? { descriptionByGrade } : {}),
  };
}

function isProducedDamageRelationship(relationshipKind: string | undefined): boolean {
  const value = String(relationshipKind ?? "");
  return value.startsWith("produces-")
    || value === "buff-source-damage-row"
    || value === "buff-source-recount-row"
    || value === "direct-linked-factor-damage-row";
}

function isModifierTargetRelationship(relationshipKind: string | undefined): boolean {
  if (!relationshipKind) return true;
  return !isProducedDamageRelationship(relationshipKind);
}

function targetIds(source: EffectSourceEntry): {
  targetDamageIds: number[];
  targetRecountIds: number[];
  producedDamageIds: number[];
  producedRecountIds: number[];
  relationshipKinds: string[];
} {
  const damageIds: number[] = [];
  const recountIds: number[] = [];
  const producedDamageIds: number[] = [];
  const producedRecountIds: number[] = [];
  const relationshipKinds: string[] = [];
  for (const target of source.targets ?? []) {
    if (target.relationshipKind) relationshipKinds.push(target.relationshipKind);
    const isModifierTarget = isModifierTargetRelationship(target.relationshipKind);
    if (target.targetKind === "damage") {
      const damageId = finiteNumber(target.damageId ?? target.targetId);
      if (damageId !== null) {
        if (isModifierTarget) damageIds.push(damageId);
        else producedDamageIds.push(damageId);
      }
    } else if (target.targetKind === "recount") {
      const recountId = finiteNumber(target.recountId ?? target.targetId);
      if (recountId !== null) {
        if (isModifierTarget) recountIds.push(recountId);
        else producedRecountIds.push(recountId);
      }
    }
  }
  return {
    targetDamageIds: sortedNumbers(damageIds),
    targetRecountIds: sortedNumbers(recountIds),
    producedDamageIds: sortedNumbers(producedDamageIds),
    producedRecountIds: sortedNumbers(producedRecountIds),
    relationshipKinds: sortedStrings(relationshipKinds),
  };
}

function effectSourceEvidenceTags(row: EffectSourceEntry): string[] {
  return (row.evidence ?? [])
    .map((item) => item.source?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => `generated:${value}`);
}

function sourceFromEffect(row: EffectSourceEntry): ModifierSource {
  const targets = targetIds(row);
  const description = descriptionFields(row.cleanDescriptions, row.descriptions, row.modifierEvidence);
  const sourceNames = effectSourceNames(row);
  const source: ModifierSource = {
    groupKey: row.sourceId,
    sourceId: row.sourceId,
    sourceIds: new Set([row.sourceId]),
    sourceKind: row.sourceKind ?? "effect-source",
    ...(row.sourceType ? { sourceType: row.sourceType } : {}),
    ...(typeof row.sourceEntityId === "number" ? { sourceEntityId: row.sourceEntityId } : {}),
    sourceName: effectSourceName(row, sourceNames),
    ...(sourceNames ? { sourceNames } : {}),
    ...(description.description ? { description: description.description } : {}),
    ...(description.descriptions ? { descriptions: description.descriptions } : {}),
    ...(description.descriptionByGrade ? { descriptionByGrade: description.descriptionByGrade } : {}),
    ...(row.iconPath ? { iconPath: row.iconPath } : {}),
    ...(row.runtimeDetection ? { runtimeDetection: row.runtimeDetection } : {}),
    buffIds: new Set((row.buffIds ?? []).map(Number).filter(Number.isFinite)),
    evidence: new Set(effectSourceEvidenceTags(row)),
    ...(row.attributionModel ? { attributionModel: row.attributionModel } : {}),
    ...(row.talentOwnership ? { talentOwnership: row.talentOwnership } : {}),
    actorHints: new Set(),
    targetDamageIds: new Set(targets.targetDamageIds),
    targetRecountIds: new Set(targets.targetRecountIds),
    producedDamageIds: new Set(targets.producedDamageIds),
    producedRecountIds: new Set(targets.producedRecountIds),
    targetRelationshipKinds: new Set(targets.relationshipKinds),
    coveragePct: null,
    windows: [],
  };
  source.groupKey = sourceGroupKey(source);
  return source;
}

function sourceFromFactor(buffId: number, row: SeasonPhantomFactorEntry): ModifierSource {
  const description = descriptionFields(row.cleanDescriptions, row.descriptions, row.modifierEvidence);
  const source: ModifierSource = {
    groupKey: `phantom-factor:${buffId}`,
    sourceId: `phantom-factor:${buffId}`,
    sourceIds: new Set([`phantom-factor:${buffId}`]),
    sourceKind: "phantom-factor",
    sourceType: "season-phantom-factor",
    sourceEntityId: row.buffId ?? buffId,
    sourceName: row.familyName ?? `Phantom Factor ${buffId}`,
    ...(row.familyNames ? { sourceNames: row.familyNames } : {}),
    ...(description.description ? { description: description.description } : {}),
    ...(description.descriptions ? { descriptions: description.descriptions } : {}),
    ...(description.descriptionByGrade ? { descriptionByGrade: description.descriptionByGrade } : {}),
    ...(row.iconPath ? { iconPath: row.iconPath } : {}),
    runtimeDetection: "active-buff",
    buffIds: new Set([buffId]),
    evidence: new Set(),
    attributionModel: {
      schemaVersion: 1,
      damageFormulaId: "community-damage-v1",
      status: "uptime-only",
      confidence: "low",
      requiredRuntimeEvidence: ["modifier windows", "modifier to formula-term classification"],
      notes: ["Season Phantom Factor rows need generated component promotion before exact formula replay can assign net-added damage."],
    },
    actorHints: new Set(),
    targetDamageIds: new Set((row.affectedDamageIds ?? []).map(Number).filter(Number.isFinite)),
    targetRecountIds: new Set((row.affectedRecountIds ?? []).map(Number).filter(Number.isFinite)),
    producedDamageIds: new Set(),
    producedRecountIds: new Set(),
    targetRelationshipKinds: new Set(),
    coveragePct: null,
    windows: [],
  };
  source.groupKey = sourceGroupKey(source);
  return source;
}

function generatedSourcesForBuffId(buffId: number): ModifierSource[] {
  const sourceIds = buffIdToEffectSourceIds[String(buffId)] ?? [];
  const rows = sourceIds
    .map((sourceId) => effectSourcesById[sourceId])
    .filter((row): row is EffectSourceEntry => Boolean(row))
    .map(sourceFromEffect);
  if (rows.length > 0) return rows;

  const factor = factorsByBuffId[String(buffId)];
  if (factor) return [sourceFromFactor(buffId, factor)];

  return [];
}

function relatedBuffSourceIds(buffId: number): number[] {
  const candidates: number[] = [];
  const familyBaseId = Math.floor(buffId / 10) * 10;
  if (familyBaseId > 0 && familyBaseId !== buffId) {
    candidates.push(familyBaseId);
  }

  return sortedNumbers(candidates).filter((id) =>
    generatedSourcesForBuffId(id).length > 0
  );
}

function fallbackSource(
  sourceId: string,
  sourceKind: string,
  sourceName: string,
  sourceEntityId?: number,
  buffIds: number[] = [],
  sourceNames?: LocalizedTextMap,
): ModifierSource {
  const source: ModifierSource = {
    groupKey: sourceId,
    sourceId,
    sourceIds: new Set([sourceId]),
    sourceKind,
    sourceType: "runtime-only",
    ...(sourceEntityId !== undefined ? { sourceEntityId } : {}),
    sourceName,
    ...(sourceNames ? { sourceNames } : {}),
    runtimeDetection: "runtime-only",
    buffIds: new Set(buffIds),
    evidence: new Set(),
    attributionModel: {
      schemaVersion: 1,
      status: "runtime-only",
      confidence: "low",
      requiredRuntimeEvidence: ["generated effect-source bridge"],
      notes: ["Runtime-only rows expose observed uptime but have no generated formula component yet."],
    },
    actorHints: new Set(),
    targetDamageIds: new Set(),
    targetRecountIds: new Set(),
    producedDamageIds: new Set(),
    producedRecountIds: new Set(),
    targetRelationshipKinds: new Set(),
    coveragePct: null,
    windows: [],
  };
  source.groupKey = sourceGroupKey(source);
  return source;
}

type ModifierActorState =
  | ActiveBuffState
  | ActiveEffectBuffState
  | ActiveFactorBuffState
  | ModifierWindowState;

function actorHint(kind: string, state: ModifierActorState): string | null {
  const hostUid = finiteNumber(state.hostUid);
  const sourceUid = finiteNumber(state.sourceUid);
  if (hostUid === null && sourceUid === null) return null;
  return [
    kind,
    hostUid !== null ? `host:${hostUid}` : "",
    sourceUid !== null ? `source:${sourceUid}` : "",
  ].filter(Boolean).join("|");
}

function parseActorHint(hint: string): { hostUid: number | null; sourceUid: number | null } {
  const result = { hostUid: null as number | null, sourceUid: null as number | null };
  for (const part of hint.split("|")) {
    const [key, rawValue] = part.split(":");
    const value = finiteNumber(rawValue);
    if (key === "host") result.hostUid = value;
    if (key === "source") result.sourceUid = value;
  }
  return result;
}

function summarizeActors(hints: Iterable<string>): ModifierActorSummary {
  const hostUids = new Set<number>();
  const sourceUids = new Set<number>();
  const externalSourceUids = new Set<number>();
  const selfSourceUids = new Set<number>();
  for (const hint of hints) {
    const parsed = parseActorHint(hint);
    if (parsed.hostUid !== null) hostUids.add(parsed.hostUid);
    if (parsed.sourceUid !== null) sourceUids.add(parsed.sourceUid);
    if (parsed.hostUid !== null && parsed.sourceUid !== null) {
      if (parsed.hostUid === parsed.sourceUid) {
        selfSourceUids.add(parsed.sourceUid);
      } else {
        externalSourceUids.add(parsed.sourceUid);
      }
    }
  }
  return {
    hostUids: sortedNumbers(hostUids),
    sourceUids: sortedNumbers(sourceUids),
    externalSourceUids: sortedNumbers(externalSourceUids),
    selfSourceUids: sortedNumbers(selfSourceUids),
  };
}

function uniqueList(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right));
}

function mergeAttributionComponents(
  left: ModifierAttributionComponent[] | undefined,
  right: ModifierAttributionComponent[] | undefined,
): ModifierAttributionComponent[] | undefined {
  const byKey = new Map<string, ModifierAttributionComponent>();
  for (const component of [...(left ?? []), ...(right ?? [])]) {
    const key = component.componentKey ?? component.label ?? JSON.stringify(component);
    const existing = byKey.get(key);
    byKey.set(key, {
      ...existing,
      ...component,
      formulaTermIds: uniqueList([...(existing?.formulaTermIds ?? []), ...(component.formulaTermIds ?? [])]),
      contributionGroups: uniqueList([...(existing?.contributionGroups ?? []), ...(component.contributionGroups ?? [])]),
      predicateTags: uniqueList([...(existing?.predicateTags ?? []), ...(component.predicateTags ?? [])]),
      requiredRuntimeEvidence: uniqueList([
        ...(existing?.requiredRuntimeEvidence ?? []),
        ...(component.requiredRuntimeEvidence ?? []),
      ]),
      valueTexts: uniqueList([...(existing?.valueTexts ?? []), ...(component.valueTexts ?? [])]),
    });
  }
  return byKey.size > 0 ? [...byKey.values()] : undefined;
}

function mergeAttributionModels(
  left: ModifierAttributionModel | undefined,
  right: ModifierAttributionModel | undefined,
): ModifierAttributionModel | undefined {
  if (!left) return right;
  if (!right) return left;

  const statuses = uniqueList([left.status, right.status]);
  const schemaVersion = Math.max(left.schemaVersion ?? 0, right.schemaVersion ?? 0);
  const damageFormulaId = left.damageFormulaId ?? right.damageFormulaId;
  const result: ModifierAttributionModel = {
    ...(schemaVersion > 0 ? { schemaVersion } : {}),
    ...(damageFormulaId ? { damageFormulaId } : {}),
    status: statuses.length === 1 ? statuses[0] ?? "mixed" : "mixed",
    confidence: left.confidence === "high" || right.confidence === "high"
      ? "high"
      : left.confidence === "medium" || right.confidence === "medium"
        ? "medium"
        : left.confidence ?? right.confidence ?? "low",
    formulaTermIds: uniqueList([...(left.formulaTermIds ?? []), ...(right.formulaTermIds ?? [])]),
    contributionGroups: uniqueList([...(left.contributionGroups ?? []), ...(right.contributionGroups ?? [])]),
    predicateTags: uniqueList([...(left.predicateTags ?? []), ...(right.predicateTags ?? [])]),
    requiredRuntimeEvidence: uniqueList([
      ...(left.requiredRuntimeEvidence ?? []),
      ...(right.requiredRuntimeEvidence ?? []),
    ]),
    relationshipKinds: uniqueList([...(left.relationshipKinds ?? []), ...(right.relationshipKinds ?? [])]),
    notes: uniqueList([...(left.notes ?? []), ...(right.notes ?? [])]),
  };
  const components = mergeAttributionComponents(left.components, right.components);
  if (components) result.components = components;
  return result;
}

function mergeSource(target: ModifierSource, incoming: ModifierSource) {
  for (const value of incoming.sourceIds) target.sourceIds.add(value);
  for (const value of incoming.buffIds) target.buffIds.add(value);
  for (const value of incoming.evidence) target.evidence.add(value);
  for (const value of incoming.actorHints) target.actorHints.add(value);
  for (const value of incoming.targetDamageIds) target.targetDamageIds.add(value);
  for (const value of incoming.targetRecountIds) target.targetRecountIds.add(value);
  for (const value of incoming.producedDamageIds) target.producedDamageIds.add(value);
  for (const value of incoming.producedRecountIds) target.producedRecountIds.add(value);
  for (const value of incoming.targetRelationshipKinds) target.targetRelationshipKinds.add(value);
  target.windows.push(...incoming.windows);
  if (incoming.coveragePct !== null) {
    target.coveragePct = target.coveragePct === null
      ? incoming.coveragePct
      : Math.max(target.coveragePct, incoming.coveragePct);
  }
  const mergedNames = mergeLocalizedNames(target.sourceNames, incoming.sourceNames);
  if (mergedNames) {
    target.sourceNames = mergedNames;
  }
  const mergedDescriptions = mergeLocalizedNames(target.descriptions, incoming.descriptions);
  if (mergedDescriptions) {
    target.descriptions = mergedDescriptions;
  }
  if (!target.description && incoming.description) {
    target.description = incoming.description;
  }
  if (!target.iconPath && incoming.iconPath) {
    target.iconPath = incoming.iconPath;
  }
  const mergedAttributionModel = mergeAttributionModels(target.attributionModel, incoming.attributionModel);
  if (mergedAttributionModel) {
    target.attributionModel = mergedAttributionModel;
  }
  if (!target.talentOwnership && incoming.talentOwnership) {
    target.talentOwnership = incoming.talentOwnership;
  }
  const mergedDescriptionByGrade = mergeDescriptionByGrade(target.descriptionByGrade, incoming.descriptionByGrade);
  if (mergedDescriptionByGrade) {
    target.descriptionByGrade = mergedDescriptionByGrade;
  }
}

function addSource(
  sources: Map<string, ModifierSource>,
  source: ModifierSource,
  evidence: string[],
  actorHints: Array<string | null> = [],
  coveragePct: number | null = null,
  windows: ModifierSourceWindow[] = [],
) {
  for (const item of evidence) source.evidence.add(item);
  for (const hint of actorHints) {
    if (hint) source.actorHints.add(hint);
  }
  source.windows.push(...windows);
  if (coveragePct !== null) {
    source.coveragePct = clampPct(coveragePct);
  }
  source.groupKey = sourceGroupKey(source);
  const existing = sources.get(source.groupKey);
  if (existing) {
    mergeSource(existing, source);
  } else {
    sources.set(source.groupKey, source);
  }
}

function sourcesForBuffId(buffId: number): ModifierSource[] {
  if (isIgnoredModifierBuffId(buffId)) return [];
  const directSources = generatedSourcesForBuffId(buffId);
  if (directSources.length > 0) return directSources;

  const relatedSources = relatedBuffSourceIds(buffId)
    .flatMap((relatedBuffId) =>
      generatedSourcesForBuffId(relatedBuffId).map((source) => {
        source.buffIds.add(buffId);
        source.evidence.add(`relatedBuff:${buffId}->${relatedBuffId}`);
        return source;
      })
    );
  if (relatedSources.length > 0) return relatedSources;

  const rawBuffNames = lookupBuffLocalizedNames(buffId);
  const buffNames: LocalizedTextMap = rawBuffNames?.["en"]?.trim()
    ? { ...rawBuffNames }
    : { ...(rawBuffNames ?? {}), en: `Unmapped Buff ${buffId}` };
  const buffName = buffNames["en"] ?? lookupDefaultBuffName(buffId) ?? `Active Buff ${buffId}`;
  return [fallbackSource(`active-buff:${buffId}`, "active-buff", buffName, buffId, [buffId], buffNames)];
}

function hasPrimaryBuffName(buffId: number): boolean {
  return Boolean(lookupBuffLocalizedNames(buffId)?.["en"]);
}

function hasKnownBuffSource(buffId: number): boolean {
  if (!Number.isFinite(buffId) || buffId <= 0) return false;
  if (isIgnoredModifierBuffId(buffId)) return false;
  if ((buffIdToEffectSourceIds[String(buffId)] ?? []).length > 0) return true;
  if (factorsByBuffId[String(buffId)]) return true;
  return Boolean(lookupDefaultBuffName(buffId));
}

function preferredObservedBuffSourceId(baseId: number, sourceConfigId: number | null): number {
  if (
    sourceConfigId !== null
    && sourceConfigId !== baseId
    && hasKnownBuffSource(sourceConfigId)
    && (!hasPrimaryBuffName(baseId) || lookupDefaultBuffName(sourceConfigId) === lookupDefaultBuffName(baseId))
  ) {
    return sourceConfigId;
  }
  return baseId;
}

function addBuffSources(
  sources: Map<string, ModifierSource>,
  buffId: number | null,
  evidence: string,
  actorHintValue: string | null,
  coveragePct: number | null = null,
  windows: ModifierSourceWindow[] = [],
) {
  if (buffId === null || isIgnoredModifierBuffId(buffId)) return;
  for (const source of sourcesForBuffId(buffId)) {
    source.buffIds.add(buffId);
    addSource(sources, source, [evidence], [actorHintValue], coveragePct, windows);
  }
}

function addObservedActiveBuffSources(
  sources: Map<string, ModifierSource>,
  buff: ActiveBuffState,
  coveragePct: number,
  windows: ModifierSourceWindow[] = [],
) {
  const baseId = finitePositiveNumber(buff.baseId);
  if (baseId === null || isIgnoredModifierBuffId(baseId)) return;

  const sourceConfigId = finitePositiveNumber(buff.sourceConfigId);
  const preferredId = preferredObservedBuffSourceId(baseId, sourceConfigId);
  if (isIgnoredModifierBuffId(preferredId) || isIgnoredModifierBuffId(sourceConfigId)) return;
  const hint = actorHint("active", buff);
  const evidence = [
    `activeBuff:${baseId}`,
    `activeBuffUuid:${buff.buffUuid}`,
    sourceConfigId !== null ? `activeBuffSourceConfig:${sourceConfigId}` : "",
  ].filter(Boolean).join("|");

  for (const source of sourcesForBuffId(preferredId)) {
    source.buffIds.add(baseId);
    if (sourceConfigId !== null) source.buffIds.add(sourceConfigId);
    addSource(sources, source, [evidence], [hint], coveragePct, windows);
  }
}

function addObservedModifierWindowSources(
  sources: Map<string, ModifierSource>,
  modifierWindow: ModifierWindowState,
  context: ModifierBuildContext,
  observedWindows: ModifierSourceWindow[] | null = null,
) {
  const baseId = finitePositiveNumber(modifierWindow.baseId);
  if (baseId === null || isIgnoredModifierBuffId(baseId)) return;

  const sourceConfigId = finitePositiveNumber(modifierWindow.sourceConfigId);
  const preferredId = preferredObservedBuffSourceId(baseId, sourceConfigId);
  if (isIgnoredModifierBuffId(preferredId) || isIgnoredModifierBuffId(sourceConfigId)) return;
  const hint = actorHint("window", modifierWindow);
  const evidence = [
    `modifierWindow:${baseId}`,
    `modifierWindowUuid:${modifierWindow.buffUuid}`,
    sourceConfigId !== null ? `modifierWindowSourceConfig:${sourceConfigId}` : "",
  ].filter(Boolean).join("|");
  const intervals = observedWindows ?? [modifierWindowInterval(modifierWindow, context)];

  for (const source of sourcesForBuffId(preferredId)) {
    source.buffIds.add(baseId);
    if (sourceConfigId !== null) source.buffIds.add(sourceConfigId);
    addSource(sources, source, [evidence], [hint], null, intervals);
  }
}

function collectActiveBuffIds(entity: HistoryEntityData): Set<number> {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const id = finitePositiveNumber(value);
    if (id !== null) ids.add(id);
  };

  for (const buff of entity.activeFactorBuffs ?? []) {
    add(buff.factorBuffId);
    add(buff.observedBuffId);
    add(buff.sourceConfigId);
  }
  for (const buff of entity.activeBuffs ?? []) {
    add(buff.baseId);
    add(buff.sourceConfigId);
  }
  for (const item of entity.activeFactorItems ?? []) {
    add(item.factorBuffId);
  }
  for (const buff of entity.activeEffectBuffs ?? []) {
    add(buff.effectSourceBuffId);
    add(buff.observedBuffId);
    add(buff.sourceConfigId);
  }
  for (const modifierWindow of entity.modifierWindows ?? []) {
    add(modifierWindow.baseId);
    add(modifierWindow.sourceConfigId);
  }

  return ids;
}

function sourceHasActiveBuff(source: ModifierSource, activeBuffIds: Set<number>): boolean {
  if (source.buffIds.size === 0) return true;
  for (const buffId of source.buffIds) {
    if (activeBuffIds.has(buffId)) return true;
  }
  return false;
}

function requiresRuntimeObservation(source: ModifierSource): boolean {
  if (source.buffIds.size === 0) return false;
  return /active-buff|temp-attr|modifier-window/i.test(source.runtimeDetection ?? "");
}

function sourceSearchText(source: ModifierSource): string {
  return [
    source.sourceName,
    ...Object.values(source.sourceNames ?? {}),
    source.description ?? "",
    ...Object.values(source.descriptions ?? {}),
    ...Object.values(source.descriptionByGrade ?? {}),
    source.sourceKind,
    source.sourceType ?? "",
  ].join(" ").toLowerCase();
}

function createModifierBuildCaches(): ModifierBuildCaches {
  return {
    sourceSearchText: new Map(),
    parsedActorHints: new Map(),
    timingLockout: new Map(),
    broadDamage: new Map(),
    runtimeBroadDamage: new Map(),
    sourceCoveragePct: new Map(),
    cooldownTimingModel: new Map(),
  };
}

function cachedSourceSearchText(source: ModifierSource, caches: ModifierBuildCaches): string {
  const cached = caches.sourceSearchText.get(source.groupKey);
  if (cached !== undefined) return cached;
  const text = sourceSearchText(source);
  caches.sourceSearchText.set(source.groupKey, text);
  return text;
}

function sourceHasModifierTargets(source: ModifierSource): boolean {
  return source.targetDamageIds.size > 0 || source.targetRecountIds.size > 0;
}

function sourceHasProducedTargets(source: ModifierSource): boolean {
  return source.producedDamageIds.size > 0 || source.producedRecountIds.size > 0;
}

function isPureProducedDamageSource(source: ModifierSource): boolean {
  return sourceHasProducedTargets(source) && !sourceHasModifierTargets(source);
}

const OFFENSIVE_SOURCE_TEXT =
  /\b(atk|attack|matk|strength|intellect|intelligence|agility|str|int|dex|power|damage \+|dmg \+|dream dmg|damage dealt|deal(?:s|ing)? [^.]{0,80}damage|crit|critical|lucky|haste|focus|concentration|attack speed|animation speed|cooldown|cd|versatility|all[- ]?element|element bonus|element boost|elemental|pierce|penetration|vulnerable|vulnerability|weakness|companion)\b/i;

const DEFENSIVE_SOURCE_TEXT =
  /\b(max hp|maximum hp|max health|health|shield|heal|healing|incoming damage|damage taken|dmg taken|damage reduction|damage is reduced|reduced by|resistance|resist|defense|defence|block|parry|barrier|damage received|received damage|absorbed)\b/i;

const BROAD_RUNTIME_SOURCE_TYPES = new Set(["active-skill-buff", "imagine-buff", "imagine-debuff"]);

const TIMING_LOCKOUT_SOURCE_TEXT =
  /\b(icd|lockout|cannot be affected|unaffected by same type|same type of effect|clear cooldown and refill hp|refill hp)\b/i;

const TIMING_LOCKOUT_RUNTIME_NAME_TEXT =
  /\b(?:element\s+stasis|time\s+stasis|exhausted(?::|\b)|weakened(?::|\b).*(?:wish|sealed))\b|\u51dd\u6ede|\u529b\u7aed|\u865a\u5f31.*(?:\u7948\u613f|\u7981\u6b62)/i;

function isTimingLockoutSource(source: ModifierSource): boolean {
  if (source.sourceType?.includes("icd")) return true;
  const text = sourceSearchText(source);
  if (TIMING_LOCKOUT_SOURCE_TEXT.test(text)) return true;
  const nameText = [
    source.sourceName,
    ...Object.values(source.sourceNames ?? {}),
  ].join(" ");
  if (
    source.sourceKind === "imagine"
    && TIMING_LOCKOUT_RUNTIME_NAME_TEXT.test(nameText)
  ) {
    return true;
  }
  return false;
}

function cachedIsTimingLockoutSource(source: ModifierSource, caches: ModifierBuildCaches): boolean {
  const cached = caches.timingLockout.get(source.groupKey);
  if (cached !== undefined) return cached;

  let value = false;
  if (source.sourceType?.includes("icd")) {
    value = true;
  } else {
    const text = cachedSourceSearchText(source, caches);
    if (TIMING_LOCKOUT_SOURCE_TEXT.test(text)) {
      value = true;
    } else {
      const nameText = [
        source.sourceName,
        ...Object.values(source.sourceNames ?? {}),
      ].join(" ");
      value =
        source.sourceKind === "imagine"
        && TIMING_LOCKOUT_RUNTIME_NAME_TEXT.test(nameText);
    }
  }

  caches.timingLockout.set(source.groupKey, value);
  return value;
}

function cachedIsBroadDamageModifierSource(source: ModifierSource, caches: ModifierBuildCaches): boolean {
  const cached = caches.broadDamage.get(source.groupKey);
  if (cached !== undefined) return cached;

  let value = false;
  if (
    !isPureProducedDamageSource(source)
    && !sourceHasModifierTargets(source)
    && !cachedIsTimingLockoutSource(source, caches)
  ) {
    const text = cachedSourceSearchText(source, caches);
    value =
      !(DEFENSIVE_SOURCE_TEXT.test(text) && !OFFENSIVE_SOURCE_TEXT.test(text))
      && (
        (source.sourceType !== undefined && BROAD_RUNTIME_SOURCE_TYPES.has(source.sourceType))
        || OFFENSIVE_SOURCE_TEXT.test(text)
      );
  }

  caches.broadDamage.set(source.groupKey, value);
  return value;
}

function cachedIsRuntimeObservedBroadSource(source: ModifierSource, caches: ModifierBuildCaches): boolean {
  const cached = caches.runtimeBroadDamage.get(source.groupKey);
  if (cached !== undefined) return cached;

  const value =
    source.buffIds.size > 0
    && /active-buff|temp-attr|runtime-only/i.test(source.runtimeDetection ?? "")
    && cachedIsBroadDamageModifierSource(source, caches);
  caches.runtimeBroadDamage.set(source.groupKey, value);
  return value;
}

function passiveSkillRowsForEntity(entityId: number): ModifierSource[] {
  return (sourcesByEntityId.get(entityId) ?? [])
    .filter((source) => source.sourceKind === "passive-skill" || source.sourceType === "passive-skill")
    .map(sourceFromEffect);
}

function professionTalentRowsForEntity(entityId: number): ModifierSource[] {
  return (sourcesByEntityId.get(entityId) ?? [])
    .filter((source) => source.sourceKind === "talent-passive" && source.sourceType === "talent")
    .map(sourceFromEffect);
}

function decodeProfessionTalentNodeId(nodeId: number): number | null {
  if (!Number.isFinite(nodeId)) return null;
  if (nodeId >= 1_000_000) return Math.floor(nodeId / 1000);
  return null;
}

function entityOwnedTalentIds(entity: HistoryEntityData): Set<number> {
  const ids = new Set<number>();
  for (const talent of entity.activeProfessionTalents ?? []) {
    const professionId = finiteNumber(talent.professionId);
    if (professionId !== null && entity.classId > 0 && professionId !== entity.classId) {
      continue;
    }
    const nodeId = finiteNumber(talent.talentNodeId);
    const sourceEntityId = nodeId !== null ? decodeProfessionTalentNodeId(nodeId) : null;
    if (sourceEntityId !== null) ids.add(sourceEntityId);
    const stageCfgId = finitePositiveNumber(talent.talentStageCfgId);
    if (stageCfgId !== null) ids.add(stageCfgId);
  }
  return ids;
}

function entityOwnedPassiveSkillIds(entity: HistoryEntityData): Set<number> {
  const ids = new Set<number>();
  for (const passive of entity.activePassiveSkills ?? []) {
    const skillId = finitePositiveNumber(passive.skillId);
    if (skillId !== null) ids.add(skillId);
  }
  return ids;
}

const entityModifierTargetUidCache = new WeakMap<HistoryEntityData, Set<number>>();

function entityModifierTargetUids(entity: HistoryEntityData): Set<number> {
  const cached = entityModifierTargetUidCache.get(entity);
  if (cached) return cached;

  const targetUids = new Set<number>();
  const add = (value: unknown) => {
    const uid = finitePositiveNumber(value);
    if (uid !== null && uid !== entity.uid) targetUids.add(uid);
  };

  for (const target of entity.dmgPerTarget ?? []) add(target.targetUid);
  for (const bucket of entity.modifierHitBuckets ?? []) add(bucket.targetUid);

  entityModifierTargetUidCache.set(entity, targetUids);
  return targetUids;
}

function sourceHasRuntimeEvidenceInEntityScope(source: ModifierSource, entity: HistoryEntityData): boolean {
  if (entity.uid <= 0 || source.actorHints.size === 0) return false;
  const targetUids = entityModifierTargetUids(entity);
  for (const hint of source.actorHints) {
    const parsed = parseActorHint(hint);
    if (parsed.hostUid === entity.uid) return true;
    if (parsed.hostUid !== null && targetUids.has(parsed.hostUid)) return true;
    if (parsed.hostUid === null && parsed.sourceUid === entity.uid) return true;
  }
  return false;
}

const runtimeBuffEvidencePattern =
  /(?:^|\|)(?:activeBuff|activeBuffSourceConfig|modifierWindow|modifierWindowSourceConfig|activeFactorBuff|activeFactorBuffObserved|activeFactorBuffSourceConfig|activeEffectBuff|activeEffectBuffObserved|activeEffectBuffSourceConfig):(\d+)/g;

function observedRuntimeBuffIds(source: ModifierSource): Set<number> {
  const ids = new Set<number>();
  for (const evidence of source.evidence) {
    runtimeBuffEvidencePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = runtimeBuffEvidencePattern.exec(evidence)) !== null) {
      const id = finitePositiveNumber(match[1]);
      if (id !== null) ids.add(id);
    }
  }
  return ids;
}

function primaryBuffSourceId(source: ModifierSource): number | null {
  const match = /^buff-source:(\d+)$/.exec(source.sourceId);
  return match ? finitePositiveNumber(match[1]) : null;
}

function sourceHasGeneratedActivationAlias(source: ModifierSource): boolean {
  for (const evidence of source.evidence) {
    if (evidence.includes("ClassSpecSkillModelProbe.sharedLocalizedNames.activationTriggerAlias")) {
      return true;
    }
  }
  return false;
}

function sourceHasExternalRecipientEvidence(source: ModifierSource, entity: HistoryEntityData): boolean {
  if (entity.uid <= 0) return false;
  for (const hint of source.actorHints) {
    const parsed = parseActorHint(hint);
    if (parsed.hostUid === entity.uid && parsed.sourceUid !== null && parsed.sourceUid !== entity.uid) {
      return true;
    }
  }
  return false;
}

function sourceRejectedByActivationAliasScope(source: ModifierSource, entity: HistoryEntityData): boolean {
  const primaryBuffId = primaryBuffSourceId(source);
  if (primaryBuffId === null) return false;
  if (!sourceHasGeneratedActivationAlias(source)) return false;
  if (!sourceHasExternalRecipientEvidence(source, entity)) return false;
  return !observedRuntimeBuffIds(source).has(primaryBuffId);
}

function sourceActorScopeAllowedForEntity(source: ModifierSource, entity: HistoryEntityData): boolean {
  if (source.actorHints.size === 0) return true;
  return sourceHasRuntimeEvidenceInEntityScope(source, entity);
}

function normalizeOwnershipText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function entityMatchesTalentOwnership(
  candidate: HistoryEntityData,
  ownership: TalentOwnershipMetadata,
): boolean | null {
  const classId = finitePositiveNumber(ownership.classId);
  if (classId !== null && candidate.classId > 0 && candidate.classId !== classId) return false;

  const specIds = new Set((ownership.specIds ?? [])
    .map(finitePositiveNumber)
    .filter((value): value is number => value !== null));
  if (specIds.size > 0 && candidate.classSpec > 0) {
    return specIds.has(candidate.classSpec);
  }

  const candidateSpec = normalizeOwnershipText(candidate.classSpecName);
  const specNames = [...(ownership.specNameKeys ?? []), ...(ownership.specNames ?? [])]
    .map(normalizeOwnershipText)
    .filter(Boolean);
  if (candidateSpec && specNames.length > 0) {
    return specNames.includes(candidateSpec);
  }

  return null;
}

function talentOwnershipCandidateEntities(
  source: ModifierSource,
  entity: HistoryEntityData,
  allEntities: HistoryEntityData[] | undefined,
): HistoryEntityData[] {
  if (source.actorHints.size === 0) return [entity];

  const byUid = new Map(modifierContextEntities(entity, allEntities).map((row) => [row.uid, row]));
  const candidates = new Map<number, HistoryEntityData>();
  let sawUnknownExternalSource = false;

  for (const hint of source.actorHints) {
    const parsed = parseActorHint(hint);
    if (parsed.sourceUid !== null && parsed.sourceUid > 0) {
      const sourceEntity = byUid.get(parsed.sourceUid);
      if (sourceEntity) {
        candidates.set(sourceEntity.uid, sourceEntity);
      } else if (parsed.sourceUid !== entity.uid) {
        sawUnknownExternalSource = true;
      }
      continue;
    }

    if (parsed.hostUid === null || parsed.hostUid === entity.uid) {
      candidates.set(entity.uid, entity);
    }
  }

  if (candidates.size === 0 && sawUnknownExternalSource) return [];
  return [...candidates.values()];
}

function sourceRejectedByTalentOwnership(
  source: ModifierSource,
  entity: HistoryEntityData,
  allEntities: HistoryEntityData[] | undefined,
): boolean {
  const ownership = source.talentOwnership;
  if (!ownership?.parserPolicy?.safeToRejectWrongSpec || !ownership.hardFilterEligible) return false;

  const candidates = talentOwnershipCandidateEntities(source, entity, allEntities);
  if (candidates.length === 0) return false;

  let sawRejectedCandidate = false;
  for (const candidate of candidates) {
    const match = entityMatchesTalentOwnership(candidate, ownership);
    if (match === true) return false;
    if (match === false) sawRejectedCandidate = true;
  }

  return sawRejectedCandidate;
}

function sourceAllowedForEntity(
  source: ModifierSource,
  entity: HistoryEntityData,
  ownedTalentIds: Set<number>,
  ownedPassiveSkillIds: Set<number>,
  allEntities: HistoryEntityData[] | undefined,
): boolean {
  if (!sourceActorScopeAllowedForEntity(source, entity)) return false;
  if (sourceRejectedByActivationAliasScope(source, entity)) return false;

  if (source.sourceKind === "talent-passive" || source.sourceType === "talent") {
    if (sourceRejectedByTalentOwnership(source, entity, allEntities)) return false;
    const sourceEntityId = finitePositiveNumber(source.sourceEntityId);
    if (sourceEntityId === null) return false;
    return ownedTalentIds.has(sourceEntityId) || sourceHasRuntimeEvidenceInEntityScope(source, entity);
  }
  if (source.sourceKind === "passive-skill" || source.sourceType === "passive-skill") {
    const sourceEntityId = finitePositiveNumber(source.sourceEntityId);
    if (sourceEntityId === null) return false;
    return ownedPassiveSkillIds.has(sourceEntityId) || sourceHasRuntimeEvidenceInEntityScope(source, entity);
  }
  return true;
}

function hostedUid(
  buff: ModifierActorState,
  fallbackUid: number,
): number {
  return finitePositiveNumber(buff.hostUid) ?? fallbackUid;
}

function entityModifierScopeHostUids(entity: HistoryEntityData): Set<number> {
  return new Set([entity.uid, ...entityModifierTargetUids(entity)].filter((uid) => uid > 0));
}

function hostedInModifierScope(
  state: ModifierActorState,
  sourceEntity: HistoryEntityData,
  scopeHostUids: Set<number>,
): boolean {
  return scopeHostUids.has(hostedUid(state, sourceEntity.uid));
}

function hostedActiveBuffs(entity: HistoryEntityData, allEntities: HistoryEntityData[] | undefined): ActiveBuffState[] {
  const rows: ActiveBuffState[] = [];
  const seen = new Set<string>();
  const scopeHostUids = entityModifierScopeHostUids(entity);
  for (const sourceEntity of modifierContextEntities(entity, allEntities)) {
    for (const buff of sourceEntity.activeBuffs ?? []) {
      if (!hostedInModifierScope(buff, sourceEntity, scopeHostUids)) continue;
      const key = `active:${buff.buffUuid}:${buff.baseId}:${buff.sourceConfigId ?? ""}:${buff.hostUid}:${buff.sourceUid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(buff);
    }
  }
  return rows;
}

function hostedFactorBuffs(entity: HistoryEntityData, allEntities: HistoryEntityData[] | undefined): ActiveFactorBuffState[] {
  const rows: ActiveFactorBuffState[] = [];
  const seen = new Set<string>();
  const scopeHostUids = entityModifierScopeHostUids(entity);
  for (const sourceEntity of modifierContextEntities(entity, allEntities)) {
    for (const buff of sourceEntity.activeFactorBuffs ?? []) {
      if (!hostedInModifierScope(buff, sourceEntity, scopeHostUids)) continue;
      const key = [
        "factor",
        buff.factorBuffId,
        buff.observedBuffId,
        buff.sourceConfigId ?? "",
        buff.hostUid,
        buff.sourceUid,
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(buff);
    }
  }
  return rows;
}

function hostedEffectBuffs(entity: HistoryEntityData, allEntities: HistoryEntityData[] | undefined): ActiveEffectBuffState[] {
  const rows: ActiveEffectBuffState[] = [];
  const seen = new Set<string>();
  const scopeHostUids = entityModifierScopeHostUids(entity);
  for (const sourceEntity of modifierContextEntities(entity, allEntities)) {
    for (const buff of sourceEntity.activeEffectBuffs ?? []) {
      if (!hostedInModifierScope(buff, sourceEntity, scopeHostUids)) continue;
      const key = [
        "effect",
        buff.effectSourceBuffId,
        buff.observedBuffId,
        buff.sourceConfigId ?? "",
        buff.hostUid,
        buff.sourceUid,
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(buff);
    }
  }
  return rows;
}

function hostedModifierWindows(entity: HistoryEntityData, allEntities: HistoryEntityData[] | undefined): ModifierWindowState[] {
  const rows: ModifierWindowState[] = [];
  const seen = new Set<string>();
  const scopeHostUids = entityModifierScopeHostUids(entity);
  for (const sourceEntity of modifierContextEntities(entity, allEntities)) {
    for (const modifierWindow of sourceEntity.modifierWindows ?? []) {
      if (!hostedInModifierScope(modifierWindow, sourceEntity, scopeHostUids)) continue;
      const key = [
        "window",
        modifierWindow.buffUuid,
        modifierWindow.baseId,
        modifierWindow.sourceConfigId ?? "",
        modifierWindow.startTimeMs,
        modifierWindow.endTimeMs ?? "",
        modifierWindow.hostUid,
        modifierWindow.sourceUid,
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(modifierWindow);
    }
  }
  return rows;
}

function activeModifierSources(entity: HistoryEntityData, context: ModifierBuildContext): ModifierSource[] {
  const sources = new Map<string, ModifierSource>();
  const ownedTalentIds = entityOwnedTalentIds(entity);
  const ownedPassiveSkillIds = entityOwnedPassiveSkillIds(entity);
  const modifierWindowRows = hostedModifierWindows(entity, context.allEntities);
  const activeBuffRows = hostedActiveBuffs(entity, context.allEntities);
  const activeFactorBuffRows = hostedFactorBuffs(entity, context.allEntities);
  const activeEffectBuffRows = hostedEffectBuffs(entity, context.allEntities);
  const activeBuffIds = collectActiveBuffIds(entity);
  for (const modifierWindow of modifierWindowRows) {
    const baseId = finitePositiveNumber(modifierWindow.baseId);
    const sourceConfigId = finitePositiveNumber(modifierWindow.sourceConfigId);
    if (baseId !== null) activeBuffIds.add(baseId);
    if (sourceConfigId !== null) activeBuffIds.add(sourceConfigId);
  }
  for (const buff of activeBuffRows) {
    const baseId = finitePositiveNumber(buff.baseId);
    const sourceConfigId = finitePositiveNumber(buff.sourceConfigId);
    if (baseId !== null) activeBuffIds.add(baseId);
    if (sourceConfigId !== null) activeBuffIds.add(sourceConfigId);
  }
  for (const buff of activeFactorBuffRows) {
    const factorBuffId = finitePositiveNumber(buff.factorBuffId);
    const observedBuffId = finitePositiveNumber(buff.observedBuffId);
    const sourceConfigId = finitePositiveNumber(buff.sourceConfigId);
    if (factorBuffId !== null) activeBuffIds.add(factorBuffId);
    if (observedBuffId !== null) activeBuffIds.add(observedBuffId);
    if (sourceConfigId !== null) activeBuffIds.add(sourceConfigId);
  }
  for (const buff of activeEffectBuffRows) {
    const effectSourceBuffId = finitePositiveNumber(buff.effectSourceBuffId);
    const observedBuffId = finitePositiveNumber(buff.observedBuffId);
    const sourceConfigId = finitePositiveNumber(buff.sourceConfigId);
    if (effectSourceBuffId !== null) activeBuffIds.add(effectSourceBuffId);
    if (observedBuffId !== null) activeBuffIds.add(observedBuffId);
    if (sourceConfigId !== null) activeBuffIds.add(sourceConfigId);
  }

  for (const modifierWindow of modifierWindowRows) {
    addObservedModifierWindowSources(sources, modifierWindow, context);
  }

  for (const buff of activeBuffRows) {
    addObservedActiveBuffSources(sources, buff, timedBuffCoveragePct(buff, context));
  }

  for (const buff of activeFactorBuffRows) {
    const hint = actorHint("factor", buff);
    const coveragePct = timedBuffCoveragePct(buff, context);
    addBuffSources(sources, finitePositiveNumber(buff.factorBuffId), `activeFactorBuff:${buff.factorBuffId}`, hint, coveragePct);
    addBuffSources(sources, finitePositiveNumber(buff.observedBuffId), `activeFactorBuffObserved:${buff.observedBuffId}`, hint, coveragePct);
    addBuffSources(sources, finitePositiveNumber(buff.sourceConfigId), `activeFactorBuffSourceConfig:${buff.sourceConfigId}`, hint, coveragePct);
  }

  for (const buff of activeEffectBuffRows) {
    const hint = actorHint("effect", buff);
    const coveragePct = timedBuffCoveragePct(buff, context);
    addBuffSources(sources, finitePositiveNumber(buff.effectSourceBuffId), `activeEffectBuff:${buff.effectSourceBuffId}`, hint, coveragePct);
    addBuffSources(sources, finitePositiveNumber(buff.observedBuffId), `activeEffectBuffObserved:${buff.observedBuffId}`, hint, coveragePct);
    addBuffSources(sources, finitePositiveNumber(buff.sourceConfigId), `activeEffectBuffSourceConfig:${buff.sourceConfigId}`, hint, coveragePct);
  }

  for (const selected of entity.activeEffectSources ?? []) {
    const source = effectSourcesById[selected.sourceId];
    addSource(
      sources,
      source ? sourceFromEffect(source) : fallbackSource(`effect-source:${selected.sourceId}`, "effect-source", `Effect Source ${selected.sourceId}`),
      [`activeEffectSource:${selected.sourceId}`],
      [],
      100,
    );
  }

  for (const passive of entity.activePassiveSkills ?? []) {
    const skillId = finiteNumber(passive.skillId);
    if (skillId === null) continue;
    const rows = passiveSkillRowsForEntity(skillId);
    if (rows.length > 0) {
      for (const row of rows) {
        if (!requiresRuntimeObservation(row)) {
          addSource(sources, row, [`activePassiveSkill:${skillId}`], [], 100);
        }
      }
    } else {
      addSource(sources, fallbackSource(`passive-skill:${skillId}`, "passive-skill", `Passive Skill ${skillId}`, skillId), [`activePassiveSkill:${skillId}`], [], 100);
    }
  }

  for (const talent of entity.activeProfessionTalents ?? []) {
    const professionId = finiteNumber(talent.professionId);
    if (professionId !== null && entity.classId > 0 && professionId !== entity.classId) {
      continue;
    }
    const nodeId = finiteNumber(talent.talentNodeId);
    if (nodeId === null) continue;
    const sourceEntityId = decodeProfessionTalentNodeId(nodeId);
    const stageCfgId = finiteNumber(talent.talentStageCfgId);
    if (sourceEntityId !== null) {
      const rows = professionTalentRowsForEntity(sourceEntityId);
      if (rows.length > 0) {
        for (const row of rows) {
          if (!requiresRuntimeObservation(row) && sourceHasActiveBuff(row, activeBuffIds)) {
            addSource(sources, row, [`activeProfessionTalentNode:${nodeId}->talent:${sourceEntityId}`], [], 100);
          }
        }
      } else {
        addSource(
          sources,
          fallbackSource(`profession-talent:${sourceEntityId}`, "profession-talent", `Profession Talent ${sourceEntityId}`, sourceEntityId),
          [`activeProfessionTalentNode:${nodeId}->talent:${sourceEntityId}`],
          [],
          100,
        );
      }
    }
    if (stageCfgId !== null && stageCfgId > 0) {
      const rows = professionTalentRowsForEntity(stageCfgId);
      if (rows.length > 0) {
        for (const row of rows) {
          if (!requiresRuntimeObservation(row) && sourceHasActiveBuff(row, activeBuffIds)) {
            addSource(sources, row, [`activeProfessionTalentStage:${stageCfgId}`], [], 100);
          }
        }
      }
    }
  }

  return [...sources.values()].filter((source) =>
    sourceAllowedForEntity(source, entity, ownedTalentIds, ownedPassiveSkillIds, context.allEntities)
  );
}

function modifierWindowFromBucket(bucket: ModifierHitBucketState): ModifierWindowState {
  return {
    buffUuid: bucket.modifierBuffUuid,
    baseId: bucket.modifierBaseId,
    buffLevel: bucket.modifierBuffLevel,
    partId: bucket.modifierPartId,
    count: bucket.modifierCount,
    fightSourceType: bucket.modifierFightSourceType,
    sourceConfigId: bucket.modifierSourceConfigId,
    layer: bucket.modifierLayer,
    durationMs: bucket.modifierDurationMs,
    startTimeMs: bucket.modifierStartTimeMs,
    endTimeMs: bucket.modifierEndTimeMs,
    hostUid: bucket.modifierHostUid,
    sourceUid: bucket.modifierSourceUid,
  };
}

function activeModifierSourcesWithBuckets(
  entity: HistoryEntityData,
  context: ModifierBuildContext,
): ModifierSource[] {
  const sources = new Map<string, ModifierSource>();
  for (const source of activeModifierSources(entity, context)) {
    sources.set(source.groupKey, source);
  }

  const observedWindows = new Map<string, BucketObservedWindowSummary>();
  for (const bucket of entity.modifierHitBuckets ?? []) {
    if (bucket.isHeal) continue;
    if (
      isIgnoredModifierBuffId(bucket.modifierBaseId)
      || isIgnoredModifierBuffId(bucket.modifierSourceConfigId)
    ) {
      continue;
    }
    const window = modifierWindowFromBucket(bucket);
    const baseId = finitePositiveNumber(window.baseId);
    if (baseId === null) continue;
    const sourceConfigId = finitePositiveNumber(window.sourceConfigId);
    const preferredId = preferredObservedBuffSourceId(baseId, sourceConfigId);
    if (isIgnoredModifierBuffId(preferredId)) continue;
    const interval = modifierWindowInterval(window, context);
    if (interval.endMs <= interval.startMs) continue;
    const key = [
      preferredId,
      baseId,
      sourceConfigId ?? "",
      hostedUid(window, entity.uid),
      window.sourceUid,
    ].join(":");
    const existing = observedWindows.get(key);
    const intervalKey = `${interval.startMs}:${interval.endMs}`;
    if (existing) {
      if (!existing.intervalKeys.has(intervalKey)) {
        existing.intervalKeys.add(intervalKey);
        existing.intervals.push(interval);
      }
    } else {
      observedWindows.set(key, {
        window,
        intervals: [interval],
        intervalKeys: new Set([intervalKey]),
      });
    }
  }

  for (const summary of observedWindows.values()) {
    const baseId = finitePositiveNumber(summary.window.baseId);
    const sourceConfigId = finitePositiveNumber(summary.window.sourceConfigId);
    const preferredId = baseId !== null
      ? preferredObservedBuffSourceId(baseId, sourceConfigId)
      : null;
    const bucketSources = preferredId !== null && !isIgnoredModifierBuffId(preferredId)
      ? sourcesForBuffId(preferredId)
      : [];
    const alreadyHasObservedTimeline =
      bucketSources.length > 0
      && bucketSources.every((source) => {
        const existing = sources.get(source.groupKey);
        return Boolean(existing && (existing.windows.length > 0 || existing.coveragePct !== null));
      });
    if (alreadyHasObservedTimeline) continue;

    addObservedModifierWindowSources(
      sources,
      summary.window,
      context,
      coalesceSourceWindows(summary.intervals),
    );
  }

  const ownedTalentIds = entityOwnedTalentIds(entity);
  const ownedPassiveSkillIds = entityOwnedPassiveSkillIds(entity);
  return [...sources.values()].filter((source) =>
    sourceAllowedForEntity(source, entity, ownedTalentIds, ownedPassiveSkillIds, context.allEntities)
  );
}

function mergedDamageIds(group: RecountGroup): number[] {
  const ids: number[] = [];
  for (const skill of group.skills) {
    ids.push(...(skill.mergedSkillIds?.length ? skill.mergedSkillIds : [skill.skillId]));
  }
  return sortedNumbers(ids);
}

function skillParents(
  entity: HistoryEntityData,
  elapsedSecs: number,
  targetUid: number | null = null,
): { rows: SkillParent[]; parentTotal: number } {
  let skills: Partial<Record<number, RawSkillStats>> = entity.dmgSkills;
  let parentTotal = entity.damage.total;

  if (targetUid !== null) {
    const target = entity.dmgPerTarget?.find((row) => row.targetUid === targetUid);
    if (target) {
      skills = target.skills;
      parentTotal = target.totalValue;
    }
  }

  const grouping = groupSkillsByRecount(
    skills,
    elapsedSecs,
    parentTotal,
    entity.activeFactorBuffs ?? [],
    entity.activeEffectBuffs ?? [],
    entity.activeEffectSources ?? [],
    entity.activeFactorItems ?? [],
  );

  const rows: SkillParent[] = [
    ...grouping.groups.map((group) => ({
      rowKind: "recount" as const,
      key: `recount:${group.recountId}`,
      skillId: group.recountId,
      recountId: group.recountId,
      name: group.recountName,
      damageIds: mergedDamageIds(group),
      totalDmg: group.totalDmg,
      effectiveTotal: group.effectiveTotal,
      dps: group.dps,
      hits: group.hits,
      hitsPerMinute: group.hitsPerMinute,
      critRate: group.critRate,
      luckyRate: group.luckyRate,
    })),
    ...grouping.ungrouped.map((skill) => ({
      rowKind: "skill" as const,
      key: `skill:${skill.skillId}`,
      skillId: skill.skillId,
      name: skill.name,
      ...(skill.names ? { names: skill.names } : {}),
      damageIds: skill.mergedSkillIds?.length ? skill.mergedSkillIds : [skill.skillId],
      totalDmg: skill.totalDmg,
      effectiveTotal: skill.effectiveTotal,
      dps: skill.dps,
      hits: skill.hits,
      hitsPerMinute: skill.hitsPerMinute,
      critRate: skill.critRate,
      luckyRate: skill.luckyRate,
    })),
  ];

  return {
    parentTotal,
    rows: rows.filter((row) => row.totalDmg > 0 || row.hits > 0).sort((a, b) => b.totalDmg - a.totalDmg),
  };
}

function sourceMatchesSkill(source: ModifierSource, skill: SkillParent): "direct-static-target" | "no-static-target" | null {
  const hasStaticTargets = source.targetDamageIds.size > 0 || source.targetRecountIds.size > 0;
  if (skill.recountId !== undefined && source.targetRecountIds.has(skill.recountId)) {
    return "direct-static-target";
  }
  if (skill.damageIds.some((damageId) => source.targetDamageIds.has(damageId))) {
    return "direct-static-target";
  }
  return hasStaticTargets ? null : "no-static-target";
}

function cachedSourceActorMatchesBucket(
  source: ModifierSource,
  bucket: ModifierHitBucketState,
  caches: ModifierBuildCaches,
): boolean {
  if (source.actorHints.size === 0) return true;
  let parsedHints = caches.parsedActorHints.get(source.groupKey);
  if (!parsedHints) {
    parsedHints = [...source.actorHints].map(parseActorHint);
    caches.parsedActorHints.set(source.groupKey, parsedHints);
  }
  for (const parsed of parsedHints) {
    const hostMatches = parsed.hostUid === null || parsed.hostUid === bucket.modifierHostUid;
    const sourceMatches = parsed.sourceUid === null || parsed.sourceUid === bucket.modifierSourceUid;
    if (hostMatches && sourceMatches) return true;
  }
  return false;
}

function bucketDamageIdentityKey(bucket: ModifierHitBucketState): string {
  const cached = bucketDamageIdentityKeys.get(bucket);
  if (cached) return cached;
  const key = [
    bucket.skillKey,
    bucket.damageId,
    bucket.ownerId,
    bucket.ownerLevel ?? "",
    bucket.hitEventId ?? "",
    bucket.damageSource ?? "",
    bucket.property ?? "",
    bucket.damageMode ?? "",
    bucket.attackerUid,
    bucket.originalAttackerUid,
    bucket.topSummonerUid ?? "",
    bucket.targetUid,
    bucket.targetMonsterTypeId ?? "",
    bucket.isHeal ? "heal" : "damage",
    bucket.hits,
    bucket.totalValue,
    bucket.effectiveTotalValue,
    bucket.firstHitTimeMs,
    bucket.lastHitTimeMs,
  ].join(":");
  bucketDamageIdentityKeys.set(bucket, key);
  return key;
}

const bucketDamageIdentityKeys = new WeakMap<ModifierHitBucketState, string>();

function capExactAggregateToSkill(row: ExactSkillAggregate): ExactSkillAggregate {
  const skillTotal = row.skill.totalDmg;
  if (skillTotal <= 0 || row.totalDmg <= skillTotal) return row;
  const ratio = skillTotal / row.totalDmg;
  return {
    ...row,
    totalDmg: skillTotal,
    effectiveTotal: Math.min(row.skill.effectiveTotal, row.effectiveTotal * ratio),
    hits: Math.min(row.skill.hits, row.hits * ratio),
    critHits: Math.min(row.skill.hits, row.critHits * ratio),
    critTotal: row.critTotal * ratio,
    luckyHits: Math.min(row.skill.hits, row.luckyHits * ratio),
    luckyTotal: row.luckyTotal * ratio,
  };
}

function observedCapRatio(
  totalDmg: number,
  effectiveTotal: number,
  hits: number,
  maxTotalDmg: number,
  maxEffectiveTotal: number,
  maxHits: number,
): number {
  const ratios = [1];
  if (maxTotalDmg > 0 && totalDmg > maxTotalDmg) ratios.push(maxTotalDmg / totalDmg);
  if (maxEffectiveTotal > 0 && effectiveTotal > maxEffectiveTotal) ratios.push(maxEffectiveTotal / effectiveTotal);
  if (maxHits > 0 && hits > maxHits) ratios.push(maxHits / hits);
  return Math.max(0, Math.min(...ratios));
}

function observedCeiling(summaryValue: number, rowSum: number): number {
  if (summaryValue > 0 && rowSum > 0) return Math.min(summaryValue, rowSum);
  return summaryValue > 0 ? summaryValue : rowSum;
}

function attributionModelValues(
  model: ModifierAttributionModel | undefined,
  field: "formulaTermIds" | "contributionGroups" | "predicateTags",
): string[] {
  return [
    ...(model?.[field] ?? []),
    ...(model?.components ?? []).flatMap((component) => component[field] ?? []),
  ];
}

function attributionEffectClasses(model: ModifierAttributionModel | undefined): string[] {
  return (model?.components ?? [])
    .map((component) => component.effectClass)
    .filter((value): value is string => Boolean(value));
}

function durationValueToMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1000 ? value : value * 1000;
}

function eventTimestampMs(value: unknown): number | null {
  const timestamp = finitePositiveNumber(value);
  if (timestamp === null) return null;
  return timestamp;
}

function timestampInIntervals(timestampMs: number, intervals: ModifierSourceWindow[], toleranceMs = 750): boolean {
  return intervals.some((interval) =>
    timestampMs >= interval.startMs - toleranceMs && timestampMs <= interval.endMs + toleranceMs
  );
}

function sourceTimingIntervals(source: ModifierSource, context: ModifierBuildContext): ModifierSourceWindow[] {
  const window = encounterWindow(context);
  if (source.windows.length > 0) {
    return coalesceSourceWindows(
      source.windows
        .map((interval) => ({
          startMs: Math.max(window.startMs, Math.min(interval.startMs, window.endMs)),
          endMs: Math.max(window.startMs, Math.min(interval.endMs, window.endMs)),
        }))
        .filter((interval) => interval.endMs > interval.startMs),
    );
  }

  const coveragePct = clampPct(source.coveragePct ?? 100);
  if (coveragePct <= 0) return [];
  const durationMs = window.durationMs * (coveragePct / 100);
  return [{
    startMs: window.endMs - durationMs,
    endMs: window.endMs,
  }];
}

function cooldownBaseMsForEvent(event: { skillLevelId: number; skillId: number; duration: number }): number {
  const byLevel = skillCooldownsByLevelId[String(event.skillLevelId)];
  const bySkill = skillCooldownsBySkillId[String(event.skillId)];
  const cooldownSeconds =
    finitePositiveNumber(byLevel?.pveCooldownSeconds)
    ?? finitePositiveNumber(bySkill?.maxPveCooldownSeconds);
  if (cooldownSeconds !== null) return cooldownSeconds * 1000;
  return durationValueToMs(event.duration);
}

function isCooldownTimingSource(source: ModifierSource): boolean {
  if (isTimingLockoutSource(source)) return false;
  const model = source.attributionModel;
  const terms = new Set(attributionModelValues(model, "formulaTermIds"));
  const groups = new Set(attributionModelValues(model, "contributionGroups"));
  const classes = new Set(attributionEffectClasses(model));
  if (terms.has("cooldown") || terms.has("skillCooldown")) return true;
  if (groups.has("hitTiming")) return true;
  if (classes.has("cooldown-or-resource")) return true;
  if (model?.status === "timing-only" && /\b(?:cooldown|cd|recast|acceleration|accelerate|skill cds?)\b/i.test(sourceSearchText(source))) {
    return true;
  }
  return false;
}

function buildCooldownTimingModel(
  source: ModifierSource,
  entity: HistoryEntityData,
  context: ModifierBuildContext,
  skillLookup: SkillParentLookup,
): ModifierTimingModel | undefined {
  if (!isCooldownTimingSource(source)) return undefined;

  const intervals = sourceTimingIntervals(source, context);
  if (intervals.length === 0) {
    return {
      kind: "cooldown-acceleration",
      status: "needs-window",
      cooldownEvents: 0,
      castEventsDuringWindow: 0,
      affectedSkillIds: [],
      affectedSkillLevelIds: [],
      totalDirectReductionMs: 0,
      totalAccelerationOpportunityMs: 0,
      totalTimeSavedMs: 0,
      extraCastOpportunity: 0,
      averageAccelerateRate: 0,
      notes: ["No timed modifier window was saved for this cooldown source."],
    };
  }

  const cooldownEvents = (entity.skillCooldownEvents ?? []).filter((event) => {
    const timestamp = eventTimestampMs(event.timestampMs);
    return timestamp !== null && timestampInIntervals(timestamp, intervals);
  });
  const castEvents = (entity.skillCastEvents ?? []).filter((event) => {
    const timestamp = eventTimestampMs(event.timestampMs);
    return timestamp !== null && timestampInIntervals(timestamp, intervals);
  });

  const castCountsBySkillId = new Map<number, number>();
  for (const event of entity.skillCastEvents ?? []) {
    const skillId = finitePositiveNumber(event.skillId);
    if (skillId === null) continue;
    castCountsBySkillId.set(skillId, (castCountsBySkillId.get(skillId) ?? 0) + 1);
  }

  const skillIds = new Set<number>();
  const skillLevelIds = new Set<number>();
  const extraOpportunityBySkillId = new Map<number, number>();
  let totalDirectReductionMs = 0;
  let totalAccelerationOpportunityMs = 0;
  let totalTimeSavedMs = 0;
  let rateWeight = 0;
  let rateWeightedTotal = 0;

  for (const event of cooldownEvents) {
    const skillId = finitePositiveNumber(event.skillId);
    const skillLevelId = finitePositiveNumber(event.skillLevelId);
    if (skillId !== null) skillIds.add(skillId);
    if (skillLevelId !== null) skillLevelIds.add(skillLevelId);

    const durationMs = durationValueToMs(event.duration);
    const calculatedDurationMs = durationValueToMs(event.calculatedDuration);
    const directReductionMs = Math.max(0, durationMs - calculatedDurationMs);
    const accelerateRate = Math.max(0, finiteNumber(event.cdAccelerateRate) ?? 0);
    const accelerationOpportunityMs =
      accelerateRate > 0 && calculatedDurationMs > 0
        ? Math.max(0, calculatedDurationMs - (calculatedDurationMs / (1 + accelerateRate)))
        : 0;
    const eventSavedMs = directReductionMs + accelerationOpportunityMs;
    totalDirectReductionMs += directReductionMs;
    totalAccelerationOpportunityMs += accelerationOpportunityMs;
    totalTimeSavedMs += eventSavedMs;

    const baseCooldownMs = cooldownBaseMsForEvent(event);
    if (skillId !== null && baseCooldownMs > 0 && eventSavedMs > 0) {
      extraOpportunityBySkillId.set(
        skillId,
        (extraOpportunityBySkillId.get(skillId) ?? 0) + (eventSavedMs / baseCooldownMs),
      );
    }

    if (accelerateRate > 0 && calculatedDurationMs > 0) {
      rateWeightedTotal += accelerateRate * calculatedDurationMs;
      rateWeight += calculatedDurationMs;
    }
  }

  let estimatedOpportunityDamage = 0;
  for (const [skillId, extraCastOpportunity] of extraOpportunityBySkillId) {
    const skill = skillLookup.get(skillId);
    const castCount = castCountsBySkillId.get(skillId) ?? 0;
    if (!skill || castCount <= 0 || skill.totalDmg <= 0) continue;
    estimatedOpportunityDamage += extraCastOpportunity * (skill.totalDmg / castCount);
  }

  const notes = [
    cooldownEvents.length > 0
      ? "Timing estimate only: cooldown acceleration creates recast opportunity, not direct per-hit damage."
      : "No saved cooldown events found for this source. Older encounters need a fresh parse after cooldown event capture.",
    estimatedOpportunityDamage > 0
      ? "Opportunity damage uses observed average damage per cast and is not yet a final formula-derived gain."
      : "Hard damage gain still needs cast-to-damage replay or formula decomposition.",
  ];

  return {
    kind: "cooldown-acceleration",
    status: cooldownEvents.length > 0 ? "event-backed" : "needs-cooldown-events",
    cooldownEvents: cooldownEvents.length,
    castEventsDuringWindow: castEvents.length,
    affectedSkillIds: sortedNumbers(skillIds),
    affectedSkillLevelIds: sortedNumbers(skillLevelIds),
    totalDirectReductionMs,
    totalAccelerationOpportunityMs,
    totalTimeSavedMs,
    extraCastOpportunity: [...extraOpportunityBySkillId.values()].reduce((sum, value) => sum + value, 0),
    ...(estimatedOpportunityDamage > 0 ? { estimatedOpportunityDamage } : {}),
    averageAccelerateRate: rateWeight > 0 ? rateWeightedTotal / rateWeight : 0,
    notes,
  };
}

function cachedBuildCooldownTimingModel(
  source: ModifierSource,
  entity: HistoryEntityData,
  context: ModifierBuildContext,
  skillLookup: SkillParentLookup,
  caches: ModifierBuildCaches,
): ModifierTimingModel | undefined {
  const key = [
    source.groupKey,
    context.elapsedSecs,
    context.encounterStartMs ?? "",
    context.encounterEndMs ?? "",
  ].join("|");
  const cached = caches.cooldownTimingModel.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const value = buildCooldownTimingModel(source, entity, context, skillLookup);
  caches.cooldownTimingModel.set(key, value ?? null);
  return value;
}

function supportsObservedTargetMitigationDelta(source: ModifierSource): boolean {
  const model = source.attributionModel;
  const terms = new Set(attributionModelValues(model, "formulaTermIds"));
  const groups = new Set(attributionModelValues(model, "contributionGroups"));
  const predicates = new Set(attributionModelValues(model, "predicateTags"));
  const classes = new Set(attributionEffectClasses(model));
  return terms.has("resistance")
    || terms.has("targetArmorMitigation")
    || groups.has("targetMitigation")
    || classes.has("target-mitigation")
    || classes.has("target-armor-mitigation")
    || predicates.has("target.resistance")
    || predicates.has("target.armor-or-defense");
}

function estimateObservedDeltaContribution(
  source: ModifierSource,
  aggregate: ExactSkillAggregate,
  playerTotal: number,
): EstimatedContribution | null {
  if (!supportsObservedTargetMitigationDelta(source)) return null;
  if (aggregate.hits <= 0 || aggregate.totalDmg <= 0) return null;

  const baselineHits = aggregate.skill.hits - aggregate.hits;
  const baselineTotal = aggregate.skill.totalDmg - aggregate.totalDmg;
  if (baselineHits < 1 || baselineTotal <= 0) return null;

  const observedDmgPerHit = aggregate.totalDmg / aggregate.hits;
  const baselineDmgPerHit = baselineTotal / baselineHits;
  const deltaPerHit = observedDmgPerHit - baselineDmgPerHit;
  if (!Number.isFinite(deltaPerHit) || deltaPerHit <= 0) return null;

  const estimatedContributionTotal = Math.min(
    aggregate.totalDmg,
    deltaPerHit * aggregate.hits,
  );
  if (!Number.isFinite(estimatedContributionTotal) || estimatedContributionTotal <= 0) return null;

  const confidence: ModifierContributionConfidence =
    aggregate.hits >= 5 && baselineHits >= 5 ? "medium" : "low";

  return {
    estimatedContributionTotal,
    estimatedContributionPct: safePct(estimatedContributionTotal, playerTotal),
    estimatedContributionConfidence: confidence,
    observedDmgPerHit,
    baselineDmgPerHit,
    baselineHits,
  };
}

function scaleExactAggregatesToObservedTotals(
  rows: ExactSkillAggregate[],
  maxTotalDmg: number,
  maxEffectiveTotal: number,
  maxHits: number,
): ExactSkillAggregate[] {
  const totalDmg = rows.reduce((sum, row) => sum + row.totalDmg, 0);
  const effectiveTotal = rows.reduce((sum, row) => sum + row.effectiveTotal, 0);
  const hits = rows.reduce((sum, row) => sum + row.hits, 0);
  const ratio = observedCapRatio(totalDmg, effectiveTotal, hits, maxTotalDmg, maxEffectiveTotal, maxHits);
  if (ratio >= 1) return rows;
  return rows.map((row) => ({
    ...row,
    totalDmg: row.totalDmg * ratio,
    effectiveTotal: row.effectiveTotal * ratio,
    hits: row.hits * ratio,
    critHits: row.critHits * ratio,
    critTotal: row.critTotal * ratio,
    luckyHits: row.luckyHits * ratio,
    luckyTotal: row.luckyTotal * ratio,
  }));
}

function buildSkillParentLookup(skills: SkillParent[]): SkillParentLookup {
  const lookup: SkillParentLookup = new Map();
  for (const skill of skills) {
    if (!lookup.has(skill.skillId)) lookup.set(skill.skillId, skill);
    for (const damageId of skill.damageIds) {
      if (!lookup.has(damageId)) lookup.set(damageId, skill);
    }
  }
  return lookup;
}

function skillParentForBucket(skillLookup: SkillParentLookup, bucket: ModifierHitBucketState): SkillParent | null {
  const skillKey = finiteNumber(bucket.skillKey);
  if (skillKey === null) return null;
  return skillLookup.get(skillKey) ?? null;
}

function modifierBucketBuffIds(bucket: ModifierHitBucketState): number[] {
  const ids = new Set<number>();
  const baseId = finitePositiveNumber(bucket.modifierBaseId);
  const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
  if (baseId !== null && !isIgnoredModifierBuffId(baseId)) ids.add(baseId);
  if (sourceConfigId !== null && !isIgnoredModifierBuffId(sourceConfigId)) ids.add(sourceConfigId);
  return [...ids];
}

function aggregateBucketForSource(
  bySkill: Map<string, ExactSkillAggregate>,
  bucket: ModifierHitBucketState,
  skill: SkillParent,
  match: "direct-static-target" | "no-static-target",
): void {
  const key = skill.key;
  const row = bySkill.get(key) ?? {
    skill,
    match,
    totalDmg: 0,
    effectiveTotal: 0,
    hits: 0,
    critHits: 0,
    critTotal: 0,
    luckyHits: 0,
    luckyTotal: 0,
  };
  row.totalDmg += Number(bucket.totalValue);
  row.effectiveTotal += Number(bucket.effectiveTotalValue);
  row.hits += Number(bucket.hits);
  row.critHits += Number(bucket.critHits);
  row.critTotal += Number(bucket.critTotalValue);
  row.luckyHits += Number(bucket.luckyHits);
  row.luckyTotal += Number(bucket.luckyTotalValue);
  bySkill.set(key, row);
}

function buildExactSkillAggregatesBySource(
  sources: ModifierSource[],
  buckets: ModifierHitBucketState[],
  skillLookup: SkillParentLookup,
  scope: ModifierActivityScope,
  targetUid: number | null,
  caches: ModifierBuildCaches,
): Map<string, ExactSkillAggregate[]> {
  const sourcesByBuffId = new Map<number, ModifierSource[]>();
  for (const source of sources) {
    for (const buffId of source.buffIds) {
      const rows = sourcesByBuffId.get(buffId) ?? [];
      rows.push(source);
      sourcesByBuffId.set(buffId, rows);
    }
  }

  const aggregatesBySource = new Map<string, Map<string, ExactSkillAggregate>>();
  const seenDamageBucketsBySource = new Map<string, Set<string>>();
  const bucketSources = new Map<string, ModifierSource>();

  for (const bucket of buckets) {
    if (bucket.isHeal) continue;
    if (targetUid !== null && bucket.targetUid !== targetUid) continue;

    const skill = skillParentForBucket(skillLookup, bucket);
    if (!skill) continue;

    bucketSources.clear();
    for (const buffId of modifierBucketBuffIds(bucket)) {
      for (const source of sourcesByBuffId.get(buffId) ?? []) {
        bucketSources.set(source.groupKey, source);
      }
    }
    if (bucketSources.size === 0) continue;

    const damageIdentityKey = bucketDamageIdentityKey(bucket);
    for (const source of bucketSources.values()) {
      if (!cachedSourceActorMatchesBucket(source, bucket, caches)) continue;

      const staticMatch = sourceMatchesSkill(source, skill);
      const includeBroadActive =
        scope === "all-active"
        && (
          (staticMatch === "no-static-target" && cachedIsBroadDamageModifierSource(source, caches))
          || (staticMatch === null && cachedIsRuntimeObservedBroadSource(source, caches))
        );
      if (staticMatch !== "direct-static-target" && !includeBroadActive) continue;

      let seenDamageBuckets = seenDamageBucketsBySource.get(source.groupKey);
      if (!seenDamageBuckets) {
        seenDamageBuckets = new Set();
        seenDamageBucketsBySource.set(source.groupKey, seenDamageBuckets);
      }
      if (seenDamageBuckets.has(damageIdentityKey)) continue;
      seenDamageBuckets.add(damageIdentityKey);

      let bySkill = aggregatesBySource.get(source.groupKey);
      if (!bySkill) {
        bySkill = new Map();
        aggregatesBySource.set(source.groupKey, bySkill);
      }
      aggregateBucketForSource(bySkill, bucket, skill, staticMatch ?? "no-static-target");
    }
  }

  const rowsBySource = new Map<string, ExactSkillAggregate[]>();
  for (const [sourceKey, bySkill] of aggregatesBySource.entries()) {
    rowsBySource.set(
      sourceKey,
      [...bySkill.values()]
        .map(capExactAggregateToSkill)
        .filter((row) => row.totalDmg > 0 || row.hits > 0)
        .sort((left, right) => right.totalDmg - left.totalDmg || right.hits - left.hits),
    );
  }
  return rowsBySource;
}

function displaySourceName(source: ModifierSource): string {
  if (source.sourceName.trim()) return source.sourceName;
  return source.sourceId;
}

function sourceSortName(source: ModifierActivityRow): string {
  return `${source.sourceName} ${source.sourceId}`.toLowerCase();
}

function singleEvidenceGrade(evidence: string[]): number | null {
  const grades = new Set<number>();
  for (const item of evidence) {
    for (const match of item.matchAll(/(?:^|[:|])G(\d+)(?=$|[:|])/g)) {
      const grade = finiteNumber(match[1]);
      if (grade !== null) grades.add(grade);
    }
  }
  if (grades.size !== 1) return null;
  for (const grade of grades) return grade;
  return null;
}

function buildSkillRow(
  source: ModifierSource,
  skill: SkillParent,
  match: "direct-static-target" | "no-static-target",
  playerTotal: number,
  sourceTotal: number,
  coveragePct: number,
  elapsedSecs: number,
): ModifierActivitySkillRow {
  const coverageRatio = clampPct(coveragePct) / 100;
  const totalDmg = skill.totalDmg * coverageRatio;
  const effectiveTotal = skill.effectiveTotal * coverageRatio;
  const hits = skill.hits * coverageRatio;
  return {
    key: `${source.groupKey}:${skill.key}`,
    rowKind: skill.rowKind,
    skillId: skill.skillId,
    ...(skill.recountId !== undefined ? { recountId: skill.recountId } : {}),
    name: skill.name || lookupDamageIdName(skill.skillId),
    ...(skill.names ? { names: skill.names } : {}),
    damageIds: skill.damageIds,
    match,
    totalDmg,
    effectiveTotal,
    baseTotalDmg: skill.totalDmg,
    baseEffectiveTotal: skill.effectiveTotal,
    baseDmgPct: safePct(skill.totalDmg, playerTotal),
    baseDps: skill.dps,
    baseHits: skill.hits,
    baseHitsPerMinute: skill.hitsPerMinute,
    dmgPct: safePct(totalDmg, playerTotal),
    sourcePct: safePct(totalDmg, sourceTotal),
    coveragePct: clampPct(coveragePct),
    dps: skill.dps * coverageRatio,
    hits,
    hitsPerMinute: perMinute(hits, elapsedSecs),
    critRate: skill.critRate,
    luckyRate: skill.luckyRate,
  };
}

function buildExactSkillRow(
  source: ModifierSource,
  aggregate: ExactSkillAggregate,
  playerTotal: number,
  sourceTotal: number,
  elapsedSecs: number,
): ModifierActivitySkillRow {
  const skill = aggregate.skill;
  const estimatedContribution = estimateObservedDeltaContribution(source, aggregate, playerTotal);
  return {
    key: `${source.groupKey}:${skill.key}`,
    rowKind: skill.rowKind,
    skillId: skill.skillId,
    ...(skill.recountId !== undefined ? { recountId: skill.recountId } : {}),
    name: skill.name || lookupDamageIdName(skill.skillId),
    ...(skill.names ? { names: skill.names } : {}),
    damageIds: skill.damageIds,
    match: aggregate.match,
    totalDmg: aggregate.totalDmg,
    effectiveTotal: aggregate.effectiveTotal,
    ...(estimatedContribution ?? {}),
    baseTotalDmg: skill.totalDmg,
    baseEffectiveTotal: skill.effectiveTotal,
    baseDmgPct: safePct(skill.totalDmg, playerTotal),
    baseDps: skill.dps,
    baseHits: skill.hits,
    baseHitsPerMinute: skill.hitsPerMinute,
    dmgPct: safePct(aggregate.totalDmg, playerTotal),
    sourcePct: safePct(aggregate.totalDmg, sourceTotal),
    coveragePct: safePct(aggregate.totalDmg, skill.totalDmg),
    dps: elapsedSecs > 0 ? aggregate.totalDmg / elapsedSecs : 0,
    hits: aggregate.hits,
    hitsPerMinute: perMinute(aggregate.hits, elapsedSecs),
    critRate: rate(aggregate.critHits, aggregate.hits),
    luckyRate: rate(aggregate.luckyHits, aggregate.hits),
  };
}

function modifierActivitySkillGroupKey(skill: Pick<ModifierActivitySkillRow, "rowKind" | "skillId" | "recountId" | "damageIds">): string {
  if (skill.rowKind === "recount" && skill.recountId !== undefined) return `recount:${skill.recountId}`;
  return `skill:${skill.skillId}:${skill.damageIds.join(",")}`;
}

function rescaleModifierSkillRow(
  row: ModifierActivitySkillRow,
  ratio: number,
  playerTotal: number,
  elapsedSecs: number,
): ModifierActivitySkillRow {
  if (ratio >= 1) return row;

  const totalDmg = row.totalDmg * ratio;
  const effectiveTotal = row.effectiveTotal * ratio;
  const hits = row.hits * ratio;
  const estimatedContributionTotal = row.estimatedContributionTotal !== undefined
    ? row.estimatedContributionTotal * ratio
    : undefined;

  const scaled: ModifierActivitySkillRow = {
    ...row,
    totalDmg,
    effectiveTotal,
    dmgPct: safePct(totalDmg, playerTotal),
    coveragePct: safePct(totalDmg, row.baseTotalDmg),
    dps: elapsedSecs > 0 ? totalDmg / elapsedSecs : 0,
    hits,
    hitsPerMinute: perMinute(hits, elapsedSecs),
  };
  if (estimatedContributionTotal !== undefined && estimatedContributionTotal > 0) {
    scaled.estimatedContributionTotal = estimatedContributionTotal;
    scaled.estimatedContributionPct = safePct(estimatedContributionTotal, playerTotal);
  } else {
    delete scaled.estimatedContributionTotal;
    delete scaled.estimatedContributionPct;
    delete scaled.estimatedContributionConfidence;
    delete scaled.observedDmgPerHit;
    delete scaled.baselineDmgPerHit;
    delete scaled.baselineHits;
  }
  return scaled;
}

function recomputeModifierRowFromSkills(
  row: ModifierActivityRow,
  playerTotal: number,
  elapsedSecs: number,
): ModifierActivityRow {
  const totalDmg = row.skills.reduce((sum, skill) => sum + skill.totalDmg, 0);
  const effectiveTotal = row.skills.reduce((sum, skill) => sum + skill.effectiveTotal, 0);
  const hits = row.skills.reduce((sum, skill) => sum + skill.hits, 0);
  const estimatedContributionTotal = row.skills.reduce(
    (sum, skill) => sum + (skill.estimatedContributionTotal ?? 0),
    0,
  );
  const lowConfidence = row.skills.some((skill) =>
    skill.estimatedContributionTotal !== undefined && skill.estimatedContributionConfidence === "low"
  );
  const skills = row.skills
    .map((skill) => ({
      ...skill,
      sourcePct: safePct(skill.totalDmg, totalDmg),
    }))
    .sort((left, right) => right.totalDmg - left.totalDmg || right.hits - left.hits);

  const recomputed: ModifierActivityRow = {
    ...row,
    totalDmg,
    effectiveTotal,
    dmgPct: safePct(totalDmg, playerTotal),
    dps: elapsedSecs > 0 ? totalDmg / elapsedSecs : 0,
    hits,
    hitsPerMinute: perMinute(hits, elapsedSecs),
    critRate: rate(
      skills.reduce((sum, skill) => sum + (skill.critRate / 100) * skill.hits, 0),
      hits,
    ),
    luckyRate: rate(
      skills.reduce((sum, skill) => sum + (skill.luckyRate / 100) * skill.hits, 0),
      hits,
    ),
    skills,
  };
  if (estimatedContributionTotal > 0) {
    recomputed.estimatedContributionTotal = estimatedContributionTotal;
    recomputed.estimatedContributionPct = safePct(estimatedContributionTotal, playerTotal);
    recomputed.estimatedContributionConfidence = lowConfidence ? "low" : "medium";
  } else {
    delete recomputed.estimatedContributionTotal;
    delete recomputed.estimatedContributionPct;
    delete recomputed.estimatedContributionConfidence;
    delete recomputed.observedDmgPerHit;
    delete recomputed.baselineDmgPerHit;
    delete recomputed.baselineHits;
  }
  return recomputed;
}

function allocateModifierOverlap(
  rows: ModifierActivityRow[],
  playerTotal: number,
  elapsedSecs: number,
): ModifierActivityRow[] {
  const totalsBySkill = new Map<string, {
    totalDmg: number;
    effectiveTotal: number;
    hits: number;
    maxTotalDmg: number;
    maxEffectiveTotal: number;
    maxHits: number;
  }>();

  for (const row of rows) {
    for (const skill of row.skills) {
      const key = modifierActivitySkillGroupKey(skill);
      const total = totalsBySkill.get(key) ?? {
        totalDmg: 0,
        effectiveTotal: 0,
        hits: 0,
        maxTotalDmg: 0,
        maxEffectiveTotal: 0,
        maxHits: 0,
      };
      total.totalDmg += skill.totalDmg;
      total.effectiveTotal += skill.effectiveTotal;
      total.hits += skill.hits;
      total.maxTotalDmg = Math.max(total.maxTotalDmg, skill.baseTotalDmg);
      total.maxEffectiveTotal = Math.max(total.maxEffectiveTotal, skill.baseEffectiveTotal);
      total.maxHits = Math.max(total.maxHits, skill.baseHits);
      totalsBySkill.set(key, total);
    }
  }

  const ratioBySkill = new Map<string, number>();
  for (const [key, total] of totalsBySkill.entries()) {
    ratioBySkill.set(
      key,
      observedCapRatio(
        total.totalDmg,
        total.effectiveTotal,
        total.hits,
        total.maxTotalDmg,
        total.maxEffectiveTotal,
        total.maxHits,
      ),
    );
  }

  return rows.map((row) => {
    const scaledSkills = row.skills.map((skill) =>
      rescaleModifierSkillRow(
        skill,
        ratioBySkill.get(modifierActivitySkillGroupKey(skill)) ?? 1,
        playerTotal,
        elapsedSecs,
      )
    );
    return recomputeModifierRowFromSkills({ ...row, skills: scaledSkills }, playerTotal, elapsedSecs);
  });
}

export function buildModifierActivityRows(
  entity: HistoryEntityData,
  elapsedSecs: number,
  options: {
    scope?: ModifierActivityScope;
    actorFilter?: ModifierActorFilter;
    targetUid?: number | null;
    encounterStartMs?: number | null;
    encounterEndMs?: number | null;
    allEntities?: HistoryEntityData[];
  } = {},
): ModifierActivityRow[] {
  const scope = options.scope ?? "all-active";
  const actorFilter = options.actorFilter ?? "all";
  const { rows: skills, parentTotal } = skillParents(entity, elapsedSecs, options.targetUid ?? null);
  const skillTotal = skills.reduce((sum, row) => sum + row.totalDmg, 0);
  const skillEffectiveTotal = skills.reduce((sum, row) => sum + row.effectiveTotal, 0);
  const skillHits = skills.reduce((sum, row) => sum + row.hits, 0);
  const skillLookup = buildSkillParentLookup(skills);
  const playerTotal = observedCeiling(parentTotal > 0 ? parentTotal : entity.damage.total, skillTotal);
  const playerEffectiveTotal = observedCeiling(entity.damage.effectiveTotal, skillEffectiveTotal);
  const playerHits = observedCeiling(entity.damage.hits, skillHits);
  const result: ModifierActivityRow[] = [];
  const context: ModifierBuildContext = {
    elapsedSecs,
    encounterStartMs: options.encounterStartMs ?? null,
    encounterEndMs: options.encounterEndMs ?? null,
    ...(options.allEntities ? { allEntities: options.allEntities } : {}),
  };
  const caches = createModifierBuildCaches();
  const modifierHitBuckets = entity.modifierHitBuckets ?? [];
  const sources = activeModifierSourcesWithBuckets(entity, context);
  const exactSkillAggregatesBySource = buildExactSkillAggregatesBySource(
    sources,
    modifierHitBuckets,
    skillLookup,
    scope,
    options.targetUid ?? null,
    caches,
  );

  for (const source of sources) {
    const actorSummary = summarizeActors(source.actorHints);
    if (actorFilter === "external" && actorSummary.externalSourceUids.length === 0) continue;

    const exactSkillAggregates = exactSkillAggregatesBySource.get(source.groupKey) ?? [];
    if (exactSkillAggregates.length > 0) {
      const cappedExactSkillAggregates = scaleExactAggregatesToObservedTotals(
        exactSkillAggregates,
        playerTotal,
        playerEffectiveTotal,
        playerHits,
      );
      const sourceTotal = cappedExactSkillAggregates.reduce((sum, row) => sum + row.totalDmg, 0);
      const effectiveTotal = cappedExactSkillAggregates.reduce((sum, row) => sum + row.effectiveTotal, 0);
      const hits = cappedExactSkillAggregates.reduce((sum, row) => sum + row.hits, 0);
      const skillRows = cappedExactSkillAggregates
        .map((row) => buildExactSkillRow(source, row, playerTotal, sourceTotal, elapsedSecs))
        .sort((left, right) => right.totalDmg - left.totalDmg);
      const estimatedContributionTotal = skillRows.reduce(
        (sum, row) => sum + (row.estimatedContributionTotal ?? 0),
        0,
      );
      const estimatedContributionRows = skillRows.filter((row) =>
        (row.estimatedContributionTotal ?? 0) > 0
      );
      const directMatches = cappedExactSkillAggregates.filter((row) => row.match === "direct-static-target").length;
      const match = directMatches === cappedExactSkillAggregates.length
        ? "direct-static-target"
        : directMatches === 0
          ? "no-static-target"
          : "mixed";
      const coveragePct = cachedSourceWindowCoveragePct(source, context, caches);
      const timingModel = cachedBuildCooldownTimingModel(source, entity, context, skillLookup, caches);

      result.push({
        key: source.groupKey,
        sourceId: source.sourceId,
        sourceIds: sortedStrings(source.sourceIds),
        sourceKind: source.sourceKind,
        ...(source.sourceType ? { sourceType: source.sourceType } : {}),
        ...(source.sourceEntityId !== undefined ? { sourceEntityId: source.sourceEntityId } : {}),
        sourceName: displaySourceName(source),
        ...(source.sourceNames ? { sourceNames: source.sourceNames } : {}),
        ...(source.description ? { description: source.description } : {}),
        ...(source.descriptions ? { descriptions: source.descriptions } : {}),
        ...(source.descriptionByGrade ? { descriptionByGrade: source.descriptionByGrade } : {}),
        ...(source.iconPath ? { iconPath: source.iconPath } : {}),
        ...(source.runtimeDetection ? { runtimeDetection: source.runtimeDetection } : {}),
        buffIds: sortedNumbers(source.buffIds),
        evidence: sortedStrings(source.evidence),
        ...(source.attributionModel ? { attributionModel: source.attributionModel } : {}),
        ...(source.talentOwnership ? { talentOwnership: source.talentOwnership } : {}),
        ...(timingModel ? { timingModel } : {}),
        actorSummary,
        match,
        targetDamageIds: sortedNumbers(source.targetDamageIds),
        targetRecountIds: sortedNumbers(source.targetRecountIds),
        totalDmg: sourceTotal,
        effectiveTotal,
        ...(estimatedContributionTotal > 0
          ? {
              estimatedContributionTotal,
              estimatedContributionPct: safePct(estimatedContributionTotal, playerTotal),
              estimatedContributionConfidence: estimatedContributionRows.some((row) =>
                row.estimatedContributionConfidence === "low"
              )
                ? "low"
                : "medium",
            }
          : {}),
        dmgPct: safePct(sourceTotal, playerTotal),
        coveragePct: clampPct(coveragePct),
        dps: elapsedSecs > 0 ? sourceTotal / elapsedSecs : 0,
        hits,
        hitsPerMinute: perMinute(hits, elapsedSecs),
        critRate: rate(
          cappedExactSkillAggregates.reduce((sum, row) => sum + row.critHits, 0),
          hits,
        ),
        luckyRate: rate(
          cappedExactSkillAggregates.reduce((sum, row) => sum + row.luckyHits, 0),
          hits,
        ),
        skills: skillRows,
      });
      continue;
    }

    const matchingSkills: Array<{ skill: SkillParent; match: "direct-static-target" | "no-static-target" }> = [];
    const sourceBroad = cachedIsBroadDamageModifierSource(source, caches);
    const runtimeBroad = cachedIsRuntimeObservedBroadSource(source, caches);
    for (const skill of skills) {
      const match = sourceMatchesSkill(source, skill);
      const includeBroadActive =
        scope === "all-active"
        && (
          (match === "no-static-target" && sourceBroad)
          || (match === null && runtimeBroad)
        );
      if (match === "direct-static-target" || includeBroadActive) {
        matchingSkills.push({ skill, match: match ?? "no-static-target" });
      }
    }
    if (matchingSkills.length === 0) continue;

    const coveragePct = cachedSourceWindowCoveragePct(source, context, caches);
    const coverageRatio = clampPct(coveragePct) / 100;
    const rawSourceTotal = matchingSkills.reduce((sum, row) => sum + row.skill.totalDmg * coverageRatio, 0);
    const rawHits = matchingSkills.reduce((sum, row) => sum + row.skill.hits * coverageRatio, 0);
    const rawEffectiveTotal = matchingSkills.reduce((sum, row) => sum + row.skill.effectiveTotal * coverageRatio, 0);
    const capRatio = observedCapRatio(
      rawSourceTotal,
      rawEffectiveTotal,
      rawHits,
      playerTotal,
      playerEffectiveTotal,
      playerHits,
    );
    const sourceTotal = rawSourceTotal * capRatio;
    const hits = rawHits * capRatio;
    const effectiveTotal = rawEffectiveTotal * capRatio;
    const cappedCoveragePct = coveragePct * capRatio;
    const cappedCoverageRatio = coverageRatio * capRatio;
    const directMatches = matchingSkills.filter((row) => row.match === "direct-static-target").length;
    const match = directMatches === matchingSkills.length
      ? "direct-static-target"
      : directMatches === 0
        ? "no-static-target"
        : "mixed";
    const timingModel = cachedBuildCooldownTimingModel(source, entity, context, skillLookup, caches);

    result.push({
      key: source.groupKey,
      sourceId: source.sourceId,
      sourceIds: sortedStrings(source.sourceIds),
      sourceKind: source.sourceKind,
      ...(source.sourceType ? { sourceType: source.sourceType } : {}),
      ...(source.sourceEntityId !== undefined ? { sourceEntityId: source.sourceEntityId } : {}),
      sourceName: displaySourceName(source),
      ...(source.sourceNames ? { sourceNames: source.sourceNames } : {}),
      ...(source.description ? { description: source.description } : {}),
      ...(source.descriptions ? { descriptions: source.descriptions } : {}),
      ...(source.descriptionByGrade ? { descriptionByGrade: source.descriptionByGrade } : {}),
      ...(source.iconPath ? { iconPath: source.iconPath } : {}),
      ...(source.runtimeDetection ? { runtimeDetection: source.runtimeDetection } : {}),
      buffIds: sortedNumbers(source.buffIds),
      evidence: sortedStrings(source.evidence),
      ...(source.attributionModel ? { attributionModel: source.attributionModel } : {}),
      ...(source.talentOwnership ? { talentOwnership: source.talentOwnership } : {}),
      ...(timingModel ? { timingModel } : {}),
      actorSummary,
      match,
      targetDamageIds: sortedNumbers(source.targetDamageIds),
      targetRecountIds: sortedNumbers(source.targetRecountIds),
      totalDmg: sourceTotal,
      effectiveTotal,
      dmgPct: safePct(sourceTotal, playerTotal),
      coveragePct: clampPct(cappedCoveragePct),
      dps: elapsedSecs > 0 ? sourceTotal / elapsedSecs : 0,
      hits,
      hitsPerMinute: perMinute(hits, elapsedSecs),
      critRate: rate(
        matchingSkills.reduce((sum, row) => sum + (row.skill.critRate / 100) * row.skill.hits * cappedCoverageRatio, 0),
        hits,
      ),
      luckyRate: rate(
        matchingSkills.reduce((sum, row) => sum + (row.skill.luckyRate / 100) * row.skill.hits * cappedCoverageRatio, 0),
        hits,
      ),
      skills: matchingSkills
        .map((row) => buildSkillRow(source, row.skill, row.match, playerTotal, sourceTotal, cappedCoveragePct, elapsedSecs))
        .sort((a, b) => b.totalDmg - a.totalDmg),
    });
  }

  return allocateModifierOverlap(result, playerTotal, elapsedSecs)
    .map((row) => ({
      ...row,
      skills: row.skills.filter((skill) => skill.hits > 0),
    }))
    .filter((row) => row.hits > 0 && row.skills.length > 0)
    .sort((left, right) =>
      right.totalDmg - left.totalDmg
      || right.hits - left.hits
      || sourceSortName(left).localeCompare(sourceSortName(right)),
    );
}

export function resolveModifierSourceName(row: ModifierActivityRow, locale: string): string {
  return resolveLocalizedText(row.sourceNames, locale, row.sourceName);
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
