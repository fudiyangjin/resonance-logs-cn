import {
  AVAILABLE_PANEL_ATTRS,
  type BuffGroup,
  type CustomPanelStyle,
  type OverlaySizes,
  type PanelAreaRowRef,
  type PanelAttrConfig,
  type SkillMonitorProfile,
  type TextBuffPanelStyle,
} from "$lib/settings-store";

export const DEFAULT_OVERLAY_SIZES: OverlaySizes = {
  skillCdGroupScale: 1,
  resourceGroupScale: 1,
  textBuffPanelScale: 1,
  panelAttrGroupScale: 1,
  customPanelGroupScale: 1,
  panelAttrGap: 4,
  panelAttrFontSize: 14,
  panelAttrColumnGap: 12,
  iconBuffSizes: {},
  standaloneIconSizes: {},
  skillDurationSizes: {},
  categoryIconSizes: {},
};

export function clampRounded(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function clampDecimal(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ensureBuffGroup(group: BuffGroup, index: number): BuffGroup {
  return {
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
  };
}

export function ensureBuffGroups(profile: SkillMonitorProfile): BuffGroup[] {
  const groups = profile.buffGroups ?? [];
  return groups.map((group, index) => ensureBuffGroup(group, index));
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

export function ensurePanelAttrs(
  profile: SkillMonitorProfile | null,
): PanelAttrConfig[] {
  const current = profile?.monitoredPanelAttrs ?? [];
  const currentMap = new Map(current.map((item) => [item.attrId, item]));
  return AVAILABLE_PANEL_ATTRS.map((item) => {
    const existing = currentMap.get(item.attrId);
    return {
      attrId: item.attrId,
      label: existing?.label ?? item.label,
      color: existing?.color ?? item.color,
      enabled: existing?.enabled ?? item.enabled,
      format: existing?.format ?? item.format,
    };
  });
}

function samePanelRowRef(a: PanelAreaRowRef, b: PanelAreaRowRef): boolean {
  return a.attrId === b.attrId;
}

export function ensurePanelAreaRowOrder(
  profile: SkillMonitorProfile,
  monitoredPanelAttrs?: PanelAttrConfig[],
): PanelAreaRowRef[] {
  const attrs = monitoredPanelAttrs ?? ensurePanelAttrs(profile);
  const enabledAttrIds = attrs
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
    const row: PanelAreaRowRef = { type: "attr", attrId };
    if (!rows.some((item) => samePanelRowRef(item, row))) {
      rows.push(row);
    }
  }
  return rows;
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
    standaloneIconSizes: current?.standaloneIconSizes ?? {},
    skillDurationSizes: current?.skillDurationSizes ?? {},
    categoryIconSizes: current?.categoryIconSizes ?? {},
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
