<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    activeBuffIds,
    displayMap,
    getResourceValue,
    isEditing,
    monitoredSkillIds,
    selectedClassKey,
    skillDefinitions,
    skillCdRegions,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";
  import {
    findActiveSkillDerivation,
    skillBgColour,
  } from "$lib/skill-mappings";
  import SkillCdCell from "./SkillCdCell.svelte";
  import { skillCdBounds, skillCdEntries } from "$lib/skill-cd-layout";

  const editing = $derived(isEditing());
  const skillIds = $derived(monitoredSkillIds());
  const displays = $derived(displayMap());
  const classKey = $derived(selectedClassKey());
  const skills = $derived(skillDefinitions());
  const activeIds = $derived(activeBuffIds());
  const regions = $derived(skillCdRegions());

  function regionTag(name: string, index: number): string {
    const group = t("gameOverlay.group.skillCd");
    if (regions.length <= 1) return group;
    const label =
      name.trim() ||
      t("skillMonitor.defaults.skillCdRegionName", { index: index + 1 });
    return `${group} · ${label}`;
  }
</script>

{#each regions as region, regionIndex (region.id)}
  {@const entries = skillCdEntries(region, skillIds)}
  {@const bounds = editing ? region : skillCdBounds(region)}
  {#if editing || entries.length > 0}
    <div
      class="overlay-group skill-group"
      class:editable={editing}
      style:left={`${region.position.x}px`}
      style:top={`${region.position.y}px`}
      style:transform={`scale(${region.scale})`}
      style:transform-origin="top left"
      onpointerdown={(e) =>
        startDrag(
          e,
          { kind: "skillCdRegion", regionId: region.id },
          region.position,
        )}
    >
      {#if editing}
        <div class="group-tag">{regionTag(region.name, regionIndex)}</div>
      {/if}

      <div
        class="skill-cd-grid"
        style:grid-template-columns={`repeat(${bounds.columns}, 52px)`}
        style:grid-template-rows={`repeat(${bounds.rows}, 52px)`}
        style:gap={`${region.gap}px`}
      >
        {#if editing}
          {#each Array(region.rows * region.columns) as _, index (index)}
            <div
              class="empty-slot"
              style:grid-row={Math.floor(index / region.columns) + 1}
              style:grid-column={(index % region.columns) + 1}
              aria-hidden="true"
            ></div>
          {/each}
        {/if}
        {#each entries as entry (entry.skillId)}
          {@const skillId = entry.skillId}
          {@const display = displays.get(skillId)}
          {@const skill = skills.get(skillId)}
          {@const derivation = findActiveSkillDerivation(
            classKey,
            skillId,
            activeIds,
          )}
          {@const displaySkill = derivation
            ? {
                name: derivation.derivedName,
                imagePath: derivation.derivedImagePath,
              }
            : skill}
          {@const effectiveDisplay =
            derivation && !derivation.keepCdWhenDerived ? undefined : display}
          {@const resourceBlocked = skill?.resourceRequirement
            ? getResourceValue(skill.resourceRequirement.resourceId) <
              skill.resourceRequirement.amount
            : false}

          <div
            class="skill-slot"
            style:grid-row={entry.row + 1}
            style:grid-column={entry.column + 1}
          >
            <SkillCdCell
              {skillId}
              name={displaySkill?.name}
              imagePath={displaySkill?.imagePath}
              bgColour={skillBgColour(derivation?.derivedSkillId ?? skillId)}
              display={effectiveDisplay}
              {resourceBlocked}
              derivedActive={derivation !== undefined}
            />
          </div>
        {/each}
      </div>

      {#if editing}
        <div
          class="resize-handle"
          onpointerdown={(e) =>
            startResize(
              e,
              { kind: "skillCdRegion", regionId: region.id },
              region.scale,
            )}
        ></div>
      {/if}
    </div>
  {/if}
{/each}

<style>
  .skill-group.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .skill-cd-grid {
    display: grid;
  }

  .empty-slot {
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    pointer-events: none;
  }

  .skill-slot {
    z-index: 1;
  }
</style>
