import { findSpecialBuffDisplays, getCounterRules } from "$lib/skill-mappings";
import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
import type { CustomPanelDisplayRow, IconBuffDisplay, SkillDisplay, TextBuffDisplay } from "./overlay-types";
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
  enabledPanelAttrs,
  inlineBuffEntries,
  inlineBuffIds,
  monitoredBuffIds,
  selectedClassKey,
  textBuffMaxVisible,
} from "./overlay-profile.svelte.js";
import {
  buffDefinitions,
  overlayRuntime,
} from "./overlay-runtime.svelte.js";

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
  const map = new Map<number, (ReturnType<typeof getCounterRules>)[number]>();
  for (const rule of getCounterRules()) {
    map.set(rule.ruleId, rule);
  }
  return map;
});

const _groupedIconBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "grouped") return new Map<string, IconBuffDisplay[]>();
  const groups = _normalizedBuffGroups;
  const iconBuffs = overlayRuntime.iconDisplayBuffs.filter(
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
  const selected = new Set(monitoredBuffIds());
  return overlayRuntime.iconDisplayBuffs.filter((buff) =>
    selected.has(buff.baseId),
  );
});

const _individualAllGroupBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "individual" || !_individualMonitorAllGroup) return [];
  const selected = new Set(monitoredBuffIds());
  return overlayRuntime.iconDisplayBuffs.filter(
    (buff) =>
      !selected.has(buff.baseId) &&
      !(buff.specialImages && buff.specialImages.length > 0),
  );
});

const _specialStandaloneBuffs = $derived.by(() => {
  if (buffDisplayMode() !== "grouped") return [];
  const specials = overlayRuntime.iconDisplayBuffs.filter(
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
  overlayRuntime.textBuffs.slice(0, textBuffMaxVisible()),
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

export function customPanelRows() {
  return overlayRuntime.customPanelRows;
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

export function updateDisplay() {
  const now = Date.now();
  const selectedBuffIds = monitoredBuffIds();
  const buffDefinitionsMap = buffDefinitions();
  const skippedInlineBuffIds = inlineBuffIds();
  const currentBuffAliases = buffAliases();
  const classKey = selectedClassKey();
  const nextActiveBuffIds = new Set<number>();
  const nextBuffDurationPercents = new Map<number, number>();
  const nextIconBuffs: IconBuffDisplay[] = [];
  const nextTextBuffs: TextBuffDisplay[] = [];
  const nextCustomPanelRows: CustomPanelDisplayRow[] = [];

  for (const [baseId, buff] of overlayRuntime.buffMap) {
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
    for (const baseId of selectedBuffIds) {
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
            buffUuid: 0,
            durationMs: 0,
            createTimeMs: now,
            layer: 1,
            sourceConfigId: 0,
          },
          now,
          true,
        );
        if (row) nextTextBuffs.push(row);
      }
    }
  }

  const nextDisplayMap = new Map<number, SkillDisplay>();
  for (const [skillId, cd] of overlayRuntime.cdMap) {
    const display = computeDisplay(classKey, skillId, cd, now);
    if (display) {
      nextDisplayMap.set(skillId, display);
    }
  }

  for (const entry of inlineBuffEntries()) {
    const row = getCustomPanelDisplayRow(
      entry,
      now,
      overlayRuntime.buffMap,
      overlayRuntime.counterMap,
      _counterRuleMap,
      (baseId) => resolveBuffDisplayName(baseId, currentBuffAliases),
    );
    if (row) nextCustomPanelRows.push(row);
  }

  overlayRuntime.activeBuffIds = nextActiveBuffIds;
  overlayRuntime.buffDurationPercents = nextBuffDurationPercents;
  overlayRuntime.displayMap = nextDisplayMap;
  overlayRuntime.iconDisplayBuffs = nextIconBuffs;
  overlayRuntime.textBuffs = nextTextBuffs;
  overlayRuntime.customPanelRows = nextCustomPanelRows;
  overlayRuntime.rafId = requestAnimationFrame(updateDisplay);
}
