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
  DamageSnapshot as BindingDamageSnapshot,
  DeathRecord as BindingDeathRecord,
} from "./bindings";

// Type definitions for event payloads
export type BossHealth = {
  entityUuid: string;
  monsterId: number | null;
  currentHp: number | null;
  maxHp: number | null;
  isDead: boolean;
};

export type HeaderInfo = {
  totalDps: number;
  totalDmg: number;
  elapsedMs: number;
  activeCombatTimeMs: number;
  fightStartTimestampMs: number; // Unix timestamp when fight started
  bosses: BossHealth[];
  sceneId: number | null;
  dungeonDifficulty: number | null;
  trainingDummy: TrainingDummyState;
};

export type TrainingDummyPhase = "idle" | "armed" | "running" | "finished";

export type TrainingDummyState = {
  phase: TrainingDummyPhase;
};

export type PlayerRow = {
  entityUuid: string;
  displayUid: number;
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
  blockRate: number;
  luckyBlockRate: number;
  hits: number;
  hitsPerMinute: number;
  bossDmg: number;
  bossDmgPct: number;
  effectiveTotal: number;
  effectiveDps: number;
};

export type PlayersWindow = {
  playerRows: PlayerRow[];
};

export type SkillRow = {
  skillId: number;
  name: string;
  totalDmg: number;
  effectiveTotal: number;
  dps: number;
  effectiveDps: number;
  dmgPct: number;
  critRate: number;
  critDmgRate: number;
  luckyRate: number;
  luckyDmgRate: number;
  blockRate: number;
  luckyBlockRate: number;
  hits: number;
  hitsPerMinute: number;
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
  entries: FightResourceEntry[];
  receivedAt: number;
};

export type FightResourceEntry = {
  id: number;
  value: number;
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

export type TeammateBuffUpdatePayload = {
  teammateBuffs: Record<string, BuffUpdateState[]>;
};

export type BossDbmEvent = {
  skillEffectId: number;
  baseSkillId: number;
  durationMs: number;
  createTimeMs: number;
  insertion: number;
  serverTimestampMs?: number | null;
};

export type BossDbmUpdatePayload = {
  events: BossDbmEvent[];
};

export type TeammateFantasyState = {
  summonUuid: string;
  summonerUuid: string;
  summonerName?: string | null;
  monsterId: number;
  remodelLevel: number;
  detectedAtMs: number;
};

export type TeammateFantasyUpdatePayload = {
  fantasies: TeammateFantasyState[];
};

export type TeammateFantasyClearPayload = null;

export type HateEntry = {
  entityUuid: string;
  hateVal: number;
};

export type HateListUpdatePayload = {
  hateLists: Record<string, HateEntry[]>;
};

export type MinimapEntityKind =
  | "local"
  | "teammate"
  | "boss"
  | "monster"
  | "dummy"
  | "other";

export type MinimapEntityType =
  | "unknown"
  | "monster"
  | "npc"
  | "sceneObject"
  | "zone"
  | "bullet"
  | "clientBullet"
  | "pet"
  | "char"
  | "dummy"
  | "drop"
  | "field"
  | "trap"
  | "collection"
  | "staticObject"
  | "vehicle"
  | "toy"
  | "communityHouse"
  | "houseItem"
  | "other";

export type MinimapBuffFact = {
  targetEntityUuid: string;
  buffUuid: number;
  baseId: number;
  layer: number;
  createTimeMs: number;
  durationMs: number;
  fireUuid?: string | null;
  sourceConfigId?: number | null;
};

export type MinimapEntity = {
  entityUuid: string;
  entityType: MinimapEntityType;
  kind: MinimapEntityKind;
  x: number;
  y: number;
  z: number;
  name?: string | null;
  monsterId?: number | null;
  facing?: number | null;
  isDead: boolean;
  topSummonerId?: string | null;
};

export type MinimapSkillCast = {
  entityUuid: string;
  skillId: number;
  timeMs: number;
  x?: number | null;
  z?: number | null;
  facing?: number | null;
};

export type MinimapSnapshot = {
  sceneId: number;
  localPlayerUuid: string;
  entities: MinimapEntity[];
  buffs: MinimapBuffFact[];
};

export type MinimapUpdatePayload = {
  snapshot: MinimapSnapshot | null;
  skillCasts: MinimapSkillCast[];
};

export type EntityIdentityMapPayload = {
  playerNames: Record<string, string>;
  monsterIds: Record<string, number>;
};

export type CounterUpdateState = {
  ruleId: number;
  slots: CounterSlotState[];
};

export type BuffCounterUpdatePayload = {
  counters: CounterUpdateState[];
};

export type SeasonCultivateFactorCounterUpdatePayload = {
  sourceItemIds: number[];
  slotItemIds: number[];
  counters: CounterUpdateState[];
};

export type CounterSlotState = {
  slotId: number;
  currentCount: number;
  threshold: number | null;
  effectiveThreshold?: number | null;
  isCounting: boolean;
  resetBuffActive: boolean;
  freezeUntilMs: number | null;
  freezeDurationMs: number | null;
  effectiveFreezeDurationMs?: number | null;
};

export type PanelAttrState = {
  attrId: number;
  value: number;
};

export type PanelAttrUpdatePayload = {
  attrs: PanelAttrState[];
};

export type ShieldDetailEntry = {
  buffUuid: number;
  displayType: number;
  current: number;
  initialShield: number;
  maxShield: number;
  baseId: number;
  expireTimeMs: number;
};

export type ShieldDetailUpdatePayload = {
  currentHp: number;
  maxHp: number;
  entries: ShieldDetailEntry[];
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
  totalEffectiveHeal: number;
  localPlayerUuid: string;
  sceneId: number | null;
  dungeonDifficulty: number | null;
  isPaused: boolean;
  bosses: BossHealth[];
  entities: RawEntityData[];
};

export type SceneChangePayload = {
  sceneId: number;
  dungeonDifficulty: number | null;
};

export type DamageSnapshot = BindingDamageSnapshot;
export type DeathRecord = BindingDeathRecord;

export type DeathReplayPayload = {
  records: DeathRecord[];
};

// Event listener functions
export const onEncounterUpdate = (
  handler: (event: Event<EncounterUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<EncounterUpdatePayload>("encounter-update", handler);

export const onLiveData = (
  handler: (event: Event<LiveDataPayload>) => void,
): Promise<UnlistenFn> => listen<LiveDataPayload>("live-data", handler);

export const onTrainingDummyUpdate = (
  handler: (event: Event<TrainingDummyState>) => void,
): Promise<UnlistenFn> =>
  listen<TrainingDummyState>("training-dummy-update", handler);

export const onSceneChange = (
  handler: (event: Event<SceneChangePayload>) => void,
): Promise<UnlistenFn> => listen<SceneChangePayload>("scene-change", handler);

export const onResetEncounter = (handler: () => void): Promise<UnlistenFn> =>
  listen("reset-encounter", handler);

export const onPauseEncounter = (
  handler: (event: Event<boolean>) => void,
): Promise<UnlistenFn> => listen<boolean>("pause-encounter", handler);

export const onSkillCdUpdate = (
  handler: (event: Event<SkillCdUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<SkillCdUpdatePayload>("skill-cd-update", handler);

export const onFightResUpdate = (
  handler: (event: Event<FightResourceUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<FightResourceUpdatePayload>("fight-res-update", handler);

export const onBuffUpdate = (
  handler: (event: Event<BuffUpdatePayload>) => void,
): Promise<UnlistenFn> => listen<BuffUpdatePayload>("buff-update", handler);

export const onBossBuffUpdate = (
  handler: (event: Event<BossBuffUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<BossBuffUpdatePayload>("boss-buff-update", handler);

export const onBossDbmUpdate = (
  handler: (event: Event<BossDbmUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<BossDbmUpdatePayload>("boss-dbm-update", handler);

export const onTeammateBuffUpdate = (
  handler: (event: Event<TeammateBuffUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<TeammateBuffUpdatePayload>("teammate-buff-update", handler);

export const onTeammateFantasyUpdate = (
  handler: (event: Event<TeammateFantasyUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<TeammateFantasyUpdatePayload>("teammate-fantasy-update", handler);

export const onTeammateFantasyClear = (
  handler: (event: Event<TeammateFantasyClearPayload>) => void,
): Promise<UnlistenFn> =>
  listen<TeammateFantasyClearPayload>("teammate-fantasy-clear", handler);

export const onHateListUpdate = (
  handler: (event: Event<HateListUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<HateListUpdatePayload>("hate-list-update", handler);

export const onMinimapUpdate = (
  handler: (event: Event<MinimapUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<MinimapUpdatePayload>("minimap-update", handler);

export const onEntityIdentities = (
  handler: (event: Event<EntityIdentityMapPayload>) => void,
): Promise<UnlistenFn> =>
  listen<EntityIdentityMapPayload>("entity-identities", handler);

export const onBuffCounterUpdate = (
  handler: (event: Event<BuffCounterUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<BuffCounterUpdatePayload>("buff-counter-update", handler);

export const onSeasonCultivateFactorCounterUpdate = (
  handler: (event: Event<SeasonCultivateFactorCounterUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<SeasonCultivateFactorCounterUpdatePayload>(
    "season-cultivate-factor-counter-update",
    handler,
  );

export const onPanelAttrUpdate = (
  handler: (event: Event<PanelAttrUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<PanelAttrUpdatePayload>("panel-attr-update", handler);

export const onShieldDetailUpdate = (
  handler: (event: Event<ShieldDetailUpdatePayload>) => void,
): Promise<UnlistenFn> =>
  listen<ShieldDetailUpdatePayload>("shield-detail-update", handler);

export const onDeathReplay = (
  handler: (event: Event<DeathReplayPayload>) => void,
): Promise<UnlistenFn> => listen<DeathReplayPayload>("death-replay", handler);

// Command wrappers (still using generated bindings)

export const resetEncounter = (): Promise<Result<null, string>> =>
  commands.resetEncounter();
export const togglePauseEncounter = (): Promise<Result<null, string>> =>
  commands.togglePauseEncounter();
export const startTrainingDummy = (): Promise<Result<null, string>> =>
  commands.startTrainingDummy();
export const stopTrainingDummy = (): Promise<Result<null, string>> =>
  commands.stopTrainingDummy();
export const enableBlur = (): Promise<void> => commands.enableBlur();
export const disableBlur = (): Promise<void> => commands.disableBlur();
export const getEncounterEntitiesRaw = (
  encounterId: number,
): Promise<Result<RawEntityData[], string>> =>
  commands.getEncounterEntitiesRaw(encounterId);

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
  minTotalValue?: number;
  minAttrRequirements?: Record<number, number>;
  useGpu?: boolean;
  combinationSize?: 4 | 5;
};

export type ModuleCalcProgressPayload = [number, number]; // [processed, total]

export const onModuleCalcProgress = (
  handler: (event: Event<ModuleCalcProgressPayload>) => void,
): Promise<UnlistenFn> =>
  listen<ModuleCalcProgressPayload>("module-calc-progress", handler);

export const onModuleCalcComplete = (
  handler: (event: Event<ModuleSolution[]>) => void,
): Promise<UnlistenFn> =>
  listen<ModuleSolution[]>("module-calc-complete", handler);

export const getLatestModules = (): Promise<ModuleInfo[]> =>
  invoke("get_latest_modules");

export const optimizeLatestModules = (
  payload: OptimizeLatestPayload,
): Promise<ModuleSolution[]> => invoke("optimize_latest_modules", payload);
