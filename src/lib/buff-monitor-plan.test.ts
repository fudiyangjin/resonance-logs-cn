import { describe, expect, it } from "vitest";

import {
  buildBuffTimelineIds,
  buildConfiguredBuffPlan,
  buildPublishedBuffIds,
} from "./buff-monitor-plan";
import {
  createDefaultCustomPanelStyle,
  createDefaultSkillMonitorProfile,
  type CustomPanelGroup,
  type SkillMonitorProfile,
} from "./settings-store";

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

describe("configured buff monitor plan", () => {
  it("routes custom and coverage buffs away from ordinary publication", () => {
    const value = profile();
    value.monitoredBuffIds = [1, 2, 3, 4];
    value.customPanelGroups = [
      panelGroup("manual", [
        {
          id: "custom_2",
          sourceType: "buff",
          sourceId: 2,
          label: "",
          format: "timer",
        },
      ]),
    ];
    value.buffCoverageEntries = [
      { id: "coverage_3", buffId: 3, label: "", showInLive: true },
      { id: "coverage_4", buffId: 4, label: "", showInLive: false },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect([...plan.normalDisplayIds]).toEqual([1, 2, 3, 4]);
    expect([...plan.customBuffIds]).toEqual([2]);
    expect([...plan.coverageBuffIds]).toEqual([3, 4]);
    expect([...plan.liveCoverageBuffIds]).toEqual([3]);
    expect([...plan.liveOwnedBuffIds]).toEqual([2, 3]);
    expect(buildPublishedBuffIds(plan)).toEqual([1, 2, 3, 4]);
    expect(buildBuffTimelineIds(plan)).toEqual([3, 4]);
  });

  it("uses monitor-all without carrying a redundant publication whitelist", () => {
    const value = profile();
    value.monitoredBuffIds = [1];
    value.individualMonitorAllGroup = {
      ...panelGroup("manual"),
      id: "all",
      buffIds: [],
      priorityBuffIds: [],
      monitorAll: true,
      iconSize: 44,
      columns: 6,
      rows: 3,
      gap: 6,
      showName: true,
      showTime: true,
      showLayer: true,
    };

    const plan = buildConfiguredBuffPlan(value);

    expect(plan.monitorAll).toBe(true);
    expect(buildPublishedBuffIds(plan)).toEqual([]);
  });

  it("publishes ordinary ids only from the active display mode", () => {
    const value = profile();
    value.monitoredBuffIds = [1];
    value.buffGroups = [
      {
        id: "group",
        name: "",
        buffIds: [2],
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
      },
    ];

    expect([...buildConfiguredBuffPlan(value).normalDisplayIds]).toEqual([1]);
    value.buffDisplayMode = "grouped";
    expect([...buildConfiguredBuffPlan(value).normalDisplayIds]).toEqual([2]);
  });

  it("keeps every coverage entry on the timeline while disabled clears output", () => {
    const value = profile();
    value.enabled = false;
    value.buffCoverageEntries = [
      { id: "coverage", buffId: 42, label: "", showInLive: false },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect([...plan.coverageBuffIds]).toEqual([42]);
    expect(buildPublishedBuffIds(plan)).toEqual([]);
    expect(buildBuffTimelineIds(plan)).toEqual([]);
  });

  it("keeps history-only coverage buffs out of publication", () => {
    const value = profile();
    value.buffCoverageEntries = [
      { id: "coverage", buffId: 42, label: "", showInLive: false },
    ];

    const plan = buildConfiguredBuffPlan(value);

    expect([...plan.liveOwnedBuffIds]).toEqual([]);
    expect(buildPublishedBuffIds(plan)).toEqual([]);
    expect(buildBuffTimelineIds(plan)).toEqual([42]);
  });

  it("publishes factor display candidates only when a factor panel exists", () => {
    const withoutFactor = buildConfiguredBuffPlan(profile());
    expect(withoutFactor.factorDisplayCandidateIds.size).toBe(0);

    const value = profile();
    value.customPanelGroups = [panelGroup("seasonCultivateFactor")];
    const withFactor = buildConfiguredBuffPlan(value);

    expect(withFactor.factorDisplayCandidateIds.size).toBeGreaterThan(0);
    expect(withFactor.factorPublishedIds.size).toBeGreaterThanOrEqual(
      withFactor.factorDisplayCandidateIds.size,
    );
    expect(buildPublishedBuffIds(withFactor)).toEqual(
      [...withFactor.factorPublishedIds].sort((left, right) => left - right),
    );
  });
});
