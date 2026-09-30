import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands, type TeamShareStatus } from "$lib/bindings";

const STATUS_EVENT = "team-share-status-changed";

/** Relay connection state for the main window's settings page. */
class TeamShareStatusStore {
  status = $state.raw<TeamShareStatus>({ state: "disabled" });
  #unlisten: UnlistenFn | null = null;
  #subscribers = 0;

  async subscribe(): Promise<() => void> {
    this.#subscribers += 1;
    if (this.#subscribers === 1) {
      this.#unlisten = await listen<TeamShareStatus>(STATUS_EVENT, (event) => {
        this.status = event.payload;
      });
      this.status = await commands.getTeamShareStatus();
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

export const teamShareStatus = new TeamShareStatusStore();
