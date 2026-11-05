import { describe, expect, it } from "vitest";
import {
  createDefaultLiveMeterProfileData,
  createDefaultMonitoringSettingsState,
  createDefaultMonsterMonitorProfile,
  type Loadout,
} from "./settings-store";
import { migrateMonitoringStateIncrementally } from "./settings-migrations";
import type { SkillDamageFont } from "./skill-damage-settings";
import { skillDamageFontId } from "./skill-damage-settings";

const FONT_URL = "data:font/woff2;base64,AAAA";

type LegacyData = Record<string, unknown> & {
  overlayPositions: Record<string, unknown>;
  overlaySizes: Record<string, unknown>;
  overlayVisibility: Record<string, unknown>;
};

/** A schema v7 state carrying PR #44's monster-embedded damage settings. */
function legacyState() {
  const state = createDefaultMonitoringSettingsState();
  state.schemaVersion = 7;
  const [first] = state.monsterMonitor.profiles;
  const second = createDefaultMonsterMonitorProfile("Second");
  const third = createDefaultMonsterMonitorProfile("Third");
  state.monsterMonitor.profiles.push(second, third);
  state.monsterMonitor.mirroredProfileId = first!.id;

  const mirror = state.monsterMonitor as unknown as LegacyData;
  mirror["skillDamageDisplay"] = {
    enabled: true,
    groups: [
      {
        id: "group-a",
        name: "Burst",
        entries: [{ skillId: 25523102, alias: "Blast" }],
        showSkillName: false,
        fontUrl: FONT_URL,
        fontFamily: "Damage",
        position: { x: 10, y: 20 },
        scale: 4,
        x: 1,
        y: 2,
      },
    ],
  };
  mirror.overlayPositions["skillDamagePanel"] = { x: 1, y: 1 };
  mirror.overlaySizes["skillDamagePanelScale"] = 1;
  mirror.overlayVisibility["showSkillDamagePanel"] = true;
  // The mirrored slot is stale; the mirror wins.
  (first as unknown as LegacyData)["skillDamageDisplay"] = { enabled: false };

  const flat = second as unknown as LegacyData;
  flat["skillDamageDisplay"] = {
    enabled: false,
    entries: [{ skillId: 5, alias: "Five" }],
    fontColor: "#123456",
    x: 50,
    y: 60,
  };
  flat.overlayPositions["skillDamagePanel"] = { x: 70, y: 80 };

  const loadout = (id: string, monsterProfileId: string) =>
    ({
      id,
      name: id,
      skillProfileId: state.skillMonitor.profiles[0]!.id,
      monsterProfileId,
      liveProfileId: state.liveMeter.profiles[0]!.id,
      starterPlaceholder: false,
      linkedTalentStageCfgId: null,
    }) as unknown as Loadout;
  state.loadouts.items = [
    loadout("l1", first!.id),
    loadout("l2", second.id),
    loadout("l3", second.id),
    loadout("l4", third.id),
  ];
  state.loadouts.activeId = "l1";
  return state;
}

describe("schema v8 skill damage migration", () => {
  it("moves monster damage settings into loadout-linked damage profiles", () => {
    const fonts: SkillDamageFont[] = [];
    const migrated = migrateMonitoringStateIncrementally(
      legacyState(),
      createDefaultLiveMeterProfileData(),
      fonts,
    );
    const items = migrated.loadouts.items;
    const profileOf = (index: number) =>
      migrated.skillDamage.profiles.find(
        (profile) => profile.id === items[index]!.damageProfileId,
      )!;

    expect(migrated.skillDamage.profiles).toHaveLength(3);
    expect(items[1]!.damageProfileId).toBe(items[2]!.damageProfileId);
    expect(new Set(items.map((item) => item.damageProfileId)).size).toBe(3);

    const burst = profileOf(0);
    expect(burst.enabled).toBe(true);
    expect(burst.groups[0]).toMatchObject({
      id: "group-a",
      name: "Burst",
      labelMode: "none",
      fontId: skillDamageFontId(FONT_URL),
      fontFamily: "",
      layout: { x: 10, y: 20, scale: 2.5 },
    });
    expect(fonts).toEqual([
      { id: skillDamageFontId(FONT_URL), name: "Damage", dataUrl: FONT_URL },
    ]);

    const flat = profileOf(1);
    expect(flat.enabled).toBe(false);
    expect(flat.groups).toHaveLength(1);
    expect(flat.groups[0]).toMatchObject({
      entries: [{ skillId: 5, alias: "Five" }],
      numberStyle: { fill: { color: "#123456" } },
      layout: { x: 70, y: 80, scale: 1 },
    });

    expect(profileOf(3).groups[0]!.entries).toEqual([]);
  });

  it("keeps a profile hidden when its PR #44 region toggle was off", () => {
    const state = legacyState();
    const mirror = state.monsterMonitor as unknown as LegacyData;
    mirror.overlayVisibility["showSkillDamagePanel"] = false;
    const migrated = migrateMonitoringStateIncrementally(
      state,
      createDefaultLiveMeterProfileData(),
    );
    const active = migrated.skillDamage.profiles.find(
      (profile) => profile.id === migrated.loadouts.items[0]!.damageProfileId,
    );
    expect(active?.enabled).toBe(false);
    expect(active?.groups[0]?.entries).toHaveLength(1);
  });

  it("removes the legacy fields from the mirror and every slot", () => {
    const migrated = migrateMonitoringStateIncrementally(
      legacyState(),
      createDefaultLiveMeterProfileData(),
    );
    const json = JSON.stringify(migrated.monsterMonitor);
    expect(json).not.toContain("skillDamageDisplay");
    expect(json).not.toContain("skillDamagePanel");
    expect(json).not.toContain("showSkillDamagePanel");
  });
});
