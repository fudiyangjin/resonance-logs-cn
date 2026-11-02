import { describe, expect, it } from "vitest";
import { classRole, compareByPartyRole } from "./class-roles";
import { CLASS_MAP } from "./utils.svelte";

describe("classRole", () => {
  it("classifies every known class", () => {
    const roles = Object.fromEntries(
      Object.entries(CLASS_MAP).map(([id, name]) => [name, classRole(+id)]),
    );
    expect(roles).toEqual({
      Stormblade: "dps",
      "Frost Mage": "dps",
      "Flame Berserker": "dps",
      "Wind Knight": "dps",
      "Verdant Oracle": "healer",
      "Heavy Guardian": "tank",
      Marksman: "dps",
      "Shield Knight": "tank",
      "Beat Performer": "healer",
    });
  });

  it("has no role for an unknown class", () => {
    expect(classRole(0)).toBeNull();
    expect(classRole(Number.NaN)).toBeNull();
  });
});

describe("compareByPartyRole", () => {
  it("sorts healers, tanks, damage dealers, then unknown", () => {
    expect([0, 1, 12, 5, 4, 9, 13].sort(compareByPartyRole)).toEqual([
      5, 13, 9, 12, 1, 4, 0,
    ]);
  });

  it("ties within one class and among unknown classes", () => {
    expect(compareByPartyRole(4, 4)).toBe(0);
    expect(compareByPartyRole(0, 0)).toBe(0);
  });
});
