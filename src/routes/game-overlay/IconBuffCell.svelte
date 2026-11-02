<script lang="ts">
  import {
    hudTemporalAlert,
    hudTemporalRemainingMs,
  } from "$lib/hud-temporal.svelte.js";
  import type { IconBuffDisplay } from "./overlay-types";
  import { overlayNow } from "./overlay-clock.svelte.js";
  import { formatTimerText } from "./overlay-utils";

  type PointerHandler = ((event: PointerEvent) => void) | undefined;

  let {
    buff,
    iconSize,
    showName = true,
    showTime = true,
    showLayer = true,
    standalone = false,
    editable = false,
    left = undefined,
    top = undefined,
    onPointerDown = undefined,
    onResizePointerDown = undefined,
  }: {
    buff: IconBuffDisplay;
    iconSize: number;
    showName?: boolean;
    showTime?: boolean;
    showLayer?: boolean;
    standalone?: boolean;
    editable?: boolean;
    left?: number;
    top?: number;
    onPointerDown?: PointerHandler;
    onResizePointerDown?: PointerHandler;
  } = $props();

  const temporalNow = $derived(buff.temporal ? overlayNow() : 0);
  const alert = $derived(
    buff.temporal
      ? hudTemporalAlert(buff.temporal, temporalNow)
      : buff.alert,
  );
  const timeText = $derived(
    buff.temporal
      ? formatTimerText(hudTemporalRemainingMs(buff.temporal, temporalNow))
      : buff.text,
  );

  // A player-override icon file can vanish from disk (asset protocol 403):
  // fall back to the game sprite, then hide rather than render a broken
  // image. Keyed by the failed src string itself, so a changed iconSrc
  // (e.g. a newly imported override) resets the fallback automatically.
  let failedSrc = $state<string | null>(null);
  const displayedSrc = $derived.by(() => {
    if (failedSrc === null) return buff.iconSrc;
    if (failedSrc === buff.iconSrc) return buff.fallbackSrc ?? null;
    if (failedSrc === buff.fallbackSrc) return null;
    return buff.iconSrc;
  });
</script>

<div
  class:overlay-group={standalone}
  class:editable
  class="icon-buff-cell"
  class:placeholder={buff.isPlaceholder || buff.inactive}
  class:alert-active={Boolean(alert)}
  class:alert-flash={alert?.flash === true}
  style:width={`${iconSize + 8}px`}
  style:left={left === undefined ? undefined : `${left}px`}
  style:top={top === undefined ? undefined : `${top}px`}
  style:--alert-color={alert?.highlightColor}
  style:--alert-flash-duration={alert
    ? `${alert.flashIntervalMs}ms`
    : undefined}
  onpointerdown={onPointerDown}
>
  {#if showName}
    <div
      class="buff-name-label"
      style:max-width={`${iconSize + 8}px`}
      style:color={alert?.highlightColor}
    >
      {buff.name.slice(0, 6)}
    </div>
  {/if}

  <div
    class="buff-icon-wrap"
    style:width={`${iconSize}px`}
    style:height={`${iconSize}px`}
  >
    {#if displayedSrc}
      <img
        src={displayedSrc}
        alt={buff.name}
        class="buff-icon"
        onerror={() => (failedSrc = displayedSrc)}
      />
    {/if}

    {#if showLayer && buff.layer > 1}
      <div class="layer-badge">{buff.layer}</div>
    {/if}
  </div>

  {#if showTime}
    <div
      class="buff-time"
      style:font-size={`${Math.max(10, Math.round(iconSize * 0.26))}px`}
      style:color={alert?.highlightColor}
    >
      {timeText}
    </div>
  {/if}

  {#if editable && onResizePointerDown}
    <div class="resize-handle icon" onpointerdown={onResizePointerDown}></div>
  {/if}
</div>

<style>
  .icon-buff-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 52px;
  }

  .icon-buff-cell.placeholder {
    opacity: 0.6;
  }

  .icon-buff-cell.alert-active .buff-icon-wrap {
    border-color: var(--alert-color, #ef4444);
    box-shadow:
      0 0 0 2px var(--alert-color, #ef4444),
      0 0 8px var(--alert-color, #ef4444);
  }

  .icon-buff-cell.alert-flash .buff-icon-wrap {
    animation: buff-alert-flash var(--alert-flash-duration, 600ms) ease-in-out
      infinite alternate;
  }

  .icon-buff-cell.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 8px;
    background: var(--overlay-edit-panel-bg);
    margin: -6px -4px;
    padding: 4px 2px;
  }

  .buff-name-label {
    font-size: 10px;
    color: #ffffff;
    text-shadow: var(--overlay-text-shadow, 0 0 3px rgba(0, 0, 0, 0.9));
    line-height: 1;
    max-width: 52px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .buff-icon-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .buff-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .buff-time {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    text-shadow: var(--overlay-text-shadow, 0 0 3px rgba(0, 0, 0, 0.9));
    line-height: 1;
  }

  .layer-badge {
    position: absolute;
    right: 2px;
    top: 2px;
    padding: 1px 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
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
