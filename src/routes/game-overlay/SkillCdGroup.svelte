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
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";
  import {
    findAnySkillByBaseId,
    findSkillDerivationBySource,
  } from "$lib/skill-mappings";

  const editing = $derived(isEditing());
  const groupPos = $derived(getGroupPosition("skillCdGroup"));
  const groupScale = $derived(getGroupScale("skillCdGroupScale"));
  const skillIds = $derived(monitoredSkillIds());
  const displays = $derived(displayMap());
  const classKey = $derived(selectedClassKey());
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
      {@const skill = skillId
        ? findAnySkillByBaseId(classKey, skillId)
        : undefined}
      {@const derivation = skillId
        ? findSkillDerivationBySource(classKey, skillId)
        : undefined}
      {@const isDerivedActive = derivation
        ? activeIds.has(derivation.triggerBuffBaseId)
        : false}
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
      {@const isOnCd = effectiveDisplay?.isActive ?? false}
      {@const isUsable = effectiveDisplay?.usable ?? true}
      {@const isUnavailable = !isUsable || resourceBlocked}
      {@const isRechargingUsable = isOnCd && isUsable}
      {@const percent = isOnCd ? (effectiveDisplay?.percent ?? 0) : 0}
      {@const displayText = effectiveDisplay?.text ?? ""}
      {@const chargesAvailable = effectiveDisplay?.chargesAvailable}
      {@const maxCharges = effectiveDisplay?.maxCharges}
      {@const chargesText = effectiveDisplay?.chargesText}

      <div
        class="skill-cell"
        class:empty={!skillId}
        class:on-cd={isOnCd}
        class:derived-active={isDerivedActive}
        class:usable-recharging={isRechargingUsable}
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

        {#if chargesText}
          {@const isFull = chargesAvailable !== undefined && maxCharges !== undefined && chargesAvailable >= maxCharges}
          {@const hasCharges = chargesAvailable !== undefined && chargesAvailable > 0}
          <div
            class="charges-badge"
            class:charges-full={isFull}
            class:charges-partial={hasCharges && !isFull}
            class:charges-empty={chargesAvailable !== undefined && chargesAvailable === 0}
          >{chargesText}</div>
        {/if}

        {#if isUnavailable && isOnCd}
          <div class="cd-overlay" style={`--cd-percent: ${percent}`}>
            {#if displayText}
              <span class="cd-text">{displayText}</span>
            {/if}
          </div>
        {:else if isRechargingUsable}
          <div class="recharge-bar-wrap">
            <div class="recharge-bar" style={`--recharge-pct: ${(1 - percent) * 100}%`}></div>
          </div>
          {#if displayText}
            <span class="recharge-text">{displayText}</span>
          {/if}
        {/if}
      </div>
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

  /* Fully unavailable (on CD / charges depleted): full-cell darkening overlay */
  .cd-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: conic-gradient(
      rgba(0, 0, 0, 0.7) calc(var(--cd-percent) * 360deg),
      transparent calc(var(--cd-percent) * 360deg)
    );
  }

  .cd-text {
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    text-shadow: var(
      --overlay-text-shadow,
      0 1px 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.8)
    );
  }

  /* Usable but recharging: thin bottom progress bar, icon stays bright */
  .recharge-bar-wrap {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 0 0 5px 5px;
    overflow: hidden;
  }

  .recharge-bar {
    height: 100%;
    width: var(--recharge-pct);
    background: linear-gradient(90deg, #60a5fa, #93c5fd);
    border-radius: 0 0 5px 5px;
    transition: width 200ms linear;
  }

  .recharge-text {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.5);
    text-shadow: var(--overlay-text-shadow, 0 1px 2px rgba(0, 0, 0, 1));
    white-space: nowrap;
  }

  /* Charges badge: color-coded by available count */
  .charges-badge {
    position: absolute;
    right: 3px;
    top: 3px;
    padding: 2px 5px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.7);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .charges-badge.charges-full {
    color: #34d399;
  }

  .charges-badge.charges-partial {
    color: #fbbf24;
  }

  .charges-badge.charges-empty {
    color: #94a3b8;
  }
</style>
