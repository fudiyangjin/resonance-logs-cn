import {
  findAnySkillByBaseId,
  findSpecialBuffDisplays,
  getCounterRules,
  type CounterRulePreset,
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
} from "./overlay-utils";
import {
  activeProfile,
  buffAliases,
  buffDisplayMode,
  buffPriorityIds,
  customPanelGroups,
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
  overlayRuntime,
  skillDurationMap,
} from "./overlay-runtime.svelte.js";
import { overlayNow } from "./overlay-clock.svelte.js";

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
  const map = new Map<number, (ReturnType<typeof findSpecialBuffDisplays>)[number]>();
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

const _buffSnapshot = $derived.by(() => {
  const now = overlayNow();
  const explicitSelectedBuffIds = monitoredBuffIds();
  const priorityIds = buffPriorityIds();
  const buffDefinitionsMap = buffDefinitions();
  const panelGroups = customPanelGroups();
  const skippedInlineBuffIds = new Set(
    panelGroups
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

    // Filter passive/infinite single-stack buffs from both icon and text displays.
    if (buff.durationMs <= 0 && buff.layer <= 1) continue;

    const definition = buffDefinitionsMap.get(baseId);
    const name = resolveBuffDisplayName(baseId, currentBuffAliases);
    const timeText = formatTimerText(remaining);
    const specialConfig = _specialBuffConfigMap.get(baseId);
    const specialImages = specialConfig
      ? (() => {
          const layer = Math.max(1, buff.layer);
          const layerIdx = Math.min(
            specialConfig.layerImages.length - 1,
            layer - 1,
          );
          return specialConfig.layerImages[layerIdx] ?? [];
        })()
      : [];

    if (definition?.spriteFile) {
      nextIconBuffs.push({
        baseId,
        name,
        spriteFile: definition.spriteFile,
        text: timeText,
        layer: buff.layer,
        ...(specialImages.length > 0 ? { specialImages } : {}),
      });
    } else {
      const row = buildBuffTextRow(`buff_${baseId}`, name, buff, now);
      if (row) nextTextBuffs.push(row);
    }
  }

  if (overlayRuntime.isEditing) {
    const iconIds = new Set(nextIconBuffs.map((buff) => buff.baseId));
    const textIds = new Set(nextTextBuffs.map((buff) => buff.key));
    for (const baseId of explicitSelectedBuffIds) {
      if (iconIds.has(baseId) || textIds.has(`buff_${baseId}`)) continue;
      const definition = buffDefinitionsMap.get(baseId);
      const name = resolveBuffDisplayName(baseId, currentBuffAliases);
      const specialConfig = _specialBuffConfigMap.get(baseId);
      const placeholderSpecialImages =
        specialConfig && specialConfig.layerImages.length > 0
          ? (specialConfig.layerImages[0] ?? [])
          : [];
      if (definition?.spriteFile) {
        nextIconBuffs.push({
          baseId,
          name,
          spriteFile: definition.spriteFile,
          text: "--",
          layer: 1,
          isPlaceholder: true,
          ...(placeholderSpecialImages.length > 0
            ? { specialImages: placeholderSpecialImages }
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
    const [leftPriority, leftBaseId] = sortBuffPriority(getTextBuffBaseId(left));
    const [rightPriority, rightBaseId] = sortBuffPriority(getTextBuffBaseId(right));
    return leftPriority - rightPriority || leftBaseId - rightBaseId;
  });

  for (const group of panelGroups) {
    const nextRows: CustomPanelDisplayRow[] = [];
    for (const entry of group.entries) {
      const row = getCustomPanelDisplayRow(
        entry,
        now,
        buffMap(),
        counterMap(),
        _counterRuleMap,
        (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
      );
      if (row) nextRows.push(row);
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

    if (overlayRuntime.isEditing) {
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
const _buffDurationPercents = $derived.by(() => _buffSnapshot.buffDurationPercents);
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
  if (buffDisplayMode() !== "grouped") return new Map<string, IconBuffDisplay[]>();
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
    const activeCategoryBuff = visibleBuffs.find((buff) =>
      !explicitSelected.has(buff.baseId) &&
      resolveBuffCategoryKey(buff.baseId) === categoryKey
    );
    if (activeCategoryBuff) {
      categoryBuffs.push({
        ...activeCategoryBuff,
        layoutKey: `category:${categoryKey}`,
        categoryKey,
      });
      continue;
    }
    if (!overlayRuntime.isEditing) continue;
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
  if (buffDisplayMode() !== "individual" || !_individualMonitorAllGroup) return [];
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

export function getResourceValue(index: number): number {
  return getResourceValueValue(
    overlayRuntime.fightResValues,
    selectedClassKey(),
    index,
  );
}

export function getResourcePreciseValue(index: number): number {
  return getResourcePreciseValueValue(
    overlayRuntime.fightResValues,
    selectedClassKey(),
    index,
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
