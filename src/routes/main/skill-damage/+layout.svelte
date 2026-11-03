<script lang="ts">
  import FlameIcon from "virtual:icons/lucide/flame";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import PlayIcon from "virtual:icons/lucide/play";
  import PauseIcon from "virtual:icons/lucide/pause";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import { SETTINGS } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import {
    toggleHudEditing,
    toggleSkillDamageWithRestore,
  } from "$lib/overlay-window-visibility.svelte";
  let { children } = $props();
  const enabled = $derived(
    SETTINGS.monsterMonitor.state.skillDamageDisplay?.enabled ?? false,
  );
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
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={enabled}
        class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors {enabled
          ? 'border border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
        onclick={async () => {
          try {
            await toggleSkillDamageWithRestore();
          } catch (error) {
            console.error("Failed to toggle skill damage display", error);
          }
        }}
      >
        {#if enabled}<PauseIcon class="h-4 w-4" />{:else}<PlayIcon
            class="h-4 w-4"
          />{/if}
        <span>{t("skillDamage.actions.toggleOverlay")}</span>
        <ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" />
      </button>
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
          "skillDamage.actions.editLayout",
        )}<ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" /></button
      >
    </div>
  </div>
  {@render children()}
</div>
