<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";
  import { Button } from "$lib/components/ui/button";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveModuleCalcTranslation } from "$lib/i18n";

  let {
    useGpu = $bindable(true),
    gpuSupport = $bindable<{ cuda_available: boolean; opencl_available: boolean } | null>(null),
    combinationSize = $bindable<4 | 5>(4),
  } = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
  <div class="text-base font-semibold text-foreground">
    {resolveModuleCalcTranslation(
      "moduleCalc.calcSettings",
      SETTINGS.live.general.state.language,
      "计算设置",
    )}
  </div>

  <div class="space-y-2">
    <div class="text-sm text-foreground">
      {resolveModuleCalcTranslation(
        "moduleCalc.moduleCount",
        SETTINGS.live.general.state.language,
        "模组数量",
      )}
    </div>

    <div class="flex items-center gap-2">
      <Button
        type="button"
        variant={combinationSize === 4 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 4)}
      >
        {resolveModuleCalcTranslation(
          "moduleCalc.modules4",
          SETTINGS.live.general.state.language,
          "4 模组",
        )}
      </Button>

      <Button
        type="button"
        variant={combinationSize === 5 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 5)}
      >
        {resolveModuleCalcTranslation(
          "moduleCalc.modules5",
          SETTINGS.live.general.state.language,
          "5 模组",
        )}
      </Button>
    </div>
  </div>

  <div class="flex items-center gap-3">
    <Switch bind:checked={useGpu} />

    <div class="text-sm text-foreground">
      {resolveModuleCalcTranslation(
        "moduleCalc.gpuAcceleration",
        SETTINGS.live.general.state.language,
        "GPU 加速",
      )}
    </div>

    {#if gpuSupport}
      {#if SETTINGS.live.general.state.language === "en"}
        <div class="text-xs text-muted-foreground leading-tight">
          <div>
            CUDA:
            {gpuSupport.cuda_available
              ? resolveModuleCalcTranslation(
                  "moduleCalc.available",
                  SETTINGS.live.general.state.language,
                  "可用",
                )
              : resolveModuleCalcTranslation(
                  "moduleCalc.unavailable",
                  SETTINGS.live.general.state.language,
                  "不可用",
                )}
          </div>
          <div>
            OpenCL:
            {gpuSupport.opencl_available
              ? resolveModuleCalcTranslation(
                  "moduleCalc.available",
                  SETTINGS.live.general.state.language,
                  "可用",
                )
              : resolveModuleCalcTranslation(
                  "moduleCalc.unavailable",
                  SETTINGS.live.general.state.language,
                  "不可用",
                )}
          </div>
        </div>
      {:else}
        <div class="text-xs text-muted-foreground">
          CUDA:
          {gpuSupport.cuda_available
            ? resolveModuleCalcTranslation(
                "moduleCalc.available",
                SETTINGS.live.general.state.language,
                "可用",
              )
            : resolveModuleCalcTranslation(
                "moduleCalc.unavailable",
                SETTINGS.live.general.state.language,
                "不可用",
              )}
          · OpenCL:
          {gpuSupport.opencl_available
            ? resolveModuleCalcTranslation(
                "moduleCalc.available",
                SETTINGS.live.general.state.language,
                "可用",
              )
            : resolveModuleCalcTranslation(
                "moduleCalc.unavailable",
                SETTINGS.live.general.state.language,
                "不可用",
              )}
        </div>
      {/if}
    {/if}
  </div>
</div>
