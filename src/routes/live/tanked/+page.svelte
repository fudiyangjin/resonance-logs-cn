<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import { settings, SETTINGS } from "$lib/settings-store";
  import { getLiveData } from "$lib/stores/live-meter-store.svelte";
  import { computePlayerRows } from "$lib/live-derived";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { liveTankedPlayerColumns } from "$lib/column-data";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import getDisplayName from "$lib/name-display";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import { resolveUiTranslation } from "$lib/i18n";

  let liveData = $derived(getLiveData());
  let rawTankedData = $derived(
    liveData ? computePlayerRows(liveData, "tanked") : [],
  );

  // Sorting settings
  let sortKey = $derived(SETTINGS.live.sorting.tankedPlayers.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.tankedPlayers.state.sortDesc);
  let columnOrder = $derived(
    SETTINGS.live.columnOrder.tankedPlayers.state.order,
  );

  // Handle column header click for sorting
  function handleSort(key: string) {
    if (SETTINGS.live.sorting.tankedPlayers.state.sortKey === key) {
      SETTINGS.live.sorting.tankedPlayers.state.sortDesc =
        !SETTINGS.live.sorting.tankedPlayers.state.sortDesc;
    } else {
      SETTINGS.live.sorting.tankedPlayers.state.sortKey = key;
      SETTINGS.live.sorting.tankedPlayers.state.sortDesc = true;
    }
  }

  function t(key: string, fallback: string): string {
    return resolveUiTranslation(
      "ui/dps/live.json",
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function thLabel(
    col: { headerKey?: string; labelKey?: string; header: string; label?: string },
  ): string {
    if (col.headerKey) {
      const translatedHeader = resolveUiTranslation(
        col.headerKey,
        SETTINGS.live.general.state.language,
        "",
      );
      if (translatedHeader?.trim()) return translatedHeader;
    }

    if (col.labelKey) {
      const translatedLabel = resolveUiTranslation(
        col.labelKey,
        SETTINGS.live.general.state.language,
        col.label ?? col.header,
      );
      if (translatedLabel?.trim()) return translatedLabel;
    }

    return col.header;
  }

  // Sorted player data based on settings
  let tankedData = $derived.by(() => {
    const data = [...rawTankedData];
    data.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey] ?? 0;
      const bVal = (b as Record<string, unknown>)[sortKey] ?? 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDesc ? bVal - aVal : aVal - bVal;
      }
      return 0;
    });
    return data;
  });

  // Optimize derived calculations to avoid recalculation on every render
  let maxTaken = $state(0);
  let SETTINGS_YOUR_NAME = $state(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $state(settings.state.live.general.showOthersName);
  let SETTINGS_SHORTEN_TPS = $state(settings.state.live.general.shortenTps);
  let SETTINGS_RELATIVE_TO_TOP_TANKED_PLAYER = $state(
    settings.state.live.general.relativeToTopTankedPlayer,
  );

  // Table customization settings
  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );

  // Update maxTaken when data changes
  $effect(() => {
    maxTaken = rawTankedData.reduce(
      (max, p) => (p.totalDmg > max ? p.totalDmg : max),
      0,
    );
  });

  // Update settings references when settings change
  $effect(() => {
    SETTINGS_YOUR_NAME = settings.state.live.general.showYourName;
    SETTINGS_OTHERS_NAME = settings.state.live.general.showOthersName;
    SETTINGS_SHORTEN_TPS = settings.state.live.general.shortenTps;
    SETTINGS_RELATIVE_TO_TOP_TANKED_PLAYER =
      settings.state.live.general.relativeToTopTankedPlayer;
  });

  // Get visible columns based on settings and column order
  let visiblePlayerColumns = $derived.by(() => {
    const visible = liveTankedPlayerColumns.filter((col) => {
      if (col.key === "effectiveTotal" || col.key === "effectiveDps") return false;
      return settings.state.live.tanked.players[col.key];
    });
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });
</script>

<div
  class="relative flex flex-col gap-2 overflow-hidden rounded-lg ring-1 ring-border/60 bg-card/30 backdrop-blur-sm"
>
  <table class="w-full border-collapse overflow-hidden">
    {#if tableSettings.showTableHeader}
      <thead>
        <tr
          class="bg-popover/60"
          style="height: {tableSettings.tableHeaderHeight}px;"
        >
          <th
            class="px-3 py-1 text-left font-medium uppercase tracking-wide"
            style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
            >{t("historyDetail.player", "玩家")}</th
          >
          {#each visiblePlayerColumns as col (col.key)}
            <th
              class="px-3 py-1 text-right font-medium uppercase tracking-wide cursor-pointer select-none hover:bg-muted/40 transition-colors"
              style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
              onclick={() => handleSort(col.key)}
            >
              <span class="inline-flex items-center gap-1 justify-end">
                {thLabel(col)}
                {#if sortKey === col.key}
                  <span class="text-primary">{sortDesc ? "▼" : "▲"}</span>
                {/if}
              </span>
            </th>
          {/each}
        </tr>
      </thead>
    {/if}
    <tbody>
      {#each tankedData as player (player.uid)}
        {@const isLocalPlayer = liveData?.localPlayerUid != null &&
          player.uid === liveData.localPlayerUid}
        {@const displayName = getDisplayName({
          player: {
            uid: player.uid,
            name: player.name,
            className: player.className,
            classSpecName: player.classSpecName,
          },
          showYourNameSetting: SETTINGS_YOUR_NAME,
          showOthersNameSetting: SETTINGS_OTHERS_NAME,
          isLocalPlayer,
        })}
        {@const className = isLocalPlayer
          ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
            ? player.className
            : ""
          : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !==
              "Hide Others' Name"
            ? player.className
            : ""}
        {@const showAbilityScore =
          player.abilityScore > 0 &&
          (isLocalPlayer
            ? SETTINGS.live.general.state.showYourAbilityScore
            : SETTINGS.live.general.state.showOthersAbilityScore)}
        {@const showSeasonStrength =
          player.seasonStrength > 0 &&
          (isLocalPlayer
            ? SETTINGS.live.general.state.showYourSeasonStrength
            : SETTINGS.live.general.state.showOthersSeasonStrength)}
        <tr
          class="relative bg-background/40 hover:bg-muted/60 transition-colors cursor-default group"
          style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
        >
          <td class="px-3 py-1 relative z-10">
            <div class="flex items-center h-full gap-2">
              <img
                style="width: {tableSettings.playerIconSize}px; height: {tableSettings.playerIconSize}px;"
                class="object-contain"
                src={getClassIcon(className)}
                alt={t("live.classIconAlt", "Class icon")}
                {@attach tooltip(
                  () =>
                    formatClassSpecLabel(player.className, player.classSpecName) ||
                    t("live.unknownClass", "Unknown Class"),
                )}
              />
              {#if showAbilityScore || showSeasonStrength}
                <span
                  class="inline-flex items-center gap-0 tabular-nums"
                  style="color: {customThemeColors.tableTextColor};"
                >
                  {#if showAbilityScore}
                    {#if SETTINGS.live.general.state.shortenAbilityScore}
                      <AbbreviatedNumber
                        num={player.abilityScore}
                        suffixFontSize={tableSettings.abbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                    {:else}
                      <span>{player.abilityScore}</span>
                    {/if}
                  {/if}
                  {#if showSeasonStrength}
                    <span
                      class={showAbilityScore ? "ml-0 tabular-nums" : "tabular-nums"}
                      style="color: {customThemeColors.tableTextColor};"
                      >({player.seasonStrength})</span
                    >
                  {/if}
                </span>
              {/if}
              <span
                class="truncate font-medium"
                style="color: {customThemeColors.tableTextColor};"
                >{displayName || `#${player.uid}`}</span
              >
            </div>
          </td>
          {#each visiblePlayerColumns as col (col.key)}
            <td
              class="px-3 py-1 text-right relative z-10 tabular-nums font-medium"
              style="color: {customThemeColors.tableTextColor};"
            >
              {#if col.key === "totalDmg" || col.key === "effectiveTotal"}
                {#if SETTINGS_SHORTEN_TPS}
                  <AbbreviatedNumber
                    num={col.key === "totalDmg" ? player.totalDmg : player.effectiveTotal}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {(col.key === "totalDmg" ? player.totalDmg : player.effectiveTotal).toLocaleString()}
                {/if}
              {:else if col.key === "dps" || col.key === "effectiveDps"}
                {#if SETTINGS_SHORTEN_TPS}
                  <AbbreviatedNumber
                    num={col.key === "dps" ? player.dps : player.effectiveDps}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {player.dps.toFixed(1)}
                {/if}
              {:else if col.key === "dmgPct"}
                <PercentFormat
                  val={player.dmgPct}
                  fractionDigits={0}
                  suffixFontSize={tableSettings.abbreviatedFontSize}
                  suffixColor={customThemeColors.tableAbbreviatedColor}
                />
              {:else if col.key === "critRate" || col.key === "critDmgRate" || col.key === "luckyRate" || col.key === "luckyDmgRate"}
                <PercentFormat
                  val={player[col.key]}
                  suffixFontSize={tableSettings.abbreviatedFontSize}
                  suffixColor={customThemeColors.tableAbbreviatedColor}
                />
              {:else}
                {col.format(player[col.key as keyof typeof player] as number ?? 0)}
              {/if}
            </td>
          {/each}
          <TableRowGlow
            {className}
            classSpecName={player.classSpecName}
            percentage={SETTINGS_RELATIVE_TO_TOP_TANKED_PLAYER
              ? maxTaken > 0
                ? (player.totalDmg / maxTaken) * 100
                : 0
              : player.dmgPct}
          />
        </tr>
      {/each}
    </tbody>
  </table>
</div>
