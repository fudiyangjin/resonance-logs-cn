<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
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
        <h2 class="text-base font-semibold text-foreground">通用设置</h2>
        <ChevronDown class="w-5 h-5 text-muted-foreground transition-transform duration-200 {expandedSections.general ? 'rotate-180' : ''}" />
      </button>
      {#if expandedSections.general}
        <div class="px-4 pb-3 space-y-1">
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showYourName}
            values={[
              { label: "显示你的名称", value: "Show Your Name" },
              { label: "显示你的职业", value: "Show Your Class" },
              { label: "显示你的名称 - 职业", value: "Show Your Name - Class" },
              { label: "显示你的名称 - 专精", value: "Show Your Name - Spec" },
              { label: "隐藏你的名称", value: "Hide Your Name" },
            ]}
            label="显示你的名称"
            description="“显示你的职业”会用职业替代你的名称；“名称 - 职业/专精”会同时显示两者。"
          />
          <SettingsSelect
            bind:selected={SETTINGS.history.general.state.showOthersName}
            values={[
              { label: "显示他人名称", value: "Show Others' Name" },
              { label: "显示他人职业", value: "Show Others' Class" },
              { label: "显示他人名称 - 职业", value: "Show Others' Name - Class" },
              { label: "显示他人名称 - 专精", value: "Show Others' Name - Spec" },
              { label: "隐藏他人名称", value: "Hide Others' Name" },
            ]}
            label="显示他人名称"
            description="“显示他人职业”会用职业替代他人名称；“名称 - 职业/专精”会同时显示两者。"
          />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourAbilityScore} label="你的能力评分" description="显示你的能力评分" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersAbilityScore} label="他人能力评分" description="显示他人的能力评分" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showYourSeasonStrength} label="你的赛季强度" description="显示你的赛季强度" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.showOthersSeasonStrength} label="他人赛季强度" description="显示他人的赛季强度" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSPlayer} label="以最高 DPS 为基准（玩家）" description="颜色条按最高 DPS 玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopDPSSkill} label="以最高 DPS 为基准（技能）" description="颜色条按最高 DPS 技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealPlayer} label="以最高治疗为基准（玩家）" description="颜色条按最高治疗玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopHealSkill} label="以最高治疗为基准（技能）" description="颜色条按最高治疗技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedPlayer} label="以最高承伤为基准（玩家）" description="颜色条按最高承伤玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.relativeToTopTankedSkill} label="以最高承伤为基准（技能）" description="颜色条按最高承伤技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenTps} label="缩写 TPS 数值" description="将 TPS 显示为 5k、50k 等" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenAbilityScore} label="缩写能力评分" description="将能力评分显示为缩写形式" />
          <SettingsSwitch bind:checked={SETTINGS.history.general.state.shortenDps} label="缩写 DPS 数值" description="将 DPS 显示为 5k、50k 等" />
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
  <h2 class="text-base font-semibold text-foreground">DPS（玩家）列</h2>
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
  <h2 class="text-base font-semibold text-foreground">DPS（技能明细）列</h2>
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
  <h2 class="text-base font-semibold text-foreground">治疗（玩家）列</h2>
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
  <h2 class="text-base font-semibold text-foreground">治疗（技能明细）列</h2>
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
  <h2 class="text-base font-semibold text-foreground">承伤（玩家）列</h2>
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
  <h2 class="text-base font-semibold text-foreground">承伤（技能明细）列</h2>
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
