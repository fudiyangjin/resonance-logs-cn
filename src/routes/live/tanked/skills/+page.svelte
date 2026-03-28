<script lang="ts">
  import { settings, SETTINGS } from "$lib/settings-store";
  import { computePlayerRows, computeSkillRows } from "$lib/live-derived";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import { getLiveData } from "$lib/stores/live-meter-store.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { liveTankedSkillColumns } from "$lib/column-data";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import getDisplayName from "$lib/name-display";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { toSpecLabel } from "$lib/class-labels";
  import { resolveSkillNote, resolveSkillTranslation, type LocaleCode } from "$lib/i18n";

  const playerUid = Number(page.url.searchParams.get("playerUid") ?? "-1");

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

  let skillRows = $derived(
    currentEntity && liveData
      ? computeSkillRows(
          currentEntity.takenSkills,
          liveData.elapsedMs,
          currentEntity.taken.total,
          lookupDamageIdName,
        )
      : [],
  );

  let maxTakenSkill = $state(0);
  let SETTINGS_YOUR_NAME = $state(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $state(settings.state.live.general.showOthersName);
  let SETTINGS_SHORTEN_TPS = $state(settings.state.live.general.shortenTps);
  let SETTINGS_RELATIVE_TO_TOP_TANKED_SKILL = $state(
    settings.state.live.general.relativeToTopTankedSkill,
  );

  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
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

  function buildSkillHoverText(skillId: string | number, language: LocaleCode) {
  const note = resolveSkillNote(skillId, language).trim();

  return `ID: #${skillId}\nSources:\n- RecountTable.json\n- DamageAttrIdName.json${note ? `\n\nNote:\n${note}` : ""}`;
  }

  let sortedSkillRows = $derived.by(() => {
    const data = [...skillRows];
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

  $effect(() => {
    maxTakenSkill = sortedSkillRows.reduce(
      (max, s) => (s.totalDmg > max ? s.totalDmg : max),
      0,
    );
  });

  $effect(() => {
    SETTINGS_YOUR_NAME = settings.state.live.general.showYourName;
    SETTINGS_OTHERS_NAME = settings.state.live.general.showOthersName;
    SETTINGS_SHORTEN_TPS = settings.state.live.general.shortenTps;
    SETTINGS_RELATIVE_TO_TOP_TANKED_SKILL =
      settings.state.live.general.relativeToTopTankedSkill;
  });

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
</script>

{#if currentPlayer}
  {@const isLocalPlayer = liveData?.localPlayerUid != null &&
    currentPlayer.uid === liveData.localPlayerUid}
  {@const className = isLocalPlayer
    ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
      ? currentPlayer.className
      : ""
    : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !== "Hide Others' Name"
      ? currentPlayer.className
      : ""}
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
    style="background-color: {`color-mix(in srgb, ${className ? `var(--class-color-${className.toLowerCase().replace(/\s+/g, '-')})` : '#6b7280'} 30%, transparent)`};"
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
      {#if SETTINGS_SHORTEN_TPS}
        <AbbreviatedNumber
          num={currentPlayer.totalDmg}
          decimalPlaces={abbreviatedDecimalPlaces}
          suffixFontSize={tableSettings.skillAbbreviatedFontSize}
          suffixColor={customThemeColors.tableAbbreviatedColor}
        />
      {:else}
        {currentPlayer.totalDmg.toLocaleString()}
      {/if}
    </span>
  </div>
{/if}

<div class="relative flex flex-col">
  <table class="w-full border-collapse">
    {#if tableSettings.skillShowHeader}
      <thead class="z-1 sticky top-0">
        <tr
          class="bg-popover/60"
          style="height: {tableSettings.skillHeaderHeight}px;"
        >
          <th
            class="px-2 py-1 text-left font-medium uppercase tracking-wider"
            style="font-size: {tableSettings.skillHeaderFontSize}px; color: {tableSettings.skillHeaderTextColor};"
            >Skill</th
          >
          {#each visibleSkillColumns as col (col.key)}
            <th
              class="px-2 py-1 text-right font-medium uppercase tracking-wider cursor-pointer select-none hover:bg-muted/40 transition-colors"
              style="font-size: {tableSettings.skillHeaderFontSize}px; color: {tableSettings.skillHeaderTextColor};"
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
      {#each sortedSkillRows as skill (skill.skillId)}
        {@const rowIsLocalPlayer = liveData?.localPlayerUid != null &&
          currentPlayer != null &&
          currentPlayer.uid === liveData.localPlayerUid}
        {@const className = rowIsLocalPlayer
          ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
            ? (currentPlayer?.className ?? "")
            : ""
          : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !==
                "Hide Others' Name" && currentPlayer
            ? (currentPlayer.className ?? "")
            : ""}
        <tr
          class="relative hover:bg-muted/60 transition-colors bg-background/40"
          style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
        >
          <td
            class="px-2 py-1 relative z-10"
            style="color: {customThemeColors.tableTextColor};"
          >
            <div class="flex items-center gap-1 h-full">
              <span
                class="truncate"
                title={SETTINGS.live.general.state.skillIdDisplayMode === 'hover'
                  ? buildSkillHoverText(skill.skillId, SETTINGS.live.general.state.language as LocaleCode)
                  : undefined}
              >
                {resolveSkillTranslation(skill.skillId, SETTINGS.live.general.state.language, skill.name)}
              </span>
              {#if SETTINGS.live.general.state.skillIdDisplayMode === 'column'}
                <span class="text-[10px] text-muted-foreground/50 shrink-0">
                  #{skill.skillId}
                </span>
              {/if}
            </div>
          </td>
          {#each visibleSkillColumns as col (col.key)}
            <td
              class="px-2 py-1 text-right relative z-10"
              style="color: {customThemeColors.tableTextColor};"
            >
              {#if col.key === "totalDmg"}
                {#if SETTINGS_SHORTEN_TPS}
                  <AbbreviatedNumber
                    num={skill.totalDmg}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {skill.totalDmg.toLocaleString()}
                {/if}
              {:else if col.key === "dps"}
                {#if SETTINGS_SHORTEN_TPS}
                  <AbbreviatedNumber
                    num={skill.dps}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else}
                  {skill.dps.toFixed(1)}
                {/if}
              {:else if col.key === "dmgPct"}
                <PercentFormat
                  val={skill.dmgPct}
                  fractionDigits={0}
                  suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                  suffixColor={customThemeColors.tableAbbreviatedColor}
                />
              {:else if col.key === "critRate" || col.key === "critDmgRate" || col.key === "luckyRate" || col.key === "luckyDmgRate"}
                <PercentFormat
                  val={skill[col.key]}
                  suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                  suffixColor={customThemeColors.tableAbbreviatedColor}
                />
              {:else}
                {col.format(skill[col.key] ?? 0)}
              {/if}
            </td>
          {/each}
          <TableRowGlow
            isSkill={true}
            {className}
            classSpecName={currentPlayer?.classSpecName ?? ""}
            percentage={SETTINGS_RELATIVE_TO_TOP_TANKED_SKILL
              ? maxTakenSkill > 0
                ? (skill.totalDmg / maxTakenSkill) * 100
                : 0
              : skill.dmgPct}
          />
        </tr>
      {/each}
    </tbody>
  </table>
</div>
