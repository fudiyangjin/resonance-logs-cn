<script lang="ts">
  import { SETTINGS } from "$lib/settings-store";
  import AbbreviatedNumber from "./abbreviated-number.svelte";

  let {
    abilityScore = 0,
    seasonStrength = 0,
    isLocalPlayer = false,
    suffixFontSize,
    suffixColor,
    textColor,
  }: {
    abilityScore?: number;
    seasonStrength?: number;
    isLocalPlayer?: boolean;
    suffixFontSize?: number;
    suffixColor?: string;
    textColor?: string;
  } = $props();

  const showAbilityScore = $derived(
    abilityScore > 0 &&
      (isLocalPlayer
        ? SETTINGS.live.general.state.showYourAbilityScore
        : SETTINGS.live.general.state.showOthersAbilityScore),
  );

  const showSeasonStrength = $derived(
    seasonStrength > 0 &&
      (isLocalPlayer
        ? SETTINGS.live.general.state.showYourSeasonStrength
        : SETTINGS.live.general.state.showOthersSeasonStrength),
  );

  const showPowerBadge = $derived(showAbilityScore || showSeasonStrength);
</script>

{#if showPowerBadge}
  <span
    class="inline-flex shrink-0 items-baseline tabular-nums"
    style="color: {textColor};"
  >
    <span class="opacity-70">(</span>
    {#if showAbilityScore}
      {#if SETTINGS.live.general.state.shortenAbilityScore}
        <AbbreviatedNumber num={abilityScore} {suffixFontSize} {suffixColor} />
      {:else}
        <span>{abilityScore}</span>
      {/if}
    {/if}
    {#if showAbilityScore && showSeasonStrength}
      <span class="opacity-70">-</span>
    {/if}
    {#if showSeasonStrength}
      <span>{seasonStrength}</span>
    {/if}
    <span class="opacity-70">)</span>
  </span>
{/if}
