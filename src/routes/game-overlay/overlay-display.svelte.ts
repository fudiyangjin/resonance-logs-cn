import {
  findAnySkillByBaseId,
  findSpecialBuffDisplays,
  getCounterDisplayLabel,
  getCounterRules,
  getSeasonCultivateFactorConfiguredEffectBuffIds,
  getSeasonCultivateFactorEffectBuffIdMap,
  getSeasonCultivateFactorItemSlotTemplateMap,
  getSeasonCultivateFactorRuleId,
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
import type {
  CustomPanelDisplayRow,
  IconBuffDisplay,
  SkillDisplay,
  SkillDurationDisplay,
  TextBuffDisplay,
} from "./overlay-types";
import {
  buildBuffTextRow,
  buildPanelAreaRows,
  computeDisplay,
  ensureBuffGroups,
  ensureIndividualMonitorAllGroup,
  formatTimerText,
  getCustomPanelDisplayRow,
  getResourcePreciseValue as getResourcePreciseValueValue,
  getResourceValue as getResourceValueValue,
  resolveAlertState,
} from "./overlay-utils";
import { ensureBuffAlerts } from "$lib/settings-store";
import {
  activeProfile,
  buffAliases,
  buffDisplayMode,
  buffPriorityIds,
  customPanelGroups,
  factorSlotLabels,
  expandedMonitoredBuffIds,
  enabledPanelAttrs,
  monitoredBuffCategories,
  monitoredBuffIds,
  monitoredSkillDurationIds,
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
  isLayoutScaffold,
  overlayRuntime,
  seasonCultivateFactorSlotItemIds,
  skillDurationMap,
} from "./overlay-runtime.svelte.js";
import type { InlineBuffEntry } from "$lib/settings-store";
import { overlayNow } from "./overlay-clock.svelte.js";

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

const _normalizedBuffGroups = $derived.by(() => {
  const profile = activeProfile();
  if (!profile) return [];
  return ensureBuffGroups(profile);
});

const _individualMonitorAllGroup = $derived.by(() => {
  const profile = activeProfile();
  if (!profile) return null;
  return ensureIndividualMonitorAllGroup(profile);
});

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

const _seasonCultivateFactorEffectBuffIdMap = $derived.by(() =>
  getSeasonCultivateFactorEffectBuffIdMap(),
);

const _seasonCultivateFactorItemSlotTemplateMap = $derived.by(() =>
  getSeasonCultivateFactorItemSlotTemplateMap(),
);

const _seasonCultivateFactorOwnedEffectBuffIds = $derived.by(() => {
  const result = new Set<number>();
  const hasFactorPanelGroup = customPanelGroups().some(
    (group) => group.kind === "seasonCultivateFactor",
  );
  if (!hasFactorPanelGroup) return result;

  for (const buffId of getSeasonCultivateFactorConfiguredEffectBuffIds()) {
    result.add(buffId);
  }
  return result;
});

const _buffSnapshot = $derived.by(() => {
  const now = overlayNow();
  const explicitSelectedBuffIds = monitoredBuffIds();
  const priorityIds = buffPriorityIds();
  const buffDefinitionsMap = buffDefinitions();
  const panelGroups = customPanelGroups();
  const alertMap = ensureBuffAlerts(activeProfile()?.buffAlerts);
  const resolveAlert = (
    baseId: number,
    remainingMs: number,
    durationMs: number,
  ) => resolveAlertState(alertMap[String(baseId)], remainingMs, durationMs);
  const skippedInlineBuffIds = new Set(
    panelGroups
      .filter((group) => group.kind === "manual")
      .flatMap((group) => group.entries)
      .filter((entry) => entry.sourceType === "buff")
      .map((entry) => entry.sourceId),
  );
  const currentBuffAliases = buffAliases();
  const nextActiveBuffIds = new Set<number>();
  const nextBuffDurationPercents = new Map<number, number>();
  const nextIconBuffs: IconBuffDisplay[] = [];
  const nextTextBuffs: TextBuffDisplay[] = [];
  const nextCustomPanelRowsByGroup = new Map<string, CustomPanelDisplayRow[]>();
  const factorOwnedEffectBuffIds = _seasonCultivateFactorOwnedEffectBuffIds;
  const userExplicitBuffIds = new Set([
    ...expandedMonitoredBuffIds(),
    ..._normalizedBuffGroups
      .filter((g) => !g.monitorAll)
      .flatMap((g) => g.buffIds),
  ]);

  for (const [baseId, buff] of buffMap()) {
    if (skippedInlineBuffIds.has(baseId)) continue;

    const end = buff.createTimeMs + buff.durationMs;
    const remaining = Math.max(0, end - now);
    const remainPercent =
      buff.durationMs > 0
        ? Math.min(100, Math.max(0, (remaining / buff.durationMs) * 100))
        : 100;

    if (buff.durationMs > 0) {
      nextBuffDurationPercents.set(baseId, remainPercent);
    }
    if (buff.durationMs <= 0 || end > now) {
      nextActiveBuffIds.add(baseId);
    } else {
      continue;
    }

    if (
      buff.durationMs <= 0 &&
      buff.layer <= 1 &&
      !userExplicitBuffIds.has(baseId)
    )
      continue;
    if (factorOwnedEffectBuffIds.has(baseId)) continue;

    const definition = buffDefinitionsMap.get(baseId);
    const name = resolveBuffDisplayName(baseId, currentBuffAliases);
    const timeText = formatTimerText(remaining);
    const alert = resolveAlert(baseId, remaining, buff.durationMs);
    const specialDisplay = resolveSpecialBuffDisplay(
      _specialBuffConfigMap.get(baseId),
      buff.layer,
    );

    if (definition?.spriteFile) {
      nextIconBuffs.push({
        baseId,
        name,
        spriteFile: definition.spriteFile,
        text: timeText,
        layer: buff.layer,
        ...(specialDisplay.specialImages ? specialDisplay : {}),
        ...(alert ? { alert } : {}),
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
      if (factorOwnedEffectBuffIds.has(baseId)) continue;
      if (iconIds.has(baseId) || textIds.has(`buff_${baseId}`)) continue;
      const definition = buffDefinitionsMap.get(baseId);
      const name = resolveBuffDisplayName(baseId, currentBuffAliases);
      const placeholderSpecialDisplay = resolveSpecialBuffDisplay(
        _specialBuffConfigMap.get(baseId),
        0,
      );
      if (definition?.spriteFile) {
        nextIconBuffs.push({
          baseId,
          name,
          spriteFile: definition.spriteFile,
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
      const effectBuffIds = new Set<number>();
      const effectBuffEntries: InlineBuffEntry[] = [];
      for (const itemId of seasonCultivateFactorSlotItemIds()) {
        const ruleId = getSeasonCultivateFactorRuleId(itemId);
        const rule = _seasonCultivateFactorRuleMap.get(ruleId);
        if (!rule) continue;
        const slotTemplateId =
          _seasonCultivateFactorItemSlotTemplateMap.get(itemId);
        const customLabel = slotTemplateId
          ? factorSlotLabels()[slotTemplateId]
          : undefined;
        const entry: InlineBuffEntry = {
          id: `season_cultivate_factor_${itemId}`,
          sourceType: "counter",
          sourceId: ruleId,
          counterSlotId: rule.effectSlots[0]?.slotId ?? 1,
          hideWhenZero: group.hideZeroCounters === true,
          label: customLabel || rule.name,
          format: "timer",
        };
        const row = getCustomPanelDisplayRow(
          entry,
          now,
          buffMap(),
          factorCounterMap(),
          _seasonCultivateFactorRuleMap,
          (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
          resolveAlert,
        );
        if (row) nextRows.push(row);
        const configuredEffectBuffIds =
          _seasonCultivateFactorEffectBuffIdMap.get(itemId) ?? [];
        for (const buffId of configuredEffectBuffIds) {
          if (effectBuffIds.has(buffId)) continue;
          effectBuffIds.add(buffId);
          effectBuffEntries.push({
            id: `season_cultivate_factor_effect_${itemId}_${buffId}`,
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
          buffMap(),
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
          },
          now,
          true,
          true,
          resolveAlert,
        );
        if (placeholderRow) nextRows.push(placeholderRow);
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
          buffMap(),
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

  return {
    activeBuffIds: nextActiveBuffIds,
    buffDurationPercents: nextBuffDurationPercents,
    iconDisplayBuffs: nextIconBuffs,
    textBuffs: nextTextBuffs,
    customPanelRowsByGroup: nextCustomPanelRowsByGroup,
  };
});

const _skillSnapshot = $derived.by(() => {
  const now = overlayNow();
  const classKey = selectedClassKey();
  const nextDisplayMap = new Map<number, SkillDisplay>();
  const nextSkillDurationDisplays: SkillDurationDisplay[] = [];

  for (const [skillId, cd] of cdMap()) {
    const display = computeDisplay(classKey, skillId, cd, now);
    if (display) {
      nextDisplayMap.set(skillId, display);
    }
  }

  for (const skillId of monitoredSkillDurationIds()) {
    const skill = findAnySkillByBaseId(classKey, skillId);
    if (!skill) continue;
    const durationState = skillDurationMap().get(skillId);
    if (durationState) {
      const remaining = Math.max(
        0,
        durationState.startedAtMs + durationState.durationMs - now,
      );
      if (remaining > 0) {
        nextSkillDurationDisplays.push({
          skillId,
          name: skill.name,
          imagePath: skill.imagePath,
          text: formatTimerText(remaining),
        });
        continue;
      }
    }

    if (isLayoutScaffold()) {
      nextSkillDurationDisplays.push({
        skillId,
        name: skill.name,
        imagePath: skill.imagePath,
        text: "--",
        isPlaceholder: true,
      });
    }
  }

  return {
    displayMap: nextDisplayMap,
    skillDurationDisplays: nextSkillDurationDisplays,
  };
});

const _activeBuffIds = $derived.by(() => _buffSnapshot.activeBuffIds);
const _buffDurationPercents = $derived.by(
  () => _buffSnapshot.buffDurationPercents,
);
const _iconDisplayBuffs = $derived.by(() => _buffSnapshot.iconDisplayBuffs);
const _textBuffs = $derived.by(() => _buffSnapshot.textBuffs);
const _customPanelRowsByGroup = $derived.by(
  () => _buffSnapshot.customPanelRowsByGroup,
);
const _displayMap = $derived.by(() => _skillSnapshot.displayMap);
const _skillDurationDisplays = $derived.by(
  () => _skillSnapshot.skillDurationDisplays,
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
    if (!definition?.spriteFile) continue;
    categoryBuffs.push({
      baseId: representativeId,
      name: getBuffCategoryLabel(categoryKey),
      spriteFile: definition.spriteFile,
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

export function buffDurationPercents() {
  return _buffDurationPercents;
}

export function displayMap() {
  return _displayMap;
}

export function skillDurationDisplays() {
  return _skillDurationDisplays;
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

export function getResourceValue(resourceId: number): number {
  return getResourceValueValue(
    overlayRuntime.fightResMap,
    selectedClassKey(),
    resourceId,
  );
}

export function getResourcePreciseValue(resourceId: number): number {
  return getResourcePreciseValueValue(
    overlayRuntime.fightResMap,
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
