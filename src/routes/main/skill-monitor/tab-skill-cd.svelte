<script lang="ts">
  import { findAnySkillByBaseId, type ClassSkillConfig, type ResonanceSkillDefinition, type SkillDefinition } from "$lib/skill-mappings";
  import { SETTINGS } from "$lib/settings-store";
  import {
    resolveSkillMonitorTranslation,
    resolveSkillMonitorClassName,
    resolveSkillMonitorClassSkillName,
  } from "$lib/i18n";

  interface Props {
    classConfigs: ClassSkillConfig[];
    selectedClassKey: string;
    classSkills: SkillDefinition[];
    durationSkills: SkillDefinition[];
    monitoredSkillIds: number[];
    monitoredSkillDurationIds: number[];
    resonanceSearch: string;
    filteredResonanceSkills: ResonanceSkillDefinition[];
    selectedResonanceSkills: ResonanceSkillDefinition[];
    setSelectedClass: (classKey: string) => void;
    toggleSkill: (skillId: number) => void;
    isSelected: (skillId: number) => boolean;
    toggleSkillDuration: (skillId: number) => void;
    isDurationSelected: (skillId: number) => boolean;
    clearSkills: () => void;
    clearSkillDurations: () => void;
    setResonanceSearch: (value: string) => void;
  }

  function t(key: string, fallback: string): string {
    return resolveSkillMonitorTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  let {
    classConfigs,
    selectedClassKey,
    classSkills,
    durationSkills,
    monitoredSkillIds,
    monitoredSkillDurationIds,
    resonanceSearch,
    filteredResonanceSkills,
    selectedResonanceSkills,
    setSelectedClass,
    toggleSkill,
    isSelected,
    toggleSkillDuration,
    isDurationSelected,
    clearSkills,
    clearSkillDurations,
    setResonanceSearch,
  }: Props = $props();
  function displayClassName(config: ClassSkillConfig): string {
    return resolveSkillMonitorClassName(
      config.classKey,
      SETTINGS.live.general.state.language,
      String(config.className ?? config.classKey ?? ""),
    );
  }

  function displaySkillName(skill: SkillDefinition): string {
    return resolveSkillMonitorClassSkillName(
      selectedClassKey,
      skill.skillId,
      SETTINGS.live.general.state.language,
      skill.name || `#${skill.skillId}`,
    );
  }


  function formatEffectDuration(durationMs: number | undefined): string {
    if (!durationMs || durationMs <= 0) return "--";
    return `${durationMs % 1000 === 0 ? durationMs / 1000 : (durationMs / 1000).toFixed(1)}s`;
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.classSelection", "职业选择")}</h2>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.classSelectionDescription", "支持当前已配置的职业技能方案")}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each classConfigs as config (config.classKey)}
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {selectedClassKey === config.classKey
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => setSelectedClass(config.classKey)}
        >
          {displayClassName(config)}
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillSelection", "技能选择")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.skillSelectionDescription", "最多监控 10 个技能（2行 x 5列）")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {t("skillMonitor.selectedCount", "已选")} {monitoredSkillIds.length}/10
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkills}
        >
          {t("skillMonitor.clear", "清空")}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
      {#each classSkills as skill (skill.skillId)}
        <button
          type="button"
          class="relative min-h-[78px] cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
            ? 'border-primary ring-1 ring-primary'
            : 'border-border/60 hover:border-border'}"
          title={displaySkillName(skill)}
          onclick={() => toggleSkill(skill.skillId)}
        >
          {#if skill.imagePath}
            <img
              src={skill.imagePath}
              alt={displaySkillName(skill)}
              class="w-full h-full object-cover aspect-square"
            />
          {:else}
            <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
              {t("skillMonitor.notConfigured", "未配置")}
            </div>
          {/if}
          <div
            class="absolute inset-0 bg-black/42 px-2 py-1.5 text-center text-[9px] leading-tight font-bold text-white flex items-center justify-center"
          >
            <span
              class="whitespace-normal break-words"
              style="display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;text-shadow:-1px -1px 0 rgba(0,0,0,0.95), 1px -1px 0 rgba(0,0,0,0.95), -1px 1px 0 rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85);"
            >
              {displaySkillName(skill)}
            </span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.durationSkills", "持续时间技能")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.durationSkillsDescription", "选中的技能会在 overlay 中按单独图标显示，并在技能触发后开始前端倒计时")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {t("skillMonitor.selectedCount", "已选")} {monitoredSkillDurationIds.length}
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkillDurations}
        >
          {t("skillMonitor.clear", "清空")}
        </button>
      </div>
    </div>

    {#if durationSkills.length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
        {#each durationSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative min-h-[78px] cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isDurationSelected(skill.skillId)
              ? 'border-primary ring-1 ring-primary'
              : 'border-border/60 hover:border-border'}"
            title={`${displaySkillName(skill)} ${formatEffectDuration(skill.effectDurationMs)}`}
            onclick={() => toggleSkillDuration(skill.skillId)}
          >
            {#if skill.imagePath}
              <img
                src={skill.imagePath}
                alt={displaySkillName(skill)}
                class="w-full h-full object-cover aspect-square"
              />
            {:else}
              <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                {t("skillMonitor.notConfigured", "未配置")}
              </div>
            {/if}

            <div class="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {formatEffectDuration(skill.effectDurationMs)}
            </div>
            <div
              class="absolute inset-x-0 bottom-0 bg-black/55 text-[10px] leading-tight text-white/90 px-1 py-0.5 text-center whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {displaySkillName(skill)}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
        {t("skillMonitor.noDurationSkillsConfigured", "当前职业还没有配置持续时间技能")}
      </div>
    {/if}
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.resonanceSkills", "共鸣技能")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.resonanceSkillsDescription", "通过搜索选择共鸣技能，与普通技能共享 10 个监控格")}
        </p>
      </div>
      <div class="text-xs text-muted-foreground">
        {t("skillMonitor.selectedCount", "已选")} {selectedResonanceSkills.length}
      </div>
    </div>

    <input
      class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder={t("skillMonitor.searchResonanceSkills", "搜索共鸣技能名称")}
      value={resonanceSearch}
      oninput={(event) => setResonanceSearch((event.currentTarget as HTMLInputElement).value)}
    />

    {#if resonanceSearch.trim().length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
        {#each filteredResonanceSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative min-h-[78px] cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
              ? 'border-primary ring-1 ring-primary'
              : 'border-border/60 hover:border-border'}"
            title={skill.name}
            onclick={() => toggleSkill(skill.skillId)}
          >
            <img
              src={skill.imagePath}
              alt={displaySkillName(skill)}
              class="w-full h-full object-contain aspect-square bg-muted/20"
            />
            <div
              class="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] leading-tight text-white px-1 py-1 text-center whitespace-normal break-words min-h-[2.45rem] flex items-end justify-center"
              style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;"
            >
              {skill.name}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="text-xs text-muted-foreground">{t("skillMonitor.searchResonancePrompt", "请输入关键词搜索共鸣技能")}</div>
    {/if}

    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">{t("skillMonitor.selectedResonanceSkills", "已选共鸣技能")}</div>
      <div class="flex flex-wrap gap-2">
        {#each selectedResonanceSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative cursor-pointer rounded-md border border-border/60 overflow-hidden bg-muted/20 w-[72px] h-[78px] hover:border-border hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
            title={skill.name}
            onclick={() => toggleSkill(skill.skillId)}
          >
            <img
              src={skill.imagePath}
              alt={displaySkillName(skill)}
              class="w-full h-full object-contain"
            />
            <div
              class="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] leading-tight text-white px-1 py-1 text-center whitespace-normal break-words min-h-[2.35rem] flex items-end justify-center"
              style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;"
            >
              {skill.name}
            </div>
          </button>
        {/each}
        {#if selectedResonanceSkills.length === 0}
          <div class="text-xs text-muted-foreground">{t("skillMonitor.noResonanceSkillsSelected", "未选择共鸣技能")}</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.monitorPreview", "监控预览")}</h2>
      <p class="text-xs text-muted-foreground">{t("skillMonitor.monitorPreviewDescription", "按选择顺序排列")}</p>
    </div>
    <div class="grid grid-cols-5 gap-2">
      {#each Array(10) as _, idx (idx)}
        {@const skillId = monitoredSkillIds[idx]}
        {@const skill = skillId ? findAnySkillByBaseId(selectedClassKey, skillId) : undefined}
        <button
          type="button"
          class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 aspect-square text-left {skillId
            ? 'hover:border-border hover:bg-muted/30'
            : ''}"
          onclick={() => {
            if (skillId) toggleSkill(skillId);
          }}
        >
          {#if skill?.imagePath}
            <img
              src={skill.imagePath}
              alt={displaySkillName(skill)}
              class="w-full h-full object-cover"
            />
          {:else if skillId}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              #{skillId}
            </div>
          {:else}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              {t("skillMonitor.empty", "空")}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>
