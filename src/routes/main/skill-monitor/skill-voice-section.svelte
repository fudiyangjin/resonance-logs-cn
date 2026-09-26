<script lang="ts">
  /**
   * @file The active profile's skill voice list. It is independent of the
   * cooldown HUD selection above: any class or resonance skill can be voiced
   * without taking a HUD slot. Picking a skill opens its editor; nothing is
   * written until an event is switched on inside `VoiceBindingControl`, and
   * "remove" deletes the skill's bindings.
   */
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { ensureSkillVoiceConfigs } from "$lib/settings-store";
  import {
    findAnySkillByBaseId,
    searchResonanceSkills,
    type SkillDefinition,
  } from "$lib/skill-mappings";
  import {
    activeProfile,
    updateActiveProfile,
  } from "$lib/skill-monitor-profile.svelte.js";
  import { skillConfigIds } from "$lib/voice/subjects/skill";

  interface Props {
    selectedClassKey: string;
    classSkills: SkillDefinition[];
  }

  let { selectedClassKey, classSkills }: Props = $props();

  let resonanceSearch = $state("");
  // The skill whose editor was opened last: a pending editor until its first
  // event is switched on, then an (expanded) row of the configured list.
  let editingSkillId = $state<number | null>(null);
  let expandedSkillIds = $state<number[]>([]);

  const configuredSkillIds = $derived(
    skillConfigIds(activeProfile()?.skillVoiceConfigs),
  );
  const pendingSkillId = $derived(
    editingSkillId !== null && !configuredSkillIds.includes(editingSkillId)
      ? editingSkillId
      : null,
  );
  const resonanceResults = $derived(
    searchResonanceSkills(resonanceSearch).filter(
      (skill) => !configuredSkillIds.includes(skill.skillId),
    ),
  );

  function openSkill(skillId: number) {
    editingSkillId = skillId;
    if (!expandedSkillIds.includes(skillId)) {
      expandedSkillIds = [...expandedSkillIds, skillId];
    }
  }

  function toggleExpanded(skillId: number) {
    expandedSkillIds = expandedSkillIds.includes(skillId)
      ? expandedSkillIds.filter((id) => id !== skillId)
      : [...expandedSkillIds, skillId];
  }

  function removeSkill(skillId: number) {
    updateActiveProfile((profile) => {
      const next = { ...ensureSkillVoiceConfigs(profile.skillVoiceConfigs) };
      delete next[String(skillId)];
      return { ...profile, skillVoiceConfigs: next };
    });
    expandedSkillIds = expandedSkillIds.filter((id) => id !== skillId);
    if (editingSkillId === skillId) editingSkillId = null;
  }
</script>

{#snippet skillHeading(skillId: number)}
  {@const skill = findAnySkillByBaseId(selectedClassKey, skillId)}
  {#if skill?.imagePath}
    <img
      src={skill.imagePath}
      alt=""
      class="h-8 w-8 shrink-0 rounded-md object-cover"
    />
  {/if}
  <span class="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
    {skill?.name || `#${skillId}`}
  </span>
  <span class="shrink-0 text-xs">#{skillId}</span>
{/snippet}

<div
  class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
>
  <div class="flex items-center justify-between gap-3">
    <div>
      <h2 class="text-base font-semibold text-foreground">
        {t("skillMonitor.skillCd.voice.title")}
      </h2>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.skillCd.voice.description")}
      </p>
    </div>
    <div class="shrink-0 text-xs text-muted-foreground">
      {t("skillMonitor.skillCd.voice.configuredCount", {
        count: configuredSkillIds.length,
      })}
    </div>
  </div>

  <div class="space-y-2">
    <div class="text-xs text-muted-foreground">
      {t("skillMonitor.skillCd.voice.classSkills")}
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
      {#each classSkills as skill (skill.skillId)}
        {@const configured = configuredSkillIds.includes(skill.skillId)}
        <button
          type="button"
          class="relative min-h-11 cursor-pointer rounded-lg border overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 {configured
            ? 'border-primary ring-1 ring-primary'
            : 'border-border/60 hover:border-border'}"
          title={skill.name}
          onclick={() => openSkill(skill.skillId)}
        >
          {#if skill.imagePath}
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-cover aspect-square"
            />
          {:else}
            <div
              class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground"
            >
              {t("skillMonitor.common.unconfigured")}
            </div>
          {/if}
          <div
            class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate"
          >
            {skill.name || `#${skill.skillId}`}
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="space-y-2">
    <div class="text-xs text-muted-foreground">
      {t("skillMonitor.skillCd.resonance.title")}
    </div>
    <input
      class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder={t("skillMonitor.skillCd.resonance.placeholder")}
      bind:value={resonanceSearch}
    />
    {#if resonanceSearch.trim().length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
        {#each resonanceResults as skill (skill.skillId)}
          <button
            type="button"
            class="relative min-h-11 cursor-pointer rounded-lg border border-border/60 overflow-hidden transition-colors hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            title={skill.name}
            onclick={() => {
              openSkill(skill.skillId);
              resonanceSearch = "";
            }}
          >
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-contain aspect-square bg-muted/20"
            />
            <div
              class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate"
            >
              {skill.name}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if pendingSkillId !== null}
    <div class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3">
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        {@render skillHeading(pendingSkillId)}
      </div>
      <VoiceBindingControl
        subject={{ kind: "skill", skillId: pendingSkillId }}
      />
    </div>
  {/if}

  <div class="space-y-2">
    {#each configuredSkillIds as skillId (skillId)}
      {@const expanded = expandedSkillIds.includes(skillId)}
      <div class="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 text-left text-xs text-muted-foreground hover:text-foreground"
            onclick={() => toggleExpanded(skillId)}
          >
            {@render skillHeading(skillId)}
            <ChevronDownIcon
              class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 {expanded
                ? 'rotate-180'
                : ''}"
            />
          </button>
          <button
            type="button"
            class="border-border/60 text-destructive hover:bg-destructive/10 shrink-0 rounded border px-2 py-1 text-xs"
            onclick={() => removeSkill(skillId)}
          >
            {t("skillMonitor.common.remove")}
          </button>
        </div>
        {#if expanded}
          <VoiceBindingControl subject={{ kind: "skill", skillId }} />
        {/if}
      </div>
    {:else}
      {#if pendingSkillId === null}
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.skillCd.voice.empty")}
        </p>
      {/if}
    {/each}
  </div>
</div>
