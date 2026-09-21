import type { VoiceRuntimeSnapshot } from "$lib/bindings";

/** Debounced, serial, latest-value delivery. Only successful IPC is deduplicated. */
export function createVoiceSnapshotSync(
  send: (snapshot: VoiceRuntimeSnapshot) => Promise<void>,
  reportError: (error: unknown) => void,
) {
  let desired: { snapshot: VoiceRuntimeSnapshot; key: string } | null = null;
  let applied = "";
  let sending = false;
  let disposed = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(delay: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  }

  async function flush() {
    if (sending || disposed || !desired || desired.key === applied) return;
    const next = desired;
    sending = true;
    let failed = false;
    try {
      await send(next.snapshot);
      applied = next.key;
      failures = 0;
    } catch (error) {
      failed = true;
      failures++;
      reportError(error);
    } finally {
      sending = false;
      if (!disposed && desired.key !== applied) {
        if (desired.key !== next.key) schedule(50);
        else if (failed && failures <= 2)
          schedule(failures === 1 ? 250 : 1_000);
      }
    }
  }

  return {
    queue(snapshot: VoiceRuntimeSnapshot) {
      const key = JSON.stringify(snapshot);
      desired = { snapshot, key };
      failures = 0;
      if (key !== applied) schedule(50);
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
