import type {
  CustomPanelGroup,
  InlineBuffEntry,
  SkillMonitorProfile,
} from "$lib/settings-store";

const DEFAULT_CUSTOM_PANEL_GROUP_POSITION = { x: 700, y: 280 };
const DEFAULT_CUSTOM_PANEL_GROUP_SCALE = 1;

export function ensureCustomPanelEntries(
  entries: InlineBuffEntry[] | undefined,
): InlineBuffEntry[] {
  return (entries ?? []).map((entry, idx) => ({
    id: entry.id ?? `inline_${idx + 1}`,
    sourceType: entry.sourceType ?? "buff",
    sourceId: entry.sourceId,
    ...(entry.counterSlotId !== undefined
      ? { counterSlotId: entry.counterSlotId }
      : {}),
    label:
      entry.sourceType === "counter"
        ? (entry.label ?? `计数器 ${entry.sourceId}`)
        : (entry.label ?? ""),
    format: entry.format ?? "timer",
  }));
}

export function ensureInlineBuffEntries(
  profile: SkillMonitorProfile,
): InlineBuffEntry[] {
  return ensureCustomPanelEntries(profile.inlineBuffEntries);
}

export function ensureCustomPanelGroups(
  profile: SkillMonitorProfile,
): CustomPanelGroup[] {
  const groups = profile.customPanelGroups ?? [];
  const legacyPosition =
    profile.overlayPositions?.customPanelGroup ??
    DEFAULT_CUSTOM_PANEL_GROUP_POSITION;
  const legacyScale = clampDecimal(
    profile.overlaySizes?.customPanelGroupScale ??
      DEFAULT_CUSTOM_PANEL_GROUP_SCALE,
    0.5,
    2.5,
  );
  if (groups.length > 0) {
    return groups.map((group, index) => ({
      id: group.id ?? `custom_panel_group_${index + 1}`,
      name: group.name ?? `监控区 ${index + 1}`,
      entries: ensureCustomPanelEntries(group.entries),
      position: group.position ?? {
        x: legacyPosition.x + index * 40,
        y: legacyPosition.y + index * 40,
      },
      scale: clampDecimal(
        group.scale ?? (index === 0 ? legacyScale : 1),
        0.5,
        2.5,
      ),
    }));
  }

  const legacyEntries = ensureInlineBuffEntries(profile);
  if (legacyEntries.length === 0) return [];
  return [
    {
      id: "custom_panel_group_1",
      name: "监控区 1",
      entries: legacyEntries,
      position: legacyPosition,
      scale: legacyScale,
    },
  ];
}

function clampDecimal(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
