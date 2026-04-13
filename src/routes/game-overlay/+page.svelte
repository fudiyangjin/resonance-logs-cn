<script lang="ts">
  import { onMount } from "svelte";
  import CustomPanelGroup from "./CustomPanelGroup.svelte";
  import EditBanner from "./EditBanner.svelte";
  import GroupedBuffDisplay from "./GroupedBuffDisplay.svelte";
  import IndividualBuffDisplay from "./IndividualBuffDisplay.svelte";
  import PanelAttrGroup from "./PanelAttrGroup.svelte";
  import ResourceGroup from "./ResourceGroup.svelte";
  import SkillCdGroup from "./SkillCdGroup.svelte";
  import SkillDurationDisplay from "./SkillDurationDisplay.svelte";
  import TextBuffPanel from "./TextBuffPanel.svelte";
  import {
    buffDisplayMode,
    initOverlay,
    isEditing,
    overlayVisibility,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const visibility = $derived(overlayVisibility());
  const displayMode = $derived(buffDisplayMode());

  onMount(initOverlay);
</script>

<div class="overlay-root" class:editing={editing}>
  {#if editing}
    <EditBanner />
  {/if}

  {#if visibility.showSkillCdGroup}
    <SkillCdGroup />
  {/if}

  {#if visibility.showSkillDurationGroup}
    <SkillDurationDisplay />
  {/if}

  {#if visibility.showResourceGroup}
    <ResourceGroup />
  {/if}

  {#if visibility.showPanelAttrGroup}
    <PanelAttrGroup />
  {/if}

  {#if visibility.showCustomPanelGroup}
    <CustomPanelGroup />
  {/if}

  <TextBuffPanel />

  {#if displayMode === "grouped"}
    <GroupedBuffDisplay />
  {:else}
    <IndividualBuffDisplay />
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
    background-color: rgba(0, 0, 0, 0.22);
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 20px 20px;
    box-shadow: inset 0 0 0 3px rgba(255, 214, 102, 0.9);
  }

  :global(.overlay-group) {
    position: absolute;
    pointer-events: auto;
  }

  :global(.overlay-group.editable:not(.standalone-layout)) {
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

  :global(.resize-handle.icon) {
    right: -8px;
    bottom: -8px;
    width: 14px;
    height: 14px;
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
