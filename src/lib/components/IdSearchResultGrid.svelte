<script lang="ts" module>
  export type IdSearchResultItem = {
    key: string;
    name: string;
    /** Right-hand detail, e.g. `#1714`. */
    detail: string;
  };
</script>

<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    items: IdSearchResultItem[];
    onSelect: (key: string) => void;
    isAdded?: (key: string) => boolean;
    addedLabel: string;
    emptyMessage: string;
    pageSize?: number;
  }

  let {
    items,
    onSelect,
    isAdded = () => false,
    addedLabel,
    emptyMessage,
    pageSize = 50,
  }: Props = $props();

  let visibleCount = $state(pageSize);
  // Plain (non-reactive) reference marker: writing it cannot re-trigger the
  // effect, and the effect only reads `items`, so it cannot self-trigger.
  let previousItems: IdSearchResultItem[] | null = null;

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
    {#each visibleItems as item (item.key)}
      {@const added = isAdded(item.key)}
      <button
        type="button"
        class="border-border/60 bg-muted/20 hover:bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        title={item.name}
        disabled={added}
        onclick={() => onSelect(item.key)}
      >
        <span class="text-foreground min-w-0 truncate">{item.name}</span>
        <span class="text-muted-foreground shrink-0 text-xs">
          {added ? addedLabel : item.detail}
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
