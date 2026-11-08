/**
 * Minimal sRGB / OKLab / OKLCH helpers for the timeline's player colors.
 *
 * OKLab is used because its distances and lightness steps track perceived
 * difference far better than RGB or HSL, which is what "two players must not
 * look the same" and "lift a dark color without changing its hue" need.
 * Only `#rgb` / `#rrggbb` inputs are understood; anything else parses to null
 * so callers can fall back.
 */

type Rgb = { r: number; g: number; b: number };
type Oklab = { l: number; a: number; b: number };
export type Oklch = { l: number; c: number; h: number };

export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[1]!.toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return `#${full}`;
}

function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const c =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return c * 255;
}

function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Linear-light sRGB channels; may fall outside [0, 1] when out of gamut. */
function oklabToLinearRgb({ l, a, b }: Oklab): [number, number, number] {
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

function inGamut(channels: readonly number[]): boolean {
  return channels.every((value) => value >= -1e-4 && value <= 1 + 1e-4);
}

function linearRgbToHex(channels: readonly number[]): string {
  return `#${channels
    .map((value) =>
      Math.round(fromLinear(Math.min(1, Math.max(0, value))))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { l, a, b } = rgbToOklab(rgb);
  const c = Math.hypot(a, b);
  const h = c < 1e-6 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c, h: (h + 360) % 360 };
}

/** Back to `#rrggbb`. Out-of-gamut colors keep lightness and hue and give up
 * chroma (binary search), so a lifted or rotated color never shifts hue. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const lightness = Math.min(1, Math.max(0, l));
  const rad = (h * Math.PI) / 180;
  const at = (chroma: number) =>
    oklabToLinearRgb({
      l: lightness,
      a: chroma * Math.cos(rad),
      b: chroma * Math.sin(rad),
    });
  let channels = at(c);
  if (!inGamut(channels)) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 16; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(at(mid))) low = mid;
      else high = mid;
    }
    channels = at(low);
  }
  return linearRgbToHex(channels);
}

function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
}

/** WCAG 2 contrast ratio (1..21); 1 when either color is unparseable. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Euclidean OKLab distance; Infinity when either color is unparseable. */
export function oklabDistance(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const pa = rgbToOklab(a);
  const pb = rgbToOklab(b);
  return Math.hypot(pa.l - pb.l, pa.a - pb.a, pa.b - pb.b);
}

/** Returns `hex` untouched when it already reaches `minRatio` against
 * `backgroundHex`; otherwise raises only its OKLCH lightness (hue kept) until
 * it does. Meant for a dark background, where lighter means more contrast. */
export function ensureContrast(
  hex: string,
  backgroundHex: string,
  minRatio: number,
): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return hex;
  if (contrastRatio(normalized, backgroundHex) >= minRatio) return normalized;
  const color = hexToOklch(normalized)!;
  let candidate = normalized;
  for (let l = color.l; l <= 1; l += 0.01) {
    candidate = oklchToHex({ ...color, l });
    if (contrastRatio(candidate, backgroundHex) >= minRatio) return candidate;
  }
  return candidate;
}
