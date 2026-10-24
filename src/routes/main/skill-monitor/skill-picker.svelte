<script lang="ts" module>
  export type SkillTileState = {
    selected: boolean;
    /** Short corner mark, e.g. the region a skill already sits in. */
    badge?: string | undefined;
    badgeTitle?: string | undefined;
  };
</script>

<script lang="ts">
  /**
   * @file Class / fantasy / duty skill picker shared by the cooldown HUD
   * selection and the skill voice list. It owns only the browsing state (tab
   * and search); what a tile shows and what a click does belong to the caller.
   */
  import type { Snippet } from "svelte";
  import SkillIcon from "$lib/components/skill-icon.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    findResonanceSkill,
    getDutySkills,
    searchResonanceSkills,
    skillBgColour,
    type DutySkillGroup,
    type SkillDisplayInfo,
  } from "$lib/skill-mappings";

  type PickerTab = "class" | "fantasy" | "duty";

  interface Props {
    classSkills: readonly SkillDisplayInfo[];
    tileState: (skillId: number) => SkillTileState;
    onPick: (skillId: number) => void;
    /** Fantasy skills listed while the search is empty: the caller's own
     * picks, so they stay reachable without searching again. */
    pinnedFantasyIds: readonly number[];
    heading?: Snippet;
  }

  let { classSkills, tileState, onPick, pinnedFantasyIds, heading }: Props =
    $props();

  const DUTY_GROUPS: readonly DutySkillGroup[] = [
    "attack",
    "survival",
    "support",
    "encyclopedia",
  ];

  let tab = $state<PickerTab>("class");
  let search = $state("");

  const dutySkills = $derived(getDutySkills());
  const pinnedFantasySkills = $derived(
    pinnedFantasyIds.flatMap((id) => findResonanceSkill(id) ?? []),
  );
  const fantasyResults = $derived(
    search.trim() ? searchResonanceSkills(search) : pinnedFantasySkills,
  );

  function usedCount(skills: readonly SkillDisplayInfo[]): number {
    return skills.filter((skill) => {
      const state = tileState(skill.skillId);
      return state.selected || state.badge !== undefined;
    }).length;
  }

  const tabs = $derived<{ key: PickerTab; label: string; count: number }[]>([
    {
      key: "class",
      label: t("skillMonitor.skillCd.voice.classSkills"),
      count: usedCount(classSkills),
    },
    {
      key: "fantasy",
      label: t("skillMonitor.skillCd.resonance.title"),
      count: pinnedFantasySkills.length,
    },
    {
      key: "duty",
      label: t("skillMonitor.skillCd.duty.title"),
      count: usedCount(dutySkills),
    },
  ]);
</script>

{#snippet tile(skill: SkillDisplayInfo)}
  {@const state = tileState(skill.skillId)}
  <button
    type="button"
    class="relative cursor-pointer overflow-hidden rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 {state.selected
      ? 'border-primary ring-1 ring-primary'
      : state.badge !== undefined
        ? 'border-primary/40 hover:border-primary/70'
        : 'border-border/60 hover:border-border'}"
    title={state.badgeTitle ?? `${skill.name} (#${skill.skillId})`}
    aria-pressed={state.selected}
    onclick={() => onPick(skill.skillId)}
  >
    <div class="aspect-square w-full">
      <SkillIcon
        imagePath={skill.imagePath}
        alt={skill.name}
        colour={skillBgColour(skill.skillId)}
      />
    </div>
    {#if state.badge !== undefined}
      <span
        class="bg-primary text-primary-foreground absolute top-0.5 right-0.5 z-10 min-w-4 rounded px-1 text-center text-[10px] leading-4 font-semibold"
      >
        {state.badge}
      </span>
    {/if}
    <div
      class="absolute inset-x-0 bottom-0 z-10 truncate bg-black/65 px-1 py-0.5 text-[10px] text-white"
    >
      {skill.name || `#${skill.skillId}`}
    </div>
  </button>
{/snippet}

{#snippet tileGrid(skills: readonly SkillDisplayInfo[])}
  <div class="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
    {#each skills as skill (skill.skillId)}
      {@render tile(skill)}
    {/each}
  </div>
{/snippet}

<div class="space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="min-w-0">{@render heading?.()}</div>
    <div
      class="border-border/60 bg-muted/30 inline-flex rounded-lg border p-0.5"
      role="tablist"
    >
      {#each tabs as item (item.key)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === item.key}
          class="cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors {tab ===
          item.key
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (tab = item.key)}
        >
          {item.label}
          {#if item.count > 0}
            <span class="ml-1 opacity-75">{item.count}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  {#if tab === "class"}
    {@render tileGrid(classSkills)}
  {:else if tab === "fantasy"}
    <input
      class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-64"
      placeholder={t("skillMonitor.skillCd.resonance.placeholder")}
      bind:value={search}
    />
    {#if fantasyResults.length > 0}
      {@render tileGrid(fantasyResults)}
    {:else}
      <p class="text-muted-foreground text-xs">
        {search.trim()
          ? t("skillMonitor.skillCd.picker.noResults")
          : t("skillMonitor.skillCd.resonance.searchPrompt")}
      </p>
    {/if}
  {:else}
    {#each DUTY_GROUPS as group (group)}
      <div class="space-y-2">
        <h3 class="text-muted-foreground text-xs font-medium">
          {t(`skillMonitor.skillCd.duty.${group}`)}
        </h3>
        {@render tileGrid(dutySkills.filter((skill) => skill.group === group))}
      </div>
    {/each}
  {/if}
</div>
