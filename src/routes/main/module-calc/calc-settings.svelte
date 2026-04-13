<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";
  import { Button } from "$lib/components/ui/button";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveModuleCalcTranslation } from "$lib/i18n";

  function t(key: string, fallback: string): string {
    return resolveModuleCalcTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function supportStatusLabel(isAvailable: boolean): string {
    return isAvailable
      ? t("available", "可用")
      : t("unavailable", "不可用");
  }

  let {
    useGpu = $bindable(true),
    gpuSupport = $bindable<{ cuda_available: boolean; opencl_available: boolean } | null>(null),
    combinationSize = $bindable<4 | 5>(4),
  } = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
  <div class="text-base font-semibold text-foreground">
    {t("calcSettings", "计算设置")}
  </div>

  <div class="space-y-2">
    <div class="text-sm text-foreground">
      {t("moduleCount", "模组数量")}
    </div>

    <div class="flex items-center gap-2">
      <Button
        type="button"
        variant={combinationSize === 4 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 4)}
      >
        {t("modules4", "4 模组")}
      </Button>

      <Button
        type="button"
        variant={combinationSize === 5 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 5)}
      >
        {t("modules5", "5 模组")}
      </Button>
    </div>
  </div>

  <div class="flex items-center gap-3">
    <Switch bind:checked={useGpu} />

    <div class="text-sm text-foreground">
      {t("gpuAcceleration", "GPU 加速")}
    </div>

    {#if gpuSupport}
      <div class="space-y-1 text-xs leading-tight text-muted-foreground">
        <div>
          {t("gpu.cuda", "CUDA")}: {supportStatusLabel(gpuSupport.cuda_available)}
        </div>
        <div>
          {t("gpu.opencl", "OpenCL")}: {supportStatusLabel(gpuSupport.opencl_available)}
        </div>
      </div>
    {/if}
  </div>
</div>
