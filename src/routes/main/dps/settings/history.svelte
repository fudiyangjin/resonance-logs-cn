<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import { historyDpsPlayerColumns, historyDpsSkillColumns, historyHealPlayerColumns, historyHealSkillColumns, historyTankedPlayerColumns, historyTankedSkillColumns } from "$lib/column-data";
  import { SETTINGS } from "$lib/settings-store";
  import ChevronDown from "virtual:icons/lucide/chevron-down";

  const SETTINGS_CATEGORY = "history";

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
        <h2 class="text-base font-semibold text-foreground">General Settings</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.general ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.general}
        <div class="px-4 pb-3 space-y-1">
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showYourName}
            values={[
              { label: "Show Your Name", value: "Show Your Name" },
              { label: "Show Your Class", value: "Show Your Class" },
              { label: "Show Your Name - Class", value: "Show Your Name - Class" },
              { label: "Show Your Name - Spec", value: "Show Your Name - Spec" },
              { label: "Hide Your Name", value: "Hide Your Name" },
            ]}
            label="Show Your Name"
            description="&quot;Show Class&quot; replaces your name with your class; &quot;Name - Class/Spec&quot; shows both."
          />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showOthersName}
            values={[
              { label: "Show Others' Name", value: "Show Others' Name" },
              { label: "Show Others' Class", value: "Show Others' Class" },
              { label: "Show Others' Name - Class", value: "Show Others' Name - Class" },
              { label: "Show Others' Name - Spec", value: "Show Others' Name - Spec" },
              { label: "Hide Others' Name", value: "Hide Others' Name" },
            ]}
            label="Show Others' Name"
            description="&quot;Show Class&quot; replaces others' names with their class; &quot;Name - Class/Spec&quot; shows both."
          />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourAbilityScore} label="Your Ability Score" description="Show your ability score" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersAbilityScore} label="Others' Ability Score" description="Show others' ability scores" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourSeasonStrength} label="Your Season Strength" description="Show your season strength" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersSeasonStrength} label="Others' Season Strength" description="Show others' season strength" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSPlayer} label="Relative to Top DPS (Players)" description="Color bars scale relative to the top DPS player, not all players. Useful for 20-player or World Boss fights." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSSkill} label="Relative to Top DPS (Skills)" description="Color bars scale relative to the top DPS skill, not all skills. Useful for 20-player or World Boss fights." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealPlayer} label="Relative to Top Heal (Players)" description="Color bars scale relative to the top heal player, not all players. Useful for 20-player or World Boss fights." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealSkill} label="Relative to Top Heal (Skills)" description="Color bars scale relative to the top heal skill, not all skills. Useful for 20-player or World Boss fights." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedPlayer} label="Relative to Top Tanked (Players)" description="Color bars scale relative to the top tanked player, not all players. Useful for 20-player or World Boss fights." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedSkill} label="Relative to Top Tanked (Skills)" description="Color bars scale relative to the top tanked skill, not all skills. Useful for 20-player or World Boss fights." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenTps} label="Abbreviate TPS Values" description="Display TPS as 5k, 50k, etc." />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenAbilityScore} label="Abbreviate Ability Score" description="Display ability score in abbreviated form" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenDps} label="Abbreviate DPS Values" description="Display DPS as 5k, 50k, etc." />
        </div>
      {/if}
    </div>

    <!-- DPS - Player Settings -->
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('dpsPlayers')}
      >
        <h2 class="text-base font-semibold text-foreground">DPS (Players) Columns</h2>
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
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('dpsSkills')}
      >
        <h2 class="text-base font-semibold text-foreground">DPS (Skill Breakdown) Columns</h2>
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
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('healPlayers')}
      >
        <h2 class="text-base font-semibold text-foreground">Heal (Players) Columns</h2>
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
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('healSkills')}
      >
        <h2 class="text-base font-semibold text-foreground">Heal (Skill Breakdown) Columns</h2>
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
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('tankedPlayers')}
      >
        <h2 class="text-base font-semibold text-foreground">Tanked (Players) Columns</h2>
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
    <div class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection('tankedSkills')}
      >
        <h2 class="text-base font-semibold text-foreground">Tanked (Skill Breakdown) Columns</h2>
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
