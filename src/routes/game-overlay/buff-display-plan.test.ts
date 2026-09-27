import { describe, expect, it } from "vitest";

import {
  buildRuntimeFactorPlan,
  type FactorDisplayCatalog,
  type RuntimeFactorContext,
} from "./buff-display-plan";

const catalog: FactorDisplayCatalog = {
  effectBuffIdsByItem: new Map([[10, [101, 102]]]),
  slotTemplateIdByItem: new Map([[10, "slot_10"]]),
  nodeTemplates: [
    {
      templateId: 20,
      name: "active",
      displayBuffs: [{ buffId: 201 }, { buffId: 202 }],
    },
    {
      templateId: 21,
      name: "inactive",
      displayBuffs: [{ buffId: 211 }],
    },
  ],
};

function context(
  overrides: Partial<RuntimeFactorContext>,
): RuntimeFactorContext {
  return {
    seasonId: 0,
    slotItemIds: [],
    activeTemplateIds: new Set(),
    ...overrides,
  };
}

describe("runtime factor display plan", () => {
  it("renders nothing without a factor panel", () => {
    const plan = buildRuntimeFactorPlan(
      false,
      context({ seasonId: 3, slotItemIds: [10] }),
      catalog,
    );

    expect(plan).toEqual({ mode: "disabled", legacyItems: [], nodeBuffs: [] });
  });

  it("renders nothing before season data is known", () => {
    const plan = buildRuntimeFactorPlan(true, context({}), catalog);

    expect(plan.mode).toBe("disabled");
    expect(plan.legacyItems).toEqual([]);
    expect(plan.nodeBuffs).toEqual([]);
  });

  it("resolves S3 effect rows from runtime slot items", () => {
    const plan = buildRuntimeFactorPlan(
      true,
      context({ seasonId: 3, slotItemIds: [10, 10] }),
      catalog,
    );

    expect(plan.mode).toBe("factor");
    expect(plan.legacyItems).toEqual([
      {
        itemId: 10,
        ruleId: 900_000_010,
        slotTemplateId: "slot_10",
        effectBuffIds: [101, 102],
      },
    ]);
  });

  it("scopes S4 rows to active templates", () => {
    const plan = buildRuntimeFactorPlan(
      true,
      context({ seasonId: 4, activeTemplateIds: new Set([20]) }),
      catalog,
    );

    expect(plan.mode).toBe("node");
    expect(plan.nodeBuffs.map((entry) => entry.buffId)).toEqual([201, 202]);
  });
});
