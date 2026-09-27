import { describe, expect, it } from "vitest";

import { buildConfiguredBuffPlan, isOrdinaryBuff } from "./buff-monitor-plan";
import {
  createDefaultCustomPanelStyle,
  createDefaultSkillMonitorProfile,
  type BuffGroup,
  type CustomPanelGroup,
  type SkillMonitorProfile,
} from "./settings-store";
import { getSeasonNodeBuffIds } from "./skill-mappings";

function profile(): SkillMonitorProfile {
  return {
    ...createDefaultSkillMonitorProfile("test", "__test__"),
    enabled: true,
  };
}

function panelGroup(
  kind: CustomPanelGroup["kind"],
  entries: CustomPanelGroup["entries"] = [],
): CustomPanelGroup {
  return {
    id: `group_${kind}`,
    name: "",
    kind,
    entries,
    position: { x: 0, y: 0 },
    scale: 1,
    style: createDefaultCustomPanelStyle(),
  };
}

function buffEntry(sourceId: number): CustomPanelGroup["entries"][number] {
  return {
    id: `custom_${sourceId}`,
    sourceType: "buff",
    sourceId,
    label: "",
    format: "timer",
  };
}

function buffGroup(overrides: Partial<BuffGroup>): BuffGroup {
  return {
    id: "group",
    name: "",
    buffIds: [],
    priorityBuffIds: [],
    monitorAll: false,
    position: { x: 0, y: 0 },
    iconSize: 44,
    columns: 6,
    rows: 3,
    gap: 6,
    showName: true,
    showTime: true,
    showLayer: true,
    ...overrides,
  };
}

function withMonitorAll(value: SkillMonitorProfile): SkillMonitorProfile {
  value.individualMonitorAllGroup = buffGroup({
    id: "all",
    monitorAll: true,
  });
  return value;
}

function withVisibility(
  value: SkillMonitorProfile,
  visibility: Partial<SkillMonitorProfile["overlayVisibility"]>,
): SkillMonitorProfile {
  value.overlayVisibility = { ...value.overlayVisibility, ...visibility };
  return value;
}

describe("configured buff monitor plan", () => {
  it("keeps explicit ordinary buffs visible when other areas show them too", () => {
    const value = withVisibility(profile(), { showBuffCoverageGroup: true });
    value.monitoredBuffIds = [1, 2, 3, 4];
    value.customPanelGroups = [panelGroup("manual", [buffEntry(2)])];
    value.buffCoverageEntries = [
      { id: "coverage_3", buffId: 3, label: "", showInLive: true },
      { id: "coverage_4", buffId: 4, label: "", showInLive: false },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect([...plan.ordinaryIds]).toEqual([1, 2, 3, 4]);
    for (const id of [1, 2, 3, 4]) {
      expect(isOrdinaryBuff(plan, id)).toBe(true);
    }
    expect(plan.publishedIds).toEqual([1, 2, 3, 4]);
    expect(plan.timelineIds).toEqual([3, 4]);
  });

  it("leaves buffs shown by other rendered areas out of the catch-all", () => {
    const value = withVisibility(withMonitorAll(profile()), {
      showBuffCoverageGroup: true,
    });
    value.customPanelGroups = [panelGroup("manual", [buffEntry(20)])];
    value.buffCoverageEntries = [
      { id: "coverage_30", buffId: 30, label: "", showInLive: true },
      { id: "coverage_31", buffId: 31, label: "", showInLive: false },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect(plan.monitorAll).toBe(true);
    expect(isOrdinaryBuff(plan, 20)).toBe(false);
    expect(isOrdinaryBuff(plan, 30)).toBe(false);
    expect(isOrdinaryBuff(plan, 31)).toBe(true);
    expect(isOrdinaryBuff(plan, 99)).toBe(true);
  });

  it("returns buffs of hidden areas to the catch-all", () => {
    const value = withVisibility(withMonitorAll(profile()), {
      showCustomPanelGroup: false,
      showBuffCoverageGroup: false,
    });
    value.customPanelGroups = [panelGroup("manual", [buffEntry(20)])];
    value.buffCoverageEntries = [
      { id: "coverage_30", buffId: 30, label: "", showInLive: true },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect(isOrdinaryBuff(plan, 20)).toBe(true);
    expect(isOrdinaryBuff(plan, 30)).toBe(true);
    // Hidden areas still get their buffs published.
    expect(plan.publishedIds).toEqual([20, 30]);
  });

  it("keeps every factor candidate out of the catch-all without runtime data", () => {
    const candidateId = getSeasonNodeBuffIds()[0]!;
    const value = withMonitorAll(profile());
    value.customPanelGroups = [panelGroup("seasonCultivateFactor")];

    const shown = buildConfiguredBuffPlan(value);
    expect(isOrdinaryBuff(shown, candidateId)).toBe(false);
    expect(shown.publishedIds).toContain(candidateId);

    const hidden = buildConfiguredBuffPlan(
      withVisibility(structuredClone(value), { showCustomPanelGroup: false }),
    );
    expect(isOrdinaryBuff(hidden, candidateId)).toBe(true);

    const withoutPanel = buildConfiguredBuffPlan(withMonitorAll(profile()));
    expect(isOrdinaryBuff(withoutPanel, candidateId)).toBe(true);
    expect(withoutPanel.publishedIds).not.toContain(candidateId);

    const explicit = structuredClone(value);
    explicit.monitoredBuffIds = [candidateId];
    expect(isOrdinaryBuff(buildConfiguredBuffPlan(explicit), candidateId)).toBe(
      true,
    );
  });

  it("never lets composite ids into the catch-all", () => {
    const catchAll = buildConfiguredBuffPlan(withMonitorAll(profile()));
    expect(isOrdinaryBuff(catchAll, -5)).toBe(false);

    const value = profile();
    value.monitoredBuffIds = [-5];
    const explicit = buildConfiguredBuffPlan(value);
    expect(isOrdinaryBuff(explicit, -5)).toBe(true);
    expect(explicit.publishedIds).toEqual([-5]);
  });

  it("publishes declared buffs under monitor-all too", () => {
    const value = withMonitorAll(profile());
    value.monitoredBuffIds = [1];

    const plan = buildConfiguredBuffPlan(value);

    expect(plan.monitorAll).toBe(true);
    expect(plan.publishedIds).toEqual([1]);
  });

  it("uses ordinary ids only from the active display mode", () => {
    const value = profile();
    value.monitoredBuffIds = [1];
    value.buffGroups = [buffGroup({ buffIds: [2] })];

    expect([...buildConfiguredBuffPlan(value).ordinaryIds]).toEqual([1]);
    value.buffDisplayMode = "grouped";
    expect([...buildConfiguredBuffPlan(value).ordinaryIds]).toEqual([2]);
  });

  it("clears publication and timeline while the profile is disabled", () => {
    const value = profile();
    value.enabled = false;
    value.monitoredBuffIds = [1];
    value.buffCoverageEntries = [
      { id: "coverage", buffId: 42, label: "", showInLive: true },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect(plan.publishedIds).toEqual([]);
    expect(plan.timelineIds).toEqual([]);
  });

  it("keeps history-only coverage buffs out of publication", () => {
    const value = profile();
    value.buffCoverageEntries = [
      { id: "coverage", buffId: 42, label: "", showInLive: false },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect(plan.publishedIds).toEqual([]);
    expect(plan.timelineIds).toEqual([42]);
  });

  it("lets the flower section keep its buffs out of the catch-all only while shown", () => {
    const flowerIds = [2202713, 2202714, 2202715, 2202716];
    const flowerProfile = (showResourceGroup: boolean) => {
      const value = withVisibility(withMonitorAll(profile()), {
        showResourceGroup,
      });
      value.selectedClass = "verdant_oracle";
      return value;
    };

    const shownPlan = buildConfiguredBuffPlan(flowerProfile(true));
    for (const id of flowerIds) {
      expect(isOrdinaryBuff(shownPlan, id)).toBe(false);
    }
    expect(shownPlan.publishedIds).toEqual(expect.arrayContaining(flowerIds));

    const hiddenPlan = buildConfiguredBuffPlan(flowerProfile(false));
    for (const id of flowerIds) {
      expect(isOrdinaryBuff(hiddenPlan, id)).toBe(true);
    }

    const sectionHidden = flowerProfile(true);
    sectionHidden.resourceSectionLayouts = {
      "flowerRotation:2202716": {
        position: { x: 0, y: 0 },
        scale: 1,
        visible: false,
      },
    };
    const sectionHiddenPlan = buildConfiguredBuffPlan(sectionHidden);
    for (const id of flowerIds) {
      expect(isOrdinaryBuff(sectionHiddenPlan, id)).toBe(true);
    }

    const otherClass = flowerProfile(true);
    otherClass.selectedClass = "wind_knight";
    for (const id of flowerIds) {
      expect(isOrdinaryBuff(buildConfiguredBuffPlan(otherClass), id)).toBe(
        true,
      );
    }
  });
});
