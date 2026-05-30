<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveModuleCalcTranslation } from "$lib/i18n";
  import RefreshCw from "virtual:icons/lucide/refresh-cw";

  function t(key: string, fallback: string): string {
    return resolveModuleCalcTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function supportStatusLabel(isAvailable: boolean): string {
    return isAvailable
      ? t("available", "Available")
      : t("unavailable", "Unavailable");
  }

  let {
    useGpu = $bindable(true),
    gpuSupport = $bindable<{ cuda_available: boolean; opencl_available: boolean } | null>(null),
    gpuChecking = false,
    gpuError = null,
    gpuCheckDeferred = false,
    recheckDisabled = false,
    onsettingschange,
    onrecheck,
  }: {
    useGpu: boolean;
    gpuSupport: { cuda_available: boolean; opencl_available: boolean } | null;
    gpuChecking?: boolean;
    gpuError?: string | null;
    gpuCheckDeferred?: boolean;
    recheckDisabled?: boolean;
    onsettingschange?: () => void;
    onrecheck?: () => void;
  } = $props();

  let hasInitializedSettingsChange = false;

  $effect(() => {
    useGpu;
    if (!hasInitializedSettingsChange) {
      hasInitializedSettingsChange = true;
      return;
    }
    onsettingschange?.();
  });
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 h-full">
  <div class="text-base font-semibold text-foreground">
    {t("gpuAcceleration", "GPU Acceleration")}
  </div>

  <div class="space-y-2">
    <div class="flex items-center gap-3 text-sm text-foreground">
      <span class:font-semibold={!useGpu} class="min-w-8 text-right">{t("off", "Off")}</span>
      <Switch bind:checked={useGpu} />
      <span class:font-semibold={useGpu} class="min-w-8">{t("on", "On")}</span>
    </div>
    <div class="text-xs text-muted-foreground">
      {gpuCheckDeferred && useGpu
        ? t("gpuDeferredDescription", "Use Check GPU to verify driver availability.")
        : useGpu
          ? t("gpuEnabledDescription", "GPU-accelerated calculations are enabled.")
          : t("gpuDisabledDescription", "GPU-accelerated calculations are disabled.")}
    </div>
  </div>

  <div class="space-y-1 text-xs leading-tight text-muted-foreground">
    {#if gpuChecking}
      <div>{t("gpuChecking", "Checking GPU availability...")}</div>
    {:else if gpuCheckDeferred}
      <div>{t("gpuCheckDeferred", "GPU check is manual.")}</div>
    {:else if gpuSupport}
      <div>
        {t("gpu.cuda", "CUDA")}: {supportStatusLabel(gpuSupport.cuda_available)}
      </div>
      <div>
        {t("gpu.opencl", "OpenCL")}: {supportStatusLabel(gpuSupport.opencl_available)}
      </div>
      {#if gpuError}
        <div class="text-muted-foreground/80">{gpuError}</div>
      {/if}
    {:else}
      <div>{t("gpuCheckUnavailable", "GPU availability unavailable.")}</div>
    {/if}
  </div>

  {#if onrecheck}
    <Button
      variant="outline"
      size="sm"
      class="h-7 px-2 text-xs"
      disabled={gpuChecking || recheckDisabled}
      onclick={onrecheck}
    >
      <RefreshCw class="w-3 h-3" />
      {t("gpuRecheck", "Check GPU")}
    </Button>
  {/if}
</div>
