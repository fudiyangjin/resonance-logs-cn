<script lang="ts">
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
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

  function hasInlineBuffEntry(buffId: number) {
    return inlineBuffEntries.some(
      (entry) => entry.sourceType === "buff" && entry.sourceId === buffId,
    );
  }

  function inlineBuffStatusLabel(buffId: number): string | null {
    return hasInlineBuffEntry(buffId) ? "已添加" : null;
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">自定义面板</h2>
      <p class="text-xs text-muted-foreground">用于展示计数器和 Buff 文本行（无图标）</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <label class="text-xs text-muted-foreground">
        行间距: {customPanelStyle.gap}px
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
        字体大小: {customPanelStyle.fontSize}px
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
        名称-数值间距: {customPanelStyle.columnGap}px
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
        名称颜色
        <input
          type="color"
          value={customPanelStyle.nameColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelNameColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        数值颜色
        <input
          type="color"
          value={customPanelStyle.valueColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelValueColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        进度条颜色
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
      <div class="text-sm font-medium text-foreground">添加 Buff</div>
      <p class="text-xs text-muted-foreground">仅添加到自定义面板文本区域</p>
    </div>
    <input
      class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder="搜索并添加 Buff"
      value={inlineBuffSearch}
      oninput={(event) => setInlineBuffSearch((event.currentTarget as HTMLInputElement).value)}
    />
    {#if inlineBuffSearch.trim().length > 0 && filteredInlineBuffSearchResults.length > 0}
      <BuffSearchResultGrid
        items={filteredInlineBuffSearchResults}
        {availableBuffMap}
        onSelect={(buffId) => addInlineBuffEntry("buff", buffId)}
        isDisabled={hasInlineBuffEntry}
        getStatusLabel={inlineBuffStatusLabel}
        emptyMessage="没有匹配的 Buff"
      />
    {/if}
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">添加计数器</div>
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
              {exists ? "已添加" : "点击添加"}
            </div>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
    <div class="text-sm font-medium text-foreground">已添加条目</div>
    {#if inlineBuffEntries.length === 0}
      <div class="text-xs text-muted-foreground">暂无条目</div>
    {/if}
    {#each inlineBuffEntries as entry, idx (entry.id)}
      {@const counterRule = entry.sourceType === "counter"
        ? counterRules.find((item) => item.ruleId === entry.sourceId)
        : null}
      {@const buffName = entry.sourceType === "buff" ? getBuffDisplayName(entry.sourceId) : null}
      <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <div class="text-xs text-muted-foreground">
          来源：{entry.sourceType === "counter" ? `计数器 - ${counterRule?.name ?? `#${entry.sourceId}`}` : `Buff - ${buffName}`}
        </div>
        {#if entry.sourceType === "counter"}
          <input
            class="w-full rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground"
            value={entry.label}
            placeholder="显示名称"
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
            上移
          </button>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
            onclick={() => moveCustomPanelEntry(entry.id, "down")}
            disabled={idx === inlineBuffEntries.length - 1}
          >
            下移
          </button>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-border/60 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            onclick={() => removeInlineBuffEntry(entry.id)}
          >
            删除
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>
