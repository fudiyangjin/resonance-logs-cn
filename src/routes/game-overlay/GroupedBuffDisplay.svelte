<script lang="ts">
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";
  import BuffGroupGrid from "./BuffGroupGrid.svelte";
  import IconBuffCell from "./IconBuffCell.svelte";
  import {
    getIconBuffPosition,
    getIconBuffSize,
    getIconBuffStackCounterSize,
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
  const stackCounterSize = $derived(getIconBuffStackCounterSize());
  const t = uiT("overlay/skill-monitor/general", () => SETTINGS.live.general.state.language);
</script>

{#if groups.length === 0 && editing}
  <div class="overlay-group grouped-empty-tip" style:left="40px" style:top="310px">
    {t("overlay.buffGroups.empty", "Create a buff group on the Skill Monitor page first")}
  </div>
{/if}

{#each groups as group (group.id)}
  {@const groupBuffs = groupedBuffMap.get(group.id) ?? []}
  {#if groupBuffs.length > 0 || editing}
    <BuffGroupGrid
      {group}
      buffs={groupBuffs}
      {stackCounterSize}
      editable={editing}
      tagText={`${group.name}${group.monitorAll ? ` (${t("allBuffs", "All Buffs")})` : ""}`}
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
    {stackCounterSize}
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
