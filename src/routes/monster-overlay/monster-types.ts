import type { TextBuffDisplay } from "../game-overlay/overlay-types";
import type { EntityId } from "$lib/entity-id";

export type MonsterBossBuffSection = {
  bossEntityUuid: EntityId;
  title: string;
  rows: TextBuffDisplay[];
  isPlaceholder?: boolean;
  kind?: "monster" | "teammate";
};

export type MonsterHateSection = {
  bossEntityUuid: EntityId;
  title: string;
  rows: TextBuffDisplay[];
  isPlaceholder?: boolean;
};

export type MonsterDragTarget =
  | { kind: "buffPanel" }
  | { kind: "hatePanel" };

export type MonsterResizeTarget =
  | { kind: "buffPanel" }
  | { kind: "hatePanel" };

export type MonsterDragState = {
  target: MonsterDragTarget;
  startX: number;
  startY: number;
  startPos: { x: number; y: number };
};

export type MonsterResizeState = {
  target: MonsterResizeTarget;
  startX: number;
  startY: number;
  startValue: number;
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
