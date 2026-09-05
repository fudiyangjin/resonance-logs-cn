import { describe, expect, it } from "vitest";
import { resolveAutoSwitchTarget } from "./loadout-auto-switch";
import type { Loadout } from "./settings-store";

function loadout(id: string, linkedTalentStageCfgId: number | null): Loadout {
  return {
    id,
    name: id,
    skillProfileId: `skill-${id}`,
    monsterProfileId: `monster-${id}`,
    liveProfileId: `live-${id}`,
    starterPlaceholder: false,
    linkedTalentStageCfgId,
  };
}

describe("resolveAutoSwitchTarget", () => {
  it("returns the loadout bound to the detected spec", () => {
    const items = [loadout("a", 108), loadout("b", 110)];
    expect(resolveAutoSwitchTarget(items, "b", 108)).toBe("a");
  });

  it("returns null when no loadout is bound to the spec", () => {
    const items = [loadout("a", 108), loadout("b", null)];
    expect(resolveAutoSwitchTarget(items, "a", 999)).toBeNull();
  });

  it("returns null when the bound loadout is already active", () => {
    const items = [loadout("a", 108), loadout("b", 110)];
    expect(resolveAutoSwitchTarget(items, "a", 108)).toBeNull();
  });

  it("ignores unbound loadouts even when the stage matches nothing", () => {
    const items = [loadout("a", null), loadout("b", null)];
    expect(resolveAutoSwitchTarget(items, "a", 108)).toBeNull();
  });
});
