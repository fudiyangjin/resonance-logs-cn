/**
 * @file Colors the user recently committed in any `ColorField`, newest
 * first. A per-machine convenience: kept in `localStorage` rather than the
 * settings stores, so it is never exported with a loadout and remembering a
 * color never rewrites (and broadcasts) a whole settings file.
 */
import { pushRecentColor, sanitizeRecentColors } from "./color-field";

const STORAGE_KEY = "color-field.recent";

function load(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? sanitizeRecentColors(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

let colors = $state<string[]>(load());

export function recentColors(): readonly string[] {
  return colors;
}

export function rememberColor(hex: string): void {
  const next = pushRecentColor(colors, hex);
  const unchanged =
    next.length === colors.length &&
    next.every((color, index) => color === colors[index]);
  if (unchanged) return;
  colors = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; the list still works for this session.
  }
}
