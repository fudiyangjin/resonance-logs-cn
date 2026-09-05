import type { Loadout } from "./settings-store";

/**
 * Picks the loadout to switch to for a detected talent branch. Returns `null`
 * when no loadout is bound to `stageId` or when the bound loadout is already
 * active, so transient respec stages and no-op changes never cause a switch.
 */
export function resolveAutoSwitchTarget(
  items: Loadout[],
  activeId: string,
  stageId: number,
): string | null {
  const target = items.find((item) => item.linkedTalentStageCfgId === stageId);
  if (!target || target.id === activeId) return null;
  return target.id;
}
