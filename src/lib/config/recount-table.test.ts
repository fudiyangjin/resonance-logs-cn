import { describe, expect, it } from "vitest";
import {
  aggregateRawSkillStats,
  buildSkillDisplayRow,
  type RawSkillStatsLike,
} from "./recount-table";

function raw(values: Partial<RawSkillStatsLike>): RawSkillStatsLike {
  return {
    totalValue: "0",
    effectiveTotalValue: "0",
    hits: "0",
    critHits: "0",
    critTotalValue: "0",
    luckyHits: "0",
    luckyTotalValue: "0",
    triggerHits: "0",
    blockHits: "0",
    luckyBlockHits: "0",
    ...values,
  };
}

describe("aggregateRawSkillStats", () => {
  it("keeps group totals exact and applies trigger-hit fallback per skill", () => {
    const result = aggregateRawSkillStats([
      raw({
        totalValue: "9007199254740993",
        hits: "7",
        triggerHits: "0",
      }),
      raw({ totalValue: "11", hits: "5", triggerHits: "3" }),
    ]);

    expect(result.totalValue).toBe(9_007_199_254_741_004n);
    expect(result.hits).toBe(12n);
    expect(result.triggerHits).toBe(10n);
  });

  it("merges extrema by taking min and max instead of summing", () => {
    const result = aggregateRawSkillStats([
      raw({ extrema: { min: "40", max: "90" } }),
      raw({ extrema: { min: "12", max: "80" } }),
      raw({}),
    ]);

    expect(result.extrema).toEqual({ min: 12n, max: 90n });
  });
});

describe("buildSkillDisplayRow", () => {
  it("computes average damage with bigint-exact ipcRatio", () => {
    const row = buildSkillDisplayRow(
      1,
      raw({
        totalValue: "9007199254740993",
        hits: "3",
        extrema: { min: "1", max: "9007199254740991" },
      }),
      10,
      "9007199254740993",
    );

    expect(row.avgDmg).toBe(3_002_399_751_580_331);
    expect(row.maxDmg).toBe(9_007_199_254_740_991);
    expect(row.minDmg).toBe(1);
  });
});
