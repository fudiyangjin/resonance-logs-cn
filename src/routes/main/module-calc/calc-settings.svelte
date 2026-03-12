<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";

  let {
    useGpu = $bindable(true),
    gpuSupport = $bindable<{ cuda_available: boolean; opencl_available: boolean } | null>(null),
  } = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
  <div class="text-base font-semibold text-foreground">Calculation Settings</div>
  <div class="flex items-center gap-3">
    <Switch bind:checked={useGpu} />
    <div class="text-sm text-foreground">GPU Acceleration</div>
    {#if gpuSupport}
      <div class="text-xs text-muted-foreground">
        CUDA: {gpuSupport.cuda_available ? "Available" : "Unavailable"} · OpenCL: {gpuSupport.opencl_available ? "Available" : "Unavailable"}
      </div>
    {/if}
  </div>
</div>

