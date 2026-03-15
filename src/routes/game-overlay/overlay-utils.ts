import type {
  BuffUpdateState,
  CounterUpdateState,
  SkillCdState,
} from "$lib/api";
import type {
  BuffGroup,
  CustomPanelStyle,
  InlineBuffEntry,
  OverlayPositions,
  OverlaySizes,
  OverlayVisibility,
  PanelAreaRowRef,
  PanelAttrConfig,
  SkillMonitorProfile,
  TextBuffPanelStyle,
} from "$lib/settings-store";
import { findAnySkillByBaseId } from "$lib/skill-mappings";
import {
  DEFAULT_OVERLAY_POSITIONS,
  DEFAULT_OVERLAY_SIZES,
  DEFAULT_OVERLAY_VISIBILITY,
  DEFAULT_RESOURCE_VALUES_BY_CLASS,
  RESOURCE_SCALES,
} from "./overlay-constants";
import type {
  CustomPanelDisplayRow,
  PanelAreaDisplayRow,
  SkillDisplay,
  TextBuffDisplay,
} from "./overlay-types";

export function ensureOverlayPositions(
  profile: SkillMonitorProfile,
): OverlayPositions {
  const current = profile.overlayPositions;
  return {
    skillCdGroup:
      current?.skillCdGroup ?? DEFAULT_OVERLAY_POSITIONS.skillCdGroup,
    resourceGroup:
      current?.resourceGroup ?? DEFAULT_OVERLAY_POSITIONS.resourceGroup,
    textBuffPanel:
      current?.textBuffPanel ?? DEFAULT_OVERLAY_POSITIONS.textBuffPanel,
    specialBuffGroup:
      current?.specialBuffGroup ?? DEFAULT_OVERLAY_POSITIONS.specialBuffGroup,
    panelAttrGroup:
      current?.panelAttrGroup ?? DEFAULT_OVERLAY_POSITIONS.panelAttrGroup,
    customPanelGroup:
      current?.customPanelGroup ?? DEFAULT_OVERLAY_POSITIONS.customPanelGroup,
    iconBuffPositions: current?.iconBuffPositions ?? {},
    categoryIconPositions: current?.categoryIconPositions ?? {},
  };
}

export function ensureOverlaySizes(profile: SkillMonitorProfile): OverlaySizes {
  const current = profile.overlaySizes;
  return {
    skillCdGroupScale:
      current?.skillCdGroupScale ?? DEFAULT_OVERLAY_SIZES.skillCdGroupScale,
    resourceGroupScale:
      current?.resourceGroupScale ?? DEFAULT_OVERLAY_SIZES.resourceGroupScale,
    textBuffPanelScale:
      current?.textBuffPanelScale ?? DEFAULT_OVERLAY_SIZES.textBuffPanelScale,
    panelAttrGroupScale:
      current?.panelAttrGroupScale ?? DEFAULT_OVERLAY_SIZES.panelAttrGroupScale,
    customPanelGroupScale:
      current?.customPanelGroupScale ??
      DEFAULT_OVERLAY_SIZES.customPanelGroupScale,
    panelAttrGap: clampRounded(
      current?.panelAttrGap ?? DEFAULT_OVERLAY_SIZES.panelAttrGap,
      0,
      24,
    ),
    panelAttrFontSize: clampRounded(
      current?.panelAttrFontSize ?? DEFAULT_OVERLAY_SIZES.panelAttrFontSize,
      10,
      28,
    ),
    panelAttrColumnGap: clampRounded(
      current?.panelAttrColumnGap ?? DEFAULT_OVERLAY_SIZES.panelAttrColumnGap,
      0,
      240,
    ),
    iconBuffSizes: current?.iconBuffSizes ?? {},
    categoryIconSizes: current?.categoryIconSizes ?? {},
  };
}

export function ensureOverlayVisibility(
  profile: SkillMonitorProfile,
): OverlayVisibility {
  const current = profile.overlayVisibility;
  return {
    showSkillCdGroup:
      current?.showSkillCdGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showSkillCdGroup,
    showResourceGroup:
      current?.showResourceGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showResourceGroup,
    showPanelAttrGroup:
      current?.showPanelAttrGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showPanelAttrGroup,
    showCustomPanelGroup:
      current?.showCustomPanelGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showCustomPanelGroup,
  };
}

export function ensureCustomPanelStyle(
  profile: SkillMonitorProfile | null,
): CustomPanelStyle {
  const current = profile?.customPanelStyle;
  return {
    gap: clampRounded(current?.gap ?? 6, 0, 24),
    columnGap: clampRounded(current?.columnGap ?? 12, 0, 240),
    fontSize: clampRounded(current?.fontSize ?? 14, 10, 28),
    nameColor: current?.nameColor ?? "#ffffff",
    valueColor: current?.valueColor ?? "#ffffff",
    progressColor: current?.progressColor ?? "#ffffff",
    progressOpacity: clampDecimal(current?.progressOpacity ?? 0.4, 0, 1),
  };
}

export function ensureTextBuffPanelStyle(
  profile: SkillMonitorProfile | null,
): TextBuffPanelStyle {
  const current = profile?.textBuffPanelStyle;
  return {
    displayMode: current?.displayMode === "classic" ? "classic" : "modern",
    gap: clampRounded(current?.gap ?? 6, 0, 24),
    columnGap: clampRounded(current?.columnGap ?? 8, 0, 240),
    fontSize: clampRounded(current?.fontSize ?? 12, 10, 28),
    nameColor: current?.nameColor ?? "#ffffff",
    valueColor: current?.valueColor ?? "#ffffff",
    progressColor: current?.progressColor ?? "#ffffff",
    progressOpacity: clampDecimal(current?.progressOpacity ?? 0.4, 0, 1),
  };
}

export function formatAttrValue(
  value: number,
  format: PanelAttrConfig["format"],
): string {
  if (format === "integer") {
    return value.toLocaleString();
  }
  return `${(value / 100).toFixed(2)}%`;
}

export function getBuffRemainingMs(
  buff: BuffUpdateState | undefined,
  now: number,
): number {
  if (!buff) return 0;
  if (buff.durationMs <= 0) return Number.POSITIVE_INFINITY;
  const end = buff.createTimeMs + buff.durationMs;
  return Math.max(0, end - now);
}

export function isBuffActive(
  buff: BuffUpdateState | undefined,
  now: number,
): boolean {
  if (!buff) return false;
  if (buff.durationMs <= 0) return true;
  return buff.createTimeMs + buff.durationMs > now;
}

export function formatTimerText(remainingMs: number): string {
  if (!Number.isFinite(remainingMs)) return "∞";
  if (remainingMs <= 0) return "--";
  if (remainingMs <= 60_000) {
    return `${(remainingMs / 1000).toFixed(1)}s`;
  }
  if (remainingMs <= 3_600_000) {
    return `${(remainingMs / 60_000).toFixed(1)}m`;
  }
  return `${(remainingMs / 3_600_000).toFixed(1)}h`;
}

export function getBuffRemainPercent(
  buff: BuffUpdateState | undefined,
  now: number,
): number {
  if (!buff || buff.durationMs <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, (getBuffRemainingMs(buff, now) / buff.durationMs) * 100),
  );
}

export function buildBuffTextRow(
  key: string,
  label: string,
  buff: BuffUpdateState,
  now: number,
  isPlaceholder = false,
): TextBuffDisplay | null {
  const active = isBuffActive(buff, now);
  if (!active && !isPlaceholder) return null;

  if (buff.durationMs <= 0 && buff.layer <= 1 && !isPlaceholder) {
    return null;
  }

  const remainingMs = getBuffRemainingMs(buff, now);
  const layer = Math.max(1, buff.layer);

  return {
    key,
    label,
    valueText: isPlaceholder ? "--" : formatTimerText(remainingMs),
    metaText: layer > 1 ? `x${layer}` : undefined,
    progressPercent: isPlaceholder ? 0 : getBuffRemainPercent(buff, now),
    showProgress: !isPlaceholder && buff.durationMs > 0,
    ...(isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

export function getCustomPanelDisplayRow(
  entry: InlineBuffEntry,
  now: number,
  buffMap: Map<number, BuffUpdateState>,
  counterMap: Map<number, CounterUpdateState>,
  counterRuleMap: Map<number, { linkedBuffId: number }>,
  resolveBuffName: (baseId: number) => string,
): CustomPanelDisplayRow | null {
  if (entry.sourceType === "buff") {
    const buff = buffMap.get(entry.sourceId);
    if (!buff) return null;
    return buildBuffTextRow(
      `inline_buff_${entry.id}`,
      resolveBuffName(entry.sourceId),
      buff,
      now,
    );
  }

  const counter = counterMap.get(entry.sourceId);
  const rule = counterRuleMap.get(entry.sourceId);
  const linkedBuff = buffMap.get(counter?.linkedBuffId ?? rule?.linkedBuffId ?? -1);
  const active = counter?.linkedBuffActive ?? isBuffActive(linkedBuff, now);
  const remainingMs = getBuffRemainingMs(linkedBuff, now);
  if (!counter) {
    return {
      key: `counter_${entry.id}`,
      label: entry.label,
      valueText: "--",
      progressPercent: 0,
      showProgress: false,
    };
  }
  if (counter.isCounting) {
    return {
      key: `inline_counter_${entry.id}`,
      label: entry.label,
      valueText: `${Math.max(0, counter.currentCount)}`,
      metaText: undefined,
      progressPercent: 0,
      showProgress: false,
    };
  }
  return {
    key: `inline_counter_${entry.id}`,
    label: entry.label,
    valueText: active ? formatTimerText(remainingMs) : "--",
    metaText: active ? "冷却中" : "冷却中",
    progressPercent: getBuffRemainPercent(linkedBuff, now),
    showProgress: active && Boolean(linkedBuff && linkedBuff.durationMs > 0),
  };
}

export function ensureBuffGroups(profile: SkillMonitorProfile): BuffGroup[] {
  const groups = profile.buffGroups ?? [];
  return groups.map((group, index) => ({
    id: group.id ?? `group_${index + 1}`,
    name: group.name ?? `分组 ${index + 1}`,
    buffIds: group.buffIds ?? [],
    priorityBuffIds: group.priorityBuffIds ?? [],
    monitorAll: group.monitorAll ?? false,
    position: group.position ?? { x: 40 + index * 40, y: 310 + index * 40 },
    iconSize: clampRounded(group.iconSize ?? 44, 24, 120),
    columns: clampRounded(group.columns ?? 6, 1, 12),
    rows: clampRounded(group.rows ?? 3, 1, 12),
    gap: clampRounded(group.gap ?? 6, 0, 16),
    showName: group.showName ?? true,
    showTime: group.showTime ?? true,
    showLayer: group.showLayer ?? true,
  }));
}

export function ensureIndividualMonitorAllGroup(
  profile: SkillMonitorProfile,
): BuffGroup | null {
  const group = profile.individualMonitorAllGroup;
  if (!group) return null;
  return {
    id: group.id ?? "individual_all_group",
    name: group.name ?? "全部 Buff",
    buffIds: [],
    priorityBuffIds: group.priorityBuffIds ?? [],
    monitorAll: true,
    position: group.position ?? { x: 40, y: 310 },
    iconSize: clampRounded(group.iconSize ?? 44, 24, 120),
    columns: clampRounded(group.columns ?? 6, 1, 12),
    rows: clampRounded(group.rows ?? 3, 1, 12),
    gap: clampRounded(group.gap ?? 6, 0, 16),
    showName: group.showName ?? true,
    showTime: group.showTime ?? true,
    showLayer: group.showLayer ?? true,
  };
}

export function ensureInlineBuffEntries(
  profile: SkillMonitorProfile,
): InlineBuffEntry[] {
  return (profile.inlineBuffEntries ?? []).map((entry, idx) => ({
    id: entry.id ?? `inline_${idx + 1}`,
    sourceType: entry.sourceType ?? "buff",
    sourceId: entry.sourceId,
    label:
      entry.sourceType === "counter"
        ? (entry.label ?? `计数器 ${entry.sourceId}`)
        : (entry.label ?? ""),
    format: entry.format ?? "timer",
  }));
}

function samePanelRowRef(a: PanelAreaRowRef, b: PanelAreaRowRef): boolean {
  return a.attrId === b.attrId;
}

export function ensurePanelAreaRowOrder(
  profile: SkillMonitorProfile,
  monitoredPanelAttrs: PanelAttrConfig[],
): PanelAreaRowRef[] {
  const enabledAttrIds = monitoredPanelAttrs
    .filter((item) => item.enabled)
    .map((item) => item.attrId);
  const attrIdSet = new Set(enabledAttrIds);
  const rows: PanelAreaRowRef[] = [];
  for (const row of profile.panelAreaRowOrder ?? []) {
    if (!attrIdSet.has(row.attrId)) continue;
    if (!rows.some((item) => samePanelRowRef(item, row))) {
      rows.push({ type: "attr", attrId: row.attrId });
    }
  }
  for (const attrId of enabledAttrIds) {
    if (!rows.some((row) => row.type === "attr" && row.attrId === attrId)) {
      rows.push({ type: "attr", attrId });
    }
  }
  return rows;
}

export function buildPanelAreaRows(
  activeProfile: SkillMonitorProfile | null,
  enabledPanelAttrs: PanelAttrConfig[],
): PanelAreaDisplayRow[] {
  if (!activeProfile) return [];
  const rows = ensurePanelAreaRowOrder(activeProfile, enabledPanelAttrs);
  const result: PanelAreaDisplayRow[] = [];
  for (const row of rows) {
    const attr = enabledPanelAttrs.find((item) => item.attrId === row.attrId);
    if (attr) {
      result.push({ key: `attr_${attr.attrId}`, attr });
    }
  }
  for (const attr of enabledPanelAttrs) {
    if (!result.some((row) => row.attr.attrId === attr.attrId)) {
      result.push({ key: `attr_${attr.attrId}`, attr });
    }
  }
  return result;
}

export function computeDisplay(
  selectedClassKey: string,
  skillId: number,
  cd: SkillCdState,
  now: number,
): SkillDisplay | null {
  const skill = findAnySkillByBaseId(selectedClassKey, skillId);
  const cdAccelerateRate = Math.max(0, cd.cdAccelerateRate ?? 0);
  const elapsed = Math.max(0, now - cd.receivedAt);
  const baseDuration = cd.duration > 0 ? Math.max(1, cd.duration) : 1;
  const reducedDuration = cd.duration > 0 ? Math.max(0, cd.calculatedDuration) : 0;
  const validCdScale = cd.duration > 0 ? reducedDuration / baseDuration : 1;
  const scaledValidCdTime = cd.validCdTime * validCdScale;
  const progressed = scaledValidCdTime + elapsed * (1 + cdAccelerateRate);

  if (cd.duration === -1 && cd.skillCdType === 1) {
    if (!skill?.maxValidCdTime) return null;
    const chargePercent = Math.max(
      0,
      Math.min(1, cd.validCdTime / skill.maxValidCdTime),
    );
    return {
      isActive: chargePercent < 1,
      percent: 1 - chargePercent,
      text: `${Math.round(chargePercent * 100)}%`,
    };
  }

  if (cd.skillCdType === 1 && cd.duration > 0) {
    const maxCharges = Math.max(1, skill?.maxCharges ?? 1);
    if (maxCharges > 1) {
      const chargeDuration = Math.max(1, cd.calculatedDuration);
      const maxVct = maxCharges * chargeDuration;
      const currentVct = Math.min(maxVct, progressed);
      const chargesAvailable = Math.min(
        maxCharges,
        Math.floor(currentVct / chargeDuration),
      );
      const chargesOnCd = Math.max(0, maxCharges - chargesAvailable);
      if (chargesOnCd <= 0) {
        return {
          isActive: false,
          percent: 0,
          text: "",
          chargesText: `${maxCharges}/${maxCharges}`,
        };
      }
      const timeToNextCharge = Math.max(
        0,
        chargeDuration - (currentVct % chargeDuration),
      );
      return {
        isActive: chargesOnCd > 0,
        percent: Math.min(1, timeToNextCharge / chargeDuration),
        text: (timeToNextCharge / 1000).toFixed(1),
        chargesText: `${chargesAvailable}/${maxCharges}`,
      };
    }
  }

  const remaining =
    reducedDuration > 0 ? Math.max(0, reducedDuration - progressed) : 0;
  const duration = reducedDuration > 0 ? reducedDuration : 1;
  return {
    isActive: remaining > 0,
    percent: remaining > 0 ? Math.min(1, remaining / duration) : 0,
    text: remaining > 0 ? (remaining / 1000).toFixed(1) : "",
  };
}

export function getResourceValue(
  fightResValues: number[],
  selectedClassKey: string,
  index: number,
): number {
  const raw = fightResValues[index];
  if (raw === undefined) {
    return DEFAULT_RESOURCE_VALUES_BY_CLASS[selectedClassKey]?.[index] ?? 0;
  }
  const scale = RESOURCE_SCALES[index] ?? 1;
  return Math.floor(raw / scale);
}

export function getResourcePreciseValue(
  fightResValues: number[],
  selectedClassKey: string,
  index: number,
): number {
  const raw = fightResValues[index];
  if (raw === undefined) {
    return DEFAULT_RESOURCE_VALUES_BY_CLASS[selectedClassKey]?.[index] ?? 0;
  }
  const scale = RESOURCE_SCALES[index] ?? 1;
  return raw / scale;
}

function clampRounded(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampDecimal(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
