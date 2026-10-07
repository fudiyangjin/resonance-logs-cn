import type { ZoomTier } from "./timeline-data";

/**
 * Single source of truth for every pixel constant the timeline uses. Both the
 * DOM lane renderer and the ECharts curve grid import from here, so the two
 * coordinate systems can no longer silently drift apart (the historical bug
 * this module replaces: `GUTTER`/`LANE_H` used to be hand-copied between the
 * ECharts option builder and the HTML gutter styles).
 */

/** Left gutter reserved for lane name/icon labels (and, lower down, the
 * curve's native Y-axis value labels sharing the same column). Deliberately
 * tight: every pixel here is one the plot does not get, and the column only
 * has to fit a truncated lane name (the full one is a hover tooltip away) plus
 * an abbreviated axis value like "771.4w" (~44px at 10px type). */
export const GUTTER = 96;
/** Right padding so the last pixel column isn't flush against the border. */
export const RIGHT_PADDING = 16;

export const LANE_TOP = 10;
export const LANE_GAP = 14;

/** The panel's one and only size set - there used to be a compact/expanded
 * toggle, but the compact rows were too cramped to read overlapping skill
 * icons in, so the expanded sizes became the single form. `curveH` includes
 * the curve's own bottom time-axis tick labels (ECharts draws them inside its
 * grid's reserved bottom padding, so no extra layout slot is needed). */
const SIZES = {
  laneH: 44,
  curveH: 300,
  iconSize: 24,
};

export const DEFAULT_LANE_H = SIZES.laneH;
export const DEFAULT_CURVE_H = SIZES.curveH;
export const DEFAULT_ICON_SIZE = SIZES.iconSize;

export const MIN_LANE_H = 28;
export const MAX_LANE_H = 88;
export const MIN_CURVE_H = 120;
export const MAX_CURVE_H = 640;

/** Min horizontal gap (px) before a lane marker may show a labelled pill
 * instead of degrading to a tick or dot. Sized for a short abbreviated name. */
export const LABEL_MIN_GAP_PX = 50;
/** Min horizontal gap (px) before a lane marker shows a tick instead of a dot. */
export const TICK_MIN_GAP_PX = 12;
export const PILL_MAX_WIDTH_PX = 72;

export const MINIMAP_HEIGHT_PX = 32;

/** Buff group header row (player or buff name). */
export const BUFF_GROUP_H = 20;
/** Buff row: a caption line above a thin presence bar. */
export const BUFF_ROW_H = 32;
/** Caption line at the top of a buff row. */
export const BUFF_CAPTION_H = 16;
/** Vertical center of the presence bar within a buff row; the gutter's
 * percent sits on the same line. */
export const BUFF_BAR_CENTER_Y =
  BUFF_CAPTION_H + (BUFF_ROW_H - BUFF_CAPTION_H) / 2;
/** Breathing room between the last buff row and the curve grid. */
export const BUFF_BLOCK_GAP = 8;

/** Discrete lane row / icon growth per zoom tier (see `zoomTierFor` in
 * timeline-data.ts). Deliberately stepped rather than continuous: scaling on
 * every wheel tick would reflow the whole panel's height each frame. Only
 * `laneH`/`iconSize` scale — `curveH`/`GUTTER` stay fixed since the curve
 * itself already grows via the ECharts viewport, and the gutter only holds
 * fixed-size text/icons. */
const ZOOM_TIER_SCALE: readonly [number, number, number] = [1, 1.35, 1.7];

export type TimelineSizes = typeof SIZES;

export type TimelineSizeOverrides = {
  laneH?: number;
  curveH?: number;
};

export type TimelineTrackKind = "cast" | "buff-group" | "buff";

export type PositionedTrack<T> = T & { top: number; height: number };

export type ComputedTimelineLayout<T> = TimelineSizes & {
  gutter: number;
  laneTop: number;
  laneGap: number;
  castCount: number;
  /** Total height of the cast lane rows stacked together. */
  lanesHeight: number;
  /** Y offset (px) of the buff block; 0 height when there are no buff rows. */
  buffTop: number;
  buffHeight: number;
  /** Y offset (px) where the curve grid begins. */
  curveTop: number;
  /** Total height of the absolutely-positioned chart body (rows + curve). */
  totalHeight: number;
  /** Every track with body-space geometry, ascending by `top`. */
  rows: PositionedTrack<T>[];
};

export function zoomTierScale(zoomTier: ZoomTier): number {
  return ZOOM_TIER_SCALE[zoomTier] ?? 1;
}

export function clampLaneH(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LANE_H;
  return Math.min(MAX_LANE_H, Math.max(MIN_LANE_H, Math.round(value)));
}

export function clampCurveH(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CURVE_H;
  return Math.min(MAX_CURVE_H, Math.max(MIN_CURVE_H, Math.round(value)));
}

/** Convert a zoom-scaled displayed row height back to the persisted base. */
export function displayedLaneHToBase(
  displayedLaneH: number,
  zoomTier: ZoomTier,
): number {
  return clampLaneH(displayedLaneH / zoomTierScale(zoomTier));
}

/** Stacks the tracks top to bottom: cast lanes (zoom-scaled), the lane resize
 * gap, buff rows (fixed heights), then the curve. Tracks must arrive cast
 * lanes first; without buff rows the geometry matches a lanes-only chart. */
export function computeTimelineLayout<T extends { kind: TimelineTrackKind }>(
  tracks: readonly T[],
  zoomTier: ZoomTier = 0,
  sizes?: TimelineSizeOverrides,
): ComputedTimelineLayout<T> {
  const scale = zoomTierScale(zoomTier);
  const baseLaneH = clampLaneH(sizes?.laneH ?? SIZES.laneH);
  const curveH = clampCurveH(sizes?.curveH ?? SIZES.curveH);
  const laneH = Math.round(baseLaneH * scale);
  const iconSize = Math.round(SIZES.iconSize * (laneH / SIZES.laneH));

  const rows: PositionedTrack<T>[] = [];
  let castCount = 0;
  let y = LANE_TOP;
  for (const track of tracks) {
    if (track.kind !== "cast") break;
    rows.push({ ...track, top: y, height: laneH });
    y += laneH;
    castCount += 1;
  }
  const lanesHeight = castCount * laneH;
  const buffTop = y + LANE_GAP;
  y = buffTop;
  for (const track of tracks.slice(castCount)) {
    const height = track.kind === "buff-group" ? BUFF_GROUP_H : BUFF_ROW_H;
    rows.push({ ...track, top: y, height });
    y += height;
  }
  const buffHeight = y - buffTop;
  const curveTop = buffHeight > 0 ? y + BUFF_BLOCK_GAP : buffTop;
  return {
    ...SIZES,
    laneH,
    iconSize,
    curveH,
    gutter: GUTTER,
    laneTop: LANE_TOP,
    laneGap: LANE_GAP,
    castCount,
    lanesHeight,
    buffTop,
    buffHeight,
    curveTop,
    totalHeight: curveTop + curveH,
    rows,
  };
}

/** The row under body-space `y` (top inclusive, bottom exclusive), by binary
 * search over `rows` ascending by `top`; null in gaps and outside. */
export function trackAt<T extends { top: number; height: number }>(
  rows: readonly T[],
  y: number,
): T | null {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const row = rows[mid]!;
    if (row.top + row.height <= y) lo = mid + 1;
    else hi = mid;
  }
  const row = rows[lo];
  return row && row.top <= y ? row : null;
}
