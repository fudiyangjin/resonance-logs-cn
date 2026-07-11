<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import {
    getGlobalBuffAliases,
    SETTINGS,
    type BuffAliasMap,
  } from "$lib/settings-store";
  import type {
    DamageSnapshot,
    DeathBuffSnapshot,
    DeathParticipantBuffSnapshot,
    DeathRecord,
  } from "$lib/api";
  import AbbreviatedNumber from "$lib/components/abbreviated-number.svelte";
  import { formatClassSpecLabel } from "$lib/class-labels";
  import {
    lookupBuffMeta,
    resolveBuffDisplayName,
  } from "$lib/config/buff-name-table";
  import { resolveMonsterName } from "$lib/config/game-names";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import TableRowGlow from "$lib/components/table-row-glow.svelte";
  import { formatDateTime, formatNumber, t } from "$lib/i18n/index.svelte";
  import { uidFromEntityUuid } from "$lib/entity-id";

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
  const buffAliases = $derived.by<BuffAliasMap>(() => getGlobalBuffAliases());

  // Reverse so that the fatal hit (0s) sits at the top and older hits descend (-0.2s, -0.5s, ...).
  const rows = $derived.by<DamageSnapshot[]>(() =>
    [...(record.recentDamages ?? [])].slice().reverse(),
  );
  const victimBuffs = $derived(record.victimBuffs ?? []);
  const participantBuffs = $derived(record.participantBuffs ?? []);
  const participantDisplay = $derived.by(() => {
    const cards: Array<{
      key: string;
      title: string;
      buffs: DeathBuffSnapshot[];
    }> = [
      {
        key: "victim",
        title: t("components.deathReplay.buff.victim"),
        buffs: victimBuffs,
      },
    ];
    const monsterNameCounts = new Map<string, number>();
    const monsterNameIndexes = new Map<string, number>();
    const attackerNameByEntityUuid = new Map<string, string>();
    const attackerNameByMonsterTypeId = new Map<number, string>();

    for (const participant of participantBuffs) {
      if (participant.monsterTypeId == null) continue;
      const name = resolveParticipantBaseTitle(participant);
      monsterNameCounts.set(name, (monsterNameCounts.get(name) ?? 0) + 1);
    }

    for (const [index, participant] of participantBuffs.entries()) {
      const title = resolveParticipantTitle(
        participant,
        monsterNameCounts,
        monsterNameIndexes,
      );
      cards.push({
        key: getParticipantKey(participant, index),
        title,
        buffs: participant.buffs ?? [],
      });

      if (participant.entityUuid) {
        attackerNameByEntityUuid.set(participant.entityUuid, title);
      } else if (participant.monsterTypeId != null) {
        attackerNameByMonsterTypeId.set(
          Number(participant.monsterTypeId),
          title,
        );
      }
    }

    return { cards, attackerNameByEntityUuid, attackerNameByMonsterTypeId };
  });
  const buffSnapshotCards = $derived(participantDisplay.cards);
  const hasBuffSnapshots = $derived(
    buffSnapshotCards.length > 1 || (buffSnapshotCards[0]?.buffs.length ?? 0) > 0,
  );

  const maxValue = $derived.by(() => {
    let maxV = 0;
    for (const d of record.recentDamages ?? []) {
      const v = Number(d.value);
      if (v > maxV) maxV = v;
    }
    return maxV;
  });

  function formatAbsoluteTime(ms: number): string {
    return (
      formatDateTime(ms, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) || String(ms)
    );
  }

  function formatRelativeSeconds(snapshot: DamageSnapshot): string {
    const deltaMs =
      Number(snapshot.timestampMs) - Number(record.deathTimestampMs);
    const seconds = deltaMs / 1000;
    if (seconds >= 0) return t("components.deathReplay.relativeSeconds.zero");
    return t("components.deathReplay.relativeSeconds.value", {
      seconds: formatNumber(seconds, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    });
  }

  function resolveAttackerName(snapshot: DamageSnapshot): string {
    if (snapshot.attackerEntityUuid) {
      const participantName = participantDisplay.attackerNameByEntityUuid.get(
        snapshot.attackerEntityUuid,
      );
      if (participantName) return participantName;
    }

    if (
      snapshot.attackerEntityUuid == null &&
      snapshot.attackerMonsterTypeId != null
    ) {
      const participantName =
        participantDisplay.attackerNameByMonsterTypeId.get(
          Number(snapshot.attackerMonsterTypeId),
        );
      if (participantName) return participantName;
    }

    if (snapshot.attackerMonsterTypeId != null) {
      return resolveMonsterName(Number(snapshot.attackerMonsterTypeId));
    }

    if (snapshot.attackerEntityUuid) {
      return t("components.deathReplay.attackerUid", {
        uid: uidFromEntityUuid(snapshot.attackerEntityUuid),
      });
    }

    return t("components.deathReplay.unknownSource");
  }

  function resolveSkillName(snapshot: DamageSnapshot): string {
    const skillKey = Number(snapshot.skillKey);
    const base = lookupDamageIdName(skillKey);
    const unknown = t("game.damage.unknown", { id: skillKey });
    if (base && base !== unknown) return base;
    if (snapshot.attackerMonsterTypeId != null) {
      return t("components.deathReplay.monsterSkillFallback", {
        monsterName: resolveAttackerName(snapshot),
        skillKey: snapshot.skillKey,
      });
    }
    return unknown;
  }

  function resolveDamageTooltip(snapshot: DamageSnapshot): string {
    const skillName = resolveSkillName(snapshot);
    const attackerName = resolveAttackerName(snapshot);
    if (!attackerName) return skillName;
    return `${skillName}\n${t("components.deathReplay.sourceLabel", {
      source: attackerName,
    })}`;
  }

  function glowPercentage(value: number): number {
    if (maxValue <= 0) return 0;
    return (value / maxValue) * 100;
  }

  function resolveBuffName(buff: DeathBuffSnapshot): string {
    const baseId = Number(buff.baseId);
    const name = resolveBuffDisplayName(baseId, buffAliases);
    return name === `#${baseId}` ? String(baseId) : name;
  }

  function resolveBuffIcon(buff: DeathBuffSnapshot): string | null {
    return lookupBuffMeta(Number(buff.baseId))?.spriteFile ?? null;
  }

  function resolveBuffTooltip(buff: DeathBuffSnapshot): string {
    return `${buff.baseId}: ${resolveBuffName(buff)}`;
  }

  function getParticipantKey(
    participant: DeathParticipantBuffSnapshot,
    index: number,
  ): string {
    return (
      participant.entityUuid ??
      `monster:${participant.monsterTypeId ?? "unknown"}:${index}`
    );
  }

  function resolveParticipantBaseTitle(
    participant: DeathParticipantBuffSnapshot,
  ): string {
    if (participant.monsterTypeId != null) {
      return resolveMonsterName(Number(participant.monsterTypeId));
    }

    if (participant.entityUuid) {
      return t("components.deathReplay.attackerUid", {
        uid: uidFromEntityUuid(participant.entityUuid),
      });
    }

    return t("components.deathReplay.unknownSource");
  }

  function resolveParticipantTitle(
    participant: DeathParticipantBuffSnapshot,
    monsterNameCounts: Map<string, number>,
    monsterNameIndexes: Map<string, number>,
  ): string {
    const title = resolveParticipantBaseTitle(participant);
    if (participant.monsterTypeId == null) return title;
    if ((monsterNameCounts.get(title) ?? 0) <= 1) return title;

    const nextIndex = (monsterNameIndexes.get(title) ?? 0) + 1;
    monsterNameIndexes.set(title, nextIndex);
    return `${title} #${nextIndex}`;
  }
</script>

{#snippet buffSnapshotCard(title: string, buffs: DeathBuffSnapshot[])}
  <section
    class="min-w-0 rounded border border-border/50 bg-background/50 p-2"
  >
    <div class="mb-2 truncate text-xs font-medium text-foreground">
      {title}
    </div>
    {#if buffs.length === 0}
      <div class="text-xs text-muted-foreground/70">
        {t("components.deathReplay.buff.none")}
      </div>
    {:else}
      <div class="flex flex-wrap gap-1.5">
        {#each buffs as buff (`${buff.buffUuid}-${buff.baseId}`)}
          {@const icon = resolveBuffIcon(buff)}
          <div
            class="flex max-w-44 items-center gap-1.5 rounded border border-border/50 bg-card/70 px-1.5 py-1 text-xs text-muted-foreground"
            {@attach tooltip(() => resolveBuffTooltip(buff))}
          >
            {#if icon}
              <img
                class="size-4 shrink-0 rounded-sm object-contain"
                src={`/images/buff/${icon}`}
                alt={resolveBuffName(buff)}
              />
            {/if}
            <span class="min-w-0 truncate">{resolveBuffName(buff)}</span>
            {#if buff.layer > 1}
              <span class="shrink-0 tabular-nums">x{buff.layer}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet buffSnapshotsPanel()}
  {#if hasBuffSnapshots}
    <div
      class="mb-2 grid grid-cols-1 gap-2 rounded border border-border/50 bg-card/20 p-2"
    >
      {#each buffSnapshotCards as card (card.key)}
        {@render buffSnapshotCard(card.title, card.buffs)}
      {/each}
    </div>
  {/if}
{/snippet}

{#if variant === "history"}
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
      <span class="text-sm text-neutral-400 tabular-nums">
        {t("components.deathReplay.deathAt", {
          time: formatAbsoluteTime(Number(record.deathTimestampMs)),
        })}
      </span>
      <span class="text-sm text-neutral-400">
        {t("components.deathReplay.hitCountText", {
          count: formatNumber(rows.length),
        })}
      </span>
    </div>
  </div>

  {@render buffSnapshotsPanel()}

  <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-popover/60">
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.time")}</th
          >
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.skill")}</th
          >
          <th
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.source")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.damage")}</th
          >
          <th
            class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >{t("components.deathReplay.table.share")}</th
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
              {t("components.deathReplay.noDamageSnapshots")}
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
                {@attach tooltip(() => resolveDamageTooltip(dmg))}
                >{resolveSkillName(dmg)}</td
              >
              <td
                class="px-3 py-3 text-sm text-muted-foreground relative z-10 truncate"
                {@attach tooltip(() => resolveAttackerName(dmg))}
                >{resolveAttackerName(dmg) || "-"}</td
              >
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                {@attach tooltip(() => formatNumber(Number(dmg.value)))}
              >
                {#if shortenTps}
                  <AbbreviatedNumber
                    num={Number(dmg.value)}
                    decimalPlaces={abbreviatedDecimalPlaces}
                    {abbreviationStyle}
                  />
                {:else}
                  {formatNumber(Number(dmg.value))}
                {/if}
              </td>
              <td
                class="px-3 py-3 text-right text-sm text-muted-foreground relative z-10 tabular-nums"
                >{formatNumber(pct, {
                  maximumFractionDigits: 0,
                })}%</td
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
  <!-- Live: compact skill-row rendering aligned with DPS/HEAL (no sticky header; right-click to go back). -->
  <div class="relative flex flex-col">
    {@render buffSnapshotsPanel()}
    <table class="w-full border-collapse">
      <tbody>
        {#if rows.length === 0}
          <tr>
            <td
              class="px-3 py-6 text-center text-muted-foreground text-xs"
              style="font-size: {tableSettings.skillFontSize}px;"
            >
              {t("components.deathReplay.noDamageSnapshots")}
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
                    class="flex-1 min-w-0"
                    {@attach tooltip(() => resolveDamageTooltip(dmg))}
                  >
                    <span class="block truncate">{resolveSkillName(dmg)}</span>
                    {#if resolveAttackerName(dmg)}
                      <span
                        class="block truncate text-[0.85em] text-muted-foreground/80"
                      >
                        {t("components.deathReplay.sourceLabel", {
                          source: resolveAttackerName(dmg),
                        })}
                      </span>
                    {/if}
                  </span>
                  <span
                    class="tabular-nums font-medium shrink-0"
                    {@attach tooltip(() => formatNumber(Number(dmg.value)))}
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
                      {formatNumber(Number(dmg.value))}
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
