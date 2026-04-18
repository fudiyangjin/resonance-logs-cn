import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { get, writable } from "svelte/store";

import type {
  CustomTriggerAction,
  CustomTriggerDefinition,
  CustomTriggerGroup,
  CustomTriggersFile,
  TriggerAudioSettings,
  TriggerTemplateKind,
} from "$lib/custom-trigger-types";
import {
  DEFAULT_CUSTOM_TRIGGERS_FILE,
  DEFAULT_TRIGGER_AUDIO_SETTINGS,
} from "$lib/custom-trigger-types";

export const CUSTOM_TRIGGERS_UPDATED_EVENT = "custom-triggers-updated";

export const customTriggersFile = writable<CustomTriggersFile>(DEFAULT_CUSTOM_TRIGGERS_FILE);

let loadPromise: Promise<void> | null = null;
let syncListenerPromise: Promise<(() => void) | null> | null = null;

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAudio(value: Partial<TriggerAudioSettings> | null | undefined): TriggerAudioSettings {
  return {
    primaryOutputDeviceId: value?.primaryOutputDeviceId?.trim() || null,
    secondaryOutputDeviceId: value?.secondaryOutputDeviceId?.trim() || null,
  };
}

function normalizeAction(action: Partial<CustomTriggerAction> | null | undefined): CustomTriggerAction | null {
  if (!action?.type) return null;
  const id = String(action.id ?? randomId("action"));

  if (action.type === "start_timer") {
    const durationMs = Math.max(100, Number(action.durationMs) || 1000);
    return {
      id,
      type: "start_timer",
      durationMs,
      timerKind: action.timerKind === "active" ? "active" : "cooldown",
      restartPolicy: action.restartPolicy === "ignore_if_active" ? "ignore_if_active" : "restart",
      readyBehavior:
        action.readyBehavior === "show_ready"
          ? "show_ready"
          : action.readyBehavior === "highlight_ready"
            ? "highlight_ready"
            : "hide",
      label: action.label?.trim() || null,
      color: action.color?.trim() || null,
    };
  }

  if (action.type === "show_notification") {
    return {
      id,
      type: "show_notification",
      text: String(action.text ?? "").trim(),
      durationMs: Math.max(500, Number(action.durationMs) || 2500),
    };
  }

  if (action.type === "play_sound") {
    return {
      id,
      type: "play_sound",
      soundPath: String(action.soundPath ?? "").trim(),
      volume: Math.max(0, Math.min(1, Number(action.volume) || 1)),
      routing: action.routing === "global_secondary"
        ? "global_secondary"
        : action.routing === "global_both"
          ? "global_both"
          : action.routing === "override"
            ? "override"
            : "global_primary",
      overridePrimaryDeviceId: action.overridePrimaryDeviceId?.trim() || null,
      overrideSecondaryDeviceId: action.overrideSecondaryDeviceId?.trim() || null,
    };
  }

  if (action.type === "adjust_timer") {
    return {
      id,
      type: "adjust_timer",
      targetTriggerId: action.targetTriggerId?.trim() || null,
      mode: action.mode === "add" ? "add" : action.mode === "set_remaining" ? "set_remaining" : "subtract",
      deltaMs: Math.max(0, Number(action.deltaMs) || 0),
    };
  }

  if (action.type === "increment_counter") {
    return {
      id,
      type: "increment_counter",
      label: action.label?.trim() || null,
      color: action.color?.trim() || null,
      delta: Number.isFinite(Number(action.delta)) ? Number(action.delta) : 1,
    };
  }

  return null;
}

function normalizeGroup(group: Partial<CustomTriggerGroup> | null | undefined): CustomTriggerGroup | null {
  const id = String(group?.id ?? randomId("group")).trim();
  const name = String(group?.name ?? "").trim();
  if (!id || !name) return null;

  const safeGroup = group ?? {};
  const x = Number(safeGroup.x);
  const y = Number(safeGroup.y);
  const width = Number(safeGroup.width);
  const itemHeight = Number(safeGroup.itemHeight);
  const spacing = Number(safeGroup.spacing);

  return {
    id,
    name,
    enabled: safeGroup.enabled !== false,
    layoutMode: safeGroup.layoutMode === "notifications" ? "notifications" : "bars",
    direction: safeGroup.direction === "horizontal" ? "horizontal" : "vertical",
    sortMode:
      safeGroup.sortMode === "manual"
        ? "manual"
        : safeGroup.sortMode === "remaining_desc"
          ? "remaining_desc"
          : safeGroup.sortMode === "newest_first"
            ? "newest_first"
            : safeGroup.sortMode === "alphabetical"
              ? "alphabetical"
              : "remaining_asc",
    showHeader: safeGroup.showHeader !== false,
    hideWhenEmpty: safeGroup.hideWhenEmpty !== false,
    x: Number.isFinite(x) ? x : 30,
    y: Number.isFinite(y) ? y : 30,
    width: Math.max(180, Number.isFinite(width) ? width : 280),
    itemHeight: Math.max(18, Number.isFinite(itemHeight) ? itemHeight : 22),
    spacing: Math.max(0, Number.isFinite(spacing) ? spacing : 8),
    positionMode: safeGroup.positionMode === "deanchored" ? "deanchored" : "anchored",
    locked: safeGroup.locked === true,
    itemLayouts: Object.fromEntries(
      Object.entries(safeGroup.itemLayouts ?? {}).flatMap(([key, value]) => {
        const x = Number((value as { x?: unknown })?.x);
        const y = Number((value as { y?: unknown })?.y);
        const z = Number((value as { z?: unknown })?.z);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
        return [[key, { x, y, z: Number.isFinite(z) ? z : 0 }]];
      }),
    ),
  };
}

function normalizeTrigger(trigger: Partial<CustomTriggerDefinition> | null | undefined): CustomTriggerDefinition | null {
  const id = String(trigger?.id ?? randomId("trigger")).trim();
  const name = String(trigger?.name ?? "").trim();
  const groupId = String(trigger?.groupId ?? "").trim();
  if (!id || !name || !groupId || !trigger?.source?.sourceType || !trigger?.source?.event) return null;

  const actions = Array.isArray(trigger.actions)
    ? trigger.actions
        .map((action) => normalizeAction(action))
        .filter((action): action is CustomTriggerAction => action !== null)
    : [];

  if (actions.length === 0) return null;

  return {
    id,
    name,
    enabled: trigger.enabled !== false,
    groupId,
    source: {
      sourceType: trigger.source.sourceType,
      event: trigger.source.event,
      condition: {
        uid: Number.isFinite(Number(trigger.source.condition?.uid)) ? Number(trigger.source.condition?.uid) : null,
        minStacks: Number.isFinite(Number(trigger.source.condition?.minStacks)) ? Number(trigger.source.condition?.minStacks) : null,
        maxStacks: Number.isFinite(Number(trigger.source.condition?.maxStacks)) ? Number(trigger.source.condition?.maxStacks) : null,
        matchSummary: trigger.source.condition?.matchSummary?.trim() || null,
        valueIncludes: trigger.source.condition?.valueIncludes?.trim() || null,
        repeatSuppressMs: Number.isFinite(Number(trigger.source.condition?.repeatSuppressMs))
          ? Math.max(0, Number(trigger.source.condition?.repeatSuppressMs))
          : null,
        requireActiveTriggerId: trigger.source.condition?.requireActiveTriggerId?.trim() || null,
      },
    },
    actions,
    notes: trigger.notes?.trim() || null,
    sortOrder: Number.isFinite(Number(trigger.sortOrder)) ? Number(trigger.sortOrder) : 0,
  };
}



function getDefaultGroupPlacement(index: number, existingGroupId?: string): Pick<CustomTriggerGroup, "x" | "y" | "width" | "itemHeight" | "spacing"> {
  const template = DEFAULT_CUSTOM_TRIGGERS_FILE.groups.find((group) => group.id === existingGroupId)
    ?? DEFAULT_CUSTOM_TRIGGERS_FILE.groups[index];

  if (template) {
    return {
      x: template.x,
      y: template.y,
      width: template.width,
      itemHeight: template.itemHeight,
      spacing: template.spacing,
    };
  }

  return {
    x: 30 + index * 40,
    y: 30 + index * 28,
    width: 280,
    itemHeight: 22,
    spacing: 8,
  };
}
function getDefaultGroupId(): string {
  return DEFAULT_CUSTOM_TRIGGERS_FILE.groups[0]?.id ?? "group_default";
}

function normalizePayload(value: Partial<CustomTriggersFile> | null | undefined): CustomTriggersFile {
  const groups = Array.isArray(value?.groups)
    ? value.groups
        .map((group) => normalizeGroup(group))
        .filter((group): group is CustomTriggerGroup => group !== null)
    : [];

  const triggers = Array.isArray(value?.triggers)
    ? value.triggers
        .map((trigger) => normalizeTrigger(trigger))
        .filter((trigger): trigger is CustomTriggerDefinition => trigger !== null)
    : [];

  const nextGroups = groups.length > 0 ? groups : DEFAULT_CUSTOM_TRIGGERS_FILE.groups;
  const groupIds = new Set(nextGroups.map((group) => group.id));

  return {
    version: Math.max(3, Number(value?.version) || 1),
    audio: normalizeAudio(value?.audio ?? DEFAULT_TRIGGER_AUDIO_SETTINGS),
    groups: nextGroups,
    triggers: triggers.filter((trigger) => groupIds.has(trigger.groupId)),
  };
}

export async function loadCustomTriggers(force = false): Promise<void> {
  if (!force && loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    try {
      const payload = await invoke<string>("read_custom_triggers");
      customTriggersFile.set(normalizePayload(JSON.parse(payload)));
    } catch (error) {
      console.error("[custom-triggers] failed to load custom triggers", error);
      customTriggersFile.set(DEFAULT_CUSTOM_TRIGGERS_FILE);
    }
  })();

  await loadPromise;
}

export async function writeCustomTriggers(nextValue: CustomTriggersFile): Promise<void> {
  const normalized = normalizePayload(nextValue);
  await invoke("write_custom_triggers", { payload: JSON.stringify(normalized) });
  customTriggersFile.set(normalized);
}

export async function ensureCustomTriggerSyncListener(): Promise<void> {
  if (syncListenerPromise) {
    await syncListenerPromise;
    return;
  }

  syncListenerPromise = (async () => {
    try {
      return await listen(CUSTOM_TRIGGERS_UPDATED_EVENT, async () => {
        await loadCustomTriggers(true);
      });
    } catch (error) {
      console.error("[custom-triggers] failed to attach sync listener", error);
      return null;
    }
  })();

  await syncListenerPromise;
}

export async function addTriggerGroup(): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.groups.push({
    id: randomId("group"),
    name: `Group ${current.groups.length + 1}`,
    enabled: true,
    layoutMode: "bars",
    direction: "vertical",
    sortMode: "remaining_asc",
    showHeader: true,
    hideWhenEmpty: true,
    x: 30 + current.groups.length * 40,
    y: 30 + current.groups.length * 28,
    width: 280,
    itemHeight: 22,
    spacing: 8,
    positionMode: "anchored",
    locked: false,
    itemLayouts: {},
  });
  await writeCustomTriggers(current);
}

export async function updateTriggerGroup(groupId: string, patch: Partial<CustomTriggerGroup>): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.groups = current.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group));
  await writeCustomTriggers(current);
}

export async function deleteTriggerGroup(groupId: string): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  const remainingGroups = current.groups.filter((group) => group.id !== groupId);
  if (remainingGroups.length === 0) {
    return;
  }

  const fallbackGroupId = remainingGroups[0]?.id ?? getDefaultGroupId();
  current.groups = remainingGroups;
  current.triggers = current.triggers.map((trigger) =>
    trigger.groupId === groupId ? { ...trigger, groupId: fallbackGroupId } : trigger,
  );
  await writeCustomTriggers(current);
}

export async function addCustomTrigger(groupId?: string): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  const targetGroupId = groupId ?? current.groups[0]?.id ?? getDefaultGroupId();
  current.triggers.push({
    id: randomId("trigger"),
    name: `Trigger ${current.triggers.length + 1}`,
    enabled: true,
    groupId: targetGroupId,
    source: {
      sourceType: "buff",
      event: "add",
      condition: {
        uid: null,
        minStacks: null,
        maxStacks: null,
        matchSummary: null,
        valueIncludes: null,
        repeatSuppressMs: null,
        requireActiveTriggerId: null,
      },
    },
    actions: [
      {
        id: randomId("action"),
        type: "start_timer",
        durationMs: 10000,
        timerKind: "cooldown",
        restartPolicy: "restart",
        readyBehavior: "hide",
        label: null,
        color: null,
      },
    ],
    notes: null,
    sortOrder: current.triggers.length,
  });
  await writeCustomTriggers(current);
}

export async function addTriggerFromTemplate(kind: TriggerTemplateKind, groupId?: string): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  const targetGroupId = groupId ?? current.groups[0]?.id ?? getDefaultGroupId();
  const baseId = randomId("trigger");
  const trigger: CustomTriggerDefinition = {
    id: baseId,
    name:
      kind === "active_window"
        ? "Active Window"
        : kind === "proc_counter"
          ? "Proc Counter"
          : "Proc ICD",
    enabled: true,
    groupId: targetGroupId,
    source: {
      sourceType: "buff",
      event: kind === "proc_counter" ? "change" : "add",
      condition: {
        uid: null,
        minStacks: kind === "proc_counter" ? 1 : null,
        maxStacks: null,
        matchSummary: null,
        valueIncludes: null,
        repeatSuppressMs: kind === "proc_icd" ? 250 : null,
        requireActiveTriggerId: null,
      },
    },
    actions:
      kind === "active_window"
        ? [
            {
              id: randomId("action"),
              type: "start_timer",
              durationMs: 8000,
              timerKind: "active",
              restartPolicy: "restart",
              readyBehavior: "hide",
              label: null,
              color: null,
            },
          ]
        : kind === "proc_counter"
          ? [
              {
                id: randomId("action"),
                type: "increment_counter",
                label: null,
                color: null,
                delta: 1,
              },
            ]
          : [
              {
                id: randomId("action"),
                type: "start_timer",
                durationMs: 40000,
                timerKind: "cooldown",
                restartPolicy: "restart",
                readyBehavior: "show_ready",
                label: null,
                color: null,
              },
              {
                id: randomId("action"),
                type: "show_notification",
                text: "Proc ready",
                durationMs: 1800,
              },
            ],
    notes: null,
    sortOrder: current.triggers.length,
  };
  current.triggers.push(trigger);
  await writeCustomTriggers(current);
}

export async function updateCustomTrigger(triggerId: string, patch: Partial<CustomTriggerDefinition>): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.triggers = current.triggers.map((trigger) => (trigger.id === triggerId ? { ...trigger, ...patch } : trigger));
  await writeCustomTriggers(current);
}

export async function replaceTriggerAction(triggerId: string, actionId: string, patch: Partial<CustomTriggerAction>): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.triggers = current.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    return {
      ...trigger,
      actions: trigger.actions.map((action) => (action.id === actionId ? ({ ...action, ...patch } as CustomTriggerAction) : action)),
    };
  });
  await writeCustomTriggers(current);
}

export async function addActionToTrigger(triggerId: string, type: CustomTriggerAction["type"]): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.triggers = current.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    const nextAction: CustomTriggerAction =
      type === "show_notification"
        ? {
            id: randomId("action"),
            type: "show_notification",
            text: trigger.name,
            durationMs: 2500,
          }
        : type === "play_sound"
          ? {
              id: randomId("action"),
              type: "play_sound",
              soundPath: "",
              volume: 1,
              routing: "global_primary",
              overridePrimaryDeviceId: null,
              overrideSecondaryDeviceId: null,
            }
          : type === "adjust_timer"
            ? {
                id: randomId("action"),
                type: "adjust_timer",
                targetTriggerId: null,
                mode: "subtract",
                deltaMs: 1000,
              }
            : type === "increment_counter"
              ? {
                  id: randomId("action"),
                  type: "increment_counter",
                  label: null,
                  color: null,
                  delta: 1,
                }
              : {
                  id: randomId("action"),
                  type: "start_timer",
                  durationMs: 10000,
                  timerKind: "cooldown",
                  restartPolicy: "restart",
                  readyBehavior: "hide",
                  label: null,
                  color: null,
                };
    return {
      ...trigger,
      actions: [...trigger.actions, nextAction],
    };
  });
  await writeCustomTriggers(current);
}

export async function deleteTriggerAction(triggerId: string, actionId: string): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.triggers = current.triggers
    .map((trigger) => {
      if (trigger.id !== triggerId) return trigger;
      return {
        ...trigger,
        actions: trigger.actions.filter((action) => action.id !== actionId),
      };
    })
    .filter((trigger) => trigger.actions.length > 0);
  await writeCustomTriggers(current);
}

export async function deleteCustomTrigger(triggerId: string): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.triggers = current.triggers.filter((trigger) => trigger.id !== triggerId);
  await writeCustomTriggers(current);
}


export async function setTriggerGroupItemLayout(
  groupId: string,
  itemKey: string,
  patch: Partial<CustomTriggerGroup["itemLayouts"][string]>,
): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.groups = current.groups.map((group) => {
    if (group.id !== groupId) return group;
    const previous = group.itemLayouts[itemKey] ?? { x: group.x, y: group.y, z: 0 };
    return {
      ...group,
      itemLayouts: {
        ...group.itemLayouts,
        [itemKey]: {
          ...previous,
          ...patch,
        },
      },
    };
  });
  await writeCustomTriggers(current);
}

export async function clearTriggerGroupItemLayouts(groupId: string): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.groups = current.groups.map((group) =>
    group.id === groupId ? { ...group, itemLayouts: {} } : group,
  );
  await writeCustomTriggers(current);
}

export async function updateCustomTriggerAudio(patch: Partial<TriggerAudioSettings>): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.audio = {
    ...current.audio,
    ...normalizeAudio(patch),
  };
  await writeCustomTriggers(current);
}


export async function resetCustomTriggerOverlayPositions(): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.groups = current.groups.map((group, index) => {
    const defaults = getDefaultGroupPlacement(index, group.id);
    return {
      ...group,
      x: defaults.x,
      y: defaults.y,
      itemLayouts: {},
    };
  });
  await writeCustomTriggers(current);
}

export async function resetCustomTriggerOverlaySizes(): Promise<void> {
  const current = normalizePayload(get(customTriggersFile));
  current.groups = current.groups.map((group, index) => {
    const defaults = getDefaultGroupPlacement(index, group.id);
    return {
      ...group,
      width: defaults.width,
      itemHeight: defaults.itemHeight,
      spacing: defaults.spacing,
    };
  });
  await writeCustomTriggers(current);
}
