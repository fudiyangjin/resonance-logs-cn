import type { ConfiguredBuffPlan } from "$lib/buff-monitor-plan";
import {
  getSeasonCultivateFactorEffectBuffIdMap,
  getSeasonCultivateFactorItemSlotTemplateMap,
  getSeasonCultivateFactorRuleId,
  resolveActiveSeasonNodeTemplates,
  resolveSeasonPanelMode,
  SEASON_NODE_BUFF_CONFIG,
  type SeasonNodeSuppressRule,
  type SeasonNodeTemplate,
  type SeasonPanelMode,
} from "$lib/skill-mappings";

export type LegacyFactorItemPlan = {
  itemId: number;
  ruleId: number;
  slotTemplateId?: string;
  effectBuffIds: readonly number[];
};

export type SeasonNodeBuffPlan = {
  templateId: number;
  buffId: number;
};

export type RuntimeFactorPlan = {
  mode: SeasonPanelMode | "disabled";
  ownedBuffIds: ReadonlySet<number>;
  legacyItems: readonly LegacyFactorItemPlan[];
  nodeBuffs: readonly SeasonNodeBuffPlan[];
  suppressRules: readonly SeasonNodeSuppressRule[];
};

export type RuntimeFactorContext = {
  seasonId: number;
  slotItemIds: readonly number[];
  activeTemplateIds: ReadonlySet<number>;
};

export type FactorDisplayCatalog = {
  effectBuffIdsByItem: ReadonlyMap<number, readonly number[]>;
  slotTemplateIdByItem: ReadonlyMap<number, string>;
  nodeTemplates: readonly SeasonNodeTemplate[];
};

const DEFAULT_FACTOR_DISPLAY_CATALOG: FactorDisplayCatalog = {
  effectBuffIdsByItem: getSeasonCultivateFactorEffectBuffIdMap(),
  slotTemplateIdByItem: getSeasonCultivateFactorItemSlotTemplateMap(),
  nodeTemplates: SEASON_NODE_BUFF_CONFIG.templates,
};

const EMPTY_FACTOR_PLAN: RuntimeFactorPlan = {
  mode: "disabled",
  ownedBuffIds: new Set<number>(),
  legacyItems: [],
  nodeBuffs: [],
  suppressRules: [],
};

export function buildRuntimeFactorPlan(
  configured: ConfiguredBuffPlan,
  context: RuntimeFactorContext,
  catalog: FactorDisplayCatalog = DEFAULT_FACTOR_DISPLAY_CATALOG,
): RuntimeFactorPlan {
  if (!configured.hasFactorPanel) return EMPTY_FACTOR_PLAN;

  const mode = resolveSeasonPanelMode(context.seasonId);
  if (mode === "unknown") {
    return {
      mode,
      ownedBuffIds: configured.factorDisplayCandidateIds,
      legacyItems: [],
      nodeBuffs: [],
      suppressRules: [],
    };
  }
  if (mode === "factor") {
    return buildLegacyFactorPlan(context.slotItemIds, catalog);
  }
  return buildSeasonNodePlan(context.activeTemplateIds, catalog);
}

export function shouldDisplayOrdinaryBuff(
  configured: ConfiguredBuffPlan,
  factor: RuntimeFactorPlan,
  baseId: number,
): boolean {
  if (
    configured.liveOwnedBuffIds.has(baseId) ||
    factor.ownedBuffIds.has(baseId)
  ) {
    return false;
  }
  return configured.monitorAll || configured.normalDisplayIds.has(baseId);
}

function buildLegacyFactorPlan(
  slotItemIds: readonly number[],
  catalog: FactorDisplayCatalog,
): RuntimeFactorPlan {
  const seenItems = new Set<number>();
  const ownedBuffIds = new Set<number>();
  const legacyItems: LegacyFactorItemPlan[] = [];

  for (const itemId of slotItemIds) {
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || seenItems.has(itemId)) {
      continue;
    }
    seenItems.add(itemId);
    const effectBuffIds = catalog.effectBuffIdsByItem.get(itemId) ?? [];
    const slotTemplateId = catalog.slotTemplateIdByItem.get(itemId);
    for (const buffId of effectBuffIds) ownedBuffIds.add(buffId);
    legacyItems.push({
      itemId,
      ruleId: getSeasonCultivateFactorRuleId(itemId),
      ...(slotTemplateId ? { slotTemplateId } : {}),
      effectBuffIds,
    });
  }

  return {
    mode: "factor",
    ownedBuffIds,
    legacyItems,
    nodeBuffs: [],
    suppressRules: [],
  };
}

function buildSeasonNodePlan(
  activeTemplateIds: ReadonlySet<number>,
  catalog: FactorDisplayCatalog,
): RuntimeFactorPlan {
  const ownedBuffIds = new Set<number>();
  const nodeBuffs: SeasonNodeBuffPlan[] = [];
  const suppressRules: SeasonNodeSuppressRule[] = [];

  for (const template of resolveActiveSeasonNodeTemplates(
    activeTemplateIds,
    catalog.nodeTemplates,
  )) {
    suppressRules.push(...template.suppressRules);
    for (const buff of template.displayBuffs) {
      if (ownedBuffIds.has(buff.buffId)) continue;
      ownedBuffIds.add(buff.buffId);
      nodeBuffs.push({
        templateId: template.templateId,
        buffId: buff.buffId,
      });
    }
  }

  return {
    mode: "node",
    ownedBuffIds,
    legacyItems: [],
    nodeBuffs,
    suppressRules,
  };
}
