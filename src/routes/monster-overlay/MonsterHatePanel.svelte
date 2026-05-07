<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import {
    getHatePanelPosition,
    getHatePanelScale,
    hatePanelStyle,
    isMonsterEditing,
    monsterHateSections,
    startMonsterDrag,
    startMonsterResize,
  } from "./monster-state.svelte.js";

  const editing = $derived(isMonsterEditing());
  const sections = $derived(monsterHateSections());
  const styleConfig = $derived(hatePanelStyle());
  const panelPos = $derived(getHatePanelPosition());
  const panelScale = $derived(getHatePanelScale());
  const t = uiT("overlay/monster-monitor", () => SETTINGS.live.general.state.language);
</script>

{#if sections.length > 0 || editing}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overlay-group monster-hate-panel"
    class:editable={editing}
    style:left={`${panelPos.x}px`}
    style:top={`${panelPos.y}px`}
    style:transform={`scale(${panelScale})`}
    style:transform-origin="top left"
    onpointerdown={(event) => startMonsterDrag(event, { kind: "hatePanel" }, panelPos)}
  >
    {#if editing}
      <div class="group-tag">{t("overlay.hatePanel", "Hate Area")}</div>
    {/if}

    <div class="monster-overlay-section-list">
      {#each sections as section (section.bossUid)}
        <section class="monster-overlay-boss-section" class:placeholder={section.isPlaceholder}>
          <div class="monster-overlay-boss-title">{section.title}{t("overlay.hateSuffix", " - Hate")}</div>
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
        onpointerdown={(event) => startMonsterResize(event, { kind: "hatePanel" }, panelScale)}
      ></div>
    {/if}
  </div>
{/if}
