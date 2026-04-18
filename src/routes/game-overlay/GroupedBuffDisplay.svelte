<script lang="ts">
  import BuffGroupGrid from "./BuffGroupGrid.svelte";
  import IconBuffCell from "./IconBuffCell.svelte";
  import {
    getIconBuffPosition,
    getIconBuffSize,
    groupedIconBuffs,
    isEditing,
    normalizedBuffGroups,
    specialStandaloneBuffs,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const groups = $derived(normalizedBuffGroups());
  const groupedBuffMap = $derived(groupedIconBuffs());
  const standaloneBuffs = $derived(specialStandaloneBuffs());
</script>

{#if groups.length === 0 && editing}
  <div class="overlay-group grouped-empty-tip" style:left="40px" style:top="310px">
    请先在技能监控页创建 Buff 分组
  </div>
{/if}

{#each groups as group (group.id)}
  {@const groupBuffs = groupedBuffMap.get(group.id) ?? []}
  {#if groupBuffs.length > 0 || editing}
    <BuffGroupGrid
      {group}
      buffs={groupBuffs}
      editable={editing}
      tagText={`${group.name}${group.monitorAll ? "（全部）" : ""}`}
      onPointerDown={(e) => startDrag(e, { kind: "buffGroup", groupId: group.id }, group.position)}
      onResizePointerDown={(e) =>
        startResize(e, { kind: "buffGroup", groupId: group.id }, group.iconSize)}
    />
  {/if}
{/each}

{#each standaloneBuffs as buff (buff.baseId)}
  {@const iconPos = getIconBuffPosition(buff.baseId)}
  {@const iconSize = getIconBuffSize(buff.baseId)}
  <IconBuffCell
    {buff}
    {iconSize}
    showName={false}
    showTime={false}
    showLayer={false}
    standalone={true}
    editable={editing}
    left={iconPos.x}
    top={iconPos.y}
    onPointerDown={(e) => startDrag(e, { kind: "iconBuff", baseId: buff.baseId }, iconPos)}
    onResizePointerDown={(e) =>
      startResize(e, { kind: "iconBuff", baseId: buff.baseId }, iconSize)}
  />
{/each}

<style>
  .grouped-empty-tip {
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    font-size: 12px;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
  }
</style>
