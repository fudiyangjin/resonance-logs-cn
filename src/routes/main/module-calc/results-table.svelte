<script lang="ts">
  import { tl } from "$lib/i18n/index.svelte";
  import { Button } from "$lib/components/ui/button";
  import type { ModuleSolution } from "$lib/api";
  import AttrBadge, { sortAttrEntries } from "./attr-badge.svelte";

  let {
    solutions = [],
    onview,
  }: {
    solutions: ModuleSolution[];
    onview?: (solution: ModuleSolution) => void;
  } = $props();
</script>

{#if !solutions.length}
  <div class="text-sm text-muted-foreground">{tl("No results yet")}</div>
{:else}
  <div class="space-y-3">
    {#each solutions as sol, idx}
      {@const attrs = sortAttrEntries(Object.entries(sol.attr_breakdown))}
      <article
        class={`rounded-xl border p-4 transition-all duration-200 ${idx === 0
          ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border/60 bg-card/50 hover:border-primary/30 hover:bg-card/80"}`}
      >
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div class="flex items-center gap-4 xl:w-52 xl:flex-none">
            <div
              class={`flex size-12 items-center justify-center rounded-2xl text-lg font-semibold ${idx === 0
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-foreground"}`}
            >
              {idx + 1}
            </div>
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {tl("Solution Score")}
              </div>
              <div class="mt-1 text-2xl font-semibold text-foreground">{sol.score}</div>
            </div>
          </div>

          <div class="grid flex-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {#each attrs as [name, value]}
              <AttrBadge {name} {value} compact />
            {/each}
          </div>

          <div class="xl:flex-none xl:self-stretch">
            <div class="flex h-full items-center xl:justify-end">
              <Button
                size="sm"
                variant={idx === 0 ? "default" : "outline"}
                class="w-full xl:w-auto"
                onclick={() => onview?.(sol)}
              >
                {tl("View Details")}
              </Button>
            </div>
          </div>
        </div>
      </article>
    {/each}
  </div>
{/if}
