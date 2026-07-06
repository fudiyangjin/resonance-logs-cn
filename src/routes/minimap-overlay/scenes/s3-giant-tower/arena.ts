import type { LayoutShapes, MapLine } from "../../scene-types";

export type ArenaPoint = {
  x: number;
  z: number;
};

export type SceneLayout = {
  worldHalfX: number;
  worldHalfZ: number;
  rotationQuarters: number;
  shapes: LayoutShapes;
};

const ARENA_CENTER = { x: -187.5, y: 89, z: -385 };
const WORLD_HALF_X = 28;
const WORLD_HALF_Z = 28;
const BOSS_AREA_MARGIN = 4;
const Y_HALF_RANGE = 22;
const PORTAL_RADIUS = 20;

const ARENA_LINES: MapLine[] = [
  { x1: -WORLD_HALF_X, z1: -WORLD_HALF_Z, x2: WORLD_HALF_X, z2: -WORLD_HALF_Z },
  { x1: WORLD_HALF_X, z1: -WORLD_HALF_Z, x2: WORLD_HALF_X, z2: WORLD_HALF_Z },
  { x1: WORLD_HALF_X, z1: WORLD_HALF_Z, x2: -WORLD_HALF_X, z2: WORLD_HALF_Z },
  { x1: -WORLD_HALF_X, z1: WORLD_HALF_Z, x2: -WORLD_HALF_X, z2: -WORLD_HALF_Z },
];

export function arenaLayout(): SceneLayout {
  return {
    worldHalfX: WORLD_HALF_X,
    worldHalfZ: WORLD_HALF_Z,
    rotationQuarters: 1,
    shapes: {
      lines: ARENA_LINES,
      circles: [PORTAL_RADIUS],
      squares: [],
    },
  };
}

export function toArenaLocal(x: number, z: number): ArenaPoint {
  return {
    x: x - ARENA_CENTER.x,
    z: z - ARENA_CENTER.z,
  };
}

export function yInArena(y: number): boolean {
  return Math.abs(y - ARENA_CENTER.y) <= Y_HALF_RANGE;
}

export function inBossArea(x: number, z: number): boolean {
  const local = toArenaLocal(x, z);
  return (
    Math.abs(local.x) <= WORLD_HALF_X + BOSS_AREA_MARGIN &&
    Math.abs(local.z) <= WORLD_HALF_Z + BOSS_AREA_MARGIN
  );
}
