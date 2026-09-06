import { beforeEach, describe, expect, it } from "vitest";
import { buildLoadoutPresets } from "./loadout-presets";
import {
  SETTINGS,
  createDefaultMonitoringSettingsState,
  type Loadout,
} from "$lib/settings-store";
import {
  createLoadoutFromPreset,
  importLoadout,
} from "$lib/loadouts.svelte.js";

function resetWithStarterLoadout(): void {
  const state = createDefaultMonitoringSettingsState();
  const skillProfile = state.skillMonitor.profiles[0]!;
  const monsterProfile = state.monsterMonitor.profiles[0]!;
  const liveProfile = state.liveMeter.profiles[0]!;
  const starter: Loadout = {
    id: "loadout_starter",
    name: "Default",
    skillProfileId: skillProfile.id,
    monsterProfileId: monsterProfile.id,
    liveProfileId: liveProfile.id,
    starterPlaceholder: true,
    linkedTalentStageCfgId: null,
  };
  state.loadouts = {
    activeId: starter.id,
    items: [starter],
    firstRunPromptDismissed: false,
    autoSwitchBySpec: true,
  };
  Object.assign(SETTINGS.monitoring.state, state);
}

describe("built-in loadout presets", () => {
  beforeEach(resetWithStarterLoadout);

  it("exposes the eight built-in class presets", () => {
    const presets = buildLoadoutPresets("zh-CN");
    expect(presets.map((preset) => [preset.id, preset.name])).toEqual([
      ["radiant-shield", "光盾"],
      ["recovery", "防盾"],
      ["block", "格挡"],
      ["earthfort", "岩盾"],
      ["smite", "惩击"],
      ["lifebind", "愈合"],
      ["vanguard", "重装"],
      ["concerto", "协奏"],
    ]);
    for (const preset of presets) {
      expect(preset.subtitle).not.toHaveLength(0);
      expect(preset.iconPath).toMatch(/^\/images\/class_specs\/\w+\.png$/);
      expect(preset.palette).toHaveLength(3);
    }

    const radiantShield = presets[0]!;
    expect(radiantShield).toMatchObject({
      subtitle: "神盾骑士 · 光盾专精",
      iconPath: "/images/class_specs/Shield.png",
    });
    expect(radiantShield.data.skillProfile.selectedClass).toBe("wind_knight");
    expect(radiantShield.data.skillProfile.monitoredBuffIds).toContain(2206011);
    expect(radiantShield.data.monsterProfile.monitoredBuffIds).toContain(
      501712,
    );
    expect(radiantShield.data.liveProfile.appearance.themeColors.primary).toBe(
      "oklch(0.75 0.09 150)",
    );
    expect(radiantShield.data.liveProfile.history.general.timelineLaneH).toBe(
      44,
    );
    expect(radiantShield.data.liveProfile.columnLabels.live.players.first).toBe(
      "",
    );

    const smite = presets.find((preset) => preset.id === "smite")!;
    expect(smite.data.skillProfile.selectedClass).toBe("verdant_oracle");

    const lifebind = presets.find((preset) => preset.id === "lifebind")!;
    expect(lifebind).toMatchObject({
      subtitle: "森语者 · 愈合专精",
      iconPath: "/images/class_specs/Lifebind.png",
    });
    expect(lifebind.data.linkedTalentStageCfgId).toBe(111);
    expect(lifebind.data.skillProfile.selectedClass).toBe("verdant_oracle");
    expect(lifebind.data.skillProfile.monitoredBuffIds).toContain(2302421);

    const vanguard = presets.find((preset) => preset.id === "vanguard")!;
    expect(vanguard).toMatchObject({
      subtitle: "青岚骑士 · 重装专精",
      iconPath: "/images/class_specs/Vanguard.png",
    });
    expect(vanguard.data.linkedTalentStageCfgId).toBe(107);
    expect(vanguard.data.skillProfile.selectedClass).toBe("wind_knight");
    expect(vanguard.data.skillProfile.monitoredBuffIds).toContain(2302421);
  });

  it("tracks attribute-resonance coverage on every preset", () => {
    const coverageBuffIds = [2207261, 2207651, 2110034];
    for (const preset of buildLoadoutPresets("zh-CN")) {
      const profile = preset.data.skillProfile;
      expect(
        profile.buffCoverageEntries?.map((entry) => entry.buffId),
        preset.id,
      ).toEqual(coverageBuffIds);
      expect(profile.overlayVisibility.showBuffCoverageGroup).toBe(true);

      const liveById = new Map(
        profile.buffCoverageEntries?.map((entry) => [
          entry.buffId,
          entry.showInLive,
        ]),
      );
      if (preset.id === "concerto") {
        expect(liveById.get(2207261)).toBe(true);
        expect(liveById.get(2207651)).toBe(true);
      } else {
        expect(liveById.get(2207261)).toBe(false);
        expect(liveById.get(2207651)).toBe(false);
      }
      expect(liveById.get(2110034)).toBe(false);
    }
  });

  it("never ships all-white panel styles in any preset", () => {
    for (const preset of buildLoadoutPresets("zh-CN")) {
      for (const group of preset.data.skillProfile.customPanelGroups ?? []) {
        expect(
          group.style?.nameColor?.toLowerCase(),
          `${preset.id}/${group.id} nameColor`,
        ).not.toBe("#ffffff");
        expect(
          group.style?.progressColor?.toLowerCase(),
          `${preset.id}/${group.id} progressColor`,
        ).not.toBe("#ffffff");
      }
    }
  });

  it("uses semantic colors instead of the all-white defaults", () => {
    const profile = buildLoadoutPresets("zh-CN")[0]!.data.skillProfile;
    expect(profile.textBuffPanelStyle).toMatchObject({
      nameColor: "#fde68a",
      valueColor: "#f8fafc",
      progressColor: "#67e8f9",
      textShadowEnabled: true,
    });
    expect(profile.shieldDetailStyle).toMatchObject({
      hpColor: "#4ade80",
      shieldColor: "#60a5fa",
      healShieldColor: "#fde68a",
    });

    const groups = new Map(
      profile.customPanelGroups?.map((group) => [group.name, group.style]),
    );
    expect(groups.get("factor")?.progressColor).toBe("#fbbf24");
    expect(groups.get("fantasy_buff_cd")?.progressColor).toBe("#38bdf8");
    expect(groups.get("fantasy_buff")?.progressColor).toBe("#22c55e");

    const monster = buildLoadoutPresets("zh-CN")[0]!.data.monsterProfile;
    expect(monster.panelStyle.progressColor).toBe("#22d3ee");
    expect(monster.teammatePanelStyle.progressColor).toBe("#4ade80");
    expect(monster.hatePanelStyle.progressColor).toBe("#fb7185");
    expect(monster.fantasyPanelStyle.progressColor).toBe("#a78bfa");
  });

  it("materializes independent skill, monster, and live profiles", () => {
    const preset = buildLoadoutPresets("zh-CN")[0]!;
    const firstId = createLoadoutFromPreset(preset);
    const first = SETTINGS.loadouts.state.items.find(
      (item) => item.id === firstId,
    )!;

    expect(SETTINGS.loadouts.state.items).toHaveLength(1);
    expect(SETTINGS.loadouts.state.activeId).toBe(firstId);
    expect(
      SETTINGS.monitoring.state.liveMeter.profiles.find(
        (profile) => profile.id === first.liveProfileId,
      )?.appearance.themeColors.primary,
    ).toBe("oklch(0.75 0.09 150)");

    const importedId = importLoadout(preset.data);
    expect(SETTINGS.loadouts.state.activeId).toBe(firstId);
    expect(importedId).not.toBe(firstId);

    const secondId = createLoadoutFromPreset(preset);
    const second = SETTINGS.loadouts.state.items.find(
      (item) => item.id === secondId,
    )!;
    expect(second.skillProfileId).not.toBe(first.skillProfileId);
    expect(second.monsterProfileId).not.toBe(first.monsterProfileId);
    expect(second.liveProfileId).not.toBe(first.liveProfileId);

    const firstSkill = SETTINGS.skillMonitor.state.profiles.find(
      (profile) => profile.id === first.skillProfileId,
    )!;
    const secondSkill = SETTINGS.skillMonitor.state.profiles.find(
      (profile) => profile.id === second.skillProfileId,
    )!;
    firstSkill.monitoredBuffIds.push(999999);
    expect(secondSkill.monitoredBuffIds).not.toContain(999999);
  });
});
