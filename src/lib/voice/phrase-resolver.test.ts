import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoicePhraseMeta, VoiceRuntimeSnapshot } from "$lib/bindings";
import type { PhraseRequest, ResolvedPhrase } from "./compile";
import { createPhraseResolver } from "./phrase-resolver";
import { createVoiceSnapshotSync } from "./snapshot-sync";

const request = (name: string, text = name): PhraseRequest => ({
  name,
  text,
  language: "zhCn",
});
const phrase = (r: PhraseRequest): VoicePhraseMeta => ({
  ...r,
  id: r.name,
  activeAssetId: null,
  updatedAtMs: 1,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function tick() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

function harness() {
  const index: Record<string, ResolvedPhrase> = {};
  const upsert = vi.fn(async (r: PhraseRequest) => ({
    status: "ok" as const,
    data: phrase(r),
  }));
  const refresh = vi.fn();
  const reportError = vi.fn();
  const resolver = createPhraseResolver({
    ensureCatalog: async () => true,
    index: () => index,
    upsert,
    refresh,
    reportError,
    merge(p) {
      index[p.name] = { phraseId: p.id, text: p.text, language: p.language };
    },
  });
  return { resolver, upsert, refresh, reportError, index };
}

afterEach(() => vi.useRealTimers());

describe("shared phrase resolver", () => {
  it("serializes two new phrases, shares a preview, and refreshes once", async () => {
    const h = harness();
    const first = deferred<{ status: "ok"; data: VoicePhraseMeta }>();
    h.upsert.mockImplementationOnce(() => first.promise);
    h.resolver.sync([request("a"), request("b")], false);
    const preview = h.resolver.resolve(request("a"));
    expect(h.resolver.resolve(request("a"))).toBe(preview);
    await tick();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    first.resolve({ status: "ok", data: phrase(request("a")) });
    expect(await preview).toBe("a");
    await tick();
    expect(h.upsert.mock.calls.map(([r]) => r.name)).toEqual(["a", "b"]);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(Object.keys(h.index)).toEqual(["a", "b"]);
  });

  it("coalesces pending background text and pauses it during operations", async () => {
    const h = harness();
    h.resolver.sync([request("a", "old")], true);
    h.resolver.sync([request("a", "latest")], true);
    await tick();
    expect(h.upsert).not.toHaveBeenCalled();
    h.resolver.sync([request("a", "latest")], false);
    await tick();
    expect(h.upsert.mock.calls).toEqual([[request("a", "latest")]]);
  });

  it("refreshes confirmed work when a busy status pauses the remaining queue", async () => {
    const h = harness();
    const first = deferred<{ status: "ok"; data: VoicePhraseMeta }>();
    h.upsert.mockImplementationOnce(() => first.promise);
    h.resolver.sync([request("a"), request("b")], false);
    await tick();
    h.resolver.sync([request("a"), request("b")], true);
    first.resolve({ status: "ok", data: phrase(request("a")) });
    await tick();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    h.resolver.sync([request("b")], false);
    await tick();
    expect(h.upsert).toHaveBeenCalledTimes(2);
  });

  it("keeps the latest demand while an older response is in flight", async () => {
    const h = harness();
    const old = deferred<{ status: "ok"; data: VoicePhraseMeta }>();
    h.upsert.mockImplementationOnce(() => old.promise);
    h.resolver.sync([request("a", "old")], false);
    await tick();
    h.resolver.sync([request("a", "new")], false);
    old.resolve({ status: "ok", data: phrase(request("a", "old")) });
    await tick();
    expect(h.upsert.mock.calls.map(([r]) => r.text)).toEqual(["old", "new"]);
    expect(h.index["a"]?.text).toBe("new");
  });

  it.each([false, true])(
    "retains errors after bounded retries (retriable=%s)",
    async (retriable) => {
      vi.useFakeTimers();
      const h = harness();
      const failure = { code: "test", message: "failed", retriable };
      h.upsert.mockRejectedValue(failure);
      h.resolver.sync([request("a")], false);
      await tick();
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(1_000);
      const attempts = retriable ? 3 : 1;
      expect(h.upsert).toHaveBeenCalledTimes(attempts);
      for (let i = 0; i < 5; i++) h.resolver.sync([request("a")], false);
      await vi.runAllTimersAsync();
      expect(h.upsert).toHaveBeenCalledTimes(attempts);
      h.upsert.mockResolvedValue({ status: "ok", data: phrase(request("a")) });
      expect(await h.resolver.resolve(request("a"))).toBe("a");
      expect(h.reportError).toHaveBeenCalledWith(failure);
    },
  );

  it("cancels a retry and unstarted background jobs on cleanup", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.upsert.mockRejectedValue({ retriable: true });
    h.resolver.sync([request("a")], false);
    await tick();
    h.resolver.cancelBackground();
    await vi.runAllTimersAsync();
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("bounds initialization failures and cancels work still awaiting initialization", async () => {
    vi.useFakeTimers();
    const ensureCatalog = vi.fn(async () => false);
    const upsert = vi.fn(async (r: PhraseRequest) => ({
      status: "ok" as const,
      data: phrase(r),
    }));
    const resolver = createPhraseResolver({
      ensureCatalog,
      index: () => ({}),
      upsert,
      merge: vi.fn(),
      refresh: vi.fn(),
      reportError: vi.fn(),
    });
    resolver.sync([request("a")], false);
    await tick();
    await vi.runAllTimersAsync();
    expect(ensureCatalog).toHaveBeenCalledTimes(3);
    expect(upsert).not.toHaveBeenCalled();
    const pending = deferred<boolean>();
    ensureCatalog.mockImplementation(() => pending.promise);
    resolver.sync([request("b")], false);
    await tick();
    resolver.cancelBackground();
    pending.resolve(true);
    await tick();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("waits for catalog initialization and uses the full returned metadata", async () => {
    const ready = deferred<boolean>();
    const upsert = vi.fn(async () => ({
      status: "ok" as const,
      data: phrase(request("canonical", "server text")),
    }));
    const merge = vi.fn();
    const resolver = createPhraseResolver({
      ensureCatalog: () => ready.promise,
      index: () => ({}),
      upsert,
      merge,
      refresh: vi.fn(),
      reportError: vi.fn(),
    });
    resolver.sync([request("a")], false);
    await tick();
    expect(upsert).not.toHaveBeenCalled();
    ready.resolve(true);
    await tick();
    expect(merge).toHaveBeenCalledWith(
      phrase(request("canonical", "server text")),
    );
  });
});

describe("runtime snapshot delivery", () => {
  const snapshot = (volume: number) => ({
    enabled: true,
    volume,
    queuePolicy: "dropLowPriority" as const,
    rules: [],
  });

  it("serializes IPC and coalesces edits to the latest snapshot", async () => {
    vi.useFakeTimers();
    const pending = deferred<void>();
    const send = vi
      .fn(async (_snapshot: VoiceRuntimeSnapshot) => {})
      .mockImplementationOnce(() => pending.promise);
    const lane = createVoiceSnapshotSync(send, vi.fn());
    lane.queue(snapshot(0.1));
    await vi.advanceTimersByTimeAsync(50);
    lane.queue(snapshot(0.2));
    lane.queue(snapshot(0.3));
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(50);
    expect(send.mock.calls.map(([s]) => s.volume)).toEqual([0.1, 0.3]);
    lane.dispose();
  });

  it("retries a failed snapshot and deduplicates only successful delivery", async () => {
    vi.useFakeTimers();
    const send = vi
      .fn(async (_snapshot: VoiceRuntimeSnapshot) => {})
      .mockRejectedValueOnce(new Error("IPC failed"));
    const lane = createVoiceSnapshotSync(send, vi.fn());
    lane.queue(snapshot(0.1));
    await vi.advanceTimersByTimeAsync(50 + 250);
    expect(send).toHaveBeenCalledTimes(2);
    lane.queue(snapshot(0.1));
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(2);
    lane.dispose();
  });
});
