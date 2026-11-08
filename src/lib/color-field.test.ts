import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createThrottledCommit,
  parseColorInput,
  pushRecentColor,
  sanitizeRecentColors,
} from "./color-field";

describe("parseColorInput", () => {
  it("accepts hex with or without #, short or long", () => {
    expect(parseColorInput("#38BDF8")).toBe("#38bdf8");
    expect(parseColorInput("38bdf8")).toBe("#38bdf8");
    expect(parseColorInput("  #fff ")).toBe("#ffffff");
    expect(parseColorInput("abc")).toBe("#aabbcc");
  });

  it("accepts rgb() and rgba(), ignoring alpha", () => {
    expect(parseColorInput("rgb(56, 189, 248)")).toBe("#38bdf8");
    expect(parseColorInput("rgba(255,0,0,0.5)")).toBe("#ff0000");
    expect(parseColorInput("rgb(0 128 255)")).toBe("#0080ff");
  });

  it("rejects anything else", () => {
    expect(parseColorInput("")).toBeNull();
    expect(parseColorInput("#12345")).toBeNull();
    expect(parseColorInput("red")).toBeNull();
    expect(parseColorInput("rgb(256, 0, 0)")).toBeNull();
    expect(parseColorInput("#gggggg")).toBeNull();
  });
});

describe("recent colors", () => {
  it("moves a color to the front without duplicates", () => {
    expect(pushRecentColor(["#111111", "#222222"], "#222222")).toEqual([
      "#222222",
      "#111111",
    ]);
    expect(pushRecentColor(["#111111"], "#ABCDEF")).toEqual([
      "#abcdef",
      "#111111",
    ]);
  });

  it("caps the list and ignores invalid input", () => {
    const full = Array.from({ length: 8 }, (_, i) => `#00000${i}`);
    const next = pushRecentColor(full, "#ffffff");
    expect(next).toHaveLength(8);
    expect(next[0]).toBe("#ffffff");
    expect(next).not.toContain("#000007");
    expect(pushRecentColor(["#111111"], "nope")).toEqual(["#111111"]);
  });

  it("sanitizes a stored list", () => {
    expect(sanitizeRecentColors(null)).toEqual([]);
    expect(
      sanitizeRecentColors(["#FFF", 3, "#ffffff", "nope", "#000"]),
    ).toEqual(["#ffffff", "#000000"]);
  });
});

describe("createThrottledCommit", () => {
  afterEach(() => vi.useRealTimers());

  it("commits the first value at once and the last one after the window", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const throttle = createThrottledCommit(commit, 200);
    throttle.push("a");
    throttle.push("b");
    throttle.push("c");
    expect(commit.mock.calls).toEqual([["a"]]);
    vi.advanceTimersByTime(200);
    expect(commit.mock.calls).toEqual([["a"], ["c"]]);
    vi.advanceTimersByTime(400);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("flush commits a pending value immediately", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const throttle = createThrottledCommit(commit, 200);
    throttle.push("a");
    throttle.push("b");
    throttle.flush();
    expect(commit.mock.calls).toEqual([["a"], ["b"]]);
    vi.advanceTimersByTime(400);
    expect(commit).toHaveBeenCalledTimes(2);
    throttle.push("c");
    expect(commit.mock.calls.at(-1)).toEqual(["c"]);
  });

  it("cancel drops a pending value", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const throttle = createThrottledCommit(commit, 200);
    throttle.push("a");
    throttle.push("b");
    throttle.cancel();
    vi.advanceTimersByTime(400);
    expect(commit.mock.calls).toEqual([["a"]]);
  });
});
