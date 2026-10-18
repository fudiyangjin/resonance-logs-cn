import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands, type HpReportStatus } from "$lib/bindings";

const STATUS_EVENT = "hp-report-status-changed";

/** Boss HP report connection state for the main window's settings page. */
class HpReportStatusStore {
  status = $state.raw<HpReportStatus>({ state: "disabled" });
  #unlisten: UnlistenFn | null = null;
  #subscribers = 0;

  async subscribe(): Promise<() => void> {
    this.#subscribers += 1;
    if (this.#subscribers === 1) {
      this.#unlisten = await listen<HpReportStatus>(STATUS_EVENT, (event) => {
        this.status = event.payload;
      });
      this.status = await commands.getHpReportStatus();
    }
    return () => this.#release();
  }

  #release(): void {
    this.#subscribers = Math.max(0, this.#subscribers - 1);
    if (this.#subscribers === 0) {
      this.#unlisten?.();
      this.#unlisten = null;
    }
  }
}

export const hpReportStatus = new HpReportStatusStore();
