<script lang="ts">
  import BuffCoverageGroup from "../game-overlay/BuffCoverageGroup.svelte";
  import CustomPanelGroup from "../game-overlay/CustomPanelGroup.svelte";
  import GroupedBuffDisplay from "../game-overlay/GroupedBuffDisplay.svelte";
  import IndividualBuffDisplay from "../game-overlay/IndividualBuffDisplay.svelte";
  import PanelAttrGroup from "../game-overlay/PanelAttrGroup.svelte";
  import ResourceSections from "../game-overlay/ResourceSections.svelte";
  import ShieldDetailGroup from "../game-overlay/ShieldDetailGroup.svelte";
  import SkillCdGroup from "../game-overlay/SkillCdGroup.svelte";
  import SkillDurationDisplay from "../game-overlay/SkillDurationDisplay.svelte";
  import TextBuffPanel from "../game-overlay/TextBuffPanel.svelte";
  import {
    buffDisplayMode,
    overlayTextStyle,
    overlayVisibility,
  } from "../game-overlay/overlay-state.svelte.js";
  import { overlayTextShadow } from "$lib/overlay-text-style";

  const visibility = $derived(overlayVisibility());
  const displayMode = $derived(buffDisplayMode());
  const sharedTextStyle = $derived(overlayTextStyle());
  const sharedTextShadowVar = $derived(
    overlayTextShadow(sharedTextStyle.textShadowEnabled),
  );
</script>

<div class="hud-layer" style:--overlay-text-shadow={sharedTextShadowVar}>
  {#if visibility.showSkillCdGroup}
    <SkillCdGroup />
  {/if}
  {#if visibility.showSkillDurationGroup}
    <SkillDurationDisplay />
  {/if}
  {#if visibility.showResourceGroup}
    <ResourceSections />
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
  {#if visibility.showBuffCoverageGroup}
    <BuffCoverageGroup />
  {/if}
  <TextBuffPanel />
  {#if displayMode === "grouped"}
    <GroupedBuffDisplay />
  {:else}
    <IndividualBuffDisplay />
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
