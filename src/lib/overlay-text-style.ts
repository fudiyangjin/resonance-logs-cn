/**
 * Returns the value to bind on the `--overlay-text-shadow` CSS variable.
 * - `false` -> "none" disables the shadow on descendants.
 * - `true` / `undefined` -> "initial" resets the custom property to its
 *   guaranteed-invalid value so each descendant's `var(--overlay-text-shadow,
 *   <default>)` falls back to its own hardcoded `text-shadow`. Using
 *   "initial" instead of leaving the property unset is important: CSS custom
 *   properties inherit, so an ancestor's "none" would otherwise override the
 *   absence. "initial" explicitly breaks that inheritance.
 */
export function overlayTextShadow(enabled: boolean | undefined): string {
  if (enabled === false) return "none";
  return "initial";
}

/**
 * Returns a `background` CSS value for an overlay panel's dark mask, or
 * `undefined` to keep the panel transparent.
 */
export function overlayPanelBackground(
  enabled: boolean | undefined,
  opacity: number | undefined,
): string | undefined {
  if (!enabled) return undefined;
  const clamped = Math.max(0, Math.min(1, Number(opacity ?? 0.76)));
  return `rgba(15, 23, 42, ${clamped})`;
}
