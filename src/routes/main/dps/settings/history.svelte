<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import { historyDpsPlayerColumns, historyDpsSkillColumns, historyHealPlayerColumns, historyHealSkillColumns, historyTankedPlayerColumns, historyTankedSkillColumns } from "$lib/column-data";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveNavigationTranslation } from "$lib/i18n";
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

  function t(key: string, fallback: string): string {
    return resolveNavigationTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function colLabel(col: { label: string; labelKey?: string }): string {
    return resolveNavigationTranslation(
      col.labelKey ?? "",
      SETTINGS.live.general.state.language,
      col.label,
    );
  }

  function colDescription(col: { description: string; descriptionKey?: string }): string {
    return resolveNavigationTranslation(
      col.descriptionKey ?? "",
      SETTINGS.live.general.state.language,
      col.description,
    );
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
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.generalSettings", "通用设置")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.general ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.general}
        <div class="px-4 pb-3 space-y-1">
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showYourName}
            values={[
              { label: t("dps.live.showYourName.option.name", "显示你的名称"), value: "Show Your Name" },
              { label: t("dps.live.showYourName.option.class", "显示你的职业"), value: "Show Your Class" },
              { label: t("dps.live.showYourName.option.nameClass", "显示你的名称 - 职业"), value: "Show Your Name - Class" },
              { label: t("dps.live.showYourName.option.nameSpec", "显示你的名称 - 专精"), value: "Show Your Name - Spec" },
              { label: t("dps.live.showYourName.option.hide", "隐藏你的名称"), value: "Hide Your Name" },
            ]}
            label={t("dps.live.showYourName", "显示你的名称")}
            description={t("dps.live.showYourNameDescription", "“显示你的职业”会用职业替代你的名称；“名称 - 职业/专精”会同时显示两者。")}
          />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showOthersName}
            values={[
              { label: t("dps.live.showOthersName.option.name", "显示他人名称"), value: "Show Others' Name" },
              { label: t("dps.live.showOthersName.option.class", "显示他人职业"), value: "Show Others' Class" },
              { label: t("dps.live.showOthersName.option.nameClass", "显示他人名称 - 职业"), value: "Show Others' Name - Class" },
              { label: t("dps.live.showOthersName.option.nameSpec", "显示他人名称 - 专精"), value: "Show Others' Name - Spec" },
              { label: t("dps.live.showOthersName.option.hide", "隐藏他人名称"), value: "Hide Others' Name" },
            ]}
            label={t("dps.live.showOthersName", "显示他人名称")}
            description={t("dps.live.showOthersNameDescription", "“显示他人职业”会用职业替代他人名称；“名称 - 职业/专精”会同时显示两者。")}
          />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourAbilityScore} label={t("dps.live.showYourAbilityScore", "你的能力评分")} description={t("dps.live.showYourAbilityScoreDescription", "显示你的能力评分")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersAbilityScore} label={t("dps.live.showOthersAbilityScore", "他人能力评分")} description={t("dps.live.showOthersAbilityScoreDescription", "显示他人的能力评分")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourSeasonStrength} label={t("dps.live.showYourSeasonStrength", "你的赛季强度")} description={t("dps.live.showYourSeasonStrengthDescription", "显示你的赛季强度")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersSeasonStrength} label={t("dps.live.showOthersSeasonStrength", "他人赛季强度")} description={t("dps.live.showOthersSeasonStrengthDescription", "显示他人的赛季强度")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSPlayer} label={t("dps.live.relativeToTopDPSPlayer", "以最高 DPS 为基准（玩家）")} description={t("dps.live.relativeToTopDPSPlayerDescription", "颜色条按最高 DPS 玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSSkill} label={t("dps.live.relativeToTopDPSSkill", "以最高 DPS 为基准（技能）")} description={t("dps.live.relativeToTopDPSSkillDescription", "颜色条按最高 DPS 技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealPlayer} label={t("dps.live.relativeToTopHealPlayer", "以最高治疗为基准（玩家）")} description={t("dps.live.relativeToTopHealPlayerDescription", "颜色条按最高治疗玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealSkill} label={t("dps.live.relativeToTopHealSkill", "以最高治疗为基准（技能）")} description={t("dps.live.relativeToTopHealSkillDescription", "颜色条按最高治疗技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedPlayer} label={t("dps.live.relativeToTopTankedPlayer", "以最高承伤为基准（玩家）")} description={t("dps.live.relativeToTopTankedPlayerDescription", "颜色条按最高承伤玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedSkill} label={t("dps.live.relativeToTopTankedSkill", "以最高承伤为基准（技能）")} description={t("dps.live.relativeToTopTankedSkillDescription", "颜色条按最高承伤技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenTps} label={t("dps.live.shortenTps", "缩写 TPS 数值")} description={t("dps.live.shortenTpsDescription", "将 TPS 显示为 5k、50k 等")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenAbilityScore} label={t("dps.live.shortenAbilityScore", "缩写能力评分")} description={t("dps.live.shortenAbilityScoreDescription", "将能力评分显示为缩写形式")} />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenDps} label={t("dps.live.shortenDps", "缩写 DPS 数值")} description={t("dps.live.shortenDpsDescription", "将 DPS 显示为 5k、50k 等")} />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.abbreviatedDecimalPlaces}
            label={t("dps.live.abbreviatedDecimalPlaces", "缩写小数位数")}
            description={t("dps.live.abbreviatedDecimalPlacesDescription", "设置玩家表与技能明细中的 DPS/HPS/TPS 等缩写数值保留的小数位数")}
            values={[
              { label: t("dps.live.abbreviatedDecimalPlaces.option1", "1位 (1.2m)"), value: 1 },
              { label: t("dps.live.abbreviatedDecimalPlaces.option2", "2位 (1.23m)"), value: 2 },
              { label: t("dps.live.abbreviatedDecimalPlaces.option3", "3位 (1.234m)"), value: 3 },
              { label: t("dps.live.abbreviatedDecimalPlaces.option4", "4位 (1.2345m)"), value: 4 },
            ]}
          />
        </div>
      {/if}
    </div>

    <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('dpsPlayers')}
      >
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.playerColumns", "DPS（玩家）列")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsPlayers ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.dpsPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyDpsPlayerColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.dps.players.state[col.key]} label={colLabel(col)} description={colDescription(col)} />
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('dpsSkills')}
      >
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.skillColumns", "DPS（技能明细）列")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.dpsSkills ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.dpsSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyDpsSkillColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.dps.skillBreakdown.state[col.key]} label={colLabel(col)} description={colDescription(col)} />
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('healPlayers')}
      >
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.healPlayerColumns", "治疗（玩家）列")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healPlayers ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.healPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyHealPlayerColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.heal.players.state[col.key]} label={colLabel(col)} description={colDescription(col)} />
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('healSkills')}
      >
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.healSkillColumns", "治疗（技能明细）列")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.healSkills ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.healSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyHealSkillColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.heal.skillBreakdown.state[col.key]} label={colLabel(col)} description={colDescription(col)} />
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('tankedPlayers')}
      >
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.tankedPlayerColumns", "承伤（玩家）列")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedPlayers ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.tankedPlayers}
        <div class="px-4 pb-3 space-y-1">
          {#each historyTankedPlayerColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.tanked.players.state[col.key]} label={colLabel(col)} description={colDescription(col)} />
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-popover/40 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-popover/50 transition-colors"
        onclick={() => toggleSection('tankedSkills')}
      >
        <h2 class="text-base font-semibold text-foreground">{t("dps.historyPage.tankedSkillColumns", "承伤（技能明细）列")}</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.tankedSkills ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.tankedSkills}
        <div class="px-4 pb-3 space-y-1">
          {#each historyTankedSkillColumns as col (col.key)}
            <SettingsSwitch bind:checked={SETTINGS.history.tanked.skillBreakdown.state[col.key]} label={colLabel(col)} description={colDescription(col)} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Tabs.Content>
