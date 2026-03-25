<script lang="ts">
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { emit } from "@tauri-apps/api/event";
  import SwordsIcon from "virtual:icons/lucide/swords";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import { tl } from "$lib/i18n/index.svelte";
  import ProfileSwitcher from "./profile-switcher.svelte";

  let { children } = $props();

  async function toggleOverlayWindow() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
      if (overlayWindow !== null) {
        const isVisible = await overlayWindow.isVisible();

        if (isVisible) {
          await emit("overlay-edit-set", { editing: false });
          await overlayWindow.setIgnoreCursorEvents(true);
          await overlayWindow.hide();
        } else {
          await overlayWindow.setIgnoreCursorEvents(true);
          await overlayWindow.show();
          await overlayWindow.unminimize();
        }
      } else {
        console.warn("Game overlay window not found");
      }
    } catch (err) {
      console.error("Failed to toggle overlay window:", err);
    }
  }

  async function toggleOverlayEditMode() {
    try {
      const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
      if (overlayWindow !== null) {
        await overlayWindow.setIgnoreCursorEvents(false);
        await overlayWindow.show();
        await overlayWindow.unminimize();
        await overlayWindow.setFocus();
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
        <h1 class="text-xl font-bold text-foreground">{tl("Skill Monitor")}</h1>
        <p class="text-sm text-muted-foreground">{tl("Customize skill cooldowns, combat resources, and more")}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
        onclick={toggleOverlayWindow}
      >
        <PlayIcon class="w-4 h-4" />
        <span>{tl("Toggle Overlay Window")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-foreground font-medium text-sm hover:bg-muted/50 transition-colors shadow-sm"
        onclick={toggleOverlayEditMode}
      >
        <PenSquareIcon class="w-4 h-4" />
        <span>{tl("Edit Overlay Layout")}</span>
        <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  </div>

  <ProfileSwitcher />

  <div class="min-h-0">
    {@render children()}
  </div>
</div>
