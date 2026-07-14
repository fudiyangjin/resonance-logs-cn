<script lang="ts">
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import Volume2Icon from "virtual:icons/lucide/volume-2";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import type {
    BuffDefinition,
    BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import type {
    CustomPanelGroup,
    CustomPanelGroupKind,
    CustomPanelStyle,
    InlineBuffEntry,
    UserCounterRule,
  } from "$lib/settings-store";
  import OverlayTextStyleFields from "./overlay-text-style-fields.svelte";
  import {
    getCounterDisplayLabel,
    type CounterDisplayLabelInput,
    type CounterRulePreset,
    type SlotTemplate,
    type SourceTemplate,
  } from "$lib/skill-mappings";
  import { t } from "$lib/i18n/index.svelte";
  import {
    subjectHasBindings,
    type VoiceBindingSubject,
  } from "$lib/voice-binding-subject.svelte.js";

  type CounterRuleOption = CounterRulePreset & { origin: "preset" | "user" };

  interface Props {
    counterRules: CounterRuleOption[];
    sourceTemplates: SourceTemplate[];
    slotTemplates: SlotTemplate[];
    userCounterRules: UserCounterRule[];
    availableBuffMap: Map<number, BuffDefinition>;
    getBuffDisplayName: (buffId: number) => string;
    inlineBuffSearch: string;
    filteredInlineBuffSearchResults: BuffNameInfo[];
    customPanelGroups: CustomPanelGroup[];
    factorSlotLabels: Record<string, string>;
    setFactorSlotLabel: (slotTemplateId: string, name: string) => void;
    setInlineBuffSearch: (value: string) => void;
    addCustomPanelGroup: (kind?: CustomPanelGroupKind) => void;
    removeCustomPanelGroup: (groupId: string) => void;
    renameCustomPanelGroup: (groupId: string, name: string) => void;
    updateCustomPanelGroupStyle: (
      groupId: string,
      updater: (style: CustomPanelStyle) => CustomPanelStyle,
    ) => void;
    setCustomPanelGroupHideZeroCounters: (
      groupId: string,
      checked: boolean,
    ) => void;
    addCustomPanelEntry: (
      groupId: string,
      sourceType: "buff" | "counter",
      sourceId: number,
      counterSlotId?: number,
    ) => void;
    addUserCounterRule: (
      name: string,
      sourceRefs: string[],
      slotRefs: string[],
    ) => void;
    removeUserCounterRule: (ruleId: number) => void;
    updateUserCounterRule: (
      ruleId: number,
      updates: Partial<UserCounterRule>,
    ) => void;
    removeCustomPanelEntry: (groupId: string, entryId: string) => void;
    setCustomPanelEntryLabel: (
      groupId: string,
      entryId: string,
      label: string,
    ) => void;
    setCustomPanelEntryHideWhenZero: (
      groupId: string,
      entryId: string,
      checked: boolean,
    ) => void;
    moveCustomPanelEntry: (
      groupId: string,
      entryId: string,
      direction: "up" | "down",
    ) => void;
  }

  let {
    counterRules,
    sourceTemplates,
    slotTemplates,
    userCounterRules,
    availableBuffMap,
    getBuffDisplayName,
    inlineBuffSearch,
    filteredInlineBuffSearchResults,
    customPanelGroups,
    factorSlotLabels,
    setFactorSlotLabel,
    setInlineBuffSearch,
    addCustomPanelGroup,
    removeCustomPanelGroup,
    renameCustomPanelGroup,
    updateCustomPanelGroupStyle,
    setCustomPanelGroupHideZeroCounters,
    addCustomPanelEntry,
    addUserCounterRule,
    removeUserCounterRule,
    updateUserCounterRule,
    removeCustomPanelEntry,
    setCustomPanelEntryLabel,
    setCustomPanelEntryHideWhenZero,
    moveCustomPanelEntry,
  }: Props = $props();

  let selectedGroupId = $state<string | null>(customPanelGroups[0]?.id ?? null);
  let draftRuleName = $state("");
  let draftSourceRefs = $state<string[]>([]);
  let draftSlotRefs = $state<string[]>([]);
  let isCreatingUserRule = $state(false);
  let factorSlotSearch = $state("");

  $effect(() => {
    if (customPanelGroups.length === 0) {
      selectedGroupId = null;
      return;
    }
    if (
      !selectedGroupId ||
      !customPanelGroups.some((group) => group.id === selectedGroupId)
    ) {
      selectedGroupId = customPanelGroups[0]?.id ?? null;
    }
  });

  const selectedGroup = $derived.by(
    () =>
      customPanelGroups.find((group) => group.id === selectedGroupId) ?? null,
  );
  const selectedGroupIndex = $derived.by(() =>
    customPanelGroups.findIndex((group) => group.id === selectedGroupId),
  );
  const sourceTemplateMap = $derived.by(
    () =>
      new Map(sourceTemplates.map((template) => [template.sourceId, template])),
  );
  const slotTemplateMap = $derived.by(
    () =>
      new Map(
        slotTemplates.map((template) => [template.slotTemplateId, template]),
      ),
  );
  const canSaveDraftRule = $derived(
    draftRuleName.trim().length > 0 &&
      draftSourceRefs.length > 0 &&
      draftSlotRefs.length > 0,
  );
  const isSelectedManualGroup = $derived(
    selectedGroup?.kind !== "seasonCultivateFactor",
  );
  const customizedFactorSlots = $derived.by(() =>
    Object.entries(factorSlotLabels)
      .map(([slotTemplateId, label]) => ({
        slotTemplateId,
        label,
        template: slotTemplateMap.get(slotTemplateId) ?? null,
      }))
      .sort((left, right) =>
        (left.template?.name ?? left.slotTemplateId).localeCompare(
          right.template?.name ?? right.slotTemplateId,
        ),
      ),
  );
  const filteredSlotTemplates = $derived.by(() => {
    const keyword = factorSlotSearch.trim().toLowerCase();
    if (!keyword) return [] as SlotTemplate[];
    return slotTemplates.filter(
      (template) =>
        template.name.toLowerCase().includes(keyword) ||
        template.description.toLowerCase().includes(keyword) ||
        template.slotTemplateId.toLowerCase().includes(keyword),
    );
  });

  function getEntryLocation(
    sourceType: InlineBuffEntry["sourceType"],
    sourceId: number,
    counterSlotId?: number,
  ): { groupId: string; groupName: string } | null {
    for (let index = 0; index < customPanelGroups.length; index += 1) {
      const group = customPanelGroups[index];
      if (!group) continue;
      if (group.kind === "seasonCultivateFactor") continue;
      if (
        group.entries.some(
          (entry) =>
            entry.sourceType === sourceType &&
            entry.sourceId === sourceId &&
            (sourceType !== "counter" || entry.counterSlotId === counterSlotId),
        )
      ) {
        return {
          groupId: group.id,
          groupName: getCustomPanelGroupDisplayName(group, index),
        };
      }
    }
    return null;
  }

  function buffStatusLabel(buffId: number): string | null {
    const location = getEntryLocation("buff", buffId);
    if (!location) return null;
    return location.groupId === selectedGroup?.id
      ? t("skillMonitor.customPanel.status.currentGroupAdded")
      : t("skillMonitor.customPanel.status.alreadyIn", {
          name: location.groupName,
        });
  }

  function getCustomPanelGroupDisplayName(
    group: CustomPanelGroup,
    index: number,
  ): string {
    return (
      group.name.trim() ||
      t("skillMonitor.defaults.customPanelGroupName", {
        index: index + 1,
      })
    );
  }

  function getCustomPanelGroupKindLabel(group: CustomPanelGroup): string {
    return group.kind === "seasonCultivateFactor"
      ? t("skillMonitor.customPanel.kind.factor")
      : t("skillMonitor.customPanel.kind.manual");
  }

  function getSelectedGroupDisplayName(): string {
    if (!selectedGroup) return "";
    return getCustomPanelGroupDisplayName(
      selectedGroup,
      selectedGroupIndex >= 0 ? selectedGroupIndex : 0,
    );
  }

  function toggleDraftRef(current: string[], value: string): string[] {
    return current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
  }

  function resetDraftRule() {
    draftRuleName = "";
    draftSourceRefs = [];
    draftSlotRefs = [];
    isCreatingUserRule = false;
  }

  function submitDraftRule() {
    if (!canSaveDraftRule) return;
    addUserCounterRule(draftRuleName, draftSourceRefs, draftSlotRefs);
    resetDraftRule();
  }

  function updateSelectedGroupStyle(
    updater: (style: CustomPanelStyle) => CustomPanelStyle,
  ) {
    if (!selectedGroup) return;
    updateCustomPanelGroupStyle(selectedGroup.id, updater);
  }

  function setSelectedGroupGap(value: number) {
    const nextValue = Math.max(0, Math.min(24, Math.round(value)));
    updateSelectedGroupStyle((style) => ({ ...style, gap: nextValue }));
  }

  function setSelectedGroupFontSize(value: number) {
    const nextValue = Math.max(10, Math.min(28, Math.round(value)));
    updateSelectedGroupStyle((style) => ({ ...style, fontSize: nextValue }));
  }

  function setSelectedGroupColumnGap(value: number) {
    const nextValue = Math.max(0, Math.min(240, Math.round(value)));
    updateSelectedGroupStyle((style) => ({ ...style, columnGap: nextValue }));
  }

  function setSelectedGroupNameColor(value: string) {
    updateSelectedGroupStyle((style) => ({ ...style, nameColor: value }));
  }

  function setSelectedGroupValueColor(value: string) {
    updateSelectedGroupStyle((style) => ({ ...style, valueColor: value }));
  }

  function setSelectedGroupProgressColor(value: string) {
    updateSelectedGroupStyle((style) => ({ ...style, progressColor: value }));
  }

  function setSelectedGroupProgressOpacity(value: number) {
    updateSelectedGroupStyle((style) => ({
      ...style,
      progressOpacity: Math.max(0, Math.min(1, value)),
    }));
  }

  function setSelectedGroupTextShadowEnabled(value: boolean) {
    updateSelectedGroupStyle((style) => ({
      ...style,
      textShadowEnabled: value,
    }));
  }

  function setSelectedGroupBackgroundEnabled(value: boolean) {
    updateSelectedGroupStyle((style) => ({
      ...style,
      backgroundEnabled: value,
    }));
  }

  function setSelectedGroupBackgroundOpacity(value: number) {
    updateSelectedGroupStyle((style) => ({
      ...style,
      backgroundOpacity: Math.max(0, Math.min(1, value)),
    }));
  }

  function getUserRuleSourceNames(rule: UserCounterRule): string {
    return rule.sourceRefs
      .map((ref) => sourceTemplateMap.get(ref)?.name ?? ref)
      .join(", ");
  }

  function getUserRuleSlotNames(rule: UserCounterRule): string {
    return rule.slotRefs
      .map((ref) => slotTemplateMap.get(ref)?.name ?? ref)
      .join(", ");
  }

  function getCounterEntryLabel(entry: CounterDisplayLabelInput): string {
    return getCounterDisplayLabel(entry);
  }

  let voiceExpandedRuleIds = $state<number[]>([]);
  let presetVoiceExpandedKeys = $state<string[]>([]);

  function toggleVoiceExpanded(ruleId: number) {
    voiceExpandedRuleIds = voiceExpandedRuleIds.includes(ruleId)
      ? voiceExpandedRuleIds.filter((id) => id !== ruleId)
      : [...voiceExpandedRuleIds, ruleId];
  }

  function getSlotLabel(rule: UserCounterRule, slotId: number): string {
    const ref = rule.slotRefs[slotId - 1];
    return (ref ? slotTemplateMap.get(ref)?.name : undefined) ?? `#${slotId}`;
  }

  function presetVoiceKey(ruleId: number, slotId: number): string {
    return `${ruleId}:${slotId}`;
  }

  function togglePresetVoice(ruleId: number, slotId: number) {
    const key = presetVoiceKey(ruleId, slotId);
    presetVoiceExpandedKeys = presetVoiceExpandedKeys.includes(key)
      ? presetVoiceExpandedKeys.filter((item) => item !== key)
      : [...presetVoiceExpandedKeys, key];
  }

  function counterVoiceSubject(
    ruleId: number,
    slotId: number,
  ): VoiceBindingSubject {
    return { kind: "counterSlot", ruleId, slotId };
  }
</script>

<div class="space-y-6">
  <div
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("skillMonitor.customPanel.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("skillMonitor.customPanel.description")}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 min-h-11 cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        onclick={() => addCustomPanelGroup("manual")}
      >
        {t("skillMonitor.customPanel.new")}
      </button>
      <button
        type="button"
        class="border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 min-h-11 cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        onclick={() => addCustomPanelGroup("seasonCultivateFactor")}
      >
        {t("skillMonitor.customPanel.newFactor")}
      </button>
      <div
        class="text-muted-foreground text-xs"
        role="status"
        aria-live="polite"
      >
        {#if selectedGroup}
          {t("skillMonitor.customPanel.currentEditing", {
            name: getSelectedGroupDisplayName(),
          })}
        {:else}
          {t("skillMonitor.customPanel.chooseOrCreate")}
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {#each customPanelGroups as group, groupIndex (group.id)}
        {@const isSelected = group.id === selectedGroup?.id}
        <div
          class="rounded-lg border px-3 py-3 transition-colors {isSelected
            ? 'border-primary bg-primary/10'
            : 'border-border/60 bg-muted/20'}"
        >
          <div class="flex items-start justify-between gap-3">
            <button
              type="button"
              class="flex-1 cursor-pointer text-left"
              onclick={() => (selectedGroupId = group.id)}
            >
              <div class="text-foreground text-sm font-medium">
                {getCustomPanelGroupDisplayName(group, groupIndex)}
              </div>
              <div class="text-muted-foreground mt-1 text-xs">
                {getCustomPanelGroupKindLabel(group)}
                {#if group.kind !== "seasonCultivateFactor"}
                  · {t("skillMonitor.customPanel.entryCount", {
                    count: group.entries.length,
                  })}
                {/if}
              </div>
            </button>
            <button
              type="button"
              class="border-border/60 text-destructive hover:bg-destructive/10 min-h-11 cursor-pointer rounded-md border px-3 py-1.5 text-xs transition-colors"
              onclick={() => removeCustomPanelGroup(group.id)}
            >
              {t("skillMonitor.common.delete")}
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if selectedGroup}
    <div
      class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <div class="space-y-1">
        <div class="text-foreground text-sm font-medium">
          {t("skillMonitor.customPanel.currentGroup")}
        </div>
        <p class="text-muted-foreground text-xs">
          {t("skillMonitor.customPanel.currentGroupDescription")}
        </p>
      </div>
      <label class="text-muted-foreground block text-xs">
        {t("skillMonitor.customPanel.groupName")}
        <input
          class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 mt-1 w-full max-w-sm rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          value={selectedGroup.name}
          placeholder={getSelectedGroupDisplayName()}
          oninput={(event) =>
            renameCustomPanelGroup(
              selectedGroup.id,
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>

      <div class="border-border/60 space-y-4 border-t pt-4">
        <div>
          <h2 class="text-foreground text-base font-semibold">
            {t("skillMonitor.customPanel.style.title")}
          </h2>
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.customPanel.style.description")}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label class="text-muted-foreground text-xs">
            {t("skillMonitor.style.gap", { value: selectedGroup.style.gap })}
            <input
              class="mt-1 w-full"
              type="range"
              min="0"
              max="24"
              step="1"
              value={selectedGroup.style.gap}
              oninput={(event) =>
                setSelectedGroupGap(
                  Number((event.currentTarget as HTMLInputElement).value),
                )}
            />
          </label>
          <label class="text-muted-foreground text-xs">
            {t("skillMonitor.style.fontSize", {
              value: selectedGroup.style.fontSize,
            })}
            <input
              class="mt-1 w-full"
              type="range"
              min="10"
              max="28"
              step="1"
              value={selectedGroup.style.fontSize}
              oninput={(event) =>
                setSelectedGroupFontSize(
                  Number((event.currentTarget as HTMLInputElement).value),
                )}
            />
          </label>
          <label class="text-muted-foreground text-xs">
            {t("skillMonitor.style.columnGap", {
              value: selectedGroup.style.columnGap,
            })}
            <input
              class="mt-1 w-full"
              type="range"
              min="0"
              max="240"
              step="1"
              value={selectedGroup.style.columnGap}
              oninput={(event) =>
                setSelectedGroupColumnGap(
                  Number((event.currentTarget as HTMLInputElement).value),
                )}
            />
          </label>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label
            class="border-border/60 bg-muted/20 text-muted-foreground flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
          >
            {t("skillMonitor.style.nameColor")}
            <input
              type="color"
              value={selectedGroup.style.nameColor}
              class="border-border/60 h-7 w-12 rounded border bg-transparent p-0"
              onchange={(event) =>
                setSelectedGroupNameColor(
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
              value={selectedGroup.style.valueColor}
              class="border-border/60 h-7 w-12 rounded border bg-transparent p-0"
              onchange={(event) =>
                setSelectedGroupValueColor(
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
              value={selectedGroup.style.progressColor}
              class="border-border/60 h-7 w-12 rounded border bg-transparent p-0"
              onchange={(event) =>
                setSelectedGroupProgressColor(
                  (event.currentTarget as HTMLInputElement).value,
                )}
            />
          </label>
          <label
            class="border-border/60 bg-muted/20 text-muted-foreground rounded border px-3 py-2 text-xs"
          >
            <div>
              {t("skillMonitor.style.progressOpacity", {
                value: Math.round(selectedGroup.style.progressOpacity * 100),
              })}
            </div>
            <input
              class="mt-2 w-full"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={selectedGroup.style.progressOpacity}
              oninput={(event) =>
                setSelectedGroupProgressOpacity(
                  Number((event.currentTarget as HTMLInputElement).value),
                )}
            />
          </label>
        </div>
        <OverlayTextStyleFields
          textShadowEnabled={selectedGroup.style.textShadowEnabled}
          backgroundEnabled={selectedGroup.style.backgroundEnabled}
          backgroundOpacity={selectedGroup.style.backgroundOpacity}
          onTextShadowEnabled={setSelectedGroupTextShadowEnabled}
          onBackgroundEnabled={setSelectedGroupBackgroundEnabled}
          onBackgroundOpacity={setSelectedGroupBackgroundOpacity}
        />
      </div>
    </div>

    {#if isSelectedManualGroup}
      <div
        class="border-border/60 bg-card/40 space-y-3 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
      >
        <div class="space-y-1">
          <div class="text-foreground text-sm font-medium">
            {t("skillMonitor.customPanel.addBuff")}
          </div>
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.customPanel.addBuffDescription")}
          </p>
        </div>
        <input
          class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-80"
          placeholder={t("skillMonitor.customPanel.addBuffPlaceholder")}
          value={inlineBuffSearch}
          oninput={(event) =>
            setInlineBuffSearch(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
        {#if inlineBuffSearch.trim().length > 0}
          <BuffSearchResultGrid
            items={filteredInlineBuffSearchResults}
            {availableBuffMap}
            onSelect={(buffId) =>
              addCustomPanelEntry(selectedGroup.id, "buff", buffId)}
            isDisabled={(buffId) => Boolean(getEntryLocation("buff", buffId))}
            getStatusLabel={buffStatusLabel}
            emptyMessage={t("skillMonitor.customPanel.noMatchingBuff")}
          />
        {/if}
      </div>

      <div
        class="border-border/60 bg-card/40 space-y-3 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
      >
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-foreground text-sm font-medium">
                {t("skillMonitor.customPanel.rule.title")}
              </div>
              <p class="text-muted-foreground text-xs">
                {t("skillMonitor.customPanel.rule.description")}
              </p>
            </div>
            <button
              type="button"
              class="border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 min-h-11 cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
              onclick={() => {
                isCreatingUserRule = !isCreatingUserRule;
                if (!isCreatingUserRule) {
                  draftRuleName = "";
                  draftSourceRefs = [];
                  draftSlotRefs = [];
                }
              }}
            >
              {isCreatingUserRule
                ? t("skillMonitor.customPanel.rule.collapse")
                : t("skillMonitor.customPanel.rule.new")}
            </button>
          </div>
        </div>

        {#if userCounterRules.length === 0}
          <div
            class="border-border/60 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm"
          >
            {t("skillMonitor.customPanel.rule.empty")}
          </div>
        {/if}

        <div class="space-y-3">
          {#each userCounterRules as rule (rule.ruleId)}
            <div
              class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1 space-y-2">
                  <label class="text-muted-foreground block text-xs">
                    {t("skillMonitor.customPanel.rule.name")}
                    <input
                      class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 mt-1 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                      value={rule.name}
                      oninput={(event) =>
                        updateUserCounterRule(rule.ruleId, {
                          name: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                  </label>
                  <div class="text-muted-foreground text-xs">
                    {t("skillMonitor.customPanel.rule.sourceSummary", {
                      value:
                        getUserRuleSourceNames(rule) ||
                        t("skillMonitor.customPanel.rule.notConfigured"),
                    })}
                  </div>
                  <div class="text-muted-foreground text-xs">
                    {t("skillMonitor.customPanel.rule.slotSummary", {
                      value:
                        getUserRuleSlotNames(rule) ||
                        t("skillMonitor.customPanel.rule.notConfigured"),
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  class="border-border/60 text-destructive hover:bg-destructive/10 min-h-11 cursor-pointer rounded-md border px-3 py-1.5 text-xs transition-colors"
                  onclick={() => removeUserCounterRule(rule.ruleId)}
                >
                  {t("skillMonitor.common.delete")}
                </button>
              </div>

              {#if rule.slotRefs.length > 0}
                <div class="border-border/40 border-t pt-2">
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 text-xs"
                    onclick={() => toggleVoiceExpanded(rule.ruleId)}
                  >
                    <span>{t("skillMonitor.customPanel.rule.voiceTitle")}</span>
                    <ChevronDown
                      class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 {voiceExpandedRuleIds.includes(
                        rule.ruleId,
                      )
                        ? 'rotate-180'
                        : ''}"
                    />
                  </button>
                  {#if voiceExpandedRuleIds.includes(rule.ruleId)}
                    <div class="mt-2 space-y-2">
                      <!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
                      {#each rule.slotRefs as _, idx (idx)}
                        {@const slotId = idx + 1}
                        <div>
                          {#if rule.slotRefs.length > 1}
                            <div class="text-muted-foreground mb-1 text-xs">
                              {getSlotLabel(rule, slotId)}
                            </div>
                          {/if}
                          <VoiceBindingControl
                            subject={{
                              kind: "counterSlot",
                              ruleId: rule.ruleId,
                              slotId,
                            }}
                          />
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if isCreatingUserRule}
          <div
            class="border-primary/30 bg-primary/5 space-y-4 rounded-lg border p-4"
          >
            <label class="text-muted-foreground block text-xs">
              {t("skillMonitor.customPanel.rule.name")}
              <input
                class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 mt-1 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                value={draftRuleName}
                placeholder={t("skillMonitor.customPanel.rule.placeholder")}
                oninput={(event) =>
                  (draftRuleName = (event.currentTarget as HTMLInputElement)
                    .value)}
              />
            </label>

            <div class="space-y-2">
              <div class="text-foreground text-sm font-medium">
                {t("skillMonitor.customPanel.rule.sources")}
              </div>
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                {#each sourceTemplates as template (template.sourceId)}
                  {@const selected = draftSourceRefs.includes(
                    template.sourceId,
                  )}
                  <button
                    type="button"
                    class="min-h-11 cursor-pointer rounded border px-3 py-2 text-left transition-colors {selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
                    onclick={() =>
                      (draftSourceRefs = toggleDraftRef(
                        draftSourceRefs,
                        template.sourceId,
                      ))}
                  >
                    <div class="text-foreground text-sm font-medium">
                      {template.name}
                    </div>
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <div class="text-foreground text-sm font-medium">
                {t("skillMonitor.customPanel.rule.slots")}
              </div>
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                {#each slotTemplates as template (template.slotTemplateId)}
                  {@const selected = draftSlotRefs.includes(
                    template.slotTemplateId,
                  )}
                  <button
                    type="button"
                    class="min-h-11 cursor-pointer rounded border px-3 py-2 text-left transition-colors {selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
                    onclick={() =>
                      (draftSlotRefs = toggleDraftRef(
                        draftSlotRefs,
                        template.slotTemplateId,
                      ))}
                  >
                    <div class="text-foreground text-sm font-medium">
                      {template.name}
                    </div>
                  </button>
                {/each}
              </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                class="border-border/60 text-foreground hover:bg-muted/40 min-h-11 cursor-pointer rounded border px-4 py-2 text-sm"
                onclick={resetDraftRule}
              >
                {t("skillMonitor.common.cancel")}
              </button>
              <button
                type="button"
                class="border-primary/60 bg-primary/15 text-foreground min-h-11 cursor-pointer rounded border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                onclick={submitDraftRule}
                disabled={!canSaveDraftRule}
              >
                {t("skillMonitor.common.save")}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div
        class="border-border/60 bg-card/40 space-y-3 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
      >
        <div class="space-y-1">
          <div class="text-foreground text-sm font-medium">
            {t("skillMonitor.customPanel.counter.title")}
          </div>
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.customPanel.counter.description")}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          {#each counterRules as rule (rule.ruleId)}
            {#each rule.effectSlots as slot (slot.slotId)}
              {@const location = getEntryLocation(
                "counter",
                rule.ruleId,
                slot.slotId,
              )}
              {@const exists = Boolean(location)}
              {@const voiceSubject = counterVoiceSubject(
                rule.ruleId,
                slot.slotId,
              )}
              {@const voiceConfigured =
                rule.origin === "preset" && subjectHasBindings(voiceSubject)}
              {@const voiceExpanded = presetVoiceExpandedKeys.includes(
                presetVoiceKey(rule.ruleId, slot.slotId),
              )}
              <div
                class="rounded border px-3 py-2 transition-colors {exists
                  ? 'border-primary bg-primary/10'
                  : 'border-border/60 bg-muted/20'}"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-foreground text-sm font-medium">
                      {rule.name}{rule.effectSlots.length > 1
                        ? ` #${slot.slotId}`
                        : ""}
                    </div>
                    <div class="text-muted-foreground mt-1 text-xs">
                      <span
                        class="border-border/60 bg-muted/30 inline-block rounded border px-1.5 py-0.5"
                      >
                        {rule.origin === "user"
                          ? t("skillMonitor.common.custom")
                          : t("skillMonitor.common.preset")}
                      </span>
                    </div>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    {#if rule.origin === "preset"}
                      <button
                        type="button"
                        class="flex h-9 w-9 items-center justify-center rounded border transition-colors {voiceConfigured
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
                        aria-expanded={voiceExpanded}
                        aria-label={t(
                          voiceConfigured
                            ? "skillMonitor.customPanel.counter.voiceConfigured"
                            : "skillMonitor.customPanel.counter.voiceConfigure",
                        )}
                        title={t(
                          voiceConfigured
                            ? "skillMonitor.customPanel.counter.voiceConfigured"
                            : "skillMonitor.customPanel.counter.voiceConfigure",
                        )}
                        onclick={() =>
                          togglePresetVoice(rule.ruleId, slot.slotId)}
                      >
                        <Volume2Icon class="h-4 w-4" />
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="border-border/60 min-h-9 max-w-44 rounded border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-100 {exists
                        ? 'text-primary'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
                      onclick={() =>
                        addCustomPanelEntry(
                          selectedGroup.id,
                          "counter",
                          rule.ruleId,
                          slot.slotId,
                        )}
                      disabled={exists}
                    >
                      {#if !exists}
                        {t("skillMonitor.customPanel.counter.add")}
                      {:else if location?.groupId === selectedGroup.id}
                        {t("skillMonitor.customPanel.status.currentGroupAdded")}
                      {:else}
                        {t("skillMonitor.customPanel.status.alreadyIn", {
                          name: location?.groupName ?? "",
                        })}
                      {/if}
                    </button>
                  </div>
                </div>
                {#if rule.origin === "preset" && voiceExpanded}
                  <div class="border-border/40 mt-2 border-t pt-2">
                    <VoiceBindingControl subject={voiceSubject} />
                  </div>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      </div>

      <div
        class="border-border/60 bg-card/40 space-y-3 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
      >
        <div class="text-foreground text-sm font-medium">
          {t("skillMonitor.customPanel.entries.title")}
        </div>
        {#if selectedGroup.entries.length === 0}
          <div
            class="border-border/60 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm"
          >
            {t("skillMonitor.customPanel.entries.empty")}
          </div>
        {/if}
        {#each selectedGroup.entries as entry, idx (entry.id)}
          {@const counterRule =
            entry.sourceType === "counter"
              ? counterRules.find((item) => item.ruleId === entry.sourceId)
              : null}
          {@const counterSlot =
            entry.sourceType === "counter"
              ? counterRule?.effectSlots.find(
                  (slot) => slot.slotId === entry.counterSlotId,
                )
              : null}
          {@const buffName =
            entry.sourceType === "buff"
              ? getBuffDisplayName(entry.sourceId)
              : null}
          {@const counterEntryLabel =
            entry.sourceType === "counter"
              ? getCounterEntryLabel({
                  sourceId: entry.sourceId,
                  counterSlotId: entry.counterSlotId,
                  label: entry.label,
                  ruleName: counterRule?.name,
                })
              : null}
          <div
            class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3"
          >
            <div class="text-muted-foreground text-xs">
              {entry.sourceType === "counter"
                ? t("skillMonitor.customPanel.entries.sourceCounter", {
                    name: `${counterRule?.name ?? `#${entry.sourceId}`}${counterSlot ? ` #${counterSlot.slotId}` : ""}`,
                  })
                : t("skillMonitor.customPanel.entries.sourceBuff", {
                    name: buffName ?? "",
                  })}
            </div>
            {#if entry.sourceType === "counter"}
              <input
                class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
                value={counterEntryLabel ?? ""}
                placeholder={t(
                  "skillMonitor.customPanel.entries.labelPlaceholder",
                )}
                oninput={(event) =>
                  setCustomPanelEntryLabel(
                    selectedGroup.id,
                    entry.id,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />
              <label
                class="text-muted-foreground flex items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  class="border-border bg-muted/30 text-primary focus:ring-primary/50 h-4 w-4 rounded"
                  checked={entry.hideWhenZero === true}
                  onchange={(event) =>
                    setCustomPanelEntryHideWhenZero(
                      selectedGroup.id,
                      entry.id,
                      (event.currentTarget as HTMLInputElement).checked,
                    )}
                />
                <span>{t("skillMonitor.customPanel.hideWhenZero")}</span>
              </label>
            {:else}
              <div
                class="border-border/60 bg-muted/30 text-foreground rounded border px-2 py-1.5 text-sm"
              >
                {buffName}
              </div>
            {/if}
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 min-h-11 cursor-pointer rounded border px-3 py-1 text-xs disabled:opacity-50"
                onclick={() =>
                  moveCustomPanelEntry(selectedGroup.id, entry.id, "up")}
                disabled={idx === 0}
              >
                {t("skillMonitor.common.moveUp")}
              </button>
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 min-h-11 cursor-pointer rounded border px-3 py-1 text-xs disabled:opacity-50"
                onclick={() =>
                  moveCustomPanelEntry(selectedGroup.id, entry.id, "down")}
                disabled={idx === selectedGroup.entries.length - 1}
              >
                {t("skillMonitor.common.moveDown")}
              </button>
              <button
                type="button"
                class="border-border/60 text-destructive hover:bg-destructive/10 min-h-11 cursor-pointer rounded border px-3 py-1 text-xs transition-colors"
                onclick={() =>
                  removeCustomPanelEntry(selectedGroup.id, entry.id)}
              >
                {t("skillMonitor.common.delete")}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div
        class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
      >
        <div class="space-y-1">
          <div class="text-foreground text-sm font-medium">
            {t("skillMonitor.customPanel.factorSlots.title")}
          </div>
          <p class="text-muted-foreground text-xs">
            {t("skillMonitor.customPanel.factorSlots.description")}
          </p>
        </div>

        <label
          class="border-border/60 bg-muted/20 text-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            class="border-border bg-muted/30 text-primary focus:ring-primary/50 h-4 w-4 rounded"
            checked={selectedGroup.hideZeroCounters === true}
            onchange={(event) =>
              setCustomPanelGroupHideZeroCounters(
                selectedGroup.id,
                (event.currentTarget as HTMLInputElement).checked,
              )}
          />
          <span>{t("skillMonitor.customPanel.hideWhenZero")}</span>
        </label>

        {#if customizedFactorSlots.length > 0}
          <div class="space-y-2">
            <div class="text-muted-foreground text-xs font-medium">
              {t("skillMonitor.customPanel.factorSlots.currentList")}
            </div>
            {#each customizedFactorSlots as item (item.slotTemplateId)}
              <div
                class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3"
              >
                <div class="text-muted-foreground text-xs">
                  {t("skillMonitor.customPanel.factorSlots.defaultName", {
                    name: item.template?.name ?? item.slotTemplateId,
                  })}
                </div>
                <div class="flex items-center gap-2">
                  <input
                    class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 flex-1 rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                    value={item.label}
                    placeholder={t(
                      "skillMonitor.customPanel.factorSlots.customNamePlaceholder",
                    )}
                    oninput={(event) =>
                      setFactorSlotLabel(
                        item.slotTemplateId,
                        (event.currentTarget as HTMLInputElement).value,
                      )}
                  />
                  <button
                    type="button"
                    class="border-border/60 text-destructive hover:bg-destructive/10 min-h-11 cursor-pointer rounded-md border px-3 py-1.5 text-xs transition-colors"
                    onclick={() => setFactorSlotLabel(item.slotTemplateId, "")}
                  >
                    {t("skillMonitor.customPanel.factorSlots.clear")}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <div class="border-border/60 space-y-2 border-t pt-4">
          <div class="text-muted-foreground text-xs font-medium">
            {t("skillMonitor.customPanel.factorSlots.searchTitle")}
          </div>
          <input
            class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-80"
            placeholder={t(
              "skillMonitor.customPanel.factorSlots.searchPlaceholder",
            )}
            value={factorSlotSearch}
            oninput={(event) =>
              (factorSlotSearch = (event.currentTarget as HTMLInputElement)
                .value)}
          />
          {#if factorSlotSearch.trim().length > 0}
            {#if filteredSlotTemplates.length === 0}
              <div
                class="border-border/60 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm"
              >
                {t("skillMonitor.customPanel.factorSlots.noMatch")}
              </div>
            {:else}
              <div class="grid grid-cols-1 gap-2">
                {#each filteredSlotTemplates as template (template.slotTemplateId)}
                  <div
                    class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3"
                  >
                    <div class="text-foreground text-sm font-medium">
                      {template.name}
                    </div>
                    {#if template.description}
                      <div class="text-muted-foreground text-xs">
                        {template.description}
                      </div>
                    {/if}
                    <input
                      class="border-border/60 bg-muted/30 text-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                      value={factorSlotLabels[template.slotTemplateId] ?? ""}
                      placeholder={t(
                        "skillMonitor.customPanel.factorSlots.customNamePlaceholder",
                      )}
                      oninput={(event) =>
                        setFactorSlotLabel(
                          template.slotTemplateId,
                          (event.currentTarget as HTMLInputElement).value,
                        )}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <div
      class="border-border/60 bg-card/40 text-muted-foreground rounded-lg border p-6 text-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      {t("skillMonitor.customPanel.empty")}
    </div>
  {/if}
</div>
