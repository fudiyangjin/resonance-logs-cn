<script lang="ts">
  import { barMotion, type BarMotion } from "$lib/bar-motion.svelte.js";
  import { t } from "$lib/i18n/index.svelte";
  import { remainingUntilMs } from "$lib/hud-temporal.svelte.js";
  import { readFlowerSnapshot } from "$lib/flower-rotation";
  import { ensureBuffAlerts, type BuffAlertRule } from "$lib/settings-store";
  import type {
    FlowerColor,
    FlowerRotationResourceDefinition,
  } from "$lib/skill-mappings";
  import {
    activeProfile,
    buffMap,
    isLayoutScaffold,
    overlayNow,
  } from "./overlay-state.svelte.js";
  import { formatTimerText, resolveAlertState } from "./overlay-utils";
  import {
    flowerCycle,
    observeFlowerRotation,
  } from "./flower-rotation.svelte.js";

  let { resource }: { resource: FlowerRotationResourceDefinition } = $props();

  const PETAL_DOT_COLORS: Record<FlowerColor, string> = {
    red: "#ef5350",
    yellow: "#ffca28",
    blue: "#42a5f5",
  };

  const scaffold = $derived(isLayoutScaffold());
  const snapshot = $derived(readFlowerSnapshot(buffMap(), resource));
  const deadlineMs = $derived(snapshot.deadlineMs);
  const visible = $derived(scaffold || deadlineMs !== null);

  const activePetals = $derived(
    scaffold
      ? resource.petals
      : resource.petals.filter((petal) => snapshot.petals.has(petal.color)),
  );

  const remainingMs = $derived.by(() => {
    if (deadlineMs === null) return scaffold ? resource.nominalDurationMs : 0;
    return remainingUntilMs(deadlineMs, overlayNow());
  });
  const timeText = $derived(formatTimerText(remainingMs));
  // From the deadline itself, never from the clock: the bar animates on its
  // own and only restarts when the countdown changes.
  const progressMotion = $derived<BarMotion>(
    deadlineMs === null
      ? { kind: "static", scale: scaffold ? 1 : 0 }
      : {
          kind: "countdown",
          deadlineMs,
          spanMs: resource.nominalDurationMs,
        },
  );

  // Alerts come solely from the user's rule for the countdown buff.
  const alertRule = $derived<BuffAlertRule | undefined>(
    ensureBuffAlerts(activeProfile()?.buffAlerts)[
      String(resource.countdownBuffId)
    ],
  );
  const alert = $derived(
    deadlineMs === null
      ? undefined
      : resolveAlertState(alertRule, remainingMs, resource.nominalDurationMs),
  );

  const nextColor = $derived(
    scaffold ? (resource.petals[0]?.color ?? null) : flowerCycle().nextColor,
  );

  // The rotation pointer is history dependent, so it cannot be a $derived.
  // The effect only depends on the snapshot; the tracker reads its own state
  // via untrack and writes to a different state.
  $effect(() => {
    const current = snapshot;
    observeFlowerRotation(current, resource);
  });
</script>

{#if visible}
  <div
    class="flower-rotation"
    class:alert-active={Boolean(alert)}
    class:alert-flash={alert?.flash === true}
    class:placeholder={scaffold && snapshot.deadlineMs === null}
    style:--alert-color={alert?.highlightColor}
    style:--alert-flash-duration={alert ? `${alert.flashIntervalMs}ms` : null}
    title={resource.label}
  >
    <div class="flower-canvas">
      <img src={resource.backgroundImage} alt="" class="flower-layer" />
      {#each activePetals as petal (petal.buffBaseId)}
        <img src={petal.image} alt={petal.color} class="flower-layer" />
      {/each}
    </div>
    <div class="flower-meta">
      <div class="flower-timer" style:color={alert?.highlightColor}>
        {timeText}
      </div>
      <div class="flower-progress">
        <div
          class="flower-progress-fill"
          {@attach barMotion(() => progressMotion)}
          style:background={alert?.applyToProgress
            ? alert.highlightColor
            : null}
        ></div>
      </div>
      <div class="flower-next">
        <span class="flower-next-label">{t("gameOverlay.flower.next")}</span>
        {#if nextColor}
          <span
            class="flower-next-dot"
            style:background={PETAL_DOT_COLORS[nextColor]}
          ></span>
        {:else}
          <span class="flower-next-unknown">?</span>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .flower-rotation {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  .flower-rotation.placeholder {
    opacity: 0.6;
  }

  .flower-canvas {
    position: relative;
    width: 63px;
    height: 51px;
    flex: none;
    border-radius: 6px;
  }

  .flower-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }

  .flower-rotation.alert-active .flower-canvas {
    box-shadow:
      0 0 0 2px var(--alert-color, #ef4444),
      0 0 8px var(--alert-color, #ef4444);
  }

  .flower-rotation.alert-flash .flower-canvas {
    animation: flower-alert-flash var(--alert-flash-duration, 600ms) ease-in-out
      infinite alternate;
  }

  .flower-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-width: 52px;
  }

  .flower-timer {
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
    text-shadow: var(--overlay-text-shadow, 1px 1px 2px rgba(0, 0, 0, 0.9));
  }

  .flower-progress {
    width: 52px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }

  .flower-progress-fill {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: #8bc34a;
    transform-origin: left center;
    will-change: transform;
  }

  .flower-next {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    color: #ffffff;
    text-shadow: var(--overlay-text-shadow, 1px 1px 2px rgba(0, 0, 0, 0.9));
  }

  .flower-next-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.6);
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  }

  .flower-next-unknown {
    opacity: 0.7;
  }

  @keyframes flower-alert-flash {
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
