/**
 * @file Pure helpers behind `ColorField`: parsing what a user types or pastes
 * into a color box, the "recent colors" list, and the throttle that keeps a
 * dragged native picker from writing the settings file on every step.
 */
import { normalizeHex } from "$lib/components/encounter-timeline/timeline-color-math";

const RGB_FUNCTION =
  /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;

function channelHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/**
 * `#rgb`, `#rrggbb` (the `#` is optional) or `rgb(r, g, b)` to lowercase
 * `#rrggbb`; null for anything else. An `rgba()` alpha is ignored: the
 * fields this parses for hold opaque colors.
 */
export function parseColorInput(text: string): string | null {
  const trimmed = text.trim();
  const hex = normalizeHex(trimmed);
  if (hex) return hex;
  const match = RGB_FUNCTION.exec(trimmed);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((value) => value > 255)) return null;
  return `#${channels.map(channelHex).join("")}`;
}

export const RECENT_COLORS_MAX = 8;

/** `hex` moved to the front of `list`, without duplicates, at most `max` long. */
export function pushRecentColor(
  list: readonly string[],
  hex: string,
  max = RECENT_COLORS_MAX,
): string[] {
  const color = parseColorInput(hex);
  if (!color) return [...list];
  return [color, ...list.filter((item) => item !== color)].slice(0, max);
}

/** Valid colors of an untrusted stored list, deduplicated, at most `max`. */
export function sanitizeRecentColors(
  value: unknown,
  max = RECENT_COLORS_MAX,
): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const color = typeof item === "string" ? parseColorInput(item) : null;
    if (color && !result.includes(color)) result.push(color);
    if (result.length >= max) break;
  }
  return result;
}

export type ThrottledCommit<T> = {
  /** Commits now if the window is open, otherwise once it closes. */
  push(value: T): void;
  /** Commits a pending value immediately. */
  flush(): void;
  /** Drops a pending value. */
  cancel(): void;
};

/**
 * Leading + trailing throttle: the first value commits at once, later ones
 * at most every `ms`, and the last one is never lost.
 */
export function createThrottledCommit<T>(
  commit: (value: T) => void,
  ms = 200,
): ThrottledCommit<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  function openWindow() {
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        const { value } = pending;
        pending = null;
        commit(value);
        openWindow();
      }
    }, ms);
  }

  return {
    push(value) {
      if (timer === null) {
        commit(value);
        openWindow();
      } else {
        pending = { value };
      }
    },
    flush() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (pending) {
        const { value } = pending;
        pending = null;
        commit(value);
      }
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
