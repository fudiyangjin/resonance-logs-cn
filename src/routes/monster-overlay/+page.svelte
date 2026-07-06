<script lang="ts">
  import { onMount } from "svelte";
  import { SETTINGS } from "$lib/settings-store";
  import "../overlay-edit-theme.css";
  import EditBanner from "./EditBanner.svelte";
  import MonsterBossDbmPanel from "./MonsterBossDbmPanel.svelte";
  import MonsterBuffPanel from "./MonsterBuffPanel.svelte";
  import MonsterFantasyPanel from "./MonsterFantasyPanel.svelte";
  import MonsterHatePanel from "./MonsterHatePanel.svelte";
  import MonsterStunPanel from "./MonsterStunPanel.svelte";
  import MonsterTeammateBuffPanel from "./MonsterTeammateBuffPanel.svelte";
  import {
    getMonsterOverlayVisibility,
    initMonsterOverlay,
    isMonsterEditing,
    isMonsterReferenceMode,
  } from "./monster-state.svelte.js";
  import {
    overlayCustomFontFamily,
    setupOverlayCustomFonts,
  } from "$lib/overlay-custom-font.svelte";

  const editing = $derived(isMonsterEditing());
  const referenceMode = $derived(isMonsterReferenceMode());
  const visibility = $derived(getMonsterOverlayVisibility());
  const fontFamilyVar = $derived(overlayCustomFontFamily());
  const hateEnabled = $derived(
    SETTINGS.monsterMonitor.state.hateListEnabled && visibility.showHatePanel,
  );
  const stunEnabled = $derived(
    SETTINGS.monsterMonitor.state.stunListEnabled && visibility.showStunPanel,
  );

  setupOverlayCustomFonts();
  onMount(initMonsterOverlay);
</script>

<div
  class="overlay-root"
  class:editing
  class:reference={referenceMode}
  style:font-family={fontFamilyVar}
>
  {#if editing}
    <EditBanner />
  {/if}

  {#if visibility.showMonsterBuffPanel}
    <MonsterBuffPanel />
  {/if}
  {#if visibility.showTeammateBuffPanel}
    <MonsterTeammateBuffPanel />
  {/if}
  {#if hateEnabled}
    <MonsterHatePanel />
  {/if}
  {#if stunEnabled}
    <MonsterStunPanel />
  {/if}
  {#if visibility.showFantasyPanel}
    <MonsterFantasyPanel />
  {/if}
  {#if visibility.showBossDbmPanel}
    <MonsterBossDbmPanel />
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
  }

  .overlay-root.editing {
    background-color: rgba(0, 0, 0, 0.18);
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 20px 20px;
    box-shadow: inset 0 0 0 3px var(--overlay-edit-frame);
  }

  /* Reference mode: shown beneath game-overlay during its editing as a live
     alignment reference. No grid; full opacity so it reads as the real overlay
     (the layout scaffold carries its own placeholder styling). */
  .overlay-root.reference {
    opacity: 1;
  }

  :global(.overlay-group) {
    position: absolute;
    z-index: 20;
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
    padding: 3px 7px;
    border-radius: 6px;
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: var(--overlay-edit-tag-bg);
    border: 1px solid var(--overlay-edit-tag-border);
  }

  :global(.resize-handle) {
    position: absolute;
    right: -10px;
    bottom: -10px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--overlay-edit-handle-bg);
    border: 2px solid rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    cursor: nwse-resize;
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
