import { describe, expect, it } from "vitest";
import {
  ensureTeammateBuffColumnStyles,
  orderedTeammateColumns,
  patchTeammateColumns,
  syncTeammateColumnOrder,
} from "./teammate-buff-columns";

describe("syncTeammateColumnOrder", () => {
  it("keeps the saved order and appends columns that are missing from it", () => {
    expect(
      syncTeammateColumnOrder({
        teammateBuffIds: [2, 1],
        teammateBuffCategories: ["food"],
        teammateBuffColumnOrder: ["buff:1", "category:food"],
      }),
    ).toEqual(["buff:1", "category:food", "buff:2"]);
  });

  it("drops stale and duplicate keys", () => {
    expect(
      syncTeammateColumnOrder({
        teammateBuffIds: [1],
        teammateBuffCategories: [],
        teammateBuffColumnOrder: ["buff:9", "buff:1", "buff:1"],
      }),
    ).toEqual(["buff:1"]);
  });
});

describe("orderedTeammateColumns", () => {
  it("returns columns in the reconciled order", () => {
    expect(
      orderedTeammateColumns({
        teammateBuffIds: [3],
        teammateBuffCategories: ["alchemy"],
        teammateBuffColumnOrder: ["category:alchemy", "buff:3"],
      }),
    ).toEqual([
      { key: "category:alchemy", kind: "category", categoryKey: "alchemy" },
      { key: "buff:3", kind: "buff", buffId: 3 },
    ]);
  });
});

describe("ensureTeammateBuffColumnStyles", () => {
  it("drops blank colors and columns that are not in the key list", () => {
    expect(
      ensureTeammateBuffColumnStyles(
        {
          "buff:1": { progressColor: "", valueColor: "#111111" },
          "buff:2": {},
          "buff:9": { progressColor: "#222222" },
        },
        ["buff:1", "buff:2"],
      ),
    ).toEqual({
      "buff:1": { valueColor: "#111111" },
    });
  });

  it("returns the same object when every kept style is already clean", () => {
    const styles = {
      "buff:1": { progressColor: "#abcdef" },
      "category:food": { valueColor: "#111111" },
    };
    expect(
      ensureTeammateBuffColumnStyles(styles, [
        "buff:1",
        "category:food",
        "buff:2",
      ]),
    ).toBe(styles);
  });
});

describe("patchTeammateColumns", () => {
  it("prunes the order and colors of a removed column in the same patch", () => {
    expect(
      patchTeammateColumns(
        {
          teammateBuffIds: [1, 2],
          teammateBuffCategories: ["food"],
          teammateBuffColumnOrder: ["buff:2", "category:food", "buff:1"],
          teammateBuffColumnStyles: {
            "buff:2": { progressColor: "#123456" },
            "buff:1": { valueColor: "#abcdef" },
          },
        },
        { teammateBuffIds: [1] },
      ),
    ).toEqual({
      teammateBuffIds: [1],
      teammateBuffColumnOrder: ["category:food", "buff:1"],
      teammateBuffColumnStyles: {
        "buff:1": { valueColor: "#abcdef" },
      },
    });
  });
});
