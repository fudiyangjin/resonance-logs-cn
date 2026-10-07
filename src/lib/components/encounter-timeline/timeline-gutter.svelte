<script lang="ts">
  // Left label column for every row. Narrow on purpose so the plot gets the
  // width: cast lane names truncate hard (each carries the full one as a
  // tooltip), buff rows only show their coverage percent, and buff group
  // headers are the one label allowed to run on into the plot column, since
  // their row has nothing else in it.
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { tooltip } from "$lib/utils.svelte";
  import { laneColor, playerColor } from "./timeline-colors";
  import { BUFF_BAR_CENTER_Y } from "./timeline-layout";
  import { TIMELINE_PALETTE } from "./timeline-palette";
  import type { TimelineBuffLane, TimelineRow } from "./timeline-types";

  type Props = {
    rows: TimelineRow[];
    gutter: number;
    plotWidthPx: number;
    /** Percent shown for a buff row (range-aware); null renders "--". */
    buffCoveragePct: (lane: TimelineBuffLane) => number | null;
  };

  let { rows, gutter, plotWidthPx, buffCoveragePct }: Props = $props();

  /** Matches the `left-2.5` inset every label starts at. */
  const LABEL_INSET_PX = 10;
</script>

<!-- Pointer events stay off except on cast labels (tooltips); this column
     sits left of the gesture surface, and the run-on group headers must not
     block it. -->
<div class="pointer-events-none absolute top-0 left-0" style="width: {gutter}px">
  {#each rows as row (row.key)}
    {#if row.kind === "cast"}
      {@const lane = row.lane}
      {@const laneName = lane.type === "boss" ? lane.name : lane.player.name}
      <div
        class="pointer-events-auto absolute right-2 left-2.5 flex items-center gap-1.5 overflow-hidden"
        style="top: {row.top}px; height: {row.height}px"
        {@attach tooltip(() => laneName)}
      >
        {#if lane.type === "boss"}
          <TriangleAlertIcon
            class="size-3.5 shrink-0"
            style="color: {TIMELINE_PALETTE.boss}"
          />
          <span class="truncate text-[11px]" style="color: {laneColor(lane)}">
            {lane.name}
          </span>
        {:else if lane.type === "mine"}
          <span
            class="size-1.5 shrink-0 rounded-full"
            style="background: {TIMELINE_PALETTE.mine}; box-shadow: 0 0 6px {TIMELINE_PALETTE.mine}"
          ></span>
          <span
            class="truncate text-[11px] font-medium"
            style="color: #dbeafe"
          >
            {lane.player.name}
          </span>
        {:else}
          <span
            class="size-1.5 shrink-0 rounded-full"
            style="background: {playerColor(lane.player)}"
          ></span>
          <span
            class="truncate text-[11px]"
            style="color: {playerColor(lane.player)}"
          >
            {lane.player.name}
          </span>
        {/if}
      </div>
    {:else if row.kind === "buff-group"}
      <div
        class="absolute left-2.5 flex items-center gap-1.5 text-[11px] font-medium"
        style="top: {row.top}px; height: {row.height}px;
               max-width: {gutter + plotWidthPx - LABEL_INSET_PX}px"
      >
        {#if row.player}
          {@const color = playerColor(row.player)}
          <span
            class="size-1.5 shrink-0 rounded-full"
            style="background: {color}"
          ></span>
          <span class="min-w-0 truncate" style="color: {color}">
            {row.label}
          </span>
        {:else}
          <span class="min-w-0 truncate" style="color: var(--tl-fg)">
            {row.label}
          </span>
        {/if}
      </div>
    {:else}
      {@const pct = buffCoveragePct(row.lane)}
      <div
        class="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums"
        style="top: {row.top + BUFF_BAR_CENTER_Y}px; color: {playerColor(
          row.player,
        )}"
      >
        {pct === null ? "--" : `${pct.toFixed(1)}%`}
      </div>
    {/if}
  {/each}
</div>
