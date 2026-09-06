<script lang="ts">
  import type { GaugeResourceDefinition } from "$lib/skill-mappings";
  import {
    buffDurationPercents,
    getResourcePreciseValue,
    getResourceValue,
    selectedClassKey,
  } from "./overlay-state.svelte.js";

  let { resource }: { resource: GaugeResourceDefinition } = $props();

  const classKey = $derived(selectedClassKey());
  const cur = $derived(getResourceValue(resource.currentId));
  const max = $derived(Math.max(1, getResourceValue(resource.maxId)));
  const energyPercent = $derived.by(() => {
    const curPrecise = getResourcePreciseValue(resource.currentId);
    const maxPrecise = Math.max(1, getResourcePreciseValue(resource.maxId));
    return Math.min(100, Math.max(0, (curPrecise / maxPrecise) * 100));
  });
  const buffPercent = $derived.by(() => {
    const ids =
      resource.buffBaseIds ??
      (resource.buffBaseId ? [resource.buffBaseId] : []);
    if (ids.length === 0) return energyPercent;
    const percents = buffDurationPercents();
    return Math.max(0, ...ids.map((id) => percents.get(id) ?? 0));
  });
</script>

<div class="res-bar-container" data-class={classKey}>
  <img src={resource.imageOff} alt={resource.label} class="res-bar-bg" />
  <div
    class="res-bar-fill-mask"
    style:clip-path={`inset(0 ${100 - buffPercent}% 0 0)`}
  >
    <img src={resource.imageOn} alt={resource.label} class="res-bar-fill" />
  </div>
  <div class="res-energy-overlay">
    <div class="res-energy-track">
      <div
        class="res-energy-fill"
        style:transform={`scaleX(${energyPercent / 100})`}
      ></div>
    </div>
  </div>
  <div class="res-text">{cur}/{max}</div>
</div>

<style>
  .res-bar-container {
    position: relative;
    margin-top: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .res-bar-bg,
  .res-bar-fill {
    display: block;
    height: 40px;
    width: auto;
  }

  .res-bar-fill-mask {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .res-energy-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 43px 0 29px;
  }

  .res-energy-track {
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }

  .res-energy-fill {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    transform-origin: left center;
    transition: transform 100ms linear;
    will-change: transform;
  }

  .res-text {
    position: absolute;
    top: -17px;
    left: 0;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: var(--overlay-text-shadow, 1px 1px 2px rgba(0, 0, 0, 0.9));
  }

  .res-bar-container[data-class="flame_berserker"] .res-energy-overlay {
    padding: 17px 62px 0 22px;
  }

  .res-bar-container[data-class="verdant_oracle"] .res-energy-overlay {
    padding: 0 29px 1px 43px;
  }

  .res-bar-container[data-class="verdant_oracle"] .res-energy-track {
    height: 6px;
    border-radius: 1px;
    background: transparent;
  }

  .res-bar-container[data-class="verdant_oracle"] .res-energy-fill {
    border-radius: 1px;
    box-shadow: none;
  }

  .res-bar-container[data-class="verdant_oracle"] .res-text {
    top: -19px;
    left: 15px;
  }
</style>
