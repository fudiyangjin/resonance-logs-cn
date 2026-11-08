import { describe, expect, it } from "vitest";

import { monsterSkillIdsOf, monsterSkillTiming } from "./monster-skill-timing";

describe("monster skill timing", () => {
  it("reads cooldowns and battle-start windows", () => {
    // 谜之矩阵 眼球颤爆: logs show a 25.0 s cycle.
    expect(monsterSkillTiming(1009804)).toEqual({
      cooldownSeconds: 25,
      battleStart: [5, 20],
      singSeconds: 0,
      danger: false,
    });
    expect(monsterSkillTiming(170104).battleStart).toBe("never");
  });

  it("reads sing bars", () => {
    expect(monsterSkillTiming(2001727)).toMatchObject({
      cooldownSeconds: 15,
      singSeconds: 3,
    });
    expect(monsterSkillTiming(1006412).singSeconds).toBe(3.5);
  });

  it("returns empty timing for an unknown skill", () => {
    expect(monsterSkillTiming(1)).toEqual({
      cooldownSeconds: 0,
      battleStart: null,
      singSeconds: 0,
      danger: false,
    });
  });

  it("lists the skills of a monster template", () => {
    expect(monsterSkillIdsOf(133116)).toEqual([1006404, 1006412, 1006413]);
    expect(monsterSkillIdsOf(null)).toEqual([]);
    expect(monsterSkillIdsOf(-5)).toEqual([]);
  });
});
