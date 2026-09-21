import {
  findAnySkillByBaseId,
  findSpecialBuffDisplays,
  getCounterDisplayLabel,
  getCounterRules,
  getSeasonCultivateFactorRuleMap,
  type CounterRulePreset,
  type SpecialBuffDisplay,
} from "$lib/skill-mappings";
import {
  getBuffCategoryLabel,
  getBuffIdsByCategory,
  resolveBuffCategoryKey,
  resolveBuffDisplayName,
} from "$lib/config/buff-name-table";
import { resolveBuffIconSrc } from "$lib/buff-icons";
import { buffIconDirUrlPrefix } from "$lib/buff-icon-dir.svelte";
import type {
  CustomPanelDisplayRow,
  IconBuffDisplay,
  SkillDisplay,
  TextBuffDisplay,
} from "./overlay-types";
import {
  buildBuffTextRow,
  buildPanelAreaRows,
  computeDisplay,
  formatTimerText,
  getBuffRemainingMs,
  getBuffTemporalValue,
  getCustomPanelDisplayRow,
  isBuffActive,
  getResourcePreciseValue as getResourcePreciseValueValue,
  getResourceValue as getResourceValueValue,
  resolveAlertState,
  withFantasyTierSuffix,
} from "./overlay-utils";
import {
  ensureBuffAlerts,
  type BuffAlertRule,
  type BuffAliasMap,
} from "$lib/settings-store";
import {
  activeProfile,
  buffAliases,
  buffDisplayMode,
  buffIconOverrides,
  buffPriorityIds,
  configuredBuffPlan,
  customPanelGroups,
  factorSlotLabels,
  expandedMonitoredBuffIds,
  enabledPanelAttrs,
  monitoredBuffCategories,
  monitoredBuffIds,
  monitoredSkillIds,
  resolvedUserCounterRules,
  selectedClassKey,
  textBuffMaxVisible,
} from "./overlay-profile.svelte.js";
import {
  buffMap,
  buffDefinitions,
  cdMap,
  counterMap,
  factorCounterMap,
  fightResMap,
  isLayoutScaffold,
  seasonActiveTemplateIds,
  seasonCultivateFactorSlotItemIds,
  seasonCultivateSeasonId,
} from "./overlay-runtime.svelte.js";
import type { InlineBuffEntry } from "$lib/settings-store";
import { overlayNow } from "./overlay-clock.svelte.js";
import { hudProjectionRevision } from "$lib/hud-temporal.svelte.js";
import {
  buildRuntimeFactorPlan,
  shouldDisplayOrdinaryBuff,
  type RuntimeFactorPlan,
} from "./buff-display-plan";

export const GAME_PROJECTION_DEADLINE_SOURCE = "game-overlay:display";

type ResolvedSpecialBuffDisplay = Pick<
  IconBuffDisplay,
  "specialDisplayStyle" | "specialImages"
>;

function resolveSpecialBuffDisplay(
  config: SpecialBuffDisplay | undefined,
  layer: number,
): ResolvedSpecialBuffDisplay {
  if (!config) return {};

  if (config.displayStyle === "woodCounter") {
    const digitImages = config.digitImages ?? [];
    if (digitImages.length === 0) return {};
    const digitIndex = Math.min(
      digitImages.length - 1,
      Math.max(0, Math.floor(Number.isFinite(layer) ? layer : 0)),
    );
    const digitImage = digitImages[digitIndex];
    return digitImage
      ? { specialDisplayStyle: "woodCounter", specialImages: [digitImage] }
      : {};
  }

  const layerImages = config.layerImages ?? [];
  if (layerImages.length === 0) return {};
  const layerIdx = Math.min(
    layerImages.length - 1,
    Math.max(0, Math.floor((Number.isFinite(layer) ? layer : 1) - 1)),
  );
  const specialImages = layerImages[layerIdx] ?? [];
  return specialImages.length > 0 ? { specialImages } : {};
}

const _normalizedBuffGroups = $derived.by(
  () => configuredBuffPlan().buffGroups,
);

const _individualMonitorAllGroup = $derived.by(
  () => configuredBuffPlan().individualMonitorAllGroup,
);

const _panelAreaRows = $derived.by(() =>
  buildPanelAreaRows(activeProfile(), enabledPanelAttrs()),
);

const _specialBuffConfigMap = $derived.by(() => {
  const map = new Map<
    number,
    ReturnType<typeof findSpecialBuffDisplays>[number]
  >();
  for (const config of findSpecialBuffDisplays(selectedClassKey())) {
    map.set(config.buffBaseId, config);
  }
  return map;
});

const _counterRuleMap = $derived.by(() => {
  const map = new Map<number, CounterRulePreset>();
  for (const rule of getCounterRules()) {
    map.set(rule.ruleId, rule);
  }
  for (const rule of resolvedUserCounterRules()) {
    map.set(rule.ruleId, rule);
  }
  return map;
});

const _seasonCultivateFactorRuleMap = $derived.by(() =>
  getSeasonCultivateFactorRuleMap(),
);

const _runtimeFactorPlan = $derived.by(() =>
  buildRuntimeFactorPlan(configuredBuffPlan(), {
    seasonId: seasonCultivateSeasonId(),
    slotItemIds: seasonCultivateFactorSlotItemIds(),
    activeTemplateIds: seasonActiveTemplateIds(),
  }),
);

function buildSeasonNodeRows(
  factorPlan: RuntimeFactorPlan,
  now: number,
  currentBuffMap: ReturnType<typeof buffMap>,
  currentBuffAliases: BuffAliasMap,
  resolveAlert: (baseId: number) => BuffAlertRule | undefined,
): CustomPanelDisplayRow[] {
  const hiddenBuffIds = new Set<number>();
  for (const rule of factorPlan.suppressRules) {
    if (isBuffActive(currentBuffMap.get(rule.whenBuffActive), now)) {
      for (const buffId of rule.hide) hiddenBuffIds.add(buffId);
    }
  }

  const nextRows: CustomPanelDisplayRow[] = [];
  for (const buff of factorPlan.nodeBuffs) {
    if (hiddenBuffIds.has(buff.buffId)) continue;
    const entry: InlineBuffEntry = {
      id: `season_node_buff_${buff.buffId}`,
      sourceType: "buff",
      sourceId: buff.buffId,
      label: resolveBuffDisplayName(buff.buffId, currentBuffAliases),
      format: "timer",
    };
    const row = getCustomPanelDisplayRow(
      entry,
      now,
      currentBuffMap,
      factorCounterMap(),
      _seasonCultivateFactorRuleMap,
      (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
      resolveAlert,
    );
    if (row) nextRows.push(row);
  }
  return nextRows;
}

const _buffSnapshot = $derived.by(() => {
  void hudProjectionRevision(GAME_PROJECTION_DEADLINE_SOURCE);
  const now = Date.now();
  const configuredPlan = configuredBuffPlan();
  const factorPlan = _runtimeFactorPlan;
  const explicitSelectedBuffIds = monitoredBuffIds();
  const priorityIds = buffPriorityIds();
  const buffDefinitionsMap = buffDefinitions();
  const iconOverrides = buffIconOverrides();
  const iconDirUrl = buffIconDirUrlPrefix();
  const panelGroups = customPanelGroups();
  const currentBuffMap = buffMap();
  const alertMap = ensureBuffAlerts(activeProfile()?.buffAlerts);
  const resolveAlert = (baseId: number) => alertMap[String(baseId)];
  const currentBuffAliases = buffAliases();
  const nextActiveBuffIds = new Set<number>();
  const nextIconBuffs: IconBuffDisplay[] = [];
  const nextTextBuffs: TextBuffDisplay[] = [];
  const nextCustomPanelRowsByGroup = new Map<string, CustomPanelDisplayRow[]>();
  let nextDeadlineMs: number | null = null;
  const includeDeadline = (deadlineMs: number) => {
    if (deadlineMs <= now) return;
    if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
      nextDeadlineMs = deadlineMs;
    }
  };
  for (const [baseId, buff] of currentBuffMap) {
    if (buff.durationMs > 0) {
      includeDeadline(buff.createTimeMs + buff.durationMs);
    }

    const remaining = getBuffRemainingMs(buff, now);
    if (isBuffActive(buff, now)) {
      nextActiveBuffIds.add(baseId);
    } else {
      continue;
    }
    if (!shouldDisplayOrdinaryBuff(configuredPlan, factorPlan, baseId)) {
      continue;
    }

    if (
      buff.durationMs <= 0 &&
      buff.layer <= 1 &&
      !configuredPlan.normalDisplayIds.has(baseId)
    )
      continue;

    const definition = buffDefinitionsMap.get(baseId);
    const name = withFantasyTierSuffix(
      resolveBuffDisplayName(baseId, currentBuffAliases),
      buff,
    );
    const timeText = formatTimerText(remaining);
    const alertRule = resolveAlert(baseId);
    const alert = resolveAlertState(alertRule, remaining, buff.durationMs);
    const temporal = getBuffTemporalValue(buff, alertRule);
    const iconSrc = resolveBuffIconSrc(
      baseId,
      definition?.spriteFile,
      iconOverrides,
      iconDirUrl,
    );
    // A player override wins over special (per-layer) displays. It counts
    // only when actually applied (see resolveBuffIconSrc): configured and
    // the icon directory is ready.
    const isIconOverrideActive =
      iconOverrides[String(baseId)] !== undefined && iconDirUrl !== null;
    const specialDisplay: ResolvedSpecialBuffDisplay = isIconOverrideActive
      ? {}
      : resolveSpecialBuffDisplay(
          _specialBuffConfigMap.get(baseId),
          buff.layer,
        );

    if (iconSrc) {
      nextIconBuffs.push({
        baseId,
        name,
        iconSrc,
        ...(isIconOverrideActive && definition?.spriteFile
          ? { fallbackSrc: `/images/buff/${definition.spriteFile}` }
          : {}),
        text: timeText,
        layer: buff.layer,
        ...(specialDisplay.specialImages ? specialDisplay : {}),
        ...(alert ? { alert } : {}),
        ...(temporal ? { temporal } : {}),
      });
    } else {
      const row = buildBuffTextRow(
        `buff_${baseId}`,
        name,
        buff,
        now,
        false,
        false,
        resolveAlert,
      );
      if (row) nextTextBuffs.push(row);
    }
  }

  if (isLayoutScaffold()) {
    const iconIds = new Set(nextIconBuffs.map((buff) => buff.baseId));
    const textIds = new Set(nextTextBuffs.map((buff) => buff.key));
    for (const baseId of explicitSelectedBuffIds) {
      if (!shouldDisplayOrdinaryBuff(configuredPlan, factorPlan, baseId)) {
        continue;
      }
      if (iconIds.has(baseId) || textIds.has(`buff_${baseId}`)) continue;
      const definition = buffDefinitionsMap.get(baseId);
      const name = resolveBuffDisplayName(baseId, currentBuffAliases);
      const iconSrc = resolveBuffIconSrc(
        baseId,
        definition?.spriteFile,
        iconOverrides,
        iconDirUrl,
      );
      const isIconOverrideActive =
        iconOverrides[String(baseId)] !== undefined && iconDirUrl !== null;
      const placeholderSpecialDisplay: ResolvedSpecialBuffDisplay =
        isIconOverrideActive
          ? {}
          : resolveSpecialBuffDisplay(_specialBuffConfigMap.get(baseId), 0);
      if (iconSrc) {
        nextIconBuffs.push({
          baseId,
          name,
          iconSrc,
          ...(isIconOverrideActive && definition?.spriteFile
            ? { fallbackSrc: `/images/buff/${definition.spriteFile}` }
            : {}),
          text: "--",
          layer: 1,
          isPlaceholder: true,
          ...(placeholderSpecialDisplay.specialImages
            ? placeholderSpecialDisplay
            : {}),
        });
      } else {
        const row = buildBuffTextRow(
          `buff_${baseId}`,
          name,
          {
            baseId,
            durationMs: 0,
            createTimeMs: now,
            layer: 1,
            sourceRemodelLevel: null,
          },
          now,
          true,
        );
        if (row) nextTextBuffs.push(row);
      }
    }
  }

  const sortBuffPriority = getBuffPrioritySorter(priorityIds);
  nextIconBuffs.sort((left, right) => {
    const [leftPriority, leftBaseId] = sortBuffPriority(left.baseId);
    const [rightPriority, rightBaseId] = sortBuffPriority(right.baseId);
    return leftPriority - rightPriority || leftBaseId - rightBaseId;
  });
  nextTextBuffs.sort((left, right) => {
    const [leftPriority, leftBaseId] = sortBuffPriority(
      getTextBuffBaseId(left),
    );
    const [rightPriority, rightBaseId] = sortBuffPriority(
      getTextBuffBaseId(right),
    );
    return leftPriority - rightPriority || leftBaseId - rightBaseId;
  });

  for (const group of panelGroups) {
    const nextRows: CustomPanelDisplayRow[] = [];
    if (group.kind === "seasonCultivateFactor") {
      if (factorPlan.mode === "node") {
        nextRows.push(
          ...buildSeasonNodeRows(
            factorPlan,
            now,
            currentBuffMap,
            currentBuffAliases,
            resolveAlert,
          ),
        );
      } else if (factorPlan.mode === "factor") {
        const effectBuffIds = new Set<number>();
        const effectBuffEntries: InlineBuffEntry[] = [];
        for (const item of factorPlan.legacyItems) {
          const rule = _seasonCultivateFactorRuleMap.get(item.ruleId);
          if (!rule) continue;
          const customLabel = item.slotTemplateId
            ? factorSlotLabels()[item.slotTemplateId]
            : undefined;
          const entry: InlineBuffEntry = {
            id: `season_cultivate_factor_${item.itemId}`,
            sourceType: "counter",
            sourceId: item.ruleId,
            counterSlotId: rule.effectSlots[0]?.slotId ?? 1,
            hideWhenZero: group.hideZeroCounters === true,
            label: customLabel || rule.name,
            format: "timer",
          };
          const row = getCustomPanelDisplayRow(
            entry,
            now,
            currentBuffMap,
            factorCounterMap(),
            _seasonCultivateFactorRuleMap,
            (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
            resolveAlert,
          );
          if (row) nextRows.push(row);
          for (const buffId of item.effectBuffIds) {
            if (effectBuffIds.has(buffId)) continue;
            effectBuffIds.add(buffId);
            effectBuffEntries.push({
              id: `season_cultivate_factor_effect_${item.itemId}_${buffId}`,
              sourceType: "buff",
              sourceId: buffId,
              label: resolveBuffDisplayName(buffId, currentBuffAliases),
              format: "timer",
            });
          }
        }
        for (const entry of effectBuffEntries) {
          const row = getCustomPanelDisplayRow(
            entry,
            now,
            currentBuffMap,
            factorCounterMap(),
            _seasonCultivateFactorRuleMap,
            (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
            resolveAlert,
          );
          if (row) {
            nextRows.push(row);
            continue;
          }
          if (!isLayoutScaffold()) continue;
          const placeholderRow = buildBuffTextRow(
            `inline_buff_${entry.id}`,
            entry.label,
            {
              baseId: entry.sourceId,
              durationMs: 0,
              createTimeMs: now,
              layer: 1,
              sourceRemodelLevel: null,
            },
            now,
            true,
            true,
            resolveAlert,
          );
          if (placeholderRow) nextRows.push(placeholderRow);
        }
      }
    } else {
      for (const entry of group.entries) {
        const counterRule =
          entry.sourceType === "counter"
            ? _counterRuleMap.get(entry.sourceId)
            : undefined;
        const displayEntry =
          entry.sourceType === "counter"
            ? {
                ...entry,
                label: getCounterDisplayLabel({
                  ...entry,
                  ruleName: counterRule?.name,
                }),
              }
            : entry;
        const row = getCustomPanelDisplayRow(
          displayEntry,
          now,
          currentBuffMap,
          counterMap(),
          _counterRuleMap,
          (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
          resolveAlert,
        );
        if (row) nextRows.push(row);
      }
    }
    nextCustomPanelRowsByGroup.set(group.id, nextRows);
  }

  for (const rows of nextCustomPanelRowsByGroup.values()) {
    for (const row of rows) {
      if (row.temporal) includeDeadline(row.temporal.deadlineMs);
    }
  }

  return {
    activeBuffIds: nextActiveBuffIds,
    iconDisplayBuffs: nextIconBuffs,
    textBuffs: nextTextBuffs,
    customPanelRowsByGroup: nextCustomPanelRowsByGroup,
    nextDeadlineMs,
  };
});

// Resolve static skill metadata only when the class or visible slots change.
const _skillDefinitions = $derived.by(() => {
  const classKey = selectedClassKey();
  return new Map(
    monitoredSkillIds()
      .slice(0, 10)
      .filter(Boolean)
      .map(
        (skillId) =>
          [skillId, findAnySkillByBaseId(classKey, skillId)] as const,
      ),
  );
});

const _displayMap = $derived.by(() => {
  const now = overlayNow();
  const cds = cdMap();
  const nextDisplayMap = new Map<number, SkillDisplay>();

  for (const skillId of _skillDefinitions.keys()) {
    const cd = cds.get(skillId);
    if (!cd) continue;
    const display = computeDisplay(cd, now);
    if (display) {
      nextDisplayMap.set(skillId, display);
    }
  }
  return nextDisplayMap;
});

const _activeBuffIds = $derived.by(() => _buffSnapshot.activeBuffIds);
const _iconDisplayBuffs = $derived.by(() => _buffSnapshot.iconDisplayBuffs);
const _textBuffs = $derived.by(() => _buffSnapshot.textBuffs);
const _customPanelRowsByGroup = $derived.by(
  () => _buffSnapshot.customPanelRowsByGroup,
);
const _groupedIconBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "grouped")
    return new Map<string, IconBuffDisplay[]>();
  const groups = _normalizedBuffGroups;
  const iconBuffs = _iconDisplayBuffs.filter(
    (buff) => !(buff.specialImages && buff.specialImages.length > 0),
  );
  const selectedBySpecificGroups = new Set<number>();
  for (const group of groups) {
    if (group.monitorAll) continue;
    for (const buffId of group.buffIds) {
      selectedBySpecificGroups.add(buffId);
    }
  }
  const result = new Map<string, IconBuffDisplay[]>();
  for (const group of groups) {
    const maxVisible = Math.max(1, group.columns * group.rows);
    const entries = group.monitorAll
      ? iconBuffs.filter((buff) => !selectedBySpecificGroups.has(buff.baseId))
      : iconBuffs.filter((buff) => group.buffIds.includes(buff.baseId));
    result.set(group.id, entries.slice(0, maxVisible));
  }
  return result;
});

const _individualModeIconBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "individual") return [];
  const selected = new Set(expandedMonitoredBuffIds());
  const explicitSelected = new Set(monitoredBuffIds());
  const selectedCategories = monitoredBuffCategories();
  const visibleBuffs = _iconDisplayBuffs.filter((buff) =>
    selected.has(buff.baseId),
  );
  const explicitBuffs = visibleBuffs
    .filter((buff) => explicitSelected.has(buff.baseId))
    .map((buff) => ({
      ...buff,
      layoutKey: `buff:${buff.baseId}`,
    }));
  const categoryBuffs: IconBuffDisplay[] = [];
  for (const categoryKey of selectedCategories) {
    const activeCategoryBuff = visibleBuffs.find(
      (buff) =>
        !explicitSelected.has(buff.baseId) &&
        resolveBuffCategoryKey(buff.baseId) === categoryKey,
    );
    if (activeCategoryBuff) {
      categoryBuffs.push({
        ...activeCategoryBuff,
        layoutKey: `category:${categoryKey}`,
        categoryKey,
      });
      continue;
    }
    if (!isLayoutScaffold()) continue;
    const representativeId = getBuffIdsByCategory(categoryKey)[0];
    if (representativeId === undefined) continue;
    const definition = buffDefinitions().get(representativeId);
    const iconSrc = resolveBuffIconSrc(
      representativeId,
      definition?.spriteFile,
      buffIconOverrides(),
      buffIconDirUrlPrefix(),
    );
    if (!iconSrc) continue;
    categoryBuffs.push({
      baseId: representativeId,
      name: getBuffCategoryLabel(categoryKey),
      iconSrc,
      text: "--",
      layer: 1,
      isPlaceholder: true,
      layoutKey: `category:${categoryKey}`,
      categoryKey,
    });
  }
  return [...explicitBuffs, ...categoryBuffs];
});

const _individualAllGroupBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "individual" || !_individualMonitorAllGroup)
    return [];
  const selected = new Set(expandedMonitoredBuffIds());
  return _iconDisplayBuffs.filter(
    (buff) =>
      !selected.has(buff.baseId) &&
      !(buff.specialImages && buff.specialImages.length > 0),
  );
});

const _specialStandaloneBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "grouped") return [];
  const specials = _iconDisplayBuffs.filter(
    (buff) => buff.specialImages && buff.specialImages.length > 0,
  );
  const groups = _normalizedBuffGroups;
  if (groups.some((group) => group.monitorAll)) return specials;
  const selectedIds = new Set<number>();
  for (const group of groups) {
    for (const buffId of group.buffIds) {
      selectedIds.add(buffId);
    }
  }
  return specials.filter((buff) => selectedIds.has(buff.baseId));
});

const _limitedTextBuffs = $derived.by(() =>
  _textBuffs.slice(0, textBuffMaxVisible()),
);

export function normalizedBuffGroups() {
  return _normalizedBuffGroups;
}

export function individualMonitorAllGroup() {
  return _individualMonitorAllGroup;
}

export function panelAreaRows() {
  return _panelAreaRows;
}

export function activeBuffIds() {
  return _activeBuffIds;
}

export function skillDefinitions() {
  return _skillDefinitions;
}

export function displayMap() {
  return _displayMap;
}

export function iconDisplayBuffs() {
  return _iconDisplayBuffs;
}

export function textBuffs() {
  return _textBuffs;
}

export function specialBuffConfigMap() {
  return _specialBuffConfigMap;
}

export function counterRuleMap() {
  return _counterRuleMap;
}

export function groupedIconBuffs() {
  return _groupedIconBuffs;
}

export function individualModeIconBuffs() {
  return _individualModeIconBuffs;
}

export function individualAllGroupBuffs() {
  return _individualAllGroupBuffs;
}

export function specialStandaloneBuffs() {
  return _specialStandaloneBuffs;
}

export function limitedTextBuffs() {
  return _limitedTextBuffs;
}

export function customPanelRowsByGroup() {
  return _customPanelRowsByGroup;
}

export function nextOverlayProjectionDeadline(): number | null {
  return _buffSnapshot.nextDeadlineMs;
}

export function getResourceValue(resourceId: number): number {
  return getResourceValueValue(fightResMap(), selectedClassKey(), resourceId);
}

export function getResourcePreciseValue(resourceId: number): number {
  return getResourcePreciseValueValue(
    fightResMap(),
    selectedClassKey(),
    resourceId,
  );
}

function getBuffPrioritySorter(priorityIds: number[]) {
  if (priorityIds.length === 0) {
    return (baseId: number) => [Number.MAX_SAFE_INTEGER, baseId] as const;
  }

  const priorityIndex = new Map(priorityIds.map((id, idx) => [id, idx]));
  return (baseId: number) =>
    [priorityIndex.get(baseId) ?? priorityIds.length, baseId] as const;
}

function getTextBuffBaseId(row: TextBuffDisplay): number {
  const match = /^buff_(\d+)$/.exec(row.key);
  const baseId = match?.[1];
  return baseId ? Number.parseInt(baseId, 10) : Number.MAX_SAFE_INTEGER;
}
