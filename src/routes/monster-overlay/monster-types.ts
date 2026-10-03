import type { BuffCategoryKey } from "$lib/config/buff-name-table";
import type {
  BuffAlertState,
  SkillDisplay,
  TextBuffDisplay,
} from "../game-overlay/overlay-types";
import type { EntityId } from "$lib/entity-id";
import type { HudTemporalValue } from "$lib/hud-temporal.svelte.js";
import type { TeammateCdSlotKind } from "$lib/settings-store";

export type MonsterBossBuffSection = {
  bossEntityUuid: EntityId;
  title: string;
  rows: TextBuffDisplay[];
  isPlaceholder?: boolean;
  kind?: "monster";
};

export type MonsterHateSection = {
  bossEntityUuid: EntityId;
  title: string;
  rows: TextBuffDisplay[];
  isPlaceholder?: boolean;
};

export type MonsterStunSection = {
  bossEntityUuid: EntityId;
  title: string;
  rows: TextBuffDisplay[];
  isPlaceholder?: boolean;
};

export type MonsterHpSection = MonsterStunSection;

export type MonsterTeammateBuffCell = {
  key: string;
  buffId: number;
  buffName: string;
  valueText: string;
  metaText?: string | undefined;
  progressPercent: number;
  hasBuff: boolean;
  alert?: BuffAlertState | undefined;
  temporal?: HudTemporalValue | undefined;
  categoryKey?: BuffCategoryKey | undefined;
  matchedBuffId?: number | undefined;
};

export type MonsterTeammateBuffColumn = {
  key: string;
  buffIds: number[];
  label: string;
  categoryKey?: BuffCategoryKey | undefined;
};

export type MonsterTeammateBuffRow = {
  teammateEntityUuid: EntityId;
  teammateName: string;
  cells: MonsterTeammateBuffCell[];
  /** Dead rows stay even without buffs, drawn in the dead name color. */
  isDead: boolean;
  isPlaceholder?: boolean;
};

export type MonsterTeammateBuffDisplay = {
  columns: MonsterTeammateBuffColumn[];
  rows: MonsterTeammateBuffRow[];
};

export type MonsterFantasyRow = {
  key: string;
  summonUuid: EntityId;
  summonerName: string;
  fantasyName: string;
  levelText: string;
  isPlaceholder?: boolean;
};

export type MonsterTeammateCdCell = {
  skillId: number;
  name: string;
  imagePath?: string | undefined;
  display: SkillDisplay | null;
};

export type MonsterTeammateCdRow = {
  teammateEntityUuid: EntityId;
  teammateName: string;
  classId: number;
  classIconPath?: string | undefined;
  isDead: boolean;
  /** The relay link is down; the row shows the last known state. */
  isStale: boolean;
  cells: MonsterTeammateCdCell[];
  isPlaceholder?: boolean;
};

/** One teammate's icons beside their row of the in-game team panel. */
export type MonsterTeammateCdSlot = {
  teammateEntityUuid: EntityId;
  /** 1..=4 (always 1 for a five-member team). */
  group: number;
  /** 1..=5 within the group. */
  row: number;
  isDead: boolean;
  /** The relay link is down; the icons show the last known state. */
  isStale: boolean;
  cells: MonsterTeammateCdCell[];
};

export type MonsterDragTarget =
  | { kind: "buffPanel" }
  | { kind: "teammatePanel" }
  | { kind: "teammateCdPanel" }
  | { kind: "teammateCdSlots"; grid: TeammateCdSlotKind }
  | { kind: "hatePanel" }
  | { kind: "stunPanel" }
  | { kind: "hpPanel" }
  | { kind: "fantasyPanel" }
  | { kind: "dbmPanel" }
  | { kind: "entityDurationPanel" };

export type MonsterResizeTarget =
  | { kind: "buffPanel" }
  | { kind: "teammatePanel" }
  | { kind: "teammateCdPanel" }
  | { kind: "hatePanel" }
  | { kind: "stunPanel" }
  | { kind: "hpPanel" }
  | { kind: "fantasyPanel" }
  | { kind: "dbmPanel" }
  | { kind: "entityDurationPanel" };

export type MonsterDragState = {
  target: MonsterDragTarget;
  startX: number;
  startY: number;
  startPos: { x: number; y: number };
  nextPos: { x: number; y: number };
  element: HTMLElement | null;
};

export type MonsterResizeState = {
  target: MonsterResizeTarget;
  startX: number;
  startY: number;
  startValue: number;
  nextValue: number;
  element: HTMLElement | null;
};

export type GhostArea = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};
