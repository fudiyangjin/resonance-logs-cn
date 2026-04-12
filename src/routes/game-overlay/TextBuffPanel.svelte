<script lang="ts">
  import ClassicTextBuffRow from "./ClassicTextBuffRow.svelte";
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import {
    getGroupPosition,
    getGroupScale,
    isEditing,
    limitedTextBuffs,
    startDrag,
    startResize,
    textBuffPanelStyle,
  } from "./overlay-state.svelte.js";

  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);
  const editing = $derived(isEditing());
  const buffs = $derived(limitedTextBuffs());
  const styleConfig = $derived(textBuffPanelStyle());
  const groupPos = $derived(getGroupPosition("textBuffPanel"));
  const groupScale = $derived(getGroupScale("textBuffPanelScale"));
</script>

{#if buffs.length > 0 || editing}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overlay-group text-buff-panel"
    class:editable={editing}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:gap={`${styleConfig.gap}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    onpointerdown={(e) => startDrag(e, { kind: "group", key: "textBuffPanel" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">{t("overlay.textBuff", "无图标Buff区")}</div>
    {/if}

    {#each buffs as buff (buff.key)}
      {#if styleConfig.displayMode === "classic"}
        <ClassicTextBuffRow
          label={buff.label}
          valueText={buff.valueText}
          metaText={buff.metaText}
          progressPercent={buff.progressPercent}
          showProgress={buff.showProgress}
          nameColor={styleConfig.nameColor}
          valueColor={styleConfig.valueColor}
          progressColor={styleConfig.progressColor}
          progressOpacity={styleConfig.progressOpacity}
          fontSize={styleConfig.fontSize}
          placeholder={buff.isPlaceholder}
        />
      {:else}
        <TextBuffRow
          label={buff.label}
          valueText={buff.valueText}
          metaText={buff.metaText}
          progressPercent={buff.progressPercent}
          showProgress={buff.showProgress}
          nameColor={styleConfig.nameColor}
          valueColor={styleConfig.valueColor}
          progressColor={styleConfig.progressColor}
          progressOpacity={styleConfig.progressOpacity}
          fontSize={styleConfig.fontSize}
          columnGap={styleConfig.columnGap}
          placeholder={buff.isPlaceholder}
        />
      {/if}
    {/each}

    {#if editing}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="resize-handle"
        onpointerdown={(e) =>
          startResize(
            e,
            { kind: "group", key: "textBuffPanelScale" },
            groupScale,
          )}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .text-buff-panel {
    min-width: 220px;
    max-width: 320px;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: none;
    display: flex;
    flex-direction: column;
  }

  .text-buff-panel.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
  }
</style>
