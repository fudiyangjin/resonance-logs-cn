import { describe, expect, it } from "vitest";

import type { BuffUpdateState } from "$lib/bindings";
import {
  INITIAL_FLOWER_CYCLE,
  advanceFlowerCycle,
  nextFlowerColor,
  readFlowerSnapshot,
  type FlowerCycleState,
  type FlowerSnapshot,
} from "./flower-rotation";
import type { FlowerColor } from "./skill-mappings";

const definition = {
  countdownBuffId: 2202716,
  petals: [
    { color: "red" as const, buffBaseId: 2202713, image: "" },
    { color: "yellow" as const, buffBaseId: 2202714, image: "" },
    { color: "blue" as const, buffBaseId: 2202715, image: "" },
  ],
};

function buff(
  baseId: number,
  overrides: Partial<BuffUpdateState> = {},
): BuffUpdateState {
  return {
    baseId,
    durationMs: 0,
    createTimeMs: 0,
    layer: 1,
    sourceRemodelLevel: null,
    ...overrides,
  };
}

function snap(
  deadlineMs: number | null,
  ...petals: FlowerColor[]
): FlowerSnapshot {
  return { deadlineMs, petals: new Set(petals) };
}

function run(steps: FlowerSnapshot[], from = INITIAL_FLOWER_CYCLE) {
  return steps.reduce<FlowerCycleState>(
    (state, step) => advanceFlowerCycle(state, step, definition),
    from,
  );
}

describe("flower rotation", () => {
  it("cycles red -> yellow -> blue -> red", () => {
    expect(nextFlowerColor(definition, "red")).toBe("yellow");
    expect(nextFlowerColor(definition, "yellow")).toBe("blue");
    expect(nextFlowerColor(definition, "blue")).toBe("red");
  });

  it("reads the countdown deadline and held petals from the buff map", () => {
    const map = new Map<number, BuffUpdateState>([
      [2202716, buff(2202716, { durationMs: 30_000, createTimeMs: 1_000 })],
      [2202713, buff(2202713)],
      [2202715, buff(2202715)],
    ]);
    const snapshot = readFlowerSnapshot(map, definition);
    expect(snapshot.deadlineMs).toBe(31_000);
    expect([...snapshot.petals]).toEqual(["red", "blue"]);
  });

  it("stays uncalibrated on the first frame", () => {
    const state = run([snap(45_000)]);
    expect(state.nextColor).toBeNull();
    expect(state.prevDeadlineMs).toBe(45_000);
  });

  it("does not treat haste shrinking the deadline as a restart", () => {
    const state = run([snap(45_000), snap(44_900), snap(44_810)]);
    expect(state.nextColor).toBeNull();
    expect(state.prevDeadlineMs).toBe(44_810);
  });

  it("pins the pointer after a natural spawn", () => {
    const state = run([snap(45_000), snap(90_000, "red")]);
    expect(state.nextColor).toBe("yellow");
  });

  it("advances the pointer when the spawn was skipped because the colour was held", () => {
    const state = run([
      snap(45_000),
      snap(90_000, "red"),
      snap(135_000, "red", "yellow"),
      // blue would spawn next; player still holds red+yellow, blue spawns
      snap(180_000, "red", "yellow", "blue"),
      // next is red again but red is still held: no new petal, pointer moves on
      snap(225_000, "red", "yellow", "blue"),
    ]);
    expect(state.nextColor).toBe("yellow");
  });

  it("ignores consumption and 三色启示 (petals change without a restart)", () => {
    const state = run([
      snap(45_000),
      snap(90_000, "red"),
      snap(89_000),
      snap(88_500, "red", "yellow", "blue"),
    ]);
    expect(state.nextColor).toBe("yellow");
  });

  it("keeps the pointer when several petals appear together with a restart", () => {
    const state = run([
      snap(45_000),
      snap(90_000, "red"),
      snap(135_000, "red", "yellow", "blue"),
    ]);
    expect(state.nextColor).toBe("yellow");
  });

  it("resets when the countdown buff disappears", () => {
    const calibrated = run([snap(45_000), snap(90_000, "red")]);
    const reset = advanceFlowerCycle(calibrated, snap(null, "red"), definition);
    expect(reset.nextColor).toBeNull();
    expect(reset.prevDeadlineMs).toBeNull();
    const again = advanceFlowerCycle(reset, snap(null, "red"), definition);
    expect(again).toBe(reset);
  });

  it("returns the same reference when nothing changed", () => {
    const state = run([snap(45_000), snap(90_000, "red")]);
    expect(advanceFlowerCycle(state, snap(90_000, "red"), definition)).toBe(
      state,
    );
  });
});
