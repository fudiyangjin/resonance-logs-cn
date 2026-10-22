import { describe, expect, it } from "vitest";
import { getDamageCatalog } from "$lib/challenge-damage-search";
import { searchDamageIds } from "./damage-id-search";

describe("searchDamageIds", () => {
  it("returns nothing for a blank keyword", () => {
    expect(searchDamageIds("  ", "zh-CN")).toEqual([]);
  });

  it("puts the exact id first, then id prefixes", () => {
    expect(searchDamageIds("2203110203", "zh-CN")[0]).toMatchObject({
      ids: [2203110203],
      isGroup: false,
      name: "法杖-幸运",
    });
    const singles = searchDamageIds("#22031102", "zh-CN").filter(
      (entry) => !entry.isGroup,
    );
    expect(singles.length).toBeGreaterThan(1);
    for (const entry of singles) {
      expect(String(entry.ids[0])).toMatch(/^22031102/);
    }
  });

  it("still offers an exact id the tables do not list", () => {
    expect(searchDamageIds("987654321987", "zh-CN")[0]).toEqual({
      key: "s:987654321987",
      name: "#987654321987",
      ids: [987654321987],
      isGroup: false,
    });
  });

  it("returns every name match without truncating", () => {
    const keyword = "幸运";
    const expected = getDamageCatalog("zh-CN").filter((entry) =>
      entry.nameLower.includes(keyword),
    ).length;
    expect(searchDamageIds(keyword, "zh-CN")).toHaveLength(expected);
  });
});
