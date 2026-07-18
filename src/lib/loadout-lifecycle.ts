import type { Loadout } from "./settings-store";

export type ProfilesToCollect = {
  skillProfileId: string | null;
  monsterProfileId: string | null;
  liveProfileId: string | null;
};

export function profilesToCollectAfterLoadoutRemoval(
  removed: Loadout,
  remaining: Loadout[],
): ProfilesToCollect {
  return {
    skillProfileId: remaining.some(
      (item) => item.skillProfileId === removed.skillProfileId,
    )
      ? null
      : removed.skillProfileId,
    monsterProfileId: remaining.some(
      (item) => item.monsterProfileId === removed.monsterProfileId,
    )
      ? null
      : removed.monsterProfileId,
    liveProfileId: remaining.some(
      (item) => item.liveProfileId === removed.liveProfileId,
    )
      ? null
      : removed.liveProfileId,
  };
}
