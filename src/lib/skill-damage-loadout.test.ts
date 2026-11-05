import { describe, expect, it } from "vitest";
import {
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  omitProfileId,
} from "./settings-store";
import { parseLoadoutExport } from "./loadout-import";
import {
  createSkillDamageProfile,
  skillDamageFontId,
} from "./skill-damage-settings";

const FONT_URL = "data:font/woff2;base64,AAAA";

function exported(extra: Record<string, unknown>) {
  return JSON.parse(
    JSON.stringify({
      kind: "resonance-logs-loadout",
      version: 2,
      name: "Damage",
      skillProfile: omitProfileId(createDefaultSkillMonitorProfile()),
      monsterProfile: omitProfileId(createDefaultMonsterMonitorProfile()),
      ...extra,
    }),
  ) as unknown;
}

describe("loadout export with a skill damage profile", () => {
  it("round trips the profile and the fonts it references", () => {
    const profile = createSkillDamageProfile("Burst");
    profile.enabled = true;
    const group = profile.groups[0]!;
    group.entries = [{ skillId: 25523102, alias: "Blast" }];
    group.fontId = "font_x";
    group.labelMode = "icon";
    group.layout = { x: 12, y: 34, scale: 1.5 };
    group.numberStyle.fill = {
      mode: "gradient",
      color: "#abcdef",
      endColor: "#123456",
      angle: 45,
    };
    const fonts = [{ id: "font_x", name: "Damage", dataUrl: FONT_URL }];

    const parsed = parseLoadoutExport(
      exported({ damageProfile: omitProfileId(profile), damageFonts: fonts }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.output.damageProfile).toEqual(omitProfileId(profile));
    expect(parsed.output.damageFonts).toEqual(fonts);
  });

  it("accepts exports that predate the damage profile", () => {
    const parsed = parseLoadoutExport(exported({}));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.output.damageProfile).toBeUndefined();
  });

  it("lifts the monster-embedded settings of PR #44 exports", () => {
    const monsterProfile = {
      ...omitProfileId(createDefaultMonsterMonitorProfile("Old")),
      autoHideInDailyScenes: true,
      skillDamageDisplay: {
        enabled: true,
        groups: [
          {
            id: "group-a",
            name: "Burst",
            entries: [{ skillId: 25523102, alias: "Blast" }],
            fontUrl: FONT_URL,
            fontFamily: "Damage",
            position: { x: 10, y: 20 },
          },
          { id: "group-b", entries: [{ skillId: 5, alias: "" }] },
        ],
      },
    };
    monsterProfile.overlayPositions = {
      ...monsterProfile.overlayPositions,
      skillDamagePanel: { x: 70, y: 80 },
    } as typeof monsterProfile.overlayPositions;
    monsterProfile.overlaySizes = {
      ...monsterProfile.overlaySizes,
      skillDamagePanelScale: 2,
    } as typeof monsterProfile.overlaySizes;
    monsterProfile.overlayVisibility = {
      ...monsterProfile.overlayVisibility,
      showSkillDamagePanel: false,
    } as typeof monsterProfile.overlayVisibility;
    const parsed = parseLoadoutExport(exported({ monsterProfile }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const fontId = skillDamageFontId(FONT_URL);
    expect(parsed.output.damageProfile).toMatchObject({
      enabled: false,
      autoHideInDailyScenes: true,
      groups: [
        {
          id: "group-a",
          entries: [{ skillId: 25523102, alias: "Blast" }],
          fontId,
          layout: { x: 10, y: 20, scale: 2 },
        },
        { id: "group-b", fontId: null, layout: { x: 70, y: 200, scale: 2 } },
      ],
    });
    expect(parsed.output.damageFonts).toEqual([
      { id: fontId, name: "Damage", dataUrl: FONT_URL },
    ]);
    expect(JSON.stringify(parsed.output.monsterProfile)).not.toContain(
      "skillDamage",
    );
  });

  it("rejects fonts that are not base64 data URLs", () => {
    const parsed = parseLoadoutExport(
      exported({
        damageProfile: omitProfileId(createSkillDamageProfile("")),
        damageFonts: [
          { id: "font_x", name: "Remote", dataUrl: "https://example.com/a" },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });
});
