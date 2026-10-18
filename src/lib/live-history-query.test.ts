import { describe, expect, it } from "vitest";
import {
  buildEncounterFilters,
  emptyLiveHistoryFilters,
  expandOptionIds,
  formatEncounterDuration,
  groupRowsByLocalDay,
  isLiveDrillDown,
  isLiveHistoryPath,
  liveTabRoot,
  matchNameOptions,
  neighborIndex,
  startOfLocalDay,
} from "./live-history-query";

const NOW = new Date(2026, 9, 18, 21, 30).getTime();

describe("buildEncounterFilters", () => {
  it("returns null when nothing is selected", () => {
    expect(buildEncounterFilters(emptyLiveHistoryFilters(), NOW)).toBeNull();
  });

  it("maps every selected filter onto the backend DTO", () => {
    expect(
      buildEncounterFilters(
        {
          sceneIds: [3, 4],
          bossIds: [9001],
          players: ["Alice"],
          favoriteOnly: true,
          todayOnly: true,
        },
        NOW,
      ),
    ).toEqual({
      bossMonsterIds: [9001],
      sceneIds: [3, 4],
      playerName: null,
      playerNames: ["Alice"],
      dateFromMs: new Date(2026, 9, 18).getTime(),
      dateToMs: null,
      isFavorite: true,
    });
  });

  it("leaves unselected kinds open", () => {
    const filters = { ...emptyLiveHistoryFilters(), favoriteOnly: true };
    expect(buildEncounterFilters(filters, NOW)).toMatchObject({
      bossMonsterIds: null,
      sceneIds: null,
      playerNames: null,
      dateFromMs: null,
      isFavorite: true,
    });
  });
});

describe("neighborIndex", () => {
  const rows = [{ id: 30 }, { id: 20 }, { id: 10 }];

  it("steps newer upwards and older downwards", () => {
    expect(neighborIndex(rows, 20, "newer")).toEqual({ kind: "row", index: 0 });
    expect(neighborIndex(rows, 20, "older")).toEqual({ kind: "row", index: 2 });
  });

  it("stops at the newest row and asks for more past the oldest", () => {
    expect(neighborIndex(rows, 30, "newer")).toEqual({ kind: "none" });
    expect(neighborIndex(rows, 10, "older")).toEqual({ kind: "unloaded" });
  });

  it("has no neighbours for an encounter outside the list", () => {
    expect(neighborIndex(rows, 99, "older")).toEqual({ kind: "none" });
    expect(neighborIndex(rows, 99, "newer")).toEqual({ kind: "none" });
  });
});

describe("groupRowsByLocalDay", () => {
  it("groups consecutive rows and labels today / yesterday", () => {
    const rows = [
      { id: 4, startedAtMs: new Date(2026, 9, 18, 20).getTime() },
      { id: 3, startedAtMs: new Date(2026, 9, 18, 9).getTime() },
      { id: 2, startedAtMs: new Date(2026, 9, 17, 23).getTime() },
      { id: 1, startedAtMs: new Date(2026, 9, 12, 8).getTime() },
    ];
    const groups = groupRowsByLocalDay(rows, NOW);
    expect(groups.map((group) => group.kind)).toEqual([
      "today",
      "yesterday",
      "date",
    ]);
    expect(groups.map((group) => group.rows.map((row) => row.id))).toEqual([
      [4, 3],
      [2],
      [1],
    ]);
    expect(groups[2]?.dayMs).toBe(startOfLocalDay(rows[3]!.startedAtMs));
  });
});

describe("matchNameOptions", () => {
  const options = [
    { label: "Tina's Lair", ids: [1] },
    { label: "tina hard", ids: [2] },
    { label: "Goblin", ids: [3] },
  ];

  it("matches case-insensitively and honours the limit", () => {
    expect(matchNameOptions(options, " TINA ", 5)).toHaveLength(2);
    expect(matchNameOptions(options, "tina", 1)).toEqual([options[0]]);
  });

  it("matches nothing for a blank query", () => {
    expect(matchNameOptions(options, "  ", 5)).toEqual([]);
  });
});

describe("expandOptionIds", () => {
  it("pulls in every id of a grouped option and keeps unknown ids", () => {
    const options = [{ ids: [10, 11] }, { ids: [20] }];
    expect(expandOptionIds(options, [11, 99])).toEqual([10, 11, 99]);
  });
});

describe("formatEncounterDuration", () => {
  it("renders minutes and zero-padded seconds", () => {
    expect(formatEncounterDuration(272.4)).toBe("4:32");
    expect(formatEncounterDuration(5)).toBe("0:05");
    expect(formatEncounterDuration(-3)).toBe("0:00");
  });
});

describe("live route helpers", () => {
  it("finds the meter tab of a route", () => {
    expect(liveTabRoot("/live/dps")).toBe("/live/dps");
    expect(liveTabRoot("/live/dps/")).toBe("/live/dps");
    expect(liveTabRoot("/live/tanked/monsters")).toBe("/live/tanked");
    expect(liveTabRoot("/live/death/replay")).toBe("/live/death");
    expect(liveTabRoot("/live/history")).toBeNull();
  });

  it("tells drill-down pages from tab roots", () => {
    expect(isLiveDrillDown("/live/heal/skills")).toBe(true);
    expect(isLiveDrillDown("/live/heal")).toBe(false);
    expect(isLiveDrillDown("/live/history")).toBe(false);
  });

  it("recognises the history picker", () => {
    expect(isLiveHistoryPath("/live/history")).toBe(true);
    expect(isLiveHistoryPath("/live/history/")).toBe(true);
    expect(isLiveHistoryPath("/live/dps")).toBe(false);
  });
});
