<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import SettingsSlider from "./settings-slider.svelte";
  import SettingsInput from "./settings-input.svelte";
  import SettingsColumnLabel from "./settings-column-label.svelte";
  import {
    SETTINGS,
    DEFAULT_LIVE_TANKED_PLAYER_STATS,
    DEFAULT_LIVE_TANKED_SKILL_STATS,
    DEFAULT_DEATH_REPLAY_COLUMNS,
    DEFAULT_STATS,
    normalizeTankedPlayerColumnOrder,
    normalizeDpsSkillColumnOrder,
    normalizeHealSkillColumnOrder,
    normalizeTankedSkillColumnOrder,
    normalizeDeathReplayColumnOrder,
  } from "$lib/settings-store";
  import { untrack } from "svelte";
  import { t } from "$lib/i18n/index.svelte";
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import {
    liveDpsPlayerColumns,
    liveDpsSkillColumns,
    liveHealPlayerColumns,
    liveHealSkillColumns,
    liveTankedPlayerColumns,
    liveTankedSkillColumns,
    deathReplayColumns,
  } from "$lib/column-data";

  const SETTINGS_CATEGORY = "live";
  // Collapsible section state - all collapsed by default
  let expandedSections = $state({
    general: false,
    dpsPlayers: false,
    dpsSkills: false,
    healPlayers: false,
    healSkills: false,
    tankedPlayers: false,
    tankedSkills: false,
    deathReplay: false,
  });

  function toggleSection(section: keyof typeof expandedSections) {
    expandedSections[section] = !expandedSections[section];
  }

  const TRAINING_WINDOW_DEFAULT_SECONDS = 183;
  const TRAINING_WINDOW_MIN_SECONDS = 30;
  const TRAINING_WINDOW_MAX_SECONDS = 600;

  function trainingWindowSecondsFromStore(): number {
    return Math.round(SETTINGS.live.general.state.trainingWindowMs / 1000);
  }

  let trainingWindowDraft = $state(String(trainingWindowSecondsFromStore()));

  $effect(() => {
    const next = String(trainingWindowSecondsFromStore());
    if (untrack(() => trainingWindowDraft) !== next) {
      trainingWindowDraft = next;
    }
  });

  function commitTrainingWindow() {
    const parsed = Number.parseInt(String(trainingWindowDraft).trim(), 10);
    const seconds = Number.isFinite(parsed)
      ? Math.min(
          TRAINING_WINDOW_MAX_SECONDS,
          Math.max(TRAINING_WINDOW_MIN_SECONDS, parsed),
        )
      : TRAINING_WINDOW_DEFAULT_SECONDS;
    SETTINGS.live.general.state.trainingWindowMs = seconds * 1000;
    trainingWindowDraft = String(seconds);
  }

  function onTrainingWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      (event.currentTarget as HTMLInputElement).blur();
    }
  }

  const dpsSkillColumnOrder = $derived(
    normalizeDpsSkillColumnOrder(
      SETTINGS.live.columnOrder.dpsSkills.state.order,
    ),
  );
  const healSkillColumnOrder = $derived(
    normalizeHealSkillColumnOrder(
      SETTINGS.live.columnOrder.healSkills.state.order,
    ),
  );
  const tankedPlayerColumnOrder = $derived(
    normalizeTankedPlayerColumnOrder(
      SETTINGS.live.columnOrder.tankedPlayers.state.order,
    ),
  );
  const tankedSkillColumnOrder = $derived(
    normalizeTankedSkillColumnOrder(
      SETTINGS.live.columnOrder.tankedSkills.state.order,
    ),
  );
  const deathReplayColumnOrder = $derived(
    normalizeDeathReplayColumnOrder(
      SETTINGS.live.columnOrder.deathReplay.state.order,
    ),
  );

  $effect(() => {
    for (const key of dpsSkillColumnOrder) {
      const typedKey = key as keyof typeof DEFAULT_STATS;
      if (typedKey in DEFAULT_STATS) {
        SETTINGS.live.dps.skillBreakdown.state[typedKey] ??=
          DEFAULT_STATS[typedKey];
      }
    }
    for (const key of healSkillColumnOrder) {
      const typedKey = key as keyof typeof DEFAULT_STATS;
      if (typedKey in DEFAULT_STATS) {
        SETTINGS.live.heal.skillBreakdown.state[typedKey] ??=
          DEFAULT_STATS[typedKey];
      }
    }
    for (const key of tankedPlayerColumnOrder) {
      const typedKey = key as keyof typeof DEFAULT_LIVE_TANKED_PLAYER_STATS;
      SETTINGS.live.tanked.players.state[typedKey] ??=
        DEFAULT_LIVE_TANKED_PLAYER_STATS[typedKey];
    }
    for (const key of tankedSkillColumnOrder) {
      const typedKey = key as keyof typeof DEFAULT_LIVE_TANKED_SKILL_STATS;
      SETTINGS.live.tanked.skills.state[typedKey] ??=
        DEFAULT_LIVE_TANKED_SKILL_STATS[typedKey];
    }
    for (const key of deathReplayColumnOrder) {
      const typedKey = key as keyof typeof DEFAULT_DEATH_REPLAY_COLUMNS;
      SETTINGS.live.deathReplay.state[typedKey] ??=
        DEFAULT_DEATH_REPLAY_COLUMNS[typedKey];
    }
  });
  // Drag state for column reordering (unused - keeping for potential future use)
</script>

<Tabs.Content value={SETTINGS_CATEGORY}>
  <div class="space-y-3">
    <div
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("general")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.general")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.general
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.general}
        <div class="space-y-1 px-4 pb-3">
          <SettingsSelect
            bind:selected={SETTINGS.live.general.state.showYourName}
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
            bind:selected={SETTINGS.live.general.state.showOthersName}
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
            bind:checked={SETTINGS.live.general.state.showYourAbilityScore}
            label={t("settings.common.ability.your")}
            description={t("settings.common.ability.yourDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showOthersAbilityScore}
            label={t("settings.common.ability.others")}
            description={t("settings.common.ability.othersDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showYourSeasonStrength}
            label={t("settings.common.seasonStrength.your")}
            description={t("settings.common.seasonStrength.yourDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showOthersSeasonStrength}
            label={t("settings.common.seasonStrength.others")}
            description={t("settings.common.seasonStrength.othersDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showFantasyCastIcons}
            label={t("settings.live.fantasyCastIcons")}
            description={t("settings.live.fantasyCastIconsDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopDPSPlayer}
            label={t("settings.common.relative.dpsPlayer")}
            description={t("settings.common.relative.dpsPlayerDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopDPSSkill}
            label={t("settings.common.relative.dpsSkill")}
            description={t("settings.common.relative.dpsSkillDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopHealPlayer}
            label={t("settings.common.relative.healPlayer")}
            description={t("settings.common.relative.healPlayerDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopHealSkill}
            label={t("settings.common.relative.healSkill")}
            description={t("settings.common.relative.healSkillDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopTankedPlayer}
            label={t("settings.common.relative.tankedPlayer")}
            description={t("settings.common.relative.tankedPlayerDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopTankedSkill}
            label={t("settings.common.relative.tankedSkill")}
            description={t("settings.common.relative.tankedSkillDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenTps}
            label={t("settings.common.shorten.tps")}
            description={t("settings.common.shorten.tpsDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenAbilityScore}
            label={t("settings.common.shorten.abilityScore")}
            description={t("settings.common.shorten.abilityScoreDescription")}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenDps}
            label={t("settings.common.shorten.dps")}
            description={t("settings.common.shorten.dpsDescription")}
          />
          <SettingsSelect
            bind:selected={SETTINGS.live.general.state.abbreviationStyle}
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
            bind:selected={SETTINGS.live.general.state.abbreviatedDecimalPlaces}
            label={t("settings.common.decimalPlaces")}
            description={t("settings.common.decimalPlacesDescription")}
            values={[
              { label: t("settings.common.decimalPlaces.1"), value: 1 },
              { label: t("settings.common.decimalPlaces.2"), value: 2 },
              { label: t("settings.common.decimalPlaces.3"), value: 3 },
              { label: t("settings.common.decimalPlaces.4"), value: 4 },
            ]}
          />
          <SettingsSlider
            bind:value={SETTINGS.live.general.state.eventUpdateRateMs}
            label={t("settings.live.refreshRate")}
            description={t("settings.live.refreshRateDescription")}
            min={50}
            max={2000}
            step={50}
            unit="ms"
          />
          <SettingsInput
            bind:value={trainingWindowDraft}
            type="number"
            min={TRAINING_WINDOW_MIN_SECONDS}
            max={TRAINING_WINDOW_MAX_SECONDS}
            step={1}
            placeholder={String(TRAINING_WINDOW_DEFAULT_SECONDS)}
            label={t("settings.live.trainingWindow")}
            description={t("settings.live.trainingWindowDescription")}
            onblur={commitTrainingWindow}
            onkeydown={onTrainingWindowKeydown}
          />
          <SettingsSelect
            bind:selected={SETTINGS.live.general.state.trainingLockPolicy}
            label={t("settings.live.trainingLockPolicy")}
            description={t("settings.live.trainingLockPolicyDescription")}
            values={[
              {
                label: t("settings.live.trainingLockPolicy.eliteDummies"),
                value: "eliteDummies",
              },
              {
                label: t("settings.live.trainingLockPolicy.firstMonster"),
                value: "firstMonster",
              },
            ]}
          />
        </div>
      {/if}
    </div>

    <!-- DPS - Player Settings -->
    <div
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("dpsPlayers")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.dpsPlayers")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.dpsPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.dpsPlayers}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          <div
            class="border-border/30 bg-muted/20 flex items-center gap-3 rounded border px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <div class="text-foreground text-sm font-medium">
                {t("settings.common.columns.first.player")}
              </div>
              <div class="text-muted-foreground mt-0.5 text-xs">
                {t("settings.common.columns.customNameHint")}
              </div>
            </div>
            <SettingsColumnLabel
              bind:value={SETTINGS.live.columnLabels.state.live.players.first}
              placeholder={t("live.table.player")}
              ariaLabel={t("settings.common.columns.customNameAriaLabel", {
                column: t("live.table.player"),
              })}
              resetLabel={t("settings.common.columns.resetName")}
            />
          </div>
          {#each SETTINGS.live.columnOrder.dpsPlayers.state.order as colKey, idx (colKey)}
            {@const col = liveDpsPlayerColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
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
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
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
                <div class="min-w-0 flex-1">
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
                <SettingsColumnLabel
                  bind:value={
                    SETTINGS.live.columnLabels.state.live.players.columns[
                      col.key
                    ]
                  }
                  placeholder={col.header}
                  ariaLabel={t("settings.common.columns.customNameAriaLabel", {
                    column: col.label,
                  })}
                  resetLabel={t("settings.common.columns.resetName")}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- DPS - Skill Breakdown Settings -->
    <div
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("dpsSkills")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.dpsSkills")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.dpsSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.dpsSkills}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          <div
            class="border-border/30 bg-muted/20 flex items-center gap-3 rounded border px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <div class="text-foreground text-sm font-medium">
                {t("settings.common.columns.first.skill")}
              </div>
              <div class="text-muted-foreground mt-0.5 text-xs">
                {t("settings.common.columns.customNameHint")}
              </div>
            </div>
            <SettingsColumnLabel
              bind:value={SETTINGS.live.columnLabels.state.live.skills.first}
              placeholder={t("live.table.skill")}
              ariaLabel={t("settings.common.columns.customNameAriaLabel", {
                column: t("live.table.skill"),
              })}
              resetLabel={t("settings.common.columns.resetName")}
            />
          </div>
          {#each dpsSkillColumnOrder as colKey, idx (colKey)}
            {@const col = liveDpsSkillColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [...dpsSkillColumnOrder];
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
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === dpsSkillColumnOrder.length - 1}
                    onclick={() => {
                      const arr = [...dpsSkillColumnOrder];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.dpsSkills.state.order = arr;
                      }
                    }}>▼</button
                  >
                </div>
                <div class="min-w-0 flex-1">
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
                <SettingsColumnLabel
                  bind:value={
                    SETTINGS.live.columnLabels.state.live.skills.columns[
                      col.key
                    ]
                  }
                  placeholder={col.header}
                  ariaLabel={t("settings.common.columns.customNameAriaLabel", {
                    column: col.label,
                  })}
                  resetLabel={t("settings.common.columns.resetName")}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Heal - Player Settings -->
    <div
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("healPlayers")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.healPlayers")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.healPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.healPlayers}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          {#each SETTINGS.live.columnOrder.healPlayers.state.order as colKey, idx (colKey)}
            {@const col = liveHealPlayerColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
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
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
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
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("healSkills")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.healSkills")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.healSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.healSkills}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          {#each healSkillColumnOrder as colKey, idx (colKey)}
            {@const col = liveHealSkillColumns.find((c) => c.key === colKey)}
            {#if col}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [...healSkillColumnOrder];
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
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === healSkillColumnOrder.length - 1}
                    onclick={() => {
                      const arr = [...healSkillColumnOrder];
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
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("tankedPlayers")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.tankedPlayers")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.tankedPlayers
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.tankedPlayers}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          {#each tankedPlayerColumnOrder as colKey, idx (colKey)}
            {@const col = liveTankedPlayerColumns.find((c) => c.key === colKey)}
            {#if col}
              {@const key =
                col.key as keyof typeof DEFAULT_LIVE_TANKED_PLAYER_STATS}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [...tankedPlayerColumnOrder];
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
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === tankedPlayerColumnOrder.length - 1}
                    onclick={() => {
                      const arr = [...tankedPlayerColumnOrder];
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
                  bind:checked={SETTINGS.live.tanked.players.state[key]}
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
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("tankedSkills")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.tankedSkills")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.tankedSkills
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.tankedSkills}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          {#each tankedSkillColumnOrder as colKey, idx (colKey)}
            {@const col = liveTankedSkillColumns.find((c) => c.key === colKey)}
            {#if col}
              {@const key =
                col.key as keyof typeof DEFAULT_LIVE_TANKED_SKILL_STATS}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [...tankedSkillColumnOrder];
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
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === tankedSkillColumnOrder.length - 1}
                    onclick={() => {
                      const arr = [...tankedSkillColumnOrder];
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
                  bind:checked={SETTINGS.live.tanked.skills.state[key]}
                  label={col.label}
                  description={col.description}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Death Replay Columns -->
    <div
      class="bg-card/40 border-border/60 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <button
        type="button"
        class="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
        onclick={() => toggleSection("deathReplay")}
      >
        <h2 class="text-foreground text-base font-semibold">
          {t("settings.common.columns.deathReplay")}
        </h2>
        <ChevronDown
          class="text-muted-foreground h-5 w-5 transition-transform duration-200 {expandedSections.deathReplay
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if expandedSections.deathReplay}
        <div class="space-y-1 px-4 pb-3">
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.orderHint")}
          </p>
          <p class="text-muted-foreground mb-2 text-xs">
            {t("settings.common.columns.deathReplaySharedHint")}
          </p>
          {#each deathReplayColumnOrder as colKey, idx (colKey)}
            {@const col = deathReplayColumns.find((c) => c.key === colKey)}
            {#if col}
              {@const key =
                col.key as keyof typeof DEFAULT_DEATH_REPLAY_COLUMNS}
              <div
                class="bg-muted/20 border-border/30 flex items-center gap-2 rounded border px-2 py-1"
              >
                <div class="flex flex-col">
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === 0}
                    onclick={() => {
                      const arr = [...deathReplayColumnOrder];
                      const prev = arr[idx - 1];
                      const curr = arr[idx];
                      if (prev !== undefined && curr !== undefined) {
                        arr.splice(idx - 1, 2, curr, prev);
                        SETTINGS.live.columnOrder.deathReplay.state.order = arr;
                      }
                    }}>▲</button
                  >
                  <button
                    type="button"
                    class="hover:bg-muted/50 rounded px-1 text-xs disabled:opacity-30"
                    disabled={idx === deathReplayColumnOrder.length - 1}
                    onclick={() => {
                      const arr = [...deathReplayColumnOrder];
                      const curr = arr[idx];
                      const next = arr[idx + 1];
                      if (curr !== undefined && next !== undefined) {
                        arr.splice(idx, 2, next, curr);
                        SETTINGS.live.columnOrder.deathReplay.state.order = arr;
                      }
                    }}>▼</button
                  >
                </div>
                <SettingsSwitch
                  bind:checked={SETTINGS.live.deathReplay.state[key]}
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
