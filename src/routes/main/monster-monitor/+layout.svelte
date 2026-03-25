<script lang="ts">
  import { emit } from "@tauri-apps/api/event";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import PlayIcon from "virtual:icons/lucide/play";
  import ShieldAlertIcon from "virtual:icons/lucide/shield-alert";
  import { tl } from "$lib/i18n/index.svelte";

  let { children } = $props();

  async function toggleMonsterOverlayWindow() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("monster-overlay");
      if (overlayWindow !== null) {
        const isVisible = await overlayWindow.isVisible();

        if (isVisible) {
          await overlayWindow.hide();
        } else {
          await overlayWindow.setIgnoreCursorEvents(true);
          await overlayWindow.show();
          await overlayWindow.unminimize();
        }
      } else {
        console.warn("Monster overlay window not found");
      }
    } catch (error) {
      console.error("Failed to toggle monster overlay window:", error);
    }
  }

  async function toggleMonsterOverlayEditMode() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("monster-overlay");
      if (overlayWindow !== null) {
        await overlayWindow.setIgnoreCursorEvents(false);
        await overlayWindow.show();
        await overlayWindow.unminimize();
        await overlayWindow.setFocus();
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
        <h1 class="text-xl font-bold text-foreground">{tl("Monster Monitor")}</h1>
        <p class="text-sm text-muted-foreground">{tl("Monitor boss buffs and related data")}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
        onclick={toggleMonsterOverlayWindow}
      >
        <PlayIcon class="w-4 h-4" />
        <span>{tl("Toggle Monster Overlay")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
        onclick={toggleMonsterOverlayEditMode}
      >
        <PenSquareIcon class="w-4 h-4" />
        <span>{tl("Edit Monster Layout")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
