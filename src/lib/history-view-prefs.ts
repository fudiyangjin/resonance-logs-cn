/**
 * Remembered choices of the main-window history detail page (timeline
 * selectors, buff section, coverage summary), persisted in their own small
 * store (`SETTINGS.historyView`).
 *
 * Deliberately not part of `SETTINGS.history.general`: that store is
 * mirrored into each loadout's live-meter profile and exported with
 * loadouts, which would make these choices change with the loadout and leak
 * teammates' ids into shared loadout files.
 *
 * Choices are stored as intent ("everyone", "me + these players", "never
 * touched") and resolved against each encounter's party, so they carry over
 * to other fights. Player entity ids derive from the character id, so the
 * same teammate is recognised across encounters; the local player is a
 * separate `self` flag so it also follows a different character.
 */
import type { TeammateCurveMode } from "$lib/components/encounter-timeline/timeline-data";
import type { BuffGrouping } from "$lib/components/encounter-timeline/timeline-types";

export type PlayerPick =
  /** Never touched: follow the page's default. */
  | { kind: "default" }
  /** "Select all": everyone present. */
  | { kind: "all" }
  /** Manual picks; cleared = `{ self: false, uuids: [] }`. */
  | { kind: "custom"; self: boolean; uuids: string[] };

export type CurvePick =
  /** "Select all": every teammate's average curve. */
  | { kind: "all" }
  | { kind: "custom"; modes: Record<string, TeammateCurveMode> };

export type HistoryViewPrefs = {
  showAverageCurve: boolean;
  /** Teammate cast lanes. */
  lanes: PlayerPick;
  /** Teammate DPS curves (each with its reading). */
  curves: CurvePick;
  buff: { expanded: boolean; grouping: BuffGrouping; owners: PlayerPick };
  /** Whether the coverage summary below the player table is open. */
  coverageTableOpen: boolean;
};

export type PickCandidate = { entityUuid: string; isLocalPlayer: boolean };

export function createDefaultHistoryViewPrefs(): HistoryViewPrefs {
  return {
    showAverageCurve: true,
    lanes: { kind: "default" },
    curves: { kind: "custom", modes: {} },
    buff: {
      expanded: false,
      grouping: "player",
      owners: { kind: "default" },
    },
    coverageTableOpen: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCurveMode(value: unknown): value is TeammateCurveMode {
  return value === "average" || value === "instant";
}

export function parsePlayerPick(value: unknown): PlayerPick {
  if (!isRecord(value)) return { kind: "default" };
  if (value["kind"] === "all") return { kind: "all" };
  if (value["kind"] === "custom") {
    return {
      kind: "custom",
      self: value["self"] === true,
      uuids: Array.isArray(value["uuids"])
        ? value["uuids"].filter(
            (uuid): uuid is string => typeof uuid === "string",
          )
        : [],
    };
  }
  return { kind: "default" };
}

export function parseCurvePick(value: unknown): CurvePick {
  if (isRecord(value) && value["kind"] === "all") return { kind: "all" };
  const modes: Record<string, TeammateCurveMode> = {};
  if (isRecord(value) && isRecord(value["modes"])) {
    for (const [uuid, mode] of Object.entries(value["modes"])) {
      if (isCurveMode(mode)) modes[uuid] = mode;
    }
  }
  return { kind: "custom", modes };
}

/** Normalizes whatever the store holds (hand-edited or older files) field by
 * field, falling back to defaults instead of throwing. */
export function parseHistoryViewPrefs(value: unknown): HistoryViewPrefs {
  const defaults = createDefaultHistoryViewPrefs();
  if (!isRecord(value)) return defaults;
  const buff: Record<string, unknown> = isRecord(value["buff"])
    ? value["buff"]
    : {};
  return {
    showAverageCurve:
      typeof value["showAverageCurve"] === "boolean"
        ? value["showAverageCurve"]
        : defaults.showAverageCurve,
    lanes: parsePlayerPick(value["lanes"]),
    curves: parseCurvePick(value["curves"]),
    buff: {
      expanded: buff["expanded"] === true,
      grouping: buff["grouping"] === "buff" ? "buff" : "player",
      owners: parsePlayerPick(buff["owners"]),
    },
    coverageTableOpen: value["coverageTableOpen"] === true,
  };
}

/** The players a pick selects in this encounter, in `candidates` order.
 * Remembered picks of which nobody is present fall back to the default (a
 * different party should still get the useful default rows); an explicit
 * "clear" stays empty. */
export function resolvePlayerPick(
  pick: PlayerPick,
  candidates: readonly PickCandidate[],
  defaults: readonly string[],
): string[] {
  switch (pick.kind) {
    case "default":
      return [...defaults];
    case "all":
      return candidates.map((candidate) => candidate.entityUuid);
    case "custom": {
      const wanted = new Set(pick.uuids);
      const selected = candidates
        .filter((candidate) =>
          candidate.isLocalPlayer
            ? pick.self
            : wanted.has(candidate.entityUuid),
        )
        .map((candidate) => candidate.entityUuid);
      const remembersSomeone = pick.self || pick.uuids.length > 0;
      return selected.length === 0 && remembersSomeone
        ? [...defaults]
        : selected;
    }
  }
}

/** Records a manual selection. Only players present now are kept, so the
 * remembered set stays small and means "who I picked last time". */
export function encodePlayerPick(
  selected: readonly string[],
  candidates: readonly PickCandidate[],
): PlayerPick {
  const chosen = new Set(selected);
  return {
    kind: "custom",
    self: candidates.some(
      (candidate) =>
        candidate.isLocalPlayer && chosen.has(candidate.entityUuid),
    ),
    uuids: candidates
      .filter(
        (candidate) =>
          !candidate.isLocalPlayer && chosen.has(candidate.entityUuid),
      )
      .map((candidate) => candidate.entityUuid),
  };
}

/** Curve reading per teammate present in this encounter, in `candidates`
 * order. */
export function resolveCurvePick(
  pick: CurvePick,
  candidates: readonly { entityUuid: string }[],
): Map<string, TeammateCurveMode> {
  const modes = new Map<string, TeammateCurveMode>();
  for (const { entityUuid } of candidates) {
    const mode = pick.kind === "all" ? "average" : pick.modes[entityUuid];
    if (mode) modes.set(entityUuid, mode);
  }
  return modes;
}

/** Off → average → instant → off. */
export function nextCurveMode(
  mode: TeammateCurveMode | undefined,
): TeammateCurveMode | undefined {
  if (mode === undefined) return "average";
  return mode === "average" ? "instant" : undefined;
}

export function encodeCurvePick(
  modes: ReadonlyMap<string, TeammateCurveMode>,
): CurvePick {
  return { kind: "custom", modes: Object.fromEntries(modes) };
}
