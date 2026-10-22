import { describe, expect, it } from "vitest";
import { hideTeammate, visibleTeamMark } from "./minimap-markers";
import { s3CursedTombScene } from "./scenes/s3-cursed-tomb";
import type { MinimapEntity } from "$lib/api";

describe("party icon visibility", () => {
  it("only replaces non-local teammate glyphs when enabled", () => {
    for (let mark = 1; mark <= 6; mark++) {
      expect(visibleTeamMark({ kind: "teammate", teamMark: mark }, true)).toBe(
        mark,
      );
      expect(
        visibleTeamMark({ kind: "local", teamMark: mark }, true),
      ).toBeNull();
      expect(
        visibleTeamMark({ kind: "boss", teamMark: mark }, true),
      ).toBeNull();
      expect(
        visibleTeamMark({ kind: "teammate", teamMark: mark }, false),
      ).toBeNull();
    }
    for (const mark of [null, 0, 7, -1, 1.5, NaN]) {
      expect(
        visibleTeamMark({ kind: "teammate", teamMark: mark }, true),
      ).toBeNull();
    }
  });

  it("keeps marked or mechanic teammates, with hide-all taking precedence", () => {
    const settings = { hideAllTeammates: false, hideNormalTeammates: true };
    expect(hideTeammate("teammate", false, false, settings)).toBe(true);
    expect(hideTeammate("teammate", false, true, settings)).toBe(false);
    expect(hideTeammate("teammate", true, false, settings)).toBe(false);
    expect(
      hideTeammate("teammate", true, true, {
        ...settings,
        hideAllTeammates: true,
      }),
    ).toBe(true);
    expect(
      hideTeammate("local", false, true, {
        ...settings,
        hideAllTeammates: true,
      }),
    ).toBe(false);
    expect(
      hideTeammate("teammate", false, false, {
        ...settings,
        hideNormalTeammates: false,
      }),
    ).toBe(false);
  });

  it("retains party icons through a translated and rotated scene view", () => {
    const teammate: MinimapEntity = {
      entityUuid: "teammate",
      entityType: "char",
      kind: "teammate",
      teamMark: 6,
      x: 74,
      y: 62.2,
      z: -310,
      name: null,
      monsterId: null,
      facing: 0,
      currentHp: null,
      maxHp: null,
      targetEntityUuid: null,
      topSummonerId: null,
      isDead: false,
    };
    const view = s3CursedTombScene.resolveView(
      {
        sceneId: 6513,
        localPlayerUuid: "local",
        entities: [teammate],
        buffs: [],
        markers: [
          { marker: 0, x: 74, z: -310 },
          { marker: 9, x: 69, z: -307 },
        ],
      },
      () => "teammate",
    );
    expect(view.rotationQuarters).toBe(1);
    expect(view.entities[0]).toMatchObject({ x: 5, z: -3, teamMark: 6 });
    expect(view.markers).toEqual([
      { marker: 0, x: 5, z: -3 },
      { marker: 9, x: 0, z: 0 },
    ]);
    expect(teammate).toMatchObject({ x: 74, z: -310 });
  });
});
