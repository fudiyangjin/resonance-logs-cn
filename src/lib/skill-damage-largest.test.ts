import { describe, expect, it } from "vitest";
import {
  largestSimultaneousSkillHits,
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

describe("multi-target hit counts", () => {
  it("counts distinct targets and retains the count in both display modes", () => {
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
    expect(largestSimultaneousSkillHits(counted)[0]).toMatchObject({
      amount: "200",
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

describe("largest simultaneous skill damage", () => {
  it("keeps only the largest hit and its skill from each batch", () => {
    const hits = [
      hit(1, "90", 1),
      hit(2, "200", 1),
      hit(3, "100", 1),
      hit(4, "50", 2),
    ];
    expect(largestSimultaneousSkillHits(hits)).toEqual([hits[1], hits[3]]);
  });

  it("compares exact large integers and keeps the first equal hit", () => {
    const hits = [
      hit(1, "9007199254740992", 1),
      hit(2, "9007199254740993", 1),
      hit(3, "9007199254740993", 1),
    ];
    expect(largestSimultaneousSkillHits(hits)).toEqual([hits[1]]);
    expect(largestSimultaneousSkillHits([])).toEqual([]);
  });
});
