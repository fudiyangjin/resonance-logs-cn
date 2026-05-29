import type {
  HistoryEntityData,
  ModifierHitBucketState,
  ModifierReplayHitState,
  RawSkillStats,
} from "$lib/bindings";
import type {
  ModifierActivityRow,
  ModifierActivityScope,
  ModifierActorFilter,
  ModifierActivitySkillRow,
  ModifierActorSummary,
  ModifierContributionComponentActorScope,
  ModifierContributionComponentValueScope,
  ModifierResolvedContributionComponentValue,
  ModifierSourceActor,
  ModifierSourceClassification,
} from "$lib/history-modifier-report-display";

type FastSkillAggregate = {
  skillId: number;
  damageIds: Set<number>;
  matches: Set<"direct-static-target" | "no-static-target">;
  totalDmg: number;
  effectiveTotal: number;
  hits: number;
  critHits: number;
  critTotal: number;
  luckyHits: number;
  luckyTotal: number;
  bucketCount: number;
  singleHitBucketCount: number;
  mixedCritBucketCount: number;
  mixedLuckyBucketCount: number;
  targetUids: Set<number>;
  targetMonsterTypeIds: Set<number>;
  attackerUids: Set<number>;
  originalAttackerUids: Set<number>;
  topSummonerUids: Set<number>;
  properties: Set<number>;
  damageModes: Set<number>;
  attackerAttrIds: Set<number>;
  targetAttrIds: Set<number>;
  replayWindowCount: number;
  firstHitTimeMs: number | null;
  lastHitTimeMs: number | null;
};

type CatalogTalentOwnership = NonNullable<ModifierActivityRow["talentOwnership"]> & {
  allowedSpecIds?: number[];
  blacklistedSpecIds?: number[];
};

type FastSourceAggregate = {
  key: string;
  sourceRuleId?: string;
  sourceRuleIds: Set<string>;
  sourceId: string;
  sourceIds: Set<string>;
  sourceKind: string;
  sourceType?: string;
  sourceEntityId?: number;
  sourceName: string;
  sourceNames?: Record<string, string>;
  description?: string;
  descriptions?: Record<string, string>;
  iconPath?: string;
  runtimeDetection?: string;
  providerAggregation?: "actor-kind" | "source-uid";
  displayOwnerKind?: "battle-imagine";
  buffIds: Set<number>;
  evidence: Set<string>;
  attributionModel?: ModifierActivityRow["attributionModel"];
  contributionModel?: ModifierActivityRow["contributionModel"];
  talentOwnership?: CatalogTalentOwnership;
  classification?: ModifierSourceClassification;
  actorSummary: ModifierActorSummary;
  matches: Set<"direct-static-target" | "no-static-target">;
  targetDamageIds: Set<number>;
  targetRecountIds: Set<number>;
  skills: Map<string, FastSkillAggregate>;
};

type ModifierSourceCatalogEntry = {
  sourceRuleId?: string;
  sourceId: string;
  sourceKind?: string;
  sourceType?: string;
  sourceEntityId?: number;
  sourceName?: string;
  sourceNames?: Record<string, string>;
  description?: string;
  descriptions?: Record<string, string>;
  iconPath?: string;
  runtimeDetection?: string;
  providerAggregation?: "actor-kind" | "source-uid";
  displayOwnerKind?: "battle-imagine";
  buffIds?: number[];
  evidence?: string[];
  reportPolicy?: "include" | "debug-only" | "ignore";
  runtimeSourceConfigIds?: number[];
  runtimeBaseIds?: number[];
  rowPolicy?: string;
  contributionStatus?: string;
  formulaZoneIds?: string[];
  contributionGroups?: string[];
  predicateTags?: string[];
  relationshipKinds?: string[];
  componentClasses?: string[];
  attributionModel?: ModifierActivityRow["attributionModel"];
  contributionModel?: ModifierActivityRow["contributionModel"];
  talentOwnership?: CatalogTalentOwnership;
  classification?: ModifierSourceClassification;
  uidEdges?: ModifierSourceUidEdge[];
  targetDamageIds?: number[];
  targetRecountIds?: number[];
};

type ModifierSourceUidEdge = {
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

type ModifierSourceCatalog = {
  byBuffId?: Record<string, ModifierSourceCatalogEntry[]>;
  activeEntries?: ModifierSourceCatalogEntry[];
  ignoredBuffIds?: number[];
  reportableBuffIds?: number[];
  ownerClassId?: number;
  ownerSpecIds?: number[];
};

type HistoryEntityDataWithCatalog = HistoryEntityData & {
  modifierSourceCatalog?: ModifierSourceCatalog;
  modifierSourceActors?: ModifierSourceActor[];
};

type ActiveFactorItem = HistoryEntityData["activeFactorItems"][number];

type BucketSourceMatch = {
  entry: ModifierSourceCatalogEntry;
  match: "direct-static-target" | "no-static-target";
  selectedFactorItem?: ActiveFactorItem | null;
};

type ActiveRuntimeEntry = {
  entry: ModifierSourceCatalogEntry;
  selectedFactorItem: ActiveFactorItem | null;
};

type FormulaReplayComponentEstimate = NonNullable<
  NonNullable<ModifierActivityRow["formulaReplayModel"]>["replayedComponents"]
>[number];

type FormulaReplayContributionEstimate = {
  contributionTotal: number;
  counterfactualTotal: number;
  observedTotal: number;
  sampledHitCount: number;
  appliedHitCount: number;
  components: FormulaReplayComponentEstimate[];
  skippedComponents: string[];
};

const ATTR_ATTACK_POWER = 0x32;
const ATTR_DEFENSE_POWER = 0x33;
const ATTR_ELITE_STATUS = 0xb6;
const ATTR_PHYSICAL_ATTACK = 0x106;
const ATTR_MAGIC_ATTACK = 0x107;
const ATTR_CRIT_DAMAGE = 0x2b66;
const ELEMENTAL_RESIST_ATTR_IDS = new Set([0x3372, 0x3373, 0x3374]);

function dedupeSourceMatches(matches: BucketSourceMatch[]): BucketSourceMatch[] {
  const out: BucketSourceMatch[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const key = `${match.entry.sourceRuleId ?? match.entry.sourceId}:${match.match}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

function finitePositiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function safePct(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return (value / total) * 100;
}

function rate(count: number, total: number): number {
  return safePct(count, total);
}

function perMinute(value: number, elapsedSecs: number): number {
  return elapsedSecs > 0 ? value / (elapsedSecs / 60) : 0;
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].filter(Number.isFinite).sort((a, b) => a - b);
}

function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function addPositiveToSet(target: Set<number>, value: unknown): void {
  const parsed = finitePositiveNumber(value);
  if (parsed !== null) target.add(parsed);
}

function createFastSkillAggregate(skillId: number, damageIds: Iterable<number> = []): FastSkillAggregate {
  return {
    skillId,
    damageIds: new Set([...damageIds].filter(Number.isFinite)),
    matches: new Set(),
    totalDmg: 0,
    effectiveTotal: 0,
    hits: 0,
    critHits: 0,
    critTotal: 0,
    luckyHits: 0,
    luckyTotal: 0,
    bucketCount: 0,
    singleHitBucketCount: 0,
    mixedCritBucketCount: 0,
    mixedLuckyBucketCount: 0,
    targetUids: new Set(),
    targetMonsterTypeIds: new Set(),
    attackerUids: new Set(),
    originalAttackerUids: new Set(),
    topSummonerUids: new Set(),
    properties: new Set(),
    damageModes: new Set(),
    attackerAttrIds: new Set(),
    targetAttrIds: new Set(),
    replayWindowCount: 0,
    firstHitTimeMs: null,
    lastHitTimeMs: null,
  };
}

function lookupDamageName(skillId: number): string {
  return `Skill ${skillId}`;
}

function rawSkillForId(entity: HistoryEntityData, skillId: number, damageIds: number[]): RawSkillStats | undefined {
  const bySkill = entity.dmgSkills?.[skillId];
  if (bySkill) return bySkill;
  for (const damageId of damageIds) {
    const byDamage = entity.dmgSkills?.[damageId];
    if (byDamage) return byDamage;
  }
  return undefined;
}

function skillIdForBucket(bucket: ModifierHitBucketState): number | null {
  return finitePositiveNumber(bucket.skillKey) ?? finitePositiveNumber(bucket.damageId);
}

function damageIdsForBucket(bucket: ModifierHitBucketState, skillId: number): number[] {
  const damageId = finitePositiveNumber(bucket.damageId);
  return damageId !== null ? [damageId] : [skillId];
}

function preferredSourceBuffId(bucket: ModifierHitBucketState): number | null {
  return finitePositiveNumber(bucket.modifierSourceConfigId)
    ?? finitePositiveNumber(bucket.modifierBaseId);
}

function bucketBuffIds(bucket: ModifierHitBucketState): number[] {
  const ids = new Set<number>();
  const baseId = finitePositiveNumber(bucket.modifierBaseId);
  const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
  if (baseId !== null) ids.add(baseId);
  if (sourceConfigId !== null) ids.add(sourceConfigId);
  return sortedNumbers(ids);
}

function normalizeSourceNameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

function localizedCatalogName(entry: ModifierSourceCatalogEntry): string {
  const placeholderBuffId = typeof entry.sourceEntityId === "number" ? entry.sourceEntityId : entry.buffIds?.[0];
  for (const value of [
    entry.sourceNames?.["en"],
    entry.sourceNames?.["zh-CN"],
    entry.sourceNames?.["design"],
    entry.sourceName,
    ...Object.values(entry.sourceNames ?? {}),
  ]) {
    const text = value?.trim() ?? "";
    if (text && !isGeneratedUnmappedBuffLabel(text, placeholderBuffId)) return text;
  }
  return entry.sourceName?.trim() || entry.sourceId;
}

function sourceGroupKeyForEntry(entry: ModifierSourceCatalogEntry): string {
  const name = normalizeSourceNameKey(localizedCatalogName(entry));
  const id = normalizeSourceNameKey(entry.sourceId);
  const isRawFallback = (entry.sourceKind === "observed-buff" || entry.sourceKind === "active-buff")
    && /^buff \d+$/.test(name);
  if (name && name !== id && !isRawFallback) {
    return ["source-name", entry.sourceKind ?? "", entry.sourceType ?? "", name].join("|");
  }
  if (typeof entry.sourceEntityId === "number" && Number.isFinite(entry.sourceEntityId)) {
    return ["source-entity", entry.sourceKind ?? "", entry.sourceType ?? "", entry.sourceEntityId].join("|");
  }
  return entry.sourceId;
}

function sourceActorGroupKey(
  entityUid: number,
  bucket: ModifierHitBucketState,
  actorIndex: Map<number, ModifierSourceActor>,
): string {
  const sourceUid = finitePositiveNumber(bucket.modifierSourceUid);
  if (sourceUid === null) return "actor:unknown";
  const known = actorIndex.get(sourceUid);
  return sourceUid === entityUid || known?.ownerUid === entityUid ? "actor:self" : "actor:external";
}

function sourceProviderGroupKey(
  entityUid: number,
  bucket: ModifierHitBucketState,
  entry: ModifierSourceCatalogEntry,
  actorIndex: Map<number, ModifierSourceActor>,
): string {
  const policy = entry.providerAggregation ?? entry.classification?.providerAggregation ?? "source-uid";
  if (policy === "actor-kind") return sourceActorGroupKey(entityUid, bucket, actorIndex);
  return [
    "actor:source-uid",
    finitePositiveNumber(bucket.modifierHostUid) ?? 0,
    finitePositiveNumber(bucket.modifierSourceUid) ?? 0,
  ].join(":");
}

function sourceKeyForEntry(
  entityUid: number,
  bucket: ModifierHitBucketState,
  entry: ModifierSourceCatalogEntry,
  actorIndex: Map<number, ModifierSourceActor>,
): string {
  return [
    sourceGroupKeyForEntry(entry),
    sourceProviderGroupKey(entityUid, bucket, entry, actorIndex),
  ].join(":");
}

function sourceKeyForActiveOnlyEntry(entry: ModifierSourceCatalogEntry): string {
  return [sourceGroupKeyForEntry(entry), "actor:self"].join(":");
}

function isGenericActorName(name: string | undefined, uid: number): boolean {
  const trimmed = name?.trim() ?? "";
  return !trimmed || trimmed === `#${uid}`;
}

function mergeActorRef(left: ModifierSourceActor, right: ModifierSourceActor): ModifierSourceActor {
  const name = isGenericActorName(left.name, left.uid) && !isGenericActorName(right.name, right.uid)
    ? right.name
    : left.name;
  const merged: ModifierSourceActor = {
    uid: left.uid,
    name,
    sourceConfigIds: sortedNumbers(new Set([...(left.sourceConfigIds ?? []), ...(right.sourceConfigIds ?? [])])),
    baseIds: sortedNumbers(new Set([...(left.baseIds ?? []), ...(right.baseIds ?? [])])),
  };
  const entityType = left.entityType ?? right.entityType;
  const ownerUid = left.ownerUid ?? right.ownerUid;
  const ownerName = left.ownerName ?? right.ownerName;
  if (entityType) merged.entityType = entityType;
  if (ownerUid !== undefined) merged.ownerUid = ownerUid;
  if (ownerName) merged.ownerName = ownerName;
  return merged;
}

function mergeActorRefs(left: ModifierSourceActor[], right: ModifierSourceActor[]): ModifierSourceActor[] {
  const byUid = new Map<number, ModifierSourceActor>();
  for (const actor of [...left, ...right]) {
    const uid = finitePositiveNumber(actor.uid);
    if (uid === null) continue;
    const normalized: ModifierSourceActor = {
      ...actor,
      uid,
      name: actor.name?.trim() || `#${uid}`,
      sourceConfigIds: sortedNumbers(actor.sourceConfigIds ?? []),
      baseIds: sortedNumbers(actor.baseIds ?? []),
    };
    const existing = byUid.get(uid);
    byUid.set(uid, existing ? mergeActorRef(existing, normalized) : normalized);
  }
  return [...byUid.values()].sort((leftActor, rightActor) => leftActor.uid - rightActor.uid);
}

function sourceActorIndexForEntity(entity: HistoryEntityData): Map<number, ModifierSourceActor> {
  const index = new Map<number, ModifierSourceActor>();
  for (const actor of (entity as HistoryEntityDataWithCatalog).modifierSourceActors ?? []) {
    const uid = finitePositiveNumber(actor.uid);
    if (uid === null) continue;
    index.set(uid, {
      uid,
      name: actor.name?.trim() || `#${uid}`,
      ...(actor.entityType ? { entityType: actor.entityType } : {}),
      ...(actor.ownerUid !== undefined ? { ownerUid: actor.ownerUid } : {}),
      ...(actor.ownerName ? { ownerName: actor.ownerName } : {}),
      sourceConfigIds: sortedNumbers(actor.sourceConfigIds ?? []),
      baseIds: sortedNumbers(actor.baseIds ?? []),
    });
  }
  return index;
}

function actorRefForBucket(
  actorIndex: Map<number, ModifierSourceActor>,
  bucket: ModifierHitBucketState,
  uid: number,
): ModifierSourceActor {
  const known = actorIndex.get(uid);
  const sourceConfigId = finitePositiveNumber(bucket.modifierSourceConfigId);
  const baseId = finitePositiveNumber(bucket.modifierBaseId);
  return mergeActorRef(
    {
      uid,
      name: known?.name?.trim() || `#${uid}`,
      ...(known?.entityType ? { entityType: known.entityType } : {}),
      ...(known?.ownerUid !== undefined ? { ownerUid: known.ownerUid } : {}),
      ...(known?.ownerName ? { ownerName: known.ownerName } : {}),
      sourceConfigIds: known?.sourceConfigIds ?? [],
      baseIds: known?.baseIds ?? [],
    },
    {
      uid,
      name: `#${uid}`,
      sourceConfigIds: sourceConfigId !== null ? [sourceConfigId] : [],
      baseIds: baseId !== null ? [baseId] : [],
    },
  );
}

function actorSummaryForBucket(
  entityUid: number,
  bucket: ModifierHitBucketState,
  actorIndex: Map<number, ModifierSourceActor>,
): ModifierActorSummary {
  const hostUids = sortedNumbers([bucket.modifierHostUid].filter((uid) => uid > 0));
  const sourceUids = sortedNumbers([bucket.modifierSourceUid].filter((uid) => uid > 0));
  const sourceActors = mergeActorRefs([], sourceUids.map((uid) => actorRefForBucket(actorIndex, bucket, uid)));
  const selfSourceActors = sourceActors.filter((actor) => actor.uid === entityUid || actor.ownerUid === entityUid);
  const externalSourceActors = sourceActors.filter((actor) => actor.uid !== entityUid && actor.ownerUid !== entityUid);
  const selfActorUids = new Set(selfSourceActors.map((actor) => actor.uid));
  const externalActorUids = new Set(externalSourceActors.map((actor) => actor.uid));
  return {
    hostUids,
    sourceUids,
    externalSourceUids: sourceUids.filter((uid) => externalActorUids.has(uid)),
    selfSourceUids: sourceUids.filter((uid) => selfActorUids.has(uid)),
    sourceActors,
    externalSourceActors,
    selfSourceActors,
  };
}

function selfActorSummaryForEntity(entity: HistoryEntityData): ModifierActorSummary {
  const uid = finitePositiveNumber(entity.uid) ?? 0;
  const actor: ModifierSourceActor = {
    uid,
    name: entity.name?.trim() || `#${uid}`,
  };
  return {
    hostUids: uid > 0 ? [uid] : [],
    sourceUids: uid > 0 ? [uid] : [],
    externalSourceUids: [],
    selfSourceUids: uid > 0 ? [uid] : [],
    sourceActors: uid > 0 ? [actor] : [],
    externalSourceActors: [],
    selfSourceActors: uid > 0 ? [actor] : [],
  };
}

function actorMatchesFilter(actorSummary: ModifierActorSummary, actorFilter: ModifierActorFilter): boolean {
  return actorFilter !== "external" || actorSummary.externalSourceUids.length > 0;
}

function mergeActorSummary(target: ModifierActorSummary, source: ModifierActorSummary): ModifierActorSummary {
  return {
    hostUids: sortedNumbers(new Set([...target.hostUids, ...source.hostUids])),
    sourceUids: sortedNumbers(new Set([...target.sourceUids, ...source.sourceUids])),
    externalSourceUids: sortedNumbers(new Set([...target.externalSourceUids, ...source.externalSourceUids])),
    selfSourceUids: sortedNumbers(new Set([...target.selfSourceUids, ...source.selfSourceUids])),
    sourceActors: mergeActorRefs(target.sourceActors ?? [], source.sourceActors ?? []),
    externalSourceActors: mergeActorRefs(target.externalSourceActors ?? [], source.externalSourceActors ?? []),
    selfSourceActors: mergeActorRefs(target.selfSourceActors ?? [], source.selfSourceActors ?? []),
  };
}

function aggregateBucketIntoSkill(
  aggregate: FastSkillAggregate,
  bucket: ModifierHitBucketState,
  collectReplayEvidence: boolean,
): void {
  const damageId = finitePositiveNumber(bucket.damageId);
  if (damageId !== null) aggregate.damageIds.add(damageId);
  const hits = Number(bucket.hits) || 0;
  const critHits = Number(bucket.critHits) || 0;
  const luckyHits = Number(bucket.luckyHits) || 0;
  aggregate.totalDmg += Number(bucket.totalValue) || 0;
  aggregate.effectiveTotal += Number(bucket.effectiveTotalValue) || 0;
  aggregate.hits += hits;
  aggregate.critHits += critHits;
  aggregate.critTotal += Number(bucket.critTotalValue) || 0;
  aggregate.luckyHits += luckyHits;
  aggregate.luckyTotal += Number(bucket.luckyTotalValue) || 0;
  if (!collectReplayEvidence) return;
  aggregate.bucketCount += 1;
  if (hits === 1) aggregate.singleHitBucketCount += 1;
  if (hits > 1 && critHits > 0 && critHits < hits) aggregate.mixedCritBucketCount += 1;
  if (hits > 1 && luckyHits > 0 && luckyHits < hits) aggregate.mixedLuckyBucketCount += 1;
  addPositiveToSet(aggregate.targetUids, bucket.targetUid);
  addPositiveToSet(aggregate.targetMonsterTypeIds, bucket.targetMonsterTypeId);
  addPositiveToSet(aggregate.attackerUids, bucket.attackerUid);
  addPositiveToSet(aggregate.originalAttackerUids, bucket.originalAttackerUid);
  addPositiveToSet(aggregate.topSummonerUids, bucket.topSummonerUid);
  addPositiveToSet(aggregate.properties, bucket.property);
  addPositiveToSet(aggregate.damageModes, bucket.damageMode);
  const firstHit = finitePositiveNumber(bucket.firstHitTimeMs);
  const lastHit = finitePositiveNumber(bucket.lastHitTimeMs);
  if (firstHit !== null) aggregate.firstHitTimeMs = aggregate.firstHitTimeMs === null
    ? firstHit
    : Math.min(aggregate.firstHitTimeMs, firstHit);
  if (lastHit !== null) aggregate.lastHitTimeMs = aggregate.lastHitTimeMs === null
    ? lastHit
    : Math.max(aggregate.lastHitTimeMs, lastHit);
}

function replayHitMatchesActor(source: FastSourceAggregate, replaySource: ModifierReplayHitState["activeModifiers"][number]): boolean {
  const hostUid = finitePositiveNumber(replaySource.modifierHostUid);
  const sourceUid = finitePositiveNumber(replaySource.modifierSourceUid);
  const knownHostUids = new Set(source.actorSummary.hostUids);
  const knownSourceUids = new Set(source.actorSummary.sourceUids);
  return (knownHostUids.size === 0 || hostUid === null || knownHostUids.has(hostUid))
    && (knownSourceUids.size === 0 || sourceUid === null || knownSourceUids.has(sourceUid));
}

function replayHitMatchesSource(source: FastSourceAggregate, hit: ModifierReplayHitState): boolean {
  if (hit.isHeal) return false;
  for (const replaySource of hit.activeModifiers ?? []) {
    const baseId = finitePositiveNumber(replaySource.modifierBaseId);
    const sourceConfigId = finitePositiveNumber(replaySource.modifierSourceConfigId);
    const idMatches = (baseId !== null && source.buffIds.has(baseId))
      || (sourceConfigId !== null && source.buffIds.has(sourceConfigId));
    if (idMatches && replayHitMatchesActor(source, replaySource)) return true;
  }
  return false;
}

function aggregateReplayHitIntoSkill(aggregate: FastSkillAggregate, hit: ModifierReplayHitState): void {
  const damageId = finitePositiveNumber(hit.damageId);
  if (damageId !== null) aggregate.damageIds.add(damageId);
  aggregate.totalDmg += Number(hit.value) || 0;
  aggregate.effectiveTotal += Number(hit.effectiveValue) || 0;
  aggregate.hits += 1;
  if (hit.isCrit) {
    aggregate.critHits += 1;
    aggregate.critTotal += Number(hit.value) || 0;
  }
  if (hit.isLucky) {
    aggregate.luckyHits += 1;
    aggregate.luckyTotal += Number(hit.value) || 0;
  }
  aggregate.bucketCount += 1;
  aggregate.singleHitBucketCount += 1;
  aggregate.replayWindowCount += (hit.activeModifiers ?? []).length > 0 ? 1 : 0;
  addPositiveToSet(aggregate.targetUids, hit.targetUid);
  addPositiveToSet(aggregate.targetMonsterTypeIds, hit.targetMonsterTypeId);
  addPositiveToSet(aggregate.attackerUids, hit.attackerUid);
  addPositiveToSet(aggregate.originalAttackerUids, hit.originalAttackerUid);
  addPositiveToSet(aggregate.topSummonerUids, hit.topSummonerUid);
  addPositiveToSet(aggregate.properties, hit.property);
  addPositiveToSet(aggregate.damageModes, hit.damageMode);
  for (const attr of hit.attackerAttrs ?? []) addPositiveToSet(aggregate.attackerAttrIds, attr.attrId);
  for (const attr of hit.targetAttrs ?? []) addPositiveToSet(aggregate.targetAttrIds, attr.attrId);
  const timestamp = finitePositiveNumber(hit.timestampMs);
  if (timestamp !== null) {
    aggregate.firstHitTimeMs = aggregate.firstHitTimeMs === null
      ? timestamp
      : Math.min(aggregate.firstHitTimeMs, timestamp);
    aggregate.lastHitTimeMs = aggregate.lastHitTimeMs === null
      ? timestamp
      : Math.max(aggregate.lastHitTimeMs, timestamp);
  }
}

function replayAggregateForSource(
  source: FastSourceAggregate,
  replayHits: ModifierReplayHitState[],
  targetUid: number | null | undefined,
): FastSkillAggregate | undefined {
  let aggregate: FastSkillAggregate | undefined;
  for (const hit of replayHits) {
    if (targetUid !== null && targetUid !== undefined && hit.targetUid !== targetUid) continue;
    if (!replayHitMatchesSource(source, hit)) continue;
    const skillId = finitePositiveNumber(hit.skillKey) ?? finitePositiveNumber(hit.damageId);
    if (skillId === null) continue;
    if (!aggregate) aggregate = createFastSkillAggregate(skillId);
    if (aggregate.skillId <= 0) aggregate.skillId = skillId;
    aggregateReplayHitIntoSkill(aggregate, hit);
  }
  return aggregate && aggregate.hits > 0 ? aggregate : undefined;
}

function catalogForEntity(entity: HistoryEntityData): ModifierSourceCatalog | undefined {
  return (entity as HistoryEntityDataWithCatalog).modifierSourceCatalog;
}

function reportableBuffIdsForCatalog(catalog: ModifierSourceCatalog | undefined): Set<number> | null {
  const ids = catalog?.reportableBuffIds;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  return new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0));
}

function bucketMatchesReportableIds(bucket: ModifierHitBucketState, reportableBuffIds: Set<number> | null): boolean {
  if (!reportableBuffIds) return true;
  return bucketBuffIds(bucket).some((buffId) => reportableBuffIds.has(buffId));
}

function positiveNumberSet(values: Iterable<unknown> | undefined): Set<number> {
  const out = new Set<number>();
  for (const value of values ?? []) {
    const parsed = finitePositiveNumber(value);
    if (parsed !== null) out.add(parsed);
  }
  return out;
}

function entryHasStaticTargets(entry: ModifierSourceCatalogEntry): boolean {
  return (entry.targetDamageIds?.length ?? 0) > 0 || (entry.targetRecountIds?.length ?? 0) > 0;
}

const RUNTIME_WINDOW_ROW_POLICIES = new Set(["formula", "timing", "uptime"]);
const RUNTIME_WINDOW_GROUPS = new Set([
  "baseattack",
  "critical",
  "elemental",
  "finaldamage",
  "genericdamage",
  "hittiming",
  "physicalmagicenhancement",
  "seasondamage",
  "seasonsuppression",
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
const PURE_PROC_SOURCE_KINDS = new Set([
  "buff-proc",
  "lucky-strike",
  "skill-proc",
  "talent-passive",
  "talent-skill",
]);

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

function isSelectedFactorCatalogEntry(entry: ModifierSourceCatalogEntry): boolean {
  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  if (sourceKind !== "phantom-factor") return false;
  const runtimeDetection = String(entry.runtimeDetection ?? "").toLowerCase();
  return runtimeDetection.includes("selected-factor-grade-item");
}

function isReportVisibleCatalogEntry(entry: ModifierSourceCatalogEntry): boolean {
  return (entry.reportPolicy ?? "include") === "include"
    || isRuntimeWindowCatalogEntry(entry)
    || isSelectedFactorCatalogEntry(entry);
}

function isRuntimeProvenActiveCatalogEntry(entry: ModifierSourceCatalogEntry): boolean {
  if ((entry.reportPolicy ?? "include") === "ignore") return false;
  if (isReportVisibleCatalogEntry(entry)) return true;

  const sourceId = String(entry.sourceId ?? "").toLowerCase();
  const kind = String(entry.sourceKind ?? "").toLowerCase();
  const type = String(entry.sourceType ?? "").toLowerCase();
  if (sourceId.startsWith("observed-buff:")) return false;
  if (kind === "runtime-buff" && type.includes("observed")) return false;

  return kind.includes("talent")
    || type.includes("talent")
    || kind === "season-talent-node"
    || kind === "phantom-factor"
    || kind === "set-effect";
}

function isPureProducedDamageEntry(entry: ModifierSourceCatalogEntry): boolean {
  const sourceType = String(entry.sourceType ?? "").toLowerCase();
  if (sourceType.includes("debuff")) return false;
  const rowModel = String(entry.classification?.rowModel ?? "").toLowerCase();
  const offensiveKind = String(entry.classification?.offensiveKind ?? "").toLowerCase();
  if (rowModel === "proc-damage" || offensiveKind === "produced-proc") return true;

  const rowPolicy = String(entry.rowPolicy ?? "").toLowerCase();
  if (rowPolicy !== "static-target") return false;

  const groups = entryContributionGroups(entry);
  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  const status = String(
    entry.contributionStatus
      ?? entry.attributionModel?.status
      ?? "",
  ).toLowerCase();

  if (status === "proc-damage") return true;
  if (groups.includes("procdamage") && PURE_PROC_SOURCE_KINDS.has(sourceKind)) return true;
  return groups.length > 0 && groups.every((group) => group === "procdamage");
}

function entryAllowedForDamageReport(entry: ModifierSourceCatalogEntry): boolean {
  const classification = entry.classification;
  if (!classification) return true;
  const domains = new Set((classification.reportDomains ?? []).map((domain) => String(domain).toLowerCase()));
  if (domains.size === 0) return true;
  if (domains.has("damage") || domains.has("support") || domains.has("unknown")) return true;

  const role = String(classification.primaryRole ?? "").toLowerCase();
  return role === "offensive" || role === "supportive" || role === "unknown";
}

function entryVisibleForScope(entry: ModifierSourceCatalogEntry, scope: ModifierActivityScope): boolean {
  if (scope !== "all-active") return true;
  return !isPureProducedDamageEntry(entry);
}

function sourceEntityIdFromSourceId(sourceId: unknown): number | null {
  const match = String(sourceId ?? "").match(/:(\d+)(?:$|\|)/);
  return match ? finitePositiveNumber(match[1]) : null;
}

function activeTalentSourceEntityIds(entity: HistoryEntityData): Set<number> {
  const ids = new Set<number>();
  for (const source of entity.activeEffectSources ?? []) {
    const sourceId = String(source.sourceId ?? "").trim().toLowerCase();
    if (!sourceId.startsWith("talent:")) continue;
    const sourceEntityId = finitePositiveNumber(source.sourceEntityId) ?? sourceEntityIdFromSourceId(sourceId);
    if (sourceEntityId !== null) ids.add(sourceEntityId);
  }
  return ids;
}

function selectedProfessionTalentEntityIds(entity: HistoryEntityData): Set<number> {
  const exactActiveTalentIds = activeTalentSourceEntityIds(entity);
  if (exactActiveTalentIds.size > 0) return exactActiveTalentIds;

  const ids = new Set<number>();
  for (const talent of entity.activeProfessionTalents ?? []) {
    const professionId = finitePositiveNumber(talent.professionId);
    if (professionId !== null && entity.classId > 0 && professionId !== entity.classId) continue;
    const stageCfgId = finitePositiveNumber(talent.talentStageCfgId);
    if (stageCfgId !== null) ids.add(stageCfgId);
  }
  return ids;
}

function explicitSeasonTalentSourceIds(entity: HistoryEntityData): Set<string> {
  const ids = new Set<string>();
  for (const source of entity.activeEffectSources ?? []) {
    const sourceId = String(source.sourceId ?? "").trim().toLowerCase();
    if (!sourceId.startsWith("season-talent-node:")) continue;
    const runtimeSource = String(source.runtimeSource ?? "");
    if (!runtimeSource.includes("season_medal_info") || !runtimeSource.includes("choose")) continue;
    ids.add(sourceId);
  }
  return ids;
}

function entryRequiresSelectedTalentEvidence(entry: ModifierSourceCatalogEntry): boolean {
  return entry.talentOwnership?.parserPolicy?.selectedTalentEvidenceRequired === true;
}

function entryHasSelectedProfessionTalentEvidence(entity: HistoryEntityData, entry: ModifierSourceCatalogEntry): boolean {
  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  const sourceType = String(entry.sourceType ?? "").toLowerCase();
  if (!sourceKind.includes("talent") && !sourceType.includes("talent")) return true;
  const sourceEntityId = finitePositiveNumber(entry.sourceEntityId) ?? sourceEntityIdFromSourceId(entry.sourceId);
  if (sourceEntityId === null) return false;
  return selectedProfessionTalentEntityIds(entity).has(sourceEntityId);
}

function entryHasSelectedSeasonTalentEvidence(entity: HistoryEntityData, entry: ModifierSourceCatalogEntry): boolean {
  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  if (sourceKind !== "season-talent-node") return true;
  const explicitSourceIds = explicitSeasonTalentSourceIds(entity);
  if (explicitSourceIds.size === 0) return true;
  const sourceId = String(entry.sourceId ?? "").trim().toLowerCase();
  if (sourceId && explicitSourceIds.has(sourceId)) return true;
  const sourceEntityId = finitePositiveNumber(entry.sourceEntityId) ?? sourceEntityIdFromSourceId(sourceId);
  return sourceEntityId !== null && explicitSourceIds.has(`season-talent-node:${sourceEntityId}`);
}

function entryAllowedForSelectedRuntimeEvidence(entity: HistoryEntityData, entry: ModifierSourceCatalogEntry): boolean {
  if (!entryHasSelectedSeasonTalentEvidence(entity, entry)) return false;
  if (entryRequiresSelectedTalentEvidence(entry) && !entryHasSelectedProfessionTalentEvidence(entity, entry)) {
    return false;
  }
  return true;
}

function entryPhantomFactorBuffIds(entry: ModifierSourceCatalogEntry): number[] {
  const ids = new Set<number>();
  const sourceMatch = entry.sourceId?.match(/^phantom-factor:(\d+)(?:$|\|)/);
  const sourceId = sourceMatch ? finitePositiveNumber(sourceMatch[1]) : null;
  if (sourceId !== null) ids.add(sourceId);
  const sourceEntityId = finitePositiveNumber(entry.sourceEntityId);
  if (sourceEntityId !== null) ids.add(sourceEntityId);
  for (const id of [
    ...(entry.buffIds ?? []),
    ...(entry.runtimeBaseIds ?? []),
    ...(entry.runtimeSourceConfigIds ?? []),
  ]) {
    const parsed = finitePositiveNumber(id);
    if (parsed !== null) ids.add(parsed);
  }
  return sortedNumbers(ids);
}

function selectedFactorItemForEntry(
  entity: HistoryEntityData,
  entry: ModifierSourceCatalogEntry,
): ActiveFactorItem | null {
  const factorIds = new Set(entryPhantomFactorBuffIds(entry));
  if (factorIds.size === 0) return null;
  for (const item of entity.activeFactorItems ?? []) {
    if (!isPacketSelectedFactorGradeItem(item)) continue;
    const factorBuffId = finitePositiveNumber(item.factorBuffId);
    if (factorBuffId !== null && factorIds.has(factorBuffId)) return item;
  }
  return null;
}

function isPacketSelectedFactorGradeItem(item: ActiveFactorItem | null | undefined): boolean {
  return String(item?.runtimeSource ?? "").startsWith("SyncContainerDirtyData.v_data.dirty_tree.");
}

function hasSelectedFactorItem(entity: HistoryEntityData, entry: ModifierSourceCatalogEntry): boolean {
  return selectedFactorItemForEntry(entity, entry) !== null;
}

function hasActiveFactorBuff(entity: HistoryEntityData, entry: ModifierSourceCatalogEntry): boolean {
  const factorIds = new Set(entryPhantomFactorBuffIds(entry));
  if (factorIds.size === 0) return false;
  for (const buff of entity.activeFactorBuffs ?? []) {
    const factorBuffId = finitePositiveNumber(buff.factorBuffId);
    const observedBuffId = finitePositiveNumber(buff.observedBuffId);
    const sourceConfigId = finitePositiveNumber(buff.sourceConfigId);
    if (
      (factorBuffId !== null && factorIds.has(factorBuffId)) ||
      (observedBuffId !== null && factorIds.has(observedBuffId)) ||
      (sourceConfigId !== null && factorIds.has(sourceConfigId))
    ) {
      return true;
    }
  }
  return false;
}

function selectedFactorGradeSuffix(item: ActiveFactorItem | null | undefined): string {
  const grade = finitePositiveNumber(item?.grade);
  return grade !== null ? ` G${grade}` : "";
}

function selectedFactorSourceName(
  entry: ModifierSourceCatalogEntry,
  selectedFactorItem: ActiveFactorItem | null | undefined,
): string {
  return `${localizedCatalogName(entry)}${selectedFactorGradeSuffix(selectedFactorItem)}`;
}

function selectedFactorSourceNames(
  entry: ModifierSourceCatalogEntry,
  selectedFactorItem: ActiveFactorItem | null | undefined,
): Record<string, string> | undefined {
  const suffix = selectedFactorGradeSuffix(selectedFactorItem);
  if (!suffix || !entry.sourceNames) return entry.sourceNames;
  return Object.fromEntries(
    Object.entries(entry.sourceNames).map(([locale, value]) => [locale, `${value}${suffix}`]),
  );
}

function entryAllowedForFactorSelectorEvidence(
  entity: HistoryEntityData,
  entry: ModifierSourceCatalogEntry,
): boolean {
  if (entry.sourceKind !== "phantom-factor") return true;
  if (entryHasStaticTargets(entry)) return true;
  return hasSelectedFactorItem(entity, entry) || hasActiveFactorBuff(entity, entry);
}

function entryAllowsActiveOnlyStaticFallback(
  entity: HistoryEntityData,
  entry: ModifierSourceCatalogEntry,
): boolean {
  return entry.sourceKind === "phantom-factor"
    && (hasSelectedFactorItem(entity, entry) || hasActiveFactorBuff(entity, entry));
}

function activeRuntimeEvidenceIds(entity: HistoryEntityData): Set<number> {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const id = finitePositiveNumber(value);
    if (id !== null) ids.add(id);
  };

  for (const buff of entity.activeBuffs ?? []) {
    add(buff.baseId);
    add(buff.sourceConfigId);
  }
  for (const buff of entity.activeEffectBuffs ?? []) {
    add(buff.effectSourceBuffId);
    add(buff.observedBuffId);
    add(buff.sourceConfigId);
  }
  for (const buff of entity.activeFactorBuffs ?? []) {
    add(buff.factorBuffId);
    add(buff.observedBuffId);
    add(buff.sourceConfigId);
  }
  for (const window of entity.modifierWindows ?? []) {
    add(window.baseId);
    add(window.sourceConfigId);
  }

  return ids;
}

function activeRuntimeSourceIds(entity: HistoryEntityData): Set<string> {
  const ids = new Set<string>();
  for (const source of entity.activeEffectSources ?? []) {
    const legacySource = source as typeof source & { source_id?: unknown };
    const sourceId = String(source.sourceId ?? legacySource.source_id ?? "").trim().toLowerCase();
    if (sourceId) ids.add(sourceId);
  }
  return ids;
}

function entryHasEntityActiveRuntimeEvidence(
  entity: HistoryEntityData,
  entry: ModifierSourceCatalogEntry,
): boolean {
  if (entry.sourceKind === "phantom-factor") {
    return hasSelectedFactorItem(entity, entry) || hasActiveFactorBuff(entity, entry);
  }

  const sourceKind = String(entry.sourceKind ?? "").toLowerCase();
  const sourceId = String(entry.sourceId ?? "").trim().toLowerCase();
  const activeSourceIds = activeRuntimeSourceIds(entity);
  if (sourceId && activeSourceIds.has(sourceId)) return true;

  if (sourceKind === "season-talent-node" && [...activeSourceIds].some((id) => id.startsWith("season-talent-node:"))) {
    return false;
  }

  const activeIds = activeRuntimeEvidenceIds(entity);
  return entryRuntimeBuffIds(entry).some((id) => activeIds.has(id));
}

function activeOnlySelectedFactorEntries(
  entity: HistoryEntityData,
  catalog: ModifierSourceCatalog | undefined,
  scope: ModifierActivityScope,
  existingSourceIds: Set<string>,
): Array<{ entry: ModifierSourceCatalogEntry; selectedFactorItem: ActiveFactorItem }> {
  if (scope !== "all-active") return [];
  const out: Array<{ entry: ModifierSourceCatalogEntry; selectedFactorItem: ActiveFactorItem }> = [];
  const seen = new Set<string>();

  for (const item of entity.activeFactorItems ?? []) {
    const factorBuffId = finitePositiveNumber(item.factorBuffId);
    if (factorBuffId === null) continue;

    for (const entry of catalog?.byBuffId?.[String(factorBuffId)] ?? []) {
      if (entry.sourceKind !== "phantom-factor") continue;
      if (!isReportVisibleCatalogEntry(entry)) continue;
      if (!entryAllowedForDamageReport(entry)) continue;
      if (!entryAllowedForFactorSelectorEvidence(entity, entry)) continue;
      const allowStaticFallback = entryAllowsActiveOnlyStaticFallback(entity, entry);
      if (!entryVisibleForScope(entry, scope) && !allowStaticFallback) continue;
      if (hasActiveFactorBuff(entity, entry)) continue;
      if (existingSourceIds.has(entry.sourceId)) continue;

      const selectedFactorItem = selectedFactorItemForEntry(entity, entry);
      if (!selectedFactorItem) continue;

      const key = `${entry.sourceId}:${selectedFactorItem.itemConfigId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ entry, selectedFactorItem });
    }
  }

  return out;
}

function activeOnlyRuntimeEntries(
  entity: HistoryEntityData,
  catalog: ModifierSourceCatalog | undefined,
  scope: ModifierActivityScope,
  existingSourceIds: Set<string>,
): ActiveRuntimeEntry[] {
  if (scope !== "all-active") return [];
  const out: ActiveRuntimeEntry[] = [];
  const seen = new Set<string>();

  for (const entry of catalog?.activeEntries ?? []) {
    if (!isRuntimeProvenActiveCatalogEntry(entry)) continue;
    if (!entryHasEntityActiveRuntimeEvidence(entity, entry)) continue;
    if (!entryAllowedForDamageReport(entry)) continue;
    if (!entryAllowedForFactorSelectorEvidence(entity, entry)) continue;
    if (!entryAllowedForSelectedRuntimeEvidence(entity, entry)) continue;
    const allowStaticFallback = entryAllowsActiveOnlyStaticFallback(entity, entry);
    if (!entryVisibleForScope(entry, scope) && !allowStaticFallback) continue;
    if (entryHasStaticTargets(entry) && !allowStaticFallback) continue;
    if (existingSourceIds.has(entry.sourceId)) continue;

    const key = sourceKeyForActiveOnlyEntry(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      entry,
      selectedFactorItem: selectedFactorItemForEntry(entity, entry),
    });
  }

  return out;
}

function entryRuntimeBuffIds(entry: ModifierSourceCatalogEntry): number[] {
  return sortedNumbers([
    ...(entry.buffIds ?? []),
    ...(entry.runtimeBaseIds ?? []),
    ...(entry.runtimeSourceConfigIds ?? []),
  ].map(finitePositiveNumber).filter((id): id is number => id !== null));
}

function activeOnlySkillRow(
  entity: HistoryEntityData,
  elapsedSecs: number,
  key: string,
): ModifierActivitySkillRow | null {
  const playerTotal = Math.max(Number(entity.damage.total) || 0, 0);
  const effectiveTotal = Math.max(Number(entity.damage.effectiveTotal) || 0, 0);
  const playerHits = Math.max(Number(entity.damage.hits) || 0, 0);
  if (playerTotal <= 0 || playerHits <= 0) return null;

  return {
    key,
    rowKind: "skill",
    skillId: 0,
    name: "All Damage",
    damageIds: [],
    match: "no-static-target",
    totalDmg: playerTotal,
    effectiveTotal,
    baseTotalDmg: playerTotal,
    baseEffectiveTotal: effectiveTotal,
    baseDmgPct: 100,
    baseDps: elapsedSecs > 0 ? playerTotal / elapsedSecs : 0,
    baseHits: playerHits,
    baseHitsPerMinute: perMinute(playerHits, elapsedSecs),
    dmgPct: 100,
    sourcePct: 100,
    coveragePct: 100,
    dps: elapsedSecs > 0 ? playerTotal / elapsedSecs : 0,
    hits: playerHits,
    hitsPerMinute: perMinute(playerHits, elapsedSecs),
    critRate: rate(Number(entity.damage.critHits) || 0, playerHits),
    luckyRate: rate(Number(entity.damage.luckyHits) || 0, playerHits),
  };
}

function activeOnlyRowForEntry(
  entity: HistoryEntityData,
  elapsedSecs: number,
  entry: ModifierSourceCatalogEntry,
  evidence: string[],
  selectedFactorItem?: ActiveFactorItem | null,
): ModifierActivityRow | null {
  const skillRow = activeOnlySkillRow(
    entity,
    elapsedSecs,
    selectedFactorItem ? "active-factor:all-damage" : "active-source:all-damage",
  );
  if (!skillRow) return null;

  const sourceName = selectedFactorItem
    ? selectedFactorSourceName(entry, selectedFactorItem)
    : localizedCatalogName(entry);
  const sourceNames = selectedFactorItem
    ? selectedFactorSourceNames(entry, selectedFactorItem)
    : entry.sourceNames;
  const playerTotal = skillRow.totalDmg;
  const effectiveTotal = skillRow.effectiveTotal;
  const playerHits = skillRow.hits;

  return {
    key: sourceKeyForActiveOnlyEntry(entry),
    ...(entry.sourceRuleId ? { sourceRuleId: entry.sourceRuleId } : {}),
    sourceRuleIds: entry.sourceRuleId ? [entry.sourceRuleId] : [],
    sourceId: entry.sourceId,
    sourceIds: [entry.sourceId],
    sourceKind: entry.sourceKind ?? (selectedFactorItem ? "phantom-factor" : "active-source"),
    ...(entry.sourceType ? { sourceType: entry.sourceType } : {}),
    ...(typeof entry.sourceEntityId === "number" ? { sourceEntityId: entry.sourceEntityId } : {}),
    sourceName,
    ...(sourceNames ? { sourceNames } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.descriptions ? { descriptions: entry.descriptions } : {}),
    ...(entry.iconPath ? { iconPath: entry.iconPath } : {}),
    runtimeDetection: entry.runtimeDetection ?? (selectedFactorItem ? "selected-factor-grade-item" : "active-runtime-source"),
    ...(entry.providerAggregation ? { providerAggregation: entry.providerAggregation } : {}),
    ...(entry.displayOwnerKind ? { displayOwnerKind: entry.displayOwnerKind } : {}),
    buffIds: entry.sourceKind === "phantom-factor" ? entryPhantomFactorBuffIds(entry) : entryRuntimeBuffIds(entry),
    evidence: sortedStrings(new Set([
      ...(entry.evidence ?? []),
      ...evidence,
    ].filter(Boolean))),
    ...(entry.attributionModel ? { attributionModel: entry.attributionModel } : {}),
    ...(entry.contributionModel ? { contributionModel: entry.contributionModel } : {}),
    ...(entry.talentOwnership ? { talentOwnership: entry.talentOwnership } : {}),
    ...(entry.classification ? { classification: entry.classification } : {}),
    actorSummary: selfActorSummaryForEntity(entity),
    match: entryHasStaticTargets(entry) ? "active-static-target-fallback" : "no-static-target",
    targetDamageIds: sortedNumbers(entry.targetDamageIds ?? []),
    targetRecountIds: sortedNumbers(entry.targetRecountIds ?? []),
    totalDmg: playerTotal,
    effectiveTotal,
    dmgPct: 100,
    coveragePct: 100,
    dps: elapsedSecs > 0 ? playerTotal / elapsedSecs : 0,
    hits: playerHits,
    hitsPerMinute: perMinute(playerHits, elapsedSecs),
    critRate: skillRow.critRate,
    luckyRate: skillRow.luckyRate,
    skills: [{ ...skillRow }],
  };
}

function buildActiveOnlyRuntimeRows(
  entity: HistoryEntityData,
  elapsedSecs: number,
  catalog: ModifierSourceCatalog | undefined,
  scope: ModifierActivityScope,
  actorFilter: ModifierActorFilter,
  existingSourceIds: Set<string>,
): ModifierActivityRow[] {
  if (actorFilter === "external") return [];

  const rows: ModifierActivityRow[] = [];
  const emittedSourceIds = new Set(existingSourceIds);
  for (const { entry, selectedFactorItem } of activeOnlyRuntimeEntries(entity, catalog, scope, emittedSourceIds)) {
    const evidence = selectedFactorItem
      ? ["active-runtime-source", "selected-factor-grade-item", selectedFactorItem.runtimeSource]
      : ["active-runtime-source"];
    const row = activeOnlyRowForEntry(entity, elapsedSecs, entry, evidence, selectedFactorItem);
    if (row) {
      rows.push(row);
      for (const sourceId of row.sourceIds ?? []) emittedSourceIds.add(sourceId);
    }
  }
  for (const { entry, selectedFactorItem } of activeOnlySelectedFactorEntries(entity, catalog, scope, emittedSourceIds)) {
    const row = activeOnlyRowForEntry(
      entity,
      elapsedSecs,
      entry,
      ["selected-factor-grade-item", selectedFactorItem.runtimeSource],
      selectedFactorItem,
    );
    if (row) {
      rows.push(row);
      for (const sourceId of row.sourceIds ?? []) emittedSourceIds.add(sourceId);
    }
  }
  return rows;
}

function isExternalModifierBucket(entity: HistoryEntityData, bucket: ModifierHitBucketState): boolean {
  const sourceUid = finitePositiveNumber(bucket.modifierSourceUid);
  return sourceUid !== null && sourceUid !== entity.uid;
}

function entryAllowedForBucketOwner(
  entity: HistoryEntityData,
  catalog: ModifierSourceCatalog | undefined,
  entry: ModifierSourceCatalogEntry,
  bucket: ModifierHitBucketState,
): boolean {
  if (isExternalModifierBucket(entity, bucket)) return true;

  const ownership = entry.talentOwnership;
  if (!ownership) return true;
  if (!ownership.hardFilterEligible) return true;

  const ownershipClassId = finitePositiveNumber(ownership.classId);
  const ownerClassId = finitePositiveNumber(catalog?.ownerClassId) ?? finitePositiveNumber(entity.classId);
  if (ownershipClassId !== null && ownerClassId !== null && ownershipClassId !== ownerClassId) return false;

  const ownerSpecIds = positiveNumberSet(catalog?.ownerSpecIds);
  if (ownerSpecIds.size === 0) return true;

  const allowedSpecIds = positiveNumberSet([
    ...(ownership.specIds ?? []),
    ...(ownership.allowedSpecIds ?? []),
  ]);
  if (allowedSpecIds.size > 0 && ![...ownerSpecIds].some((specId) => allowedSpecIds.has(specId))) {
    return false;
  }

  const blacklistedSpecIds = positiveNumberSet(ownership.blacklistedSpecIds);
  if ([...ownerSpecIds].some((specId) => blacklistedSpecIds.has(specId))) return false;

  return true;
}

function entryObservedOnBucket(entry: ModifierSourceCatalogEntry, bucket: ModifierHitBucketState, preferredId: number): boolean {
  const observedIds = new Set([preferredId, ...bucketBuffIds(bucket)]);
  const candidateIds = [
    entry.sourceEntityId,
    ...(entry.buffIds ?? []),
    ...(entry.runtimeBaseIds ?? []),
    ...(entry.runtimeSourceConfigIds ?? []),
  ].map(Number).filter((id) => Number.isFinite(id) && id > 0);
  return candidateIds.some((id) => observedIds.has(id));
}

function entryUsesObservedTargetDebuffWindow(entry: ModifierSourceCatalogEntry): boolean {
  const sourceType = String(entry.sourceType ?? "").toLowerCase();
  if (!sourceType.includes("debuff")) return false;
  return entryHasStaticTargets(entry);
}

function entryRuntimeSourceConfigMatches(entry: ModifierSourceCatalogEntry, preferredId: number): boolean {
  return (entry.runtimeSourceConfigIds ?? [])
    .map(Number)
    .some((id) => Number.isFinite(id) && id === preferredId);
}

function entryMatchesBucket(
  entry: ModifierSourceCatalogEntry,
  bucket: ModifierHitBucketState,
  skillId: number,
  damageIds: number[],
): boolean {
  const targetDamageIds = new Set((entry.targetDamageIds ?? []).map(Number).filter(Number.isFinite));
  const targetRecountIds = new Set((entry.targetRecountIds ?? []).map(Number).filter(Number.isFinite));
  if (targetDamageIds.size === 0 && targetRecountIds.size === 0) return true;

  const skillKey = finitePositiveNumber(bucket.skillKey);
  if (skillKey !== null && targetRecountIds.has(skillKey)) return true;
  if (targetRecountIds.has(skillId)) return true;

  const candidates = new Set<number>([skillId, ...damageIds]);
  const bucketDamageId = finitePositiveNumber(bucket.damageId);
  if (bucketDamageId !== null) candidates.add(bucketDamageId);
  for (const damageId of candidates) {
    if (targetDamageIds.has(damageId)) return true;
  }
  return false;
}

function catalogEntriesForBucket(
  catalog: ModifierSourceCatalog | undefined,
  bucket: ModifierHitBucketState,
  preferredId: number,
): ModifierSourceCatalogEntry[] {
  const observedIds = new Set([preferredId, ...bucketBuffIds(bucket)]);
  const entries: ModifierSourceCatalogEntry[] = [];
  const seen = new Set<string>();
  const preferredEntries = catalog?.byBuffId?.[String(preferredId)] ?? [];
  const hasPreferredRuntimeSource = preferredEntries.some((entry) => entryRuntimeSourceConfigMatches(entry, preferredId));
  for (const buffId of observedIds) {
    for (const entry of catalog?.byBuffId?.[String(buffId)] ?? []) {
      if (!isReportVisibleCatalogEntry(entry)) continue;
      if (
        hasPreferredRuntimeSource
        && buffId !== preferredId
        && !entryHasStaticTargets(entry)
        && !entryRuntimeSourceConfigMatches(entry, preferredId)
      ) continue;
      const key = entry.sourceId || `${entry.sourceKind}:${entry.sourceName}:${buffId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  return entries;
}

function sourceMatchesForBucket(
  entity: HistoryEntityData,
  catalog: ModifierSourceCatalog | undefined,
  scope: ModifierActivityScope,
  bucket: ModifierHitBucketState,
  preferredId: number,
  skillId: number,
  damageIds: number[],
): BucketSourceMatch[] {
  const entries = catalogEntriesForBucket(catalog, bucket, preferredId)
    .filter(entryAllowedForDamageReport)
    .filter((entry) => entryAllowedForBucketOwner(entity, catalog, entry, bucket))
    .filter((entry) => entryAllowedForFactorSelectorEvidence(entity, entry))
    .filter((entry) => entryAllowedForSelectedRuntimeEvidence(entity, entry))
    .filter((entry) => entryVisibleForScope(entry, scope));
  const staticMatches = entries
    .filter(entryHasStaticTargets)
    .filter((entry) => entryMatchesBucket(entry, bucket, skillId, damageIds))
    .map((entry) => ({
      entry,
      match: "direct-static-target" as const,
      selectedFactorItem: selectedFactorItemForEntry(entity, entry),
    }));
  const observedTargetDebuffMatches = entries
    .filter(entryUsesObservedTargetDebuffWindow)
    .filter((entry) => entryObservedOnBucket(entry, bucket, preferredId))
    .map((entry) => ({
      entry,
      match: "direct-static-target" as const,
      selectedFactorItem: selectedFactorItemForEntry(entity, entry),
    }));
  const directMatches = dedupeSourceMatches([...staticMatches, ...observedTargetDebuffMatches]);

  if (scope === "static-targets") return directMatches;

  return dedupeSourceMatches([
    ...directMatches,
    ...entries
    .filter((entry) => !entryHasStaticTargets(entry))
    .map((entry) => ({
      entry,
      match: "no-static-target" as const,
      selectedFactorItem: selectedFactorItemForEntry(entity, entry),
    })),
  ]);
}

function mergeSelectedFactorItemIntoSource(
  source: FastSourceAggregate,
  entry: ModifierSourceCatalogEntry,
  selectedFactorItem: ActiveFactorItem | null | undefined,
): void {
  if (entry.sourceKind !== "phantom-factor") return;
  if (!selectedFactorGradeSuffix(selectedFactorItem)) return;

  source.sourceName = selectedFactorSourceName(entry, selectedFactorItem);
  const sourceNames = selectedFactorSourceNames(entry, selectedFactorItem);
  if (sourceNames) source.sourceNames = sourceNames;
  source.evidence.add("selected-factor-grade-item");
  if (selectedFactorItem?.runtimeSource) source.evidence.add(selectedFactorItem.runtimeSource);
}

function mergeEntryIntoSource(
  source: FastSourceAggregate,
  entry: ModifierSourceCatalogEntry,
  selectedFactorItem?: ActiveFactorItem | null,
): void {
  if (entry.sourceRuleId) {
    source.sourceRuleIds.add(entry.sourceRuleId);
    if (!source.sourceRuleId) source.sourceRuleId = entry.sourceRuleId;
  }
  source.sourceIds.add(entry.sourceId);
  if (entry.sourceType && !source.sourceType) source.sourceType = entry.sourceType;
  if (typeof entry.sourceEntityId === "number" && source.sourceEntityId === undefined) {
    source.sourceEntityId = entry.sourceEntityId;
  }
  if (entry.sourceNames && !source.sourceNames) source.sourceNames = entry.sourceNames;
  if (entry.description && !source.description) source.description = entry.description;
  if (entry.descriptions && !source.descriptions) source.descriptions = entry.descriptions;
  if (entry.iconPath && !source.iconPath) source.iconPath = entry.iconPath;
  if (entry.runtimeDetection && !source.runtimeDetection) source.runtimeDetection = entry.runtimeDetection;
  if (entry.providerAggregation && !source.providerAggregation) source.providerAggregation = entry.providerAggregation;
  if (entry.displayOwnerKind && !source.displayOwnerKind) source.displayOwnerKind = entry.displayOwnerKind;
  if (entry.attributionModel && !source.attributionModel) source.attributionModel = entry.attributionModel;
  if (entry.contributionModel && !source.contributionModel) source.contributionModel = entry.contributionModel;
  if (entry.talentOwnership && !source.talentOwnership) source.talentOwnership = entry.talentOwnership;
  if (entry.classification && !source.classification) source.classification = entry.classification;
  for (const buffId of entry.buffIds ?? []) {
    const parsed = finitePositiveNumber(buffId);
    if (parsed !== null) source.buffIds.add(parsed);
  }
  for (const evidence of entry.evidence ?? []) source.evidence.add(evidence);
  for (const targetId of entry.targetDamageIds ?? []) {
    const parsed = finitePositiveNumber(targetId);
    if (parsed !== null) source.targetDamageIds.add(parsed);
  }
  for (const targetId of entry.targetRecountIds ?? []) {
    const parsed = finitePositiveNumber(targetId);
    if (parsed !== null) source.targetRecountIds.add(parsed);
  }
  mergeSelectedFactorItemIntoSource(source, entry, selectedFactorItem);
}

function aggregateMatch(matches: Set<"direct-static-target" | "no-static-target">): "direct-static-target" | "no-static-target" | "mixed" {
  if (matches.size > 1) return "mixed";
  return matches.has("direct-static-target") ? "direct-static-target" : "no-static-target";
}

function isExactProducedContribution(model: ModifierActivityRow["contributionModel"] | undefined): boolean {
  return model?.contributionMode === "exact-produced-damage" && model.contributionTier === "exact";
}

function isFormulaReplayCandidate(model: ModifierActivityRow["contributionModel"] | undefined): boolean {
  return model?.contributionMode === "formula-replay-candidate" && model.contributionTier === "replay-required";
}

function actorScopeForComponentValues(actorSummary?: ModifierActorSummary): ModifierContributionComponentActorScope {
  const externalCount = (actorSummary?.externalSourceUids?.length ?? 0)
    + (actorSummary?.externalSourceActors?.length ?? 0);
  const selfCount = (actorSummary?.selfSourceUids?.length ?? 0)
    + (actorSummary?.selfSourceActors?.length ?? 0);
  if (externalCount > 0 && selfCount === 0) return "party";
  if (selfCount > 0 && externalCount === 0) return "owner";
  if (externalCount > 0 && selfCount > 0) return "mixed";
  return "unknown";
}

function componentValueMatchesActorScope(
  valueScope: ModifierContributionComponentValueScope | undefined,
  actorScope: ModifierContributionComponentActorScope,
): boolean {
  if (valueScope === "all") return true;
  if (actorScope === "owner" && valueScope === "owner") return true;
  if (actorScope === "party" && valueScope === "party") return true;
  return false;
}

function componentValueSelectionReason(
  actorScope: ModifierContributionComponentActorScope,
  valueScope: ModifierContributionComponentValueScope | undefined,
): string {
  if (valueScope === "all") return "single value applies to all actors";
  if (actorScope === "owner") return "encounter source is self-owned/owner scope";
  if (actorScope === "party") return "encounter source is external/party scope";
  return `encounter source scope ${actorScope}`;
}

function resolveComponentValuesForFormulaReplay(
  model: ModifierActivityRow["contributionModel"] | undefined,
  actorSummary?: ModifierActorSummary,
): ModifierResolvedContributionComponentValue[] {
  const actorScope = actorScopeForComponentValues(actorSummary);
  const resolvedValues: ModifierResolvedContributionComponentValue[] = [];
  for (const hint of model?.componentValueHints ?? []) {
    const values = hint.values ?? [];
    if (values.length === 0) continue;
    const selected = values.filter((value) => componentValueMatchesActorScope(value.scope, actorScope));
    const outputValues = selected.length > 0 ? selected : values;
    const resolved = selected.length > 0;
    for (const value of outputValues) {
      const resolvedValue: ModifierResolvedContributionComponentValue = {
        ...value,
        actorScope,
        resolved,
        selectedBy: resolved
          ? componentValueSelectionReason(actorScope, value.scope)
          : `unresolved for encounter source scope ${actorScope}`,
      };
      if (hint.componentKey) resolvedValue.componentKey = hint.componentKey;
      if (hint.label) resolvedValue.label = hint.label;
      if (hint.effectClass) resolvedValue.effectClass = hint.effectClass;
      if (hint.contributionScope) resolvedValue.contributionScope = hint.contributionScope;
      if (hint.direction) resolvedValue.direction = hint.direction;
      if (hint.stat) resolvedValue.stat = hint.stat;
      if (hint.formulaTermIds?.length) resolvedValue.formulaTermIds = hint.formulaTermIds;
      if (hint.contributionGroups?.length) resolvedValue.contributionGroups = hint.contributionGroups;
      if (hint.predicateTags?.length) resolvedValue.predicateTags = hint.predicateTags;
      if (hint.valueResolution) resolvedValue.valueResolution = hint.valueResolution;
      resolvedValues.push(resolvedValue);
    }
  }
  return resolvedValues;
}

function normalizedFormulaTerms(value: ModifierResolvedContributionComponentValue): Set<string> {
  return new Set((value.formulaTermIds ?? []).map((term) => String(term).toLowerCase()));
}

function componentLabel(value: ModifierResolvedContributionComponentValue): string {
  return value.label
    ?? value.componentKey
    ?? value.effectClass
    ?? value.rawText
    ?? "component";
}

function isCriticalRateComponent(value: ModifierResolvedContributionComponentValue): boolean {
  const key = String(value.componentKey ?? "").toLowerCase();
  const effectClass = String(value.effectClass ?? "").toLowerCase();
  const label = String(value.label ?? "").toLowerCase();
  return key === "critical-rate" || effectClass === "critical-stat" || label === "crit" || label === "crit rate";
}

function isCriticalDamageComponent(value: ModifierResolvedContributionComponentValue): boolean {
  const key = String(value.componentKey ?? "").toLowerCase();
  const effectClass = String(value.effectClass ?? "").toLowerCase();
  const label = String(value.label ?? "").toLowerCase();
  return key === "critical-damage" || effectClass === "critical-damage-stat" || label.includes("crit dmg");
}

function attrDecimalValue(
  attrs: ModifierReplayHitState["attackerAttrs"] | ModifierReplayHitState["targetAttrs"] | undefined,
  attrId: number,
): number | null {
  for (const attr of attrs ?? []) {
    if (finitePositiveNumber(attr.attrId) !== attrId) continue;
    const raw = typeof attr.valueFloat === "number" && Number.isFinite(attr.valueFloat)
      ? attr.valueFloat
      : typeof attr.valueInt === "number" && Number.isFinite(attr.valueInt)
        ? attr.valueInt / 10000
        : null;
    return raw !== null && Number.isFinite(raw) ? raw : null;
  }
  return null;
}

function replayableComponentBlocker(value: ModifierResolvedContributionComponentValue): string | null {
  const amount = value.decimalValue;
  if (value.resolved === false) return `${componentLabel(value)} has no encounter-resolved value`;
  if (!value.formulaAmount || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return `${componentLabel(value)} has no numeric formula amount`;
  }
  if (value.valueResolution && value.valueResolution !== "single") {
    return `${componentLabel(value)} uses ${value.valueResolution}; clause-bound value mapping is required before replay`;
  }
  if (isCriticalRateComponent(value)) {
    return `${componentLabel(value)} changes crit chance; expected-value crit modeling is required before replay`;
  }
  const terms = normalizedFormulaTerms(value);
  if (isCriticalDamageComponent(value) && terms.has("critmultiplier")) return null;
  if (
    terms.has("genericdamagepct")
    || terms.has("elementaldamagepct")
    || terms.has("versatilitydamagepct")
  ) {
    return `${componentLabel(value)} needs the full additive percent bucket snapshot before source-off replay`;
  }
  return `${componentLabel(value)} is not mapped to a replayable direct multiplier yet`;
}

function criticalDamageContributionForHit(
  hit: ModifierReplayHitState,
  value: ModifierResolvedContributionComponentValue,
): number | null {
  if (!hit.isCrit) return 0;
  const amount = value.decimalValue;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const critMultiplier = attrDecimalValue(hit.attackerAttrs, ATTR_CRIT_DAMAGE);
  if (critMultiplier === null || critMultiplier <= amount || critMultiplier <= 1) return null;
  const observed = Number(hit.value) || 0;
  if (observed <= 0) return 0;
  return observed * (amount / critMultiplier);
}

function componentContributionForHit(
  hit: ModifierReplayHitState,
  value: ModifierResolvedContributionComponentValue,
): number | null {
  const terms = normalizedFormulaTerms(value);
  if (isCriticalDamageComponent(value) && terms.has("critmultiplier")) {
    return criticalDamageContributionForHit(hit, value);
  }
  return null;
}

function formulaReplayContributionEstimateForSource(
  source: FastSourceAggregate,
  replayHits: ModifierReplayHitState[],
  targetUid: number | null | undefined,
  componentValues: ModifierResolvedContributionComponentValue[],
): FormulaReplayContributionEstimate | undefined {
  const skippedComponents: string[] = [];
  const replayableComponents: ModifierResolvedContributionComponentValue[] = [];
  for (const value of componentValues) {
    const blocker = replayableComponentBlocker(value);
    if (blocker) {
      skippedComponents.push(blocker);
      continue;
    }
    replayableComponents.push(value);
  }
  if (replayableComponents.length === 0 || skippedComponents.length > 0) return undefined;

  const componentEstimates = new Map<string, FormulaReplayComponentEstimate>();
  let observedTotal = 0;
  let contributionTotal = 0;
  let sampledHitCount = 0;
  let appliedHitCount = 0;
  let failedApplicableHits = 0;

  for (const hit of replayHits) {
    if (targetUid !== null && targetUid !== undefined && hit.targetUid !== targetUid) continue;
    if (!replayHitMatchesSource(source, hit)) continue;
    sampledHitCount += 1;
    observedTotal += Number(hit.value) || 0;
    let hitContribution = 0;
    let hitApplied = false;
    for (const value of replayableComponents) {
      const contribution = componentContributionForHit(hit, value);
      if (contribution === null) {
        failedApplicableHits += 1;
        continue;
      }
      if (contribution <= 0) continue;
      hitApplied = true;
      hitContribution += contribution;
      const key = `${value.componentKey ?? ""}:${value.label ?? ""}:${value.rawText ?? ""}`;
      const existing = componentEstimates.get(key) ?? {
        ...(value.componentKey ? { componentKey: value.componentKey } : {}),
        ...(value.label ? { label: value.label } : {}),
        ...(value.formulaTermIds?.length ? { formulaTermIds: value.formulaTermIds } : {}),
        ...(typeof value.decimalValue === "number" ? { decimalValue: value.decimalValue } : {}),
        contributionTotal: 0,
        hitCount: 0,
        method: "crit-damage snapshot counterfactual",
      };
      existing.contributionTotal += contribution;
      existing.hitCount += 1;
      componentEstimates.set(key, existing);
    }
    const observed = Number(hit.value) || 0;
    contributionTotal += Math.min(observed, Math.max(0, hitContribution));
    if (hitApplied) appliedHitCount += 1;
  }

  if (sampledHitCount === 0 || appliedHitCount === 0 || contributionTotal <= 0 || failedApplicableHits > 0) {
    return undefined;
  }
  return {
    contributionTotal: Math.round(contributionTotal),
    counterfactualTotal: Math.round(Math.max(0, observedTotal - contributionTotal)),
    observedTotal: Math.round(observedTotal),
    sampledHitCount,
    appliedHitCount,
    components: [...componentEstimates.values()]
      .map((component) => ({
        ...component,
        contributionTotal: Math.round(component.contributionTotal),
      }))
      .sort((left, right) => right.contributionTotal - left.contributionTotal),
    skippedComponents: sortedStrings(skippedComponents),
  };
}

function evidenceForFormulaReplay(
  skill: FastSkillAggregate,
  model: ModifierActivityRow["contributionModel"],
  componentValues: ModifierResolvedContributionComponentValue[],
): Set<string> {
  const evidence = new Set<string>();
  if (!model) return evidence;
  evidence.add("sourceRuleId active on hit");
  if (skill.totalDmg > 0) {
    evidence.add("observed final hit value");
    evidence.add("damage hit value");
    evidence.add("bucketed final hit aggregate");
  }
  if (skill.effectiveTotal > 0) evidence.add("effective damage value");
  if (skill.firstHitTimeMs !== null || skill.lastHitTimeMs !== null) evidence.add("hit timestamp");
  if (skill.skillId > 0) {
    evidence.add("skill id");
    evidence.add("skill key");
  }
  if (skill.damageIds.size > 0) {
    evidence.add("damage id");
    evidence.add("produced damage row id");
  }
  if (skill.targetUids.size > 0) evidence.add("target uid");
  if (skill.targetMonsterTypeIds.size > 0) {
    evidence.add("target monster config id");
    evidence.add("target/source predicate evaluation");
    evidence.add("target predicate evaluation, such as elite-or-stronger");
  }
  if (skill.attackerUids.size > 0) evidence.add("attacker uid");
  if (skill.originalAttackerUids.size > 0) evidence.add("original attacker uid");
  if (skill.topSummonerUids.size > 0) evidence.add("top summoner uid");
  if (skill.originalAttackerUids.size > 0 || skill.topSummonerUids.size > 0) {
    evidence.add("source predicate evaluation, such as companion or summon");
  }
  if (skill.mixedCritBucketCount === 0) evidence.add("crit flag");
  if (skill.mixedLuckyBucketCount === 0) evidence.add("lucky flag");
  if (skill.properties.size > 0 || skill.damageModes.size > 0) {
    evidence.add("damage element mapping by damage id");
    evidence.add("damage mode");
  }
  if (skill.replayWindowCount > 0) {
    evidence.add("modifier windows");
    evidence.add("replay ledger hit sample");
  }
  if (skill.attackerAttrIds.size > 0) {
    evidence.add("attacker stat snapshot at hit time");
  }
  if (
    skill.attackerAttrIds.has(ATTR_ATTACK_POWER)
    || skill.attackerAttrIds.has(ATTR_PHYSICAL_ATTACK)
    || skill.attackerAttrIds.has(ATTR_MAGIC_ATTACK)
  ) {
    evidence.add("damage row ATK/MATK lane");
  }
  if (skill.attackerAttrIds.has(ATTR_CRIT_DAMAGE)) {
    evidence.add("attacker crit-damage snapshot at hit time");
  }
  if (skill.targetAttrIds.size > 0) {
    evidence.add("target stat snapshot at hit time");
  }
  if (skill.targetAttrIds.has(ATTR_DEFENSE_POWER)) {
    evidence.add("target armor/defense snapshot at hit time");
  }
  if ([...ELEMENTAL_RESIST_ATTR_IDS].some((attrId) => skill.targetAttrIds.has(attrId))) {
    evidence.add("target resistance snapshot at hit time");
  }
  if (skill.targetAttrIds.has(ATTR_ELITE_STATUS)) {
    evidence.add("target/source predicate evaluation");
    evidence.add("target predicate evaluation, such as elite-or-stronger");
  }
  if (skill.bucketCount > 0 && skill.singleHitBucketCount === skill.bucketCount) {
    evidence.add("per-hit final samples");
  }
  if (componentValues.some((value) => value.resolved !== false && value.formulaAmount)) {
    evidence.add("modifier value or component amount");
  }
  return evidence;
}

function formulaReplayModelForSkill(
  skill: FastSkillAggregate,
  model: ModifierActivityRow["contributionModel"] | undefined,
  actorSummary?: ModifierActorSummary,
  expectedHitCount?: number,
): ModifierActivityRow["formulaReplayModel"] | undefined {
  if (!isFormulaReplayCandidate(model)) return undefined;
  const componentValues = resolveComponentValuesForFormulaReplay(model, actorSummary);
  const availableEvidence = evidenceForFormulaReplay(skill, model, componentValues);
  const requiredEvidence = new Set(model?.requiredRuntimeEvidence ?? []);
  requiredEvidence.add("per-hit final samples");
  requiredEvidence.add("source-off baseline or validated component delta");
  const missingEvidence = sortedStrings(
    [...requiredEvidence].filter((item) => !availableEvidence.has(item)),
  );
  const blockers = new Set<string>(model?.blockers ?? []);
  const skippedReplayComponents = sortedStrings(
    componentValues
      .map(replayableComponentBlocker)
      .filter((blocker): blocker is string => Boolean(blocker)),
  );
  for (const blocker of skippedReplayComponents) blockers.add(blocker);
  if (skill.bucketCount > 0 && skill.singleHitBucketCount < skill.bucketCount) {
    blockers.add("saved history currently has aggregate modifier buckets, not complete per-hit samples");
  }
  if (skill.mixedCritBucketCount > 0) {
    blockers.add("at least one bucket mixes crit and non-crit hits");
  }
  if (skill.mixedLuckyBucketCount > 0) {
    blockers.add("at least one bucket mixes lucky and non-lucky hits");
  }
  if (expectedHitCount !== undefined && expectedHitCount > 0 && skill.hits < expectedHitCount) {
    blockers.add("per-hit replay ledger is incomplete for this modifier source");
  }
  if (missingEvidence.length > 0) {
    blockers.add("required formula replay evidence is missing");
  }
  const aggregateOnly = skill.bucketCount > 0 && skill.singleHitBucketCount < skill.bucketCount;
  const status = missingEvidence.length === 0 && blockers.size === 0
    ? "ready-for-replay"
    : aggregateOnly
      ? "aggregate-only"
      : "blocked-missing-evidence";
  return {
    status,
    availableEvidence: sortedStrings(availableEvidence),
    missingEvidence,
    blockers: sortedStrings(blockers),
    bucketCount: skill.bucketCount,
    singleHitBucketCount: skill.singleHitBucketCount,
    mixedCritBucketCount: skill.mixedCritBucketCount,
    mixedLuckyBucketCount: skill.mixedLuckyBucketCount,
    hitCount: skill.hits,
    ...(model?.formulaTermIds?.length ? { formulaTermIds: model.formulaTermIds } : {}),
    ...(model?.formulaZoneIds?.length ? { formulaZoneIds: model.formulaZoneIds } : {}),
    ...(model?.contributionGroups?.length ? { contributionGroups: model.contributionGroups } : {}),
    ...(model?.predicateTags?.length ? { predicateTags: model.predicateTags } : {}),
    ...(componentValues.length ? { componentValues } : {}),
    ...(skippedReplayComponents.length ? { skippedReplayComponents } : {}),
    ...(model?.notes?.length ? { notes: model.notes } : {}),
  };
}

function withFormulaReplayContributionEstimate(
  model: ModifierActivityRow["formulaReplayModel"] | undefined,
  estimate: FormulaReplayContributionEstimate | undefined,
): ModifierActivityRow["formulaReplayModel"] | undefined {
  if (!model || !estimate) return model;
  const availableEvidence = sortedStrings([
    ...model.availableEvidence,
    "source-off baseline or validated component delta",
    "counterfactual source removal replay",
  ]);
  const missingEvidence = model.missingEvidence
    .filter((item) => item !== "source-off baseline or validated component delta");
  const blockers = model.blockers
    .filter((item) => item !== "required formula replay evidence is missing" || missingEvidence.length > 0);
  return {
    ...model,
    status: missingEvidence.length === 0 && blockers.length === 0
      ? "counterfactual-replayed"
      : model.status,
    availableEvidence,
    missingEvidence,
    blockers,
    replayedContributionTotal: estimate.contributionTotal,
    counterfactualTotal: estimate.counterfactualTotal,
    replayedHitCount: estimate.sampledHitCount,
    replayedAppliedHitCount: estimate.appliedHitCount,
    replayedComponents: estimate.components,
    ...(estimate.skippedComponents.length ? { skippedReplayComponents: estimate.skippedComponents } : {}),
    notes: [
      ...(model.notes ?? []),
      "Counterfactual replay removes only replayable direct multiplier components; chance modifiers remain expected-value blockers.",
    ],
  };
}

function mergedReplayAggregate(skills: Iterable<FastSkillAggregate>): FastSkillAggregate | undefined {
  let aggregate: FastSkillAggregate | undefined;
  for (const skill of skills) {
    if (!aggregate) {
      aggregate = createFastSkillAggregate(skill.skillId > 0 ? skill.skillId : 1);
    }
    if (aggregate.skillId <= 0 && skill.skillId > 0) aggregate.skillId = skill.skillId;
    for (const damageId of skill.damageIds) aggregate.damageIds.add(damageId);
    for (const match of skill.matches) aggregate.matches.add(match);
    aggregate.totalDmg += skill.totalDmg;
    aggregate.effectiveTotal += skill.effectiveTotal;
    aggregate.hits += skill.hits;
    aggregate.critHits += skill.critHits;
    aggregate.critTotal += skill.critTotal;
    aggregate.luckyHits += skill.luckyHits;
    aggregate.luckyTotal += skill.luckyTotal;
    aggregate.bucketCount += skill.bucketCount;
    aggregate.singleHitBucketCount += skill.singleHitBucketCount;
    aggregate.mixedCritBucketCount += skill.mixedCritBucketCount;
    aggregate.mixedLuckyBucketCount += skill.mixedLuckyBucketCount;
    for (const value of skill.targetUids) aggregate.targetUids.add(value);
    for (const value of skill.targetMonsterTypeIds) aggregate.targetMonsterTypeIds.add(value);
    for (const value of skill.attackerUids) aggregate.attackerUids.add(value);
    for (const value of skill.originalAttackerUids) aggregate.originalAttackerUids.add(value);
    for (const value of skill.topSummonerUids) aggregate.topSummonerUids.add(value);
    for (const value of skill.properties) aggregate.properties.add(value);
    for (const value of skill.damageModes) aggregate.damageModes.add(value);
    for (const value of skill.attackerAttrIds) aggregate.attackerAttrIds.add(value);
    for (const value of skill.targetAttrIds) aggregate.targetAttrIds.add(value);
    aggregate.replayWindowCount += skill.replayWindowCount;
    if (skill.firstHitTimeMs !== null) {
      aggregate.firstHitTimeMs = aggregate.firstHitTimeMs === null
        ? skill.firstHitTimeMs
        : Math.min(aggregate.firstHitTimeMs, skill.firstHitTimeMs);
    }
    if (skill.lastHitTimeMs !== null) {
      aggregate.lastHitTimeMs = aggregate.lastHitTimeMs === null
        ? skill.lastHitTimeMs
        : Math.max(aggregate.lastHitTimeMs, skill.lastHitTimeMs);
    }
  }
  return aggregate;
}

export function buildModifierActivityRowsFast(
  entity: HistoryEntityData,
  elapsedSecs: number,
  options: {
    scope?: ModifierActivityScope;
    actorFilter?: ModifierActorFilter;
    targetUid?: number | null;
    encounterStartMs?: number | null;
    encounterEndMs?: number | null;
  } = {},
): ModifierActivityRow[] {
  const actorFilter = options.actorFilter ?? "all";
  const scope = options.scope ?? "all-active";
  const catalog = catalogForEntity(entity);
  const reportableBuffIds = reportableBuffIdsForCatalog(catalog);
  const sources = new Map<string, FastSourceAggregate>();
  const playerTotal = Math.max(Number(entity.damage.total) || 0, 0);
  const playerHits = Math.max(Number(entity.damage.hits) || 0, 0);
  const sourceActorIndex = sourceActorIndexForEntity(entity);
  const replayHits = Array.isArray(entity.modifierReplayHits) ? entity.modifierReplayHits : [];

  for (const bucket of entity.modifierHitBuckets ?? []) {
    if (bucket.isHeal || bucket.hits <= 0) continue;
    if (!bucketMatchesReportableIds(bucket, reportableBuffIds)) continue;
    if (options.targetUid !== null && options.targetUid !== undefined && bucket.targetUid !== options.targetUid) {
      continue;
    }
    const skillId = skillIdForBucket(bucket);
    if (skillId === null) continue;
    const preferredId = preferredSourceBuffId(bucket);
    if (preferredId === null) continue;

    const damageIds = damageIdsForBucket(bucket, skillId);
    const actorSummary = actorSummaryForBucket(entity.uid, bucket, sourceActorIndex);
    for (const sourceMatch of sourceMatchesForBucket(entity, catalog, scope, bucket, preferredId, skillId, damageIds)) {
      const { entry, match } = sourceMatch;
      const selectedFactorItem = sourceMatch.selectedFactorItem ?? null;
      const sourceName = selectedFactorItem
        ? selectedFactorSourceName(entry, selectedFactorItem)
        : localizedCatalogName(entry);
      const sourceNames = selectedFactorItem
        ? selectedFactorSourceNames(entry, selectedFactorItem)
        : entry.sourceNames;
      const sourceKey = sourceKeyForEntry(entity.uid, bucket, entry, sourceActorIndex);
      let source = sources.get(sourceKey);
      if (!source) {
        source = {
          key: sourceKey,
          ...(entry.sourceRuleId ? { sourceRuleId: entry.sourceRuleId } : {}),
          sourceRuleIds: new Set(entry.sourceRuleId ? [entry.sourceRuleId] : []),
          sourceId: entry.sourceId,
          sourceIds: new Set([entry.sourceId]),
          sourceKind: entry.sourceKind ?? "observed-buff",
          ...(entry.sourceType ? { sourceType: entry.sourceType } : {}),
          ...(typeof entry.sourceEntityId === "number" ? { sourceEntityId: entry.sourceEntityId } : {}),
          sourceName,
          ...(sourceNames ? { sourceNames } : {}),
          ...(entry.description ? { description: entry.description } : {}),
          ...(entry.descriptions ? { descriptions: entry.descriptions } : {}),
            ...(entry.iconPath ? { iconPath: entry.iconPath } : {}),
            ...(entry.runtimeDetection ? { runtimeDetection: entry.runtimeDetection } : {}),
            ...(entry.providerAggregation ? { providerAggregation: entry.providerAggregation } : {}),
            ...(entry.displayOwnerKind ? { displayOwnerKind: entry.displayOwnerKind } : {}),
            buffIds: new Set(bucketBuffIds(bucket)),
          evidence: new Set(["observed-modifier-hit-bucket"]),
            ...(entry.attributionModel ? { attributionModel: entry.attributionModel } : {}),
            ...(entry.contributionModel ? { contributionModel: entry.contributionModel } : {}),
            ...(entry.talentOwnership ? { talentOwnership: entry.talentOwnership } : {}),
            ...(entry.classification ? { classification: entry.classification } : {}),
            actorSummary,
          matches: new Set([match]),
          targetDamageIds: new Set(),
          targetRecountIds: new Set(),
          skills: new Map(),
        };
        mergeEntryIntoSource(source, entry, selectedFactorItem);
        sources.set(sourceKey, source);
      } else {
        source.actorSummary = mergeActorSummary(source.actorSummary, actorSummary);
        source.matches.add(match);
        for (const buffId of bucketBuffIds(bucket)) source.buffIds.add(buffId);
        mergeEntryIntoSource(source, entry, selectedFactorItem);
      }

      const skillKey = `skill:${skillId}`;
      let skill = source.skills.get(skillKey);
      if (!skill) {
        skill = createFastSkillAggregate(skillId, damageIds);
        source.skills.set(skillKey, skill);
      }
      skill.matches.add(match);
      aggregateBucketIntoSkill(skill, bucket, isFormulaReplayCandidate(source.contributionModel));
    }
  }

  const rows: ModifierActivityRow[] = [];
  for (const source of sources.values()) {
    if (!actorMatchesFilter(source.actorSummary, actorFilter)) continue;

    const skillRows = [...source.skills.values()]
      .map((skill): ModifierActivitySkillRow => {
        const damageIds = sortedNumbers(skill.damageIds);
        const baseStats = rawSkillForId(entity, skill.skillId, damageIds);
        const observedBaseTotalDmg = Number(baseStats?.totalValue) || 0;
        const observedBaseEffectiveTotal = Number(baseStats?.effectiveTotalValue) || 0;
        const observedBaseHits = Number(baseStats?.hits) || 0;
        const baseTotalDmg = observedBaseTotalDmg > 0 ? observedBaseTotalDmg : skill.totalDmg;
        const baseEffectiveTotal = observedBaseEffectiveTotal > 0 ? observedBaseEffectiveTotal : skill.effectiveTotal;
        const baseHits = observedBaseHits > 0 ? observedBaseHits : skill.hits;
        const totalDmg = Math.min(skill.totalDmg, baseTotalDmg || skill.totalDmg);
        const effectiveTotal = Math.min(skill.effectiveTotal, baseEffectiveTotal || skill.effectiveTotal);
        const hits = Math.min(skill.hits, baseHits || skill.hits);
        const match = aggregateMatch(skill.matches) === "direct-static-target" ? "direct-static-target" : "no-static-target";
        const exactContribution = isExactProducedContribution(source.contributionModel) && match === "direct-static-target";
        return {
          key: `skill:${skill.skillId}`,
          rowKind: "skill",
          skillId: skill.skillId,
          name: lookupDamageName(skill.skillId),
          damageIds,
          match,
          totalDmg,
          effectiveTotal,
          ...(exactContribution
            ? {
                estimatedContributionTotal: totalDmg,
                estimatedContributionPct: safePct(totalDmg, playerTotal),
                estimatedContributionConfidence: "exact" as const,
                ...(source.contributionModel ? { contributionModel: source.contributionModel } : {}),
              }
            : {}),
          baseTotalDmg,
          baseEffectiveTotal,
          baseDmgPct: safePct(baseTotalDmg, playerTotal),
          baseDps: elapsedSecs > 0 ? baseTotalDmg / elapsedSecs : 0,
          baseHits,
          baseHitsPerMinute: perMinute(baseHits, elapsedSecs),
          dmgPct: safePct(totalDmg, playerTotal),
          sourcePct: 0,
          coveragePct: safePct(hits, baseHits),
          dps: elapsedSecs > 0 ? totalDmg / elapsedSecs : 0,
          hits,
          hitsPerMinute: perMinute(hits, elapsedSecs),
          critRate: rate(skill.critHits, skill.hits),
          luckyRate: rate(skill.luckyHits, skill.hits),
        };
      })
      .filter((skill) => skill.hits > 0)
      .sort((left, right) => right.totalDmg - left.totalDmg || right.hits - left.hits);

    if (skillRows.length === 0) continue;
    const totalDmg = skillRows.reduce((sum, skill) => sum + skill.totalDmg, 0);
    const effectiveTotal = skillRows.reduce((sum, skill) => sum + skill.effectiveTotal, 0);
    const hits = skillRows.reduce((sum, skill) => sum + skill.hits, 0);
    const estimatedContributionTotal = skillRows.reduce(
      (sum, skill) => sum + (skill.estimatedContributionTotal ?? 0),
      0,
    );
    const estimatedContributionRows = skillRows.filter((skill) => (skill.estimatedContributionTotal ?? 0) > 0);
    const replayHitAggregate = isFormulaReplayCandidate(source.contributionModel)
      ? replayAggregateForSource(source, replayHits, options.targetUid)
      : undefined;
    const formulaReplayAggregate = replayHitAggregate
      ?? (isFormulaReplayCandidate(source.contributionModel)
        ? mergedReplayAggregate(source.skills.values())
        : undefined);
    const baseFormulaReplayModel = formulaReplayAggregate
      ? formulaReplayModelForSkill(
          formulaReplayAggregate,
          source.contributionModel,
          source.actorSummary,
          replayHitAggregate ? hits : undefined,
        )
      : undefined;
    const formulaReplayEstimate = replayHitAggregate && baseFormulaReplayModel?.componentValues
      ? formulaReplayContributionEstimateForSource(
          source,
          replayHits,
          options.targetUid,
          baseFormulaReplayModel.componentValues,
        )
      : undefined;
    const formulaReplayModel = withFormulaReplayContributionEstimate(baseFormulaReplayModel, formulaReplayEstimate);
    const replayEstimatedContributionTotal = formulaReplayEstimate?.contributionTotal ?? 0;
    const finalEstimatedContributionTotal = estimatedContributionTotal > 0
      ? estimatedContributionTotal
      : replayEstimatedContributionTotal;
    rows.push({
      key: source.key,
      ...(source.sourceRuleId ? { sourceRuleId: source.sourceRuleId } : {}),
      sourceRuleIds: sortedStrings(source.sourceRuleIds),
      sourceId: source.sourceId,
      sourceIds: sortedStrings(source.sourceIds),
      sourceKind: source.sourceKind,
      ...(source.sourceType ? { sourceType: source.sourceType } : {}),
      ...(source.sourceEntityId !== undefined ? { sourceEntityId: source.sourceEntityId } : {}),
      sourceName: source.sourceName,
      ...(source.sourceNames ? { sourceNames: source.sourceNames } : {}),
      ...(source.description ? { description: source.description } : {}),
      ...(source.descriptions ? { descriptions: source.descriptions } : {}),
        ...(source.iconPath ? { iconPath: source.iconPath } : {}),
        ...(source.runtimeDetection ? { runtimeDetection: source.runtimeDetection } : {}),
        ...(source.providerAggregation ? { providerAggregation: source.providerAggregation } : {}),
        ...(source.displayOwnerKind ? { displayOwnerKind: source.displayOwnerKind } : {}),
        buffIds: sortedNumbers(source.buffIds),
      evidence: sortedStrings(source.evidence),
        ...(source.attributionModel ? { attributionModel: source.attributionModel } : {}),
        ...(source.contributionModel ? { contributionModel: source.contributionModel } : {}),
        ...(formulaReplayModel ? { formulaReplayModel } : {}),
        ...(source.talentOwnership ? { talentOwnership: source.talentOwnership } : {}),
        ...(source.classification ? { classification: source.classification } : {}),
        actorSummary: source.actorSummary,
      match: aggregateMatch(source.matches),
      targetDamageIds: sortedNumbers(source.targetDamageIds),
      targetRecountIds: sortedNumbers(source.targetRecountIds),
      totalDmg,
      effectiveTotal,
      ...(finalEstimatedContributionTotal > 0
        ? {
            estimatedContributionTotal: finalEstimatedContributionTotal,
            estimatedContributionPct: safePct(finalEstimatedContributionTotal, playerTotal),
            estimatedContributionConfidence: estimatedContributionTotal > 0
              ? (estimatedContributionRows.every((skill) =>
                  skill.estimatedContributionConfidence === "exact"
                )
                  ? "exact" as const
                  : "medium" as const)
              : "medium" as const,
            ...(formulaReplayEstimate
              ? {
                  observedDmgPerHit: formulaReplayEstimate.observedTotal / formulaReplayEstimate.sampledHitCount,
                  baselineDmgPerHit: formulaReplayEstimate.counterfactualTotal / formulaReplayEstimate.sampledHitCount,
                  baselineHits: formulaReplayEstimate.sampledHitCount,
                }
              : {}),
          }
        : {}),
      dmgPct: safePct(totalDmg, playerTotal),
      coveragePct: safePct(hits, playerHits),
      dps: elapsedSecs > 0 ? totalDmg / elapsedSecs : 0,
      hits,
      hitsPerMinute: perMinute(hits, elapsedSecs),
      critRate: rate(
        skillRows.reduce((sum, skill) => sum + (skill.critRate / 100) * skill.hits, 0),
        hits,
      ),
      luckyRate: rate(
        skillRows.reduce((sum, skill) => sum + (skill.luckyRate / 100) * skill.hits, 0),
        hits,
      ),
      skills: skillRows.map((skill) => ({
        ...skill,
        sourcePct: safePct(skill.totalDmg, totalDmg),
      })),
    });
  }

  const existingSourceIds = new Set<string>();
  for (const source of sources.values()) {
    for (const sourceId of source.sourceIds) existingSourceIds.add(sourceId);
  }
  rows.push(...buildActiveOnlyRuntimeRows(
    entity,
    elapsedSecs,
    catalog,
    scope,
    actorFilter,
    existingSourceIds,
  ));

  return rows
    .filter((row) => row.hits > 0 && row.skills.length > 0)
    .sort((left, right) =>
      right.totalDmg - left.totalDmg
      || right.hits - left.hits
      || left.sourceName.localeCompare(right.sourceName),
    );
}
