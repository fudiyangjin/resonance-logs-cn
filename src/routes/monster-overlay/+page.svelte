<script lang="ts">
  import { onMount } from "svelte";
  import { SETTINGS } from "$lib/settings-store";
  import EditBanner from "./EditBanner.svelte";
  import GhostOverlay from "./GhostOverlay.svelte";
  import MonsterBuffPanel from "./MonsterBuffPanel.svelte";
  import MonsterHatePanel from "./MonsterHatePanel.svelte";
  import { initMonsterOverlay, isMonsterEditing } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const hateEnabled = $derived(SETTINGS.monsterMonitor.state.hateListEnabled);

  onMount(initMonsterOverlay);
</script>

<div class="overlay-root" class:editing={editing}>
  {#if editing}
    <GhostOverlay />
    <EditBanner />
  {/if}

  <MonsterBuffPanel />
  {#if hateEnabled}
    <MonsterHatePanel />
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
    box-shadow: inset 0 0 0 3px rgba(102, 204, 255, 0.85);
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
    left: 0;
    bottom: calc(100% + 6px);
    margin: 0;
    padding: 3px 7px;
    border-radius: 6px;
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: rgba(255, 140, 0, 0.75);
    border: 1px solid rgba(255, 220, 170, 0.8);
    pointer-events: none;
    white-space: nowrap;
    z-index: 6;
  }

  :global(.resize-handle) {
    position: absolute;
    right: -10px;
    bottom: -10px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 140, 0, 0.95);
    border: 2px solid rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    cursor: nwse-resize;
    z-index: 7;
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
