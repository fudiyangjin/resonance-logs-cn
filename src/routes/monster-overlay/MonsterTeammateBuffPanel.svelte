<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { overlayNow } from "../game-overlay/overlay-clock.svelte.js";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import {
    resolveTeammateColumnColors,
    type TeammateColumnColors,
  } from "$lib/teammate-buff-columns";
  import {
    getTeammatePanelPosition,
    getTeammatePanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterTeammateColumns,
    monsterTeammateRows,
    startMonsterDrag,
    startMonsterResize,
    teammateBuffColumnStyles,
    teammatePanelStyle,
  } from "./monster-state.svelte.js";
  import MonsterTeammateBuffCell from "./MonsterTeammateBuffCell.svelte";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const rows = $derived(monsterTeammateRows());
  const columns = $derived(monsterTeammateColumns());
  const styleConfig = $derived(teammatePanelStyle());
  const panelPos = $derived(getTeammatePanelPosition());
  const panelScale = $derived(getTeammatePanelScale());
  const displayColumns = $derived.by(() =>
    columns.length > 0
      ? columns
      : (rows[0]?.cells.map((cell) => ({
          key: cell.key,
          label: cell.buffName,
        })) ?? []),
  );
  const panelColors: TeammateColumnColors = $derived({
    progressColor: styleConfig.progressColor,
    valueColor: styleConfig.valueColor,
  });
  // Resolved per column here rather than in the display projection, so a
  // color edit re-renders cells without rebuilding the rows.
  const columnColors = $derived.by(() => {
    const styles = teammateBuffColumnStyles();
    return displayColumns.map((column) =>
      resolveTeammateColumnColors(styles, column.key, panelColors),
    );
  });
  const teammateNowMs = $derived(Math.floor(overlayNow() / 1000) * 1000);
</script>

{#if rows.length > 0 || scaffold}
  <div
    class="overlay-group teammate-buff-panel"
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
      startMonsterDrag(event, { kind: "teammatePanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.teammateGroupTag")}</div>
    {/if}

    <div
      class="matrix-shell"
      style:--buff-count={Math.max(displayColumns.length, 1)}
      style:--font-size={`${styleConfig.fontSize}px`}
      style:--column-gap={`${styleConfig.columnGap}px`}
      style:--name-column-width={`${styleConfig.nameColumnWidth}px`}
      style:--buff-column-width={`${styleConfig.buffColumnWidth}px`}
      style:--row-height={`${styleConfig.rowHeight}px`}
      style:--name-color={styleConfig.nameColor}
      style:--dead-name-color={styleConfig.deadNameColor}
    >
      <div class="matrix-grid matrix-header">
        <div class="teammate-header" aria-hidden="true"></div>
        {#each displayColumns as column (column.key)}
          <div class="buff-header" title={column.label}>{column.label}</div>
        {/each}
      </div>

      <div class="matrix-body" style:gap={`${styleConfig.gap}px`}>
        {#each rows as row (row.teammateEntityUuid)}
          <div
            class="matrix-grid teammate-row"
            class:placeholder={row.isPlaceholder}
          >
            <div
              class="teammate-name"
              class:dead={row.isDead}
              title={row.teammateName}
            >
              {row.teammateName}
            </div>
            {#each row.cells as cell, index (cell.key)}
              {@const colors = columnColors[index] ?? panelColors}
              <MonsterTeammateBuffCell
                {cell}
                nowMs={teammateNowMs}
                progressColor={colors.progressColor}
                progressOpacity={styleConfig.progressOpacity ?? 0.4}
                valueColor={colors.valueColor}
              />
            {/each}
          </div>
        {/each}
      </div>
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "teammatePanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .teammate-buff-panel {
    min-width: 340px;
    max-width: min(860px, calc(100vw - 24px));
  }

  .teammate-buff-panel.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .teammate-buff-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .matrix-shell {
    overflow: visible;
    padding: 2px;
  }

  .matrix-grid {
    display: grid;
    grid-template-columns:
      minmax(32px, var(--name-column-width))
      repeat(var(--buff-count), minmax(36px, var(--buff-column-width)));
    column-gap: var(--column-gap);
    align-items: stretch;
    min-width: max-content;
    font-size: var(--font-size);
  }

  .matrix-header {
    position: sticky;
    top: 0;
    z-index: 2;
    margin-bottom: 2px;
    color: var(--name-color);
  }

  .teammate-header,
  .buff-header,
  .teammate-name {
    text-shadow: var(
      --overlay-text-shadow,
      0 0 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.76),
      0 1px 2px rgba(0, 0, 0, 0.9)
    );
  }

  .teammate-header,
  .buff-header {
    color: currentColor;
    font-size: max(10px, calc(var(--font-size) - 2px));
    font-weight: 700;
    line-height: 1.15;
  }

  .buff-header {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    text-align: center;
    word-break: break-all;
  }

  .matrix-body {
    display: flex;
    flex-direction: column;
  }

  .teammate-row.placeholder {
    opacity: 0.75;
  }

  .teammate-name {
    min-width: 0;
    height: var(--row-height);
    padding: 3px 6px;
    overflow: hidden;
    color: var(--name-color);
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .teammate-name.dead {
    color: var(--dead-name-color);
  }
</style>
