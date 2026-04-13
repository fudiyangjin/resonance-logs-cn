<script lang="ts">
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";
  import type {
    CustomPanelGroup,
    CustomPanelStyle,
    InlineBuffEntry,
  } from "$lib/settings-store";
  import type { CounterRulePreset, SourceTemplate, SlotTemplate } from "$lib/skill-mappings";
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";

  type CounterRuleOption = CounterRulePreset & { origin: "preset" | "user" };

  interface Props {
    counterRules: CounterRuleOption[];
    sourceTemplates: SourceTemplate[];
    slotTemplates: SlotTemplate[];
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
      counterSlotId?: number,
    ) => void;
    addUserCounterRule: (name: string, sourceRefs: string[], slotRefs: string[]) => void;
    removeUserCounterRule: (ruleId: number) => void;
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

  const t = uiT("skill-monitor/custom-panel", () => SETTINGS.live.general.state.language);

  let {
    counterRules,
    sourceTemplates,
    slotTemplates,
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
    addUserCounterRule,
    removeUserCounterRule,
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

  let selectedGroupId = $state<string | null>(null);
  let isCreatingUserRule = $state(false);
  let draftRuleName = $state("");
  let draftSourceRefs = $state<string[]>([]);
  let draftSlotRefs = $state<string[]>([]);

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
  const canSaveDraftRule = $derived(
    draftRuleName.trim().length > 0 && draftSourceRefs.length > 0 && draftSlotRefs.length > 0,
  );

  function getEntryLocation(
    sourceType: InlineBuffEntry["sourceType"],
    sourceId: number,
    counterSlotId?: number,
  ): { groupId: string; groupName: string } | null {
    for (const group of customPanelGroups) {
      if (group.entries.some((entry) =>
        entry.sourceType === sourceType
        && entry.sourceId === sourceId
        && (sourceType !== "counter" || entry.counterSlotId === counterSlotId)
      )) {
        return { groupId: group.id, groupName: group.name };
      }
    }
    return null;
  }

  function buffStatusLabel(buffId: number): string | null {
    const location = getEntryLocation("buff", buffId);
    if (!location) return null;
    return location.groupId === selectedGroup?.id ? t("currentGroupAdded", "当前组已添加") : `${t("alreadyInGroup", "已在")}${location.groupName}`;
  }

  function toggleDraftRef(
    current: string[],
    value: string,
  ): string[] {
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
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("customPanel.title", "自定义监控区")}</h2>
      <p class="text-xs text-muted-foreground">
        {t("customPanel.subtitle", "可创建多个文本监控区；同一个 Buff 或计数器在所有监控区内全局唯一。")}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="min-h-11 rounded-lg border border-border/60 bg-muted/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 cursor-pointer"
        onclick={addCustomPanelGroup}
      >
        {t("customPanel.newGroup", "新建监控区")}
      </button>
      <div class="text-xs text-muted-foreground" role="status" aria-live="polite">
        {#if selectedGroup}
          {t("customPanel.editing", "当前编辑：")}{selectedGroup.name}
        {:else}
          {t("customPanel.selectOrCreate", "请选择或新建一个监控区")}
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
                {t("entries", "条目")} {group.entries.length}
              </div>
            </button>
            <button
              type="button"
              class="min-h-11 rounded-md border border-border/60 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
              onclick={() => removeCustomPanelGroup(group.id)}
            >
              {t("deleteGroup", "删除分组")}
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if selectedGroup}
    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
      <div class="space-y-1">
        <div class="text-sm font-medium text-foreground">{t("customPanel.currentGroup", "当前监控区")}</div>
        <p class="text-xs text-muted-foreground">
          {t("customPanel.currentGroupDescription", "该监控区中的条目会在 overlay 中作为独立文本区域显示，并可单独拖拽和缩放。")}
        </p>
      </div>
      <label class="block text-xs text-muted-foreground">
        {t("customPanel.groupName", "监控区名称")}
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
        <div class="text-sm font-medium text-foreground">{t("customPanel.addBuff", "添加 Buff")}</div>
        <p class="text-xs text-muted-foreground">{t("customPanel.addBuffDescription", "仅添加到当前监控区的文本区域")}</p>
      </div>
      <input
        class="w-full sm:w-80 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder={t("customPanel.searchAddBuff", "搜索并添加 Buff")}
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
          emptyMessage={t("noMatchingBuff", "没有匹配的 Buff")}
        />
      {/if}
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
      <div class="space-y-1">
        <div class="text-sm font-medium text-foreground">{t("customPanel.addCounter", "添加计数器")}</div>
        <p class="text-xs text-muted-foreground">{t("customPanel.addCounterDescription", "计数器同样全局唯一，只能属于一个监控区。")}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        {#each counterRules as rule (rule.ruleId)}
          {@const location = getEntryLocation("counter", rule.ruleId)}
          {@const exists = Boolean(location)}
          <div
            role="button"
            tabindex="0"
            class="min-h-11 rounded-lg border border-border/60 bg-muted/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 cursor-pointer"
            onclick={() => {
              isCreatingUserRule = !isCreatingUserRule;
              if (!isCreatingUserRule) {
                draftRuleName = "";
                draftSourceRefs = [];
                draftSlotRefs = [];
              }
            }}
            onkeydown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                isCreatingUserRule = !isCreatingUserRule;
                if (!isCreatingUserRule) {
                  draftRuleName = "";
                  draftSourceRefs = [];
                  draftSlotRefs = [];
                }
              }
            }}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium text-foreground">{rule.name}</div>
              <div class="text-xs {exists ? 'text-primary' : 'text-muted-foreground'}">
                {#if !exists}
                  {t("clickToAdd", "点击添加")}
                {:else if location?.groupId === selectedGroup.id}
                  {t("currentGroupAdded", "当前组已添加")}
                {:else}
                  {t("alreadyInGroup", "已在")}{location?.groupName}
                {/if}
              </div>
              <button
                type="button"
                class="min-h-11 rounded-md border border-border/60 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
                onclick={(event) => { event.stopPropagation(); removeUserCounterRule(rule.ruleId); }}
              >
                {t("delete", "删除")}
              </button>
            </div>
          </div>
        {/each}
      </div>

      {#if isCreatingUserRule}
        <div class="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
          <label class="block text-xs text-muted-foreground">
            {t("customPanel.ruleName", "规则名称")}
            <input
              class="mt-1 w-full rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={draftRuleName}
              placeholder={t("customPanel.ruleNamePlaceholder", "例如：居合 + Tick 能量")}
              oninput={(event) => (draftRuleName = (event.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <div class="space-y-2">
            <div class="text-sm font-medium text-foreground">{t("customPanel.selectSources", "选择 Sources")}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each sourceTemplates as template (template.sourceId)}
                {@const selected = draftSourceRefs.includes(template.sourceId)}
                <button
                  type="button"
                  class="min-h-11 text-left rounded border px-3 py-2 transition-colors cursor-pointer {selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
                  onclick={() => (draftSourceRefs = toggleDraftRef(draftSourceRefs, template.sourceId))}
                >
                  <div class="text-sm font-medium text-foreground">{template.name}</div>
                </button>
              {/each}
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-sm font-medium text-foreground">{t("customPanel.selectSlots", "选择 Slots")}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each slotTemplates as template (template.slotTemplateId)}
                {@const selected = draftSlotRefs.includes(template.slotTemplateId)}
                <button
                  type="button"
                  class="min-h-11 text-left rounded border px-3 py-2 transition-colors cursor-pointer {selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
                  onclick={() => (draftSlotRefs = toggleDraftRef(draftSlotRefs, template.slotTemplateId))}
                >
                  <div class="text-sm font-medium text-foreground">{template.name}</div>
                </button>
              {/each}
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="min-h-11 rounded border border-border/60 px-4 py-2 text-sm text-foreground hover:bg-muted/40 cursor-pointer"
              onclick={resetDraftRule}
            >
              {t("cancel", "取消")}
            </button>
            <button
              type="button"
              class="min-h-11 rounded border border-primary/60 bg-primary/15 px-4 py-2 text-sm font-medium text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              onclick={submitDraftRule}
              disabled={!canSaveDraftRule}
            >
              {t("customPanel.saveRule", "保存规则")}
            </button>
          </div>
        </div>
      {/if}
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
      <div class="space-y-1">
        <div class="text-sm font-medium text-foreground">{t("customPanel.addCounter", "添加计数器")}</div>
        <p class="text-xs text-muted-foreground">
          {t("customPanel.addCounterListDescription", "计数器槽位全局唯一，只能属于一个监控区。预设规则与自定义规则会一起显示。")}
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        {#each counterRules as rule (rule.ruleId)}
          {#each rule.effectSlots as slot (slot.slotId)}
            {@const location = getEntryLocation("counter", rule.ruleId, slot.slotId)}
            {@const exists = Boolean(location)}
            <button
              type="button"
              class="min-h-11 text-left rounded border px-3 py-2 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-100 {exists
                ? 'border-primary bg-primary/10'
                : 'border-border/60 bg-muted/20 hover:bg-muted/40'}"
              onclick={() => addCustomPanelEntry(selectedGroup.id, "counter", rule.ruleId, slot.slotId)}
              disabled={exists}
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-medium text-foreground">
                    {rule.name}{rule.effectSlots.length > 1 ? ` #${slot.slotId}` : ""}
                  </div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    <span class="inline-block rounded border border-border/60 bg-muted/30 px-1.5 py-0.5">
                      {rule.origin === "user" ? t("custom", "自定义") : t("preset", "预设")}
                    </span>
                  </div>
                </div>
                <div class="text-xs {exists ? 'text-primary' : 'text-muted-foreground'}">
                  {#if !exists}
                    {t("clickToAdd", "点击添加")}
                  {:else if location?.groupId === selectedGroup.id}
                    {t("currentGroupAdded", "当前组已添加")}
                  {:else}
                    {t("alreadyInGroup", "已在")}{location?.groupName}
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        {/each}
      </div>
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3">
      <div class="text-sm font-medium text-foreground">{t("customPanel.currentGroupEntries", "当前组条目")}</div>
      {#if selectedGroup.entries.length === 0}
        <div class="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
          {t("customPanel.noEntries", "当前监控区暂无条目")}
        </div>
      {/if}
      {#each selectedGroup.entries as entry, idx (entry.id)}
        {@const counterRule = entry.sourceType === "counter"
          ? counterRules.find((item) => item.ruleId === entry.sourceId)
          : null}
        {@const buffName = entry.sourceType === "buff" ? getBuffDisplayName(entry.sourceId) : null}
        <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
          <div class="text-xs text-muted-foreground">
            {t("source", "来源")}：{entry.sourceType === "counter"
              ? `${t("counter", "计数器")} - ${counterRule?.name ?? `#${entry.sourceId}`}`
              : `Buff - ${buffName}`}
          </div>
          {#if entry.sourceType === "counter"}
            <input
              class="w-full rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={entry.label}
              placeholder={t("displayName", "显示名称")}
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
              {t("moveUp", "上移")}
            </button>
            <button
              type="button"
              class="min-h-11 rounded border border-border/60 px-3 py-1 text-xs hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
              onclick={() => moveCustomPanelEntry(selectedGroup.id, entry.id, "down")}
              disabled={idx === selectedGroup.entries.length - 1}
            >
              {t("moveDown", "下移")}
            </button>
            <button
              type="button"
              class="min-h-11 rounded border border-border/60 px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
              onclick={() => removeCustomPanelEntry(selectedGroup.id, entry.id)}
            >
              {t("deleteGroup", "删除分组")}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="rounded-lg border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      {t("customPanel.emptyState", "还没有任何自定义监控区。先点击上方“新建监控区”，再向其中添加 Buff 或计数器。")}
    </div>
  {/if}

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("customPanel.sharedStyleTitle", "共享样式")}</h2>
      <p class="text-xs text-muted-foreground">{t("customPanel.sharedStyleDescription", "所有自定义监控区共用以下文字与进度条样式。")}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <label class="text-xs text-muted-foreground">
        {t("buff.gap", "间距")}: {customPanelStyle.gap}px
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
        {t("textBuff.fontSize", "字体大小")}: {customPanelStyle.fontSize}px
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
        {t("textBuff.nameValueGap", "名称-数值间距")}: {customPanelStyle.columnGap}px
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
        {t("nameColor", "名称颜色")}
        <input
          type="color"
          value={customPanelStyle.nameColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelNameColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {t("valueColor", "数值颜色")}
        <input
          type="color"
          value={customPanelStyle.valueColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelValueColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {t("progressColor", "进度条颜色")}
        <input
          type="color"
          value={customPanelStyle.progressColor}
          class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
          onchange={(event) => setCustomPanelProgressColor((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <div>{t("progressOpacity", "进度条透明度")}: {Math.round(customPanelStyle.progressOpacity * 100)}%</div>
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
