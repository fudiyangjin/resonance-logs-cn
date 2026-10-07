import type {
  DamageHitIndex,
  EncounterCurvePoint,
  EncounterTimelineEvent,
  TeammateCurveMode,
} from "./timeline-data";

/** Player metadata needed to build cast lanes and DPS curves. */
export type TimelinePlayerMeta = {
  entityUuid: string;
  /** Display name (already privacy-filtered by the parent). */
  name: string;
  className: string;
  classSpecName: string;
  isLocalPlayer: boolean;
};

/** Display strings/icon for one lane marker, resolved by the parent. */
export type TimelineEventDisplay = {
  name: string;
  /** null when the marker has no artwork (boss skills): rendered as a text pill. */
  iconPath: string | null;
  casterName: string;
};

/** Boss caster identity for labelling one lane per boss. */
export type TimelineBossMeta = {
  entityUuid: string;
  name: string;
};

export type LanePoint = {
  timeMs: number;
  event: EncounterTimelineEvent;
};

export type Lane =
  | { key: string; type: "boss"; name: string; points: LanePoint[] }
  | {
      key: string;
      type: "mine";
      player: TimelinePlayerMeta;
      points: LanePoint[];
    }
  | {
      key: string;
      type: "teammate";
      player: TimelinePlayerMeta;
      points: LanePoint[];
    };

/** A pointer's location while hovering the interactive plot surface, in the
 * chart body's coordinate space (the same space `TimelineRow.top` uses). */
export type TimelineHoverPoint = {
  timeMs: number;
  y: number;
};

/** One wall-clock presence interval of a watched buff, in fight offsets. */
export type TimelineBuffSpan = {
  startMs: number;
  endMs: number;
};

/** One (player, buff) coverage lane, kept separate from the marker `Lane`
 * union so the point-based marker pipeline stays untouched. */
export type TimelineBuffLane = {
  key: string;
  entityUuid: string;
  baseId: number;
  buffName: string;
  /** Full-fight coverage percent (active-window caliber), 0..100. */
  coveragePct: number;
  triggerCount: number;
  spans: TimelineBuffSpan[];
};

/** Buff coverage input for the timeline; `activeSpans` are the active-combat
 * intervals the coverage percent is measured against. */
export type TimelineBuffData = {
  lanes: TimelineBuffLane[];
  activeSpans: TimelineBuffSpan[];
};

/** How buff rows are grouped under their header rows. */
export type BuffGrouping = "player" | "buff";

/** One horizontal row of the chart body, top to bottom: cast lanes first,
 * then buff group headers and buff rows. Geometry is added by
 * `computeTimelineLayout`, so every consumer reads one positioned list. */
export type TimelineTrack =
  | { kind: "cast"; key: string; lane: Lane }
  | {
      kind: "buff-group";
      key: string;
      label: string;
      /** Owner of a player group; null for a buff group. */
      player: TimelinePlayerMeta | null;
    }
  | {
      kind: "buff";
      key: string;
      lane: TimelineBuffLane;
      player: TimelinePlayerMeta;
      /** Row caption: the buff name when grouped by player, the player name
       * when grouped by buff (the group header carries the other half). */
      caption: "buff" | "player";
    };

export type TimelineRow = TimelineTrack & { top: number; height: number };

/** One selected teammate's chosen DPS series, ready to draw / tooltip. */
export type TimelineTeammateCurve = {
  entityUuid: string;
  name: string;
  color: string;
  mode: TeammateCurveMode;
  /** Immutable raw-hit index used for exact hover reads. */
  hits: DamageHitIndex;
  /** Pixel-bounded samples for the current viewport. */
  curve: EncounterCurvePoint[];
};
