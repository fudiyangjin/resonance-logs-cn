<script lang="ts">
  import { emit } from "@tauri-apps/api/event";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import PlayIcon from "virtual:icons/lucide/play";
  import PauseIcon from "virtual:icons/lucide/pause";
  import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
  import { t } from "$lib/i18n/index.svelte";
  import {
    isOverlayWindowVisible,
    toggleOverlayWindow,
  } from "$lib/overlay-window-visibility.svelte";

  let { children } = $props();

  const overlayVisible = $derived(isOverlayWindowVisible("monster-overlay"));

  async function toggleMonsterOverlayEditMode() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("monster-overlay");
      if (overlayWindow !== null) {
        await emit("monster-overlay-edit-toggle");
      } else {
        console.warn("Monster overlay window not found");
      }
    } catch (error) {
      console.error("Failed to toggle monster overlay edit mode", error);
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <ShieldAlertIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{t("monsterMonitor.title")}</h1>
        <p class="text-sm text-muted-foreground">{t("monsterMonitor.description")}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={overlayVisible}
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors {overlayVisible
          ? 'border border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
        onclick={() => toggleOverlayWindow("monster-overlay")}
      >
        {#if overlayVisible}
          <PauseIcon class="w-4 h-4" />
        {:else}
          <PlayIcon class="w-4 h-4" />
        {/if}
        <span>{t("monsterMonitor.actions.toggleOverlay")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
        onclick={toggleMonsterOverlayEditMode}
      >
        <PenSquareIcon class="w-4 h-4" />
        <span>{t("monsterMonitor.actions.editLayout")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
