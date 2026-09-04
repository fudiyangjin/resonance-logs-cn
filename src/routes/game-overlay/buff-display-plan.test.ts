import { describe, expect, it } from "vitest";

import { buildConfiguredBuffPlan } from "$lib/buff-monitor-plan";
import {
  createDefaultCustomPanelStyle,
  createDefaultSkillMonitorProfile,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import {
  buildRuntimeFactorPlan,
  shouldDisplayOrdinaryBuff,
  type FactorDisplayCatalog,
} from "./buff-display-plan";

const catalog: FactorDisplayCatalog = {
  effectBuffIdsByItem: new Map([[10, [101, 102]]]),
  slotTemplateIdByItem: new Map([[10, "slot_10"]]),
  nodeTemplates: [
    {
      templateId: 20,
      name: "active",
      displayBuffs: [{ buffId: 201 }, { buffId: 202 }],
      suppressRules: [{ whenBuffActive: 202, hide: [201] }],
    },
    {
      templateId: 21,
      name: "inactive",
      displayBuffs: [{ buffId: 211 }],
      suppressRules: [{ whenBuffActive: 211, hide: [201] }],
    },
  ],
};

function profile(withFactor = true): SkillMonitorProfile {
  const value = {
    ...createDefaultSkillMonitorProfile("test", "__test__"),
    enabled: true,
  };
  if (withFactor) {
    value.customPanelGroups = [
      {
        id: "factor",
        name: "",
        kind: "seasonCultivateFactor" as const,
        entries: [],
        position: { x: 0, y: 0 },
        scale: 1,
        style: createDefaultCustomPanelStyle(),
      },
    ];
  }
  return value;
}

describe("runtime factor display plan", () => {
  it("conservatively owns factor candidates before season data is known", () => {
    const configured = {
      ...buildConfiguredBuffPlan(profile()),
      factorDisplayCandidateIds: new Set([101, 201]),
    };

    const plan = buildRuntimeFactorPlan(
      configured,
      { seasonId: 0, slotItemIds: [], activeTemplateIds: new Set() },
      catalog,
    );

    expect(plan.mode).toBe("unknown");
    expect([...plan.ownedBuffIds]).toEqual([101, 201]);
  });

  it("resolves S3 effect ownership from runtime slot items", () => {
    const configured = buildConfiguredBuffPlan(profile());
    const plan = buildRuntimeFactorPlan(
      configured,
      {
        seasonId: 3,
        slotItemIds: [10, 10],
        activeTemplateIds: new Set(),
      },
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
    expect([...plan.ownedBuffIds]).toEqual([101, 102]);
  });

  it("scopes S4 rows and suppression rules to active templates", () => {
    const configured = buildConfiguredBuffPlan(profile());
    const plan = buildRuntimeFactorPlan(
      configured,
      {
        seasonId: 4,
        slotItemIds: [],
        activeTemplateIds: new Set([20]),
      },
      catalog,
    );

    expect(plan.mode).toBe("node");
    expect(plan.nodeBuffs.map((entry) => entry.buffId)).toEqual([201, 202]);
    expect(plan.suppressRules).toEqual([{ whenBuffActive: 202, hide: [201] }]);
    expect(plan.ownedBuffIds.has(211)).toBe(false);
  });

  it("yields ordinary display only to sources rendered live elsewhere", () => {
    const value = profile(false);
    value.monitoredBuffIds = [1, 2, 3, 4];
    value.customPanelGroups = [
      {
        id: "manual",
        name: "",
        kind: "manual",
        entries: [
          {
            id: "custom_2",
            sourceType: "buff",
            sourceId: 2,
            label: "",
            format: "timer",
          },
        ],
        position: { x: 0, y: 0 },
        scale: 1,
        style: createDefaultCustomPanelStyle(),
      },
    ];
    value.buffCoverageEntries = [
      { id: "coverage_3", buffId: 3, label: "", showInLive: false },
      { id: "coverage_5", buffId: 5, label: "", showInLive: true },
    ];
    const configured = buildConfiguredBuffPlan(value);
    const factor = {
      ...buildRuntimeFactorPlan(
        buildConfiguredBuffPlan(profile()),
        {
          seasonId: 3,
          slotItemIds: [10],
          activeTemplateIds: new Set(),
        },
        catalog,
      ),
      ownedBuffIds: new Set([4]),
    };

    expect(shouldDisplayOrdinaryBuff(configured, factor, 1)).toBe(true);
    expect(shouldDisplayOrdinaryBuff(configured, factor, 2)).toBe(false);
    expect(shouldDisplayOrdinaryBuff(configured, factor, 3)).toBe(true);
    expect(shouldDisplayOrdinaryBuff(configured, factor, 4)).toBe(false);
    expect(shouldDisplayOrdinaryBuff(configured, factor, 5)).toBe(false);
    expect(
      shouldDisplayOrdinaryBuff(
        { ...configured, monitorAll: true },
        factor,
        99,
      ),
    ).toBe(true);
    expect(
      shouldDisplayOrdinaryBuff({ ...configured, monitorAll: true }, factor, 3),
    ).toBe(true);

    const restored = buildConfiguredBuffPlan({
      ...value,
      customPanelGroups: [],
      buffCoverageEntries: [],
    });
    expect(shouldDisplayOrdinaryBuff(restored, factor, 2)).toBe(true);
    expect(shouldDisplayOrdinaryBuff(restored, factor, 3)).toBe(true);
  });
});
