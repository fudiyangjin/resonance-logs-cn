<script lang="ts">
  import { barMotion, type BarMotion } from "$lib/bar-motion.svelte.js";
  import {
    hudTemporalAlert,
    hudTemporalRemainingMs,
    type HudTemporalValue,
  } from "$lib/hud-temporal.svelte.js";
  import type { BuffAlertState } from "../../routes/game-overlay/overlay-types";
  import { overlayNow } from "../../routes/game-overlay/overlay-clock.svelte.js";
  import { formatTimerText } from "../../routes/game-overlay/overlay-utils";

  interface Props {
    label: string;
    valueText: string;
    metaText?: string | undefined;
    progressPercent: number;
    showProgress: boolean;
    nameColor: string;
    valueColor: string;
    progressColor: string;
    progressOpacity?: number | undefined;
    fontSize: number;
    columnGap?: number | undefined;
    placeholder?: boolean | undefined;
    alert?: BuffAlertState | undefined;
    temporal?: HudTemporalValue | undefined;
  }

  let {
    label,
    valueText,
    metaText,
    progressPercent,
    showProgress,
    nameColor,
    valueColor,
    progressColor,
    progressOpacity = 0.4,
    fontSize,
    columnGap = 12,
    placeholder = false,
    alert = undefined,
    temporal = undefined,
  }: Props = $props();

  const temporalNow = $derived(temporal ? overlayNow() : 0);
  const effectiveValueText = $derived(
    temporal
      ? formatTimerText(hudTemporalRemainingMs(temporal, temporalNow))
      : valueText,
  );
  // Built from the countdown itself, never from the clock: the bar animates
  // on its own and only restarts when the countdown changes.
  const progressMotion = $derived<BarMotion>(
    temporal
      ? {
          kind: "countdown",
          deadlineMs: temporal.deadlineMs,
          spanMs: temporal.durationMs,
        }
      : { kind: "static", scale: progressPercent / 100 },
  );
  const effectiveAlert = $derived(
    temporal ? hudTemporalAlert(temporal, temporalNow) : alert,
  );
</script>

<div
  class="text-buff-row"
  class:placeholder
  class:alert-flash={effectiveAlert?.flash === true}
  style:--alert-color={effectiveAlert?.highlightColor}
  style:--alert-flash-duration={effectiveAlert
    ? `${effectiveAlert.flashIntervalMs}ms`
    : undefined}
>
  {#if showProgress}
    <div class="text-buff-progress-track">
      <div
        class="text-buff-progress-fill"
        {@attach barMotion(() => progressMotion)}
        style:background={effectiveAlert?.applyToProgress
          ? effectiveAlert.highlightColor
          : progressColor}
        style:opacity={progressOpacity}
      ></div>
    </div>
  {/if}

  <div class="text-buff-main" style:gap={`${columnGap}px`}>
    <span
      class="text-buff-name"
      style:color={effectiveAlert?.highlightColor ?? nameColor}
      style:font-size={`${fontSize}px`}
    >
      {label}
    </span>
    <span class="text-buff-right">
      {#if metaText}
        <span
          class="text-buff-meta"
          style:color={effectiveAlert?.highlightColor ?? valueColor}
          style:font-size={`${Math.max(10, fontSize - 1)}px`}
        >
          {metaText}
        </span>
      {/if}
      <span
        class="text-buff-value"
        style:color={effectiveAlert?.highlightColor ?? valueColor}
        style:font-size={`${fontSize}px`}
      >
        {effectiveValueText}
      </span>
    </span>
  </div>
</div>

<style>
  .text-buff-row {
    position: relative;
    min-height: 20px;
    border-radius: 6px;
    overflow: hidden;
  }

  .text-buff-row.placeholder {
    opacity: 0.6;
  }

  .text-buff-row.alert-flash {
    animation: buff-alert-flash var(--alert-flash-duration, 600ms) ease-in-out
      infinite alternate;
  }

  .text-buff-progress-track {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.16);
    overflow: hidden;
  }

  .text-buff-progress-fill {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    will-change: transform;
  }

  .text-buff-main {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 2px 6px;
    text-shadow: var(
      --overlay-text-shadow,
      0 0 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.7),
      0 1px 2px rgba(0, 0, 0, 0.9)
    );
  }

  .text-buff-name {
    min-width: 0;
    flex: 1 1 auto;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .text-buff-right {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    flex: 0 0 auto;
    min-width: 0;
  }

  .text-buff-meta,
  .text-buff-value {
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .text-buff-value {
    font-weight: 600;
  }

  @keyframes buff-alert-flash {
    0% {
      opacity: 1;
      filter: brightness(1);
    }

    100% {
      opacity: 0.45;
      filter: brightness(1.6);
    }
  }
</style>
