<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";

  import {
    customTriggersFile,
    ensureCustomTriggerSyncListener,
    loadCustomTriggers,
    setTriggerGroupItemLayout,
    updateTriggerGroup,
  } from "$lib/custom-triggers-store";
  import {
    ensureCustomTriggerRuntimeStarted,
    triggerNotifications,
    triggerRuntimeItems,
  } from "$lib/custom-trigger-runtime.svelte";
  import { loadCustomDefinitions } from "$lib/custom-definitions-store";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import type { CustomTriggerGroup, CustomTriggerItemLayout, TriggerNotificationItem, TriggerRuntimeItem } from "$lib/custom-trigger-types";
  import { isEditing } from "./overlay-state.svelte";

  const t = uiT("custom-triggers/general", () => SETTINGS.live.general.state.language);

  let now = $state(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  let transientLayouts = $state<Record<string, Record<string, CustomTriggerItemLayout>>>({});
  type GroupOverlayItem = TriggerRuntimeItem | TriggerNotificationItem;

  type OverlayDragState =
    | {
      kind: "item";
      groupId: string;
      itemKey: string;
      offsetX: number;
      offsetY: number;
    }
    | {
      kind: "group";
      groupId: string;
      offsetX: number;
      offsetY: number;
    };

  let dragState = $state<OverlayDragState | null>(null);
  let transientGroupPositions = $state<Record<string, { x: number; y: number }>>({});

  const editing = $derived(isEditing());

  onMount(() => {
    void loadCustomDefinitions();
    void loadCustomTriggers();
    void ensureCustomTriggerSyncListener();
    void ensureCustomTriggerRuntimeStarted();
    timer = setInterval(() => {
      now = Date.now();
    }, 100);

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState) return;

      if (dragState.kind === "item") {
        const nextX = Math.max(0, Math.min(window.innerWidth - 80, event.clientX - dragState.offsetX));
        const nextY = Math.max(0, Math.min(window.innerHeight - 40, event.clientY - dragState.offsetY));
        const nextGroupLayouts = { ...(transientLayouts[dragState.groupId] ?? {}) };
        const previous = nextGroupLayouts[dragState.itemKey] ?? { x: nextX, y: nextY, z: 0 };
        nextGroupLayouts[dragState.itemKey] = { ...previous, x: nextX, y: nextY };
        transientLayouts = {
          ...transientLayouts,
          [dragState.groupId]: nextGroupLayouts,
        };
        return;
      }

      const group = get(customTriggersFile).groups.find((item) => item.id === dragState.groupId);
      const groupWidth = Math.max(80, group?.width ?? 280);
      const nextX = Math.max(0, Math.min(window.innerWidth - groupWidth, event.clientX - dragState.offsetX));
      const nextY = Math.max(0, Math.min(window.innerHeight - 40, event.clientY - dragState.offsetY));
      transientGroupPositions = {
        ...transientGroupPositions,
        [dragState.groupId]: { x: nextX, y: nextY },
      };
    };

    const handlePointerUp = async () => {
      if (!dragState) return;

      if (dragState.kind === "item") {
        const layout = transientLayouts[dragState.groupId]?.[dragState.itemKey];
        if (layout) {
          await setTriggerGroupItemLayout(dragState.groupId, dragState.itemKey, layout);
        }
      } else {
        const nextPosition = transientGroupPositions[dragState.groupId];
        if (nextPosition) {
          await updateTriggerGroup(dragState.groupId, nextPosition);
        }
      }

      dragState = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      if (timer) {
        clearInterval(timer);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });

  function sourceKey(item: GroupOverlayItem) {
    if ("actionId" in item) {
      return `${item.triggerId}:${item.actionId}`;
    }
    return item.id;
  }

  function sortItems(groupId: string) {
    const group = $customTriggersFile.groups.find((item) => item.id === groupId);
    const rows = $triggerRuntimeItems.filter((item) => item.groupId === groupId);
    if (!group) return rows;

    const copy = [...rows];
    switch (group.sortMode) {
      case "alphabetical":
        copy.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest_first":
        copy.sort((a, b) => b.startTs - a.startTs);
        break;
      case "remaining_desc":
        copy.sort((a, b) => remainingMs(b) - remainingMs(a));
        break;
      case "manual":
        copy.sort((a, b) => a.sortOrder - b.sortOrder);
        break;
      default:
        copy.sort((a, b) => remainingMs(a) - remainingMs(b));
        break;
    }
    return copy;
  }

  function visibleGroups() {
    return $customTriggersFile.groups.filter((group) => {
      if (!group.enabled) return false;
      if (group.layoutMode === "notifications") {
        return !$triggerNotifications.length ? !group.hideWhenEmpty : true;
      }
      const hasItems = $triggerRuntimeItems.some((item) => item.groupId === group.id);
      return hasItems || !group.hideWhenEmpty || editing;
    });
  }

  function remainingMs(item: TriggerRuntimeItem) {
    if (item.kind === "counter") return item.counterValue ?? 0;
    return Math.max(0, item.endTs - now);
  }

  function progress(item: TriggerRuntimeItem) {
    if (item.kind === "counter") return 0;
    const remaining = remainingMs(item);
    if (remaining <= 0) {
      return item.readyBehavior === "hide" ? 0 : 1;
    }
    return Math.max(0, Math.min(1, remaining / Math.max(1, item.durationMs)));
  }

  function remainingLabel(item: TriggerRuntimeItem) {
    if (item.kind === "counter") {
      return `x${item.counterValue ?? 0}`;
    }
    const remaining = remainingMs(item);
    if (remaining <= 0) {
      return item.readyBehavior === "hide" ? "0.0s" : t("readyLabel", "Ready");
    }
    return `${(remaining / 1000).toFixed(1)}s`;
  }

  function isReady(item: TriggerRuntimeItem) {
    return item.kind !== "counter" && remainingMs(item) <= 0 && item.readyBehavior !== "hide";
  }

  function defaultItemLayout(group: CustomTriggerGroup, index: number) {
    const offset = 20;
    return {
      x: group.x + offset * index,
      y: group.y + offset * index,
      z: index,
    } satisfies CustomTriggerItemLayout;
  }


  function getEffectiveGroupPosition(group: CustomTriggerGroup) {
    return transientGroupPositions[group.id] ?? { x: group.x, y: group.y };
  }

  function getEffectiveItemLayout(group: CustomTriggerGroup, item: GroupOverlayItem, index: number) {
    const key = sourceKey(item);
    return transientLayouts[group.id]?.[key] ?? group.itemLayouts[key] ?? defaultItemLayout(group, index);
  }

  function maxZ(group: CustomTriggerGroup, items: GroupOverlayItem[]) {
    const values = items.map((item, index) => getEffectiveItemLayout(group, item, index).z);
    return values.length ? Math.max(...values) : 0;
  }

  function minZ(group: CustomTriggerGroup, items: GroupOverlayItem[]) {
    const values = items.map((item, index) => getEffectiveItemLayout(group, item, index).z);
    return values.length ? Math.min(...values) : 0;
  }

  function freeItemsForGroup(group: CustomTriggerGroup) {
    const baseItems: GroupOverlayItem[] = group.layoutMode === "notifications"
      ? [...$triggerNotifications]
      : [...sortItems(group.id)];
    return [...baseItems].sort((a, b) => {
      const az = getEffectiveItemLayout(group, a, baseItems.indexOf(a)).z;
      const bz = getEffectiveItemLayout(group, b, baseItems.indexOf(b)).z;
      return az - bz;
    });
  }

  function groupTagPosition(group: CustomTriggerGroup, items: GroupOverlayItem[]) {
    if (!items.length) return getEffectiveGroupPosition(group);
    const positions = items.map((item, index) => getEffectiveItemLayout(group, item, index));
    return {
      x: Math.min(...positions.map((item) => item.x)),
      y: Math.min(...positions.map((item) => item.y)),
    };
  }

  function beginFreeDrag(event: PointerEvent, group: CustomTriggerGroup, item: GroupOverlayItem, index: number) {
    if (!editing || group.positionMode !== "deanchored" || group.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const key = sourceKey(item);
    const layout = getEffectiveItemLayout(group, item, index);
    const nextLayouts = { ...(transientLayouts[group.id] ?? {}) };
    nextLayouts[key] = {
      ...layout,
      z: maxZ(group, freeItemsForGroup(group)) + 1,
    };
    transientLayouts = {
      ...transientLayouts,
      [group.id]: nextLayouts,
    };
    dragState = {
      kind: "item",
      groupId: group.id,
      itemKey: key,
      offsetX: event.clientX - layout.x,
      offsetY: event.clientY - layout.y,
    };
  }

  function beginGroupDrag(event: PointerEvent, group: CustomTriggerGroup) {
    if (!editing || group.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const position = getEffectiveGroupPosition(group);
    dragState = {
      kind: "group",
      groupId: group.id,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
  }

  async function sendItemToBack(event: MouseEvent, group: CustomTriggerGroup, item: GroupOverlayItem, index: number) {
    if (!editing || group.positionMode !== "deanchored" || group.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const key = sourceKey(item);
    const layout = getEffectiveItemLayout(group, item, index);
    const updated = {
      ...layout,
      z: minZ(group, freeItemsForGroup(group)) - 1,
    };
    transientLayouts = {
      ...transientLayouts,
      [group.id]: {
        ...(transientLayouts[group.id] ?? {}),
        [key]: updated,
      },
    };
    await setTriggerGroupItemLayout(group.id, key, updated);
  }

  function handleFreeItemKeydown(event: KeyboardEvent, group: CustomTriggerGroup, item: GroupOverlayItem, index: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void sendItemToBack(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }), group, item, index);
    }
  }

</script>

{#each visibleGroups() as group (group.id)}
  {#if group.positionMode === "deanchored"}
    {@const items = freeItemsForGroup(group)}
    {@const tagPos = groupTagPosition(group, items)}
    {#if editing || (group.showHeader && items.length > 0)}
      <div class="group-tag free-tag" style={`left:${tagPos.x}px;top:${Math.max(0, tagPos.y - 26)}px;`}>
        {group.name}
      </div>
    {/if}

    {#if items.length === 0 && editing}
      <div
        class="overlay-group empty-free-state"
        class:editable={editing && !group.locked}
        style={`left:${getEffectiveGroupPosition(group).x}px;top:${getEffectiveGroupPosition(group).y}px;width:${group.width}px;`}
        onpointerdown={(event) => beginGroupDrag(event, group)}
      >
        <div class="empty-state">{group.layoutMode === "notifications" ? t("overlayNotificationsEmpty", "No trigger notifications") : t("overlayEmpty", "No active trigger bars")}</div>
      </div>
    {/if}

    {#each items as item, index (`${group.id}:${sourceKey(item)}`)}
      {@const layout = getEffectiveItemLayout(group, item, index)}
      {#if group.layoutMode === "bars"}
        <div
          class="overlay-group custom-trigger-free-item"
          class:editable={editing && !group.locked}
          style={`left:${layout.x}px;top:${layout.y}px;width:${group.width}px;z-index:${Math.max(1, layout.z + 10)};`}
          role="button"
          tabindex="0"
          onpointerdown={(event) => beginFreeDrag(event, group, item, index)}
          oncontextmenu={(event) => sendItemToBack(event, group, item, index)}
          onkeydown={(event) => handleFreeItemKeydown(event, group, item, index)}
        >
          <div
            class="trigger-bar"
            class:counter={(item as TriggerRuntimeItem).kind === "counter"}
            class:ready={isReady(item as TriggerRuntimeItem)}
            style={`height:${group.itemHeight}px;border-color:${(item as TriggerRuntimeItem).color ?? "rgba(255,255,255,0.16)"};`}
          >
            {#if (item as TriggerRuntimeItem).kind !== "counter"}
              <div class="trigger-fill" style={`width:${progress(item as TriggerRuntimeItem) * 100}%;background:${(item as TriggerRuntimeItem).color ?? ((item as TriggerRuntimeItem).kind === "active" ? "rgba(56,189,248,0.7)" : "rgba(250,204,21,0.72)")};`}></div>
            {/if}
            <div class="trigger-content">
              <span class="trigger-name">{(item as TriggerRuntimeItem).name}</span>
              <span class="trigger-time">{remainingLabel(item as TriggerRuntimeItem)}</span>
            </div>
          </div>
        </div>
      {:else}
        <div
          class="overlay-group custom-trigger-free-item"
          class:editable={editing && !group.locked}
          style={`left:${layout.x}px;top:${layout.y}px;width:${group.width}px;z-index:${Math.max(1, layout.z + 10)};`}
          role="button"
          tabindex="0"
          onpointerdown={(event) => beginFreeDrag(event, group, item, index)}
          oncontextmenu={(event) => sendItemToBack(event, group, item, index)}
          onkeydown={(event) => handleFreeItemKeydown(event, group, item, index)}
        >
          <div class="notification-card">{(item as TriggerNotificationItem).text}</div>
        </div>
      {/if}
    {/each}
  {:else if group.layoutMode === "bars"}
    {@const items = sortItems(group.id)}
    <div
      class="overlay-group custom-trigger-group"
      class:editable={editing && !group.locked}
      style={`left:${getEffectiveGroupPosition(group).x}px;top:${getEffectiveGroupPosition(group).y}px;width:${group.width}px;`}
      onpointerdown={(event) => beginGroupDrag(event, group)}
    >
      {#if editing || (group.showHeader && items.length > 0)}
        <div class="group-tag">{group.name}</div>
      {/if}
      {#if items.length === 0 && editing}
        <div class="empty-state">{t("overlayEmpty", "No active trigger bars")}</div>
      {:else}
        <div
          class="bar-stack"
          class:horizontal={group.direction === "horizontal"}
          style={`gap:${group.spacing}px;`}
        >
          {#each items as item (item.instanceId)}
            <div
              class="trigger-bar"
              class:counter={item.kind === "counter"}
              class:ready={isReady(item)}
              style={`height:${group.itemHeight}px;border-color:${item.color ?? "rgba(255,255,255,0.16)"};`}
            >
              {#if item.kind !== "counter"}
                <div class="trigger-fill" style={`width:${progress(item) * 100}%;background:${item.color ?? (item.kind === "active" ? "rgba(56,189,248,0.7)" : "rgba(250,204,21,0.72)")};`}></div>
              {/if}
              <div class="trigger-content">
                <span class="trigger-name">{item.name}</span>
                <span class="trigger-time">{remainingLabel(item)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="overlay-group custom-trigger-notification-group"
      class:editable={editing && !group.locked}
      style={`left:${getEffectiveGroupPosition(group).x}px;top:${getEffectiveGroupPosition(group).y}px;width:${group.width}px;`}
      onpointerdown={(event) => beginGroupDrag(event, group)}
    >
      {#if editing || (group.showHeader && $triggerNotifications.length > 0)}
        <div class="group-tag">{group.name}</div>
      {/if}
      {#if !$triggerNotifications.length && editing}
        <div class="empty-state">{t("overlayNotificationsEmpty", "No trigger notifications")}</div>
      {:else}
        <div class="notification-stack" class:horizontal={group.direction === "horizontal"} style={`gap:${group.spacing}px;`}>
          {#each $triggerNotifications as notification (notification.id)}
            <div class="notification-card">
              {notification.text}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/each}

<style>
  .custom-trigger-group,
  .custom-trigger-notification-group,
  .empty-free-state {
    pointer-events: none;
  }

  .custom-trigger-group.editable,
  .custom-trigger-notification-group.editable,
  .empty-free-state.editable,
  .custom-trigger-free-item.editable {
    pointer-events: auto;
    cursor: move;
  }

  .bar-stack,
  .notification-stack {
    display: flex;
    flex-direction: column;
  }

  .bar-stack.horizontal,
  .notification-stack.horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .trigger-bar {
    position: relative;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.68);
    min-width: 160px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
  }

  .trigger-bar.counter {
    background: rgba(30, 41, 59, 0.88);
  }

  .trigger-bar.ready {
    box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.58), 0 0 18px rgba(250, 204, 21, 0.32);
  }

  .trigger-fill {
    position: absolute;
    inset: 0 auto 0 0;
    opacity: 0.95;
    transition: width 0.1s linear;
  }

  .trigger-content {
    position: relative;
    z-index: 1;
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 10px;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.65);
    font-size: 12px;
    font-weight: 600;
  }

  .trigger-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-time {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .notification-card,
  .empty-state {
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(255,255,255,0.16);
    color: white;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
    font-size: 12px;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0,0,0,0.65);
  }

  .empty-state {
    opacity: 0.75;
    font-weight: 500;
  }

  .free-tag {
    position: absolute;
    bottom: auto;
    z-index: 50;
  }
</style>
