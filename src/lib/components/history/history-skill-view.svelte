<script lang="ts">
  /**
   * History player drill-down: recount-grouped skill table with the column
   * settings from the pre-upgrade page, plus the heal-target distribution
   * card. Covers damage (optionally filtered to one target), healing, and
   * damage-taken (optionally filtered to one monster source).
   */
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import {
    historyDpsSkillColumns,
    historyHealSkillColumns,
    historyTankedSkillColumns,
  } from "$lib/column-data";
  import { resolveColumnLabel } from "$lib/column-labels";
  import {
    groupSkillsByRecount,
    type RecountGroup,
    type SkillDisplayRow,
  } from "$lib/config/recount-table";
  import { resolveMonsterName } from "$lib/config/game-names";
  import type {
    HistoryEntity,
    HistoryPerTargetStats,
  } from "$lib/history-derived";
  import { formatNumber, t } from "$lib/i18n/index.svelte";
  import {
    ipcBigInt,
    ipcCompare,
    ipcIsZero,
    ipcNumber,
  } from "$lib/ipc-decimal";
  import {
    DEFAULT_HISTORY_TANKED_SKILL_STATS,
    SETTINGS,
    settings,
  } from "$lib/settings-store";
  import { findSourceByKey } from "$lib/tanked-source-derived";

  type SkillType = "dps" | "heal" | "tanked";

  type FlatSkillRow =
    | { kind: "group"; key: string; depth: 0; row: RecountGroup }
    | { kind: "skill"; key: string; depth: 0 | 1; row: SkillDisplayRow };

  let {
    entity,
    playerName,
    skillType,
    elapsedSecs,
    targetEntityUuid = null,
    takenMonsterKey = null,
    entityNames,
    playerUuids,
    onBack,
  }: {
    entity: HistoryEntity;
    /** Display name, already privacy-filtered by the parent. */
    playerName: string;
    skillType: SkillType;
    elapsedSecs: number;
    /** Damage drill-down: show only skills hitting this target. */
    targetEntityUuid?: string | null;
    /** Tanked drill-down: monster source key, or "total" / null for all. */
    takenMonsterKey?: string | null;
    /** Sibling entity names used to resolve heal-target labels. */
    entityNames: Map<string, string>;
    /** Uuids of real players (kept for numeric-name heal targets). */
    playerUuids: Set<string>;
    onBack: () => void;
  } = $props();

  let expandedGroups = $state<Set<number>>(new Set<number>());

  // Collapse recount groups whenever the viewed entity or metric changes.
  $effect(() => {
    entity.entityUuid;
    skillType;
    expandedGroups = new Set<number>();
  });

  function isNumericLikeName(name: string): boolean {
    return /^#?\d+$/.test(name.trim());
  }

  function resolveTargetDisplayName(target: HistoryPerTargetStats): string {
    const entityName = entityNames.get(target.targetEntityUuid);
    if (entityName) return entityName;
    const recorded = target.targetName?.trim();
    if (recorded) return recorded;
    if (target.targetMonsterId !== null) {
      return resolveMonsterName(target.targetMonsterId);
    }
    return `#${target.targetDisplayUid}`;
  }

  const skillGrouping = $derived.by(() => {
    const durationSecs = Math.max(1, elapsedSecs);
    if (skillType === "dps" && targetEntityUuid !== null) {
      const target = entity.dmgPerTarget.find(
        (value) => value.targetEntityUuid === targetEntityUuid,
      );
      if (!target) return { groups: [], ungrouped: [] };
      return groupSkillsByRecount(
        target.skills,
        durationSecs,
        target.totalValue,
      );
    }
    if (
      skillType === "tanked" &&
      takenMonsterKey !== null &&
      takenMonsterKey !== "total"
    ) {
      const source = findSourceByKey(entity.takenPerSource, takenMonsterKey);
      if (source) {
        return groupSkillsByRecount(
          source.skills,
          durationSecs,
          source.taken.total,
        );
      }
    }
    const skills =
      skillType === "heal"
        ? entity.healSkills
        : skillType === "tanked"
          ? entity.takenSkills
          : entity.dmgSkills;
    const parentTotal =
      skillType === "heal"
        ? entity.healing.total
        : skillType === "tanked"
          ? entity.taken.total
          : entity.damage.total;
    return groupSkillsByRecount(skills, durationSecs, parentTotal);
  });

  const flatSkillRows = $derived.by(() => {
    const rows: FlatSkillRow[] = [];
    const topLevel = [
      ...skillGrouping.groups.map(
        (group): { kind: "group"; row: RecountGroup } => ({
          kind: "group",
          row: group,
        }),
      ),
      ...skillGrouping.ungrouped.map(
        (skill): { kind: "skill"; row: SkillDisplayRow } => ({
          kind: "skill",
          row: skill,
        }),
      ),
    ].sort((a, b) => b.row.totalDmg - a.row.totalDmg);

    for (const item of topLevel) {
      if (item.kind === "skill") {
        rows.push({
          kind: "skill",
          key: `u-${item.row.skillId}`,
          depth: 0,
          row: item.row,
        });
        continue;
      }

      const group = item.row;
      rows.push({
        kind: "group",
        key: `g-${group.recountId}`,
        depth: 0,
        row: group,
      });
      if (!expandedGroups.has(group.recountId)) continue;
      for (const skill of group.skills) {
        rows.push({
          kind: "skill",
          key: `gs-${group.recountId}-${skill.skillId}`,
          depth: 1,
          row: skill,
        });
      }
    }
    return rows;
  });

  const healTargetSummary = $derived.by(() => {
    if (skillType !== "heal")
      return [] as (HistoryPerTargetStats & { resolvedName: string })[];
    return entity.healPerTarget
      .map((target) => ({
        ...target,
        resolvedName: resolveTargetDisplayName(target),
      }))
      .filter(
        (target) =>
          !ipcIsZero(target.totalValue) &&
          (!isNumericLikeName(target.resolvedName) ||
            playerUuids.has(target.targetEntityUuid)),
      )
      .toSorted((a, b) => ipcCompare(b.totalValue, a.totalValue));
  });

  const healTargetTotal = $derived(
    healTargetSummary
      .reduce((sum, target) => sum + ipcBigInt(target.totalValue), 0n)
      .toString(),
  );

  function healTargetPct(totalValue: string): number {
    const denominator = ipcBigInt(healTargetTotal);
    if (denominator === 0n) return 0;
    return Number((ipcBigInt(totalValue) * 10_000n) / denominator) / 100;
  }

  const visibleSkillColumns = $derived.by(() => {
    if (skillType === "heal") {
      return historyHealSkillColumns.filter(
        (col) => settings.state.history.heal.skillBreakdown[col.key],
      );
    }
    if (skillType === "tanked") {
      return historyTankedSkillColumns.filter((col) => {
        const defaultValue =
          DEFAULT_HISTORY_TANKED_SKILL_STATS[
            col.key as keyof typeof DEFAULT_HISTORY_TANKED_SKILL_STATS
          ] ?? false;
        return (
          settings.state.history.tanked.skillBreakdown[col.key] ?? defaultValue
        );
      });
    }
    const labels = SETTINGS.live.columnLabels.state.history.skills.columns;
    return historyDpsSkillColumns
      .filter((col) => settings.state.history.dps.skillBreakdown[col.key])
      .map((col) => ({
        ...col,
        header: resolveColumnLabel(labels[col.key], col.header),
      }));
  });
  const skillColumnHeader = $derived(
    skillType === "dps"
      ? resolveColumnLabel(
          SETTINGS.live.columnLabels.state.history.skills.first,
          t("history.detail.table.skill"),
        )
      : t("history.detail.table.skill"),
  );

  const maxSkillTotal = $derived(
    flatSkillRows.reduce((max, row) => Math.max(max, row.row.totalDmg ?? 0), 0),
  );

  const abbreviatedDecimalPlaces = $derived(
    SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  const abbreviationStyle = $derived(
    SETTINGS.history.general.state.abbreviationStyle,
  );

  function skillCellValue(row: FlatSkillRow, key: string): number {
    const value = (row.row as Record<string, unknown>)[key];
    return typeof value === "number" ? value : 0;
  }

  function rowDmgPct(row: FlatSkillRow): number {
    return row.row.dmgPct ?? 0;
  }

  function skillGlowPercentage(row: FlatSkillRow): number {
    const relative =
      skillType === "heal"
        ? SETTINGS.history.general.state.relativeToTopHealSkill
        : skillType === "tanked"
          ? SETTINGS.history.general.state.relativeToTopTankedSkill
          : SETTINGS.history.general.state.relativeToTopDPSSkill;
    if (relative && maxSkillTotal > 0) {
      return ((row.row.totalDmg ?? 0) / maxSkillTotal) * 100;
    }
    return rowDmgPct(row);
  }

  function toggleGroup(id: number) {
    const next = new Set(expandedGroups);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedGroups = next;
  }

  const shortenNumbers = $derived(
    skillType === "tanked"
      ? SETTINGS.history.general.state.shortenTps
      : SETTINGS.history.general.state.shortenDps,
  );
</script>

<div class="mb-4">
  <div class="mb-2 flex items-center gap-3">
    <button
      onclick={onBack}
      class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      aria-label={t("history.detail.actions.backToOverview")}
    >
      <svg
        class="h-5 w-5"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </button>
    <div>
      <h2 class="text-foreground text-xl font-semibold">
        {t("history.detail.skills.title")}
      </h2>
      <div class="text-sm text-neutral-400">
        {t("history.detail.player.label")}
        {playerName}
        <span class="text-neutral-500">#{entity.displayUid}</span>
      </div>
    </div>
  </div>
</div>

{#if skillType === "heal"}
  <div class="border-border/60 bg-card/30 mb-3 rounded border p-3">
    <div class="text-muted-foreground mb-2 text-xs tracking-wider uppercase">
      {t("history.detail.healTargets.title")}
    </div>
    {#if healTargetSummary.length === 0}
      <div class="text-muted-foreground text-sm">
        {t("history.detail.healTargets.empty")}
      </div>
    {:else}
      <div class="space-y-1.5">
        {#each healTargetSummary as target (target.targetEntityUuid)}
          {@const pct = healTargetPct(target.totalValue)}
          <div class="text-sm">
            <div
              class="text-muted-foreground flex items-center justify-between gap-2"
            >
              <span class="truncate">{target.resolvedName}</span>
              <span class="shrink-0">
                {formatNumber(ipcNumber(target.totalValue))} ({formatNumber(
                  pct,
                  {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  },
                )}%)
              </span>
            </div>
            <div class="bg-muted/40 mt-1 h-1.5 overflow-hidden rounded">
              <div class="bg-primary/70 h-full" style="width: {pct}%;"></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<div class="border-border/60 bg-card/30 overflow-x-auto rounded border">
  <table class="w-full border-collapse">
    <thead>
      <tr class="bg-popover/60">
        <th
          class="text-muted-foreground px-3 py-3 text-left text-xs font-medium tracking-wider uppercase"
          title={skillColumnHeader}
          ><span class="block max-w-48 truncate">{skillColumnHeader}</span></th
        >
        {#each visibleSkillColumns as col (col.key)}
          <th
            class="text-muted-foreground px-3 py-3 text-right text-xs font-medium tracking-wider uppercase"
            title={col.header}
            ><span class="block max-w-48 truncate">{col.header}</span></th
          >
        {/each}
      </tr>
    </thead>
    <tbody class="bg-background/40">
      {#each flatSkillRows as item (item.key)}
        <tr
          class="border-border/40 hover:bg-muted/60 relative border-t transition-colors"
        >
          <td class="text-muted-foreground relative z-10 px-3 py-3 text-sm">
            {#if item.kind === "group"}
              <button
                class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                onclick={() => toggleGroup(item.row.recountId)}
              >
                <svg
                  class="text-muted-foreground/70 size-3 shrink-0 transition-transform duration-150 {expandedGroups.has(
                    item.row.recountId,
                  )
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
                <span>{item.row.recountName}</span>
              </button>
            {:else}
              <div
                class="inline-flex items-center gap-1.5"
                style="padding-left: {item.depth * 16}px;"
              >
                {#if item.depth > 0}
                  <span class="flex w-3 shrink-0 justify-center">
                    <span class="bg-muted-foreground/35 size-1 rounded-full"
                    ></span>
                  </span>
                {:else}
                  <span class="w-3 shrink-0"></span>
                {/if}
                <span class="truncate">{item.row.name}</span>
                {#if item.row.showSkillId}
                  <span class="text-muted-foreground/50 shrink-0 text-[10px]">
                    #{item.row.skillId}
                  </span>
                {/if}
              </div>
            {/if}
          </td>
          {#each visibleSkillColumns as col (col.key)}
            <td
              class="text-muted-foreground relative z-10 px-3 py-3 text-right text-sm"
            >
              {#if (col.key === "maxDmg" && item.row.maxDmg === null) || (col.key === "minDmg" && item.row.minDmg === null)}
                <span class="text-muted-foreground/50">-</span>
              {:else if (col.key === "totalDmg" || col.key === "dps" || col.key === "effectiveTotal" || col.key === "effectiveDps" || col.key === "avgDmg" || col.key === "maxDmg" || col.key === "minDmg") && shortenNumbers}
                <AbbreviatedNumber
                  num={skillCellValue(item, col.key)}
                  decimalPlaces={abbreviatedDecimalPlaces}
                  {abbreviationStyle}
                />
              {:else if col.key === "property" || col.key === "damageMode"}
                {#if item.kind === "group"}
                  <span class="text-muted-foreground/50">-</span>
                {:else}
                  {col.format((item.row as SkillDisplayRow)[col.key] as number)}
                {/if}
              {:else}
                {col.format(skillCellValue(item, col.key))}
              {/if}
            </td>
          {/each}
          <TableRowGlow
            className={entity.className}
            percentage={skillGlowPercentage(item)}
          />
        </tr>
      {/each}
    </tbody>
  </table>
</div>
