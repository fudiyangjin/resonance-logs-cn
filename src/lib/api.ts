/**
 * @file This file contains type definitions for event payloads and functions for interacting with the backend.
 *
 * @packageDocumentation
 */
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { commands } from "./bindings";
import type {
  Result,
  RawCombatStats as BindingRawCombatStats,
  RawSkillStats as BindingRawSkillStats,
  HistoryEntityData as BindingRawEntityData,
} from "./bindings";

// Type definitions for event payloads
export type BossHealth = {
  uid: number;
  name: string;
  currentHp: number | null;
  maxHp: number | null;
};

export type HeaderInfo = {
  totalDps: number;
  totalDmg: number;
  elapsedMs: number;
  activeCombatTimeMs: number;
  fightStartTimestampMs: number; // Unix timestamp when fight started
  bosses: BossHealth[];
  sceneId: number | null;
  sceneName: string | null;
};

export type PlayerRow = {
  uid: number;
  name: string;
  className: string;
  classSpecName: string;
  abilityScore: number;
  seasonStrength: number;
  totalDmg: number;
  dps: number;
  tdps: number;
  activeTimeMs: number;
  bossDps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  hits: number;
  hitsPerMinute: number;
  bossDmg: number;
  bossDmgPct: number;
};

export type PlayersWindow = {
  playerRows: PlayerRow[]
};

export type SkillRow = {
  skillId: number;
  name: string;
  totalDmg: number;
  dps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  hits: number;
  hitsPerMinute: number
};

export type SkillCdState = {
  skillLevelId: number;
  beginTime: number;
  duration: number;
  skillCdType: number;
  validCdTime: number;
  receivedAt: number;
  calculatedDuration: number;
  cdAccelerateRate: number;
};

export type SkillCdUpdatePayload = {
  skillCds: SkillCdState[];
};

export type FightResourceState = {
  values: number[];
  receivedAt: number;
};

export type FightResourceUpdatePayload = {
  fightRes: FightResourceState;
};

export type BuffUpdateState = {
  baseId: number;
  layer: number;
  durationMs: number;
  createTimeMs: number;
};

export type BuffUpdatePayload = {
  buffs: BuffUpdateState[];
};

export type BossBuffUpdatePayload = {
  bossBuffs: Record<string, BuffUpdateState[]>;
};

export type HateEntry = {
  uid: number;
  hateVal: number;
};

export type HateListUpdatePayload = {
  hateLists: Record<string, HateEntry[]>;
};

export type EntityNameMapPayload = {
  names: Record<string, string>;
};

export type CounterUpdateState = {
  ruleId: number;
  linkedBuffId: number;
  currentCount: number;
  threshold: number | null;
  isCounting: boolean;
  linkedBuffActive: boolean;
};

export type BuffCounterUpdatePayload = {
  counters: CounterUpdateState[];
};

export type CounterTrigger =
  | { damageBySkillKey: number[] }
  | { damageBySkillKeySelfTarget: number[] }
  | "anyDamage";

export type CounterAction = "reset" | "freeze" | "resetAndFreeze" | "startCount" | "noOp";

export type CounterRule = {
  ruleId: number;
  trigger: CounterTrigger;
  linkedBuffId: number;
  threshold: number | null;
  onBuffAdd: CounterAction;
  onBuffRemove: CounterAction;
};

export type PanelAttrState = {
  attrId: number;
  value: number;
};

export type PanelAttrUpdatePayload = {
  attrs: PanelAttrState[];
};

export type EncounterUpdatePayload = {
  headerInfo: HeaderInfo;
  isPaused: boolean;
};

export type RawCombatStats = BindingRawCombatStats;
export type RawSkillStats = BindingRawSkillStats;
export type RawEntityData = BindingRawEntityData;

export type LiveDataPayload = {
  elapsedMs: number;
  activeCombatTimeMs: number;
  fightStartTimestampMs: number;
  totalDmg: number;
  totalDmgBossOnly: number;
  totalHeal: number;
  localPlayerUid: number;
  sceneId: number | null;
  sceneName: string | null;
  isPaused: boolean;
  bosses: BossHealth[];
  entities: RawEntityData[];
};

export type SceneChangePayload = {
  sceneName: string;
};

// Event listener functions
export const onEncounterUpdate = (handler: (event: Event<EncounterUpdatePayload>) => void): Promise<UnlistenFn> =>
  listen<EncounterUpdatePayload>("encounter-update", handler);

export const onLiveData = (handler: (event: Event<LiveDataPayload>) => void): Promise<UnlistenFn> =>
  listen<LiveDataPayload>("live-data", handler);

export const onSceneChange = (handler: (event: Event<SceneChangePayload>) => void): Promise<UnlistenFn> =>
  listen<SceneChangePayload>("scene-change", handler);

export const onResetEncounter = (handler: () => void): Promise<UnlistenFn> =>
  listen("reset-encounter", handler);

export const onPauseEncounter = (handler: (event: Event<boolean>) => void): Promise<UnlistenFn> =>
  listen<boolean>("pause-encounter", handler);

export const onSkillCdUpdate = (
  handler: (event: Event<SkillCdUpdatePayload>) => void
): Promise<UnlistenFn> =>
  listen<SkillCdUpdatePayload>("skill-cd-update", handler);

export const onFightResUpdate = (
  handler: (event: Event<FightResourceUpdatePayload>) => void
): Promise<UnlistenFn> =>
  listen<FightResourceUpdatePayload>("fight-res-update", handler);

export const onBuffUpdate = (
  handler: (event: Event<BuffUpdatePayload>) => void
): Promise<UnlistenFn> => listen<BuffUpdatePayload>("buff-update", handler);

export const onBossBuffUpdate = (
  handler: (event: Event<BossBuffUpdatePayload>) => void
): Promise<UnlistenFn> =>
  listen<BossBuffUpdatePayload>("boss-buff-update", handler);

export const onHateListUpdate = (
  handler: (event: Event<HateListUpdatePayload>) => void
): Promise<UnlistenFn> =>
  listen<HateListUpdatePayload>("hate-list-update", handler);

export const onEntityNames = (
  handler: (event: Event<EntityNameMapPayload>) => void
): Promise<UnlistenFn> =>
  listen<EntityNameMapPayload>("entity-names", handler);

export const onBuffCounterUpdate = (
  handler: (event: Event<BuffCounterUpdatePayload>) => void
): Promise<UnlistenFn> =>
  listen<BuffCounterUpdatePayload>("buff-counter-update", handler);

export const onPanelAttrUpdate = (
  handler: (event: Event<PanelAttrUpdatePayload>) => void
): Promise<UnlistenFn> =>
  listen<PanelAttrUpdatePayload>("panel-attr-update", handler);

// Command wrappers (still using generated bindings)

export const resetEncounter = (): Promise<Result<null, string>> => commands.resetEncounter();
export const togglePauseEncounter = (): Promise<Result<null, string>> => commands.togglePauseEncounter();
export const enableBlur = (): Promise<void> => commands.enableBlur();
export const disableBlur = (): Promise<void> => commands.disableBlur();
export const getEncounterEntitiesRaw = (
  encounterId: number,
): Promise<Result<RawEntityData[], string>> =>
  commands.getEncounterEntitiesRaw(encounterId);

export const setEventUpdateRateMs = (rateMs: number): Promise<void> =>
  invoke("set_event_update_rate_ms", { rateMs });

export const setMonitoredPanelAttrs = (attrIds: number[]): Promise<void> =>
  invoke("set_monitored_panel_attrs", { attrIds });

export const setBuffCounterRules = (rules: CounterRule[]): Promise<void> =>
  invoke("set_buff_counter_rules", { rules });

// =========================
// 模组计算器相关 API
// =========================

export type ModulePart = {
  id: number;
  name: string;
  value: number;
};

export type ModuleInfo = {
  name: string;
  config_id: number;
  uuid: number;
  quality: number;
  parts: ModulePart[];
};

export type ModuleSolution = {
  modules: ModuleInfo[];
  score: number;
  attr_breakdown: Record<string, number>;
};

export type OptimizeLatestPayload = {
  targetAttributes: number[];
  excludeAttributes: number[];
  minAttrRequirements?: Record<number, number>;
  useGpu?: boolean;
  combinationSize?: 4 | 5;
};

export type ModuleCalcProgressPayload = [number, number]; // [processed, total]

export const onModuleCalcProgress = (
  handler: (event: Event<ModuleCalcProgressPayload>) => void
): Promise<UnlistenFn> =>
  listen<ModuleCalcProgressPayload>("module-calc-progress", handler);

export const onModuleCalcComplete = (
    handler: (event: Event<ModuleSolution[]>) => void
): Promise<UnlistenFn> =>
    listen<ModuleSolution[]>("module-calc-complete", handler);

export const getLatestModules = (): Promise<ModuleInfo[]> =>
  invoke("get_latest_modules");

export const optimizeLatestModules = (
  payload: OptimizeLatestPayload
): Promise<ModuleSolution[]> =>
  invoke("optimize_latest_modules", payload);
