import {
  getSeasonCultivateFactorEffectBuffIdMap,
  getSeasonCultivateFactorItemSlotTemplateMap,
  getSeasonCultivateFactorRuleId,
  resolveActiveSeasonNodeTemplates,
  resolveSeasonPanelMode,
  SEASON_NODE_BUFF_CONFIG,
  type SeasonNodeTemplate,
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

/** Rows of the factor / season-node panel. Which buffs the monitor-all
 * catch-all leaves to this panel is decided statically by the configured
 * plan, never by this runtime view. */
export type RuntimeFactorPlan = {
  mode: "factor" | "node" | "disabled";
  legacyItems: readonly LegacyFactorItemPlan[];
  nodeBuffs: readonly SeasonNodeBuffPlan[];
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
  legacyItems: [],
  nodeBuffs: [],
};

export function buildRuntimeFactorPlan(
  hasFactorPanel: boolean,
  context: RuntimeFactorContext,
  catalog: FactorDisplayCatalog = DEFAULT_FACTOR_DISPLAY_CATALOG,
): RuntimeFactorPlan {
  if (!hasFactorPanel) return EMPTY_FACTOR_PLAN;

  const mode = resolveSeasonPanelMode(context.seasonId);
  if (mode === "factor") {
    return buildLegacyFactorPlan(context.slotItemIds, catalog);
  }
  if (mode === "node") {
    return buildSeasonNodePlan(context.activeTemplateIds, catalog);
  }
  return EMPTY_FACTOR_PLAN;
}

function buildLegacyFactorPlan(
  slotItemIds: readonly number[],
  catalog: FactorDisplayCatalog,
): RuntimeFactorPlan {
  const seenItems = new Set<number>();
  const legacyItems: LegacyFactorItemPlan[] = [];

  for (const itemId of slotItemIds) {
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || seenItems.has(itemId)) {
      continue;
    }
    seenItems.add(itemId);
    const effectBuffIds = catalog.effectBuffIdsByItem.get(itemId) ?? [];
    const slotTemplateId = catalog.slotTemplateIdByItem.get(itemId);
    legacyItems.push({
      itemId,
      ruleId: getSeasonCultivateFactorRuleId(itemId),
      ...(slotTemplateId ? { slotTemplateId } : {}),
      effectBuffIds,
    });
  }

  return {
    mode: "factor",
    legacyItems,
    nodeBuffs: [],
  };
}

function buildSeasonNodePlan(
  activeTemplateIds: ReadonlySet<number>,
  catalog: FactorDisplayCatalog,
): RuntimeFactorPlan {
  const seenBuffIds = new Set<number>();
  const nodeBuffs: SeasonNodeBuffPlan[] = [];

  for (const template of resolveActiveSeasonNodeTemplates(
    activeTemplateIds,
    catalog.nodeTemplates,
  )) {
    for (const buff of template.displayBuffs) {
      if (seenBuffIds.has(buff.buffId)) continue;
      seenBuffIds.add(buff.buffId);
      nodeBuffs.push({
        templateId: template.templateId,
        buffId: buff.buffId,
      });
    }
  }

  return {
    mode: "node",
    legacyItems: [],
    nodeBuffs,
  };
}
