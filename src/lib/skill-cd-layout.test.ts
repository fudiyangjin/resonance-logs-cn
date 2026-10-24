import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_CD_GAP,
  DEFAULT_SKILL_CD_REGION_ID,
  MAX_SKILL_CD_REGIONS,
  changeSkillCdSelection,
  createDefaultSkillCdRegion,
  normalizeSkillCdRegions,
  resetSkillCdRegionPositions,
  resetSkillCdRegionScales,
  setSkillCdRegionLayout,
  skillCdAt,
  skillCdBounds,
  skillCdEntries,
  type SkillCdAction,
  type SkillCdGridAction,
  type SkillCdPosition,
  type SkillCdRegion,
  type SkillCdSelection,
} from "./skill-cd-layout";

const R1 = DEFAULT_SKILL_CD_REGION_ID;

function region(
  id: string,
  positions: Record<number, SkillCdPosition> = {},
  extra: Partial<SkillCdRegion> = {},
): SkillCdRegion {
  return { ...createDefaultSkillCdRegion(id), positions, ...extra };
}

type Selection = {
  monitoredSkillIds: number[];
  skillCdRegions: SkillCdRegion[];
};

function change(selection: SkillCdSelection, action: SkillCdAction): Selection {
  const result = changeSkillCdSelection(selection, action);
  if (!result.ok) throw new Error(result.reason);
  return {
    monitoredSkillIds: result.monitoredSkillIds,
    skillCdRegions: result.skillCdRegions,
  };
}

/** A grid action on region 1. */
function grid(action: SkillCdGridAction, regionId = R1): SkillCdAction {
  return { ...action, regionId };
}

const base = (): Selection => ({
  monitoredSkillIds: [20, 10],
  skillCdRegions: [
    region(R1, { 20: { row: 0, column: 0 }, 10: { row: 1, column: 3 } }),
  ],
});

/** Region 1 holds 20 and 10, region "b" holds 30. */
const twoRegions = (): Selection => ({
  monitoredSkillIds: [20, 10, 30],
  skillCdRegions: [
    region(R1, { 20: { row: 0, column: 0 }, 10: { row: 1, column: 3 } }),
    region(
      "b",
      { 30: { row: 0, column: 0 } },
      { rows: 1, columns: 2, position: { x: 300, y: 80 }, scale: 1.5 },
    ),
  ],
});

function placements(selection: Selection): number[][] {
  return selection.skillCdRegions.map((r) =>
    Object.keys(r.positions)
      .map(Number)
      .sort((a, b) => a - b),
  );
}

function expectEachSkillInOneRegion(selection: Selection) {
  const placed = placements(selection).flat();
  expect([...placed].sort((a, b) => a - b)).toEqual(
    [...selection.monitoredSkillIds].sort((a, b) => a - b),
  );
}

describe("skill CD regions: normalization", () => {
  it.each([0, 1, 2, 10])(
    "migrates %i legacy skills into region 1 in selection order",
    (count) => {
      const ids = Array.from({ length: count }, (_, i) => 20 - i);
      const [only, ...rest] = normalizeSkillCdRegions({
        monitoredSkillIds: ids,
      });
      expect(rest).toEqual([]);
      expect(only!.id).toBe(R1);
      expect(only!.rows).toBe(2);
      expect(only!.columns).toBe(5);
      ids.forEach((id, i) =>
        expect(only!.positions[id]).toEqual({
          row: Math.floor(i / 5),
          column: i % 5,
        }),
      );
    },
  );

  it("builds region 1 from the legacy layout, group position and scale", () => {
    expect(
      normalizeSkillCdRegions({
        monitoredSkillIds: [7],
        skillCdLayout: {
          rows: 3,
          columns: 4,
          positions: { 7: { row: 2, column: 3 } },
        },
        overlayPositions: { skillCdGroup: { x: 120, y: 60 } },
        overlaySizes: { skillCdGroupScale: 1.4 },
      }),
    ).toEqual([
      {
        id: R1,
        name: "",
        rows: 3,
        columns: 4,
        positions: { 7: { row: 2, column: 3 } },
        position: { x: 120, y: 60 },
        scale: 1.4,
        gap: DEFAULT_SKILL_CD_GAP,
      },
    ]);
  });

  it("treats an empty regions array as legacy data", () => {
    expect(
      normalizeSkillCdRegions({ monitoredSkillIds: [1], skillCdRegions: [] }),
    ).toEqual([region(R1, { 1: { row: 0, column: 0 } })]);
  });

  it("prefers regions over a leftover legacy layout", () => {
    const regions = normalizeSkillCdRegions({
      monitoredSkillIds: [1],
      skillCdRegions: [region("kept", { 1: { row: 1, column: 1 } })],
      skillCdLayout: {
        rows: 1,
        columns: 1,
        positions: { 1: { row: 0, column: 0 } },
      },
    });
    expect(regions.map((r) => [r.id, r.positions])).toEqual([
      ["kept", { 1: { row: 1, column: 1 } }],
    ]);
  });

  it("preserves valid cells before filling missing, colliding or invalid cells", () => {
    const selection = {
      monitoredSkillIds: [1, 2, 3, 4],
      skillCdRegions: [
        region(
          R1,
          {
            2: { row: 0, column: 0 },
            3: { row: 0, column: 0 },
            4: { row: 7, column: 1 },
            99: { row: 1, column: 1 },
          },
          { rows: 2, columns: 2 },
        ),
      ],
    };
    const regions = normalizeSkillCdRegions(selection);
    expect(regions[0]!.positions).toEqual({
      1: { row: 0, column: 1 },
      2: { row: 0, column: 0 },
      3: { row: 1, column: 0 },
      4: { row: 1, column: 1 },
    });
    expect(
      normalizeSkillCdRegions({ ...selection, skillCdRegions: regions }),
    ).toEqual(regions);
    expect(selection.skillCdRegions[0]!.positions[99]).toBeDefined();
  });

  it("keeps each skill in the first region holding a valid free cell", () => {
    const regions = normalizeSkillCdRegions({
      monitoredSkillIds: [5],
      skillCdRegions: [
        region(R1, { 5: { row: 9, column: 9 } }),
        region("b", { 5: { row: 0, column: 1 } }),
        region("c", { 5: { row: 0, column: 0 } }),
      ],
    });
    expect(regions.map((r) => r.positions)).toEqual([
      {},
      { 5: { row: 0, column: 1 } },
      {},
    ]);
  });

  it("places a skill with only invalid cells into its home region and grows only that region", () => {
    const regions = normalizeSkillCdRegions({
      monitoredSkillIds: [1, 2],
      skillCdRegions: [
        region(R1, {}, { rows: 1, columns: 1 }),
        region(
          "b",
          { 1: { row: 0, column: 0 }, 2: { row: 5, column: 0 } },
          { rows: 1, columns: 1 },
        ),
      ],
    });
    expect(regions[0]).toMatchObject({ rows: 1, positions: {} });
    expect(regions[1]).toMatchObject({
      rows: 2,
      positions: { 1: { row: 0, column: 0 }, 2: { row: 1, column: 0 } },
    });
  });

  it("puts unreferenced monitored skills into region 1 and drops cells of unmonitored skills", () => {
    const regions = normalizeSkillCdRegions({
      monitoredSkillIds: [1],
      skillCdRegions: [region(R1), region("b", { 9: { row: 0, column: 0 } })],
    });
    expect(regions.map((r) => r.positions)).toEqual([
      { 1: { row: 0, column: 0 } },
      {},
    ]);
  });

  it("expands persisted capacity without losing supported skills", () => {
    const [only] = normalizeSkillCdRegions({
      monitoredSkillIds: Array.from({ length: 10 }, (_, i) => i + 1),
      skillCdRegions: [
        region(R1, { 2: { row: 0, column: 0 } }, { rows: 1, columns: 1 }),
      ],
    });
    expect(only!.rows).toBe(10);
    expect(Object.keys(only!.positions)).toHaveLength(10);
    expect(only!.positions[2]).toEqual({ row: 0, column: 0 });
  });

  it("repairs invalid sizes and ignores invalid and duplicate skill ids", () => {
    const [only] = normalizeSkillCdRegions({
      monitoredSkillIds: [1, 1, 0, -1, NaN, 1.5, 2],
      skillCdRegions: [region(R1, {}, { rows: NaN, columns: 100 })],
    });
    expect(only).toMatchObject({
      rows: 2,
      columns: 10,
      positions: {
        1: { row: 0, column: 0 },
        2: { row: 0, column: 1 },
      },
    });
  });

  it("renames blank and duplicate region ids deterministically", () => {
    const input = {
      monitoredSkillIds: [],
      skillCdRegions: [
        region("a"),
        region("a"),
        region("  "),
        region("skill_cd_region_2"),
      ],
    };
    const ids = normalizeSkillCdRegions(input).map((r) => r.id);
    expect(ids).toEqual([
      "a",
      "skill_cd_region_3",
      "skill_cd_region_4",
      "skill_cd_region_2",
    ]);
    expect(normalizeSkillCdRegions(input).map((r) => r.id)).toEqual(ids);
  });

  it("clamps scale and gap, repairs non-finite positions and names, and caps the region count", () => {
    const regions = normalizeSkillCdRegions({
      monitoredSkillIds: [],
      overlayPositions: { skillCdGroup: { x: 100, y: 200 } },
      overlaySizes: { skillCdGroupScale: 1.2 },
      skillCdRegions: Array.from(
        { length: MAX_SKILL_CD_REGIONS + 2 },
        (_, i) =>
          ({
            ...region(`r${i}`),
            name: i === 0 ? 5 : `n${i}`,
            position: i < 2 ? { x: NaN, y: 0 } : { x: i, y: i },
            scale: i === 0 ? NaN : i === 1 ? 9 : 0.1,
            gap: [NaN, 30, -3, 3.6, "4"][i],
          }) as unknown as SkillCdRegion,
      ),
    });
    expect(regions).toHaveLength(MAX_SKILL_CD_REGIONS);
    expect(regions[0]).toMatchObject({
      name: "",
      position: { x: 100, y: 200 },
      scale: 1.2,
    });
    expect(regions[1]).toMatchObject({
      name: "n1",
      position: { x: 140, y: 240 },
      scale: 2.5,
    });
    expect(regions[2]).toMatchObject({ position: { x: 2, y: 2 }, scale: 0.5 });
    expect(regions.map((r) => r.gap)).toEqual([
      DEFAULT_SKILL_CD_GAP,
      24,
      0,
      4,
      ...Array<number>(MAX_SKILL_CD_REGIONS - 4).fill(DEFAULT_SKILL_CD_GAP),
    ]);
  });

  it("is idempotent", () => {
    const once = normalizeSkillCdRegions({
      monitoredSkillIds: [3, 1, 2],
      skillCdRegions: [
        region(R1, { 1: { row: 0, column: 0 } }, { rows: 1, columns: 1 }),
        region("", { 2: { row: 4, column: 4 } }),
      ],
    });
    expect(
      normalizeSkillCdRegions({
        monitoredSkillIds: [3, 1, 2],
        skillCdRegions: once,
      }),
    ).toEqual(once);
  });

  it("empties every region for an empty membership, keeping region settings", () => {
    const regions = normalizeSkillCdRegions({
      ...twoRegions(),
      monitoredSkillIds: [],
    });
    expect(regions.map((r) => r.positions)).toEqual([{}, {}]);
    expect(regions[1]).toMatchObject({
      id: "b",
      rows: 1,
      columns: 2,
      position: { x: 300, y: 80 },
      scale: 1.5,
    });
  });
});

describe("skill CD regions: grid actions", () => {
  it("adds into the selected empty cell and falls back to the first free cell", () => {
    const one = change(
      base(),
      grid({
        kind: "toggle",
        skillId: 30,
        preferredCell: { row: 1, column: 4 },
      }),
    );
    expect(one.skillCdRegions[0]!.positions[30]).toEqual({ row: 1, column: 4 });
    const two = change(
      one,
      grid({
        kind: "toggle",
        skillId: 40,
        preferredCell: { row: 1, column: 4 },
      }),
    );
    expect(two.skillCdRegions[0]!.positions[40]).toEqual({ row: 0, column: 1 });
  });

  it("moves across rows and swaps without changing the monitored membership order", () => {
    const original = base();
    const moved = change(
      original,
      grid({
        kind: "move",
        skillId: 20,
        from: { row: 0, column: 0 },
        to: { row: 1, column: 4 },
        targetSkillId: null,
        rows: 2,
        columns: 5,
      }),
    );
    expect(moved.monitoredSkillIds).toEqual([20, 10]);
    expect(
      skillCdAt(moved.skillCdRegions[0]!, { row: 0, column: 0 }),
    ).toBeNull();
    const swapped = change(
      moved,
      grid({
        kind: "move",
        skillId: 20,
        from: { row: 1, column: 4 },
        to: { row: 1, column: 3 },
        targetSkillId: 10,
        rows: 2,
        columns: 5,
      }),
    );
    expect(swapped.skillCdRegions[0]!.positions).toEqual({
      20: { row: 1, column: 3 },
      10: { row: 1, column: 4 },
    });
    expect(swapped.monitoredSkillIds).toEqual([20, 10]);
    expect(original).toEqual(base());
  });

  it("removes a skill toggled in its own region and preserves remaining coordinates", () => {
    const removed = change(base(), grid({ kind: "remove", skillId: 20 }));
    expect(removed.monitoredSkillIds).toEqual([10]);
    expect(removed.skillCdRegions[0]!.positions).toEqual({
      10: { row: 1, column: 3 },
    });
    expect(change(base(), grid({ kind: "toggle", skillId: 20 }))).toEqual(
      removed,
    );
    expect(change(removed, grid({ kind: "clear" }))).toEqual({
      monitoredSkillIds: [],
      skillCdRegions: [region(R1)],
    });
  });

  it("keeps cell metadata out of coordinates when swapping or reusing a removed cell", () => {
    const sourceCell = { row: 0, column: 0, skillId: 20, key: "0:0" };
    const swapped = change(
      base(),
      grid({
        kind: "move",
        skillId: 20,
        from: sourceCell,
        to: { row: 1, column: 3 },
        targetSkillId: 10,
        rows: 2,
        columns: 5,
      }),
    );
    expect(swapped.skillCdRegions[0]!.positions[10]).toEqual({
      row: 0,
      column: 0,
    });
    expect(
      skillCdEntries(swapped.skillCdRegions[0]!, swapped.monitoredSkillIds).map(
        (entry) => entry.skillId,
      ),
    ).toEqual([20, 10]);
    const added = change(
      change(swapped, grid({ kind: "remove", skillId: 10 })),
      grid({ kind: "toggle", skillId: 30, preferredCell: sourceCell }),
    );
    expect(added.skillCdRegions[0]!.positions[30]).toEqual({
      row: 0,
      column: 0,
    });
    const [restored] = normalizeSkillCdRegions({
      monitoredSkillIds: [10],
      skillCdRegions: [region(R1, { 10: sourceCell })],
    });
    expect(restored!.positions[10]).toEqual({ row: 0, column: 0 });
  });

  it("does not wrap coordinates when columns change and rejects overflow", () => {
    expect(
      change(base(), grid({ kind: "resize", rows: 2, columns: 4 }))
        .skillCdRegions[0]!.positions,
    ).toEqual(base().skillCdRegions[0]!.positions);
    expect(
      changeSkillCdSelection(
        base(),
        grid({ kind: "resize", rows: 1, columns: 5 }),
      ),
    ).toEqual({ ok: false, reason: "overflow", skillIds: [10] });
    expect(
      changeSkillCdSelection(
        base(),
        grid({ kind: "resize", rows: 2, columns: 3 }),
      ),
    ).toEqual({ ok: false, reason: "overflow", skillIds: [10] });
  });

  it.each([0, 11, 1.5, NaN, Infinity])(
    "rejects invalid interactive dimension %s",
    (size) => {
      expect(
        changeSkillCdSelection(
          base(),
          grid({ kind: "resize", rows: size, columns: 5 }),
        ),
      ).toMatchObject({ ok: false, reason: "invalidSize" });
    },
  );

  it("compacts in visual order while leaving the membership order alone", () => {
    const compacted = change(
      { ...base(), monitoredSkillIds: [10, 20] },
      grid({ kind: "compact" }),
    );
    expect(compacted.monitoredSkillIds).toEqual([10, 20]);
    expect(compacted.skillCdRegions[0]).toMatchObject({
      rows: 1,
      columns: 2,
      positions: { 20: { row: 0, column: 0 }, 10: { row: 0, column: 1 } },
    });
    expect(
      change({ monitoredSkillIds: [] }, grid({ kind: "compact" }))
        .skillCdRegions[0],
    ).toMatchObject({ rows: 1, columns: 1, positions: {} });
  });

  it("compacts vertical layouts without introducing columns", () => {
    const compacted = change(
      {
        monitoredSkillIds: [1, 2],
        skillCdRegions: [
          region(
            R1,
            { 1: { row: 8, column: 0 }, 2: { row: 2, column: 0 } },
            { rows: 10, columns: 1 },
          ),
        ],
      },
      grid({ kind: "compact" }),
    );
    expect(compacted.skillCdRegions[0]).toMatchObject({
      rows: 2,
      columns: 1,
      positions: {
        2: { row: 0, column: 0 },
        1: { row: 1, column: 0 },
      },
    });
  });

  it("distinguishes a full grid from the ten-skill limit", () => {
    expect(
      changeSkillCdSelection(
        {
          monitoredSkillIds: [1],
          skillCdRegions: [region(R1, {}, { rows: 1, columns: 1 })],
        },
        grid({ kind: "toggle", skillId: 2 }),
      ),
    ).toMatchObject({ ok: false, reason: "full" });
    expect(
      changeSkillCdSelection(
        {
          monitoredSkillIds: Array.from({ length: 10 }, (_, i) => i + 1),
          skillCdRegions: [region(R1, {}, { rows: 10, columns: 10 })],
        },
        grid({ kind: "toggle", skillId: 11 }),
      ),
    ).toMatchObject({ ok: false, reason: "limit" });
  });

  it("rejects stale source, destination, size, out-of-grid and unknown-region moves", () => {
    const move: Extract<SkillCdGridAction, { kind: "move" }> = {
      kind: "move",
      skillId: 20,
      from: { row: 0, column: 0 },
      to: { row: 1, column: 3 },
      targetSkillId: 10,
      rows: 2,
      columns: 5,
    };
    for (const action of [
      grid({ ...move, skillId: 99 }),
      grid({ ...move, from: { row: 0, column: 1 } }),
      grid({ ...move, targetSkillId: null }),
      grid({ ...move, columns: 4 }),
      grid({ ...move, to: { row: 2, column: 3 } }),
      grid(move, "missing"),
    ])
      expect(changeSkillCdSelection(base(), action)).toMatchObject({
        ok: false,
        reason: "stale",
      });
  });

  it("trims only trailing space and keeps leading and internal gaps", () => {
    const first = (selection: SkillCdSelection) =>
      normalizeSkillCdRegions(selection)[0]!;
    expect(skillCdBounds(first({ monitoredSkillIds: [] }))).toEqual({
      rows: 0,
      columns: 0,
    });
    expect(skillCdBounds(first({ monitoredSkillIds: [1, 2] }))).toEqual({
      rows: 1,
      columns: 2,
    });
    expect(
      skillCdBounds(
        first({
          monitoredSkillIds: [1, 2],
          skillCdRegions: [
            region(
              R1,
              { 1: { row: 2, column: 1 }, 2: { row: 4, column: 6 } },
              { rows: 10, columns: 10 },
            ),
          ],
        }),
      ),
    ).toEqual({ rows: 5, columns: 7 });
  });
});

describe("skill CD regions: cross-region actions", () => {
  it("moves a skill from another region without changing membership order, even with ten monitored", () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const full: Selection = {
      monitoredSkillIds: ids,
      skillCdRegions: [
        region(
          R1,
          Object.fromEntries(
            ids.slice(0, 9).map((id, i) => [id, { row: 0, column: i }]),
          ),
          { rows: 1, columns: 10 },
        ),
        region("b", { 10: { row: 0, column: 0 } }),
      ],
    };
    const moved = change(full, {
      kind: "toggle",
      skillId: 3,
      regionId: "b",
      preferredCell: { row: 1, column: 4 },
    });
    expect(moved.monitoredSkillIds).toEqual(ids);
    expect(moved.skillCdRegions[0]!.positions[3]).toBeUndefined();
    expect(moved.skillCdRegions[1]!.positions[3]).toEqual({
      row: 1,
      column: 4,
    });
    expectEachSkillInOneRegion(moved);
  });

  it("reports full when the target region is full and leaves the source untouched", () => {
    const selection = {
      ...twoRegions(),
      skillCdRegions: twoRegions().skillCdRegions.map((r) =>
        r.id === "b" ? { ...r, columns: 1 } : r,
      ),
    };
    expect(
      changeSkillCdSelection(selection, {
        kind: "toggle",
        skillId: 20,
        regionId: "b",
      }),
    ).toMatchObject({ ok: false, reason: "full" });
    expect(selection.skillCdRegions[0]!.positions[20]).toEqual({
      row: 0,
      column: 0,
    });
  });

  it("removes a skill wherever it is and clears only the current region", () => {
    const removed = change(twoRegions(), grid({ kind: "remove", skillId: 30 }));
    expect(removed.monitoredSkillIds).toEqual([20, 10]);
    expect(placements(removed)).toEqual([[10, 20], []]);

    const cleared = change(twoRegions(), { kind: "clear", regionId: "b" });
    expect(cleared.monitoredSkillIds).toEqual([20, 10]);
    expect(placements(cleared)).toEqual([[10, 20], []]);
  });

  it("resizes, compacts and checks overflow per region", () => {
    expect(
      changeSkillCdSelection(twoRegions(), {
        kind: "resize",
        regionId: "b",
        rows: 1,
        columns: 1,
      }),
    ).toMatchObject({ ok: true });
    expect(
      changeSkillCdSelection(twoRegions(), {
        kind: "resize",
        regionId: R1,
        rows: 1,
        columns: 5,
      }),
    ).toEqual({ ok: false, reason: "overflow", skillIds: [10] });
    const compacted = change(twoRegions(), { kind: "compact", regionId: "b" });
    expect(compacted.skillCdRegions[1]).toMatchObject({
      rows: 1,
      columns: 1,
      positions: { 30: { row: 0, column: 0 } },
    });
    expect(compacted.skillCdRegions[0]).toEqual(twoRegions().skillCdRegions[0]);
  });

  it("sets the icon gap of one region and rejects values outside 0..24", () => {
    const spaced = change(twoRegions(), { kind: "gap", regionId: "b", gap: 0 });
    expect(spaced.skillCdRegions.map((r) => r.gap)).toEqual([
      DEFAULT_SKILL_CD_GAP,
      0,
    ]);
    expect(spaced.monitoredSkillIds).toEqual([20, 10, 30]);
    expect(placements(spaced)).toEqual(placements(twoRegions()));
    expect(
      change(twoRegions(), { kind: "gap", regionId: R1, gap: 24 })
        .skillCdRegions[0]!.gap,
    ).toBe(24);
    for (const gap of [-1, 25, 3.5, NaN])
      expect(
        changeSkillCdSelection(twoRegions(), {
          kind: "gap",
          regionId: R1,
          gap,
        }),
      ).toEqual({ ok: false, reason: "invalidGap", skillIds: [] });
    expect(
      changeSkillCdSelection(twoRegions(), {
        kind: "gap",
        regionId: "missing",
        gap: 4,
      }),
    ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("adds a region with the given id offset from the last region", () => {
    const added = change(twoRegions(), { kind: "addRegion", id: " c " });
    expect(added.skillCdRegions[2]).toEqual({
      ...createDefaultSkillCdRegion("c"),
      position: { x: 340, y: 120 },
    });
    expect(added.monitoredSkillIds).toEqual([20, 10, 30]);
    for (const id of ["b", "  "])
      expect(
        changeSkillCdSelection(twoRegions(), { kind: "addRegion", id }),
      ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("refuses a region beyond the cap", () => {
    const many: SkillCdSelection = {
      monitoredSkillIds: [],
      skillCdRegions: Array.from({ length: MAX_SKILL_CD_REGIONS }, (_, i) =>
        region(`r${i}`),
      ),
    };
    expect(
      changeSkillCdSelection(many, { kind: "addRegion", id: "extra" }),
    ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("renames with trimming", () => {
    const renamed = change(twoRegions(), {
      kind: "renameRegion",
      regionId: "b",
      name: "  幻想  ",
    });
    expect(renamed.skillCdRegions[1]!.name).toBe("幻想");
  });

  it("removes a region with its skills and refuses the last region", () => {
    const removed = change(twoRegions(), {
      kind: "removeRegion",
      regionId: R1,
    });
    expect(removed.monitoredSkillIds).toEqual([30]);
    expect(removed.skillCdRegions.map((r) => r.id)).toEqual(["b"]);
    expect(
      changeSkillCdSelection(removed, { kind: "removeRegion", regionId: "b" }),
    ).toMatchObject({ ok: false, reason: "lastRegion" });
  });

  it("places every monitored skill in exactly one region after each action", () => {
    const actions: SkillCdAction[] = [
      { kind: "toggle", skillId: 20, regionId: "b" },
      { kind: "toggle", skillId: 40, regionId: R1 },
      { kind: "addRegion", id: "c" },
      { kind: "toggle", skillId: 10, regionId: "c" },
      { kind: "compact", regionId: R1 },
      { kind: "removeRegion", regionId: "b" },
      { kind: "clear", regionId: "c" },
    ];
    let selection = twoRegions();
    for (const action of actions) {
      selection = change(selection, action);
      expectEachSkillInOneRegion(selection);
    }
    expect(selection.monitoredSkillIds).toEqual([40]);
  });
});

describe("skill CD regions: overlay layout helpers", () => {
  it("moves and scales one region and leaves the others alone", () => {
    const regions = setSkillCdRegionLayout(twoRegions(), "b", {
      position: { x: 5, y: 6 },
      scale: 9,
    });
    expect(regions[1]).toMatchObject({ position: { x: 5, y: 6 }, scale: 2.5 });
    expect(regions[0]).toEqual(twoRegions().skillCdRegions[0]);
  });

  it("staggers reset positions by 40 and resets scales to 1", () => {
    expect(
      resetSkillCdRegionPositions(twoRegions()).map((r) => r.position),
    ).toEqual([
      { x: 40, y: 40 },
      { x: 80, y: 80 },
    ]);
    expect(resetSkillCdRegionScales(twoRegions()).map((r) => r.scale)).toEqual([
      1, 1,
    ]);
  });
});
