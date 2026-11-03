import { describe, expect, it } from "vitest";
import {
  formatSkillDamage,
  skillDamageDurationMs,
  orderSkillDamageRows,
} from "./skill-damage-display";

describe("skill damage scrolling", () => {
  it("puts new hits below for up and above for down without changing stored order", () => {
    const rows = [{ id: "old" }, { id: "new" }];
    expect(orderSkillDamageRows(rows, "up")).toEqual(rows);
    expect(orderSkillDamageRows(rows, undefined)).toEqual(rows);
    expect(orderSkillDamageRows(rows, "down")).toEqual([rows[1], rows[0]]);
    expect(rows.map((row) => row.id)).toEqual(["old", "new"]);
    expect(orderSkillDamageRows([], "down")).toEqual([]);
  });
});

describe("skill damage duration", () => {
  it("defaults old settings and rejects invalid durations", () => {
    for (const value of [undefined, null, NaN, Infinity, 0, -1, "invalid"]) {
      expect(skillDamageDurationMs(value)).toBe(2500);
    }
  });
  it("keeps milliseconds and clamps to the supported input range", () => {
    expect(skillDamageDurationMs(1234)).toBe(1234);
    expect(skillDamageDurationMs(1)).toBe(100);
    expect(skillDamageDurationMs(100000)).toBe(60000);
  });
});

describe("skill damage number formats", () => {
  it("preserves exact large integers and thousands separators", () => {
    expect(formatSkillDamage("12345678901234567890", "integer")).toBe(
      "12345678901234567890",
    );
    expect(formatSkillDamage("12345678901234567890", "grouped")).toBe(
      "12,345,678,901,234,567,890",
    );
  });
  it("selects and rounds Chinese and western units", () => {
    expect(formatSkillDamage("999", "western")).toBe("999");
    expect(formatSkillDamage("1250", "western")).toBe("1.3K");
    expect(formatSkillDamage("1250000", "western")).toBe("1.3M");
    expect(formatSkillDamage("1250000000", "western")).toBe("1.3B");
    expect(formatSkillDamage("12500", "cn")).toBe("1.3万");
    expect(formatSkillDamage("125000000", "cn")).toBe("1.3亿");
  });
});
