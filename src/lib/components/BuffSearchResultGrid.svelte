<script lang="ts">
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";

  interface Props {
    items: BuffNameInfo[];
    availableBuffMap: Map<number, BuffDefinition>;
    onSelect: (buffId: number) => void;
    isSelected?: (buffId: number) => boolean;
    isDisabled?: (buffId: number) => boolean;
    getStatusLabel?: (buffId: number) => string | null;
    emptyMessage?: string;
    minColumnWidth?: number;
  }

  let {
    items,
    availableBuffMap,
    onSelect,
    isSelected = () => false,
    isDisabled = () => false,
    getStatusLabel = () => null,
    emptyMessage = "没有匹配的 Buff",
    minColumnWidth = 180,
  }: Props = $props();
</script>

{#if items.length > 0}
  <div
    class="grid gap-3"
    style:grid-template-columns={`repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`}
  >
    {#each items as item (item.baseId)}
      {@const iconBuff = availableBuffMap.get(item.baseId)}
      {@const selected = isSelected(item.baseId)}
      {@const disabled = isDisabled(item.baseId)}
      {@const statusLabel = getStatusLabel(item.baseId)}
      {@const defaultName = iconBuff?.name ?? null}
      {@const subtitle = defaultName && defaultName !== item.name
        ? `${defaultName} · ID ${item.baseId}`
        : `ID ${item.baseId}`}
      <button
        type="button"
        class={`group relative flex items-start gap-3 rounded-lg border bg-card/40 p-3 text-left transition-all ${selected
            ? "border-primary bg-primary/10 ring-1 ring-primary/40"
            : "border-border/60 hover:border-primary/50 hover:bg-card/60"} ${disabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer"}`}
        title={item.name}
        disabled={disabled}
        onclick={() => onSelect(item.baseId)}
      >
        <div class="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20">
          {#if iconBuff}
            <img
              src={`/images/buff/${iconBuff.spriteFile}`}
              alt={item.name}
              class="h-full w-full object-contain p-1"
            />
          {:else}
            <div class="flex h-full w-full items-center justify-center px-1 text-center text-[11px] text-foreground">
              {item.name.slice(0, 8)}
            </div>
          {/if}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="break-words text-sm font-medium leading-5 text-foreground">
                {item.name}
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {subtitle}
              </div>
            </div>
            {#if statusLabel}
              <span class="shrink-0 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                {statusLabel}
              </span>
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>
{:else}
  <div class="text-xs text-muted-foreground">{emptyMessage}</div>
{/if}
