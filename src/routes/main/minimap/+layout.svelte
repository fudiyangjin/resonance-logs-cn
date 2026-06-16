<script lang="ts">
  import { emit } from "@tauri-apps/api/event";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import MapIcon from "virtual:icons/lucide/map";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import PlayIcon from "virtual:icons/lucide/play";
  import { t } from "$lib/i18n/index.svelte";

  let { children } = $props();

  async function toggleMinimapOverlayWindow() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("minimap-overlay");
      if (overlayWindow !== null) {
        const isVisible = await overlayWindow.isVisible();
        if (isVisible) {
          await overlayWindow.hide();
        } else {
          await overlayWindow.show();
          await overlayWindow.unminimize();
          await overlayWindow.setFocus();
        }
      } else {
        console.warn("Minimap overlay window not found");
      }
    } catch (error) {
      console.error("Failed to toggle minimap overlay window:", error);
    }
  }

  async function toggleMinimapOverlayEditMode() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("minimap-overlay");
      if (overlayWindow !== null) {
        await emit("minimap-overlay-edit-toggle");
      } else {
        console.warn("Minimap overlay window not found");
      }
    } catch (error) {
      console.error("Failed to toggle minimap overlay edit mode", error);
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div
        class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg"
      >
        <MapIcon class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-foreground text-xl font-bold">{t("minimap.title")}</h1>
        <p class="text-muted-foreground text-sm">{t("minimap.description")}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
        onclick={toggleMinimapOverlayWindow}
      >
        <PlayIcon class="h-4 w-4" />
        <span>{t("minimap.actions.toggleOverlay")}</span>
        <ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="border-border/60 bg-muted/30 text-foreground hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
        onclick={toggleMinimapOverlayEditMode}
      >
        <PenSquareIcon class="h-4 w-4" />
        <span>{t("minimap.actions.editLayout")}</span>
        <ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
