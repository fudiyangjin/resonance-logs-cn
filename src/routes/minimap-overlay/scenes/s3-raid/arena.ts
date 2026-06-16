import type { LayoutShapes, MapLine } from "../../scene-types";

export type S3RaidArena = "ring" | "grid" | "unknown";

export type FloorCell =
  | "topLeft"
  | "topMid"
  | "topRight"
  | "midLeft"
  | "center"
  | "midRight"
  | "bottomLeft"
  | "bottomMid"
  | "bottomRight";

export type FloorCellInfo = {
  id: FloorCell;
  x: number;
  z: number;
};

export type SceneLayout = {
  worldHalfX: number;
  worldHalfZ: number;
  shapes: LayoutShapes;
};

const FLOOR_X_EDGES = [-30, -10, 10, 30];
const FLOOR_Z_EDGES = [-22.5, -7.5, 7.5, 22.5];
const FLOOR_X_MIN = -30;
const FLOOR_X_MAX = 30;
const FLOOR_Z_MIN = -22.5;
const FLOOR_Z_MAX = 22.5;

export const FLOOR_CELL_HALF_X = 10;
export const FLOOR_CELL_HALF_Z = 7.5;
export const FLOOR_CELLS: Record<FloorCell, FloorCellInfo> = {
  topLeft: { id: "topLeft", x: -20, z: 15 },
  topMid: { id: "topMid", x: 0, z: 15 },
  topRight: { id: "topRight", x: 20, z: 15 },
  midLeft: { id: "midLeft", x: -20, z: 0 },
  center: { id: "center", x: 0, z: 0 },
  midRight: { id: "midRight", x: 20, z: 0 },
  bottomLeft: { id: "bottomLeft", x: -20, z: -15 },
  bottomMid: { id: "bottomMid", x: 0, z: -15 },
  bottomRight: { id: "bottomRight", x: 20, z: -15 },
};

export const FLOOR_CORNER_CELLS: FloorCell[] = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
];

export const FLOOR_EDGE_MID_CELLS: FloorCell[] = [
  "topMid",
  "bottomMid",
  "midLeft",
  "midRight",
];

export const RING_BANDS = {
  inner: [0, 12.5],
  mid: [12.5, 17.5],
  outer: [18.5, 30],
} as const;

const RING_CIRCLES = [11.5, 12.5, 17.5, 18.5, 30];
const RING_SQUARES = [30, 50];
const RING_ARENA_Y = 150;
const GRID_ARENA_Y = 400;
const RING_ARENA_LINES: MapLine[] = buildRingArenaLines();

function buildRingArenaLines(): MapLine[] {
  const sectors: [number, number][][] = [
    [
      [-21, 21.21],
      [0, 0],
      [21, 21.21],
      [0, 42.21],
    ],
    [
      [21, 21.21],
      [0, 0],
      [21, -21.21],
      [42.21, 0],
    ],
    [
      [21, -21.21],
      [0, 0],
      [-21, -21.21],
      [0, -42.21],
    ],
    [
      [-21, -21.21],
      [0, 0],
      [-21, 21.21],
      [-42.21, 0],
    ],
  ];
  return sectors.flatMap(polyToLines);
}

function polyToLines(points: [number, number][]): MapLine[] {
  const lines: MapLine[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    lines.push({ x1: a[0], z1: a[1], x2: b[0], z2: b[1] });
  }
  return lines;
}

function floorGridLines(): MapLine[] {
  const lines: MapLine[] = [];
  for (const x of FLOOR_X_EDGES) {
    lines.push({ x1: x, z1: FLOOR_Z_MIN, x2: x, z2: FLOOR_Z_MAX });
  }
  for (const z of FLOOR_Z_EDGES) {
    lines.push({ x1: FLOOR_X_MIN, z1: z, x2: FLOOR_X_MAX, z2: z });
  }
  return lines;
}

export function nearestFloorCell(x: number, z: number): FloorCell | null {
  let best: FloorCellInfo | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cell of Object.values(FLOOR_CELLS)) {
    const dx = x - cell.x;
    const dz = z - cell.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      best = cell;
      bestDist = dist;
    }
  }
  return best?.id ?? null;
}

export function cellRect(cell: FloorCell) {
  const info = FLOOR_CELLS[cell];
  return {
    x: info.x,
    z: info.z,
    halfX: FLOOR_CELL_HALF_X,
    halfZ: FLOOR_CELL_HALF_Z,
  };
}

export function arenaByPlayerY(y: number | null | undefined): S3RaidArena {
  if (y === null || y === undefined) return "unknown";
  return Math.abs(y - RING_ARENA_Y) <= Math.abs(y - GRID_ARENA_Y)
    ? "ring"
    : "grid";
}

export function yInArena(y: number, arena: S3RaidArena): boolean {
  switch (arena) {
    case "ring":
      return Math.abs(y - RING_ARENA_Y) <= Math.abs(y - GRID_ARENA_Y);
    case "grid":
      return Math.abs(y - GRID_ARENA_Y) < Math.abs(y - RING_ARENA_Y);
    default:
      return true;
  }
}

export function arenaLayout(arena: S3RaidArena): SceneLayout {
  switch (arena) {
    case "grid":
      return {
        worldHalfX: 30,
        worldHalfZ: 27,
        shapes: {
          lines: floorGridLines(),
          circles: [],
          squares: [],
        },
      };
    case "ring":
      return {
        worldHalfX: 55,
        worldHalfZ: 55,
        shapes: {
          lines: RING_ARENA_LINES,
          circles: RING_CIRCLES,
          squares: RING_SQUARES,
        },
      };
    default:
      return {
        worldHalfX: 30,
        worldHalfZ: 27,
        shapes: { lines: [], circles: [], squares: [] },
      };
  }
}
