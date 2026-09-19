import { describe, expect, it } from "vitest";
import {
  SETTINGS,
  createDefaultLiveMeterProfileData,
  createDefaultMonitoringSettingsState,
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  omitProfileId,
  type MonsterMonitorProfileData,
  type MonsterOverlayVisibility,
} from "./settings-store";
import {
  CURRENT_MONITORING_SCHEMA_VERSION,
  migrateLegacyMonitoringState,
  migrateMonitoringStateIncrementally,
  reconcileMonitoringState,
} from "./settings-migrations";
import { parseLoadoutExport } from "./loadout-import";
import { exportLoadout } from "./loadouts.svelte.js";
import { switchMonsterProfile } from "./monster-monitor-profile.svelte.js";
import {
  LEGACY_MONSTER_PANEL_KEYS,
  type LegacyMonsterPanelFlags,
} from "./monster-panel-migration";
import { buildLoadoutPresets } from "./config/loadout-presets";
import { DEFAULT_MONSTER_OVERLAY_VISIBILITY } from "../routes/monster-overlay/monster-constants";

const panels = [
  ["hateListEnabled", "showHatePanel"],
  ["stunListEnabled", "showStunPanel"],
  ["hpListEnabled", "showHpPanel"],
] as const;

function legacyProfile<T extends MonsterMonitorProfileData>(profile: T) {
  return {
    ...profile,
    hateListEnabled: false,
    stunListEnabled: false,
    hpListEnabled: false,
    overlayVisibility: { ...profile.overlayVisibility, showHatePanel: true },
  };
}

function legacyState() {
  const state = createDefaultMonitoringSettingsState();
  state.schemaVersion = 5;
  state.monsterMonitor = legacyProfile(state.monsterMonitor);
  state.monsterMonitor.profiles =
    state.monsterMonitor.profiles.map(legacyProfile);
  return state;
}

function assertNoLegacyFlags(value: object) {
  for (const key of LEGACY_MONSTER_PANEL_KEYS) {
    expect(value).not.toHaveProperty(key);
  }
}

function legacyExport(monsterProfile: MonsterMonitorProfileData) {
  return {
    kind: "resonance-logs-loadout",
    version: 1,
    name: "Legacy",
    skillProfile: omitProfileId(createDefaultSkillMonitorProfile()),
    monsterProfile: { ...monsterProfile, name: "Legacy monster" },
  };
}

describe("single monster panel visibility", () => {
  for (const [flag, visibility] of panels) {
    it.each([
      [false, false, false],
      [false, true, false],
      [true, false, false],
      [true, true, true],
    ])(
      `${visibility}: enabled=%s visible=%s becomes %s`,
      (enabled, shown, expected) => {
        const state = legacyState();
        const mirror = state.monsterMonitor as typeof state.monsterMonitor &
          LegacyMonsterPanelFlags;
        mirror[flag] = enabled;
        mirror.overlayVisibility[visibility] = shown;
        // The slot intentionally still has its old values: the live mirror wins.
        const original = JSON.stringify(state);
        const migrated = migrateMonitoringStateIncrementally(
          state,
          createDefaultLiveMeterProfileData(),
        );
        expect(JSON.stringify(state)).toBe(original);
        expect(migrated.schemaVersion).toBe(CURRENT_MONITORING_SCHEMA_VERSION);
        for (const profile of [
          migrated.monsterMonitor,
          ...migrated.monsterMonitor.profiles,
        ]) {
          expect(profile.overlayVisibility[visibility]).toBe(expected);
          assertNoLegacyFlags(profile);
        }
        expect(
          reconcileMonitoringState(JSON.parse(JSON.stringify(migrated))),
        ).toEqual(migrated);
        expect(
          migrateMonitoringStateIncrementally(
            migrated,
            createDefaultLiveMeterProfileData(),
          ),
        ).toEqual(migrated);

        const parsed = parseLoadoutExport(legacyExport(mirror));
        expect(parsed.success).toBe(true);
        if (!parsed.success) return;
        expect(parsed.output.version).toBe(2);
        expect(parsed.output.monsterProfile.overlayVisibility[visibility]).toBe(
          expected,
        );
        assertNoLegacyFlags(parsed.output.monsterProfile);
        expect(
          parseLoadoutExport(JSON.parse(JSON.stringify(parsed.output))),
        ).toEqual(parsed);
      },
    );
  }

  it("uses old visibility defaults before new defaults and treats missing enable flags as false", () => {
    const state = legacyState();
    Object.assign(state.monsterMonitor, {
      hateListEnabled: true,
      stunListEnabled: true,
      hpListEnabled: true,
    });
    const visibility = state.monsterMonitor
      .overlayVisibility as Partial<MonsterOverlayVisibility>;
    for (const [, key] of panels) delete visibility[key];
    const migrated = migrateMonitoringStateIncrementally(
      state,
      createDefaultLiveMeterProfileData(),
    );
    expect(migrated.monsterMonitor.overlayVisibility).toMatchObject({
      showHatePanel: true,
      showStunPanel: false,
      showHpPanel: false,
    });
    const parsed = parseLoadoutExport(legacyExport(state.monsterMonitor));
    expect(
      parsed.success && parsed.output.monsterProfile.overlayVisibility,
    ).toMatchObject({
      showHatePanel: true,
      showStunPanel: false,
      showHpPanel: false,
    });

    for (const [flag, key] of panels) {
      delete (state.monsterMonitor as LegacyMonsterPanelFlags)[flag];
      state.monsterMonitor.overlayVisibility[key] = true;
    }
    const missing = migrateMonitoringStateIncrementally(
      state,
      createDefaultLiveMeterProfileData(),
    );
    for (const [, key] of panels)
      expect(missing.monsterMonitor.overlayVisibility[key]).toBe(false);
    const imported = parseLoadoutExport(legacyExport(state.monsterMonitor));
    expect(imported.success).toBe(true);
    if (imported.success) {
      for (const [, key] of panels)
        expect(imported.output.monsterProfile.overlayVisibility[key]).toBe(
          false,
        );
    }
  });

  it("migrates inactive profiles and preserves mirror precedence across switching and export", () => {
    const state = legacyState();
    const firstId = state.monsterMonitor.mirroredProfileId;
    Object.assign(state.monsterMonitor, { hateListEnabled: true });
    const second = legacyProfile(createDefaultMonsterMonitorProfile("Second"));
    second.stunListEnabled = true;
    second.overlayVisibility.showStunPanel = true;
    state.monsterMonitor.profiles.push(second);
    state.loadouts.items = [
      {
        id: "second-loadout",
        name: "Second",
        skillProfileId: state.skillMonitor.profiles[0]!.id,
        monsterProfileId: second.id,
        liveProfileId: state.liveMeter.profiles[0]!.id,
        starterPlaceholder: false,
        linkedTalentStageCfgId: null,
      },
    ];
    state.loadouts.activeId = "second-loadout";
    const migrated = migrateMonitoringStateIncrementally(
      state,
      createDefaultLiveMeterProfileData(),
    );
    expect(migrated.monsterMonitor.mirroredProfileId).toBe(second.id);
    expect(migrated.monsterMonitor.overlayVisibility.showStunPanel).toBe(true);
    expect(
      migrated.monsterMonitor.profiles.find((p) => p.id === firstId)!
        .overlayVisibility.showHatePanel,
    ).toBe(true);
    const previous = JSON.parse(JSON.stringify(SETTINGS.monitoring.state));
    try {
      Object.assign(SETTINGS.monitoring.state, migrated);
      switchMonsterProfile(firstId);
      expect(
        SETTINGS.monsterMonitor.state.overlayVisibility.showHatePanel,
      ).toBe(true);
      SETTINGS.monsterMonitor.state.overlayVisibility.showHpPanel = true;
      switchMonsterProfile(second.id);
      switchMonsterProfile(firstId);
      expect(SETTINGS.monsterMonitor.state.overlayVisibility.showHpPanel).toBe(
        true,
      );
      switchMonsterProfile(second.id);
      const exported = exportLoadout("second-loadout");
      expect(exported?.version).toBe(2);
      expect(exported?.monsterProfile.overlayVisibility.showStunPanel).toBe(
        true,
      );
      assertNoLegacyFlags(exported!.monsterProfile);
      expect(
        parseLoadoutExport(JSON.parse(JSON.stringify(exported))).success,
      ).toBe(true);
      for (const profile of [
        SETTINGS.monsterMonitor.state,
        ...SETTINGS.monsterMonitor.state.profiles,
      ])
        assertNoLegacyFlags(profile);
    } finally {
      Object.assign(SETTINGS.monitoring.state, previous);
    }
  });

  it("keeps legacy starter detection while converting the standalone store", () => {
    const state = legacyState();
    const migrate = () =>
      migrateLegacyMonitoringState(state, createDefaultLiveMeterProfileData());
    const pristine = migrate();
    expect(pristine.loadouts.items[0]!.starterPlaceholder).toBe(true);
    expect(pristine.loadouts.firstRunPromptDismissed).toBe(false);
    for (const [, key] of panels)
      expect(pristine.monsterMonitor.overlayVisibility[key]).toBe(false);
    assertNoLegacyFlags(pristine.monsterMonitor);
    // A configured but hidden legacy feature must not become replaceable.
    Object.assign(state.monsterMonitor, { stunListEnabled: true });
    expect(migrate().loadouts.items[0]!.starterPlaceholder).toBe(false);
    state.monsterMonitor.overlayVisibility.showStunPanel = true;
    const configured = migrate();
    expect(configured.monsterMonitor.overlayVisibility.showStunPanel).toBe(
      true,
    );
    expect(
      configured.monsterMonitor.profiles[0]!.overlayVisibility.showStunPanel,
    ).toBe(true);
  });

  it("defaults all three panels to off and ships v2 presets without legacy flags", () => {
    const defaults = createDefaultMonsterMonitorProfile();
    for (const [, key] of panels) {
      expect(defaults.overlayVisibility[key]).toBe(false);
      expect(DEFAULT_MONSTER_OVERLAY_VISIBILITY[key]).toBe(false);
    }
    assertNoLegacyFlags(defaults);
    for (const preset of buildLoadoutPresets("zh-CN")) {
      expect(preset.data.version).toBe(2);
      assertNoLegacyFlags(preset.data.monsterProfile);
      expect(preset.data.monsterProfile.overlayVisibility).toMatchObject({
        showHatePanel: true,
        showStunPanel: false,
        showHpPanel: false,
      });
    }
  });

  it.each(LEGACY_MONSTER_PANEL_KEYS)("rejects invalid legacy %s", (key) => {
    const data = legacyExport(
      legacyProfile(createDefaultMonsterMonitorProfile()),
    );
    Object.assign(data.monsterProfile, { [key]: "false" });
    expect(parseLoadoutExport(data).success).toBe(false);
  });
});
