<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import SkillIcon from "./skill-icon.svelte";
  import SkillDamageDigits from "./SkillDamageDigits.svelte";
  import {
    resolveSkillDamageIcon,
    skillDamageIconBackground,
  } from "$lib/skill-damage-icons";
  import { formatSkillDamage } from "$lib/skill-damage-display";
  import type { SkillDamageGroup } from "$lib/skill-damage-settings";

  let {
    group,
    label,
    amount,
    hitCount = 1,
    animated = true,
    fontFamily,
    phase,
    comboCount,
  }: {
    group: SkillDamageGroup;
    label: string;
    amount: string;
    hitCount?: number;
    animated?: boolean;
    /** Resolved by the caller, which owns font loading for all its rows. */
    fontFamily?: string | undefined;
    /**
     * Set on a continuous total: still counting (`active`) or settled
     * (`final`). A plain hit row has none.
     */
    phase?: "active" | "final" | undefined;
    /** Hits summed into a continuous total. */
    comboCount?: number | undefined;
  } = $props();

  const animation = $derived(
    phase === "active"
      ? group.continuousAnimation
      : phase === "final"
        ? group.continuousFinalAnimation
        : group.animation,
  );
  const valueText = $derived(
    formatSkillDamage(amount, group.format) +
      (phase === undefined && hitCount > 1 ? `[${hitCount}]` : ""),
  );
  const icon = $derived(
    group.labelMode === "icon" ? resolveSkillDamageIcon(group.iconPath) : null,
  );

  /**
   * Each new hit of a running total replays the row's entrance, as if the row
   * had just appeared. The CSS animations are restarted in place rather than
   * by remounting the row: a remount would rebuild the number's SVG, its
   * filters and its size observers on every hit.
   */
  const replayOnHit: Attachment<HTMLElement> = (row) => {
    let shown = untrack(() => comboCount);
    $effect(() => {
      const count = comboCount;
      if (count === shown) return;
      shown = count;
      if (phase !== "active") return;
      for (const running of row.getAnimations({ subtree: true })) {
        if (!(running instanceof CSSAnimation)) continue;
        running.cancel();
        running.play();
      }
    });
  };
</script>

<div
  class="damage-row"
  {@attach replayOnHit}
  class:running={phase === "active"}
  class:float-up={animated && animation === "floatUp"}
  class:pop={animated && animation === "pop"}
  class:shrink={animated && animation === "shrink"}
  style:--damage-label-gap={`${group.labelMode === "none" ? 0 : group.labelSpacing}px`}
  style:--damage-duration={`${group.durationMs}ms`}
>
  {#if icon}
    <span
      class="skill-label-icon"
      style:width={`${group.fontSize}px`}
      style:height={`${group.fontSize}px`}
      ><SkillIcon
        imagePath={icon}
        alt={label}
        background={skillDamageIconBackground(group)}
      /></span
    >
  {:else if group.labelMode !== "none"}{label}{/if}
  <span
    class="damage-block"
    class:combo-top={group.comboPosition === "top"}
    class:combo-left={group.comboPosition === "left"}
    class:combo-right={group.comboPosition === "right"}
    style:gap={`${group.comboSpacing}px`}
  >
    <span
      class="damage"
      style:font-family={fontFamily}
      style:font-size={`${group.fontSize}px`}
      style:font-weight={group.fontWeight}
    >
      <SkillDamageDigits text={valueText} style={group.numberStyle} />
    </span>
    {#if group.showComboCount && comboCount !== undefined}
      <span
        class="combo"
        style:font-family={fontFamily}
        style:font-size={`${group.fontSize * 0.55}px`}
        style:font-weight={group.fontWeight}
      >
        <SkillDamageDigits
          text={group.comboFormat === "multiplier"
            ? `\u00d7${comboCount}`
            : `${comboCount} HIT`}
          style={group.numberStyle}
        />
      </span>
    {/if}
  </span>
</div>

<style>
  /*
   * A running total only enters, again on every hit; it leaves by turning
   * into its settled row.
   */
  .running.pop {
    animation: running-pop 200ms ease-out both;
  }
  .running.float-up {
    animation: running-float 200ms ease-out both;
  }
  @keyframes running-pop {
    0% {
      opacity: 0;
      transform: scale(0.6);
    }
    70% {
      opacity: 1;
      transform: scale(1.08);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes running-float {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .damage-block {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
  }
  .combo-top {
    flex-direction: column-reverse;
  }
  .combo-left {
    flex-direction: row-reverse;
  }
  .combo-right {
    flex-direction: row;
  }
  .combo {
    display: inline-block;
    line-height: 1.25;
  }

  .skill-label-icon {
    display: inline-block;
    vertical-align: middle;
    border-radius: 4px;
  }
  .damage {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
  }
  .damage-row {
    display: flex;
    align-items: center;
    column-gap: var(--damage-label-gap);
    white-space: nowrap;
  }
  .float-up {
    animation: float-up var(--damage-duration) linear both;
  }
  @keyframes float-up {
    0% {
      opacity: 0;
      transform: translateY(18px);
    }
    12% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-42px);
    }
  }
  .pop {
    animation: pop var(--damage-duration) both;
    transform-origin: left center;
  }
  .shrink .damage {
    animation: shrink min(var(--damage-duration), 160ms)
      cubic-bezier(0.16, 1, 0.3, 1) both;
    transform-origin: center;
  }
  @keyframes shrink {
    from {
      transform: scale(1.9);
    }
    60% {
      transform: scale(0.96);
    }
    82% {
      transform: scale(1.03);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: scale(0.6) translateY(12px);
    }
    10% {
      opacity: 1;
      transform: scale(1.12);
    }
    18%,
    75% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-15px);
    }
  }
</style>
