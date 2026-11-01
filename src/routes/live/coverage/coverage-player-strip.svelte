<script lang="ts" module>
  export type CoveragePlayerChip = {
    entityUuid: string;
    label: string;
    /** Empty when the name-display settings hide the class. */
    className: string;
    classSpecName: string;
  };
</script>

<script lang="ts">
  /**
   * @file One-line player picker for the coverage page, styled like the
   * history target strip. Labels and class icons arrive already filtered by
   * the live name-display settings.
   */
  import { t } from "$lib/i18n/index.svelte";
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import { revealWhenActive, wheelScrollsSideways } from "../strip-attachments";

  type Props = {
    players: CoveragePlayerChip[];
    selected: string | null;
    onSelect: (entityUuid: string) => void;
  };

  let { players, selected, onSelect }: Props = $props();
</script>

<div
  class="mb-1 flex items-center gap-1 overflow-x-auto"
  role="toolbar"
  aria-label={t("live.coverage.playersLabel")}
  {@attach wheelScrollsSideways}
>
  <span
    class="text-muted-foreground shrink-0 pr-0.5 text-[10px] font-semibold tracking-wider"
    >{t("live.coverage.playersLabel")}</span
  >
  {#each players as player (player.entityUuid)}
    {@const active = player.entityUuid === selected}
    <button
      type="button"
      aria-pressed={active}
      class="inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] leading-none whitespace-nowrap transition-colors {active
        ? 'border-primary/50 bg-primary/15 text-foreground'
        : 'border-border/60 text-muted-foreground hover:bg-popover/60 hover:text-foreground'}"
      onclick={() => onSelect(player.entityUuid)}
      {@attach tooltip(() => player.label)}
      {@attach active && revealWhenActive}
    >
      {#if player.className}
        <img
          class="size-3 shrink-0 object-contain"
          src={getClassIcon(player.className)}
          alt=""
        />
      {/if}
      <span class="truncate">{player.label}</span>
    </button>
  {/each}
</div>
