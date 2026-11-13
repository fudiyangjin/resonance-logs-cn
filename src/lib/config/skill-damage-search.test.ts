import { describe, expect, it } from "vitest";
import { searchSkillDamage } from "./skill-damage-search";
import { getGameData } from "$lib/i18n/game-data";

describe("skill damage search", () => {
  it("finds the reported damage ID by its own name and its group name", () => {
    expect(
      searchSkillDamage(
        getGameData("zh-CN").damageAttrIdNames["25523102"]!,
        {},
        "zh-CN",
      ).some((item) => item.skillId === 25523102),
    ).toBe(true);
    const group = Object.values(getGameData("zh-CN").recountTable).find(
      (entry) => entry.DamageId.includes(25523102),
    )!;
    expect(
      searchSkillDamage(group.RecountName, {}, "zh-CN").map(
        (item) => item.skillId,
      ),
    ).toEqual(expect.arrayContaining(group.DamageId));
  });

  it("ranks exact IDs first, supports #, and allows unlisted safe integer IDs", () => {
    expect(searchSkillDamage("#25523102", {}, "zh-CN")[0]?.skillId).toBe(
      25523102,
    );
    expect(searchSkillDamage("9007199254740991", {}, "zh-CN")[0]).toEqual({
      skillId: Number.MAX_SAFE_INTEGER,
      name: `#${Number.MAX_SAFE_INTEGER}`,
      defaultName: null,
    });
    expect(searchSkillDamage("9007199254740992", {}, "zh-CN")).toEqual([]);
    expect(
      searchSkillDamage("0", {}, "zh-CN").some((item) => item.skillId === 0),
    ).toBe(false);
  });

  it("searches aliases, including unknown IDs, without duplicating results", () => {
    const aliases = {
      "25523102": "Custom Blast",
      "999999999999": "Custom Unknown",
    };
    expect(
      searchSkillDamage("custom blast", aliases, "zh-CN")[0],
    ).toMatchObject({ skillId: 25523102, name: "Custom Blast" });
    expect(searchSkillDamage("custom unknown", aliases, "zh-CN")).toEqual([
      { skillId: 999999999999, name: "Custom Unknown", defaultName: null },
    ]);
    const results = searchSkillDamage("255", aliases, "zh-CN");
    expect(new Set(results.map((item) => item.skillId)).size).toBe(
      results.length,
    );
  });

  it("uses localized names and handles blank and unmatched queries", () => {
    const name = getGameData("en-US").damageAttrIdNames["25523102"]!;
    expect(searchSkillDamage(name.toLowerCase(), {}, "en-US")[0]).toMatchObject(
      { skillId: 25523102, defaultName: name },
    );
    expect(searchSkillDamage("  ", {}, "zh-CN")).toEqual([]);
    expect(searchSkillDamage("no-such-skill-xyz", {}, "zh-CN")).toEqual([]);
  });
});
