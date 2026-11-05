<script lang="ts">
  import { onMount } from "svelte";
  import "../overlay-edit-theme.css";
  import { initBuffIconDir } from "$lib/buff-icon-dir.svelte";
  import {
    overlayCustomFontFamily,
    setupOverlayCustomFonts,
  } from "$lib/overlay-custom-font.svelte";
  import DamageHudLayer from "./DamageHudLayer.svelte";
  import GameHudLayer from "./GameHudLayer.svelte";
  import HudEditBanner from "./HudEditBanner.svelte";
  import MinimapHudLayer from "./MinimapHudLayer.svelte";
  import MonsterHudLayer from "./MonsterHudLayer.svelte";
  import { initHudOverlay, onHudCanvasPointerDown } from "./hud-events.svelte.js";
  import {
    hudVisibility,
    isHudEditing,
  } from "./hud-runtime.svelte.js";

  const editing = $derived(isHudEditing());
  const visibility = $derived(hudVisibility());
  const fontFamily = $derived(overlayCustomFontFamily());

  setupOverlayCustomFonts();
  void initBuffIconDir();
  onMount(initHudOverlay);
</script>

<div
  class="hud-root"
  class:editing
  style:font-family={fontFamily}
  onpointerdown={onHudCanvasPointerDown}
>
  {#if editing}
    <HudEditBanner />
  {/if}

  {#if editing || visibility.game}
    <div class="domain-layer game-layer">
      <GameHudLayer />
    </div>
  {/if}

  {#if editing || visibility.monster}
    <div class="domain-layer monster-layer">
      <MonsterHudLayer />
    </div>
  {/if}

  {#if editing || visibility.damage}
    <div class="domain-layer damage-layer">
      <DamageHudLayer {editing} />
    </div>
  {/if}

  {#if editing || visibility.minimap}
    <div class="domain-layer minimap-layer">
      <MinimapHudLayer {editing} />
    </div>
  {/if}
</div>

<style>
  .hud-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent;
    user-select: none;
  }

  .hud-root.editing {
    background-color: rgba(0, 0, 0, 0.22);
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 20px 20px;
    box-shadow: inset 0 0 0 3px var(--overlay-edit-frame);
  }

  .domain-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .game-layer {
    z-index: 10;
  }

  .monster-layer {
    z-index: 20;
  }

  .damage-layer {
    z-index: 25;
  }

  .minimap-layer {
    z-index: 30;
  }

  :global(.overlay-group) {
    position: absolute;
    pointer-events: auto;
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

  :global(.resize-handle.icon) {
    right: -8px;
    bottom: -8px;
    width: 14px;
    height: 14px;
  }

  :global(.info-panel) {
    min-width: 220px;
  }

  :global(html),
  :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: transparent !important;
  }
</style>
