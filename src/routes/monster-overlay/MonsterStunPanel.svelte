<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    getStunPanelPosition,
    getStunPanelScale,
    isMonsterEditing,
    isMonsterLayoutScaffold,
    monsterStunSections,
    startMonsterDrag,
    startMonsterResize,
    stunPanelStyle,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const scaffold = $derived(isMonsterLayoutScaffold());
  const sections = $derived(monsterStunSections());
  const styleConfig = $derived(stunPanelStyle());
  const panelPos = $derived(getStunPanelPosition());
  const panelScale = $derived(getStunPanelScale());
</script>

{#if sections.length > 0 || scaffold}
  <div
    class="overlay-group monster-stun-panel"
    class:editable={editing}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    onpointerdown={(event) =>
      startMonsterDrag(event, { kind: "stunPanel" }, panelPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("monsterOverlay.stunGroupTag")}</div>
    {/if}

    <div class="section-list">
      {#each sections as section (section.bossEntityUuid)}
        <section class="boss-section" class:placeholder={section.isPlaceholder}>
          <div class="boss-title">
            {t("monsterOverlay.stunSectionTitle", { title: section.title })}
          </div>
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
                alert={row.alert}
              />
            {/each}
          </div>
        </section>
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(event) =>
          startMonsterResize(event, { kind: "stunPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .monster-stun-panel {
    min-width: 240px;
    max-width: 320px;
  }

  .monster-stun-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .section-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 240px;
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
