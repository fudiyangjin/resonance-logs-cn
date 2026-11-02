<script lang="ts">
  import { SCALE_Y, clipFill } from "$lib/bar-motion.svelte.js";
  import {
    lastOpenResource,
    resourceRatio,
    type ResolvedResourceBar,
  } from "$lib/resource-bar";
  import type { Rect, SiderLineLayout } from "$lib/resource-bar-layouts";
  import { isLayoutScaffold } from "./overlay-state.svelte.js";

  let {
    layout,
    bar,
  }: { layout: SiderLineLayout; bar: ResolvedResourceBar } = $props();

  function place(rect: Rect): string {
    return `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;
  }

  // `sider_line` shows only while its unlock buff is on.
  const shield = $derived(lastOpenResource(bar, "siderLine"));
  const shown = $derived(shield !== null || isLayoutScaffold());
  const ratio = $derived(shield ? resourceRatio(shield) : 0);
</script>

<div
  class="sider-line"
  style:width={`${layout.w}px`}
  style:height={`${layout.h}px`}
>
  {#if shown}
    <!-- The bar sprites live in an unresolved bundle; the reference page
         draws them as a white fill over #2e2e2e. -->
    <div class="shield" style={place(layout.bar)}>
      <div class="shield-fill" {@attach clipFill(() => ratio, SCALE_Y)}></div>
    </div>
    <img class="icon" src={layout.icon.image} alt="" style={place(layout.icon)} />
    {#if shield?.received}
      <div class="num" style={place(layout.num)}>{shield.now}/{shield.max}</div>
    {/if}
  {/if}
</div>

<style>
  .sider-line {
    position: relative;
    pointer-events: none;
  }

  .shield,
  .icon,
  .num {
    position: absolute;
  }

  .shield {
    background: #2e2e2e;
    overflow: hidden;
  }

  /* `img_bar`: direction Up, keeps the bottom edge. */
  .shield-fill {
    position: absolute;
    inset: 0;
    background: #ffffff;
    transform-origin: center bottom;
    transform: scaleY(0);
  }

  .num {
    color: var(--resource-text-color, #ffffff);
    font-family: "Dream Han Sans SC", sans-serif;
    /* 20px in the prefab, against the 18px progress text. */
    font-size: calc(var(--resource-font-size, 18px) * 20 / 18);
    font-weight: 400;
    font-synthesis: none;
    line-height: 30px;
    text-align: center;
    text-shadow: var(--overlay-text-shadow, none);
  }
</style>
