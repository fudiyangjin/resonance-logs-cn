import { describe, expect, it } from "vitest";
import {
  largestSimultaneousSkillHits,
  sumSimultaneousSkillHits,
  withSkillDamageTargetCounts,
} from "./skill-damage-display";

const hit = (
  id: string,
  amount: string,
  batchId?: string,
  occurredAtMs = 1000,
) => ({
  id,
  amount,
  ...(batchId === undefined ? {} : { batchId }),
  occurredAtMs,
  skillId: Number(id),
});

describe("multi-target hit counts", () => {
  it("counts distinct targets and retains the count in both display modes", () => {
    const hits = [
      { ...hit("1", "100", "1"), skillId: 10, targetUuid: "100" },
      { ...hit("2", "200", "1"), skillId: 10, targetUuid: "200" },
      { ...hit("3", "50", "1"), skillId: 10, targetUuid: "100" },
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
      { ...hit("1", "100", "1"), targetUuid: "100" },
      { ...hit("2", "100", "1"), targetUuid: "200" },
      { ...hit("1", "100", "2"), targetUuid: "200" },
    ];
    expect(
      withSkillDamageTargetCounts(hits).map((entry) => entry.hitCount),
    ).toEqual([1, 1, 1]);
  });

  it("does not infer multiple targets when older payloads omit target IDs", () => {
    expect(
      withSkillDamageTargetCounts([hit("1", "100"), hit("1", "200")]).map(
        (entry) => entry.hitCount,
      ),
    ).toEqual([1, 1]);
    expect(withSkillDamageTargetCounts([])).toEqual([]);
  });
});

describe("combined skill damage", () => {
  it("sums repeated hits from one skill without mutating the original hits", () => {
    const hits = [
      hit("1", "100", "1"),
      hit("2", "250", "1"),
      hit("3", "50", "1"),
    ].map((entry) => ({ ...entry, skillId: 25523102 }));
    expect(sumSimultaneousSkillHits(hits)).toEqual([
      { ...hits[0], amount: "400" },
    ]);
    expect(hits.map((entry) => entry.amount)).toEqual(["100", "250", "50"]);
  });

  it("keeps skills and batches separate", () => {
    const hits = [
      hit("1", "100", "1"),
      hit("2", "250", "1"),
      hit("1", "50", "2"),
    ];
    expect(sumSimultaneousSkillHits(hits)).toEqual(hits);
  });

  it("preserves exact large totals and supports timestamp fallback", () => {
    const hits = [hit("1", "9007199254740993"), hit("1", "9007199254740993")];
    expect(sumSimultaneousSkillHits(hits)).toEqual([
      { ...hits[0], amount: "18014398509481986" },
    ]);
    expect(sumSimultaneousSkillHits([])).toEqual([]);
  });
});

describe("largest simultaneous skill damage", () => {
  it("keeps only the largest hit and its skill from each batch", () => {
    const hits = [
      hit("1", "90", "1"),
      hit("2", "200", "1"),
      hit("3", "100", "1"),
      hit("4", "50", "2"),
    ];
    expect(largestSimultaneousSkillHits(hits)).toEqual([hits[1], hits[3]]);
  });

  it("compares exact large integers and keeps the first equal hit", () => {
    const hits = [
      hit("1", "9007199254740992", "1"),
      hit("2", "9007199254740993", "1"),
      hit("3", "9007199254740993", "1"),
    ];
    expect(largestSimultaneousSkillHits(hits)).toEqual([hits[1]]);
  });

  it("keeps separate batches even when their timestamps match", () => {
    const hits = [hit("1", "100", "1"), hit("2", "200", "2")];
    expect(largestSimultaneousSkillHits(hits)).toEqual(hits);
  });

  it("supports earlier payloads using timestamps and handles empty input", () => {
    const hits = [
      hit("1", "100"),
      hit("2", "200"),
      hit("3", "50", undefined, 1001),
    ];
    expect(largestSimultaneousSkillHits(hits)).toEqual([hits[1], hits[2]]);
    expect(largestSimultaneousSkillHits([])).toEqual([]);
  });
});
