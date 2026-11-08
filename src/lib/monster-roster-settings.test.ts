import { describe, expect, it } from "vitest";

import { ROSTER_PRESET_BLOCKED_MONSTERS } from "./config/roster-preset-blocks";
import {
  blockRosterMonster,
  createDefaultMonsterRosterOptions,
  effectiveRosterBlockedIds,
  ensureRosterBlockedMonsterIds,
  MAX_ROSTER_NORMAL_ROWS,
  normalizeMonsterRosterOptions,
  unblockRosterMonster,
} from "./monster-roster-settings";

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
