import { describe, expect, it } from "vitest";

import monsterSkillNames from "./MonsterSkillName.json";
import { searchMonsterSkills } from "./monster-skill-search";

const entries = Object.entries(monsterSkillNames as Record<string, string>);

describe("searchMonsterSkills", () => {
  it("returns every id or name match for a one-digit keyword, without truncation", () => {
    const results = searchMonsterSkills("1", {}, "zh-CN");
    const expected = entries.filter(
      ([id, name]) => id.includes("1") || name.includes("1"),
    ).length;
    // Plus the exact-id passthrough for 1, which the table does not list.
    expect(results).toHaveLength(expected + 1);
    expect(results[0]).toEqual({ skillId: 1, name: "#1", defaultName: null });
    // Prefix matches (rank 2) come before infix matches (rank 5).
    const firstInfix = results.findIndex(
      (item) => item.skillId !== 1 && !String(item.skillId).startsWith("1"),
    );
    expect(
      results
        .slice(firstInfix)
        .every((item) => !String(item.skillId).startsWith("1")),
    ).toBe(true);
  });

  it("ranks an exact id first and accepts a # prefix", () => {
    const results = searchMonsterSkills("#101403", {}, "zh-CN");
    expect(results[0]).toEqual({
      skillId: 101403,
      name: "冰龙蓄力下砸",
      defaultName: "冰龙蓄力下砸",
    });
  });

  it("matches names, exact names before partial ones, ties by id", () => {
    const results = searchMonsterSkills("炽热挥击", {}, "zh-CN");
    expect(results.slice(0, 4).map((item) => item.skillId)).toEqual([
      1601, 1602, 1603, 1604,
    ]);
    expect(searchMonsterSkills("冰龙", {}, "zh-CN").length).toBeGreaterThan(1);
  });

  it("matches and shows aliases, including for ids outside the table", () => {
    const aliases = { "101403": "下砸", "999999999": "自定义" };
    expect(searchMonsterSkills("下砸", aliases, "zh-CN")[0]).toEqual({
      skillId: 101403,
      name: "下砸",
      defaultName: "冰龙蓄力下砸",
    });
    expect(searchMonsterSkills("自定义", aliases, "zh-CN")).toEqual([
      { skillId: 999999999, name: "自定义", defaultName: null },
    ]);
  });

  it("passes an unlisted exact id through and ignores blank or out-of-range input", () => {
    expect(searchMonsterSkills("88888888", {}, "zh-CN")[0]).toEqual({
      skillId: 88888888,
      name: "#88888888",
      defaultName: null,
    });
    expect(searchMonsterSkills("  ", {}, "zh-CN")).toEqual([]);
    expect(
      searchMonsterSkills("99999999999", {}, "zh-CN").some(
        (item) => item.skillId === 99999999999,
      ),
    ).toBe(false);
  });
});
