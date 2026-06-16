<script lang="ts">
  import type { BuffGroup } from "$lib/settings-store";
  import IconBuffCell from "./IconBuffCell.svelte";
  import type { IconBuffDisplay } from "./overlay-types";

  type PointerHandler = ((event: PointerEvent) => void) | undefined;

  let {
    group,
    buffs,
    editable = false,
    tagText = "",
    onPointerDown = undefined,
    onResizePointerDown = undefined,
  }: {
    group: BuffGroup;
    buffs: IconBuffDisplay[];
    editable?: boolean;
    tagText?: string;
    onPointerDown?: PointerHandler;
    onResizePointerDown?: PointerHandler;
  } = $props();
</script>

<div
  class="overlay-group buff-group-container"
  class:editable
  style:left={`${group.position.x}px`}
  style:top={`${group.position.y}px`}
  onpointerdown={onPointerDown}
>
  {#if editable}
    <div class="group-tag">{tagText || group.name}</div>
  {/if}

  <div
    class="buff-group-grid"
    style:grid-template-columns={`repeat(${Math.max(1, group.columns)}, ${group.iconSize + 8}px)`}
    style:grid-template-rows={`repeat(${Math.max(1, group.rows)}, auto)`}
    style:gap={`${Math.max(0, group.gap)}px`}
  >
    {#each buffs as buff (buff.baseId)}
      <IconBuffCell
        {buff}
        iconSize={group.iconSize}
        showName={group.showName}
        showTime={group.showTime}
        showLayer={group.showLayer}
      />
    {/each}
  </div>

  {#if editable && onResizePointerDown}
    <div class="resize-handle icon" onpointerdown={onResizePointerDown}></div>
  {/if}
</div>

<style>
  .buff-group-container {
    min-width: 52px;
    padding: 0;
    border-radius: 0;
    background: transparent;
  }

  .buff-group-container.editable {
    border: 2px solid var(--overlay-edit-panel-border);
    background: var(--overlay-edit-panel-bg);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    margin: -10px;
    padding: 8px;
  }

  .buff-group-grid {
    display: grid;
    align-items: start;
    justify-items: center;
  }
</style>
