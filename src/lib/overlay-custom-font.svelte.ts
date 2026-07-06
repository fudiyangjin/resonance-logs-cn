import { SETTINGS } from "$lib/settings-store";
import { applyCustomFonts } from "$lib/font-loader";

/**
 * Loads the user's custom sans-serif font into the overlay window when the
 * "apply custom font to overlay" toggle is on. Mono is intentionally not
 * applied to overlays. Must be called once during overlay root component
 * initialization so the `$effect` is bound to that component's lifecycle.
 */
export function setupOverlayCustomFonts() {
  $effect(() => {
    const state = SETTINGS.accessibility.state;
    // Read every dependency up front (no short-circuit) so the effect
    // re-runs when any of them change.
    const applyToOverlay = state.customFontApplyToOverlay;
    const sansEnabled = state.customFontSansEnabled;
    const sansName = state.customFontSansName;
    const sansUrl = state.customFontSansUrl;
    void applyToOverlay;
    void sansEnabled;
    void sansName;
    void sansUrl;

    applyCustomFonts({
      sansEnabled: applyToOverlay && sansEnabled,
      sansName,
      sansUrl,
      monoEnabled: false,
      monoName: "",
      monoUrl: "",
    });
  });
}

/**
 * Returns the `font-family` CSS value to bind on an overlay root node, or
 * `undefined` to leave it unset (so the WebView falls back to its default
 * system font, which renders CJK glyphs cleanly). Only applies the custom
 * sans variable when the overlay toggle is on and a custom sans font is
 * enabled; otherwise the unbacked `"Inter Variable"` default would degrade
 * CJK rendering.
 */
export function overlayCustomFontFamily(): string | undefined {
  const state = SETTINGS.accessibility.state;
  if (!state.customFontApplyToOverlay || !state.customFontSansEnabled) {
    return undefined;
  }
  return "var(--font-sans)";
}
