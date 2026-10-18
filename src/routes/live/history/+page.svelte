<script lang="ts">
  /**
   * @file History picker inside the live window. Choosing an encounter
   * displays it through the live tables; the banner then offers older /
   * newer stepping and the way back to live data.
   */
  import { onMount } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { goto } from "$app/navigation";
  import type { EncounterSummaryDto } from "$lib/bindings";
  import { t } from "$lib/i18n/index.svelte";
  import {
    groupRowsByLocalDay,
    hasLiveHistoryFilters,
  } from "$lib/live-history-query";
  import { liveHistoryQuery as query } from "$lib/stores/live-history-query.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import { formatDayHeading } from "./encounter-labels";
  import HistoryEncounterRow from "./history-encounter-row.svelte";
  import HistorySearch from "./history-search.svelte";

  let openError = $state<string | null>(null);

  const groups = $derived(groupRowsByLocalDay(query.rows, Date.now()));
  const activeEncounterId = $derived(liveView.history?.encounterId ?? null);

  onMount(() => {
    void query.ensureOptions();
    void query.reload();
  });

  function back() {
    void goto(liveView.returnTab);
  }

  async function select(summary: EncounterSummaryDto) {
    openError = null;
    const result = await liveView.open(summary);
    if (result.status === "opened") {
      await goto(liveView.returnTab);
    } else if (result.status === "failed") {
      openError = result.message;
    }
  }

  // Re-created per loaded page (the argument changes), so a sentinel that is
  // still visible after a short page triggers the next load as well.
  function loadMoreWhenVisible(loadedCount: number): Attachment<HTMLElement> {
    return (node) => {
      void loadedCount;
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void query.loadMore();
        }
      });
      observer.observe(node);
      return () => observer.disconnect();
    };
  }
</script>

<div class="flex min-h-full flex-col">
  <HistorySearch onBack={back} />

  {#if openError || query.errorMessage}
    <div class="text-destructive px-3 pt-1.5 text-[11px]">
      {openError ?? query.errorMessage}
    </div>
  {/if}

  <div class="flex flex-col px-1 pb-2">
    {#each groups as group (group.key)}
      <div
        class="text-muted-foreground px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider"
      >
        {formatDayHeading(group.kind, group.dayMs)}
      </div>
      {#each group.rows as summary (summary.id)}
        <HistoryEncounterRow
          {summary}
          active={activeEncounterId === summary.id}
          pending={liveView.pendingEncounterId === summary.id}
          onSelect={select}
        />
      {/each}
    {:else}
      <div
        class="text-muted-foreground flex flex-col items-center gap-2 px-3 py-6 text-xs"
      >
        {#if query.loading || query.status === "idle"}
          {t("live.history.loading")}
        {:else if query.status === "ready" && hasLiveHistoryFilters(query.filters)}
          <span>{t("live.history.emptyFiltered")}</span>
          <button
            type="button"
            class="text-foreground hover:bg-popover/60 rounded-md border px-2 py-1 text-[11px] transition-colors"
            onclick={() => query.clearFilters()}
          >
            {t("live.history.filter.clear")}
          </button>
        {:else if query.status === "ready"}
          {t("live.history.empty")}
        {/if}
      </div>
    {/each}

    {#if query.hasMore}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground mx-auto mt-1 px-3 py-1 text-[11px] transition-colors"
        disabled={query.loading}
        onclick={() => query.loadMore()}
        {@attach loadMoreWhenVisible(query.rows.length)}
      >
        {query.loading
          ? t("live.history.loading")
          : t("live.history.loadMore", {
              loaded: String(query.rows.length),
              total: String(query.totalCount),
            })}
      </button>
    {/if}
  </div>
</div>
