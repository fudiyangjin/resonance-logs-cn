import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "$lib/bindings";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  getUpdateStatus: vi.fn(),
  checkForUpdates: vi.fn(),
  startUpdate: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("$lib/bindings", () => ({ commands: mocks }));

import { UPDATE, connectUpdates, requestUpdate } from "./update-store.svelte";

function status(
  revision: number,
  phase: UpdateStatus["phase"],
  version: string | null = null,
): UpdateStatus {
  return {
    revision,
    phase,
    version,
    downloadedBytes: 0,
    totalBytes: null,
    error: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  UPDATE.status = null;
  UPDATE.requestPending = false;
  UPDATE.connectionError = null;
});

describe("update status connection", () => {
  it("keeps a newer event when the initial snapshot arrives late", async () => {
    let onStatus!: (event: { payload: UpdateStatus }) => void;
    let resolveSnapshot!: (value: UpdateStatus) => void;
    const stop = vi.fn();
    mocks.listen.mockImplementation(async (_event, callback) => {
      onStatus = callback;
      return stop;
    });
    mocks.getUpdateStatus.mockReturnValue(
      new Promise<UpdateStatus>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const connection = connectUpdates();
    await Promise.resolve();
    onStatus({
      payload: { ...status(5, "downloading", "1.0.0"), downloadedBytes: 300 },
    });
    resolveSnapshot(status(3, "available", "1.0.0"));
    const disconnect = await connection;
    expect(UPDATE.status?.phase).toBe("downloading");
    expect(UPDATE.status?.downloadedBytes).toBe(300);
    onStatus({ payload: status(4, "available", "1.0.0") });
    expect(UPDATE.status?.revision).toBe(5);
    disconnect();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("releases the event subscription when the snapshot request fails", async () => {
    const stop = vi.fn();
    mocks.listen.mockResolvedValue(stop);
    mocks.getUpdateStatus.mockRejectedValue(new Error("disconnected"));
    await expect(connectUpdates()).rejects.toThrow("disconnected");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("restores background download progress when reconnecting", async () => {
    mocks.listen.mockResolvedValue(vi.fn());
    mocks.getUpdateStatus.mockResolvedValue({
      ...status(30, "downloading", "1.0.0"),
      downloadedBytes: 4096,
    });
    await connectUpdates();
    expect(UPDATE.status?.downloadedBytes).toBe(4096);
    expect(UPDATE.status?.totalBytes).toBeNull();
    expect(mocks.startUpdate).not.toHaveBeenCalled();
  });
});

describe("update requests", () => {
  it("coalesces clicks until the backend accepts the task", async () => {
    UPDATE.status = status(2, "available", "1.0.0");
    let accept!: (value: unknown) => void;
    mocks.startUpdate.mockReturnValue(
      new Promise((resolve) => {
        accept = resolve;
      }),
    );
    const first = requestUpdate();
    await requestUpdate();
    expect(mocks.startUpdate).toHaveBeenCalledOnce();
    accept({ status: "ok", data: status(3, "downloading", "1.0.0") });
    await first;
    await requestUpdate();
    expect(mocks.startUpdate).toHaveBeenCalledOnce();
    expect(UPDATE.requestPending).toBe(false);
  });

  it("rechecks a failed check and retries a failed download without automatic loops", async () => {
    UPDATE.status = { ...status(2, "failed"), error: "offline" };
    mocks.checkForUpdates.mockResolvedValue(status(3, "checking"));
    await requestUpdate();
    expect(mocks.checkForUpdates).toHaveBeenCalledOnce();
    expect(mocks.startUpdate).not.toHaveBeenCalled();
    UPDATE.status = {
      ...status(5, "failed", "1.0.0"),
      error: "invalid signature",
    };
    mocks.startUpdate.mockResolvedValue({
      status: "ok",
      data: status(6, "downloading", "1.0.0"),
    });
    await requestUpdate();
    expect(mocks.startUpdate).toHaveBeenCalledOnce();
    expect(UPDATE.status?.error).toBeNull();
  });
});
