<script lang="ts">
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import MapIcon from "virtual:icons/lucide/map";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import PlayIcon from "virtual:icons/lucide/play";
  import PauseIcon from "virtual:icons/lucide/pause";
  import { t } from "$lib/i18n/index.svelte";
  import {
    toggleHudDomainWithRestore,
    toggleHudEditing,
  } from "$lib/overlay-window-visibility.svelte";
  import { isHudDomainEnabled } from "$lib/hud-domain-rules.svelte";

  let { children } = $props();

  // Tracks the persisted intent, not the physical window: an unsupported scene
  // must not make the button read as "off" while the monitor is on.
  const overlayEnabled = $derived(isHudDomainEnabled("minimap"));

  async function toggleMinimapOverlayEditMode() {
    try {
      await toggleHudEditing();
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
        aria-pressed={overlayEnabled}
        class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors {overlayEnabled
          ? 'border border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
        onclick={() => toggleHudDomainWithRestore("minimap")}
      >
        {#if overlayEnabled}
          <PauseIcon class="h-4 w-4" />
        {:else}
          <PlayIcon class="h-4 w-4" />
        {/if}
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
