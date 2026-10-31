<script lang="ts">
  import {
    MAX_BEANS,
    dotSlots,
    lastOpenResource,
    type ResolvedResourceBar,
  } from "$lib/resource-bar";
  import type { DotRowLayout } from "$lib/resource-bar-layouts";
  import { isLayoutScaffold } from "./overlay-state.svelte.js";

  /** Each `battle_res_bean_*` is 26×26, anchored at its right edge. */
  const BEAN_SIZE = 26;

  let {
    layout,
    bar,
  }: { layout: DotRowLayout; bar: ResolvedResourceBar } = $props();

  const dot = $derived(lastOpenResource(bar, "dot"));
  // The editor shows the empty row while the unlock buff is off, so the
  // section can still be placed.
  const slots = $derived(
    dot
      ? dotSlots(dot.now, dot.max, bar.dotEffectOpen)
      : isLayoutScaffold()
        ? dotSlots(0, MAX_BEANS)
        : null,
  );
</script>

<div
  class="dots-part"
  style:width={`${layout.w}px`}
  style:height={`${layout.h}px`}
>
  {#if slots}
    {#each slots.lit as lit, index (index)}
      <img
        class="bean"
        src={lit ? layout.on : layout.off}
        alt=""
        style:left={`${(layout.anchors[index] ?? BEAN_SIZE) - BEAN_SIZE}px`}
      />
    {/each}
    {#if slots.overflowText}
      <div class="res-num">{slots.overflowText}</div>
    {/if}
  {/if}
</div>

<style>
  .dots-part {
    position: relative;
    pointer-events: none;
  }

  .bean {
    position: absolute;
    top: 0;
    width: 26px;
    height: 26px;
  }

  .res-num {
    position: absolute;
    left: 24px;
    top: -2px;
    width: 42px;
    height: 30px;
    color: var(--resource-text-color, #ffffff);
    font-family: "Dream Han Sans SC", sans-serif;
    font-size: var(--resource-font-size, 18px);
    font-weight: 400;
    font-synthesis: none;
    line-height: 30px;
    white-space: nowrap;
    text-shadow: var(--overlay-text-shadow, none);
  }
</style>
