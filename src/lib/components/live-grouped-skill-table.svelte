<script lang="ts">
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type {
    RecountGroup,
    SkillDisplayRow,
  } from "$lib/config/recount-table";
  import { formatNumber, t } from "$lib/i18n/index.svelte";
  import { ipcCompare, type IpcDecimal } from "$lib/ipc-decimal";

  type SkillColumn = {
    key: string;
    header: string;
    label: string;
    description: string;
    format: (value: number) => string;
  };

  type GroupedSkills = {
    groups: RecountGroup[];
    ungrouped: SkillDisplayRow[];
  };

  type TableSettings = {
    skillShowHeader: boolean;
    skillHeaderHeight: number;
    skillHeaderFontSize: number;
    skillHeaderTextColor: string;
    skillRowHeight: number;
    skillFontSize: number;
    skillAbbreviatedFontSize: number;
  };

  type CustomThemeColors = {
    tableTextColor: string;
    tableAbbreviatedColor: string;
  };

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

  type Props = {
    groupedSkills: GroupedSkills;
    visibleColumns: readonly SkillColumn[];
    firstColumnHeader?: string;
    sortKey: string;
    sortDesc: boolean;
    onSort: (key: string) => void;
    glowClassName: string;
    classSpecName: string;
    relativeToTop: boolean;
    shortenValues: boolean;
    tableSettings: TableSettings;
    customThemeColors: CustomThemeColors;
    abbreviatedDecimalPlaces: number;
    abbreviationStyle: "western" | "cn";
    formatRateValue: (value: number) => string;
    compactMode?: boolean;
    compactPrimaryKey?: "totalDmg" | "effectiveTotal";
    compactSecondaryKey?: "dps" | "effectiveDps";
  };

  let {
    groupedSkills,
    visibleColumns,
    firstColumnHeader,
    sortKey,
    sortDesc,
    onSort,
    glowClassName,
    classSpecName,
    relativeToTop,
    shortenValues,
    tableSettings,
    customThemeColors,
    abbreviatedDecimalPlaces,
    abbreviationStyle,
    formatRateValue,
    compactMode = false,
    compactPrimaryKey = "totalDmg",
    compactSecondaryKey = "dps",
  }: Props = $props();

  const expandedGroups = new SvelteSet<number>();

  function numericValue(value: unknown): number {
    return typeof value === "number" ? value : 0;
  }

  function columnValue(row: FlatSkillRow, key: string): number {
    return numericValue((row as Record<string, unknown>)[key]);
  }

  function rawSortValue(
    row: SkillDisplayRow | RecountGroup,
    key: string,
  ): IpcDecimal | null {
    if (key === "totalDmg" || key === "dps" || key === "dmgPct") {
      return row.raw.totalValue;
    }
    if (key === "effectiveTotal" || key === "effectiveDps") {
      return row.raw.effectiveTotalValue;
    }
    if (key === "hits" || key === "hitsPerMinute") return row.raw.hits;
    if (key === "maxDmg") return row.raw.extrema?.max ?? "0";
    if (key === "minDmg") return row.raw.extrema?.min ?? "0";
    return null;
  }

  function compareRows(
    a: SkillDisplayRow | RecountGroup,
    b: SkillDisplayRow | RecountGroup,
    key: string,
    descending: boolean,
  ): number {
    const aRaw = rawSortValue(a, key);
    const bRaw = rawSortValue(b, key);
    const comparison =
      aRaw !== null && bRaw !== null
        ? ipcCompare(aRaw, bRaw)
        : numericValue((a as unknown as Record<string, unknown>)[key]) <
            numericValue((b as unknown as Record<string, unknown>)[key])
          ? -1
          : numericValue((a as unknown as Record<string, unknown>)[key]) >
              numericValue((b as unknown as Record<string, unknown>)[key])
            ? 1
            : 0;
    return descending ? -comparison : comparison;
  }

  function sortRows(rows: readonly SkillDisplayRow[]): SkillDisplayRow[] {
    return [...rows].sort((a, b) => {
      return compareRows(a, b, sortKey, sortDesc);
    });
  }

  function toggleGroup(groupId: number) {
    if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
    else expandedGroups.add(groupId);
  }

  const effectiveSortKey = $derived(compactMode ? compactPrimaryKey : sortKey);
  const effectiveSortDesc = $derived(compactMode ? true : sortDesc);

  const flatRows = $derived.by(() => {
    const rows: FlatSkillRow[] = [];
    const topLevel: TopLevelSkillItem[] = [
      ...groupedSkills.groups.map(
        (group): TopLevelSkillItem => ({ kind: "group", row: group }),
      ),
      ...groupedSkills.ungrouped.map(
        (skill): TopLevelSkillItem => ({ kind: "skill", row: skill }),
      ),
    ].sort((a, b) => {
      return compareRows(a.row, b.row, effectiveSortKey, effectiveSortDesc);
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
        blockRate: group.blockRate,
        luckyBlockRate: group.luckyBlockRate,
        hits: group.hits,
        hitsPerMinute: group.hitsPerMinute,
        avgDmg: group.avgDmg,
        maxDmg: group.maxDmg,
        minDmg: group.minDmg,
        property: null,
        damageMode: null,
        raw: group.raw,
        isGroup: true,
        depth: 0,
        groupId: group.recountId,
        expandable: true,
        expanded: expandedGroups.has(group.recountId),
      });

      if (!expandedGroups.has(group.recountId)) continue;

      const sortedChildren = compactMode
        ? [...group.skills].sort((a, b) =>
            compareRows(a, b, effectiveSortKey, true),
          )
        : sortRows(group.skills);

      rows.push(
        ...sortedChildren.map((skill) => ({
          ...skill,
          key: `skill-${group.recountId}-${skill.skillId}`,
          isGroup: false,
          depth: 1,
          groupId: group.recountId,
        })),
      );
    }

    return rows;
  });

  const compactPrimaryMax = $derived(
    flatRows.reduce((max, row) => {
      const v = numericValue(
        (row as Record<string, unknown>)[compactPrimaryKey],
      );
      return v > max ? v : max;
    }, 0),
  );
  const maxSkillValue = $derived(
    compactMode
      ? compactPrimaryMax
      : flatRows.reduce(
          (max, row) => (row.totalDmg > max ? row.totalDmg : max),
          0,
        ),
  );
</script>

<div class="relative flex flex-col">
  <table class="w-full border-collapse">
    {#if tableSettings.skillShowHeader && !compactMode}
      <thead class="sticky top-0 z-1">
        <tr
          class="bg-popover/60"
          style="height: {tableSettings.skillHeaderHeight}px;"
        >
          <th
            class="px-2 py-1 text-left font-medium tracking-wider uppercase"
            style="font-size: {tableSettings.skillHeaderFontSize}px; color: {tableSettings.skillHeaderTextColor};"
            title={firstColumnHeader ?? t("live.table.skill")}
            ><span class="block max-w-40 truncate"
              >{firstColumnHeader ?? t("live.table.skill")}</span
            ></th
          >
          {#each visibleColumns as col (col.key)}
            <th
              class="hover:bg-muted/40 cursor-pointer px-2 py-1 text-right font-medium tracking-wider uppercase transition-colors select-none"
              style="font-size: {tableSettings.skillHeaderFontSize}px; color: {tableSettings.skillHeaderTextColor};"
              onclick={() => onSort(col.key)}
            >
              <span
                class="inline-flex max-w-40 items-center justify-end gap-1"
                title={col.header}
              >
                <span class="truncate">{col.header}</span>
                {#if sortKey === col.key}
                  <span class="text-primary">{sortDesc ? "▼" : "▲"}</span>
                {/if}
              </span>
            </th>
          {/each}
        </tr>
      </thead>
    {/if}
    {#if compactMode}
      <tbody>
        {#each flatRows as skill (skill.key)}
          {@const primaryVal = numericValue(
            (skill as Record<string, unknown>)[compactPrimaryKey],
          )}
          {@const secondaryVal = numericValue(
            (skill as Record<string, unknown>)[compactSecondaryKey],
          )}
          <tr
            class="hover:bg-muted/60 bg-background/40 relative transition-colors"
            style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
          >
            <td
              class="relative z-10 px-2 py-1"
              style="color: {customThemeColors.tableTextColor};"
            >
              <div class="flex h-full items-center gap-2">
                <button
                  class="flex h-full min-w-0 flex-1 items-center gap-1 text-left"
                  onclick={() =>
                    skill.isGroup && skill.groupId !== undefined
                      ? toggleGroup(skill.groupId)
                      : undefined}
                  disabled={!skill.isGroup}
                >
                  <span style="padding-left: {skill.depth * 16}px;"></span>
                  {#if skill.isGroup && skill.expandable}
                    <svg
                      class="text-muted-foreground/70 size-3 shrink-0 transition-transform duration-150 {skill.expanded
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
                    <span class="flex w-3 shrink-0 justify-center">
                      <span class="bg-muted-foreground/35 size-1 rounded-full"
                      ></span>
                    </span>
                  {:else}
                    <span class="w-3 shrink-0"></span>
                  {/if}
                  <span class="truncate">{skill.name}</span>
                </button>
                <span
                  class="inline-flex shrink-0 items-center gap-1 tabular-nums"
                >
                  <span class="inline-flex items-baseline">
                    {#if shortenValues}
                      <AbbreviatedNumber
                        num={primaryVal}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                      <span class="opacity-70">(</span>
                      <AbbreviatedNumber
                        num={secondaryVal}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                      <span class="opacity-70">)</span>
                    {:else}
                      {formatNumber(primaryVal)}<span class="opacity-70"
                        >({formatRateValue(secondaryVal)})</span
                      >
                    {/if}
                  </span>
                  <span class="w-12 text-right">
                    <PercentFormat
                      val={skill.dmgPct}
                      fractionDigits={0}
                      suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  </span>
                </span>
              </div>
            </td>
            <TableRowGlow
              isSkill={true}
              className={glowClassName}
              {classSpecName}
              percentage={relativeToTop
                ? maxSkillValue > 0
                  ? (primaryVal / maxSkillValue) * 100
                  : 0
                : skill.dmgPct}
            />
          </tr>
        {/each}
      </tbody>
    {:else}
      <tbody>
        {#each flatRows as skill (skill.key)}
          <tr
            class="hover:bg-muted/60 bg-background/40 relative transition-colors"
            style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
          >
            <td
              class="relative z-10 px-2 py-1"
              style="color: {customThemeColors.tableTextColor};"
            >
              <button
                class="flex h-full w-full items-center gap-1 text-left"
                onclick={() =>
                  skill.isGroup && skill.groupId !== undefined
                    ? toggleGroup(skill.groupId)
                    : undefined}
                disabled={!skill.isGroup}
              >
                <span style="padding-left: {skill.depth * 16}px;"></span>
                {#if skill.isGroup && skill.expandable}
                  <svg
                    class="text-muted-foreground/70 size-3 shrink-0 transition-transform duration-150 {skill.expanded
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
                  <span class="flex w-3 shrink-0 justify-center">
                    <span class="bg-muted-foreground/35 size-1 rounded-full"
                    ></span>
                  </span>
                {:else}
                  <span class="w-3 shrink-0"></span>
                {/if}
                <span class="truncate">{skill.name}</span>
                {#if skill.showSkillId}
                  <span class="text-muted-foreground/50 shrink-0 text-[10px]">
                    #{skill.skillId}
                  </span>
                {/if}
              </button>
            </td>
            {#each visibleColumns as col (col.key)}
              <td
                class="relative z-10 px-2 py-1 text-right"
                style="color: {customThemeColors.tableTextColor};"
              >
                {#if col.key === "totalDmg" || col.key === "effectiveTotal" || col.key === "avgDmg" || col.key === "maxDmg" || col.key === "minDmg"}
                  {#if (col.key === "maxDmg" && skill.maxDmg === null) || (col.key === "minDmg" && skill.minDmg === null)}
                    <span class="text-muted-foreground/50">-</span>
                  {:else if shortenValues}
                    <AbbreviatedNumber
                      num={columnValue(skill, col.key)}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {col.format(columnValue(skill, col.key))}
                  {/if}
                {:else if col.key === "dps" || col.key === "effectiveDps"}
                  {#if shortenValues}
                    <AbbreviatedNumber
                      num={columnValue(skill, col.key)}
                      decimalPlaces={abbreviatedDecimalPlaces}
                      {abbreviationStyle}
                      suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                      suffixColor={customThemeColors.tableAbbreviatedColor}
                    />
                  {:else}
                    {formatRateValue(columnValue(skill, col.key))}
                  {/if}
                {:else if col.key === "dmgPct"}
                  <PercentFormat
                    val={skill.dmgPct}
                    fractionDigits={0}
                    suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else if col.key === "critRate" || col.key === "critDmgRate" || col.key === "luckyRate" || col.key === "luckyDmgRate" || col.key === "blockRate" || col.key === "luckyBlockRate"}
                  <PercentFormat
                    val={skill[col.key]}
                    suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                    suffixColor={customThemeColors.tableAbbreviatedColor}
                  />
                {:else if col.key === "property" || col.key === "damageMode"}
                  {#if skill.isGroup}
                    <span class="text-muted-foreground/50">-</span>
                  {:else}
                    {col.format(skill[col.key] as number)}
                  {/if}
                {:else}
                  {col.format(columnValue(skill, col.key))}
                {/if}
              </td>
            {/each}
            <TableRowGlow
              isSkill={true}
              className={glowClassName}
              {classSpecName}
              percentage={relativeToTop
                ? maxSkillValue > 0
                  ? (skill.totalDmg / maxSkillValue) * 100
                  : 0
                : skill.dmgPct}
            />
          </tr>
        {/each}
      </tbody>
    {/if}
  </table>
</div>
