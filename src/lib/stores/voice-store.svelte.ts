import {
  onVoiceGenerationProgress,
  onVoiceModelDownloadProgress,
  type VoiceGenerationProgressPayload,
  type VoiceModelDownloadProgressPayload,
} from "$lib/api";
import {
  commands,
  type GenerationSummary,
  type Result,
  type VoiceCatalog,
  type VoiceCommandError,
  type VoiceGenerateRequestDto,
  type VoiceOperationState,
  type VoiceStatus,
} from "$lib/bindings";
import { SvelteSet } from "svelte/reactivity";
import { t } from "$lib/i18n/index.svelte";
import { SETTINGS, type VoiceRuleSetting } from "$lib/settings-store";

export function voiceErrorMessage(error: VoiceCommandError | unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "conflict"
  ) {
    return t("voice.operation.conflict");
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return error instanceof Error ? error.message : String(error);
}

export type VoiceDownloadPhase =
  | "idle"
  | "downloading"
  | "verifying"
  | "done"
  | "error"
  | "cancelled";

export type VoiceGenerationPhase =
  | "idle"
  | "running"
  | "cancelling"
  | "cancelled"
  | "done"
  | "error";

export interface VoiceItemProgress {
  status: string;
  error: string | null;
}

export interface VoiceState {
  status: VoiceStatus | null;
  statusLoading: boolean;
  error: string | null;
  operation: VoiceOperationState;

  downloadActive: boolean;
  downloadFileName: string | null;
  downloadSource: "huggingFace" | "hfMirror" | null;
  downloadedBytes: number;
  totalBytes: number;
  downloadPhase: VoiceDownloadPhase;
  downloadError: string | null;

  generationPhase: VoiceGenerationPhase;
  generationStage: string | null;
  generationStageStatus: string | null;
  generationItems: Record<string, VoiceItemProgress>;
  generationSummary: GenerationSummary | null;
  generationError: string | null;
}

export const VOICE = $state<VoiceState>({
  status: null,
  statusLoading: false,
  error: null,
  operation: { kind: "idle" },

  downloadActive: false,
  downloadFileName: null,
  downloadSource: null,
  downloadedBytes: 0,
  totalBytes: 0,
  downloadPhase: "idle",
  downloadError: null,

  generationPhase: "idle",
  generationStage: null,
  generationStageStatus: null,
  generationItems: {},
  generationSummary: null,
  generationError: null,
});

let listenersReady: Promise<void> | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function voiceOperationActive(): boolean {
  return VOICE.operation.kind !== "idle";
}

export function reconcileVoiceSettings(
  catalog: VoiceCatalog,
  rules: VoiceRuleSetting[],
  selectedProfileId: string | null,
): { rules: VoiceRuleSetting[]; selectedProfileId: string | null } {
  const phraseIds = new SvelteSet(catalog.phrases.map((phrase) => phrase.id));
  const profileIds = new SvelteSet(
    catalog.profiles.map((profile) => profile.id),
  );
  return {
    rules: rules.filter((rule) => phraseIds.has(rule.phraseId)),
    selectedProfileId:
      selectedProfileId && profileIds.has(selectedProfileId)
        ? selectedProfileId
        : null,
  };
}

function applyReconciledVoiceSettings(catalog: VoiceCatalog) {
  const currentRules = SETTINGS.voice.state.rules;
  const currentProfileId = SETTINGS.voice.state.selectedProfileId;
  const reconciled = reconcileVoiceSettings(
    catalog,
    currentRules,
    currentProfileId,
  );
  if (
    reconciled.rules.length !== currentRules.length ||
    reconciled.rules.some((rule, index) => rule.id !== currentRules[index]?.id)
  ) {
    SETTINGS.voice.state.rules = reconciled.rules;
  }
  if (reconciled.selectedProfileId !== currentProfileId) {
    SETTINGS.voice.state.selectedProfileId = reconciled.selectedProfileId;
  }
}

export function ensureVoiceListeners(): Promise<void> {
  if (!listenersReady) {
    listenersReady = (async () => {
      await onVoiceModelDownloadProgress((event) =>
        handleDownloadProgress(event.payload),
      );
      await onVoiceGenerationProgress((event) =>
        handleGenerationProgress(event.payload),
      );
    })();
  }
  return listenersReady;
}

function handleDownloadProgress(payload: VoiceModelDownloadProgressPayload) {
  switch (payload.kind) {
    case "fileStart":
      VOICE.downloadActive = true;
      VOICE.downloadFileName = payload.name;
      VOICE.downloadSource = payload.source;
      VOICE.downloadedBytes = 0;
      VOICE.totalBytes = payload.totalBytes;
      VOICE.downloadPhase = "downloading";
      VOICE.downloadError = null;
      break;
    case "fileProgress":
      VOICE.downloadFileName = payload.name;
      VOICE.downloadSource = payload.source;
      VOICE.downloadedBytes = payload.downloadedBytes;
      VOICE.totalBytes = payload.totalBytes;
      break;
    case "fileVerifying":
      VOICE.downloadPhase = "verifying";
      break;
    case "fileDone":
      break;
    case "allDone":
      VOICE.downloadActive = false;
      VOICE.downloadSource = null;
      VOICE.downloadPhase = "done";
      void refreshVoiceStatus();
      break;
    case "error":
      VOICE.downloadActive = false;
      VOICE.downloadSource = null;
      VOICE.downloadPhase = "error";
      VOICE.downloadError = payload.error;
      break;
    case "cancelled":
      VOICE.downloadActive = false;
      VOICE.downloadSource = null;
      VOICE.downloadPhase = "cancelled";
      break;
  }
}

function handleGenerationProgress(payload: VoiceGenerationProgressPayload) {
  switch (payload.kind) {
    case "stage":
      VOICE.generationStage = payload.stage;
      VOICE.generationStageStatus = payload.status;
      if (
        VOICE.generationPhase !== "cancelling" &&
        payload.status === "error" &&
        payload.error
      ) {
        VOICE.generationError = payload.error;
      }
      break;
    case "item":
      VOICE.generationItems = {
        ...VOICE.generationItems,
        [payload.id]: { status: payload.status, error: payload.error },
      };
      break;
    case "finished":
      break;
    case "fatal":
      if (VOICE.generationPhase !== "cancelling") {
        VOICE.generationError = payload.error;
      }
      break;
  }
}

export async function refreshVoiceStatus(force = false): Promise<boolean> {
  if (!force && refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    VOICE.statusLoading = true;
    try {
      const result = await commands.voiceGetStatus(force);
      if (result.status === "ok") {
        VOICE.status = result.data;
        VOICE.operation = result.data.operation;
        applyReconciledVoiceSettings(result.data.catalog);
        VOICE.error = null;
        return true;
      } else {
        VOICE.error = voiceErrorMessage(result.error);
        return false;
      }
    } catch (e) {
      VOICE.error = voiceErrorMessage(e);
      return false;
    } finally {
      VOICE.statusLoading = false;
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function runVoiceOperation<T>(
  operation: VoiceOperationState,
  task: () => Promise<Result<T, VoiceCommandError>>,
): Promise<Result<T, VoiceCommandError>> {
  const optimistic = VOICE.operation.kind === "idle";
  if (optimistic) VOICE.operation = operation;
  try {
    return await task();
  } finally {
    if (refreshInFlight) await refreshInFlight;
    const refreshed = await refreshVoiceStatus();
    if (!refreshed && optimistic && VOICE.operation.kind === operation.kind) {
      VOICE.operation = { kind: "idle" };
    }
  }
}

export async function runVoiceGeneration(
  request: VoiceGenerateRequestDto,
): Promise<GenerationSummary | null> {
  VOICE.generationPhase = "running";
  VOICE.generationStage = null;
  VOICE.generationStageStatus = null;
  VOICE.generationItems = {};
  VOICE.generationSummary = null;
  VOICE.generationError = null;
  try {
    const res = await runVoiceOperation(
      { kind: "generating", cancelling: false },
      () => commands.voiceGenerate(request),
    );
    if (res.status === "ok") {
      VOICE.generationSummary = res.data;
      VOICE.generationPhase = "done";
      return res.data;
    }
    if (res.error.code === "cancelled") {
      VOICE.generationError = null;
      VOICE.generationPhase = "cancelled";
      return null;
    }
    VOICE.generationError = voiceErrorMessage(res.error);
    VOICE.generationPhase = "error";
    return null;
  } catch (e) {
    VOICE.generationError = voiceErrorMessage(e);
    VOICE.generationPhase = "error";
    return null;
  }
}

export async function cancelVoiceGeneration(): Promise<void> {
  if (VOICE.generationPhase !== "running") return;
  VOICE.generationPhase = "cancelling";
  VOICE.operation = { kind: "generating", cancelling: true };
  try {
    await commands.voiceCancelGeneration();
  } catch (error) {
    VOICE.generationError = voiceErrorMessage(error);
    VOICE.generationPhase = "error";
  }
}
