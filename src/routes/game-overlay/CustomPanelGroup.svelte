<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import {
    customPanelGroups,
    customPanelRowsByGroup,
    customPanelStyle,
    isEditing,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const groups = $derived(customPanelGroups());
  const rowsByGroup = $derived(customPanelRowsByGroup());
  const styleConfig = $derived(customPanelStyle());
</script>

{#each groups as group (group.id)}
  {@const rows = rowsByGroup.get(group.id) ?? []}
  {#if rows.length > 0 || editing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="overlay-group custom-panel-group"
      class:editable={editing}
      style:left={`${group.position.x}px`}
      style:top={`${group.position.y}px`}
      style:transform={`scale(${group.scale})`}
      style:transform-origin="top left"
      onpointerdown={(e) =>
        startDrag(e, { kind: "customPanelGroup", groupId: group.id }, group.position)}
    >
      {#if editing}
        <div class="group-tag">{group.name}</div>
      {/if}

      <div class="custom-panel-list" style:gap={`${styleConfig.gap}px`}>
        {#if rows.length === 0}
          <div class="empty-tip">暂无条目</div>
        {/if}
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
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="resize-handle"
          onpointerdown={(e) =>
            startResize(
              e,
              { kind: "customPanelGroup", groupId: group.id },
              group.scale,
            )}
        ></div>
      {/if}
    </div>
  {/if}
{/each}

<style>
  .custom-panel-group {
    min-width: 220px;
  }

  .custom-panel-group.editable {
    outline: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  }

  .custom-panel-list {
    display: flex;
    flex-direction: column;
    min-width: 220px;
  }

  .empty-tip {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.18);
    color: rgba(241, 245, 249, 0.72);
    font-size: 12px;
  }
</style>
