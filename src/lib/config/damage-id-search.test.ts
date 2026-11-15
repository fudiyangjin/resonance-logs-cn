import { describe, expect, it } from "vitest";
import {
  getDamageCatalog,
  type DamageSearchResult,
} from "$lib/challenge-damage-search";
import { searchDamageIds } from "./damage-id-search";

/** The former scan-and-sort search, kept as the ordering reference. */
function referenceSearch(keyword: string): DamageSearchResult[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  const digits = normalized.replace(/^#/, "");
  const idKeyword = /^\d+$/.test(digits) ? digits : null;
  const matches: { entry: DamageSearchResult; rank: number }[] = [];
  for (const { nameLower, ...entry } of getDamageCatalog("zh-CN")) {
    let rank = Infinity;
    if (nameLower === normalized) rank = 1;
    else if (nameLower.includes(normalized)) rank = 3;
    if (!entry.isGroup && idKeyword !== null) {
      const text = String(entry.ids[0]);
      if (text === idKeyword) rank = 0;
      else if (text.startsWith(idKeyword)) rank = Math.min(rank, 2);
    }
    if (Number.isFinite(rank)) matches.push({ entry, rank });
  }
  const exactId = idKeyword === null ? NaN : Number(idKeyword);
  if (
    Number.isSafeInteger(exactId) &&
    exactId > 0 &&
    !matches.some(({ entry }) => !entry.isGroup && entry.ids[0] === exactId)
  ) {
    matches.push({
      entry: {
        key: `s:${exactId}`,
        name: `#${exactId}`,
        ids: [exactId],
        isGroup: false,
      },
      rank: 0,
    });
  }
  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.entry.isGroup) - Number(a.entry.isGroup) ||
      (a.entry.ids[0] ?? 0) - (b.entry.ids[0] ?? 0),
  );
  return matches.map(({ entry }) => entry);
}

describe("searchDamageIds", () => {
  it.each([
    "1",
    "11",
    "1100",
    "#110098",
    "110098140104",
    "2203110203",
    "浮游炮",
    "幸运",
    "法杖-幸运",
    "987654321987",
  ])("matches the reference ranking for %s", (keyword) => {
    const keys = (results: DamageSearchResult[]) =>
      results.map((entry) => entry.key);
    expect(keys(searchDamageIds(keyword, "zh-CN"))).toEqual(
      keys(referenceSearch(keyword)),
    );
  });

  it("lists every id under a one-digit prefix in ascending order", () => {
    // Catalog entries come back by reference, never copied per keystroke.
    const catalog = new Set<DamageSearchResult>(getDamageCatalog("zh-CN"));
    const singles = searchDamageIds("1", "zh-CN").filter(
      (entry) =>
        catalog.has(entry) &&
        !entry.isGroup &&
        String(entry.ids[0]).startsWith("1"),
    );
    const expected = getDamageCatalog("zh-CN").filter(
      (entry) => !entry.isGroup && String(entry.ids[0]).startsWith("1"),
    ).length;
    expect(singles.length).toBe(expected);
    const ids = singles.map((entry) => entry.ids[0] as number);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("returns nothing for a blank keyword", () => {
    expect(searchDamageIds("  ", "zh-CN")).toEqual([]);
  });

  it("puts the exact id first, then id prefixes", () => {
    expect(searchDamageIds("2203110203", "zh-CN")[0]).toMatchObject({
      ids: [2203110203],
      isGroup: false,
      name: "法杖-幸运",
    });
    const singles = searchDamageIds("#22031102", "zh-CN").filter(
      (entry) => !entry.isGroup,
    );
    expect(singles.length).toBeGreaterThan(1);
    for (const entry of singles) {
      expect(String(entry.ids[0])).toMatch(/^22031102/);
    }
  });

  it("still offers an exact id the tables do not list", () => {
    expect(searchDamageIds("987654321987", "zh-CN")[0]).toEqual({
      key: "s:987654321987",
      name: "#987654321987",
      ids: [987654321987],
      isGroup: false,
    });
  });

  it("returns every name match without truncating", () => {
    const keyword = "幸运";
    const expected = getDamageCatalog("zh-CN").filter((entry) =>
      entry.nameLower.includes(keyword),
    ).length;
    expect(searchDamageIds(keyword, "zh-CN")).toHaveLength(expected);
  });
});
