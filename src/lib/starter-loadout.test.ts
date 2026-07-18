import { describe, expect, it } from "vitest";
import {
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  type Loadout,
} from "./settings-store";
import { isReplaceableStarterLoadout } from "./starter-loadout";

function starterLoadout(): Loadout {
  return {
    id: "loadout",
    name: "Default",
    skillProfileId: "skill",
    monsterProfileId: "monster",
    liveProfileId: "live",
    starterPlaceholder: true,
  };
}

describe("starter loadout replacement", () => {
  it("allows replacement only for a marked, fully default loadout", () => {
    const skill = createDefaultSkillMonitorProfile();
    const monster = createDefaultMonsterMonitorProfile();
    expect(isReplaceableStarterLoadout(starterLoadout(), skill, monster)).toBe(
      true,
    );
  });

  it("never replaces an unmarked loadout", () => {
    const loadout = { ...starterLoadout(), starterPlaceholder: false };
    expect(
      isReplaceableStarterLoadout(
        loadout,
        createDefaultSkillMonitorProfile(),
        createDefaultMonsterMonitorProfile(),
      ),
    ).toBe(false);
  });

  it("detects nested skill and monster configuration changes", () => {
    const skill = createDefaultSkillMonitorProfile();
    skill.monitoredSkillDurationIds = [101];
    expect(
      isReplaceableStarterLoadout(
        starterLoadout(),
        skill,
        createDefaultMonsterMonitorProfile(),
      ),
    ).toBe(false);

    const monster = createDefaultMonsterMonitorProfile();
    monster.dbmVoiceConfigs = {
      "101": { onCast: { enabled: true, phrase: { source: "auto" } } },
    };
    expect(
      isReplaceableStarterLoadout(
        starterLoadout(),
        createDefaultSkillMonitorProfile(),
        monster,
      ),
    ).toBe(false);
  });

  it("normalizes missing legacy default fields before comparison", () => {
    const skill = createDefaultSkillMonitorProfile();
    delete skill.buffVoiceConfigs;
    delete skill.overlaySizes.categoryIconSizes;
    const monster = createDefaultMonsterMonitorProfile();
    delete monster.dbmVoiceConfigs;

    expect(isReplaceableStarterLoadout(starterLoadout(), skill, monster)).toBe(
      true,
    );
  });

  it("rejects unknown fields instead of ignoring possible user settings", () => {
    const skill = createDefaultSkillMonitorProfile() as ReturnType<
      typeof createDefaultSkillMonitorProfile
    > & { legacyCustomSetting?: boolean };
    skill.legacyCustomSetting = true;

    expect(
      isReplaceableStarterLoadout(
        starterLoadout(),
        skill,
        createDefaultMonsterMonitorProfile(),
      ),
    ).toBe(false);
  });
});
