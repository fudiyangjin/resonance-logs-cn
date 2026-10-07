import type {
  MonsterOverlayPositions,
  MonsterOverlaySizes,
} from "$lib/settings-store";

export const DEFAULT_MONSTER_OVERLAY_POSITIONS: MonsterOverlayPositions = {
  monsterBuffPanel: { x: 40, y: 40 },
  teammateBuffPanel: { x: 420, y: 40 },
  teammateCdPanel: { x: 420, y: 180 },
  teammateCdSlotsFive: { x: 240, y: 320 },
  teammateCdSlotsTwenty: { x: 240, y: 160 },
  hatePanel: { x: 40, y: 300 },
  fantasyPanel: { x: 420, y: 300 },
  bossDbmPanel: { x: 800, y: 40 },
  stunPanel: { x: 40, y: 460 },
  hpPanel: { x: 40, y: 560 },
  entityDurationPanel: { x: 800, y: 300 },
};

export const DEFAULT_MONSTER_OVERLAY_SIZES: MonsterOverlaySizes = {
  monsterBuffPanelScale: 1,
  teammateBuffPanelScale: 1,
  teammateCdPanelScale: 1,
  hatePanelScale: 1,
  fantasyPanelScale: 1,
  bossDbmPanelScale: 1,
  stunPanelScale: 1,
  hpPanelScale: 1,
  entityDurationPanelScale: 1,
};

export const DEFAULT_MONSTER_OVERLAY_VISIBILITY = {
  showMonsterBuffPanel: true,
  showTeammateBuffPanel: true,
  showTeammateCdPanel: false,
  showHatePanel: false,
  showFantasyPanel: false,
  showBossDbmPanel: false,
  showStunPanel: false,
  showHpPanel: false,
  showEntityDurationPanel: false,
};

export const MIN_MONSTER_PANEL_SCALE = 0.5;
export const MAX_MONSTER_PANEL_SCALE = 2.5;
