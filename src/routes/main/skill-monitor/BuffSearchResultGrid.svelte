<script lang="ts">
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";

  interface Props {
    items: BuffNameInfo[];
    availableBuffMap: Map<number, BuffDefinition>;
    onSelect: (buffId: number) => void;
    isSelected?: (buffId: number) => boolean;
    emptyMessage?: string;
    limit?: number;
    minColumnWidth?: number;
  }

  let {
    items,
    availableBuffMap,
    onSelect,
    isSelected = () => false,
    emptyMessage = "No matching buffs",
    limit = 999,
    minColumnWidth = 56,
  }: Props = $props();

  const visibleItems = $derived(items.slice(0, limit));
</script>

{#if visibleItems.length > 0}
  <div
    class="grid gap-3"
    style:grid-template-columns={`repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`}
  >
    {#each visibleItems as item (item.baseId)}
      {@const iconBuff = availableBuffMap.get(item.baseId)}
      <button
        type="button"
        class="relative group rounded-lg border overflow-hidden transition-colors {isSelected(item.baseId)
          ? 'border-primary ring-1 ring-primary'
          : 'border-border/60 hover:border-border'}"
        title={item.name}
        onclick={() => onSelect(item.baseId)}
      >
        {#if iconBuff}
          <img
            src={`/images/buff/${iconBuff.spriteFile}`}
            alt={item.name}
            class="w-full h-full object-contain aspect-square bg-muted/20"
          />
        {:else}
          <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/20 text-[11px] text-foreground p-1 text-center">
            {item.name.slice(0, 8)}
          </div>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <div class="text-xs text-muted-foreground">{emptyMessage}</div>
{/if}
