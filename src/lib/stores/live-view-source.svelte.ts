import {
  commands,
  type DeathRecord,
  type EncounterSummaryDto,
  type LiveDataPayload,
  type LiveDisplayClock,
  type TrainingDummyState,
} from "$lib/bindings";
import {
  historyCombatForTarget,
  historyDetailToLiveSnapshot,
  type HistoryDamageTarget,
  type LiveHistorySnapshot,
} from "$lib/history-derived";
import { t } from "$lib/i18n/index.svelte";
import { liveTabRoot, type LiveTabRoot } from "$lib/live-history-query";
import {
  liveCombatStore,
  liveDeathsStore,
} from "$lib/stores/live-topics.svelte";

type LiveViewState =
  | { kind: "live" }
  | { kind: "history"; snapshot: LiveHistorySnapshot };

export type OpenEncounterResult =
  | { status: "opened" }
  | { status: "superseded" }
  | { status: "failed"; message: string };

/**
 * What the live window displays: the pulled live topics, or one saved
 * encounter frozen into the same payload shapes.
 *
 * The live pull session keeps running underneath, so returning to live is
 * immediate. While a history snapshot is shown the getters never read the
 * live stores, so incoming live frames do not re-render the meter pages.
 */
class LiveViewSource {
  #state = $state.raw<LiveViewState>({ kind: "live" });
  #generation = 0;

  /** Encounter whose detail is being fetched, for row / banner spinners. */
  pendingEncounterId = $state.raw<number | null>(null);
  /** Last meter tab visited; history picker and source switches return here. */
  returnTab = $state.raw<LiveTabRoot>("/live/dps");
  /** History only: narrow damage to one target (`null` = whole encounter). */
  targetUuid = $state.raw<string | null>(null);

  #historyCombat = $derived.by(() => {
    const history = this.history;
    return history ? historyCombatForTarget(history, this.targetUuid) : null;
  });

  get history(): LiveHistorySnapshot | null {
    return this.#state.kind === "history" ? this.#state.snapshot : null;
  }

  get isHistory(): boolean {
    return this.#state.kind === "history";
  }

  /** Meter payload; in history mode damage follows the selected target. */
  get combat(): LiveDataPayload | null {
    return this.#historyCombat ?? liveCombatStore.data?.combat ?? null;
  }

  /** Whole-encounter payload regardless of the target, for the header. */
  get encounterCombat(): LiveDataPayload | null {
    const history = this.history;
    return history ? history.combat : (liveCombatStore.data?.combat ?? null);
  }

  get targets(): HistoryDamageTarget[] {
    return this.history?.targets ?? [];
  }

  get displayClock(): LiveDisplayClock | null {
    const history = this.history;
    return history
      ? history.displayClock
      : (liveCombatStore.data?.displayClock ?? null);
  }

  /** `null` in history mode: training-dummy state belongs to live runtime. */
  get training(): TrainingDummyState | null {
    return this.isHistory ? null : (liveCombatStore.data?.training ?? null);
  }

  get deaths(): DeathRecord[] {
    const history = this.history;
    return history ? history.deaths : (liveDeathsStore.data?.deaths ?? []);
  }

  /** Load one saved encounter; the current view stays until it arrives. */
  async open(summary: EncounterSummaryDto): Promise<OpenEncounterResult> {
    if (!summary.detailAvailable) {
      return { status: "failed", message: t("live.history.detailUnavailable") };
    }

    const generation = ++this.#generation;
    this.pendingEncounterId = summary.id;
    try {
      const result = await commands.getEncounterDetail(summary.id);
      if (generation !== this.#generation) return { status: "superseded" };
      if (result.status === "error") {
        return {
          status: "failed",
          message: t("live.history.loadFailed", { error: result.error }),
        };
      }
      if (!result.data.detailAvailable) {
        return {
          status: "failed",
          message: t("live.history.detailUnavailable"),
        };
      }
      this.#state = {
        kind: "history",
        snapshot: historyDetailToLiveSnapshot(result.data),
      };
      // Target ids are per encounter, so a new snapshot starts unfiltered.
      this.targetUuid = null;
      return { status: "opened" };
    } catch (error) {
      if (generation !== this.#generation) return { status: "superseded" };
      return {
        status: "failed",
        message: t("live.history.loadFailed", { error: String(error) }),
      };
    } finally {
      if (generation === this.#generation) this.pendingEncounterId = null;
    }
  }

  returnToLive(): void {
    this.#generation += 1;
    this.pendingEncounterId = null;
    this.targetUuid = null;
    this.#state = { kind: "live" };
  }

  setTarget(targetUuid: string | null): void {
    this.targetUuid = targetUuid;
  }

  rememberTab(pathname: string): void {
    const root = liveTabRoot(pathname);
    if (root) this.returnTab = root;
  }
}

export const liveView = new LiveViewSource();
