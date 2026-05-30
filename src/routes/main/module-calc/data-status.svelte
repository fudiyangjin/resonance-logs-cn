<script lang="ts">
  import type { ModuleInfo } from "$lib/api";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveModuleCalcTranslation } from "$lib/i18n";

  let {
    moduleCount = null,
    filteredModuleCount = null,
    filteredModuleCountMinTotalValue = null,
    modules = [],
    minTotalValue = 12,
    loading = false,
    refreshStatusMessage = null,
    statusMessage = null,
  }: {
    moduleCount: number | null;
    filteredModuleCount?: number | null;
    filteredModuleCountMinTotalValue?: number | null;
    modules: ModuleInfo[];
    minTotalValue: number;
    loading?: boolean;
    refreshStatusMessage?: string | null;
    statusMessage?: string | null;
  } = $props();

  const localFilteredModuleCount = $derived(
    modules.filter(
      (module) =>
        module.parts.reduce((total, part) => total + part.value, 0) >= minTotalValue
    ).length
  );

  const displayedFilteredModuleCount = $derived.by(() => {
    if (
      filteredModuleCount !== null &&
      filteredModuleCountMinTotalValue === minTotalValue
    ) {
      return filteredModuleCount;
    }

    if (modules.length > 0) return localFilteredModuleCount;
    return null;
  });
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-1">
  <div class="text-base font-semibold text-foreground">
    {resolveModuleCalcTranslation(
      "dataStatus",
      SETTINGS.live.general.state.language,
      "数据状态",
    )}
  </div>

  <div class="text-sm text-muted-foreground">
    <span>
      {resolveModuleCalcTranslation(
        "moduleCountStatus",
        SETTINGS.live.general.state.language,
        "模组数量：",
      )}
    </span>
    <span class="ml-1">
      {moduleCount ??
        resolveModuleCalcTranslation(
          "notSynced",
          SETTINGS.live.general.state.language,
          "未同步",
        )}
    </span>
  </div>

  <div class="text-sm text-muted-foreground">
    <span>
      {resolveModuleCalcTranslation(
        "filteredTotalValue",
        SETTINGS.live.general.state.language,
        "总值筛选后：",
      )}
    </span>
    <span class="ml-1">
      {moduleCount === null || displayedFilteredModuleCount === null
        ? resolveModuleCalcTranslation(
            "notSynced",
            SETTINGS.live.general.state.language,
            "未同步",
          )
        : displayedFilteredModuleCount}
    </span>
  </div>

  {#if loading || refreshStatusMessage || statusMessage}
    <div class="pt-2 text-xs leading-snug text-muted-foreground/80">
      {refreshStatusMessage ??
        (loading
        ? resolveModuleCalcTranslation(
            "checkingModuleData",
            SETTINGS.live.general.state.language,
            "Checking module data...",
          )
        : statusMessage)}
    </div>
  {/if}
</div>
