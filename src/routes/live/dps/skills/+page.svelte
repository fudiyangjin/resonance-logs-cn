<script lang="ts">
  import { page } from "$app/state";
  import { settings, SETTINGS } from "$lib/settings-store";
  import { getLiveData } from "$lib/stores/live-meter-store.svelte";
  import { computePlayerRows } from "$lib/live-derived";
  import {
    buildRecountGroupHoverText,
    buildSkillBreakdownHoverText,
    buildSkillContributionNote,
    buildSkillSourceEvidenceNote,
    groupSkillsByRecount,
    lookupRecountGroupIconPath,
    lookupSkillBreakdownIconPath,
    resolveActiveEffectDetailName,
    resolveRecountGroupName,
    resolveSkillContributionLabel,
    resolveSkillBreakdownDetailName,
    resolveSkillBreakdownName,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { historyDpsSkillColumns } from "$lib/column-data";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import { normalizeNameDisplaySetting } from "$lib/name-display";
  import { resolveNavigationTranslation, resolveSkillNote, resolveSkillTranslation, type LocaleCode } from "$lib/i18n";

  type FlatSkillRow = SkillDisplayRow & {
    key: string;
    isGroup: boolean;
    depth: number;
    groupId?: number;
    expandable?: boolean;
    expanded?: boolean;
  };

  type TopLevelSkillItem =
    | { kind: "group"; row: RecountGroup }
    | { kind: "skill"; row: SkillDisplayRow };

  const playerUid = Number(page.url.searchParams.get("playerUid") ?? "-1");
  const expandedGroups = $state(new Set<number>());

  let liveData = $derived(getLiveData());
  let dpsPlayers = $derived(
    liveData ? computePlayerRows(liveData, "dps") : [],
  );
  let currPlayer = $derived(dpsPlayers.find((player) => player.uid === playerUid));
  let currEntity = $derived(
    liveData?.entities.find((entity) => entity.uid === playerUid) ?? null,
  );
  let elapsedSecs = $derived((liveData?.elapsedMs ?? 0) / 1000);

  let groupedSkills = $derived(
    currEntity
      ? groupSkillsByRecount(
          currEntity.dmgSkills,
          elapsedSecs,
          currEntity.damage.total,
          currEntity.activeFactorBuffs ?? [],
          currEntity.activeEffectBuffs ?? [],
          currEntity.activeEffectSources ?? [],
          currEntity.activeFactorItems ?? [],
        )
      : { groups: [] as RecountGroup[], ungrouped: [] as SkillDisplayRow[] },
  );

  let SETTINGS_YOUR_NAME = $derived(settings.state.live.general.showYourName);
  let SETTINGS_OTHERS_NAME = $derived(settings.state.live.general.showOthersName);

  let tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  let abbreviatedDecimalPlaces = $derived(
    SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  let customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );

  let sortKey = $derived(SETTINGS.live.sorting.dpsSkills.state.sortKey);
  let sortDesc = $derived(SETTINGS.live.sorting.dpsSkills.state.sortDesc);
  let columnOrder = $derived(SETTINGS.live.columnOrder.dpsSkills.state.order);

  function handleSort(key: string) {
    if (SETTINGS.live.sorting.dpsSkills.state.sortKey === key) {
      SETTINGS.live.sorting.dpsSkills.state.sortDesc =
        !SETTINGS.live.sorting.dpsSkills.state.sortDesc;
    } else {
      SETTINGS.live.sorting.dpsSkills.state.sortKey = key;
      SETTINGS.live.sorting.dpsSkills.state.sortDesc = true;
    }
  }

  function numericValue(value: unknown): number {
    return typeof value === "number" ? value : 0;
  }

  function sortRows<T extends Record<string, unknown>>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
      const aVal = numericValue(a[sortKey]);
      const bVal = numericValue(b[sortKey]);
      return sortDesc ? bVal - aVal : aVal - bVal;
    });
  }

  function toggleGroup(groupId: number) {
    if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
    else expandedGroups.add(groupId);
    expandedGroups;
  }

  function buildSkillHoverText(skill: FlatSkillRow, language: LocaleCode) {
    const mergedIds = !skill.isGroup && skill.mergedSkillIds && skill.mergedSkillIds.length > 1
      ? `Merged damage IDs: ${skill.mergedSkillIds.map((id) => `#${id}`).join(", ")}`
      : "";
    const effectNote = buildSkillSourceEvidenceNote(skill.activeEffects, skill.activeFactors, language);
    const contributionNote = skill.isGroup ? "" : buildSkillContributionNote(skill);
    const descriptionNote = hoverDescriptionsEnabled()
      ? resolveSkillNote(skill.skillId, language).trim()
      : "";
    const note = [contributionNote, mergedIds, effectNote, descriptionNote]
      .filter(Boolean)
      .join("\n");
    if (skill.sourceRowKind === "factor") {
      return [
        `Source row: ${displaySkillName(skill, language)} - ${displaySkillDetailName(skill, language)}`,
        note,
      ].filter(Boolean).join("\n");
    }
    if (skill.isGroup) {
      return buildRecountGroupHoverText(skill.skillId, language, note);
    }
    return buildSkillBreakdownHoverText(skill.skillId, language, note);
  }

  function hoverDescriptionsEnabled(): boolean {
    return SETTINGS.live.general.state.showHoverDescriptions !== false;
  }

  function shouldShowUidHover(): boolean {
    return SETTINGS.live.general.state.skillIdDisplayMode === 'hover' || hoverDescriptionsEnabled();
  }

  function skillIconPath(skill: FlatSkillRow): string | undefined {
    return skill.isGroup
      ? lookupRecountGroupIconPath(skill.skillId)
      : lookupSkillBreakdownIconPath(skill.skillId);
  }

  function displaySkillName(skill: FlatSkillRow, language: LocaleCode): string {
    if (skill.isGroup) {
      return resolveRecountGroupName(skill.skillId, language, skill.name);
    }
    if (skill.details) {
      return resolveSkillBreakdownName(skill, language);
    }
    return resolveSkillTranslation(skill.skillId, language, skill.name);
  }

  function displaySkillDetailName(skill: FlatSkillRow, language: LocaleCode): string {
    if (skill.isGroup) {
      return resolveActiveEffectDetailName(skill.activeEffects, skill.activeFactors, language);
    }
    return skill.details
      ? resolveSkillBreakdownDetailName(skill, language)
      : resolveActiveEffectDetailName(skill.activeEffects, skill.activeFactors, language);
  }

  function thLabel(
    col: { headerKey?: string; labelKey?: string; header: string; label?: string },
  ): string {
    const language = SETTINGS.live.general.state.language;

    if (col.headerKey) {
      const translatedHeader = resolveNavigationTranslation(col.headerKey, language, "");
      if (translatedHeader?.trim()) return translatedHeader;
    }

    if (col.labelKey) {
      const translatedLabel = resolveNavigationTranslation(
        col.labelKey,
        language,
        col.label ?? col.header,
      );
      if (translatedLabel?.trim()) return translatedLabel;
    }

    return col.header;
  }

  function isContributionCellUnknown(skill: FlatSkillRow): boolean {
    if (skill.isGroup) return false;
    return skill.attribution.kind === "source-only";
  }

  let flatRows = $derived.by(() => {
    const rows: FlatSkillRow[] = [];
    const topLevel = [
      ...groupedSkills.groups.map(
        (group): TopLevelSkillItem => ({ kind: "group", row: group }),
      ),
      ...groupedSkills.ungrouped.map(
        (skill): TopLevelSkillItem => ({ kind: "skill", row: skill }),
      ),
    ].sort((a, b) => {
      const key = sortKey as keyof SkillDisplayRow & keyof RecountGroup;
      const aVal = numericValue(a.row[key]);
      const bVal = numericValue(b.row[key]);
      return sortDesc ? bVal - aVal : aVal - bVal;
    });

    for (const item of topLevel) {
      if (item.kind === "skill") {
        rows.push({
          ...item.row,
          key: `ungrouped-${item.row.skillId}`,
          isGroup: false,
          depth: 0,
        });
        continue;
      }

      const group = item.row;
      rows.push({
        key: `group-${group.recountId}`,
        skillId: group.recountId,
        name: group.recountName,
        totalDmg: group.totalDmg,
        effectiveTotal: group.effectiveTotal,
        dps: group.dps,
        effectiveDps: group.effectiveDps,
        dmgPct: group.dmgPct,
        critRate: group.critRate,
        critDmgRate: group.critDmgRate,
        luckyRate: group.luckyRate,
        luckyDmgRate: group.luckyDmgRate,
        hits: group.hits,
        hitsPerMinute: group.hitsPerMinute,
        property: group.property,
        damageMode: group.damageMode,
        attribution: {
          kind: "exact",
          basis: "direct-damage-row",
          label: "Exact",
          detail: "Measured recount rollup total.",
        },
        ...(group.activeFactors?.length ? { activeFactors: group.activeFactors } : {}),
        ...(group.activeEffects?.length ? { activeEffects: group.activeEffects } : {}),
        raw: {
          totalValue: group.totalDmg,
          effectiveTotalValue: group.effectiveTotal,
          hits: group.hits,
          critHits: group.raw.critHits,
          critTotalValue: group.raw.critTotalValue,
          luckyHits: group.raw.luckyHits,
          luckyTotalValue: group.raw.luckyTotalValue,
          property: group.raw.property ?? null,
          damageMode: group.raw.damageMode ?? null,
        },
        isGroup: true,
        depth: 0,
        groupId: group.recountId,
        expandable: true,
        expanded: expandedGroups.has(group.recountId),
      });

      if (!expandedGroups.has(group.recountId)) continue;

      rows.push(
        ...sortRows(group.skills).map(
          (skill): FlatSkillRow => ({
            ...skill,
            key: `skill-${group.recountId}-${skill.skillId}`,
            isGroup: false,
            depth: 1,
            groupId: group.recountId,
          }),
        ),
      );
    }

    return rows;
  });

  const maxSkillValue = $derived(
    flatRows.reduce((max, row) => (row.totalDmg > max ? row.totalDmg : max), 0),
  );

  let visibleSkillColumns = $derived.by(() => {
    const visible = historyDpsSkillColumns.filter(
      (col) => col.key !== "effectiveTotal" && col.key !== "effectiveDps" && settings.state.live.dps.skillBreakdown[col.key],
    );
    return visible.sort((a, b) => {
      const aIdx = columnOrder.indexOf(a.key);
      const bIdx = columnOrder.indexOf(b.key);
      return aIdx - bIdx;
    });
  });
</script>

<svelte:window oncontextmenu={() => window.history.back()} />

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
      {#each flatRows as skill (skill.key)}
        {@const iconPath = skillIconPath(skill)}
        {#if currPlayer}
          {@const isLocalPlayer = liveData?.localPlayerUid != null &&
            currPlayer.uid === liveData.localPlayerUid}
          {@const className = isLocalPlayer
            ? normalizeNameDisplaySetting(SETTINGS_YOUR_NAME) !== "Hide Your Name"
              ? currPlayer.className
              : ""
            : normalizeNameDisplaySetting(SETTINGS_OTHERS_NAME) !==
                "Hide Others' Name"
              ? currPlayer.className
              : ""}
          <tr
            class="relative hover:bg-muted/60 transition-colors bg-background/40"
            style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
          >
            <td
              class="px-2 py-1 relative z-10"
              style="color: {customThemeColors.tableTextColor};"
            >
              <button
                class="flex items-center gap-1 h-full w-full text-left"
                onclick={() =>
                  skill.isGroup && skill.groupId !== undefined
                    ? toggleGroup(skill.groupId)
                    : undefined}
                disabled={!skill.isGroup}
              >
                <span style="padding-left: {skill.depth * 16}px;"></span>
                {#if skill.isGroup && skill.expandable}
                  <svg
                    class="size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 {skill.expanded
                      ? 'rotate-90'
                      : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                {:else if skill.depth > 0}
                  <span class="w-3 shrink-0 flex justify-center">
                    <span class="size-1 rounded-full bg-muted-foreground/35"></span>
                  </span>
                {:else}
                  <span class="w-3 shrink-0"></span>
                {/if}
                {#if iconPath}
                  <img
                    class="size-4 shrink-0 rounded-sm object-cover"
                    src={iconPath}
                    alt=""
                    loading="lazy"
                  />
                {/if}
                <span
                  class="truncate"
                  title={shouldShowUidHover()
                    ? buildSkillHoverText(skill, SETTINGS.live.general.state.language as LocaleCode)
                    : undefined}
                >
                  {displaySkillName(skill, SETTINGS.live.general.state.language as LocaleCode)}
                </span>
                {#if displaySkillDetailName(skill, SETTINGS.live.general.state.language as LocaleCode)}
                  <span class="shrink-0 text-xs opacity-70">
                    - {displaySkillDetailName(skill, SETTINGS.live.general.state.language as LocaleCode)}
                  </span>
                {/if}
                {#if !skill.isGroup && skill.details?.Badge && skill.details.Category !== "base-skill"}
                  <span
                    class="shrink-0 rounded border border-border/50 bg-muted/30 px-1 py-0.5 text-[9px] leading-none text-muted-foreground"
                    title={skill.details.CategoryLabel}
                  >
                    {skill.details.Badge}
                  </span>
                {/if}
                {#if !skill.isGroup && skill.depth > 0}
                  <span
                    class="shrink-0 rounded border border-border/50 bg-background/60 px-1 py-0.5 text-[9px] leading-none text-muted-foreground"
                    title={buildSkillContributionNote(skill)}
                  >
                    {resolveSkillContributionLabel(skill)}
                  </span>
                {/if}
                {#if SETTINGS.live.general.state.skillIdDisplayMode === 'column'}
                  <span class="text-[10px] text-muted-foreground/50 shrink-0">
                    #{skill.skillId}{!skill.isGroup && skill.mergedSkillIds && skill.mergedSkillIds.length > 1 ? ` +${skill.mergedSkillIds.length - 1}` : ""}
                  </span>
                {/if}
              </button>
            </td>
            {#each visibleSkillColumns as col (col.key)}
              <td
                class="px-2 py-1 text-right relative z-10"
                style="color: {customThemeColors.tableTextColor};"
              >
                {#if isContributionCellUnknown(skill)}
                  <span
                    class="text-muted-foreground/60"
                    title={buildSkillContributionNote(skill)}
                  >--</span>
                {:else if col.key === "totalDmg" || col.key === "effectiveTotal"}
                  {#if SETTINGS.live.general.state.shortenDps}
                    <AbbreviatedNumber
                      num={col.key === "totalDmg" ? skill.totalDmg : skill.effectiveTotal}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {(col.key === "totalDmg" ? skill.totalDmg : skill.effectiveTotal).toLocaleString()}
                  {/if}
                {:else if col.key === "dps" || col.key === "effectiveDps"}
                  {#if SETTINGS.live.general.state.shortenDps}
                    <AbbreviatedNumber
                      num={col.key === "dps" ? skill.dps : skill.effectiveDps}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {Math.round(col.key === "dps" ? skill.dps : skill.effectiveDps).toLocaleString()}
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
              classSpecName={currPlayer.classSpecName}
              percentage={SETTINGS.live.general.state.relativeToTopDPSSkill
                ? maxSkillValue > 0
                  ? (skill.totalDmg / maxSkillValue) * 100
                  : 0
                : skill.dmgPct}
            />
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>
