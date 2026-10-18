import { commands, type EncounterSummaryDto } from "$lib/bindings";
import {
  getBossOptions,
  getSceneOptions,
  type NameOption,
} from "$lib/config/game-names";
import { t } from "$lib/i18n/index.svelte";
import {
  buildEncounterFilters,
  emptyLiveHistoryFilters,
  neighborIndex,
  type LiveHistoryFilters,
  type NeighborDirection,
} from "$lib/live-history-query";

const PAGE_SIZE = 20;

type QueryStatus = "idle" | "loading" | "ready" | "error";
type IdFilterKey = "sceneIds" | "bossIds";

function sortedUnion(current: number[], ids: number[]): number[] {
  return [...new Set([...current, ...ids])].sort((left, right) => left - right);
}

/**
 * Filters and paged results of the live window's history picker. Module
 * state, so reopening the picker keeps the last query; the banner's
 * older / newer buttons step through the same result list.
 */
class LiveHistoryQuery {
  filters = $state<LiveHistoryFilters>(emptyLiveHistoryFilters());
  rows = $state.raw<EncounterSummaryDto[]>([]);
  totalCount = $state.raw(0);
  status = $state.raw<QueryStatus>("idle");
  errorMessage = $state.raw<string | null>(null);
  sceneOptions = $state.raw<NameOption[]>([]);
  bossOptions = $state.raw<NameOption[]>([]);

  #generation = 0;
  #optionsPromise: Promise<void> | null = null;

  get hasMore(): boolean {
    return this.rows.length < this.totalCount;
  }

  get loading(): boolean {
    return this.status === "loading";
  }

  reload(): Promise<void> {
    return this.#fetch(0);
  }

  loadMore(): Promise<void> {
    if (!this.hasMore || this.loading) return Promise.resolve();
    return this.#fetch(this.rows.length);
  }

  ensureOptions(): Promise<void> {
    this.#optionsPromise ??= this.#loadOptions();
    return this.#optionsPromise;
  }

  hasNeighbor(encounterId: number, direction: NeighborDirection): boolean {
    const lookup = neighborIndex(this.rows, encounterId, direction);
    return (
      lookup.kind === "row" || (lookup.kind === "unloaded" && this.hasMore)
    );
  }

  /** Adjacent viewable row, skipping ones whose detail was pruned. */
  async neighbor(
    encounterId: number,
    direction: NeighborDirection,
  ): Promise<EncounterSummaryDto | null> {
    let currentId = encounterId;
    for (;;) {
      let lookup = neighborIndex(this.rows, currentId, direction);
      if (lookup.kind === "unloaded" && this.hasMore) {
        await this.loadMore();
        lookup = neighborIndex(this.rows, currentId, direction);
      }
      const row = lookup.kind === "row" ? this.rows[lookup.index] : undefined;
      if (!row) return null;
      if (row.detailAvailable) return row;
      currentId = row.id;
    }
  }

  /** Whether every id is already part of the scene / boss filter. */
  includesIds(key: IdFilterKey, ids: number[]): boolean {
    const selected = new Set(this.filters[key]);
    return ids.length > 0 && ids.every((id) => selected.has(id));
  }

  addIds(key: IdFilterKey, ids: number[]): void {
    const next = sortedUnion(this.filters[key], ids);
    if (next.length === this.filters[key].length) return;
    this.filters[key] = next;
    void this.reload();
  }

  removeIds(key: IdFilterKey, ids: number[]): void {
    const remove = new Set(ids);
    this.filters[key] = this.filters[key].filter((id) => !remove.has(id));
    void this.reload();
  }

  toggleIds(key: IdFilterKey, ids: number[]): void {
    if (this.includesIds(key, ids)) {
      this.removeIds(key, ids);
    } else {
      this.addIds(key, ids);
    }
  }

  addPlayer(name: string): void {
    if (this.filters.players.includes(name)) return;
    this.filters.players.push(name);
    void this.reload();
  }

  removePlayer(name: string): void {
    this.filters.players = this.filters.players.filter(
      (player) => player !== name,
    );
    void this.reload();
  }

  addPlayerUid(uid: number): void {
    if (this.filters.playerUids.includes(uid)) return;
    this.filters.playerUids.push(uid);
    void this.reload();
  }

  removePlayerUid(uid: number): void {
    this.filters.playerUids = this.filters.playerUids.filter(
      (playerUid) => playerUid !== uid,
    );
    void this.reload();
  }

  toggleFlag(key: "favoriteOnly" | "todayOnly"): void {
    this.filters[key] = !this.filters[key];
    void this.reload();
  }

  clearFilters(): void {
    this.filters = emptyLiveHistoryFilters();
    void this.reload();
  }

  async #fetch(offset: number): Promise<void> {
    const generation = ++this.#generation;
    this.status = "loading";
    const filters = buildEncounterFilters(
      $state.snapshot(this.filters),
      Date.now(),
    );
    try {
      const result = await commands.getRecentEncountersFiltered(
        PAGE_SIZE,
        offset,
        filters,
      );
      if (generation !== this.#generation) return;
      if (result.status === "error") throw new Error(result.error);

      if (offset === 0) {
        this.rows = result.data.rows;
      } else {
        // A fight saved between pages shifts the offset; drop the repeats.
        const known = new Set(this.rows.map((row) => row.id));
        this.rows = [
          ...this.rows,
          ...result.data.rows.filter((row) => !known.has(row.id)),
        ];
      }
      this.totalCount = result.data.totalCount;
      this.errorMessage = null;
      this.status = "ready";
    } catch (error) {
      if (generation !== this.#generation) return;
      this.errorMessage = t("live.history.listFailed", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.status = "error";
    }
  }

  async #loadOptions(): Promise<void> {
    try {
      const [scenes, bosses] = await Promise.all([
        commands.getUniqueSceneIds(),
        commands.getUniqueBossMonsterIds(),
      ]);
      this.sceneOptions =
        scenes.status === "ok" ? getSceneOptions(scenes.data.ids ?? []) : [];
      this.bossOptions =
        bosses.status === "ok" ? getBossOptions(bosses.data.ids ?? []) : [];
      if (scenes.status === "error" || bosses.status === "error") {
        this.#optionsPromise = null;
      }
    } catch (error) {
      console.error("[live-history] failed to load search options", error);
      this.#optionsPromise = null;
    }
  }
}

export const liveHistoryQuery = new LiveHistoryQuery();
