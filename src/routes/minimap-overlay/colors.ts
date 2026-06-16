/**
 * Shared color palette for called-out mechanics on the minimap.
 *
 * The same `colorSlot` index must produce the same color in both the info bar
 * (dot + progress) and the minimap canvas (entity ring / region fill), so this
 * is the single source of truth.
 */

// 12-slot palette ordered to avoid adjacent slots sharing close hue/lightness.
const COLOR_SLOTS = [
  "#facc15", // yellow
  "#22c55e", // green
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#3b82f6", // blue
  "#84cc16", // lime
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f59e0b", // amber
] as const;

/** Returns the hex color for a color slot, wrapping if out of range. */
export function slotColor(slot: number): string {
  const n = COLOR_SLOTS.length;
  const idx = ((slot % n) + n) % n;
  return COLOR_SLOTS[idx] ?? COLOR_SLOTS[0];
}
