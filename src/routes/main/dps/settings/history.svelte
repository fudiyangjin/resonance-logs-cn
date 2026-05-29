<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import {
    historyDpsPlayerColumns,
    historyDpsSkillColumns,
    historyHealPlayerColumns,
    historyHealSkillColumns,
    historyTankedPlayerColumns,
    historyTankedSkillColumns,
  } from "$lib/column-data";
  import {
    SETTINGS,
    DEFAULT_HISTORY_TANKED_STATS,
    DEFAULT_HISTORY_TANKED_SKILL_STATS,
  } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import ChevronDown from "virtual:icons/lucide/chevron-down";

  const SETTINGS_CATEGORY = "history";

  // Collapsible section state - all collapsed by default
  let expandedSections = $state({
    general: false,
    dpsPlayers: false,
    dpsSkills: false,
    healPlayers: false,
    healSkills: false,
    tankedPlayers: false,
    tankedSkills: false,
  });

  function toggleSection(section: keyof typeof expandedSections) {
    expandedSections[section] = !expandedSections[section];
  }

  $effect(() => {
    for (const key of Object.keys(DEFAULT_HISTORY_TANKED_STATS)) {
      const typedKey = key as keyof typeof DEFAULT_HISTORY_TANKED_STATS;
      SETTINGS.history.tanked.players.state[typedKey] ??=
        DEFAULT_HISTORY_TANKED_STATS[typedKey];
    }
    for (const key of Object.keys(DEFAULT_HISTORY_TANKED_SKILL_STATS)) {
      const typedKey = key as keyof typeof DEFAULT_HISTORY_TANKED_SKILL_STATS;
      SETTINGS.history.tanked.skillBreakdown.state[typedKey] ??=
        DEFAULT_HISTORY_TANKED_SKILL_STATS[typedKey];
    }
  });
</script>

<Tabs.Content value={SETTINGS_CATEGORY}>
  <div class="space-y-3">
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("general")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.general")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.general
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.general}
        <div class="px-4 pb-3 space-y-1">
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showYourName}
            values={[
              {
                label: t("settings.common.name.option.yourName"),
                value: "Show Your Name",
              },
              {
                label: t("settings.common.name.option.yourClass"),
                value: "Show Your Class",
              },
              {
                label: t("settings.common.name.option.yourNameClass"),
                value: "Show Your Name - Class",
              },
              {
                label: t("settings.common.name.option.yourNameSpec"),
                value: "Show Your Name - Spec",
              },
              {
                label: t("settings.common.name.option.hideYourName"),
                value: "Hide Your Name",
              },
            ]}
            label={t("settings.common.name.your")}
            description={t("settings.common.name.yourDescription")}
          />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showOthersName}
            values={[
              {
                label: t("settings.common.name.option.othersName"),
                value: "Show Others' Name",
              },
              {
                label: t("settings.common.name.option.othersClass"),
                value: "Show Others' Class",
              },
              {
                label: t("settings.common.name.option.othersNameClass"),
                value: "Show Others' Name - Class",
              },
              {
                label: t("settings.common.name.option.othersNameSpec"),
                value: "Show Others' Name - Spec",
              },
              {
                label: t("settings.common.name.option.hideOthersName"),
                value: "Hide Others' Name",
              },
            ]}
            label={t("settings.common.name.others")}
            description={t("settings.common.name.othersDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.showYourAbilityScore}
            label={t("settings.common.ability.your")}
            description={t("settings.common.ability.yourDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.showOthersAbilityScore}
            label={t("settings.common.ability.others")}
            description={t("settings.common.ability.othersDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.showYourSeasonStrength}
            label={t("settings.common.seasonStrength.your")}
            description={t("settings.common.seasonStrength.yourDescription")}
          />
          <SettingsSwitch
            bind:checked={
              SETTINGS.history.general.state.showOthersSeasonStrength
            }
            label={t("settings.common.seasonStrength.others")}
            description={t("settings.common.seasonStrength.othersDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.relativeToTopDPSPlayer}
            label={t("settings.common.relative.dpsPlayer")}
            description={t("settings.common.relative.dpsPlayerDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.relativeToTopDPSSkill}
            label={t("settings.common.relative.dpsSkill")}
            description={t("settings.common.relative.dpsSkillDescription")}
          />
          <SettingsSwitch
            bind:checked={
              SETTINGS.history.general.state.relativeToTopHealPlayer
            }
            label={t("settings.common.relative.healPlayer")}
            description={t("settings.common.relative.healPlayerDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.relativeToTopHealSkill}
            label={t("settings.common.relative.healSkill")}
            description={t("settings.common.relative.healSkillDescription")}
          />
          <SettingsSwitch
            bind:checked={
              SETTINGS.history.general.state.relativeToTopTankedPlayer
            }
            label={t("settings.common.relative.tankedPlayer")}
            description={t("settings.common.relative.tankedPlayerDescription")}
          />
          <SettingsSwitch
            bind:checked={
              SETTINGS.history.general.state.relativeToTopTankedSkill
            }
            label={t("settings.common.relative.tankedSkill")}
            description={t("settings.common.relative.tankedSkillDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.shortenTps}
            label={t("settings.common.shorten.tps")}
            description={t("settings.common.shorten.tpsDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.shortenAbilityScore}
            label={t("settings.common.shorten.abilityScore")}
            description={t("settings.common.shorten.abilityScoreDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.history.general.state.shortenDps}
            label={t("settings.common.shorten.dps")}
            description={t("settings.common.shorten.dpsDescription")}
          />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.abbreviationStyle}
            label={t("settings.common.abbreviationStyle")}
            description={t("settings.common.abbreviationStyleDescription")}
            values={[
              {
                label: t("settings.common.abbreviationStyle.western"),
                value: "western",
              },
              { label: t("settings.common.abbreviationStyle.cn"), value: "cn" },
            ]}
          />
          <SettingsSelect
            bind:selected={
              SETTINGS.history.general.state.abbreviatedDecimalPlaces
            }
            label={t("settings.common.decimalPlaces")}
            description={t("settings.common.decimalPlacesDescription")}
            values={[
              { label: t("settings.common.decimalPlaces.1"), value: 1 },
              { label: t("settings.common.decimalPlaces.2"), value: 2 },
              { label: t("settings.common.decimalPlaces.3"), value: 3 },
              { label: t("settings.common.decimalPlaces.4"), value: 4 },
            ]}
          />
        </div>
      {/if}
    </div>

    <!-- DPS - Player Settings -->
    <div
      class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection("dpsPlayers")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.columns.dpsPlayers")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.dpsPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyDpsPlayerColumns as col (col.key)}
            <SettingsSwitch
              bind:checked={SETTINGS.history.dps.players.state[col.key]}
              label={col.label}
              description={col.description}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- DPS - Skill Breakdown Settings -->
    <div
      class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection("dpsSkills")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.columns.dpsSkills")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.dpsSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyDpsSkillColumns as col (col.key)}
            <SettingsSwitch
              bind:checked={SETTINGS.history.dps.skillBreakdown.state[col.key]}
              label={col.label}
              description={col.description}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Player Settings -->
    <div
      class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection("healPlayers")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.columns.healPlayers")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.healPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyHealPlayerColumns as col (col.key)}
            <SettingsSwitch
              bind:checked={SETTINGS.history.heal.players.state[col.key]}
              label={col.label}
              description={col.description}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Skill Breakdown Settings -->
    <div
      class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection("healSkills")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.columns.healSkills")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.healSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyHealSkillColumns as col (col.key)}
            <SettingsSwitch
              bind:checked={SETTINGS.history.heal.skillBreakdown.state[col.key]}
              label={col.label}
              description={col.description}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tanked - Player Settings -->
    <div
      class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection("tankedPlayers")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.columns.tankedPlayers")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.tankedPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyTankedPlayerColumns as col (col.key)}
            {@const key = col.key as keyof typeof DEFAULT_HISTORY_TANKED_STATS}
            <SettingsSwitch
              bind:checked={SETTINGS.history.tanked.players.state[key]}
              label={col.label}
              description={col.description}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tanked - Skill Breakdown Settings -->
    <div
      class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection("tankedSkills")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {t("settings.common.columns.tankedSkills")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.tankedSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyTankedSkillColumns as col (col.key)}
            {@const key = col.key as keyof typeof DEFAULT_HISTORY_TANKED_SKILL_STATS}
            <SettingsSwitch
              bind:checked={
                SETTINGS.history.tanked.skillBreakdown.state[key]
              }
              label={col.label}
              description={col.description}
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Tabs.Content>
