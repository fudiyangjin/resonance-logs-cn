<script lang="ts">
  // DOM lane renderer: one absolutely-positioned row per boss caster / local
  // player / selected teammate. Markers are plain elements (img/div).
  //
  // A marker that has artwork always renders as its skill icon, however dense
  // the lane is - icons simply overlap, later casts stacking on top of earlier
  // ones. Only artwork-less markers (boss skills) still degrade label pill ->
  // tick -> dot based on the real pixel gap to their neighbour; CSS
  // `text-overflow: ellipsis` replaces the old hand-rolled text-width
  // estimator entirely.
  import {
    LABEL_MIN_GAP_PX,
    PILL_MAX_WIDTH_PX,
    TICK_MIN_GAP_PX,
  } from "./timeline-layout";
  import {
    dedupeMarkersByPixel,
    laneMarkerTier,
    sliceLanePointsByTime,
  } from "./timeline-data";
  import { hexToRgba } from "./timeline-format";
  import { laneColor } from "./timeline-colors";
  import type {
    LanePoint,
    TimelineEventDisplay,
    TimelineRow,
  } from "./timeline-types";
  import type { EncounterTimelineEvent } from "./timeline-data";

  type CastRow = Extract<TimelineRow, { kind: "cast" }>;

  type Props = {
    /** Cast rows positioned in chart-body coordinates. */
    rows: CastRow[];
    startMs: number;
    endMs: number;
    iconSize: number;
    /** Live pixel width of the plot area (from the gesture layer's
     * `bind:clientWidth`), used only for the density-degrade calculation. */
    plotWidthPx: number;
    resolveEvent: (event: EncounterTimelineEvent) => TimelineEventDisplay;
  };

  let { rows, startMs, endMs, iconSize, plotWidthPx, resolveEvent }: Props =
    $props();

  const spanMs = $derived(Math.max(1, endMs - startMs));

  function toLeftPct(timeMs: number): number {
    return ((timeMs - startMs) / spanMs) * 100;
  }

  /** Visible points per lane, kept in original time order so neighbour-gap
   * math below still reflects real adjacency. The pixel de-dupe only ever
   * removes markers that a later one already covers completely, so it is a
   * pure node-count guard for dense/long encounters - nothing visible is
   * lost. */
  const visibleLanes = $derived(
    rows.map((row) => ({
      row,
      lane: row.lane,
      points: dedupeMarkersByPixel(
        sliceLanePointsByTime(row.lane.points, startMs, endMs),
        startMs,
        endMs,
        plotWidthPx,
      ),
    })),
  );

  function availablePx(points: LanePoint[], index: number): number {
    const t = points[index]?.timeMs ?? 0;
    const prev = points[index - 1];
    const next = points[index + 1];
    const prevGapMs = prev ? t - prev.timeMs : Number.POSITIVE_INFINITY;
    const nextGapMs = next ? next.timeMs - t : Number.POSITIVE_INFINITY;
    const gapMs = Math.min(prevGapMs, nextGapMs);
    return gapMs === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : (gapMs / spanMs) * plotWidthPx;
  }
</script>

<div class="pointer-events-none absolute inset-x-0 top-0">
  {#each visibleLanes as { row, lane, points } (row.key)}
    {@const stroke = laneColor(lane)}
    <div
      class="absolute inset-x-0"
      style="top: {row.top}px; height: {row.height}px"
    >
      {#each points as point, index (point.event.sequence)}
        {@const display = resolveEvent(point.event)}
        {@const left = toLeftPct(point.timeMs)}
        {@const isFantasy = point.event.kind === "fantasy"}
        {@const hasIcon = display.iconPath !== null && lane.type !== "boss"}
        {@const tier = hasIcon
          ? "icon"
          : laneMarkerTier(
              availablePx(points, index),
              LABEL_MIN_GAP_PX,
              TICK_MIN_GAP_PX,
            )}
        {#if tier === "icon"}
          <div
            class="tl-marker-icon"
            class:tl-marker-icon--round={isFantasy}
            class:tl-marker-icon--mine={lane.type === "mine"}
            style="left: {left}%; width: {iconSize}px; height: {iconSize}px; border-color: {hexToRgba(
              stroke,
              lane.type === 'mine' ? 0.9 : 0.55,
            )}"
          >
            <img src={display.iconPath} alt="" />
          </div>
        {:else if tier === "label"}
          <div
            class="tl-marker-pill"
            style="left: {left}%; max-width: {PILL_MAX_WIDTH_PX}px;
                   border-color: {stroke}; background: {hexToRgba(
              stroke,
              0.1,
            )}"
          >
            {display.name}
          </div>
        {:else if tier === "tick"}
          <div
            class="tl-marker-tick"
            style="left: {left}%; background: {hexToRgba(
              stroke,
              isFantasy ? 0.95 : 0.6,
            )}"
          ></div>
        {:else}
          <div
            class="tl-marker-dot"
            style="left: {left}%; background: {hexToRgba(stroke, 0.8)}"
          ></div>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .tl-marker-icon {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 4px;
    border-width: 1px;
    border-style: solid;
    background: #0f1218;
    overflow: hidden;
    /* Dense rotations let neighbouring icons overlap; this dark ring keeps the
       stack legible as separate tiles instead of one smeared strip. */
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
  }

  .tl-marker-icon--round {
    border-radius: 999px;
  }

  .tl-marker-icon--mine {
    border-width: 1.5px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.55),
      0 0 5px var(--tl-mine);
  }

  .tl-marker-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .tl-marker-pill {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: max-content;
    padding: 0 5px;
    height: 16px;
    line-height: 16px;
    border-radius: 3px;
    border-width: 1px;
    border-style: solid;
    font-size: 9px;
    color: var(--tl-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tl-marker-tick {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 3px;
    height: 12px;
    border-radius: 1px;
  }

  .tl-marker-dot {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 4px;
    border-radius: 999px;
  }
</style>
