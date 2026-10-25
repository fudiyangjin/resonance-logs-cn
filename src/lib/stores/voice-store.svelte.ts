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
  type VoicePhraseMeta,
  type VoiceStatus,
} from "$lib/bindings";
import { getLocale, t } from "$lib/i18n/index.svelte";
import { SETTINGS } from "$lib/settings-store";
import {
  resolveSavedGenerationSource,
  type GenerationSource,
} from "$lib/voice/generation-source";

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
  phraseError: string | null;
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
  phraseError: null,
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
let refreshSequence = 0;
let catalogRevision = 0;
let refreshQueued = false;
let operationRevision = 0;
let localOperations = $state(0);

/** Merge only backend-confirmed facts, never a requested text or language. */
export function mergeVoicePhrase(phrase: VoicePhraseMeta): void {
  if (!VOICE.status) throw new Error("voice catalog has not been initialized");
  const phrases = VOICE.status.catalog.phrases;
  const index = phrases.findIndex((entry) => entry.id === phrase.id);
  if (index < 0) phrases.push(phrase);
  else phrases[index] = phrase;
  catalogRevision++;
}

export function ensureVoiceCatalog(): Promise<boolean> {
  return VOICE.status ? Promise.resolve(true) : refreshVoiceStatus();
}

/** Coalesce catalog reconciliation after a batch of successful mutations. */
export function requestVoiceCatalogRefresh(): void {
  if (refreshInFlight) refreshQueued = true;
  else void refreshVoiceStatus();
}

export function voiceOperationActive(): boolean {
  return localOperations > 0 || VOICE.operation.kind !== "idle";
}

/** Keeps a selected id only while the catalog still has an entry with it. */
export function reconcileSelectedId(
  entries: readonly { id: string }[],
  selectedId: string | null,
): string | null {
  return selectedId && entries.some((entry) => entry.id === selectedId)
    ? selectedId
    : null;
}

/** Drops a selected clone profile / HTTP provider that no longer exists. */
function applyReconciledVoiceSettings(catalog: VoiceCatalog) {
  const state = SETTINGS.voice.state;
  const profileId = reconcileSelectedId(
    catalog.profiles,
    state.selectedProfileId,
  );
  if (profileId !== state.selectedProfileId) {
    state.selectedProfileId = profileId;
  }
  const providerId = reconcileSelectedId(
    catalog.httpProviders,
    state.selectedHttpProviderId,
  );
  if (providerId !== state.selectedHttpProviderId) {
    state.selectedHttpProviderId = providerId;
  }
}

/** The saved generation source, resolved against the current voice status. */
export function savedGenerationSource(): GenerationSource | null {
  const state = SETTINGS.voice.state;
  return resolveSavedGenerationSource({
    selectedSource: state.selectedSource,
    selectedProfileId: state.selectedProfileId,
    selectedHttpProviderId: state.selectedHttpProviderId,
    modelReady: VOICE.status?.model.kind === "ready",
    fineTunedReady: VOICE.status?.fineTunedVoice.kind === "ready",
    locale: getLocale(),
  });
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

export function refreshVoiceStatus(force = false): Promise<boolean> {
  if (!force && refreshInFlight) return refreshInFlight;
  const sequence = ++refreshSequence;
  const revision = catalogRevision;
  const operationAtStart = operationRevision;
  VOICE.statusLoading = true;
  const pending = (async () => {
    try {
      const result = await commands.voiceGetStatus(force);
      if (sequence !== refreshSequence) return false;
      if (result.status !== "ok") {
        VOICE.error = voiceErrorMessage(result.error);
        return false;
      }
      if (revision === catalogRevision) {
        VOICE.status = result.data;
        applyReconciledVoiceSettings(result.data.catalog);
      } else {
        // The status command snapshots its catalog before probing the engine.
        // A successful edit during that await is newer than this response.
        if (VOICE.status)
          VOICE.status = { ...result.data, catalog: VOICE.status.catalog };
        refreshQueued = true;
      }
      if (
        operationAtStart === operationRevision &&
        revision === catalogRevision &&
        localOperations === 0
      ) {
        VOICE.operation = result.data.operation;
      }
      VOICE.error = null;
      return VOICE.status !== null;
    } catch (error) {
      if (sequence === refreshSequence) VOICE.error = voiceErrorMessage(error);
      return false;
    } finally {
      if (sequence === refreshSequence) {
        VOICE.statusLoading = false;
        refreshInFlight = null;
        if (refreshQueued) {
          refreshQueued = false;
          void refreshVoiceStatus();
        }
      }
    }
  })();
  refreshInFlight = pending;
  return pending;
}

export async function runVoiceOperation<T>(
  operation: VoiceOperationState,
  task: () => Promise<Result<T, VoiceCommandError>>,
): Promise<Result<T, VoiceCommandError>> {
  const optimistic = VOICE.operation.kind === "idle";
  localOperations++;
  operationRevision++;
  if (optimistic) VOICE.operation = operation;
  try {
    const result = await task();
    if (result.status === "ok") catalogRevision++;
    return result;
  } finally {
    // Publish idle only after the operation and its catalog refresh finish.
    if (refreshInFlight) await refreshInFlight;
    const refreshed = await refreshVoiceStatus();
    localOperations--;
    operationRevision++;
    if (localOperations === 0) {
      if (refreshed && VOICE.status) VOICE.operation = VOICE.status.operation;
      else if (optimistic) VOICE.operation = { kind: "idle" };
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
