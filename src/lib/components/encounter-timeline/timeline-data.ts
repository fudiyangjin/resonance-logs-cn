import type { HistoryCastKind } from "$lib/bindings";

/** Per-entity damage hit stream: columnar (time, amount) pairs ascending by
 * time. The raw fact every DPS curve derives from. */
export type EntityDamageHits = {
  entityUuid: string;
  timesMs: number[];
  amounts: number[];
};

/** Immutable query index over one entity's hit stream. Prefix sums keep
 * arbitrary-time DPS reads independent of the total hit count. */
export type DamageHitIndex = EntityDamageHits & {
  prefixAmounts: Float64Array;
};

export type EncounterChart = {
  durationMs: number;
  damageHits: EntityDamageHits[];
};

export type EncounterTimelineEvent = {
  /** Journal sequence; the only stable identity for keyed each-blocks. */
  sequence: number;
  tsOffsetMs: number;
  casterUuid: string;
  skillId: number;
  kind: HistoryCastKind;
  /** Fantasy remodel tier when recorded. Absent on older encounters. */
  remodelLevel: number | null;
};

function positiveInteger(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.max(1, Math.round(numeric))
    : 1;
}

export type EncounterCurvePoint = [offsetMs: number, valuePerSecond: number];

export type EncounterDamageHitStreams = {
  durationMs: number;
  /** Per-entity immutable query indexes keyed by entity uuid. */
  perEntityHits: Map<string, DamageHitIndex>;
};

/** Indexes the chart DTO's hit streams once, dropping empty streams. */
export function foldEncounterDamageHits(
  chart: EncounterChart,
): EncounterDamageHitStreams {
  const durationMs = positiveInteger(chart.durationMs);
  const perEntityHits = new Map<string, DamageHitIndex>();
  for (const hits of chart.damageHits) {
    const count = Math.min(hits.timesMs.length, hits.amounts.length);
    if (count === 0) continue;
    const timesMs =
      count === hits.timesMs.length
        ? hits.timesMs
        : hits.timesMs.slice(0, count);
    const amounts =
      count === hits.amounts.length
        ? hits.amounts
        : hits.amounts.slice(0, count);
    const prefixAmounts = new Float64Array(count + 1);
    for (let index = 0; index < count; index += 1) {
      prefixAmounts[index + 1] =
        prefixAmounts[index]! + (Number(amounts[index]) || 0);
    }
    perEntityHits.set(hits.entityUuid, {
      entityUuid: hits.entityUuid,
      timesMs,
      amounts,
      prefixAmounts,
    });
  }
  return { durationMs, perEntityHits };
}

/** User-configurable instant-DPS trailing-window bounds, in whole seconds. */
export const DEFAULT_INSTANT_DPS_WINDOW_SEC = 10;
export const MIN_INSTANT_DPS_WINDOW_SEC = 1;
export const MAX_INSTANT_DPS_WINDOW_SEC = 30;
/** The segment usually starts on its first hit (offset 0). Treating that hit
 * as one millisecond of elapsed time creates a meaningless million-DPS spike;
 * this matches the app's existing first-hit active-time grace. */
const DPS_STARTUP_GRACE_MS = 500;
/** Hard ceiling for 4K/ultrawide layouts. The main path still targets one
 * interval per CSS pixel, but can never hand an unbounded array to ECharts. */
const MAX_CURVE_SAMPLE_INTERVALS = 4_096;

export function clampInstantDpsWindowSec(value: unknown): number {
  const seconds = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(seconds)) return DEFAULT_INSTANT_DPS_WINDOW_SEC;
  return Math.min(
    MAX_INSTANT_DPS_WINDOW_SEC,
    Math.max(MIN_INSTANT_DPS_WINDOW_SEC, Math.round(seconds)),
  );
}

function upperBound(values: readonly number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function amountThrough(hits: DamageHitIndex, atMs: number): number {
  return hits.prefixAmounts[upperBound(hits.timesMs, atMs)] ?? 0;
}

export type TeammateCurveMode = "average" | "instant";

/** Evaluates the selected DPS definition from raw hits at one exact instant.
 * Instant DPS uses the half-open trailing window (t - windowMs, t]. */
export function dpsValueAt(
  hits: DamageHitIndex,
  mode: TeammateCurveMode,
  atMs: number,
  windowMs: number,
): number {
  const timeMs = Number.isFinite(atMs) ? Math.max(0, atMs) : 0;
  const total = amountThrough(hits, timeMs);
  if (total <= 0) return 0;
  const elapsedMs = Math.max(timeMs, DPS_STARTUP_GRACE_MS);
  if (mode === "average") return (total * 1_000) / elapsedMs;
  const expired = amountThrough(hits, timeMs - windowMs);
  const effectiveWindowMs = Math.min(elapsedMs, windowMs);
  return ((total - expired) * 1_000) / effectiveWindowMs;
}

/** Samples exact DPS reads at CSS-pixel boundaries. The renderer uses
 * step-end interpolation, so a future hit can never leak into earlier time. */
export function sampleDpsCurve(
  hits: DamageHitIndex | null | undefined,
  mode: TeammateCurveMode,
  startMs: number,
  endMs: number,
  targetIntervals: number,
  windowMs: number,
): EncounterCurvePoint[] {
  if (!hits) return [];
  const start = Number.isFinite(startMs) ? Math.max(0, startMs) : 0;
  const end = Number.isFinite(endMs) ? Math.max(start, endMs) : start;
  const minimumWindowIntervals =
    mode === "instant" ? Math.ceil((end - start) / windowMs) : 1;
  const intervals = Math.min(
    MAX_CURVE_SAMPLE_INTERVALS,
    Math.max(
      1,
      minimumWindowIntervals,
      Math.ceil(Number(targetIntervals) || 1),
    ),
  );
  if (end === start) return [[start, dpsValueAt(hits, mode, start, windowMs)]];

  const span = end - start;
  return Array.from({ length: intervals + 1 }, (_, index) => {
    const atMs = index === intervals ? end : start + (span * index) / intervals;
    return [atMs, dpsValueAt(hits, mode, atMs, windowMs)];
  });
}

export function curveMaxValue(
  curve: EncounterCurvePoint[] | null | undefined,
): number {
  if (!curve) return 0;
  let max = 0;
  for (const [, value] of curve) max = Math.max(max, value);
  return max;
}

export type TeammateDpsSource = {
  entityUuid: string;
  mode: TeammateCurveMode;
  hits: DamageHitIndex;
};

/** Resolves selected teammate modes to immutable indexed hit sources. */
export function teammateDpsSources(
  modes: ReadonlyMap<string, TeammateCurveMode>,
  perEntityHits: ReadonlyMap<string, DamageHitIndex>,
): TeammateDpsSource[] {
  const result: TeammateDpsSource[] = [];
  for (const [entityUuid, mode] of modes) {
    const hits = perEntityHits.get(entityUuid);
    if (!hits || !hits.amounts.some((amount) => amount > 0)) continue;
    result.push({ entityUuid, mode, hits });
  }
  return result;
}

/** Converts a continuous brush extent into a valid half-open millisecond range. */
export function normalizeEncounterBrushRange(
  coordRange: readonly [number, number],
  durationMs: number,
): [number, number] | null {
  if (!Number.isFinite(coordRange[0]) || !Number.isFinite(coordRange[1])) {
    return null;
  }

  const normalizedDurationMs = positiveInteger(durationMs);
  const low = Math.min(coordRange[0], coordRange[1]);
  const high = Math.max(coordRange[0], coordRange[1]);
  const startMs = Math.min(
    normalizedDurationMs - 1,
    Math.max(0, Math.floor(low)),
  );
  const endMs = Math.min(
    normalizedDurationMs,
    Math.max(startMs + 1, Math.ceil(high)),
  );
  return endMs > startMs ? [startMs, endMs] : null;
}

// ---------------------------------------------------------------------------
// Viewport (zoom/pan window) math. Pure functions so the interaction layer
// (timeline-viewport.svelte.ts) and gestures (timeline-gestures.ts) stay thin
// wrappers that are easy to unit test independent of the DOM/ECharts.
// ---------------------------------------------------------------------------

export type TimelineWindow = { startMs: number; endMs: number };

/** Minimum visible span (ms): prevents zooming into a degenerate/empty window. */
export const MIN_VIEWPORT_SPAN_MS = 1_000;

/** Clamps an arbitrary [start, end) pair into a valid window inside [0, durationMs]. */
export function clampViewportWindow(
  startMs: number,
  endMs: number,
  durationMs: number,
  minSpanMs: number = MIN_VIEWPORT_SPAN_MS,
): TimelineWindow {
  const duration = Math.max(1, positiveInteger(durationMs));
  const minSpan = Math.max(1, Math.min(minSpanMs, duration));
  const rawSpan = Number.isFinite(endMs - startMs) ? endMs - startMs : duration;
  const span = Math.max(minSpan, Math.min(duration, rawSpan));
  const maxStart = Math.max(0, duration - span);
  const start = Math.min(
    maxStart,
    Math.max(0, Number.isFinite(startMs) ? startMs : 0),
  );
  return { startMs: start, endMs: Math.min(duration, start + span) };
}

/** Zooms a window by `factor` (>1 = zoom in, <1 = zoom out) around `anchorMs`,
 * keeping the anchor's relative position inside the window stable. */
export function zoomViewportWindow(
  window: TimelineWindow,
  factor: number,
  anchorMs: number,
  durationMs: number,
): TimelineWindow {
  const span = Math.max(1, window.endMs - window.startMs);
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const newSpan = span / safeFactor;
  const ratio = span > 0 ? (anchorMs - window.startMs) / span : 0.5;
  const newStart = anchorMs - ratio * newSpan;
  return clampViewportWindow(newStart, newStart + newSpan, durationMs);
}

/** Pans a window by `deltaMs`, clamped so it cannot leave [0, durationMs]. */
export function panViewportWindow(
  window: TimelineWindow,
  deltaMs: number,
  durationMs: number,
): TimelineWindow {
  const span = window.endMs - window.startMs;
  return clampViewportWindow(
    window.startMs + deltaMs,
    window.startMs + deltaMs + span,
    durationMs,
  );
}

/** Maps a time value (ms) to a pixel offset within a plot of `widthPx`. */
export function timeToX(
  timeMs: number,
  window: TimelineWindow,
  widthPx: number,
): number {
  const span = Math.max(1, window.endMs - window.startMs);
  return ((timeMs - window.startMs) / span) * widthPx;
}

/** Maps a pixel offset within a plot of `widthPx` back to a time value (ms). */
export function xToTime(
  xPx: number,
  window: TimelineWindow,
  widthPx: number,
): number {
  const span = window.endMs - window.startMs;
  const width = Math.max(1, widthPx);
  return window.startMs + (xPx / width) * span;
}

// ---------------------------------------------------------------------------
// Lane marker rendering.
//
// Markers that *have* artwork are always drawn as their skill icon, at every
// density: overlapping icons are far more useful than the abbreviated ticks
// they used to degrade into (an icon threshold of ~14px meant anything cast
// within ~3.5s of a neighbour lost its artwork on a full-fight view, which is
// most of a player's rotation). Occluded icons stay discoverable via the hover
// tooltip and by zooming in.
//
// Only markers *without* artwork (boss skills, whose DTO carries no icon) still
// degrade label pill -> tick -> dot, driven purely by the pixel gap to the
// nearest neighbour so the DOM lane renderer never needs to measure text width
// itself (CSS truncation handles the rest).
// ---------------------------------------------------------------------------

export type LaneMarkerTier = "label" | "tick" | "dot";

export function laneMarkerTier(
  availablePx: number,
  labelMinGapPx: number,
  tickMinGapPx: number,
): LaneMarkerTier {
  if (availablePx >= labelMinGapPx) return "label";
  if (availablePx >= tickMinGapPx) return "tick";
  return "dot";
}

/** Minimal shape the visibility helpers below need; both `LanePoint` and any
 * other time-stamped record satisfy it. Kept structural so this module never
 * has to import from `timeline-types` (which imports back from here). */
type TimeStamped = { timeMs: number };

/** Binary search over an ascending-by-time list. `strict` picks the bound:
 * `false` gives the first index at or after `timeMs` (the first visible point),
 * `true` the first index strictly after it (one past the last visible point).
 * Ascending order is guaranteed by the lane builder, which sorts each caster's
 * events. */
function boundByTime(
  points: readonly TimeStamped[],
  timeMs: number,
  strict: boolean,
): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const value = points[mid]?.timeMs ?? 0;
    if (strict ? value <= timeMs : value < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Visible slice of a time-ordered lane, padded by one point on each side so a
 * marker straddling the viewport edge still renders its visible half. Replaces
 * a full `.filter()` pass, which zoom/pan would otherwise re-run over every
 * point of every lane on each frame. */
export function sliceLanePointsByTime<T extends TimeStamped>(
  points: readonly T[],
  startMs: number,
  endMs: number,
): T[] {
  if (points.length === 0) return [];
  const first = Math.max(0, boundByTime(points, startMs, false) - 1);
  const last = Math.min(points.length, boundByTime(points, endMs, true) + 1);
  return points.slice(first, last);
}

/** Half-open `[startMs, endMs)` interval on the fight-offset axis. */
type TimeSpan = { startMs: number; endMs: number };

/** Keeps only spans overlapping the visible half-open window, clamped to it.
 * Buff lanes carry few spans, so a linear pass beats maintaining a second
 * binary-search index. Returns [leftPct, widthPct] pairs ready for CSS.
 *
 * With `plotWidthPx`, neighbours separated by less than one pixel merge into
 * one rect (keeping the first span's `startMs` and the last one's `endMs`),
 * so a lane's node count is bounded by the plot width rather than by how
 * often the buff flickered. Expects spans ascending and non-overlapping. */
export function visibleSpanRects(
  spans: readonly TimeSpan[],
  startMs: number,
  endMs: number,
  plotWidthPx = 0,
): { startMs: number; endMs: number; leftPct: number; widthPct: number }[] {
  const windowMs = endMs - startMs;
  if (windowMs <= 0) return [];
  const mergeGapMs = plotWidthPx > 0 ? windowMs / plotWidthPx : 0;
  const result: {
    startMs: number;
    endMs: number;
    leftPct: number;
    widthPct: number;
  }[] = [];
  let lastClampedEnd = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    if (span.endMs <= startMs || span.startMs >= endMs) continue;
    const clampedStart = Math.max(span.startMs, startMs);
    const clampedEnd = Math.min(span.endMs, endMs);
    const last = result[result.length - 1];
    if (last && clampedStart - lastClampedEnd < mergeGapMs) {
      last.endMs = span.endMs;
      last.widthPct = ((clampedEnd - startMs) / windowMs) * 100 - last.leftPct;
      lastClampedEnd = clampedEnd;
      continue;
    }
    result.push({
      startMs: span.startMs,
      endMs: span.endMs,
      leftPct: ((clampedStart - startMs) / windowMs) * 100,
      widthPct: ((clampedEnd - clampedStart) / windowMs) * 100,
    });
    lastClampedEnd = clampedEnd;
  }
  return result;
}

/** The span containing `timeMs`, by binary search over ascending,
 * non-overlapping half-open spans; null when `timeMs` falls in a gap. */
export function spanAt<T extends TimeSpan>(
  spans: readonly T[],
  timeMs: number,
): T | null {
  let lo = 0;
  let hi = spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid]!.endMs <= timeMs) lo = mid + 1;
    else hi = mid;
  }
  const span = spans[lo];
  return span && span.startMs <= timeMs ? span : null;
}

/** Gaps between ascending, non-overlapping spans within `[0, durationMs)`.
 * Empty input yields no gaps: a missing span list means "unknown", and must
 * not paint the whole fight as a gap. */
export function complementSpans(
  spans: readonly TimeSpan[],
  durationMs: number,
): TimeSpan[] {
  if (spans.length === 0) return [];
  const result: TimeSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const start = Math.min(durationMs, span.startMs);
    if (start > cursor) result.push({ startMs: cursor, endMs: start });
    cursor = Math.max(cursor, Math.min(durationMs, span.endMs));
  }
  if (durationMs > cursor) result.push({ startMs: cursor, endMs: durationMs });
  return result;
}

/** Drops markers that land on a pixel column already claimed by a later one.
 *
 * Lane markers are painted in DOM order, so the later marker of an overlapping
 * pair sits on top with an opaque background - a marker sharing its rounded
 * pixel is therefore already fully hidden, and removing it is visually lossless
 * (at most a sub-pixel sliver). The point is to bound the node count of a lane
 * by the plot's pixel width instead of by the fight's cast count, which matters
 * on long encounters now that nothing degrades away. At normal density (icons
 * more than a pixel apart) this returns the input untouched. */
export function dedupeMarkersByPixel<T extends TimeStamped>(
  points: readonly T[],
  startMs: number,
  endMs: number,
  plotWidthPx: number,
): T[] {
  if (points.length < 2 || plotWidthPx <= 0) return points as T[];
  const spanMs = Math.max(1, endMs - startMs);
  const kept: T[] = [];
  let lastKeptPx = Number.POSITIVE_INFINITY;
  // Walk backwards so the marker that wins a pixel column is the one that is
  // actually drawn on top.
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (!point) continue;
    const x = Math.round(((point.timeMs - startMs) / spanMs) * plotWidthPx);
    if (lastKeptPx - x < 1) continue;
    lastKeptPx = x;
    kept.push(point);
  }
  kept.reverse();
  return kept;
}

/** Structural shape for tooltip collapse; `LanePoint` satisfies this without
 * this module importing `timeline-types`. */
type HoverLanePoint = {
  timeMs: number;
  event: Pick<EncounterTimelineEvent, "kind" | "skillId" | "casterUuid">;
};

/** Drops later hover hits that are the same cast fact: same kind, skill,
 * caster and exact millisecond. Multi-summon fantasies (e.g. Goblin March)
 * share one resonance skill id and land on the same offset, so the tooltip
 * shows one row. Distinct casts 1ms apart, or a key_skill vs fantasy of the
 * same id, stay separate. Callers pass an already distance-sorted, truncated
 * list. */
export function collapseHoverLanePoints<T extends HoverLanePoint>(
  points: readonly T[],
): T[] {
  if (points.length < 2) return points as T[];
  const kept: T[] = [];
  for (const point of points) {
    const isDuplicate = kept.some(
      (prior) =>
        prior.timeMs === point.timeMs &&
        prior.event.kind === point.event.kind &&
        prior.event.skillId === point.event.skillId &&
        prior.event.casterUuid === point.event.casterUuid,
    );
    if (!isDuplicate) kept.push(point);
  }
  return kept;
}

/** Tooltip/crosshair time: snap to the nearest hit event, else keep the pointer. */
export function resolveHoverDisplayTimeMs(
  pointerTimeMs: number,
  nearestEventTimeMs: number | undefined,
): number {
  return nearestEventTimeMs ?? pointerTimeMs;
}

// ---------------------------------------------------------------------------
// Zoom tier: discrete step (rather than continuous scaling) so lane row
// height / icon size only re-layout when the viewport crosses a threshold,
// instead of reflowing on every wheel tick. See timeline-layout.ts, which
// consumes this to scale `laneH`/`iconSize`.
// ---------------------------------------------------------------------------

export type ZoomTier = 0 | 1 | 2;

const ZOOM_TIER_2_RATIO = 10;
const ZOOM_TIER_1_RATIO = 4;

/** Derives the discrete zoom tier from how much the visible span has been
 * zoomed in relative to the full encounter duration. */
export function zoomTierFor(durationMs: number, spanMs: number): ZoomTier {
  const ratio = spanMs > 0 ? durationMs / spanMs : 1;
  if (ratio >= ZOOM_TIER_2_RATIO) return 2;
  if (ratio >= ZOOM_TIER_1_RATIO) return 1;
  return 0;
}
