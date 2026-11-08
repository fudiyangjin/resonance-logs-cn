<script lang="ts">
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import type {
    BuffDefinition,
    BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import {
    MAX_BUFF_COVERAGE_ENTRIES,
    type BuffCoverageEntry,
    type BuffCoverageStyle,
  } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import OverlayTextStyleFields from "./overlay-text-style-fields.svelte";
  import PanelColorFields from "$lib/components/PanelColorFields.svelte";
  import type { PanelColorPatch } from "$lib/hud-color-schemes";

  interface Props {
    buffCoverageEntries: BuffCoverageEntry[];
    buffCoverageStyle: BuffCoverageStyle;
    coverageBuffSearch: string;
    coverageBuffSearchResults: BuffNameInfo[];
    availableBuffMap: Map<number, BuffDefinition>;
    getBuffIconPreviewSrc: (buffId: number) => string | null;
    setCoverageBuffSearch: (value: string) => void;
    getBuffDisplayName: (buffId: number) => string;
    addBuffCoverageEntry: (buffId: number) => void;
    removeBuffCoverageEntry: (entryId: string) => void;
    setBuffCoverageEntryShowInLive: (entryId: string, value: boolean) => void;
    moveBuffCoverageEntry: (entryId: string, direction: -1 | 1) => void;
    setBuffCoverageStyleFlag: (
      key:
        | "showName"
        | "showRemaining"
        | "showCount"
        | "showStateDot"
        | "showProgress",
      value: boolean,
    ) => void;
    setBuffCoverageFontSize: (value: number) => void;
    setBuffCoverageGap: (value: number) => void;
    applyBuffCoverageColors: (patch: PanelColorPatch) => void;
    setBuffCoverageTextShadowEnabled: (value: boolean) => void;
    setBuffCoverageBackgroundEnabled: (value: boolean) => void;
    setBuffCoverageBackgroundOpacity: (value: number) => void;
  }

  let {
    buffCoverageEntries,
    buffCoverageStyle,
    coverageBuffSearch,
    coverageBuffSearchResults,
    availableBuffMap,
    getBuffIconPreviewSrc,
    setCoverageBuffSearch,
    getBuffDisplayName,
    addBuffCoverageEntry,
    removeBuffCoverageEntry,
    setBuffCoverageEntryShowInLive,
    moveBuffCoverageEntry,
    setBuffCoverageStyleFlag,
    setBuffCoverageFontSize,
    setBuffCoverageGap,
    applyBuffCoverageColors,
    setBuffCoverageTextShadowEnabled,
    setBuffCoverageBackgroundEnabled,
    setBuffCoverageBackgroundOpacity,
  }: Props = $props();

  const configuredIds = $derived(
    new Set(buffCoverageEntries.map((entry) => entry.buffId)),
  );
  const atLimit = $derived(
    buffCoverageEntries.length >= MAX_BUFF_COVERAGE_ENTRIES,
  );
</script>

<div class="space-y-4">
  <div
    class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-foreground">
        {t("skillMonitor.buffCoverage.title")}
      </h2>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.buffCoverage.description")}
      </p>
    </div>
  </div>

  <div
    class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-3"
  >
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm font-medium text-foreground">
          {t("skillMonitor.buffCoverage.list.title")}
        </div>
        <span class="text-xs tabular-nums text-muted-foreground">
          {t("skillMonitor.buffCoverage.list.count", {
            count: buffCoverageEntries.length,
            max: MAX_BUFF_COVERAGE_ENTRIES,
          })}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.buffCoverage.list.description")}
      </p>
    </div>
    <input
      class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-80"
      type="text"
      placeholder={t("skillMonitor.buffCoverage.searchPlaceholder")}
      value={coverageBuffSearch}
      oninput={(event) =>
        setCoverageBuffSearch((event.currentTarget as HTMLInputElement).value)}
    />
    {#if coverageBuffSearch.trim().length > 0}
      <BuffSearchResultGrid
        items={coverageBuffSearchResults}
        {availableBuffMap}
        onSelect={addBuffCoverageEntry}
        isSelected={(buffId) => configuredIds.has(buffId)}
        isDisabled={(buffId) => atLimit && !configuredIds.has(buffId)}
        getStatusLabel={(buffId) =>
          configuredIds.has(buffId)
            ? t("skillMonitor.buffCoverage.status.added")
            : null}
        getIconSrc={getBuffIconPreviewSrc}
        emptyMessage={t("components.buffSearchResultGrid.empty")}
      />
      {#if atLimit}
        <p class="text-xs text-amber-400">
          {t("skillMonitor.buffCoverage.list.limit", {
            max: MAX_BUFF_COVERAGE_ENTRIES,
          })}
        </p>
      {/if}
    {/if}

    {#if buffCoverageEntries.length === 0}
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.buffCoverage.list.empty")}
      </p>
    {:else}
      <div class="space-y-2">
        {#each buffCoverageEntries as entry, index (entry.id)}
          <div
            class="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
          >
            <span class="text-sm text-foreground min-w-32">
              {getBuffDisplayName(entry.buffId)}
              <span class="text-xs text-muted-foreground">#{entry.buffId}</span>
            </span>
            <label
              class="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <input
                type="checkbox"
                checked={entry.showInLive}
                onchange={(event) =>
                  setBuffCoverageEntryShowInLive(
                    entry.id,
                    (event.currentTarget as HTMLInputElement).checked,
                  )}
              />
              {t("skillMonitor.buffCoverage.entry.showInLive")}
            </label>
            <div class="ml-auto flex items-center gap-1">
              <button
                type="button"
                class="rounded border border-border/60 px-2 py-1 text-xs text-foreground hover:bg-muted/50 disabled:opacity-40"
                disabled={index === 0}
                onclick={() => moveBuffCoverageEntry(entry.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="rounded border border-border/60 px-2 py-1 text-xs text-foreground hover:bg-muted/50 disabled:opacity-40"
                disabled={index === buffCoverageEntries.length - 1}
                onclick={() => moveBuffCoverageEntry(entry.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                class="rounded border border-red-500/50 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                onclick={() => removeBuffCoverageEntry(entry.id)}
              >
                {t("skillMonitor.buffCoverage.entry.remove")}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div
    class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-4"
  >
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">
        {t("skillMonitor.buffCoverage.style.title")}
      </div>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.buffCoverage.style.description")}
      </p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label
        class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
      >
        <span>{t("skillMonitor.buffCoverage.style.showName")}</span>
        <input
          type="checkbox"
          checked={buffCoverageStyle.showName}
          onchange={(event) =>
            setBuffCoverageStyleFlag(
              "showName",
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
      <label
        class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
      >
        <span>{t("skillMonitor.buffCoverage.style.showRemaining")}</span>
        <input
          type="checkbox"
          checked={buffCoverageStyle.showRemaining}
          onchange={(event) =>
            setBuffCoverageStyleFlag(
              "showRemaining",
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
      <label
        class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
      >
        <span>{t("skillMonitor.buffCoverage.style.showCount")}</span>
        <input
          type="checkbox"
          checked={buffCoverageStyle.showCount}
          onchange={(event) =>
            setBuffCoverageStyleFlag(
              "showCount",
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
      <label
        class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
      >
        <span>{t("skillMonitor.buffCoverage.style.showStateDot")}</span>
        <input
          type="checkbox"
          checked={buffCoverageStyle.showStateDot}
          onchange={(event) =>
            setBuffCoverageStyleFlag(
              "showStateDot",
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
      <label
        class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
      >
        <span>{t("skillMonitor.buffCoverage.style.showProgress")}</span>
        <input
          type="checkbox"
          checked={buffCoverageStyle.showProgress}
          onchange={(event) =>
            setBuffCoverageStyleFlag(
              "showProgress",
              (event.currentTarget as HTMLInputElement).checked,
            )}
        />
      </label>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label class="text-xs text-muted-foreground">
        {t("skillMonitor.style.fontSize", {
          value: buffCoverageStyle.fontSize,
        })}
        <input
          class="mt-1 w-full"
          type="range"
          min="10"
          max="28"
          step="1"
          value={buffCoverageStyle.fontSize}
          oninput={(event) =>
            setBuffCoverageFontSize(
              Number((event.currentTarget as HTMLInputElement).value),
            )}
        />
      </label>
      <label class="text-xs text-muted-foreground">
        {t("skillMonitor.style.gap", { value: buffCoverageStyle.gap })}
        <input
          class="mt-1 w-full"
          type="range"
          min="0"
          max="24"
          step="1"
          value={buffCoverageStyle.gap}
          oninput={(event) =>
            setBuffCoverageGap(
              Number((event.currentTarget as HTMLInputElement).value),
            )}
        />
      </label>
    </div>
    <PanelColorFields
      style={buffCoverageStyle}
      schemePanel="buffCoverage"
      onchange={applyBuffCoverageColors}
    />
    <OverlayTextStyleFields
      textShadowEnabled={buffCoverageStyle.textShadowEnabled}
      backgroundEnabled={buffCoverageStyle.backgroundEnabled}
      backgroundOpacity={buffCoverageStyle.backgroundOpacity}
      onTextShadowEnabled={setBuffCoverageTextShadowEnabled}
      onBackgroundEnabled={setBuffCoverageBackgroundEnabled}
      onBackgroundOpacity={setBuffCoverageBackgroundOpacity}
    />
  </div>
</div>
