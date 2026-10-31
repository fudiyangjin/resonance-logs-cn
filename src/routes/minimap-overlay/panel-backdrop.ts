/** Slate-900, the backdrop tone shared by the map and info panels. */
const BACKDROP_RGB = "15, 23, 42";

/**
 * Clamps a stored backdrop opacity to [0, 1]. Falls back when the value is
 * missing or not a number: the overlay window never runs the settings page's
 * defaults backfill, so legacy configs can lack the key.
 */
export function resolveBackdropOpacity(
  value: unknown,
  fallback: number,
): number {
  const opacity = Number(value ?? fallback);
  return Number.isFinite(opacity)
    ? Math.max(0, Math.min(1, opacity))
    : fallback;
}

export function backdropFill(opacity: number): string {
  return `rgba(${BACKDROP_RGB}, ${opacity})`;
}

/**
 * Scale (0..1) for a panel's outer drop shadow. It only shrinks once the
 * backdrop goes below its default, so the default look is unchanged while a
 * fully transparent panel leaves no dark halo over the game.
 */
export function backdropShadowStrength(
  opacity: number,
  defaultOpacity: number,
): number {
  if (!(defaultOpacity > 0)) return 1;
  return Math.max(0, Math.min(1, opacity / defaultOpacity));
}
