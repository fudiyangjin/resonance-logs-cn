<script lang="ts">
  import { barMotion, type BarMotion } from "$lib/bar-motion.svelte.js";
  import SkillIcon from "$lib/components/skill-icon.svelte";
  import { skillBgColour } from "$lib/skill-mappings";
  import type { SkillDisplay } from "./overlay-types";

  interface Props {
    skillId?: number | undefined;
    name?: string | undefined;
    imagePath?: string | undefined;
    /** `PCBgColour` of the skill shown; defaults to `skillId`'s. */
    bgColour?: number | undefined;
    /** No display renders the skill as ready. */
    display?: SkillDisplay | null | undefined;
    /** A required resource is short, so the skill is unusable even off CD. */
    resourceBlocked?: boolean;
    derivedActive?: boolean;
    /** Edge length in px; the cell is drawn at `CELL_SIZE` and zoomed. */
    size?: number;
  }

  /** Edge length every px value below is designed for. */
  const CELL_SIZE = 52;

  let {
    skillId,
    name,
    imagePath,
    bgColour,
    display,
    resourceBlocked = false,
    derivedActive = false,
    size = CELL_SIZE,
  }: Props = $props();

  const colour = $derived(bgColour ?? skillBgColour(skillId));
  const isOnCd = $derived(display?.isActive ?? false);
  const isUsable = $derived(display?.usable ?? true);
  const isUnavailable = $derived(!isUsable || resourceBlocked);
  const isRechargingUsable = $derived(isOnCd && isUsable);
  const percent = $derived(isOnCd ? (display?.percent ?? 0) : 0);
  const rechargeMotion = $derived<BarMotion>(
    display?.rechargeMotion ?? { kind: "static", scale: 1 - percent },
  );
  /** Colour of the available-charge count; `null` for single-charge skills. */
  const chargeState = $derived.by(() => {
    const available = display?.chargesAvailable;
    const max = display?.maxCharges;
    if (available === undefined || max === undefined) return null;
    return available >= max ? "full" : available > 0 ? "partial" : "empty";
  });
</script>

<div
  class="skill-cell"
  class:empty={!skillId}
  class:on-cd={isOnCd}
  class:derived-active={derivedActive}
  class:usable-recharging={isRechargingUsable}
  style:zoom={size / CELL_SIZE}
>
  {#if skillId}
    <SkillIcon
      {imagePath}
      alt={name}
      {colour}
      dimmed={isUnavailable}
      stroke={!derivedActive}
    />
    {#if !imagePath}
      <div class="skill-fallback">#{skillId}</div>
    {/if}
  {/if}

  {#if chargeState}
    <span class="charges" data-state={chargeState}>
      {display?.chargesAvailable}
    </span>
  {/if}

  {#if isUnavailable && isOnCd}
    <div class="cd-overlay" style={`--cd-percent: ${percent}`}>
      {#if display?.text}
        <span class="cd-text">{display.text}</span>
      {/if}
    </div>
  {:else if isRechargingUsable}
    <div class="recharge-bar-wrap">
      <div class="recharge-bar" {@attach barMotion(() => rechargeMotion)}></div>
    </div>
  {/if}
</div>

<style>
  .skill-cell {
    position: relative;
    width: 52px;
    height: 52px;
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

  .skill-fallback {
    position: absolute;
    inset: 0;
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
    font-size: 15px;
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

  /* Available charges, colour-coded; outlined so it needs no backing box */
  .charges {
    position: absolute;
    top: 3px;
    right: 4px;
    z-index: 1;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    pointer-events: none;
    text-shadow: var(
      --overlay-text-shadow,
      0 0 2px rgba(0, 0, 0, 1),
      0 1px 3px rgba(0, 0, 0, 0.9)
    );
  }

  .charges[data-state="full"] {
    color: #34d399;
  }

  .charges[data-state="partial"] {
    color: #fbbf24;
  }

  .charges[data-state="empty"] {
    color: #94a3b8;
  }
</style>
