<script lang="ts">
  import type { GaugeResourceDefinition } from "$lib/skill-mappings";
  import { getResourceValue, selectedClassKey } from "./overlay-state.svelte.js";

  let { resource }: { resource: GaugeResourceDefinition } = $props();

  const classKey = $derived(selectedClassKey());
  const cur = $derived(getResourceValue(resource.currentId));
  const max = $derived(Math.max(1, getResourceValue(resource.maxId)));
  const compactCur = $derived(Math.max(0, cur));
</script>

<div class="res-charges-container" data-class={classKey}>
  {#if resource.compactAbove !== undefined}
    {#if compactCur <= 0}
      <img src={resource.imageOff} alt={resource.label} class="res-charge-icon" />
    {:else if compactCur > resource.compactAbove}
      <img src={resource.imageOn} alt={resource.label} class="res-charge-icon" />
      <span class="res-charge-multiplier"
        >{resource.compactMultiplierPrefix ?? "*"}{compactCur}</span
      >
    {:else}
      {#each { length: compactCur }, i (i)}
        <img src={resource.imageOn} alt={resource.label} class="res-charge-icon" />
      {/each}
    {/if}
  {:else}
    {#each { length: max }, i (i)}
      <img
        src={i < cur ? resource.imageOn : resource.imageOff}
        alt={resource.label}
        class="res-charge-icon"
      />
    {/each}
  {/if}
</div>

<style>
  .res-charges-container {
    display: flex;
    flex-direction: row;
  }

  .res-charge-icon {
    height: 24px;
    width: auto;
  }

  .res-charge-multiplier {
    margin-left: 2px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    line-height: 24px;
    text-shadow: var(--overlay-text-shadow, 1px 1px 2px rgba(0, 0, 0, 0.9));
  }

  .res-charges-container[data-class="verdant_oracle"] {
    align-items: center;
  }

  .res-charges-container[data-class="verdant_oracle"] .res-charge-icon {
    height: 22px;
  }

  .res-charges-container[data-class="verdant_oracle"] .res-charge-multiplier {
    margin-left: 4px;
    font-size: 18px;
    line-height: 22px;
  }
</style>
