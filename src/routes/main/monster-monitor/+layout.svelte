<script lang="ts">
  import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveMonsterMonitorTranslation } from "$lib/i18n";

  let { children } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
      <ShieldAlertIcon class="w-5 h-5" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">
        {resolveMonsterMonitorTranslation("title", SETTINGS.live.general.state.language, "Monster Monitor")}
      </h1>
      <p class="text-sm text-muted-foreground">
        {resolveMonsterMonitorTranslation("subtitle", SETTINGS.live.general.state.language, "Monitor boss buffs and place them on the shared overlay")}
      </p>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
