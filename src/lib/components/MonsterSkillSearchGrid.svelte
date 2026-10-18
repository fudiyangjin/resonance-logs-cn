<script lang="ts">
  import type { MonsterSkillSearchItem } from "$lib/config/monster-skill-search";
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    items: MonsterSkillSearchItem[];
    onSelect: (skillId: number) => void;
    isAdded?: (skillId: number) => boolean;
    emptyMessage: string;
    pageSize?: number;
  }

  let {
    items,
    onSelect,
    isAdded = () => false,
    emptyMessage,
    pageSize = 50,
  }: Props = $props();

  let visibleCount = $state(pageSize);
  // Plain (non-reactive) reference marker: writing it cannot re-trigger the
  // effect, and the effect only reads `items`, so it cannot self-trigger.
  let previousItems: MonsterSkillSearchItem[] | null = null;

  // items arrives as a fresh array per search; reset before the DOM updates
  // so an expanded list never renders once under a new keyword.
  $effect.pre(() => {
    if (items === previousItems) return;
    previousItems = items;
    visibleCount = pageSize;
  });

  const visibleItems = $derived(items.slice(0, visibleCount));
  const remainingCount = $derived(items.length - visibleCount);
</script>

{#if items.length > 0}
  <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
    {#each visibleItems as item (item.skillId)}
      {@const added = isAdded(item.skillId)}
      <button
        type="button"
        class="border-border/60 bg-muted/20 hover:bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        title={item.name}
        disabled={added}
        onclick={() => onSelect(item.skillId)}
      >
        <span class="flex min-w-0 flex-col">
          <span class="text-foreground truncate">{item.name}</span>
          {#if item.defaultName && item.defaultName !== item.name}
            <span class="text-muted-foreground truncate text-xs">
              {item.defaultName}
            </span>
          {/if}
        </span>
        <span class="text-muted-foreground shrink-0 text-xs">
          {#if added}
            {t("monsterMonitor.monsterSkill.added")}
          {:else}
            #{item.skillId}
          {/if}
        </span>
      </button>
    {/each}
  </div>
  {#if remainingCount > 0}
    <button
      type="button"
      class="border-border/60 bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground mt-3 w-full rounded border px-3 py-2 text-xs transition-colors"
      onclick={() => (visibleCount += pageSize)}
    >
      {t("components.buffSearchResultGrid.showMore", {
        remaining: remainingCount,
      })}
    </button>
  {/if}
{:else}
  <p class="text-muted-foreground text-sm">{emptyMessage}</p>
{/if}
