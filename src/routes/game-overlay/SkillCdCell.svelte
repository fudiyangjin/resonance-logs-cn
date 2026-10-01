<script lang="ts">
  import { barMotion, type BarMotion } from "$lib/bar-motion.svelte.js";
  import type { SkillDisplay } from "./overlay-types";

  interface Props {
    skillId?: number | undefined;
    name?: string | undefined;
    imagePath?: string | undefined;
    /** No display renders the skill as ready. */
    display?: SkillDisplay | null | undefined;
    /** A required resource is short, so the skill is unusable even off CD. */
    resourceBlocked?: boolean;
    derivedActive?: boolean;
    /** Edge length in px. */
    size?: number;
  }

  let {
    skillId,
    name,
    imagePath,
    display,
    resourceBlocked = false,
    derivedActive = false,
    size = 52,
  }: Props = $props();

  const isOnCd = $derived(display?.isActive ?? false);
  const isUsable = $derived(display?.usable ?? true);
  const isUnavailable = $derived(!isUsable || resourceBlocked);
  const isRechargingUsable = $derived(isOnCd && isUsable);
  const percent = $derived(isOnCd ? (display?.percent ?? 0) : 0);
  const displayText = $derived(display?.text ?? "");
  const chargesAvailable = $derived(display?.chargesAvailable);
  const maxCharges = $derived(display?.maxCharges);
  const rechargeMotion = $derived<BarMotion>(
    display?.rechargeMotion ?? { kind: "static", scale: 1 - percent },
  );
  const isFull = $derived(
    chargesAvailable !== undefined &&
      maxCharges !== undefined &&
      chargesAvailable >= maxCharges,
  );
</script>

<div
  class="skill-cell"
  class:empty={!skillId}
  class:on-cd={isOnCd}
  class:derived-active={derivedActive}
  class:usable-recharging={isRechargingUsable}
  style:--skill-cell-size={`${size}px`}
  style:--skill-cell-scale={size / 52}
>
  {#if imagePath}
    <img
      src={imagePath}
      alt={name}
      class="skill-icon"
      class:dimmed={isUnavailable}
    />
  {:else if skillId}
    <div class="skill-fallback">#{skillId}</div>
  {/if}

  {#if display?.chargesText}
    <div
      class="charges-badge"
      class:charges-full={isFull}
      class:charges-partial={!isFull &&
        chargesAvailable !== undefined &&
        chargesAvailable > 0}
      class:charges-empty={chargesAvailable === 0}
    >
      {display.chargesText}
    </div>
  {/if}

  {#if isUnavailable && isOnCd}
    <div class="cd-overlay" style={`--cd-percent: ${percent}`}>
      {#if displayText}
        <span class="cd-text">{displayText}</span>
      {/if}
    </div>
  {:else if isRechargingUsable}
    <div class="recharge-bar-wrap">
      <div class="recharge-bar" {@attach barMotion(() => rechargeMotion)}></div>
    </div>
    {#if displayText}
      <span class="recharge-text">{displayText}</span>
    {/if}
  {/if}
</div>

<style>
  .skill-cell {
    position: relative;
    width: var(--skill-cell-size, 52px);
    height: var(--skill-cell-size, 52px);
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .skill-cell.empty {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .skill-cell.derived-active {
    border-color: rgba(255, 216, 102, 0.85);
    box-shadow: 0 0 8px rgba(255, 216, 102, 0.6);
  }

  .skill-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .skill-icon.dimmed {
    filter: grayscale(80%) brightness(0.5);
  }

  .skill-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
  }

  /* Fully unavailable (on CD / charges depleted): full-cell darkening overlay */
  .cd-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: conic-gradient(
      rgba(0, 0, 0, 0.7) calc(var(--cd-percent) * 360deg),
      transparent calc(var(--cd-percent) * 360deg)
    );
  }

  .cd-text {
    font-size: max(10px, calc(15px * var(--skill-cell-scale, 1)));
    font-weight: 700;
    color: #ffffff;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    text-shadow: var(
      --overlay-text-shadow,
      0 1px 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.8)
    );
  }

  /* Usable but recharging: thin bottom progress bar, icon stays bright */
  .recharge-bar-wrap {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 0 0 5px 5px;
    overflow: hidden;
  }

  .recharge-bar {
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, #60a5fa, #93c5fd);
    border-radius: 0 0 5px 5px;
    transform-origin: left center;
    will-change: transform;
  }

  .recharge-text {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    font-size: max(9px, calc(11px * var(--skill-cell-scale, 1)));
    font-weight: 700;
    color: #ffffff;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.5);
    text-shadow: var(--overlay-text-shadow, 0 1px 2px rgba(0, 0, 0, 1));
    white-space: nowrap;
  }

  /* Charges badge: color-coded by available count */
  .charges-badge {
    position: absolute;
    right: 3px;
    top: 3px;
    padding: 2px 5px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.7);
    color: #ffffff;
    font-size: max(9px, calc(11px * var(--skill-cell-scale, 1)));
    font-weight: 700;
    line-height: 1;
  }

  .charges-badge.charges-full {
    color: #34d399;
  }

  .charges-badge.charges-partial {
    color: #fbbf24;
  }

  .charges-badge.charges-empty {
    color: #94a3b8;
  }
</style>
