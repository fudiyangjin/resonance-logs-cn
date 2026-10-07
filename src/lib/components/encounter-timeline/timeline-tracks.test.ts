import { describe, expect, it } from "vitest";
import { buildBuffTracks } from "./timeline-tracks";
import type { TimelineBuffLane, TimelinePlayerMeta } from "./timeline-types";

function player(entityUuid: string, isLocalPlayer = false): TimelinePlayerMeta {
  return {
    entityUuid,
    name: `name-${entityUuid}`,
    className: "",
    classSpecName: "",
    isLocalPlayer,
  };
}

function lane(entityUuid: string, baseId: number): TimelineBuffLane {
  return {
    key: `${entityUuid}:${baseId}`,
    entityUuid,
    baseId,
    buffName: `buff-${baseId}`,
    coveragePct: 50,
    triggerCount: 1,
    spans: [],
  };
}

const lanes = [lane("a", 10), lane("a", 20), lane("b", 20), lane("b", 30)];
const a = player("a", true);
const b = player("b");
const c = player("c");

describe("buildBuffTracks", () => {
  it("groups by player in owner order, one row per owned buff", () => {
    const tracks = buildBuffTracks(lanes, [b, a], "player");
    expect(tracks.map((track) => track.key)).toEqual([
      "buff-group:player:b",
      "b:20",
      "b:30",
      "buff-group:player:a",
      "a:10",
      "a:20",
    ]);
    expect(tracks[0]).toMatchObject({
      kind: "buff-group",
      label: "name-b",
      player: b,
    });
    expect(tracks[1]).toMatchObject({
      kind: "buff",
      player: b,
      caption: "buff",
    });
  });

  it("groups by buff in lane order, one row per selected owner carrying it", () => {
    const tracks = buildBuffTracks(lanes, [a, b], "buff");
    expect(tracks.map((track) => track.key)).toEqual([
      "buff-group:buff:10",
      "a:10",
      "buff-group:buff:20",
      "a:20",
      "b:20",
      "buff-group:buff:30",
      "b:30",
    ]);
    expect(tracks[0]).toMatchObject({ label: "buff-10", player: null });
    expect(tracks[1]).toMatchObject({ player: a, caption: "player" });
  });

  it("keeps the buff group order stable regardless of owner selection", () => {
    const tracks = buildBuffTracks(lanes, [b], "buff");
    expect(tracks.map((track) => track.key)).toEqual([
      "buff-group:buff:20",
      "b:20",
      "buff-group:buff:30",
      "b:30",
    ]);
  });

  it("skips owners without lanes and returns nothing for no owners", () => {
    expect(
      buildBuffTracks(lanes, [c, a], "player").map((track) => track.key),
    ).toEqual(["buff-group:player:a", "a:10", "a:20"]);
    expect(buildBuffTracks(lanes, [], "player")).toEqual([]);
    expect(buildBuffTracks(lanes, [], "buff")).toEqual([]);
  });

  it("produces unique keys in both groupings", () => {
    for (const grouping of ["player", "buff"] as const) {
      const keys = buildBuffTracks(lanes, [a, b], grouping).map(
        (track) => track.key,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
