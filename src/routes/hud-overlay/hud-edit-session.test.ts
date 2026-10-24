import { describe, expect, it } from "vitest";

import {
  createDefaultMinimapConfig,
  createDefaultSkillMonitorProfile,
  type BuffGroup,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import {
  createDefaultSkillCdRegion,
  type SkillCdRegion,
} from "$lib/skill-cd-layout";
import {
  layoutChange,
  pickMinimapLayout,
  pickSkillProfileLayout,
  restoreSkillProfileLayout,
} from "./hud-edit-session";

function buffGroup(id: string, x: number, iconSize = 44): BuffGroup {
  return {
    id,
    name: id,
    buffIds: [],
    priorityBuffIds: [],
    monitorAll: false,
    position: { x, y: 0 },
    iconSize,
    columns: 6,
    rows: 3,
    gap: 6,
    showName: true,
    showTime: true,
    showLayer: true,
  };
}

function skillCdRegion(
  id: string,
  x: number,
  scale = 1,
  positions: SkillCdRegion["positions"] = {},
): SkillCdRegion {
  return {
    ...createDefaultSkillCdRegion(id),
    positions,
    position: { x, y: 0 },
    scale,
  };
}

function profile(
  overrides: Partial<SkillMonitorProfile> = {},
): SkillMonitorProfile {
  return { ...createDefaultSkillMonitorProfile(), ...overrides };
}

describe("restoreSkillProfileLayout", () => {
  it("returns the same profile when the layout is unchanged", () => {
    const current = profile({ buffGroups: [buffGroup("a", 10)] });
    const saved = pickSkillProfileLayout(current);

    expect(restoreSkillProfileLayout(current, saved)).toBe(current);
  });

  it("drops icon positions and sizes added during the session", () => {
    const start = profile();
    const saved = pickSkillProfileLayout(start);
    const edited = profile({
      overlayPositions: {
        ...start.overlayPositions,
        skillCdGroup: { x: 500, y: 500 },
        iconBuffPositions: { 42: { x: 1, y: 2 } },
      },
      overlaySizes: { ...start.overlaySizes, iconBuffSizes: { 42: 80 } },
    });

    const restored = restoreSkillProfileLayout(edited, saved);

    expect(restored.overlayPositions.iconBuffPositions).toEqual({});
    expect(restored.overlaySizes.iconBuffSizes).toEqual({});
    expect(restored.overlayPositions.skillCdGroup).toEqual(
      start.overlayPositions.skillCdGroup,
    );
  });

  it("restores existing groups, keeps new ones and skips deleted ones", () => {
    const saved = pickSkillProfileLayout(
      profile({ buffGroups: [buffGroup("a", 10, 40), buffGroup("gone", 20)] }),
    );
    const edited = profile({
      buffGroups: [buffGroup("a", 300, 90), buffGroup("new", 400, 60)],
    });

    const restored = restoreSkillProfileLayout(edited, saved);

    expect(
      restored.buffGroups.map((group) => [
        group.id,
        group.position.x,
        group.iconSize,
      ]),
    ).toEqual([
      ["a", 10, 40],
      ["new", 400, 60],
    ]);
  });

  it("restores skill CD region position and scale by id, keeps new regions and skips deleted ones", () => {
    const saved = pickSkillProfileLayout(
      profile({
        skillCdRegions: [
          skillCdRegion("skill_cd_region_1", 10, 1.2),
          skillCdRegion("gone", 20),
        ],
      }),
    );
    const edited = profile({
      monitoredSkillIds: [1420],
      skillCdRegions: [
        skillCdRegion("skill_cd_region_1", 300, 2, {
          1420: { row: 1, column: 1 },
        }),
        skillCdRegion("new", 400, 0.8),
      ],
    });

    const restored = restoreSkillProfileLayout(edited, saved);

    expect(
      restored.skillCdRegions!.map((region) => [
        region.id,
        region.position.x,
        region.scale,
      ]),
    ).toEqual([
      ["skill_cd_region_1", 10, 1.2],
      ["new", 400, 0.8],
    ]);
    // Cells and membership are settings, not layout.
    expect(restored.monitoredSkillIds).toEqual([1420]);
    expect(restored.skillCdRegions![0]!.positions).toEqual({
      1420: { row: 1, column: 1 },
    });
  });

  it("leaves non-layout settings alone", () => {
    const saved = pickSkillProfileLayout(profile());
    const edited = profile({
      monitoredBuffIds: [7, 8],
      textBuffMaxVisible: 3,
      buffGroups: [buffGroup("a", 300)],
      overlayPositions: {
        ...profile().overlayPositions,
        textBuffPanel: { x: 900, y: 900 },
      },
    });

    const restored = restoreSkillProfileLayout(edited, saved);

    expect(restored.monitoredBuffIds).toEqual([7, 8]);
    expect(restored.textBuffMaxVisible).toBe(3);
    expect(restored.buffGroups.map((group) => group.id)).toEqual(["a"]);
  });

  it("restores resource section position/scale but keeps visibility", () => {
    const saved = pickSkillProfileLayout(
      profile({
        resourceSectionLayouts: {
          kept: { position: { x: 1, y: 1 }, scale: 1, visible: true },
        },
      }),
    );
    const edited = profile({
      resourceSectionLayouts: {
        kept: { position: { x: 300, y: 300 }, scale: 2, visible: false },
        added: { position: { x: 5, y: 5 }, scale: 1.5, visible: true },
      },
    });

    const restored = restoreSkillProfileLayout(edited, saved);

    expect(restored.resourceSectionLayouts).toEqual({
      kept: { position: { x: 1, y: 1 }, scale: 1, visible: false },
      added: { visible: true },
    });
  });

  it("does not let later edits leak into the saved layout", () => {
    const saved = pickSkillProfileLayout(
      profile({ buffGroups: [buffGroup("a", 10)] }),
    );
    const restored = restoreSkillProfileLayout(
      profile({ buffGroups: [buffGroup("a", 300)] }),
      saved,
    );

    restored.buffGroups[0]!.position.x = 999;

    expect(saved.buffGroups["a"]!.position.x).toBe(10);
  });
});

describe("minimap layout", () => {
  it("writes the saved rects back only when they differ", () => {
    const config = createDefaultMinimapConfig();
    const saved = pickMinimapLayout(config);

    expect(layoutChange(pickMinimapLayout(config), saved)).toBeNull();

    const moved = {
      ...config,
      mapPanel: { ...config.mapPanel, x: config.mapPanel.x + 50, scale: 2 },
    };
    expect(layoutChange(pickMinimapLayout(moved), saved)).toEqual({
      mapPanel: config.mapPanel,
      infoPanel: config.infoPanel,
    });
  });
});
