<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { ModuleSolution } from "$lib/api";

  let {
    solutions = [],
    onview,
  }: {
    solutions: ModuleSolution[];
    onview?: (solution: ModuleSolution) => void;
  } = $props();
</script>

{#if !solutions.length}
  <div class="text-sm text-muted-foreground">No results yet</div>
{:else}
  <div class="overflow-x-auto rounded-lg border border-border/60">
    <table class="min-w-full text-sm">
      <thead class="bg-muted/40 text-muted-foreground">
        <tr>
          <th class="px-3 py-2 text-left">Rank</th>
          <th class="px-3 py-2 text-left">Score</th>
          <th class="px-3 py-2 text-left">Attribute Breakdown</th>
          <th class="px-3 py-2 text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each solutions as sol, idx}
          <tr class="border-t border-border/40">
            <td class="px-3 py-2">{idx + 1}</td>
            <td class="px-3 py-2">{sol.score}</td>
            <td class="px-3 py-2 whitespace-pre-wrap">
              {Object.entries(sol.attr_breakdown)
                .map(([k, v]) => `${k}+${v}`)
                .join(", ")}
            </td>
            <td class="px-3 py-2">
              <Button size="sm" variant="outline" onclick={() => onview?.(sol)}>View</Button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
