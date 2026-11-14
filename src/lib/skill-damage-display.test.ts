import { describe, expect, it } from "vitest";
import {
  formatSkillDamage,
  orderSkillDamageRows,
  sumSimultaneousSkillHits,
  withSkillDamageTargetCounts,
} from "./skill-damage-display";

const hit = (
  id: number,
  amount: string,
  batch = 1,
  skillId = id,
  targetUuid = "100",
) => ({ id, amount, batch, skillId, targetUuid, occurredAtMs: 1000 });

describe("skill damage scrolling", () => {
  it("puts new hits below for up and above for down without changing stored order", () => {
    const rows = [{ id: "old" }, { id: "new" }];
    expect(orderSkillDamageRows(rows, "up")).toEqual(rows);
    expect(orderSkillDamageRows(rows, "down")).toEqual([rows[1], rows[0]]);
    expect(rows.map((row) => row.id)).toEqual(["old", "new"]);
    expect(orderSkillDamageRows([], "down")).toEqual([]);
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

describe("multi-target hit counts", () => {
  it("counts distinct targets and keeps the count on the summed hit", () => {
    const hits = [
      hit(1, "100", 1, 10, "100"),
      hit(2, "200", 1, 10, "200"),
      hit(3, "50", 1, 10, "100"),
    ];
    const counted = withSkillDamageTargetCounts(hits);
    expect(sumSimultaneousSkillHits(counted)[0]).toMatchObject({
      amount: "350",
      hitCount: 2,
    });
    expect(hits[0]).not.toHaveProperty("hitCount");
  });

  it("keeps counts separate across skills and batches", () => {
    const hits = [
      hit(1, "100", 1, 1, "100"),
      hit(2, "100", 1, 2, "200"),
      hit(3, "100", 2, 1, "200"),
    ];
    expect(
      withSkillDamageTargetCounts(hits).map((entry) => entry.hitCount),
    ).toEqual([1, 1, 1]);
    expect(withSkillDamageTargetCounts([])).toEqual([]);
  });
});

describe("combined skill damage", () => {
  it("sums repeated hits from one skill without mutating the original hits", () => {
    const hits = [
      hit(1, "100", 1, 25523102),
      hit(2, "250", 1, 25523102),
      hit(3, "50", 1, 25523102),
    ];
    expect(sumSimultaneousSkillHits(hits)).toEqual([
      { ...hits[0], amount: "400" },
    ]);
    expect(hits.map((entry) => entry.amount)).toEqual(["100", "250", "50"]);
  });

  it("keeps skills and batches separate", () => {
    const hits = [hit(1, "100", 1, 1), hit(2, "250", 1, 2), hit(3, "50", 2, 1)];
    expect(sumSimultaneousSkillHits(hits)).toEqual(hits);
  });

  it("preserves exact large totals", () => {
    const hits = [
      hit(1, "9007199254740993", 1, 1),
      hit(2, "9007199254740993", 1, 1),
    ];
    expect(sumSimultaneousSkillHits(hits)).toEqual([
      { ...hits[0], amount: "18014398509481986" },
    ]);
    expect(sumSimultaneousSkillHits([])).toEqual([]);
  });
});
