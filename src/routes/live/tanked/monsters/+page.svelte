<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    settings,
    SETTINGS,
    DEFAULT_LIVE_TANKED_PLAYER_STATS,
    normalizeTankedPlayerColumnOrder,
  } from "$lib/settings-store";
  import { liveCombatStore } from "$lib/stores/live-topics.svelte";
  import {
    computePlayerRows,
    computePlayerRowsFromEntities,
  } from "$lib/live-derived";
  import { buildSourceEntities } from "$lib/tanked-source-derived";
  import { liveTankedPlayerColumns } from "$lib/column-data";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatNumber, t } from "$lib/i18n/index.svelte";

  const entityUuid = page.url.searchParams.get("entityUuid") ?? "";

  let liveData = $derived(liveCombatStore.data?.combat ?? null);
  let currEntity = $derived(
    liveData?.entities.find((entity) => entity.entityUuid === entityUuid) ??
      null,
  );

  // The player's overall taken row drives the leading "总计" entry.
  let totalRow = $derived(
    liveData
      ? (computePlayerRows(liveData, "tanked").find(
          (p) => p.entityUuid === entityUuid,
        ) ?? null)
      : null,
  );

  // One synthetic row per attacking monster template, reusing the tanked metric.
  let monsterRows = $derived.by(() => {
    if (!liveData || !currEntity) return [];
    const entities = buildSourceEntities(currEntity, currEntity.takenPerSource);
    return computePlayerRowsFromEntities(
      {
        entities,
        elapsedMs: liveData.elapsedMs,
        damageElapsedMs: liveData.damageElapsedMs,
        activeCombatTimeMs: liveData.activeCombatTimeMs,
        totalDmg: 0,
        totalHeal: 0,
        totalDmgBossOnly: 0,
      },
      "tanked",
    );
  });

  // Reuse the overview's sorting/column configuration.
  let sortKey = $derived(SETTINGS.live.sorting.tankedPlayers.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.tankedPlayers.state.sortDesc);
  let columnOrder = $derived(
    normalizeTankedPlayerColumnOrder(
      SETTINGS.live.columnOrder.tankedPlayers.state.order,
    ),
  );

  function handleSort(key: string) {
    if (SETTINGS.live.sorting.tankedPlayers.state.sortKey === key) {
      SETTINGS.live.sorting.tankedPlayers.state.sortDesc =
        !SETTINGS.live.sorting.tankedPlayers.state.sortDesc;
    } else {
      SETTINGS.live.sorting.tankedPlayers.state.sortKey = key;
      SETTINGS.live.sorting.tankedPlayers.state.sortDesc = true;
    }
  }

  let sortedRows = $derived.by(() => {
    const data = [...monsterRows];
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

  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  const compactMode = $derived(
    tableSettings.compactMode && tableSettings.compactIncludeDetails,
  );
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let abbreviationStyle = $derived(
    SETTINGS.live.general.state.abbreviationStyle,
  );
  let customThemeColors = $derived(
    SETTINGS.live.appearance.state.themeColors,
  );
  let SETTINGS_SHORTEN_TPS = $derived(settings.state.live.general.shortenTps);
  let SETTINGS_RELATIVE_TO_TOP = $derived(
    settings.state.live.general.relativeToTopTankedPlayer,
  );
  let SETTINGS_YOUR_NAME = $derived(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $derived(
    settings.state.live.general.showOthersName,
  );

  // All rows use the viewed player's class color, matching the overview/skills views.
  let glowClassName = $derived.by(() => {
    if (!totalRow) return "";
    const isLocalPlayer =
      liveData?.localPlayerUuid != null &&
      totalRow.entityUuid === liveData.localPlayerUuid;
    return isLocalPlayer
      ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
        ? totalRow.className
        : ""
      : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !==
          "Hide Others' Name"
        ? totalRow.className
        : "";
  });
  let glowClassSpecName = $derived(totalRow?.classSpecName ?? "");

  let maxTaken = $derived(
    monsterRows.reduce((max, p) => (p.totalDmg > max ? p.totalDmg : max), 0),
  );

  let compactData = $derived.by(() =>
    compactMode
      ? [...monsterRows].sort((a, b) => b.totalDmg - a.totalDmg)
      : sortedRows,
  );

  let visiblePlayerColumns = $derived.by(() => {
    const visible = liveTankedPlayerColumns.filter((col) => {
      const defaultValue =
        DEFAULT_LIVE_TANKED_PLAYER_STATS[
          col.key as keyof typeof DEFAULT_LIVE_TANKED_PLAYER_STATS
        ] ?? false;
      return settings.state.live.tanked.players[col.key] ?? defaultValue;
    });
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });

  function openSkills(monsterKey: string) {
    goto(
      `/live/tanked/skills?entityUuid=${entityUuid}&monsterId=${monsterKey}`,
    );
  }

  const totalLabel = $derived(t("history.detail.target.total"));
</script>

<svelte:window oncontextmenu={() => window.history.back()} />

<div
  class="relative flex flex-col gap-2 overflow-hidden rounded-lg ring-1 ring-border/60 bg-card/30 backdrop-blur-sm"
>
  <table class="w-full border-collapse overflow-hidden">
    {#if compactMode}
      <tbody>
        {#if totalRow}
          <tr
            class="relative hover:bg-muted/60 transition-colors cursor-pointer group"
            style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
            onclick={() => openSkills("total")}
          >
            <td class="px-3 py-1 relative z-10">
              <div class="flex items-center h-full gap-2">
                <span
                  class="truncate font-medium min-w-0 flex-1"
                  style="color: {customThemeColors.tableTextColor};"
                  >{totalLabel}</span
                >
                <span
                  class="inline-flex items-center gap-1 tabular-nums font-medium shrink-0"
                  style="color: {customThemeColors.tableTextColor};"
                >
                  {#if SETTINGS_SHORTEN_TPS}
                    <AbbreviatedNumber
                      num={totalRow.totalDmg}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {formatNumber(totalRow.totalDmg)}
                  {/if}
                </span>
              </div>
            </td>
            <TableRowGlow
              className={glowClassName}
              classSpecName={glowClassSpecName}
              percentage={100}
            />
          </tr>
        {/if}
        {#each compactData as row (row.entityUuid)}
          <tr
            class="relative hover:bg-muted/60 transition-colors cursor-pointer group"
            style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
            onclick={() => openSkills(row.entityUuid)}
          >
            <td class="px-3 py-1 relative z-10">
              <div class="flex items-center h-full gap-2">
                <span
                  class="truncate font-medium min-w-0 flex-1"
                  style="color: {customThemeColors.tableTextColor};"
                  >{row.name}</span
                >
                <span
                  class="inline-flex items-center gap-1 tabular-nums font-medium shrink-0"
                  style="color: {customThemeColors.tableTextColor};"
                >
                  <span class="inline-flex items-baseline">
                    {#if SETTINGS_SHORTEN_TPS}
                      <AbbreviatedNumber
                        num={row.totalDmg}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.abbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                      <span class="opacity-70">(</span>
                      <AbbreviatedNumber
                        num={row.dps}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.abbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                      <span class="opacity-70">)</span>
                    {:else}
                      {formatNumber(row.totalDmg)}<span class="opacity-70"
                        >({formatNumber(row.dps, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })})</span
                      >
                    {/if}
                  </span>
                  <span class="w-12 text-right">
                    <PercentFormat
                      val={row.dmgPct}
                      fractionDigits={0}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  </span>
                </span>
              </div>
            </td>
            <TableRowGlow
              className={glowClassName}
              classSpecName={glowClassSpecName}
              percentage={SETTINGS_RELATIVE_TO_TOP
                ? maxTaken > 0
                  ? (row.totalDmg / maxTaken) * 100
                  : 0
                : row.dmgPct}
            />
          </tr>
        {/each}
      </tbody>
    {:else}
      {#if tableSettings.showTableHeader}
        <thead>
          <tr
            class="bg-popover/60"
            style="height: {tableSettings.tableHeaderHeight}px;"
          >
            <th
              class="px-3 py-1 text-left font-medium uppercase tracking-wide"
              style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
              >{t("live.tanked.monsters.title")}</th
            >
            {#each visiblePlayerColumns as col (col.key)}
              <th
                class="px-3 py-1 text-right font-medium uppercase tracking-wide cursor-pointer select-none hover:bg-muted/40 transition-colors"
                style="font-size: {tableSettings.tableHeaderFontSize}px; color: {tableSettings.tableHeaderTextColor};"
                onclick={() => handleSort(col.key)}
              >
                <span class="inline-flex items-center gap-1 justify-end">
                  {col.header}
                  {#if sortKey === col.key}
                    <span class="text-primary">{sortDesc ? "v" : "^"}</span>
                  {/if}
                </span>
              </th>
            {/each}
          </tr>
        </thead>
      {/if}
      <tbody>
        {#if totalRow}
          <tr
            class="relative hover:bg-muted/60 transition-colors cursor-pointer group"
            style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
            onclick={() => openSkills("total")}
          >
            <td class="px-3 py-1 relative z-10">
              <span
                class="truncate font-medium"
                style="color: {customThemeColors.tableTextColor};"
                >{totalLabel}</span
              >
            </td>
            {#each visiblePlayerColumns as col (col.key)}
              <td
                class="px-3 py-1 text-right relative z-10 tabular-nums font-medium"
                style="color: {customThemeColors.tableTextColor};"
              >
                {#if col.key === "totalDmg"}
                  {#if SETTINGS_SHORTEN_TPS}
                    <AbbreviatedNumber
                      num={totalRow.totalDmg}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {formatNumber(totalRow.totalDmg)}
                  {/if}
                {:else if col.key === "dps"}
                  {#if SETTINGS_SHORTEN_TPS}
                    <AbbreviatedNumber
                      num={totalRow.dps}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {formatNumber(totalRow.dps, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  {/if}
                {:else if col.key === "dmgPct"}
                  <PercentFormat
                    val={totalRow.dmgPct}
                    fractionDigits={0}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else if col.key === "critRate" || col.key === "critDmgRate" || col.key === "luckyRate" || col.key === "luckyDmgRate" || col.key === "blockRate" || col.key === "luckyBlockRate"}
                  <PercentFormat
                    val={totalRow[col.key]}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {col.format(totalRow[col.key] ?? 0)}
                {/if}
              </td>
            {/each}
            <TableRowGlow
              className={glowClassName}
              classSpecName={glowClassSpecName}
              percentage={100}
            />
          </tr>
        {/if}
        {#each sortedRows as row (row.entityUuid)}
          <tr
            class="relative hover:bg-muted/60 transition-colors cursor-pointer group"
            style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
            onclick={() => openSkills(row.entityUuid)}
          >
            <td class="px-3 py-1 relative z-10">
              <span
                class="truncate font-medium"
                style="color: {customThemeColors.tableTextColor};"
                >{row.name}</span
              >
            </td>
            {#each visiblePlayerColumns as col (col.key)}
              <td
                class="px-3 py-1 text-right relative z-10 tabular-nums font-medium"
                style="color: {customThemeColors.tableTextColor};"
              >
                {#if col.key === "totalDmg"}
                  {#if SETTINGS_SHORTEN_TPS}
                    <AbbreviatedNumber
                      num={row.totalDmg}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {formatNumber(row.totalDmg)}
                  {/if}
                {:else if col.key === "dps"}
                  {#if SETTINGS_SHORTEN_TPS}
                    <AbbreviatedNumber
                      num={row.dps}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {formatNumber(row.dps, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  {/if}
                {:else if col.key === "dmgPct"}
                  <PercentFormat
                    val={row.dmgPct}
                    fractionDigits={0}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else if col.key === "critRate" || col.key === "critDmgRate" || col.key === "luckyRate" || col.key === "luckyDmgRate" || col.key === "blockRate" || col.key === "luckyBlockRate"}
                  <PercentFormat
                    val={row[col.key]}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {col.format(row[col.key] ?? 0)}
                {/if}
              </td>
            {/each}
            <TableRowGlow
              className={glowClassName}
              classSpecName={glowClassSpecName}
              percentage={SETTINGS_RELATIVE_TO_TOP
                ? maxTaken > 0
                  ? (row.totalDmg / maxTaken) * 100
                  : 0
                : row.dmgPct}
            />
          </tr>
        {/each}
      </tbody>
    {/if}
  </table>
</div>
