import { describe, expect, it } from "vitest";

import {
  MAX_ENTITY_DURATION_ENTRIES,
  MAX_ENTITY_DURATION_MS,
  MIN_ENTITY_DURATION_MS,
  createEntityDurationEntry,
  ensureEntityDurationEntries,
  moveEntityDurationEntry,
  patchEntityDurationEntry,
} from "./entity-duration-entries";
import type { EntityDurationEntry } from "./settings-store";

function entry(
  overrides: Partial<EntityDurationEntry> & { monsterId: number },
): EntityDurationEntry {
  return {
    id: `e${overrides.monsterId}`,
    label: "x",
    scope: "self",
    ...overrides,
  };
}

describe("ensureEntityDurationEntries", () => {
  it("returns an empty list for non-arrays", () => {
    expect(ensureEntityDurationEntries(undefined)).toEqual([]);
    expect(ensureEntityDurationEntries(null)).toEqual([]);
  });

  it("drops entries with invalid monster ids", () => {
    const result = ensureEntityDurationEntries([
      entry({ monsterId: 0 }),
      entry({ monsterId: -1 }),
      entry({ monsterId: 1.5 }),
      { id: "no-id", label: "x", scope: "self" },
      entry({ monsterId: 179901 }),
    ]);
    expect(result.map((e) => e.monsterId)).toEqual([179901]);
  });

  it("keeps the first entry per monster id", () => {
    const result = ensureEntityDurationEntries([
      entry({ id: "a", monsterId: 1, label: "first" }),
      entry({ id: "b", monsterId: 1, label: "second" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("first");
  });

  it("clamps durations and omits non-positive ones", () => {
    const result = ensureEntityDurationEntries([
      entry({ monsterId: 1, durationMs: 1 }),
      entry({ monsterId: 2, durationMs: 99_999_999 }),
      entry({ monsterId: 3, durationMs: 0 }),
      entry({ monsterId: 4, durationMs: Number.NaN }),
      entry({ monsterId: 5, durationMs: 35_000 }),
    ]);
    expect(result[0]?.durationMs).toBe(MIN_ENTITY_DURATION_MS);
    expect(result[1]?.durationMs).toBe(MAX_ENTITY_DURATION_MS);
    expect("durationMs" in result[2]!).toBe(false);
    expect("durationMs" in result[3]!).toBe(false);
    expect(result[4]?.durationMs).toBe(35_000);
  });

  it("regenerates missing and duplicate ids and normalizes scope/label", () => {
    const result = ensureEntityDurationEntries([
      { monsterId: 1, label: "  a  ", scope: "any" },
      entry({ id: "dup", monsterId: 2 }),
      entry({ id: "dup", monsterId: 3, scope: "weird" as never }),
    ]);
    expect(result[0]?.id).toMatch(/^entity_duration_/);
    expect(result[0]?.label).toBe("a");
    expect(result[0]?.scope).toBe("any");
    expect(result[1]?.id).toBe("dup");
    expect(result[2]?.id).not.toBe("dup");
    expect(result[2]?.scope).toBe("self");
  });

  it("truncates to the entry limit", () => {
    const many = Array.from(
      { length: MAX_ENTITY_DURATION_ENTRIES + 5 },
      (_, i) => entry({ monsterId: i + 1 }),
    );
    expect(ensureEntityDurationEntries(many)).toHaveLength(
      MAX_ENTITY_DURATION_ENTRIES,
    );
  });
});

describe("createEntityDurationEntry", () => {
  it("assigns a prefixed id and keeps the preset key", () => {
    const created = createEntityDurationEntry({
      monsterId: 179901,
      label: "镰车",
      durationMs: 35_000,
      scope: "self",
      presetKey: "stormblade_scythe_cart",
    });
    expect(created.id).toMatch(/^entity_duration_/);
    expect(created.presetKey).toBe("stormblade_scythe_cart");
    expect(created.durationMs).toBe(35_000);
  });
});

describe("patchEntityDurationEntry", () => {
  it("clears the duration with null and keeps it when undefined", () => {
    const base = entry({ monsterId: 1, durationMs: 5_000 });
    expect(patchEntityDurationEntry(base, { label: "b" }).durationMs).toBe(
      5_000,
    );
    const cleared = patchEntityDurationEntry(base, { durationMs: null });
    expect("durationMs" in cleared).toBe(false);
    expect(
      patchEntityDurationEntry(base, { durationMs: 7_000, scope: "any" }),
    ).toMatchObject({ durationMs: 7_000, scope: "any", id: base.id });
  });
});

describe("moveEntityDurationEntry", () => {
  const list = [
    entry({ monsterId: 1 }),
    entry({ monsterId: 2 }),
    entry({ monsterId: 3 }),
  ];

  it("swaps neighbours", () => {
    expect(moveEntityDurationEntry(list, "e2", "up").map((e) => e.id)).toEqual([
      "e2",
      "e1",
      "e3",
    ]);
    expect(
      moveEntityDurationEntry(list, "e2", "down").map((e) => e.id),
    ).toEqual(["e1", "e3", "e2"]);
  });

  it("leaves boundaries and unknown ids untouched", () => {
    expect(moveEntityDurationEntry(list, "e1", "up")).toEqual(list);
    expect(moveEntityDurationEntry(list, "e3", "down")).toEqual(list);
    expect(moveEntityDurationEntry(list, "nope", "down")).toEqual(list);
  });
});
