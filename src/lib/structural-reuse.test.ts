import { describe, expect, it } from "vitest";
import { reuseIfSame, reuseMap, reuseSet, sameJson } from "./structural-reuse";

describe("sameJson", () => {
  it("compares JSON-shaped data deeply", () => {
    expect(sameJson({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(
      true,
    );
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameJson([1], { 0: 1 })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
    expect(sameJson(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("reuseIfSame", () => {
  it("keeps the previous instance for equal content", () => {
    const previous = [{ id: 1, value: 2 }];
    expect(reuseIfSame(previous, [{ id: 1, value: 2 }])).toBe(previous);
    const next = [{ id: 1, value: 3 }];
    expect(reuseIfSame(previous, next)).toBe(next);
    expect(reuseIfSame(undefined, next)).toBe(next);
  });
});

describe("reuseMap", () => {
  const entry = (value: number) => ({ value, nested: [value] });

  it("returns the previous map when nothing changed", () => {
    const previous = new Map([
      [1, entry(1)],
      [2, entry(2)],
    ]);
    const next = new Map([
      [1, entry(1)],
      [2, entry(2)],
    ]);
    expect(reuseMap(previous, next)).toBe(previous);
  });

  it("keeps unchanged entries inside a changed map", () => {
    const previous = new Map([
      [1, entry(1)],
      [2, entry(2)],
    ]);
    const result = reuseMap(
      previous,
      new Map([
        [1, entry(1)],
        [2, entry(5)],
      ]),
    );
    expect(result).not.toBe(previous);
    expect(result.get(1)).toBe(previous.get(1));
    expect(result.get(2)).toEqual(entry(5));
  });

  it("treats added, removed and reordered keys as a change", () => {
    const previous = new Map([
      [1, 10],
      [2, 20],
    ]);
    expect(reuseMap(previous, new Map([[1, 10]]))).not.toBe(previous);
    const reordered = reuseMap(
      previous,
      new Map([
        [2, 20],
        [1, 10],
      ]),
    );
    expect(reordered).not.toBe(previous);
    expect([...reordered.keys()]).toEqual([2, 1]);
  });

  it("compares entries with a custom equality when given one", () => {
    const previous = new Map([[1, { id: 1, ignored: "a" }]]);
    const byId = (left: { id: number }, right: { id: number }) =>
      left.id === right.id;
    expect(
      reuseMap(previous, new Map([[1, { id: 1, ignored: "b" }]]), byId),
    ).toBe(previous);
    expect(
      reuseMap(previous, new Map([[1, { id: 2, ignored: "a" }]]), byId),
    ).not.toBe(previous);
  });

  it("uses the new map when there is no previous one", () => {
    const next = new Map([[1, 1]]);
    expect(reuseMap(undefined, next)).toBe(next);
  });
});

describe("reuseSet", () => {
  it("reuses only the same members in the same order", () => {
    const previous = new Set([1, 2]);
    expect(reuseSet(previous, new Set([1, 2]))).toBe(previous);
    expect(reuseSet(previous, new Set([2, 1]))).not.toBe(previous);
    expect(reuseSet(previous, new Set([1]))).not.toBe(previous);
  });
});
