<script lang="ts">
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  const t = uiT("overlay/skill-monitor/buff-monitor", () => SETTINGS.live.general.state.language);

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
    emptyMessage,
    minColumnWidth = 180,
  }: Props = $props();

  const localizedEmptyMessage = $derived(emptyMessage ?? t("search.noMatchingBuffs", "No matching Buffs"));
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
        ? `${defaultName} - ${t("search.id", "ID")} ${item.baseId}`
        : `${t("search.id", "ID")} ${item.baseId}`}
      {@const hoverTitle = [
        item.name,
        `${t("search.buffId", "Buff ID")}: #${item.baseId}`,
        defaultName && defaultName !== item.name ? `${t("search.default", "Default")}: ${defaultName}` : "",
        statusLabel ? `${t("search.status", "Status")}: ${statusLabel}` : "",
      ].filter(Boolean).join("\n")}
      <button
        type="button"
        class={`group relative flex flex-col rounded-lg border bg-card/40 p-3 text-left transition-all ${selected
            ? "border-primary bg-primary/10 ring-1 ring-primary/40"
            : "border-border/60 hover:border-primary/50 hover:bg-card/60"} ${disabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer"}`}
        title={hoverTitle}
        disabled={disabled}
        onclick={() => onSelect(item.baseId)}
      >
        <div class="flex min-w-0 items-start gap-3">
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

          <div class="min-w-0 flex-1 self-stretch">
            <div class="flex h-full min-w-0 flex-col justify-between gap-2">
              <div class="min-w-0">
                <div class="break-words text-sm font-medium leading-5 text-foreground">
                  {item.name}
                </div>
                <div class="mt-1 text-xs text-muted-foreground">
                  {subtitle}
                </div>
              </div>
            </div>
          </div>
        </div>
        {#if statusLabel}
          <div class="flex justify-center pt-2">
            <span class="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              {statusLabel}
            </span>
          </div>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <div class="text-xs text-muted-foreground">{localizedEmptyMessage}</div>
{/if}
