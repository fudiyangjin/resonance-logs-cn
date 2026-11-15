<script lang="ts">
  import {
    axeBallView,
    lastOpenResource,
    type ResolvedResourceBar,
  } from "$lib/resource-bar";
  import type { AxeBallLayout } from "$lib/resource-bar-layouts";
  import { isLayoutScaffold } from "./overlay-state.svelte.js";

  let { layout, bar }: { layout: AxeBallLayout; bar: ResolvedResourceBar } =
    $props();

  // `fighterBattleResAxe` shows only while its unlock buff is on; the editor
  // draws an empty orb so the section can still be placed.
  const resource = $derived(lastOpenResource(bar, "axeBall"));
  const ball = $derived(
    resource
      ? axeBallView(resource.now, resource.max)
      : isLayoutScaffold()
        ? axeBallView(0, 0)
        : null,
  );
</script>

<div
  class="axe-ball-part"
  style:width={`${layout.rect.w}px`}
  style:height={`${layout.rect.h}px`}
>
  {#if ball}
    <img class="axe-ball-bg" src={layout.background} alt="" />
    <div class="axe-ball-fill" style:height={`${ball.fill * 62}px`}>
      <img src={layout.light} alt="" />
    </div>
    {#if ball.full}
      <img class="axe-ball-adorn" src={layout.adorn} alt="" />
    {/if}
    <div class="axe-ball-num">{ball.percent}%</div>
  {/if}
</div>

<style>
  .axe-ball-part {
    position: relative;
    pointer-events: none;
  }

  .axe-ball-bg,
  .axe-ball-adorn,
  .axe-ball-num,
  .axe-ball-fill {
    position: absolute;
  }

  .axe-ball-bg {
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* `img_light`: vertical fill from the bottom. */
  .axe-ball-fill {
    left: 2px;
    bottom: 2px;
    width: 62px;
    overflow: hidden;
  }

  .axe-ball-fill > img {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 62px;
    height: 62px;
  }

  .axe-ball-adorn {
    left: 6px;
    top: 6px;
    width: 54px;
    height: 54px;
    opacity: 0.149;
  }

  .axe-ball-num {
    left: 50%;
    top: 50%;
    width: 100px;
    height: 30px;
    transform: translate(-50%, -50%);
    color: var(--resource-text-color, #ffffff);
    font-family: "Dream Han Sans SC", sans-serif;
    /* 16px in the prefab, against the 18px progress text. */
    font-size: calc(var(--resource-font-size, 18px) * 16 / 18);
    line-height: 30px;
    text-align: center;
    text-shadow: var(--overlay-text-shadow, none);
  }
</style>
