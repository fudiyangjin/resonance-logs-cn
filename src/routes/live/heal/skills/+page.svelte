<script lang="ts">
  import { page } from "$app/state";
  import { settings, SETTINGS } from "$lib/settings-store";
  import { getLiveData } from "$lib/stores/live-meter-store.svelte";
  import { computePlayerRows } from "$lib/live-derived";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import LiveGroupedSkillTable from "$lib/components/live-grouped-skill-table.svelte";
  import { liveHealSkillColumns } from "$lib/column-data";
  import { normalizeNameDisplaySetting } from "$lib/name-display";

  const playerUid = Number(page.url.searchParams.get("playerUid") ?? "-1");
  const emptyGroupedSkills = {
    groups: [] as RecountGroup[],
    ungrouped: [] as SkillDisplayRow[],
  };

  let liveData = $derived(getLiveData());
  let healPlayers = $derived(
    liveData ? computePlayerRows(liveData, "heal") : [],
  );
  let currPlayer = $derived(healPlayers.find((player) => player.uid === playerUid));
  let currEntity = $derived(
    liveData?.entities.find((entity) => entity.uid === playerUid) ?? null,
  );
  let elapsedSecs = $derived((liveData?.elapsedMs ?? 0) / 1000);

  let groupedSkills = $derived(
    currEntity
      ? groupSkillsByRecount(
          currEntity.healSkills,
          elapsedSecs,
          currEntity.healing.total,
        )
      : emptyGroupedSkills,
  );

  let SETTINGS_YOUR_NAME = $derived(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $derived(settings.state.live.general.showOthersName);

  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let abbreviationStyle = $derived(SETTINGS.live.general.state.abbreviationStyle);
  let customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );

  let sortKey = $derived(SETTINGS.live.sorting.healSkills.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.healSkills.state.sortDesc);
  let columnOrder = $derived(SETTINGS.live.columnOrder.healSkills.state.order);

  function handleSort(key: string) {
    if (SETTINGS.live.sorting.healSkills.state.sortKey === key) {
      SETTINGS.live.sorting.healSkills.state.sortDesc =
        !SETTINGS.live.sorting.healSkills.state.sortDesc;
    } else {
      SETTINGS.live.sorting.healSkills.state.sortKey = key;
      SETTINGS.live.sorting.healSkills.state.sortDesc = true;
    }
  }

  let visibleSkillColumns = $derived.by(() => {
    const visible = liveHealSkillColumns.filter(
      (col) => settings.state.live.heal.skillBreakdown[col.key],
    );
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });

  const glowClassName = $derived.by(() => {
    if (!currPlayer) return "";
    const isLocalPlayer =
      liveData?.localPlayerUid != null && currPlayer.uid === liveData.localPlayerUid;
    return isLocalPlayer
      ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
        ? currPlayer.className
        : ""
      : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !== "Hide Others' Name"
        ? currPlayer.className
        : "";
  });

  function formatRateValue(value: number) {
    return value.toFixed(1);
  }
</script>

<svelte:window oncontextmenu={() => window.history.back()} />

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
  classSpecName={currPlayer?.classSpecName ?? ""}
  relativeToTop={SETTINGS.live.general.state.relativeToTopHealSkill}
  shortenValues={SETTINGS.live.general.state.shortenDps}
  {formatRateValue}
  compactMode={tableSettings.compactMode}
  compactPrimaryKey="totalDmg"
  compactSecondaryKey="dps"
/>
