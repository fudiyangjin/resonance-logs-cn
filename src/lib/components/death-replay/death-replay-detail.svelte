<script lang="ts">
  import { getClassIcon, tooltip } from "$lib/utils.svelte";
  import {
    DEFAULT_DEATH_REPLAY_COLUMNS,
    getGlobalBuffAliases,
    normalizeDeathReplayColumnOrder,
    SETTINGS,
    type BuffAliasMap,
  } from "$lib/settings-store";
  import { deathReplayColumns } from "$lib/column-data";
  import { damageModeLabel, propertyLabel } from "$lib/damage-type";
  import { ensureBuffIconOverrides, resolveBuffIconSrc } from "$lib/buff-icons";
  import { buffIconDirUrlPrefix } from "$lib/buff-icon-dir.svelte";
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
  import { ipcBigInt, ipcNumber, ipcRatio } from "$lib/ipc-decimal";
  import ChevronDown from "virtual:icons/lucide/chevron-down";

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
    SETTINGS.live.appearance.state.themeColors,
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
  const visibleColumns = $derived.by(() => {
    const visibility = SETTINGS.live.deathReplay.state;
    const order = normalizeDeathReplayColumnOrder(
      SETTINGS.live.columnOrder.deathReplay.state.order,
    );
    return deathReplayColumns
      .filter(
        (col) =>
          visibility[col.key] ?? DEFAULT_DEATH_REPLAY_COLUMNS[col.key],
      )
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  });
  const liveRenderItems = $derived.by(() => {
    const items: Array<
      | { kind: "identity" }
      | { kind: "column"; key: (typeof deathReplayColumns)[number]["key"] }
    > = [];
    const cols = visibleColumns;
    for (let index = 0; index < cols.length; index += 1) {
      const col = cols[index];
      const next = cols[index + 1];
      if (
        col &&
        next &&
        ((col.key === "skill" && next.key === "source") ||
          (col.key === "source" && next.key === "skill"))
      ) {
        items.push({ kind: "identity" });
        index += 1;
        continue;
      }
      if (col) items.push({ kind: "column", key: col.key });
    }
    return items;
  });
  const buffAliases = $derived.by<BuffAliasMap>(() => getGlobalBuffAliases());
  const buffIconOverrides = $derived.by(() =>
    ensureBuffIconOverrides(SETTINGS.skillMonitor.state.buffIconOverrides),
  );

  // Reverse so that the fatal hit (0s) sits at the top and older hits descend (-0.2s, -0.5s, ...).
  const rows = $derived.by<DamageSnapshot[]>(() =>
    [...(record.recentDamages ?? [])].slice().reverse(),
  );
  const victimBuffs = $derived(record.victimBuffs ?? []);
  const participantBuffs = $derived(record.participantBuffs ?? []);
  const participantDisplay = $derived.by(() => {
    const cards: Array<{
      title: string;
      buffs: DeathBuffSnapshot[];
    }> = [
      {
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

    for (const participant of participantBuffs) {
      const title = resolveParticipantTitle(
        participant,
        monsterNameCounts,
        monsterNameIndexes,
      );
      cards.push({
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
    buffSnapshotCards.length > 1 ||
      (buffSnapshotCards[0]?.buffs.length ?? 0) > 0,
  );
  const buffSnapshotCount = $derived(buffSnapshotCards.length);
  const deathIdentity = $derived(
    `${record.victimEntityUuid}:${record.deathTimestampMs}`,
  );
  let buffSnapshotsOpen = $state(false);

  $effect(() => {
    void deathIdentity;
    buffSnapshotsOpen = false;
  });

  const maxValue = $derived.by(() => {
    let maxV = 0n;
    for (const damage of record.recentDamages ?? []) {
      const value = ipcBigInt(damage.value);
      if (value > maxV) maxV = value;
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
      ipcNumber(snapshot.timestampMs) - ipcNumber(record.deathTimestampMs);
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
    const skillKey = ipcNumber(snapshot.skillKey);
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

  function glowPercentage(value: unknown): number {
    return ipcRatio(value, maxValue, 100);
  }

  function resolveBuffName(buff: DeathBuffSnapshot): string {
    const baseId = Number(buff.baseId);
    const name = resolveBuffDisplayName(baseId, buffAliases);
    return name === `#${baseId}` ? String(baseId) : name;
  }

  /** Fully-resolved icon src: player override > game sprite > null. */
  function resolveBuffIcon(buff: DeathBuffSnapshot): string | null {
    const baseId = Number(buff.baseId);
    return resolveBuffIconSrc(
      baseId,
      lookupBuffMeta(baseId)?.spriteFile,
      buffIconOverrides,
      buffIconDirUrlPrefix(),
    );
  }

  function resolveBuffTooltip(buff: DeathBuffSnapshot): string {
    return `${buff.baseId}: ${resolveBuffName(buff)}`;
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

  function isLabelColumn(key: string): boolean {
    return key === "skill" || key === "source";
  }

  function isNumericColumn(key: string): boolean {
    return key === "damage" || key === "share";
  }
</script>

{#snippet buffSnapshotCard(title: string, buffs: DeathBuffSnapshot[])}
  <section class="min-w-0 rounded border border-border/50 p-2">
    <div class="mb-2 truncate text-xs font-medium text-foreground">
      {title}
    </div>
    {#if buffs.length === 0}
      <div class="text-xs text-muted-foreground/70">
        {t("components.deathReplay.buff.none")}
      </div>
    {:else}
      <div class="flex flex-wrap gap-1.5">
        {#each buffs as buff, idx (idx)}
          {@const icon = resolveBuffIcon(buff)}
          <div
            class="flex max-w-44 items-center gap-1.5 rounded border border-border/50 bg-card/70 px-1.5 py-1 text-xs text-muted-foreground"
            {@attach tooltip(() => resolveBuffTooltip(buff))}
          >
            {#if icon}
              <img
                class="size-4 shrink-0 rounded-sm object-contain"
                src={icon}
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
    <div class="mt-2 rounded border border-border/50 bg-card/20">
      <button
        type="button"
        class="flex w-full items-center justify-between px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        aria-expanded={buffSnapshotsOpen}
        onclick={() => (buffSnapshotsOpen = !buffSnapshotsOpen)}
      >
        <span>
          {t("components.deathReplay.buff.toggle", {
            count: formatNumber(buffSnapshotCount),
          })}
        </span>
        <ChevronDown
          class="size-4 shrink-0 transition-transform duration-200 {buffSnapshotsOpen
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if buffSnapshotsOpen}
        <div class="grid grid-cols-1 gap-2 border-t border-border/40 p-2">
          {#each buffSnapshotCards as card, idx (idx)}
            {@render buffSnapshotCard(card.title, card.buffs)}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet columnValue(
  key: (typeof deathReplayColumns)[number]["key"],
  dmg: DamageSnapshot,
  pct: number,
  compact: boolean,
)}
  {#if key === "time"}
    {formatRelativeSeconds(dmg)}
  {:else if key === "skill"}
    {resolveSkillName(dmg)}
  {:else if key === "source"}
    {resolveAttackerName(dmg) || "-"}
  {:else if key === "damage"}
    {#if shortenTps}
      <AbbreviatedNumber
        num={ipcNumber(dmg.value)}
        decimalPlaces={abbreviatedDecimalPlaces}
        {abbreviationStyle}
        suffixFontSize={compact
          ? tableSettings.skillAbbreviatedFontSize
          : undefined}
        suffixColor={compact
          ? customThemeColors.tableAbbreviatedColor
          : undefined}
      />
    {:else}
      {formatNumber(ipcNumber(dmg.value))}
    {/if}
  {:else if key === "share"}
    {formatNumber(pct, { maximumFractionDigits: 0 })}%
  {:else if key === "property"}
    {propertyLabel(dmg.property)}
  {:else if key === "damageMode"}
    {damageModeLabel(dmg.damageMode)}
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
          time: formatAbsoluteTime(ipcNumber(record.deathTimestampMs)),
        })}
      </span>
      <span class="text-sm text-neutral-400">
        {t("components.deathReplay.hitCountText", {
          count: formatNumber(rows.length),
        })}
      </span>
    </div>
  </div>

  <div class="overflow-x-auto rounded border border-border/60 bg-card/30">
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-popover/60">
          {#each visibleColumns as col (col.key)}
            <th
              class="text-muted-foreground px-3 py-3 text-xs font-medium tracking-wider uppercase {isLabelColumn(
                col.key,
              )
                ? 'text-left'
                : 'text-right'}"
              >{col.header}</th
            >
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if rows.length === 0}
          <tr>
            <td
              colspan={Math.max(visibleColumns.length, 1)}
              class="px-3 py-8 text-center text-xs text-muted-foreground"
            >
              {t("components.deathReplay.noDamageSnapshots")}
            </td>
          </tr>
        {:else}
          {#each rows as dmg, idx (idx)}
            {@const pct = glowPercentage(dmg.value)}
            <tr
              class="relative border-t border-border/40 hover:bg-muted/60 transition-colors"
            >
              {#each visibleColumns as col (col.key)}
                <td
                  class="text-muted-foreground relative z-10 px-3 py-3 text-sm {isLabelColumn(
                    col.key,
                  )
                    ? 'truncate'
                    : 'text-right tabular-nums'}"
                  {@attach col.key === "skill"
                    ? tooltip(() => resolveDamageTooltip(dmg))
                    : col.key === "source"
                      ? tooltip(() => resolveAttackerName(dmg))
                      : col.key === "damage"
                        ? tooltip(() => formatNumber(ipcNumber(dmg.value)))
                        : () => {}}
                >
                  {@render columnValue(col.key, dmg, pct, false)}
                </td>
              {/each}
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
            {@const pct = glowPercentage(dmg.value)}
            <tr
              class="relative hover:bg-muted/60 transition-colors"
              style="height: {tableSettings.skillRowHeight}px; font-size: {tableSettings.skillFontSize}px;"
            >
              <td
                class="px-2 py-1 relative z-10"
                style="color: {customThemeColors.tableTextColor};"
              >
                <div class="flex items-center h-full gap-2">
                  {#each liveRenderItems as item (item.kind === "identity" ? "identity" : item.key)}
                    {#if item.kind === "identity"}
                      <span
                        class="flex-1 min-w-0"
                        {@attach tooltip(() => resolveDamageTooltip(dmg))}
                      >
                        <span class="block truncate"
                          >{resolveSkillName(dmg)}</span
                        >
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
                    {:else if item.key === "time"}
                      <span
                        class="tabular-nums font-semibold text-muted-foreground shrink-0 w-14"
                      >
                        {@render columnValue(item.key, dmg, pct, true)}
                      </span>
                    {:else if item.key === "skill"}
                      <span
                        class="flex-1 min-w-0 truncate"
                        {@attach tooltip(() => resolveDamageTooltip(dmg))}
                      >
                        {@render columnValue(item.key, dmg, pct, true)}
                      </span>
                    {:else if item.key === "source"}
                      <span
                        class="min-w-0 max-w-28 truncate text-[0.85em] text-muted-foreground/80"
                        {@attach tooltip(() => resolveAttackerName(dmg))}
                      >
                        {@render columnValue(item.key, dmg, pct, true)}
                      </span>
                    {:else if item.key === "damage"}
                      <span
                        class="tabular-nums font-medium shrink-0"
                        {@attach tooltip(() =>
                          formatNumber(ipcNumber(dmg.value)),
                        )}
                      >
                        {@render columnValue(item.key, dmg, pct, true)}
                      </span>
                    {:else}
                      <span
                        class="shrink-0 {isNumericColumn(item.key)
                          ? 'tabular-nums'
                          : ''}"
                      >
                        {@render columnValue(item.key, dmg, pct, true)}
                      </span>
                    {/if}
                  {/each}
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

{@render buffSnapshotsPanel()}
