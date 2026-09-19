<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import {
    entityDurationPanelStyle,
    getEntityDurationPanelPosition,
    getEntityDurationPanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterEntityDurationRows,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const rows = $derived(monsterEntityDurationRows());
  const styleConfig = $derived(entityDurationPanelStyle());
  const panelPos = $derived(getEntityDurationPanelPosition());
  const panelScale = $derived(getEntityDurationPanelScale());
</script>

{#if rows.length > 0 || scaffold}
  <div
    class="overlay-group monster-entity-duration-panel"
    class:editable={editing}
    class:has-background={styleConfig.backgroundEnabled === true}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    style:--overlay-text-shadow={overlayTextShadow(
      styleConfig.textShadowEnabled,
    )}
    style:background={overlayPanelBackground(
      styleConfig.backgroundEnabled,
      styleConfig.backgroundOpacity,
    )}
    onpointerdown={(event) =>
      startMonsterDrag(event, { kind: "entityDurationPanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.entityDurationGroupTag")}</div>
    {/if}

    <div class="entity-duration-rows" style:gap={`${styleConfig.gap}px`}>
      {#each rows as row (row.key)}
        <TextBuffRow
          label={row.label}
          valueText={row.valueText}
          progressPercent={row.progressPercent}
          showProgress={row.showProgress}
          nameColor={styleConfig.nameColor}
          valueColor={styleConfig.valueColor}
          progressColor={styleConfig.progressColor}
          progressOpacity={styleConfig.progressOpacity ?? 0.4}
          fontSize={styleConfig.fontSize}
          columnGap={styleConfig.columnGap}
          placeholder={row.isPlaceholder}
          temporal={row.temporal}
        />
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "entityDurationPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .monster-entity-duration-panel {
    min-width: 200px;
    max-width: 360px;
  }

  .monster-entity-duration-panel.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .monster-entity-duration-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .entity-duration-rows {
    display: flex;
    flex-direction: column;
  }
</style>
