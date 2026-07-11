<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import type { DeathRecord } from "$lib/api";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { formatDateTime, formatNumber, t } from "$lib/i18n/index.svelte";

  let {
    playerName,
    className,
    classSpecName,
    deaths,
    fightStartTimestampMs = null,
    onSelect,
    onBack,
    variant = "live",
  }: {
    playerName: string;
    className: string;
    classSpecName: string;
    deaths: DeathRecord[];
    /** When provided, each row shows the relative elapsed time (mm:ss) inside the encounter. */
    fightStartTimestampMs?: number | null;
    onSelect: (deathTimestampMs: number) => void;
    onBack?: () => void;
    variant?: "live" | "history";
  } = $props();

  const tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  const customThemeColors = $derived(
    SETTINGS.accessibility.state.customThemeColors,
  );
  const shortenTps = $derived(
    variant === "history"
      ? SETTINGS.history.general.state.shortenTps
      : SETTINGS.live.general.state.shortenTps,
  );
  const abbreviatedDecimalPlaces = $derived(
    variant === "history"
      ? (SETTINGS.history.general.state.abbreviatedDecimalPlaces ?? 1)
      : (SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1),
  );
  const abbreviationStyle = $derived(
    variant === "history"
      ? SETTINGS.history.general.state.abbreviationStyle
      : SETTINGS.live.general.state.abbreviationStyle,
  );

  type ComputedRow = {
    record: DeathRecord;
    totalTaken: number;
    hitCount: number;
  };

  // Sorted by death timestamp desc so the most recent death appears first.
  const rows = $derived.by<ComputedRow[]>(() =>
    [...deaths]
      .sort(
        (a, b) => Number(b.deathTimestampMs) - Number(a.deathTimestampMs),
      )
      .map((record) => {
        const recentDamages = record.recentDamages ?? [];
        let totalTaken = 0;
        for (const dmg of recentDamages) {
          totalTaken += Number(dmg.value);
        }
        return {
          record,
          totalTaken,
          hitCount: recentDamages.length,
        };
      }),
  );

  const maxTotalTaken = $derived(
    rows.reduce((max, r) => (r.totalTaken > max ? r.totalTaken : max), 0),
  );

  function glowPercentage(totalTaken: number): number {
    if (maxTotalTaken <= 0) return 0;
    return (totalTaken / maxTotalTaken) * 100;
  }

  function formatAbsoluteTime(ms: number): string {
    return (
      formatDateTime(ms, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) || String(ms)
    );
  }

  function formatRelative(ms: number): string | null {
    if (fightStartTimestampMs == null || fightStartTimestampMs <= 0) return null;
    const diffSec = Math.max(0, Math.floor((ms - fightStartTimestampMs) / 1000));
    const mm = String(Math.floor(diffSec / 60)).padStart(2, "0");
    const ss = String(diffSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }
</script>

{#if variant === "history"}
  <!-- Header: history style with SVG back button, no sticky. -->
  <div class="mb-2 flex items-center gap-3">
    <button
      onclick={() => onBack?.()}
      class="p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded hover:bg-neutral-800"
      aria-label={t("components.deathReplay.back")}
    >
      <svg
        class="w-5 h-5"
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
    <div class="flex items-center gap-2">
      <img
        class="size-5 object-contain"
        src={getClassIcon(className)}
        alt={t("components.deathReplay.classIconAlt")}
        {@attach tooltip(
          () =>
            formatClassSpecLabel(className, classSpecName) ||
            t("components.deathReplay.unknownClass"),
        )}
      />
      <h2 class="text-xl font-semibold text-foreground">{playerName}</h2>
      <span class="text-sm text-neutral-400">
        {t("components.deathReplay.deathCountText", {
          count: formatNumber(deaths.length),
        })}
      </span>
    </div>
  </div>

  <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-popover/60">
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.index")}</th
          >
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.time")}</th
          >
          {#if fightStartTimestampMs != null && fightStartTimestampMs > 0}
            <th
              class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >{t("components.deathReplay.table.encounterTime")}</th
            >
          {/if}
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.hitCount")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.totalTaken")}</th
          >
        </tr>
      </thead>
      <tbody class="bg-background/40">
        {#if rows.length === 0}
          <tr>
            <td
              colspan="5"
              class="px-3 py-8 text-center text-xs text-muted-foreground"
            >
              {t("components.deathReplay.noDeaths")}
            </td>
          </tr>
        {:else}
          {#each rows as row, idx (`${row.record.victimEntityUuid}-${row.record.deathTimestampMs}`)}
            {@const rel = formatRelative(Number(row.record.deathTimestampMs))}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors cursor-pointer"
              onclick={() => onSelect(Number(row.record.deathTimestampMs))}
            >
              <td
                class="px-3 py-3 text-sm text-muted-foreground relative z-10 tabular-nums"
                >#{formatNumber(rows.length - idx)}</td
              >
              <td
                class="px-3 py-3 text-sm text-muted-foreground relative z-10 tabular-nums"
                >{formatAbsoluteTime(Number(row.record.deathTimestampMs))}</td
              >
              {#if fightStartTimestampMs != null && fightStartTimestampMs > 0}
                <td
                  class="px-3 py-3 text-sm text-muted-foreground relative z-10 tabular-nums"
                  >{rel ?? "-"}</td
                >
              {/if}
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                >{formatNumber(row.hitCount)}</td
              >
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
              >
                {#if shortenTps}
                  <AbbreviatedNumber
                    num={row.totalTaken}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                  />
                {:else}
                  {formatNumber(row.totalTaken)}
                {/if}
              </td>
              <TableRowGlow
                isSkill={true}
                {className}
                {classSpecName}
                percentage={glowPercentage(row.totalTaken)}
              />
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{:else}
  <!-- Live: compact skill-style rows, aligned with DPS/HEAL (no sticky header; right-click to go back). -->
  <div class="relative flex flex-col">
    <table class="w-full border-collapse">
      <tbody>
        {#if rows.length === 0}
          <tr>
            <td
              class="px-3 py-6 text-center text-muted-foreground text-xs"
              style="font-size: {tableSettings.skillFontSize}px;"
            >
              {t("components.deathReplay.noDeaths")}
            </td>
          </tr>
        {:else}
          {#each rows as row, idx (`${row.record.victimEntityUuid}-${row.record.deathTimestampMs}`)}
            {@const rel = formatRelative(Number(row.record.deathTimestampMs))}
            <tr
              class="relative hover:bg-muted/60 transition-colors bg-background/40 cursor-pointer"
              style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
              onclick={() => onSelect(Number(row.record.deathTimestampMs))}
            >
              <td
                class="px-2 py-1 relative z-10"
                style="color: {customThemeColors.tableTextColor};"
              >
                <div class="flex items-center h-full gap-2">
                  <span
                    class="tabular-nums font-semibold shrink-0 w-8"
                    >#{formatNumber(rows.length - idx)}</span
                  >
                  <span class="tabular-nums shrink-0"
                    >{formatAbsoluteTime(Number(row.record.deathTimestampMs))}</span
                  >
                  {#if rel}
                    <span
                      class="tabular-nums text-muted-foreground shrink-0"
                      {@attach tooltip(() =>
                        t("components.deathReplay.relativeTimeTooltip"),
                      )}
                    >
                      {t("components.deathReplay.relativeTimeLabel", {
                        time: rel,
                      })}
                    </span>
                  {/if}
                  <span
                    class="inline-flex items-center gap-1 tabular-nums shrink-0 ml-auto"
                  >
                    <span class="text-muted-foreground">
                      {t("components.deathReplay.hitCountText", {
                        count: formatNumber(row.hitCount),
                      })}
                    </span>
                    {#if shortenTps}
                      <AbbreviatedNumber
                        num={row.totalTaken}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                    {:else}
                      <span>{formatNumber(row.totalTaken)}</span>
                    {/if}
                  </span>
                </div>
              </td>
              <TableRowGlow
                isSkill={true}
                {className}
                {classSpecName}
                percentage={glowPercentage(row.totalTaken)}
              />
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{/if}
