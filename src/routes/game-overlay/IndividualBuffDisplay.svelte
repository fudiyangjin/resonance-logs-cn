<script lang="ts">
  import BuffGroupGrid from "./BuffGroupGrid.svelte";
  import IconBuffCell from "./IconBuffCell.svelte";
  import { tl } from "$lib/i18n/index.svelte";
  import {
    getDisplayIconPosition,
    getDisplayIconSize,
    individualAllGroupBuffs,
    individualModeIconBuffs,
    individualMonitorAllGroup,
    isEditing,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const individualBuffs = $derived(individualModeIconBuffs());
  const allGroup = $derived(individualMonitorAllGroup());
  const allGroupBuffs = $derived(individualAllGroupBuffs());
</script>

{#each individualBuffs as buff, idx (buff.layoutKey ?? `buff:${buff.baseId}`)}
  {@const iconPos = getDisplayIconPosition(buff, idx)}
  {@const iconSize = getDisplayIconSize(buff)}
  <IconBuffCell
    {buff}
    {iconSize}
    standalone={true}
    editable={editing}
    left={iconPos.x}
    top={iconPos.y}
    onPointerDown={(e) =>
      startDrag(
        e,
        buff.categoryKey
          ? { kind: "categoryIcon", categoryKey: buff.categoryKey }
          : { kind: "iconBuff", baseId: buff.baseId },
        iconPos,
      )}
    onResizePointerDown={(e) =>
      startResize(
        e,
        buff.categoryKey
          ? { kind: "categoryIcon", categoryKey: buff.categoryKey }
          : { kind: "iconBuff", baseId: buff.baseId },
        iconSize,
      )}
  />
{/each}

{#if allGroup && (allGroupBuffs.length > 0 || editing)}
  {@const group = allGroup}
  {@const maxVisible = Math.max(1, group.columns * group.rows)}
  <BuffGroupGrid
    {group}
    buffs={allGroupBuffs.slice(0, maxVisible)}
    editable={editing}
    tagText={`${group.name}${tl(" (All)")}`}
    onPointerDown={(e) => startDrag(e, { kind: "individualAllGroup" }, group.position)}
    onResizePointerDown={(e) =>
      startResize(e, { kind: "individualAllGroup" }, group.iconSize)}
  />
{/if}
