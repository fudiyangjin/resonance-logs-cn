<script lang="ts">
  /**
   * @file One saved encounter in the live history picker: a compact two-line
   * card sized for the narrow live window.
   */
  import StarIcon from "virtual:icons/lucide/star";
  import LoaderCircleIcon from "virtual:icons/lucide/loader-circle";
  import type { EncounterSummaryDto } from "$lib/bindings";
  import { t } from "$lib/i18n/index.svelte";
  import { formatEncounterDuration } from "$lib/live-history-query";
  import { CLASS_MAP, getClassIcon, tooltip } from "$lib/utils.svelte";
  import {
    encounterBossLabel,
    encounterSceneLabel,
    formatEncounterTime,
  } from "./encounter-labels";

  const MAX_CLASS_ICONS = 6;

  let {
    summary,
    active,
    pending,
    onSelect,
  }: {
    summary: EncounterSummaryDto;
    /** The encounter currently displayed in the live window. */
    active: boolean;
    pending: boolean;
    onSelect: (summary: EncounterSummaryDto) => void;
  } = $props();

  const available = $derived(summary.detailAvailable);
  const boss = $derived(encounterBossLabel(summary));
  // Known classes first, like the main history list.
  const players = $derived(
    [...summary.players].sort(
      (left, right) => Number(right.classId !== 0) - Number(left.classId !== 0),
    ),
  );
</script>

<!-- aria-disabled instead of disabled so the reason tooltip still shows. -->
<button
  type="button"
  aria-disabled={!available}
  aria-current={active ? "true" : undefined}
  class="relative flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors {available
    ? 'hover:bg-muted/50'
    : 'cursor-not-allowed opacity-45'} {active ? 'bg-amber-500/10' : ''}"
  onclick={() => {
    if (available) onSelect(summary);
  }}
  {@attach !available &&
    tooltip(() => t("live.history.detailUnavailable"))}
>
  {#if active}
    <span
      class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-amber-500"
      aria-hidden="true"
    ></span>
  {/if}
  <div class="flex min-w-0 items-center gap-1.5 text-xs">
    <span class="text-muted-foreground w-7 shrink-0 tabular-nums"
      >#{summary.displayIndex}</span
    >
    {#if summary.isFavorite}
      <StarIcon class="size-3 shrink-0 fill-current text-yellow-500" />
    {/if}
    <span class="text-foreground min-w-0 shrink truncate font-medium"
      >{encounterSceneLabel(summary)}</span
    >
    {#if boss}
      <span class="text-muted-foreground min-w-0 shrink-[2] truncate"
        >· {boss}</span
      >
    {/if}
    <span class="text-foreground/90 ml-auto shrink-0 pl-1 tabular-nums">
      {#if pending}
        <LoaderCircleIcon class="size-3.5 animate-spin" />
      {:else}
        {formatEncounterDuration(summary.duration)}
      {/if}
    </span>
  </div>
  <div class="flex min-w-0 items-center gap-1.5 pl-[34px]">
    <div class="flex shrink-0 items-center gap-0.5">
      {#each players.slice(0, MAX_CLASS_ICONS) as player, index (index)}
        <img
          class="size-4 shrink-0 object-contain"
          src={getClassIcon(CLASS_MAP[player.classId] ?? "")}
          alt={t("live.table.classIconAlt")}
          {@attach tooltip(() => player.name)}
        />
      {/each}
      {#if players.length > MAX_CLASS_ICONS}
        <span class="text-muted-foreground text-[10px]"
          >+{players.length - MAX_CLASS_ICONS}</span
        >
      {/if}
    </div>
    {#if summary.note}
      <span
        class="text-muted-foreground min-w-0 truncate text-[10px] italic"
        title={summary.note}>{summary.note}</span
      >
    {/if}
    <span class="text-muted-foreground ml-auto shrink-0 text-[10px] tabular-nums"
      >{formatEncounterTime(summary.startedAtMs)}</span
    >
  </div>
</button>
