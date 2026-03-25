<script lang="ts">
  import { tl } from "$lib/i18n/index.svelte";
  import type { ModuleInfo } from "$lib/api";

  let {
    moduleCount = null,
    modules = [],
    minTotalValue = 12,
  }: {
    moduleCount: number | null;
    modules: ModuleInfo[];
    minTotalValue: number;
  } = $props();

  const filteredModuleCount = $derived(
    modules.filter(
      (module) =>
        module.parts.reduce((total, part) => total + part.value, 0) >= minTotalValue
    ).length
  );
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-1">
  <div class="text-base font-semibold text-foreground">{tl("Data Status")}</div>
  <div class="text-sm text-muted-foreground">
    {tl("Module Count")}：{moduleCount ?? tl("Not Synced")}
  </div>
  <div class="text-sm text-muted-foreground">
    {tl("Filtered Total Value")}: {moduleCount === null ? tl("Not Synced") : filteredModuleCount}
  </div>
</div>

