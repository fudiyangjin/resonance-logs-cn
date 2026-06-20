import type {
  MinimapEntity,
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
};

export type SceneDefinition = {
  id: string;
  sceneIds: readonly number[];
  resolveView: (
    snapshot: MinimapSnapshot,
    displayName: (entity: MinimapEntity) => string,
  ) => SceneView;
  resolveSkillRows?: (args: {
    skillCasts: MinimapSkillCast[];
    displayName: (entity: MinimapEntity) => string;
  }) => MechanicRow[];
};

export function emptySceneView(entities: MinimapEntity[] = []): SceneView {
  return {
    worldHalfX: 30,
    worldHalfZ: 27,
    rotationQuarters: 0,
    layout: { lines: [], circles: [], squares: [] },
    regions: [],
    rows: [],
    entityColorSlots: new Map(),
    entities,
  };
}
