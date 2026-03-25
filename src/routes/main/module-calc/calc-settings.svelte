<script lang="ts">
  import { tl } from "$lib/i18n/index.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Button } from "$lib/components/ui/button";

  let {
    useGpu = $bindable(true),
    gpuSupport = $bindable<{ cuda_available: boolean; opencl_available: boolean } | null>(null),
    combinationSize = $bindable<4 | 5>(4),
  } = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
  <div class="text-base font-semibold text-foreground">{tl("Calculation Settings")}</div>
  <div class="space-y-2">
    <div class="text-sm text-foreground">{tl("Module Count")}</div>
    <div class="flex items-center gap-2">
      <Button
        type="button"
        variant={combinationSize === 4 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 4)}
      >
        {tl("4 Modules")}
      </Button>
      <Button
        type="button"
        variant={combinationSize === 5 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 5)}
      >
        {tl("5 Modules")}
      </Button>
    </div>
  </div>
  <div class="flex items-center gap-3">
    <Switch bind:checked={useGpu} />
    <div class="text-sm text-foreground">{tl("GPU Acceleration")}</div>
    {#if gpuSupport}
      <div class="text-xs text-muted-foreground">
        CUDA: {gpuSupport.cuda_available ? tl("Available") : tl("Unavailable")} · OpenCL: {gpuSupport.opencl_available ? tl("Available") : tl("Unavailable")}
      </div>
    {/if}
  </div>
</div>

