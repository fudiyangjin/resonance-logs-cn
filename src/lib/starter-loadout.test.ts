import { describe, expect, it } from "vitest";
import {
  createDefaultLiveMeterProfileData,
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  createReferenceLiveMeterProfileData,
  createReferenceMonsterMonitorProfile,
  createReferenceSkillMonitorProfile,
  type Loadout,
} from "./settings-store";
import {
  applySchemeToMonsterStyles,
  getHudColorScheme,
} from "./hud-color-schemes";
import { extractLiveProfileData } from "./live-meter-profile.svelte";
import {
  isDefaultLiveMeterProfileData,
  isReplaceableStarterLoadout,
} from "./starter-loadout";

describe("untouched live meter detection", () => {
  it("treats the untouched live stores of a fresh install as default", () => {
    // A fresh install migrates from these stores; if their defaults drift
    // from `createDefaultLiveMeterProfileData`, new users silently lose the
    // reference look.
    expect(isDefaultLiveMeterProfileData(extractLiveProfileData())).toBe(true);
  });

  it("rejects any user change and the reference look itself", () => {
    const changed = createDefaultLiveMeterProfileData();
    changed.tableCustomization.playerRowHeight = 31;
    expect(isDefaultLiveMeterProfileData(changed)).toBe(false);
    expect(
      isDefaultLiveMeterProfileData(createReferenceLiveMeterProfileData()),
    ).toBe(false);
  });
});

function starterLoadout(): Loadout {
  return {
    id: "loadout",
    name: "Default",
    skillProfileId: "skill",
    monsterProfileId: "monster",
    liveProfileId: "live",
    damageProfileId: "damage",
    starterPlaceholder: true,
    linkedTalentStageCfgId: null,
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
    skill.monitoredSkillIds = [101];
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

  it("treats the default HUD colors as untouched, but not other schemes or edits", () => {
    const skill = createReferenceSkillMonitorProfile();
    const monster = createReferenceMonsterMonitorProfile();
    expect(isReplaceableStarterLoadout(starterLoadout(), skill, monster)).toBe(
      true,
    );

    skill.textBuffPanelStyle!.nameColor = "#123456";
    expect(isReplaceableStarterLoadout(starterLoadout(), skill, monster)).toBe(
      false,
    );

    const iceMonster = {
      ...createDefaultMonsterMonitorProfile(),
      ...applySchemeToMonsterStyles(
        createDefaultMonsterMonitorProfile(),
        getHudColorScheme("ice"),
      ),
    };
    expect(
      isReplaceableStarterLoadout(
        starterLoadout(),
        createReferenceSkillMonitorProfile(),
        iceMonster,
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
