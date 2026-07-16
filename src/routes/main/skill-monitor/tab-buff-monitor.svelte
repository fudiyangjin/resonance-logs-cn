<script lang="ts">
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import type {
    BuffCategoryDefinition,
    BuffCategoryKey,
    BuffDefinition,
    BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import type {
    BuffAlertMap,
    BuffAlertRule,
    BuffDisplayMode,
    BuffGroup,
    OverlayTextStyle,
    TextBuffPanelDisplayMode,
    TextBuffPanelStyle,
  } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import OverlayTextStyleFields from "./overlay-text-style-fields.svelte";

  type BuffGroupUpdateHandler = (
    updater: (curr: BuffGroup) => BuffGroup,
  ) => void;

  interface Props {
    buffSearch: string;
    filteredBuffs: BuffNameInfo[];
    monitoredBuffIds: number[];
    monitoredBuffCategories: BuffCategoryKey[];
    expandedSelectedBuffIds: number[];
    selectedBuffs: BuffDefinition[];
    selectedBuffCategories: BuffCategoryDefinition[];
    availableBuffs: BuffDefinition[];
    buffCategoryDefinitions: BuffCategoryDefinition[];
    availableBuffMap: Map<number, BuffDefinition>;
    buffAliasSectionExpanded: boolean;
    setBuffAliasSectionExpanded: (expanded: boolean) => void;
    buffAliasSearch: string;
    setBuffAliasSearch: (value: string) => void;
    buffAliasSearchResults: BuffNameInfo[];
    buffAliasEditingBuffId: number | null;
    setBuffAliasEditingBuffId: (buffId: number | null) => void;
    configuredBuffAliasIds: number[];
    getBuffDisplayName: (buffId: number) => string;
    getBuffDefaultName: (buffId: number) => string;
    getBuffAlias: (buffId: number) => string;
    setBuffAlias: (buffId: number, alias: string) => void;
    resetBuffAlias: (buffId: number) => void;
    isBuffSelected: (buffId: number) => boolean;
    isBuffCategorySelected: (categoryKey: BuffCategoryKey) => boolean;
    toggleBuff: (buffId: number) => void;
    toggleBuffCategory: (categoryKey: BuffCategoryKey) => void;
    clearBuffs: () => void;
    setBuffSearch: (value: string) => void;

    buffDisplayMode: BuffDisplayMode;
    setBuffDisplayMode: (mode: BuffDisplayMode) => void;
    textBuffMaxVisible: number;
    setTextBuffMaxVisible: (value: number) => void;
    textBuffPanelStyle: TextBuffPanelStyle;
    setTextBuffPanelDisplayMode: (value: TextBuffPanelDisplayMode) => void;
    setTextBuffPanelGap: (value: number) => void;
    setTextBuffPanelFontSize: (value: number) => void;
    setTextBuffPanelColumnGap: (value: number) => void;
    setTextBuffPanelNameColor: (value: string) => void;
    setTextBuffPanelValueColor: (value: string) => void;
    setTextBuffPanelProgressColor: (value: string) => void;
    setTextBuffPanelProgressOpacity: (value: number) => void;
    setTextBuffPanelTextShadowEnabled: (value: boolean) => void;
    setTextBuffPanelBackgroundEnabled: (value: boolean) => void;
    setTextBuffPanelBackgroundOpacity: (value: number) => void;
    overlayTextStyle: OverlayTextStyle;
    setOverlayTextShadowEnabled: (value: boolean) => void;
    setOverlayBackgroundEnabled: (value: boolean) => void;
    setOverlayBackgroundOpacity: (value: number) => void;

    globalPrioritySearch: string;
    globalPrioritySearchResults: BuffNameInfo[];
    setGlobalPrioritySearch: (value: string) => void;
    buffPriorityIds: number[];
    toggleGlobalPriority: (buffId: number) => void;
    moveGlobalPriority: (buffId: number, direction: "up" | "down") => void;
    buffAlerts: BuffAlertMap;
    buffAlertSectionExpanded: boolean;
    setBuffAlertSectionExpanded: (expanded: boolean) => void;
    alertSearch: string;
    alertSearchResults: BuffNameInfo[];
    alertEligibleBuffIds: number[];
    setAlertSearch: (value: string) => void;
    upsertBuffAlert: (buffId: number, patch: Partial<BuffAlertRule>) => void;
    removeBuffAlert: (buffId: number) => void;

    voiceBuffSectionExpanded: boolean;
    setVoiceBuffSectionExpanded: (expanded: boolean) => void;
    voiceBuffSearch: string;
    setVoiceBuffSearch: (value: string) => void;
    voiceBuffSearchResults: BuffNameInfo[];
    configuredVoiceBuffIds: number[];
    removeVoiceBuffBinding: (buffId: number) => void;

    individualMonitorAllGroup: BuffGroup | null;
    addIndividualMonitorAll: () => void;
    removeIndividualMonitorAll: () => void;
    updateIndividualMonitorAllGroup: (
      updater: (group: BuffGroup) => BuffGroup,
    ) => void;

    buffGroups: BuffGroup[];
    addBuffGroup: () => void;
    removeBuffGroup: (groupId: string) => void;
    updateBuffGroup: (
      groupId: string,
      updater: (group: BuffGroup) => BuffGroup,
    ) => void;
    getGroupSearchKeyword: (groupId: string) => string;
    setGroupSearchKeyword: (groupId: string, value: string) => void;
    getGroupSearchResults: (group: BuffGroup) => BuffNameInfo[];
    getGroupPrioritySearchKeyword: (groupId: string) => string;
    setGroupPrioritySearchKeyword: (groupId: string, value: string) => void;
    getGroupPrioritySearchResults: (group: BuffGroup) => BuffNameInfo[];
    getGroupPriorityIds: (group: BuffGroup) => number[];
    toggleBuffCategoryInGroup: (
      groupId: string,
      categoryKey: BuffCategoryKey,
    ) => void;
    hasCompleteBuffCategoryInGroup: (
      group: BuffGroup,
      categoryKey: BuffCategoryKey,
    ) => boolean;
    toggleBuffInGroup: (groupId: string, buffId: number) => void;
    togglePriorityInGroup: (groupId: string, buffId: number) => void;
    moveGroupPriority: (
      groupId: string,
      buffId: number,
      direction: "up" | "down",
    ) => void;
  }

  let {
    buffSearch,
    filteredBuffs,
    monitoredBuffIds,
    monitoredBuffCategories,
    expandedSelectedBuffIds,
    selectedBuffs,
    selectedBuffCategories,
    availableBuffs,
    buffCategoryDefinitions,
    availableBuffMap,
    buffAliasSectionExpanded,
    setBuffAliasSectionExpanded,
    buffAliasSearch,
    setBuffAliasSearch,
    buffAliasSearchResults,
    buffAliasEditingBuffId,
    setBuffAliasEditingBuffId,
    configuredBuffAliasIds,
    getBuffDisplayName,
    getBuffDefaultName,
    getBuffAlias,
    setBuffAlias,
    resetBuffAlias,
    isBuffSelected,
    isBuffCategorySelected,
    toggleBuff,
    toggleBuffCategory,
    clearBuffs,
    setBuffSearch,
    buffDisplayMode,
    setBuffDisplayMode,
    textBuffMaxVisible,
    setTextBuffMaxVisible,
    textBuffPanelStyle,
    setTextBuffPanelDisplayMode,
    setTextBuffPanelGap,
    setTextBuffPanelFontSize,
    setTextBuffPanelColumnGap,
    setTextBuffPanelNameColor,
    setTextBuffPanelValueColor,
    setTextBuffPanelProgressColor,
    setTextBuffPanelProgressOpacity,
    setTextBuffPanelTextShadowEnabled,
    setTextBuffPanelBackgroundEnabled,
    setTextBuffPanelBackgroundOpacity,
    overlayTextStyle,
    setOverlayTextShadowEnabled,
    setOverlayBackgroundEnabled,
    setOverlayBackgroundOpacity,
    globalPrioritySearch,
    globalPrioritySearchResults,
    setGlobalPrioritySearch,
    buffPriorityIds,
    toggleGlobalPriority,
    moveGlobalPriority,
    buffAlerts,
    buffAlertSectionExpanded,
    setBuffAlertSectionExpanded,
    alertSearch,
    alertSearchResults,
    alertEligibleBuffIds,
    setAlertSearch,
    upsertBuffAlert,
    removeBuffAlert,
    voiceBuffSectionExpanded,
    setVoiceBuffSectionExpanded,
    voiceBuffSearch,
    setVoiceBuffSearch,
    voiceBuffSearchResults,
    configuredVoiceBuffIds,
    removeVoiceBuffBinding,
    individualMonitorAllGroup,
    addIndividualMonitorAll,
    removeIndividualMonitorAll,
    updateIndividualMonitorAllGroup,
    buffGroups,
    addBuffGroup,
    removeBuffGroup,
    updateBuffGroup,
    getGroupSearchKeyword,
    setGroupSearchKeyword,
    getGroupSearchResults,
    getGroupPrioritySearchKeyword,
    setGroupPrioritySearchKeyword,
    getGroupPrioritySearchResults,
    getGroupPriorityIds,
    toggleBuffCategoryInGroup,
    hasCompleteBuffCategoryInGroup,
    toggleBuffInGroup,
    togglePriorityInGroup,
    moveGroupPriority,
  }: Props = $props();

  function buffSearchStatusLabel(buffId: number): string | null {
    return isBuffSelected(buffId)
      ? t("skillMonitor.buff.status.selected")
      : null;
  }

  function buffAliasStatusLabel(buffId: number): string | null {
    if (buffAliasEditingBuffId === buffId)
      return t("skillMonitor.buff.status.editing");
    return configuredBuffAliasIds.includes(buffId)
      ? t("skillMonitor.buff.status.aliased")
      : null;
  }

  function getBuffGroupDisplayName(group: BuffGroup, index: number): string {
    const trimmedName = group.name.trim();
    if (trimmedName) return trimmedName;
    return group.monitorAll
      ? t("skillMonitor.defaults.allBuffGroupName")
      : t("skillMonitor.defaults.buffGroupName", { index: index + 1 });
  }

  function getIndividualAllGroupDisplayName(group: BuffGroup): string {
    return group.name.trim() || t("skillMonitor.defaults.allBuffGroupName");
  }

  function getFilteredGlobalPrioritySearchResults(): BuffNameInfo[] {
    const ids = new Set<number>();
    return globalPrioritySearchResults.filter((item) => {
      if (ids.has(item.baseId)) return false;
      if (!expandedSelectedBuffIds.includes(item.baseId)) return false;
      if (buffPriorityIds.includes(item.baseId)) return false;
      ids.add(item.baseId);
      return true;
    });
  }

  const configuredAlertBuffIds = $derived.by(() =>
    Object.keys(buffAlerts)
      .map((baseId) => Number(baseId))
      .filter(
        (baseId) =>
          Number.isFinite(baseId) && alertEligibleBuffIds.includes(baseId),
      )
      .sort((a, b) => a - b),
  );

  function getFilteredAlertSearchResults(): BuffNameInfo[] {
    const ids: number[] = [];
    return alertSearchResults.filter((item) => {
      if (ids.includes(item.baseId)) return false;
      if (!alertEligibleBuffIds.includes(item.baseId)) return false;
      if (buffAlerts[String(item.baseId)]) return false;
      ids.push(item.baseId);
      return true;
    });
  }

  // Transient: which buff's binding panel is expanded via the "add" search.
  // Nothing is persisted until the user enables at least one event inside
  // `VoiceBindingControl`, so there's no separate "confirm add" step.
  let voiceEditingBuffId = $state<number | null>(null);
  const pendingVoiceBuffId = $derived(
    voiceEditingBuffId !== null &&
      !configuredVoiceBuffIds.includes(voiceEditingBuffId)
      ? voiceEditingBuffId
      : null,
  );

  function removeConfiguredVoiceBuff(buffId: number) {
    removeVoiceBuffBinding(buffId);
    if (voiceEditingBuffId === buffId) voiceEditingBuffId = null;
  }
</script>

{#snippet buffGroupLayoutControls(
  group: BuffGroup,
  onUpdate: BuffGroupUpdateHandler,
)}
  <div class="grid grid-cols-2 gap-3">
    <label class="text-muted-foreground text-xs">
      {t("skillMonitor.layoutControls.iconSize", { value: group.iconSize })}
      <input
        class="mt-1 w-full"
        type="range"
        min="24"
        max="120"
        step="1"
        value={group.iconSize}
        oninput={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            iconSize: Number((event.currentTarget as HTMLInputElement).value),
          }))}
      />
    </label>
    <label class="text-muted-foreground text-xs">
      {t("skillMonitor.layoutControls.columns", { value: group.columns })}
      <input
        class="mt-1 w-full"
        type="range"
        min="1"
        max="12"
        step="1"
        value={group.columns}
        oninput={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            columns: Number((event.currentTarget as HTMLInputElement).value),
          }))}
      />
    </label>
    <label class="text-muted-foreground text-xs">
      {t("skillMonitor.layoutControls.rows", { value: group.rows })}
      <input
        class="mt-1 w-full"
        type="range"
        min="1"
        max="12"
        step="1"
        value={group.rows}
        oninput={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            rows: Number((event.currentTarget as HTMLInputElement).value),
          }))}
      />
    </label>
    <label class="text-muted-foreground text-xs">
      {t("skillMonitor.layoutControls.gap", { value: group.gap })}
      <input
        class="mt-1 w-full"
        type="range"
        min="0"
        max="16"
        step="1"
        value={group.gap}
        oninput={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            gap: Number((event.currentTarget as HTMLInputElement).value),
          }))}
      />
    </label>
  </div>
  <div class="flex flex-wrap gap-3">
    <label
      class="border-border/60 bg-muted/20 text-foreground flex items-center gap-2 rounded border px-3 py-2 text-xs"
    >
      <input
        type="checkbox"
        checked={group.showName}
        onchange={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            showName: (event.currentTarget as HTMLInputElement).checked,
          }))}
      />
      {t("skillMonitor.layoutControls.showName")}
    </label>
    <label
      class="border-border/60 bg-muted/20 text-foreground flex items-center gap-2 rounded border px-3 py-2 text-xs"
    >
      <input
        type="checkbox"
        checked={group.showTime}
        onchange={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            showTime: (event.currentTarget as HTMLInputElement).checked,
          }))}
      />
      {t("skillMonitor.layoutControls.showTime")}
    </label>
    <label
      class="border-border/60 bg-muted/20 text-foreground flex items-center gap-2 rounded border px-3 py-2 text-xs"
    >
      <input
        type="checkbox"
        checked={group.showLayer}
        onchange={(event) =>
          onUpdate((curr: BuffGroup) => ({
            ...curr,
            showLayer: (event.currentTarget as HTMLInputElement).checked,
          }))}
      />
      {t("skillMonitor.layoutControls.showLayer")}
    </label>
  </div>
{/snippet}

<div class="space-y-6">
  <div
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-foreground text-base font-semibold">
          {t("skillMonitor.buff.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.description")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.selectedSummary", {
            buffCount: monitoredBuffIds.length,
            categoryCount: monitoredBuffCategories.length,
          })}
        </div>
        <button
          type="button"
          class="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded border px-2 py-1 text-xs transition-colors"
          onclick={clearBuffs}
        >
          {t("skillMonitor.common.clear")}
        </button>
      </div>
    </div>

    <input
      class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-64"
      placeholder={t("skillMonitor.buff.placeholder")}
      value={buffSearch}
      oninput={(event) =>
        setBuffSearch((event.currentTarget as HTMLInputElement).value)}
    />

    {#if buffSearch.trim().length > 0}
      <BuffSearchResultGrid
        items={filteredBuffs}
        {availableBuffMap}
        onSelect={toggleBuff}
        isSelected={isBuffSelected}
        getStatusLabel={buffSearchStatusLabel}
        emptyMessage={t("components.buffSearchResultGrid.empty")}
      />
    {:else}
      <div class="text-muted-foreground text-xs">
        {t("skillMonitor.buff.searchPrompt")}
      </div>
    {/if}

    <div class="space-y-2">
      <div class="text-muted-foreground text-xs">
        {t("skillMonitor.buff.selectedTitle")}
      </div>
      <div class="flex flex-wrap gap-2">
        {#each monitoredBuffIds as buffId (buffId)}
          {@const iconBuff = selectedBuffs.find(
            (buff) => buff.baseId === buffId,
          )}
          {#if iconBuff}
            <button
              type="button"
              class="border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30 relative size-12 overflow-hidden rounded-md border"
              title={getBuffDisplayName(buffId)}
              onclick={() => toggleBuff(iconBuff.baseId)}
            >
              <img
                src={`/images/buff/${iconBuff.spriteFile}`}
                alt={getBuffDisplayName(buffId)}
                class="h-full w-full object-contain"
              />
            </button>
          {:else}
            <button
              type="button"
              class="border-border/60 bg-muted/20 text-foreground hover:border-border hover:bg-muted/30 rounded-md border px-2 py-1 text-[11px]"
              title={getBuffDisplayName(buffId)}
              onclick={() => toggleBuff(buffId)}
            >
              {getBuffDisplayName(buffId)}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  </div>

  <div
    class="border-border/60 bg-card/40 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <button
      type="button"
      class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
      onclick={() => setBuffAliasSectionExpanded(!buffAliasSectionExpanded)}
    >
      <div class="text-left">
        <h2 class="text-foreground text-base font-semibold">
          {t("skillMonitor.buff.alias.title")}
        </h2>
      </div>
      <ChevronDown
        class="text-muted-foreground h-5 w-5 transition-transform duration-200 {buffAliasSectionExpanded
          ? 'rotate-180'
          : ''}"
      />
    </button>

    {#if buffAliasSectionExpanded}
      <div class="space-y-4 px-4 pb-4">
        <div class="space-y-2">
          <div class="text-muted-foreground text-xs">
            {t("skillMonitor.buff.alias.configuredCount", {
              count: configuredBuffAliasIds.length,
            })}
          </div>
          <input
            class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-80"
            placeholder={t("skillMonitor.buff.alias.placeholder")}
            value={buffAliasSearch}
            oninput={(event) =>
              setBuffAliasSearch(
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </div>

        {#if buffAliasSearch.trim().length > 0}
          <div class="space-y-2">
            <div class="text-muted-foreground text-xs">
              {t("skillMonitor.buff.alias.searchResults")}
            </div>
            <BuffSearchResultGrid
              items={buffAliasSearchResults}
              {availableBuffMap}
              onSelect={(buffId) => setBuffAliasEditingBuffId(buffId)}
              isSelected={(buffId) => buffAliasEditingBuffId === buffId}
              getStatusLabel={buffAliasStatusLabel}
              emptyMessage={t("components.buffSearchResultGrid.empty")}
            />

            {#if buffAliasEditingBuffId !== null}
              <div
                class="border-border/60 bg-muted/20 space-y-2 rounded-md border p-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-foreground truncate text-sm">
                      {getBuffDisplayName(buffAliasEditingBuffId)}
                    </div>
                    <div class="text-muted-foreground truncate text-xs">
                      {t("skillMonitor.buff.alias.defaultWithId", {
                        name: getBuffDefaultName(buffAliasEditingBuffId),
                        id: buffAliasEditingBuffId,
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs disabled:opacity-50"
                    onclick={() => resetBuffAlias(buffAliasEditingBuffId)}
                    disabled={!getBuffAlias(buffAliasEditingBuffId)}
                  >
                    {t("skillMonitor.buff.alias.reset")}
                  </button>
                </div>
                <input
                  class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                  placeholder={getBuffDefaultName(buffAliasEditingBuffId)}
                  value={getBuffAlias(buffAliasEditingBuffId)}
                  oninput={(event) =>
                    setBuffAlias(
                      buffAliasEditingBuffId,
                      (event.currentTarget as HTMLInputElement).value,
                    )}
                />
              </div>
            {/if}
          </div>
        {:else if configuredBuffAliasIds.length > 0}
          <div class="space-y-2">
            <div class="text-muted-foreground text-xs">
              {t("skillMonitor.buff.alias.configuredTitle")}
            </div>
            <div class="space-y-2">
              {#each configuredBuffAliasIds as buffId (buffId)}
                {@const iconBuff = availableBuffMap.get(buffId)}
                <div
                  class="border-border/60 bg-muted/20 space-y-2 rounded-md border p-3"
                >
                  <div class="flex items-center gap-3">
                    {#if iconBuff}
                      <img
                        src={`/images/buff/${iconBuff.spriteFile}`}
                        alt={getBuffDisplayName(buffId)}
                        class="border-border/40 bg-muted/20 size-10 rounded border object-contain"
                      />
                    {:else}
                      <div
                        class="border-border/40 bg-muted/20 text-muted-foreground flex size-10 items-center justify-center rounded border text-[10px]"
                      >
                        {t("components.buffSearchResultGrid.fallbackIcon")}
                      </div>
                    {/if}
                    <div class="min-w-0 flex-1">
                      <div class="text-foreground truncate text-sm">
                        {getBuffDisplayName(buffId)}
                      </div>
                      <div class="text-muted-foreground truncate text-xs">
                        {t("skillMonitor.buff.alias.defaultWithId", {
                          name: getBuffDefaultName(buffId),
                          id: buffId,
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="border-border/60 hover:bg-muted/40 rounded border px-2 py-1 text-xs"
                      onclick={() => resetBuffAlias(buffId)}
                    >
                      {t("skillMonitor.buff.alias.reset")}
                    </button>
                  </div>
                  <input
                    class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                    placeholder={getBuffDefaultName(buffId)}
                    value={getBuffAlias(buffId)}
                    oninput={(event) =>
                      setBuffAlias(
                        buffId,
                        (event.currentTarget as HTMLInputElement).value,
                      )}
                  />
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="text-muted-foreground text-xs">
            {t("skillMonitor.buff.alias.empty")}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("skillMonitor.buff.display.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("skillMonitor.buff.display.description")}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {buffDisplayMode ===
        'individual'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => setBuffDisplayMode("individual")}
      >
        {t("skillMonitor.buff.display.individual")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {buffDisplayMode ===
        'grouped'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => setBuffDisplayMode("grouped")}
      >
        {t("skillMonitor.buff.display.grouped")}
      </button>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {textBuffPanelStyle.displayMode ===
        'modern'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => setTextBuffPanelDisplayMode("modern")}
      >
        {t("skillMonitor.buff.display.modernText")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {textBuffPanelStyle.displayMode ===
        'classic'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => setTextBuffPanelDisplayMode("classic")}
      >
        {t("skillMonitor.buff.display.classicText")}
      </button>
    </div>
    <label class="text-muted-foreground block max-w-md text-xs">
      {t("skillMonitor.buff.display.maxTextBuffs", {
        count: textBuffMaxVisible,
      })}
      <input
        class="mt-1 w-full"
        type="range"
        min="1"
        max="20"
        step="1"
        value={textBuffMaxVisible}
        oninput={(event) =>
          setTextBuffMaxVisible(
            Number((event.currentTarget as HTMLInputElement).value),
          )}
      />
    </label>
    <div class="grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <label class="text-muted-foreground text-xs">
        {t("skillMonitor.style.gap", { value: textBuffPanelStyle.gap })}
        <input
          class="mt-1 w-full"
          type="range"
          min="0"
          max="24"
          step="1"
          value={textBuffPanelStyle.gap}
          oninput={(event) =>
            setTextBuffPanelGap(
              Number((event.currentTarget as HTMLInputElement).value),
            )}
        />
      </label>
      <label class="text-muted-foreground text-xs">
        {t("skillMonitor.style.fontSize", {
          value: textBuffPanelStyle.fontSize,
        })}
        <input
          class="mt-1 w-full"
          type="range"
          min="10"
          max="28"
          step="1"
          value={textBuffPanelStyle.fontSize}
          oninput={(event) =>
            setTextBuffPanelFontSize(
              Number((event.currentTarget as HTMLInputElement).value),
            )}
        />
      </label>
      {#if textBuffPanelStyle.displayMode === "modern"}
        <label class="text-muted-foreground text-xs">
          {t("skillMonitor.style.columnGap", {
            value: textBuffPanelStyle.columnGap,
          })}
          <input
            class="mt-1 w-full"
            type="range"
            min="0"
            max="240"
            step="1"
            value={textBuffPanelStyle.columnGap}
            oninput={(event) =>
              setTextBuffPanelColumnGap(
                Number((event.currentTarget as HTMLInputElement).value),
              )}
          />
        </label>
      {/if}
    </div>
    <div class="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label
        class="border-border/60 bg-muted/20 text-muted-foreground flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
      >
        {t("skillMonitor.style.nameColor")}
        <input
          type="color"
          value={textBuffPanelStyle.nameColor}
          class="border-border/60 h-7 w-12 rounded border bg-transparent p-0"
          onchange={(event) =>
            setTextBuffPanelNameColor(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
      <label
        class="border-border/60 bg-muted/20 text-muted-foreground flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
      >
        {t("skillMonitor.style.valueColor")}
        <input
          type="color"
          value={textBuffPanelStyle.valueColor}
          class="border-border/60 h-7 w-12 rounded border bg-transparent p-0"
          onchange={(event) =>
            setTextBuffPanelValueColor(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
      <label
        class="border-border/60 bg-muted/20 text-muted-foreground flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
      >
        {t("skillMonitor.style.progressColor")}
        <input
          type="color"
          value={textBuffPanelStyle.progressColor}
          class="border-border/60 h-7 w-12 rounded border bg-transparent p-0"
          onchange={(event) =>
            setTextBuffPanelProgressColor(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
      <label
        class="border-border/60 bg-muted/20 text-muted-foreground rounded border px-3 py-2 text-xs"
      >
        <div>
          {t("skillMonitor.style.progressOpacity", {
            value: Math.round(textBuffPanelStyle.progressOpacity * 100),
          })}
        </div>
        <input
          class="mt-2 w-full"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={textBuffPanelStyle.progressOpacity}
          oninput={(event) =>
            setTextBuffPanelProgressOpacity(
              Number((event.currentTarget as HTMLInputElement).value),
            )}
        />
      </label>
    </div>
    <OverlayTextStyleFields
      textShadowEnabled={textBuffPanelStyle.textShadowEnabled}
      backgroundEnabled={textBuffPanelStyle.backgroundEnabled}
      backgroundOpacity={textBuffPanelStyle.backgroundOpacity}
      onTextShadowEnabled={setTextBuffPanelTextShadowEnabled}
      onBackgroundEnabled={setTextBuffPanelBackgroundEnabled}
      onBackgroundOpacity={setTextBuffPanelBackgroundOpacity}
    />
    <div class="border-t border-border/40 pt-3">
      <div class="text-muted-foreground mb-2 text-xs font-medium">
        {t("skillMonitor.overlay.sharedTextStyle")}
      </div>
      <OverlayTextStyleFields
        textShadowEnabled={overlayTextStyle.textShadowEnabled}
        backgroundEnabled={overlayTextStyle.backgroundEnabled}
        backgroundOpacity={overlayTextStyle.backgroundOpacity}
        onTextShadowEnabled={setOverlayTextShadowEnabled}
        onBackgroundEnabled={setOverlayBackgroundEnabled}
        onBackgroundOpacity={setOverlayBackgroundOpacity}
      />
    </div>
  </div>

  <div
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="space-y-2">
      <div class="text-foreground text-xs font-medium">
        {t("skillMonitor.buff.priority.globalTitle")}
      </div>
      <input
        class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
        placeholder={t("skillMonitor.buff.priority.globalPlaceholder")}
        value={globalPrioritySearch}
        oninput={(event) =>
          setGlobalPrioritySearch(
            (event.currentTarget as HTMLInputElement).value,
          )}
      />
      {#if globalPrioritySearch.trim().length > 0}
        <BuffSearchResultGrid
          items={getFilteredGlobalPrioritySearchResults()}
          {availableBuffMap}
          onSelect={toggleGlobalPriority}
          emptyMessage={t("skillMonitor.buff.priority.globalEmpty")}
          minColumnWidth={180}
        />
      {/if}
      <div class="space-y-1">
        {#each buffPriorityIds as buffId, idx (buffId)}
          <div
            class="border-border/60 bg-muted/20 flex items-center gap-2 rounded border px-2 py-1"
          >
            <span class="text-muted-foreground w-6 text-center text-xs"
              >{idx + 1}</span
            >
            <span class="text-foreground flex-1 truncate text-xs">
              {getBuffDisplayName(buffId)}
            </span>
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs"
              onclick={() => toggleGlobalPriority(buffId)}
              >{t("skillMonitor.common.remove")}</button
            >
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
              onclick={() => moveGlobalPriority(buffId, "up")}
              disabled={idx === 0}>{t("skillMonitor.common.moveUp")}</button
            >
            <button
              type="button"
              class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
              onclick={() => moveGlobalPriority(buffId, "down")}
              disabled={idx === buffPriorityIds.length - 1}
              >{t("skillMonitor.common.moveDown")}</button
            >
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div
    class="border-border/60 bg-card/40 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <button
      type="button"
      class="hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors"
      onclick={() => setBuffAlertSectionExpanded(!buffAlertSectionExpanded)}
    >
      <div class="min-w-0 text-left">
        <h2 class="text-foreground text-base font-semibold">
          {t("skillMonitor.buff.alert.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.alert.description")}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <span class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.alert.configuredCount", {
            count: configuredAlertBuffIds.length,
          })}
        </span>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {buffAlertSectionExpanded
            ? 'rotate-180'
            : ''}"
        />
      </div>
    </button>

    {#if buffAlertSectionExpanded}
      <div class="space-y-4 px-4 pb-4">
        <input
          class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
          placeholder={t("skillMonitor.buff.alert.addPlaceholder")}
          value={alertSearch}
          oninput={(event) =>
            setAlertSearch((event.currentTarget as HTMLInputElement).value)}
        />
        {#if alertSearch.trim().length > 0}
          <BuffSearchResultGrid
            items={getFilteredAlertSearchResults()}
            {availableBuffMap}
            onSelect={(buffId) => upsertBuffAlert(buffId, {})}
            emptyMessage={t("skillMonitor.buff.alert.emptySearch")}
            minColumnWidth={180}
          />
        {/if}
        <div class="space-y-2">
          {#each configuredAlertBuffIds as buffId (buffId)}
            {@const rule = buffAlerts[String(buffId)]}
            {#if rule}
              <div
                class="border-border/60 bg-muted/20 space-y-3 rounded border p-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-foreground min-w-0 truncate text-sm">
                    {getBuffDisplayName(buffId)}
                  </span>
                  <button
                    type="button"
                    class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs"
                    onclick={() => removeBuffAlert(buffId)}
                  >
                    {t("skillMonitor.buff.alert.remove")}
                  </button>
                </div>
                <div
                  class="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_120px] md:items-center"
                >
                  <label class="text-muted-foreground text-xs">
                    {t("skillMonitor.buff.alert.threshold", {
                      seconds: rule.thresholdSeconds,
                    })}
                    <input
                      class="border-border/60 bg-muted/30 text-foreground mt-1 w-full rounded border px-2 py-1 text-sm"
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      value={rule.thresholdSeconds}
                      oninput={(event) =>
                        upsertBuffAlert(buffId, {
                          thresholdSeconds: Number(
                            (event.currentTarget as HTMLInputElement).value,
                          ),
                        })}
                    />
                  </label>
                  <label class="text-muted-foreground text-xs">
                    {t("skillMonitor.buff.alert.highlightColor")}
                    <input
                      class="border-border/60 mt-1 h-8 w-full rounded border bg-transparent p-0"
                      type="color"
                      value={rule.highlightColor}
                      oninput={(event) =>
                        upsertBuffAlert(buffId, {
                          highlightColor: (
                            event.currentTarget as HTMLInputElement
                          ).value,
                        })}
                    />
                  </label>
                  <label
                    class="text-foreground flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={rule.flash}
                      onchange={(event) =>
                        upsertBuffAlert(buffId, {
                          flash: (event.currentTarget as HTMLInputElement)
                            .checked,
                        })}
                    />
                    {t("skillMonitor.buff.alert.flash")}
                  </label>
                </div>
              </div>
            {/if}
          {:else}
            <div class="text-muted-foreground text-xs">
              {t("skillMonitor.buff.alert.empty")}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div
    class="border-border/60 bg-card/40 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <button
      type="button"
      class="hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors"
      onclick={() => setVoiceBuffSectionExpanded(!voiceBuffSectionExpanded)}
    >
      <div class="min-w-0 text-left">
        <h2 class="text-foreground text-base font-semibold">
          {t("skillMonitor.buff.voice.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.voice.description")}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <span class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.voice.configuredCount", {
            count: configuredVoiceBuffIds.length,
          })}
        </span>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {voiceBuffSectionExpanded
            ? 'rotate-180'
            : ''}"
        />
      </div>
    </button>

    {#if voiceBuffSectionExpanded}
      <div class="space-y-4 px-4 pb-4">
        <input
          class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
          placeholder={t("skillMonitor.buff.voice.addPlaceholder")}
          value={voiceBuffSearch}
          oninput={(event) =>
            setVoiceBuffSearch((event.currentTarget as HTMLInputElement).value)}
        />
        {#if voiceBuffSearch.trim().length > 0}
          <BuffSearchResultGrid
            items={voiceBuffSearchResults}
            {availableBuffMap}
            onSelect={(buffId) => {
              voiceEditingBuffId = buffId;
              setVoiceBuffSearch("");
            }}
            emptyMessage={t("skillMonitor.buff.voice.emptySearch")}
            minColumnWidth={180}
          />
        {/if}
        {#if pendingVoiceBuffId !== null}
          <div
            class="border-border/60 bg-muted/20 space-y-2 rounded border p-3"
          >
            <div class="text-foreground truncate text-sm font-medium">
              {getBuffDisplayName(pendingVoiceBuffId)}
            </div>
            <VoiceBindingControl
              subject={{ kind: "buff", buffId: pendingVoiceBuffId }}
            />
          </div>
        {/if}
        <div class="space-y-2">
          {#each configuredVoiceBuffIds as buffId (buffId)}
            <div
              class="border-border/60 bg-muted/20 space-y-2 rounded border p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="text-foreground min-w-0 truncate text-sm">
                  {getBuffDisplayName(buffId)}
                </span>
                <button
                  type="button"
                  class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs"
                  onclick={() => removeConfiguredVoiceBuff(buffId)}
                >
                  {t("skillMonitor.buff.voice.remove")}
                </button>
              </div>
              <VoiceBindingControl subject={{ kind: "buff", buffId }} />
            </div>
          {:else}
            {#if pendingVoiceBuffId === null}
              <div class="text-muted-foreground text-xs">
                {t("skillMonitor.buff.voice.empty")}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if buffDisplayMode === "individual"}
    <div
      class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <div>
        <h2 class="text-foreground text-base font-semibold">
          {t("skillMonitor.buff.category.title")}
        </h2>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each buffCategoryDefinitions as category (category.key)}
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {isBuffCategorySelected(
              category.key,
            )
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
            onclick={() => toggleBuffCategory(category.key)}
          >
            {category.label} ({category.count})
          </button>
        {/each}
      </div>
      <div class="space-y-2">
        <div class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.category.selectedTitle")}
        </div>
        <div class="flex flex-wrap gap-2">
          {#if selectedBuffCategories.length > 0}
            {#each selectedBuffCategories as category (category.key)}
              <button
                type="button"
                class="border-primary/60 bg-primary/10 text-foreground hover:bg-primary/15 rounded-md border px-3 py-1.5 text-xs"
                onclick={() => toggleBuffCategory(category.key)}
              >
                {category.label} ({category.count})
              </button>
            {/each}
          {:else}
            <div class="text-muted-foreground text-xs">
              {t("skillMonitor.buff.category.empty")}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div
      class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-foreground text-base font-semibold">
            {t("skillMonitor.buff.all.title")}
          </h2>
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.buff.all.description")}
          </p>
        </div>
        {#if !individualMonitorAllGroup}
          <button
            type="button"
            class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-3 py-2 text-xs transition-colors"
            onclick={addIndividualMonitorAll}
          >
            {t("skillMonitor.buff.all.add")}
          </button>
        {:else}
          <button
            type="button"
            class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-3 py-2 text-xs transition-colors"
            onclick={removeIndividualMonitorAll}
          >
            {t("skillMonitor.buff.all.remove")}
          </button>
        {/if}
      </div>
      {#if individualMonitorAllGroup}
        <div
          class="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <input
              class="border-border/60 bg-muted/30 text-foreground w-52 rounded border px-2 py-1.5 text-sm"
              value={individualMonitorAllGroup.name}
              placeholder={getIndividualAllGroupDisplayName(
                individualMonitorAllGroup,
              )}
              oninput={(event) =>
                updateIndividualMonitorAllGroup((curr) => ({
                  ...curr,
                  name:
                    (event.currentTarget as HTMLInputElement).value ||
                    curr.name,
                }))}
            />
            <span class="text-muted-foreground text-xs"
              >{t("skillMonitor.buff.all.fixed")}</span
            >
          </div>
          {@render buffGroupLayoutControls(
            individualMonitorAllGroup,
            updateIndividualMonitorAllGroup,
          )}
        </div>
      {/if}
    </div>
  {/if}

  {#if buffDisplayMode === "grouped"}
    <div
      class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-foreground text-base font-semibold">
            {t("skillMonitor.buff.group.title")}
          </h2>
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.buff.group.description")}
          </p>
        </div>
        <button
          type="button"
          class="border-border/60 text-foreground hover:bg-muted/40 rounded border px-3 py-2 text-xs transition-colors"
          onclick={addBuffGroup}
        >
          {t("skillMonitor.buff.group.new")}
        </button>
      </div>

      <div class="space-y-3">
        {#each buffGroups as group, groupIndex (group.id)}
          <div
            class="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <input
                class="border-border/60 bg-muted/30 text-foreground w-52 rounded border px-2 py-1.5 text-sm"
                value={group.name}
                placeholder={getBuffGroupDisplayName(group, groupIndex)}
                oninput={(event) =>
                  updateBuffGroup(group.id, (curr) => ({
                    ...curr,
                    name:
                      (event.currentTarget as HTMLInputElement).value ||
                      curr.name,
                  }))}
              />
              <button
                type="button"
                class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs transition-colors"
                onclick={() => removeBuffGroup(group.id)}
              >
                {t("skillMonitor.buff.group.delete")}
              </button>
              <label
                class="text-foreground ml-auto flex items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={group.monitorAll}
                  onchange={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      monitorAll: (event.currentTarget as HTMLInputElement)
                        .checked,
                    }))}
                />
                {t("skillMonitor.buff.group.monitorAll")}
              </label>
            </div>

            <div class="space-y-2">
              <div class="flex flex-wrap gap-2">
                {#each buffCategoryDefinitions as category (category.key)}
                  <button
                    type="button"
                    class="rounded-md border px-3 py-1.5 text-xs transition-colors {hasCompleteBuffCategoryInGroup(
                      group,
                      category.key,
                    )
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
                    onclick={() =>
                      toggleBuffCategoryInGroup(group.id, category.key)}
                    disabled={group.monitorAll}
                  >
                    {hasCompleteBuffCategoryInGroup(group, category.key)
                      ? t("skillMonitor.buff.group.removeCategory", {
                          name: category.label,
                          count: category.count,
                        })
                      : t("skillMonitor.buff.group.addCategory", {
                          name: category.label,
                          count: category.count,
                        })}
                  </button>
                {/each}
              </div>
              <input
                class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
                placeholder={t("skillMonitor.buff.group.placeholder")}
                value={getGroupSearchKeyword(group.id)}
                oninput={(event) =>
                  setGroupSearchKeyword(
                    group.id,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />
              {#if getGroupSearchResults(group).length > 0}
                <BuffSearchResultGrid
                  items={getGroupSearchResults(group)}
                  {availableBuffMap}
                  onSelect={(buffId) => toggleBuffInGroup(group.id, buffId)}
                  emptyMessage={t("skillMonitor.buff.group.emptySearch")}
                  minColumnWidth={180}
                />
              {/if}

              {#if !group.monitorAll}
                <div class="space-y-2">
                  <div class="text-muted-foreground text-xs">
                    {t("skillMonitor.buff.group.joinedCount", {
                      count: group.buffIds.length,
                    })}
                  </div>
                  <div class="flex flex-wrap gap-2">
                    {#if group.buffIds.length > 0}
                      {#each group.buffIds as buffId (buffId)}
                        {@const selectedBuff = availableBuffMap.get(buffId)}
                        {#if selectedBuff}
                          <button
                            type="button"
                            class="border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30 relative size-12 overflow-hidden rounded-md border"
                            title={t("skillMonitor.buff.group.removeTitle", {
                              name: getBuffDisplayName(buffId),
                            })}
                            onclick={() => toggleBuffInGroup(group.id, buffId)}
                          >
                            <img
                              src={`/images/buff/${selectedBuff.spriteFile}`}
                              alt={getBuffDisplayName(buffId)}
                              class="h-full w-full object-contain"
                            />
                          </button>
                        {:else}
                          <button
                            type="button"
                            class="border-border/60 bg-muted/20 text-foreground hover:border-border hover:bg-muted/30 rounded-md border px-2 py-1 text-[11px]"
                            title={t("skillMonitor.buff.group.removeTitle", {
                              name: getBuffDisplayName(buffId),
                            })}
                            onclick={() => toggleBuffInGroup(group.id, buffId)}
                          >
                            {getBuffDisplayName(buffId)}
                          </button>
                        {/if}
                      {/each}
                    {:else}
                      <div class="text-muted-foreground text-xs">
                        {t("skillMonitor.buff.group.empty")}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <div class="space-y-1">
                <div class="text-muted-foreground text-xs">
                  {t("skillMonitor.buff.priority.groupTitle")}
                </div>
                <input
                  class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
                  placeholder={t("skillMonitor.buff.priority.groupPlaceholder")}
                  value={getGroupPrioritySearchKeyword(group.id)}
                  oninput={(event) =>
                    setGroupPrioritySearchKeyword(
                      group.id,
                      (event.currentTarget as HTMLInputElement).value,
                    )}
                />
                {#if getGroupPrioritySearchResults(group).length > 0}
                  <BuffSearchResultGrid
                    items={getGroupPrioritySearchResults(group)}
                    {availableBuffMap}
                    onSelect={(buffId) =>
                      togglePriorityInGroup(group.id, buffId)}
                    emptyMessage={t("skillMonitor.buff.priority.groupEmpty")}
                    minColumnWidth={180}
                  />
                {/if}
                {#each getGroupPriorityIds(group) as buffId, idx (buffId)}
                  <div
                    class="border-border/60 bg-muted/20 flex items-center gap-2 rounded border px-2 py-1"
                  >
                    <span class="text-muted-foreground w-6 text-center text-xs"
                      >{idx + 1}</span
                    >
                    <span class="text-foreground flex-1 truncate text-xs">
                      {getBuffDisplayName(buffId)}
                    </span>
                    <button
                      type="button"
                      class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs"
                      onclick={() => togglePriorityInGroup(group.id, buffId)}
                      >{t("skillMonitor.common.remove")}</button
                    >
                    <button
                      type="button"
                      class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                      onclick={() => moveGroupPriority(group.id, buffId, "up")}
                      disabled={idx === 0}
                      >{t("skillMonitor.common.moveUp")}</button
                    >
                    <button
                      type="button"
                      class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                      onclick={() =>
                        moveGroupPriority(group.id, buffId, "down")}
                      disabled={idx === getGroupPriorityIds(group).length - 1}
                      >{t("skillMonitor.common.moveDown")}</button
                    >
                  </div>
                {/each}
              </div>
              <div class="space-y-2">
                <div class="text-muted-foreground text-xs">
                  {t("skillMonitor.buff.group.layoutTitle")}
                </div>
                {@render buffGroupLayoutControls(
                  group,
                  (updater: (curr: BuffGroup) => BuffGroup) =>
                    updateBuffGroup(group.id, updater),
                )}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="border-border/60 bg-muted/20 space-y-2 rounded-md border p-3">
        <div class="text-muted-foreground text-xs">
          {t("skillMonitor.buff.group.previewTitle")}
        </div>
        <div class="space-y-2">
          {#each buffGroups as group, groupIndex (group.id)}
            <div class="border-border/50 rounded border p-2">
              <div class="text-foreground mb-2 text-xs">
                {getBuffGroupDisplayName(group, groupIndex)}{group.monitorAll
                  ? t("skillMonitor.buff.group.allSuffix")
                  : ""}
              </div>
              <div
                class="grid"
                style:grid-template-columns={`repeat(${Math.max(1, group.columns)}, minmax(0, ${group.iconSize / 2}px))`}
                style:gap={`${Math.max(0, group.gap / 2)}px`}
              >
                {#if group.monitorAll}
                  {#each availableBuffs.slice(0, Math.max(6, group.columns * group.rows)) as buff (buff.baseId)}
                    <img
                      src={`/images/buff/${buff.spriteFile}`}
                      alt={buff.name}
                      class="border-border/30 bg-muted/20 aspect-square w-full rounded border object-contain"
                    />
                  {/each}
                {:else}
                  {#each group.buffIds.slice(0, Math.max(6, group.columns * group.rows)) as buffId (buffId)}
                    {@const buff = availableBuffMap.get(buffId)}
                    {#if buff}
                      <img
                        src={`/images/buff/${buff.spriteFile}`}
                        alt={buff.name}
                        class="border-border/30 bg-muted/20 aspect-square w-full rounded border object-contain"
                      />
                    {:else}
                      <div
                        class="border-border/30 bg-muted/20 aspect-square w-full rounded border"
                      ></div>
                    {/if}
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
