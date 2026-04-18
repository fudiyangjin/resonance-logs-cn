export type LoggerCategory =
  | "buff"
  | "monster_buff"
  | "skill"
  | "skill_cd"
  | "counter"
  | "encounter"
  | "scene"
  | "system"
  | "hate"
  | "chat"
  | "item_drop"
  | "live_totals"
  | "boss_hp"
  | "player"
  | "mob"
  | "player_skill_damage"
  | "player_skill_heal"
  | "player_skill_taken"
  | "player_target_damage"
  | "player_target_skill_damage"
  | "player_target_skill_heal";

export type LoggerDisplayMode = "name" | "name_uid" | "uid";

export type EventLoggerEntry = {
  tsMs: number;
  category: LoggerCategory | string;
  action: string;
  uid?: number | null;
  targetUid?: number | null;
  sourceUid?: number | null;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  nameHint?: string | null;
  summary?: string | null;
  stacks?: number | null;
  durationMs?: number | null;
  remainingMs?: number | null;
  value?: string | null;
  raw?: unknown;
};

export type EventLoggerBatchPayload = {
  entries: EventLoggerEntry[];
};
