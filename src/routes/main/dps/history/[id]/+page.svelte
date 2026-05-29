<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { commands } from "$lib/bindings";
  import type { EncounterSummaryDto, HistoryEntityData, ModifierReplayHitState } from "$lib/bindings";
  import type { RawCombatStats, RawSkillStats } from "$lib/api";
  import { tooltip } from "$lib/utils.svelte";
  import ClassSpecIcon from "$lib/components/class-spec-icon.svelte";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import {
    historyDpsPlayerColumns,
    historyDpsSkillColumns,
    historyHealPlayerColumns,
    historyHealSkillColumns,
    historyTankedPlayerColumns,
    historyTankedSkillColumns,
  } from "$lib/column-data";
  import { settings, SETTINGS, DEFAULT_HISTORY_STATS } from "$lib/settings-store";
  import { localizeSceneName } from "$lib/scene-mappings";
  import { localizeRawMonsterName } from "$lib/monster-mappings";
  import getDisplayName, { getDisplayIconSpecName } from "$lib/name-display";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { computePlayerRowsFromEntities } from "$lib/live-derived";
  import {
    buildRecountGroupHoverText,
    buildSkillBreakdownHoverText,
    groupSkillsByRecount,
    lookupRecountGroupIconPath,
    lookupSkillBreakdownIconPath,
    resolveRecountGroupName,
    resolveSkillBreakdownDetailName,
    resolveSkillBreakdownName,
    resolveLocalizedText,
    lookupDamageIdName,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import { lookupBuffLocalizedNames, lookupBuffMeta, lookupDefaultBuffName } from "$lib/config/buff-name-table";
  import { resolveStaticIconUrl } from "$lib/config/static-icon-resolver";
  import { createHistoryModifierReportWorker } from "$lib/history-modifier-report-worker-client";
  import {
    resolveModifierSourceDescription,
    resolveModifierSourceName,
    type ModifierActivityRow,
    type ModifierActivityScope,
    type ModifierActivitySkillRow,
    type ModifierActorFilter,
    type ModifierActorSummary,
    type ModifierSourceActor,
  } from "$lib/history-modifier-report-display";
  import DeathPlayerList, {
    type DeathPlayerEntry,
  } from "$lib/components/death-replay/death-player-list.svelte";
  import DeathList from "$lib/components/death-replay/death-list.svelte";
  import DeathReplayDetail from "$lib/components/death-replay/death-replay-detail.svelte";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import { uiT, resolveSkillNote, resolveSkillTranslation, type LocaleCode } from "$lib/i18n";

  type HistorySkillType = "dps" | "heal" | "tanked" | "death";
  type HistoryOverviewTab = "damage" | "tanked" | "healing" | "modifiers" | "death";
  type ModifierViewMode = "by-modifier" | "by-skill";

  type ModifierReportWorkerResponse =
    | {
      requestId: number;
      status: "started";
      buckets: number;
    }
    | {
        requestId: number;
        status: "ok";
        rows: ModifierActivityRow[];
        elapsedMs: number;
      }
    | {
        requestId: number;
        status: "error";
        error: string;
      };

  type HistoryPlayerRow = {
    uid: number;
    name: string;
    isLocalPlayer: boolean;
    className: string;
    classSpecName: string;
    classDisplay: string;
    abilityScore: number;
    seasonStrength: number;
    totalDmg: number;
    dps: number;
    tdps: number;
    activeTimeMs: number;
    dmgPct: number;
    bossDmg: number;
    bossDps: number;
    bossDmgPct: number;
    critRate: number;
    critDmgRate: number;
    luckyRate: number;
    luckyDmgRate: number;
    hits: number;
    hitsPerMinute: number;
    effectiveTotal: number;
    effectiveDps: number;
    damageTaken: number;
    tankedPS: number;
    tankedPct: number;
    critTakenRate: number;
    hitsTaken: number;
    healDealt: number;
    effectiveHeal: number;
    ehps: number;
    hps: number;
    healPct: number;
    critHealRate: number;
    hitsHeal: number;
  };

  type BuildHistoryPlayersOptions = {
    includeBossTargetAggregate?: boolean;
  };

  type FlatSkillRow =
    | { kind: "group"; key: string; depth: 0; row: RecountGroup }
    | { kind: "skill"; key: string; depth: 0 | 1; row: SkillDisplayRow };

  type ModifierBreakdownMatch = ModifierActivityRow["match"];

  type ModifierBreakdownSourceRow = {
    key: string;
    source: ModifierActivityRow;
    sourceId: string;
    sourceIds: string[];
    sourceKind: string;
    sourceType?: string;
    sourceEntityId?: number;
    sourceName: string;
    sourceNames?: ModifierActivityRow["sourceNames"];
    displayOwnerKind?: ModifierActivityRow["displayOwnerKind"];
    buffIds: number[];
    evidence: string[];
    attributionModel?: ModifierActivityRow["attributionModel"];
    actorSummary: ModifierActivityRow["actorSummary"];
    targetDamageIds: number[];
    targetRecountIds: number[];
    match: ModifierActivitySkillRow["match"];
    totalDmg: number;
    effectiveTotal: number;
    estimatedContributionTotal?: number;
    estimatedContributionPct?: number;
    estimatedContributionConfidence?: ModifierActivitySkillRow["estimatedContributionConfidence"];
    formulaReplayModel?: ModifierActivitySkillRow["formulaReplayModel"];
    observedDmgPerHit?: number;
    baselineDmgPerHit?: number;
    baselineHits?: number;
    dmgPct: number;
    sourcePct: number;
    coveragePct: number;
    dps: number;
    hits: number;
    hitsPerMinute: number;
    critRate: number;
    luckyRate: number;
  };

  type ModifierBreakdownRow = {
    key: string;
    rowKind: ModifierActivitySkillRow["rowKind"];
    skillId: number;
    recountId?: number;
    name: string;
    names?: ModifierActivitySkillRow["names"];
    damageIds: number[];
    match: ModifierBreakdownMatch;
    totalDmg: number;
    effectiveTotal: number;
    estimatedContributionTotal?: number;
    estimatedContributionPct?: number;
    estimatedContributionConfidence?: ModifierActivitySkillRow["estimatedContributionConfidence"];
    observedDmgPerHit?: number;
    baselineDmgPerHit?: number;
    baselineHits?: number;
    dmgPct: number;
    sourcePct: number;
    coveragePct: number;
    dps: number;
    hits: number;
    hitsPerMinute: number;
    critRate: number;
    luckyRate: number;
    sources: ModifierBreakdownSourceRow[];
  };

  type FlatModifierRow =
    | { kind: "modifier"; key: string; row: ModifierActivityRow }
    | { kind: "modifier-skill"; key: string; sourceKey: string; row: ModifierActivitySkillRow; source: ModifierActivityRow }
    | { kind: "skill"; key: string; row: ModifierBreakdownRow }
    | { kind: "source"; key: string; skillKey: string; row: ModifierBreakdownSourceRow };

  type PerTargetStats = {
    targetUid: number;
    targetName: string;
    totalValue: number;
    damage: RawCombatStats;
    skills: Partial<Record<number, RawSkillStats>>;
  };

  type EntityPerTargetData = {
    uid: number;
    dmgTargets: PerTargetStats[];
    healTargets: PerTargetStats[];
  };

  type OverviewTargetOption = {
    targetUid: number;
    targetName: string;
    totalValue: number;
  };

  // Get encounter ID from URL params
  let encounterId = $derived($page.params.id ? parseInt($page.params.id) : null);
  let charId = $derived($page.url.searchParams.get("charId"));
  let skillType = $derived(($page.url.searchParams.get("skillType") ?? "dps") as HistorySkillType);

  let encounter = $state<EncounterSummaryDto | null>(null);
  let localPlayerUid = $state<number | null>(null);
  let rawEntities = $state<HistoryEntityData[]>([]);
  let encounterEntitiesLoading = $state(false);
  let targetDetailsLoading = $state(false);
  let targetDetailsRequestedEncounterId = $state<number | null>(null);
  let targetDetailsLoadedEncounterId = $state<number | null>(null);
  let modifierEntityCache = $state<Record<string, HistoryEntityData[]>>({});
  let modifierReportCache = $state<Record<string, ModifierActivityRow[]>>({});
  let modifierEntitiesLoading = $state(false);
  let modifierEntitiesError = $state<string | null>(null);
  let modifierEntitiesLoadingKey = $state<string | null>(null);
  let modifierReportLoading = $state(false);
  let modifierReportError = $state<string | null>(null);
  let modifierReportErrorKey = $state<string | null>(null);
  let modifierReportLoadingKey = $state<string | null>(null);
  let players = $state<HistoryPlayerRow[]>([]);
  let error = $state<string | null>(null);
  let isDeleting = $state(false);
  let showDeleteModal = $state(false);
  let expandedGroups = $state<Set<number>>(new Set<number>());
  let expandedModifierRows = $state<Set<string>>(new Set<string>());
  let modifierExpansionSeed = $state("");
  let overviewTargetUid = $state<number | null>(null);
  let modifierPlayerUid = $state<number | null>(null);
  let modifierViewMode = $state<ModifierViewMode>("by-modifier");
  let modifierScope = $state<ModifierActivityScope>("all-active");
  let modifierActorFilter = $state<ModifierActorFilter>("all");
  let modifierHideFullCoverage = $state(false);
  let encounterLoadToken = 0;
  let targetDetailsLoadToken = 0;
  let modifierEntitiesLoadToken = 0;
  let modifierReportLoadToken = 0;
  let modifierReportWorker: Worker | null = null;
  const MODIFIER_REPORT_WORKER_START_TIMEOUT_MS = 45_000;
  const MODIFIER_REPORT_WORKER_BUILD_TIMEOUT_MS = 90_000;
  const MODIFIER_REPORT_CACHE_SCHEMA = "modifier-report-v2-buff-source-labels";

  function modifierCacheKey(encounterUid: number, playerUid: number): string {
    return `${encounterUid}:${playerUid}`;
  }

  function modifierReportCacheKey(entityCacheKey: string): string {
    return [
      MODIFIER_REPORT_CACHE_SCHEMA,
      entityCacheKey,
      modifierScope,
      modifierActorFilter,
      Math.round(encounterDurationSeconds * 1000),
      encounter?.startedAtMs ?? "",
      encounter?.endedAtMs ?? "",
    ].join(":");
  }

  function createModifierReportWorker(): Worker {
    if (typeof Worker === "undefined") {
      throw new Error("Modifier report worker is unavailable in this WebView.");
    }
    terminateModifierReportWorker();
    modifierReportWorker = createHistoryModifierReportWorker();
    return modifierReportWorker;
  }

  function terminateModifierReportWorker() {
    modifierReportWorker?.terminate();
    modifierReportWorker = null;
  }

  onDestroy(() => {
    terminateModifierReportWorker();
  });

  function modifierReportEntityShell(entity: HistoryEntityData): HistoryEntityData {
    return {
      uid: entity.uid,
      name: entity.name,
      classId: entity.classId,
      classSpec: entity.classSpec,
      className: entity.className,
      classSpecName: entity.classSpecName,
      abilityScore: entity.abilityScore,
      seasonStrength: entity.seasonStrength,
      damage: zeroCombatStats(),
      damageBossOnly: zeroCombatStats(),
      healing: zeroCombatStats(),
      taken: zeroCombatStats(),
      dmgSkills: {},
      healSkills: {},
      takenSkills: {},
      activeBuffs: [],
      activeFactorBuffs: [],
      activeEffectBuffs: [],
      modifierWindows: [],
      modifierHitBuckets: [],
      modifierReplayHits: [],
      skillCastEvents: [],
      skillCooldownEvents: [],
      activeEffectSources: [],
      activeFactorItems: [],
      activePassiveSkills: [],
      activeProfessionSkills: [],
      activeProfessionTalents: [],
      modifierSourceActors: [],
      dmgPerTarget: [],
      healPerTarget: [],
      deaths: [],
    };
  }

  function slimCombatStats(stats: RawCombatStats): RawCombatStats {
    return {
      total: Number(stats?.total) || 0,
      effectiveTotal: Number(stats?.effectiveTotal) || 0,
      hits: Number(stats?.hits) || 0,
      critHits: Number(stats?.critHits) || 0,
      critTotal: Number(stats?.critTotal) || 0,
      luckyHits: Number(stats?.luckyHits) || 0,
      luckyTotal: Number(stats?.luckyTotal) || 0,
    };
  }

  function slimRawSkillStats(stats: RawSkillStats): RawSkillStats {
    return {
      totalValue: Number(stats?.totalValue) || 0,
      effectiveTotalValue: Number(stats?.effectiveTotalValue) || 0,
      hits: Number(stats?.hits) || 0,
      critHits: Number(stats?.critHits) || 0,
      critTotalValue: Number(stats?.critTotalValue) || 0,
      luckyHits: Number(stats?.luckyHits) || 0,
      luckyTotalValue: Number(stats?.luckyTotalValue) || 0,
      property: stats?.property ?? null,
      damageMode: stats?.damageMode ?? null,
    };
  }

  function finitePositiveReportId(value: unknown): number | null {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  type ModifierReportCatalogGate = {
    ignoredBuffIds?: number[];
    reportableBuffIds?: number[];
  };

  function modifierReportCatalogGate(catalog: unknown): {
    ignoredBuffIds: Set<number>;
    reportableBuffIds: Set<number>;
  } | null {
    if (!catalog || typeof catalog !== "object") return null;
    const maybeCatalog = catalog as ModifierReportCatalogGate;
    const reportableBuffIds = new Set(
      (maybeCatalog.reportableBuffIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
    if (reportableBuffIds.size === 0) return null;
    return {
      reportableBuffIds,
      ignoredBuffIds: new Set(
        (maybeCatalog.ignoredBuffIds ?? [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    };
  }

  function shouldKeepModifierReportBucket(
    bucket: HistoryEntityData["modifierHitBuckets"][number],
    gate: ReturnType<typeof modifierReportCatalogGate>,
  ): boolean {
    if (!gate) return true;
    const ids = [
      finitePositiveReportId(bucket.modifierBaseId),
      finitePositiveReportId(bucket.modifierSourceConfigId),
    ].filter((id): id is number => id !== null);
    if (ids.length === 0) return false;
    if (ids.some((id) => gate.ignoredBuffIds.has(id))) return false;
    return ids.some((id) => gate.reportableBuffIds.has(id));
  }

  function shouldKeepModifierReplaySource(
    source: ModifierReplayHitState["activeModifiers"][number],
    gate: ReturnType<typeof modifierReportCatalogGate>,
  ): boolean {
    if (!gate) return true;
    const ids = [
      finitePositiveReportId(source.modifierBaseId),
      finitePositiveReportId(source.modifierSourceConfigId),
    ].filter((id): id is number => id !== null);
    if (ids.length === 0) return false;
    if (ids.some((id) => gate.ignoredBuffIds.has(id))) return false;
    return ids.some((id) => gate.reportableBuffIds.has(id));
  }

  function slimModifierReplayHit(
    hit: ModifierReplayHitState,
    gate: ReturnType<typeof modifierReportCatalogGate>,
  ): ModifierReplayHitState | null {
    const activeModifiers = (hit.activeModifiers ?? [])
      .filter((source) => shouldKeepModifierReplaySource(source, gate))
      .map((source) => ({
        modifierBaseId: Number(source.modifierBaseId) || 0,
        modifierSourceConfigId: source.modifierSourceConfigId ?? null,
        modifierBuffLevel: source.modifierBuffLevel ?? null,
        modifierCount: source.modifierCount ?? null,
        modifierLayer: Number(source.modifierLayer) || 0,
        modifierHostUid: Number(source.modifierHostUid) || 0,
        modifierSourceUid: Number(source.modifierSourceUid) || 0,
      }));
    if (activeModifiers.length === 0) return null;
    return {
      timestampMs: Number(hit.timestampMs) || 0,
      skillKey: Number(hit.skillKey) || 0,
      damageId: Number(hit.damageId) || 0,
      ownerId: Number(hit.ownerId) || 0,
      ownerLevel: hit.ownerLevel ?? null,
      hitEventId: hit.hitEventId ?? null,
      damageSource: hit.damageSource ?? null,
      property: hit.property ?? null,
      damageMode: hit.damageMode ?? null,
      attackerUid: Number(hit.attackerUid) || 0,
      originalAttackerUid: Number(hit.originalAttackerUid) || 0,
      topSummonerUid: hit.topSummonerUid ?? null,
      targetUid: Number(hit.targetUid) || 0,
      targetMonsterTypeId: hit.targetMonsterTypeId ?? null,
      isHeal: Boolean(hit.isHeal),
      isCrit: Boolean(hit.isCrit),
      isLucky: Boolean(hit.isLucky),
      value: Number(hit.value) || 0,
      effectiveValue: Number(hit.effectiveValue) || 0,
      hpLossValue: Number(hit.hpLossValue) || 0,
      shieldLossValue: Number(hit.shieldLossValue) || 0,
      activeModifiers,
      attackerAttrs: (hit.attackerAttrs ?? []).map((attr) => ({
        attrId: Number(attr.attrId) || 0,
        valueInt: attr.valueInt ?? null,
        valueFloat: attr.valueFloat ?? null,
        valueBool: attr.valueBool ?? null,
      })),
      targetAttrs: (hit.targetAttrs ?? []).map((attr) => ({
        attrId: Number(attr.attrId) || 0,
        valueInt: attr.valueInt ?? null,
        valueFloat: attr.valueFloat ?? null,
        valueBool: attr.valueBool ?? null,
      })),
    };
  }

  type ModifierSourceOwnerHint = {
    ownerUid: number;
    ownerName: string;
    entityType: string;
  };

  function isModifierStateHostedOnTarget(hostUid: unknown, fallbackUid: number, targetUid: number): boolean {
    const resolvedHostUid = finitePositiveReportId(hostUid) ?? fallbackUid;
    return resolvedHostUid === targetUid;
  }

  function collectModifierSourceOwnerHints(
    targetUid: number,
    neededSourceUids: Set<number>,
    encounterEntities: HistoryEntityData[],
  ): Map<number, ModifierSourceOwnerHint> {
    const owners = new Map<number, ModifierSourceOwnerHint>();
    const ambiguousSourceUids = new Set<number>();

    function remember(sourceUidValue: unknown, ownerEntity: HistoryEntityData, hostUidValue: unknown) {
      const sourceUid = finitePositiveReportId(sourceUidValue);
      if (sourceUid === null || !neededSourceUids.has(sourceUid) || sourceUid === ownerEntity.uid) return;
      if (!isModifierStateHostedOnTarget(hostUidValue, ownerEntity.uid, targetUid)) return;
      if (ambiguousSourceUids.has(sourceUid)) return;

      const ownerUid = finitePositiveReportId(ownerEntity.uid);
      if (ownerUid === null) return;
      const existing = owners.get(sourceUid);
      if (existing && existing.ownerUid !== ownerUid) {
        owners.delete(sourceUid);
        ambiguousSourceUids.add(sourceUid);
        return;
      }

      owners.set(sourceUid, {
        ownerUid,
        ownerName: ownerEntity.name || `#${ownerUid}`,
        entityType: "EntChar",
      });
    }

    for (const ownerEntity of encounterEntities) {
      for (const state of ownerEntity.activeBuffs ?? []) remember(state.sourceUid, ownerEntity, state.hostUid);
      for (const state of ownerEntity.activeFactorBuffs ?? []) remember(state.sourceUid, ownerEntity, state.hostUid);
      for (const state of ownerEntity.activeEffectBuffs ?? []) remember(state.sourceUid, ownerEntity, state.hostUid);
      for (const state of ownerEntity.modifierWindows ?? []) remember(state.sourceUid, ownerEntity, state.hostUid);
    }

    return owners;
  }

  function slimModifierReportEntity(
    entity: HistoryEntityData,
    modifierSourceCatalog?: unknown,
    encounterEntities: HistoryEntityData[] = [],
  ): HistoryEntityData {
    const catalogGate = modifierReportCatalogGate(modifierSourceCatalog);
    const modifierHitBuckets = (entity.modifierHitBuckets ?? [])
      .filter((bucket) => shouldKeepModifierReportBucket(bucket, catalogGate))
      .map((bucket) => ({
        modifierBaseId: Number(bucket.modifierBaseId) || 0,
        modifierSourceConfigId: bucket.modifierSourceConfigId ?? null,
        modifierHostUid: Number(bucket.modifierHostUid) || 0,
        modifierSourceUid: Number(bucket.modifierSourceUid) || 0,
        skillKey: Number(bucket.skillKey) || 0,
        damageId: Number(bucket.damageId) || 0,
        targetUid: Number(bucket.targetUid) || 0,
        isHeal: Boolean(bucket.isHeal),
        hits: Number(bucket.hits) || 0,
        totalValue: Number(bucket.totalValue) || 0,
        effectiveTotalValue: Number(bucket.effectiveTotalValue) || 0,
        critHits: Number(bucket.critHits) || 0,
        critTotalValue: Number(bucket.critTotalValue) || 0,
        luckyHits: Number(bucket.luckyHits) || 0,
        luckyTotalValue: Number(bucket.luckyTotalValue) || 0,
      }) as HistoryEntityData["modifierHitBuckets"][number]);
    const modifierReplayHits = (entity.modifierReplayHits ?? [])
      .map((hit) => slimModifierReplayHit(hit, catalogGate))
      .filter((hit): hit is ModifierReplayHitState => hit !== null);

    const neededSkillIds = new Set<number>();
    for (const bucket of modifierHitBuckets) {
      const skillId = finitePositiveReportId(bucket.skillKey);
      const damageId = finitePositiveReportId(bucket.damageId);
      if (skillId !== null) neededSkillIds.add(skillId);
      if (damageId !== null) neededSkillIds.add(damageId);
    }

    const dmgSkills: HistoryEntityData["dmgSkills"] = {};
    for (const skillId of neededSkillIds) {
      const stats = entity.dmgSkills?.[skillId];
      if (stats) dmgSkills[skillId] = slimRawSkillStats(stats);
    }
    const neededSourceUids = new Set(
      modifierHitBuckets
        .map((bucket) => finitePositiveReportId(bucket.modifierSourceUid))
        .filter((uid): uid is number => uid !== null),
    );
    const sourceIdsByUid = new Map<number, { sourceConfigIds: Set<number>; baseIds: Set<number> }>();
    for (const bucket of modifierHitBuckets) {
      const sourceUid = finitePositiveReportId(bucket.modifierSourceUid);
      if (sourceUid === null) continue;
      let ids = sourceIdsByUid.get(sourceUid);
      if (!ids) {
        ids = { sourceConfigIds: new Set(), baseIds: new Set() };
        sourceIdsByUid.set(sourceUid, ids);
      }
      const sourceConfigId = finitePositiveReportId(bucket.modifierSourceConfigId);
      const baseId = finitePositiveReportId(bucket.modifierBaseId);
      if (sourceConfigId !== null) ids.sourceConfigIds.add(sourceConfigId);
      if (baseId !== null) ids.baseIds.add(baseId);
    }
    const sourceOwnerHints = collectModifierSourceOwnerHints(entity.uid, neededSourceUids, encounterEntities);
    const modifierSourceActors = (entity.modifierSourceActors ?? [])
      .filter((actor) => neededSourceUids.has(Number(actor.uid)))
      .map((actor) => {
        const uid = Number(actor.uid) || 0;
        const ownerHint = sourceOwnerHints.get(uid);
        return {
          uid,
          name: actor.name || `#${actor.uid}`,
          entityType: actor.entityType || ownerHint?.entityType || "Unknown",
          ownerUid: actor.ownerUid ?? ownerHint?.ownerUid ?? null,
          ownerName: actor.ownerName ?? ownerHint?.ownerName ?? null,
          sourceConfigIds: (actor.sourceConfigIds ?? []).map(Number).filter((id) => Number.isFinite(id) && id > 0),
          baseIds: (actor.baseIds ?? []).map(Number).filter((id) => Number.isFinite(id) && id > 0),
        };
      });
    const modifierSourceActorUids = new Set(modifierSourceActors.map((actor) => actor.uid));
    for (const sourceEntity of encounterEntities) {
      if (!neededSourceUids.has(sourceEntity.uid) || modifierSourceActorUids.has(sourceEntity.uid)) continue;
      modifierSourceActors.push({
        uid: sourceEntity.uid,
        name: sourceEntity.name || `#${sourceEntity.uid}`,
        entityType: "EntChar",
        ownerUid: null,
        ownerName: null,
        sourceConfigIds: [],
        baseIds: [],
      });
      modifierSourceActorUids.add(sourceEntity.uid);
    }
    for (const [sourceUid, ownerHint] of sourceOwnerHints) {
      if (modifierSourceActorUids.has(sourceUid)) continue;
      const ids = sourceIdsByUid.get(sourceUid);
      modifierSourceActors.push({
        uid: sourceUid,
        name: `#${sourceUid}`,
        entityType: "Unknown",
        ownerUid: ownerHint.ownerUid,
        ownerName: ownerHint.ownerName,
        sourceConfigIds: [...(ids?.sourceConfigIds ?? [])].sort((a, b) => a - b),
        baseIds: [...(ids?.baseIds ?? [])].sort((a, b) => a - b),
      });
      modifierSourceActorUids.add(sourceUid);
    }

    return {
      ...modifierReportEntityShell(entity),
      damage: slimCombatStats(entity.damage),
      dmgSkills,
      activeFactorBuffs: (entity.activeFactorBuffs ?? []).map((buff) => ({
        factorBuffId: Number(buff.factorBuffId) || 0,
        observedBuffId: Number(buff.observedBuffId) || 0,
        buffLevel: buff.buffLevel ?? null,
        partId: buff.partId ?? null,
        count: buff.count ?? null,
        fightSourceType: buff.fightSourceType ?? null,
        sourceConfigId: buff.sourceConfigId ?? null,
        layer: Number(buff.layer) || 0,
        durationMs: Number(buff.durationMs) || 0,
        createTimeMs: Number(buff.createTimeMs) || 0,
        receivedTimeMs: Number(buff.receivedTimeMs) || 0,
        hostUid: Number(buff.hostUid) || 0,
        sourceUid: Number(buff.sourceUid) || 0,
      })),
      activeFactorItems: (entity.activeFactorItems ?? []).map((item) => ({
        factorBuffId: Number(item.factorBuffId) || 0,
        itemConfigId: Number(item.itemConfigId) || 0,
        itemUuid: item.itemUuid ?? null,
        packageKey: Number(item.packageKey) || 0,
        packageType: item.packageType ?? null,
        grade: item.grade ?? null,
        familyId: item.familyId ?? null,
        runtimeSource: item.runtimeSource ?? "",
        selectorPath: item.selectorPath ?? null,
        selectorSignature: item.selectorSignature ?? null,
        selectorOffset: item.selectorOffset ?? null,
      })),
      modifierHitBuckets,
      modifierReplayHits,
      modifierSourceActors,
      ...(modifierSourceCatalog ? { modifierSourceCatalog } : {}),
      dmgPerTarget: (entity.dmgPerTarget ?? []).map((target) => ({
        targetUid: target.targetUid,
        targetName: target.targetName,
        totalValue: 0,
        damage: zeroCombatStats(),
        skills: {},
      })),
    };
  }

  // Tab state for encounter view
  let activeTab = $state<HistoryOverviewTab>("damage");

  const t = uiT("dps/history", () => SETTINGS.live.general.state.language);
  let modifierReportsEnabled = $derived.by(() =>
    SETTINGS.live.general.state.modifierReportsEnabled === true,
  );

  function historyPerfNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function historyLoadMs(startedAt: number): number {
    return Math.round(historyPerfNow() - startedAt);
  }

  function logHistoryTiming(message: string, details: Record<string, unknown>) {
    console.info(`[history] ${message}`, details);
  }

  function waitForHistoryPaint(): Promise<void> {
    if (typeof requestAnimationFrame !== "function") return Promise.resolve();
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function modifierLoadingText(): string {
    if (!modifierReportsEnabled) {
      return t("detail.modifierDisabled", "Modifier analysis is disabled in Meter Settings.");
    }
    if (modifierEntitiesLoading && modifierEntitiesLoadingKey === selectedModifierCacheKey) {
      return t("detail.loadingModifierEntities", "Loading modifier encounter data...");
    }
    if (modifierReportLoading && modifierReportLoadingKey === selectedModifierReportKey) {
      return t("detail.loadingModifierReport", "Building modifier report...");
    }
    return t("detail.loadingModifierRows", "Loading modifier details...");
  }

  function thLabel(col: { header?: string; headerKey?: string }): string {
    return col.headerKey ? t(col.headerKey, col.header ?? "") : (col.header ?? "");
  }

  const tabs: { key: HistoryOverviewTab; label: string }[] = [
    { key: "damage", label: t("detail.tab.damage", "伤害") },
    { key: "tanked", label: t("detail.tab.tanked", "承伤") },
    { key: "healing", label: t("detail.tab.healing", "治疗") },
    { key: "modifiers", label: t("detail.tab.modifiers", "Modifiers") },
    { key: "death", label: t("detail.tab.death", "Death Replay") },
  ];

  let encounterDurationSeconds = $derived.by(() => {
    if (!encounter) return 1;
    if (encounter.duration > 0) return Math.max(1, encounter.duration);
    return Math.max(
      1,
      ((encounter.endedAtMs ?? Date.now()) - encounter.startedAtMs) / 1000,
    );
  });

  function formatEncounterDuration(durationSeconds: number) {
    const secs = Math.max(0, Math.round(durationSeconds));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function buildHistoryPlayers(
    entities: HistoryEntityData[],
    durationSeconds: number,
    activeCombatDurationSeconds: number | null | undefined,
    localUid: number | null,
    options: BuildHistoryPlayersOptions = {},
  ): HistoryPlayerRow[] {
    const elapsedMs = Math.max(1, Math.floor(durationSeconds * 1000));
    const activeCombatMs = Math.max(
      1,
      Math.floor((activeCombatDurationSeconds ?? durationSeconds) * 1000),
    );
    const includeBossTargetAggregate = options.includeBossTargetAggregate !== false;
    const displayEntities = includeBossTargetAggregate
      ? entities.map((entity) => entityWithBossTargetAggregate(entity))
      : entities;
    const source = {
      entities: displayEntities,
      elapsedMs,
      activeCombatTimeMs: activeCombatMs,
      totalDmg: displayEntities.reduce((sum, entity) => sum + (entity.damage?.total ?? 0), 0),
      totalHeal: displayEntities.reduce((sum, entity) => sum + (entity.healing?.total ?? 0), 0),
      totalDmgBossOnly: displayEntities.reduce((sum, entity) => sum + (entity.damageBossOnly?.total ?? 0), 0),
    };

    const dpsRows = computePlayerRowsFromEntities(source, "dps");
    const healRows = computePlayerRowsFromEntities(source, "heal");
    const tankRows = computePlayerRowsFromEntities(source, "tanked");
    const dpsByUid = new Map(dpsRows.map((row) => [row.uid, row]));
    const healByUid = new Map(healRows.map((row) => [row.uid, row]));
    const tankByUid = new Map(tankRows.map((row) => [row.uid, row]));

    return displayEntities
      .map((entity) => {
        const dps = dpsByUid.get(entity.uid);
        const heal = healByUid.get(entity.uid);
        const tank = tankByUid.get(entity.uid);
        const className = entity.className || "";
        const classSpecName = entity.classSpecName || "";
        return {
          uid: entity.uid,
          name: entity.name || `#${entity.uid}`,
          isLocalPlayer: localUid !== null && entity.uid === localUid,
          className,
          classSpecName,
          classDisplay: formatClassSpecLabel(className, classSpecName) || t("detail.unknownClass", "未知职业"),
          abilityScore: entity.abilityScore || 0,
          seasonStrength: entity.seasonStrength || 0,
          totalDmg: dps?.totalDmg ?? 0,
          dps: dps?.dps ?? 0,
          tdps: dps?.tdps ?? 0,
          activeTimeMs: dps?.activeTimeMs ?? 0,
          dmgPct: dps?.dmgPct ?? 0,
          bossDmg: dps?.bossDmg ?? 0,
          bossDps: dps?.bossDps ?? 0,
          bossDmgPct: dps?.bossDmgPct ?? 0,
          critRate: dps?.critRate ?? 0,
          critDmgRate: dps?.critDmgRate ?? 0,
          luckyRate: dps?.luckyRate ?? 0,
          luckyDmgRate: dps?.luckyDmgRate ?? 0,
          hits: dps?.hits ?? 0,
          hitsPerMinute: dps?.hitsPerMinute ?? 0,
          effectiveTotal: dps?.effectiveTotal ?? 0,
          effectiveDps: dps?.effectiveDps ?? 0,
          damageTaken: tank?.totalDmg ?? 0,
          tankedPS: tank?.dps ?? 0,
          tankedPct: tank?.dmgPct ?? 0,
          critTakenRate: tank?.critRate ?? 0,
          hitsTaken: tank?.hits ?? 0,
          healDealt: heal?.totalDmg ?? 0,
          hps: heal?.dps ?? 0,
          healPct: heal?.dmgPct ?? 0,
          critHealRate: heal?.critRate ?? 0,
          hitsHeal: heal?.hits ?? 0,
          effectiveHeal: heal?.effectiveTotal ?? 0,
          ehps: heal?.effectiveDps ?? 0,
        };
      })
      .filter((row) => row.totalDmg > 0 || row.healDealt > 0 || row.damageTaken > 0);
  }

  // Filtered and sorted players based on active tab
  function zeroCombatStats(): RawCombatStats {
    return {
      total: 0,
      effectiveTotal: 0,
      hits: 0,
      critHits: 0,
      critTotal: 0,
      luckyHits: 0,
      luckyTotal: 0,
    };
  }

  function addCombatStats(left: RawCombatStats, right: RawCombatStats): RawCombatStats {
    return {
      total: left.total + right.total,
      effectiveTotal: left.effectiveTotal + right.effectiveTotal,
      hits: left.hits + right.hits,
      critHits: left.critHits + right.critHits,
      critTotal: left.critTotal + right.critTotal,
      luckyHits: left.luckyHits + right.luckyHits,
      luckyTotal: left.luckyTotal + right.luckyTotal,
    };
  }

  function isBossOrEliteTargetName(targetName: string): boolean {
    const name = targetName.trim();
    if (!name) return false;
    const lowerName = name.toLowerCase();
    return (
      /^(boss|elite)\s*[:：-]/.test(lowerName) ||
      name.startsWith("首领") ||
      name.startsWith("精英") ||
      name.startsWith("ボス") ||
      name.startsWith("エリート")
    );
  }

  function bossOrEliteTargetStats(entity: HistoryEntityData): RawCombatStats {
    let stats = zeroCombatStats();
    for (const target of entity.dmgPerTarget ?? []) {
      if (!isBossOrEliteTargetName(target.targetName)) continue;
      stats = addCombatStats(stats, target.damage ?? zeroCombatStats());
    }
    return stats;
  }

  function entityWithBossTargetAggregate(entity: HistoryEntityData): HistoryEntityData {
    const targetStats = bossOrEliteTargetStats(entity);
    if (targetStats.total <= 0) return entity;
    return {
      ...entity,
      damageBossOnly: targetStats,
    };
  }

  let perTargetByUid = $derived.by(() =>
    new Map(
      rawEntities.map((row) => [
        row.uid,
        {
          uid: row.uid,
          dmgTargets: row.dmgPerTarget ?? [],
          healTargets: row.healPerTarget ?? [],
        } satisfies EntityPerTargetData,
      ]),
    ),
  );

  let entityNameByUid = $derived.by(() => {
    const mapping = new Map<number, string>();
    for (const entity of rawEntities) {
      if (entity.name && entity.name.trim().length > 0) {
        mapping.set(entity.uid, entity.name);
      }
    }
    return mapping;
  });

  let pushedUidSet = $derived.by(() => new Set(rawEntities.map((row) => row.uid)));
  let playerTargetUidSet = $derived.by(() =>
    new Set(
      rawEntities
        .filter((row) =>
          row.uid === localPlayerUid ||
          row.classId > 0 ||
          row.classSpec > 0 ||
          row.className.trim().length > 0 ||
          row.classSpecName.trim().length > 0)
        .map((row) => row.uid),
    ),
  );

  function isNumericLikeName(name: string): boolean {
    return /^#?\d+$/.test(name.trim());
  }

  let overviewTargets = $derived.by(() => {
    const merged = new Map<number, OverviewTargetOption>();
    for (const row of rawEntities) {
      for (const target of row.dmgPerTarget ?? []) {
        const existing = merged.get(target.targetUid);
        if (existing) {
          existing.totalValue += target.totalValue;
          if (existing.targetName.startsWith("#") && target.targetName) {
            existing.targetName = target.targetName;
          }
        } else {
          merged.set(target.targetUid, {
            targetUid: target.targetUid,
            targetName: target.targetName,
            totalValue: target.totalValue,
          });
        }
      }
    }
    return [...merged.values()]
      .filter(
        (target) =>
          target.targetName.trim().length > 0 &&
          !playerTargetUidSet.has(target.targetUid) &&
          !isNumericLikeName(target.targetName),
      )
      .sort((a, b) => b.totalValue - a.totalValue);
  });

  let displayedPlayers = $derived.by(() => {
    if (activeTab === "damage") {
      if (overviewTargetUid === null) {
        return [...players].sort((a, b) => b.totalDmg - a.totalDmg);
      }

      const targetEntities = rawEntities.map((entity) => {
        const perTarget = perTargetByUid
          .get(entity.uid)
          ?.dmgTargets.find((target) => target.targetUid === overviewTargetUid);
        const damage = perTarget?.damage ?? zeroCombatStats();
        return {
          ...entity,
          damage,
          damageBossOnly: zeroCombatStats(),
          healing: zeroCombatStats(),
          taken: zeroCombatStats(),
        };
      });
      return buildHistoryPlayers(
        targetEntities,
        encounterDurationSeconds,
        encounter?.activeCombatDuration ?? null,
        localPlayerUid,
        { includeBossTargetAggregate: false },
      )
        .sort((a, b) => b.totalDmg - a.totalDmg);
    } else if (activeTab === "tanked") {
      return [...players]
        .filter((p) => p.damageTaken > 0)
        .sort((a, b) => b.damageTaken - a.damageTaken);
    } else if (activeTab === "healing") {
      return [...players]
        .filter((p) => p.healDealt > 0)
        .sort((a, b) => b.healDealt - a.healDealt);
    }
    return players;
  });

  let selectedPlayer = $derived.by(() => {
    if (!charId) return null;
    const playerUid = Number(charId);
    if (!Number.isFinite(playerUid)) return null;
    return players.find((p) => p.uid === playerUid) ?? null;
  });

  let selectedEntity = $derived.by(() => {
    if (!charId) return null;
    const playerUid = Number(charId);
    if (!Number.isFinite(playerUid)) return null;
    return rawEntities.find((entity) => entity.uid === playerUid) ?? null;
  });

  let selectedSkillTargetUid = $derived.by(() => {
    const raw = $page.url.searchParams.get("targetUid");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  });

  let selectedDeathTs = $derived.by(() => {
    const raw = $page.url.searchParams.get("deathTs");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  });

  let deathEntries = $derived.by<DeathPlayerEntry[]>(() =>
    rawEntities
      .filter((entity) => (entity.deaths?.length ?? 0) > 0)
      .map((entity) => ({
        uid: entity.uid,
        name: entity.name || `#${entity.uid}`,
        className: entity.className || "",
        classSpecName: entity.classSpecName || "",
        deaths: entity.deaths ?? [],
      })),
  );

  let selectedDeathRecord = $derived.by(() => {
    if (!selectedEntity || selectedDeathTs == null) return null;
    return (
      selectedEntity.deaths?.find(
        (record) => Number(record.deathTimestampMs) === selectedDeathTs,
      ) ?? null
    );
  });

  function flattenGrouping(grouping: {
    groups: RecountGroup[];
    ungrouped: SkillDisplayRow[];
  }): FlatSkillRow[] {
    const rows: FlatSkillRow[] = [];
    const topLevel = [
      ...grouping.groups.map(
        (group): { kind: "group"; row: RecountGroup } => ({ kind: "group", row: group }),
      ),
      ...grouping.ungrouped.map(
        (skill): { kind: "skill"; row: SkillDisplayRow } => ({ kind: "skill", row: skill }),
      ),
    ].sort((a, b) => b.row.totalDmg - a.row.totalDmg);

    for (const item of topLevel) {
      if (item.kind === "skill") {
        rows.push({
          kind: "skill",
          key: `u-${item.row.skillId}`,
          depth: 0,
          row: item.row,
        });
        continue;
      }

      const group = item.row;
      rows.push({
        kind: "group",
        key: `g-${group.recountId}`,
        depth: 0,
        row: group,
      });
      if (!expandedGroups.has(group.recountId)) continue;
      for (const skill of group.skills) {
        rows.push({
          kind: "skill",
          key: `gs-${group.recountId}-${skill.skillId}`,
          depth: 1,
          row: skill,
        });
      }
    }
    return rows;
  }

  let skillGrouping = $derived.by(() => {
    if (!selectedEntity) return { groups: [], ungrouped: [] };
    const durationSecs = Math.max(1, encounterDurationSeconds);
    if (skillType === "dps" && selectedSkillTargetUid !== null && selectedPlayer) {
      const targetStats = perTargetByUid
        .get(selectedPlayer.uid)
        ?.dmgTargets.find((target) => target.targetUid === selectedSkillTargetUid);
      if (!targetStats) return { groups: [], ungrouped: [] };
      return groupSkillsByRecount(
        targetStats.skills,
        durationSecs,
        targetStats.totalValue,
        [],
        [],
        [],
        [],
        { includeContributionSources: false },
      );
    }
    const skills =
      skillType === "heal"
        ? selectedEntity.healSkills
        : skillType === "tanked"
          ? selectedEntity.takenSkills
          : selectedEntity.dmgSkills;
    const parentTotal =
      skillType === "heal"
        ? selectedEntity.healing.total
        : skillType === "tanked"
          ? selectedEntity.taken.total
          : selectedEntity.damage.total;
    return groupSkillsByRecount(
      skills,
      durationSecs,
      parentTotal,
      [],
      [],
      [],
      [],
      { includeContributionSources: false },
    );
  });

  let flatSkillRows = $derived.by(() => flattenGrouping(skillGrouping));

  function hasModifierState(entity: HistoryEntityData | undefined): boolean {
    if (!entity) return false;
    return Boolean(
      entity.activeBuffs?.length
      || entity.activeFactorBuffs?.length
      || entity.activeEffectBuffs?.length
      || entity.modifierWindows?.length
      || entity.activeEffectSources?.length
      || entity.activeFactorItems?.length
      || entity.activePassiveSkills?.length
      || entity.activeProfessionSkills?.length
      || entity.activeProfessionTalents?.length,
    );
  }

  let modifierPlayers = $derived.by(() =>
    activeTab === "modifiers" && modifierReportsEnabled
      ? [...players]
          .filter((player) =>
            player.totalDmg > 0
            || hasModifierState(rawEntities.find((entity) => entity.uid === player.uid))
          )
          .sort((left, right) => {
            if (left.isLocalPlayer !== right.isLocalPlayer) return left.isLocalPlayer ? -1 : 1;
            return right.totalDmg - left.totalDmg;
          })
      : [],
  );

  let selectedModifierPlayer = $derived.by(() => {
    if (modifierPlayers.length === 0) return null;
    if (modifierPlayerUid !== null) {
      const selected = modifierPlayers.find((player) => player.uid === modifierPlayerUid);
      if (selected) return selected;
    }
    if (localPlayerUid !== null) {
      const local = modifierPlayers.find((player) => player.uid === localPlayerUid);
      if (local) return local;
    }
    return modifierPlayers[0] ?? null;
  });

  let selectedModifierCacheKey = $derived.by(() =>
    modifierReportsEnabled && encounterId !== null && selectedModifierPlayer
      ? modifierCacheKey(encounterId, selectedModifierPlayer.uid)
      : null,
  );

  let selectedModifierReportKey = $derived.by(() =>
    selectedModifierCacheKey ? modifierReportCacheKey(selectedModifierCacheKey) : null,
  );

  let modifierRawEntities = $derived.by(() =>
    selectedModifierCacheKey ? (modifierEntityCache[selectedModifierCacheKey] ?? []) : [],
  );

  let modifierEntitySource = $derived.by(() =>
    modifierRawEntities.length > 0 ? modifierRawEntities : rawEntities,
  );

  let selectedModifierEntity = $derived.by(() => {
    if (!selectedModifierPlayer) return null;
    return modifierEntitySource.find((entity) => entity.uid === selectedModifierPlayer.uid) ?? null;
  });

  let modifierRows = $derived.by(() =>
    modifierReportsEnabled && !charId && activeTab === "modifiers" && selectedModifierReportKey
      ? (modifierReportCache[selectedModifierReportKey] ?? [])
      : [],
  );

  function modifierSkillGroupKey(skill: ModifierActivitySkillRow): string {
    if (skill.recountId !== undefined) return `recount:${skill.recountId}`;
    return `skill:${skill.skillId}:${skill.damageIds.join(",")}`;
  }

  function normalizeModifierBreakdownSource(row: ModifierBreakdownRow, source: ModifierBreakdownSourceRow) {
    const cappedTotal = Math.min(source.totalDmg, row.totalDmg);
    const cappedEffectiveTotal = Math.min(source.effectiveTotal, row.effectiveTotal);
    const cappedHits = Math.min(source.hits, row.hits);
    const damageScale = source.totalDmg > 0 ? cappedTotal / source.totalDmg : 0;
    const hitScale = source.hits > 0 ? cappedHits / source.hits : 0;

    source.totalDmg = cappedTotal;
    source.effectiveTotal = cappedEffectiveTotal;
    if (source.estimatedContributionTotal !== undefined) {
      source.estimatedContributionTotal *= damageScale;
      source.estimatedContributionPct = displayPct(
        row.totalDmg > 0 ? (source.estimatedContributionTotal / row.totalDmg) * row.dmgPct : 0,
      );
    }
    source.dmgPct = displayPct(row.totalDmg > 0 ? (cappedTotal / row.totalDmg) * row.dmgPct : 0);
    source.sourcePct = displayPct(row.totalDmg > 0 ? (cappedTotal / row.totalDmg) * 100 : 0);
    source.dps *= damageScale;
    source.hits = cappedHits;
    source.hitsPerMinute *= hitScale;
  }

  function buildModifierBreakdownRows(rows: ModifierActivityRow[]): ModifierBreakdownRow[] {
    const bySkill = new Map<string, ModifierBreakdownRow>();
    const sourceKeysBySkill = new Map<string, Set<string>>();

    for (const source of rows) {
      for (const skill of source.skills) {
        const key = modifierSkillGroupKey(skill);
        let parent = bySkill.get(key);
        if (!parent) {
          parent = {
            key,
            rowKind: skill.rowKind,
            skillId: skill.skillId,
            ...(skill.recountId !== undefined ? { recountId: skill.recountId } : {}),
            name: skill.name,
            ...(skill.names ? { names: skill.names } : {}),
            damageIds: [...skill.damageIds],
            match: skill.match,
            totalDmg: skill.baseTotalDmg,
            effectiveTotal: skill.baseEffectiveTotal,
            dmgPct: skill.baseDmgPct,
            sourcePct: 100,
            coveragePct: 100,
            dps: skill.baseDps,
            hits: skill.baseHits,
            hitsPerMinute: skill.baseHitsPerMinute,
            critRate: skill.critRate,
            luckyRate: skill.luckyRate,
            sources: [],
          };
          bySkill.set(key, parent);
          sourceKeysBySkill.set(key, new Set<string>());
        } else if (skill.baseTotalDmg > parent.totalDmg) {
          parent.totalDmg = skill.baseTotalDmg;
          parent.effectiveTotal = skill.baseEffectiveTotal;
          parent.dmgPct = skill.baseDmgPct;
          parent.dps = skill.baseDps;
          parent.hits = skill.baseHits;
          parent.hitsPerMinute = skill.baseHitsPerMinute;
          parent.critRate = skill.critRate;
          parent.luckyRate = skill.luckyRate;
        }

        const seenSources = sourceKeysBySkill.get(key);
        if (seenSources?.has(source.key)) continue;
        seenSources?.add(source.key);
        parent.sources.push({
          key: `${key}:${source.key}`,
          source,
          sourceId: source.sourceId,
          sourceIds: [...source.sourceIds],
          sourceKind: source.sourceKind,
          ...(source.sourceType ? { sourceType: source.sourceType } : {}),
          ...(source.sourceEntityId !== undefined ? { sourceEntityId: source.sourceEntityId } : {}),
          sourceName: source.sourceName,
          ...(source.sourceNames ? { sourceNames: source.sourceNames } : {}),
          ...(source.displayOwnerKind ? { displayOwnerKind: source.displayOwnerKind } : {}),
          buffIds: [...source.buffIds],
          evidence: [...source.evidence],
          ...(source.attributionModel ? { attributionModel: source.attributionModel } : {}),
          actorSummary: source.actorSummary,
          targetDamageIds: [...source.targetDamageIds],
          targetRecountIds: [...source.targetRecountIds],
          match: skill.match,
          totalDmg: skill.totalDmg,
          effectiveTotal: skill.effectiveTotal,
          ...(skill.estimatedContributionTotal !== undefined
            ? { estimatedContributionTotal: skill.estimatedContributionTotal }
            : {}),
          ...(skill.estimatedContributionPct !== undefined
            ? { estimatedContributionPct: skill.estimatedContributionPct }
            : {}),
          ...(skill.estimatedContributionConfidence
            ? { estimatedContributionConfidence: skill.estimatedContributionConfidence }
            : {}),
          ...(source.formulaReplayModel ? { formulaReplayModel: source.formulaReplayModel } : {}),
          ...(skill.observedDmgPerHit !== undefined ? { observedDmgPerHit: skill.observedDmgPerHit } : {}),
          ...(skill.baselineDmgPerHit !== undefined ? { baselineDmgPerHit: skill.baselineDmgPerHit } : {}),
          ...(skill.baselineHits !== undefined ? { baselineHits: skill.baselineHits } : {}),
          dmgPct: skill.dmgPct,
          sourcePct: skill.sourcePct,
          coveragePct: skill.coveragePct,
          dps: skill.dps,
          hits: skill.hits,
          hitsPerMinute: skill.hitsPerMinute,
          critRate: skill.critRate,
          luckyRate: skill.luckyRate,
        });
      }
    }

    for (const row of bySkill.values()) {
      const directMatches = row.sources.filter((source) => source.match === "direct-static-target").length;
      row.match = directMatches === row.sources.length
          ? "direct-static-target"
          : directMatches === 0
            ? "no-static-target"
            : "mixed";
      for (const source of row.sources) {
        normalizeModifierBreakdownSource(row, source);
      }
      row.sources.sort((left, right) =>
        Number(right.match === "direct-static-target") - Number(left.match === "direct-static-target")
        || right.sourcePct - left.sourcePct
        || right.hits - left.hits
        || modifierSourceLabel(left.source, SETTINGS.live.general.state.language as LocaleCode)
          .localeCompare(modifierSourceLabel(right.source, SETTINGS.live.general.state.language as LocaleCode)),
      );
    }

    return [...bySkill.values()].sort((left, right) =>
      right.totalDmg - left.totalDmg
      || right.hits - left.hits
      || left.name.localeCompare(right.name),
    );
  }

  function isFullCoverage(value: number): boolean {
    return value >= 99.95;
  }

  let modifierBreakdownRows = $derived.by(() => buildModifierBreakdownRows(modifierRows));

  let visibleSkillFirstModifierRows = $derived.by(() => {
    if (!modifierHideFullCoverage) return modifierBreakdownRows;
    return modifierBreakdownRows
      .map((row) => ({
        ...row,
        sources: row.sources.filter((source) => !isFullCoverage(source.sourcePct)),
      }));
  });

  let visibleModifierActivityRows = $derived.by(() => {
    if (!modifierHideFullCoverage) return modifierRows;
    return modifierRows.filter((row) => !isFullCoverage(row.coveragePct));
  });

  function flattenSkillFirstModifierRows(rows: ModifierBreakdownRow[]): FlatModifierRow[] {
    const flattened: FlatModifierRow[] = [];
    for (const row of rows) {
      flattened.push({ kind: "skill", key: row.key, row });
      if (!expandedModifierRows.has(row.key)) continue;
      for (const source of row.sources) {
        flattened.push({
          kind: "source",
          key: source.key,
          skillKey: row.key,
          row: source,
        });
      }
    }
    return flattened;
  }

  function flattenModifierFirstRows(rows: ModifierActivityRow[]): FlatModifierRow[] {
    const flattened: FlatModifierRow[] = [];
    for (const row of rows) {
      flattened.push({ kind: "modifier", key: row.key, row });
      if (!expandedModifierRows.has(row.key)) continue;
      for (const skill of row.skills) {
        flattened.push({
          kind: "modifier-skill",
          key: `${row.key}:${skill.key}`,
          sourceKey: row.key,
          row: skill,
          source: row,
        });
      }
    }
    return flattened;
  }

  let visibleModifierRows = $derived.by(() =>
    modifierViewMode === "by-modifier" ? visibleModifierActivityRows : visibleSkillFirstModifierRows,
  );

  let flatModifierRows = $derived.by(() =>
    modifierViewMode === "by-modifier"
      ? flattenModifierFirstRows(visibleModifierActivityRows)
      : flattenSkillFirstModifierRows(visibleSkillFirstModifierRows),
  );

  let healTargetSummary = $derived.by(() => {
    if (!selectedPlayer || skillType !== "heal") return [] as PerTargetStats[];
    return [...(perTargetByUid.get(selectedPlayer.uid)?.healTargets ?? [])]
      .map((target) => {
        const resolvedName = entityNameByUid.get(target.targetUid);
        return resolvedName
          ? { ...target, targetName: resolvedName }
          : target;
      })
      .filter(
        (target) =>
          target.totalValue > 0 &&
          (!isNumericLikeName(target.targetName) || pushedUidSet.has(target.targetUid)),
      )
      .sort((a, b) => b.totalValue - a.totalValue);
  });

  let healTargetTotal = $derived.by(() => {
    return healTargetSummary.reduce((sum, target) => sum + target.totalValue, 0);
  });

  function rowTotalDmg(row: FlatSkillRow): number {
    return row.row.totalDmg ?? 0;
  }

  function rowDmgPct(row: FlatSkillRow): number {
    return row.row.dmgPct ?? 0;
  }

  function skillCellValue(row: FlatSkillRow, key: string): number {
    const value = (row.row as Record<string, unknown>)[key];
    return typeof value === "number" ? value : 0;
  }

  let maxDpsPlayer = $derived.by(() => displayedPlayers.reduce((max, p) => Math.max(max, p.totalDmg || 0), 0));
  let maxHealPlayer = $derived.by(() => displayedPlayers.reduce((max, p) => Math.max(max, p.healDealt || 0), 0));
  let maxTankedPlayer = $derived.by(() => displayedPlayers.reduce((max, p) => Math.max(max, p.damageTaken || 0), 0));
  let maxSkillTotal = $derived.by(() => flatSkillRows.reduce((max, row) => Math.max(max, rowTotalDmg(row)), 0));
  let maxModifierTotal = $derived.by(() => visibleModifierRows.reduce((max, row) => Math.max(max, row.totalDmg), 0));

  // Get visible columns based on settings and active tab
  let visiblePlayerColumns = $derived.by(() => {
    if (activeTab === "healing") {
      return historyHealPlayerColumns.filter((col) => settings.state.history.heal.players[col.key] ?? true);
    } else if (activeTab === "tanked") {
      return historyTankedPlayerColumns.filter((col) => settings.state.history.tanked.players[col.key] ?? true);
    }
    return historyDpsPlayerColumns.filter((col) => {
      if (col.key === "effectiveTotal" || col.key === "effectiveDps") return false;
      if (overviewTargetUid !== null && (col.key === "bossDmg" || col.key === "bossDps")) return false;
      const defaultValue = DEFAULT_HISTORY_STATS[col.key as keyof typeof DEFAULT_HISTORY_STATS] ?? true;
      const setting = settings.state.history.dps.players[col.key as keyof typeof settings.state.history.dps.players];
      return setting ?? defaultValue;
    });
  });

  let visibleSkillColumns = $derived.by(() => {
    if (skillType === "heal") {
      return historyHealSkillColumns.filter((col) => settings.state.history.heal.skillBreakdown[col.key]);
    } else if (skillType === "tanked") {
      return historyTankedSkillColumns.filter((col) => settings.state.history.tanked.skillBreakdown[col.key]);
    }
    return historyDpsSkillColumns.filter((col) => col.key !== "effectiveTotal" && col.key !== "effectiveDps" && settings.state.history.dps.skillBreakdown[col.key]);
  });

  let skillHitsColumnVisible = $derived.by(() =>
    visibleSkillColumns.some((col) => col.key === "hits"),
  );

  const websiteBaseUrl = $derived.by(() => {
    const apiBase = (SETTINGS.moduleSync.state.baseUrl || "").trim() || null;
    if (!apiBase) {
      return "https://bpsr.app";
    }

    try {
      const url = new URL(apiBase);
      if (url.hostname.startsWith("api.")) {
        url.hostname = url.hostname.replace(/^api\./, "");
      }
      url.pathname = "";
      return url.toString().replace(/\/$/, "");
    } catch (err) {
      console.error("Failed to parse website URL from API base:", apiBase, err);
      return "https://bpsr.app";
    }
  });
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1,
  );

  function toggleGroup(id: number) {
    const next = new Set(expandedGroups);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedGroups = next;
  }

  function toggleModifierRow(key: string) {
    const next = new Set(expandedModifierRows);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    expandedModifierRows = next;
  }

  function modifierSourceLabel(row: ModifierActivityRow, language: LocaleCode): string {
    const rowLabel = resolveModifierSourceName(row, language);
    const sourceIdBuffId = Number(row.sourceId.match(/^buff-source:(\d+)/)?.[1] ?? NaN);
    const placeholderBuffIds = [
      Number.isFinite(sourceIdBuffId) ? sourceIdBuffId : null,
      row.sourceEntityId,
      ...row.buffIds,
    ].filter((buffId): buffId is number =>
      typeof buffId === "number" && Number.isFinite(buffId) && buffId > 0
    );
    const isRawBuffSourceLabel = placeholderBuffIds.some((buffId) =>
      rowLabel === `buff-source:${buffId}`
        || rowLabel === `#${buffId}`
        || new RegExp(`^(?:Buff|Unmapped Buff) ${buffId}$`, "i").test(rowLabel)
    );

    if (!isRawBuffSourceLabel && (row.sourceNames || !/^(?:Buff \d+|Unknown Modifier)$/i.test(rowLabel))) {
      return rowLabel;
    }

    for (const buffId of placeholderBuffIds) {
      const localized = lookupBuffLocalizedNames(buffId);
      const fallback = lookupDefaultBuffName(buffId) ?? rowLabel;
      const label = resolveLocalizedText(localized, language, fallback).trim();
      if (label && label !== `#${buffId}`) return label;
    }

    return rowLabel;
  }

  function modifierSourceDisplayLabel(row: ModifierActivityRow, language: LocaleCode): string {
    const label = modifierSourceLabel(row, language);
    const providerSuffix = modifierExternalSourceInlineSuffix(row.actorSummary);
    return providerSuffix ? `${label} ${providerSuffix}` : label;
  }

  function modifierSourceUidLabel(row: ModifierActivityRow): string {
    if (row.sourceEntityId !== undefined && Number.isFinite(row.sourceEntityId)) {
      return `#${row.sourceEntityId}`;
    }
    const sourceIdBuffMatch = row.sourceId.match(/^buff-source:(\d+)/);
    if (sourceIdBuffMatch?.[1]) return `#${sourceIdBuffMatch[1]}`;
    return row.sourceId;
  }

  function shouldShowModifierSourceUid(row: ModifierActivityRow): boolean {
    return SETTINGS.live.general.state.skillIdDisplayMode === 'column'
      || /^buff-source:\d+/.test(row.sourceId);
  }

  function emptyModifierActorSummary(): ModifierActorSummary {
    return {
      hostUids: [],
      sourceUids: [],
      externalSourceUids: [],
      selfSourceUids: [],
      sourceActors: [],
      externalSourceActors: [],
      selfSourceActors: [],
    };
  }

  function mergeModifierActors(left: ModifierSourceActor[], right: ModifierSourceActor[]): ModifierSourceActor[] {
    const byUid = new Map<number, ModifierSourceActor>();
    for (const actor of [...left, ...right]) {
      const uid = finitePositiveReportId(actor.uid);
      if (uid === null) continue;
      const previous = byUid.get(uid);
      const merged: ModifierSourceActor = {
        uid,
        name: previous?.name && previous.name !== `#${uid}` ? previous.name : (actor.name || `#${uid}`),
        sourceConfigIds: [...new Set([...(previous?.sourceConfigIds ?? []), ...(actor.sourceConfigIds ?? [])])].sort((a, b) => a - b),
        baseIds: [...new Set([...(previous?.baseIds ?? []), ...(actor.baseIds ?? [])])].sort((a, b) => a - b),
      };
      const entityType = previous?.entityType ?? actor.entityType;
      const ownerUid = previous?.ownerUid ?? actor.ownerUid;
      const ownerName = previous?.ownerName ?? actor.ownerName;
      if (entityType) merged.entityType = entityType;
      if (ownerUid !== undefined) merged.ownerUid = ownerUid;
      if (ownerName) merged.ownerName = ownerName;
      byUid.set(uid, merged);
    }
    return [...byUid.values()].sort((leftActor, rightActor) => leftActor.uid - rightActor.uid);
  }

  function mergeModifierActorSummaries(summaries: ModifierActorSummary[]): ModifierActorSummary {
    return summaries.reduce((summary, next) => ({
      hostUids: [...new Set([...summary.hostUids, ...(next.hostUids ?? [])])].sort((a, b) => a - b),
      sourceUids: [...new Set([...summary.sourceUids, ...(next.sourceUids ?? [])])].sort((a, b) => a - b),
      externalSourceUids: [...new Set([...summary.externalSourceUids, ...(next.externalSourceUids ?? [])])].sort((a, b) => a - b),
      selfSourceUids: [...new Set([...summary.selfSourceUids, ...(next.selfSourceUids ?? [])])].sort((a, b) => a - b),
      sourceActors: mergeModifierActors(summary.sourceActors ?? [], next.sourceActors ?? []),
      externalSourceActors: mergeModifierActors(summary.externalSourceActors ?? [], next.externalSourceActors ?? []),
      selfSourceActors: mergeModifierActors(summary.selfSourceActors ?? [], next.selfSourceActors ?? []),
    }), emptyModifierActorSummary());
  }

  function modifierHasExternalSources(summary: ModifierActorSummary): boolean {
    return (summary.externalSourceUids?.length ?? 0) > 0 || (summary.externalSourceActors?.length ?? 0) > 0;
  }

  function modifierSourceActorLabel(actor: ModifierSourceActor): string {
    const uid = finitePositiveReportId(actor.uid) ?? 0;
    const idLabel = uid > 0 ? `#${uid}` : "#?";
    const name = actor.name?.trim();
    const actorLabel = name && name !== idLabel ? `${name} (${idLabel})` : `${t("detail.modifierLocalActor", "Local actor")} ${idLabel}`;
    const owner = actor.ownerName?.trim();
    const sourceIds = [...new Set([...(actor.sourceConfigIds ?? []), ...(actor.baseIds ?? [])])]
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((a, b) => a - b);
    const idSuffix = sourceIds.length > 0
      ? ` ${t("detail.modifierTitleBuffIds", "Buff IDs")}: ${sourceIds.map((id) => `#${id}`).join(", ")}`
      : "";
    if (owner && owner !== name) return `${owner} -> ${actorLabel}${idSuffix}`;
    return `${actorLabel}${idSuffix}`;
  }

  function modifierSourceActorDisplayName(actor: ModifierSourceActor): string {
    const uid = finitePositiveReportId(actor.uid) ?? 0;
    const idLabel = uid > 0 ? `#${uid}` : "#?";
    const owner = actor.ownerName?.trim();
    const name = actor.name?.trim();
    const displayName = owner && owner !== name ? owner : name;
    return displayName && displayName !== idLabel ? displayName : idLabel;
  }

  function modifierExternalSourceNames(summary: ModifierActorSummary, maxNames = 3): string[] {
    if (!modifierHasExternalSources(summary)) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const actor of summary.externalSourceActors ?? []) {
      const name = modifierSourceActorDisplayName(actor);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    if (names.length === 0) {
      for (const uid of summary.externalSourceUids ?? []) {
        const name = `#${uid}`;
        if (seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
    }
    if (names.length <= maxNames) return names;
    return [
      ...names.slice(0, maxNames),
      `+${names.length - maxNames}`,
    ];
  }

  function modifierExternalSourceInlineSuffix(summary: ModifierActorSummary): string {
    const names = modifierExternalSourceNames(summary);
    if (names.length === 0) return "";
    return `(${t("detail.modifierExternalFrom", "from")}: ${names.join(", ")})`;
  }

  function modifierExternalBadgeLabel(summary: ModifierActorSummary): string {
    const names = modifierExternalSourceNames(summary);
    if (names.length > 0) return `${t("detail.modifierExternalFrom", "from")}: ${names.join(", ")}`;
    return t("detail.modifierExternal", "External");
  }

  function modifierExternalBadgeTitle(summary: ModifierActorSummary): string {
    if (!modifierHasExternalSources(summary)) return "";
    const actors = summary.externalSourceActors ?? [];
    const lines = actors.length > 0
      ? actors.map(modifierSourceActorLabel)
      : (summary.externalSourceUids ?? []).map((uid) => `${t("detail.modifierLocalActor", "Local actor")} #${uid}`);
    return `${t("detail.modifierTitleExternalSources", "External sources")}:\n${lines.join("\n")}`;
  }

  function hoverDescriptionsEnabled(): boolean {
    return SETTINGS.live.general.state.showHoverDescriptions !== false;
  }

  function shouldShowUidHover(): boolean {
    return SETTINGS.live.general.state.skillIdDisplayMode === 'hover' || hoverDescriptionsEnabled();
  }

  function modifierSkillLabel(
    row: {
      name: string;
      names?: ModifierActivitySkillRow["names"] | undefined;
      skillId: number;
      damageIds: number[];
    },
    language: LocaleCode,
  ): string {
    const generatedFallback = lookupDamageIdName(row.skillId);
    const fallback = !/^Skill \d+$/i.test(row.name)
      ? row.name
      : generatedFallback;
    const translated = resolveSkillTranslation(row.skillId, language, fallback);
    if (translated && translated !== fallback) return translated;

    const localized = resolveLocalizedText(row.names, language, fallback).trim();
    if (localized && !/^Skill \d+$/i.test(localized)) return localized;

    for (const damageId of row.damageIds) {
      const damageName = lookupDamageIdName(damageId);
      if (damageName && !/^Unknown \(/.test(damageName)) return damageName;
    }

    return localized || fallback;
  }

  function modifierMatchLabel(match: ModifierActivityRow["match"] | ModifierActivitySkillRow["match"]): string {
    if (match === "direct-static-target") return t("detail.modifierTargeted", "Targeted");
    if (match === "mixed") return t("detail.modifierMixed", "Mixed");
    return t("detail.modifierActive", "Active");
  }

  function modifierAttributionLabel(model: ModifierActivityRow["attributionModel"]): string {
    switch (model?.status) {
      case "formula-ready-candidate":
        return t("detail.modifierAttributionFormula", "Formula");
      case "uptime-only":
        return t("detail.modifierAttributionUptime", "Uptime");
      case "runtime-only":
        return t("detail.modifierAttributionRuntime", "Runtime");
      case "proc-damage":
        return t("detail.modifierAttributionProc", "Proc");
      case "timing-only":
        return t("detail.modifierAttributionTiming", "Timing");
      case "defensive-or-non-damage":
        return t("detail.modifierAttributionNonDamage", "Non-DMG");
      case "needs-source-localization":
        return t("detail.modifierAttributionNeedsName", "Needs name");
      case "needs-component-classification":
        return t("detail.modifierAttributionNeedsMap", "Needs map");
      case "mixed":
        return t("detail.modifierAttributionMixed", "Mixed model");
      default:
        return t("detail.modifierAttributionUnknown", "Unknown");
    }
  }

  function modifierAttributionClass(model: ModifierActivityRow["attributionModel"]): string {
    switch (model?.status) {
      case "formula-ready-candidate":
        return "border-sky-400/35 bg-sky-400/10 text-sky-200";
      case "proc-damage":
      case "timing-only":
        return "border-amber-400/35 bg-amber-400/10 text-amber-200";
      case "defensive-or-non-damage":
        return "border-muted-foreground/30 bg-muted/20 text-muted-foreground";
      case "needs-source-localization":
      case "needs-component-classification":
        return "border-red-400/35 bg-red-400/10 text-red-200";
      default:
        return "border-border/50 bg-background/60 text-muted-foreground";
    }
  }

  function modifierFormulaReplayLabel(model: ModifierActivityRow["formulaReplayModel"]): string {
    switch (model?.status) {
      case "counterfactual-replayed":
        return t("detail.modifierFormulaReplayCounterfactual", "Replayed");
      case "ready-for-replay":
        return t("detail.modifierFormulaReplayReady", "Replay ready");
      case "aggregate-only":
        return t("detail.modifierFormulaReplayAggregate", "Aggregate only");
      case "blocked-missing-evidence":
        return t("detail.modifierFormulaReplayBlocked", "Replay blocked");
      default:
        return t("detail.modifierFormulaReplay", "Replay");
    }
  }

  function modifierFormulaReplayClass(model: ModifierActivityRow["formulaReplayModel"]): string {
    switch (model?.status) {
      case "counterfactual-replayed":
      case "ready-for-replay":
        return "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
      case "aggregate-only":
        return "border-amber-400/35 bg-amber-400/10 text-amber-200";
      case "blocked-missing-evidence":
        return "border-red-400/35 bg-red-400/10 text-red-200";
      default:
        return "border-border/50 bg-background/60 text-muted-foreground";
    }
  }

  function modifierFormulaReplayTitle(model: ModifierActivityRow["formulaReplayModel"]): string {
    if (!model) return "";
    return [
      `${t("detail.modifierFormulaReplay", "Formula replay")}: ${modifierFormulaReplayLabel(model)}`,
      `${t("detail.modifierFormulaReplayBuckets", "Buckets")}: ${model.singleHitBucketCount}/${model.bucketCount} ${t("detail.modifierFormulaReplaySingleHitBuckets", "single-hit")}, ${formatModifierCount(model.hitCount)} ${t("detail.modifierFormulaReplayHits", "hits")}`,
      model.mixedCritBucketCount > 0
        ? `${t("detail.modifierFormulaReplayMixedCrit", "Mixed crit buckets")}: ${formatModifierCount(model.mixedCritBucketCount)}`
        : "",
      model.mixedLuckyBucketCount > 0
        ? `${t("detail.modifierFormulaReplayMixedLucky", "Mixed lucky buckets")}: ${formatModifierCount(model.mixedLuckyBucketCount)}`
        : "",
      model.availableEvidence.length > 0
        ? `${t("detail.modifierFormulaReplayAvailable", "Available evidence")}: ${model.availableEvidence.join(", ")}`
        : "",
      model.missingEvidence.length > 0
        ? `${t("detail.modifierFormulaReplayMissing", "Missing evidence")}: ${model.missingEvidence.join(", ")}`
        : "",
      model.blockers.length > 0
        ? `${t("detail.modifierFormulaReplayBlockers", "Blockers")}: ${model.blockers.join("; ")}`
        : "",
      model.formulaTermIds?.length
        ? `${t("detail.modifierTitleFormulaTerms", "Formula terms")}: ${model.formulaTermIds.join(", ")}`
        : "",
      model.formulaZoneIds?.length
        ? `${t("detail.modifierTitleFormulaZones", "Formula zones")}: ${model.formulaZoneIds.join(", ")}`
        : "",
      model.contributionGroups?.length
        ? `${t("detail.modifierTitleContributionGroups", "Contribution groups")}: ${model.contributionGroups.join(", ")}`
        : "",
      model.predicateTags?.length
        ? `${t("detail.modifierTitlePredicates", "Predicates")}: ${model.predicateTags.join(", ")}`
        : "",
      model.replayedContributionTotal !== undefined
        ? `${t("detail.modifierEstimatedGain", "Est. gain")}: ${formatModifierCount(model.replayedContributionTotal)}`
        : "",
      model.counterfactualTotal !== undefined
        ? `Counterfactual total: ${formatModifierCount(model.counterfactualTotal)}`
        : "",
      model.replayedComponents?.length
        ? `Replayed components: ${model.replayedComponents.map((component) =>
            `${component.label ?? component.componentKey ?? "component"} ${component.decimalValue !== undefined ? `${(component.decimalValue * 100).toFixed(1)}% ` : ""}${formatModifierCount(component.contributionTotal)}`
          ).join("; ")}`
        : "",
      model.skippedReplayComponents?.length
        ? `Skipped replay components: ${model.skippedReplayComponents.join("; ")}`
        : "",
      model.notes?.length ? model.notes.join("\n") : "",
    ].filter(Boolean).join("\n");
  }

  type ModifierEffectPattern = {
    key: string;
    label: string;
    patterns: RegExp[];
  };

  type ModifierAttributionComponent = NonNullable<NonNullable<ModifierActivityRow["attributionModel"]>["components"]>[number];

  const modifierEffectPatterns: ModifierEffectPattern[] = [
    { key: "critDmg", label: "Crit DMG", patterns: [/\bcrit(?:ical)?\s+dmg\b/i, /\bcritical\s+damage\b/i] },
    { key: "critRate", label: "Crit Rate", patterns: [/\bcrit(?:ical)?\s+(?:rate|chance)\b/i, /\bchance\s+to\s+crit\b/i] },
    { key: "atkSpd", label: "Attack SPD", patterns: [/\battack\s+sp(?:d|eed)\b/i] },
    { key: "animation", label: "Animation", patterns: [/\banimation(?:\s+speed)?\b/i] },
    { key: "haste", label: "Haste", patterns: [/\bhaste\b/i] },
    { key: "mastery", label: "Mastery", patterns: [/\bmastery\b/i] },
    { key: "versatility", label: "Versatility", patterns: [/\bversatility\b/i] },
    { key: "luck", label: "Luck", patterns: [/\bluck(?:y)?\b/i] },
    { key: "atkMatk", label: "ATK/MATK", patterns: [/\batk\s*\/\s*matk\b/i] },
    { key: "matk", label: "MATK", patterns: [/\bmatk\b/i] },
    { key: "atk", label: "ATK", patterns: [/\batk\b/i, /\battack\b/i] },
    { key: "eliteDmg", label: "Elite DMG", patterns: [/\bdmg\s+to\s+elites?\b/i, /\bdamage\s+(?:dealt\s+)?to\s+elites?\b/i, /\belites?\s+or\s+stronger\b/i] },
    { key: "elementDmg", label: "Element DMG", patterns: [/\belement(?:al)?\s+dmg\b/i, /\ball\s+element\b/i, /\b(?:light|dark|fire|flame|ice|wind|earth|thunder|water)\s+strength\b/i] },
    { key: "genericDmg", label: "DMG", patterns: [/\bdmg\b/i, /\bdamage\b/i] },
    { key: "armor", label: "Armor", patterns: [/\barmor\b/i] },
    { key: "resistance", label: "Resistance", patterns: [/\bresistance\b/i] },
    { key: "cooldown", label: "CD", patterns: [/\b(?:skill\s+)?cds?\b/i, /\bcooldowns?\b/i] },
  ];

  function clauseEffectValue(clause: string): string {
    const value = clause.match(/[+-]?\s*\d+(?:\.\d+)?\s*%\s*\+\s*[+-]?\s*\d+(?:\.\d+)?|[+-]?\s*\d+(?:\.\d+)?\s*%|[+-]\s*\d+(?:\.\d+)?/);
    return value?.[0]?.replace(/\s+/g, "") ?? "";
  }

  function modifierDescriptionEffectSummary(row: ModifierActivityRow, language: LocaleCode): string[] {
    const description = resolveModifierSourceDescription(row, language)
      || resolveModifierSourceDescription(row, "en");
    if (!description) return [];

    const effects = new Map<string, string>();
    const clauses = description
      .replace(/<br\s*\/?>/gi, ". ")
      .replace(/\s+/g, " ")
      .split(/(?:[.;]|\n)+/)
      .map((clause) => clause.trim())
      .filter(Boolean);

    for (const clause of clauses) {
      const matchedKeys = new Set<string>();
      for (const pattern of modifierEffectPatterns) {
        if (!pattern.patterns.some((item) => item.test(clause))) continue;
        matchedKeys.add(pattern.key);
      }
      if (matchedKeys.size === 0) continue;
      if (matchedKeys.size > 1 && matchedKeys.has("genericDmg")) {
        matchedKeys.delete("genericDmg");
      }

      const value = clauseEffectValue(clause);
      for (const pattern of modifierEffectPatterns) {
        if (!matchedKeys.has(pattern.key) || effects.has(pattern.key)) continue;
        effects.set(pattern.key, value ? `${pattern.label} ${value}` : pattern.label);
      }
    }

    return [...effects.values()].slice(0, 4);
  }

  function componentEffectLabel(component: ModifierAttributionComponent): string {
    if (component.stat?.trim()) return component.stat.trim();
    if (component.label?.trim()) return component.label.trim();
    const formulaTerm = component.formulaTermIds?.[0];
    if (formulaTerm === "critMultiplier") return "Crit";
    if (formulaTerm === "genericDamagePct") return "DMG";
    if (formulaTerm === "elementalDamagePct") return "Element DMG";
    if (formulaTerm === "versatilityDamagePct") return "Versatility";
    if (formulaTerm === "physicalMagicEnhancementPct") return "Phys/Magic";
    if (formulaTerm === "finalDamagePct") return "Final DMG";
    if (formulaTerm === "seasonDamagePct") return "Season DMG";
    if (formulaTerm === "seasonSuppressionPct") return "Season Suppression";
    if (formulaTerm === "resistance") return "Resistance";
    if (formulaTerm === "armor") return "Armor";
    if (component.effectClass?.trim()) {
      return component.effectClass.replace(/[-_]+/g, " ").replace(/\b\w/g, (value: string) => value.toUpperCase());
    }
    return "";
  }

  function modifierAttributionEffectSummary(model: ModifierActivityRow["attributionModel"]): string[] {
    const labels = new Map<string, string>();
    for (const component of model?.components ?? []) {
      const label = componentEffectLabel(component);
      if (!label) continue;
      const key = label.trim().toLowerCase();
      if (labels.has(key)) continue;
      const values = [...new Set((component.valueTexts ?? []).map((value) => value.trim()).filter(Boolean))];
      labels.set(key, values.length === 1 ? `${label} ${values[0]}` : label);
    }
    return [...labels.values()].slice(0, 4);
  }

  function modifierEffectSummary(row: ModifierActivityRow, language: LocaleCode): string {
    const descriptionSummary = modifierDescriptionEffectSummary(row, language);
    const pieces = descriptionSummary.length > 0
      ? descriptionSummary
      : modifierAttributionEffectSummary(row.attributionModel);
    return pieces.join(" / ");
  }

  function modifierEffectSummaryTitle(row: ModifierActivityRow, language: LocaleCode): string {
    const summary = modifierEffectSummary(row, language);
    if (!summary) return "";
    return summary;
  }

  function modifierAttributionTitle(model: ModifierActivityRow["attributionModel"]): string {
    if (!model) return "";
    return [
      `${t("detail.modifierTitleAttribution", "Attribution")}: ${modifierAttributionLabel(model)}`,
      model.damageFormulaId ? `${t("detail.modifierTitleFormula", "Formula")}: ${model.damageFormulaId}` : "",
      model.formulaTermIds?.length
        ? `${t("detail.modifierTitleFormulaTerms", "Formula terms")}: ${model.formulaTermIds.join(", ")}`
        : "",
      model.contributionGroups?.length
        ? `${t("detail.modifierTitleContributionGroups", "Contribution groups")}: ${model.contributionGroups.join(", ")}`
        : "",
      model.predicateTags?.length
        ? `${t("detail.modifierTitlePredicates", "Predicates")}: ${model.predicateTags.join(", ")}`
        : "",
      model.requiredRuntimeEvidence?.length
        ? `${t("detail.modifierTitleRequiredEvidence", "Required evidence")}: ${model.requiredRuntimeEvidence.join(", ")}`
        : "",
      model.notes?.length
        ? `${t("detail.modifierTitleAttributionNotes", "Attribution notes")}: ${model.notes.join(" ")}`
        : "",
    ].filter(Boolean).join("\n");
  }

  function formatModifierDurationMs(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "0s";
    const seconds = value / 1000;
    if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
    return `${seconds.toFixed(1)}s`;
  }

  function modifierTimingTitle(model: ModifierActivityRow["timingModel"]): string {
    if (!model) return "";
    return [
      `${t("detail.modifierTimingModel", "Timing model")}: ${t("detail.modifierTimingCooldownAcceleration", "Cooldown acceleration")}`,
      `${t("detail.modifierTimingStatus", "Status")}: ${model.status}`,
      `${t("detail.modifierTimingCooldownEvents", "Cooldown starts")}: ${formatModifierCount(model.cooldownEvents)}`,
      `${t("detail.modifierTimingCastEvents", "Cast markers")}: ${formatModifierCount(model.castEventsDuringWindow)}`,
      model.totalDirectReductionMs > 0
        ? `${t("detail.modifierTimingDirectReduction", "Direct CD reduction")}: ${formatModifierDurationMs(model.totalDirectReductionMs)}`
        : "",
      model.totalAccelerationOpportunityMs > 0
        ? `${t("detail.modifierTimingAccelerationSaved", "Acceleration time saved")}: ${formatModifierDurationMs(model.totalAccelerationOpportunityMs)}`
        : "",
      model.totalTimeSavedMs > 0
        ? `${t("detail.modifierTimingTotalSaved", "Total cooldown time saved")}: ${formatModifierDurationMs(model.totalTimeSavedMs)}`
        : "",
      model.extraCastOpportunity > 0
        ? `${t("detail.modifierTimingExtraCasts", "Extra cast opportunity")}: ${model.extraCastOpportunity.toFixed(2)}`
        : "",
      model.estimatedOpportunityDamage !== undefined
        ? `${t("detail.modifierTimingOpportunityDamage", "Opportunity damage")}: ${formatModifierCount(model.estimatedOpportunityDamage)}`
        : "",
      model.averageAccelerateRate > 0
        ? `${t("detail.modifierTimingAverageRate", "Average acceleration")}: ${(model.averageAccelerateRate * 100).toFixed(1)}%`
        : "",
      model.affectedSkillIds.length > 0
        ? `${t("detail.modifierTimingAffectedSkills", "Affected skill IDs")}: ${model.affectedSkillIds.map((id) => `#${id}`).join(", ")}`
        : "",
      model.notes.length > 0 ? model.notes.join("\n") : "",
    ].filter(Boolean).join("\n");
  }

  function modifierSourceTitle(row: ModifierActivityRow, language: LocaleCode): string {
    const effectSummary = modifierEffectSummary(row, language);
    const description = hoverDescriptionsEnabled()
      ? resolveModifierSourceDescription(row, language)
      : "";
    return [
      modifierSourceDisplayLabel(row, language),
      effectSummary ? effectSummary : "",
      description ? `${t("detail.modifierTitleDescription", "Description")}:\n${description}` : "",
      row.sourceIds.length > 1
        ? `${t("detail.modifierTitleSources", "Sources")}: ${row.sourceIds.join(", ")}`
        : `${t("detail.modifierTitleSource", "Source")}: ${row.sourceId}`,
      row.sourceType ? `${t("detail.modifierTitleType", "Type")}: ${row.sourceType}` : "",
      Number.isFinite(row.coveragePct)
        ? `${t("detail.modifierTitleObservedCoverage", "Observed coverage")}: ${row.coveragePct.toFixed(1)}%`
        : "",
      modifierTimingTitle(row.timingModel),
      modifierFormulaReplayTitle(row.formulaReplayModel),
      row.estimatedContributionTotal !== undefined
        ? `${t("detail.modifierEstimatedGain", "Est. gain")}: ${formatModifierCount(row.estimatedContributionTotal)}`
        : "",
      modifierAttributionTitle(row.attributionModel),
      row.buffIds.length > 0 ? `${t("detail.modifierTitleBuffIds", "Buff IDs")}: ${row.buffIds.map((id) => `#${id}`).join(", ")}` : "",
      row.targetDamageIds.length > 0
        ? `${t("detail.modifierTitleTargetDamageIds", "Target damage IDs")}: ${row.targetDamageIds.map((id) => `#${id}`).join(", ")}`
        : "",
      row.targetRecountIds.length > 0
        ? `${t("detail.modifierTitleTargetRecountIds", "Target recount IDs")}: ${row.targetRecountIds.map((id) => `#${id}`).join(", ")}`
        : "",
      modifierHasExternalSources(row.actorSummary)
        ? modifierExternalBadgeTitle(row.actorSummary)
        : "",
      row.evidence.length > 0 ? `${t("detail.modifierTitleEvidence", "Evidence")}: ${row.evidence.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  }

  function modifierSkillIconPath(row: Pick<ModifierBreakdownRow, "rowKind" | "recountId" | "skillId">): string | undefined {
    if (row.rowKind === "recount" && row.recountId !== undefined) {
      return lookupRecountGroupIconPath(row.recountId);
    }
    return lookupSkillBreakdownIconPath(row.skillId);
  }

  function buffIconPath(buffIds: number[]): string | undefined {
    for (const buffId of buffIds) {
      const spriteFile = lookupBuffMeta(buffId)?.spriteFile;
      if (spriteFile) return `/images/buff/${spriteFile}`;
    }
    return undefined;
  }

  function modifierSourceIconPath(row: ModifierActivityRow): string | undefined {
    return resolveStaticIconUrl(row.iconPath) ?? buffIconPath(row.buffIds);
  }

  function historySkillIconPath(item: FlatSkillRow): string | undefined {
    if (item.kind === "group") {
      return lookupRecountGroupIconPath(item.row.recountId);
    }
    return lookupSkillBreakdownIconPath(item.row.skillId);
  }

  function historyGroupLabel(row: RecountGroup, language: LocaleCode): string {
    return resolveRecountGroupName(row.recountId, language, row.recountName);
  }

  function historySkillLabel(row: SkillDisplayRow, language: LocaleCode): string {
    if (row.details) {
      return resolveSkillBreakdownName(row, language);
    }
    return resolveSkillTranslation(row.skillId, language, row.name);
  }

  function normalizeDisplayLabel(value: string): string {
    return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
  }

  function historySkillDetailLabel(row: SkillDisplayRow, language: LocaleCode): string {
    if (!row.details) return "";
    const detail = resolveSkillBreakdownDetailName(row, language).trim();
    const label = historySkillLabel(row, language);
    if (!detail || normalizeDisplayLabel(detail) === normalizeDisplayLabel(label)) return "";
    return detail;
  }

  function historyHitCountLabel(hits: number): string {
    const count = Math.round(Number(hits) || 0).toLocaleString();
    return t("detail.skillHitCount", "{count} hits").replace("{count}", count);
  }

  function modifierSkillTitle(row: Pick<ModifierBreakdownRow, "name" | "names" | "recountId" | "skillId" | "damageIds" | "match">, language: LocaleCode): string {
    return [
      modifierSkillLabel(row, language),
      row.recountId !== undefined
        ? `${t("detail.modifierTitleRecount", "Recount")}: #${row.recountId}`
        : `${t("detail.modifierTitleSkill", "Skill")}: #${row.skillId}`,
      row.damageIds.length > 0 ? `${t("detail.modifierTitleDamageIds", "Damage IDs")}: ${row.damageIds.map((id) => `#${id}`).join(", ")}` : "",
      `${t("detail.modifierTitleMatch", "Match")}: ${modifierMatchLabel(row.match)}`,
    ].filter(Boolean).join("\n");
  }

  function modifierBreakdownExternalSummary(row: ModifierBreakdownRow): ModifierActorSummary {
    return mergeModifierActorSummaries(row.sources.map((source) => source.actorSummary));
  }

  function formatModifierCount(value: number): string {
    return Math.round(value).toLocaleString();
  }

  function modifierTimingModelFromItem(item: FlatModifierRow): ModifierActivityRow["timingModel"] {
    if (item.kind === "modifier") return item.row.timingModel;
    if (item.kind === "modifier-skill") return item.source.timingModel;
    if (item.kind === "source") return item.row.source.timingModel;
    return undefined;
  }

  function modifierFormulaReplayModelFromItem(item: FlatModifierRow): ModifierActivityRow["formulaReplayModel"] {
    if (item.kind === "modifier") return item.row.formulaReplayModel;
    if (item.kind === "modifier-skill") return item.row.formulaReplayModel ?? item.source.formulaReplayModel;
    if (item.kind === "source") return item.row.formulaReplayModel ?? item.row.source.formulaReplayModel;
    return undefined;
  }

  function modifierEstimatedGain(item: FlatModifierRow): number | null {
    const value = item.row.estimatedContributionTotal;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (item.kind !== "modifier") return null;
    const opportunityDamage = modifierTimingModelFromItem(item)?.estimatedOpportunityDamage;
    return typeof opportunityDamage === "number" && Number.isFinite(opportunityDamage) && opportunityDamage > 0
      ? opportunityDamage
      : null;
  }

  function modifierEstimatedGainTitle(item: FlatModifierRow): string {
    const timingModel = modifierTimingModelFromItem(item);
    const formulaReplayModel = modifierFormulaReplayModelFromItem(item);
    if (
      item.row.estimatedContributionTotal === undefined
      && timingModel?.estimatedOpportunityDamage !== undefined
    ) {
      return modifierTimingTitle(timingModel);
    }
    const gain = modifierEstimatedGain(item);
    if (gain === null) {
      return modifierTimingTitle(timingModel)
        || modifierFormulaReplayTitle(formulaReplayModel)
        || t("detail.modifierEstimatedGainUnavailable", "No matching outside-window baseline.");
    }
    const row = item.row;
    return [
      `${t("detail.modifierEstimatedGain", "Est. gain")}: ${formatModifierCount(gain)}`,
      row.estimatedContributionPct !== undefined
        ? `${t("detail.encounterPct", "Encounter %")}: ${displayPct(row.estimatedContributionPct).toFixed(1)}%`
        : "",
      row.estimatedContributionConfidence
        ? `${t("detail.modifierEstimatedGainConfidence", "Confidence")}: ${row.estimatedContributionConfidence}`
        : "",
      row.observedDmgPerHit !== undefined
        ? `${t("detail.modifierEstimatedGainObservedHit", "Observed / hit")}: ${formatModifierCount(row.observedDmgPerHit)}`
        : "",
      row.baselineDmgPerHit !== undefined
        ? `${t("detail.modifierEstimatedGainBaselineHit", "Baseline / hit")}: ${formatModifierCount(row.baselineDmgPerHit)}`
        : "",
      row.baselineHits !== undefined
        ? `${t("detail.modifierEstimatedGainBaselineHits", "Baseline hits")}: ${formatModifierCount(row.baselineHits)}`
        : "",
    ].filter(Boolean).join("\n");
  }

  function displayPct(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    if (value >= 99.95) return 100;
    return Math.min(100, value);
  }

  function modifierGlowPercentage(item: FlatModifierRow): number {
    if (item.kind === "source" || item.kind === "modifier-skill") return displayPct(item.row.sourcePct);
    if (SETTINGS.history.general.state.relativeToTopDPSSkill && maxModifierTotal > 0) {
      return displayPct((item.row.totalDmg / maxModifierTotal) * 100);
    }
    return displayPct(item.row.dmgPct);
  }

  function modifierSourceShare(item: FlatModifierRow): number {
    if (item.kind === "source" || item.kind === "modifier-skill") return displayPct(item.row.sourcePct);
    if (item.kind === "modifier") return displayPct(item.row.coveragePct);
    return 100;
  }

  async function loadEncounter() {
    const currentEncounterId = encounterId;
    if (!currentEncounterId) return;
    const token = ++encounterLoadToken;
    const startedAt = historyPerfNow();
    error = null;
    encounterEntitiesLoading = false;
    targetDetailsLoading = false;
    targetDetailsRequestedEncounterId = null;
    targetDetailsLoadedEncounterId = null;
    expandedGroups = new Set<number>();
    expandedModifierRows = new Set<string>();
    modifierExpansionSeed = "";
    modifierEntityCache = {};
    modifierReportCache = {};
    modifierEntitiesError = null;
    modifierReportError = null;
    modifierReportErrorKey = null;
    modifierEntitiesLoading = false;
    modifierReportLoading = false;
    modifierEntitiesLoadingKey = null;
    modifierReportLoadingKey = null;
    targetDetailsLoadToken++;
    modifierEntitiesLoadToken++;
    modifierReportLoadToken++;
    try {
      logHistoryTiming("encounter load start", { encounterId: currentEncounterId });
      const encounterStartedAt = historyPerfNow();
      const encounterRes = await commands.getEncounterById(currentEncounterId).then((result) => {
        logHistoryTiming("encounter summary loaded", {
          encounterId: currentEncounterId,
          ms: historyLoadMs(encounterStartedAt),
          status: result.status,
        });
        return result;
      });
      if (token !== encounterLoadToken) return;

      if (encounterRes.status !== "ok") {
        error = String(encounterRes.error);
        return;
      }
      encounter = encounterRes.data;
      localPlayerUid =
        (encounterRes.data as { localPlayerId?: number | null }).localPlayerId ??
        null;
      rawEntities = [];
      players = [];
      encounterEntitiesLoading = true;
      await tick();
      await waitForHistoryPaint();

      const entitiesStartedAt = historyPerfNow();
      const entitiesRes = await commands.getEncounterEntitiesCompactRaw(currentEncounterId).then((result) => {
        logHistoryTiming("encounter compact entities loaded", {
          encounterId: currentEncounterId,
          ms: historyLoadMs(entitiesStartedAt),
          status: result.status,
          rows: result.status === "ok" ? result.data.length : 0,
        });
        return result;
      });

      if (token !== encounterLoadToken) return;
      if (entitiesRes.status !== "ok") {
        error = String(entitiesRes.error);
        return;
      }
      rawEntities = entitiesRes.data;
      const durationSeconds =
        encounterRes.data.duration > 0
          ? Math.max(1, encounterRes.data.duration)
          : Math.max(
              1,
              ((encounterRes.data.endedAtMs ?? Date.now()) -
                encounterRes.data.startedAtMs) /
                1000,
            );
      players = buildHistoryPlayers(
        rawEntities,
        durationSeconds,
        encounterRes.data.activeCombatDuration ?? null,
        localPlayerUid,
      );
      encounterEntitiesLoading = false;
      logHistoryTiming("encounter load complete", {
        encounterId: currentEncounterId,
        ms: historyLoadMs(startedAt),
        players: players.length,
      });
    } catch (err) {
      if (token === encounterLoadToken) {
        encounterEntitiesLoading = false;
      }
      error = err instanceof Error ? err.message : String(err);
      console.warn("[history] encounter load failed", {
        encounterId: currentEncounterId,
        ms: historyLoadMs(startedAt),
        error,
      });
    } finally {
      if (token === encounterLoadToken) {
        encounterEntitiesLoading = false;
      }
    }
  }

  async function loadTargetDetailEntities() {
    const currentEncounterId = encounterId;
    if (!currentEncounterId || targetDetailsLoading) return;
    const token = ++targetDetailsLoadToken;
    const startedAt = historyPerfNow();
    targetDetailsRequestedEncounterId = currentEncounterId;
    targetDetailsLoading = true;
    try {
      const entitiesRes = await commands.getEncounterEntitiesTargetDetailsRaw(currentEncounterId).then((result) => {
        logHistoryTiming("encounter target detail entities loaded", {
          encounterId: currentEncounterId,
          ms: historyLoadMs(startedAt),
          status: result.status,
          rows: result.status === "ok" ? result.data.length : 0,
        });
        return result;
      });
      if (token !== targetDetailsLoadToken || currentEncounterId !== encounterId) return;
      if (entitiesRes.status !== "ok") {
        console.warn("[history] target detail entity load failed", {
          encounterId: currentEncounterId,
          error: String(entitiesRes.error),
        });
        return;
      }

      rawEntities = entitiesRes.data;
      players = buildHistoryPlayers(
        rawEntities,
        encounterDurationSeconds,
        encounter?.activeCombatDuration ?? null,
        localPlayerUid,
      );
      targetDetailsLoadedEncounterId = currentEncounterId;
    } catch (err) {
      console.warn("[history] target detail entity load failed", {
        encounterId: currentEncounterId,
        ms: historyLoadMs(startedAt),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (token === targetDetailsLoadToken) {
        targetDetailsLoading = false;
      }
    }
  }

  async function loadModifierEntities() {
    if (!modifierReportsEnabled) return;
    const currentEncounterId = encounterId;
    const selectedUid = selectedModifierPlayer?.uid ?? null;
    if (!currentEncounterId || selectedUid === null) return;
    const cacheKey = modifierCacheKey(currentEncounterId, selectedUid);
    if (modifierEntityCache[cacheKey]?.length) {
      return;
    }
    const token = ++modifierEntitiesLoadToken;
    modifierEntitiesLoading = true;
    modifierEntitiesLoadingKey = cacheKey;
    modifierEntitiesError = null;
    const startedAt = historyPerfNow();
    try {
      logHistoryTiming("modifier entities load start", {
        encounterId: currentEncounterId,
        playerUid: selectedUid,
      });
      const entitiesRes = await commands.getEncounterModifierEntitiesRaw(currentEncounterId, selectedUid);
      if (token !== modifierEntitiesLoadToken) return;
      if (entitiesRes.status !== "ok") {
        modifierEntitiesError = String(entitiesRes.error);
        console.warn("[history] modifier entities load returned error", {
          encounterId: currentEncounterId,
          playerUid: selectedUid,
          ms: historyLoadMs(startedAt),
          error: modifierEntitiesError,
        });
        return;
      }
      logHistoryTiming("modifier entities load complete", {
        encounterId: currentEncounterId,
        playerUid: selectedUid,
        ms: historyLoadMs(startedAt),
        rows: entitiesRes.data.length,
        primaryBuckets: entitiesRes.data[0]?.modifierHitBuckets?.length ?? 0,
        supportRows: Math.max(0, entitiesRes.data.length - 1),
      });
      modifierEntityCache = {
        ...modifierEntityCache,
        [cacheKey]: entitiesRes.data,
      };
    } catch (err) {
      if (token !== modifierEntitiesLoadToken) return;
      modifierEntitiesError = err instanceof Error ? err.message : String(err);
      console.warn("[history] modifier entities load failed", {
        encounterId: currentEncounterId,
        playerUid: selectedUid,
        ms: historyLoadMs(startedAt),
        error: modifierEntitiesError,
      });
    } finally {
      if (token === modifierEntitiesLoadToken) {
        modifierEntitiesLoading = false;
        modifierEntitiesLoadingKey = null;
      }
    }
  }

  async function loadModifierReport() {
    if (!modifierReportsEnabled) return;
    if (charId || activeTab !== "modifiers") return;
    if (!selectedModifierCacheKey || !selectedModifierReportKey) return;
    const detailedEntities = modifierEntityCache[selectedModifierCacheKey];
    if (!detailedEntities?.length || !selectedModifierEntity) return;
    if (modifierReportCache[selectedModifierReportKey]) return;
    if (modifierReportErrorKey === selectedModifierReportKey) return;
    if (modifierReportLoading && modifierReportLoadingKey === selectedModifierReportKey) return;

    const reportKey = selectedModifierReportKey;
    const token = ++modifierReportLoadToken;
    modifierReportLoading = true;
    modifierReportLoadingKey = reportKey;
    modifierReportError = null;
    modifierReportErrorKey = null;
    const startedAt = historyPerfNow();

    let reportEntity: HistoryEntityData;
    try {
      const { buildModifierSourceCatalog } = await import("$lib/config/modifier-source-catalog");
      const modifierSourceCatalog = await buildModifierSourceCatalog(selectedModifierEntity);
      if (token !== modifierReportLoadToken) return;
      reportEntity = slimModifierReportEntity(selectedModifierEntity, modifierSourceCatalog, detailedEntities);
    } catch (err) {
      if (token === modifierReportLoadToken) {
        modifierReportError = err instanceof Error ? err.message : String(err);
        modifierReportErrorKey = reportKey;
        modifierReportLoading = false;
        modifierReportLoadingKey = null;
        console.warn("[history] modifier report catalog build failed", {
          reportKey,
          ms: historyLoadMs(startedAt),
          error: modifierReportError,
        });
      }
      return;
    }

    logHistoryTiming("modifier report build start", {
      reportKey,
      playerUid: reportEntity.uid,
      buckets: reportEntity.modifierHitBuckets?.length ?? 0,
      scope: modifierScope,
      actorFilter: modifierActorFilter,
    });

    let worker: Worker;
    try {
      worker = createModifierReportWorker();
    } catch (err) {
      if (token === modifierReportLoadToken) {
        modifierReportError = err instanceof Error ? err.message : String(err);
        modifierReportErrorKey = reportKey;
        modifierReportLoading = false;
        modifierReportLoadingKey = null;
        console.warn("[history] modifier report worker startup failed", {
          reportKey,
          ms: historyLoadMs(startedAt),
          error: modifierReportError,
        });
      }
      return;
    }

    await new Promise<void>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
        worker.terminate();
        if (modifierReportWorker === worker) modifierReportWorker = null;
      };
      const finish = () => {
        cleanup();
        if (token === modifierReportLoadToken) {
          modifierReportLoading = false;
          modifierReportLoadingKey = null;
        }
        resolve();
      };
      const handleMessage = async (event: MessageEvent<ModifierReportWorkerResponse>) => {
        if (event.data.requestId !== token) return;
        if (token !== modifierReportLoadToken) {
          finish();
          return;
        }
        if (event.data.status === "started") {
          if (timeoutId !== null) clearTimeout(timeoutId);
          timeoutId = setTimeout(handleTimeout, MODIFIER_REPORT_WORKER_BUILD_TIMEOUT_MS);
          logHistoryTiming("modifier report worker started", {
            reportKey,
            ms: historyLoadMs(startedAt),
            buckets: event.data.buckets,
          });
          return;
        }
        if (event.data.status === "ok") {
          let rows = event.data.rows;
          try {
            const { enrichModifierRowsWithDescriptions } = await import("$lib/config/modifier-descriptions");
            rows = await enrichModifierRowsWithDescriptions(rows);
            if (token !== modifierReportLoadToken) {
              finish();
              return;
            }
          } catch (err) {
            console.warn("[history] modifier description enrichment failed", {
              reportKey,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          modifierReportCache = {
            ...modifierReportCache,
            [reportKey]: rows,
          };
          logHistoryTiming("modifier report worker built", {
            reportKey,
            ms: historyLoadMs(startedAt),
            workerMs: event.data.elapsedMs,
            rows: rows.length,
          });
        } else {
          modifierReportError = event.data.error;
          modifierReportErrorKey = reportKey;
          console.warn("[history] modifier report worker returned error", {
            reportKey,
            ms: historyLoadMs(startedAt),
            error: modifierReportError,
          });
        }
        finish();
      };
      const handleError = (event: ErrorEvent) => {
        if (token === modifierReportLoadToken) {
          modifierReportError = event.message || "Modifier report worker failed.";
          modifierReportErrorKey = reportKey;
          console.warn("[history] modifier report worker failed", {
            reportKey,
            ms: historyLoadMs(startedAt),
            error: modifierReportError,
          });
        }
        finish();
      };
      const handleMessageError = () => {
        if (token === modifierReportLoadToken) {
          modifierReportError = "Modifier report worker could not read the report payload.";
          modifierReportErrorKey = reportKey;
          console.warn("[history] modifier report worker messageerror", {
            reportKey,
            ms: historyLoadMs(startedAt),
          });
        }
        finish();
      };
      const handleTimeout = () => {
        if (token === modifierReportLoadToken) {
          modifierReportError = "Modifier report worker did not respond before the safety timeout.";
          modifierReportErrorKey = reportKey;
          console.warn("[history] modifier report worker timeout", {
            reportKey,
            ms: historyLoadMs(startedAt),
            startTimeoutMs: MODIFIER_REPORT_WORKER_START_TIMEOUT_MS,
            buildTimeoutMs: MODIFIER_REPORT_WORKER_BUILD_TIMEOUT_MS,
          });
        }
        finish();
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      timeoutId = setTimeout(handleTimeout, MODIFIER_REPORT_WORKER_START_TIMEOUT_MS);
      worker.postMessage({
        requestId: token,
        entity: reportEntity,
        elapsedSecs: encounterDurationSeconds,
        options: {
          scope: modifierScope,
          actorFilter: modifierActorFilter,
          encounterStartMs: encounter?.startedAtMs ?? null,
          encounterEndMs: encounter?.endedAtMs ?? null,
        },
      });
    });
  }

  function viewPlayerSkills(playerUid: number, type = "dps", targetUid?: number | null) {

    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("charId", String(playerUid));
    sp.set("skillType", type);
    if (type === "dps" && targetUid != null) {
      sp.set("targetUid", String(targetUid));
    } else {
      sp.delete("targetUid");
    }
    sp.delete("deathTs");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function viewDeathReplay(playerUid: number, deathTs: number) {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.set("charId", String(playerUid));
    sp.set("skillType", "death");
    sp.set("deathTs", String(deathTs));
    sp.delete("targetUid");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToDeathPlayerList() {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("charId");
    sp.delete("deathTs");
    sp.delete("targetUid");
    sp.set("skillType", "death");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToDeathList() {
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("deathTs");
    sp.delete("targetUid");
    sp.set("skillType", "death");
    goto(`/main/dps/history/${encounterId}?${sp.toString()}`);
  }

  function backToEncounter() {

    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("charId");
    sp.delete("skillType");
    sp.delete("targetUid");
    sp.delete("deathTs");
    const qs = sp.toString();
    goto(`/main/dps/history/${encounterId}${qs ? `?${qs}` : ""}`);
  }

  function backToHistory() {

    // Return to the history list while preserving list state.
    const sp = new URLSearchParams($page.url.searchParams);
    sp.delete("charId");
    sp.delete("skillType");
    sp.delete("targetUid");
    sp.delete("deathTs");
    const qs = sp.toString();
    goto(`/main/dps/history${qs ? `?${qs}` : ""}`);
  }

  async function handleToggleFavorite() {
    if (!encounter) return;
    try {
      const newStatus = !encounter.isFavorite;
      // Optimistic update
      encounter.isFavorite = newStatus;
      await commands.toggleFavoriteEncounter(encounter.id, newStatus);
    } catch (e) {
      console.error("Failed to toggle favorite", e);
      // Revert on error
      if (encounter) encounter.isFavorite = !encounter.isFavorite;
    }
  }

  function openDeleteModal() {
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
  }

  function buildHistoryGroupHoverText(recountId: string | number, language: LocaleCode) {
    const note = hoverDescriptionsEnabled() ? resolveSkillNote(recountId, language).trim() : "";
    return buildRecountGroupHoverText(recountId, language, note);
  }

  function buildHistorySkillHoverText(skillId: string | number, language: LocaleCode) {
    const note = hoverDescriptionsEnabled() ? resolveSkillNote(skillId, language).trim() : "";
    return buildSkillBreakdownHoverText(skillId, language, note);
  }

  async function confirmDeleteEncounter() {
    if (!encounter) return;
    isDeleting = true;
    try {
      await commands.deleteEncounter(encounter.id);
      // Navigate back to history after deletion
      backToHistory();
    } catch (e) {
      console.error("Failed to delete encounter", e);
      alert(`${t("detail.deleteFailed", "删除战斗记录失败")}: ${e}`);
      isDeleting = false;
      showDeleteModal = false;
    }
  }

  async function openEncounterOnWebsite() {
    if (!encounter || !encounter.remoteEncounterId) return;

    const url = `${websiteBaseUrl}/encounter/${encounter.remoteEncounterId}`;
    try {
      await openUrl(url);
    } catch (err) {
      console.error("Failed to open URL:", url, err);
    }
  }

  $effect(() => {
    loadEncounter();
  });

  $effect(() => {
    charId;
    expandedGroups = new Set<number>();
  });

  $effect(() => {
    if (!charId || skillType !== "dps" || selectedSkillTargetUid === null) return;
    if (targetDetailsLoadedEncounterId === encounterId) return;
    if (targetDetailsRequestedEncounterId === encounterId) return;
    const playerUid = Number(charId);
    if (!Number.isFinite(playerUid)) return;
    const targetStats = perTargetByUid
      .get(playerUid)
      ?.dmgTargets.find((target) => target.targetUid === selectedSkillTargetUid);
    if (!targetStats) return;
    if (Object.keys(targetStats.skills ?? {}).length > 0) return;
    void loadTargetDetailEntities();
  });

  $effect(() => {
    activeTab;
    if (activeTab !== "damage") {
      overviewTargetUid = null;
    }
  });

  $effect(() => {
    if (skillType === "death") {
      activeTab = "death";
    }
  });

  $effect(() => {
    if (charId || activeTab !== "modifiers" || !modifierReportsEnabled) return;
    void loadModifierEntities();
  });

  $effect(() => {
    if (charId || activeTab !== "modifiers" || !modifierReportsEnabled) return;
    selectedModifierReportKey;
    selectedModifierEntity;
    modifierEntityCache;
    void loadModifierReport();
  });

  $effect(() => {
    if (activeTab !== "modifiers" || !modifierReportsEnabled) return;
    if (modifierPlayers.length === 0) {
      modifierPlayerUid = null;
      return;
    }
    if (modifierPlayerUid !== null && modifierPlayers.some((player) => player.uid === modifierPlayerUid)) {
      return;
    }
    const localPlayer = localPlayerUid !== null
      ? modifierPlayers.find((player) => player.uid === localPlayerUid)
      : null;
    const fallbackPlayer = localPlayer ?? modifierPlayers[0];
    if (fallbackPlayer) {
      modifierPlayerUid = fallbackPlayer.uid;
    }
  });

  $effect(() => {
    if (activeTab !== "modifiers") return;
    if (!modifierReportsEnabled) {
      modifierPlayerUid = null;
      modifierEntitiesLoading = false;
      modifierReportLoading = false;
      modifierEntitiesLoadingKey = null;
      modifierReportLoadingKey = null;
      modifierEntitiesLoadToken++;
      modifierReportLoadToken++;
      terminateModifierReportWorker();
      return;
    }
    const seed = [
      encounterId ?? "",
      selectedModifierPlayer?.uid ?? "",
      modifierViewMode,
      modifierScope,
      modifierActorFilter,
      modifierHideFullCoverage ? "hide-full" : "show-full",
    ].join(":");
    if (modifierExpansionSeed === seed) return;
    modifierExpansionSeed = seed;
    expandedModifierRows = new Set<string>();
  });

</script>

<div class="">
  {#if error}
    <div class="text-red-400 mb-3">{error}</div>
  {/if}

  {#if !charId && encounter}
    <!-- Encounter Overview -->
    <div class="mb-4">
      <div class="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-4">
        <div class="flex flex-wrap items-stretch justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <div class="space-y-1 min-w-0 flex-1 h-full">
              <div class="flex flex-wrap items-center gap-1">
                <button
                  onclick={backToHistory}
                  class="p-0.5 text-muted-foreground/70 hover:text-foreground transition-colors rounded shrink-0"
                  title={t("detail.backToHistory", "返回历史")}
                  aria-label={t("detail.backToHistory", "返回历史")}
                >
                  <svg
                    class="w-4 h-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <h2 class="text-lg font-semibold text-foreground leading-tight">
                  {localizeSceneName((encounter as { sceneId?: number | string | null }).sceneId ?? null, encounter.sceneName || t("detail.unknownScene", "未知场景"))}
                </h2>
              </div>
              {#if encounter.bosses.length > 0}
                <div class="w-full mt-1">
                  <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {#each encounter.bosses as b, i}
                      <span
                        class={b.isDefeated
                          ? "text-destructive line-through"
                          : "text-primary"}
                        >{localizeRawMonsterName(b.monsterName, t("detail.unknownBoss", "未知首领"))}{i < encounter.bosses.length - 1 ? "," : ""}</span
                      >
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span>{new Date(encounter.startedAtMs).toLocaleString()}</span>
                <span class="text-muted-foreground">•</span>
                <span>{t("detail.duration", "时长")}: {formatEncounterDuration(encounterDurationSeconds)}</span>
                <span class="text-muted-foreground">•</span>
                <span class="text-[11px] text-muted-foreground">#{encounter.id}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col items-end gap-2 shrink-0 self-stretch justify-between h-full">
            <div class="flex items-center gap-1.5">
              {#if activeTab === "modifiers" && modifierReportsEnabled}
                <label
                  class="inline-flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  title={modifierViewMode === "by-modifier"
                    ? t("detail.modifierHideFullCoverageTitleByModifier", "Hide modifier parent rows whose observed coverage reaches 100%.")
                    : t("detail.modifierHideFullCoverageTitleBySkill", "Hide modifier child rows whose source coverage reaches 100%.")}
                >
                  <input
                    type="checkbox"
                    class="size-3 accent-primary"
                    bind:checked={modifierHideFullCoverage}
                  />
                  <span>{t("detail.modifierHideFullCoverage", "Hide 100%")}</span>
                </label>
              {/if}

              {#if encounter.remoteEncounterId}
                <button
                  onclick={openEncounterOnWebsite}
                  class="inline-flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors p-2"
                  title={t("detail.openOnWebsiteTitle", "在 resonance-logs.com 打开该战斗记录")}
                  aria-label={t("detail.openOnWebsite", "在 resonance-logs.com 打开该战斗记录")}
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </button>
              {/if}

              <button
                onclick={handleToggleFavorite}
                class="inline-flex items-center justify-center rounded transition-colors p-2 {encounter.isFavorite
                  ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
                title={encounter.isFavorite
                  ? t("detail.removeFavorite", "取消收藏")
                  : t("detail.addFavorite", "加入收藏")}
                aria-label={encounter.isFavorite
                  ? t("detail.removeFavorite", "取消收藏")
                  : t("detail.addFavorite", "加入收藏")}
              >
                <svg
                  class="w-4 h-4"
                  fill={encounter.isFavorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </button>

              <button
                onclick={openDeleteModal}
                class="inline-flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors p-2"
                title={t("detail.deleteEncounterTitle", "删除该战斗记录")}
                aria-label={t("detail.deleteEncounterAria", "删除战斗记录")}
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>

            <div class="flex rounded border border-border bg-popover">
              {#each tabs as tab}
                <button
                  onclick={() => (activeTab = tab.key)}
                  class="px-3 py-1 text-xs rounded transition-colors {activeTab === tab.key
                    ? 'bg-muted/40 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>

    {#if activeTab === "damage" && overviewTargets.length > 0}
      <div class="mb-3 flex flex-wrap gap-1.5">
        <button
          class="px-3 py-1 text-xs rounded border border-border transition-colors {overviewTargetUid === null
            ? 'bg-muted/40 text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
          onclick={() => (overviewTargetUid = null)}
        >
          {t("detail.total", "总计")}
        </button>
        {#each overviewTargets as target (target.targetUid)}
          <button
            class="px-3 py-1 text-xs rounded border border-border transition-colors {overviewTargetUid === target.targetUid
              ? 'bg-muted/40 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
            onclick={() => (overviewTargetUid = target.targetUid)}
            title={`${t("detail.target", "目标")} #${target.targetUid}`}
          >
            {localizeRawMonsterName(target.targetName, target.targetName)}
          </button>
        {/each}
      </div>
    {/if}

    {#if activeTab === "death"}
      <DeathPlayerList
        entries={deathEntries}
        localPlayerUid={localPlayerUid}
        onSelect={(uid) => viewPlayerSkills(uid, "death")}
        emptyMessage={t("detail.noDeathRows", "No player deaths were recorded for this encounter.")}
        variant="history"
      />
    {:else if activeTab === "modifiers"}
      {@const language = SETTINGS.live.general.state.language as LocaleCode}
      {#if !modifierReportsEnabled}
        <div class="rounded border border-border/60 bg-card/30 px-3 py-6 text-center text-sm text-muted-foreground">
          {t("detail.modifierDisabled", "Modifier analysis is disabled in Meter Settings.")}
        </div>
      {:else}
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-1.5">
          {#each modifierPlayers as player (player.uid)}
            <button
              class="px-3 py-1 text-xs rounded border border-border transition-colors {selectedModifierPlayer?.uid === player.uid
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
              onclick={() => (modifierPlayerUid = player.uid)}
              title={`UID: #${player.uid}`}
            >
              {getDisplayName({
                player: {
                  uid: player.uid,
                  name: player.name,
                  className: player.className,
                  classSpecName: player.classSpecName,
                },
                showYourNameSetting: settings.state.history.general.showYourName,
                showOthersNameSetting: settings.state.history.general.showOthersName,
                isLocalPlayer: player.isLocalPlayer,
              })}
              {#if player.isLocalPlayer}
                <span class="ml-1 text-[oklch(0.65_0.1_250)]">{`(${t("detail.you", "You")})`}</span>
              {/if}
            </button>
          {/each}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex rounded border border-border bg-popover">
            <button
              class="px-3 py-1 text-xs rounded transition-colors {modifierViewMode === 'by-modifier'
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (modifierViewMode = "by-modifier")}
            >
              {t("detail.modifierByModifier", "By modifier")}
            </button>
            <button
              class="px-3 py-1 text-xs rounded transition-colors {modifierViewMode === 'by-skill'
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (modifierViewMode = "by-skill")}
            >
              {t("detail.modifierBySkill", "By skill")}
            </button>
          </div>
          <div class="flex rounded border border-border bg-popover">
            <button
              class="px-3 py-1 text-xs rounded transition-colors {modifierScope === 'all-active'
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (modifierScope = "all-active")}
            >
              {t("detail.modifierAllActive", "All active")}
            </button>
            <button
              class="px-3 py-1 text-xs rounded transition-colors {modifierScope === 'static-targets'
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (modifierScope = "static-targets")}
            >
              {t("detail.modifierStaticTargets", "Static targets")}
            </button>
          </div>
          <div class="flex rounded border border-border bg-popover">
            <button
              class="px-3 py-1 text-xs rounded transition-colors {modifierActorFilter === 'all'
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (modifierActorFilter = "all")}
            >
              {t("detail.modifierAllSources", "All sources")}
            </button>
            <button
              class="px-3 py-1 text-xs rounded transition-colors {modifierActorFilter === 'external'
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (modifierActorFilter = "external")}
            >
              {t("detail.modifierExternalOnly", "External only")}
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-popover/60">
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {modifierViewMode === "by-modifier"
                  ? t("detail.modifierColumnByModifier", "Modifier / Skill")
                  : t("detail.modifierColumnBySkill", "Skill / Modifier")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.modifierObservedDamage", "Allocated damage")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.modifierEstimatedGain", "Est. gain")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.encounterPct", "Encounter %")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.sourcePct", "Source %")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.modifierObservedHits", "Allocated hits")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.critPct", "Crit %")}
              </th>
              <th class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("detail.luckyPct", "Lucky %")}
              </th>
            </tr>
          </thead>
          <tbody class="bg-background/40">
            {#if (modifierEntitiesLoading && modifierEntitiesLoadingKey === selectedModifierCacheKey) || (modifierReportLoading && modifierReportLoadingKey === selectedModifierReportKey)}
              <tr class="border-t border-border/40">
                <td class="px-3 py-6 text-center text-sm text-muted-foreground" colspan="8">
                  {modifierLoadingText()}
                </td>
              </tr>
            {:else if modifierEntitiesError || modifierReportError}
              <tr class="border-t border-border/40">
                <td class="px-3 py-6 text-center text-sm text-red-400" colspan="8">
                  {modifierEntitiesError ?? modifierReportError}
                </td>
              </tr>
            {:else if flatModifierRows.length === 0}
              <tr class="border-t border-border/40">
                <td class="px-3 py-6 text-center text-sm text-muted-foreground" colspan="8">
                  {t("detail.noModifierRows", "No modifier activity recorded.")}
                </td>
              </tr>
            {:else}
              {#each flatModifierRows as item (item.key)}
                <tr class="relative border-t border-border/40 hover:bg-muted/60 transition-colors">
                  <td class="px-3 py-3 text-sm text-muted-foreground relative z-10">
                    {#if item.kind === "modifier"}
                      {@const sourceIconPath = modifierSourceIconPath(item.row)}
                      {@const effectSummary = modifierEffectSummary(item.row, language)}
                      <button
                        class="inline-flex max-w-full items-center gap-1.5 hover:text-foreground transition-colors"
                        onclick={() => toggleModifierRow(item.row.key)}
                        title={modifierSourceTitle(item.row, language)}
                      >
                        <svg
                          class="size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 {expandedModifierRows.has(item.row.key) ? 'rotate-90' : ''}"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        {#if sourceIconPath}
                          <img
                            class="size-4 shrink-0 rounded-sm object-cover"
                            src={sourceIconPath}
                            alt=""
                            loading="lazy"
                          />
                        {/if}
                        <span class="truncate font-medium text-foreground/90">
                          {modifierSourceLabel(item.row, language)}
                        </span>
                        {#if modifierHasExternalSources(item.row.actorSummary)}
                          <span
                            class="inline-block max-w-40 shrink-0 truncate rounded border border-primary/30 bg-primary/10 px-1 py-0.5 align-middle text-[9px] leading-none text-primary"
                            title={modifierExternalBadgeTitle(item.row.actorSummary)}
                          >
                            {modifierExternalBadgeLabel(item.row.actorSummary)}
                          </span>
                        {/if}
                        <span class="shrink-0 rounded border border-border/50 bg-muted/30 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                          {modifierMatchLabel(item.row.match)}
                        </span>
                        {#if item.row.attributionModel}
                          <span
                            class="shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none {modifierAttributionClass(item.row.attributionModel)}"
                            title={modifierAttributionTitle(item.row.attributionModel)}
                          >
                            {modifierAttributionLabel(item.row.attributionModel)}
                          </span>
                        {/if}
                        {#if item.row.timingModel}
                          <span
                            class="shrink-0 rounded border border-cyan-400/35 bg-cyan-400/10 px-1 py-0.5 text-[9px] leading-none text-cyan-200"
                            title={modifierTimingTitle(item.row.timingModel)}
                          >
                            {t("detail.modifierTimingPill", "Timing")}
                          </span>
                        {/if}
                        {#if item.row.formulaReplayModel}
                          <span
                            class="shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none {modifierFormulaReplayClass(item.row.formulaReplayModel)}"
                            title={modifierFormulaReplayTitle(item.row.formulaReplayModel)}
                          >
                            {modifierFormulaReplayLabel(item.row.formulaReplayModel)}
                          </span>
                        {/if}
                        {#if effectSummary}
                          <span
                            class="max-w-48 shrink truncate rounded border border-emerald-400/30 bg-emerald-400/10 px-1 py-0.5 text-[9px] leading-none text-emerald-200"
                            title={modifierEffectSummaryTitle(item.row, language)}
                          >
                            {effectSummary}
                          </span>
                        {/if}
                        {#if shouldShowModifierSourceUid(item.row)}
                          <span class="text-[10px] text-muted-foreground/50 shrink-0">
                            {modifierSourceUidLabel(item.row)}
                          </span>
                        {/if}
                      </button>
                    {:else if item.kind === "modifier-skill"}
                      {@const skillIconPath = modifierSkillIconPath(item.row)}
                      {@const replayModel = modifierFormulaReplayModelFromItem(item)}
                      <div
                        class="inline-flex max-w-full items-center gap-1.5 pl-5"
                        title={modifierSkillTitle(item.row, language)}
                      >
                        <span class="w-3 shrink-0 flex justify-center">
                          <span class="size-1 rounded-full bg-muted-foreground/35"></span>
                        </span>
                        {#if skillIconPath}
                          <img
                            class="size-4 shrink-0 rounded-sm object-cover"
                            src={skillIconPath}
                            alt=""
                            loading="lazy"
                          />
                        {/if}
                        <span class="truncate">
                          {modifierSkillLabel(item.row, language)}
                        </span>
                        <span class="shrink-0 rounded border border-border/50 bg-background/60 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                          {modifierMatchLabel(item.row.match)}
                        </span>
                        {#if replayModel}
                          <span
                            class="shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none {modifierFormulaReplayClass(replayModel)}"
                            title={modifierFormulaReplayTitle(replayModel)}
                          >
                            {modifierFormulaReplayLabel(replayModel)}
                          </span>
                        {/if}
                        {#if SETTINGS.live.general.state.skillIdDisplayMode === 'column'}
                          <span class="text-[10px] text-muted-foreground/50 shrink-0">
                            #{item.row.skillId}{item.row.damageIds.length > 1 ? ` +${item.row.damageIds.length - 1}` : ""}
                          </span>
                    {/if}
                  </div>
                {:else if item.kind === "skill"}
                  {@const skillIconPath = modifierSkillIconPath(item.row)}
                  {@const breakdownExternalSummary = modifierBreakdownExternalSummary(item.row)}
                  <button
                        class="inline-flex max-w-full items-center gap-1.5 hover:text-foreground transition-colors"
                        onclick={() => toggleModifierRow(item.row.key)}
                        title={modifierSkillTitle(item.row, language)}
                      >
                        <svg
                          class="size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 {expandedModifierRows.has(item.row.key) ? 'rotate-90' : ''}"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        {#if skillIconPath}
                          <img
                            class="size-4 shrink-0 rounded-sm object-cover"
                            src={skillIconPath}
                            alt=""
                            loading="lazy"
                          />
                        {/if}
                        <span class="truncate font-medium text-foreground/90">
                          {modifierSkillLabel(item.row, language)}
                        </span>
                        <span class="shrink-0 rounded border border-border/50 bg-muted/30 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                          {modifierMatchLabel(item.row.match)}
                        </span>
                        {#if modifierHasExternalSources(breakdownExternalSummary)}
                          <span
                            class="inline-block max-w-40 shrink-0 truncate rounded border border-primary/30 bg-primary/10 px-1 py-0.5 align-middle text-[9px] leading-none text-primary"
                            title={modifierExternalBadgeTitle(breakdownExternalSummary)}
                          >
                            {modifierExternalBadgeLabel(breakdownExternalSummary)}
                          </span>
                        {/if}
                        {#if SETTINGS.live.general.state.skillIdDisplayMode === 'column'}
                          <span class="text-[10px] text-muted-foreground/50 shrink-0">
                            #{item.row.skillId}{item.row.damageIds.length > 1 ? ` +${item.row.damageIds.length - 1}` : ""}
                          </span>
                        {/if}
                      </button>
                    {:else if item.kind === "source"}
                      {@const sourceIconPath = modifierSourceIconPath(item.row.source)}
                      {@const effectSummary = modifierEffectSummary(item.row.source, language)}
                      {@const replayModel = modifierFormulaReplayModelFromItem(item)}
                      <div
                        class="inline-flex max-w-full items-center gap-1.5 pl-5"
                        title={modifierSourceTitle(item.row.source, language)}
                      >
                        <span class="w-3 shrink-0 flex justify-center">
                          <span class="size-1 rounded-full bg-muted-foreground/35"></span>
                        </span>
                        {#if sourceIconPath}
                          <img
                            class="size-4 shrink-0 rounded-sm object-cover"
                            src={sourceIconPath}
                            alt=""
                            loading="lazy"
                          />
                        {/if}
                        <span class="truncate">
                          {modifierSourceLabel(item.row.source, language)}
                        </span>
                        {#if modifierHasExternalSources(item.row.source.actorSummary)}
                          <span
                            class="inline-block max-w-40 shrink-0 truncate rounded border border-primary/30 bg-primary/10 px-1 py-0.5 align-middle text-[9px] leading-none text-primary"
                            title={modifierExternalBadgeTitle(item.row.source.actorSummary)}
                          >
                            {modifierExternalBadgeLabel(item.row.source.actorSummary)}
                          </span>
                        {/if}
                        <span class="shrink-0 rounded border border-border/50 bg-background/60 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                          {modifierMatchLabel(item.row.match)}
                        </span>
                        {#if item.row.attributionModel}
                          <span
                            class="shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none {modifierAttributionClass(item.row.attributionModel)}"
                            title={modifierAttributionTitle(item.row.attributionModel)}
                          >
                            {modifierAttributionLabel(item.row.attributionModel)}
                          </span>
                        {/if}
                        {#if item.row.source.timingModel}
                          <span
                            class="shrink-0 rounded border border-cyan-400/35 bg-cyan-400/10 px-1 py-0.5 text-[9px] leading-none text-cyan-200"
                            title={modifierTimingTitle(item.row.source.timingModel)}
                          >
                            {t("detail.modifierTimingPill", "Timing")}
                          </span>
                        {/if}
                        {#if replayModel}
                          <span
                            class="shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none {modifierFormulaReplayClass(replayModel)}"
                            title={modifierFormulaReplayTitle(replayModel)}
                          >
                            {modifierFormulaReplayLabel(replayModel)}
                          </span>
                        {/if}
                        {#if effectSummary}
                          <span
                            class="max-w-48 shrink truncate rounded border border-emerald-400/30 bg-emerald-400/10 px-1 py-0.5 text-[9px] leading-none text-emerald-200"
                            title={modifierEffectSummaryTitle(item.row.source, language)}
                          >
                            {effectSummary}
                          </span>
                        {/if}
                        {#if shouldShowModifierSourceUid(item.row.source)}
                          <span class="text-[10px] text-muted-foreground/50 shrink-0">
                            {modifierSourceUidLabel(item.row.source)}
                          </span>
                        {/if}
                      </div>
                    {/if}
                  </td>
                  <td class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10">
                    {#if SETTINGS.history.general.state.shortenDps}
                      <AbbreviatedNumber num={item.row.totalDmg} decimalPlaces={abbreviatedDecimalPlaces} />
                    {:else}
                      {formatModifierCount(item.row.totalDmg)}
                    {/if}
                  </td>
                  <td
                    class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10"
                    title={modifierEstimatedGainTitle(item)}
                  >
                    {#if modifierEstimatedGain(item) !== null}
                      {#if SETTINGS.history.general.state.shortenDps}
                        <AbbreviatedNumber num={modifierEstimatedGain(item) ?? 0} decimalPlaces={abbreviatedDecimalPlaces} />
                      {:else}
                        {formatModifierCount(modifierEstimatedGain(item) ?? 0)}
                      {/if}
                    {:else}
                      <span class="text-muted-foreground/45">-</span>
                    {/if}
                  </td>
                  <td class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10">
                    {displayPct(item.row.dmgPct).toFixed(1)}%
                  </td>
                  <td class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10">
                    {modifierSourceShare(item).toFixed(1)}%
                  </td>
                  <td class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10">
                    {formatModifierCount(item.row.hits)}
                  </td>
                  <td class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10">
                    {item.row.critRate.toFixed(1)}%
                  </td>
                  <td class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10">
                    {item.row.luckyRate.toFixed(1)}%
                  </td>
                  <TableRowGlow
                    className={selectedModifierPlayer?.className ?? ""}
                    percentage={modifierGlowPercentage(item)}
                  />
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {/if}
    {:else}
    <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-popover/60">
              <th
                class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >{t("detail.player", "玩家")}</th
              >
              {#each visiblePlayerColumns as col (col.key)}
                <th
                  class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >{thLabel(col)}</th
                >
              {/each}
            </tr>
          </thead>
          <tbody class="bg-background/40">
            {#if encounterEntitiesLoading && displayedPlayers.length === 0}
              <tr class="border-t border-border/40">
                <td
                  class="px-3 py-8 text-center text-sm text-muted-foreground"
                  colspan={visiblePlayerColumns.length + 1}
                >
                  {t("detail.loadingEncounterRows", "Loading encounter rows...")}
                </td>
              </tr>
            {:else}
            {#each displayedPlayers as p (p.uid)}
              {@const iconSpecName = getDisplayIconSpecName({
                classSpecName: p.classSpecName,
                showYourNameSetting: settings.state.history.general.showYourName,
                showOthersNameSetting:
                  settings.state.history.general.showOthersName,
                isLocalPlayer: p.isLocalPlayer,
              })}
              <tr
                class="relative border-t border-border/40 hover:bg-muted/60 transition-colors cursor-pointer"
                onclick={() =>
                  viewPlayerSkills(
                    p.uid,
                    activeTab === "healing"
                      ? "heal"
                      : activeTab === "tanked"
                        ? "tanked"
                        : "dps",
                    activeTab === "damage" ? overviewTargetUid : null,
                  )}
              >
                <td
                  class="px-3 py-3 text-sm text-muted-foreground relative z-10"
                >
                  <div class="flex items-center gap-2 h-full">
                    <ClassSpecIcon
                      class="size-5 object-contain"
                      className={p.className}
                      classSpecName={iconSpecName}
                      alt={t("detail.classIcon", "职业图标")}
                      tooltipText={p.classDisplay || t("detail.unknownClass", "Unknown Class")}
                    />
                    <span
                      class="truncate"
                      {@attach tooltip(() => `UID: #${p.uid}`)}
                    >
                      {#if (p.abilityScore > 0 && (p.isLocalPlayer
                        ? SETTINGS.history.general.state.showYourAbilityScore
                        : SETTINGS.history.general.state.showOthersAbilityScore)) || (p.seasonStrength > 0 && (p.isLocalPlayer
                        ? SETTINGS.history.general.state.showYourSeasonStrength
                        : SETTINGS.history.general.state.showOthersSeasonStrength))}
                        <span class="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                          {#if p.abilityScore > 0 && (p.isLocalPlayer
                            ? SETTINGS.history.general.state.showYourAbilityScore
                            : SETTINGS.history.general.state.showOthersAbilityScore)}
                            {#if SETTINGS.history.general.state.shortenAbilityScore}
                              <AbbreviatedNumber num={p.abilityScore} />
                            {:else}
                              <span>{p.abilityScore}</span>
                            {/if}
                          {/if}
                          {#if p.seasonStrength > 0 && (p.isLocalPlayer
                            ? SETTINGS.history.general.state.showYourSeasonStrength
                            : SETTINGS.history.general.state.showOthersSeasonStrength)}
                            <span>·</span>
                            <span>({p.seasonStrength})</span>
                          {/if}
                        </span>
                      {/if}
                      {getDisplayName({
                        player: {
                          uid: p.uid,
                          name: p.name,
                          className: p.className,
                          classSpecName: p.classSpecName,
                        },
                        showYourNameSetting:
                          settings.state.history.general.showYourName,
                        showOthersNameSetting:
                          settings.state.history.general.showOthersName,
                        isLocalPlayer: p.isLocalPlayer,
                      })}
                      {#if p.isLocalPlayer}
                        <span class="ml-1 text-[oklch(0.65_0.1_250)]"
                          >{`(${t("detail.you", "你")})`}</span
                        >
                      {/if}
                    </span>
                  </div>
                </td>
                {#each visiblePlayerColumns as col (col.key)}
                  <td
                    class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10"
                  >
                    {#if (activeTab === "damage" && (col.key === "totalDmg" || col.key === "effectiveTotal" || col.key === "bossDmg" || col.key === "bossDps" || col.key === "dps" || col.key === "effectiveDps" || col.key === "tdps") && SETTINGS.history.general.state.shortenDps) || (activeTab === "healing" && (col.key === "healDealt" || col.key === "effectiveHeal" || col.key === "hps" || col.key === "ehps") && SETTINGS.history.general.state.shortenDps) || (activeTab === "tanked" && (col.key === "damageTaken" || col.key === "tankedPS") && SETTINGS.history.general.state.shortenTps)}
                      {#if activeTab === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps}
                        <AbbreviatedNumber
                          num={p[col.key] ?? 0}
                          decimalPlaces={abbreviatedDecimalPlaces}
                        />
                      {:else}
                        {col.format(p[col.key] ?? 0)}
                      {/if}
                    {:else}
                      {col.format(p[col.key] ?? 0)}
                    {/if}
                  </td>
                {/each}
                <TableRowGlow
                  className={p.className}
                  percentage={activeTab === "healing"
                    ? SETTINGS.history.general.state.relativeToTopHealPlayer &&
                      maxHealPlayer > 0
                      ? (p.healDealt / maxHealPlayer) * 100
                      : p.healPct
                    : activeTab === "tanked"
                      ? SETTINGS.history.general.state
                          .relativeToTopTankedPlayer && maxTankedPlayer > 0
                        ? (p.damageTaken / maxTankedPlayer) * 100
                        : p.tankedPct
                      : SETTINGS.history.general.state.relativeToTopDPSPlayer &&
                          maxDpsPlayer > 0
                        ? (p.totalDmg / maxDpsPlayer) * 100
                        : p.dmgPct}
                />
              </tr>
            {/each}
            {/if}
          </tbody>
        </table>
    </div>
    {/if}
  {:else if charId && selectedPlayer && selectedEntity && skillType === "death"}
    <div class="mb-4">
      {#if selectedDeathTs == null}
        <DeathList
          playerName={getDisplayName({
            player: {
              uid: selectedPlayer.uid,
              name: selectedPlayer.name,
              className: selectedPlayer.className,
              classSpecName: selectedPlayer.classSpecName,
            },
            showYourNameSetting: settings.state.history.general.showYourName,
            showOthersNameSetting: settings.state.history.general.showOthersName,
            isLocalPlayer: selectedPlayer.isLocalPlayer,
          })}
          className={selectedPlayer.className}
          classSpecName={selectedPlayer.classSpecName}
          isLocalPlayer={selectedPlayer.isLocalPlayer}
          deaths={selectedEntity.deaths ?? []}
          fightStartTimestampMs={encounter?.startedAtMs ?? null}
          onSelect={(ts) => viewDeathReplay(selectedPlayer.uid, ts)}
          onBack={backToDeathPlayerList}
          variant="history"
        />
      {:else if selectedDeathRecord}
        <DeathReplayDetail
          playerName={getDisplayName({
            player: {
              uid: selectedPlayer.uid,
              name: selectedPlayer.name,
              className: selectedPlayer.className,
              classSpecName: selectedPlayer.classSpecName,
            },
            showYourNameSetting: settings.state.history.general.showYourName,
            showOthersNameSetting: settings.state.history.general.showOthersName,
            isLocalPlayer: selectedPlayer.isLocalPlayer,
          })}
          className={selectedPlayer.className}
          classSpecName={selectedPlayer.classSpecName}
          isLocalPlayer={selectedPlayer.isLocalPlayer}
          record={selectedDeathRecord}
          onBack={backToDeathList}
          variant="history"
        />
      {:else}
        <div class="rounded border border-border/60 bg-card/30 p-4 text-sm text-muted-foreground">
          {t("detail.deathRecordMissing", "Death replay record not found.")}
        </div>
      {/if}
    </div>
  {:else if charId && selectedPlayer && selectedEntity}
    <!-- Player Skills View -->
    <div class="mb-4">
      <div class="flex items-center gap-3 mb-2">
        <button
          onclick={backToEncounter}
          class="p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded hover:bg-neutral-800"
          aria-label={t("detail.backToOverview", "返回战斗概览")}
        >
          <svg
            class="w-5 h-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div>
          <h2 class="text-xl font-semibold text-foreground">{t("detail.skillDetails", "技能明细")}</h2>
          <div class="text-sm text-neutral-400">
            {t("detail.playerLabel", "玩家")}: {getDisplayName({
              player: {
                uid: selectedPlayer.uid,
                name: selectedPlayer.name,
                className: selectedPlayer.className,
                classSpecName: selectedPlayer.classSpecName,
              },
              showYourNameSetting: settings.state.history.general.showYourName,
              showOthersNameSetting:
                settings.state.history.general.showOthersName,
              isLocalPlayer: selectedPlayer.isLocalPlayer,
            })} <span class="text-neutral-500">#{selectedPlayer.uid}</span>
          </div>
        </div>
      </div>
    </div>

    {#if skillType === "heal"}
      <div class="mb-3 rounded border border-border/60 bg-card/30 p-3">
        <div class="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {t("detail.healTargetDistribution", "治疗目标分布")}
        </div>
        {#if healTargetSummary.length === 0}
          <div class="text-sm text-muted-foreground">{t("detail.noHealTargetData", "暂无治疗目标数据")}</div>
        {:else}
          <div class="space-y-1.5">
            {#each healTargetSummary as target (target.targetUid)}
              {@const pct = healTargetTotal > 0 ? (target.totalValue / healTargetTotal) * 100 : 0}
              <div class="text-sm">
                <div class="flex items-center justify-between gap-2 text-muted-foreground">
                  <span class="truncate">{target.targetName}</span>
                  <span class="shrink-0">
                    {target.totalValue.toLocaleString()} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div class="mt-1 h-1.5 rounded bg-muted/40 overflow-hidden">
                  <div class="h-full bg-primary/70" style="width: {pct}%;"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-popover/60">
            <th
              class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >{t("detail.skillColumn", "技能")}</th
            >
            {#each visibleSkillColumns as col (col.key)}
              <th
                class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >{thLabel(col)}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody class="bg-background/40">
          {#if targetDetailsLoading && selectedSkillTargetUid !== null && flatSkillRows.length === 0}
            <tr class="border-t border-border/40">
              <td
                class="px-3 py-8 text-center text-sm text-muted-foreground"
                colspan={visibleSkillColumns.length + 1}
              >
                {t("detail.loadingTargetSkillRows", "Loading target skill rows...")}
              </td>
            </tr>
          {:else}
          {#each flatSkillRows as item (item.key)}
            {@const skillIconPath = historySkillIconPath(item)}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors"
            >
              <td class="px-3 py-3 text-sm text-muted-foreground relative z-10"
              >
                {#if item.kind === "group"}
                  <button
                    class="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    onclick={() => toggleGroup(item.row.recountId)}
                  >
                    <svg
                      class="size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 {expandedGroups.has(
                        item.row.recountId,
                      )
                        ? 'rotate-90'
                        : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    {#if skillIconPath}
                      <img
                        class="size-4 shrink-0 rounded-sm object-cover"
                        src={skillIconPath}
                        alt=""
                        loading="lazy"
                      />
                    {/if}
                    <span
                      class="truncate"
                      title={shouldShowUidHover()
                        ? buildHistoryGroupHoverText(item.row.recountId, SETTINGS.live.general.state.language as LocaleCode)
                        : undefined}
                    >
                      {historyGroupLabel(item.row, SETTINGS.live.general.state.language as LocaleCode)}
                    </span>
                    {#if SETTINGS.live.general.state.skillIdDisplayMode === 'column'}
                      <span class="text-[10px] text-muted-foreground/50 shrink-0">
                        #{item.row.recountId}
                      </span>
                    {/if}
                    {#if !skillHitsColumnVisible}
                      <span
                        class="shrink-0 rounded border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                        title={t("detail.recountGroupHitCountHelp", "Total emitted hits across this recount group. Expand the row for per-damage-source hits.")}
                      >
                        {historyHitCountLabel(item.row.hits)}
                      </span>
                    {/if}
                  </button>
                {:else}
                  {@const historyRowLabel = historySkillLabel(item.row, SETTINGS.live.general.state.language as LocaleCode)}
                  {@const historyRowDetailLabel = historySkillDetailLabel(item.row, SETTINGS.live.general.state.language as LocaleCode)}
                  <div
                    class="inline-flex items-center gap-1.5"
                    style="padding-left: {item.depth * 16}px;"
                  >
                    {#if item.depth > 0}
                      <span class="w-3 shrink-0 flex justify-center">
                        <span class="size-1 rounded-full bg-muted-foreground/35"></span>
                      </span>
                    {:else}
                      <span class="w-3 shrink-0"></span>
                    {/if}
                    {#if skillIconPath}
                      <img
                        class="size-4 shrink-0 rounded-sm object-cover"
                        src={skillIconPath}
                        alt=""
                        loading="lazy"
                      />
                    {/if}
                    <span
                      class="truncate"
                      title={shouldShowUidHover()
                        ? buildHistorySkillHoverText(item.row.skillId, SETTINGS.live.general.state.language as LocaleCode)
                        : undefined}
                    >
                      {historyRowLabel}
                    </span>
                    {#if historyRowDetailLabel}
                      <span class="max-w-[18rem] truncate text-xs text-muted-foreground/70">
                        · {historyRowDetailLabel}
                      </span>
                    {/if}
                    {#if SETTINGS.live.general.state.skillIdDisplayMode === 'column'}
                      <span class="text-[10px] text-muted-foreground/50 shrink-0">
                        #{item.row.skillId}
                      </span>
                    {/if}
                    {#if !skillHitsColumnVisible}
                      <span
                        class="shrink-0 rounded border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                        title={t("detail.damageSourceHitCountHelp", "Emitted hit packets for this damage source.")}
                      >
                        {historyHitCountLabel(item.row.hits)}
                      </span>
                    {/if}
                  </div>
                {/if}
              </td
              >
              {#each visibleSkillColumns as col (col.key)}
                <td
                  class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10"
                >
                  {#if (col.key === "totalDmg" || col.key === "effectiveTotal" || col.key === "dps" || col.key === "effectiveDps") && (skillType === "tanked" ? SETTINGS.history.general.state.shortenTps : SETTINGS.history.general.state.shortenDps)}
                    <AbbreviatedNumber
                      num={skillCellValue(item, col.key)}
                      decimalPlaces={abbreviatedDecimalPlaces}
                    />
                  {:else if col.key === "property" || col.key === "damageMode"}
                    {col.format(item.row[col.key] ?? null)}
                  {:else}
                    {col.format(skillCellValue(item, col.key))}
                  {/if}
                </td>
              {/each}
              <TableRowGlow
                className={selectedPlayer.className}
                percentage={skillType === "heal"
                  ? SETTINGS.history.general.state.relativeToTopHealSkill &&
                    maxSkillTotal > 0
                    ? (rowTotalDmg(item) / maxSkillTotal) * 100
                    : rowDmgPct(item)
                  : skillType === "tanked"
                    ? SETTINGS.history.general.state.relativeToTopTankedSkill &&
                      maxSkillTotal > 0
                      ? (rowTotalDmg(item) / maxSkillTotal) * 100
                      : rowDmgPct(item)
                    : SETTINGS.history.general.state.relativeToTopDPSSkill &&
                        maxSkillTotal > 0
                      ? (rowTotalDmg(item) / maxSkillTotal) * 100
                      : rowDmgPct(item)}
              />
            </tr>
          {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="text-neutral-400">{t("detail.loading", "加载中...")}</div>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-modal-title"
  >
    <!-- Backdrop -->
    <button
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={closeDeleteModal}
      aria-label={t("detail.closeModal", "关闭弹窗")}
    ></button>

    <!-- Modal Content -->
    <div
      class="relative bg-card border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
    >
      <div class="flex items-start gap-4">
        <!-- Warning Icon -->
        <div
          class="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center"
        >
          <svg
            class="w-5 h-5 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div class="flex-1">
          <h3
            id="delete-modal-title"
            class="text-lg font-semibold text-foreground"
          >
            {t("detail.deleteModalTitle", "删除战斗记录")}
          </h3>
          <p class="mt-2 text-sm text-muted-foreground">
            {t("detail.deleteModalDescription", "确定要删除这条战斗记录吗？此操作无法撤销，所有关联数据都会被永久移除。")}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex justify-end gap-3">
        <button
          onclick={closeDeleteModal}
          disabled={isDeleting}
          class="px-4 py-2 text-sm rounded-md border border-border bg-popover text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("detail.cancel", "取消")}
        </button>
        <button
          onclick={confirmDeleteEncounter}
          disabled={isDeleting}
          class="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {#if isDeleting}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {t("detail.deleting", "删除中...")}
          {:else}
            {t("detail.delete", "删除")}
          {/if}
        </button>
      </div>
  </div>
</div>
{/if}
