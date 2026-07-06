<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import "../overlay-edit-theme.css";
  import DraggablePanel from "./draggable-panel.svelte";
  import EditBanner from "./EditBanner.svelte";
  import MinimapCanvas from "./minimap-canvas.svelte";
  import MinimapInfobar from "./minimap-infobar.svelte";
  import {
    isMinimapEditing,
    minimapSnapshot,
  } from "./minimap-runtime.svelte.js";
  import { initMinimapOverlay } from "./minimap-events.svelte.js";
  import {
    overlayCustomFontFamily,
    setupOverlayCustomFonts,
  } from "$lib/overlay-custom-font.svelte";

  const editing = $derived(isMinimapEditing());
  const snapshot = $derived(minimapSnapshot());
  const minimapSettings = $derived(SETTINGS.minimap.state);
  const fontFamilyVar = $derived(overlayCustomFontFamily());

  setupOverlayCustomFonts();
  onMount(() => initMinimapOverlay());
</script>

<div class="overlay-root" class:editing style:font-family={fontFamilyVar}>
  {#if editing}
    <EditBanner />
  {/if}

  {#if minimapSettings.showMapPanel}
    <DraggablePanel
      rect={minimapSettings.mapPanel}
      {editing}
      title={t("minimap.panels.map")}
      class="map-panel"
      scaleMode="width"
    >
      <MinimapCanvas {snapshot} />
    </DraggablePanel>
  {/if}

  {#if minimapSettings.showInfoPanel}
    <DraggablePanel
      rect={minimapSettings.infoPanel}
      {editing}
      title={t("minimap.panels.info")}
      class="info-panel"
    >
      <MinimapInfobar {snapshot} />
    </DraggablePanel>
  {/if}
</div>

<style>
  .overlay-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent;
    user-select: none;
    box-sizing: border-box;
  }

  .overlay-root.editing {
    background-color: rgba(0, 0, 0, 0.22);
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 20px 20px;
    box-shadow: inset 0 0 0 3px var(--overlay-edit-frame);
  }

  :global(.overlay-group) {
    position: absolute;
    pointer-events: auto;
  }

  :global(.overlay-group.editable) {
    outline: 2px dashed rgba(255, 255, 255, 0.85);
    outline-offset: 3px;
    cursor: move;
  }

  :global(.group-tag) {
    position: absolute;
    top: -22px;
    left: 0;
    z-index: 1;
    display: inline-block;
    padding: 3px 7px;
    border: 1px solid var(--overlay-edit-tag-border);
    border-radius: 6px;
    color: #fff;
    background: var(--overlay-edit-tag-bg);
    font-size: 11px;
    font-weight: 700;
  }

  :global(.resize-handle) {
    position: absolute;
    right: -10px;
    bottom: -10px;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.95);
    border-radius: 50%;
    background: var(--overlay-edit-handle-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    cursor: nwse-resize;
  }

  :global(.info-panel) {
    min-width: 220px;
  }

  :global(html),
  :global(body) {
    margin: 0;
    width: 100%;
    height: 100%;
    background: transparent !important;
    overflow: hidden;
  }
</style>
