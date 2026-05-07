<script lang="ts">
  import SwordsIcon from "virtual:icons/lucide/swords";
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";

  let { children } = $props();
  const t = uiT("overlay/skill-monitor/general", () => SETTINGS.live.general.state.language);
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
      <SwordsIcon class="w-5 h-5" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">{t("title", "实时监控")}</h1>
      <p class="text-sm text-muted-foreground">{t("subtitle", "自定义监控技能CD, 战斗资源等")}</p>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
