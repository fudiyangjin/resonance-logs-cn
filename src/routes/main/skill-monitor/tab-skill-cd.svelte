<script lang="ts">
  import { findAnySkillByBaseId, type ClassSkillConfig, type ResonanceSkillDefinition, type SkillDefinition } from "$lib/skill-mappings";
  import { tl } from "$lib/i18n/index.svelte";

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

  function formatEffectDuration(durationMs: number | undefined): string {
    if (!durationMs || durationMs <= 0) return "--";
    return `${durationMs % 1000 === 0 ? durationMs / 1000 : (durationMs / 1000).toFixed(1)}s`;
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{tl("Class Selection")}</h2>
      <p class="text-xs text-muted-foreground">
        {tl("Supports the currently configured class skill setups")}
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
        <h2 class="text-base font-semibold text-foreground">{tl("Skill Selection")}</h2>
        <p class="text-xs text-muted-foreground">
          {tl("Monitor up to 10 skills (2 rows x 5 columns)")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {tl("Selected")} {monitoredSkillIds.length}/10
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkills}
        >
          {tl("Clear")}
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
              {tl("Unconfigured")}
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
        <h2 class="text-base font-semibold text-foreground">{tl("Duration Skills")}</h2>
        <p class="text-xs text-muted-foreground">
          {tl("Selected skills are shown as separate icons in the overlay and start a frontend countdown when triggered.")}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          {tl("Selected")} {monitoredSkillDurationIds.length}
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkillDurations}
        >
          {tl("Clear")}
        </button>
      </div>
    </div>

    {#if durationSkills.length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
        {#each durationSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative min-h-11 cursor-pointer group rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {isDurationSelected(skill.skillId)
              ? 'border-primary ring-1 ring-primary'
              : 'border-border/60 hover:border-border'}"
            title={`${skill.name} ${formatEffectDuration(skill.effectDurationMs)}`}
            onclick={() => toggleSkillDuration(skill.skillId)}
          >
            {#if skill.imagePath}
              <img
                src={skill.imagePath}
                alt={skill.name}
                class="w-full h-full object-cover aspect-square"
              />
            {:else}
              <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                {tl("Unconfigured")}
              </div>
            {/if}

            <div class="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {formatEffectDuration(skill.effectDurationMs)}
            </div>
            <div class="absolute inset-x-0 bottom-0 bg-black/55 text-[10px] text-white px-1 py-0.5 truncate">
              {skill.name || `#${skill.skillId}`}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
        {tl("The current class has no configured duration skills yet.")}
      </div>
    {/if}
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">{tl("Resonance Skills")}</h2>
        <p class="text-xs text-muted-foreground">
          {tl("Search and select resonance skills. They share the same 10 monitor slots as regular skills.")}
        </p>
      </div>
      <div class="text-xs text-muted-foreground">
        {tl("Selected")} {selectedResonanceSkills.length}
      </div>
    </div>

    <input
      class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder={tl("Search resonance skill names")}
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
      <div class="text-xs text-muted-foreground">{tl("Enter keywords to search resonance skills")}</div>
    {/if}

    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">{tl("Selected Resonance Skills")}</div>
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
          <div class="text-xs text-muted-foreground">{tl("No resonance skills selected")}</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">{tl("Monitor Preview")}</h2>
      <p class="text-xs text-muted-foreground">{tl("Ordered by selection")}</p>
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
              {tl("Empty")}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>
