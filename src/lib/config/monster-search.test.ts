import { describe, expect, it } from "vitest";

import { searchMonsters } from "./monster-search";

describe("searchMonsters", () => {
  it("ranks an exact id first and accepts a # prefix", () => {
    expect(searchMonsters("#103303", "zh-CN")[0]).toEqual({
      monsterId: 103303,
      name: "地块A标记",
      monsterType: 1,
    });
  });

  it("returns every same-name template, ties by id", () => {
    const results = searchMonsters("地块A标记", "zh-CN");
    expect(results.slice(0, 4).map((item) => item.monsterId)).toEqual([
      103303, 103304, 103305, 103306,
    ]);
  });

  it("keeps an unlisted exact id so it can still be blocked", () => {
    expect(searchMonsters("1999999999", "zh-CN")).toEqual([
      { monsterId: 1_999_999_999, name: null, monsterType: null },
    ]);
  });

  it("returns nothing for a blank keyword", () => {
    expect(searchMonsters("  ", "zh-CN")).toEqual([]);
  });
});
