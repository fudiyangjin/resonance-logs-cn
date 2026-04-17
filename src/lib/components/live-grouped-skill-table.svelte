<script lang="ts">
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import PercentFormat from "$lib/components/percent-format.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type {
    RawSkillStatsLike,
    RecountGroup,
    SkillDisplayRow,
  } from "$lib/config/recount-table";

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

  function buildGroupRaw(group: RecountGroup): RawSkillStatsLike {
    return {
      totalValue: group.totalDmg,
      effectiveTotalValue: group.effectiveTotal,
      hits: group.hits,
      critHits: group.skills.reduce(
        (sum, skill) => sum + Number(skill.raw.critHits || 0),
        0,
      ),
      critTotalValue: group.skills.reduce(
        (sum, skill) => sum + Number(skill.raw.critTotalValue || 0),
        0,
      ),
      luckyHits: group.skills.reduce(
        (sum, skill) => sum + Number(skill.raw.luckyHits || 0),
        0,
      ),
      luckyTotalValue: group.skills.reduce(
        (sum, skill) => sum + Number(skill.raw.luckyTotalValue || 0),
        0,
      ),
    };
  }

  function sortRows<T extends Record<string, unknown>>(rows: readonly T[]): T[] {
    return [...rows].sort((a, b) => {
      const aVal = numericValue(a[sortKey]);
      const bVal = numericValue(b[sortKey]);
      return sortDesc ? bVal - aVal : aVal - bVal;
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
      const key = effectiveSortKey as keyof SkillDisplayRow & keyof RecountGroup;
      const aVal = numericValue(a.row[key]);
      const bVal = numericValue(b.row[key]);
      return effectiveSortDesc ? bVal - aVal : aVal - bVal;
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
        raw: buildGroupRaw(group),
        isGroup: true,
        depth: 0,
        groupId: group.recountId,
        expandable: true,
        expanded: expandedGroups.has(group.recountId),
      });

      if (!expandedGroups.has(group.recountId)) continue;

      const sortedChildren = compactMode
        ? [...group.skills].sort((a, b) => {
            const aVal = numericValue(
              (a as Record<string, unknown>)[effectiveSortKey],
            );
            const bVal = numericValue(
              (b as Record<string, unknown>)[effectiveSortKey],
            );
            return bVal - aVal;
          })
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
      const v = numericValue((row as Record<string, unknown>)[compactPrimaryKey]);
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
          {#each visibleColumns as col (col.key)}
            <th
              class="px-2 py-1 text-right font-medium uppercase tracking-wider cursor-pointer select-none hover:bg-muted/40 transition-colors"
              style="font-size: {tableSettings.skillHeaderFontSize}px; color: {tableSettings.skillHeaderTextColor};"
              onclick={() => onSort(col.key)}
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
            class="relative hover:bg-muted/60 transition-colors bg-background/40"
            style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
          >
            <td
              class="px-2 py-1 relative z-10"
              style="color: {customThemeColors.tableTextColor};"
            >
              <div class="flex items-center h-full gap-2">
                <button
                  class="flex items-center gap-1 h-full text-left min-w-0 flex-1"
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
                      <span
                        class="size-1 rounded-full bg-muted-foreground/35"
                      ></span>
                    </span>
                  {:else}
                    <span class="w-3 shrink-0"></span>
                  {/if}
                  <span class="truncate">{skill.name}</span>
                </button>
                <span
                  class="inline-flex items-center gap-1 tabular-nums shrink-0"
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
                      {primaryVal.toLocaleString()}<span class="opacity-70"
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
              <span class="truncate">{skill.name}</span>
              {#if skill.showSkillId}
                <span class="text-[10px] text-muted-foreground/50 shrink-0">
                  #{skill.skillId}
                </span>
              {/if}
            </button>
          </td>
          {#each visibleColumns as col (col.key)}
            <td
              class="px-2 py-1 text-right relative z-10"
              style="color: {customThemeColors.tableTextColor};"
            >
              {#if col.key === "totalDmg" || col.key === "effectiveTotal"}
                {#if shortenValues}
                  <AbbreviatedNumber
                    num={col.key === "totalDmg" ? skill.totalDmg : skill.effectiveTotal}
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
              {:else if col.key === "critRate" || col.key === "critDmgRate" || col.key === "luckyRate" || col.key === "luckyDmgRate"}
                <PercentFormat
                  val={skill[col.key]}
                  suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                  suffixColor={customThemeColors.tableAbbreviatedColor}
                />
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
