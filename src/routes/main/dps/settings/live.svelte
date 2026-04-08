<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import SettingsSwitch from "./settings-switch.svelte";
  import SettingsSelect from "./settings-select.svelte";
  import SettingsSlider from "./settings-slider.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import {
    liveDpsPlayerColumns,
    liveDpsSkillColumns,
    liveHealPlayerColumns,
    liveHealSkillColumns,
    liveTankedPlayerColumns,
    liveTankedSkillColumns,
  } from "$lib/column-data";
  import { resolveNavigationTranslation } from "$lib/i18n";

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

  function t(key: string, fallback: string): string {
    return resolveNavigationTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function colLabel(col: { label: string; labelKey?: string }): string {
    return col.labelKey ? t(col.labelKey, col.label) : col.label;
  }

  function colDescription(col: { description: string; descriptionKey?: string }): string {
    return col.descriptionKey ? t(col.descriptionKey, col.description) : col.description;
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
          {resolveNavigationTranslation(
            "dps.live.generalSettings",
            SETTINGS.live.general.state.language,
            "通用设置",
          )}
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
              {
                label: resolveNavigationTranslation(
                  "dps.live.showYourName.option.name",
                  SETTINGS.live.general.state.language,
                  "显示你的名称",
                ),
                value: "Show Your Name",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showYourName.option.class",
                  SETTINGS.live.general.state.language,
                  "显示你的职业",
                ),
                value: "Show Your Class",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showYourName.option.nameClass",
                  SETTINGS.live.general.state.language,
                  "显示你的名称 - 职业",
                ),
                value: "Show Your Name - Class",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showYourName.option.nameSpec",
                  SETTINGS.live.general.state.language,
                  "显示你的名称 - 专精",
                ),
                value: "Show Your Name - Spec",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showYourName.option.hide",
                  SETTINGS.live.general.state.language,
                  "隐藏你的名称",
                ),
                value: "Hide Your Name",
              },
            ]}
            label={resolveNavigationTranslation(
              "dps.live.showYourName",
              SETTINGS.live.general.state.language,
              "显示你的名称",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showYourNameDescription",
              SETTINGS.live.general.state.language,
              "“显示你的职业”会用职业替代你的名称；“名称 - 职业/专精”会同时显示两者。",
            )}
          />
          <SettingsSelect
            bind:selected={SETTINGS.live.general.state.showOthersName}
            values={[
              {
                label: resolveNavigationTranslation(
                  "dps.live.showOthersName.option.name",
                  SETTINGS.live.general.state.language,
                  "显示他人名称",
                ),
                value: "Show Others' Name",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showOthersName.option.class",
                  SETTINGS.live.general.state.language,
                  "显示他人职业",
                ),
                value: "Show Others' Class",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showOthersName.option.nameClass",
                  SETTINGS.live.general.state.language,
                  "显示他人名称 - 职业",
                ),
                value: "Show Others' Name - Class",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showOthersName.option.nameSpec",
                  SETTINGS.live.general.state.language,
                  "显示他人名称 - 专精",
                ),
                value: "Show Others' Name - Spec",
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.showOthersName.option.hide",
                  SETTINGS.live.general.state.language,
                  "隐藏他人名称",
                ),
                value: "Hide Others' Name",
              },
            ]}
            label={resolveNavigationTranslation(
              "dps.live.showOthersName",
              SETTINGS.live.general.state.language,
              "显示他人名称",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showOthersNameDescription",
              SETTINGS.live.general.state.language,
              "“显示他人职业”会用职业替代他人名称；“名称 - 职业/专精”会同时显示两者。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showYourAbilityScore}
            label={resolveNavigationTranslation(
              "dps.live.showYourAbilityScore",
              SETTINGS.live.general.state.language,
              "你的能力评分",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showYourAbilityScoreDescription",
              SETTINGS.live.general.state.language,
              "显示你的能力评分",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showOthersAbilityScore}
            label={resolveNavigationTranslation(
              "dps.live.showOthersAbilityScore",
              SETTINGS.live.general.state.language,
              "他人能力评分",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showOthersAbilityScoreDescription",
              SETTINGS.live.general.state.language,
              "显示他人的能力评分",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showYourSeasonStrength}
            label={resolveNavigationTranslation(
              "dps.live.showYourSeasonStrength",
              SETTINGS.live.general.state.language,
              "你的赛季强度",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showYourSeasonStrengthDescription",
              SETTINGS.live.general.state.language,
              "显示你的赛季强度",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.showOthersSeasonStrength}
            label={resolveNavigationTranslation(
              "dps.live.showOthersSeasonStrength",
              SETTINGS.live.general.state.language,
              "他人赛季强度",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showOthersSeasonStrengthDescription",
              SETTINGS.live.general.state.language,
              "显示他人的赛季强度",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopDPSPlayer}
            label={resolveNavigationTranslation(
              "dps.live.relativeToTopDPSPlayer",
              SETTINGS.live.general.state.language,
              "以最高 DPS 为基准（玩家）",
            )}
            description={resolveNavigationTranslation(
              "dps.live.relativeToTopDPSPlayerDescription",
              SETTINGS.live.general.state.language,
              "颜色条按最高 DPS 玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopDPSSkill}
            label={resolveNavigationTranslation(
              "dps.live.relativeToTopDPSSkill",
              SETTINGS.live.general.state.language,
              "以最高 DPS 为基准（技能）",
            )}
            description={resolveNavigationTranslation(
              "dps.live.relativeToTopDPSSkillDescription",
              SETTINGS.live.general.state.language,
              "颜色条按最高 DPS 技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopHealPlayer}
            label={resolveNavigationTranslation(
              "dps.live.relativeToTopHealPlayer",
              SETTINGS.live.general.state.language,
              "以最高治疗为基准（玩家）",
            )}
            description={resolveNavigationTranslation(
              "dps.live.relativeToTopHealPlayerDescription",
              SETTINGS.live.general.state.language,
              "颜色条按最高治疗玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopHealSkill}
            label={resolveNavigationTranslation(
              "dps.live.relativeToTopHealSkill",
              SETTINGS.live.general.state.language,
              "以最高治疗为基准（技能）",
            )}
            description={resolveNavigationTranslation(
              "dps.live.relativeToTopHealSkillDescription",
              SETTINGS.live.general.state.language,
              "颜色条按最高治疗技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopTankedPlayer}
            label={resolveNavigationTranslation(
              "dps.live.relativeToTopTankedPlayer",
              SETTINGS.live.general.state.language,
              "以最高承伤为基准（玩家）",
            )}
            description={resolveNavigationTranslation(
              "dps.live.relativeToTopTankedPlayerDescription",
              SETTINGS.live.general.state.language,
              "颜色条按最高承伤玩家进行相对缩放，而不是按所有玩家。适用于 20 人或世界 Boss。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.relativeToTopTankedSkill}
            label={resolveNavigationTranslation(
              "dps.live.relativeToTopTankedSkill",
              SETTINGS.live.general.state.language,
              "以最高承伤为基准（技能）",
            )}
            description={resolveNavigationTranslation(
              "dps.live.relativeToTopTankedSkillDescription",
              SETTINGS.live.general.state.language,
              "颜色条按最高承伤技能进行相对缩放，而不是按所有技能。适用于 20 人或世界 Boss。",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenTps}
            label={resolveNavigationTranslation(
              "dps.live.shortenTps",
              SETTINGS.live.general.state.language,
              "缩写 TPS 数值",
            )}
            description={resolveNavigationTranslation(
              "dps.live.shortenTpsDescription",
              SETTINGS.live.general.state.language,
              "将 TPS 显示为 5k、50k 等",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenAbilityScore}
            label={resolveNavigationTranslation(
              "dps.live.shortenAbilityScore",
              SETTINGS.live.general.state.language,
              "缩写能力评分",
            )}
            description={resolveNavigationTranslation(
              "dps.live.shortenAbilityScoreDescription",
              SETTINGS.live.general.state.language,
              "将能力评分显示为缩写形式",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.live.general.state.shortenDps}
            label={resolveNavigationTranslation(
              "dps.live.shortenDps",
              SETTINGS.live.general.state.language,
              "缩写 DPS 数值",
            )}
            description={resolveNavigationTranslation(
              "dps.live.shortenDpsDescription",
              SETTINGS.live.general.state.language,
              "将 DPS 显示为 5k、50k 等",
            )}
          />
          <SettingsSelect
            bind:selected={SETTINGS.live.general.state.abbreviatedDecimalPlaces}
            label={resolveNavigationTranslation(
              "dps.live.abbreviatedDecimalPlaces",
              SETTINGS.live.general.state.language,
              "缩写小数位数",
            )}
            description={resolveNavigationTranslation(
              "dps.live.abbreviatedDecimalPlacesDescription",
              SETTINGS.live.general.state.language,
              "设置玩家表与技能明细中的 DPS/HPS/TPS 等缩写数值保留的小数位数",
            )}
            values={[
              {
                label: resolveNavigationTranslation(
                  "dps.live.abbreviatedDecimalPlaces.option1",
                  SETTINGS.live.general.state.language,
                  "1位 (1.2m)",
                ),
                value: 1,
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.abbreviatedDecimalPlaces.option2",
                  SETTINGS.live.general.state.language,
                  "2位 (1.23m)",
                ),
                value: 2,
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.abbreviatedDecimalPlaces.option3",
                  SETTINGS.live.general.state.language,
                  "3位 (1.234m)",
                ),
                value: 3,
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.abbreviatedDecimalPlaces.option4",
                  SETTINGS.live.general.state.language,
                  "4位 (1.2345m)",
                ),
                value: 4,
              },
            ]}
          />
          <SettingsSlider
            bind:value={SETTINGS.live.general.state.eventUpdateRateMs}
            label={resolveNavigationTranslation(
              "dps.live.refreshRate",
              SETTINGS.live.general.state.language,
              "刷新频率",
            )}
            description={resolveNavigationTranslation(
              "dps.live.refreshRateDescription",
              SETTINGS.live.general.state.language,
              "实时统计刷新间隔（50-2000ms）。越低越流畅，但更耗 CPU。",
            )}
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
          {resolveNavigationTranslation(
            "dps.live.targetDummyMode",
            SETTINGS.live.general.state.language,
            "打桩模式",
          )}
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
              {
                label: resolveNavigationTranslation(
                  "dps.live.targetDummy.enemyElite",
                  SETTINGS.live.general.state.language,
                  "精英敌方木桩",
                ),
                value: 115,
              },
              {
                label: resolveNavigationTranslation(
                  "dps.live.targetDummy.guardianElite",
                  SETTINGS.live.general.state.language,
                  "精英守护木桩",
                ),
                value: 122,
              },
            ]}
            label={resolveNavigationTranslation(
              "dps.live.defaultTargetDummy",
              SETTINGS.live.general.state.language,
              "默认木桩目标",
            )}
            description={resolveNavigationTranslation(
              "dps.live.defaultTargetDummyDescription",
              SETTINGS.live.general.state.language,
              "头部打桩按钮会直接使用这里的默认目标",
            )}
          />
          <SettingsSwitch
            bind:checked={SETTINGS.trainingDummy.state.showHeaderControl}
            label={resolveNavigationTranslation(
              "dps.live.showHeaderTargetDummyButton",
              SETTINGS.live.general.state.language,
              "显示头部打桩按钮",
            )}
            description={resolveNavigationTranslation(
              "dps.live.showHeaderTargetDummyButtonDescription",
              SETTINGS.live.general.state.language,
              "在实时窗口头部显示“打桩模式”开关和状态提示。",
            )}
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
          {resolveNavigationTranslation(
            "dps.live.playerColumns",
            SETTINGS.live.general.state.language,
            "DPS（玩家）列",
          )}
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
            {resolveNavigationTranslation(
              "dps.live.reorderColumnsHint",
              SETTINGS.live.general.state.language,
              "使用箭头调整顺序；用开关控制显示/隐藏。",
            )}
          </p>
          {#each SETTINGS.live.columnOrder.dpsPlayers.state.order.filter((colKey) => colKey !== "effectiveTotal" && colKey !== "effectiveDps") as colKey, idx (colKey)}
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
                  label={colLabel(col)}
                  description={colDescription(col)}
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
          {resolveNavigationTranslation(
            "dps.live.skillColumns",
            SETTINGS.live.general.state.language,
            "DPS（技能明细）列",
          )}
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
            {resolveNavigationTranslation(
              "dps.live.reorderColumnsHint",
              SETTINGS.live.general.state.language,
              "使用箭头调整顺序；用开关控制显示/隐藏。",
            )}
          </p>
          {#each SETTINGS.live.columnOrder.dpsSkills.state.order.filter((colKey) => colKey !== "effectiveTotal" && colKey !== "effectiveDps") as colKey, idx (colKey)}
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
                  label={colLabel(col)}
                  description={colDescription(col)}
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
          {resolveNavigationTranslation(
            "dps.live.healPlayerColumns",
            SETTINGS.live.general.state.language,
            "治疗（玩家）列",
          )}
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
            {resolveNavigationTranslation(
              "dps.live.reorderColumnsHint",
              SETTINGS.live.general.state.language,
              "使用箭头调整顺序；用开关控制显示/隐藏。",
            )}
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
                  label={colLabel(col)}
                  description={colDescription(col)}
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
          {resolveNavigationTranslation(
            "dps.live.healSkillColumns",
            SETTINGS.live.general.state.language,
            "治疗（技能明细）列",
          )}
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
            {resolveNavigationTranslation(
              "dps.live.reorderColumnsHint",
              SETTINGS.live.general.state.language,
              "使用箭头调整顺序；用开关控制显示/隐藏。",
            )}
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
                  label={colLabel(col)}
                  description={colDescription(col)}
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
          {resolveNavigationTranslation(
            "dps.live.tankedPlayerColumns",
            SETTINGS.live.general.state.language,
            "承伤（玩家）列",
          )}
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
            {resolveNavigationTranslation(
              "dps.live.reorderColumnsHint",
              SETTINGS.live.general.state.language,
              "使用箭头调整顺序；用开关控制显示/隐藏。",
            )}
          </p>
          {#each SETTINGS.live.columnOrder.tankedPlayers.state.order.filter((colKey) => colKey !== "effectiveTotal" && colKey !== "effectiveDps") as colKey, idx (colKey)}
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
                  label={colLabel(col)}
                  description={colDescription(col)}
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
          {resolveNavigationTranslation(
            "dps.live.tankedSkillColumns",
            SETTINGS.live.general.state.language,
            "承伤（技能明细）列",
          )}
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
            {resolveNavigationTranslation(
              "dps.live.reorderColumnsHint",
              SETTINGS.live.general.state.language,
              "使用箭头调整顺序；用开关控制显示/隐藏。",
            )}
          </p>
          {#each SETTINGS.live.columnOrder.tankedSkills.state.order.filter((colKey) => colKey !== "effectiveTotal" && colKey !== "effectiveDps") as colKey, idx (colKey)}
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
                  label={colLabel(col)}
                  description={colDescription(col)}
                />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Tabs.Content>
