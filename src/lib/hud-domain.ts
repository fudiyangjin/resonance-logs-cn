/** Logical HUD layers sharing the single `hud-overlay` WebView. */
export const HUD_DOMAINS = ["game", "monster", "minimap", "damage"] as const;

export type HudDomain = (typeof HUD_DOMAINS)[number];

export type HudDomainVisibility = Record<HudDomain, boolean>;

export function isHudDomain(value: string): value is HudDomain {
  return (HUD_DOMAINS as readonly string[]).includes(value);
}

export function shouldShowHudWindow(
  visibility: HudDomainVisibility,
  editing: boolean,
): boolean {
  return editing || HUD_DOMAINS.some((domain) => visibility[domain]);
}
