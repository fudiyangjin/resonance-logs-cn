<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import { goto } from "$app/navigation";
  import { settings, SETTINGS } from "$lib/settings-store";
  import { getLiveData } from "$lib/stores/live-meter-store.svelte";
  import { computePlayerRows } from "$lib/live-derived";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { liveHealPlayerColumns } from "$lib/column-data";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import getDisplayName from "$lib/name-display";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatClassSpecLabel } from "$lib/class-labels";

  let liveData = $derived(getLiveData());
  let rawHealData = $derived(
    liveData ? computePlayerRows(liveData, "heal") : [],
  );

  // Sorting settings
  let sortKey = $derived(SETTINGS.live.sorting.healPlayers.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.healPlayers.state.sortDesc);
  let columnOrder = $derived(SETTINGS.live.columnOrder.healPlayers.state.order);

  // Handle column header click for sorting
  function handleSort(key: string) {
    if (SETTINGS.live.sorting.healPlayers.state.sortKey === key) {
      SETTINGS.live.sorting.healPlayers.state.sortDesc =
        !SETTINGS.live.sorting.healPlayers.state.sortDesc;
    } else {
      SETTINGS.live.sorting.healPlayers.state.sortKey = key;
      SETTINGS.live.sorting.healPlayers.state.sortDesc = true;
    }
  }

  // Sorted player data based on settings
  let healData = $derived.by(() => {
    const data = [...rawHealData];
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
  let maxHeal = $state(0);
  let SETTINGS_YOUR_NAME = $state(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $state(settings.state.live.general.showOthersName);
  let SETTINGS_SHORTEN_DPS = $state(settings.state.live.general.shortenDps);

  // Table customization settings
  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let abbreviationStyle = $derived(SETTINGS.live.general.state.abbreviationStyle);
  let customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );

  // Update maxHeal when data changes
  $effect(() => {
    maxHeal = rawHealData.reduce(
      (max, p) => (p.totalDmg > max ? p.totalDmg : max),
      0,
    );
  });

  // Update settings references when settings change
  $effect(() => {
    SETTINGS_YOUR_NAME = settings.state.live.general.showYourName;
    SETTINGS_OTHERS_NAME = settings.state.live.general.showOthersName;
    SETTINGS_SHORTEN_DPS = settings.state.live.general.shortenDps;
  });

  // Get visible columns based on settings and column order
  let visiblePlayerColumns = $derived.by(() => {
    const visible = liveHealPlayerColumns.filter(
      (col) => settings.state.live.heal.players[col.key],
    );
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });

  // Compact mode: sort by totalDmg (total healing) desc, same logic as DPS/tanked
  let compactMode = $derived(tableSettings.compactMode);
  let compactData = $derived.by(() => {
    if (!compactMode) return healData;
    return [...rawHealData].sort((a, b) => b.totalDmg - a.totalDmg);
  });
</script>

<div
  class="relative flex flex-col gap-2 overflow-hidden rounded-lg ring-1 ring-border/60 bg-card/30"
>
  <table class="w-full border-collapse overflow-hidden">
    {#if compactMode}
      <tbody>
        {#each compactData as player (player.uid)}
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
          <tr
            class="relative bg-background/40 hover:bg-muted/60 transition-colors cursor-pointer group"
            style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
            onclick={() => goto(`/live/heal/skills?playerUid=${player.uid}`)}
          >
            <td class="px-3 py-1 relative z-10">
              <div class="flex items-center h-full gap-2">
                <img
                  style="width: {tableSettings.playerIconSize}px; height: {tableSettings.playerIconSize}px;"
                  class="object-contain shrink-0"
                  src={getClassIcon(className)}
                  alt="Class icon"
                  {@attach tooltip(
                    () =>
                      formatClassSpecLabel(player.className, player.classSpecName) ||
                      "未知职业",
                  )}
                />
                <span
                  class="truncate font-medium flex-1 min-w-0"
                  style="color: {customThemeColors.tableTextColor};"
                  >{displayName || `#${player.uid}`}</span
                >
                <span
                  class="inline-flex items-center gap-1 tabular-nums font-medium shrink-0"
                  style="color: {customThemeColors.tableTextColor};"
                >
                  <span class="inline-flex items-baseline">
                    {#if SETTINGS_SHORTEN_DPS}
                      <AbbreviatedNumber
                        num={player.totalDmg}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.abbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                      <span class="opacity-70">(</span>
                      <AbbreviatedNumber
                        num={player.dps}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.abbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                      <span class="opacity-70">)</span>
                    {:else}
                      {player.totalDmg.toLocaleString()}<span
                        class="opacity-70"
                        >({Math.round(player.dps).toLocaleString()})</span
                      >
                    {/if}
                  </span>
                  <span class="w-12 text-right">
                    <PercentFormat
                      val={player.dmgPct}
                      fractionDigits={0}
                      suffixFontSize={tableSettings.abbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  </span>
                </span>
              </div>
            </td>
            <TableRowGlow
              {className}
              classSpecName={player.classSpecName}
              percentage={SETTINGS.live.general.state.relativeToTopHealPlayer
                ? maxHeal > 0
                  ? (player.totalDmg / maxHeal) * 100
                  : 0
                : player.dmgPct}
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
            >Player</th
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
                  <span class="text-primary">{sortDesc ? "▼" : "▲"}</span>
                {/if}
              </span>
            </th>
          {/each}
        </tr>
      </thead>
    {/if}
    <tbody>
      {#each healData as player (player.uid)}
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
          class="relative bg-background/40 hover:bg-muted/60 transition-colors cursor-pointer group"
          style="height: {tableSettings.playerRowHeight}px; font-size: {tableSettings.playerFontSize}px;"
          onclick={() => goto(`/live/heal/skills?playerUid=${player.uid}`)}
        >
          <td class="px-3 py-1 relative z-10">
            <div class="flex items-center h-full gap-2">
              <img
                style="width: {tableSettings.playerIconSize}px; height: {tableSettings.playerIconSize}px;"
                class="object-contain"
                src={getClassIcon(className)}
                alt="Class icon"
                {@attach tooltip(
                  () =>
                    formatClassSpecLabel(player.className, player.classSpecName) ||
                    "未知职业",
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
                {#if SETTINGS_SHORTEN_DPS}
                  <AbbreviatedNumber
                    num={col.key === "totalDmg"
                      ? player.totalDmg
                      : player.effectiveTotal}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {col.format(player[col.key] ?? 0)}
                {/if}
              {:else if col.key === "dps" || col.key === "effectiveDps"}
                {#if SETTINGS_SHORTEN_DPS}
                  <AbbreviatedNumber
                    num={player[col.key] ?? 0}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                    suffixFontSize={tableSettings.abbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {col.format(player[col.key] ?? 0)}
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
                {col.format(player[col.key] ?? 0)}
              {/if}
            </td>
          {/each}
          <TableRowGlow
            {className}
            classSpecName={player.classSpecName}
            percentage={SETTINGS.live.general.state.relativeToTopHealPlayer
              ? maxHeal > 0
                ? (player.totalDmg / maxHeal) * 100
                : 0
              : player.dmgPct}
          />
        </tr>
      {/each}
    </tbody>
    {/if}
  </table>
</div>
