<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import type { DamageSnapshot, DeathRecord } from "$lib/api";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { uiT } from "$lib/i18n";

  let {
    playerName,
    className,
    classSpecName,
    record,
    onBack,
    variant = "live",
  }: {
    playerName: string;
    className: string;
    classSpecName: string;
    record: DeathRecord;
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
  const t = uiT("dps/history", () => SETTINGS.live.general.state.language);

  const rows = $derived.by<DamageSnapshot[]>(() =>
    [...record.recentDamages].slice().reverse(),
  );

  const maxValue = $derived.by(() => {
    let maxV = 0;
    for (const d of record.recentDamages) {
      const v = Number(d.value);
      if (v > maxV) maxV = v;
    }
    return maxV;
  });

  function formatAbsoluteTime(ms: number): string {
    const date = new Date(ms);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function formatRelativeSeconds(snapshot: DamageSnapshot): string {
    const deltaMs =
      Number(snapshot.timestampMs) - Number(record.deathTimestampMs);
    const seconds = deltaMs / 1000;
    if (seconds >= 0) return "0s";
    return `${seconds.toFixed(1)}s`;
  }

  function resolveSkillName(snapshot: DamageSnapshot): string {
    const base = lookupDamageIdName(Number(snapshot.skillKey));
    if (base && !base.startsWith("Unknown")) return base;
    if (snapshot.attackerMonsterTypeId != null) {
      return t("detail.death.monsterSkill", "Monster {monsterId} - #{skillId}")
        .replace("{monsterId}", String(snapshot.attackerMonsterTypeId))
        .replace("{skillId}", String(snapshot.skillKey));
    }
    return base;
  }

  function glowPercentage(value: number): number {
    if (maxValue <= 0) return 0;
    return (value / maxValue) * 100;
  }
</script>

{#if variant === "history"}
  <div class="mb-2 flex items-center gap-3">
    <button
      onclick={() => onBack?.()}
      class="p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded hover:bg-neutral-800"
      aria-label={t("detail.back", "Back")}
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
        alt={t("detail.classIcon", "Class icon")}
        {@attach tooltip(
          () =>
            formatClassSpecLabel(className, classSpecName) ||
            t("detail.unknownClass", "Unknown Class"),
        )}
      />
      <h2 class="text-xl font-semibold text-foreground">{playerName}</h2>
      <span class="text-sm text-neutral-400 tabular-nums">
        {t("detail.death.diedAt", "Died at {time}").replace(
          "{time}",
          formatAbsoluteTime(Number(record.deathTimestampMs)),
        )}
      </span>
      <span class="text-sm text-neutral-400">
        {t("detail.death.hitCount", "{count} hits").replace(
          "{count}",
          String(record.recentDamages.length),
        )}
      </span>
    </div>
  </div>

  <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-popover/60">
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.time", "Time")}</th
          >
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.skillColumn", "Skill")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.damage", "Damage")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("detail.share", "Share")}</th
          >
        </tr>
      </thead>
      <tbody class="bg-background/40">
        {#if rows.length === 0}
          <tr>
            <td
              colspan="4"
              class="px-3 py-8 text-center text-xs text-muted-foreground"
            >
              {t("detail.death.noDamage", "No damage was recorded for this death.")}
            </td>
          </tr>
        {:else}
          {#each rows as dmg, idx (idx)}
            {@const pct = glowPercentage(Number(dmg.value))}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors"
            >
              <td
                class="px-3 py-3 text-sm text-muted-foreground relative z-10 tabular-nums w-20"
                >{formatRelativeSeconds(dmg)}</td
              >
              <td
                class="px-3 py-3 text-sm text-muted-foreground relative z-10 truncate"
                {@attach tooltip(() => resolveSkillName(dmg))}
                >{resolveSkillName(dmg)}</td
              >
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                {@attach tooltip(() => Number(dmg.value).toLocaleString())}
              >
                {#if shortenTps}
                  <AbbreviatedNumber
                    num={Number(dmg.value)}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                  />
                {:else}
                  {Number(dmg.value).toLocaleString()}
                {/if}
              </td>
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                >{pct.toFixed(0)}%</td
              >
              <TableRowGlow
                isSkill={true}
                {className}
                {classSpecName}
                percentage={pct}
              />
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{:else}
  <div class="relative flex flex-col">
    <table class="w-full border-collapse">
      <tbody>
        {#if rows.length === 0}
          <tr>
            <td
              class="px-3 py-6 text-center text-muted-foreground text-xs"
              style="font-size: {tableSettings.skillFontSize}px;"
            >
              {t("detail.death.noDamage", "No damage was recorded for this death.")}
            </td>
          </tr>
        {:else}
          {#each rows as dmg, idx (idx)}
            {@const pct = glowPercentage(Number(dmg.value))}
            <tr
              class="relative hover:bg-muted/60 transition-colors bg-background/40"
              style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
            >
              <td
                class="px-2 py-1 relative z-10"
                style="color: {customThemeColors.tableTextColor};"
              >
                <div class="flex items-center h-full gap-2">
                  <span
                    class="tabular-nums font-semibold text-muted-foreground shrink-0 w-14"
                    >{formatRelativeSeconds(dmg)}</span
                  >
                  <span
                    class="flex-1 truncate"
                    {@attach tooltip(() => resolveSkillName(dmg))}
                    >{resolveSkillName(dmg)}</span
                  >
                  <span
                    class="tabular-nums font-medium shrink-0"
                    {@attach tooltip(() => Number(dmg.value).toLocaleString())}
                  >
                    {#if shortenTps}
                      <AbbreviatedNumber
                        num={Number(dmg.value)}
                        decimalPlaces={abbreviatedDecimalPlaces}
                        {abbreviationStyle}
                        suffixFontSize={tableSettings.skillAbbreviatedFontSize}
                        suffixColor={customThemeColors.tableAbbreviatedColor}
                      />
                    {:else}
                      {Number(dmg.value).toLocaleString()}
                    {/if}
                  </span>
                </div>
              </td>
              <TableRowGlow
                isSkill={true}
                {className}
                {classSpecName}
                percentage={pct}
              />
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{/if}
