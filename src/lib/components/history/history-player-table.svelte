<script lang="ts">
  /**
   * History overview player table: restores the pre-pipeline-upgrade display
   * (configurable columns, class-colored glow bars, abbreviated numbers,
   * ability-score block) driven by the merged per-player rows built in
   * `$lib/history-derived`. Also reused for the tanked per-monster middle
   * layer via `totalRow` + `nameHeader`.
   */
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import {
    historyDpsPlayerColumns,
    historyHealPlayerColumns,
    historyTankedPlayerColumns,
  } from "$lib/column-data";
  import FantasyCastIcons from "$lib/components/fantasy-cast-icons.svelte";
  import type { FantasyCastDisplay } from "$lib/fantasy-icons";
  import type { HistoryPlayerRow } from "$lib/history-derived";
  import { resolveColumnLabel } from "$lib/column-labels";
  import { t } from "$lib/i18n/index.svelte";
  import getDisplayName from "$lib/name-display";
  import {
    DEFAULT_HISTORY_STATS,
    DEFAULT_HISTORY_TANKED_STATS,
    SETTINGS,
    settings,
  } from "$lib/settings-store";
  import { getClassIcon, tooltip } from "$lib/utils.svelte";

  type MetricKey = "dps" | "heal" | "tanked";

  let {
    rows,
    metric,
    nameHeader = null,
    totalRow = null,
    fantasyCastsByEntity = undefined,
    onSelect,
  }: {
    rows: HistoryPlayerRow[];
    metric: MetricKey;
    /** Header label for the name column (defaults to the player label). */
    nameHeader?: string | null;
    /** Optional pinned aggregate row rendered first with a full-width glow. */
    totalRow?: HistoryPlayerRow | null;
    fantasyCastsByEntity?: ReadonlyMap<string, FantasyCastDisplay[]>;
    onSelect: (row: HistoryPlayerRow) => void;
  } = $props();

  const visibleColumns = $derived.by(() => {
    if (metric === "heal") {
      return historyHealPlayerColumns.filter(
        (col) => settings.state.history.heal.players[col.key] ?? true,
      );
    }
    if (metric === "tanked") {
      return historyTankedPlayerColumns.filter((col) => {
        const defaultValue =
          DEFAULT_HISTORY_TANKED_STATS[
            col.key as keyof typeof DEFAULT_HISTORY_TANKED_STATS
          ] ?? false;
        return settings.state.history.tanked.players[col.key] ?? defaultValue;
      });
    }
    const labels = SETTINGS.live.columnLabels.state.history.players.columns;
    return historyDpsPlayerColumns
      .filter((col) => {
        const defaultValue =
          DEFAULT_HISTORY_STATS[
            col.key as keyof typeof DEFAULT_HISTORY_STATS
          ] ?? true;
        const setting =
          settings.state.history.dps.players[
            col.key as keyof typeof settings.state.history.dps.players
          ];
        return setting ?? defaultValue;
      })
      .map((col) => ({
        ...col,
        header: resolveColumnLabel(labels[col.key], col.header),
      }));
  });
  const playerColumnHeader = $derived(
    metric === "dps"
      ? resolveColumnLabel(
          SETTINGS.live.columnLabels.state.history.players.first,
          t("history.detail.table.player"),
        )
      : t("history.detail.table.player"),
  );

  const abbreviatedDecimalPlaces = $derived(
    SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1,
  );
  const abbreviationStyle = $derived(
    SETTINGS.history.general.state.abbreviationStyle,
  );

  function rowMetricValue(row: HistoryPlayerRow): number {
    if (metric === "heal") return row.healDealt;
    if (metric === "tanked") return row.damageTaken;
    return row.totalDmg;
  }

  const maxValue = $derived(
    rows.reduce((max, row) => Math.max(max, rowMetricValue(row)), 0),
  );

  function glowPercentage(row: HistoryPlayerRow): number {
    const relative =
      metric === "heal"
        ? SETTINGS.history.general.state.relativeToTopHealPlayer
        : metric === "tanked"
          ? SETTINGS.history.general.state.relativeToTopTankedPlayer
          : SETTINGS.history.general.state.relativeToTopDPSPlayer;
    if (relative && maxValue > 0) {
      return (rowMetricValue(row) / maxValue) * 100;
    }
    return metric === "heal"
      ? row.healPct
      : metric === "tanked"
        ? row.tankedPct
        : row.dmgPct;
  }

  /** Whether a numeric column renders through the abbreviation component. */
  function fantasyCastsFor(row: HistoryPlayerRow): FantasyCastDisplay[] {
    return fantasyCastsByEntity?.get(row.entityUuid) ?? [];
  }

  function shouldAbbreviate(key: string): boolean {
    if (metric === "tanked") {
      return (
        (key === "damageTaken" || key === "tankedPS") &&
        SETTINGS.history.general.state.shortenTps
      );
    }
    const abbreviatedKeys =
      metric === "heal"
        ? ["healDealt", "hps", "effectiveHeal", "ehps"]
        : ["totalDmg", "bossDmg", "bossDps", "dps", "tdps"];
    return (
      abbreviatedKeys.includes(key) && SETTINGS.history.general.state.shortenDps
    );
  }
</script>

{#snippet playerRow(row: HistoryPlayerRow, glow: number)}
  {@const casts = fantasyCastsFor(row)}
  <tr
    class="border-border/40 hover:bg-muted/60 relative cursor-pointer border-t transition-colors"
    onclick={() => onSelect(row)}
  >
    <td class="text-muted-foreground relative z-10 px-3 py-3 text-sm">
      <div class="flex h-full items-center gap-2">
        {#if row.className}
          <img
            class="size-5 object-contain"
            src={getClassIcon(row.className)}
            alt={t("history.detail.table.classIconAlt")}
            {@attach tooltip(
              () => row.classDisplay || t("history.detail.player.unknownClass"),
            )}
          />
        {/if}
        <span
          class="truncate"
          {@attach tooltip(() =>
            t("common.uidTooltip", { uid: row.displayUid }),
          )}
        >
          {#if (row.abilityScore > 0 && (row.isLocalPlayer ? SETTINGS.history.general.state.showYourAbilityScore : SETTINGS.history.general.state.showOthersAbilityScore)) || (row.seasonStrength > 0 && (row.isLocalPlayer ? SETTINGS.history.general.state.showYourSeasonStrength : SETTINGS.history.general.state.showOthersSeasonStrength))}
            <span
              class="text-muted-foreground inline-flex items-center gap-0 tabular-nums"
            >
              {#if row.abilityScore > 0 && (row.isLocalPlayer ? SETTINGS.history.general.state.showYourAbilityScore : SETTINGS.history.general.state.showOthersAbilityScore)}
                {#if SETTINGS.history.general.state.shortenAbilityScore}
                  <AbbreviatedNumber num={row.abilityScore} />
                {:else}
                  <span>{row.abilityScore}</span>
                {/if}
              {/if}
              {#if row.seasonStrength > 0 && (row.isLocalPlayer ? SETTINGS.history.general.state.showYourSeasonStrength : SETTINGS.history.general.state.showOthersSeasonStrength)}
                <span>({row.seasonStrength})</span>
              {/if}
            </span>
          {/if}
          {getDisplayName({
            player: {
              entityUuid: row.entityUuid,
              displayUid: row.displayUid,
              name: row.name,
              className: row.className,
              classSpecName: row.classSpecName,
            },
            showYourNameSetting: settings.state.history.general.showYourName,
            showOthersNameSetting:
              settings.state.history.general.showOthersName,
            isLocalPlayer: row.isLocalPlayer,
          })}
          {#if row.isLocalPlayer}
            <span class="ml-1 text-[oklch(0.65_0.1_250)]"
              >{t("history.detail.player.you")}</span
            >
          {/if}
        </span>
        {#if casts.length > 0}
          <FantasyCastIcons {casts} size={20} />
        {/if}
      </div>
    </td>
    {#each visibleColumns as col (col.key)}
      {@const cellValue =
        (row[col.key as keyof HistoryPlayerRow] as number | undefined) ?? 0}
      <td
        class="text-muted-foreground relative z-10 px-3 py-3 text-right text-sm"
      >
        {#if shouldAbbreviate(col.key)}
          <AbbreviatedNumber
            num={cellValue}
            decimalPlaces={abbreviatedDecimalPlaces}
            {abbreviationStyle}
          />
        {:else}
          {col.format(cellValue)}
        {/if}
      </td>
    {/each}
    <TableRowGlow
      className={row.className}
      classSpecName={row.classSpecName}
      percentage={glow}
    />
  </tr>
{/snippet}

<div class="border-border/60 bg-card/30 overflow-x-auto rounded border">
  <table class="w-full border-collapse">
    <thead>
      <tr class="bg-popover/60">
        <th
          class="text-muted-foreground px-3 py-3 text-left text-xs font-medium tracking-wider uppercase"
          title={nameHeader ?? playerColumnHeader}
          ><span class="block max-w-48 truncate"
            >{nameHeader ?? playerColumnHeader}</span
          ></th
        >
        {#each visibleColumns as col (col.key)}
          <th
            class="text-muted-foreground px-3 py-3 text-right text-xs font-medium tracking-wider uppercase"
            title={col.header}
            ><span class="block max-w-48 truncate">{col.header}</span></th
          >
        {/each}
      </tr>
    </thead>
    <tbody class="bg-background/40">
      {#if totalRow}
        {@render playerRow({ ...totalRow, isLocalPlayer: false }, 100)}
      {/if}
      {#each rows as row (row.entityUuid)}
        {@render playerRow(row, glowPercentage(row))}
      {/each}
    </tbody>
  </table>
</div>
