import { describe, expect, it } from "vitest";
import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import {
  allMinimapVoiceCues,
  allMinimapVoiceCueSeasonGroups,
} from "./scene-registry";
import { resolveRaidVoiceCues } from "./scenes/s3-raid/mechanics";

function entity(
  entityUuid: string,
  kind: MinimapEntity["kind"],
  monsterId?: number,
): MinimapEntity {
  return {
    entityUuid,
    entityType: "monster",
    kind,
    x: 0,
    y: 0,
    z: 0,
    monsterId: monsterId ?? null,
    isDead: false,
  };
}

function raidSnapshot(): MinimapSnapshot {
  return {
    sceneId: 13021,
    localPlayerUuid: "local",
    entities: [
      entity("local", "local"),
      entity("ring-body", "dummy", 10310062),
    ],
    buffs: [],
    markers: [],
  };
}

describe("S3 voice cue registry", () => {
  it("groups all five current scenes under S3", () => {
    const groups = allMinimapVoiceCueSeasonGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0]?.season).toBe(3);
    expect(groups[0]?.scenes).toHaveLength(5);
    expect(groups[0]?.scenes.every(({ scene }) => scene.resolveVoiceCues)).toBe(
      true,
    );
  });

  it("registers globally unique cue ids", () => {
    const cueIds = allMinimapVoiceCues().map((cue) => cue.id);
    expect(new Set(cueIds).size).toBe(cueIds.length);
  });
});

describe("S3 raid voice cues", () => {
  it("preserves an inner-inner-outer ring sequence", () => {
    const snapshot = raidSnapshot();

    expect(
      resolveRaidVoiceCues(snapshot, [
        { entityUuid: "ring-body", skillId: 10310062, timeMs: 1000 },
        { entityUuid: "ring-body", skillId: 10310062, timeMs: 1100 },
        { entityUuid: "ring-body", skillId: 10310064, timeMs: 1200 },
      ]),
    ).toEqual([
      {
        cueId: "s3-raid.electromagneticRing.inner",
        instanceKey: "ring-body:10310062:1000",
      },
      {
        cueId: "s3-raid.electromagneticRing.inner",
        instanceKey: "ring-body:10310062:1100",
      },
      {
        cueId: "s3-raid.electromagneticRing.outer",
        instanceKey: "ring-body:10310064:1200",
      },
    ]);
  });

  it("announces targeted callouts only for the local player", () => {
    const snapshot = raidSnapshot();
    snapshot.buffs = [
      {
        targetEntityUuid: "teammate",
        buffUuid: 1,
        baseId: 829104,
        layer: 1,
        createTimeMs: 100,
        durationMs: 1000,
        effectIds: [],
      },
      {
        targetEntityUuid: "local",
        buffUuid: 2,
        baseId: 829104,
        layer: 1,
        createTimeMs: 101,
        durationMs: 1000,
        effectIds: [],
      },
    ];

    expect(resolveRaidVoiceCues(snapshot, [])).toEqual([
      {
        cueId: "s3-raid.electromagneticPulse",
        instanceKey: "local:829104:101:1",
      },
    ]);
  });
});
