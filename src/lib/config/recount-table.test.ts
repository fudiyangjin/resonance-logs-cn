import { describe, expect, it } from "vitest";
import { getGameData } from "$lib/i18n/game-data";
import {
  aggregateRawSkillStats,
  buildSkillDisplayRow,
  groupSkillsByRecount,
  inlineSkillIdVisible,
  lookupChildDamageIdName,
  lookupDamageIdName,
  type RawSkillStatsLike,
} from "./recount-table";

const LOCALE = "zh-CN";

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

/** Picks two ids sharing `nameOf` plus one id with a different name. */
function pickSameNamePair(
  ids: readonly number[],
  nameOf: (id: number) => string,
): { same: [number, number]; distinct: number } | null {
  const firstIdByName = new Map<string, number>();
  let same: [number, number] | null = null;
  for (const id of ids) {
    const name = nameOf(id);
    const seen = firstIdByName.get(name);
    if (seen !== undefined) {
      same = [seen, id];
      break;
    }
    firstIdByName.set(name, id);
  }
  if (!same) return null;
  const sameName = nameOf(same[0]);
  const distinct = ids.find((id) => nameOf(id) !== sameName);
  return distinct === undefined ? null : { same, distinct };
}

function skillsOf(ids: readonly number[]): Record<number, RawSkillStatsLike> {
  return Object.fromEntries(
    ids.map((id, index) => [id, raw({ totalValue: String(100 + index) })]),
  );
}

describe("groupSkillsByRecount duplicate-name ids", () => {
  const recountEntries = Object.values(getGameData(LOCALE).recountTable);
  const groupedIds = new Set(recountEntries.flatMap((entry) => entry.DamageId));

  it("flags same-name skills outside any recount group", () => {
    const ungroupedIds = Object.keys(getGameData(LOCALE).damageAttrIdNames)
      .map(Number)
      .filter((id) => !groupedIds.has(id));
    const picked = pickSameNamePair(ungroupedIds, (id) =>
      lookupDamageIdName(id, LOCALE),
    );
    expect(picked).not.toBeNull();
    const { same, distinct } = picked!;

    const { groups, ungrouped } = groupSkillsByRecount(
      skillsOf([...same, distinct]),
      10,
      "1000",
      LOCALE,
    );

    expect(groups).toEqual([]);
    const flags = new Map(
      ungrouped.map((row) => [row.skillId, row.showSkillId]),
    );
    expect(flags.get(same[0])).toBe(true);
    expect(flags.get(same[1])).toBe(true);
    expect(flags.get(distinct)).toBe(false);
  });

  it("still flags same-name children within a recount group", () => {
    // An id listed by several entries belongs to the last one (map overwrite).
    const ownerById = new Map<number, number>();
    for (const entry of recountEntries) {
      for (const id of entry.DamageId) ownerById.set(id, entry.Id);
    }
    let picked: ReturnType<typeof pickSameNamePair> = null;
    for (const entry of recountEntries) {
      picked = pickSameNamePair(
        entry.DamageId.filter((id) => ownerById.get(id) === entry.Id),
        (id) => lookupChildDamageIdName(id, LOCALE),
      );
      if (picked) break;
    }
    expect(picked).not.toBeNull();
    const { same, distinct } = picked!;

    const { groups } = groupSkillsByRecount(
      skillsOf([...same, distinct]),
      10,
      "1000",
      LOCALE,
    );

    expect(groups).toHaveLength(1);
    const flags = new Map(
      groups[0]!.skills.map((row) => [row.skillId, row.showSkillId]),
    );
    expect(flags.get(same[0])).toBe(true);
    expect(flags.get(same[1])).toBe(true);
    expect(flags.get(distinct)).toBe(false);
  });
});

describe("inlineSkillIdVisible", () => {
  const duplicate = { showSkillId: true };
  const unique = { showSkillId: false };

  it("never shows an id on recount group rows", () => {
    for (const compact of [true, false]) {
      for (const idColumnVisible of [true, false]) {
        expect(
          inlineSkillIdVisible(duplicate, true, { idColumnVisible, compact }),
        ).toBe(false);
      }
    }
  });

  it("shows duplicate-name ids only while the ID column is hidden", () => {
    const table = { compact: false };
    expect(
      inlineSkillIdVisible(duplicate, false, {
        ...table,
        idColumnVisible: false,
      }),
    ).toBe(true);
    expect(
      inlineSkillIdVisible(duplicate, false, {
        ...table,
        idColumnVisible: true,
      }),
    ).toBe(false);
    expect(
      inlineSkillIdVisible(unique, false, { ...table, idColumnVisible: false }),
    ).toBe(false);
    expect(
      inlineSkillIdVisible(unique, false, { ...table, idColumnVisible: true }),
    ).toBe(false);
  });

  it("uses the name cell in compact mode for the ID column and duplicates", () => {
    const compact = { compact: true };
    expect(
      inlineSkillIdVisible(unique, false, {
        ...compact,
        idColumnVisible: true,
      }),
    ).toBe(true);
    expect(
      inlineSkillIdVisible(duplicate, false, {
        ...compact,
        idColumnVisible: false,
      }),
    ).toBe(true);
    expect(
      inlineSkillIdVisible(unique, false, {
        ...compact,
        idColumnVisible: false,
      }),
    ).toBe(false);
  });
});
