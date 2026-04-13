<script lang="ts">
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import { SETTINGS, type PanelAttrConfig, type PanelAreaRowRef } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";

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

  const tSkillMonitor = uiT("skill-monitor/panel-attr", () => SETTINGS.live.general.state.language);

  function attrLabel(attr: PanelAttrConfig): string {
    const fallback = typeof attr.label === "string" && attr.label.trim() ? attr.label : `Attr ${attr.attrId}`;
    const labelKey = attr.labelKey ?? `panelAttr.${attr.attrId}`;
    return tSkillMonitor(labelKey, fallback);
  }

  let rowOrderSectionExpanded = $state(true);

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

<div class="space-y-4">
  <div class="rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <button
      type="button"
      class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      onclick={() => setAttrSectionExpanded(!attrSectionExpanded)}
    >
      <div class="text-left">
        <h2 class="text-base font-semibold text-foreground">{tSkillMonitor("panelAttr.title", "角色面板")}</h2>
        <p class="text-xs text-muted-foreground mt-1">
          {tSkillMonitor("panelAttr.enabledCount", "已启用属性")} {enabledPanelAttrs.length}/{monitoredPanelAttrs.length}
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
                <span>{tSkillMonitor("showColor", "显示颜色")}</span>
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
            {tSkillMonitor("buff.gap", "间距")}: {panelAttrGap}px
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
            {tSkillMonitor("panelAttr.fontSize", "字体大小")}: {panelAttrFontSize}px
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
            {tSkillMonitor("textBuff.nameValueGap", "名称-数值间距")}: {panelAttrColumnGap}px
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
      </div>
    {/if}
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <button
      type="button"
      class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      onclick={() => (rowOrderSectionExpanded = !rowOrderSectionExpanded)}
    >
      <div class="text-left">
        <div class="text-sm font-medium text-foreground">{tSkillMonitor("rowOrder", "行顺序")}</div>
        <p class="text-xs text-muted-foreground mt-1">{rowList.length}</p>
      </div>
      <ChevronDown
        class="w-5 h-5 text-muted-foreground transition-transform duration-200 {rowOrderSectionExpanded
          ? 'rotate-180'
          : ''}"
      />
    </button>
    {#if rowOrderSectionExpanded}
      <div class="px-4 pb-4">
        <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
          {#if rowList.length === 0}
            <div class="text-xs text-muted-foreground">{tSkillMonitor("noSortableItems", "暂无可排序项")}</div>
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
                {tSkillMonitor("moveUp", "上移")}
              </button>
              <button
                type="button"
                class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
                onclick={() => movePanelAreaRow(row.ref, "down")}
                disabled={idx === rowList.length - 1}
              >
                {tSkillMonitor("moveDown", "下移")}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
