<script lang="ts">
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { emit } from "@tauri-apps/api/event";
  import SwordsIcon from "virtual:icons/lucide/swords";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";
  import PauseIcon from "virtual:icons/lucide/pause";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import ProfileSwitcher from "./profile-switcher.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    isOverlayWindowVisible,
    toggleOverlayWindow,
  } from "$lib/overlay-window-visibility.svelte";

  let { children } = $props();

  const overlayVisible = $derived(isOverlayWindowVisible("game-overlay"));

  async function toggleOverlayEditMode() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
      if (overlayWindow !== null) {
        await emit("overlay-edit-toggle");
      } else {
        console.warn("Game overlay window not found");
      }
    } catch (error) {
      console.error("Failed to toggle overlay edit mode", error);
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <SwordsIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{t("skillMonitor.layout.title")}</h1>
        <p class="text-sm text-muted-foreground">{t("skillMonitor.layout.description")}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={overlayVisible}
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors {overlayVisible
          ? 'border border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
        onclick={() => toggleOverlayWindow("game-overlay")}
      >
        {#if overlayVisible}
          <PauseIcon class="w-4 h-4" />
        {:else}
          <PlayIcon class="w-4 h-4" />
        {/if}
        <span>{t("skillMonitor.layout.toggleOverlayWindow")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
        onclick={toggleOverlayEditMode}
      >
        <PenSquareIcon class="w-4 h-4" />
        <span>{t("skillMonitor.layout.editOverlayLayout")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <ProfileSwitcher />

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
