<script lang="ts">
  import SparklesIcon from "virtual:icons/lucide/sparkles";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  let { children } = $props();
  const t = uiT("custom-triggers/general", () => SETTINGS.live.general.state.language);
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
      <SparklesIcon class="w-5 h-5" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">{t("title", "Custom Triggers")}</h1>
      <p class="text-sm text-muted-foreground">
        {t("descriptionPhase4", "Build trigger bars, notifications, and logger tooling on the shared overlay.")}
      </p>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
