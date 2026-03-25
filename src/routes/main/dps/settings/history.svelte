<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { tl } from "$lib/i18n/index.svelte";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import { historyDpsPlayerColumns, historyDpsSkillColumns, historyHealPlayerColumns, historyHealSkillColumns, historyTankedPlayerColumns, historyTankedSkillColumns } from "$lib/column-data";
  import { SETTINGS } from "$lib/settings-store";
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
</script>

<Tabs.Content value={SETTINGS_CATEGORY}>
  <div class="space-y-3">
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('general')}
      >
        <h2 class="text-base font-semibold text-foreground">{tl("General Settings")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.general ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.general}
        <div class="px-4 pb-3 space-y-1">
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showYourName}
            values={[
              { label: tl("Show Your Name"), value: "Show Your Name" },
              { label: tl("Show Your Class"), value: "Show Your Class" },
              { label: tl("Show Your Name - Class"), value: "Show Your Name - Class" },
              { label: tl("Show Your Name - Spec"), value: "Show Your Name - Spec" },
              { label: tl("Hide Your Name"), value: "Hide Your Name" },
            ]}
            label={tl("Show Your Name")}
            description={tl("\"Show Your Class\" replaces your name with your class; \"Name - Class/Spec\" shows both.")}
          />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showOthersName}
            values={[
              { label: tl("Show Others' Name"), value: "Show Others' Name" },
              { label: tl("Show Others' Class"), value: "Show Others' Class" },
              { label: tl("Show Others' Name - Class"), value: "Show Others' Name - Class" },
              { label: tl("Show Others' Name - Spec"), value: "Show Others' Name - Spec" },
              { label: tl("Hide Others' Name"), value: "Hide Others' Name" },
            ]}
            label={tl("Show Others' Name")}
            description={tl("\"Show Others' Class\" replaces the player's name with class; \"Name - Class/Spec\" shows both.")}
          />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourAbilityScore} label={tl("Your Ability Score")} description={tl("Show your ability score")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersAbilityScore} label={tl("Others' Ability Score")} description={tl("Show other players' ability score")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourSeasonStrength} label={tl("Your Season Strength")} description={tl("Show your season strength")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersSeasonStrength} label={tl("Others' Season Strength")} description={tl("Show other players' season strength")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSPlayer} label={tl("Scale to Highest DPS (Players)")} description={tl("Scale bars relative to the highest DPS player instead of the full roster. Useful for 20-player or world boss fights.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSSkill} label={tl("Scale to Highest DPS (Skills)")} description={tl("Scale bars relative to the highest DPS skill instead of all skills. Useful for 20-player or world boss fights.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealPlayer} label={tl("Scale to Highest Heal (Players)")} description={tl("Scale bars relative to the highest healing player instead of the full roster. Useful for 20-player or world boss fights.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealSkill} label={tl("Scale to Highest Heal (Skills)")} description={tl("Scale bars relative to the highest healing skill instead of all skills. Useful for 20-player or world boss fights.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedPlayer} label={tl("Scale to Highest Damage Taken (Players)")} description={tl("Scale bars relative to the highest damage-taken player instead of the full roster. Useful for 20-player or world boss fights.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedSkill} label={tl("Scale to Highest Damage Taken (Skills)")} description={tl("Scale bars relative to the highest damage-taken skill instead of all skills. Useful for 20-player or world boss fights.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenTps} label={tl("Abbreviate TPS Values")} description={tl("Show TPS as 5k, 50k, etc.")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenAbilityScore} label={tl("Abbreviate Ability Score")} description={tl("Show ability score in abbreviated form")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenDps} label={tl("Abbreviate DPS Values")} description={tl("Show DPS as 5k, 50k, etc.")} />
        </div>
      {/if}
    </div>

    <!-- DPS - Player Settings -->
  <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
  class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('dpsPlayers')}
      >
  <h2 class="text-base font-semibold text-foreground">{tl("DPS (Players) Columns")}</h2>
  <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsPlayers ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.dpsPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyDpsPlayerColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.dps.players.state[col.key]} label={col.label} description={col.description} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- DPS - Skill Breakdown Settings -->
  <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
  class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('dpsSkills')}
      >
  <h2 class="text-base font-semibold text-foreground">{tl("DPS (Skills) Columns")}</h2>
  <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsSkills ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.dpsSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyDpsSkillColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.dps.skillBreakdown.state[col.key]} label={col.label} description={col.description} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Player Settings -->
  <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
  class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('healPlayers')}
      >
  <h2 class="text-base font-semibold text-foreground">{tl("Healing (Players) Columns")}</h2>
  <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healPlayers ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.healPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyHealPlayerColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.heal.players.state[col.key]} label={col.label} description={col.description} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Skill Breakdown Settings -->
  <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
  class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('healSkills')}
      >
  <h2 class="text-base font-semibold text-foreground">{tl("Healing (Skills) Columns")}</h2>
  <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healSkills ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.healSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyHealSkillColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.heal.skillBreakdown.state[col.key]} label={col.label} description={col.description} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tanked - Player Settings -->
  <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
  class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('tankedPlayers')}
      >
  <h2 class="text-base font-semibold text-foreground">{tl("Damage Taken (Players) Columns")}</h2>
  <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedPlayers ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.tankedPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyTankedPlayerColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.tanked.players.state[col.key]} label={col.label} description={col.description} />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tanked - Skill Breakdown Settings -->
  <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
  class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('tankedSkills')}
      >
  <h2 class="text-base font-semibold text-foreground">{tl("Damage Taken (Skills) Columns")}</h2>
  <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedSkills ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.tankedSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyTankedSkillColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.tanked.skillBreakdown.state[col.key]} label={col.label} description={col.description} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Tabs.Content>
