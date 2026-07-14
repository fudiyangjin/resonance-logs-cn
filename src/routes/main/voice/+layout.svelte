<script lang="ts">
  import MicIcon from "virtual:icons/lucide/mic";
  import { t } from "$lib/i18n/index.svelte";

  let { children } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div
      class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary"
    >
      <MicIcon class="w-5 h-5" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">{t("voice.title")}</h1>
      <p class="text-sm text-muted-foreground">{t("voice.description")}</p>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
