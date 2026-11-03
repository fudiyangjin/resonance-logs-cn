<script lang="ts">
  import SkillIcon from "./skill-icon.svelte";
  import {
    resolveSkillDamageIcon,
    skillDamageIconBackground,
  } from "$lib/skill-damage-icons";
  import SkillDamageDigits from "./SkillDamageDigits.svelte";
  import { defaultDamageNumberStyle } from "$lib/skill-damage-groups";
  import type { SkillDamageDisplaySettings } from "$lib/settings-store";
  import {
    formatSkillDamage,
    skillDamageDurationMs,
  } from "$lib/skill-damage-display";
  import { loadSkillDamageFont } from "$lib/skill-damage-font";
  let {
    config,
    label,
    amount,
    hitCount = 1,
    animated = true,
  }: {
    config: SkillDamageDisplaySettings;
    label: string;
    amount: string;
    hitCount?: number;
    animated?: boolean;
  } = $props();
  const numberStyle = $derived(
    config.numberStyle ?? defaultDamageNumberStyle(config.fontColor),
  );
  const valueText = $derived(
    formatSkillDamage(amount, config.format) +
      (hitCount > 1 ? `[${hitCount}]` : ""),
  );
  const icon = $derived(resolveSkillDamageIcon(config.iconPath));
  let loadedFont = $state("");
  const fontFamily = $derived(
    loadedFont
      ? `${JSON.stringify(loadedFont)}, sans-serif`
      : config.fontFamily?.trim()
        ? `${JSON.stringify(config.fontFamily.trim())}, sans-serif`
        : undefined,
  );
  $effect(() => {
    const url = config.fontUrl;
    let cancelled = false;
    loadedFont = "";
    if (url)
      void loadSkillDamageFont(url)
        .then((family) => {
          if (!cancelled) loadedFont = family;
        })
        .catch((error) =>
          console.warn("Failed to load skill damage font", error),
        );
    return () => {
      cancelled = true;
    };
  });
</script>

<div
  class="damage-row"
  class:float-up={animated && config.animation === "floatUp"}
  style:--damage-label-gap={`${config.showSkillName === false ? 0 : (config.labelSpacing ?? 12)}px`}
  class:pop={animated && config.animation === "pop"}
  class:shrink={animated && config.animation === "shrink"}
  style:--damage-duration={`${skillDamageDurationMs(config.durationMs)}ms`}
>
  {#if config.showSkillName !== false}
    {#if config.nameDisplayMode === "icon" && icon}
      <span
        class="skill-label-icon"
        style:width={`${config.fontSize ?? 24}px`}
        style:height={`${config.fontSize ?? 24}px`}
        ><SkillIcon
          imagePath={icon}
          alt={label}
          background={skillDamageIconBackground(config)}
        /></span
      >
    {:else}{label}{/if}
  {/if}
  <span
    class="damage"
    style:font-family={fontFamily}
    style:font-size={`${config.fontSize ?? 24}px`}
    style:color={config.fontColor ?? "#ffd86b"}
    style:font-weight={config.fontWeight ?? 700}
  >
    <SkillDamageDigits text={valueText} style={numberStyle} />
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
