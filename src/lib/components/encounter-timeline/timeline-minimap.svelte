<script lang="ts">
  // SVG navigation strip: replaces the old 12px ECharts dataZoom slider. Shows
  // a fixed-size DPS overview for context, the current viewport window as a
  // draggable/resizable rectangle, and the active selection (if any). This is
  // the primary way to orient yourself once zoomed in - panning/zooming the
  // main plot alone gives no sense of where you are in the fight.
  import type { TimelineViewport } from "./timeline-viewport.svelte";
  import type { EncounterCurvePoint } from "./timeline-data";

  type Props = {
    viewport: TimelineViewport;
    curve: EncounterCurvePoint[] | null;
    /** The local player's chart color (the curve is theirs). */
    color: string;
    selectedRange?: [number, number] | null;
  };

  let { viewport, curve, color, selectedRange = null }: Props = $props();

  let trackEl: HTMLDivElement | undefined = $state();

  const VIEWBOX_W = 1000;
  const VIEWBOX_H = 100;

  // The parent samples this overview directly from the raw-hit index, so point
  // density in burst phases cannot bias a second downsampling pass.
  const sparkline = $derived(curve ?? []);
  const maxValue = $derived(
    sparkline.reduce((max, [, v]) => Math.max(max, v), 0),
  );

  function toXY([t, v]: EncounterCurvePoint): [number, number] {
    const x = (t / viewport.durationMs) * VIEWBOX_W;
    const y =
      maxValue > 0
        ? VIEWBOX_H - (v / maxValue) * (VIEWBOX_H - 8) - 4
        : VIEWBOX_H - 4;
    return [x, y];
  }

  const linePath = $derived.by(() => {
    if (sparkline.length === 0) return "";
    return sparkline
      .map((point, i) => {
        const [x, y] = toXY(point);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  });

  const areaPath = $derived(
    linePath
      ? `${linePath} L${VIEWBOX_W},${VIEWBOX_H} L0,${VIEWBOX_H} Z`
      : "",
  );

  const windowLeftPct = $derived((viewport.startMs / viewport.durationMs) * 100);
  const windowWidthPct = $derived(
    Math.max(0.5, (viewport.spanMs / viewport.durationMs) * 100),
  );

  const selectionStyle = $derived.by(() => {
    if (!selectedRange) return null;
    const left = (selectedRange[0] / viewport.durationMs) * 100;
    const width = Math.max(
      0.2,
      ((selectedRange[1] - selectedRange[0]) / viewport.durationMs) * 100,
    );
    return `left: ${left}%; width: ${width}%`;
  });

  function timeAtClientX(clientX: number): number {
    if (!trackEl) return 0;
    const rect = trackEl.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(1, Math.max(0, ratio)) * viewport.durationMs;
  }

  type DragKind = "move" | "resize-left" | "resize-right";

  function beginDrag(event: PointerEvent, kind: DragKind) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    let lastClientX = event.clientX;

    function onMove(moveEvent: PointerEvent) {
      if (kind === "move") {
        if (!trackEl) return;
        const rect = trackEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const deltaRatio = (moveEvent.clientX - lastClientX) / rect.width;
        lastClientX = moveEvent.clientX;
        viewport.panBy(deltaRatio * viewport.durationMs);
        return;
      }
      const t = timeAtClientX(moveEvent.clientX);
      if (kind === "resize-left") {
        viewport.zoomToRange([t, viewport.endMs]);
      } else {
        viewport.zoomToRange([viewport.startMs, t]);
      }
    }

    function onUp() {
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onTrackClick(event: MouseEvent) {
    // The window rect/handles are descendants of the track, so a click
    // landing on them still bubbles here; only bare-track clicks should jump.
    const target = event.target as HTMLElement;
    if (target.closest(".tl-minimap-window")) return;
    const t = timeAtClientX(event.clientX);
    const half = viewport.spanMs / 2;
    viewport.zoomToRange([t - half, t + half]);
  }
</script>

<div
  bind:this={trackEl}
  class="tl-minimap relative h-8 w-full cursor-pointer overflow-hidden rounded"
  onclick={onTrackClick}
  role="presentation"
>
  <svg
    class="pointer-events-none absolute inset-0 h-full w-full"
    viewBox="0 0 {VIEWBOX_W} {VIEWBOX_H}"
    preserveAspectRatio="none"
  >
    <path d={areaPath} fill={color} fill-opacity="0.15" />
    <path
      d={linePath}
      fill="none"
      stroke={color}
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
    />
  </svg>

  {#if selectionStyle}
    <div class="tl-minimap-selection pointer-events-none" style={selectionStyle}></div>
  {/if}

  <div
    class="tl-minimap-window"
    style="left: {windowLeftPct}%; width: {windowWidthPct}%"
    onpointerdown={(e) => beginDrag(e, "move")}
    role="slider"
    aria-label="timeline viewport"
    aria-valuemin={0}
    aria-valuemax={viewport.durationMs}
    aria-valuenow={viewport.startMs}
    tabindex="0"
  >
    <div
      class="tl-minimap-handle tl-minimap-handle--left"
      onpointerdown={(e) => beginDrag(e, "resize-left")}
    ></div>
    <div
      class="tl-minimap-handle tl-minimap-handle--right"
      onpointerdown={(e) => beginDrag(e, "resize-right")}
    ></div>
  </div>
</div>

<style>
  .tl-minimap {
    background: rgba(148, 163, 184, 0.06);
  }

  .tl-minimap-selection {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(96, 165, 250, 0.18);
    border-left: 1px solid rgba(96, 165, 250, 0.5);
    border-right: 1px solid rgba(96, 165, 250, 0.5);
  }

  .tl-minimap-window {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 6px;
    background: rgba(148, 163, 184, 0.14);
    border: 1px solid var(--tl-accent);
    border-radius: 2px;
    cursor: grab;
  }

  .tl-minimap-window:active {
    cursor: grabbing;
  }

  .tl-minimap-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  .tl-minimap-handle--left {
    left: -4px;
  }

  .tl-minimap-handle--right {
    right: -4px;
  }
</style>
