/**
 * @file Pure helpers behind the live window's history picker: filter DTO
 * construction, newest-first list navigation, day grouping and live route
 * classification. Kept free of runes so they can be unit tested.
 */
import type { EncounterFiltersDto } from "$lib/bindings";

export type LiveHistoryFilters = {
  sceneIds: number[];
  bossIds: number[];
  players: string[];
  playerUids: number[];
  favoriteOnly: boolean;
  todayOnly: boolean;
};

export function emptyLiveHistoryFilters(): LiveHistoryFilters {
  return {
    sceneIds: [],
    bossIds: [],
    players: [],
    playerUids: [],
    favoriteOnly: false,
    todayOnly: false,
  };
}

export function hasLiveHistoryFilters(filters: LiveHistoryFilters): boolean {
  return (
    filters.sceneIds.length > 0 ||
    filters.bossIds.length > 0 ||
    filters.players.length > 0 ||
    filters.playerUids.length > 0 ||
    filters.favoriteOnly ||
    filters.todayOnly
  );
}

/**
 * Read a player UID typed into a search box, with or without the `#` the
 * app prints before it. Only records saved since UIDs were stored match.
 */
export function parsePlayerUid(text: string): number | null {
  const digits = text.trim().replace(/^#/, "");
  if (!/^\d+$/.test(digits)) return null;
  const uid = Number(digits);
  return Number.isSafeInteger(uid) && uid > 0 ? uid : null;
}

export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Same semantics as the main history list: AND across kinds, OR within.
 * Player names and UIDs are one kind on the backend.
 */
export function buildEncounterFilters(
  filters: LiveHistoryFilters,
  nowMs: number,
): EncounterFiltersDto | null {
  if (!hasLiveHistoryFilters(filters)) return null;
  return {
    bossMonsterIds: filters.bossIds.length > 0 ? [...filters.bossIds] : null,
    sceneIds: filters.sceneIds.length > 0 ? [...filters.sceneIds] : null,
    playerName: null,
    playerNames: filters.players.length > 0 ? [...filters.players] : null,
    playerUids: filters.playerUids.length > 0 ? [...filters.playerUids] : null,
    dateFromMs: filters.todayOnly ? startOfLocalDay(nowMs) : null,
    dateToMs: null,
    isFavorite: filters.favoriteOnly ? true : null,
  };
}

export type NeighborDirection = "older" | "newer";

export type NeighborLookup =
  | { kind: "row"; index: number }
  /** The older neighbour lies past the loaded page; load more and retry. */
  | { kind: "unloaded" }
  | { kind: "none" };

/** Rows are newest first, so "older" moves down the list. */
export function neighborIndex(
  rows: readonly { id: number }[],
  encounterId: number,
  direction: NeighborDirection,
): NeighborLookup {
  const index = rows.findIndex((row) => row.id === encounterId);
  if (index < 0) return { kind: "none" };
  if (direction === "newer") {
    return index > 0 ? { kind: "row", index: index - 1 } : { kind: "none" };
  }
  return index + 1 < rows.length
    ? { kind: "row", index: index + 1 }
    : { kind: "unloaded" };
}

export type HistoryDayGroup<T> = {
  key: string;
  kind: "today" | "yesterday" | "date";
  dayMs: number;
  rows: T[];
};

/** Group consecutive newest-first rows by local calendar day. */
export function groupRowsByLocalDay<T extends { startedAtMs: number }>(
  rows: readonly T[],
  nowMs: number,
): HistoryDayGroup<T>[] {
  const today = startOfLocalDay(nowMs);
  const yesterday = startOfLocalDay(today - 1);
  const groups: HistoryDayGroup<T>[] = [];
  for (const row of rows) {
    const dayMs = startOfLocalDay(row.startedAtMs);
    const last = groups.at(-1);
    if (last && last.dayMs === dayMs) {
      last.rows.push(row);
      continue;
    }
    groups.push({
      key: String(dayMs),
      kind:
        dayMs === today ? "today" : dayMs === yesterday ? "yesterday" : "date",
      dayMs,
      rows: [row],
    });
  }
  return groups;
}

/** Case-insensitive substring match over grouped name options. */
export function matchNameOptions<T extends { label: string }>(
  options: readonly T[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return options
    .filter((option) => option.label.toLowerCase().includes(needle))
    .slice(0, limit);
}

/** Secondary line of a UID suggestion: "Name A / Name B · 12 fights". */
export function uidCandidateDetail(
  names: readonly string[],
  countLabel: string,
): string {
  return names.length > 0 ? `${names.join(" / ")} · ${countLabel}` : countLabel;
}

/**
 * Expand ids to every grouped option sharing a name with one of them, the
 * way the search box selects a whole option. Unknown ids are kept as-is.
 */
export function expandOptionIds(
  options: readonly { ids: number[] }[],
  ids: readonly number[],
): number[] {
  const wanted = new Set(ids);
  const expanded = new Set(ids);
  for (const option of options) {
    if (option.ids.some((id) => wanted.has(id))) {
      for (const id of option.ids) expanded.add(id);
    }
  }
  return [...expanded].sort((left, right) => left - right);
}

export function formatEncounterDuration(durationSeconds: number): string {
  const secs = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const LIVE_TAB_ROOTS = [
  "/live/dps",
  "/live/heal",
  "/live/tanked",
  "/live/death",
] as const;

export type LiveTabRoot = (typeof LIVE_TAB_ROOTS)[number];

export const LIVE_HISTORY_PATH = "/live/history";

function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function liveTabRoot(pathname: string): LiveTabRoot | null {
  const normalized = trimTrailingSlash(pathname);
  return (
    LIVE_TAB_ROOTS.find(
      (root) => normalized === root || normalized.startsWith(`${root}/`),
    ) ?? null
  );
}

/** A per-entity page under a tab whose query targets one source's entities. */
export function isLiveDrillDown(pathname: string): boolean {
  const root = liveTabRoot(pathname);
  return root !== null && trimTrailingSlash(pathname) !== root;
}

export function isLiveHistoryPath(pathname: string): boolean {
  const normalized = trimTrailingSlash(pathname);
  return (
    normalized === LIVE_HISTORY_PATH ||
    normalized.startsWith(`${LIVE_HISTORY_PATH}/`)
  );
}
