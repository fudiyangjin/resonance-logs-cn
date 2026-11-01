import { describe, expect, it } from "vitest";
import type {
  HistoryBuffLaneView,
  HistoryBuffTimelineView,
} from "./history-derived";
import {
  coverageBuffOrder,
  coveragePlayerUuids,
  coverageRowsFor,
  resolveCoveragePlayer,
} from "./live-buff-coverage";

function lane(entityUuid: string, baseId: number): HistoryBuffLaneView {
  return {
    key: `${entityUuid}:${baseId}`,
    entityUuid,
    baseId,
    coveredActiveMs: 1_000,
    coveragePct: 50,
    triggerCount: 1,
    spans: [],
    gracePoints: [],
  };
}

function timeline(lanes: HistoryBuffLaneView[]): HistoryBuffTimelineView {
  return { activeWindowMs: 2_000, activeSpans: [], gracePoints: [], lanes };
}

// Backend lanes arrive sorted by (entity, base id).
const VIEW = timeline([
  lane("1", -7),
  lane("1", 300),
  lane("1", 500),
  lane("2", 100),
  lane("2", 500),
]);

describe("coverageBuffOrder", () => {
  it("puts configured ids first, then unconfigured ones in lane order", () => {
    expect(coverageBuffOrder(VIEW, [500, 300])).toEqual([500, 300, -7, 100]);
  });

  it("drops configured ids the encounter never recorded", () => {
    expect(coverageBuffOrder(VIEW, [999, 100])).toEqual([100, -7, 300, 500]);
  });

  it("is empty without lanes", () => {
    expect(coverageBuffOrder(timeline([]), [500])).toEqual([]);
  });
});

describe("coveragePlayerUuids", () => {
  // Class ids: 1 Stormblade, 4 Wind Knight, 5 Verdant Oracle,
  // 9 Heavy Guardian, 12 Shield Knight, 13 Beat Performer.
  const players = (...entries: [string, number][]) =>
    entries.map(([entityUuid, classId]) => ({ entityUuid, classId }));

  it("lists the local player first, then teammates with lanes", () => {
    expect(
      coveragePlayerUuids(VIEW, players(["1", 1], ["2", 1], ["3", 1]), "2"),
    ).toEqual(["2", "1"]);
  });

  it("keeps the local player even without any lane", () => {
    expect(
      coveragePlayerUuids(VIEW, players(["1", 1], ["2", 1], ["3", 1]), "3"),
    ).toEqual(["3", "1", "2"]);
  });

  it("skips owners that are not players and an unknown local player", () => {
    expect(coveragePlayerUuids(VIEW, players(["2", 1]), null)).toEqual(["2"]);
    expect(coveragePlayerUuids(VIEW, players(["2", 1]), "9")).toEqual(["2"]);
  });

  it("orders teammates healers, tanks, then damage dealers by class", () => {
    const party = timeline(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((uuid) => lane(uuid, 500)),
    );
    expect(
      coveragePlayerUuids(
        party,
        players(
          ["a", 4],
          ["b", 1],
          ["c", 12],
          ["d", 4],
          ["e", 13],
          ["f", 0],
          ["g", 9],
          ["h", 5],
          ["me", 1],
        ),
        "me",
      ),
    ).toEqual(["me", "h", "e", "g", "c", "b", "a", "d", "f"]);
  });
});

describe("resolveCoveragePlayer", () => {
  it("shows the requested player while present", () => {
    expect(resolveCoveragePlayer(["1", "2"], "2", "1")).toBe("2");
  });

  it("falls back to the local player, then the first candidate", () => {
    expect(resolveCoveragePlayer(["1", "2"], "5", "1")).toBe("1");
    expect(resolveCoveragePlayer(["1", "2"], null, "1")).toBe("1");
    expect(resolveCoveragePlayer(["2"], "5", "1")).toBe("2");
    expect(resolveCoveragePlayer([], null, "1")).toBeNull();
  });
});

describe("coverageRowsFor", () => {
  it("keeps the order and sinks buffs the player never had", () => {
    const rows = coverageRowsFor(VIEW, "2", [500, 300, -7, 100]);
    expect(rows.map((row) => [row.baseId, row.lane?.key ?? null])).toEqual([
      [500, "2:500"],
      [100, "2:100"],
      [300, null],
      [-7, null],
    ]);
  });
});
