import { describe, expect, it } from "vitest";
import type { BuffUpdateState } from "$lib/api";
import {
  reuseEntityBuffMap,
  reuseEntityMap,
  reuseEntitySet,
} from "./monster-payload-reuse";

function buff(
  baseId: number,
  extras: Partial<BuffUpdateState> = {},
): BuffUpdateState {
  return {
    baseId,
    layer: 1,
    durationMs: 10_000,
    createTimeMs: 1_000,
    sourceRemodelLevel: null,
    ...extras,
  };
}

function byBaseId(buffs: BuffUpdateState[]) {
  return new Map(buffs.map((item) => [item.baseId, item]));
}

describe("reuseEntityBuffMap", () => {
  it("returns the previous cache when an equal payload arrives", () => {
    const first = reuseEntityBuffMap(
      null,
      { a: [buff(1)], b: [buff(2)] },
      byBaseId,
    );
    const second = reuseEntityBuffMap(
      first,
      { a: [buff(1)], b: [buff(2)] },
      byBaseId,
    );
    expect(second).toBe(first);
    expect(second.value).toBe(first.value);
  });

  it.each([
    ["createTimeMs", { createTimeMs: 2_000 }],
    ["layer", { layer: 2 }],
    ["durationMs", { durationMs: 5_000 }],
    ["sourceRemodelLevel", { sourceRemodelLevel: 3 }],
  ])("rebuilds when %s changes", (_field, extras) => {
    const first = reuseEntityBuffMap(null, { a: [buff(1)] }, byBaseId);
    const second = reuseEntityBuffMap(
      first,
      { a: [buff(1, extras)] },
      byBaseId,
    );
    expect(second.value).not.toBe(first.value);
    expect(second.value.get("a")?.get(1)).toMatchObject(extras);
  });

  it("keeps unchanged entity maps when another entity changes", () => {
    const first = reuseEntityBuffMap(
      null,
      { a: [buff(1)], b: [buff(2)] },
      byBaseId,
    );
    const second = reuseEntityBuffMap(
      first,
      { a: [buff(1)], b: [buff(2, { layer: 3 })] },
      byBaseId,
    );
    expect(second.value).not.toBe(first.value);
    expect(second.value.get("a")).toBe(first.value.get("a"));
    expect(second.value.get("b")).not.toBe(first.value.get("b"));
  });

  it("rebuilds when an entity is added or removed", () => {
    const first = reuseEntityBuffMap(null, { a: [buff(1)] }, byBaseId);
    const added = reuseEntityBuffMap(
      first,
      { a: [buff(1)], b: [buff(2)] },
      byBaseId,
    );
    expect(added.value).not.toBe(first.value);
    expect(added.value.get("a")).toBe(first.value.get("a"));

    const removed = reuseEntityBuffMap(added, { a: [buff(1)] }, byBaseId);
    expect(removed.value).not.toBe(added.value);
    expect([...removed.value.keys()]).toEqual(["a"]);
  });
});

describe("reuseEntityMap", () => {
  it("returns the previous map for equal entries", () => {
    const first = reuseEntityMap(null, { a: "Alice", b: "Bob" });
    expect(reuseEntityMap(first, { b: "Bob", a: "Alice" })).toBe(first);
  });

  it("returns a new map when a value or the key set changes", () => {
    const first = reuseEntityMap(null, { a: "Alice" });
    expect(reuseEntityMap(first, { a: "Alicia" })).not.toBe(first);
    expect(reuseEntityMap(first, { a: "Alice", b: "Bob" })).not.toBe(first);
    expect(reuseEntityMap(first, {})).not.toBe(first);
  });
});

describe("reuseEntitySet", () => {
  it("returns the previous set for the same members", () => {
    const first = reuseEntitySet(null, ["a", "b"]);
    expect(reuseEntitySet(first, ["b", "a"])).toBe(first);
  });

  it("returns a new set when membership changes", () => {
    const first = reuseEntitySet(null, ["a"]);
    expect(reuseEntitySet(first, ["b"])).not.toBe(first);
    expect(reuseEntitySet(first, [])).not.toBe(first);
  });
});
