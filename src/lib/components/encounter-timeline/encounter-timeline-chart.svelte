<script lang="ts">
  // Per-encounter timeline panel, rendered as a self-contained dark "chart
  // island" that does not follow the global color theme (canvas cannot read
  // CSS variables; the semantic palette is tuned for a dark surface).
  //
  // Architecture (see plan for the full rationale): a single `TimelineViewport`
  // is the only source of truth for the visible time window. Lane markers and
  // gesture/tooltip handling are plain DOM (`timeline-lanes.svelte`,
  // `timeline-gestures.ts`, `timeline-overlay.svelte`); ECharts
  // (`timeline-curve.svelte`) is reduced to a "dumb" renderer that only draws
  // the DPS curves and owns no interaction state at all. This replaces the
  // old canvas-only implementation, where lane markers were hand-drawn
  // `renderItem` shapes with a manual text-width estimator, and the ECharts
  // brush permanently occupied left-drag (so pan and zoom were effectively
  // unusable once the encounter was zoomed in).
  //
  // Structure, top to bottom:
  //   - header: curve legend, viewport indicator/reset, independent
  //     teammate lane / curve / buff owner selectors;
  //   - chart body: one positioned track list (cast lanes, then buff rows)
  //     above the DPS curve, all sharing the coordinate system driven by
  //     `viewport` and one gesture/overlay surface;
  //   - minimap: full-encounter overview with a draggable/resizable window;
  //   - selection bar: active brush range, "zoom to selection", clear button.
  import { untrack } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import Clock3Icon from "@lucide/svelte/icons/clock-3";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
  import { t } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { playerColor } from "./timeline-colors";
  import {
    clampInstantDpsWindowSec,
    complementSpans,
    foldEncounterDamageHits,
    sampleDpsCurve,
    teammateDpsSources,
    zoomTierFor,
    type EncounterChart,
    type EncounterTimelineEvent,
    type TeammateCurveMode,
  } from "./timeline-data";
  import { formatTimeMs } from "./timeline-format";
  import {
    DEFAULT_CURVE_H,
    DEFAULT_LANE_H,
    RIGHT_PADDING,
    clampCurveH,
    computeTimelineLayout,
    displayedLaneHToBase,
  } from "./timeline-layout";
  import { timelineGestures } from "./timeline-gestures";
  import { TIMELINE_PALETTE, timelinePaletteCssVars } from "./timeline-palette";
  import { BuffViewState, PlayerSelection } from "./timeline-selection.svelte";
  import { buildBuffTracks } from "./timeline-tracks";
  import TimelineBuffTracks from "./timeline-buff-tracks.svelte";
  import TimelineCurve from "./timeline-curve.svelte";
  import TimelineGutter from "./timeline-gutter.svelte";
  import TimelineHeader from "./timeline-header.svelte";
  import TimelineLanes from "./timeline-lanes.svelte";
  import TimelineMinimap from "./timeline-minimap.svelte";
  import TimelineOverlay from "./timeline-overlay.svelte";
  import TimelineResizeHandle from "./timeline-resize-handle.svelte";
  import type {
    Lane,
    LanePoint,
    TimelineBuffData,
    TimelineBuffLane,
    TimelineBossMeta as TimelineBossMetaSource,
    TimelineEventDisplay as TimelineEventDisplaySource,
    TimelineHoverPoint,
    TimelinePlayerMeta as TimelinePlayerMetaSource,
    TimelineRow,
    TimelineTeammateCurve,
    TimelineTrack,
  } from "./timeline-types";
  import { TimelineViewport } from "./timeline-viewport.svelte";

  // Re-exported for backward compatibility: callers import these types from
  // this component's module, e.g.
  // `import EncounterTimelineChart, { type TimelineEventDisplay } from "...";`
  // (a bare `export type { X }` re-export isn't picked up by svelte-check's
  // component typing, so these need to be real local alias declarations.)
  export type TimelineBossMeta = TimelineBossMetaSource;
  export type TimelineEventDisplay = TimelineEventDisplaySource;
  export type TimelinePlayerMeta = TimelinePlayerMetaSource;

  /** Support classes whose key casts (heal / concerto) are shown by default. */
  const DEFAULT_LANE_CLASSES = new Set(["Verdant Oracle", "Beat Performer"]);

  type Props = {
    chart: EncounterChart;
    events: EncounterTimelineEvent[];
    /** Party members shown in the lanes / curves. */
    players?: TimelinePlayerMeta[];
    /** Boss casters used to label their lanes; unknown casters fall back to a
     * generic label. */
    bosses?: TimelineBossMeta[];
    /** Whether exact millisecond recount is available for this encounter. */
    selectionEnabled?: boolean;
    /** Whether the parent is recounting the currently selected range. */
    selectionPending?: boolean;
    /** Selected half-open [startMs, endMs) range, null when unselected. */
    selectedRange?: [number, number] | null;
    /** Resolve the display strings/icon for one marker event. */
    resolveEvent: (event: EncounterTimelineEvent) => TimelineEventDisplay;
    /** Buff coverage lanes + active windows; null = recorded before buff
     * persistence existed (no buff picker). */
    buffTimeline?: TimelineBuffData | null;
    /** Range-recount coverage percent by lane key while a range is active. */
    buffRangeCoverage?: Map<string, number> | null;
  };

  let {
    chart,
    events,
    players = [],
    bosses = [],
    selectionEnabled = true,
    selectionPending = false,
    selectedRange = $bindable(null),
    resolveEvent,
    buffTimeline = null,
    buffRangeCoverage = null,
  }: Props = $props();

  // ---- Damage hits / DPS curves --------------------------------------------
  // The DTO carries per-entity damage hit streams (columnar, ascending by
  // time). Index them once; curves are built on demand from those streams so
  // the cost stays independent of party size.
  const damageHits = $derived(foldEncounterDamageHits(chart));
  const chartDurationMs = $derived(damageHits.durationMs);
  const perEntityHits = $derived(damageHits.perEntityHits);

  const localPlayer = $derived(players.find((p) => p.isLocalPlayer) ?? null);

  const mineHits = $derived.by(() =>
    localPlayer ? (perEntityHits.get(localPlayer.entityUuid) ?? null) : null,
  );

  function clampEventOffsetMs(ev: EncounterTimelineEvent): number {
    const offsetMs = Number(ev.tsOffsetMs);
    if (!Number.isFinite(offsetMs)) return 0;
    return Math.min(chartDurationMs, Math.max(0, offsetMs));
  }

  // ---- Lane grouping --------------------------------------------------------
  /** Boss-cast events grouped by caster uuid, one lane per caster. */
  let bossEventsByCaster = $derived.by(() => {
    const map = new SvelteMap<string, EncounterTimelineEvent[]>();
    for (const ev of events) {
      if (ev.kind !== "boss_skill") continue;
      const list = map.get(ev.casterUuid) ?? [];
      list.push(ev);
      map.set(ev.casterUuid, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.tsOffsetMs - b.tsOffsetMs);
    }
    return map;
  });

  let bossNameByUuid = $derived.by(() => {
    const map = new SvelteMap<string, string>();
    for (const boss of bosses) {
      if (!boss.name || map.has(boss.entityUuid)) continue;
      map.set(boss.entityUuid, boss.name);
    }
    return map;
  });

  /** Player-cast events (fantasy + key skill) grouped by caster uuid. */
  let playerEventsByCaster = $derived.by(() => {
    const map = new SvelteMap<string, EncounterTimelineEvent[]>();
    for (const ev of events) {
      if (ev.kind === "boss_skill") continue;
      const list = map.get(ev.casterUuid) ?? [];
      list.push(ev);
      map.set(ev.casterUuid, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.tsOffsetMs - b.tsOffsetMs);
    }
    return map;
  });

  /** Non-local players that have casts or damage worth a lane/curve. */
  let teammates = $derived.by(() => {
    return players.filter((p) => {
      if (localPlayer && p.entityUuid === localPlayer.entityUuid) return false;
      return (
        (playerEventsByCaster.get(p.entityUuid)?.length ?? 0) > 0 ||
        (perEntityHits
          .get(p.entityUuid)
          ?.amounts.some((amount) => amount > 0) ??
          false)
      );
    });
  });

  /** Default lane selection: supports that actually cast key skills. */
  let defaultTeammateUuids = $derived(
    teammates
      .filter(
        (p) =>
          DEFAULT_LANE_CLASSES.has(p.className) &&
          (playerEventsByCaster.get(p.entityUuid)?.length ?? 0) > 0,
      )
      .map((p) => p.entityUuid),
  );

  // Follows the default (support players) until the user touches the picker.
  const laneSelection = new PlayerSelection(() => defaultTeammateUuids);

  let selectedTeammates = $derived(
    teammates.filter((p) => laneSelection.has(p.entityUuid)),
  );

  /** Teammates with damage (heal/taken-only actors stay off the curve picker). */
  let curveTeammates = $derived(
    teammates.filter(
      (p) =>
        perEntityHits.get(p.entityUuid)?.amounts.some((amount) => amount > 0) ??
        false,
    ),
  );

  // Independent of lane selection: default is none, so opening a support
  // lane never also overlays that player's DPS. Each selected teammate owns
  // exactly one mode: average or instant.
  const manualCurveTeammateModes = new SvelteMap<string, TeammateCurveMode>();

  let selectedCurveTeammateModes = $derived.by(() => {
    const availableUuids = new Set(
      curveTeammates.map((player) => player.entityUuid),
    );
    return new Map(
      [...manualCurveTeammateModes].filter(([uuid]) =>
        availableUuids.has(uuid),
      ),
    );
  });

  function toggleCurveTeammate(entityUuid: string) {
    const current = manualCurveTeammateModes.get(entityUuid);
    if (current === "average") {
      manualCurveTeammateModes.set(entityUuid, "instant");
    } else if (current === "instant") {
      manualCurveTeammateModes.delete(entityUuid);
    } else {
      manualCurveTeammateModes.set(entityUuid, "average");
    }
  }

  function selectAllCurveTeammates() {
    manualCurveTeammateModes.clear();
    for (const player of curveTeammates) {
      manualCurveTeammateModes.set(player.entityUuid, "average");
    }
  }

  function clearCurveTeammates() {
    manualCurveTeammateModes.clear();
  }

  function toPoints(list: EncounterTimelineEvent[]): LanePoint[] {
    return list.map((ev) => ({ timeMs: clampEventOffsetMs(ev), event: ev }));
  }

  let lanes = $derived.by<Lane[]>(() => {
    const result: Lane[] = [];
    // One lane per boss caster, ordered by its first cast so the boss that
    // engages first sits on top.
    const bossCasters = [...bossEventsByCaster].sort(
      (a, b) => (a[1][0]?.tsOffsetMs ?? 0) - (b[1][0]?.tsOffsetMs ?? 0),
    );
    for (const [casterUuid, list] of bossCasters) {
      result.push({
        key: `boss-${casterUuid}`,
        type: "boss",
        name:
          bossNameByUuid.get(casterUuid) ?? t("history.timeline.lanes.boss"),
        points: toPoints(list),
      });
    }
    if (localPlayer) {
      result.push({
        key: "mine",
        type: "mine",
        player: localPlayer,
        points: toPoints(
          playerEventsByCaster.get(localPlayer.entityUuid) ?? [],
        ),
      });
    }
    for (const player of selectedTeammates) {
      result.push({
        key: `teammate-${player.entityUuid}`,
        type: "teammate",
        player,
        points: toPoints(playerEventsByCaster.get(player.entityUuid) ?? []),
      });
    }
    return result;
  });

  // ---- Buff rows ------------------------------------------------------------
  const buffLanes = $derived(buffTimeline?.lanes ?? []);

  /** Players owning at least one buff lane, in `players` order. */
  const buffOwners = $derived.by(() => {
    const ownerUuids = new Set(buffLanes.map((lane) => lane.entityUuid));
    return players.filter((player) => ownerUuids.has(player.entityUuid));
  });

  /** Default buff owners: the local player, when they carry watched buffs. */
  const defaultBuffOwnerUuids = $derived(
    buffOwners.filter((p) => p.isLocalPlayer).map((p) => p.entityUuid),
  );

  // Collapsed by default with the local player preselected; independent of
  // the lane picker.
  const buffView = new BuffViewState(() => defaultBuffOwnerUuids);

  const buffTracks = $derived(
    buffView.expanded
      ? buildBuffTracks(
          buffLanes,
          buffOwners.filter((p) => buffView.owners.has(p.entityUuid)),
          buffView.grouping,
        )
      : [],
  );

  /** Gaps outside the active-combat window the coverage percent uses. */
  const inactiveSpans = $derived(
    complementSpans(buffTimeline?.activeSpans ?? [], chartDurationMs),
  );

  function buffCoveragePct(lane: TimelineBuffLane): number | null {
    if (buffRangeCoverage) return buffRangeCoverage.get(lane.key) ?? null;
    return lane.coveragePct;
  }

  const tracks = $derived<TimelineTrack[]>([
    ...lanes.map((lane) => ({ kind: "cast" as const, key: lane.key, lane })),
    ...buffTracks,
  ]);

  // ---- Layout / viewport ----------------------------------------------------
  // Seeded once from the initial value (avoids a [0, 1] first frame); the
  // effect below keeps it in sync as `chartDurationMs` changes thereafter.
  const viewport = new TimelineViewport(untrack(() => chartDurationMs));

  // Discrete zoom tier (0/1/2), stepped rather than continuous so the panel
  // only reflows when the viewport crosses a threshold instead of on every
  // wheel tick. Drives `laneH`/`iconSize` growth; see timeline-layout.ts.
  let zoomTier = $derived(zoomTierFor(viewport.durationMs, viewport.spanMs));
  // Draft heights live only while a resize handle is dragged, so pointermove
  // does not write SETTINGS (and trigger saveOnChange) on every pixel.
  let draftLaneH = $state<number | null>(null);
  let draftCurveH = $state<number | null>(null);
  let laneDrag: { startY: number; startLanesHeight: number } | null = null;
  let curveDrag: { startY: number; startCurveH: number } | null = null;

  const persistedLaneH = $derived(
    SETTINGS.history.general.state.timelineLaneH ?? DEFAULT_LANE_H,
  );
  const persistedCurveH = $derived(
    SETTINGS.history.general.state.timelineCurveH ?? DEFAULT_CURVE_H,
  );
  const instantWindowMs = $derived(
    clampInstantDpsWindowSec(
      SETTINGS.history.general.state.instantDpsWindowSec,
    ) * 1_000,
  );
  const baseLaneH = $derived(draftLaneH ?? persistedLaneH);
  const baseCurveH = $derived(draftCurveH ?? persistedCurveH);
  const layout = $derived(
    computeTimelineLayout(tracks, zoomTier, {
      laneH: baseLaneH,
      curveH: baseCurveH,
    }),
  );
  const castRows = $derived(
    layout.rows.filter(
      (row): row is Extract<TimelineRow, { kind: "cast" }> =>
        row.kind === "cast",
    ),
  );
  const buffRows = $derived(
    layout.rows.filter(
      (row): row is Extract<TimelineRow, { kind: "buff" }> =>
        row.kind === "buff",
    ),
  );

  function beginLaneResize(clientY: number) {
    laneDrag = { startY: clientY, startLanesHeight: layout.lanesHeight };
    draftLaneH = persistedLaneH;
  }

  function moveLaneResize(clientY: number) {
    const castCount = layout.castCount;
    if (!laneDrag || castCount === 0) return;
    const nextLanesHeight = Math.max(
      castCount,
      laneDrag.startLanesHeight + (clientY - laneDrag.startY),
    );
    draftLaneH = displayedLaneHToBase(nextLanesHeight / castCount, zoomTier);
  }

  function endLaneResize() {
    if (draftLaneH !== null) {
      SETTINGS.history.general.state.timelineLaneH = draftLaneH;
    }
    draftLaneH = null;
    laneDrag = null;
  }

  function resetLaneHeight() {
    SETTINGS.history.general.state.timelineLaneH = DEFAULT_LANE_H;
    draftLaneH = null;
    laneDrag = null;
  }

  function beginCurveResize(clientY: number) {
    curveDrag = { startY: clientY, startCurveH: layout.curveH };
    draftCurveH = persistedCurveH;
  }

  function moveCurveResize(clientY: number) {
    if (!curveDrag) return;
    draftCurveH = clampCurveH(
      curveDrag.startCurveH + (clientY - curveDrag.startY),
    );
  }

  function endCurveResize() {
    if (draftCurveH !== null) {
      SETTINGS.history.general.state.timelineCurveH = draftCurveH;
    }
    draftCurveH = null;
    curveDrag = null;
  }

  function resetCurveHeight() {
    SETTINGS.history.general.state.timelineCurveH = DEFAULT_CURVE_H;
    draftCurveH = null;
    curveDrag = null;
  }

  // `chart` only changes when a different encounter is loaded (range)
  // recounts reuse the same full-encounter chart), so this effectively
  // resets zoom/pan on encounter switches without fighting user interaction.
  $effect(() => {
    viewport.setDuration(chartDurationMs);
  });

  let showAverageCurve = $state(true);
  let hoverPoint = $state<TimelineHoverPoint | null>(null);
  let brushPreviewMs = $state<[number, number] | null>(null);
  let plotWidthPx = $state(0);

  // Curves are viewport products, not encounter-sized caches. Each sample is
  // an exact read from the immutable hit index and there is at most one
  // interval per CSS pixel (with a hard ceiling in sampleDpsCurve).
  const mineInstantCurve = $derived.by(() =>
    mineHits
      ? sampleDpsCurve(
          mineHits,
          "instant",
          viewport.startMs,
          viewport.endMs,
          plotWidthPx,
          instantWindowMs,
        )
      : null,
  );
  const mineAverageCurve = $derived.by(() =>
    mineHits
      ? sampleDpsCurve(
          mineHits,
          "average",
          viewport.startMs,
          viewport.endMs,
          plotWidthPx,
          instantWindowMs,
        )
      : null,
  );
  const mineOverviewCurve = $derived.by(() =>
    mineHits
      ? sampleDpsCurve(
          mineHits,
          "instant",
          0,
          chartDurationMs,
          160,
          instantWindowMs,
        )
      : null,
  );

  let selectedTeammateCurves = $derived.by<TimelineTeammateCurve[]>(() => {
    const byUuid = new Map(
      curveTeammates.map((player) => [player.entityUuid, player]),
    );
    return teammateDpsSources(
      selectedCurveTeammateModes,
      perEntityHits,
    ).flatMap((row) => {
      const player = byUuid.get(row.entityUuid);
      if (!player) return [];
      return [
        {
          entityUuid: row.entityUuid,
          name: player.name,
          color: playerColor(player),
          mode: row.mode,
          hits: row.hits,
          curve: sampleDpsCurve(
            row.hits,
            row.mode,
            viewport.startMs,
            viewport.endMs,
            plotWidthPx,
            instantWindowMs,
          ),
        },
      ];
    });
  });

  // Created once: the options object's accessors close over the component's
  // reactive bindings directly, so the attachment's pointer/wheel listeners
  // are wired up exactly once per mount instead of on every re-render.
  const gestureAttachment = timelineGestures({
    getViewport: () => viewport,
    getSelectionEnabled: () => selectionEnabled,
    onBrushPreview: (range) => {
      brushPreviewMs = range;
    },
    onSelectRange: (range) => {
      selectedRange = range;
    },
    onHover: (point) => {
      hoverPoint = point;
    },
  });

  function zoomToSelection() {
    if (selectedRange) viewport.zoomToRange(selectedRange);
  }

  // ---- Icon prewarm -----------------------------------------------------
  // zrender repaints once each marker image finishes loading; warming icon
  // URLs up front just removes the first-frame flicker for canvas rendering
  // and is a cheap no-op for the DOM `<img>` markers.
  const warmedIconUrls = new SvelteSet<string>();
  $effect(() => {
    for (const ev of events) {
      const iconPath = resolveEvent(ev).iconPath;
      if (iconPath === null || warmedIconUrls.has(iconPath)) continue;
      warmedIconUrls.add(iconPath);
      const img = new Image();
      img.src = iconPath;
    }
  });

  // Clear the visual brush preview if the parent resets the selection
  // externally (e.g. switching encounters).
  $effect(() => {
    if (selectedRange === null) brushPreviewMs = null;
  });
</script>

<!-- Fixed dark "chart island": interior colors are intentionally decoupled
     from the app theme; only the outer border follows the theme. -->
<div
  class="tl-panel border-border overflow-hidden rounded-md border"
  style={timelinePaletteCssVars()}
>
  <TimelineHeader
    {showAverageCurve}
    onToggleAverage={() => (showAverageCurve = !showAverageCurve)}
    {teammates}
    {laneSelection}
    {curveTeammates}
    curveTeammateModes={selectedCurveTeammateModes}
    onToggleCurveTeammate={toggleCurveTeammate}
    onSelectAllCurveTeammates={selectAllCurveTeammates}
    onClearCurveTeammates={clearCurveTeammates}
    {buffOwners}
    {buffView}
    buffRowsVisible={buffRows.length > 0}
    showInactiveLegend={buffRows.length > 0 && inactiveSpans.length > 0}
    {viewport}
  />

  <!-- Chart body: one positioned row list (cast lanes, buff rows) above the
       curve, pixel-aligned via the shared layout module. Every layer below
       uses chart-body coordinates. -->
  <div class="relative w-full" style="height: {layout.totalHeight}px">
    <!-- Backdrop layer: local-player row highlight + row separators. -->
    <div class="pointer-events-none absolute inset-0">
      {#each castRows as row (row.key)}
        {#if row.lane.type === "mine"}
          <div
            class="absolute right-0 left-0"
            style="top: {row.top}px; height: {row.height}px;
                   background: rgba(96,165,250,0.06);
                   border-left: 2px solid rgba(96,165,250,0.7)"
          ></div>
        {/if}
        <div
          class="absolute right-0 left-0"
          style="top: {row.top + row.height}px; height: 1px;
                 background: var(--tl-row-line)"
        ></div>
      {/each}
      {#each layout.rows as row (row.key)}
        {#if row.kind === "buff-group"}
          <div
            class="absolute right-0 left-0"
            style="top: {row.top}px; height: 1px;
                   background: var(--tl-row-line)"
          ></div>
        {/if}
      {/each}
    </div>

    <!-- DPS curve (ECharts, non-interactive; the overlay above draws its own
         crosshair/tooltip). Spans the full body width; its internal grid
         reserves the same GUTTER column the lane labels use. -->
    <div
      class="absolute left-0 right-0"
      style="top: {layout.curveTop}px; height: {layout.curveH}px"
    >
      <TimelineCurve
        {mineInstantCurve}
        {mineAverageCurve}
        teammateCurves={selectedTeammateCurves}
        {showAverageCurve}
        startMs={viewport.startMs}
        endMs={viewport.endMs}
        curveH={layout.curveH}
      />
    </div>

    <!-- Row content, within the plot column only (right of the gutter),
         matching the gesture layer's coordinate space below. -->
    <div
      class="absolute top-0"
      style="left: {layout.gutter}px; right: {RIGHT_PADDING}px"
    >
      <TimelineLanes
        rows={castRows}
        startMs={viewport.startMs}
        endMs={viewport.endMs}
        iconSize={layout.iconSize}
        {plotWidthPx}
        {resolveEvent}
      />
      <TimelineBuffTracks
        rows={buffRows}
        buffTop={layout.buffTop}
        buffHeight={layout.buffHeight}
        {inactiveSpans}
        startMs={viewport.startMs}
        endMs={viewport.endMs}
        {plotWidthPx}
      />
    </div>

    <!-- Interactive plot surface: owns every pointer/wheel gesture (zoom,
         pan, brush-select, hover) for every row and the curve below. -->
    <div
      class="absolute top-0 cursor-crosshair"
      style="left: {layout.gutter}px; right: {RIGHT_PADDING}px;
             height: {layout.totalHeight}px"
      bind:clientWidth={plotWidthPx}
      {@attach gestureAttachment}
      role="img"
      aria-label={t("history.timeline.chartAriaLabel")}
    >
      <TimelineOverlay
        rows={layout.rows}
        startMs={viewport.startMs}
        endMs={viewport.endMs}
        {hoverPoint}
        {brushPreviewMs}
        selectedRange={selectionEnabled ? selectedRange : null}
        {mineHits}
        teammateCurves={selectedTeammateCurves}
        {showAverageCurve}
        {resolveEvent}
        {inactiveSpans}
        {buffCoveragePct}
      />
    </div>

    <TimelineGutter
      rows={layout.rows}
      gutter={layout.gutter}
      {plotWidthPx}
      {buffCoveragePct}
    />

    {#if layout.castCount > 0}
      <div
        class="absolute right-0 left-0"
        style="top: {layout.laneTop + layout.lanesHeight}px;
               height: {layout.laneGap}px"
      >
        <TimelineResizeHandle
          ariaLabel={t("history.timeline.resize.lane")}
          onDragStart={beginLaneResize}
          onDrag={moveLaneResize}
          onDragEnd={endLaneResize}
          onReset={resetLaneHeight}
        />
      </div>
    {/if}
    <div
      class="absolute right-0 left-0"
      style="top: {layout.totalHeight - 8}px; height: 8px"
    >
      <TimelineResizeHandle
        ariaLabel={t("history.timeline.resize.curve")}
        onDragStart={beginCurveResize}
        onDrag={moveCurveResize}
        onDragEnd={endCurveResize}
        onReset={resetCurveHeight}
      />
    </div>
  </div>

  <!-- Minimap: full-encounter overview + draggable/resizable viewport. -->
  <div
    class="px-3 py-2"
    style="padding-left: {layout.gutter}px; padding-right: {RIGHT_PADDING}px;
           border-top: 1px solid var(--tl-row-line)"
  >
    <!-- The minimap is a navigation strip, so it shows the instant curve: its
         burst peaks are landmarks you can steer by, whereas the cumulative
         average flattens into a shape with nothing to aim at. It also keeps
         the minimap blue, matching the series it now actually draws. -->
    <TimelineMinimap
      {viewport}
      curve={mineOverviewCurve}
      selectedRange={selectionEnabled ? selectedRange : null}
    />
  </div>

  <!-- Selection bar: active brush range + zoom-to-selection + clear. -->
  {#if selectionEnabled && selectedRange}
    <div
      class="flex items-center justify-between gap-2 px-3 py-1.5"
      style="border-top: 1px solid var(--tl-row-line); background: rgba(96,165,250,0.05)"
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <Clock3Icon
          class="size-3.5 shrink-0"
          style="color: {TIMELINE_PALETTE.mine}"
        />
        <span class="truncate text-[11px] tabular-nums" style="color: #bfdbfe">
          {t("history.timeline.selection.label", {
            start: formatTimeMs(selectedRange[0], true),
            end: formatTimeMs(selectedRange[1], true),
            duration: formatTimeMs(selectedRange[1] - selectedRange[0], true),
          })}
        </span>
        {#if selectionPending}
          <span
            class="flex shrink-0 items-center gap-1 text-[10px]"
            style="color: var(--tl-fg-muted)"
          >
            <LoaderCircleIcon class="size-3 animate-spin" />
            {t("history.detail.loading")}
          </span>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          class="flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors duration-150 hover:bg-blue-400/15"
          style="border-color: rgba(96,165,250,0.4); color: {TIMELINE_PALETTE.mine}"
          onclick={zoomToSelection}
        >
          <ZoomInIcon class="size-3" />
          {t("history.timeline.selection.zoomToRange")}
        </button>
        <button
          type="button"
          class="cursor-pointer rounded border px-2 py-0.5 text-[10px] transition-colors duration-150 hover:bg-blue-400/15"
          style="border-color: rgba(96,165,250,0.4); color: {TIMELINE_PALETTE.mine}"
          onclick={() => (selectedRange = null)}
        >
          {t("history.timeline.selection.clear")}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .tl-panel {
    background: var(--tl-bg);
  }
</style>
