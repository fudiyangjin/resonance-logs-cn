import {
  encodeCurvePick,
  encodePlayerPick,
  nextCurveMode,
  resolveCurvePick,
  resolvePlayerPick,
  type CurvePick,
  type HistoryViewPrefs,
  type PickCandidate,
  type PlayerPick,
} from "$lib/history-view-prefs";
import type { TeammateCurveMode } from "./timeline-data";
import type { BuffGrouping } from "./timeline-types";

/** A remembered value the selection reads (reactively) and writes. The chart
 * binds these to `SETTINGS.historyView`, so every pick survives leaving the
 * page and restarting the app. */
export type PrefBinding<T> = { get(): T; set(value: T): void };

/**
 * Multi-select over the players of one picker, stored as intent (default /
 * all / "me + these players") and resolved against the current encounter.
 * Lane teammates and buff owners each own one instance, so the two pickers
 * stay independent while sharing one implementation.
 */
export class PlayerSelection {
  readonly #candidates: () => readonly PickCandidate[];
  readonly #defaults: () => readonly string[];
  readonly #pick: PrefBinding<PlayerPick>;

  constructor(options: {
    candidates: () => readonly PickCandidate[];
    defaults: () => readonly string[];
    pick: PrefBinding<PlayerPick>;
  }) {
    this.#candidates = options.candidates;
    this.#defaults = options.defaults;
    this.#pick = options.pick;
  }

  /** Plain getter: every source is already reactive (callers memoize with
   * `$derived` where it matters), so there is nothing to cache here. */
  get uuids(): readonly string[] {
    return resolvePlayerPick(
      this.#pick.get(),
      this.#candidates(),
      this.#defaults(),
    );
  }

  has(uuid: string): boolean {
    return this.uuids.includes(uuid);
  }

  toggle(uuid: string) {
    const current = this.uuids;
    const next = current.includes(uuid)
      ? current.filter((selected) => selected !== uuid)
      : [...current, uuid];
    this.#pick.set(encodePlayerPick(next, this.#candidates()));
  }

  /** Remembered as "everyone", so it also applies to other parties. */
  setAll() {
    this.#pick.set({ kind: "all" });
  }

  clear() {
    this.#pick.set({ kind: "custom", self: false, uuids: [] });
  }
}

/** Teammate DPS curves: one reading per selected teammate. */
export class CurveSelection {
  readonly #candidates: () => readonly { entityUuid: string }[];
  readonly #pick: PrefBinding<CurvePick>;

  constructor(options: {
    candidates: () => readonly { entityUuid: string }[];
    pick: PrefBinding<CurvePick>;
  }) {
    this.#candidates = options.candidates;
    this.#pick = options.pick;
  }

  get modes(): Map<string, TeammateCurveMode> {
    return resolveCurvePick(this.#pick.get(), this.#candidates());
  }

  /** Off → average → instant → off. */
  cycle(uuid: string) {
    const modes = this.modes;
    const next = nextCurveMode(modes.get(uuid));
    if (next) modes.set(uuid, next);
    else modes.delete(uuid);
    this.#pick.set(encodeCurvePick(modes));
  }

  setAll() {
    this.#pick.set({ kind: "all" });
  }

  clear() {
    this.#pick.set({ kind: "custom", modes: {} });
  }
}

type BuffPrefs = HistoryViewPrefs["buff"];

/**
 * Buff section view state. Collapsing and choosing owners are independent:
 * the section starts collapsed with its default owners preselected, and
 * collapsing never forgets the picks.
 */
export class BuffViewState {
  readonly owners: PlayerSelection;
  readonly #buff: PrefBinding<BuffPrefs>;

  constructor(options: {
    buff: PrefBinding<BuffPrefs>;
    owners: () => readonly PickCandidate[];
    defaultOwners: () => readonly string[];
  }) {
    const buff = options.buff;
    this.#buff = buff;
    this.owners = new PlayerSelection({
      candidates: options.owners,
      defaults: options.defaultOwners,
      pick: {
        get: () => buff.get().owners,
        set: (owners) => buff.set({ ...buff.get(), owners }),
      },
    });
  }

  get expanded(): boolean {
    return this.#buff.get().expanded;
  }

  set expanded(expanded: boolean) {
    this.#buff.set({ ...this.#buff.get(), expanded });
  }

  get grouping(): BuffGrouping {
    return this.#buff.get().grouping;
  }

  set grouping(grouping: BuffGrouping) {
    this.#buff.set({ ...this.#buff.get(), grouping });
  }

  toggleExpanded() {
    this.expanded = !this.expanded;
  }
}
