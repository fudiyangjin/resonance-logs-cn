import type { OverlayPositions, OverlayVisibility } from "$lib/settings-store";
export { DEFAULT_OVERLAY_SIZES } from "$lib/skill-monitor-normalize";

export const RESOURCE_SCALES_BY_CLASS: Record<string, Record<number, number>> = {
  wind_knight: {
    14011: 100,
    14017: 100,
  },
  frost_mage: {
    12001: 100,
    12007: 100,
  },
  stormblade: {},
};

export const DEFAULT_RESOURCE_VALUES_BY_CLASS: Record<
  string,
  Record<number, number>
> = {
  wind_knight: { 14011: 130, 14017: 130, 14001: 6, 14007: 6 },
  frost_mage: { 12001: 0, 12007: 125, 12021: 0, 12027: 4 },
  stormblade: { 12051: 0, 12057: 400, 12041: 0, 12047: 6 },
};

export const DEFAULT_OVERLAY_POSITIONS: OverlayPositions = {
  skillCdGroup: { x: 40, y: 40 },
  resourceGroup: { x: 40, y: 170 },
  textBuffPanel: { x: 360, y: 40 },
  specialBuffGroup: { x: 360, y: 220 },
  panelAttrGroup: { x: 700, y: 40 },
  customPanelGroup: { x: 700, y: 280 },
  shieldDetailGroup: { x: 40, y: 550 },
  iconBuffPositions: {},
  skillDurationPositions: {},
  categoryIconPositions: {},
};

export const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibility = {
  showSkillCdGroup: true,
  showSkillDurationGroup: true,
  showResourceGroup: true,
  showPanelAttrGroup: true,
  showCustomPanelGroup: true,
  showShieldDetailGroup: true,
};
