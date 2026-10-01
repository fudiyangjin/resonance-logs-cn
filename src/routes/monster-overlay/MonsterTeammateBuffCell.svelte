<script lang="ts">
  import {
    hudTemporalAlert,
    hudTemporalProgressPercent,
    hudTemporalRemainingMs,
  } from "$lib/hud-temporal.svelte.js";
  import { t } from "$lib/i18n/index.svelte";
  import { formatTimerText } from "../game-overlay/overlay-utils";
  import type { MonsterTeammateBuffCell } from "./monster-types";

  let {
    cell,
    nowMs = 0,
    precise = false,
    progressColor,
    progressOpacity,
    valueColor,
  }: {
    cell: MonsterTeammateBuffCell;
    nowMs?: number;
    /** 0.1s countdown text instead of whole seconds. */
    precise?: boolean;
    progressColor: string;
    progressOpacity: number;
    valueColor: string;
  } = $props();

  const temporalNow = $derived(cell.temporal ? nowMs : 0);
  const valueText = $derived.by(() => {
    if (!cell.temporal) return cell.valueText;
    const remainingMs = hudTemporalRemainingMs(cell.temporal, temporalNow);
    return precise
      ? formatTimerText(remainingMs)
      : formatTeammateTimerText(remainingMs);
  });
  const progressPercent = $derived(
    cell.temporal
      ? Math.round(hudTemporalProgressPercent(cell.temporal, temporalNow))
      : cell.progressPercent,
  );
  const alert = $derived(
    cell.temporal
      ? hudTemporalAlert(cell.temporal, temporalNow)
      : cell.alert,
  );
  const title = $derived(
    cell.hasBuff
      ? `${cell.categoryKey ? `${cell.buffName} ` : ""}${cell.metaText ? `${cell.metaText} ` : ""}${valueText}`.trim()
      : cell.buffName,
  );

  function formatTeammateTimerText(remainingMs: number): string {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      return formatTimerText(remainingMs);
    }
    if (remainingMs <= 60_000) {
      return t("gameOverlay.timer.seconds", {
        value: String(Math.ceil(remainingMs / 1000)),
      });
    }
    return formatTimerText(remainingMs);
  }
</script>

<div
  class="buff-cell"
  class:active={cell.hasBuff}
  class:empty={!cell.hasBuff}
  class:alert-flash={alert?.flash === true}
  {title}
  style:--alert-color={alert?.highlightColor}
  style:--alert-flash-duration={alert
    ? `${alert.flashIntervalMs}ms`
    : undefined}
>
  {#if cell.hasBuff}
    <div class="cell-progress-track">
      <div
        class="cell-progress-fill"
        style:transform={`scaleX(${Math.max(
          0,
          Math.min(100, progressPercent),
        ) / 100})`}
        style:background={alert?.applyToProgress
          ? alert.highlightColor
          : progressColor}
        style:opacity={progressOpacity}
      ></div>
    </div>
    <span class="cell-value" style:color={alert?.highlightColor ?? valueColor}>
      {#if cell.metaText}
        <span class="cell-meta">{cell.metaText}</span>
      {/if}
      {valueText}
    </span>
  {/if}
</div>

<style>
  .buff-cell {
    position: relative;
    min-height: var(--row-height);
    overflow: hidden;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
  }

  .buff-cell.empty {
    opacity: 0.22;
  }

  .buff-cell.active {
    background: rgba(255, 255, 255, 0.15);
  }

  .buff-cell.alert-flash {
    animation: teammate-buff-alert-flash var(--alert-flash-duration, 600ms)
      ease-in-out infinite alternate;
  }

  .cell-progress-track {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.12);
  }

  .cell-progress-fill {
    width: 100%;
    height: 100%;
    transform-origin: left center;
  }

  .cell-value {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    height: 100%;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 2px 5px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    text-shadow: var(
      --overlay-text-shadow,
      0 1px 2px rgba(0, 0, 0, 0.9)
    );
  }

  .cell-meta {
    font-size: max(10px, calc(var(--font-size) - 2px));
    opacity: 0.9;
  }

  @keyframes teammate-buff-alert-flash {
    0% {
      opacity: 1;
      filter: brightness(1);
    }

    100% {
      opacity: 0.48;
      filter: brightness(1.55);
    }
  }
</style>
