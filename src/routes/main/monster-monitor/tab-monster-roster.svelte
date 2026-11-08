<script lang="ts">
  import { onMount } from "svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import IdSearchResultGrid, {
    type IdSearchResultItem,
  } from "$lib/components/IdSearchResultGrid.svelte";
  import {
    commands,
    type RecentRosterMonster,
    type RosterMonsterKind,
  } from "$lib/bindings";
  import {
    resolveMonsterName,
    resolveMonsterType,
    resolveSceneName,
  } from "$lib/config/game-names";
  import { searchMonsters } from "$lib/config/monster-search";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import {
    isRosterPresetBlock,
    MAX_ROSTER_NORMAL_ROWS,
    MAX_ROSTER_PANEL_WIDTH,
    MIN_ROSTER_PANEL_WIDTH,
  } from "$lib/monster-roster-settings";
  import { abbreviateNumber } from "$lib/number-format";
  import {
    SETTINGS,
    type MonsterRosterOptions,
    type RosterPanelStyle,
  } from "$lib/settings-store";
  import type { RosterSkillEntryPatch } from "$lib/roster-skill-entries";
  import type { RosterSkillEntry } from "$lib/settings-store";
  import PanelStyleSection from "./panel-style-section.svelte";
  import RosterSkillWatch from "./roster-skill-watch.svelte";

  interface Props {
    options: MonsterRosterOptions;
    updateOptions: (patch: Partial<MonsterRosterOptions>) => void;
    panelStyle: RosterPanelStyle;
    updatePanelStyle: <K extends keyof RosterPanelStyle>(
      key: K,
      value: RosterPanelStyle[K],
    ) => void;
    /** The player's own blocks; the developer presets are never shown. */
    blockedIds: number[];
    onBlock: (monsterId: number) => void;
    onUnblock: (monsterId: number) => void;
    skillEntries: RosterSkillEntry[];
    onAddSkill: (skillId: number) => void;
    onUpdateSkill: (skillId: number, patch: RosterSkillEntryPatch) => void;
    onMoveSkill: (skillId: number, direction: "up" | "down") => void;
    onRemoveSkill: (skillId: number) => void;
  }

  let {
    options,
    updateOptions,
    panelStyle,
    updatePanelStyle,
    blockedIds,
    onBlock,
    onUnblock,
    skillEntries,
    onAddSkill,
    onUpdateSkill,
    onMoveSkill,
    onRemoveSkill,
  }: Props = $props();

  // The slider writes the setting once, on release: every write persists the
  // whole settings file.
  let normalRowsDraft = $state<number | null>(null);
  let recent = $state.raw<RecentRosterMonster[]>([]);
  let searchKeyword = $state("");

  const blockedSet = $derived(new Set(blockedIds));
  const abbreviationStyle = $derived(
    SETTINGS.live.general.state.abbreviationStyle,
  );

  function kindOfType(monsterType: number | null): RosterMonsterKind {
    if (monsterType === 2) return "boss";
    if (monsterType === 1) return "elite";
    return "normal";
  }

  function kindLabel(kind: RosterMonsterKind): string {
    return t(`monsterOverlay.roster.kind.${kind}`);
  }

  // Presets are hidden anyway and stay out of the block lists.
  const recentItems = $derived(
    recent
      .filter((monster) => !isRosterPresetBlock(monster.monsterId))
      .map(
        (monster): IdSearchResultItem => ({
          key: String(monster.monsterId),
          name: resolveMonsterName(monster.monsterId),
          detail: [
            kindLabel(monster.kind),
            abbreviateNumber(monster.maxHp, 1, abbreviationStyle),
            monster.sceneId === null ? null : resolveSceneName(monster.sceneId),
          ]
            .filter((part) => part)
            .join(" · "),
        }),
      ),
  );

  const searchItems = $derived(
    searchMonsters(searchKeyword, getLocale())
      .filter((monster) => !isRosterPresetBlock(monster.monsterId))
      .map(
        (monster): IdSearchResultItem => ({
          key: String(monster.monsterId),
          name: monster.name ?? `#${monster.monsterId}`,
          detail: `#${monster.monsterId} · ${kindLabel(kindOfType(monster.monsterType))}`,
        }),
      ),
  );

  async function refreshRecent() {
    try {
      recent = await commands.getMonsterRosterRecent();
    } catch (error) {
      console.error("[monster-roster] recent monsters failed", error);
    }
  }

  onMount(() => {
    void refreshRecent();
  });

  const inputClass =
    "border-border bg-background focus:border-primary rounded-lg border px-3 py-2 text-sm outline-none";
</script>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.roster.displayTitle")}
    </h2>
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.roster.displayDescription")}
    </p>
  </div>

  <label class="style-field">
    <span>{t("monsterMonitor.roster.normalRows")}</span>
    <input
      type="range"
      min="0"
      max={MAX_ROSTER_NORMAL_ROWS}
      step="1"
      value={normalRowsDraft ?? options.normalRows}
      oninput={(event) =>
        (normalRowsDraft = Number.parseInt(event.currentTarget.value, 10))}
      onchange={(event) => {
        normalRowsDraft = null;
        updateOptions({
          normalRows: Number.parseInt(event.currentTarget.value, 10),
        });
      }}
    />
    <strong>{normalRowsDraft ?? options.normalRows}</strong>
    <small class="text-muted-foreground text-xs">
      {t("monsterMonitor.roster.normalRowsHint")}
    </small>
  </label>

  <div class="space-y-1">
    <SettingsSwitch
      label={t("monsterMonitor.roster.tankMode")}
      description={t("monsterMonitor.roster.tankModeDesc")}
      checked={options.tankMode}
      onCheckedChange={(checked) => updateOptions({ tankMode: checked })}
    />
    <SettingsSwitch
      label={t("monsterMonitor.roster.notAttackingMeFirst")}
      description={t("monsterMonitor.roster.notAttackingMeFirstDesc")}
      checked={options.notAttackingMeFirst}
      onCheckedChange={(checked) =>
        updateOptions({ notAttackingMeFirst: checked })}
    />
    <SettingsSwitch
      label={t("monsterMonitor.roster.showHpValue")}
      checked={options.showHpValue}
      onCheckedChange={(checked) => updateOptions({ showHpValue: checked })}
    />
    <SettingsSwitch
      label={t("monsterMonitor.roster.showDistance")}
      description={t("monsterMonitor.roster.showDistanceDesc")}
      checked={options.showDistance}
      onCheckedChange={(checked) => updateOptions({ showDistance: checked })}
    />
  </div>
</section>

<RosterSkillWatch
  entries={skillEntries}
  {recent}
  onRefresh={() => void refreshRecent()}
  onAdd={onAddSkill}
  onUpdate={onUpdateSkill}
  onMove={onMoveSkill}
  onRemove={onRemoveSkill}
/>

<section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
  <div class="space-y-1">
    <h2 class="text-foreground text-base font-semibold">
      {t("monsterMonitor.roster.blockTitle")}
    </h2>
    <p class="text-muted-foreground text-sm">
      {t("monsterMonitor.roster.blockDescription")}
    </p>
  </div>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("monsterMonitor.roster.blockedTitle")}
    </h3>
    {#if blockedIds.length === 0}
      <p class="text-muted-foreground text-sm">
        {t("monsterMonitor.roster.blockedEmpty")}
      </p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each blockedIds as monsterId (monsterId)}
          <button
            type="button"
            class="blocked-chip"
            title={t("monsterMonitor.roster.unblock")}
            onclick={() => onUnblock(monsterId)}
          >
            <span class="text-foreground">{resolveMonsterName(monsterId)}</span>
            <span class="text-muted-foreground text-xs">
              #{monsterId} · {kindLabel(
                kindOfType(resolveMonsterType(monsterId)),
              )}
            </span>
            <span class="text-muted-foreground" aria-hidden="true">×</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-foreground text-sm font-semibold">
        {t("monsterMonitor.roster.recentTitle")}
      </h3>
      <button
        type="button"
        class="refresh-button"
        onclick={() => void refreshRecent()}
      >
        {t("monsterMonitor.roster.refresh")}
      </button>
    </div>
    <p class="text-muted-foreground text-xs">
      {t("monsterMonitor.roster.recentDescription")}
    </p>
    <IdSearchResultGrid
      items={recentItems}
      onSelect={(key) => onBlock(Number(key))}
      isAdded={(key) => blockedSet.has(Number(key))}
      addedLabel={t("monsterMonitor.roster.blocked")}
      emptyMessage={t("monsterMonitor.roster.recentEmpty")}
    />
  </div>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("monsterMonitor.roster.searchTitle")}
    </h3>
    <input
      type="text"
      bind:value={searchKeyword}
      placeholder={t("monsterMonitor.roster.searchPlaceholder")}
      class="{inputClass} w-full py-2.5"
    />
    {#if searchKeyword.trim().length > 0}
      <IdSearchResultGrid
        items={searchItems}
        onSelect={(key) => onBlock(Number(key))}
        isAdded={(key) => blockedSet.has(Number(key))}
        addedLabel={t("monsterMonitor.roster.blocked")}
        emptyMessage={t("monsterMonitor.roster.searchEmpty")}
      />
    {/if}
  </div>
</section>

<PanelStyleSection
  titleKey="monsterMonitor.roster.styleTitle"
  {panelStyle}
  updatePanelStyle={(key, value) =>
    updatePanelStyle(key, value as RosterPanelStyle[typeof key])}
  schemePanel="roster"
>
  {#snippet extraFields()}
    <!-- Live like the section's other sliders, so the HUD previews it. -->
    <label class="style-field">
      <span>{t("monsterMonitor.roster.panelWidth")}</span>
      <input
        type="range"
        min={MIN_ROSTER_PANEL_WIDTH}
        max={MAX_ROSTER_PANEL_WIDTH}
        step="1"
        value={panelStyle.width}
        oninput={(event) =>
          updatePanelStyle(
            "width",
            Number.parseInt(event.currentTarget.value, 10),
          )}
      />
      <strong>{panelStyle.width}px</strong>
      <small class="text-muted-foreground text-xs">
        {t("monsterMonitor.roster.panelWidthHint")}
      </small>
    </label>
  {/snippet}
</PanelStyleSection>

<style>
  .style-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
  }

  .style-field strong {
    font-size: 12px;
    color: var(--muted-foreground, rgba(255, 255, 255, 0.72));
  }

  .blocked-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 4px 10px;
    font-size: 13px;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .blocked-chip:hover {
    border-color: rgba(248, 113, 113, 0.55);
    background: rgba(127, 29, 29, 0.24);
  }

  .refresh-button {
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 4px 10px;
    font-size: 12px;
    color: var(--foreground, #fff);
  }

  .refresh-button:hover {
    border-color: rgba(96, 165, 250, 0.65);
    background: rgba(30, 41, 59, 0.55);
  }
</style>
