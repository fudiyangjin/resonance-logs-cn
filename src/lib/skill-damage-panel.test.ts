import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SETTINGS,
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  omitProfileId,
  defaultSkillDamageDisplay,
} from "./settings-store";
import { normalizeMonsterProfileStyles } from "./monster-monitor-profile.svelte";
import { parseLoadoutExport } from "./loadout-import";
import { createSkillDamageGroup } from "./skill-damage-groups";
import {
  getMonsterOverlayVisibility,
  getSkillDamagePanelPosition,
  getSkillDamagePanelScale,
  setSkillDamagePanelPosition,
  setSkillDamagePanelScale,
  resetMonsterOverlayPositions,
  resetMonsterOverlaySizes,
} from "../routes/monster-overlay/monster-layout.svelte";

describe("skill damage overlay layout", () => {
  it("stores positions and unrestricted scales per group and resets them independently of styles", () => {
    const first = createSkillDamageGroup("First");
    const second = createSkillDamageGroup("Second");
    SETTINGS.monsterMonitor.state.skillDamageDisplay = {
      ...defaultSkillDamageDisplay(),
      groups: [first, second],
    };
    expect(getSkillDamagePanelPosition(second.id)).not.toEqual(
      getSkillDamagePanelPosition(first.id),
    );
    setSkillDamagePanelPosition({ x: 123, y: 321 }, first.id);
    setSkillDamagePanelPosition({ x: 654, y: 456 }, second.id);
    setSkillDamagePanelScale(15, first.id);
    setSkillDamagePanelScale(0.02, second.id);
    expect(getSkillDamagePanelPosition(first.id)).toEqual({ x: 123, y: 321 });
    expect(getSkillDamagePanelPosition(second.id)).toEqual({ x: 654, y: 456 });
    expect(getSkillDamagePanelScale(first.id)).toBe(15);
    expect(getSkillDamagePanelScale(second.id)).toBe(0.02);
    expect(getSkillDamagePanelScale()).toBe(1);
    resetMonsterOverlayPositions();
    resetMonsterOverlaySizes();
    expect(getSkillDamagePanelPosition(first.id)).toEqual({ x: 500, y: 300 });
    expect(getSkillDamagePanelScale(first.id)).toBe(1);
    expect(getSkillDamagePanelScale(second.id)).toBe(1);
    expect(
      SETTINGS.monsterMonitor.state.skillDamageDisplay.groups?.[0]?.name,
    ).toBe("First");
  });
  let previous: typeof SETTINGS.monsterMonitor.state;
  beforeEach(() => {
    previous = JSON.parse(JSON.stringify(SETTINGS.monsterMonitor.state));
    Object.assign(
      SETTINGS.monsterMonitor.state,
      createDefaultMonsterMonitorProfile(),
    );
  });
  afterEach(() => Object.assign(SETTINGS.monsterMonitor.state, previous));

  it("persists position and allows scales outside the other panels limits", () => {
    setSkillDamagePanelPosition({ x: 123, y: 456 });
    setSkillDamagePanelScale(1.5);
    expect(getSkillDamagePanelPosition()).toEqual({ x: 123, y: 456 });
    expect(getSkillDamagePanelScale()).toBe(1.5);
    setSkillDamagePanelScale(100);
    expect(getSkillDamagePanelScale()).toBe(100);
    setSkillDamagePanelScale(0.01);
    expect(getSkillDamagePanelScale()).toBe(0.01);
    for (const invalid of [0, -1, NaN, Infinity])
      setSkillDamagePanelScale(invalid);
    expect(getSkillDamagePanelScale()).toBe(0.01);
    resetMonsterOverlayPositions();
    resetMonsterOverlaySizes();
    expect(getSkillDamagePanelPosition()).toEqual({ x: 500, y: 300 });
    expect(getSkillDamagePanelScale()).toBe(1);
  });

  it("honors the overlay region switch independently of the feature switch", () => {
    SETTINGS.monsterMonitor.state.skillDamageDisplay = {
      ...defaultSkillDamageDisplay(),
      enabled: true,
    };
    SETTINGS.monsterMonitor.state.overlayVisibility.showSkillDamagePanel = false;
    expect(getMonsterOverlayVisibility().showSkillDamagePanel).toBe(false);
    expect(SETTINGS.monsterMonitor.state.skillDamageDisplay.enabled).toBe(true);
  });

  it("migrates the earlier panel position and fills font and scale defaults", () => {
    const profile = createDefaultMonsterMonitorProfile();
    delete (
      profile.overlayPositions as Partial<typeof profile.overlayPositions>
    ).skillDamagePanel;
    profile.skillDamageDisplay = {
      enabled: true,
      entries: [{ skillId: 25523102, alias: "Explosion" }],
      animation: "pop",
      format: "cn",
      x: 654,
      y: 321,
    };
    const normalized = normalizeMonsterProfileStyles(profile);
    expect(normalized.overlayPositions.skillDamagePanel).toEqual({
      x: 654,
      y: 321,
    });
    expect(normalized.overlaySizes.skillDamagePanelScale).toBe(1);
    expect(normalized.skillDamageDisplay).toMatchObject({
      fontSize: 24,
      fontWeight: 700,
      entries: profile.skillDamageDisplay.entries,
    });
  });

  it("retains the watched ID, custom font, scale and visibility through import", () => {
    const profile = createDefaultMonsterMonitorProfile();
    profile.skillDamageDisplay = {
      ...defaultSkillDamageDisplay(),
      enabled: true,
      entries: [{ skillId: 25523102, alias: "Explosion" }],
      mergeHits: true,
      showSkillName: false,
      animation: "shrink",
      durationMs: 4300,
      fontFamily: "Damage Font",
      fontUrl: "data:font/woff2;base64,custom",
      fontSize: 36,
      fontWeight: 900,
      fontColor: "#123456",
    };
    profile.overlaySizes.skillDamagePanelScale = 1.5;
    profile.overlayVisibility.showSkillDamagePanel = false;
    profile.overlayPositions.skillDamagePanel = { x: 222, y: 333 };
    const exported = {
      kind: "resonance-logs-loadout",
      version: 2,
      name: "Damage",
      skillProfile: omitProfileId(createDefaultSkillMonitorProfile()),
      monsterProfile: omitProfileId(profile),
    };
    const parsed = parseLoadoutExport(JSON.parse(JSON.stringify(exported)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.output.monsterProfile.skillDamageDisplay).toEqual(
      profile.skillDamageDisplay,
    );
    expect(
      parsed.output.monsterProfile.overlaySizes.skillDamagePanelScale,
    ).toBe(1.5);
    expect(
      parsed.output.monsterProfile.overlayVisibility.showSkillDamagePanel,
    ).toBe(false);
    expect(
      parsed.output.monsterProfile.overlayPositions.skillDamagePanel,
    ).toEqual({ x: 222, y: 333 });
  });
});
