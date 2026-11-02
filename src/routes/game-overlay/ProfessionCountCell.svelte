<script lang="ts">
  import {
    PROFESSION_COUNT_SIZE,
    professionCountLayers,
    type CountLayer,
  } from "$lib/profession-count";
  import { isLayoutScaffold, professionCount } from "./overlay-state.svelte.js";

  const layers = $derived(professionCountLayers(professionCount()));
  // Hidden groups keep their box while editing so the section can be placed.
  const shown = $derived(layers !== null || isLayoutScaffold());

  /** Unity layout around the node centre: x right, y up. */
  function place(layer: CountLayer): string {
    return [
      `left:calc(50% + ${layer.x}px)`,
      `top:calc(50% - ${layer.y}px)`,
      `width:${layer.w}px`,
      `height:${layer.h}px`,
      layer.alpha === undefined ? "" : `opacity:${layer.alpha}`,
    ].join(";");
  }
</script>

{#if shown}
  <div
    class="profession-count"
    style:width={`${PROFESSION_COUNT_SIZE}px`}
    style:height={`${PROFESSION_COUNT_SIZE}px`}
  >
    {#each layers ?? [] as layer, index (index)}
      {#if layer.color}
        <!-- `SetColorByHex` tints the sprite; drawn as colour through its alpha. -->
        <div
          class="layer tinted"
          style={place(layer)}
          style:background-color={layer.color}
          style:mask-image={`url("${layer.src}")`}
        ></div>
      {:else}
        <img class="layer" src={layer.src} alt="" style={place(layer)} />
      {/if}
    {/each}
  </div>
{/if}

<style>
  .profession-count {
    position: relative;
    pointer-events: none;
  }

  .layer {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .tinted {
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
    mask-position: center;
  }
</style>
