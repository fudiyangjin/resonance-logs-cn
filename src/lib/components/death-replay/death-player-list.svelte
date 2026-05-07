<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import { SETTINGS, settings } from "$lib/settings-store";
  import type { DeathRecord } from "$lib/api";
  import getDisplayName, { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { uiT } from "$lib/i18n";

  export type DeathPlayerEntry = {
    uid: number;
    name: string;
    className: string;
    classSpecName: string;
    deaths: DeathRecord[];
  };

  let {
    entries,
    localPlayerUid = null,
    onSelect,
    emptyMessage = "",
    variant = "live",
  }: {
    entries: DeathPlayerEntry[];
    localPlayerUid?: number | null;
    onSelect: (uid: number) => void;
    emptyMessage?: string;
    variant?: "live" | "history";
  } = $props();

  const t = uiT("dps/history", () => SETTINGS.live.general.state.language);
  const resolvedEmptyMessage = $derived(
    emptyMessage ||
      t(
        "detail.death.empty",
        "No death replays yet. Player deaths will be grouped here.",
      ),
  );

  const SETTINGS_YOUR_NAME = $derived(
    variant === "history"
      ? settings.state.history.general.showYourName
      : settings.state.live.general.showYourName,
  );
  const SETTINGS_OTHERS_NAME = $derived(
    variant === "history"
      ? settings.state.history.general.showOthersName
      : settings.state.live.general.showOthersName,
  );

  const tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  const customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );
  const compactMode = $derived(
    variant === "live" ? tableSettings.compactMode : false,
  );
  const shortenTps = $derived(
    variant === "history"
      ? SETTINGS.history.general.state.shortenTps
      : SETTINGS.live.general.state.shortenTps,
  );
  const abbreviatedDecimalPlaces = $derived(
    variant === "history"
      ? (SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1)
      : (SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1),
  );
  const abbreviationStyle = $derived(
    variant === "history"
      ? SETTINGS.history.general.state.abbreviationStyle
      : SETTINGS.live.general.state.abbreviationStyle,
  );

  type ComputedRow = {
    entry: DeathPlayerEntry;
    deathCount: number;
    totalTaken: number;
    latestMs: number;
  };

  const aggregatedRows = $derived.by<ComputedRow[]>(() =>
    entries
      .filter((e) => e.deaths.length > 0)
      .map((entry) => {
        let totalTaken = 0;
        let latest = 0;
        for (const death of entry.deaths) {
          const t = Number(death.deathTimestampMs);
          if (t > latest) latest = t;
          for (const dmg of death.recentDamages) {
            totalTaken += Number(dmg.value);
          }
        }
        return {
          entry,
          deathCount: entry.deaths.length,
          totalTaken,
          latestMs: latest,
        };
      }),
  );

  const sortedRows = $derived.by(() =>
    [...aggregatedRows].sort((a, b) => {
      if (compactMode && variant === "live") {
        return b.totalTaken - a.totalTaken;
      }
      const diff = b.deathCount - a.deathCount;
      if (diff !== 0) return diff;
      return b.latestMs - a.latestMs;
    }),
  );

  const maxTotalTaken = $derived(
    sortedRows.reduce((max, r) => (r.totalTaken > max ? r.totalTaken : max), 0),
  );
  const totalTakenAcrossAll = $derived(
    sortedRows.reduce((sum, r) => sum + r.totalTaken, 0),
  );

  function formatAbsoluteTime(ms: number): string {
    const date = new Date(ms);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function resolveDisplayName(entry: DeathPlayerEntry) {
    const isLocal = localPlayerUid != null && entry.uid === localPlayerUid;
    return {
      isLocal,
      displayName:
        getDisplayName({
          player: {
            uid: entry.uid,
            name: entry.name,
            className: entry.className,
            classSpecName: entry.classSpecName,
          },
          showYourNameSetting: SETTINGS_YOUR_NAME,
          showOthersNameSetting: SETTINGS_OTHERS_NAME,
          isLocalPlayer: isLocal,
        }) || `#${entry.uid}`,
      className: (() => {
        const setting = normalizeNameDisplaySetting(
          isLocal ? SETTINGS_YOUR_NAME : SETTINGS_OTHERS_NAME,
        );
        const hidden = isLocal
          ? setting === "Hide Your Name"
          : setting === "Hide Others' Name";
        return hidden ? "" : entry.className;
      })(),
    };
  }

  function pctOfTotal(totalTaken: number): number {
    if (totalTakenAcrossAll <= 0) return 0;
    return (totalTaken / totalTakenAcrossAll) * 100;
  }

  function glowPercentage(totalTaken: number): number {
    if (maxTotalTaken <= 0) return 0;
    return (totalTaken / maxTotalTaken) * 100;
  }

  function replaceCount(template: string, count: number): string {
    return template.replace("{count}", String(count));
  }
</script>

{#if variant === "history"}
  <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-popover/60">
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.player", "Player")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.death.countColumn", "Deaths")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.death.totalTaken", "Total Taken")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.share", "Share")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.death.latest", "Latest Death")}</th
          >
        </tr>
      </thead>
      <tbody class="bg-background/40">
        {#if sortedRows.length === 0}
          <tr>
            <td
              colspan="5"
              class="px-3 py-8 text-center text-xs text-muted-foreground"
            >
              {resolvedEmptyMessage}
            </td>
          </tr>
        {:else}
          {#each sortedRows as row (row.entry.uid)}
            {@const info = resolveDisplayName(row.entry)}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors cursor-pointer"
              onclick={() => onSelect(row.entry.uid)}
            >
              <td class="px-3 py-3 text-sm text-muted-foreground relative z-10">
                <div class="flex items-center gap-2 h-full">
                  <img
                    class="size-5 object-contain"
                    src={getClassIcon(info.className)}
                    alt={t("detail.classIcon", "Class icon")}
                    {@attach tooltip(
                      () =>
                        formatClassSpecLabel(
                          row.entry.className,
                          row.entry.classSpecName,
                        ) || t("detail.unknownClass", "Unknown Class"),
                    )}
                  />
                  <span
                    class="truncate"
                    {@attach tooltip(() => `UID: #${row.entry.uid}`)}
                  >
                    {info.displayName}
                  </span>
                </div>
              </td>
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                >{row.deathCount}</td
              >
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
              >
                {#if shortenTps}
                  <AbbreviatedNumber
                    num={row.totalTaken}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                  />
                {:else}
                  {row.totalTaken.toLocaleString()}
                {/if}
              </td>
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
              >
                <PercentFormat val={pctOfTotal(row.totalTaken)} fractionDigits={0} />
              </td>
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                >{formatAbsoluteTime(row.latestMs)}</td
              >
              <TableRowGlow
                className={info.className}
                classSpecName={row.entry.classSpecName}
                percentage={glowPercentage(row.totalTaken)}
              />
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{:else}
  <div
    class="relative flex flex-col overflow-hidden rounded-lg ring-1 ring-border/60 bg-card/30"
  >
    {#if sortedRows.length === 0}
      <div
        class="flex h-32 items-center justify-center text-muted-foreground text-xs"
      >
        {resolvedEmptyMessage}
      </div>
    {:else}
      <table class="w-full border-collapse">
        {#if !compactMode && tableSettings.showTableHeader}
          <thead>
            <tr
              class="bg-popover/60"
              style="height: {tableSettings.tableHeaderHeight}px;"
            >
              <th
                class="px-3 py-1 text-left font-medium uppercase tracking-wide"
                style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
                >{t("detail.player", "Player")}</th
              >
              <th
                class="px-3 py-1 text-right font-medium uppercase tracking-wide"
                style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
                >{t("detail.death.countColumn", "Deaths")}</th
              >
              <th
                class="px-3 py-1 text-right font-medium uppercase tracking-wide"
                style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
                >{t("detail.death.totalTaken", "Total Taken")}</th
              >
              <th
                class="px-3 py-1 text-right font-medium uppercase tracking-wide"
                style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
                >{t("detail.share", "Share")}</th
              >
            </tr>
          </thead>
        {/if}
        <tbody>
          {#each sortedRows as row (row.entry.uid)}
            {@const info = resolveDisplayName(row.entry)}
            {#if compactMode}
              <tr
                class="relative bg-background/40 hover:bg-muted/60 transition-colors cursor-pointer group"
                style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
                onclick={() => onSelect(row.entry.uid)}
              >
                <td class="px-3 py-1 relative z-10">
                  <div class="flex items-center h-full gap-2">
                    <img
                      style="width: {tableSettings.playerIconSize}px; height: {tableSettings.playerIconSize}px;"
                      class="object-contain shrink-0"
                      src={getClassIcon(info.className)}
                      alt={t("detail.classIcon", "Class icon")}
                      {@attach tooltip(
                        () =>
                          formatClassSpecLabel(
                            row.entry.className,
                            row.entry.classSpecName,
                          ) || t("detail.unknownClass", "Unknown Class"),
                      )}
                    />
                    <span
                      class="truncate font-medium flex-1 min-w-0"
                      style="color: {customThemeColors.tableTextColor};"
                      >{info.displayName}</span
                    >
                    <span
                      class="inline-flex items-center gap-1 tabular-nums font-medium shrink-0"
                      style="color: {customThemeColors.tableTextColor};"
                    >
                      <span class="inline-flex items-baseline">
                        {#if shortenTps}
                          <AbbreviatedNumber
                            num={row.totalTaken}
                            decimalPlaces={abbreviatedDecimalPlaces}
                            {abbreviationStyle}
                            suffixFontSize={tableSettings.abbreviatedFontSize}
                            suffixColor={customThemeColors.tableAbbreviatedColor}
                          />
                          <span class="opacity-70">(</span>
                          <span>
                            {replaceCount(
                              t("detail.death.countShort", "{count} deaths"),
                              row.deathCount,
                            )}
                          </span>
                          <span class="opacity-70">)</span>
                        {:else}
                          {row.totalTaken.toLocaleString()}<span class="opacity-70">
                            ({replaceCount(
                              t("detail.death.countShort", "{count} deaths"),
                              row.deathCount,
                            )})
                          </span>
                        {/if}
                      </span>
                      <span class="w-12 text-right">
                        <PercentFormat
                          val={pctOfTotal(row.totalTaken)}
                          fractionDigits={0}
                          suffixFontSize={tableSettings.abbreviatedFontSize}
                          suffixColor={customThemeColors.tableAbbreviatedColor}
                        />
                      </span>
                    </span>
                  </div>
                </td>
                <TableRowGlow
                  className={info.className}
                  classSpecName={row.entry.classSpecName}
                  percentage={glowPercentage(row.totalTaken)}
                />
              </tr>
            {:else}
              <tr
                class="relative bg-background/40 hover:bg-muted/60 transition-colors cursor-pointer group"
                style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
                onclick={() => onSelect(row.entry.uid)}
              >
                <td class="px-3 py-1 relative z-10">
                  <div class="flex items-center h-full gap-2">
                    <img
                      style="width: {tableSettings.playerIconSize}px; height: {tableSettings.playerIconSize}px;"
                      class="object-contain"
                      src={getClassIcon(info.className)}
                      alt={t("detail.classIcon", "Class icon")}
                      {@attach tooltip(
                        () =>
                          formatClassSpecLabel(
                            row.entry.className,
                            row.entry.classSpecName,
                          ) || t("detail.unknownClass", "Unknown Class"),
                      )}
                    />
                    <span
                      class="truncate font-medium"
                      style="color: {customThemeColors.tableTextColor};"
                      >{info.displayName}</span
                    >
                  </div>
                </td>
                <td
                  class="px-3 py-1 text-right relative z-10 tabular-nums font-medium"
                  style="color: {customThemeColors.tableTextColor};"
                  >{row.deathCount}</td
                >
                <td
                  class="px-3 py-1 text-right relative z-10 tabular-nums font-medium"
                  style="color: {customThemeColors.tableTextColor};"
                >
                  {#if shortenTps}
                    <AbbreviatedNumber
                      num={row.totalTaken}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {row.totalTaken.toLocaleString()}
                  {/if}
                </td>
                <td
                  class="px-3 py-1 text-right relative z-10 tabular-nums font-medium"
                  style="color: {customThemeColors.tableTextColor};"
                >
                  <PercentFormat
                    val={pctOfTotal(row.totalTaken)}
                    fractionDigits={0}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                </td>
                <TableRowGlow
                  className={info.className}
                  classSpecName={row.entry.classSpecName}
                  percentage={glowPercentage(row.totalTaken)}
                />
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
{/if}
