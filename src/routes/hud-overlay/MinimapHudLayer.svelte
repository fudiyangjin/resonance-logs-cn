<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import DraggablePanel from "./DraggablePanel.svelte";
  import MinimapCanvas from "../minimap-overlay/minimap-canvas.svelte";
  import MinimapInfobar from "../minimap-overlay/minimap-infobar.svelte";
  import { minimapSnapshot } from "../minimap-overlay/minimap-runtime.svelte.js";

  let { editing }: { editing: boolean } = $props();
  const snapshot = $derived(minimapSnapshot());
  const minimapSettings = $derived(SETTINGS.minimap.state);
</script>

<div class="hud-layer">
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
  .hud-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
