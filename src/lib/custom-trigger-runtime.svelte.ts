import { listen } from "@tauri-apps/api/event";
import { get, writable } from "svelte/store";

import { playTriggerSound } from "$lib/custom-trigger-audio";
import { resolveLoggerEntryName } from "$lib/custom-trigger-resolver";
import {
  customDefinitions,
  ensureCustomDefinitionsSyncListener,
  loadCustomDefinitions,
} from "$lib/custom-definitions-store";
import {
  CUSTOM_TRIGGERS_UPDATED_EVENT,
  customTriggersFile,
  ensureCustomTriggerSyncListener,
  loadCustomTriggers,
} from "$lib/custom-triggers-store";
import type {
  AdjustTimerAction,
  CustomTriggerAction,
  CustomTriggerDefinition,
  CustomTriggerReplaySession,
  IncrementCounterAction,
  TriggerNotificationItem,
  TriggerRuntimeItem,
} from "$lib/custom-trigger-types";
import type { EventLoggerBatchPayload, EventLoggerEntry } from "$lib/event-logger-types";
import { SETTINGS } from "$lib/settings-store";

export const CUSTOM_TRIGGER_BATCH_EVENT = "custom-trigger-batch";
export const CUSTOM_TRIGGER_MANUAL_EVENT = "custom-trigger-manual";


export const triggerRuntimeItems = writable<TriggerRuntimeItem[]>([]);
export const triggerNotifications = writable<TriggerNotificationItem[]>([]);

export type TriggerReplayState = {
  isRecording: boolean;
  isReplaying: boolean;
  recordedFrames: number;
  recordedEvents: number;
  sessionName: string;
  startedAt: number | null;
};

export const triggerReplayState = writable<TriggerReplayState>({
  isRecording: false,
  isReplaying: false,
  recordedFrames: 0,
  recordedEvents: 0,
  sessionName: "custom-trigger-session",
  startedAt: null,
});

type ManualTriggerPayload =
  | { type: "fire_trigger"; triggerId: string }
  | { type: "stop_trigger"; triggerId: string }
  | { type: "reset_trigger"; triggerId: string }
  | { type: "reset_group"; groupId: string }
  | { type: "reset_all" };

const activeItemMap = new Map<string, TriggerRuntimeItem>();
const categorySnapshots = new Map<string, Map<string, EventLoggerEntry>>();
const soundCooldownMap = new Map<string, number>();
const triggerCooldownMap = new Map<string, number>();
let runtimeStarted = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const recordedFrames: CustomTriggerReplaySession["frames"] = [];
let recordingStartMs: number | null = null;
let replayTimeouts: ReturnType<typeof setTimeout>[] = [];

function syncReplayState(overrides: Partial<TriggerReplayState> = {}) {
  triggerReplayState.update((state) => ({
    ...state,
    recordedFrames: recordedFrames.length,
    recordedEvents: recordedFrames.reduce((sum, frame) => sum + (frame.payload.entries?.length ?? 0), 0),
    ...overrides,
  }));
}

function getLocale() {
  return SETTINGS.live.general.state.language;
}

function eventKey(entry: EventLoggerEntry): string {
  return [entry.category, entry.uid ?? "na", entry.targetUid ?? "na", entry.sourceUid ?? "na"].join(":");
}

function cloneEntry(entry: EventLoggerEntry, action: string): EventLoggerEntry {
  return { ...entry, action };
}

function syncItems() {
  triggerRuntimeItems.set(Array.from(activeItemMap.values()));
}

function diffSnapshotEntries(entries: EventLoggerEntry[]): EventLoggerEntry[] {
  if (entries.length === 0) return [];

  const category = entries[0]?.category;
  const shouldDiff = (category === "buff" || category === "monster_buff") && entries.every((entry) => entry.category === category);
  if (!shouldDiff) {
    return entries;
  }

  const previousSnapshot = categorySnapshots.get(category) ?? new Map<string, EventLoggerEntry>();
  const nextSnapshot = new Map<string, EventLoggerEntry>();
  const derived: EventLoggerEntry[] = [];

  for (const entry of entries) {
    const key = eventKey(entry);
    const previous = previousSnapshot.get(key);
    nextSnapshot.set(key, entry);

    if (!previous) {
      derived.push(cloneEntry(entry, "add"));
      continue;
    }

    const stacksChanged = (previous.stacks ?? null) !== (entry.stacks ?? null);
    const durationChanged = (previous.durationMs ?? null) !== (entry.durationMs ?? null);
    const valueChanged = (previous.value ?? null) !== (entry.value ?? null);
    derived.push(cloneEntry(entry, stacksChanged || durationChanged || valueChanged ? "change" : "update"));
  }

  for (const [key, previous] of previousSnapshot.entries()) {
    if (!nextSnapshot.has(key)) {
      derived.push(cloneEntry(previous, "remove"));
    }
  }

  categorySnapshots.set(category, nextSnapshot);
  return derived;
}

function resetRuntimeState() {
  activeItemMap.clear();
  categorySnapshots.clear();
  soundCooldownMap.clear();
  triggerCooldownMap.clear();
  triggerRuntimeItems.set([]);
  triggerNotifications.set([]);
}

function trimRuntime() {
  const now = Date.now();
  let changed = false;
  for (const [key, item] of activeItemMap.entries()) {
    if (item.kind === "counter") continue;
    if (item.readyBehavior === "hide" && item.endTs <= now) {
      activeItemMap.delete(key);
      changed = true;
    }
  }

  if (changed) {
    syncItems();
  }

  triggerNotifications.update((items) => items.filter((item) => item.expiresAt > now));
}

function ensureTick() {
  if (tickTimer) return;
  tickTimer = setInterval(trimRuntime, 100);
}

function normalizeSummaryText(text: string | null | undefined): string {
  return text?.trim().toLowerCase() ?? "";
}

function actionLabel(trigger: CustomTriggerDefinition, action: CustomTriggerAction, event: EventLoggerEntry): string {
  if ((action.type === "start_timer" || action.type === "increment_counter") && action.label?.trim()) {
    return action.label.trim();
  }
  return resolveLoggerEntryName(event, getLocale(), get(customDefinitions)) || trigger.name;
}

function isTriggerActive(triggerId: string): boolean {
  const now = Date.now();
  for (const item of activeItemMap.values()) {
    if (item.triggerId !== triggerId) continue;
    if (item.kind === "counter") {
      if ((item.counterValue ?? 0) !== 0) return true;
      continue;
    }
    if (item.endTs > now || item.readyBehavior !== "hide") {
      return true;
    }
  }
  return false;
}

function matchesTrigger(trigger: CustomTriggerDefinition, event: EventLoggerEntry): boolean {
  if (!trigger.enabled) return false;
  if (trigger.source.sourceType !== event.category) return false;
  if (trigger.source.event !== event.action) return false;

  const condition = trigger.source.condition;
  if (Number.isFinite(Number(condition?.uid)) && Number(event.uid) !== Number(condition?.uid)) {
    return false;
  }

  if (Number.isFinite(Number(condition?.minStacks)) && Number(event.stacks ?? 0) < Number(condition?.minStacks)) {
    return false;
  }

  if (Number.isFinite(Number(condition?.maxStacks)) && Number(event.stacks ?? 0) > Number(condition?.maxStacks)) {
    return false;
  }

  const summary = normalizeSummaryText(event.summary);
  if (condition?.matchSummary?.trim() && !summary.includes(condition.matchSummary.trim().toLowerCase())) {
    return false;
  }

  const value = normalizeSummaryText(event.value);
  if (condition?.valueIncludes?.trim() && !value.includes(condition.valueIncludes.trim().toLowerCase())) {
    return false;
  }

  if (condition?.requireActiveTriggerId?.trim() && !isTriggerActive(condition.requireActiveTriggerId)) {
    return false;
  }

  if (Number.isFinite(Number(condition?.repeatSuppressMs))) {
    const last = triggerCooldownMap.get(trigger.id) ?? 0;
    const windowMs = Math.max(0, Number(condition?.repeatSuppressMs));
    if (Date.now() - last < windowMs) {
      return false;
    }
  }

  return true;
}

function pushNotification(text: string, durationMs: number) {
  const now = Date.now();
  const nextItem: TriggerNotificationItem = {
    id: `note_${now}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    createdAt: now,
    expiresAt: now + Math.max(500, durationMs),
  };
  triggerNotifications.update((items) => [...items, nextItem].slice(-20));
}

function startTimerFromAction(
  trigger: CustomTriggerDefinition,
  action: Extract<CustomTriggerAction, { type: "start_timer" }>,
  event: EventLoggerEntry,
) {
  const instanceId = `${trigger.id}:${action.id}`;
  const now = Date.now();
  const existing = activeItemMap.get(instanceId);
  if (existing && existing.endTs > now && action.restartPolicy === "ignore_if_active") {
    return;
  }

  const item: TriggerRuntimeItem = {
    instanceId,
    triggerId: trigger.id,
    actionId: action.id,
    groupId: trigger.groupId,
    name: actionLabel(trigger, action, event),
    kind: action.timerKind,
    startTs: now,
    endTs: now + Math.max(100, action.durationMs),
    durationMs: Math.max(100, action.durationMs),
    color: action.color ?? null,
    readyBehavior: action.readyBehavior ?? "hide",
    sortOrder: trigger.sortOrder ?? 0,
  };
  activeItemMap.set(instanceId, item);
  syncItems();
}

function adjustTimers(action: AdjustTimerAction) {
  if (!action.targetTriggerId) return;
  const now = Date.now();
  let changed = false;
  for (const [key, item] of activeItemMap.entries()) {
    if (item.triggerId !== action.targetTriggerId || item.kind === "counter") continue;
    let nextEndTs = item.endTs;
    if (action.mode === "add") {
      nextEndTs = item.endTs + action.deltaMs;
    } else if (action.mode === "set_remaining") {
      nextEndTs = now + action.deltaMs;
    } else {
      nextEndTs = item.endTs - action.deltaMs;
    }
    activeItemMap.set(key, {
      ...item,
      endTs: Math.max(now, nextEndTs),
    });
    changed = true;
  }

  if (changed) {
    syncItems();
  }
}

function incrementCounter(
  trigger: CustomTriggerDefinition,
  action: IncrementCounterAction,
  event: EventLoggerEntry,
) {
  const instanceId = `${trigger.id}:${action.id}`;
  const existing = activeItemMap.get(instanceId);
  const nextValue = (existing?.counterValue ?? 0) + action.delta;
  activeItemMap.set(instanceId, {
    instanceId,
    triggerId: trigger.id,
    actionId: action.id,
    groupId: trigger.groupId,
    name: actionLabel(trigger, action, event),
    kind: "counter",
    startTs: existing?.startTs ?? Date.now(),
    endTs: Number.MAX_SAFE_INTEGER,
    durationMs: 0,
    color: action.color ?? null,
    readyBehavior: "show_ready",
    sortOrder: trigger.sortOrder ?? 0,
    counterValue: nextValue,
  });
  syncItems();
}

function stopTrigger(triggerId: string) {
  let changed = false;
  for (const [key, item] of activeItemMap.entries()) {
    if (item.triggerId !== triggerId) continue;
    activeItemMap.delete(key);
    changed = true;
  }
  if (changed) syncItems();
}

function resetGroup(groupId: string) {
  let changed = false;
  for (const [key, item] of activeItemMap.entries()) {
    if (item.groupId !== groupId) continue;
    activeItemMap.delete(key);
    changed = true;
  }
  if (changed) syncItems();
}

async function runAction(trigger: CustomTriggerDefinition, action: CustomTriggerAction, event: EventLoggerEntry) {
  if (action.type === "start_timer") {
    startTimerFromAction(trigger, action, event);
    return;
  }

  if (action.type === "show_notification") {
    pushNotification(action.text || trigger.name, action.durationMs);
    return;
  }

  if (action.type === "play_sound") {
    const key = `${trigger.id}:${action.id}:${action.soundPath}`;
    const now = Date.now();
    const lastPlayedAt = soundCooldownMap.get(key) ?? 0;
    if (now - lastPlayedAt < 250) {
      return;
    }
    soundCooldownMap.set(key, now);
    await playTriggerSound(action);
    return;
  }

  if (action.type === "adjust_timer") {
    adjustTimers(action);
    return;
  }

  if (action.type === "increment_counter") {
    incrementCounter(trigger, action, event);
  }
}

async function processDerivedEvents(entries: EventLoggerEntry[]) {
  const config = get(customTriggersFile);
  if (!config.triggers.length) return;

  for (const entry of entries) {
    if ((entry.category === "encounter" && entry.action === "reset") || (entry.category === "scene" && entry.action === "change")) {
      resetRuntimeState();
    }
    for (const trigger of config.triggers) {
      if (!matchesTrigger(trigger, entry)) continue;
      triggerCooldownMap.set(trigger.id, Date.now());
      for (const action of trigger.actions) {
        await runAction(trigger, action, entry);
      }
    }
  }
}

async function processManualPayload(payload: ManualTriggerPayload) {
  if (!payload) return;
  const config = get(customTriggersFile);

  if (payload.type === "reset_all") {
    resetRuntimeState();
    return;
  }

  if (payload.type === "reset_group") {
    resetGroup(payload.groupId);
    return;
  }

  if (payload.type === "stop_trigger" || payload.type === "reset_trigger") {
    stopTrigger(payload.triggerId);
    return;
  }

  if (payload.type === "fire_trigger") {
    const trigger = config.triggers.find((item) => item.id === payload.triggerId);
    if (!trigger) return;
    const syntheticEvent: EventLoggerEntry = {
      tsMs: Date.now(),
      category: trigger.source.sourceType,
      action: trigger.source.event,
      uid: trigger.source.condition?.uid ?? null,
      targetUid: null,
      sourceUid: null,
      nameHint: trigger.name,
      summary: trigger.name,
      stacks: trigger.source.condition?.minStacks ?? 1,
      durationMs: null,
      remainingMs: null,
      value: null,
      raw: { manual: true, triggerId: trigger.id },
    };
    for (const action of trigger.actions) {
      await runAction(trigger, action, syntheticEvent);
    }
  }
}

export async function fireCustomTrigger(triggerId: string) {
  await ensureCustomTriggerRuntimeStarted();
  await processManualPayload({ type: "fire_trigger", triggerId });
}

export async function stopCustomTrigger(triggerId: string) {
  await ensureCustomTriggerRuntimeStarted();
  await processManualPayload({ type: "stop_trigger", triggerId });
}

export async function resetCustomTrigger(triggerId: string) {
  await ensureCustomTriggerRuntimeStarted();
  await processManualPayload({ type: "reset_trigger", triggerId });
}

export async function resetCustomTriggerGroup(groupId: string) {
  await ensureCustomTriggerRuntimeStarted();
  await processManualPayload({ type: "reset_group", groupId });
}

export async function resetAllCustomTriggerRuntimeState() {
  await ensureCustomTriggerRuntimeStarted();
  await processManualPayload({ type: "reset_all" });
}

export async function processCustomTriggerBatch(payload: EventLoggerBatchPayload) {
  if (!payload?.entries?.length) return;
  maybeRecordBatch(payload);
  const derived = diffSnapshotEntries(payload.entries);
  await processDerivedEvents(derived);
}



function cloneBatchPayload(payload: EventLoggerBatchPayload): EventLoggerBatchPayload {
  return {
    entries: payload.entries.map((entry) => ({
      ...entry,
      raw: entry.raw == null ? entry.raw : JSON.parse(JSON.stringify(entry.raw)),
    })),
  };
}

function maybeRecordBatch(payload: EventLoggerBatchPayload) {
  const state = get(triggerReplayState);
  if (!state.isRecording || !payload?.entries?.length) return;
  const firstTs = payload.entries[0]?.tsMs ?? Date.now();
  if (recordingStartMs == null) {
    recordingStartMs = firstTs;
    syncReplayState({ startedAt: firstTs });
  }
  recordedFrames.push({
    offsetMs: Math.max(0, firstTs - recordingStartMs),
    payload: cloneBatchPayload(payload),
  });
  syncReplayState();
}

export function startCustomTriggerRecording(sessionName?: string) {
  recordedFrames.splice(0, recordedFrames.length);
  recordingStartMs = null;
  syncReplayState({
    isRecording: true,
    isReplaying: false,
    sessionName: sessionName?.trim() || get(triggerReplayState).sessionName || "custom-trigger-session",
    startedAt: null,
  });
}

export function stopCustomTriggerRecording() {
  syncReplayState({ isRecording: false });
}

export function clearCustomTriggerRecording() {
  recordedFrames.splice(0, recordedFrames.length);
  recordingStartMs = null;
  syncReplayState({ recordedFrames: 0, recordedEvents: 0, startedAt: null });
}

export function getCustomTriggerReplaySession(): CustomTriggerReplaySession {
  const state = get(triggerReplayState);
  return {
    version: 1,
    createdAt: Date.now(),
    name: state.sessionName || "custom-trigger-session",
    frames: recordedFrames.map((frame) => ({
      offsetMs: frame.offsetMs,
      payload: cloneBatchPayload(frame.payload),
    })),
  };
}

export function importCustomTriggerReplaySession(payload: unknown) {
  const input = payload as Partial<CustomTriggerReplaySession> | null | undefined;
  const frames = Array.isArray(input?.frames)
    ? input.frames
        .map((frame) => ({
          offsetMs: Math.max(0, Number(frame?.offsetMs) || 0),
          payload: {
            entries: Array.isArray(frame?.payload?.entries) ? frame.payload.entries : [],
          },
        }))
        .filter((frame) => frame.payload.entries.length > 0)
    : [];
  recordedFrames.splice(0, recordedFrames.length, ...frames);
  recordingStartMs = null;
  syncReplayState({
    isRecording: false,
    sessionName: String(input?.name ?? "custom-trigger-session") || "custom-trigger-session",
    startedAt: null,
  });
}

export function stopCustomTriggerReplay() {
  for (const timeout of replayTimeouts) {
    clearTimeout(timeout);
  }
  replayTimeouts = [];
  syncReplayState({ isReplaying: false });
}

export function replayCustomTriggerSession(speed = 1) {
  stopCustomTriggerReplay();
  if (!recordedFrames.length) return;
  const divisor = Math.max(0.1, speed || 1);
  resetRuntimeState();
  syncReplayState({ isReplaying: true });
  recordedFrames.forEach((frame, index) => {
    const timeout = setTimeout(async () => {
      await processCustomTriggerBatch(cloneBatchPayload(frame.payload));
      if (index === recordedFrames.length - 1) {
        syncReplayState({ isReplaying: false });
        replayTimeouts = [];
      }
    }, Math.max(0, Math.round(frame.offsetMs / divisor)));
    replayTimeouts.push(timeout);
  });
}

export async function ensureCustomTriggerRuntimeStarted() {
  if (runtimeStarted) return;
  runtimeStarted = true;
  ensureTick();
  await loadCustomDefinitions();
  await ensureCustomDefinitionsSyncListener();
  await loadCustomTriggers();
  await ensureCustomTriggerSyncListener();

  await listen<EventLoggerBatchPayload>(CUSTOM_TRIGGER_BATCH_EVENT, async (event) => {
    await processCustomTriggerBatch(event.payload);
  });

  await listen<ManualTriggerPayload>(CUSTOM_TRIGGER_MANUAL_EVENT, async (event) => {
    await processManualPayload(event.payload);
  });

  await listen(CUSTOM_TRIGGERS_UPDATED_EVENT, async () => {
    await loadCustomTriggers(true);
  });
}
