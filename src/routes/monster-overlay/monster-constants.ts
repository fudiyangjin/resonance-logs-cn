import type {
  MonsterOverlayPositions,
  MonsterOverlaySizes,
} from "$lib/settings-store";

export const DEFAULT_MONSTER_OVERLAY_POSITIONS: MonsterOverlayPositions = {
  monsterBuffPanel: { x: 40, y: 40 },
  teammateBuffPanel: { x: 420, y: 40 },
  hatePanel: { x: 40, y: 300 },
  fantasyPanel: { x: 420, y: 300 },
  bossDbmPanel: { x: 800, y: 40 },
  stunPanel: { x: 40, y: 460 },
};

export const DEFAULT_MONSTER_OVERLAY_SIZES: MonsterOverlaySizes = {
  monsterBuffPanelScale: 1,
  teammateBuffPanelScale: 1,
  hatePanelScale: 1,
  fantasyPanelScale: 1,
  bossDbmPanelScale: 1,
  stunPanelScale: 1,
};

export const DEFAULT_MONSTER_OVERLAY_VISIBILITY = {
  showMonsterBuffPanel: true,
  showTeammateBuffPanel: true,
  showHatePanel: true,
  showFantasyPanel: false,
  showBossDbmPanel: false,
  showStunPanel: false,
};

export const MIN_MONSTER_PANEL_SCALE = 0.5;
export const MAX_MONSTER_PANEL_SCALE = 2.5;
