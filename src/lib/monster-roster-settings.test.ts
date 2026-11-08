import { describe, expect, it } from "vitest";

import { ROSTER_PRESET_BLOCKED_MONSTERS } from "./config/roster-preset-blocks";
import {
  blockRosterMonster,
  createDefaultMonsterRosterOptions,
  DEFAULT_ROSTER_PANEL_WIDTH,
  effectiveRosterBlockedIds,
  ensureRosterBlockedMonsterIds,
  MAX_ROSTER_NORMAL_ROWS,
  MAX_ROSTER_PANEL_WIDTH,
  MIN_ROSTER_PANEL_WIDTH,
  normalizeMonsterRosterOptions,
  normalizeRosterPanelWidth,
  unblockRosterMonster,
} from "./monster-roster-settings";
import {
  createDefaultHpPanelStyle,
  createDefaultRosterPanelStyle,
} from "./settings-store";
import { normalizeRosterPanelStyle } from "./skill-monitor-normalize";

/** 地块A标记, a developer preset. */
const PRESET = 103303;

describe("normalizeMonsterRosterOptions", () => {
  it("fills defaults for missing or malformed options", () => {
    expect(normalizeMonsterRosterOptions(undefined)).toEqual(
      createDefaultMonsterRosterOptions(),
    );
    expect(normalizeMonsterRosterOptions({ normalRows: Number.NaN })).toEqual(
      createDefaultMonsterRosterOptions(),
    );
  });

  it("clamps the row count and keeps flags only when true", () => {
    const options = normalizeMonsterRosterOptions({
      normalRows: 99,
      tankMode: true,
    });
    expect(options.normalRows).toBe(MAX_ROSTER_NORMAL_ROWS);
    expect(options.tankMode).toBe(true);
    expect(options.showHpValue).toBe(false);
  });
});

describe("roster panel width", () => {
  it("rounds and clamps to the slider range, defaulting when unusable", () => {
    expect(normalizeRosterPanelWidth(180.4)).toBe(180);
    expect(normalizeRosterPanelWidth(10)).toBe(MIN_ROSTER_PANEL_WIDTH);
    expect(normalizeRosterPanelWidth(9_999)).toBe(MAX_ROSTER_PANEL_WIDTH);
    for (const bad of [undefined, null, Number.NaN, "180"]) {
      expect(normalizeRosterPanelWidth(bad)).toBe(DEFAULT_ROSTER_PANEL_WIDTH);
    }
  });

  it("keeps the former minimum width as the default look", () => {
    expect(DEFAULT_ROSTER_PANEL_WIDTH).toBe(240);
    expect(createDefaultRosterPanelStyle()).toEqual({
      ...createDefaultHpPanelStyle(),
      width: DEFAULT_ROSTER_PANEL_WIDTH,
    });
  });

  it("normalizes the roster style, including the HP style it falls back to", () => {
    expect(normalizeRosterPanelStyle(createDefaultHpPanelStyle())).toEqual(
      createDefaultRosterPanelStyle(),
    );
    const narrow = normalizeRosterPanelStyle({
      ...createDefaultRosterPanelStyle(),
      fontSize: 15,
      width: 150,
    });
    expect(narrow.width).toBe(150);
    expect(narrow.fontSize).toBe(15);
    expect(normalizeRosterPanelStyle(narrow)).toEqual(narrow);
  });
});

describe("roster block list", () => {
  it("keeps valid distinct ids in order", () => {
    expect(ensureRosterBlockedMonsterIds([3, 0, 3, -1, 2.5, "4", 7])).toEqual([
      3, 7,
    ]);
    expect(ensureRosterBlockedMonsterIds(null)).toEqual([]);
  });

  it("hides every preset, plus the player's ids", () => {
    const hidden = effectiveRosterBlockedIds([1]);
    expect(hidden.has(1)).toBe(true);
    for (const preset of ROSTER_PRESET_BLOCKED_MONSTERS) {
      expect(hidden.has(preset.monsterId)).toBe(true);
    }
  });

  it("keeps presets out of the player's list", () => {
    expect(ensureRosterBlockedMonsterIds([PRESET, 1])).toEqual([1]);
    expect(blockRosterMonster([1], PRESET)).toEqual([1]);
  });

  it("blocks and unblocks the player's own ids", () => {
    const blocked = blockRosterMonster([], 1950);
    expect(blocked).toEqual([1950]);
    expect(blockRosterMonster(blocked, 1950)).toEqual(blocked);
    expect(unblockRosterMonster(blocked, 1950)).toEqual([]);
  });

  it("ignores invalid ids", () => {
    const blocked = [7];
    expect(blockRosterMonster(blocked, 0)).toBe(blocked);
  });
});
