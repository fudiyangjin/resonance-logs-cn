import { listen } from "@tauri-apps/api/event";
import { commands, type UpdateStatus } from "$lib/bindings";

export const UPDATE = $state({
  status: null as UpdateStatus | null,
  requestPending: false,
  connectionError: null as string | null,
});

function acceptStatus(status: UpdateStatus) {
  if (!UPDATE.status || status.revision > UPDATE.status.revision) {
    UPDATE.status = status;
  }
}

/** Subscribe before reading the snapshot so a fast startup check cannot be lost. */
export async function connectUpdates(): Promise<() => void> {
  const unlisten = await listen<UpdateStatus>(
    "update-status-changed",
    (event) => {
      acceptStatus(event.payload);
      UPDATE.connectionError = null;
    },
  );
  try {
    acceptStatus(await commands.getUpdateStatus());
    UPDATE.connectionError = null;
    return unlisten;
  } catch (error) {
    unlisten();
    throw error;
  }
}

export function reportUpdateConnectionError(error: unknown) {
  UPDATE.connectionError = String(error);
  console.error("[updater]", error);
}

/** Commands only request work; the Rust task owns the download and installation. */
export async function requestUpdate() {
  if (UPDATE.requestPending) return;
  UPDATE.requestPending = true;
  try {
    const status = UPDATE.status;
    if (
      !status ||
      status.phase === "idle" ||
      status.phase === "upToDate" ||
      (status.phase === "failed" && !status.version)
    ) {
      acceptStatus(await commands.checkForUpdates());
    } else if (status.phase === "available" || status.phase === "failed") {
      const result = await commands.startUpdate();
      if (result.status === "error") throw new Error(result.error);
      acceptStatus(result.data);
    }
    UPDATE.connectionError = null;
  } catch (error) {
    reportUpdateConnectionError(error);
  } finally {
    UPDATE.requestPending = false;
  }
}
