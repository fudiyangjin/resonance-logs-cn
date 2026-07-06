<script lang="ts">
  import { onMount } from "svelte";
  import "../overlay-edit-theme.css";
  import CustomPanelGroup from "./CustomPanelGroup.svelte";
  import EditBanner from "./EditBanner.svelte";
  import GroupedBuffDisplay from "./GroupedBuffDisplay.svelte";
  import IndividualBuffDisplay from "./IndividualBuffDisplay.svelte";
  import PanelAttrGroup from "./PanelAttrGroup.svelte";
  import ResourceGroup from "./ResourceGroup.svelte";
  import ShieldDetailGroup from "./ShieldDetailGroup.svelte";
  import SkillCdGroup from "./SkillCdGroup.svelte";
  import SkillDurationDisplay from "./SkillDurationDisplay.svelte";
  import TextBuffPanel from "./TextBuffPanel.svelte";
  import {
    buffDisplayMode,
    initOverlay,
    isEditing,
    isReferenceMode,
    overlayTextStyle,
    overlayVisibility,
  } from "./overlay-state.svelte.js";
  import { overlayTextShadow } from "$lib/overlay-text-style";
  import {
    overlayCustomFontFamily,
    setupOverlayCustomFonts,
  } from "$lib/overlay-custom-font.svelte";

  const editing = $derived(isEditing());
  const referenceMode = $derived(isReferenceMode());
  const visibility = $derived(overlayVisibility());
  const displayMode = $derived(buffDisplayMode());
  const sharedTextStyle = $derived(overlayTextStyle());
  const sharedTextShadowVar = $derived(
    overlayTextShadow(sharedTextStyle.textShadowEnabled),
  );
  const sharedFontFamilyVar = $derived(overlayCustomFontFamily());

  setupOverlayCustomFonts();

  onMount(initOverlay);
</script>

<div
  class="overlay-root"
  class:editing
  class:reference={referenceMode}
  style:--overlay-text-shadow={sharedTextShadowVar}
  style:font-family={sharedFontFamilyVar}
>
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

  {#if visibility.showShieldDetailGroup}
    <ShieldDetailGroup />
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
    box-shadow: inset 0 0 0 3px var(--overlay-edit-frame);
  }

  /* Reference mode: shown beneath monster-overlay during its editing as a
     live alignment reference. No grid; render at full opacity for clarity. */
  .overlay-root.reference {
    opacity: 1;
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
