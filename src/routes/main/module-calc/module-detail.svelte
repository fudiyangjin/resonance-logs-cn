<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { ModuleSolution } from "$lib/api";

  let { open = $bindable(false), solution = $bindable<ModuleSolution | null>(null) } = $props();
</script>

{#if open && solution}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div class="w-full max-w-3xl rounded-lg border border-border/60 bg-card p-4 shadow-lg space-y-4">
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Solution Details</div>
        <Button size="sm" variant="ghost" onclick={() => (open = false)}>Close</Button>
      </div>

      <div class="text-sm text-muted-foreground">
        Attribute Breakdown:
        {Object.entries(solution.attr_breakdown)
          .map(([k, v]) => `${k}+${v}`)
          .join(", ")}
      </div>

      <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
        {#each solution.modules as mod, idx}
          <div class="rounded-md border border-border/40 p-3 bg-muted/20">
            <div class="flex items-center justify-between text-sm font-semibold">
              <div>{idx + 1}. {mod.name}</div>
              <div class="text-xs text-muted-foreground">Quality: {mod.quality}</div>
            </div>
            <div class="text-xs text-muted-foreground">Config ID: {mod.config_id} · UUID: {mod.uuid}</div>
            <div class="mt-2 text-sm">
              {mod.parts.map((p: { name: string; value: number }) => `${p.name}+${p.value}`).join(", ")}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
