<script lang="ts">
  import { onMount } from "svelte";
  import CustomPanelGroup from "./CustomPanelGroup.svelte";
  import EditBanner from "./EditBanner.svelte";
  import GroupedBuffDisplay from "./GroupedBuffDisplay.svelte";
  import MonsterBuffPanel from "../monster-overlay/MonsterBuffPanel.svelte";
  import MonsterHatePanel from "../monster-overlay/MonsterHatePanel.svelte";
  import IndividualBuffDisplay from "./IndividualBuffDisplay.svelte";
  import PanelAttrGroup from "./PanelAttrGroup.svelte";
  import BuffUptimeGroup from "./BuffUptimeGroup.svelte";
  import ShieldDetailGroup from "./ShieldDetailGroup.svelte";
  import CustomTriggerGroups from "./CustomTriggerGroups.svelte";
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
  import { SETTINGS } from "$lib/settings-store";
  import { initMonsterOverlay } from "../monster-overlay/monster-state.svelte.js";

  const editing = $derived(isEditing());
  const visibility = $derived(overlayVisibility());
  const displayMode = $derived(buffDisplayMode());
  const hateEnabled = $derived(SETTINGS.monsterMonitor.state.hateListEnabled);

  onMount(initOverlay);
  onMount(initMonsterOverlay);
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

  {#if visibility.showBuffUptimeGroup}
    <BuffUptimeGroup />
  {/if}

  {#if visibility.showCustomPanelGroup}
    <CustomPanelGroup />
  {/if}

  {#if visibility.showShieldDetailGroup}
    <ShieldDetailGroup />
  {/if}

  <MonsterBuffPanel />
  {#if hateEnabled}
    <MonsterHatePanel />
  {/if}

  <CustomTriggerGroups />

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
    outline-offset: 3px;
    cursor: move;
  }

  :global(.group-tag) {
    /* Edit labels are chrome; they must not change saved overlay geometry. */
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

  :global(.skill-group.editable),
  :global(.resource-group.editable),
  :global(.panel-attr-group.editable),
  :global(.buff-uptime-group.editable),
  :global(.text-buff-panel.editable),
  :global(.buff-group-container.editable),
  :global(.icon-buff-cell.editable:not(.standalone-layout)),
  :global(.skill-duration-cell.editable),
  :global(.custom-panel-group.editable),
  :global(.icon-buff-cell.standalone-layout.editable .buff-icon-wrap) {
    outline: 2px dashed rgba(239, 68, 68, 0.95) !important;
    border-radius: 10px;
    background: rgba(60, 20, 20, 0.32) !important;
  }

  :global(.monster-buff-panel.editable),
  :global(.monster-hate-panel.editable) {
    outline: 2px dashed rgba(59, 130, 246, 0.95) !important;
    border: none !important;
    border-radius: 10px;
    background: rgba(18, 37, 65, 0.34) !important;
  }

  :global(.overlay-root.editing .custom-trigger-group),
  :global(.overlay-root.editing .custom-trigger-notification-group),
  :global(.overlay-root.editing .empty-free-state),
  :global(.overlay-root.editing .custom-trigger-free-item.editable) {
    outline: 2px dashed rgba(34, 197, 94, 0.95) !important;
    outline-offset: 3px;
    border-radius: 10px;
    background: rgba(16, 56, 30, 0.3) !important;
  }

  :global(.skill-group.editable .group-tag),
  :global(.resource-group.editable .group-tag),
  :global(.panel-attr-group.editable .group-tag),
  :global(.buff-uptime-group.editable .group-tag),
  :global(.text-buff-panel.editable .group-tag),
  :global(.buff-group-container.editable .group-tag),
  :global(.custom-panel-group.editable .group-tag),
  :global(.skill-duration-cell.editable .group-tag) {
    background: rgba(185, 28, 28, 0.9) !important;
    border-color: rgba(254, 202, 202, 0.95) !important;
  }

  :global(.monster-buff-panel.editable .group-tag),
  :global(.monster-hate-panel.editable .group-tag) {
    background: rgba(30, 64, 175, 0.92) !important;
    border-color: rgba(191, 219, 254, 0.95) !important;
  }

  :global(.overlay-root.editing .custom-trigger-group .group-tag),
  :global(.overlay-root.editing .custom-trigger-notification-group .group-tag),
  :global(.overlay-root.editing .empty-free-state .group-tag),
  :global(.overlay-root.editing .custom-trigger-free-item.editable .group-tag) {
    background: rgba(21, 128, 61, 0.92) !important;
    border-color: rgba(187, 247, 208, 0.95) !important;
  }

  :global(.skill-group.editable .resize-handle),
  :global(.resource-group.editable .resize-handle),
  :global(.panel-attr-group.editable .resize-handle),
  :global(.buff-uptime-group.editable .resize-handle),
  :global(.text-buff-panel.editable .resize-handle),
  :global(.buff-group-container.editable .resize-handle),
  :global(.custom-panel-group.editable .resize-handle),
  :global(.skill-duration-cell.editable .resize-handle),
  :global(.icon-buff-cell.editable .resize-handle) {
    background: rgba(239, 68, 68, 0.95) !important;
  }

  :global(.monster-buff-panel.editable .resize-handle),
  :global(.monster-hate-panel.editable .resize-handle) {
    background: rgba(59, 130, 246, 0.95) !important;
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
