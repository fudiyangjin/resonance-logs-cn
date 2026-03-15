<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import {
    customPanelRows,
    customPanelStyle,
    getGroupPosition,
    getGroupScale,
    isEditing,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const rows = $derived(customPanelRows());
  const styleConfig = $derived(customPanelStyle());
  const groupPos = $derived(getGroupPosition("customPanelGroup"));
  const groupScale = $derived(getGroupScale("customPanelGroupScale"));
</script>

{#if rows.length > 0 || editing}
  <div
    class="overlay-group custom-panel-group"
    class:editable={editing}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    onpointerdown={(e) =>
      startDrag(e, { kind: "group", key: "customPanelGroup" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">自定义面板区</div>
    {/if}

    <div class="custom-panel-list" style:gap={`${styleConfig.gap}px`}>
      {#each rows as row (row.key)}
        <TextBuffRow
          label={row.label}
          valueText={row.valueText}
          metaText={row.metaText}
          progressPercent={row.progressPercent}
          showProgress={row.showProgress}
          nameColor={styleConfig.nameColor}
          valueColor={styleConfig.valueColor}
          progressColor={styleConfig.progressColor}
          progressOpacity={styleConfig.progressOpacity}
          fontSize={styleConfig.fontSize}
          columnGap={styleConfig.columnGap}
          placeholder={row.isPlaceholder}
        />
      {/each}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(e) =>
          startResize(
            e,
            { kind: "group", key: "customPanelGroupScale" },
            groupScale,
          )}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .custom-panel-group {
    min-width: 220px;
  }

  .custom-panel-group.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
  }

  .custom-panel-list {
    display: flex;
    flex-direction: column;
    min-width: 220px;
  }
</style>
