<script lang="ts">
  import {
    activeBuffIds,
    displayMap,
    getGroupPosition,
    getGroupScale,
    getResourceValue,
    isEditing,
    monitoredSkillIds,
    selectedClassKey,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import {
    findAnySkillByBaseId,
    findSkillDerivationBySource,
  } from "$lib/skill-mappings";

  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);

  const editing = $derived(isEditing());
  const groupPos = $derived(getGroupPosition("skillCdGroup"));
  const groupScale = $derived(getGroupScale("skillCdGroupScale"));
  const skillIds = $derived(monitoredSkillIds());
  const displays = $derived(displayMap());
  const classKey = $derived(selectedClassKey());
  const activeIds = $derived(activeBuffIds());
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="overlay-group skill-group"
  class:editable={editing}
  style:left={`${groupPos.x}px`}
  style:top={`${groupPos.y}px`}
  style:transform={`scale(${groupScale})`}
  style:transform-origin="top left"
  onpointerdown={(e) => startDrag(e, { kind: "group", key: "skillCdGroup" }, groupPos)}
>
  {#if editing}
    <div class="group-tag">{t("overlay.skillCd", "技能CD区")}</div>
  {/if}

  <div class="skill-cd-grid">
    {#each Array(10) as _, idx (idx)}
      {@const skillId = skillIds[idx]}
      {@const display = skillId ? displays.get(skillId) : undefined}
      {@const skill = skillId ? findAnySkillByBaseId(classKey, skillId) : undefined}
      {@const derivation = skillId
        ? findSkillDerivationBySource(classKey, skillId)
        : undefined}
      {@const isDerivedActive = derivation
        ? activeIds.has(derivation.triggerBuffBaseId)
        : false}
      {@const displaySkill = isDerivedActive && derivation
        ? { name: derivation.derivedName, imagePath: derivation.derivedImagePath }
        : skill}
      {@const effectiveDisplay = isDerivedActive && !derivation?.keepCdWhenDerived
        ? undefined
        : display}
      {@const resourceBlocked = skill?.resourceRequirement
        ? getResourceValue(skill.resourceRequirement.resourceIndex) <
          skill.resourceRequirement.amount
        : false}
      {@const isOnCd = effectiveDisplay?.isActive ?? false}
      {@const isUnavailable = isOnCd || resourceBlocked}
      {@const percent = isOnCd ? effectiveDisplay?.percent ?? 0 : 0}
      {@const displayText = effectiveDisplay?.text ?? ""}

      <div
        class="skill-cell"
        class:empty={!skillId}
        class:on-cd={isOnCd}
        class:derived-active={isDerivedActive}
      >
        {#if displaySkill?.imagePath}
          <img
            src={displaySkill.imagePath}
            alt={displaySkill.name}
            class="skill-icon"
            class:dimmed={isUnavailable}
          />
        {:else if skillId}
          <div class="skill-fallback">#{skillId}</div>
        {/if}

        {#if effectiveDisplay?.chargesText}
          <div class="charges-badge">{effectiveDisplay.chargesText}</div>
        {/if}

        {#if isOnCd}
          <div class="cd-overlay" style={`--cd-percent: ${percent}`}>
            {#if displayText}
              <span class="cd-text">{displayText}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if editing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
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

<style>
  .skill-group.editable {
    outline: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  }

  .skill-cd-grid {
    display: grid;
    grid-template-columns: repeat(5, 52px);
    grid-template-rows: repeat(2, 52px);
    gap: 6px;
  }

  .skill-cell {
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .skill-cell.empty {
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .skill-cell.derived-active {
    border-color: rgba(255, 216, 102, 0.85);
    box-shadow: 0 0 8px rgba(255, 216, 102, 0.6);
  }

  .skill-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .skill-icon.dimmed {
    filter: grayscale(80%) brightness(0.5);
  }

  .skill-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
  }

  .cd-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: conic-gradient(
      rgba(0, 0, 0, 0.65) calc(var(--cd-percent) * 360deg),
      transparent calc(var(--cd-percent) * 360deg)
    );
  }

  .cd-text {
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }

  .charges-badge {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 1px 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
  }
</style>
