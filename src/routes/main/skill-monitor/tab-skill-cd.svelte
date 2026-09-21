<script lang="ts">
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import { findAnySkillByBaseId, type ClassSkillConfig, type ResonanceSkillDefinition, type SkillDefinition } from "$lib/skill-mappings";
  import { t } from "$lib/i18n/index.svelte";

  interface Props {
    classConfigs: ClassSkillConfig[];
    selectedClassKey: string;
    classSkills: SkillDefinition[];
    monitoredSkillIds: number[];
    resonanceSearch: string;
    filteredResonanceSkills: ResonanceSkillDefinition[];
    selectedResonanceSkills: ResonanceSkillDefinition[];
    setSelectedClass: (classKey: string) => void;
    toggleSkill: (skillId: number) => void;
    isSelected: (skillId: number) => boolean;
    clearSkills: () => void;
    setResonanceSearch: (value: string) => void;
  }

  let {
    classConfigs,
    selectedClassKey,
    classSkills,
    monitoredSkillIds,
    resonanceSearch,
    filteredResonanceSkills,
    selectedResonanceSkills,
    setSelectedClass,
    toggleSkill,
    isSelected,
    clearSkills,
    setResonanceSearch,
  }: Props = $props();

  let voiceExpandedSkillIds = $state<number[]>([]);

  function toggleVoiceExpanded(skillId: number) {
    voiceExpandedSkillIds = voiceExpandedSkillIds.includes(skillId)
      ? voiceExpandedSkillIds.filter((existing) => existing !== skillId)
      : [...voiceExpandedSkillIds, skillId];
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillCd.class.title")}</h2>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.skillCd.class.description")}
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
          {config.className}
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillCd.skills.title")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.skillCd.skills.description")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {t("skillMonitor.common.selectedTotal", { count: monitoredSkillIds.length, total: 10 })}
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkills}
        >
          {t("skillMonitor.common.clear")}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
      {#each classSkills as skill (skill.skillId)}
        <button
          type="button"
          class="relative min-h-11 cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
            ? 'border-primary ring-1 ring-primary'
            : 'border-border/60 hover:border-border'}"
          onclick={() => toggleSkill(skill.skillId)}
        >
          {#if skill.imagePath}
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-cover aspect-square"
            />
          {:else}
            <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
              {t("skillMonitor.common.unconfigured")}
            </div>
          {/if}
          <div class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
            {skill.name || `#${skill.skillId}`}
          </div>
        </button>
      {/each}
    </div>
  </div>


  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillCd.resonance.title")}</h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.skillCd.resonance.description")}
        </p>
      </div>
      <div class="text-xs text-muted-foreground">
        {t("skillMonitor.common.selectedCount", { count: selectedResonanceSkills.length })}
      </div>
    </div>

    <input
      class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder={t("skillMonitor.skillCd.resonance.placeholder")}
      value={resonanceSearch}
      oninput={(event) => setResonanceSearch((event.currentTarget as HTMLInputElement).value)}
    />

    {#if resonanceSearch.trim().length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
        {#each filteredResonanceSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative min-h-11 cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
              ? 'border-primary ring-1 ring-primary'
              : 'border-border/60 hover:border-border'}"
            title={skill.name}
            onclick={() => toggleSkill(skill.skillId)}
          >
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-contain aspect-square bg-muted/20"
            />
            <div class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
              {skill.name}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.resonance.searchPrompt")}</div>
    {/if}

    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.resonance.selectedTitle")}</div>
      <div class="flex flex-wrap gap-2">
        {#each selectedResonanceSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative min-h-11 cursor-pointer rounded-md border border-border/60 overflow-hidden bg-muted/20 size-12 hover:border-border hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
            title={skill.name}
            onclick={() => toggleSkill(skill.skillId)}
          >
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-contain"
            />
            <div class="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white px-1 py-0.5 truncate">
              {skill.name}
            </div>
          </button>
        {/each}
        {#if selectedResonanceSkills.length === 0}
          <div class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.resonance.noneSelected")}</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillCd.preview.title")}</h2>
      <p class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.preview.description")}</p>
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
              alt={skill.name}
              class="w-full h-full object-cover"
            />
          {:else if skillId}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              #{skillId}
            </div>
          {:else}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              {t("skillMonitor.common.empty")}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillCd.voice.title")}</h2>
      <p class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.voice.description")}</p>
    </div>
    {#if monitoredSkillIds.length === 0}
      <p class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.voice.empty")}</p>
    {:else}
      <div class="space-y-2">
        {#each monitoredSkillIds as skillId (skillId)}
          {@const skill = findAnySkillByBaseId(selectedClassKey, skillId)}
          {@const expanded = voiceExpandedSkillIds.includes(skillId)}
          <div class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3">
            <button
              type="button"
              class="flex w-full items-center gap-3 text-left text-xs text-muted-foreground hover:text-foreground"
              onclick={() => toggleVoiceExpanded(skillId)}
            >
              {#if skill?.imagePath}
                <img src={skill.imagePath} alt="" class="h-8 w-8 shrink-0 rounded-md object-cover" />
              {/if}
              <span class="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {skill?.name || `#${skillId}`}
              </span>
              <span class="shrink-0 text-xs">#{skillId}</span>
              <ChevronDownIcon
                class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
              />
            </button>
            {#if expanded}
              <VoiceBindingControl subject={{ kind: "skill", skillId }} />
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
