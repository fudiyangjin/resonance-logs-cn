<script lang="ts">
  import { page } from "$app/state";
  import {
    settings,
    SETTINGS,
    DEFAULT_LIVE_TANKED_SKILL_STATS,
    normalizeTankedSkillColumnOrder,
  } from "$lib/settings-store";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import { computePlayerRows } from "$lib/live-derived";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import LiveGroupedSkillTable from "$lib/components/live-grouped-skill-table.svelte";
  import { liveTankedSkillColumns } from "$lib/column-data";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatNumber } from "$lib/i18n/index.svelte";
  import { ipcNumber } from "$lib/ipc-decimal";
  import { findSourceByKey } from "$lib/tanked-source-derived";

  const entityUuid = page.url.searchParams.get("entityUuid") ?? "";
  // null or "total" => combined across all monsters; otherwise a specific source.
  const monsterId = page.url.searchParams.get("monsterId");
  const emptyGroupedSkills = {
    groups: [] as RecountGroup[],
    ungrouped: [] as SkillDisplayRow[],
  };

  let liveData = $derived(liveView.combat);
  let tankedPlayers = $derived(
    liveData ? computePlayerRows(liveData, "tanked") : [],
  );
  let currPlayer = $derived(
    tankedPlayers.find((player) => player.entityUuid === entityUuid),
  );
  let currEntity = $derived(
    liveData?.entities.find((entity) => entity.entityUuid === entityUuid) ??
      null,
  );
  let elapsedSecs = $derived(ipcNumber(liveData?.elapsedMs) / 1000);

  // When a specific monster is selected, drill into its per-source skills;
  // otherwise ("total" or absent) show the combined taken breakdown.
  let selectedSource = $derived(
    monsterId && monsterId !== "total"
      ? findSourceByKey(currEntity?.takenPerSource, monsterId)
      : null,
  );

  let groupedSkills = $derived(
    currEntity
      ? selectedSource
        ? groupSkillsByRecount(
            selectedSource.skills,
            elapsedSecs,
            selectedSource.taken.total,
          )
        : groupSkillsByRecount(
            currEntity.takenSkills,
            elapsedSecs,
            currEntity.taken.total,
          )
      : emptyGroupedSkills,
  );

  let SETTINGS_YOUR_NAME = $derived(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $derived(
    settings.state.live.general.showOthersName,
  );

  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let abbreviationStyle = $derived(
    SETTINGS.live.general.state.abbreviationStyle,
  );
  let customThemeColors = $derived(SETTINGS.live.appearance.state.themeColors);

  let sortKey = $derived(SETTINGS.live.sorting.tankedSkills.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.tankedSkills.state.sortDesc);
  let columnOrder = $derived(
    normalizeTankedSkillColumnOrder(
      SETTINGS.live.columnOrder.tankedSkills.state.order,
    ),
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
    const visible = liveTankedSkillColumns.filter((col) => {
      const defaultValue =
        DEFAULT_LIVE_TANKED_SKILL_STATS[
          col.key as keyof typeof DEFAULT_LIVE_TANKED_SKILL_STATS
        ] ?? false;
      return settings.state.live.tanked.skills[col.key] ?? defaultValue;
    });
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });

  const glowClassName = $derived.by(() => {
    if (!currPlayer) return "";
    const isLocalPlayer =
      liveData?.localPlayerUuid != null &&
      currPlayer.entityUuid === liveData.localPlayerUuid;
    return isLocalPlayer
      ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
        ? currPlayer.className
        : ""
      : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !==
          "Hide Others' Name"
        ? currPlayer.className
        : "";
  });

  function formatRateValue(value: number) {
    return formatNumber(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
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
  {glowClassName}
  classSpecName={currPlayer?.classSpecName ?? ""}
  relativeToTop={SETTINGS.live.general.state.relativeToTopTankedSkill}
  shortenValues={SETTINGS.live.general.state.shortenTps}
  {formatRateValue}
  compactMode={tableSettings.compactMode && tableSettings.compactIncludeDetails}
  compactPrimaryKey="totalDmg"
  compactSecondaryKey="dps"
/>
