<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import {
    fantasyPanelStyle,
    getFantasyPanelPosition,
    getFantasyPanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterFantasyRows,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const rows = $derived(monsterFantasyRows());
  const styleConfig = $derived(fantasyPanelStyle());
  const panelPos = $derived(getFantasyPanelPosition());
  const panelScale = $derived(getFantasyPanelScale());
</script>

{#if rows.length > 0 || scaffold}
  <div
    class="overlay-group fantasy-panel"
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
      startMonsterDrag(event, { kind: "fantasyPanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.fantasyGroupTag")}</div>
    {/if}

    <div
      class="fantasy-grid"
      style:gap={`${styleConfig.gap}px ${styleConfig.columnGap}px`}
      style:--font-size={`${styleConfig.fontSize}px`}
      style:--name-color={styleConfig.nameColor}
      style:--value-color={styleConfig.valueColor}
    >
      {#each rows as row (row.key)}
        <div class="fantasy-item" class:placeholder={row.isPlaceholder}>
          <span class="summoner" title={row.summonerName}
            >{row.summonerName}</span
          >
          <span class="fantasy" title={row.fantasyName}>{row.fantasyName}</span>
          <span class="level">{row.levelText}</span>
        </div>
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "fantasyPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .fantasy-panel {
    min-width: 360px;
    max-width: 560px;
  }

  .fantasy-panel.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .fantasy-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .fantasy-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px 12px;
    min-width: 360px;
  }

  .fantasy-item {
    display: grid;
    grid-template-columns: minmax(60px, auto) minmax(90px, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 2px 6px;
    border-radius: 6px;
    color: var(--value-color);
    font-size: var(--font-size);
    font-weight: 700;
    line-height: 1.25;
    text-shadow: var(
      --overlay-text-shadow,
      0 0 3px rgba(0, 0, 0, 0.95),
      0 1px 2px rgba(0, 0, 0, 0.95)
    );
    background: rgba(0, 0, 0, 0.22);
  }

  .fantasy-item.placeholder {
    opacity: 0.8;
  }

  .summoner,
  .fantasy {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summoner {
    color: var(--name-color);
  }

  .level {
    color: var(--value-color);
    white-space: nowrap;
  }
</style>
