import { describe, expect, it } from "vitest";

import {
  createDefaultMinimapConfig,
  createDefaultSkillMonitorProfile,
  type BuffGroup,
  type SkillMonitorProfile,
} from "$lib/settings-store";
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
