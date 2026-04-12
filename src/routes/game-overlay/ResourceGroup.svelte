<script lang="ts">
  import {
    buffDurationPercents,
    getGroupPosition,
    getGroupScale,
    getResourcePreciseValue,
    getResourceValue,
    isEditing,
    selectedClassKey,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import { findResourcesByClass } from "$lib/skill-mappings";

  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);

  const editing = $derived(isEditing());
  const groupPos = $derived(getGroupPosition("resourceGroup"));
  const groupScale = $derived(getGroupScale("resourceGroupScale"));
  const classKey = $derived(selectedClassKey());
  const durationPercents = $derived(buffDurationPercents());
  const resources = $derived(findResourcesByClass(classKey));
  const barResources = $derived(resources.filter((res) => res.type === "bar"));
  const chargeResources = $derived(
    resources.filter((res) => res.type === "charges"),
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="overlay-group resource-group"
  class:editable={editing}
  style:left={`${groupPos.x}px`}
  style:top={`${groupPos.y}px`}
  style:transform={`scale(${groupScale})`}
  style:transform-origin="top left"
  onpointerdown={(e) => startDrag(e, { kind: "group", key: "resourceGroup" }, groupPos)}
>
  {#if editing}
    <div class="group-tag">{t("overlay.resource", "资源区")}</div>
  {/if}

  <div class="resources-panel" data-class={classKey}>
    <div class="resources-row energy-row">
      {#each barResources as res}
        {@const cur = getResourceValue(res.currentIndex)}
        {@const max = Math.max(1, getResourceValue(res.maxIndex))}
        {@const curPrecise = getResourcePreciseValue(res.currentIndex)}
        {@const maxPrecise = Math.max(1, getResourcePreciseValue(res.maxIndex))}
        {@const energyPercent = Math.min(100, Math.max(0, (curPrecise / maxPrecise) * 100))}
        {@const effectiveBuffIds = res.buffBaseIds ?? (res.buffBaseId ? [res.buffBaseId] : [])}
        {@const buffPercent = effectiveBuffIds.length
          ? Math.max(0, ...effectiveBuffIds.map((id) => durationPercents.get(id) ?? 0))
          : energyPercent}
        <div class="res-bar-container">
          <img src={res.imageOff} alt={res.label} class="res-bar-bg" />
          <div class="res-bar-fill-mask" style:clip-path={`inset(0 ${100 - buffPercent}% 0 0)`}>
            <img src={res.imageOn} alt={res.label} class="res-bar-fill" />
          </div>
          <div class="res-energy-overlay">
            <div class="res-energy-track">
              <div class="res-energy-fill" style:width={`${energyPercent}%`}></div>
            </div>
          </div>
          <div class="res-text">{cur}/{max}</div>
        </div>
      {/each}
    </div>

    <div class="resources-row sharpness-row">
      {#each chargeResources as res}
        {@const cur = getResourceValue(res.currentIndex)}
        {@const max = Math.max(1, getResourceValue(res.maxIndex))}
        <div class="res-charges-container">
          {#each Array(max) as _, i}
            <img src={i < cur ? res.imageOn : res.imageOff} alt={res.label} class="res-charge-icon" />
          {/each}
        </div>
      {/each}
    </div>
  </div>

  {#if editing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="resize-handle"
      onpointerdown={(e) =>
        startResize(
          e,
          { kind: "group", key: "resourceGroupScale" },
          groupScale,
        )}
    ></div>
  {/if}
</div>

<style>
  .resource-group.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
  }

  .resources-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .resources-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .sharpness-row {
    margin-top: -2px;
  }

  .resources-panel[data-class="frost_mage"] {
    transform: scale(1.5);
    transform-origin: center;
  }

  .res-bar-container {
    position: relative;
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .res-bar-bg {
    display: block;
    height: 40px;
    width: auto;
  }

  .res-bar-fill-mask {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .res-bar-fill {
    display: block;
    height: 40px;
    width: auto;
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
    height: 100%;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    transition: width 100ms linear;
  }

  .res-text {
    position: absolute;
    top: -17px;
    left: 0;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9);
  }

  .res-charges-container {
    display: flex;
    flex-direction: row;
  }

  .res-charge-icon {
    height: 24px;
    width: auto;
  }
</style>
