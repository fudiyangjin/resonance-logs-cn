<script lang="ts">
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    items: BuffNameInfo[];
    availableBuffMap: Map<number, BuffDefinition>;
    onSelect: (buffId: number) => void;
    isSelected?: (buffId: number) => boolean;
    isDisabled?: (buffId: number) => boolean;
    getStatusLabel?: (buffId: number) => string | null;
    /** Fully-resolved icon src (player override first, then game sprite).
     * When provided and non-null it takes precedence over the built-in
     * `/images/buff/...` lookup, and also gives icon-less buffs an image. */
    getIconSrc?: (buffId: number) => string | null;
    emptyMessage?: string;
    minColumnWidth?: number;
    pageSize?: number;
  }

  let {
    items,
    availableBuffMap,
    onSelect,
    isSelected = () => false,
    isDisabled = () => false,
    getStatusLabel = () => null,
    getIconSrc = () => null,
    emptyMessage,
    minColumnWidth = 180,
    pageSize = 50,
  }: Props = $props();

  const effectiveEmptyMessage = $derived(
    emptyMessage ?? t("components.buffSearchResultGrid.empty"),
  );

  let visibleCount = $state(pageSize);
  // Plain (non-reactive) reference marker: writing it cannot re-trigger the
  // effect, and the effect only reads `items`, so it cannot self-trigger.
  let previousItems: BuffNameInfo[] | null = null;

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
  <div
    class="grid gap-3"
    style:grid-template-columns={`repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`}
  >
    {#each visibleItems as item (item.baseId)}
      {@const iconBuff = availableBuffMap.get(item.baseId)}
      {@const resolvedIconSrc = getIconSrc(item.baseId)}
      {@const selected = isSelected(item.baseId)}
      {@const disabled = isDisabled(item.baseId)}
      {@const statusLabel = getStatusLabel(item.baseId)}
      {@const defaultName = iconBuff?.name ?? null}
      {@const subtitle = defaultName && defaultName !== item.name
        ? t("components.buffSearchResultGrid.subtitle.defaultWithId", {
          defaultName,
          id: item.baseId,
        })
        : item.inCatalog
          ? t("components.buffSearchResultGrid.subtitle.idOnly", { id: item.baseId })
          : t("components.buffSearchResultGrid.subtitle.idOnlyUncatalogued", { id: item.baseId })}
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
          {#if resolvedIconSrc}
            <img
              src={resolvedIconSrc}
              alt={item.name}
              class="h-full w-full object-contain p-1"
            />
          {:else if iconBuff}
            <img
              src={`/images/buff/${iconBuff.spriteFile}`}
              alt={item.name}
              class="h-full w-full object-contain p-1"
            />
          {:else}
            <div class="flex h-full w-full items-center justify-center px-1 text-center text-[11px] text-foreground">
              {item.name.slice(0, 8) || t("components.buffSearchResultGrid.fallbackIcon")}
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
  {#if remainingCount > 0}
    <button
      type="button"
      class="mt-3 w-full rounded border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      onclick={() => (visibleCount += pageSize)}
    >
      {t("components.buffSearchResultGrid.showMore", {
        remaining: remainingCount,
      })}
    </button>
  {/if}
{:else}
  <div class="text-xs text-muted-foreground">{effectiveEmptyMessage}</div>
{/if}
