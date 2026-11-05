import type { HudDomainVisibility } from "$lib/hud-domain";

export {
  HUD_DOMAINS,
  isHudDomain,
  shouldShowHudWindow,
  type HudDomain,
  type HudDomainVisibility,
} from "$lib/hud-domain";

export const HUD_OVERLAY_LABEL = "hud-overlay";
export const HUD_STATE_SYNC_EVENT = "hud-overlay-state-sync";
export const HUD_READY_EVENT = "hud-overlay-ready";
export const HUD_EDIT_REQUEST_EVENT = "hud-overlay-edit-request";

export type HudStateSyncEvent = {
  visibility: HudDomainVisibility;
  editing: boolean;
};

export type HudEditRequestEvent = {
  editing: boolean;
};
