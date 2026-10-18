<script lang="ts">
  /**
   * @file Strip shown while the live window displays a saved encounter:
   * what is shown, older / newer stepping through the picker's results, and
   * the way back to live data (flagged while a live fight is running).
   */
  import HistoryIcon from "virtual:icons/lucide/history";
  import ChevronLeftIcon from "virtual:icons/lucide/chevron-left";
  import ChevronRightIcon from "virtual:icons/lucide/chevron-right";
  import LoaderCircleIcon from "virtual:icons/lucide/loader-circle";
  import { goto } from "$app/navigation";
  import { t } from "$lib/i18n/index.svelte";
  import {
    formatEncounterDuration,
    LIVE_HISTORY_PATH,
    type NeighborDirection,
  } from "$lib/live-history-query";
  import { liveHistoryQuery } from "$lib/stores/live-history-query.svelte";
  import { liveCombatStore } from "$lib/stores/live-topics.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import { tooltip } from "$lib/utils.svelte";
  import {
    encounterBossLabel,
    encounterSceneLabel,
    formatEncounterDay,
    formatEncounterTime,
  } from "./history/encounter-labels";
  import { settleLiveRoute } from "./live-view-navigation";

  const summary = $derived(liveView.history?.summary ?? null);
  const liveFighting = $derived(liveCombatStore.data?.activeSegmentId != null);
  const title = $derived.by(() => {
    if (!summary) return "";
    const boss = encounterBossLabel(summary);
    const scene = encounterSceneLabel(summary);
    return boss ? `${scene} · ${boss}` : scene;
  });
  const canOlder = $derived(
    summary !== null && liveHistoryQuery.hasNeighbor(summary.id, "older"),
  );
  const canNewer = $derived(
    summary !== null && liveHistoryQuery.hasNeighbor(summary.id, "newer"),
  );

  let stepping = $state<NeighborDirection | null>(null);
  let stepError = $state<string | null>(null);

  async function step(direction: NeighborDirection) {
    if (!summary || stepping) return;
    stepping = direction;
    stepError = null;
    try {
      const target = await liveHistoryQuery.neighbor(summary.id, direction);
      if (!target) return;
      const result = await liveView.open(target);
      if (result.status === "opened") {
        await settleLiveRoute();
      } else if (result.status === "failed") {
        stepError = result.message;
      }
    } finally {
      stepping = null;
    }
  }

  async function backToLive() {
    stepError = null;
    liveView.returnToLive();
    await settleLiveRoute();
  }
</script>

{#snippet stepButton(
  direction: NeighborDirection,
  enabled: boolean,
  label: string,
)}
  <button
    class="text-muted-foreground hover:text-foreground hover:bg-popover/60 flex size-5 shrink-0 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-30"
    disabled={!enabled || stepping !== null}
    aria-label={label}
    onclick={() => step(direction)}
    {@attach tooltip(() => label)}
  >
    {#if stepping === direction}
      <LoaderCircleIcon class="size-3.5 animate-spin" />
    {:else if direction === "older"}
      <ChevronLeftIcon class="size-3.5" />
    {:else}
      <ChevronRightIcon class="size-3.5" />
    {/if}
  </button>
{/snippet}

{#if summary}
  <div
    class="mb-1 flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 pr-1 pl-2 text-[11px] leading-none"
    data-tauri-drag-region
  >
    <button
      class="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left"
      onclick={() => goto(LIVE_HISTORY_PATH)}
      {@attach tooltip(() => t("live.history.banner.openPicker"))}
    >
      <HistoryIcon class="size-3.5 shrink-0 text-amber-500" />
      <span class="shrink-0 font-semibold text-amber-500 tabular-nums"
        >#{summary.displayIndex}</span
      >
      <span class="text-foreground min-w-0 truncate font-medium">{title}</span>
      {#if stepError}
        <span class="text-destructive min-w-0 shrink truncate">{stepError}</span>
      {:else}
        <span class="text-muted-foreground shrink-0 tabular-nums">
          {formatEncounterDuration(summary.duration)} · {formatEncounterDay(
            summary.startedAtMs,
          )}
          {formatEncounterTime(summary.startedAtMs)}
        </span>
      {/if}
    </button>

    {@render stepButton("older", canOlder, t("live.history.banner.older"))}
    {@render stepButton("newer", canNewer, t("live.history.banner.newer"))}

    <button
      class="text-foreground hover:bg-popover/60 ml-0.5 flex shrink-0 items-center gap-1.5 self-stretch rounded px-1.5 font-semibold transition-colors"
      onclick={backToLive}
      {@attach tooltip(() =>
        liveFighting
          ? t("live.history.banner.backToLiveFighting")
          : t("live.history.banner.backToLive"),
      )}
    >
      {#if liveFighting}
        <span class="relative flex size-1.5">
          <span
            class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"
          ></span>
          <span class="relative inline-flex size-1.5 rounded-full bg-emerald-500"
          ></span>
        </span>
      {/if}
      <span>{t("live.history.banner.backToLive")}</span>
      {#if liveFighting}
        <span class="font-medium text-emerald-500"
          >{t("live.history.banner.liveFighting")}</span
        >
      {/if}
    </button>
  </div>
{/if}
