import type { OverlayPositions, OverlayVisibility } from "$lib/settings-store";
export { DEFAULT_OVERLAY_SIZES } from "$lib/skill-monitor-normalize";

export const RESOURCE_SCALES_BY_CLASS: Record<string, Record<number, number>> = {
  wind_knight: {
    [-4]: 100,
    [-3]: 100,
  },
  frost_mage: {
    [-4]: 100,
    [-3]: 100,
  },
  stormblade: {},
};

export const DEFAULT_RESOURCE_VALUES_BY_CLASS: Record<
  string,
  Record<number, number>
> = {
  wind_knight: { [-4]: 130, [-3]: 130, [-2]: 6, [-1]: 6 },
  frost_mage: { [-4]: 0, [-3]: 125, [-2]: 0, [-1]: 4 },
  stormblade: { [-4]: 0, [-3]: 400, [-2]: 0, [-1]: 6 },
};

export const DEFAULT_OVERLAY_POSITIONS: OverlayPositions = {
  skillCdGroup: { x: 40, y: 40 },
  resourceGroup: { x: 40, y: 170 },
  textBuffPanel: { x: 360, y: 40 },
  specialBuffGroup: { x: 360, y: 220 },
  panelAttrGroup: { x: 700, y: 40 },
  customPanelGroup: { x: 700, y: 280 },
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
};
