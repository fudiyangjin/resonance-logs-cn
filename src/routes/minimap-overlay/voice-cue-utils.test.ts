import { describe, expect, it } from "vitest";
import type { MinimapSnapshot } from "$lib/api";
import { resolveBuffVoiceCues, resolveSkillVoiceCues } from "./voice-cue-utils";

const snapshot: MinimapSnapshot = {
  sceneId: 1,
  localPlayerUuid: "local",
  entities: [],
  markers: [],
  buffs: [
    {
      targetEntityUuid: "local",
      buffUuid: 1,
      baseId: 10,
      layer: 2,
      createTimeMs: 100,
      durationMs: 1000,
      effectIds: [],
    },
    {
      targetEntityUuid: "teammate",
      buffUuid: 2,
      baseId: 10,
      layer: 1,
      createTimeMs: 101,
      durationMs: 1000,
      effectIds: [],
    },
  ],
};

describe("minimap voice cue helpers", () => {
  it("filters local-target buffs and builds stable instance keys", () => {
    expect(
      resolveBuffVoiceCues(snapshot, { 10: "targeted" }, "localTarget"),
    ).toEqual([
      {
        cueId: "targeted",
        instanceKey: "local:10:100:2",
      },
    ]);
  });

  it("keeps all global buff instances", () => {
    expect(
      resolveBuffVoiceCues(snapshot, { 10: "global" }, "global"),
    ).toHaveLength(2);
  });

  it("keeps rapid casts as distinct instances in wire order", () => {
    expect(
      resolveSkillVoiceCues(
        [
          { entityUuid: "boss", skillId: 1, timeMs: 1000 },
          { entityUuid: "boss", skillId: 1, timeMs: 1100 },
          { entityUuid: "boss", skillId: 3, timeMs: 1200 },
        ],
        { 1: "inner", 3: "outer" },
      ),
    ).toEqual([
      { cueId: "inner", instanceKey: "boss:1:1000" },
      { cueId: "inner", instanceKey: "boss:1:1100" },
      { cueId: "outer", instanceKey: "boss:3:1200" },
    ]);
  });
});
