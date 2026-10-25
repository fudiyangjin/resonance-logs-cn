import type { MinimapEntity } from "$lib/api";
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
/** Wide enough for the outer turntable glyphs at 27.7 m plus their icon. */
export const WORLD_HALF_Z = 30;
/** 老三's light and dark balls spawn at 35 m, past the turntable bounds. */
export const NIGHT_WORLD_HALF = 37;
export const Y_TOLERANCE = 18;

/** 老三: the balls, the boss and its executor. */
const NIGHT_MONSTER_IDS = new Set([103602, 103603, 103610, 103611]);

function arenaLines(halfX: number, halfZ: number): MapLine[] {
  return [
    { x1: -halfX, z1: -halfZ, x2: halfX, z2: -halfZ },
    { x1: halfX, z1: -halfZ, x2: halfX, z2: halfZ },
    { x1: halfX, z1: halfZ, x2: -halfX, z2: halfZ },
    { x1: -halfX, z1: halfZ, x2: -halfX, z2: -halfZ },
  ];
}

export function arenaLayout(
  entities: readonly MinimapEntity[] = [],
): SceneLayout {
  const night = entities.some(
    (entity) =>
      entity.monsterId != null && NIGHT_MONSTER_IDS.has(entity.monsterId),
  );
  const halfX = night ? NIGHT_WORLD_HALF : WORLD_HALF_X;
  const halfZ = night ? NIGHT_WORLD_HALF : WORLD_HALF_Z;
  return {
    worldHalfX: halfX,
    worldHalfZ: halfZ,
    rotationQuarters: 0,
    shapes: { lines: arenaLines(halfX, halfZ), circles: [], squares: [] },
  };
}

/** The encounter's world coordinates are already centred around (0, 0). */
export function toArenaLocal(x: number, z: number): ArenaPoint {
  return { x, z };
}

export function yInArena(y: number): boolean {
  return Math.abs(y - ARENA_Y) <= Y_TOLERANCE;
}

export function inBossArea(
  x: number,
  z: number,
  layout: Pick<SceneLayout, "worldHalfX" | "worldHalfZ">,
): boolean {
  return (
    Math.abs(x) <= layout.worldHalfX + 4 && Math.abs(z) <= layout.worldHalfZ + 4
  );
}
