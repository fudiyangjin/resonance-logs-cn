<script lang="ts">
  /**
   * @file Preset icon picker for a damage group: class tabs, and for talent
   * icons the class-wide / per-spec talent tree sections. Controlled: the
   * parent owns the selected path and applies `onSelect`.
   */
  import { untrack } from "svelte";
  import SkillIcon from "$lib/components/skill-icon.svelte";
  import { toSpecLabel } from "$lib/class-labels";
  import { TALENT_STAGE_SPECS } from "$lib/config/talent-stages";
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { activeLoadout } from "$lib/loadouts.svelte.js";
  import { getClassConfigs } from "$lib/skill-mappings";
  import {
    SKILL_ICONS_BY_CLASS,
    TALENT_COMMON_ICONS,
    TALENT_COMMON_TAB,
    iconOwnerClasses,
    initialIconPickerClass,
    presetIconTitle,
    talentIconSections,
  } from "$lib/skill-damage-icons";

  interface Props {
    /** Currently selected icon path (`group.iconPath`). */
    selected: string;
    /** Icon plate background, already resolved with the group's opacity. */
    background: string;
    onSelect: (path: string) => void;
  }

  let { selected, background, onSelect }: Props = $props();

  type Category = "skill" | "talent";
  type Section = { key: string; title: string; icons: readonly string[] };

  const isTalentPath = (path: string) => path.startsWith("/images/talent/");

  const locale = $derived(getLocale());
  const classes = $derived(getClassConfigs(locale));

  // Initial values only: the editor is keyed per profile and group, so a
  // new group remounts the picker. Later icon picks never move the tab.
  let category = $state<Category>(
    untrack(() => (isTalentPath(selected) ? "talent" : "skill")),
  );
  let classKey = $state(
    untrack(() =>
      initialIconPickerClass({
        path: selected,
        linkedStageId: activeLoadout()?.linkedTalentStageCfgId,
        classKeys: classes.map((config) => config.classKey),
      }),
    ),
  );

  const tabs = $derived([
    ...classes.map((config) => ({
      key: config.classKey,
      label: config.className,
    })),
    ...(category === "talent"
      ? [{ key: TALENT_COMMON_TAB, label: t("skillDamage.iconCommon") }]
      : []),
  ]);
  // The common tab only exists for talent icons.
  const activeTab = $derived(
    tabs.some((tab) => tab.key === classKey) ? classKey : (tabs[0]?.key ?? ""),
  );
  // Tabs holding the selected icon, marked so it can be found again.
  const selectedTabs = $derived(
    isTalentPath(selected) === (category === "talent")
      ? iconOwnerClasses(selected)
      : [],
  );

  const sections = $derived.by<Section[]>(() => {
    if (category === "skill")
      return [
        {
          key: "skill",
          title: "",
          icons: SKILL_ICONS_BY_CLASS.get(activeTab) ?? [],
        },
      ];
    if (activeTab === TALENT_COMMON_TAB)
      return [{ key: "common", title: "", icons: TALENT_COMMON_ICONS }];
    return talentIconSections(activeTab)
      .filter((section) => section.icons.length > 0)
      .map((section) => ({
        key: String(section.stageId ?? "general"),
        title:
          section.stageId === null
            ? t("skillDamage.talentGeneral")
            : toSpecLabel(TALENT_STAGE_SPECS[section.stageId] ?? ""),
        icons: section.icons,
      }));
  });
</script>

{#snippet iconButton(path: string, index: number)}
  {@const title =
    presetIconTitle(path, locale) ||
    t("skillDamage.iconNumber", { number: index + 1 })}
  <button
    type="button"
    class="h-12 w-12 rounded border-2 p-1 {selected === path
      ? 'border-primary bg-primary/20'
      : 'hover:border-border border-transparent'}"
    aria-label={title}
    aria-pressed={selected === path}
    {title}
    onclick={() => onSelect(path)}
  >
    <SkillIcon imagePath={path} {background} />
  </button>
{/snippet}

<div class="space-y-3">
  <label class="flex items-center gap-2 text-sm"
    >{t("skillDamage.iconCategory")}
    <select class="bg-background rounded border p-2" bind:value={category}>
      <option value="skill">{t("skillDamage.skillIcons")}</option>
      <option value="talent">{t("skillDamage.talentIcons")}</option>
    </select>
  </label>
  <div class="flex flex-wrap gap-2">
    {#each tabs as tab (tab.key)}
      <button
        type="button"
        class="relative rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
        tab.key
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        aria-pressed={activeTab === tab.key}
        onclick={() => (classKey = tab.key)}
      >
        {tab.label}
        {#if selectedTabs.includes(tab.key)}
          <span
            class="bg-primary ring-background absolute -top-1 -right-1 size-2.5 rounded-full ring-2"
            aria-hidden="true"
          ></span>
        {/if}
      </button>
    {/each}
  </div>
  <div class="max-h-96 space-y-3 overflow-y-auto p-1">
    {#each sections as section (section.key)}
      <div class="space-y-1.5">
        {#if section.title}
          <h4 class="text-muted-foreground text-xs font-medium">
            {section.title}
          </h4>
        {/if}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2">
          {#each section.icons as path, index (path)}
            {@render iconButton(path, index)}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
