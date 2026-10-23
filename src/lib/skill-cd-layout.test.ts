import { describe, expect, it } from "vitest";
import {
  changeSkillCdSelection,
  normalizeSkillCdLayout,
  skillCdAt,
  skillCdBounds,
  skillCdEntries,
  type SkillCdAction,
  type SkillCdSelection,
} from "./skill-cd-layout";

function change(selection: SkillCdSelection, action: SkillCdAction) {
  const result = changeSkillCdSelection(selection, action);
  if (!result.ok) throw new Error(result.reason);
  return {
    monitoredSkillIds: result.monitoredSkillIds,
    skillCdLayout: result.skillCdLayout,
  };
}

const base = (): SkillCdSelection => ({
  monitoredSkillIds: [20, 10],
  skillCdLayout: {
    rows: 2,
    columns: 5,
    positions: { 20: { row: 0, column: 0 }, 10: { row: 1, column: 3 } },
  },
});

describe("skill CD layout", () => {
  it.each([0, 1, 2, 10])(
    "migrates %i skills in the original selection order",
    (count) => {
      const ids = Array.from({ length: count }, (_, i) => 20 - i);
      const layout = normalizeSkillCdLayout({ monitoredSkillIds: ids });
      expect(layout.rows).toBe(2);
      expect(layout.columns).toBe(5);
      ids.forEach((id, i) =>
        expect(layout.positions[id]).toEqual({
          row: Math.floor(i / 5),
          column: i % 5,
        }),
      );
    },
  );

  it("preserves valid cells before filling missing, colliding or invalid cells", () => {
    const selection = {
      monitoredSkillIds: [1, 2, 3, 4],
      skillCdLayout: {
        rows: 2,
        columns: 2,
        positions: {
          2: { row: 0, column: 0 },
          3: { row: 0, column: 0 },
          4: { row: 7, column: 1 },
          99: { row: 1, column: 1 },
        },
      },
    };
    const layout = normalizeSkillCdLayout(selection);
    expect(layout.positions).toEqual({
      1: { row: 0, column: 1 },
      2: { row: 0, column: 0 },
      3: { row: 1, column: 0 },
      4: { row: 1, column: 1 },
    });
    expect(
      normalizeSkillCdLayout({ ...selection, skillCdLayout: layout }),
    ).toEqual(layout);
    expect(selection.skillCdLayout.positions[99]).toBeDefined();
  });

  it("expands persisted capacity without losing supported skills", () => {
    const layout = normalizeSkillCdLayout({
      monitoredSkillIds: Array.from({ length: 10 }, (_, i) => i + 1),
      skillCdLayout: {
        rows: 1,
        columns: 1,
        positions: { 2: { row: 0, column: 0 } },
      },
    });
    expect(layout.rows).toBe(10);
    expect(Object.keys(layout.positions)).toHaveLength(10);
    expect(layout.positions[2]).toEqual({ row: 0, column: 0 });
  });

  it("repairs invalid sizes and ignores invalid and duplicate ids", () => {
    const layout = normalizeSkillCdLayout({
      monitoredSkillIds: [1, 1, 0, -1, NaN, 1.5, 2],
      skillCdLayout: { rows: NaN, columns: 100, positions: {} },
    });
    expect(layout).toEqual({
      rows: 2,
      columns: 10,
      positions: {
        1: { row: 0, column: 0 },
        2: { row: 0, column: 1 },
      },
    });
  });

  it("adds into the selected empty cell and falls back to the first free cell", () => {
    const one = change(base(), {
      kind: "toggle",
      skillId: 30,
      preferredCell: { row: 1, column: 4 },
    });
    expect(one.skillCdLayout.positions[30]).toEqual({ row: 1, column: 4 });
    const two = change(one, {
      kind: "toggle",
      skillId: 40,
      preferredCell: { row: 1, column: 4 },
    });
    expect(two.skillCdLayout.positions[40]).toEqual({ row: 0, column: 1 });
  });

  it("moves across rows and swaps without changing the monitored membership order", () => {
    const original = base();
    const moved = change(original, {
      kind: "move",
      skillId: 20,
      from: { row: 0, column: 0 },
      to: { row: 1, column: 4 },
      targetSkillId: null,
      rows: 2,
      columns: 5,
    });
    expect(moved.monitoredSkillIds).toEqual([20, 10]);
    expect(skillCdAt(moved.skillCdLayout, { row: 0, column: 0 })).toBeNull();
    const swapped = change(moved, {
      kind: "move",
      skillId: 20,
      from: { row: 1, column: 4 },
      to: { row: 1, column: 3 },
      targetSkillId: 10,
      rows: 2,
      columns: 5,
    });
    expect(swapped.skillCdLayout.positions).toEqual({
      20: { row: 1, column: 3 },
      10: { row: 1, column: 4 },
    });
    expect(swapped.monitoredSkillIds).toEqual([20, 10]);
    expect(original).toEqual(base());
  });

  it("removes only the requested skill and preserves remaining coordinates", () => {
    const removed = change(base(), { kind: "remove", skillId: 20 });
    expect(removed.monitoredSkillIds).toEqual([10]);
    expect(removed.skillCdLayout.positions).toEqual({
      10: { row: 1, column: 3 },
    });
    expect(change(base(), { kind: "toggle", skillId: 20 })).toEqual(removed);
    expect(change(removed, { kind: "clear" })).toEqual({
      monitoredSkillIds: [],
      skillCdLayout: { rows: 2, columns: 5, positions: {} },
    });
  });

  it("keeps cell metadata out of coordinates when swapping or reusing a removed cell", () => {
    const sourceCell = { row: 0, column: 0, skillId: 20, key: "0:0" };
    const swapped = change(base(), {
      kind: "move",
      skillId: 20,
      from: sourceCell,
      to: { row: 1, column: 3 },
      targetSkillId: 10,
      rows: 2,
      columns: 5,
    });
    expect(swapped.skillCdLayout.positions[10]).toEqual({ row: 0, column: 0 });
    expect(
      skillCdEntries(swapped.skillCdLayout, swapped.monitoredSkillIds).map(
        (entry) => entry.skillId,
      ),
    ).toEqual([20, 10]);
    const added = change(change(swapped, { kind: "remove", skillId: 10 }), {
      kind: "toggle",
      skillId: 30,
      preferredCell: sourceCell,
    });
    expect(added.skillCdLayout.positions[30]).toEqual({ row: 0, column: 0 });
    const restored = normalizeSkillCdLayout({
      monitoredSkillIds: [10],
      skillCdLayout: { rows: 2, columns: 5, positions: { 10: sourceCell } },
    });
    expect(restored.positions[10]).toEqual({ row: 0, column: 0 });
  });

  it("does not wrap coordinates when columns change and rejects overflow", () => {
    expect(
      change(base(), { kind: "resize", rows: 2, columns: 4 }).skillCdLayout
        .positions,
    ).toEqual(base().skillCdLayout!.positions);
    expect(
      changeSkillCdSelection(base(), { kind: "resize", rows: 1, columns: 5 }),
    ).toEqual({ ok: false, reason: "overflow", skillIds: [10] });
    expect(
      changeSkillCdSelection(base(), { kind: "resize", rows: 2, columns: 3 }),
    ).toEqual({ ok: false, reason: "overflow", skillIds: [10] });
  });

  it.each([0, 11, 1.5, NaN, Infinity])(
    "rejects invalid interactive dimension %s",
    (size) => {
      expect(
        changeSkillCdSelection(base(), {
          kind: "resize",
          rows: size,
          columns: 5,
        }),
      ).toMatchObject({ ok: false, reason: "invalidSize" });
    },
  );

  it("compacts in visual order while leaving the membership order alone", () => {
    const compacted = change(
      { monitoredSkillIds: [10, 20], skillCdLayout: base().skillCdLayout },
      { kind: "compact" },
    );
    expect(compacted).toEqual({
      monitoredSkillIds: [10, 20],
      skillCdLayout: {
        rows: 1,
        columns: 2,
        positions: { 20: { row: 0, column: 0 }, 10: { row: 0, column: 1 } },
      },
    });
    expect(
      change({ monitoredSkillIds: [] }, { kind: "compact" }).skillCdLayout,
    ).toEqual({ rows: 1, columns: 1, positions: {} });
  });

  it("compacts vertical layouts without introducing columns", () => {
    const compacted = change(
      {
        monitoredSkillIds: [1, 2],
        skillCdLayout: {
          rows: 10,
          columns: 1,
          positions: { 1: { row: 8, column: 0 }, 2: { row: 2, column: 0 } },
        },
      },
      { kind: "compact" },
    );
    expect(compacted.skillCdLayout).toEqual({
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
          skillCdLayout: { rows: 1, columns: 1, positions: {} },
        },
        { kind: "toggle", skillId: 2 },
      ),
    ).toMatchObject({ ok: false, reason: "full" });
    expect(
      changeSkillCdSelection(
        {
          monitoredSkillIds: Array.from({ length: 10 }, (_, i) => i + 1),
          skillCdLayout: { rows: 10, columns: 10, positions: {} },
        },
        { kind: "toggle", skillId: 11 },
      ),
    ).toMatchObject({ ok: false, reason: "limit" });
  });

  it("rejects stale source, destination, size and out-of-grid moves", () => {
    const move: Extract<SkillCdAction, { kind: "move" }> = {
      kind: "move",
      skillId: 20,
      from: { row: 0, column: 0 },
      to: { row: 1, column: 3 },
      targetSkillId: 10,
      rows: 2,
      columns: 5,
    };
    for (const action of [
      { ...move, skillId: 99 },
      { ...move, from: { row: 0, column: 1 } },
      { ...move, targetSkillId: null },
      { ...move, columns: 4 },
      { ...move, to: { row: 2, column: 3 } },
    ])
      expect(changeSkillCdSelection(base(), action)).toMatchObject({
        ok: false,
        reason: "stale",
      });
  });

  it("trims only trailing space and keeps leading and internal gaps", () => {
    expect(
      skillCdBounds(normalizeSkillCdLayout({ monitoredSkillIds: [] })),
    ).toEqual({ rows: 0, columns: 0 });
    expect(
      skillCdBounds(normalizeSkillCdLayout({ monitoredSkillIds: [1, 2] })),
    ).toEqual({ rows: 1, columns: 2 });
    expect(
      skillCdBounds(
        normalizeSkillCdLayout({
          monitoredSkillIds: [1, 2],
          skillCdLayout: {
            rows: 10,
            columns: 10,
            positions: { 1: { row: 2, column: 1 }, 2: { row: 4, column: 6 } },
          },
        }),
      ),
    ).toEqual({ rows: 5, columns: 7 });
  });
});
