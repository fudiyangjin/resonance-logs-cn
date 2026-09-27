import { describe, expect, it } from "vitest";

import {
  allocateBuffCompositeId,
  buffCompositeAliases,
  buffCompositeMinActive,
  buffCompositeSpecs,
  buffIconSourceId,
  collectProfileBuffIds,
  ensureBuffComposites,
  mapProfileBuffIds,
  MAX_BUFF_COMPOSITE_MEMBERS,
  pruneUnknownCompositeRefs,
  type BuffComposite,
} from "./buff-composites";
import {
  createDefaultCustomPanelStyle,
  createDefaultSkillMonitorProfile,
  type BuffGroup,
  type SkillMonitorProfile,
} from "./settings-store";

function composite(overrides: Partial<BuffComposite> = {}): BuffComposite {
  return { id: -10, name: "Set", memberIds: [1, 2], ...overrides };
}

function group(buffIds: number[]): BuffGroup {
  return {
    id: "group",
    name: "",
    buffIds,
    priorityBuffIds: buffIds,
    monitorAll: false,
    position: { x: 0, y: 0 },
    iconSize: 44,
    columns: 6,
    rows: 3,
    gap: 6,
    showName: true,
    showTime: true,
    showLayer: true,
  };
}

/** A profile that references `id` in every place a buff id can live. */
function profileReferencing(id: number): SkillMonitorProfile {
  const profile = createDefaultSkillMonitorProfile("test");
  const key = String(id);
  return {
    ...profile,
    monitoredBuffIds: [id, 3],
    buffPriorityIds: [id],
    buffAlerts: {
      [key]: {
        thresholdSeconds: 5,
        highlightColor: "#fff",
        flash: false,
      },
    },
    buffVoiceConfigs: { [key]: {} },
    buffGroups: [group([id])],
    individualMonitorAllGroup: { ...group([]), priorityBuffIds: [id] },
    customPanelGroups: [
      {
        id: "panel",
        name: "",
        kind: "manual",
        entries: [
          {
            id: "buff",
            sourceType: "buff",
            sourceId: id,
            label: "",
            format: "timer",
          },
          {
            id: "counter",
            sourceType: "counter",
            sourceId: id,
            label: "",
            format: "timer",
          },
        ],
        position: { x: 0, y: 0 },
        scale: 1,
        style: createDefaultCustomPanelStyle(),
      },
    ],
    buffCoverageEntries: [
      { id: "coverage", buffId: id, label: "", showInLive: true },
    ],
    overlayPositions: {
      ...profile.overlayPositions,
      iconBuffPositions: { [id]: { x: 1, y: 2 } },
    },
    overlaySizes: {
      ...profile.overlaySizes,
      iconBuffSizes: { [id]: 40 },
    },
  };
}

describe("composite buff definitions", () => {
  it("keeps only well-formed composites", () => {
    const many = Array.from({ length: 12 }, (_, index) => index + 1);
    expect(
      ensureBuffComposites([
        composite({ name: "  Trimmed  ", memberIds: [1, 1, 2, -3, 0] }),
        composite({ id: -10 }),
        composite({ id: 5 }),
        composite({ id: -11, memberIds: [4] }),
        composite({ id: -12, memberIds: many, iconBuffId: 99 }),
        composite({ id: -13, iconBuffId: 2 }),
        null,
      ]),
    ).toEqual([
      { id: -10, name: "Trimmed", memberIds: [1, 2] },
      {
        id: -12,
        name: "Set",
        memberIds: many.slice(0, MAX_BUFF_COMPOSITE_MEMBERS),
      },
      { id: -13, name: "Set", memberIds: [1, 2], iconBuffId: 2 },
    ]);
    expect(ensureBuffComposites(undefined)).toEqual([]);
  });

  it("keeps a threshold only below the member count", () => {
    const composites = ensureBuffComposites([
      composite({ id: -1, memberIds: [1, 2, 3], minActive: 2 }),
      composite({ id: -2, memberIds: [1, 2, 3], minActive: 3 }),
      composite({ id: -3, memberIds: [1, 2, 3], minActive: 0 }),
      composite({ id: -4, memberIds: [1, 2, 3], minActive: 1.5 }),
      composite({ id: -5, memberIds: [1, 2, 3], minActive: 1 }),
    ]);
    expect(composites.map((item) => item.minActive)).toEqual([
      2,
      undefined,
      undefined,
      undefined,
      1,
    ]);
    expect(composites.map(buffCompositeMinActive)).toEqual([2, 3, 3, 3, 1]);
    expect(buffCompositeSpecs(composites.slice(0, 2))).toEqual([
      { id: -1, memberIds: [1, 2, 3], minActive: 2 },
      { id: -2, memberIds: [1, 2, 3] },
    ]);
  });

  it("allocates a random unused negative id", () => {
    const existing = [composite({ id: -1 })];
    expect(allocateBuffCompositeId(existing, () => 0.5)).toBe(-1_073_741_824);
    // A random draw that keeps colliding falls back below every used id.
    expect(allocateBuffCompositeId(existing, () => 0)).toBe(-2);
  });

  it("derives backend specs, names and icon sources", () => {
    const composites = [
      composite(),
      composite({ id: -20, name: "", iconBuffId: 2 }),
    ];
    expect(buffCompositeSpecs(composites)).toEqual([
      { id: -10, memberIds: [1, 2] },
      { id: -20, memberIds: [1, 2] },
    ]);
    expect(buffCompositeAliases(composites)).toEqual({ "-10": "Set" });
    expect(buffIconSourceId(-20, composites)).toBe(2);
    expect(buffIconSourceId(-10, composites)).toBe(-10);
    expect(buffIconSourceId(7, composites)).toBe(7);
  });
});

describe("profile buff references", () => {
  it("rewrites every buff reference and leaves counters alone", () => {
    const mapped = mapProfileBuffIds(profileReferencing(-10), (id) =>
      id === -10 ? -20 : id,
    );

    expect(mapped.monitoredBuffIds).toEqual([-20, 3]);
    expect(mapped.buffPriorityIds).toEqual([-20]);
    expect(Object.keys(mapped.buffAlerts ?? {})).toEqual(["-20"]);
    expect(Object.keys(mapped.buffVoiceConfigs ?? {})).toEqual(["-20"]);
    expect(mapped.buffGroups[0]!.buffIds).toEqual([-20]);
    expect(mapped.individualMonitorAllGroup?.priorityBuffIds).toEqual([-20]);
    expect(
      mapped.customPanelGroups?.[0]!.entries.map((entry) => entry.sourceId),
    ).toEqual([-20, -10]);
    expect(mapped.buffCoverageEntries?.[0]!.buffId).toBe(-20);
    expect(Object.keys(mapped.overlayPositions.iconBuffPositions)).toEqual([
      "-20",
    ]);
    expect(Object.keys(mapped.overlaySizes.iconBuffSizes)).toEqual(["-20"]);
  });

  it("drops references mapped to null", () => {
    const pruned = mapProfileBuffIds(profileReferencing(-10), (id) =>
      id === -10 ? null : id,
    );

    expect([...collectProfileBuffIds(pruned)]).toEqual([3]);
    expect(pruned.customPanelGroups?.[0]!.entries).toHaveLength(1);
    expect(pruned.buffCoverageEntries).toEqual([]);
  });

  it("prunes only composites that are not defined", () => {
    const profile = profileReferencing(-10);
    expect(pruneUnknownCompositeRefs(profile, new Set([-10]))).toBe(profile);

    const pruned = pruneUnknownCompositeRefs(profile, new Set([-99]));
    expect(collectProfileBuffIds(pruned).has(-10)).toBe(false);
    expect(pruned.monitoredBuffIds).toEqual([3]);
  });
});
