<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    dbmPanelStyle,
    getDbmPanelPosition,
    getDbmPanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterDbmRows,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const rows = $derived(monsterDbmRows());
  const styleConfig = $derived(dbmPanelStyle());
  const panelPos = $derived(getDbmPanelPosition());
  const panelScale = $derived(getDbmPanelScale());
</script>

{#if rows.length > 0 || scaffold}
  <div
    class="overlay-group monster-boss-dbm-panel"
    class:editable={editing}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    onpointerdown={(event) =>
      startMonsterDrag(event, { kind: "dbmPanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.bossDbmGroupTag")}</div>
    {/if}

    <div class="dbm-rows" style:gap={`${styleConfig.gap}px`}>
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
        />
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "dbmPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .monster-boss-dbm-panel {
    min-width: 200px;
    max-width: 360px;
  }

  .monster-boss-dbm-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .dbm-rows {
    display: flex;
    flex-direction: column;
  }
</style>
