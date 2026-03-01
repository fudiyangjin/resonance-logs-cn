<script lang="ts">
  /**
   * @file This component displays information about a player, including their class, name, and ability score.
   */
  import { SETTINGS } from "$lib/settings-store";
  import { copyToClipboard, getClassIcon, tooltip } from "$lib/utils.svelte";
  import AbbreviatedNumber from "./abbreviated-number.svelte";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatClassSpecLabel, toClassLabel } from "$lib/class-labels";

  let {
    className = "",
    classSpecName = "",
    abilityScore = 0,
    seasonStrength = 0,
    name = "",
    uid = 0,
  }: {
    className: string;
    classSpecName: string;
    abilityScore: number;
    seasonStrength: number;
    name: string;
    uid: number;
  } = $props();

  // Use live context general settings (history pages should rely on their own components)
  let SETTINGS_YOUR_NAME = $derived(SETTINGS.live.general.state.showYourName);
  let SETTINGS_OTHERS_NAME = $derived(SETTINGS.live.general.state.showOthersName);

  // Derived helpers
  const isYou = $derived(name?.includes("You") ?? false);
  const classDisplay = $derived(
    formatClassSpecLabel(className, classSpecName) || "未知职业",
  );

  const nameDisplay = $derived(() => {
    const base = name ? name : `#${uid}`;
    if (isYou) {
      const yourSetting = normalizeNameDisplaySetting(SETTINGS_YOUR_NAME);
      if (yourSetting === "Show Your Class") {
        return `${toClassLabel(className)} (You)`;
      } else if (yourSetting === "Hide Your Name") {
        return "Hidden Name (You)";
      }
      return base;
    } else {
      const othersSetting = normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME);
      if (othersSetting === "Show Others' Class") {
        return toClassLabel(className);
      } else if (othersSetting === "Hide Others' Name") {
        return "Hidden Name";
      }
      return base;
    }
  });

  const classIconDisplay = $derived(() => {
    if (isYou) {
      if (normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) === "Hide Your Name") {
        return "blank";
      }
    } else {
      if (
        normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) === "Hide Others' Name"
      ) {
        return "blank";
      }
    }
    return className;
  });
</script>

<div class="ml-2 flex">
  <img
    {@attach tooltip(() => classDisplay)}
    class="size-5 object-contain"
    src={getClassIcon(classIconDisplay())}
    alt={classDisplay}
  />

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <span class="ml-1 cursor-pointer truncate" onclick={(error) => copyToClipboard(error, `#${uid}`)} {@attach tooltip(() => `UID: #${uid}`)}>
    {#if abilityScore !== 0}
      {#if SETTINGS.live.general.state.shortenAbilityScore}
        {#if isYou && SETTINGS.live.general.state.showYourAbilityScore}
          <AbbreviatedNumber num={abilityScore} />
  {:else if !isYou && SETTINGS.live.general.state.showOthersAbilityScore}
          <AbbreviatedNumber num={abilityScore} />
        {/if}
      {:else}
        <span>{abilityScore}</span>
      {/if}
    {:else}
      ??
    {/if}
    {#if seasonStrength > 0 && (isYou ? SETTINGS.live.general.state.showYourSeasonStrength : SETTINGS.live.general.state.showOthersSeasonStrength)}
      <span class="-ml-0.5 text-muted-foreground tabular-nums">({seasonStrength})</span>
    {/if}
    {nameDisplay()}
  </span>
</div>
