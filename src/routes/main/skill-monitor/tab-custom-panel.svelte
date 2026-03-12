<script lang="ts">
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";
  import type { CustomPanelStyle, InlineBuffEntry } from "$lib/settings-store";
  import type { CounterRulePreset } from "$lib/skill-mappings";

  interface Props {
    counterRules: CounterRulePreset[];
    availableBuffMap: Map<number, BuffDefinition>;
    getBuffDisplayName: (buffId: number) => string;
    inlineBuffSearch: string;
    filteredInlineBuffSearchResults: BuffNameInfo[];
    inlineBuffEntries: InlineBuffEntry[];
    customPanelStyle: CustomPanelStyle;
    setInlineBuffSearch: (value: string) => void;
    addInlineBuffEntry: (sourceType: "buff" | "counter", sourceId: number) => void;
    removeInlineBuffEntry: (entryId: string) => void;
    setInlineBuffLabel: (entryId: string, label: string) => void;
    moveCustomPanelEntry: (entryId: string, direction: "up" | "down") => void;
    setCustomPanelGap: (value: number) => void;
    setCustomPanelFontSize: (value: number) => void;
    setCustomPanelColumnGap: (value: number) => void;
    setCustomPanelNameColor: (value: string) => void;
    setCustomPanelValueColor: (value: string) => void;
    setCustomPanelProgressColor: (value: string) => void;
  }

  let {
    counterRules,
    availableBuffMap,
    getBuffDisplayName,
    inlineBuffSearch,
    filteredInlineBuffSearchResults,
    inlineBuffEntries,
    customPanelStyle,
    setInlineBuffSearch,
    addInlineBuffEntry,
    removeInlineBuffEntry,
    setInlineBuffLabel,
    moveCustomPanelEntry,
    setCustomPanelGap,
    setCustomPanelFontSize,
    setCustomPanelColumnGap,
    setCustomPanelNameColor,
    setCustomPanelValueColor,
    setCustomPanelProgressColor,
  }: Props = $props();

</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">Custom Panel</h2>
      <p class="text-xs text-muted-foreground">Display counters and buff text rows (no icons)</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <label class="text-xs text-muted-foreground">
        Row spacing: {customPanelStyle.gap}px
        <input
          class="w-full mt-1"
          type="range"
          min="0"
          max="24"
          step="1"
          value={customPanelStyle.gap}
          oninput={(event) => setCustomPanelGap(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        Font size: {customPanelStyle.fontSize}px
        <input
          class="w-full mt-1"
          type="range"
          min="10"
          max="28"
          step="1"
          value={customPanelStyle.fontSize}
          oninput={(event) => setCustomPanelFontSize(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        Label-value spacing: {customPanelStyle.columnGap}px
        <input
          class="w-full mt-1"
          type="range"
          min="0"
          max="240"
          step="1"
          value={customPanelStyle.columnGap}
          oninput={(event) => setCustomPanelColumnGap(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Name color
        <input
          type="color"
          value={customPanelStyle.nameColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelNameColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Value color
        <input
          type="color"
          value={customPanelStyle.valueColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelValueColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Progress bar color
        <input
          type="color"
          value={customPanelStyle.progressColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelProgressColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">Add Buff</div>
      <p class="text-xs text-muted-foreground">Only added to the custom panel text area</p>
    </div>
    <input
      class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder="Search and add buff"
      value={inlineBuffSearch}
      oninput={(event) => setInlineBuffSearch((event.currentTarget as HTMLInputElement).value)}
    />
    {#if inlineBuffSearch.trim().length > 0 && filteredInlineBuffSearchResults.length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
        {#each filteredInlineBuffSearchResults.slice(0, 30) as item (item.baseId)}
          {@const iconBuff = availableBuffMap.get(item.baseId)}
          <button
            type="button"
            class="rounded border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors p-1 cursor-pointer"
            title={item.name}
            onclick={() => addInlineBuffEntry("buff", item.baseId)}
          >
            {#if iconBuff}
              <img src={`/images/buff/${iconBuff.spriteFile}`} alt={item.name} class="w-full h-10 object-contain" />
            {:else}
              <div class="h-10 flex items-center justify-center text-[11px] text-foreground text-center">
                {item.name.slice(0, 8)}
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">Add Counter</div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      {#each counterRules as rule (rule.ruleId)}
        {@const exists = inlineBuffEntries.some((entry) => entry.sourceType === "counter" && entry.sourceId === rule.ruleId)}
        <button
          type="button"
          class="text-left rounded border px-3 py-2 transition-colors cursor-pointer {exists
            ? 'border-primary bg-primary/10'
            : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
          onclick={() => addInlineBuffEntry("counter", rule.ruleId)}
          disabled={exists}
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-medium text-foreground">{rule.name}</div>
            <div class="text-xs {exists ? 'text-primary' : 'text-muted-foreground'}">
              {exists ? "Added" : "Click to add"}
            </div>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
    <div class="text-sm font-medium text-foreground">Added Entries</div>
    {#if inlineBuffEntries.length === 0}
      <div class="text-xs text-muted-foreground">No entries yet</div>
    {/if}
    {#each inlineBuffEntries as entry, idx (entry.id)}
      {@const counterRule = entry.sourceType === "counter"
        ? counterRules.find((item) => item.ruleId === entry.sourceId)
        : null}
      {@const buffName = entry.sourceType === "buff" ? getBuffDisplayName(entry.sourceId) : null}
      <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <div class="text-xs text-muted-foreground">
          Source: {entry.sourceType === "counter" ? `Counter - ${counterRule?.name ?? `#${entry.sourceId}`}` : `Buff - ${buffName}`}
        </div>
        {#if entry.sourceType === "counter"}
          <input
            class="w-full rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground"
            value={entry.label}
            placeholder="Display name"
            oninput={(event) => setInlineBuffLabel(entry.id, (event.currentTarget as HTMLInputElement).value)}
          />
        {:else}
          <div class="rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground">
            {buffName}
          </div>
        {/if}
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
            onclick={() => moveCustomPanelEntry(entry.id, "up")}
            disabled={idx === 0}
          >
            Move Up
          </button>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
            onclick={() => moveCustomPanelEntry(entry.id, "down")}
            disabled={idx === inlineBuffEntries.length - 1}
          >
            Move Down
          </button>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-border/60 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            onclick={() => removeInlineBuffEntry(entry.id)}
          >
            Delete
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>
