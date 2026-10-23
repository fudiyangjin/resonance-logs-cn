<script lang="ts">
  import {
    getDutySkills,
    type DutySkillGroup,
    type ClassSkillConfig,
    type ResonanceSkillDefinition,
    type SkillDefinition,
  } from "$lib/skill-mappings";
  import { MAX_MONITORED_SKILLS, type SkillCdAction, type SkillCdLayout, type SkillCdPosition } from "$lib/skill-cd-layout";
  import SkillCdLayoutEditor from "./skill-cd-layout-editor.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import SkillVoiceSection from "./skill-voice-section.svelte";

  interface Props {
    profileId: string;
    skillCdLayout: SkillCdLayout;
    onSkillCdAction: (action: SkillCdAction, profileId: string, classKey: string) => boolean;
    classConfigs: ClassSkillConfig[];
    selectedClassKey: string;
    classSkills: SkillDefinition[];
    monitoredSkillIds: number[];
    resonanceSearch: string;
    filteredResonanceSkills: ResonanceSkillDefinition[];
    selectedResonanceSkills: ResonanceSkillDefinition[];
    setSelectedClass: (classKey: string) => void;
    isSelected: (skillId: number) => boolean;
    setResonanceSearch: (value: string) => void;
  }

  let {
    profileId,
    skillCdLayout,
    onSkillCdAction,
    classConfigs,
    selectedClassKey,
    classSkills,
    monitoredSkillIds,
    resonanceSearch,
    filteredResonanceSkills,
    selectedResonanceSkills,
    setSelectedClass,
    isSelected,
    setResonanceSearch,
  }: Props = $props();

  let selectedCell = $state<SkillCdPosition | null>(null);
  const dutySkills = $derived(getDutySkills());
  const dutyGroups: DutySkillGroup[] = [
    "attack", "survival", "support", "encyclopedia",
  ];
  const selectedDutySkills = $derived(
    dutySkills.filter((skill) => monitoredSkillIds.includes(skill.skillId)),
  );
  const layoutSkills = $derived([
    ...classSkills, ...selectedDutySkills, ...selectedResonanceSkills,
  ]);

  function changeLayout(action: SkillCdAction): boolean {
    return onSkillCdAction(action, profileId, selectedClassKey);
  }

  function toggleSkill(skillId: number) {
    changeLayout({ kind: "toggle", skillId, preferredCell: selectedCell ?? undefined });
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
          {t("skillMonitor.common.selectedTotal", { count: monitoredSkillIds.length, total: MAX_MONITORED_SKILLS })}
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={() => changeLayout({ kind: "clear" })}
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

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{t("skillMonitor.skillCd.duty.title")}</h2>
        <p class="text-xs text-muted-foreground">{t("skillMonitor.skillCd.duty.description")}</p>
      </div>
      <div class="text-xs text-muted-foreground">
        {t("skillMonitor.common.selectedCount", { count: selectedDutySkills.length })}
      </div>
    </div>
    {#each dutyGroups as group (group)}
      <div class="space-y-2">
        <h3 class="text-sm font-medium">{t(`skillMonitor.skillCd.duty.${group}`)}</h3>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {#each dutySkills.filter((skill) => skill.group === group) as skill (skill.skillId)}
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg border p-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isSelected(skill.skillId)
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border/60 hover:bg-muted/30'}"
              title={`${skill.name} (#${skill.skillId})`}
              aria-pressed={isSelected(skill.skillId)}
              onclick={() => toggleSkill(skill.skillId)}
            >
              <img src={skill.imagePath} alt="" class="size-11 shrink-0 object-contain" />
              <span class="min-w-0 flex-1 text-xs break-words">{skill.name}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <SkillCdLayoutEditor
    layout={skillCdLayout}
    skills={layoutSkills}
    {selectedCell}
    onSelect={(cell) => selectedCell = cell}
    onAction={changeLayout}
  />

  <SkillVoiceSection {selectedClassKey} {classSkills} />
</div>
