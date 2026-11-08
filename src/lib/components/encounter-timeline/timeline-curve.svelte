<script lang="ts">
  // Dumb ECharts renderer: draws the local player's instant/average DPS
  // curves plus each selected teammate's chosen DPS series. It owns no
  // interaction state at all (no tooltip, no dataZoom, no brush, no
  // toolbox) - the gesture layer above it handles every pointer/wheel
  // event, and the Y axis rescales to whatever window [startMs, endMs) the
  // viewport currently shows, so zooming into a quiet stretch of the fight
  // actually reveals more curve detail instead of just stretching a flat
  // line horizontally.
  import * as echarts from "echarts/core";
  import { LineChart } from "echarts/charts";
  import { GridComponent } from "echarts/components";
  import { CanvasRenderer } from "echarts/renderers";
  import { GUTTER, RIGHT_PADDING } from "./timeline-layout";
  import { curveMaxValue } from "./timeline-data";
  import { formatValue, formatTimeMs } from "./timeline-format";
  import { TIMELINE_PALETTE } from "./timeline-palette";
  import { SETTINGS } from "$lib/settings-store";
  import type { EncounterCurvePoint } from "./timeline-data";
  import type { TimelineTeammateCurve } from "./timeline-types";

  echarts.use([LineChart, GridComponent, CanvasRenderer]);

  /** Draw a symbol every Nth pixel-bounded point on the cumulative curve. */
  const SYMBOL_STRIDE = 24;

  type Props = {
    mineInstantCurve: EncounterCurvePoint[] | null;
    mineAverageCurve: EncounterCurvePoint[] | null;
    /** The local player's chart color; their two readings share it and are
     * told apart by shape (thin line vs. thick line with dots). */
    selfColor: string;
    teammateCurves?: TimelineTeammateCurve[];
    showAverageCurve: boolean;
    startMs: number;
    endMs: number;
    curveH: number;
  };

  let {
    mineInstantCurve,
    mineAverageCurve,
    selfColor,
    teammateCurves = [],
    showAverageCurve,
    startMs,
    endMs,
    curveH,
  }: Props = $props();

  const abbreviationStyle = $derived(
    SETTINGS.history.general.state.abbreviationStyle,
  );
  const abbreviatedDecimalPlaces = $derived(
    SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1,
  );

  const yMax = $derived.by(() => {
    const instantMax = curveMaxValue(mineInstantCurve);
    const averageMax = showAverageCurve
      ? curveMaxValue(mineAverageCurve)
      : 0;
    let teammateMax = 0;
    for (const row of teammateCurves) {
      teammateMax = Math.max(teammateMax, curveMaxValue(row.curve));
    }
    const max = Math.max(instantMax, averageMax, teammateMax);
    // Headroom so the peak doesn't touch the top axis line; fall back to
    // `undefined` (ECharts auto-scale) when the visible window has no data.
    return max > 0 ? max * 1.08 : undefined;
  });

  function buildOption(): echarts.EChartsCoreOption {
    // Read eagerly, not inside the axis formatter below: the formatter runs
    // later inside ECharts, outside this derived's tracking scope, so a
    // deferred read would never register the settings as a dependency and
    // changing the abbreviation style would leave a stale axis.
    const valueStyle = abbreviationStyle;
    const valueDecimals = abbreviatedDecimalPlaces;
    const series: Record<string, unknown>[] = [];

    // Teammate curves sit under the local series so a comparison overlay
    // cannot bury the local player's burst peaks.
    for (const row of teammateCurves) {
      series.push({
        type: "line",
        data: row.curve,
        showSymbol: false,
        smooth: false,
        // Samples are one CSS pixel apart. Step-end prevents a hit sampled at
        // the next boundary from leaking backward into earlier time.
        step: "end",
        silent: true,
        lineStyle: {
          width: 1.2,
          color: row.color,
          type: row.mode === "instant" ? "dashed" : "solid",
        },
        z: 1,
      });
    }

    // One color (the local player's), two shapes: the instant reading is a
    // thin crisp line meant to be read as noise with spikes (no smoothing, no
    // glow, no area fill - all of which used to blur exactly the burst peaks
    // the curve exists to show), while the cumulative average is the calm,
    // thicker reference line with dots drawn over it. A separate hue for the
    // average used to collide with yellow class colors.
    if (showAverageCurve && mineAverageCurve) {
      series.push({
        type: "line",
        data: mineAverageCurve,
        showSymbol: true,
        symbol: "circle",
        // Only every Nth sample gets a visible symbol; the rest render at
        // size 0. ECharts has no "every Nth" option, and drawing every
        // sampled point would bury the line under its own markers.
        symbolSize: (_value: unknown, params: { dataIndex: number }) =>
          params.dataIndex % SYMBOL_STRIDE === 0 ? 4 : 0,
        itemStyle: { color: selfColor },
        smooth: false,
        step: "end",
        silent: true,
        lineStyle: {
          width: 2,
          color: selfColor,
        },
        z: 3,
      });
    }
    if (mineInstantCurve) {
      series.push({
        type: "line",
        data: mineInstantCurve,
        showSymbol: false,
        smooth: false,
        step: "end",
        silent: true,
        lineStyle: {
          width: 1.2,
          color: selfColor,
        },
        z: 2,
      });
    }

    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: GUTTER, right: RIGHT_PADDING, top: 6, bottom: 20 },
      xAxis: {
        type: "value",
        min: startMs,
        max: endMs,
        axisLabel: {
          color: TIMELINE_PALETTE.fgMuted,
          fontSize: 10,
          formatter: (v: number) => formatTimeMs(v),
        },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: TIMELINE_PALETTE.axis } },
        axisTick: { lineStyle: { color: TIMELINE_PALETTE.axis } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: yMax,
        splitNumber: 4,
        axisLabel: {
          color: TIMELINE_PALETTE.fgMuted,
          fontSize: 10,
          formatter: (v: number) => formatValue(v, valueStyle, valueDecimals),
        },
        splitLine: { lineStyle: { color: TIMELINE_PALETTE.grid } },
      },
      series,
    };
  }

  const chartOption = $derived.by(buildOption);

  function chartAttachment(node: HTMLDivElement) {
    const chart = echarts.init(node, null, { renderer: "canvas" });
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(node);

    // Zoom/pan gestures fire many times per second; batching the resulting
    // `setOption` calls to one per animation frame keeps panning smooth
    // without needing to hand-roll a debounce timer.
    let rafHandle: number | null = null;
    const effectCleanup = $effect.root(() => {
      $effect(() => {
        const option = chartOption;
        if (rafHandle !== null) cancelAnimationFrame(rafHandle);
        rafHandle = requestAnimationFrame(() => {
          rafHandle = null;
          chart.setOption(option, { notMerge: true });
        });
      });
    });

    return () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      effectCleanup();
      resizeObserver.disconnect();
      chart.dispose();
    };
  }
</script>

<div
  class="absolute inset-x-0 top-0"
  style="height: {curveH}px; pointer-events: none"
  {@attach chartAttachment}
></div>
