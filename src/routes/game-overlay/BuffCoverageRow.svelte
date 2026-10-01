<script lang="ts">
  import { barMotion, type BarMotion } from "$lib/bar-motion.svelte.js";
  import { t } from "$lib/i18n/index.svelte";
  import type { BuffUpdateState } from "$lib/bindings";
  import type { BuffCoverageStyle } from "$lib/settings-store";
  import { overlayNow } from "./overlay-state.svelte.js";
  import { formatTimerText, getBuffRemainingMs } from "./overlay-utils";

  interface Props {
    name: string;
    percentText: string;
    count: number;
    activeNow: boolean;
    buff: BuffUpdateState | undefined;
    showProgress: boolean;
    style: BuffCoverageStyle;
  }

  let {
    name,
    percentText,
    count,
    activeNow,
    buff,
    showProgress,
    style,
  }: Props = $props();

  const countText = $derived(t("gameOverlay.coverage.count", { value: count }));
  const temporalNow = $derived(buff && buff.durationMs > 0 ? overlayNow() : 0);
  const remainingMs = $derived(getBuffRemainingMs(buff, temporalNow));
  const remainingText = $derived(
    buff && buff.durationMs > 0 && remainingMs > 0
      ? formatTimerText(remainingMs)
      : "",
  );
  const mainColumns = $derived(
    style.showStateDot ? "auto minmax(0, 1fr) auto" : "minmax(0, 1fr) auto",
  );
  const valueColumns = $derived.by(() => {
    const columns: string[] = [];
    if (style.showRemaining) columns.push("4.2em");
    columns.push("4.8em");
    if (style.showCount) columns.push("3.2em");
    return columns.join(" ");
  });
  // From the buff itself, never from the clock: the bar animates on its own.
  const progressMotion = $derived<BarMotion>(
    buff && buff.durationMs > 0
      ? {
          kind: "countdown",
          deadlineMs: buff.createTimeMs + buff.durationMs,
          spanMs: buff.durationMs,
        }
      : { kind: "static", scale: 0 },
  );
</script>

<div class="coverage-row">
  <div class="coverage-main" style:grid-template-columns={mainColumns}>
    {#if style.showStateDot}
      <span class="state-dot" class:active={activeNow}></span>
    {/if}
    {#if style.showName}
      <span class="row-name" style:color={style.nameColor}>{name}</span>
    {:else}
      <span class="row-name"></span>
    {/if}
    <div class="coverage-values" style:grid-template-columns={valueColumns}>
      {#if style.showRemaining}
        <span class="remaining-text">{remainingText}</span>
      {/if}
      <span class="percent-text" style:color={style.valueColor}>
        {percentText}
      </span>
      {#if style.showCount}
        <span class="count-text">{countText}</span>
      {/if}
    </div>
  </div>

  {#if showProgress}
    <div class="coverage-decay">
      <div
        class="coverage-decay-fill"
        {@attach barMotion(() => progressMotion)}
        style:background={style.progressColor}
        style:opacity={style.progressOpacity}
      ></div>
    </div>
  {/if}
</div>

<style>
  .coverage-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px 0;
    min-width: 0;
  }

  .coverage-main {
    display: grid;
    align-items: baseline;
    column-gap: 6px;
    min-width: 0;
  }

  .state-dot {
    width: 0.55em;
    height: 0.55em;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.5);
    align-self: center;
    flex-shrink: 0;
  }

  .state-dot.active {
    background: #34d399;
    box-shadow: 0 0 4px rgba(52, 211, 153, 0.9);
  }

  .row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: var(--overlay-text-shadow, 0 0 4px rgba(0, 0, 0, 0.8));
  }

  .coverage-values {
    display: grid;
    justify-items: end;
    align-items: baseline;
    column-gap: 6px;
    min-width: 0;
  }

  .remaining-text,
  .percent-text,
  .count-text {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-shadow: var(--overlay-text-shadow, 0 0 4px rgba(0, 0, 0, 0.8));
  }

  .remaining-text {
    color: rgba(226, 232, 240, 0.85);
    font-size: 0.85em;
  }

  .percent-text {
    font-weight: 600;
  }

  .count-text {
    color: rgba(148, 163, 184, 0.9);
    font-size: 0.8em;
  }

  .coverage-decay {
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }

  .coverage-decay-fill {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    will-change: transform;
  }
</style>
