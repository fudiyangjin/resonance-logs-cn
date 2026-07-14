import { describe, expect, it } from "vitest";
import { MinimapVoiceCueDeduper } from "./minimap-voice-dedupe";

describe("MinimapVoiceCueDeduper", () => {
  it("fires the same cue instance only once", () => {
    const deduper = new MinimapVoiceCueDeduper();

    expect(deduper.shouldFire("ring.inner", "boss:1:1000")).toBe(true);
    expect(deduper.shouldFire("ring.inner", "boss:1:1000")).toBe(false);
  });

  it("does not suppress distinct rapid instances", () => {
    const deduper = new MinimapVoiceCueDeduper();

    expect(deduper.shouldFire("ring.inner", "boss:1:1000")).toBe(true);
    expect(deduper.shouldFire("ring.inner", "boss:1:1100")).toBe(true);
    expect(deduper.shouldFire("ring.outer", "boss:3:1200")).toBe(true);
  });

  it("allows instances again after reset", () => {
    const deduper = new MinimapVoiceCueDeduper();
    expect(deduper.shouldFire("portal", "entity-1")).toBe(true);

    deduper.reset();

    expect(deduper.shouldFire("portal", "entity-1")).toBe(true);
  });

  it("evicts the oldest bounded entry", () => {
    const deduper = new MinimapVoiceCueDeduper(2);
    expect(deduper.shouldFire("cue", "one")).toBe(true);
    expect(deduper.shouldFire("cue", "two")).toBe(true);
    expect(deduper.shouldFire("cue", "three")).toBe(true);
    expect(deduper.shouldFire("cue", "one")).toBe(true);
  });
});
