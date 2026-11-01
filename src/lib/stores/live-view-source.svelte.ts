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
  type HistoryBuffTimelineView,
  type HistoryDamageTarget,
  type LiveHistorySnapshot,
} from "$lib/history-derived";
import { t } from "$lib/i18n/index.svelte";
import {
  isLiveCoveragePath,
  LIVE_COVERAGE_PATH,
  liveTabRoot,
  type LiveTabRoot,
} from "$lib/live-history-query";
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
  /** Last meter tab visited; returning to live data always lands here. */
  returnTab = $state.raw<LiveTabRoot>("/live/dps");
  /** History only: narrow damage to one target (`null` = whole encounter). */
  targetUuid = $state.raw<string | null>(null);
  /**
   * Coverage page player pick (`null` = local player). Kept across
   * encounters: the page falls back to the local player while the picked
   * one is absent, and shows them again once they are back.
   */
  coveragePlayerUuid = $state.raw<string | null>(null);
  /** The coverage page, not a meter tab, was the last page visited. */
  #coverageLast = $state.raw(false);

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

  /** History only; `null` also for encounters recorded before coverage. */
  get buffCoverage(): HistoryBuffTimelineView | null {
    return this.history?.buffCoverage ?? null;
  }

  /**
   * Where the picker and source switches land: the coverage page while a
   * saved encounter is shown and it was the last page, else the meter tab.
   */
  get returnPath(): LiveTabRoot | typeof LIVE_COVERAGE_PATH {
    return this.isHistory && this.#coverageLast
      ? LIVE_COVERAGE_PATH
      : this.returnTab;
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
    this.coveragePlayerUuid = null;
    this.#coverageLast = false;
    this.#state = { kind: "live" };
  }

  setTarget(targetUuid: string | null): void {
    this.targetUuid = targetUuid;
  }

  setCoveragePlayer(entityUuid: string | null): void {
    this.coveragePlayerUuid = entityUuid;
  }

  rememberTab(pathname: string): void {
    if (isLiveCoveragePath(pathname)) {
      this.#coverageLast = true;
      return;
    }
    const root = liveTabRoot(pathname);
    if (root) {
      this.returnTab = root;
      this.#coverageLast = false;
    }
  }
}

export const liveView = new LiveViewSource();
