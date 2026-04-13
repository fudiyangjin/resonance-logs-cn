<script lang="ts">
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
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

  const t = uiT("skill-monitor/panel-attr", () => SETTINGS.live.general.state.language);
  const editing = $derived(isEditing());
  const rows = $derived(panelAreaRows());
  const groupPos = $derived(getGroupPosition("panelAttrGroup"));
  const groupScale = $derived(getGroupScale("panelAttrGroupScale"));
  const sizes = $derived(getOverlaySizes());
  const attrs = $derived(panelAttrMap());
</script>

{#if rows.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overlay-group panel-attr-group"
    class:editable={editing}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    onpointerdown={(e) => startDrag(e, { kind: "group", key: "panelAttrGroup" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">{t("panelAttr.title", "角色属性区")}</div>
    {/if}

    <div class="panel-attr-list" style:gap={`${sizes.panelAttrGap}px`}>
      {#each rows as row (row.key)}
        <div class="panel-attr-row" style:gap={`${sizes.panelAttrColumnGap}px`}>
          <span
            class="panel-attr-label"
            style:color={row.attr.color}
            style:font-size={`${sizes.panelAttrFontSize}px`}
          >
            {t(row.attr.labelKey ?? `panelAttr.${row.attr.attrId}`, row.attr.label)}
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
      <!-- svelte-ignore a11y_no_static_element_interactions -->
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
  .panel-attr-group.editable {
    outline: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
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
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  }

  .panel-attr-value {
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  }
</style>
