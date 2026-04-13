<script lang="ts">
  import type { ModuleInfo } from "$lib/api";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveModuleCalcTranslation } from "$lib/i18n";

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
      {moduleCount === null
        ? resolveModuleCalcTranslation(
            "notSynced",
            SETTINGS.live.general.state.language,
            "未同步",
          )
        : filteredModuleCount}
    </span>
  </div>
</div>
