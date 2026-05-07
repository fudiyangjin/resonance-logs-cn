<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
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
  const t = uiT("overlay/monster-monitor", () => SETTINGS.live.general.state.language);
</script>

{#if sections.length > 0 || editing}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
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
      <div class="group-tag">{t("overlay.buffPanel", "Monster Buff Area")}</div>
    {/if}

    <div class="monster-overlay-section-list">
      {#each sections as section (section.bossUid)}
        <section class="monster-overlay-boss-section" class:placeholder={section.isPlaceholder}>
          <div class="monster-overlay-boss-title">{section.title}</div>
          <div class="monster-overlay-boss-rows" style:gap={`${styleConfig.gap}px`}>
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
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="resize-handle"
        onpointerdown={(event) => startMonsterResize(event, { kind: "buffPanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}
