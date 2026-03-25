<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import SettingsSlider from "./settings-slider.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { tl } from "$lib/i18n/index.svelte";
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import {
    liveDpsPlayerColumns,
    liveDpsSkillColumns,
    liveHealPlayerColumns,
    liveHealSkillColumns,
    liveTankedPlayerColumns,
    liveTankedSkillColumns,
  } from "$lib/column-data";

  const SETTINGS_CATEGORY = "live";
  // Collapsible section state - all collapsed by default
  let expandedSections = $state({
    general: false,
    trainingDummy: false,
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
  // Drag state for column reordering (unused - keeping for potential future use)
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
          {tl("General Settings")}
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
            bind:selected={SETTINGS.live.general.state.showYourName}
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
            bind:selected={SETTINGS.live.general.state.showOthersName}
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
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showYourAbilityScore}
            label={tl("Your Ability Score")}
            description={tl("Show your ability score")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showOthersAbilityScore}
            label={tl("Others' Ability Score")}
            description={tl("Show other players' ability score")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showYourSeasonStrength}
            label={tl("Your Season Strength")}
            description={tl("Show your season strength")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showOthersSeasonStrength}
            label={tl("Others' Season Strength")}
            description={tl("Show other players' season strength")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopDPSPlayer}
            label={tl("Scale to Highest DPS (Players)")}
            description={tl("Scale bars relative to the highest DPS player instead of the full roster. Useful for 20-player or world boss fights.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopDPSSkill}
            label={tl("Scale to Highest DPS (Skills)")}
            description={tl("Scale bars relative to the highest DPS skill instead of all skills. Useful for 20-player or world boss fights.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopHealPlayer}
            label={tl("Scale to Highest Heal (Players)")}
            description={tl("Scale bars relative to the highest healing player instead of the full roster. Useful for 20-player or world boss fights.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopHealSkill}
            label={tl("Scale to Highest Heal (Skills)")}
            description={tl("Scale bars relative to the highest healing skill instead of all skills. Useful for 20-player or world boss fights.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopTankedPlayer}
            label={tl("Scale to Highest Damage Taken (Players)")}
            description={tl("Scale bars relative to the highest damage-taken player instead of the full roster. Useful for 20-player or world boss fights.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopTankedSkill}
            label={tl("Scale to Highest Damage Taken (Skills)")}
            description={tl("Scale bars relative to the highest damage-taken skill instead of all skills. Useful for 20-player or world boss fights.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenTps}
            label={tl("Abbreviate TPS Values")}
            description={tl("Show TPS as 5k, 50k, etc.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenAbilityScore}
            label={tl("Abbreviate Ability Score")}
            description={tl("Show ability score in abbreviated form")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenDps}
            label={tl("Abbreviate DPS Values")}
            description={tl("Show DPS as 5k, 50k, etc.")}
          />
          <SettingsSlider
            bind:value={SETTINGS.live.general.state.eventUpdateRateMs}
            label={tl("Refresh Rate")}
            description={tl("Live meter refresh interval (50-2000ms). Lower is smoother but uses more CPU.")}
            min={50}
            max={2000}
            step={50}
            unit="ms"
          />
        </div>
      {/if}
    </div>

    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("trainingDummy")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("Training Dummy Mode")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.trainingDummy
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.trainingDummy}
        <div class="px-4 pb-3 space-y-1">
          <SettingsSelect
            bind:selected={SETTINGS.trainingDummy.state.defaultMonsterId}
            values={[
              { label: tl("Elite Enemy Dummy"), value: 115 },
              { label: tl("Elite Guardian Dummy"), value: 122 },
            ]}
            label={tl("Default Dummy Target")}
            description={tl("The header training dummy button uses this target directly.")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.trainingDummy.state.showHeaderControl}
            label={tl("Show Header Dummy Button")}
            description={tl("Show the training dummy toggle and status in the live window header.")}
          />
        </div>
      {/if}
    </div>

    <!-- DPS - Player Settings -->
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("dpsPlayers")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("DPS (Players) Columns")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.dpsPlayers}
        <div class="px-4 pb-3 space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            {tl("Use the arrows to reorder columns and switches to show or hide them.")}
          </p>
          {#each SETTINGS.live.columnOrder.dpsPlayers.state.order as colKey, idx (colKey)}
            {@const col = liveDpsPlayerColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 border border-border/30"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.dpsPlayers.state.order,
                      ];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.dpsPlayers.state.order = arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx ===
                      SETTINGS.live.columnOrder.dpsPlayers.state.order.length -
                        1}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.dpsPlayers.state.order,
                      ];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.dpsPlayers.state.order = arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.dps.players.state[
                      col.key as keyof typeof SETTINGS.live.dps.players.state
                    ]
                  }
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- DPS - Skill Breakdown Settings -->
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("dpsSkills")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("DPS (Skills) Columns")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.dpsSkills}
        <div class="px-4 pb-3 space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            {tl("Use the arrows to reorder columns and switches to show or hide them.")}
          </p>
          {#each SETTINGS.live.columnOrder.dpsSkills.state.order as colKey, idx (colKey)}
            {@const col = liveDpsSkillColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 border border-border/30"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.dpsSkills.state.order,
                      ];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.dpsSkills.state.order = arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx ===
                      SETTINGS.live.columnOrder.dpsSkills.state.order.length -
                        1}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.dpsSkills.state.order,
                      ];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.dpsSkills.state.order = arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.dps.skillBreakdown.state[
                      col.key as keyof typeof SETTINGS.live.dps.skillBreakdown.state
                    ]
                  }
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Player Settings -->
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("healPlayers")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("Healing (Players) Columns")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.healPlayers}
        <div class="px-4 pb-3 space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            {tl("Use the arrows to reorder columns and switches to show or hide them.")}
          </p>
          {#each SETTINGS.live.columnOrder.healPlayers.state.order as colKey, idx (colKey)}
            {@const col = liveHealPlayerColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 border border-border/30"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.healPlayers.state.order,
                      ];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.healPlayers.state.order = arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx ===
                      SETTINGS.live.columnOrder.healPlayers.state.order.length -
                        1}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.healPlayers.state.order,
                      ];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.healPlayers.state.order = arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.heal.players.state[
                      col.key as keyof typeof SETTINGS.live.heal.players.state
                    ]
                  }
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Skill Breakdown Settings -->
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("healSkills")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("Healing (Skills) Columns")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.healSkills}
        <div class="px-4 pb-3 space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            {tl("Use the arrows to reorder columns and switches to show or hide them.")}
          </p>
          {#each SETTINGS.live.columnOrder.healSkills.state.order as colKey, idx (colKey)}
            {@const col = liveHealSkillColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 border border-border/30"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.healSkills.state.order,
                      ];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.healSkills.state.order = arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx ===
                      SETTINGS.live.columnOrder.healSkills.state.order.length -
                        1}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.healSkills.state.order,
                      ];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.healSkills.state.order = arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.heal.skillBreakdown.state[
                      col.key as keyof typeof SETTINGS.live.heal.skillBreakdown.state
                    ]
                  }
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tanked - Player Settings -->
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("tankedPlayers")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("Damage Taken (Players) Columns")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.tankedPlayers}
        <div class="px-4 pb-3 space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            {tl("Use the arrows to reorder columns and switches to show or hide them.")}
          </p>
          {#each SETTINGS.live.columnOrder.tankedPlayers.state.order as colKey, idx (colKey)}
            {@const col = liveTankedPlayerColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 border border-border/30"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.tankedPlayers.state.order,
                      ];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.tankedPlayers.state.order =
                          arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx ===
                      SETTINGS.live.columnOrder.tankedPlayers.state.order
                        .length -
                        1}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.tankedPlayers.state.order,
                      ];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.tankedPlayers.state.order =
                          arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.tanked.players.state[
                      col.key as keyof typeof SETTINGS.live.tanked.players.state
                    ]
                  }
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tanked - Skill Breakdown Settings -->
    <div
      class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onclick={() => toggleSection("tankedSkills")}
      >
        <h2 class="text-base font-semibold text-foreground">
          {tl("Damage Taken (Skills) Columns")}
        </h2>
        <ChevronDown
          class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.tankedSkills}
        <div class="px-4 pb-3 space-y-1">
          <p class="text-xs text-muted-foreground mb-2">
            {tl("Use the arrows to reorder columns and switches to show or hide them.")}
          </p>
          {#each SETTINGS.live.columnOrder.tankedSkills.state.order as colKey, idx (colKey)}
            {@const col = liveTankedSkillColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 border border-border/30"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.tankedSkills.state.order,
                      ];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.tankedSkills.state.order =
                          arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="text-xs px-1 hover:bg-muted/50 rounded disabled:opacity-30"
                    disabled={idx ===
                      SETTINGS.live.columnOrder.tankedSkills.state.order
                        .length -
                        1}
                    onclick={() => {
                      const arr = [
                        ...SETTINGS.live.columnOrder.tankedSkills.state.order,
                      ];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.tankedSkills.state.order =
                          arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={
                    SETTINGS.live.tanked.skills.state[
                      col.key as keyof typeof SETTINGS.live.tanked.skills.state
                    ]
                  }
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Tabs.Content>
