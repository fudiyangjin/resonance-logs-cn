/**
 * @file This file contains type definitions for event payloads and functions for interacting with the backend.
 *
 * @packageDocumentation
 */
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { commands } from "./bindings";
import type {
  BossDbmEvent,
  BossHealth,
  BuffUpdateState,
  CounterUpdateState,
  DamageSnapshot,
  DeathBuffSnapshot,
  DeathParticipantBuffSnapshot,
  DeathRecord,
  EntityDurationTrackState,
  FightResourceEntry,
  FightResourceState,
  HateEntry,
  HpEntry,
  LiveDataPayload,
  MinimapBuffFact,
  MinimapEntity,
  MinimapEntityKind,
  MinimapEntityType,
  MinimapMarker,
  MinimapSkillCast,
  MinimapSnapshot,
  MonsterSkillCastState,
  PanelAttrState,
  PerSourceStats,
  RawCombatStats,
  RawEntityData,
  RawSkillStats,
  Result,
  ShieldDetailEntry,
  SkillCdState,
  SlotUpdateState,
  StunEntry,
  TeammateFantasyState,
  TrainingDummyPhase,
  TrainingDummyState,
} from "./bindings";

export type {
  BossDbmEvent,
  BossHealth,
  BuffUpdateState,
  CounterUpdateState,
  DamageSnapshot,
  DeathBuffSnapshot,
  DeathParticipantBuffSnapshot,
  DeathRecord,
  EntityDurationTrackState,
  FightResourceEntry,
  FightResourceState,
  HateEntry,
  HpEntry,
  LiveDataPayload,
  MinimapBuffFact,
  MinimapEntity,
  MinimapEntityKind,
  MinimapEntityType,
  MinimapMarker,
  MinimapSkillCast,
  MinimapSnapshot,
  MonsterSkillCastState,
  PanelAttrState,
  RawCombatStats,
  RawEntityData,
  RawSkillStats,
  ShieldDetailEntry,
  SkillCdState,
  StunEntry,
  TeammateFantasyState,
  TrainingDummyPhase,
  TrainingDummyState,
};

export type CounterSlotState = SlotUpdateState;
export type RawPerSourceStats = PerSourceStats;

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
  forbiddenHit: boolean;
  forbiddenHitIds: number[];
};

// Command wrappers (still using generated bindings)

export const resetEncounter = (): Promise<Result<null, string>> =>
  commands.resetEncounter();
export const togglePauseEncounter = (): Promise<Result<null, string>> =>
  commands.togglePauseEncounter();
export const startTrainingDummy = (): Promise<Result<null, string>> =>
  commands.startTrainingDummy();
export const stopTrainingDummy = (): Promise<Result<null, string>> =>
  commands.stopTrainingDummy();

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

export const getLatestModules = (): Promise<ModuleInfo[]> =>
  invoke("get_latest_modules");

export const optimizeLatestModules = (
  payload: OptimizeLatestPayload,
): Promise<ModuleSolution[]> => invoke("optimize_latest_modules", payload);

// -- Voice (offline TTS broadcasting) event payloads --------------------
// These mirror `voice::model_manager::ModelDownloadProgress` and
// `voice::models::VoiceGenerationProgress` on the Rust side. They are not
// part of `bindings.ts` because event payloads aren't reachable from a
// `#[tauri::command]` return type in this project's specta setup.

export type VoiceModelDownloadProgressPayload =
  | {
      kind: "fileStart";
      name: string;
      totalBytes: number;
      source: "huggingFace" | "hfMirror";
    }
  | {
      kind: "fileProgress";
      name: string;
      downloadedBytes: number;
      totalBytes: number;
      source: "huggingFace" | "hfMirror";
    }
  | {
      kind: "fileVerifying";
      name: string;
      source: "huggingFace" | "hfMirror";
    }
  | { kind: "fileDone"; name: string; source: "huggingFace" | "hfMirror" }
  | { kind: "allDone"; modelVersion: string }
  | { kind: "error"; error: string }
  | { kind: "cancelled" };

export const onVoiceModelDownloadProgress = (
  handler: (event: Event<VoiceModelDownloadProgressPayload>) => void,
): Promise<UnlistenFn> =>
  listen<VoiceModelDownloadProgressPayload>(
    "voice-model-download-progress",
    handler,
  );

export type VoiceGenerationProgressPayload =
  | { kind: "stage"; stage: string; status: string; error: string | null }
  | { kind: "item"; id: string; status: string; error: string | null }
  | { kind: "finished"; completed: number; failed: number }
  | { kind: "fatal"; error: string };

export const onVoiceGenerationProgress = (
  handler: (event: Event<VoiceGenerationProgressPayload>) => void,
): Promise<UnlistenFn> =>
  listen<VoiceGenerationProgressPayload>("voice-generation-progress", handler);
