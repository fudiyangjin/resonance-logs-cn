import { describe, expect, it } from "vitest";
import { profilesToCollectAfterLoadoutRemoval } from "./loadout-lifecycle";
import type { Loadout } from "./settings-store";

function loadout(
  id: string,
  skillProfileId: string,
  monsterProfileId: string,
  liveProfileId = "live",
): Loadout {
  return {
    id,
    name: id,
    skillProfileId,
    monsterProfileId,
    liveProfileId,
    starterPlaceholder: false,
  };
}

describe("profilesToCollectAfterLoadoutRemoval", () => {
  it("collects profiles owned only by the removed loadout", () => {
    expect(
      profilesToCollectAfterLoadoutRemoval(
        loadout("a", "skill-a", "monster-a", "live-a"),
        [loadout("b", "skill-b", "monster-b", "live-b")],
      ),
    ).toEqual({
      skillProfileId: "skill-a",
      monsterProfileId: "monster-a",
      liveProfileId: "live-a",
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
    });
  });
});
