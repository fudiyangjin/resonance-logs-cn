import type { MonsterOverlayVisibility } from "./settings-store";

export type LegacyMonsterPanelFlags = {
  hateListEnabled?: boolean;
  stunListEnabled?: boolean;
  hpListEnabled?: boolean;
};

export const LEGACY_MONSTER_PANEL_KEYS = [
  "hateListEnabled",
  "stunListEnabled",
  "hpListEnabled",
] as const;

/** Only call for pre-v6 settings or v1 exports, before applying new defaults. */
export function migrateLegacyMonsterPanels<
  T extends { overlayVisibility: MonsterOverlayVisibility },
>(source: T): T {
  const legacy = source as T & LegacyMonsterPanelFlags;
  const visibility = source.overlayVisibility;
  const result = {
    ...source,
    overlayVisibility: {
      ...visibility,
      showHatePanel:
        (legacy.hateListEnabled ?? false) &&
        (visibility?.showHatePanel ?? true),
      showStunPanel:
        (legacy.stunListEnabled ?? false) &&
        (visibility?.showStunPanel ?? false),
      showHpPanel:
        (legacy.hpListEnabled ?? false) && (visibility?.showHpPanel ?? false),
    },
  };
  for (const key of LEGACY_MONSTER_PANEL_KEYS) {
    delete (result as T & LegacyMonsterPanelFlags)[key];
  }
  return result;
}
