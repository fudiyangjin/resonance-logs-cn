import type { LayoutShapes, MapLine } from "../../scene-types";

export type ArenaPoint = { x: number; z: number };

export type SceneLayout = {
  worldHalfX: number;
  worldHalfZ: number;
  rotationQuarters: number;
  shapes: LayoutShapes;
};

export const ARENA_Y = 350.01;
export const WORLD_HALF_X = 30;
export const WORLD_HALF_Z = 27;
export const Y_TOLERANCE = 18;

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
    rotationQuarters: 0,
    shapes: { lines: ARENA_LINES, circles: [], squares: [] },
  };
}

/** The encounter's world coordinates are already centred around (0, 0). */
export function toArenaLocal(x: number, z: number): ArenaPoint {
  return { x, z };
}

export function yInArena(y: number): boolean {
  return Math.abs(y - ARENA_Y) <= Y_TOLERANCE;
}

export function inBossArea(x: number, z: number): boolean {
  return Math.abs(x) <= WORLD_HALF_X + 4 && Math.abs(z) <= WORLD_HALF_Z + 4;
}
