<script lang="ts">
  /**
   * @file Renders a player's most recent fantasy (resonance echo) casts as
   * small circular icons, inline in the live window's player row. Replaces
   * the old "permanent display" panel on the monster overlay, which took up
   * too much space with a full party.
   */
  import { getFantasyCasts } from "$lib/stores/fantasy-cast-store.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { tooltip } from "$lib/utils.svelte";
  import { t } from "$lib/i18n/index.svelte";

  let { entityUuid, size = 16 }: { entityUuid: string; size?: number } =
    $props();

  const showFantasyCastIcons = $derived(
    SETTINGS.live.general.state.showFantasyCastIcons === true,
  );
  const casts = $derived(
    showFantasyCastIcons ? getFantasyCasts(entityUuid) : [],
  );
</script>

{#if casts.length > 0}
  <span class="inline-flex shrink-0 items-center gap-1">
    {#each casts as cast (cast.id)}
      <img
        src={cast.iconPath}
        alt=""
        class="fantasy-cast-icon"
        class:fantasy-cast-icon-max={cast.remodelLevel === 5}
        style="width: {size}px; height: {size}px;"
        {@attach tooltip(() =>
          t("live.player.fantasyCastTooltip", {
            name: cast.name,
            level: cast.remodelLevel,
          }),
        )}
      />
    {/each}
  </span>
{/if}

<style>
  .fantasy-cast-icon {
    border-radius: 50%;
    object-fit: cover;
    box-sizing: border-box;
    border: 2px solid silver;
    flex-shrink: 0;
  }

  .fantasy-cast-icon-max {
    border-color: gold;
  }
</style>
