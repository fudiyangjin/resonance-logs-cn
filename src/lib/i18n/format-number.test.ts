import { afterEach, describe, expect, it } from "vitest";
import { formatNumber, getLocale, setLocale } from "./index.svelte";

describe("formatNumber", () => {
  const initialLocale = getLocale();
  afterEach(() => {
    setLocale(initialLocale);
  });

  it("matches a fresh Intl.NumberFormat for every option set", () => {
    const cases: [number, Intl.NumberFormatOptions | undefined][] = [
      [1234567.891, undefined],
      [1234567.891, { maximumFractionDigits: 0 }],
      [0.4567, { maximumFractionDigits: 1, minimumFractionDigits: 1 }],
      [1234567.891, undefined],
    ];
    for (const [value, options] of cases) {
      expect(formatNumber(value, options)).toBe(
        new Intl.NumberFormat(getLocale(), options).format(value),
      );
    }
  });

  it("follows a locale change", () => {
    setLocale("en-US");
    expect(formatNumber(1234.5)).toBe(
      new Intl.NumberFormat("en-US").format(1234.5),
    );
    setLocale("ja-JP");
    expect(formatNumber(1234.5)).toBe(
      new Intl.NumberFormat("ja-JP").format(1234.5),
    );
  });
});
