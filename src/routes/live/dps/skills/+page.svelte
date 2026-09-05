<script lang="ts">
  import { page } from "$app/state";
  import {
    settings,
    SETTINGS,
    normalizeDpsSkillColumnOrder,
  } from "$lib/settings-store";
  import { liveCombatStore } from "$lib/stores/live-topics.svelte";
  import { computePlayerRows } from "$lib/live-derived";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import LiveGroupedSkillTable from "$lib/components/live-grouped-skill-table.svelte";
  import { liveDpsSkillColumns } from "$lib/column-data";
  import { resolveColumnLabel } from "$lib/column-labels";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { formatNumber, t } from "$lib/i18n/index.svelte";
  import { ipcNumber } from "$lib/ipc-decimal";

  const entityUuid = page.url.searchParams.get("entityUuid") ?? "";
  const emptyGroupedSkills = {
    groups: [] as RecountGroup[],
    ungrouped: [] as SkillDisplayRow[],
  };

  let liveData = $derived(liveCombatStore.data?.combat ?? null);
  let dpsPlayers = $derived(liveData ? computePlayerRows(liveData, "dps") : []);
  let currPlayer = $derived(
    dpsPlayers.find((player) => player.entityUuid === entityUuid),
  );
  let currEntity = $derived(
    liveData?.entities.find((entity) => entity.entityUuid === entityUuid) ??
      null,
  );
  let elapsedSecs = $derived(ipcNumber(liveData?.damageElapsedMs) / 1000);

  let groupedSkills = $derived(
    currEntity
      ? groupSkillsByRecount(
          currEntity.dmgSkills,
          elapsedSecs,
          currEntity.damage.total,
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

  let sortKey = $derived(SETTINGS.live.sorting.dpsSkills.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.dpsSkills.state.sortDesc);
  let columnOrder = $derived(
    normalizeDpsSkillColumnOrder(
      SETTINGS.live.columnOrder.dpsSkills.state.order,
    ),
  );

  function handleSort(key: string) {
    if (SETTINGS.live.sorting.dpsSkills.state.sortKey === key) {
      SETTINGS.live.sorting.dpsSkills.state.sortDesc =
        !SETTINGS.live.sorting.dpsSkills.state.sortDesc;
    } else {
      SETTINGS.live.sorting.dpsSkills.state.sortKey = key;
      SETTINGS.live.sorting.dpsSkills.state.sortDesc = true;
    }
  }

  let visibleSkillColumns = $derived.by(() => {
    const labels = SETTINGS.live.columnLabels.state.live.skills.columns;
    const visible = liveDpsSkillColumns.filter(
      (col) => settings.state.live.dps.skillBreakdown[col.key],
    );
    return visible
      .sort((a, b) => {
        const aIdx = columnOrder.indexOf(a.key);
        const bIdx = columnOrder.indexOf(b.key);
        return aIdx - bIdx;
      })
      .map((col) => ({
        ...col,
        header: resolveColumnLabel(labels[col.key], col.header),
      }));
  });
  const skillColumnHeader = $derived(
    resolveColumnLabel(
      SETTINGS.live.columnLabels.state.live.skills.first,
      t("live.table.skill"),
    ),
  );

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
    return formatNumber(Math.round(value));
  }
</script>

<svelte:window oncontextmenu={() => window.history.back()} />

<LiveGroupedSkillTable
  {groupedSkills}
  visibleColumns={visibleSkillColumns}
  firstColumnHeader={skillColumnHeader}
  {sortKey}
  {sortDesc}
  onSort={handleSort}
  {tableSettings}
  {customThemeColors}
  {abbreviatedDecimalPlaces}
  {abbreviationStyle}
  {glowClassName}
  classSpecName={currPlayer?.classSpecName ?? ""}
  relativeToTop={SETTINGS.live.general.state.relativeToTopDPSSkill}
  shortenValues={SETTINGS.live.general.state.shortenDps}
  {formatRateValue}
  compactMode={tableSettings.compactMode}
  compactPrimaryKey="totalDmg"
  compactSecondaryKey="dps"
/>
