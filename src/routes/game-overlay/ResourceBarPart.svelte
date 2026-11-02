<script lang="ts">
  import {
    barMotion,
    clipFill,
    offsetAxis,
    revealAxes,
  } from "$lib/bar-motion.svelte.js";
  import {
    axeBallView,
    barMotionOf,
    lastOpenResource,
    resourceRatio,
    type ResolvedResourceBar,
    type ShooterForm,
  } from "$lib/resource-bar";
  import {
    barPartBounds,
    type Rect,
    type ResourceBarLayout,
  } from "$lib/resource-bar-layouts";

  /** Beat performer's main bar: ten 10ms steps (`fighter_battle_res_guitar`). */
  const GUITAR_STEP_MS = 100;

  let {
    layout,
    bar,
    form,
  }: {
    layout: ResourceBarLayout;
    bar: ResolvedResourceBar;
    form: ShooterForm;
  } = $props();

  function place(rect: Rect): string {
    return `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;
  }

  const bounds = $derived(barPartBounds(layout));
  const frame = $derived(
    form !== "normal" && layout.beastFrames
      ? layout.beastFrames[form]
      : layout.frame,
  );
  const reveal = $derived(revealAxes(frame.rect.w));
  const line = $derived(lastOpenResource(bar, "line"));
  const guitarEnergy = $derived(
    layout.guitar ? lastOpenResource(bar, "guitar") : null,
  );
  /** `lab_progress` shows the main resource: the Guitar one when present. */
  const progressResource = $derived(layout.guitar ? guitarEnergy : line);
  const axeBall = $derived(
    layout.axeBall ? lastOpenResource(bar, "axeBall") : null,
  );
  const ball = $derived(axeBall ? axeBallView(axeBall.now, axeBall.max) : null);

  // The coloured bar follows a buff timer, except on the guitar prefab where
  // `img_bar` is a Line resource filled by `SetFilled`.
  const barTimer = $derived(barMotionOf(bar.barBuff));
  const lineRatio = $derived(line ? resourceRatio(line) : 0);
  const guitarRatio = $derived(guitarEnergy ? resourceRatio(guitarEnergy) : 0);
</script>

<div
  class="bar-part"
  style:width={`${bounds.w}px`}
  style:height={`${bounds.h}px`}
>
  <div
    class="bar-root"
    style:left={`${-bounds.x}px`}
    style:top={`${-bounds.y}px`}
    style:width={`${layout.root.w}px`}
    style:height={`${layout.root.h}px`}
  >
    {#key frame}
      <img class="frame" src={frame.off} alt="" style={place(frame.rect)} />
      {#if layout.guitar}
        {#if bar.typeOpen.has("line")}
          <div
            class="bar-clip"
            style={place(frame.rect)}
            {@attach clipFill(() => lineRatio, reveal.clip)}
          >
            <img
              src={frame.on}
              alt=""
              style:width={`${frame.rect.w}px`}
              style:height={`${frame.rect.h}px`}
              {@attach clipFill(() => lineRatio, reveal.content)}
            />
          </div>
        {/if}
      {:else}
        <div
          class="bar-clip"
          style={place(frame.rect)}
          {@attach barMotion(() => barTimer, reveal.clip)}
        >
          <img
            src={frame.on}
            alt=""
            style:width={`${frame.rect.w}px`}
            style:height={`${frame.rect.h}px`}
            {@attach barMotion(() => barTimer, reveal.content)}
          />
        </div>
      {/if}
    {/key}

    {#if layout.inner && bar.typeOpen.has("line") && line}
      <div
        class="inner"
        style={place(layout.inner)}
        style:background={layout.inner.background ?? "#2e2e2e"}
      >
        <div class="inner-fill" {@attach clipFill(() => lineRatio)}></div>
      </div>
    {/if}

    {#if layout.guitar && bar.typeOpen.has("guitar")}
      {@const guitar = layout.guitar}
      {@const plate = revealAxes(guitar.track.w, "right")}
      <div class="guitar-track" style={place(guitar.track)}>
        <div
          class="guitar-lightning"
          style:--track-width={`${guitar.track.w}px`}
          style:background-image={`url("${guitar.lightning}")`}
        ></div>
        <div
          class="guitar-plate"
          {@attach clipFill(() => 1 - guitarRatio, plate.clip, GUITAR_STEP_MS)}
        >
          <div
            class="guitar-plate-image"
            style:background-image={`url("${guitar.plate}")`}
            {@attach clipFill(
              () => 1 - guitarRatio,
              plate.content,
              GUITAR_STEP_MS,
            )}
          ></div>
        </div>
        <div
          class="guitar-mid"
          style:mask-image={`url("${guitar.midLine}")`}
        ></div>
        <div
          class="guitar-head"
          {@attach clipFill(
            () => guitarRatio,
            offsetAxis(guitar.track.w),
            GUITAR_STEP_MS,
          )}
        ></div>
      </div>
    {/if}

    {#if progressResource?.received}
      <div class="progress" style={place(layout.progress)}>
        {progressResource.now}/{progressResource.max}
      </div>
    {/if}

    {#if layout.gem && bar.barEffectOpen}
      <img class="gem" src={layout.gem.image} alt="" style={place(layout.gem)} />
    {/if}

    {#if layout.axeBall && ball}
      {@const axe = layout.axeBall}
      <div class="axe-ball" style={place(axe.rect)}>
        <img class="axe-ball-bg" src={axe.background} alt="" />
        <div class="axe-ball-fill" style:height={`${ball.fill * 62}px`}>
          <img src={axe.light} alt="" />
        </div>
        {#if ball.full}
          <img class="axe-ball-adorn" src={axe.adorn} alt="" />
        {/if}
        <div class="axe-ball-num">{ball.percent}%</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .bar-part {
    position: relative;
    pointer-events: none;
  }

  .bar-root {
    position: absolute;
  }

  .bar-root > *,
  .guitar-track > * {
    position: absolute;
  }

  /* `anim` children draw dark frame, coloured bar, then the energy groove,
     which sits on top here (the reference page's "lifted" order). */
  .frame {
    z-index: 3;
  }

  .bar-clip {
    z-index: 4;
    overflow: hidden;
  }

  .bar-clip > img {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
  }

  .inner {
    z-index: 6;
    overflow: hidden;
  }

  .inner-fill {
    position: absolute;
    inset: 0;
    background: #ffffff;
    transform-origin: left center;
    transform: scaleX(0);
  }

  .progress {
    z-index: 5;
    color: var(--resource-text-color, #ffffff);
    font-family: "Dream Han Sans SC", sans-serif;
    font-size: var(--resource-font-size, 18px);
    font-weight: 400;
    font-synthesis: none;
    line-height: 30px;
    text-align: left;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    text-shadow: var(--overlay-text-shadow, none);
  }

  .gem {
    z-index: 5;
  }

  .guitar-track {
    z-index: 5;
    overflow: hidden;
  }

  /* Lightning groove of `ui_m_main_guitar_001`: the mask texture scrolls one
     full track per second. Two tiles slide by one track width. */
  .guitar-lightning {
    left: calc(-1 * var(--track-width));
    top: -1px;
    width: calc(2 * var(--track-width));
    height: 20px;
    background-repeat: repeat-x;
    background-size: var(--track-width) 20px;
    animation: guitar-bolt-scroll 1s linear infinite;
  }

  @keyframes guitar-bolt-scroll {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(var(--track-width));
    }
  }

  /* Dark `main_guitar` plate, Fill Origin Right, covering `1 - progress`. */
  .guitar-plate {
    left: 0;
    top: 0.3px;
    width: 100%;
    height: 19.4px;
    overflow: hidden;
  }

  .guitar-plate-image {
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }

  .guitar-mid {
    left: calc(50% - 1.52px);
    top: 0.3px;
    width: 3.04px;
    height: 19.4px;
    background-color: #000000;
    mask-size: 100% 100%;
  }

  .guitar-head {
    left: -1px;
    top: 0;
    width: 2px;
    height: 20px;
    background-color: #ed896a;
  }

  .axe-ball {
    z-index: 5;
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
