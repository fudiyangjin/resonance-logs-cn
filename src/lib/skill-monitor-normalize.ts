import {
  AVAILABLE_PANEL_ATTRS,
  type BuffCoverageEntry,
  type BuffCoverageStyle,
  type BuffGroup,
  type CustomPanelStyle,
  type OverlaySizes,
  type PanelAreaRowRef,
  type PanelAttrConfig,
  type ShieldDetailStyle,
  type SkillMonitorProfile,
  type TextBuffPanelStyle,
  createDefaultBuffCoverageStyle,
  createDefaultCustomPanelStyle,
  createDefaultOverlayTextStyle,
  createDefaultSkillMonitorProfile,
  MAX_BUFF_COVERAGE_ENTRIES,
  ensureOverlayTextStyle,
} from "$lib/settings-store";

export const DEFAULT_OVERLAY_SIZES: OverlaySizes = {
  skillCdGroupScale: 1,
  resourceGroupScale: 1,
  textBuffPanelScale: 1,
  panelAttrGroupScale: 1,
  customPanelGroupScale: 1,
  shieldDetailGroupScale: 1,
  buffCoverageGroupScale: 1,
  panelAttrGap: 4,
  panelAttrFontSize: 14,
  panelAttrColumnGap: 12,
  panelAttrTextStyle: createDefaultOverlayTextStyle(),
  iconBuffSizes: {},
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
    name: group.name ?? "",
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
    name: group.name ?? "",
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
  const allAttrs: PanelAttrConfig[] = [...AVAILABLE_PANEL_ATTRS];
  return allAttrs.map((item) => {
    const existing = currentMap.get(item.attrId);
    return {
      attrId: item.attrId,
      label: String(item.attrId),
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
    shieldDetailGroupScale:
      current?.shieldDetailGroupScale ??
      DEFAULT_OVERLAY_SIZES.shieldDetailGroupScale,
    buffCoverageGroupScale:
      current?.buffCoverageGroupScale ??
      DEFAULT_OVERLAY_SIZES.buffCoverageGroupScale,
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
    panelAttrTextStyle: ensureOverlayTextStyle(current?.panelAttrTextStyle),
    iconBuffSizes: current?.iconBuffSizes ?? {},
    categoryIconSizes: current?.categoryIconSizes ?? {},
  };
}

export function normalizeCustomPanelStyle(
  style: CustomPanelStyle | null | undefined,
): CustomPanelStyle {
  const base = createDefaultCustomPanelStyle();
  return {
    gap: clampRounded(style?.gap ?? base.gap, 0, 24),
    columnGap: clampRounded(style?.columnGap ?? base.columnGap, 0, 240),
    fontSize: clampRounded(style?.fontSize ?? base.fontSize, 10, 28),
    nameColor: style?.nameColor ?? base.nameColor,
    valueColor: style?.valueColor ?? base.valueColor,
    progressColor: style?.progressColor ?? base.progressColor,
    progressOpacity: clampDecimal(
      style?.progressOpacity ?? base.progressOpacity,
      0,
      1,
    ),
    ...ensureOverlayTextStyle(style),
  };
}

export function ensureCustomPanelStyle(
  source:
    | { customPanelStyle?: CustomPanelStyle | null | undefined }
    | null
    | undefined,
): CustomPanelStyle {
  return normalizeCustomPanelStyle(source?.customPanelStyle);
}

export function ensureFactorSlotLabels(
  labels: Record<string, string> | null | undefined,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [slotTemplateId, label] of Object.entries(labels ?? {})) {
    const trimmed = String(label ?? "").trim();
    if (!trimmed) continue;
    next[String(slotTemplateId)] = trimmed;
  }
  return next;
}

export function ensureTextBuffPanelStyle(
  profile: SkillMonitorProfile | null,
): TextBuffPanelStyle {
  const current = profile?.textBuffPanelStyle;
  const base = createDefaultCustomPanelStyle();
  return {
    displayMode: current?.displayMode === "classic" ? "classic" : "modern",
    gap: clampRounded(current?.gap ?? base.gap, 0, 24),
    columnGap: clampRounded(current?.columnGap ?? base.columnGap, 0, 240),
    fontSize: clampRounded(current?.fontSize ?? base.fontSize, 10, 28),
    nameColor: current?.nameColor ?? base.nameColor,
    valueColor: current?.valueColor ?? base.valueColor,
    progressColor: current?.progressColor ?? base.progressColor,
    progressOpacity: clampDecimal(
      current?.progressOpacity ?? base.progressOpacity,
      0,
      1,
    ),
    ...ensureOverlayTextStyle(current),
  };
}

export function ensureBuffCoverageEntries(
  profile: SkillMonitorProfile | null,
): BuffCoverageEntry[] {
  const result: BuffCoverageEntry[] = [];
  const seenBuffIds = new Set<number>();
  const seenEntryIds = new Set<string>();
  for (const [index, entry] of (profile?.buffCoverageEntries ?? []).entries()) {
    const buffId = entry?.buffId;
    if (
      !Number.isSafeInteger(buffId) ||
      buffId <= 0 ||
      buffId > 2_147_483_647 ||
      seenBuffIds.has(buffId)
    ) {
      continue;
    }
    let id = entry.id?.trim() || `coverage_${index + 1}`;
    if (seenEntryIds.has(id)) id = `coverage_${buffId}_${index + 1}`;
    seenBuffIds.add(buffId);
    seenEntryIds.add(id);
    result.push({
      id,
      buffId,
      label: entry.label ?? "",
      showInLive: entry.showInLive ?? true,
    });
    if (result.length === MAX_BUFF_COVERAGE_ENTRIES) break;
  }
  return result;
}

export function ensureBuffCoverageStyle(
  profile: SkillMonitorProfile | null,
): BuffCoverageStyle {
  const current = profile?.buffCoverageStyle;
  const base = createDefaultBuffCoverageStyle();
  return {
    fontSize: clampRounded(current?.fontSize ?? base.fontSize, 10, 28),
    gap: clampRounded(current?.gap ?? base.gap, 0, 24),
    nameColor: current?.nameColor ?? base.nameColor,
    valueColor: current?.valueColor ?? base.valueColor,
    progressColor: current?.progressColor ?? base.progressColor,
    progressOpacity: clampDecimal(
      current?.progressOpacity ?? base.progressOpacity,
      0,
      1,
    ),
    showName: current?.showName ?? base.showName,
    showRemaining: current?.showRemaining ?? base.showRemaining,
    showCount: current?.showCount ?? base.showCount,
    showStateDot: current?.showStateDot ?? base.showStateDot,
    showProgress: current?.showProgress ?? base.showProgress,
    ...ensureOverlayTextStyle(current),
  };
}

export function ensureShieldDetailStyle(
  profile: SkillMonitorProfile | null,
): ShieldDetailStyle {
  const current = profile?.shieldDetailStyle;
  return {
    fontSize: clampRounded(current?.fontSize ?? 11, 8, 28),
    barWidth: clampRounded(current?.barWidth ?? 160, 60, 400),
    gap: clampRounded(current?.gap ?? 3, 0, 24),
    showHpBar: current?.showHpBar ?? true,
    showTotalShieldBar: current?.showTotalShieldBar ?? true,
    showShieldEntries: current?.showShieldEntries ?? true,
    hpColor: current?.hpColor ?? "#4ade80",
    shieldColor: current?.shieldColor ?? "#60a5fa",
    healShieldColor: current?.healShieldColor ?? "#fde68a",
    ...ensureOverlayTextStyle(current),
  };
}

/**
 * Fully normalizes a skill-monitor profile by backfilling every field that
 * was added after some profiles were first created (overlay text-style
 * toggles, panel-attr text style, etc.) with its default value.
 *
 * This is what makes exports and persisted storage converge on the current
 * schema instead of silently carrying stale gaps forever: the runtime reads
 * (`ensure*` above) already tolerate missing fields, but never write the
 * backfilled value back, so without this the gaps live on disk (and in any
 * exported loadout) indefinitely. Idempotent: normalizing an
 * already-normalized profile returns an equivalent value.
 */
export function normalizeSkillProfile(
  profile: SkillMonitorProfile,
): SkillMonitorProfile {
  const defaults = createDefaultSkillMonitorProfile(
    profile.name,
    profile.selectedClass,
  );
  const monitoredPanelAttrs = ensurePanelAttrs(profile);
  const normalized: SkillMonitorProfile = {
    ...defaults,
    ...profile,
    id: profile.id,
    monitoredPanelAttrs,
    panelAreaRowOrder: ensurePanelAreaRowOrder(profile, monitoredPanelAttrs),
    overlayPositions: {
      ...defaults.overlayPositions,
      ...profile.overlayPositions,
    },
    overlayVisibility: {
      ...defaults.overlayVisibility,
      ...profile.overlayVisibility,
    },
    overlaySizes: ensureOverlaySizes(profile),
    overlayTextStyle: ensureOverlayTextStyle(profile.overlayTextStyle),
    textBuffPanelStyle: ensureTextBuffPanelStyle(profile),
    buffCoverageEntries: ensureBuffCoverageEntries(profile),
    buffCoverageStyle: ensureBuffCoverageStyle(profile),
    buffGroups: ensureBuffGroups(profile),
    individualMonitorAllGroup: ensureIndividualMonitorAllGroup(profile),
    customPanelGroups: (profile.customPanelGroups ?? []).map((group) => ({
      ...group,
      style: normalizeCustomPanelStyle(group.style),
    })),
  };
  // `customPanelStyle` and `shieldDetailStyle` are optional/legacy fields
  // that a brand-new profile never sets (see the `@deprecated` note on
  // `customPanelStyle`'s type). Only normalize their fields when the
  // profile already carries one — manufacturing it from nothing would
  // permanently graft a legacy field onto profiles that never had it,
  // which would in turn break the "is this still an untouched default
  // profile" check used for first-run UX.
  if (profile.customPanelStyle) {
    normalized.customPanelStyle = normalizeCustomPanelStyle(
      profile.customPanelStyle,
    );
  }
  if (profile.shieldDetailStyle) {
    normalized.shieldDetailStyle = ensureShieldDetailStyle(profile);
  }
  return normalized;
}
