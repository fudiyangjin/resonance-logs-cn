import type {
  MinimapEntity,
  MinimapMarker,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import type { MessageKey } from "$lib/i18n/index.svelte";

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

/**
 * A voice-bindable mechanic cue a scene can fire, as listed on the minimap
 * settings page for the user to bind a phrase to.
 */
export type MinimapVoiceCueDef = {
  /** Unique across all scenes, e.g. "s3-raid.electromagneticRing". */
  id: string;
  labelKey: MessageKey;
  /** Default spoken text offered when the binding source is "auto". */
  autoText: string;
};

/** One occurrence of a registered voice cue, produced by `resolveVoiceCues`. */
export type MinimapVoiceCueFire = {
  cueId: string;
  /**
   * Distinguishes concurrent/rapid occurrences of the same cue so the
   * player's `fireOnce` dedup doesn't collapse two genuinely separate
   * instances (e.g. a per-cast key combining skill id and cast time).
   */
  instanceKey: string;
};

export type SceneDefinition = {
  id: string;
  /** Content season used to group scene settings, e.g. 3 for S3. */
  season: number;
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
  /** Every voice cue this scene can fire, for the settings page to enumerate. */
  voiceCues?: MinimapVoiceCueDef[];
  /**
   * Called on every `minimap-update` tick with that tick's fresh skill-cast
   * delta (not the accumulated log `resolveView` receives), so each
   * qualifying mechanic occurrence appears here exactly once. Kept separate
   * from `resolveView` so cue-firing side effects never leak into the pure
   * render-view computation.
   */
  resolveVoiceCues?: (
    snapshot: MinimapSnapshot,
    skillCasts: MinimapSkillCast[],
  ) => MinimapVoiceCueFire[];
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
