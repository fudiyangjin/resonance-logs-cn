<script lang="ts">
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

  let {
    combinationSize = $bindable<4 | 5>(4),
  } = $props();
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 h-full">
  <div class="text-base font-semibold text-foreground">
    {t("calcSettings", "Calculation Settings")}
  </div>

  <div class="space-y-2">
    <div class="text-sm text-foreground">
      {t("moduleCount", "Module Count")}
    </div>

    <div class="flex items-center gap-2">
      <Button
        type="button"
        variant={combinationSize === 4 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 4)}
      >
        {t("modules4", "4 Modules")}
      </Button>

      <Button
        type="button"
        variant={combinationSize === 5 ? "default" : "outline"}
        size="sm"
        onclick={() => (combinationSize = 5)}
      >
        {t("modules5", "5 Modules")}
      </Button>
    </div>
  </div>
</div>
