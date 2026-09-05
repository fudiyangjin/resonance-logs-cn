import { describe, expect, it } from "vitest";
import {
  SETTINGS,
  MAX_BUFF_COVERAGE_ENTRIES,
  createDefaultMonitoringSettingsState,
  createDefaultSkillMonitorProfile,
  type Loadout,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import { exportLoadout } from "$lib/loadouts.svelte.js";
import { applyActiveLiveProfileToMirror } from "$lib/live-meter-profile.svelte.js";
import { parseLoadoutExport } from "$lib/loadout-import";
import { normalizeSkillProfile } from "$lib/skill-monitor-normalize";

/**
 * Builds a skill-monitor profile shaped like one persisted before the
 * overlay text-style toggles existed: `overlaySizes.panelAttrTextStyle` is
 * missing entirely, and every panel style that does exist is missing its
 * `textShadowEnabled`/`backgroundEnabled`/`backgroundOpacity` trio. This
 * mirrors what was found in a real user's exported loadout.
 */
function legacyShapedSkillProfile(): SkillMonitorProfile {
  const profile = createDefaultSkillMonitorProfile(
    "Legacy",
  ) as unknown as Record<string, unknown>;

  const overlaySizes = profile["overlaySizes"] as Record<string, unknown>;
  delete overlaySizes["panelAttrTextStyle"];

  const legacyStyleFields = {
    gap: 6,
    columnGap: 12,
    fontSize: 14,
    nameColor: "#ffffff",
    valueColor: "#ffffff",
    progressColor: "#ffffff",
    progressOpacity: 0.4,
  };

  // `customPanelStyle` is optional/legacy and this default profile doesn't
  // set it at all — simulate an older profile that already had one.
  profile["customPanelStyle"] = { ...legacyStyleFields };

  const textBuffPanelStyle = profile["textBuffPanelStyle"] as Record<
    string,
    unknown
  >;
  delete textBuffPanelStyle["textShadowEnabled"];
  delete textBuffPanelStyle["backgroundEnabled"];
  delete textBuffPanelStyle["backgroundOpacity"];

  profile["customPanelGroups"] = [
    {
      id: "group",
      name: "Group",
      kind: "manual",
      entries: [],
      position: { x: 0, y: 0 },
      scale: 1,
      style: { ...legacyStyleFields },
    },
  ];

  return profile as unknown as SkillMonitorProfile;
}

function resetWithLegacyLoadout(): { loadoutId: string } {
  const state = createDefaultMonitoringSettingsState();
  const monsterProfile = state.monsterMonitor.profiles[0]!;
  const liveProfile = state.liveMeter.profiles[0]!;
  liveProfile.history.general.timelineCurveH = 360;
  liveProfile.columnLabels.history.players.first = "队伍";
  const skillProfile = legacyShapedSkillProfile();
  skillProfile.id = state.skillMonitor.profiles[0]!.id;
  state.skillMonitor.profiles = [skillProfile];

  const loadout: Loadout = {
    id: "loadout_legacy",
    name: "Legacy",
    skillProfileId: skillProfile.id,
    monsterProfileId: monsterProfile.id,
    liveProfileId: liveProfile.id,
    starterPlaceholder: false,
    linkedTalentStageCfgId: null,
  };
  state.loadouts = {
    activeId: loadout.id,
    items: [loadout],
    firstRunPromptDismissed: true,
    autoSwitchBySpec: true,
  };
  Object.assign(SETTINGS.monitoring.state, state);
  applyActiveLiveProfileToMirror();
  return { loadoutId: loadout.id };
}

describe("exportLoadout normalization", () => {
  it("normalizes a legacy-shaped skill profile so the export always validates", () => {
    const { loadoutId } = resetWithLegacyLoadout();
    const data = exportLoadout(loadoutId);
    expect(data).not.toBeNull();
    if (!data) return;

    const parsed = parseLoadoutExport(data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(
      parsed.output.skillProfile.overlaySizes.panelAttrTextStyle,
    ).toMatchObject({ textShadowEnabled: true, backgroundEnabled: false });
    expect(parsed.output.skillProfile.customPanelStyle).toMatchObject({
      textShadowEnabled: true,
    });
    expect(parsed.output.skillProfile.textBuffPanelStyle).toMatchObject({
      textShadowEnabled: true,
    });
    expect(
      parsed.output.skillProfile.customPanelGroups?.[0]?.style,
    ).toMatchObject({ textShadowEnabled: true });
    expect(parsed.output.liveProfile.history.general.timelineCurveH).toBe(360);
    expect(parsed.output.liveProfile.columnLabels.history.players.first).toBe(
      "队伍",
    );
  });

  it("re-imports byte-for-byte the same as parsing directly", () => {
    const { loadoutId } = resetWithLegacyLoadout();
    const data = exportLoadout(loadoutId);
    expect(data).not.toBeNull();
    if (!data) return;

    // Simulates a full export -> JSON file -> re-import round trip.
    const roundTripped = JSON.parse(JSON.stringify(data));
    const parsed = parseLoadoutExport(roundTripped);
    expect(parsed.success).toBe(true);
  });
});

describe("normalizeSkillProfile", () => {
  it("is idempotent", () => {
    const profile = legacyShapedSkillProfile();
    const once = normalizeSkillProfile(profile);
    const twice = normalizeSkillProfile(once);
    expect(twice).toEqual(once);
  });

  it("never manufactures the optional/legacy customPanelStyle or shieldDetailStyle fields", () => {
    const profile = createDefaultSkillMonitorProfile("Fresh");
    expect(profile.customPanelStyle).toBeUndefined();
    expect(profile.shieldDetailStyle).toBeUndefined();

    const normalized = normalizeSkillProfile(profile);
    expect(normalized.customPanelStyle).toBeUndefined();
    expect(normalized.shieldDetailStyle).toBeUndefined();
    expect("customPanelStyle" in normalized).toBe(false);
    expect("shieldDetailStyle" in normalized).toBe(false);
  });

  it("keeps the first 32 unique positive coverage ids", () => {
    const profile = createDefaultSkillMonitorProfile("Coverage");
    profile.buffCoverageEntries = [
      { id: "invalid", buffId: 0, label: "", showInLive: true },
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `entry_${index}`,
        buffId: index + 1,
        label: "",
        showInLive: true,
      })),
      { id: "duplicate", buffId: 1, label: "", showInLive: true },
    ];
    const normalized = normalizeSkillProfile(profile);
    expect(normalized.buffCoverageEntries).toHaveLength(
      MAX_BUFF_COVERAGE_ENTRIES,
    );
    expect(
      normalized.buffCoverageEntries?.map((entry) => entry.buffId),
    ).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
  });
});
