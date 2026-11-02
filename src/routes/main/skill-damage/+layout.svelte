<script lang="ts">
  import FlameIcon from "virtual:icons/lucide/flame";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import { t } from "$lib/i18n/index.svelte";
  import { toggleHudEditing } from "$lib/overlay-window-visibility.svelte";
  let { children } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div
        class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg"
      >
        <FlameIcon class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-foreground text-xl font-bold">
          {t("routes.tools.skillDamage")}
        </h1>
        <p class="text-muted-foreground text-sm">
          {t("skillDamage.pageDescription")}
        </p>
      </div>
    </div>
    <button
      type="button"
      class="border-border/60 bg-muted/30 hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium"
      onclick={async () => {
        try {
          await toggleHudEditing();
        } catch (error) {
          console.error("Failed to edit skill damage layout", error);
        }
      }}
      ><PenSquareIcon class="h-4 w-4" />{t(
        "monsterMonitor.actions.editLayout",
      )}</button
    >
  </div>
  {@render children()}
</div>
