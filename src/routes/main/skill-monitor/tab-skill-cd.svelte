<script lang="ts">
  import PlusIcon from "virtual:icons/lucide/plus";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import {
    findAnySkillByBaseId,
    findResonanceSkill,
    type ClassSkillConfig,
    type SkillDefinition,
  } from "$lib/skill-mappings";
  import {
    MAX_MONITORED_SKILLS,
    MAX_SKILL_CD_REGIONS,
    isSkillCdPositionInBounds,
    skillCdRegionIndexOf,
    type SkillCdAction,
    type SkillCdGridAction,
    type SkillCdPosition,
    type SkillCdRegion,
  } from "$lib/skill-cd-layout";
  import SkillCdLayoutEditor from "./skill-cd-layout-editor.svelte";
  import SkillPicker, { type SkillTileState } from "./skill-picker.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { blurOnEnter } from "$lib/utils.svelte";
  import SkillVoiceSection from "./skill-voice-section.svelte";

  interface Props {
    profileId: string;
    skillCdRegions: SkillCdRegion[];
    onSkillCdAction: (
      action: SkillCdAction,
      profileId: string,
      classKey: string,
    ) => boolean;
    classConfigs: ClassSkillConfig[];
    selectedClassKey: string;
    classSkills: SkillDefinition[];
    monitoredSkillIds: number[];
    setSelectedClass: (classKey: string) => void;
  }

  let {
    profileId,
    skillCdRegions,
    onSkillCdAction,
    classConfigs,
    selectedClassKey,
    classSkills,
    monitoredSkillIds,
    setSelectedClass,
  }: Props = $props();

  // A vanished region (deleted here or in another window) falls back to the
  // first one; a selected cell only counts inside its own region's bounds.
  let activeRegionId = $state("");
  let selection = $state<{ regionId: string; cell: SkillCdPosition } | null>(
    null,
  );
  let pendingDelete = $state<{
    regionId: string;
    name: string;
    count: number;
  } | null>(null);
  let confirmDeleteOpen = $state(false);

  const activeIndex = $derived(
    Math.max(
      0,
      skillCdRegions.findIndex((region) => region.id === activeRegionId),
    ),
  );
  const activeRegion = $derived(skillCdRegions[activeIndex]!);
  const activeCount = $derived(Object.keys(activeRegion.positions).length);
  const selectedCell = $derived(
    selection?.regionId === activeRegion.id &&
      isSkillCdPositionInBounds(selection.cell, activeRegion)
      ? selection.cell
      : null,
  );
  const activeSkills = $derived(
    Object.keys(activeRegion.positions).flatMap(
      (id) => findAnySkillByBaseId(selectedClassKey, Number(id)) ?? [],
    ),
  );
  const monitoredFantasyIds = $derived(
    monitoredSkillIds.filter((id) => findResonanceSkill(id) !== undefined),
  );

  function regionLabel(region: SkillCdRegion, index: number): string {
    return (
      region.name.trim() ||
      t("skillMonitor.defaults.skillCdRegionName", { index: index + 1 })
    );
  }

  function change(action: SkillCdAction): boolean {
    return onSkillCdAction(action, profileId, selectedClassKey);
  }

  function changeGrid(action: SkillCdGridAction): boolean {
    return change({ ...action, regionId: activeRegion.id });
  }

  function toggleSkill(skillId: number) {
    changeGrid({
      kind: "toggle",
      skillId,
      preferredCell: selectedCell ?? undefined,
    });
  }

  function tileState(skillId: number): SkillTileState {
    const index = skillCdRegionIndexOf(skillCdRegions, skillId);
    if (index === -1) return { selected: false };
    if (index === activeIndex) return { selected: true };
    return {
      selected: false,
      badge: String(index + 1),
      badgeTitle: t("skillMonitor.skillCd.region.inRegion", {
        region: regionLabel(skillCdRegions[index]!, index),
      }),
    };
  }

  function addRegion() {
    const id = `skill_cd_region_${Date.now()}`;
    if (change({ kind: "addRegion", id })) activeRegionId = id;
  }

  function requestRemoveRegion() {
    const regionId = activeRegion.id;
    if (activeCount === 0) {
      change({ kind: "removeRegion", regionId });
      return;
    }
    pendingDelete = {
      regionId,
      name: regionLabel(activeRegion, activeIndex),
      count: activeCount,
    };
    confirmDeleteOpen = true;
  }
</script>

<ConfirmDialog
  bind:open={confirmDeleteOpen}
  title={t("skillMonitor.skillCd.region.deleteTitle", {
    name: pendingDelete?.name ?? "",
  })}
  description={t("skillMonitor.skillCd.region.deleteDescription", {
    count: pendingDelete?.count ?? 0,
  })}
  confirmText={t("common.delete")}
  cancelText={t("common.cancel")}
  onconfirm={() => {
    if (pendingDelete)
      change({ kind: "removeRegion", regionId: pendingDelete.regionId });
  }}
  variant="destructive"
/>

{#snippet regionName()}
  <label class="flex flex-col gap-1 text-xs text-muted-foreground">
    {t("skillMonitor.skillCd.region.name")}
    <input
      class="w-36 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      value={activeRegion.name}
      placeholder={regionLabel(activeRegion, activeIndex)}
      onchange={(event) =>
        change({
          kind: "renameRegion",
          regionId: activeRegion.id,
          name: event.currentTarget.value,
        })}
      {@attach blurOnEnter}
    />
  </label>
{/snippet}

{#snippet regionActions()}
  <button
    type="button"
    class="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
    disabled={activeCount === 0}
    onclick={() => changeGrid({ kind: "clear" })}
  >
    {t("skillMonitor.skillCd.region.clear")}
  </button>
  <button
    type="button"
    class="rounded border border-border/60 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
    disabled={skillCdRegions.length <= 1}
    title={skillCdRegions.length <= 1
      ? t("skillMonitor.skillCd.layout.error.lastRegion")
      : undefined}
    onclick={requestRemoveRegion}
  >
    {t("skillMonitor.skillCd.region.delete")}
  </button>
{/snippet}

<div class="space-y-6">
  <div
    class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-base font-semibold text-foreground">
        {t("skillMonitor.skillCd.class.title")}
      </h2>
      <p class="text-xs text-muted-foreground">
        {t("skillMonitor.skillCd.class.description")}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each classConfigs as config (config.classKey)}
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {selectedClassKey ===
          config.classKey
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => setSelectedClass(config.classKey)}
        >
          {config.className}
        </button>
      {/each}
    </div>
  </div>

  <div
    class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">
          {t("skillMonitor.skillCd.preview.title")}
        </h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.skillCd.preview.description")}
        </p>
      </div>
      <div class="shrink-0 text-xs text-muted-foreground">
        {t("skillMonitor.common.selectedTotal", {
          count: monitoredSkillIds.length,
          total: MAX_MONITORED_SKILLS,
        })}
      </div>
    </div>

    <div
      class="flex flex-wrap items-center gap-2"
      role="tablist"
      aria-label={t("skillMonitor.skillCd.preview.title")}
    >
      {#each skillCdRegions as region, index (region.id)}
        <button
          type="button"
          role="tab"
          aria-selected={index === activeIndex}
          class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors {index ===
          activeIndex
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => (activeRegionId = region.id)}
        >
          {regionLabel(region, index)}
          <span class="ml-1 text-xs opacity-75"
            >{Object.keys(region.positions).length}</span
          >
        </button>
      {/each}
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/80 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={skillCdRegions.length >= MAX_SKILL_CD_REGIONS}
        onclick={addRegion}
      >
        <PlusIcon class="size-3.5" />
        {t("skillMonitor.skillCd.region.add")}
      </button>
    </div>

    {#key activeRegion.id}
      <SkillCdLayoutEditor
        layout={activeRegion}
        skills={activeSkills}
        {selectedCell}
        onSelect={(cell) =>
          (selection = cell ? { regionId: activeRegion.id, cell } : null)}
        onAction={changeGrid}
        leading={regionName}
        trailing={regionActions}
      />
    {/key}
  </div>

  <div
    class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <SkillPicker
      {classSkills}
      {tileState}
      onPick={toggleSkill}
      pinnedFantasyIds={monitoredFantasyIds}
    >
      {#snippet heading()}
        <h2 class="text-base font-semibold text-foreground">
          {t("skillMonitor.skillCd.skills.title")}
        </h2>
        <p class="text-xs text-muted-foreground">
          {t("skillMonitor.skillCd.region.addTo", {
            region: regionLabel(activeRegion, activeIndex),
          })}
        </p>
      {/snippet}
    </SkillPicker>
  </div>

  <SkillVoiceSection {selectedClassKey} {classSkills} />
</div>
