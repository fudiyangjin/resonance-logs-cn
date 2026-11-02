import { describe, expect, it } from "vitest";
import {
  backdropFill,
  backdropShadowStrength,
  resolveBackdropOpacity,
} from "./panel-backdrop";

describe("resolveBackdropOpacity", () => {
  it("falls back when the stored value is missing or not a number", () => {
    expect(resolveBackdropOpacity(undefined, 0.68)).toBe(0.68);
    expect(resolveBackdropOpacity(null, 0.68)).toBe(0.68);
    expect(resolveBackdropOpacity("abc", 0.68)).toBe(0.68);
  });

  it("clamps to [0, 1] and keeps valid values", () => {
    expect(resolveBackdropOpacity(-0.2, 0.68)).toBe(0);
    expect(resolveBackdropOpacity(1.4, 0.68)).toBe(1);
    expect(resolveBackdropOpacity(0, 0.68)).toBe(0);
    expect(resolveBackdropOpacity(0.3, 0.68)).toBe(0.3);
  });
});

describe("backdropFill", () => {
  it("uses the shared slate tone with the given alpha", () => {
    expect(backdropFill(0.68)).toBe("rgba(15, 23, 42, 0.68)");
    expect(backdropFill(0)).toBe("rgba(15, 23, 42, 0)");
  });
});

describe("backdropShadowStrength", () => {
  it("keeps the full shadow at or above the default opacity", () => {
    expect(backdropShadowStrength(0.68, 0.68)).toBe(1);
    expect(backdropShadowStrength(1, 0.68)).toBe(1);
  });

  it("fades the shadow proportionally below the default", () => {
    expect(backdropShadowStrength(0.34, 0.68)).toBeCloseTo(0.5);
    expect(backdropShadowStrength(0, 0.68)).toBe(0);
  });

  it("keeps the shadow when the default is not positive", () => {
    expect(backdropShadowStrength(0, 0)).toBe(1);
  });
});
