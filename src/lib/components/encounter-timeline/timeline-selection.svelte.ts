import type { BuffGrouping } from "./timeline-types";

/**
 * Multi-select over player uuids that follows a default until the user first
 * touches it. Lane teammates and buff owners each own one instance, so the
 * two pickers stay independent while sharing one implementation.
 */
export class PlayerSelection {
  /** null = untouched, follow the default; a list once the user interacts. */
  #manual = $state<readonly string[] | null>(null);
  readonly #defaults: () => readonly string[];

  constructor(defaults: () => readonly string[]) {
    this.#defaults = defaults;
  }

  /** Plain getter: both sources are already reactive (and the default is
   * typically a memoized `$derived`), so there is nothing to cache here. */
  get uuids(): readonly string[] {
    return this.#manual ?? this.#defaults();
  }

  has(uuid: string): boolean {
    return this.uuids.includes(uuid);
  }

  toggle(uuid: string) {
    this.#manual = this.has(uuid)
      ? this.uuids.filter((selected) => selected !== uuid)
      : [...this.uuids, uuid];
  }

  setAll(uuids: readonly string[]) {
    this.#manual = [...uuids];
  }

  clear() {
    this.#manual = [];
  }
}

/**
 * Buff section view state. Collapsing and choosing owners are independent:
 * the section starts collapsed with its default owners preselected, and
 * collapsing never forgets the picks.
 */
export class BuffViewState {
  expanded = $state(false);
  grouping = $state<BuffGrouping>("player");
  readonly owners: PlayerSelection;

  constructor(defaultOwners: () => readonly string[]) {
    this.owners = new PlayerSelection(defaultOwners);
  }

  toggleExpanded() {
    this.expanded = !this.expanded;
  }
}
