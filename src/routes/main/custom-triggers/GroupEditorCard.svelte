<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";

  import { Button } from "$lib/components/ui/button/index.js";
  import { playTriggerSound, type AudioOutputDevice } from "$lib/custom-trigger-audio";
  import {
    addActionToTrigger,
    addCustomTrigger,
    clearTriggerGroupItemLayouts,
    customTriggersFile,
    deleteCustomTrigger,
    deleteTriggerAction,
    deleteTriggerGroup,
    replaceTriggerAction,
    updateCustomTrigger,
    updateTriggerGroup,
  } from "$lib/custom-triggers-store";
  import type {
    CustomTriggerAction,
    CustomTriggerDefinition,
    CustomTriggerGroup,
  } from "$lib/custom-trigger-types";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import {
    fireCustomTrigger,
    resetCustomTrigger,
    resetCustomTriggerGroup,
    stopCustomTrigger,
  } from "$lib/custom-trigger-runtime.svelte";

  let { group, audioOutputs = [] }: { group: CustomTriggerGroup; audioOutputs?: AudioOutputDevice[] } = $props();

  const t = uiT("custom-triggers/general", () => SETTINGS.live.general.state.language);

  function getGroupUiState() {
    const state = SETTINGS.customTriggers.state.groupUiStates?.[group.id] ?? {};
    return {
      collapsed: state.collapsed === true,
      settingsCollapsed: state.settingsCollapsed === true,
      triggersCollapsed: state.triggersCollapsed === true,
    };
  }

  function setGroupUiState(patch: Partial<{ collapsed: boolean; settingsCollapsed: boolean; triggersCollapsed: boolean }>) {
    const current = getGroupUiState();
    SETTINGS.customTriggers.state.groupUiStates = {
      ...(SETTINGS.customTriggers.state.groupUiStates ?? {}),
      [group.id]: {
        ...current,
        ...patch,
      },
    };
  }

  const uiState = $derived(getGroupUiState());

  const groupTriggers = $derived(
    $customTriggersFile.triggers.filter((trigger) => trigger.groupId === group.id),
  );

  function triggerSummaryCount() {
    return groupTriggers.length;
  }

  function enabledTriggerCount() {
    return groupTriggers.filter((trigger) => trigger.enabled).length;
  }

  function updateGroupText(key: keyof CustomTriggerGroup, event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    void updateTriggerGroup(group.id, { [key]: target.value } as Partial<CustomTriggerGroup>);
  }

  function updateGroupNumber(key: keyof CustomTriggerGroup, event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const value = Number(target.value);
    void updateTriggerGroup(group.id, { [key]: Number.isFinite(value) ? value : 0 } as Partial<CustomTriggerGroup>);
  }

  function updateGroupBoolean(key: keyof CustomTriggerGroup, event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    void updateTriggerGroup(group.id, { [key]: target.checked } as Partial<CustomTriggerGroup>);
  }

  function updateGroupSelect(key: keyof CustomTriggerGroup, event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    void updateTriggerGroup(group.id, { [key]: target.value } as Partial<CustomTriggerGroup>);
  }

  function updateTriggerText(triggerId: string, key: keyof CustomTriggerDefinition, event: Event) {
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    void updateCustomTrigger(triggerId, { [key]: target.value } as Partial<CustomTriggerDefinition>);
  }

  function updateTriggerBoolean(triggerId: string, key: keyof CustomTriggerDefinition, event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    void updateCustomTrigger(triggerId, { [key]: target.checked } as Partial<CustomTriggerDefinition>);
  }

  function updateTriggerSource(triggerId: string, field: string, event: Event) {
    const target = event.currentTarget as HTMLInputElement | HTMLSelectElement;
    const trigger = $customTriggersFile.triggers.find((item) => item.id === triggerId);
    if (!trigger) return;
    const nextSource = { ...trigger.source } as any;
    if (field.startsWith("condition.")) {
      const conditionField = field.replace("condition.", "");
      const rawValue = target.value;
      const shouldNumber =
        conditionField === "uid" ||
        conditionField.includes("Stacks") ||
        conditionField === "repeatSuppressMs";
      nextSource.condition = {
        ...(trigger.source.condition ?? {}),
        [conditionField]: rawValue === "" ? null : shouldNumber ? Number(rawValue) : rawValue,
      };
    } else {
      nextSource[field] = target.value;
    }
    void updateCustomTrigger(triggerId, { source: nextSource });
  }

  function updateAction(triggerId: string, actionId: string, key: string, event: Event) {
    const target = event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    let value: string | number | boolean = target.value;
    if (target instanceof HTMLInputElement) {
      if (target.type === "checkbox") {
        value = target.checked;
      } else if (target.type === "number") {
        value = Number(target.value);
      }
    }
    void replaceTriggerAction(triggerId, actionId, { [key]: value } as Partial<CustomTriggerAction>);
  }

  async function browseSound(triggerId: string, actionId: string) {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }],
    });
    if (typeof selected === "string" && selected) {
      await replaceTriggerAction(triggerId, actionId, { soundPath: selected } as Partial<CustomTriggerAction>);
    }
  }

  async function testSound(action: CustomTriggerAction) {
    if (action.type !== "play_sound") return;
    await playTriggerSound(action);
  }

  type ManualTriggerPayload =
    | { type: "fire_trigger"; triggerId: string }
    | { type: "stop_trigger"; triggerId: string }
    | { type: "reset_trigger"; triggerId: string }
    | { type: "reset_group"; groupId: string };

  async function manualTrigger(payload: ManualTriggerPayload) {
    if (payload.type === "fire_trigger") {
      await fireCustomTrigger(String(payload["triggerId"] ?? ""));
      return;
    }
    if (payload.type === "stop_trigger") {
      await stopCustomTrigger(String(payload["triggerId"] ?? ""));
      return;
    }
    if (payload.type === "reset_trigger") {
      await resetCustomTrigger(String(payload["triggerId"] ?? ""));
      return;
    }
    await resetCustomTriggerGroup(String(payload["groupId"] ?? ""));
  }
</script>

<div class="rounded-xl border border-border/70 bg-background/40 shadow-sm">
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
    <div class="flex min-w-0 items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onclick={() => setGroupUiState({ collapsed: !uiState.collapsed })}
      >
        {uiState.collapsed ? t("groups.expandGroup", "Expand Group") : t("groups.collapseGroup", "Collapse Group")}
      </Button>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-base font-semibold">{group.name}</h3>
          <span class="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
            {enabledTriggerCount()}/{triggerSummaryCount()} {t("groups.triggerCount", "triggers")}
          </span>
          <span class="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
            {group.direction === "horizontal"
              ? t("groups.direction.horizontal", "Horizontal")
              : t("groups.direction.vertical", "Vertical")}
          </span>
          {#if group.positionMode === "deanchored"}
            <span class="rounded-full border border-amber-300/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
              {t("groups.positionMode.deanchored", "Free Move")}
            </span>
          {/if}
        </div>
        <p class="text-xs text-muted-foreground">{t("groups.cardHint", "Settings and triggers for this group live together here.")}</p>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.enabled} onchange={(event) => updateGroupBoolean("enabled", event)} /> {t("groups.activeOnOverlay", "Active on Overlay")}</label>
      <Button variant="outline" size="sm" onclick={() => void addCustomTrigger(group.id)}>{t("groups.addTrigger", "Add Trigger")}</Button>
      <Button variant="outline" size="sm" onclick={() => void manualTrigger({ type: "reset_group", groupId: group.id })}>{t("manual.clearGroup", "Clear Group")}</Button>
      <Button variant="outline" size="sm" onclick={() => void deleteTriggerGroup(group.id)}>{t("delete", "Delete")}</Button>
    </div>
  </div>

  {#if !uiState.collapsed}
    <div class="space-y-4 p-4">
      <div class="rounded-lg border border-border/50 bg-card/30">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-3 py-2">
          <div>
            <h4 class="text-sm font-semibold">{t("groups.settingsSection", "Group Settings")}</h4>
            <p class="text-xs text-muted-foreground">{t("groups.settingsHint", "Layout, visibility, and placement all live here.")}</p>
          </div>
          <Button variant="outline" size="sm" onclick={() => setGroupUiState({ settingsCollapsed: !uiState.settingsCollapsed })}>
            {uiState.settingsCollapsed ? t("groups.expandSettings", "Expand Settings") : t("groups.collapseSettings", "Collapse Settings")}
          </Button>
        </div>

        {#if !uiState.settingsCollapsed}
          <div class="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
            <label class="space-y-1 text-sm"><span>{t("name", "Name")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.name} onchange={(event) => updateGroupText("name", event)} /></label>
            <label class="space-y-1 text-sm"><span>{t("groups.layoutMode", "Layout")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.layoutMode} onchange={(event) => updateGroupSelect("layoutMode", event)}><option value="bars">{t("groups.layoutMode.bars", "Bars")}</option><option value="notifications">{t("groups.layoutMode.notifications", "Notifications")}</option></select></label>
            <label class="space-y-1 text-sm"><span>{t("groups.direction", "Direction")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.direction} onchange={(event) => updateGroupSelect("direction", event)}><option value="vertical">{t("groups.direction.vertical", "Vertical")}</option><option value="horizontal">{t("groups.direction.horizontal", "Horizontal")}</option></select></label>
            <label class="space-y-1 text-sm"><span>{t("groups.sortMode", "Sort")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.sortMode} onchange={(event) => updateGroupSelect("sortMode", event)}><option value="remaining_asc">{t("groups.sort.remainingAsc", "Shortest remaining")}</option><option value="remaining_desc">{t("groups.sort.remainingDesc", "Longest remaining")}</option><option value="newest_first">{t("groups.sort.newest", "Newest first")}</option><option value="alphabetical">{t("groups.sort.alphabetical", "Alphabetical")}</option><option value="manual">{t("groups.sort.manual", "Manual")}</option></select></label>
            <label class="space-y-1 text-sm"><span>{t("groups.positionMode", "Position Mode")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.positionMode} onchange={(event) => updateGroupSelect("positionMode", event)}><option value="anchored">{t("groups.positionMode.anchored", "Anchored")}</option><option value="deanchored">{t("groups.positionMode.deanchored", "Free Move")}</option></select></label>
            <label class="space-y-1 text-sm"><span>X</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.x} onchange={(event) => updateGroupNumber("x", event)} /></label>
            <label class="space-y-1 text-sm"><span>Y</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.y} onchange={(event) => updateGroupNumber("y", event)} /></label>
            <label class="space-y-1 text-sm"><span>{t("groups.width", "Width")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.width} onchange={(event) => updateGroupNumber("width", event)} /></label>
            <label class="space-y-1 text-sm"><span>{t("groups.itemHeight", "Item Height")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.itemHeight} onchange={(event) => updateGroupNumber("itemHeight", event)} /></label>
            <label class="space-y-1 text-sm"><span>{t("groups.spacing", "Spacing")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={group.spacing} onchange={(event) => updateGroupNumber("spacing", event)} /></label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.showHeader} onchange={(event) => updateGroupBoolean("showHeader", event)} /> {t("groups.showHeader", "Show Header")}</label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.hideWhenEmpty} onchange={(event) => updateGroupBoolean("hideWhenEmpty", event)} /> {t("groups.hideWhenEmpty", "Hide When Empty")}</label>
            {#if group.positionMode === "deanchored"}
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.locked} onchange={(event) => updateGroupBoolean("locked", event)} /> {t("groups.positionLocked", "Lock Positions")}</label>
              <div class="flex items-end"><Button variant="outline" size="sm" onclick={() => void clearTriggerGroupItemLayouts(group.id)}>{t("groups.resetItemPositions", "Reset Item Positions")}</Button></div>
              <p class="text-xs text-muted-foreground md:col-span-2 xl:col-span-4">{t("groups.deanchorHint", "Free Move lets you drag active items for this group in the overlay. Right-click an overlapping item to send it to the back.")}</p>
            {/if}
          </div>
        {/if}
      </div>

      <div class="rounded-lg border border-border/50 bg-card/30">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-3 py-2">
          <div>
            <h4 class="text-sm font-semibold">{t("groups.triggersSection", "Group Triggers")}</h4>
            <p class="text-xs text-muted-foreground">{t("groups.triggersHint", "Only triggers assigned to this group appear here.")}</p>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" onclick={() => void addCustomTrigger(group.id)}>{t("groups.addTrigger", "Add Trigger")}</Button>
            <Button variant="outline" size="sm" onclick={() => setGroupUiState({ triggersCollapsed: !uiState.triggersCollapsed })}>
              {uiState.triggersCollapsed ? t("groups.expandTriggers", "Expand Triggers") : t("groups.collapseTriggers", "Collapse Triggers")}
            </Button>
          </div>
        </div>

        {#if !uiState.triggersCollapsed}
          <div class="space-y-4 p-4">
            {#if groupTriggers.length === 0}
              <div class="rounded-lg border border-dashed border-border/60 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
                {t("triggers.emptyInGroup", "No triggers in this group yet.")}
              </div>
            {:else}
              {#each groupTriggers as trigger (trigger.id)}
                <div class="rounded-lg border border-border/60 bg-background/40 p-4 space-y-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h5 class="text-base font-semibold">{trigger.name}</h5>
                      <p class="text-xs text-muted-foreground">{t("triggers.groupedUnder", "Grouped under")}: {group.name}</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={trigger.enabled} onchange={(event) => updateTriggerBoolean(trigger.id, "enabled", event)} /> {t("enabled", "Enabled")}</label>
                      <Button variant="outline" size="sm" onclick={() => void manualTrigger({ type: "fire_trigger", triggerId: trigger.id })}>{t("manual.fire", "Fire")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void manualTrigger({ type: "stop_trigger", triggerId: trigger.id })}>{t("manual.stop", "Stop")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void manualTrigger({ type: "reset_trigger", triggerId: trigger.id })}>{t("manual.reset", "Reset")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void deleteCustomTrigger(trigger.id)}>{t("delete", "Delete")}</Button>
                    </div>
                  </div>

                  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label class="space-y-1 text-sm"><span>{t("name", "Name")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.name} onchange={(event) => updateTriggerText(trigger.id, "name", event)} /></label>
                    <label class="space-y-1 text-sm"><span>{t("triggers.group", "Group")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.groupId} onchange={(event) => updateTriggerText(trigger.id, "groupId", event)}>{#each $customTriggersFile.groups as optionGroup (optionGroup.id)}<option value={optionGroup.id}>{optionGroup.name}</option>{/each}</select></label>
                    <label class="space-y-1 text-sm"><span>{t("triggers.sourceType", "Source Type")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.sourceType} onchange={(event) => updateTriggerSource(trigger.id, "sourceType", event)}><option value="buff">{t("logger.category.buff", "Buff")}</option><option value="monster_buff">{t("logger.category.monster_buff", "Monster Buff")}</option><option value="skill">{t("logger.category.skill", "Skill")}</option><option value="skill_cd">{t("logger.category.skill_cd", "Skill CD")}</option><option value="counter">{t("logger.category.counter", "Counter")}</option><option value="encounter">{t("logger.category.encounter", "Encounter")}</option><option value="scene">{t("logger.category.scene", "Scene")}</option><option value="system">{t("logger.category.system", "System")}</option><option value="hate">{t("logger.category.hate", "Hate")}</option></select></label>
                    <label class="space-y-1 text-sm"><span>{t("triggers.event", "Event")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.event} onchange={(event) => updateTriggerSource(trigger.id, "event", event)}><option value="add">{t("triggers.event.add", "Add")}</option><option value="remove">{t("triggers.event.remove", "Remove")}</option><option value="change">{t("triggers.event.change", "Change")}</option><option value="update">{t("triggers.event.update", "Update")}</option><option value="reset">{t("triggers.event.reset", "Reset")}</option><option value="ready">{t("readyLabel", "Ready")}</option></select></label>
                    <label class="space-y-1 text-sm"><span>{t("uid", "UID")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.uid ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.uid", event)} /></label>
                    <label class="space-y-1 text-sm"><span>{t("triggers.minStacks", "Min Stacks")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.minStacks ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.minStacks", event)} /></label>
                    <label class="space-y-1 text-sm"><span>{t("triggers.maxStacks", "Max Stacks")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.maxStacks ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.maxStacks", event)} /></label>
                    <label class="space-y-1 text-sm xl:col-span-2"><span>{t("triggers.matchSummary", "Summary Contains")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.matchSummary ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.matchSummary", event)} /></label>
                    <label class="space-y-1 text-sm xl:col-span-2"><span>{t("triggers.valueIncludes", "Value Contains")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.valueIncludes ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.valueIncludes", event)} /></label>
                    <label class="space-y-1 text-sm"><span>{t("triggers.repeatSuppressMs", "Repeat Suppress (ms)")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.repeatSuppressMs ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.repeatSuppressMs", event)} /></label>
                    <label class="space-y-1 text-sm xl:col-span-2"><span>{t("triggers.requireActive", "Requires Active Trigger")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={trigger.source.condition?.requireActiveTriggerId ?? ""} onchange={(event) => updateTriggerSource(trigger.id, "condition.requireActiveTriggerId", event)}><option value="">{t("triggers.requireActive.none", "None")}</option>{#each $customTriggersFile.triggers.filter((item) => item.id !== trigger.id) as optionTrigger (optionTrigger.id)}<option value={optionTrigger.id}>{optionTrigger.name}</option>{/each}</select></label>
                    <label class="space-y-1 text-sm xl:col-span-4"><span>{t("notes", "Notes")}</span><textarea class="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2" onchange={(event) => updateTriggerText(trigger.id, "notes", event)}>{trigger.notes ?? ""}</textarea></label>
                  </div>

                  <div class="space-y-3 rounded-lg border border-border/50 bg-card/30 p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <h6 class="text-sm font-semibold">{t("actions.title", "Actions")}</h6>
                      <div class="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onclick={() => void addActionToTrigger(trigger.id, "start_timer")}>{t("actions.addTimer", "Add Timer")}</Button>
                        <Button variant="outline" size="sm" onclick={() => void addActionToTrigger(trigger.id, "show_notification")}>{t("actions.addNotification", "Add Notification")}</Button>
                        <Button variant="outline" size="sm" onclick={() => void addActionToTrigger(trigger.id, "play_sound")}>{t("actions.addSound", "Add Sound")}</Button>
                        <Button variant="outline" size="sm" onclick={() => void addActionToTrigger(trigger.id, "adjust_timer")}>{t("actions.addAdjust", "Adjust Timer")}</Button>
                        <Button variant="outline" size="sm" onclick={() => void addActionToTrigger(trigger.id, "increment_counter")}>{t("actions.addCounter", "Add Counter")}</Button>
                      </div>
                    </div>

                    <div class="space-y-3">
                      {#each trigger.actions as action (action.id)}
                        <div class="rounded-md border border-border/50 bg-background/50 p-3 space-y-3">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="text-sm font-medium">{t(`actions.type.${action.type}`, action.type)}</div>
                            <Button variant="outline" size="sm" onclick={() => void deleteTriggerAction(trigger.id, action.id)}>{t("delete", "Delete")}</Button>
                          </div>

                          {#if action.type === "start_timer"}
                            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <label class="space-y-1 text-sm"><span>{t("actions.duration", "Duration (ms)")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.durationMs} onchange={(event) => updateAction(trigger.id, action.id, "durationMs", event)} /></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.timerKind", "Display")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.timerKind} onchange={(event) => updateAction(trigger.id, action.id, "timerKind", event)}><option value="cooldown">{t("actions.timerKind.cooldown", "Cooldown Bar")}</option><option value="active">{t("actions.timerKind.active", "Active Bar")}</option></select></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.restartPolicy", "Restart Policy")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.restartPolicy} onchange={(event) => updateAction(trigger.id, action.id, "restartPolicy", event)}><option value="restart">{t("actions.restart.restart", "Restart")}</option><option value="ignore_if_active">{t("actions.restart.ignore", "Ignore if Active")}</option></select></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.readyBehavior", "Ready Behavior")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.readyBehavior ?? "hide"} onchange={(event) => updateAction(trigger.id, action.id, "readyBehavior", event)}><option value="hide">{t("actions.ready.hide", "Hide at 0")}</option><option value="show_ready">{t("actions.ready.show", "Show Ready")}</option><option value="highlight_ready">{t("actions.ready.highlight", "Highlight Ready")}</option></select></label>
                              <label class="space-y-1 text-sm xl:col-span-2"><span>{t("actions.label", "Label Override")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.label ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "label", event)} /></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.color", "Color")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.color ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "color", event)} placeholder="rgba(250,204,21,0.72)" /></label>
                            </div>
                          {:else if action.type === "adjust_timer"}
                            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <label class="space-y-1 text-sm xl:col-span-2"><span>{t("actions.adjust.targetTrigger", "Target Trigger")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.targetTriggerId ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "targetTriggerId", event)}><option value="">{t("actions.adjust.selectTarget", "Select trigger")}</option>{#each $customTriggersFile.triggers.filter((item) => item.id !== trigger.id) as optionTrigger (optionTrigger.id)}<option value={optionTrigger.id}>{optionTrigger.name}</option>{/each}</select></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.adjust.mode", "Adjust Mode")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.mode} onchange={(event) => updateAction(trigger.id, action.id, "mode", event)}><option value="subtract">{t("actions.adjust.subtract", "Subtract")}</option><option value="add">{t("actions.adjust.add", "Add")}</option><option value="set_remaining">{t("actions.adjust.setRemaining", "Set Remaining")}</option></select></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.adjust.delta", "Delta (ms)")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.deltaMs} onchange={(event) => updateAction(trigger.id, action.id, "deltaMs", event)} /></label>
                            </div>
                          {:else if action.type === "increment_counter"}
                            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <label class="space-y-1 text-sm xl:col-span-2"><span>{t("actions.label", "Label Override")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.label ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "label", event)} /></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.counter.delta", "Counter Delta")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.delta} onchange={(event) => updateAction(trigger.id, action.id, "delta", event)} /></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.color", "Color")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.color ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "color", event)} placeholder="rgba(56,189,248,0.72)" /></label>
                            </div>
                          {:else if action.type === "show_notification"}
                            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <label class="space-y-1 text-sm xl:col-span-3"><span>{t("actions.notificationText", "Notification Text")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.text} onchange={(event) => updateAction(trigger.id, action.id, "text", event)} /></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.duration", "Duration (ms)")}</span><input type="number" class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.durationMs} onchange={(event) => updateAction(trigger.id, action.id, "durationMs", event)} /></label>
                            </div>
                          {:else if action.type === "play_sound"}
                            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <label class="space-y-1 text-sm xl:col-span-3"><span>{t("actions.soundPath", "Sound File")}</span><input class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.soundPath} onchange={(event) => updateAction(trigger.id, action.id, "soundPath", event)} /></label>
                              <div class="flex items-end gap-2"><Button variant="outline" class="flex-1" onclick={() => void browseSound(trigger.id, action.id)}>{t("actions.browse", "Browse")}</Button><Button variant="outline" class="flex-1" onclick={() => void testSound(action)}>{t("actions.testSound", "Test")}</Button></div>
                              <label class="space-y-1 text-sm"><span>{t("actions.volume", "Volume")}</span><input type="number" min="0" max="1" step="0.05" class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.volume} onchange={(event) => updateAction(trigger.id, action.id, "volume", event)} /></label>
                              <label class="space-y-1 text-sm"><span>{t("actions.routing", "Routing")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.routing} onchange={(event) => updateAction(trigger.id, action.id, "routing", event)}><option value="global_primary">{t("actions.routing.primary", "Global Primary")}</option><option value="global_secondary">{t("actions.routing.secondary", "Global Secondary")}</option><option value="global_both">{t("actions.routing.both", "Global Both")}</option><option value="override">{t("actions.routing.override", "Override")}</option></select></label>
                              {#if action.routing === "override"}
                                <label class="space-y-1 text-sm"><span>{t("actions.overridePrimary", "Override Primary")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.overridePrimaryDeviceId ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "overridePrimaryDeviceId", event)}><option value="">{t("audio.systemDefault", "System Default")}</option>{#each audioOutputs as device (device.deviceId)}<option value={device.deviceId}>{device.label}</option>{/each}</select></label>
                                <label class="space-y-1 text-sm"><span>{t("actions.overrideSecondary", "Override Secondary")}</span><select class="w-full rounded-md border border-border bg-background px-3 py-2" value={action.overrideSecondaryDeviceId ?? ""} onchange={(event) => updateAction(trigger.id, action.id, "overrideSecondaryDeviceId", event)}><option value="">{t("audio.disabled", "Disabled")}</option>{#each audioOutputs as device (device.deviceId)}<option value={device.deviceId}>{device.label}</option>{/each}</select></label>
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
