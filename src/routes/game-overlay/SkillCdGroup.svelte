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
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";
  import { findActiveSkillDerivation } from "$lib/skill-mappings";
  import SkillCdCell from "./SkillCdCell.svelte";

  const editing = $derived(isEditing());
  const groupPos = $derived(getGroupPosition("skillCdGroup"));
  const groupScale = $derived(getGroupScale("skillCdGroupScale"));
  const skillIds = $derived(monitoredSkillIds());
  const displays = $derived(displayMap());
  const classKey = $derived(selectedClassKey());
  const skills = $derived(skillDefinitions());
  const activeIds = $derived(activeBuffIds());
</script>

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

  <div class="skill-cd-grid">
    {#each Array(10) as _, idx (idx)}
      {@const skillId = skillIds[idx]}
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
        isDerivedActive && !derivation?.keepCdWhenDerived ? undefined : display}
      {@const resourceBlocked = skill?.resourceRequirement
        ? getResourceValue(skill.resourceRequirement.resourceId) <
          skill.resourceRequirement.amount
        : false}

      <SkillCdCell
        {skillId}
        name={displaySkill?.name}
        imagePath={displaySkill?.imagePath}
        display={effectiveDisplay}
        {resourceBlocked}
        derivedActive={isDerivedActive}
      />
    {/each}
  </div>

  {#if editing}
    <div
      class="resize-handle"
      onpointerdown={(e) =>
        startResize(e, { kind: "group", key: "skillCdGroupScale" }, groupScale)}
    ></div>
  {/if}
</div>

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
    grid-template-columns: repeat(5, 52px);
    grid-template-rows: repeat(2, 52px);
    gap: 6px;
  }
</style>
