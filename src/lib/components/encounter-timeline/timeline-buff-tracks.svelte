<script lang="ts">
  // Buff rows inside the plot column: a full-width caption line (so long buff
  // names are never squeezed into the gutter) above a presence bar, plus one
  // hatched layer marking inactive-combat gaps that the coverage percent
  // ignores. Purely visual - hover details come from the shared overlay, so
  // spans carry no per-element tooltips.
  import { playerColor } from "./timeline-colors";
  import { visibleSpanRects } from "./timeline-data";
  import { BUFF_BAR_CENTER_Y, BUFF_CAPTION_H } from "./timeline-layout";
  import type { TimelineBuffSpan, TimelineRow } from "./timeline-types";

  type BuffRow = Extract<TimelineRow, { kind: "buff" }>;

  type Props = {
    rows: BuffRow[];
    /** Buff block extent in chart-body coordinates. */
    buffTop: number;
    buffHeight: number;
    inactiveSpans: TimelineBuffSpan[];
    startMs: number;
    endMs: number;
    plotWidthPx: number;
  };

  let {
    rows,
    buffTop,
    buffHeight,
    inactiveSpans,
    startMs,
    endMs,
    plotWidthPx,
  }: Props = $props();

  const inactiveRects = $derived(
    visibleSpanRects(inactiveSpans, startMs, endMs, plotWidthPx),
  );
</script>

<div class="pointer-events-none absolute inset-x-0 top-0">
  {#if buffHeight > 0 && inactiveRects.length > 0}
    <div
      class="absolute inset-x-0"
      style="top: {buffTop}px; height: {buffHeight}px"
    >
      {#each inactiveRects as rect (rect.startMs)}
        <div
          class="tl-inactive"
          style="left: {rect.leftPct}%; width: {rect.widthPct}%"
        ></div>
      {/each}
    </div>
  {/if}

  {#each rows as row (row.key)}
    {@const color = playerColor(row.player)}
    <div
      class="absolute inset-x-0"
      style="top: {row.top}px; height: {row.height}px"
    >
      <div
        class="flex max-w-full items-center gap-1 text-[11px]"
        style="height: {BUFF_CAPTION_H}px; line-height: {BUFF_CAPTION_H}px"
      >
        {#if row.caption === "buff"}
          <span class="min-w-0 truncate" style="color: var(--tl-fg)">
            {row.lane.buffName}
          </span>
        {:else}
          <span
            class="size-1.5 shrink-0 rounded-full"
            style="background: {color}"
          ></span>
          <span class="min-w-0 truncate" style="color: {color}">
            {row.player.name}
          </span>
        {/if}
        <span
          class="shrink-0 text-[10px] tabular-nums"
          style="color: var(--tl-fg-muted)"
        >
          ×{row.lane.triggerCount}
        </span>
      </div>
      <div
        class="absolute inset-x-0 h-px"
        style="top: {BUFF_BAR_CENTER_Y}px; background: var(--tl-row-line)"
      ></div>
      {#each visibleSpanRects(row.lane.spans, startMs, endMs, plotWidthPx) as rect (rect.startMs)}
        <div
          class="tl-buff-span"
          style="top: {BUFF_BAR_CENTER_Y}px; left: {rect.leftPct}%;
                 width: max(1px, {rect.widthPct}%); background: {color}"
        ></div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .tl-inactive {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--tl-inactive-hatch);
  }

  .tl-buff-span {
    position: absolute;
    height: 8px;
    transform: translateY(-50%);
    border-radius: 2px;
    opacity: 0.75;
  }
</style>
