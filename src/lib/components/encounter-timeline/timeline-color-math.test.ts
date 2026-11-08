import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureContrast,
  hexToOklch,
  normalizeHex,
  oklabDistance,
  oklchToHex,
} from "./timeline-color-math";

describe("normalizeHex", () => {
  it("accepts short and long hex, with or without #", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("9b6cf0")).toBe("#9b6cf0");
  });

  it("rejects anything else", () => {
    expect(normalizeHex("rgb(1, 2, 3)")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
});

describe("OKLCH round trip", () => {
  it.each(["#9b6cf0", "#4a2f80", "#ffffff", "#000000", "#14171d", "#ffee00"])(
    "%s survives hex → oklch → hex",
    (hex) => {
      expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
    },
  );

  it("gives up chroma, not hue, for out-of-gamut colors", () => {
    const yellow = hexToOklch("#ffee00")!;
    const lifted = hexToOklch(oklchToHex({ ...yellow, l: 0.99 }))!;
    expect(lifted.l).toBeCloseTo(0.99, 2);
    expect(Math.abs(lifted.h - yellow.h)).toBeLessThan(5);
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#9b6cf0", "#9b6cf0")).toBe(1);
  });
});

describe("ensureContrast", () => {
  it("returns readable colors unchanged", () => {
    expect(ensureContrast("#ffffff", "#14171d", 3)).toBe("#ffffff");
  });

  it("lifts dark colors to the requested contrast", () => {
    const lifted = ensureContrast("#3b6d00", "#14171d", 3);
    expect(contrastRatio(lifted, "#14171d")).toBeGreaterThanOrEqual(3);
  });
});

describe("oklabDistance", () => {
  it("is zero for the same color and grows with difference", () => {
    expect(oklabDistance("#9b6cf0", "#9b6cf0")).toBe(0);
    expect(oklabDistance("#000000", "#ffffff")).toBeCloseTo(1, 2);
  });
});
