<script lang="ts">
  // Header bar: curve legend toggles, viewport indicator/reset, the
  // independent lane / curve selector popovers, and the buff section's
  // collapse toggle (grouping + owner picker appear once it is expanded).
  // Lane teammates and buff owners are separate selections on purpose: many
  // users only want one.
  import ChartLineIcon from "@lucide/svelte/icons/chart-line";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import UserCheckIcon from "@lucide/svelte/icons/user-check";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import { t } from "$lib/i18n/index.svelte";
  import { formatTimeMs } from "./timeline-format";
  import { playerColor } from "./timeline-colors";
  import { TIMELINE_PALETTE } from "./timeline-palette";
  import TimelinePlayerPicker from "./timeline-player-picker.svelte";
  import type { TeammateCurveMode } from "./timeline-data";
  import type {
    BuffViewState,
    PlayerSelection,
  } from "./timeline-selection.svelte";
  import type { TimelineViewport } from "./timeline-viewport.svelte";
  import type { BuffGrouping, TimelinePlayerMeta } from "./timeline-types";

  type Props = {
    showAverageCurve: boolean;
    onToggleAverage: () => void;
    teammates: TimelinePlayerMeta[];
    laneSelection: PlayerSelection;
    curveTeammates: TimelinePlayerMeta[];
    curveTeammateModes: ReadonlyMap<string, TeammateCurveMode>;
    onToggleCurveTeammate: (entityUuid: string) => void;
    onSelectAllCurveTeammates: () => void;
    onClearCurveTeammates: () => void;
    /** Players owning buff lanes; empty hides every buff control. */
    buffOwners: TimelinePlayerMeta[];
    buffView: BuffViewState;
    /** Whether any buff rows are on screen (grouping toggle). */
    buffRowsVisible: boolean;
    showInactiveLegend: boolean;
    viewport: TimelineViewport;
  };

  let {
    showAverageCurve,
    onToggleAverage,
    teammates,
    laneSelection,
    curveTeammates,
    curveTeammateModes,
    onToggleCurveTeammate,
    onSelectAllCurveTeammates,
    onClearCurveTeammates,
    buffOwners,
    buffView,
    buffRowsVisible,
    showInactiveLegend,
    viewport,
  }: Props = $props();

  const groupingOptions = $derived<{ value: BuffGrouping; label: string }[]>([
    { value: "player", label: t("history.timeline.buff.groupByPlayer") },
    { value: "buff", label: t("history.timeline.buff.groupByBuff") },
  ]);

  const selectedCurveTeammates = $derived(
    curveTeammates.filter((player) =>
      curveTeammateModes.has(player.entityUuid),
    ),
  );
  const selectedCurveTeammateUuids = $derived([...curveTeammateModes.keys()]);
</script>

<div class="tl-header flex items-center justify-between gap-2 px-3 py-1.5">
  <div class="flex min-w-0 flex-wrap items-center gap-1">
    <span class="flex items-center gap-1.5 rounded px-1.5 py-0.5">
      <span
        class="size-1.5 shrink-0 rounded-full"
        style="background: {TIMELINE_PALETTE.mine}; box-shadow: 0 0 5px {TIMELINE_PALETTE.mine}"
      ></span>
      <span class="text-[10px] font-medium" style="color: var(--tl-fg)">
        {t("history.timeline.series.instant")}
      </span>
    </span>
    <button
      type="button"
      class="tl-chip flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 transition-opacity duration-150 {showAverageCurve
        ? ''
        : 'opacity-40'}"
      onclick={onToggleAverage}
    >
      <span
        class="size-1.5 shrink-0 rounded-full"
        style="background: {TIMELINE_PALETTE.average}"
      ></span>
      <span class="text-[10px]" style="color: var(--tl-fg-muted)">
        {t("history.timeline.series.average")}
      </span>
    </button>
    {#each selectedCurveTeammates as player (player.entityUuid)}
      {@const mode = curveTeammateModes.get(player.entityUuid)}
      <button
        type="button"
        class="tl-chip flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5"
        title={mode === "instant"
          ? t("history.timeline.curves.modeInstant")
          : t("history.timeline.curves.modeAverage")}
        onclick={() => onToggleCurveTeammate(player.entityUuid)}
      >
        {#if mode === "instant"}
          <ZapIcon
            class="size-2.5 shrink-0"
            style="color: {playerColor(player)}"
            fill="currentColor"
          />
        {:else}
          <span
            class="size-1.5 shrink-0 rounded-full"
            style="background: {playerColor(player)}"
          ></span>
        {/if}
        <span
          class="max-w-20 truncate text-[10px]"
          style="color: {playerColor(player)}"
        >
          {player.name}
        </span>
      </button>
    {/each}
    {#if showInactiveLegend}
      <span class="flex items-center gap-1.5 rounded px-1.5 py-0.5">
        <span
          class="h-2.5 w-3.5 shrink-0 rounded-sm"
          style="background: var(--tl-inactive-hatch); outline: 1px solid var(--tl-row-line)"
        ></span>
        <span class="text-[10px]" style="color: var(--tl-fg-muted)">
          {t("history.timeline.buff.inactiveLegend")}
        </span>
      </span>
    {/if}
    <span class="text-[10px]" style="color: var(--tl-fg-muted)">
      {t("history.timeline.hint.gestures")}
    </span>

    {#if viewport.isZoomed}
      <span
        class="ml-1 flex items-center gap-1.5 rounded px-1.5 py-0.5 tabular-nums"
        style="color: var(--tl-fg-muted)"
      >
        <span class="text-[10px]">
          {t("history.timeline.zoom.windowLabel", {
            start: formatTimeMs(viewport.startMs),
            end: formatTimeMs(viewport.endMs),
            duration: formatTimeMs(viewport.durationMs),
          })}
        </span>
      </span>
      <button
        type="button"
        class="tl-chip flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5"
        style="color: var(--tl-fg-muted)"
        onclick={() => viewport.reset()}
        title={t("history.timeline.zoom.reset")}
      >
        <RotateCcwIcon class="size-3 shrink-0" />
        <span class="text-[10px]">{t("history.timeline.zoom.reset")}</span>
      </button>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-1">
    <TimelinePlayerPicker
      label={t("history.timeline.curves.selectTeammates")}
      closeAriaLabel={t("history.timeline.curves.closeSelector")}
      selectAllLabel={t("history.timeline.curves.selectAll")}
      clearAllLabel={t("history.timeline.curves.clearAll")}
      players={curveTeammates}
      selectedUuids={selectedCurveTeammateUuids}
      modes={curveTeammateModes}
      onToggle={onToggleCurveTeammate}
      onSelectAll={onSelectAllCurveTeammates}
      onClear={onClearCurveTeammates}
    >
      {#snippet icon()}
        <ChartLineIcon class="size-3 shrink-0" />
      {/snippet}
    </TimelinePlayerPicker>
    <TimelinePlayerPicker
      label={t("history.timeline.lanes.selectTeammates")}
      closeAriaLabel={t("history.timeline.lanes.closeSelector")}
      selectAllLabel={t("history.timeline.lanes.selectAll")}
      clearAllLabel={t("history.timeline.lanes.clearAll")}
      players={teammates}
      selectedUuids={laneSelection.uuids}
      onToggle={(uuid) => laneSelection.toggle(uuid)}
      onSelectAll={() =>
        laneSelection.setAll(teammates.map((player) => player.entityUuid))}
      onClear={() => laneSelection.clear()}
    >
      {#snippet icon()}
        <UsersIcon class="size-3 shrink-0" />
      {/snippet}
    </TimelinePlayerPicker>
    {#if buffOwners.length > 0}
      <button
        type="button"
        class="tl-chip flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors duration-150"
        style="color: {buffView.expanded ? 'var(--tl-fg)' : 'var(--tl-fg-muted)'}"
        aria-expanded={buffView.expanded}
        aria-label={t("history.timeline.buff.toggle")}
        onclick={() => buffView.toggleExpanded()}
      >
        <span
          class="tl-disclosure"
          class:tl-disclosure-open={buffView.expanded}
          aria-hidden="true"
        ></span>
        <SparklesIcon class="size-3 shrink-0" />
        <span>{t("history.timeline.buff.title")}</span>
      </button>
      {#if buffView.expanded}
        {#if buffRowsVisible}
          <div
            class="tl-segmented flex items-center rounded"
            role="group"
            aria-label={t("history.timeline.buff.title")}
          >
            {#each groupingOptions as option (option.value)}
              <button
                type="button"
                class="cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors duration-150"
                class:tl-segmented-active={buffView.grouping === option.value}
                aria-pressed={buffView.grouping === option.value}
                onclick={() => (buffView.grouping = option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
        <TimelinePlayerPicker
          label={t("history.timeline.buff.players")}
          closeAriaLabel={t("history.timeline.buff.playerPicker")}
          selectAllLabel={t("history.timeline.lanes.selectAll")}
          clearAllLabel={t("history.timeline.lanes.clearAll")}
          players={buffOwners}
          selectedUuids={buffView.owners.uuids}
          onToggle={(uuid) => buffView.owners.toggle(uuid)}
          onSelectAll={() =>
            buffView.owners.setAll(
              buffOwners.map((player) => player.entityUuid),
            )}
          onClear={() => buffView.owners.clear()}
        >
          {#snippet icon()}
            <UserCheckIcon class="size-3 shrink-0" />
          {/snippet}
        </TimelinePlayerPicker>
      {/if}
    {/if}
  </div>
</div>

<style>
  .tl-header {
    background: var(--tl-header-bg);
    border-bottom: 1px solid var(--tl-row-line);
  }

  .tl-chip:hover {
    background: rgba(148, 163, 184, 0.1);
  }

  .tl-disclosure {
    display: inline-block;
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 5px solid currentColor;
    opacity: 0.65;
    transition: transform 120ms ease;
  }

  .tl-disclosure-open {
    transform: rotate(90deg);
  }

  .tl-segmented {
    border: 1px solid var(--tl-row-line);
    padding: 1px;
  }

  .tl-segmented button {
    color: var(--tl-fg-muted);
  }

  .tl-segmented button:hover {
    color: var(--tl-fg);
  }

  .tl-segmented button.tl-segmented-active {
    background: rgba(148, 163, 184, 0.16);
    color: var(--tl-fg);
  }
</style>
