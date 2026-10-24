<script lang="ts">
  /**
   * @file The active profile's skill voice list. It is independent of the
   * cooldown HUD selection above: any class, fantasy or duty skill can be
   * voiced without taking a HUD slot, and the picker reflects only this
   * list. Picking a skill opens its editor; nothing is written until an event
   * is switched on inside `VoiceBindingControl`, and "remove" deletes the
   * skill's bindings.
   */
  import ChevronDownIcon from "virtual:icons/lucide/chevron-down";
  import SkillIcon from "$lib/components/skill-icon.svelte";
  import VoiceBindingControl from "$lib/components/voice-binding-control.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { ensureSkillVoiceConfigs } from "$lib/settings-store";
  import {
    findAnySkillByBaseId,
    findResonanceSkill,
    skillBgColour,
    type SkillDefinition,
  } from "$lib/skill-mappings";
  import SkillPicker from "./skill-picker.svelte";
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
  const configuredFantasyIds = $derived(
    configuredSkillIds.filter((id) => findResonanceSkill(id) !== undefined),
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
    <div class="size-8 shrink-0 overflow-hidden rounded-md">
      <SkillIcon imagePath={skill.imagePath} colour={skillBgColour(skillId)} />
    </div>
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

  <SkillPicker
    {classSkills}
    tileState={(skillId) => ({
      selected: configuredSkillIds.includes(skillId),
    })}
    onPick={openSkill}
    pinnedFantasyIds={configuredFantasyIds}
  />

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
