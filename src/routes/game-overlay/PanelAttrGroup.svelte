<script lang="ts">
  import { resolvePanelAttrLabel } from "$lib/i18n/panel-attrs";
  import { t } from "$lib/i18n/index.svelte";
  import {
    overlayPanelBackground,
    overlayTextShadow,
  } from "$lib/overlay-text-style";
  import { formatAttrValue } from "./overlay-utils";
  import {
    getGroupPosition,
    getGroupScale,
    getOverlaySizes,
    isEditing,
    panelAreaRows,
    panelAttrMap,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const rows = $derived(panelAreaRows());
  const groupPos = $derived(getGroupPosition("panelAttrGroup"));
  const groupScale = $derived(getGroupScale("panelAttrGroupScale"));
  const sizes = $derived(getOverlaySizes());
  const attrs = $derived(panelAttrMap());

  const textStyle = $derived(sizes.panelAttrTextStyle);
  const textShadowVar = $derived(overlayTextShadow(textStyle.textShadowEnabled));
  const backgroundVar = $derived(
    overlayPanelBackground(textStyle.backgroundEnabled, textStyle.backgroundOpacity),
  );
</script>

{#if rows.length > 0}
  <div
    class="overlay-group panel-attr-group"
    class:editable={editing}
    class:has-background={backgroundVar !== undefined}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    style:--overlay-text-shadow={textShadowVar}
    style:background={backgroundVar}
    onpointerdown={(e) =>
      startDrag(e, { kind: "group", key: "panelAttrGroup" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">{t("skillMonitor.overlay.panelAttrGroupTag")}</div>
    {/if}

    <div class="panel-attr-list" style:gap={`${sizes.panelAttrGap}px`}>
      {#each rows as row (row.key)}
        <div class="panel-attr-row" style:gap={`${sizes.panelAttrColumnGap}px`}>
          <span
            class="panel-attr-label"
            style:color={row.attr.color}
            style:font-size={`${sizes.panelAttrFontSize}px`}
          >
            {resolvePanelAttrLabel(row.attr)}
          </span>
          <span
            class="panel-attr-value"
            style:color={row.attr.color}
            style:font-size={`${Math.max(10, sizes.panelAttrFontSize + 2)}px`}
          >
            {formatAttrValue(attrs.get(row.attr.attrId) ?? 0, row.attr.format)}
          </span>
        </div>
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(e) =>
          startResize(
            e,
            { kind: "group", key: "panelAttrGroupScale" },
            groupScale,
          )}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .panel-attr-group.has-background {
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  .panel-attr-group.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    border-radius: 10px;
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .panel-attr-list {
    display: flex;
    flex-direction: column;
    min-width: 150px;
  }

  .panel-attr-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    line-height: 1;
  }

  .panel-attr-label {
    font-weight: 600;
    line-height: 1;
    text-shadow: var(--overlay-text-shadow, 0 0 4px rgba(0, 0, 0, 0.9));
  }

  .panel-attr-value {
    font-weight: 700;
    line-height: 1;
    text-shadow: var(--overlay-text-shadow, 0 0 4px rgba(0, 0, 0, 0.9));
  }
</style>
