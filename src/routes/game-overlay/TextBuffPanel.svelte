<script lang="ts">
  import ClassicTextBuffRow from "./ClassicTextBuffRow.svelte";
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import {
    getGroupPosition,
    getGroupScale,
    isEditing,
    isLayoutScaffold,
    limitedTextBuffs,
    startDrag,
    startResize,
    textBuffPanelStyle,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const scaffold = $derived(isLayoutScaffold());
  const buffs = $derived(limitedTextBuffs());
  const styleConfig = $derived(textBuffPanelStyle());
  const groupPos = $derived(getGroupPosition("textBuffPanel"));
  const groupScale = $derived(getGroupScale("textBuffPanelScale"));

  const textShadowVar = $derived(
    overlayTextShadow(styleConfig.textShadowEnabled),
  );
  const backgroundVar = $derived(
    overlayPanelBackground(styleConfig.backgroundEnabled, styleConfig.backgroundOpacity),
  );
</script>

{#if buffs.length > 0 || scaffold}
  <div
    class="overlay-group text-buff-panel"
    class:editable={editing}
    class:has-background={backgroundVar !== undefined}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:gap={`${styleConfig.gap}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    style:--overlay-text-shadow={textShadowVar}
    style:background={backgroundVar}
    onpointerdown={(e) =>
      startDrag(e, { kind: "group", key: "textBuffPanel" }, groupPos)}
  >
    {#if scaffold}
      <div class="group-tag">{t("gameOverlay.group.textBuff")}</div>
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
          alert={buff.alert}
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
          alert={buff.alert}
        />
      {/if}
    {/each}

    {#if editing}
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

  .text-buff-panel.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .text-buff-panel.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }
</style>
