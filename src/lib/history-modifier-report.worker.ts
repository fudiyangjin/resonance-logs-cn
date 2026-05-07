import type { HistoryEntityData } from "./bindings";
import { buildModifierActivityRowsFast } from "./history-modifier-report-fast";
import type {
  ModifierActivityRow,
  ModifierActivityScope,
  ModifierActorFilter,
} from "./history-modifier-report-display";

type ModifierReportWorkerRequest = {
  requestId: number;
  entity: HistoryEntityData;
  elapsedSecs: number;
  options: {
    scope?: ModifierActivityScope;
    actorFilter?: ModifierActorFilter;
    targetUid?: number | null;
    encounterStartMs?: number | null;
    encounterEndMs?: number | null;
  };
};

type ModifierReportWorkerResponse =
  | {
      requestId: number;
      status: "started";
      buckets: number;
    }
  | {
      requestId: number;
      status: "ok";
      rows: ModifierActivityRow[];
      elapsedMs: number;
    }
  | {
      requestId: number;
      status: "error";
      error: string;
    };

type ModifierReportWorkerScope = {
  onmessage: ((event: MessageEvent<ModifierReportWorkerRequest>) => void) | null;
  postMessage(message: ModifierReportWorkerResponse): void;
};

const workerScope = self as unknown as ModifierReportWorkerScope;

workerScope.onmessage = (event: MessageEvent<ModifierReportWorkerRequest>) => {
  const { requestId, entity, elapsedSecs, options } = event.data;
  const startedAt = performance.now();
  workerScope.postMessage({
    requestId,
    status: "started",
    buckets: entity.modifierHitBuckets?.length ?? 0,
  } satisfies ModifierReportWorkerResponse);
  try {
    const rows = buildModifierActivityRowsFast(entity, elapsedSecs, options);
    workerScope.postMessage({
      requestId,
      status: "ok",
      rows,
      elapsedMs: performance.now() - startedAt,
    } satisfies ModifierReportWorkerResponse);
  } catch (err) {
    workerScope.postMessage({
      requestId,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    } satisfies ModifierReportWorkerResponse);
  }
};

export {};
