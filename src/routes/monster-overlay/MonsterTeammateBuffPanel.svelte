<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    getTeammatePanelPosition,
    getTeammatePanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterTeammateColumns,
    monsterTeammateRows,
    startMonsterDrag,
    startMonsterResize,
    teammatePanelStyle,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const rows = $derived(monsterTeammateRows());
  const columns = $derived(monsterTeammateColumns());
  const styleConfig = $derived(teammatePanelStyle());
  const panelPos = $derived(getTeammatePanelPosition());
  const panelScale = $derived(getTeammatePanelScale());
  const displayColumns = $derived.by(
    () =>
      columns.length > 0
        ? columns
        : rows[0]?.cells.map((cell) => ({
            key: cell.key,
            label: cell.buffName,
          })) ?? [],
  );
</script>

{#if rows.length > 0 || scaffold}
  <div
    class="overlay-group teammate-buff-panel"
    class:editable={editing}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    onpointerdown={(event) =>
      startMonsterDrag(event, { kind: "teammatePanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.teammateGroupTag")}</div>
    {/if}

    <div class="matrix-shell">
      <div
        class="matrix-grid matrix-header"
        style:--buff-count={Math.max(displayColumns.length, 1)}
        style:--font-size={`${styleConfig.fontSize}px`}
        style:--column-gap={`${styleConfig.columnGap}px`}
        style:--name-column-width={`${styleConfig.nameColumnWidth}px`}
        style:--buff-column-width={`${styleConfig.buffColumnWidth}px`}
        style:--row-height={`${styleConfig.rowHeight}px`}
        style:color={styleConfig.nameColor}
      >
        <div class="teammate-header" aria-hidden="true"></div>
        {#each displayColumns as column (column.key)}
          <div class="buff-header" title={column.label}>{column.label}</div>
        {/each}
      </div>

      <div
        class="matrix-body"
        style:gap={`${styleConfig.gap}px`}
      >
        {#each rows as row (row.teammateEntityUuid)}
          <div
            class="matrix-grid teammate-row"
            class:placeholder={row.isPlaceholder}
            style:--buff-count={Math.max(displayColumns.length, 1)}
            style:--font-size={`${styleConfig.fontSize}px`}
            style:--column-gap={`${styleConfig.columnGap}px`}
            style:--name-column-width={`${styleConfig.nameColumnWidth}px`}
            style:--buff-column-width={`${styleConfig.buffColumnWidth}px`}
            style:--row-height={`${styleConfig.rowHeight}px`}
          >
            <div
              class="teammate-name"
              title={row.teammateName}
              style:color={styleConfig.nameColor}
            >
              {row.teammateName}
            </div>
            {#each row.cells as cell (cell.key)}
              <div
                class="buff-cell"
                class:active={cell.hasBuff}
                class:empty={!cell.hasBuff}
                class:alert-flash={cell.alert?.flash === true}
                title={cell.hasBuff
                  ? `${cell.categoryKey ? `${cell.buffName} ` : ""}${cell.metaText ? `${cell.metaText} ` : ""}${cell.valueText}`.trim()
                  : cell.buffName}
                style:--alert-color={cell.alert?.highlightColor}
                style:--alert-flash-duration={cell.alert
                  ? `${cell.alert.flashIntervalMs}ms`
                  : undefined}
              >
                {#if cell.hasBuff}
                  <div class="cell-progress-track">
                    <div
                      class="cell-progress-fill"
                      style:width={`${cell.progressPercent}%`}
                      style:background={cell.alert?.applyToProgress
                        ? cell.alert.highlightColor
                        : styleConfig.progressColor}
                      style:opacity={styleConfig.progressOpacity ?? 0.4}
                    ></div>
                  </div>
                  <span
                    class="cell-value"
                    style:color={cell.alert?.highlightColor ??
                      styleConfig.valueColor}
                  >
                    {#if cell.metaText}
                      <span class="cell-meta">{cell.metaText}</span>
                    {/if}
                    {cell.valueText}
                  </span>
                {/if}
              </div>
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

  .teammate-buff-panel.editable {
    border: 2px solid rgba(45, 212, 191, 0.9);
    border-radius: 10px;
    background: rgba(18, 52, 56, 0.48);
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
  }

  .teammate-header,
  .buff-header,
  .teammate-name,
  .buff-cell {
    text-shadow:
      0 0 3px rgba(0, 0, 0, 1),
      0 0 6px rgba(0, 0, 0, 0.76),
      0 1px 2px rgba(0, 0, 0, 0.9);
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
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .buff-cell {
    position: relative;
    min-height: var(--row-height);
    overflow: hidden;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
  }

  .buff-cell.empty {
    opacity: 0.22;
  }

  .buff-cell.active {
    background: rgba(255, 255, 255, 0.15);
  }

  .buff-cell.alert-flash {
    animation: teammate-buff-alert-flash var(--alert-flash-duration, 600ms)
      ease-in-out infinite alternate;
  }

  .cell-progress-track {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.12);
  }

  .cell-progress-fill {
    height: 100%;
    transition: width 100ms linear;
  }

  .cell-value {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    height: 100%;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 2px 5px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .cell-meta {
    font-size: max(10px, calc(var(--font-size) - 2px));
    opacity: 0.9;
  }

  @keyframes teammate-buff-alert-flash {
    0% {
      opacity: 1;
      filter: brightness(1);
    }

    100% {
      opacity: 0.48;
      filter: brightness(1.55);
    }
  }
</style>
