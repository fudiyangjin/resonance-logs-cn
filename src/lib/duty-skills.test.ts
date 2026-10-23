import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findAnySkillByBaseId,
  findDutySkill,
  getDutySkills,
} from "./skill-mappings";
import { computeDisplay } from "../routes/game-overlay/overlay-utils";
import type { SkillCdState } from "./bindings";

describe("duty skill monitoring", () => {
  it("resolves all 20 skills and shipped icons for every locale and class", () => {
    const ids = [
      3011, 3012, 3013, 3014, 3021, 3022, 3023, 3024, 3025, 3026, 3027, 3028,
      3311, 3312, 3313, 3314, 3611, 3612, 3613, 3614,
    ];
    for (const locale of ["zh-CN", "en-US", "ja-JP"] as const) {
      const skills = getDutySkills(locale);
      expect(
        skills.map((skill) => skill.skillId).sort((a, b) => a - b),
      ).toEqual(ids);
      for (const skill of skills) {
        expect(skill.name.trim()).not.toBe("");
        expect(existsSync(resolve("static", skill.imagePath.slice(1)))).toBe(
          true,
        );
        for (const classKey of [
          "wind_knight",
          "heavy_guardian",
          "verdant_oracle",
          "",
        ]) {
          expect(findAnySkillByBaseId(classKey, skill.skillId, locale)).toEqual(
            skill,
          );
        }
      }
    }
    expect(findDutySkill(3612, "en-US")?.name).toBe("Unyielding Spirit");
    expect(findDutySkill(3313, "ja-JP")?.name).toBe("ライフバリア");
    expect(findDutySkill(3028, "ja-JP")?.name).toBe("加護結界");
    expect(findDutySkill(-1)).toBeUndefined();
  });

  it("keeps role restrictions and encyclopedia skills distinct", () => {
    const skills = getDutySkills("zh-CN");
    for (const [group, dutyTypes, count] of [
      ["attack", [1], 4],
      ["survival", [3], 4],
      ["support", [2], 4],
      ["encyclopedia", [1, 2, 3], 8],
    ] as const) {
      const entries = skills.filter((skill) => skill.group === group);
      expect(entries).toHaveLength(count);
      expect(
        entries.every(
          (skill) =>
            JSON.stringify(skill.dutyTypes) === JSON.stringify(dutyTypes),
        ),
      ).toBe(true);
    }
  });

  it("uses the shipped charge table to display both Unyielding Spirit charges", () => {
    const charges = JSON.parse(
      readFileSync(
        resolve("src-tauri/meter-data/SkillChargeTable.json"),
        "utf8",
      ),
    );
    const state: SkillCdState = {
      skillLevelId: 361201,
      beginTime: 0,
      duration: 80_000,
      skillCdType: 1,
      validCdTime: 0,
      receivedAt: 100_000,
      calculatedDuration: 80_000,
      cdAccelerateRate: 0,
      readyAtMs: null,
      maxValidCdTime: null,
      maxCharges: charges[3612]?.maxCharges ?? null,
    };
    expect(computeDisplay(state, 100_000)).toMatchObject({
      chargesAvailable: 0,
      maxCharges: 2,
      usable: false,
    });
    expect(computeDisplay(state, 180_000)).toMatchObject({
      chargesAvailable: 1,
      maxCharges: 2,
      usable: true,
      isActive: true,
    });
    expect(computeDisplay(state, 260_000)).toMatchObject({
      chargesAvailable: 2,
      usable: true,
      isActive: false,
    });
  });
});
