<script lang="ts">
  /**
   * @file Buff coverage of the saved encounter shown in the live window:
   * one player at a time (the local player by default), one row per watched
   * buff. History only; live coverage stays on the HUD. Row size, glow and
   * colors follow the skill breakdown table so the page needs no settings.
   */
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
  import { formatNumber, t } from "$lib/i18n/index.svelte";
  import {
    coverageBuffOrder,
    coveragePlayerUuids,
    coverageRowsFor,
    resolveCoveragePlayer,
    type CoverageRow,
  } from "$lib/live-buff-coverage";
  import { formatEncounterDuration } from "$lib/live-history-query";
  import getDisplayName, {
    normalizeNameDisplaySetting,
  } from "$lib/name-display";
  import { getGlobalBuffAliases, SETTINGS } from "$lib/settings-store";
  import { ensureBuffCoverageEntries } from "$lib/skill-monitor-normalize";
  import { activeProfile } from "$lib/skill-monitor-profile.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import { tooltip } from "$lib/utils.svelte";
  import CoveragePlayerStrip, {
    type CoveragePlayerChip,
  } from "./coverage-player-strip.svelte";

  const view = $derived(liveView.buffCoverage);
  const localUuid = $derived(liveView.encounterCombat?.localPlayerUuid || null);

  const showYourName = $derived(SETTINGS.live.general.state.showYourName);
  const showOthersName = $derived(SETTINGS.live.general.state.showOthersName);

  const chips = $derived.by<CoveragePlayerChip[]>(() => {
    if (!view) return [];
    const players = liveView.history?.players ?? [];
    const byUuid = new Map(
      players.map((player) => [player.entityUuid, player]),
    );
    // Self first, then healers, tanks and damage dealers by class.
    return coveragePlayerUuids(view, players, localUuid).flatMap((uuid) => {
      const player = byUuid.get(uuid);
      if (!player) return [];
      const isLocalPlayer = uuid === localUuid;
      const showClass = isLocalPlayer
        ? normalizeNameDisplaySetting(showYourName) !== "Hide Your Name"
        : normalizeNameDisplaySetting(showOthersName) !== "Hide Others' Name";
      const label = getDisplayName({
        player,
        showYourNameSetting: showYourName,
        showOthersNameSetting: showOthersName,
        isLocalPlayer,
      });
      return [
        {
          entityUuid: uuid,
          label: label || `#${player.displayUid}`,
          className: showClass ? player.className : "",
          classSpecName: showClass ? player.classSpecName : "",
        },
      ];
    });
  });

  const selectedUuid = $derived(
    resolveCoveragePlayer(
      chips.map((chip) => chip.entityUuid),
      liveView.coveragePlayerUuid,
      localUuid,
    ),
  );
  const selectedChip = $derived(
    chips.find((chip) => chip.entityUuid === selectedUuid) ?? null,
  );

  // Same order as the HUD coverage group of the active profile.
  const configuredIds = $derived(
    ensureBuffCoverageEntries(activeProfile()).map((entry) => entry.buffId),
  );
  const rows = $derived(
    view && selectedUuid
      ? coverageRowsFor(
          view,
          selectedUuid,
          coverageBuffOrder(view, configuredIds),
        )
      : [],
  );

  const aliases = $derived(getGlobalBuffAliases());
  const tableSettings = $derived(SETTINGS.live.tableCustomization.state);
  const themeColors = $derived(SETTINGS.live.appearance.state.themeColors);

  const settingsPath = $derived(
    `${t("routes.tools.skillMonitor")} › ${t("skillMonitor.tabs.buffCoverage")}`,
  );

  function duration(ms: number): string {
    return formatEncounterDuration(ms / 1000);
  }

  function rowTooltip(row: CoverageRow, name: string): string {
    if (!row.lane) {
      return t("live.coverage.absentTooltip", { name, id: row.baseId });
    }
    return t("live.coverage.rowTooltip", {
      name,
      id: row.baseId,
      covered: duration(row.lane.coveredActiveMs),
      active: duration(view?.activeWindowMs ?? 0),
      count: row.lane.triggerCount,
    });
  }

  // "Self" means whoever is local, so a pick of the local player is not
  // pinned to this character.
  function selectPlayer(entityUuid: string) {
    liveView.setCoveragePlayer(entityUuid === localUuid ? null : entityUuid);
  }
</script>

<svelte:window oncontextmenu={() => window.history.back()} />

{#if !liveView.isHistory || view === null || view.lanes.length === 0}
  <div
    class="text-muted-foreground px-3 py-6 text-center text-xs leading-relaxed"
  >
    {#if !liveView.isHistory}
      {t("live.coverage.historyOnly")}
    {:else if view === null}
      {t("history.buffCoverage.unavailable")}
    {:else}
      {t("live.coverage.empty", { path: settingsPath })}
    {/if}
  </div>
{:else}
  <CoveragePlayerStrip
    players={chips}
    selected={selectedUuid}
    onSelect={selectPlayer}
  />

  <div
    class="ring-border/60 bg-card/30 relative overflow-hidden rounded-lg ring-1"
  >
    <table class="w-full border-collapse">
      <tbody>
        {#each rows as row (row.baseId)}
          {@const name = resolveBuffDisplayName(row.baseId, aliases)}
          <tr
            class="relative {row.lane ? '' : 'opacity-50'}"
            style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px; color: {themeColors.tableTextColor};"
            {@attach tooltip(() => rowTooltip(row, name))}
          >
            <td class="relative z-10 px-2 py-1">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate">{name}</span>
                <span
                  class="shrink-0 text-right font-medium tabular-nums"
                  style="width: 4.2em"
                >
                  {row.lane
                    ? `${formatNumber(row.lane.coveragePct, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}%`
                    : "—"}
                </span>
                <span
                  class="shrink-0 text-right tabular-nums opacity-70"
                  style="width: 3em"
                >
                  {row.lane
                    ? t("history.buffCoverage.count", {
                        value: row.lane.triggerCount,
                      })
                    : ""}
                </span>
              </div>
            </td>
            {#if row.lane}
              <TableRowGlow
                isSkill={true}
                className={selectedChip?.className ?? ""}
                classSpecName={selectedChip?.classSpecName ?? ""}
                percentage={row.lane.coveragePct}
              />
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p
    class="text-muted-foreground px-1 pt-1 text-right text-[10px] tabular-nums"
  >
    {t("live.coverage.caption", { duration: duration(view.activeWindowMs) })}
  </p>
{/if}
