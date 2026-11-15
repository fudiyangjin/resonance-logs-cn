import { describe, expect, it } from "vitest";
import {
  addExcludedDamageMonster,
  DAMAGE_EXCLUSION_PRESETS,
  ensureExcludedDamageMonsterIds,
  MAX_EXCLUDED_DAMAGE_MONSTERS,
  removeExcludedDamageMonster,
} from "./damage-exclusion";

describe("damage exclusion list", () => {
  it("keeps valid distinct ids in their persisted order", () => {
    expect(
      ensureExcludedDamageMonsterIds([
        3_000_090,
        115,
        3_000_090,
        0,
        -5,
        1.5,
        "122",
        null,
        2_147_483_648,
      ]),
    ).toEqual([3_000_090, 115]);
    expect(ensureExcludedDamageMonsterIds(undefined)).toEqual([]);
    expect(ensureExcludedDamageMonsterIds({ 0: 115 })).toEqual([]);
  });

  it("caps the list", () => {
    const ids = Array.from(
      { length: MAX_EXCLUDED_DAMAGE_MONSTERS + 10 },
      (_, index) => index + 1,
    );
    expect(ensureExcludedDamageMonsterIds(ids)).toHaveLength(
      MAX_EXCLUDED_DAMAGE_MONSTERS,
    );
  });

  it("adds and removes without mutating the input", () => {
    const ids = [115];
    const added = addExcludedDamageMonster(ids, 3_000_090);
    expect(added).toEqual([115, 3_000_090]);
    expect(ids).toEqual([115]);
    expect(addExcludedDamageMonster(added, 3_000_090)).toEqual(added);
    expect(addExcludedDamageMonster(added, -1)).toEqual(added);

    const removed = removeExcludedDamageMonster(added, 115);
    expect(removed).toEqual([3_000_090]);
    expect(added).toEqual([115, 3_000_090]);
  });

  it("ships the relay dummy preset", () => {
    expect(
      DAMAGE_EXCLUSION_PRESETS.map((preset) => preset.monsterId),
    ).toContain(3_000_090);
  });
});
