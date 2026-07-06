import type {
  MinimapEntity,
  MinimapMarker,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";

export type MapLine = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
};

export type LayoutShapes = {
  lines: MapLine[];
  circles: number[];
  squares: number[];
};

export type MechanicRegion =
  | {
      kind: "ring";
      rInner: number;
      rOuter: number;
      colorSlot: number;
      label?: string;
    }
  | {
      kind: "rect";
      x: number;
      z: number;
      halfX: number;
      halfZ: number;
      colorSlot: number;
      label?: string;
    }
  | {
      kind: "sector";
      x: number;
      z: number;
      radius: number;
      startDeg: number;
      endDeg: number;
      colorSlot: number;
      label?: string;
    }
  | {
      kind: "polygon";
      points: { x: number; z: number }[];
      colorSlot: number;
      label?: string;
    }
  | {
      kind: "line";
      x1: number;
      z1: number;
      x2: number;
      z2: number;
      colorSlot: number;
      widthPx?: number;
      label?: string;
    };

export type MechanicRowTargetStatus = {
  name: string;
  isLocal: boolean;
  safe: boolean;
};

export type MechanicRow = {
  key: string;
  group: string;
  label: string;
  colorSlot: number;
  createTimeMs: number;
  durationMs: number;
  targets: string[];
  hideTimer?: boolean;
  targetStatus?: MechanicRowTargetStatus[];
};

export type SceneView = {
  worldHalfX: number;
  worldHalfZ: number;
  rotationQuarters: number;
  layout: LayoutShapes;
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
  entities: MinimapEntity[];
  /** Player markers, in the same local coordinate space as `entities`. */
  markers: MinimapMarker[];
  entitySafeStatus?: Map<string, boolean>;
};

export type SceneDefinition = {
  id: string;
  sceneIds: readonly number[];
  resolveView: (
    snapshot: MinimapSnapshot,
    displayName: (entity: MinimapEntity) => string,
    skillCasts?: MinimapSkillCast[],
  ) => SceneView;
  resolveSkillRows?: (args: {
    skillCasts: MinimapSkillCast[];
    displayName: (entity: MinimapEntity) => string;
  }) => MechanicRow[];
};

export function emptySceneView(
  entities: MinimapEntity[] = [],
  markers: MinimapMarker[] = [],
): SceneView {
  return {
    worldHalfX: 30,
    worldHalfZ: 27,
    rotationQuarters: 0,
    layout: { lines: [], circles: [], squares: [] },
    regions: [],
    rows: [],
    entityColorSlots: new Map(),
    entities,
    markers,
  };
}
