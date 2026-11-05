import { describe, expect, it } from "vitest";
import { profilesToCollectAfterLoadoutRemoval } from "./loadout-lifecycle";
import type { Loadout } from "./settings-store";

function loadout(
  id: string,
  skillProfileId: string,
  monsterProfileId: string,
  liveProfileId = "live",
  damageProfileId = "damage",
): Loadout {
  return {
    id,
    name: id,
    skillProfileId,
    monsterProfileId,
    liveProfileId,
    damageProfileId,
    starterPlaceholder: false,
    linkedTalentStageCfgId: null,
  };
}

describe("profilesToCollectAfterLoadoutRemoval", () => {
  it("collects profiles owned only by the removed loadout", () => {
    expect(
      profilesToCollectAfterLoadoutRemoval(
        loadout("a", "skill-a", "monster-a", "live-a", "damage-a"),
        [loadout("b", "skill-b", "monster-b", "live-b", "damage-b")],
      ),
    ).toEqual({
      skillProfileId: "skill-a",
      monsterProfileId: "monster-a",
      liveProfileId: "live-a",
      damageProfileId: "damage-a",
    });
  });

  it("keeps profiles that are still shared", () => {
    expect(
      profilesToCollectAfterLoadoutRemoval(loadout("a", "skill", "monster"), [
        loadout("b", "skill", "monster"),
      ]),
    ).toEqual({
      skillProfileId: null,
      monsterProfileId: null,
      liveProfileId: null,
      damageProfileId: null,
    });
  });
});
