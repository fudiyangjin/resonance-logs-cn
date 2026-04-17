<script lang="ts">
  import { settings, SETTINGS } from "$lib/settings-store";
  import { computePlayerRows } from "$lib/live-derived";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import { getLiveData } from "$lib/stores/live-meter-store.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import LiveGroupedSkillTable from "$lib/components/live-grouped-skill-table.svelte";
  import { liveTankedSkillColumns } from "$lib/column-data";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import getDisplayName from "$lib/name-display";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { toSpecLabel } from "$lib/class-labels";

  const playerUid = Number(page.url.searchParams.get("playerUid") ?? "-1");
  const emptyGroupedSkills = {
    groups: [] as RecountGroup[],
    ungrouped: [] as SkillDisplayRow[],
  };

  let liveData = $derived(getLiveData());
  let tankedPlayers = $derived(
    liveData ? computePlayerRows(liveData, "tanked") : [],
  );
  let currentPlayer = $derived(
    tankedPlayers.find((player) => player.uid === playerUid) ?? null,
  );
  let currentEntity = $derived(
    liveData?.entities.find((entity) => entity.uid === playerUid) ?? null,
  );
  let elapsedSecs = $derived((liveData?.elapsedMs ?? 0) / 1000);

  let groupedSkills = $derived(
    currentEntity
      ? groupSkillsByRecount(
          currentEntity.takenSkills,
          elapsedSecs,
          currentEntity.taken.total,
        )
      : emptyGroupedSkills,
  );

  let SETTINGS_YOUR_NAME = $derived(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $derived(settings.state.live.general.showOthersName);
  let shortenTps = $derived(SETTINGS.live.general.state.shortenTps);

  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let abbreviationStyle = $derived(SETTINGS.live.general.state.abbreviationStyle);
  let customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );

  let sortKey = $derived(SETTINGS.live.sorting.tankedSkills.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.tankedSkills.state.sortDesc);
  let columnOrder = $derived(
    SETTINGS.live.columnOrder.tankedSkills.state.order,
  );

  function handleSort(key: string) {
    if (SETTINGS.live.sorting.tankedSkills.state.sortKey === key) {
      SETTINGS.live.sorting.tankedSkills.state.sortDesc =
        !SETTINGS.live.sorting.tankedSkills.state.sortDesc;
    } else {
      SETTINGS.live.sorting.tankedSkills.state.sortKey = key;
      SETTINGS.live.sorting.tankedSkills.state.sortDesc = true;
    }
  }

  let visibleSkillColumns = $derived.by(() => {
    const visible = liveTankedSkillColumns.filter(
      (col) => settings.state.live.tanked.skills[col.key],
    );
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });

  const glowClassName = $derived.by(() => {
    if (!currentPlayer) return "";
    const isLocalPlayer =
      liveData?.localPlayerUid != null &&
      currentPlayer.uid === liveData.localPlayerUid;
    return isLocalPlayer
      ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
        ? currentPlayer.className
        : ""
      : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !== "Hide Others' Name"
        ? currentPlayer.className
        : "";
  });

  function formatRateValue(value: number) {
    return value.toFixed(1);
  }
</script>

{#if currentPlayer}
  {@const isLocalPlayer = liveData?.localPlayerUid != null &&
    currentPlayer.uid === liveData.localPlayerUid}
  {@const nameSetting = normalizeNameDisplaySetting(
    isLocalPlayer ? SETTINGS_YOUR_NAME : SETTINGS_OTHERS_NAME,
  )}
  {@const displayName = getDisplayName({
    player: {
      uid: currentPlayer.uid,
      name: currentPlayer.name,
      className: currentPlayer.className,
      classSpecName: currentPlayer.classSpecName,
    },
    showYourNameSetting: SETTINGS_YOUR_NAME,
    showOthersNameSetting: SETTINGS_OTHERS_NAME,
    isLocalPlayer,
  })}
  <div
    class="sticky top-0 z-10 flex h-8 w-full items-center gap-2 bg-popover/60 px-2 text-xs"
    style="background-color: {`color-mix(in srgb, ${glowClassName ? `var(--class-color-${glowClassName.toLowerCase().replace(/\s+/g, '-')})` : '#6b7280'} 30%, transparent)`};"
  >
    <button class="underline" onclick={() => goto("/live/tanked")}>Back</button>
    <span class="font-bold">{displayName || `#${currentPlayer.uid}`}</span>
    {#if nameSetting !== "Show Your Name - Spec" &&
      nameSetting !== "Show Others' Name - Spec" &&
      currentPlayer.classSpecName}
      <span>{toSpecLabel(currentPlayer.classSpecName)}</span>
    {/if}
    <span class="ml-auto">
      <span class="text-xs">Total: </span>
      {#if shortenTps}
        <AbbreviatedNumber
          num={currentPlayer.totalDmg}
          decimalPlaces={abbreviatedDecimalPlaces}
          {abbreviationStyle}
          suffixFontSize={tableSettings.skillAbbreviatedFontSize}
          suffixColor={customThemeColors.tableAbbreviatedColor}
        />
      {:else}
        {currentPlayer.totalDmg.toLocaleString()}
      {/if}
    </span>
  </div>
{/if}

<LiveGroupedSkillTable
  {groupedSkills}
  visibleColumns={visibleSkillColumns}
  {sortKey}
  {sortDesc}
  onSort={handleSort}
  {tableSettings}
  {customThemeColors}
  {abbreviatedDecimalPlaces}
  {abbreviationStyle}
  glowClassName={glowClassName}
  classSpecName={currentPlayer?.classSpecName ?? ""}
  relativeToTop={SETTINGS.live.general.state.relativeToTopTankedSkill}
  shortenValues={shortenTps}
  {formatRateValue}
  compactMode={tableSettings.compactMode}
  compactPrimaryKey="totalDmg"
  compactSecondaryKey="dps"
/>
