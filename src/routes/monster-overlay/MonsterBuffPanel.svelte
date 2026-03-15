<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import {
    getMonsterPanelPosition,
    getMonsterPanelScale,
    isMonsterEditing,
    monsterBossSections,
    monsterPanelStyle,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const sections = $derived(monsterBossSections());
  const styleConfig = $derived(monsterPanelStyle());
  const panelPos = $derived(getMonsterPanelPosition());
  const panelScale = $derived(getMonsterPanelScale());
</script>

{#if sections.length > 0 || editing}
  <div
    class="overlay-group monster-buff-panel"
    class:editable={editing}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    onpointerdown={(event) => startMonsterDrag(event, { kind: "buffPanel" }, panelPos)}
  >
    {#if editing}
      <div class="group-tag">怪物 Buff 区</div>
    {/if}

    <div class="section-list">
      {#each sections as section (section.bossUid)}
        <section class="boss-section" class:placeholder={section.isPlaceholder}>
          <div class="boss-title">{section.title}</div>
          <div class="boss-rows" style:gap={`${styleConfig.gap}px`}>
            {#each section.rows as row (row.key)}
              <TextBuffRow
                label={row.label}
                valueText={row.valueText}
                metaText={row.metaText}
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
        </section>
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) => startMonsterResize(event, { kind: "buffPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .monster-buff-panel {
    min-width: 260px;
    max-width: 360px;
  }

  .monster-buff-panel.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.48);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
  }

  .section-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 260px;
  }

  .boss-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .boss-section.placeholder {
    opacity: 0.8;
  }

  .boss-title {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  }

  .boss-rows {
    display: flex;
    flex-direction: column;
  }
</style>
