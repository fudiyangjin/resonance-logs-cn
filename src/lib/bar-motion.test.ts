import { describe, expect, it } from "vitest";
import {
  BAR_CATCH_UP_MS,
  barKeyframes,
  barScaleAt,
  sameBarMotion,
  type BarMotion,
} from "./bar-motion";

const drain = (deadlineMs: number, spanMs: number): BarMotion => ({
  kind: "countdown",
  deadlineMs,
  spanMs,
});

describe("barScaleAt", () => {
  it("drains linearly and rests at zero after the deadline", () => {
    const motion = drain(10_000, 10_000);
    expect(barScaleAt(motion, 0)).toBe(1);
    expect(barScaleAt(motion, 7_500)).toBeCloseTo(0.25);
    expect(barScaleAt(motion, 12_000)).toBe(0);
  });

  it("stays full while more than one span remains", () => {
    expect(barScaleAt(drain(30_000, 10_000), 5_000)).toBe(1);
  });

  it("fills instead of draining", () => {
    const motion: BarMotion = {
      kind: "countdown",
      deadlineMs: 10_000,
      spanMs: 10_000,
      fill: true,
    };
    expect(barScaleAt(motion, 2_500)).toBeCloseTo(0.25);
  });

  it("restarts every span when periodic", () => {
    const motion: BarMotion = {
      kind: "countdown",
      deadlineMs: 30_000,
      spanMs: 10_000,
      fill: true,
      periodic: true,
    };
    expect(barScaleAt(motion, 12_500)).toBeCloseTo(0.25);
    expect(barScaleAt(motion, 20_000)).toBe(0);
    expect(barScaleAt(motion, 30_000)).toBe(1);
  });
});

describe("barKeyframes", () => {
  it("starts on course without a previous value", () => {
    const result = barKeyframes(drain(10_000, 10_000), 5_000, null);
    expect(result?.durationMs).toBe(5_000);
    expect(result?.frames).toEqual([
      { offset: 0, scale: 0.5 },
      { offset: 1, scale: 0 },
    ]);
  });

  it("slides from the displayed value onto a shortened countdown", () => {
    // Deadline pulled in by 2s: the bar was at 0.5, the new course is 0.3.
    const result = barKeyframes(drain(8_000, 10_000), 5_000, 0.5);
    expect(result?.frames[0]).toEqual({ offset: 0, scale: 0.5 });
    expect(result?.frames[1]?.offset).toBeCloseTo(BAR_CATCH_UP_MS / 3_000);
    expect(result?.frames[1]?.scale).toBeCloseTo(0.29);
    expect(result?.frames.at(-1)).toEqual({ offset: 1, scale: 0 });
  });

  it("does not slide when the displayed value is already on course", () => {
    const result = barKeyframes(drain(10_000, 10_000), 5_000, 0.5);
    expect(result?.frames).toHaveLength(2);
  });

  it("holds full before the last span", () => {
    const result = barKeyframes(drain(30_000, 10_000), 0, null);
    expect(result?.frames).toEqual([
      { offset: 0, scale: 1 },
      { offset: 2 / 3, scale: 1 },
      { offset: 1, scale: 0 },
    ]);
  });

  it("encodes each periodic restart as an instant jump", () => {
    const motion: BarMotion = {
      kind: "countdown",
      deadlineMs: 25_000,
      spanMs: 10_000,
      fill: true,
      periodic: true,
    };
    const result = barKeyframes(motion, 0, null);
    expect(result?.frames).toEqual([
      { offset: 0, scale: 0.5 },
      { offset: 0.2, scale: 1 },
      { offset: 0.2, scale: 0 },
      { offset: 0.6, scale: 1 },
      { offset: 0.6, scale: 0 },
      { offset: 1, scale: 1 },
    ]);
  });

  it("rests once the deadline has passed, sliding only if needed", () => {
    expect(barKeyframes(drain(1_000, 1_000), 2_000, null)).toBeNull();
    expect(barKeyframes(drain(1_000, 1_000), 2_000, 0)).toBeNull();
    expect(barKeyframes(drain(1_000, 1_000), 2_000, 0.4)?.frames).toEqual([
      { offset: 0, scale: 0.4 },
      { offset: 1, scale: 0 },
    ]);
  });

  it("slides between static values like the replaced transition", () => {
    const result = barKeyframes({ kind: "static", scale: 0.8 }, 0, 0.2);
    expect(result).toEqual({
      frames: [
        { offset: 0, scale: 0.2 },
        { offset: 1, scale: 0.8 },
      ],
      durationMs: BAR_CATCH_UP_MS,
    });
    expect(barKeyframes({ kind: "static", scale: 0.8 }, 0, null)).toBeNull();
  });
});

describe("sameBarMotion", () => {
  it("ignores sub-millisecond jitter of a recomputed deadline", () => {
    expect(sameBarMotion(drain(10_000, 5_000), drain(10_000.4, 5_000.2))).toBe(
      true,
    );
    expect(sameBarMotion(drain(10_000, 5_000), drain(8_000, 5_000))).toBe(
      false,
    );
  });

  it("compares static values and kinds", () => {
    expect(
      sameBarMotion(
        { kind: "static", scale: 0.5 },
        { kind: "static", scale: 0.5 },
      ),
    ).toBe(true);
    expect(
      sameBarMotion({ kind: "static", scale: 1 }, drain(10_000, 10_000)),
    ).toBe(false);
  });
});
