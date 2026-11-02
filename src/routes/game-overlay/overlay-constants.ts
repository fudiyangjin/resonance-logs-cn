import type { OverlayPositions, OverlayVisibility } from "$lib/settings-store";
export { DEFAULT_OVERLAY_SIZES } from "$lib/skill-monitor-normalize";

export const DEFAULT_OVERLAY_POSITIONS: OverlayPositions = {
  skillCdGroup: { x: 40, y: 40 },
  resourceGroup: { x: 40, y: 170 },
  textBuffPanel: { x: 360, y: 40 },
  specialBuffGroup: { x: 360, y: 220 },
  panelAttrGroup: { x: 700, y: 40 },
  customPanelGroup: { x: 700, y: 280 },
  shieldDetailGroup: { x: 40, y: 550 },
  buffCoverageGroup: { x: 360, y: 550 },
  iconBuffPositions: {},
  categoryIconPositions: {},
};

export const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibility = {
  showSkillCdGroup: false,
  showResourceGroup: false,
  showPanelAttrGroup: true,
  showCustomPanelGroup: true,
  showShieldDetailGroup: false,
  showBuffCoverageGroup: false,
};
