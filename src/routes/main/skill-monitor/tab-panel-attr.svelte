<script lang="ts">
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import { SETTINGS, type PanelAttrConfig, type PanelAreaRowRef } from "$lib/settings-store";
  import { resolveSettingsStoreTranslation, resolveSkillMonitorTranslation } from "$lib/i18n";

  interface Props {
    attrSectionExpanded: boolean;
    monitoredPanelAttrs: PanelAttrConfig[];
    panelAttrGap: number;
    panelAttrFontSize: number;
    panelAttrColumnGap: number;
    panelAreaRowOrder: PanelAreaRowRef[];
    setAttrSectionExpanded: (expanded: boolean) => void;
    setPanelAttrEnabled: (attrId: number, enabled: boolean) => void;
    setPanelAttrColor: (attrId: number, color: string) => void;
    setPanelAttrGap: (value: number) => void;
    setPanelAttrFontSize: (value: number) => void;
    setPanelAttrColumnGap: (value: number) => void;
    movePanelAreaRow: (row: PanelAreaRowRef, direction: "up" | "down") => void;
  }

  let {
    attrSectionExpanded,
    monitoredPanelAttrs,
    panelAttrGap,
    panelAttrFontSize,
    panelAttrColumnGap,
    panelAreaRowOrder,
    setAttrSectionExpanded,
    setPanelAttrEnabled,
    setPanelAttrColor,
    setPanelAttrGap,
    setPanelAttrFontSize,
    setPanelAttrColumnGap,
    movePanelAreaRow,
  }: Props = $props();

  function tSkillMonitor(key: string, fallback: string): string {
    return resolveSkillMonitorTranslation(key, SETTINGS.live.general.state.language, fallback);
  }

  function attrLabel(attr: PanelAttrConfig): string {
    const fallback = typeof attr.label === "string" && attr.label.trim() ? attr.label : `Attr ${attr.attrId}`;
    const labelKey = attr.labelKey ?? `settingsStore.panelAttr.${attr.attrId}`;
    return resolveSettingsStoreTranslation(labelKey, SETTINGS.live.general.state.language, fallback);
  }

  const enabledPanelAttrs = $derived(monitoredPanelAttrs.filter((item) => item.enabled));
  const rowList = $derived.by(() => {
    const rows: Array<{ ref: PanelAreaRowRef; label: string }> = [];
    const seen = new Set<number>();
    for (const row of panelAreaRowOrder ?? []) {
      const attr = enabledPanelAttrs.find((item) => item.attrId === row.attrId);
      if (!attr || seen.has(attr.attrId)) continue;
      seen.add(attr.attrId);
      rows.push({ ref: row, label: attrLabel(attr) });
    }
    for (const attr of enabledPanelAttrs) {
      if (seen.has(attr.attrId)) continue;
      rows.push({
        ref: { type: "attr", attrId: attr.attrId },
        label: attrLabel(attr),
      });
    }
    return rows;
  });
</script>

<div class="rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
  <button
    type="button"
    class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
    onclick={() => setAttrSectionExpanded(!attrSectionExpanded)}
  >
    <div class="text-left">
      <h2 class="text-base font-semibold text-foreground">{tSkillMonitor("skillMonitor.panelAttr.title", "Character Panel")}</h2>
      <p class="text-xs text-muted-foreground mt-1">
        {tSkillMonitor("skillMonitor.panelAttr.enabledCount", "Enabled Attributes")} {enabledPanelAttrs.length}/{monitoredPanelAttrs.length}
      </p>
    </div>
    <ChevronDown
      class="w-5 h-5 text-muted-foreground transition-transform duration-200 {attrSectionExpanded
        ? 'rotate-180'
        : ''}"
    />
  </button>
  {#if attrSectionExpanded}
    <div class="px-4 pb-4 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each monitoredPanelAttrs as attr (attr.attrId)}
          <div class="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-2">
            <label class="flex items-center justify-between gap-3 text-sm text-foreground">
              <span>{attrLabel(attr)}</span>
              <input
                type="checkbox"
                checked={attr.enabled}
                onchange={(event) =>
                  setPanelAttrEnabled(attr.attrId, (event.currentTarget as HTMLInputElement).checked)}
              />
            </label>
            <label class="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{tSkillMonitor("skillMonitor.showColor", "Show Color")}</span>
              <input
                type="color"
                value={attr.color}
                class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
                onchange={(event) =>
                  setPanelAttrColor(attr.attrId, (event.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
        {/each}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <label class="text-xs text-muted-foreground">
          {tSkillMonitor("skillMonitor.buff.gap", "Gap")}: {panelAttrGap}px
          <input
            class="w-full mt-1"
            type="range"
            min="0"
            max="24"
            step="1"
            value={panelAttrGap}
            oninput={(event) =>
              setPanelAttrGap(Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label class="text-xs text-muted-foreground">
          {tSkillMonitor("skillMonitor.panelAttr.fontSize", "Font Size")}: {panelAttrFontSize}px
          <input
            class="w-full mt-1"
            type="range"
            min="10"
            max="28"
            step="1"
            value={panelAttrFontSize}
            oninput={(event) =>
              setPanelAttrFontSize(Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label class="text-xs text-muted-foreground">
          {tSkillMonitor("skillMonitor.textBuff.nameValueGap", "Name-Value Gap")}: {panelAttrColumnGap}px
          <input
            class="w-full mt-1"
            type="range"
            min="0"
            max="240"
            step="1"
            value={panelAttrColumnGap}
            oninput={(event) =>
              setPanelAttrColumnGap(Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
      </div>

      <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <div class="text-sm font-medium text-foreground">{tSkillMonitor("skillMonitor.rowOrder", "Row Order")}</div>
        {#if rowList.length === 0}
          <div class="text-xs text-muted-foreground">{tSkillMonitor("skillMonitor.noSortableItems", "No sortable items")}</div>
        {/if}
        {#each rowList as row, idx}
          <div class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1">
            <span class="w-6 text-center text-xs text-muted-foreground">{idx + 1}</span>
            <span class="flex-1 text-sm text-foreground truncate">{row.label}</span>
            <button
              type="button"
              class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              onclick={() => movePanelAreaRow(row.ref, "up")}
              disabled={idx === 0}
            >
              {tSkillMonitor("skillMonitor.moveUp", "Move Up")}
            </button>
            <button
              type="button"
              class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              onclick={() => movePanelAreaRow(row.ref, "down")}
              disabled={idx === rowList.length - 1}
            >
              {tSkillMonitor("skillMonitor.moveDown", "Move Down")}
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
