/**
 * @file This file contains the settings store for the application.
 * It uses `@tauri-store/svelte` to create persistent stores for user settings.
 */
import { RuneStore } from "@tauri-store/svelte";
import {
  createDefaultSkillCdRegion,
  type SkillCdLayout,
  type SkillCdRegion,
} from "./skill-cd-layout";
import {
  DEFAULT_MINIMAP_MARKER_COLORS,
  normalizeMinimapMarkerSettings,
  type MinimapMarkerColors,
} from "./minimap-marker-settings";
export type { MinimapMarkerColors } from "./minimap-marker-settings";
import type { CounterSource } from "./bindings";
import { buffCompositeAliases, type BuffComposite } from "./buff-composites";
import type { BuffIconOverrideMap } from "./buff-icons";
import type {
  BuffAliasMap as ConfigBuffAliasMap,
  BuffCategoryKey,
} from "./config/buff-name-table";
import type { AppLocale } from "./i18n/locales";
import {
  cloneHeaderCustomLayout,
  type HeaderCustomLayout,
  type HeaderLayoutMode,
} from "./live-header-layout";
import {
  createDefaultDpsColumnLabels,
  type DpsColumnLabels,
} from "./column-labels";
import type { CounterEffectSlotPreset } from "./skill-mappings";

export const DEFAULT_STATS = {
  totalDmg: true,
  dps: true,
  effectiveTotal: true,
  effectiveDps: true,
  tdps: false,
  bossDmg: true,
  bossDps: true,
  dmgPct: true,
  critRate: true,
  critDmgRate: true,
  luckyRate: false,
  luckyDmgRate: false,
  hits: false,
  hitsPerMinute: false,
  avgDmg: false,
  maxDmg: false,
  minDmg: false,
  property: true,
  damageMode: true,
};

export const DEFAULT_HISTORY_RETENTION_LIMIT = 200;
export const MIN_HISTORY_RETENTION_LIMIT = 1;
export const MAX_HISTORY_RETENTION_LIMIT = 2000;

export function normalizeHistoryRetentionLimit(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_HISTORY_RETENTION_LIMIT &&
    value <= MAX_HISTORY_RETENTION_LIMIT
    ? value
    : DEFAULT_HISTORY_RETENTION_LIMIT;
}

export const DEFAULT_LIVE_TANKED_PLAYER_STATS = {
  totalDmg: true,
  dps: true,
  dmgPct: true,
  critRate: true,
  critDmgRate: true,
  luckyRate: false,
  luckyDmgRate: false,
  blockRate: false,
  luckyBlockRate: false,
  hits: false,
  hitsPerMinute: false,
};

export const DEFAULT_LIVE_TANKED_SKILL_STATS = {
  ...DEFAULT_LIVE_TANKED_PLAYER_STATS,
  avgDmg: false,
  maxDmg: false,
  minDmg: false,
  property: true,
  damageMode: true,
};

export const DEFAULT_HISTORY_STATS = {
  totalDmg: true,
  dps: true,
  effectiveTotal: true,
  effectiveDps: true,
  tdps: false,
  bossDmg: true,
  bossDps: true,
  dmgPct: true,
  critRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  hits: false,
  hitsPerMinute: false,
  avgDmg: false,
  maxDmg: false,
  minDmg: false,
  property: true,
  damageMode: true,
};

export const DEFAULT_HISTORY_TANKED_STATS = {
  damageTaken: true,
  tankedPS: true,
  tankedPct: true,
  critTakenRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  blockRate: false,
  luckyBlockRate: false,
  hitsTaken: false,
  hitsPerMinute: false,
};

export const DEFAULT_HISTORY_TANKED_SKILL_STATS = {
  totalDmg: true,
  dps: true,
  dmgPct: true,
  critRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  blockRate: false,
  luckyBlockRate: false,
  hits: false,
  hitsPerMinute: false,
  avgDmg: false,
  maxDmg: false,
  minDmg: false,
  property: true,
  damageMode: true,
};

export const DEFAULT_HISTORY_HEAL_STATS = {
  healDealt: true,
  hps: true,
  effectiveHeal: true,
  ehps: true,
  healPct: true,
  critHealRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  hitsHeal: false,
  hitsPerMinute: false,
  avgDmg: false,
  maxDmg: false,
  minDmg: false,
};

// Default column order for live tables (keys from column-data.ts)
export const DEFAULT_DPS_PLAYER_COLUMN_ORDER = [
  "totalDmg",
  "dps",
  "effectiveTotal",
  "effectiveDps",
  "tdps",
  "bossDmg",
  "bossDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "hits",
  "hitsPerMinute",
];
export const DEFAULT_DPS_SKILL_COLUMN_ORDER = [
  "totalDmg",
  "dps",
  "effectiveTotal",
  "effectiveDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "hits",
  "hitsPerMinute",
  "avgDmg",
  "maxDmg",
  "minDmg",
];
export const DEFAULT_HEAL_PLAYER_COLUMN_ORDER = [
  "totalDmg",
  "dps",
  "effectiveTotal",
  "effectiveDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "hits",
  "hitsPerMinute",
];
export const DEFAULT_HEAL_SKILL_COLUMN_ORDER = [
  "totalDmg",
  "dps",
  "effectiveTotal",
  "effectiveDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "hits",
  "hitsPerMinute",
  "avgDmg",
  "maxDmg",
  "minDmg",
];
export const DEFAULT_TANKED_PLAYER_COLUMN_ORDER = [
  "totalDmg",
  "dps",
  "effectiveTotal",
  "effectiveDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "blockRate",
  "luckyBlockRate",
  "hits",
  "hitsPerMinute",
];
export const DEFAULT_TANKED_SKILL_COLUMN_ORDER = [
  "totalDmg",
  "dps",
  "effectiveTotal",
  "effectiveDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "blockRate",
  "luckyBlockRate",
  "hits",
  "hitsPerMinute",
  "avgDmg",
  "maxDmg",
  "minDmg",
  "property",
  "damageMode",
];
export const DEFAULT_DEATH_REPLAY_COLUMNS = {
  time: true,
  skill: true,
  source: true,
  damage: true,
  share: false,
  property: false,
  damageMode: false,
};
export const DEFAULT_DEATH_REPLAY_COLUMN_ORDER = [
  "time",
  "skill",
  "source",
  "damage",
  "share",
  "property",
  "damageMode",
];

function normalizeColumnOrder(
  order: readonly string[] | undefined,
  defaultOrder: readonly string[],
) {
  const allowedKeys = new Set(defaultOrder);
  const normalized: string[] = [];
  for (const key of order ?? []) {
    if (allowedKeys.has(key) && !normalized.includes(key)) {
      normalized.push(key);
    }
  }
  for (const key of defaultOrder) {
    if (!normalized.includes(key)) {
      normalized.push(key);
    }
  }
  return normalized;
}

export function normalizeTankedPlayerColumnOrder(
  order: readonly string[] | undefined,
) {
  return normalizeColumnOrder(order, DEFAULT_TANKED_PLAYER_COLUMN_ORDER);
}

export function normalizeDpsSkillColumnOrder(
  order: readonly string[] | undefined,
) {
  return normalizeColumnOrder(order, DEFAULT_DPS_SKILL_COLUMN_ORDER);
}

export function normalizeHealSkillColumnOrder(
  order: readonly string[] | undefined,
) {
  return normalizeColumnOrder(order, DEFAULT_HEAL_SKILL_COLUMN_ORDER);
}

export function normalizeTankedSkillColumnOrder(
  order: readonly string[] | undefined,
) {
  return normalizeColumnOrder(order, DEFAULT_TANKED_SKILL_COLUMN_ORDER);
}

export function normalizeDeathReplayColumnOrder(
  order: readonly string[] | undefined,
) {
  return normalizeColumnOrder(order, DEFAULT_DEATH_REPLAY_COLUMN_ORDER);
}

// Default sort settings for live tables
export const DEFAULT_LIVE_SORT_SETTINGS = {
  dpsPlayers: { sortKey: "totalDmg", sortDesc: true },
  dpsSkills: { sortKey: "totalDmg", sortDesc: true },
  healPlayers: { sortKey: "totalDmg", sortDesc: true },
  healSkills: { sortKey: "totalDmg", sortDesc: true },
  tankedPlayers: { sortKey: "totalDmg", sortDesc: true },
  tankedSkills: { sortKey: "totalDmg", sortDesc: true },
};

/** @deprecated Legacy hand-authored rule shape; migrated into inline bindings on startup. */
export type VoiceTriggerSetting =
  | { kind: "buffGained"; buffId: number }
  | { kind: "buffLost"; buffId: number }
  | { kind: "bossDbm"; baseSkillId: number };

/** @deprecated See `VoiceTriggerSetting`. */
export type VoiceRuleSetting = {
  id: string;
  enabled: boolean;
  trigger: VoiceTriggerSetting;
  phraseId: string;
  priority: number;
  cooldownMs: number;
};

export type VoiceQueuePolicySetting =
  | "dropLowPriority"
  | "interruptForHigherPriority";

export type VoiceGenerationBackendSetting = "auto" | "cpu" | "vulkan";
/**
 * `"preset"` auto-selects the bundled reference voice matching the app's
 * current UI locale (see `$lib/voice/generation-source.ts`) and is the
 * default so generation works right after the model is installed, without
 * the user recording or importing a reference clip first. `"http"` uses the
 * provider in `selectedHttpProviderId` and needs no local model.
 */
export type VoiceSourceSetting = "preset" | "clone" | "fineTuned" | "http";
export type VoiceModelDownloadSource = "auto" | "huggingFace" | "hfMirror";

export type VoiceSettingsConfig = {
  enabled: boolean;
  volume: number;
  queuePolicy: VoiceQueuePolicySetting;
  /** @deprecated Drained by the one-shot legacy migration in `$lib/voice/sync.svelte.ts`. */
  rules?: VoiceRuleSetting[];
  alertConfigs?: GameAlertVoiceConfigMap;
  selectedProfileId: string | null;
  selectedHttpProviderId: string | null;
  selectedSource: VoiceSourceSetting;
  generationBackend: VoiceGenerationBackendSetting;
  modelDownloadSource: VoiceModelDownloadSource;
};

export function createDefaultVoiceSettings(): VoiceSettingsConfig {
  return {
    enabled: false,
    volume: 1,
    queuePolicy: "dropLowPriority",
    alertConfigs: {},
    selectedProfileId: null,
    selectedHttpProviderId: null,
    selectedSource: "preset",
    generationBackend: "auto",
    modelDownloadSource: "auto",
  };
}

/**
 * Where a voice binding's spoken text comes from. `auto` derives a template
 * phrase from the subject's display name (see `$lib/voice/subjects/*`);
 * `custom` lets the user type their own short line; `phrase` points at an
 * existing entry in the phrase library for reuse across bindings.
 */
export type VoicePhraseBinding =
  | { source: "auto" }
  | {
      source: "custom";
      text: string;
      httpLanguage?: "zhCn" | "enUs" | "jaJp";
      generationSource?:
        | { mode: "preset"; locale: "zh-CN" | "en-US" | "ja-JP" }
        | { mode: "http"; providerId: string }
        | undefined;
    }
  | { source: "phrase"; phraseId: string };

export function createDefaultVoicePhraseBinding(): VoicePhraseBinding {
  return { source: "auto" };
}

export const MIN_VOICE_PRIORITY = 0;
export const MAX_VOICE_PRIORITY = 255;

export const VOICE_PRIORITY_TIERS = [
  { id: "default", value: undefined },
  { id: "low", value: 50 },
  { id: "medium", value: 100 },
  { id: "high", value: 150 },
  { id: "urgent", value: 200 },
] as const;

/** Converts persisted/user-provided values to the u8 range expected by Rust. */
export function resolveVoicePriority(priority: number | undefined): number {
  if (priority === undefined || !Number.isFinite(priority)) {
    return MIN_VOICE_PRIORITY;
  }
  return Math.min(
    MAX_VOICE_PRIORITY,
    Math.max(MIN_VOICE_PRIORITY, Math.round(priority)),
  );
}

/** A single trigger (e.g. "buff gained") toggled on/off with its phrase. */
export type VoiceEventConfig = {
  enabled: boolean;
  phrase: VoicePhraseBinding;
  /** 0 = lowest, 255 = highest. Missing values use the lowest priority. */
  priority?: number | undefined;
};

export const GAME_ALERT_KINDS = [
  "matchReady",
  "readyCheck",
  "teamVote",
] as const;
export type GameAlertKind = (typeof GAME_ALERT_KINDS)[number];
export type GameAlertVoiceConfigMap = Partial<
  Record<GameAlertKind, VoiceEventConfig>
>;

export function ensureGameAlertVoiceConfigs(
  configs: GameAlertVoiceConfigMap | null | undefined,
): GameAlertVoiceConfigMap {
  return { ...(configs ?? {}) };
}

/** Like `VoiceEventConfig`, but for triggers that fire ahead of an expiry. */
export type VoiceExpiringEventConfig = VoiceEventConfig & {
  secondsBefore: number;
};

export function createDefaultVoiceEventConfig(): VoiceEventConfig {
  return { enabled: false, phrase: createDefaultVoicePhraseBinding() };
}

export function createDefaultVoiceExpiringEventConfig(
  secondsBefore = 5,
): VoiceExpiringEventConfig {
  return { ...createDefaultVoiceEventConfig(), secondsBefore };
}

/** Voice bindings for a single monitored buff: gained / about to expire / lost. */
export type BuffVoiceConfig = {
  gained?: VoiceEventConfig;
  expiring?: VoiceExpiringEventConfig;
  lost?: VoiceEventConfig;
};

export type BuffVoiceConfigMap = Record<string, BuffVoiceConfig>;

export function ensureBuffVoiceConfigs(
  configs: BuffVoiceConfigMap | null | undefined,
): BuffVoiceConfigMap {
  const next: BuffVoiceConfigMap = {};
  for (const [buffId, config] of Object.entries(configs ?? {})) {
    if (config.gained || config.expiring || config.lost) {
      next[buffId] = config;
    }
  }
  return next;
}

/** Voice bindings for one slot of a counter rule. */
export type CounterSlotVoiceConfig = {
  threshold?: VoiceEventConfig;
  expiring?: VoiceExpiringEventConfig;
};

export type CounterVoiceConfigMap = Record<string, CounterSlotVoiceConfig>;
export type PresetCounterVoiceConfigMap = Record<string, CounterVoiceConfigMap>;

export function ensureCounterVoiceConfigs(
  configs: CounterVoiceConfigMap | null | undefined,
): CounterVoiceConfigMap {
  const next: CounterVoiceConfigMap = {};
  for (const [slotId, config] of Object.entries(configs ?? {})) {
    const parsedSlotId = Number(slotId);
    if (!Number.isInteger(parsedSlotId) || parsedSlotId <= 0 || !config) {
      continue;
    }
    if (config.threshold || config.expiring) {
      next[slotId] = config;
    }
  }
  return next;
}

export function ensurePresetCounterVoiceConfigs(
  configs: PresetCounterVoiceConfigMap | null | undefined,
): PresetCounterVoiceConfigMap {
  const next: PresetCounterVoiceConfigMap = {};
  for (const [ruleId, slotConfigs] of Object.entries(configs ?? {})) {
    const parsedRuleId = Number(ruleId);
    if (!Number.isInteger(parsedRuleId) || parsedRuleId <= 0) continue;
    const normalized = ensureCounterVoiceConfigs(slotConfigs);
    if (Object.keys(normalized).length > 0) {
      next[ruleId] = normalized;
    }
  }
  return next;
}

export function hasEnabledCounterVoiceConfig(
  configs: CounterVoiceConfigMap | null | undefined,
): boolean {
  return Object.values(ensureCounterVoiceConfigs(configs)).some(
    (config) => config.threshold?.enabled || config.expiring?.enabled,
  );
}

/** Voice bindings for one boss DBM mechanic: on cast / about to expire. */
export type DbmVoiceConfig = {
  onCast?: VoiceEventConfig;
  expiring?: VoiceExpiringEventConfig;
};

export type DbmVoiceConfigMap = Record<string, DbmVoiceConfig>;

/** Voice bindings for one monster-skill entry: when a nearby monster casts it. */
export type MonsterSkillVoiceConfig = {
  onCast?: VoiceEventConfig;
};

export type MonsterSkillVoiceConfigMap = Record<
  string,
  MonsterSkillVoiceConfig
>;

export function ensureMonsterSkillVoiceConfigs(
  configs: MonsterSkillVoiceConfigMap | null | undefined,
): MonsterSkillVoiceConfigMap {
  const next: MonsterSkillVoiceConfigMap = {};
  for (const [skillId, config] of Object.entries(configs ?? {})) {
    if (config?.onCast) {
      next[skillId] = config;
    }
  }
  return next;
}

export function ensureDbmVoiceConfigs(
  configs: DbmVoiceConfigMap | null | undefined,
): DbmVoiceConfigMap {
  const next: DbmVoiceConfigMap = {};
  for (const [baseSkillId, config] of Object.entries(configs ?? {})) {
    if (config.onCast || config.expiring) {
      next[baseSkillId] = config;
    }
  }
  return next;
}

/**
 * Voice bindings for one skill of the local player. The profile's skill
 * voice list is independent of the cooldown HUD list (`monitoredSkillIds`).
 */
export type SkillVoiceConfig = {
  /** Fires on every cast start. */
  cast?: VoiceEventConfig;
  /** Fires when the cooldown ends (every charge back for charge skills). */
  ready?: VoiceEventConfig;
  /** Fires `secondsBefore` the cooldown ends (or the next charge is back). */
  readyIn?: VoiceExpiringEventConfig;
};

/** Keyed by base skill id (as a string). */
export type SkillVoiceConfigMap = Record<string, SkillVoiceConfig>;

export function ensureSkillVoiceConfigs(
  configs: SkillVoiceConfigMap | null | undefined,
): SkillVoiceConfigMap {
  const next: SkillVoiceConfigMap = {};
  for (const [skillId, config] of Object.entries(configs ?? {})) {
    if (!config) continue;
    if (config.cast || config.ready || config.readyIn) {
      next[skillId] = config;
    }
  }
  return next;
}

/** Voice bindings for one entity-duration watch entry. */
export type EntityVoiceConfig = {
  appeared?: VoiceEventConfig;
  /** Only meaningful when the entry has a configured duration. */
  expiring?: VoiceExpiringEventConfig;
  gone?: VoiceEventConfig;
};

/**
 * Keyed by the watch entry's monster id (`entityVoiceConfigKey`): entries
 * are unique per monster id, so the binding follows its entry when the
 * entry's scope changes. Settings written before that used
 * `"{monsterId}:{scope}"`; voice pruning re-keys those on the next write.
 */
export type EntityVoiceConfigMap = Record<string, EntityVoiceConfig>;

export function entityVoiceConfigKey(monsterId: number): string {
  return String(monsterId);
}

/**
 * Parses a canonical (`"179901"`) or pre-rekey (`"179901:self"`) key; the
 * latter carries the scope it was written for.
 */
export function parseEntityVoiceConfigKey(
  key: string,
): { monsterId: number; scope?: EntityDurationScope } | null {
  const match = /^(\d+)(?::(self|any))?$/.exec(key);
  if (!match) return null;
  const monsterId = Number(match[1]);
  if (!Number.isSafeInteger(monsterId) || monsterId <= 0) return null;
  return match[2]
    ? { monsterId, scope: match[2] as EntityDurationScope }
    : { monsterId };
}

export function ensureEntityVoiceConfigs(
  configs: EntityVoiceConfigMap | null | undefined,
): EntityVoiceConfigMap {
  const next: EntityVoiceConfigMap = {};
  for (const [key, config] of Object.entries(configs ?? {})) {
    if (!config || !parseEntityVoiceConfigKey(key)) continue;
    if (config.appeared || config.expiring || config.gone) {
      next[key] = config;
    }
  }
  return next;
}

export type ShortcutSettingId = keyof typeof DEFAULT_SETTINGS.shortcuts;

export type Point = {
  x: number;
  y: number;
};

export type MinimapPanelRect = Point & {
  width: number;
  scale: number;
};

export type MinimapEntityColors = {
  local: string;
  teammate: string;
  boss: string;
};

export type MinimapLocalRing = {
  enabled: boolean;
  color: string;
  width: number;
};

export type MinimapLocalFacing = {
  enabled: boolean;
};

export type MinimapEntitySizes = {
  local: number;
  teammate: number;
  boss: number;
  other: number;
};

export type MinimapInfoPanelStyle = {
  backgroundOpacity: number;
};

/**
 * How dead team members (local player + teammates) render on the minimap.
 * Overrides mechanic coloring entirely while a team member is dead.
 */
export type MinimapDeadStyle = {
  shape: "default" | "x";
  color: string;
  opacity: number;
};

export type MinimapConfig = {
  /**
   * Whether the user wants the dungeon-mechanic overlay at all. Matches the
   * `enabled` switch the skill/monster monitors already have, so all three HUD
   * domains are controlled the same way.
   */
  enabled: boolean;
  autoHideInDailyScenes: boolean;
  hideNormalTeammates: boolean;
  hideAllTeammates: boolean;
  showBoss: boolean;
  showMarkers: boolean;
  showTeamMarks: boolean;
  showMapPanel: boolean;
  showInfoPanel: boolean;
  mapPanel: MinimapPanelRect;
  infoPanel: MinimapPanelRect;
  entityColors: MinimapEntityColors;
  entitySizes: MinimapEntitySizes;
  markerColors: MinimapMarkerColors;
  localRing: MinimapLocalRing;
  localFacing: MinimapLocalFacing;
  infoPanelStyle: MinimapInfoPanelStyle;
  deadStyle: MinimapDeadStyle;
  /**
   * Voice bindings for scene-specific mechanic cues (see
   * `SceneDefinition.voiceCues` in the minimap overlay), keyed by cue id.
   * Each cue has a single on-trigger event, unlike buffs/DBM which also
   * support expiring/lost.
   */
  mechanicVoiceConfigs?: MechanicVoiceConfigMap;
};

export type MechanicVoiceConfigMap = Record<string, VoiceEventConfig>;

export function ensureMechanicVoiceConfigs(
  configs: MechanicVoiceConfigMap | null | undefined,
): MechanicVoiceConfigMap {
  const next: MechanicVoiceConfigMap = {};
  for (const [cueId, config] of Object.entries(configs ?? {})) {
    if (config) next[cueId] = config;
  }
  return next;
}

export type PanelAttrConfig = {
  attrId: number;
  label: string;
  color: string;
  enabled: boolean;
  format: "percent" | "integer";
};

export const AVAILABLE_PANEL_ATTRS: PanelAttrConfig[] = [
  {
    attrId: 11720,
    label: "攻速",
    color: "#6ee7ff",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11710,
    label: "暴击率",
    color: "#ff7a7a",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11930,
    label: "急速",
    color: "#facc15",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11780,
    label: "幸运",
    color: "#a78bfa",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11940,
    label: "精通",
    color: "#60a5fa",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11950,
    label: "全能",
    color: "#34d399",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11760,
    label: "冷却缩减",
    color: "#f97316",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11960,
    label: "冷却加速",
    color: "#38bdf8",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11010,
    label: "力量",
    color: "#f87171",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11020,
    label: "智力",
    color: "#818cf8",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11030,
    label: "敏捷",
    color: "#4ade80",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11330,
    label: "物理攻击",
    color: "#fb923c",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11340,
    label: "魔法攻击",
    color: "#c084fc",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11730,
    label: "施法速度",
    color: "#22d3ee",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 12510,
    label: "暴击伤害",
    color: "#f472b6",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 12530,
    label: "幸运伤害倍率",
    color: "#d8b4fe",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 12540,
    label: "格挡伤害减免",
    color: "#86efac",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11810,
    label: "护盾强度",
    color: "#7dd3fc",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11970,
    label: "格挡",
    color: "#fbbf24",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 11350,
    label: "物理防御",
    color: "#fdba74",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11500,
    label: "全元素攻击",
    color: "#e2e8f0",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11510,
    label: "火元素攻击",
    color: "#ef4444",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11520,
    label: "冰元素攻击",
    color: "#38bdf8",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11530,
    label: "森元素攻击",
    color: "#22c55e",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11540,
    label: "雷元素攻击",
    color: "#a855f7",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11550,
    label: "风元素攻击",
    color: "#06b6d4",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11560,
    label: "岩元素攻击",
    color: "#d97706",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11570,
    label: "光元素攻击",
    color: "#fbbf24",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 11580,
    label: "暗元素攻击",
    color: "#6366f1",
    enabled: false,
    format: "integer",
  },
  {
    attrId: 13100,
    label: "全元素加成",
    color: "#e2e8f0",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13110,
    label: "火元素加成",
    color: "#ef4444",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13120,
    label: "冰元素加成",
    color: "#38bdf8",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13130,
    label: "森元素加成",
    color: "#22c55e",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13140,
    label: "雷元素加成",
    color: "#a855f7",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13150,
    label: "风元素加成",
    color: "#06b6d4",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13160,
    label: "岩元素加成",
    color: "#d97706",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13170,
    label: "光元素加成",
    color: "#fbbf24",
    enabled: false,
    format: "percent",
  },
  {
    attrId: 13180,
    label: "暗元素加成",
    color: "#6366f1",
    enabled: false,
    format: "percent",
  },
];

export type OverlayPositions = {
  /** @deprecated Placement of the single-grid skill CD HUD, kept as the
   * fallback for region 1 and for older builds importing new exports. */
  skillCdGroup: Point;
  resourceGroup: Point;
  textBuffPanel: Point;
  specialBuffGroup: Point;
  panelAttrGroup: Point;
  customPanelGroup: Point;
  shieldDetailGroup: Point;
  buffCoverageGroup: Point;
  iconBuffPositions: Record<number, Point>;
  categoryIconPositions?: Partial<Record<BuffCategoryKey, Point>>;
};

export type OverlaySizes = {
  /** @deprecated See `OverlayPositions.skillCdGroup`. */
  skillCdGroupScale: number;
  resourceGroupScale: number;
  textBuffPanelScale: number;
  panelAttrGroupScale: number;
  customPanelGroupScale: number;
  shieldDetailGroupScale: number;
  buffCoverageGroupScale: number;
  panelAttrGap: number;
  panelAttrFontSize: number;
  panelAttrColumnGap: number;
  panelAttrTextStyle: OverlayTextStyle;
  iconBuffSizes: Record<number, number>;
  categoryIconSizes?: Partial<Record<BuffCategoryKey, number>>;
};

export type OverlayVisibility = {
  showSkillCdGroup: boolean;
  showResourceGroup: boolean;
  showPanelAttrGroup: boolean;
  showCustomPanelGroup: boolean;
  showShieldDetailGroup: boolean;
  showBuffCoverageGroup: boolean;
};

export type OverlayTextStyle = {
  textShadowEnabled: boolean;
  backgroundEnabled: boolean;
  backgroundOpacity: number;
};

export type CustomPanelStyle = {
  gap: number;
  columnGap: number;
  fontSize: number;
  nameColor: string;
  valueColor: string;
  progressColor: string;
  progressOpacity: number;
} & OverlayTextStyle;

export type TeammateBuffColumnKey =
  | `buff:${number}`
  | `category:${BuffCategoryKey}`;

/** Per-column overrides of the matrix colors; unset keeps the panel color. */
export type TeammateBuffColumnStyle = {
  progressColor?: string;
  valueColor?: string;
};

export type TeammateBuffColumnStyleMap = Partial<
  Record<TeammateBuffColumnKey, TeammateBuffColumnStyle>
>;

/** Where dead teammates' rows go relative to the living ones. */
export const TEAMMATE_DEAD_ROW_PLACEMENTS = ["last", "first", "keep"] as const;

export type TeammateDeadRowPlacement =
  (typeof TEAMMATE_DEAD_ROW_PLACEMENTS)[number];

export type TeammatePanelStyle = CustomPanelStyle & {
  rowHeight: number;
  nameColumnWidth: number;
  buffColumnWidth: number;
  deadNameColor: string;
  deadRowPlacement: TeammateDeadRowPlacement;
  /** Show countdowns at 0.1s precision instead of whole seconds. */
  preciseTimer: boolean;
};

export const TEAMMATE_CD_DISPLAY_MODES = ["slots", "list"] as const;

/**
 * `slots` draws each teammate's icons beside their row of the in-game team
 * panel; `list` is a standalone panel of name rows.
 */
export type TeammateCdDisplayMode = (typeof TEAMMATE_CD_DISPLAY_MODES)[number];

export const TEAMMATE_CD_SLOT_SIDES = ["left", "right"] as const;

/** Which way a row's icons extend from its anchor. */
export type TeammateCdSlotSide = (typeof TEAMMATE_CD_SLOT_SIDES)[number];

export const TEAMMATE_CD_SLOT_KINDS = ["five", "twenty"] as const;

/** The game draws five- and twenty-member teams with different panels. */
export type TeammateCdSlotKind = (typeof TEAMMATE_CD_SLOT_KINDS)[number];

/**
 * Slot grid of the five-member team panel, in HUD pixels. Its first row sits
 * at `overlayPositions.teammateCdSlotsFive`.
 */
export type TeammateCdFiveSlots = {
  rowPitch: number;
  side: TeammateCdSlotSide;
};

/**
 * Slot grid of the twenty-member team panel: groups 1/3 form the left
 * column, 2/4 the right one, and 3/4 sit below 1/2. Group 1's first row sits
 * at `overlayPositions.teammateCdSlotsTwenty`.
 */
export type TeammateCdTwentySlots = {
  rowPitch: number;
  /** From the left column's anchor to the right column's. */
  columnOffset: number;
  /** From group 1's first row to group 3's. */
  blockOffset: number;
  leftSide: TeammateCdSlotSide;
  rightSide: TeammateCdSlotSide;
};

export type TeammateCdSlotLayout = {
  iconSize: number;
  iconGap: number;
  /** The grid the editor previews while not in a team. */
  previewKind: TeammateCdSlotKind;
  five: TeammateCdFiveSlots;
  twenty: TeammateCdTwentySlots;
};

/** Teammate skill-cooldown panel (team sharing). */
export type TeammateCdPanelStyle = {
  displayMode: TeammateCdDisplayMode;
  slots: TeammateCdSlotLayout;
  iconSize: number;
  iconGap: number;
  rowGap: number;
  /** `0` hides the name column. */
  nameColumnWidth: number;
  fontSize: number;
  nameColor: string;
  deadNameColor: string;
  deadRowPlacement: TeammateDeadRowPlacement;
  showClassIcon: boolean;
} & OverlayTextStyle;

/**
 * Base skill ids shown per teammate class, keyed by `classKey` from
 * `class_skill_configs.json`, in display order.
 */
export type TeammateCdSkillMap = Partial<Record<string, number[]>>;

export type ShieldDetailStyle = {
  fontSize: number;
  barWidth: number;
  gap: number;
  showHpBar: boolean;
  showTotalShieldBar: boolean;
  showShieldEntries: boolean;
  hpColor: string;
  shieldColor: string;
  healShieldColor: string;
} & OverlayTextStyle;

export type MonsterOverlayPositions = {
  monsterBuffPanel: Point;
  teammateBuffPanel: Point;
  teammateCdPanel: Point;
  /**
   * First row of the teammate CD grid beside the in-game team panel, at the
   * icon edge facing it; one per panel the game draws.
   */
  teammateCdSlotsFive: Point;
  teammateCdSlotsTwenty: Point;
  hatePanel: Point;
  fantasyPanel: Point;
  bossDbmPanel: Point;
  stunPanel: Point;
  hpPanel: Point;
  entityDurationPanel: Point;
  monsterSkillPanel: Point;
};

export type MonsterOverlaySizes = {
  monsterBuffPanelScale: number;
  teammateBuffPanelScale: number;
  teammateCdPanelScale: number;
  hatePanelScale: number;
  fantasyPanelScale: number;
  bossDbmPanelScale: number;
  stunPanelScale: number;
  hpPanelScale: number;
  entityDurationPanelScale: number;
  monsterSkillPanelScale: number;
};

export type MonsterOverlayVisibility = {
  showMonsterBuffPanel: boolean;
  showTeammateBuffPanel: boolean;
  showTeammateCdPanel: boolean;
  showHatePanel: boolean;
  showFantasyPanel: boolean;
  showBossDbmPanel: boolean;
  showStunPanel: boolean;
  showHpPanel: boolean;
  showEntityDurationPanel: boolean;
  showMonsterSkillPanel: boolean;
};

export type BuffAlertRule = {
  thresholdSeconds: number;
  highlightColor: string;
  flash: boolean;
  flashIntervalMs?: number;
  applyToProgress?: boolean;
};

export type BuffAlertMap = Record<string, BuffAlertRule>;

/** Who must have summoned a watched entity for it to be displayed. */
export type EntityDurationScope = "self" | "any";

/**
 * One monster-monitor "entity duration" watch: when an entity with
 * `monsterId` appears nearby, a countdown of `durationMs` starts; the row
 * disappears when the entity does. No `durationMs` shows an open-ended row.
 * `merge` folds each caster's entities with the id into one row that counts
 * down to the soonest expiry.
 */
export type EntityDurationEntry = {
  id: string;
  monsterId: number;
  label: string;
  durationMs?: number;
  scope: EntityDurationScope;
  merge?: boolean;
  presetKey?: string;
};

/**
 * One monster-monitor "monster skill" watch: when any nearby monster casts
 * `skillId`, a row shows its name for `displayMs`; a recast restarts it.
 * An empty `label` falls back to the game's skill name.
 */
export type MonsterSkillWatchEntry = {
  skillId: number;
  label: string;
  displayMs: number;
};

export type MonsterMonitorConfig = {
  enabled: boolean;
  autoHideInDailyScenes: boolean;
  hateListMaxDisplay: number;
  monitoredBuffIds: number[];
  selfAppliedBuffIds: number[];
  selfAppliedMonitorAll: boolean;
  teammateBuffIds: number[];
  teammateBuffCategories?: BuffCategoryKey[];
  teammateBuffColumnOrder?: TeammateBuffColumnKey[];
  /** Pruned to the configured columns whenever a column is removed. */
  teammateBuffColumnStyles?: TeammateBuffColumnStyleMap;
  fantasyWhitelistMonsterIds: number[];
  fantasyMonsterAliases: Record<string, string>;
  dbmAliases: Record<string, string>;
  /** Keyed by boss DBM base skill id (as a string). */
  dbmVoiceConfigs?: DbmVoiceConfigMap;
  /**
   * Voice bindings for the current attack target's buffs, keyed by buff
   * base id (as a string). Same shape as the skill-monitor profile's
   * `buffVoiceConfigs` (gained/expiring/lost); reuses `BuffVoiceConfigMap`
   * since the two are otherwise unrelated settings scopes.
   */
  monsterBuffVoiceConfigs?: BuffVoiceConfigMap;
  /** Voice bindings for entity-duration entries, keyed `"{monsterId}:{scope}"`. */
  entityVoiceConfigs?: EntityVoiceConfigMap;
  /** Voice bindings for monster-skill entries, keyed by skill id (as a string). */
  monsterSkillVoiceConfigs?: MonsterSkillVoiceConfigMap;
  fantasyShowAll: boolean;
  buffPriorityIds: number[];
  buffAliases: BuffAliasMap;
  buffAlerts: BuffAlertMap;
  overlayPositions: MonsterOverlayPositions;
  overlaySizes: MonsterOverlaySizes;
  overlayVisibility: MonsterOverlayVisibility;
  panelStyle: CustomPanelStyle;
  teammatePanelStyle: TeammatePanelStyle;
  teammateCdSkills: TeammateCdSkillMap;
  teammateCdPanelStyle: TeammateCdPanelStyle;
  hatePanelStyle: CustomPanelStyle;
  fantasyPanelStyle: CustomPanelStyle;
  bossDbmPanelStyle: CustomPanelStyle;
  stunPanelStyle: CustomPanelStyle;
  hpPanelStyle: CustomPanelStyle;
  entityDurationEntries: EntityDurationEntry[];
  entityDurationPanelStyle: CustomPanelStyle;
  monsterSkillMonitorAll: boolean;
  monsterSkillEntries: MonsterSkillWatchEntry[];
  monsterSkillPanelStyle: CustomPanelStyle;
};

export type TextBuffPanelDisplayMode = "modern" | "classic";

export type TextBuffPanelStyle = {
  displayMode: TextBuffPanelDisplayMode;
  gap: number;
  columnGap: number;
  fontSize: number;
  nameColor: string;
  valueColor: string;
  progressColor: string;
  progressOpacity: number;
} & OverlayTextStyle;

export type BuffDisplayMode = "individual" | "grouped";

export type BuffAliasMap = ConfigBuffAliasMap;

/** How a custom-panel buff entry renders: `timer` counts down while the buff
 * is active; `active` always shows the row with the active state only. */
export type InlineBuffFormat = "timer" | "active";

export type InlineBuffEntry = {
  id: string;
  sourceType: "buff" | "counter";
  sourceId: number;
  counterSlotId?: number;
  hideWhenZero?: boolean;
  label: string;
  format: InlineBuffFormat;
};

/** One watched buff in the coverage monitor. `showInLive: false` entries are
 * still recorded to history but hidden from the live HUD (buffs that only
 * ever appear on teammates would otherwise sit at a permanent 0%). */
export type BuffCoverageEntry = {
  id: string;
  buffId: number;
  label: string;
  showInLive: boolean;
};

export const MAX_BUFF_COVERAGE_ENTRIES = 32;

export type BuffCoverageStyle = {
  fontSize: number;
  gap: number;
  nameColor: string;
  valueColor: string;
  progressColor: string;
  progressOpacity: number;
  showName: boolean;
  showRemaining: boolean;
  showCount: boolean;
  showStateDot: boolean;
  showProgress: boolean;
} & OverlayTextStyle;

/** A counter rule built in the counter editor: the same `sources` +
 * `effectSlots` shape as a preset in `config/counter_rules.json`. */
export type UserCounterRule = {
  ruleId: number;
  name: string;
  sources: CounterSource[];
  effectSlots: CounterEffectSlotPreset[];
  /** Keyed by slot id (as a string). */
  voice?: CounterVoiceConfigMap;
};

export type PanelAreaRowRef = { type: "attr"; attrId: number };

export type CustomPanelGroupKind = "manual" | "seasonCultivateFactor";

export type CustomPanelGroup = {
  id: string;
  name: string;
  kind: CustomPanelGroupKind;
  entries: InlineBuffEntry[];
  hideZeroCounters?: boolean;
  position: Point;
  scale: number;
  style: CustomPanelStyle;
};

export type ResourceSectionLayout = {
  position: Point;
  scale: number;
  visible: boolean;
};

export type BuffGroup = {
  id: string;
  name: string;
  buffIds: number[];
  priorityBuffIds: number[];
  monitorAll: boolean;
  position: Point;
  iconSize: number;
  columns: number;
  rows: number;
  gap: number;
  showName: boolean;
  showTime: boolean;
  showLayer: boolean;
};

export type SkillMonitorProfile = {
  id: string;
  name: string;
  enabled: boolean;
  autoHideInDailyScenes: boolean;
  selectedClass: string;
  /** Every monitored skill sits in exactly one of `skillCdRegions`. */
  monitoredSkillIds: number[];
  skillCdRegions?: SkillCdRegion[];
  /** @deprecated Single-grid layout; normalization turns it into region 1. */
  skillCdLayout?: SkillCdLayout;
  monitoredBuffIds: number[];
  monitoredBuffCategories?: BuffCategoryKey[];
  monitoredPanelAttrs: PanelAttrConfig[];
  buffPriorityIds: number[];
  buffAlerts?: BuffAlertMap;
  /** Keyed by buff base id (as a string). */
  buffVoiceConfigs?: BuffVoiceConfigMap;
  /** Keyed by base skill id (as a string); cast / ready / ready-in bindings. */
  skillVoiceConfigs?: SkillVoiceConfigMap;
  /** Voice overrides for immutable counter presets, keyed by rule id. */
  presetCounterVoiceConfigs?: PresetCounterVoiceConfigMap;
  buffDisplayMode: BuffDisplayMode;
  buffGroups: BuffGroup[];
  individualMonitorAllGroup?: BuffGroup | null;
  userCounterRules?: UserCounterRule[];
  customPanelGroups?: CustomPanelGroup[];
  /** Per-resource-section layout overrides keyed by resource section key
   * (see `getResourceSectionKey`). Missing keys fall back to the legacy
   * `resourceGroup` position/scale. */
  resourceSectionLayouts?: Record<string, ResourceSectionLayout>;
  factorSlotLabels?: Record<string, string>;
  inlineBuffEntries?: InlineBuffEntry[];
  buffCoverageEntries?: BuffCoverageEntry[];
  buffCoverageStyle?: BuffCoverageStyle;
  panelAreaRowOrder?: PanelAreaRowRef[];
  /** @deprecated Legacy shared style, kept only for migrating old custom panel groups. */
  customPanelStyle?: CustomPanelStyle;
  textBuffPanelStyle?: TextBuffPanelStyle;
  shieldDetailStyle?: ShieldDetailStyle;
  /** Shared text style applied to overlay groups without a dedicated style
   * config (skill Cd, resource, panel attr, buff icon/duration groups). */
  overlayTextStyle?: OverlayTextStyle;
  textBuffMaxVisible: number;
  overlayPositions: OverlayPositions;
  overlaySizes: OverlaySizes;
  overlayVisibility: OverlayVisibility;
};

export function ensureBuffAliases(
  buffAliases: BuffAliasMap | null | undefined,
): BuffAliasMap {
  const next: BuffAliasMap = {};
  for (const [baseId, alias] of Object.entries(buffAliases ?? {})) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    next[baseId] = trimmed;
  }
  return next;
}

export function ensureDbmAliases(
  dbmAliases: Record<string, string> | null | undefined,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [id, alias] of Object.entries(dbmAliases ?? {})) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    next[id] = trimmed;
  }
  return next;
}

export function getGlobalBuffAliases(): BuffAliasMap {
  return {
    ...buffCompositeAliases(SETTINGS.skillMonitor.state.buffComposites ?? []),
    ...ensureBuffAliases(SETTINGS.monsterMonitor.state.buffAliases),
    ...ensureBuffAliases(SETTINGS.skillMonitor.state.buffAliases),
  };
}

/** Skill-monitor display names: user aliases over composite names. */
export function getSkillBuffDisplayAliases(): BuffAliasMap {
  return {
    ...buffCompositeAliases(SETTINGS.skillMonitor.state.buffComposites ?? []),
    ...ensureBuffAliases(SETTINGS.skillMonitor.state.buffAliases),
  };
}

/**
 * Generates a stable, unique id for a profile/loadout record. Prefixed so
 * ids are easy to recognize when inspecting persisted JSON.
 */
export function generateProfileId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Deep-clones JSON-compatible settings data. Used when copying profile data
 * between the live "mirror" fields and profile slots (or when duplicating /
 * importing profiles) so the two sides never alias the same nested
 * arrays/objects. Works on $state proxies too, since `JSON.stringify` only
 * performs ordinary property reads.
 */
export function deepCloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function omitProfileId<T extends { id: string }>(
  value: T,
): Omit<T, "id"> {
  const { id, ...rest } = value;
  void id;
  return rest;
}

export function createDefaultBuffAlertRule(): BuffAlertRule {
  return {
    thresholdSeconds: 5,
    highlightColor: "#ef4444",
    flash: true,
    flashIntervalMs: 600,
    applyToProgress: true,
  };
}

export const MIN_BUFF_ALERT_THRESHOLD_SECONDS = 0.1;
export const MAX_BUFF_ALERT_THRESHOLD_SECONDS = 60;

/** Clamps to the supported range and rounds to the overlay clock's 0.1 s. */
export function normalizeBuffAlertThresholdSeconds(seconds: number): number {
  const clamped = Math.max(
    MIN_BUFF_ALERT_THRESHOLD_SECONDS,
    Math.min(MAX_BUFF_ALERT_THRESHOLD_SECONDS, seconds),
  );
  return Math.round(clamped * 10) / 10;
}

/** Parses typed threshold text; blank or non-numeric input is `undefined`. */
export function parseBuffAlertThresholdInput(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds)
    ? normalizeBuffAlertThresholdSeconds(seconds)
    : undefined;
}

export function ensureBuffAlerts(
  buffAlerts: BuffAlertMap | null | undefined,
): BuffAlertMap {
  const next: BuffAlertMap = {};
  for (const [baseId, rule] of Object.entries(buffAlerts ?? {})) {
    if (!rule || typeof rule !== "object") continue;
    const numericBaseId = Number(baseId);
    if (!Number.isFinite(numericBaseId)) continue;

    const thresholdSeconds = Number(rule.thresholdSeconds);
    const flashIntervalMs = Number(rule.flashIntervalMs);
    next[String(numericBaseId)] = {
      thresholdSeconds: Number.isFinite(thresholdSeconds)
        ? normalizeBuffAlertThresholdSeconds(thresholdSeconds)
        : 5,
      highlightColor: rule.highlightColor || "#ef4444",
      flash: Boolean(rule.flash),
      flashIntervalMs: Number.isFinite(flashIntervalMs)
        ? Math.max(100, flashIntervalMs)
        : 600,
      applyToProgress: rule.applyToProgress ?? true,
    };
  }
  return next;
}

function createDefaultOverlayPositions(): OverlayPositions {
  return {
    skillCdGroup: { x: 40, y: 40 },
    resourceGroup: { x: 40, y: 170 },
    textBuffPanel: { x: 360, y: 40 },
    specialBuffGroup: { x: 360, y: 220 },
    panelAttrGroup: { x: 700, y: 40 },
    customPanelGroup: { x: 700, y: 280 },
    shieldDetailGroup: { x: 40, y: 550 },
    buffCoverageGroup: { x: 360, y: 550 },
    iconBuffPositions: {},
    categoryIconPositions: {},
  };
}

function createDefaultOverlaySizes(): OverlaySizes {
  return {
    skillCdGroupScale: 1,
    resourceGroupScale: 1,
    textBuffPanelScale: 1,
    panelAttrGroupScale: 1,
    customPanelGroupScale: 1,
    shieldDetailGroupScale: 1,
    buffCoverageGroupScale: 1,
    panelAttrGap: 4,
    panelAttrFontSize: 14,
    panelAttrColumnGap: 12,
    panelAttrTextStyle: createDefaultOverlayTextStyle(),
    iconBuffSizes: {},
    categoryIconSizes: {},
  };
}

function createDefaultOverlayVisibility(): OverlayVisibility {
  return {
    showSkillCdGroup: false,
    showResourceGroup: false,
    showPanelAttrGroup: true,
    showCustomPanelGroup: true,
    showShieldDetailGroup: false,
    showBuffCoverageGroup: false,
  };
}

export function createDefaultBuffCoverageStyle(): BuffCoverageStyle {
  return {
    fontSize: 13,
    gap: 4,
    nameColor: "#e5e7eb",
    valueColor: "#6ee7b7",
    progressColor: "#34d399",
    progressOpacity: 0.4,
    showName: true,
    showRemaining: true,
    showCount: true,
    showStateDot: true,
    showProgress: true,
    ...createDefaultOverlayTextStyle(),
  };
}

export function createDefaultOverlayTextStyle(): OverlayTextStyle {
  return {
    textShadowEnabled: true,
    backgroundEnabled: false,
    backgroundOpacity: 0.76,
  };
}

export function ensureOverlayTextStyle(
  style: Partial<OverlayTextStyle> | null | undefined,
): OverlayTextStyle {
  const base = createDefaultOverlayTextStyle();
  return {
    textShadowEnabled: style?.textShadowEnabled ?? base.textShadowEnabled,
    backgroundEnabled: style?.backgroundEnabled ?? base.backgroundEnabled,
    backgroundOpacity: Math.max(
      0,
      Math.min(1, Number(style?.backgroundOpacity ?? base.backgroundOpacity)),
    ),
  };
}

export function createDefaultCustomPanelStyle(): CustomPanelStyle {
  return {
    gap: 6,
    columnGap: 12,
    fontSize: 14,
    nameColor: "#ffffff",
    valueColor: "#ffffff",
    progressColor: "#ffffff",
    progressOpacity: 0.4,
    ...createDefaultOverlayTextStyle(),
  };
}

export function createDefaultBossDbmStyle(): CustomPanelStyle {
  return {
    ...createDefaultCustomPanelStyle(),
    columnGap: 8,
    fontSize: 13,
    progressColor: "#f59e0b",
    progressOpacity: 0.38,
  };
}

export function createDefaultEntityDurationPanelStyle(): CustomPanelStyle {
  return {
    ...createDefaultCustomPanelStyle(),
    columnGap: 8,
    fontSize: 13,
  };
}

export function createDefaultMonsterSkillPanelStyle(): CustomPanelStyle {
  return {
    ...createDefaultCustomPanelStyle(),
    columnGap: 8,
    fontSize: 13,
  };
}

export function createDefaultStunPanelStyle(): CustomPanelStyle {
  return {
    ...createDefaultCustomPanelStyle(),
    columnGap: 8,
    fontSize: 13,
    progressColor: "#60a5fa",
    progressOpacity: 0.45,
  };
}

export function createDefaultHpPanelStyle(): CustomPanelStyle {
  return {
    ...createDefaultCustomPanelStyle(),
    columnGap: 8,
    fontSize: 13,
    progressColor: "#ef4444",
    progressOpacity: 0.45,
  };
}

function createDefaultMonsterOverlayPositions(): MonsterOverlayPositions {
  return {
    monsterBuffPanel: { x: 40, y: 40 },
    teammateBuffPanel: { x: 420, y: 40 },
    teammateCdPanel: { x: 420, y: 180 },
    teammateCdSlotsFive: { x: 240, y: 320 },
    teammateCdSlotsTwenty: { x: 240, y: 160 },
    hatePanel: { x: 40, y: 300 },
    fantasyPanel: { x: 420, y: 300 },
    bossDbmPanel: { x: 800, y: 40 },
    stunPanel: { x: 40, y: 460 },
    hpPanel: { x: 40, y: 560 },
    entityDurationPanel: { x: 800, y: 300 },
    monsterSkillPanel: { x: 800, y: 460 },
  };
}

function createDefaultMonsterOverlaySizes(): MonsterOverlaySizes {
  return {
    monsterBuffPanelScale: 1,
    teammateBuffPanelScale: 1,
    teammateCdPanelScale: 1,
    hatePanelScale: 1,
    fantasyPanelScale: 1,
    bossDbmPanelScale: 1,
    stunPanelScale: 1,
    hpPanelScale: 1,
    entityDurationPanelScale: 1,
    monsterSkillPanelScale: 1,
  };
}

function createDefaultMonsterOverlayVisibility(): MonsterOverlayVisibility {
  return {
    showMonsterBuffPanel: true,
    showTeammateBuffPanel: true,
    showTeammateCdPanel: false,
    showHatePanel: false,
    showFantasyPanel: false,
    showBossDbmPanel: false,
    showStunPanel: false,
    showHpPanel: false,
    showEntityDurationPanel: false,
    showMonsterSkillPanel: false,
  };
}

export function createDefaultTeammateCdSlotLayout(): TeammateCdSlotLayout {
  return {
    iconSize: 28,
    iconGap: 2,
    previewKind: "five",
    five: { rowPitch: 44, side: "left" },
    twenty: {
      rowPitch: 36,
      columnOffset: 340,
      blockOffset: 200,
      leftSide: "left",
      rightSide: "right",
    },
  };
}

export function createDefaultTeammateCdPanelStyle(): TeammateCdPanelStyle {
  return {
    displayMode: "slots",
    slots: createDefaultTeammateCdSlotLayout(),
    iconSize: 36,
    iconGap: 4,
    rowGap: 4,
    nameColumnWidth: 96,
    fontSize: 13,
    nameColor: "#ffffff",
    deadNameColor: "#ef4444",
    deadRowPlacement: "last",
    showClassIcon: true,
    ...createDefaultOverlayTextStyle(),
  };
}

function clampRounded(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  return Math.max(
    min,
    Math.min(max, Math.round(Number.isFinite(numeric) ? numeric : fallback)),
  );
}

/** Inclusive `[min, max]` of each numeric slot-layout field, in pixels. */
export const TEAMMATE_CD_SLOT_LIMITS = {
  iconSize: [12, 72],
  iconGap: [0, 24],
  rowPitch: [10, 200],
  columnOffset: [0, 4000],
  blockOffset: [0, 2000],
} as const satisfies Record<string, readonly [number, number]>;

function clampSlotField(
  key: keyof typeof TEAMMATE_CD_SLOT_LIMITS,
  value: unknown,
  fallback: number,
): number {
  const [min, max] = TEAMMATE_CD_SLOT_LIMITS[key];
  return clampRounded(value, fallback, min, max);
}

function ensureSlotSide(
  value: unknown,
  fallback: TeammateCdSlotSide,
): TeammateCdSlotSide {
  return (TEAMMATE_CD_SLOT_SIDES as readonly unknown[]).includes(value)
    ? (value as TeammateCdSlotSide)
    : fallback;
}

export function isTeammateCdSlotKind(
  value: unknown,
): value is TeammateCdSlotKind {
  return (TEAMMATE_CD_SLOT_KINDS as readonly unknown[]).includes(value);
}

export function ensureTeammateCdSlotLayout(
  layout:
    | (Partial<Omit<TeammateCdSlotLayout, "five" | "twenty">> & {
        five?: Partial<TeammateCdFiveSlots>;
        twenty?: Partial<TeammateCdTwentySlots>;
      })
    | null
    | undefined,
): TeammateCdSlotLayout {
  const base = createDefaultTeammateCdSlotLayout();
  const five = layout?.five;
  const twenty = layout?.twenty;
  return {
    iconSize: clampSlotField("iconSize", layout?.iconSize, base.iconSize),
    iconGap: clampSlotField("iconGap", layout?.iconGap, base.iconGap),
    previewKind: isTeammateCdSlotKind(layout?.previewKind)
      ? layout.previewKind
      : base.previewKind,
    five: {
      rowPitch: clampSlotField("rowPitch", five?.rowPitch, base.five.rowPitch),
      side: ensureSlotSide(five?.side, base.five.side),
    },
    twenty: {
      rowPitch: clampSlotField(
        "rowPitch",
        twenty?.rowPitch,
        base.twenty.rowPitch,
      ),
      columnOffset: clampSlotField(
        "columnOffset",
        twenty?.columnOffset,
        base.twenty.columnOffset,
      ),
      blockOffset: clampSlotField(
        "blockOffset",
        twenty?.blockOffset,
        base.twenty.blockOffset,
      ),
      leftSide: ensureSlotSide(twenty?.leftSide, base.twenty.leftSide),
      rightSide: ensureSlotSide(twenty?.rightSide, base.twenty.rightSide),
    },
  };
}

export function ensureTeammateCdPanelStyle(
  style:
    | (Partial<Omit<TeammateCdPanelStyle, "slots">> & {
        slots?: Parameters<typeof ensureTeammateCdSlotLayout>[0];
      })
    | null
    | undefined,
): TeammateCdPanelStyle {
  const base = createDefaultTeammateCdPanelStyle();
  const placement = style?.deadRowPlacement;
  const displayMode = style?.displayMode;
  return {
    displayMode: (TEAMMATE_CD_DISPLAY_MODES as readonly unknown[]).includes(
      displayMode,
    )
      ? (displayMode as TeammateCdDisplayMode)
      : base.displayMode,
    slots: ensureTeammateCdSlotLayout(style?.slots),
    iconSize: clampRounded(style?.iconSize, base.iconSize, 20, 72),
    iconGap: clampRounded(style?.iconGap, base.iconGap, 0, 24),
    rowGap: clampRounded(style?.rowGap, base.rowGap, 0, 24),
    nameColumnWidth: clampRounded(
      style?.nameColumnWidth,
      base.nameColumnWidth,
      0,
      240,
    ),
    fontSize: clampRounded(style?.fontSize, base.fontSize, 10, 28),
    nameColor: style?.nameColor ?? base.nameColor,
    deadNameColor: style?.deadNameColor ?? base.deadNameColor,
    deadRowPlacement: isTeammateDeadRowPlacement(placement)
      ? placement
      : base.deadRowPlacement,
    showClassIcon: style?.showClassIcon ?? base.showClassIcon,
    ...ensureOverlayTextStyle(style),
  };
}

/** Drops malformed entries and duplicate skill ids (first wins). */
export function normalizeTeammateCdSkills(
  value: TeammateCdSkillMap | null | undefined,
): TeammateCdSkillMap {
  const result: TeammateCdSkillMap = {};
  for (const [classKey, ids] of Object.entries(value ?? {})) {
    if (!Array.isArray(ids)) continue;
    const unique = [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ];
    if (unique.length > 0) result[classKey] = unique;
  }
  return result;
}

export function createDefaultTeammatePanelStyle(): TeammatePanelStyle {
  return {
    ...createDefaultCustomPanelStyle(),
    rowHeight: 22,
    nameColumnWidth: 128,
    buffColumnWidth: 72,
    deadNameColor: "#ef4444",
    deadRowPlacement: "last",
    preciseTimer: false,
  };
}

export function isTeammateDeadRowPlacement(
  value: unknown,
): value is TeammateDeadRowPlacement {
  return (TEAMMATE_DEAD_ROW_PLACEMENTS as readonly unknown[]).includes(value);
}

export function ensureTeammatePanelStyle(
  style: Partial<TeammatePanelStyle> | CustomPanelStyle | null | undefined,
): TeammatePanelStyle {
  const base = createDefaultTeammatePanelStyle();
  return {
    gap: Math.max(0, Math.min(24, Math.round(style?.gap ?? base.gap))),
    columnGap: Math.max(
      0,
      Math.min(240, Math.round(style?.columnGap ?? base.columnGap)),
    ),
    fontSize: Math.max(
      10,
      Math.min(28, Math.round(style?.fontSize ?? base.fontSize)),
    ),
    nameColor: style?.nameColor ?? base.nameColor,
    valueColor: style?.valueColor ?? base.valueColor,
    progressColor: style?.progressColor ?? base.progressColor,
    progressOpacity: Math.max(
      0,
      Math.min(1, Number(style?.progressOpacity ?? base.progressOpacity)),
    ),
    ...ensureOverlayTextStyle(style),
    rowHeight: Math.max(
      16,
      Math.min(
        48,
        Math.round(
          style && "rowHeight" in style
            ? (style.rowHeight ?? base.rowHeight)
            : base.rowHeight,
        ),
      ),
    ),
    nameColumnWidth: Math.max(
      32,
      Math.min(
        240,
        Math.round(
          style && "nameColumnWidth" in style
            ? (style.nameColumnWidth ?? base.nameColumnWidth)
            : base.nameColumnWidth,
        ),
      ),
    ),
    buffColumnWidth: Math.max(
      36,
      Math.min(
        140,
        Math.round(
          style && "buffColumnWidth" in style
            ? (style.buffColumnWidth ?? base.buffColumnWidth)
            : base.buffColumnWidth,
        ),
      ),
    ),
    deadNameColor:
      (style && "deadNameColor" in style ? style.deadNameColor : undefined) ||
      base.deadNameColor,
    deadRowPlacement:
      style &&
      "deadRowPlacement" in style &&
      isTeammateDeadRowPlacement(style.deadRowPlacement)
        ? style.deadRowPlacement
        : base.deadRowPlacement,
    preciseTimer:
      style && "preciseTimer" in style
        ? style.preciseTimer === true
        : base.preciseTimer,
  };
}

function createDefaultTextBuffPanelStyle(): TextBuffPanelStyle {
  return {
    displayMode: "modern",
    ...createDefaultCustomPanelStyle(),
  };
}

export function createDefaultBuffGroup(name = "", index = 1): BuffGroup {
  return {
    id: `group_${Date.now()}_${index}`,
    name,
    buffIds: [],
    priorityBuffIds: [],
    monitorAll: false,
    position: { x: 40 + (index - 1) * 40, y: 310 + (index - 1) * 40 },
    iconSize: 44,
    columns: 6,
    rows: 3,
    gap: 6,
    showName: true,
    showTime: true,
    showLayer: true,
  };
}

export function createDefaultCustomPanelGroup(
  name = "",
  index = 1,
  kind: CustomPanelGroupKind = "manual",
): CustomPanelGroup {
  return {
    id: `custom_panel_group_${Date.now()}_${index}`,
    name,
    kind,
    entries: [],
    hideZeroCounters: false,
    position: { x: 700 + (index - 1) * 40, y: 280 + (index - 1) * 40 },
    scale: 1,
    style: createDefaultCustomPanelStyle(),
  };
}

export function createDefaultSkillMonitorProfile(
  name = "",
  classKey = "wind_knight",
): SkillMonitorProfile {
  return {
    id: generateProfileId("skill"),
    name,
    enabled: false,
    autoHideInDailyScenes: false,
    selectedClass: classKey,
    monitoredSkillIds: [],
    skillCdRegions: [createDefaultSkillCdRegion()],
    monitoredBuffIds: [],
    monitoredBuffCategories: [],
    monitoredPanelAttrs: AVAILABLE_PANEL_ATTRS.map((item) => ({
      ...item,
      label: String(item.attrId),
    })),
    buffPriorityIds: [],
    buffAlerts: {},
    buffVoiceConfigs: {},
    skillVoiceConfigs: {},
    presetCounterVoiceConfigs: {},
    buffDisplayMode: "individual",
    buffGroups: [],
    individualMonitorAllGroup: null,
    userCounterRules: [],
    customPanelGroups: [],
    factorSlotLabels: {},
    inlineBuffEntries: [],
    buffCoverageEntries: [],
    buffCoverageStyle: createDefaultBuffCoverageStyle(),
    panelAreaRowOrder: [],
    textBuffPanelStyle: createDefaultTextBuffPanelStyle(),
    overlayTextStyle: createDefaultOverlayTextStyle(),
    textBuffMaxVisible: 10,
    overlayPositions: createDefaultOverlayPositions(),
    overlaySizes: createDefaultOverlaySizes(),
    overlayVisibility: createDefaultOverlayVisibility(),
  };
}

export function createDefaultMonsterMonitorConfig(): MonsterMonitorConfig {
  return {
    enabled: false,
    autoHideInDailyScenes: false,
    hateListMaxDisplay: 5,
    monitoredBuffIds: [],
    selfAppliedBuffIds: [],
    selfAppliedMonitorAll: false,
    teammateBuffIds: [],
    teammateBuffCategories: [],
    teammateBuffColumnOrder: [],
    teammateBuffColumnStyles: {},
    fantasyWhitelistMonsterIds: [],
    fantasyMonsterAliases: {},
    dbmAliases: {},
    dbmVoiceConfigs: {},
    monsterBuffVoiceConfigs: {},
    entityVoiceConfigs: {},
    monsterSkillVoiceConfigs: {},
    fantasyShowAll: false,
    buffPriorityIds: [],
    buffAliases: {},
    buffAlerts: {},
    overlayPositions: createDefaultMonsterOverlayPositions(),
    overlaySizes: createDefaultMonsterOverlaySizes(),
    overlayVisibility: createDefaultMonsterOverlayVisibility(),
    panelStyle: createDefaultCustomPanelStyle(),
    teammatePanelStyle: createDefaultTeammatePanelStyle(),
    teammateCdSkills: {},
    teammateCdPanelStyle: createDefaultTeammateCdPanelStyle(),
    hatePanelStyle: createDefaultCustomPanelStyle(),
    fantasyPanelStyle: createDefaultCustomPanelStyle(),
    bossDbmPanelStyle: createDefaultBossDbmStyle(),
    stunPanelStyle: createDefaultStunPanelStyle(),
    hpPanelStyle: createDefaultHpPanelStyle(),
    entityDurationEntries: [],
    entityDurationPanelStyle: createDefaultEntityDurationPanelStyle(),
    monsterSkillMonitorAll: false,
    monsterSkillEntries: [],
    monsterSkillPanelStyle: createDefaultMonsterSkillPanelStyle(),
  };
}

/**
 * The subset of `MonsterMonitorConfig` that varies per monster-monitor
 * profile. Excludes only the fields that stay global regardless of which
 * profile is active (buff aliases). The on/off switch and daily-scene
 * auto-hide are per-profile so they travel with exported loadouts.
 */
export type MonsterMonitorProfileData = Omit<
  MonsterMonitorConfig,
  "buffAliases"
>;

export type MonsterMonitorProfile = MonsterMonitorProfileData & {
  id: string;
  name: string;
};

/**
 * Persisted shape of the `monsterMonitor` store. The profile-data fields
 * (inherited from `MonsterMonitorConfig`) act as a "mirror": they always
 * hold a live working copy of whichever profile in `profiles` matches
 * `mirroredProfileId`, so every existing consumer of
 * `SETTINGS.monsterMonitor.state.<field>` keeps working unchanged. Switching
 * profiles (see `monster-monitor-profile.svelte.ts`) flushes the mirror into
 * its previous slot, then copies the newly-selected profile into the mirror.
 */
export type MonsterMonitorState = MonsterMonitorConfig & {
  /** Id of the profile currently materialized into the mirror fields above. */
  mirroredProfileId: string;
  profiles: MonsterMonitorProfile[];
};

export type SkillMonitorState = {
  buffAliases: BuffAliasMap;
  /** Player-customized buff icons (base id -> file name). Global; never
   * exported with loadouts, same as `buffAliases`. */
  buffIconOverrides: BuffIconOverrideMap;
  /** Composite buffs, referenced from profiles by their negative ids.
   * Global; never exported with loadouts, same as `buffAliases`. */
  buffComposites: BuffComposite[];
  profiles: SkillMonitorProfile[];
};

/** Field names that belong to a monster-monitor profile (mirror <-> profile sync). */
export const MONSTER_PROFILE_FIELD_KEYS = [
  "enabled",
  "autoHideInDailyScenes",
  "hateListMaxDisplay",
  "monitoredBuffIds",
  "selfAppliedBuffIds",
  "selfAppliedMonitorAll",
  "teammateBuffIds",
  "teammateBuffCategories",
  "teammateBuffColumnOrder",
  "teammateBuffColumnStyles",
  "fantasyWhitelistMonsterIds",
  "fantasyMonsterAliases",
  "dbmAliases",
  "dbmVoiceConfigs",
  "monsterBuffVoiceConfigs",
  "entityVoiceConfigs",
  "monsterSkillVoiceConfigs",
  "fantasyShowAll",
  "buffPriorityIds",
  "buffAlerts",
  "overlayPositions",
  "overlaySizes",
  "overlayVisibility",
  "panelStyle",
  "teammatePanelStyle",
  "teammateCdSkills",
  "teammateCdPanelStyle",
  "hatePanelStyle",
  "fantasyPanelStyle",
  "bossDbmPanelStyle",
  "stunPanelStyle",
  "hpPanelStyle",
  "entityDurationEntries",
  "entityDurationPanelStyle",
  "monsterSkillMonitorAll",
  "monsterSkillEntries",
  "monsterSkillPanelStyle",
] as const satisfies readonly (keyof MonsterMonitorProfileData)[];

// Compile-time exhaustiveness guard: if a field is added to
// `MonsterMonitorConfig` (and thus to `MonsterMonitorProfileData`) without
// being listed in `MONSTER_PROFILE_FIELD_KEYS` above, this stops compiling.
// Without it, a forgotten field would silently behave as a global setting.
type MissingMonsterProfileFieldKeys = Exclude<
  keyof MonsterMonitorProfileData,
  (typeof MONSTER_PROFILE_FIELD_KEYS)[number]
>;
const _monsterProfileFieldKeysExhaustive: Record<
  MissingMonsterProfileFieldKeys,
  never
> = {};
void _monsterProfileFieldKeysExhaustive;

export function createDefaultMonsterMonitorProfile(
  name = "",
): MonsterMonitorProfile {
  const { buffAliases, ...profileData } = createDefaultMonsterMonitorConfig();
  void buffAliases;
  return {
    ...profileData,
    id: generateProfileId("monster"),
    name,
  };
}

export function extractMonsterProfileData(
  state: MonsterMonitorProfileData,
): MonsterMonitorProfileData {
  const result = {} as MonsterMonitorProfileData;
  for (const key of MONSTER_PROFILE_FIELD_KEYS) {
    (result as Record<string, unknown>)[key] = state[key];
  }
  // Deep-clone so the mirror and the profile slots never share nested
  // arrays/objects (JSON-safe: settings are persisted as JSON anyway, and
  // this also unwraps any $state proxies).
  return deepCloneSettings(result);
}

export function createDefaultMonsterMonitorState(): MonsterMonitorState {
  const profile = createDefaultMonsterMonitorProfile();
  const { id, name, ...profileData } = profile;
  void id;
  void name;
  return {
    buffAliases: {},
    ...profileData,
    mirroredProfileId: profile.id,
    profiles: [profile],
  };
}

export type Loadout = {
  id: string;
  name: string;
  skillProfileId: string;
  monsterProfileId: string;
  liveProfileId: string;
  /** True only for the untouched system-created first-run placeholder. */
  starterPlaceholder: boolean;
  /**
   * Talent branch (`TalentStageTable` cfg id) this loadout is bound to. When
   * spec auto-switch is enabled, entering this spec switches to this loadout.
   * At most one loadout may hold a given cfg id; `null` means unbound.
   */
  linkedTalentStageCfgId: number | null;
};

export type LoadoutsState = {
  activeId: string;
  items: Loadout[];
  /** Whether the new-user "pick a starter preset" prompt has been shown/dismissed. */
  firstRunPromptDismissed: boolean;
  /** Automatically switch loadouts when the detected talent spec changes. */
  autoSwitchBySpec: boolean;
};

export function createDefaultLoadoutsState(): LoadoutsState {
  return {
    activeId: "",
    items: [],
    firstRunPromptDismissed: false,
    autoSwitchBySpec: true,
  };
}

export type LiveMeterColumnOrderState = {
  dpsPlayers: { order: string[] };
  dpsSkills: { order: string[] };
  healPlayers: { order: string[] };
  healSkills: { order: string[] };
  tankedPlayers: { order: string[] };
  tankedSkills: { order: string[] };
  deathReplay: { order: string[] };
};

export type LiveMeterSortingState = {
  dpsPlayers: { sortKey: string; sortDesc: boolean };
  dpsSkills: { sortKey: string; sortDesc: boolean };
  healPlayers: { sortKey: string; sortDesc: boolean };
  healSkills: { sortKey: string; sortDesc: boolean };
  tankedPlayers: { sortKey: string; sortDesc: boolean };
  tankedSkills: { sortKey: string; sortDesc: boolean };
};

/**
 * The subset of live-meter settings that varies per loadout. The live-meter
 * profile is "mirrored" onto the individual live RuneStores (see
 * `live-meter-profile.svelte.ts`) so every existing consumer of
 * `SETTINGS.live.*.state.*` keeps working unchanged; only switching loadouts
 * needs to go through the mirror module.
 */
export type LiveMeterProfileData = {
  general: typeof DEFAULT_SETTINGS.live.general;
  /** History display settings mirrored with the active DPS profile. */
  history: HistorySettings;
  /** Per-table user overrides for live/history DPS column headers. */
  columnLabels: DpsColumnLabels;
  dpsPlayers: typeof DEFAULT_SETTINGS.live.dpsPlayers;
  dpsSkillBreakdown: typeof DEFAULT_SETTINGS.live.dpsSkillBreakdown;
  healPlayers: typeof DEFAULT_SETTINGS.live.healPlayers;
  healSkillBreakdown: typeof DEFAULT_SETTINGS.live.healSkillBreakdown;
  tankedPlayers: typeof DEFAULT_SETTINGS.live.tankedPlayers;
  tankedSkillBreakdown: typeof DEFAULT_SETTINGS.live.tankedSkillBreakdown;
  deathReplay: typeof DEFAULT_SETTINGS.live.deathReplay;
  tableCustomization: typeof DEFAULT_SETTINGS.live.tableCustomization;
  headerCustomization: typeof DEFAULT_SETTINGS.live.headerCustomization;
  columnOrder: LiveMeterColumnOrderState;
  sorting: LiveMeterSortingState;
  /** Forbidden-damage ids for challenge watch — travels with the loadout. */
  challengeWatch: typeof DEFAULT_SETTINGS.challengeWatch;
  /** Live theme colors + class/spec colors — travels with the loadout. */
  appearance: LiveAppearance;
};

export type LiveMeterProfile = LiveMeterProfileData & {
  id: string;
  name: string;
};

export type LiveMeterState = {
  /** Id of the profile currently materialized into the live RuneStores. */
  mirroredProfileId: string;
  profiles: LiveMeterProfile[];
};

export function createDefaultLiveMeterProfileData(): LiveMeterProfileData {
  return {
    general: { ...DEFAULT_GENERAL_SETTINGS },
    history: createDefaultHistorySettings(),
    columnLabels: createDefaultDpsColumnLabels(),
    dpsPlayers: { ...DEFAULT_STATS },
    dpsSkillBreakdown: { ...DEFAULT_STATS },
    healPlayers: { ...DEFAULT_STATS },
    healSkillBreakdown: { ...DEFAULT_STATS },
    tankedPlayers: { ...DEFAULT_LIVE_TANKED_PLAYER_STATS },
    tankedSkillBreakdown: { ...DEFAULT_LIVE_TANKED_SKILL_STATS },
    deathReplay: { ...DEFAULT_DEATH_REPLAY_COLUMNS },
    tableCustomization: { ...DEFAULT_LIVE_TABLE_SETTINGS },
    headerCustomization: {
      windowPadding: 12,
      headerPadding: 8,
      headerLayoutMode: "classic" as HeaderLayoutMode,
      headerCustomLayout: cloneHeaderCustomLayout() as HeaderCustomLayout,
      showTimer: true,
      showActiveTimer: false,
      showSceneName: true,
      showResetButton: true,
      showPauseButton: true,
      showHistoryButton: false,
      showBossOnlyButton: true,
      showSettingsButton: true,
      showMinimizeButton: true,
      showHeaderControl: true,
      showTotalDamage: true,
      showTotalDps: true,
      showBossHealth: true,
      showNavigationTabs: true,
      showDeathTab: false,
      timerLabelFontSize: 12,
      timerFontSize: 18,
      activeTimerFontSize: 18,
      sceneNameFontSize: 14,
      resetButtonSize: 20,
      resetButtonPadding: 8,
      pauseButtonSize: 20,
      pauseButtonPadding: 8,
      headerControlSize: 20,
      headerControlPadding: 8,
      bossOnlyButtonSize: 20,
      bossOnlyButtonPadding: 8,
      settingsButtonSize: 20,
      settingsButtonPadding: 8,
      minimizeButtonSize: 20,
      minimizeButtonPadding: 8,
      historyButtonSize: 20,
      historyButtonPadding: 8,
      totalDamageLabelFontSize: 14,
      totalDamageValueFontSize: 18,
      totalDpsLabelFontSize: 14,
      totalDpsValueFontSize: 18,
      bossHealthLayout: "vertical" as "vertical" | "horizontal",
      bossHealthLabelFontSize: 14,
      bossHealthNameFontSize: 14,
      bossHealthValueFontSize: 14,
      bossHealthPercentFontSize: 14,
      navTabFontSize: 11,
      navTabPaddingX: 14,
      navTabPaddingY: 6,
    },
    columnOrder: {
      dpsPlayers: { order: [...DEFAULT_DPS_PLAYER_COLUMN_ORDER] },
      dpsSkills: { order: [...DEFAULT_DPS_SKILL_COLUMN_ORDER] },
      healPlayers: { order: [...DEFAULT_HEAL_PLAYER_COLUMN_ORDER] },
      healSkills: { order: [...DEFAULT_HEAL_SKILL_COLUMN_ORDER] },
      tankedPlayers: { order: [...DEFAULT_TANKED_PLAYER_COLUMN_ORDER] },
      tankedSkills: { order: [...DEFAULT_TANKED_SKILL_COLUMN_ORDER] },
      deathReplay: { order: [...DEFAULT_DEATH_REPLAY_COLUMN_ORDER] },
    },
    sorting: {
      dpsPlayers: { ...DEFAULT_LIVE_SORT_SETTINGS.dpsPlayers },
      dpsSkills: { ...DEFAULT_LIVE_SORT_SETTINGS.dpsSkills },
      healPlayers: { ...DEFAULT_LIVE_SORT_SETTINGS.healPlayers },
      healSkills: { ...DEFAULT_LIVE_SORT_SETTINGS.healSkills },
      tankedPlayers: { ...DEFAULT_LIVE_SORT_SETTINGS.tankedPlayers },
      tankedSkills: { ...DEFAULT_LIVE_SORT_SETTINGS.tankedSkills },
    },
    challengeWatch: { forbiddenDamageIds: [] as number[] },
    appearance: createDefaultLiveAppearance(),
  };
}

export function mergeLiveHeaderCustomization(
  header:
    | Partial<LiveMeterProfileData["headerCustomization"]>
    | null
    | undefined,
): LiveMeterProfileData["headerCustomization"] {
  const defaults = createDefaultLiveMeterProfileData().headerCustomization;
  return {
    ...defaults,
    ...header,
    headerControlSize:
      header?.headerControlSize ??
      header?.pauseButtonSize ??
      defaults.headerControlSize,
    headerControlPadding:
      header?.headerControlPadding ??
      header?.pauseButtonPadding ??
      defaults.headerControlPadding,
  };
}

export function createDefaultLiveMeterProfile(name = ""): LiveMeterProfile {
  return {
    ...createDefaultLiveMeterProfileData(),
    id: generateProfileId("live"),
    name,
  };
}

export function createDefaultLiveMeterState(): LiveMeterState {
  const profile = createDefaultLiveMeterProfile();
  return {
    mirroredProfileId: profile.id,
    profiles: [profile],
  };
}

export type MonitoringSettingsState = {
  schemaVersion: number;
  skillMonitor: SkillMonitorState;
  monsterMonitor: MonsterMonitorState;
  loadouts: LoadoutsState;
  liveMeter: LiveMeterState;
};

export function createDefaultMonitoringSettingsState(): MonitoringSettingsState {
  return {
    schemaVersion: 0,
    skillMonitor: {
      buffAliases: {},
      buffIconOverrides: {},
      buffComposites: [],
      profiles: [createDefaultSkillMonitorProfile()],
    },
    monsterMonitor: createDefaultMonsterMonitorState(),
    loadouts: createDefaultLoadoutsState(),
    liveMeter: createDefaultLiveMeterState(),
  };
}

export function createDefaultMinimapConfig(): MinimapConfig {
  return {
    enabled: true,
    autoHideInDailyScenes: false,
    hideNormalTeammates: true,
    hideAllTeammates: false,
    showBoss: false,
    showMarkers: false,
    showTeamMarks: false,
    showMapPanel: false,
    showInfoPanel: false,
    mapPanel: { x: 24, y: 24, width: 340, scale: 1 },
    infoPanel: { x: 384, y: 24, width: 300, scale: 1 },
    entityColors: {
      local: "#f8fafc",
      teammate: "#38bdf8",
      boss: "#ef4444",
    },
    entitySizes: {
      local: 4,
      teammate: 4,
      boss: 10,
      other: 10,
    },
    markerColors: { ...DEFAULT_MINIMAP_MARKER_COLORS },
    localRing: {
      enabled: true,
      color: "#ffffff",
      width: 2,
    },
    localFacing: {
      enabled: false,
    },
    infoPanelStyle: {
      backgroundOpacity: 0.76,
    },
    deadStyle: {
      shape: "default",
      color: "#ef4444",
      opacity: 0.35,
    },
    mechanicVoiceConfigs: {},
  };
}

const DEFAULT_GENERAL_SETTINGS = {
  showYourName: "Show Your Name",
  showOthersName: "Show Others' Name",
  showYourAbilityScore: true,
  showOthersAbilityScore: true,
  showYourSeasonStrength: false,
  showOthersSeasonStrength: false,
  showFantasyCastIcons: false,
  relativeToTopDPSPlayer: true,
  relativeToTopDPSSkill: true,
  relativeToTopHealPlayer: true,
  relativeToTopHealSkill: true,
  relativeToTopTankedPlayer: true,
  relativeToTopTankedSkill: true,
  shortenAbilityScore: true,
  shortenDps: true,
  shortenTps: true,
  abbreviationStyle: "western" as "western" | "cn",
  abbreviatedDecimalPlaces: 1,
  eventUpdateRateMs: 200,
  trainingWindowMs: 183_000,
  trainingLockPolicy: "eliteDummies" as "eliteDummies" | "firstMonster",
};

export function createDefaultHistorySettings() {
  return {
    general: {
      ...DEFAULT_GENERAL_SETTINGS,
      timelineLaneH: 44,
      timelineCurveH: 300,
      instantDpsWindowSec: 10,
    },
    dpsPlayers: { ...DEFAULT_HISTORY_STATS },
    dpsSkillBreakdown: { ...DEFAULT_HISTORY_STATS },
    healPlayers: { ...DEFAULT_HISTORY_HEAL_STATS },
    healSkillBreakdown: { ...DEFAULT_HISTORY_STATS },
    tankedPlayers: { ...DEFAULT_HISTORY_TANKED_STATS },
    tankedSkillBreakdown: { ...DEFAULT_HISTORY_TANKED_SKILL_STATS },
  };
}

export type HistorySettings = ReturnType<typeof createDefaultHistorySettings>;

function mergeSettingsSection<T extends object>(
  defaults: T,
  value: unknown,
): T {
  return {
    ...defaults,
    ...(typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : {}),
  };
}

export function normalizeHistorySettings(value: unknown): HistorySettings {
  const defaults = createDefaultHistorySettings();
  const source =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    general: mergeSettingsSection(defaults.general, source["general"]),
    dpsPlayers: mergeSettingsSection(defaults.dpsPlayers, source["dpsPlayers"]),
    dpsSkillBreakdown: mergeSettingsSection(
      defaults.dpsSkillBreakdown,
      source["dpsSkillBreakdown"],
    ),
    healPlayers: mergeSettingsSection(
      defaults.healPlayers,
      source["healPlayers"],
    ),
    healSkillBreakdown: mergeSettingsSection(
      defaults.healSkillBreakdown,
      source["healSkillBreakdown"],
    ),
    tankedPlayers: mergeSettingsSection(
      defaults.tankedPlayers,
      source["tankedPlayers"],
    ),
    tankedSkillBreakdown: mergeSettingsSection(
      defaults.tankedSkillBreakdown,
      source["tankedSkillBreakdown"],
    ),
  };
}

export const DEFAULT_CLASS_COLORS: Record<string, string> = {
  Stormblade: "#674598",
  "Frost Mage": "#4de3d1",
  "Flame Berserker": "#e64a19",
  "Wind Knight": "#0099c6",
  "Verdant Oracle": "#66aa00",
  "Heavy Guardian": "#b38915",
  Marksman: "#ffee00",
  "Shield Knight": "#7b9aa2",
  "Beat Performer": "#ee2e48",
};

export const CLASS_SPEC_MAP: Record<string, string> = {
  Iaido: "Stormblade",
  Moonstrike: "Stormblade",
  Icicle: "Frost Mage",
  Frostbeam: "Frost Mage",
  Voidflame: "Flame Berserker",
  Blazecrimson: "Flame Berserker",
  Vanguard: "Wind Knight",
  Skyward: "Wind Knight",
  Smite: "Verdant Oracle",
  Lifebind: "Verdant Oracle",
  Earthfort: "Heavy Guardian",
  Block: "Heavy Guardian",
  Wildpack: "Marksman",
  Falconry: "Marksman",
  Recovery: "Shield Knight",
  Shield: "Shield Knight",
  Dissonance: "Beat Performer",
  Concerto: "Beat Performer",
};

export const CLASS_SPEC_NAMES = Object.keys(CLASS_SPEC_MAP);

export const DEFAULT_CLASS_SPEC_COLORS: Record<string, string> = {
  // Stormblade
  Iaido: "#9b6cf0",
  Moonstrike: "#4a2f80",
  // Frost Mage
  Icicle: "#8ff7ee",
  Frostbeam: "#2fbfb3",
  // Flame Berserker
  Voidflame: "#ff6d3a",
  Blazecrimson: "#c41e00",
  // Wind Knight
  Vanguard: "#4ddff6",
  Skyward: "#006b8f",
  // Verdant Oracle
  Smite: "#b9f36e",
  Lifebind: "#3b6d00",
  // Heavy Guardian
  Earthfort: "#e6c25a",
  Block: "#7b5b08",
  // Marksman
  Wildpack: "#fff9a6",
  Falconry: "#cab400",
  // Shield Knight
  Recovery: "#b6d1d6",
  Shield: "#4f6b70",
  // Beat Performer
  Dissonance: "#ff7b94",
  Concerto: "#9f1322",
};

export const DEFAULT_FONT_SIZES = {
  xs: 10, // Extra small - labels, hints (default 0.625rem = 10px)
  sm: 12, // Small - secondary text (default 0.75rem = 12px)
  base: 14, // Base - default text (default 0.875rem = 14px)
  lg: 16, // Large - emphasis (default 1rem = 16px)
  xl: 20, // Extra large - titles (default 1.25rem = 20px)
};

// Live table customization defaults
export const DEFAULT_LIVE_TABLE_SETTINGS = {
  // Compact mode - shows single-line rows with only total(rate) + pct, no header
  compactMode: false,
  // Only takes effect when compactMode is on; extends compact rows to skill/monster detail pages
  compactIncludeDetails: false,
  // Which secondary value to show inside the parentheses for DPS compact view
  compactDpsKey: "dps" as "dps" | "tdps",

  // Player row settings
  playerRowHeight: 28,
  playerFontSize: 13,
  playerIconSize: 20,

  // Table header settings
  showTableHeader: true,
  tableHeaderHeight: 24,
  tableHeaderFontSize: 11,
  tableHeaderTextColor: "#a1a1aa",

  // Abbreviated numbers (K, M, %)
  abbreviatedFontSize: 10,

  // Skill row settings (separate from player rows)
  skillRowHeight: 24,
  skillFontSize: 12,
  skillIconSize: 18,

  skillShowHeader: true,
  skillHeaderHeight: 22,
  skillHeaderFontSize: 10,
  skillHeaderTextColor: "#a1a1aa",
  skillAbbreviatedFontSize: 9,

  // Skill-specific row glow / highlight customization (separate from player rows)
  skillRowGlowMode: "gradient-underline" as
    | "gradient-underline"
    | "gradient"
    | "solid",
  skillRowGlowOpacity: 0.15,
  skillRowBorderRadius: 0,
  // Row glow / highlight customization
  // modes: 'gradient-underline' (gradient + neon underline), 'gradient' (gradient only), 'solid' (solid color fill)
  rowGlowMode: "gradient-underline" as
    | "gradient-underline"
    | "gradient"
    | "solid",
  // opacity applied to the fill (0-1)
  rowGlowOpacity: 0.15,
  // border height in pixels for the neon underline effect
  rowGlowBorderHeight: 2,
  // box-shadow spread/blur for the neon border
  rowGlowSpread: 8,
  // Note: glow always uses the detected class/spec color.
  // Row border customization
  rowBorderRadius: 0,
};

// (Header preset constants removed - header defaults inlined into DEFAULT_SETTINGS)

export const FONT_SIZE_LABELS: Record<string, string> = {
  xs: "超小",
  sm: "小",
  base: "标准",
  lg: "大",
  xl: "超大",
};

// Default custom theme colors (based on dark theme)
export type CustomThemeColors = {
  backgroundMain: string;
  backgroundLive: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipFg: string;
  tableTextColor: string;
  tableAbbreviatedColor: string;
};

export const DEFAULT_CUSTOM_THEME_COLORS: CustomThemeColors = {
  backgroundMain: "rgba(33, 33, 33, 1)",
  backgroundLive: "rgba(33, 33, 33, 1)",
  foreground: "rgba(226, 226, 226, 1)",
  surface: "rgba(41, 41, 41, 1)",
  surfaceForeground: "rgba(226, 226, 226, 1)",
  primary: "rgba(166, 166, 166, 1)",
  primaryForeground: "rgba(33, 33, 33, 1)",
  secondary: "rgba(64, 64, 64, 1)",
  secondaryForeground: "rgba(226, 226, 226, 1)",
  muted: "rgba(56, 56, 56, 1)",
  mutedForeground: "rgba(138, 138, 138, 1)",
  accent: "rgba(82, 82, 82, 1)",
  accentForeground: "rgba(226, 226, 226, 1)",
  destructive: "rgba(220, 80, 80, 1)",
  destructiveForeground: "rgba(255, 255, 255, 1)",
  border: "rgba(74, 74, 74, 1)",
  input: "rgba(64, 64, 64, 1)",
  tooltipBg: "rgba(33, 33, 33, 0.92)",
  tooltipBorder: "rgba(74, 74, 74, 0.55)",
  tooltipFg: "rgba(226, 226, 226, 1)",
  tableTextColor: "#ffffff",
  tableAbbreviatedColor: "#71717a",
};

// Labels for custom theme color variables
export const CUSTOM_THEME_COLOR_LABELS: Record<
  string,
  { label: string; description: string; category: string }
> = {
  backgroundMain: {
    label: "背景（主窗口）",
    description: "主窗口背景颜色",
    category: "Base",
  },
  backgroundLive: {
    label: "背景（实时）",
    description: "实时统计窗口背景颜色",
    category: "Base",
  },
  foreground: { label: "前景", description: "主要文本颜色", category: "Base" },
  surface: {
    label: "表面",
    description: "卡片、弹窗和面板的背景颜色",
    category: "Surfaces",
  },
  surfaceForeground: {
    label: "表面文本",
    description: "表面上的文本颜色",
    category: "Surfaces",
  },
  primary: { label: "主色", description: "主要强调色", category: "Accents" },
  primaryForeground: {
    label: "主色文本",
    description: "主色元素上的文本颜色",
    category: "Accents",
  },
  secondary: { label: "次色", description: "次要强调色", category: "Accents" },
  secondaryForeground: {
    label: "次色文本",
    description: "次色元素上的文本颜色",
    category: "Accents",
  },
  muted: {
    label: "柔和",
    description: "柔和/低调的背景颜色",
    category: "Utility",
  },
  mutedForeground: {
    label: "柔和文本",
    description: "低调的文本颜色",
    category: "Utility",
  },
  accent: { label: "强调", description: "高亮强调色", category: "Accents" },
  accentForeground: {
    label: "强调文本",
    description: "强调色元素上的文本颜色",
    category: "Accents",
  },
  destructive: {
    label: "破坏性",
    description: "错误/危险颜色",
    category: "Utility",
  },
  destructiveForeground: {
    label: "破坏性文本",
    description: "破坏性元素上的文本颜色",
    category: "Utility",
  },
  border: { label: "边框", description: "边框颜色", category: "Utility" },
  input: {
    label: "输入框",
    description: "输入框背景颜色",
    category: "Utility",
  },
  tableTextColor: {
    label: "表格文本",
    description: "实时表格中的文本颜色",
    category: "Tables",
  },
  tableAbbreviatedColor: {
    label: "后缀颜色",
    description: "表格中 K、M、% 后缀的颜色",
    category: "Tables",
  },
  tooltipBg: {
    label: "提示背景",
    description: "提示框背景颜色",
    category: "Tooltip",
  },
  tooltipBorder: {
    label: "提示边框",
    description: "提示框边框颜色",
    category: "Tooltip",
  },
  tooltipFg: {
    label: "提示文本",
    description: "提示框文本颜色",
    category: "Tooltip",
  },
};

/**
 * Live-meter-scoped appearance: the theme palette and class/spec colors that
 * apply to the live overlay (and, for class colors, the main window's
 * history views too) and are shared whenever a loadout is exported. Main
 * window chrome and global assets (background image, custom fonts) stay on
 * `accessibility` — see `DEFAULT_SETTINGS.accessibility` below.
 */
export type LiveAppearance = {
  themeColors: CustomThemeColors;
  classColors: Record<string, string>;
  useClassSpecColors: boolean;
  classSpecColors: Record<string, string>;
};

export function createDefaultLiveAppearance(): LiveAppearance {
  return {
    themeColors: { ...DEFAULT_CUSTOM_THEME_COLORS },
    classColors: { ...DEFAULT_CLASS_COLORS },
    useClassSpecColors: false,
    classSpecColors: { ...DEFAULT_CLASS_SPEC_COLORS },
  };
}

const DEFAULT_SETTINGS = {
  i18n: {
    locale: "zh-CN" as AppLocale,
  },
  accessibility: {
    blur: false,
    clickthrough: false,
    exitOnClose: false,
    fontSizes: { ...DEFAULT_FONT_SIZES },
    customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS },
    // Background image settings
    backgroundImage: "" as string,
    backgroundImageEnabled: false,
    backgroundImageMode: "cover" as "cover" | "contain",
    backgroundImageContainColor: "rgba(0, 0, 0, 0)",
    backgroundImageOpacity: 100,
    // Custom font settings
    customFontSansEnabled: false,
    customFontSansUrl: "" as string,
    customFontSansName: "" as string,
    customFontMonoEnabled: false,
    customFontMonoUrl: "" as string,
    customFontMonoName: "" as string,
    customFontApplyToOverlay: false,
  },
  shortcuts: {
    showLiveMeter: "",
    hideLiveMeter: "",
    toggleLiveMeter: "",
    toggleOverlayWindow: "",
    enableClickthrough: "",
    disableClickthrough: "",
    toggleClickthrough: "",
    resetEncounter: "",
    togglePauseEncounter: "",
    hardReset: "",
    toggleBossHp: "",
    toggleOverlayEdit: "",
    toggleMinimizeAll: "",
  },
  moduleSync: {
    enabled: false,
    apiKey: "",
    baseUrl: "https://your-api-server.com/api/v1",
    autoSyncIntervalMinutes: 0,
    autoUpload: true,
    marketUpload: true,
  },
  monitoring: createDefaultMonitoringSettingsState(),
  minimap: createDefaultMinimapConfig(),
  voice: createDefaultVoiceSettings(),
  challengeWatch: {
    forbiddenDamageIds: [] as number[],
  },
  live: {
    general: { ...DEFAULT_GENERAL_SETTINGS },
    columnLabels: createDefaultDpsColumnLabels(),
    dpsPlayers: { ...DEFAULT_STATS },
    dpsSkillBreakdown: { ...DEFAULT_STATS },
    healPlayers: { ...DEFAULT_STATS },
    healSkillBreakdown: { ...DEFAULT_STATS },
    tankedPlayers: { ...DEFAULT_LIVE_TANKED_PLAYER_STATS },
    tankedSkillBreakdown: { ...DEFAULT_LIVE_TANKED_SKILL_STATS },
    deathReplay: { ...DEFAULT_DEATH_REPLAY_COLUMNS },
    tableCustomization: { ...DEFAULT_LIVE_TABLE_SETTINGS },
    headerCustomization: {
      windowPadding: 12,
      headerPadding: 8,
      headerLayoutMode: "classic" as HeaderLayoutMode,
      headerCustomLayout: cloneHeaderCustomLayout() as HeaderCustomLayout,
      showTimer: true,
      showActiveTimer: false,
      showSceneName: true,
      showResetButton: true,
      showPauseButton: true,
      showHistoryButton: false,
      showBossOnlyButton: true,
      showSettingsButton: true,
      showMinimizeButton: true,
      showHeaderControl: true,
      showTotalDamage: true,
      showTotalDps: true,
      showBossHealth: true,
      showNavigationTabs: true,
      showDeathTab: false,
      timerLabelFontSize: 12,
      timerFontSize: 18,
      activeTimerFontSize: 18,
      sceneNameFontSize: 14,
      resetButtonSize: 20,
      resetButtonPadding: 8,
      pauseButtonSize: 20,
      pauseButtonPadding: 8,
      headerControlSize: 20,
      headerControlPadding: 8,
      bossOnlyButtonSize: 20,
      bossOnlyButtonPadding: 8,
      settingsButtonSize: 20,
      settingsButtonPadding: 8,
      minimizeButtonSize: 20,
      minimizeButtonPadding: 8,
      historyButtonSize: 20,
      historyButtonPadding: 8,
      totalDamageLabelFontSize: 14,
      totalDamageValueFontSize: 18,
      totalDpsLabelFontSize: 14,
      totalDpsValueFontSize: 18,
      bossHealthLayout: "vertical" as "vertical" | "horizontal",
      bossHealthLabelFontSize: 14,
      bossHealthNameFontSize: 14,
      bossHealthValueFontSize: 14,
      bossHealthPercentFontSize: 14,
      navTabFontSize: 11,
      navTabPaddingX: 14,
      navTabPaddingY: 6,
    },
  },
  history: createDefaultHistorySettings(),
};

// We need flattened settings for every update to be able to auto-detect new changes
const RUNE_STORE_OPTIONS = { autoStart: true, saveOnChange: true };
const LIVE_RUNE_STORE_OPTIONS = {
  autoStart: false,
  saveOnChange: false,
  saveOnExit: false,
} as const;
const monitoringStore = new RuneStore(
  "monitoring",
  DEFAULT_SETTINGS.monitoring,
  { ...RUNE_STORE_OPTIONS, autoStart: false },
);
const accessibilityStore = new RuneStore(
  "accessibility",
  DEFAULT_SETTINGS.accessibility,
  { ...RUNE_STORE_OPTIONS, autoStart: false },
);
let accessibilityStartPromise: Promise<void> | null = null;

export function startAccessibilityStore(): Promise<void> {
  accessibilityStartPromise ??= accessibilityStore.start();
  return accessibilityStartPromise;
}

function monitoringSection<
  K extends keyof Omit<MonitoringSettingsState, "schemaVersion">,
>(key: K): { readonly state: MonitoringSettingsState[K] } {
  return {
    get state() {
      return monitoringStore.state[key];
    },
  };
}

export const SETTINGS = {
  i18n: new RuneStore("i18n", DEFAULT_SETTINGS.i18n, RUNE_STORE_OPTIONS),
  accessibility: accessibilityStore,
  shortcuts: new RuneStore(
    "shortcuts",
    DEFAULT_SETTINGS.shortcuts,
    RUNE_STORE_OPTIONS,
  ),
  moduleSync: new RuneStore(
    "moduleSync",
    DEFAULT_SETTINGS.moduleSync,
    RUNE_STORE_OPTIONS,
  ),
  monitoring: monitoringStore,
  /** @deprecated Read/write through SETTINGS.monitoring.state.skillMonitor. */
  skillMonitor: monitoringSection("skillMonitor"),
  /** @deprecated Read/write through SETTINGS.monitoring.state.monsterMonitor. */
  monsterMonitor: monitoringSection("monsterMonitor"),
  /** @deprecated Read/write through SETTINGS.monitoring.state.loadouts. */
  loadouts: monitoringSection("loadouts"),
  /** @deprecated Read/write through SETTINGS.monitoring.state.liveMeter. */
  liveMeter: monitoringSection("liveMeter"),
  minimap: new RuneStore("minimap", DEFAULT_SETTINGS.minimap, {
    ...RUNE_STORE_OPTIONS,
    hooks: {
      beforeFrontendSync: (state) => ({
        ...state,
        ...normalizeMinimapMarkerSettings(state),
      }),
    },
  }),
  voice: new RuneStore("voice", DEFAULT_SETTINGS.voice, RUNE_STORE_OPTIONS),
  /**
   * Mirror store for the active loadout's forbidden-damage list (see
   * `LIVE_METER_STORES`). Kept at the top level (not nested under `live`)
   * so existing consumers (`SETTINGS.challengeWatch.state...`) keep working
   * unchanged.
   */
  challengeWatch: new RuneStore(
    "challengeWatch",
    DEFAULT_SETTINGS.challengeWatch,
    LIVE_RUNE_STORE_OPTIONS,
  ),
  live: {
    general: new RuneStore(
      "liveGeneral",
      DEFAULT_SETTINGS.live.general,
      LIVE_RUNE_STORE_OPTIONS,
    ),
    appearance: new RuneStore(
      "liveAppearance",
      createDefaultLiveAppearance(),
      LIVE_RUNE_STORE_OPTIONS,
    ),
    dps: {
      players: new RuneStore(
        "liveDpsPlayers",
        DEFAULT_SETTINGS.live.dpsPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      skillBreakdown: new RuneStore(
        "liveDpsSkillBreakdown",
        DEFAULT_SETTINGS.live.dpsSkillBreakdown,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
    heal: {
      players: new RuneStore(
        "liveHealPlayers",
        DEFAULT_SETTINGS.live.healPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      skillBreakdown: new RuneStore(
        "liveHealSkillBreakdown",
        DEFAULT_SETTINGS.live.healSkillBreakdown,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
    tanked: {
      players: new RuneStore(
        "liveTankedPlayers",
        DEFAULT_SETTINGS.live.tankedPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      skills: new RuneStore(
        "liveTankedSkills",
        DEFAULT_SETTINGS.live.tankedSkillBreakdown,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
    deathReplay: new RuneStore(
      "liveDeathReplay",
      DEFAULT_SETTINGS.live.deathReplay,
      LIVE_RUNE_STORE_OPTIONS,
    ),
    tableCustomization: new RuneStore(
      "liveTableCustomization",
      DEFAULT_SETTINGS.live.tableCustomization,
      LIVE_RUNE_STORE_OPTIONS,
    ),
    headerCustomization: new RuneStore(
      "liveHeaderCustomization",
      DEFAULT_SETTINGS.live.headerCustomization,
      LIVE_RUNE_STORE_OPTIONS,
    ),
    columnLabels: new RuneStore(
      "liveDpsColumnLabels",
      DEFAULT_SETTINGS.live.columnLabels,
      LIVE_RUNE_STORE_OPTIONS,
    ),
    // Column order settings
    columnOrder: {
      dpsPlayers: new RuneStore(
        "liveDpsPlayersColumnOrder",
        { order: DEFAULT_DPS_PLAYER_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
      dpsSkills: new RuneStore(
        "liveDpsSkillsColumnOrder",
        { order: DEFAULT_DPS_SKILL_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
      healPlayers: new RuneStore(
        "liveHealPlayersColumnOrder",
        { order: DEFAULT_HEAL_PLAYER_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
      healSkills: new RuneStore(
        "liveHealSkillsColumnOrder",
        { order: DEFAULT_HEAL_SKILL_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
      tankedPlayers: new RuneStore(
        "liveTankedPlayersColumnOrder",
        { order: DEFAULT_TANKED_PLAYER_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
      tankedSkills: new RuneStore(
        "liveTankedSkillsColumnOrder",
        { order: DEFAULT_TANKED_SKILL_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
      deathReplay: new RuneStore(
        "liveDeathReplayColumnOrder",
        { order: DEFAULT_DEATH_REPLAY_COLUMN_ORDER },
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
    // Sort settings
    sorting: {
      dpsPlayers: new RuneStore(
        "liveDpsPlayersSorting",
        DEFAULT_LIVE_SORT_SETTINGS.dpsPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      dpsSkills: new RuneStore(
        "liveDpsSkillsSorting",
        DEFAULT_LIVE_SORT_SETTINGS.dpsSkills,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      healPlayers: new RuneStore(
        "liveHealPlayersSorting",
        DEFAULT_LIVE_SORT_SETTINGS.healPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      healSkills: new RuneStore(
        "liveHealSkillsSorting",
        DEFAULT_LIVE_SORT_SETTINGS.healSkills,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      tankedPlayers: new RuneStore(
        "liveTankedPlayersSorting",
        DEFAULT_LIVE_SORT_SETTINGS.tankedPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      tankedSkills: new RuneStore(
        "liveTankedSkillsSorting",
        DEFAULT_LIVE_SORT_SETTINGS.tankedSkills,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
  },
  history: {
    general: new RuneStore(
      "historyGeneral",
      DEFAULT_SETTINGS.history.general,
      LIVE_RUNE_STORE_OPTIONS,
    ),
    dps: {
      players: new RuneStore(
        "historyDpsPlayers",
        DEFAULT_SETTINGS.history.dpsPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      skillBreakdown: new RuneStore(
        "historyDpsSkillBreakdown",
        DEFAULT_SETTINGS.history.dpsSkillBreakdown,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
    heal: {
      players: new RuneStore(
        "historyHealPlayers",
        DEFAULT_SETTINGS.history.healPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      skillBreakdown: new RuneStore(
        "historyHealSkillBreakdown",
        DEFAULT_SETTINGS.history.healSkillBreakdown,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
    tanked: {
      players: new RuneStore(
        "historyTankedPlayers",
        DEFAULT_SETTINGS.history.tankedPlayers,
        LIVE_RUNE_STORE_OPTIONS,
      ),
      skillBreakdown: new RuneStore(
        "historyTankedSkillBreakdown",
        DEFAULT_SETTINGS.history.tankedSkillBreakdown,
        LIVE_RUNE_STORE_OPTIONS,
      ),
    },
  },
  // persisted app metadata (tracks which app version the user last saw)
  appVersion: new RuneStore("appVersion", { value: "" }, RUNE_STORE_OPTIONS),
  packetCapture: new RuneStore(
    "packetCapture",
    { method: "Npcap", npcapDevice: "" },
    RUNE_STORE_OPTIONS,
  ),
};

const LIVE_METER_STORES = [
  SETTINGS.live.general,
  SETTINGS.live.appearance,
  SETTINGS.challengeWatch,
  SETTINGS.live.dps.players,
  SETTINGS.live.dps.skillBreakdown,
  SETTINGS.live.heal.players,
  SETTINGS.live.heal.skillBreakdown,
  SETTINGS.live.tanked.players,
  SETTINGS.live.tanked.skills,
  SETTINGS.live.deathReplay,
  SETTINGS.live.tableCustomization,
  SETTINGS.live.headerCustomization,
  SETTINGS.live.columnLabels,
  SETTINGS.live.columnOrder.dpsPlayers,
  SETTINGS.live.columnOrder.dpsSkills,
  SETTINGS.live.columnOrder.healPlayers,
  SETTINGS.live.columnOrder.healSkills,
  SETTINGS.live.columnOrder.tankedPlayers,
  SETTINGS.live.columnOrder.tankedSkills,
  SETTINGS.live.columnOrder.deathReplay,
  SETTINGS.live.sorting.dpsPlayers,
  SETTINGS.live.sorting.dpsSkills,
  SETTINGS.live.sorting.healPlayers,
  SETTINGS.live.sorting.healSkills,
  SETTINGS.live.sorting.tankedPlayers,
  SETTINGS.live.sorting.tankedSkills,
  SETTINGS.history.general,
  SETTINGS.history.dps.players,
  SETTINGS.history.dps.skillBreakdown,
  SETTINGS.history.heal.players,
  SETTINGS.history.heal.skillBreakdown,
  SETTINGS.history.tanked.players,
  SETTINGS.history.tanked.skillBreakdown,
] as const;

export async function startLiveMeterStores(): Promise<void> {
  await Promise.all(LIVE_METER_STORES.map((store) => store.start()));
}

// Create flattened settings object for backwards compatibility
export const settings = {
  state: {
    i18n: SETTINGS.i18n.state,
    accessibility: SETTINGS.accessibility.state,
    shortcuts: SETTINGS.shortcuts.state,
    moduleSync: SETTINGS.moduleSync.state,
    get skillMonitor() {
      return SETTINGS.monitoring.state.skillMonitor;
    },
    get monsterMonitor() {
      return SETTINGS.monitoring.state.monsterMonitor;
    },
    get loadouts() {
      return SETTINGS.monitoring.state.loadouts;
    },
    minimap: SETTINGS.minimap.state,
    voice: SETTINGS.voice.state,
    challengeWatch: SETTINGS.challengeWatch.state,
    live: {
      general: SETTINGS.live.general.state,
      dps: {
        players: SETTINGS.live.dps.players.state,
        skillBreakdown: SETTINGS.live.dps.skillBreakdown.state,
      },
      heal: {
        players: SETTINGS.live.heal.players.state,
        skillBreakdown: SETTINGS.live.heal.skillBreakdown.state,
      },
      tanked: {
        players: SETTINGS.live.tanked.players.state,
        skills: SETTINGS.live.tanked.skills.state,
      },
      deathReplay: SETTINGS.live.deathReplay.state,
      tableCustomization: SETTINGS.live.tableCustomization.state,
      headerCustomization: SETTINGS.live.headerCustomization.state,
      columnLabels: SETTINGS.live.columnLabels.state,
      columnOrder: {
        dpsPlayers: SETTINGS.live.columnOrder.dpsPlayers.state,
        dpsSkills: SETTINGS.live.columnOrder.dpsSkills.state,
        healPlayers: SETTINGS.live.columnOrder.healPlayers.state,
        healSkills: SETTINGS.live.columnOrder.healSkills.state,
        tankedPlayers: SETTINGS.live.columnOrder.tankedPlayers.state,
        tankedSkills: SETTINGS.live.columnOrder.tankedSkills.state,
        deathReplay: SETTINGS.live.columnOrder.deathReplay.state,
      },
      sorting: {
        dpsPlayers: SETTINGS.live.sorting.dpsPlayers.state,
        dpsSkills: SETTINGS.live.sorting.dpsSkills.state,
        healPlayers: SETTINGS.live.sorting.healPlayers.state,
        healSkills: SETTINGS.live.sorting.healSkills.state,
        tankedPlayers: SETTINGS.live.sorting.tankedPlayers.state,
        tankedSkills: SETTINGS.live.sorting.tankedSkills.state,
      },
    },
    appVersion: SETTINGS.appVersion.state,
    history: {
      general: SETTINGS.history.general.state,
      dps: {
        players: SETTINGS.history.dps.players.state,
        skillBreakdown: SETTINGS.history.dps.skillBreakdown.state,
      },
      heal: {
        players: SETTINGS.history.heal.players.state,
        skillBreakdown: SETTINGS.history.heal.skillBreakdown.state,
      },
      tanked: {
        players: SETTINGS.history.tanked.players.state,
        skillBreakdown: SETTINGS.history.tanked.skillBreakdown.state,
      },
    },
  },
};

// Accessibility helpers

// Theme selection removed — app uses only the `custom` theme controlled by customThemeColors
