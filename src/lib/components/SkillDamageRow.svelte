<script lang="ts">
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
  }: {
    group: SkillDamageGroup;
    label: string;
    amount: string;
    hitCount?: number;
    animated?: boolean;
    /** Resolved by the caller, which owns font loading for all its rows. */
    fontFamily?: string | undefined;
  } = $props();

  const valueText = $derived(
    formatSkillDamage(amount, group.format) +
      (hitCount > 1 ? `[${hitCount}]` : ""),
  );
  const icon = $derived(
    group.labelMode === "icon" ? resolveSkillDamageIcon(group.iconPath) : null,
  );
</script>

<div
  class="damage-row"
  class:float-up={animated && group.animation === "floatUp"}
  class:pop={animated && group.animation === "pop"}
  class:shrink={animated && group.animation === "shrink"}
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
    class="damage"
    style:font-family={fontFamily}
    style:font-size={`${group.fontSize}px`}
    style:font-weight={group.fontWeight}
  >
    <SkillDamageDigits text={valueText} style={group.numberStyle} />
  </span>
</div>

<style>
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
