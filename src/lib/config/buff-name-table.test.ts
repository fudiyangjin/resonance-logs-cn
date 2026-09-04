import { describe, expect, it } from "vitest";
import {
  resolveBuffDisplayName,
  searchBuffsByName,
} from "./buff-name-table";

describe("resolveBuffDisplayName", () => {
  it("reads one alias key without rebuilding the alias table", () => {
    const aliases = {
      "11": "  迅捷  ",
      "12": "坚韧",
    };
    expect(resolveBuffDisplayName(11, aliases)).toBe("迅捷");
    expect(resolveBuffDisplayName(12, aliases)).toBe("坚韧");
  });

  it("falls back to the catalog id when the alias is blank", () => {
    expect(resolveBuffDisplayName(91_234_567, { "91234567": "   " })).toBe(
      "#91234567",
    );
  });
});

describe("searchBuffsByName", () => {
  it("surfaces a catalog entry with an empty NameDesign by exact id", () => {
    const results = searchBuffsByName("2033171");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      baseId: 2_033_171,
      name: "#2033171",
      inCatalog: false,
    });
  });

  it("surfaces an id missing from BuffName.json entirely", () => {
    const results = searchBuffsByName("91234567");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      baseId: 91_234_567,
      name: "#91234567",
      inCatalog: false,
    });
  });

  it("accepts a leading # for exact id search", () => {
    const results = searchBuffsByName("#91234567");
    expect(results).toHaveLength(1);
    expect(results[0]?.baseId).toBe(91_234_567);
  });

  it("does not duplicate a catalogued buff on exact id search", () => {
    const results = searchBuffsByName("866438");
    const matches = results.filter((item) => item.baseId === 866_438);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.inCatalog).toBe(true);
  });

  it.each(["0", "2147483648", "abc"])(
    "does not synthesize a result for %s",
    (keyword) => {
      const results = searchBuffsByName(keyword);
      expect(results.some((item) => !item.inCatalog)).toBe(false);
    },
  );

  it("keeps the synthesized result within a small limit", () => {
    const results = searchBuffsByName("91234567", undefined, 3);
    expect(results.some((item) => item.baseId === 91_234_567)).toBe(true);
  });
});
