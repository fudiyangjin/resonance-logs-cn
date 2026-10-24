import { describe, expect, it } from "vitest";

import {
  SKILL_BG_COLOURS,
  findActiveSkillDerivation,
  getDefaultMonitoredBuffIds,
  getDutySkills,
  skillBgColour,
} from "./skill-mappings";
import resonanceSkills from "./config/skill_aoyi_icons.json";

const BASIC_ATTACK_ID = 1401;
const SWIFT_BLADE_BUFF = 2205301;
const DRAKE_CANNON_BUFF = 2205421;
const RING_CANNON_BUFF = 2205521;

describe("wind knight basic-attack derivations", () => {
  it("highlights 疾驰锋刃 from the original basic-attack icon", () => {
    const derivation = findActiveSkillDerivation(
      "wind_knight",
      BASIC_ATTACK_ID,
      new Set([SWIFT_BLADE_BUFF]),
      "zh-CN",
    );

    expect(derivation).toMatchObject({
      derivedSkillId: 1411,
      derivedName: "疾驰锋刃",
      derivedImagePath:
        "/images/wind_knight/skill/weapon_cq_skill_atk_-7208739400043910585.png",
    });
  });

  it("prefers 龙击炮 when both 龙击炮 and 疾驰锋刃 are active", () => {
    const derivation = findActiveSkillDerivation(
      "wind_knight",
      BASIC_ATTACK_ID,
      new Set([SWIFT_BLADE_BUFF, DRAKE_CANNON_BUFF]),
      "zh-CN",
    );

    expect(derivation?.derivedName).toBe("龙击炮");
    expect(derivation?.derivedSkillId).toBe(1435);
  });

  it("prefers ring-cannon 龙击炮 over 疾驰锋刃", () => {
    const derivation = findActiveSkillDerivation(
      "wind_knight",
      BASIC_ATTACK_ID,
      new Set([SWIFT_BLADE_BUFF, RING_CANNON_BUFF]),
      "zh-CN",
    );

    expect(derivation?.derivedName).toBe("龙击炮");
  });

  it("tracks 2205301 as a linked wind-knight buff", () => {
    expect(getDefaultMonitoredBuffIds("wind_knight")).toContain(SWIFT_BLADE_BUFF);
  });
});

describe("skill button element colours", () => {
  it("tints class skills and derived skills with their own PCBgColour", () => {
    expect(skillBgColour(1420)).toBe(4);
    expect(skillBgColour(1425)).toBe(2);
    // 极·岚切 replaces 1425 but carries a different colour.
    expect(skillBgColour(1433)).toBe(1);
    expect(SKILL_BG_COLOURS[skillBgColour(1420)]).toBe("#c09923");
  });

  it("leaves duty, fantasy and unknown skills untinted", () => {
    for (const { skillId } of getDutySkills("zh-CN"))
      expect(skillBgColour(skillId)).toBe(0);
    for (const { id } of resonanceSkills) expect(skillBgColour(id)).toBe(0);
    expect(skillBgColour(999_999)).toBe(0);
    expect(skillBgColour(undefined)).toBe(0);
  });
});
