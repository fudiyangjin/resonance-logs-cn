<script lang="ts">
  // Buff coverage lanes grouped by selected player. Gutter is 96px so the
  // owner name lives on a header row; each lane only shows the buff name.
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { t } from "$lib/i18n/index.svelte";
  import { tooltip } from "$lib/utils.svelte";
  import { playerColor } from "./timeline-colors";
  import { visibleSpanRects } from "./timeline-data";
  import { formatTimeMs } from "./timeline-format";
  import { RIGHT_PADDING } from "./timeline-layout";
  import TimelinePlayerPicker from "./timeline-player-picker.svelte";
  import type { TimelineBuffLane, TimelinePlayerMeta } from "./timeline-types";

  const LANE_H = 24;
  const GROUP_H = 20;

  type Props = {
    lanes: TimelineBuffLane[];
    players: TimelinePlayerMeta[];
    startMs: number;
    endMs: number;
    gutter: number;
    /** Range-recount coverage percent by lane key; null when no selection. */
    rangeCoverage?: Map<string, number> | null;
    rangePending?: boolean;
  };

  let {
    lanes,
    players,
    startMs,
    endMs,
    gutter,
    rangeCoverage = null,
    rangePending = false,
  }: Props = $props();

  const laneOwners = $derived(
    players.filter((player) =>
      lanes.some((lane) => lane.entityUuid === player.entityUuid),
    ),
  );

  const defaultSelection = $derived(
    laneOwners.filter((p) => p.isLocalPlayer).map((p) => p.entityUuid),
  );

  let expanded = $state(false);
  let manualSelection = $state<string[] | null>(null);
  const selectedUuids = $derived(manualSelection ?? defaultSelection);

  function toggleExpanded() {
    expanded = !expanded;
  }

  function toggle(entityUuid: string) {
    const current = manualSelection ?? [...selectedUuids];
    manualSelection = current.includes(entityUuid)
      ? current.filter((uuid) => uuid !== entityUuid)
      : [...current, entityUuid];
  }

  const playersByUuid = $derived(
    new Map(players.map((player) => [player.entityUuid, player])),
  );

  const visibleGroups = $derived.by(() => {
    const lanesByOwner = new Map<string, TimelineBuffLane[]>();
    for (const lane of lanes) {
      if (!selectedUuids.includes(lane.entityUuid)) continue;
      const owned = lanesByOwner.get(lane.entityUuid) ?? [];
      owned.push(lane);
      lanesByOwner.set(lane.entityUuid, owned);
    }
    return selectedUuids.flatMap((uuid) => {
      const owner = playersByUuid.get(uuid);
      const owned = lanesByOwner.get(uuid);
      if (!owner || !owned?.length) return [];
      return [{ player: owner, lanes: owned }];
    });
  });

  function laneCoveragePct(lane: TimelineBuffLane): number | null {
    if (rangeCoverage) return rangeCoverage.get(lane.key) ?? null;
    return lane.coveragePct;
  }

  function spanTooltip(
    player: TimelinePlayerMeta,
    lane: TimelineBuffLane,
    span: { startMs: number; endMs: number },
  ): string {
    return t("history.timeline.buff.spanTooltip", {
      player: player.name,
      name: lane.buffName,
      start: formatTimeMs(span.startMs, true),
      end: formatTimeMs(span.endMs, true),
      duration: formatTimeMs(span.endMs - span.startMs, true),
    });
  }
</script>

<div class="buff-lanes" style="border-top: 1px solid var(--tl-row-line)">
  <div class="flex items-center justify-between gap-2 px-3 py-1.5">
    <button
      type="button"
      class="flex items-center gap-1.5"
      style="color: var(--tl-fg-muted)"
      aria-expanded={expanded}
      aria-label={t("history.timeline.buff.toggle")}
      onclick={toggleExpanded}
    >
      <span class="disclosure-mark" class:open={expanded} aria-hidden="true"></span>
      <SparklesIcon class="size-3.5" />
      <span class="text-[11px]">{t("history.timeline.buff.title")}</span>
      {#if rangePending}
        <span class="text-[10px]">{t("history.detail.loading")}</span>
      {/if}
    </button>
    {#if expanded}
      <TimelinePlayerPicker
        label={t("history.timeline.buff.playerPicker")}
        closeAriaLabel={t("history.timeline.buff.playerPicker")}
        selectAllLabel={t("history.timeline.lanes.selectAll")}
        clearAllLabel={t("history.timeline.lanes.clearAll")}
        players={laneOwners}
        selectedUuids={selectedUuids}
        onToggle={toggle}
        onSelectAll={() =>
          (manualSelection = laneOwners.map((p) => p.entityUuid))}
        onClear={() => (manualSelection = [])}
        placement="top"
      >
        {#snippet icon()}
          <SparklesIcon class="size-3" />
        {/snippet}
      </TimelinePlayerPicker>
    {/if}
  </div>

  {#if expanded}
  {#if visibleGroups.length === 0}
    <div class="px-3 pb-2 text-[10px]" style="color: var(--tl-fg-muted)">
      {t("history.timeline.buff.empty")}
    </div>
  {:else}
    <div class="pb-1.5">
      {#each visibleGroups as group (group.player.entityUuid)}
        {@const color = playerColor(group.player)}
        <div class="flex items-center" style="height: {GROUP_H}px">
          <div
            class="flex shrink-0 items-center gap-1 overflow-hidden pr-2 pl-2.5"
            style="width: {gutter}px"
            {@attach tooltip(() => group.player.name)}
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              style="background: {color}"
            ></span>
            <span class="truncate text-[10px] font-medium" style="color: {color}">
              {group.player.name}
            </span>
          </div>
        </div>
        {#each group.lanes as lane (lane.key)}
          {@const pct = laneCoveragePct(lane)}
          <div class="flex items-center" style="height: {LANE_H}px">
            <div
              class="flex shrink-0 items-center gap-1 overflow-hidden pr-2 pl-2.5"
              style="width: {gutter}px"
              {@attach tooltip(
                () =>
                  `${group.player.name} · ${lane.buffName} · ${t(
                    "history.timeline.buff.pillTooltip",
                    { count: lane.triggerCount },
                  )}`,
              )}
            >
              <span
                class="min-w-0 flex-1 truncate text-[10px]"
                style="color: var(--tl-fg)"
              >
                {lane.buffName}
              </span>
              <span
                class="shrink-0 text-right text-[10px] font-medium tabular-nums"
                style="color: {color}"
              >
                {pct === null ? "--" : `${pct.toFixed(1)}%`}
              </span>
            </div>
            <div
              class="relative h-full flex-1"
              style="margin-right: {RIGHT_PADDING}px"
            >
              <div
                class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style="background: var(--tl-row-line)"
              ></div>
              {#each visibleSpanRects(lane.spans, startMs, endMs) as rect (rect.startMs)}
                <div
                  class="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
                  style="left: {rect.leftPct}%; width: max(1px, {rect.widthPct}%);
                         background: {color}; opacity: 0.75"
                  {@attach tooltip(() => spanTooltip(group.player, lane, rect))}
                ></div>
              {/each}
            </div>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
  {/if}
</div>

<style>
  button {
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .disclosure-mark {
    display: inline-block;
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 5px solid currentColor;
    opacity: 0.65;
    transition: transform 120ms ease;
  }

  .disclosure-mark.open {
    transform: rotate(90deg);
  }
</style>
