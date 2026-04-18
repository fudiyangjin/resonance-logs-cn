import type { EventLoggerEntry } from "$lib/event-logger-types";

export type CustomTriggerSourceType =
  | "buff"
  | "monster_buff"
  | "skill"
  | "skill_cd"
  | "counter"
  | "encounter"
  | "scene"
  | "system"
  | "hate";

export type CustomTriggerEventType = "add" | "remove" | "update" | "change" | "ready" | "reset" | string;

export type CustomTriggerSortMode =
  | "manual"
  | "remaining_asc"
  | "remaining_desc"
  | "newest_first"
  | "alphabetical";

export type CustomTriggerLayoutMode = "bars" | "notifications";
export type CustomTriggerDirection = "vertical" | "horizontal";
export type TriggerBarKind = "cooldown" | "active" | "counter";
export type TriggerReadyBehavior = "hide" | "show_ready" | "highlight_ready";
export type TriggerRestartPolicy = "restart" | "ignore_if_active";

export type TriggerSoundRouting =
  | "global_primary"
  | "global_secondary"
  | "global_both"
  | "override";

export type TriggerAdjustMode = "add" | "subtract" | "set_remaining";

export type CustomTriggerCondition = {
  uid?: number | null;
  minStacks?: number | null;
  maxStacks?: number | null;
  matchSummary?: string | null;
  valueIncludes?: string | null;
  repeatSuppressMs?: number | null;
  requireActiveTriggerId?: string | null;
};

export type CustomTriggerTrigger = {
  sourceType: CustomTriggerSourceType;
  event: CustomTriggerEventType;
  condition?: CustomTriggerCondition;
};

export type StartTimerAction = {
  id: string;
  type: "start_timer";
  durationMs: number;
  timerKind: Exclude<TriggerBarKind, "counter">;
  restartPolicy: TriggerRestartPolicy;
  readyBehavior?: TriggerReadyBehavior;
  label?: string | null;
  color?: string | null;
};

export type ShowNotificationAction = {
  id: string;
  type: "show_notification";
  text: string;
  durationMs: number;
};

export type PlaySoundAction = {
  id: string;
  type: "play_sound";
  soundPath: string;
  volume: number;
  routing: TriggerSoundRouting;
  overridePrimaryDeviceId?: string | null;
  overrideSecondaryDeviceId?: string | null;
};

export type AdjustTimerAction = {
  id: string;
  type: "adjust_timer";
  targetTriggerId: string | null;
  mode: TriggerAdjustMode;
  deltaMs: number;
};

export type IncrementCounterAction = {
  id: string;
  type: "increment_counter";
  label?: string | null;
  color?: string | null;
  delta: number;
};

export type CustomTriggerAction =
  | StartTimerAction
  | ShowNotificationAction
  | PlaySoundAction
  | AdjustTimerAction
  | IncrementCounterAction;

export type CustomTriggerDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  groupId: string;
  source: CustomTriggerTrigger;
  actions: CustomTriggerAction[];
  notes?: string | null;
  sortOrder?: number;
};

export type CustomTriggerGroupPositionMode = "anchored" | "deanchored";

export type CustomTriggerItemLayout = {
  x: number;
  y: number;
  z: number;
};

export type CustomTriggerGroup = {
  id: string;
  name: string;
  enabled: boolean;
  layoutMode: CustomTriggerLayoutMode;
  direction: CustomTriggerDirection;
  sortMode: CustomTriggerSortMode;
  showHeader: boolean;
  hideWhenEmpty: boolean;
  x: number;
  y: number;
  width: number;
  itemHeight: number;
  spacing: number;
  positionMode: CustomTriggerGroupPositionMode;
  locked: boolean;
  itemLayouts: Record<string, CustomTriggerItemLayout>;
};

export type TriggerAudioSettings = {
  primaryOutputDeviceId: string | null;
  secondaryOutputDeviceId: string | null;
};

export type CustomTriggersFile = {
  version: number;
  audio: TriggerAudioSettings;
  groups: CustomTriggerGroup[];
  triggers: CustomTriggerDefinition[];
};

export type TriggerRuntimeItem = {
  instanceId: string;
  triggerId: string;
  actionId: string;
  groupId: string;
  name: string;
  kind: TriggerBarKind;
  startTs: number;
  endTs: number;
  durationMs: number;
  color: string | null;
  readyBehavior: TriggerReadyBehavior;
  sortOrder: number;
  counterValue?: number;
};

export type TriggerNotificationItem = {
  id: string;
  text: string;
  createdAt: number;
  expiresAt: number;
};

export type TriggerTemplateKind = "proc_icd" | "active_window" | "proc_counter";

export const DEFAULT_TRIGGER_AUDIO_SETTINGS: TriggerAudioSettings = {
  primaryOutputDeviceId: null,
  secondaryOutputDeviceId: null,
};

export const DEFAULT_CUSTOM_TRIGGERS_FILE: CustomTriggersFile = {
  version: 3,
  audio: { ...DEFAULT_TRIGGER_AUDIO_SETTINGS },
  groups: [
    {
      id: "group_cooldowns",
      name: "Cooldowns",
      enabled: true,
      layoutMode: "bars",
      direction: "vertical",
      sortMode: "remaining_asc",
      showHeader: true,
      hideWhenEmpty: true,
      x: 30,
      y: 30,
      width: 280,
      itemHeight: 22,
      spacing: 8,
      positionMode: "anchored",
      locked: false,
      itemLayouts: {},
    },
    {
      id: "group_notifications",
      name: "Notifications",
      enabled: true,
      layoutMode: "notifications",
      direction: "vertical",
      sortMode: "newest_first",
      showHeader: false,
      hideWhenEmpty: true,
      x: 320,
      y: 30,
      width: 280,
      itemHeight: 22,
      spacing: 8,
      positionMode: "anchored",
      locked: false,
      itemLayouts: {},
    },
  ],
  triggers: [],
};


export type RecordedTriggerBatch = {
  offsetMs: number;
  payload: {
    entries: EventLoggerEntry[];
  };
};

export type CustomTriggerReplaySession = {
  version: number;
  createdAt: number;
  name: string;
  frames: RecordedTriggerBatch[];
};
