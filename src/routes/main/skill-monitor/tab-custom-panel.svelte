<script lang="ts">
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import { tl } from "$lib/i18n/index.svelte";
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";
  import type {
    CustomPanelGroup,
    CustomPanelStyle,
    InlineBuffEntry,
  } from "$lib/settings-store";
  import type { CounterRulePreset } from "$lib/skill-mappings";

  interface Props {
    counterRules: CounterRulePreset[];
    availableBuffMap: Map<number, BuffDefinition>;
    getBuffDisplayName: (buffId: number) => string;
    inlineBuffSearch: string;
    filteredInlineBuffSearchResults: BuffNameInfo[];
    customPanelGroups: CustomPanelGroup[];
    customPanelStyle: CustomPanelStyle;
    setInlineBuffSearch: (value: string) => void;
    addCustomPanelGroup: () => void;
    removeCustomPanelGroup: (groupId: string) => void;
    renameCustomPanelGroup: (groupId: string, name: string) => void;
    addCustomPanelEntry: (
      groupId: string,
      sourceType: "buff" | "counter",
      sourceId: number,
    ) => void;
    removeCustomPanelEntry: (groupId: string, entryId: string) => void;
    setCustomPanelEntryLabel: (groupId: string, entryId: string, label: string) => void;
    moveCustomPanelEntry: (
      groupId: string,
      entryId: string,
      direction: "up" | "down",
    ) => void;
    setCustomPanelGap: (value: number) => void;
    setCustomPanelFontSize: (value: number) => void;
    setCustomPanelColumnGap: (value: number) => void;
    setCustomPanelNameColor: (value: string) => void;
    setCustomPanelValueColor: (value: string) => void;
    setCustomPanelProgressColor: (value: string) => void;
    setCustomPanelProgressOpacity: (value: number) => void;
  }

  let {
    counterRules,
    availableBuffMap,
    getBuffDisplayName,
    inlineBuffSearch,
    filteredInlineBuffSearchResults,
    customPanelGroups,
    customPanelStyle,
    setInlineBuffSearch,
    addCustomPanelGroup,
    removeCustomPanelGroup,
    renameCustomPanelGroup,
    addCustomPanelEntry,
    removeCustomPanelEntry,
    setCustomPanelEntryLabel,
    moveCustomPanelEntry,
    setCustomPanelGap,
    setCustomPanelFontSize,
    setCustomPanelColumnGap,
    setCustomPanelNameColor,
    setCustomPanelValueColor,
    setCustomPanelProgressColor,
    setCustomPanelProgressOpacity,
  }: Props = $props();

  let selectedGroupId = $state<string | null>(customPanelGroups[0]?.id ?? null);

  $effect(() => {
    if (customPanelGroups.length === 0) {
      selectedGroupId = null;
      return;
    }
    if (!selectedGroupId || !customPanelGroups.some((group) => group.id === selectedGroupId)) {
      selectedGroupId = customPanelGroups[0]?.id ?? null;
    }
  });

  const selectedGroup = $derived.by(
    () => customPanelGroups.find((group) => group.id === selectedGroupId) ?? null,
  );

  function getEntryLocation(
    sourceType: InlineBuffEntry["sourceType"],
    sourceId: number,
  ): { groupId: string; groupName: string } | null {
    for (const group of customPanelGroups) {
      if (group.entries.some((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId)) {
        return { groupId: group.id, groupName: group.name };
      }
    }
    return null;
  }

  function buffStatusLabel(buffId: number): string | null {
    const location = getEntryLocation("buff", buffId);
    if (!location) return null;
    return location.groupId === selectedGroup?.id
      ? tl("Already added to the current group")
      : `${tl("Already in ")}${location.groupName}`;
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">{tl("Custom Monitor Areas")}</h2>
      <p class="text-xs text-muted-foreground">
        {tl("Create multiple text monitor areas. The same buff or counter is globally unique across all areas.")}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="min-h-11 rounded-lg border border-border/60 bg-muted/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 cursor-pointer"
        onclick={addCustomPanelGroup}
      >
        {tl("New Monitor Area")}
      </button>
      <div class="text-xs text-muted-foreground" role="status" aria-live="polite">
        {#if selectedGroup}
          {tl("Currently Editing: ")}{selectedGroup.name}
        {:else}
          {tl("Select or create a monitor area")}
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {#each customPanelGroups as group (group.id)}
        {@const isSelected = group.id === selectedGroup?.id}
        <div
          class="rounded-lg border px-3 py-3 transition-colors {isSelected
            ? 'border-primary bg-primary/10'
            : 'border-border/60 bg-muted/20'}"
        >
          <div class="flex items-start justify-between gap-3">
            <button
              type="button"
              class="flex-1 text-left cursor-pointer"
              onclick={() => (selectedGroupId = group.id)}
            >
              <div class="text-sm font-medium text-foreground">{group.name}</div>
              <div class="mt-1 text-xs text-muted-foreground">
                {tl("Entries ")}{group.entries.length}
              </div>
            </button>
            <button
              type="button"
              class="min-h-11 rounded-md border border-border/60 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
              onclick={() => removeCustomPanelGroup(group.id)}
            >
              {tl("Delete")}
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if selectedGroup}
    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
      <div class="space-y-1">
        <div class="text-sm font-medium text-foreground">{tl("Current Monitor Area")}</div>
        <p class="text-xs text-muted-foreground">
          {tl("Entries in this monitor area are shown as a separate text block in the overlay and can be dragged and scaled independently.")}
        </p>
      </div>
      <label class="block text-xs text-muted-foreground">
        {tl("Monitor Area Name")}
        <input
          class="mt-1 w-full max-w-sm rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          value={selectedGroup.name}
          oninput={(event) =>
            renameCustomPanelGroup(selectedGroup.id, (event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
      <div class="space-y-1">
        <div class="text-sm font-medium text-foreground">{tl("Add Buff")}</div>
        <p class="text-xs text-muted-foreground">{tl("Only add to the text area of the current monitor area")}</p>
      </div>
      <input
        class="w-full sm:w-80 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder={tl("Search and add buffs")}
        value={inlineBuffSearch}
        oninput={(event) => setInlineBuffSearch((event.currentTarget as HTMLInputElement).value)}
      />
      {#if inlineBuffSearch.trim().length > 0}
        <BuffSearchResultGrid
          items={filteredInlineBuffSearchResults}
          {availableBuffMap}
          onSelect={(buffId) => addCustomPanelEntry(selectedGroup.id, "buff", buffId)}
          isDisabled={(buffId) => Boolean(getEntryLocation("buff", buffId))}
          getStatusLabel={buffStatusLabel}
          emptyMessage={tl("No matching Buffs")}
        />
      {/if}
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
      <div class="space-y-1">
        <div class="text-sm font-medium text-foreground">{tl("Add Counter")}</div>
        <p class="text-xs text-muted-foreground">{tl("Counters are also globally unique and can belong to only one monitor area.")}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        {#each counterRules as rule (rule.ruleId)}
          {@const location = getEntryLocation("counter", rule.ruleId)}
          {@const exists = Boolean(location)}
          <button
            type="button"
            class="min-h-11 text-left rounded border px-3 py-2 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-100 {exists
              ? 'border-primary bg-primary/10'
              : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
            onclick={() => addCustomPanelEntry(selectedGroup.id, "counter", rule.ruleId)}
            disabled={exists}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium text-foreground">{rule.name}</div>
              <div class="text-xs {exists ? 'text-primary' : 'text-muted-foreground'}">
                {#if !exists}
                  {tl("Click to add")}
                {:else if location?.groupId === selectedGroup.id}
                  {tl("Already added to the current group")}
                {:else}
                  {tl("Already in ")}{location?.groupName}
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
      <div class="text-sm font-medium text-foreground">{tl("Current Group Entries")}</div>
      {#if selectedGroup.entries.length === 0}
        <div class="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
          {tl("The current monitor area has no entries yet")}
        </div>
      {/if}
      {#each selectedGroup.entries as entry, idx (entry.id)}
        {@const counterRule = entry.sourceType === "counter"
          ? counterRules.find((item) => item.ruleId === entry.sourceId)
          : null}
        {@const buffName = entry.sourceType === "buff" ? getBuffDisplayName(entry.sourceId) : null}
        <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
          <div class="text-xs text-muted-foreground">
            {tl("Source: ")}{entry.sourceType === "counter"
              ? `${tl("Counter - ")}${counterRule?.name ?? `#${entry.sourceId}`}`
              : `Buff - ${buffName}`}
          </div>
          {#if entry.sourceType === "counter"}
            <input
              class="w-full rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={entry.label}
              placeholder={tl("Display Name")}
              oninput={(event) =>
                setCustomPanelEntryLabel(
                  selectedGroup.id,
                  entry.id,
                  (event.currentTarget as HTMLInputElement).value,
                )}
            />
          {:else}
            <div class="rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground">
              {buffName}
            </div>
          {/if}
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="min-h-11 rounded border border-border/60 px-3 py-1 text-xs hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
              onclick={() => moveCustomPanelEntry(selectedGroup.id, entry.id, "up")}
              disabled={idx === 0}
            >
              {tl("Move Up")}
            </button>
            <button
              type="button"
              class="min-h-11 rounded border border-border/60 px-3 py-1 text-xs hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
              onclick={() => moveCustomPanelEntry(selectedGroup.id, entry.id, "down")}
              disabled={idx === selectedGroup.entries.length - 1}
            >
              {tl("Move Down")}
            </button>
            <button
              type="button"
              class="min-h-11 rounded border border-border/60 px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
              onclick={() => removeCustomPanelEntry(selectedGroup.id, entry.id)}
            >
              {tl("Delete")}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="rounded-lg border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      {tl("No custom monitor areas yet. Click \"New Monitor Area\" above first, then add buffs or counters to it.")}
    </div>
  {/if}

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">{tl("Shared Style")}</h2>
      <p class="text-xs text-muted-foreground">{tl("All custom monitor areas share the text and progress bar styles below.")}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <label class="text-xs text-muted-foreground">
        {tl("Gap: ")}{customPanelStyle.gap}px
        <input
          class="mt-1 w-full"
          type="range"
          min="0"
          max="24"
          step="1"
          value={customPanelStyle.gap}
          oninput={(event) => setCustomPanelGap(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        {tl("Font Size")}: {customPanelStyle.fontSize}px
        <input
          class="mt-1 w-full"
          type="range"
          min="10"
          max="28"
          step="1"
          value={customPanelStyle.fontSize}
          oninput={(event) => setCustomPanelFontSize(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        {tl("Name-Value Gap")}: {customPanelStyle.columnGap}px
        <input
          class="mt-1 w-full"
          type="range"
          min="0"
          max="240"
          step="1"
          value={customPanelStyle.columnGap}
          oninput={(event) => setCustomPanelColumnGap(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {tl("Name Color")}
        <input
          type="color"
          value={customPanelStyle.nameColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelNameColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {tl("Value Color")}
        <input
          type="color"
          value={customPanelStyle.valueColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelValueColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {tl("Progress Color")}
        <input
          type="color"
          value={customPanelStyle.progressColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelProgressColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <div>{tl("Progress Opacity")}: {Math.round(customPanelStyle.progressOpacity * 100)}%</div>
        <input
          class="mt-2 w-full"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={customPanelStyle.progressOpacity}
          oninput={(event) =>
            setCustomPanelProgressOpacity(Number((event.currentTarget as HTMLInputElement).value))}
        />
      </label>
    </div>
  </div>
</div>
