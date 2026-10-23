<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    activeBuffIds,
    displayMap,
    getGroupPosition,
    getGroupScale,
    getResourceValue,
    isEditing,
    monitoredSkillIds,
    selectedClassKey,
    skillDefinitions,
    skillCdLayout,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";
  import { findActiveSkillDerivation } from "$lib/skill-mappings";
  import SkillCdCell from "./SkillCdCell.svelte";
  import { skillCdBounds, skillCdEntries } from "$lib/skill-cd-layout";

  const editing = $derived(isEditing());
  const groupPos = $derived(getGroupPosition("skillCdGroup"));
  const groupScale = $derived(getGroupScale("skillCdGroupScale"));
  const skillIds = $derived(monitoredSkillIds());
  const displays = $derived(displayMap());
  const classKey = $derived(selectedClassKey());
  const skills = $derived(skillDefinitions());
  const activeIds = $derived(activeBuffIds());
  const layout = $derived(skillCdLayout());
  const entries = $derived(skillCdEntries(layout, skillIds));
  const bounds = $derived(editing ? layout : skillCdBounds(layout));
</script>

{#if editing || entries.length > 0}
  <div
    class="overlay-group skill-group"
    class:editable={editing}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    onpointerdown={(e) =>
      startDrag(e, { kind: "group", key: "skillCdGroup" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">{t("gameOverlay.group.skillCd")}</div>
    {/if}

    <div
      class="skill-cd-grid"
      style:grid-template-columns={`repeat(${bounds.columns}, 52px)`}
      style:grid-template-rows={`repeat(${bounds.rows}, 52px)`}
    >
      {#if editing}
        {#each Array(layout.rows * layout.columns) as _, index (index)}
          <div
            class="empty-slot"
            style:grid-row={Math.floor(index / layout.columns) + 1}
            style:grid-column={(index % layout.columns) + 1}
            aria-hidden="true"
          ></div>
        {/each}
      {/if}
      {#each entries as entry (entry.skillId)}
        {@const skillId = entry.skillId}
        {@const display = skillId ? displays.get(skillId) : undefined}
        {@const skill = skillId ? skills.get(skillId) : undefined}
        {@const derivation = skillId
          ? findActiveSkillDerivation(classKey, skillId, activeIds)
          : undefined}
        {@const isDerivedActive = derivation !== undefined}
        {@const displaySkill =
          isDerivedActive && derivation
            ? {
                name: derivation.derivedName,
                imagePath: derivation.derivedImagePath,
              }
            : skill}
        {@const effectiveDisplay =
          isDerivedActive && !derivation?.keepCdWhenDerived
            ? undefined
            : display}
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
            display={effectiveDisplay}
            {resourceBlocked}
            derivedActive={isDerivedActive}
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
            { kind: "group", key: "skillCdGroupScale" },
            groupScale,
          )}
      ></div>
    {/if}
  </div>
{/if}

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
    gap: 6px;
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
