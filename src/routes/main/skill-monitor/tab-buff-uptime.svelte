<script lang="ts">
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import { SETTINGS, type BuffUptimeTextStyle, type BuffUptimeTrackingMode } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";
  import type { BuffDefinition, BuffNameInfo } from "$lib/config/buff-name-table";

  interface Props {
    uptimeBuffSearch: string;
    uptimeBuffSearchResults: BuffNameInfo[];
    monitoredUptimeBuffIds: number[];
    uptimeBuffColors: Record<string, string>;
    uptimeBuffAliases: Record<string, string>;
    uptimeBuffTrackingModes: Record<string, BuffUptimeTrackingMode>;
    uptimeBuffActiveIndicators: Record<string, boolean>;
    uptimeBuffMinStacksEnabled: Record<string, boolean>;
    uptimeBuffMinStacks: Record<string, number>;
    buffUptimeTextStyle: BuffUptimeTextStyle;
    showTrueUptime: boolean;
    buffUptimeGap: number;
    buffUptimeFontSize: number;
    buffUptimeEncounterFontSize: number;
    buffUptimeTrueFontSize: number;
    buffUptimeColumnGap: number;
    buffUptimeNameColumnAdjust: number;
    buffUptimeEncounterColumnAdjust: number;
    buffUptimeTrueColumnAdjust: number;
    availableBuffs: BuffDefinition[];
    availableBuffMap: Map<number, BuffDefinition>;
    setUptimeBuffSearch: (value: string) => void;
    toggleUptimeBuff: (buffId: number) => void;
    isUptimeBuffSelected: (buffId: number) => boolean;
    clearUptimeBuffs: () => void;
    setShowTrueUptime: (value: boolean) => void;
    setBuffUptimeAlias: (buffId: number, alias: string) => void;
    setBuffUptimeTrackingMode: (buffId: number, value: BuffUptimeTrackingMode) => void;
    setBuffUptimeActiveIndicator: (buffId: number, value: boolean) => void;
    setBuffUptimeColor: (buffId: number, color: string) => void;
    setBuffUptimeMinStacksEnabled: (buffId: number, value: boolean) => void;
    setBuffUptimeMinStacks: (buffId: number, value: number) => void;
    setBuffUptimeOutlineEnabled: (value: boolean) => void;
    setBuffUptimeOutlineColor: (color: string) => void;
    setBuffUptimeOutlineStrength: (value: number) => void;
    setBuffUptimeShowTitle: (value: boolean) => void;
    setBuffUptimeGap: (value: number) => void;
    setBuffUptimeFontSize: (value: number) => void;
    setBuffUptimeEncounterFontSize: (value: number) => void;
    setBuffUptimeTrueFontSize: (value: number) => void;
    setBuffUptimeColumnGap: (value: number) => void;
    setBuffUptimeNameColumnAdjust: (value: number) => void;
    setBuffUptimeEncounterColumnAdjust: (value: number) => void;
    setBuffUptimeTrueColumnAdjust: (value: number) => void;
    getBuffDisplayName: (buffId: number) => string;
  }

  type PreviewIndicatorState = "hidden" | "active" | "inactive";

  type PreviewRow = {
    key: string;
    label: string;
    color: string;
    indicatorState: PreviewIndicatorState;
    encounterText: string;
    trueText?: string;
    sourceText?: string;
  };

  const t = uiT("overlay/skill-monitor/buff-monitor", () => SETTINGS.live.general.state.language);
  let searchSectionExpanded = $state(true);
  let colorSectionExpanded = $state(true);
  let optionsSectionExpanded = $state(false);

  let {
    uptimeBuffSearch,
    uptimeBuffSearchResults,
    monitoredUptimeBuffIds,
    uptimeBuffColors,
    uptimeBuffAliases,
    uptimeBuffTrackingModes,
    uptimeBuffActiveIndicators,
    uptimeBuffMinStacksEnabled,
    uptimeBuffMinStacks,
    buffUptimeTextStyle,
    showTrueUptime,
    buffUptimeGap,
    buffUptimeFontSize,
    buffUptimeEncounterFontSize,
    buffUptimeTrueFontSize,
    buffUptimeColumnGap,
    buffUptimeNameColumnAdjust,
    buffUptimeEncounterColumnAdjust,
    buffUptimeTrueColumnAdjust,
    availableBuffs,
    availableBuffMap,
    setUptimeBuffSearch,
    toggleUptimeBuff,
    isUptimeBuffSelected,
    clearUptimeBuffs,
    setShowTrueUptime,
    setBuffUptimeAlias,
    setBuffUptimeTrackingMode,
    setBuffUptimeActiveIndicator,
    setBuffUptimeColor,
    setBuffUptimeMinStacksEnabled,
    setBuffUptimeMinStacks,
    setBuffUptimeOutlineEnabled,
    setBuffUptimeOutlineColor,
    setBuffUptimeOutlineStrength,
    setBuffUptimeShowTitle,
    setBuffUptimeGap,
    setBuffUptimeFontSize,
    setBuffUptimeEncounterFontSize,
    setBuffUptimeTrueFontSize,
    setBuffUptimeColumnGap,
    setBuffUptimeNameColumnAdjust,
    setBuffUptimeEncounterColumnAdjust,
    setBuffUptimeTrueColumnAdjust,
    getBuffDisplayName,
  }: Props = $props();

  function uptimeSearchStatusLabel(buffId: number): string | null {
    return isUptimeBuffSelected(buffId) ? t("selected", "Selected") : null;
  }

  function darkenHexColor(color: string | undefined, amount = 0.42): string {
    const normalized = (color || "#ffffff").trim();
    const hex = normalized.replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color || "#d9d9d9";

    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    const factor = Math.max(0, Math.min(1, 1 - amount));
    const r = clamp(parseInt(hex.slice(0, 2), 16) * factor);
    const g = clamp(parseInt(hex.slice(2, 4), 16) * factor);
    const b = clamp(parseInt(hex.slice(4, 6), 16) * factor);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  function buildPreviewRow(
    key: string,
    base: { label: string; color: string; showIndicator: boolean },
    sample: {
      encounterText: string;
      trueText?: string;
      sourceText?: string;
      indicatorState?: Exclude<PreviewIndicatorState, "hidden">;
    },
  ): PreviewRow {
    return {
      key,
      label: base.label,
      color: base.color,
      indicatorState: base.showIndicator ? (sample.indicatorState ?? "active") : "hidden",
      encounterText: sample.encounterText,
      ...(sample.trueText !== undefined ? { trueText: sample.trueText } : {}),
      ...(sample.sourceText !== undefined ? { sourceText: sample.sourceText } : {}),
    };
  }

  const previewRows = $derived.by<PreviewRow[]>(() => {
    const sourcePrefix = t("uptime.sourcePrefix", "From");
    const samples = [
      { encounterText: "9%", trueText: "[9%]", indicatorState: "active" as const },
      { encounterText: "99%", trueText: "[99%]", indicatorState: "active" as const },
      {
        encounterText: "100%",
        trueText: "[100%]",
        sourceText: `${sourcePrefix}: ${t("uptime.previewSourceParty", "Party")}`,
        indicatorState: "inactive" as const,
      },
    ];

    const fallback = [
      { label: t("uptime.previewName1", "Lifewave"), color: "#bfff00", showIndicator: true },
      { label: t("uptime.previewName2", "Mirage Dream"), color: "#b400ff", showIndicator: true },
      { label: t("uptime.previewName3", "Rorola Debuff"), color: "#ff2a2a", showIndicator: true },
    ];

    return samples
      .map((sample, index) => {
        const base = fallback[index];
        if (!base) return null;

        const buffId = monitoredUptimeBuffIds[index];
        if (buffId === undefined) {
          return buildPreviewRow(`fallback-${index}`, base, {
            encounterText: sample.encounterText,
            ...(showTrueUptime && sample.trueText !== undefined ? { trueText: sample.trueText } : {}),
            ...(index === 2 && sample.sourceText !== undefined ? { sourceText: sample.sourceText } : {}),
          });
        }

        const alias = uptimeBuffAliases[String(buffId)]?.trim();
        const label = alias || getBuffDisplayName(buffId);
        const trackingMode = uptimeBuffTrackingModes[String(buffId)] ?? "self";
        return buildPreviewRow(`tracked-${buffId}-${index}`, {
          label,
          color: uptimeBuffColors[String(buffId)] ?? base.color,
          showIndicator: uptimeBuffActiveIndicators[String(buffId)] ?? true,
        }, {
          encounterText: sample.encounterText,
          ...(showTrueUptime && sample.trueText !== undefined ? { trueText: sample.trueText } : {}),
          ...(trackingMode === "global" && index > 0 && sample.sourceText !== undefined ? { sourceText: sample.sourceText } : {}),
        });
      })
      .filter((row): row is PreviewRow => row !== null);
  });

  const previewTextShadow = $derived.by(() => {
    if (!buffUptimeTextStyle.useOutline || buffUptimeTextStyle.outlineStrength <= 0) return undefined;
    const strength = Math.max(1, Math.round(buffUptimeTextStyle.outlineStrength));
    const color = buffUptimeTextStyle.outlineColor || "#000000";
    return [
      `${-strength}px 0 ${color}`,
      `${strength}px 0 ${color}`,
      `0 ${-strength}px ${color}`,
      `0 ${strength}px ${color}`,
      `${-strength}px ${-strength}px ${color}`,
      `${strength}px ${-strength}px ${color}`,
      `${-strength}px ${strength}px ${color}`,
      `${strength}px ${strength}px ${color}`,
    ].join(", ");
  });

  const previewLabelWidth = $derived.by(() => {
    const maxLabelLength = previewRows.reduce((maxLength, row) => Math.max(maxLength, row.label.length + 1), 11);
    return `calc(${Math.max(11, Math.min(22, maxLabelLength))}ch + ${buffUptimeNameColumnAdjust}px)`;
  });

  const previewEncounterWidth = $derived.by(() => `calc(4ch + ${buffUptimeEncounterColumnAdjust}px)`);
  const previewTrueWidth = $derived.by(() => `calc(7ch + ${buffUptimeTrueColumnAdjust}px)`);
  const previewRowGap = $derived.by(() => `${buffUptimeColumnGap}px`);
</script>

<div class="h-full min-h-0 overflow-y-auto pr-1">
  <div class="space-y-4 pb-4">
    <div class="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 space-y-2">
      <div class="text-xs font-medium text-foreground">{t("uptime.preview", "Overlay Preview")}</div>
      {#if buffUptimeTextStyle.showTitle}
        <div class="text-sm font-extrabold text-foreground" style:font-size={`${Math.max(12, buffUptimeFontSize + 1)}px`} style:text-shadow={previewTextShadow}>{t("uptime.title", "Buff Uptime")}</div>
      {/if}
      <div class="preview-list" style:gap={`${buffUptimeGap}px`}>
        {#each previewRows as row (row.key)}
          <div
            class="preview-row"
            style:--label-width={previewLabelWidth}
            style:--enc-width={previewEncounterWidth}
            style:--true-width={previewTrueWidth}
            style:--row-gap={previewRowGap}
          >
            <div class="preview-name-cell">
              <span class="preview-indicator" aria-hidden="true">
                {#if row.indicatorState !== "hidden"}
                  <span
                    class="preview-indicator-dot"
                    class:active={row.indicatorState === "active"}
                    class:inactive={row.indicatorState === "inactive"}
                  ></span>
                {/if}
              </span>
              <span class="preview-label" style:font-size={`${buffUptimeFontSize}px`} style:color={row.color} style:text-shadow={previewTextShadow}>{row.label}:</span>
            </div>
            <span class="preview-encounter" style:font-size={`${buffUptimeEncounterFontSize}px`} style:color={row.color} style:text-shadow={previewTextShadow}>{row.encounterText}</span>
            {#if row.trueText !== undefined}
              <span class="preview-true" style:font-size={`${buffUptimeTrueFontSize}px`} style:color={darkenHexColor(row.color)} style:text-shadow={previewTextShadow}>{row.trueText}</span>
            {:else}
              <span class="preview-true"></span>
            {/if}
            <span class="preview-source" style:font-size={`${Math.max(9, Math.min(buffUptimeFontSize, buffUptimeEncounterFontSize, buffUptimeTrueFontSize) - 2)}px`} style:text-shadow={previewTextShadow}>{row.sourceText ?? ""}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => (searchSectionExpanded = !searchSectionExpanded)}
      >
        <div class="text-left">
          <h2 class="text-base font-semibold text-foreground">{t("uptime.searchSection", "Search / Tracked Buffs")}</h2>
          <p class="text-xs text-muted-foreground mt-1">{t("uptime.selectedCount", "Tracked Buffs")} {monitoredUptimeBuffIds.length}</p>
        </div>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {searchSectionExpanded ? 'rotate-180' : ''}" />
      </button>

      {#if searchSectionExpanded}
        <div class="px-4 py-4 space-y-4">
          <div class="flex justify-end">
            <button
              type="button"
              class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              onclick={clearUptimeBuffs}
            >
              {t("clear", "Clear")}
            </button>
          </div>

          <input
            class="w-full sm:w-80 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder={t("uptime.searchPlaceholder", "Search buffs to track uptime")}
            value={uptimeBuffSearch}
            oninput={(event) => setUptimeBuffSearch((event.currentTarget as HTMLInputElement).value)}
          />

          {#if uptimeBuffSearch.trim().length > 0}
            <BuffSearchResultGrid
              items={uptimeBuffSearchResults}
              {availableBuffMap}
              onSelect={toggleUptimeBuff}
              isSelected={isUptimeBuffSelected}
              getStatusLabel={uptimeSearchStatusLabel}
              emptyMessage={t("noMatchingBuff", "No matching buffs")}
            />
          {:else}
            <div class="text-xs text-muted-foreground">{t("uptime.searchPrompt", "Enter keywords to find buffs for uptime tracking")}</div>
          {/if}

          <div class="space-y-2">
            <div class="text-xs text-muted-foreground">{t("uptime.selected", "Tracked Buffs")}</div>
            <div class="flex flex-wrap gap-2">
              {#each monitoredUptimeBuffIds as buffId (buffId)}
                {@const iconBuff = availableBuffs.find((buff) => buff.baseId === buffId)}
                {#if iconBuff}
                  <button
                    type="button"
                    class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 size-12 hover:border-border hover:bg-muted/30"
                    title={getBuffDisplayName(buffId)}
                    onclick={() => toggleUptimeBuff(iconBuff.baseId)}
                  >
                    <img src={`/images/buff/${iconBuff.spriteFile}`} alt={getBuffDisplayName(buffId)} class="w-full h-full object-contain" />
                  </button>
                {:else}
                  <button
                    type="button"
                    class="rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-foreground hover:border-border hover:bg-muted/30"
                    title={getBuffDisplayName(buffId)}
                    onclick={() => toggleUptimeBuff(buffId)}
                  >
                    {getBuffDisplayName(buffId)}
                  </button>
                {/if}
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => (colorSectionExpanded = !colorSectionExpanded)}
      >
        <div class="text-left">
          <h2 class="text-base font-semibold text-foreground">{t("uptime.rowColors", "Tracked Buff Colors")}</h2>
          <p class="text-xs text-muted-foreground mt-1">{t("uptime.rowColorsSubtitle", "Save one color per tracked buff for the overlay rows")}</p>
        </div>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {colorSectionExpanded ? 'rotate-180' : ''}" />
      </button>

      {#if colorSectionExpanded}
        <div class="px-4 py-4 space-y-2">
          {#if monitoredUptimeBuffIds.length === 0}
            <div class="text-xs text-muted-foreground">{t("uptime.rowColorsEmpty", "Select buffs above to customize their saved row colors")}</div>
          {:else}
            {#each monitoredUptimeBuffIds as buffId (buffId)}
              <div class="uptime-setting-row rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div class="min-w-0 text-foreground font-medium truncate">{getBuffDisplayName(buffId)}</div>
                <input
                  type="text"
                  value={uptimeBuffAliases[String(buffId)] ?? ""}
                  placeholder={t("uptime.aliasPlaceholder", "Overlay alias")}
                  class="w-full rounded border border-border/60 bg-background/50 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                  onchange={(event) => setBuffUptimeAlias(buffId, (event.currentTarget as HTMLInputElement).value)}
                />
                <select
                  class="rounded border border-border/60 bg-background/50 px-2 py-1 text-xs text-foreground"
                  value={uptimeBuffTrackingModes[String(buffId)] ?? 'self'}
                  onchange={(event) => setBuffUptimeTrackingMode(buffId, ((event.currentTarget as HTMLSelectElement).value as BuffUptimeTrackingMode))}
                >
                  <option value="self">{t("uptime.mode.self", "Self Only")}</option>
                  <option value="global">{t("uptime.mode.global", "Global")}</option>
                </select>
                <label class="flex items-center gap-1 text-xs text-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={uptimeBuffActiveIndicators[String(buffId)] ?? true}
                    onchange={(event) => setBuffUptimeActiveIndicator(buffId, (event.currentTarget as HTMLInputElement).checked)}
                  />
                  {t("uptime.activeShort", "Active")}
                </label>
                <label class="flex items-center gap-1 text-xs text-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={uptimeBuffMinStacksEnabled[String(buffId)] === true}
                    onchange={(event) => setBuffUptimeMinStacksEnabled(buffId, (event.currentTarget as HTMLInputElement).checked)}
                  />
                  {t("uptime.minStacksEnabled", "Min Stacks")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  step="1"
                  value={uptimeBuffMinStacks[String(buffId)] ?? 1}
                  disabled={uptimeBuffMinStacksEnabled[String(buffId)] !== true}
                  title={t("uptime.minStacksValue", "Stacks")}
                  class="w-20 rounded border border-border/60 bg-background/50 px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  onchange={(event) => setBuffUptimeMinStacks(buffId, Number((event.currentTarget as HTMLInputElement).value || 1))}
                />
                <input
                  type="color"
                  value={uptimeBuffColors[String(buffId)] ?? '#ffffff'}
                  class="h-7 w-12 rounded border border-border/60 bg-transparent p-0 shrink-0"
                  onchange={(event) => setBuffUptimeColor(buffId, (event.currentTarget as HTMLInputElement).value)}
                />
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>

    <div class="rounded-lg border border-border/60 bg-card/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => (optionsSectionExpanded = !optionsSectionExpanded)}
      >
        <div class="text-left">
          <h2 class="text-base font-semibold text-foreground">{t("uptime.options", "Options")}</h2>
          <p class="text-xs text-muted-foreground mt-1">{t("uptime.optionsSubtitle", "Overlay formatting, spacing, and readability controls")}</p>
        </div>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {optionsSectionExpanded ? 'rotate-180' : ''}" />
      </button>

      {#if optionsSectionExpanded}
        <div class="px-4 py-4 space-y-4">
          <div class="flex flex-wrap gap-3">
            <label class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={showTrueUptime}
                onchange={(event) => setShowTrueUptime((event.currentTarget as HTMLInputElement).checked)}
              />
              {t("uptime.showTrue", "Show True Uptime")}
            </label>
            <label class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={buffUptimeTextStyle.useOutline}
                onchange={(event) => setBuffUptimeOutlineEnabled((event.currentTarget as HTMLInputElement).checked)}
              />
              {t("uptime.outlineEnabled", "Enable Text Outline")}
            </label>
            <label class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={buffUptimeTextStyle.showTitle}
                onchange={(event) => setBuffUptimeShowTitle((event.currentTarget as HTMLInputElement).checked)}
              />
              {t("uptime.showHeader", "Show Header")}
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.gap", "Row Gap")}: {buffUptimeGap}px</div>
              <input class="w-full mt-1" type="range" min="0" max="24" step="1" value={buffUptimeGap} oninput={(event) => setBuffUptimeGap(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.columnGap", "Column Gap")}: {buffUptimeColumnGap}px</div>
              <input class="w-full mt-1" type="range" min="-24" max="64" step="1" value={buffUptimeColumnGap} oninput={(event) => setBuffUptimeColumnGap(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.nameFontSize", "Buff Name Size")}: {buffUptimeFontSize}px</div>
              <input class="w-full mt-1" type="range" min="10" max="32" step="1" value={buffUptimeFontSize} oninput={(event) => setBuffUptimeFontSize(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.encounterFontSize", "Encounter Uptime Size")}: {buffUptimeEncounterFontSize}px</div>
              <input class="w-full mt-1" type="range" min="10" max="32" step="1" value={buffUptimeEncounterFontSize} oninput={(event) => setBuffUptimeEncounterFontSize(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.trueFontSize", "True Uptime Size")}: {buffUptimeTrueFontSize}px</div>
              <input class="w-full mt-1" type="range" min="10" max="32" step="1" value={buffUptimeTrueFontSize} oninput={(event) => setBuffUptimeTrueFontSize(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.nameColumnAdjust", "Name Column Width")}: {buffUptimeNameColumnAdjust}px</div>
              <input class="w-full mt-1" type="range" min="-120" max="240" step="1" value={buffUptimeNameColumnAdjust} oninput={(event) => setBuffUptimeNameColumnAdjust(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.encounterColumnAdjust", "Encounter Column Width")}: {buffUptimeEncounterColumnAdjust}px</div>
              <input class="w-full mt-1" type="range" min="-120" max="240" step="1" value={buffUptimeEncounterColumnAdjust} oninput={(event) => setBuffUptimeEncounterColumnAdjust(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.trueColumnAdjust", "True Column Width")}: {buffUptimeTrueColumnAdjust}px</div>
              <input class="w-full mt-1" type="range" min="-120" max="240" step="1" value={buffUptimeTrueColumnAdjust} oninput={(event) => setBuffUptimeTrueColumnAdjust(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
            <label class="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t("uptime.outlineColor", "Outline Color")}
              <input
                type="color"
                value={buffUptimeTextStyle.outlineColor}
                class="h-7 w-12 rounded border border-border/60 bg-transparent p-0"
                onchange={(event) => setBuffUptimeOutlineColor((event.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <label class="text-xs text-muted-foreground rounded border border-border/60 bg-muted/20 px-3 py-2">
              <div>{t("uptime.outlineStrength", "Outline Strength")}: {buffUptimeTextStyle.outlineStrength}px</div>
              <input class="w-full mt-2" type="range" min="0" max="4" step="1" value={buffUptimeTextStyle.outlineStrength} oninput={(event) => setBuffUptimeOutlineStrength(Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .preview-list {
    display: flex;
    flex-direction: column;
  }

  .preview-row {
    display: grid;
    grid-template-columns: minmax(0, max-content) var(--enc-width) var(--true-width) minmax(0, max-content);
    align-items: center;
    column-gap: var(--row-gap);
  }

  .preview-name-cell {
    display: grid;
    grid-template-columns: 12px minmax(0, var(--label-width));
    align-items: center;
    column-gap: 4px;
  }

  .preview-indicator {
    width: 12px;
    min-width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-indicator-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(226, 232, 240, 0.22);
    border: 1.5px solid rgba(255, 255, 255, 0.42);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.32);
  }

  .preview-indicator-dot.active {
    background: radial-gradient(circle at 35% 35%, #bbf7d0 0%, #4ade80 45%, #16a34a 100%);
    border-color: rgba(236, 253, 245, 0.95);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.4),
      0 0 8px rgba(74, 222, 128, 0.92),
      0 0 14px rgba(34, 197, 94, 0.55);
  }

  .preview-indicator-dot.inactive {
    background: radial-gradient(circle at 35% 35%, #f4f4f5 0%, #a1a1aa 45%, #52525b 100%);
    border-color: rgba(250, 250, 250, 0.95);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.4),
      0 0 8px rgba(161, 161, 170, 0.45),
      0 0 12px rgba(82, 82, 91, 0.32);
  }

  .preview-label {
    min-width: 0;
    font-weight: 600;
    white-space: nowrap;
  }

  .preview-encounter,
  .preview-true {
    display: block;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .preview-encounter {
    text-align: right;
    font-weight: 700;
  }

  .preview-true {
    text-align: right;
    font-weight: 800;
  }

  .preview-source {
    min-width: 0;
    color: #d4d4d8;
    font-style: italic;
    white-space: nowrap;
  }

  .uptime-setting-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto auto auto auto auto;
    align-items: center;
    gap: 12px;
  }
</style>
