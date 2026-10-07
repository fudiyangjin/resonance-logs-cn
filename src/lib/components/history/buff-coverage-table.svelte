<script lang="ts">
  // Watched-buff × player coverage summary. One row per buff so the name gets
  // a wide, wrapping first column (buff names run long; player names are the
  // short axis). Percentages use the active-combat-window caliber (same as
  // the live HUD and the timeline rows); trigger counts come from the
  // wall-clock span count.
  import { t } from "$lib/i18n/index.svelte";
  import { tooltip } from "$lib/utils.svelte";
  import type {
    HistoryBuffLaneView,
    HistoryBuffTimelineView,
  } from "$lib/history-derived";

  type PlayerInfo = {
    entityUuid: string;
    name: string;
    isLocalPlayer: boolean;
  };

  type Props = {
    view: HistoryBuffTimelineView;
    /** Range-recount view while a selection is active; null otherwise. */
    rangeView?: HistoryBuffTimelineView | null;
    players: PlayerInfo[];
    resolveBuffName: (baseId: number) => string;
  };

  let { view, rangeView = null, players, resolveBuffName }: Props = $props();

  const activeView = $derived(rangeView ?? view);

  const buffIds = $derived([...new Set(view.lanes.map((lane) => lane.baseId))]);

  const owners = $derived.by(() => {
    const ownerUuids = new Set(view.lanes.map((lane) => lane.entityUuid));
    return players.filter((player) => ownerUuids.has(player.entityUuid));
  });

  const laneByKey = $derived(
    new Map(activeView.lanes.map((lane) => [lane.key, lane])),
  );

  function cell(
    entityUuid: string,
    baseId: number,
  ): HistoryBuffLaneView | undefined {
    return laneByKey.get(`${entityUuid}:${baseId}`);
  }
</script>

<details class="border-border/60 overflow-x-auto rounded-lg border">
  <summary
    class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2"
  >
    <span class="flex items-center gap-1.5 text-sm font-medium">
      <span class="disclosure-mark" aria-hidden="true"></span>
      {t("history.buffCoverage.title")}
    </span>
    <span class="text-muted-foreground text-[11px] tabular-nums">
      {rangeView
        ? t("history.buffCoverage.rangeCaption")
        : t("history.buffCoverage.caption", {
            seconds: (view.activeWindowMs / 1000).toFixed(1),
          })}
    </span>
  </summary>
  <table class="w-full border-collapse text-xs">
    <thead>
      <tr class="border-border/60 text-muted-foreground border-t border-b">
        <th class="bg-background sticky left-0 px-3 py-1.5 text-left font-normal">
          {t("history.buffCoverage.buff")}
        </th>
        {#each owners as player (player.entityUuid)}
          <th
            class="max-w-28 truncate px-3 py-1.5 text-right font-normal {player.isLocalPlayer
              ? 'bg-blue-500/5'
              : ''}"
            {@attach tooltip(() => player.name)}
          >
            {player.name}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each buffIds as baseId (baseId)}
        <tr class="border-border/40 border-b last:border-b-0">
          <th
            scope="row"
            class="bg-background sticky left-0 max-w-72 min-w-40 px-3 py-1.5 text-left font-normal break-words whitespace-normal"
            {@attach tooltip(() => `#${baseId}`)}
          >
            {resolveBuffName(baseId)}
          </th>
          {#each owners as player (player.entityUuid)}
            {@const lane = cell(player.entityUuid, baseId)}
            <td
              class="px-3 py-1.5 text-right whitespace-nowrap tabular-nums {player.isLocalPlayer
                ? 'bg-blue-500/5'
                : ''}"
            >
              {#if lane}
                <span class="font-medium">{lane.coveragePct.toFixed(1)}%</span>
                <span class="text-muted-foreground ml-1 text-[10px]">
                  {t("history.buffCoverage.count", {
                    value: lane.triggerCount,
                  })}
                </span>
              {:else}
                <span class="text-muted-foreground">--</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</details>

<style>
  summary::-webkit-details-marker {
    display: none;
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

  details[open] .disclosure-mark {
    transform: rotate(90deg);
  }
</style>
