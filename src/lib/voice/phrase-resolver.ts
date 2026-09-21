import type { Result, VoiceCommandError, VoicePhraseMeta } from "$lib/bindings";
import type { PhraseIndex, PhraseRequest } from "./compile";

type Job = {
  request: PhraseRequest;
  key: string;
  background: boolean;
  attempts: number;
  retryAt: number;
  promise: Promise<string | null>;
  finish: (id: string | null) => void;
};

type Dependencies = {
  ensureCatalog: () => Promise<boolean>;
  index: () => PhraseIndex;
  upsert: (
    request: PhraseRequest,
  ) => Promise<Result<VoicePhraseMeta, VoiceCommandError>>;
  merge: (phrase: VoicePhraseMeta) => void;
  refresh: () => void;
  reportError: (error: VoiceCommandError | null) => void;
};

const RETRY_DELAYS = [250, 1_000];
const requestKey = (request: PhraseRequest) =>
  JSON.stringify([request.name, request.text, request.language]);

/** One serial IPC lane shared by background bindings and interactive callers. */
export function createPhraseResolver(deps: Dependencies) {
  const jobs = new Map<string, Job>();
  const failures = new Map<string, VoiceCommandError>();
  let queue: Job[] = [];
  let active: Job | null = null;
  let paused = false;
  let wanted = new Set<string>();
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function reportFailures() {
    deps.reportError(failures.values().next().value ?? null);
  }

  function settle(job: Job, id: string | null) {
    jobs.delete(job.key);
    job.finish(id);
  }

  function cancelPendingBackground(keep: ReadonlySet<string>) {
    queue = queue.filter((job) => {
      if (!job.background || keep.has(job.key)) return true;
      settle(job, null);
      return false;
    });
  }

  function kick() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (active) return;
    const eligible = queue.filter((job) => !job.background || !paused);
    const now = Date.now();
    // Interactive work can overtake pending background work, but never an IPC.
    const job =
      eligible.find((job) => !job.background && job.retryAt <= now) ??
      eligible.find((job) => job.retryAt <= now);
    if (!job) {
      if (eligible.length > 0) {
        timer = setTimeout(
          kick,
          Math.max(0, Math.min(...eligible.map((job) => job.retryAt)) - now),
        );
      } else if (dirty && (queue.length === 0 || paused)) {
        // A status response can report our own upsert as busy. Reconcile
        // a paused batch too, so stale operation state cannot strand its tail.
        dirty = false;
        deps.refresh();
      }
      return;
    }
    queue.splice(queue.indexOf(job), 1);
    active = job;
    // Defer dependency reads outside the effect that submitted the work.
    void Promise.resolve().then(async () => {
      try {
        job.attempts++;
        if (!(await deps.ensureCatalog())) {
          throw {
            code: "status",
            message: "voice catalog is unavailable",
            retriable: true,
          };
        }
        // Operations may have started during initialization. Leave background
        // work pending without spending an attempt or claiming stale success.
        if (job.background && !wanted.has(job.key)) {
          settle(job, null);
          return;
        }
        if (job.background && paused) {
          job.attempts--;
          queue.unshift(job);
          return;
        }
        const known = deps.index()[job.request.name];
        if (
          known?.text === job.request.text &&
          known.language === job.request.language
        ) {
          settle(job, known.phraseId);
          return;
        }
        const result = await deps.upsert(job.request);
        if (result.status !== "ok") throw result.error;
        deps.merge(result.data);
        dirty = true;
        if (failures.delete(job.key)) reportFailures();
        settle(job, result.data.id);
      } catch (error) {
        if (job.background && !wanted.has(job.key)) {
          settle(job, null);
          return;
        }
        const failure: VoiceCommandError =
          typeof error === "object" && error !== null && "retriable" in error
            ? (error as VoiceCommandError)
            : { code: "ipc", message: String(error), retriable: true };
        const delay = RETRY_DELAYS[job.attempts - 1];
        if (failure.retriable && delay !== undefined) {
          job.retryAt = Date.now() + delay;
          queue.push(job);
        } else {
          failures.set(job.key, failure);
          reportFailures();
          settle(job, null);
        }
      } finally {
        active = null;
        kick();
      }
    });
  }

  function resolve(
    request: PhraseRequest,
    background = false,
  ): Promise<string | null> {
    const key = requestKey(request);
    const shared = jobs.get(key);
    if (shared) {
      if (!background) shared.background = false;
      kick();
      return shared.promise;
    }
    if (background && failures.has(key)) return Promise.resolve(null);
    if (!background && failures.delete(key)) reportFailures(); // An explicit action is a retry.
    let finish!: Job["finish"];
    const promise = new Promise<string | null>((resolve) => {
      finish = resolve;
    });
    const job: Job = {
      request,
      key,
      background,
      attempts: 0,
      retryAt: 0,
      promise,
      finish,
    };
    jobs.set(key, job);
    queue.push(job);
    kick();
    return promise;
  }

  return {
    resolve: (request: PhraseRequest) => resolve(request),
    sync(requests: readonly PhraseRequest[], busy: boolean) {
      paused = busy;
      const keys = new Set(requests.map(requestKey));
      wanted = keys;
      cancelPendingBackground(keys);
      for (const key of failures.keys()) {
        if (!keys.has(key)) {
          failures.delete(key);
          reportFailures();
        }
      }
      for (const request of requests) void resolve(request, true);
      kick();
    },
    cancelBackground() {
      paused = true;
      wanted.clear();
      cancelPendingBackground(new Set());
      kick();
    },
  };
}
