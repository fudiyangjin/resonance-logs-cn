import type { LayoutShapes, MapLine } from "../../scene-types";

export type S3SeaRingedReefArena = "matrix" | "boss" | "unknown";

export type ArenaPoint = {
  x: number;
  z: number;
};

type ArenaSpec = {
  id: Exclude<S3SeaRingedReefArena, "unknown">;
  center: ArenaPoint & { y: number };
  halfX: number;
  halfZ: number;
  rotationQuarters: number;
  shapes: LayoutShapes;
};

export type SceneLayout = {
  worldHalfX: number;
  worldHalfZ: number;
  rotationQuarters: number;
  shapes: LayoutShapes;
};

const MATRIX_RADIUS = 16;
const MATRIX_HALF = 24;
const BOSS_HALF_X = 55;
const BOSS_HALF_Z = 45;

const MATRIX_LINES = buildRadialLines(MATRIX_RADIUS, 8);
const BOSS_LINES = [
  { x1: -BOSS_HALF_X, z1: -BOSS_HALF_Z, x2: BOSS_HALF_X, z2: -BOSS_HALF_Z },
  { x1: BOSS_HALF_X, z1: -BOSS_HALF_Z, x2: BOSS_HALF_X, z2: BOSS_HALF_Z },
  { x1: BOSS_HALF_X, z1: BOSS_HALF_Z, x2: -BOSS_HALF_X, z2: BOSS_HALF_Z },
  { x1: -BOSS_HALF_X, z1: BOSS_HALF_Z, x2: -BOSS_HALF_X, z2: -BOSS_HALF_Z },
];

const ARENAS: Record<Exclude<S3SeaRingedReefArena, "unknown">, ArenaSpec> = {
  matrix: {
    id: "matrix",
    center: { x: -74, y: 75, z: 12 },
    halfX: MATRIX_HALF,
    halfZ: MATRIX_HALF,
    rotationQuarters: 2,
    shapes: {
      lines: MATRIX_LINES,
      circles: [MATRIX_RADIUS],
      squares: [],
    },
  },
  boss: {
    id: "boss",
    center: { x: -330, y: 27, z: 101 },
    halfX: BOSS_HALF_X,
    halfZ: BOSS_HALF_Z,
    rotationQuarters: 3,
    shapes: {
      lines: BOSS_LINES,
      circles: [],
      squares: [],
    },
  },
};

function buildRadialLines(radius: number, count: number): MapLine[] {
  const lines: MapLine[] = [];
  for (let i = 0; i < count; i++) {
    const rad = (Math.PI * 2 * i) / count;
    lines.push({
      x1: 0,
      z1: 0,
      x2: Math.cos(rad) * radius,
      z2: Math.sin(rad) * radius,
    });
  }
  return lines;
}

export function arenaByPlayerY(
  y: number | null | undefined,
): S3SeaRingedReefArena {
  if (y === null || y === undefined) return "unknown";
  return Math.abs(y - ARENAS.matrix.center.y) <=
    Math.abs(y - ARENAS.boss.center.y)
    ? "matrix"
    : "boss";
}

export function yInArena(y: number, arena: S3SeaRingedReefArena): boolean {
  switch (arena) {
    case "matrix":
      return (
        Math.abs(y - ARENAS.matrix.center.y) <=
        Math.abs(y - ARENAS.boss.center.y)
      );
    case "boss":
      return (
        Math.abs(y - ARENAS.boss.center.y) <
        Math.abs(y - ARENAS.matrix.center.y)
      );
    default:
      return true;
  }
}

export function arenaLayout(arena: S3SeaRingedReefArena): SceneLayout {
  const spec = arena === "unknown" ? ARENAS.boss : ARENAS[arena];
  return {
    worldHalfX: spec.halfX,
    worldHalfZ: spec.halfZ,
    rotationQuarters: arena === "unknown" ? 0 : spec.rotationQuarters,
    shapes: spec.shapes,
  };
}

export function arenaCenter(arena: S3SeaRingedReefArena): ArenaPoint {
  const spec = arena === "unknown" ? ARENAS.boss : ARENAS[arena];
  return spec.center;
}

export function toArenaLocal(
  x: number,
  z: number,
  arena: S3SeaRingedReefArena,
): ArenaPoint {
  const center = arenaCenter(arena);
  return {
    x: x - center.x,
    z: z - center.z,
  };
}

export function arenaBounds(arena: S3SeaRingedReefArena) {
  const layout = arenaLayout(arena);
  return {
    halfX: layout.worldHalfX,
    halfZ: layout.worldHalfZ,
  };
}
